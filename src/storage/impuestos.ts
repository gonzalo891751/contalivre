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
    TaxObligation,
    IVATotals,
    IVAAlicuotaDetail,
    RetencionPercepcionRow,
} from '../core/impuestos/types'
import { computeIVATotalsFromEntries } from '../core/impuestos/iva'
import {
    createDefaultTaxClosure,
    createDefaultNotification,
    getDefaultDueDate,
    generateTaxId,
} from '../core/impuestos/types'
import { createEntry, updateEntry } from './entries'

// ========================================
// Account Resolution Helpers
// ========================================

const ACCOUNT_FALLBACKS: Record<string, { code: string; names: string[] }> = {
    ivaCF: { code: '1.1.03.01', names: ['IVA Credito Fiscal'] },
    ivaDF: { code: '2.1.03.01', names: ['IVA Debito Fiscal'] },
    ivaAFavor: { code: '1.1.03.06', names: ['IVA a favor', 'IVA Saldo a favor'] },
    ivaAPagar: { code: '2.1.03.04', names: ['IVA a pagar'] },
    percepcionIVASufrida: { code: '1.1.03.08', names: ['Percepciones IVA de terceros'] },
    percepcionIVAPracticada: { code: '2.1.03.06', names: ['Percepciones IVA a terceros'] },
    percepcionIIBBSufrida: { code: '1.1.03.02', names: ['Anticipos de impuestos'] },
    retencionSufrida: { code: '1.1.03.07', names: ['Retenciones IVA de terceros'] },
    retencionPracticada: { code: '2.1.03.03', names: ['Retenciones a depositar'] },
    iibbGasto: { code: '4.4.02', names: ['Impuesto Ingresos Brutos', 'IIBB', 'Ingresos Brutos'] },
    iibbAPagar: { code: '2.1.03.05', names: ['IIBB a pagar', 'Ingresos Brutos a pagar'] },
    monotributoGasto: { code: '4.4.01', names: ['Monotributo', 'Impuestos y tasas'] },
    monotributoAPagar: { code: '2.1.03.07', names: ['Monotributo a pagar'] },
    autonomosGasto: { code: '4.4.03', names: ['Aportes autonomos', 'Cargas sociales', 'Seguridad social', 'Aportes previsionales'] },
    autonomosAPagar: { code: '2.1.03.08', names: ['Autonomos a pagar', 'Aportes a pagar', 'Cargas sociales a pagar'] },
    caja: { code: '1.1.01.01', names: ['Caja'] },
    banco: { code: '1.1.01.02', names: ['Bancos cuenta corriente', 'Banco cuenta corriente', 'Bancos'] },
}

const normalizeText = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const resolveAccountId = (
    accounts: Account[],
    options: { code?: string; names?: string[] }
): string | null => {
    if (options.code) {
        const byCode = accounts.find(a => a.code === options.code)
        if (byCode) return byCode.id
    }
    if (options.names && options.names.length > 0) {
        const targets = options.names.map(normalizeText)
        const byName = accounts.find(a => targets.includes(normalizeText(a.name)))
        if (byName) return byName.id
    }
    return null
}

const resolveFallbackAccountId = (
    accounts: Account[],
    key: keyof typeof ACCOUNT_FALLBACKS
): string | null => {
    const fallback = ACCOUNT_FALLBACKS[key]
    return resolveAccountId(accounts, {
        code: fallback?.code,
        names: fallback?.names,
    })
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
        const normalizedKey = notif.uniqueKey
            || `${notif.obligation}:${notif.month}:${notif.action || 'PAGO'}:${notif.jurisdiction || 'GENERAL'}`
        const existing = await db.taxDueNotifications
            .filter(n => (
                (n.uniqueKey && n.uniqueKey === normalizedKey)
                || (!n.uniqueKey
                    && n.month === notif.month
                    && n.obligation === notif.obligation
                    && (n.action || 'PAGO') === (notif.action || 'PAGO')
                    && (n.jurisdiction || 'GENERAL') === (notif.jurisdiction || 'GENERAL'))
            ))
            .first()

        if (existing) {
            await db.taxDueNotifications.update(existing.id, {
                ...notif,
                uniqueKey: normalizedKey,
                updatedAt: new Date().toISOString(),
            })
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
    const iibbJurisdiction = options?.iibbJurisdiction || 'LOCAL'

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

/**
 * Calculate IVA DF/CF from journal entries for a month
 */
export async function calculateIVAFromEntries(month: string): Promise<IVATotals> {
    const accounts = await db.accounts.toArray()
    const { start, end } = getMonthDateRange(month)

    // Resolve account IDs
    const ivaDFId = resolveFallbackAccountId(accounts, 'ivaDF')
    const ivaCFId = resolveFallbackAccountId(accounts, 'ivaCF')
    const retencionSufridaId = resolveFallbackAccountId(accounts, 'retencionSufrida')
    const percepcionIVASufridaId = resolveFallbackAccountId(accounts, 'percepcionIVASufrida')

    // Get all entries for the month
    const entries = await db.entries
        .where('date')
        .between(start, end, true, true)
        .toArray()

    return computeIVATotalsFromEntries(entries, {
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
    const retencionSufridaId = resolveFallbackAccountId(accounts, 'retencionSufrida')
    const retencionPracticadaId = resolveFallbackAccountId(accounts, 'retencionPracticada')
    const percepcionIVASufridaId = resolveFallbackAccountId(accounts, 'percepcionIVASufrida')
    const percepcionIVAPracticadaId = resolveFallbackAccountId(accounts, 'percepcionIVAPracticada')
    const percepcionIIBBSufridaId = resolveFallbackAccountId(accounts, 'percepcionIIBBSufrida')

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
                if (tax.kind === 'PERCEPCION' || tax.kind === 'RETENCION') {
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

/**
 * Generate IVA determination journal entry
 */
export async function generateIVAEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    const accounts = await db.accounts.toArray()
    const computedTotals = await calculateIVAFromEntries(closure.month)
    const {
        debitoFiscal,
        creditoFiscal,
        saldo,
        retencionesSufridas,
        percepcionesSufridas,
    } = computedTotals

    // Resolve accounts
    const ivaDFId = resolveFallbackAccountId(accounts, 'ivaDF')
    const ivaCFId = resolveFallbackAccountId(accounts, 'ivaCF')
    const ivaAPagarId = resolveFallbackAccountId(accounts, 'ivaAPagar')
    const ivaAFavorId = resolveFallbackAccountId(accounts, 'ivaAFavor')
    const retencionSufridaId = resolveFallbackAccountId(accounts, 'retencionSufrida')
    const percepcionIVASufridaId = resolveFallbackAccountId(accounts, 'percepcionIVASufrida')

    const missing: string[] = []
    if (!ivaDFId) missing.push('IVA Debito Fiscal')
    if (creditoFiscal > 0 && !ivaCFId) missing.push('IVA Credito Fiscal')
    if (saldo > 0 && !ivaAPagarId) missing.push('IVA a pagar')
    if (saldo < 0 && !ivaAFavorId) missing.push('IVA a favor')
    if ((retencionesSufridas || 0) > 0 && !retencionSufridaId) missing.push('Retenciones IVA sufridas')
    if ((percepcionesSufridas || 0) > 0 && !percepcionIVASufridaId) missing.push('Percepciones IVA sufridas')

    if (missing.length > 0) {
        return { entryId: '', error: `Faltan cuentas: ${missing.join(', ')}` }
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
        return { entryId: '', error: 'No hay importes para generar el asiento de IVA' }
    }

    // Validate balance
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { entryId: '', error: `Asiento desbalanceado: D=${totalDebit}, H=${totalCredit}` }
    }

    const sourceModule = 'IMPUESTOS'
    const sourceId = `iva:${closure.month}:${closure.regime}`

    // Check for existing entry (idempotency)
    const existing = await findExistingEntry(sourceModule, sourceId)

    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`, // First day of the month
        memo: `Liquidacion IVA ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType: 'iva_determination',
        createdAt: new Date().toISOString(),
        metadata: {
            closureId: closure.id,
            regime: closure.regime,
            meta: {
                source: 'impuestos',
                tax: 'IVA',
                period: closure.month,
                kind: 'cierre',
            },
        },
    }

    let entryId: string
    if (existing) {
        await updateEntry(existing.id, entryData)
        entryId = existing.id
    } else {
        const created = await createEntry(entryData)
        entryId = created.id
    }

    return { entryId }
}

/**
 * Generate IIBB determination journal entry
 */
export async function generateIIBBEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    if (!closure.iibbTotals) {
        return { entryId: '', error: 'No hay totales de IIBB calculados' }
    }

    const accounts = await db.accounts.toArray()
    const { impuestoDeterminado, deducciones, saldo } = closure.iibbTotals

    // Resolve accounts
    const iibbGastoId = resolveFallbackAccountId(accounts, 'iibbGasto')
    const iibbAPagarId = resolveFallbackAccountId(accounts, 'iibbAPagar')
    const percepcionIIBBSufridaId = resolveFallbackAccountId(accounts, 'percepcionIIBBSufrida')

    const missing: string[] = []
    if (!iibbGastoId) missing.push('Gasto IIBB')
    if (saldo > 0 && !iibbAPagarId) missing.push('IIBB a pagar')

    if (missing.length > 0) {
        return { entryId: '', error: `Faltan cuentas: ${missing.join(', ')}` }
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
        return { entryId: '', error: `Asiento desbalanceado: D=${totalDebit}, H=${totalCredit}` }
    }

    const sourceModule = 'IMPUESTOS'
    const sourceId = `iibb:${closure.month}:${closure.regime}`

    const existing = await findExistingEntry(sourceModule, sourceId)

    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Provision IIBB ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType: 'iibb_determination',
        createdAt: new Date().toISOString(),
        metadata: {
            closureId: closure.id,
            regime: closure.regime,
            meta: {
                source: 'impuestos',
                tax: 'IIBB',
                period: closure.month,
                kind: 'cierre',
            },
        },
    }

    let entryId: string
    if (existing) {
        await updateEntry(existing.id, entryData)
        entryId = existing.id
    } else {
        const created = await createEntry(entryData)
        entryId = created.id
    }

    return { entryId }
}

/**
 * Generate Monotributo journal entry
 */
export async function generateMonotributoEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    if (!closure.mtTotals) {
        return { entryId: '', error: 'No hay totales de Monotributo calculados' }
    }

    const accounts = await db.accounts.toArray()
    const { montoMensual } = closure.mtTotals

    if (montoMensual <= 0) {
        return { entryId: '', error: 'El monto de monotributo debe ser mayor a cero' }
    }

    // Resolve accounts
    const mtGastoId = resolveFallbackAccountId(accounts, 'monotributoGasto')
    const mtAPagarId = resolveFallbackAccountId(accounts, 'monotributoAPagar')

    const missing: string[] = []
    if (!mtGastoId) missing.push('Gasto Monotributo')
    if (!mtAPagarId) missing.push('Monotributo a pagar')

    if (missing.length > 0) {
        return { entryId: '', error: `Faltan cuentas: ${missing.join(', ')}` }
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

    const sourceModule = 'IMPUESTOS'
    const sourceId = `mt:${closure.month}:${closure.regime}`

    const existing = await findExistingEntry(sourceModule, sourceId)

    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Devengamiento Monotributo ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType: 'mt_determination',
        createdAt: new Date().toISOString(),
        metadata: {
            closureId: closure.id,
            categoria: closure.mtTotals.categoria,
            meta: {
                source: 'impuestos',
                tax: 'MONOTRIBUTO',
                period: closure.month,
                kind: 'pago',
            },
        },
    }

    let entryId: string
    if (existing) {
        await updateEntry(existing.id, entryData)
        entryId = existing.id
    } else {
        const created = await createEntry(entryData)
        entryId = created.id
    }

    return { entryId }
}

/**
 * Generate Autónomos (aportes previsionales) journal entry
 * Only applicable for RI (Responsable Inscripto) regime
 */
export async function generateAutonomosEntry(
    closure: TaxClosePeriod
): Promise<{ entryId: string; error?: string }> {
    if (closure.regime !== 'RI') {
        return { entryId: '', error: 'Autonomos solo aplica para Responsables Inscriptos' }
    }

    if (!closure.autonomosSettings?.enabled) {
        return { entryId: '', error: 'Autonomos no esta habilitado para este periodo' }
    }

    const { monthlyAmount } = closure.autonomosSettings

    if (!monthlyAmount || monthlyAmount <= 0) {
        return { entryId: '', error: 'El monto de aportes autonomos debe ser mayor a cero' }
    }

    const accounts = await db.accounts.toArray()

    // Resolve accounts
    const autonomosGastoId = resolveFallbackAccountId(accounts, 'autonomosGasto')
    const autonomosAPagarId = resolveFallbackAccountId(accounts, 'autonomosAPagar')

    const missing: string[] = []
    if (!autonomosGastoId) missing.push('Gasto Autonomos (Aportes)')
    if (!autonomosAPagarId) missing.push('Autonomos a pagar')

    if (missing.length > 0) {
        return { entryId: '', error: `Faltan cuentas: ${missing.join(', ')}. Crealas en el Plan de Cuentas.` }
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

    const sourceModule = 'IMPUESTOS'
    const sourceId = `autonomos:${closure.month}:${closure.regime}`

    const existing = await findExistingEntry(sourceModule, sourceId)

    const entryData: Omit<JournalEntry, 'id'> = {
        date: `${closure.month}-01`,
        memo: `Devengamiento Aportes Autonomos ${closure.month}`,
        lines,
        sourceModule,
        sourceId,
        sourceType: 'autonomos_determination',
        createdAt: new Date().toISOString(),
        metadata: {
            closureId: closure.id,
            categoria: closure.autonomosSettings.categoria,
            meta: {
                source: 'impuestos',
                tax: 'AUTONOMOS',
                period: closure.month,
                kind: 'pago',
            },
        },
    }

    let entryId: string
    if (existing) {
        await updateEntry(existing.id, entryData)
        entryId = existing.id
    } else {
        const created = await createEntry(entryData)
        entryId = created.id
    }

    return { entryId }
}

/**
 * Get generated entries for a closure (by sourceId pattern)
 */
export async function getGeneratedEntriesForClosure(
    month: string,
    regime: TaxRegime
): Promise<JournalEntry[]> {
    const entries = await db.entries.toArray()
    const prefix = `${month}:${regime}`

    return entries.filter(e =>
        e.sourceModule === 'IMPUESTOS' &&
        e.sourceId?.includes(prefix)
    )
}
