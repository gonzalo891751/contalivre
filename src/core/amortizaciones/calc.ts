/**
 * Amortizaciones - Calculation Functions
 * 
 * Pure functions for calculating depreciation values.
 * All calculations follow Argentine accounting standards.
 */

import type {
    AmortizationAsset,
    AmortizationParams,
    CalculatedValues,
    AmortizationRow,
    AmortizationTotals,
    EstadoBien,
} from './types'

// Small tolerance for floating point comparisons
const EPSILON = 0.01

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/**
 * Parse a date string to Date object
 */
export function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
}

/**
 * Get the start of fiscal year from close date
 */
export function getFiscalYearStart(fechaCierre: string): Date {
    const closeDate = parseDate(fechaCierre)
    if (!closeDate) {
        const now = new Date()
        return new Date(now.getFullYear(), 0, 1)
    }
    return new Date(closeDate.getFullYear(), 0, 1)
}

/**
 * Calculate months between two dates (complete months)
 */
export function calculateMonthsBetween(from: Date, to: Date): number {
    if (from >= to) return 0

    const yearDiff = to.getFullYear() - from.getFullYear()
    const monthDiff = to.getMonth() - from.getMonth()
    let months = yearDiff * 12 + monthDiff

    // If the day in 'from' is greater than 'to', subtract one month
    if (from.getDate() > to.getDate()) {
        months--
    }

    return Math.max(0, months)
}

/**
 * Calculate months in fiscal year for a given asset
 */
export function calculateMonthsInFiscalYear(
    fechaAlta: Date,
    fyStart: Date,
    fyEnd: Date
): number {
    // If asset was acquired after fiscal year end, 0 months
    if (fechaAlta > fyEnd) return 0

    // Start date for calculation is the later of fechaAlta or fyStart
    const startDate = fechaAlta > fyStart ? fechaAlta : fyStart

    // Calculate months from startDate to fyEnd (inclusive)
    return calculateMonthsBetween(startDate, fyEnd) + 1
}

/**
 * Calculate annual depreciation amount
 */
export function calculateAnnualDepreciation(
    valorAmortizable: number,
    vidaUtilValor: number | null,
    vidaUtilTipo: 'AÑOS' | 'PORCENTAJE_ANUAL'
): number {
    if (!vidaUtilValor || vidaUtilValor <= 0) return 0

    if (vidaUtilTipo === 'AÑOS') {
        return valorAmortizable / vidaUtilValor
    } else {
        // PORCENTAJE_ANUAL
        return valorAmortizable * (vidaUtilValor / 100)
    }
}

/**
 * Main calculation function for a single asset
 */
export function calculateAmortization(
    asset: AmortizationAsset,
    params: AmortizationParams
): CalculatedValues {
    // Case 1: No amortiza (e.g., Terreno)
    if (asset.noAmortiza) {
        return {
            valorResidual: asset.valorOrigen !== null ? asset.valorOrigen * (asset.residualPct / 100) : null,
            valorAmortizable: asset.valorOrigen !== null ? asset.valorOrigen * (asset.amortizablePct / 100) : null,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            vrContable: asset.valorOrigen,
            estado: 'NO_AMORTIZA',
        }
    }

    // Check if we have the required values
    const C = asset.valorOrigen
    if (C === null || C <= 0) {
        return createEmptyCalculated()
    }

    const r = asset.residualPct / 100
    const a = asset.amortizablePct / 100

    const VR = C * r  // Valor Residual
    const VA = C * a  // Valor Amortizable

    // Check if vida útil is valid
    if (!asset.vidaUtilValor || asset.vidaUtilValor <= 0) {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionEjercicio: null,
            acumuladaInicio: null,
            acumuladaCierre: null,
            vrContable: null,
            estado: 'ACTIVO',
        }
    }

    // Calculate annual depreciation
    const depAnual = calculateAnnualDepreciation(VA, asset.vidaUtilValor, asset.vidaUtilTipo)

    // Parse dates
    const fechaAlta = parseDate(asset.fechaAlta)
    const fyEnd = parseDate(params.fechaCierreEjercicio)

    if (!fechaAlta || !fyEnd) {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionEjercicio: null,
            acumuladaInicio: null,
            acumuladaCierre: null,
            vrContable: null,
            estado: 'ACTIVO',
        }
    }

    const fyStart = getFiscalYearStart(params.fechaCierreEjercicio)

    let acumInicio: number
    let amortEj: number

    if (params.prorrateoMensual) {
        // Case B: Prorrateo mensual ON
        const monthsBefore = calculateMonthsBetween(fechaAlta, fyStart)
        acumInicio = clamp(depAnual * (monthsBefore / 12), 0, VA)

        const monthsInYear = calculateMonthsInFiscalYear(fechaAlta, fyStart, fyEnd)
        amortEj = clamp(depAnual * (monthsInYear / 12), 0, VA - acumInicio)
    } else {
        // Case A: Prorrateo mensual OFF (simple annual)
        const yearsBefore = Math.max(0, fyStart.getFullYear() - fechaAlta.getFullYear())
        acumInicio = clamp(depAnual * yearsBefore, 0, VA)
        amortEj = clamp(depAnual, 0, VA - acumInicio)
    }

    const acumCierre = clamp(acumInicio + amortEj, 0, VA)
    const vrContable = Math.max(VR, C - acumCierre)

    // Determine estado
    let estado: EstadoBien = 'ACTIVO'
    if (acumCierre >= VA - EPSILON) {
        estado = 'AMORTIZADO'
    }

    return {
        valorResidual: VR,
        valorAmortizable: VA,
        amortizacionEjercicio: amortEj,
        acumuladaInicio: acumInicio,
        acumuladaCierre: acumCierre,
        vrContable,
        estado,
    }
}

/**
 * Create empty calculated values (for incomplete data)
 */
function createEmptyCalculated(): CalculatedValues {
    return {
        valorResidual: null,
        valorAmortizable: null,
        amortizacionEjercicio: null,
        acumuladaInicio: null,
        acumuladaCierre: null,
        vrContable: null,
        estado: 'ACTIVO',
    }
}

/**
 * Calculate all rows with their computed values
 */
export function calculateAllRows(
    assets: AmortizationAsset[],
    params: AmortizationParams
): AmortizationRow[] {
    return assets.map(asset => ({
        asset,
        calculated: calculateAmortization(asset, params),
    }))
}

/**
 * Calculate totals from all rows
 */
export function calculateTotals(rows: AmortizationRow[]): AmortizationTotals {
    return rows.reduce(
        (totals, row) => {
            const { asset, calculated } = row
            return {
                valorOrigen: totals.valorOrigen + (asset.valorOrigen ?? 0),
                valorResidual: totals.valorResidual + (calculated.valorResidual ?? 0),
                valorAmortizable: totals.valorAmortizable + (calculated.valorAmortizable ?? 0),
                amortizacionEjercicio: totals.amortizacionEjercicio + (calculated.amortizacionEjercicio ?? 0),
                acumuladaCierre: totals.acumuladaCierre + (calculated.acumuladaCierre ?? 0),
                vrContable: totals.vrContable + (calculated.vrContable ?? 0),
            }
        },
        {
            valorOrigen: 0,
            valorResidual: 0,
            valorAmortizable: 0,
            amortizacionEjercicio: 0,
            acumuladaCierre: 0,
            vrContable: 0,
        }
    )
}

// ========================================
// Formatting Functions
// ========================================

/**
 * Format number as Argentine currency (ARS)
 * Example: 1234.56 -> "$ 1.234,56"
 */
export function formatCurrencyARS(value: number | null): string {
    if (value === null || isNaN(value)) return '—'

    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

/**
 * Format number as percentage
 * Example: 5 -> "5%"
 */
export function formatPercent(value: number | null): string {
    if (value === null || isNaN(value)) return '—'
    return `${value}%`
}

/**
 * Format date for display (DD/MM/YYYY)
 */
export function formatDateDisplay(dateStr: string): string {
    if (!dateStr) return '—'
    const d = parseDate(dateStr)
    if (!d) return '—'

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d)
}

/**
 * Parse Argentine number input (allows comma as decimal separator)
 */
export function parseArgentineNumber(input: string): number | null {
    if (!input || input.trim() === '') return null

    // Remove thousand separators (.) and convert decimal comma to dot
    const normalized = input
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '')

    const num = parseFloat(normalized)
    return isNaN(num) ? null : num
}

// ========================================
// CSV Export
// ========================================

/**
 * Export rows to CSV string
 */
export function exportToCSV(rows: AmortizationRow[]): string {
    const headers = [
        'Fecha Alta',
        'Detalle',
        'Valor Origen',
        '% Residual',
        'Valor Residual',
        '% Amortizable',
        'Valor Amortizable',
        'Vida Útil',
        'Tipo Vida Útil',
        'No Amortiza',
        'Amort. Ejercicio',
        'Acum. Inicio',
        'Acum. Cierre',
        'VR Contable',
        'Estado',
    ]

    const csvRows = [headers.join(';')]

    for (const row of rows) {
        const { asset, calculated } = row
        const values = [
            asset.fechaAlta || '',
            `"${asset.detalle.replace(/"/g, '""')}"`,
            asset.valorOrigen?.toString() ?? '',
            asset.residualPct.toString(),
            calculated.valorResidual?.toFixed(2) ?? '',
            asset.amortizablePct.toString(),
            calculated.valorAmortizable?.toFixed(2) ?? '',
            asset.vidaUtilValor?.toString() ?? '',
            asset.vidaUtilTipo === 'AÑOS' ? 'Años' : '% Anual',
            asset.noAmortiza ? 'Sí' : 'No',
            calculated.amortizacionEjercicio?.toFixed(2) ?? '',
            calculated.acumuladaInicio?.toFixed(2) ?? '',
            calculated.acumuladaCierre?.toFixed(2) ?? '',
            calculated.vrContable?.toFixed(2) ?? '',
            calculated.estado,
        ]
        csvRows.push(values.join(';'))
    }

    return csvRows.join('\n')
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
    const BOM = '\uFEFF' // UTF-8 BOM for Excel compatibility
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
}
