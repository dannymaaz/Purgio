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

// Grupo de procesos con el mismo nombre (multi-proceso, ej: msedge.exe ×3)
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

  // Agrupar procesos con el mismo nombre (comportamiento normal de Windows, ej: msedge.exe ×3)
  const processGroups = useMemo((): ProcessGroup[] => {
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
          <h1 className="page-title">
            <BackgroundIcon size={24} /> Procesos en Segundo Plano
          </h1>
          <p className="page-subtitle">
            Aplicaciones consumiendo recursos mientras no las usas.{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              (Los procesos como msedge.exe ×3 son normales — Chrome/Edge/Brave usan múltiples procesos por pestaña)
            </span>
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div>Procesos: <strong>{items.length}</strong> ({processGroups.length} grupos)</div>
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

      <div className="card">
        {processGroups.length === 0 ? (
          <div className="empty-state">
            <BackgroundIcon size={48} className="empty-state-icon" />
            <p>No se encontraron procesos que coincidan con el filtro actual.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proceso</th>
                  <th>RAM</th>
                  <th>CPU</th>
                  <th>Seguridad</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {processGroups.map(group => {
                  const ramBar = Math.min((group.total_memory / (500 * 1024 * 1024)) * 100, 100);
                  const cpuBar = Math.min(group.total_cpu, 100);
                  const isMulti = group.instances.length > 1;
                  const isKilling = killingGroup === group.name.toLowerCase() || isActioning;
                  const isExpanded = expandedGroup === group.name.toLowerCase();

                  return (
                    <React.Fragment key={group.name.toLowerCase()}>
                      <tr style={isExpanded ? { background: 'var(--bg-secondary)' } : {}}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{group.name}</span>
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
                                title={`${group.instances.length} instancias activas. Haz clic para ver los PIDs.`}
                                onClick={() => setExpandedGroup(prev => prev === group.name.toLowerCase() ? null : group.name.toLowerCase())}
                              >
                                ×{group.instances.length}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {group.description}
                          </div>
                          {group.warning && (
                            <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>
                              ⚠ {group.warning}
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ display: 'inline-block', width: '60px' }}>{formatBytes(group.total_memory)}</span>
                          <div className="process-usage-bar">
                            <div
                              className={`process-usage-fill ram-fill ${ramBar > 80 ? 'critical' : ramBar > 50 ? 'high' : ''}`}
                              style={{ width: `${ramBar}%` }}
                            />
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-block', width: '40px' }}>{group.total_cpu.toFixed(1)}%</span>
                          <div className="process-usage-bar">
                            <div
                              className={`process-usage-fill cpu-fill ${cpuBar > 50 ? 'critical' : cpuBar > 20 ? 'high' : ''}`}
                              style={{ width: `${cpuBar}%` }}
                            />
                          </div>
                        </td>
                        <td>
                          {group.is_safe_to_kill ? (
                            <span className="badge badge-safe">Seguro</span>
                          ) : (
                            <span className="badge badge-warning">Precaución</span>
                          )}
                        </td>
                        <td>
                          <button
                            className={`btn ${group.is_safe_to_kill ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '4px 12px', fontSize: '11px' }}
                            onClick={() => handleKillGroup(group)}
                            disabled={isKilling}
                            title={isMulti ? `Finalizar las ${group.instances.length} instancias de ${group.name}` : `Finalizar ${group.name}`}
                          >
                            {isKilling ? 'Cerrando...' : isMulti ? `Finalizar ×${group.instances.length}` : 'Finalizar'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandir para ver instancias individuales (PIDs) */}
                      {isExpanded && isMulti && group.instances.map(inst => (
                        <tr key={inst.pid} style={{ background: 'rgba(0,0,0,0.15)', fontSize: '12px' }}>
                          <td style={{ paddingLeft: '32px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>PID: {inst.pid}</span>
                            {inst.exe_path && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.exe_path}>
                                {inst.exe_path}
                              </div>
                            )}
                          </td>
                          <td><span style={{ color: 'var(--text-secondary)' }}>{formatBytes(inst.memory_usage)}</span></td>
                          <td><span style={{ color: 'var(--text-secondary)' }}>{inst.cpu_usage.toFixed(1)}%</span></td>
                          <td />
                          <td>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: '10px' }}
                              onClick={() => handleKillProcess(inst)}
                              disabled={isActioning}
                            >
                              Finalizar este
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
