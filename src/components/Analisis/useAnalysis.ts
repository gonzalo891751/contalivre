/**
 * Carga el juego de estados (con comparativo) y recalcula los indicadores con
 * los supuestos que elige el alumno. El cálculo es puro y en memoria: cambiar
 * el IVA o pasar de promedios a saldos de cierre no vuelve a leer la base.
 */

import { useEffect, useMemo, useState } from 'react'
import { useReportingBundle } from '../../hooks/useReportingBundle'
import { attachPreviousMetrics, buildMetricsCatalog } from '../../reporting/metrics/metrics'
import { DEFAULT_METRICS_OPTIONS, type MetricCatalogEntry, type MetricsOptions } from '../../reporting/metrics/types'

const LS_KEY = 'contalivre.analisis.supuestos'

export type AnalysisOptions = Required<Omit<MetricsOptions, 'nonProfit'>>

function readStored(): AnalysisOptions {
    const base: AnalysisOptions = {
        vatRate: DEFAULT_METRICS_OPTIONS.vatRate,
        creditSalesShare: DEFAULT_METRICS_OPTIONS.creditSalesShare,
        creditPurchasesShare: DEFAULT_METRICS_OPTIONS.creditPurchasesShare,
        averaging: DEFAULT_METRICS_OPTIONS.averaging,
        dayCount: DEFAULT_METRICS_OPTIONS.dayCount,
    }
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (!raw) return base
        return { ...base, ...JSON.parse(raw) }
    } catch {
        return base
    }
}

export function useAnalysis(year: number) {
    const { bundle, loading, error } = useReportingBundle(year, { withComparative: true })
    const [options, setOptions] = useState<AnalysisOptions>(readStored)

    useEffect(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify(options)) } catch { /* sin almacenamiento */ }
    }, [options])

    const nonProfit = bundle?.metadata.entityKind === 'SIN_FINES_DE_LUCRO'
    const metrics: MetricCatalogEntry[] = useMemo(() => {
        if (!bundle) return []
        const opts: MetricsOptions = { ...options, nonProfit }
        const current = buildMetricsCatalog(bundle.statements, bundle.accounts, bundle.comparativeStatements, opts)
        const previous = bundle.comparativeStatements
            ? buildMetricsCatalog(bundle.comparativeStatements, bundle.accounts, bundle.comparativePriorStatements, opts)
            : null
        return attachPreviousMetrics(current, previous)
    }, [bundle, options, nonProfit])

    const byId = useMemo(() => new Map(metrics.map(m => [m.id, m])), [metrics])

    return { bundle, loading, error, metrics, byId, options, setOptions, nonProfit }
}
