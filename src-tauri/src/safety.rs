use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

#[cfg(target_os = "windows")]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Safe,
    Review,
    Sensitive,
    Critical,
}

/// Comprueba si una ruta pertenece a directorios que Purgio nunca debe borrar.
pub fn is_path_critical(path_str: &str) -> bool {
    let path_lower = path_str.to_lowercase();

    #[cfg(target_os = "windows")]
    {
        if path_lower.contains("system32")
            || path_lower.contains("syswow64")
            || path_lower.contains("windows\\winsxs")
            || path_lower.contains("c:\\windows\\system")
            || path_lower.contains("c:\\windows\\boot")
            || path_lower.contains("c:\\program files")
            || path_lower.contains("c:\\program files (x86)")
            || path_lower.contains("c:\\users\\all users")
        {
            return true;
        }

        if path_lower == "c:\\"
            || path_lower == "c:\\windows"
            || path_lower == "c:\\users"
            || path_lower.ends_out_with_user_root()
        {
            return true;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if path_lower.starts_with("/system")
            || (path_lower.starts_with("/library")
                && !path_lower.contains("caches")
                && !path_lower.contains("logs"))
            || path_lower.starts_with("/usr")
            || path_lower.starts_with("/bin")
            || path_lower.starts_with("/sbin")
            || path_lower.starts_with("/etc")
            || path_lower.starts_with("/private/etc")
            || path_lower.starts_with("/private/var/db")
        {
            return true;
        }

        if path_str == "/"
            || path_str == "/System"
            || path_str == "/Library"
            || path_str == "/Users"
        {
            return true;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if path_lower.starts_with("/bin")
            || path_lower.starts_with("/boot")
            || path_lower.starts_with("/dev")
            || path_lower.starts_with("/etc")
            || path_lower.starts_with("/lib")
            || path_lower.starts_with("/lib64")
            || path_lower.starts_with("/sbin")
            || path_lower.starts_with("/sys")
            || path_lower.starts_with("/usr")
            || path_lower.starts_with("/var/lib/dpkg")
            || path_lower.starts_with("/proc")
        {
            return true;
        }

        if path_str == "/" || path_str == "/home" || path_str == "/root" {
            return true;
        }
    }

    if path_str.len() <= 3 && (path_lower.starts_with('/') || path_lower.contains(":\\")) {
        return true;
    }

    false
}

#[cfg(target_os = "windows")]
fn has_windows_reparse_attribute(file_attributes: u32) -> bool {
    file_attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

/// Detecta objetos del sistema de archivos que pueden redirigir a otro destino.
///
/// En Windows esto inspecciona FILE_ATTRIBUTE_REPARSE_POINT, lo que cubre
/// junctions y otros reparse points además de enlaces simbólicos. En Unix la
/// protección equivalente se mantiene mediante `file_type().is_symlink()`.
pub fn metadata_is_reparse_point(metadata: &fs::Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        has_windows_reparse_attribute(metadata.file_attributes())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = metadata;
        false
    }
}

/// Valida y canonicaliza un objetivo antes de cualquier operación destructiva.
///
/// La comprobación se realiza tanto sobre la ruta recibida como sobre su ruta
/// canonicalizada. Esto evita que componentes como `..`, aliases o enlaces que
/// resuelven hacia un directorio protegido puedan saltarse el filtro original.
pub fn validate_cleanup_target(path_str: &str) -> Result<PathBuf, String> {
    if path_str.trim().is_empty() {
        return Err("Acción bloqueada: ruta vacía.".to_string());
    }

    let path = Path::new(path_str);
    if !path.is_absolute() {
        return Err(format!(
            "Acción bloqueada: la ruta debe ser absoluta: {}",
            path_str
        ));
    }

    if is_path_critical(path_str) {
        return Err(format!(
            "Acción bloqueada: {} es una ruta crítica del sistema operativo.",
            path_str
        ));
    }

    if !path.exists() {
        return Ok(path.to_path_buf());
    }

    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("No se pudo validar la ruta {}: {}", path_str, e))?;

    if metadata_is_reparse_point(&metadata) {
        return Err(format!(
            "Acción bloqueada: el objetivo es un reparse point o junction: {}",
            path_str
        ));
    }

    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Acción bloqueada: el objetivo es un enlace simbólico: {}",
            path_str
        ));
    }

    let canonical = fs::canonicalize(path)
        .map_err(|e| format!("No se pudo canonicalizar la ruta {}: {}", path_str, e))?;
    let canonical_str = canonical.to_string_lossy();

    if is_path_critical(&canonical_str) {
        return Err(format!(
            "Acción bloqueada: {} resuelve hacia una ruta crítica: {}",
            path_str, canonical_str
        ));
    }

    Ok(canonical)
}

#[cfg(target_os = "windows")]
trait WindowsPathExt {
    fn ends_out_with_user_root(&self) -> bool;
}

#[cfg(target_os = "windows")]
impl WindowsPathExt for String {
    fn ends_out_with_user_root(&self) -> bool {
        let parts: Vec<&str> = self.split('\\').collect();
        parts.len() == 3
            && parts[0].eq_ignore_ascii_case("c:")
            && parts[1].eq_ignore_ascii_case("users")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_path_critical() {
        #[cfg(target_os = "windows")]
        {
            assert!(is_path_critical("C:\\Windows\\System32"));
            assert!(is_path_critical("C:\\Windows\\System32\\drivers"));
            assert!(is_path_critical("C:\\Program Files"));
            assert!(!is_path_critical("C:\\Users\\Danny\\AppData\\Local\\Temp"));
            assert!(!is_path_critical("C:\\Windows\\Temp\\SomeApp"));
        }

        #[cfg(target_os = "macos")]
        {
            assert!(is_path_critical("/System"));
            assert!(is_path_critical("/bin"));
            assert!(is_path_critical("/usr/lib"));
            assert!(is_path_critical("/etc"));
            assert!(is_path_critical("/private/etc"));
            assert!(is_path_critical("/"));
        }

        #[cfg(target_os = "linux")]
        {
            assert!(is_path_critical("/bin"));
            assert!(is_path_critical("/usr/lib"));
            assert!(is_path_critical("/etc"));
            assert!(is_path_critical("/"));
        }
    }

    #[test]
    fn rejects_relative_cleanup_targets() {
        let result = validate_cleanup_target("relative/path");
        assert!(result.is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn detects_windows_reparse_attributes() {
        assert!(has_windows_reparse_attribute(FILE_ATTRIBUTE_REPARSE_POINT));
        assert!(has_windows_reparse_attribute(
            FILE_ATTRIBUTE_REPARSE_POINT | 0x10
        ));
        assert!(!has_windows_reparse_attribute(0x20));
    }
}
