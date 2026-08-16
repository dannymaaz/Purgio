from pathlib import Path

scanner_path = Path('src-tauri/src/scanner.rs')
scanner = scanner_path.read_text()
start = scanner.index('/// Escanea los navegadores y sus datos')
end = scanner.index('#[cfg(all(test, target_os = "windows"))]', start)

replacement = r'''fn browser_path_is_safe(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    if safety::is_path_critical(&path_str) || safety::has_windows_reparse_ancestor(path) {
        return false;
    }

    for ancestor in path.ancestors().skip(1) {
        if let Ok(metadata) = fs::symlink_metadata(ancestor) {
            if metadata.file_type().is_symlink() || safety::metadata_is_reparse_point(&metadata) {
                return false;
            }
        }
    }

    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };

    !metadata.file_type().is_symlink() && !safety::metadata_is_reparse_point(&metadata)
}

fn browser_file_size(path: &Path) -> Option<u64> {
    if !browser_path_is_safe(path) {
        return None;
    }

    let metadata = fs::symlink_metadata(path).ok()?;
    metadata.is_file().then_some(metadata.len())
}

fn collect_browser_path(path: &Path, paths: &mut Vec<String>, size: &mut u64) {
    if !browser_path_is_safe(path) {
        return;
    }

    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return,
    };

    let measured = if metadata.is_file() {
        metadata.len()
    } else if metadata.is_dir() {
        get_dir_size(path)
    } else {
        0
    };

    if measured == 0 {
        return;
    }

    *size += measured;
    paths.push(path.to_string_lossy().to_string());
}

fn is_chromium_profile_name(name: &str) -> bool {
    name == "Default"
        || name
            .strip_prefix("Profile ")
            .map(|suffix| !suffix.is_empty() && suffix.chars().all(|ch| ch.is_ascii_digit()))
            .unwrap_or(false)
}

fn looks_like_firefox_profile(path: &Path) -> bool {
    [
        "prefs.js",
        "places.sqlite",
        "cookies.sqlite",
        "sessionstore.jsonlz4",
        "storage",
    ]
    .iter()
    .any(|marker| path.join(marker).exists())
}

fn looks_like_chromium_profile(path: &Path) -> bool {
    ["Preferences", "History", "Network", "Cache", "Code Cache"]
        .iter()
        .any(|marker| path.join(marker).exists())
}

fn discover_browser_profiles(name: &str, root: &Path) -> Vec<PathBuf> {
    if !root.exists() || !browser_path_is_safe(root) {
        return Vec::new();
    }

    if name == "Safari" {
        return vec![root.to_path_buf()];
    }

    let mut profiles = Vec::new();

    if name == "Firefox" {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                if browser_path_is_safe(&candidate)
                    && candidate.is_dir()
                    && looks_like_firefox_profile(&candidate)
                {
                    profiles.push(candidate);
                }
            }
        }
    } else {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                let entry_name = entry.file_name().to_string_lossy().to_string();
                if is_chromium_profile_name(&entry_name)
                    && browser_path_is_safe(&candidate)
                    && candidate.is_dir()
                {
                    profiles.push(candidate);
                }
            }
        }

        // Opera and similar Chromium-based layouts can expose the profile root directly.
        if profiles.is_empty() && looks_like_chromium_profile(root) {
            profiles.push(root.to_path_buf());
        }
    }

    profiles.sort();
    profiles.dedup();
    profiles
}

fn is_incomplete_browser_download(name: &str, browser: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    match browser {
        "Firefox" => lower.ends_with(".part"),
        "Safari" => false,
        _ => lower.ends_with(".crdownload"),
    }
}

/// Escanea los navegadores por perfil y separa cache regenerable de datos persistentes/sensibles.
pub fn scan_browser_files() -> Vec<CleanableItem> {
    let mut items = Vec::new();

    for (name, root) in get_browser_paths() {
        let profiles = discover_browser_profiles(&name, &root);
        if profiles.is_empty() {
            continue;
        }

        let browser_id = name.to_lowercase().replace(' ', "_");

        // 1. Cache regenerable (SAFE). Local Storage / File System / IndexedDB are excluded.
        let mut cache_size = 0u64;
        let mut cache_paths = Vec::new();
        for profile in &profiles {
            let cache_dirs = match name.as_str() {
                "Firefox" => vec![profile.join("cache2")],
                "Safari" => Vec::new(),
                _ => vec![
                    profile.join("Cache"),
                    profile.join("Code Cache"),
                    profile.join("GPUCache"),
                ],
            };

            for cache_dir in cache_dirs {
                collect_browser_path(&cache_dir, &mut cache_paths, &mut cache_size);
            }
        }
        cache_paths.sort();
        cache_paths.dedup();

        if !cache_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_cache", browser_id),
                &format!("Caché de {}", name),
                cache_size,
                cache_paths,
                RiskLevel::Safe,
                &format!("Archivos temporales e imágenes cacheadas de páginas web en {}.", name),
                "El navegador puede regenerar estas cachés. Ciérralo antes de limpiar para evitar archivos bloqueados o recreados durante la operación.",
                "Seguro de eliminar; cerrar el navegador mejora la limpieza.",
                "browser_cache",
            ));
        }

        // 2. Historial (REVIEW), siempre por archivo exacto dentro de cada perfil.
        let mut history_size = 0u64;
        let mut history_paths = Vec::new();
        for profile in &profiles {
            let history_path = match name.as_str() {
                "Firefox" => profile.join("places.sqlite"),
                "Safari" => profile.join("History.db"),
                _ => profile.join("History"),
            };

            if let Some(size) = browser_file_size(&history_path) {
                history_size += size;
                history_paths.push(history_path.to_string_lossy().to_string());
            }
        }
        history_paths.sort();
        history_paths.dedup();

        if !history_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_history", browser_id),
                &format!("Historial de navegación de {}", name),
                history_size,
                history_paths,
                RiskLevel::Review,
                &format!("Listado de sitios web visitados en {} recientemente.", name),
                "Se eliminarán únicamente los archivos de historial mostrados en el Cleanup Plan. Cierra el navegador antes de ejecutar esta acción.",
                "Requiere confirmación; perderás historial y autocompletado basado en visitas previas.",
                "browser_history",
            ));
        }

        // 3. Descargas incompletas: solo artefactos de archivo verificables.
        let mut artifact_size = 0u64;
        let mut artifact_paths = Vec::new();
        for profile in &profiles {
            if let Ok(entries) = fs::read_dir(profile) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    let entry_name = entry.file_name().to_string_lossy().to_string();
                    if !is_incomplete_browser_download(&entry_name, &name) {
                        continue;
                    }

                    if let Some(size) = browser_file_size(&entry_path) {
                        artifact_size += size;
                        artifact_paths.push(entry_path.to_string_lossy().to_string());
                    }
                }
            }
        }
        artifact_paths.sort();
        artifact_paths.dedup();

        if !artifact_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_download_artifacts", browser_id),
                &format!("Descargas Incompletas de {}", name),
                artifact_size,
                artifact_paths,
                RiskLevel::Safe,
                &format!("Archivos de descarga que se interrumpieron en {} y conservan una extensión temporal de descarga incompleta.", name),
                "Se eliminarán únicamente los archivos .crdownload o .part mostrados en el Cleanup Plan. No se incluye almacenamiento offline de sitios.",
                "Seguro de eliminar si no deseas reanudar esas descargas.",
                "browser_download_artifacts",
            ));
        }

        // 4. Cookies y estado de sesión (SENSITIVE). Passwords/site data live elsewhere.
        let mut session_size = 0u64;
        let mut session_paths = Vec::new();
        for profile in &profiles {
            let session_candidates = match name.as_str() {
                "Firefox" => vec![
                    profile.join("cookies.sqlite"),
                    profile.join("sessionstore.jsonlz4"),
                    profile.join("sessionstore-backups"),
                ],
                "Safari" => Vec::new(),
                _ => vec![
                    profile.join("Cookies"),
                    profile.join("Network").join("Cookies"),
                    profile.join("Current Session"),
                    profile.join("Current Tabs"),
                    profile.join("Sessions"),
                ],
            };

            for candidate in session_candidates {
                collect_browser_path(&candidate, &mut session_paths, &mut session_size);
            }
        }
        session_paths.sort();
        session_paths.dedup();

        if !session_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_sessions", browser_id),
                &format!("Sesiones y Cookies de {}", name),
                session_size,
                session_paths,
                RiskLevel::Sensitive,
                &format!("Cookies, sesiones abiertas y tokens de autenticación almacenados por {}.", name),
                "Eliminar estos datos puede cerrar sesiones activas y descartar pestañas restaurables. Cierra el navegador antes de continuar.",
                "Sensible: requiere confirmación explícita.",
                "browser_session",
            ));
        }

        // 5. Credenciales guardadas (SENSITIVE), separadas de cookies/cache.
        let mut credential_size = 0u64;
        let mut credential_paths = Vec::new();
        for profile in &profiles {
            let credential_candidates = match name.as_str() {
                "Firefox" => vec![profile.join("logins.json"), profile.join("key4.db")],
                "Safari" => Vec::new(),
                _ => vec![profile.join("Login Data"), profile.join("Login Data For Account")],
            };

            for candidate in credential_candidates {
                if let Some(size) = browser_file_size(&candidate) {
                    credential_size += size;
                    credential_paths.push(candidate.to_string_lossy().to_string());
                }
            }
        }
        credential_paths.sort();
        credential_paths.dedup();

        if !credential_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_credentials", browser_id),
                &format!("Credenciales guardadas de {}", name),
                credential_size,
                credential_paths,
                RiskLevel::Sensitive,
                "Archivos que almacenan contraseñas y material criptográfico usado para proteger credenciales guardadas.",
                "Eliminar estos archivos puede hacer que pierdas contraseñas guardadas en el perfil del navegador.",
                "Sensible: no eliminar salvo que quieras borrar credenciales guardadas.",
                "browser_credentials",
            ));
        }

        // 6. Datos persistentes/offline de sitios (SENSITIVE), nunca cache Safe.
        let mut site_data_size = 0u64;
        let mut site_data_paths = Vec::new();
        for profile in &profiles {
            let site_data_candidates = match name.as_str() {
                "Firefox" => vec![profile.join("webappsstore.sqlite"), profile.join("storage")],
                "Safari" => vec![profile.join("LocalStorage")],
                _ => vec![
                    profile.join("Local Storage"),
                    profile.join("IndexedDB"),
                    profile.join("File System"),
                    profile.join("Service Worker"),
                ],
            };

            for candidate in site_data_candidates {
                collect_browser_path(&candidate, &mut site_data_paths, &mut site_data_size);
            }
        }
        site_data_paths.sort();
        site_data_paths.dedup();

        if !site_data_paths.is_empty() {
            items.push(CleanableItem::new(
                &format!("{}_site_data", browser_id),
                &format!("Datos de sitios de {}", name),
                site_data_size,
                site_data_paths,
                RiskLevel::Sensitive,
                "Almacenamiento persistente y offline de sitios web, aplicaciones web y service workers.",
                "Eliminar estos datos puede cerrar sesiones, borrar estado local de aplicaciones web o eliminar contenido disponible sin conexión.",
                "Sensible: revisar rutas y consecuencias antes de eliminar.",
                "browser_site_data",
            ));
        }
    }

    items
}

#[cfg(test)]
mod browser_tests {
    use super::*;

    #[test]
    fn chromium_profile_name_filter_is_conservative() {
        assert!(is_chromium_profile_name("Default"));
        assert!(is_chromium_profile_name("Profile 1"));
        assert!(is_chromium_profile_name("Profile 25"));
        assert!(!is_chromium_profile_name("System Profile"));
        assert!(!is_chromium_profile_name("Guest Profile"));
        assert!(!is_chromium_profile_name("Profile abc"));
    }

    #[test]
    fn incomplete_download_filter_is_extension_scoped() {
        assert!(is_incomplete_browser_download("video.crdownload", "Chrome"));
        assert!(is_incomplete_browser_download("archive.PART", "Firefox"));
        assert!(!is_incomplete_browser_download("video.mp4", "Chrome"));
        assert!(!is_incomplete_browser_download("File System", "Chrome"));
        assert!(!is_incomplete_browser_download("download.part", "Safari"));
    }
}

'''

scanner = scanner[:start] + replacement + scanner[end:]
scanner_path.write_text(scanner)

# Update browser-specific English localization for the new split categories/messages.
i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()

anchor = "  'ADVERTENCIA: Cerrará tus sesiones activas.': 'WARNING: This will sign you out of active sessions.',\n"
if anchor not in i18n:
    raise SystemExit('Missing i18n browser metadata anchor')

additions = """  'El navegador puede regenerar estas cachés. Ciérralo antes de limpiar para evitar archivos bloqueados o recreados durante la operación.': 'The browser can rebuild these caches. Close it before cleaning to avoid locked files or data recreated during the operation.',
  'Seguro de eliminar; cerrar el navegador mejora la limpieza.': 'Safe to remove; closing the browser improves cleanup completeness.',
  'Se eliminarán únicamente los archivos de historial mostrados en el Cleanup Plan. Cierra el navegador antes de ejecutar esta acción.': 'Only the history files shown in the Cleanup Plan will be removed. Close the browser before running this action.',
  'Requiere confirmación; perderás historial y autocompletado basado en visitas previas.': 'Requires confirmation; you will lose browsing history and visit-based autocomplete.',
  'Se eliminarán únicamente los archivos .crdownload o .part mostrados en el Cleanup Plan. No se incluye almacenamiento offline de sitios.': 'Only the .crdownload or .part files shown in the Cleanup Plan will be removed. Offline site storage is not included.',
  'Seguro de eliminar si no deseas reanudar esas descargas.': 'Safe to remove if you do not want to resume those downloads.',
  'Eliminar estos datos puede cerrar sesiones activas y descartar pestañas restaurables. Cierra el navegador antes de continuar.': 'Removing this data may sign you out and discard restorable tabs. Close the browser before continuing.',
  'Sensible: requiere confirmación explícita.': 'Sensitive: requires explicit confirmation.',
  'Archivos que almacenan contraseñas y material criptográfico usado para proteger credenciales guardadas.': 'Files that store passwords and cryptographic material used to protect saved credentials.',
  'Eliminar estos archivos puede hacer que pierdas contraseñas guardadas en el perfil del navegador.': 'Removing these files may cause you to lose passwords saved in the browser profile.',
  'Sensible: no eliminar salvo que quieras borrar credenciales guardadas.': 'Sensitive: do not remove unless you intend to erase saved credentials.',
  'Almacenamiento persistente y offline de sitios web, aplicaciones web y service workers.': 'Persistent and offline storage used by websites, web apps, and service workers.',
  'Eliminar estos datos puede cerrar sesiones, borrar estado local de aplicaciones web o eliminar contenido disponible sin conexión.': 'Removing this data may sign you out, erase local web-app state, or remove content available offline.',
  'Sensible: revisar rutas y consecuencias antes de eliminar.': 'Sensitive: review paths and consequences before removing.',
"""
i18n = i18n.replace(anchor, anchor + additions, 1)

rule_anchor = "    [/^Sesiones y Cookies de (.+)$/, (m) => `${m[1]} Sessions and Cookies`],\n"
if rule_anchor not in i18n:
    raise SystemExit('Missing dynamic browser translation anchor')

new_rules = """    [/^Credenciales guardadas de (.+)$/, (m) => `${m[1]} Saved Credentials`],
    [/^Datos de sitios de (.+)$/, (m) => `${m[1]} Site Data`],
    [/^Archivos de descarga que se interrumpieron en (.+) y conservan una extensión temporal de descarga incompleta\.$/, (m) => `Downloads interrupted in ${m[1]} that still use a temporary incomplete-download extension.`],
    [/^Cookies, sesiones abiertas y tokens de autenticación almacenados por (.+)\.$/, (m) => `Cookies, open sessions, and authentication tokens stored by ${m[1]}.`],
"""
i18n = i18n.replace(rule_anchor, rule_anchor + new_rules, 1)

i18n_path.write_text(i18n)
