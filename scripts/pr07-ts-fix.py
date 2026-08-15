from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')
app = app.replace(
    "import { I18nProvider, LanguagePreference, resolveLanguage, translateBackendText } from './i18n';",
    "import { I18nProvider, LanguagePreference, resolveLanguage, translate, translateBackendText } from './i18n';",
    1,
)
app_path.write_text(app, encoding='utf-8')

i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text(encoding='utf-8')
i18n = i18n.replace(
    "import type { LanguagePreference, UiLanguage } from './i18n-core';",
    "import type { UiLanguage } from './i18n-core';",
    1,
)
i18n = i18n.replace(
    "(result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),",
    "(result, [key, value]) => result.split(`{{${key}}}`).join(String(value)),",
    1,
)
i18n_path.write_text(i18n, encoding='utf-8')
