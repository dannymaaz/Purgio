# Purgio

![Build Status](https://img.shields.io/github/actions/workflow/status/dannymaaz/Purgio/release.yml?branch=main&style=flat-square)
![Latest Release](https://img.shields.io/github/v/release/dannymaaz/Purgio?style=flat-square&color=00BC99)
![License](https://img.shields.io/github/license/dannymaaz/Purgio?style=flat-square&color=03738C)
![Supported Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-012E40?style=flat-square)

Purgio es una **aplicación desktop multiplataforma**, segura, minimalista y de muy bajo consumo de recursos, diseñada para la limpieza, optimización y gestión del sistema. Permite analizar el almacenamiento para liberar espacio en disco de manera segura y transparente, y administrar los programas de inicio y procesos activos de fondo.

Desarrollada bajo estándares de ingeniería de software premium, Purgio reutiliza el motor Webview nativo de tu sistema para consumir menos de 100 MB de memoria RAM, ofreciendo una experiencia visual moderna, fluida y con control absoluto sobre tus datos.

---

## Características Principales

- **Limpieza de Sistema Segura**: Detección inteligente de archivos temporales del usuario y logs antiguos sin comprometer archivos críticos del sistema operativo o tus datos personales.
- **Gestor de Navegadores Avanzado**: Escanea y limpia selectivamente cachés, historiales y cookies de tus navegadores (Chrome, Edge, Firefox, Brave, Opera, Safari, Chromium).
- **Protección Activa de Datos Sensibles**: Las sesiones abiertas, tokens de inicio de sesión y contraseñas guardadas en los navegadores se marcan como sensibles y **no se seleccionan por defecto**, previniendo cierres inesperados de cuentas.
- **Optimización del Arranque**: Analiza y te sugiere desactivar de forma segura los programas que ralentizan el encendido de tu computadora (como launchers secundarios, utilidades RGB o asistentes automáticos), excluyendo siempre controladores y antivirus del sistema.
- **Controlador de Procesos Activos**: Monitorea el consumo en tiempo real de los procesos en segundo plano de manera transparente, permitiendo cerrar aquellos que consuman demasiada memoria RAM de manera segura.
- **Estética Visual Premium**: Interfaz minimalista con soporte completo para modo claro, oscuro y detección automática del tema del sistema operativo.

---

## Capturas de Pantalla

*(Próximamente)*
<!-- 
Colocar capturas aquí:
![Dashboard de Purgio](docs/screenshots/dashboard.png)
![Limpieza de Archivos](docs/screenshots/cleaner.png)
-->

---

## Descarga de Ejecutables

Puedes descargar los instaladores nativos listos para producción desde la sección de [GitHub Releases](https://github.com/dannymaaz/Purgio/releases):

- **Windows**: `.exe` / `.msi` (Soporte para Windows 10 y 11)
- **macOS**: `.dmg` / `.app` (Compatible con arquitecturas Intel y Apple Silicon)
- **Linux**: `.AppImage` / `.deb` (Probado en Ubuntu, Debian, Fedora, Arch)

---

## Arquitectura del Proyecto

El andamiaje de la aplicación está modularizado para garantizar mantenibilidad, escalabilidad y aislamiento por plataforma:

```text
purgio/
├─ src/                  # Frontend en React + TypeScript
│  ├─ components/        # Componentes UI reutilizables (TitleBar, SideBar, etc.)
│  ├─ pages/             # Vistas de la aplicación (Dashboard, Cleaner, etc.)
│  ├─ styles/            # Hoja de estilos global y variables de tema
│  └─ assets/            # Logos e iconos SVG de marca
├─ src-tauri/            # Backend nativo en Rust
│  ├─ src/
│  │  ├─ main.rs         # Punto de entrada binario
│  │  ├─ lib.rs          # Inicializador y manejador de comandos Tauri
│  │  ├─ safety.rs       # Filtro y lista negra de directorios críticos
│  │  ├─ scanner.rs      # Motores de búsqueda progresiva y cálculo de tamaños
│  │  ├─ cleaner.rs      # Borrado recursivo seguro del sistema de archivos
│  │  ├─ startup.rs      # Registro y APIs de arranque por plataforma
│  │  └─ system.rs       # Métodos de lectura de estadísticas y procesos (sysinfo)
│  └─ tauri.conf.json    # Configuración nativa del empaquetado Tauri
├─ .github/              # Workflows de CI/CD para compilación multiplataforma
└─ README.md
```

---

## Instalación y Compilación Manual

### Requisitos Previos

Asegúrate de tener instalado en tu sistema:
1. **Node.js** (v18 o superior) y npm.
2. **Rust** y cargo (Instalador a través de [rustup](https://rustup.rs/)).
3. Herramientas de compilación de C++ de tu plataforma (ej. Visual Studio Build Tools en Windows, Xcode Command Line Tools en macOS, o `build-essential` en Linux).

### Instrucciones paso a paso

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/dannymaaz/Purgio.git
   cd Purgio
   ```

2. **Instalar dependencias del frontend**:
   ```bash
   npm install
   ```

3. **Ejecutar en modo desarrollo**:
   Este comando compilará el backend en caliente y levantará el servidor de desarrollo de Vite. La ventana de Purgio se abrirá automáticamente.
   ```bash
   npm run tauri dev
   ```

4. **Compilar para producción (Crear instaladores locales)**:
   Este comando generará el binario optimizado y empaquetará los instaladores nativos en la carpeta `src-tauri/target/release/bundle/`.
   ```bash
   npm run tauri build
   ```

---

## Seguridad y Transparencia

Purgio se rige bajo principios estrictos de seguridad de la información:
- **Sin permisos elevados innecesarios**: Purgio corre a nivel de usuario sin requerir administrador o root por defecto, garantizando que no pueda dañar el sistema operativo.
- **Protección de rutas críticas**: El backend de Rust cuenta con una lista negra de directorios esenciales (como `System32`, `/System`, `/usr/bin`, etc.). Cualquier intento de escaneo o eliminación en estas rutas es bloqueado y reportado inmediatamente.
- **Explicación clara**: Cada elemento escaneado cuenta con detalles sobre qué es, por qué ocupa espacio, qué pasará si se elimina y el nivel de riesgo sugerido.

---

## Tecnologías Utilizadas

- **Backend**: Rust, Tauri v2, `sysinfo`, `winreg` (en Windows).
- **Frontend**: React v19, TypeScript, Vite, CSS moderno.
- **CI/CD**: GitHub Actions con automatización multiplataforma.

---

## Contribuciones

Si deseas colaborar en el desarrollo de Purgio, por favor lee las pautas en [CONTRIBUTING.md](CONTRIBUTING.md) y sigue el [Código de Conducta](CODE_OF_CONDUCT.md).

---

## Licencia

Este proyecto está bajo la Licencia MIT. Para obtener más detalles, consulte el archivo [LICENSE](LICENSE).

---

## Créditos y Ubicación

Creado con dedicación por **Danny Maaz** desde **Guatemala** 🇬🇹. Optimizado para ofrecer un limpiador de sistema operativo open source transparente y de alto rendimiento.
