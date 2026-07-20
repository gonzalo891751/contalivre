/**
 * Fase 2F (§15) — Cadena de migraciones v16 → v21 y ciclo backup/restore/reset.
 *
 * Abre una base v16 legacy con la definición REAL de la app (todas las
 * upgrades v17→v21 encadenadas) y verifica que la data sobrevive, el schema
 * queda en v21 y las tablas nuevas (expenseAllocationRules, manualDisclosures)
 * existen. Luego prueba backup → reset → restore con datos del schema actual.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { db } from '../../src/storage/db'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { exportBackup, restoreBackup } from '../../src/accounting/backup/backupService'
import { resetApplication } from '../../src/accounting/maintenance/resetService'
import { createRule } from '../../src/accounting/taxonomy/allocationRulesService'
import { saveDisclosure } from '../../src/accounting/disclosures/manualDisclosuresService'
import { CURRENT_SCHEMA_VERSION } from '../../src/accounting/migration/versions'
import { migrateToV17 } from '../../src/accounting/migration/migrateV17'
import { migrateToV18 } from '../../src/accounting/migration/migrateV18'
import { migrateToV19 } from '../../src/accounting/migration/migrateV19'
import { migrateToV20 } from '../../src/accounting/migration/migrateV20'
import { migrateToV21 } from '../../src/accounting/migration/migrateV21'

const DBN = 'ChainMigrationTestDb'

/** Base v16 legacy (sólo tablas de esa época) sembrada y cerrada */
async function seedV16(): Promise<void> {
    const legacy = new Dexie(DBN)
    legacy.version(16).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup',
        entries: 'id, date, memo, sourceModule, sourceId',
        settings: 'id',
        companyProfile: 'id',
    })
    await legacy.open()
    await legacy.table('companyProfile').add({ id: 'default', legalName: 'Legacy SA', cuit: '30-99999999-9' })
    await legacy.table('accounts').add({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', section: 'CURRENT', group: 'Caja', statementGroup: 'CASH_AND_BANKS', parentId: null, level: 2, normalSide: 'DEBIT', isContra: false, isHeader: false })
    await legacy.table('entries').add({ id: 'leg-1', date: '2025-04-01', memo: 'legacy', lines: [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'caja', debit: 0, credit: 500 }], createdAt: '2025-04-01T00:00:00Z' })
    legacy.close()
}

/** Definición encadenada v16→v21 (réplica de las upgrades reales) */
function defineChainDb(): Dexie {
    const d = new Dexie(DBN)
    d.version(16).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup',
        entries: 'id, date, memo, sourceModule, sourceId',
        settings: 'id', companyProfile: 'id',
    })
    d.version(17).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup, companyId',
        entries: 'id, date, memo, sourceModule, sourceId, status, companyId, exerciseId, periodId, idempotencyKey, entryNumber, [companyId+exerciseId]',
        settings: 'id', companyProfile: 'id',
        companies: 'id, active', exercises: 'id, companyId, startDate, endDate, status',
        periods: 'id, exerciseId, companyId, startDate, endDate, status',
        auditLog: 'id, eventType, entityType, entityId, companyId, exerciseId, timestamp', systemMeta: 'id',
    }).upgrade(migrateToV17)
    d.version(18).stores({ inflationIndexSets: 'id, status, createdAt' }).upgrade(migrateToV18)
    d.version(19).stores({ reportSnapshots: 'id, companyId, exerciseId, status, createdAt' }).upgrade(migrateToV19)
    d.version(20).stores({ expenseAllocationRules: 'id, accountId, validFrom' }).upgrade(migrateToV20)
    d.version(21).stores({ manualDisclosures: 'id, companyId, exerciseId, noteType, status' }).upgrade(migrateToV21)
    return d
}

describe('Fase 2F — cadena de migraciones v16 → v21', () => {
    beforeEach(async () => { await Dexie.delete(DBN); await seedV16() })
    afterEach(async () => { await Dexie.delete(DBN) })

    it('la data v16 sobrevive y el schema queda en v21 con las tablas nuevas', async () => {
        const chain = defineChainDb()
        await chain.open()

        // datos preservados
        expect(await chain.table('entries').get('leg-1')).toBeDefined()
        const caja = await chain.table('accounts').get('caja')
        expect(caja.name).toBe('Caja')
        // contexto asignado por v17
        expect((await chain.table('entries').get('leg-1')).status).toBe('POSTED')
        // tablas nuevas existen y son usables
        expect(chain.tables.map(t => t.name)).toEqual(expect.arrayContaining(['expenseAllocationRules', 'manualDisclosures', 'reportSnapshots', 'inflationIndexSets']))
        await chain.table('manualDisclosures').add({ id: 'm1', companyId: 'c', exerciseId: 'e', noteType: 'contingencias', title: 't', content: 'x', status: 'DRAFT', version: 1, createdAt: 'now', createdBy: 'a', updatedAt: 'now', updatedBy: 'a' })
        expect(await chain.table('manualDisclosures').count()).toBe(1)
        // metadata de sistema en v21
        const meta = await chain.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(21)
        expect(meta.lastMigrationId).toBe('v21-manual-disclosures')

        chain.close()
    })
})

describe('Fase 2F — backup / reset / restore en el schema actual', () => {
    beforeEach(async () => { await resetDb(); await seedTestAccounts() })

    it('backup incluye las tablas 2F; reset vacía; restore recupera todo', async () => {
        await postNewEntry({ date: '2025-03-01', memo: 'venta', lines: simpleLines('deudores', 'ventas', 5000) })
        await createRule({ accountId: 'gastos', validFrom: '2025-01-01', allocations: [{ function: 'ADMINISTRATION', percentage: 100 }], reason: 'todo admin', status: 'ACTIVE' })
        await saveDisclosure({ exerciseId: 'ex-2025', companyId: 'company-default', noteType: 'contingencias', content: 'Sin contingencias.', status: 'VALIDATED', notApplicable: true })

        const backup = await exportBackup()
        expect(backup.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
        expect(backup.tables.expenseAllocationRules.length).toBe(1)
        expect(backup.tables.manualDisclosures.length).toBe(1)
        expect(backup.tables.entries.length).toBeGreaterThan(0)

        // reset total: la app queda utilizable (empresa + meta), sin datos previos
        const reset = await resetApplication()
        expect(reset.clearedRecords).toBeGreaterThan(0)
        expect(await db.expenseAllocationRules.count()).toBe(0)
        expect(await db.manualDisclosures.count()).toBe(0)
        expect(await db.companies.count()).toBeGreaterThanOrEqual(1) // instalación limpia

        // restore: recupera reglas, notas y asientos
        const result = await restoreBackup(backup)
        expect(result.restoredRecords).toBeGreaterThan(0)
        expect(await db.expenseAllocationRules.count()).toBe(1)
        expect(await db.manualDisclosures.count()).toBe(1)
        expect((await db.entries.toArray()).some(e => e.memo === 'venta')).toBe(true)
    })

    it('rechaza un backup de un schema más nuevo (no destruye datos actuales)', async () => {
        await postNewEntry({ date: '2025-03-01', memo: 'dato vivo', lines: simpleLines('caja', 'capital', 100) })
        const backup = await exportBackup()
        const tampered = { ...backup, schemaVersion: CURRENT_SCHEMA_VERSION + 5 }
        await expect(restoreBackup(tampered)).rejects.toThrow(/schema más nuevo/)
        // los datos actuales siguen intactos (el restore rechazó antes de tocar nada)
        expect((await db.entries.toArray()).some(e => e.memo === 'dato vivo')).toBe(true)
    })
})
