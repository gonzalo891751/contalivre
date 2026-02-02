/**
 * Moneda Extranjera - Type Definitions
 *
 * Data models for foreign currency management (USD, EUR, etc.)
 * Supports asset/liability tracking, exchange rate valuations, and journal integration.
 */

// ========================================
// Exchange Rates
// ========================================

/**
 * Exchange rate quote types
 */
export type QuoteType = 'Oficial' | 'Blue' | 'MEP' | 'CCL' | 'Cripto'

/**
 * Exchange rate data from provider
 */
export interface ExchangeRate {
    type: QuoteType
    compra: number
    venta: number
    source: string
    fechaActualizacion: string // ISO timestamp
}

/**
 * Cached exchange rates
 */
export interface ExchangeRatesCache {
    id: string // 'fx-rates-cache'
    rates: ExchangeRate[]
    fetchedAt: string // ISO timestamp
    expiresAt: string // ISO timestamp (fetchedAt + TTL)
}

// ========================================
// FX Accounts (Carteras)
// ========================================

/**
 * FX Account type (asset or liability)
 */
export type FxAccountType = 'ASSET' | 'LIABILITY'

/**
 * Asset sub-type
 */
export type FxAssetSubtype = 'CAJA' | 'BANCO' | 'INVERSION' | 'CRIPTO' | 'OTRO'

/**
 * Liability sub-type
 */
export type FxLiabilitySubtype = 'PROVEEDOR' | 'PRESTAMO' | 'OTRO'

/**
 * Currency code
 */
export type CurrencyCode = 'USD' | 'EUR' | 'USDT' | 'BRL'

/**
 * FX Account (cartera) - represents a holding or debt position
 */
export interface FxAccount {
    id: string
    name: string
    type: FxAccountType
    subtype: FxAssetSubtype | FxLiabilitySubtype
    currency: CurrencyCode
    periodId: string
    // Accounting mapping
    accountId?: string // Linked ledger account ID
    // For liabilities: creditor info
    creditor?: string
    // Opening balance
    openingBalance: number // In foreign currency
    openingRate: number // Historical ARS/FC rate at opening
    openingDate: string // ISO date
    // Metadata
    notes?: string
    createdAt: string
    updatedAt: string
}

// ========================================
// FX Movements
// ========================================

/**
 * Movement type
 */
export type FxMovementType =
    | 'COMPRA' // Buy foreign currency
    | 'VENTA' // Sell foreign currency
    | 'INGRESO' // Deposit/receive FC (no ARS exchange)
    | 'EGRESO' // Withdraw/pay FC (no ARS exchange)
    | 'TRANSFERENCIA' // Transfer between FC accounts
    | 'AJUSTE' // Adjustment
    | 'PAGO_DEUDA' // Debt payment (for liabilities)
    | 'TOMA_DEUDA' // Debt origination (disbursement)
    | 'DESEMBOLSO_DEUDA' // Additional disbursement / refinancing

/**
 * Journal integration status (same as inventory for consistency)
 */
export type FxJournalStatus = 'generated' | 'linked' | 'none' | 'error' | 'missing' | 'desync'

/**
 * Rate side: which rate to use from the quote (compra or venta)
 */
export type RateSide = 'compra' | 'venta'

/**
 * FX Movement
 */
export interface FxMovement {
    id: string
    date: string // ISO date
    type: FxMovementType
    accountId: string // FX Account ID (source for transfers)
    targetAccountId?: string // Target FX Account ID (for transfers)
    periodId: string
    // Amounts
    amount: number // Foreign currency amount (always positive)
    currency: CurrencyCode
    // Exchange rate at operation time
    rate: number // ARS/FC
    rateType: QuoteType | 'custom'
    rateSide: RateSide // compra or venta from quote
    rateSource: string // e.g., 'DolarAPI', 'Manual'
    // Calculated ARS values
    arsAmount: number // amount * rate (gross, before comision)
    // Contrapartida (ARS account for buy/sell)
    contrapartidaAccountId?: string // Ledger account ID for ARS counterpart
    // Comisiones
    comisionARS?: number // Commission/fees in ARS
    comisionAccountId?: string // Expense account for commission
    // FIFO cost tracking (for sales)
    costoARS?: number // FIFO cost of sold FC
    resultadoARS?: number // Gain/loss (arsAmount - costoARS)
    // For debt payments: capital vs interest breakdown
    capitalAmount?: number // FC capital portion
    interestAmount?: number // FC interest portion
    interestARS?: number // Interest in ARS
    debtId?: string // Link to FxDebt
    // Counterparty info
    counterparty?: string
    reference?: string
    notes?: string
    // Journal integration
    autoJournal: boolean
    linkedJournalEntryIds: string[]
    journalStatus: FxJournalStatus
    journalMissingReason?: 'entry_deleted' | 'manual_unlinked'
    // Metadata
    createdAt: string
    updatedAt: string
}

// ========================================
// FIFO Lots (for cost tracking)
// ========================================

/**
 * FIFO Lot - represents a purchase of foreign currency
 * Used to calculate cost basis when selling
 */
export interface FxLot {
    id: string
    accountId: string // FX Account
    movementId: string // Source movement (COMPRA/INGRESO)
    date: string // ISO date
    currency: CurrencyCode
    // Original amounts
    amountOriginal: number // FC amount purchased
    rateOriginal: number // ARS/FC at purchase
    arsOriginal: number // amountOriginal * rateOriginal
    // Remaining after partial sales
    amountRemaining: number // FC remaining in lot
    // Status
    fullyConsumed: boolean
    consumedAt?: string // ISO date when fully consumed
}

/**
 * Lot consumption record - tracks how lots are consumed by sales
 */
export interface FxLotConsumption {
    lotId: string
    movementId: string // Sale movement
    amountConsumed: number // FC consumed from this lot
    costARS: number // Cost of consumed amount (amountConsumed * lot.rateOriginal)
}

// ========================================
// FX Liabilities (Deudas)
// ========================================

/**
 * Liability payment frequency
 */
export type PaymentFrequency = 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICO'

/**
 * Loan amortization system
 */
export type LoanSystem = 'FRANCES' | 'ALEMAN' | 'AMERICANO' | 'BULLET'

/**
 * FX Debt - structured debt with amortization
 */
export interface FxDebt {
    id: string
    name: string // Debt name/description
    accountId: string // Linked FX Account (LIABILITY type)
    periodId: string
    // Debt details
    principalME: number // Original principal in FC
    currency: CurrencyCode
    rateInicial: number // ARS/FC at origination
    rateType: QuoteType | 'custom'
    rateSide: RateSide
    principalARS: number // principalME * rateInicial
    originDate: string // ISO date
    // Loan terms
    interestRateAnnual: number // TNA (0.12 = 12%)
    installments: number // Total installments
    frequency: PaymentFrequency
    system: LoanSystem // Amortization system
    firstDueDate: string // First installment due date
    schedule: FxDebtInstallment[] // Persisted amortization schedule
    // Contrapartida for opening
    contrapartidaAccountId?: string // Where the money went (Banco/Caja)
    // Current status
    saldoME: number // Remaining principal in FC
    paidInstallments: number
    status: 'ACTIVE' | 'PAID' | 'DEFAULTED'
    // Counterparty
    creditor: string
    reference?: string
    notes?: string
    legacyLiabilityId?: string // Backwards-compat link to FxLiability
    // Journal integration (for opening entry)
    autoJournal: boolean
    linkedJournalEntryIds: string[]
    journalStatus: FxJournalStatus
    // Metadata
    createdAt: string
    updatedAt: string
}

/**
 * FX Debt Installment - scheduled payment
 */
export interface FxDebtInstallment {
    number: number // 1-based
    dueDate: string // ISO date
    capitalME: number // Principal portion in FC
    interestME: number // Interest portion in FC
    totalME: number // capitalME + interestME
    // Calculated at current rate for display
    capitalARS?: number
    interestARS?: number
    totalARS?: number
    // Payment status
    paid: boolean
    paidDate?: string
    paidMovementId?: string
    paidRate?: number // Rate used for payment
}

/**
 * FX Liability (structured debt) - DEPRECATED: use FxDebt instead
 * Keeping for backwards compatibility
 */
export interface FxLiability {
    id: string
    accountId: string // Linked FX Account
    periodId: string
    // Debt details
    originalAmount: number // Original FC amount
    currency: CurrencyCode
    rate: number // ARS/FC at origination
    rateType: QuoteType | 'custom'
    // Installment info
    installments: number // Total number of installments
    frequency: PaymentFrequency
    interestRate?: number // Annual interest rate (optional)
    startDate: string // First payment date
    // Status
    paidInstallments: number
    remainingAmount: number // FC remaining
    // Counterparty
    creditor: string
    reference?: string
    notes?: string
    // Journal integration
    autoJournal: boolean
    linkedJournalEntryIds: string[]
    journalStatus: FxJournalStatus
    // Metadata
    createdAt: string
    updatedAt: string
}

/**
 * Installment schedule item
 */
export interface FxInstallment {
    id: string
    liabilityId: string
    number: number // Installment number (1-based)
    dueDate: string // ISO date
    // Amounts in FC
    capitalAmount: number
    interestAmount: number
    totalAmount: number
    // Payment status
    paid: boolean
    paidDate?: string
    paidMovementId?: string
}

// ========================================
// Settings & Configuration
// ========================================

/**
 * FX Account mapping keys for journal entries
 */
export type FxAccountMappingKey =
    | 'cajaME' // Caja ME (Activo)
    | 'bancoME' // Banco ME (Activo)
    | 'inversionME' // Inversiones ME (Activo)
    | 'pasivoME' // Pasivo ME / Prestamos ME (Pasivo)
    | 'diferenciaCambio' // Diferencias de cambio (Resultado)
    | 'interesesGanados' // Intereses ganados (Resultado)
    | 'interesesPerdidos' // Intereses perdidos (Resultado)
    | 'cajaARS' // Caja ARS contrapartida (Activo)
    | 'bancoARS' // Banco ARS contrapartida (Activo)
    | 'comisionesBancarias' // Comisiones bancarias (Gasto)

/**
 * Valuation mode
 */
export type ValuationMode = 'contable' | 'gestion'

/**
 * FX Module settings
 */
export interface FxSettings {
    id: string // 'fx-settings'
    // Valuation preferences
    defaultValuationMode: ValuationMode
    gestionQuoteType: QuoteType // Which quote to use in "gestion" mode
    // Rules
    assetRateRule: 'compra' | 'venta' // For assets, use compra or venta
    liabilityRateRule: 'compra' | 'venta' // For liabilities
    // Account mappings
    accountMappings: Partial<Record<FxAccountMappingKey, string>>
    // Costing method for FC sales
    costingMethod: 'PPP' | 'FIFO' // Weighted average or FIFO
    // Metadata
    lastUpdated: string
}

// ========================================
// Computed Types (for UI)
// ========================================

/**
 * FX Account valuation summary
 */
export interface FxAccountValuation {
    account: FxAccount
    // Balance in FC
    balance: number
    // Historical valuation
    rateHistorical: number // Weighted avg rate
    arsHistorical: number // balance * rateHistorical
    // Current valuation
    rateCurrent: number // Current quote
    arsCurrent: number // balance * rateCurrent
    // Difference
    differenceArs: number // arsCurrent - arsHistorical (or inverted for liabilities)
}

/**
 * FX Dashboard KPIs
 */
export interface FxKPIs {
    // USD equivalents
    totalAssetsUSD: number
    totalLiabilitiesUSD: number
    netPositionUSD: number
    // ARS at official rate
    totalAssetsArsOficial: number
    totalLiabilitiesArsOficial: number
    netPositionArsOficial: number
    // Latent difference
    latentDifferenceArs: number
    // Historical totals
    totalAssetsArsHistorical: number
    totalLiabilitiesArsHistorical: number
}

/**
 * Reconciliation item (movement without entry or entry without movement)
 */
export interface FxReconciliationItem {
    type: 'movement_missing_entry' | 'entry_missing_movement'
    movement?: FxMovement
    entry?: {
        id: string
        date: string
        memo: string
        total: number
    }
    suggestedAction: 'generate' | 'link' | 'ignore'
}

// ========================================
// Factory Functions
// ========================================

/**
 * Generate unique ID
 */
export function generateFxId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create default FX settings
 */
export function createDefaultFxSettings(): FxSettings {
    return {
        id: 'fx-settings',
        defaultValuationMode: 'contable',
        gestionQuoteType: 'Blue',
        assetRateRule: 'compra',
        liabilityRateRule: 'venta',
        accountMappings: {},
        costingMethod: 'PPP',
        lastUpdated: new Date().toISOString(),
    }
}

/**
 * Create empty FX account
 */
export function createEmptyFxAccount(type: FxAccountType, periodId: string): Omit<FxAccount, 'id' | 'createdAt' | 'updatedAt'> {
    const now = new Date().toISOString().split('T')[0]
    return {
        name: '',
        type,
        subtype: type === 'ASSET' ? 'CAJA' : 'PROVEEDOR',
        currency: 'USD',
        periodId,
        openingBalance: 0,
        openingRate: 0,
        openingDate: now,
    }
}

/**
 * Create empty FX movement
 */
export function createEmptyFxMovement(
    accountId: string,
    periodId: string,
    type: FxMovementType = 'COMPRA'
): Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'> {
    const now = new Date().toISOString().split('T')[0]
    return {
        date: now,
        type,
        accountId,
        periodId,
        amount: 0,
        currency: 'USD',
        rate: 0,
        rateType: 'Oficial',
        rateSide: getDefaultRateSide(type),
        rateSource: 'DolarAPI',
        arsAmount: 0,
        autoJournal: true,
    }
}

/**
 * Create empty FX debt
 */
export function createEmptyFxDebt(
    accountId: string,
    periodId: string
): Omit<FxDebt, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'> {
    const now = new Date().toISOString().split('T')[0]
    return {
        name: '',
        accountId,
        periodId,
        principalME: 0,
        currency: 'USD',
        rateInicial: 0,
        rateType: 'Oficial',
        rateSide: 'venta',
        principalARS: 0,
        originDate: now,
        interestRateAnnual: 0,
        installments: 1,
        frequency: 'MENSUAL',
        system: 'FRANCES',
        firstDueDate: now,
        schedule: [],
        saldoME: 0,
        paidInstallments: 0,
        status: 'ACTIVE',
        creditor: '',
        autoJournal: true,
    }
}

/**
 * Create empty FX liability
 */
export function createEmptyFxLiability(
    accountId: string,
    periodId: string
): Omit<FxLiability, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'> {
    const now = new Date().toISOString().split('T')[0]
    return {
        accountId,
        periodId,
        originalAmount: 0,
        currency: 'USD',
        rate: 0,
        rateType: 'Oficial',
        installments: 1,
        frequency: 'UNICO',
        startDate: now,
        paidInstallments: 0,
        remainingAmount: 0,
        creditor: '',
        autoJournal: true,
    }
}

/**
 * Default account code mappings (Argentine chart of accounts)
 */
export const DEFAULT_FX_ACCOUNT_CODES: Record<FxAccountMappingKey, string> = {
    cajaME: '1.1.01.10',
    bancoME: '1.1.01.11',
    inversionME: '1.1.05.03',
    pasivoME: '2.1.01.10',
    diferenciaCambio: '4.6.03',
    interesesGanados: '4.6.01',
    interesesPerdidos: '4.6.02',
    cajaARS: '1.1.01.01',
    bancoARS: '1.1.01.02',
    comisionesBancarias: '4.6.04',
}

/**
 * Quote type labels
 */
export const QUOTE_TYPE_LABELS: Record<QuoteType, string> = {
    Oficial: 'Oficial (BNA)',
    Blue: 'Dolar Blue',
    MEP: 'Dolar MEP',
    CCL: 'Dolar CCL',
    Cripto: 'USDT / Cripto',
}

/**
 * Movement type labels
 */
export const MOVEMENT_TYPE_LABELS: Record<FxMovementType, string> = {
    COMPRA: 'Compra',
    VENTA: 'Venta',
    INGRESO: 'Ingreso',
    EGRESO: 'Egreso',
    TRANSFERENCIA: 'Transferencia',
    AJUSTE: 'Ajuste',
    PAGO_DEUDA: 'Pago Deuda',
    TOMA_DEUDA: 'Toma de Deuda',
    DESEMBOLSO_DEUDA: 'Desembolso Deuda',
}

/**
 * Currency labels
 */
export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
    USD: 'Dólar (USD)',
    EUR: 'Euro (EUR)',
    USDT: 'Tether (USDT)',
    BRL: 'Real (BRL)',
}

/**
 * Asset subtype labels
 */
export const ASSET_SUBTYPE_LABELS: Record<FxAssetSubtype, string> = {
    CAJA: 'Caja',
    BANCO: 'Banco',
    INVERSION: 'Inversión',
    CRIPTO: 'Cripto Wallet',
    OTRO: 'Otro',
}

/**
 * Liability subtype labels
 */
export const LIABILITY_SUBTYPE_LABELS: Record<FxLiabilitySubtype, string> = {
    PROVEEDOR: 'Proveedor',
    PRESTAMO: 'Préstamo',
    OTRO: 'Otro',
}

/**
 * Loan system labels
 */
export const LOAN_SYSTEM_LABELS: Record<LoanSystem, string> = {
    FRANCES: 'Francés (cuota fija)',
    ALEMAN: 'Alemán (capital fijo)',
    AMERICANO: 'Americano (intereses, capital al final)',
    BULLET: 'Bullet (todo al vencimiento)',
}

/**
 * Payment frequency labels
 */
export const FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
    MENSUAL: 'Mensual',
    BIMESTRAL: 'Bimestral',
    TRIMESTRAL: 'Trimestral',
    SEMESTRAL: 'Semestral',
    ANUAL: 'Anual',
    UNICO: 'Pago único',
}

/**
 * Debt status labels
 */
export const DEBT_STATUS_LABELS: Record<FxDebt['status'], string> = {
    ACTIVE: 'Activa',
    PAID: 'Pagada',
    DEFAULTED: 'En mora',
}

/**
 * Get default rateSide for a movement type
 */
export function getDefaultRateSide(type: FxMovementType): RateSide {
    switch (type) {
        case 'COMPRA':
            return 'venta' // You buy FC, they sell to you
        case 'VENTA':
            return 'compra' // You sell FC, they buy from you
        case 'PAGO_DEUDA':
            return 'venta' // You need FC to pay, you buy at venta
        case 'TOMA_DEUDA':
        case 'DESEMBOLSO_DEUDA':
            return 'venta' // ValuaciÃ³n histÃ³rica de ingreso
        default:
            return 'compra' // Default for other types
    }
}
