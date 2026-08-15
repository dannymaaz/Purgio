import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import purgioIcon from '../assets/logo/purgio-icon.svg';
import { useI18n } from '../i18n';

const appWindow = getCurrentWindow();

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
  const [appVersion, setAppVersion] = useState<string>('...');
  const { t } = useI18n();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('2.0.1'));
  }, []);

  const minimizeWindow = () => appWindow.minimize();
  const toggleMaximize = () => appWindow.toggleMaximize();
  const closeWindow = () => appWindow.close();

  const getHealthStatus = () => {
    if (!systemStats) return { label: t('Conectando...'), class: 'good' };

    const ramPercent = systemStats.total_ram > 0
      ? (systemStats.used_ram / systemStats.total_ram) * 100
      : 0;
    const cpuPercent = systemStats.cpu_usage;

    if (ramPercent > 95 || cpuPercent > 90) return { label: t('Crítico'), class: 'danger' };
    if (ramPercent > 80 || cpuPercent > 70) return { label: t('Atención'), class: 'warning' };
    return { label: t('Óptimo'), class: 'good' };
  };

  const health = getHealthStatus();

  return (
    <div data-tauri-drag-region className="titlebar">
      <div className="titlebar-drag-region" data-tauri-drag-region>
        <img
          src={purgioIcon}
          alt="Purgio"
          className="titlebar-logo"
          style={{ pointerEvents: 'none', width: '16px', height: '16px', marginRight: '8px' }}
        />
        <span className="titlebar-title" data-tauri-drag-region>Purgio</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }} data-tauri-drag-region>v{appVersion}</span>

        {systemStats && (
          <div className="health-indicator" style={{ marginLeft: '12px' }} data-tauri-drag-region>
            <span className={`health-dot ${health.class}`} data-tauri-drag-region></span>
            <span data-tauri-drag-region>{health.label}</span>
          </div>
        )}
      </div>

      <div className="titlebar-controls">
        {hasUpdate && (
          <div style={{ marginRight: '8px', fontSize: '11px', color: 'var(--accent-aqua)' }}>
            ✨ {t('Actualización disponible')}
          </div>
        )}
        <div className="titlebar-btn" onClick={minimizeWindow} title={t('Minimizar')}>
          <svg width="12" height="1" viewBox="0 0 12 1" fill="currentColor">
            <rect width="12" height="1" />
          </svg>
        </div>
        <div className="titlebar-btn" onClick={toggleMaximize} title={t('Maximizar')}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="1.5" y="1.5" width="9" height="9" strokeWidth="1.2" />
          </svg>
        </div>
        <div className="titlebar-btn close" onClick={closeWindow} title={t('Cerrar')}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M1 1L11 11M1 11L11 1" strokeWidth="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
};
