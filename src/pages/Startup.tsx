import React, { useState, useMemo } from 'react';
import { StartupIcon } from '../components/Icons';

export interface StartupItem {
  id: string;
  name: string;
  enabled: boolean;
  is_safe_to_disable: boolean;
  description: string;
  impact: 'High' | 'Medium' | 'Low' | 'Unknown';
  location_key?: string;
  command?: string;
}

interface StartupProps {
  items: StartupItem[];
  handleDisable: (item: StartupItem) => void;
  handleEnable: (item: StartupItem) => void;
  isActioning: boolean;
}

export const Startup: React.FC<StartupProps> = ({ items, handleDisable, handleEnable, isActioning }) => {
  const [filter, setFilter] = useState<'all' | 'enabled' | 'safe'>('all');

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filter === 'enabled') result = result.filter(i => i.enabled);
    if (filter === 'safe') result = result.filter(i => i.is_safe_to_disable);

    // Sort by impact: High -> Medium -> Low -> Unknown, then enabled first
    const impactWeight = { High: 3, Medium: 2, Low: 1, Unknown: 0 };
    return result.sort((a, b) => {
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      return impactWeight[b.impact] - impactWeight[a.impact];
    });
  }, [items, filter]);

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'High': return <span className="badge badge-danger">Alto Impacto</span>;
      case 'Medium': return <span className="badge badge-warning">Impacto Medio</span>;
      case 'Low': return <span className="badge badge-safe">Bajo Impacto</span>;
      default: return <span className="badge badge-neutral">Desconocido</span>;
    }
  };

  const enabledCount = items.filter(i => i.enabled).length;
  const safeCount = items.filter(i => i.is_safe_to_disable).length;

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <StartupIcon size={24} /> Aplicaciones de Arranque
          </h1>
          <p className="page-subtitle">Programas que inician automáticamente al encender tu PC</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div>Total: <strong>{items.length}</strong></div>
          <div>Habilitadas: <strong style={{ color: 'var(--warning)' }}>{enabledCount}</strong></div>
        </div>
      </div>

      <div className="filter-tabs">
        <button 
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todas <span className="tab-count">{items.length}</span>
        </button>
        <button 
          className={`filter-tab ${filter === 'enabled' ? 'active' : ''}`}
          onClick={() => setFilter('enabled')}
        >
          Habilitadas <span className="tab-count">{enabledCount}</span>
        </button>
        <button 
          className={`filter-tab ${filter === 'safe' ? 'active' : ''}`}
          onClick={() => setFilter('safe')}
        >
          Seguras de Desactivar <span className="tab-count">{safeCount}</span>
        </button>
      </div>

      <div className="card">
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <StartupIcon size={48} className="empty-state-icon" />
            <p>No se encontraron programas de arranque que coincidan con el filtro.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Programa</th>
                  <th>Impacto al Inicio</th>
                  <th>Seguridad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className={item.enabled ? '' : 'disabled-row'}>
                    <td>
                      <div style={{ fontWeight: 500, color: item.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {item.description}
                      </div>
                      {item.command && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', opacity: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }} title={item.command}>
                          {item.command}
                        </div>
                      )}
                    </td>
                    <td>{getImpactBadge(item.impact)}</td>
                    <td>
                      {item.is_safe_to_disable ? (
                        <span className="badge badge-safe">Seguro</span>
                      ) : (
                        <span className="badge badge-warning">Precaución</span>
                      )}
                    </td>
                    <td>
                      {item.enabled ? (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleDisable(item)}
                          disabled={isActioning}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleEnable(item)}
                          disabled={isActioning || !item.command}
                          title={!item.command ? 'Falta el comando original para reactivar' : ''}
                        >
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
