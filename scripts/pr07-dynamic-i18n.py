from pathlib import Path

# i18n.tsx: use pure locale core and add interpolated messages.
i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text(encoding='utf-8')
i18n = i18n.replace(
    "import React, { createContext, useContext, useMemo } from 'react';\n\nexport type UiLanguage = 'es' | 'en';\nexport type LanguagePreference = 'system' | UiLanguage;",
    "import React, { createContext, useContext, useMemo } from 'react';\nimport type { LanguagePreference, UiLanguage } from './i18n-core';\n\nexport type { LanguagePreference, UiLanguage } from './i18n-core';\nexport { resolveLanguage } from './i18n-core';",
    1,
)
resolve_block = """export function resolveLanguage(preference: LanguagePreference, systemLocale: string | null | undefined): UiLanguage {
  if (preference === 'es' || preference === 'en') return preference;
  const normalized = systemLocale?.trim().toLowerCase() ?? '';
  return normalized === 'es' || normalized.startsWith('es-') || normalized.startsWith('es_') ? 'es' : 'en';
}

"""
if resolve_block not in i18n:
    raise SystemExit('resolveLanguage block not found')
i18n = i18n.replace(resolve_block, '', 1)

marker = "  // Backend/common metadata\n"
messages = """  // Interpolated UI messages
  'Se eliminarán {{count}} elementos liberando {{size}} de espacio. Esta acción es irreversible.': 'This will remove {{count}} items and free {{size}} of space. This action cannot be undone.',
  '…y {{count}} más': '…and {{count}} more',
  '¿Desactivar el inicio automático de {{name}}?': 'Disable automatic startup for {{name}}?',
  'Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.': 'Purgio {{latest}} is available. The currently installed version is {{current}}.',

"""
if marker not in i18n:
    raise SystemExit('backend dictionary marker not found')
i18n = i18n.replace(marker, messages + marker, 1)
i18n_path.write_text(i18n, encoding='utf-8')

# App.tsx: use the interpolated messages and backend-aware clean item labels.
app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')
app = app.replace(
    "import { I18nProvider, LanguagePreference, resolveLanguage, translate } from './i18n';",
    "import { I18nProvider, LanguagePreference, resolveLanguage, translateBackendText } from './i18n';",
    1,
)
old_cleanup = """              <p style={{ marginBottom: '12px' }}>
                Se eliminarán <strong>{itemsToClean.length} elementos</strong> liberando{' '}
                <strong style={{ color: 'var(--accent-aqua)' }}>
                  {formatBytes(itemsToClean.reduce((sum, i) => sum + i.size, 0), activeLanguage)}
                </strong>{' '}
                de espacio. Esta acción es irreversible.
              </p>"""
new_cleanup = """              <p style={{ marginBottom: '12px' }}>
                {t('Se eliminarán {{count}} elementos liberando {{size}} de espacio. Esta acción es irreversible.', {
                  count: itemsToClean.length,
                  size: formatBytes(itemsToClean.reduce((sum, item) => sum + item.size, 0), activeLanguage),
                })}
              </p>"""
if old_cleanup not in app:
    raise SystemExit('cleanup modal text block not found')
app = app.replace(old_cleanup, new_cleanup, 1)
app = app.replace(
    "{translate(activeLanguage, item.name)}</span>",
    "{translateBackendText(activeLanguage, item.name)}</span>",
    1,
)
app = app.replace(
    "                    …y {itemsToClean.length - 6} más",
    "                    {t('…y {{count}} más', { count: itemsToClean.length - 6 })}",
    1,
)
app = app.replace(
    "                ¿Desactivar el inicio automático de <strong>{itemToDisable.name}</strong>?",
    "                {t('¿Desactivar el inicio automático de {{name}}?', { name: itemToDisable.name })}",
    1,
)
app = app.replace(
    "                está disponible. La versión instalada actualmente es {updateInfo.current_version}.",
    "                {t('Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.', { latest: updateInfo.latest_version, current: updateInfo.current_version }).replace(`Purgio ${updateInfo.latest_version}`, '')}",
    1,
)
# Avoid rendering the latest version twice: replace the full paragraph with a clean interpolated sentence.
old_update_para = """              <p>
                <strong style={{ color: 'var(--accent-aqua)' }}>Purgio {updateInfo.latest_version}</strong>{' '}
                {t('Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.', { latest: updateInfo.latest_version, current: updateInfo.current_version }).replace(`Purgio ${updateInfo.latest_version}`, '')}
              </p>"""
new_update_para = """              <p>
                {t('Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.', {
                  latest: updateInfo.latest_version,
                  current: updateInfo.current_version,
                })}
              </p>"""
if old_update_para not in app:
    raise SystemExit('update paragraph block not found after replacement')
app = app.replace(old_update_para, new_update_para, 1)
app_path.write_text(app, encoding='utf-8')
