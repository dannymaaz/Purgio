import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import purgioIcon from '../assets/logo/purgio-icon.svg';

const appWindow = getCurrentWindow();

export const TitleBar: React.FC = () => {
  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (e) {
      console.error("Error al minimizar la ventana:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (e) {
      console.error("Error al maximizar la ventana:", e);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error("Error al cerrar la ventana:", e);
    }
  };

  return (
    <header className="titlebar">
      <div className="titlebar-drag-region" data-tauri-drag-region="true">
        <img src={purgioIcon} alt="Purgio Icon" className="titlebar-logo" />
        <span className="titlebar-title" data-tauri-drag-region="true">Purgio</span>
      </div>
      <div className="titlebar-controls">
        <button 
          className="titlebar-btn" 
          onClick={handleMinimize} 
          title="Minimizar"
          aria-label="Minimizar ventana"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="10" height="1" fill="currentColor"/>
          </svg>
        </button>
        <button 
          className="titlebar-btn" 
          onClick={handleMaximize} 
          title="Maximizar"
          aria-label="Maximizar ventana"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none"/>
          </svg>
        </button>
        <button 
          className="titlebar-btn close" 
          onClick={handleClose} 
          title="Cerrar"
          aria-label="Cerrar ventana"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </header>
  );
};
