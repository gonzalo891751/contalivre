/**
 * Tabs canónicos ESP/ER/EEPN/Notas — Fase 2C (§5.1).
 *
 * Renderizan EXCLUSIVAMENTE desde el ReportingBundle del motor. No importan
 * utils/resultsStatement, core/statements ni domain/reports. Los importes ya
 * vienen calculados; acá solo se presentan con drilldown y comparativo.
 */

import { useState } from 'react'
import ReportLineTable from './ReportLineTable'
import ValidationBanner from './ValidationBanner'
import LineageModal from './LineageModal'
import type { ReportLine } from '../../../reporting/domain/types'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'
import type { StatementNote } from '../../../reporting/engine/buildNotes'

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

function useLineage(bundle: ReportingBundle) {
    const [target, setTarget] = useState<ReportLine | null>(null)
    const modal = target ? (
        <LineageModal
            bundle={bundle.statements}
            lineId={target.id}
            label={target.label}
            accountIds={target.accountIds}
            onClose={() => setTarget(null)}
        />
    ) : null
    return { open: (l: ReportLine) => setTarget(l), modal }
}

// ── ESP ──────────────────────────────────────────────────────
export function ESPCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const { open, modal } = useLineage(bundle)
    const bs = bundle.statements.balanceSheet
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <ReportLineTable
                title="Activo"
                lines={[bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets]}
                showComparative={showComp}
                onLineClick={open}
            />
            <ReportLineTable
                title="Pasivo y Patrimonio Neto"
                lines={[bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity, bs.totalLiabilitiesAndEquity]}
                showComparative={showComp}
                onLineClick={open}
            />
            {modal}
        </div>
    )
}

// ── ER ───────────────────────────────────────────────────────
export function ERCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const { open, modal } = useLineage(bundle)
    const er = bundle.statements.incomeStatement
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <ReportLineTable
                title="Estado de Resultados"
                lines={[er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.netIncome]}
                showComparative={showComp}
                onLineClick={open}
            />
            {modal}
        </div>
    )
}

// ── EEPN ─────────────────────────────────────────────────────
export function EEPNCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const { open, modal } = useLineage(bundle)
    const eepn = bundle.statements.equityStatement
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <ReportLineTable
                title="Evolución del Patrimonio Neto"
                lines={[eepn.openingBalance, eepn.contributions, eepn.distributions, eepn.reservesMovements, eepn.otherMovements, eepn.periodResult, eepn.closingBalance]}
                showComparative={showComp}
                onLineClick={open}
            />
            {modal}
        </div>
    )
}

// ── Notas ────────────────────────────────────────────────────
function NoteCard({ note }: { note: StatementNote }) {
    return (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{note.title}</h3>
                {note.reconciled === true && <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>✓ Reconciliada</span>}
                {note.reconciled === false && <span style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 }}>✗ No reconcilia</span>}
            </div>
            {note.text && <p style={{ fontSize: '0.82rem', color: '#475569', margin: '6px 0', lineHeight: 1.5 }}>{note.text}</p>}
            {note.lines.length > 0 && (
                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', marginTop: 6 }}>
                    <tbody>
                        {note.lines.map((l, i) => (
                            <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '4px 6px' }}>
                                    {l.label}
                                    {l.origin === 'MANUAL' && <span style={{ color: '#a16207', fontSize: '0.7rem' }}> (manual)</span>}
                                    {l.origin === 'NOT_AVAILABLE' && <span style={{ color: '#64748b', fontSize: '0.7rem' }}> (no disponible)</span>}
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.amount)}</td>
                            </tr>
                        ))}
                        {note.total != null && (
                            <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                <td style={{ padding: '4px 6px' }}>Total</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(note.total)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export function NotasCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    return (
        <div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
                Notas derivadas del motor canónico (reconciliadas con los rubros) e información de carga manual identificada.
            </p>
            {bundle.notes.map(n => <NoteCard key={n.id} note={n} />)}
        </div>
    )
}
