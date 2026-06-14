use serde::{Serialize, Deserialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use crate::safety::{self, RiskLevel};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanableItem {
    pub id: String,
    pub name: String,
    pub size: u64, // En bytes
    pub paths: Vec<String>,
    pub risk_level: RiskLevel,
    pub description: String,
    pub impact: String,
    pub recommended_action: String,
    pub selected: bool,
    pub category: String,
}

// ImplementaciÃ³n auxiliar para convertir tipos de String mÃ¡s limpios
impl CleanableItem {
    pub fn new(
        id: &str,
        name: &str,
        size: u64,
        paths: Vec<String>,
        risk_level: RiskLevel,
        description: &str,
        impact: &str,
        recommended_action: &str,
        category: &str,
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            size,
            paths,
            risk_level,
            description: description.to_string(),
            impact: impact.to_string(),
            recommended_action: recommended_action.to_string(),
            selected: matches!(risk_level, RiskLevel::Safe), // Seleccionado por defecto si es seguro
            category: category.to_string(),
        }
    }
}

/// Helper para calcular el tamaÃ±o de un directorio de forma segura e incremental (evitando bucles infinitos y recursiÃ³n profunda)
pub fn get_dir_size<P: AsRef<Path>>(path: P) -> u64 {
    let mut total_size = 0;
    let max_depth = 5; // Limitar profundidad para evitar bloqueos
    
    fn dir_size_recursive(path: &Path, current_depth: usize, max_depth: usize) -> u64 {
        if current_depth > max_depth {
            return 0;
        }
        
        let mut size = 0;
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        size += metadata.len();
                    } else if metadata.is_dir() {
                        // Evitar seguir enlaces simbÃ³licos para no entrar en bucles
                        if !metadata.file_type().is_symlink() {
                            size += dir_size_recursive(&entry.path(), current_depth + 1, max_depth);
                        }
                    }
                }
            }
        }
        size
    }

    if path.as_ref().is_dir() {
        total_size = dir_size_recursive(path.as_ref(), 0, max_depth);
    } else if path.as_ref().is_file() {
        if let Ok(metadata) = fs::metadata(path) {
            total_size = metadata.len();
        }
    }
    
    total_size
}

/// Obtiene los directorios de usuario de navegadores segÃºn la plataforma
fn get_browser_paths() -> Vec<(String, PathBuf)> {
    let mut paths = Vec::new();
    
    #[cfg(target_os = "windows")]
    {
        if let Ok(app_data) = env::var("LOCALAPPDATA") {
            let app_data_path = PathBuf::from(app_data);
            paths.push(("Chrome".to_string(), app_data_path.join("Google\\Chrome\\User Data")));
            paths.push(("Edge".to_string(), app_data_path.join("Microsoft\\Edge\\User Data")));
            paths.push(("Brave".to_string(), app_data_path.join("BraveSoftware\\Brave-Browser\\User Data")));
            paths.push(("Opera".to_string(), app_data_path.join("Opera Software\\Opera Stable")));
        }
        if let Ok(app_data_roaming) = env::var("APPDATA") {
            let app_data_path = PathBuf::from(app_data_roaming);
            paths.push(("Firefox".to_string(), app_data_path.join("Mozilla\\Firefox\\Profiles")));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let home_path = PathBuf::from(home);
            let app_support = home_path.join("Library/Application Support");
            paths.push(("Chrome".to_string(), app_support.join("Google/Chrome")));
            paths.push(("Edge".to_string(), app_support.join("Microsoft Edge")));
            paths.push(("Brave".to_string(), app_support.join("BraveSoftware/Brave-Browser")));
            paths.push(("Opera".to_string(), app_support.join("com.operasoftware.Opera")));
            paths.push(("Firefox".to_string(), home_path.join("Library/Application Support/Firefox/Profiles")));
            paths.push(("Safari".to_string(), home_path.join("Library/Safari")));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home_path = PathBuf::from(home);
            let config = home_path.join(".config");
            paths.push(("Chrome".to_string(), config.join("google-chrome")));
            paths.push(("Brave".to_string(), config.join("BraveSoftware/Brave-Browser")));
            paths.push(("Opera".to_string(), config.join("opera")));
            paths.push(("Firefox".to_string(), home_path.join(".mozilla/firefox")));
            paths.push(("Chromium".to_string(), config.join("chromium")));
        }
    }

    paths
}

/// Escanea los archivos seguros y de revisiÃ³n del sistema operativo
pub fn scan_system_files() -> Vec<CleanableItem> {
    let mut items = Vec::new();

    // 1. Archivos temporales del sistema
    #[cfg(target_os = "windows")]
    {
        if let Ok(temp) = env::var("TEMP") {
            let temp_path = PathBuf::from(&temp);
            if temp_path.exists() && !safety::is_path_critical(&temp) {
                let size = get_dir_size(&temp_path);
                items.push(CleanableItem::new(
                    "win_temp",
                    "Archivos Temporales de Usuario",
                    size,
                    vec![temp.to_string()],
                    RiskLevel::Safe,
                    "Archivos creados por aplicaciones para almacenar informaciÃ³n temporalmente.",
                    "El espacio se liberarÃ¡ de inmediato. Las aplicaciones podrÃ­an tardar una fracciÃ³n de segundo mÃ¡s en recrear archivos temporales la prÃ³xima vez que se abran.",
                    "Seguro de eliminar.",
                    "temp"
                ));
            }
        }
        
        let system_temp = "C:\\Windows\\Temp";
        let system_temp_path = PathBuf::from(system_temp);
        if system_temp_path.exists() && !safety::is_path_critical(system_temp) {
            let size = get_dir_size(&system_temp_path);
            items.push(CleanableItem::new(
                "win_sys_temp",
                "Archivos Temporales del Sistema",
                size,
                vec![system_temp.to_string()],
                RiskLevel::Safe,
                "Archivos temporales generados por el sistema operativo y servicios en segundo plano.",
                "Se eliminarÃ¡n archivos innecesarios de instalaciÃ³n y logs del sistema viejo.",
                "Seguro de eliminar.",
                "temp"
            ));
        }

        // CachÃ© de miniaturas
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let explorer_cache = PathBuf::from(&local_appdata).join("Microsoft\\Windows\\Explorer");
            if explorer_cache.exists() {
                // Filtrar solo archivos thumbcache_*.db
                let mut size = 0;
                if let Ok(entries) = fs::read_dir(&explorer_cache) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with("thumbcache_") && name.ends_with(".db") {
                            if let Ok(meta) = entry.metadata() {
                                size += meta.len();
                            }
                        }
                    }
                }
                items.push(CleanableItem::new(
                    "win_thumb_cache",
                    "CachÃ© de Miniaturas",
                    size,
                    vec![explorer_cache.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "Vistas previas de imÃ¡genes y videos creadas por el explorador de archivos para mostrarlas rÃ¡pido.",
                    "El sistema tardarÃ¡ unos segundos en regenerar las miniaturas de tus carpetas cuando vuelvas a entrar a ellas.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }
        }

        // Windows Error Reporting
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let wer_path = PathBuf::from(&local_appdata).join("CrashDumps");
            if wer_path.exists() {
                let size = get_dir_size(&wer_path);
                items.push(CleanableItem::new(
                    "win_wer",
                    "Reportes de Error de Windows",
                    size,
                    vec![wer_path.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "Informes creados automÃ¡ticamente tras caÃ­das de programas para enviar a Microsoft.",
                    "Se borrarÃ¡n volcados de memoria y logs de errores antiguos. No afecta al funcionamiento de los programas.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }
        }

        // Windows Update Cache
        let win_update_cache = "C:\\Windows\\SoftwareDistribution\\Download";
        let win_update_path = PathBuf::from(win_update_cache);
        if win_update_path.exists() && !safety::is_path_critical(win_update_cache) {
            let size = get_dir_size(&win_update_path);
            items.push(CleanableItem::new(
                "win_update_cache",
                "CachÃ© de Windows Update",
                size,
                vec![win_update_cache.to_string()],
                RiskLevel::Safe,
                "Archivos temporales descargados por Windows Update. Se pueden eliminar tras instalar actualizaciones.",
                "Se liberarÃ¡ espacio. Si hay actualizaciones pendientes de instalar, se volverÃ¡n a descargar.",
                "Seguro de eliminar.",
                "temp"
            ));
        }

        // Logs del sistema de Windows
        let win_logs = "C:\\Windows\\Logs";
        let win_logs_path = PathBuf::from(win_logs);
        if win_logs_path.exists() && !safety::is_path_critical(win_logs) {
            let size = get_dir_size(&win_logs_path);
            items.push(CleanableItem::new(
                "win_logs",
                "Archivos de Log del Sistema",
                size,
                vec![win_logs.to_string()],
                RiskLevel::Safe,
                "Registros de actividad detallada generados por el sistema operativo Windows y sus servicios.",
                "Se borrarÃ¡n logs de diagnÃ³stico de texto plano antiguos. No afecta al funcionamiento de los programas.",
                "Seguro de eliminar.",
                "cache"
            ));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let home_path = PathBuf::from(home);
            let caches = home_path.join("Library/Caches");
            if caches.exists() && !safety::is_path_critical(caches.to_str().unwrap_or("")) {
                let size = get_dir_size(&caches);
                items.push(CleanableItem::new(
                    "mac_user_caches",
                    "CachÃ© de Usuario",
                    size,
                    vec![caches.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "Archivos temporales de aplicaciones macOS para agilizar tiempos de carga.",
                    "El espacio se recuperarÃ¡ de inmediato. Las apps reconstruirÃ¡n sus cachÃ©s segÃºn sea necesario.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }

            let logs = home_path.join("Library/Logs");
            if logs.exists() && !safety::is_path_critical(logs.to_str().unwrap_or("")) {
                let size = get_dir_size(&logs);
                items.push(CleanableItem::new(
                    "mac_user_logs",
                    "Registros de Logs de Usuario",
                    size,
                    logs.to_str().unwrap_or(""),
                    RiskLevel::Safe,
                    "Archivos de registro de diagnÃ³sticos de software del usuario.",
                    "No afecta el sistema, solo elimina reportes de auditorÃ­a de errores antiguos.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }

            // â”€â”€ Xcode Derived Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let xcode_derived = home_path.join("Library/Developer/Xcode/DerivedData");
            if xcode_derived.exists() {
                let size = get_dir_size(&xcode_derived);
                items.push(CleanableItem::new(
                    "mac_xcode_derived",
                    "Xcode Derived Data",
                    size,
                    vec![xcode_derived.to_str().unwrap_or("").to_string()],
                    RiskLevel::Review,
                    "Archivos de compilaciÃ³n intermedios generados por Xcode para tus proyectos de iOS/macOS.",
                    "Xcode deberÃ¡ recompilar los proyectos desde cero la prÃ³xima vez. El proceso puede tardar varios minutos.",
                    "Revisar antes de eliminar si tienes proyectos activos.",
                    "cache"
                ));
            }

            // â”€â”€ iOS Simulator Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let ios_sim = home_path.join("Library/Developer/CoreSimulator");
            if ios_sim.exists() {
                let size = get_dir_size(&ios_sim);
                items.push(CleanableItem::new(
                    "mac_ios_simulator",
                    "CachÃ© del Simulador de iOS",
                    size,
                    vec![ios_sim.to_str().unwrap_or("").to_string()],
                    RiskLevel::Review,
                    "Datos del simulador de iOS/iPadOS usados por Xcode para pruebas de apps en entorno virtual.",
                    "Los simuladores deberÃ¡n reinstalarse. Puede requerir descargas adicionales en Xcode.",
                    "Revisar antes de eliminar si desarrollas para iOS.",
                    "cache"
                ));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home_path = PathBuf::from(home);
            let cache_path = home_path.join(".cache");
            if cache_path.exists() && !safety::is_path_critical(cache_path.to_str().unwrap_or("")) {
                let size = get_dir_size(&cache_path);
                items.push(CleanableItem::new(
                    "linux_user_cache",
                    "CachÃ© de Usuario Linux",
                    size,
                    vec![cache_path.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "CachÃ© de aplicaciones locales y miniaturas en la carpeta home.",
                    "El espacio se liberarÃ¡ inmediatamente. Se regenerarÃ¡n los archivos necesarios automÃ¡ticamente.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }

            // â”€â”€ systemd journal y xorg logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            // /var/log/journal puede fallar sin permisos root; se intenta sin abortar
            let journal_path = PathBuf::from("/var/log/journal");
            if journal_path.exists() {
                if let Ok(_) = fs::read_dir(&journal_path) {
                    let size = get_dir_size(&journal_path);
                    items.push(CleanableItem::new(
                        "linux_journal",
                        "Journal de systemd",
                        size,
                        vec![journal_path.to_str().unwrap_or("").to_string()],
                        RiskLevel::Safe,
                        "Logs del sistema gestionados por systemd journal. Pueden crecer significativamente con el tiempo.",
                        "Se eliminarÃ¡n logs de journal anteriores. Puede requerir permisos de administrador.",
                        "Seguro de eliminar (requiere sudo).",
                        "cache"
                    ));
                }
            }

            let xorg_logs = home_path.join(".local/share/xorg");
            if xorg_logs.exists() {
                let size = get_dir_size(&xorg_logs);
                items.push(CleanableItem::new(
                    "linux_xorg_logs",
                    "Logs de Xorg",
                    size,
                    vec![xorg_logs.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "Archivos de registro del servidor grÃ¡fico Xorg.",
                    "Se eliminarÃ¡n logs de sesiones anteriores de Xorg. No afecta al sistema actual.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }

            // â”€â”€ Snap cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let snap_path = home_path.join("snap");
            if snap_path.exists() {
                let mut snap_size = 0u64;
                if let Ok(entries) = fs::read_dir(&snap_path) {
                    for entry in entries.flatten() {
                        let pkg = entry.path();
                        if pkg.is_dir() {
                            let common_cache = pkg.join("common/.cache");
                            if common_cache.exists() {
                                snap_size += get_dir_size(&common_cache);
                            }
                        }
                    }
                }
                if snap_size > 0 {
                    items.push(CleanableItem::new(
                        "linux_snap_cache",
                        "CachÃ© de Paquetes Snap",
                        snap_size,
                        vec![snap_path.to_str().unwrap_or("").to_string()],
                        RiskLevel::Safe,
                        "CachÃ© de datos de aplicaciones instaladas como paquetes Snap.",
                        "Los paquetes Snap regenerarÃ¡n su cachÃ© segÃºn sea necesario.",
                        "Seguro de eliminar.",
                        "cache"
                    ));
                }
            }

            // â”€â”€ Flatpak cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let flatpak_path = home_path.join(".var/app");
            if flatpak_path.exists() {
                let mut flatpak_size = 0u64;
                if let Ok(entries) = fs::read_dir(&flatpak_path) {
                    for entry in entries.flatten() {
                        let pkg = entry.path();
                        if pkg.is_dir() {
                            let cache_dir = pkg.join("cache");
                            if cache_dir.exists() {
                                flatpak_size += get_dir_size(&cache_dir);
                            }
                        }
                    }
                }
                if flatpak_size > 0 {
                    items.push(CleanableItem::new(
                        "linux_flatpak_cache",
                        "CachÃ© de Paquetes Flatpak",
                        flatpak_size,
                        vec![flatpak_path.to_str().unwrap_or("").to_string()],
                        RiskLevel::Safe,
                        "CachÃ© de datos de aplicaciones instaladas como paquetes Flatpak.",
                        "Los paquetes Flatpak regenerarÃ¡n su cachÃ© segÃºn sea necesario.",
                        "Seguro de eliminar.",
                        "cache"
                    ));
                }
            }

            // â”€â”€ Yarn global cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let yarn_cache = home_path.join(".yarn/cache");
            if yarn_cache.exists() {
                let size = get_dir_size(&yarn_cache);
                items.push(CleanableItem::new(
                    "linux_yarn_cache",
                    "CachÃ© de Yarn",
                    size,
                    vec![yarn_cache.to_str().unwrap_or("").to_string()],
                    RiskLevel::Safe,
                    "Paquetes de Node.js cacheados globalmente por Yarn para acelerar instalaciones.",
                    "Yarn descargarÃ¡ los paquetes de internet la prÃ³xima vez que ejecutes 'yarn install'.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }
        }
    }

    // 2. Papelera de reciclaje
    // Para simplificar, en Windows simularemos o usaremos comandos para vaciarla, pero podemos comprobar el tamaÃ±o del directorio $Recycle.Bin.
    // Para evitar problemas de permisos leyendo $Recycle.Bin directamente, intentaremos leerlo pero si falla pondremos un tamaÃ±o mÃ­nimo simulado o 0.
    #[cfg(target_os = "windows")]
    {
        let recycle_bin = "C:\\$Recycle.Bin";
        let size = if Path::new(recycle_bin).exists() {
            get_dir_size(recycle_bin)
        } else {
            0
        };
        items.push(CleanableItem::new(
            "win_recycle_bin",
            "Papelera de Reciclaje",
            size,
            vec![recycle_bin.to_string()],
            RiskLevel::Safe,
            "Contiene archivos que has eliminado pero que aÃºn permanecen en el disco por si deseas restaurarlos.",
            "Los archivos eliminados se borrarÃ¡n de forma definitiva y no se podrÃ¡n recuperar con facilidad.",
            "Seguro de eliminar permanentemente.",
            "trash"
        ));
    }
    
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let trash_path = PathBuf::from(home).join(".Trash");
            let size = get_dir_size(&trash_path);
            items.push(CleanableItem::new(
                "mac_trash",
                "Papelera de macOS",
                size,
                vec![trash_path.to_str().unwrap_or("").to_string()],
                RiskLevel::Safe,
                "Archivos borrados temporalmente.",
                "Se borrarÃ¡n permanentemente del sistema.",
                "Seguro de vaciar.",
                "trash"
            ));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let trash_path = PathBuf::from(home).join(".local/share/Trash");
            let size = get_dir_size(&trash_path);
            items.push(CleanableItem::new(
                "linux_trash",
                "Papelera de Linux",
                size,
                vec![trash_path.to_str().unwrap_or("").to_string()],
                RiskLevel::Safe,
                "Archivos borrados temporalmente.",
                "Se vaciarÃ¡ la papelera de escritorio del usuario de forma irreversible.",
                "Seguro de vaciar.",
                "trash"
            ));
        }
    }

    // 3. Carpeta de descargas (REVIEW)
    if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
        let downloads = PathBuf::from(home).join("Downloads");
        if downloads.exists() {
            let size = get_dir_size(&downloads);
            items.push(CleanableItem::new(
                "sys_downloads",
                "Carpeta de Descargas",
                size,
                vec![downloads.to_str().unwrap_or("").to_string()],
                RiskLevel::Review,
                "Contiene archivos descargados de Internet, instaladores (.exe, .dmg, .pkg, .deb), PDFs, etc.",
                "Se eliminarÃ¡n todos los archivos guardados en la carpeta Descargas. PodrÃ­as perder informaciÃ³n que no hayas respaldado en otras carpetas.",
                "Requiere confirmaciÃ³n explÃ­cita del usuario.",
                "temp"
            ));
        }
    }

    // 4. CachÃ© de Desarrolladores (NPM, Pip, NuGet)
    if let Ok(home_dir) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
        let home_path = PathBuf::from(&home_dir);

        // NPM Cache
        let npm_path = home_path.join(".npm");
        if npm_path.exists() && !safety::is_path_critical(npm_path.to_str().unwrap_or("")) {
            let size = get_dir_size(&npm_path);
            items.push(CleanableItem::new(
                "npm_cache",
                "CachÃ© de NPM (Node.js)",
                size,
                vec![npm_path.to_str().unwrap_or("").to_string()],
                RiskLevel::Safe,
                "Descargas cacheadas de paquetes e informaciÃ³n de dependencias por Node Package Manager (npm).",
                "NPM descargarÃ¡ los paquetes directamente de internet la prÃ³xima vez que ejecutes 'npm install'.",
                "Seguro de eliminar.",
                "cache"
            ));
        }

        // Pip Cache
        let pip_path = if cfg!(target_os = "windows") {
            if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
                PathBuf::from(local_appdata).join("pip\\cache")
            } else {
                home_path.join("AppData\\Local\\pip\\cache")
            }
        } else {
            home_path.join(".cache/pip")
        };
        if pip_path.exists() && !safety::is_path_critical(pip_path.to_str().unwrap_or("")) {
            let size = get_dir_size(&pip_path);
            items.push(CleanableItem::new(
                "pip_cache",
                "CachÃ© de Pip (Python)",
                size,
                vec![pip_path.to_str().unwrap_or("").to_string()],
                RiskLevel::Safe,
                "Descargas locales cacheadas de librerÃ­as e instaladores de Python por pip.",
                "Pip descargarÃ¡ los paquetes desde PyPI si no los encuentra localmente al instalar dependencias.",
                "Seguro de eliminar.",
                "cache"
            ));
        }

        // NuGet Cache
        let nuget_path = home_path.join(".nuget\\packages");
        if nuget_path.exists() && !safety::is_path_critical(nuget_path.to_str().unwrap_or("")) {
            let size = get_dir_size(&nuget_path);
            items.push(CleanableItem::new(
                "nuget_cache",
                "CachÃ© de NuGet (.NET)",
                size,
                vec![nuget_path.to_str().unwrap_or("").to_string()],
                RiskLevel::Safe,
                "Paquetes de librerÃ­as .NET compilados y cacheados localmente en tu perfil de usuario.",
                "Los proyectos volverÃ¡n a descargar los paquetes NuGet necesarios cuando compiles la soluciÃ³n.",
                "Seguro de eliminar.",
                "cache"
            ));
        }
    }

    items
}

/// Escanea los navegadores y sus datos (cachÃ© y sesiones/cookies sensibles)
pub fn scan_browser_files() -> Vec<CleanableItem> {
    let mut items = Vec::new();
    let browsers = get_browser_paths();

    for (name, path) in browsers {
        if !path.exists() {
            continue;
        }

        // ID amigable
        let browser_id = name.to_lowercase();

        // 1. CachÃ© del navegador (SAFE)
        let cache_dirs = match name.as_str() {
            "Firefox" => vec![path.join("cache2")], // Firefox tiene las cachÃ©s en subcarpetas
            "Safari" => vec![path.join("Caches"), path.join("LocalStorage")],
            _ => vec![path.join("Default\\Cache"), path.join("Default\\Code Cache"), path.join("Cache")], // Chromium browsers
        };

        let mut cache_size = 0;
        let mut cache_paths = Vec::new();
        for c_dir in &cache_dirs {
            if c_dir.exists() {
                cache_size += get_dir_size(c_dir);
                cache_paths.push(c_dir.to_string_lossy().to_string());
            }
        }

        if !cache_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_cache", browser_id),
                &format!("CachÃ© de {}", name),
                cache_size,
                cache_paths,
                RiskLevel::Safe,
                &format!("Archivos temporales e imÃ¡genes cacheadas de pÃ¡ginas web en {}.", name),
                "Las pÃ¡ginas web que visitas con frecuencia podrÃ­an tardar un poco mÃ¡s en cargar la primera vez, pero se optimiza el espacio.",
                "Seguro de eliminar.",
                "browser_cache"
            ));
        }

        // 2. Historial de navegaciÃ³n (REVIEW)
        let mut history_size = 0;
        let history_files = match name.as_str() {
            "Firefox" => vec!["places.sqlite".to_string()],
            "Safari" => vec!["History.db".to_string()],
            _ => vec!["Default\\History".to_string(), "History".to_string()],
        };

        let mut history_paths = Vec::new();
        for h_file in &history_files {
            let h_path = path.join(h_file);
            if h_path.exists() {
                if let Ok(meta) = fs::metadata(&h_path) {
                    history_size += meta.len();
                    history_paths.push(h_path.to_string_lossy().to_string());
                }
            }
        }

        if !history_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_history", browser_id),
                &format!("Historial de navegaciÃ³n de {}", name),
                history_size,
                history_paths,
                RiskLevel::Review,
                &format!("Listado de sitios web visitados en {} recientemente.", name),
                "Se borrarÃ¡ el historial de navegaciÃ³n. No podrÃ¡s usar la funciÃ³n de autocompletado de URLs basada en tu historial.",
                "Requiere confirmaciÃ³n. Borra tu rastro de navegaciÃ³n.",
                "browser_history"
            ));
        }

        // 3. Artefactos de descarga incompleta del navegador (SAFE)
        {
            let mut artifact_size = 0u64;
            let mut artifact_paths = Vec::new();
            match name.as_str() {
                "Firefox" => {
                    if let Ok(profile_entries) = fs::read_dir(&path) {
                        for profile in profile_entries.flatten() {
                            let profile_path = profile.path();
                            if profile_path.is_dir() {
                                if let Ok(files) = fs::read_dir(&profile_path) {
                                    for file in files.flatten() {
                                        let fname = file.file_name().to_string_lossy().to_lowercase();
                                        if fname.ends_with(".part") {
                                            if let Ok(meta) = file.metadata() {
                                                artifact_size += meta.len();
                                                artifact_paths.push(file.path().to_string_lossy().to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {
                    let default_dir = path.join("Default");
                    if default_dir.exists() {
                        if let Ok(files) = fs::read_dir(&default_dir) {
                            for file in files.flatten() {
                                let fname = file.file_name().to_string_lossy().to_lowercase();
                                if fname.ends_with(".crdownload") {
                                    if let Ok(meta) = file.metadata() {
                                        artifact_size += meta.len();
                                        artifact_paths.push(file.path().to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                    let file_sys_dir = path.join("Default\\File System");
                    if file_sys_dir.exists() {
                        artifact_size += get_dir_size(&file_sys_dir);
                        artifact_paths.push(file_sys_dir.to_string_lossy().to_string());
                    }
                }
            }
            if artifact_size > 0 {
                items.push(CleanableItem::new(
                    &format!("{}_download_artifacts", browser_id),
                    &format!("Descargas Incompletas de {}", name),
                    artifact_size,
                    artifact_paths,
                    RiskLevel::Safe,
                    &format!("Archivos de descarga que se interrumpieron en {} (Mega, YouTube, etc.). Estos archivos ocupan espacio sin utilidad.", name),
                    "Se eliminarÃ¡n solo los archivos de descarga incompletos. Las descargas completadas no se verÃ¡n afectadas.",
                    "Seguro de eliminar.",
                    "browser_download_artifacts"
                ));
            }
        }

        // 4. Sesiones activas, Cookies, Tokens y Datos de Formularios (SENSITIVE)
        let mut session_size = 0;
        let mut session_paths: Vec<String> = Vec::new();
        let session_files = match name.as_str() {
            "Firefox" => vec!["cookies.sqlite".to_string(), "sessionstore.jsonlz4".to_string()],
            "Safari" => vec!["Cookies.binarycookies".to_string()],
            _ => vec![
                "Default\\Cookies".to_string(),
                "Default\\Network\\Cookies".to_string(),
                "Default\\Current Session".to_string(),
                "Default\\Current Tabs".to_string(),
                "Default\\Local Storage".to_string(),
                "Default\\Login Data".to_string(), // Datos de login (contraseÃ±as guardadas)
                "Cookies".to_string(),
                "Local Storage".to_string(),
            ],
        };

        for s_file in &session_files {
            let s_path = path.join(s_file);
            if s_path.exists() {
                session_size += get_dir_size(&s_path);
                session_paths.push(s_path.to_string_lossy().to_string());
            }
        }

        // Solo agregar si hay archivos de sesión reales detectados (nunca pasar la raíz del perfil)
        if !session_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_sessions", browser_id),
                &format!("Sesiones y Cookies de {}", name),
                session_size,
                session_paths,
                RiskLevel::Sensitive,
                &format!("Cookies, sesiones de usuario abiertas, contraseñas cifradas y tokens de autenticación en {}.", name),
                "Eliminar este elemento cerrará tus sesiones activas en páginas web (correo, redes sociales) y requerirá que vuelvas a introducir tus contraseñas.",
                "ADVERTENCIA: Cerrará tus sesiones activas.",
                "browser_session"
            ));
        }
    }

    items
}
