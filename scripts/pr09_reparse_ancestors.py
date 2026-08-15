from pathlib import Path

path = Path('src-tauri/src/scanner.rs')
text = path.read_text()

old = '''        if safety::is_path_critical(&path_str) {
            return 0;
        }

        let metadata = match fs::symlink_metadata(path) {
'''
new = '''        if safety::is_path_critical(&path_str) || safety::has_windows_reparse_ancestor(path) {
            return 0;
        }

        let metadata = match fs::symlink_metadata(path) {
'''
if old not in text:
    raise SystemExit('Missing get_dir_size safety marker')
text = text.replace(old, new, 1)

old = '''                        if safety::metadata_is_reparse_point(&metadata)
                            || metadata.file_type().is_symlink()
                            || !metadata.is_file()
                        {
'''
new = '''                        if safety::metadata_is_reparse_point(&metadata)
                            || metadata.file_type().is_symlink()
                            || safety::has_windows_reparse_ancestor(&entry_path)
                            || !metadata.is_file()
                        {
'''
if old not in text:
    raise SystemExit('Missing thumbnail metadata marker')
text = text.replace(old, new, 1)

# Application CrashDumps and system Minidump candidates use the same condition shape.
old = '''                    if metadata.is_file()
                        && !metadata.file_type().is_symlink()
                        && !safety::metadata_is_reparse_point(&metadata)
                        && !safety::is_path_critical(&entry_path.to_string_lossy())
                    {
'''
new = '''                    if metadata.is_file()
                        && !metadata.file_type().is_symlink()
                        && !safety::metadata_is_reparse_point(&metadata)
                        && !safety::has_windows_reparse_ancestor(&entry_path)
                        && !safety::is_path_critical(&entry_path.to_string_lossy())
                    {
'''
count = text.count(old)
if count < 2:
    raise SystemExit(f'Expected at least two dump candidate markers, found {count}')
text = text.replace(old, new)

old = '''            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && !safety::metadata_is_reparse_point(&metadata)
                && !safety::is_path_critical(&memory_dump.to_string_lossy())
            {
'''
new = '''            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && !safety::metadata_is_reparse_point(&metadata)
                && !safety::has_windows_reparse_ancestor(&memory_dump)
                && !safety::is_path_critical(&memory_dump.to_string_lossy())
            {
'''
if old not in text:
    raise SystemExit('Missing MEMORY.DMP marker')
text = text.replace(old, new, 1)

path.write_text(text)
