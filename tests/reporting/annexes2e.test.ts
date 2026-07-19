/**
 * Fase 2E (§11/§12): anexo de bienes de uso por clase y moneda extranjera.
 * - clases estructurales (annexGroup), jamás inferidas por nombre;
 * - VO inicial/altas/bajas/final + dep. acumulada inicial/ejercicio/bajas/final;
 * - valor residual conciliado con el ESP;
 * - moneda extranjera: solo metadata estructural, cantidad/cotización
 *   declaradas como información insuficiente (sin fuentes automáticas).
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { UNCLASSIFIED_ASSET_CLASS } from '../../src/reporting/engine/fixedAssetsAnnex'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 600
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `x${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'rodados', code: '1.2.01', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'amort-rodados', code: '1.2.02', name: 'Amortización acumulada rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'muebles', code: '1.2.10', name: 'Muebles y útiles', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }), // sin annexGroup
    makeAccount({ id: 'banco-usd', code: '1.1.05', name: 'Banco cuenta en dólares', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', currency: 'USD', monetaryClassification: 'MONETARY' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'deprec', code: '4.3.02', name: 'Depreciación bienes de uso', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
]

function makeInput(entries: JournalEntry[], opening: [string, { debit: number; credit: number }][] = []): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(opening), accounts: ACCOUNTS }
}

describe('Fase 2E — anexo de bienes de uso', () => {
    it('cuadro por clase: VO, depreciaciones y residual conciliado con el ESP', () => {
        const s = buildStatements(makeInput([
            entry('2025-03-01', [{ accountId: 'rodados', debit: 500, credit: 0 }, { accountId: 'caja', debit: 0, credit: 500 }]),
            entry('2025-12-31', [{ accountId: 'deprec', debit: 90, credit: 0 }, { accountId: 'amort-rodados', debit: 0, credit: 90 }]),
        ], [
            ['rodados', { debit: 1000, credit: 0 }],
            ['amort-rodados', { debit: 0, credit: 200 }],
            ['caja', { debit: 200, credit: 0 }],
            ['capital', { debit: 0, credit: 1000 }],
        ]))
        const annex = s.fixedAssetsAnnex
        const rodados = annex.rows.find(r => r.assetClass === 'Rodados')!

        expect(rodados.grossOpening).toBe(1000)
        expect(rodados.additions).toBe(500)
        expect(rodados.grossClosing).toBe(1500)
        expect(rodados.accumDepOpening).toBe(200)
        expect(rodados.periodDepreciation).toBe(90)
        expect(rodados.accumDepClosing).toBe(290)
        expect(rodados.residual).toBe(1210)

        expect(annex.totals.residual).toBe(1210)
        expect(annex.validations.every(v => v.passed)).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'ppe-anexo')?.passed).toBe(true)
        expect(annex.hasUnclassified).toBe(false)
    })

    it('cuentas PPE sin clase: van a "Sin clase asignada" y se advierte (sin inferir por nombre)', () => {
        const s = buildStatements(makeInput([
            entry('2025-03-01', [{ accountId: 'muebles', debit: 300, credit: 0 }, { accountId: 'caja', debit: 0, credit: 300 }]),
        ], [['caja', { debit: 300, credit: 0 }], ['capital', { debit: 0, credit: 300 }]]))
        const annex = s.fixedAssetsAnnex
        expect(annex.hasUnclassified).toBe(true)
        const sinClase = annex.rows.find(r => r.assetClass === UNCLASSIFIED_ASSET_CLASS)!
        expect(sinClase.additions).toBe(300)
        expect(sinClase.residual).toBe(300)
    })

    it('bajas de bienes y de depreciación acumulada', () => {
        const s = buildStatements(makeInput([
            // venta del rodado: baja del VO y de la depreciación acumulada
            entry('2025-06-01', [
                { accountId: 'caja', debit: 700, credit: 0 },
                { accountId: 'amort-rodados', debit: 300, credit: 0 },
                { accountId: 'rodados', debit: 0, credit: 1000 },
            ]),
        ], [
            ['rodados', { debit: 1000, credit: 0 }],
            ['amort-rodados', { debit: 0, credit: 300 }],
            ['capital', { debit: 0, credit: 700 }],
        ]))
        const rodados = s.fixedAssetsAnnex.rows.find(r => r.assetClass === 'Rodados')
        // Tras la baja total el residual es 0 pero el cuadro muestra el movimiento
        expect(rodados?.disposals).toBe(1000)
        expect(rodados?.depDisposals).toBe(300)
        expect(rodados?.grossClosing).toBe(0)
        expect(rodados?.accumDepClosing).toBe(0)
        expect(rodados?.residual).toBe(0)
        expect(s.fixedAssetsAnnex.validations.every(v => v.passed)).toBe(true)
    })
})

describe('Fase 2E — moneda extranjera', () => {
    it('cuenta con currency estructural: fila con medición y cantidad/cotización insuficientes', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'banco-usd', debit: 850, credit: 0 }, { accountId: 'capital', debit: 0, credit: 850 }]),
        ]))
        const fx = s.foreignCurrency
        expect(fx.applicable).toBe(true)
        expect(fx.rows).toHaveLength(1)
        const row = fx.rows[0]
        expect(row.currency).toBe('USD')
        expect(row.side).toBe('ASSET')
        expect(row.measurement).toBe(850)
        expect(row.quantityStatus).toBe('INSUFFICIENT_INFORMATION')
        expect(fx.note).toContain('cotización automática')
    })

    it('sin cuentas en moneda extranjera: no aplicable (subtab oculto)', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'caja', debit: 100, credit: 0 }, { accountId: 'capital', debit: 0, credit: 100 }]),
        ]))
        expect(s.foreignCurrency.applicable).toBe(false)
        expect(s.foreignCurrency.rows).toHaveLength(0)
    })
})
