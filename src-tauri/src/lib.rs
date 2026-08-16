mod chrome_ai;
mod cleaner;
mod component_store;
mod persistence;
mod safety;
mod scanner;
mod startup;
mod system;
mod updater;

use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};

use cleaner::{CleanupPathResult, CleanupStatus};
use scanner::CleanableItem;
use serde::Serialize;
use startup::StartupItem;
use system::{ProcessItem, SystemStats};

#[derive(Debug, Clone, Serialize)]
struct CleanupPlanPreview {
    revision: String,
    items: Vec<CleanableItem>,
}

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

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord)]
struct CleanupPlanIdentity {
    id: String,
    risk_level: &'static str,
    paths: Vec<String>,
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

#[tauri::command]
fn get_chrome_on_device_model_info() -> chrome_ai::ChromeOnDeviceModelInfo {
    chrome_ai::get_chrome_on_device_model_info()
}

#[tauri::command]
fn analyze_component_store() -> component_store::ComponentStoreResult {
    component_store::analyze_component_store()
}

#[tauri::command]
fn start_component_cleanup() -> component_store::ComponentStoreResult {
    component_store::start_component_cleanup()
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

fn risk_identity(risk: safety::RiskLevel) -> &'static str {
    match risk {
        safety::RiskLevel::Safe => "safe",
        safety::RiskLevel::Review => "review",
        safety::RiskLevel::Sensitive => "sensitive",
        safety::RiskLevel::Critical => "critical",
    }
}

/// Genera una revisión compacta del alcance destructivo visible en el preview.
///
/// No es una autorización criptográfica: la autorización continúa siendo el
/// catálogo de Rust. Su propósito es detectar cambios de IDs/rutas/riesgo entre
/// el preview y la ejecución para impedir que una ruta nueva se borre sin haber
/// aparecido primero en el Cleanup Plan. Tamaños y copy se excluyen a propósito,
/// ya que una caché activa puede cambiar de bytes sin cambiar su alcance.
fn cleanup_plan_revision(items: &[CleanableItem]) -> String {
    let mut identities: Vec<CleanupPlanIdentity> = items
        .iter()
        .map(|item| {
            let mut paths = item.paths.clone();
            paths.sort();
            paths.dedup();

            CleanupPlanIdentity {
                id: item.id.clone(),
                risk_level: risk_identity(item.risk_level),
                paths,
            }
        })
        .collect();
    identities.sort();

    // Dos dominios separados reducen de forma práctica el riesgo de colisión
    // accidental sin añadir una dependencia nueva. El token no concede acceso:
    // Rust siempre vuelve a resolver y validar el catálogo antes de borrar.
    let mut first = DefaultHasher::new();
    "purgio-cleanup-plan-v1".hash(&mut first);
    identities.hash(&mut first);

    let mut second = DefaultHasher::new();
    "purgio-cleanup-plan-v1-secondary".hash(&mut second);
    identities.hash(&mut second);

    format!("{:016x}{:016x}", first.finish(), second.finish())
}

/// Dry-run de limpieza. Devuelve exactamente los elementos que Rust reconoce
/// para los IDs solicitados y una revisión del alcance mostrado. No modifica el
/// sistema.
#[tauri::command]
fn preview_clean_items(item_ids: Vec<String>) -> Result<CleanupPlanPreview, String> {
    let items = resolve_requested_items(&item_ids)?;
    let revision = cleanup_plan_revision(&items);
    Ok(CleanupPlanPreview { revision, items })
}

fn summarize_item_status(paths: &[CleanupPathResult]) -> CleanupStatus {
    if paths.is_empty() || paths.iter().all(|path| path.status == CleanupStatus::NoOp) {
        return CleanupStatus::NoOp;
    }

    if paths
        .iter()
        .all(|path| path.status == CleanupStatus::Failed)
    {
        return CleanupStatus::Failed;
    }

    if paths
        .iter()
        .any(|path| matches!(path.status, CleanupStatus::Partial | CleanupStatus::Failed))
    {
        return CleanupStatus::Partial;
    }

    CleanupStatus::Completed
}

/// Ejecuta una limpieza reconstruyendo cada operación exclusivamente desde IDs.
/// La revisión debe coincidir con el alcance mostrado por el preview; si cambió
/// cualquier ruta o nivel de riesgo, la operación falla cerrado y exige revisar
/// un plan nuevo.
#[tauri::command]
fn clean_items(item_ids: Vec<String>, plan_revision: String) -> Result<CleanupRunResult, String> {
    let authorized_items = resolve_requested_items(&item_ids)?;
    let current_revision = cleanup_plan_revision(&authorized_items);

    if plan_revision != current_revision {
        return Err(
            "PLAN_CHANGED: El alcance autorizado cambió desde el preview. Genera y revisa un nuevo plan de limpieza antes de continuar."
                .to_string(),
        );
    }

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
fn disable_startup(id: String) -> Result<(), String> {
    startup::disable_startup_item(&id)
}

#[tauri::command]
fn enable_startup(id: String) -> Result<(), String> {
    startup::enable_startup_item(&id)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            scan_system_files,
            scan_browser_files,
            get_chrome_on_device_model_info,
            analyze_component_store,
            start_component_cleanup,
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

    fn cleanable_item(paths: &[&str], risk_level: safety::RiskLevel) -> CleanableItem {
        CleanableItem::new(
            "test-item",
            "Test item",
            1024,
            paths.iter().map(|path| (*path).to_string()).collect(),
            risk_level,
            "Test description",
            "Test impact",
            "Test recommendation",
            "test",
        )
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

    #[test]
    fn cleanup_plan_revision_ignores_path_order() {
        let first = cleanable_item(&["C:\\Temp\\a", "C:\\Temp\\b"], safety::RiskLevel::Safe);
        let second = cleanable_item(&["C:\\Temp\\b", "C:\\Temp\\a"], safety::RiskLevel::Safe);

        assert_eq!(
            cleanup_plan_revision(&[first]),
            cleanup_plan_revision(&[second])
        );
    }

    #[test]
    fn cleanup_plan_revision_changes_with_authorized_path() {
        let first = cleanable_item(&["C:\\Temp\\a"], safety::RiskLevel::Safe);
        let second = cleanable_item(&["C:\\Temp\\b"], safety::RiskLevel::Safe);

        assert_ne!(
            cleanup_plan_revision(&[first]),
            cleanup_plan_revision(&[second])
        );
    }

    #[test]
    fn cleanup_plan_revision_changes_with_risk() {
        let safe = cleanable_item(&["C:\\Temp\\a"], safety::RiskLevel::Safe);
        let sensitive = cleanable_item(&["C:\\Temp\\a"], safety::RiskLevel::Sensitive);

        assert_ne!(
            cleanup_plan_revision(&[safe]),
            cleanup_plan_revision(&[sensitive])
        );
    }
}
