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
import { loadCierreValuacionState, saveCierreValuacionState, clearCierreValuacionState } from '../../storage';
import { getAllAccounts } from '../../storage/accounts';
import { Account } from '../../core/models';
import { RT6Drawer } from './components/RT6Drawer';
import { RT17Drawer } from './components/RT17Drawer';
import { IndicesImportWizard } from './components/IndicesImportWizard';
import { Step2RT6Panel } from './components/Step2RT6Panel';
import { Step3RT17Panel } from './components/Step3RT17Panel';
import { RecpamIndirectoDrawer } from './components/RecpamIndirectoDrawer';
import { useLedgerBalances } from '../../hooks/useLedgerBalances';
import { autoGeneratePartidasRT6 } from '../../core/cierre-valuacion/auto-partidas-rt6';
import { calculateRecpamIndirecto, type RecpamIndirectoResult } from '../../core/cierre-valuacion/recpam-indirecto';
import type { MonetaryClass } from '../../core/cierre-valuacion/monetary-classification';
import { createEntry, updateEntry } from '../../storage/entries';
import { computeVoucherHash, findEntryByVoucherKey } from '../../core/cierre-valuacion/sync';

// Phosphor icon class names (consistent with prototype)
const ICON_CLASSES = {
    back: 'ph-bold ph-arrow-left',
    calendar: 'ph ph-calendar',
    warning: 'ph-fill ph-warning',
    check: 'ph-bold ph-check',
    plus: 'ph-bold ph-plus',
    edit: 'ph-bold ph-pencil-simple',
    trending: 'ph-fill ph-trend-up',
    calculator: 'ph-fill ph-calculator',
    dollar: 'ph-fill ph-currency-dollar',
    file: 'ph-fill ph-notebook',
    download: 'ph-bold ph-download-simple',
    info: 'ph-fill ph-info',
    magicWand: 'ph-bold ph-magic-wand',
    scales: 'ph-fill ph-scales',
    database: 'ph-fill ph-database',
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

    // RT6 Reexpresion states
    const [isMetodoIndirectoOpen, setMetodoIndirectoOpen] = useState(false);
    const [isAnalyzingMayor, setAnalyzingMayor] = useState(false);
    const [lastMayorAnalysis, setLastMayorAnalysis] = useState<string | undefined>(undefined);
    const [recpamIndirectoResult, setRecpamIndirectoResult] = useState<RecpamIndirectoResult | null>(null);
    const [recpamIndirectoLoading, setRecpamIndirectoLoading] = useState(false);

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

    // Ledger balances for RT6 classification
    const ledgerBalances = useLedgerBalances(allJournalEntries, allAccounts, { closingDate });

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

    // RT6 Panel handlers
    const handleAnalyzeMayor = useCallback(() => {
        if (!state || !allJournalEntries) return;

        setAnalyzingMayor(true);

        // Default to start of year based on closingDate
        const year = closingDate.substring(0, 4);
        const startOfPeriod = `${year}-01-01`;

        try {
            const result = autoGeneratePartidasRT6(
                allAccounts,
                ledgerBalances.byAccount,
                state.accountOverrides || {},
                {
                    startOfPeriod,
                    closingDate,
                    groupByMonth: true,
                    minLotAmount: 0,
                }
            );

            updateState((prev) => ({
                ...prev,
                partidasRT6: result.partidas,
            }));

            setLastMayorAnalysis(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
            showToast(`Generadas ${result.stats.partidasGenerated} partidas RT6`);
        } catch (err) {
            console.error('Error analyzing mayor:', err);
            showToast('Error al analizar el mayor');
        } finally {
            setAnalyzingMayor(false);
        }
    }, [state, allJournalEntries, allAccounts, ledgerBalances.byAccount, closingDate, updateState]);

    const handleRecalculate = useCallback(() => {
        // Recalculate is essentially the same as analyze but without re-generating partidas
        // Just triggers a re-render by updating state timestamp
        showToast('Coeficientes recalculados');
    }, []);

    const handleOpenMetodoIndirecto = useCallback(() => {
        if (!state || !allJournalEntries) return;

        setMetodoIndirectoOpen(true);
        setRecpamIndirectoLoading(true);

        // Default to start of year based on closingDate
        const year = closingDate.substring(0, 4);
        const startOfPeriod = `${year}-01-01`;

        try {
            const result = calculateRecpamIndirecto(
                allJournalEntries,
                allAccounts,
                state.accountOverrides || {},
                indices,
                startOfPeriod,
                closingDate
            );
            setRecpamIndirectoResult(result);
        } catch (err) {
            console.error('Error calculating RECPAM indirecto:', err);
            setRecpamIndirectoResult(null);
        } finally {
            setRecpamIndirectoLoading(false);
        }
    }, [state, allJournalEntries, allAccounts, indices, closingDate]);

    const handleToggleClassification = useCallback((accountId: string, _currentClass: MonetaryClass) => {
        updateState((prev) => {
            const overrides = { ...(prev.accountOverrides || {}) };
            const existing = overrides[accountId] || {};

            // Toggle between MONETARY and NON_MONETARY
            const newClass = existing.classification === 'NON_MONETARY' ? 'MONETARY' : 'NON_MONETARY';
            overrides[accountId] = {
                ...existing,
                classification: newClass as 'MONETARY' | 'NON_MONETARY',
            };

            return { ...prev, accountOverrides: overrides };
        });
        showToast('Clasificación actualizada');
    }, [updateState]);

    // Handler: Clear all planilla data
    const handleClearAll = useCallback(async () => {
        const confirmed = window.confirm(
            '¿Estás seguro que querés limpiar toda la planilla?\n\n' +
            'Esto eliminará:\n' +
            '• Todas las partidas RT6 (auto y manuales)\n' +
            '• Todos los overrides de clasificación\n' +
            '• Todas las valuaciones RT17\n\n' +
            'Los índices se mantendrán.'
        );
        if (!confirmed) return;

        await clearCierreValuacionState();
        // Reload state
        const freshState = await loadCierreValuacionState();
        setState(freshState);
        showToast('Planilla limpiada');
    }, []);

    // Handler: Exclude account from RT6 calculations
    const handleExcludeAccount = useCallback((accountId: string) => {
        const confirmed = window.confirm(
            '¿Excluir esta cuenta del cálculo RT6?\n\n' +
            'La cuenta no aparecerá en Monetarias ni en \"Sin clasificar\".'
        );
        if (!confirmed) return;

        updateState((prev) => {
            const overrides = { ...(prev.accountOverrides || {}) };
            overrides[accountId] = {
                ...overrides[accountId],
                exclude: true,
            };
            return { ...prev, accountOverrides: overrides };
        });
        showToast('Cuenta excluida');
    }, [updateState]);

    // Handler: Add account as manual monetary
    const handleAddMonetaryManual = useCallback((accountId: string) => {
        updateState((prev) => {
            const overrides = { ...(prev.accountOverrides || {}) };
            overrides[accountId] = {
                ...overrides[accountId],
                classification: 'MONETARY',
                exclude: false,
            };
            return { ...prev, accountOverrides: overrides };
        });
        showToast('Cuenta agregada a Monetarias');
    }, [updateState]);

    // =============================================
    // Render
    // =============================================
    if (isLoading || !state) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon"><i className="ph ph-spinner ph-spin" /></div>
                <p>Cargando planilla...</p>
            </div>
        );
    }

    const tabs = [
        { id: 'indices' as TabId, label: 'Índices', iconClass: 'ph ph-chart-line-up' },
        { id: 'reexpresion' as TabId, label: 'Reexpresión', iconClass: 'ph ph-arrows-clockwise' },
        { id: 'valuacion' as TabId, label: 'Valuación', iconClass: 'ph ph-scales' },
        { id: 'asientos' as TabId, label: 'Asientos', iconClass: 'ph ph-notebook' },
    ];

    return (
        <div className="cierre-page">
            {/* HEADER */}
            <header className="cierre-header">
                <div className="cierre-header-left">
                    <button
                        className="cierre-back-btn"
                        onClick={() => navigate('/planillas')}
                        title="Volver a Planillas"
                    >
                        <i className={ICON_CLASSES.back} />
                    </button>
                    <div>
                        <h1 className="cierre-title">Reexpresión y Valuación</h1>
                        <p className="cierre-subtitle">Ajuste por Inflación + Valuación • Periodo {closingDate.substring(0, 4)}</p>
                    </div>
                </div>

                <div className="cierre-header-right">
                    <label className="cierre-date-picker" htmlFor="cierre-date-input">
                        <i className={ICON_CLASSES.calendar} />
                        <span className="cierre-date-value">{new Date(closingDate + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                        <input
                            id="cierre-date-input"
                            type="date"
                            value={closingDate}
                            onChange={handleDateChange}
                            className="cierre-date-input"
                            aria-label="Fecha de cierre"
                        />
                    </label>

                    {isMissingClosingIndex && (
                        <div className="cierre-warning-chip">
                            <i className={ICON_CLASSES.warning} /> Falta índice {closingPeriod}
                        </div>
                    )}

                    <button
                        className="btn btn-gradient"
                        onClick={handleGenerarAsientos}
                        disabled={!canGenerateAsientos(computedRT17)}
                        title={!canGenerateAsientos(computedRT17) ? "Completá todas las valuaciones pendientes para generar asientos" : ""}
                    >
                        <i className={ICON_CLASSES.magicWand} />
                        <span className="btn-text-desktop">Generar Asientos</span>
                    </button>
                </div>
            </header>

            {/* KPI CARDS */}
            <div className="cierre-kpi-row">
                <div className="cierre-kpi-card">
                    <div className="cierre-kpi-label">Activo Histórico</div>
                    <div className="cierre-kpi-value">{formatCurrencyARS(rt6Totals.totalBase)}</div>
                    <div className="cierre-kpi-sub">
                        <i className={ICON_CLASSES.database} /> Base contable
                    </div>
                </div>
                <div className="cierre-kpi-card">
                    <div className="cierre-kpi-label">Ajustado al Cierre</div>
                    <div className="cierre-kpi-value cierre-kpi-primary">{formatCurrencyARS(rt6Totals.totalHomog)}</div>
                    <div className="cierre-kpi-sub cierre-kpi-sub-success">
                        <i className={ICON_CLASSES.trending} /> {rt6Totals.totalBase > 0 ? `+${formatNumber(((rt6Totals.totalHomog / rt6Totals.totalBase) - 1) * 100, 1)}% Variación` : '-'}
                    </div>
                </div>
                <div className="cierre-kpi-card">
                    <div className="cierre-kpi-label">Impacto RECPAM</div>
                    <div className="cierre-kpi-value cierre-kpi-warning">
                        {formatCurrencyARS(rt6Totals.totalRecpam + recpamEstimado)}
                    </div>
                    <div className="cierre-kpi-sub">
                        <i className={ICON_CLASSES.calculator} /> Estimado RT6
                    </div>
                </div>
                <div className="cierre-kpi-card cierre-kpi-card-accent">
                    <div className="cierre-kpi-icon-bg"><i className={ICON_CLASSES.scales} /></div>
                    <div className="cierre-kpi-label">Valuación RT17</div>
                    <div className="cierre-kpi-value">{formatCurrencyARS(rt17Totals.totalResTenencia)}</div>
                    <button
                        className="cierre-kpi-link"
                        onClick={() => setActiveTab('valuacion')}
                    >
                        Ver detalle <i className="ph-bold ph-arrow-right" />
                    </button>
                </div>
            </div>

            {/* STEPPER (Visual Progress) */}
            <nav className="cierre-stepper" aria-label="Progreso">
                {tabs.map((tab, idx) => {
                    const isActive = activeTab === tab.id;
                    const isPast = tabs.findIndex(t => t.id === activeTab) > idx;
                    return (
                        <button
                            key={tab.id}
                            className={`cierre-step ${isActive ? 'active' : ''} ${isPast ? 'completed' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <div className="cierre-step-circle">
                                {isPast ? <i className="ph-bold ph-check" /> : <span>{idx + 1}</span>}
                            </div>
                            <span className="cierre-step-label">{tab.label}</span>
                            {idx < tabs.length - 1 && <div className="cierre-step-line" />}
                        </button>
                    );
                })}
            </nav>

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
                                    <i className={ICON_CLASSES.download} /> Importar
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
                        <Step2RT6Panel
                            accounts={allAccounts}
                            balances={ledgerBalances.byAccount}
                            overrides={state.accountOverrides || {}}
                            indices={indices}
                            closingDate={closingDate}
                            computedRT6={computedRT6}
                            lastAnalysis={lastMayorAnalysis}
                            onAnalyzeMayor={handleAnalyzeMayor}
                            onClearAll={handleClearAll}
                            onRecalculate={handleRecalculate}
                            onOpenMetodoIndirecto={handleOpenMetodoIndirecto}
                            onToggleClassification={handleToggleClassification}
                            onExcludeAccount={handleExcludeAccount}
                            onAddMonetaryManual={handleAddMonetaryManual}
                            onAddPartida={() => handleOpenRT6Drawer()}
                            onEditPartida={(id) => handleOpenRT6Drawer(id)}
                            onDeletePartida={(id) => setDeleteConfirm({ type: 'RT6', id })}
                            isAnalyzing={isAnalyzingMayor}
                        />
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
                            <i className={ICON_CLASSES.warning} />
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
                                                <span className="text-success font-bold"><i className={ICON_CLASSES.check} /> Balanceado</span>
                                            ) : (
                                                <span className="text-error font-bold"><i className={ICON_CLASSES.warning} /> No balanceado</span>
                                            )}
                                        </div>
                                    </div>

                                    {voucher.warning && (
                                        <div className="cierre-warning-banner mb-4">
                                            <i className={ICON_CLASSES.warning} /> {voucher.warning}
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
                                        <i className={ICON_CLASSES.file} /> Ver en Libro Diario
                                    </button>
                                )}
                            </div>
                            <button
                                className="btn btn-primary"
                                disabled={!voucherSyncData.some(s => s.status === 'PENDIENTE' || s.status === 'DESACTUALIZADO')}
                                onClick={handleSendToLedger}
                            >
                                <i className="ph-bold ph-upload-simple" /> Enviar a Libro Diario
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
                isOpen={isMetodoIndirectoOpen}
                onClose={() => setMetodoIndirectoOpen(false)}
                result={recpamIndirectoResult}
                loading={recpamIndirectoLoading}
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
                    padding: var(--space-md) var(--space-lg);
                    background: white;
                    border-bottom: 1px solid var(--color-border);
                    position: sticky;
                    top: 0;
                    z-index: 20;
                }
                .cierre-header-left {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                }
                .cierre-back-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: var(--surface-2);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all 0.15s ease;
                    color: var(--color-text-secondary);
                }
                .cierre-back-btn:hover {
                    background: var(--surface-3);
                    color: var(--brand-primary);
                }
                .cierre-back-btn i { font-size: 1.25rem; }
                .cierre-title {
                    font-family: var(--font-display, 'Outfit', sans-serif);
                    font-size: var(--font-size-xl);
                    font-weight: 700;
                    margin: 0;
                    color: var(--color-text);
                    letter-spacing: -0.02em;
                }
                .cierre-subtitle {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    margin: var(--space-xs) 0 0 0;
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
                    position: relative;
                    cursor: pointer;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .cierre-date-picker:hover {
                    border-color: var(--brand-primary);
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
                }
                .cierre-date-picker i { color: var(--color-text-secondary); pointer-events: none; }
                .cierre-date-value {
                    font-family: var(--font-mono);
                    font-size: var(--font-size-sm);
                    color: var(--color-text);
                    pointer-events: none;
                }
                .cierre-date-input {
                    position: absolute;
                    inset: 0;
                    opacity: 0;
                    cursor: pointer;
                    width: 100%;
                    height: 100%;
                    z-index: 1;
                }
                .btn-gradient {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%);
                    color: white;
                    border: none;
                    padding: var(--space-sm) var(--space-md);
                    border-radius: var(--radius-md);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.25);
                }
                .btn-gradient:hover {
                    background: linear-gradient(135deg, #2563EB 0%, #059669 100%);
                    transform: translateY(-1px);
                }
                .btn-gradient:active { transform: scale(0.98); }
                .btn-gradient:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                .btn-text-desktop { display: none; }
                @media (min-width: 640px) {
                    .btn-text-desktop { display: inline; }
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
                /* KPI Row */
                .cierre-kpi-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--space-md);
                    margin-bottom: var(--space-lg);
                    padding: 0 var(--space-lg);
                }
                .cierre-kpi-card {
                    background: white;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    padding: var(--space-md);
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                    position: relative;
                    overflow: hidden;
                }
                .cierre-kpi-card:hover {
                    border-color: rgba(59, 130, 246, 0.3);
                }
                .cierre-kpi-card-accent {
                    background: white;
                }
                .cierre-kpi-icon-bg {
                    position: absolute;
                    right: 0;
                    top: 0;
                    padding: var(--space-md);
                    opacity: 0.1;
                }
                .cierre-kpi-icon-bg i { font-size: 2rem; color: var(--brand-primary); }
                .cierre-kpi-label {
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-xs);
                }
                .cierre-kpi-value {
                    font-size: var(--font-size-xl);
                    font-weight: 600;
                    font-family: var(--font-mono);
                    color: var(--color-text);
                }
                .cierre-kpi-primary { color: var(--brand-primary); }
                .cierre-kpi-warning { color: #F59E0B; }
                .cierre-kpi-sub {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                    margin-top: var(--space-sm);
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                }
                .cierre-kpi-sub i { font-size: 0.85rem; }
                .cierre-kpi-sub-success { color: #10B981; font-weight: 500; }
                .cierre-kpi-link {
                    margin-top: var(--space-sm);
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    font-size: var(--font-size-xs);
                    font-weight: 500;
                    cursor: pointer;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                }
                .cierre-kpi-link:hover { text-decoration: underline; }

                /* Stepper */
                .cierre-stepper {
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    padding: var(--space-lg) var(--space-lg) calc(var(--space-lg) + var(--space-md));
                    gap: 0;
                }
                .cierre-step {
                    display: flex;
                    align-items: center;
                    position: relative;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                }
                .cierre-step-circle {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    background: white;
                    border: 2px solid var(--color-border);
                    color: var(--color-text-secondary);
                    transition: all 0.2s ease;
                }
                .cierre-step.active .cierre-step-circle {
                    border-color: var(--brand-primary);
                    background: white;
                }
                .cierre-step.active .cierre-step-circle::after {
                    content: '';
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: var(--brand-primary);
                }
                .cierre-step.active .cierre-step-circle span { display: none; }
                .cierre-step.completed .cierre-step-circle {
                    background: var(--brand-primary);
                    border-color: var(--brand-primary);
                    color: white;
                }
                .cierre-step:hover .cierre-step-circle {
                    border-color: var(--brand-primary);
                }
                .cierre-step-label {
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    margin-top: var(--space-sm);
                    font-size: var(--font-size-xs);
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    white-space: nowrap;
                }
                .cierre-step.active .cierre-step-label {
                    font-weight: 700;
                    color: var(--color-text);
                }
                .cierre-step.completed .cierre-step-label {
                    color: var(--brand-primary);
                }
                .cierre-step-line {
                    width: 80px;
                    height: 2px;
                    background: var(--color-border);
                    margin: 0 var(--space-xs);
                }
                .cierre-step.completed + .cierre-step .cierre-step-line,
                .cierre-step.completed .cierre-step-line {
                    background: var(--brand-primary);
                }
                @media (max-width: 640px) {
                    .cierre-step-line { width: 40px; }
                    .cierre-step-label { font-size: 0.65rem; }
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
                .cierre-content {
                    padding: 0 var(--space-lg);
                }
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
