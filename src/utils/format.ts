// utils/format.ts — Funciones de formato compartidas en toda la aplicación Purgio

/**
 * Convierte bytes a unidad legible (KB, MB, GB, TB)
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Retorna el tiempo relativo en español ("hace X minutos", "hace X horas", etc.)
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'hace unos segundos';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
};

/**
 * Retorna el porcentaje de uso formateado
 */
export const formatPercent = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

/**
 * Determina el color de umbral para barras de progreso
 * < 70% → 'good', 70-89% → 'warning', >= 90% → 'danger'
 */
export const getThresholdClass = (percent: number): 'good' | 'warning' | 'danger' => {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'good';
};
