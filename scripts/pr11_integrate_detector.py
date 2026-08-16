from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)

# Rust command wiring.
lib_path = Path('src-tauri/src/lib.rs')
lib = lib_path.read_text()
lib = replace_once(lib, 'mod cleaner;\n', 'mod chrome_ai;\nmod cleaner;\n', 'lib module anchor')
lib = replace_once(
    lib,
    '''#[tauri::command]\nfn scan_browser_files() -> Vec<CleanableItem> {\n    scanner::scan_browser_files()\n}\n''',
    '''#[tauri::command]\nfn scan_browser_files() -> Vec<CleanableItem> {\n    scanner::scan_browser_files()\n}\n\n#[tauri::command]\nfn get_chrome_on_device_model_info() -> chrome_ai::ChromeOnDeviceModelInfo {\n    chrome_ai::get_chrome_on_device_model_info()\n}\n''',
    'browser scan command anchor',
)
lib = replace_once(
    lib,
    '            scan_browser_files,\n            preview_clean_items,\n',
    '            scan_browser_files,\n            get_chrome_on_device_model_info,\n            preview_clean_items,\n',
    'invoke handler anchor',
)
lib_path.write_text(lib)

# Browsers UI and exported detector types.
browsers_path = Path('src/pages/Browsers.tsx')
browsers = browsers_path.read_text()
browsers = replace_once(
    browsers,
    '''interface BrowsersProps {\n  items: CleanableItem[];\n''',
    '''export interface ChromeModelVersion {\n  version: string;\n  path: string;\n  size: number;\n}\n\nexport interface ChromeOnDeviceModelInfo {\n  installed: boolean;\n  component_name: string;\n  component_id: string;\n  root_path: string | null;\n  total_size: number;\n  versions: ChromeModelVersion[];\n  management_url: string;\n}\n\ninterface BrowsersProps {\n  items: CleanableItem[];\n''',
    'Browsers props interface',
)
browsers = replace_once(
    browsers,
    '''  handleScan?: () => void;\n}\n''',
    '''  handleScan?: () => void;\n  chromeOnDeviceModel?: ChromeOnDeviceModelInfo | null;\n}\n''',
    'Browsers optional detector prop',
)
browsers = replace_once(
    browsers,
    '''  scanStatus = 'idle',\n  handleScan\n}) => {\n''',
    '''  scanStatus = 'idle',\n  handleScan,\n  chromeOnDeviceModel\n}) => {\n''',
    'Browsers destructuring',
)

header_end = '''      </div>\n\n      {scanStatus === 'scanning' ? renderSkeletons() : scanStatus === 'idle' ? (\n'''
model_card = '''      </div>\n\n      {chromeOnDeviceModel && (\n        <div className="card" style={{ marginBottom: '18px', padding: '18px 20px' }}>\n          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>\n            <div>\n              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>\n                <h3 style={{ margin: 0, fontSize: '15px' }}>{t('Modelo IA local de Chrome')}</h3>\n                <span className={`badge ${chromeOnDeviceModel.installed ? 'badge-review' : 'badge-safe'}`}>\n                  {t(chromeOnDeviceModel.installed ? 'Detectado' : 'No detectado')}\n                </span>\n              </div>\n              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '6px 0 0', lineHeight: 1.5 }}>\n                {t('Componente administrado por Google Chrome para funciones de IA integradas en el dispositivo.')}\n              </p>\n            </div>\n            {chromeOnDeviceModel.installed && (\n              <strong style={{ fontSize: '15px', whiteSpace: 'nowrap' }}>{formatBytes(chromeOnDeviceModel.total_size, language)}</strong>\n            )}\n          </div>\n\n          {chromeOnDeviceModel.installed ? (\n            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>\n              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: '8px', fontSize: '12px' }}>\n                <span style={{ color: 'var(--text-muted)' }}>{t('ID del componente')}</span>\n                <code style={{ overflowWrap: 'anywhere' }}>{chromeOnDeviceModel.component_id}</code>\n                <span style={{ color: 'var(--text-muted)' }}>{t('Versiones verificadas')}</span>\n                <span>{chromeOnDeviceModel.versions.map(version => version.version).join(', ')}</span>\n                {chromeOnDeviceModel.root_path && (<>\n                  <span style={{ color: 'var(--text-muted)' }}>{t('Ruta detectada')}</span>\n                  <code style={{ overflowWrap: 'anywhere' }}>{chromeOnDeviceModel.root_path}</code>\n                </>)}\n              </div>\n\n              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>\n                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55 }}>\n                  {t('Purgio no elimina esta carpeta manualmente porque Chrome administra su ciclo de vida mediante Component Updater.')}\n                </p>\n                <p style={{ margin: '7px 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>\n                  {t('Para desinstalar el modelo de forma segura, abre esta dirección en Google Chrome y usa el botón Uninstall:')}\n                  {' '}<code>{chromeOnDeviceModel.management_url}</code>\n                </p>\n                <p style={{ margin: '7px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>\n                  {t('Chrome puede volver a descargar el modelo más adelante si una función de IA integrada lo necesita y el equipo vuelve a ser elegible.')}\n                </p>\n              </div>\n            </div>\n          ) : (\n            <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>\n              {t('No se detectó una instalación verificable del modelo local administrado por Chrome.')}\n            </p>\n          )}\n        </div>\n      )}\n\n      {scanStatus === 'scanning' ? renderSkeletons() : scanStatus === 'idle' ? (\n'''
browsers = replace_once(browsers, header_end, model_card, 'Browsers render anchor')
browsers_path.write_text(browsers)

# App state + scan command + prop wiring.
app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(
    app,
    "import { Browsers } from './pages/Browsers';\n",
    "import { Browsers, type ChromeOnDeviceModelInfo } from './pages/Browsers';\n",
    'App Browsers import',
)
app = replace_once(
    app,
    '''  const [cleanableItems, setCleanableItems] = useState<CleanableItem[]>([]);\n''',
    '''  const [cleanableItems, setCleanableItems] = useState<CleanableItem[]>([]);\n  const [chromeOnDeviceModel, setChromeOnDeviceModel] = useState<ChromeOnDeviceModelInfo | null>(null);\n''',
    'App cleanable state',
)
app = replace_once(
    app,
    '''      const allBrowsers = await invoke<CleanableItem[]>('scan_browser_files');\n      const browserFiles = showSensitive\n''',
    '''      const allBrowsers = await invoke<CleanableItem[]>('scan_browser_files');\n      try {\n        const modelInfo = await invoke<ChromeOnDeviceModelInfo>('get_chrome_on_device_model_info');\n        setChromeOnDeviceModel(modelInfo);\n      } catch (error) {\n        console.error('Error al detectar el modelo IA local de Chrome:', error);\n        setChromeOnDeviceModel(null);\n      }\n      const browserFiles = showSensitive\n''',
    'App scan browser command',
)

browsers_render = '''            <Browsers\n              items={cleanableItems}\n              setItems={setCleanableItems}\n              handleClean={prepareClean}\n              isCleaning={isCleaning}\n              scanStatus={scanStatus}\n              handleScan={handleScan}\n            />\n'''
if browsers_render not in app:
    # The exact handler name can vary; locate the component conservatively.
    start = app.find('            <Browsers\n')
    if start == -1:
        raise SystemExit('Missing Browsers component render')
    end = app.find('            />', start)
    if end == -1:
        raise SystemExit('Missing Browsers component end')
    end += len('            />')
    block = app[start:end]
    if 'chromeOnDeviceModel=' not in block:
        block = block.replace('            />', '              chromeOnDeviceModel={chromeOnDeviceModel}\n            />')
        app = app[:start] + block + app[end:]
else:
    app = app.replace(
        browsers_render,
        browsers_render.replace('            />\n', '              chromeOnDeviceModel={chromeOnDeviceModel}\n            />\n'),
        1,
    )
app_path.write_text(app)

# i18n copy.
i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
i18n_anchor = "  'Proceso del sistema operativo esencial.': 'Essential operating system process.',\n"
if i18n_anchor not in i18n:
    raise SystemExit('Missing i18n final anchor')
i18n_additions = """  'Modelo IA local de Chrome': 'Chrome Local AI Model',
  'Detectado': 'Detected',
  'No detectado': 'Not detected',
  'Componente administrado por Google Chrome para funciones de IA integradas en el dispositivo.': 'Component managed by Google Chrome for built-in on-device AI features.',
  'ID del componente': 'Component ID',
  'Versiones verificadas': 'Verified versions',
  'Ruta detectada': 'Detected path',
  'Purgio no elimina esta carpeta manualmente porque Chrome administra su ciclo de vida mediante Component Updater.': 'Purgio does not delete this folder manually because Chrome manages its lifecycle through Component Updater.',
  'Para desinstalar el modelo de forma segura, abre esta dirección en Google Chrome y usa el botón Uninstall:': 'To uninstall the model safely, open this address in Google Chrome and use the Uninstall button:',
  'Chrome puede volver a descargar el modelo más adelante si una función de IA integrada lo necesita y el equipo vuelve a ser elegible.': 'Chrome may download the model again later if a built-in AI feature needs it and the device becomes eligible again.',
  'No se detectó una instalación verificable del modelo local administrado por Chrome.': 'No verifiable installation of Chrome\'s managed local model was detected.',
"""
i18n = i18n.replace(i18n_anchor, i18n_anchor + i18n_additions, 1)
i18n_path.write_text(i18n)

# CI: include the standalone detector module in focal rustfmt checks.
ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text()
old_cmd = 'rustfmt --edition 2021 --check src-tauri/src/scanner.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs'
new_cmd = 'rustfmt --edition 2021 --check src-tauri/src/chrome_ai.rs src-tauri/src/scanner.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs'
if old_cmd not in ci:
    raise SystemExit('Missing CI rustfmt command')
ci = ci.replace(old_cmd, new_cmd, 1)
ci_path.write_text(ci)
