use serde::{Serialize, Deserialize};
use sysinfo::{System, Disks, ProcessRefreshKind, RefreshKind, CpuRefreshKind, MemoryRefreshKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessItem {
    pub pid: u32,
    pub name: String,
    pub memory_usage: u64, // En bytes (NOTA: el frontend lo llama memory_usage, no ram_usage)
    pub cpu_usage: f32, // En porcentaje (0-100)
    pub description: String,
    pub warning: Option<String>,
    pub is_safe_to_kill: bool, // el frontend espera is_safe_to_kill
    pub exe_path: Option<String>,
    pub process_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub total_ram: u64, // En bytes
    pub used_ram: u64,  // En bytes
    pub cpu_usage: f32, // En porcentaje
    pub total_disk: u64, // En bytes
    pub free_disk: u64,  // En bytes
    pub os_name: String,
    pub os_version: Option<String>,
    pub cpu_count: Option<u32>,
    pub cpu_name: Option<String>,
}

/// Obtiene metadatos para procesos en segundo plano comunes
fn get_process_metadata(name: &str) -> (String, Option<String>, bool) {
    let name_lower = name.to_lowercase();
    
    // Apps seguras de cerrar en segundo plano
    let safe_processes = [
        ("spotify", "Proceso auxiliar de Spotify para la interfaz y reproducción.", "Spotify se cerrará por completo.", true),
        ("discord", "Cliente de chat de Discord en segundo plano.", "Se cerrará Discord y no recibirás notificaciones hasta reabrirlo.", true),
        ("steam", "Cliente de Steam para la descarga e inicio de juegos.", "Se detendrán las descargas de juegos en segundo plano.", true),
        ("chrome", "Proceso o pestaña del navegador Google Chrome.", "Si cierras este proceso, se podría cerrar una pestaña activa.", true),
        ("edge", "Proceso en segundo plano del navegador Microsoft Edge.", "Se cerrará el proceso auxiliar de Edge.", true),
        ("brave", "Proceso en segundo plano de Brave Browser.", "Se detendrá el motor del navegador Brave.", true),
        ("epicgames", "Servicios de Epic Games Store en segundo plano.", "Epic Games Launcher se cerrará.", true),
        ("slack", "Cliente de comunicación de equipos Slack.", "Se detendrán las notificaciones de Slack.", true),
        ("teams", "Cliente de videollamadas y chat de Microsoft Teams.", "Se cerrará Teams reduciendo consumo de RAM.", true),
        ("zoom", "Proceso de soporte de la app de videollamadas Zoom.", "Se detendrá el servicio latente de Zoom.", true),
        ("onedrive", "Asistente de sincronización de Microsoft OneDrive.", "Se pausará la sincronización en la nube.", true),
        ("dropbox", "Cliente de sincronización de Dropbox.", "Se pausará la sincronización local de archivos.", true),
        ("adobegard", "Guardia de Adobe Creative Cloud.", "Adobe Creative Cloud dejará de sincronizar tipografías y updates.", true),
        ("nvidia", "Proceso de NVIDIA. Consume RAM pero es para el GPU.", "Puede afectar rendimiento gráfico.", true),
        ("amd", "Proceso de AMD relacionado con el GPU.", "Puede afectar el rendimiento gráfico.", true),
        ("obs", "OBS Studio - Grabación/Streaming de pantalla.", "OBS se cerrará.", true),
        ("vlc", "VLC Media Player - Reproductor multimedia.", "VLC se cerrará.", true),
        ("telegram", "Cliente de mensajería Telegram.", "No recibirás notificaciones de Telegram.", true),
        ("whatsapp", "WhatsApp Desktop.", "No recibirás mensajes hasta reabrirlo.", true),
        ("firefox", "Proceso o pestaña del navegador Firefox.", "Podría cerrar una pestaña activa.", true),
        ("opera", "Proceso del navegador Opera.", "Se cerrará Opera.", true),
        ("skype", "Proceso de Skype.", "Skype se cerrará.", true),
        ("figma", "Figma Desktop - Herramienta de diseño UI.", "Figma se cerrará.", true),
        ("notion", "Notion Desktop.", "Notion se cerrará.", true),
        ("cursor", "Cursor IDE - Editor de código con IA.", "Cursor se cerrará.", true),
        ("code", "Visual Studio Code.", "VSCode se cerrará.", true),
        ("rider", "JetBrains Rider.", "El IDE se cerrará.", true),
        ("intellij", "IntelliJ IDEA.", "El IDE se cerrará.", true),
        ("webstorm", "WebStorm IDE.", "El IDE se cerrará.", true),
        ("itunes", "iTunes Media Player.", "iTunes se cerrará.", true),
        ("outlook", "Microsoft Outlook.", "El correo se cerrará.", true),
        ("word", "Microsoft Word.", "Word se cerrará, guarda tu trabajo.", true),
        ("excel", "Microsoft Excel.", "Excel se cerrará, guarda tu trabajo.", true),
        ("powerpoint", "Microsoft PowerPoint.", "PowerPoint se cerrará.", true),
        ("postgres", "PostgreSQL - Base de datos relacional. Probablemente instalada como dependencia de otra app.", "El servicio de base de datos se detendrá. Apps que lo usen dejarán de funcionar hasta reiniciarlo.", true),
        ("mysqld", "MySQL/MariaDB - Servidor de base de datos.", "El servicio MySQL se detendrá. Puede afectar apps que dependan de él.", true),
        ("mongod", "MongoDB - Base de datos NoSQL en segundo plano.", "MongoDB se detendrá. Las apps que lo usen perderán la conexión.", true),
        ("redis", "Redis - Servidor de caché en memoria.", "Redis se detendrá. Apps que lo usen pueden fallar.", true),
        ("sqlservr", "Microsoft SQL Server en segundo plano.", "SQL Server se detendrá. Puede afectar apps empresariales.", true),
    ];

    // Procesos críticos del sistema que NUNCA se deben cerrar
    let critical_processes = [
        "explorer", "taskmgr", "lsass", "services", "wininit", "csrss", "smss", "svchost",
        "system", "spoolsv", "alg", "winlogon", "ctfmon", "securityhealthservice",
        "systemd", "dbus", "init", "bash", "sh", "zsh", "fish", "powershell", "cmd",
        "conhost", "dwm", "fontd", "launchd", "kernel", "cron", "syslogd", "udevd"
    ];

    // Comprobar si es crítico
    for key in critical_processes.iter() {
        if name_lower == *key || name_lower.starts_with(&(key.to_string() + ".")) {
            return (
                "Proceso del sistema operativo esencial.".to_string(),
                Some("NO CERRAR: El cierre de este proceso puede causar inestabilidad en el sistema operativo o pantalla azul.".to_string()),
                false
            );
        }
    }

    // Comprobar si está en los seguros
    for (key, desc, warning, _is_safe) in safe_processes.iter() {
        if name_lower.contains(key) {
            return (desc.to_string(), Some(warning.to_string()), true);
        }
    }

    // Por defecto para procesos desconocidos de usuario (generalmente seguros de cerrar si son del espacio de usuario)
    (
        "Proceso de aplicación de usuario.".to_string(),
        Some("El programa correspondiente se cerrará y podría perder datos no guardados.".to_string()),
        true
    )
}

/// Obtiene los procesos en segundo plano que son no-críticos y consumen memoria
pub fn get_background_apps() -> Vec<ProcessItem> {
    // Usar refresh_specifics para pedir SOLO procesos + memoria — más eficiente que new_all
    let refresh_kind = RefreshKind::new()
        .with_processes(ProcessRefreshKind::new().with_memory().with_cpu().with_exe(sysinfo::UpdateKind::Always));
    let mut sys = System::new_with_specifics(refresh_kind);
    sys.refresh_all();

    let mut items = Vec::new();

    for (pid, process) in sys.processes() {
        let name = process.name().to_string();

        // Evitar procesar Purgio a sí mismo
        if name.to_lowercase().contains("purgio") || name.to_lowercase().contains("tauri") {
            continue;
        }

        let ram = process.memory();
        let cpu = process.cpu_usage();

        // Solo mostrar procesos que consuman > 8 MB
        if ram > 8 * 1024 * 1024 {
            let (desc, warning, safe) = get_process_metadata(&name);

            if safe {
                let exe_path = process.exe().map(|p| p.to_string_lossy().into_owned());

                items.push(ProcessItem {
                    pid: pid.as_u32(),
                    name,
                    memory_usage: ram,
                    cpu_usage: cpu,
                    description: desc,
                    warning,
                    is_safe_to_kill: safe,
                    exe_path,
                    process_type: "app".to_string(),
                });
            }
        }
    }

    // Ordenar de mayor a menor consumo de RAM
    items.sort_by(|a, b| b.memory_usage.cmp(&a.memory_usage));

    items
}

/// Cierra un proceso por su PID
pub fn kill_process(pid: u32) -> Result<(), String> {
    // Solo refrescar lo mínimo para encontrar el proceso
    let refresh_kind = RefreshKind::new()
        .with_processes(ProcessRefreshKind::new());
    let mut sys = System::new_with_specifics(refresh_kind);
    sys.refresh_all();

    let pid_type = sysinfo::Pid::from(pid as usize);
    if let Some(process) = sys.process(pid_type) {
        let (_, _, safe) = get_process_metadata(&process.name().to_string());
        if !safe {
            return Err("Acción denegada: Este proceso es de vital importancia para el sistema.".to_string());
        }

        if process.kill() {
            return Ok(());
        } else {
            #[cfg(target_os = "windows")]
            {
                if let Ok(output) = std::process::Command::new("taskkill")
                    .args(&["/F", "/PID", &pid.to_string()])
                    .output()
                {
                    if output.status.success() {
                        return Ok(());
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Ok(output) = std::process::Command::new("kill")
                    .args(&["-9", &pid.to_string()])
                    .output()
                {
                    if output.status.success() {
                        return Ok(());
                    }
                }
            }
            return Err("No se pudo cerrar el proceso. Puede requerir permisos elevados.".to_string());
        }
    }

    Err("Proceso no encontrado.".to_string())
}

/// Cierra TODOS los procesos que tengan el nombre dado (para manejar multi-proceso de browsers)
pub fn kill_process_group(name: &str) -> Result<usize, String> {
    let refresh_kind = RefreshKind::new()
        .with_processes(ProcessRefreshKind::new());
    let mut sys = System::new_with_specifics(refresh_kind);
    sys.refresh_all();

    let name_lower = name.to_lowercase();
    let mut killed = 0;
    let mut errors = Vec::new();

    let pids_to_kill: Vec<u32> = sys.processes()
        .iter()
        .filter(|(_, p)| p.name().to_string().to_lowercase() == name_lower)
        .map(|(pid, _)| pid.as_u32())
        .collect();

    for pid in pids_to_kill {
        match kill_process(pid) {
            Ok(()) => killed += 1,
            Err(e) => errors.push(e),
        }
    }

    if killed == 0 && !errors.is_empty() {
        return Err(errors.join("; "));
    }

    Ok(killed)
}

/// Obtiene estadísticas globales del sistema — optimizado con refresh_specifics
pub fn get_system_stats() -> SystemStats {
    // Solo refrescar CPU y memoria, no todos los procesos
    let refresh_kind = RefreshKind::new()
        .with_cpu(CpuRefreshKind::new().with_cpu_usage())
        .with_memory(MemoryRefreshKind::new().with_ram());
    let mut sys = System::new_with_specifics(refresh_kind);
    sys.refresh_all();

    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let cpu_usage = sys.global_cpu_info().cpu_usage();

    // Discos: se consultan por separado
    let mut total_disk = 512 * 1024 * 1024 * 1024;
    let mut free_disk = 128 * 1024 * 1024 * 1024;

    let disks = Disks::new_with_refreshed_list();
    if !disks.is_empty() {
        let mut largest_disk = &disks[0];
        for disk in disks.iter() {
            if disk.total_space() > largest_disk.total_space() {
                largest_disk = disk;
            }
        }
        total_disk = largest_disk.total_space();
        free_disk = largest_disk.available_space();
    }

    let os_name = System::name().unwrap_or_else(|| "Desconocido".to_string());
    let os_version = System::os_version();
    let cpu_count = Some(sys.cpus().len() as u32);
    let cpu_name = sys.cpus().first().map(|c| c.brand().to_string());

    SystemStats {
        total_ram,
        used_ram,
        cpu_usage,
        total_disk,
        free_disk,
        os_name,
        os_version,
        cpu_count,
        cpu_name,
    }
}

