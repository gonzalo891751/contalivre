/**
 * Step3RT17Panel - Panel component for Step 3 (Valuación RT17) BRIDGE
 * 
 * Key UX: This panel operates on partidas from Step 2 (RT6).
 * Users cannot add valuations independently - they must complete
 * valuations for the RT6 items one by one.
 */

import React, { useMemo } from 'react';
import type { ComputedPartidaRT17, ComputedPartidaRT6 } from '../../../core/cierre-valuacion';
import {
    formatCurrencyARS,
    formatNumber,
    getValuationProgress,
    type ValuationProgress,
} from '../../../core/cierre-valuacion';
import { isCapitalSocialAccount } from '../../../core/cierre-valuacion/auto-partidas-rt6';
import type { ValuationMethod } from '../../../core/cierre-valuacion/monetary-classification';

interface Step3RT17PanelProps {
    computedRT17: ComputedPartidaRT17[];
    computedRT6: ComputedPartidaRT6[];
    onCompleteValuation: (id: string) => void;
    onGoToStep2: () => void;
}

const GROUP_ORDER = ['ACTIVO', 'PASIVO', 'PN'] as const;
const GROUP_LABELS: Record<string, string> = {
    ACTIVO: 'ACTIVO',
    PASIVO: 'PASIVO',
    PN: 'PATRIMONIO NETO',
};

const METHOD_LABELS: Record<ValuationMethod, string> = {
    FX: 'Tipo de cambio',
    VNR: 'Valor de mercado / VNR',
    VPP: 'VPP',
    REPOSICION: 'Costo de reposicion',
    REVALUO: 'Revaluo tecnico',
    MANUAL: 'Manual',
    NA: 'No requiere accion',
};

type StatusType = 'pending' | 'done' | 'na';

interface StatusConfig {
    label: string;
    className: string;
    icon: string;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
    pending: { label: 'Pendiente', className: 'status-pending', icon: '⏱️' },
    done: { label: 'Listo', className: 'status-done', icon: '✓' },
    na: { label: 'No aplica', className: 'status-na', icon: '—' },
};

export function Step3RT17Panel({
    computedRT17,
    computedRT6,
    onCompleteValuation,
    onGoToStep2,
}: Step3RT17PanelProps) {
    // Calculate progress
    const progress: ValuationProgress = useMemo(
        () => getValuationProgress(computedRT17),
        [computedRT17]
    );

    // Group partidas by Group
    const groupedData = useMemo(() => {
        const groups: Record<string, ComputedPartidaRT17[]> = {};

        for (const grupo of GROUP_ORDER) {
            groups[grupo] = [];
        }

        for (const partida of computedRT17) {
            const grupo = partida.grupo || 'ACTIVO';
            if (!groups[grupo]) groups[grupo] = [];
            groups[grupo].push(partida);
        }

        return groups;
    }, [computedRT17]);

    // Get RT6 homog value for display
    const getRT6Homog = (sourceId?: string): number => {
        if (!sourceId) return 0;
        const rt6 = computedRT6.find((p) => p.id === sourceId);
        return rt6?.totalHomog || 0;
    };

    // Determine status for a partida
    const getStatus = (partida: ComputedPartidaRT17): StatusType => {
        if (partida.grupo === 'PN') return 'na';
        return partida.valuationStatus || 'pending';
    };

    // Empty state - no RT6 partidas yet
    if (computedRT17.length === 0) {
        return (
            <div className="step3-panel">
                <div className="step3-empty-state">
                    <div className="step3-empty-icon">📊</div>
                    <h3>Sin partidas para valuar</h3>
                    <p>
                        Primero cargá las partidas no monetarias en el Paso 2 (Reexpresión).
                        Luego podrás completar la valuación de cada una aquí.
                    </p>
                    <button className="btn btn-primary" onClick={onGoToStep2}>
                        Ir al Paso 2 →
                    </button>
                </div>

                <style>{getStyles()}</style>
            </div>
        );
    }

    return (
        <div className="step3-panel">
            {/* Progress Header */}
            <div className="step3-progress-card">
                <div className="step3-progress-left">
                    <div className="step3-progress-icon">⚖️</div>
                    <div>
                        <h2 className="step3-progress-title">Valuación a Valores Corrientes</h2>
                        <p className="step3-progress-subtitle">
                            Definí el valor de cierre para calcular el Resultado por Tenencia.
                        </p>
                    </div>
                </div>

                <div className="step3-progress-right">
                    <div className="step3-progress-header">
                        <span className="step3-progress-label">Progreso</span>
                        <span className="step3-progress-value font-mono">
                            {progress.done}/{progress.done + progress.pending} Completado
                        </span>
                    </div>
                    <div className="step3-progress-bar">
                        <div
                            className="step3-progress-fill"
                            style={{ width: `${progress.percentage}%` }}
                        />
                    </div>
                    <p className="step3-progress-hint">
                        <span>ℹ️</span> Solo las cuentas pendientes requieren tu acción.
                    </p>
                </div>
            </div>

            {/* Valuation Cards by Group */}
            <div className="step3-content">
                {GROUP_ORDER.map((grupo) => {
                    const partidas = groupedData[grupo];
                    if (!partidas || partidas.length === 0) return null;

                    return (
                        <div key={grupo} className="step3-grupo-section">
                            <h3 className="step3-grupo-title">{GROUP_LABELS[grupo]}</h3>

                            {partidas.map((partida) => {
                                const status = getStatus(partida);
                                const statusConfig = STATUS_CONFIG[status];
                                const homog = getRT6Homog(partida.sourcePartidaId);
                                const isNA = status === 'na';
                                const isCapitalSocial = isCapitalSocialAccount(partida.cuentaCodigo, partida.cuentaNombre);
                                const fallbackMethodLabel =
                                    partida.profileType === 'moneda_extranjera'
                                        ? 'Cotizacion cierre'
                                        : partida.profileType === 'mercaderias'
                                            ? 'Costo de reposicion'
                                            : isNA
                                                ? 'No requiere accion'
                                                : 'Manual';
                                const methodLabel = partida.method ? METHOD_LABELS[partida.method] : fallbackMethodLabel;

                                return (
                                    <div
                                        key={partida.id}
                                        className={`step3-valuation-card ${statusConfig.className}`}
                                    >
                                        {/* Status Stripe */}
                                        <div className="step3-card-stripe" />

                                        {/* Account Info */}
                                        <div className="step3-card-content">
                                            <div className="step3-card-header-row">
                                                <span className="step3-grupo-badge">
                                                    {partida.grupo}
                                                </span>
                                                <span className={`step3-status-chip ${statusConfig.className}`}>
                                                    <span>{statusConfig.icon}</span>
                                                    {statusConfig.label}
                                                </span>
                                            </div>
                                            <h4 className="step3-cuenta-name">
                                                {partida.cuentaNombre || 'Sin cuenta'}
                                            </h4>
                                            <div className="step3-card-meta">
                                                <span>
                                                    V. Homogéneo:{' '}
                                                    <strong className="font-mono">
                                                        {formatNumber(homog)}
                                                    </strong>
                                                </span>
                                                <span className="step3-meta-divider">|</span>
                                                <span>
                                                    Método:{' '}
                                                    <span className="step3-method">
                                                        {methodLabel}
                                                    </span>
                                                </span>
                                            </div>
                                            {isCapitalSocial && (
                                                <div className="step3-capital-note">
                                                    El Capital Social se mantiene historico. La reexpresion se registra en Ajuste de capital.
                                                </div>
                                            )}
                                        </div>

                                        {/* Results Block */}
                                        <div className="step3-results-block">
                                            <div className="step3-result-item">
                                                <div className="step3-result-label">Valor Corriente</div>
                                                <div
                                                    className={`step3-result-value font-mono ${status !== 'done' ? 'muted' : ''
                                                        }`}
                                                >
                                                    {status === 'done'
                                                        ? formatCurrencyARS(partida.valCorriente)
                                                        : isNA
                                                            ? 'N/A'
                                                            : '—'}
                                                </div>
                                            </div>
                                            <div className="step3-result-divider" />
                                            <div className="step3-result-item">
                                                <div className="step3-result-label">RxT (Resultado)</div>
                                                <div
                                                    className={`step3-result-value font-mono ${status === 'done'
                                                        ? partida.resTenencia >= 0
                                                            ? 'positive'
                                                            : 'negative'
                                                        : 'muted'
                                                        }`}
                                                >
                                                    {status === 'done'
                                                        ? `${partida.resTenencia >= 0 ? '+' : ''}${formatNumber(partida.resTenencia)}`
                                                        : isNA
                                                            ? '0,00'
                                                            : '—'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="step3-action-container">
                                            {isNA ? (
                                                <span className="step3-na-text">
                                                    No requiere acción
                                                </span>
                                            ) : (
                                                <button
                                                    className={`step3-action-btn ${status === 'done' ? 'secondary' : 'primary'
                                                        }`}
                                                    onClick={() => onCompleteValuation(partida.id)}
                                                >
                                                    {status === 'done' ? (
                                                        <>
                                                            <span>✏️</span> Editar
                                                        </>
                                                    ) : (
                                                        'Completar Valuación'
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* Final Summary Table */}
            <div className="step3-summary-container">
                <div className="step3-summary-header">
                    <h3>Resumen de Valuación (RT6 + RT17)</h3>
                    <p>Cuadro comparativo final de reexpresión y valuación.</p>
                </div>

                <div className="step3-table-wrapper">
                    <table className="step3-summary-table">
                        <thead>
                            <tr>
                                <th className="text-left">Cuenta</th>
                                <th className="text-right">V. Origen</th>
                                <th className="text-right">V. Homogéneo</th>
                                <th className="text-right highlight-recpam">RECPAM (AxI)</th>
                                <th className="text-right">V. Corriente</th>
                                <th className="text-right highlight-rxt">RxT (Val.)</th>
                                <th className="text-right">Dif. Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {GROUP_ORDER.map(grupo => {
                                const groupPartidas = groupedData[grupo];
                                if (!groupPartidas || groupPartidas.length === 0) return null;

                                // Sub-grouping by Rubro for better parity
                                const rubros: Record<string, ComputedPartidaRT17[]> = {};
                                groupPartidas.forEach(p => {
                                    const r = p.rubroLabel || 'Sin rubro';
                                    if (!rubros[r]) rubros[r] = [];
                                    rubros[r].push(p);
                                });

                                return (
                                    <React.Fragment key={grupo}>
                                        <tr className="group-header-row">
                                            <td colSpan={7}>{GROUP_LABELS[grupo]}</td>
                                        </tr>
                                        {Object.entries(rubros).map(([rubroName, rubroPartidas]) => {
                                            const rubroHomogTotal = rubroPartidas.reduce((acc, p) => acc + getRT6Homog(p.sourcePartidaId), 0);

                                            return (
                                                <React.Fragment key={rubroName}>
                                                    <tr className="rubro-header-row">
                                                        <td colSpan={6}>{rubroName}</td>
                                                        <td className="text-right font-mono text-xs opacity-60">
                                                            {formatNumber(rubroHomogTotal)}
                                                        </td>
                                                    </tr>
                                                    {rubroPartidas.map(p => {
                                                        const sourceRT6 = computedRT6.find(s => s.id === p.sourcePartidaId);
                                                        const vOrig = sourceRT6?.totalBase || 0;
                                                        const vHomog = sourceRT6?.totalHomog || 0;
                                                        const recpam = vHomog - vOrig;
                                                        const vCorr = p.valuationStatus === 'done' ? p.valCorriente : vHomog;
                                                        const rxt = p.valuationStatus === 'done' ? p.resTenencia : 0;
                                                        const diffTotal = vCorr - vOrig;

                                                        return (
                                                            <tr key={p.id} className="summary-row">
                                                                <td className="cell-cuenta">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium">{p.cuentaNombre}</span>
                                                                        <span className="text-[10px] text-muted">{p.cuentaCodigo}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="text-right font-mono tabular-nums text-muted">{formatNumber(vOrig)}</td>
                                                                <td className="text-right font-mono tabular-nums">{formatNumber(vHomog)}</td>
                                                                <td className="text-right font-mono tabular-nums font-bold text-recpam">{formatNumber(recpam)}</td>
                                                                <td className="text-right font-mono tabular-nums">{formatNumber(vCorr)}</td>
                                                                <td className={`text-right font-mono tabular-nums font-bold ${rxt >= 0 ? 'text-success' : 'text-error'}`}>{formatNumber(rxt)}</td>
                                                                <td className="text-right font-mono tabular-nums font-semibold">{formatNumber(diffTotal)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <style>{getStyles()}</style>
        </div>
    );
}

function getStyles(): string {
    return `
        .step3-panel {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }

        /* Empty State */
        .step3-empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-md);
            padding: var(--space-2xl);
            text-align: center;
            background: var(--surface-1);
            border-radius: var(--radius-xl);
            border: 1px solid var(--color-border);
        }
        .step3-empty-icon {
            font-size: 4rem;
            opacity: 0.5;
        }
        .step3-empty-state h3 {
            margin: 0;
            font-size: var(--font-size-lg);
        }
        .step3-empty-state p {
            color: var(--color-text-secondary);
            max-width: 400px;
        }

        /* Progress Card */
        .step3-progress-card {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-lg);
            padding: var(--space-lg);
            background: var(--surface-1);
            border-radius: var(--radius-xl);
            border: 1px solid var(--color-border);
            box-shadow: var(--shadow-sm);
        }
        .step3-progress-left {
            display: flex;
            align-items: center;
            gap: var(--space-md);
        }
        .step3-progress-icon {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(16, 185, 129, 0.1);
            border-radius: 50%;
            font-size: 1.5rem;
        }
        .step3-progress-title {
            margin: 0;
            font-size: var(--font-size-lg);
            font-weight: 700;
        }
        .step3-progress-subtitle {
            margin: var(--space-xs) 0 0 0;
            font-size: var(--font-size-sm);
            color: var(--color-text-secondary);
        }
        .step3-progress-right {
            flex: 0 0 280px;
            padding: var(--space-md);
            background: var(--surface-2);
            border-radius: var(--radius-lg);
            border: 1px solid var(--color-border);
        }
        .step3-progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--space-xs);
        }
        .step3-progress-label {
            font-size: var(--font-size-xs);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--color-text-secondary);
        }
        .step3-progress-value {
            font-weight: 700;
            color: var(--brand-primary);
        }
        .step3-progress-bar {
            height: 8px;
            background: var(--surface-3);
            border-radius: 4px;
            overflow: hidden;
        }
        .step3-progress-fill {
            height: 100%;
            background: var(--color-success);
            border-radius: 4px;
            transition: width 0.5s ease;
        }
        .step3-progress-hint {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
            margin: var(--space-sm) 0 0 0;
            font-size: var(--font-size-xs);
            color: var(--color-text-secondary);
        }

        /* Content */
        .step3-content {
            display: flex;
            flex-direction: column;
            gap: var(--space-lg);
        }

        /* Grupo Sections */
        .step3-grupo-section {
            display: flex;
            flex-direction: column;
            gap: var(--space-sm);
        }
        .step3-grupo-title {
            font-size: var(--font-size-sm);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--color-text-secondary);
            margin: 0 0 var(--space-xs) 0;
        }

        /* Valuation Card */
        .step3-valuation-card {
            display: grid;
            grid-template-columns: 4px 1fr auto auto;
            align-items: center;
            gap: var(--space-md);
            padding: var(--space-md);
            background: var(--surface-1);
            border-radius: var(--radius-lg);
            border: 1px solid var(--color-border);
            box-shadow: var(--shadow-sm);
            transition: box-shadow 0.15s;
        }
        .step3-valuation-card:hover {
            box-shadow: var(--shadow-md);
        }

        /* Status Stripe */
        .step3-card-stripe {
            width: 4px;
            height: 100%;
            border-radius: 2px;
            min-height: 60px;
        }
        .status-pending .step3-card-stripe { background: #F59E0B; }
        .status-done .step3-card-stripe { background: #10B981; }
        .status-na .step3-card-stripe { background: #94A3B8; }

        /* Card Content */
        .step3-card-content {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
        }
        .step3-card-header-row {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
        }
        .step3-grupo-badge {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 2px 6px;
            background: var(--surface-3);
            border-radius: var(--radius-sm);
            color: var(--color-text-secondary);
        }
        .step3-status-chip {
            display: inline-flex;
            align-items: center;
            gap: var(--space-xs);
            font-size: 0.7rem;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: var(--radius-sm);
        }
        .step3-status-chip.status-pending {
            background: #FEF3C7;
            color: #D97706;
            border: 1px solid #FDE68A;
        }
        .step3-status-chip.status-done {
            background: #D1FAE5;
            color: #059669;
            border: 1px solid #A7F3D0;
        }
        .step3-status-chip.status-na {
            background: #F1F5F9;
            color: #64748B;
            border: 1px solid #E2E8F0;
        }
        .step3-cuenta-name {
            margin: 0;
            font-size: var(--font-size-md);
            font-weight: 700;
        }
        .step3-card-meta {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            font-size: var(--font-size-sm);
            color: var(--color-text-secondary);
        }
        .step3-meta-divider {
            color: var(--color-border);
        }
        .step3-method {
            color: var(--brand-primary);
            font-weight: 500;
        }
        .step3-capital-note {
            margin-top: 6px;
            padding: 6px 8px;
            font-size: 0.8rem;
            border-radius: 8px;
            border: 1px solid #A7F3D0;
            background: #ECFDF5;
            color: #047857;
        }

        /* Results Block */
        .step3-results-block {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            padding: var(--space-sm) var(--space-md);
            background: var(--surface-2);
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
        }
        .step3-result-item {
            text-align: right;
        }
        .step3-result-label {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--color-text-secondary);
            margin-bottom: 2px;
        }
        .step3-result-value {
            font-weight: 700;
            font-size: var(--font-size-sm);
        }
        .step3-result-value.muted { color: var(--color-text-secondary); }
        .step3-result-value.positive { color: var(--color-success); }
        .step3-result-value.negative { color: #EF4444; }
        .step3-result-divider {
            width: 1px;
            height: 32px;
            background: var(--color-border);
        }

        /* Action Container */
        .step3-action-container {
            min-width: 160px;
        }
        .step3-na-text {
            font-size: var(--font-size-xs);
            color: var(--color-text-secondary);
            font-style: italic;
        }
        .step3-action-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-xs);
            width: 100%;
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            font-size: var(--font-size-sm);
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
            border: 1px solid transparent;
        }
        .step3-action-btn.primary {
            background: var(--brand-primary);
            color: white;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }
        .step3-action-btn.primary:hover {
            background: #2563EB;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
        .step3-action-btn.secondary {
            background: var(--surface-1);
            color: var(--color-text);
            border-color: var(--color-border);
        }
        .step3-action-btn.secondary:hover {
            border-color: var(--brand-primary);
            color: var(--brand-primary);
        }

        /* Summary Table Styles */
        .step3-summary-container {
            margin-top: var(--space-2xl);
            background: var(--surface-1);
            border-radius: var(--radius-xl);
            border: 1px solid var(--color-border);
            overflow: hidden;
            box-shadow: var(--shadow-md);
        }
        .step3-summary-header {
            padding: var(--space-lg);
            background: var(--surface-2);
            border-bottom: 1px solid var(--color-border);
        }
        .step3-summary-header h3 {
            margin: 0;
            font-size: var(--font-size-lg);
            font-weight: 700;
        }
        .step3-summary-header p {
            margin: var(--space-xs) 0 0 0;
            font-size: var(--font-size-sm);
            color: var(--color-text-secondary);
        }
        .step3-table-wrapper {
            overflow-x: auto;
        }
        .step3-summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: var(--font-size-sm);
        }
        .step3-summary-table th {
            padding: var(--space-md);
            background: var(--surface-1);
            border-bottom: 2px solid var(--color-border);
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--color-text-secondary);
            white-space: nowrap;
        }
        .step3-summary-table td {
            padding: var(--space-sm) var(--space-md);
            border-bottom: 1px solid rgba(0,0,0,0.03);
        }

        /* Row Types */
        .group-header-row {
            background: var(--surface-2);
        }
        .group-header-row td {
            font-weight: 800;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--brand-primary);
            padding: var(--space-xs) var(--space-md) !important;
        }
        .rubro-header-row {
            background: linear-gradient(90deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%);
        }
        .rubro-header-row td {
            font-weight: 700;
            font-size: var(--font-size-xs);
            color: var(--color-text-secondary);
            padding: var(--space-xs) var(--space-md) !important;
        }
        .summary-row:hover {
            background: rgba(59, 130, 246, 0.02);
        }

        /* Column Highlights */
        .text-recpam { color: var(--brand-secondary); }
        .highlight-recpam { background: rgba(16, 185, 129, 0.03) !important; }
        .highlight-rxt { background: rgba(59, 130, 246, 0.03) !important; }

        .cell-cuenta {
            min-width: 200px;
        }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-success { color: var(--color-success); }
        .text-error { color: var(--color-error); }
        .text-muted { color: var(--color-text-secondary); }
        .font-mono { font-family: var(--font-mono); }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }

        /* Responsive */
        @media (max-width: 768px) {
            .step3-valuation-card {
                grid-template-columns: 4px 1fr;
                grid-template-rows: auto auto auto;
            }
            .step3-results-block,
            .step3-action-container {
                grid-column: 2;
            }
        }
    `;
}
