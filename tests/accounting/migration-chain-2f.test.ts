/**
 * Fase 2F (§15), extendida en las Fases 2J, 2K y 2L — cadena de migraciones
 * v16 → v25 y ciclo backup/restore/reset.
 *
 * Cada fase que eleva el esquema EXTIENDE esta cadena en lugar de reescribirla:
 * así se prueba que una instalación antigua sigue migrando hasta hoy sin perder
 * nada. Hoy la cadena cubre cuatro puntos de partida reales:
 *
 *   v16 legacy → v24   una instalación vieja atraviesa TODAS las migraciones
 *   v22        → v24   corre v23 (Fase 2J) y v24 (Fase 2K), en ese orden
 *   v23        → v24   corre ÚNICAMENTE v24: la v23 ya se ejecutó y no se repite
 *   v24        → v24   reabrir no vuelve a migrar (idempotencia)
 *
 * Además verifica que las estructuras de AMBAS fases convivan: la tabla
 * `closingMeasurements` de la 2J y las ocho tablas de consolidación de la 2K.
 *
 * Luego prueba backup → reset → restore con datos del schema actual.
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
import { ensureDefaultPolicy, getActivePolicy } from '../../src/reporting/policy/policyRepository'
import { CURRENT_SCHEMA_VERSION } from '../../src/accounting/migration/versions'
import { migrateToV17 } from '../../src/accounting/migration/migrateV17'
import { migrateToV18 } from '../../src/accounting/migration/migrateV18'
import { migrateToV19 } from '../../src/accounting/migration/migrateV19'
import { migrateToV20 } from '../../src/accounting/migration/migrateV20'
import { migrateToV21 } from '../../src/accounting/migration/migrateV21'
import { migrateToV22 } from '../../src/accounting/migration/migrateV22'
import { migrateToV23 } from '../../src/accounting/migration/migrateV23'
import { migrateToV24 } from '../../src/accounting/migration/migrateV24'
import { migrateToV25 } from '../../src/accounting/migration/migrateV25'
import { saveInflationPolicy } from '../../src/reporting/closing/closingWorkPaperService'

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

/**
 * Definición encadenada v16→v24 (réplica exacta de las upgrades reales de
 * src/storage/db.ts). `upTo` permite detener la definición en una versión
 * intermedia para simular una instalación que quedó en ese punto.
 */
function defineChainDb(upTo = 25): Dexie {
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
    d.version(22).stores({ cashFlowPolicies: 'id, companyId, exerciseId, status' }).upgrade(migrateToV22)
    // v23 (Fase 2J): mediciones a valores corrientes al cierre
    if (upTo >= 23) {
        d.version(23).stores({
            closingMeasurements: 'id, companyId, exerciseId, accountId, status',
        }).upgrade(migrateToV23)
    }
    // v24 (Fase 2K): papeles de trabajo de consolidacion
    if (upTo >= 24) {
        d.version(24).stores({
            economicGroups: 'id, parentCompanyId, active',
            groupMembers: 'id, groupId, companyId, relation, method, [groupId+companyId]',
            consolidationExercises: 'id, groupId, reportingDate, status, [groupId+reportingDate]',
            consolidationMemberLinks: 'id, consolidationId, memberId, companyId, [consolidationId+companyId]',
            consolidationMappings: 'id, groupId, companyId, accountId, intragroupCategory, [groupId+companyId+accountId]',
            reciprocalBalances: 'id, consolidationId, creditorCompanyId, debtorCompanyId, kind, status',
            intragroupOperations: 'id, consolidationId, sellerCompanyId, buyerCompanyId, type',
            consolidationAdjustments: 'id, consolidationId, category, status',
        }).upgrade(migrateToV24)
    }
    if (upTo >= 25) {
        d.version(25).stores({
            closingWorkPapers: 'id, companyId, exerciseId, status, [companyId+exerciseId]',
        }).upgrade(migrateToV25)
    }
    return d
}

const CONSOLIDATION_TABLE_NAMES = [
    'economicGroups', 'groupMembers', 'consolidationExercises', 'consolidationMemberLinks',
    'consolidationMappings', 'reciprocalBalances', 'intragroupOperations', 'consolidationAdjustments',
]

/** Migraciones registradas en el audit log, en orden de ejecucion */
async function migrationsRun(chain: Dexie): Promise<string[]> {
    const rows = await chain.table('auditLog').toArray()
    return rows
        .filter((r: { eventType: string }) => r.eventType === 'MIGRATION_EXECUTED')
        .sort((a: { timestamp: string }, b: { timestamp: string }) => a.timestamp.localeCompare(b.timestamp))
        .map((r: { entityId: string }) => r.entityId)
}

/** Deja la base migrada hasta `version` y la cierra */
async function bringUpTo(version: number): Promise<void> {
    const partial = defineChainDb(version)
    await partial.open()
    partial.close()
}

describe('Fase 2F/2J/2K/2L — cadena de migraciones v16 → v25', () => {
    beforeEach(async () => { await Dexie.delete(DBN); await seedV16() })
    afterEach(async () => { await Dexie.delete(DBN) })

    it('la data v16 sobrevive y el schema queda en la version vigente con las tablas nuevas', async () => {
        const chain = defineChainDb()
        await chain.open()

        // datos preservados
        expect(await chain.table('entries').get('leg-1')).toBeDefined()
        const caja = await chain.table('accounts').get('caja')
        expect(caja.name).toBe('Caja')
        // contexto asignado por v17
        expect((await chain.table('entries').get('leg-1')).status).toBe('POSTED')
        // tablas nuevas existen y son usables
        expect(chain.tables.map(t => t.name)).toEqual(expect.arrayContaining(['expenseAllocationRules', 'manualDisclosures', 'reportSnapshots', 'inflationIndexSets', 'cashFlowPolicies']))
        // v23 (Fase 2J): mediciones a valores corrientes al cierre
        expect(chain.tables.map(t => t.name)).toEqual(expect.arrayContaining(['closingMeasurements']))
        // la migracion v23 no inventa mediciones
        expect(await chain.table('closingMeasurements').count()).toBe(0)
        // v24 (Fase 2K): tablas de consolidacion, estrictamente aditivas
        expect(chain.tables.map(t => t.name)).toEqual(expect.arrayContaining(CONSOLIDATION_TABLE_NAMES))
        // la migracion a v24 NO crea ningun grupo: un grupo economico es una
        // decision del usuario, no algo que el sistema deba suponer
        expect(await chain.table('economicGroups').count()).toBe(0)
        expect(await chain.table('groupMembers').count()).toBe(0)
        expect(chain.tables.map(t => t.name)).toContain('closingWorkPapers')
        expect(await chain.table('closingWorkPapers').count()).toBe(0)
        await chain.table('manualDisclosures').add({ id: 'm1', companyId: 'c', exerciseId: 'e', noteType: 'contingencias', title: 't', content: 'x', status: 'DRAFT', version: 1, createdAt: 'now', createdBy: 'a', updatedAt: 'now', updatedBy: 'a' })
        expect(await chain.table('manualDisclosures').count()).toBe(1)
        // v22: política EFE heredada creada de forma determinista para la empresa
        const policies = await chain.table('cashFlowPolicies').toArray()
        expect(policies.length).toBe(1)
        expect(policies[0].companyId).toBe('company-default')
        expect(policies[0].requiresReview).toBe(true)
        expect(policies[0].cashClassifications.some((c: { accountId: string }) => c.accountId === 'caja')).toBe(true)
        // metadata de sistema en la ultima version de la cadena
        const meta = await chain.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
        expect(meta.schemaVersion).toBe(25)
        expect(meta.lastMigrationId).toBe('v25-fase2l-pre-cierre-guiado')

        // Las DOS migraciones nuevas corrieron, y en orden: 2J antes que 2K
        const run = await migrationsRun(chain)
        expect(run).toContain('v23-closing-measurements')
        expect(run).toContain('v24-fase2k-consolidacion')
        expect(run).toContain('v25-fase2l-pre-cierre-guiado')
        expect(run.indexOf('v23-closing-measurements'))
            .toBeLessThan(run.indexOf('v24-fase2k-consolidacion'))
        expect(run.indexOf('v24-fase2k-consolidacion'))
            .toBeLessThan(run.indexOf('v25-fase2l-pre-cierre-guiado'))

        chain.close()
    })

    it('una base v22 llega a v25 corriendo v23, v24 y v25 en ese orden', async () => {
        await bringUpTo(22)

        const chain = defineChainDb()
        await chain.open()
        const run = await migrationsRun(chain)
        expect(run.filter(id => id === 'v23-closing-measurements')).toHaveLength(1)
        expect(run.filter(id => id === 'v24-fase2k-consolidacion')).toHaveLength(1)
        expect(run.filter(id => id === 'v25-fase2l-pre-cierre-guiado')).toHaveLength(1)
        expect(run.indexOf('v23-closing-measurements'))
            .toBeLessThan(run.indexOf('v24-fase2k-consolidacion'))

        const meta = await chain.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(25)
        // la data legacy sobrevivio a las dos migraciones
        expect(await chain.table('entries').get('leg-1')).toBeDefined()
        expect((await chain.table('accounts').get('caja')).name).toBe('Caja')
        chain.close()
    })

    it('una base YA en v23 ejecuta v24 y v25 sin repetir la v23', async () => {
        await bringUpTo(23)

        // Dato propio de la Fase 2J: debe sobrevivir a la migracion v24
        const at23 = defineChainDb(23)
        await at23.open()
        await at23.table('closingMeasurements').add({
            id: 'med-1', companyId: 'company-default', exerciseId: 'ex-2025',
            accountId: 'caja', status: 'DRAFT',
        })
        const runBefore = await migrationsRun(at23)
        expect(runBefore.filter(id => id === 'v23-closing-measurements')).toHaveLength(1)
        expect(runBefore).not.toContain('v24-fase2k-consolidacion')
        at23.close()

        const chain = defineChainDb()
        await chain.open()
        const run = await migrationsRun(chain)
        // la v23 NO se repite: sigue habiendo exactamente una ejecucion
        expect(run.filter(id => id === 'v23-closing-measurements')).toHaveLength(1)
        expect(run.filter(id => id === 'v24-fase2k-consolidacion')).toHaveLength(1)
        expect(run.filter(id => id === 'v25-fase2l-pre-cierre-guiado')).toHaveLength(1)

        const meta = await chain.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(25)
        expect(meta.lastMigrationId).toBe('v25-fase2l-pre-cierre-guiado')

        // la medicion de la Fase 2J sigue ahi: la v24 no recreo ni toco su tabla
        expect(await chain.table('closingMeasurements').count()).toBe(1)
        expect((await chain.table('closingMeasurements').get('med-1')).accountId).toBe('caja')
        // y las tablas de consolidacion existen y estan vacias
        expect(chain.tables.map(t => t.name)).toEqual(expect.arrayContaining(CONSOLIDATION_TABLE_NAMES))
        expect(await chain.table('economicGroups').count()).toBe(0)
        chain.close()
    })

    it('una base v24 ejecuta v25 una vez y una reapertura no vuelve a migrar', async () => {
        await bringUpTo(24)

        const first = defineChainDb()
        await first.open()
        const runFirst = await migrationsRun(first)
        expect(runFirst.filter(id => id === 'v25-fase2l-pre-cierre-guiado')).toHaveLength(1)
        await first.table('economicGroups').add({
            id: 'g-1', name: 'Grupo de prueba', parentCompanyId: 'company-default',
            presentationCurrency: 'ARS', measurementUnit: 'Moneda de cierre',
            createdAt: 'now', updatedAt: 'now', active: true,
        })
        first.close()

        const second = defineChainDb()
        await second.open()
        const runSecond = await migrationsRun(second)
        // ninguna migracion volvio a ejecutarse
        expect(runSecond).toEqual(runFirst)
        expect(runSecond.filter(id => id === 'v24-fase2k-consolidacion')).toHaveLength(1)
        expect(runSecond.filter(id => id === 'v25-fase2l-pre-cierre-guiado')).toHaveLength(1)
        // y el dato escrito por el usuario sigue intacto
        expect(await second.table('economicGroups').count()).toBe(1)
        expect((await second.table('economicGroups').get('g-1')).name).toBe('Grupo de prueba')
        second.close()
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

    it('ensureDefaultPolicy es idempotente (instalación fresca v22, sin migración)', async () => {
        // Base fresca (resetDb): las upgrades no corren en una base creada en v22.
        expect(await db.cashFlowPolicies.count()).toBe(0)
        const p1 = await ensureDefaultPolicy('company-default')
        const p2 = await ensureDefaultPolicy('company-default')
        expect(await db.cashFlowPolicies.count()).toBe(1)
        expect(p2.id).toBe(p1.id)
        const active = await getActivePolicy('company-default')
        expect(active?.interestsPaid).toBe('OPERATING')
    })

    it('el backup incluye la tabla de políticas EFE y el restore la recupera', async () => {
        await ensureDefaultPolicy('company-default')
        const backup = await exportBackup()
        expect(backup.tables.cashFlowPolicies.length).toBe(1)
        await resetApplication()
        expect(await db.cashFlowPolicies.count()).toBe(0)
        await restoreBackup(backup)
        expect(await db.cashFlowPolicies.count()).toBe(1)
    })

    it('el backup y restore conservan el papel de trabajo del pre-cierre v25', async () => {
        await saveInflationPolicy('company-default', 'ex-2025', {
            applicability: 'NO_APLICABLE', rationale: 'Contexto estable documentado para la prueba.',
        })
        const backup = await exportBackup()
        expect(backup.tables.closingWorkPapers).toHaveLength(1)
        await resetApplication()
        expect(await db.closingWorkPapers.count()).toBe(0)
        await restoreBackup(backup)
        expect(await db.closingWorkPapers.count()).toBe(1)
        expect((await db.closingWorkPapers.toCollection().first())?.inflation.rationale)
            .toContain('Contexto estable')
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
