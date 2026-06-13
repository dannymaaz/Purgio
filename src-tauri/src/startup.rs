use serde::{Serialize, Deserialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub os: String,
    pub estimated_impact: String, // High, Medium, Low, None
    pub status: String, // Enabled, Disabled
    pub recommendation: String,
    pub is_safe_to_disable: bool,
    pub location_key: String, // Identificador de registro o ruta del archivo
}

/// Obtiene la recomendación e impacto estimado según el nombre de la app
pub fn get_app_metadata(name: &str) -> (String, String, bool) {
    let name_lower = name.to_lowercase();
    
    let safe_apps = [
        ("discord", "Discord", "Medium", "Launcher de chat para gaming. Consume recursos significativos al arrancar.", true),
        ("spotify", "Spotify", "Medium", "Reproductor de música. Abrirlo manualmente ahorra memoria en el inicio.", true),
        ("steam", "Steam", "Medium", "Plataforma de videojuegos. Inicia actualizaciones de juegos en segundo plano.", true),
        ("epicgames", "Epic Games Launcher", "High", "Launcher de juegos. Impacto alto en el arranque y consumo de CPU.", true),
        ("adobe", "Adobe Creative Cloud", "High", "Servicios de Adobe. Inicia múltiples procesos de sincronización.", true),
        ("google drive", "Google Drive", "Low", "Sincronización de archivos en la nube. Desactívalo si prefieres control manual.", true),
        ("dropbox", "Dropbox", "Low", "Cliente de sincronización de Dropbox. Puede desactivarse si no sincronizas constantemente.", true),
        ("onedrive", "Microsoft OneDrive", "Medium", "Almacenamiento en la nube integrado. Seguro de desactivar si no lo usas.", true),
        ("teams", "Microsoft Teams", "High", "Herramienta de colaboración. Consume bastante RAM y retarda el inicio.", true),
        ("slack", "Slack", "Medium", "Plataforma de comunicación de equipos. Recomendable abrirlo a demanda.", true),
        ("zoom", "Zoom", "Medium", "Aplicación de videollamadas. No necesita arrancar con el sistema.", true),
        ("skype", "Skype", "Medium", "Mensajería instantánea. Desactivación segura para mejorar rendimiento.", true),
        ("uplay", "Ubisoft Connect", "Medium", "Launcher de videojuegos de Ubisoft. Seguro de desactivar.", true),
        ("origin", "EA Origin / EA App", "High", "Plataforma de videojuegos de EA. Consume bastante CPU al inicio.", true),
        ("razer", "Razer Synapse", "Medium", "Gestión de luces RGB y macros. Desactívalo si no cambias perfiles constantemente.", true),
        ("corsair", "Corsair iCUE", "High", "Control de iluminación RGB. Impacto considerable en memoria.", true),
        ("logitech", "Logitech G Hub", "Medium", "Software de periféricos Logitech. Seguro de desactivar.", true),
        ("update", "Update Utility", "Low", "Asistente de actualizaciones secundarias. Se pueden realizar a mano.", true),
    ];

    let critical_keywords = [
        "antivirus", "defender", "security", "firewall", "audio", "sound", "graphics", "nvidia", 
        "intel", "amd", "realtek", "driver", "network", "wifi", "bluetooth", "touchpad", 
        "synaptics", "keychain", "icloud", "timemachine", "systemd", "dbus", "vpn"
    ];

    for (key, _display_name, impact, rec, is_safe) in safe_apps.iter() {
        if name_lower.contains(key) {
            return (impact.to_string(), rec.to_string(), *is_safe);
        }
    }

    for key in critical_keywords.iter() {
        if name_lower.contains(key) {
            return (
                "Low".to_string(),
                "CRÍTICO: Este programa está relacionado con drivers, red o seguridad del sistema. Se desaconseja desactivarlo.".to_string(),
                false
            );
        }
    }

    (
        "Low".to_string(),
        "Programa de usuario. Desactívalo si prefieres ejecutarlo manualmente cuando lo requieras.".to_string(),
        true
    )
}

/// Obtiene la carpeta de respaldo segura para los accesos directos deshabilitados
#[cfg(target_os = "windows")]
fn get_backup_startup_dir() -> Option<PathBuf> {
    env::var("APPDATA").ok().map(|appdata| {
        let path = PathBuf::from(appdata).join("Purgio").join("BackupStartup");
        let _ = fs::create_dir_all(&path);
        path
    })
}

/// Escanea los programas de arranque según el sistema operativo (activos y desactivados)
pub fn get_startup_items() -> Vec<StartupItem> {
    let mut items = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        // 1. Leer HKCU\Software\Microsoft\Windows\CurrentVersion\Run (Habilitados)
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_READ
        ) {
            for entry in run_key.enum_values().flatten() {
                let (name, _val) = entry;
                let (impact, rec, safe) = get_app_metadata(&name);
                items.push(StartupItem {
                    id: format!("hkcu_run_{}", name),
                    name: name.clone(),
                    publisher: "Registro (Usuario)".to_string(),
                    os: "Windows".to_string(),
                    estimated_impact: impact,
                    status: "Enabled".to_string(),
                    recommendation: rec,
                    is_safe_to_disable: safe,
                    location_key: format!("HKCU\\Run\\{}", name),
                });
            }
        }

        // 2. Leer HKCU\Software\Purgio\DisabledStartup (Deshabilitados por Purgio)
        if let Ok(disabled_key) = hkcu.open_subkey_with_flags(
            "Software\\Purgio\\DisabledStartup",
            KEY_READ
        ) {
            for entry in disabled_key.enum_values().flatten() {
                let (name, _val) = entry;
                let (impact, rec, safe) = get_app_metadata(&name);
                items.push(StartupItem {
                    id: format!("hkcu_run_disabled_{}", name),
                    name: name.clone(),
                    publisher: "Registro (Usuario)".to_string(),
                    os: "Windows".to_string(),
                    estimated_impact: impact,
                    status: "Disabled".to_string(),
                    recommendation: rec,
                    is_safe_to_disable: safe,
                    location_key: format!("HKCU\\RunDisabled\\{}", name),
                });
            }
        }

        // 3. Carpeta Startup de usuario (Habilitados)
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
                            });
                        }
                    }
                }
            }
        }

        // 4. Carpeta de respaldo de Purgio (Deshabilitados)
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
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let launch_agents = PathBuf::from(home).join("Library/LaunchAgents");
            if launch_agents.exists() {
                if let Ok(entries) = fs::read_dir(&launch_agents) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let filename = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                            
                            let (is_relevant, is_enabled) = if filename.ends_with(".plist") {
                                (true, true)
                            } else if filename.ends_with(".plist.disabled") {
                                (true, false)
                            } else {
                                (false, false)
                            };

                            if is_relevant {
                                let name = path.file_stem()
                                    .map(|s| s.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "LaunchAgent".to_string());
                                // Limpiar ".plist" del nombre si terminó en disabled
                                let clean_name = name.trim_end_matches(".plist").to_string();
                                
                                let (impact, rec, safe) = get_app_metadata(&clean_name);
                                items.push(StartupItem {
                                    id: format!("mac_la_{}", clean_name),
                                    name: clean_name,
                                    publisher: "macOS LaunchAgent".to_string(),
                                    os: "macOS".to_string(),
                                    estimated_impact: impact,
                                    status: if is_enabled { "Enabled".to_string() } else { "Disabled".to_string() },
                                    recommendation: rec,
                                    is_safe_to_disable: safe,
                                    location_key: path.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let autostart = PathBuf::from(home).join(".config/autostart");
            if autostart.exists() {
                if let Ok(entries) = fs::read_dir(&autostart) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let filename = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                            
                            let (is_relevant, is_enabled) = if filename.ends_with(".desktop") {
                                (true, true)
                            } else if filename.ends_with(".desktop.disabled") {
                                (true, false)
                            } else {
                                (false, false)
                            };

                            if is_relevant {
                                let name = path.file_stem()
                                    .map(|s| s.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "Autostart".to_string());
                                let clean_name = name.trim_end_matches(".desktop").to_string();

                                let (impact, rec, safe) = get_app_metadata(&clean_name);
                                items.push(StartupItem {
                                    id: format!("linux_as_{}", clean_name),
                                    name: clean_name,
                                    publisher: "Linux Autostart".to_string(),
                                    os: "Linux".to_string(),
                                    estimated_impact: impact,
                                    status: if is_enabled { "Enabled".to_string() } else { "Disabled".to_string() },
                                    recommendation: rec,
                                    is_safe_to_disable: safe,
                                    location_key: path.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Si la lista estuviera vacía, se inyectan algunos de prueba/ejemplo (en entornos de sandbox o desarrollo limpio)
    if items.is_empty() {
        items.push(StartupItem {
            id: "sim_spotify".to_string(),
            name: "Spotify".to_string(),
            publisher: "Spotify AB".to_string(),
            os: env::consts::OS.to_string(),
            estimated_impact: "Medium".to_string(),
            status: "Enabled".to_string(),
            recommendation: "Reproductor de música. Inicia en segundo plano reduciendo la velocidad de encendido.".to_string(),
            is_safe_to_disable: true,
            location_key: "simulated_spotify".to_string(),
        });
        items.push(StartupItem {
            id: "sim_discord".to_string(),
            name: "Discord".to_string(),
            publisher: "Discord Inc.".to_string(),
            os: env::consts::OS.to_string(),
            estimated_impact: "Medium".to_string(),
            status: "Disabled".to_string(),
            recommendation: "Plataforma de comunicación. Inicia automáticamente para conectarse a servidores.".to_string(),
            is_safe_to_disable: true,
            location_key: "simulated_discord".to_string(),
        });
        items.push(StartupItem {
            id: "sim_defender".to_string(),
            name: "Windows Defender".to_string(),
            publisher: "Microsoft Corporation".to_string(),
            os: env::consts::OS.to_string(),
            estimated_impact: "Low".to_string(),
            status: "Enabled".to_string(),
            recommendation: "CRÍTICO: Este programa protege tu computadora contra amenazas en tiempo real. No debe ser desactivado.".to_string(),
            is_safe_to_disable: false,
            location_key: "simulated_defender".to_string(),
        });
    }

    items
}

/// Desactiva una aplicación del arranque de forma real
pub fn disable_startup_item(_id: &str, location_key: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.starts_with("HKCU\\Run\\") {
            let value_name = location_key.trim_start_matches("HKCU\\Run\\");
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            
            // 1. Obtener comando original de la clave Run
            let run_key = hkcu.open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_READ | KEY_WRITE
            ).map_err(|e| format!("No se pudo abrir la clave Run: {}", e))?;
            
            let command: String = run_key.get_value(value_name)
                .map_err(|e| format!("No se pudo leer el comando de arranque: {}", e))?;
            
            // 2. Escribir en la subclave de respaldo de Purgio
            let (disabled_key, _) = hkcu.create_subkey(
                "Software\\Purgio\\DisabledStartup"
            ).map_err(|e| format!("No se pudo crear la clave de respaldo: {}", e))?;
            
            disabled_key.set_value(value_name, &command)
                .map_err(|e| format!("No se pudo guardar el respaldo: {}", e))?;
            
            // 3. Borrar de Run
            run_key.delete_value(value_name)
                .map_err(|e| format!("No se pudo borrar del inicio activo: {}", e))?;
                
            return Ok(());
        } else if Path::new(location_key).exists() {
            // Es un archivo en la carpeta Startup, moverlo a la carpeta de respaldo segura
            let path = Path::new(location_key);
            if let Some(backup_dir) = get_backup_startup_dir() {
                if let Some(file_name) = path.file_name() {
                    let dest = backup_dir.join(file_name);
                    fs::rename(path, dest)
                        .map_err(|e| format!("No se pudo mover el acceso directo al respaldo: {}", e))?;
                    return Ok(());
                }
            }
            return Err("No se encontró la ruta del respaldo de inicio.".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = Path::new(location_key);
        if path.exists() {
            let mut new_path = path.to_path_buf();
            // Asegurarnos de no duplicar extensiones
            let filename = path.file_name().unwrap().to_string_lossy().to_string();
            if filename.ends_with(".plist") {
                new_path.set_file_name(format!("{}.disabled", filename));
                fs::rename(path, new_path)
                    .map_err(|e| format!("No se pudo desactivar el plist: {}", e))?;
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(location_key);
        if path.exists() {
            let mut new_path = path.to_path_buf();
            let filename = path.file_name().unwrap().to_string_lossy().to_string();
            if filename.ends_with(".desktop") {
                new_path.set_file_name(format!("{}.disabled", filename));
                fs::rename(path, new_path)
                    .map_err(|e| format!("No se pudo desactivar el autostart: {}", e))?;
                return Ok(());
            }
        }
    }

    if location_key.starts_with("simulated_") {
        return Ok(());
    }

    Err("Ubicación no soportada o permisos insuficientes.".to_string())
}

/// Restaura una aplicación desactivada al arranque de forma real
pub fn enable_startup_item(_name: &str, location_key: &str, original_command: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.starts_with("HKCU\\RunDisabled\\") || location_key.starts_with("HKCU\\Run\\") {
            // Extraer el nombre de la app (el valor del registro)
            let value_name = if location_key.starts_with("HKCU\\RunDisabled\\") {
                location_key.trim_start_matches("HKCU\\RunDisabled\\")
            } else {
                location_key.trim_start_matches("HKCU\\Run\\")
            };

            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            
            // 1. Intentar leer el comando desde la clave de respaldo de Purgio
            let mut command = original_command.to_string();
            if let Ok(disabled_key) = hkcu.open_subkey_with_flags(
                "Software\\Purgio\\DisabledStartup",
                KEY_READ | KEY_WRITE
            ) {
                if let Ok(cmd) = disabled_key.get_value::<String, _>(value_name) {
                    command = cmd;
                }
                // Limpiar del respaldo
                let _ = disabled_key.delete_value(value_name);
            }
            
            if command.is_empty() {
                return Err("No se encontró el comando original para reactivar.".to_string());
            }

            // 2. Escribir de nuevo en la clave de inicio activo de Windows
            let run_key = hkcu.open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_WRITE
            ).map_err(|e| format!("No se pudo abrir la clave Run: {}", e))?;
            
            run_key.set_value(value_name, &command)
                .map_err(|e| format!("No se pudo escribir en el inicio activo: {}", e))?;
                
            return Ok(());
        } else if location_key.contains("BackupStartup") || location_key.contains("Startup") {
            // Mover de regreso el acceso directo desde el respaldo a la carpeta Startup
            let path = Path::new(location_key);
            let file_name = path.file_name().ok_or("Nombre de archivo inválido.")?;
            
            if let Ok(appdata) = env::var("APPDATA") {
                let startup_dir = PathBuf::from(appdata)
                    .join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
                
                let source_path = if path.exists() {
                    path.to_path_buf()
                } else if let Some(backup_dir) = get_backup_startup_dir() {
                    backup_dir.join(file_name)
                } else {
                    return Err("No se pudo ubicar el archivo de respaldo.".to_string());
                };

                let dest_path = startup_dir.join(file_name);
                fs::rename(source_path, dest_path)
                    .map_err(|e| format!("No se pudo restaurar el acceso directo: {}", e))?;
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = Path::new(location_key);
        // Si la clave ya tiene .disabled, renombrarla a .plist
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        if filename.ends_with(".plist.disabled") {
            let mut new_path = path.to_path_buf();
            let clean_filename = filename.trim_end_matches(".disabled").to_string();
            new_path.set_file_name(clean_filename);
            
            if path.exists() {
                fs::rename(path, new_path)
                    .map_err(|e| format!("No se pudo habilitar el plist: {}", e))?;
                return Ok(());
            }
        } else {
            // Si nos pasaron el path activo pero no existe, comprobar si existe el deshabilitado
            let mut disabled_path = path.to_path_buf();
            disabled_path.set_file_name(format!("{}.disabled", filename));
            if disabled_path.exists() {
                fs::rename(disabled_path, path)
                    .map_err(|e| format!("No se pudo habilitar el plist: {}", e))?;
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(location_key);
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        if filename.ends_with(".desktop.disabled") {
            let mut new_path = path.to_path_buf();
            let clean_filename = filename.trim_end_matches(".disabled").to_string();
            new_path.set_file_name(clean_filename);
            
            if path.exists() {
                fs::rename(path, new_path)
                    .map_err(|e| format!("No se pudo habilitar el autostart: {}", e))?;
                return Ok(());
            }
        } else {
            let mut disabled_path = path.to_path_buf();
            disabled_path.set_file_name(format!("{}.disabled", filename));
            if disabled_path.exists() {
                fs::rename(disabled_path, path)
                    .map_err(|e| format!("No se pudo habilitar el autostart: {}", e))?;
                return Ok(());
            }
        }
    }

    if location_key.starts_with("simulated_") {
        return Ok(());
    }

    Err("No se pudo restaurar el programa de arranque.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_app_metadata() {
        let (impact, _, safe) = get_app_metadata("Spotify");
        assert_eq!(impact, "Medium");
        assert!(safe);

        let (impact, _, safe) = get_app_metadata("discord.exe");
        assert_eq!(impact, "Medium");
        assert!(safe);

        let (impact, _, safe) = get_app_metadata("Adobe Creative Cloud");
        assert_eq!(impact, "High");
        assert!(safe);

        let (_, _, safe) = get_app_metadata("Windows Defender");
        assert!(!safe);
    }
}
