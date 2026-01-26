/**
 * RecpamIndirectoDrawer - Drawer for Indirect RECPAM Method
 *
 * Displays automatic RECPAM calculation based on monthly monetary positions.
 */

import type { RecpamIndirectoResult } from '../../../core/cierre-valuacion/recpam-indirecto';
import { formatCurrencyARS, formatNumber, formatCoef } from '../../../core/cierre-valuacion';

interface RecpamIndirectoDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    result: RecpamIndirectoResult | null;
    loading: boolean;
}

export function RecpamIndirectoDrawer({
    isOpen,
    onClose,
    result,
    loading,
}: RecpamIndirectoDrawerProps) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="recpam-drawer-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer Panel */}
            <div className="recpam-drawer-panel">
                {/* Header */}
                <div className="recpam-drawer-header">
                    <div>
                        <h2 className="recpam-drawer-title">Método Indirecto</h2>
                        <p className="recpam-drawer-subtitle">Cálculo simplificado de RECPAM</p>
                    </div>
                    <button
                        className="recpam-drawer-close"
                        onClick={onClose}
                        aria-label="Cerrar"
                    >
                        <i className="ph-bold ph-x" />
                    </button>
                </div>

                {/* Content */}
                <div className="recpam-drawer-content">
                    {loading && (
                        <div className="recpam-drawer-loading">
                            <div className="recpam-drawer-spinner" />
                            <p>Calculando...</p>
                        </div>
                    )}

                    {!loading && !result && (
                        <div className="recpam-drawer-empty">
                            <p>No hay datos disponibles para calcular RECPAM.</p>
                            <p className="text-muted">
                                Asegurate de haber cargado asientos y tener índices disponibles.
                            </p>
                        </div>
                    )}

                    {!loading && result && (
                        <>
                            {/* Info Callout */}
                            <div className="recpam-info-callout">
                                <i className="ph-fill ph-info recpam-info-icon" />
                                <div className="recpam-info-text">
                                    <strong className="recpam-info-title">Método Indirecto</strong>
                                    <p>
                                        El RECPAM se calcula aplicando la tasa de inflación sobre los
                                        activos y pasivos monetarios netos mantenidos durante el período.
                                    </p>
                                </div>
                            </div>

                            {/* Summary Table */}
                            <table className="recpam-summary-table">
                                <tbody>
                                    <tr>
                                        <td>Activos Monetarios Prom.</td>
                                        <td className="text-right font-mono font-medium">
                                            {isNaN(result.avgActivoMon) ? '—' : formatCurrencyARS(result.avgActivoMon)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Pasivos Monetarios Prom.</td>
                                        <td className="text-right font-mono font-medium text-warning">
                                            {isNaN(result.avgPasivoMon) ? '—' : `(${formatCurrencyARS(result.avgPasivoMon)})`}
                                        </td>
                                    </tr>
                                    <tr className="recpam-summary-highlight">
                                        <td className="font-semibold">Posición Monetaria Neta</td>
                                        <td className="text-right font-mono font-semibold">
                                            {isNaN(result.avgPmn) ? '—' : formatCurrencyARS(result.avgPmn)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Inflación del período</td>
                                        <td className="text-right font-mono">
                                            {isNaN(result.overallCoef) || result.overallCoef === 1
                                                ? '—'
                                                : `${((result.overallCoef - 1) * 100).toFixed(1)}%`}
                                        </td>
                                    </tr>
                                    <tr className="recpam-summary-total">
                                        <td className="recpam-summary-total-label">RECPAM Estimado</td>
                                        <td className="recpam-summary-total-value">
                                            {isNaN(result.total) ? '—' : formatCurrencyARS(result.total)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Monthly Breakdown (Optional) */}
                            {result.monthly.length > 0 && (
                                <details className="recpam-monthly-details">
                                    <summary className="recpam-monthly-summary">
                                        Ver detalle mensual ({result.monthly.length} meses)
                                    </summary>
                                    <div className="recpam-monthly-table-container">
                                        <table className="recpam-monthly-table">
                                            <thead>
                                                <tr>
                                                    <th>Mes</th>
                                                    <th className="text-right">Activos</th>
                                                    <th className="text-right">Pasivos</th>
                                                    <th className="text-right">PMN</th>
                                                    <th className="text-right">Coef.</th>
                                                    <th className="text-right">RECPAM</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.monthly.map((month) => (
                                                    <tr key={month.period}>
                                                        <td className="font-mono text-sm">{month.period}</td>
                                                        <td className="text-right font-mono text-sm">
                                                            {formatNumber(month.activeMon, 0)}
                                                        </td>
                                                        <td className="text-right font-mono text-sm">
                                                            {formatNumber(month.pasivoMon, 0)}
                                                        </td>
                                                        <td className="text-right font-mono text-sm font-medium">
                                                            {formatNumber(month.pmn, 0)}
                                                        </td>
                                                        <td className="text-right font-mono text-sm">
                                                            {formatCoef(month.coef)}
                                                        </td>
                                                        <td className={`text-right font-mono text-sm font-semibold ${month.recpam >= 0 ? 'text-success' : 'text-error'}`}>
                                                            {formatNumber(month.recpam, 0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            )}

                            {/* Missing Indices Warning */}
                            {result.missingIndices.length > 0 && (
                                <div className="recpam-warning-callout">
                                    <i className="ph-fill ph-warning recpam-warning-icon" />
                                    <div>
                                        <strong>Indices faltantes:</strong> {result.missingIndices.join(', ')}
                                        <p className="text-muted text-sm">El cálculo puede ser inexacto.</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="recpam-drawer-footer">
                    <button className="btn btn-secondary w-full" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>

            <style>{`
                /* Backdrop */
                .recpam-drawer-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.5);
                    backdrop-filter: blur(4px);
                    z-index: 200;
                    animation: fadeIn 0.3s ease;
                }

                /* Panel */
                .recpam-drawer-panel {
                    position: fixed;
                    top: 0;
                    right: 0;
                    height: 100vh;
                    width: 100%;
                    max-width: 500px;
                    background: var(--surface-1);
                    box-shadow: var(--shadow-lg);
                    z-index: 201;
                    display: flex;
                    flex-direction: column;
                    animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }

                /* Header */
                .recpam-drawer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-lg);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--surface-2);
                }
                .recpam-drawer-title {
                    font-size: var(--font-size-lg);
                    font-weight: 700;
                    margin: 0;
                }
                .recpam-drawer-subtitle {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                    margin: var(--space-xs) 0 0 0;
                }
                .recpam-drawer-close {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-radius: var(--radius-md);
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-lg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s, color 0.15s;
                }
                .recpam-drawer-close:hover {
                    background: var(--surface-3);
                    color: var(--color-text);
                }

                /* Content */
                .recpam-drawer-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--space-lg);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }

                /* Loading */
                .recpam-drawer-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-md);
                    padding: var(--space-xl);
                }
                .recpam-drawer-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--color-border);
                    border-top-color: var(--brand-primary);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Empty State */
                .recpam-drawer-empty {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                    padding: var(--space-xl);
                    text-align: center;
                    color: var(--color-text-secondary);
                }

                /* Info Callout */
                .recpam-info-callout {
                    display: flex;
                    gap: var(--space-md);
                    padding: var(--space-md);
                    background: rgba(59, 130, 246, 0.05);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    border-radius: var(--radius-md);
                }
                .recpam-info-icon {
                    font-size: 1.25rem;
                    color: var(--brand-primary);
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .recpam-info-title {
                    display: block;
                    color: var(--brand-primary);
                    margin-bottom: var(--space-xs);
                }
                .recpam-info-text p {
                    margin: 0;
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }

                /* Summary Table */
                .recpam-summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: var(--font-size-sm);
                }
                .recpam-summary-table tr {
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                }
                .recpam-summary-table td {
                    padding: var(--space-sm) 0;
                    color: var(--color-text-secondary);
                }
                .recpam-summary-highlight {
                    background: var(--surface-2);
                }
                .recpam-summary-highlight td {
                    padding: var(--space-sm) var(--space-md);
                    color: var(--color-text);
                }
                .recpam-summary-total {
                    border-top: 2px solid var(--brand-primary);
                    background: rgba(59, 130, 246, 0.05);
                }
                .recpam-summary-total td {
                    padding: var(--space-md);
                }
                .recpam-summary-total-label {
                    font-size: var(--font-size-lg);
                    font-weight: 700;
                    color: var(--color-text);
                }
                .recpam-summary-total-value {
                    font-size: var(--font-size-lg);
                    font-weight: 700;
                    color: var(--brand-primary);
                    font-family: var(--font-mono);
                }

                /* Monthly Details */
                .recpam-monthly-details {
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                }
                .recpam-monthly-summary {
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    cursor: pointer;
                    font-weight: 600;
                    font-size: var(--font-size-sm);
                    user-select: none;
                }
                .recpam-monthly-summary:hover {
                    background: var(--surface-3);
                }
                .recpam-monthly-table-container {
                    overflow-x: auto;
                    max-height: 300px;
                    overflow-y: auto;
                }
                .recpam-monthly-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: var(--font-size-xs);
                }
                .recpam-monthly-table thead {
                    background: var(--surface-2);
                    position: sticky;
                    top: 0;
                }
                .recpam-monthly-table th {
                    padding: var(--space-xs) var(--space-sm);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--color-text-secondary);
                    text-align: left;
                }
                .recpam-monthly-table td {
                    padding: var(--space-xs) var(--space-sm);
                    border-bottom: 1px solid rgba(0, 0, 0, 0.03);
                }

                /* Warning Callout */
                .recpam-warning-callout {
                    display: flex;
                    gap: var(--space-sm);
                    padding: var(--space-md);
                    background: rgba(245, 158, 11, 0.05);
                    border: 1px solid rgba(245, 158, 11, 0.15);
                    border-radius: var(--radius-md);
                    font-size: var(--font-size-sm);
                }
                .recpam-warning-icon {
                    font-size: 1.25rem;
                    color: #F59E0B;
                    flex-shrink: 0;
                    margin-top: 2px;
                }

                /* Footer */
                .recpam-drawer-footer {
                    padding: var(--space-md);
                    border-top: 1px solid var(--color-border);
                    background: var(--surface-2);
                }

                /* Utility Classes */
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .text-sm { font-size: var(--font-size-sm); }
                .text-muted { color: var(--color-text-secondary); }
                .text-warning { color: #F59E0B; }
                .text-success { color: var(--color-success); }
                .text-error { color: var(--color-error); }
                .font-mono { font-family: var(--font-mono); }
                .font-medium { font-weight: 500; }
                .font-semibold { font-weight: 600; }
                .font-bold { font-weight: 700; }
                .w-full { width: 100%; }
            `}</style>
        </>
    );
}
