mod safety;
mod scanner;
mod cleaner;
mod startup;
mod system;
mod updater;

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

#[tauri::command]
fn clean_items(items: Vec<CleanableItem>) -> Result<u64, String> {
    let mut total_freed = 0;
    let mut errors = Vec::new();

    for item in items {
        if item.selected {
            let is_sensitive = matches!(item.risk_level, safety::RiskLevel::Sensitive);
            for path in &item.paths {
                match cleaner::clean_path_safely(path, is_sensitive) {
                    Ok(bytes) => total_freed += bytes,
                    Err(e) => errors.push(format!("{}: {}", item.name, e)),
                }
            }
        }
    }

    if !errors.is_empty() {
        // Retornar error descriptivo si algo falló, pero manteniendo los bytes liberados si los hubo
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]

#[tauri::command]
fn check_for_updates() -> updater::UpdateInfo {
    updater::check_for_updates()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            scan_system_files,
            scan_browser_files,
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




