/**
 * Notas y Anexos - Compute Logic
 *
 * Funciones puras para calcular notas y anexos.
 */

import type { BalanceSheet, IncomeStatement, StatementSection } from '../models'
import type {
    NoteDefinition,
    ComputedNote,
    NoteDetailLine,
    NoteSubtotal,
    ExpenseAnnex,
    ExpenseAnnexLine,
    ExpenseAllocation,
    CostAnnex,
    CostComponent,
    NotasAnexosState,
    NotasAnexosResult,
} from './types'
import { NOTE_DEFINITIONS, detectAllocationHeuristic } from './definitions'

const TOLERANCE = 0.01

// ============================================
// Notas Computation
// ============================================

/**
 * Calcula una nota a partir de la definición y el balance
 */
export function computeNote(
    definition: NoteDefinition,
    balanceSheet: BalanceSheet,
    state: NotasAnexosState,
    comparativeData?: Map<string, number>
): ComputedNote {
    const details: NoteDetailLine[] = []
    let totalCurrent = 0
    let totalPrior = 0

    // Obtener todas las secciones del balance según statementGroups
    const allSections = getAllBalanceSections(balanceSheet)

    for (const sg of definition.statementGroups) {
        // Buscar en todas las secciones
        for (const section of allSections) {
            for (const item of section.accounts) {
                if (item.account.statementGroup !== sg) continue
                if (item.account.isHeader) continue

                // Filtrar por section si aplica
                if (definition.sectionFilter && item.account.section !== definition.sectionFilter) {
                    continue
                }

                // Obtener saldo comparativo
                const priorAmount = comparativeData?.get(item.account.code)

                details.push({
                    accountId: item.account.id,
                    code: item.account.code,
                    name: item.account.name,
                    currentAmount: item.balance,
                    priorAmount,
                    isContra: item.isContra,
                })

                totalCurrent += item.balance
                if (priorAmount !== undefined) {
                    totalPrior += priorAmount
                }
            }
        }
    }

    // Ordenar por código
    details.sort((a, b) => a.code.localeCompare(b.code))

    // Calcular subtotales si aplica
    let subtotals: NoteSubtotal[] | undefined
    if (definition.hasCurrentNonCurrentBreakdown) {
        subtotals = computeCurrentNonCurrentSubtotals(details, comparativeData)
    }

    // Obtener total del rubro en el balance para validación
    const balanceRubroTotal = getBalanceRubroTotal(definition.statementGroups, balanceSheet)

    // Verificar discrepancia
    const hasDiscrepancy = Math.abs(totalCurrent - balanceRubroTotal) > TOLERANCE

    // Obtener narrativa (del state o default)
    const narrative = state.narratives.get(definition.number) ?? definition.defaultNarrative ?? ''

    return {
        definition,
        details,
        subtotals,
        totalCurrent: Math.round(totalCurrent * 100) / 100,
        totalPrior: comparativeData ? Math.round(totalPrior * 100) / 100 : undefined,
        balanceRubroTotal,
        hasDiscrepancy,
        narrative,
    }
}

/**
 * Calcula subtotales corriente/no corriente
 */
function computeCurrentNonCurrentSubtotals(
    _details: NoteDetailLine[],
    _comparativeData?: Map<string, number>
): NoteSubtotal[] {
    // Necesitamos las cuentas originales para saber la sección
    // Por ahora simplificamos y no implementamos el breakdown detallado
    // TODO: Implementar cuando tengamos acceso a las cuentas completas
    return []
}

/**
 * Obtiene todas las secciones del balance
 */
function getAllBalanceSections(balanceSheet: BalanceSheet): StatementSection[] {
    return [
        balanceSheet.currentAssets,
        balanceSheet.nonCurrentAssets,
        balanceSheet.currentLiabilities,
        balanceSheet.nonCurrentLiabilities,
        balanceSheet.equity,
    ]
}

/**
 * Obtiene el total de un rubro en el balance
 */
function getBalanceRubroTotal(
    statementGroups: string[],
    balanceSheet: BalanceSheet
): number {
    let total = 0
    const allSections = getAllBalanceSections(balanceSheet)

    for (const section of allSections) {
        for (const item of section.accounts) {
            if (statementGroups.includes(item.account.statementGroup ?? '')) {
                total += item.balance
            }
        }
    }

    return Math.round(total * 100) / 100
}

/**
 * Calcula todas las notas
 */
export function computeAllNotes(
    balanceSheet: BalanceSheet,
    state: NotasAnexosState,
    comparativeData?: Map<string, number>
): ComputedNote[] {
    return NOTE_DEFINITIONS.map(def =>
        computeNote(def, balanceSheet, state, comparativeData)
    )
}

// ============================================
// Anexo de Gastos Computation
// ============================================

/**
 * Calcula el anexo de gastos por función
 */
export function computeExpenseAnnex(
    incomeStatement: IncomeStatement,
    state: NotasAnexosState
): ExpenseAnnex {
    const lines: ExpenseAnnexLine[] = []

    // Recolectar todas las cuentas de gastos
    const expenseSections = [
        incomeStatement.adminExpenses,
        incomeStatement.sellingExpenses,
        incomeStatement.financialExpenses,
        incomeStatement.otherExpenses,
    ]

    for (const section of expenseSections) {
        for (const item of section.accounts) {
            if (item.account.isHeader) continue
            if (Math.abs(item.balance) < TOLERANCE) continue

            // Obtener asignación (del state o heurística)
            const savedAlloc = state.expenseAllocations.get(item.account.code)
            const allocation: ExpenseAllocation = savedAlloc ?? detectAllocationHeuristic(item.account.name)
            const isManual = savedAlloc?.isManual ?? false

            // Calcular importes por función
            const totalAmount = Math.abs(item.balance)
            const costAmount = totalAmount * (allocation.costPct / 100)
            const adminAmount = totalAmount * (allocation.adminPct / 100)
            const commercialAmount = totalAmount * (allocation.commercialPct / 100)

            lines.push({
                accountId: item.account.id,
                code: item.account.code,
                name: item.account.name,
                totalAmount,
                costAmount,
                adminAmount,
                commercialAmount,
                allocation,
                isManual,
            })
        }
    }

    // Ordenar por código
    lines.sort((a, b) => a.code.localeCompare(b.code))

    // Calcular totales
    const totals = lines.reduce(
        (acc, line) => ({
            total: acc.total + line.totalAmount,
            cost: acc.cost + line.costAmount,
            admin: acc.admin + line.adminAmount,
            commercial: acc.commercial + line.commercialAmount,
        }),
        { total: 0, cost: 0, admin: 0, commercial: 0 }
    )

    return {
        lines,
        totals: {
            total: Math.round(totals.total * 100) / 100,
            cost: Math.round(totals.cost * 100) / 100,
            admin: Math.round(totals.admin * 100) / 100,
            commercial: Math.round(totals.commercial * 100) / 100,
        },
    }
}

// ============================================
// Anexo de Costos (CMV) Computation
// ============================================

/**
 * Calcula el anexo de costos (determinación del CMV)
 */
export function computeCostAnnex(
    balanceSheet: BalanceSheet,
    incomeStatement: IncomeStatement,
    expenseAnnex: ExpenseAnnex,
    state: NotasAnexosState,
    priorInventory?: number
): CostAnnex {
    // Existencia inicial: saldo de bienes de cambio al inicio (prior period)
    const openingInventoryComputed = priorInventory ?? 0

    // Existencia final: saldo actual de bienes de cambio
    let closingInventoryComputed = 0
    for (const item of balanceSheet.currentAssets.accounts) {
        if (item.account.statementGroup === 'INVENTORIES' && !item.account.isHeader) {
            closingInventoryComputed += item.balance
        }
    }

    // Compras: buscar en COGS las cuentas de compras
    let purchasesComputed = 0
    for (const item of incomeStatement.cogs.accounts) {
        const name = item.account.name.toLowerCase()
        if (name.includes('compra') && !item.account.isContra) {
            purchasesComputed += Math.abs(item.balance)
        }
    }

    // Gastos incorporados al costo: viene del anexo de gastos
    const expensesToCostComputed = expenseAnnex.totals.cost

    // Aplicar overrides
    const openingInventory = state.costOverrides.get('openingInventory') ?? openingInventoryComputed
    const purchases = state.costOverrides.get('purchases') ?? purchasesComputed
    const closingInventory = state.costOverrides.get('closingInventory') ?? closingInventoryComputed

    // CMV = EI + Compras + Gastos incorporados - EF
    const cmv = openingInventory + purchases + expensesToCostComputed - closingInventory

    // CMV del ER para validación
    const cmvFromER = Math.abs(incomeStatement.cogs.netTotal)
    const hasDiscrepancy = Math.abs(cmv - cmvFromER) > TOLERANCE

    const components: CostComponent[] = [
        {
            id: 'openingInventory',
            label: 'Existencia inicial al inicio del ejercicio',
            computedValue: openingInventoryComputed,
            effectiveValue: openingInventory,
            isAutomatic: false,
            isManual: state.costOverrides.has('openingInventory'),
            sign: 1,
        },
        {
            id: 'purchases',
            label: '(+) Compras del ejercicio',
            computedValue: purchasesComputed,
            effectiveValue: purchases,
            isAutomatic: false,
            isManual: state.costOverrides.has('purchases'),
            sign: 1,
        },
        {
            id: 'expensesToCost',
            label: '(+) Gastos de fabricación incorporados',
            computedValue: expensesToCostComputed,
            effectiveValue: expensesToCostComputed,
            isAutomatic: true,
            isManual: false,
            sign: 1,
        },
        {
            id: 'closingInventory',
            label: '(-) Existencia final al cierre',
            computedValue: closingInventoryComputed,
            effectiveValue: closingInventory,
            isAutomatic: false,
            isManual: state.costOverrides.has('closingInventory'),
            sign: -1,
        },
    ]

    return {
        components,
        cmv: Math.round(cmv * 100) / 100,
        cmvFromER: Math.round(cmvFromER * 100) / 100,
        hasDiscrepancy,
    }
}

// ============================================
// Main Compute Function
// ============================================

/**
 * Calcula todo el módulo de Notas y Anexos
 */
export function computeNotasAnexos(
    balanceSheet: BalanceSheet,
    incomeStatement: IncomeStatement,
    state: NotasAnexosState,
    comparativeData?: Map<string, number>,
    priorInventory?: number
): NotasAnexosResult {
    // Calcular notas
    const notes = computeAllNotes(balanceSheet, state, comparativeData)

    // Calcular anexo de gastos
    const expenseAnnex = computeExpenseAnnex(incomeStatement, state)

    // Calcular anexo de costos
    const costAnnex = computeCostAnnex(
        balanceSheet,
        incomeStatement,
        expenseAnnex,
        state,
        priorInventory
    )

    // Verificar si hay overrides manuales
    const hasManualOverrides =
        state.narratives.size > 0 ||
        Array.from(state.expenseAllocations.values()).some(a => a.isManual) ||
        state.costOverrides.size > 0

    return {
        notes,
        expenseAnnex,
        costAnnex,
        computedAt: new Date().toISOString(),
        hasManualOverrides,
    }
}

// ============================================
// State Helpers
// ============================================

/**
 * Crea un estado inicial vacío
 */
export function createEmptyState(): NotasAnexosState {
    return {
        narratives: new Map(),
        expenseAllocations: new Map(),
        costOverrides: new Map(),
    }
}

/**
 * Actualiza la narrativa de una nota
 */
export function updateNarrative(
    state: NotasAnexosState,
    noteNumber: number,
    text: string
): NotasAnexosState {
    const narratives = new Map(state.narratives)
    if (text.trim()) {
        narratives.set(noteNumber, text)
    } else {
        narratives.delete(noteNumber)
    }
    return { ...state, narratives }
}

/**
 * Actualiza la asignación de un gasto
 */
export function updateExpenseAllocation(
    state: NotasAnexosState,
    accountCode: string,
    allocation: ExpenseAllocation
): NotasAnexosState {
    const expenseAllocations = new Map(state.expenseAllocations)
    expenseAllocations.set(accountCode, { ...allocation, isManual: true })
    return { ...state, expenseAllocations }
}

/**
 * Resetea la asignación de un gasto
 */
export function resetExpenseAllocation(
    state: NotasAnexosState,
    accountCode: string
): NotasAnexosState {
    const expenseAllocations = new Map(state.expenseAllocations)
    expenseAllocations.delete(accountCode)
    return { ...state, expenseAllocations }
}

/**
 * Actualiza un override de costo
 */
export function updateCostOverride(
    state: NotasAnexosState,
    componentId: string,
    value: number
): NotasAnexosState {
    const costOverrides = new Map(state.costOverrides)
    costOverrides.set(componentId, value)
    return { ...state, costOverrides }
}

/**
 * Resetea un override de costo
 */
export function resetCostOverride(
    state: NotasAnexosState,
    componentId: string
): NotasAnexosState {
    const costOverrides = new Map(state.costOverrides)
    costOverrides.delete(componentId)
    return { ...state, costOverrides }
}

/**
 * Resetea todo el estado
 */
export function resetAllState(): NotasAnexosState {
    return createEmptyState()
}
