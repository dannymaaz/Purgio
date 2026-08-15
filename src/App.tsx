import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { locale as getSystemLocale } from '@tauri-apps/plugin-os';

// Componentes y Páginas
import { TitleBar } from './components/TitleBar';
import { SideBar } from './components/SideBar';
import { Splash } from './components/Splash';
import { Dashboard } from './pages/Dashboard';
import { Cleaner, CleanableItem } from './pages/Cleaner';
import { Browsers } from './pages/Browsers';
import { Startup, StartupItem } from './pages/Startup';
import { Background, ProcessItem } from './pages/Background';
import { Settings } from './pages/Settings';
import { WarningIcon } from './components/Icons';
import { ToastContainer, useToast } from './components/Toast';

// Utilidades
import { formatBytes } from './utils/format';
import { addHistoryEntry, clearLegacyHistory, readLegacyHistory } from './utils/history';
import { I18nProvider, LanguagePreference, resolveLanguage, translateBackendText } from './i18n';

// Tipos correctamente tipados desde el backend
interface SystemStats {
  total_ram: number;
  used_ram: number;
  cpu_usage: number;
  total_disk: number;
  free_disk: number;
  os_name: string;
  os_version?: string;
  cpu_count?: number;
  cpu_name?: string;
}

interface UpdateInfo {
  latest_version: string;
  current_version: string;
  has_update: boolean;
  download_url: string;
  changelog: string;
}

interface AppPreferences {
  theme: 'dark' | 'light' | 'system';
  language: LanguagePreference;
  confirm_delete: boolean;
  confirm_disable: boolean;
  show_sensitive: boolean;
}

interface PersistedState {
  schema_version: number;
  legacy_migration_completed: boolean;
  preferences: AppPreferences;
}

export const App: React.FC = () => {
  // Pestaña activa
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Ajustes y Configuración — defaults seguros hasta hidratar app_config_dir.
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('system');
  const [lang, setLang] = useState<LanguagePreference>('system');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(true);
  const [confirmDisable, setConfirmDisable] = useState<boolean>(true);
  const [showSensitive, setShowSensitive] = useState<boolean>(false);
  const [settingsHydrated, setSettingsHydrated] = useState<boolean>(false);
  const [systemLocale, setSystemLocale] = useState<string | null>(null);

  // Estados de datos globales (tipado correcto, no 'any')
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [cleanableItems, setCleanableItems] = useState<CleanableItem[]>([]);
  const [startupItems, setStartupItems] = useState<StartupItem[]>([]);
  const [backgroundProcesses, setBackgroundProcesses] = useState<ProcessItem[]>([]);

  // Estados de carga e interacción
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isActioning, setIsActioning] = useState<boolean>(false);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number | null>(null);

  // Estados de Modales
  const [showCleanModal, setShowCleanModal] = useState<boolean>(false);
  const [itemsToClean, setItemsToClean] = useState<CleanableItem[]>([]);
  const [showDisableModal, setShowDisableModal] = useState<boolean>(false);
  const [itemToDisable, setItemToDisable] = useState<StartupItem | null>(null);

  // Sistema de actualización
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [updateDismissed, setUpdateDismissed] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Toast notifications
  const { toasts, addToast, removeToast } = useToast();


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


  // Cargar configuración persistente desde app_config_dir. localStorage se usa
  // exclusivamente como fuente legacy para una única migración.
  useEffect(() => {
    let cancelled = false;

    const hydrateSettings = async () => {
      try {
        let state = await invoke<PersistedState>('load_app_state');

        if (!state.legacy_migration_completed) {
          const legacyTheme = localStorage.getItem('purgio-theme');
          const legacyHistory = readLegacyHistory();
          state = await invoke<PersistedState>('migrate_legacy_state', {
            legacy: {
              theme: legacyTheme,
              history: legacyHistory,
            },
          });
        }

        // Una vez que Rust confirma el estado, los datos del WebView dejan de ser
        // necesarios y no pueden volver a sobrescribir app_config_dir.
        localStorage.removeItem('purgio-theme');
        clearLegacyHistory();

        if (cancelled) return;
        setTheme(state.preferences.theme);
        setLang(state.preferences.language);
        setConfirmDelete(state.preferences.confirm_delete);
        setConfirmDisable(state.preferences.confirm_disable);
        setShowSensitive(state.preferences.show_sensitive);
        setSettingsHydrated(true);
      } catch (error) {
        console.error('Error al cargar la configuración persistente:', error);
        if (!cancelled) {
          addToast(t('No se pudo cargar la configuración guardada; se mantienen valores seguros sin sobrescribir el archivo.'), 'error', 7000);
        }
      }
    };

    hydrateSettings();
    return () => {
      cancelled = true;
    };
  }, [addToast, t]);

  // Persistir cambios solo después de una hidratación correcta, evitando que los
  // defaults del primer render sobrescriban preferencias existentes.
  useEffect(() => {
    if (!settingsHydrated) return;

    const timer = window.setTimeout(() => {
      invoke('save_preferences', {
        preferences: {
          theme,
          language: lang,
          confirm_delete: confirmDelete,
          confirm_disable: confirmDisable,
          show_sensitive: showSensitive,
        },
      }).catch((error) => {
        console.error('Error al guardar la configuración:', error);
        addToast(t('No se pudieron guardar los cambios de configuración.'), 'error', 5000);
      });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [settingsHydrated, theme, lang, confirmDelete, confirmDisable, showSensitive, addToast, t]);

  // Tema de Color Dinámico — la persistencia se gestiona en app_config_dir.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');

    const applyTheme = (t: 'dark' | 'light') => {
      root.classList.add(t === 'dark' ? 'theme-dark' : 'theme-light');
    };

    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(systemDark.matches ? 'dark' : 'light');
      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      systemDark.addEventListener('change', listener);
      return () => systemDark.removeEventListener('change', listener);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // Carga inicial de datos de hardware (intervalo aumentado a 8s para reducir consumo de RAM)
  const fetchSystemStats = useCallback(async () => {
    try {
      const stats = await invoke<SystemStats>('get_system_stats');
      setSystemStats(stats);
    } catch (e) {
      console.error('Error al obtener estadísticas del sistema:', e);
    }
  }, []);

  useEffect(() => {
    fetchSystemStats();
    // Intervalo de 15s — pausar cuando la ventana está oculta para ahorrar RAM
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchSystemStats();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSystemStats]);

  // Verificar actualizaciones al iniciar (solo una vez)
  const checkForUpdates = useCallback(async () => {
    try {
      const info = await invoke<UpdateInfo>('check_for_updates');
      setUpdateInfo(info);
      if (info.has_update && !updateDismissed) {
        addToast(
          `${t('Nueva versión disponible:')} ${info.latest_version}. ${t('Ve a Configuración para actualizar.')}`,
          'info',
          8000
        );
      }
    } catch (e) {
      console.error('Error al verificar actualizaciones:', e);
    }
  }, [updateDismissed, addToast, t]);

  useEffect(() => {
    // Verificar actualizaciones 3 segundos después de iniciar (no bloqueante)
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  const installUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      addToast(t('Descargando y verificando la actualización…'), 'info', 5000);
      await invoke('install_update');
      // El backend reinicia Purgio únicamente después de verificar e instalar el paquete.
    } catch (e) {
      console.error('Error al instalar la actualización:', e);
      addToast(`${t('No se pudo instalar la actualización:')} ${String(e)}`, 'error', 7000);
      setIsUpdating(false);
    }
  }, [addToast, t]);

  // Cargar procesos en segundo plano y arranque al entrar a sus pestañas
  useEffect(() => {
    if (currentTab === 'startup') {
      invoke<StartupItem[]>('get_startup_items')
        .then(setStartupItems)
        .catch(console.error);
    } else if (currentTab === 'background') {
      invoke<ProcessItem[]>('get_background_apps')
        .then(setBackgroundProcesses)
        .catch(console.error);
    }
  }, [currentTab]);

  // Auto-refresh de procesos en segundo plano cada 20s cuando estamos en esa pestaña
  useEffect(() => {
    if (currentTab !== 'background') return;
    const interval = setInterval(async () => {
      if (!document.hidden) {
        try {
          const bgs = await invoke<ProcessItem[]>('get_background_apps');
          setBackgroundProcesses(bgs);
        } catch {}
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [currentTab]);

  // Función de escaneo compartida (evita duplicación)
  const runScan = useCallback(async () => {
    try {
      const sysFiles = await invoke<CleanableItem[]>('scan_system_files');
      const allBrowsers = await invoke<CleanableItem[]>('scan_browser_files');
      const browserFiles = showSensitive
        ? allBrowsers
        : allBrowsers.filter(i => i.risk_level !== 'Sensitive');

      setCleanableItems([...sysFiles, ...browserFiles]);

      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
      const bgs = await invoke<ProcessItem[]>('get_background_apps');
      setBackgroundProcesses(bgs);

      return true;
    } catch (e) {
      console.error('Error en el escaneo:', e);
      return false;
    }
  }, [showSensitive]);

  // Escaneo Global
  const handleScan = useCallback(async () => {
    setScanStatus('scanning');
    setCurrentTab('cleaner');

    const success = await runScan();

    // Pequeño retardo de 1.2s para UX de análisis premium
    setTimeout(() => {
      if (success) {
        setScanStatus('done');
        setLastScanTimestamp(Date.now());
      } else {
        setScanStatus('idle');
        addToast(t('Error al analizar el sistema. Intenta de nuevo.'), 'error');
      }
    }, 1200);
  }, [runScan, addToast, t]);

  // Limpieza de Elementos Seleccionados
  const executeClean = useCallback(async (selected: CleanableItem[]) => {
    setIsCleaning(true);
    try {
      const bytesFreed = await invoke<number>('clean_items', { items: selected });

      // La limpieza y el historial son resultados independientes: una falla al
      // persistir el registro no puede reinterpretar una eliminación ya completada.
      try {
        await addHistoryEntry(bytesFreed, selected.length);
      } catch (historyError) {
        console.error('La limpieza terminó pero no se pudo guardar el historial:', historyError);
        addToast(
          t('La limpieza se completó, pero no se pudo guardar la entrada en el historial.'),
          'warning',
          6000
        );
      }

      addToast(
        `${t('✓ Limpieza completada. Se liberaron')} ${formatBytes(bytesFreed, activeLanguage)} ${t('de espacio.')}`,
        'success',
        5000
      );

      // Refrescar escaneo inmediatamente
      await runScan();
      fetchSystemStats();
    } catch (e) {
      console.error('Error durante la limpieza:', e);
      addToast(`${t('Error durante la limpieza:')} ${String(e)}`, 'error', 6000);
    } finally {
      setIsCleaning(false);
    }
  }, [runScan, fetchSystemStats, addToast, activeLanguage, t]);

  const handleCleanTrigger = useCallback((selected: CleanableItem[]) => {
    if (confirmDelete) {
      setItemsToClean(selected);
      setShowCleanModal(true);
    } else {
      executeClean(selected);
    }
  }, [confirmDelete, executeClean]);

  // Gestión de Arranque
  const handleDisableTrigger = useCallback((item: StartupItem) => {
    if (confirmDisable) {
      setItemToDisable(item);
      setShowDisableModal(true);
    } else {
      executeDisable(item);
    }
  }, [confirmDisable]);

  const executeDisable = useCallback(async (item: StartupItem) => {
    setIsActioning(true);
    try {
      await invoke('disable_startup', { id: item.id, locationKey: item.location_key });
      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
      addToast(`"${item.name}" ${t('desactivado del arranque.')}`, 'success');
    } catch (e) {
      console.error('Error al desactivar el programa de arranque:', e);
      addToast(`${t('No se pudo desactivar')} "${item.name}".`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [addToast, t]);

  const handleEnable = useCallback(async (item: StartupItem) => {
    setIsActioning(true);
    try {
      await invoke('enable_startup', {
        name: item.name,
        locationKey: item.location_key,
        originalCommand: item.command || ''
      });
      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
      addToast(`"${item.name}" ${t('activado al inicio.')}`, 'success');
    } catch (e) {
      console.error('Error al activar el programa de arranque:', e);
      addToast(`${t('No se pudo activar')} "${item.name}".`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [addToast, t]);

  // Finalizar procesos de segundo plano
  const handleKillProcess = useCallback(async (process: ProcessItem) => {
    setIsActioning(true);
    try {
      await invoke('kill_background_process', { pid: process.pid });
      const bgs = await invoke<ProcessItem[]>('get_background_apps');
      setBackgroundProcesses(bgs);
      fetchSystemStats();
      addToast(`${t('Proceso')} "${process.name}" ${t('finalizado.')}`, 'success');
    } catch (e) {
      console.error('Error al cerrar el proceso de segundo plano:', e);
      addToast(`${t('No se pudo cerrar')} "${process.name}". ${t('Puede requerir permisos elevados.')}`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [fetchSystemStats, addToast, t]);

  // Datos globales del resumen (memoizados para no recalcular en cada render)
  const potentialSpace = useMemo(
    () => cleanableItems.reduce((sum, item) => sum + (item.selected ? item.size : 0), 0),
    [cleanableItems]
  );
  const safeCount = useMemo(
    () => cleanableItems.filter(item => item.risk_level === 'Safe' && !item.category.startsWith('browser_')).length,
    [cleanableItems]
  );
  const reviewCount = useMemo(
    () => cleanableItems.filter(item => item.risk_level === 'Review' && !item.category.startsWith('browser_')).length,
    [cleanableItems]
  );

  // Calcular tema para sidebar
  const getThemeClass = useCallback((): 'dark' | 'light' => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const renderActiveTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <Dashboard
            stats={systemStats}
            scanStatus={scanStatus}
            handleScan={handleScan}
            potentialSpace={potentialSpace}
            safeCount={safeCount}
            reviewCount={reviewCount}
            startupCount={startupItems.length}
            bgCount={backgroundProcesses.length}
            lastScanTimestamp={lastScanTimestamp}
          />
        );
      case 'cleaner':
        return (
          <Cleaner
            items={cleanableItems}
            setItems={setCleanableItems}
            handleClean={handleCleanTrigger}
            isCleaning={isCleaning}
            scanStatus={scanStatus}
            handleScan={handleScan}
          />
        );
      case 'browsers':
        return (
          <Browsers
            items={cleanableItems}
            setItems={setCleanableItems}
            handleClean={handleCleanTrigger}
            isCleaning={isCleaning}
            scanStatus={scanStatus}
            handleScan={handleScan}
          />
        );
      case 'startup':
        return (
          <Startup
            items={startupItems}
            handleDisable={handleDisableTrigger}
            handleEnable={handleEnable}
            isActioning={isActioning}
          />
        );
      case 'background':
        return (
          <Background
            items={backgroundProcesses}
            handleKillProcess={handleKillProcess}
            isActioning={isActioning}
          />
        );
      case 'settings':
        return (
          <Settings
            theme={theme}
            setTheme={setTheme}
            lang={lang}
            setLang={setLang}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            confirmDisable={confirmDisable}
            setConfirmDisable={setConfirmDisable}
            showSensitive={showSensitive}
            setShowSensitive={setShowSensitive}
            onCheckUpdates={checkForUpdates}
            hasUpdate={updateInfo?.has_update}
            latestVersion={updateInfo?.latest_version}
          />
        );
      default:
        return null;
    }
  };

  const hasUpdate = updateInfo?.has_update && !updateDismissed;

  return (
    <I18nProvider language={activeLanguage}>
      <div className="app-container">
      <Splash />
      <TitleBar systemStats={systemStats} hasUpdate={hasUpdate} />

      {/* Banner de actualización disponible */}
      {hasUpdate && updateInfo && (
        <div className="update-banner">
          <div className="update-banner-text">
            <span>{t('🔔 Nueva versión disponible')}</span>
            <span className="update-banner-version">{updateInfo.latest_version}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({t('instalada:')} {updateInfo.current_version})</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="update-btn"
              onClick={() => setShowUpdateModal(true)}
            >
              {t('Ver actualización')}
            </button>
            <button
              className="update-dismiss"
              onClick={() => setUpdateDismissed(true)}
              aria-label={t('Ignorar actualización')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="app-layout">
        <SideBar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          theme={getThemeClass()}
        />

        <main className="main-content">
          {renderActiveTab()}
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Modal de confirmación para borrado de archivos (mejorado con lista) */}
      {showCleanModal && (
        <div className="modal-overlay" onClick={() => setShowCleanModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header danger">
              <WarningIcon size={20} className="danger" />
              {t('Confirmar Eliminación')}
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>
                {t('Se eliminarán {{count}} elementos liberando {{size}} de espacio. Esta acción es irreversible.', {
                  count: itemsToClean.length,
                  size: formatBytes(itemsToClean.reduce((sum, item) => sum + item.size, 0), activeLanguage),
                })}
              </p>
              {/* Lista de los primeros 5 elementos */}
              <div style={{
                maxHeight: '140px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)'
              }}>
                {itemsToClean.slice(0, 6).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{translateBackendText(activeLanguage, item.name)}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatBytes(item.size, activeLanguage)}</span>
                  </div>
                ))}
                {itemsToClean.length > 6 && (
                  <div style={{ color: 'var(--text-muted)', padding: '3px 0', fontStyle: 'italic' }}>
                    {t('…y {{count}} más', { count: itemsToClean.length - 6 })}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCleanModal(false)}
                disabled={isCleaning}
              >
                {t('Cancelar')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  executeClean(itemsToClean);
                  setShowCleanModal(false);
                }}
                disabled={isCleaning}
              >
                {isCleaning ? t('Limpiando...') : t('Limpiar definitivamente')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para desactivación de arranque */}
      {showDisableModal && itemToDisable && (
        <div className="modal-overlay" onClick={() => setShowDisableModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <WarningIcon size={20} className="warning" />
              {t('Desactivar del Arranque')}
            </div>
            <div className="modal-body">
              <p>
                {t('¿Desactivar el inicio automático de {{name}}?', { name: itemToDisable.name })}
              </p>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {t('El programa no se ejecutará al encender el equipo. Podrás abrirlo manualmente y volver a activarlo en cualquier momento.')}
              </p>
              {!itemToDisable.is_safe_to_disable && (
                <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--warning)', background: 'var(--warning-bg)', padding: '8px', borderRadius: '6px' }}>
                  {t('⚠️ Este programa puede estar relacionado con drivers o seguridad del sistema. Desactivarlo con cuidado.')}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDisableModal(false)}
                disabled={isActioning}
              >
                {t('Cancelar')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  executeDisable(itemToDisable);
                  setShowDisableModal(false);
                }}
                disabled={isActioning}
              >
                {t('Desactivar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de actualización disponible */}
      {showUpdateModal && updateInfo && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ color: 'var(--accent-aqua)' }}>
              {t('🔔 Nueva versión disponible')}
            </div>
            <div className="modal-body">
              <p>
                {t('Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.', {
                  latest: updateInfo.latest_version,
                  current: updateInfo.current_version,
                })}
              </p>
              {updateInfo.changelog && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  borderRadius: '6px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {updateInfo.changelog}
                </div>
              )}
              <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {t('Purgio descargará el paquete correspondiente a este sistema, verificará su firma criptográfica y solo entonces lo instalará y reiniciará la aplicación. ¿Deseas continuar?')}
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => { setShowUpdateModal(false); setUpdateDismissed(true); }}
                disabled={isUpdating}
              >
                {t('Ahora no')}
              </button>
              <button
                className="btn btn-primary"
                onClick={installUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? t('Actualizando…') : t('Instalar actualización')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </I18nProvider>
  );
};
