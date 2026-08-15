from pathlib import Path

scanner_path = Path('src-tauri/src/scanner.rs')
scanner = scanner_path.read_text()
start = scanner.index('        // DirectX Shader Cache.')
end = scanner.index('        // Volcados de errores del sistema.', start)
scanner = scanner[:start] + scanner[end:]
scanner_path.write_text(scanner)

i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
keys = [
    "  'Caché de Shaders de DirectX': 'DirectX Shader Cache',\n",
    "  'Shaders compilados almacenados temporalmente por DirectX para reducir trabajo repetido de la GPU.': 'Compiled shaders stored temporarily by DirectX to reduce repeated GPU work.',\n",
    "  'Se liberará el almacenamiento temporal detectado. Juegos y aplicaciones pueden recompilar shaders cuando vuelvan a ejecutarse.': 'Detected temporary storage will be freed. Games and applications may recompile shaders the next time they run.',\n",
    "  'Seguro de eliminar; Windows y las aplicaciones recrean la caché cuando es necesaria.': 'Safe to remove; Windows and applications recreate the cache when needed.',\n",
]
for key in keys:
    i18n = i18n.replace(key, '')
i18n_path.write_text(i18n)
