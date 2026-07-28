/**
 * Migración a schema v23 — Fase 2J §7.
 *
 * v23 agrega la tabla `closingMeasurements`: mediciones a valores corrientes al
 * cierre, con su criterio, su fuente, su evidencia y el asiento que reconoce el
 * resultado por tenencia.
 *
 * Es una migración puramente aditiva: no toca cuentas, asientos, ejercicios ni
 * ninguna cifra existente. No crea mediciones por su cuenta — medir es un acto
 * del usuario, con su fuente y su fundamento, y una medición inventada sería
 * peor que ninguna.
 */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V23_ID = 'v23-closing-measurements'

export async function migrateToV23(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()

    const metaTable = tx.table('systemMeta')
    const meta = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (meta) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V23_ID,
        })
    }

    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V23_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: { addedTable: 'closingMeasurements' },
    })
}
