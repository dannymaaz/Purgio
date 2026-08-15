from pathlib import Path

scanner_path = Path('src-tauri/src/scanner.rs')
scanner = scanner_path.read_text()
start = scanner.index('        // Windows Error Reporting')
end = scanner.index('        // DirectX Shader Cache.', start)
replacement = r'''        // Volcados de aplicaciones del perfil actual. Se autorizan solo .dmp
        // exactos y se muestran como Review porque son evidencia de diagnóstico.
        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let crash_dumps = PathBuf::from(local_appdata).join("CrashDumps");
            let mut crash_dump_paths = Vec::new();
            let mut crash_dump_size = 0;

            if let Ok(entries) = fs::read_dir(&crash_dumps) {
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
                        crash_dump_size += metadata.len();
                        crash_dump_paths.push(entry_path.to_string_lossy().to_string());
                    }
                }
            }

            crash_dump_paths.sort();
            crash_dump_paths.dedup();
            if !crash_dump_paths.is_empty() {
                items.push(CleanableItem::new(
                    "win_wer",
                    "Volcados de Errores de Aplicaciones",
                    crash_dump_size,
                    crash_dump_paths,
                    RiskLevel::Review,
                    "Archivos .dmp creados en tu perfil cuando una aplicación falla y Windows guarda información para diagnóstico.",
                    "Solo se eliminarán los dumps mostrados en el Cleanup Plan. Después no podrás usarlos para investigar esos fallos anteriores.",
                    "Eliminar solo si no necesitas diagnosticar cierres o bloqueos recientes.",
                    "diagnostics",
                ));
            }
        }

'''
scanner = scanner[:start] + replacement + scanner[end:]
scanner_path.write_text(scanner)

i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
anchor = "  'Volcados de Memoria de Errores de Windows': 'Windows Error Memory Dumps',\n"
if anchor not in i18n:
    raise SystemExit('Missing diagnostics translation anchor')
translations = """  'Volcados de Errores de Aplicaciones': 'Application Error Dumps',
  'Archivos .dmp creados en tu perfil cuando una aplicación falla y Windows guarda información para diagnóstico.': '.dmp files created in your profile when an application fails and Windows saves diagnostic information.',
  'Solo se eliminarán los dumps mostrados en el Cleanup Plan. Después no podrás usarlos para investigar esos fallos anteriores.': 'Only the dumps shown in the Cleanup Plan will be removed. Afterwards you will not be able to use them to investigate those previous failures.',
  'Eliminar solo si no necesitas diagnosticar cierres o bloqueos recientes.': 'Remove only if you do not need to diagnose recent crashes or hangs.',
"""
if "  'Volcados de Errores de Aplicaciones': 'Application Error Dumps',\n" not in i18n:
    i18n = i18n.replace(anchor, anchor + translations, 1)
i18n_path.write_text(i18n)
