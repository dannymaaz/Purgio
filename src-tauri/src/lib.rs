mod safety;
mod scanner;
mod cleaner;
mod startup;
mod system;
mod updater;

use std::collections::{HashMap, HashSet};

use scanner::CleanableItem;
use startup::StartupItem;
use system::{ProcessItem, SystemStats};

#[tauri::command]
fn get_system_stats() -> SystemStats {
    system::get_system_stats()
}

#[tauri::command]
fn scan_system_files() -> Vec<CleanableItem> {
    scanner::scan_system_files()
}

#[tauri::command]
fn scan_browser_files() -> Vec<CleanableItem> {
    scanner::scan_browser_files()
}

/// Construye el catálogo autorizado de elementos limpiables directamente en Rust.
///
/// El frontend nunca puede proporcionar rutas de archivos para una limpieza. Solo
/// puede solicitar IDs que hayan sido definidos por los escáneres del backend.
fn build_cleanable_catalog() -> HashMap<String, CleanableItem> {
    scanner::scan_system_files()
        .into_iter()
        .chain(scanner::scan_browser_files())
        .map(|item| (item.id.clone(), item))
        .collect()
}

/// Resuelve IDs solicitados contra el catálogo generado por el backend.
/// IDs desconocidos se rechazan y los duplicados se deduplican para impedir
/// ejecutar dos veces una misma operación destructiva.
fn resolve_requested_items(item_ids: &[String]) -> Result<Vec<CleanableItem>, String> {
    let catalog = build_cleanable_catalog();
    let mut seen = HashSet::new();
    let mut resolved = Vec::with_capacity(item_ids.len());

    for item_id in item_ids {
        if !seen.insert(item_id.clone()) {
            continue;
        }

        let item = catalog
            .get(item_id)
            .cloned()
            .ok_or_else(|| format!("Elemento de limpieza no autorizado o inexistente: {}", item_id))?;

        resolved.push(item);
    }

    Ok(resolved)
}

/// Dry-run de limpieza. Devuelve exactamente los elementos que Rust reconoce
/// para los IDs solicitados, incluyendo rutas, tamaño estimado, nivel de riesgo
/// e impacto. No modifica el sistema.
#[tauri::command]
fn preview_clean_items(item_ids: Vec<String>) -> Result<Vec<CleanableItem>, String> {
    resolve_requested_items(&item_ids)
}

/// Ejecuta una limpieza usando únicamente IDs autorizados por el backend.
/// Las rutas recibidas desde la interfaz dejaron de formar parte del contrato IPC.
#[tauri::command]
fn clean_items(item_ids: Vec<String>) -> Result<u64, String> {
    let items = resolve_requested_items(&item_ids)?;
    let mut total_freed = 0;
    let mut errors = Vec::new();

    for item in items {
        let is_sensitive = matches!(item.risk_level, safety::RiskLevel::Sensitive);

        for path in &item.paths {
            match cleaner::clean_path_safely(path, is_sensitive) {
                Ok(bytes) => total_freed += bytes,
                Err(e) => errors.push(format!("{}: {}", item.name, e)),
            }
        }
    }

    if !errors.is_empty() {
        // Mantener el comportamiento histórico: si una limpieza parcial liberó
        // espacio, informar los bytes liberados en vez de perder el resultado.
        if total_freed > 0 {
            return Ok(total_freed);
        }
        return Err(errors.join(" | "));
    }

    Ok(total_freed)
}

#[tauri::command]
fn get_startup_items() -> Vec<StartupItem> {
    startup::get_startup_items()
}

#[tauri::command]
fn disable_startup(id: String, location_key: String) -> Result<(), String> {
    startup::disable_startup_item(&id, &location_key)
}

#[tauri::command]
fn enable_startup(name: String, location_key: String, original_command: String) -> Result<(), String> {
    startup::enable_startup_item(&name, &location_key, &original_command)
}

#[tauri::command]
fn get_background_apps() -> Vec<ProcessItem> {
    system::get_background_apps()
}

#[tauri::command]
fn kill_background_process(pid: u32) -> Result<(), String> {
    system::kill_process(pid)
}

/// Mata TODAS las instancias de un proceso por nombre (browsers son multi-proceso)
#[tauri::command]
fn kill_background_process_group(name: String) -> Result<usize, String> {
    system::kill_process_group(&name)
}

#[tauri::command]
fn check_for_updates() -> updater::UpdateInfo {
    updater::check_for_updates()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            scan_system_files,
            scan_browser_files,
            preview_clean_items,
            clean_items,
            get_startup_items,
            disable_startup,
            enable_startup,
            get_background_apps,
            kill_background_process,
            kill_background_process_group,
            check_for_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
