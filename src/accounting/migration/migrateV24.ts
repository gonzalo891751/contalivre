/**
 * Migración a schema v24 — Fase 2K §5/§27.
 *
 * NUMERACIÓN. Esta migración nació como v23 mientras la Fase 2K y la Fase 2J se
 * desarrollaban en paralelo. La Fase 2J se integró primero a `main` y su
 * migración `v23-closing-measurements` (tabla `closingMeasurements`) ya corrió
 * en instalaciones reales, así que esa numeración le pertenece y no puede
 * reasignarse: renumerarla dejaría bases que ya ejecutaron la v23 sin forma de
 * saber cuál de las dos aplicaron. La consolidación pasa entonces a v24, que se
 * ejecuta DESPUÉS de la v23 y nunca en su lugar.
 *
 * v24 agrega las tablas del módulo de consolidación de estados contables:
 *
 *   economicGroups             grupo económico y su controladora
 *   groupMembers               perímetro: relación, método, participación, control
 *   consolidationExercises     ejercicio de consolidación del grupo
 *   consolidationMemberLinks   qué ejercicio individual alimenta cada entidad
 *   consolidationMappings      mapeo cuenta → línea consolidada y categoría intragrupo
 *   reciprocalBalances         conciliación de saldos recíprocos
 *   intragroupOperations       operaciones internas y resultados no trascendidos
 *   consolidationAdjustments   ajustes manuales de consolidación
 *
 * La migración es ESTRICTAMENTE ADITIVA e idempotente:
 *  - no crea, modifica ni elimina cuentas, asientos, ejercicios ni períodos;
 *  - no altera ningún importe existente (el caso Purmamarca queda intacto);
 *  - no toca `closingMeasurements` ni ninguna otra tabla de la Fase 2J;
 *  - no crea grupos por defecto: un grupo económico es una decisión del
 *    usuario, no algo que el sistema deba suponer.
 *
 * Todo lo que el módulo escribe es papel de trabajo del grupo. Ninguna de estas
 * tablas es fuente de asientos: el invariante extracontable de la Fase 2K se
 * sostiene también en el esquema.
 */

import type { Transaction } from 'dexie'
import type { SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { CURRENT_SCHEMA_VERSION, APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V24_ID = 'v24-fase2k-consolidacion'

export const CONSOLIDATION_TABLES = [
    'economicGroups',
    'groupMembers',
    'consolidationExercises',
    'consolidationMemberLinks',
    'consolidationMappings',
    'reciprocalBalances',
    'intragroupOperations',
    'consolidationAdjustments',
] as const

export async function migrateToV24(tx: Transaction): Promise<void> {
    const timestamp = new Date().toISOString()

    const metaTable = tx.table('systemMeta')
    const meta = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (meta) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V24_ID,
        })
    }

    await tx.table('auditLog').add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V24_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: {
            addedTables: [...CONSOLIDATION_TABLES],
            note: 'Tablas de consolidación: papeles de trabajo del grupo, jamás fuente de asientos',
        },
    })
}
