from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    "import { invoke } from '@tauri-apps/api/core';",
    "import { invoke } from '@tauri-apps/api/core';\nimport { locale as getSystemLocale } from '@tauri-apps/plugin-os';",
    1,
)
text = text.replace(
    "import { addHistoryEntry, clearLegacyHistory, readLegacyHistory } from './utils/history';",
    "import { addHistoryEntry, clearLegacyHistory, readLegacyHistory } from './utils/history';\nimport { I18nProvider, LanguagePreference, resolveLanguage, translate } from './i18n';",
    1,
)
text = text.replace(
    "    language: 'es' | 'en';",
    "    language: LanguagePreference;",
    1,
)
text = text.replace(
    "  const [lang, setLang] = useState<'es' | 'en'>('es');",
    "  const [lang, setLang] = useState<LanguagePreference>('system');",
    1,
)
text = text.replace(
    "  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);",
    "  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);\n  const [systemLocale, setSystemLocale] = useState<string | null>(null);",
    1,
)

marker = """  // Toast notifications
  const { toasts, addToast, removeToast } = useToast();
"""
insert = marker + """

  // El idioma efectivo se resuelve de forma separada a la preferencia persistida.
  // `system` sigue los cambios del locale del sistema entre reinicios sin convertirlos
  // en un override guardado por accidente.
  const activeLanguage = useMemo(
    () => resolveLanguage(lang, systemLocale),
    [lang, systemLocale]
  );
  const t = useCallback(
    (source: string, values?: Record<string, string | number>) => translate(activeLanguage, source, values),
    [activeLanguage]
  );

  useEffect(() => {
    let cancelled = false;
    getSystemLocale()
      .then((detected) => {
        if (!cancelled) setSystemLocale(detected ?? navigator.language ?? null);
      })
      .catch((error) => {
        console.error('Error al detectar el idioma del sistema:', error);
        if (!cancelled) setSystemLocale(navigator.language ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
"""
if marker not in text:
    raise SystemExit('toast marker not found')
text = text.replace(marker, insert, 1)

# Translate the most important App-level messages while keeping diagnostics in Spanish logs.
replacements = {
    "addToast('Descargando y verificando la actualización…', 'info', 5000);": "addToast(t('Descargando y verificando la actualización…'), 'info', 5000);",
    "addToast('La limpieza se completó, pero no se pudo guardar la entrada en el historial.',": "addToast(t('La limpieza se completó, pero no se pudo guardar la entrada en el historial.'),",
    "addToast('No se pudieron guardar los cambios de configuración.', 'error', 5000);": "addToast(t('No se pudieron guardar los cambios de configuración.'), 'error', 5000);",
    "addToast('No se pudo cargar la configuración guardada; se mantienen valores seguros sin sobrescribir el archivo.', 'error', 7000);": "addToast(t('No se pudo cargar la configuración guardada; se mantienen valores seguros sin sobrescribir el archivo.'), 'error', 7000);",
}
for old, new in replacements.items():
    if old in text:
        text = text.replace(old, new, 1)

# Keep hooks correct after adding t to callbacks that use it.
text = text.replace("  }, [addToast]);\n\n  // Cargar procesos", "  }, [addToast, t]);\n\n  // Cargar procesos", 1)

return_start = """  return (
    <div className=\"app-container\">
"""
return_new = """  return (
    <I18nProvider language={activeLanguage}>
      <div className=\"app-container\">
"""
if return_start not in text:
    raise SystemExit('return start not found')
text = text.replace(return_start, return_new, 1)

return_end = """    </div>
  );
};
"""
return_end_new = """      </div>
    </I18nProvider>
  );
};
"""
if return_end not in text:
    raise SystemExit('return end not found')
text = text.rsplit(return_end, 1)[0] + return_end_new

path.write_text(text, encoding='utf-8')
