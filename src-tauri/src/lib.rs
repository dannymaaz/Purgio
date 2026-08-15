mod cleaner;
mod persistence;
mod safety;
mod scanner;
mod startup;
mod system;
mod updater;

use std::collections::{HashMap, HashSet};

use cleaner::{CleanupPathResult, CleanupStatus};
use scanner::CleanableItem;
use serde::Serialize;
use startup::StartupItem;
use system::{ProcessItem, SystemStats};

#[derive(Debug, Clone, Serialize)]
struct CleanupItemResult {
    id: String,
    name: String,
    estimated_bytes: u64,
    bytes_freed: u64,
    status: CleanupStatus,
    paths: Vec<CleanupPathResult>,
}

#[derive(Debug, Clone, Serialize)]
struct CleanupRunResult {
    estimated_bytes: u64,
    bytes_freed: u64,
    items_attempted: usize,
    items_completed: usize,
    items_partial: usize,
    items_failed: usize,
    items_no_op: usize,
    results: Vec<CleanupItemResult>,
}

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
/// Las rutas que puedan llegar desde la interfaz nunca se usan para borrar. Cada
/// operación se reconstruye a partir del ID emitido por los escáneres del backend.
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

        let item = catalog.get(item_id).cloned().ok_or_else(|| {
            format!(
                "Elemento de limpieza no autorizado o inexistente: {}",
                item_id
            )
        })?;

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

fn summarize_item_status(paths: &[CleanupPathResult]) -> CleanupStatus {
    if paths.is_empty() || paths.iter().all(|path| path.status == CleanupStatus::NoOp) {
        return CleanupStatus::NoOp;
    }

    if paths.iter().all(|path| path.status == CleanupStatus::Failed) {
        return CleanupStatus::Failed;
    }

    if paths.iter().any(|path| {
        matches!(path.status, CleanupStatus::Partial | CleanupStatus::Failed)
    }) {
        return CleanupStatus::Partial;
    }

    CleanupStatus::Completed
}

/// Ejecuta una limpieza reconstruyendo cada operación exclusivamente desde IDs.
/// La respuesta contiene resultados por item y por ruta para que la UI nunca tenga
/// que inferir un éxito total a partir de un único contador de bytes.
#[tauri::command]
fn clean_items(item_ids: Vec<String>) -> Result<CleanupRunResult, String> {
    let authorized_items = resolve_requested_items(&item_ids)?;
    let estimated_bytes = authorized_items.iter().map(|item| item.size).sum();
    let mut results = Vec::with_capacity(authorized_items.len());

    for item in authorized_items {
        let is_sensitive = matches!(item.risk_level, safety::RiskLevel::Sensitive);
        let paths: Vec<CleanupPathResult> = item
            .paths
            .iter()
            .map(|path| cleaner::clean_path_with_report(path, is_sensitive))
            .collect();
        let bytes_freed = paths.iter().map(|path| path.bytes_freed).sum();
        let status = summarize_item_status(&paths);

        results.push(CleanupItemResult {
            id: item.id,
            name: item.name,
            estimated_bytes: item.size,
            bytes_freed,
            status,
            paths,
        });
    }

    let bytes_freed = results.iter().map(|item| item.bytes_freed).sum();
    let items_completed = results
        .iter()
        .filter(|item| item.status == CleanupStatus::Completed)
        .count();
    let items_partial = results
        .iter()
        .filter(|item| item.status == CleanupStatus::Partial)
        .count();
    let items_failed = results
        .iter()
        .filter(|item| item.status == CleanupStatus::Failed)
        .count();
    let items_no_op = results
        .iter()
        .filter(|item| item.status == CleanupStatus::NoOp)
        .count();

    Ok(CleanupRunResult {
        estimated_bytes,
        bytes_freed,
        items_attempted: results.len(),
        items_completed,
        items_partial,
        items_failed,
        items_no_op,
        results,
    })
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
fn enable_startup(
    name: String,
    location_key: String,
    original_command: String,
) -> Result<(), String> {
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
async fn check_for_updates(app: tauri::AppHandle) -> Result<updater::UpdateInfo, String> {
    updater::check_for_updates(&app).await
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    updater::install_update(&app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(status: CleanupStatus) -> CleanupPathResult {
        CleanupPathResult {
            path: "C:\\Temp".to_string(),
            bytes_freed: 0,
            status,
            issues: Vec::new(),
        }
    }

    #[test]
    fn mixed_success_and_failure_is_partial() {
        let paths = vec![path(CleanupStatus::Completed), path(CleanupStatus::Failed)];
        assert_eq!(summarize_item_status(&paths), CleanupStatus::Partial);
    }

    #[test]
    fn all_failures_are_failed() {
        let paths = vec![path(CleanupStatus::Failed), path(CleanupStatus::Failed)];
        assert_eq!(summarize_item_status(&paths), CleanupStatus::Failed);
    }

    #[test]
    fn completed_plus_no_op_is_completed() {
        let paths = vec![path(CleanupStatus::Completed), path(CleanupStatus::NoOp)];
        assert_eq!(summarize_item_status(&paths), CleanupStatus::Completed);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            check_for_updates,
            install_update,
            persistence::load_app_state,
            persistence::save_preferences,
            persistence::migrate_legacy_state,
            persistence::add_history_entry,
            persistence::clear_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
