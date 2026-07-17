/**
 * Fase 2B — Motor de inflación y RECPAM (§10, §18.3).
 * Índices controlados: enero 100, julio 160, diciembre 200.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import {
    anticuateMovements,
    computeInflationAdjustment,
    getCoefficient,
} from '../../src/accounting/inflation/engine'
import { hashIndexValues, indexSetToMap, listIndexSets, saveIndexSet } from '../../src/accounting/inflation/indexRegistry'
import { db } from '../../src/storage/db'
import type { Account, JournalEntry } from '../../src/core/models'

const INDEXES = new Map([
    ['2025-01', 100],
    ['2025-07', 160],
    ['2025-12', 200],
])
const CLOSE = '2025-12'

async function loadInputs() {
    const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
    const accounts = await db.accounts.toArray()
    return { entries, accounts }
}

/** Escenario 18.3: capital y PPE de enero; inventario y venta de julio */
async function seedInflationScenario() {
    await postNewEntry({ date: '2025-01-10', memo: 'Aporte de capital', lines: simpleLines('caja', 'capital', 1000000) })
    await postNewEntry({ date: '2025-01-20', memo: 'Compra PPE contado', lines: simpleLines('bienes-uso', 'caja', 600000) })
    await postNewEntry({ date: '2025-07-05', memo: 'Compra inventario a crédito', lines: simpleLines('mercaderias', 'proveedores', 200000) })
    await postNewEntry({ date: '2025-07-15', memo: 'Venta a crédito', lines: simpleLines('deudores', 'ventas', 100000) })
}

describe('Fase 2B — coeficientes e índices', () => {
    it('coeficiente = índice cierre / índice origen; faltante = null', () => {
        expect(getCoefficient(INDEXES, '2025-01', CLOSE)).toBe(2)
        expect(getCoefficient(INDEXES, '2025-07', CLOSE)).toBe(1.25)
        expect(getCoefficient(INDEXES, '2025-03', CLOSE)).toBeNull()
        expect(getCoefficient(new Map(), '2025-01', CLOSE)).toBeNull()
    })
})

describe('Fase 2B — golden inflación (§18.3)', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedInflationScenario()
    })

    it('anticuación: agrupa por cuenta y mes de origen real', async () => {
        const { entries } = await loadInputs()
        const movements = anticuateMovements(entries)
        const ppe = movements.find(m => m.accountId === 'bienes-uso')!
        expect(ppe.originPeriod).toBe('2025-01')
        expect(ppe.netAmount).toBe(600000)
        const merc = movements.find(m => m.accountId === 'mercaderias')!
        expect(merc.originPeriod).toBe('2025-07')
    })

    it('reexpresión exacta: capital 2.000.000, PPE 1.200.000, inventario 250.000', async () => {
        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE, indexes: INDEXES,
        })

        const byAccount = result.adjustmentByAccount
        expect(byAccount.get('capital')).toBe(-1000000)   // ajuste acreedor (netDC −1M × 1)
        expect(byAccount.get('bienes-uso')).toBe(600000)  // 600.000 × (2−1)
        expect(byAccount.get('mercaderias')).toBe(50000)  // 200.000 × 0,25
        expect(byAccount.get('ventas')).toBe(-25000)      // −100.000 × 0,25

        const ppe = result.items.find(i => i.accountId === 'bienes-uso')!
        expect(ppe.restatedAmount).toBe(1200000)
        expect(ppe.coefficient).toBe(2)
        const capital = result.items.find(i => i.accountId === 'capital')!
        expect(capital.restatedAmount).toBe(-2000000)     // netDC acreedor
    })

    it('RECPAM: pérdida de 375.000 y los métodos concilian exactamente', async () => {
        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE, indexes: INDEXES,
        })

        // Directo: caja +400.000 de enero (pierde 400.000) y posición neta
        // pasiva de julio −100.000 (gana 25.000) ⇒ pérdida 375.000
        expect(result.recpamDirect.recpam).toBe(-375000)
        expect(result.recpamIndirect.recpam).toBe(-375000)
        expect(result.reconciled).toBe(true)
        expect(result.reconciliationDifference).toBe(0)
        expect(result.missingPeriods).toEqual([])
        expect(result.insufficientOrigins).toEqual([])
    })

    it('el comprobante propuesto balancea y el RECPAM va al Debe (pérdida)', async () => {
        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE,
            indexes: INDEXES, recpamAccountId: 'recpam',
        })
        const lines = result.proposedVoucherLines!
        const debit = lines.reduce((s, l) => s + l.debit, 0)
        const credit = lines.reduce((s, l) => s + l.credit, 0)
        expect(debit).toBe(credit)
        const recpamLine = lines.find(l => l.accountId === 'recpam')!
        expect(recpamLine.debit).toBe(375000)
        expect(result.canPost).toBe(true)
    })
})

describe('Fase 2B — bloqueos del ajuste', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('índice faltante bloquea e informa el período (nunca coeficiente 1)', async () => {
        await postNewEntry({ date: '2025-03-10', memo: 'compra marzo', lines: simpleLines('mercaderias', 'caja', 1000) })
        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE, indexes: INDEXES,
        })
        expect(result.missingPeriods).toContain('2025-03')
        expect(result.canPost).toBe(false)
        expect(result.blockers.some(b => b.includes('2025-03'))).toBe(true)
        // La partida sin índice NO se reexpresó con coeficiente 1
        expect(result.items.some(i => i.originPeriod === '2025-03')).toBe(false)
    })

    it('origen desconocido (apertura sin anticuación) = información insuficiente', async () => {
        const opening = new Map([['mercaderias', { debit: 500, credit: 0 }]])
        const { accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries: [], accounts, openingBalances: opening, closePeriod: CLOSE, indexes: INDEXES,
        })
        expect(result.insufficientOrigins).toHaveLength(1)
        expect(result.insufficientOrigins[0].accountId).toBe('mercaderias')
        expect(result.canPost).toBe(false)
    })

    it('inflación cero: coeficientes 1 y RECPAM 0', async () => {
        await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        const flat = new Map([['2025-01', 100], ['2025-12', 100]])
        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE, indexes: flat,
        })
        expect(result.recpamIndirect.recpam).toBe(0)
        expect(result.recpamDirect.recpam).toBe(0)
        expect(result.reconciled).toBe(true)
    })

    it('cuenta sin clasificación monetaria: el directo se declara no verificable', async () => {
        const unclassified: Account = {
            id: 'inversion-mixta', code: '1.1.05.01', name: 'Inversión mixta',
            kind: 'ASSET', section: 'CURRENT', group: 'Inversiones',
            statementGroup: 'INVESTMENTS', parentId: null, level: 3,
            normalSide: 'DEBIT', isContra: false, isHeader: false,
            monetaryClassification: 'MIXED',
        }
        await db.accounts.add(unclassified)
        await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-07-01', memo: 'inversión', lines: simpleLines('inversion-mixta', 'caja', 400) })

        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE, indexes: INDEXES,
        })
        expect(result.recpamDirect.warnings.some(w => w.includes('No verificable'))).toBe(true)
        expect(result.canPost).toBe(false)
    })
})

describe('Fase 2B — registro versionado de índices (§10.2)', () => {
    beforeEach(async () => {
        await resetDb()
    })

    it('guarda proveniencia completa con hash y versión', async () => {
        const set = await saveIndexSet({
            name: 'FACPCE 2025 (prueba)',
            status: 'MANUAL',
            source: 'Carga manual desde facpce.org.ar',
            sourceUrl: 'https://www.facpce.org.ar/indices-facpce/',
            values: [
                { period: '2025-01', value: 100 },
                { period: '2025-07', value: 160 },
                { period: '2025-12', value: 200 },
            ],
        })
        expect(set.contentHash).toMatch(/^djb2:/)
        expect(set.version).toBe(1)
        expect(set.status).toBe('MANUAL')

        const map = indexSetToMap(set)
        expect(map.get('2025-07')).toBe(160)
    })

    it('detecta alteraciones por hash', async () => {
        const set = await saveIndexSet({
            name: 'X', status: 'EXAMPLE', source: 'demo',
            values: [{ period: '2025-01', value: 100 }],
        })
        const tampered = { ...set, values: [{ period: '2025-01', value: 999 }] }
        expect(() => indexSetToMap(tampered)).toThrow(/alterado/)
    })

    it('rechaza índices inválidos y no mezcla estados', async () => {
        await expect(saveIndexSet({
            name: 'Y', status: 'OFFICIAL', source: 's',
            values: [{ period: '2025-13', value: 100 }],
        })).rejects.toThrow(/inválidos/)

        await saveIndexSet({ name: 'ej', status: 'EXAMPLE', source: 'demo', values: [{ period: '2025-01', value: 1 }] })
        await saveIndexSet({ name: 'of', status: 'OFFICIAL', source: 'FACPCE', values: [{ period: '2025-01', value: 1 }] })
        const sets = await listIndexSets()
        expect(sets.filter(s => s.status === 'EXAMPLE')).toHaveLength(1)
        expect(sets.filter(s => s.status === 'OFFICIAL')).toHaveLength(1)
    })

    it('el hash es determinista e independiente del orden', () => {
        const a = hashIndexValues([{ period: '2025-02', value: 110 }, { period: '2025-01', value: 100 }])
        const b = hashIndexValues([{ period: '2025-01', value: 100 }, { period: '2025-02', value: 110 }])
        expect(a).toBe(b)
    })
})

describe('Fase 2B — el ajuste se contabiliza como DRAFT idempotente', () => {
    it('el comprobante propuesto entra por el servicio único como borrador', async () => {
        await resetDb()
        await seedTestAccounts()
        await db.accounts.add({
            id: 'recpam', code: '4.5.01', name: 'RECPAM', kind: 'EXPENSE',
            section: 'FINANCIAL', group: 'Resultados financieros',
            statementGroup: 'FINANCIAL_EXPENSES', parentId: null, level: 2,
            normalSide: 'DEBIT', isContra: false, isHeader: false,
            allowOppositeBalance: true,
        } as Account)
        await seedInflationScenario()

        const { entries, accounts } = await loadInputs()
        const result = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: CLOSE,
            indexes: INDEXES, recpamAccountId: 'recpam',
        })
        expect(result.canPost).toBe(true)

        const { createDraftEntry } = await import('../../src/accounting/application/journalService')
        const draft = await createDraftEntry({
            date: '2025-12-31',
            memo: 'Ajuste por inflación RT 54 TO RT 59',
            lines: result.proposedVoucherLines!,
            sourceModule: 'inflation',
            sourceType: 'rt6-adjustment',
            sourceId: 'cierre-2025',
        })
        expect(draft.status).toBe('DRAFT')

        // No impacta libros hasta contabilizar
        const book = (await db.entries.toArray()).filter((e: JournalEntry) => e.status !== 'DRAFT')
        expect(book.some(e => e.sourceModule === 'inflation')).toBe(false)
    })
})
