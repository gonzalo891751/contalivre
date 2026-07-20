/**
 * Migración a schema v20 — Fase 2E.
 *
 * v20 agrega la tabla `expenseAllocationRules` (reglas versionadas de
 * distribución de gastos entre funciones, §9.2). Solo actualiza la metadata
 * de sistema; no transforma datos existentes.
 */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V20_ID = 'v20-expense-allocation-rules'

export async function migrateToV20(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()
    const metaTable = tx.table('systemMeta')
    const existing = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (existing) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V20_ID,
        })
    }
    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V20_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: { addedTable: 'expenseAllocationRules' },
    })
}
