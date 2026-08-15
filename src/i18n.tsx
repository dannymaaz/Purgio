import React, { createContext, useContext, useMemo } from 'react';
import type { LanguagePreference, UiLanguage } from './i18n-core';

export type { LanguagePreference, UiLanguage } from './i18n-core';
export { resolveLanguage } from './i18n-core';

type Values = Record<string, string | number>;

const EN_MESSAGES = {
  // Common
  'Sistema': 'System',
  'Español': 'Spanish',
  'English': 'English',
  'Seguro': 'Safe',
  'Revisión': 'Review',
  'Sensible': 'Sensitive',
  'Precaución': 'Caution',
  'Cancelar': 'Cancel',
  'Desactivar': 'Disable',
  'Activar': 'Enable',
  'Finalizar': 'End',
  'Cerrar': 'Close',
  'Minimizar': 'Minimize',
  'Maximizar': 'Maximize',
  'Ver detalles': 'View details',
  'Tamaño': 'Size',
  'Riesgo': 'Risk',
  'Acción': 'Action',
  'Acciones': 'Actions',
  'Seguridad': 'Safety',
  'Recomendación:': 'Recommendation:',
  'Impacto al eliminar:': 'Impact when removed:',
  'Qué es:': 'What is it:',
  'Sin ruta especificada': 'No path specified',
  'Desconocido': 'Unknown',
  'Seguro de eliminar.': 'Safe to remove.',
  'Seguro de vaciar.': 'Safe to empty.',
  'Requiere confirmación explícita del usuario.': 'Requires explicit user confirmation.',

  // Sidebar
  'Panel Principal': 'Dashboard',
  'Limpieza del Sistema': 'System Cleanup',
  'Navegadores': 'Browsers',
  'Arranque': 'Startup',
  'Procesos': 'Processes',
  'Configuración': 'Settings',
  'Creado por Danny Maaz': 'Created by Danny Maaz',

  // Splash/title bar
  'Seguro • Minimalista • Ligero': 'Safe • Minimal • Lightweight',
  'Conectando...': 'Connecting...',
  'Crítico': 'Critical',
  'Atención': 'Attention',
  'Óptimo': 'Optimal',
  'Actualización disponible': 'Update available',

  // Dashboard
  'Escaneando': 'Scanning',
  'Escanear': 'Scan',
  'Purgio nunca elimina datos personales o contraseñas sin tu confirmación.': 'Purgio never removes personal data or passwords without your confirmation.',
  'Sistema Operativo': 'Operating System',
  'Monitoreo de recursos nativos en tiempo real.': 'Real-time native resource monitoring.',
  'Uso de Memoria RAM': 'RAM Usage',
  'Espacio en Disco Principal': 'Main Disk Space',
  'Espacio Recuperable': 'Recoverable Space',
  'Haz clic en Escanear para analizar archivos temporales.': 'Click Scan to analyze temporary files.',
  'Resumen del Análisis': 'Analysis Summary',
  'Archivos Seguros': 'Safe Files',
  'Requieren Revisión': 'Need Review',
  'Apps de Arranque': 'Startup Apps',
  'Procesos de Fondo': 'Background Processes',

  // Cleaner
  'Limpieza del Sistema Operativo': 'Operating System Cleanup',
  'Analiza y elimina archivos innecesarios de forma segura y transparente.': 'Analyze and remove unnecessary files safely and transparently.',
  'Deseleccionar todo': 'Deselect all',
  'Seleccionar todo': 'Select all',
  'Elemento': 'Item',
  'Limpiando...': 'Cleaning...',
  'Iniciar Análisis Completo': 'Start Full Scan',
  'No se encontraron elementos que se puedan limpiar.': 'No cleanable items were found.',
  'Buscando archivos temporales, cachés, logs y otros elementos seguros...': 'Looking for temporary files, caches, logs, and other safe items...',

  // Browsers
  'Limpieza de Navegadores': 'Browser Cleanup',
  'Listado estructurado de cachés de navegadores. Los datos de sesión sensibles no están marcados por defecto.': 'Structured list of browser caches. Sensitive session data is not selected by default.',
  'Componente de Navegador': 'Browser Component',
  'Seleccionar todos los navegadores': 'Select all browser items',
  'Buscando bases de datos, historiales y archivos temporales de navegadores instalados...': 'Searching databases, histories, and temporary files from installed browsers...',
  'Purgio necesita escanear los perfiles de tus navegadores para identificar elementos que se pueden limpiar.': 'Purgio needs to scan your browser profiles to identify cleanable items.',
  'Análisis completado o no se detectaron navegadores instalados compatibles.': 'Analysis completed or no compatible installed browsers were detected.',
  'Eliminar este elemento cerrará tus sesiones activas o requerirá volver a introducir contraseñas.': 'Removing this item will sign you out of active sessions or require you to enter passwords again.',
  'Navegador': 'Browser',

  // Startup
  'Aplicaciones de Arranque': 'Startup Applications',
  'Programas que inician automáticamente al encender tu PC': 'Programs that start automatically when your PC turns on',
  'Total:': 'Total:',
  'Habilitadas:': 'Enabled:',
  'Todas': 'All',
  'Habilitadas': 'Enabled',
  'Seguras de Desactivar': 'Safe to Disable',
  'No se encontraron programas de arranque que coincidan con el filtro.': 'No startup programs match the current filter.',
  'Programa y Detalles': 'Program and Details',
  'Impacto al Inicio': 'Startup Impact',
  'Alto Impacto': 'High Impact',
  'Medio Impacto': 'Medium Impact',
  'Bajo Impacto': 'Low Impact',
  'Sin recomendación disponible.': 'No recommendation available.',
  'Comando de ejecución:': 'Execution command:',
  'Es seguro deshabilitar este programa para acelerar el arranque de tu equipo. Podrás abrirlo manualmente cuando lo necesites.': 'It is safe to disable this program to speed up startup. You can open it manually when needed.',
  'Este programa puede ser crítico para el funcionamiento de hardware o servicios del sistema. Desactívalo solo si sabes qué hace.': 'This program may be critical for hardware or system services. Disable it only if you know what it does.',
  'Falta el comando original para reactivar': 'The original command is missing and the item cannot be re-enabled',

  // Background
  'Procesos en Segundo Plano': 'Background Processes',
  'Aplicaciones consumiendo recursos mientras no las usas.': 'Applications consuming resources while you are not using them.',
  '* Los navegadores modernos (Chrome, Edge, Brave) usan múltiples procesos por pestaña por seguridad y estabilidad.': '* Modern browsers (Chrome, Edge, Brave) use multiple processes per tab for security and stability.',
  'Procesos:': 'Processes:',
  'grupos': 'groups',
  'RAM total:': 'Total RAM:',
  'Todos': 'All',
  'Seguros de cerrar': 'Safe to close',
  'Alto consumo RAM': 'High RAM usage',
  'No se encontraron procesos que coincidan con el filtro actual.': 'No processes match the current filter.',
  'Proceso': 'Process',
  'Consumo RAM': 'RAM Usage',
  'Uso CPU': 'CPU Usage',
  'Proceso en segundo plano.': 'Background process.',
  'Cerrando...': 'Closing...',

  // Settings
  'Ajusta el comportamiento de Purgio, personaliza el aspecto visual y gestiona las directivas de seguridad.': 'Adjust Purgio behavior, customize its appearance, and manage safety policies.',
  'Aspecto Visual': 'Appearance',
  'Tema de la Interfaz': 'Interface Theme',
  'Elige entre modo claro, oscuro o sincronización automática con tu sistema.': 'Choose light, dark, or automatic synchronization with your system.',
  'Tema del Sistema': 'System Theme',
  'Oscuro': 'Dark',
  'Claro': 'Light',
  'Idioma / Language': 'Language',
  'Idioma predeterminado de la aplicación.': 'Default application language.',
  'Idioma del Sistema': 'System Language',
  'Directivas de Confirmación': 'Confirmation Policies',
  'Confirmar antes de Limpiar': 'Confirm Before Cleaning',
  'Muestra una advertencia antes de borrar archivos seleccionados.': 'Show a warning before deleting selected files.',
  'Confirmar Desactivación de Arranque': 'Confirm Startup Disable',
  'Solicita confirmación antes de deshabilitar aplicaciones de inicio.': 'Ask for confirmation before disabling startup applications.',
  'Seguridad y Privacidad': 'Safety and Privacy',
  'Mostrar Elementos Sensibles': 'Show Sensitive Items',
  'Permite escanear y visualizar cookies, tokens e historiales en navegadores.': 'Allow scanning and displaying cookies, tokens, and browser histories.',
  'Ocultar Elementos Críticos': 'Hide Critical Items',
  'Protección activa de sistema. Las carpetas clave del OS no se pueden escanear.': 'Active system protection. Critical OS folders cannot be scanned.',
  'Activado por defecto': 'Enabled by default',
  'Actualizaciones del Sistema': 'System Updates',
  'Buscar Actualizaciones': 'Check for Updates',
  'Verifica si tienes la versión más reciente instalada.': 'Check whether you have the latest version installed.',
  'Buscar ahora': 'Check now',
  'Desarrollado para optimización segura y transparente de sistemas operativos.': 'Built for safe and transparent operating system optimization.',
  'Creado por Danny Maaz • Guatemala': 'Created by Danny Maaz • Guatemala',
  'Seleccionar tema': 'Select theme',
  'Seleccionar idioma': 'Select language',
  'Confirmar antes de limpiar': 'Confirm before cleaning',
  'Confirmar desactivación de arranque': 'Confirm startup disable',
  'Mostrar elementos sensibles': 'Show sensitive items',

  // App / updates / modals / toasts
  'Nueva versión disponible:': 'New version available:',
  'instalada:': 'installed:',
  'Ver actualización': 'View update',
  'Ignorar actualización': 'Dismiss update',
  'Confirmar Eliminación': 'Confirm Deletion',
  'Esta acción es irreversible.': 'This action is irreversible.',
  'Limpiar definitivamente': 'Clean permanently',
  'Desactivar del Arranque': 'Disable from Startup',
  'El programa no se ejecutará al encender el equipo. Podrás abrirlo manualmente y volver a activarlo en cualquier momento.': 'The program will not run when the computer starts. You can open it manually and enable it again at any time.',
  '⚠️ Este programa puede estar relacionado con drivers o seguridad del sistema. Desactivarlo con cuidado.': '⚠️ This program may be related to drivers or system security. Disable it carefully.',
  '🔔 Nueva versión disponible': '🔔 New version available',
  'Ahora no': 'Not now',
  'Instalar actualización': 'Install update',
  'Actualizando…': 'Updating…',
  'Descargando y verificando la actualización…': 'Downloading and verifying the update…',
  'La limpieza se completó, pero no se pudo guardar la entrada en el historial.': 'Cleanup completed, but the history entry could not be saved.',
  'No se pudieron guardar los cambios de configuración.': 'Configuration changes could not be saved.',
  'No se pudo cargar la configuración guardada; se mantienen valores seguros sin sobrescribir el archivo.': 'Saved configuration could not be loaded; safe values are being used without overwriting the file.',

  // Coverage-complete UI phrases
  'Versión': 'Version',
  'Creado por': 'Created by',
  'Limpieza de Archivos': 'File Cleanup',
  'Segundo Plano': 'Background',
  'disponible': 'available',
  'Detectando...': 'Detecting...',
  'Cargando...': 'Loading...',
  'usados de': 'used of',
  'Libres de': 'Free of',
  'totales': 'total',
  'en uso': 'used',
  'elementos seguros listos para limpiar.': 'safe items ready to clean.',
  'Seleccionar': 'Select',
  'Seleccionar todos los elementos': 'Select all items',
  'Componente y Ubicación': 'Component and Location',
  'Nivel de Riesgo': 'Risk Level',
  'Varias ubicaciones': 'Multiple locations',
  'Analizando archivos temporales y cachés del sistema operativo...': 'Analyzing operating-system temporary files and caches...',
  'Listado estructurado de componentes seguros y cachés de sistema analizables para liberación de espacio.': 'Structured list of safe components and system caches that can be analyzed to free space.',
  'Seleccionar Seguros': 'Select Safe',
  'Limpiar': 'Clean',
  'Purgio necesita escanear tu sistema de archivos para detectar componentes residuales seguros que pueden ser removidos para optimizar espacio.': 'Purgio needs to scan your file system to detect safe residual components that can be removed to optimize space.',
  'Análisis completado. Tu sistema se encuentra libre de archivos residuales.': 'Analysis complete. Your system is free of detected residual files.',
  'Elementos Seguros para Eliminar': 'Safe Items to Remove',
  'Elementos que Requieren Revisión': 'Items Requiring Review',
  'más': 'more',
  'instancias activas. Haz clic para ver detalles.': 'active instances. Click to view details.',
  'Finalizar las': 'End all',
  'instancias de': 'instances of',
  'Ve a Configuración para actualizar.': 'Go to Settings to update.',
  'No se pudo instalar la actualización:': 'The update could not be installed:',
  'Error al analizar el sistema. Intenta de nuevo.': 'System analysis failed. Try again.',
  '✓ Limpieza completada. Se liberaron': '✓ Cleanup completed. Freed',
  'de espacio.': 'of space.',
  'Error durante la limpieza:': 'Error during cleanup:',
  'desactivado del arranque.': 'disabled from startup.',
  'No se pudo desactivar': 'Could not disable',
  'activado al inicio.': 'enabled at startup.',
  'No se pudo activar': 'Could not enable',
  'finalizado.': 'ended.',
  'No se pudo cerrar': 'Could not close',
  'Puede requerir permisos elevados.': 'Elevated permissions may be required.',
  'Purgio descargará el paquete correspondiente a este sistema, verificará su firma criptográfica y solo entonces lo instalará y reiniciará la aplicación. ¿Deseas continuar?': 'Purgio will download the package for this system, verify its cryptographic signature, and only then install it and restart the application. Do you want to continue?',
  'Se eliminarán': 'The following will be removed:',
  'elementos': 'items',
  'liberando': 'freeing',
  'de espacio. Esta acción es irreversible.': 'of space. This action cannot be undone.',
  '¿Desactivar el inicio automático de': 'Disable automatic startup for',
  'está disponible. La versión instalada actualmente es': 'is available. The currently installed version is',

  // Interpolated UI messages
  'Se eliminarán {{count}} elementos liberando {{size}} de espacio. Esta acción es irreversible.': 'This will remove {{count}} items and free {{size}} of space. This action cannot be undone.',
  '…y {{count}} más': '…and {{count}} more',
  '¿Desactivar el inicio automático de {{name}}?': 'Disable automatic startup for {{name}}?',
  'Purgio {{latest}} está disponible. La versión instalada actualmente es {{current}}.': 'Purgio {{latest}} is available. The currently installed version is {{current}}.',

  // Backend/common metadata
  'Papelera de Reciclaje': 'Recycle Bin',
  'Papelera de macOS': 'macOS Trash',
  'Papelera de Linux': 'Linux Trash',
  'Carpeta de Descargas': 'Downloads Folder',
  'Caché de NPM (Node.js)': 'NPM Cache (Node.js)',
  'Caché de Pip (Python)': 'Pip Cache (Python)',
  'Caché de NuGet (.NET)': 'NuGet Cache (.NET)',
  'Caché de Usuario Linux': 'Linux User Cache',
  'Journal de systemd': 'systemd Journal',
  'Logs de Xorg': 'Xorg Logs',
  'Caché de Paquetes Snap': 'Snap Package Cache',
  'Caché de Paquetes Flatpak': 'Flatpak Package Cache',
  'Caché de Yarn': 'Yarn Cache',
  'Caché del Simulador de iOS': 'iOS Simulator Cache',
  'Archivos borrados temporalmente.': 'Temporarily deleted files.',
  'Se borrarán permanentemente del sistema.': 'They will be permanently deleted from the system.',
  'Aplicación no reconocida.': 'Unrecognized application.',
  'Proceso de aplicación de usuario.': 'User application process.',
  'Proceso del sistema operativo esencial.': 'Essential operating system process.',
} as const;

export type MessageSource = keyof typeof EN_MESSAGES;

function interpolate(text: string, values?: Values): string {
  if (!values) return text;
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    text,
  );
}

export function translate(language: UiLanguage, source: string, values?: Values): string {
  if (language === 'es') return interpolate(source, values);
  const translated = EN_MESSAGES[source as MessageSource] ?? source;
  return interpolate(translated, values);
}

export function translateBackendText(language: UiLanguage, source: string): string {
  if (language === 'es' || !source) return source;

  const exact = EN_MESSAGES[source as MessageSource];
  if (exact) return exact;

  const dynamicRules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^Caché de (.+)$/, (m) => `${m[1]} Cache`],
    [/^Archivos temporales e imágenes cacheadas de páginas web en (.+)\.$/, (m) => `Temporary files and cached web-page images in ${m[1]}.`],
    [/^Historial de navegación de (.+)$/, (m) => `${m[1]} Browsing History`],
    [/^Cookies y sesiones de (.+)$/, (m) => `${m[1]} Cookies and Sessions`],
    [/^Datos de formularios de (.+)$/, (m) => `${m[1]} Form Data`],
    [/^Caché de (.+) \((.+)\)$/, (m) => `${m[1]} Cache (${m[2]})`],
    [/^Registro \((.+)\)$/, (m) => `Registry (${m[1]})`],
    [/^Usuario \(Desactivado\)$/, () => 'User (Disabled)'],
  ];

  for (const [pattern, format] of dynamicRules) {
    const match = source.match(pattern);
    if (match) return format(match);
  }

  return source;
}

interface I18nValue {
  language: UiLanguage;
  t: (source: string, values?: Values) => string;
  backend: (source: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren<{ language: UiLanguage }>> = ({ language, children }) => {
  const value = useMemo<I18nValue>(() => ({
    language,
    t: (source, values) => translate(language, source, values),
    backend: (source) => translateBackendText(language, source),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
