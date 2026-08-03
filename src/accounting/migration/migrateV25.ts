/** Migración v25 — papel de trabajo persistente del pre-cierre Fase 2L. */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { APP_VERSION, CURRENT_SCHEMA_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V25_ID = 'v25-fase2l-pre-cierre-guiado'

export async function migrateToV25(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()
    const metaTable = tx.table('systemMeta')
    const meta = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (meta) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V25_ID,
        })
    }
    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V25_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: {
            addedTable: 'closingWorkPapers',
            note: 'Decisiones, revisiones y propuestas del pre-cierre; no modifica libros ni fixtures.',
        },
    })
}
