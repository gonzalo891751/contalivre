/**
 * Fase 2D (§6) — El restablecimiento total deja la base como instalación limpia:
 * vacía todas las tablas, regenera empresa + systemMeta (nueva identidad) y deja
 * un único evento de auditoría APP_RESET.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { getSystemMeta, listExercises } from '../../src/accounting/application/contextService'
import { resetApplication } from '../../src/accounting/maintenance/resetService'
import { db } from '../../src/storage/db'

describe('Fase 2D — restablecimiento total', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-03-10', memo: 'venta', lines: simpleLines('deudores', 'ventas', 300000) })
    })

    it('vacía asientos, cuentas y ejercicios', async () => {
        expect(await db.entries.count()).toBeGreaterThan(0)
        expect(await db.accounts.count()).toBeGreaterThan(0)

        const before = await getSystemMeta()
        const result = await resetApplication()

        expect(await db.entries.count()).toBe(0)
        expect(await db.accounts.count()).toBe(0)
        expect(result.clearedRecords).toBeGreaterThan(0)
        expect(result.newInstallationId).not.toBe(before.installationId)
    })

    it('regenera empresa por defecto y systemMeta', async () => {
        await resetApplication()
        expect(await db.companies.count()).toBe(1)
        const meta = await getSystemMeta()
        expect(meta.installationId).toBeTruthy()
        // no quedan ejercicios previos
        expect((await listExercises()).length).toBe(0)
    })

    it('deja un único evento APP_RESET auditado en la base limpia', async () => {
        await resetApplication()
        const events = await db.auditLog.toArray()
        expect(events.length).toBe(1)
        expect(events[0].eventType).toBe('APP_RESET')
    })
})
