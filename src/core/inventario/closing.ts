/**
 * Inventario - Closing Calculations
 * 
 * Pure functions for CMV calculation and closing entry generation.
 * Implements the periodic inventory formula: CMV = EI + Compras Netas - EF
 */

import type { EntryLine } from '../models'
import type { InventoryClosing } from './types'

// ========================================
// Core Calculation Functions
// ========================================

/**
 * Calculate Compras Netas
 * Formula: Compras + Gastos - Bonificaciones - Devoluciones
 */
export function calculateComprasNetas(
    compras: number,
    gastos: number,
    bonificaciones: number,
    devoluciones: number
): number {
    return compras + gastos - bonificaciones - devoluciones
}

/**
 * Calculate Ventas Netas
 * Formula: Ventas - Bonificaciones - Devoluciones
 */
export function calculateVentasNetas(
    ventas: number,
    bonificaciones: number,
    devoluciones: number
): number {
    return ventas - bonificaciones - devoluciones
}

/**
 * Calculate CMV (Costo de Mercaderías Vendidas)
 * Formula: EI + Compras Netas - EF
 */
export function calculateCMV(
    existenciaInicial: number,
    comprasNetas: number,
    existenciaFinal: number
): number {
    return existenciaInicial + comprasNetas - existenciaFinal
}

/**
 * Calculate Resultado Bruto (Gross Profit)
 * Formula: Ventas Netas - CMV
 */
export function calculateResultadoBruto(
    ventasNetas: number,
    cmv: number
): number {
    return ventasNetas - cmv
}

/**
 * Calculate IVA Balance
 * Positive = a favor del fisco, Negative = a favor del contribuyente
 */
export function calculateIVABalance(ivaDF: number, ivaCF: number): number {
    return ivaDF - ivaCF
}

// ========================================
// Closing Update Functions
// ========================================

/**
 * Update all calculated fields in a closing based on inputs
 */
export function updateClosingCalculations(closing: InventoryClosing): InventoryClosing {
    const comprasNetas = calculateComprasNetas(
        closing.compras,
        closing.gastosCompras,
        closing.bonifCompras,
        closing.devolCompras
    )

    const cmv = calculateCMV(
        closing.existenciaInicial,
        comprasNetas,
        closing.existenciaFinal
    )

    const ventasNetas = calculateVentasNetas(
        closing.ventas,
        closing.bonifVentas,
        closing.devolVentas
    )

    const resultadoBruto = calculateResultadoBruto(ventasNetas, cmv)
    const ivaBalance = calculateIVABalance(closing.ivaDF, closing.ivaCF)

    return {
        ...closing,
        comprasNetas,
        cmv,
        ventasNetas,
        resultadoBruto,
        ivaBalance,
        updatedAt: new Date().toISOString(),
    }
}

// ========================================
// Journal Entry Generation
// ========================================

/**
 * Generate closing entry lines
 * 
 * The closing adjusts Mercaderías to match EF using Variación de existencias:
 * - If current balance < EF: Debe Mercaderías, Haber Variación
 * - If current balance > EF: Debe Variación, Haber Mercaderías
 * 
 * @param currentMercaderiasBalance - Current ledger balance of Mercaderías
 * @param existenciaFinal - Target EF value
 * @param mercaderiasAccountId - Account ID for Mercaderías
 * @param variacionAccountId - Account ID for Variación de existencias
 */
export function generateClosingEntryLines(
    currentMercaderiasBalance: number,
    existenciaFinal: number,
    mercaderiasAccountId: string,
    variacionAccountId: string
): EntryLine[] {
    const adjustment = existenciaFinal - currentMercaderiasBalance

    if (Math.abs(adjustment) < 0.01) {
        // No adjustment needed
        return []
    }

    const lines: EntryLine[] = []

    if (adjustment > 0) {
        // Mercaderías needs to increase
        // Debe Mercaderías / Haber Variación de existencias
        lines.push({
            accountId: mercaderiasAccountId,
            debit: adjustment,
            credit: 0,
            description: 'Ajuste inventario final',
        })
        lines.push({
            accountId: variacionAccountId,
            debit: 0,
            credit: adjustment,
            description: 'Variación de existencias (ganancia)',
        })
    } else {
        // Mercaderías needs to decrease
        // Debe Variación de existencias / Haber Mercaderías
        const absAdjustment = Math.abs(adjustment)
        lines.push({
            accountId: variacionAccountId,
            debit: absAdjustment,
            credit: 0,
            description: 'Variación de existencias (pérdida)',
        })
        lines.push({
            accountId: mercaderiasAccountId,
            debit: 0,
            credit: absAdjustment,
            description: 'Ajuste inventario final',
        })
    }

    return lines
}

/**
 * Generate reversal entry lines (inverse of closing entry)
 */
export function generateReversalEntryLines(closingEntryLines: EntryLine[]): EntryLine[] {
    return closingEntryLines.map(line => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
        description: `Reversión: ${line.description || ''}`,
    }))
}

/**
 * Format closing memo for journal entry
 */
export function formatClosingMemo(closing: InventoryClosing): string {
    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

    return `Cierre de inventario por diferencias – ${closing.periodStart} a ${closing.periodEnd} – ` +
        `EI ${formatCurrency(closing.existenciaInicial)} / ` +
        `Compras Netas ${formatCurrency(closing.comprasNetas)} / ` +
        `EF ${formatCurrency(closing.existenciaFinal)} – ` +
        `CMV ${formatCurrency(closing.cmv)}`
}

/**
 * Format reversal memo
 */
export function formatReversalMemo(originalMemo: string): string {
    return `[REVERSIÓN] ${originalMemo}`
}

// ========================================
// Formatting Utilities
// ========================================

/**
 * Format number as Argentine currency (ARS)
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
 * Parse Argentine number input (comma as decimal separator)
 */
export function parseArgentineNumber(input: string): number | null {
    if (!input || input.trim() === '') return null

    const normalized = input
        .replace(/\./g, '')    // Remove thousand separators
        .replace(',', '.')     // Convert decimal comma to dot
        .replace(/[^0-9.-]/g, '')

    const num = parseFloat(normalized)
    return isNaN(num) ? null : num
}

/**
 * Format date for display (DD/MM/YYYY)
 */
export function formatDateDisplay(dateStr: string): string {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d)
}

/**
 * Get period display string
 */
export function formatPeriodDisplay(start: string, end: string): string {
    return `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`
}

// ========================================
// CSV Export
// ========================================

/**
 * Export closing summary to CSV
 */
export function exportClosingToCSV(closing: InventoryClosing): string {
    const rows = [
        ['Concepto', 'Valor'],
        ['Período desde', closing.periodStart],
        ['Período hasta', closing.periodEnd],
        ['Fecha de cierre', closing.closingDate],
        ['', ''],
        ['Existencia Inicial', closing.existenciaInicial.toFixed(2)],
        ['Compras', closing.compras.toFixed(2)],
        ['+ Gastos sobre compras', closing.gastosCompras.toFixed(2)],
        ['- Bonificaciones sobre compras', closing.bonifCompras.toFixed(2)],
        ['- Devoluciones sobre compras', closing.devolCompras.toFixed(2)],
        ['= Compras Netas', closing.comprasNetas.toFixed(2)],
        ['Existencia Final', closing.existenciaFinal.toFixed(2)],
        ['= CMV', closing.cmv.toFixed(2)],
        ['', ''],
        ['Ventas', closing.ventas.toFixed(2)],
        ['- Bonificaciones sobre ventas', closing.bonifVentas.toFixed(2)],
        ['- Devoluciones sobre ventas', closing.devolVentas.toFixed(2)],
        ['= Ventas Netas', closing.ventasNetas.toFixed(2)],
        ['- CMV', closing.cmv.toFixed(2)],
        ['= Resultado Bruto', closing.resultadoBruto.toFixed(2)],
        ['', ''],
        ['IVA Crédito Fiscal', closing.ivaCF.toFixed(2)],
        ['IVA Débito Fiscal', closing.ivaDF.toFixed(2)],
        ['Saldo IVA', closing.ivaBalance.toFixed(2)],
        ['', ''],
        ['Estado', closing.status],
        ['ID Asiento', closing.journalEntryId || '-'],
    ]

    return rows.map(row => row.join(';')).join('\n')
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
}
