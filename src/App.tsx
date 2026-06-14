import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
import { addHistoryEntry } from './utils/history';

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

export const App: React.FC = () => {
  // Pestaña activa
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Ajustes y Configuración
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    const saved = localStorage.getItem('purgio-theme');
    return (saved as any) || 'system';
  });
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(true);
  const [confirmDisable, setConfirmDisable] = useState<boolean>(true);
  const [showSensitive, setShowSensitive] = useState<boolean>(false);

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

  // Toast notifications
  const { toasts, addToast, removeToast } = useToast();

  // Tema de Color Dinámico — se guarda siempre, incluso al elegir 'system'
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');

    const applyTheme = (t: 'dark' | 'light') => {
      root.classList.add(t === 'dark' ? 'theme-dark' : 'theme-light');
    };

    // Siempre persistir la elección del usuario
    localStorage.setItem('purgio-theme', theme);

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
          `Nueva versión ${info.latest_version} disponible. Ve a Configuración para actualizar.`,
          'info',
          8000
        );
      }
    } catch (e) {
      console.error('Error al verificar actualizaciones:', e);
    }
  }, [updateDismissed, addToast]);

  useEffect(() => {
    // Verificar actualizaciones 3 segundos después de iniciar (no bloqueante)
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

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
        addToast('Error al analizar el sistema. Intenta de nuevo.', 'error');
      }
    }, 1200);
  }, [runScan, addToast]);

  // Limpieza de Elementos Seleccionados
  const executeClean = useCallback(async (selected: CleanableItem[]) => {
    setIsCleaning(true);
    try {
      const bytesFreed = await invoke<number>('clean_items', { items: selected });

      // Guardar en historial
      addHistoryEntry(bytesFreed, selected.length);

      addToast(
        `✓ Limpieza completada. Se liberaron ${formatBytes(bytesFreed)} de espacio.`,
        'success',
        5000
      );

      // Refrescar escaneo inmediatamente
      await runScan();
      fetchSystemStats();
    } catch (e) {
      console.error('Error durante la limpieza:', e);
      addToast(`Error durante la limpieza: ${String(e)}`, 'error', 6000);
    } finally {
      setIsCleaning(false);
    }
  }, [runScan, fetchSystemStats, addToast]);

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
      addToast(`"${item.name}" desactivado del arranque.`, 'success');
    } catch (e) {
      console.error('Error al desactivar el programa de arranque:', e);
      addToast(`No se pudo desactivar "${item.name}".`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [addToast]);

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
      addToast(`"${item.name}" activado al inicio.`, 'success');
    } catch (e) {
      console.error('Error al activar el programa de arranque:', e);
      addToast(`No se pudo activar "${item.name}".`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [addToast]);

  // Finalizar procesos de segundo plano
  const handleKillProcess = useCallback(async (process: ProcessItem) => {
    setIsActioning(true);
    try {
      await invoke('kill_background_process', { pid: process.pid });
      const bgs = await invoke<ProcessItem[]>('get_background_apps');
      setBackgroundProcesses(bgs);
      fetchSystemStats();
      addToast(`Proceso "${process.name}" finalizado.`, 'success');
    } catch (e) {
      console.error('Error al cerrar el proceso de segundo plano:', e);
      addToast(`No se pudo cerrar "${process.name}". Puede requerir permisos elevados.`, 'error');
    } finally {
      setIsActioning(false);
    }
  }, [fetchSystemStats, addToast]);

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
    <div className="app-container">
      <Splash />
      <TitleBar systemStats={systemStats} hasUpdate={hasUpdate} />

      {/* Banner de actualización disponible */}
      {hasUpdate && updateInfo && (
        <div className="update-banner">
          <div className="update-banner-text">
            <span>🔔 Nueva versión disponible:</span>
            <span className="update-banner-version">{updateInfo.latest_version}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(instalada: {updateInfo.current_version})</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="update-btn"
              onClick={() => setShowUpdateModal(true)}
            >
              Ver actualización
            </button>
            <button
              className="update-dismiss"
              onClick={() => setUpdateDismissed(true)}
              aria-label="Ignorar actualización"
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
              Confirmar Eliminación
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>
                Se eliminarán <strong>{itemsToClean.length} elementos</strong> liberando{' '}
                <strong style={{ color: 'var(--accent-aqua)' }}>
                  {formatBytes(itemsToClean.reduce((sum, i) => sum + i.size, 0))}
                </strong>{' '}
                de espacio. Esta acción es irreversible.
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
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{item.name}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatBytes(item.size)}</span>
                  </div>
                ))}
                {itemsToClean.length > 6 && (
                  <div style={{ color: 'var(--text-muted)', padding: '3px 0', fontStyle: 'italic' }}>
                    …y {itemsToClean.length - 6} más
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
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  executeClean(itemsToClean);
                  setShowCleanModal(false);
                }}
                disabled={isCleaning}
              >
                {isCleaning ? 'Limpiando...' : 'Limpiar definitivamente'}
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
              Desactivar del Arranque
            </div>
            <div className="modal-body">
              <p>
                ¿Desactivar el inicio automático de <strong>{itemToDisable.name}</strong>?
              </p>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                El programa no se ejecutará al encender el equipo. Podrás abrirlo manualmente y volver a activarlo en cualquier momento.
              </p>
              {!itemToDisable.is_safe_to_disable && (
                <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--warning)', background: 'var(--warning-bg)', padding: '8px', borderRadius: '6px' }}>
                  ⚠️ Este programa puede estar relacionado con drivers o seguridad del sistema. Desactivarlo con cuidado.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDisableModal(false)}
                disabled={isActioning}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  executeDisable(itemToDisable);
                  setShowDisableModal(false);
                }}
                disabled={isActioning}
              >
                Desactivar
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
              🔔 Nueva versión disponible
            </div>
            <div className="modal-body">
              <p>
                <strong style={{ color: 'var(--accent-aqua)' }}>Purgio {updateInfo.latest_version}</strong>{' '}
                está disponible. La versión instalada actualmente es {updateInfo.current_version}.
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
                Al actualizar, Purgio descargará el instalador y se reiniciará automáticamente. ¿Deseas continuar?
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => { setShowUpdateModal(false); setUpdateDismissed(true); }}
              >
                Ahora no
              </button>
              {updateInfo.download_url ? (
                <a
                  href={updateInfo.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setShowUpdateModal(false)}
                >
                  Descargar actualización
                </a>
              ) : (
                <button className="btn btn-primary" disabled>
                  Sin URL de descarga
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
