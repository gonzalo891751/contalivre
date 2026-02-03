/**
 * Impuestos Module - Storage Layer
 *
 * CRUD operations for tax closures, notifications, and tax calculations.
 * Uses Dexie (IndexedDB) for persistence.
 */

import { db } from './db'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import type {
    TaxClosePeriod,
    TaxDueNotification,
    TaxRegime,
    IVATotals,
    IVAAlicuotaDetail,
    RetencionPercepcionRow,
    TaxObligationRecord,
    TaxPaymentLink,
    TaxObligationSummary,
    TaxType,
    TaxPaymentMethod,
    TaxSettlementObligation,
} from '../core/impuestos/types'
import { computeIVATotalsFromEntries } from '../core/impuestos/iva'
import { buildTaxSettlementEntryLines, computeTaxSettlementRemaining } from '../core/impuestos/settlements'
import {
    createDefaultTaxClosure,
    createDefaultNotification,
    getDefaultDueDate,
    generateTaxId,
    buildTaxNotificationKey,
    buildTaxObligationKey,
} from '../core/impuestos/types'
import { computeTaxObligationStatus, buildTaxObligationRecord } from '../core/impuestos/obligations'
import { createEntry, updateEntry } from './entries'
import { loadBienesSettings, resolveMappedAccountId, resolveAccountId } from './bienes'

// ========================================
// Account Resolution Helpers
// ========================================

const TAX_ACCOUNT_FALLBACKS: Record<string, { code: string; names: string[] }> = {
    ivaAFavor: { code: '1.1.03.06', names: ['IVA a favor', 'IVA Saldo a favor'] },
    ivaAPagar: { code: '2.1.03.04', names: ['IVA a pagar'] },
    iibbGasto: { code: '4.4.02', names: ['Impuesto Ingresos Brutos', 'IIBB', 'Ingresos Brutos'] },
    iibbAPagar: { code: '2.1.03.05', names: ['IIBB a pagar', 'Ingresos Brutos a pagar'] },
    monotributoGasto: { code: '4.4.01', names: ['Monotributo', 'Impuestos y tasas'] },
    monotributoAPagar: { code: '2.1.03.07', names: ['Monotributo a pagar'] },
    autonomosGasto: { code: '4.4.03', names: ['Aportes autonomos', 'Cargas sociales', 'Seguridad social', 'Aportes previsionales'] },
    autonomosAPagar: { code: '2.1.03.08', names: ['Autonomos a pagar', 'Aportes a pagar', 'Cargas sociales a pagar'] },
}

const TAX_LIABILITY_LABELS: Record<TaxType, string> = {
    IVA: 'IVA a pagar',
    IIBB: 'IIBB a pagar',
    RET_DEPOSITAR: 'Retenciones a depositar',
    PER_DEPOSITAR: 'Percepciones a depositar',
    AUTONOMOS: 'Autonomos a pagar',
    MONOTRIBUTO: 'Monotributo a pagar',
}

const TAX_CREDIT_LABELS: Partial<Record<TaxType, string>> = {
    IVA: 'IVA a favor',
}

const TAX_DISPLAY_LABELS: Record<TaxType, string> = {
    IVA: 'IVA',
    IIBB: 'IIBB',
    RET_DEPOSITAR: 'Retenciones',
    PER_DEPOSITAR: 'Percepciones',
    AUTONOMOS: 'Autonomos',
    MONOTRIBUTO: 'Monotributo',
}

const resolveTaxAccountId = (
    accounts: Account[],
    key: keyof typeof TAX_ACCOUNT_FALLBACKS
): string | null => {
    const fallback = TAX_ACCOUNT_FALLBACKS[key]
    return resolveAccountId(accounts, {
        code: fallback?.code,
        names: fallback?.names,
    })
}

export interface TaxPaymentSplitInput {
    accountId: string
    amount: number
}

export interface RegisterTaxPaymentInput {
    paidAt: string
    method: TaxPaymentMethod
    reference?: string
    amount: number
    splits: TaxPaymentSplitInput[]
    liabilityAccountId?: string
    obligationAccountId?: string
}

export interface TaxPaymentPreviewResult {
    entry?: Omit<JournalEntry, 'id'>
    error?: string
    missingAccountLabel?: string
    resolvedLiabilityAccountId?: string
    resolvedObligationAccountId?: string
}

const resolveTaxLiabilityAccountId = async (
    taxType: TaxType,
    accounts: Account[],
    overrideId?: string | null
): Promise<{ accountId: string | null; label: string }> => {
    const label = TAX_LIABILITY_LABELS[taxType] || 'Cuenta de impuesto'
    if (overrideId) {
        const direct = accounts.find(acc => acc.id === overrideId && !acc.isHeader)
        if (direct) {
            return { accountId: direct.id, label }
        }
    }

    const settings = await loadBienesSettings()

    switch (taxType) {
        case 'IVA':
            return { accountId: resolveTaxAccountId(accounts, 'ivaAPagar'), label }
        case 'IIBB':
            return { accountId: resolveTaxAccountId(accounts, 'iibbAPagar'), label }
        case 'MONOTRIBUTO':
            return { accountId: resolveTaxAccountId(accounts, 'monotributoAPagar'), label }
        case 'AUTONOMOS':
            return { accountId: resolveTaxAccountId(accounts, 'autonomosAPagar'), label }
        case 'RET_DEPOSITAR':
            return {
                accountId: resolveMappedAccountId(accounts, settings, 'retencionPracticada', 'retencionPracticada'),
                label,
            }
        case 'PER_DEPOSITAR':
            return {
                accountId: resolveMappedAccountId(accounts, settings, 'percepcionIVAPracticada', 'percepcionIVAPracticada'),
                label,
            }
        default:
            return { accountId: null, label }
    }
}

const resolveTaxCreditAccountId = async (
    taxType: TaxType,
    accounts: Account[],
    overrideId?: string | null
): Promise<{ accountId: string | null; label: string }> => {
    const label = TAX_CREDIT_LABELS[taxType] || 'Cuenta de credito fiscal'
    if (overrideId) {
        const direct = accounts.find(acc => acc.id === overrideId && !acc.isHeader)
        if (direct) {
            return { accountId: direct.id, label }
        }
    }

    switch (taxType) {
        case 'IVA':
            return { accountId: resolveTaxAccountId(accounts, 'ivaAFavor'), label }
        default:
            return { accountId: null, label }
    }
}

// ========================================
// Tax Closures CRUD
// ========================================

/**
 * Get a tax closure (Read Only)
 */
export async function getTaxClosure(
    month: string,
    regime: TaxRegime
): Promise<TaxClosePeriod | undefined> {
    return db.taxClosures.where({ month, regime }).first()
}

/**
 * Ensure a tax closure exists (Read/Write)
 */
export async function ensureTaxClosure(
    month: string,
    regime: TaxRegime
): Promise<TaxClosePeriod> {
    return db.transaction('rw', db.taxClosures, async () => {
        const existing = await db.taxClosures.where({ month, regime }).first()
        if (existing) return existing

        const newClosure = createDefaultTaxClosure(month, regime)
        await db.taxClosures.add(newClosure)
        return newClosure
    })
}

/**
 * Get or create a tax closure for a specific month and regime
 * @deprecated Use getTaxClosure (read) or ensureTaxClosure (write) instead
 */
export async function getOrCreateTaxClosure(
    month: string,
    regime: TaxRegime
): Promise<TaxClosePeriod> {
    return ensureTaxClosure(month, regime)
}

/**
 * Update a tax closure
 */
export async function updateTaxClosure(
    id: string,
    updates: Partial<Omit<TaxClosePeriod, 'id'>>
): Promise<TaxClosePeriod> {
    const existing = await db.taxClosures.get(id)
    if (!existing) {
        throw new Error('Tax closure not found')
    }

    const updated: TaxClosePeriod = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }

    await db.taxClosures.put(updated)
    return updated
}

/**
 * List all closures for a specific month
 */
export async function listClosuresByMonth(month: string): Promise<TaxClosePeriod[]> {
    return db.taxClosures.where({ month }).toArray()
}

/**
 * List all closures (sorted by month desc)
 */
export async function listAllTaxClosures(): Promise<TaxClosePeriod[]> {
    const closures = await db.taxClosures.toArray()
    return closures.sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * Get a specific tax closure by ID
 */
export async function getTaxClosureById(id: string): Promise<TaxClosePeriod | undefined> {
    return db.taxClosures.get(id)
}

// ========================================
// Tax Notifications CRUD
// ========================================

/**
 * Upsert notifications (create or update by month+obligation)
 */
export async function upsertNotifications(
    notifications: Omit<TaxDueNotification, 'id' | 'createdAt'>[]
): Promise<void> {
    for (const notif of notifications) {
        const normalizedKey = buildTaxNotificationKey(
            notif.obligation,
            notif.month,
            notif.action,
            notif.jurisdiction
        )
        const matches = await db.taxDueNotifications
            .filter(n => (
                (n.uniqueKey && n.uniqueKey === normalizedKey)
                || (!n.uniqueKey
                    && n.month === notif.month
                    && n.obligation === notif.obligation
                    && (n.action || 'PAGO') === (notif.action || 'PAGO')
                    && (n.jurisdiction || 'GENERAL') === (notif.jurisdiction || 'GENERAL'))
            ))
            .toArray()

        if (matches.length > 0) {
            const [existing, ...duplicates] = matches
            await db.taxDueNotifications.update(existing.id, {
                ...notif,
                uniqueKey: normalizedKey,
                updatedAt: new Date().toISOString(),
            })
            if (duplicates.length > 0) {
                await db.taxDueNotifications.bulkDelete(duplicates.map(d => d.id))
            }
        } else {
            const newNotif: TaxDueNotification = {
                ...notif,
                id: generateTaxId('taxnotif'),
                createdAt: new Date().toISOString(),
                uniqueKey: normalizedKey,
            }
            await db.taxDueNotifications.add(newNotif)
        }
    }
}

/**
 * List due notifications within a date range
 */
export async function listDueNotifications(options?: {
    from?: string
    to?: string
    unseenOnly?: boolean
}): Promise<TaxDueNotification[]> {
    let query = db.taxDueNotifications.toCollection()

    const results = await query.toArray()

    return results.filter(n => {
        if (options?.from && n.dueDate < options.from) return false
        if (options?.to && n.dueDate > options.to) return false
        if (options?.unseenOnly && n.seen) return false
        if (n.dismissed) return false
        return true
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/**
 * Mark a notification as seen
 */
export async function markNotificationSeen(id: string): Promise<void> {
    await db.taxDueNotifications.update(id, {
        seen: true,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Dismiss a notification
 */
export async function dismissNotification(id: string): Promise<void> {
    await db.taxDueNotifications.update(id, {
        dismissed: true,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Generate default notifications for a month
 */
export async function generateNotificationsForMonth(
    month: string,
    regime: TaxRegime,
    options?: {
        hasAutonomos?: boolean
        autonomosDueDay?: number
        includeIIBBLocal?: boolean
        includeIIBBCM?: boolean
        includeAgentDeposits?: boolean
        iibbJurisdiction?: string
    }
): Promise<void> {
    const notifications: Omit<TaxDueNotification, 'id' | 'createdAt'>[] = []
    const includeIIBBLocal = options?.includeIIBBLocal !== false
    const iibbJurisdiction = options?.iibbJurisdiction || 'CORRIENTES'

    if (regime === 'RI') {
        const ivaDueDate = getDefaultDueDate(month, 'IVA')
        notifications.push({
            ...createDefaultNotification('IVA', month, ivaDueDate, {
                action: 'PRESENTACION',
                title: 'Presentacion IVA',
                description: 'Declaracion Jurada Mensual F.2002',
                jurisdiction: 'NACIONAL',
            }),
        })
        notifications.push({
            ...createDefaultNotification('IVA', month, ivaDueDate, {
                action: 'PAGO',
                title: 'Pago IVA',
                description: `VEP IVA ${month}`,
                jurisdiction: 'NACIONAL',
            }),
        })

        if (options?.includeAgentDeposits) {
            notifications.push({
                ...createDefaultNotification('IVA', month, ivaDueDate, {
                    action: 'DEPOSITO',
                    title: 'Deposito Ret/Per IVA',
                    description: `Agentes IVA ${month}`,
                    jurisdiction: 'NACIONAL',
                }),
            })
        }

        if (includeIIBBLocal) {
            notifications.push({
                ...createDefaultNotification('IIBB_LOCAL', month, getDefaultDueDate(month, 'IIBB_LOCAL'), {
                    action: 'PAGO',
                    jurisdiction: iibbJurisdiction,
                }),
            })
        }

        if (options?.includeIIBBCM) {
            notifications.push({
                ...createDefaultNotification('IIBB_CM', month, getDefaultDueDate(month, 'IIBB_CM'), {
                    action: 'PAGO',
                    jurisdiction: 'CM',
                }),
            })
        }

        if (options?.hasAutonomos) {
            notifications.push({
                ...createDefaultNotification(
                    'AUTONOMOS',
                    month,
                    getDefaultDueDate(month, 'AUTONOMOS', options?.autonomosDueDay),
                    { action: 'PAGO', jurisdiction: 'NACIONAL' }
                ),
            })
        }
    } else {
        notifications.push({
            ...createDefaultNotification('MONOTRIBUTO', month, getDefaultDueDate(month, 'MONOTRIBUTO'), {
                action: 'PAGO',
                jurisdiction: 'NACIONAL',
            }),
        })

        if (includeIIBBLocal) {
            notifications.push({
                ...createDefaultNotification('IIBB_LOCAL', month, getDefaultDueDate(month, 'IIBB_LOCAL'), {
                    action: 'PAGO',
                    jurisdiction: iibbJurisdiction,
                }),
            })
        }
    }

    await upsertNotifications(notifications)
}

/**
 * Generate or remove AUTONOMOS notification based on settings
 */
export async function syncAutonomosNotification(
    month: string,
    enabled: boolean,
    dueDay?: number
): Promise<void> {
    if (enabled) {
        const notification = createDefaultNotification(
            'AUTONOMOS',
            month,
            getDefaultDueDate(month, 'AUTONOMOS', dueDay),
            { action: 'PAGO', jurisdiction: 'NACIONAL' }
        )
        await upsertNotifications([notification])
    } else {
        // Find and dismiss AUTONOMOS notification for this month
        const existing = await db.taxDueNotifications
            .where({ month, obligation: 'AUTONOMOS' })
            .first()
        if (existing) {
            await dismissNotification(existing.id)
        }
    }
}

// ========================================
// Tax Calculations from Journal Entries
// ========================================

/**
 * Get date range for a month (first day to last day)
 */
function getMonthDateRange(month: string): { start: string; end: string } {
    const [year, monthNum] = month.split('-').map(Number)
    const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { start, end }
}

function getTaxEntryPeriod(entry: JournalEntry): string | null {
    const meta = entry.metadata || {}
    const period = (meta.taxPeriod || meta.period || meta.meta?.period) as string | undefined
    if (period && typeof period === 'string') return period

    if (entry.sourceId) {
        const parts = entry.sourceId.split(':')
        if (parts.length >= 2 && /^\d{4}-\d{2}$/.test(parts[1])) {
            return parts[1]
        }
    }
    return null
}

function isTaxGeneratedEntry(entry: JournalEntry, month?: string): boolean {
    const meta = entry.metadata || {}
    const source = (meta.source || meta.meta?.source) as string | undefined
    const isTaxSource = source === 'tax' || source === 'impuestos' || entry.sourceModule === 'IMPUESTOS'
    if (!isTaxSource) return false
    if (!month) return true

    const period = getTaxEntryPeriod(entry)
    if (period) return period === month

    return entry.sourceId ? entry.sourceId.includes(month) : true
}

function matchesTaxRegime(entry: JournalEntry, regime: TaxRegime): boolean {
    const meta = entry.metadata || {}
    const entryRegime = (meta.regime || meta.meta?.regime) as string | undefined
    if (entryRegime) return entryRegime === regime
    return entry.sourceId ? entry.sourceId.includes(`:${regime}`) : true
}

/**
 * Calculate IVA DF/CF from journal entries for a month
 */
export async function calculateIVAFromEntries(month: string): Promise<IVATotals> {
    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const { start, end } = getMonthDateRange(month)

    // Resolve account IDs (mapped first, fallback to defaults)
    const ivaDFId = resolveMappedAccountId(accounts, settings, 'ivaDF', 'ivaDF')
    const ivaCFId = resolveMappedAccountId(accounts, settings, 'ivaCF', 'ivaCF')
    const retencionSufridaId = resolveMappedAccountId(accounts, settings, 'retencionSufrida', 'retencionSufrida')
    const percepcionIVASufridaId = resolveMappedAccountId(accounts, settings, 'percepcionIVASufrida', 'percepcionIVASufrida')

    // Get all entries for the month
    const entries = await db.entries
        .where('date')
        .between(start, end, true, true)
        .toArray()

    const filteredEntries = entries.filter(entry => !isTaxGeneratedEntry(entry, month))

    return computeIVATotalsFromEntries(filteredEntries, {
        ivaDFId,
        ivaCFId,
        retencionSufridaId,
        percepcionIVASufridaId,
    })
}

/**
 * Calculate IVA detail by alícuota from BienesMovements
 */
export async function calculateIVAByAlicuota(month: string): Promise<IVAAlicuotaDetail[]> {
    const { start, end } = getMonthDateRange(month)

    // Get movements for the month
    const movements = await db.bienesMovements
        .where('date')
        .between(start, end, true, true)
        .toArray()

    // Group by IVA rate
    const byRate: Record<number, { neto: number; df: number; cf: number }> = {}

    for (const mov of movements) {
        const rate = mov.ivaRate || 21
        if (!byRate[rate]) {
            byRate[rate] = { neto: 0, df: 0, cf: 0 }
        }

        const netoAmount = mov.subtotal || 0
        const ivaAmount = mov.ivaAmount || 0

        if (mov.type === 'SALE' && !mov.isDevolucion) {
            byRate[rate].neto += netoAmount
            byRate[rate].df += ivaAmount
        } else if (mov.type === 'PURCHASE' && !mov.isDevolucion && mov.discriminarIVA !== false) {
            byRate[rate].cf += ivaAmount
        } else if (mov.type === 'SALE' && mov.isDevolucion) {
            // Devolución de venta reduce DF
            byRate[rate].neto -= netoAmount
            byRate[rate].df -= ivaAmount
        } else if (mov.type === 'PURCHASE' && mov.isDevolucion && mov.discriminarIVA !== false) {
            // Devolución de compra reduce CF
            byRate[rate].cf -= ivaAmount
        }
    }

    // Convert to array
    const rateLabels: Record<number, string> = {
        21: 'General (21%)',
        10.5: 'Reducida (10.5%)',
        27: 'Diferencial (27%)',
        0: 'Exento (0%)',
    }

    return Object.entries(byRate)
        .map(([rateStr, data]) => {
            const rate = parseFloat(rateStr)
            return {
                alicuota: rate,
                label: rateLabels[rate] || `${rate}%`,
                netoGravado: data.neto,
                debitoFiscal: data.df,
                creditoFiscal: data.cf,
                saldoTecnico: data.df - data.cf,
            }
        })
        .sort((a, b) => b.alicuota - a.alicuota)
}

/**
 * Get retenciones y percepciones from BienesMovements and entries
 */
export async function getRetencionesPercepciones(month: string): Promise<RetencionPercepcionRow[]> {
    const { start, end } = getMonthDateRange(month)
    const rows: RetencionPercepcionRow[] = []

    // Get movements with taxes (percepciones)
    const movements = await db.bienesMovements
        .where('date')
        .between(start, end, true, true)
        .toArray()

    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const retencionSufridaId = resolveMappedAccountId(accounts, settings, 'retencionSufrida', 'retencionSufrida')
    const retencionPracticadaId = resolveMappedAccountId(accounts, settings, 'retencionPracticada', 'retencionPracticada')
    const percepcionIVASufridaId = resolveMappedAccountId(accounts, settings, 'percepcionIVASufrida', 'percepcionIVASufrida')
    const percepcionIVAPracticadaId = resolveMappedAccountId(accounts, settings, 'percepcionIVAPracticada', 'percepcionIVAPracticada')
    const percepcionIIBBSufridaId = resolveMappedAccountId(accounts, settings, 'percepcionIIBBSufrida', 'percepcionIIBBSufrida')

    const resolveDirectionFromMovement = (movType: string, paymentDirection?: string): RetencionPercepcionRow['direction'] | null => {
        if (movType === 'PURCHASE') return 'SUFRIDA'
        if (movType === 'SALE') return 'PRACTICADA'
        if (movType === 'PAYMENT') {
            if (paymentDirection === 'COBRO') return 'SUFRIDA'
            if (paymentDirection === 'PAGO') return 'PRACTICADA'
        }
        return null
    }

    for (const mov of movements) {
        const direction = resolveDirectionFromMovement(mov.type, mov.paymentDirection)
        const sign = mov.isDevolucion ? -1 : 1

        if (mov.taxes && mov.taxes.length > 0) {
            for (const tax of mov.taxes) {
                if (tax.kind !== 'PERCEPCION' && tax.kind !== 'RETENCION') continue
                if (!direction) continue
                const amount = (tax.amount || 0) * sign
                if (!amount) continue
                rows.push({
                    id: tax.id,
                    fecha: mov.date,
                    tipo: tax.kind === 'RETENCION' ? 'RETENCION' : 'PERCEPCION',
                    impuesto: tax.taxType,
                    comprobante: mov.reference,
                    origen: mov.counterparty || 'Comprobante',
                    base: mov.subtotal,
                    monto: amount,
                    estado: 'OK',
                    sourceMovementId: mov.id,
                    direction,
                })
            }
        }

        // Retenciones from paymentSplits (limited info)
        if (mov.paymentSplits) {
            for (const split of mov.paymentSplits) {
                const amount = split.amount || 0
                if (amount <= 0) continue

                const splitDirection = split.accountId === retencionSufridaId || split.accountId === percepcionIVASufridaId || split.accountId === percepcionIIBBSufridaId
                    ? 'SUFRIDA'
                    : split.accountId === retencionPracticadaId || split.accountId === percepcionIVAPracticadaId
                        ? 'PRACTICADA'
                        : direction

                if (split.accountId === retencionSufridaId || split.accountId === retencionPracticadaId) {
                    rows.push({
                        id: generateTaxId('ret'),
                        fecha: mov.date,
                        tipo: 'RETENCION',
                        impuesto: 'IVA',
                        comprobante: mov.reference,
                        origen: mov.counterparty || 'Pago/Cobro',
                        monto: amount,
                        estado: 'OK',
                        sourceMovementId: mov.id,
                        direction: splitDirection || undefined,
                    })
                }

                if (split.accountId === percepcionIVASufridaId || split.accountId === percepcionIVAPracticadaId) {
                    rows.push({
                        id: generateTaxId('perc'),
                        fecha: mov.date,
                        tipo: 'PERCEPCION',
                        impuesto: 'IVA',
                        comprobante: mov.reference,
                        origen: mov.counterparty || 'Pago/Cobro',
                        monto: amount,
                        estado: 'OK',
                        sourceMovementId: mov.id,
                        direction: splitDirection || undefined,
                    })
                }

                if (split.accountId === percepcionIIBBSufridaId) {
                    rows.push({
                        id: generateTaxId('perc'),
                        fecha: mov.date,
                        tipo: 'PERCEPCION',
                        impuesto: 'IIBB',
                        comprobante: mov.reference,
                        origen: mov.counterparty || 'Pago/Cobro',
                        monto: amount,
                        estado: 'OK',
                        sourceMovementId: mov.id,
                        direction: splitDirection || undefined,
                    })
                }
            }
        }
    }

    return rows.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Calculate suggested IIBB base (sales of the month)
 */
export async function calculateIIBBSuggestedBase(month: string): Promise<number> {
    const { start, end } = getMonthDateRange(month)

    const movements = await db.bienesMovements
        .where('date')
        .between(start, end, true, true)
        .toArray()

    let ventasNetas = 0
    for (const mov of movements) {
        if (mov.type === 'SALE' && !mov.isDevolucion) {
            ventasNetas += mov.subtotal || 0
        } else if (mov.type === 'SALE' && mov.isDevolucion) {
            ventasNetas -= mov.subtotal || 0
        }
    }

    return Math.max(0, ventasNetas)
}

// ========================================
// Journal Entry Generation
// ========================================

/**
 * Find existing entry by sourceModule and sourceId
 */
async function findExistingEntry(
    sourceModule: string,
    sourceId: string
): Promise<JournalEntry | undefined> {
    const entries = await db.entries.toArray()
    return entries.find(e => e.sourceModule === sourceModule && e.sourceId === sourceId)
}

export type TaxEntryType = 'iva' | 'iibb' | 'mt' | 'autonomos'

const TAX_ENTRY_CONFIG: Record<TaxEntryType, { sourceType: string; taxType: string; kind: string }> = {
    iva: { sourceType: 'iva_determination', taxType: 'IVA', kind: 'cierre' },
    iibb: { sourceType: 'iibb_determination', taxType: 'IIBB', kind: 'cierre' },
    mt: { sourceType: 'mt_determination', taxType: 'MONOTRIBUTO', kind: 'pago' },
    autonomos: { sourceType: 'autonomos_determination', taxType: 'AUTONOMOS', kind: 'pago' },
}

function buildTaxEntryMetadata(closure: TaxClosePeriod, type: TaxEntryType) {
    const config = TAX_ENTRY_CONFIG[type]
    return {
        closureId: closure.id,
        regime: closure.regime,
        source: 'tax',
        taxType: config.taxType,
        taxPeriod: closure.month,
        kind: config.kind,
        meta: {
            source: 'impuestos',
            tax: config.taxType,
            period: closure.month,
            kind: config.kind,
            regime: closure.regime,
        },
    }
}

// ========================================
// Tax Obligations & Payments
// ========================================

export async function getTaxObligationById(id: string): Promise<TaxObligationRecord | undefined> {
    return db.taxObligations.get(id)
}

export async function listTaxObligationsByPeriod(taxPeriod?: string): Promise<TaxObligationRecord[]> {
    if (taxPeriod) {
        return db.taxObligations.where({ taxPeriod }).toArray()
    }
    return db.taxObligations.toArray()
}

export async function listTaxPaymentsByObligation(obligationId: string): Promise<TaxPaymentLink[]> {
    const payments = await db.taxPayments.where({ obligationId }).toArray()
    if (payments.length === 0) return []

    const entries = await db.entries.bulkGet(payments.map(p => p.journalEntryId))
    const validPayments: TaxPaymentLink[] = []
    const orphanIds: string[] = []

    payments.forEach((payment, idx) => {
        if (entries[idx]) {
            validPayments.push(payment)
        } else {
            orphanIds.push(payment.id)
        }
    })

    if (orphanIds.length > 0) {
        await db.taxPayments.bulkDelete(orphanIds)
    }

    return validPayments.sort((a, b) => a.paidAt.localeCompare(b.paidAt))
}

export async function listTaxObligationsWithPayments(taxPeriod?: string): Promise<TaxObligationSummary[]> {
    const obligations = await listTaxObligationsByPeriod(taxPeriod)
    if (obligations.length === 0) return []

    const ids = obligations.map(o => o.id)
    const payments = await db.taxPayments.where('obligationId').anyOf(ids).toArray()
    const entries = await db.entries.bulkGet(payments.map(p => p.journalEntryId))

    const validPayments: TaxPaymentLink[] = []
    const orphanIds: string[] = []
    payments.forEach((payment, idx) => {
        if (entries[idx]) {
            validPayments.push(payment)
        } else {
            orphanIds.push(payment.id)
        }
    })

    if (orphanIds.length > 0) {
        await db.taxPayments.bulkDelete(orphanIds)
    }

    const paidByObligation = new Map<string, number>()
    for (const payment of validPayments) {
        paidByObligation.set(
            payment.obligationId,
            (paidByObligation.get(payment.obligationId) || 0) + (payment.amount || 0)
        )
    }

    const updates: Array<{ id: string; status: TaxObligationRecord['status']; updatedAt: string }> = []
    const now = new Date().toISOString()

    const summaries = obligations.map(obligation => {
        const amountPaid = paidByObligation.get(obligation.id) || 0
        const status = computeTaxObligationStatus(obligation.amountDue, amountPaid)
        if (obligation.status !== status) {
            updates.push({ id: obligation.id, status, updatedAt: now })
        }
        return {
            ...obligation,
            status,
            amountPaid,
            balance: Math.max(0, obligation.amountDue - amountPaid),
        }
    })

    if (updates.length > 0) {
        await db.transaction('rw', db.taxObligations, async () => {
            for (const update of updates) {
                await db.taxObligations.update(update.id, {
                    status: update.status,
                    updatedAt: update.updatedAt,
                })
            }
        })
    }

    return summaries.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export async function upsertTaxObligation(input: {
    taxType: TaxType
    taxPeriod: string
    jurisdiction?: string
    dueDate: string
    amountDue: number
}): Promise<TaxObligationRecord | null> {
    const jurisdiction = input.jurisdiction || 'GENERAL'
    const uniqueKey = buildTaxObligationKey(input.taxType, input.taxPeriod, jurisdiction)
    const existing = await db.taxObligations.where({ uniqueKey }).first()

    if (input.amountDue <= 0) {
        if (existing) {
            await db.taxObligations.update(existing.id, {
                amountDue: input.amountDue,
                dueDate: input.dueDate,
                status: 'NOT_APPLICABLE',
                updatedAt: new Date().toISOString(),
            })
            return { ...existing, amountDue: input.amountDue, dueDate: input.dueDate, status: 'NOT_APPLICABLE' }
        }
        return null
    }

    if (existing) {
        const payments = await listTaxPaymentsByObligation(existing.id)
        const amountPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
        const status = computeTaxObligationStatus(input.amountDue, amountPaid)
        const updated: TaxObligationRecord = {
            ...existing,
            amountDue: input.amountDue,
            dueDate: input.dueDate,
            status,
            updatedAt: new Date().toISOString(),
        }
        await db.taxObligations.put(updated)
        return updated
    }

    const draft = buildTaxObligationRecord({
        taxType: input.taxType,
        taxPeriod: input.taxPeriod,
        jurisdiction,
        dueDate: input.dueDate,
        amountDue: input.amountDue,
    })

    if (!draft) return null

    await db.taxObligations.add(draft)
    return draft
}

function getIIBBObligationKind(jurisdiction?: string) {
    return jurisdiction && jurisdiction.toUpperCase() === 'CM' ? 'IIBB_CM' : 'IIBB_LOCAL'
}

async function upsertObligationFromClosure(
    closure: TaxClosePeriod,
    type: TaxEntryType
): Promise<TaxObligationRecord | null> {
    const month = closure.month
    if (type === 'iva') {
        const amountDue = closure.ivaTotals?.saldo || 0
        return upsertTaxObligation({
            taxType: 'IVA',
            taxPeriod: month,
            jurisdiction: 'NACIONAL',
            dueDate: getDefaultDueDate(month, 'IVA'),
            amountDue,
        })
    }
    if (type === 'iibb') {
        const amountDue = closure.iibbTotals?.saldo || 0
        const jurisdiction = closure.iibbTotals?.jurisdiction || 'GENERAL'
        const obligationKind = getIIBBObligationKind(jurisdiction)
        return upsertTaxObligation({
            taxType: 'IIBB',
            taxPeriod: month,
            jurisdiction,
            dueDate: getDefaultDueDate(month, obligationKind),
            amountDue,
        })
    }
    if (type === 'mt') {
        const amountDue = closure.mtTotals?.montoMensual || 0
        return upsertTaxObligation({
            taxType: 'MONOTRIBUTO',
            taxPeriod: month,
            jurisdiction: 'NACIONAL',
            dueDate: getDefaultDueDate(month, 'MONOTRIBUTO'),
            amountDue,
        })
    }
    if (type === 'autonomos') {
        const amountDue = closure.autonomosSettings?.monthlyAmount || 0
        return upsertTaxObligation({
            taxType: 'AUTONOMOS',
            taxPeriod: month,
            jurisdiction: 'NACIONAL',
            dueDate: getDefaultDueDate(month, 'AUTONOMOS', closure.autonomosSettings?.dueDay),
            amountDue,
        })
    }
    return null
}

const PAYMENT_EPSILON = 0.01

function buildSettlementMemoBase(obligation: TaxSettlementObligation): string {
    return `${TAX_DISPLAY_LABELS[obligation.tax]} ${obligation.periodKey}`
}

async function buildTaxSettlementEntry(
    obligation: TaxSettlementObligation,
    input: RegisterTaxPaymentInput,
    accounts: Account[]
): Promise<TaxPaymentPreviewResult> {
    const amount = input.amount || 0
    if (amount <= 0) {
        return { error: 'El importe debe ser mayor a cero.' }
    }

    const overrideAccountId = input.obligationAccountId || input.liabilityAccountId
    const accountResult = obligation.direction === 'RECEIVABLE'
        ? await resolveTaxCreditAccountId(obligation.tax, accounts, overrideAccountId)
        : await resolveTaxLiabilityAccountId(obligation.tax, accounts, overrideAccountId)
    const { accountId: obligationAccountId, label } = accountResult

    if (!obligationAccountId) {
        const labelPrefix = obligation.direction === 'RECEIVABLE' ? 'credito' : 'pasivo'
        return {
            error: `Falta cuenta del ${labelPrefix} (${label}).`,
            missingAccountLabel: label,
        }
    }

    const validAccountIds = new Set(accounts.filter(acc => !acc.isHeader).map(acc => acc.id))
    const splits = input.splits.filter(s => validAccountIds.has(s.accountId) && s.amount > 0)
    if (splits.length === 0) {
        return { error: 'Debes cargar al menos un split de pago/cobro.' }
    }
    const hasInvalidSplit = input.splits.some(s => s.amount > 0 && !validAccountIds.has(s.accountId))
    if (hasInvalidSplit) {
        return { error: 'Selecciona cuentas validas para los splits de pago/cobro.' }
    }

    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0)
    if (Math.abs(splitTotal - amount) > PAYMENT_EPSILON) {
        return { error: 'La suma de los splits no coincide con el importe a registrar.' }
    }

    const memoBase = buildSettlementMemoBase(obligation)
    const actionLabel = obligation.direction === 'RECEIVABLE' ? 'Cobro' : 'Pago'
    const memo = obligation.jurisdiction && obligation.jurisdiction !== 'GENERAL'
        ? `${actionLabel} ${memoBase} (${obligation.jurisdiction})`
        : `${actionLabel} ${memoBase}`

    const lines = buildTaxSettlementEntryLines({
        direction: obligation.direction,
        amount,
        obligationAccountId,
        splits,
        method: input.method,
        memoBase,
    })

    const settlementKind = obligation.direction === 'RECEIVABLE' ? 'collection' : 'payment'
    const sourceType = obligation.direction === 'RECEIVABLE' ? 'tax_collection' : 'tax_payment'
    const entry: Omit<JournalEntry, 'id'> = {
        date: input.paidAt,
        memo,
        lines,
        sourceModule: 'IMPUESTOS',
        sourceType,
        sourceId: `taxset:${obligation.tax}:${obligation.periodKey}:${Date.now()}`,
        createdAt: new Date().toISOString(),
        metadata: {
            source: 'tax',
            taxType: obligation.tax,
            taxPeriod: obligation.periodKey,
            obligationId: obligation.sourceObligationId || obligation.id,
            paymentMethod: input.method,
            reference: input.reference,
            kind: settlementKind,
            direction: obligation.direction,
            periodKey: obligation.periodKey,
            sourceTaxEntryId: obligation.sourceTaxEntryId,
            meta: {
                source: 'impuestos',
                tax: obligation.tax,
                period: obligation.periodKey,
                kind: settlementKind === 'payment' ? 'pago' : 'cobro',
            },
        },
    }

    return {
        entry,
        resolvedLiabilityAccountId: obligationAccountId,
        resolvedObligationAccountId: obligationAccountId,
    }
}

async function buildTaxPaymentEntry(
    obligation: TaxObligationRecord,
    input: RegisterTaxPaymentInput,
    accounts: Account[]
): Promise<TaxPaymentPreviewResult> {
    const settlementObligation: TaxSettlementObligation = {
        id: obligation.id,
        tax: obligation.taxType,
        direction: 'PAYABLE',
        amountTotal: obligation.amountDue,
        amountSettled: 0,
        amountRemaining: obligation.amountDue,
        periodKey: obligation.taxPeriod,
        suggestedDueDate: obligation.dueDate,
        jurisdiction: obligation.jurisdiction,
        sourceObligationId: obligation.id,
        status: obligation.status,
    }

    return buildTaxSettlementEntry(settlementObligation, input, accounts)
}

export async function buildTaxPaymentEntryPreview(
    obligationId: string,
    input: RegisterTaxPaymentInput
): Promise<TaxPaymentPreviewResult> {
    const obligation = await getTaxObligationById(obligationId)
    if (!obligation) return { error: 'Obligacion no encontrada.' }

    const accounts = await db.accounts.toArray()
    return buildTaxPaymentEntry(obligation, input, accounts)
}

export async function buildTaxSettlementEntryPreview(
    obligation: TaxSettlementObligation,
    input: RegisterTaxPaymentInput
): Promise<TaxPaymentPreviewResult> {
    const accounts = await db.accounts.toArray()
    return buildTaxSettlementEntry(obligation, input, accounts)
}

export async function registerTaxPayment(
    obligationId: string,
    input: RegisterTaxPaymentInput
): Promise<{ entryId?: string; paymentId?: string; error?: string; missingAccountLabel?: string }> {
    const obligation = await getTaxObligationById(obligationId)
    if (!obligation) return { error: 'Obligacion no encontrada.' }

    const payments = await listTaxPaymentsByObligation(obligation.id)
    const alreadyPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const balance = obligation.amountDue - alreadyPaid
    if (input.amount <= 0) {
        return { error: 'El importe debe ser mayor a cero.' }
    }
    if (input.amount - balance > PAYMENT_EPSILON) {
        return { error: 'El importe supera el saldo pendiente.' }
    }

    const accounts = await db.accounts.toArray()
    const preview = await buildTaxPaymentEntry(obligation, input, accounts)
    if (preview.error || !preview.entry) {
        return { error: preview.error, missingAccountLabel: preview.missingAccountLabel }
    }

    try {
        const createdEntry = await createEntry(preview.entry)
        const paymentId = generateTaxId('taxpay')
        const payment: TaxPaymentLink = {
            id: paymentId,
            obligationId: obligation.id,
            journalEntryId: createdEntry.id,
            paidAt: input.paidAt,
            method: input.method,
            reference: input.reference,
            amount: input.amount,
            taxType: obligation.taxType,
            periodKey: obligation.taxPeriod,
            direction: 'PAYABLE',
            sourceTaxEntryId: (preview.entry?.metadata as { sourceTaxEntryId?: string } | undefined)?.sourceTaxEntryId,
            createdAt: new Date().toISOString(),
        }

        await db.taxPayments.add(payment)

        const allPayments = await listTaxPaymentsByObligation(obligation.id)
        const amountPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
        const status = computeTaxObligationStatus(obligation.amountDue, amountPaid)

        await db.taxObligations.update(obligation.id, {
            status,
            updatedAt: new Date().toISOString(),
        })

        return { entryId: createdEntry.id, paymentId }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Error al registrar el pago.' }
    }
}

function matchesSettlementPayment(payment: TaxPaymentLink, obligation: TaxSettlementObligation): boolean {
    const paymentDirection = payment.direction || 'PAYABLE'
    if (paymentDirection !== obligation.direction) return false

    const primaryId = obligation.sourceObligationId || obligation.id
    if (payment.obligationId === primaryId || payment.obligationId === obligation.id) return true

    if (payment.taxType && payment.periodKey) {
        if (payment.taxType === obligation.tax && payment.periodKey === obligation.periodKey) {
            return true
        }
    }

    if (payment.sourceTaxEntryId && obligation.sourceTaxEntryId) {
        return payment.sourceTaxEntryId === obligation.sourceTaxEntryId
    }

    return false
}

export async function listTaxPaymentsForSettlement(
    obligation: TaxSettlementObligation
): Promise<TaxPaymentLink[]> {
    const payments = await db.taxPayments.toArray()
    if (payments.length === 0) return []

    const entries = await db.entries.bulkGet(payments.map(p => p.journalEntryId))
    const validPayments: TaxPaymentLink[] = []

    payments.forEach((payment, idx) => {
        if (entries[idx] && matchesSettlementPayment(payment, obligation)) {
            validPayments.push(payment)
        }
    })

    return validPayments.sort((a, b) => a.paidAt.localeCompare(b.paidAt))
}

export async function registerTaxSettlement(
    obligation: TaxSettlementObligation,
    input: RegisterTaxPaymentInput
): Promise<{ entryId?: string; paymentId?: string; error?: string; missingAccountLabel?: string }> {
    if (input.amount <= 0) {
        return { error: 'El importe debe ser mayor a cero.' }
    }
    if (obligation.direction === 'RECEIVABLE' && obligation.tax === 'IVA' && !input.reference?.trim()) {
        return { error: 'La referencia es obligatoria para registrar un cobro de IVA a favor.' }
    }

    const payments = await listTaxPaymentsForSettlement(obligation)
    const alreadySettled = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const balance = computeTaxSettlementRemaining(obligation.amountTotal, alreadySettled)

    if (input.amount - balance > PAYMENT_EPSILON) {
        return { error: 'El importe supera el saldo pendiente.' }
    }

    const accounts = await db.accounts.toArray()
    const preview = await buildTaxSettlementEntry(obligation, input, accounts)
    if (preview.error || !preview.entry) {
        return { error: preview.error, missingAccountLabel: preview.missingAccountLabel }
    }

    try {
        const createdEntry = await createEntry(preview.entry)
        const paymentId = generateTaxId('taxpay')
        const payment: TaxPaymentLink = {
            id: paymentId,
            obligationId: obligation.sourceObligationId || obligation.id,
            journalEntryId: createdEntry.id,
            paidAt: input.paidAt,
            method: input.method,
            reference: input.reference,
            amount: input.amount,
            taxType: obligation.tax,
            periodKey: obligation.periodKey,
            direction: obligation.direction,
            sourceTaxEntryId: obligation.sourceTaxEntryId,
            createdAt: new Date().toISOString(),
        }

        await db.taxPayments.add(payment)

        if (obligation.direction === 'PAYABLE' && obligation.sourceObligationId) {
            const allPayments = await listTaxPaymentsByObligation(obligation.sourceObligationId)
            const amountPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
            const status = computeTaxObligationStatus(obligation.amountTotal, amountPaid)

            await db.taxObligations.update(obligation.sourceObligationId, {
                status,
                updatedAt: new Date().toISOString(),
            })
        }

        return { entryId: createdEntry.id, paymentId }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Error al registrar el pago.' }
    }
}

export async function syncAgentDepositObligations(
    month: string,
    rows: RetencionPercepcionRow[],
    jurisdiction?: string
): Promise<void> {
    if (!month) return

    const byKey = new Map<string, number>()
    for (const row of rows) {
        if (row.direction !== 'PRACTICADA') continue

        const isRet = row.tipo === 'RETENCION'
        const taxType: TaxType = isRet ? 'RET_DEPOSITAR' : 'PER_DEPOSITAR'
        const rowJurisdiction = row.impuesto === 'IVA'
            ? 'NACIONAL'
            : (jurisdiction || 'PROVINCIAL')

        const key = buildTaxObligationKey(taxType, month, rowJurisdiction)
        byKey.set(key, (byKey.get(key) || 0) + (row.monto || 0))
    }

    for (const [key, total] of byKey.entries()) {
        const [taxType, taxPeriod, rowJurisdiction] = key.split(':') as [TaxType, string, string]
        const dueDate = rowJurisdiction === 'NACIONAL'
            ? getDefaultDueDate(taxPeriod, 'IVA')
            : getDefaultDueDate(taxPeriod, 'IIBB_LOCAL')

        await upsertTaxObligation({
            taxType,
            taxPeriod,
            jurisdiction: rowJurisdiction,
            dueDate,
            amountDue: total,
        })
    }

    const existing = await db.taxObligations.where({ taxPeriod: month }).toArray()
    const toClear = existing.filter(o =>
        (o.taxType === 'RET_DEPOSITAR' || o.taxType === 'PER_DEPOSITAR')
        && !byKey.has(o.uniqueKey)
    )

    if (toClear.length > 0) {
        const now = new Date().toISOString()
        await db.transaction('rw', db.taxObligations, async () => {
            for (const ob of toClear) {
                await db.taxObligations.update(ob.id, {
                    amountDue: 0,
                    status: 'NOT_APPLICABLE',
                    updatedAt: now,
                })
            }
        })
    }
}

function buildTaxEntrySource(closure: TaxClosePeriod, type: TaxEntryType) {
    const sourceModule = 'IMPUESTOS'
    const sourceId = `${type}:${closure.month}:${closure.regime}`
    return { sourceModule, sourceId, sourceType: TAX_ENTRY_CONFIG[type].sourceType }
}

export async function saveTaxEntryFromPreview(
    closure: TaxClosePeriod,
    type: TaxEntryType,
    entry: Omit<JournalEntry, 'id'>
): Promise<{ entryId: string; error?: string }> {
    const { sourceModule, sourceId, sourceType } = buildTaxEntrySource(closure, type)
    const metadata = buildTaxEntryMetadata(closure, type)

    const entryData: Omit<JournalEntry, 'id'> = {
        ...entry,
        sourceModule,
        sourceId,
        sourceType,
        metadata: {
            ...(entry.metadata || {}),
            ...metadata,
            meta: {
                ...(entry.metadata?.meta || {}),
                ...(metadata as { meta?: Record<string, unknown> }).meta,
            },
        },
    }

    const existing = await findExistingEntry(sourceModule, sourceId)
    try {
        let entryId: string
        if (existing) {
            await updateEntry(existing.id, entryData)
            entryId = existing.id
        } else {
            const created = await createEntry(entryData)
            entryId = created.id
        }

        try {
            await upsertObligationFromClosure(closure, type)
        } catch (error) {
            console.error('Error syncing tax obligation:', error)
        }

        return { entryId }
    } catch (error) {
        return { entryId: '', error: error instanceof Error ? error.message : 'Error al guardar el asiento' }
    }
}

export async function buildTaxEntryPreview(
    closure: TaxClosePeriod,
    type: TaxEntryType
): Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }> {
    switch (type) {
        case 'iva':
            return buildIVAEntryData(closure)
        case 'iibb':
            return buildIIBBEntryData(closure)
        case 'mt':
            return buildMonotributoEntryData(closure)
        case 'autonomos':
            return buildAutonomosEntryData(closure)
        default:
            return { error: 'Tipo de asiento desconocido' }
    }
}

/**
 * Generate IVA determination journal entry
 */
async function buildIVAEntryData(
    closure: TaxClosePeriod
): Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }> {
    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const computedTotals = await calculateIVAFromEntries(closure.month)
    const {
        debitoFiscal,
        creditoFiscal,
        saldo,
        retencionesSufridas,
        percepcionesSufridas,
    } = computedTotals

    // Resolve accounts
    const ivaDFId = resolveMappedAccountId(accounts, settings, 'ivaDF', 'ivaDF')
    const ivaCFId = resolveMappedAccountId(accounts, settings, 'ivaCF', 'ivaCF')
    const ivaAPagarId = resolveTaxAccountId(accounts, 'ivaAPagar')
    const ivaAFavorId = resolveTaxAccountId(accounts, 'ivaAFavor')
    const retencionSufridaId = resolveMappedAccountId(accounts, settings, 'retencionSufrida', 'retencionSufrida')
    const percepcionIVASufridaId = resolveMappedAccountId(accounts, settings, 'percepcionIVASufrida', 'percepcionIVASufrida')

    const missing: string[] = []
    if (!ivaDFId) missing.push('IVA Debito Fiscal')
    if (creditoFiscal > 0 && !ivaCFId) missing.push('IVA Credito Fiscal')
    if (saldo > 0 && !ivaAPagarId) missing.push('IVA a pagar')
    if (saldo < 0 && !ivaAFavorId) missing.push('IVA a favor')
    if ((retencionesSufridas || 0) > 0 && !retencionSufridaId) missing.push('Retenciones IVA sufridas')
    if ((percepcionesSufridas || 0) > 0 && !percepcionIVASufridaId) missing.push('Percepciones IVA sufridas')

    if (missing.length > 0) {
        return { error: `Faltan cuentas: ${missing.join(', ')}` }
    }

    const lines: EntryLine[] = []

    // Debe: IVA DF (cancelamos el pasivo)
    if (debitoFiscal > 0 && ivaDFId) {
        lines.push({
            accountId: ivaDFId,
            debit: debitoFiscal,
            credit: 0,
            description: 'Cancelacion IVA Debito Fiscal',
        })
    }

    // Haber: IVA CF (cancelamos el activo)
    if (creditoFiscal > 0 && ivaCFId) {
        lines.push({
            accountId: ivaCFId,
            debit: 0,
            credit: creditoFiscal,
            description: 'Cancelacion IVA Credito Fiscal',
        })
    }

    // Haber: Retenciones/Percepciones sufridas (cancelamos activos)
    if ((retencionesSufridas || 0) > 0 && retencionSufridaId) {
        lines.push({
            accountId: retencionSufridaId,
            debit: 0,
            credit: retencionesSufridas || 0,
            description: 'Cancelacion retenciones sufridas',
        })
    }
    if ((percepcionesSufridas || 0) > 0 && percepcionIVASufridaId) {
        lines.push({
            accountId: percepcionIVASufridaId,
            debit: 0,
            credit: percepcionesSufridas || 0,
            description: 'Cancelacion percepciones IVA sufridas',
        })
    }

    // Saldo final
    if (saldo > 0 && ivaAPagarId) {
        // A pagar (pasivo)
        lines.push({
            accountId: ivaAPagarId,
            debit: 0,
            credit: saldo,
            description: 'IVA a pagar del periodo',
        })
    } else if (saldo < 0 && ivaAFavorId) {
        // A favor (activo)
        lines.push({
            accountId: ivaAFavorId,
            debit: Math.abs(saldo),
            credit: 0,
            description: 'IVA saldo a favor',
        })
    }

    if (lines.length === 0) {
        return { error: 'No hay importes para generar el asiento de IVA' }
    }

    // Validate balance
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { error: `Asiento desbalanceado: D=${totalDebit}, H=${totalCredit}` }
    }

    const { sourceModule, sourceId, sourceType } = buildTaxEntrySource(closure, 'iva')
    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`, // First day of the month
        memo: `Liquidacion IVA ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType,
        createdAt: new Date().toISOString(),
        metadata: buildTaxEntryMetadata(closure, 'iva'),
    }

    return { entry: entryData }
}

export async function generateIVAEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    const preview = await buildIVAEntryData(closure)
    if (preview.error || !preview.entry) {
        return { entryId: '', error: preview.error || 'No hay importes para generar el asiento de IVA' }
    }
    return saveTaxEntryFromPreview(closure, 'iva', preview.entry)
}

/**
 * Generate IIBB determination journal entry
 */
async function buildIIBBEntryData(
    closure: TaxClosePeriod
): Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }> {
    if (!closure.iibbTotals) {
        return { error: 'No hay totales de IIBB calculados' }
    }

    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const { impuestoDeterminado, deducciones, saldo } = closure.iibbTotals

    // Resolve accounts
    const iibbGastoId = resolveTaxAccountId(accounts, 'iibbGasto')
    const iibbAPagarId = resolveTaxAccountId(accounts, 'iibbAPagar')
    const percepcionIIBBSufridaId = resolveMappedAccountId(accounts, settings, 'percepcionIIBBSufrida', 'percepcionIIBBSufrida')

    const missing: string[] = []
    if (!iibbGastoId) missing.push('Gasto IIBB')
    if (saldo > 0 && !iibbAPagarId) missing.push('IIBB a pagar')

    if (missing.length > 0) {
        return { error: `Faltan cuentas: ${missing.join(', ')}` }
    }

    const lines: EntryLine[] = []

    // Debe: Gasto IIBB
    if (impuestoDeterminado > 0 && iibbGastoId) {
        lines.push({
            accountId: iibbGastoId,
            debit: impuestoDeterminado,
            credit: 0,
            description: 'Impuesto Ingresos Brutos del periodo',
        })
    }

    // Haber: Deducciones (percepciones sufridas)
    if (deducciones > 0 && percepcionIIBBSufridaId) {
        lines.push({
            accountId: percepcionIIBBSufridaId,
            debit: 0,
            credit: deducciones,
            description: 'Cancelacion percepciones IIBB sufridas',
        })
    }

    // Haber: IIBB a pagar
    if (saldo > 0 && iibbAPagarId) {
        lines.push({
            accountId: iibbAPagarId,
            debit: 0,
            credit: saldo,
            description: 'IIBB a pagar del periodo',
        })
    }

    // Validate balance
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { error: `Asiento desbalanceado: D=${totalDebit}, H=${totalCredit}` }
    }

    const { sourceModule, sourceId, sourceType } = buildTaxEntrySource(closure, 'iibb')
    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Provision IIBB ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType,
        createdAt: new Date().toISOString(),
        metadata: buildTaxEntryMetadata(closure, 'iibb'),
    }

    return { entry: entryData }
}

export async function generateIIBBEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    const preview = await buildIIBBEntryData(closure)
    if (preview.error || !preview.entry) {
        return { entryId: '', error: preview.error || 'No hay importes para generar el asiento de IIBB' }
    }
    return saveTaxEntryFromPreview(closure, 'iibb', preview.entry)
}

/**
 * Generate Monotributo journal entry
 */
async function buildMonotributoEntryData(
    closure: TaxClosePeriod
): Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }> {
    if (!closure.mtTotals) {
        return { error: 'No hay totales de Monotributo calculados' }
    }

    const accounts = await db.accounts.toArray()
    const { montoMensual } = closure.mtTotals

    if (montoMensual <= 0) {
        return { error: 'El monto de monotributo debe ser mayor a cero' }
    }

    // Resolve accounts
    const mtGastoId = resolveTaxAccountId(accounts, 'monotributoGasto')
    const mtAPagarId = resolveTaxAccountId(accounts, 'monotributoAPagar')

    const missing: string[] = []
    if (!mtGastoId) missing.push('Gasto Monotributo')
    if (!mtAPagarId) missing.push('Monotributo a pagar')

    if (missing.length > 0) {
        return { error: `Faltan cuentas: ${missing.join(', ')}` }
    }

    const lines: EntryLine[] = [
        {
            accountId: mtGastoId!,
            debit: montoMensual,
            credit: 0,
            description: 'Devengamiento Monotributo',
        },
        {
            accountId: mtAPagarId!,
            debit: 0,
            credit: montoMensual,
            description: 'Monotributo a pagar',
        },
    ]

    const { sourceModule, sourceId, sourceType } = buildTaxEntrySource(closure, 'mt')
    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Devengamiento Monotributo ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType,
        createdAt: new Date().toISOString(),
        metadata: {
            ...buildTaxEntryMetadata(closure, 'mt'),
            categoria: closure.mtTotals.categoria,
        },
    }

    return { entry: entryData }
}

export async function generateMonotributoEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    const preview = await buildMonotributoEntryData(closure)
    if (preview.error || !preview.entry) {
        return { entryId: '', error: preview.error || 'No hay importes para generar el asiento de Monotributo' }
    }
    return saveTaxEntryFromPreview(closure, 'mt', preview.entry)
}

/**
 * Generate Autónomos (aportes previsionales) journal entry
 * Only applicable for RI (Responsable Inscripto) regime
 */
async function buildAutonomosEntryData(
    closure: TaxClosePeriod
): Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }> {
    if (closure.regime !== 'RI') {
        return { error: 'Autonomos solo aplica para Responsables Inscriptos' }
    }

    if (!closure.autonomosSettings?.enabled) {
        return { error: 'Autonomos no esta habilitado para este periodo' }
    }

    const { monthlyAmount } = closure.autonomosSettings

    if (!monthlyAmount || monthlyAmount <= 0) {
        return { error: 'El monto de aportes autonomos debe ser mayor a cero' }
    }

    const accounts = await db.accounts.toArray()

    // Resolve accounts
    const autonomosGastoId = resolveTaxAccountId(accounts, 'autonomosGasto')
    const autonomosAPagarId = resolveTaxAccountId(accounts, 'autonomosAPagar')

    const missing: string[] = []
    if (!autonomosGastoId) missing.push('Gasto Autonomos (Aportes)')
    if (!autonomosAPagarId) missing.push('Autonomos a pagar')

    if (missing.length > 0) {
        return { error: `Faltan cuentas: ${missing.join(', ')}. Crealas en el Plan de Cuentas.` }
    }

    const lines: EntryLine[] = [
        {
            accountId: autonomosGastoId!,
            debit: monthlyAmount,
            credit: 0,
            description: 'Devengamiento aportes autonomos',
        },
        {
            accountId: autonomosAPagarId!,
            debit: 0,
            credit: monthlyAmount,
            description: 'Aportes autonomos a pagar',
        },
    ]

    const { sourceModule, sourceId, sourceType } = buildTaxEntrySource(closure, 'autonomos')
    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Devengamiento Aportes Autonomos ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType,
        createdAt: new Date().toISOString(),
        metadata: {
            ...buildTaxEntryMetadata(closure, 'autonomos'),
            categoria: closure.autonomosSettings.categoria,
        },
    }

    return { entry: entryData }
}

export async function generateAutonomosEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    const preview = await buildAutonomosEntryData(closure)
    if (preview.error || !preview.entry) {
        return { entryId: '', error: preview.error || 'No hay importes para generar el asiento de Autonomos' }
    }
    return saveTaxEntryFromPreview(closure, 'autonomos', preview.entry)
}

/**
 * Get generated entries for a closure (by sourceId pattern)
 */
export async function getGeneratedEntriesForClosure(
    month: string,
    regime: TaxRegime
): Promise<JournalEntry[]> {
    const entries = await db.entries.toArray()

    return entries.filter(entry =>
        isTaxGeneratedEntry(entry, month) && matchesTaxRegime(entry, regime)
    )
}
