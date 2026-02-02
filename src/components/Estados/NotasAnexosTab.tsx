/**
 * NotasAnexosTab - Notas a los Estados Contables y Anexos
 *
 * UI component for displaying:
 * - Notas (notes to financial statements)
 * - Anexo de Gastos (expense allocation by function)
 * - Anexo de Costos (CMV determination)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
    RotateCcw,
    RefreshCw,
    Printer,
    Columns,
    List,
    AlertTriangle,
    Check,
    X,
    Sliders,
} from 'lucide-react'
import type { Account, JournalEntry, BalanceSheet, IncomeStatement } from '../../core/models'
import {
    computeNotasAnexos,
    createEmptyState,
    updateNarrative,
    updateExpenseAllocation,
    resetExpenseAllocation,
    updateCostOverride,
    resetAllState,
} from '../../core/notas-anexos'
import type {
    NotasAnexosState,
    NotasAnexosResult,
    ComputedNote,
    ExpenseAnnexLine,
    CostComponent,
    ExpenseAllocation,
} from '../../core/notas-anexos/types'
import {
    saveNotasAnexosState,
    loadNotasAnexosState,
    getPeriodKey,
} from '../../storage/notasAnexosStore'

// ============================================
// Types
// ============================================

type SubTab = 'notas' | 'gastos' | 'costos'

interface NotasAnexosTabProps {
    balanceSheet: BalanceSheet
    incomeStatement: IncomeStatement
    accounts: Account[]
    entries: JournalEntry[]
    fiscalYear: number
    empresaName: string
    empresaId: string
    comparativeData?: Map<string, number>
    periodEnd?: string
}

// ============================================
// Main Component
// ============================================

export function NotasAnexosTab({
    balanceSheet,
    incomeStatement,
    fiscalYear,
    empresaName,
    empresaId,
    comparativeData,
    periodEnd,
}: NotasAnexosTabProps) {
    // State
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('notas')
    const [showComparative, setShowComparative] = useState(false)
    const [showDetail, setShowDetail] = useState(true)
    const [naState, setNaState] = useState<NotasAnexosState>(createEmptyState)
    const [selectedNoteIdx, setSelectedNoteIdx] = useState(0)
    const [allocPopover, setAllocPopover] = useState<{ line: ExpenseAnnexLine; rect: DOMRect } | null>(null)

    const printRef = useRef<HTMLDivElement>(null)
    const periodKey = getPeriodKey(fiscalYear)

    // Date formatting
    const formattedDate = useMemo(() => {
        if (periodEnd) {
            const [y, m, d] = periodEnd.split('-')
            return `${d}/${m}/${y}`
        }
        return `31/12/${fiscalYear}`
    }, [periodEnd, fiscalYear])

    // Load state from storage on mount
    useEffect(() => {
        const loaded = loadNotasAnexosState(empresaId, periodKey)
        if (loaded) {
            setNaState(loaded)
        }
    }, [empresaId, periodKey])

    // Compute result
    const result = useMemo<NotasAnexosResult>(() => {
        return computeNotasAnexos(
            balanceSheet,
            incomeStatement,
            naState,
            showComparative ? comparativeData : undefined
        )
    }, [balanceSheet, incomeStatement, naState, showComparative, comparativeData])

    // Handlers
    const handleSaveState = useCallback((newState: NotasAnexosState) => {
        setNaState(newState)
        saveNotasAnexosState(empresaId, periodKey, newState)
    }, [empresaId, periodKey])

    const handleNarrativeChange = useCallback((noteNumber: number, text: string) => {
        const newState = updateNarrative(naState, noteNumber, text)
        handleSaveState(newState)
    }, [naState, handleSaveState])

    const handleAllocationChange = useCallback((accountCode: string, allocation: ExpenseAllocation) => {
        const newState = updateExpenseAllocation(naState, accountCode, allocation)
        handleSaveState(newState)
        setAllocPopover(null)
    }, [naState, handleSaveState])

    const handleResetAllocation = useCallback((accountCode: string) => {
        const newState = resetExpenseAllocation(naState, accountCode)
        handleSaveState(newState)
    }, [naState, handleSaveState])

    const handleCostOverrideChange = useCallback((componentId: string, value: number) => {
        const newState = updateCostOverride(naState, componentId, value)
        handleSaveState(newState)
    }, [naState, handleSaveState])

    const handleReset = useCallback(() => {
        if (!confirm('¿Restablecer todas las ediciones manuales?')) return
        const newState = resetAllState()
        handleSaveState(newState)
    }, [handleSaveState])

    const handleRecalculate = useCallback(() => {
        // Force re-render
        setNaState(prev => ({ ...prev }))
    }, [])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    // Print title based on active subtab
    const printTitle = useMemo(() => {
        switch (activeSubTab) {
            case 'notas': return 'NOTAS A LOS ESTADOS CONTABLES'
            case 'gastos': return 'ANEXO I - GASTOS POR FUNCION'
            case 'costos': return 'ANEXO II - DETERMINACION DEL CMV'
        }
    }, [activeSubTab])

    return (
        <div className="na-container">
            {/* Action Bar */}
            <div className="na-action-bar">
                <div className="na-action-group">
                    <button
                        className={`na-toggle-btn ${showComparative ? 'active' : ''}`}
                        onClick={() => setShowComparative(!showComparative)}
                    >
                        <Columns size={16} />
                        Comparativo
                    </button>
                    <button
                        className={`na-toggle-btn ${showDetail ? 'active' : ''}`}
                        onClick={() => setShowDetail(!showDetail)}
                    >
                        <List size={16} />
                        Detallado
                    </button>
                    <div className="na-divider" />
                    <span className="na-period">Ejercicio {fiscalYear}</span>
                </div>
                <div className="na-action-group">
                    {result.hasManualOverrides && (
                        <button className="na-btn na-btn-danger" onClick={handleReset}>
                            <RotateCcw size={16} />
                            Restablecer
                        </button>
                    )}
                    <button className="na-btn" onClick={handleRecalculate}>
                        <RefreshCw size={16} />
                        Recalcular
                    </button>
                    <button className="na-btn na-btn-primary" onClick={handlePrint}>
                        <Printer size={16} />
                        Imprimir / PDF
                    </button>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="na-subtabs">
                <button
                    className={`na-subtab ${activeSubTab === 'notas' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('notas')}
                >
                    Notas
                </button>
                <button
                    className={`na-subtab ${activeSubTab === 'gastos' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('gastos')}
                >
                    Anexo de Gastos
                </button>
                <button
                    className={`na-subtab ${activeSubTab === 'costos' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('costos')}
                >
                    Anexo de Costos
                </button>
            </div>

            {/* Print Header (hidden on screen) */}
            <div className="na-print-header" ref={printRef}>
                <div className="na-print-company">{empresaName.toUpperCase()}</div>
                <div className="na-print-date">ESTADOS CONTABLES AL {formattedDate}</div>
                <div className="na-print-title">{printTitle}</div>
                <div className="na-print-currency">Cifras expresadas en Pesos argentinos ($)</div>
                {showComparative && (
                    <div className="na-print-comp">Comparativo: 31/12/{fiscalYear - 1}</div>
                )}
            </div>

            {/* Content Sections */}
            {activeSubTab === 'notas' && (
                <NotasSection
                    notes={result.notes}
                    showComparative={showComparative}
                    showDetail={showDetail}
                    selectedIdx={selectedNoteIdx}
                    onSelectNote={setSelectedNoteIdx}
                    onNarrativeChange={handleNarrativeChange}
                    fiscalYear={fiscalYear}
                    formattedDate={formattedDate}
                />
            )}

            {activeSubTab === 'gastos' && (
                <GastosSection
                    annex={result.expenseAnnex}
                    showComparative={showComparative}
                    allocPopover={allocPopover}
                    onOpenAlloc={(line, rect) => setAllocPopover({ line, rect })}
                    onCloseAlloc={() => setAllocPopover(null)}
                    onAllocationChange={handleAllocationChange}
                    onResetAllocation={handleResetAllocation}
                />
            )}

            {activeSubTab === 'costos' && (
                <CostosSection
                    annex={result.costAnnex}
                    fiscalYear={fiscalYear}
                    empresaCurrency="$"
                    onOverrideChange={handleCostOverrideChange}
                    formattedDate={formattedDate}
                />
            )}

            {/* Allocation Popover */}
            {allocPopover && (
                <AllocationPopover
                    line={allocPopover.line}
                    rect={allocPopover.rect}
                    onSave={handleAllocationChange}
                    onClose={() => setAllocPopover(null)}
                />
            )}

            <style>{styles}</style>
        </div>
    )
}

// ============================================
// Sub-components
// ============================================

interface NotasSectionProps {
    notes: ComputedNote[]
    showComparative: boolean
    showDetail: boolean
    selectedIdx: number
    onSelectNote: (idx: number) => void
    onNarrativeChange: (noteNumber: number, text: string) => void
    fiscalYear: number
    formattedDate: string
}

function NotasSection({
    notes,
    showComparative,
    showDetail,
    selectedIdx,
    onSelectNote,
    onNarrativeChange,
    fiscalYear,
    formattedDate,
}: NotasSectionProps) {
    return (
        <div className="na-notas-layout">
            {/* Index */}
            <div className="na-notas-index">
                <div className="na-index-title">Indice de Notas</div>
                {notes.map((note, idx) => (
                    <button
                        key={note.definition.number}
                        className={`na-index-item ${idx === selectedIdx ? 'active' : ''}`}
                        onClick={() => {
                            onSelectNote(idx)
                            document.getElementById(`nota-${note.definition.number}`)?.scrollIntoView({ behavior: 'smooth' })
                        }}
                    >
                        Nota {note.definition.number} - {note.definition.title}
                    </button>
                ))}
            </div>

            {/* Notes */}
            <div className="na-notas-content">
                {notes.map(note => (
                    <NoteCard
                        key={note.definition.number}
                        note={note}
                        showComparative={showComparative}
                        showDetail={showDetail}
                        fiscalYear={fiscalYear}
                        formattedDate={formattedDate}
                        onNarrativeChange={onNarrativeChange}
                    />
                ))}
            </div>
        </div>
    )
}

interface NoteCardProps {
    note: ComputedNote
    showComparative: boolean
    showDetail: boolean
    fiscalYear: number
    formattedDate: string
    onNarrativeChange: (noteNumber: number, text: string) => void
}

function NoteCard({ note, showComparative, showDetail, fiscalYear, formattedDate, onNarrativeChange }: NoteCardProps) {
    const [localNarrative, setLocalNarrative] = useState(note.narrative)

    useEffect(() => {
        setLocalNarrative(note.narrative)
    }, [note.narrative])

    const handleBlur = () => {
        if (localNarrative !== note.narrative) {
            onNarrativeChange(note.definition.number, localNarrative)
        }
    }

    // Filter details based on showDetail
    const displayDetails = showDetail
        ? note.details.filter(d => Math.abs(d.currentAmount) > 0.01)
        : []

    return (
        <div id={`nota-${note.definition.number}`} className="na-note-card">
            <div className="na-note-header">
                <div className="na-note-title">
                    NOTA {note.definition.number} - {note.definition.title.toUpperCase()}
                </div>
                <div className="na-note-date">Al {formattedDate}</div>
            </div>

            {note.hasDiscrepancy && (
                <div className="na-warning">
                    <AlertTriangle size={14} />
                    Total no coincide con Balance (Diferencia: {formatNumber(Math.abs(note.totalCurrent - (note.balanceRubroTotal ?? 0)))})
                </div>
            )}

            <table className="na-table">
                <thead>
                    <tr>
                        <th>Cuenta</th>
                        <th className="na-num">{formattedDate}</th>
                        {showComparative && <th className="na-num">31/12/{fiscalYear - 1}</th>}
                    </tr>
                </thead>
                <tbody>
                    {displayDetails.map(detail => (
                        <tr key={detail.accountId}>
                            <td>{detail.name}</td>
                            <td className={`na-num ${detail.currentAmount < 0 ? 'na-negative' : ''}`}>
                                {formatNumber(detail.currentAmount)}
                            </td>
                            {showComparative && (
                                <td className="na-num na-comp">
                                    {detail.priorAmount !== undefined ? formatNumber(detail.priorAmount) : '-'}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td>TOTAL {note.definition.title.toUpperCase()}</td>
                        <td className="na-num">{formatNumber(note.totalCurrent)}</td>
                        {showComparative && (
                            <td className="na-num na-comp">
                                {note.totalPrior !== undefined ? formatNumber(note.totalPrior) : '-'}
                            </td>
                        )}
                    </tr>
                </tfoot>
            </table>

            <div className="na-narrative">
                <label className="na-narrative-label">NARRATIVA (EDITABLE)</label>
                <textarea
                    value={localNarrative}
                    onChange={e => setLocalNarrative(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Ingresar aclaraciones para esta nota..."
                />
            </div>
        </div>
    )
}

interface GastosSectionProps {
    annex: NotasAnexosResult['expenseAnnex']
    showComparative: boolean
    allocPopover: { line: ExpenseAnnexLine; rect: DOMRect } | null
    onOpenAlloc: (line: ExpenseAnnexLine, rect: DOMRect) => void
    onCloseAlloc: () => void
    onAllocationChange: (accountCode: string, allocation: ExpenseAllocation) => void
    onResetAllocation: (accountCode: string) => void
}

function GastosSection({
    annex,
    onOpenAlloc,
    onResetAllocation,
}: GastosSectionProps) {
    return (
        <div className="na-gastos-section">
            <div className="na-card">
                <div className="na-card-header">
                    <div>
                        <h3 className="na-card-title">Anexo de Gastos (Cuadro por funcion)</h3>
                        <p className="na-card-subtitle">Asignacion de gastos a Costos, Administracion y Comercializacion.</p>
                    </div>
                </div>
                <table className="na-table">
                    <thead>
                        <tr>
                            <th>Cta / Concepto</th>
                            <th className="na-num">Importe Total</th>
                            <th className="na-num na-cost-col">Costo</th>
                            <th className="na-num">Admin.</th>
                            <th className="na-num">Comerc.</th>
                            <th style={{ textAlign: 'center' }}>Asignacion</th>
                        </tr>
                    </thead>
                    <tbody>
                        {annex.lines.map(line => (
                            <tr key={line.accountId}>
                                <td>
                                    {line.name}
                                    {line.isManual && (
                                        <span
                                            className="na-badge-m"
                                            title="Asignacion manual - click para restablecer"
                                            onClick={() => onResetAllocation(line.code)}
                                        >
                                            M
                                        </span>
                                    )}
                                </td>
                                <td className="na-num">{formatNumber(line.totalAmount)}</td>
                                <td className="na-num na-cost-col">{formatNumber(line.costAmount)}</td>
                                <td className="na-num">{formatNumber(line.adminAmount)}</td>
                                <td className="na-num">{formatNumber(line.commercialAmount)}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <button
                                        className="na-btn-icon"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            onOpenAlloc(line, rect)
                                        }}
                                    >
                                        <Sliders size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>TOTALES</td>
                            <td className="na-num">{formatNumber(annex.totals.total)}</td>
                            <td className="na-num na-cost-col">{formatNumber(annex.totals.cost)}</td>
                            <td className="na-num">{formatNumber(annex.totals.admin)}</td>
                            <td className="na-num">{formatNumber(annex.totals.commercial)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}

interface CostosSectionProps {
    annex: NotasAnexosResult['costAnnex']
    fiscalYear: number
    empresaCurrency: string
    onOverrideChange: (componentId: string, value: number) => void
    formattedDate: string
}

function CostosSection({ annex, empresaCurrency, onOverrideChange, formattedDate }: CostosSectionProps) {
    return (
        <div className="na-costos-section">
            <div className="na-card" style={{ maxWidth: 800, margin: '0 auto' }}>
                <div className="na-card-header">
                    <h3 className="na-card-title">Costo de Mercaderia Vendida (CMV)</h3>
                </div>
                <table className="na-table">
                    <tbody>
                        {annex.components.map(comp => (
                            <CostRow
                                key={comp.id}
                                component={comp}
                                onOverrideChange={onOverrideChange}
                            />
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td className="na-cmv-label">COSTO DE MERCADERIA VENDIDA (CMV)</td>
                            <td className="na-num na-cmv-value">{formatNumber(annex.cmv)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {annex.hasDiscrepancy && (
                <div className="na-warning" style={{ maxWidth: 800, margin: '16px auto' }}>
                    <AlertTriangle size={14} />
                    CMV no concilia con Estado de Resultados (ER: {formatNumber(annex.cmvFromER ?? 0)})
                </div>
            )}

            <div className="na-cmv-highlight">
                <div>
                    <h4>Total CMV Determinado</h4>
                    <p>Correspondiente al ejercicio finalizado el {formattedDate}</p>
                </div>
                <div className="na-cmv-amount">{empresaCurrency} {formatNumber(annex.cmv)}</div>
            </div>
        </div>
    )
}

interface CostRowProps {
    component: CostComponent
    onOverrideChange: (componentId: string, value: number) => void
}

function CostRow({ component, onOverrideChange }: CostRowProps) {
    const [editing, setEditing] = useState(false)
    const [inputValue, setInputValue] = useState('')

    const handleStartEdit = () => {
        if (component.isAutomatic) return
        setInputValue(formatInputNumber(component.effectiveValue))
        setEditing(true)
    }

    const handleSave = () => {
        const parsed = parseInputNumber(inputValue)
        if (!isNaN(parsed)) {
            onOverrideChange(component.id, parsed)
        }
        setEditing(false)
    }

    const handleCancel = () => {
        setEditing(false)
    }

    return (
        <tr>
            <td className={component.isAutomatic ? 'na-auto-label' : ''}>
                {component.label}
                {component.isManual && <span className="na-badge-m">M</span>}
            </td>
            <td className="na-num" style={{ width: 200 }}>
                {editing ? (
                    <div className="na-edit-cell">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSave()
                                if (e.key === 'Escape') handleCancel()
                            }}
                            autoFocus
                        />
                        <button onClick={handleSave}><Check size={12} /></button>
                        <button onClick={handleCancel}><X size={12} /></button>
                    </div>
                ) : (
                    <span
                        className={component.isAutomatic ? '' : 'na-editable'}
                        onClick={handleStartEdit}
                    >
                        {formatNumber(component.effectiveValue)}
                    </span>
                )}
            </td>
        </tr>
    )
}

interface AllocationPopoverProps {
    line: ExpenseAnnexLine
    rect: DOMRect
    onSave: (accountCode: string, allocation: ExpenseAllocation) => void
    onClose: () => void
}

function AllocationPopover({ line, rect, onSave, onClose }: AllocationPopoverProps) {
    const [costPct, setCostPct] = useState(line.allocation.costPct)
    const [adminPct, setAdminPct] = useState(line.allocation.adminPct)
    const [commercialPct, setCommercialPct] = useState(line.allocation.commercialPct)

    const handleSave = () => {
        onSave(line.code, { costPct, adminPct, commercialPct })
    }

    // Adjust position
    const style: React.CSSProperties = {
        position: 'fixed',
        top: rect.top - 150,
        left: rect.left - 250,
        zIndex: 1000,
    }

    return (
        <>
            <div className="na-popover-backdrop" onClick={onClose} />
            <div className="na-alloc-popover" style={style}>
                <h4>Asignar Gastos %</h4>
                <div className="na-alloc-row">
                    <label>Costo</label>
                    <div className="na-alloc-input">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={costPct}
                            onChange={e => setCostPct(Number(e.target.value))}
                        />
                        <span className="na-alloc-val">{costPct}%</span>
                    </div>
                </div>
                <div className="na-alloc-row">
                    <label>Administracion</label>
                    <div className="na-alloc-input">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={adminPct}
                            onChange={e => setAdminPct(Number(e.target.value))}
                        />
                        <span className="na-alloc-val">{adminPct}%</span>
                    </div>
                </div>
                <div className="na-alloc-row">
                    <label>Comercializacion</label>
                    <div className="na-alloc-input">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={commercialPct}
                            onChange={e => setCommercialPct(Number(e.target.value))}
                        />
                        <span className="na-alloc-val">{commercialPct}%</span>
                    </div>
                </div>
                <div className="na-alloc-footer">
                    <button className="na-btn na-btn-primary" onClick={handleSave}>
                        Aplicar
                    </button>
                </div>
            </div>
        </>
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
.na-container {
    animation: naSlideUp 0.4s ease-out forwards;
}

@keyframes naSlideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Action Bar */
.na-action-bar {
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

.na-action-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.na-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
}

.na-toggle-btn.active {
    background: #0f172a;
    color: white;
    border-color: #0f172a;
}

.na-divider {
    width: 1px;
    height: 20px;
    background: #e2e8f0;
}

.na-period {
    font-size: 0.85rem;
    font-weight: 600;
    color: #334155;
}

.na-btn {
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

.na-btn:hover { background: #f8fafc; }

.na-btn-primary {
    background: linear-gradient(135deg, #2563eb 0%, #10b981 100%);
    color: white;
    border: none;
}

.na-btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

.na-btn-danger {
    color: #ef4444;
    border-color: transparent;
    background: transparent;
}

.na-btn-danger:hover { background: #fef2f2; }

.na-btn-icon {
    padding: 6px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    color: #64748b;
}

.na-btn-icon:hover { background: #f1f5f9; }

/* Sub Tabs */
.na-subtabs {
    display: flex;
    gap: 32px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 24px;
}

.na-subtab {
    padding: 12px 4px;
    color: #64748b;
    font-weight: 600;
    font-size: 0.95rem;
    background: none;
    border: none;
    cursor: pointer;
    position: relative;
    transition: 0.2s;
}

.na-subtab:hover { color: #334155; }

.na-subtab.active {
    color: #3b82f6;
}

.na-subtab.active::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 3px;
    background: #3b82f6;
    border-radius: 3px 3px 0 0;
}

/* Card */
.na-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    overflow: hidden;
}

.na-card-header {
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
}

.na-card-title {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
}

.na-card-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin: 4px 0 0;
}

/* Table */
.na-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
}

.na-table th {
    background: #f8fafc;
    text-align: left;
    padding: 10px 12px;
    color: #64748b;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e2e8f0;
}

.na-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
}

.na-table tbody tr:hover { background: #f8fafc; }

.na-table tfoot tr td {
    font-weight: 700;
    background: #f1f5f9;
    border-bottom: none;
}

.na-num {
    font-family: 'JetBrains Mono', monospace;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.na-negative { color: #ef4444; }

.na-comp { color: #94a3b8; }

.na-cost-col {
    background: #f0f9ff;
    color: #2563eb;
}

/* Notas Layout */
.na-notas-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 24px;
}

.na-notas-index {
    position: sticky;
    top: 24px;
    height: fit-content;
}

.na-index-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0 12px;
    margin-bottom: 12px;
}

.na-index-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #64748b;
    background: none;
    border: none;
    cursor: pointer;
    transition: 0.2s;
}

.na-index-item:hover {
    background: white;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    color: #334155;
}

.na-index-item.active {
    background: white;
    color: #3b82f6;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Note Card */
.na-note-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    overflow: hidden;
    margin-bottom: 24px;
    scroll-margin-top: 24px;
}

.na-note-header {
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.na-note-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
}

.na-note-date {
    font-size: 0.75rem;
    color: #94a3b8;
}

/* Narrative */
.na-narrative {
    margin: 16px;
    padding: 12px;
    background: #f1f5f9;
    border-radius: 6px;
}

.na-narrative-label {
    display: block;
    font-size: 0.65rem;
    font-weight: 700;
    color: #3b82f6;
    margin-bottom: 6px;
}

.na-narrative textarea {
    width: 100%;
    background: transparent;
    border: none;
    font-family: inherit;
    font-size: 0.9rem;
    color: #64748b;
    resize: vertical;
    min-height: 60px;
    line-height: 1.5;
}

.na-narrative textarea:focus {
    outline: none;
    color: #0f172a;
}

/* Warning */
.na-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    font-size: 0.85rem;
    margin: 0 16px 16px;
    border-radius: 6px;
}

/* Badge M */
.na-badge-m {
    display: inline-block;
    background: #fff7ed;
    color: #c2410c;
    border: 1px solid #fed7aa;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 800;
    margin-left: 6px;
    vertical-align: middle;
    cursor: pointer;
}

.na-badge-m:hover { background: #fed7aa; }

/* CMV Highlight */
.na-cmv-highlight {
    max-width: 800px;
    margin: 24px auto;
    background: linear-gradient(135deg, #2563eb 0%, #10b981 100%);
    padding: 24px 32px;
    border-radius: 12px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.na-cmv-highlight h4 {
    font-family: 'Outfit', sans-serif;
    opacity: 0.9;
    margin: 0 0 4px;
}

.na-cmv-highlight p {
    font-size: 0.85rem;
    opacity: 0.8;
    margin: 0;
}

.na-cmv-amount {
    font-size: 2.5rem;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
}

.na-cmv-label { font-weight: 800; font-size: 1rem; }
.na-cmv-value { font-weight: 800; font-size: 1rem; }

.na-auto-label { color: #3b82f6; font-weight: 600; }

/* Edit Cell */
.na-edit-cell {
    display: flex;
    align-items: center;
    gap: 4px;
}

.na-edit-cell input {
    width: 100px;
    padding: 4px 8px;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    text-align: right;
}

.na-edit-cell button {
    padding: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #64748b;
}

.na-edit-cell button:hover { color: #0f172a; }

.na-editable { cursor: pointer; }
.na-editable:hover { text-decoration: underline; }

/* Allocation Popover */
.na-popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
}

.na-alloc-popover {
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-radius: 12px;
    padding: 16px;
    width: 240px;
}

.na-alloc-popover h4 {
    font-size: 0.85rem;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
}

.na-alloc-row { margin-bottom: 12px; }

.na-alloc-row label {
    display: block;
    font-size: 0.75rem;
    margin-bottom: 4px;
    font-weight: 600;
    color: #64748b;
}

.na-alloc-input {
    display: flex;
    align-items: center;
    gap: 8px;
}

.na-alloc-input input[type="range"] {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    accent-color: #3b82f6;
}

.na-alloc-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    width: 40px;
    text-align: right;
}

.na-alloc-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: flex-end;
}

/* Print Header */
.na-print-header {
    display: none;
}

/* Print Styles */
@media print {
    .na-action-bar,
    .na-subtabs,
    .na-notas-index,
    .na-btn,
    .na-btn-icon,
    .na-badge-m,
    .na-alloc-popover,
    .na-popover-backdrop,
    .na-cmv-highlight {
        display: none !important;
    }

    .na-container {
        padding: 0;
        animation: none;
    }

    .na-print-header {
        display: block !important;
        margin-bottom: 20pt;
        border-bottom: 2pt solid black;
        padding-bottom: 10pt;
    }

    .na-print-company {
        font-size: 14pt;
        font-weight: 800;
        text-transform: uppercase;
    }

    .na-print-date,
    .na-print-currency,
    .na-print-comp {
        font-size: 10pt;
        margin-top: 4pt;
    }

    .na-print-title {
        font-size: 12pt;
        font-weight: 700;
        margin-top: 8pt;
    }

    .na-notas-layout {
        display: block;
    }

    .na-card,
    .na-note-card {
        border: none;
        box-shadow: none;
        border-radius: 0;
        margin-bottom: 16pt;
        break-inside: avoid;
    }

    .na-table {
        font-size: 9pt;
        border: 0.5pt solid #000;
    }

    .na-table th,
    .na-table td {
        border: 0.5pt solid #ccc;
        padding: 4pt;
        background: transparent !important;
        color: black !important;
    }

    .na-narrative {
        background: none;
        padding: 0;
        font-style: italic;
    }

    .na-negative {
        color: black !important;
    }

    .na-negative::before { content: '('; }
    .na-negative::after { content: ')'; }
}
`
