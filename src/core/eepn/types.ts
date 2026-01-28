/**
 * EEPN - Estado de Evolución del Patrimonio Neto
 * Type definitions
 */

import type { Account, JournalEntry } from '../models'

/**
 * Column definition for EEPN
 * Maps account codes to columns
 */
export interface EEPNColumnDef {
    id: string
    label: string
    shortLabel: string
    /** Account codes that contribute to this column (prefix match) */
    accountCodes: string[]
    /** Account codes to subtract (contra accounts handled automatically) */
    group: 'APORTES' | 'RESERVAS' | 'RESULTADOS'
}

/**
 * Row types for EEPN
 */
export type EEPNRowType =
    | 'SALDO_INICIO'
    | 'AREA'
    | 'SALDO_INICIO_AJUSTADO'
    | 'SECTION_HEADER'
    | 'APORTES_PROPIETARIOS'
    | 'CAPITALIZACIONES'
    | 'RESERVAS'
    | 'DISTRIBUCIONES'
    | 'RESULTADO_EJERCICIO'
    | 'OTROS_MOVIMIENTOS'
    | 'TOTAL_VARIACIONES'
    | 'SALDO_CIERRE'

/**
 * Single cell value in EEPN matrix
 */
export interface EEPNCellValue {
    amount: number
    /** Override applied manually */
    isOverridden?: boolean
    /** Breakdown of entries contributing to this value */
    breakdown?: EEPNCellBreakdown[]
}

/**
 * Breakdown item showing origin of a cell value
 */
export interface EEPNCellBreakdown {
    entryId: string
    date: string
    memo: string
    amount: number
    accountCode: string
    accountName: string
}

/**
 * Row in EEPN matrix
 */
export interface EEPNRow {
    id: string
    type: EEPNRowType
    label: string
    /** Map of columnId -> cell value */
    cells: Map<string, EEPNCellValue>
    /** Total for this row */
    total: number
    /** Comparative total (previous year) */
    comparativeTotal?: number
    /** Is this a section header (no values) */
    isHeader?: boolean
    /** Is this a total row (bold styling) */
    isTotal?: boolean
    /** Indent level for display */
    indent?: number
}

/**
 * Complete EEPN result
 */
export interface EEPNResult {
    columns: EEPNColumnDef[]
    rows: EEPNRow[]
    /** PN at start of period */
    pnInicio: number
    /** PN at end of period */
    pnCierre: number
    /** Net variation */
    variacionNeta: number
    /** Result from ER for reconciliation */
    resultadoER?: number
    /** Reconciliation status */
    reconciliation: EEPNReconciliation
    /** Manual overrides applied */
    overrides: Map<string, number>
    /** Period info */
    period: {
        from: string
        to: string
        label: string
    }
    comparativePeriod?: {
        from: string
        to: string
        label: string
    }
}

/**
 * Reconciliation info
 */
export interface EEPNReconciliation {
    /** Does EEPN total match balance sheet PN? */
    matchesBalance: boolean
    balanceDiff: number
    /** Does result match ER? */
    matchesER: boolean
    erDiff: number
    /** Warnings */
    warnings: string[]
}

/**
 * Input for EEPN computation
 */
export interface EEPNInput {
    accounts: Account[]
    entries: JournalEntry[]
    /** Start date of period (YYYY-MM-DD) */
    periodStart: string
    /** End date of period (YYYY-MM-DD) */
    periodEnd: string
    /** Optional: start date for comparative period */
    comparativePeriodStart?: string
    /** Optional: end date for comparative period */
    comparativePeriodEnd?: string
    /** Optional: manual overrides by "rowId:colId" */
    overrides?: Map<string, number>
    /** Optional: net income from Estado de Resultados */
    netIncomeFromER?: number
    /** Optional: PN total from Balance Sheet */
    pnFromBalance?: number
}

/**
 * Movement classification for EEPN rows
 */
export interface MovementClassification {
    rowType: EEPNRowType
    reason: string
}
