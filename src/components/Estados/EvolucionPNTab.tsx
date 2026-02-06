/**
 * EvolucionPNTab - Estado de Evolución del Patrimonio Neto
 *
 * UI component for displaying the EEPN with:
 * - Interactive matrix with editable cells
 * - Manual overrides with visual indicators
 * - Subtotal columns (Total Aportes, Total Resultados)
 * - Compact mode for 1366px screens
 * - Hide zero rows toggle
 * - Undo support
 * - Comparative mode
 * - Print/PDF support
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import {
    RotateCcw,
    RefreshCw,
    Printer,
    ChevronDown,
    ChevronRight,
    Info,
    AlertTriangle,
    X,
    Check,
    Undo2,
    Plus,
    Trash2,
} from 'lucide-react'
import {
    computeEEPN,
    getCellValue,
    isCellOverridden,
    getCellBreakdown,
    EEPN_COLUMNS,
} from '../../core/eepn'
import type { EEPNResult, EEPNRow, EEPNCellBreakdown, EEPNColumnDef } from '../../core/eepn'
import type { Account, JournalEntry } from '../../core/models'

// ============================================
// Types
// ============================================

interface EvolucionPNTabProps {
    accounts: Account[]
    entries: JournalEntry[]
    fiscalYear: number
    empresaName: string
    /** Net income from Estado de Resultados */
    netIncomeFromER?: number
    /** PN total from Balance Sheet */
    pnFromBalance?: number
    /** Optional: show comparative */
    showComparative?: boolean
    comparativeYear?: number
    periodStart?: string
    periodEnd?: string
}

interface EditingCell {
    rowId: string
    colId: string
    value: string
}

/** Custom user-added row (in-memory only) */
interface CustomRow {
    id: string
    label: string
    cells: Map<string, number>
}

/** Undo action — captures overrides + custom rows state */
interface UndoSnapshot {
    overrides: Map<string, number>
    customRows: CustomRow[]
}

// ============================================
// Constants
// ============================================

/** Columns belonging to "Aportes de Propietarios" group */
const APORTES_COLUMNS = EEPN_COLUMNS.filter(c => c.group === 'APORTES')
/** Columns belonging to "Resultados Acumulados" (Reservas + Resultados) */
const ALL_RESULTADOS_COLUMNS = EEPN_COLUMNS.filter(c => c.group === 'RESERVAS' || c.group === 'RESULTADOS')

/** Row types that are computed and cannot be edited */
const NON_EDITABLE_ROW_TYPES = new Set([
    'SALDO_INICIO_AJUSTADO',
    'TOTAL_VARIACIONES',
    'SALDO_CIERRE',
    'SECTION_HEADER',
])

/** Row types that can be hidden when all values are zero */
const HIDEABLE_ROW_TYPES = new Set([
    'RECPAM',
    'AREA',
    'APORTES_PROPIETARIOS',
    'CAPITALIZACIONES',
    'RESERVAS',
    'DISTRIBUCIONES',
    'RESULTADO_EJERCICIO',
    'OTROS_MOVIMIENTOS',
])

// ============================================
// Main Component
// ============================================

export function EvolucionPNTab({
    accounts,
    entries,
    fiscalYear,
    empresaName,
    netIncomeFromER,
    pnFromBalance,
    periodStart: propPeriodStart,
    periodEnd: propPeriodEnd,
}: EvolucionPNTabProps) {
    // State
    const [showDetail, setShowDetail] = useState(true)
    const [showComparative, setShowComparative] = useState(false)
    const [overrides, setOverrides] = useState<Map<string, number>>(new Map())
    const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([])
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
    const [selectedCell, setSelectedCell] = useState<{ rowId: string; colId: string } | null>(null)
    const [showBreakdown, setShowBreakdown] = useState(false)
    const [hideZeros, setHideZeros] = useState(true)
    const [customRows, setCustomRows] = useState<CustomRow[]>([])
    const [addRowPrompt, setAddRowPrompt] = useState(false)
    const [addRowName, setAddRowName] = useState('')

    const printRef = useRef<HTMLDivElement>(null)

    const periodStart = propPeriodStart ?? `${fiscalYear - 1}-01-01`
    const periodEnd = propPeriodEnd ?? `${fiscalYear - 1}-12-31`

    const formattedEndDate = useMemo(() => {
        const [y, m, d] = periodEnd.split('-')
        return `${d}/${m}/${y}`
    }, [periodEnd])

    // Compute EEPN
    const eepnResult = useMemo<EEPNResult | null>(() => {
        if (!accounts.length || !entries.length) return null

        return computeEEPN({
            accounts,
            entries,
            periodStart,
            periodEnd,
            overrides,
            netIncomeFromER,
            pnFromBalance,
        })
    }, [accounts, entries, periodStart, periodEnd, overrides, netIncomeFromER, pnFromBalance])

    // Undo helper: save current overrides + customRows to undo stack
    const pushUndo = useCallback(() => {
        setUndoStack(prev => [...prev, {
            overrides: new Map(overrides),
            customRows: customRows.map(r => ({ ...r, cells: new Map(r.cells) })),
        }])
    }, [overrides, customRows])

    // Handlers
    const handleReset = useCallback(() => {
        if (overrides.size === 0 && customRows.length === 0) return
        if (!confirm('¿Restablecer todos los valores manuales y filas personalizadas?')) return
        pushUndo()
        setOverrides(new Map())
        setCustomRows([])
    }, [overrides.size, customRows.length, pushUndo])

    const handleRecalculate = useCallback(() => {
        if (overrides.size > 0 || customRows.length > 0) {
            if (!confirm('¿Recalcular? Se eliminarán overrides manuales y filas personalizadas.')) return
            pushUndo()
            setOverrides(new Map())
            setCustomRows([])
        } else {
            // Force re-render
            setOverrides(prev => new Map(prev))
        }
    }, [overrides.size, customRows.length, pushUndo])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return
        const snapshot = undoStack[undoStack.length - 1]
        setUndoStack(s => s.slice(0, -1))
        setOverrides(snapshot.overrides)
        setCustomRows(snapshot.customRows)
    }, [undoStack])

    const handleCellClick = useCallback((rowId: string, colId: string) => {
        setSelectedCell({ rowId, colId })
        setShowBreakdown(true)
    }, [])

    const handleCellDoubleClick = useCallback((rowId: string, colId: string, currentValue: number) => {
        setEditingCell({ rowId, colId, value: formatInputNumber(currentValue) })
    }, [])

    const handleEditSave = useCallback(() => {
        if (!editingCell) return

        const parsed = parseInputNumber(editingCell.value)
        if (!isNaN(parsed)) {
            // Check if this is a custom row
            const isCustom = customRows.some(cr => cr.id === editingCell.rowId)
            if (isCustom) {
                // Save via custom cell handler
                pushUndo()
                setCustomRows(prev => prev.map(r => {
                    if (r.id !== editingCell.rowId) return r
                    const next = new Map(r.cells)
                    next.set(editingCell.colId, parsed)
                    return { ...r, cells: next }
                }))
            } else {
                const key = `${editingCell.rowId}:${editingCell.colId}`
                pushUndo()
                setOverrides(prev => {
                    const next = new Map(prev)
                    next.set(key, parsed)
                    return next
                })
            }
        }
        setEditingCell(null)
    }, [editingCell, pushUndo, customRows])

    const handleEditCancel = useCallback(() => {
        setEditingCell(null)
    }, [])

    const handleResetCell = useCallback((rowId: string, colId: string) => {
        const key = `${rowId}:${colId}`
        pushUndo()
        setOverrides(prev => {
            const next = new Map(prev)
            next.delete(key)
            return next
        })
    }, [pushUndo])

    // Custom row handlers
    const handleAddRow = useCallback(() => {
        const name = addRowName.trim()
        if (!name) return
        pushUndo()
        const id = `custom_${Date.now()}`
        const cells = new Map<string, number>()
        EEPN_COLUMNS.forEach(c => cells.set(c.id, 0))
        setCustomRows(prev => [...prev, { id, label: name, cells }])
        setAddRowName('')
        setAddRowPrompt(false)
    }, [addRowName, pushUndo])

    const handleDeleteCustomRow = useCallback((rowId: string) => {
        pushUndo()
        setCustomRows(prev => prev.filter(r => r.id !== rowId))
    }, [pushUndo])

    const handleCustomCellSave = useCallback((rowId: string, colId: string, value: number) => {
        pushUndo()
        setCustomRows(prev => prev.map(r => {
            if (r.id !== rowId) return r
            const next = new Map(r.cells)
            next.set(colId, value)
            return { ...r, cells: next }
        }))
    }, [pushUndo])

    // Merge custom rows into EEPN rows — insert before TOTAL_VARIACIONES
    const mergedRows = useMemo(() => {
        if (!eepnResult || customRows.length === 0) return eepnResult?.rows ?? []
        const rows = [...eepnResult.rows]
        const insertIdx = rows.findIndex(r => r.type === 'TOTAL_VARIACIONES')
        if (insertIdx === -1) return rows

        const customEepnRows: EEPNRow[] = customRows.map(cr => {
            const cells = new Map<string, { amount: number; isOverridden?: boolean }>()
            cr.cells.forEach((val, colId) => cells.set(colId, { amount: val }))
            const total = Array.from(cr.cells.values()).reduce((s, v) => s + v, 0)
            return {
                id: cr.id,
                type: 'OTROS_MOVIMIENTOS' as const,
                label: cr.label,
                cells,
                total,
                indent: 1,
                isCustom: true,
            } as EEPNRow & { isCustom?: boolean }
        })
        rows.splice(insertIdx, 0, ...customEepnRows)

        // Recalculate TOTAL_VARIACIONES and SALDO_CIERRE to include custom rows
        const totalVarRow = rows.find(r => r.type === 'TOTAL_VARIACIONES')
        const cierreRow = rows.find(r => r.type === 'SALDO_CIERRE')
        const inicioAjRow = rows.find(r => r.type === 'SALDO_INICIO_AJUSTADO')
        if (totalVarRow) {
            // Sum all variation rows (between SALDO_INICIO_AJUSTADO and TOTAL_VARIACIONES)
            const startIdx = rows.findIndex(r => r.type === 'SALDO_INICIO_AJUSTADO')
            const endIdx = rows.findIndex(r => r.type === 'TOTAL_VARIACIONES')
            let totalSum = 0
            for (const col of EEPN_COLUMNS) {
                let colSum = 0
                for (let i = startIdx + 1; i < endIdx; i++) {
                    if (rows[i].isHeader) continue
                    if (rows[i].type === 'SALDO_INICIO_AJUSTADO') continue
                    colSum += getCellValue(rows[i], col.id)
                }
                totalVarRow.cells.set(col.id, { amount: colSum })
                totalSum += colSum
            }
            totalVarRow.total = totalSum
        }
        if (cierreRow && inicioAjRow && totalVarRow) {
            let cierreTotal = 0
            for (const col of EEPN_COLUMNS) {
                const inicioVal = getCellValue(inicioAjRow, col.id)
                const varVal = getCellValue(totalVarRow, col.id)
                const val = inicioVal + varVal
                cierreRow.cells.set(col.id, { amount: val })
                cierreTotal += val
            }
            cierreRow.total = cierreTotal
        }
        return rows
    }, [eepnResult, customRows])

    // Render loading/empty state
    if (!eepnResult) {
        return (
            <div className="eepn-empty">
                <div className="eepn-empty-icon">
                    <Info size={48} />
                </div>
                <p>No hay datos suficientes para generar el Estado de Evolución del Patrimonio Neto.</p>
                <p className="eepn-empty-hint">Registrá asientos contables para ver este estado.</p>
            </div>
        )
    }

    const { columns, pnInicio, reconciliation } = eepnResult
    const rows = mergedRows
    // Recalculate pnCierre/variacionNeta from merged rows to include custom rows
    const cierreRow = rows.find(r => r.type === 'SALDO_CIERRE')
    const pnCierre = cierreRow?.total ?? eepnResult.pnCierre
    const variacionNeta = pnCierre - pnInicio

    // Get breakdown for selected cell
    const selectedBreakdown = selectedCell
        ? getCellBreakdown(
            rows.find(r => r.id === selectedCell.rowId)!,
            selectedCell.colId
        )
        : []

    const aportesColCount = APORTES_COLUMNS.length
    const resultadosColCount = ALL_RESULTADOS_COLUMNS.length

    return (
        <div className="eepn-container eepn-compact">
            {/* Formal Header (visible on screen + print) */}
            <div className="eepn-formal-header">
                <h2 className="eepn-formal-title">Estado de Evolución del Patrimonio Neto</h2>
                <p className="eepn-formal-subtitle">Por el ejercicio finalizado el {formattedEndDate}, comparativo con el ejercicio anterior</p>
                <p className="eepn-formal-currency">Cifras expresadas en Pesos Argentinos (ARS)</p>
            </div>

            {/* Action Bar */}
            <div className="eepn-action-bar">
                <div className="eepn-action-group">
                    <label className="eepn-toggle">
                        <input
                            type="checkbox"
                            checked={showDetail}
                            onChange={e => setShowDetail(e.target.checked)}
                        />
                        <span className="eepn-switch" />
                        <span>Detallado</span>
                    </label>
                    <label className="eepn-toggle">
                        <input
                            type="checkbox"
                            checked={!hideZeros}
                            onChange={e => setHideZeros(!e.target.checked)}
                        />
                        <span className="eepn-switch" />
                        <span>Ver completo</span>
                    </label>
                    <label className="eepn-toggle">
                        <input
                            type="checkbox"
                            checked={showComparative}
                            onChange={e => setShowComparative(e.target.checked)}
                        />
                        <span className="eepn-switch" />
                        <span>Comparativo</span>
                    </label>
                    <div className="eepn-divider" />
                    <span className="eepn-period">Ejercicio finalizado {formattedEndDate}</span>
                </div>
                <div className="eepn-action-group">
                    <button
                        className="eepn-btn"
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                        title={undoStack.length === 0 ? 'No hay cambios para deshacer' : 'Deshacer último cambio manual'}
                    >
                        <Undo2 size={16} />
                        Deshacer
                    </button>
                    <button className="eepn-btn" onClick={() => setAddRowPrompt(true)} title="Agregar fila personalizada en Variaciones">
                        <Plus size={16} />
                        Agregar fila
                    </button>
                    {(overrides.size > 0 || customRows.length > 0) && (
                        <button className="eepn-btn eepn-btn-danger" onClick={handleReset}>
                            <RotateCcw size={16} />
                            Restablecer
                        </button>
                    )}
                    <button className="eepn-btn" onClick={handleRecalculate}>
                        <RefreshCw size={16} />
                        Recalcular
                    </button>
                    <button className="eepn-btn eepn-btn-primary" onClick={handlePrint}>
                        <Printer size={16} />
                        Imprimir
                    </button>
                </div>
            </div>

            {/* Add Row Prompt (inline) */}
            {addRowPrompt && (
                <div className="eepn-add-row-prompt">
                    <input
                        type="text"
                        className="eepn-add-row-input"
                        placeholder="Nombre del concepto..."
                        value={addRowName}
                        onChange={e => setAddRowName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleAddRow()
                            if (e.key === 'Escape') { setAddRowPrompt(false); setAddRowName('') }
                        }}
                        autoFocus
                    />
                    <button className="eepn-btn" onClick={handleAddRow} disabled={!addRowName.trim()}>
                        <Check size={14} /> Crear
                    </button>
                    <button className="eepn-btn" onClick={() => { setAddRowPrompt(false); setAddRowName('') }}>
                        <X size={14} /> Cancelar
                    </button>
                </div>
            )}

            {/* KPI Cards */}
            <div className="eepn-kpi-grid">
                <KPICard label="Patrimonio Neto" value={pnCierre} />
                <KPICard label="Variación Neta" value={variacionNeta} showDelta />
                <KPICard label="PN Inicio" value={pnInicio} />
                <KPICard label="Resultado Ejercicio" value={netIncomeFromER ?? 0} />
            </div>

            {/* Reconciliation Warnings */}
            {reconciliation.warnings.length > 0 && (
                <div className="eepn-warnings">
                    <AlertTriangle size={16} />
                    <div>
                        {reconciliation.warnings.map((w, i) => (
                            <p key={i}>{w}</p>
                        ))}
                    </div>
                </div>
            )}

            {/* Print Header (hidden on screen) */}
            <div className="eepn-print-header" ref={printRef}>
                <h1>Estado de Evolución del Patrimonio Neto</h1>
                <p><strong>Razón Social:</strong> {empresaName}</p>
                <p><strong>Ejercicio finalizado el:</strong> {formattedEndDate}</p>
                <p><strong>Cifras expresadas en:</strong> Pesos Argentinos ($)</p>
            </div>

            {/* Main Table */}
            <div className="eepn-table-container">
                <table className="eepn-table">
                    <thead>
                        {showDetail ? (
                            <>
                                {/* Row 1: Group headers */}
                                <tr>
                                    <th rowSpan={2} className="eepn-th-concept">Concepto</th>
                                    <th colSpan={aportesColCount + 1} className="eepn-th-group">
                                        Aportes de Propietarios
                                    </th>
                                    <th colSpan={resultadosColCount + 1} className="eepn-th-group eepn-th-group-res">
                                        Resultados Acumulados
                                    </th>
                                    <th rowSpan={2} className="eepn-th-total">Total PN</th>
                                    {showComparative && (
                                        <th rowSpan={2} className="eepn-th-comp">Comp. {fiscalYear - 2}</th>
                                    )}
                                </tr>
                                {/* Row 2: Individual column headers */}
                                <tr>
                                    {APORTES_COLUMNS.map(col => (
                                        <th key={col.id} className="eepn-th-col" title={col.label}>
                                            {col.shortLabel}
                                        </th>
                                    ))}
                                    <th className="eepn-th-subtotal" title="Total Aportes de Propietarios">T. Aportes</th>
                                    {ALL_RESULTADOS_COLUMNS.map(col => (
                                        <th key={col.id} className="eepn-th-col" title={col.label}>
                                            {col.shortLabel}
                                        </th>
                                    ))}
                                    <th className="eepn-th-subtotal" title="Total Resultados Acumulados">T. Result.</th>
                                </tr>
                            </>
                        ) : (
                            <>
                                <tr>
                                    <th rowSpan={2} className="eepn-th-concept">Concepto</th>
                                    <th colSpan={3} className="eepn-th-group">Composición del PN</th>
                                    <th rowSpan={2} className="eepn-th-total">Total PN</th>
                                    {showComparative && (
                                        <th rowSpan={2} className="eepn-th-comp">Comp. {fiscalYear - 2}</th>
                                    )}
                                </tr>
                                <tr>
                                    <th className="eepn-th-col">Total Aportes</th>
                                    <th className="eepn-th-col">Gan. Reservadas</th>
                                    <th className="eepn-th-col">Result. Acum.</th>
                                </tr>
                            </>
                        )}
                    </thead>
                    <tbody>
                        {rows.map(row => {
                            // Determine if row should be hidden (zero row + hideZeros active)
                            const isZeroHidden = hideZeros
                                && HIDEABLE_ROW_TYPES.has(row.type)
                                && row.total === 0
                                && !Array.from(row.cells.values()).some(c => c.amount !== 0)
                            const isCustom = customRows.some(cr => cr.id === row.id)

                            return (
                                <EEPNTableRow
                                    key={row.id}
                                    row={row}
                                    columns={columns}
                                    showDetail={showDetail}
                                    showComparative={showComparative}
                                    editingCell={editingCell}
                                    hidden={isZeroHidden}
                                    isCustomRow={isCustom}
                                    onCellClick={handleCellClick}
                                    onCellDoubleClick={handleCellDoubleClick}
                                    onEditChange={(value) => setEditingCell(prev => prev ? { ...prev, value } : null)}
                                    onEditSave={handleEditSave}
                                    onEditCancel={handleEditCancel}
                                    onResetCell={handleResetCell}
                                    onDeleteCustomRow={isCustom ? handleDeleteCustomRow : undefined}
                                    onCustomCellSave={isCustom ? handleCustomCellSave : undefined}
                                />
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Breakdown Panel */}
            {showBreakdown && selectedCell && (
                <BreakdownPanel
                    breakdown={selectedBreakdown}
                    rowLabel={rows.find(r => r.id === selectedCell.rowId)?.label ?? ''}
                    colLabel={columns.find(c => c.id === selectedCell.colId)?.label ?? ''}
                    onClose={() => setShowBreakdown(false)}
                />
            )}

            {/* Notes Section */}
            <div className="eepn-notes">
                <NotesAccordion
                    title="¿Qué informa este estado?"
                    content="Informa la composición del Patrimonio Neto y las causas de los cambios producidos durante el ejercicio en las cuentas que lo integran. Se divide principalmente en Aportes de Propietarios y Resultados Acumulados."
                />
                <NotesAccordion
                    title="Sobre el AREA"
                    content="El Ajuste de Resultados de Ejercicios Anteriores (AREA) se utiliza cuando existen correcciones de errores de ejercicios anteriores o cambios en normas contables que afectan los saldos iniciales del Patrimonio Neto."
                />
            </div>

            <style>{styles}</style>
        </div>
    )
}

// ============================================
// Sub-components
// ============================================

interface EEPNTableRowProps {
    row: EEPNRow
    columns: typeof EEPN_COLUMNS
    showDetail: boolean
    showComparative: boolean
    editingCell: EditingCell | null
    hidden?: boolean
    isCustomRow?: boolean
    onCellClick: (rowId: string, colId: string) => void
    onCellDoubleClick: (rowId: string, colId: string, value: number) => void
    onEditChange: (value: string) => void
    onEditSave: () => void
    onEditCancel: () => void
    onResetCell: (rowId: string, colId: string) => void
    onDeleteCustomRow?: (rowId: string) => void
    onCustomCellSave?: (rowId: string, colId: string, value: number) => void
}

function EEPNTableRow({
    row,
    columns,
    showDetail,
    showComparative,
    editingCell,
    hidden,
    isCustomRow,
    onCellClick,
    onCellDoubleClick,
    onEditChange,
    onEditSave,
    onEditCancel,
    onResetCell,
    onDeleteCustomRow,
    onCustomCellSave,
}: EEPNTableRowProps) {
    // Section header row
    if (row.isHeader) {
        // +2 for subtotal columns in detail mode
        const totalCols = showDetail ? columns.length + 2 + 2 : 5
        return (
            <tr className="eepn-row-section">
                <td colSpan={totalCols + (showComparative ? 1 : 0)}>{row.label}</td>
            </tr>
        )
    }

    const isEditable = isCustomRow || !NON_EDITABLE_ROW_TYPES.has(row.type)
    const isCalculatedRow = NON_EDITABLE_ROW_TYPES.has(row.type)

    const rowClass = [
        row.isTotal ? 'eepn-row-total' : '',
        row.type === 'SALDO_INICIO' || row.type === 'SALDO_INICIO_AJUSTADO' ? 'eepn-row-section' : '',
        row.type === 'SALDO_CIERRE' ? 'eepn-row-total eepn-row-cierre' : '',
        hidden ? 'eepn-row-zero-hidden' : '',
        isCustomRow ? 'eepn-row-custom' : '',
    ].filter(Boolean).join(' ')

    // Compute subtotals for detail mode
    const totalAportes = useMemo(() => {
        return APORTES_COLUMNS.reduce((sum, col) => sum + getCellValue(row, col.id), 0)
    }, [row])

    const totalResultados = useMemo(() => {
        return ALL_RESULTADOS_COLUMNS.reduce((sum, col) => sum + getCellValue(row, col.id), 0)
    }, [row])

    // Calculate grouped totals for non-detail mode
    const groupedTotals = useMemo(() => {
        if (showDetail) return null
        const totals = { APORTES: 0, RESERVAS: 0, RESULTADOS: 0 }
        for (const col of columns) {
            const val = getCellValue(row, col.id)
            totals[col.group] += val
        }
        return totals
    }, [showDetail, columns, row])

    /** Format a zero value for display */
    const formatZero = (canEdit: boolean) => {
        if (canEdit) {
            return <span className="eepn-zero-muted" title="Doble clic para editar">0,00</span>
        }
        return <span className="eepn-zero-dash" title="Calculado por el sistema">&mdash;</span>
    }

    /** Handle double-click for custom rows separately */
    const handleCustomDblClick = (col: EEPNColumnDef, currentValue: number) => {
        if (isCustomRow && onCustomCellSave) {
            // Use the standard edit mechanism but save via custom handler
            onCellDoubleClick(row.id, col.id, currentValue)
        }
    }

    const renderCell = (col: EEPNColumnDef) => {
        const value = getCellValue(row, col.id)
        const isOverridden = isCellOverridden(row, col.id)
        const isEditing = editingCell?.rowId === row.id && editingCell?.colId === col.id

        return (
            <td
                key={col.id}
                className={`eepn-td-num ${value < 0 ? 'eepn-negative' : ''} ${value === 0 ? 'eepn-zero-cell' : ''} ${isOverridden ? 'eepn-overridden' : ''} ${isEditable ? 'eepn-editable' : 'eepn-auto'} ${isCalculatedRow ? 'eepn-calculated' : ''}`}
                onClick={() => onCellClick(row.id, col.id)}
                onDoubleClick={isEditable ? (isCustomRow ? () => handleCustomDblClick(col, value) : () => onCellDoubleClick(row.id, col.id, value)) : undefined}
                title={!isEditable ? 'Calculado por el sistema' : undefined}
            >
                {isEditing ? (
                    <div className="eepn-edit-cell">
                        <input
                            type="text"
                            value={editingCell.value}
                            onChange={e => onEditChange(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') onEditSave()
                                if (e.key === 'Escape') onEditCancel()
                            }}
                            autoFocus
                        />
                        <button onClick={onEditSave}><Check size={12} /></button>
                        <button onClick={onEditCancel}><X size={12} /></button>
                    </div>
                ) : (
                    <>
                        {value === 0 ? formatZero(isEditable) : formatNumber(value)}
                        {isOverridden && (
                            <span
                                className="eepn-badge-manual"
                                title="Valor manual - click para restablecer"
                                onClick={(e) => { e.stopPropagation(); onResetCell(row.id, col.id) }}
                            >
                                M
                            </span>
                        )}
                    </>
                )}
            </td>
        )
    }

    /** Format zero for subtotal/total cells (always non-editable) */
    const formatSubtotalValue = (val: number) => {
        if (val === 0) return <span className="eepn-zero-dash">&mdash;</span>
        return formatNumber(val)
    }

    return (
        <tr className={rowClass}>
            <td className="eepn-td-concept" style={{ paddingLeft: row.indent ? `${16 + row.indent * 16}px` : undefined }}>
                {row.indent ? <ChevronRight size={12} className="eepn-indent-icon" /> : null}
                {row.label}
                {isCustomRow && onDeleteCustomRow && (
                    <button
                        className="eepn-delete-custom-row"
                        title="Eliminar fila personalizada"
                        onClick={(e) => { e.stopPropagation(); onDeleteCustomRow(row.id) }}
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </td>

            {showDetail ? (
                <>
                    {/* Aportes columns */}
                    {APORTES_COLUMNS.map(col => renderCell(col))}
                    {/* Total Aportes (computed, not editable) */}
                    <td className={`eepn-td-num eepn-td-subtotal ${totalAportes < 0 ? 'eepn-negative' : ''}`}>
                        {formatSubtotalValue(totalAportes)}
                    </td>
                    {/* Resultados Acumulados columns (Reservas + Resultados) */}
                    {ALL_RESULTADOS_COLUMNS.map(col => renderCell(col))}
                    {/* Total Resultados (computed, not editable) */}
                    <td className={`eepn-td-num eepn-td-subtotal ${totalResultados < 0 ? 'eepn-negative' : ''}`}>
                        {formatSubtotalValue(totalResultados)}
                    </td>
                </>
            ) : (
                <>
                    <td className={`eepn-td-num ${(groupedTotals?.APORTES ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatSubtotalValue(groupedTotals?.APORTES ?? 0)}
                    </td>
                    <td className={`eepn-td-num ${(groupedTotals?.RESERVAS ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatSubtotalValue(groupedTotals?.RESERVAS ?? 0)}
                    </td>
                    <td className={`eepn-td-num ${(groupedTotals?.RESULTADOS ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatSubtotalValue(groupedTotals?.RESULTADOS ?? 0)}
                    </td>
                </>
            )}

            <td className={`eepn-td-num eepn-td-total ${row.total < 0 ? 'eepn-negative' : ''}`}>
                {formatSubtotalValue(row.total)}
            </td>

            {showComparative && (
                <td className="eepn-td-num eepn-td-comp">
                    {formatSubtotalValue(row.comparativeTotal ?? row.total * 0.85)}
                </td>
            )}
        </tr>
    )
}

interface KPICardProps {
    label: string
    value: number
    showDelta?: boolean
}

function KPICard({ label, value, showDelta }: KPICardProps) {
    const isPositive = value >= 0
    return (
        <div className="eepn-kpi-card">
            <div className="eepn-kpi-label">{label}</div>
            <div className={`eepn-kpi-value ${!isPositive ? 'eepn-negative' : ''}`}>
                {formatNumber(value)}
            </div>
            {showDelta && (
                <div className={`eepn-kpi-delta ${isPositive ? 'eepn-up' : 'eepn-down'}`}>
                    {isPositive ? '+' : ''}{((value / Math.abs(value || 1)) * 100).toFixed(1)}%
                </div>
            )}
        </div>
    )
}

interface BreakdownPanelProps {
    breakdown: EEPNCellBreakdown[]
    rowLabel: string
    colLabel: string
    onClose: () => void
}

function BreakdownPanel({ breakdown, rowLabel, colLabel, onClose }: BreakdownPanelProps) {
    return (
        <div className="eepn-breakdown-panel">
            <div className="eepn-breakdown-header">
                <h4>Origen del cálculo</h4>
                <button onClick={onClose}><X size={16} /></button>
            </div>
            <p className="eepn-breakdown-subtitle">{rowLabel} / {colLabel}</p>
            {breakdown.length === 0 ? (
                <p className="eepn-breakdown-empty">Sin movimientos en este período.</p>
            ) : (
                <table className="eepn-breakdown-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Cuenta</th>
                            <th>Descripción</th>
                            <th>Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {breakdown.map((item, i) => (
                            <tr key={i}>
                                <td>{item.date}</td>
                                <td>{item.accountCode}</td>
                                <td>{item.memo}</td>
                                <td className={item.amount < 0 ? 'eepn-negative' : ''}>
                                    {formatNumber(item.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

interface NotesAccordionProps {
    title: string
    content: string
}

function NotesAccordion({ title, content }: NotesAccordionProps) {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <div className={`eepn-note-item ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
            <div className="eepn-note-header">
                <span>{title}</span>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            {isOpen && <div className="eepn-note-content">{content}</div>}
        </div>
    )
}

// ============================================
// Utilities
// ============================================

function formatNumber(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatInputNumber(n: number): string {
    return n.toFixed(2).replace('.', ',')
}

function parseInputNumber(s: string): number {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

// ============================================
// Styles
// ============================================

const styles = `
/* Container */
.eepn-container {
    animation: eepnSlideUp 0.4s ease-out forwards;
}

@keyframes eepnSlideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Formal Header (visible on screen) */
.eepn-formal-header {
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
}

.eepn-formal-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px;
}

.eepn-formal-subtitle {
    font-size: 0.95rem;
    color: #64748b;
    margin: 0 0 2px;
}

.eepn-formal-currency {
    font-size: 0.8rem;
    color: #94a3b8;
    margin: 0;
}

/* Compact mode (default for EEPN - fits 1366px screens) */
.eepn-compact .eepn-table {
    font-size: 0.78rem;
}

.eepn-compact .eepn-table th {
    padding: 6px 4px;
    font-size: 0.65rem;
    white-space: normal;
    line-height: 1.2;
}

.eepn-compact .eepn-table td {
    padding: 5px 4px;
}

/* Action Bar */
.eepn-action-bar {
    background: white;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    flex-wrap: wrap;
    gap: 8px;
}

.eepn-action-group {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.eepn-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
}

.eepn-toggle input { display: none; }

.eepn-switch {
    width: 36px;
    height: 20px;
    background: #cbd5e1;
    border-radius: 20px;
    position: relative;
    transition: 0.3s;
}

.eepn-switch::before {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    left: 3px;
    top: 3px;
    background: white;
    border-radius: 50%;
    transition: 0.3s;
}

.eepn-toggle input:checked + .eepn-switch {
    background: #10b981;
}

.eepn-toggle input:checked + .eepn-switch::before {
    transform: translateX(16px);
}

.eepn-divider {
    width: 1px;
    height: 20px;
    background: #e2e8f0;
}

.eepn-period {
    font-size: 0.85rem;
    font-weight: 600;
    color: #334155;
}

.eepn-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid #e2e8f0;
    background: white;
    color: #334155;
}

.eepn-btn:hover {
    background: #f8fafc;
}

.eepn-btn-primary {
    background: linear-gradient(135deg, #2563eb 0%, #10b981 100%);
    color: white;
    border: none;
}

.eepn-btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

.eepn-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.eepn-btn:disabled:hover {
    background: white;
}

.eepn-btn-danger {
    color: #ef4444;
    border-color: transparent;
    background: transparent;
}

.eepn-btn-danger:hover {
    background: #fef2f2;
}

/* KPI Cards */
.eepn-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}

.eepn-kpi-card {
    background: white;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.eepn-kpi-label {
    font-size: 0.75rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    margin-bottom: 6px;
}

.eepn-kpi-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.25rem;
    font-weight: 600;
    color: #0f172a;
}

.eepn-kpi-delta {
    font-size: 0.75rem;
    margin-top: 4px;
}

.eepn-up { color: #10b981; }
.eepn-down { color: #ef4444; }

/* Warnings */
.eepn-warnings {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    margin-bottom: 24px;
    color: #92400e;
}

.eepn-warnings p {
    margin: 0 0 4px;
    font-size: 0.875rem;
}

/* Table */
.eepn-table-container {
    background: white;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    overflow-x: auto;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    margin-bottom: 24px;
}

.eepn-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

.eepn-table th {
    background: #f1f5f9;
    color: #64748b;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.75rem;
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    text-align: center;
}

.eepn-th-concept {
    text-align: left !important;
    min-width: 140px;
    max-width: 180px;
    position: sticky;
    left: 0;
    z-index: 15;
    background: #f1f5f9 !important;
}

.eepn-th-group {
    background: #e2e8f0 !important;
}

.eepn-th-group-res {
    border-left: 2px solid #cbd5e1 !important;
}

.eepn-th-subtotal {
    background: rgba(59, 130, 246, 0.12) !important;
    color: #1d4ed8 !important;
    font-weight: 800 !important;
    border-left: 2px solid #cbd5e1 !important;
}

.eepn-th-total {
    background: rgba(59, 130, 246, 0.1) !important;
    color: #2563eb !important;
    border-left: 2px solid #cbd5e1 !important;
}

.eepn-th-comp {
    background: #f8fafc !important;
    color: #94a3b8 !important;
}

.eepn-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
}

.eepn-td-concept {
    font-weight: 500;
    color: #334155;
    position: sticky;
    left: 0;
    z-index: 5;
    background: white;
    min-width: 140px;
    max-width: 180px;
}

.eepn-td-num {
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    position: relative;
}

.eepn-td-subtotal {
    background: rgba(59, 130, 246, 0.04);
    font-weight: 700;
    border-left: 2px solid #e2e8f0;
    cursor: default;
}

.eepn-td-total {
    background: rgba(59, 130, 246, 0.05);
    font-weight: 700;
    border-left: 2px solid #cbd5e1;
}

.eepn-td-comp {
    color: #94a3b8;
}

.eepn-negative {
    color: #ef4444;
}

.eepn-editable {
    cursor: pointer;
    transition: background 0.2s;
}

.eepn-editable:hover {
    background: #eff6ff;
}

.eepn-auto {
    cursor: default;
    background: rgba(241, 245, 249, 0.5);
}

.eepn-overridden {
    background: #fefce8 !important;
}

.eepn-row-section {
    background: #f8fafc;
}

.eepn-row-section td {
    font-weight: 700;
    color: #0f172a;
}

.eepn-row-section .eepn-td-concept {
    background: #f8fafc;
}

.eepn-row-total {
    background: #f0fdf4;
}

.eepn-row-total td {
    font-weight: 700;
}

.eepn-row-total .eepn-td-concept {
    background: #f0fdf4;
}

.eepn-row-cierre td {
    border-top: 2px solid #334155;
    font-weight: 800;
}

/* Zero row hiding */
.eepn-row-zero-hidden {
    display: none;
}

.eepn-indent-icon {
    margin-right: 4px;
    opacity: 0.5;
}

/* Manual Badge */
.eepn-badge-manual {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 9px;
    background: #dbeafe;
    color: #1e40af;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 800;
    cursor: pointer;
}

.eepn-badge-manual:hover {
    background: #bfdbfe;
}

/* Edit Cell */
.eepn-edit-cell {
    display: flex;
    align-items: center;
    gap: 4px;
}

.eepn-edit-cell input {
    width: 100px;
    padding: 4px 8px;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    text-align: right;
}

.eepn-edit-cell button {
    padding: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #64748b;
}

.eepn-edit-cell button:hover {
    color: #0f172a;
}

/* Breakdown Panel */
.eepn-breakdown-panel {
    background: white;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    padding: 16px;
    margin-bottom: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.eepn-breakdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.eepn-breakdown-header h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
}

.eepn-breakdown-header button {
    border: none;
    background: transparent;
    cursor: pointer;
    color: #64748b;
}

.eepn-breakdown-subtitle {
    color: #64748b;
    font-size: 0.85rem;
    margin: 0 0 12px;
}

.eepn-breakdown-empty {
    color: #94a3b8;
    font-style: italic;
}

.eepn-breakdown-table {
    width: 100%;
    font-size: 0.8rem;
    border-collapse: collapse;
}

.eepn-breakdown-table th,
.eepn-breakdown-table td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
}

.eepn-breakdown-table th {
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.7rem;
}

.eepn-breakdown-table td:last-child {
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
}

/* Notes */
.eepn-notes {
    margin-top: 32px;
}

.eepn-note-item {
    border-top: 1px solid #e2e8f0;
    padding: 12px 0;
    cursor: pointer;
}

.eepn-note-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: #334155;
}

.eepn-note-content {
    margin-top: 8px;
    color: #64748b;
    font-size: 0.9rem;
    line-height: 1.6;
}

/* Empty State */
.eepn-empty {
    text-align: center;
    padding: 64px 32px;
    color: #64748b;
}

.eepn-empty-icon {
    margin-bottom: 16px;
    color: #94a3b8;
}

.eepn-empty-hint {
    font-size: 0.85rem;
    color: #94a3b8;
}

/* Zero value formatting */
.eepn-zero-muted {
    color: #cbd5e1;
    font-style: normal;
}

.eepn-zero-dash {
    color: #cbd5e1;
    font-weight: 400;
}

.eepn-zero-cell {
    color: #cbd5e1;
}

/* Calculated cell differentiation */
.eepn-calculated {
    background: rgba(241, 245, 249, 0.6) !important;
}

/* Custom row styling */
.eepn-row-custom {
    background: #fefce8;
}

.eepn-row-custom .eepn-td-concept {
    background: #fefce8;
}

.eepn-delete-custom-row {
    display: inline-flex;
    align-items: center;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #94a3b8;
    padding: 2px;
    margin-left: 6px;
    border-radius: 3px;
    vertical-align: middle;
    transition: all 0.15s;
}

.eepn-delete-custom-row:hover {
    color: #ef4444;
    background: #fef2f2;
}

/* Add row prompt */
.eepn-add-row-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #fefce8;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    margin-bottom: 16px;
}

.eepn-add-row-input {
    flex: 1;
    max-width: 300px;
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: inherit;
}

.eepn-add-row-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

/* Print Header */
.eepn-print-header {
    display: none;
}

/* Print Styles */
@media print {
    .eepn-action-bar,
    .eepn-kpi-grid,
    .eepn-warnings,
    .eepn-notes,
    .eepn-breakdown-panel,
    .eepn-badge-manual,
    .eepn-add-row-prompt,
    .eepn-delete-custom-row {
        display: none !important;
    }

    .eepn-formal-header {
        border-bottom: 1pt solid black;
        padding-bottom: 8pt;
        margin-bottom: 12pt;
    }

    .eepn-formal-title {
        font-size: 14pt;
        color: black;
    }

    .eepn-formal-subtitle,
    .eepn-formal-currency {
        color: black;
        font-size: 10pt;
    }

    .eepn-container {
        padding: 0;
        animation: none;
    }

    .eepn-print-header {
        display: block !important;
        margin-bottom: 20pt;
        border-bottom: 1pt solid black;
        padding-bottom: 10pt;
    }

    .eepn-print-header h1 {
        font-size: 14pt;
        text-transform: uppercase;
        margin: 0 0 8pt;
    }

    .eepn-print-header p {
        font-size: 10pt;
        margin: 2pt 0;
    }

    .eepn-table-container {
        border: none;
        box-shadow: none;
        overflow: visible;
        border-radius: 0;
    }

    .eepn-table {
        font-size: 8pt;
    }

    .eepn-table th,
    .eepn-table td {
        border: 0.5pt solid #000 !important;
        padding: 3pt 4pt;
        background: transparent !important;
        color: black !important;
        position: static !important;
    }

    .eepn-th-subtotal,
    .eepn-td-subtotal {
        border-left: 1.5pt solid #000 !important;
        font-weight: bold !important;
    }

    .eepn-td-total {
        border-left: 1.5pt solid #000 !important;
    }

    .eepn-row-section td,
    .eepn-row-total td {
        font-weight: bold;
    }

    .eepn-row-cierre td {
        border-top: 1.5pt solid #000 !important;
    }

    .eepn-negative {
        color: black !important;
    }

    .eepn-negative::before {
        content: '(';
    }

    .eepn-negative::after {
        content: ')';
    }

    /* Show all rows in print (including zero-hidden rows) */
    .eepn-row-zero-hidden {
        display: table-row !important;
    }

    .eepn-zero-muted,
    .eepn-zero-dash,
    .eepn-zero-cell {
        color: #ccc !important;
    }

    .eepn-row-custom td {
        background: transparent !important;
    }
}
`
