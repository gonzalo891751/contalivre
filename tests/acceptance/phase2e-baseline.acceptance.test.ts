/**
 * GATE DE REGRESIÓN — FASE 2E (§4).
 *
 * Antes de agregar los estados y anexos pedagógicos, TODAS las afirmaciones
 * de las fases 2A–2D deben seguir siendo ciertas. Este gate las reproduce en
 * un flujo integrado + verificaciones estáticas de arquitectura. Se ejecuta
 * antes y después de la implementación 2E: si algo falla acá, primero se
 * corrige la regresión.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import {
    createDraftEntry,
    postDraft,
    postNewEntry,
    postOperation,
    updateDraftEntry,
    voidOperationEntry,
} from '../../src/accounting/application/journalService'
import {
    generateOpeningEntry,
    postClosing,
    previewClosing,
} from '../../src/accounting/application/closingService'
import { exerciseIdForYear, getExercise } from '../../src/accounting/application/contextService'
import { exportBackup } from '../../src/accounting/backup/backupService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { PostingError } from '../../src/accounting/domain/types'
import { db } from '../../src/storage/db'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const Y = 2025

function allSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
        else if (/\.(ts|tsx)$/.test(name)) out.push(full)
    }
    return out
}
const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const importsFrom = (c: string, m: string) =>
    new RegExp(`(import|export)[^;]*from\\s+['"][^'"]*${m.replace(/[/]/g, '\\/')}[^'"]*['"]`).test(c)

// ─────────────────────────────────────────────────────────────
// 1. Flujo funcional integrado (invariantes 2A/2B)
// ─────────────────────────────────────────────────────────────
describe('GATE 2E — invariantes contables previos', () => {
    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('borradores fuera de libros; POSTED inmutable; único escritor valida', async () => {
        const draft = await createDraftEntry({
            date: `${Y}-01-05`, memo: 'Aporte inicial', lines: simpleLines('caja', 'capital', 500000),
        })
        let s = await loadStatementsForYear(Y)
        expect(s.balanceSheet.totalAssets.amount).toBe(0)

        const posted = await postDraft(draft.id)
        expect(posted.status).toBe('POSTED')
        await expect(updateDraftEntry(posted.id, { memo: 'x' })).rejects.toThrow(PostingError)

        s = await loadStatementsForYear(Y)
        expect(s.balanceSheet.totalAssets.amount).toBe(500000)
    })

    it('reversión enlazada conserva el contenido económico', async () => {
        const { entry } = await postOperation({
            date: `${Y}-02-01`, memo: 'Compra mercaderías', lines: simpleLines('mercaderias', 'proveedores', 80000),
            sourceModule: 'inventory', sourceType: 'purchase', sourceId: 'gate2e-1',
        })
        await voidOperationEntry(entry.id, { reason: 'gate 2E' })
        const original = (await db.entries.get(entry.id))!
        expect(original.status).toBe('REVERSED')
        expect(original.lines[0].debit).toBe(80000)
        const s = await loadStatementsForYear(Y)
        expect(s.trialBalance.rows.find(r => r.accountId === 'mercaderias')?.closing ?? 0).toBe(0)
    })

    it('Diario=Mayor=Balance · A=P+PN · ER=EEPN · PN ESP=cierre EEPN', async () => {
        await postNewEntry({ date: `${Y}-03-01`, memo: 'Venta', lines: simpleLines('deudores', 'ventas', 120000) })
        await postNewEntry({ date: `${Y}-03-02`, memo: 'Gasto admin', lines: simpleLines('gastos', 'caja', 30000) })
        const s = await loadStatementsForYear(Y)
        for (const id of ['journal-balance', 'ledger-journal', 'equation', 'er-eepn', 'eepn-esp', 'opening-balance']) {
            expect(s.validation.checks.find(c => c.id === id)?.passed, id).toBe(true)
        }
    })

    it('EFE: directo = indirecto · efectivo final = ESP · variación = cierre − inicio', async () => {
        const s = await loadStatementsForYear(Y)
        for (const id of ['efe-metodos', 'efe-esp', 'efe-variacion']) {
            expect(s.validation.checks.find(c => c.id === id)?.passed, id).toBe(true)
        }
        const cf = s.cashFlowDirect!
        expect(cf.netChange.amount).toBe(cf.closingCash.amount - cf.openingCash.amount)
    })

    it('cierre → apertura: ejercicios aislados, resultado no se duplica', async () => {
        const exId = exerciseIdForYear(Y)
        const preview = await previewClosing(exId)
        expect(preview.canClose).toBe(true)
        await postClosing(exId)
        expect((await getExercise(exId))?.status).toBe('CLOSED')
        await generateOpeningEntry(exId)

        const next = await loadStatementsForYear(Y + 1)
        expect(next.incomeStatement.netIncome.amount).toBe(0)
        // PN heredado = capital 500.000 + resultado (120.000 − 30.000)
        expect(next.balanceSheet.equity.amount).toBe(590000)

        const current = await loadStatementsForYear(Y)
        expect(current.incomeStatement.netIncome.amount).toBe(90000)
    })

    it('backup sigue operativo (exporta todas las tablas)', async () => {
        const backup = await exportBackup()
        expect(backup.tables.entries.length).toBeGreaterThan(0)
        expect(backup.tables.accounts.length).toBeGreaterThan(0)
        expect(backup.schemaVersion).toBeGreaterThanOrEqual(19)
    })
})

// ─────────────────────────────────────────────────────────────
// 2. Arquitectura (afirmaciones 2C/2D que no deben regresar)
// ─────────────────────────────────────────────────────────────
describe('GATE 2E — arquitectura preservada', () => {
    const files = allSourceFiles(SRC)

    it('la pantalla Estados usa loadReportingBundle (motor canónico)', () => {
        const estados = readFileSync(join(SRC, 'pages', 'Estados.tsx'), 'utf-8')
        expect(importsFrom(estados, 'reporting/loadReportingBundle')).toBe(true)
        for (const legacy of ['utils/resultsStatement', 'core/statements', 'domain/reports/estadoResultados', 'espComparativeStore']) {
            expect(importsFrom(estados, legacy), `Estados.tsx importa ${legacy}`).toBe(false)
        }
    })

    it('las exportaciones usan el mismo ReportingBundle y no recalculan desde Dexie', () => {
        for (const f of ['src/pdf/reportBundlePdfFormal.ts', 'src/lib/exportReportBundle.ts']) {
            const c = readFileSync(join(ROOT, f), 'utf-8')
            expect(importsFrom(c, 'reporting/loadReportingBundle'), `${f} debe tipar contra el bundle`).toBe(true)
            expect(importsFrom(c, 'storage/db'), `${f} no debe consultar Dexie`).toBe(false)
        }
    })

    it('ningún componente de Estados consulta Dexie ni importa motores legacy', () => {
        const dir = join(SRC, 'components', 'Estados')
        for (const f of allSourceFiles(dir)) {
            const c = readFileSync(f, 'utf-8')
            expect(importsFrom(c, 'storage/db'), `${rel(f)} consulta Dexie`).toBe(false)
            for (const legacy of ['utils/resultsStatement', 'core/statements', 'domain/reports']) {
                expect(importsFrom(c, legacy), `${rel(f)} importa ${legacy}`).toBe(false)
            }
        }
    })

    it('los indicadores siguen saliendo del catálogo canónico', () => {
        const dash = readFileSync(join(SRC, 'components', 'Indicators', 'IndicatorsDashboard.tsx'), 'utf-8')
        expect(importsFrom(dash, 'hooks/useReportingBundle') || importsFrom(dash, 'reporting/loadReportingBundle')).toBe(true)
        expect(importsFrom(dash, 'utils/indicators')).toBe(false)
    })

    it('la Práctica guiada sigue fuera de la interfaz', () => {
        expect(existsSync(join(SRC, 'pages', 'PracticaPage.tsx'))).toBe(false)
        const app = readFileSync(join(SRC, 'App.tsx'), 'utf-8')
        expect(app.includes('<PracticaPage')).toBe(false)
        const offenders = files.filter(f => {
            if (rel(f).startsWith('src/accounting/scenarios/')) return false
            return importsFrom(readFileSync(f, 'utf-8'), 'accounting/scenarios')
        }).map(rel)
        expect(offenders).toEqual([])
    })

    it('el reseteo total y el backup siguen presentes en Configuración', () => {
        expect(existsSync(join(SRC, 'components', 'Configuracion', 'panels', 'DangerZonePanel.tsx'))).toBe(true)
        expect(existsSync(join(SRC, 'components', 'Configuracion', 'panels', 'BackupPanel.tsx'))).toBe(true)
    })

    it('no reaparecen rutas ni dependencias eliminadas (xlsx, RECPAM legacy)', () => {
        const offenders: string[] = []
        for (const f of files) {
            const c = readFileSync(f, 'utf-8')
            if (/from\s+['"]xlsx['"]/.test(c)) offenders.push(rel(f))
        }
        expect(offenders).toEqual([])
        expect(existsSync(join(SRC, 'core', 'cierre-valuacion', 'recpam-indirecto.ts'))).toBe(false)
    })
})
