/**
 * Notas y Anexos - Type Definitions
 *
 * Tipos para el sistema de Notas a los Estados Contables y Anexos.
 */

import type { StatementGroup } from '../models'

// ============================================
// Notas a los Estados Contables
// ============================================

/**
 * Definición de una nota con su regla de inclusión
 */
export interface NoteDefinition {
    /** Número de nota (ej: 4 para "Nota 4") */
    number: number
    /** Título de la nota (ej: "Caja y Bancos") */
    title: string
    /** StatementGroups a incluir */
    statementGroups: StatementGroup[]
    /** Filtro adicional por section si aplica */
    sectionFilter?: 'CURRENT' | 'NON_CURRENT' | null
    /** Si tiene subtotales por corriente/no corriente */
    hasCurrentNonCurrentBreakdown?: boolean
    /** Texto narrativo por defecto */
    defaultNarrative?: string
}

/**
 * Línea de detalle dentro de una nota
 */
export interface NoteDetailLine {
    /** ID de la cuenta */
    accountId: string
    /** Código de cuenta */
    code: string
    /** Nombre de la cuenta */
    name: string
    /** Saldo actual */
    currentAmount: number
    /** Saldo comparativo (ejercicio anterior) */
    priorAmount?: number
    /** Es cuenta regularizadora */
    isContra: boolean
}

/**
 * Subtotal dentro de una nota (ej: Corriente / No Corriente)
 */
export interface NoteSubtotal {
    label: string
    currentAmount: number
    priorAmount?: number
}

/**
 * Nota calculada con sus detalles
 */
export interface ComputedNote {
    /** Definición de la nota */
    definition: NoteDefinition
    /** Líneas de detalle (cuentas) */
    details: NoteDetailLine[]
    /** Subtotales si corresponde */
    subtotals?: NoteSubtotal[]
    /** Total de la nota (current) */
    totalCurrent: number
    /** Total de la nota (prior) */
    totalPrior?: number
    /** Total del rubro en el Balance (para validación) */
    balanceRubroTotal?: number
    /** Hay discrepancia con el Balance */
    hasDiscrepancy: boolean
    /** Texto narrativo (editable) */
    narrative: string
}

// ============================================
// Anexo de Gastos por Función
// ============================================

/**
 * Asignación de gastos por función
 */
export interface ExpenseAllocation {
    /** Porcentaje asignado a Costo */
    costPct: number
    /** Porcentaje asignado a Administración */
    adminPct: number
    /** Porcentaje asignado a Comercialización */
    commercialPct: number
}

/**
 * Línea del anexo de gastos
 */
export interface ExpenseAnnexLine {
    /** ID de la cuenta */
    accountId: string
    /** Código de cuenta */
    code: string
    /** Nombre de la cuenta */
    name: string
    /** Importe total (movimiento del ejercicio) */
    totalAmount: number
    /** Importe asignado a Costo */
    costAmount: number
    /** Importe asignado a Administración */
    adminAmount: number
    /** Importe asignado a Comercialización */
    commercialAmount: number
    /** Asignación porcentual */
    allocation: ExpenseAllocation
    /** Es override manual */
    isManual: boolean
}

/**
 * Anexo de gastos completo
 */
export interface ExpenseAnnex {
    /** Líneas de gastos */
    lines: ExpenseAnnexLine[]
    /** Totales */
    totals: {
        total: number
        cost: number
        admin: number
        commercial: number
    }
}

// ============================================
// Anexo de Costos (CMV)
// ============================================

/**
 * Componente del CMV
 */
export interface CostComponent {
    /** ID del componente */
    id: 'openingInventory' | 'purchases' | 'expensesToCost' | 'closingInventory'
    /** Etiqueta */
    label: string
    /** Valor calculado automáticamente */
    computedValue: number
    /** Valor con override (si aplica) */
    effectiveValue: number
    /** Es calculado automáticamente (no editable) */
    isAutomatic: boolean
    /** Tiene override manual */
    isManual: boolean
    /** Signo para la fórmula (+1 o -1) */
    sign: 1 | -1
}

/**
 * Anexo de costos completo
 */
export interface CostAnnex {
    /** Componentes */
    components: CostComponent[]
    /** CMV calculado */
    cmv: number
    /** CMV del ER (para validación) */
    cmvFromER?: number
    /** Hay discrepancia con el ER */
    hasDiscrepancy: boolean
}

// ============================================
// Estado Global de Notas y Anexos
// ============================================

/**
 * Estado persistido de Notas y Anexos
 */
export interface NotasAnexosState {
    /** Narrativas por nota (noteNumber -> text) */
    narratives: Map<number, string>
    /** Asignaciones de gastos (accountCode -> allocation) */
    expenseAllocations: Map<string, ExpenseAllocation & { isManual: boolean }>
    /** Overrides de costos (componentId -> value) */
    costOverrides: Map<string, number>
}

/**
 * Configuración de visualización
 */
export interface NotasAnexosViewConfig {
    /** Mostrar columna comparativa */
    showComparative: boolean
    /** Mostrar detalle de cuentas */
    showDetail: boolean
    /** Año del ejercicio actual */
    fiscalYear: number
    /** Año del ejercicio comparativo */
    comparativeYear: number
}

/**
 * Resultado completo del cálculo
 */
export interface NotasAnexosResult {
    /** Notas calculadas */
    notes: ComputedNote[]
    /** Anexo de gastos */
    expenseAnnex: ExpenseAnnex
    /** Anexo de costos */
    costAnnex: CostAnnex
    /** Metadata */
    computedAt: string
    /** Hay algún override manual */
    hasManualOverrides: boolean
}
