/**
 * Servicio de reglas de distribución de gastos — Fase 2F (§7).
 *
 * Las reglas son metadata de EXPOSICIÓN versionada: jamás alteran el Diario.
 * Reglas ACTIVE son inmutables (solo puede finalizarse su vigencia o crearse
 * una versión nueva que las reemplaza); los BORRADORES se editan/eliminan y
 * el motor los ignora. Todos los cambios quedan auditados.
 */

import { db, generateId } from '../../storage/db'
import { appendAuditEvent } from '../audit/auditLog'
import { LOCAL_ACTOR } from '../domain/types'
import { ruleIsValid } from '../../reporting/engine/expensesByFunction'
import type { Account, ExpenseAllocationRule, ResultFunction } from '../../core/models'

export interface AllocationRuleInput {
    accountId: string
    validFrom: string
    validTo?: string
    allocations: { function: ResultFunction; percentage: number }[]
    reason: string
    status: 'DRAFT' | 'ACTIVE'
    /** al versionar: regla ACTIVE que esta reemplaza */
    supersedesId?: string
}

export interface AllocationValidationError {
    field: string
    message: string
}

const VALID_FUNCTIONS = new Set<string>(['ADMINISTRATION', 'SELLING', 'PRODUCTION', 'FINANCIAL', 'OTHER'])

/** ¿La cuenta admite distribución por funciones? (gasto que integra el anexo) */
export function isAllocatableAccount(account: Account | undefined): boolean {
    if (!account) return false
    if (account.kind !== 'EXPENSE') return false
    // COGS duplicaría el CMV; INCOME_TAX tiene renglón propio del ER
    if (account.statementGroup === 'COGS' || account.statementGroup === 'INCOME_TAX') return false
    return account.isPostable !== false && account.active !== false
}

function rangesOverlap(aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined): boolean {
    const aEnd = aTo ?? '9999-12-31'
    const bEnd = bTo ?? '9999-12-31'
    return aFrom <= bEnd && bFrom <= aEnd
}

/** Validación completa de un input (sin efectos) */
export async function validateRuleInput(
    input: AllocationRuleInput,
    excludeRuleId?: string
): Promise<AllocationValidationError[]> {
    const errors: AllocationValidationError[] = []

    const account = await db.accounts.get(input.accountId)
    if (!isAllocatableAccount(account)) {
        errors.push({
            field: 'accountId',
            message: account?.statementGroup === 'COGS'
                ? 'Las cuentas del costo de ventas no se distribuyen por función (duplicarían el CMV).'
                : account?.statementGroup === 'INCOME_TAX'
                    ? 'El impuesto a las ganancias tiene su renglón propio del ER; no integra el anexo de gastos.'
                    : 'La cuenta no es un gasto imputable apto para distribución.',
        })
    }

    if (!input.validFrom) errors.push({ field: 'validFrom', message: 'La vigencia desde es obligatoria.' })
    if (input.validTo && input.validTo < input.validFrom) {
        errors.push({ field: 'validTo', message: 'La vigencia hasta no puede ser anterior a la vigencia desde.' })
    }

    if (input.allocations.length === 0) {
        errors.push({ field: 'allocations', message: 'Definí al menos una función.' })
    }
    const seen = new Set<string>()
    let sumBps = 0
    for (const a of input.allocations) {
        if (!VALID_FUNCTIONS.has(a.function)) errors.push({ field: 'allocations', message: `Función inválida: ${a.function}.` })
        if (a.percentage <= 0) errors.push({ field: 'allocations', message: 'Los porcentajes deben ser positivos.' })
        if (seen.has(a.function)) errors.push({ field: 'allocations', message: `La función ${a.function} está repetida.` })
        seen.add(a.function)
        sumBps += Math.round(a.percentage * 100)
    }
    if (input.allocations.length > 0 && sumBps !== 10000) {
        errors.push({ field: 'allocations', message: `Los porcentajes deben sumar exactamente 100 % (suman ${(sumBps / 100).toFixed(2)} %).` })
    }

    if (!input.reason?.trim()) errors.push({ field: 'reason', message: 'El motivo es obligatorio (queda auditado).' })

    // Superposición de vigencias con reglas ACTIVE de la misma cuenta
    if (input.status === 'ACTIVE') {
        const existing = await db.expenseAllocationRules
            .where('accountId').equals(input.accountId).toArray()
        for (const r of existing) {
            if (r.id === excludeRuleId || r.id === input.supersedesId) continue
            if (r.status === 'DRAFT') continue
            if (rangesOverlap(input.validFrom, input.validTo, r.validFrom, r.validTo)) {
                errors.push({
                    field: 'validFrom',
                    message: `Se superpone con la regla v${r.version} (vigente ${r.validFrom} → ${r.validTo ?? 'sin fin'}). Finalizá su vigencia o ajustá las fechas.`,
                })
            }
        }
    }

    return errors
}

/**
 * Crea una regla (DRAFT o ACTIVE). Si `supersedesId` apunta a una ACTIVE
 * abierta, esa regla se cierra automáticamente el día anterior a validFrom
 * (versionado explícito, nunca modificación retroactiva silenciosa).
 */
export async function createRule(input: AllocationRuleInput, actorId = LOCAL_ACTOR): Promise<ExpenseAllocationRule> {
    const errors = await validateRuleInput(input)
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join(' '))

    const existing = await db.expenseAllocationRules.where('accountId').equals(input.accountId).toArray()
    const version = existing.reduce((m, r) => Math.max(m, r.version), 0) + 1

    let closedPrevious: ExpenseAllocationRule | undefined
    if (input.supersedesId) {
        const prev = await db.expenseAllocationRules.get(input.supersedesId)
        if (prev && prev.status !== 'DRAFT' && !prev.validTo) {
            const dayBefore = new Date(new Date(input.validFrom + 'T00:00:00Z').getTime() - 86400000)
                .toISOString().slice(0, 10)
            if (dayBefore < prev.validFrom) {
                throw new Error('La nueva vigencia no puede comenzar antes que la regla que reemplaza.')
            }
            closedPrevious = { ...prev, validTo: dayBefore }
            await db.expenseAllocationRules.put(closedPrevious)
        }
    }

    const rule: ExpenseAllocationRule = {
        id: `alloc-${generateId()}`,
        accountId: input.accountId,
        validFrom: input.validFrom,
        validTo: input.validTo,
        allocations: input.allocations,
        reason: input.reason.trim(),
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        version,
        status: input.status,
        supersedesId: input.supersedesId,
    }
    if (rule.status === 'ACTIVE' && !ruleIsValid(rule)) {
        throw new Error('La regla no supera la validación del motor (porcentajes/funciones).')
    }
    await db.expenseAllocationRules.put(rule)

    await appendAuditEvent({
        eventType: 'ENTRY_REPLACED',
        entityType: 'company',
        entityId: rule.id,
        actorId,
        reason: input.reason,
        after: { accountId: rule.accountId, allocations: rule.allocations, validFrom: rule.validFrom, validTo: rule.validTo, status: rule.status, version },
        before: closedPrevious ? { supersedes: closedPrevious.id, closedAt: closedPrevious.validTo } : undefined,
        metadata: { kind: 'expense-allocation-rule' },
    })
    return rule
}

/** Actualiza un BORRADOR (las ACTIVE son inmutables) */
export async function updateDraftRule(
    ruleId: string,
    input: AllocationRuleInput,
    actorId = LOCAL_ACTOR
): Promise<ExpenseAllocationRule> {
    const rule = await db.expenseAllocationRules.get(ruleId)
    if (!rule) throw new Error('La regla no existe.')
    if (rule.status !== 'DRAFT') throw new Error('Solo los borradores pueden editarse; una regla activa se reemplaza con una versión nueva.')
    const errors = await validateRuleInput(input, ruleId)
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join(' '))
    const updated: ExpenseAllocationRule = {
        ...rule,
        validFrom: input.validFrom,
        validTo: input.validTo,
        allocations: input.allocations,
        reason: input.reason.trim(),
        status: input.status,
    }
    await db.expenseAllocationRules.put(updated)
    await appendAuditEvent({
        eventType: 'ENTRY_REPLACED', entityType: 'company', entityId: ruleId, actorId,
        reason: input.reason, metadata: { kind: 'expense-allocation-rule', action: input.status === 'ACTIVE' ? 'draft-activated' : 'draft-updated' },
    })
    return updated
}

/** Elimina ÚNICAMENTE un borrador */
export async function deleteDraftRule(ruleId: string, actorId = LOCAL_ACTOR): Promise<void> {
    const rule = await db.expenseAllocationRules.get(ruleId)
    if (!rule) return
    if (rule.status !== 'DRAFT') throw new Error('Solo se eliminan borradores; una regla activa se finaliza, no se borra (historial auditable).')
    await db.expenseAllocationRules.delete(ruleId)
    await appendAuditEvent({
        eventType: 'ENTRY_REPLACED', entityType: 'company', entityId: ruleId, actorId,
        reason: 'Borrador de regla de distribución eliminado',
        metadata: { kind: 'expense-allocation-rule', action: 'draft-deleted' },
    })
}

/** Finaliza la vigencia de una regla ACTIVE (nunca retroactivo respecto de validFrom) */
export async function endRuleValidity(ruleId: string, validTo: string, reason: string, actorId = LOCAL_ACTOR): Promise<ExpenseAllocationRule> {
    const rule = await db.expenseAllocationRules.get(ruleId)
    if (!rule) throw new Error('La regla no existe.')
    if (rule.status === 'DRAFT') throw new Error('Un borrador no tiene vigencia que finalizar; eliminálo.')
    if (validTo < rule.validFrom) throw new Error('La vigencia hasta no puede ser anterior a la vigencia desde.')
    const updated: ExpenseAllocationRule = { ...rule, validTo }
    await db.expenseAllocationRules.put(updated)
    await appendAuditEvent({
        eventType: 'ENTRY_REPLACED', entityType: 'company', entityId: ruleId, actorId,
        reason, before: { validTo: rule.validTo ?? null }, after: { validTo },
        metadata: { kind: 'expense-allocation-rule', action: 'validity-ended' },
    })
    return updated
}

export async function listRules(): Promise<ExpenseAllocationRule[]> {
    const rules = await db.expenseAllocationRules.toArray()
    return rules.sort((a, b) => a.accountId.localeCompare(b.accountId) || b.version - a.version)
}
