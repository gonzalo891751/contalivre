/**
 * Fase 2A — Respaldo y restauración integral (DAT-001).
 * Round-trip: exportar → alterar la base → restaurar → estado idéntico.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { exportBackup, previewBackup, restoreBackup } from '../../src/accounting/backup/backupService'
import { CURRENT_SCHEMA_VERSION } from '../../src/accounting/migration/versions'
import { db } from '../../src/storage/db'

describe('Fase 2A — backup/restore', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-10', memo: 'a', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-02-10', memo: 'b', lines: simpleLines('mercaderias', 'caja', 400) })
    })

    it('el respaldo contiene versión, metadata, todas las tablas y totales de control', async () => {
        const backup = await exportBackup()
        expect(backup.format).toBe('contalivre-backup')
        expect(backup.formatVersion).toBe(1)
        expect(backup.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
        expect(backup.installationId).toBeTruthy()
        expect(backup.createdAt).toBeTruthy()
        expect(Object.keys(backup.tables)).toContain('entries')
        expect(Object.keys(backup.tables)).toContain('accounts')
        expect(Object.keys(backup.tables)).toContain('exercises')
        expect(Object.keys(backup.tables)).toContain('auditLog')
        expect(backup.checksums.tableCounts.entries).toBe(2)
        expect(backup.checksums.totalRecords).toBeGreaterThan(0)
    })

    it('round-trip: restaurar recupera exactamente los registros', async () => {
        const backup = await exportBackup()
        const entriesBefore = await db.entries.toArray()
        const accountsBefore = await db.accounts.count()

        // Alterar la base: borrar todo y agregar basura
        // (escritura directa intencional para simular daño; solo en test)
        // eslint-disable-next-line no-restricted-syntax
        await db.entries.clear()
        await db.accounts.clear()
        await postNewEntry({
            date: '2027-01-01', memo: 'basura post-backup',
            lines: simpleLines('x', 'y', 1),
        }).catch(() => { /* falla por cuentas inexistentes: da igual */ })

        const result = await restoreBackup(JSON.parse(JSON.stringify(backup)))

        expect(result.restoredRecords).toBe(backup.checksums.totalRecords)
        expect(await db.entries.count()).toBe(2)
        expect(await db.accounts.count()).toBe(accountsBefore)

        const entriesAfter = await db.entries.toArray()
        const sortById = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
        expect(entriesAfter.sort(sortById)).toEqual(entriesBefore.sort(sortById))
    })

    it('un archivo inválido se rechaza sin tocar la base', async () => {
        const before = await db.entries.count()

        expect(previewBackup({ foo: 'bar' }).valid).toBe(false)
        await expect(restoreBackup({ foo: 'bar' })).rejects.toThrow('no es válido')

        // Checksum adulterado también se rechaza
        const backup = await exportBackup()
        const tampered = JSON.parse(JSON.stringify(backup))
        tampered.checksums.tableCounts.entries = 99
        const preview = previewBackup(tampered)
        expect(preview.valid).toBe(false)
        expect(preview.errors.some(e => e.includes('corrupto'))).toBe(true)

        expect(await db.entries.count()).toBe(before)
    })

    it('la vista previa informa contenidos sin modificar nada', async () => {
        const backup = await exportBackup()
        const preview = previewBackup(backup)
        expect(preview.valid).toBe(true)
        expect(preview.entriesCount).toBe(2)
        expect(preview.accountsCount).toBeGreaterThan(0)
        expect(preview.companies).toContain('Empresa ContaLivre')
    })
})
