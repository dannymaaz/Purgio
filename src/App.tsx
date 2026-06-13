import React, { useState, useEffect, useCallback } from 'react';
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

  // Estados de datos globales
  const [systemStats, setSystemStats] = useState<any>(null);
  const [cleanableItems, setCleanableItems] = useState<CleanableItem[]>([]);
  const [startupItems, setStartupItems] = useState<StartupItem[]>([]);
  const [backgroundProcesses, setBackgroundProcesses] = useState<ProcessItem[]>([]);

  // Estados de carga e interacción
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isActioning, setIsActioning] = useState<boolean>(false);

  // Estados de Modales
  const [showCleanModal, setShowCleanModal] = useState<boolean>(false);
  const [itemsToClean, setItemsToClean] = useState<CleanableItem[]>([]);
  const [showDisableModal, setShowDisableModal] = useState<boolean>(false);
  const [itemToDisable, setItemToDisable] = useState<StartupItem | null>(null);
  const [cleanResultMsg, setCleanResultMsg] = useState<string | null>(null);

  // Tema de Color Dinámico
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');

    const applyTheme = (t: 'dark' | 'light') => {
      if (t === 'dark') {
        root.classList.add('theme-dark');
      } else {
        root.classList.add('theme-light');
      }
    };

    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(systemDark.matches ? 'dark' : 'light');

      const listener = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      
      systemDark.addEventListener('change', listener);
      return () => systemDark.removeEventListener('change', listener);
    } else {
      applyTheme(theme);
    }

    localStorage.setItem('purgio-theme', theme);
  }, [theme]);

  // Carga inicial de datos de hardware
  const fetchSystemStats = useCallback(async () => {
    try {
      const stats = await invoke<any>('get_system_stats');
      setSystemStats(stats);
    } catch (e) {
      console.error('Error al obtener estadísticas del sistema:', e);
    }
  }, []);

  useEffect(() => {
    fetchSystemStats();
    
    // Timer para refrescar estadísticas dinámicamente cada 5 segundos en background
    const interval = setInterval(fetchSystemStats, 5000);
    return () => clearInterval(interval);
  }, [fetchSystemStats]);

  // Cargar procesos en segundo plano y programas de arranque al entrar a sus pestañas
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

  // Escaneo Global
  const handleScan = async () => {
    setScanStatus('scanning');
    
    try {
      // Escaneo real de archivos del sistema
      const sysFiles = await invoke<CleanableItem[]>('scan_system_files');
      
      // Escaneo de navegadores si está habilitado o configurado
      let browserFiles: CleanableItem[] = [];
      if (showSensitive) {
        browserFiles = await invoke<CleanableItem[]>('scan_browser_files');
      } else {
        // Si no se quieren mostrar sensibles, escaneamos pero filtramos cookies y sesiones
        const allBrowsers = await invoke<CleanableItem[]>('scan_browser_files');
        browserFiles = allBrowsers.filter(i => i.risk_level !== 'Sensitive');
      }

      // Concatenar
      setCleanableItems([...sysFiles, ...browserFiles]);
      
      // Actualizar conteos del arranque y background para el resumen
      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
      
      const bgs = await invoke<ProcessItem[]>('get_background_apps');
      setBackgroundProcesses(bgs);

      // Pequeño retardo artificial de 1.2 segundos para una UX de análisis pulida y premium
      setTimeout(() => {
        setScanStatus('done');
      }, 1200);
      
    } catch (e) {
      console.error('Error en el escaneo:', e);
      setScanStatus('idle');
    }
  };

  // Limpieza de Elementos Seleccionados
  const executeClean = async (selected: CleanableItem[]) => {
    setIsCleaning(true);
    setCleanResultMsg(null);
    try {
      const bytesFreed = await invoke<number>('clean_items', { items: selected });
      
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      setCleanResultMsg(`Limpieza completada de forma exitosa. Se liberaron ${formatBytes(bytesFreed)} de espacio en disco.`);
      
      // Refrescar el escaneo inmediatamente
      const sysFiles = await invoke<CleanableItem[]>('scan_system_files');
      let browserFiles: CleanableItem[] = [];
      if (showSensitive) {
        browserFiles = await invoke<CleanableItem[]>('scan_browser_files');
      } else {
        const allBrowsers = await invoke<CleanableItem[]>('scan_browser_files');
        browserFiles = allBrowsers.filter(i => i.risk_level !== 'Sensitive');
      }
      setCleanableItems([...sysFiles, ...browserFiles]);
      fetchSystemStats();
    } catch (e) {
      console.error('Error durante la limpieza:', e);
      setCleanResultMsg(`Error durante la limpieza: ${e}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCleanTrigger = (selected: CleanableItem[]) => {
    if (confirmDelete) {
      setItemsToClean(selected);
      setShowCleanModal(true);
    } else {
      executeClean(selected);
    }
  };

  // Gestión de Arranque (Desactivar/Restaurar)
  const handleDisableTrigger = (item: StartupItem) => {
    if (confirmDisable) {
      setItemToDisable(item);
      setShowDisableModal(true);
    } else {
      executeDisable(item);
    }
  };

  const executeDisable = async (item: StartupItem) => {
    setIsActioning(true);
    try {
      await invoke('disable_startup', { id: item.id, locationKey: item.location_key });
      // Refrescar lista de arranque
      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
    } catch (e) {
      console.error('Error al desactivar el programa de arranque:', e);
    } finally {
      setIsActioning(false);
    }
  };

  const handleEnable = async (item: StartupItem) => {
    setIsActioning(true);
    try {
      await invoke('enable_startup', { 
        name: item.name, 
        locationKey: item.location_key,
        originalCommand: "" 
      });
      // Refrescar lista
      const startups = await invoke<StartupItem[]>('get_startup_items');
      setStartupItems(startups);
    } catch (e) {
      console.error('Error al activar el programa de arranque:', e);
    } finally {
      setIsActioning(false);
    }
  };

  // Finalizar procesos de segundo plano
  const handleKillProcess = async (process: ProcessItem) => {
    setIsActioning(true);
    try {
      await invoke('kill_background_process', { pid: process.pid });
      // Refrescar lista de procesos
      const bgs = await invoke<ProcessItem[]>('get_background_apps');
      setBackgroundProcesses(bgs);
      fetchSystemStats();
    } catch (e) {
      console.error('Error al cerrar el proceso de segundo plano:', e);
    } finally {
      setIsActioning(false);
    }
  };

  // Datos globales del resumen
  const potentialSpace = cleanableItems.reduce((sum, item) => sum + (item.selected ? item.size : 0), 0);
  const safeCount = cleanableItems.filter(item => item.risk_level === 'Safe' && !item.category.startsWith('browser_')).length;
  const reviewCount = cleanableItems.filter(item => item.risk_level === 'Review' && !item.category.startsWith('browser_')).length;

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
          />
        );
      case 'cleaner':
        return (
          <Cleaner
            items={cleanableItems}
            setItems={setCleanableItems}
            handleClean={handleCleanTrigger}
            isCleaning={isCleaning}
          />
        );
      case 'browsers':
        return (
          <Browsers
            items={cleanableItems}
            setItems={setCleanableItems}
            handleClean={handleCleanTrigger}
            isCleaning={isCleaning}
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
          />
        );
      default:
        return null;
    }
  };

  const getThemeClass = (): string => {
    // Si es system, la clase ya se calcula y aplica a html en el useEffect anterior.
    // Solo retornamos la correspondiente para el SideBar logo
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  };

  return (
    <div className="app-container">
      <Splash />
      <TitleBar />
      
      <div className="app-layout">
        <SideBar 
          currentTab={currentTab} 
          setCurrentTab={setCurrentTab} 
          theme={getThemeClass() as any} 
        />
        
        <main className="main-content">
          {renderActiveTab()}
        </main>
      </div>

      {/* Modal de confirmación para borrado de archivos */}
      {showCleanModal && (
        <div className="modal-overlay" onClick={() => setShowCleanModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header danger">
              <WarningIcon size={20} className="danger" />
              Confirmar Eliminación Seguro
            </div>
            <div className="modal-body">
              Estás a punto de eliminar de forma permanente {itemsToClean.length} elementos seleccionados. 
              Esta acción liberará espacio en disco de inmediato pero es irreversible. ¿Deseas continuar?
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
                Proceder a limpiar
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
              Desactivar Arranque
            </div>
            <div className="modal-body">
              ¿Seguro que deseas desactivar el inicio automático de <strong>{itemToDisable.name}</strong>? 
              El programa ya no se ejecutará en segundo plano al encender el equipo, pero podrás abrirlo manualmente en cualquier momento.
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
                Confirmar Desactivación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta toast sutil e informativa de resultados de limpieza */}
      {cleanResultMsg && (
        <div className="modal-overlay" onClick={() => setCleanResultMsg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ color: 'var(--accent-aqua)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Acción Completada
            </div>
            <div className="modal-body">
              {cleanResultMsg}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setCleanResultMsg(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
