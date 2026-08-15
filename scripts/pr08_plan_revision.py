from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "interface PersistedState {\n  schema_version: number;\n  legacy_migration_completed: boolean;\n  preferences: AppPreferences;\n}\n",
    "interface PersistedState {\n  schema_version: number;\n  legacy_migration_completed: boolean;\n  preferences: AppPreferences;\n}\n\ninterface CleanupPlanPreview {\n  revision: string;\n  items: CleanableItem[];\n}\n",
    'CleanupPlanPreview type',
)

app = replace_once(
    app,
    "  const [cleanupPlan, setCleanupPlan] = useState<CleanableItem[]>([]);\n  const [cleanupResult, setCleanupResult] = useState<CleanupRunResult | null>(null);\n",
    "  const [cleanupPlan, setCleanupPlan] = useState<CleanableItem[]>([]);\n  const [cleanupPlanRevision, setCleanupPlanRevision] = useState<string | null>(null);\n  const [cleanupResult, setCleanupResult] = useState<CleanupRunResult | null>(null);\n",
    'plan revision state',
)

app = replace_once(
    app,
    "  const executeClean = useCallback(async (selected: CleanableItem[]) => {\n    if (isCleaning || selected.length === 0) return;\n",
    "  const executeClean = useCallback(async (selected: CleanableItem[]) => {\n    if (isCleaning || selected.length === 0 || !cleanupPlanRevision) return;\n",
    'execute guard',
)

app = replace_once(
    app,
    "      const result = await invoke<CleanupRunResult>('clean_items', {\n        itemIds: selected.map(item => item.id),\n      });\n",
    "      const result = await invoke<CleanupRunResult>('clean_items', {\n        itemIds: selected.map(item => item.id),\n        planRevision: cleanupPlanRevision,\n      });\n",
    'clean invoke revision',
)

old_catch = """    } catch (e) {
      console.error('Error durante la limpieza:', e);
      addToast(`${t('Error durante la limpieza:')} ${String(e)}`, 'error', 6000);
    } finally {
"""
new_catch = """    } catch (e) {
      const message = String(e);
      console.error('Error durante la limpieza:', e);

      if (message.includes('PLAN_CHANGED')) {
        setCleanupPlan([]);
        setCleanupPlanRevision(null);
        setCleanupResult(null);
        addToast(
          t('El alcance del plan cambió desde que lo revisaste. Purgio no eliminó nada; genera y revisa un nuevo plan.'),
          'warning',
          7000
        );
      } else {
        addToast(`${t('Error durante la limpieza:')} ${message}`, 'error', 6000);
      }
    } finally {
"""
app = replace_once(app, old_catch, new_catch, 'stale plan handling')

app = replace_once(
    app,
    "  }, [isCleaning, runScan, fetchSystemStats, addToast, activeLanguage, t]);\n",
    "  }, [isCleaning, cleanupPlanRevision, runScan, fetchSystemStats, addToast, activeLanguage, t]);\n",
    'execute dependencies',
)

app = replace_once(
    app,
    "      const preview = await invoke<CleanableItem[]>('preview_clean_items', {\n        itemIds: selected.map(item => item.id),\n      });\n\n      if (preview.length === 0) {\n",
    "      const preview = await invoke<CleanupPlanPreview>('preview_clean_items', {\n        itemIds: selected.map(item => item.id),\n      });\n\n      if (preview.items.length === 0) {\n",
    'preview response type',
)

app = replace_once(
    app,
    "      setCleanupResult(null);\n      setCleanupPlan(preview);\n",
    "      setCleanupResult(null);\n      setCleanupPlanRevision(preview.revision);\n      setCleanupPlan(preview.items);\n",
    'store preview revision',
)

app = replace_once(
    app,
    "            setCleanupPlan([]);\n            setCleanupResult(null);\n",
    "            setCleanupPlan([]);\n            setCleanupPlanRevision(null);\n            setCleanupResult(null);\n",
    'clear revision on close',
)

app_path.write_text(app)

i18n_path = Path('src/i18n.tsx')
i18n = i18n_path.read_text()
anchor = "  'No se pudo preparar el plan de limpieza.': 'The cleanup plan could not be prepared.',\n"
addition = "  'El alcance del plan cambió desde que lo revisaste. Purgio no eliminó nada; genera y revisa un nuevo plan.': 'The plan scope changed after you reviewed it. Purgio deleted nothing; generate and review a new plan.',\n"
if addition not in i18n:
    i18n = replace_once(i18n, anchor, anchor + addition, 'stale plan translation')
i18n_path.write_text(i18n)
