/**
 * useReportingBundle — Fase 2D (§8): hook de carga del ReportingBundle canónico
 * para pantallas que necesitan cifras derivadas del motor (indicadores, hub de
 * operaciones). Una sola fuente: nadie recalcula estados por su cuenta.
 */

import { useEffect, useState } from 'react'
import { loadReportingBundle, type ReportingBundle, type LoadReportingBundleOptions } from '../reporting/loadReportingBundle'

export interface UseReportingBundleResult {
    bundle: ReportingBundle | null
    loading: boolean
    error: string | null
}

export function useReportingBundle(year: number, options?: LoadReportingBundleOptions): UseReportingBundleResult {
    const [bundle, setBundle] = useState<ReportingBundle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const withComparative = options?.withComparative ?? false

    useEffect(() => {
        let cancelled = false
        setLoading(true); setError(null)
        loadReportingBundle(year, { withComparative })
            .then(b => { if (!cancelled) { setBundle(b); setLoading(false) } })
            .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
        return () => { cancelled = true }
    }, [year, withComparative])

    return { bundle, loading, error }
}
