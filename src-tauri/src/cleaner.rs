use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::safety;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CleanupStatus {
    Completed,
    Partial,
    Failed,
    NoOp,
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanupPathResult {
    pub path: String,
    pub bytes_freed: u64,
    pub status: CleanupStatus,
    pub issues: Vec<String>,
}

#[derive(Default)]
struct TraversalReport {
    bytes_freed: u64,
    skipped: usize,
    errors: Vec<String>,
}

impl TraversalReport {
    fn absorb(&mut self, other: TraversalReport) {
        self.bytes_freed += other.bytes_freed;
        self.skipped += other.skipped;
        self.errors.extend(other.errors);
    }

    fn into_path_result(self, path: String) -> CleanupPathResult {
        let status = if !self.errors.is_empty() || self.skipped > 0 {
            CleanupStatus::Partial
        } else if self.bytes_freed > 0 {
            CleanupStatus::Completed
        } else {
            CleanupStatus::NoOp
        };

        let mut issues = self.errors;
        if self.skipped > 0 {
            issues.push(format!(
                "{} entrada(s) fueron omitidas por las protecciones de seguridad de Purgio.",
                self.skipped
            ));
        }

        CleanupPathResult {
            path,
            bytes_freed: self.bytes_freed,
            status,
            issues,
        }
    }
}

/// Ejecuta una limpieza sobre un target ya autorizado por el catálogo de Rust y
/// devuelve un resultado estructurado. La ruta visible en el resultado siempre es
/// la ruta reconstruida por el backend, nunca una ruta suministrada por React.
pub fn clean_path_with_report(path_str: &str, _is_sensitive: bool) -> CleanupPathResult {
    let validated_path = match safety::validate_cleanup_target(path_str) {
        Ok(path) => path,
        Err(error) => {
            return CleanupPathResult {
                path: path_str.to_string(),
                bytes_freed: 0,
                status: CleanupStatus::Failed,
                issues: vec![error],
            };
        }
    };

    if !validated_path.exists() {
        return CleanupPathResult {
            path: path_str.to_string(),
            bytes_freed: 0,
            status: CleanupStatus::NoOp,
            issues: Vec::new(),
        };
    }

    let metadata = match fs::symlink_metadata(&validated_path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return CleanupPathResult {
                path: path_str.to_string(),
                bytes_freed: 0,
                status: CleanupStatus::Failed,
                issues: vec![format!("No se pudo leer el target autorizado: {error}")],
            };
        }
    };

    if safety::metadata_is_reparse_point(&metadata) {
        return CleanupPathResult {
            path: path_str.to_string(),
            bytes_freed: 0,
            status: CleanupStatus::Failed,
            issues: vec!["Acción bloqueada: el target es un reparse point o junction.".to_string()],
        };
    }

    if metadata.file_type().is_symlink() {
        return CleanupPathResult {
            path: path_str.to_string(),
            bytes_freed: 0,
            status: CleanupStatus::Failed,
            issues: vec!["Acción bloqueada: el target es un enlace simbólico.".to_string()],
        };
    }

    if metadata.is_file() {
        let size = metadata.len();
        return match fs::remove_file(&validated_path) {
            Ok(()) => CleanupPathResult {
                path: path_str.to_string(),
                bytes_freed: size,
                status: CleanupStatus::Completed,
                issues: Vec::new(),
            },
            Err(error) => CleanupPathResult {
                path: path_str.to_string(),
                bytes_freed: 0,
                status: CleanupStatus::Failed,
                issues: vec![format!("No se pudo eliminar el archivo autorizado: {error}")],
            },
        };
    }

    if metadata.is_dir() {
        return clean_directory(&validated_path, false).into_path_result(path_str.to_string());
    }

    CleanupPathResult {
        path: path_str.to_string(),
        bytes_freed: 0,
        status: CleanupStatus::NoOp,
        issues: Vec::new(),
    }
}

/// Limpia el contenido de un directorio sin seguir reparse points ni symlinks.
/// `remove_root` solo se usa para directorios internos descubiertos durante el
/// recorrido; la carpeta raíz autorizada por el catálogo se conserva.
fn clean_directory(path: &Path, remove_root: bool) -> TraversalReport {
    let mut report = TraversalReport::default();
    let path_str = path.to_string_lossy().to_string();

    if safety::is_path_critical(&path_str) {
        report.skipped += 1;
        return report;
    }

    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => {
            report
                .errors
                .push(format!("No se pudo inspeccionar un directorio autorizado: {error}"));
            return report;
        }
    };

    if safety::metadata_is_reparse_point(&metadata) {
        report.skipped += 1;
        return report;
    }

    if metadata.file_type().is_symlink() {
        #[cfg(target_os = "windows")]
        {
            report.skipped += 1;
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Err(error) = fs::remove_file(path) {
                report
                    .errors
                    .push(format!("No se pudo retirar un enlace simbólico: {error}"));
            }
        }
        return report;
    }

    let canonical = match fs::canonicalize(path) {
        Ok(canonical) => canonical,
        Err(error) => {
            report
                .errors
                .push(format!("No se pudo canonicalizar un directorio autorizado: {error}"));
            return report;
        }
    };

    if safety::is_path_critical(&canonical.to_string_lossy()) {
        report.skipped += 1;
        return report;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            report
                .errors
                .push(format!("No se pudo leer un directorio autorizado: {error}"));
            return report;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                report
                    .errors
                    .push(format!("No se pudo leer una entrada del directorio: {error}"));
                continue;
            }
        };

        let entry_path = entry.path();
        let entry_path_str = entry_path.to_string_lossy().to_string();

        if safety::is_path_critical(&entry_path_str) {
            report.skipped += 1;
            continue;
        }

        let entry_metadata = match fs::symlink_metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(error) => {
                report
                    .errors
                    .push(format!("No se pudo inspeccionar una entrada autorizada: {error}"));
                continue;
            }
        };

        if safety::metadata_is_reparse_point(&entry_metadata) {
            report.skipped += 1;
            continue;
        }

        if entry_metadata.file_type().is_symlink() {
            #[cfg(target_os = "windows")]
            {
                report.skipped += 1;
            }

            #[cfg(not(target_os = "windows"))]
            {
                if let Err(error) = fs::remove_file(&entry_path) {
                    report
                        .errors
                        .push(format!("No se pudo retirar un enlace simbólico: {error}"));
                }
            }
            continue;
        }

        if entry_metadata.is_file() {
            let size = entry_metadata.len();
            match fs::remove_file(&entry_path) {
                Ok(()) => report.bytes_freed += size,
                Err(error) => report
                    .errors
                    .push(format!("No se pudo eliminar un archivo autorizado: {error}")),
            }
        } else if entry_metadata.is_dir() {
            report.absorb(clean_directory(&entry_path, true));
        }
    }

    if remove_root && report.skipped == 0 && report.errors.is_empty() {
        if let Err(error) = fs::remove_dir(path) {
            report
                .errors
                .push(format!("No se pudo retirar un directorio ya vacío: {error}"));
        }
    }

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traversal_report_marks_security_skips_as_partial() {
        let report = TraversalReport {
            bytes_freed: 1024,
            skipped: 1,
            errors: Vec::new(),
        }
        .into_path_result("/authorized".to_string());

        assert_eq!(report.status, CleanupStatus::Partial);
        assert_eq!(report.bytes_freed, 1024);
        assert_eq!(report.issues.len(), 1);
    }

    #[test]
    fn empty_successful_traversal_is_no_op() {
        let report = TraversalReport::default().into_path_result("/authorized".to_string());
        assert_eq!(report.status, CleanupStatus::NoOp);
    }
}
