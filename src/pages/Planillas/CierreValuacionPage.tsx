/**
 * CierreValuacionPage - Main Page Component
 *
 * Implements the "Cierre: AxI + Valuación" planilla tool with 4 tabs.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db';
import {
    type TabId,
    type IndexRow,
    type PartidaRT6,
    type RT17Valuation,
    type CierreValuacionState,
    getPeriodFromDate,
    getIndexForPeriod,
    computeAllRT6Partidas,
    computeAllRT17Partidas,
    calculateRT6Totals,
    calculateRT17Totals,
    calculateRecpamEstimado,
    generateCierreDrafts,
    formatCurrencyARS,
    formatNumber,
    formatCoef,
    canGenerateAsientos,
} from '../../core/cierre-valuacion';
import {
    loadCierreValuacionState,
    saveCierreValuacionState,
} from '../../storage';
import { getAllAccounts } from '../../storage/accounts';
import { Account } from '../../core/models';
import { RT6Drawer } from './components/RT6Drawer';
import { RT17Drawer } from './components/RT17Drawer';
import { IndicesImportWizard } from './components/IndicesImportWizard';
import { Step2RT6Panel } from './components/Step2RT6Panel';
import { Step3RT17Panel } from './components/Step3RT17Panel';
import { createEntry, updateEntry } from '../../storage/entries';
import { computeVoucherHash, findEntryByVoucherKey } from '../../core/cierre-valuacion/sync';
import { useLedgerBalances } from '../../hooks/useLedgerBalances';
import { useAccountOverrides } from '../../hooks/useAccountOverrides';
import { autoGeneratePartidasRT6 } from '../../core/cierre-valuacion/auto-partidas-rt6';
import { calculateRecpamIndirecto, type RecpamIndirectoResult } from '../../core/cierre-valuacion/recpam-indirecto';
import { MonetaryAccountsPanel } from './components/MonetaryAccountsPanel';
import { RecpamIndirectoDrawer } from './components/RecpamIndirectoDrawer';
import { toggleMonetaryClass, markAsValidated } from '../../hooks/useAccountOverrides';
import type { MonetaryClass } from '../../core/cierre-valuacion/monetary-classification';

// Icons (using emoji for simplicity - can be replaced with lucide-react)
const ICONS = {
    calendar: '📅',
    warning: '⚠️',
    check: '✓',
    plus: '+',
    edit: '✏️',
    trending: '📈',
    calculator: '🧮',
    dollar: '💵',
    file: '📄',
    download: '📥',
    info: 'ℹ️',
};

export default function CierreValuacionPage() {
    const navigate = useNavigate();
    // =============================================
    // State
    // =============================================
    const [state, setState] = useState<CierreValuacionState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('reexpresion');
    const [toast, setToast] = useState<string | null>(null);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);

    // Drawer state
    const [isRT6DrawerOpen, setRT6DrawerOpen] = useState(false);
    const [editingRT6Id, setEditingRT6Id] = useState<string | null>(null);
    const [isRT17DrawerOpen, setRT17DrawerOpen] = useState(false);
    const [editingRT17Id, setEditingRT17Id] = useState<string | null>(null);

    // Import wizard and edit modal state
    const [isImportWizardOpen, setImportWizardOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState<{ period: string; value: number } | null>(null);

    // Tab 1 Pagination state
    const [indicesPage, setIndicesPage] = useState(1);
    const [indicesPageSize] = useState(20);

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'RT6' | 'RT17'; id: string } | null>(null);

    // Sub-tab state for Step 2 (Monetarias vs No Monetarias)
    const [step2SubTab, setStep2SubTab] = useState<'monetarias' | 'nomonetarias'>('nomonetarias');

    // RECPAM Drawer state
    const [isRecpamDrawerOpen, setRecpamDrawerOpen] = useState(false);
    const [recpamResult, setRecpamResult] = useState<RecpamIndirectoResult | null>(null);
    const [recpamLoading, setRecpamLoading] = useState(false);

    // Refs
    const saveTimeoutRef = useRef<number | null>(null);

    // =============================================
    // Load & Save
    // =============================================
    useEffect(() => {
        async function load() {
            const accounts = await getAllAccounts();
            setAllAccounts(accounts);
            const loaded = await loadCierreValuacionState();
            setState(loaded);
            setIsLoading(false);
        }
        load();
    }, []);

    const debouncedSave = useCallback((newState: CierreValuacionState) => {
        if (saveTimeoutRef.current !== null) {
            window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
            saveCierreValuacionState(newState);
            saveTimeoutRef.current = null;
        }, 500);
    }, []);

    const updateState = useCallback(
        (updater: (prev: CierreValuacionState) => CierreValuacionState) => {
            setState((prev) => {
                if (!prev) return prev;
                const newState = updater(prev);
                debouncedSave(newState);
                return newState;
            });
        },
        [debouncedSave]
    );

    // =============================================
    // Derived Values
    // =============================================
    const closingDate = state?.closingDate || '';
    const closingPeriod = useMemo(() => getPeriodFromDate(closingDate), [closingDate]);
    const indices = state?.indices || [];
    const closingIndexValue = getIndexForPeriod(indices, closingPeriod);
    const isMissingClosingIndex = !closingIndexValue;

    // Sort indices by period DESC (newest first)
    const sortedIndices = useMemo(() => {
        return [...indices].sort((a, b) => {
            // Parse YYYY-MM to numeric for comparison
            const [yearA, monthA] = a.period.split('-').map(Number);
            const [yearB, monthB] = b.period.split('-').map(Number);
            const numA = yearA * 100 + monthA;
            const numB = yearB * 100 + monthB;
            return numB - numA; // DESC
        });
    }, [indices]);

    // Paginate indices
    const totalIndicesPages = Math.ceil(sortedIndices.length / indicesPageSize);
    const paginatedIndices = useMemo(() => {
        const start = (indicesPage - 1) * indicesPageSize;
        return sortedIndices.slice(start, start + indicesPageSize);
    }, [sortedIndices, indicesPage, indicesPageSize]);

    // Computed partidas
    const computedRT6 = useMemo(
        () => computeAllRT6Partidas(state?.partidasRT6 || [], indices, closingPeriod),
        [state?.partidasRT6, indices, closingPeriod]
    );

    const computedRT17 = useMemo(
        () => computeAllRT17Partidas(computedRT6, state?.valuations || {}),
        [computedRT6, state?.valuations]
    );

    // Cleanup valuations if RT6 items are deleted
    useEffect(() => {
        if (!state?.valuations || !state?.partidasRT6) return;
        const rt6Ids = new Set(state.partidasRT6.map(p => p.id));
        const currentValuationIds = Object.keys(state.valuations);
        const needsCleanup = currentValuationIds.some(id => !rt6Ids.has(id));

        if (needsCleanup) {
            updateState(prev => {
                const newValuations = { ...prev.valuations };
                Object.keys(newValuations).forEach(id => {
                    if (!rt6Ids.has(id)) delete newValuations[id];
                });
                return { ...prev, valuations: newValuations };
            });
        }
    }, [state?.partidasRT6.length]);


    // Totals
    const rt6Totals = useMemo(() => calculateRT6Totals(computedRT6), [computedRT6]);
    const rt17Totals = useMemo(() => calculateRT17Totals(computedRT17), [computedRT17]);

    // RECPAM estimator
    const recpamInputs = state?.recpamInputs || { activeMon: 0, passiveMon: 0 };
    const pmn = recpamInputs.activeMon - recpamInputs.passiveMon;
    const recpamCoef =
        closingIndexValue && indices.length > 0 ? closingIndexValue / indices[0].value : 1;
    const recpamEstimado = calculateRecpamEstimado(pmn, recpamCoef);

    // Draft asientos
    const asientosDraft = useMemo(
        () => generateCierreDrafts(computedRT6, computedRT17, allAccounts),
        [computedRT6, computedRT17, allAccounts]
    );

    // REAL-TIME SYNC with Ledger
    const allJournalEntries = useLiveQuery(() => db.entries.reverse().toArray(), []);

    // Ledger balances (RT6 Auto)
    const { byAccount: ledgerBalances, totals: ledgerTotals, loading: ledgerLoading } =
        useLedgerBalances(allJournalEntries, allAccounts, { closingDate });

    // Account overrides (RT6 Auto)
    const { setOverride } = useAccountOverrides(
        state?.accountOverrides || {},
        (newOverrides) => {
            updateState(prev => ({ ...prev, accountOverrides: newOverrides }));
        }
    );

    // Compute Sync Status for each voucher
    const voucherSyncData = useMemo(() => {
        if (!state || !allJournalEntries) return [];

        return asientosDraft.map(v => {
            const entry = findEntryByVoucherKey(allJournalEntries, state.id || 'cierre-valuacion-state', v.key);
            const currentHash = computeVoucherHash(v, closingDate);

            let status: 'PENDIENTE' | 'ENVIADO' | 'DESACTUALIZADO' = 'PENDIENTE';
            if (entry) {
                const storedHash = entry.metadata?.voucherHash;
                status = (storedHash === currentHash) ? 'ENVIADO' : 'DESACTUALIZADO';
            }

            return {
                voucherKey: v.key,
                status,
                existingEntryId: entry?.id,
                currentHash
            };
        });
    }, [asientosDraft, allJournalEntries, state, closingDate]);





    // =============================================
    // Handlers
    // =============================================
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateState((prev) => ({ ...prev, closingDate: e.target.value }));
    };

    const handleGenerarAsientos = () => {
        setActiveTab('asientos');
        showToast('Asientos generados (borrador)');
    };

    const handleSendToLedger = async () => {
        if (!state || !asientosDraft || asientosDraft.length === 0) return;

        try {
            const unsynced = voucherSyncData.filter(s => s.status !== 'ENVIADO');
            if (unsynced.length === 0) {
                showToast('Todos los asientos ya están sincronizados.');
                return;
            }

            for (const sync of unsynced) {
                const voucher = asientosDraft.find(v => v.key === sync.voucherKey);
                if (!voucher || !voucher.isValid) continue;

                const entryData = {
                    date: closingDate,
                    memo: voucher.descripcion,
                    lines: voucher.lineas.map(l => ({
                        accountId: l.accountId || '',
                        debit: l.debe,
                        credit: l.haber,
                        description: voucher.descripcion
                    })),
                    metadata: {
                        source: 'cierre',
                        cierreId: state.id || 'cierre-valuacion-state',
                        voucherKey: sync.voucherKey,
                        voucherHash: sync.currentHash,
                        step: voucher.tipo,
                        side: sync.voucherKey.split('_')[1].toLowerCase()
                    }
                };

                if (sync.status === 'DESACTUALIZADO' && sync.existingEntryId) {
                    await updateEntry(sync.existingEntryId, entryData);
                } else {
                    await createEntry(entryData);
                }
            }

            showToast(`¡Éxito! Se sincronizaron ${unsynced.length} asientos.`);
        } catch (err: any) {
            console.error('Error sending to ledger:', err);
            showToast('Error al enviar: ' + err.message);
        }
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Index handlers
    const handleUpdateIndex = (period: string, value: number) => {
        updateState((prev) => ({
            ...prev,
            indices: prev.indices.map((i) => (i.period === period ? { ...i, value } : i)),
        }));
    };

    const handleImportIndices = (imported: IndexRow[]) => {
        updateState((prev) => ({
            ...prev,
            indices: [...prev.indices, ...imported].reduce((acc: IndexRow[], curr: IndexRow) => {
                const existing = acc.findIndex((i: IndexRow) => i.period === curr.period);
                if (existing >= 0) {
                    acc[existing] = curr;
                } else {
                    acc.push(curr);
                }
                return acc;
            }, [] as IndexRow[]).sort((a: IndexRow, b: IndexRow) => a.period.localeCompare(b.period)),
        }));
        showToast(`Importados ${imported.length} índices`);
    };

    // TODO: Group RT6/RT17 for sections D and E
    // These helpers will be used when implementing grouped tables with expandable rows

    // RT6 handlers
    const handleOpenRT6Drawer = (id?: string) => {
        setEditingRT6Id(id || null);
        setRT6DrawerOpen(true);
    };

    const handleSaveRT6 = (partida: PartidaRT6) => {
        updateState((prev) => {
            const exists = prev.partidasRT6.find((p) => p.id === partida.id);
            if (exists) {
                return {
                    ...prev,
                    partidasRT6: prev.partidasRT6.map((p) => (p.id === partida.id ? partida : p)),
                };
            }
            return { ...prev, partidasRT6: [...prev.partidasRT6, partida] };
        });
        setRT6DrawerOpen(false);
        showToast('Partida guardada');
    };

    const handleDeleteRT6 = (id: string) => {
        updateState((prev) => ({
            ...prev,
            partidasRT6: prev.partidasRT6.filter((p) => p.id !== id),
        }));
        showToast('Partida eliminada');
    };

    // RT17 handlers
    const handleOpenRT17Drawer = (id?: string) => {
        setEditingRT17Id(id || null);
        setRT17DrawerOpen(true);
    };

    const handleSaveValuation = (valuation: RT17Valuation) => {
        updateState((prev) => ({
            ...prev,
            valuations: {
                ...prev.valuations,
                [valuation.rt6ItemId]: valuation,
            },
        }));
        setRT17DrawerOpen(false);
        showToast('Valuación guardada');
    };

    const handleDeleteRT17 = (rt6Id: string) => {
        updateState((prev) => {
            const newValuations = { ...prev.valuations };
            delete newValuations[rt6Id];
            return {
                ...prev,
                valuations: newValuations,
            };
        });
        showToast('Valuación reseteada');
    };

    // RT6 Auto handlers
    const handleCalcularAutomaticamente = useCallback(() => {
        if (!allAccounts || !ledgerBalances || !state) return;

        // Determinar inicio de período (1 año antes del cierre)
        const closingYear = parseInt(closingDate.split('-')[0]);
        const startOfPeriod = `${closingYear}-01-01`;

        // Auto-generar partidas
        const { partidas, stats } = autoGeneratePartidasRT6(
            allAccounts,
            ledgerBalances,
            state.accountOverrides || {},
            {
                startOfPeriod,
                closingDate,
                groupByMonth: true,
                minLotAmount: 100,
            }
        );

        // Actualizar state
        updateState((prev) => ({
            ...prev,
            partidasRT6: partidas,
        }));

        showToast(`Generadas ${stats.partidasGenerated} partidas con ${stats.lotsGenerated} lotes`);
    }, [allAccounts, ledgerBalances, state, closingDate, updateState]);

    const handleRecalcular = useCallback(() => {
        // Mismo que handleCalcularAutomaticamente pero respetando partidas manuales
        handleCalcularAutomaticamente();
    }, [handleCalcularAutomaticamente]);

    const handleToggleMonetaryClass = useCallback(
        (accountId: string, currentClass: MonetaryClass) => {
            toggleMonetaryClass(accountId, currentClass, state?.accountOverrides || {}, (newOverrides) => {
                updateState((prev) => ({ ...prev, accountOverrides: newOverrides }));
            });
            showToast('Clasificación actualizada');
        },
        [state, updateState]
    );

    const handleMarkValidated = useCallback(
        (accountId: string) => {
            markAsValidated(accountId, state?.accountOverrides || {}, (newOverrides) => {
                updateState((prev) => ({ ...prev, accountOverrides: newOverrides }));
            });
        },
        [state, updateState]
    );

    const handleMarkAllValidated = useCallback(() => {
        if (!allAccounts || !state) return;

        const newOverrides = { ...state.accountOverrides };
        for (const account of allAccounts) {
            if (!account.isHeader && !newOverrides[account.id]?.validated) {
                newOverrides[account.id] = { ...(newOverrides[account.id] || {}), validated: true };
            }
        }

        updateState((prev) => ({ ...prev, accountOverrides: newOverrides }));
        showToast('Todas las cuentas marcadas como validadas');
    }, [allAccounts, state, updateState]);

    const handleOpenRecpamDrawer = useCallback(async () => {
        if (!allJournalEntries || !allAccounts || !state) return;

        setRecpamDrawerOpen(true);
        setRecpamLoading(true);

        try {
            const closingYear = parseInt(closingDate.split('-')[0]);
            const startOfPeriod = `${closingYear}-01-01`;

            const result = calculateRecpamIndirecto(
                allJournalEntries,
                allAccounts,
                state.accountOverrides || {},
                indices,
                startOfPeriod,
                closingDate
            );

            setRecpamResult(result);
        } catch (error) {
            console.error('Error calculating RECPAM:', error);
            showToast('Error al calcular RECPAM');
        } finally {
            setRecpamLoading(false);
        }
    }, [allJournalEntries, allAccounts, state, closingDate, indices]);

    // TODO: Add reset button to UI that calls clearCierreValuacionState()

    // =============================================
    // Render
    // =============================================
    if (isLoading || !state) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">⏳</div>
                <p>Cargando planilla...</p>
            </div>
        );
    }

    const tabs = [
        { id: 'indices' as TabId, label: '1. Índices (RT6)', icon: ICONS.trending },
        { id: 'reexpresion' as TabId, label: '2. Reexpresión', icon: ICONS.calculator },
        { id: 'valuacion' as TabId, label: '3. Valuación (RT17)', icon: ICONS.dollar },
        { id: 'asientos' as TabId, label: '4. Asientos Sugeridos', icon: ICONS.file },
    ];

    return (
        <div className="cierre-page">
            {/* HEADER */}
            <header className="cierre-header">
                <div className="cierre-header-left">
                    <div className="cierre-breadcrumb">
                        {ICONS.file} Planillas Complementarias / Cierre
                    </div>
                    <h1 className="cierre-title">Cierre: AxI + Valuación</h1>
                </div>

                <div className="cierre-header-right">
                    <div className="cierre-date-picker">
                        <span className="cierre-date-label">{ICONS.calendar} Fecha Cierre</span>
                        <input
                            type="date"
                            value={closingDate}
                            onChange={handleDateChange}
                            className="form-input"
                        />
                    </div>

                    {isMissingClosingIndex && (
                        <div className="cierre-warning-chip">
                            {ICONS.warning} Falta índice {closingPeriod}
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleGenerarAsientos}
                        disabled={!canGenerateAsientos(computedRT17)}
                        title={!canGenerateAsientos(computedRT17) ? "Completá todas las valuaciones pendientes para generar asientos" : ""}
                    >
                        {ICONS.check} Generar Asientos
                    </button>
                </div>
            </header>

            {/* KPI CARDS */}
            <div className="cierre-kpi-row">
                <div className="cierre-kpi-card cierre-kpi-muted">
                    <div className="cierre-kpi-label">Activo Base</div>
                    <div className="cierre-kpi-value">{formatCurrencyARS(rt6Totals.totalBase)}</div>
                    <div className="cierre-kpi-sub">Valores históricos</div>
                </div>
                <div className="cierre-kpi-card cierre-kpi-muted">
                    <div className="cierre-kpi-label">Ajustado (RT6)</div>
                    <div className="cierre-kpi-value">{formatCurrencyARS(rt6Totals.totalHomog)}</div>
                    <div className="cierre-kpi-sub">
                        Coef. cierre: {closingIndexValue ? formatCoef(recpamCoef) : '-'}
                    </div>
                </div>
                <div className="cierre-kpi-card cierre-kpi-emphasis">
                    <div className="cierre-kpi-label">Impacto RECPAM</div>
                    <div className="cierre-kpi-value cierre-kpi-gradient-text">
                        {formatCurrencyARS(rt6Totals.totalRecpam + recpamEstimado)}
                    </div>
                    <div className="cierre-kpi-sub">RT6 + PMN estimado</div>
                </div>
                <div className="cierre-kpi-card cierre-kpi-emphasis cierre-kpi-dark">
                    <div className="cierre-kpi-label">Valuación</div>
                    <div className="cierre-kpi-value cierre-kpi-green">
                        {formatCurrencyARS(rt17Totals.totalResTenencia)}
                    </div>
                    <div className="cierre-kpi-sub">Resultado x Tenencia</div>
                    <button
                        className="cierre-kpi-cta"
                        onClick={() => setActiveTab('asientos')}
                    >
                        Ver Asientos →
                    </button>
                </div>
            </div>

            {/* TABS */}
            <div className="cierre-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`cierre-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="cierre-tab-icon">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            <div className="cierre-content">
                {/* TAB 1: INDICES */}
                {activeTab === 'indices' && (
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Tabla de Índices (FACPCE)</h3>
                                <p className="text-secondary">
                                    Periodo de cierre: <strong>{closingPeriod}</strong>
                                </p>
                            </div>
                            <div className="flex gap-sm">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setImportWizardOpen(true)}
                                >
                                    {ICONS.download} Importar
                                </button>
                            </div>
                        </div>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Período</th>
                                        <th className="text-right">Índice (base)</th>
                                        <th className="text-right">Coef. al cierre</th>
                                        <th className="text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedIndices.map((idx) => {
                                        const isClosing = idx.period === closingPeriod;
                                        const coef = closingIndexValue
                                            ? closingIndexValue / idx.value
                                            : 0;
                                        return (
                                            <tr
                                                key={idx.period}
                                                className={isClosing ? 'row-highlight' : ''}
                                            >
                                                <td>
                                                    {idx.period}
                                                    {isClosing && (
                                                        <span className="badge badge-blue ml-sm">
                                                            CIERRE
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-right font-mono">
                                                    {formatNumber(idx.value, 2)}
                                                </td>
                                                <td className="text-right font-mono text-muted">
                                                    {coef > 0 ? formatCoef(coef) : '-'}
                                                </td>
                                                <td className="text-center">
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingIndex({ period: idx.period, value: idx.value });
                                                        }}
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Controls */}
                        {totalIndicesPages > 1 && (
                            <div className="cierre-pagination">
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={indicesPage <= 1}
                                    onClick={() => setIndicesPage((p) => Math.max(1, p - 1))}
                                >
                                    ← Anterior
                                </button>
                                <span className="cierre-pagination-info">
                                    Página {indicesPage} de {totalIndicesPages} ({sortedIndices.length} índices)
                                </span>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={indicesPage >= totalIndicesPages}
                                    onClick={() => setIndicesPage((p) => Math.min(totalIndicesPages, p + 1))}
                                >
                                    Siguiente →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: REEXPRESION */}
                {activeTab === 'reexpresion' && (
                    <div className="cierre-reexpresion">
                        {/* Info callout */}
                        <div className="cierre-callout cierre-callout-info">
                            <span className="cierre-callout-icon">{ICONS.info}</span>
                            <div>
                                <strong>Guía rápida RT6</strong>
                                <ul>
                                    <li>Las <strong>partidas no monetarias</strong> se reexpresan con coeficiente desde fecha de origen.</li>
                                    <li>Las <strong>partidas monetarias</strong> generan RECPAM. Usá el método indirecto para calcular automáticamente.</li>
                                    <li>Podés <strong>calcular automáticamente</strong> desde el Mayor o agregar partidas manualmente.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="step2-actions-bar">
                            <button
                                className="btn btn-secondary"
                                onClick={handleOpenRecpamDrawer}
                                disabled={ledgerLoading}
                            >
                                {ICONS.calculator} Método indirecto
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={handleRecalcular}
                                disabled={ledgerLoading}
                            >
                                🔄 Recalcular
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCalcularAutomaticamente}
                                disabled={ledgerLoading}
                            >
                                ✨ Calcular automáticamente
                            </button>
                        </div>

                        {/* Sub-tabs */}
                        <div className="step2-tabs">
                            <button
                                className={`step2-tab ${step2SubTab === 'monetarias' ? 'active' : ''}`}
                                onClick={() => setStep2SubTab('monetarias')}
                            >
                                {ICONS.dollar} Partidas Monetarias
                                <span className="badge">{ledgerTotals.totalNonZero || 0}</span>
                            </button>
                            <button
                                className={`step2-tab ${step2SubTab === 'nomonetarias' ? 'active' : ''}`}
                                onClick={() => setStep2SubTab('nomonetarias')}
                            >
                                📦 Partidas No Monetarias
                                <span className="badge">{computedRT6.length}</span>
                            </button>
                        </div>

                        {/* Tab Content */}
                        {step2SubTab === 'monetarias' && (
                            <MonetaryAccountsPanel
                                accounts={allAccounts}
                                balances={ledgerBalances}
                                overrides={state?.accountOverrides || {}}
                                onToggleClassification={handleToggleMonetaryClass}
                                onMarkValidated={handleMarkValidated}
                                onMarkAllValidated={handleMarkAllValidated}
                                onExclude={(accountId) => {
                                    setOverride(accountId, { exclude: true });
                                    showToast('Cuenta excluida');
                                }}
                            />
                        )}

                        {step2SubTab === 'nomonetarias' && (
                            <Step2RT6Panel
                                computedRT6={computedRT6}
                                onAddPartida={() => handleOpenRT6Drawer()}
                                onEditPartida={(id) => handleOpenRT6Drawer(id)}
                                onDeletePartida={(id) => setDeleteConfirm({ type: 'RT6', id })}
                            />
                        )}
                    </div>
                )}

                {/* TAB 3: VALUACION */}
                {/* TAB 3: VALUACION */}
                {activeTab === 'valuacion' && (
                    <Step3RT17Panel
                        computedRT17={computedRT17}
                        computedRT6={computedRT6}
                        onCompleteValuation={handleOpenRT17Drawer}
                        onGoToStep2={() => setActiveTab('reexpresion')}
                    />
                )}

                {/* TAB 4: ASIENTOS */}
                {activeTab === 'asientos' && (
                    <div className="cierre-asientos">
                        <div className="cierre-callout cierre-callout-warning">
                            <span className="cierre-callout-icon">{ICONS.warning}</span>
                            <div>
                                <strong>Borrador de Cierre</strong>
                                <p>
                                    Estos asientos son sugeridos. Revisá antes de contabilizar.
                                </p>
                            </div>
                        </div>

                        {asientosDraft.map((voucher, idx) => {
                            const sync = voucherSyncData.find(s => s.voucherKey === voucher.key);
                            const status = sync?.status || 'PENDIENTE';

                            return (
                                <div key={voucher.key} className="card cierre-asiento-card">
                                    <div className="cierre-asiento-header">
                                        <div>
                                            <span className="font-bold">ASIENTO #{idx + 1}</span>{' '}
                                            <span className="text-muted">{voucher.descripcion}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {status === 'ENVIADO' && <span className="badge badge-success">ENVIADO</span>}
                                            {status === 'PENDIENTE' && <span className="badge badge-warning">PENDIENTE</span>}
                                            {status === 'DESACTUALIZADO' && <span className="badge badge-orange">ACTUALIZACIÓN PENDIENTE</span>}

                                            {voucher.isValid ? (
                                                <span className="text-success font-bold">{ICONS.check} Balanceado</span>
                                            ) : (
                                                <span className="text-error font-bold">{ICONS.warning} No balanceado</span>
                                            )}
                                        </div>
                                    </div>

                                    {voucher.warning && (
                                        <div className="cierre-warning-banner mb-4">
                                            {ICONS.warning} {voucher.warning}
                                        </div>
                                    )}

                                    <div className="cierre-asiento-table-container">
                                        <table className="cierre-table">
                                            <thead>
                                                <tr>
                                                    <th>Cuenta</th>
                                                    <th className="text-right" style={{ width: 120 }}>Debe</th>
                                                    <th className="text-right" style={{ width: 120 }}>Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {voucher.lineas.map((linea, i) => (
                                                    <tr key={i}>
                                                        <td className="font-medium">
                                                            <div className="text-xs text-muted">{linea.cuentaCodigo}</div>
                                                            {linea.cuentaNombre}
                                                        </td>
                                                        <td className="text-right font-mono tabular-nums">
                                                            {linea.debe > 0 ? formatNumber(linea.debe) : '—'}
                                                        </td>
                                                        <td className="text-right font-mono tabular-nums">
                                                            {linea.haber > 0 ? formatNumber(linea.haber) : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="font-bold bg-slate-50">
                                                    <td>TOTALES</td>
                                                    <td className="text-right font-mono">{formatNumber(voucher.totalDebe)}</td>
                                                    <td className="text-right font-mono">{formatNumber(voucher.totalHaber)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="cierre-asiento-footer flex items-center justify-between">
                            <div className="flex gap-2">
                                {voucherSyncData.some(s => s.status === 'ENVIADO' || s.status === 'DESACTUALIZADO') && (
                                    <button
                                        className="btn btn-secondary flex items-center gap-2"
                                        onClick={() => navigate('/asientos')}
                                    >
                                        {ICONS.file} Ver en Libro Diario
                                    </button>
                                )}
                            </div>
                            <button
                                className="btn btn-primary"
                                disabled={!voucherSyncData.some(s => s.status === 'PENDIENTE' || s.status === 'DESACTUALIZADO')}
                                onClick={handleSendToLedger}
                            >
                                📤 Enviar a Libro Diario
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* DRAWERS */}
            <RT6Drawer
                isOpen={isRT6DrawerOpen}
                onClose={() => setRT6DrawerOpen(false)}
                editingId={editingRT6Id}
                partidas={state.partidasRT6}
                indices={indices}
                closingPeriod={closingPeriod}
                onSave={handleSaveRT6}
                onDelete={handleDeleteRT6}
            />

            <RT17Drawer
                isOpen={isRT17DrawerOpen}
                onClose={() => setRT17DrawerOpen(false)}
                editingPartida={computedRT17.find((p) => p.id === editingRT17Id)}
                onSave={handleSaveValuation}
            />

            <IndicesImportWizard
                isOpen={isImportWizardOpen}
                onClose={() => setImportWizardOpen(false)}
                onImport={handleImportIndices}
            />

            <RecpamIndirectoDrawer
                isOpen={isRecpamDrawerOpen}
                onClose={() => setRecpamDrawerOpen(false)}
                result={recpamResult}
                loading={recpamLoading}
            />

            {/* INDEX EDIT MODAL */}
            {
                editingIndex && (
                    <div className="cierre-edit-modal-overlay" onClick={() => setEditingIndex(null)}>
                        <div className="cierre-edit-modal" onClick={e => e.stopPropagation()}>
                            <h4>Editar Índice</h4>
                            <div className="form-group">
                                <label className="form-label">Período</label>
                                <input type="text" className="form-input" value={editingIndex.period} disabled />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Índice</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={editingIndex.value}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setEditingIndex((prev) => prev ? { ...prev, value: val } : null);
                                    }}
                                    step="0.01"
                                />
                            </div>
                            <div className="cierre-edit-modal-footer">
                                <button className="btn btn-secondary" onClick={() => setEditingIndex(null)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        if (editingIndex) {
                                            handleUpdateIndex(editingIndex.period, editingIndex.value);
                                            setEditingIndex(null);
                                            showToast('Índice actualizado');
                                        }
                                    }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* DELETE CONFIRMATION MODAL */}
            {
                deleteConfirm && (
                    <div className="cierre-edit-modal-overlay" onClick={() => setDeleteConfirm(null)}>
                        <div className="cierre-edit-modal" onClick={e => e.stopPropagation()}>
                            <h4>Confirmar eliminación</h4>
                            <p className="text-muted">¿Estás seguro de que querés eliminar esta {deleteConfirm.type === 'RT6' ? 'partida' : 'valuación'}?</p>
                            <div className="cierre-edit-modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => {
                                        if (deleteConfirm) {
                                            if (deleteConfirm.type === 'RT6') {
                                                handleDeleteRT6(deleteConfirm.id);
                                            } else {
                                                handleDeleteRT17(deleteConfirm.id);
                                            }
                                            setDeleteConfirm(null);
                                        }
                                    }}
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* TOAST */}
            {toast && <div className="cierre-toast">{toast}</div>}

            {/* STYLES */}
            <style>{`
                .cierre-page {
                    padding-bottom: 2rem;
                }
                .cierre-header {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    align-items: center;
                    gap: var(--space-md);
                    margin-bottom: var(--space-lg);
                    padding: var(--space-md) 0;
                    border-bottom: 1px solid var(--color-border);
                }
                .cierre-breadcrumb {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-xs);
                }
                .cierre-title {
                    font-size: var(--font-size-2xl);
                    font-weight: 700;
                    margin: 0;
                }
                .cierre-header-right {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                    flex-wrap: wrap;
                }
                .cierre-date-picker {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    background: var(--surface-2);
                    padding: var(--space-sm) var(--space-md);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--color-border);
                }
                .cierre-date-label {
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    text-transform: uppercase;
                    color: var(--color-text-secondary);
                }
                .cierre-warning-chip {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                    padding: var(--space-xs) var(--space-sm);
                    background: var(--color-warning-bg);
                    color: var(--color-warning);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .cierre-kpi-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--space-md);
                    margin-bottom: var(--space-lg);
                }
                .cierre-kpi-card {
                    background: var(--surface-2);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    padding: var(--space-md);
                    transition: all 0.2s ease;
                }
                /* Muted cards - less emphasis */
                .cierre-kpi-muted {
                    opacity: 0.85;
                    border-color: var(--color-border);
                }
                .cierre-kpi-muted .cierre-kpi-value {
                    font-size: var(--font-size-lg);
                    font-weight: 600;
                }
                /* Emphasis cards - more prominent */
                .cierre-kpi-emphasis {
                    background: linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%);
                    border: 2px solid transparent;
                    background-clip: padding-box;
                    position: relative;
                }
                .cierre-kpi-emphasis::before {
                    content: '';
                    position: absolute;
                    inset: -2px;
                    border-radius: calc(var(--radius-lg) + 2px);
                    background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #10B981 100%);
                    z-index: -1;
                }
                .cierre-kpi-emphasis .cierre-kpi-value {
                    font-size: var(--font-size-2xl);
                }
                .cierre-kpi-gradient-text {
                    background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .cierre-kpi-highlight {
                    background: var(--surface-1);
                    border-color: var(--brand-primary);
                    box-shadow: 0 0 0 1px var(--brand-primary);
                }
                .cierre-kpi-dark {
                    background: #0F172A;
                    color: white;
                    border: none;
                }
                .cierre-kpi-dark::before {
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                }
                .cierre-kpi-label {
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    text-transform: uppercase;
                    opacity: 0.7;
                    margin-bottom: var(--space-xs);
                }
                .cierre-kpi-value {
                    font-size: var(--font-size-xl);
                    font-weight: 700;
                    font-family: var(--font-mono);
                }
                .cierre-kpi-green { color: #10B981; }
                .cierre-kpi-sub {
                    font-size: var(--font-size-xs);
                    opacity: 0.6;
                    margin-top: var(--space-xs);
                }
                .cierre-kpi-cta {
                    margin-top: var(--space-sm);
                    background: none;
                    border: none;
                    color: #60A5FA;
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                    cursor: pointer;
                    padding: 0;
                }
                /* Edit Modal */
                .cierre-edit-modal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 200;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(15, 23, 42, 0.5);
                    backdrop-filter: blur(4px);
                }
                .cierre-edit-modal {
                    background: var(--surface-1);
                    border-radius: var(--radius-lg);
                    padding: var(--space-lg);
                    min-width: 320px;
                    box-shadow: var(--shadow-lg);
                }
                .cierre-edit-modal h4 {
                    margin: 0 0 var(--space-md) 0;
                    font-size: var(--font-size-lg);
                    font-weight: 600;
                }
                .cierre-edit-modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-sm);
                    margin-top: var(--space-md);
                }
                /* Pagination */
                .cierre-pagination {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-md);
                    padding: var(--space-md);
                    border-top: 1px solid var(--color-border);
                }
                .cierre-pagination-info {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }
                /* Grouped sections (RT6/RT17) */
                .cierre-grouped-sections {
                    padding: var(--space-md);
                }
                .cierre-grupo-section {
                    margin-bottom: var(--space-lg);
                }
                .cierre-grupo-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--space-sm);
                }
                .cierre-grupo-header h4 {
                    margin: 0;
                    font-size: var(--font-size-md);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .cierre-grupo-totals {
                    display: flex;
                    gap: var(--space-sm);
                    align-items: center;
                }
                .cierre-rubro-block {
                    background: var(--surface-1);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--space-sm);
                    overflow: hidden;
                }
                .cierre-rubro-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--color-border);
                }
                .cierre-rubro-title {
                    font-weight: 600;
                    font-size: var(--font-size-sm);
                }
                .cierre-rubro-actions {
                    display: flex;
                    gap: var(--space-xs);
                }
                .cierre-lot-table {
                    margin: 0;
                    border: none;
                    font-size: var(--font-size-sm);
                }
                .cierre-lot-table th {
                    font-size: var(--font-size-xs);
                    padding: var(--space-xs) var(--space-sm);
                    background: transparent;
                }
                .cierre-lot-table td {
                    padding: var(--space-xs) var(--space-sm);
                }
                .cierre-totals-row {
                    background: var(--surface-2);
                    border-top: 1px solid var(--color-border);
                }
                .cierre-totals-row td {
                    padding: var(--space-sm);
                }
                .cierre-tabs {
                    display: flex;
                    gap: var(--space-lg);
                    border-bottom: 1px solid var(--color-border);
                    margin-bottom: var(--space-lg);
                }
                .cierre-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) 0;
                    background: none;
                    border: none;
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    position: relative;
                    transition: color 0.2s;
                }
                .cierre-tab:hover { color: var(--color-text); }
                .cierre-tab.active {
                    color: var(--brand-primary);
                }
                .cierre-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: var(--brand-primary);
                    border-radius: 2px 2px 0 0;
                }
                .cierre-content { }
                .cierre-callout {
                    display: flex;
                    gap: var(--space-md);
                    padding: var(--space-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--space-md);
                }
                .cierre-callout-info {
                    background: var(--color-info-bg);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                }
                .cierre-callout-warning {
                    background: var(--color-warning-bg);
                    border: 1px solid rgba(245, 158, 11, 0.2);
                }
                .cierre-callout ul {
                    margin: var(--space-sm) 0 0 var(--space-md);
                    padding: 0;
                }
                .cierre-callout li { margin-bottom: var(--space-xs); }
                .cierre-recpam-card { background: var(--surface-2); }
                .cierre-recpam-grid {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: flex-end;
                    gap: var(--space-md);
                }
                .cierre-recpam-result {
                    margin-left: auto;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-1);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--color-border);
                }
                .cierre-recpam-label {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                }
                .cierre-recpam-value {
                    font-size: var(--font-size-lg);
                    font-weight: 700;
                    font-family: var(--font-mono);
                }
                .cierre-recpam-value.positive { color: var(--color-success); }
                .cierre-col-highlight { background: rgba(59, 130, 246, 0.05); }
                .cierre-tooltip {
                    cursor: help;
                    opacity: 0.5;
                    margin-left: var(--space-xs);
                }
                .cierre-reexpresion { display: flex; flex-direction: column; gap: var(--space-md); }
                .cierre-asientos { max-width: 800px; margin: 0 auto; }
                .cierre-asiento-card { overflow: hidden; }
                .cierre-asiento-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--color-border);
                }
                .cierre-asiento-body { padding: var(--space-md); }
                .cierre-asiento-footer {
                    display: flex;
                    justify-content: flex-end;
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-top: 1px solid var(--color-border);
                }
                .cierre-toast {
                    position: fixed;
                    bottom: var(--space-lg);
                    right: var(--space-lg);
                    background: #0F172A;
                    color: white;
                    padding: var(--space-sm) var(--space-md);
                    border-radius: var(--radius-md);
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    box-shadow: var(--shadow-lg);
                    z-index: 1000;
                    animation: slideIn 0.3s ease;
                }
                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .row-highlight { background: rgba(59, 130, 246, 0.05); }
                .hover-row:hover { background: var(--surface-2); }
                .cursor-pointer { cursor: pointer; }
                .status-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                .status-ok { background: var(--color-success); }
                .font-mono { font-family: var(--font-mono); }
                .font-medium { font-weight: 500; }
                .font-bold { font-weight: 700; }
                .text-success { color: var(--color-success); }
                .text-primary { color: var(--brand-primary); }
                .text-muted { color: var(--color-text-secondary); }
                .text-sm { font-size: var(--font-size-sm); }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .flex { display: flex; }
                .gap-sm { gap: var(--space-sm); }
                .ml-sm { margin-left: var(--space-sm); }
                .py-lg { padding-top: var(--space-lg); padding-bottom: var(--space-lg); }
                .badge-sm { font-size: 0.65rem; padding: 2px 6px; }
                .badge-orange { background: #FEF3C7; color: #D97706; }
                .btn-ghost {
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    cursor: pointer;
                    font-weight: 500;
                }
                .btn-ghost:hover { text-decoration: underline; }

                /* Step 2 RT6 Auto styles */
                .step2-actions-bar {
                    display: flex;
                    gap: var(--space-sm);
                    justify-content: flex-end;
                    margin-bottom: var(--space-md);
                }

                .step2-tabs {
                    display: flex;
                    gap: var(--space-sm);
                    border-bottom: 1px solid var(--color-border);
                    margin-bottom: var(--space-lg);
                }

                .step2-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) var(--space-md);
                    background: none;
                    border: none;
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    position: relative;
                    transition: color 0.2s;
                    border-bottom: 2px solid transparent;
                }

                .step2-tab:hover {
                    color: var(--color-text);
                }

                .step2-tab.active {
                    color: var(--brand-primary);
                    border-bottom-color: var(--brand-primary);
                    background: rgba(59, 130, 246, 0.05);
                }

                .step2-tab .badge {
                    background: var(--surface-3);
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-xs);
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                }

                .step2-tab.active .badge {
                    background: var(--brand-primary);
                    color: white;
                }
            `}</style>
        </div >
    );
}
