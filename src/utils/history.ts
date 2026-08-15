import { invoke } from '@tauri-apps/api/core';

export interface CleanHistoryEntry {
  timestamp: number;
  bytesFreed: number;
  itemCount: number;
}

interface PersistedHistoryEntry {
  timestamp: number;
  bytes_freed: number;
  item_count: number;
}

interface PersistedState {
  history: PersistedHistoryEntry[];
}

const LEGACY_HISTORY_KEY = 'purgio-clean-history';
const MAX_ENTRIES = 50;

const fromPersistedEntry = (entry: PersistedHistoryEntry): CleanHistoryEntry => ({
  timestamp: entry.timestamp,
  bytesFreed: entry.bytes_freed,
  itemCount: entry.item_count,
});

/**
 * Lee el historial legacy del WebView únicamente para la migración inicial.
 * Los datos inválidos se descartan y nunca vuelven a ser fuente de verdad.
 */
export const readLegacyHistory = (): CleanHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is CleanHistoryEntry => (
        typeof entry?.timestamp === 'number' && entry.timestamp > 0
        && typeof entry?.bytesFreed === 'number' && entry.bytesFreed >= 0
        && typeof entry?.itemCount === 'number' && entry.itemCount > 0
      ))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
};

/** Elimina el historial legacy únicamente después de confirmar la migración. */
export const clearLegacyHistory = (): void => {
  localStorage.removeItem(LEGACY_HISTORY_KEY);
};

/** Agrega una limpieza al estado persistente administrado por Rust. */
export const addHistoryEntry = async (bytesFreed: number, itemCount: number): Promise<void> => {
  await invoke<PersistedHistoryEntry[]>('add_history_entry', { bytesFreed, itemCount });
};

/** Retorna todas las entradas persistidas en app_config_dir. */
export const getHistory = async (): Promise<CleanHistoryEntry[]> => {
  const state = await invoke<PersistedState>('load_app_state');
  return state.history.map(fromPersistedEntry);
};

/** Retorna el total histórico de bytes liberados. */
export const getTotalBytesFreed = async (): Promise<number> => {
  const history = await getHistory();
  return history.reduce((sum, entry) => sum + entry.bytesFreed, 0);
};

/** Limpia el historial persistente. */
export const clearHistory = async (): Promise<void> => {
  await invoke('clear_history');
};
