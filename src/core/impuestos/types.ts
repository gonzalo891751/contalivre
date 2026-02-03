/**
 * Impuestos Module - Type Definitions
 *
 * Types for tax closing management, due date notifications, and tax calculations.
 * Supports IVA (Responsable Inscripto/Monotributo), IIBB Local/CM, and related taxes.
 */

/**
 * Tax regime types
 */
export type TaxRegime = 'RI' | 'MT'

/**
 * Tax closure status workflow
 */
export type TaxClosureStatus =
    | 'OPEN'            // Abierto (recalculable)
    | 'CLOSED'          // Cerrado (bloqueado)
    | 'DRAFT'           // Borrador inicial
    | 'REVIEWED'        // Revisado/conciliado
    | 'JOURNAL_POSTED'  // Asientos generados
    | 'DJ_SUBMITTED'    // DDJJ presentada
    | 'PAID'            // Pagado

/**
 * Tax obligation types for notifications
 */
export type TaxObligation = 'IVA' | 'IIBB_LOCAL' | 'IIBB_CM' | 'MONOTRIBUTO' | 'AUTONOMOS'

/**
 * Tax action for due notifications
 */
export type TaxAction = 'PRESENTACION' | 'PAGO' | 'DEPOSITO'

/**
 * Tax types for obligations and payments
 */
export type TaxType =
    | 'IVA'
    | 'IIBB'
    | 'RET_DEPOSITAR'
    | 'PER_DEPOSITAR'
    | 'AUTONOMOS'
    | 'MONOTRIBUTO'

/**
 * Payment methods for tax payments
 */
export type TaxPaymentMethod = 'VEP' | 'BOLETA' | 'TRANSFERENCIA' | 'EFECTIVO' | 'OTRO'

/**
 * Settlement direction (payments vs collections)
 */
export type TaxSettlementDirection = 'PAYABLE' | 'RECEIVABLE'

/**
 * Tax obligation status
 */
export type TaxObligationStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'NOT_APPLICABLE'

/**
 * Tax obligation record (persisted)
 */
export interface TaxObligationRecord {
    id: string
    uniqueKey: string
    taxType: TaxType
    taxPeriod: string
    jurisdiction: string
    dueDate: string
    amountDue: number
    status: TaxObligationStatus
    createdAt: string
    updatedAt: string
}

/**
 * Tax payment link (persisted)
 */
export interface TaxPaymentLink {
    id: string
    obligationId: string
    journalEntryId: string
    paidAt: string
    method: TaxPaymentMethod
    reference?: string
    amount: number
    taxType?: TaxType
    periodKey?: string
    direction?: TaxSettlementDirection
    sourceTaxEntryId?: string
    createdAt: string
}

/**
 * Tax obligation with computed payment info
 */
export interface TaxObligationSummary extends TaxObligationRecord {
    amountPaid: number
    balance: number
}

/**
 * Internal obligation model for settlements (pagos/cobros)
 */
export interface TaxSettlementObligation {
    id: string
    tax: TaxType
    direction: TaxSettlementDirection
    amountTotal: number
    amountSettled: number
    amountRemaining: number
    periodKey: string
    suggestedDueDate?: string
    jurisdiction?: string
    sourceTaxEntryId?: string
    sourceObligationId?: string
    status: TaxObligationStatus
}

/**
 * Steps in the tax closing checklist
 */
export interface TaxClosureSteps {
    operaciones: boolean      // Ventas y compras ok
    conciliacion: boolean     // Retenciones/percepciones conciliadas
    asientos: boolean         // Asientos generados
    presentacion: boolean     // DDJJ presentada
}

/**
 * IVA totals breakdown
 */
export interface IVATotals {
    debitoFiscal: number      // DF (ventas)
    creditoFiscal: number     // CF (compras)
    pagosACuenta: number      // Retenciones + percepciones sufridas
    saldo: number             // DF - CF - pagos a cuenta (positive = a pagar)
    retencionesSufridas?: number
    percepcionesSufridas?: number
}

/**
 * IIBB totals breakdown
 */
export interface IIBBTotals {
    base: number              // Base imponible
    alicuota: number          // % alícuota
    impuestoDeterminado: number // base * alicuota
    deducciones: number       // Retenciones + percepciones sufridas
    saldo: number             // Impuesto - deducciones
    jurisdiction?: string     // Jurisdiccion seleccionada
    activity?: string         // Actividad seleccionada
    sircreb?: number          // SIRCREB manual (pago a cuenta)
}

/**
 * IIBB Convenio Multilateral jurisdiction detail
 */
export interface IIBBCMJurisdiction {
    jurisdictionCode: string  // Código provincia (ej: "901" CABA)
    jurisdictionName: string  // Nombre provincia
    coeficiente: number       // % coeficiente unificado
    base: number              // Base imponible atribuida
    impuesto: number          // Impuesto calculado
}

/**
 * Monotributo totals
 */
export interface MonotributoTotals {
    categoria: string         // Categoría vigente (ej: "H")
    montoMensual: number      // Cuota mensual fija
}

/**
 * Autónomos settings (opt-in for RI regime)
 * Aportes previsionales mensuales para trabajadores independientes
 */
export interface AutonomosSettings {
    enabled: boolean          // Si aplica aportes autónomos (default: false)
    monthlyAmount: number     // Monto mensual de aportes
    dueDay: number            // Día del mes de vencimiento (default: basado en terminación CUIT)
    categoria?: string        // Categoría de autónomos (I, II, III, IV, V)
}

/**
 * Manual override row for retenciones/percepciones
 */
export interface TaxOverrideRow {
    id: string
    date: string              // ISO date
    tipo: 'RETENCION' | 'PERCEPCION'
    impuesto: 'IVA' | 'IIBB' | 'GANANCIAS' | 'SUSS' | 'OTRO'
    comprobante?: string      // Número de comprobante
    base?: number             // Base de cálculo
    monto: number             // Monto del impuesto
    origen?: string           // Descripción del origen
}

/**
 * Journal entry IDs by type
 */
export interface TaxJournalEntryIds {
    iva?: string
    iibb?: string
    mt?: string
    autonomos?: string
    pago?: string
}

/**
 * Tax closure period - main document for monthly tax management
 */
export interface TaxClosePeriod {
    id: string
    month: string             // YYYY-MM format
    regime: TaxRegime         // RI or MT
    status: TaxClosureStatus

    // IVA totals (for RI)
    ivaTotals?: IVATotals

    // IIBB totals
    iibbTotals?: IIBBTotals
    iibbCMJurisdictions?: IIBBCMJurisdiction[]

    // Monotributo totals (for MT)
    mtTotals?: MonotributoTotals

    // Autónomos settings (for RI, opt-in)
    autonomosSettings?: AutonomosSettings

    // Checklist steps
    steps: TaxClosureSteps

    // Manual overrides for retenciones/percepciones
    overrides?: TaxOverrideRow[]

    // Generated journal entries
    journalEntryIds?: TaxJournalEntryIds

    // Close snapshot
    closedAt?: string
    closedBy?: string
    snapshot?: TaxClosureSnapshot

    // Audit trail
    auditTrail?: {
        action: string
        timestamp: string
        user?: string
    }[]

    // Timestamps
    createdAt: string
    updatedAt: string
}

/**
 * Snapshot of key totals when closing a period
 */
export interface TaxClosureSnapshot {
    ivaTotals?: IVATotals
    iibbTotals?: IIBBTotals
    mtTotals?: MonotributoTotals
    autonomosSettings?: AutonomosSettings
    journalEntryIds?: TaxJournalEntryIds
    capturedAt: string
}

/**
 * Tax due date notification
 */
export interface TaxDueNotification {
    id: string
    obligation: TaxObligation
    month: string             // YYYY-MM format (periodo fiscal)
    dueDate: string           // ISO date of due date
    seen: boolean
    dismissed?: boolean       // User dismissed this notification
    action?: TaxAction
    jurisdiction?: string
    uniqueKey?: string

    // Display info
    title: string
    description: string
    actionLabel?: string      // "Ver VEP", "Presentar DDJJ", etc.
    actionHref?: string       // Internal or external link

    // Status tracking
    status: 'PENDING' | 'SUBMITTED' | 'PAID' | 'OVERDUE'

    // Timestamps
    createdAt: string
    updatedAt?: string
}

/**
 * IVA detail by alícuota for table display
 */
export interface IVAAlicuotaDetail {
    alicuota: number          // 21, 10.5, 0, etc.
    label: string             // "General (21%)", "Reducida (10.5%)", etc.
    netoGravado: number       // Base gravada
    debitoFiscal: number      // DF para esta alícuota
    creditoFiscal: number     // CF para esta alícuota
    saldoTecnico: number      // DF - CF
}

/**
 * Retencion/Percepcion row for table display
 */
export interface RetencionPercepcionRow {
    id: string
    fecha: string
    tipo: 'RETENCION' | 'PERCEPCION'
    impuesto: string          // IVA, IIBB, etc.
    comprobante?: string
    origen?: string           // Movimiento de origen
    base?: number
    monto: number
    estado: 'OK' | 'PENDIENTE' | 'ERROR'
    sourceMovementId?: string // ID del movimiento Bienes de origen
    isManual?: boolean        // True si es un override manual
    direction?: 'SUFRIDA' | 'PRACTICADA'
}

/**
 * Due date card data for UI
 */
export interface DueDateCard {
    id: string
    title: string
    description: string
    dueDate: string
    daysRemaining: number
    progress: number          // 0-100 for progress bar
    status: 'PENDING' | 'SUBMITTED' | 'PAID' | 'OVERDUE' | 'AL_DIA'
    statusLabel: string
    actionLabel?: string
    actionHref?: string
    obligation?: TaxObligation
    month?: string
    action?: TaxAction
    jurisdiction?: string
    uniqueKey?: string
}

/**
 * Generated journal entry for display
 */
export interface GeneratedEntryDisplay {
    id: string
    index: number
    concept: string
    date: string
    lines: {
        account: string
        debit: number
        credit: number
    }[]
    json: string
}

// ========================================
// Factory Functions
// ========================================

/**
 * Generate unique ID
 */
export function generateTaxId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build a stable unique key for tax notifications
 */
export function buildTaxNotificationKey(
    obligation: TaxObligation,
    month: string,
    action?: TaxAction,
    jurisdiction?: string
): string {
    return `${obligation}:${month}:${action || 'PAGO'}:${jurisdiction || 'GENERAL'}`
}

/**
 * Build a stable unique key for tax obligations
 */
export function buildTaxObligationKey(
    taxType: TaxType,
    taxPeriod: string,
    jurisdiction?: string
): string {
    return `${taxType}:${taxPeriod}:${jurisdiction || 'GENERAL'}`
}

/**
 * Create default tax closure for a month
 */
export function createDefaultTaxClosure(month: string, regime: TaxRegime): TaxClosePeriod {
    const now = new Date().toISOString()
    return {
        id: generateTaxId('taxclose'),
        month,
        regime,
        status: 'OPEN',
        steps: {
            operaciones: true,  // Default checked as per prototype
            conciliacion: false,
            asientos: false,
            presentacion: false,
        },
        createdAt: now,
        updatedAt: now,
    }
}

/**
 * Create default notification
 */
export function createDefaultNotification(
    obligation: TaxObligation,
    month: string,
    dueDate: string,
    options?: {
        action?: TaxAction
        jurisdiction?: string
        title?: string
        description?: string
        actionLabel?: string
        actionHref?: string
    }
): TaxDueNotification {
    const now = new Date().toISOString()
    const action: TaxAction = options?.action || (obligation === 'IVA' ? 'PRESENTACION' : 'PAGO')
    const titles: Record<TaxObligation, string> = {
        IVA: 'Presentacion IVA',
        IIBB_LOCAL: 'Pago IIBB Local',
        IIBB_CM: 'Pago IIBB CM',
        MONOTRIBUTO: 'Pago Monotributo',
        AUTONOMOS: 'Pago Autonomos',
    }
    const descriptions: Record<TaxObligation, string> = {
        IVA: 'Declaracion Jurada Mensual F.2002',
        IIBB_LOCAL: `Anticipo ${month}`,
        IIBB_CM: `CM SIFERE ${month}`,
        MONOTRIBUTO: `Cuota mensual ${month}`,
        AUTONOMOS: `Aportes previsionales ${month}`,
    }

    let title = options?.title || titles[obligation]
    if (!options?.title && obligation === 'IVA') {
        if (action === 'PAGO') title = 'Pago IVA'
        if (action === 'DEPOSITO') title = 'Deposito Ret/Per IVA'
    }

    return {
        id: generateTaxId('taxnotif'),
        obligation,
        month,
        dueDate,
        seen: false,
        title,
        description: options?.description || descriptions[obligation],
        action,
        jurisdiction: options?.jurisdiction,
        uniqueKey: buildTaxNotificationKey(obligation, month, action, options?.jurisdiction),
        actionLabel: options?.actionLabel,
        actionHref: options?.actionHref,
        status: 'PENDING',
        createdAt: now,
    }
}

/**
 * Calculate days remaining until due date
 */
export function calculateDaysRemaining(dueDate: string): number {
    const due = new Date(dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    const diff = due.getTime() - today.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * Format currency for display (Argentine Peso)
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

/**
 * Format month for display (Febrero 2026)
 */
export function formatMonth(month: string): string {
    const [year, monthNum] = month.split('-')
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${months[parseInt(monthNum) - 1]} ${year}`
}

/**
 * Get next month's due date based on obligation type
 */
export function getDefaultDueDate(month: string, obligation: TaxObligation, customDueDay?: number): string {
    const [year, monthNum] = month.split('-').map(Number)
    // Due dates are in the following month
    let dueMonth = monthNum + 1
    let dueYear = year
    if (dueMonth > 12) {
        dueMonth = 1
        dueYear++
    }

    const dueDays: Record<TaxObligation, number> = {
        IVA: 18,
        IIBB_LOCAL: 15,
        IIBB_CM: 15,
        MONOTRIBUTO: 20,
        AUTONOMOS: customDueDay || 15, // Default to 15, user can configure based on CUIT
    }

    const day = dueDays[obligation]
    return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
