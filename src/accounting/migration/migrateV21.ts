/**
 * Migración a schema v21 — Fase 2F.
 *
 * v21 agrega la tabla `manualDisclosures` (notas manuales persistentes y
 * versionadas, §8). Solo actualiza la metadata de sistema; no transforma
 * datos existentes.
 */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V21_ID = 'v21-manual-disclosures'

export async function migrateToV21(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()
    const metaTable = tx.table('systemMeta')
    const existing = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (existing) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V21_ID,
        })
    }
    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V21_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: { addedTable: 'manualDisclosures' },
    })
}
