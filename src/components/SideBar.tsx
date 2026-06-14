import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import purgioLogo from '../assets/logo/purgio-logo.svg';
import purgioLogoLight from '../assets/logo/purgio-logo-light.svg';
import { 
  DashboardIcon, 
  CleanerIcon, 
  BrowsersIcon, 
  StartupIcon, 
  BackgroundIcon, 
  SettingsIcon 
} from './Icons';

interface SideBarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  theme: 'dark' | 'light';
}

export const SideBar: React.FC<SideBarProps> = ({ currentTab, setCurrentTab, theme }) => {
  const [appVersion, setAppVersion] = useState<string>('...');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('2.0.0'));
  }, []);

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'cleaner', name: 'Limpieza de Archivos', icon: <CleanerIcon /> },
    { id: 'browsers', name: 'Navegadores', icon: <BrowsersIcon /> },
    { id: 'startup', name: 'Arranque', icon: <StartupIcon /> },
    { id: 'background', name: 'Segundo Plano', icon: <BackgroundIcon /> },
    { id: 'settings', name: 'Configuración', icon: <SettingsIcon /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-menu-wrapper">
        <div className="sidebar-header">
          <img 
            src={theme === 'dark' ? purgioLogo : purgioLogoLight} 
            alt="Purgio Logo" 
            className="sidebar-logo" 
          />
        </div>
        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${currentTab === item.id ? 'active' : ''}`}
              onClick={() => setCurrentTab(item.id)}
            >
              {item.icon}
              {item.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        {/* Versión leída dinámicamente desde Tauri — se actualiza automáticamente con cada build */}
        <span>Versión v{appVersion}</span>
        <span>
          Creado por <span className="sidebar-footer-author">Danny Maaz</span>
        </span>
        <span>Guatemala</span>
      </div>
    </aside>
  );
};
