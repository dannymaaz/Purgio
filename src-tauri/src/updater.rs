// updater.rs — Módulo de verificación de actualizaciones para Purgio
// Consulta la API de GitHub Releases para detectar nuevas versiones.
use serde::{Serialize, Deserialize};
use std::process::Command;

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

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// Helper para comparar versiones simples (por ejemplo, "0.1.0" o "1.0.3")
fn is_newer_version(latest: &str, current: &str) -> bool {
    let clean_v = |v: &str| -> String {
        v.trim()
            .trim_start_matches('v')
            .split('-') // Ignorar sufijos como -beta o -rc
            .next()
            .unwrap_or("")
            .to_string()
    };

    let latest_clean = clean_v(latest);
    let current_clean = clean_v(current);

    let latest_parts: Vec<&str> = latest_clean.split('.').collect();
    let current_parts: Vec<&str> = current_clean.split('.').collect();

    for i in 0..std::cmp::max(latest_parts.len(), current_parts.len()) {
        let l_val = latest_parts.get(i).and_then(|&s| s.parse::<u32>().ok()).unwrap_or(0);
        let c_val = current_parts.get(i).and_then(|&s| s.parse::<u32>().ok()).unwrap_or(0);

        if l_val > c_val {
            return true;
        } else if l_val < c_val {
            return false;
        }
    }
    false
}

/// Verifica si hay una nueva versión disponible en GitHub Releases
pub fn check_for_updates() -> UpdateInfo {
    let mut latest_version = CURRENT_VERSION.to_string();
    let mut download_url = String::new();
    let mut changelog = String::new();
    let mut has_update = false;

    // Ejecutar curl para consultar la API de GitHub
    let curl_cmd = if cfg!(target_os = "windows") { "curl.exe" } else { "curl" };
    let output = Command::new(curl_cmd)
        .args(&[
            "-s",
            "-H",
            "User-Agent: Purgio",
            "https://api.github.com/repos/dannymaaz/Purgio/releases/latest"
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let json_str = String::from_utf8_lossy(&out.stdout);
            if let Ok(release) = serde_json::from_str::<GithubRelease>(&json_str) {
                latest_version = release.tag_name.clone();
                changelog = release.body.unwrap_or_default();
                has_update = is_newer_version(&latest_version, CURRENT_VERSION);

                // Buscar el instalador de Windows (preferir -setup.exe, luego .exe, luego .msi)
                for asset in &release.assets {
                    if asset.name.ends_with("-setup.exe") || asset.name.ends_with(".exe") {
                        download_url = asset.browser_download_url.clone();
                        break;
                    }
                }
                if download_url.is_empty() {
                    for asset in &release.assets {
                        if asset.name.ends_with(".msi") {
                            download_url = asset.browser_download_url.clone();
                            break;
                        }
                    }
                }
                if download_url.is_empty() {
                    if let Some(first_asset) = release.assets.first() {
                        download_url = first_asset.browser_download_url.clone();
                    }
                }
            }
        }
    }

    UpdateInfo {
        latest_version,
        current_version: CURRENT_VERSION.to_string(),
        has_update,
        download_url,
        changelog,
    }
}
