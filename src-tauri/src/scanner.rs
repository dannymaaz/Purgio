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
    pub path: String,
    pub risk_level: RiskLevel,
    pub description: String,
    pub impact: String,
    pub recommended_action: String,
    pub selected: bool,
    pub category: String,
}

// Implementación auxiliar para convertir tipos de String más limpios
impl CleanableItem {
    pub fn new(
        id: &str,
        name: &str,
        size: u64,
        path: &str,
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
            path: path.to_string(),
            risk_level,
            description: description.to_string(),
            impact: impact.to_string(),
            recommended_action: recommended_action.to_string(),
            selected: matches!(risk_level, RiskLevel::Safe), // Seleccionado por defecto si es seguro
            category: category.to_string(),
        }
    }
}

/// Helper para calcular el tamaño de un directorio de forma segura e incremental (evitando bucles infinitos y recursión profunda)
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
                        // Evitar seguir enlaces simbólicos para no entrar en bucles
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

/// Obtiene los directorios de usuario de navegadores según la plataforma
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

/// Escanea los archivos seguros y de revisión del sistema operativo
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
                    &temp,
                    RiskLevel::Safe,
                    "Archivos creados por aplicaciones para almacenar información temporalmente.",
                    "El espacio se liberará de inmediato. Las aplicaciones podrían tardar una fracción de segundo más en recrear archivos temporales la próxima vez que se abran.",
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
                system_temp,
                RiskLevel::Safe,
                "Archivos temporales generados por el sistema operativo y servicios en segundo plano.",
                "Se eliminarán archivos innecesarios de instalación y logs del sistema viejo.",
                "Seguro de eliminar.",
                "temp"
            ));
        }

        // Caché de miniaturas
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
                    "Caché de Miniaturas",
                    size,
                    explorer_cache.to_str().unwrap_or(""),
                    RiskLevel::Safe,
                    "Vistas previas de imágenes y videos creadas por el explorador de archivos para mostrarlas rápido.",
                    "El sistema tardará unos segundos en regenerar las miniaturas de tus carpetas cuando vuelvas a entrar a ellas.",
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
                    wer_path.to_str().unwrap_or(""),
                    RiskLevel::Safe,
                    "Informes creados automáticamente tras caídas de programas para enviar a Microsoft.",
                    "Se borrarán volcados de memoria y logs de errores antiguos. No afecta al funcionamiento de los programas.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }
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
                    "Caché de Usuario",
                    size,
                    caches.to_str().unwrap_or(""),
                    RiskLevel::Safe,
                    "Archivos temporales de aplicaciones macOS para agilizar tiempos de carga.",
                    "El espacio se recuperará de inmediato. Las apps reconstruirán sus cachés según sea necesario.",
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
                    "Archivos de registro de diagnósticos de software del usuario.",
                    "No afecta el sistema, solo elimina reportes de auditoría de errores antiguos.",
                    "Seguro de eliminar.",
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
                    "Caché de Usuario Linux",
                    size,
                    cache_path.to_str().unwrap_or(""),
                    RiskLevel::Safe,
                    "Caché de aplicaciones locales y miniaturas en la carpeta home.",
                    "El espacio se liberará inmediatamente. Se regenerarán los archivos necesarios automáticamente.",
                    "Seguro de eliminar.",
                    "cache"
                ));
            }
        }
    }

    // 2. Papelera de reciclaje
    // Para simplificar, en Windows simularemos o usaremos comandos para vaciarla, pero podemos comprobar el tamaño del directorio $Recycle.Bin.
    // Para evitar problemas de permisos leyendo $Recycle.Bin directamente, intentaremos leerlo pero si falla pondremos un tamaño mínimo simulado o 0.
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
            recycle_bin,
            RiskLevel::Safe,
            "Contiene archivos que has eliminado pero que aún permanecen en el disco por si deseas restaurarlos.",
            "Los archivos eliminados se borrarán de forma definitiva y no se podrán recuperar con facilidad.",
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
                trash_path.to_str().unwrap_or(""),
                RiskLevel::Safe,
                "Archivos borrados temporalmente.",
                "Se borrarán permanentemente del sistema.",
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
                trash_path.to_str().unwrap_or(""),
                RiskLevel::Safe,
                "Archivos borrados temporalmente.",
                "Se vaciará la papelera de escritorio del usuario de forma irreversible.",
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
                downloads.to_str().unwrap_or(""),
                RiskLevel::Review,
                "Contiene archivos descargados de Internet, instaladores (.exe, .dmg, .pkg, .deb), PDFs, etc.",
                "Se eliminarán todos los archivos guardados en la carpeta Descargas. Podrías perder información que no hayas respaldado en otras carpetas.",
                "Requiere confirmación explícita del usuario.",
                "temp"
            ));
        }
    }

    items
}

/// Escanea los navegadores y sus datos (caché y sesiones/cookies sensibles)
pub fn scan_browser_files() -> Vec<CleanableItem> {
    let mut items = Vec::new();
    let browsers = get_browser_paths();

    for (name, path) in browsers {
        if !path.exists() {
            continue;
        }

        // ID amigable
        let browser_id = name.to_lowercase();

        // 1. Caché del navegador (SAFE)
        let cache_dirs = match name.as_str() {
            "Firefox" => vec![path.clone()], // Firefox tiene las cachés mezcladas en perfiles, pero usualmente hay carpetas "cache2"
            "Safari" => vec![path.join("Caches"), path.join("LocalStorage")],
            _ => vec![path.join("Default\\Cache"), path.join("Default\\Code Cache"), path.join("Cache")], // Chromium browsers
        };

        let mut cache_size = 0;
        for c_dir in &cache_dirs {
            if c_dir.exists() {
                cache_size += get_dir_size(c_dir);
            }
        }

        // Agregar Caché
        items.push(CleanableItem::new(
            &format!("{}_cache", browser_id),
            &format!("Caché de {}", name),
            cache_size,
            path.to_str().unwrap_or(""),
            RiskLevel::Safe,
            &format!("Archivos temporales e imágenes cacheadas de páginas web en {}.", name),
            "Las páginas web que visitas con frecuencia podrían tardar un poco más en cargar la primera vez, pero se optimiza el espacio.",
            "Seguro de eliminar.",
            "browser_cache"
        ));

        // 2. Historial de navegación (REVIEW)
        let mut history_size = 0;
        let history_files = match name.as_str() {
            "Firefox" => vec!["places.sqlite".to_string()],
            "Safari" => vec!["History.db".to_string()],
            _ => vec!["Default\\History".to_string(), "History".to_string()],
        };

        for h_file in &history_files {
            let h_path = path.join(h_file);
            if h_path.exists() {
                if let Ok(meta) = fs::metadata(&h_path) {
                    history_size += meta.len();
                }
            }
        }

        items.push(CleanableItem::new(
            &format!("{}_history", browser_id),
            &format!("Historial de navegación de {}", name),
            history_size,
            path.to_str().unwrap_or(""),
            RiskLevel::Review,
            &format!("Listado de sitios web visitados en {} recientemente.", name),
            "Se borrará el historial de navegación. No podrás usar la función de autocompletado de URLs basada en tu historial.",
            "Requiere confirmación. Borra tu rastro de navegación.",
            "browser_history"
        ));

        // 3. Sesiones activas, Cookies, Tokens y Datos de Formularios (SENSITIVE)
        let mut session_size = 0;
        let session_files = match name.as_str() {
            "Firefox" => vec!["cookies.sqlite".to_string(), "sessionstore.jsonlz4".to_string()],
            "Safari" => vec!["Cookies.binarycookies".to_string()],
            _ => vec![
                "Default\\Cookies".to_string(),
                "Default\\Network\\Cookies".to_string(),
                "Default\\Current Session".to_string(),
                "Default\\Current Tabs".to_string(),
                "Default\\Local Storage".to_string(),
                "Default\\Login Data".to_string(), // Datos de login (contraseñas guardadas)
                "Cookies".to_string(),
                "Local Storage".to_string(),
            ],
        };

        for s_file in &session_files {
            let s_path = path.join(s_file);
            if s_path.exists() {
                session_size += get_dir_size(&s_path);
            }
        }

        items.push(CleanableItem::new(
            &format!("{}_sessions", browser_id),
            &format!("Sesiones y Cookies de {}", name),
            session_size,
            path.to_str().unwrap_or(""),
            RiskLevel::Sensitive,
            &format!("Cookies, sesiones de usuario abiertas, contraseñas cifradas y tokens de autenticación en {}.", name),
            "Eliminar este elemento cerrará tus sesiones activas en páginas web (correo, redes sociales) y requerirá que vuelvas a introducir tus contraseñas.",
            "ADVERTENCIA: Cerrará tus sesiones activas.",
            "browser_session"
        ));
    }

    items
}
