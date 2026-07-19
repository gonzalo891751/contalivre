/**
 * Asistente de mapeos contables — Fase 2C (§11).
 *
 * Clasifica las cuentas según el estado de su metadata para publicación de
 * estados, calcula el impacto de un cambio antes de guardarlo y persiste el
 * cambio con auditoría (actor, antes/después, motivo). Las heurísticas solo
 * PROPONEN; nunca guardan una clasificación crítica automáticamente.
 */

import { db } from '../../storage/db'
import type { Account } from '../../core/models'
import { LOCAL_ACTOR } from '../domain/types'
import { toCents } from '../domain/money'
import { appendAuditEvent } from '../audit/auditLog'
import {
    deriveAccountClass,
    deriveCurrentClassification,
    deriveMonetaryClassification,
    isPostableAccount,
} from './taxonomy'

export type MappingIssueKind =
    | 'BALANCE_NO_STATEMENT_GROUP'   // saldo y sin grupo de exposición
    | 'MIXED_MONETARY'               // monetariedad MIXED sin resolver
    | 'NO_MONETARY_CLASS'            // sin clasificación monetaria
    | 'NO_CASHFLOW_CATEGORY'         // activo/pasivo sin categoría EFE
    | 'INACTIVE_WITH_BALANCE'        // inactiva con saldo
    | 'GROUPED_IMPUTED'              // agrupadora con movimientos
    | 'RESULT_NO_FUNCTION'           // cuenta de resultado sin función ER (grupo)

export interface AccountMappingStatus {
    account: Account
    balance: number
    hasBalance: boolean
    issues: MappingIssueKind[]
    /** true si tiene toda la metadata crítica para publicar */
    complete: boolean
}

const CASHFLOW_RELEVANT = new Set(['ASSET', 'LIABILITY'])

/** Neto Debe−Haber por cuenta de los asientos que integran los libros */
async function balancesByAccount(): Promise<Map<string, number>> {
    const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
    const cents = new Map<string, number>()
    for (const e of entries) {
        for (const l of e.lines) {
            cents.set(l.accountId, (cents.get(l.accountId) ?? 0) + toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }
    const out = new Map<string, number>()
    for (const [id, c] of cents) out.set(id, c / 100)
    return out
}

function detectIssues(account: Account, balance: number): MappingIssueKind[] {
    const issues: MappingIssueKind[] = []
    const hasBalance = toCents(balance) !== 0

    if (hasBalance && !account.statementGroup) issues.push('BALANCE_NO_STATEMENT_GROUP')

    const monetary = deriveMonetaryClassification(account)
    if (account.kind === 'ASSET' || account.kind === 'LIABILITY') {
        if (monetary === 'MIXED') issues.push('MIXED_MONETARY')
        else if (monetary === 'NOT_APPLICABLE') issues.push('NO_MONETARY_CLASS')
        if (!account.cashFlowCategory && account.statementGroup !== 'CASH_AND_BANKS' && CASHFLOW_RELEVANT.has(account.kind) && hasBalance) {
            // solo si no es efectivo por statementGroup y tiene saldo
            issues.push('NO_CASHFLOW_CATEGORY')
        }
    }
    if (account.active === false && hasBalance) issues.push('INACTIVE_WITH_BALANCE')
    if (!isPostableAccount(account) && hasBalance) issues.push('GROUPED_IMPUTED')
    if ((account.kind === 'INCOME' || account.kind === 'EXPENSE') && hasBalance && !account.statementGroup) {
        issues.push('RESULT_NO_FUNCTION')
    }
    return issues
}

export const ISSUE_LABELS: Record<MappingIssueKind, string> = {
    BALANCE_NO_STATEMENT_GROUP: 'Con saldo y sin grupo de exposición (ESP/ER)',
    MIXED_MONETARY: 'Monetariedad MIXTA sin resolver',
    NO_MONETARY_CLASS: 'Sin clasificación monetaria',
    NO_CASHFLOW_CATEGORY: 'Sin categoría de flujo de efectivo',
    INACTIVE_WITH_BALANCE: 'Inactiva pero con saldo',
    GROUPED_IMPUTED: 'Agrupadora con movimientos imputados',
    RESULT_NO_FUNCTION: 'Cuenta de resultado sin función (grupo)',
}

export interface MappingReport {
    complete: AccountMappingStatus[]
    incomplete: AccountMappingStatus[]
    /** cuentas materiales (con saldo) que bloquean la publicación */
    blockingCount: number
    total: number
}

export async function buildMappingReport(): Promise<MappingReport> {
    const [accounts, balances] = await Promise.all([
        db.accounts.orderBy('code').toArray(),
        balancesByAccount(),
    ])

    const complete: AccountMappingStatus[] = []
    const incomplete: AccountMappingStatus[] = []
    let blockingCount = 0

    for (const account of accounts) {
        const balance = balances.get(account.id) ?? 0
        const issues = detectIssues(account, balance)
        const status: AccountMappingStatus = {
            account,
            balance,
            hasBalance: toCents(balance) !== 0,
            issues,
            complete: issues.length === 0,
        }
        if (issues.length === 0) complete.push(status)
        else {
            incomplete.push(status)
            // bloquean publicación los issues materiales sobre cuentas con saldo
            if (status.hasBalance && issues.some(i =>
                i === 'BALANCE_NO_STATEMENT_GROUP' || i === 'RESULT_NO_FUNCTION' || i === 'GROUPED_IMPUTED')) {
                blockingCount++
            }
        }
    }

    return { complete, incomplete, blockingCount, total: accounts.length }
}

// ─────────────────────────────────────────────────────────────
// Impacto y guardado auditado
// ─────────────────────────────────────────────────────────────

export type EditableMappingField =
    | 'statementGroup'
    | 'currentClassification'
    | 'monetaryClassification'
    | 'cashFlowCategory'
    | 'accountClass'
    | 'resultFunction'
    | 'active'

export interface MappingChange {
    field: EditableMappingField
    from: unknown
    to: unknown
}

export interface MappingImpact {
    changes: MappingChange[]
    /** descripción legible del efecto en los estados */
    descriptions: string[]
}

/** Describe el impacto de un cambio propuesto ANTES de guardarlo */
export function describeImpact(account: Account, proposed: Partial<Account>): MappingImpact {
    const changes: MappingChange[] = []
    const descriptions: string[] = []
    const fields: EditableMappingField[] = ['statementGroup', 'currentClassification', 'monetaryClassification', 'cashFlowCategory', 'accountClass', 'resultFunction', 'active']

    for (const field of fields) {
        if (proposed[field] === undefined) continue
        const from = account[field]
        const to = proposed[field]
        if (from === to) continue
        changes.push({ field, from, to })
        switch (field) {
            case 'statementGroup':
                descriptions.push(`Trasladará el saldo de "${account.name}" al rubro ${to ?? '(sin rubro)'} en los estados.`)
                break
            case 'monetaryClassification':
                descriptions.push(`Clasificará "${account.name}" como ${to} para el ajuste por inflación.`)
                break
            case 'cashFlowCategory':
                descriptions.push(`Clasificará los flujos de "${account.name}" como ${to} en el EFE.`)
                break
            case 'currentClassification':
                descriptions.push(`Reubicará "${account.name}" en ${to === 'CURRENT' ? 'corriente' : 'no corriente'} en el ESP.`)
                break
            case 'active':
                descriptions.push(to === false ? `Inactivará "${account.name}" (no admitirá nuevas imputaciones).` : `Reactivará "${account.name}".`)
                break
            case 'resultFunction':
                descriptions.push(`Incluirá "${account.name}" en la función ${to ?? '(sin función)'} del anexo de gastos por función.`)
                break
            default:
                descriptions.push(`Actualizará ${field} de "${account.name}".`)
        }
    }
    return { changes, descriptions }
}

/** Guarda un cambio de mapping con auditoría. Nunca automático. */
export async function saveMapping(
    accountId: string,
    proposed: Partial<Account>,
    opts: { actorId?: string; reason?: string } = {}
): Promise<Account> {
    const account = await db.accounts.get(accountId)
    if (!account) throw new Error(`La cuenta ${accountId} no existe`)

    const impact = describeImpact(account, proposed)
    if (impact.changes.length === 0) return account

    const updated: Account = {
        ...account,
        ...proposed,
        metadataVersion: (account.metadataVersion ?? 0) + 1,
    }
    await db.accounts.put(updated)

    await appendAuditEvent({
        eventType: 'ENTRY_REPLACED', // reutilizamos el tipo genérico de cambio auditado
        entityType: 'company',
        entityId: accountId,
        actorId: opts.actorId ?? LOCAL_ACTOR,
        reason: opts.reason ?? 'Cambio de mapeo contable',
        before: Object.fromEntries(impact.changes.map(c => [c.field, c.from])),
        after: Object.fromEntries(impact.changes.map(c => [c.field, c.to])),
        metadata: { kind: 'account-mapping', code: account.code },
    })

    return updated
}

// ─────────────────────────────────────────────────────────────
// Propuestas heurísticas (solo sugieren)
// ─────────────────────────────────────────────────────────────

export function proposeMapping(account: Account): Partial<Account> {
    const proposal: Partial<Account> = {}
    if (!account.accountClass) proposal.accountClass = deriveAccountClass(account)
    if (!account.currentClassification) proposal.currentClassification = deriveCurrentClassification(account)
    if (!account.monetaryClassification) {
        const m = deriveMonetaryClassification(account)
        if (m !== 'NOT_APPLICABLE' && m !== 'MIXED') proposal.monetaryClassification = m
    }
    return proposal
}
