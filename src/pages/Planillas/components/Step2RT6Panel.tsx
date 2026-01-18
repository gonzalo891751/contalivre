/**
 * Step2RT6Panel - Panel component for Step 2 (Reexpresión RT6)
 * Matches the prototype valuacion2.html layout
 */

import { useMemo } from 'react';
import type { ComputedPartidaRT6 } from '../../../core/cierre-valuacion';
import {
    formatCurrencyARS,
    formatNumber,
    formatCoef,
    getGroupFromCode,
    getSubgroupFromCode,
} from '../../../core/cierre-valuacion';

interface Step2RT6PanelProps {
    computedRT6: ComputedPartidaRT6[];
    onAddPartida: () => void;
    onEditPartida: (id: string) => void;
    onDeletePartida: (id: string) => void;
}

const GROUP_ORDER = ['ACTIVO', 'PASIVO', 'PN', 'RESULTADOS'] as const;
const GROUP_LABELS: Record<string, string> = {
    ACTIVO: 'ACTIVO',
    PASIVO: 'PASIVO',
    PN: 'PATRIMONIO NETO',
    RESULTADOS: 'RESULTADOS',
};

export function Step2RT6Panel({
    computedRT6,
    onAddPartida,
    onEditPartida,
    onDeletePartida,
}: Step2RT6PanelProps) {
    // Group partidas by Group and then by Rubro
    const groupedData = useMemo(() => {
        const groups: Record<string, Record<string, ComputedPartidaRT6[]>> = {};

        for (const grupo of GROUP_ORDER) {
            groups[grupo] = {};
        }

        for (const partida of computedRT6) {
            const grupo = getGroupFromCode(partida.cuentaCodigo || '') || 'ACTIVO';
            const rubro = partida.rubroLabel || 'Sin rubro';

            if (!groups[grupo]) groups[grupo] = {};
            if (!groups[grupo][rubro]) groups[grupo][rubro] = [];
            groups[grupo][rubro].push(partida);
        }

        return groups;
    }, [computedRT6]);

    // Calculate group totals
    const groupTotals = useMemo(() => {
        const totals: Record<string, { base: number; homog: number; recpam: number }> = {};

        for (const grupo of GROUP_ORDER) {
            let base = 0;
            let homog = 0;
            let recpam = 0;

            const rubros = groupedData[grupo];
            if (rubros) {
                for (const rubro of Object.keys(rubros)) {
                    for (const p of rubros[rubro]) {
                        base += p.totalBase;
                        homog += p.totalHomog;
                        recpam += p.totalRecpam;
                    }
                }
            }

            totals[grupo] = { base, homog, recpam };
        }

        return totals;
    }, [groupedData]);

    return (
        <div className="step2-panel">
            {/* Info Banner */}
            <div className="step2-info-banner">
                <span className="step2-info-icon">ℹ️</span>
                <div className="step2-info-content">
                    <strong className="step2-info-title">Guía Rápida RT6</strong>
                    <p>
                        Cargá las partidas no monetarias. El sistema calculará automáticamente
                        el coeficiente según la fecha de origen y el RECPAM.
                    </p>
                </div>
            </div>

            {/* Main Card */}
            <div className="step2-main-card">
                <div className="step2-card-header">
                    <div>
                        <h2 className="step2-card-title">Partidas No Monetarias</h2>
                        <p className="step2-card-subtitle">
                            Detalle de cuentas ajustables por inflación
                        </p>
                    </div>
                    <button className="btn btn-secondary step2-add-btn" onClick={onAddPartida}>
                        <span>+</span> Agregar Partida
                    </button>
                </div>

                <div className="step2-content">
                    {computedRT6.length === 0 ? (
                        <div className="step2-empty-state">
                            <div className="step2-empty-icon">📋</div>
                            <p>No hay partidas cargadas.</p>
                            <button className="btn btn-primary" onClick={onAddPartida}>
                                + Agregar primera partida
                            </button>
                        </div>
                    ) : (
                        <>
                            {GROUP_ORDER.map((grupo) => {
                                const rubros = groupedData[grupo];
                                const rubroKeys = Object.keys(rubros);
                                if (rubroKeys.length === 0) return null;

                                const groupTotal = groupTotals[grupo];

                                return (
                                    <div key={grupo} className="step2-grupo-section">
                                        {/* Group Header */}
                                        <div className="step2-grupo-header">
                                            <h3 className="step2-grupo-title">
                                                <span className="step2-grupo-dot" />
                                                {GROUP_LABELS[grupo] || grupo}
                                            </h3>
                                            <div className="step2-grupo-totals">
                                                <span className="step2-grupo-label">RECPAM Grupo:</span>
                                                <span
                                                    className={`step2-grupo-value font-mono ${groupTotal.recpam >= 0 ? 'positive' : 'negative'
                                                        }`}
                                                >
                                                    {formatCurrencyARS(groupTotal.recpam)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Rubro Cards */}
                                        {rubroKeys.map((rubro) => {
                                            const partidas = rubros[rubro];
                                            const rubroBase = partidas.reduce((s, p) => s + p.totalBase, 0);
                                            const rubroHomog = partidas.reduce((s, p) => s + p.totalHomog, 0);
                                            const rubroRecpam = rubroHomog - rubroBase;

                                            return (
                                                <div key={rubro} className="step2-rubro-card">
                                                    <div className="step2-rubro-header">
                                                        <span className="step2-rubro-title">{rubro}</span>
                                                        <span className="step2-rubro-total font-mono">
                                                            Total Rubro: {formatNumber(rubroHomog)}
                                                        </span>
                                                    </div>

                                                    <div className="step2-table-container">
                                                        <table className="step2-table">
                                                            <thead>
                                                                <tr>
                                                                    <th className="cell-date">Origen</th>
                                                                    <th className="cell-cuenta">Cuenta</th>
                                                                    <th className="text-right cell-number">V. Origen</th>
                                                                    <th className="text-right cell-number coef-col" title="Coeficiente = Índice Cierre / Índice Origen">Coef. ℹ️</th>
                                                                    <th className="text-right cell-number">V. Homog.</th>
                                                                    <th className="text-right cell-number">RECPAM</th>
                                                                    <th className="action-col"></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {partidas.map((partida) => {
                                                                    const subGroup = getSubgroupFromCode(partida.cuentaCodigo || '');
                                                                    return partida.itemsComputed.map((item, idx) => (
                                                                        <tr key={`${partida.id}-${item.id}`} className="step2-row">
                                                                            <td className="font-mono text-muted text-sm">
                                                                                {item.fechaOrigen.split('-').reverse().join('/')}
                                                                            </td>
                                                                            <td>
                                                                                {idx === 0 && (
                                                                                    <div className="step2-cuenta-cell">
                                                                                        <span className="step2-cuenta-name">
                                                                                            {partida.cuentaNombre}
                                                                                        </span>
                                                                                        {subGroup !== 'NA' && (
                                                                                            <span
                                                                                                className={`badge badge-sm ${subGroup === 'CORRIENTE' ? 'badge-blue' : 'badge-orange'
                                                                                                    }`}
                                                                                            >
                                                                                                {subGroup === 'CORRIENTE' ? 'C' : 'NC'}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="text-right font-mono tabular-nums">
                                                                                {formatNumber(item.importeBase)}
                                                                            </td>
                                                                            <td className="text-right font-mono tabular-nums coef-cell">
                                                                                {formatCoef(item.coef)}
                                                                            </td>
                                                                            <td className="text-right font-mono tabular-nums font-bold">
                                                                                {formatNumber(item.homog)}
                                                                            </td>
                                                                            <td
                                                                                className={`text-right font-mono tabular-nums ${item.homog - item.importeBase >= 0 ? 'text-success' : 'text-error'
                                                                                    }`}
                                                                            >
                                                                                {formatNumber(item.homog - item.importeBase)}
                                                                            </td>
                                                                            <td className="step2-actions">
                                                                                {idx === 0 && (
                                                                                    <>
                                                                                        <button
                                                                                            className="btn-icon-sm"
                                                                                            onClick={() => onEditPartida(partida.id)}
                                                                                            title="Editar"
                                                                                        >
                                                                                            ✏️
                                                                                        </button>
                                                                                        <button
                                                                                            className="btn-icon-sm"
                                                                                            onClick={() => onDeletePartida(partida.id)}
                                                                                            title="Eliminar"
                                                                                        >
                                                                                            🗑️
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ));
                                                                })}
                                                                {/* Subtotal Row */}
                                                                <tr className="step2-subtotal-row">
                                                                    <td colSpan={2} className="text-right text-muted text-xs">
                                                                        Subtotal
                                                                    </td>
                                                                    <td className="text-right font-mono tabular-nums text-muted">
                                                                        {formatNumber(rubroBase)}
                                                                    </td>
                                                                    <td></td>
                                                                    <td className="text-right font-mono tabular-nums font-bold">
                                                                        {formatNumber(rubroHomog)}
                                                                    </td>
                                                                    <td
                                                                        className={`text-right font-mono tabular-nums font-bold ${rubroRecpam >= 0 ? 'text-success' : 'text-error'
                                                                            }`}
                                                                    >
                                                                        {formatCurrencyARS(rubroRecpam)}
                                                                    </td>
                                                                    <td></td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .step2-panel {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-md);
                }

                /* Info Banner */
                .step2-info-banner {
                    display: flex;
                    gap: var(--space-sm);
                    padding: var(--space-md);
                    background: rgba(59, 130, 246, 0.05);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    border-radius: var(--radius-lg);
                }
                .step2-info-icon {
                    font-size: 1.25rem;
                }
                .step2-info-title {
                    color: var(--brand-primary);
                    display: block;
                    margin-bottom: var(--space-xs);
                }
                .step2-info-content p {
                    margin: 0;
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }

                /* Main Card */
                .step2-main-card {
                    background: var(--surface-1);
                    border-radius: var(--radius-xl);
                    border: 1px solid var(--color-border);
                    box-shadow: var(--shadow-sm);
                    overflow: hidden;
                }
                .step2-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md) var(--space-lg);
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--color-border);
                }
                .step2-card-title {
                    font-size: var(--font-size-xl);
                    font-weight: 700;
                    margin: 0;
                }
                .step2-card-subtitle {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    margin: var(--space-xs) 0 0 0;
                }
                .step2-add-btn {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                }
                .step2-add-btn span {
                    color: var(--brand-primary);
                    font-weight: 700;
                }

                /* Content */
                .step2-content {
                    padding: var(--space-lg);
                }
                .step2-empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-xl);
                    text-align: center;
                }
                .step2-empty-icon {
                    font-size: 3rem;
                    opacity: 0.5;
                }
                .step2-empty-state p {
                    color: var(--color-text-secondary);
                }

                /* Group Sections */
                .step2-grupo-section {
                    margin-bottom: var(--space-xl);
                }
                .step2-grupo-section:last-child {
                    margin-bottom: 0;
                }
                .step2-grupo-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: var(--space-sm);
                    border-bottom: 1px solid var(--color-border);
                    margin-bottom: var(--space-md);
                }
                .step2-grupo-title {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--color-text-secondary);
                    margin: 0;
                }
                .step2-grupo-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--color-border);
                }
                .step2-grupo-totals {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                }
                .step2-grupo-label {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                }
                .step2-grupo-value {
                    font-weight: 700;
                    font-size: var(--font-size-sm);
                }
                .step2-grupo-value.positive { color: var(--color-success); }
                .step2-grupo-value.negative { color: var(--color-error); }

                /* Rubro Cards */
                .step2-rubro-card {
                    background: var(--surface-1);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    margin-bottom: var(--space-md);
                    overflow: hidden;
                }
                .step2-rubro-card:last-child {
                    margin-bottom: 0;
                }
                .step2-rubro-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--color-border);
                }
                .step2-rubro-title {
                    font-weight: 600;
                    font-size: var(--font-size-sm);
                }
                .step2-rubro-total {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                }

                /* Table */
                .step2-table-container {
                    overflow-x: auto;
                }
                .step2-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: var(--font-size-sm);
                }
                .step2-table th {
                    padding: var(--space-xs) var(--space-md);
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--color-text-secondary);
                    border-bottom: 2px solid var(--color-border);
                    text-align: left;
                    vertical-align: bottom;
                }
                .step2-table td {
                    padding: var(--space-xs) var(--space-md);
                    border-bottom: 1px solid rgba(0,0,0,0.03);
                    vertical-align: middle;
                }
                .cell-date { width: 100px; }
                .cell-cuenta { min-width: 180px; }
                .cell-number { width: 110px; }
                .step2-row:hover {
                    background: var(--surface-2);
                }

                /* Coef Column Highlight */
                .coef-col {
                    background: rgba(59, 130, 246, 0.03);
                }
                .coef-cell {
                    color: var(--brand-primary);
                    background: rgba(59, 130, 246, 0.05);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-xs);
                }

                /* Cuenta Cell */
                .step2-cuenta-cell {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                }
                .step2-cuenta-name {
                    font-weight: 500;
                }

                /* Action Column */
                .action-col {
                    width: 60px;
                }
                .step2-actions {
                    display: flex;
                    gap: var(--space-xs);
                    opacity: 0;
                    transition: opacity 0.15s;
                }
                .step2-row:hover .step2-actions {
                    opacity: 1;
                }
                .btn-icon-sm {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
                    transition: background 0.15s;
                }
                .btn-icon-sm:hover {
                    background: var(--surface-3);
                }

                /* Subtotal Row */
                .step2-subtotal-row {
                    background: var(--surface-2);
                }
                .step2-subtotal-row td {
                    padding: var(--space-xs) var(--space-sm);
                    font-size: var(--font-size-xs);
                }

                /* Utility Classes */
                .tabular-nums { font-variant-numeric: tabular-nums; }
                .text-muted { color: var(--color-text-secondary); }
                .text-sm { font-size: var(--font-size-sm); }
                .text-xs { font-size: var(--font-size-xs); }
                .text-right { text-align: right; }
                .text-success { color: var(--color-success); }
                .text-error { color: var(--color-error); }
                .font-mono { font-family: var(--font-mono); }
                .font-bold { font-weight: 700; }
                .badge-sm { 
                    font-size: 0.6rem; 
                    padding: 1px 5px;
                    border-radius: var(--radius-sm);
                    font-weight: 600;
                }
                .badge-blue { background: #DBEAFE; color: #1D4ED8; }
                .badge-orange { background: #FEF3C7; color: #D97706; }
            `}</style>
        </div>
    );
}
