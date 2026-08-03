/**
 * Juego consolidado y exportaciones (Fase 2K §15, §16, §22).
 */

import { Fragment, useState } from 'react'
import { FilePdf, MicrosoftExcelLogo } from '@phosphor-icons/react'
import { exportConsolidatedPdf } from '../../consolidation/export/consolidatedPdf'
import { downloadConsolidationWorkbook } from '../../consolidation/export/consolidatedWorkbook'
import type { ReportLine } from '../../reporting/domain/types'
import type { ConsolidationWorksheet } from '../../consolidation/domain/types'
import type { ConsolidatedStatements } from '../../consolidation/engine/statements'

const fmt = (n: number) =>
    n === 0 ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function LineRows({ lines, depth = 0 }: { lines: ReportLine[]; depth?: number }) {
    return (
        <>
            {lines.map(l => (
                <Fragment key={l.id}>
                    <tr className={l.level === 0 ? 'cons-st-total' : l.level === 1 ? 'cons-st-group' : undefined}>
                        <th scope="row" style={{ paddingLeft: 12 + depth * 18 }}>{l.label}</th>
                        <td className="cons-amount">{fmt(l.amount)}</td>
                    </tr>
                    {l.children && <LineRows lines={l.children} depth={depth + 1} />}
                </Fragment>
            ))}
        </>
    )
}

interface Props {
    statements: ConsolidatedStatements
    worksheet: ConsolidationWorksheet
}

export default function EstadosConsolidados({ statements, worksheet }: Props) {
    const [tab, setTab] = useState<'esp' | 'er' | 'eepn' | 'efe' | 'notas'>('esp')
    const [exporting, setExporting] = useState<string | null>(null)

    const bs = statements.balanceSheet
    const is = statements.incomeStatement

    const runExport = async (kind: 'pdf' | 'xlsx') => {
        setExporting(kind)
        try {
            if (kind === 'pdf') await exportConsolidatedPdf(statements, worksheet)
            else await downloadConsolidationWorkbook(worksheet, statements)
        } finally {
            setExporting(null)
        }
    }

    return (
        <div className="cons-statements">
            <div className="cons-statements-toolbar">
                <div className="cons-tabs" role="tablist" aria-label="Estados consolidados">
                    {([
                        ['esp', 'Situación patrimonial'],
                        ['er', 'Resultados'],
                        ['eepn', 'Evolución del PN'],
                        ['efe', 'Flujo de efectivo'],
                        ['notas', 'Notas'],
                    ] as const).map(([id, label]) => (
                        <button
                            key={id}
                            role="tab"
                            aria-selected={tab === id}
                            className={`cons-tab ${tab === id ? 'cons-tab-active' : ''}`}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="cons-export-actions">
                    <button
                        type="button" className="btn btn-secondary btn-sm"
                        onClick={() => void runExport('xlsx')} disabled={exporting !== null}
                    >
                        <MicrosoftExcelLogo size={16} weight="bold" aria-hidden="true" />
                        {exporting === 'xlsx' ? 'Generando…' : 'Libro de trabajo (Excel)'}
                    </button>
                    <button
                        type="button" className="btn btn-primary btn-sm"
                        onClick={() => void runExport('pdf')} disabled={exporting !== null}
                    >
                        <FilePdf size={16} weight="bold" aria-hidden="true" />
                        {exporting === 'pdf' ? 'Generando…' : 'Juego completo (PDF)'}
                    </button>
                </div>
            </div>

            {!statements.canPublish && (
                <div className="alert alert-warning" role="status">
                    <strong>El juego no puede emitirse formalmente todavía.</strong> Se exporta igual, marcado como
                    BORRADOR, para que puedas revisarlo. Resolvé primero los impedimentos del panel de preparación.
                </div>
            )}

            <div className="cons-statement-header">
                <h3>{statements.groupName} — Estados contables consolidados</h3>
                <p>
                    Controladora: {statements.parentCompanyName} · Período {statements.periodStart} al{' '}
                    {statements.periodEnd} · {statements.currency} · {statements.measurementUnit}
                </p>
            </div>

            {tab === 'esp' && (
                <table className="cons-statement-table">
                    <caption className="sr-only">Estado de Situación Patrimonial Consolidado</caption>
                    <thead><tr><th scope="col">Concepto</th><th scope="col">Consolidado</th></tr></thead>
                    <tbody>
                        <LineRows lines={[bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets]} />
                        <tr className="cons-st-spacer"><td colSpan={2} /></tr>
                        <LineRows lines={[bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities]} />
                        <tr className="cons-st-spacer"><td colSpan={2} /></tr>
                        <LineRows lines={[bs.equityOwners]} />
                        <tr className="cons-st-group">
                            <th scope="row" style={{ paddingLeft: 12 }}>{bs.nonControllingInterest.label}</th>
                            <td className="cons-amount">{fmt(bs.nonControllingInterest.amount)}</td>
                        </tr>
                        <LineRows lines={[bs.totalEquity, bs.totalLiabilitiesAndEquity]} />
                    </tbody>
                </table>
            )}

            {tab === 'er' && (
                <table className="cons-statement-table">
                    <caption className="sr-only">Estado de Resultados Consolidado</caption>
                    <thead><tr><th scope="col">Concepto</th><th scope="col">Consolidado</th></tr></thead>
                    <tbody>
                        <LineRows lines={[
                            is.sales, is.costOfSales, is.grossProfit, is.adminExpenses, is.sellingExpenses,
                            is.operatingResult, is.financialIncome, is.financialExpenses, is.otherResults,
                            is.preTaxResult, is.incomeTax, is.netIncome,
                        ]} />
                        <tr className="cons-st-spacer"><td colSpan={2} /></tr>
                        <LineRows lines={[is.attributableToOwners, is.attributableToNci]} />
                    </tbody>
                </table>
            )}

            {tab === 'eepn' && (
                <>
                    <div className="cons-table-container">
                        <table className="cons-statement-table cons-eepn">
                            <caption className="sr-only">Estado de Evolución del Patrimonio Neto Consolidado</caption>
                            <thead>
                                <tr>
                                    <th scope="col">Concepto</th>
                                    {statements.equityStatement.columns.map(c => (
                                        <th scope="col" key={c.id}>{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {statements.equityStatement.rows.map(r => (
                                    <tr key={r.id} className={r.isSubtotal ? 'cons-st-total' : undefined}>
                                        <th scope="row">{r.label}</th>
                                        {statements.equityStatement.columns.map(c => (
                                            <td key={c.id} className="cons-amount">
                                                {r.insufficient
                                                    ? <span className="cons-insufficient">Información insuficiente</span>
                                                    : fmt(r.cells[c.id] ?? 0)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="cons-note">{statements.equityStatement.note}</p>
                </>
            )}

            {tab === 'efe' && (
                statements.cashFlow && statements.cashFlow.blockers.length === 0 ? (
                    <>
                        <div className="cons-table-container">
                            <table className="cons-statement-table">
                                <caption className="sr-only">Estado de Flujo de Efectivo Consolidado</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Concepto</th>
                                        {worksheet.entities.map(e => <th scope="col" key={e.companyId}>{e.name}</th>)}
                                        <th scope="col">Suma previa</th>
                                        <th scope="col">Flujos internos</th>
                                        <th scope="col">Consolidado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="cons-st-group">
                                        <th scope="row">Efectivo al inicio del ejercicio</th>
                                        {worksheet.entities.map(e => <td key={e.companyId} className="cons-amount">—</td>)}
                                        <td className="cons-amount">—</td>
                                        <td className="cons-amount">—</td>
                                        <td className="cons-amount">{fmt(statements.cashFlow.openingCash)}</td>
                                    </tr>
                                    {statements.cashFlow.lines.map(l => (
                                        <tr key={l.activity}>
                                            <th scope="row">{l.label}</th>
                                            {worksheet.entities.map(e => (
                                                <td key={e.companyId} className="cons-amount">
                                                    {fmt(l.byEntity.find(b => b.companyId === e.companyId)?.amount ?? 0)}
                                                </td>
                                            ))}
                                            <td className="cons-amount">{fmt(l.subtotal)}</td>
                                            <td className="cons-amount">{fmt(l.elimination)}</td>
                                            <td className="cons-amount">{fmt(l.consolidated)}</td>
                                        </tr>
                                    ))}
                                    <tr className="cons-st-total">
                                        <th scope="row">Efectivo al cierre del ejercicio</th>
                                        {worksheet.entities.map(e => <td key={e.companyId} className="cons-amount">—</td>)}
                                        <td className="cons-amount">—</td>
                                        <td className="cons-amount">—</td>
                                        <td className="cons-amount">{fmt(statements.cashFlow.closingCash)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <h4 className="cons-subheading">Flujos entre entidades del grupo eliminados</h4>
                        <ul className="cons-detail-list">
                            {statements.cashFlow.eliminations.map(e => (
                                <li key={e.id}>
                                    <strong>{e.description}</strong>
                                    <span className="cons-amount-inline">{fmt(e.amount)}</span>
                                    <span className="cons-muted">
                                        {' '}· paga {worksheet.entities.find(x => x.companyId === e.payerCompanyId)?.name}
                                        {' '}· cobra {worksheet.entities.find(x => x.companyId === e.receiverCompanyId)?.name}
                                    </span>
                                </li>
                            ))}
                            {statements.cashFlow.eliminations.length === 0 && (
                                <li className="cons-muted">No se declararon flujos de efectivo entre las entidades.</li>
                            )}
                        </ul>
                    </>
                ) : (
                    <div className="alert alert-warning" role="status">
                        <strong>El Estado de Flujo de Efectivo consolidado no puede emitirse.</strong>
                        <ul>
                            {(statements.cashFlow?.blockers ?? ['No hay información de flujo de efectivo disponible.'])
                                .map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                    </div>
                )
            )}

            {tab === 'notas' && (
                <div className="cons-notes">
                    {statements.notes.map(note => (
                        <article key={note.id} className="card cons-note-card">
                            <h4>{note.title}</h4>
                            {note.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                            {note.table && (
                                <div className="cons-table-container">
                                    <table className="cons-statement-table">
                                        <thead>
                                            <tr>{note.table.headers.map(h => <th scope="col" key={h}>{h}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {note.table.rows.map((r, i) => (
                                                <tr key={i}>{r.map((cell, j) => (
                                                    j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>
                                                ))}</tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {note.requiresNarrative && (
                                <p className="cons-narrative-flag">
                                    Esta nota requiere que completes la narrativa profesional: el sistema aporta los
                                    datos, no inventa el texto.
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </div>
    )
}
