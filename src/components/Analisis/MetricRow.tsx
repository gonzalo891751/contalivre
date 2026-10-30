/**
 * Ficha de un indicador. Plegada: valor, ejercicio anterior y variación.
 * Desplegada: la resolución como en un parcial (fórmula → reemplazo →
 * resultado), de dónde sale cada dato, cómo se lee y las variantes de cátedra.
 * En modo práctica el resultado queda oculto hasta que el alumno lo calcula.
 */

import { useId, useState } from 'react'
import { CaretDown, CheckCircle, XCircle, Lightbulb, WarningCircle, ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react'
import type { MetricCatalogEntry, MetricResult, MetricUnit } from '../../reporting/metrics/types'
import { METRIC_GUIDE, type MetricGuide } from './metricGuide'
import { Formula } from './Formula'
import { formatValue, nf, texNum } from './format'

const STATUS_LABEL: Record<string, string> = {
    NOT_CALCULABLE: 'No calculable',
    NOT_APPLICABLE: 'No aplica',
    INSUFFICIENT_INFORMATION: 'Faltan datos',
}

function deltaText(current: number, previous: number, unit: MetricUnit): string {
    const d = current - previous
    const sign = d > 0 ? '+' : d < 0 ? '−' : ''
    const abs = Math.abs(d)
    switch (unit) {
        case 'percentage': return `${sign}${nf(abs)} p.p.`
        case 'currency': return `${sign}$ ${nf(Math.round(abs), 0)}`
        case 'days': return `${sign}${nf(Math.round(abs), 0)} días`
        default: return `${sign}${nf(abs)}`
    }
}

type Trend = 'up' | 'down' | 'flat'

export function Trend({ result, previous, guide }: { result: MetricResult; previous?: MetricResult | null; guide?: MetricGuide }) {
    if (result.status !== 'CALCULATED' || !previous || previous.status !== 'CALCULATED') {
        return <span className="aec-trend is-none">—</span>
    }
    const d = result.value - previous.value
    const dir: Trend = Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down'
    const tone = dir === 'flat' || !guide?.favorable ? 'neutral' : dir === guide.favorable ? 'good' : 'bad'
    const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
    const title = tone === 'good' ? 'Variación favorable desde el punto de vista financiero'
        : tone === 'bad' ? 'Variación desfavorable desde el punto de vista financiero' : 'Variación'
    return (
        <span className={`aec-trend is-${tone}`} title={title}>
            <Icon size={12} weight="bold" aria-hidden />
            {deltaText(result.value, previous.value, result.unit)}
        </span>
    )
}

/** Reemplazo numérico en TeX a partir de los insumos del motor */
function substitutionTex(entry: MetricCatalogEntry, guide: MetricGuide): string | null {
    const r = entry.result
    if (r.status !== 'CALCULATED') return null
    const ins = r.inputs.map(i => texNum(i.value) + (/\(%\)/.test(i.label) ? '\\%' : ''))
    if (entry.id === 'dupont' && ins.length === 3) return `${ins[0]} \\times ${ins[1]} \\times ${ins[2]}`
    if (guide.shape === 'diff' && ins.length === 2) return `${ins[0]} - ${ins[1]}`
    if (guide.shape === 'sum' && ins.length === 2) return `${ins[0]} + ${ins[1]}`
    if (ins.length !== 2) return null
    let tex = `\\dfrac{${ins[0]}}{${ins[1]}}`
    if (r.unit === 'days' && r.dayCountPolicy) tex += ` \\times ${r.dayCountPolicy}`
    if (r.unit === 'percentage') tex += ' \\times 100'
    return tex
}

function resultTex(r: MetricResult): string {
    if (r.status !== 'CALCULATED') return ''
    const v = texNum(r.value)
    switch (r.unit) {
        case 'percentage': return `${v}\\%`
        case 'days': return `${v}\\ \\text{días}`
        case 'times': return `${v}\\ \\text{veces}`
        case 'currency': return `\\$\\,${v}`
        default: return v
    }
}

function parseAnswer(raw: string): number | null {
    const cleaned = raw.trim().replace(/[%$\s]|días|veces/gi, '')
    if (!cleaned) return null
    // admite 1.234,56 · 1234,56 · 1234.56
    const normalized = /,\d{1,}$/.test(cleaned) ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
}

function PracticeBox({ result, onSolved }: { result: Extract<MetricResult, { status: 'CALCULATED' }>; onSolved: () => void }) {
    const inputId = useId()
    const [answer, setAnswer] = useState('')
    const [verdict, setVerdict] = useState<'ok' | 'ko' | null>(null)
    const check = () => {
        const n = parseAnswer(answer)
        if (n === null) { setVerdict('ko'); return }
        const tolerance = Math.max(Math.abs(result.value) * 0.01, result.unit === 'days' ? 1 : 0.01)
        const ok = Math.abs(n - result.value) <= tolerance
        setVerdict(ok ? 'ok' : 'ko')
        if (ok) onSolved()
    }
    return (
        <div className="aec-practice">
            <label className="aec-practice-label" htmlFor={inputId}>Calculalo vos</label>
            <div className="aec-practice-row">
                <input
                    id={inputId}
                    className="aec-practice-input"
                    inputMode="decimal"
                    placeholder={result.unit === 'percentage' ? 'Ej.: 12,5' : result.unit === 'days' ? 'Ej.: 45' : 'Ej.: 1,35'}
                    value={answer}
                    onChange={e => { setAnswer(e.target.value); setVerdict(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') check() }}
                />
                <button type="button" className="aec-btn" onClick={check}>Verificar</button>
            </div>
            {verdict === 'ok' && <p className="aec-practice-msg is-ok"><CheckCircle size={16} weight="fill" /> ¡Correcto!</p>}
            {verdict === 'ko' && <p className="aec-practice-msg is-ko"><XCircle size={16} weight="fill" /> No coincide. Revisá los datos y la fórmula (se acepta ±1%).</p>}
        </div>
    )
}

export function MetricRow({ entry, practice }: { entry: MetricCatalogEntry; practice: boolean }) {
    const [open, setOpen] = useState(false)
    const [revealed, setRevealed] = useState(false)
    const guide = METRIC_GUIDE[entry.id]
    const r = entry.result
    const hidden = practice && !revealed && r.status === 'CALCULATED'
    const prev = entry.previous
    const sub = guide ? substitutionTex(entry, guide) : null

    return (
        <article className={`aec-metric${open ? ' is-open' : ''}${r.status !== 'CALCULATED' ? ' is-nd' : ''}`} id={`indicador-${entry.id}`}>
            <button type="button" className="aec-metric-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
                <span className="aec-metric-name">{entry.label}</span>
                <span className="aec-metric-value">
                    {r.status === 'CALCULATED'
                        ? (hidden ? <span className="aec-hidden-value">?</span> : formatValue(r.value, r.unit))
                        : <span className="aec-pill">{STATUS_LABEL[r.status]}</span>}
                </span>
                <span className="aec-metric-prev">
                    {prev && prev.status === 'CALCULATED' ? formatValue(prev.value, prev.unit) : '—'}
                </span>
                <span className="aec-metric-trend">{hidden ? <span className="aec-trend is-none">—</span> : <Trend result={r} previous={prev} guide={guide} />}</span>
                <CaretDown size={16} className="aec-caret" aria-hidden />
            </button>

            {open && (
                <div className="aec-metric-body">
                    <ol className="aec-steps">
                        <li>
                            <span className="aec-step-title">Fórmula</span>
                            <div className="aec-step-math">{guide ? <Formula tex={guide.tex} display /> : <code>{r.formula}</code>}</div>
                        </li>
                        {r.status === 'CALCULATED' ? (
                            <>
                                <li>
                                    <span className="aec-step-title">Reemplazo con los datos del ejercicio</span>
                                    <div className="aec-step-math">
                                        {hidden ? <span className="aec-muted">Oculto en modo práctica.</span>
                                            : sub ? <Formula tex={`${sub} = ${resultTex(r)}`} display /> : <code>{r.substitution}</code>}
                                    </div>
                                </li>
                                <li>
                                    <span className="aec-step-title">Lectura</span>
                                    {hidden ? <span className="aec-muted">Calculalo y verificá para ver la lectura.</span>
                                        : <p className="aec-reading">{r.interpretation}</p>}
                                </li>
                            </>
                        ) : (
                            <li>
                                <span className="aec-step-title">Por qué no se calcula</span>
                                <p className="aec-reading">{r.reason}</p>
                            </li>
                        )}
                    </ol>

                    {r.status === 'CALCULATED' && (
                        <div className="aec-data">
                            <h4 className="aec-h4">Datos que usa</h4>
                            <table className="aec-data-table">
                                <tbody>
                                    {r.inputs.map(i => (
                                        <tr key={i.label}>
                                            <th scope="row">{i.label}</th>
                                            <td className="num">{nf(i.value)}</td>
                                            <td className="src">{i.source}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {r.status === 'CALCULATED' && practice && !revealed && (
                        <div className="aec-practice-wrap">
                            <PracticeBox result={r} onSolved={() => setRevealed(true)} />
                            <button type="button" className="aec-link" onClick={() => setRevealed(true)}>Mostrar resolución</button>
                        </div>
                    )}

                    {guide && (
                        <div className="aec-explain">
                            <p><strong>Qué mide.</strong> {guide.concept}</p>
                            <p><strong>Cómo se lee.</strong> {guide.howToRead}</p>
                            {guide.examTip && <p className="aec-tip"><Lightbulb size={16} weight="fill" aria-hidden /> <span><strong>Para el examen.</strong> {guide.examTip}</span></p>}
                            {r.status === 'CALCULATED' && r.reference && (
                                <p className="aec-muted">Referencia: {formatValue(r.reference.value, r.unit === 'percentage' ? 'ratio' : r.unit)} ({r.reference.label}).</p>
                            )}
                        </div>
                    )}

                    {entry.variants && entry.variants.length > 0 && !hidden && (
                        <div className="aec-variants">
                            <h4 className="aec-h4">Otras formas de calcularlo</h4>
                            <table className="aec-data-table">
                                <tbody>
                                    {entry.variants.map(v => (
                                        <tr key={v.label}>
                                            <th scope="row">{v.label}<span className="aec-variant-formula">{v.formula}</span></th>
                                            <td className="num">{v.value === null ? 'No calculable' : formatValue(v.value, v.unit)}</td>
                                            <td className="src">{v.note ?? ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {r.status === 'CALCULATED' && r.warnings.length > 0 && (
                        <ul className="aec-warnings">
                            {r.warnings.map(w => <li key={w}><WarningCircle size={15} aria-hidden /> {w}</li>)}
                        </ul>
                    )}
                </div>
            )}
        </article>
    )
}
