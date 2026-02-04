/**
 * Inversiones Module - Types
 *
 * Types for the Investment module covering:
 * - Acciones/CEDEARs, Bonos, FCI, Plazos Fijos, Cripto, Rentas, VPP
 */

// ============================================
// Enums & Constants
// ============================================

/** Investment categories (rubros) */
export type InvestmentRubro =
    | 'ACCIONES'    // Acciones & CEDEARs
    | 'BONOS'       // Renta Fija (Bonos)
    | 'FCI'         // Fondos Comunes de Inversión
    | 'PLAZO_FIJO'  // Plazos Fijos
    | 'CRIPTO'      // Criptoactivos
    | 'RENTAS'      // Alquileres/Rentas
    | 'VPP'         // Inversiones Permanentes (Valor Patrimonial Proporcional)

/** Movement types */
export type InvestmentMovementType =
    // General
    | 'BUY'         // Compra / Suscripción
    | 'SELL'        // Venta / Rescate
    | 'INCOME'      // Cobro Renta / Dividendo / Cupón
    | 'VALUATION'   // Valuación (Cierre)
    | 'OPENING'     // Apertura / Saldos iniciales
    // Plazo Fijo specific
    | 'PF_CONSTITUTE'   // Constitución PF
    | 'PF_MATURITY'     // Vencimiento/Cobro PF
    | 'PF_RENEW'        // Renovación PF
    // VPP specific
    | 'VPP_ALTA'        // Alta participación
    | 'VPP_UPDATE'      // Ajuste por balance (variación PN)
    | 'VPP_DIVIDEND'    // Cobro dividendos

/** Costing methods */
export type CostingMethod = 'PPP' | 'FIFO' | 'UEPS'

/** Currency */
export type InvestmentCurrency = 'ARS' | 'USD' | 'EUR' | 'USDT'

/** Rubro labels for display */
export const RUBRO_LABELS: Record<InvestmentRubro, string> = {
    ACCIONES: 'Acciones & CEDEARs',
    BONOS: 'Renta Fija (Bonos)',
    FCI: 'Fondos Comunes',
    PLAZO_FIJO: 'Plazos Fijos',
    CRIPTO: 'Criptoactivos',
    RENTAS: 'Rentas / Alquileres',
    VPP: 'Inv. Permanentes (VPP)',
}

/** Rubro icons (Phosphor icons) */
export const RUBRO_ICONS: Record<InvestmentRubro, string> = {
    ACCIONES: 'ChartBar',
    BONOS: 'Scroll',
    FCI: 'ChartPieSlice',
    PLAZO_FIJO: 'Bank',
    CRIPTO: 'CurrencyBtc',
    RENTAS: 'HouseLine',
    VPP: 'Buildings',
}

/** Movement type labels */
export const MOVEMENT_TYPE_LABELS: Record<InvestmentMovementType, string> = {
    BUY: 'Compra / Suscripción',
    SELL: 'Venta / Rescate',
    INCOME: 'Cobro Renta / Dividendo',
    VALUATION: 'Valuación (Cierre)',
    OPENING: 'Apertura / Saldos Iniciales',
    PF_CONSTITUTE: 'Constitución PF',
    PF_MATURITY: 'Vencimiento / Cobro',
    PF_RENEW: 'Renovación',
    VPP_ALTA: 'Alta Participación',
    VPP_UPDATE: 'Ajuste por Balance',
    VPP_DIVIDEND: 'Cobro Dividendos',
}

/** Default account codes by rubro */
export const DEFAULT_ACCOUNT_CODES: Record<InvestmentRubro, { parent: string; prefix: string }> = {
    ACCIONES: { parent: '1.1.05', prefix: '1.1.05.04' },
    BONOS: { parent: '1.1.05', prefix: '1.1.05.05' },
    FCI: { parent: '1.1.05', prefix: '1.1.05.02' },
    PLAZO_FIJO: { parent: '1.1.05', prefix: '1.1.05.01' },
    CRIPTO: { parent: '1.1.05', prefix: '1.1.05.06' },
    RENTAS: { parent: '4.1.03', prefix: '4.1.03.01' }, // Income account
    VPP: { parent: '1.2.03', prefix: '1.2.03.01' },
}

/** Result accounts */
export const RESULT_ACCOUNTS = {
    RESULTADO_TENENCIA: { code: '4.1.06', names: ['Resultado por tenencia', 'Resultado tenencia inversiones'] },
    RESULTADO_VENTA: { code: '4.1.07', names: ['Resultado venta inversiones', 'Ganancia venta inversiones'] },
    INTERESES_GANADOS: { code: '4.1.02', names: ['Intereses ganados', 'Intereses bancarios'] },
    DIVIDENDOS_GANADOS: { code: '4.1.04', names: ['Dividendos ganados', 'Dividendos cobrados'] },
    RESULTADO_VPP: { code: '4.1.08', names: ['Resultado por VPP', 'Resultado participación permanente'] },
    ALQUILERES_GANADOS: { code: '4.1.03', names: ['Alquileres ganados', 'Rentas ganadas'] },
}

// ============================================
// Instrument Types
// ============================================

/** Investment instrument (financial asset) */
export interface InvestmentInstrument {
    id: string
    periodId: string

    // Basic info
    rubro: InvestmentRubro
    ticker: string              // e.g., "AAPL", "AL30D", "BTC"
    name: string                // Full name
    currency: InvestmentCurrency

    // Accounting
    accountId?: string          // Linked account in plan de cuentas
    accountCode?: string        // Account code (for display/fallback)

    // Costing
    costMethod: CostingMethod   // Default: PPP

    // Commissions (broker fees)
    comisionCompra?: number     // Fixed amount or percentage
    comisionCompraIsPercent?: boolean
    comisionVenta?: number
    comisionVentaIsPercent?: boolean
    ivaComision?: boolean       // Default: true (21% IVA on commissions)

    // VPP specific
    vppCompanyName?: string     // Nombre empresa participada
    vppPercentage?: number      // % participación

    // PF specific
    pfBankName?: string         // Entidad bancaria
    pfTna?: number              // TNA %
    pfDays?: number             // Plazo días

    // Renta specific
    rentaPropertyName?: string  // Inmueble
    rentaTenant?: string        // Inquilino

    // Timestamps
    createdAt: string
    updatedAt: string
}

// ============================================
// Movement Types
// ============================================

/** Investment movement (transaction) */
export interface InvestmentMovement {
    id: string
    periodId: string
    date: string                // YYYY-MM-DD

    // Classification
    rubro: InvestmentRubro
    type: InvestmentMovementType
    instrumentId?: string       // Optional for some types

    // Quantities & amounts
    quantity?: number           // Cantidad (acciones, bonos, cuotapartes, etc)
    price?: number              // Precio unitario
    amount: number              // Monto total operación

    // Commissions
    fees?: number               // Comisiones broker
    feesIva?: number            // IVA sobre comisiones

    // Counterparty
    contraAccountId: string     // Cuenta contrapartida (Banco, Caja, etc)

    // Plazo Fijo specific
    pfCapital?: number
    pfTna?: number
    pfTea?: number              // Calculada
    pfStartDate?: string
    pfEndDate?: string
    pfDays?: number
    pfInterestExpected?: number
    pfInterestActual?: number   // Real al cobrar

    // VPP specific
    vppPnBase?: number          // PN de la empresa al momento
    vppCarryingValue?: number   // Valor libro resultante
    vppPreviousValue?: number   // Valor anterior (para calcular diferencia)

    // Valuation specific
    valuationPrice?: number     // Precio/cotización de cierre
    valuationTc?: number        // Tipo cambio cierre (si USD)
    valuationPrevious?: number  // Valor anterior
    valuationCurrent?: number   // Valor actual
    valuationDiff?: number      // Diferencia (resultado tenencia)

    // Costing (calculated on SELL)
    costAssigned?: number       // Costo de baja (PPP/FIFO/UEPS)
    gainLoss?: number           // Ganancia/pérdida realizada

    // Journal entry link
    journalEntryId?: string     // ID del asiento generado
    journalEntryIds?: string[]  // Múltiples asientos si aplica

    // Notes & metadata
    notes?: string
    reference?: string          // Comprobante/referencia
    metadata?: Record<string, unknown>

    // Timestamps
    createdAt: string
    updatedAt: string
}

// ============================================
// Settings & Configuration
// ============================================

/** Investment module settings */
export interface InvestmentSettings {
    id: string
    periodId?: string

    // Default costing method
    defaultCostMethod: CostingMethod

    // Default IVA on commissions
    defaultIvaComision: boolean

    // Account mappings (overrides)
    accountMappings?: {
        resultadoTenencia?: string
        resultadoVenta?: string
        interesesGanados?: string
        dividendosGanados?: string
        resultadoVpp?: string
        alquileresGanados?: string
    }

    // Notification settings
    pfNotificationDays?: number // Days before PF maturity to notify (default: 7)

    // Last sync with Cierre/Valuación
    lastSyncDate?: string
    lastSyncStatus?: 'ok' | 'warning' | 'error'

    updatedAt: string
}

// ============================================
// Notifications
// ============================================

/** Investment notification type */
export type InvestmentNotificationType =
    | 'PF_MATURITY'     // Plazo fijo próximo a vencer
    | 'VALUATION_PENDING' // Valuación pendiente
    | 'VPP_UPDATE_NEEDED' // VPP necesita actualización de PN
    | 'SYNC_AVAILABLE'  // Nuevos datos en Cierre/Valuación

/** Investment notification */
export interface InvestmentNotification {
    id: string
    type: InvestmentNotificationType
    instrumentId?: string
    movementId?: string

    title: string
    description: string

    dueDate?: string        // Fecha relevante (vencimiento PF, etc)
    seen: boolean
    dismissed: boolean

    createdAt: string
}

// ============================================
// Computed Types (for UI)
// ============================================

/** Computed position for an instrument */
export interface InstrumentPosition {
    instrument: InvestmentInstrument

    // Current holdings
    currentQuantity: number
    averageCost: number         // PPP
    totalCost: number           // Costo total

    // Valuation
    currentPrice?: number       // Última cotización
    currentValue?: number       // Valor actual (qty * price)
    unrealizedGainLoss?: number // Resultado tenencia NR

    // Realized
    realizedGainLoss: number    // Resultado realizado

    // Income
    totalIncome: number         // Dividendos/rentas/intereses cobrados

    // Status
    hasValuation: boolean       // Tiene valuación del período
    lastValuationDate?: string
}

/** Rubro summary for dashboard */
export interface RubroSummary {
    rubro: InvestmentRubro
    label: string
    icon: string

    totalValue: number
    totalCost: number
    unrealizedGainLoss: number
    realizedGainLoss: number
    totalIncome: number

    instrumentCount: number
    positions: InstrumentPosition[]

    // Status
    status: 'ok' | 'warning' | 'error'
    statusMessage?: string
    pendingValuations: number
}

/** Journal entry preview line */
export interface JournalPreviewLine {
    accountId?: string
    accountCode: string
    accountName: string
    debit: number
    credit: number
    description?: string
}

/** Journal entry preview */
export interface JournalPreview {
    lines: JournalPreviewLine[]
    totalDebit: number
    totalCredit: number
    isBalanced: boolean
    memo: string
    date: string
    warning?: string
    error?: string
}

// ============================================
// Cost Layer (for FIFO/UEPS)
// ============================================

/** Cost layer for FIFO/UEPS costing */
export interface CostLayer {
    id: string
    instrumentId: string
    movementId: string          // Source BUY movement
    date: string
    quantity: number            // Remaining quantity
    originalQuantity: number    // Original quantity
    unitCost: number
    consumed: boolean           // Fully consumed
}

// ============================================
// Factory Functions
// ============================================

/** Generate unique ID */
export function generateInvestmentId(): string {
    return `inv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Generate instrument ID */
export function generateInstrumentId(): string {
    return `instr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Generate movement ID */
export function generateMovementId(): string {
    return `mov-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Generate notification ID */
export function generateNotificationId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Create default instrument */
export function createDefaultInstrument(rubro: InvestmentRubro, periodId: string): Omit<InvestmentInstrument, 'id' | 'createdAt' | 'updatedAt'> {
    return {
        periodId,
        rubro,
        ticker: '',
        name: '',
        currency: 'ARS',
        costMethod: 'PPP',
        ivaComision: true,
    }
}

/** Create default settings */
export function createDefaultSettings(): Omit<InvestmentSettings, 'id' | 'updatedAt'> {
    return {
        defaultCostMethod: 'PPP',
        defaultIvaComision: true,
        pfNotificationDays: 7,
    }
}

/** Calculate TEA from TNA */
export function calculateTEA(tna: number, days: number = 365): number {
    // TEA = (1 + TNA * days / 365) ^ (365 / days) - 1
    const periodRate = (tna / 100) * (days / 365)
    const tea = Math.pow(1 + periodRate, 365 / days) - 1
    return Math.round(tea * 10000) / 100 // Return as percentage with 2 decimals
}

/** Calculate PF interest */
export function calculatePFInterest(capital: number, tna: number, days: number): number {
    // Simple interest: I = C * TNA * days / 365
    return Math.round(capital * (tna / 100) * (days / 365) * 100) / 100
}

/** Get available movement types for a rubro */
export function getMovementTypesForRubro(rubro: InvestmentRubro): InvestmentMovementType[] {
    switch (rubro) {
        case 'ACCIONES':
        case 'BONOS':
        case 'FCI':
        case 'CRIPTO':
            return ['BUY', 'SELL', 'INCOME', 'VALUATION', 'OPENING']
        case 'PLAZO_FIJO':
            return ['PF_CONSTITUTE', 'PF_MATURITY', 'PF_RENEW', 'OPENING']
        case 'VPP':
            return ['VPP_ALTA', 'VPP_UPDATE', 'VPP_DIVIDEND', 'OPENING']
        case 'RENTAS':
            return ['INCOME', 'OPENING']
        default:
            return ['BUY', 'SELL', 'INCOME', 'VALUATION', 'OPENING']
    }
}
