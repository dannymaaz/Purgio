import React from 'react';
import { ShieldIcon, InfoIcon } from '../components/Icons';
import { useI18n } from '../i18n';
import { formatBytes } from '../utils/format';

interface DashboardProps {
  stats: {
    total_ram: number;
    used_ram: number;
    cpu_usage: number;
    total_disk: number;
    free_disk: number;
    os_name: string;
  } | null;
  scanStatus: 'idle' | 'scanning' | 'done';
  handleScan: () => void;
  potentialSpace: number;
  safeCount: number;
  reviewCount: number;
  startupCount: number;
  bgCount: number;
  lastScanTimestamp?: number | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  scanStatus,
  handleScan,
  potentialSpace,
  safeCount,
  reviewCount,
  startupCount,
  bgCount
}) => {
  const { t, language } = useI18n();

  const getRamPercent = (): number => {
    if (!stats || stats.total_ram === 0) return 0;
    return Math.round((stats.used_ram / stats.total_ram) * 100);
  };

  const getDiskUsedPercent = (): number => {
    if (!stats || stats.total_disk === 0) return 0;
    const used = stats.total_disk - stats.free_disk;
    return Math.round((used / stats.total_disk) * 100);
  };

  const number = new Intl.NumberFormat(language === 'es' ? 'es-GT' : 'en-US');

  return (
    <div>
      <div className="hero-scanner">
        <button
          className={`scanner-circle-btn ${scanStatus === 'scanning' ? 'scanning' : ''}`}
          onClick={handleScan}
          disabled={scanStatus === 'scanning'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>{t(scanStatus === 'scanning' ? 'Escaneando' : 'Escanear')}</span>
        </button>

        <div className="security-badge-container">
          <ShieldIcon className="aqua" size={14} />
          <span>{t('Purgio nunca elimina datos personales o contraseñas sin tu confirmación.')}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">{t('Sistema Operativo')}</div>
          <div className="card-value teal" style={{ fontSize: '24px', padding: '6px 0' }}>
            {stats?.os_name || t('Detectando...')}
          </div>
          <div className="card-desc">{t('Monitoreo de recursos nativos en tiempo real.')}</div>
        </div>

        <div className="card">
          <div className="card-title">{t('Uso de Memoria RAM')}</div>
          <div className="card-value">
            {stats ? `${number.format(getRamPercent())}%` : '0%'}
          </div>
          <div className="card-desc">
            {stats
              ? `${formatBytes(stats.used_ram, language)} ${t('usados de')} ${formatBytes(stats.total_ram, language)}`
              : t('Cargando...')}
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t('Espacio en Disco Principal')}</div>
          <div className="card-value">
            {stats ? formatBytes(stats.free_disk, language) : '0 GB'}
          </div>
          <div className="card-desc">
            {stats
              ? `${t('Libres de')} ${formatBytes(stats.total_disk, language)} ${t('totales')} (${number.format(getDiskUsedPercent())}% ${t('en uso')})`
              : t('Cargando...')}
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t('Espacio Recuperable')}</div>
          <div className="card-value aqua">
            {scanStatus === 'done' ? formatBytes(potentialSpace, language) : '---'}
          </div>
          <div className="card-desc">
            {scanStatus === 'done'
              ? `${number.format(safeCount)} ${t('elementos seguros listos para limpiar.')}`
              : t('Haz clic en Escanear para analizar archivos temporales.')}
          </div>
        </div>
      </div>

      {scanStatus === 'done' && (
        <div className="card" style={{ marginTop: '24px', borderLeft: '3px solid var(--accent-aqua)' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InfoIcon size={16} className="aqua" />
            {t('Resumen del Análisis')}
          </div>
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{number.format(safeCount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('Archivos Seguros')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{number.format(reviewCount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('Requieren Revisión')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{number.format(startupCount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('Apps de Arranque')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{number.format(bgCount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('Procesos de Fondo')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
