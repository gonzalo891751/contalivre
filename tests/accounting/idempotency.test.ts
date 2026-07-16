/**
 * Fase 2A — Idempotencia de operaciones automáticas (ACC-011).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postOperation } from '../../src/accounting/application/journalService'
import { buildIdempotencyKey } from '../../src/accounting/domain/idempotency'
import { db } from '../../src/storage/db'

const DATE = '2025-04-01'

describe('Fase 2A — idempotencia', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('repetir la misma operación no crea un segundo asiento', async () => {
        const input = {
            date: DATE,
            memo: 'Compra de mercaderías',
            lines: simpleLines('mercaderias', 'proveedores', 1000),
            sourceModule: 'inventory',
            sourceType: 'purchase',
            sourceId: 'mov-001',
            accountingEventType: 'acquisition',
        }

        const first = await postOperation(input)
        expect(first.idempotentHit).toBe(false)
        expect(first.entry.status).toBe('POSTED')

        const second = await postOperation(input)
        expect(second.idempotentHit).toBe(true)
        expect(second.entry.id).toBe(first.entry.id)

        expect(await db.entries.count()).toBe(1)
    })

    it('deja registro del intento repetido en el audit log', async () => {
        const input = {
            date: DATE,
            memo: 'op repetida',
            lines: simpleLines('caja', 'ventas', 500),
            sourceModule: 'test',
            sourceType: 'sale',
            sourceId: 'op-77',
        }
        await postOperation(input)
        await postOperation(input)

        const rejections = await db.auditLog.where('eventType').equals('POSTING_REJECTED').toArray()
        expect(rejections.some(e => String(e.reason).includes('idempotencia'))).toBe(true)
    })

    it('operaciones distintas del mismo origen usan claves distintas', async () => {
        const base = {
            date: DATE,
            lines: simpleLines('mercaderias', 'proveedores', 100),
            sourceModule: 'inventory',
            sourceType: 'purchase',
            sourceId: 'mov-002',
        }
        const a = await postOperation({ ...base, memo: 'alta', accountingEventType: 'acquisition' })
        const b = await postOperation({ ...base, memo: 'iva', accountingEventType: 'vat' })
        expect(a.entry.id).not.toBe(b.entry.id)
        expect(await db.entries.count()).toBe(2)
    })

    it('la clave canónica es estable', () => {
        const key1 = buildIdempotencyKey({
            companyId: 'c', sourceModule: 'm', sourceType: 't', sourceId: 'id', accountingEventType: 'e',
        })
        const key2 = buildIdempotencyKey({
            companyId: 'c', sourceModule: 'm', sourceType: 't', sourceId: 'id', accountingEventType: 'e',
        })
        expect(key1).toBe(key2)
        expect(key1).toBe('c|m|t|id|e')
    })
})
