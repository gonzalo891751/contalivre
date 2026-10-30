/**
 * Análisis de Estados Contables.
 *
 * Pantalla de estudio: los indicadores se organizan como en la materia
 * (situación financiera de corto plazo, plazos y ciclo, situación
 * patrimonial, situación económica y flujo de efectivo), cada uno con su
 * resolución paso a paso, y el análisis vertical/horizontal de los estados.
 * Todo sale del motor único: las mismas cifras que Estados contables.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Exam, Info, ArrowRight, Scales, Hourglass, Buildings, TrendUp, Drop, Table, Compass } from '@phosphor-icons/react'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { useAnalysis, type AnalysisOptions } from '../components/Analisis/useAnalysis'
import { MetricRow, Trend } from '../components/Analisis/MetricRow'
import { formatValue } from '../components/Analisis/format'
import { SECTIONS, METRIC_GUIDE, OPENING_SOURCE_LABEL, type SectionId } from '../components/Analisis/metricGuide'
import { CycleTimeline, LeverageView, StructureChart, VerticalHorizontal } from '../components/Analisis/AnalysisVisuals'
import type { MetricCatalogEntry } from '../reporting/metrics/types'

type View = 'panorama' | SectionId | 'vertical'

const VIEWS: { id: View; label: string; icon: React.ElementType }[] = [
    { id: 'panorama', label: 'Panorama', icon: Compass },
    { id: 'corto-plazo', label: 'Liquidez', icon: Drop },
    { id: 'plazos', label: 'Plazos y ciclo', icon: Hourglass },
    { id: 'estructura', label: 'Estructura', icon: Buildings },
    { id: 'economica', label: 'Rentabilidad', icon: TrendUp },
    { id: 'flujo', label: 'Flujo de efectivo', icon: Scales },
    { id: 'vertical', label: 'Vertical y horizontal', icon: Table },
]

/** Indicadores clave del panorama, por situación */
const PANORAMA: { section: SectionId; ids: string[] }[] = [
    { section: 'corto-plazo', ids: ['liquidez-corriente', 'prueba-acida'] },
    { section: 'plazos', ids: ['ciclo-operativo', 'ciclo-conversion'] },
    { section: 'estructura', ids: ['solvencia', 'endeudamiento'] },
    { section: 'economica', ids: ['roa', 'roe', 'efecto-palanca'] },
    { section: 'flujo', ids: ['cfo-resultado'] },
]

function Assumptions({ options, setOptions, practice, setPractice, openingText }: {
    options: AnalysisOptions
    setOptions: (o: AnalysisOptions) => void
    practice: boolean
    setPractice: (p: boolean) => void
    openingText: string
}) {
    const set = <K extends keyof AnalysisOptions>(k: K, v: AnalysisOptions[K]) => setOptions({ ...options, [k]: v })
    return (
        <section className="aec-assumptions" aria-label="Supuestos del análisis">
            <div className="aec-assumptions-grid">
                <label className="aec-field">
                    <span>IVA para homogeneizar plazos</span>
                    <select value={String(options.vatRate)} onChange={e => set('vatRate', Number(e.target.value))}>
                        <option value="0.21">21% (general)</option>
                        <option value="0.105">10,5% (reducida)</option>
                        <option value="0.27">27% (servicios públicos)</option>
                        <option value="0">Sin IVA</option>
                    </select>
                </label>
                <label className="aec-field">
                    <span>Ventas a crédito</span>
                    <select value={String(options.creditSalesShare)} onChange={e => set('creditSalesShare', Number(e.target.value))}>
                        {[1, 0.9, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25].map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                    </select>
                </label>
                <label className="aec-field">
                    <span>Compras a crédito</span>
                    <select value={String(options.creditPurchasesShare)} onChange={e => set('creditPurchasesShare', Number(e.target.value))}>
                        {[1, 0.9, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25].map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                    </select>
                </label>
                <label className="aec-field">
                    <span>Saldos para rotaciones y rentabilidad</span>
                    <select value={options.averaging} onChange={e => set('averaging', e.target.value as AnalysisOptions['averaging'])}>
                        <option value="PROMEDIO">Promedio (inicio + cierre) / 2</option>
                        <option value="CIERRE">Saldos de cierre</option>
                    </select>
                </label>
                <label className="aec-field">
                    <span>Año</span>
                    <select value={String(options.dayCount)} onChange={e => set('dayCount', Number(e.target.value))}>
                        <option value="365">365 días</option>
                        <option value="360">360 días (comercial)</option>
                    </select>
                </label>
            </div>
            <div className="aec-assumptions-foot">
                <label className="aec-switch aec-switch-practice">
                    <input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} />
                    <span><Exam size={16} weight="duotone" aria-hidden /> Modo práctica: ocultar resultados</span>
                </label>
                <p className="aec-muted aec-opening"><Info size={14} aria-hidden /> Saldos de inicio: {openingText}.</p>
            </div>
        </section>
    )
}

function SectionView({ section, byId, practice, visual }: {
    section: (typeof SECTIONS)[number]
    byId: Map<string, MetricCatalogEntry>
    practice: boolean
    visual?: React.ReactNode
}) {
    const entries = section.metrics.map(id => byId.get(id)).filter((e): e is MetricCatalogEntry => !!e)
    return (
        <section className="aec-section" aria-labelledby={`sec-${section.id}`}>
            <header className="aec-section-head">
                <h2 id={`sec-${section.id}`} className="aec-h2">{section.title}</h2>
                <p className="aec-question">{section.question}</p>
                <p className="aec-intro">{section.intro}</p>
            </header>
            {visual}
            <div className="aec-list" role="list">
                <div className="aec-list-head" aria-hidden>
                    <span>Indicador</span><span>Actual</span><span>Anterior</span><span>Variación</span><span />
                </div>
                {entries.map(e => <MetricRow key={e.id} entry={e} practice={practice} />)}
            </div>
        </section>
    )
}

function Panorama({ byId, onOpen }: { byId: Map<string, MetricCatalogEntry>; onOpen: (v: View) => void }) {
    return (
        <div className="aec-panorama">
            <table className="aec-summary">
                <thead>
                    <tr>
                        <th scope="col">Situación</th>
                        <th scope="col">Indicador</th>
                        <th scope="col" className="num">Actual</th>
                        <th scope="col" className="num">Anterior</th>
                        <th scope="col" className="num">Variación</th>
                    </tr>
                </thead>
                <tbody>
                    {PANORAMA.map(group => {
                        const section = SECTIONS.find(s => s.id === group.section)!
                        const rows = group.ids.map(id => byId.get(id)).filter((e): e is MetricCatalogEntry => !!e)
                        return rows.map((e, i) => (
                            <tr key={e.id}>
                                {i === 0 && (
                                    <th scope="rowgroup" rowSpan={rows.length} className="aec-summary-group">
                                        <button type="button" className="aec-link" onClick={() => onOpen(group.section)}>
                                            {section.title} <ArrowRight size={12} aria-hidden />
                                        </button>
                                        <span className="aec-muted">{section.question}</span>
                                    </th>
                                )}
                                <td>{e.label}</td>
                                <td className="num strong">{e.result.status === 'CALCULATED' ? formatValue(e.result.value, e.result.unit) : 'N/D'}</td>
                                <td className="num">{e.previous?.status === 'CALCULATED' ? formatValue(e.previous.value, e.previous.unit) : '—'}</td>
                                <td className="num"><Trend result={e.result} previous={e.previous} guide={METRIC_GUIDE[e.id]} /></td>
                            </tr>
                        ))
                    })}
                </tbody>
            </table>
            <p className="aec-muted">
                Las flechas verdes o ámbar indican si la variación es favorable o desfavorable <em>desde el punto de vista
                financiero</em>; las grises, que depende del contexto. Ningún índice se interpreta solo: combiná liquidez con
                plazos, y endeudamiento con rentabilidad.
            </p>
        </div>
    )
}

export default function AnalisisPage() {
    const { year } = usePeriodYear()
    const { bundle, loading, error, metrics, byId, options, setOptions, nonProfit } = useAnalysis(year)
    const [params, setParams] = useSearchParams()
    const [practice, setPractice] = useState(false)
    const view = (VIEWS.some(v => v.id === params.get('vista')) ? params.get('vista') : 'panorama') as View
    const setView = (v: View) => setParams(p => { p.set('vista', v); return p }, { replace: true })

    const hasData = useMemo(() => {
        if (!bundle) return false
        return bundle.statements.trialBalance.rows.some(r => r.closing !== 0 || r.periodDebit !== 0)
    }, [bundle])

    const openingText = bundle
        ? (bundle.comparativeStatements ? 'cierre del ejercicio anterior (comparativo)' : OPENING_SOURCE_LABEL[bundle.statements.openingSource ?? 'NONE'])
        : ''

    const section = SECTIONS.find(s => s.id === view)
    const visibleSection = section && nonProfit && section.id === 'economica'
        ? { ...section, title: 'Situación económica (recursos y gastos)', question: '¿Los recursos alcanzan para sostener las actividades?', intro: 'En un ente sin fines de lucro el objetivo no es ganar: se analiza si los recursos cubren los gastos y cómo se componen. La rentabilidad del patrimonio y el efecto palanca no tienen la lectura habitual.' }
        : section

    return (
        <div className="aec-root">
            <header className="aec-header">
                <div>
                    <p className="aec-eyebrow">Análisis de estados contables</p>
                    <h1 className="aec-title">{bundle?.metadata.companyLegalName ?? 'Análisis'}</h1>
                    <p className="aec-subtitle">
                        {bundle ? `${bundle.metadata.exerciseLabel}` : `Ejercicio ${year}`}
                        {bundle && (bundle.comparativeStatements ? ' · comparado con el ejercicio anterior' : ' · sin ejercicio anterior para comparar')}
                        {nonProfit && ' · ente sin fines de lucro'}
                    </p>
                </div>
                <Link to="/estados" className="aec-btn aec-btn-ghost">Ver los estados <ArrowRight size={14} aria-hidden /></Link>
            </header>

            {loading && <div className="aec-empty">Calculando el análisis…</div>}
            {!loading && error && <div className="aec-empty aec-error">No se pudo calcular el análisis: {error}</div>}
            {!loading && !error && bundle && !hasData && (
                <div className="aec-empty">
                    <h2 className="aec-h2">Todavía no hay datos en {bundle.metadata.exerciseLabel}</h2>
                    <p>Registrá los asientos del ejercicio (o cargá el asiento de apertura) y volvé: el análisis se arma solo a partir de los estados contables.</p>
                    <p>¿Querés practicar con datos ya cargados? Creá una <Link to="/empresas">empresa de práctica con un caso de ejemplo</Link>.</p>
                </div>
            )}

            {!loading && !error && bundle && hasData && (
                <>
                    <Assumptions options={options} setOptions={setOptions} practice={practice} setPractice={setPractice} openingText={openingText} />

                    <nav className="aec-tabs" role="tablist" aria-label="Partes del análisis">
                        {VIEWS.map(v => {
                            const Icon = v.icon
                            return (
                                <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
                                    className={`aec-tab${view === v.id ? ' is-active' : ''}`} onClick={() => setView(v.id)}>
                                    <Icon size={16} weight={view === v.id ? 'fill' : 'regular'} aria-hidden /> {v.label}
                                </button>
                            )
                        })}
                    </nav>

                    {view === 'panorama' && (
                        <>
                            <section className="aec-section">
                                <header className="aec-section-head">
                                    <h2 className="aec-h2">Estructura patrimonial</h2>
                                    <p className="aec-intro">Antes de calcular índices, mirá la foto: de qué está hecho el activo y quién lo financia.</p>
                                </header>
                                <StructureChart bundle={bundle} />
                            </section>
                            <section className="aec-section">
                                <header className="aec-section-head">
                                    <h2 className="aec-h2">Diagnóstico rápido</h2>
                                    <p className="aec-intro">Los índices clave de cada situación. Entrá a cada parte para ver la resolución paso a paso.</p>
                                </header>
                                <Panorama byId={byId} onOpen={setView} />
                            </section>
                        </>
                    )}

                    {visibleSection && (
                        <SectionView
                            section={visibleSection}
                            byId={byId}
                            practice={practice}
                            visual={visibleSection.id === 'plazos' ? <CycleTimeline byId={byId} />
                                : visibleSection.id === 'economica' && !nonProfit ? <LeverageView byId={byId} /> : undefined}
                        />
                    )}

                    {view === 'vertical' && (
                        <section className="aec-section">
                            <header className="aec-section-head">
                                <h2 className="aec-h2">Análisis vertical y horizontal</h2>
                                <p className="aec-intro">
                                    El vertical muestra la composición (cada rubro como porcentaje del total); el horizontal, la evolución
                                    (cuánto cambió cada rubro contra el ejercicio anterior). Juntos responden qué cambió y cuánto pesa.
                                </p>
                            </header>
                            <VerticalHorizontal bundle={bundle} />
                        </section>
                    )}

                    <p className="aec-footnote">
                        {metrics.filter(m => m.result.status === 'CALCULATED').length} de {metrics.length} indicadores calculados con
                        las cifras de los estados contables del ejercicio. No hay un puntaje único de "salud": cada índice se lee con
                        su fórmula, su período y en conjunto con los demás.
                    </p>
                </>
            )}
        </div>
    )
}
