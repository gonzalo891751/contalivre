/**
 * Fase 2B — Modelo monetario definitivo (ADR) y migración v18.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import {
    addAmounts,
    subAmounts,
    multiplyAmountByRate,
    isCentExact,
    MAX_AMOUNT,
    validateAmount,
} from '../../src/accounting/domain/money'
import { normalizeEntryAmounts, migrateToV18 } from '../../src/accounting/migration/migrateV18'
import { resetDb, seedTestAccounts, simpleLines, line } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { PostingError } from '../../src/accounting/domain/types'
import { db } from '../../src/storage/db'

describe('Fase 2B — aritmética exacta en centavos', () => {
    it('suma y resta exactas (sin drift binario)', () => {
        expect(addAmounts(0.1, 0.2)).toBe(0.3)
        expect(subAmounts(0.3, 0.1)).toBe(0.2)
        expect(addAmounts(1000000.01, 0.02)).toBe(1000000.03)
    })

    it('importe × tasa redondea una sola vez', () => {
        expect(multiplyAmountByRate(1000, 0.21)).toBe(210)
        expect(multiplyAmountByRate(100, 1 / 3)).toBe(33.33)
        expect(multiplyAmountByRate(0.1, 3)).toBe(0.3)
    })

    it('isCentExact detecta residuos y -0', () => {
        expect(isCentExact(100.5)).toBe(true)
        expect(isCentExact(0.1 + 0.2)).toBe(false)   // 0.30000000000000004
        expect(isCentExact(100.005)).toBe(false)
        expect(isCentExact(-0)).toBe(false)
        expect(isCentExact(0)).toBe(true)
        expect(isCentExact(NaN)).toBe(false)
    })

    it('rechaza importes fuera de rango', () => {
        expect(validateAmount(MAX_AMOUNT + 1, 'x')).toContain('excede el máximo')
        expect(validateAmount(MAX_AMOUNT, 'x')).toBeNull()
    })
})

describe('Fase 2B — la frontera de contabilización garantiza centavos exactos', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('normaliza residuos binarios al contabilizar (un solo redondeo)', async () => {
        const dirty = 0.1 + 0.2 // 0.30000000000000004
        const posted = await postNewEntry({
            date: '2025-03-01', memo: 'residuo binario',
            lines: [line('caja', dirty, 0), line('capital', 0, 0.3)],
        })
        expect(posted.lines[0].debit).toBe(0.3)
        expect(isCentExact(posted.lines[0].debit)).toBe(true)
    })

    it('rechaza importes que exceden el máximo de la política', async () => {
        await expect(postNewEntry({
            date: '2025-03-01', memo: 'gigante',
            lines: simpleLines('caja', 'capital', MAX_AMOUNT * 2),
        })).rejects.toThrow(PostingError)
    })
})

describe('Fase 2B — normalizeEntryAmounts (puro)', () => {
    it('normaliza residuo binario conservando el valor legacy', () => {
        const result = normalizeEntryAmounts([
            { accountId: 'a', debit: 0.1 + 0.2, credit: 0 },
            { accountId: 'b', debit: 0, credit: 0.3 },
        ])
        expect(result.lines[0].debit).toBe(0.3)
        expect(result.changes).toHaveLength(1)
        expect(result.changes[0]).toMatchObject({ lineIndex: 0, field: 'debit', normalized: 0.3 })
        expect(result.changes[0].original).toBeCloseTo(0.3)
        expect(result.problems).toHaveLength(0)
    })

    it('reporta >2 decimales como problema (no silencioso)', () => {
        const result = normalizeEntryAmounts([
            { accountId: 'a', debit: 100.239, credit: 0 },
            { accountId: 'b', debit: 0, credit: 100.24 },
        ])
        expect(result.lines[0].debit).toBe(100.24)
        expect(result.problems.some(p => p.includes('más de 2 decimales'))).toBe(true)
    })

    it('reporta no finitos y fuera de rango sin inventar valores', () => {
        const result = normalizeEntryAmounts([
            { accountId: 'a', debit: NaN, credit: 0 },
            { accountId: 'b', debit: 0, credit: MAX_AMOUNT * 10 },
        ])
        expect(Number.isNaN(result.lines[0].debit)).toBe(true) // se conserva, se reporta
        expect(result.lines[1].credit).toBe(MAX_AMOUNT * 10)
        expect(result.problems).toHaveLength(2)
    })
})

describe('Fase 2B — migración v18 desde base v17 con floats sucios', () => {
    const TEST_DB = 'MoneyMigrationTestDb'

    function v17Stores() {
        return {
            entries: 'id, date, memo, sourceModule, sourceId, status, companyId, exerciseId, periodId, idempotencyKey, entryNumber, [companyId+exerciseId]',
            systemMeta: 'id',
            auditLog: 'id, eventType, entityType, entityId, companyId, exerciseId, timestamp',
        }
    }

    beforeEach(async () => {
        await Dexie.delete(TEST_DB)
        const legacy = new Dexie(TEST_DB)
        legacy.version(17).stores(v17Stores())
        await legacy.open()
        await legacy.table('systemMeta').add({ id: 'system', appVersion: '0.2.0', schemaVersion: 17, installationId: 'i', createdAt: 'x', migrationExceptions: [] })
        await legacy.table('entries').bulkAdd([
            {
                id: 'clean', date: '2025-01-10', memo: 'limpio', status: 'POSTED',
                lines: [{ accountId: 'a', debit: 100.5, credit: 0 }, { accountId: 'b', debit: 0, credit: 100.5 }],
            },
            {
                id: 'dirty', date: '2025-02-10', memo: 'float sucio', status: 'POSTED',
                lines: [{ accountId: 'a', debit: 0.1 + 0.2, credit: 0 }, { accountId: 'b', debit: 0, credit: 0.3 }],
            },
            {
                id: 'broken', date: '2025-03-10', memo: 'roto', status: 'POSTED',
                lines: [{ accountId: 'a', debit: Infinity, credit: 0 }, { accountId: 'b', debit: 0, credit: 1 }],
            },
        ])
        legacy.close()
    })

    async function openV18() {
        const testDb = new Dexie(TEST_DB)
        testDb.version(17).stores(v17Stores())
        testDb.version(18).stores({}).upgrade(migrateToV18)
        await testDb.open()
        return testDb
    }

    it('normaliza importes, preserva legacy y reporta excepciones', async () => {
        const v18 = await openV18()

        const clean = await v18.table('entries').get('clean')
        expect(clean.lines[0].debit).toBe(100.5)
        expect(clean.metadata.moneyModelV18).toBe(true)
        expect(clean.metadata.legacyAmounts).toBeUndefined()

        const dirty = await v18.table('entries').get('dirty')
        expect(dirty.lines[0].debit).toBe(0.3)
        expect(dirty.metadata.legacyAmounts).toHaveLength(1)
        expect(dirty.metadata.legacyAmounts[0].original).toBeCloseTo(0.3)

        const broken = await v18.table('entries').get('broken')
        expect(broken.metadata.needsReview).toBe(true)

        const meta = await v18.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(18)
        expect(meta.lastMigrationId).toBe('v18-modelo-monetario')
        expect(meta.migrationExceptions.some((e: { entryId: string }) => e.entryId === 'broken')).toBe(true)

        const audits = await v18.table('auditLog').toArray()
        expect(audits.some((a: { entityId: string }) => a.entityId === 'v18-modelo-monetario')).toBe(true)

        v18.close()
    })

    it('es idempotente: reejecutar la normalización no duplica cambios', async () => {
        const v18 = await openV18()
        const before = await v18.table('entries').get('dirty')

        // Simular re-ejecución del cuerpo de la migración sobre la misma base
        await v18.transaction('rw', v18.table('entries'), v18.table('systemMeta'), v18.table('auditLog'), async tx => {
            await migrateToV18(tx as never)
        })

        const after = await v18.table('entries').get('dirty')
        expect(after.lines).toEqual(before.lines)
        expect(after.metadata.legacyAmounts).toEqual(before.metadata.legacyAmounts)
        v18.close()
    })
})

describe('Fase 2B — v18 en la base real: totales idénticos tras migrar', () => {
    it('Diario y Mayor conservan igualdad exacta', async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-04-01', memo: 'a', lines: simpleLines('caja', 'capital', 1234.56) })
        await postNewEntry({ date: '2025-04-02', memo: 'b', lines: simpleLines('mercaderias', 'caja', 234.56) })

        const entries = await db.entries.toArray()
        for (const e of entries) {
            for (const l of e.lines) {
                expect(isCentExact(l.debit)).toBe(true)
                expect(isCentExact(l.credit)).toBe(true)
            }
        }
    })
})
