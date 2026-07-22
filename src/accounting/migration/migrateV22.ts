/**
 * Migración a schema v22 — Fase 2G §6/§19.
 *
 * v22 agrega la tabla `cashFlowPolicies`: política contable del EFE versionada
 * por entidad. La migración es NO destructiva e idempotente:
 *  - no toca cuentas, asientos ni ejercicios;
 *  - crea una política HEREDADA determinista por empresa (a partir de la
 *    metadata de cuentas existente), marcada `requiresReview` para que el
 *    usuario la valide;
 *  - si ya existe una política para la empresa, no crea otra (idempotente).
 */

import type { Transaction } from 'dexie'
import type { SystemMeta, Company } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'
import { deriveLegacyPolicy, type CashFlowPolicy } from '../../reporting/policy/cashFlowPolicy'

export const MIGRATION_V22_ID = 'v22-cashflow-policies'

interface AccountRow { id: string; statementGroup?: string | null; cashFlowCategory?: string; companyId?: string }

export async function migrateToV22(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()
    const companies = (await tx.table('companies').toArray()) as Company[]
    const accounts = (await tx.table('accounts').toArray()) as AccountRow[]
    const policyTable = tx.table('cashFlowPolicies')

    // Idempotencia: no recrear políticas ya existentes.
    const existing = (await policyTable.toArray()) as CashFlowPolicy[]
    const haveFor = new Set(existing.map(p => p.companyId))

    let created = 0
    for (const company of companies) {
        if (haveFor.has(company.id)) continue
        // En el modelo actual las cuentas son del plan de la empresa; si llevan
        // companyId, se filtran; si no, se usan todas (base heredada).
        const companyAccounts = accounts.some(a => a.companyId)
            ? accounts.filter(a => !a.companyId || a.companyId === company.id)
            : accounts
        await policyTable.add(deriveLegacyPolicy(company.id, companyAccounts))
        created += 1
    }

    const metaTable = tx.table('systemMeta')
    const meta = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (meta) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V22_ID,
        })
    }

    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V22_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: { addedTable: 'cashFlowPolicies', policiesCreated: created },
    })
}
