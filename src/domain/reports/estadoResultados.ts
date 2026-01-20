/**
 * Estado de Resultados (Income Statement) Domain Builder
 * 
 * Builds a structured income statement from journal entries for a given fiscal period,
 * with optional comparative period support.
 */

import type { Account, JournalEntry, TrialBalanceRow } from '../../core/models'
import { computeLedger } from '../../core/ledger'
import { computeTrialBalance } from '../../core/balance'
import { excludeClosingEntries } from '../../utils/resultsStatement'

// ============================================
// Types
// ============================================

export interface SectionRow {
    accountId: string
    accountCode: string
    accountName: string
    amount: number
    isNegative: boolean
}

export interface StatementSectionResult {
    label: string
    rows: SectionRow[]
    subtotal: number
}

export interface EstadoResultadosData {
    // Period info
    fiscalYear: number
    fechaCorte: string // "31/12/2025"

    // Revenue section
    ventasBrutas: StatementSectionResult
    devolucionesYBonificaciones: StatementSectionResult
    ventasNetas: number

    // Cost section
    costoVentas: StatementSectionResult
    resultadoBruto: number

    // Operating expenses
    gastosComercializacion: StatementSectionResult
    gastosAdministracion: StatementSectionResult
    otrosGastosOperativos: StatementSectionResult
    resultadoOperativo: number

    // Financial & other
    resultadosFinancieros: StatementSectionResult
    otrosResultados: StatementSectionResult
    resultadoAntesImpuesto: number

    // Tax
    impuestoGanancias: number

    // Final result
    resultadoNeto: number
    isGain: boolean

    // YoY change (if comparative available)
    yoyChange?: number

    // Comparative period (previous year)
    comparative?: EstadoResultadosData
}

// ============================================
// Helpers
// ============================================

const TOLERANCE = 0.01

/**
 * Filter entries by date range (inclusive)
 */
function filterEntriesByDate(
    entries: JournalEntry[],
    fromDate: string,
    toDate: string
): JournalEntry[] {
    return entries.filter(e => e.date >= fromDate && e.date <= toDate)
}

/**
 * Get signed amount from trial balance row
 * > 0 => Credit balance (income)
 * < 0 => Debit balance (expense)
 */
function getSignedAmount(row: TrialBalanceRow): number {
    return row.balanceCredit - row.balanceDebit
}

/**
 * Create an empty section result
 */
function createEmptySection(label: string): StatementSectionResult {
    return { label, rows: [], subtotal: 0 }
}

/**
 * Add account to section
 */
function addToSection(
    section: StatementSectionResult,
    row: TrialBalanceRow,
    signedAmount: number,
    invertSign = false
) {
    const amount = invertSign ? -signedAmount : signedAmount
    section.rows.push({
        accountId: row.account.id,
        accountCode: row.account.code,
        accountName: row.account.name,
        amount: Math.abs(amount),
        isNegative: amount < 0
    })
    section.subtotal += signedAmount
}

/**
 * Finalize section (round to 2 decimals)
 */
function finalizeSection(section: StatementSectionResult) {
    section.subtotal = Math.round(section.subtotal * 100) / 100
}

/**
 * Check if account name matches a pattern (case-insensitive, accent-normalized)
 */
function nameMatches(name: string, patterns: string[]): boolean {
    const normalized = name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return patterns.some(p => normalized.includes(p))
}

// ============================================
// Main Builder
// ============================================

export function buildEstadoResultados(params: {
    accounts: Account[]
    entries: JournalEntry[]
    fromDate: string
    toDate: string
    fiscalYear: number
    comparativeFromDate?: string
    comparativeToDate?: string
    comparativeOverrides?: Map<string, number>
}): EstadoResultadosData {
    const {
        accounts,
        entries,
        fromDate,
        toDate,
        fiscalYear,
        comparativeFromDate,
        comparativeToDate,
        comparativeOverrides
    } = params

    // 1. Filter entries for the period
    const periodEntries = filterEntriesByDate(entries, fromDate, toDate)

    // 2. Exclude closing entries
    const entriesWithoutClosing = excludeClosingEntries(periodEntries, accounts)

    // 3. Compute ledger and trial balance
    const ledger = computeLedger(entriesWithoutClosing, accounts)
    const trialBalance = computeTrialBalance(ledger, accounts)

    // 4. Process trial balance
    const result: EstadoResultadosData = {
        ...processTrialBalance(trialBalance, fiscalYear, toDate),
        comparative: undefined,
        yoyChange: undefined,
        isGain: false // placeholder, overwritten below
    }
    result.isGain = result.resultadoNeto >= 0

    // 5. Build comparative period (if requested)
    if (comparativeFromDate && comparativeToDate) {
        const comparativeFiscalYear = fiscalYear - 1

        // Check for manual overrides first
        if (comparativeOverrides && comparativeOverrides.size > 0) {
            result.comparative = {
                ...buildFromOverrides(accounts, comparativeOverrides, comparativeFiscalYear, comparativeToDate),
                comparative: undefined,
                yoyChange: undefined,
                isGain: false
            }
            result.comparative.isGain = result.comparative.resultadoNeto >= 0
        } else {
            // Standard recursion
            result.comparative = buildEstadoResultados({
                accounts,
                entries,
                fromDate: comparativeFromDate,
                toDate: comparativeToDate,
                fiscalYear: comparativeFiscalYear
                // No recursive comparative
            })
        }

        // Calculate YoY change
        if (result.comparative?.resultadoNeto !== 0 && result.comparative?.resultadoNeto !== undefined) {
            result.yoyChange = Math.round(
                ((result.resultadoNeto - result.comparative.resultadoNeto) /
                    Math.abs(result.comparative.resultadoNeto)) * 1000
            ) / 10 // Percentage with 1 decimal
        }
    }

    return result
}

/**
 * Build statement from manual overrides (fake Trial Balance)
 */
function buildFromOverrides(
    accounts: Account[],
    overrides: Map<string, number>,
    fiscalYear: number,
    toDate: string
): Omit<EstadoResultadosData, 'comparative' | 'yoyChange' | 'isGain'> {
    const fakeRows: TrialBalanceRow[] = []

    // Map overrides (Code -> Amount) to TrialBalanceRows
    overrides.forEach((amount, code) => {
        const account = accounts.find(a => a.code === code)
        if (!account) return

        // If amount > 0 => Income => Credit
        // If amount < 0 => Expense => Debit
        // Note: The system expects signedAmount = Credit - Debit.
        // So if override says 1000 (Revenue), we set Credit=1000.
        // If override says -500 (Expense), we set Debit=500.

        let credit = 0
        let debit = 0

        if (amount >= 0) {
            credit = amount
        } else {
            debit = Math.abs(amount)
        }

        fakeRows.push({
            account,
            sumDebit: debit,
            sumCredit: credit,
            balanceDebit: debit,
            balanceCredit: credit
        })
    })

    return processTrialBalance({ rows: fakeRows }, fiscalYear, toDate)
}

/**
 * Process Trial Balance into I/S Sections
 */
function processTrialBalance(
    trialBalance: { rows: TrialBalanceRow[] },
    fiscalYear: number,
    toDate: string
): Omit<EstadoResultadosData, 'comparative' | 'yoyChange' | 'isGain'> {
    // Initialize sections
    const ventasBrutas = createEmptySection('Ventas Brutas')
    const devolucionesYBonificaciones = createEmptySection('Deducciones de Ingresos')
    const costoVentas = createEmptySection('Costo de Ventas')
    const gastosComercializacion = createEmptySection('Gastos de Comercialización')
    const gastosAdministracion = createEmptySection('Gastos de Administración')
    const otrosGastosOperativos = createEmptySection('Otros Gastos Operativos')
    const resultadosFinancieros = createEmptySection('Resultados Financieros y Tenencia')
    const otrosResultados = createEmptySection('Otros Ingresos y Egresos')

    let impuestoGanancias = 0

    // Classify accounts by code prefix and statementGroup
    for (const row of trialBalance.rows) {
        // Only process income/expense accounts (or if overriding, we assume they are valid)
        // If overrides, we might not have 'choice' but we check account.kind
        if (!['INCOME', 'EXPENSE'].includes(row.account.kind)) continue

        // Skip zero balances
        if (Math.abs(row.balanceDebit + row.balanceCredit) < TOLERANCE) continue

        const signedAmount = getSignedAmount(row)
        const code = row.account.code
        const group = row.account.statementGroup

        // Check for tax account
        if (nameMatches(row.account.name, ['impuesto a las ganancias', 'impuesto ganancias', 'imp ganancias'])) {
            impuestoGanancias += Math.abs(signedAmount)
            continue
        }

        // Group by statementGroup (primary) or code prefix (fallback)

        // SALES / Operating Income (4.1.*)
        if (group === 'SALES' || group === 'OTHER_OPERATING_INCOME') {
            // Check if it's a deduction (devolución, bonificación, descuento)
            if (nameMatches(row.account.name, ['devolucion', 'bonificacion', 'descuento', 'deduccion'])) {
                addToSection(devolucionesYBonificaciones, row, signedAmount, true)
            } else {
                addToSection(ventasBrutas, row, signedAmount)
            }
            continue
        }

        // COGS (4.3.* / 5.1.*)
        if (group === 'COGS') {
            addToSection(costoVentas, row, signedAmount)
            continue
        }

        // Selling Expenses (4.4.*)
        if (group === 'SELLING_EXPENSES') {
            addToSection(gastosComercializacion, row, signedAmount)
            continue
        }

        // Admin Expenses (4.5.* / 6.1.*)
        if (group === 'ADMIN_EXPENSES') {
            addToSection(gastosAdministracion, row, signedAmount)
            continue
        }

        // Financial (4.6.*)
        if (group === 'FINANCIAL_INCOME' || group === 'FINANCIAL_EXPENSES') {
            addToSection(resultadosFinancieros, row, signedAmount)
            continue
        }

        // Other Income/Expenses (4.7.*)
        if (group === 'OTHER_INCOME' || group === 'OTHER_EXPENSES') {
            addToSection(otrosResultados, row, signedAmount)
            continue
        }

        // Fallback: classify by code prefix
        if (code.startsWith('4.1') || code.startsWith('4.2')) {
            if (nameMatches(row.account.name, ['devolucion', 'bonificacion', 'descuento'])) {
                addToSection(devolucionesYBonificaciones, row, signedAmount, true)
            } else {
                addToSection(ventasBrutas, row, signedAmount)
            }
        } else if (code.startsWith('4.3') || code.startsWith('5.1')) {
            addToSection(costoVentas, row, signedAmount)
        } else if (code.startsWith('4.4')) {
            addToSection(gastosComercializacion, row, signedAmount)
        } else if (code.startsWith('4.5') || code.startsWith('6.')) {
            addToSection(gastosAdministracion, row, signedAmount)
        } else if (code.startsWith('4.6')) {
            addToSection(resultadosFinancieros, row, signedAmount)
        } else if (code.startsWith('4.7')) {
            addToSection(otrosResultados, row, signedAmount)
        } else {
            // Default to other results
            addToSection(otrosResultados, row, signedAmount)
        }
    }

    // Finalize sections
    finalizeSection(ventasBrutas)
    finalizeSection(devolucionesYBonificaciones)
    finalizeSection(costoVentas)
    finalizeSection(gastosComercializacion)
    finalizeSection(gastosAdministracion)
    finalizeSection(otrosGastosOperativos)
    finalizeSection(resultadosFinancieros)
    finalizeSection(otrosResultados)

    // Calculate subtotals
    // Ventas Netas = Ventas Brutas - Deducciones (deducciones are already negative)
    const ventasNetas = Math.round((ventasBrutas.subtotal + devolucionesYBonificaciones.subtotal) * 100) / 100

    // Resultado Bruto = Ventas Netas - Costo (costo is negative signed amount)
    const resultadoBruto = Math.round((ventasNetas + costoVentas.subtotal) * 100) / 100

    // Resultado Operativo = Bruto - Gastos Operativos
    const totalGastosOperativos =
        gastosComercializacion.subtotal +
        gastosAdministracion.subtotal +
        otrosGastosOperativos.subtotal
    const resultadoOperativo = Math.round((resultadoBruto + totalGastosOperativos) * 100) / 100

    // Resultado antes de impuesto = Operativo + Financieros + Otros
    const resultadoAntesImpuesto = Math.round((
        resultadoOperativo +
        resultadosFinancieros.subtotal +
        otrosResultados.subtotal
    ) * 100) / 100

    // Resultado Neto = Antes de Impuesto - Impuesto
    const resultadoNeto = Math.round((resultadoAntesImpuesto - impuestoGanancias) * 100) / 100

    return {
        fiscalYear,
        fechaCorte: formatFechaCorte(toDate),

        ventasBrutas,
        devolucionesYBonificaciones,
        ventasNetas,

        costoVentas,
        resultadoBruto,

        gastosComercializacion,
        gastosAdministracion,
        otrosGastosOperativos,
        resultadoOperativo,

        resultadosFinancieros,
        otrosResultados,
        resultadoAntesImpuesto,

        impuestoGanancias,

        resultadoNeto
    }
}

/**
 * Format date as "31/12/2025"
 */
function formatFechaCorte(isoDate: string): string {
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
}

/**
 * Get fiscal year date range (assumes calendar year)
 */
export function getFiscalYearDates(year: number): { fromDate: string; toDate: string } {
    return {
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`
    }
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
    const formatted = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(value))

    return value < 0 ? `(${formatted})` : formatted
}
