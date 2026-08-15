export type UiLanguage = 'es' | 'en';
export type LanguagePreference = 'system' | UiLanguage;

/**
 * Resolves Purgio's persisted language preference into the active UI language.
 * Explicit overrides always win. System mode supports Spanish BCP-47 tags and
 * uses English as the neutral fallback for unsupported or missing locales.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLocale: string | null | undefined,
): UiLanguage {
  if (preference === 'es' || preference === 'en') return preference;

  const normalized = systemLocale?.trim().toLowerCase() ?? '';
  return normalized === 'es'
    || normalized.startsWith('es-')
    || normalized.startsWith('es_')
    ? 'es'
    : 'en';
}
