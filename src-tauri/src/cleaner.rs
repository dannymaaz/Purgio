use std::fs;
use std::path::Path;
use crate::safety;

/// Elimina de forma segura el contenido de un archivo o directorio.
/// Si es un directorio, limpia los elementos que contiene de forma recursiva
/// sin eliminar la carpeta raíz en sí, para evitar problemas con directorios del sistema.
pub fn clean_path_safely(path_str: &str, _is_sensitive: bool) -> Result<u64, String> {
    // Comprobar estrictamente si el path es crítico
    if safety::is_path_critical(path_str) {
        return Err(format!("Acción bloqueada: {} es una ruta crítica del sistema operativo.", path_str));
    }

    let path = Path::new(path_str);
    if !path.exists() {
        return Ok(0);
    }

    let mut bytes_freed = 0;

    if path.is_file() {
        if let Ok(metadata) = fs::metadata(path) {
            let size = metadata.len();
            if let Ok(()) = fs::remove_file(path) {
                bytes_freed += size;
            } else {
                return Err(format!("No se pudo eliminar el archivo. Puede que esté en uso: {}", path_str));
            }
        }
    } else if path.is_dir() {
        // Para carpetas del sistema (como TEMP o Papelera), vaciar el contenido interior, no borrar la raíz
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let entry_path_str = entry_path.to_string_lossy().to_string();
                
                // Doble chequeo de seguridad por elemento interno
                if safety::is_path_critical(&entry_path_str) {
                    continue;
                }

                if entry_path.is_file() {
                    if let Ok(metadata) = fs::metadata(&entry_path) {
                        let size = metadata.len();
                        if fs::remove_file(&entry_path).is_ok() {
                            bytes_freed += size;
                        }
                    }
                } else if entry_path.is_dir() {
                    // Borrar directorios internos recursivamente
                    bytes_freed += remove_dir_recursive_safely(&entry_path);
                }
            }
        }
    }

    Ok(bytes_freed)
}

/// Helper recursivo que borra un directorio y calcula su tamaño liberado
fn remove_dir_recursive_safely(path: &Path) -> u64 {
    let mut bytes_freed = 0;
    
    // Evitar enlaces simbólicos
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            let _ = fs::remove_file(path);
            return 0;
        }
    }

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let sub_path = entry.path();
            if sub_path.is_file() {
                if let Ok(meta) = fs::metadata(&sub_path) {
                    let size = meta.len();
                    if fs::remove_file(&sub_path).is_ok() {
                        bytes_freed += size;
                    }
                }
            } else if sub_path.is_dir() {
                bytes_freed += remove_dir_recursive_safely(&sub_path);
            }
        }
    }
    
    // Intentar eliminar la carpeta vacía al final
    let _ = fs::remove_dir(path);
    bytes_freed
}
