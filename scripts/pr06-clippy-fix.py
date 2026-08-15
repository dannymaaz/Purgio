from pathlib import Path

path = Path('src-tauri/src/persistence.rs')
text = path.read_text(encoding='utf-8')
old = '''        let mut preferences = AppPreferences::default();
        preferences.theme = "neon".to_string();
        assert!(validate_preferences(&preferences).is_err());

        let mut preferences = AppPreferences::default();
        preferences.language = "xx".to_string();
        assert!(validate_preferences(&preferences).is_err());
'''
new = '''        let preferences = AppPreferences {
            theme: "neon".to_string(),
            ..AppPreferences::default()
        };
        assert!(validate_preferences(&preferences).is_err());

        let preferences = AppPreferences {
            language: "xx".to_string(),
            ..AppPreferences::default()
        };
        assert!(validate_preferences(&preferences).is_err());
'''
if old not in text:
    raise SystemExit('target test block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
