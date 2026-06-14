import React from 'react';
import { Window } from '@tauri-apps/api/window';

const appWindow = new Window('main');

interface SystemStats {
  used_ram: number;
  total_ram: number;
  cpu_usage: number;
}

interface TitleBarProps {
  systemStats?: SystemStats | null;
  hasUpdate?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({ systemStats, hasUpdate }) => {
  const minimizeWindow = () => appWindow.minimize();
  const toggleMaximize = () => appWindow.toggleMaximize();
  const closeWindow = () => appWindow.close();

  // Health calculation based on RAM and CPU
  const getHealthStatus = () => {
    if (!systemStats) return { label: 'Conectando...', class: 'good' };
    
    const ramPercent = (systemStats.used_ram / systemStats.total_ram) * 100;
    const cpuPercent = systemStats.cpu_usage;
    
    if (ramPercent > 90 || cpuPercent > 90) return { label: 'Crítico', class: 'danger' };
    if (ramPercent > 70 || cpuPercent > 70) return { label: 'Atención', class: 'warning' };
    return { label: 'Óptimo', class: 'good' };
  };

  const health = getHealthStatus();

  return (
    <div data-tauri-drag-region className="titlebar">
      <div className="titlebar-left">
        {/* Usamos el mismo logo de AppIcon para la barra de título */}
        <img 
          src="/src/assets/logo/purgio-icon.svg" 
          alt="Purgio" 
          width="16" 
          height="16" 
          style={{ pointerEvents: 'none' }}
        />
        <span className="titlebar-title">Purgio</span>
        
        {/* Indicador de salud del sistema */}
        {systemStats && (
          <div className="health-indicator" style={{ marginLeft: '12px' }}>
            <span className={`health-dot ${health.class}`}></span>
            {health.label}
          </div>
        )}
      </div>

      <div className="titlebar-right">
        {hasUpdate && (
          <div style={{ marginRight: '8px', fontSize: '11px', color: 'var(--accent-aqua)' }}>
            🔔 Actualización
          </div>
        )}
        <div className="titlebar-button" onClick={minimizeWindow} title="Minimizar">
          <svg width="12" height="1" viewBox="0 0 12 1" fill="currentColor">
            <rect width="12" height="1" />
          </svg>
        </div>
        <div className="titlebar-button" onClick={toggleMaximize} title="Maximizar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="1.5" y="1.5" width="9" height="9" strokeWidth="1.2" />
          </svg>
        </div>
        <div className="titlebar-button titlebar-close" onClick={closeWindow} title="Cerrar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M1 1L11 11M1 11L11 1" strokeWidth="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
};
