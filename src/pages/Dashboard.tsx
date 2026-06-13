import React from 'react';
import { ShieldIcon, InfoIcon } from '../components/Icons';

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
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getRamPercent = (): number => {
    if (!stats || stats.total_ram === 0) return 0;
    return Math.round((stats.used_ram / stats.total_ram) * 100);
  };

  const getDiskUsedPercent = (): number => {
    if (!stats || stats.total_disk === 0) return 0;
    const used = stats.total_disk - stats.free_disk;
    return Math.round((used / stats.total_disk) * 100);
  };

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
          <span>
            {scanStatus === 'scanning' ? 'Escaneando' : 'Escanear'}
          </span>
        </button>
        
        <div className="security-badge-container">
          <ShieldIcon className="aqua" size={14} />
          <span>Purgio nunca elimina datos personales o contraseñas sin tu confirmación.</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Tarjeta del Estado del Sistema */}
        <div className="card">
          <div className="card-title">Sistema Operativo</div>
          <div className="card-value teal" style={{ fontSize: '24px', padding: '6px 0' }}>
            {stats?.os_name || 'Detectando...'}
          </div>
          <div className="card-desc">Monitoreo de recursos nativos en tiempo real.</div>
        </div>

        {/* Tarjeta RAM */}
        <div className="card">
          <div className="card-title">Uso de Memoria RAM</div>
          <div className="card-value">
            {stats ? `${getRamPercent()}%` : '0%'}
          </div>
          <div className="card-desc">
            {stats ? `${formatBytes(stats.used_ram)} usados de ${formatBytes(stats.total_ram)}` : 'Cargando...'}
          </div>
        </div>

        {/* Tarjeta Almacenamiento */}
        <div className="card">
          <div className="card-title">Espacio en Disco Principal</div>
          <div className="card-value">
            {stats ? `${formatBytes(stats.free_disk)}` : '0 GB'}
          </div>
          <div className="card-desc">
            {stats ? `Libres de ${formatBytes(stats.total_disk)} totales (${getDiskUsedPercent()}% en uso)` : 'Cargando...'}
          </div>
        </div>

        {/* Tarjeta Espacio Potencial */}
        <div className="card">
          <div className="card-title">Espacio Recuperable</div>
          <div className="card-value aqua">
            {scanStatus === 'done' ? formatBytes(potentialSpace) : '---'}
          </div>
          <div className="card-desc">
            {scanStatus === 'done' 
              ? `${safeCount} elementos seguros listos para limpiar.` 
              : 'Haz clic en Escanear para analizar archivos temporales.'}
          </div>
        </div>
      </div>

      {scanStatus === 'done' && (
        <div className="card" style={{ marginTop: '24px', borderLeft: '3px solid var(--accent-aqua)' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InfoIcon size={16} className="aqua" />
            Resumen del Análisis
          </div>
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{safeCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Archivos Seguros</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{reviewCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Requieren Revisión</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{startupCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Apps de Arranque</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{bgCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Procesos de Fondo</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
