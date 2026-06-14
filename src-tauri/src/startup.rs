use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub os: String,
    pub estimated_impact: String,
    pub status: String, // "Enabled" | "Disabled"
    pub recommendation: String,
    pub is_safe_to_disable: bool,
    pub location_key: String,
    pub command: Option<String>,
}

/// Retorna un directorio donde guardaremos accesos directos deshabilitados para evitar que inicien.
fn get_backup_startup_dir() -> Option<PathBuf> {
    if let Ok(appdata) = env::var("APPDATA") {
        let backup_dir = PathBuf::from(appdata).join("Purgio").join("BackupStartup");
        if !backup_dir.exists() {
            fs::create_dir_all(&backup_dir).ok()?;
        }
        return Some(backup_dir);
    }
    None
}

/// Metadatos sobre las aplicaciones de inicio (impacto, recomendacin, etc)
fn get_app_metadata(name: &str) -> (String, String, bool) {
    let name_lower = name.to_lowercase();
    
    let apps = [
        ("spotify", "Medium", "Proceso auxiliar de Spotify.", true),
        ("discord", "Medium", "Cliente de Discord.", true),
        ("steam", "High", "Cliente de Steam.", true),
        ("epicgames", "Medium", "Epic Games Launcher.", true),
        ("adobe", "High", "Servicios de Adobe Creative Cloud.", true),
        ("onedrive", "High", "Sincronizacion de Microsoft OneDrive.", true), // User wants to disable it, make it safe
        ("dropbox", "High", "Sincronizacion de Dropbox.", true),
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

    for (key, impact, rec, safe) in apps.iter() {
        if name_lower.contains(key) {
            return (impact.to_string(), rec.to_string(), *safe);
        }
    }

    ("Unknown".to_string(), "Desconocido. Si no lo usas, puede ser seguro desactivarlo.".to_string(), true)
}

#[cfg(target_os = "windows")]
fn read_registry_startup(items: &mut Vec<StartupItem>, hkey: winreg::HKEY, subkey: &str, is_disabled: bool, source_name: &str) {
    use winreg::RegKey;
    use winreg::enums::*;
    let root = RegKey::predef(hkey);
    if let Ok(run_key) = root.open_subkey_with_flags(subkey, KEY_READ) {
        for entry in run_key.enum_values().flatten() {
            let (name, val) = entry;
            let (impact, rec, safe) = get_app_metadata(&name);
            let cmd: String = val.to_string();
            
            let status = if is_disabled { "Disabled".to_string() } else { "Enabled".to_string() };
            
            // Format location_key securely based on source to enable restoring later
            let location_key = if is_disabled {
                format!("DisabledRun\\{}", name)
            } else {
                format!("{}\\{}", subkey, name)
            };

            items.push(StartupItem {
                id: format!("reg_{}_{}", source_name, name),
                name: name.clone(),
                publisher: format!("Registro ({})", source_name),
                os: "Windows".to_string(),
                estimated_impact: impact,
                status,
                recommendation: rec,
                is_safe_to_disable: safe,
                location_key,
                command: Some(cmd),
            });
        }
    }
}

/// Escanea los programas de arranque
pub fn get_startup_items() -> Vec<StartupItem> {
    let mut items = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;

        // 1. HKCU Run
        read_registry_startup(&mut items, HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", false, "Usuario");
        
        // 2. HKCU RunOnce
        read_registry_startup(&mut items, HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce", false, "Usuario RunOnce");
        
        // 3. HKLM Run
        read_registry_startup(&mut items, HKEY_LOCAL_MACHINE, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", false, "Sistema");
        
        // 4. HKLM WOW6432Node Run
        read_registry_startup(&mut items, HKEY_LOCAL_MACHINE, "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run", false, "Sistema (32-bit)");

        // 5. Disabled by Purgio (we store them in HKCU\Software\Purgio\DisabledStartup)
        read_registry_startup(&mut items, HKEY_CURRENT_USER, "Software\\Purgio\\DisabledStartup", true, "Usuario (Desactivado)");

        // 6. Carpeta Startup de usuario
        if let Ok(appdata) = env::var("APPDATA") {
            let startup_path = PathBuf::from(appdata)
                .join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
            if startup_path.exists() {
                if let Ok(entries) = fs::read_dir(&startup_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let name = path.file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Acceso directo".to_string());
                            let (impact, rec, safe) = get_app_metadata(&name);
                            items.push(StartupItem {
                                id: format!("folder_run_{}", name),
                                name: name.clone(),
                                publisher: "Carpeta de Inicio".to_string(),
                                os: "Windows".to_string(),
                                estimated_impact: impact,
                                status: "Enabled".to_string(),
                                recommendation: rec,
                                is_safe_to_disable: safe,
                                location_key: path.to_string_lossy().to_string(),
                                command: Some(path.to_string_lossy().to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 7. Carpeta de respaldo de Purgio
        if let Some(backup_dir) = get_backup_startup_dir() {
            if backup_dir.exists() {
                if let Ok(entries) = fs::read_dir(&backup_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let name = path.file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Acceso directo".to_string());
                            let (impact, rec, safe) = get_app_metadata(&name);
                            items.push(StartupItem {
                                id: format!("folder_run_disabled_{}", name),
                                name: name.clone(),
                                publisher: "Carpeta de Inicio".to_string(),
                                os: "Windows".to_string(),
                                estimated_impact: impact,
                                status: "Disabled".to_string(),
                                recommendation: rec,
                                is_safe_to_disable: safe,
                                location_key: path.to_string_lossy().to_string(),
                                command: Some(path.to_string_lossy().to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    items
}

pub fn disable_startup_item(id: &str, location_key: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.contains("CurrentVersion\\Run") || location_key.contains("CurrentVersion\\RunOnce") {
            let parts: Vec<&str> = location_key.splitn(2, '\\').collect();
            let parent_key_path = parts.get(0).unwrap_or(&"");
            let value_name = parts.last().unwrap_or(&""); // actually it's full path + \ + name, let's extract name. Wait, the location_key passed earlier is "Software\...\Run\Name".
            
            // To properly split, the name is the last component
            let mut parts: Vec<&str> = location_key.split('\\').collect();
            let name = parts.pop().unwrap_or("");
            let reg_path = parts.join("\\");

            // Check if it's HKLM or HKCU based on the id
            let hkey = if id.contains("Sistema") || reg_path.contains("WOW6432Node") { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
            let root = RegKey::predef(hkey);

            let run_key = root.open_subkey_with_flags(&reg_path, KEY_READ | KEY_WRITE)
                .map_err(|e| format!("No se pudo abrir la clave del registro: {}", e))?;

            let command: String = run_key.get_value(name)
                .map_err(|e| format!("No se pudo leer el valor: {}", e))?;

            // Guardar en respaldo
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let (disabled_key, _) = hkcu.create_subkey_with_flags("Software\\Purgio\\DisabledStartup", KEY_WRITE)
                .map_err(|e| format!("No se pudo crear clave de respaldo: {}", e))?;

            disabled_key.set_value(name, &command)
                .map_err(|e| format!("No se pudo escribir en respaldo: {}", e))?;

            // Borrar de Run
            run_key.delete_value(name)
                .map_err(|e| format!("No se pudo eliminar de Run: {}", e))?;
                
            return Ok(());
        } else if Path::new(location_key).exists() {
            let path = Path::new(location_key);
            if let Some(backup_dir) = get_backup_startup_dir() {
                if let Some(file_name) = path.file_name() {
                    let dest = backup_dir.join(file_name);
                    fs::rename(path, dest)
                        .map_err(|e| format!("No se pudo mover el acceso directo: {}", e))?;
                    return Ok(());
                }
            }
        }
    }

    Err("Ubicación no soportada.".to_string())
}

pub fn enable_startup_item(_name: &str, location_key: &str, original_command: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.starts_with("DisabledRun\\") {
            let name = location_key.trim_start_matches("DisabledRun\\");

            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            
            let mut command = original_command.to_string();
            if let Ok(disabled_key) = hkcu.open_subkey_with_flags("Software\\Purgio\\DisabledStartup", KEY_READ | KEY_WRITE) {
                if let Ok(cmd) = disabled_key.get_value::<String, _>(name) {
                    command = cmd;
                }
                let _ = disabled_key.delete_value(name);
            }
            
            let (run_key, _) = hkcu.create_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
                .map_err(|e| format!("No se pudo abrir Run: {}", e))?;
            
            run_key.set_value(name, &command)
                .map_err(|e| format!("No se pudo escribir: {}", e))?;
                
            return Ok(());
        } else if location_key.contains("BackupStartup") {
            let path = Path::new(location_key);
            let file_name = path.file_name().ok_or("Nombre de archivo inválido.")?;
            
            if let Ok(appdata) = env::var("APPDATA") {
                let startup_dir = PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
                let dest_path = startup_dir.join(file_name);
                fs::rename(path, dest_path).map_err(|e| format!("Error: {}", e))?;
                return Ok(());
            }
        }
    }

    Err("No se pudo restaurar.".to_string())
}

