use std::fs;
use std::path::Path;

use crate::safety;

/// Elimina de forma segura el contenido de un archivo o directorio.
/// Si es un directorio, limpia los elementos que contiene de forma recursiva
/// sin eliminar la carpeta raíz en sí.
pub fn clean_path_safely(path_str: &str, _is_sensitive: bool) -> Result<u64, String> {
    let validated_path = safety::validate_cleanup_target(path_str)?;

    if !validated_path.exists() {
        return Ok(0);
    }

    let mut bytes_freed = 0;

    if validated_path.is_file() {
        let metadata = fs::symlink_metadata(&validated_path)
            .map_err(|e| format!("No se pudo leer el archivo {}: {}", path_str, e))?;

        if metadata.file_type().is_symlink() {
            return Err(format!("Acción bloqueada: el archivo es un enlace simbólico: {}", path_str));
        }

        let size = metadata.len();
        fs::remove_file(&validated_path)
            .map_err(|e| format!("No se pudo eliminar el archivo {}: {}", path_str, e))?;
        bytes_freed += size;
    } else if validated_path.is_dir() {
        let entries = fs::read_dir(&validated_path)
            .map_err(|e| format!("No se pudo leer el directorio {}: {}", path_str, e))?;

        for entry in entries.flatten() {
            let entry_path = entry.path();
            let entry_path_str = entry_path.to_string_lossy().to_string();

            if safety::is_path_critical(&entry_path_str) {
                continue;
            }

            let metadata = match fs::symlink_metadata(&entry_path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            // Nunca seguir enlaces simbólicos dentro de una carpeta limpiable.
            // Se elimina únicamente el enlace en sí, no su destino.
            if metadata.file_type().is_symlink() {
                let _ = if metadata.is_dir() {
                    fs::remove_dir(&entry_path)
                } else {
                    fs::remove_file(&entry_path)
                };
                continue;
            }

            if entry_path.is_file() {
                let size = metadata.len();
                if fs::remove_file(&entry_path).is_ok() {
                    bytes_freed += size;
                }
            } else if entry_path.is_dir() {
                bytes_freed += remove_dir_recursive_safely(&entry_path);
            }
        }
    }

    Ok(bytes_freed)
}

/// Helper recursivo que borra un directorio interno y calcula el tamaño liberado.
/// Las rutas críticas y enlaces simbólicos se bloquean en cada nivel del árbol.
fn remove_dir_recursive_safely(path: &Path) -> u64 {
    let path_str = path.to_string_lossy().to_string();
    if safety::is_path_critical(&path_str) {
        return 0;
    }

    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return 0,
    };

    if metadata.file_type().is_symlink() {
        let _ = if metadata.is_dir() {
            fs::remove_dir(path)
        } else {
            fs::remove_file(path)
        };
        return 0;
    }

    // Vuelve a comprobar la ruta canonicalizada para evitar escapes mediante
    // componentes especiales o targets que hayan cambiado entre escaneo y borrado.
    let canonical = match fs::canonicalize(path) {
        Ok(canonical) => canonical,
        Err(_) => return 0,
    };
    if safety::is_path_critical(&canonical.to_string_lossy()) {
        return 0;
    }

    let mut bytes_freed = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let sub_path = entry.path();
            let sub_path_str = sub_path.to_string_lossy().to_string();

            if safety::is_path_critical(&sub_path_str) {
                continue;
            }

            let sub_metadata = match fs::symlink_metadata(&sub_path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            if sub_metadata.file_type().is_symlink() {
                let _ = if sub_metadata.is_dir() {
                    fs::remove_dir(&sub_path)
                } else {
                    fs::remove_file(&sub_path)
                };
                continue;
            }

            if sub_path.is_file() {
                let size = sub_metadata.len();
                if fs::remove_file(&sub_path).is_ok() {
                    bytes_freed += size;
                }
            } else if sub_path.is_dir() {
                bytes_freed += remove_dir_recursive_safely(&sub_path);
            }
        }
    }

    let _ = fs::remove_dir(path);
    bytes_freed
}
