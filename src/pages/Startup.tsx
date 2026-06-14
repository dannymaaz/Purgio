import React, { useState, useMemo } from 'react';
import { StartupIcon, InfoIcon } from '../components/Icons';

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
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filter === 'enabled') result = result.filter(i => i.enabled);
    if (filter === 'safe') result = result.filter(i => i.is_safe_to_disable);

    // Ordenar por impacto: High -> Medium -> Low -> Unknown, y luego los habilitados primero
    const impactWeight = { High: 3, Medium: 2, Low: 1, Unknown: 0 };
    return result.sort((a, b) => {
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      return impactWeight[b.impact] - impactWeight[a.impact];
    });
  }, [items, filter]);

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'High': return <span className="badge badge-sensitive">Alto Impacto</span>;
      case 'Medium': return <span className="badge badge-review">Medio Impacto</span>;
      case 'Low': return <span className="badge badge-safe">Bajo Impacto</span>;
      default: return <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', textTransform: 'none' }}>Desconocido</span>;
    }
  };

  const enabledCount = items.filter(i => i.enabled).length;
  const safeCount = items.filter(i => i.is_safe_to_disable).length;

  const toggleExpand = (id: string) => {
    setExpandedItem(prev => prev === id ? null : id);
  };

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StartupIcon size={24} className="aqua" /> Aplicaciones de Arranque
          </h1>
          <p className="page-subtitle">Programas que inician automáticamente al encender tu PC</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <div>Total: <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong></div>
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

      <div className="cockpit-table" style={{ marginTop: '0' }}>
        {filteredItems.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ opacity: 0.3, marginBottom: '16px' }}>
              <StartupIcon size={48} className="empty-state-icon" />
            </div>
            <p style={{ color: 'var(--text-muted)' }}>No se encontraron programas de arranque que coincidan con el filtro.</p>
          </div>
        ) : (
          <>
            <div className="table-header-row">
              <div className="col-name" style={{ flex: '2.5' }}>Programa y Detalles</div>
              <div className="col-risk" style={{ flex: '1.2' }}>Impacto al Inicio</div>
              <div className="col-size" style={{ flex: '1.2' }}>Seguridad</div>
              <div className="col-actions" style={{ flex: '1.5' }}>Acciones</div>
            </div>

            {filteredItems.map((item) => {
              const isExpanded = expandedItem === item.id;
              return (
                <React.Fragment key={item.id}>
                  <div 
                    className={`table-row ${item.enabled ? '' : 'row-disabled'}`}
                    style={{ 
                      opacity: item.enabled ? 1 : 0.65, 
                      transition: 'opacity 0.2s ease',
                      backgroundColor: isExpanded ? 'var(--bg-card-hover)' : 'transparent' 
                    }}
                  >
                    <div 
                      className="col-name" 
                      style={{ flex: '2.5', display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer' }}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }} title={item.description}>
                        {item.description || 'Sin recomendación disponible.'}
                      </span>
                    </div>

                    <div className="col-risk" style={{ flex: '1.2' }}>
                      {getImpactBadge(item.impact)}
                    </div>

                    <div className="col-size" style={{ flex: '1.2' }}>
                      {item.is_safe_to_disable ? (
                        <span className="badge badge-safe">Seguro</span>
                      ) : (
                        <span className="badge badge-review">Precaución</span>
                      )}
                    </div>

                    <div className="col-actions" style={{ flex: '1.5', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button 
                        className={`cleaner-details-btn ${isExpanded ? 'active' : ''}`}
                        onClick={() => toggleExpand(item.id)}
                        title="Ver detalles"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        <InfoIcon size={14} />
                      </button>
                      
                      {item.enabled ? (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleDisable(item)}
                          disabled={isActioning}
                          style={{ padding: '4px 10px', fontSize: '11px', minWidth: '80px' }}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleEnable(item)}
                          disabled={isActioning || !item.command}
                          title={!item.command ? 'Falta el comando original para reactivar' : ''}
                          style={{ padding: '4px 10px', fontSize: '11px', minWidth: '80px' }}
                        >
                          Activar
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="table-details-panel" style={{ display: 'block', padding: '12px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.15)' }}>
                      <div className="details-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {item.command && (
                          <div className="details-text-group">
                            <span className="details-label" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-aqua)', display: 'block', marginBottom: '2px' }}>Comando de ejecución:</span>
                            <code style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px', display: 'block' }}>
                              {item.command}
                            </code>
                          </div>
                        )}
                        <div className="details-text-group">
                          <span className="details-label" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-aqua)', display: 'block', marginBottom: '2px' }}>Recomendación:</span>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0' }}>
                            {item.is_safe_to_disable 
                              ? 'Es seguro deshabilitar este programa para acelerar el arranque de tu equipo. Podrás abrirlo manualmente cuando lo necesites.' 
                              : 'Este programa puede ser crítico para el funcionamiento de hardware o servicios del sistema. Desactívalo solo si sabes qué hace.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
