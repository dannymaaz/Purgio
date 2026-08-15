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

/// Ejecuta una limpieza reconstruyendo cada operación desde el catálogo de Rust.
///
/// Se mantiene `Vec<CleanableItem>` como contrato temporal para no romper la UI
/// existente, pero solo se leen los IDs. `paths`, `size`, `risk_level`, `selected`
/// y el resto de campos enviados por el frontend se consideran datos no confiables.
#[tauri::command]
fn clean_items(items: Vec<CleanableItem>) -> Result<u64, String> {
    let item_ids: Vec<String> = items.into_iter().map(|item| item.id).collect();
    let authorized_items = resolve_requested_items(&item_ids)?;

    let mut total_freed = 0;
    let mut errors = Vec::new();

    for item in authorized_items {
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
