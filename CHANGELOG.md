# Historial de Cambios (Changelog) - Purgio

Todos los cambios notables en este proyecto serán documentados en este archivo de acuerdo con las pautas de [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [1.0.0] - 2026-06-12

### Añadido
- **Estructura Inicial**: Inicialización del andamiaje Tauri v2 con React + TypeScript + Vite.
- **Backend Rust**: 
  - Módulo `safety` con validación estricta de rutas del sistema operativo y lista negra.
  - Módulo `scanner` para búsqueda segura y progresiva de archivos temporales del sistema y datos de perfiles de navegadores.
  - Módulo `cleaner` para remoción recursiva y segura de archivos de caché sin borrar directorios raíz.
  - Módulo `startup` para lectura e inicio controlado del arranque del sistema (Windows Registry, plist y desktop files).
  - Módulo `system` para recopilación de estadísticas globales (CPU, RAM, disco) y listado de procesos en ejecución.
- **Frontend React**:
  - Estructuración de la barra de título (`TitleBar`) personalizada y arrastrable.
  - Barra lateral de navegación (`SideBar`) premium con logos adaptados por tema.
  - Selector de temas claro, oscuro e inteligente del sistema.
  - Resumen visual con gráficas simplificadas en el Dashboard.
  - Alertas visuales destacadas para elementos de navegación sensibles.
- **Calidad de Repositorio**:
  - Directivas de seguridad (`SECURITY.md`), contribución (`CONTRIBUTING.md`), código de conducta (`CODE_OF_CONDUCT.md`) y licencias.
  - Configuración inicial de GitHub Actions para compilación multiplataforma.
