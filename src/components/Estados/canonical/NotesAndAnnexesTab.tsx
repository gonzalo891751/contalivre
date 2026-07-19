/**
 * NotesAndAnnexesTab — Fase 2E (§8): notas cuantitativas como composición.
 *
 * Subtabs: Notas · Gastos por función · Costo de ventas · Bienes de uso ·
 * Moneda extranjera. Cada nota es una tarjeta colapsable con número, importe
 * actual, comparativo, variación, estado de reconciliación y origen; al
 * expandir muestra la composición cuenta por cuenta (regularizadoras en
 * negativo) con drilldown de trazabilidad. Presentador PURO del bundle.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import LineageModal from './LineageModal'
import { ExpensesByFunctionView } from './ExpensesByFunctionView'
import { CostOfSalesBridgeView } from './CostOfSalesBridgeView'
import { statementStyles } from './statementFormat'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'
import type { StatementNote, NoteLine } from '../../../reporting/engine/buildNotes'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v: number | null | undefined) => (v == null ? '—' : nf.format(v))

export type NotesSubTab = 'NOTAS' | 'GASTOS' | 'CMV' | 'BIENES_USO' | 'MONEDA_EXT'

const SUBTABS: { id: NotesSubTab; label: string }[] = [
    { id: 'NOTAS', label: 'Notas' },
    { id: 'GASTOS', label: 'Gastos por función' },
    { id: 'CMV', label: 'Costo de ventas' },
    { id: 'BIENES_USO', label: 'Bienes de uso' },
    { id: 'MONEDA_EXT', label: 'Moneda extranjera' },
]

function variation(total: number | null, comp: number | null | undefined): string | null {
    if (total == null || comp == null) return null
    const diff = total - comp
    return `${diff >= 0 ? '+' : ''}${nf.format(diff)}`
}

function OriginBadge({ origin }: { origin: NoteLine['origin'] }) {
    if (origin === 'DERIVED') return null
    const map: Record<string, { label: string; color: string; bg: string }> = {
        MANUAL: { label: 'manual', color: '#a16207', bg: 'rgba(234,179,8,0.12)' },
        NOT_AVAILABLE: { label: 'no disponible', color: '#64748b', bg: '#f1f5f9' },
        NOT_APPLICABLE: { label: 'no aplicable', color: '#64748b', bg: '#f1f5f9' },
    }
    const m = map[origin]
    return <span style={{ fontSize: '0.64rem', fontWeight: 700, color: m.color, background: m.bg, padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>{m.label}</span>
}

function NoteCard({ note, showComparative, focused, onLineClick }: {
    note: StatementNote
    showComparative: boolean
    focused: boolean
    onLineClick: (label: string, accountIds: string[]) => void
}) {
    const [open, setOpen] = useState(focused)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (focused) {
            setOpen(true)
            ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }, [focused])

    const hasAmounts = note.lines.some(l => l.amount != null)
    const vari = showComparative ? variation(note.total, note.comparativeTotal) : null
    const bodyId = `note-body-${note.id}`

    return (
        <div ref={ref} className={`note-card${focused ? ' is-focused' : ''}`}>
            <button
                type="button"
                className="note-card-head"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen(o => !o)}
            >
                <span className="note-card-title">
                    <ChevronRight size={14} strokeWidth={2.5} className={`note-caret${open ? ' is-open' : ''}`} aria-hidden />
                    <span className="note-number">Nota {note.number}</span>
                    {note.title}
                </span>
                <span className="note-card-meta">
                    {note.total != null && <span className="note-amount">{fmt(note.total)}</span>}
                    {showComparative && note.comparativeTotal !== undefined && (
                        <span className="note-amount note-amount-prev">{fmt(note.comparativeTotal)}</span>
                    )}
                    {vari && <span className="note-variation">{vari}</span>}
                    {note.reconciled === true && <span className="note-badge ok">✓ Reconciliada</span>}
                    {note.reconciled === false && <span className="note-badge bad">✗ No reconcilia</span>}
                </span>
            </button>

            {open && (
                <div className="note-card-body" id={bodyId}>
                    {note.text && <p className="note-policy">{note.text}</p>}
                    {hasAmounts && (
                        <table className="note-table">
                            <thead>
                                <tr>
                                    <th scope="col">Cuenta o componente</th>
                                    <th scope="col" className="num">Actual</th>
                                    {showComparative && <th scope="col" className="num">Comparativo</th>}
                                    {showComparative && <th scope="col" className="num">Variación</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {note.lines.map((l, i) => (
                                    <tr
                                        key={i}
                                        className={l.accountIds.length > 0 ? 'is-clickable' : undefined}
                                        onClick={l.accountIds.length > 0 ? () => onLineClick(l.label, l.accountIds) : undefined}
                                        tabIndex={l.accountIds.length > 0 ? 0 : undefined}
                                        onKeyDown={l.accountIds.length > 0 ? e => { if (e.key === 'Enter') onLineClick(l.label, l.accountIds) } : undefined}
                                        title={l.accountIds.length > 0 ? 'Ver trazabilidad hasta los asientos' : undefined}
                                    >
                                        <td>
                                            {l.label}
                                            <OriginBadge origin={l.origin} />
                                        </td>
                                        <td className={`num${l.amount != null && l.amount < 0 ? ' neg' : ''}`}>
                                            {l.amount != null && l.amount < 0 ? `(${nf.format(Math.abs(l.amount))})` : fmt(l.amount)}
                                        </td>
                                        {showComparative && <td className="num">{fmt(l.comparativeAmount)}</td>}
                                        {showComparative && (
                                            <td className="num">
                                                {l.amount != null && l.comparativeAmount != null
                                                    ? variation(l.amount, l.comparativeAmount)
                                                    : '—'}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {note.total != null && (
                                    <tr className="note-total-row">
                                        <td>Total</td>
                                        <td className="num">{fmt(note.total)}</td>
                                        {showComparative && <td className="num">{fmt(note.comparativeTotal)}</td>}
                                        {showComparative && <td className="num">{vari ?? '—'}</td>}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                    {!hasAmounts && !note.text && <p className="note-policy">Sin información en este ejercicio.</p>}
                </div>
            )}
        </div>
    )
}

export interface NotesAndAnnexesTabProps {
    bundle: ReportingBundle
    /** número de nota a enfocar (referencia cruzada desde ESP/ER) */
    focusNote?: string | null
    /** subtabs de anexos aún no implementados o sin datos (se ocultan/deshabilitan) */
    extraAnnexes?: Partial<Record<Exclude<NotesSubTab, 'NOTAS'>, React.ReactNode>>
}

export function NotesAndAnnexesTab({ bundle, focusNote, extraAnnexes }: NotesAndAnnexesTabProps) {
    const [subtab, setSubtab] = useState<NotesSubTab>('NOTAS')
    const [target, setTarget] = useState<{ label: string; accountIds: string[] } | null>(null)
    const showComparative = bundle.metadata.hasComparative

    const expenses = bundle.statements.expensesByFunction
    const hasExpenses = expenses.rows.length > 0 || expenses.unmappedExpenses.length > 0
    const costOfSales = bundle.statements.costOfSales

    const available: Record<NotesSubTab, boolean> = {
        NOTAS: true,
        GASTOS: hasExpenses,
        CMV: costOfSales.mode !== 'NOT_APPLICABLE',
        BIENES_USO: !!extraAnnexes?.BIENES_USO,
        MONEDA_EXT: !!extraAnnexes?.MONEDA_EXT,
    }

    useEffect(() => {
        if (focusNote) setSubtab('NOTAS')
    }, [focusNote])

    return (
        <div>
            <nav className="note-subtabs" role="tablist" aria-label="Notas y anexos">
                {SUBTABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={subtab === t.id}
                        className={`note-subtab${subtab === t.id ? ' active' : ''}`}
                        disabled={!available[t.id]}
                        title={!available[t.id] ? 'Sin datos aplicables en este ejercicio' : undefined}
                        onClick={() => setSubtab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {subtab === 'NOTAS' && (
                <div>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 12px' }}>
                        Composición de cada rubro derivada del motor canónico, con regularizadoras en negativo y estado de reconciliación.
                        La información de carga manual se identifica y nunca modifica un total derivado.
                    </p>
                    {bundle.notes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            showComparative={showComparative}
                            focused={focusNote != null && String(note.number) === focusNote}
                            onLineClick={(label, accountIds) => setTarget({ label, accountIds })}
                        />
                    ))}
                </div>
            )}

            {subtab === 'GASTOS' && (
                <ExpensesByFunctionView
                    matrix={expenses}
                    showComparative={showComparative}
                    onAccountClick={(label, accountIds) => setTarget({ label, accountIds })}
                />
            )}

            {subtab === 'CMV' && (
                <CostOfSalesBridgeView
                    bridge={costOfSales}
                    showComparative={showComparative}
                    onDrilldown={(label, accountIds) => setTarget({ label, accountIds })}
                />
            )}

            {subtab !== 'NOTAS' && subtab !== 'GASTOS' && subtab !== 'CMV' && extraAnnexes?.[subtab]}

            {target && (
                <LineageModal
                    bundle={bundle.statements}
                    lineId={`nota:${target.label}`}
                    label={target.label}
                    accountIds={target.accountIds}
                    onClose={() => setTarget(null)}
                />
            )}

            <style>{statementStyles}{notesStyles}</style>
        </div>
    )
}

const notesStyles = `
.note-subtabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; padding: 4px; background: rgba(241,245,249,0.9); border: 1px solid #e2e8f0; border-radius: 12px; width: fit-content; max-width: 100%; }
.note-subtab { padding: 7px 14px; font-size: 0.82rem; font-weight: 600; color: #64748b; background: transparent; border: none; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.note-subtab.active { background: white; color: #3B82F6; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.note-subtab:disabled { opacity: 0.45; cursor: not-allowed; }
.note-subtab:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }

.note-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.note-card.is-focused { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
.note-card-head {
    display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%;
    padding: 12px 16px; background: transparent; border: none; cursor: pointer; text-align: left;
}
.note-card-head:hover { background: #f8fafc; }
.note-card-head:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.note-card-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #0f172a; font-size: 0.9rem; min-width: 0; }
.note-caret { color: #3B82F6; transition: transform 0.15s ease; flex-shrink: 0; }
.note-caret.is-open { transform: rotate(90deg); }
.note-number { font-size: 0.66rem; font-weight: 700; color: #3B82F6; background: rgba(59,130,246,0.1); padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
.note-card-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.note-amount { font-variant-numeric: tabular-nums; font-weight: 700; color: #0f172a; font-size: 0.88rem; }
.note-amount-prev { color: #94a3b8; font-weight: 500; }
.note-variation { font-size: 0.72rem; font-variant-numeric: tabular-nums; color: #64748b; }
.note-badge { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.note-badge.ok { color: #059669; background: rgba(16,185,129,0.1); }
.note-badge.bad { color: #dc2626; background: rgba(239,68,68,0.1); }

.note-card-body { border-top: 1px solid #f1f5f9; padding: 12px 16px 14px; }
.note-policy { font-size: 0.8rem; color: #475569; margin: 0 0 10px; line-height: 1.5; }
.note-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.note-table th { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
.note-table th.num, .note-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.note-table td { padding: 6px 8px; border-top: 1px solid #f8fafc; color: #334155; }
.note-table td.neg { color: #dc2626; }
.note-table tr.is-clickable { cursor: pointer; }
.note-table tr.is-clickable:hover { background: #f8fafc; }
.note-table tr.is-clickable:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.note-total-row td { border-top: 2px solid #cbd5e1; font-weight: 700; color: #0f172a; }

@media (prefers-reduced-motion: reduce) { .note-caret { transition: none; } }
`
