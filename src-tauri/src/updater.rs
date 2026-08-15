use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub latest_version: String,
    pub current_version: String,
    pub has_update: bool,
    pub download_url: String,
    pub changelog: String,
}

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Consulta el endpoint configurado del updater oficial de Tauri.
///
/// Tauri selecciona el artefacto correspondiente al target/arquitectura actual
/// desde `latest.json`. No existe fallback a un asset de otra plataforma.
pub async fn check_for_updates(app: &tauri::AppHandle) -> Result<UpdateInfo, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("No se pudo inicializar el updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("No se pudo comprobar actualizaciones: {e}"))?;

    if let Some(update) = update {
        return Ok(UpdateInfo {
            latest_version: update.version,
            current_version: update.current_version,
            has_update: true,
            download_url: update.download_url.to_string(),
            changelog: update.body.unwrap_or_default(),
        });
    }

    Ok(UpdateInfo {
        latest_version: CURRENT_VERSION.to_string(),
        current_version: CURRENT_VERSION.to_string(),
        has_update: false,
        download_url: String::new(),
        changelog: String::new(),
    })
}

/// Descarga, verifica la firma e instala la actualización seleccionada por Tauri.
/// La aplicación solo se reinicia después de que la instalación haya terminado.
pub async fn install_update(app: &tauri::AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("No se pudo inicializar el updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("No se pudo comprobar actualizaciones: {e}"))?
        .ok_or_else(|| "No hay una actualización disponible.".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("La actualización no pudo verificarse o instalarse: {e}"))?;

    app.restart();
}
