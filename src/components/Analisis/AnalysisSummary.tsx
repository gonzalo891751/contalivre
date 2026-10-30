/**
 * Resumen del análisis para el inicio: los índices clave de cada situación,
 * con el ejercicio anterior y un acceso al análisis completo (donde está la
 * resolución paso a paso). Reemplaza al tablero de tarjetas.
 */

import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import { useReportingBundle } from '../../hooks/useReportingBundle'
import { Trend } from './MetricRow'
import { formatValue } from './format'
import { METRIC_GUIDE } from './metricGuide'

const KEY_METRICS = ['liquidez-corriente', 'prueba-acida', 'ciclo-conversion', 'endeudamiento', 'roa', 'roe']

export default function AnalysisSummary() {
    const { year } = usePeriodYear()
    const { bundle, loading } = useReportingBundle(year, { withComparative: true })
    if (loading || !bundle) return null
    const metrics = KEY_METRICS.map(id => bundle.metrics.find(m => m.id === id)).filter(m => !!m)
    if (!metrics.some(m => m.result.status === 'CALCULATED')) return null

    return (
        <section className="aec-section aec-home" aria-labelledby="aec-home-title">
            <header className="aec-home-head">
                <div>
                    <h2 id="aec-home-title" className="aec-h2">Análisis de estados contables</h2>
                    <p className="aec-muted">{bundle.metadata.exerciseLabel}{bundle.comparativeStatements ? ' · contra el ejercicio anterior' : ''}</p>
                </div>
                <Link to="/analisis" className="aec-btn aec-btn-ghost">Ver el análisis completo <ArrowRight size={14} aria-hidden /></Link>
            </header>
            <dl className="aec-home-grid">
                {metrics.map(m => (
                    <div key={m.id} className="aec-home-item">
                        <dt>{m.label}</dt>
                        <dd>
                            <span className="aec-home-value">{m.result.status === 'CALCULATED' ? formatValue(m.result.value, m.result.unit) : 'N/D'}</span>
                            <Trend result={m.result} previous={m.previous} guide={METRIC_GUIDE[m.id]} />
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    )
}
