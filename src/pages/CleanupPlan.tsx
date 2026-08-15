import React, { useMemo, useState } from 'react';
import { WarningIcon } from '../components/Icons';
import { useI18n } from '../i18n';
import { formatBytes } from '../utils/format';
import type { CleanableItem } from './Cleaner';

export type CleanupStatus = 'completed' | 'partial' | 'failed' | 'no_op';

export interface CleanupPathResult {
  path: string;
  bytes_freed: number;
  status: CleanupStatus;
  issues: string[];
}

export interface CleanupItemResult {
  id: string;
  name: string;
  estimated_bytes: number;
  bytes_freed: number;
  status: CleanupStatus;
  paths: CleanupPathResult[];
}

export interface CleanupRunResult {
  estimated_bytes: number;
  bytes_freed: number;
  items_attempted: number;
  items_completed: number;
  items_partial: number;
  items_failed: number;
  items_no_op: number;
  results: CleanupItemResult[];
}

interface CleanupPlanProps {
  plan: CleanableItem[];
  result: CleanupRunResult | null;
  isCleaning: boolean;
  requireRiskConfirmation: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const statusLabel = (status: CleanupStatus, t: (source: string) => string) => {
  switch (status) {
    case 'completed': return t('Completado');
    case 'partial': return t('Parcial');
    case 'failed': return t('Falló');
    case 'no_op': return t('Sin cambios');
  }
};

const riskLabel = (risk: CleanableItem['risk_level'], t: (source: string) => string) => {
  switch (risk) {
    case 'Safe': return t('Seguro');
    case 'Review': return t('Revisión');
    case 'Sensitive': return t('Sensible');
    case 'Critical': return t('Crítico');
  }
};

export const CleanupPlan: React.FC<CleanupPlanProps> = ({
  plan,
  result,
  isCleaning,
  requireRiskConfirmation,
  onConfirm,
  onClose,
}) => {
  const { t, backend, language } = useI18n();
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const estimatedBytes = useMemo(() => plan.reduce((sum, item) => sum + item.size, 0), [plan]);
  const pathCount = useMemo(() => plan.reduce((sum, item) => sum + item.paths.length, 0), [plan]);
  const reviewCount = useMemo(() => plan.filter(item => item.risk_level === 'Review').length, [plan]);
  const sensitiveCount = useMemo(() => plan.filter(item => item.risk_level === 'Sensitive').length, [plan]);
  const riskyCount = reviewCount + sensitiveCount;
  const mustAcknowledge = requireRiskConfirmation && riskyCount > 0;
  const canExecute = !isCleaning && (!mustAcknowledge || riskAcknowledged);
  const hasIssues = Boolean(result && (result.items_partial > 0 || result.items_failed > 0));

  return (
    <div className="modal-overlay cleanup-plan-overlay" onClick={() => !isCleaning && onClose()}>
      <div className="modal-content cleanup-plan-modal" onClick={(event) => event.stopPropagation()}>
        <div className={`modal-header cleanup-plan-header ${hasIssues ? 'warning' : ''}`}>
          <div>
            <span className="cleanup-plan-eyebrow">
              {result ? t('Resultado backend verificado') : t('Preview backend verificado')}
            </span>
            <h3>{result ? t('Resultado de la limpieza') : t('Plan de limpieza')}</h3>
          </div>
          {!result && riskyCount > 0 && <WarningIcon size={20} className="warning" />}
        </div>

        <div className="modal-body cleanup-plan-body">
          {!result ? (
            <>
              <p className="cleanup-plan-lead">
                {t('Purgio reconstruyó este plan desde su catálogo autorizado. Estas son exactamente las rutas que intentará limpiar.')}
              </p>

              <div className="cleanup-plan-summary-grid">
                <div className="cleanup-plan-stat">
                  <span>{t('Estimado recuperable')}</span>
                  <strong>{formatBytes(estimatedBytes, language)}</strong>
                </div>
                <div className="cleanup-plan-stat">
                  <span>{t('Elementos')}</span>
                  <strong>{plan.length}</strong>
                </div>
                <div className="cleanup-plan-stat">
                  <span>{t('Rutas autorizadas')}</span>
                  <strong>{pathCount}</strong>
                </div>
                <div className={`cleanup-plan-stat ${riskyCount > 0 ? 'warning' : 'safe'}`}>
                  <span>{t('Requieren atención')}</span>
                  <strong>{riskyCount}</strong>
                </div>
              </div>

              {riskyCount > 0 && (
                <div className="cleanup-plan-warning">
                  <WarningIcon size={18} className="warning" />
                  <div>
                    <strong>{t('El plan incluye elementos que requieren una decisión consciente.')}</strong>
                    <span>
                      {t('{{review}} en revisión y {{sensitive}} sensibles. Revisa sus rutas e impacto antes de continuar.', {
                        review: reviewCount,
                        sensitive: sensitiveCount,
                      })}
                    </span>
                  </div>
                </div>
              )}

              <div className="cleanup-plan-list">
                {plan.map((item) => {
                  const expanded = expandedItem === item.id;
                  return (
                    <div className="cleanup-plan-item" key={item.id}>
                      <button
                        className="cleanup-plan-item-main"
                        onClick={() => setExpandedItem(expanded ? null : item.id)}
                        type="button"
                      >
                        <div className="cleanup-plan-item-copy">
                          <div className="cleanup-plan-item-title-row">
                            <strong>{backend(item.name)}</strong>
                            <span className={`cleanup-plan-risk risk-${item.risk_level.toLowerCase()}`}>
                              {riskLabel(item.risk_level, t)}
                            </span>
                          </div>
                          <span>{backend(item.impact)}</span>
                        </div>
                        <div className="cleanup-plan-item-size">
                          <strong>{formatBytes(item.size, language)}</strong>
                          <span>{item.paths.length} {item.paths.length === 1 ? t('ruta') : t('rutas')}</span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="cleanup-plan-item-details">
                          <p><strong>{t('Qué es:')}</strong> {backend(item.description)}</p>
                          <p><strong>{t('Recomendación:')}</strong> {backend(item.recommended_action)}</p>
                          <div className="cleanup-plan-paths">
                            {item.paths.map((path) => (
                              <code key={path}>{path}</code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {mustAcknowledge && (
                <label className="cleanup-plan-ack">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) => setRiskAcknowledged(event.target.checked)}
                    disabled={isCleaning}
                  />
                  <span>{t('He revisado los elementos de riesgo y sus rutas autorizadas.')}</span>
                </label>
              )}
            </>
          ) : (
            <>
              <div className={`cleanup-result-banner ${hasIssues ? 'warning' : 'success'}`}>
                <div>
                  <span>{hasIssues ? t('La limpieza terminó con incidencias visibles.') : t('La limpieza terminó sin incidencias reportadas.')}</span>
                  <strong>{formatBytes(result.bytes_freed, language)} {t('liberados realmente')}</strong>
                </div>
                <div className="cleanup-result-estimate">
                  <span>{t('Estimado inicial')}</span>
                  <strong>{formatBytes(result.estimated_bytes, language)}</strong>
                </div>
              </div>

              <div className="cleanup-plan-summary-grid result">
                <div className="cleanup-plan-stat safe">
                  <span>{t('Completados')}</span>
                  <strong>{result.items_completed}</strong>
                </div>
                <div className="cleanup-plan-stat warning">
                  <span>{t('Parciales')}</span>
                  <strong>{result.items_partial}</strong>
                </div>
                <div className="cleanup-plan-stat danger">
                  <span>{t('Fallidos')}</span>
                  <strong>{result.items_failed}</strong>
                </div>
                <div className="cleanup-plan-stat">
                  <span>{t('Sin cambios')}</span>
                  <strong>{result.items_no_op}</strong>
                </div>
              </div>

              <div className="cleanup-plan-list result-list">
                {result.results.map((item) => (
                  <div className="cleanup-plan-item result-item" key={item.id}>
                    <button
                      className="cleanup-plan-item-main"
                      type="button"
                      onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    >
                      <div className="cleanup-plan-item-copy">
                        <div className="cleanup-plan-item-title-row">
                          <strong>{backend(item.name)}</strong>
                          <span className={`cleanup-result-status status-${item.status}`}>
                            {statusLabel(item.status, t)}
                          </span>
                        </div>
                        <span>
                          {t('Real: {{actual}} · Estimado: {{estimated}}', {
                            actual: formatBytes(item.bytes_freed, language),
                            estimated: formatBytes(item.estimated_bytes, language),
                          })}
                        </span>
                      </div>
                    </button>

                    {expandedItem === item.id && (
                      <div className="cleanup-plan-item-details">
                        {item.paths.map((path) => (
                          <div className="cleanup-result-path" key={path.path}>
                            <div>
                              <code>{path.path}</code>
                              <span className={`cleanup-result-status status-${path.status}`}>
                                {statusLabel(path.status, t)}
                              </span>
                            </div>
                            <span>{formatBytes(path.bytes_freed, language)}</span>
                            {path.issues.map((issue, index) => (
                              <p key={`${path.path}-${index}`}>{issue}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-actions cleanup-plan-actions">
          {!result ? (
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={isCleaning}>
                {t('Cancelar')}
              </button>
              <button className="btn btn-danger" onClick={onConfirm} disabled={!canExecute}>
                {isCleaning ? t('Ejecutando plan...') : t('Ejecutar plan de limpieza')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>
              {t('Cerrar resultado')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
