/**
 * Lectura de una serie de índices desde texto delimitado.
 *
 * Función PURA (sin DOM ni base) para que el registro canónico de índices
 * pueda alimentarse desde la interfaz con la misma validación que se prueba
 * en los tests. No redondea: el valor de la fuente entra tal cual, porque el
 * coeficiente de reexpresión de la RT 6 se calcula sobre la serie publicada.
 */

import type { InflationIndexValue } from './types'

export interface ParsedIndexSeries {
    values: InflationIndexValue[]
    /** Filas descartadas, con el motivo, para mostrarlas al usuario */
    rejected: Array<{ line: number; raw: string; reason: string }>
}

const PERIOD_RE = /^(\d{4})-(\d{1,2})$/
const MONTH_NAMES: Record<string, number> = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** Normaliza `2025-1`, `2025/01`, `ene-2025`, `01/2025` → `2025-01` */
export function normalizePeriod(raw: string): string | null {
    const s = raw.trim().replace(/\//g, '-').toLowerCase()
    if (!s) return null

    const iso = PERIOD_RE.exec(s)
    if (iso) {
        const month = Number(iso[2])
        if (month < 1 || month > 12) return null
        return `${iso[1]}-${String(month).padStart(2, '0')}`
    }

    // mm-yyyy
    const mmYyyy = /^(\d{1,2})-(\d{4})$/.exec(s)
    if (mmYyyy) {
        const month = Number(mmYyyy[1])
        if (month < 1 || month > 12) return null
        return `${mmYyyy[2]}-${String(month).padStart(2, '0')}`
    }

    // mmm-yyyy (ene-2025, dic-24)
    const named = /^([a-záéíóú]{3})[a-z]*[-. ]+(\d{2,4})$/.exec(s)
    if (named) {
        const month = MONTH_NAMES[named[1].normalize('NFD').replace(/[̀-ͯ]/g, '')]
        if (!month) return null
        const y = named[2].length === 2 ? `20${named[2]}` : named[2]
        return `${y}-${String(month).padStart(2, '0')}`
    }

    return null
}

/**
 * Convierte el texto de un número al formato de la fuente.
 * Acepta `10121.3715`, `10.121,3715` y `10121,3715`; el separador decimal es
 * el último `,` o `.` que aparezca seguido de 1 a 6 dígitos finales.
 */
export function parseIndexValue(raw: string): number | null {
    const s = raw.trim().replace(/\s/g, '')
    if (!s) return null
    if (!/^[\d.,]+$/.test(s)) return null

    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    const sep = Math.max(lastComma, lastDot)

    let normalized: string
    if (sep === -1) {
        normalized = s
    } else if (s.length - sep - 1 >= 1 && s.length - sep - 1 <= 6 && !/[.,]/.test(s.slice(sep + 1))) {
        normalized = s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1)
    } else {
        normalized = s.replace(/[.,]/g, '')
    }

    const n = Number(normalized)
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Lee `período,valor` por línea. Tolera encabezado, `;` o tabulador como
 * separador y líneas vacías. El último valor de un período gana.
 */
export function parseIndexSeries(text: string): ParsedIndexSeries {
    const byPeriod = new Map<string, number>()
    const rejected: ParsedIndexSeries['rejected'] = []

    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
        const raw = line.trim()
        if (!raw) return
        const cells = raw.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
        if (cells.length < 2) {
            rejected.push({ line: i + 1, raw, reason: 'La fila no tiene dos columnas (período y valor)' })
            return
        }
        const period = normalizePeriod(cells[0])
        if (!period) {
            // Encabezado típico: no se reporta como error
            if (i === 0) return
            rejected.push({ line: i + 1, raw, reason: `Período no reconocido: "${cells[0]}"` })
            return
        }
        const value = parseIndexValue(cells[1])
        if (value === null) {
            rejected.push({ line: i + 1, raw, reason: `Valor no numérico o no positivo: "${cells[1]}"` })
            return
        }
        byPeriod.set(period, value)
    })

    const values = Array.from(byPeriod, ([period, value]) => ({ period, value }))
        .sort((a, b) => a.period.localeCompare(b.period))

    return { values, rejected }
}

/** Meses faltantes dentro de la cobertura declarada (serie con huecos). */
export function missingMonths(values: InflationIndexValue[]): string[] {
    if (values.length < 2) return []
    const present = new Set(values.map(v => v.period))
    const first = values[0].period
    const last = values[values.length - 1].period
    const missing: string[] = []
    let [y, m] = first.split('-').map(Number)
    for (;;) {
        const period = `${y}-${String(m).padStart(2, '0')}`
        if (!present.has(period)) missing.push(period)
        if (period === last) break
        m += 1
        if (m > 12) { m = 1; y += 1 }
        if (y > Number(last.slice(0, 4)) + 1) break
    }
    return missing
}
