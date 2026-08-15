import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
const text = readFileSync(path, 'utf8');
const oldBlock = `      const bytesFreed = await invoke<number>('clean_items', { items: selected });

      // Guardar en historial
      await addHistoryEntry(bytesFreed, selected.length);

      addToast(
        \`✓ Limpieza completada. Se liberaron \${formatBytes(bytesFreed)} de espacio.\`,
        'success',
        5000
      );
`;
const newBlock = `      const bytesFreed = await invoke<number>('clean_items', { items: selected });

      // La limpieza y el historial son resultados independientes: una falla al
      // persistir el registro no puede reinterpretar una eliminación ya completada.
      try {
        await addHistoryEntry(bytesFreed, selected.length);
      } catch (historyError) {
        console.error('La limpieza terminó pero no se pudo guardar el historial:', historyError);
        addToast(
          'La limpieza se completó, pero no se pudo guardar la entrada en el historial.',
          'warning',
          6000
        );
      }

      addToast(
        \`✓ Limpieza completada. Se liberaron \${formatBytes(bytesFreed)} de espacio.\`,
        'success',
        5000
      );
`;

if (!text.includes(oldBlock)) {
  throw new Error('cleanup history block not found');
}

writeFileSync(path, text.replace(oldBlock, newBlock), 'utf8');
