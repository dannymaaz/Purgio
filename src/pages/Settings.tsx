import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import purgioIcon from '../assets/logo/purgio-icon.svg';
import { LanguagePreference, useI18n } from '../i18n';

interface SettingsProps {
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  lang: LanguagePreference;
  setLang: (lang: LanguagePreference) => void;
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
  setShowSensitive,
  onCheckUpdates,
  latestVersion,
  hasUpdate,
}) => {
  const [appVersion, setAppVersion] = useState<string>('...');
  const { t } = useI18n();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('2.0.1'));
  }, []);

  return (
    <div>
      <div className="cleaner-header">
        <div>
          <h2>{t('Configuración')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            {t('Ajusta el comportamiento de Purgio, personaliza el aspecto visual y gestiona las directivas de seguridad.')}
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">{t('Aspecto Visual')}</h3>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Tema de la Interfaz')}</span>
            <span className="settings-row-desc">{t('Elige entre modo claro, oscuro o sincronización automática con tu sistema.')}</span>
          </div>
          <div>
            <select
              className="select-custom"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
              aria-label={t('Seleccionar tema')}
            >
              <option value="system">{t('Tema del Sistema')}</option>
              <option value="dark">{t('Oscuro')}</option>
              <option value="light">{t('Claro')}</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Idioma / Language')}</span>
            <span className="settings-row-desc">{t('Idioma predeterminado de la aplicación.')}</span>
          </div>
          <div>
            <select
              className="select-custom"
              value={lang}
              onChange={(e) => setLang(e.target.value as LanguagePreference)}
              aria-label={t('Seleccionar idioma')}
            >
              <option value="system">{t('Idioma del Sistema')}</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">{t('Directivas de Confirmación')}</h3>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Confirmar antes de Limpiar')}</span>
            <span className="settings-row-desc">{t('Muestra una advertencia antes de borrar archivos seleccionados.')}</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
                aria-label={t('Confirmar antes de limpiar')}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Confirmar Desactivación de Arranque')}</span>
            <span className="settings-row-desc">{t('Solicita confirmación antes de deshabilitar aplicaciones de inicio.')}</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={confirmDisable}
                onChange={(e) => setConfirmDisable(e.target.checked)}
                aria-label={t('Confirmar desactivación de arranque')}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">{t('Seguridad y Privacidad')}</h3>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Mostrar Elementos Sensibles')}</span>
            <span className="settings-row-desc">{t('Permite escanear y visualizar cookies, tokens e historiales en navegadores.')}</span>
          </div>
          <div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showSensitive}
                onChange={(e) => setShowSensitive(e.target.checked)}
                aria-label={t('Mostrar elementos sensibles')}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Ocultar Elementos Críticos')}</span>
            <span className="settings-row-desc">{t('Protección activa de sistema. Las carpetas clave del OS no se pueden escanear.')}</span>
          </div>
          <div>
            <span className="badge badge-safe" style={{ textTransform: 'none' }}>{t('Activado por defecto')}</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">{t('Actualizaciones del Sistema')}</h3>

        <div className="settings-row">
          <div className="settings-row-left">
            <span className="settings-row-title">{t('Buscar Actualizaciones')}</span>
            <span className="settings-row-desc">
              {hasUpdate
                ? `${t('Nueva versión disponible:')} v${latestVersion}`
                : t('Verifica si tienes la versión más reciente instalada.')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasUpdate && (
              <span className="badge badge-review" style={{ textTransform: 'none' }}>v{latestVersion} {t('disponible')}</span>
            )}
            <button
              className="btn btn-secondary"
              onClick={onCheckUpdates}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {t('Buscar ahora')}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section" style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="about-box">
          <img src={purgioIcon} alt="Purgio Icon" className="about-logo" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 'bold' }}>Purgio</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('Versión')} v{appVersion}</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' }}>
            {t('Desarrollado para optimización segura y transparente de sistemas operativos.')}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--accent-aqua)', marginTop: '8px' }}>
            {t('Creado por Danny Maaz • Guatemala')}
          </p>
        </div>
      </div>
    </div>
  );
};
