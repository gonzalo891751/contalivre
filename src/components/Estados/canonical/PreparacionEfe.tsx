/**
 * Vista de PREPARACIÓN del EFE — Fase 2G §12.2-12.7.
 *
 * Papel de trabajo matricial, didáctico y auditable. Consume EXCLUSIVAMENTE
 * `bundle.preparation` (CashFlowPreparationModel): no recalcula nada en React.
 * Escritorio: matriz con columnas por actividad, controles por fila/columna/
 * total y celda interactiva con fórmula, operandos y lineage. Móvil: tarjetas.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { money } from './statementFormat'
import { preparacionStyles } from './preparacionStyles'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'
import type { CashFlowPreparationModel, PrepMatrixRow, PrepImputation, PrepActivity } from '../../../reporting/preparation/cashFlowPreparation'

const ACTIVITY_LABEL: Record<PrepActivity, string> = {
    OPERATING: 'Operativas',
    INVESTING: 'Inversión',
    FINANCING: 'Financiación',
    UNCLASSIFIED: 'Sin clasificar',
}

const STEPS = [
    { n: 1, t: 'Determinar la variación del efectivo', d: 'Del saldo inicial al saldo final: cuánto varió el efectivo y equivalentes.' },
    { n: 2, t: 'Analizar los cambios contables', d: 'Cada cuenta patrimonial y de resultado cambió durante el ejercicio.' },
    { n: 3, t: 'Imputar cada cambio a una causa', d: 'Cada variación se clasifica como operativa, de inversión o de financiación.' },
    { n: 4, t: 'Conciliar y exponer el estado', d: 'La suma de las causas explica exactamente la variación del efectivo.' },
]

function ControlChip({ label, cents, ok }: { label: string; cents?: number; ok: boolean }) {
    return (
        <div className={`prep-control-chip ${ok ? 'is-ok' : 'is-bad'}`}>
            <span className="prep-control-icon" aria-hidden>{ok ? '✓' : '✗'}</span>
            <span className="prep-control-label">{label}</span>
            {cents != null && <span className="prep-control-value">{money(cents / 100)}</span>}
        </div>
    )
}

/** Panel de detalle de una fila/celda: fórmula, sustitución, regla y lineage (§12.5).
 * Accesible (§13): foco inicial, trampa de foco, Escape y retorno de foco. */
function CellDetail({ row, imputation, onClose }: { row: PrepMatrixRow; imputation?: PrepImputation; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const titleId = `prep-detail-title-${row.accountId}`

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        closeRef.current?.focus() // foco inicial
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
            if (e.key !== 'Tab') return
            const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            if (!focusables || focusables.length === 0) return
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            previouslyFocused?.focus() // retorno de foco al origen
        }
    }, [onClose])

    const operandsText = imputation
        ? Object.entries(imputation.operands).map(([k, v]) => `${k} = ${money(v)}`).join('   ')
        : `saldo final = ${money(row.closingCents / 100)}   saldo inicial = ${money(row.openingCents / 100)}`
    return (
        <div className="prep-detail-backdrop" onClick={onClose}>
            <div className="prep-detail" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} onClick={e => e.stopPropagation()}>
                <div className="prep-detail-head">
                    <div>
                        <div className="prep-detail-title" id={titleId}>{row.code} {row.name}</div>
                        <div className="prep-detail-sub">{imputation?.causeLabel ?? row.causeLabel} · {ACTIVITY_LABEL[row.activity]}</div>
                    </div>
                    <button type="button" className="prep-detail-close" onClick={onClose} aria-label="Cerrar" ref={closeRef}>✕</button>
                </div>
                <dl className="prep-detail-grid">
                    <dt>Fórmula</dt><dd className="prep-mono">{imputation?.formula ?? 'saldo final − saldo inicial'}</dd>
                    <dt>Sustitución</dt><dd className="prep-mono">{operandsText}</dd>
                    <dt>Resultado (técnico)</dt><dd className="prep-mono">{money(row.variationCents / 100)}</dd>
                    <dt>Interpretación económica</dt><dd>{money(row.economicVariationCents / 100)} · {row.originApplication === 'ORIGIN' ? 'Origen de fondos' : row.originApplication === 'APPLICATION' ? 'Aplicación de fondos' : 'Sin efecto'}</dd>
                    <dt>Regla</dt><dd>{imputation?.rule ?? row.activity}</dd>
                    <dt>Control</dt><dd>{row.control === 0 ? 'Conciliado (0)' : money(row.control / 100)}</dd>
                    <dt>Asientos</dt><dd>{row.entryIds.length > 0 ? `${row.entryIds.length} asiento(s): ${row.entryIds.slice(0, 6).join(', ')}${row.entryIds.length > 6 ? '…' : ''}` : 'Sin movimientos del período'}</dd>
                </dl>
            </div>
        </div>
    )
}

export default function PreparacionEfe({ bundle }: { bundle: ReportingBundle }) {
    const prep: CashFlowPreparationModel = bundle.preparation
    const [hideEmpty, setHideEmpty] = useState(true)
    const [onlyDiff, setOnlyDiff] = useState(false)
    const [activity, setActivity] = useState<PrepActivity | 'ALL'>('ALL')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<PrepMatrixRow | null>(null)

    const impByAccount = useMemo(() => {
        const m = new Map<string, PrepImputation>()
        for (const i of prep.imputations) m.set(i.accountId, i)
        return m
    }, [prep.imputations])

    const activities = prep.activities.length > 0 ? prep.activities : (['OPERATING', 'INVESTING', 'FINANCING'] as PrepActivity[])

    const rows = useMemo(() => prep.matrixRows.filter(r => {
        if (hideEmpty && r.state === 'NO_MOVEMENT') return false
        if (onlyDiff && r.control === 0) return false
        if (activity !== 'ALL' && r.activity !== activity) return false
        if (search.trim() && !(`${r.code} ${r.name}`.toLowerCase().includes(search.trim().toLowerCase()))) return false
        return true
    }), [prep.matrixRows, hideEmpty, onlyDiff, activity, search])

    const c = prep.controls

    return (
        <div className="prep-root">
            <header className="prep-header">
                <h3 className="prep-h3">Cómo se construye el Estado de Flujo de Efectivo</h3>
                <p className="prep-lead">Los saldos y movimientos contables se transforman en cobros, pagos y causas de la variación del efectivo.</p>
                <ol className="prep-steps">
                    {STEPS.map(s => (
                        <li key={s.n} className="prep-step">
                            <span className="prep-step-n" aria-hidden>{s.n}</span>
                            <span className="prep-step-body"><strong>{s.t}</strong><span>{s.d}</span></span>
                        </li>
                    ))}
                </ol>
            </header>

            {/* Puente del efectivo */}
            <section className="prep-bridge" aria-label="Puente del efectivo">
                <div className="prep-bridge-item"><span>Efectivo al inicio</span><strong>{money(prep.cashBridge.openingPublishedCents / 100)}</strong></div>
                {prep.cashBridge.priorAdjustmentsCents !== 0 && (
                    <>
                        <div className="prep-bridge-item is-adj"><span>Modificaciones ej. anteriores (AREA)</span><strong>{money(prep.cashBridge.priorAdjustmentsCents / 100)}</strong></div>
                        <div className="prep-bridge-item"><span>Efectivo al inicio modificado</span><strong>{money(prep.cashBridge.openingAdjustedCents / 100)}</strong></div>
                    </>
                )}
                <div className="prep-bridge-item is-var"><span>Variación neta</span><strong>{money(prep.cashBridge.netChangeCents / 100)}</strong></div>
                <div className="prep-bridge-item"><span>Efectivo al cierre</span><strong>{money(prep.cashBridge.closingCents / 100)}</strong></div>
            </section>

            {/* Panel de controles (§12.6): verde SOLO si el cálculo real lo aprueba */}
            <section className="prep-controls" aria-label="Controles de la preparación">
                <ControlChip label="Filas conciliadas" ok={c.rowsWithDifference === 0} cents={0} />
                <ControlChip label="Control total" ok={c.totalControlCents === 0} cents={c.totalControlCents} />
                <ControlChip label="Directo = Indirecto" ok={c.methodControlCents === 0} cents={c.methodControlCents} />
                <ControlChip label="Inicio + variación = cierre" ok={c.cashControlCents === 0} cents={c.cashControlCents} />
                <ControlChip label="EFE = ESP" ok={c.espControlCents === 0} cents={c.espControlCents} />
                <ControlChip label={bundle.publicationGate.canPublish ? 'Publicable' : 'Bloqueado'} ok={bundle.publicationGate.canPublish} />
            </section>

            {/* Filtros */}
            <div className="prep-filters">
                <input className="prep-search" type="search" placeholder="Buscar cuenta…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar cuenta" />
                <label className="prep-check"><input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Ocultar sin movimiento</label>
                <label className="prep-check"><input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} /> Solo diferencias</label>
                <select className="prep-select" value={activity} onChange={e => setActivity(e.target.value as PrepActivity | 'ALL')} aria-label="Filtrar por actividad">
                    <option value="ALL">Todas las actividades</option>
                    {activities.map(a => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
                </select>
            </div>

            <p className="prep-legend" aria-hidden>
                <span className="prep-badge is-origin">Origen</span> entra efectivo ·
                <span className="prep-badge is-app">Aplicación</span> sale efectivo. Los importes se muestran con interpretación económica.
            </p>

            {/* Matriz escritorio */}
            <div className="prep-table-wrap" role="region" aria-label="Matriz de preparación" tabIndex={0}>
                <table className="prep-table">
                    <thead>
                        <tr>
                            <th scope="col" className="prep-sticky-col">Cuenta / concepto</th>
                            <th scope="col">Saldo inicial</th>
                            <th scope="col">Saldo final</th>
                            <th scope="col">Variación</th>
                            <th scope="col">Origen / Aplic.</th>
                            {activities.map(a => <th scope="col" key={a}>{ACTIVITY_LABEL[a]}</th>)}
                            <th scope="col">Total imputado</th>
                            <th scope="col">Control</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id} className={r.state === 'BLOCKED' ? 'is-blocked' : ''}>
                                <th scope="row" className="prep-sticky-col">
                                    <button type="button" className="prep-cell-btn" onClick={() => setSelected(r)} title="Ver fórmula y trazabilidad">
                                        {r.code} {r.name}
                                    </button>
                                </th>
                                <td className="prep-num">{money(r.openingCents / 100)}</td>
                                <td className="prep-num">{money(r.closingCents / 100)}</td>
                                <td className="prep-num">{money(r.economicVariationCents / 100)}</td>
                                <td className="prep-oa">{r.originApplication === 'ORIGIN' ? 'Origen' : r.originApplication === 'APPLICATION' ? 'Aplicación' : '—'}</td>
                                {activities.map(a => (
                                    <td className="prep-num prep-imp" key={a}>
                                        {r.activity === a && r.economicVariationCents !== 0
                                            ? <button type="button" className="prep-cell-btn" onClick={() => setSelected(r)}>{money(r.economicVariationCents / 100)}</button>
                                            : ''}
                                    </td>
                                ))}
                                <td className="prep-num">{money(r.economicVariationCents / 100)}</td>
                                <td className={`prep-num ${r.control === 0 ? 'is-ok' : 'is-bad'}`}>{r.control === 0 ? '0' : money(r.control / 100)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <th scope="row" className="prep-sticky-col">Total explicado</th>
                            <td /><td /><td /><td />
                            {activities.map(a => {
                                const col = c.columns.find(cc => cc.activity === a)
                                return <td className="prep-num" key={a}>{col ? money(col.economicCents / 100) : ''}</td>
                            })}
                            <td className="prep-num">{money(prep.cashBridge.netChangeCents / 100)}</td>
                            <td className="prep-num is-ok">0</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Móvil: tarjetas por cuenta (§12.7) */}
            <div className="prep-cards" aria-hidden={false}>
                {rows.map(r => (
                    <button type="button" key={r.id} className={`prep-card ${r.state === 'BLOCKED' ? 'is-blocked' : ''}`} onClick={() => setSelected(r)}>
                        <div className="prep-card-top"><span className="prep-card-name">{r.code} {r.name}</span><span className={`prep-badge ${r.originApplication === 'ORIGIN' ? 'is-origin' : r.originApplication === 'APPLICATION' ? 'is-app' : ''}`}>{ACTIVITY_LABEL[r.activity]}</span></div>
                        <dl className="prep-card-grid">
                            <div><dt>Inicial</dt><dd>{money(r.openingCents / 100)}</dd></div>
                            <div><dt>Final</dt><dd>{money(r.closingCents / 100)}</dd></div>
                            <div><dt>Variación</dt><dd>{money(r.economicVariationCents / 100)}</dd></div>
                            <div><dt>Control</dt><dd className={r.control === 0 ? 'is-ok' : 'is-bad'}>{r.control === 0 ? '0' : money(r.control / 100)}</dd></div>
                        </dl>
                    </button>
                ))}
            </div>

            {/* Puentes devengado → percibido (§8) */}
            {prep.bridges.length > 0 && (
                <section className="prep-bridges" aria-label="Puentes devengado a percibido">
                    <h4 className="prep-h4">Puentes devengado → percibido</h4>
                    {prep.bridges.map(b => (
                        <div key={b.id} className={`prep-bridge-row ${b.reconciled ? '' : 'is-bad'}`}>
                            <span className="prep-bridge-label">{b.label}</span>
                            <span className="prep-mono">
                                {b.operands.map((o, i) => `${i > 0 ? (o.sign < 0 ? ' − ' : ' + ') : ''}${money(o.amountCents / 100)}`).join('')} = {money(b.resultCents / 100)}
                            </span>
                            {!b.reconciled && <span className="prep-bridge-residual">residual {money(b.residualCents / 100)}</span>}
                        </div>
                    ))}
                </section>
            )}

            {selected && <CellDetail row={selected} imputation={impByAccount.get(selected.accountId)} onClose={() => setSelected(null)} />}
            <style>{preparacionStyles}</style>
        </div>
    )
}
