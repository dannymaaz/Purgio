import type { UiLanguage } from '../i18n';

const localeFor = (language: UiLanguage): string => language === 'es' ? 'es-GT' : 'en-US';

/** Convierte bytes a una unidad legible respetando el locale activo. */
export const formatBytes = (bytes: number, language: UiLanguage = 'es'): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, index);
  return `${new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 2 }).format(value)} ${sizes[index]}`;
};

/** Retorna tiempo relativo localizado mediante Intl.RelativeTimeFormat. */
export const formatRelativeTime = (timestamp: number, language: UiLanguage = 'es'): string => {
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const relative = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' });
  const absoluteSeconds = Math.abs(diffSeconds);

  if (absoluteSeconds < 60) return relative.format(diffSeconds, 'second');
  const minutes = Math.round(diffSeconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return relative.format(days, 'day');
};

export const formatPercent = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

export const getThresholdClass = (percent: number): 'good' | 'warning' | 'danger' => {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'good';
};
