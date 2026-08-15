from pathlib import Path

path = Path('src-tauri/src/persistence.rs')
text = path.read_text(encoding='utf-8')
old = '''    #[test]
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
new = '''    #[test]
    fn migrates_v1_language_without_guessing_user_intent() {
        let state = PersistedState {
            schema_version: 1,
            preferences: AppPreferences {
                language: "es".to_string(),
                ..AppPreferences::default()
            },
            ..PersistedState::default()
        };
        let migrated = migrate_schema(state).expect("v1 should migrate");
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.preferences.language, "es");

        let state = PersistedState {
            schema_version: 1,
            preferences: AppPreferences {
                language: "en".to_string(),
                ..AppPreferences::default()
            },
            ..PersistedState::default()
        };
        let migrated = migrate_schema(state).expect("v1 should migrate");
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.preferences.language, "en");
    }
'''
if old not in text:
    raise SystemExit('PR-07 migration test block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
