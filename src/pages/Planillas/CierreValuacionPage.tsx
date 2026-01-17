/**
 * CierreValuacionPage - Main Page Component
 *
 * Implements the "Cierre: AxI + Valuación" planilla tool with 4 tabs.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    type TabId,
    type IndexRow,
    type PartidaRT6,
    type PartidaRT17,
    type CierreValuacionState,
    getPeriodFromDate,
    getIndexForPeriod,
    computeAllRT6Partidas,
    computeAllRT17Partidas,
    calculateRT6Totals,
    calculateRT17Totals,
    calculateRecpamEstimado,
    generateAsientoRT6,
    formatCurrencyARS,
    formatNumber,
    formatCoef,
} from '../../core/cierre-valuacion';
import {
    loadCierreValuacionState,
    saveCierreValuacionState,
} from '../../storage';
import { RT6Drawer } from './components/RT6Drawer';
import { RT17Drawer } from './components/RT17Drawer';
import { IndicesImportWizard } from './components/IndicesImportWizard';

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
    // =============================================
    // State
    // =============================================
    const [state, setState] = useState<CierreValuacionState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('reexpresion');
    const [toast, setToast] = useState<string | null>(null);

    // Drawer state
    const [isRT6DrawerOpen, setRT6DrawerOpen] = useState(false);
    const [editingRT6Id, setEditingRT6Id] = useState<string | null>(null);
    const [isRT17DrawerOpen, setRT17DrawerOpen] = useState(false);
    const [editingRT17Id, setEditingRT17Id] = useState<string | null>(null);

    // Import wizard and edit modal state
    const [isImportWizardOpen, setImportWizardOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState<{ period: string; value: number } | null>(null);
    // TODO: Grouped tables feature - uncomment when implementing D and E
    // const [expandedRT6, setExpandedRT6] = useState<Set<string>>(new Set());
    // const [expandedRT17, setExpandedRT17] = useState<Set<string>>(new Set());

    // Refs
    const saveTimeoutRef = useRef<number | null>(null);

    // =============================================
    // Load & Save
    // =============================================
    useEffect(() => {
        async function load() {
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

    // Computed partidas
    const computedRT6 = useMemo(
        () => computeAllRT6Partidas(state?.partidasRT6 || [], indices, closingPeriod),
        [state?.partidasRT6, indices, closingPeriod]
    );

    const computedRT17 = useMemo(
        () => computeAllRT17Partidas(state?.partidasRT17 || [], computedRT6),
        [state?.partidasRT17, computedRT6]
    );

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
    const asientoRT6 = useMemo(() => generateAsientoRT6(computedRT6), [computedRT6]);

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

    const handleSaveRT17 = (partida: PartidaRT17) => {
        updateState((prev) => {
            const exists = prev.partidasRT17.find((p) => p.id === partida.id);
            if (exists) {
                return {
                    ...prev,
                    partidasRT17: prev.partidasRT17.map((p) => (p.id === partida.id ? partida : p)),
                };
            }
            return { ...prev, partidasRT17: [...prev.partidasRT17, partida] };
        });
        setRT17DrawerOpen(false);
        showToast('Valuación guardada');
    };

    // RECPAM handlers
    const handleRecpamChange = (field: 'activeMon' | 'passiveMon', value: number) => {
        updateState((prev) => ({
            ...prev,
            recpamInputs: { ...prev.recpamInputs, [field]: value },
        }));
    };

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

                    <button className="btn btn-primary" onClick={handleGenerarAsientos}>
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
                                    {indices.map((idx) => {
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
                                    <li>
                                        Las <strong>partidas no monetarias</strong> se reexpresan
                                        con coeficiente desde fecha de origen.
                                    </li>
                                    <li>
                                        Las <strong>partidas monetarias</strong> generan RECPAM.
                                        Usá la calculadora de abajo.
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* RECPAM Calculator */}
                        <div className="card cierre-recpam-card">
                            <div className="card-header">
                                <h4>
                                    {ICONS.calculator} Papel de trabajo: Estimación RECPAM
                                </h4>
                                <span className="badge">Estimación</span>
                            </div>
                            <div className="cierre-recpam-grid">
                                <div className="form-group">
                                    <label className="form-label">Activos Monetarios</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={recpamInputs.activeMon || ''}
                                        onChange={(e) =>
                                            handleRecpamChange('activeMon', Number(e.target.value))
                                        }
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Pasivos Monetarios</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={recpamInputs.passiveMon || ''}
                                        onChange={(e) =>
                                            handleRecpamChange('passiveMon', Number(e.target.value))
                                        }
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="cierre-recpam-result">
                                    <div className="cierre-recpam-label">RECPAM Estimado</div>
                                    <div
                                        className={`cierre-recpam-value ${recpamEstimado > 0 ? 'positive' : ''
                                            }`}
                                    >
                                        {formatCurrencyARS(recpamEstimado)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RT6 Table */}
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Partidas No Monetarias</h3>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleOpenRT6Drawer()}
                                >
                                    {ICONS.plus} Agregar Partida
                                </button>
                            </div>
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Cuenta / Rubro</th>
                                            <th className="text-right">Valor Origen</th>
                                            <th className="text-right cierre-col-highlight">
                                                Valor Homogéneo
                                            </th>
                                            <th className="text-right">
                                                RECPAM (RT6)
                                                <span
                                                    className="cierre-tooltip"
                                                    title="Valor Homogéneo − Valor Base"
                                                >
                                                    {ICONS.info}
                                                </span>
                                            </th>
                                            <th className="text-center">Estado</th>
                                            <th className="text-center" style={{ width: 40 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {computedRT6.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="cursor-pointer hover-row"
                                                onClick={() => handleOpenRT6Drawer(row.id)}
                                            >
                                                <td>
                                                    <div className="font-medium">{row.cuentaNombre}</div>
                                                    <div className="text-muted text-sm">
                                                        {row.cuentaCodigo}{' '}
                                                        <span className="badge badge-sm">
                                                            {row.rubro}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="text-right font-mono">
                                                    {formatNumber(row.totalBase)}
                                                </td>
                                                <td className="text-right font-mono font-bold cierre-col-highlight">
                                                    {formatNumber(row.totalHomog)}
                                                </td>
                                                <td className="text-right font-mono text-success">
                                                    +{formatNumber(row.totalRecpam)}
                                                </td>
                                                <td className="text-center">
                                                    {row.status === 'ok' ? (
                                                        <span className="status-dot status-ok"></span>
                                                    ) : (
                                                        <span className="badge badge-red">
                                                            Revisar
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-center">
                                                    <span className="text-muted">{ICONS.edit}</span>
                                                </td>
                                            </tr>
                                        ))}
                                        {computedRT6.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="text-center text-muted py-lg">
                                                    No hay partidas. Hacé clic en "Agregar Partida".
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: VALUACION */}
                {activeTab === 'valuacion' && (
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">
                                    {ICONS.dollar} Valuación a Valores Corrientes (RT17)
                                </h3>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleOpenRT17Drawer()}
                            >
                                {ICONS.plus} Agregar Partida
                            </button>
                        </div>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Cuenta</th>
                                        <th>Tipo</th>
                                        <th className="text-right">Valor Corriente</th>
                                        <th className="text-right">Base Comparativa</th>
                                        <th className="text-right text-primary">R.x.T.</th>
                                        <th className="text-center" style={{ width: 40 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {computedRT17.map((p) => (
                                        <tr
                                            key={p.id}
                                            className="cursor-pointer hover-row"
                                            onClick={() => handleOpenRT17Drawer(p.id)}
                                        >
                                            <td className="font-medium">{p.cuentaNombre}</td>
                                            <td>
                                                <span
                                                    className={`badge ${p.type === 'USD' ? 'badge-blue' : ''
                                                        }`}
                                                >
                                                    {p.type}
                                                </span>
                                            </td>
                                            <td className="text-right font-mono font-bold">
                                                {formatNumber(p.valCorriente)}
                                            </td>
                                            <td className="text-right font-mono text-muted">
                                                {formatNumber(p.baseReference)}
                                            </td>
                                            <td className="text-right font-mono font-bold text-primary">
                                                {p.resTenencia > 0 ? '+' : ''}
                                                {formatNumber(p.resTenencia)}
                                            </td>
                                            <td className="text-center">
                                                <span className="text-muted">{ICONS.edit}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {computedRT17.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="text-center text-muted py-lg">
                                                No hay partidas. Hacé clic en "Agregar Partida".
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
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

                        {/* Asiento RT6 */}
                        <div className="card cierre-asiento-card">
                            <div className="cierre-asiento-header">
                                <div>
                                    <span className="font-bold">ASIENTO #1</span>{' '}
                                    <span className="text-muted">{asientoRT6.descripcion}</span>
                                </div>
                                <span className="badge badge-orange">Borrador</span>
                            </div>
                            <div className="cierre-asiento-body">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Cuenta</th>
                                            <th className="text-right" style={{ width: 120 }}>
                                                Debe
                                            </th>
                                            <th className="text-right" style={{ width: 120 }}>
                                                Haber
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {asientoRT6.lineas.map((linea, i) => (
                                            <tr key={i}>
                                                <td className="font-medium">{linea.cuentaNombre}</td>
                                                <td className="text-right font-mono">
                                                    {linea.debe > 0 ? formatNumber(linea.debe) : '-'}
                                                </td>
                                                <td className="text-right font-mono">
                                                    {linea.haber > 0 ? formatNumber(linea.haber) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="cierre-asiento-footer">
                                <button
                                    className="btn btn-secondary"
                                    disabled
                                    title="Próximamente"
                                >
                                    📤 Enviar a Libro Diario
                                </button>
                            </div>
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
                editingId={editingRT17Id}
                partidas={state.partidasRT17}
                onSave={handleSaveRT17}
            />

            {/* IMPORT WIZARD */}
            <IndicesImportWizard
                isOpen={isImportWizardOpen}
                onClose={() => setImportWizardOpen(false)}
                onImport={handleImportIndices}
            />

            {/* INDEX EDIT MODAL */}
            {editingIndex && (
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
                                onChange={(e) => setEditingIndex({ ...editingIndex, value: Number(e.target.value) })}
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
                                    handleUpdateIndex(editingIndex.period, editingIndex.value);
                                    setEditingIndex(null);
                                    showToast('Índice actualizado');
                                }}
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
            `}</style>
        </div>
    );
}
