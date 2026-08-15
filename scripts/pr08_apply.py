from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker for {label}")
    return text.replace(old, new, 1)


app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(
    app,
    "import { Cleaner, CleanableItem } from './pages/Cleaner';\n",
    "import { Cleaner, CleanableItem } from './pages/Cleaner';\nimport { CleanupPlan, CleanupRunResult } from './pages/CleanupPlan';\n",
    'CleanupPlan import',
)
app = replace_once(
    app,
    "import { I18nProvider, LanguagePreference, resolveLanguage, translate, translateBackendText } from './i18n';",
    "import { I18nProvider, LanguagePreference, resolveLanguage, translate } from './i18n';",
    'unused backend translation import',
)
app = replace_once(
    app,
    "  const [showCleanModal, setShowCleanModal] = useState<boolean>(false);\n  const [itemsToClean, setItemsToClean] = useState<CleanableItem[]>([]);\n",
    "  const [cleanupPlan, setCleanupPlan] = useState<CleanableItem[]>([]);\n  const [cleanupResult, setCleanupResult] = useState<CleanupRunResult | null>(null);\n  const [isPreparingCleanPlan, setIsPreparingCleanPlan] = useState<boolean>(false);\n",
    'cleanup modal state',
)

start = app.index('  // Limpieza de Elementos Seleccionados')
end = app.index('  // Gestión de Arranque', start)
new_cleanup_flow = '''  // Cleanup Plan backend-authoritative. La UI entrega únicamente IDs; Rust vuelve a
  // resolver catálogo, rutas, riesgos y tamaños inmediatamente antes de mostrar el plan.
  const executeClean = useCallback(async (selected: CleanableItem[]) => {
    if (isCleaning || selected.length === 0) return;

    setIsCleaning(true);
    try {
      const result = await invoke<CleanupRunResult>('clean_items', {
        itemIds: selected.map(item => item.id),
      });
      setCleanupResult(result);

      // Historial y limpieza son resultados independientes. Solo se registra una
      // ejecución real; una falla de persistencia nunca reinterpreta el outcome.
      if (result.items_attempted > 0) {
        try {
          await addHistoryEntry(result.bytes_freed, result.items_attempted);
        } catch (historyError) {
          console.error('La limpieza terminó pero no se pudo guardar el historial:', historyError);
          addToast(
            t('La limpieza se completó, pero no se pudo guardar la entrada en el historial.'),
            'warning',
            6000
          );
        }
      }

      if (result.items_partial > 0 || result.items_failed > 0) {
        addToast(
          `${t('Limpieza terminada con incidencias. Se liberaron')} ${formatBytes(result.bytes_freed, activeLanguage)} ${t('de espacio.')}`,
          'warning',
          7000
        );
      } else {
        addToast(
          `${t('✓ Limpieza completada. Se liberaron')} ${formatBytes(result.bytes_freed, activeLanguage)} ${t('de espacio.')}`,
          'success',
          5000
        );
      }

      await runScan();
      fetchSystemStats();
    } catch (e) {
      console.error('Error durante la limpieza:', e);
      addToast(`${t('Error durante la limpieza:')} ${String(e)}`, 'error', 6000);
    } finally {
      setIsCleaning(false);
    }
  }, [isCleaning, runScan, fetchSystemStats, addToast, activeLanguage, t]);

  const handleCleanTrigger = useCallback(async (selected: CleanableItem[]) => {
    if (isCleaning || isPreparingCleanPlan || selected.length === 0) return;

    setIsPreparingCleanPlan(true);
    try {
      const preview = await invoke<CleanableItem[]>('preview_clean_items', {
        itemIds: selected.map(item => item.id),
      });

      if (preview.length === 0) {
        addToast(t('Purgio no encontró targets autorizados para los elementos seleccionados.'), 'warning', 5000);
        return;
      }

      setCleanupResult(null);
      setCleanupPlan(preview);
    } catch (error) {
      console.error('No se pudo preparar el Cleanup Plan:', error);
      addToast(`${t('No se pudo preparar el plan de limpieza.')} ${String(error)}`, 'error', 6000);
    } finally {
      setIsPreparingCleanPlan(false);
    }
  }, [isCleaning, isPreparingCleanPlan, addToast, t]);

'''
app = app[:start] + new_cleanup_flow + app[end:]

app = app.replace(
    '            isCleaning={isCleaning}\n            scanStatus={scanStatus}',
    '            isCleaning={isCleaning || isPreparingCleanPlan}\n            scanStatus={scanStatus}',
    2,
)

modal_start = app.index('      {/* Modal de confirmación para borrado de archivos')
modal_end = app.index('      {/* Modal de confirmación para desactivación de arranque */}', modal_start)
cleanup_plan_mount = '''      {cleanupPlan.length > 0 && (
        <CleanupPlan
          plan={cleanupPlan}
          result={cleanupResult}
          isCleaning={isCleaning}
          requireRiskConfirmation={confirmDelete}
          onConfirm={() => executeClean(cleanupPlan)}
          onClose={() => {
            if (isCleaning) return;
            setCleanupPlan([]);
            setCleanupResult(null);
          }}
        />
      )}

'''
app = app[:modal_start] + cleanup_plan_mount + app[modal_end:]
app_path.write_text(app)

settings_path = Path('src/pages/Settings.tsx')
settings = settings_path.read_text()
settings = settings.replace("t('Confirmar antes de Limpiar')", "t('Confirmación reforzada de riesgo')", 1)
settings = settings.replace(
    "t('Muestra una advertencia antes de borrar archivos seleccionados.')",
    "t('El Cleanup Plan siempre se muestra. Esta opción exige además una aceptación explícita cuando el plan contiene elementos en revisión o sensibles.')",
    1,
)
settings = settings.replace("t('Confirmar antes de limpiar')", "t('Confirmación reforzada de riesgo')", 1)
settings_path.write_text(settings)

i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
anchor = "  'No se pudo cargar la configuración guardada; se mantienen valores seguros sin sobrescribir el archivo.': 'Saved configuration could not be loaded; safe values are being used without overwriting the file.',\n"
additions = """  'Confirmación reforzada de riesgo': 'Reinforced risk confirmation',
  'El Cleanup Plan siempre se muestra. Esta opción exige además una aceptación explícita cuando el plan contiene elementos en revisión o sensibles.': 'The Cleanup Plan is always shown. This option also requires explicit acknowledgment when the plan contains review or sensitive items.',
  'Completado': 'Completed',
  'Parcial': 'Partial',
  'Falló': 'Failed',
  'Sin cambios': 'No changes',
  'Resultado backend verificado': 'Backend-verified result',
  'Preview backend verificado': 'Backend-verified preview',
  'Resultado de la limpieza': 'Cleanup result',
  'Plan de limpieza': 'Cleanup Plan',
  'Purgio reconstruyó este plan desde su catálogo autorizado. Estas son exactamente las rutas que intentará limpiar.': 'Purgio rebuilt this plan from its authorized catalog. These are exactly the paths it will attempt to clean.',
  'Estimado recuperable': 'Estimated recoverable',
  'Elementos': 'Items',
  'Rutas autorizadas': 'Authorized paths',
  'Requieren atención': 'Require attention',
  'El plan incluye elementos que requieren una decisión consciente.': 'The plan includes items that require a conscious decision.',
  '{{review}} en revisión y {{sensitive}} sensibles. Revisa sus rutas e impacto antes de continuar.': '{{review}} under review and {{sensitive}} sensitive. Review their paths and impact before continuing.',
  'ruta': 'path',
  'rutas': 'paths',
  'He revisado los elementos de riesgo y sus rutas autorizadas.': 'I have reviewed the risk items and their authorized paths.',
  'La limpieza terminó con incidencias visibles.': 'Cleanup finished with visible issues.',
  'La limpieza terminó sin incidencias reportadas.': 'Cleanup finished with no reported issues.',
  'liberados realmente': 'actually freed',
  'Estimado inicial': 'Initial estimate',
  'Completados': 'Completed',
  'Parciales': 'Partial',
  'Fallidos': 'Failed',
  'Real: {{actual}} · Estimado: {{estimated}}': 'Actual: {{actual}} · Estimated: {{estimated}}',
  'Ejecutando plan...': 'Executing plan...',
  'Ejecutar plan de limpieza': 'Execute cleanup plan',
  'Cerrar resultado': 'Close result',
  'Limpieza terminada con incidencias. Se liberaron': 'Cleanup finished with issues. Freed',
  'Purgio no encontró targets autorizados para los elementos seleccionados.': 'Purgio found no authorized targets for the selected items.',
  'No se pudo preparar el plan de limpieza.': 'The cleanup plan could not be prepared.',
"""
if anchor not in i18n:
    raise SystemExit('Missing i18n anchor')
i18n = i18n.replace(anchor, anchor + additions, 1)
i18n_path.write_text(i18n)

css_path = Path('src/styles/index.css')
css = css_path.read_text()
marker = '/* PR-08 Cleanup Plan */'
if marker not in css:
    css += r'''

/* PR-08 Cleanup Plan */
.cleanup-plan-overlay { align-items: center; padding: 28px; }
.cleanup-plan-modal { width: min(880px, calc(100vw - 56px)); max-width: 880px; max-height: min(820px, calc(100vh - 56px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid color-mix(in srgb, var(--accent-aqua) 22%, var(--border-color)); box-shadow: 0 28px 80px rgba(0, 0, 0, .34); }
.cleanup-plan-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 22px 16px; }
.cleanup-plan-header h3 { margin: 2px 0 0; font-size: 18px; font-family: var(--font-display); }
.cleanup-plan-eyebrow { display: block; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent-aqua); font-weight: 700; }
.cleanup-plan-body { overflow-y: auto; padding: 0 22px 20px; }
.cleanup-plan-lead { margin: 0 0 16px; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.cleanup-plan-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.cleanup-plan-stat { min-width: 0; padding: 12px 13px; border: 1px solid var(--border-color); border-radius: 10px; background: color-mix(in srgb, var(--bg-secondary) 88%, transparent); }
.cleanup-plan-stat span { display: block; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.cleanup-plan-stat strong { display: block; margin-top: 3px; color: var(--text-primary); font-size: 16px; }
.cleanup-plan-stat.safe { border-color: color-mix(in srgb, var(--success) 35%, var(--border-color)); }
.cleanup-plan-stat.warning { border-color: color-mix(in srgb, var(--warning) 45%, var(--border-color)); }
.cleanup-plan-stat.danger { border-color: color-mix(in srgb, var(--danger) 45%, var(--border-color)); }
.cleanup-plan-warning, .cleanup-plan-ack, .cleanup-result-banner { border-radius: 10px; border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border-color)); background: color-mix(in srgb, var(--warning-bg) 72%, var(--bg-secondary)); }
.cleanup-plan-warning { display: flex; gap: 10px; padding: 12px 14px; margin-bottom: 14px; }
.cleanup-plan-warning strong, .cleanup-plan-warning span { display: block; }
.cleanup-plan-warning strong { font-size: 12px; color: var(--text-primary); }
.cleanup-plan-warning span { margin-top: 3px; font-size: 11px; line-height: 1.45; color: var(--text-secondary); }
.cleanup-plan-list { display: flex; flex-direction: column; gap: 8px; }
.cleanup-plan-item { border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-secondary); overflow: hidden; }
.cleanup-plan-item-main { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: inherit; text-align: left; }
.cleanup-plan-item-main:hover { border-color: transparent; background: color-mix(in srgb, var(--accent-aqua) 5%, transparent); }
.cleanup-plan-item-copy { min-width: 0; flex: 1; }
.cleanup-plan-item-copy > span { display: block; margin-top: 4px; color: var(--text-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cleanup-plan-item-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cleanup-plan-item-title-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-primary); }
.cleanup-plan-item-size { flex-shrink: 0; text-align: right; }
.cleanup-plan-item-size strong, .cleanup-plan-item-size span { display: block; }
.cleanup-plan-item-size strong { font-size: 12px; color: var(--text-primary); }
.cleanup-plan-item-size span { margin-top: 2px; font-size: 10px; color: var(--text-muted); }
.cleanup-plan-risk, .cleanup-result-status { flex-shrink: 0; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--border-color); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.risk-safe, .status-completed { color: var(--success); border-color: color-mix(in srgb, var(--success) 38%, var(--border-color)); }
.risk-review, .status-partial { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 45%, var(--border-color)); }
.risk-sensitive, .risk-critical, .status-failed { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border-color)); }
.status-no_op { color: var(--text-muted); }
.cleanup-plan-item-details { border-top: 1px solid var(--border-color); padding: 11px 14px 13px; font-size: 11px; color: var(--text-secondary); }
.cleanup-plan-item-details p + p { margin-top: 6px; }
.cleanup-plan-paths { display: grid; gap: 5px; margin-top: 9px; }
.cleanup-plan-paths code, .cleanup-result-path code { display: block; min-width: 0; overflow-wrap: anywhere; padding: 6px 8px; border-radius: 6px; background: var(--bg-primary); color: var(--text-muted); font-family: var(--font-mono); font-size: 10px; }
.cleanup-plan-ack { display: flex; align-items: flex-start; gap: 9px; margin-top: 14px; padding: 11px 13px; color: var(--text-secondary); font-size: 11px; line-height: 1.45; }
.cleanup-plan-ack input { margin-top: 1px; accent-color: var(--warning); }
.cleanup-result-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; margin-bottom: 14px; }
.cleanup-result-banner.success { border-color: color-mix(in srgb, var(--success) 42%, var(--border-color)); background: color-mix(in srgb, var(--success-bg) 62%, var(--bg-secondary)); }
.cleanup-result-banner span, .cleanup-result-banner strong { display: block; }
.cleanup-result-banner span { color: var(--text-muted); font-size: 10px; }
.cleanup-result-banner strong { margin-top: 3px; color: var(--text-primary); font-size: 16px; }
.cleanup-result-estimate { flex-shrink: 0; text-align: right; }
.cleanup-result-path { padding: 8px 0; border-bottom: 1px solid var(--border-color); }
.cleanup-result-path:last-child { border-bottom: 0; }
.cleanup-result-path > div { display: flex; align-items: center; gap: 7px; }
.cleanup-result-path > div code { flex: 1; }
.cleanup-result-path > span { display: block; margin-top: 4px; color: var(--text-muted); font-size: 10px; }
.cleanup-result-path p { margin-top: 5px; color: var(--warning); font-size: 10px; }
.cleanup-plan-actions { flex-shrink: 0; border-top: 1px solid var(--border-color); padding: 14px 22px 18px; }
@media (max-width: 760px) { .cleanup-plan-overlay { padding: 14px; } .cleanup-plan-modal { width: calc(100vw - 28px); max-height: calc(100vh - 28px); } .cleanup-plan-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
'''
css_path.write_text(css)

ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text()
ci = ci.replace(
    'rustfmt --edition 2021 --check src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs',
    'rustfmt --edition 2021 --check src-tauri/src/lib.rs src-tauri/src/cleaner.rs src-tauri/src/safety.rs src-tauri/src/persistence.rs',
    1,
)
ci_path.write_text(ci)
