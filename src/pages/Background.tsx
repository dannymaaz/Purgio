import React, { useState } from 'react';
import { CloseIcon, InfoIcon } from '../components/Icons';

export interface ProcessItem {
  pid: number;
  name: string;
  ram_usage: number; // En bytes
  cpu_usage: number; // En porcentaje
  description: string;
  impact_on_close: string;
  is_safe_to_close: boolean;
}

interface BackgroundProps {
  items: ProcessItem[];
  handleKillProcess: (item: ProcessItem) => void;
  isActioning: boolean;
}

export const Background: React.FC<BackgroundProps> = ({
  items,
  handleKillProcess,
  isActioning
}) => {
  const [selectedProcess, setSelectedProcess] = useState<ProcessItem | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Procesos en Segundo Plano</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Lista de aplicaciones no esenciales en ejecución activa. Finalizarlas libera memoria RAM de inmediato.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando procesos en ejecución...</p>
        </div>
      ) : (
        <div className="process-list">
          {items.map((item) => (
            <div key={item.pid} className="process-item">
              <div className="process-info-left">
                <div className="process-name-container">
                  <span className="process-name-text">{item.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PID: {item.pid}</span>
                </div>
                
                <div className="process-stats-grid">
                  <div className="process-stat">
                    <span className="process-stat-label">RAM</span>
                    <span className="process-stat-value">{formatBytes(item.ram_usage)}</span>
                  </div>
                  <div className="process-stat">
                    <span className="process-stat-label">CPU</span>
                    <span className="process-stat-value">{item.cpu_usage.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  className="cleaner-details-btn"
                  onClick={() => setSelectedProcess(selectedProcess?.pid === item.pid ? null : item)}
                >
                  <InfoIcon size={14} />
                  Detalles
                </button>
                <button 
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => handleKillProcess(item)}
                  disabled={isActioning}
                >
                  <CloseIcon size={12} />
                  Finalizar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedProcess && (
        <div className="modal-overlay" onClick={() => setSelectedProcess(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <InfoIcon size={20} className="teal" />
              Detalles del Proceso: {selectedProcess.name}
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <strong>Descripción:</strong>
                <p style={{ marginTop: '4px', fontSize: '13px' }}>{selectedProcess.description}</p>
              </div>
              <div>
                <strong>Impacto al cerrar:</strong>
                <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--warning)' }}>{selectedProcess.impact_on_close}</p>
              </div>
              <div className="cleaner-details-grid">
                <div>
                  <div className="cleaner-details-label">Consumo de Memoria</div>
                  <span>{formatBytes(selectedProcess.ram_usage)}</span>
                </div>
                <div>
                  <div className="cleaner-details-label">Acción sugerida</div>
                  <span style={{ color: 'var(--accent-aqua)' }}>Cerrar si no está en uso</span>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedProcess(null)}>
                Cerrar Detalles
              </button>
              <button 
                className="btn btn-danger"
                onClick={() => {
                  handleKillProcess(selectedProcess);
                  setSelectedProcess(null);
                }}
                disabled={isActioning}
              >
                Finalizar Proceso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
