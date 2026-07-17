/**
 * Migración a schema v19 — Fase 2C.
 *
 * v19 agrega la tabla `reportSnapshots` (declarada en el schema Dexie). Esta
 * migración solo actualiza la metadata de sistema para reflejar la versión
 * vigente; no transforma datos existentes.
 */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V19_ID = 'v19-report-snapshots'

export async function migrateToV19(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()
    const metaTable = tx.table('systemMeta')
    const existing = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (existing) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V19_ID,
        })
    }
    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V19_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: { addedTable: 'reportSnapshots' },
    })
}
