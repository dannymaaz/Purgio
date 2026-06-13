import React, { useState } from 'react';
import { CleanableItem } from './Cleaner';
import { InfoIcon, TrashIcon, WarningIcon } from '../components/Icons';

interface BrowsersProps {
  items: CleanableItem[];
  setItems: React.Dispatch<React.SetStateAction<CleanableItem[]>>;
  handleClean: (selectedItems: CleanableItem[]) => void;
  isCleaning: boolean;
}

export const Browsers: React.FC<BrowsersProps> = ({
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

  // Filtrar solo items que son de navegadores
  const browserItems = items.filter(item => item.category.startsWith('browser_'));

  // Agrupar items por Navegador
  // Los IDs de los navegadores se generan en Rust como "chrome_cache", "firefox_sessions", etc.
  const getBrowserName = (id: string): string => {
    if (id.startsWith('chrome_')) return 'Google Chrome';
    if (id.startsWith('edge_')) return 'Microsoft Edge';
    if (id.startsWith('firefox_')) return 'Mozilla Firefox';
    if (id.startsWith('brave_')) return 'Brave Browser';
    if (id.startsWith('opera_')) return 'Opera';
    if (id.startsWith('safari_')) return 'Safari';
    if (id.startsWith('chromium_')) return 'Chromium';
    return 'Navegador';
  };

  // Obtener lista única de navegadores detectados
  const detectedBrowsers = Array.from(new Set(browserItems.map(item => getBrowserName(item.id))));

  const selectedSize = browserItems
    .filter(item => item.selected)
    .reduce((sum, item) => sum + item.size, 0);

  const onCleanClick = () => {
    const selected = browserItems.filter(item => item.selected);
    if (selected.length > 0) {
      handleClean(selected);
    }
  };

  const renderItem = (item: CleanableItem) => {
    const isExpanded = expandedItem === item.id;
    const isSensitive = item.risk_level === 'Sensitive';
    const isReview = item.risk_level === 'Review';
    const isSafe = item.risk_level === 'Safe';

    return (
      <div 
        key={item.id} 
        className="cleaner-item"
        style={isSensitive ? { borderLeft: '3px solid var(--danger)' } : {}}
      >
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
              <div 
                className="cleaner-item-name"
                style={isSensitive ? { color: 'var(--danger)' } : {}}
              >
                {item.name}
              </div>
              <div className="cleaner-item-path" title={item.path}>
                Ubicación del Perfil de Usuario
              </div>
            </div>
          </div>
          <div className="cleaner-item-right">
            <span className={`badge ${
              isSafe ? 'badge-safe' : isReview ? 'badge-review' : 'badge-sensitive'
            }`}>
              {isSafe ? 'Seguro' : isReview ? 'Revisión' : 'Sensible'}
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

        {isSensitive && (
          <div className="browser-session-warning">
            <WarningIcon size={14} />
            <span>Eliminar este elemento puede cerrar sesiones activas o requerir volver a iniciar sesión.</span>
          </div>
        )}

        {isExpanded && (
          <div className="cleaner-details-panel">
            <div><strong>Qué es:</strong> {item.description}</div>
            <div style={{ marginTop: '6px' }}><strong>Impacto al eliminar:</strong> {item.impact}</div>
            <div className="cleaner-details-grid">
              <div>
                <div className="cleaner-details-label">Nivel de riesgo</div>
                <span className={`badge ${isSafe ? 'badge-safe' : isReview ? 'badge-review' : 'badge-sensitive'}`}>
                  {isSafe ? 'Bajo' : isReview ? 'Moderado' : 'Alto (Sensible)'}
                </span>
              </div>
              <div>
                <div className="cleaner-details-label">Recomendación</div>
                <span style={{ color: isSafe ? 'var(--accent-aqua)' : isReview ? 'var(--warning)' : 'var(--danger)' }}>
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
          <h2>Limpieza de Navegadores</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Gestiona de forma selectiva cachés, historiales y cookies. Los datos sensibles no están marcados por defecto.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setItems(prev => prev.map(i => i.category.startsWith('browser_') ? { ...i, selected: false } : i))}
            disabled={isCleaning}
          >
            Deseleccionar todo
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

      {browserItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>No se han escaneado datos de navegadores aún. Realiza un escaneo desde el Dashboard.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {detectedBrowsers.map(browserName => {
            const currentBrowserItems = browserItems.filter(item => getBrowserName(item.id) === browserName);
            if (currentBrowserItems.length === 0) return null;
            
            return (
              <div key={browserName} className="cleaner-category-section">
                <div className="cleaner-category-title">{browserName}</div>
                <div className="cleaner-list">
                  {currentBrowserItems.map(renderItem)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
