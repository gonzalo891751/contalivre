/**
 * Step2RT6Panel - Panel component for Step 2 (Reexpresión RT6)
 *
 * Implements the UI from docs/prototypes/Reexpresion.html with:
 * - "Calcular automáticamente" card with action buttons
 * - Tabs for Monetarias / No Monetarias
 * - Section-colored accordion for rubros (Activo/Pasivo/PN)
 * - Expandable rows for account details
 */

import { useState, useMemo, Fragment } from 'react';
import type { Account } from '../../../core/models';
import type { AccountBalance } from '../../../core/ledger/computeBalances';
import type { ComputedPartidaRT6, AccountOverride, IndexRow } from '../../../core/cierre-valuacion/types';
import {
    formatCurrencyARS,
    formatCoef,
    getGroupFromCode,
} from '../../../core/cierre-valuacion';
import {
    getInitialMonetaryClass,
    applyOverrides,
    isExcluded,
    getAccountType,
    type MonetaryClass,
} from '../../../core/cierre-valuacion/monetary-classification';

// ============================================
// Types
// ============================================

interface Step2RT6PanelProps {
    // Data
    accounts: Account[];
    balances: Map<string, AccountBalance>;
    overrides: Record<string, AccountOverride>;
    indices: IndexRow[];
    closingDate: string;
    computedRT6: ComputedPartidaRT6[];
    lastAnalysis?: string;

    // Handlers
    onAnalyzeMayor: () => void;
    onRecalculate: () => void;
    onOpenMetodoIndirecto: () => void;
    onToggleClassification: (accountId: string, currentClass: MonetaryClass) => void;
    onAddPartida: () => void;
    onEditPartida: (id: string) => void;
    onDeletePartida: (id: string) => void;

    // Loading state
    isAnalyzing?: boolean;
}

type TabId = 'monetarias' | 'nomonetarias';

interface MonetaryAccount {
    account: Account;
    balance: number;
    classification: MonetaryClass;
    isAuto: boolean;
}

const GROUP_ORDER = ['ACTIVO', 'PASIVO', 'PN'] as const;
const GROUP_LABELS: Record<string, string> = {
    ACTIVO: 'ACTIVO',
    PASIVO: 'PASIVO',
    PN: 'PATRIMONIO NETO',
};

const GROUP_COLORS: Record<string, { border: string; bg: string; text: string }> = {
    ACTIVO: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-600' },
    PASIVO: { border: 'border-l-amber-500', bg: 'bg-amber-50', text: 'text-amber-600' },
    PN: { border: 'border-l-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

// Special rubros that need visual emphasis
const CAPITAL_RUBROS = ['capital social', 'capital', 'ajuste de capital'];

function isCapitalRubro(rubroLabel: string): boolean {
    return CAPITAL_RUBROS.includes(rubroLabel.toLowerCase());
}

// ============================================
// Main Component
// ============================================

export function Step2RT6Panel({
    accounts,
    balances,
    overrides,
    indices: _indices,
    closingDate: _closingDate,
    computedRT6,
    lastAnalysis,
    onAnalyzeMayor,
    onRecalculate,
    onOpenMetodoIndirecto,
    onToggleClassification,
    onAddPartida,
    onEditPartida,
    onDeletePartida,
    isAnalyzing = false,
}: Step2RT6PanelProps) {
    const [activeTab, setActiveTab] = useState<TabId>('monetarias');
    const [expandedRubros, setExpandedRubros] = useState<Set<string>>(new Set());
    const [expandedPartidas, setExpandedPartidas] = useState<Set<string>>(new Set());

    // ============================================
    // Classify accounts into Monetary / Non-Monetary
    // ============================================
    const { activosMon, pasivosMon, totalsMon } = useMemo(() => {
        const activosMon: MonetaryAccount[] = [];
        const pasivosMon: MonetaryAccount[] = [];

        for (const account of accounts) {
            if (account.isHeader) continue;
            if (isExcluded(account.id, overrides)) continue;

            const initialClass = getInitialMonetaryClass(account);
            const finalClass = applyOverrides(account.id, initialClass, overrides);

            if (finalClass !== 'MONETARY') continue;

            const balance = balances.get(account.id);
            if (!balance || balance.balance === 0) continue;

            const monetaryAcc: MonetaryAccount = {
                account,
                balance: Math.abs(balance.balance),
                classification: finalClass,
                isAuto: !overrides[account.id]?.classification,
            };

            const accountType = getAccountType(account);
            if (accountType === 'ACTIVO') {
                activosMon.push(monetaryAcc);
            } else if (accountType === 'PASIVO') {
                pasivosMon.push(monetaryAcc);
            }
        }

        const totalActivosMon = activosMon.reduce((sum, a) => sum + a.balance, 0);
        const totalPasivosMon = pasivosMon.reduce((sum, a) => sum + a.balance, 0);
        const netoMon = totalActivosMon - totalPasivosMon;

        return {
            activosMon,
            pasivosMon,
            totalsMon: { totalActivosMon, totalPasivosMon, netoMon },
        };
    }, [accounts, balances, overrides]);

    // ============================================
    // Group No Monetarias by Grupo > Rubro
    // ============================================
    const groupedNoMon = useMemo(() => {
        const groups: Record<string, Record<string, ComputedPartidaRT6[]>> = {};
        for (const grupo of GROUP_ORDER) {
            groups[grupo] = {};
        }

        for (const partida of computedRT6) {
            const grupo = getGroupFromCode(partida.cuentaCodigo || '') || 'ACTIVO';
            if (grupo === 'RESULTADOS') continue; // Skip results

            const rubro = partida.rubroLabel || 'Sin rubro';
            if (!groups[grupo]) groups[grupo] = {};
            if (!groups[grupo][rubro]) groups[grupo][rubro] = [];
            groups[grupo][rubro].push(partida);
        }

        return groups;
    }, [computedRT6]);

    // ============================================
    // Counts
    // ============================================
    const monetariasCount = activosMon.length + pasivosMon.length;
    const noMonetariasCount = computedRT6.length;

    // ============================================
    // Handlers
    // ============================================
    const toggleRubro = (rubroKey: string) => {
        setExpandedRubros(prev => {
            const next = new Set(prev);
            if (next.has(rubroKey)) {
                next.delete(rubroKey);
            } else {
                next.add(rubroKey);
            }
            return next;
        });
    };

    const togglePartida = (partidaId: string) => {
        setExpandedPartidas(prev => {
            const next = new Set(prev);
            if (next.has(partidaId)) {
                next.delete(partidaId);
            } else {
                next.add(partidaId);
            }
            return next;
        });
    };

    // ============================================
    // Render
    // ============================================
    return (
        <div className="rt6-panel">
            {/* Action Card: Calcular Automáticamente */}
            <div className="rt6-action-card">
                <div className="rt6-action-left">
                    <div className="rt6-action-icon">
                        <i className="ph-duotone ph-magic-wand" />
                    </div>
                    <div className="rt6-action-text">
                        <h2 className="rt6-action-title">Calcular automáticamente</h2>
                        <p className="rt6-action-desc">
                            Calculamos y sugerimos la clasificación RT6 automáticamente a partir de los saldos del período.
                            {lastAnalysis && (
                                <span className="rt6-last-analysis">
                                    Última imp: {lastAnalysis}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="rt6-action-buttons">
                    <button
                        className="rt6-btn rt6-btn-outline"
                        onClick={onOpenMetodoIndirecto}
                    >
                        <i className="ph-bold ph-function" />
                        Método indirecto
                    </button>
                    <button
                        className="rt6-btn rt6-btn-secondary"
                        onClick={onRecalculate}
                        disabled={isAnalyzing}
                    >
                        Recalcular
                    </button>
                    <button
                        className="rt6-btn rt6-btn-primary"
                        onClick={onAnalyzeMayor}
                        disabled={isAnalyzing}
                    >
                        <i className="ph-bold ph-arrows-clockwise" />
                        {isAnalyzing ? 'Analizando...' : 'Analizar Mayor'}
                    </button>
                </div>
            </div>

            {/* Tabs Container */}
            <div className="rt6-tabs-container">
                {/* Tab Headers */}
                <div className="rt6-tabs-header">
                    <button
                        className={`rt6-tab ${activeTab === 'monetarias' ? 'active' : ''}`}
                        onClick={() => setActiveTab('monetarias')}
                    >
                        <i className="ph-fill ph-currency-dollar" />
                        Partidas Monetarias
                        <span className={`rt6-tab-badge ${activeTab === 'monetarias' ? 'active' : ''}`}>
                            {monetariasCount}
                        </span>
                    </button>
                    <button
                        className={`rt6-tab ${activeTab === 'nomonetarias' ? 'active' : ''}`}
                        onClick={() => setActiveTab('nomonetarias')}
                    >
                        <i className="ph ph-package" />
                        Partidas No Monetarias
                        <span className={`rt6-tab-badge ${activeTab === 'nomonetarias' ? 'active' : ''}`}>
                            {noMonetariasCount}
                        </span>
                    </button>
                </div>

                {/* Tab Content: Monetarias */}
                {activeTab === 'monetarias' && (
                    <div className="rt6-tab-content">
                        {/* Summary Bar */}
                        <div className="rt6-summary-bar">
                            <div className="rt6-summary-stats">
                                <div className="rt6-summary-item">
                                    <span className="rt6-summary-label">Activo Mon.</span>
                                    <span className="rt6-summary-value text-blue-600">
                                        {formatCurrencyARS(totalsMon.totalActivosMon)}
                                    </span>
                                </div>
                                <div className="rt6-summary-divider" />
                                <div className="rt6-summary-item">
                                    <span className="rt6-summary-label">Pasivo Mon.</span>
                                    <span className="rt6-summary-value text-amber-600">
                                        {formatCurrencyARS(totalsMon.totalPasivosMon)}
                                    </span>
                                </div>
                                <div className="rt6-summary-divider" />
                                <div className="rt6-summary-item">
                                    <span className="rt6-summary-label">Neto (RECPAM)</span>
                                    <span className="rt6-summary-value font-bold">
                                        {formatCurrencyARS(totalsMon.netoMon)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Empty State */}
                        {monetariasCount === 0 && (
                            <div className="rt6-empty-state">
                                <i className="ph-duotone ph-currency-dollar rt6-empty-icon" />
                                <p>No hay partidas monetarias clasificadas.</p>
                                <p className="text-muted">Hacé click en "Analizar Mayor" para clasificar automáticamente.</p>
                            </div>
                        )}

                        {/* Two Column Grid */}
                        {monetariasCount > 0 && (
                            <div className="rt6-mon-grid">
                                {/* Activos Monetarios */}
                                <div className="rt6-mon-section">
                                    <div className="rt6-mon-header">
                                        <div className="rt6-mon-badge activo" />
                                        <h3 className="rt6-mon-title">Activos Monetarios</h3>
                                        <span className="rt6-mon-tooltip">
                                            <i className="ph-fill ph-question" />
                                        </span>
                                    </div>
                                    <div className="rt6-mon-table-wrap">
                                        <table className="rt6-mon-table">
                                            <thead>
                                                <tr>
                                                    <th>Cuenta</th>
                                                    <th className="text-right">Saldo</th>
                                                    <th className="text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activosMon.map((item) => (
                                                    <MonetaryRow
                                                        key={item.account.id}
                                                        item={item}
                                                        onToggle={() => onToggleClassification(item.account.id, item.classification)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pasivos Monetarios */}
                                <div className="rt6-mon-section">
                                    <div className="rt6-mon-header">
                                        <div className="rt6-mon-badge pasivo" />
                                        <h3 className="rt6-mon-title">Pasivos Monetarios</h3>
                                    </div>
                                    <div className="rt6-mon-table-wrap">
                                        <table className="rt6-mon-table">
                                            <thead>
                                                <tr>
                                                    <th>Cuenta</th>
                                                    <th className="text-right">Saldo</th>
                                                    <th className="text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pasivosMon.map((item) => (
                                                    <MonetaryRow
                                                        key={item.account.id}
                                                        item={item}
                                                        onToggle={() => onToggleClassification(item.account.id, item.classification)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab Content: No Monetarias */}
                {activeTab === 'nomonetarias' && (
                    <div className="rt6-tab-content rt6-tab-content-nomon">
                        {/* Header */}
                        <div className="rt6-nomon-header">
                            <h3 className="rt6-nomon-title">Ajuste por Índice (RT6)</h3>
                            <button className="rt6-btn-add" onClick={onAddPartida}>
                                + Agregar partida manual
                            </button>
                        </div>

                        {/* Empty State */}
                        {noMonetariasCount === 0 && (
                            <div className="rt6-empty-state">
                                <i className="ph-duotone ph-package rt6-empty-icon" />
                                <p>No hay partidas no monetarias cargadas.</p>
                                <button className="rt6-btn rt6-btn-primary" onClick={onAddPartida}>
                                    + Agregar primera partida
                                </button>
                            </div>
                        )}

                        {/* Accordion by Grupo > Rubro */}
                        {GROUP_ORDER.map((grupo) => {
                            const rubros = groupedNoMon[grupo];
                            const rubroKeys = Object.keys(rubros);
                            if (rubroKeys.length === 0) return null;

                            const colors = GROUP_COLORS[grupo];

                            return (
                                <div key={grupo} className="rt6-grupo-section">
                                    {rubroKeys.map((rubro) => {
                                        const partidas = rubros[rubro];
                                        const rubroKey = `${grupo}-${rubro}`;
                                        const isExpanded = expandedRubros.has(rubroKey);
                                        const rubroTotal = partidas.reduce((s, p) => s + p.totalBase, 0);
                                        const rubroHomog = partidas.reduce((s, p) => s + p.totalHomog, 0);
                                        const rubroAjuste = rubroHomog - rubroTotal;
                                        const isCapital = isCapitalRubro(rubro);

                                        return (
                                            <div
                                                key={rubroKey}
                                                className={`rt6-rubro-card border-l-4 ${colors.border} ${isCapital ? 'rt6-rubro-capital' : ''}`}
                                            >
                                                {/* Rubro Header */}
                                                <div
                                                    className="rt6-rubro-header"
                                                    onClick={() => toggleRubro(rubroKey)}
                                                >
                                                    <div className="rt6-rubro-left">
                                                        <button className="rt6-rubro-caret">
                                                            <i className={`ph-bold ph-caret-right ${isExpanded ? 'rotate-90' : ''}`} />
                                                        </button>
                                                        <div className="rt6-rubro-info">
                                                            <div className="rt6-rubro-title">
                                                                <span className={`rt6-grupo-badge ${colors.bg} ${colors.text}`}>
                                                                    {GROUP_LABELS[grupo]}
                                                                </span>
                                                                {rubro}
                                                                {isCapital && (
                                                                    <span className="rt6-capital-badge">
                                                                        <i className="ph-fill ph-bank" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="rt6-rubro-meta">
                                                                {partidas.length} cuenta{partidas.length !== 1 ? 's' : ''} sugerida{partidas.length !== 1 ? 's' : ''} del mayor
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="rt6-rubro-right-multi">
                                                        <div className="rt6-rubro-col">
                                                            <div className="rt6-rubro-total">{formatCurrencyARS(rubroTotal)}</div>
                                                            <div className="rt6-rubro-label">V. Origen</div>
                                                        </div>
                                                        {isCapital && rubroAjuste !== 0 && (
                                                            <div className="rt6-rubro-col rt6-ajuste-col">
                                                                <div className={`rt6-ajuste-value ${rubroAjuste >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                    {rubroAjuste >= 0 ? '+' : ''}{formatCurrencyARS(rubroAjuste)}
                                                                </div>
                                                                <div className="rt6-rubro-label">Ajuste Capital</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Rubro Content (Expanded) */}
                                                {isExpanded && (
                                                    <div className="rt6-rubro-content">
                                                        <table className="rt6-rubro-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Cuenta</th>
                                                                    <th className="text-center">F. Origen</th>
                                                                    <th className="text-right">V. Origen</th>
                                                                    <th className="text-right">Coef.</th>
                                                                    <th className="text-right">V. Homog.</th>
                                                                    <th className="text-right">Ajuste / Acciones</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {partidas.map((partida) => {
                                                                    const hasMultipleLots = partida.itemsComputed.length > 1;
                                                                    const isPartidaExpanded = expandedPartidas.has(partida.id);

                                                                    // For single lot, show values directly
                                                                    const singleLot = partida.itemsComputed[0];
                                                                    const displayCoef = hasMultipleLots
                                                                        ? `${partida.itemsComputed.length} orígenes`
                                                                        : formatCoef(singleLot?.coef ?? 1);
                                                                    const displayFecha = hasMultipleLots
                                                                        ? ''
                                                                        : (singleLot?.fechaOrigen?.substring(0, 7) || '-');

                                                                    return (
                                                                        <Fragment key={partida.id}>
                                                                            <tr className={`rt6-rubro-row ${hasMultipleLots ? 'rt6-row-expandable' : ''}`}>
                                                                                <td className="rt6-cuenta-cell">
                                                                                    <div className="rt6-cuenta-flex">
                                                                                        {hasMultipleLots && (
                                                                                            <button
                                                                                                className="rt6-expand-btn"
                                                                                                onClick={() => togglePartida(partida.id)}
                                                                                                title={isPartidaExpanded ? 'Colapsar' : 'Expandir'}
                                                                                            >
                                                                                                <i className={`ph-bold ph-caret-right ${isPartidaExpanded ? 'rotate-90' : ''}`} />
                                                                                            </button>
                                                                                        )}
                                                                                        <span>{partida.cuentaNombre}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="text-center font-mono text-muted">
                                                                                    {displayFecha}
                                                                                </td>
                                                                                <td className="text-right font-mono">
                                                                                    {formatCurrencyARS(partida.totalBase)}
                                                                                </td>
                                                                                <td className="text-right font-mono text-muted">
                                                                                    {hasMultipleLots ? (
                                                                                        <span className="rt6-lots-badge">{displayCoef}</span>
                                                                                    ) : displayCoef}
                                                                                </td>
                                                                                <td className="text-right font-mono font-semibold text-blue-600">
                                                                                    {formatCurrencyARS(partida.totalHomog)}
                                                                                </td>
                                                                                <td className="text-right">
                                                                                    <button
                                                                                        className="rt6-action-btn"
                                                                                        onClick={() => onEditPartida(partida.id)}
                                                                                        title="Editar"
                                                                                    >
                                                                                        <i className="ph-bold ph-pencil-simple" />
                                                                                    </button>
                                                                                    <button
                                                                                        className="rt6-action-btn rt6-action-btn-danger"
                                                                                        onClick={() => onDeletePartida(partida.id)}
                                                                                        title="Eliminar"
                                                                                    >
                                                                                        <i className="ph-bold ph-trash" />
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                            {/* Drilldown rows for multiple lots */}
                                                                            {hasMultipleLots && isPartidaExpanded && partida.itemsComputed.map((lot, lotIdx) => (
                                                                                <tr key={`${partida.id}-lot-${lot.id}`} className="rt6-drilldown-row">
                                                                                    <td className="rt6-drilldown-cuenta">
                                                                                        <span className="rt6-drilldown-label">
                                                                                            Lote {lotIdx + 1}
                                                                                            {lot.notas && <span className="rt6-drilldown-note"> - {lot.notas}</span>}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="text-center font-mono text-muted">
                                                                                        {lot.fechaOrigen?.substring(0, 7) || '-'}
                                                                                    </td>
                                                                                    <td className="text-right font-mono">
                                                                                        {formatCurrencyARS(lot.importeBase)}
                                                                                    </td>
                                                                                    <td className="text-right font-mono text-muted">
                                                                                        {formatCoef(lot.coef)}
                                                                                    </td>
                                                                                    <td className="text-right font-mono">
                                                                                        {formatCurrencyARS(lot.homog)}
                                                                                    </td>
                                                                                    <td className="text-right font-mono text-emerald-600">
                                                                                        {lot.homog - lot.importeBase >= 0 ? '+' : ''}{formatCurrencyARS(lot.homog - lot.importeBase)}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </Fragment>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Styles */}
            <style>{`
                .rt6-panel {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }

                /* Action Card */
                .rt6-action-card {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    justify-content: space-between;
                    gap: var(--space-md);
                    padding: var(--space-lg);
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .rt6-action-left {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--space-md);
                }
                .rt6-action-icon {
                    display: none;
                    padding: 12px;
                    background: #EFF6FF;
                    border-radius: 8px;
                    color: #3B82F6;
                    font-size: 1.5rem;
                }
                @media (min-width: 640px) {
                    .rt6-action-icon { display: block; }
                }
                .rt6-action-title {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 700;
                    font-size: 1.125rem;
                    margin: 0;
                    color: #0F172A;
                }
                .rt6-action-desc {
                    margin: 4px 0 0;
                    font-size: 0.875rem;
                    color: #6B7280;
                    max-width: 36rem;
                }
                .rt6-last-analysis {
                    display: inline-block;
                    margin-left: 8px;
                    padding: 2px 8px;
                    background: #F3F4F6;
                    border: 1px solid #E5E7EB;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    color: #6B7280;
                }
                .rt6-action-buttons {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                /* Buttons */
                .rt6-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                    border: none;
                }
                .rt6-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .rt6-btn-primary {
                    background: #3B82F6;
                    color: white;
                    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
                }
                .rt6-btn-primary:hover:not(:disabled) {
                    background: #2563EB;
                }
                .rt6-btn-secondary {
                    background: #F1F5F9;
                    color: #334155;
                    border: 1px solid #E5E7EB;
                }
                .rt6-btn-secondary:hover:not(:disabled) {
                    background: #E2E8F0;
                }
                .rt6-btn-outline {
                    background: white;
                    color: #475569;
                    border: 1px solid #E5E7EB;
                    border-radius: 9999px;
                }
                .rt6-btn-outline:hover {
                    border-color: rgba(59, 130, 246, 0.5);
                    color: #3B82F6;
                }
                .rt6-btn-outline i {
                    color: #9CA3AF;
                    transition: color 0.15s;
                }
                .rt6-btn-outline:hover i {
                    color: #3B82F6;
                }
                .rt6-btn-add {
                    background: none;
                    border: none;
                    color: #3B82F6;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    transition: all 0.15s;
                }
                .rt6-btn-add:hover {
                    background: white;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                /* Tabs Container */
                .rt6-tabs-container {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 12px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    overflow: hidden;
                    min-height: 500px;
                }
                .rt6-tabs-header {
                    display: flex;
                    border-bottom: 1px solid #E5E7EB;
                }
                .rt6-tab {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 16px;
                    background: none;
                    border: none;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #6B7280;
                    cursor: pointer;
                    transition: all 0.15s;
                    border-bottom: 2px solid transparent;
                }
                .rt6-tab:hover {
                    color: #334155;
                    background: #F9FAFB;
                }
                .rt6-tab.active {
                    font-weight: 600;
                    color: #3B82F6;
                    border-bottom-color: #3B82F6;
                    background: rgba(59, 130, 246, 0.05);
                }
                .rt6-tab i {
                    font-size: 1rem;
                }
                .rt6-tab-badge {
                    padding: 2px 8px;
                    border-radius: 9999px;
                    font-size: 0.65rem;
                    font-weight: 600;
                    background: #E5E7EB;
                    color: #475569;
                }
                .rt6-tab-badge.active {
                    background: #3B82F6;
                    color: white;
                }

                /* Tab Content */
                .rt6-tab-content {
                    padding: var(--space-lg);
                }
                .rt6-tab-content-nomon {
                    background: #F9FAFB;
                    min-height: 500px;
                }

                /* Summary Bar */
                .rt6-summary-bar {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    align-items: center;
                    gap: var(--space-md);
                    padding: 12px 16px;
                    background: #F9FAFB;
                    border: 1px solid #F3F4F6;
                    border-radius: 8px;
                    margin-bottom: var(--space-lg);
                }
                .rt6-summary-stats {
                    display: flex;
                    align-items: center;
                    gap: var(--space-lg);
                }
                .rt6-summary-item {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .rt6-summary-label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #6B7280;
                }
                .rt6-summary-value {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 1rem;
                    font-weight: 700;
                }
                .rt6-summary-divider {
                    width: 1px;
                    height: 1.5rem;
                    background: #D1D5DB;
                }

                /* Empty State */
                .rt6-empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-xl) var(--space-lg);
                    text-align: center;
                }
                .rt6-empty-icon {
                    font-size: 3rem;
                    color: #D1D5DB;
                }
                .rt6-empty-state p {
                    margin: 0;
                    color: #6B7280;
                }
                .text-muted {
                    color: #9CA3AF;
                    font-size: 0.875rem;
                }

                /* Monetary Grid */
                .rt6-mon-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                    gap: var(--space-xl);
                }
                .rt6-mon-section {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .rt6-mon-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .rt6-mon-badge {
                    width: 4px;
                    height: 20px;
                    border-radius: 2px;
                }
                .rt6-mon-badge.activo { background: #3B82F6; }
                .rt6-mon-badge.pasivo { background: #F59E0B; }
                .rt6-mon-title {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    margin: 0;
                    color: #1E293B;
                }
                .rt6-mon-tooltip {
                    margin-left: auto;
                    color: #D1D5DB;
                    cursor: help;
                }
                .rt6-mon-tooltip:hover { color: #3B82F6; }

                /* Monetary Table */
                .rt6-mon-table-wrap {
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .rt6-mon-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                }
                .rt6-mon-table thead {
                    background: #F9FAFB;
                    border-bottom: 1px solid #E5E7EB;
                }
                .rt6-mon-table th {
                    padding: 8px 12px;
                    font-size: 0.65rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #6B7280;
                    text-align: left;
                }
                .rt6-mon-table td {
                    padding: 12px;
                    border-bottom: 1px solid #F3F4F6;
                }
                .rt6-mon-row {
                    transition: background 0.15s;
                }
                .rt6-mon-row:hover {
                    background: #F9FAFB;
                }
                .rt6-mon-row-pending {
                    background: rgba(251, 191, 36, 0.05);
                }
                .rt6-mon-row-pending:hover {
                    background: rgba(251, 191, 36, 0.1);
                }
                .rt6-account-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .rt6-account-name {
                    font-weight: 500;
                    color: #334155;
                }
                .rt6-account-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .rt6-account-code {
                    font-size: 0.65rem;
                    font-family: 'JetBrains Mono', monospace;
                    color: #9CA3AF;
                }
                .rt6-badge-auto {
                    font-size: 0.6rem;
                    padding: 2px 6px;
                    background: #DBEAFE;
                    color: #1D4ED8;
                    border: 1px solid #93C5FD;
                    border-radius: 4px;
                    font-weight: 600;
                }

                /* Action Buttons (in rows) */
                .rt6-row-actions {
                    display: flex;
                    gap: 4px;
                    opacity: 0;
                    transition: opacity 0.15s;
                }
                .rt6-mon-row:hover .rt6-row-actions,
                .rt6-rubro-row:hover .rt6-action-btn {
                    opacity: 1;
                }
                .rt6-action-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: none;
                    color: #6B7280;
                    cursor: pointer;
                    border-radius: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                    opacity: 0;
                }
                .rt6-action-btn:hover {
                    background: white;
                    color: #3B82F6;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .rt6-action-btn-danger:hover {
                    color: #EF4444;
                }
                .rt6-rubro-row:hover .rt6-action-btn {
                    opacity: 1;
                }

                /* No Monetarias Header */
                .rt6-nomon-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-md);
                }
                .rt6-nomon-title {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 700;
                    font-size: 1rem;
                    margin: 0;
                    color: #334155;
                }

                /* Rubro Card */
                .rt6-rubro-card {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    overflow: hidden;
                }
                .rt6-rubro-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .rt6-rubro-header:hover {
                    background: #F9FAFB;
                }
                .rt6-rubro-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .rt6-rubro-caret {
                    border: none;
                    background: none;
                    color: #9CA3AF;
                    cursor: pointer;
                    padding: 0;
                    transition: color 0.15s, transform 0.15s;
                }
                .rt6-rubro-caret:hover { color: #3B82F6; }
                .rt6-rubro-caret i {
                    transition: transform 0.2s;
                }
                .rt6-rubro-caret i.rotate-90 {
                    transform: rotate(90deg);
                }
                .rt6-rubro-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .rt6-rubro-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 700;
                    color: #1E293B;
                }
                .rt6-grupo-badge {
                    font-size: 0.6rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    padding: 2px 8px;
                    border-radius: 4px;
                }
                .rt6-rubro-meta {
                    font-size: 0.75rem;
                    color: #6B7280;
                }
                .rt6-rubro-right {
                    text-align: right;
                }
                .rt6-rubro-total {
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 600;
                    font-size: 1rem;
                    color: #0F172A;
                }
                .rt6-rubro-label {
                    font-size: 0.6rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #9CA3AF;
                }

                /* Rubro Content */
                .rt6-rubro-content {
                    border-top: 1px solid #F3F4F6;
                    background: rgba(249, 250, 251, 0.5);
                    overflow-x: auto;
                }
                .rt6-rubro-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                }
                .rt6-rubro-table thead {
                    background: #F3F4F6;
                }
                .rt6-rubro-table th {
                    padding: 8px 16px;
                    font-size: 0.65rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #6B7280;
                    text-align: left;
                }
                .rt6-rubro-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #E5E7EB;
                }
                .rt6-rubro-row {
                    background: white;
                    transition: background 0.15s;
                }
                .rt6-rubro-row:hover {
                    background: #F9FAFB;
                }
                .rt6-cuenta-cell {
                    font-weight: 500;
                    color: #334155;
                }
                .rt6-cuenta-flex {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .rt6-expand-btn {
                    width: 20px;
                    height: 20px;
                    padding: 0;
                    border: none;
                    background: none;
                    color: #6B7280;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.15s;
                }
                .rt6-expand-btn:hover {
                    color: #3B82F6;
                }
                .rt6-expand-btn i {
                    transition: transform 0.2s;
                }
                .rt6-expand-btn i.rotate-90 {
                    transform: rotate(90deg);
                }
                .rt6-row-expandable {
                    cursor: pointer;
                }
                .rt6-lots-badge {
                    font-size: 0.7rem;
                    padding: 2px 8px;
                    background: #F3F4F6;
                    border: 1px solid #E5E7EB;
                    border-radius: 9999px;
                    color: #6B7280;
                }
                /* Drilldown Rows */
                .rt6-drilldown-row {
                    background: #F9FAFB;
                }
                .rt6-drilldown-row td {
                    padding: 8px 16px;
                    border-bottom: 1px solid #F3F4F6;
                    font-size: 0.8125rem;
                }
                .rt6-drilldown-cuenta {
                    padding-left: 40px !important;
                }
                .rt6-drilldown-label {
                    color: #6B7280;
                }
                .rt6-drilldown-note {
                    font-style: italic;
                    color: #9CA3AF;
                }
                .text-emerald-600 {
                    color: #059669;
                }
                .text-red-600 {
                    color: #DC2626;
                }
                /* Capital Rubro special treatment */
                .rt6-rubro-capital {
                    background: linear-gradient(to right, rgba(16, 185, 129, 0.03), white);
                }
                .rt6-capital-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    background: rgba(16, 185, 129, 0.1);
                    color: #059669;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .rt6-rubro-right-multi {
                    display: flex;
                    align-items: flex-end;
                    gap: var(--space-lg);
                }
                .rt6-rubro-col {
                    text-align: right;
                }
                .rt6-ajuste-col {
                    min-width: 100px;
                }
                .rt6-ajuste-value {
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 700;
                    font-size: 0.9rem;
                }

                /* Utility Classes */
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .text-blue-600 { color: #2563EB; }
                .text-amber-600 { color: #D97706; }
                .font-mono { font-family: 'JetBrains Mono', monospace; }
                .font-semibold { font-weight: 600; }
                .font-bold { font-weight: 700; }
                .bg-blue-50 { background: #EFF6FF; }
                .bg-amber-50 { background: #FFFBEB; }
                .bg-emerald-50 { background: #ECFDF5; }
                .border-l-blue-500 { border-left-color: #3B82F6; }
                .border-l-amber-500 { border-left-color: #F59E0B; }
                .border-l-emerald-500 { border-left-color: #10B981; }
            `}</style>
        </div>
    );
}

// ============================================
// Sub-Components
// ============================================

interface MonetaryRowProps {
    item: MonetaryAccount;
    onToggle: () => void;
}

function MonetaryRow({ item, onToggle }: MonetaryRowProps) {
    const isPending = item.isAuto;

    return (
        <tr className={`rt6-mon-row ${isPending ? 'rt6-mon-row-pending' : ''}`}>
            <td>
                <div className="rt6-account-cell">
                    <div className="rt6-account-name">{item.account.name}</div>
                    <div className="rt6-account-meta">
                        <span className="rt6-account-code">{item.account.code}</span>
                        {item.isAuto && <span className="rt6-badge-auto">AUTO</span>}
                    </div>
                </div>
            </td>
            <td className="text-right font-mono">
                {formatCurrencyARS(item.balance)}
            </td>
            <td className="text-center">
                <div className="rt6-row-actions">
                    <button
                        className="rt6-action-btn"
                        onClick={onToggle}
                        title="Reclasificar como No Monetaria"
                    >
                        <i className="ph-bold ph-pencil-simple" />
                    </button>
                </div>
            </td>
        </tr>
    );
}
