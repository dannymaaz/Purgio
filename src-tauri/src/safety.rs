use serde::{Serialize, Deserialize};


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Safe,
    Review,
    Sensitive,
    Critical,
}

/// Comprueba si una ruta pertenece a los directorios críticos del sistema.
pub fn is_path_critical(path_str: &str) -> bool {
    // Normalizar a minúsculas para comparaciones insensibles a mayúsculas
    let path_lower = path_str.to_lowercase();

    // Reglas para Windows
    #[cfg(target_os = "windows")]
    {
        // Rutas críticas de Windows
        if path_lower.contains("system32") || 
           path_lower.contains("syswow64") || 
           path_lower.contains("windows\\winsxs") ||
           path_lower.contains("c:\\windows\\system") ||
           path_lower.contains("c:\\windows\\boot") ||
           path_lower.contains("c:\\program files") ||
           path_lower.contains("c:\\program files (x86)") ||
           path_lower.contains("c:\\users\\all users")
        {
            return true;
        }

        // Evitar limpiar el perfil de usuario raíz directamente o AppData entero
        if path_lower == "c:\\" || 
           path_lower == "c:\\windows" || 
           path_lower == "c:\\users" || 
           path_lower.ends_out_with_user_root() 
        {
            return true;
        }
    }

    // Reglas para macOS
    #[cfg(target_os = "macos")]
    {
        if path_lower.starts_with("/system") ||
           path_lower.starts_with("/library") && !path_lower.contains("caches") && !path_lower.contains("logs") ||
           path_lower.starts_with("/usr/bin") ||
           path_lower.starts_with("/bin") ||
           path_lower.starts_with("/sbin") ||
           path_lower.starts_with("/private/var/db")
        {
            return true;
        }
        
        if path_str == "/" || path_str == "/System" || path_str == "/Library" || path_str == "/Users" {
            return true;
        }
    }

    // Reglas para Linux
    #[cfg(target_os = "linux")]
    {
        if path_lower.starts_with("/bin") ||
           path_lower.starts_with("/boot") ||
           path_lower.starts_with("/dev") ||
           path_lower.starts_with("/etc") ||
           path_lower.starts_with("/lib") ||
           path_lower.starts_with("/lib64") ||
           path_lower.starts_with("/sbin") ||
           path_lower.starts_with("/sys") ||
           path_lower.starts_with("/usr") ||
           path_lower.starts_with("/var/lib/dpkg") ||
           path_lower.starts_with("/proc")
        {
            return true;
        }

        if path_str == "/" || path_str == "/home" || path_str == "/root" {
            return true;
        }
    }

    // Verificación genérica: no permitir borrar directorios raíces o muy cortos
    if path_str.len() <= 3 && (path_lower.starts_with("/") || path_lower.contains(":\\")) {
        return true;
    }

    false
}

// Auxiliar para comprobar raíces de usuario en Windows
#[cfg(target_os = "windows")]
trait WindowsPathExt {
    fn ends_out_with_user_root(&self) -> bool;
}

#[cfg(target_os = "windows")]
impl WindowsPathExt for String {
    fn ends_out_with_user_root(&self) -> bool {
        // C:\Users\NombreDeUsuario
        let parts: Vec<&str> = self.split('\\').collect();
        if parts.len() == 3 && parts[0].eq_ignore_ascii_case("c:") && parts[1].eq_ignore_ascii_case("users") {
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_path_critical() {
        // Validación en entornos Windows
        #[cfg(target_os = "windows")]
        {
            assert!(is_path_critical("C:\\Windows\\System32"));
            assert!(is_path_critical("C:\\Windows\\System32\\drivers"));
            assert!(is_path_critical("C:\\Program Files"));
            assert!(!is_path_critical("C:\\Users\\Danny\\AppData\\Local\\Temp"));
            assert!(!is_path_critical("C:\\Windows\\Temp\\SomeApp"));
        }
        
        // Validación en entornos macOS
        #[cfg(target_os = "macos")]
        {
            assert!(is_path_critical("/System"));
            assert!(is_path_critical("/bin"));
            assert!(is_path_critical("/usr/lib"));
            assert!(is_path_critical("/etc"));
            assert!(is_path_critical("/"));
        }

        // Validación en entornos Linux
        #[cfg(target_os = "linux")]
        {
            assert!(is_path_critical("/bin"));
            assert!(is_path_critical("/usr/lib"));
            assert!(is_path_critical("/etc"));
            assert!(is_path_critical("/"));
        }
    }
}
