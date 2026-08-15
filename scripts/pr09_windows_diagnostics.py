from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


scanner_path = Path('src-tauri/src/scanner.rs')
scanner = scanner_path.read_text()

# Add exact Windows diagnostic dump targets before leaving the Windows block.
marker = '''        // DirectX Shader Cache. Microsoft documenta las cachés D3D12 por defecto como
'''
start = scanner.index(marker)
windows_end = scanner.index('    #[cfg(target_os = "macos")]', start)
windows_section = scanner[start:windows_end]
if 'win_error_dumps' not in windows_section:
    insert_at = windows_section.rfind('    }\n\n')
    if insert_at < 0:
        raise SystemExit('Could not find Windows block closing marker')
    dump_block = r'''
        // Volcados de errores del sistema. Son útiles para diagnóstico, por eso
        // se muestran como Review y se autorizan únicamente archivos .dmp exactos.
        let mut dump_paths = Vec::new();
        let mut dump_size = 0;

        let memory_dump = PathBuf::from(r"C:\Windows\MEMORY.DMP");
        if let Ok(metadata) = fs::symlink_metadata(&memory_dump) {
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && !safety::metadata_is_reparse_point(&metadata)
                && !safety::is_path_critical(&memory_dump.to_string_lossy())
            {
                dump_size += metadata.len();
                dump_paths.push(memory_dump.to_string_lossy().to_string());
            }
        }

        let minidump_dir = PathBuf::from(r"C:\Windows\Minidump");
        if let Ok(entries) = fs::read_dir(&minidump_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let is_dump = entry_path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| extension.eq_ignore_ascii_case("dmp"))
                    .unwrap_or(false);
                if !is_dump {
                    continue;
                }

                let metadata = match fs::symlink_metadata(&entry_path) {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };

                if metadata.is_file()
                    && !metadata.file_type().is_symlink()
                    && !safety::metadata_is_reparse_point(&metadata)
                    && !safety::is_path_critical(&entry_path.to_string_lossy())
                {
                    dump_size += metadata.len();
                    dump_paths.push(entry_path.to_string_lossy().to_string());
                }
            }
        }

        dump_paths.sort();
        dump_paths.dedup();
        if !dump_paths.is_empty() {
            items.push(CleanableItem::new(
                "win_error_dumps",
                "Volcados de Memoria de Errores de Windows",
                dump_size,
                dump_paths,
                RiskLevel::Review,
                "Archivos MEMORY.DMP y Minidump/*.dmp generados para diagnosticar fallos, bloqueos y pantallas azules.",
                "Se eliminarán únicamente los archivos .dmp mostrados en el Cleanup Plan. Perderás información útil para investigar fallos anteriores.",
                "Eliminar solo si no estás diagnosticando un fallo reciente.",
                "diagnostics",
            ));
        }
'''
    windows_section = windows_section[:insert_at] + dump_block + windows_section[insert_at:]
    scanner = scanner[:start] + windows_section + scanner[windows_end:]

# Remove direct traversal/deletion of C:\$Recycle.Bin. This can cross SID scopes.
recycle_start = scanner.index('    // 2. Papelera de reciclaje')
mac_recycle = scanner.index('    #[cfg(target_os = "macos")]', recycle_start)
replacement = r'''    // 2. Papelera de reciclaje
    // Windows se omite intencionalmente aquí: borrar C:\$Recycle.Bin como una
    // ruta normal puede abarcar contenedores pertenecientes a otros SID. La
    // funcionalidad volverá únicamente mediante SHQueryRecycleBin/SHEmptyRecycleBin.

'''
scanner = scanner[:recycle_start] + replacement + scanner[mac_recycle:]
scanner_path.write_text(scanner)

# Localize new backend metadata.
i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
anchor = "  'Caché de Shaders de DirectX': 'DirectX Shader Cache',\n"
if anchor not in i18n:
    raise SystemExit('Missing DirectX translation anchor')
translations = """  'Volcados de Memoria de Errores de Windows': 'Windows Error Memory Dumps',
  'Archivos MEMORY.DMP y Minidump/*.dmp generados para diagnosticar fallos, bloqueos y pantallas azules.': 'MEMORY.DMP and Minidump/*.dmp files generated to diagnose failures, crashes, and blue screens.',
  'Se eliminarán únicamente los archivos .dmp mostrados en el Cleanup Plan. Perderás información útil para investigar fallos anteriores.': 'Only the .dmp files shown in the Cleanup Plan will be removed. You will lose information useful for investigating previous failures.',
  'Eliminar solo si no estás diagnosticando un fallo reciente.': 'Remove only if you are not diagnosing a recent failure.',
"""
if "  'Volcados de Memoria de Errores de Windows': 'Windows Error Memory Dumps',\n" not in i18n:
    i18n = i18n.replace(anchor, anchor + translations, 1)
i18n_path.write_text(i18n)
