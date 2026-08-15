from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


path = Path('src-tauri/src/scanner.rs')
text = path.read_text()

# Replace scanner size traversal with symlink/reparse-aware traversal matching cleaner safety skips.
start = text.index('pub fn get_dir_size<P: AsRef<Path>>(path: P) -> u64 {')
end = text.index('/// Obtiene los directorios de usuario de navegadores según la plataforma', start)
new_size = r'''pub fn get_dir_size<P: AsRef<Path>>(path: P) -> u64 {
    const MAX_SCAN_DEPTH: usize = 5;

    fn entry_size(path: &Path, current_depth: usize) -> u64 {
        if current_depth > MAX_SCAN_DEPTH {
            return 0;
        }

        let path_str = path.to_string_lossy();
        if safety::is_path_critical(&path_str) {
            return 0;
        }

        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => return 0,
        };

        if safety::metadata_is_reparse_point(&metadata) || metadata.file_type().is_symlink() {
            return 0;
        }

        if metadata.is_file() {
            return metadata.len();
        }

        if !metadata.is_dir() {
            return 0;
        }

        fs::read_dir(path)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry_size(&entry.path(), current_depth + 1))
                    .sum()
            })
            .unwrap_or(0)
    }

    entry_size(path.as_ref(), 0)
}

#[cfg(target_os = "windows")]
fn is_windows_thumbnail_cache_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("thumbcache_") && lower.ends_with(".db")
}

'''
text = text[:start] + new_size + text[end:]

# System temp remains available but no longer auto-selected: direct system-folder cleanup is Review.
system_temp_old = r'''                RiskLevel::Safe,
                "Archivos temporales generados por el sistema operativo y servicios en segundo plano.",
                "Se eliminarán archivos innecesarios de instalación y logs del sistema viejo.",
                "Seguro de eliminar.",
                "temp",
'''
system_temp_new = r'''                RiskLevel::Review,
                "Archivos temporales generados por Windows y servicios en segundo plano dentro de C:\\Windows\\Temp.",
                "Purgio intentará eliminar únicamente entradas que superen las protecciones de rutas críticas, symlinks y reparse points. Archivos en uso pueden conservarse.",
                "Revisar antes de eliminar; no se selecciona automáticamente.",
                "temp",
'''
text = replace_once(text, system_temp_old, system_temp_new, 'system temp risk')

# Thumbnail cache: estimate and authorization now reference the exact same files.
thumb_start = text.index('        // Caché de miniaturas')
thumb_end = text.index('        // Windows Error Reporting', thumb_start)
thumb_block = r'''        // Caché de miniaturas: autorizar exactamente los mismos archivos que se contabilizan.
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let explorer_cache = PathBuf::from(&local_appdata).join("Microsoft\\Windows\\Explorer");
            if explorer_cache.exists() {
                let mut size = 0;
                let mut thumb_paths = Vec::new();

                if let Ok(entries) = fs::read_dir(&explorer_cache) {
                    for entry in entries.flatten() {
                        let entry_path = entry.path();
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !is_windows_thumbnail_cache_file(&name) {
                            continue;
                        }

                        let metadata = match fs::symlink_metadata(&entry_path) {
                            Ok(metadata) => metadata,
                            Err(_) => continue,
                        };

                        if safety::metadata_is_reparse_point(&metadata)
                            || metadata.file_type().is_symlink()
                            || !metadata.is_file()
                        {
                            continue;
                        }

                        let entry_path_string = entry_path.to_string_lossy().to_string();
                        if safety::is_path_critical(&entry_path_string) {
                            continue;
                        }

                        size += metadata.len();
                        thumb_paths.push(entry_path_string);
                    }
                }

                thumb_paths.sort();
                thumb_paths.dedup();

                if !thumb_paths.is_empty() {
                    items.push(CleanableItem::new(
                        "win_thumb_cache",
                        "Caché de Miniaturas",
                        size,
                        thumb_paths,
                        RiskLevel::Safe,
                        "Bases de datos thumbcache_*.db que Windows Explorer usa para acelerar vistas previas.",
                        "Solo se eliminarán las bases de miniaturas mostradas en el Cleanup Plan. Windows puede regenerarlas cuando vuelvas a explorar carpetas.",
                        "Seguro de eliminar; las miniaturas se reconstruyen bajo demanda.",
                        "cache",
                    ));
                }
            }
        }

'''
text = text[:thumb_start] + thumb_block + text[thumb_end:]

# Replace raw Windows Update + whole Windows Logs targets with a documented, bounded DirectX cache.
unsafe_start = text.index('        // Windows Update Cache')
unsafe_end = text.index('    #[cfg(target_os = "macos")]', unsafe_start)
replacement = r'''        // DirectX Shader Cache. Microsoft documenta las cachés D3D12 por defecto como
        // almacenamiento temporal que puede ser limpiado por Disk Cleanup.
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let d3d_cache = PathBuf::from(local_appdata).join("D3DSCache");
            if d3d_cache.exists() {
                let size = get_dir_size(&d3d_cache);
                if size > 0 {
                    items.push(CleanableItem::new(
                        "win_directx_shader_cache",
                        "Caché de Shaders de DirectX",
                        size,
                        vec![d3d_cache.to_string_lossy().to_string()],
                        RiskLevel::Safe,
                        "Shaders compilados almacenados temporalmente por DirectX para reducir trabajo repetido de la GPU.",
                        "Se liberará el almacenamiento temporal detectado. Juegos y aplicaciones pueden recompilar shaders cuando vuelvan a ejecutarse.",
                        "Seguro de eliminar; Windows y las aplicaciones recrean la caché cuando es necesaria.",
                        "cache",
                    ));
                }
            }
        }
    }

'''
text = text[:unsafe_start] + replacement + text[unsafe_end:]

# Add Windows-only unit coverage at end of scanner module.
if 'thumbnail_cache_filename_filter_is_exact' not in text:
    text += r'''

#[cfg(all(test, target_os = "windows"))]
mod windows_tests {
    use super::*;

    #[test]
    fn thumbnail_cache_filename_filter_is_exact() {
        assert!(is_windows_thumbnail_cache_file("thumbcache_96.db"));
        assert!(is_windows_thumbnail_cache_file("THUMBCACHE_1024.DB"));
        assert!(!is_windows_thumbnail_cache_file("iconcache_96.db"));
        assert!(!is_windows_thumbnail_cache_file("thumbcache_96.db.bak"));
        assert!(!is_windows_thumbnail_cache_file("thumbcache.db"));
    }
}
'''

path.write_text(text)
