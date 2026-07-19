/**
 * Fase 2E (§8): notas cuantitativas como composición de rubros.
 * - numeración correlativa y referencia cruzada (noteRef en líneas del ESP);
 * - regularizadoras en negativo (previsión de incobrables);
 * - comparativo por cuenta y por total con variación;
 * - reconciliación nota ↔ estado por dos caminos de agregación;
 * - manual vs derivado: lo manual jamás pisa un total derivado.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildNotes } from '../../src/reporting/engine/buildNotes'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportLine, ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 300
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `n${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'deudores', code: '1.1.02', name: 'Deudores por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'prevision', code: '1.1.03', name: 'Previsión para incobrables', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', isContra: true, normalSide: 'CREDIT' }),
    makeAccount({ id: 'proveedores', code: '2.1.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'quebrantos', code: '4.5.01', name: 'Quebrantos por incobrabilidad', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'intereses-perdidos', code: '4.4.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES' }),
]

function makeInput(entries: JournalEntry[]): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS }
}

const SCENARIO = [
    entry('2025-01-05', [{ accountId: 'caja', debit: 1000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 1000 }]),
    entry('2025-02-01', [{ accountId: 'deudores', debit: 350, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 350 }]),
    entry('2025-12-31', [{ accountId: 'quebrantos', debit: 200, credit: 0 }, { accountId: 'prevision', debit: 0, credit: 200 }]),
    entry('2025-06-01', [{ accountId: 'intereses-perdidos', debit: 40, credit: 0 }, { accountId: 'caja', debit: 0, credit: 40 }]),
]

describe('Fase 2E — notas cuantitativas', () => {
    it('créditos por ventas: regularizadora en negativo, neto reconciliado', () => {
        const input = makeInput(SCENARIO)
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)
        const nota = notes.find(n => n.id === 'nota-creditos-ventas')!

        const bruto = nota.lines.find(l => l.accountIds[0] === 'deudores')!
        const prev = nota.lines.find(l => l.accountIds[0] === 'prevision')!
        expect(bruto.amount).toBe(350)
        expect(prev.amount).toBe(-200)          // en negativo, no escondida en el neto
        expect(prev.isContra).toBe(true)
        expect(prev.label).toContain('(regularizadora)')
        expect(nota.total).toBe(150)
        expect(nota.reconciled).toBe(true)
    })

    it('numeración correlativa y noteRef estampado en las líneas del ESP', () => {
        const input = makeInput(SCENARIO)
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)

        const numbers = notes.map(n => n.number)
        expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
        expect(new Set(numbers).size).toBe(numbers.length)

        const notaCreditos = notes.find(n => n.id === 'nota-creditos-ventas')!
        const accountLines: ReportLine[] = []
        const walk = (l: ReportLine) => { accountLines.push(l); for (const c of l.children ?? []) walk(c) }
        walk(bundle.balanceSheet.currentAssets)
        const deudoresLine = accountLines.find(l => l.level === 2 && l.accountIds[0] === 'deudores')!
        expect(deudoresLine.noteRef).toBe(String(notaCreditos.number))

        // El renglón de resultados financieros del ER referencia su nota
        const notaRf = notes.find(n => n.id === 'nota-resultados-financieros')!
        expect(bundle.incomeStatement.financialResults.noteRef).toBe(String(notaRf.number))
    })

    it('resultados financieros: composición desde el renglón del ER', () => {
        const input = makeInput(SCENARIO)
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)
        const nota = notes.find(n => n.id === 'nota-resultados-financieros')!
        expect(nota.total).toBe(bundle.incomeStatement.financialResults.amount)
        expect(nota.total).toBe(-40)
        expect(nota.reconciled).toBe(true)
        expect(nota.lines[0].accountIds).toEqual(['intereses-perdidos'])
    })

    it('comparativo: importe por cuenta, total comparativo y variación calculable', () => {
        const prevInput = makeInput([
            entry('2025-01-05', [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'capital', debit: 0, credit: 500 }]),
            entry('2025-03-01', [{ accountId: 'deudores', debit: 100, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 100 }]),
        ])
        const prev = buildStatements(prevInput)
        const input = makeInput(SCENARIO)
        input.comparative = prev
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)

        const nota = notes.find(n => n.id === 'nota-creditos-ventas')!
        const bruto = nota.lines.find(l => l.accountIds[0] === 'deudores')!
        expect(bruto.comparativeAmount).toBe(100)
        expect(nota.comparativeTotal).toBe(100)
        expect(nota.total).toBe(150)  // variación +50 calculable en la vista
    })

    it('notas sin saldos: NOT_APPLICABLE con total nulo (nunca cero fingido)', () => {
        const input = makeInput(SCENARIO)
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)
        const inversiones = notes.find(n => n.id === 'nota-inversiones')!
        expect(inversiones.total).toBeNull()
        expect(inversiones.lines[0].origin).toBe('NOT_APPLICABLE')
        expect(inversiones.reconciled).toBeNull()
    })

    it('lo manual queda identificado y no altera totales derivados', () => {
        const input = makeInput(SCENARIO)
        const bundle = buildStatements(input)
        const notes = buildNotes(input, bundle)
        const manual = notes.find(n => n.id === 'nota-contingencias')!
        expect(manual.lines[0].origin).toBe('NOT_AVAILABLE')
        expect(manual.total).toBeNull()
        // Ninguna nota manual toca los totales de las derivadas
        const derivadas = notes.filter(n => n.lines.some(l => l.origin === 'DERIVED'))
        expect(derivadas.every(n => n.total !== null)).toBe(true)
    })
})
