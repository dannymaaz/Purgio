import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { RefreshIcon } from '../components/Icons';
import { useI18n } from '../i18n';

interface ComponentStoreAnalysis {
  explorer_reported_size: string;
  actual_size: string;
  shared_with_windows?: string | null;
  backups_and_disabled_features?: string | null;
  cache_and_temporary_data?: string | null;
  last_cleanup?: string | null;
  reclaimable_packages?: number | null;
  cleanup_recommended: boolean;
}

interface ComponentStoreResult {
  success: boolean;
  requires_elevation: boolean;
  exit_code?: number | null;
  message: string;
  analysis?: ComponentStoreAnalysis | null;
  stdout: string;
  stderr: string;
}

export const ComponentStorePanel: React.FC = () => {
  const { t } = useI18n();
  const [result, setResult] = useState<ComponentStoreResult | null>(null);
  const [busy, setBusy] = useState<'analyze' | 'cleanup' | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (platform() !== 'windows') return null;

  const analyze = async () => {
    setBusy('analyze');
    setConfirmed(false);
    try {
      setResult(await invoke<ComponentStoreResult>('analyze_component_store'));
    } catch (error) {
      setResult({ success: false, requires_elevation: false, message: String(error), analysis: null, stdout: '', stderr: '' });
    } finally {
      setBusy(null);
    }
  };

  const cleanup = async () => {
    if (!confirmed) return;
    setBusy('cleanup');
    try {
      setResult(await invoke<ComponentStoreResult>('start_component_cleanup'));
      setConfirmed(false);
    } catch (error) {
      setResult({ success: false, requires_elevation: false, message: String(error), analysis: null, stdout: '', stderr: '' });
    } finally {
      setBusy(null);
    }
  };

  const analysis = result?.analysis;
  const diagnosticOutput = [result?.stderr, result?.stdout].filter(Boolean).join('\n').trim();

  return (
    <section className="card" style={{ marginTop: '18px', padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('Almacén de componentes de Windows')}</h3>
          <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
            {t('Purgio usa DISM, la herramienta de mantenimiento de Windows, para analizar WinSxS. Nunca borra esta carpeta manualmente.')}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={analyze} disabled={busy !== null}>
          <RefreshIcon size={14} />
          {busy === 'analyze' ? t('Analizando...') : t('Analizar Component Store')}
        </button>
      </div>

      {result?.requires_elevation && (
        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '13px' }}>
          {t('DISM requiere permisos de administrador. Cierra Purgio y vuelve a abrirlo como administrador para analizar o limpiar el Component Store.')}
        </div>
      )}

      {analysis && (
        <div style={{ marginTop: '16px' }}>
          <div className="details-meta-grid">
            <div><span className="details-label">{t('Tamaño reportado por Explorer')}</span><span>{analysis.explorer_reported_size}</span></div>
            <div><span className="details-label">{t('Tamaño real del Component Store')}</span><span>{analysis.actual_size}</span></div>
            <div><span className="details-label">{t('Paquetes recuperables')}</span><span>{analysis.reclaimable_packages ?? t('No disponible')}</span></div>
            <div>
              <span className="details-label">{t('Limpieza recomendada por DISM')}</span>
              <span className={analysis.cleanup_recommended ? 'details-rec-value warning' : 'details-rec-value safe'}>
                {analysis.cleanup_recommended ? t('Sí') : t('No')}
              </span>
            </div>
          </div>

          {analysis.last_cleanup && (
            <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('Última limpieza reportada por DISM')}: {analysis.last_cleanup}
            </p>
          )}

          {analysis.cleanup_recommended && (
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
              <label style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.4 }}>
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy !== null} />
                <span>{t('Entiendo que esta es una operación de mantenimiento de Windows. Purgio usará únicamente StartComponentCleanup, no ResetBase, y no reiniciará el equipo automáticamente.')}</span>
              </label>
              <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={cleanup} disabled={!confirmed || busy !== null}>
                {busy === 'cleanup' ? t('Limpiando Component Store...') : t('Ejecutar limpieza estándar de Windows')}
              </button>
            </div>
          )}
        </div>
      )}

      {result && !result.success && !result.requires_elevation && (
        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '13px' }}>
          <strong>{t('DISM no pudo completar la operación.')}</strong>
          <div style={{ marginTop: '4px' }}>{result.message}</div>
          {result.exit_code !== null && result.exit_code !== undefined && <div>{t('Código de salida')}: {result.exit_code}</div>}
        </div>
      )}

      {diagnosticOutput && !result?.success && (
        <details style={{ marginTop: '12px', fontSize: '12px' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>{t('Ver salida de diagnóstico de DISM')}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflow: 'auto', marginTop: '8px', color: 'var(--text-muted)' }}>{diagnosticOutput}</pre>
        </details>
      )}

      <p style={{ marginTop: '14px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.45 }}>
        {t('ResetBase no forma parte de este flujo porque impediría desinstalar actualizaciones de Windows que ya estén instaladas.')}
      </p>
    </section>
  );
};
