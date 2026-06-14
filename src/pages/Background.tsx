import React, { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BackgroundIcon } from '../components/Icons';
import { formatBytes } from '../utils/format';

export interface ProcessItem {
  pid: number;
  name: string;
  memory_usage: number;
  cpu_usage: number;
  is_safe_to_kill: boolean;
  description: string;
  warning?: string;
  exe_path?: string;
  process_type?: string;
}

// Grupo de procesos con el mismo nombre (multi-proceso, ej: msedge.exe)
interface ProcessGroup {
  name: string;
  instances: ProcessItem[];
  total_memory: number;
  total_cpu: number;
  is_safe_to_kill: boolean;
  description: string;
  warning?: string;
}

interface BackgroundProps {
  items: ProcessItem[];
  handleKillProcess: (item: ProcessItem) => void;
  isActioning: boolean;
}

export const Background: React.FC<BackgroundProps> = ({ items, handleKillProcess, isActioning }) => {
  const [filter, setFilter] = useState<'all' | 'safe' | 'high_ram'>('all');
  const [killingGroup, setKillingGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Agrupar procesos con el mismo nombre
  const processGroups = useMemo(() => {
    const groupMap = new Map<string, ProcessItem[]>();
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(item);
    }

    const groups: ProcessGroup[] = Array.from(groupMap.entries()).map(([_, instances]) => ({
      name: instances[0].name,
      instances,
      total_memory: instances.reduce((s, i) => s + i.memory_usage, 0),
      total_cpu: instances.reduce((s, i) => s + i.cpu_usage, 0),
      is_safe_to_kill: instances.every(i => i.is_safe_to_kill),
      description: instances[0].description,
      warning: instances[0].warning,
    }));

    // Filtrar
    let filtered = groups;
    if (filter === 'safe') {
      filtered = filtered.filter(g => g.is_safe_to_kill);
    } else if (filter === 'high_ram') {
      filtered = filtered.filter(g => g.total_memory > 50 * 1024 * 1024);
    }

    // Ordenar de mayor a menor RAM total
    return filtered.sort((a, b) => b.total_memory - a.total_memory);
  }, [items, filter]);

  const safeCount = useMemo(() =>
    new Set(items.filter(i => i.is_safe_to_kill).map(i => i.name.toLowerCase())).size,
    [items]
  );
  const totalRam = items.reduce((sum, i) => sum + i.memory_usage, 0);

  // Matar todas las instancias de un grupo de una vez
  const handleKillGroup = async (group: ProcessGroup) => {
    if (group.instances.length === 1) {
      handleKillProcess(group.instances[0]);
      return;
    }
    setKillingGroup(group.name.toLowerCase());
    try {
      await invoke<number>('kill_background_process_group', { name: group.name });
    } catch (e) {
      // Intentar uno a uno como fallback
      for (const inst of group.instances) {
        try { handleKillProcess(inst); } catch {}
      }
    } finally {
      setKillingGroup(null);
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BackgroundIcon size={24} className="aqua" /> Procesos en Segundo Plano
          </h1>
          <p className="page-subtitle" style={{ maxWidth: '600px' }}>
            Aplicaciones consumiendo recursos mientras no las usas.
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>
              * Los navegadores modernos (Chrome, Edge, Brave) usan múltiples procesos por pestaña por seguridad y estabilidad.
            </span>
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <div>Procesos: <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> ({processGroups.length} grupos)</div>
          <div>RAM total: <strong style={{ color: 'var(--accent-aqua)' }}>{formatBytes(totalRam)}</strong></div>
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos <span className="tab-count">{processGroups.length}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'safe' ? 'active' : ''}`}
          onClick={() => setFilter('safe')}
        >
          Seguros de cerrar <span className="tab-count">{safeCount}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'high_ram' ? 'active' : ''}`}
          onClick={() => setFilter('high_ram')}
        >
          Alto consumo RAM
        </button>
      </div>

      <div className="cockpit-table" style={{ marginTop: '0' }}>
        {processGroups.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ opacity: 0.3, marginBottom: '16px' }}>
              <BackgroundIcon size={48} className="empty-state-icon" />
            </div>
            <p style={{ color: 'var(--text-muted)' }}>No se encontraron procesos que coincidan con el filtro actual.</p>
          </div>
        ) : (
          <>
            <div className="table-header-row">
              <div className="col-name" style={{ flex: '2.5' }}>Proceso</div>
              <div className="col-size" style={{ flex: '1.2' }}>Consumo RAM</div>
              <div className="col-risk" style={{ flex: '1.0' }}>Uso CPU</div>
              <div className="col-risk" style={{ flex: '1.0' }}>Seguridad</div>
              <div className="col-actions" style={{ flex: '1.3' }}>Acción</div>
            </div>

            {processGroups.map(group => {
              const ramBar = Math.min((group.total_memory / (500 * 1024 * 1024)) * 100, 100);
              const cpuBar = Math.min(group.total_cpu, 100);
              const isMulti = group.instances.length > 1;
              const isKilling = killingGroup === group.name.toLowerCase() || isActioning;
              const isExpanded = expandedGroup === group.name.toLowerCase();

              return (
                <React.Fragment key={group.name.toLowerCase()}>
                  <div 
                    className="table-row" 
                    style={{ 
                      backgroundColor: isExpanded ? 'var(--bg-card-hover)' : 'transparent',
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    <div 
                      className="col-name" 
                      style={{ flex: '2.5', display: 'flex', flexDirection: 'column', gap: '2px', cursor: isMulti ? 'pointer' : 'default' }}
                      onClick={() => isMulti && setExpandedGroup(prev => prev === group.name.toLowerCase() ? null : group.name.toLowerCase())}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{group.name}</span>
                        {isMulti && (
                          <span
                            style={{
                              fontSize: '10px',
                              background: 'var(--accent-aqua)',
                              color: '#000',
                              borderRadius: '10px',
                              padding: '1px 6px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                            title={`${group.instances.length} instancias activas. Haz clic para ver detalles.`}
                          >
                            ×{group.instances.length}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {group.description || 'Proceso en segundo plano.'}
                      </div>
                      {group.warning && (
                        <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px', fontWeight: 500 }}>
                          ⚠️ {group.warning}
                        </div>
                      )}
                    </div>

                    <div className="col-size" style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatBytes(group.total_memory)}</span>
                      <div className="process-usage-bar" style={{ margin: 0, width: '70px' }}>
                        <div
                          className={`process-usage-fill ram-fill ${ramBar > 80 ? 'critical' : ramBar > 50 ? 'high' : ''}`}
                          style={{ width: `${ramBar}%` }}
                        />
                      </div>
                    </div>

                    <div className="col-risk" style={{ flex: '1.0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{group.total_cpu.toFixed(1)}%</span>
                      <div className="process-usage-bar" style={{ margin: 0, width: '60px' }}>
                        <div
                          className={`process-usage-fill cpu-fill ${cpuBar > 50 ? 'critical' : cpuBar > 20 ? 'high' : ''}`}
                          style={{ width: `${cpuBar}%` }}
                        />
                      </div>
                    </div>

                    <div className="col-risk" style={{ flex: '1.0' }}>
                      {group.is_safe_to_kill ? (
                        <span className="badge badge-safe">Seguro</span>
                      ) : (
                        <span className="badge badge-review">Precaución</span>
                      )}
                    </div>

                    <div className="col-actions" style={{ flex: '1.3', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        className={`btn ${group.is_safe_to_kill ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '4px 10px', fontSize: '11px', minWidth: '85px' }}
                        onClick={() => handleKillGroup(group)}
                        disabled={isKilling}
                        title={isMulti ? `Finalizar las ${group.instances.length} instancias de ${group.name}` : `Finalizar ${group.name}`}
                      >
                        {isKilling ? 'Cerrando...' : isMulti ? `Cerrar ×${group.instances.length}` : 'Finalizar'}
                      </button>
                    </div>
                  </div>

                  {/* Expandir para ver instancias individuales (PIDs) */}
                  {isExpanded && isMulti && group.instances.map(inst => (
                    <div 
                      key={inst.pid} 
                      className="table-row" 
                      style={{ 
                        background: 'rgba(0,0,0,0.18)', 
                        fontSize: '12px',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        paddingTop: '8px',
                        paddingBottom: '8px' 
                      }}
                    >
                      <div className="col-name" style={{ flex: '2.5', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>PID: {inst.pid}</span>
                        {inst.exe_path && (
                          <span 
                            style={{ 
                              fontSize: '10px', 
                              color: 'var(--text-muted)', 
                              maxWidth: '240px', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace' 
                            }} 
                            title={inst.exe_path}
                          >
                            {inst.exe_path}
                          </span>
                        )}
                      </div>
                      <div className="col-size" style={{ flex: '1.2', color: 'var(--text-secondary)' }}>
                        {formatBytes(inst.memory_usage)}
                      </div>
                      <div className="col-risk" style={{ flex: '1.0', color: 'var(--text-secondary)' }}>
                        {inst.cpu_usage.toFixed(1)}%
                      </div>
                      <div className="col-risk" style={{ flex: '1.0' }} />
                      <div className="col-actions" style={{ flex: '1.3', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '10px', minWidth: '70px' }}
                          onClick={() => handleKillProcess(inst)}
                          disabled={isActioning}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
