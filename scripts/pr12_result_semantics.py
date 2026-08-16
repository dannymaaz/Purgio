from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)

# Rust result contract
path = Path('src-tauri/src/component_store.rs')
text = path.read_text()
text = replace_once(
    text,
    'pub struct ComponentStoreResult {\n    pub success: bool,\n    pub requires_elevation: bool,',
    'pub struct ComponentStoreResult {\n    pub success: bool,\n    pub cleanup_completed: bool,\n    pub requires_elevation: bool,',
    'result cleanup_completed field',
)
text = text.replace(
    'ComponentStoreResult {\n                success: output.status.success(),\n                requires_elevation,',
    'ComponentStoreResult {\n                success: output.status.success(),\n                cleanup_completed: false,\n                requires_elevation,',
)
text = text.replace(
    'ComponentStoreResult {\n            success: false,\n            requires_elevation: false,',
    'ComponentStoreResult {\n            success: false,\n            cleanup_completed: false,\n            requires_elevation: false,',
)
text = text.replace(
    'ComponentStoreResult {\n        success: false,\n        requires_elevation: false,',
    'ComponentStoreResult {\n        success: false,\n        cleanup_completed: false,\n        requires_elevation: false,',
)
text = replace_once(
    text,
    '    let mut after = analyze_component_store();\n    if after.success {',
    '    let mut after = analyze_component_store();\n    after.cleanup_completed = true;\n    if after.success {',
    'mark successful cleanup before reanalysis outcome',
)
path.write_text(text)

# Frontend result semantics
path = Path('src/pages/ComponentStore.tsx')
text = path.read_text()
text = replace_once(
    text,
    'interface ComponentStoreResult {\n  success: boolean;\n  requires_elevation: boolean;',
    'interface ComponentStoreResult {\n  success: boolean;\n  cleanup_completed: boolean;\n  requires_elevation: boolean;',
    'frontend cleanup_completed field',
)
text = text.replace(
    "{ success: false, requires_elevation: false, message: String(error), analysis: null, stdout: '', stderr: '' }",
    "{ success: false, cleanup_completed: false, requires_elevation: false, message: String(error), analysis: null, stdout: '', stderr: '' }",
)
anchor = """      {result && !result.success && !result.requires_elevation && (\n        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '13px' }}>\n          <strong>{t('DISM no pudo completar la operación.')}</strong>\n"""
replacement = """      {result?.cleanup_completed && result.success && (\n        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--success-bg)', color: 'var(--success)', fontSize: '13px' }}>\n          {t('Limpieza estándar completada y Component Store reanalizado.')}\n        </div>\n      )}\n\n      {result?.cleanup_completed && !result.success && (\n        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '13px' }}>\n          <strong>{t('La limpieza estándar terminó, pero Purgio no pudo reanalizar el Component Store. La limpieza ya se ejecutó; revisa la salida de DISM antes de volver a intentarlo.')}</strong>\n          {result.exit_code !== null && result.exit_code !== undefined && <div style={{ marginTop: '4px' }}>{t('Código de salida')}: {result.exit_code}</div>}\n        </div>\n      )}\n\n      {result && !result.success && !result.requires_elevation && !result.cleanup_completed && (\n        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '13px' }}>\n          <strong>{t('DISM no pudo completar la operación.')}</strong>\n"""
text = replace_once(text, anchor, replacement, 'frontend result status blocks')
path.write_text(text)

# Localization
path = Path('src/i18n.tsx')
text = path.read_text()
anchor = "  'DISM no pudo completar la operación.': 'DISM could not complete the operation.',\n"
additions = """  'Limpieza estándar completada y Component Store reanalizado.': 'Standard cleanup completed and the Component Store was analyzed again.',\n  'La limpieza estándar terminó, pero Purgio no pudo reanalizar el Component Store. La limpieza ya se ejecutó; revisa la salida de DISM antes de volver a intentarlo.': 'Standard cleanup finished, but Purgio could not analyze the Component Store again. Cleanup has already run; review the DISM output before trying again.',\n"""
if additions.strip() not in text:
    text = replace_once(text, anchor, anchor + additions, 'component store result translations')
path.write_text(text)

# Durable documentation
path = Path('docs/PR-12.md')
text = path.read_text()
section = """
## Cleanup vs. reanalysis result semantics

`StartComponentCleanup` and the post-cleanup `AnalyzeComponentStore` are two distinct outcomes. The result contract therefore exposes `cleanup_completed` separately from the overall `success` flag.

If cleanup succeeds but the reanalysis fails, Purgio reports a partial servicing outcome: it states that cleanup already ran, does not present the maintenance operation itself as failed, and shows bounded DISM diagnostics before the user decides whether to analyze again. This prevents a retry prompt from implying that the destructive servicing step did not already occur.
"""
if '## Cleanup vs. reanalysis result semantics' not in text:
    text += section
path.write_text(text)
