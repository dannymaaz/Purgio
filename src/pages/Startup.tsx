import React from 'react';


export interface StartupItem {
  id: string;
  name: string;
  publisher: string;
  os: string;
  estimated_impact: string; // High, Medium, Low, None
  status: string; // Enabled, Disabled
  recommendation: string;
  is_safe_to_disable: boolean;
  location_key: string;
}

interface StartupProps {
  items: StartupItem[];
  handleDisable: (item: StartupItem) => void;
  handleEnable: (item: StartupItem) => void;
  isActioning: boolean;
}

export const Startup: React.FC<StartupProps> = ({
  items,
  handleDisable,
  handleEnable,
  isActioning
}) => {

  const getImpactClass = (impact: string): string => {
    switch (impact.toLowerCase()) {
      case 'high': return 'impact-high';
      case 'medium': return 'impact-medium';
      case 'low': return 'impact-low';
      default: return '';
    }
  };

  const getImpactTranslation = (impact: string): string => {
    switch (impact.toLowerCase()) {
      case 'high': return 'Alto Impacto';
      case 'medium': return 'Impacto Medio';
      case 'low': return 'Bajo Impacto';
      default: return 'Sin Impacto';
    }
  };

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Programas de Arranque</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Desactivar aplicaciones que inician automáticamente puede reducir significativamente el tiempo de encendido del equipo.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando programas de arranque...</p>
        </div>
      ) : (
        <div className="startup-list">
          {items.map((item) => {
            const isEnabled = item.status === 'Enabled';
            
            return (
              <div key={item.id} className="startup-card" style={!item.is_safe_to_disable ? { borderLeft: '3px solid var(--warning)' } : {}}>
                <div className="startup-card-header">
                  <div className="startup-app-info">
                    <span className="startup-app-name" title={item.name}>{item.name}</span>
                    <span className="startup-app-publisher" title={`${item.publisher} • ${item.os}`}>{item.publisher} • {item.os}</span>
                  </div>
                  <span className={`impact-badge ${getImpactClass(item.estimated_impact)}`}>
                    {getImpactTranslation(item.estimated_impact)}
                  </span>
                </div>

                <div className="startup-app-desc">
                  {item.recommendation}
                </div>

                <div className="startup-card-actions">
                  <div>
                    <span className="badge" style={{ 
                      backgroundColor: isEnabled ? 'rgba(0, 188, 153, 0.1)' : 'var(--border-color)', 
                      color: isEnabled ? 'var(--accent-aqua)' : 'var(--text-muted)' 
                    }}>
                      {isEnabled ? 'Activo al inicio' : 'Desactivado'}
                    </span>
                  </div>
                  
                  <label className="switch-premium">
                    <input 
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => isEnabled ? handleDisable(item) : handleEnable(item)}
                      disabled={isActioning}
                      aria-label={`Activar o desactivar inicio de ${item.name}`}
                    />
                    <span className="slider-premium"></span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
