import React, { useEffect, useState } from 'react';
import purgioLogo from '../assets/logo/purgio-logo.svg';

export const Splash: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    // Mantener la pantalla visible por 2 segundos para dar sensación de carga nativa premium
    const timer = setTimeout(() => {
      setOpacity(0);
      const hideTimer = setTimeout(() => {
        setVisible(false);
      }, 500); // Duración de transición de opacidad
      return () => clearTimeout(hideTimer);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="splash-screen" style={{ opacity, visibility: opacity === 0 ? 'hidden' : 'visible' }}>
      <img src={purgioLogo} alt="Purgio Logo" className="splash-logo" />
      <h1 className="splash-name">Purgio</h1>
      <p className="splash-desc">Seguro • Minimalista • Ligero</p>
      <div className="splash-loader">
        <div className="splash-loader-bar"></div>
      </div>
    </div>
  );
};
