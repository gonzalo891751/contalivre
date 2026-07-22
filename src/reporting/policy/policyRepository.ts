/**
 * Persistencia de la política del EFE (Fase 2G §6). Capa fina sobre Dexie
 * (tabla `cashFlowPolicies`, schema v22).
 */

import { db } from '../../storage/db'
import { defaultCashFlowPolicy, type CashFlowPolicy } from './cashFlowPolicy'

/** Todas las políticas de una empresa (activas e históricas). */
export async function listPolicies(companyId: string): Promise<CashFlowPolicy[]> {
    return db.cashFlowPolicies.where('companyId').equals(companyId).toArray()
}

/**
 * Política vigente: la del ejercicio si existe y está ACTIVE; si no, la política
 * por defecto de la empresa (exerciseId null) ACTIVE. Devuelve null si no hay.
 */
export async function getActivePolicy(companyId: string, exerciseId?: string | null): Promise<CashFlowPolicy | null> {
    const all = await listPolicies(companyId)
    const active = all.filter(p => p.status === 'ACTIVE')
    if (exerciseId) {
        const forExercise = active.find(p => p.exerciseId === exerciseId)
        if (forExercise) return forExercise
    }
    return active.find(p => p.exerciseId === null) ?? active[0] ?? null
}

export async function savePolicy(policy: CashFlowPolicy): Promise<void> {
    await db.cashFlowPolicies.put({ ...policy, updatedAt: new Date().toISOString() })
}

/** Garantiza que exista una política por defecto de la empresa; la crea si falta. */
export async function ensureDefaultPolicy(companyId: string): Promise<CashFlowPolicy> {
    const existing = await getActivePolicy(companyId)
    if (existing) return existing
    const policy = defaultCashFlowPolicy(companyId)
    await db.cashFlowPolicies.add(policy)
    return policy
}
