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
    | 'INCOME_TAX'

/**
 * Componente del patrimonio neto para el EEPN matricial (Fase 2E, §6.4).
 * Mapping estructural por cuenta; con derivación de respaldo desde
 * statementGroup (CAPITAL→CAPITAL, RESERVES→OTHER_RESERVE,
 * RETAINED_EARNINGS→PRIOR_RETAINED_EARNINGS). Nunca se infiere por nombre.
 */
export type EquityComponent =
    | 'CAPITAL'
    | 'CAPITAL_ADJUSTMENT'
    | 'SHARE_PREMIUM'
    | 'IRREVOCABLE_CONTRIBUTION'
    | 'LEGAL_RESERVE'
    | 'STATUTORY_RESERVE'
    | 'OTHER_RESERVE'
    | 'PRIOR_RETAINED_EARNINGS'
    | 'CURRENT_RESULT'
    | 'DEFERRED_RESULT'
    | 'OTHER_EQUITY'

/**
 * Función del gasto para el anexo de gastos (Fase 2E, §9).
 * Mapping estructural por cuenta (`resultFunction`) o distribución por regla
 * versionada; con derivación de respaldo desde statementGroup. COGS e
 * INCOME_TAX quedan fuera del anexo (tienen exposición propia).
 */
export type ResultFunction =
    | 'ADMINISTRATION'
    | 'SELLING'
    | 'PRODUCTION'
    | 'FINANCIAL'
    | 'OTHER'

/**
 * Regla versionada de distribución de un gasto entre funciones (Fase 2E §9.2).
 * Es metadata de EXPOSICIÓN: no altera asientos históricos. La suma de
 * percentages debe ser exactamente 100 (validado por el motor).
 */
export interface ExpenseAllocationRule {
    id: string
    accountId: string
    /** ISO date desde la que rige */
    validFrom: string
    /** ISO date hasta la que rige (abierta si falta) */
    validTo?: string
    allocations: {
        function: ResultFunction
        /** porcentaje 0–100 con hasta 2 decimales */
        percentage: number
    }[]
    reason: string
    createdBy: string
    createdAt: string
    version: number
    /**
     * DRAFT: editable/eliminable, el motor la IGNORA.
     * ACTIVE: inmutable (solo puede finalizarse su vigencia); el motor la aplica.
     * Ausente = ACTIVE (compatibilidad con reglas previas a 2F).
     */
    status?: 'DRAFT' | 'ACTIVE'
    /** regla a la que reemplaza (historial de versiones) */
    supersedesId?: string
}

/**
 * Nota manual persistente (Fase 2F, §8): información complementaria de carga
 * manual, versionada. Cada guardado crea una fila nueva que reemplaza a la
 * anterior (supersedesId); el historial nunca se borra. El contenido es TEXTO
 * PLANO (el servicio elimina cualquier HTML); jamás pisa una nota derivada.
 */
export type ManualNoteType =
    | 'hechos-posteriores'
    | 'contingencias'
    | 'partes-relacionadas'
    | 'compromisos'
    | 'politicas-adicionales'
    | 'otra-informacion'

export interface ManualDisclosure {
    id: string
    companyId: string
    exerciseId: string
    noteType: ManualNoteType
    title: string
    content: string
    status: 'DRAFT' | 'VALIDATED'
    /** "No aplicable" con fundamento en content */
    notApplicable?: boolean
    version: number
    createdAt: string
    createdBy: string
    updatedAt: string
    updatedBy: string
    supersedesId?: string
}

/** Tipo de movimiento patrimonial (clasificación estructural, Fase 2E §6.4) */
export type EquityMovementType =
    | 'OPENING_BALANCE'
    | 'PRIOR_PERIOD_ADJUSTMENT'
    | 'CONTRIBUTION'
    | 'WITHDRAWAL'
    | 'DISTRIBUTION'
    | 'RESERVE_CREATION'
    | 'RESERVE_RELEASE'
    | 'CAPITALIZATION'
    | 'LOSS_ABSORPTION'
    | 'CURRENT_RESULT'
    | 'OTHER'

/**
 * Lado natural del saldo
 */
export type NormalSide = 'DEBIT' | 'CREDIT'

/**
 * Tipo de cuenta legacy (para compatibilidad)
 */
export type AccountType = 'Activo' | 'Pasivo' | 'PatrimonioNeto' | 'Ingreso' | 'Gasto'

/**
 * Clase fundamental de la cuenta (taxonomía estructurada Fase 2A)
 */
export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'OTHER'

/**
 * Clasificación corriente / no corriente
 */
export type CurrentClassification = 'CURRENT' | 'NON_CURRENT' | 'NOT_APPLICABLE'

/**
 * Clasificación monetaria a efectos de reexpresión (RT 6 / RT 54 TO RT 59)
 */
export type MonetaryClassification = 'MONETARY' | 'NON_MONETARY' | 'MIXED' | 'NOT_APPLICABLE'

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

    // ── Taxonomía estructurada (Fase 2A) ─────────────────────
    // Campos opcionales para compatibilidad con datos previos a schema v17.
    // La migración v17 los materializa; usar helpers de accounting/taxonomy
    // para leerlos con derivación de respaldo.
    companyId?: string
    active?: boolean                 // false = no admite nuevas imputaciones
    isPostable?: boolean             // false = agrupadora, no imputable (equivale a !isHeader)
    normalBalance?: NormalSide       // alias estructurado de normalSide
    accountClass?: AccountClass
    currentClassification?: CurrentClassification
    monetaryClassification?: MonetaryClassification
    statementSection?: string        // sección de exposición (ej: 'ACTIVO_CORRIENTE')
    resultFunction?: ResultFunction | string  // función del gasto (anexo de gastos, Fase 2E §9)
    cashFlowCategory?: 'OPERATING' | 'INVESTING' | 'FINANCING' | 'CASH_EQUIVALENT' | 'NOT_APPLICABLE'
    cashFlowSubcategory?: string
    notesGroup?: string
    annexGroup?: string
    /** componente del PN para el EEPN matricial (Fase 2E, §6.4) */
    equityComponent?: EquityComponent
    currency?: string
    validFrom?: string               // ISO date
    validTo?: string                 // ISO date
    systemAccount?: boolean          // cuenta de sistema, no eliminable
    metadataVersion?: number

    // Legacy compatibility
    type?: AccountType        // Mantenido para compatibilidad con MVP 0.1
}

/**
 * Estado del ciclo de vida de un asiento (Fase 2A)
 *
 * - DRAFT: borrador editable, NO impacta Mayor/Balance/Estados
 * - POSTED: contabilizado, inmutable, numerado
 * - REVERSED: contabilizado que fue revertido por un asiento inverso enlazado
 *   (sus líneas siguen integrando los libros; el reverso las neutraliza)
 */
export type EntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

/**
 * Línea de un asiento contable
 */
export interface EntryLine {
    accountId: string
    debit: number
    credit: number
    description?: string
    // Fase 2A (opcionales, para moneda extranjera / futuro)
    currency?: string
    foreignAmount?: number
    exchangeRate?: number
    costCenterId?: string
    metadata?: Record<string, unknown>
}

/**
 * Asiento contable (journal entry)
 *
 * Los campos de contexto (companyId/exerciseId/periodId/status/...) son
 * opcionales en el tipo por compatibilidad con datos anteriores a schema v17,
 * pero el servicio único de contabilización los completa siempre.
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
    // Metadata libre de módulos legacy: los consumidores acceden a rutas
    // anidadas (p. ej. metadata.applyTo.entryId); tiparla como unknown
    // rompería decenas de lecturas sin ganancia de seguridad real acá.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>

    // ── Ciclo de vida y contexto contable (Fase 2A) ─────────
    status?: EntryStatus
    companyId?: string
    exerciseId?: string
    periodId?: string
    entryNumber?: number          // secuencial por empresa/ejercicio; se asigna al contabilizar
    idempotencyKey?: string       // clave estable de origen para operaciones automáticas
    createdBy?: string
    updatedAt?: string
    updatedBy?: string
    postedAt?: string
    postedBy?: string
    reversedAt?: string
    reversedBy?: string
    reversalEntryId?: string      // en el original: id del asiento reverso
    reversedEntryId?: string      // en el reverso: id del asiento original
    reversalReason?: string
    schemaVersion?: number

    /**
     * Clasificación EXPLÍCITA del movimiento patrimonial (Fase 2F, §9).
     * Se estampa al contabilizar (inmutable como el resto del asiento).
     * Sin este campo, el EEPN clasifica estructuralmente (componente/sentido/
     * contrapartida) y las modificaciones de ejercicios anteriores no pueden
     * distinguirse: quedan en Distribuciones/Otros hasta ser confirmadas.
     */
    equityMovementType?: EquityMovementType
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
