/**
 * Visualizaciones didácticas del Análisis de Estados Contables: estructura
 * patrimonial, ciclo operativo, efecto palanca y análisis vertical/horizontal.
 * Todo sale del ReportingBundle y del catálogo de indicadores; acá no se
 * calcula nada que no esté también en las fichas.
 */

import { useState } from 'react'
import type { ReportingBundle } from '../../reporting/loadReportingBundle'
import type { MetricCatalogEntry, HorizontalAnalysisRow, VerticalAnalysisRow } from '../../reporting/metrics/types'
import type { BalanceSheet2B } from '../../reporting/domain/types'
import { verticalBalanceSheet, verticalIncomeStatement } from '../../reporting/metrics/analysis'

const nf = (n: number, d = 1) => n.toLocaleString('es-AR', { maximumFractionDigits: d })
const money = (n: number) => `${n < 0 ? '−' : ''}$ ${Math.abs(Math.round(n)).toLocaleString('es-AR')}`
const calculated = (m: MetricCatalogEntry | undefined) => (m && m.result.status === 'CALCULATED' ? m.result.value : null)

// ─────────────────────────────────────────────────────────────
// Estructura patrimonial
// ─────────────────────────────────────────────────────────────

interface Block { key: string; label: string; amount: number; tone: string }

function StructureColumn({ title, blocks, total }: { title: string; blocks: Block[]; total: number }) {
    return (
        <div className="aec-struct-col">
            <span className="aec-struct-col-title">{title}</span>
            <div className="aec-struct-stack" role="img" aria-label={`${title}: ${blocks.map(b => `${b.label} ${nf((b.amount / total) * 100)}%`).join(', ')}`}>
                {blocks.filter(b => b.amount > 0).map(b => {
                    const share = (b.amount / total) * 100
                    return (
                        <div key={b.key} className={`aec-struct-block tone-${b.tone}`} style={{ flexGrow: b.amount }}>
                            <span className="aec-struct-block-label">{b.label}</span>
                            <span className="aec-struct-block-value">{nf(share)}%</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function structureOf(bs: BalanceSheet2B) {
    const total = Math.max(bs.totalAssets.amount, bs.totalLiabilitiesAndEquity.amount)
    return {
        total,
        assets: [
            { key: 'ac', label: 'Activo corriente', amount: bs.currentAssets.amount, tone: 'ac' },
            { key: 'anc', label: 'Activo no corriente', amount: bs.nonCurrentAssets.amount, tone: 'anc' },
        ],
        funding: [
            { key: 'pc', label: 'Pasivo corriente', amount: bs.currentLiabilities.amount, tone: 'pc' },
            { key: 'pnc', label: 'Pasivo no corriente', amount: bs.nonCurrentLiabilities.amount, tone: 'pnc' },
            { key: 'pn', label: 'Patrimonio neto', amount: bs.equity.amount, tone: 'pn' },
        ],
    }
}

export function StructureChart({ bundle }: { bundle: ReportingBundle }) {
    const current = structureOf(bundle.statements.balanceSheet)
    const prev = bundle.comparativeStatements ? structureOf(bundle.comparativeStatements.balanceSheet) : null
    if (current.total <= 0) return null
    const bs = bundle.statements.balanceSheet
    const ccPositive = bs.currentAssets.amount >= bs.currentLiabilities.amount
    return (
        <figure className="aec-struct">
            <div className="aec-struct-years">
                {prev && prev.total > 0 && (
                    <div className="aec-struct-year">
                        <span className="aec-struct-year-label">Ejercicio anterior</span>
                        <div className="aec-struct-pair">
                            <StructureColumn title="Activo" blocks={prev.assets} total={prev.total} />
                            <StructureColumn title="Financiación" blocks={prev.funding} total={prev.total} />
                        </div>
                    </div>
                )}
                <div className="aec-struct-year">
                    <span className="aec-struct-year-label">Ejercicio actual · {money(current.total)}</span>
                    <div className="aec-struct-pair">
                        <StructureColumn title="Activo" blocks={current.assets} total={current.total} />
                        <StructureColumn title="Financiación" blocks={current.funding} total={current.total} />
                    </div>
                </div>
            </div>
            <figcaption className="aec-caption">
                Cada columna suma 100%. Si el bloque azul claro (activo corriente) es más alto que el rojo (pasivo corriente),
                el capital corriente es positivo{ccPositive ? ', como en este caso' : '; en este caso es negativo'}. Si el verde
                (patrimonio neto) cubre todo el activo no corriente, el inmovilizado está financiado con fondos propios.
            </figcaption>
        </figure>
    )
}

// ─────────────────────────────────────────────────────────────
// Ciclo operativo
// ─────────────────────────────────────────────────────────────

export function CycleTimeline({ byId }: { byId: Map<string, MetricCatalogEntry> }) {
    const inv = calculated(byId.get('dias-inventario'))
    const cob = calculated(byId.get('dias-cobranza'))
    const pay = calculated(byId.get('dias-pago'))
    if (cob === null) return null
    const stock = inv ?? 0
    const cycle = stock + cob
    const span = Math.max(cycle, pay ?? 0, 1)
    const w = (d: number) => `${(Math.max(d, 0) / span) * 100}%`
    const gap = pay !== null ? cycle - pay : null
    return (
        <figure className="aec-cycle" aria-label="Línea de tiempo del ciclo operativo">
            <div className="aec-cycle-track">
                <span className="aec-cycle-track-label">La empresa</span>
                <div className="aec-cycle-bar">
                    {stock > 0 && <div className="aec-cycle-seg tone-stock" style={{ width: w(stock) }}><span>Stock {Math.round(stock)} d</span></div>}
                    <div className="aec-cycle-seg tone-cobro" style={{ width: w(cob) }}><span>Cobranza {Math.round(cob)} d</span></div>
                </div>
            </div>
            {pay !== null && (
                <div className="aec-cycle-track">
                    <span className="aec-cycle-track-label">Proveedores</span>
                    <div className="aec-cycle-bar">
                        <div className="aec-cycle-seg tone-pago" style={{ width: w(pay) }}><span>Financian {Math.round(pay)} d</span></div>
                        {gap !== null && gap > 0 && <div className="aec-cycle-seg tone-gap" style={{ width: w(gap) }}><span>A financiar {Math.round(gap)} d</span></div>}
                    </div>
                </div>
            )}
            <figcaption className="aec-caption">
                Ciclo operativo: {Math.round(cycle)} días (compra → venta → cobro).
                {gap !== null && (gap > 0
                    ? ` Los proveedores financian ${Math.round(pay!)} días; los ${Math.round(gap)} restantes los tiene que financiar la empresa.`
                    : ` Los proveedores financian todo el ciclo: la empresa cobra ${Math.round(-gap)} días antes de pagar.`)}
            </figcaption>
        </figure>
    )
}

// ─────────────────────────────────────────────────────────────
// Efecto palanca
// ─────────────────────────────────────────────────────────────

export function LeverageView({ byId }: { byId: Map<string, MetricCatalogEntry> }) {
    const ra = calculated(byId.get('roa'))
    const rpn = calculated(byId.get('roe'))
    const i = calculated(byId.get('costo-deuda'))
    if (ra === null || rpn === null) return null
    const bars = [
        { key: 'i', label: 'Costo de la deuda', value: i, tone: 'debt' },
        { key: 'ra', label: 'Rentabilidad del activo (RA)', value: ra, tone: 'ra' },
        { key: 'rpn', label: 'Rentabilidad del PN (RPN)', value: rpn, tone: 'rpn' },
    ]
    const max = Math.max(...bars.map(b => Math.abs(b.value ?? 0)), 1)
    const favorable = rpn > ra
    return (
        <figure className="aec-leverage">
            {bars.map(b => (
                <div key={b.key} className="aec-leverage-row">
                    <span className="aec-leverage-label">{b.label}</span>
                    <div className="aec-leverage-track">
                        {b.value !== null && <div className={`aec-leverage-bar tone-${b.tone}${b.value < 0 ? ' is-negative' : ''}`} style={{ width: `${(Math.abs(b.value) / max) * 100}%` }} />}
                    </div>
                    <span className="aec-leverage-value">{b.value === null ? '—' : `${nf(b.value, 2)}%`}</span>
                </div>
            ))}
            <figcaption className="aec-caption">
                {favorable
                    ? 'La RPN supera a la RA: la deuda costó menos de lo que rindió el activo, y la diferencia quedó para los propietarios (palanca favorable).'
                    : 'La RPN no supera a la RA: la deuda costó más de lo que rindió el activo, o no hay deuda que genere intereses (palanca neutra o desfavorable).'}
            </figcaption>
        </figure>
    )
}

// ─────────────────────────────────────────────────────────────
// Análisis vertical y horizontal
// ─────────────────────────────────────────────────────────────

/** Líneas del ER que restan: se muestran con signo negativo */
const ER_NEGATIVE_PREFIXES = ['er:cmv', 'er:admin', 'er:comercializacion', 'er:impuesto']
const signFor = (lineId: string) => (ER_NEGATIVE_PREFIXES.some(p => lineId === p || lineId.startsWith(`${p}:`)) ? -1 : 1)

interface CombinedRow {
    lineId: string
    label: string
    level: number
    current: number
    currentPct: number | null
    previous: number | null
    previousPct: number | null
    absoluteChange: number | null
    percentageChange: number | null
    note?: string
}

function combine(vertical: VerticalAnalysisRow[], horizontal: HorizontalAnalysisRow[], prevVertical: VerticalAnalysisRow[] | null, er: boolean): CombinedRow[] {
    const h = new Map(horizontal.map(r => [r.lineId, r]))
    const pv = new Map((prevVertical ?? []).map(r => [r.lineId, r]))
    return vertical.map(v => {
        const s = er ? signFor(v.lineId) : 1
        const hr = h.get(v.lineId)
        const prevRow = pv.get(v.lineId)
        return {
            lineId: v.lineId,
            label: v.label,
            level: v.level,
            current: s * v.amount,
            currentPct: v.percentage === null ? null : s * v.percentage,
            previous: hr?.previous === null || hr?.previous === undefined ? null : s * hr.previous,
            previousPct: prevRow?.percentage === null || prevRow?.percentage === undefined ? null : s * prevRow.percentage,
            absoluteChange: hr?.absoluteChange === null || hr?.absoluteChange === undefined ? null : s * hr.absoluteChange,
            percentageChange: hr?.percentageChange ?? null,
            note: hr?.note,
        }
    })
}

function AnalysisTable({ title, base, rows, showAccounts, hasPrev }: { title: string; base: string; rows: CombinedRow[]; showAccounts: boolean; hasPrev: boolean }) {
    const visible = rows.filter(r => showAccounts || r.level <= 1)
    return (
        <section className="aec-table-block">
            <h3 className="aec-h3">{title}</h3>
            <p className="aec-muted">Vertical: cada línea sobre {base}. Horizontal: variación contra el ejercicio anterior.</p>
            <div className="aec-table-scroll">
                <table className="aec-table">
                    <thead>
                        <tr>
                            <th scope="col" className="lbl">Concepto</th>
                            <th scope="col">Actual</th>
                            <th scope="col">% vertical</th>
                            {hasPrev && <th scope="col">Anterior</th>}
                            {hasPrev && <th scope="col">% vertical</th>}
                            {hasPrev && <th scope="col">Variación $</th>}
                            {hasPrev && <th scope="col">Variación %</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map(r => (
                            <tr key={r.lineId} className={`lvl-${r.level}`}>
                                <th scope="row" className="lbl">{r.label}</th>
                                <td>{money(r.current)}</td>
                                <td>{r.currentPct === null ? '—' : `${nf(r.currentPct)}%`}</td>
                                {hasPrev && <td>{r.previous === null ? '—' : money(r.previous)}</td>}
                                {hasPrev && <td>{r.previousPct === null ? '—' : `${nf(r.previousPct)}%`}</td>}
                                {hasPrev && <td>{r.absoluteChange === null ? '—' : money(r.absoluteChange)}</td>}
                                {hasPrev && <td title={r.note}>{r.percentageChange === null ? (r.previous === null ? '—' : 'n/c') : `${r.percentageChange > 0 ? '+' : ''}${nf(r.percentageChange)}%`}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

export function VerticalHorizontal({ bundle }: { bundle: ReportingBundle }) {
    const [showAccounts, setShowAccounts] = useState(false)
    const a = bundle.analysis
    const hasPrev = !!bundle.comparativeStatements
    // El vertical del ejercicio anterior se calcula con el mismo motor
    const prev = bundle.comparativeStatements
    const prevVerticalEsp = prev ? verticalBalanceSheet(prev) : null
    const prevVerticalEr = prev ? verticalIncomeStatement(prev) : null
    return (
        <div className="aec-tables">
            <label className="aec-switch">
                <input type="checkbox" checked={showAccounts} onChange={e => setShowAccounts(e.target.checked)} />
                <span>Mostrar también las cuentas</span>
            </label>
            <AnalysisTable title="Estado de situación patrimonial" base="el total del activo (o de la financiación, para pasivo y PN)"
                rows={combine(a.verticalBalanceSheet, a.horizontalBalanceSheet, prevVerticalEsp, false)} showAccounts={showAccounts} hasPrev={hasPrev} />
            <AnalysisTable title="Estado de resultados" base="las ventas netas"
                rows={combine(a.verticalIncomeStatement, a.horizontalIncomeStatement, prevVerticalEr, true)} showAccounts={showAccounts} hasPrev={hasPrev} />
            <p className="aec-muted">
                "n/c": la variación porcentual no se calcula cuando el importe anterior es cero o negativo (el porcentaje engañaría); mirá la variación en pesos.
            </p>
        </div>
    )
}
