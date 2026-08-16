use serde::{Deserialize, Serialize};

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
}

fn get_app_metadata(name: &str) -> (String, String, bool) {
    let lower = name.to_lowercase();
    let apps = [
        ("spotify", "Medium", "Proceso auxiliar de Spotify.", true),
        ("discord", "Medium", "Cliente de Discord.", true),
        ("steam", "High", "Cliente de Steam.", true),
        ("epicgames", "Medium", "Epic Games Launcher.", true),
        ("adobe", "High", "Servicios de Adobe Creative Cloud.", true),
        (
            "onedrive",
            "High",
            "Sincronización de Microsoft OneDrive.",
            true,
        ),
        ("dropbox", "High", "Sincronización de Dropbox.", true),
        ("googledrive", "High", "Google Drive Sync.", true),
        ("teams", "Medium", "Microsoft Teams.", true),
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
        ("telegram", "Low", "Telegram.", true),
        ("whatsapp", "Low", "WhatsApp Desktop.", true),
        ("figma", "Low", "Figma.", true),
        ("notion", "Low", "Notion.", true),
        ("cursor", "Low", "Cursor IDE.", true),
        ("code", "Low", "Visual Studio Code.", true),
        ("chrome", "Low", "Google Chrome Auto-launch.", true),
        ("edge", "Low", "Microsoft Edge Auto-launch.", true),
    ];
    for (key, impact, description, safe) in apps {
        if lower.contains(key) {
            return (impact.into(), description.into(), safe);
        }
    }
    (
        "Unknown".into(),
        "Aplicación no reconocida. Revisa su editor y función antes de desactivarla.".into(),
        false,
    )
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{get_app_metadata, StartupItem};
    use serde::{Deserialize, Serialize};
    use std::path::{Path, PathBuf};
    use std::{env, fs};
    use winreg::{enums::*, RegKey, RegValue};

    const SCHEMA: u32 = 1;

    #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
    enum Origin {
        HkcuRun,
        HkcuOnce,
        HklmRun,
        HklmOnce,
        WowRun,
        WowOnce,
    }

    impl Origin {
        fn all() -> [Self; 6] {
            [
                Self::HkcuRun,
                Self::HkcuOnce,
                Self::HklmRun,
                Self::HklmOnce,
                Self::WowRun,
                Self::WowOnce,
            ]
        }
        fn token(self) -> &'static str {
            match self {
                Self::HkcuRun => "hkcu-run",
                Self::HkcuOnce => "hkcu-once",
                Self::HklmRun => "hklm-run",
                Self::HklmOnce => "hklm-once",
                Self::WowRun => "wow-run",
                Self::WowOnce => "wow-once",
            }
        }
        fn root(self) -> winreg::HKEY {
            match self {
                Self::HkcuRun | Self::HkcuOnce => HKEY_CURRENT_USER,
                _ => HKEY_LOCAL_MACHINE,
            }
        }
        fn key(self) -> &'static str {
            match self {
                Self::HkcuRun | Self::HklmRun => {
                    "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
                }
                Self::HkcuOnce | Self::HklmOnce => {
                    "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
                }
                Self::WowRun => "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
                Self::WowOnce => {
                    "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
                }
            }
        }
        fn label(self) -> &'static str {
            match self {
                Self::HkcuRun => "Usuario · Run",
                Self::HkcuOnce => "Usuario · RunOnce",
                Self::HklmRun => "Sistema · Run",
                Self::HklmOnce => "Sistema · RunOnce",
                Self::WowRun => "Sistema 32-bit · Run",
                Self::WowOnce => "Sistema 32-bit · RunOnce",
            }
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    enum Source {
        Registry {
            origin: Origin,
            name: String,
            bytes: Vec<u8>,
            value_type: String,
        },
        Folder {
            original: PathBuf,
            backup: PathBuf,
        },
    }
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct Record {
        schema: u32,
        id: String,
        name: String,
        source: Source,
    }

    fn state_dir() -> Result<PathBuf, String> {
        let dir = PathBuf::from(env::var_os("APPDATA").ok_or("APPDATA no está disponible.")?)
            .join("Purgio")
            .join("StartupState");
        fs::create_dir_all(dir.join("files"))
            .map_err(|e| format!("No se pudo crear el respaldo: {e}"))?;
        Ok(dir)
    }
    fn load() -> Result<Vec<Record>, String> {
        let path = state_dir()?.join("records.json");
        if !path.exists() {
            return Ok(vec![]);
        }
        let records: Vec<Record> =
            serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|_| {
                "El respaldo de arranque no es válido; no se modificó el sistema.".to_string()
            })?;
        if records.iter().any(|r| r.schema != SCHEMA) {
            return Err("Versión de respaldo incompatible.".into());
        }
        Ok(records)
    }
    fn save(records: &[Record]) -> Result<(), String> {
        let path = state_dir()?.join("records.json");
        let tmp = path.with_extension("tmp");
        fs::write(
            &tmp,
            serde_json::to_vec_pretty(records).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(tmp, path).map_err(|e| e.to_string())
    }
    fn reg_id(origin: Origin, name: &str) -> String {
        format!("registry:{}:{name}", origin.token())
    }
    fn encode_value_type(value: &RegValue) -> Result<String, String> {
        let kind = match value.vtype {
            REG_NONE => "none",
            REG_SZ => "string",
            REG_EXPAND_SZ => "expand-string",
            REG_BINARY => "binary",
            REG_DWORD => "dword",
            REG_DWORD_BIG_ENDIAN => "dword-big-endian",
            REG_LINK => "link",
            REG_MULTI_SZ => "multi-string",
            REG_RESOURCE_LIST => "resource-list",
            REG_FULL_RESOURCE_DESCRIPTOR => "full-resource-descriptor",
            REG_RESOURCE_REQUIREMENTS_LIST => "resource-requirements-list",
            REG_QWORD => "qword",
            _ => {
                return Err(
                    "Tipo de valor de registro no soportado; no se modificó el sistema.".into(),
                )
            }
        };
        Ok(kind.into())
    }
    fn decode_value_type(kind: &str) -> Result<winreg::RegType, String> {
        match kind {
            "none" => Ok(REG_NONE),
            "string" => Ok(REG_SZ),
            "expand-string" => Ok(REG_EXPAND_SZ),
            "binary" => Ok(REG_BINARY),
            "dword" => Ok(REG_DWORD),
            "dword-big-endian" => Ok(REG_DWORD_BIG_ENDIAN),
            "link" => Ok(REG_LINK),
            "multi-string" => Ok(REG_MULTI_SZ),
            "resource-list" => Ok(REG_RESOURCE_LIST),
            "full-resource-descriptor" => Ok(REG_FULL_RESOURCE_DESCRIPTOR),
            "resource-requirements-list" => Ok(REG_RESOURCE_REQUIREMENTS_LIST),
            "qword" => Ok(REG_QWORD),
            _ => Err("El respaldo contiene un tipo de registro desconocido.".into()),
        }
    }
    fn folders() -> Vec<(&'static str, PathBuf)> {
        let mut result = vec![];
        if let Some(v) = env::var_os("APPDATA") {
            result.push((
                "user",
                PathBuf::from(v).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup"),
            ));
        }
        if let Some(v) = env::var_os("PROGRAMDATA") {
            result.push((
                "common",
                PathBuf::from(v).join("Microsoft\\Windows\\Start Menu\\Programs\\StartUp"),
            ));
        }
        result
    }
    fn folder_id(kind: &str, name: &str) -> String {
        format!("folder:{kind}:{name}")
    }
    fn safe_child(parent: &Path, child: &Path) -> bool {
        let Ok(p) = parent.canonicalize() else {
            return false;
        };
        let Ok(c) = child.canonicalize() else {
            return false;
        };
        let Ok(m) = fs::symlink_metadata(child) else {
            return false;
        };
        m.file_type().is_file() && !m.file_type().is_symlink() && c.parent() == Some(p.as_path())
    }
    fn item(id: String, name: String, publisher: String, enabled: bool) -> StartupItem {
        let (impact, description, safe) = get_app_metadata(&name);
        StartupItem {
            id,
            name,
            publisher,
            os: "Windows".into(),
            impact,
            enabled,
            description,
            is_safe_to_disable: safe,
        }
    }

    pub fn scan() -> Vec<StartupItem> {
        let mut items = vec![];
        for origin in Origin::all() {
            let root = RegKey::predef(origin.root());
            if let Ok(key) = root.open_subkey_with_flags(origin.key(), KEY_READ) {
                for (name, _) in key.enum_values().flatten() {
                    items.push(item(
                        reg_id(origin, &name),
                        name,
                        origin.label().into(),
                        true,
                    ));
                }
            }
        }
        for (kind, folder) in folders() {
            if let Ok(entries) = fs::read_dir(&folder) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !safe_child(&folder, &path) {
                        continue;
                    }
                    let file = path.file_name().unwrap().to_string_lossy().to_string();
                    let name = path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    items.push(item(
                        folder_id(kind, &file),
                        name,
                        format!("Carpeta Startup ({kind})"),
                        true,
                    ));
                }
            }
        }
        if let Ok(records) = load() {
            for record in records {
                items.push(item(
                    record.id,
                    record.name,
                    "Desactivado por Purgio".into(),
                    false,
                ));
            }
        }
        items
    }

    pub fn disable(id: &str) -> Result<(), String> {
        let mut records = load()?;
        if records.iter().any(|r| r.id == id) {
            return Err("La entrada ya está desactivada.".into());
        }
        if id.starts_with("registry:") {
            for origin in Origin::all() {
                let root = RegKey::predef(origin.root());
                let Ok(key) = root.open_subkey_with_flags(origin.key(), KEY_READ | KEY_WRITE)
                else {
                    continue;
                };
                for (name, value) in key.enum_values().flatten() {
                    if reg_id(origin, &name) != id {
                        continue;
                    }
                    let value_type = encode_value_type(&value)?;
                    records.push(Record {
                        schema: SCHEMA,
                        id: id.into(),
                        name: name.clone(),
                        source: Source::Registry {
                            origin,
                            name: name.clone(),
                            bytes: value.bytes,
                            value_type,
                        },
                    });
                    save(&records)?;
                    if let Err(e) = key.delete_value(&name) {
                        records.retain(|r| r.id != id);
                        let _ = save(&records);
                        return Err(format!("No se pudo desactivar: {e}"));
                    }
                    return Ok(());
                }
            }
        } else if id.starts_with("folder:") {
            for (kind, folder) in folders() {
                let Ok(entries) = fs::read_dir(&folder) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let original = entry.path();
                    let Some(file) = original
                        .file_name()
                        .map(|v| v.to_string_lossy().to_string())
                    else {
                        continue;
                    };
                    if folder_id(kind, &file) != id || !safe_child(&folder, &original) {
                        continue;
                    }
                    let backup = state_dir()?
                        .join("files")
                        .join(format!("{}-{file}", records.len()));
                    fs::copy(&original, &backup)
                        .map_err(|e| format!("No se pudo respaldar: {e}"))?;
                    let name = original
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    records.push(Record {
                        schema: SCHEMA,
                        id: id.into(),
                        name,
                        source: Source::Folder {
                            original: original.clone(),
                            backup: backup.clone(),
                        },
                    });
                    if let Err(e) = save(&records) {
                        let _ = fs::remove_file(backup);
                        return Err(e);
                    }
                    if let Err(e) = fs::remove_file(&original) {
                        records.retain(|r| r.id != id);
                        let _ = save(&records);
                        let _ = fs::remove_file(backup);
                        return Err(format!("No se pudo desactivar: {e}"));
                    }
                    return Ok(());
                }
            }
        }
        Err("ID de arranque no autorizado o desactualizado.".into())
    }

    pub fn enable(id: &str) -> Result<(), String> {
        let mut records = load()?;
        let pos = records
            .iter()
            .position(|r| r.id == id)
            .ok_or("El respaldo ya no existe.")?;
        let record = records[pos].clone();
        match &record.source {
            Source::Registry {
                origin,
                name,
                bytes,
                value_type,
            } => {
                let key = RegKey::predef(origin.root())
                    .open_subkey_with_flags(origin.key(), KEY_READ | KEY_WRITE)
                    .map_err(|e| e.to_string())?;
                if key.get_raw_value(name).is_ok() {
                    return Err("El origen ya contiene una entrada con ese nombre.".into());
                }
                key.set_raw_value(
                    name,
                    &RegValue {
                        bytes: bytes.clone(),
                        vtype: decode_value_type(value_type)?,
                    },
                )
                .map_err(|e| e.to_string())?;
            }
            Source::Folder { original, backup } => {
                if !folders()
                    .iter()
                    .any(|(_, p)| original.parent() == Some(p.as_path()))
                    || !backup.starts_with(state_dir()?.join("files"))
                {
                    return Err("Destino de respaldo no autorizado.".into());
                }
                if original.exists() {
                    return Err("El destino original ya existe.".into());
                }
                fs::copy(backup, original).map_err(|e| e.to_string())?;
            }
        }
        records.remove(pos);
        save(&records)?;
        if let Source::Folder { backup, .. } = record.source {
            let _ = fs::remove_file(backup);
        }
        Ok(())
    }
}

pub fn get_startup_items() -> Vec<StartupItem> {
    #[cfg(target_os = "windows")]
    {
        return windows::scan();
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![]
    }
}
pub fn disable_startup_item(id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows::disable(id);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = id;
        Err("Solo disponible en Windows.".into())
    }
}
pub fn enable_startup_item(id: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows::enable(id);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = id;
        Err("Solo disponible en Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::get_app_metadata;
    #[test]
    fn unknown_is_review() {
        let (impact, _, safe) = get_app_metadata("Unrecognized Vendor Agent");
        assert_eq!(impact, "Unknown");
        assert!(!safe);
    }
    #[test]
    fn explicit_rules_remain() {
        assert!(get_app_metadata("Spotify").2);
        assert!(!get_app_metadata("Riot Vanguard").2);
    }
}
