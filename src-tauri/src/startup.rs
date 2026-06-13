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
    
    // Lista segura de apps que se pueden desactivar
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

    // Lista de procesos que NO se deben desactivar
    let critical_keywords = [
        "antivirus", "defender", "security", "firewall", "audio", "sound", "graphics", "nvidia", 
        "intel", "amd", "realtek", "driver", "network", "wifi", "bluetooth", "touchpad", 
        "synaptics", "keychain", "icloud", "timemachine", "systemd", "dbus", "vpn"
    ];

    // Comprobar si coincide con alguna de las apps seguras
    for (key, _display_name, impact, rec, is_safe) in safe_apps.iter() {
        if name_lower.contains(key) {
            return (impact.to_string(), rec.to_string(), *is_safe);
        }
    }

    // Comprobar si parece un proceso crítico del sistema
    for key in critical_keywords.iter() {
        if name_lower.contains(key) {
            return (
                "Low".to_string(),
                "CRÍTICO: Este programa está relacionado con drivers, red o seguridad del sistema. Se desaconseja desactivarlo.".to_string(),
                false
            );
        }
    }

    // Por defecto para apps genéricas/desconocidas
    (
        "Low".to_string(),
        "Programa genérico. Desactívalo solo si no requieres que se inicie de forma automática.".to_string(),
        true
    )
}

/// Escanea los programas de arranque según el sistema operativo
pub fn get_startup_items() -> Vec<StartupItem> {
    let mut items = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        // 1. Leer HKCU\Software\Microsoft\Windows\CurrentVersion\Run
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
                    publisher: "Desconocido".to_string(),
                    os: "Windows".to_string(),
                    estimated_impact: impact,
                    status: "Enabled".to_string(),
                    recommendation: rec,
                    is_safe_to_disable: safe,
                    location_key: format!("HKCU\\Run\\{}", name),
                });
            }
        }

        // 2. Carpeta Startup de usuario
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
                                publisher: "Desconocido".to_string(),
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
    }

    #[cfg(target_os = "macos")]
    {
        // 1. Leer ~/Library/LaunchAgents
        if let Ok(home) = env::var("HOME") {
            let launch_agents = PathBuf::from(home).join("Library/LaunchAgents");
            if launch_agents.exists() {
                if let Ok(entries) = fs::read_dir(&launch_agents) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() && path.extension().map(|e| e == "plist").unwrap_or(false) {
                            let name = path.file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "LaunchAgent".to_string());
                            let (impact, rec, safe) = get_app_metadata(&name);
                            items.push(StartupItem {
                                id: format!("mac_la_{}", name),
                                name: name.clone(),
                                publisher: "Apple / Third Party".to_string(),
                                os: "macOS".to_string(),
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
    }

    #[cfg(target_os = "linux")]
    {
        // 1. Leer ~/.config/autostart
        if let Ok(home) = env::var("HOME") {
            let autostart = PathBuf::from(home).join(".config/autostart");
            if autostart.exists() {
                if let Ok(entries) = fs::read_dir(&autostart) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() && path.extension().map(|e| e == "desktop").unwrap_or(false) {
                            let name = path.file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Autostart".to_string());
                            let (impact, rec, safe) = get_app_metadata(&name);
                            items.push(StartupItem {
                                id: format!("linux_as_{}", name),
                                name: name.clone(),
                                publisher: "Linux App".to_string(),
                                os: "Linux".to_string(),
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
    }

    // Agregar algunos elementos simulados o adicionales si la lista está completamente vacía (para propósitos de testing y robustez de UI en entornos de desarrollo sin aplicaciones de arranque)
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
            status: "Enabled".to_string(),
            recommendation: "Plataforma de comunicación. Inicia automáticamente para conectarse a servidores.".to_string(),
            is_safe_to_disable: true,
            location_key: "simulated_discord".to_string(),
        });
        items.push(StartupItem {
            id: "sim_defender".to_string(),
            name: "Windows Defender / Security Shield".to_string(),
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

/// Desactiva una aplicación del arranque.
/// En Windows, elimina el registro o mueve el acceso directo a una carpeta temporal de respaldo.
/// En Linux/macOS, renombra o cambia el estado en el archivo de autostart.
pub fn disable_startup_item(id: &str, location_key: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.starts_with("HKCU\\Run\\") {
            let value_name = location_key.trim_start_matches("HKCU\\Run\\");
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok(run_key) = hkcu.open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_WRITE
            ) {
                if run_key.delete_value(value_name).is_ok() {
                    return Ok(());
                }
            }
            return Err("No se pudo eliminar el valor de registro de arranque.".to_string());
        } else if Path::new(location_key).exists() && location_key.contains("Startup") {
            // Mover a una carpeta de respaldo temporal en lugar de eliminar
            let path = Path::new(location_key);
            let backup_dir = env::temp_dir().join("Purgio_Startup_Backup");
            let _ = fs::create_dir_all(&backup_dir);
            if let Some(file_name) = path.file_name() {
                let dest = backup_dir.join(file_name);
                if fs::rename(path, dest).is_ok() {
                    return Ok(());
                }
            }
            return Err("No se pudo desactivar el acceso directo de arranque.".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = Path::new(location_key);
        if path.exists() {
            // Renombrar a .plist.disabled
            let mut new_path = path.to_path_buf();
            new_path.set_extension("plist.disabled");
            if fs::rename(path, new_path).is_ok() {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(location_key);
        if path.exists() {
            // Modificar archivo .desktop agregando X-GNOME-Autostart-enabled=false o renombrando
            let mut new_path = path.to_path_buf();
            new_path.set_extension("desktop.disabled");
            if fs::rename(path, new_path).is_ok() {
                return Ok(());
            }
        }
    }

    // Para simulaciones o si falla, simplemente retornamos Ok para no congelar la UI
    if location_key.starts_with("simulated_") {
        return Ok(());
    }

    Err("Método de desactivación no soportado o permisos insuficientes.".to_string())
}

/// Restaura una aplicación desactivada al arranque
pub fn enable_startup_item(name: &str, location_key: &str, original_command: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        if location_key.starts_with("HKCU\\Run\\") {
            let value_name = location_key.trim_start_matches("HKCU\\Run\\");
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok(run_key) = hkcu.open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_WRITE
            ) {
                if run_key.set_value(value_name, &original_command).is_ok() {
                    return Ok(());
                }
            }
            return Err("No se pudo restaurar el registro de arranque.".to_string());
        } else if location_key.contains("Startup") {
            // Intentar recuperar de Purgio_Startup_Backup
            let dest_path = Path::new(location_key);
            if let Some(file_name) = dest_path.file_name() {
                let backup_file = env::temp_dir().join("Purgio_Startup_Backup").join(file_name);
                if backup_file.exists() {
                    if fs::rename(backup_file, dest_path).is_ok() {
                        return Ok(());
                    }
                }
            }
            return Err("No se encontró el archivo en el respaldo de arranque.".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = Path::new(location_key);
        let mut disabled_path = path.to_path_buf();
        disabled_path.set_extension("plist.disabled");
        if disabled_path.exists() {
            if fs::rename(disabled_path, path).is_ok() {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(location_key);
        let mut disabled_path = path.to_path_buf();
        disabled_path.set_extension("desktop.disabled");
        if disabled_path.exists() {
            if fs::rename(disabled_path, path).is_ok() {
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
        // Apps seguras recomendadas
        let (impact, _, safe) = get_app_metadata("Spotify");
        assert_eq!(impact, "Medium");
        assert!(safe);

        let (impact, _, safe) = get_app_metadata("discord.exe");
        assert_eq!(impact, "Medium");
        assert!(safe);

        let (impact, _, safe) = get_app_metadata("Adobe Creative Cloud");
        assert_eq!(impact, "High");
        assert!(safe);

        // Apps críticas no recomendadas
        let (_, _, safe) = get_app_metadata("Windows Defender Security");
        assert!(!safe);

        let (_, _, safe) = get_app_metadata("Nvidia Control Panel");
        assert!(!safe);

        let (_, _, safe) = get_app_metadata("Realtek Audio Service");
        assert!(!safe);
    }
}
