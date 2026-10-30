/** Formatos del Análisis de Estados Contables (es-AR). */

import type { MetricUnit } from '../../reporting/metrics/types'

export const nf = (n: number, digits = 2) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: digits })

export function formatValue(value: number, unit: MetricUnit): string {
    switch (unit) {
        case 'percentage': return `${nf(value)} %`
        case 'currency': return `${value < 0 ? '−' : ''}$ ${nf(Math.abs(Math.round(value)), 0)}`
        case 'days': return `${nf(Math.round(value), 0)} días`
        case 'times': return `${nf(value)} veces`
        default: return nf(value)
    }
}

/** Número en formato argentino apto para TeX (coma decimal sin espacio extra) */
export function texNum(n: number): string {
    const s = n.toLocaleString('es-AR', { maximumFractionDigits: 2 }).replace(/,/g, '{,}')
    return n < 0 ? `(${s})` : s
}
