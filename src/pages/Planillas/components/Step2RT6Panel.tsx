/**
 * Step2RT6Panel - Panel component for Step 2 (Reexpresión RT6)
 *
 * Implements the UI from docs/prototypes/Reexpresion.html with:
 * - "Calcular automáticamente" card with action buttons
 * - Tabs for Monetarias / No Monetarias
 * - Section-colored accordion for rubros (Activo/Pasivo/PN)
 * - Expandable rows for account details
 */

import { useState, useMemo, Fragment, useCallback, useEffect } from 'react';
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
    isForeignCurrencyByCodeName,
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
    closingEntriesDetected?: boolean;
    closingEntriesCount?: number;

    // Handlers
    onAnalyzeMayor: () => void;
    onClearAll: () => void;
    onRecalculate: () => void;
    onOpenMetodoIndirecto: () => void;
    onToggleClassification: (accountId: string, currentClass: MonetaryClass) => void;
    onExcludeAccount: (accountId: string) => void;
    onAddMonetaryManual: (accountId: string) => void;
    onAddPartida: () => void;
    onEditPartida: (id: string) => void;
    onDeletePartida: (id: string) => void;

    // Loading state
    isAnalyzing?: boolean;
}

type TabId = 'monetarias' | 'nomonetarias' | 'resultados';

interface MonetaryAccount {
    account: Account;
    balance: number;
    classification: MonetaryClass;
    isAuto: boolean;
}

interface FxProtectedAccount extends MonetaryAccount {
    accountType: ReturnType<typeof getAccountType>;
}

const GROUP_ORDER = ['ACTIVO', 'PASIVO', 'PN'] as const;
const GROUP_LABELS: Record<string, string> = {
    ACTIVO: 'ACTIVO',
    PASIVO: 'PASIVO',
    PN: 'PATRIMONIO NETO',
    RESULTADOS: 'RESULTADOS',
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    ACTIVO: 'Activo',
    PASIVO: 'Pasivo',
    PN: 'Patrimonio Neto',
    RESULTADOS: 'Resultados',
};

const GROUP_COLORS: Record<string, { border: string; bg: string; text: string }> = {
    ACTIVO: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-600' },
    PASIVO: { border: 'border-l-amber-500', bg: 'bg-amber-50', text: 'text-amber-600' },
    PN: { border: 'border-l-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    RESULTADOS: { border: 'border-l-violet-500', bg: 'bg-violet-50', text: 'text-violet-600' },
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
    computedRT6,
    lastAnalysis,
    closingEntriesDetected = false,
    closingEntriesCount = 0,
    onAnalyzeMayor,
    onClearAll,
    onRecalculate,
    onOpenMetodoIndirecto,
    onToggleClassification,
    onExcludeAccount,
    onAddMonetaryManual,
    onAddPartida,
    onEditPartida,
    onDeletePartida,
    isAnalyzing = false,
}: Step2RT6PanelProps) {
    const [activeTab, setActiveTab] = useState<TabId>('monetarias');
    const [expandedRubros, setExpandedRubros] = useState<Set<string>>(new Set());
    const [expandedPartidas, setExpandedPartidas] = useState<Set<string>>(new Set());
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    // Track if we've initialized expanded state for No Monetarias
    const [noMonInitialized, setNoMonInitialized] = useState(false);

    // ============================================
    // Account picker handler
    // ============================================
    const handleAddManualMonetary = useCallback((accountId: string) => {
        onAddMonetaryManual(accountId);
        setShowAccountPicker(false);
    }, [onAddMonetaryManual]);

    // ============================================
    // Classify accounts into Monetary / Non-Monetary
    // ============================================
    const {
        activosMon,
        pasivosMon,
        fxProtectedAccounts,
        totalsMon,
        availableToAddMon,
        unclassifiedAccounts,
    } = useMemo(() => {
        const activosMon: MonetaryAccount[] = [];
        const pasivosMon: MonetaryAccount[] = [];
        const fxProtectedAccounts: FxProtectedAccount[] = [];

        for (const account of accounts) {
            if (account.isHeader) continue;
            if (isExcluded(account.id, overrides)) continue;

            const initialClass = getInitialMonetaryClass(account);
            const finalClass = applyOverrides(account.id, initialClass, overrides);

            const balance = balances.get(account.id);
            if (!balance || balance.balance === 0) continue;

            const accountType = getAccountType(account);
            const baseItem: MonetaryAccount = {
                account,
                balance: Math.abs(balance.balance),
                classification: finalClass,
                isAuto: !overrides[account.id]?.classification,
            };

            if (finalClass === 'FX_PROTECTED') {
                fxProtectedAccounts.push({
                    ...baseItem,
                    accountType,
                });
                continue;
            }

            // Only include strictly MONETARY accounts here (FX has its own bucket)
            if (finalClass !== 'MONETARY') continue;

            if (accountType === 'ACTIVO') {
                activosMon.push(baseItem);
            } else if (accountType === 'PASIVO') {
                pasivosMon.push(baseItem);
            }
        }

        const totalActivosMon = activosMon.reduce((sum, a) => sum + a.balance, 0);
        const totalPasivosMon = pasivosMon.reduce((sum, a) => sum + a.balance, 0);
        const netoMon = totalActivosMon - totalPasivosMon;

        // Accounts available to add as monetary (not already classified as monetary)
        const monetaryIds = new Set([...activosMon, ...pasivosMon].map(a => a.account.id));
        const fxIds = new Set(fxProtectedAccounts.map(a => a.account.id));
        const classifiedIds = new Set([...monetaryIds, ...fxIds]);
        const availableToAddMon = accounts.filter(acc => {
            if (acc.isHeader) return false;
            if (isExcluded(acc.id, overrides)) return false;
            if (classifiedIds.has(acc.id)) return false;
            const bal = balances.get(acc.id);
            if (!bal || bal.balance === 0) return false;
            return true;
        });

        // Account IDs that are already in No Monetaria partidas
        const noMonetariaIds = new Set(computedRT6.map(p => p.cuentaCodigo));

        // Unclassified accounts: have balance, not monetary, not in RT6 partidas, not excluded
        const unclassifiedAccounts = accounts.filter(acc => {
            if (acc.isHeader) return false;
            if (isExcluded(acc.id, overrides)) return false;
            if (classifiedIds.has(acc.id)) return false;
            // Check if account code is in any RT6 partida
            if (noMonetariaIds.has(acc.code)) return false;
            const bal = balances.get(acc.id);
            if (!bal || bal.balance === 0) return false;
            return true;
        }).map(acc => ({
            account: acc,
            balance: balances.get(acc.id)?.balance || 0,
            accountType: getAccountType(acc),
        }));

        return {
            activosMon,
            pasivosMon,
            fxProtectedAccounts,
            totalsMon: { totalActivosMon, totalPasivosMon, netoMon },
            availableToAddMon,
            unclassifiedAccounts,
        };
    }, [accounts, balances, overrides, computedRT6]);

    // ============================================
    // Group No Monetarias by Grupo > Rubro (excluding RESULTADOS)
    // ============================================
    const groupedNoMon = useMemo(() => {
        const groups: Record<string, Record<string, ComputedPartidaRT6[]>> = {};
        for (const grupo of GROUP_ORDER) {
            groups[grupo] = {};
        }

        for (const partida of computedRT6) {
            const grupo = partida.grupo || getGroupFromCode(partida.cuentaCodigo || '') || 'ACTIVO';
            if (grupo === 'RESULTADOS') continue; // RESULTADOS go to separate tab

            const rubro = partida.rubroLabel || 'Sin rubro';
            if (!groups[grupo]) groups[grupo] = {};
            if (!groups[grupo][rubro]) groups[grupo][rubro] = [];
            groups[grupo][rubro].push(partida);
        }

        return groups;
    }, [computedRT6]);

    // ============================================
    // Group RESULTADOS by Rubro (Ventas, Costos, Gastos, etc.)
    // ============================================
    const groupedResultados = useMemo(() => {
        const groups: Record<string, ComputedPartidaRT6[]> = {};

        for (const partida of computedRT6) {
            const grupo = partida.grupo || getGroupFromCode(partida.cuentaCodigo || '') || 'ACTIVO';
            if (grupo !== 'RESULTADOS') continue;

            const rubro = partida.rubroLabel || 'Sin rubro';
            if (!groups[rubro]) groups[rubro] = [];
            groups[rubro].push(partida);
        }

        return groups;
    }, [computedRT6]);

    // ============================================
    // Resultados summary (neto, con signo por naturaleza)
    // ============================================
    const resultadosPartidas = useMemo(
        () => computedRT6.filter(p => p.grupo === 'RESULTADOS'),
        [computedRT6]
    );

    const resultadosSummary = useMemo(() => {
        const getResultadosSign = (p: ComputedPartidaRT6): number => {
            if (p.accountKind === 'EXPENSE') return -1;
            if (p.accountKind === 'INCOME') return 1;
            if (p.normalSide === 'DEBIT') return -1;
            return 1;
        };

        let baseNet = 0;
        let homogNet = 0;
        let ajusteNet = 0;

        for (const p of resultadosPartidas) {
            const sign = getResultadosSign(p);
            const delta = p.totalHomog - p.totalBase;
            baseNet += sign * p.totalBase;
            homogNet += sign * p.totalHomog;
            ajusteNet += sign * delta;
        }

        return {
            baseNet,
            homogNet,
            ajusteNet,
        };
    }, [resultadosPartidas]);

    // ============================================
    // Counts
    // ============================================
    const monetariasCount = activosMon.length + pasivosMon.length + fxProtectedAccounts.length;
    const noMonetariasCount = computedRT6.filter(p => p.grupo !== 'RESULTADOS').length;
    const resultadosCount = Object.values(groupedResultados).reduce((sum, arr) => sum + arr.length, 0);

    // ============================================
    // Auto-expand No Monetarias on first visit to tab
    // ============================================
    useEffect(() => {
        if (activeTab === 'nomonetarias' && !noMonInitialized && Object.keys(groupedNoMon).length > 0) {
            // Expand all rubros and partidas
            const allRubroKeys = new Set<string>();
            const allPartidaIds = new Set<string>();
            for (const grupo of Object.keys(groupedNoMon)) {
                for (const rubro of Object.keys(groupedNoMon[grupo])) {
                    const rubroKey = `${grupo}::${rubro}`;
                    allRubroKeys.add(rubroKey);
                    for (const partida of groupedNoMon[grupo][rubro]) {
                        allPartidaIds.add(partida.id);
                    }
                }
            }
            setExpandedRubros(allRubroKeys);
            setExpandedPartidas(allPartidaIds);
            setNoMonInitialized(true);
        }
    }, [activeTab, noMonInitialized, groupedNoMon]);

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
                        <i className="ph-fill ph-magic-wand" />
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
                    <button
                        className="rt6-btn rt6-btn-danger"
                        onClick={onClearAll}
                        disabled={isAnalyzing}
                        title="Limpiar toda la planilla"
                    >
                        <i className="ph-bold ph-trash" />
                        Limpiar
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
                    <button
                        className={`rt6-tab ${activeTab === 'resultados' ? 'active' : ''}`}
                        onClick={() => setActiveTab('resultados')}
                    >
                        <i className="ph ph-chart-line-up" />
                        Resultados (RT6)
                        <span className={`rt6-tab-badge ${activeTab === 'resultados' ? 'active' : ''}`}>
                            {resultadosCount}
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

                        {/* Add Manual Monetary Button + Picker */}
                        <div className="rt6-add-manual-section">
                            <button
                                className="rt6-btn-add-manual"
                                onClick={() => setShowAccountPicker(!showAccountPicker)}
                                disabled={availableToAddMon.length === 0}
                            >
                                <i className="ph-bold ph-plus" />
                                Agregar monetaria manual
                            </button>
                            {showAccountPicker && availableToAddMon.length > 0 && (
                                <div className="rt6-account-picker">
                                    <div className="rt6-picker-header">
                                        Seleccionar cuenta
                                        <button
                                            className="rt6-picker-close"
                                            onClick={() => setShowAccountPicker(false)}
                                        >
                                            <i className="ph-bold ph-x" />
                                        </button>
                                    </div>
                                    <div className="rt6-picker-list">
                                        {availableToAddMon.slice(0, 20).map((acc) => (
                                            <button
                                                key={acc.id}
                                                className="rt6-picker-item"
                                                onClick={() => handleAddManualMonetary(acc.id)}
                                            >
                                                <span className="rt6-picker-code">{acc.code}</span>
                                                <span className="rt6-picker-name">{acc.name}</span>
                                            </button>
                                        ))}
                                        {availableToAddMon.length > 20 && (
                                            <div className="rt6-picker-more">
                                                +{availableToAddMon.length - 20} más...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
                            <>
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
                                                        onExclude={() => onExcludeAccount(item.account.id)}
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
                                                        onExclude={() => onExcludeAccount(item.account.id)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            {fxProtectedAccounts.length > 0 && (
                                <div className="rt6-fx-section">
                                    <div className="rt6-fx-callout">
                                        <div className="rt6-fx-callout-title">
                                            <i className="ph-fill ph-shield-check" />
                                            Monetarias no expuestas (Moneda extranjera)
                                        </div>
                                        <p className="rt6-fx-callout-desc">
                                            Se expresan en pesos y luego se valuan a tipo de cambio.
                                            No participan del RECPAM como expuestas.
                                        </p>
                                    </div>
                                    <div className="rt6-mon-table-wrap">
                                        <table className="rt6-mon-table rt6-mon-table-fx">
                                            <thead>
                                                <tr>
                                                    <th>Cuenta</th>
                                                    <th className="text-center">Tipo</th>
                                                    <th className="text-right">Saldo</th>
                                                    <th className="text-center">Accion</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fxProtectedAccounts.map((item) => (
                                                    <tr key={item.account.id} className="rt6-mon-row rt6-mon-row-fx">
                                                        <td>
                                                            <div className="rt6-account-cell">
                                                                <div className="rt6-account-name">
                                                                    {item.account.name}
                                                                    <span className="rt6-fx-badge">ME</span>
                                                                </div>
                                                                <div className="rt6-account-meta">
                                                                    <span className="rt6-account-code">{item.account.code}</span>
                                                                    {item.isAuto && <span className="rt6-badge-auto">AUTO</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="text-center">
                                                            <span className="rt6-fx-type-badge">
                                                                {ACCOUNT_TYPE_LABELS[item.accountType] || item.accountType}
                                                            </span>
                                                        </td>
                                                        <td className="text-right font-mono">
                                                            {formatCurrencyARS(item.balance)}
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="rt6-row-actions">
                                                                <button
                                                                    className="rt6-action-btn"
                                                                    onClick={() => onToggleClassification(item.account.id, item.classification)}
                                                                    title="Cambiar clasificacion"
                                                                    aria-label="Cambiar clasificacion"
                                                                >
                                                                    <i className="ph-bold ph-pencil-simple" />
                                                                </button>
                                                                <button
                                                                    className="rt6-action-btn rt6-action-btn-danger"
                                                                    onClick={() => onExcludeAccount(item.account.id)}
                                                                    title="Excluir cuenta"
                                                                    aria-label="Excluir cuenta"
                                                                >
                                                                    <i className="ph-bold ph-trash" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            </>
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
                                                                    <span className="rt6-capital-badge" title="Capital social no se modifica. La reexpresion se registra en 'Ajuste de capital'.">
                                                                        <i className="ph-fill ph-bank" />
                                                                        <span className="rt6-capital-tooltip-text">Ajuste separado</span>
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
                                                        <div className="rt6-rubro-col">
                                                            <div className="rt6-rubro-total rt6-metric-homog">{formatCurrencyARS(rubroHomog)}</div>
                                                            <div className="rt6-rubro-label">V. Homog.</div>
                                                        </div>
                                                        <div className="rt6-rubro-col rt6-ajuste-col">
                                                            <div className={`rt6-ajuste-value ${rubroAjuste >= 0 ? 'rt6-recpam-positive' : 'rt6-recpam-negative'}`}>
                                                                {rubroAjuste >= 0 ? '+' : ''}{formatCurrencyARS(rubroAjuste)}
                                                            </div>
                                                            <div className="rt6-rubro-label">RECPAM</div>
                                                        </div>
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
                                                                            <tr className={`rt6-rubro-row ${hasMultipleLots ? 'rt6-row-expandable' : ''} ${isForeignCurrencyByCodeName(partida.cuentaCodigo, partida.cuentaNombre) ? 'rt6-row-foreign-currency' : ''}`}>
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
                                                                                        {isForeignCurrencyByCodeName(partida.cuentaCodigo, partida.cuentaNombre) && (
                                                                                            <span className="rt6-badge-monetary-ne" title="Monetaria. Se expresa en pesos y luego se valúa a T.C.">
                                                                                                Monetaria no expuesta
                                                                                            </span>
                                                                                        )}
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

                {/* Tab Content: Resultados (RT6) */}
                {activeTab === 'resultados' && (
                    <div className="rt6-tab-content rt6-tab-content-resultados">
                        {/* Header */}
                        <div className="rt6-resultados-header">
                            <h3 className="rt6-nomon-title">Estado de Resultados (RT6)</h3>
                            <div className="rt6-resultados-info">
                                <i className="ph-fill ph-info" />
                                <span>Las cuentas de resultados se reexpresan mes a mes segun RT6</span>
                            </div>
                        </div>

                        {closingEntriesDetected && (
                            <div className="rt6-resultados-banner">
                                <i className="ph-fill ph-warning" />
                                <span>
                                    Se detecto asiento de refundicion/cierre y se excluye del calculo RT6.
                                </span>
                                {closingEntriesCount > 0 && (
                                    <span className="rt6-resultados-banner-count">{closingEntriesCount}</span>
                                )}
                            </div>
                        )}

                        {resultadosCount > 0 && (
                            <div className="rt6-resultados-summary">
                                <div className="rt6-resultados-summary-item">
                                    <div className="rt6-resultados-summary-label">Resultado historico</div>
                                    <div className="rt6-resultados-summary-value font-mono">
                                        {formatCurrencyARS(resultadosSummary.baseNet)}
                                    </div>
                                </div>
                                <div className="rt6-resultados-summary-item">
                                    <div className="rt6-resultados-summary-label">Ajuste RT6</div>
                                    <div
                                        className={`rt6-resultados-summary-value font-mono font-bold ${resultadosSummary.ajusteNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                                    >
                                        {resultadosSummary.ajusteNet >= 0 ? '+' : ''}
                                        {formatCurrencyARS(resultadosSummary.ajusteNet)}
                                    </div>
                                </div>
                                <div className="rt6-resultados-summary-item rt6-resultados-summary-item-accent">
                                    <div className="rt6-resultados-summary-label">Resultado ajustado</div>
                                    <div className="rt6-resultados-summary-value font-mono font-bold">
                                        {formatCurrencyARS(resultadosSummary.homogNet)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {resultadosCount === 0 && (
                            <div className="rt6-empty-state">
                                <i className="ph-duotone ph-chart-line-up rt6-empty-icon" />
                                <p>No hay cuentas de resultados cargadas.</p>
                                <p className="text-muted">Las cuentas del Estado de Resultados aparecen automaticamente al analizar el mayor.</p>
                            </div>
                        )}

                        {/* Resultados by Rubro */}
                        {Object.keys(groupedResultados).length > 0 && (
                            <div className="rt6-grupo-section">
                                {Object.entries(groupedResultados).map(([rubro, partidas]) => {
                                    const rubroKey = `RESULTADOS-${rubro}`;
                                    const isExpanded = expandedRubros.has(rubroKey);
                                    const rubroTotal = partidas.reduce((s, p) => s + p.totalBase, 0);
                                    const rubroHomog = partidas.reduce((s, p) => s + p.totalHomog, 0);
                                    const rubroAjuste = rubroHomog - rubroTotal;
                                    const colors = GROUP_COLORS['RESULTADOS'];

                                    return (
                                        <div
                                            key={rubroKey}
                                            className={`rt6-rubro-card border-l-4 ${colors.border}`}
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
                                                                RESULTADOS
                                                            </span>
                                                            {rubro}
                                                        </div>
                                                        <div className="rt6-rubro-meta">
                                                            {partidas.length} cuenta{partidas.length !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="rt6-rubro-right-multi">
                                                    <div className="rt6-rubro-col">
                                                        <div className="rt6-rubro-total">{formatCurrencyARS(rubroTotal)}</div>
                                                        <div className="rt6-rubro-label">V. Origen</div>
                                                    </div>
                                                    <div className="rt6-rubro-col">
                                                        <div className="rt6-rubro-total rt6-metric-homog">{formatCurrencyARS(rubroHomog)}</div>
                                                        <div className="rt6-rubro-label">V. Homog.</div>
                                                    </div>
                                                    <div className="rt6-rubro-col rt6-ajuste-col">
                                                        <div className={`rt6-ajuste-value ${rubroAjuste >= 0 ? 'rt6-recpam-positive' : 'rt6-recpam-negative'}`}>
                                                            {rubroAjuste >= 0 ? '+' : ''}{formatCurrencyARS(rubroAjuste)}
                                                        </div>
                                                        <div className="rt6-rubro-label">Ajuste</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Rubro Content (Expanded) */}
                                            {isExpanded && (
                                                <div className="rt6-rubro-content">
                                                    <table className="rt6-rubro-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Cuenta</th>
                                                                <th className="text-center">Periodo</th>
                                                                <th className="text-right">V. Origen</th>
                                                                <th className="text-right">Coef. Aprox.</th>
                                                                <th className="text-right">V. Homog.</th>
                                                                <th className="text-right">Ajuste</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {partidas.map((partida) => {
                                                                const avgCoef = partida.itemsComputed.length > 0
                                                                    ? partida.itemsComputed.reduce((sum, lot) => sum + lot.coef, 0) / partida.itemsComputed.length
                                                                    : 1;

                                                                return (
                                                                    <tr key={partida.id} className="rt6-rubro-row">
                                                                        <td className="rt6-cuenta-cell">
                                                                            <div className="rt6-cuenta-flex">
                                                                                <span>{partida.cuentaNombre}</span>
                                                                            </div>
                                                                            <span className="rt6-account-code">{partida.cuentaCodigo}</span>
                                                                        </td>
                                                                        <td className="text-center font-mono text-muted">
                                                                            {partida.itemsComputed.length} mes{partida.itemsComputed.length !== 1 ? 'es' : ''}
                                                                        </td>
                                                                        <td className="text-right font-mono">
                                                                            {formatCurrencyARS(partida.totalBase)}
                                                                        </td>
                                                                        <td className="text-right font-mono text-muted">
                                                                            {formatCoef(avgCoef)}
                                                                        </td>
                                                                        <td className="text-right font-mono font-semibold text-blue-600">
                                                                            {formatCurrencyARS(partida.totalHomog)}
                                                                        </td>
                                                                        <td className={`text-right font-mono ${partida.totalRecpam >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                            {partida.totalRecpam >= 0 ? '+' : ''}{formatCurrencyARS(partida.totalRecpam)}
                                                                        </td>
                                                                    </tr>
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
                        )}

                    </div>
                )}
            </div>

            {/* Cuentas Sin Clasificar Card */}
            {unclassifiedAccounts.length > 0 && (
                <div className="rt6-unclassified-card">
                    <div className="rt6-unclassified-header">
                        <div>
                            <h3 className="rt6-unclassified-title">
                                <i className="ph-fill ph-warning" style={{ color: '#F59E0B' }} />
                                Cuentas sin clasificar
                            </h3>
                            <p className="rt6-unclassified-desc">
                                Estas cuentas tienen saldo pero no fueron clasificadas como monetarias ni no monetarias.
                            </p>
                        </div>
                        <span className="rt6-unclassified-badge">{unclassifiedAccounts.length}</span>
                    </div>
                    <table className="rt6-unclassified-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Cuenta</th>
                                <th>Tipo</th>
                                <th className="text-right">Saldo</th>
                                <th className="text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unclassifiedAccounts.slice(0, 10).map(item => (
                                <tr key={item.account.id}>
                                    <td className="font-mono">{item.account.code}</td>
                                    <td>{item.account.name}</td>
                                    <td>
                                        <span className={`rt6-tipo-badge ${item.accountType === 'ACTIVO' ? 'rt6-tipo-activo' : item.accountType === 'PASIVO' ? 'rt6-tipo-pasivo' : 'rt6-tipo-pn'}`}>
                                            {item.accountType || '?'}
                                        </span>
                                    </td>
                                    <td className="text-right font-mono">{formatCurrencyARS(item.balance)}</td>
                                    <td className="text-center">
                                        <div className="rt6-action-group">
                                            <button
                                                className="rt6-action-btn-small rt6-action-mon"
                                                title="Agregar a Monetarias"
                                                onClick={() => onAddMonetaryManual(item.account.id)}
                                            >
                                                <i className="ph-bold ph-currency-dollar" />
                                            </button>
                                            <button
                                                className="rt6-action-btn-small rt6-action-nomon"
                                                title="Agregar a No Monetarias"
                                                onClick={() => onAddPartida()}
                                            >
                                                <i className="ph-bold ph-package" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {unclassifiedAccounts.length > 10 && (
                        <div className="rt6-unclassified-more">
                            +{unclassifiedAccounts.length - 10} cuentas más...
                        </div>
                    )}
                </div>
            )}

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
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px;
                    background: #EFF6FF;
                    border-radius: 8px;
                    color: #3B82F6;
                    font-size: 1.5rem;
                    min-width: 48px;
                    min-height: 48px;
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
                .rt6-btn-danger {
                    background: #FEF2F2;
                    color: #DC2626;
                    border: 1px solid #FECACA;
                }
                .rt6-btn-danger:hover:not(:disabled) {
                    background: #FEE2E2;
                    border-color: #FCA5A5;
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
                /* Removed yellow background - use subtle border instead */
                .rt6-mon-row-pending {
                    border-left: 2px solid #E5E7EB;
                }
                .rt6-mon-row-pending:hover {
                    background: #F9FAFB;
                }
                .rt6-fx-section {
                    margin-top: var(--space-lg);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .rt6-fx-callout {
                    border: 1px solid #E0E7FF;
                    background: #F8FAFF;
                    border-radius: 10px;
                    padding: 12px 14px;
                }
                .rt6-fx-callout-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 700;
                    color: #3730A3;
                }
                .rt6-fx-callout-desc {
                    margin: 4px 0 0;
                    font-size: 0.85rem;
                    color: #4B5563;
                }
                .rt6-mon-table-fx thead {
                    background: #EEF2FF;
                    border-bottom: 1px solid #E0E7FF;
                }
                .rt6-mon-row-fx {
                    background: #F8FAFF;
                }
                .rt6-mon-row-fx:hover {
                    background: #EEF2FF;
                }
                .rt6-fx-badge {
                    margin-left: 8px;
                    padding: 2px 6px;
                    border-radius: 9999px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #4338CA;
                    background: #E0E7FF;
                    border: 1px solid #C7D2FE;
                }
                .rt6-fx-type-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 9999px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: #3730A3;
                    background: #E0E7FF;
                    border: 1px solid #C7D2FE;
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

                /* Action Buttons (in rows) - ALWAYS VISIBLE */
                .rt6-row-actions {
                    display: flex;
                    gap: 4px;
                    opacity: 1;
                }
                .rt6-action-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: #F3F4F6;
                    color: #9CA3AF;
                    cursor: pointer;
                    border-radius: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                    opacity: 1;
                }
                .rt6-action-btn:hover {
                    background: white;
                    color: #3B82F6;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .rt6-action-btn-danger:hover {
                    color: #EF4444;
                    background: #FEF2F2;
                }

                /* Add Manual Monetary Section */
                .rt6-add-manual-section {
                    position: relative;
                    margin-bottom: var(--space-md);
                }
                .rt6-btn-add-manual {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #3B82F6;
                    background: #EFF6FF;
                    border: 1px dashed #93C5FD;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .rt6-btn-add-manual:hover:not(:disabled) {
                    background: #DBEAFE;
                    border-color: #3B82F6;
                }
                .rt6-btn-add-manual:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .rt6-account-picker {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    margin-top: 4px;
                    min-width: 320px;
                    max-height: 300px;
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 50;
                    overflow: hidden;
                }
                .rt6-picker-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: #6B7280;
                    border-bottom: 1px solid #E5E7EB;
                    background: #F9FAFB;
                }
                .rt6-picker-close {
                    background: none;
                    border: none;
                    padding: 4px;
                    cursor: pointer;
                    color: #9CA3AF;
                }
                .rt6-picker-close:hover {
                    color: #374151;
                }
                .rt6-picker-list {
                    max-height: 240px;
                    overflow-y: auto;
                }
                .rt6-picker-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 10px 12px;
                    text-align: left;
                    background: none;
                    border: none;
                    border-bottom: 1px solid #F3F4F6;
                    cursor: pointer;
                    transition: background 0.1s;
                }
                .rt6-picker-item:hover {
                    background: #F3F4F6;
                }
                .rt6-picker-code {
                    font-family: var(--font-mono);
                    font-size: 0.75rem;
                    color: #6B7280;
                    min-width: 80px;
                }
                .rt6-picker-name {
                    font-size: 0.85rem;
                    color: #374151;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .rt6-picker-more {
                    padding: 8px 12px;
                    font-size: 0.75rem;
                    color: #9CA3AF;
                    text-align: center;
                    background: #F9FAFB;
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
                .rt6-metric-homog {
                    color: #2563EB !important;
                }
                .rt6-recpam-positive {
                    color: #059669 !important;
                }
                .rt6-recpam-negative {
                    color: #DC2626 !important;
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
                /* Foreign Currency Badge (Monetaria no expuesta) */
                .rt6-badge-monetary-ne {
                    background: #E0F2FE;
                    color: #0369A1;
                    font-size: 0.65rem;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-weight: 700;
                    text-transform: uppercase;
                    white-space: nowrap;
                    margin-left: 8px;
                }
                .rt6-row-foreign-currency {
                    background: rgba(251, 191, 36, 0.05);
                    border-left: 3px solid #F59E0B;
                }
                .rt6-row-foreign-currency:hover {
                    background: rgba(251, 191, 36, 0.1);
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
                    cursor: help;
                    position: relative;
                    background: rgba(16, 185, 129, 0.1);
                    color: #059669;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .rt6-capital-tooltip-text {
                    font-size: 0.6rem;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                    white-space: nowrap;
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
                .font-mono {
                    font-family: 'JetBrains Mono', monospace;
                    font-variant-numeric: tabular-nums;
                }
                .font-semibold { font-weight: 600; }
                .font-bold { font-weight: 700; }
                .bg-blue-50 { background: #EFF6FF; }
                .bg-amber-50 { background: #FFFBEB; }
                .bg-emerald-50 { background: #ECFDF5; }
                .border-l-blue-500 { border-left-color: #3B82F6; }
                .border-l-amber-500 { border-left-color: #F59E0B; }
                .border-l-emerald-500 { border-left-color: #10B981; }
                .border-l-violet-500 { border-left-color: #8B5CF6; }
                .bg-violet-50 { background: #F5F3FF; }
                .text-violet-600 { color: #7C3AED; }

                /* Resultados Tab Styles */
                .rt6-tab-content-resultados {
                    background: #F9FAFB;
                    min-height: 500px;
                }
                .rt6-resultados-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-md);
                    flex-wrap: wrap;
                    gap: var(--space-sm);
                }
                .rt6-resultados-info {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: #6B7280;
                    background: #EFF6FF;
                    padding: 6px 12px;
                    border-radius: 6px;
                    border: 1px solid #DBEAFE;
                }
                .rt6-resultados-info i {
                    color: #3B82F6;
                }
                .rt6-resultados-banner {
                    margin-top: var(--space-sm);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: 10px;
                    border: 1px solid #FDE68A;
                    background: #FFFBEB;
                    color: #92400E;
                    font-size: 0.9rem;
                }
                .rt6-resultados-banner-count {
                    margin-left: auto;
                    padding: 2px 8px;
                    border-radius: 9999px;
                    border: 1px solid #FCD34D;
                    background: #FEF3C7;
                    font-weight: 700;
                    font-size: 0.8rem;
                    color: #B45309;
                }
                .rt6-resultados-summary {
                    margin-top: var(--space-md);
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 12px;
                }
                .rt6-resultados-summary-item {
                    border: 1px solid #E5E7EB;
                    border-radius: 10px;
                    padding: 12px;
                    background: #F8FAFC;
                }
                .rt6-resultados-summary-item-accent {
                    border-color: #C7D2FE;
                    background: #EEF2FF;
                }
                .rt6-resultados-summary-label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: #6B7280;
                    margin-bottom: 4px;
                }
                .rt6-resultados-summary-value {
                    font-size: 1rem;
                }

                /* Unclassified Card */
                .rt6-unclassified-card {
                    background: white;
                    border: 1px solid #FED7AA;
                    border-radius: 8px;
                    padding: 16px;
                    margin-top: 24px;
                }
                .rt6-unclassified-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 16px;
                }
                .rt6-unclassified-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: #92400E;
                }
                .rt6-unclassified-desc {
                    margin: 4px 0 0;
                    font-size: 0.85rem;
                    color: #78716C;
                }
                .rt6-unclassified-badge {
                    background: #FEF3C7;
                    color: #B45309;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    font-weight: 700;
                }
                .rt6-unclassified-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .rt6-unclassified-table th {
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #78716C;
                    padding: 8px;
                    border-bottom: 1px solid #FED7AA;
                    text-align: left;
                }
                .rt6-unclassified-table td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #FEF3C7;
                    font-size: 0.9rem;
                    color: #44403C;
                }
                .rt6-unclassified-more {
                    padding: 12px;
                    text-align: center;
                    font-size: 0.85rem;
                    color: #78716C;
                    background: #FFFBEB;
                    border-radius: 0 0 6px 6px;
                    margin: 0 -16px -16px;
                }
                .rt6-tipo-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .rt6-tipo-activo { background: #DBEAFE; color: #1D4ED8; }
                .rt6-tipo-pasivo { background: #FEF3C7; color: #B45309; }
                .rt6-tipo-pn { background: #D1FAE5; color: #047857; }
                .rt6-action-group {
                    display: flex;
                    gap: 4px;
                    justify-content: center;
                }
                .rt6-action-btn-small {
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8rem;
                    transition: all 0.15s;
                }
                .rt6-action-mon {
                    background: #DBEAFE;
                    color: #2563EB;
                }
                .rt6-action-mon:hover {
                    background: #BFDBFE;
                }
                .rt6-action-nomon {
                    background: #E0E7FF;
                    color: #4F46E5;
                }
                .rt6-action-nomon:hover {
                    background: #C7D2FE;
                }
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
    onExclude: () => void;
}

function MonetaryRow({ item, onToggle, onExclude }: MonetaryRowProps) {
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
                        title="Editar clasificación"
                        aria-label="Editar cuenta"
                    >
                        <i className="ph-bold ph-pencil-simple" />
                    </button>
                    <button
                        className="rt6-action-btn rt6-action-btn-danger"
                        onClick={onExclude}
                        title="Eliminar de Monetarias"
                        aria-label="Eliminar cuenta"
                    >
                        <i className="ph-bold ph-trash" />
                    </button>
                </div>
            </td>
        </tr>
    );
}
