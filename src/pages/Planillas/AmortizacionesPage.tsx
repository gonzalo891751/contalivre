/**
 * AmortizacionesPage - Depreciation Calculator Tool
 * 
 * Main page for the "Planillas complementarias" section.
 * Provides a spreadsheet-like interface for calculating asset depreciation.
 */

import { useState, useEffect, useCallback, useRef, useMemo, type KeyboardEvent, type ChangeEvent } from 'react'
import {
    type AmortizationState,
    type AmortizationAsset,
    type AmortizationParams,
    type AmortizationRow,
    createInitialState,
    createDefaultAsset,
    generateAssetId,
} from '../../core/amortizaciones/types'
import {
    calculateAllRows,
    calculateTotals,
    formatCurrencyARS,
    exportToCSV,
    downloadCSV,
    parseArgentineNumber,
} from '../../core/amortizaciones/calc'
import {
    loadAmortizationState,
    saveAmortizationState,
    clearAmortizationState,
} from '../../storage'

// Tabs for future expansion
const TABS = [
    { id: 'amortizaciones', label: 'Amortizaciones' },
    // Future: { id: 'provisiones', label: 'Provisiones' },
]

export default function AmortizacionesPage() {
    const [state, setState] = useState<AmortizationState | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('amortizaciones')
    const [showClearModal, setShowClearModal] = useState(false)
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
    const tableRef = useRef<HTMLTableElement>(null)
    const saveTimeoutRef = useRef<number | null>(null)

    // Load initial state
    useEffect(() => {
        async function load() {
            const loadedState = await loadAmortizationState()
            setState(loadedState)
            setIsLoading(false)
        }
        load()
    }, [])

    // Auto-save with debounce
    const debouncedSave = useCallback((newState: AmortizationState) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveAmortizationState(newState)
        }, 500)
    }, [])

    // Update state and trigger save
    const updateState = useCallback((updater: (prev: AmortizationState) => AmortizationState) => {
        setState(prev => {
            if (!prev) return prev
            const newState = updater(prev)
            debouncedSave(newState)
            return newState
        })
    }, [debouncedSave])

    // Update params
    const updateParams = useCallback((updates: Partial<AmortizationParams>) => {
        updateState(prev => ({
            ...prev,
            params: { ...prev.params, ...updates },
            // Update assets that don't have overrideGlobals
            assets: prev.assets.map(asset =>
                asset.overrideGlobals
                    ? asset
                    : {
                        ...asset,
                        residualPct: updates.residualPctGlobal ?? asset.residualPct,
                        amortizablePct: updates.amortizablePctGlobal ?? asset.amortizablePct,
                    }
            ),
        }))
    }, [updateState])

    // Update single asset
    const updateAsset = useCallback((id: string, updates: Partial<AmortizationAsset>) => {
        updateState(prev => ({
            ...prev,
            assets: prev.assets.map(asset =>
                asset.id === id
                    ? {
                        ...asset,
                        ...updates,
                        // Mark as override if editing percentages
                        overrideGlobals: updates.residualPct !== undefined || updates.amortizablePct !== undefined
                            ? true
                            : asset.overrideGlobals,
                    }
                    : asset
            ),
        }))
    }, [updateState])

    // Add new row
    const addRow = useCallback(() => {
        if (!state) return
        const newAsset = createDefaultAsset(generateAssetId(), state.params)
        updateState(prev => ({
            ...prev,
            assets: [...prev.assets, newAsset],
        }))
    }, [state, updateState])

    // Duplicate row
    const duplicateRow = useCallback((id: string) => {
        updateState(prev => {
            const sourceAsset = prev.assets.find(a => a.id === id)
            if (!sourceAsset) return prev
            const newAsset: AmortizationAsset = {
                ...sourceAsset,
                id: generateAssetId(),
                detalle: `${sourceAsset.detalle} (copia)`,
            }
            const sourceIndex = prev.assets.findIndex(a => a.id === id)
            const newAssets = [...prev.assets]
            newAssets.splice(sourceIndex + 1, 0, newAsset)
            return { ...prev, assets: newAssets }
        })
    }, [updateState])

    // Delete row
    const deleteRow = useCallback((id: string) => {
        updateState(prev => ({
            ...prev,
            assets: prev.assets.filter(a => a.id !== id),
        }))
        if (selectedRowId === id) {
            setSelectedRowId(null)
        }
    }, [updateState, selectedRowId])

    // Clear all data
    const handleClear = useCallback(async () => {
        await clearAmortizationState()
        setState(createInitialState())
        setShowClearModal(false)
        setSelectedRowId(null)
    }, [])

    // Export to CSV
    const handleExport = useCallback(() => {
        if (!state) return
        const rows = calculateAllRows(state.assets, state.params)
        const csv = exportToCSV(rows)
        const date = new Date().toISOString().slice(0, 10)
        downloadCSV(csv, `amortizaciones-${date}.csv`)
    }, [state])

    // Auto toggle for % calculations
    const handleAutoPercent = useCallback(() => {
        if (!state) return
        const newAmortizable = 100 - state.params.residualPctGlobal
        updateParams({ amortizablePctGlobal: newAmortizable })
    }, [state, updateParams])

    // Keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, rowId: string, fieldName: string) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            if (!state) return

            const currentRowIndex = state.assets.findIndex(a => a.id === rowId)
            const isLastRow = currentRowIndex === state.assets.length - 1
            const isLastEditableField = fieldName === 'noAmortiza'

            // Add new row if Enter on last field of last row
            if (e.key === 'Enter' && isLastRow && isLastEditableField) {
                e.preventDefault()
                addRow()
            }
        }
    }, [state, addRow])

    // Calculate all rows
    const rows: AmortizationRow[] = useMemo(() => {
        if (!state) return []
        return calculateAllRows(state.assets, state.params)
    }, [state])

    // Calculate totals
    const totals = useMemo(() => calculateTotals(rows), [rows])

    if (isLoading || !state) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">⏳</div>
                <p>Cargando planilla...</p>
            </div>
        )
    }

    return (
        <div className="amort-page">
            {/* Header */}
            <div className="page-header">
                <h1 className="page-title">Planillas complementarias</h1>
                <p className="page-subtitle">Herramientas de cálculo</p>
            </div>

            {/* Tabs */}
            <div className="tabs-pills">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-pill ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Parameters Card */}
            <div className="card params-card">
                <div className="card-header">
                    <h3 className="card-title">Parámetros del ejercicio</h3>
                </div>
                <div className="params-grid">
                    <div className="form-group">
                        <label className="form-label">Fecha de cierre</label>
                        <input
                            type="date"
                            className="form-input"
                            value={state.params.fechaCierreEjercicio}
                            onChange={(e) => updateParams({ fechaCierreEjercicio: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">% Valor residual global</label>
                        <input
                            type="number"
                            className="form-input form-input-number"
                            value={state.params.residualPctGlobal}
                            min={0}
                            max={100}
                            onChange={(e) => updateParams({ residualPctGlobal: Number(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">% Valor amortizable global</label>
                        <div className="flex gap-sm">
                            <input
                                type="number"
                                className="form-input form-input-number"
                                value={state.params.amortizablePctGlobal}
                                min={0}
                                max={100}
                                onChange={(e) => updateParams({ amortizablePctGlobal: Number(e.target.value) })}
                            />
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleAutoPercent}
                                title="Calcular automáticamente (100 - % residual)"
                            >
                                Auto
                            </button>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Prorrateo mensual</label>
                        <div className="toggle-container">
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={state.params.prorrateoMensual}
                                    onChange={(e) => updateParams({ prorrateoMensual: e.target.checked })}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                            <span
                                className="toggle-label"
                                title="Si está activo, prorratea la amortización del ejercicio por meses según fecha de alta y cierre."
                            >
                                {state.params.prorrateoMensual ? 'Activado' : 'Desactivado'}
                            </span>
                        </div>
                    </div>
                </div>
                {state.params.residualPctGlobal + state.params.amortizablePctGlobal !== 100 && (
                    <div className="alert alert-warning" style={{ marginTop: 'var(--space-md)' }}>
                        ⚠️ Los porcentajes (residual + amortizable) no suman 100%
                    </div>
                )}
            </div>

            {/* Toolbar */}
            <div className="amort-toolbar">
                <button className="btn btn-primary" onClick={addRow}>
                    <span>+</span> Agregar bien
                </button>
                {selectedRowId && (
                    <button
                        className="btn btn-secondary"
                        onClick={() => duplicateRow(selectedRowId)}
                    >
                        📋 Duplicar fila
                    </button>
                )}
                <button className="btn btn-secondary" onClick={handleExport}>
                    📤 Exportar CSV
                </button>
                <button
                    className="btn btn-danger-soft"
                    onClick={() => setShowClearModal(true)}
                >
                    🗑️ Limpiar planilla
                </button>
            </div>

            {/* Table */}
            <div className="card amort-table-card">
                <div className="table-container amort-table-container">
                    <table className="table amort-table" ref={tableRef}>
                        <thead>
                            <tr>
                                <th className="amort-col-input">Fecha Alta</th>
                                <th className="amort-col-input amort-col-wide">Detalle</th>
                                <th className="amort-col-input">Valor Origen</th>
                                <th className="amort-col-input">% Res.</th>
                                <th className="amort-col-calculated">V. Residual</th>
                                <th className="amort-col-input">% Amort.</th>
                                <th className="amort-col-calculated">V. Amortizable</th>
                                <th className="amort-col-input">Vida Útil</th>
                                <th className="amort-col-input">Tipo</th>
                                <th className="amort-col-input">No Amort.</th>
                                <th className="amort-col-calculated">Amort. Ej.</th>
                                <th className="amort-col-calculated">Acum. Inicio</th>
                                <th className="amort-col-calculated">Acum. Cierre</th>
                                <th className="amort-col-calculated amort-col-vr-contable">V.R. Contable</th>
                                <th className="amort-col-calculated">Estado</th>
                                <th className="amort-col-actions">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <AmortRow
                                    key={row.asset.id}
                                    row={row}
                                    index={index}
                                    isSelected={selectedRowId === row.asset.id}
                                    onSelect={() => setSelectedRowId(row.asset.id)}
                                    onUpdate={updateAsset}
                                    onDuplicate={duplicateRow}
                                    onDelete={deleteRow}
                                    onKeyDown={handleKeyDown}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Totals */}
            <div className="card amort-totals-card">
                <div className="amort-totals-grid">
                    <div className="amort-total-item">
                        <span className="amort-total-label">Valor Origen</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.valorOrigen)}</span>
                    </div>
                    <div className="amort-total-item">
                        <span className="amort-total-label">Valor Residual</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.valorResidual)}</span>
                    </div>
                    <div className="amort-total-item">
                        <span className="amort-total-label">Valor Amortizable</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.valorAmortizable)}</span>
                    </div>
                    <div className="amort-total-item">
                        <span className="amort-total-label">Amort. Ejercicio</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.amortizacionEjercicio)}</span>
                    </div>
                    <div className="amort-total-item">
                        <span className="amort-total-label">Acum. Cierre</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.acumuladaCierre)}</span>
                    </div>
                    <div className="amort-total-item amort-total-item-highlight">
                        <span className="amort-total-label">V.R. Contable</span>
                        <span className="amort-total-value">{formatCurrencyARS(totals.vrContable)}</span>
                    </div>
                </div>
            </div>

            {/* Clear Modal */}
            {showClearModal && (
                <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">¿Limpiar planilla?</h3>
                        </div>
                        <div className="modal-body">
                            <p>Esta acción eliminará todos los bienes cargados y restaurará los parámetros por defecto.</p>
                            <p><strong>Esta acción no se puede deshacer.</strong></p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowClearModal(false)}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={handleClear}>
                                Sí, limpiar todo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ========================================
// AmortRow Component
// ========================================

interface AmortRowProps {
    row: AmortizationRow
    index: number
    isSelected: boolean
    onSelect: () => void
    onUpdate: (id: string, updates: Partial<AmortizationAsset>) => void
    onDuplicate: (id: string) => void
    onDelete: (id: string) => void
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>, rowId: string, fieldName: string) => void
}

function AmortRow({ row, index, isSelected, onSelect, onUpdate, onDuplicate, onDelete, onKeyDown }: AmortRowProps) {
    const { asset, calculated } = row

    const handleNumberChange = (field: keyof AmortizationAsset) => (e: ChangeEvent<HTMLInputElement>) => {
        const value = parseArgentineNumber(e.target.value)
        onUpdate(asset.id, { [field]: value })
    }

    const handlePercentChange = (field: 'residualPct' | 'amortizablePct') => (e: ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value)
        if (!isNaN(value) && value >= 0 && value <= 100) {
            onUpdate(asset.id, { [field]: value })
        }
    }

    const getEstadoChip = () => {
        switch (calculated.estado) {
            case 'AMORTIZADO':
                return <span className="chip chip-amortizado">AMORTIZADO</span>
            case 'NO_AMORTIZA':
                return <span className="chip chip-no-amortiza">NO AMORTIZA</span>
            default:
                return <span className="chip chip-activo">ACTIVO</span>
        }
    }

    return (
        <tr
            className={`amort-row ${isSelected ? 'amort-row-selected' : ''} ${index % 2 === 0 ? '' : 'amort-row-zebra'}`}
            onClick={onSelect}
        >
            <td className="amort-col-input">
                <input
                    type="date"
                    className="form-input form-input-cell"
                    value={asset.fechaAlta}
                    onChange={(e) => onUpdate(asset.id, { fechaAlta: e.target.value })}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'fechaAlta')}
                />
            </td>
            <td className="amort-col-input amort-col-wide">
                <input
                    type="text"
                    className="form-input form-input-cell"
                    value={asset.detalle}
                    placeholder="Descripción del bien..."
                    onChange={(e) => onUpdate(asset.id, { detalle: e.target.value })}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'detalle')}
                />
            </td>
            <td className="amort-col-input">
                <input
                    type="text"
                    className="form-input form-input-cell form-input-number"
                    value={asset.valorOrigen ?? ''}
                    placeholder="0,00"
                    onChange={handleNumberChange('valorOrigen')}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'valorOrigen')}
                />
            </td>
            <td className="amort-col-input">
                <input
                    type="number"
                    className="form-input form-input-cell form-input-number"
                    value={asset.residualPct}
                    min={0}
                    max={100}
                    onChange={handlePercentChange('residualPct')}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'residualPct')}
                />
            </td>
            <td className="amort-col-calculated table-number">
                {formatCurrencyARS(calculated.valorResidual)}
            </td>
            <td className="amort-col-input">
                <input
                    type="number"
                    className="form-input form-input-cell form-input-number"
                    value={asset.amortizablePct}
                    min={0}
                    max={100}
                    onChange={handlePercentChange('amortizablePct')}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'amortizablePct')}
                />
            </td>
            <td className="amort-col-calculated table-number">
                {formatCurrencyARS(calculated.valorAmortizable)}
            </td>
            <td className="amort-col-input">
                <input
                    type="number"
                    className="form-input form-input-cell form-input-number"
                    value={asset.vidaUtilValor ?? ''}
                    min={0}
                    placeholder="—"
                    onChange={(e) => onUpdate(asset.id, { vidaUtilValor: e.target.value ? Number(e.target.value) : null })}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'vidaUtilValor')}
                />
            </td>
            <td className="amort-col-input">
                <select
                    className="form-select form-input-cell"
                    value={asset.vidaUtilTipo}
                    onChange={(e) => onUpdate(asset.id, { vidaUtilTipo: e.target.value as 'AÑOS' | 'PORCENTAJE_ANUAL' })}
                >
                    <option value="AÑOS">Años</option>
                    <option value="PORCENTAJE_ANUAL">% anual</option>
                </select>
            </td>
            <td className="amort-col-input text-center">
                <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={asset.noAmortiza}
                    onChange={(e) => onUpdate(asset.id, { noAmortiza: e.target.checked })}
                    onKeyDown={(e) => onKeyDown(e, asset.id, 'noAmortiza')}
                    title="No amortiza (ej: Terreno)"
                />
            </td>
            <td className="amort-col-calculated table-number">
                {formatCurrencyARS(calculated.amortizacionEjercicio)}
            </td>
            <td className="amort-col-calculated table-number">
                {formatCurrencyARS(calculated.acumuladaInicio)}
            </td>
            <td className="amort-col-calculated table-number">
                {formatCurrencyARS(calculated.acumuladaCierre)}
            </td>
            <td className="amort-col-calculated amort-col-vr-contable table-number">
                {formatCurrencyARS(calculated.vrContable)}
            </td>
            <td className="amort-col-calculated text-center">
                {getEstadoChip()}
            </td>
            <td className="amort-col-actions">
                <div className="amort-row-actions">
                    <button
                        className="btn btn-icon btn-secondary"
                        onClick={(e) => { e.stopPropagation(); onDuplicate(asset.id) }}
                        title="Duplicar fila"
                    >
                        📋
                    </button>
                    <button
                        className="btn btn-icon btn-danger-soft"
                        onClick={(e) => { e.stopPropagation(); onDelete(asset.id) }}
                        title="Eliminar fila"
                    >
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    )
}
