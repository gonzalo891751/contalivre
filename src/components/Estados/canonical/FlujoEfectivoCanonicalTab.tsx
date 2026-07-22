/**
 * EFE canónico — Fase 2C (§9) / Fase 2D (§2) / Fase 2E (§7): vista pedagógica.
 *
 * Conmutadores: Método (Directo|Indirecto), Expresión (Nominal|Cierre) y
 * Modo (Resumen|Detalle). Cabecera con inicial → variación → final más la
 * ecuación visual por actividad. Cada actividad es una tarjeta desplegable
 * con participación, filas internas (subcategorías estructurales o ajustes
 * explicados del indirecto) y drilldown de trazabilidad.
 *
 * Consume EXCLUSIVAMENTE el ReportingBundle: no recalcula ni consulta Dexie;
 * los textos explicativos son presentación pedagógica, no cifras.
 */

import { useState } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'
import ValidationBanner from './ValidationBanner'
import LineageModal from './LineageModal'
import PreparacionEfe from './PreparacionEfe'
import { money, statementStyles } from './statementFormat'
import type { CashFlowStatement2B, ReportLine } from '../../../reporting/domain/types'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'

type Method = 'DIRECT' | 'INDIRECT'
type Currency = 'NOMINAL' | 'CLOSING'
type Detail = 'SUMMARY' | 'DETAIL'
type View = 'EXPOSICION' | 'PREPARACION'

/** Por qué cada ajuste del método indirecto se suma o se resta (§7.3) */
const INDIRECT_HINTS: Record<string, string> = {
    'efe:ind:resultado': 'Punto de partida: el resultado devengado del ejercicio, que incluye partidas que no movieron efectivo.',
    'efe:ind:ajustes': 'Se suman (o restan) las partidas devengadas sin efecto en el efectivo. Ejemplo: la depreciación redujo el resultado, pero no produjo una salida de efectivo, por eso se suma.',
    'efe:ind:wc-activos': 'Un aumento de créditos, inventarios u otros activos operativos inmoviliza efectivo (se resta); una disminución lo libera (se suma).',
    'efe:ind:wc-pasivos': 'Un aumento de proveedores y otras deudas operativas financia el ciclo sin usar efectivo (se suma); una disminución lo consume (se resta).',
    'efe:ind:sin-clasificar': 'Flujos de cuentas sin categoría EFE: regularizá el mapping en Configuración.',
    'efe-mc:ind:resultado': 'Punto de partida: el resultado devengado del ejercicio, reexpresado a moneda de cierre.',
    'efe-mc:ind:ajustes': 'Partidas devengadas sin efecto en el efectivo, reexpresadas por el coeficiente de su período.',
    'efe-mc:ind:wca': 'Variación de activos operativos reexpresada: un aumento resta, una disminución suma.',
    'efe-mc:ind:wcl': 'Variación de pasivos operativos reexpresada: un aumento suma, una disminución resta.',
}

const ACTIVITY_HINTS: Record<string, string> = {
    operativas: 'Flujos del ciclo principal del negocio: cobros a clientes y pagos a proveedores, personal e impuestos.',
    inversion: 'Compras y ventas de bienes de uso, intangibles e inversiones: cómo la empresa aplica efectivo a su estructura.',
    financiacion: 'Aportes y retiros de los propietarios, préstamos recibidos y su cancelación: cómo se financia la empresa.',
}

function Segmented<T extends string>({ label, value, options, onChange }: {
    label: string
    value: T
    options: { value: T; label: string; disabled?: boolean; title?: string }[]
    onChange: (v: T) => void
}) {
    return (
        <div className="efe-segmented" role="group" aria-label={label}>
            <span className="efe-segmented-label">{label}</span>
            <div className="efe-segmented-track">
                {options.map(o => (
                    <button
                        key={o.value}
                        type="button"
                        className={`efe-segmented-btn${value === o.value ? ' active' : ''}`}
                        aria-pressed={value === o.value}
                        disabled={o.disabled}
                        title={o.title}
                        onClick={() => onChange(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

function StatCell({ label, value, tone }: { label: string; value: number; tone?: 'pos' | 'neg' | 'neutral' }) {
    const cls = tone === 'pos' ? 'is-pos' : tone === 'neg' ? 'is-neg' : ''
    return (
        <div className="efe-stat">
            <span className="efe-stat-label">{label}</span>
            <span className={`efe-stat-value ${cls}`}>{money(value)}</span>
        </div>
    )
}

/** Fila interna de una actividad, con hasta un nivel más de detalle por cuenta */
function FlowRow({ line, detail, hint, onLineage, depth = 0 }: {
    line: ReportLine
    detail: Detail
    hint?: string
    onLineage: (l: ReportLine) => void
    depth?: number
}) {
    const [open, setOpen] = useState(false)
    const children = detail === 'DETAIL' ? (line.children ?? []) : []
    const hasChildren = children.length > 0
    const clickable = line.accountIds.length > 0

    return (
        <>
            <div
                className={`efe-row${hasChildren || clickable ? ' is-interactive' : ''}`}
                style={{ paddingLeft: 12 + depth * 18 }}
                role={hasChildren || clickable ? 'button' : undefined}
                tabIndex={hasChildren || clickable ? 0 : undefined}
                aria-expanded={hasChildren ? open : undefined}
                onClick={() => { if (hasChildren) setOpen(o => !o); else if (clickable) onLineage(line) }}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (hasChildren) setOpen(o => !o); else if (clickable) onLineage(line)
                    }
                }}
                title={clickable && !hasChildren ? 'Ver trazabilidad hasta los asientos' : undefined}
            >
                <span className="efe-row-label">
                    {hasChildren
                        ? <ChevronRight size={13} strokeWidth={2.5} className={`efe-row-caret${open ? ' is-open' : ''}`} aria-hidden />
                        : <span className="efe-row-spacer" aria-hidden />}
                    {line.label}
                </span>
                <span className={`efe-row-amount${line.amount < 0 ? ' is-neg' : ''}`}>{money(line.amount)}</span>
            </div>
            {hint && detail === 'DETAIL' && (
                <p className="efe-row-hint" style={{ marginLeft: 12 + depth * 18 + 20 }}>{hint}</p>
            )}
            {open && children.map(c => (
                <FlowRow key={c.id} line={c} detail={detail} onLineage={onLineage} depth={depth + 1} />
            ))}
        </>
    )
}

/** Tarjeta desplegable por actividad (§7.4) */
function ActivityCard({ line, share, hint, detail, onLineage, defaultOpen }: {
    line: ReportLine
    share: number | null
    hint?: string
    detail: Detail
    onLineage: (l: ReportLine) => void
    defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen ?? false)
    const rows = line.children ?? []
    const hasRows = rows.length > 0
    const bodyId = `efe-card-body-${line.id.replace(/[^a-z0-9-]/gi, '-')}`

    return (
        <section className="efe-card">
            <button
                type="button"
                className="efe-card-head"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen(o => !o)}
                title={hint}
            >
                <span className="efe-card-title">
                    <ChevronRight size={15} strokeWidth={2.5} className={`efe-row-caret${open ? ' is-open' : ''}`} aria-hidden />
                    {line.label}
                </span>
                <span className="efe-card-meta">
                    {share != null && <span className="efe-card-share">{share.toFixed(1)}% de la variación</span>}
                    <span className={`efe-card-amount${line.amount < 0 ? ' is-neg' : line.amount > 0 ? ' is-pos' : ''}`}>{money(line.amount)}</span>
                </span>
            </button>
            {open && (
                <div className="efe-card-body" id={bodyId}>
                    {hint && <p className="efe-card-hint">{hint}</p>}
                    {hasRows
                        ? rows.map(r => (
                            <FlowRow key={r.id} line={r} detail={detail} hint={INDIRECT_HINTS[r.id]} onLineage={onLineage} />
                        ))
                        : (
                            <FlowRow
                                line={{ ...line, label: 'Ver composición y trazabilidad', level: 2 }}
                                detail={detail}
                                onLineage={onLineage}
                            />
                        )}
                </div>
            )}
        </section>
    )
}

export default function FlujoEfectivoCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const [view, setView] = useState<View>('EXPOSICION')
    const [method, setMethod] = useState<Method>('DIRECT')
    const [currency, setCurrency] = useState<Currency>('NOMINAL')
    const [detail, setDetail] = useState<Detail>('DETAIL')
    const [target, setTarget] = useState<ReportLine | null>(null)

    const nominalDirect = bundle.statements.cashFlowDirect
    const nominalIndirect = bundle.statements.cashFlowIndirect
    const restated = bundle.cashFlowRestated

    if (!nominalDirect || !nominalIndirect) {
        return <div className="stmt-card" style={{ padding: 16 }}>El EFE no está disponible para este contexto.<style>{statementStyles}</style></div>
    }

    const viewSwitch = (
        <div className="efe-toolbar" style={{ marginBottom: 12 }}>
            <Segmented<View>
                label="Vista"
                value={view}
                onChange={setView}
                options={[{ value: 'EXPOSICION', label: 'Exposición' }, { value: 'PREPARACION', label: 'Preparación' }]}
            />
        </div>
    )

    if (view === 'PREPARACION') {
        return (
            <div>
                {viewSwitch}
                <PreparacionEfe bundle={bundle} />
                <style>{statementStyles}</style>
            </div>
        )
    }

    const showClosing = currency === 'CLOSING'
    const set: { direct: CashFlowStatement2B; indirect: CashFlowStatement2B } =
        showClosing && restated ? { direct: restated.direct, indirect: restated.indirect } : { direct: nominalDirect, indirect: nominalIndirect }
    const cf = method === 'DIRECT' ? set.direct : set.indirect

    const methodLabel = method === 'DIRECT' ? 'directo' : 'indirecto'
    const netTone = cf.netChange.amount > 0 ? 'pos' : cf.netChange.amount < 0 ? 'neg' : 'neutral'

    // REI en moneda de cierre (línea de conciliación, no un flujo)
    const rei = showClosing ? cf.nonMonetaryDisclosures.find(d => d.id === 'efe-mc:rei') : undefined

    const share = (amount: number): number | null =>
        cf.netChange.amount === 0 ? null : (amount / Math.abs(cf.netChange.amount)) * 100

    const activities: { line: ReportLine; hint?: string }[] = [
        { line: cf.operating, hint: ACTIVITY_HINTS.operativas },
        { line: cf.investing, hint: ACTIVITY_HINTS.inversion },
        { line: cf.financing, hint: ACTIVITY_HINTS.financiacion },
    ]
    if (cf.unclassified.amount !== 0) activities.push({ line: cf.unclassified })

    return (
        <div>
            {viewSwitch}
            <div className="efe-toolbar">
                <Segmented<Method>
                    label="Método"
                    value={method}
                    onChange={setMethod}
                    options={[{ value: 'DIRECT', label: 'Directo' }, { value: 'INDIRECT', label: 'Indirecto' }]}
                />
                <Segmented<Currency>
                    label="Expresión"
                    value={currency}
                    onChange={setCurrency}
                    options={[
                        { value: 'NOMINAL', label: 'Moneda nominal' },
                        { value: 'CLOSING', label: 'Moneda de cierre', disabled: !restated, title: !restated ? 'Cargá un set de índices en el módulo de inflación para ver el EFE en moneda de cierre' : undefined },
                    ]}
                />
                <Segmented<Detail>
                    label="Modo"
                    value={detail}
                    onChange={setDetail}
                    options={[{ value: 'SUMMARY', label: 'Resumen' }, { value: 'DETAIL', label: 'Detalle' }]}
                />
            </div>

            {showClosing && (
                <p className="efe-hint">Reexpresado por el coeficiente de cada período; el REI concilia con el efectivo del ESP.</p>
            )}

            {showClosing && restated && restated.blockers.length > 0 && (
                <div role="alert" className="efe-alert">
                    ⚠ EFE en moneda de cierre no publicable: {restated.blockers.join(' · ')}
                </div>
            )}

            {!showClosing && <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />}

            <div className="efe-summary">
                <StatCell label="Efectivo al inicio" value={cf.openingCash.amount} />
                <ArrowRight size={18} className="efe-summary-arrow" aria-hidden />
                <StatCell label="Variación neta" value={cf.netChange.amount} tone={netTone} />
                <ArrowRight size={18} className="efe-summary-arrow" aria-hidden />
                <StatCell label="Efectivo al cierre" value={cf.closingCash.amount} />
            </div>

            {/* Ecuación visual (§7.1) */}
            <div className="efe-equation" aria-label="Composición de la variación neta">
                <span className="efe-eq-item"><span className="efe-eq-label">Operativo</span><span className="efe-eq-value">{money(cf.operating.amount)}</span></span>
                <span className="efe-eq-op">+</span>
                <span className="efe-eq-item"><span className="efe-eq-label">Inversión</span><span className="efe-eq-value">{money(cf.investing.amount)}</span></span>
                <span className="efe-eq-op">+</span>
                <span className="efe-eq-item"><span className="efe-eq-label">Financiación</span><span className="efe-eq-value">{money(cf.financing.amount)}</span></span>
                {cf.unclassified.amount !== 0 && (
                    <>
                        <span className="efe-eq-op">+</span>
                        <span className="efe-eq-item is-warn"><span className="efe-eq-label">Sin clasificar</span><span className="efe-eq-value">{money(cf.unclassified.amount)}</span></span>
                    </>
                )}
                {rei && (
                    <>
                        <span className="efe-eq-op">+</span>
                        <span className="efe-eq-item"><span className="efe-eq-label">Reexpresión (REI)</span><span className="efe-eq-value">{money(rei.amount)}</span></span>
                    </>
                )}
                <span className="efe-eq-op">=</span>
                <span className="efe-eq-item is-total"><span className="efe-eq-label">Variación neta</span><span className="efe-eq-value">{money(cf.netChange.amount)}</span></span>
            </div>

            <h2 className="efe-section-title">Flujos por actividad — método {methodLabel}{showClosing ? ' · moneda de cierre' : ''}</h2>

            {activities.map(({ line, hint }) => (
                <ActivityCard
                    key={line.id}
                    line={line}
                    share={share(line.amount)}
                    hint={hint}
                    detail={detail}
                    onLineage={setTarget}
                    defaultOpen={detail === 'DETAIL' && line.id === cf.operating.id}
                />
            ))}

            {cf.nonMonetaryDisclosures.length > 0 && (
                <div className="stmt-card">
                    <header className="stmt-card-header">
                        <h3 className="stmt-card-title" style={{ fontSize: '1rem' }}>
                            {showClosing ? 'Conciliación de moneda de cierre' : 'Transacciones sin efecto en el efectivo'}
                        </h3>
                    </header>
                    <div className="stmt-card-body" style={{ padding: 16 }}>
                        {!showClosing && <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 8px' }}>Se revelan pero no integran los flujos.</p>}
                        <ul style={{ fontSize: '0.85rem', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
                            {cf.nonMonetaryDisclosures.map(d => (
                                <li key={d.id}>{d.label} — {money(d.amount)}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {target && (
                <LineageModal
                    bundle={bundle.statements}
                    lineId={target.id}
                    label={target.label}
                    accountIds={target.accountIds}
                    onClose={() => setTarget(null)}
                />
            )}

            <style>{statementStyles}{efeStyles}</style>
        </div>
    )
}

const efeStyles = `
.efe-toolbar { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 14px; }
.efe-segmented { display: flex; flex-direction: column; gap: 5px; }
.efe-segmented-label { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
.efe-segmented-track { display: inline-flex; padding: 3px; gap: 3px; background: rgba(241,245,249,0.9); border: 1px solid #e2e8f0; border-radius: 10px; width: fit-content; }
.efe-segmented-btn {
    padding: 7px 16px; font-size: 0.84rem; font-weight: 600; color: #64748b;
    background: transparent; border: none; border-radius: 7px; cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.efe-segmented-btn:hover:not(.active):not(:disabled) { color: #334155; background: rgba(226,232,240,0.6); }
.efe-segmented-btn.active { background: white; color: #3B82F6; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.efe-segmented-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.efe-segmented-btn:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }

.efe-hint { font-size: 0.78rem; color: #a16207; margin: 0 0 10px; }
.efe-alert { margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.4); color: #b91c1c; font-size: 0.85rem; font-weight: 600; }

.efe-summary { display: flex; align-items: stretch; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.efe-stat {
    flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 4px;
    background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.efe-stat-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.efe-stat-value { font-size: 1.15rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.efe-stat-value.is-pos { color: #059669; }
.efe-stat-value.is-neg { color: #dc2626; }
.efe-summary-arrow { color: #cbd5e1; align-self: center; flex-shrink: 0; }
@media (max-width: 640px) { .efe-summary-arrow { transform: rotate(90deg); } }

.efe-equation {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
    background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.25); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 18px; font-size: 0.84rem;
}
.efe-eq-item { display: flex; flex-direction: column; }
.efe-eq-item.is-total { border-left: 2px solid rgba(16,185,129,0.4); padding-left: 12px; }
.efe-eq-item.is-warn .efe-eq-label { color: #b45309; }
.efe-eq-label { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.efe-eq-value { font-variant-numeric: tabular-nums; font-weight: 700; color: #0f172a; }
.efe-eq-op { color: #94a3b8; font-weight: 700; }

.efe-section-title { font-size: 1.02rem; font-weight: 700; color: #0f172a; margin: 0 0 10px; }

.efe-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); overflow: hidden; }
.efe-card-head {
    display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%;
    padding: 13px 16px; background: transparent; border: none; cursor: pointer; text-align: left;
}
.efe-card-head:hover { background: #f8fafc; }
.efe-card-head:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.efe-card-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; font-size: 0.92rem; }
.efe-card-meta { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.efe-card-share { font-size: 0.7rem; color: #64748b; font-variant-numeric: tabular-nums; }
.efe-card-amount { font-weight: 700; font-variant-numeric: tabular-nums; color: #0f172a; }
.efe-card-amount.is-pos { color: #059669; }
.efe-card-amount.is-neg { color: #dc2626; }
.efe-card-body { border-top: 1px solid #f1f5f9; padding: 8px 10px 12px; }
.efe-card-hint { font-size: 0.76rem; color: #64748b; margin: 4px 6px 8px; line-height: 1.45; }

.efe-row {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 7px 12px; border-radius: 7px; font-size: 0.86rem;
}
.efe-row.is-interactive { cursor: pointer; }
.efe-row.is-interactive:hover { background: #f8fafc; }
.efe-row.is-interactive:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.efe-row-label { display: flex; align-items: center; gap: 6px; color: #334155; min-width: 0; }
.efe-row-caret { color: #3B82F6; transition: transform 0.15s ease; flex-shrink: 0; }
.efe-row-caret.is-open { transform: rotate(90deg); }
.efe-row-spacer { display: inline-block; width: 13px; flex-shrink: 0; }
.efe-row-amount { font-variant-numeric: tabular-nums; font-weight: 600; color: #0f172a; white-space: nowrap; }
.efe-row-amount.is-neg { color: #dc2626; }
.efe-row-hint { font-size: 0.72rem; color: #94a3b8; margin: 0 12px 6px; line-height: 1.4; }

@media (prefers-reduced-motion: reduce) {
    .efe-row-caret, .efe-segmented-btn { transition: none; }
}
`
