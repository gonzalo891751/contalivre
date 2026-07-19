/**
 * IndicatorsDashboard — rediseño Fase 2D (§8): consume EXCLUSIVAMENTE el catálogo
 * canónico de indicadores del ReportingBundle (bundle.metrics). Cada MetricResult
 * ya declara su estado, fórmula, sustitución, interpretación y advertencias, sin
 * heurísticas por nombre, sin ∞/NaN y sin puntaje universal de "salud".
 */

import { useMemo, useState } from 'react'
import { Coins, Landmark, TrendingUp, Activity, Droplets, Info } from 'lucide-react'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import { useReportingBundle } from '../../hooks/useReportingBundle'
import type { MetricCatalogEntry } from '../../reporting/metrics/types'

type Category = 'liquidez' | 'solvencia' | 'rentabilidad' | 'actividad' | 'flujo'

const CATEGORIES: { id: Category; label: string; icon: React.ElementType }[] = [
    { id: 'liquidez', label: 'Liquidez', icon: Droplets },
    { id: 'solvencia', label: 'Solvencia', icon: Landmark },
    { id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
    { id: 'actividad', label: 'Actividad', icon: Activity },
    { id: 'flujo', label: 'Flujo de fondos', icon: Coins },
]

const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 })

function formatMetric(result: MetricCatalogEntry['result']): { value: string; nd: boolean } {
    if (result.status !== 'CALCULATED') return { value: 'N/D', nd: true }
    switch (result.unit) {
        case 'percentage': return { value: `${result.value.toFixed(1)}%`, nd: false }
        case 'currency': return { value: money(result.value), nd: false }
        case 'days': return { value: `${Math.round(result.value)} días`, nd: false }
        case 'times': return { value: `${result.value.toFixed(2)}×`, nd: false }
        default: return { value: result.value.toFixed(2), nd: false }
    }
}

const STATUS_LABEL: Record<string, string> = {
    NOT_CALCULABLE: 'No calculable',
    NOT_APPLICABLE: 'No aplica',
    INSUFFICIENT_INFORMATION: 'Sin datos suficientes',
}

function MetricCard({ entry }: { entry: MetricCatalogEntry }) {
    const r = entry.result
    const { value, nd } = formatMetric(r)
    const reason = r.status !== 'CALCULATED' ? r.reason : null
    const warnings = r.status === 'CALCULATED' ? r.warnings : []
    return (
        <div className={`ind-card${nd ? ' is-nd' : ''}`}>
            <div className="ind-card-head">
                <span className="ind-card-title">{entry.label}</span>
                <span className="ind-tooltip">
                    <Info size={15} aria-hidden />
                    <span className="ind-tooltip-body">
                        <span className="ind-formula">{r.formula}</span>
                        {r.status === 'CALCULATED' && <span className="ind-sub">{r.substitution}</span>}
                        <span className="ind-interp">{r.status === 'CALCULATED' ? r.interpretation : reason}</span>
                    </span>
                </span>
            </div>
            <div className="ind-card-value-row">
                <span className={`ind-value${nd ? ' nd' : ''}`}>{value}</span>
                {nd && <span className="ind-pill nd">{STATUS_LABEL[r.status] ?? 'N/D'}</span>}
            </div>
            {r.status === 'CALCULATED' && r.interpretation && (
                <p className="ind-interp-line">{r.interpretation}</p>
            )}
            {reason && <p className="ind-reason">{reason}</p>}
            {warnings.length > 0 && <p className="ind-warn">⚠ {warnings.join(' · ')}</p>}
        </div>
    )
}

export default function IndicatorsDashboard() {
    const { year } = usePeriodYear()
    const { bundle, loading, error } = useReportingBundle(year, { withComparative: true })
    const [tab, setTab] = useState<Category>('liquidez')

    const byCategory = useMemo(() => {
        const map = new Map<Category, MetricCatalogEntry[]>()
        for (const c of CATEGORIES) map.set(c.id, [])
        for (const m of bundle?.metrics ?? []) map.get(m.category as Category)?.push(m)
        return map
    }, [bundle])

    const active = byCategory.get(tab) ?? []
    const hasAnyCalculated = (bundle?.metrics ?? []).some(m => m.result.status === 'CALCULATED')

    return (
        <div className="ind-root">
            <header className="ind-header">
                <h1 className="ind-title"><span className="ind-gradient">INDICADORES</span></h1>
                <p className="ind-subtitle">Ratios de liquidez, solvencia, rentabilidad, actividad y flujo, derivados del motor canónico.</p>
            </header>

            {loading && <div className="ind-empty">Calculando indicadores…</div>}
            {!loading && error && <div className="ind-empty ind-error">No se pudieron calcular los indicadores: {error}</div>}

            {!loading && !error && bundle && !hasAnyCalculated && (
                <div className="ind-empty">
                    <Info size={30} className="ind-empty-icon" />
                    <h3>Sin datos suficientes</h3>
                    <p>Cargá asientos del ejercicio para activar el tablero de indicadores.</p>
                </div>
            )}

            {!loading && !error && bundle && hasAnyCalculated && (
                <>
                    <div className="ind-tabs" role="tablist" aria-label="Categorías de indicadores">
                        {CATEGORIES.map(c => {
                            const Icon = c.icon
                            const count = byCategory.get(c.id)?.length ?? 0
                            return (
                                <button
                                    key={c.id}
                                    role="tab"
                                    aria-selected={tab === c.id}
                                    className={`ind-tab${tab === c.id ? ' active' : ''}`}
                                    onClick={() => setTab(c.id)}
                                    disabled={count === 0}
                                >
                                    <Icon size={16} />
                                    {c.label}
                                    <span className="ind-tab-badge">{count}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="ind-grid">
                        {active.map(entry => <MetricCard key={entry.id} entry={entry} />)}
                    </div>

                    <p className="ind-disclaimer">
                        La calificación global de “salud financiera” está desactivada: un puntaje universal sin
                        contexto de sector y ciclo económico induce a error. Interpretá cada indicador con su
                        fórmula, su período y sus limitaciones.
                    </p>
                </>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
.ind-root { padding: 8px 0; }
.ind-header { margin-bottom: 18px; }
.ind-title { font-size: 1.6rem; font-weight: 800; margin: 0; letter-spacing: 0.02em; }
.ind-gradient { background: linear-gradient(135deg, #2563EB 0%, #10B981 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.ind-subtitle { font-size: 0.88rem; color: #64748b; margin: 4px 0 0; }

.ind-empty { text-align: center; padding: 48px 24px; color: #64748b; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ind-empty-icon { color: #93c5fd; }
.ind-empty h3 { font-size: 1.05rem; font-weight: 600; color: #334155; margin: 0; }
.ind-error { color: #b91c1c; }

.ind-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: rgba(241,245,249,0.8); border: 1px solid #e2e8f0; border-radius: 12px; width: fit-content; max-width: 100%; margin-bottom: 16px; }
.ind-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; font-size: 0.85rem; font-weight: 600; color: #64748b; background: transparent; border: none; border-radius: 8px; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; }
.ind-tab:hover:not(.active):not(:disabled) { background: rgba(226,232,240,0.6); color: #334155; }
.ind-tab.active { background: white; color: #3B82F6; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.ind-tab:disabled { opacity: 0.45; cursor: not-allowed; }
.ind-tab-badge { font-size: 0.68rem; font-weight: 700; background: rgba(148,163,184,0.2); color: #475569; padding: 1px 7px; border-radius: 9999px; }
.ind-tab.active .ind-tab-badge { background: rgba(59,130,246,0.15); color: #2563eb; }

.ind-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }

.ind-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.ind-card.is-nd { background: #f8fafc; border-style: dashed; }
.ind-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.ind-card-title { font-size: 0.85rem; font-weight: 600; color: #334155; }

.ind-tooltip { position: relative; color: #94a3b8; cursor: help; flex-shrink: 0; display: inline-flex; }
.ind-tooltip-body { position: absolute; right: 0; top: 22px; z-index: 20; width: 230px; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 10px; font-size: 0.74rem; line-height: 1.5; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); }
.ind-tooltip:hover .ind-tooltip-body, .ind-tooltip:focus-within .ind-tooltip-body { opacity: 1; }
.ind-formula { font-family: var(--font-mono, monospace); color: #93c5fd; border-bottom: 1px solid #1e293b; padding-bottom: 4px; }
.ind-sub { font-family: var(--font-mono, monospace); color: #cbd5e1; font-size: 0.7rem; }
.ind-interp { color: #cbd5e1; }

.ind-card-value-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ind-value { font-size: 1.4rem; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
.ind-value.nd { font-size: 1.05rem; color: #94a3b8; }
.ind-pill { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px; }
.ind-pill.nd { background: rgba(148,163,184,0.18); color: #64748b; }

.ind-interp-line { font-size: 0.76rem; color: #64748b; margin: 0; line-height: 1.4; }
.ind-reason { font-size: 0.76rem; color: #94a3b8; margin: 0; line-height: 1.4; }
.ind-warn { font-size: 0.74rem; color: #a16207; margin: 0; line-height: 1.4; }

.ind-disclaimer { font-size: 0.76rem; color: #64748b; margin: 18px 0 0; line-height: 1.6; }
`
