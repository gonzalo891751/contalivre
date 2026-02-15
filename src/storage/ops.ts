/**
 * ops.ts — Storage helpers for "Gastos y Servicios" module
 *
 * All expense vouchers and payments are stored as JournalEntry in db.entries
 * with sourceModule='ops'. No new Dexie tables required.
 *
 * Conventions:
 *   sourceModule: 'ops'
 *   sourceType: 'vendor_invoice' | 'payment'
 *   metadata: structured per type (see interfaces below)
 */

import { db } from './db'
import { createEntry, deleteEntry } from './entries'
import { findOrCreateChildAccountByName } from './accounts'
import { ACCOUNT_FALLBACKS, resolveAccountId } from './bienes'
import type { JournalEntry, EntryLine, Account } from '../core/models'
import type { TaxLine } from '../core/inventario/types'

// ─── Constants ───────────────────────────────────────────────
export const OPS_MODULE = 'ops'
const ACREEDORES_CODE = '2.1.06.01'

export type DocType = 'FC' | 'NC' | 'ND'
export type DocLetter = 'A' | 'B' | 'C'

// ─── Types ───────────────────────────────────────────────────

export interface ExpenseConceptLine {
    accountId: string
    description: string
    amount: number
}

export interface ExpenseVoucherData {
    date: string
    counterpartyName: string // empty string = genérico (sin tercero)
    docType: DocType
    docLetter: DocLetter
    docNumber: string
    paymentCondition: 'CONTADO' | 'CTA_CTE' | 'DOCUMENTADO'
    termDays?: number
    dueDate?: string
    concepts: ExpenseConceptLine[]
    discriminateVat: boolean
    vatRate: number
    taxes: TaxLine[] // percepciones only (in voucher context)
    paymentSplits?: Array<{ accountId: string; amount: number }>
    memo?: string
}

export interface ExpensePaymentData {
    date: string
    counterpartyName: string
    voucherId: string
    amount: number
    paymentSplits: Array<{ accountId: string; amount: number }>
    retentions: TaxLine[]
    memo?: string
}

/** Computed status for a voucher */
export type VoucherStatus = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO'

export interface VoucherWithStatus {
    entry: JournalEntry
    status: VoucherStatus
    totalPaid: number
    remaining: number
}

// ─── Helpers ─────────────────────────────────────────────────

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

export function computeVoucherTotals(data: {
    concepts: ExpenseConceptLine[]
    discriminateVat: boolean
    vatRate: number
    taxes: TaxLine[]
}) {
    const net = data.concepts.reduce((sum, c) => sum + c.amount, 0)
    const vat = data.discriminateVat ? round2(net * (data.vatRate / 100)) : 0
    const taxesTotal = data.taxes.reduce((sum, t) => sum + t.amount, 0)
    const total = round2(net + vat + taxesTotal)
    return { net: round2(net), vat, taxes: taxesTotal, total }
}

/** Format doc label from type + letter (e.g. "FC A", "NC B") */
export function formatDocLabel(meta: Record<string, unknown>): string {
    const doc = meta?.doc as Record<string, unknown> | undefined
    if (!doc) return 'FC A'
    // New format: docType + docLetter
    if (doc.docType && doc.docLetter) return `${doc.docType} ${doc.docLetter}`
    // Legacy format: type='FC_A'
    if (typeof doc.type === 'string') return doc.type.replace('_', ' ')
    return 'FC A'
}

/**
 * Resolve tax line account for expense (purchase-side).
 * Simplified version that doesn't depend on BienesSettings.
 */
function resolveTaxAccountForExpense(
    accounts: Account[],
    tax: TaxLine,
): string | null {
    if (tax.accountId) {
        const direct = accounts.find(a => a.id === tax.accountId || a.code === tax.accountId)
        if (direct) return direct.id
    }

    if (tax.kind === 'PERCEPCION') {
        if (tax.taxType === 'IVA') {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.percepcionIVASufrida)
        }
        if (tax.taxType === 'IIBB') {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.percepcionIIBBSufrida)
        }
        return resolveAccountId(accounts, ACCOUNT_FALLBACKS.percepcionIIBBSufrida)
    }

    if (tax.kind === 'RETENCION') {
        return resolveAccountId(accounts, ACCOUNT_FALLBACKS.retencionSufrida)
    }

    return null
}

/**
 * Resolve retention account for payments (we withhold and owe deposit).
 * Retenciones practicadas → pasivo "Retenciones a depositar"
 */
function resolveRetentionAccountForPayment(
    accounts: Account[],
    tax: TaxLine,
): string | null {
    if (tax.accountId) {
        const direct = accounts.find(a => a.id === tax.accountId || a.code === tax.accountId)
        if (direct) return direct.id
    }
    return resolveAccountId(accounts, ACCOUNT_FALLBACKS.retencionPracticada)
}

/**
 * Resolve the acreedores account: either a child subcuenta if counterpartyName
 * is provided, or the parent account (2.1.06.01) for "genérico".
 */
async function resolveAcreedoresAccount(
    counterpartyName: string,
): Promise<string> {
    if (!counterpartyName.trim()) {
        // Genérico: use parent account directly
        const parent = await db.accounts.where('code').equals(ACREEDORES_CODE).first()
        if (!parent) throw new Error(`Cuenta "${ACREEDORES_CODE}" no encontrada`)
        return parent.id
    }
    return findOrCreateChildAccountByName(ACREEDORES_CODE, counterpartyName)
}

// ─── CRUD: Expense Voucher ───────────────────────────────────

export async function createExpenseVoucher(data: ExpenseVoucherData): Promise<JournalEntry> {
    const accounts = await db.accounts.toArray()
    const totals = computeVoucherTotals(data)

    // Resolve counterparty account (subcuenta or parent for genérico)
    const counterpartyAccountId = await resolveAcreedoresAccount(data.counterpartyName)

    // Build journal lines
    const lines: EntryLine[] = []

    // Debe: expense accounts (one per concept line)
    for (const concept of data.concepts) {
        if (concept.amount > 0) {
            lines.push({
                accountId: concept.accountId,
                debit: round2(concept.amount),
                credit: 0,
                description: concept.description || 'Gasto',
            })
        }
    }

    // If IVA IS discriminated:
    if (totals.vat > 0 && data.discriminateVat) {
        const ivaCFId = resolveAccountId(accounts, ACCOUNT_FALLBACKS.ivaCF)
        if (ivaCFId) {
            lines.push({
                accountId: ivaCFId,
                debit: totals.vat,
                credit: 0,
                description: `IVA credito fiscal ${data.vatRate}%`,
            })
        }
    }

    // Debe: percepciones sufridas
    for (const tax of data.taxes) {
        if (tax.amount > 0) {
            const taxAccountId = resolveTaxAccountForExpense(accounts, tax)
            if (taxAccountId) {
                lines.push({
                    accountId: taxAccountId,
                    debit: round2(tax.amount),
                    credit: 0,
                    description: `Percepcion ${tax.taxType} sufrida`,
                })
            }
        }
    }

    // Haber: depends on payment condition
    if (data.paymentCondition === 'CONTADO' && data.paymentSplits && data.paymentSplits.length > 0) {
        for (const split of data.paymentSplits) {
            lines.push({
                accountId: split.accountId,
                debit: 0,
                credit: round2(split.amount),
                description: 'Pago contado',
            })
        }
    } else {
        const label = data.counterpartyName.trim()
            ? `Acreedor - ${data.counterpartyName}`
            : 'Acreedores Varios'
        lines.push({
            accountId: counterpartyAccountId,
            debit: 0,
            credit: totals.total,
            description: label,
        })
    }

    // Compute dueDate from termDays if not explicitly set
    let dueDate = data.dueDate
    if (!dueDate && data.termDays && data.termDays > 0) {
        const d = new Date(data.date + 'T12:00:00')
        d.setDate(d.getDate() + data.termDays)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        dueDate = `${y}-${m}-${day}`
    }

    const docLabel = `${data.docType} ${data.docLetter}`
    const cpName = data.counterpartyName.trim() || 'Genérico'
    const memo = data.memo || `${docLabel} - ${cpName}${data.docNumber ? ` #${data.docNumber}` : ''}`

    const entry = await createEntry({
        date: data.date,
        memo,
        lines,
        sourceModule: OPS_MODULE,
        sourceType: 'vendor_invoice',
        metadata: {
            counterparty: { name: data.counterpartyName.trim(), accountId: counterpartyAccountId },
            doc: { docType: data.docType, docLetter: data.docLetter, number: data.docNumber },
            paymentCondition: data.paymentCondition,
            dueDate,
            termDays: data.termDays,
            concepts: data.concepts,
            totals,
            vatRate: data.vatRate,
            discriminateVat: data.discriminateVat,
            taxes: data.taxes,
        },
    })

    return entry
}

// ─── CRUD: Expense Payment ──────────────────────────────────

export async function createExpensePayment(data: ExpensePaymentData): Promise<JournalEntry> {
    const accounts = await db.accounts.toArray()

    // Resolve counterparty account
    const counterpartyAccountId = await resolveAcreedoresAccount(data.counterpartyName)

    const lines: EntryLine[] = []

    // Debe: subcuenta del tercero (Acreedores)
    const debitLabel = data.counterpartyName.trim()
        ? `Pago a ${data.counterpartyName}`
        : 'Pago Acreedores Varios'
    lines.push({
        accountId: counterpartyAccountId,
        debit: round2(data.amount),
        credit: 0,
        description: debitLabel,
    })

    // Haber: Caja/Banco per splits
    for (const split of data.paymentSplits) {
        if (split.amount > 0) {
            lines.push({
                accountId: split.accountId,
                debit: 0,
                credit: round2(split.amount),
                description: 'Pago efectivo/banco',
            })
        }
    }

    // Haber: Retenciones a depositar (pasivo)
    for (const ret of data.retentions) {
        if (ret.amount > 0) {
            const retAccountId = resolveRetentionAccountForPayment(accounts, ret)
            if (retAccountId) {
                lines.push({
                    accountId: retAccountId,
                    debit: 0,
                    credit: round2(ret.amount),
                    description: `Retencion ${ret.taxType} a depositar`,
                })
            }
        }
    }

    const cpName = data.counterpartyName.trim() || 'Acreedores Varios'
    const memo = data.memo || `Pago a ${cpName}`

    const entry = await createEntry({
        date: data.date,
        memo,
        lines,
        sourceModule: OPS_MODULE,
        sourceType: 'payment',
        metadata: {
            counterparty: { name: data.counterpartyName, accountId: counterpartyAccountId },
            applyTo: { entryId: data.voucherId, amount: data.amount },
            retentions: data.retentions,
        },
    })

    return entry
}

// ─── Queries ─────────────────────────────────────────────────

/** Get all expense vouchers (sourceModule='ops', sourceType='vendor_invoice') */
export async function getExpenseVouchers(): Promise<JournalEntry[]> {
    const all = await db.entries
        .where('sourceModule')
        .equals(OPS_MODULE)
        .toArray()
    return all
        .filter(e => e.sourceType === 'vendor_invoice')
        .sort((a, b) => b.date.localeCompare(a.date))
}

/** Get all expense payments */
export async function getExpensePayments(): Promise<JournalEntry[]> {
    const all = await db.entries
        .where('sourceModule')
        .equals(OPS_MODULE)
        .toArray()
    return all
        .filter(e => e.sourceType === 'payment')
        .sort((a, b) => b.date.localeCompare(a.date))
}

/** Get payments linked to a specific voucher */
export async function getPaymentsForVoucher(voucherId: string): Promise<JournalEntry[]> {
    const payments = await getExpensePayments()
    return payments.filter(p => p.metadata?.applyTo?.entryId === voucherId)
}

/** Compute status for a single voucher given its payments */
export function computeVoucherStatus(
    voucher: JournalEntry,
    payments: JournalEntry[],
): VoucherWithStatus {
    const total = voucher.metadata?.totals?.total || 0
    const totalPaid = payments
        .filter(p => p.metadata?.applyTo?.entryId === voucher.id)
        .reduce((sum, p) => sum + (p.metadata?.applyTo?.amount || 0), 0)
    const remaining = round2(total - totalPaid)

    let status: VoucherStatus = 'PENDIENTE'
    if (remaining <= 0.01) {
        status = 'CANCELADO'
    } else if (totalPaid > 0.01) {
        status = 'PARCIAL'
    }

    // Contado invoices are always CANCELADO
    if (voucher.metadata?.paymentCondition === 'CONTADO') {
        status = 'CANCELADO'
    }

    return { entry: voucher, status, totalPaid: round2(totalPaid), remaining: Math.max(0, remaining) }
}

/** Get all vouchers with computed status */
export async function getVouchersWithStatus(): Promise<VoucherWithStatus[]> {
    const vouchers = await getExpenseVouchers()
    const payments = await getExpensePayments()
    return vouchers.map(v => computeVoucherStatus(v, payments))
}

// ─── Delete ──────────────────────────────────────────────────

/**
 * Delete a single expense payment.
 * Simply deletes the entry from db.entries.
 */
export async function deleteExpensePayment(paymentId: string): Promise<void> {
    await deleteEntry(paymentId)
}

/**
 * Delete an expense voucher and all linked payments (cascade).
 * This is the 1:1 model: each payment links to exactly one voucher,
 * so deleting the voucher safely cascades to its payments.
 */
export async function deleteExpenseVoucher(voucherId: string): Promise<{ deletedPayments: number }> {
    // Find all linked payments
    const payments = await getPaymentsForVoucher(voucherId)

    // Delete payments first
    for (const payment of payments) {
        await deleteEntry(payment.id)
    }

    // Delete the voucher itself
    await deleteEntry(voucherId)

    return { deletedPayments: payments.length }
}

/**
 * Update non-accounting fields of a voucher (memo, doc number).
 * Does NOT regenerate the journal entry.
 */
export async function updateVoucherMemo(
    voucherId: string,
    updates: { memo?: string; docNumber?: string },
): Promise<void> {
    const entry = await db.entries.get(voucherId)
    if (!entry) throw new Error('Comprobante no encontrado')

    const patch: Partial<JournalEntry> = {}
    if (updates.memo !== undefined) patch.memo = updates.memo
    if (updates.docNumber !== undefined && entry.metadata) {
        patch.metadata = {
            ...entry.metadata,
            doc: { ...entry.metadata.doc, number: updates.docNumber },
        }
    }

    await db.entries.update(voucherId, patch)
}
