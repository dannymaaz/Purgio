use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CURRENT_SCHEMA_VERSION: u32 = 1;
const STATE_FILE_NAME: &str = "state.json";
const MAX_HISTORY_ENTRIES: usize = 50;

static STATE_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn state_io_lock() -> &'static Mutex<()> {
    STATE_IO_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppPreferences {
    pub theme: String,
    pub language: String,
    pub confirm_delete: bool,
    pub confirm_disable: bool,
    pub show_sensitive: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: "es".to_string(),
            confirm_delete: true,
            confirm_disable: true,
            show_sensitive: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CleanHistoryEntry {
    pub timestamp: u64,
    #[serde(alias = "bytesFreed")]
    pub bytes_freed: u64,
    #[serde(alias = "itemCount")]
    pub item_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PersistedState {
    pub schema_version: u32,
    pub legacy_migration_completed: bool,
    pub preferences: AppPreferences,
    pub history: Vec<CleanHistoryEntry>,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            legacy_migration_completed: false,
            preferences: AppPreferences::default(),
            history: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct LegacyMigration {
    pub theme: Option<String>,
    #[serde(default)]
    pub history: Vec<CleanHistoryEntry>,
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(STATE_FILE_NAME))
        .map_err(|e| format!("No se pudo resolver la carpeta de configuración de Purgio: {e}"))
}

fn validate_preferences(preferences: &AppPreferences) -> Result<(), String> {
    if !matches!(preferences.theme.as_str(), "system" | "dark" | "light") {
        return Err(format!("Tema no válido: {}", preferences.theme));
    }

    if !matches!(preferences.language.as_str(), "es" | "en") {
        return Err(format!("Idioma no válido: {}", preferences.language));
    }

    Ok(())
}

fn sanitize_history(mut history: Vec<CleanHistoryEntry>) -> Vec<CleanHistoryEntry> {
    history.retain(|entry| entry.timestamp > 0 && entry.item_count > 0);
    history.truncate(MAX_HISTORY_ENTRIES);
    history
}

fn migrate_schema(mut state: PersistedState) -> Result<PersistedState, String> {
    if state.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "La configuración usa un schema más reciente ({} > {}). Actualiza Purgio antes de modificarla.",
            state.schema_version, CURRENT_SCHEMA_VERSION
        ));
    }

    // Primer schema persistente de Purgio. Mantener este bloque explícito para
    // que futuras versiones añadan migraciones secuenciales en vez de reinterpretar JSON.
    if state.schema_version == 0 {
        state.schema_version = 1;
    }

    validate_preferences(&state.preferences)?;
    state.history = sanitize_history(state.history);
    Ok(state)
}

fn recover_interrupted_write(path: &Path) -> Result<(), String> {
    let backup = path.with_extension("json.bak");
    let temp = path.with_extension("json.tmp");

    if !path.exists() && backup.exists() {
        fs::rename(&backup, path)
            .map_err(|e| format!("No se pudo recuperar el backup de configuración: {e}"))?;
    }

    // Un temporal huérfano nunca es fuente de verdad; el estado confirmado o su
    // backup sí lo son.
    if temp.exists() {
        let _ = fs::remove_file(temp);
    }

    Ok(())
}

fn quarantine_corrupt_state(path: &Path) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let quarantine = path.with_extension(format!("corrupt-{timestamp}.json"));
    let _ = fs::rename(path, quarantine);
}

fn read_state(path: &Path) -> Result<PersistedState, String> {
    recover_interrupted_write(path)?;

    if !path.exists() {
        return Ok(PersistedState::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer la configuración de Purgio: {e}"))?;

    let parsed = match serde_json::from_str::<PersistedState>(&raw) {
        Ok(state) => state,
        Err(error) => {
            quarantine_corrupt_state(path);
            eprintln!("Configuración corrupta aislada; se usarán defaults seguros: {error}");
            return Ok(PersistedState::default());
        }
    };

    migrate_schema(parsed)
}

fn write_state(path: &Path, state: &PersistedState) -> Result<(), String> {
    validate_preferences(&state.preferences)?;

    let parent = path
        .parent()
        .ok_or_else(|| "Ruta de configuración inválida".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;

    let temp = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let serialized = serde_json::to_vec_pretty(state)
        .map_err(|e| format!("No se pudo serializar la configuración: {e}"))?;

    {
        let mut file = File::create(&temp)
            .map_err(|e| format!("No se pudo crear el archivo temporal de configuración: {e}"))?;
        file.write_all(&serialized)
            .map_err(|e| format!("No se pudo escribir la configuración: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("No se pudo sincronizar la configuración a disco: {e}"))?;
    }

    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|e| format!("No se pudo limpiar el backup anterior: {e}"))?;
    }

    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|e| format!("No se pudo preparar el backup de configuración: {e}"))?;
    }

    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(format!(
            "No se pudo confirmar la nueva configuración: {error}"
        ));
    }

    if backup.exists() {
        let _ = fs::remove_file(backup);
    }

    Ok(())
}

fn with_state_lock<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = state_io_lock()
        .lock()
        .map_err(|_| "El bloqueo de configuración quedó en estado inválido".to_string())?;
    operation()
}

#[tauri::command]
pub fn load_app_state(app: tauri::AppHandle) -> Result<PersistedState, String> {
    with_state_lock(|| {
        let path = state_path(&app)?;
        read_state(&path)
    })
}

#[tauri::command]
pub fn save_preferences(app: tauri::AppHandle, preferences: AppPreferences) -> Result<(), String> {
    validate_preferences(&preferences)?;

    with_state_lock(|| {
        let path = state_path(&app)?;
        let mut state = read_state(&path)?;
        state.preferences = preferences;
        state.schema_version = CURRENT_SCHEMA_VERSION;
        write_state(&path, &state)
    })
}

#[tauri::command]
pub fn migrate_legacy_state(
    app: tauri::AppHandle,
    legacy: LegacyMigration,
) -> Result<PersistedState, String> {
    with_state_lock(|| {
        let path = state_path(&app)?;
        let mut state = read_state(&path)?;

        if state.legacy_migration_completed {
            return Ok(state);
        }

        if let Some(theme) = legacy.theme {
            if matches!(theme.as_str(), "system" | "dark" | "light") {
                state.preferences.theme = theme;
            }
        }

        if state.history.is_empty() {
            state.history = sanitize_history(legacy.history);
        }

        state.legacy_migration_completed = true;
        state.schema_version = CURRENT_SCHEMA_VERSION;
        write_state(&path, &state)?;
        Ok(state)
    })
}

#[tauri::command]
pub fn add_history_entry(
    app: tauri::AppHandle,
    bytes_freed: u64,
    item_count: u32,
) -> Result<Vec<CleanHistoryEntry>, String> {
    if item_count == 0 {
        return Err("El historial no admite limpiezas con cero elementos".to_string());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Reloj del sistema inválido: {e}"))?
        .as_millis() as u64;

    with_state_lock(|| {
        let path = state_path(&app)?;
        let mut state = read_state(&path)?;
        state.history.insert(
            0,
            CleanHistoryEntry {
                timestamp,
                bytes_freed,
                item_count,
            },
        );
        state.history = sanitize_history(state.history);
        write_state(&path, &state)?;
        Ok(state.history)
    })
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    with_state_lock(|| {
        let path = state_path(&app)?;
        let mut state = read_state(&path)?;
        state.history.clear();
        write_state(&path, &state)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn history_entry(index: u64) -> CleanHistoryEntry {
        CleanHistoryEntry {
            timestamp: index + 1,
            bytes_freed: index * 1024,
            item_count: 1,
        }
    }

    #[test]
    fn defaults_are_conservative() {
        let state = PersistedState::default();
        assert_eq!(state.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(state.preferences.theme, "system");
        assert_eq!(state.preferences.language, "es");
        assert!(state.preferences.confirm_delete);
        assert!(state.preferences.confirm_disable);
        assert!(!state.preferences.show_sensitive);
    }

    #[test]
    fn rejects_unknown_preference_values() {
        let mut preferences = AppPreferences::default();
        preferences.theme = "neon".to_string();
        assert!(validate_preferences(&preferences).is_err());

        let mut preferences = AppPreferences::default();
        preferences.language = "xx".to_string();
        assert!(validate_preferences(&preferences).is_err());
    }

    #[test]
    fn history_is_bounded_and_sanitized() {
        let mut history: Vec<_> = (0..75).map(history_entry).collect();
        history.push(CleanHistoryEntry {
            timestamp: 0,
            bytes_freed: 100,
            item_count: 1,
        });
        history.push(CleanHistoryEntry {
            timestamp: 100,
            bytes_freed: 100,
            item_count: 0,
        });

        let sanitized = sanitize_history(history);
        assert_eq!(sanitized.len(), MAX_HISTORY_ENTRIES);
        assert!(sanitized.iter().all(|entry| entry.timestamp > 0));
        assert!(sanitized.iter().all(|entry| entry.item_count > 0));
    }

    #[test]
    fn refuses_future_schema_versions() {
        let state = PersistedState {
            schema_version: CURRENT_SCHEMA_VERSION + 1,
            ..PersistedState::default()
        };
        assert!(migrate_schema(state).is_err());
    }
}
