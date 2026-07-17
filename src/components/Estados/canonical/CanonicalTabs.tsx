/**
 * Tabs canónicos ESP/ER/EEPN/Notas — Fase 2C (§5.1) / rediseño Fase 2D (§1).
 *
 * Renderizan EXCLUSIVAMENTE desde el ReportingBundle del motor. No importan
 * utils/resultsStatement, core/statements ni domain/reports. Los importes ya
 * vienen calculados; acá solo se presentan (diseño anterior recuperado) con
 * detalle desplegable, comparativo y drilldown de trazabilidad.
 */

import { useState } from 'react'
import { StatementCard, StatementRows } from './StatementView'
import { statementStyles } from './statementFormat'
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
            <div className={`stmt-grid${showComp ? '' : ' two-col'}`}>
                <StatementCard
                    title="Activo"
                    accent="green"
                    total={bs.totalAssets.amount}
                    comparativeTotal={bs.totalAssets.comparativeAmount}
                    showComparative={showComp}
                >
                    <StatementRows lines={bs.totalAssets.children ?? [bs.currentAssets, bs.nonCurrentAssets]} showComparative={showComp} onLineClick={open} />
                </StatementCard>

                <StatementCard
                    title="Pasivo y Patrimonio Neto"
                    accent="blue"
                    total={bs.totalLiabilitiesAndEquity.amount}
                    comparativeTotal={bs.totalLiabilitiesAndEquity.comparativeAmount}
                    showComparative={showComp}
                >
                    <StatementRows lines={[bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity]} showComparative={showComp} onLineClick={open} />
                </StatementCard>
            </div>
            {modal}
            <style>{statementStyles}</style>
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
            <StatementCard title="Estado de Resultados" accent="red" showComparative={showComp}>
                <StatementRows
                    lines={[er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.netIncome]}
                    showComparative={showComp}
                    onLineClick={open}
                />
            </StatementCard>
            {modal}
            <style>{statementStyles}</style>
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
            <StatementCard title="Evolución del Patrimonio Neto" accent="violet" showComparative={showComp}>
                <StatementRows
                    lines={[eepn.openingBalance, eepn.contributions, eepn.distributions, eepn.reservesMovements, eepn.otherMovements, eepn.periodResult, eepn.closingBalance]}
                    showComparative={showComp}
                    onLineClick={open}
                />
            </StatementCard>
            {modal}
            <style>{statementStyles}</style>
        </div>
    )
}

// ── Notas ────────────────────────────────────────────────────
function NoteCard({ note }: { note: StatementNote }) {
    return (
        <div className="stmt-card" style={{ marginBottom: 14 }}>
            <div className="stmt-card-header">
                <h3 className="stmt-card-title" style={{ fontSize: '1rem' }}>{note.title}</h3>
                {note.reconciled === true && <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>✓ Reconciliada</span>}
                {note.reconciled === false && <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700 }}>✗ No reconcilia</span>}
            </div>
            <div className="stmt-card-body" style={{ padding: 16 }}>
                {note.text && <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 8px', lineHeight: 1.5 }}>{note.text}</p>}
                {note.lines.length > 0 && (
                    <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
                        <tbody>
                            {note.lines.map((l, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '5px 6px' }}>
                                        {l.label}
                                        {l.origin === 'MANUAL' && <span style={{ color: '#a16207', fontSize: '0.7rem' }}> (manual)</span>}
                                        {l.origin === 'NOT_AVAILABLE' && <span style={{ color: '#64748b', fontSize: '0.7rem' }}> (no disponible)</span>}
                                    </td>
                                    <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.amount)}</td>
                                </tr>
                            ))}
                            {note.total != null && (
                                <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                    <td style={{ padding: '5px 6px' }}>Total</td>
                                    <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(note.total)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
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
            <style>{statementStyles}</style>
        </div>
    )
}
