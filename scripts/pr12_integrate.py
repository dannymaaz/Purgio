from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)

# Rust command registration
path = Path('src-tauri/src/lib.rs')
text = path.read_text()
text = replace_once(text, 'mod chrome_ai;\n', 'mod chrome_ai;\nmod component_store;\n', 'component module')
text = replace_once(
    text,
    '#[tauri::command]\nfn get_chrome_on_device_model_info() -> chrome_ai::ChromeOnDeviceModelInfo {\n    chrome_ai::get_chrome_on_device_model_info()\n}\n',
    '#[tauri::command]\nfn get_chrome_on_device_model_info() -> chrome_ai::ChromeOnDeviceModelInfo {\n    chrome_ai::get_chrome_on_device_model_info()\n}\n\n#[tauri::command]\nfn analyze_component_store() -> component_store::ComponentStoreResult {\n    component_store::analyze_component_store()\n}\n\n#[tauri::command]\nfn start_component_cleanup() -> component_store::ComponentStoreResult {\n    component_store::start_component_cleanup()\n}\n',
    'component commands',
)
text = replace_once(
    text,
    '            get_chrome_on_device_model_info,\n',
    '            get_chrome_on_device_model_info,\n            analyze_component_store,\n            start_component_cleanup,\n',
    'handler registration',
)
path.write_text(text)

# Cleaner panel
path = Path('src/pages/Cleaner.tsx')
text = path.read_text()
text = replace_once(
    text,
    "import { formatBytes } from '../utils/format';\n",
    "import { formatBytes } from '../utils/format';\nimport { ComponentStorePanel } from './ComponentStore';\n",
    'Cleaner import',
)
text = replace_once(
    text,
    '      )}\n    </div>\n  );\n};\n',
    '      )}\n\n      <ComponentStorePanel />\n    </div>\n  );\n};\n',
    'Cleaner panel',
)
path.write_text(text)

# Localization
path = Path('src/i18n.tsx')
text = path.read_text()
anchor = "  // Backend metadata shown to the user\n"
translations = """  'Almacén de componentes de Windows': 'Windows Component Store',
  'Purgio usa DISM, la herramienta de mantenimiento de Windows, para analizar WinSxS. Nunca borra esta carpeta manualmente.': 'Purgio uses DISM, the Windows servicing tool, to analyze WinSxS. It never deletes this folder manually.',
  'Analizando...': 'Analyzing...',
  'Analizar Component Store': 'Analyze Component Store',
  'DISM requiere permisos de administrador. Cierra Purgio y vuelve a abrirlo como administrador para analizar o limpiar el Component Store.': 'DISM requires administrator permissions. Close Purgio and reopen it as administrator to analyze or clean the Component Store.',
  'Tamaño reportado por Explorer': 'Explorer reported size',
  'Tamaño real del Component Store': 'Actual Component Store size',
  'Paquetes recuperables': 'Reclaimable packages',
  'Limpieza recomendada por DISM': 'Cleanup recommended by DISM',
  'No disponible': 'Not available',
  'Sí': 'Yes',
  'No': 'No',
  'Última limpieza reportada por DISM': 'Last cleanup reported by DISM',
  'Entiendo que esta es una operación de mantenimiento de Windows. Purgio usará únicamente StartComponentCleanup, no ResetBase, y no reiniciará el equipo automáticamente.': 'I understand this is a Windows servicing operation. Purgio will use only StartComponentCleanup, not ResetBase, and will not restart the computer automatically.',
  'Limpiando Component Store...': 'Cleaning Component Store...',
  'Ejecutar limpieza estándar de Windows': 'Run standard Windows cleanup',
  'DISM no pudo completar la operación.': 'DISM could not complete the operation.',
  'Código de salida': 'Exit code',
  'Ver salida de diagnóstico de DISM': 'View DISM diagnostic output',
  'ResetBase no forma parte de este flujo porque impediría desinstalar actualizaciones de Windows que ya estén instaladas.': 'ResetBase is not part of this flow because it would prevent uninstalling Windows updates that are already installed.',

"""
text = replace_once(text, anchor, translations + anchor, 'i18n anchor')
path.write_text(text)

# CI formatting scope
path = Path('.github/workflows/ci.yml')
text = path.read_text()
old = 'rustfmt --edition 2021 --check src-tauri/src/chrome_ai.rs src-tauri/src/scanner.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs'
new = old + ' src-tauri/src/component_store.rs'
text = replace_once(text, old, new, 'rustfmt command')
path.write_text(text)
