from pathlib import Path

startup = r'''use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::borrow::Cow;
#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::{RegKey, RegValue, HKEY};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::CoTaskMemFree;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::{
    FOLDERID_CommonStartup, FOLDERID_Startup, KF_FLAG_DEFAULT, SHGetKnownFolderPath,
};

use crate::safety;

const BACKUP_SCHEMA_VERSION: u32 = 1;
const STARTUP_BACKUP_FOLDER: &str = "StartupBackups";
const LEGACY_DISABLED_SUBKEY: &str = "Software\\Purgio\\DisabledStartup";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub os: String,
    pub impact: String,
    pub enabled: bool,
    pub description: String,
    pub is_safe_to_disable: bool,
    pub command: Option<String>,
    pub requires_elevation: bool,
    pub can_restore: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum RegistryLocation {
    HkcuRun,
    HkcuRunOnce,
    HklmRun,
    HklmRunOnce,
    HklmWowRun,
    HklmWowRunOnce,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum StartupFolderScope {
    User,
    Common,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum StartupBackupPayload {
    Registry {
        location: RegistryLocation,
        value_name: String,
        value_type: u32,
        bytes: Vec<u8>,
    },
    File {
        scope: StartupFolderScope,
        file_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StartupBackupRecord {
    schema_version: u32,
    id: String,
    name: String,
    command: Option<String>,
    payload: StartupBackupPayload,
}

#[cfg(target_os = "windows")]
struct ResolvedStartupItem {
    item: StartupItem,
    target: StartupTarget,
}

#[cfg(target_os = "windows")]
enum StartupTarget {
    Registry {
        location: RegistryLocation,
        value_name: String,
        raw: RegValue<'static>,
    },
    File {
        scope: StartupFolderScope,
        path: PathBuf,
    },
}

#[cfg(target_os = "windows")]
impl RegistryLocation {
    fn hive(self) -> HKEY {
        match self {
            Self::HkcuRun | Self::HkcuRunOnce => HKEY_CURRENT_USER,
            Self::HklmRun | Self::HklmRunOnce | Self::HklmWowRun | Self::HklmWowRunOnce => {
                HKEY_LOCAL_MACHINE
            }
        }
    }

    fn subkey(self) -> &'static str {
        match self {
            Self::HkcuRun | Self::HklmRun => "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            Self::HkcuRunOnce | Self::HklmRunOnce => {
                "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            }
            Self::HklmWowRun => {
                "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"
            }
            Self::HklmWowRunOnce => {
                "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
            }
        }
    }

    fn identity(self) -> &'static str {
        match self {
            Self::HkcuRun => "hkcu-run",
            Self::HkcuRunOnce => "hkcu-runonce",
            Self::HklmRun => "hklm-run",
            Self::HklmRunOnce => "hklm-runonce",
            Self::HklmWowRun => "hklm-wow-run",
            Self::HklmWowRunOnce => "hklm-wow-runonce",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::HkcuRun => "Registro — Usuario Run",
            Self::HkcuRunOnce => "Registro — Usuario RunOnce",
            Self::HklmRun => "Registro — Sistema Run",
            Self::HklmRunOnce => "Registro — Sistema RunOnce",
            Self::HklmWowRun => "Registro — Sistema 32-bit Run",
            Self::HklmWowRunOnce => "Registro — Sistema 32-bit RunOnce",
        }
    }

    fn requires_elevation(self) -> bool {
        matches!(
            self,
            Self::HklmRun | Self::HklmRunOnce | Self::HklmWowRun | Self::HklmWowRunOnce
        )
    }
}

impl StartupFolderScope {
    fn identity(self) -> &'static str {
        match self {
            Self::User => "user-startup-folder",
            Self::Common => "common-startup-folder",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::User => "Carpeta Startup — Usuario",
            Self::Common => "Carpeta Startup — Todos los usuarios",
        }
    }

    fn requires_elevation(self) -> bool {
        matches!(self, Self::Common)
    }
}

fn fnv64(seed: u64, value: &str) -> u64 {
    value.as_bytes().iter().fold(seed, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(1_099_511_628_211)
    })
}

fn startup_id(source: &str, name: &str) -> String {
    let identity = format!("{}\0{}", source, name.to_lowercase());
    let first = fnv64(14_695_981_039_346_656_037, &identity);
    let second = fnv64(10_995_116_282_110_000_111, &format!("purgio-startup-v2\0{identity}"));
    format!("startup-{first:016x}{second:016x}")
}

fn valid_startup_id(id: &str) -> bool {
    id.len() == 40
        && id.starts_with("startup-")
        && id[8..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Metadatos conservadores. Las aplicaciones no reconocidas nunca se clasifican
/// automáticamente como seguras de desactivar.
fn get_app_metadata(name: &str) -> (String, String, bool) {
    let name_lower = name.to_lowercase();
    let apps = [
        ("spotify", "Medium", "Proceso auxiliar de Spotify.", true),
        ("discord", "Medium", "Cliente de Discord.", true),
        ("steam", "High", "Cliente de Steam.", true),
        ("epicgames", "Medium", "Epic Games Launcher.", true),
        ("adobe", "High", "Servicios de Adobe Creative Cloud.", true),
        ("onedrive", "High", "Sincronización de Microsoft OneDrive.", true),
        ("dropbox", "High", "Sincronización de Dropbox.", true),
        ("googledrive", "High", "Google Drive Sync.", true),
        ("skype", "Low", "Skype.", true),
        ("teams", "Medium", "Microsoft Teams.", true),
        ("webex", "Medium", "Cisco Webex.", true),
        ("zoom", "Low", "Zoom Meetings.", true),
        ("slack", "Medium", "Slack.", true),
        ("anydesk", "Medium", "AnyDesk remote control.", true),
        ("teamviewer", "Medium", "TeamViewer.", true),
        ("vanguard", "High", "Riot Vanguard Anti-Cheat.", false),
        ("faceit", "High", "Faceit Anti-Cheat.", false),
        ("razer", "Medium", "Razer Synapse.", false),
        ("corsair", "Medium", "Corsair iCUE.", false),
        ("logitech", "Medium", "Logitech G Hub.", false),
        ("nvidia", "Medium", "NVIDIA GeForce Experience.", false),
        ("amd", "Medium", "AMD Radeon Software.", false),
        ("realtek", "Low", "Realtek Audio.", false),
        ("obs", "Low", "OBS Studio.", true),
        ("ccleaner", "Low", "CCleaner.", true),
        ("everything", "Low", "Everything Search.", true),
        ("7zip", "Low", "7-Zip.", true),
        ("winrar", "Low", "WinRAR.", true),
        ("telegram", "Low", "Telegram.", true),
        ("whatsapp", "Low", "WhatsApp Desktop.", true),
        ("figma", "Low", "Figma.", true),
        ("notion", "Low", "Notion.", true),
        ("cursor", "Low", "Cursor IDE.", true),
        ("code", "Low", "Visual Studio Code.", true),
        ("git", "Low", "Git.", true),
        ("python", "Low", "Python.", true),
        ("node", "Low", "Node.js.", true),
        ("java", "High", "Java Update Checker.", true),
        ("edge", "Low", "Microsoft Edge Auto-launch.", true),
        ("chrome", "Low", "Google Chrome Auto-launch.", true),
    ];

    for (key, impact, description, safe) in apps {
        if name_lower.contains(key) {
            return (impact.to_string(), description.to_string(), safe);
        }
    }

    (
        "Unknown".to_string(),
        "Aplicación no reconocida. Purgio no asume que sea seguro desactivarla.".to_string(),
        false,
    )
}

fn backup_root() -> Result<PathBuf, String> {
    let appdata = env::var_os("APPDATA").ok_or_else(|| "APPDATA no está disponible.".to_string())?;
    let root = PathBuf::from(appdata).join("Purgio").join(STARTUP_BACKUP_FOLDER);
    fs::create_dir_all(&root).map_err(|error| format!("No se pudo crear el directorio de respaldo: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        let metadata = fs::symlink_metadata(&root)
            .map_err(|error| format!("No se pudo validar el directorio de respaldo: {error}"))?;
        if !metadata.is_dir()
            || metadata.file_type().is_symlink()
            || safety::metadata_is_reparse_point(&metadata)
            || safety::has_windows_reparse_ancestor(&root)
        {
            return Err("El directorio de respaldo de Startup no es una ubicación segura.".to_string());
        }
    }

    Ok(root)
}

fn backup_record_path(id: &str) -> Result<PathBuf, String> {
    if !valid_startup_id(id) {
        return Err("ID de Startup inválido.".to_string());
    }
    Ok(backup_root()?.join(format!("{id}.json")))
}

fn backup_payload_path(id: &str) -> Result<PathBuf, String> {
    if !valid_startup_id(id) {
        return Err("ID de Startup inválido.".to_string());
    }
    Ok(backup_root()?.join(format!("{id}.payload")))
}

fn write_backup_record(record: &StartupBackupRecord) -> Result<(), String> {
    let destination = backup_record_path(&record.id)?;
    if destination.exists() {
        return Err("Ya existe un respaldo para esta entrada de Startup.".to_string());
    }

    let temp = destination.with_extension(format!("{}.tmp", std::process::id()));
    let payload = serde_json::to_vec_pretty(record)
        .map_err(|error| format!("No se pudo serializar el respaldo: {error}"))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|error| format!("No se pudo crear el respaldo temporal: {error}"))?;
    file.write_all(&payload)
        .map_err(|error| format!("No se pudo escribir el respaldo: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("No se pudo sincronizar el respaldo: {error}"))?;
    drop(file);

    fs::rename(&temp, &destination).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("No se pudo confirmar el respaldo: {error}")
    })
}

fn load_backup_record(id: &str) -> Result<StartupBackupRecord, String> {
    let path = backup_record_path(id)?;
    let data = fs::read(&path).map_err(|error| format!("No se pudo leer el respaldo: {error}"))?;
    let record: StartupBackupRecord = serde_json::from_slice(&data)
        .map_err(|error| format!("El respaldo de Startup está dañado: {error}"))?;
    if record.schema_version != BACKUP_SCHEMA_VERSION || record.id != id {
        return Err("El respaldo de Startup no coincide con el ID solicitado.".to_string());
    }
    Ok(record)
}

fn remove_backup_record(id: &str) {
    if let Ok(path) = backup_record_path(id) {
        let _ = fs::remove_file(path);
    }
}

fn file_fingerprint(path: &Path) -> Result<(u64, u64), String> {
    let mut file = File::open(path).map_err(|error| format!("No se pudo leer el archivo de Startup: {error}"))?;
    let mut hash = 14_695_981_039_346_656_037u64;
    let mut total = 0u64;
    let mut buffer = [0u8; 16 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("No se pudo verificar el archivo de Startup: {error}"))?;
        if read == 0 {
            break;
        }
        total += read as u64;
        for byte in &buffer[..read] {
            hash = (hash ^ u64::from(*byte)).wrapping_mul(1_099_511_628_211);
        }
    }
    Ok((total, hash))
}

#[cfg(target_os = "windows")]
fn registry_root(location: RegistryLocation) -> RegKey {
    RegKey::predef(location.hive())
}

#[cfg(target_os = "windows")]
fn registry_source_defs() -> [RegistryLocation; 6] {
    [
        RegistryLocation::HkcuRun,
        RegistryLocation::HkcuRunOnce,
        RegistryLocation::HklmRun,
        RegistryLocation::HklmRunOnce,
        RegistryLocation::HklmWowRun,
        RegistryLocation::HklmWowRunOnce,
    ]
}

#[cfg(target_os = "windows")]
fn known_folder_path(scope: StartupFolderScope) -> Result<PathBuf, String> {
    let folder_id = match scope {
        StartupFolderScope::User => &FOLDERID_Startup,
        StartupFolderScope::Common => &FOLDERID_CommonStartup,
    };

    let raw = unsafe { SHGetKnownFolderPath(folder_id, KF_FLAG_DEFAULT, None) }
        .map_err(|error| format!("No se pudo resolver la carpeta Startup: {error}"))?;
    let text = unsafe { raw.to_string() }
        .map_err(|error| format!("La ruta Startup no es válida: {error}"));
    unsafe { CoTaskMemFree(Some(raw.0.cast())) };
    Ok(PathBuf::from(text?))
}

#[cfg(target_os = "windows")]
fn validate_startup_file(path: &Path, scope: StartupFolderScope) -> Result<PathBuf, String> {
    let root = known_folder_path(scope)?;
    let root_canonical = fs::canonicalize(&root)
        .map_err(|error| format!("No se pudo validar la carpeta Startup: {error}"))?;
    let parent = path.parent().ok_or_else(|| "Ruta Startup inválida.".to_string())?;
    let parent_canonical = fs::canonicalize(parent)
        .map_err(|error| format!("No se pudo validar el origen Startup: {error}"))?;
    if root_canonical != parent_canonical {
        return Err("La entrada no pertenece directamente a una carpeta Startup autorizada.".to_string());
    }

    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("No se pudo validar la entrada Startup: {error}"))?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || safety::metadata_is_reparse_point(&metadata)
        || safety::has_windows_reparse_ancestor(path)
    {
        return Err("La entrada Startup atraviesa un enlace o reparse point no permitido.".to_string());
    }
    Ok(path.to_path_buf())
}

#[cfg(target_os = "windows")]
fn read_registry_enabled(items: &mut Vec<ResolvedStartupItem>, location: RegistryLocation) {
    let root = registry_root(location);
    let Ok(key) = root.open_subkey_with_flags(location.subkey(), KEY_READ) else {
        return;
    };

    for (name, raw) in key.enum_values().flatten() {
        let (impact, description, safe) = get_app_metadata(&name);
        let id = startup_id(location.identity(), &name);
        items.push(ResolvedStartupItem {
            item: StartupItem {
                id,
                name: name.clone(),
                publisher: location.label().to_string(),
                os: "Windows".to_string(),
                impact,
                enabled: true,
                description,
                is_safe_to_disable: safe,
                command: Some(raw.to_string()),
                requires_elevation: location.requires_elevation(),
                can_restore: false,
            },
            target: StartupTarget::Registry {
                location,
                value_name: name,
                raw,
            },
        });
    }
}

#[cfg(target_os = "windows")]
fn read_folder_enabled(items: &mut Vec<ResolvedStartupItem>, scope: StartupFolderScope) {
    let Ok(root) = known_folder_path(scope) else {
        return;
    };
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if validate_startup_file(&path, scope).is_err() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let name = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| file_name.clone());
        let (impact, description, safe) = get_app_metadata(&name);
        items.push(ResolvedStartupItem {
            item: StartupItem {
                id: startup_id(scope.identity(), &file_name),
                name,
                publisher: scope.label().to_string(),
                os: "Windows".to_string(),
                impact,
                enabled: true,
                description,
                is_safe_to_disable: safe,
                command: Some(path.to_string_lossy().to_string()),
                requires_elevation: scope.requires_elevation(),
                can_restore: false,
            },
            target: StartupTarget::File { scope, path },
        });
    }
}

#[cfg(target_os = "windows")]
fn scan_enabled_startup_items() -> Vec<ResolvedStartupItem> {
    let mut items = Vec::new();
    for location in registry_source_defs() {
        read_registry_enabled(&mut items, location);
    }
    read_folder_enabled(&mut items, StartupFolderScope::User);
    read_folder_enabled(&mut items, StartupFolderScope::Common);
    items
}

#[cfg(target_os = "windows")]
fn backup_target_exists(record: &StartupBackupRecord) -> bool {
    match &record.payload {
        StartupBackupPayload::Registry {
            location,
            value_name,
            ..
        } => registry_root(*location)
            .open_subkey_with_flags(location.subkey(), KEY_READ)
            .and_then(|key| key.get_raw_value(value_name))
            .is_ok(),
        StartupBackupPayload::File { scope, file_name } => known_folder_path(*scope)
            .map(|root| root.join(file_name).exists())
            .unwrap_or(false),
    }
}

#[cfg(target_os = "windows")]
fn disabled_item_from_record(record: StartupBackupRecord) -> Option<StartupItem> {
    if !valid_startup_id(&record.id) || backup_target_exists(&record) {
        return None;
    }

    let (publisher, requires_elevation) = match &record.payload {
        StartupBackupPayload::Registry { location, .. } => {
            (format!("Respaldo Purgio — {}", location.label()), location.requires_elevation())
        }
        StartupBackupPayload::File { scope, file_name } => {
            if Path::new(file_name).components().count() != 1 {
                return None;
            }
            (format!("Respaldo Purgio — {}", scope.label()), scope.requires_elevation())
        }
    };

    let (impact, description, safe) = get_app_metadata(&record.name);
    Some(StartupItem {
        id: record.id,
        name: record.name,
        publisher,
        os: "Windows".to_string(),
        impact,
        enabled: false,
        description,
        is_safe_to_disable: safe,
        command: record.command,
        requires_elevation,
        can_restore: true,
    })
}

#[cfg(target_os = "windows")]
fn read_disabled_backups(items: &mut Vec<StartupItem>) {
    let Ok(root) = backup_root() else {
        return;
    };
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(data) = fs::read(&path) else {
            continue;
        };
        let Ok(record) = serde_json::from_slice::<StartupBackupRecord>(&data) else {
            continue;
        };
        if record.schema_version != BACKUP_SCHEMA_VERSION
            || path.file_stem().and_then(|value| value.to_str()) != Some(record.id.as_str())
        {
            continue;
        }
        if let Some(item) = disabled_item_from_record(record) {
            items.push(item);
        }
    }
}

#[cfg(target_os = "windows")]
fn read_legacy_disabled(items: &mut Vec<StartupItem>) {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = root.open_subkey_with_flags(LEGACY_DISABLED_SUBKEY, KEY_READ) else {
        return;
    };

    for (name, raw) in key.enum_values().flatten() {
        let (impact, _, _) = get_app_metadata(&name);
        items.push(StartupItem {
            id: startup_id("legacy-disabled", &name),
            name,
            publisher: "Respaldo legacy de Purgio".to_string(),
            os: "Windows".to_string(),
            impact,
            enabled: false,
            description: "Este respaldo fue creado por una versión anterior de Purgio y no conserva la ubicación original. Por seguridad no puede restaurarse automáticamente.".to_string(),
            is_safe_to_disable: false,
            command: Some(raw.to_string()),
            requires_elevation: false,
            can_restore: false,
        });
    }
}

pub fn get_startup_items() -> Vec<StartupItem> {
    #[cfg(target_os = "windows")]
    {
        let mut items: Vec<StartupItem> = scan_enabled_startup_items()
            .into_iter()
            .map(|resolved| resolved.item)
            .collect();
        read_disabled_backups(&mut items);
        read_legacy_disabled(&mut items);
        items.sort_by(|left, right| {
            right
                .enabled
                .cmp(&left.enabled)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
                .then_with(|| left.id.cmp(&right.id))
        });
        return items;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn resolve_enabled_item(id: &str) -> Result<ResolvedStartupItem, String> {
    if !valid_startup_id(id) {
        return Err("ID de Startup inválido.".to_string());
    }
    let mut matches = scan_enabled_startup_items()
        .into_iter()
        .filter(|item| item.item.id == id);
    let item = matches
        .next()
        .ok_or_else(|| "STARTUP_CHANGED: La entrada ya no existe o cambió desde el análisis.".to_string())?;
    if matches.next().is_some() {
        return Err("Colisión de identidad de Startup detectada; operación bloqueada.".to_string());
    }
    Ok(item)
}

#[cfg(target_os = "windows")]
fn io_error(prefix: &str, error: std::io::Error, requires_elevation: bool) -> String {
    if requires_elevation
        && (error.kind() == std::io::ErrorKind::PermissionDenied
            || matches!(error.raw_os_error(), Some(5) | Some(740)))
    {
        format!("ELEVATION_REQUIRED: {prefix}: {error}")
    } else {
        format!("{prefix}: {error}")
    }
}

#[cfg(target_os = "windows")]
fn disable_registry(
    item: StartupItem,
    location: RegistryLocation,
    value_name: String,
    raw: RegValue<'static>,
) -> Result<(), String> {
    let record = StartupBackupRecord {
        schema_version: BACKUP_SCHEMA_VERSION,
        id: item.id.clone(),
        name: item.name,
        command: item.command,
        payload: StartupBackupPayload::Registry {
            location,
            value_name: value_name.clone(),
            value_type: raw.vtype.clone() as u32,
            bytes: raw.bytes.as_ref().to_vec(),
        },
    };
    write_backup_record(&record)?;

    let root = registry_root(location);
    let key = root
        .open_subkey_with_flags(location.subkey(), KEY_READ | KEY_WRITE)
        .map_err(|error| {
            remove_backup_record(&record.id);
            io_error("No se pudo abrir el origen de Startup", error, location.requires_elevation())
        })?;
    let current = key.get_raw_value(&value_name).map_err(|error| {
        remove_backup_record(&record.id);
        format!("STARTUP_CHANGED: No se pudo volver a leer la entrada antes de desactivarla: {error}")
    })?;
    if current.vtype != raw.vtype || current.bytes.as_ref() != raw.bytes.as_ref() {
        remove_backup_record(&record.id);
        return Err("STARTUP_CHANGED: La entrada cambió desde el análisis. Vuelve a analizar antes de modificarla.".to_string());
    }

    key.delete_value(&value_name).map_err(|error| {
        remove_backup_record(&record.id);
        io_error("No se pudo desactivar la entrada de Startup", error, location.requires_elevation())
    })?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn disable_file(item: StartupItem, scope: StartupFolderScope, path: PathBuf) -> Result<(), String> {
    let path = validate_startup_file(&path, scope)?;
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| "Nombre de archivo Startup inválido.".to_string())?;
    let payload = backup_payload_path(&item.id)?;
    if payload.exists() {
        return Err("Ya existe un payload de respaldo para esta entrada de Startup.".to_string());
    }

    let before = file_fingerprint(&path)?;
    fs::copy(&path, &payload).map_err(|error| {
        io_error("No se pudo respaldar la entrada Startup", error, scope.requires_elevation())
    })?;
    File::open(&payload)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("No se pudo sincronizar el archivo de respaldo: {error}"))?;
    if file_fingerprint(&payload)? != before {
        let _ = fs::remove_file(&payload);
        return Err("El respaldo de la entrada Startup no coincide con el archivo original.".to_string());
    }

    let record = StartupBackupRecord {
        schema_version: BACKUP_SCHEMA_VERSION,
        id: item.id.clone(),
        name: item.name,
        command: item.command,
        payload: StartupBackupPayload::File { scope, file_name },
    };
    if let Err(error) = write_backup_record(&record) {
        let _ = fs::remove_file(&payload);
        return Err(error);
    }

    if file_fingerprint(&path)? != before {
        remove_backup_record(&record.id);
        let _ = fs::remove_file(&payload);
        return Err("STARTUP_CHANGED: El archivo cambió mientras se preparaba el respaldo. No se modificó el origen.".to_string());
    }

    fs::remove_file(&path).map_err(|error| {
        remove_backup_record(&record.id);
        let _ = fs::remove_file(&payload);
        io_error("No se pudo retirar la entrada de la carpeta Startup", error, scope.requires_elevation())
    })?;
    Ok(())
}

pub fn disable_startup_item(id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let resolved = resolve_enabled_item(id)?;
        return match resolved.target {
            StartupTarget::Registry {
                location,
                value_name,
                raw,
            } => disable_registry(resolved.item, location, value_name, raw),
            StartupTarget::File { scope, path } => disable_file(resolved.item, scope, path),
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = id;
        Err("WINDOWS_ONLY: La gestión de Startup solo está disponible en Windows.".to_string())
    }
}

#[cfg(target_os = "windows")]
fn reg_type_from_u32(value: u32) -> Option<RegType> {
    match value {
        0 => Some(REG_NONE),
        1 => Some(REG_SZ),
        2 => Some(REG_EXPAND_SZ),
        3 => Some(REG_BINARY),
        4 => Some(REG_DWORD),
        5 => Some(REG_DWORD_BIG_ENDIAN),
        6 => Some(REG_LINK),
        7 => Some(REG_MULTI_SZ),
        8 => Some(REG_RESOURCE_LIST),
        9 => Some(REG_FULL_RESOURCE_DESCRIPTOR),
        10 => Some(REG_RESOURCE_REQUIREMENTS_LIST),
        11 => Some(REG_QWORD),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn restore_registry(
    id: &str,
    location: RegistryLocation,
    value_name: &str,
    value_type: u32,
    bytes: &[u8],
) -> Result<(), String> {
    let root = registry_root(location);
    let (key, _) = root
        .create_subkey_with_flags(location.subkey(), KEY_READ | KEY_WRITE)
        .map_err(|error| io_error("No se pudo abrir el origen de Startup", error, location.requires_elevation()))?;
    if key.get_raw_value(value_name).is_ok() {
        return Err("STARTUP_TARGET_EXISTS: Ya existe una entrada con el mismo nombre en el origen original.".to_string());
    }
    let vtype = reg_type_from_u32(value_type)
        .ok_or_else(|| "El respaldo contiene un tipo de Registro no soportado.".to_string())?;
    let raw = RegValue {
        vtype,
        bytes: Cow::Owned(bytes.to_vec()),
    };
    key.set_raw_value(value_name, &raw)
        .map_err(|error| io_error("No se pudo restaurar la entrada de Startup", error, location.requires_elevation()))?;
    remove_backup_record(id);
    Ok(())
}

#[cfg(target_os = "windows")]
fn restore_file(id: &str, scope: StartupFolderScope, file_name: &str) -> Result<(), String> {
    if Path::new(file_name).components().count() != 1 {
        return Err("El respaldo contiene un nombre de archivo Startup inválido.".to_string());
    }
    let root = known_folder_path(scope)?;
    let root_metadata = fs::symlink_metadata(&root)
        .map_err(|error| format!("No se pudo validar la carpeta Startup: {error}"))?;
    if !root_metadata.is_dir()
        || root_metadata.file_type().is_symlink()
        || safety::metadata_is_reparse_point(&root_metadata)
        || safety::has_windows_reparse_ancestor(&root)
    {
        return Err("La carpeta Startup original ya no es una ubicación segura.".to_string());
    }

    let destination = root.join(file_name);
    if destination.exists() {
        return Err("STARTUP_TARGET_EXISTS: Ya existe un archivo con el mismo nombre en Startup.".to_string());
    }
    let payload = backup_payload_path(id)?;
    let payload_metadata = fs::symlink_metadata(&payload)
        .map_err(|error| format!("No se pudo validar el payload de respaldo: {error}"))?;
    if !payload_metadata.is_file()
        || payload_metadata.file_type().is_symlink()
        || safety::metadata_is_reparse_point(&payload_metadata)
        || safety::has_windows_reparse_ancestor(&payload)
    {
        return Err("El payload de respaldo no es un archivo seguro.".to_string());
    }

    fs::copy(&payload, &destination).map_err(|error| {
        io_error("No se pudo restaurar el archivo Startup", error, scope.requires_elevation())
    })?;
    File::open(&destination)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("La entrada se copió pero no pudo sincronizarse: {error}"))?;
    if file_fingerprint(&payload)? != file_fingerprint(&destination)? {
        let _ = fs::remove_file(&destination);
        return Err("La restauración no coincide con el respaldo original.".to_string());
    }

    let _ = fs::remove_file(&payload);
    remove_backup_record(id);
    Ok(())
}

pub fn enable_startup_item(id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if !valid_startup_id(id) {
            return Err("ID de Startup inválido.".to_string());
        }
        let record = load_backup_record(id)?;
        return match record.payload {
            StartupBackupPayload::Registry {
                location,
                value_name,
                value_type,
                bytes,
            } => restore_registry(id, location, &value_name, value_type, &bytes),
            StartupBackupPayload::File { scope, file_name } => restore_file(id, scope, &file_name),
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = id;
        Err("WINDOWS_ONLY: La gestión de Startup solo está disponible en Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_apps_are_not_safe_by_default() {
        let (impact, _, safe) = get_app_metadata("Totally Unknown Startup Tool");
        assert_eq!(impact, "Unknown");
        assert!(!safe);
    }

    #[test]
    fn stable_startup_ids_include_source_identity() {
        let user = startup_id("hkcu-run", "Example");
        let machine = startup_id("hklm-run", "Example");
        assert_ne!(user, machine);
        assert!(valid_startup_id(&user));
        assert_eq!(user, startup_id("hkcu-run", "example"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn registry_locations_preserve_hive_and_runonce_origin() {
        assert_eq!(RegistryLocation::HkcuRunOnce.hive(), HKEY_CURRENT_USER);
        assert_eq!(RegistryLocation::HklmRunOnce.hive(), HKEY_LOCAL_MACHINE);
        assert!(RegistryLocation::HkcuRunOnce.subkey().ends_with("RunOnce"));
        assert!(RegistryLocation::HklmWowRunOnce.subkey().ends_with("RunOnce"));
        assert!(RegistryLocation::HklmRun.requires_elevation());
        assert!(!RegistryLocation::HkcuRun.requires_elevation());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn registry_type_roundtrip_supports_windows_value_types() {
        assert_eq!(reg_type_from_u32(REG_SZ.clone() as u32), Some(REG_SZ));
        assert_eq!(
            reg_type_from_u32(REG_EXPAND_SZ.clone() as u32),
            Some(REG_EXPAND_SZ)
        );
        assert_eq!(reg_type_from_u32(999), None);
    }

    #[test]
    fn rejects_path_like_startup_ids() {
        assert!(!valid_startup_id("..\\startup-001122"));
        assert!(!valid_startup_id("startup-not-hex-not-hex-not-hex!!!!"));
    }
}
'''

Path('src-tauri/src/startup.rs').write_text(startup)


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Missing marker {label} in {path}')
    p.write_text(text.replace(old, new, 1))

# Cargo Windows API dependency
cargo = Path('src-tauri/Cargo.toml')
text = cargo.read_text()
old = '[target.\'cfg(windows)\'.dependencies]\nwinreg = "0.52"\n'
new = '[target.\'cfg(windows)\'.dependencies]\nwinreg = "0.52"\nwindows = { version = "0.62.2", features = ["Win32_Foundation", "Win32_System_Com", "Win32_UI_Shell"] }\n'
if old not in text:
    raise SystemExit('Missing Windows dependency block')
cargo.write_text(text.replace(old, new, 1))

# Tauri commands: ID only
replace_once(
    'src-tauri/src/lib.rs',
    '''#[tauri::command]\nfn disable_startup(id: String, location_key: String) -> Result<(), String> {\n    startup::disable_startup_item(&id, &location_key)\n}\n\n#[tauri::command]\nfn enable_startup(\n    name: String,\n    location_key: String,\n    original_command: String,\n) -> Result<(), String> {\n    startup::enable_startup_item(&name, &location_key, &original_command)\n}\n''',
    '''#[tauri::command]\nfn disable_startup(id: String) -> Result<(), String> {\n    startup::disable_startup_item(&id)\n}\n\n#[tauri::command]\nfn enable_startup(id: String) -> Result<(), String> {\n    startup::enable_startup_item(&id)\n}\n''',
    'startup command signatures',
)

# Frontend contract and actions
startup_tsx = Path('src/pages/Startup.tsx')
text = startup_tsx.read_text()
text = text.replace('  location_key?: string;\n  command?: string;\n', '  command?: string;\n  requires_elevation: boolean;\n  can_restore: boolean;\n')
text = text.replace("    if (filter === 'safe') result = result.filter(i => i.is_safe_to_disable);", "    if (filter === 'safe') result = result.filter(i => i.enabled && i.is_safe_to_disable);")
text = text.replace('  const safeCount = items.filter(i => i.is_safe_to_disable).length;', '  const safeCount = items.filter(i => i.enabled && i.is_safe_to_disable).length;')
old = """                        <button className=\"btn btn-primary\" onClick={() => handleEnable(item)} disabled={isActioning || !item.command} title={!item.command ? t('Falta el comando original para reactivar') : ''} style={{ padding: '4px 10px', fontSize: '11px', minWidth: '80px' }}>\n                          {t('Activar')}\n                        </button>\n"""
new = """                        <button className=\"btn btn-primary\" onClick={() => handleEnable(item)} disabled={isActioning || !item.can_restore} title={!item.can_restore ? t('Este respaldo no conserva un origen verificable y no puede restaurarse automáticamente.') : ''} style={{ padding: '4px 10px', fontSize: '11px', minWidth: '80px' }}>\n                          {t('Activar')}\n                        </button>\n"""
if old not in text:
    raise SystemExit('Missing enable button marker')
text = text.replace(old, new, 1)
anchor = """                        <div className=\"details-text-group\">\n                          <span className=\"details-label\" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-aqua)', display: 'block', marginBottom: '2px' }}>{t('Recomendación:')}</span>\n"""
addition = """                        {item.requires_elevation && (\n                          <div className=\"details-text-group\">\n                            <span className=\"details-label\" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--warning)', display: 'block', marginBottom: '2px' }}>{t('Permisos:')}</span>\n                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0' }}>{t('Este origen puede requerir abrir Purgio como administrador para modificarlo.')}</p>\n                          </div>\n                        )}\n                        {!item.enabled && !item.can_restore && (\n                          <div className=\"details-text-group\">\n                            <span className=\"details-label\" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--warning)', display: 'block', marginBottom: '2px' }}>{t('Rollback:')}</span>\n                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0' }}>{t('Este respaldo no conserva un origen verificable y no puede restaurarse automáticamente.')}</p>\n                          </div>\n                        )}\n""" + anchor
if anchor not in text:
    raise SystemExit('Missing details marker')
text = text.replace(anchor, addition, 1)
startup_tsx.write_text(text)

app = Path('src/App.tsx')
text = app.read_text()
text = text.replace('    if (confirmDisable) {', '    if (confirmDisable || !item.is_safe_to_disable) {', 1)
text = text.replace("      await invoke('disable_startup', { id: item.id, locationKey: item.location_key });", "      await invoke('disable_startup', { id: item.id });")
old = """    } catch (e) {\n      console.error('Error al desactivar el programa de arranque:', e);\n      addToast(`${t('No se pudo desactivar')} \"${item.name}\".`, 'error');\n"""
new = """    } catch (e) {\n      const message = String(e);\n      console.error('Error al desactivar el programa de arranque:', e);\n      if (message.includes('ELEVATION_REQUIRED')) {\n        addToast(t('Este origen requiere permisos de administrador. Reabre Purgio como administrador y vuelve a intentarlo.'), 'warning', 7000);\n      } else if (message.includes('STARTUP_CHANGED')) {\n        addToast(t('La entrada de arranque cambió desde el último análisis. Purgio no modificó nada; vuelve a analizar antes de continuar.'), 'warning', 7000);\n      } else {\n        addToast(`${t('No se pudo desactivar')} \"${item.name}\".`, 'error');\n      }\n"""
if old not in text:
    raise SystemExit('Missing disable catch marker')
text = text.replace(old, new, 1)
old = """      await invoke('enable_startup', {\n        name: item.name,\n        locationKey: item.location_key,\n        originalCommand: item.command || ''\n      });\n"""
new = """      await invoke('enable_startup', { id: item.id });\n"""
if old not in text:
    raise SystemExit('Missing enable invoke marker')
text = text.replace(old, new, 1)
old = """    } catch (e) {\n      console.error('Error al activar el programa de arranque:', e);\n      addToast(`${t('No se pudo activar')} \"${item.name}\".`, 'error');\n"""
new = """    } catch (e) {\n      const message = String(e);\n      console.error('Error al activar el programa de arranque:', e);\n      if (message.includes('ELEVATION_REQUIRED')) {\n        addToast(t('Este origen requiere permisos de administrador. Reabre Purgio como administrador y vuelve a intentarlo.'), 'warning', 7000);\n      } else if (message.includes('STARTUP_TARGET_EXISTS')) {\n        addToast(t('El origen de arranque ya contiene una entrada con el mismo nombre. Purgio no sobrescribió nada.'), 'warning', 7000);\n      } else {\n        addToast(`${t('No se pudo activar')} \"${item.name}\".`, 'error');\n      }\n"""
if old not in text:
    raise SystemExit('Missing enable catch marker')
text = text.replace(old, new, 1)
app.write_text(text)

# i18n strings
path = Path('src/i18n.tsx')
text = path.read_text()
anchor = "  'Falta el comando original para reactivar': 'Original command is missing and this entry cannot be re-enabled',\n"
if anchor not in text:
    # fall back near common startup copy
    anchor = "  'Desconocido': 'Unknown',\n"
add = """  'Permisos:': 'Permissions:',\n  'Rollback:': 'Rollback:',\n  'Este origen puede requerir abrir Purgio como administrador para modificarlo.': 'This source may require reopening Purgio as administrator before it can be changed.',\n  'Este respaldo no conserva un origen verificable y no puede restaurarse automáticamente.': 'This backup does not preserve a verifiable original source and cannot be restored automatically.',\n  'Este origen requiere permisos de administrador. Reabre Purgio como administrador y vuelve a intentarlo.': 'This source requires administrator permissions. Reopen Purgio as administrator and try again.',\n  'La entrada de arranque cambió desde el último análisis. Purgio no modificó nada; vuelve a analizar antes de continuar.': 'The startup entry changed since the last scan. Purgio changed nothing; scan again before continuing.',\n  'El origen de arranque ya contiene una entrada con el mismo nombre. Purgio no sobrescribió nada.': 'The original startup source already contains an entry with the same name. Purgio did not overwrite it.',\n  'Aplicación no reconocida. Purgio no asume que sea seguro desactivarla.': 'Unrecognized application. Purgio does not assume it is safe to disable.',\n  'Este respaldo fue creado por una versión anterior de Purgio y no conserva la ubicación original. Por seguridad no puede restaurarse automáticamente.': 'This backup was created by an older Purgio version and does not preserve the original location. For safety it cannot be restored automatically.',\n  'Registro — Usuario Run': 'Registry — User Run',\n  'Registro — Usuario RunOnce': 'Registry — User RunOnce',\n  'Registro — Sistema Run': 'Registry — Machine Run',\n  'Registro — Sistema RunOnce': 'Registry — Machine RunOnce',\n  'Registro — Sistema 32-bit Run': 'Registry — Machine 32-bit Run',\n  'Registro — Sistema 32-bit RunOnce': 'Registry — Machine 32-bit RunOnce',\n  'Carpeta Startup — Usuario': 'Startup folder — User',\n  'Carpeta Startup — Todos los usuarios': 'Startup folder — All users',\n  'Respaldo legacy de Purgio': 'Legacy Purgio backup',\n"""
if add.strip() not in text:
    text = text.replace(anchor, anchor + add, 1)
path.write_text(text)

# CI focal formatter
path = Path('.github/workflows/ci.yml')
text = path.read_text()
old = 'rustfmt --edition 2021 --check src-tauri/src/chrome_ai.rs src-tauri/src/component_store.rs src-tauri/src/scanner.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs'
new = 'rustfmt --edition 2021 --check src-tauri/src/chrome_ai.rs src-tauri/src/component_store.rs src-tauri/src/startup.rs src-tauri/src/scanner.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs'
if old not in text:
    raise SystemExit('Missing CI rustfmt command')
path.write_text(text.replace(old, new, 1))

# Durable docs
Path('docs/PR-13.md').write_text(r'''# PR-13 — Conservative Startup classification and faithful rollback

PR-13 removes the Startup trust boundary that allowed the WebView to choose registry locations, filesystem paths and restore commands. Startup actions are now backend-authoritative and fail closed.

## Backend-authoritative actions

The Tauri commands accept only the backend-issued Startup `id`:

- `disable_startup(id)`
- `enable_startup(id)`

Rust rescans or loads its own durable backup metadata to determine the exact source. The frontend never supplies hive, Run/RunOnce key, path or original command for a destructive/restore operation.

## Conservative classification

Unknown applications are `Unknown` impact and `is_safe_to_disable = false`. They remain manually actionable after explicit confirmation, but are never counted or presented as automatically safe.

## Registry origins

Purgio models each source as a closed enum and preserves it in the rollback record:

- HKCU Run
- HKCU RunOnce
- HKLM Run
- HKLM RunOnce
- HKLM 32-bit Run
- HKLM 32-bit RunOnce

The backup stores the exact registry value name, type and raw bytes. Restore uses `set_raw_value`, so `REG_EXPAND_SZ` and other supported raw types are not silently converted to `REG_SZ`.

HKLM operations fail with an elevation-required result when Windows denies write access; Purgio does not silently move the entry to HKCU.

## Startup folders

User and common Startup folders are resolved through Windows Known Folder APIs (`FOLDERID_Startup` and `FOLDERID_CommonStartup`) rather than accepting arbitrary paths from the WebView.

Only direct regular files in those folders are considered. Symlinks, reparse points and reparse ancestors are rejected. Disabling copies the payload to Purgio's per-user backup directory, syncs and fingerprints it, writes durable metadata, verifies the source did not change, and only then removes the original.

Restore derives the destination again from the known folder + stored file name, refuses to overwrite an existing file, verifies the restored payload and never trusts an arbitrary stored destination path.

## Durable rollback

New backups are individual versioned JSON records under `%APPDATA%/Purgio/StartupBackups`, with file payloads stored separately. The record is durable before the original registry value/file is removed.

Legacy entries from `HKCU\\Software\\Purgio\\DisabledStartup` are still displayed, but they are **not** automatically restorable because the old format discarded the original hive/key. PR-13 deliberately refuses to invent HKCU Run as the origin.

## Race and overwrite protections

Registry values are re-read immediately before deletion and compared to the bytes captured for backup. If they changed, Purgio removes the provisional backup and returns `STARTUP_CHANGED` without deleting the entry.

Folder entries are fingerprinted before/after backup. Restore refuses to overwrite an existing registry value or Startup file and reports `STARTUP_TARGET_EXISTS`.

## Official Windows model

Microsoft documents four principal Run/RunOnce roots (HKCU/HKLM × Run/RunOnce), with distinct one-time semantics for RunOnce. User and common Startup folders are Windows Known Folders. PR-13 preserves those distinctions rather than collapsing them into a single user Run key.

References:
- https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys
- https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid
- https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/Shell/fn.SHGetKnownFolderPath.html

## Tests and CI

Tests enforce:
- unknown apps are not safe by default;
- IDs include source identity;
- HKCU/HKLM and Run/RunOnce remain distinct;
- registry value types round-trip through the backup representation;
- path-like IDs are rejected.

The focal rustfmt gate includes `startup.rs`; normal frontend/audit/i18n/build, all Rust tests, strict Clippy and real NSIS packaging remain required before merge.
''')
