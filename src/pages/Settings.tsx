import React from 'react';
import purgioIcon from '../assets/logo/purgio-icon.svg';

interface SettingsProps {
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  lang: 'es' | 'en';
  setLang: (lang: 'es' | 'en') => void;
  confirmDelete: boolean;
  setConfirmDelete: (val: boolean) => void;
  confirmDisable: boolean;
  setConfirmDisable: (val: boolean) => void;
  showSensitive: boolean;
  setShowSensitive: (val: boolean) => void;
  onCheckUpdates?: () => void;
  latestVersion?: string;
  hasUpdate?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  theme,
  setTheme,
  lang,
  setLang,
  confirmDelete,
  setConfirmDelete,
  confirmDisable,
  setConfirmDisable,
  showSensitive,
  setShowSensitive
}) => {
  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>Configuración</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Ajusta el comportamiento de Purgio, personaliza el aspecto visual y gestiona las directivas de seguridad.
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Aspecto Visual</h3>
        
        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Tema de la Interfaz</span>
            <span className="settings-row-desc">Elige entre modo claro, oscuro o sincronización automática con tu sistema.</span>
          </div>
          <div>
            <select 
              className="select-custom" 
              value={theme} 
              onChange={(e) => setTheme(e.target.value as any)}
              aria-label="Seleccionar tema"
            >
              <option value="system">Tema del Sistema</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Idioma / Language</span>
            <span className="settings-row-desc">Idioma predeterminado de la aplicación.</span>
          </div>
          <div>
            <select 
              className="select-custom" 
              value={lang} 
              onChange={(e) => setLang(e.target.value as any)}
              aria-label="Seleccionar idioma"
            >
              <option value="es">Español</option>
              <option value="en">English (US)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Directivas de Confirmación</h3>
        
        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Confirmar antes de Limpiar</span>
            <span className="settings-row-desc">Muestra una advertencia antes de borrar archivos seleccionados.</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={confirmDelete} 
                onChange={(e) => setConfirmDelete(e.target.checked)}
                aria-label="Confirmar antes de limpiar"
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Confirmar Desactivación de Arranque</span>
            <span className="settings-row-desc">Solicita confirmación antes de deshabilitar aplicaciones de inicio.</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={confirmDisable} 
                onChange={(e) => setConfirmDisable(e.target.checked)}
                aria-label="Confirmar desactivación de arranque"
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Seguridad y Privacidad</h3>
        
        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Mostrar Elementos Sensibles</span>
            <span className="settings-row-desc">Permite escanear y visualizar cookies, tokens e historiales en navegadores.</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={showSensitive} 
                onChange={(e) => setShowSensitive(e.target.checked)}
                aria-label="Mostrar elementos sensibles"
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">Ocultar Elementos Críticos</span>
            <span className="settings-row-desc">Protección activa de sistema. Las carpetas clave del OS no se pueden escanear.</span>
          </div>
          <div>
            <span className="badge badge-safe" style={{ textTransform: 'none' }}>Activado por defecto</span>
          </div>
        </div>
      </div>

      <div className="settings-section" style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="about-box">
          <img src={purgioIcon} alt="Purgio Icon" className="about-logo" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 'bold' }}>Purgio</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Versión v2.0.0 (Optimización y Seguridad)</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' }}>
            Desarrollado para optimización segura y transparente de sistemas operativos.
          </p>
          <p style={{ fontSize: '11px', color: 'var(--accent-aqua)', marginTop: '8px' }}>
            Creado por Danny Maaz • Guatemala
          </p>
        </div>
      </div>
    </div>
  );
};
