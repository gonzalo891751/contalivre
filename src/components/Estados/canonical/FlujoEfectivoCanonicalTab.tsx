/**
 * EFE canónico — Fase 2C (§9) / rediseño Fase 2D (§2).
 *
 * Una sola sección con DOS conmutadores independientes:
 *   · Método    → Directo | Indirecto
 *   · Expresión → Moneda nominal | Moneda de cierre
 * Bloques por actividad (operativas/inversión/financiación) con detalle y
 * drilldown de trazabilidad. Consume EXCLUSIVAMENTE el ReportingBundle: no
 * recalcula (solo re-etiqueta el `level` de una línea para poder desplegarla).
 */

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import ValidationBanner from './ValidationBanner'
import LineageModal from './LineageModal'
import { StatementCard, StatementRows } from './StatementView'
import { money, statementStyles } from './statementFormat'
import type { CashFlowStatement2B, ReportLine } from '../../../reporting/domain/types'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'

type Method = 'DIRECT' | 'INDIRECT'
type Currency = 'NOMINAL' | 'CLOSING'

/** Presentación: una línea de total con linaje se muestra como rubro desplegable. */
const asDrillable = (l: ReportLine): ReportLine =>
    l.level === 0 && (l.children?.length ?? 0) === 0 && l.accountIds.length > 0 ? { ...l, level: 1 } : l

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

export default function FlujoEfectivoCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const [method, setMethod] = useState<Method>('DIRECT')
    const [currency, setCurrency] = useState<Currency>('NOMINAL')
    const [target, setTarget] = useState<ReportLine | null>(null)

    const nominalDirect = bundle.statements.cashFlowDirect
    const nominalIndirect = bundle.statements.cashFlowIndirect
    const restated = bundle.cashFlowRestated

    if (!nominalDirect || !nominalIndirect) {
        return <div className="stmt-card" style={{ padding: 16 }}>El EFE no está disponible para este contexto.<style>{statementStyles}</style></div>
    }

    const showClosing = currency === 'CLOSING'
    const set: { direct: CashFlowStatement2B; indirect: CashFlowStatement2B } =
        showClosing && restated ? { direct: restated.direct, indirect: restated.indirect } : { direct: nominalDirect, indirect: nominalIndirect }
    const cf = method === 'DIRECT' ? set.direct : set.indirect

    const activityLines: ReportLine[] = [cf.operating, asDrillable(cf.investing), asDrillable(cf.financing)]
    if (cf.unclassified.amount !== 0) activityLines.push(asDrillable(cf.unclassified))
    activityLines.push(cf.netChange)

    const methodLabel = method === 'DIRECT' ? 'directo' : 'indirecto'
    const netTone = cf.netChange.amount > 0 ? 'pos' : cf.netChange.amount < 0 ? 'neg' : 'neutral'

    return (
        <div>
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

            <StatementCard
                title={`Flujos por actividad — método ${methodLabel}${showClosing ? ' · moneda de cierre' : ''}`}
                accent="green"
                showComparative={false}
            >
                <StatementRows lines={activityLines} showComparative={false} onLineClick={setTarget} />
            </StatementCard>

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

.efe-summary {
    display: flex; align-items: stretch; gap: 10px; margin-bottom: 18px; flex-wrap: wrap;
}
.efe-stat {
    flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 4px;
    background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.efe-stat-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.efe-stat-value {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 1.15rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;
}
.efe-stat-value.is-pos { color: #059669; }
.efe-stat-value.is-neg { color: #dc2626; }
.efe-summary-arrow { color: #cbd5e1; align-self: center; flex-shrink: 0; }
@media (max-width: 640px) { .efe-summary-arrow { transform: rotate(90deg); } }
`
