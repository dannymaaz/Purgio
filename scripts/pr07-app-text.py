from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace("  language: 'es' | 'en';", "  language: LanguagePreference;", 1)

# Effect dependencies using active translator.
text = text.replace(
    "  }, []);\n\n  // Persistir cambios solo después de una hidratación correcta",
    "  }, [addToast, t]);\n\n  // Persistir cambios solo después de una hidratación correcta",
    1,
)
text = text.replace(
    "  }, [settingsHydrated, theme, lang, confirmDelete, confirmDisable, showSensitive]);",
    "  }, [settingsHydrated, theme, lang, confirmDelete, confirmDisable, showSensitive, addToast, t]);",
    1,
)

# Toasts and callbacks.
text = text.replace(
    "`Nueva versión ${info.latest_version} disponible. Ve a Configuración para actualizar.`,",
    "`${t('Nueva versión disponible:')} ${info.latest_version}. ${t('Ve a Configuración para actualizar.')}`,",
    1,
)
text = text.replace("  }, [updateDismissed, addToast]);", "  }, [updateDismissed, addToast, t]);", 1)
text = text.replace(
    "addToast(`No se pudo instalar la actualización: ${String(e)}`, 'error', 7000);",
    "addToast(`${t('No se pudo instalar la actualización:')} ${String(e)}`, 'error', 7000);",
    1,
)
text = text.replace(
    "addToast('Error al analizar el sistema. Intenta de nuevo.', 'error');",
    "addToast(t('Error al analizar el sistema. Intenta de nuevo.'), 'error');",
    1,
)
text = text.replace("  }, [runScan, addToast]);", "  }, [runScan, addToast, t]);", 1)
text = text.replace(
    "'La limpieza se completó, pero no se pudo guardar la entrada en el historial.',",
    "t('La limpieza se completó, pero no se pudo guardar la entrada en el historial.'),",
    1,
)
text = text.replace(
    "`✓ Limpieza completada. Se liberaron ${formatBytes(bytesFreed)} de espacio.`,",
    "`${t('✓ Limpieza completada. Se liberaron')} ${formatBytes(bytesFreed, activeLanguage)} ${t('de espacio.')}`,",
    1,
)
text = text.replace(
    "addToast(`Error durante la limpieza: ${String(e)}`, 'error', 6000);",
    "addToast(`${t('Error durante la limpieza:')} ${String(e)}`, 'error', 6000);",
    1,
)
text = text.replace(
    "  }, [runScan, fetchSystemStats, addToast]);",
    "  }, [runScan, fetchSystemStats, addToast, activeLanguage, t]);",
    1,
)
text = text.replace(
    "addToast(`\"${item.name}\" desactivado del arranque.`, 'success');",
    "addToast(`\"${item.name}\" ${t('desactivado del arranque.')}`, 'success');",
    1,
)
text = text.replace(
    "addToast(`No se pudo desactivar \"${item.name}\".`, 'error');",
    "addToast(`${t('No se pudo desactivar')} \"${item.name}\".`, 'error');",
    1,
)
text = text.replace("  }, [addToast]);", "  }, [addToast, t]);", 1)
text = text.replace(
    "addToast(`\"${item.name}\" activado al inicio.`, 'success');",
    "addToast(`\"${item.name}\" ${t('activado al inicio.')}`, 'success');",
    1,
)
text = text.replace(
    "addToast(`No se pudo activar \"${item.name}\".`, 'error');",
    "addToast(`${t('No se pudo activar')} \"${item.name}\".`, 'error');",
    1,
)
text = text.replace("  }, [addToast]);", "  }, [addToast, t]);", 1)
text = text.replace(
    "addToast(`Proceso \"${process.name}\" finalizado.`, 'success');",
    "addToast(`${t('Proceso')} \"${process.name}\" ${t('finalizado.')}`, 'success');",
    1,
)
text = text.replace(
    "addToast(`No se pudo cerrar \"${process.name}\". Puede requerir permisos elevados.`, 'error');",
    "addToast(`${t('No se pudo cerrar')} \"${process.name}\". ${t('Puede requerir permisos elevados.')}`, 'error');",
    1,
)
text = text.replace("  }, [fetchSystemStats, addToast]);", "  }, [fetchSystemStats, addToast, t]);", 1)

# Banner and modal strings.
replacements = {
    '<span>🔔 Nueva versión disponible:</span>': "<span>{t('🔔 Nueva versión disponible')}</span>",
    "(instalada: {updateInfo.current_version})": "({t('instalada:')} {updateInfo.current_version})",
    '>\n              Ver actualización\n            </button>': ">\n              {t('Ver actualización')}\n            </button>",
    'aria-label="Ignorar actualización"': "aria-label={t('Ignorar actualización')}",
    '              Confirmar Eliminación': "              {t('Confirmar Eliminación')}",
    '                Cancelar': "                {t('Cancelar')}",
    "                {isCleaning ? 'Limpiando...' : 'Limpiar definitivamente'}": "                {isCleaning ? t('Limpiando...') : t('Limpiar definitivamente')}",
    '              Desactivar del Arranque': "              {t('Desactivar del Arranque')}",
    '                El programa no se ejecutará al encender el equipo. Podrás abrirlo manualmente y volver a activarlo en cualquier momento.': "                {t('El programa no se ejecutará al encender el equipo. Podrás abrirlo manualmente y volver a activarlo en cualquier momento.')}",
    '                  ⚠️ Este programa puede estar relacionado con drivers o seguridad del sistema. Desactivarlo con cuidado.': "                  {t('⚠️ Este programa puede estar relacionado con drivers o seguridad del sistema. Desactivarlo con cuidado.')}",
    '                Desactivar': "                {t('Desactivar')}",
    '              🔔 Nueva versión disponible': "              {t('🔔 Nueva versión disponible')}",
    '                Ahora no': "                {t('Ahora no')}",
    "                {isUpdating ? 'Actualizando…' : 'Instalar actualización'}": "                {isUpdating ? t('Actualizando…') : t('Instalar actualización')}",
}
for old, new in replacements.items():
    text = text.replace(old, new)

# Localize formatted sizes in modals.
text = text.replace("formatBytes(itemsToClean.reduce((sum, i) => sum + i.size, 0))", "formatBytes(itemsToClean.reduce((sum, i) => sum + i.size, 0), activeLanguage)")
text = text.replace("formatBytes(item.size)", "formatBytes(item.size, activeLanguage)")

# Translate names displayed in clean confirmation through the current source translator where possible.
text = text.replace("{item.name}</span>", "{translate(activeLanguage, item.name)}</span>")

# Translate update explanatory sentence as one message.
text = text.replace(
    '                Purgio descargará el paquete correspondiente a este sistema, verificará su firma criptográfica y solo entonces lo instalará y reiniciará la aplicación. ¿Deseas continuar?',
    "                {t('Purgio descargará el paquete correspondiente a este sistema, verificará su firma criptográfica y solo entonces lo instalará y reiniciará la aplicación. ¿Deseas continuar?')}",
)

path.write_text(text, encoding='utf-8')
