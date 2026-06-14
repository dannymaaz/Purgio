// updater.rs — Módulo de verificación de actualizaciones para Purgio
// Consulta la API de GitHub Releases para detectar nuevas versiones.
use serde::{Serialize, Deserialize};

/// Información de una actualización disponible
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// Versión más reciente en GitHub
    pub latest_version: String,
    /// Versión actual instalada
    pub current_version: String,
    /// ¿Hay una versión más nueva disponible?
    pub has_update: bool,
    /// URL de descarga de la nueva versión
    pub download_url: String,
    /// Notas del changelog de la nueva versión
    pub changelog: String,
}

/// Versión actual embebida del binario
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Verifica si hay una nueva versión disponible en GitHub Releases
/// Retorna UpdateInfo sin importar si hay o no actualización
pub fn check_for_updates() -> UpdateInfo {
    let default = UpdateInfo {
        latest_version: CURRENT_VERSION.to_string(),
        current_version: CURRENT_VERSION.to_string(),
        has_update: false,
        download_url: String::new(),
        changelog: String::new(),
    };

    // Intentar consultar la API de GitHub
    // Por ahora devolvemos default
    default
}
