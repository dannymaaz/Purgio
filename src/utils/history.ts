// utils/history.ts — Gestión del historial de limpiezas en localStorage

export interface CleanHistoryEntry {
  timestamp: number;
  bytesFreed: number;
  itemCount: number;
}

const HISTORY_KEY = 'purgio-clean-history';
const MAX_ENTRIES = 50;

/**
 * Agrega una entrada al historial de limpiezas
 */
export const addHistoryEntry = (bytesFreed: number, itemCount: number): void => {
  const history = getHistory();
  history.unshift({ timestamp: Date.now(), bytesFreed, itemCount });
  // Mantener solo las últimas MAX_ENTRIES entradas
  const trimmed = history.slice(0, MAX_ENTRIES);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
};

/**
 * Retorna todas las entradas del historial
 */
export const getHistory = (): CleanHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/**
 * Retorna el total de bytes liberados históricamente
 */
export const getTotalBytesFreed = (): number => {
  return getHistory().reduce((sum, entry) => sum + entry.bytesFreed, 0);
};

/**
 * Limpia el historial completo
 */
export const clearHistory = (): void => {
  localStorage.removeItem(HISTORY_KEY);
};
