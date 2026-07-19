/**
 * Fase 2E (§6): EEPN matricial de doble entrada.
 * - columnas dinámicas por componente estructural (equityComponent /
 *   derivación desde statementGroup, jamás por nombre);
 * - clasificación estructural de movimientos (aportes, retiros,
 *   distribuciones, reservas, capitalización, absorción);
 * - transferencias internas con fila que suma 0;
 * - saldo inicial ajustado + variaciones = cierre; cierre = EEPN = ESP;
 * - apertura formal como saldo inicial (no variación);
 * - comparativo con los totales del ejercicio anterior.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { deriveEquityComponent } from '../../src/reporting/engine/equityMatrix'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { EquityMatrixRow, ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 100
function entry(
    date: string,
    lines: { accountId: string; debit: number; credit: number }[],
    extra: Partial<JournalEntry> = {}
): JournalEntry {
    seq += 1
    return {
        id: `m${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date, ...extra,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ajuste-capital', code: '3.1.02', name: 'Ajuste de capital', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL_ADJUSTMENT' }),
    makeAccount({ id: 'reserva-legal', code: '3.3.01', name: 'Reserva legal', kind: 'EQUITY', statementGroup: 'RESERVES', equityComponent: 'LEGAL_RESERVE' }),
    makeAccount({ id: 'rna', code: '3.4.01', name: 'Resultados no asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'gastos', code: '4.3.01', name: 'Gastos', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
]

function input(entries: JournalEntry[], opening: [string, { debit: number; credit: number }][] = []): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(opening), accounts: ACCOUNTS }
}

const findRow = (rows: EquityMatrixRow[], type: string) => rows.find(r => r.type === type)!

describe('Fase 2E — EEPN matricial', () => {
    it('deriva componentes estructuralmente (mapping explícito > statementGroup)', () => {
        expect(deriveEquityComponent(ACCOUNTS.find(a => a.id === 'capital')!)).toBe('CAPITAL')
        expect(deriveEquityComponent(ACCOUNTS.find(a => a.id === 'ajuste-capital')!)).toBe('CAPITAL_ADJUSTMENT')
        expect(deriveEquityComponent(ACCOUNTS.find(a => a.id === 'reserva-legal')!)).toBe('LEGAL_RESERVE')
        expect(deriveEquityComponent(ACCOUNTS.find(a => a.id === 'rna')!)).toBe('PRIOR_RETAINED_EARNINGS')
    })

    it('escenario completo: aportes, reservas, distribuciones y resultado', () => {
        const s = buildStatements(input([
            entry('2025-02-01', [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'capital', debit: 0, credit: 500 }]),
            entry('2025-03-01', [{ accountId: 'rna', debit: 50, credit: 0 }, { accountId: 'reserva-legal', debit: 0, credit: 50 }]),
            entry('2025-04-01', [{ accountId: 'rna', debit: 100, credit: 0 }, { accountId: 'caja', debit: 0, credit: 100 }]),
            entry('2025-05-01', [{ accountId: 'caja', debit: 300, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 300 }]),
        ], [
            ['capital', { debit: 0, credit: 1000 }],
            ['rna', { debit: 0, credit: 200 }],
            ['caja', { debit: 1200, credit: 0 }],
        ]))
        const m = s.equityMatrix

        // Columnas dinámicas: solo los componentes con datos
        const comps = m.columns.map(c => c.component)
        expect(comps).toContain('CAPITAL')
        expect(comps).toContain('LEGAL_RESERVE')
        expect(comps).toContain('PRIOR_RETAINED_EARNINGS')
        expect(comps).toContain('CURRENT_RESULT')
        expect(comps).not.toContain('SHARE_PREMIUM')

        // Saldos al inicio
        expect(m.openingRow.total).toBe(1200)
        expect(m.openingRow.cells.CAPITAL).toBe(1000)
        expect(m.openingRow.cells.PRIOR_RETAINED_EARNINGS).toBe(200)

        // Aporte externo
        const aportes = findRow(m.movementRows, 'CONTRIBUTION')
        expect(aportes.cells.CAPITAL).toBe(500)
        expect(aportes.total).toBe(500)

        // Constitución de reservas: transferencia interna, fila suma 0
        const reserva = findRow(m.movementRows, 'RESERVE_CREATION')
        expect(reserva.cells.LEGAL_RESERVE).toBe(50)
        expect(reserva.cells.PRIOR_RETAINED_EARNINGS).toBe(-50)
        expect(reserva.total).toBe(0)

        // Distribución con contrapartida externa
        const distrib = findRow(m.movementRows, 'DISTRIBUTION')
        expect(distrib.cells.PRIOR_RETAINED_EARNINGS).toBe(-100)
        expect(distrib.total).toBe(-100)

        // Resultado del ejercicio en su propia columna
        const resultado = findRow(m.movementRows, 'CURRENT_RESULT')
        expect(resultado.cells.CURRENT_RESULT).toBe(300)

        // Totales: inicio ajustado + variaciones = cierre; cierre = EEPN = ESP
        expect(m.totalVariationsRow.total).toBe(700)
        expect(m.closingRow.total).toBe(1900)
        expect(m.closingRow.cells.CAPITAL).toBe(1500)
        expect(m.closingRow.cells.LEGAL_RESERVE).toBe(50)
        expect(m.closingRow.cells.PRIOR_RETAINED_EARNINGS).toBe(50)
        expect(m.closingRow.cells.CURRENT_RESULT).toBe(300)
        expect(m.closingRow.total).toBe(s.equityStatement.closingBalance.amount)
        expect(m.closingRow.total).toBe(s.balanceSheet.equity.amount)

        // Invariantes: internos de la matriz + puente en la validación global
        expect(m.validations.every(v => v.passed)).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'eepn-matrix-closing')?.passed).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'eepn-matrix-internal')?.passed).toBe(true)
    })

    it('capitalización y absorción de pérdidas: transferencias internas con fila 0', () => {
        const s = buildStatements(input([
            entry('2025-02-01', [{ accountId: 'rna', debit: 80, credit: 0 }, { accountId: 'capital', debit: 0, credit: 80 }]),
            entry('2025-03-01', [{ accountId: 'capital', debit: 60, credit: 0 }, { accountId: 'rna', debit: 0, credit: 60 }]),
        ], [
            ['capital', { debit: 0, credit: 500 }],
            ['rna', { debit: 0, credit: 300 }],
            ['caja', { debit: 800, credit: 0 }],
        ]))
        const m = s.equityMatrix

        const capitalizacion = findRow(m.movementRows, 'CAPITALIZATION')
        expect(capitalizacion.cells.CAPITAL).toBe(80)
        expect(capitalizacion.cells.PRIOR_RETAINED_EARNINGS).toBe(-80)
        expect(capitalizacion.total).toBe(0)

        const absorcion = findRow(m.movementRows, 'LOSS_ABSORPTION')
        expect(absorcion.cells.CAPITAL).toBe(-60)
        expect(absorcion.cells.PRIOR_RETAINED_EARNINGS).toBe(60)
        expect(absorcion.total).toBe(0)

        expect(m.closingRow.total).toBe(800)
        expect(m.validations.every(v => v.passed)).toBe(true)
    })

    it('retiros con contrapartida externa', () => {
        const s = buildStatements(input([
            entry('2025-02-01', [{ accountId: 'capital', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }]),
        ], [
            ['capital', { debit: 0, credit: 400 }],
            ['caja', { debit: 400, credit: 0 }],
        ]))
        const retiro = findRow(s.equityMatrix.movementRows, 'WITHDRAWAL')
        expect(retiro.cells.CAPITAL).toBe(-90)
        expect(s.equityMatrix.closingRow.total).toBe(310)
    })

    it('la apertura formal integra los saldos al inicio, nunca las variaciones', () => {
        const s = buildStatements(input([
            entry('2025-01-01', [
                { accountId: 'caja', debit: 590, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 500 },
                { accountId: 'rna', debit: 0, credit: 90 },
            ], { sourceModule: 'closing', sourceType: 'apertura' }),
            entry('2025-06-01', [{ accountId: 'caja', debit: 100, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 100 }]),
        ]))
        const m = s.equityMatrix
        expect(m.openingRow.total).toBe(590)
        expect(m.openingRow.cells.CAPITAL).toBe(500)
        expect(m.openingRow.cells.PRIOR_RETAINED_EARNINGS).toBe(90)
        expect(findRow(m.movementRows, 'CONTRIBUTION').hasData).toBe(false)
        expect(m.totalVariationsRow.total).toBe(100)
        expect(m.closingRow.total).toBe(690)
        expect(m.validations.every(v => v.passed)).toBe(true)
    })

    it('comparativo: totales del ejercicio anterior derivados con el mismo motor', () => {
        const prev = buildStatements(input([
            entry('2025-02-01', [{ accountId: 'caja', debit: 400, credit: 0 }, { accountId: 'capital', debit: 0, credit: 400 }]),
            entry('2025-05-01', [{ accountId: 'caja', debit: 150, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 150 }]),
        ]))
        const current = input([
            entry('2025-06-01', [{ accountId: 'caja', debit: 200, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 200 }]),
        ], [['capital', { debit: 0, credit: 400 }], ['rna', { debit: 0, credit: 150 }], ['caja', { debit: 550, credit: 0 }]])
        current.comparative = prev
        const s = buildStatements(current)
        expect(s.equityMatrix.comparative).toEqual({ openingTotal: 0, closingTotal: 550, periodResult: 150 })
    })

    it('sin datos de PN: matriz vacía sin columnas fantasma ni ceros inventados', () => {
        const s = buildStatements(input([]))
        expect(s.equityMatrix.columns.filter(c => c.component !== 'CURRENT_RESULT')).toEqual([])
        expect(s.equityMatrix.closingRow.total).toBe(0)
    })
})
