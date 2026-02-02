/**
 * EvolucionPNTab - Estado de Evolución del Patrimonio Neto
 *
 * UI component for displaying the EEPN with:
 * - Interactive matrix with editable cells
 * - Manual overrides with visual indicators
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
} from 'lucide-react'
import {
    computeEEPN,
    getCellValue,
    isCellOverridden,
    getCellBreakdown,
    EEPN_COLUMNS,
    COLUMN_GROUPS,
} from '../../core/eepn'
import type { EEPNResult, EEPNRow, EEPNCellBreakdown } from '../../core/eepn'
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
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
    const [selectedCell, setSelectedCell] = useState<{ rowId: string; colId: string } | null>(null)
    const [showBreakdown, setShowBreakdown] = useState(false)

    const printRef = useRef<HTMLDivElement>(null)

    // Compute period dates (Default to PREVIOUS year if logic matches original, but better to follow passed dates)
    // Original logic: periodStart = `${fiscalYear - 1}-01-01`
    // If props are passed, use them.
    const periodStart = propPeriodStart ?? `${fiscalYear - 1}-01-01`
    const periodEnd = propPeriodEnd ?? `${fiscalYear - 1}-12-31`

    // Format date for label
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

    // Handlers
    const handleReset = useCallback(() => {
        if (overrides.size === 0) return
        if (!confirm('¿Restablecer todos los valores manuales?')) return
        setOverrides(new Map())
    }, [overrides.size])

    const handleRecalculate = useCallback(() => {
        // Force re-render by toggling a dummy state
        setOverrides(prev => new Map(prev))
    }, [])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

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
            const key = `${editingCell.rowId}:${editingCell.colId}`
            setOverrides(prev => {
                const next = new Map(prev)
                next.set(key, parsed)
                return next
            })
        }
        setEditingCell(null)
    }, [editingCell])

    const handleEditCancel = useCallback(() => {
        setEditingCell(null)
    }, [])

    const handleResetCell = useCallback((rowId: string, colId: string) => {
        const key = `${rowId}:${colId}`
        setOverrides(prev => {
            const next = new Map(prev)
            next.delete(key)
            return next
        })
    }, [])

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

    const { rows, columns, pnInicio, pnCierre, variacionNeta, reconciliation } = eepnResult

    // Get breakdown for selected cell
    const selectedBreakdown = selectedCell
        ? getCellBreakdown(
            rows.find(r => r.id === selectedCell.rowId)!,
            selectedCell.colId
        )
        : []

    return (
        <div className="eepn-container">
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
                    {overrides.size > 0 && (
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
                        {/* Group headers */}
                        <tr>
                            <th rowSpan={2} className="eepn-th-concept">Concepto</th>
                            {showDetail ? (
                                <>
                                    {COLUMN_GROUPS.map(g => {
                                        const colCount = columns.filter(c => c.group === g.id).length
                                        return (
                                            <th key={g.id} colSpan={colCount} className="eepn-th-group">
                                                {g.label}
                                            </th>
                                        )
                                    })}
                                </>
                            ) : (
                                <th colSpan={3} className="eepn-th-group">Composición del PN</th>
                            )}
                            <th rowSpan={2} className="eepn-th-total">Total PN</th>
                            {showComparative && (
                                <th rowSpan={2} className="eepn-th-comp">Comp. {fiscalYear - 2}</th>
                            )}
                        </tr>
                        {/* Column headers */}
                        <tr>
                            {showDetail ? (
                                columns.map(col => (
                                    <th key={col.id} className="eepn-th-col">
                                        {col.shortLabel}
                                    </th>
                                ))
                            ) : (
                                <>
                                    <th className="eepn-th-col">Total Aportes</th>
                                    <th className="eepn-th-col">Gan. Reservadas</th>
                                    <th className="eepn-th-col">Result. Acum.</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <EEPNTableRow
                                key={row.id}
                                row={row}
                                columns={columns}
                                showDetail={showDetail}
                                showComparative={showComparative}
                                editingCell={editingCell}
                                onCellClick={handleCellClick}
                                onCellDoubleClick={handleCellDoubleClick}
                                onEditChange={(value) => setEditingCell(prev => prev ? { ...prev, value } : null)}
                                onEditSave={handleEditSave}
                                onEditCancel={handleEditCancel}
                                onResetCell={handleResetCell}
                            />
                        ))}
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
    onCellClick: (rowId: string, colId: string) => void
    onCellDoubleClick: (rowId: string, colId: string, value: number) => void
    onEditChange: (value: string) => void
    onEditSave: () => void
    onEditCancel: () => void
    onResetCell: (rowId: string, colId: string) => void
}

function EEPNTableRow({
    row,
    columns,
    showDetail,
    showComparative,
    editingCell,
    onCellClick,
    onCellDoubleClick,
    onEditChange,
    onEditSave,
    onEditCancel,
    onResetCell,
}: EEPNTableRowProps) {
    // Section header row
    if (row.isHeader) {
        const totalCols = showDetail ? columns.length + 2 : 5
        return (
            <tr className="eepn-row-section">
                <td colSpan={totalCols + (showComparative ? 1 : 0)}>{row.label}</td>
            </tr>
        )
    }

    const rowClass = row.isTotal
        ? 'eepn-row-total'
        : row.type === 'SALDO_INICIO' || row.type === 'SALDO_INICIO_AJUSTADO'
            ? 'eepn-row-section'
            : ''

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

    return (
        <tr className={rowClass}>
            <td className="eepn-td-concept" style={{ paddingLeft: row.indent ? `${16 + row.indent * 16}px` : undefined }}>
                {row.indent ? <ChevronRight size={12} className="eepn-indent-icon" /> : null}
                {row.label}
            </td>

            {showDetail ? (
                columns.map(col => {
                    const value = getCellValue(row, col.id)
                    const isOverridden = isCellOverridden(row, col.id)
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colId === col.id

                    return (
                        <td
                            key={col.id}
                            className={`eepn-td-num ${value < 0 ? 'eepn-negative' : ''} ${isOverridden ? 'eepn-overridden' : ''} eepn-editable`}
                            onClick={() => onCellClick(row.id, col.id)}
                            onDoubleClick={() => onCellDoubleClick(row.id, col.id, value)}
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
                                    {formatNumber(value)}
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
                })
            ) : (
                <>
                    <td className={`eepn-td-num ${(groupedTotals?.APORTES ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatNumber(groupedTotals?.APORTES ?? 0)}
                    </td>
                    <td className={`eepn-td-num ${(groupedTotals?.RESERVAS ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatNumber(groupedTotals?.RESERVAS ?? 0)}
                    </td>
                    <td className={`eepn-td-num ${(groupedTotals?.RESULTADOS ?? 0) < 0 ? 'eepn-negative' : ''}`}>
                        {formatNumber(groupedTotals?.RESULTADOS ?? 0)}
                    </td>
                </>
            )}

            <td className={`eepn-td-num eepn-td-total ${row.total < 0 ? 'eepn-negative' : ''}`}>
                {formatNumber(row.total)}
            </td>

            {showComparative && (
                <td className="eepn-td-num eepn-td-comp">
                    {formatNumber(row.comparativeTotal ?? row.total * 0.85)}
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
}

.eepn-action-group {
    display: flex;
    align-items: center;
    gap: 16px;
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
    min-width: 200px;
}

.eepn-th-group {
    background: #e2e8f0 !important;
}

.eepn-th-total {
    background: rgba(59, 130, 246, 0.1) !important;
    color: #2563eb !important;
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
}

.eepn-td-num {
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    position: relative;
}

.eepn-td-total {
    background: rgba(59, 130, 246, 0.05);
    font-weight: 700;
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

.eepn-row-total {
    background: #f0fdf4;
}

.eepn-row-total td {
    font-weight: 700;
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
    .eepn-badge-manual {
        display: none !important;
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
        font-size: 9pt;
    }

    .eepn-table th,
    .eepn-table td {
        border: 0.5pt solid #000 !important;
        padding: 4pt;
        background: transparent !important;
        color: black !important;
    }

    .eepn-row-section td,
    .eepn-row-total td {
        font-weight: bold;
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
}
`
