import React, { useState } from 'react';
import { CleanableItem } from './Cleaner';
import { InfoIcon, TrashIcon, WarningIcon, RefreshIcon } from '../components/Icons';
import { useI18n } from '../i18n';
import { formatBytes } from '../utils/format';

export interface ChromeModelVersion {
  version: string;
  path: string;
  size: number;
}

export interface ChromeOnDeviceModelInfo {
  installed: boolean;
  component_name: string;
  component_id: string;
  root_path: string | null;
  total_size: number;
  versions: ChromeModelVersion[];
  management_url: string;
}

interface BrowsersProps {
  items: CleanableItem[];
  setItems: React.Dispatch<React.SetStateAction<CleanableItem[]>>;
  handleClean: (selectedItems: CleanableItem[]) => void;
  isCleaning: boolean;
  scanStatus?: 'idle' | 'scanning' | 'done';
  handleScan?: () => void;
  chromeOnDeviceModel?: ChromeOnDeviceModelInfo | null;
}

export const Browsers: React.FC<BrowsersProps> = ({
  items,
  setItems,
  handleClean,
  isCleaning,
  scanStatus = 'idle',
  handleScan,
  chromeOnDeviceModel
}) => {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { t, backend, language } = useI18n();

  const toggleSelect = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const toggleExpand = (id: string) => setExpandedItem(prev => prev === id ? null : id);
  const browserItems = items.filter(item => item.category.startsWith('browser_'));

  const getBrowserName = (id: string): string => {
    if (id.startsWith('chrome_')) return 'Google Chrome';
    if (id.startsWith('edge_')) return 'Microsoft Edge';
    if (id.startsWith('firefox_')) return 'Mozilla Firefox';
    if (id.startsWith('brave_')) return 'Brave Browser';
    if (id.startsWith('opera_')) return 'Opera';
    if (id.startsWith('safari_')) return 'Safari';
    if (id.startsWith('chromium_')) return 'Chromium';
    return t('Navegador');
  };

  const detectedBrowsers = Array.from(new Set(browserItems.map(item => getBrowserName(item.id))));
  const selectedSize = browserItems.filter(item => item.selected).reduce((sum, item) => sum + item.size, 0);

  const onCleanClick = () => {
    const selected = browserItems.filter(item => item.selected);
    if (selected.length > 0) handleClean(selected);
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
          aria-label={t('Seleccionar todos los navegadores')}
        />
      </div>
      <div className="col-name">{t('Componente de Navegador')}</div>
      <div className="col-risk">{t('Riesgo')}</div>
      <div className="col-size">{t('Tamaño')}</div>
      <div className="col-actions"></div>
    </div>
  );

  const renderItemRow = (item: CleanableItem) => {
    const isExpanded = expandedItem === item.id;
    const isSensitive = item.risk_level === 'Sensitive';
    const isReview = item.risk_level === 'Review';
    const isSafe = item.risk_level === 'Safe';
    const localizedName = backend(item.name);

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
              aria-label={`${t('Seleccionar')} ${localizedName}`}
            />
          </div>
          <div className="col-name" onClick={() => toggleExpand(item.id)} style={{ cursor: 'pointer' }}>
            <span className={`cleaner-item-name ${isSensitive ? 'sensitive-text' : ''}`}>{localizedName}</span>
            <span className="cleaner-item-path" title={item.paths.join('\n')}>
              {item.paths.length > 0
                ? item.paths[0].length > 55 ? '...' + item.paths[0].slice(-52) : item.paths[0]
                : t('Sin ruta especificada')}
              {item.paths.length > 1 && (
                <span style={{ color: 'var(--accent-aqua)', marginLeft: '4px', fontSize: '10px' }}>
                  +{item.paths.length - 1} {t('más')}
                </span>
              )}
            </span>
          </div>
          <div className="col-risk">
            <span className={`badge ${isSafe ? 'badge-safe' : isReview ? 'badge-review' : 'badge-sensitive'}`}>
              {t(isSafe ? 'Seguro' : isReview ? 'Revisión' : 'Sensible')}
            </span>
          </div>
          <div className="col-size"><span className="cleaner-item-size">{formatBytes(item.size, language)}</span></div>
          <div className="col-actions">
            <button className={`cleaner-details-btn ${isExpanded ? 'active' : ''}`} onClick={() => toggleExpand(item.id)} title={t('Ver detalles')}>
              <InfoIcon size={14} />
            </button>
          </div>
        </div>

        {isSensitive && (
          <div className="browser-session-warning">
            <WarningIcon size={14} />
            <span>{t('Eliminar este elemento cerrará tus sesiones activas o requerirá volver a introducir contraseñas.')}</span>
          </div>
        )}

        {isExpanded && (
          <div className="table-details-panel">
            <div className="details-content">
              <div className="details-text-group"><span className="details-label">{t('Qué es:')}</span><p>{backend(item.description)}</p></div>
              <div className="details-text-group" style={{ marginTop: '8px' }}><span className="details-label">{t('Impacto al eliminar:')}</span><p>{backend(item.impact)}</p></div>
              <div className="details-meta-grid">
                <div>
                  <span className="details-label">{t('Recomendación:')}</span>
                  <span className={`details-rec-value ${isSafe ? 'safe' : isReview ? 'warning' : 'danger'}`}>{backend(item.recommended_action)}</span>
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
      <div className="loading-bar-wrapper"><div className="loading-bar-infinite"></div></div>
      <div className="skeleton-table">
        {[1, 2, 3].map(idx => (
          <div key={idx} className="skeleton-row">
            <div className="skeleton-cell col-checkbox"><div className="skeleton-box pulse"></div></div>
            <div className="skeleton-cell col-name"><div className="skeleton-line title pulse" style={{ width: '45%' }}></div><div className="skeleton-line path pulse" style={{ width: '60%' }}></div></div>
            <div className="skeleton-cell col-risk"><div className="skeleton-box badge-pulse pulse"></div></div>
            <div className="skeleton-cell col-size"><div className="skeleton-line size pulse" style={{ width: '40%' }}></div></div>
            <div className="skeleton-cell col-actions"><div className="skeleton-box btn-pulse pulse"></div></div>
          </div>
        ))}
      </div>
      <div className="loading-status-text">{t('Buscando bases de datos, historiales y archivos temporales de navegadores instalados...')}</div>
    </div>
  );

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>{t('Limpieza de Navegadores')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            {t('Listado estructurado de cachés de navegadores. Los datos de sesión sensibles no están marcados por defecto.')}
          </p>
        </div>

        {scanStatus === 'done' && browserItems.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={() => setItems(prev => prev.map(i => i.category.startsWith('browser_') ? { ...i, selected: false } : i))} disabled={isCleaning}>
              {t('Deseleccionar todo')}
            </button>
            <button className="btn btn-primary" onClick={onCleanClick} disabled={isCleaning || selectedSize === 0}>
              <TrashIcon size={16} />
              {isCleaning ? t('Limpiando...') : `${t('Limpiar')} ${formatBytes(selectedSize, language)}`}
            </button>
          </div>
        )}
      </div>

      {chromeOnDeviceModel && (
        <div className="card" style={{ marginBottom: '18px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>{t('Modelo IA local de Chrome')}</h3>
                <span className={`badge ${chromeOnDeviceModel.installed ? 'badge-review' : 'badge-safe'}`}>
                  {t(chromeOnDeviceModel.installed ? 'Detectado' : 'No detectado')}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '6px 0 0', lineHeight: 1.5 }}>
                {t('Componente administrado por Google Chrome para funciones de IA integradas en el dispositivo.')}
              </p>
            </div>
            {chromeOnDeviceModel.installed && (
              <strong style={{ fontSize: '15px', whiteSpace: 'nowrap' }}>{formatBytes(chromeOnDeviceModel.total_size, language)}</strong>
            )}
          </div>

          {chromeOnDeviceModel.installed ? (
            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('ID del componente')}</span>
                <code style={{ overflowWrap: 'anywhere' }}>{chromeOnDeviceModel.component_id}</code>
                <span style={{ color: 'var(--text-muted)' }}>{t('Versiones verificadas')}</span>
                <span>{chromeOnDeviceModel.versions.map(version => version.version).join(', ')}</span>
                {chromeOnDeviceModel.root_path && (<>
                  <span style={{ color: 'var(--text-muted)' }}>{t('Ruta detectada')}</span>
                  <code style={{ overflowWrap: 'anywhere' }}>{chromeOnDeviceModel.root_path}</code>
                </>)}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55 }}>
                  {t('Purgio no elimina esta carpeta manualmente porque Chrome administra su ciclo de vida mediante Component Updater.')}
                </p>
                <p style={{ margin: '7px 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {t('Para desinstalar el modelo de forma segura, abre esta dirección en Google Chrome y usa el botón Uninstall:')}
                  {' '}<code>{chromeOnDeviceModel.management_url}</code>
                </p>
                <p style={{ margin: '7px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {t('Chrome puede volver a descargar el modelo más adelante si una función de IA integrada lo necesita y el equipo vuelve a ser elegible.')}
                </p>
              </div>
            </div>
          ) : (
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('No se detectó una instalación verificable del modelo local administrado por Chrome.')}
            </p>
          )}
        </div>
      )}

      {scanStatus === 'scanning' ? renderSkeletons() : scanStatus === 'idle' ? (
        <div className="card" style={{ textAlign: 'center', padding: '54px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '460px', lineHeight: '1.5' }}>
            {t('Purgio necesita escanear los perfiles de tus navegadores para identificar elementos que se pueden limpiar.')}
          </p>
          {handleScan && <button className="btn btn-primary" onClick={handleScan}><RefreshIcon size={14} />{t('Iniciar Análisis Completo')}</button>}
        </div>
      ) : browserItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}><p style={{ color: 'var(--text-muted)' }}>{t('Análisis completado o no se detectaron navegadores instalados compatibles.')}</p></div>
      ) : (
        <div className="cockpit-table">
          {renderTableHead()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '12px' }}>
            {detectedBrowsers.map(browserName => {
              const currentBrowserItems = browserItems.filter(item => getBrowserName(item.id) === browserName);
              if (currentBrowserItems.length === 0) return null;
              return <div key={browserName} className="table-group-section"><div className="table-group-title">{browserName}</div>{currentBrowserItems.map(renderItemRow)}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};
