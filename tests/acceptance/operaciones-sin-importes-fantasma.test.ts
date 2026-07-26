/**
 * Fase 2H §H9 — La portada de Operaciones no puede inventar importes.
 *
 * Bug reproducido: `OperacionesPage` mostraba "$ 320.000" en Proveedores y
 * "2 Vencimientos" literalmente escritos en el JSX, y calculaba Ventas/CMV con
 * aritmética propia sobre las entradas del diario sin filtrar empresa ni estado
 * del asiento. Con una empresa sin movimientos la pantalla exhibía deuda
 * inexistente.
 *
 * Estas pruebas fijan que cada cifra de la portada sale del ReportingBundle
 * canónico y hereda sus filtros (contabilizado / empresa / ejercicio).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../../src/storage/db'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import {
    postNewEntry,
    createDraftEntry,
    reverseEntry,
} from '../../src/accounting/application/journalService'
import {
    getEntriesForContext,
    resolveContextForYear,
} from '../../src/accounting/reporting/reportingContext'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { summarizeOperationsModules } from '../../src/reporting/operationsSelectors'

const ROOT = join(__dirname, '..', '..')
const YEAR = 2026

async function summarize() {
    const bundle = await loadReportingBundle(YEAR)
    const accounts = await db.accounts.toArray()
    return summarizeOperationsModules(bundle, accounts)
}

describe('Fase 2H §H9 — empresa sin movimientos', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('todos los módulos informan cero, sin importes fantasma', async () => {
        const summaries = await summarize()

        for (const [id, summary] of Object.entries(summaries)) {
            expect(summary.amount, `${id} debería informar 0`).toBe(0)
            expect(summary.entryIds, `${id} no debería tener asientos`).toHaveLength(0)
            expect(summary.status, `${id} no debería figurar con movimientos`).not.toBe('WITH_MOVEMENTS')
        }
    })

    it('Proveedores informa 0, no los $ 320.000 cableados', async () => {
        const { proveedores } = await summarize()
        expect(proveedores.amount).toBe(0)
        expect(proveedores.amount).not.toBe(320000)
        expect(proveedores.status).toBe('NO_MOVEMENTS')
    })

    it('el cero se expresa de forma uniforme: nunca -0', async () => {
        const summaries = await summarize()
        for (const [id, summary] of Object.entries(summaries)) {
            // Object.is distingue -0 de 0: un saldo acreedor nulo negado daría
            // "-$ 0,00" en pantalla.
            expect(Object.is(summary.amount, -0), `${id} devolvió cero negativo`).toBe(false)
        }
    })
})

describe('Fase 2H §H9 — filtros canónicos heredados', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('un asiento contabilizado se refleja en el módulo correspondiente', async () => {
        await postNewEntry({
            date: `${YEAR}-03-10`,
            memo: 'Compra de mercaderías a crédito',
            lines: simpleLines('mercaderias', 'proveedores', 150000),
        })

        const { proveedores, inventario } = await summarize()

        // El pasivo se presenta positivo como "saldo a pagar".
        expect(proveedores.amount).toBe(150000)
        expect(proveedores.status).toBe('WITH_MOVEMENTS')
        expect(proveedores.entryIds).toHaveLength(1)

        expect(inventario.amount).toBe(150000)
        expect(inventario.status).toBe('WITH_MOVEMENTS')
    })

    it('un borrador NO se computa como contabilizado', async () => {
        await createDraftEntry({
            date: `${YEAR}-03-10`,
            memo: 'Borrador de compra',
            lines: simpleLines('mercaderias', 'proveedores', 999000),
        })

        const { proveedores } = await summarize()
        expect(proveedores.amount).toBe(0)
        expect(proveedores.status).toBe('NO_MOVEMENTS')
        expect(proveedores.entryIds).toHaveLength(0)
    })

    it('el filtro por empresa que hereda la portada excluye a otras empresas', async () => {
        await postNewEntry({
            date: `${YEAR}-03-10`,
            memo: 'Compra propia',
            lines: simpleLines('mercaderias', 'proveedores', 100000),
        })

        // La portada no filtra por su cuenta: consume el bundle, que se arma con
        // getEntriesForContext. El aislamiento entre empresas se verifica ahí.
        const own = await resolveContextForYear(YEAR)
        expect(await getEntriesForContext(own)).toHaveLength(1)

        const other = { ...own, companyId: 'otra-empresa-sa' }
        expect(await getEntriesForContext(other)).toHaveLength(0)
    })

    it('un asiento del ejercicio anterior entra como saldo inicial, no como movimiento', async () => {
        await postNewEntry({
            date: `${YEAR - 1}-06-15`,
            memo: 'Compra del ejercicio anterior',
            lines: simpleLines('mercaderias', 'proveedores', 77000),
        })

        const { proveedores } = await summarize()

        // La deuda del ejercicio anterior sigue existiendo al cierre: el motor la
        // incorpora como saldo de apertura. Lo que NO puede ocurrir es que se
        // compute como movimiento del ejercicio en curso.
        expect(proveedores.amount).toBe(77000)
        expect(proveedores.entryIds).toHaveLength(0)
        expect(proveedores.status).toBe('NO_MOVEMENTS')
    })

    it('una reversión deja el módulo nuevamente en cero', async () => {
        const entry = await postNewEntry({
            date: `${YEAR}-03-10`,
            memo: 'Compra a revertir',
            lines: simpleLines('mercaderias', 'proveedores', 50000),
        })
        expect((await summarize()).proveedores.amount).toBe(50000)

        await reverseEntry(entry.id, { date: `${YEAR}-03-20`, reason: 'prueba de reversión' })

        const { proveedores } = await summarize()
        expect(proveedores.amount).toBe(0)
    })

    it('un módulo sin cuentas mapeadas se marca NEEDS_MAPPING, no cero engañoso', async () => {
        // El plan de prueba no tiene cuentas PAYROLL_LIABILITIES.
        const summaries = await summarize()
        const payroll = summaries['deudas-sociales']
        expect(payroll.accountCount).toBe(0)
        expect(payroll.status).toBe('NEEDS_MAPPING')
    })
})

describe('Fase 2H §H9 — invariantes de la portada', () => {
    // La cabecera del archivo DOCUMENTA el bug corregido y cita a propósito los
    // valores viejos. Las invariantes son sobre código, así que se quitan los
    // comentarios antes de comparar.
    const page = readFileSync(join(ROOT, 'src', 'pages', 'OperacionesPage.tsx'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

    it('no quedan importes cableados en el JSX', () => {
        expect(page).not.toContain('320.000')
        expect(page).not.toMatch(/\$\s?\d{1,3}(\.\d{3})+/)
    })

    it('no quedan vencimientos inventados', () => {
        expect(page).not.toContain('2 Vencimientos')
    })

    it('la portada deriva del motor canónico y no recorre el diario', () => {
        expect(page).toContain('summarizeOperationsModules')
        expect(page).toContain('useReportingBundle')
        // La aritmética paralela sobre asientos se eliminó.
        expect(page).not.toContain('db.entries')
        expect(page).not.toContain('calculateAllValuations')
    })

    it('se retiraron las tarjetas de KPI y los accesos globales duplicados', () => {
        for (const removed of ['Ventas (Mes)', 'CMV (Mes)', 'Margen Bruto', 'Registrar Venta', 'Registrar Compra']) {
            expect(page, `debía retirarse "${removed}"`).not.toContain(removed)
        }
    })
})
