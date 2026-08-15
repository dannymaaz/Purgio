from pathlib import Path

path = Path('src-tauri/src/persistence.rs')
text = path.read_text(encoding='utf-8')

text = text.replace('const CURRENT_SCHEMA_VERSION: u32 = 1;', 'const CURRENT_SCHEMA_VERSION: u32 = 2;', 1)
text = text.replace('language: "es".to_string(),', 'language: "system".to_string(),', 1)
text = text.replace(
    'if !matches!(preferences.language.as_str(), "es" | "en") {',
    'if !matches!(preferences.language.as_str(), "system" | "es" | "en") {',
    1,
)

old_migration = '''    // Primer schema persistente de Purgio. Mantener este bloque explícito para
    // que futuras versiones añadan migraciones secuenciales en vez de reinterpretar JSON.
    if state.schema_version == 0 {
        state.schema_version = 1;
    }

    validate_preferences(&state.preferences)?;
'''
new_migration = '''    // Primer schema persistente de Purgio. Mantener migraciones secuenciales
    // evita reinterpretar silenciosamente archivos creados por versiones anteriores.
    if state.schema_version == 0 {
        state.schema_version = 1;
    }

    // Schema v2 añade `system` como preferencia de idioma. Un estado v1 solo
    // podía contener `es` o `en`; se conserva ese valor porque v1 no registraba
    // si provenía del default o de un override explícito del usuario.
    if state.schema_version == 1 {
        state.schema_version = 2;
    }

    validate_preferences(&state.preferences)?;
'''
if old_migration not in text:
    raise SystemExit('migration block not found')
text = text.replace(old_migration, new_migration, 1)

text = text.replace(
    'assert_eq!(state.preferences.language, "es");',
    'assert_eq!(state.preferences.language, "system");',
    1,
)

marker = '''    #[test]
    fn rejects_future_schema_versions() {
'''
new_test = '''    #[test]
    fn migrates_v1_language_without_guessing_user_intent() {
        let mut state = PersistedState::default();
        state.schema_version = 1;
        state.preferences.language = "es".to_string();
        let migrated = migrate_schema(state).expect("v1 should migrate");
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.preferences.language, "es");

        let mut state = PersistedState::default();
        state.schema_version = 1;
        state.preferences.language = "en".to_string();
        let migrated = migrate_schema(state).expect("v1 should migrate");
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.preferences.language, "en");
    }

'''
if marker not in text:
    raise SystemExit('test marker not found')
text = text.replace(marker, new_test + marker, 1)

path.write_text(text, encoding='utf-8')
