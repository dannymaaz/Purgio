import React, { useState } from 'react';
import { CleanableItem } from './Cleaner';
import { InfoIcon, TrashIcon, WarningIcon, RefreshIcon } from '../components/Icons';

interface BrowsersProps {
  items: CleanableItem[];
  setItems: React.Dispatch<React.SetStateAction<CleanableItem[]>>;
  handleClean: (selectedItems: CleanableItem[]) => void;
  isCleaning: boolean;
  scanStatus?: 'idle' | 'scanning' | 'done';
  handleScan?: () => void;
}

export const Browsers: React.FC<BrowsersProps> = ({
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

  // Filtrar solo items que son de navegadores
  const browserItems = items.filter(item => item.category.startsWith('browser_'));

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

  const renderTableHead = () => (
    <div className="table-header-row">
      <div className="col-checkbox">
        <input 
          type="checkbox" 
          className="cleaner-checkbox"
          checked={browserItems.length > 0 && browserItems.every(i => i.selected)}
          onChange={(e) => {
            const checked = e.target.checked;
            setItems(prev => prev.map(i => i.category.startsWith('browser_') ? { ...i, selected: checked } : i));
          }}
          disabled={isCleaning || scanStatus === 'scanning' || browserItems.length === 0}
          aria-label="Seleccionar todos los navegadores"
        />
      </div>
      <div className="col-name">Componente de Navegador</div>
      <div className="col-risk">Riesgo</div>
      <div className="col-size">Tamaño</div>
      <div className="col-actions"></div>
    </div>
  );

  const renderItemRow = (item: CleanableItem) => {
    const isExpanded = expandedItem === item.id;
    const isSensitive = item.risk_level === 'Sensitive';
    const isReview = item.risk_level === 'Review';
    const isSafe = item.risk_level === 'Safe';

    return (
      <React.Fragment key={item.id}>
        <div className={`table-row ${isExpanded ? 'expanded' : ''} ${item.selected ? 'selected' : ''} ${isSensitive ? 'row-sensitive' : ''}`}>
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
            <span className={`cleaner-item-name ${isSensitive ? 'sensitive-text' : ''}`}>{item.name}</span>
            <span className="cleaner-item-path" title={item.path}>Ubicación del Perfil del Navegador</span>
          </div>
          <div className="col-risk">
            <span className={`badge ${isSafe ? 'badge-safe' : isReview ? 'badge-review' : 'badge-sensitive'}`}>
              {isSafe ? 'Seguro' : isReview ? 'Revisión' : 'Sensible'}
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

        {isSensitive && (
          <div className="browser-session-warning">
            <WarningIcon size={14} />
            <span>Eliminar este elemento cerrará tus sesiones activas o requerirá volver a introducir contraseñas.</span>
          </div>
        )}

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
                  <span className={`details-rec-value ${isSafe ? 'safe' : isReview ? 'warning' : 'danger'}`}>
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
        {[1, 2, 3].map(idx => (
          <div key={idx} className="skeleton-row">
            <div className="skeleton-cell col-checkbox"><div className="skeleton-box pulse"></div></div>
            <div className="skeleton-cell col-name">
              <div className="skeleton-line title pulse" style={{ width: '45%' }}></div>
              <div className="skeleton-line path pulse" style={{ width: '60%' }}></div>
            </div>
            <div className="skeleton-cell col-risk"><div className="skeleton-box badge-pulse pulse"></div></div>
            <div className="skeleton-cell col-size"><div className="skeleton-line size pulse" style={{ width: '40%' }}></div></div>
            <div className="skeleton-cell col-actions"><div className="skeleton-box btn-pulse pulse"></div></div>
          </div>
        ))}
      </div>
      <div className="loading-status-text">
        Buscando bases de datos, historiales y archivos temporales de navegadores instalados...
      </div>
    </div>
  );

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Limpieza de Navegadores</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Listado estructurado de cachés de navegadores. Los datos de sesión sensibles no están marcados por defecto.
          </p>
        </div>
        
        {scanStatus === 'done' && browserItems.length > 0 && (
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
        )}
      </div>

      {scanStatus === 'scanning' ? (
        renderSkeletons()
      ) : scanStatus === 'idle' ? (
        <div className="card" style={{ textAlign: 'center', padding: '54px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '460px', lineHeight: '1.5' }}>
            Purgio necesita escanear los perfiles de tus navegadores para identificar elementos que se pueden limpiar.
          </p>
          {handleScan && (
            <button className="btn btn-primary" onClick={handleScan}>
              <RefreshIcon size={14} />
              Iniciar Análisis Completo
            </button>
          )}
        </div>
      ) : browserItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Análisis completado o no se detectaron navegadores instalados compatibles.</p>
        </div>
      ) : (
        <div className="cockpit-table">
          {renderTableHead()}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '12px' }}>
            {detectedBrowsers.map(browserName => {
              const currentBrowserItems = browserItems.filter(item => getBrowserName(item.id) === browserName);
              if (currentBrowserItems.length === 0) return null;
              
              return (
                <div key={browserName} className="table-group-section">
                  <div className="table-group-title">{browserName}</div>
                  {currentBrowserItems.map(renderItemRow)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
