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
import { EquityMatrixView } from './EquityMatrixView'
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
const TAX_STATUS_INFO: Record<string, { label: string; hint: string }> = {
    NOT_APPLICABLE: {
        label: 'No aplicable',
        hint: 'El ejercicio no registra actividad de resultados que genere impuesto a las ganancias.',
    },
    INSUFFICIENT_INFORMATION: {
        label: 'Información insuficiente',
        hint: 'Ninguna cuenta del plan está mapeada al grupo "Impuesto a las ganancias". Configurala en Configuración → Plan de cuentas y mapeos; el importe no se muestra como $ 0,00 calculado.',
    },
}

export function ERCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const { open, modal } = useLineage(bundle)
    const er = bundle.statements.incomeStatement
    const showComp = bundle.metadata.hasComparative
    const taxCalculated = er.incomeTaxStatus === 'CALCULATED'
    const taxInfo = TAX_STATUS_INFO[er.incomeTaxStatus]
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <StatementCard title="Estado de Resultados" accent="red" showComparative={showComp}>
                <StatementRows
                    lines={[er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.preTaxResult]}
                    showComparative={showComp}
                    onLineClick={open}
                />
                {taxCalculated ? (
                    <StatementRows lines={[er.incomeTax]} showComparative={showComp} onLineClick={open} />
                ) : (
                    <div className="stmt-rubro-row" title={taxInfo?.hint}>
                        <span className="stmt-rubro-label">
                            <span className="stmt-caret-spacer" aria-hidden />
                            <span className="stmt-rubro-name">Impuesto a las ganancias</span>
                            <span className="stmt-note-badge" style={{ background: 'rgba(234,179,8,0.12)', color: '#a16207', borderColor: 'rgba(234,179,8,0.35)' }}>
                                {taxInfo?.label}
                            </span>
                        </span>
                        <span className="stmt-amount" style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>
                    </div>
                )}
                {!taxCalculated && taxInfo && (
                    <p style={{ fontSize: '0.74rem', color: '#a16207', margin: '2px 12px 6px', lineHeight: 1.45 }}>{taxInfo.hint}</p>
                )}
                <StatementRows
                    lines={[er.continuingResult, er.netIncome]}
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
    const [view, setView] = useState<'MATRIX' | 'SUMMARY'>('MATRIX')
    const [matrixTarget, setMatrixTarget] = useState<{ label: string; accountIds: string[] } | null>(null)
    const eepn = bundle.statements.equityStatement
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />

            <div className="eqm-toolbar" role="group" aria-label="Vista del EEPN" style={{ marginRight: 12 }}>
                <button type="button" className={`eqm-filter-btn${view === 'MATRIX' ? ' active' : ''}`} aria-pressed={view === 'MATRIX'} onClick={() => setView('MATRIX')}>
                    Vista matricial
                </button>
                <button type="button" className={`eqm-filter-btn${view === 'SUMMARY' ? ' active' : ''}`} aria-pressed={view === 'SUMMARY'} onClick={() => setView('SUMMARY')}>
                    Vista resumida
                </button>
            </div>

            {view === 'MATRIX' ? (
                <EquityMatrixView
                    matrix={bundle.statements.equityMatrix}
                    onCellClick={(label, accountIds) => setMatrixTarget({ label, accountIds })}
                />
            ) : (
                <StatementCard title="Evolución del Patrimonio Neto" accent="violet" showComparative={showComp}>
                    <StatementRows
                        lines={[eepn.openingBalance, eepn.contributions, eepn.distributions, eepn.reservesMovements, eepn.otherMovements, eepn.periodResult, eepn.closingBalance]}
                        showComparative={showComp}
                        onLineClick={open}
                    />
                </StatementCard>
            )}

            {matrixTarget && (
                <LineageModal
                    bundle={bundle.statements}
                    lineId="eepn:matrix"
                    label={matrixTarget.label}
                    accountIds={matrixTarget.accountIds}
                    onClose={() => setMatrixTarget(null)}
                />
            )}
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
