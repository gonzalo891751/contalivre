/**
 * Reset de escenarios educativos — Fase 2C.
 *
 * Borra físicamente los asientos de un ejercicio DEMO (años 9001-9003) y sus
 * borradores. Es una excepción acotada y auditada al principio de
 * inmutabilidad: aplica SOLO a asientos de escenario (sourceModule 'scenario'
 * o 'closing' dentro del año demo), nunca a datos reales del usuario.
 */

import { db } from '../../storage/db'
import { deleteEntryRecord } from '../repositories/journalRepository'
import { appendAuditEvent } from '../audit/auditLog'
import { LOCAL_ACTOR } from '../domain/types'

const DEMO_YEARS = new Set([9001, 9002, 9003])

export async function resetJournalRangeForScenario(year: number, scenarioId: string): Promise<{ deleted: number }> {
    if (!DEMO_YEARS.has(year)) {
        throw new Error(`resetScenario solo opera sobre ejercicios demo (9001-9003); recibido ${year}`)
    }
    const start = `${year}-01-01`
    const end = `${year}-12-31`
    const inRange = await db.entries.where('date').between(start, end, true, true).toArray()

    let deleted = 0
    await db.transaction('rw', [db.entries, db.auditLog], async () => {
        for (const e of inRange) {
            // Seguridad extra: solo borra asientos de escenario o de cierre demo
            const isScenario = e.sourceModule === 'scenario'
                || (e.metadata as { scenario?: unknown } | undefined)?.scenario === scenarioId
                || e.sourceModule === 'closing'
            if (!isScenario) continue
            await deleteEntryRecord(e.id)
            deleted++
        }
        await appendAuditEvent({
            eventType: 'JOURNAL_RESET',
            entityType: 'database',
            entityId: `scenario-${scenarioId}-${year}`,
            actorId: LOCAL_ACTOR,
            reason: `Reset del escenario educativo ${scenarioId}`,
            metadata: { year, deleted, demo: true },
        })
    })

    return { deleted }
}
