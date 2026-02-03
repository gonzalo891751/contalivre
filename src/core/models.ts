/**
 * Tipo de cuenta según ecuación contable fundamental
 */
export type AccountKind = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'

/**
 * Sección/clasificación de la cuenta
 */
export type AccountSection =
    // For ASSET/LIABILITY:
    | 'CURRENT'
    | 'NON_CURRENT'
    // For INCOME/EXPENSE:
    | 'OPERATING'
    | 'COST'
    | 'ADMIN'
    | 'SELLING'
    | 'FINANCIAL'
    | 'OTHER'

/**
 * Grupo para mapeo a estados contables
 */
export type StatementGroup =
    // Balance Sheet - Assets
    | 'CASH_AND_BANKS'
    | 'TRADE_RECEIVABLES'
    | 'OTHER_RECEIVABLES'
    | 'TAX_CREDITS'
    | 'INVENTORIES'
    | 'PPE'
    | 'INTANGIBLES'
    | 'INVESTMENTS'
    // Balance Sheet - Liabilities
    | 'TRADE_PAYABLES'
    | 'TAX_LIABILITIES'
    | 'PAYROLL_LIABILITIES'
    | 'LOANS'
    | 'OTHER_PAYABLES'
    | 'DEFERRED_INCOME'
    // Balance Sheet - Equity
    | 'CAPITAL'
    | 'RESERVES'
    | 'RETAINED_EARNINGS'
    // Income Statement
    | 'SALES'
    | 'OTHER_OPERATING_INCOME'
    | 'COGS'
    | 'ADMIN_EXPENSES'
    | 'SELLING_EXPENSES'
    | 'FINANCIAL_INCOME'
    | 'FINANCIAL_EXPENSES'
    | 'OTHER_INCOME'
    | 'OTHER_EXPENSES'

/**
 * Lado natural del saldo
 */
export type NormalSide = 'DEBIT' | 'CREDIT'

/**
 * Tipo de cuenta legacy (para compatibilidad)
 */
export type AccountType = 'Activo' | 'Pasivo' | 'PatrimonioNeto' | 'Ingreso' | 'Gasto'

/**
 * Cuenta contable con jerarquía y clasificación
 */
export interface Account {
    id: string
    code: string              // Código único jerárquico (ej: "1.1.01.02")
    name: string

    // Classification
    kind: AccountKind         // Tipo fundamental
    section: AccountSection   // Clasificación (corriente/no corriente, admin/ventas, etc.)
    group: string             // Rubro descriptivo (ej: "Caja y Bancos")
    statementGroup: StatementGroup | null  // Mapeo a estados contables

    // Hierarchy
    parentId: string | null   // ID de cuenta padre
    level: number             // Profundidad en el árbol (0 = raíz)

    // Behavior
    normalSide: NormalSide    // Lado natural del saldo
    isContra: boolean         // Cuenta regularizadora/contra
    allowOppositeBalance?: boolean // Permitir saldo contrario (ej: RECPAM, Dif Cambio)
    isHeader: boolean         // Cuenta cabecera (no se puede imputar)
    tags?: string[]           // Optional tags for account classification

    // Legacy compatibility
    type?: AccountType        // Mantenido para compatibilidad con MVP 0.1
}

/**
 * Línea de un asiento contable
 */
export interface EntryLine {
    accountId: string
    debit: number
    credit: number
    description?: string
}

/**
 * Asiento contable (journal entry)
 */
export interface JournalEntry {
    id: string
    date: string // ISO date string (YYYY-MM-DD)
    memo: string
    lines: EntryLine[]
    // Traceability (optional)
    sourceModule?: string
    sourceId?: string
    sourceType?: string
    createdAt?: string
    metadata?: Record<string, any>
}

/**
 * Movimiento en el mayor (resultado de mayorizar un asiento)
 */
export interface LedgerMovement {
    entryId: string
    date: string
    memo: string
    debit: number
    credit: number
    balance: number
    description?: string
}

/**
 * Cuenta en el libro mayor con todos sus movimientos
 */
export interface LedgerAccount {
    account: Account
    movements: LedgerMovement[]
    totalDebit: number
    totalCredit: number
    balance: number
}

/**
 * Libro mayor completo (mapa de accountId -> LedgerAccount)
 */
export type Ledger = Map<string, LedgerAccount>

/**
 * Fila del balance de sumas y saldos
 */
export interface TrialBalanceRow {
    account: Account
    sumDebit: number
    sumCredit: number
    balanceDebit: number
    balanceCredit: number
}

/**
 * Balance de sumas y saldos
 */
export interface TrialBalance {
    rows: TrialBalanceRow[]
    totalSumDebit: number
    totalSumCredit: number
    totalBalanceDebit: number
    totalBalanceCredit: number
    isBalanced: boolean
}

/**
 * Grupo de cuentas para estados contables (mejorado)
 */
export interface StatementSection {
    key: string
    label: string
    accounts: Array<{
        account: Account
        balance: number
        isContra: boolean
    }>
    subtotal: number
    netTotal: number // After contra accounts
}

/**
 * Estado de Situación Patrimonial (mejorado)
 */
export interface BalanceSheet {
    currentAssets: StatementSection
    nonCurrentAssets: StatementSection
    totalAssets: number

    currentLiabilities: StatementSection
    nonCurrentLiabilities: StatementSection
    totalLiabilities: number

    equity: StatementSection
    totalEquity: number

    totalLiabilitiesAndEquity: number
    isBalanced: boolean
}

/**
 * Estado de Resultados (mejorado)
 */
export interface IncomeStatement {
    sales: StatementSection
    cogs: StatementSection
    grossProfit: number

    adminExpenses: StatementSection
    sellingExpenses: StatementSection
    operatingIncome: number

    financialIncome: StatementSection
    financialExpenses: StatementSection
    netFinancialResult: number

    otherIncome: StatementSection
    otherExpenses: StatementSection
    netOtherResult: number

    netIncome: number
}

/**
 * Estados contables completos
 */
export interface FinancialStatements {
    balanceSheet: BalanceSheet
    incomeStatement: IncomeStatement
}

/**
 * Resultado de validación de un asiento
 */
export interface ValidationResult {
    ok: boolean
    errors: string[]
    diff: number // diferencia debe - haber
}

// ========================================
// Utility functions for Account
// ========================================

/**
 * Convierte AccountKind a AccountType legacy
 */
export function kindToType(kind: AccountKind): AccountType {
    const map: Record<AccountKind, AccountType> = {
        'ASSET': 'Activo',
        'LIABILITY': 'Pasivo',
        'EQUITY': 'PatrimonioNeto',
        'INCOME': 'Ingreso',
        'EXPENSE': 'Gasto',
    }
    return map[kind]
}

/**
 * Convierte AccountType legacy a AccountKind
 */
export function typeToKind(type: AccountType): AccountKind {
    const map: Record<AccountType, AccountKind> = {
        'Activo': 'ASSET',
        'Pasivo': 'LIABILITY',
        'PatrimonioNeto': 'EQUITY',
        'Ingreso': 'INCOME',
        'Gasto': 'EXPENSE',
    }
    return map[type]
}

/**
 * Determina el lado natural del saldo según el tipo de cuenta
 */
export function getDefaultNormalSide(kind: AccountKind): NormalSide {
    return ['ASSET', 'EXPENSE'].includes(kind) ? 'DEBIT' : 'CREDIT'
}

/**
 * Etiquetas en español para AccountKind
 */
export const KIND_LABELS: Record<AccountKind, string> = {
    'ASSET': 'Activo',
    'LIABILITY': 'Pasivo',
    'EQUITY': 'Patrimonio Neto',
    'INCOME': 'Ingreso',
    'EXPENSE': 'Gasto/Costo',
}

/**
 * Etiquetas en español para AccountSection
 */
export const SECTION_LABELS: Record<AccountSection, string> = {
    'CURRENT': 'Corriente',
    'NON_CURRENT': 'No Corriente',
    'OPERATING': 'Operativo',
    'COST': 'Costo',
    'ADMIN': 'Administración',
    'SELLING': 'Comercialización',
    'FINANCIAL': 'Financiero',
    'OTHER': 'Otros',
}
