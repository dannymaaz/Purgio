import React, { useState } from 'react';
import { InfoIcon, TrashIcon, RefreshIcon } from '../components/Icons';

export interface CleanableItem {
  id: string;
  name: string;
  size: number;
  path: string;
  risk_level: 'Safe' | 'Review' | 'Sensitive' | 'Critical';
  description: string;
  impact: string;
  recommended_action: string;
  selected: boolean;
  category: string;
}

interface CleanerProps {
  items: CleanableItem[];
  setItems: React.Dispatch<React.SetStateAction<CleanableItem[]>>;
  handleClean: (selectedItems: CleanableItem[]) => void;
  isCleaning: boolean;
  scanStatus?: 'idle' | 'scanning' | 'done';
  handleScan?: () => void;
}

export const Cleaner: React.FC<CleanerProps> = ({
  items,
  setItems,
  handleClean,
  isCleaning,
  scanStatus = 'idle',
  handleScan
}) => {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const toggleSelect = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedItem(prev => prev === id ? null : id);
  };

  const selectAllSafe = () => {
    setItems(prev => prev.map(item => {
      if (item.risk_level === 'Safe') {
        return { ...item, selected: true };
      }
      return item;
    }));
  };

  const deselectAll = () => {
    setItems(prev => prev.map(item => ({ ...item, selected: false })));
  };

  // Filtrar solo items del sistema (no navegadores)
  const systemItems = items.filter(item => !item.category.startsWith('browser_'));

  const safeItems = systemItems.filter(item => item.risk_level === 'Safe');
  const reviewItems = systemItems.filter(item => item.risk_level === 'Review');

  const selectedSize = systemItems
    .filter(item => item.selected)
    .reduce((sum, item) => sum + item.size, 0);

  const onCleanClick = () => {
    const selected = systemItems.filter(item => item.selected);
    if (selected.length > 0) {
      handleClean(selected);
    }
  };

  const renderTableHead = () => (
    <div className="table-header-row">
      <div className="col-checkbox">
        <input 
          type="checkbox" 
          className="cleaner-checkbox"
          checked={systemItems.length > 0 && systemItems.every(i => i.selected)}
          onChange={(e) => {
            const checked = e.target.checked;
            setItems(prev => prev.map(i => !i.category.startsWith('browser_') ? { ...i, selected: checked } : i));
          }}
          disabled={isCleaning || scanStatus === 'scanning' || systemItems.length === 0}
          aria-label="Seleccionar todos los elementos"
        />
      </div>
      <div className="col-name">Componente y Ubicación</div>
      <div className="col-risk">Nivel de Riesgo</div>
      <div className="col-size">Tamaño</div>
      <div className="col-actions"></div>
    </div>
  );

  const renderItemRow = (item: CleanableItem) => {
    const isExpanded = expandedItem === item.id;
    return (
      <React.Fragment key={item.id}>
        <div className={`table-row ${isExpanded ? 'expanded' : ''} ${item.selected ? 'selected' : ''}`}>
          <div className="col-checkbox">
            <input 
              type="checkbox" 
              className="cleaner-checkbox"
              checked={item.selected}
              onChange={() => toggleSelect(item.id)}
              disabled={isCleaning}
              aria-label={`Seleccionar ${item.name}`}
            />
          </div>
          <div className="col-name" onClick={() => toggleExpand(item.id)} style={{ cursor: 'pointer' }}>
            <span className="cleaner-item-name">{item.name}</span>
            <span className="cleaner-item-path" title={item.path}>{item.path}</span>
          </div>
          <div className="col-risk">
            <span className={`badge ${item.risk_level === 'Safe' ? 'badge-safe' : 'badge-review'}`}>
              {item.risk_level === 'Safe' ? 'Seguro' : 'Revisión'}
            </span>
          </div>
          <div className="col-size">
            <span className="cleaner-item-size">{formatBytes(item.size)}</span>
          </div>
          <div className="col-actions">
            <button 
              className={`cleaner-details-btn ${isExpanded ? 'active' : ''}`}
              onClick={() => toggleExpand(item.id)}
              title="Ver detalles"
            >
              <InfoIcon size={14} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="table-details-panel">
            <div className="details-content">
              <div className="details-text-group">
                <span className="details-label">Qué es:</span>
                <p>{item.description}</p>
              </div>
              <div className="details-text-group" style={{ marginTop: '8px' }}>
                <span className="details-label">Impacto al eliminar:</span>
                <p>{item.impact}</p>
              </div>
              <div className="details-meta-grid">
                <div>
                  <span className="details-label">Recomendación:</span>
                  <span className={`details-rec-value ${item.risk_level === 'Safe' ? 'safe' : 'warning'}`}>
                    {item.recommended_action}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  const renderSkeletons = () => (
    <div className="table-loading-container">
      <div className="loading-bar-wrapper">
        <div className="loading-bar-infinite"></div>
      </div>
      <div className="skeleton-table">
        {[1, 2, 3, 4].map(idx => (
          <div key={idx} className="skeleton-row">
            <div className="skeleton-cell col-checkbox"><div className="skeleton-box pulse"></div></div>
            <div className="skeleton-cell col-name">
              <div className="skeleton-line title pulse" style={{ width: '40%' }}></div>
              <div className="skeleton-line path pulse" style={{ width: '75%' }}></div>
            </div>
            <div className="skeleton-cell col-risk"><div className="skeleton-box badge-pulse pulse"></div></div>
            <div className="skeleton-cell col-size"><div className="skeleton-line size pulse" style={{ width: '50%' }}></div></div>
            <div className="skeleton-cell col-actions"><div className="skeleton-box btn-pulse pulse"></div></div>
          </div>
        ))}
      </div>
      <div className="loading-status-text">
        Analizando archivos temporales y cachés del sistema operativo...
      </div>
    </div>
  );

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Limpieza de Archivos</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Listado estructurado de componentes seguros y cachés de sistema analizables para liberación de espacio.
          </p>
        </div>
        
        {scanStatus === 'done' && systemItems.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={deselectAll} disabled={isCleaning}>
              Deseleccionar todo
            </button>
            <button className="btn btn-secondary" onClick={selectAllSafe} disabled={isCleaning}>
              Seleccionar Seguros
            </button>
            <button 
              className="btn btn-primary"
              onClick={onCleanClick}
              disabled={isCleaning || selectedSize === 0}
            >
              <TrashIcon size={16} />
              {isCleaning ? 'Limpiando...' : `Limpiar ${formatBytes(selectedSize)}`}
            </button>
          </div>
        )}
      </div>

      {scanStatus === 'scanning' ? (
        renderSkeletons()
      ) : scanStatus === 'idle' ? (
        <div className="card" style={{ textAlign: 'center', padding: '54px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '460px', lineHeight: '1.5' }}>
            Purgio necesita escanear tu sistema de archivos para detectar componentes residuales seguros que pueden ser removidos para optimizar espacio.
          </p>
          {handleScan && (
            <button className="btn btn-primary" onClick={handleScan}>
              <RefreshIcon size={14} />
              Iniciar Análisis Completo
            </button>
          )}
        </div>
      ) : systemItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Análisis completado. Tu sistema se encuentra libre de archivos residuales.</p>
        </div>
      ) : (
        <div className="cockpit-table">
          {renderTableHead()}
          
          {safeItems.length > 0 && (
            <div className="table-group-section">
              <div className="table-group-title">Elementos Seguros para Eliminar</div>
              {safeItems.map(renderItemRow)}
            </div>
          )}

          {reviewItems.length > 0 && (
            <div className="table-group-section" style={{ marginTop: '16px' }}>
              <div className="table-group-title">Elementos que Requieren Revisión</div>
              {reviewItems.map(renderItemRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
