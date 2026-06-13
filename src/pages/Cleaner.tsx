import React, { useState } from 'react';
import { InfoIcon, TrashIcon } from '../components/Icons';

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
}

export const Cleaner: React.FC<CleanerProps> = ({
  items,
  setItems,
  handleClean,
  isCleaning
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

  const renderItem = (item: CleanableItem) => {
    const isExpanded = expandedItem === item.id;
    return (
      <div key={item.id} className="cleaner-item">
        <div className="cleaner-item-row">
          <div className="cleaner-item-left">
            <input 
              type="checkbox" 
              className="cleaner-checkbox"
              checked={item.selected}
              onChange={() => toggleSelect(item.id)}
              disabled={isCleaning}
              aria-label={`Seleccionar ${item.name}`}
            />
            <div>
              <div className="cleaner-item-name">{item.name}</div>
              <div className="cleaner-item-path" title={item.path}>
                {item.path.length > 60 ? `${item.path.substring(0, 60)}...` : item.path}
              </div>
            </div>
          </div>
          <div className="cleaner-item-right">
            <span className={`badge ${item.risk_level === 'Safe' ? 'badge-safe' : 'badge-review'}`}>
              {item.risk_level === 'Safe' ? 'Seguro' : 'Requiere Revisión'}
            </span>
            <span className="cleaner-item-size">{formatBytes(item.size)}</span>
            <button 
              className="cleaner-details-btn"
              onClick={() => toggleExpand(item.id)}
            >
              <InfoIcon size={14} />
              {isExpanded ? 'Ocultar' : 'Detalles'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="cleaner-details-panel">
            <div><strong>Qué es:</strong> {item.description}</div>
            <div style={{ marginTop: '6px' }}><strong>Impacto al eliminar:</strong> {item.impact}</div>
            <div className="cleaner-details-grid">
              <div>
                <div className="cleaner-details-label">Nivel de riesgo</div>
                <span className={`badge ${item.risk_level === 'Safe' ? 'badge-safe' : 'badge-review'}`}>
                  {item.risk_level === 'Safe' ? 'Bajo' : 'Moderado'}
                </span>
              </div>
              <div>
                <div className="cleaner-details-label">Recomendación</div>
                <span style={{ color: item.risk_level === 'Safe' ? 'var(--accent-aqua)' : 'var(--warning)' }}>
                  {item.recommended_action}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Limpieza de Archivos</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Selecciona los componentes temporales y del sistema que deseas limpiar de forma segura.
          </p>
        </div>
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
      </div>

      {systemItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>No se han escaneado datos aún. Ve al Dashboard para analizar el sistema.</p>
        </div>
      ) : (
        <>
          {safeItems.length > 0 && (
            <div className="cleaner-category-section">
              <div className="cleaner-category-title">Elementos Seguros para Eliminar</div>
              <div className="cleaner-list">
                {safeItems.map(renderItem)}
              </div>
            </div>
          )}

          {reviewItems.length > 0 && (
            <div className="cleaner-category-section" style={{ marginTop: '24px' }}>
              <div className="cleaner-category-title">Elementos que Requieren Revisión</div>
              <div className="cleaner-list">
                {reviewItems.map(renderItem)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
