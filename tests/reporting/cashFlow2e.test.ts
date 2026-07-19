/**
 * Fase 2E (§7): EFE pedagógico y explicativo.
 * - subcategorías operativas estructurales más finas del método directo
 *   (impuesto a las ganancias, intereses, gastos pagados, otros ingresos);
 * - detalle por cuenta en inversión y financiación;
 * - método indirecto con ajustes descompuestos por cuenta (depreciaciones,
 *   variaciones de capital de trabajo por cuenta);
 * - las conciliaciones directo=indirecto, EFE=ESP y variación se conservan.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows, directOperatingSubcategory } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 200
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `f${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'deudores', code: '1.1.02', name: 'Deudores por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'mercaderias', code: '1.1.04', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    makeAccount({ id: 'rodados', code: '1.2.01', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'amort-acum', code: '1.2.90', name: 'Amortización acumulada rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT' }),
    makeAccount({ id: 'proveedores', code: '2.1.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    makeAccount({ id: 'prestamos', code: '2.1.05', name: 'Préstamos bancarios', kind: 'LIABILITY', statementGroup: 'LOANS' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'gastos-adm', code: '4.3.01', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'deprec', code: '4.3.02', name: 'Depreciación bienes de uso', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'intereses', code: '4.4.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES' }),
    makeAccount({ id: 'ig', code: '4.9.01', name: 'Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX' }),
]

function build(entries: JournalEntry[]) {
    const input: ReportingInput = { context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS }
    const statements = buildStatements(input)
    const flows = buildCashFlows(input, statements)
    statements.cashFlowDirect = flows.direct
    statements.cashFlowIndirect = flows.indirect
    statements.validation = flows.validation
    return statements
}

describe('Fase 2E — EFE pedagógico', () => {
    it('subcategorías operativas estructurales (jamás por nombre)', () => {
        const byId = new Map(ACCOUNTS.map(a => [a.id, a]))
        expect(directOperatingSubcategory(byId.get('deudores')!)).toBe('Cobros de clientes')
        expect(directOperatingSubcategory(byId.get('proveedores')!)).toBe('Pagos a proveedores de bienes y servicios')
        expect(directOperatingSubcategory(byId.get('gastos-adm')!)).toBe('Pagos de gastos de administración y comercialización')
        expect(directOperatingSubcategory(byId.get('ig')!)).toBe('Pagos de impuesto a las ganancias')
        expect(directOperatingSubcategory(byId.get('intereses')!)).toBe('Intereses y costos financieros pagados')
        expect(directOperatingSubcategory(byId.get('ventas')!)).toBe('Cobros de clientes')
    })

    it('directo detallado: filas por subcategoría con importes reales; sin filas ficticias', () => {
        const s = build([
            entry('2025-01-10', [{ accountId: 'caja', debit: 5000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 5000 }]),
            entry('2025-02-10', [{ accountId: 'caja', debit: 900, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 900 }]),
            entry('2025-03-10', [{ accountId: 'gastos-adm', debit: 200, credit: 0 }, { accountId: 'caja', debit: 0, credit: 200 }]),
            entry('2025-04-10', [{ accountId: 'ig', debit: 120, credit: 0 }, { accountId: 'caja', debit: 0, credit: 120 }]),
            entry('2025-05-10', [{ accountId: 'intereses', debit: 30, credit: 0 }, { accountId: 'caja', debit: 0, credit: 30 }]),
        ])
        const labels = (s.cashFlowDirect!.operating.children ?? []).map(c => c.label)
        expect(labels).toContain('Cobros de clientes')
        expect(labels).toContain('Pagos de gastos de administración y comercialización')
        expect(labels).toContain('Pagos de impuesto a las ganancias')
        expect(labels).toContain('Intereses y costos financieros pagados')
        // Sin datos de personal ni de otros impuestos: esas filas NO existen
        expect(labels).not.toContain('Pagos al personal y cargas sociales')
        expect(labels).not.toContain('Pagos y cobros de otros impuestos')

        const igRow = s.cashFlowDirect!.operating.children!.find(c => c.label === 'Pagos de impuesto a las ganancias')!
        expect(igRow.amount).toBe(-120)
        expect(igRow.accountIds).toEqual(['ig'])
    })

    it('inversión y financiación con detalle por cuenta', () => {
        const s = build([
            entry('2025-01-10', [{ accountId: 'caja', debit: 10000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 10000 }]),
            entry('2025-02-10', [{ accountId: 'rodados', debit: 3000, credit: 0 }, { accountId: 'caja', debit: 0, credit: 3000 }]),
            entry('2025-03-10', [{ accountId: 'caja', debit: 2000, credit: 0 }, { accountId: 'prestamos', debit: 0, credit: 2000 }]),
        ])
        const inv = s.cashFlowDirect!.investing
        expect(inv.amount).toBe(-3000)
        expect(inv.children?.length).toBe(1)
        expect(inv.children![0].label).toBe('1.2.01 Rodados')
        expect(inv.children![0].amount).toBe(-3000)

        const fin = s.cashFlowDirect!.financing
        expect(fin.amount).toBe(12000)
        const finLabels = fin.children!.map(c => c.label)
        expect(finLabels).toContain('3.1.01 Capital social')
        expect(finLabels).toContain('2.1.05 Préstamos bancarios')
    })

    it('indirecto explicado: la depreciación aparece por cuenta dentro de los ajustes', () => {
        const s = build([
            entry('2025-01-10', [{ accountId: 'caja', debit: 5000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 5000 }]),
            entry('2025-02-10', [{ accountId: 'caja', debit: 1000, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 1000 }]),
            entry('2025-12-31', [{ accountId: 'deprec', debit: 400, credit: 0 }, { accountId: 'amort-acum', debit: 0, credit: 400 }]),
        ])
        const ind = s.cashFlowIndirect!
        const ajustes = ind.operating.children!.find(c => c.id === 'efe:ind:ajustes')!
        expect(ajustes.amount).toBe(400) // la depreciación se SUMA: no salió efectivo
        expect(ajustes.children?.length).toBe(1)
        expect(ajustes.children![0].label).toBe('1.2.90 Amortización acumulada rodados')
        expect(ajustes.children![0].amount).toBe(400)
    })

    it('variaciones de capital de trabajo descompuestas por cuenta con signo pedagógico', () => {
        const s = build([
            entry('2025-01-10', [{ accountId: 'caja', debit: 5000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 5000 }]),
            // venta a crédito: aumenta deudores (usa efectivo → se resta)
            entry('2025-02-10', [{ accountId: 'deudores', debit: 800, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 800 }]),
            // compra a crédito: aumenta proveedores (financia → se suma)
            entry('2025-03-10', [{ accountId: 'mercaderias', debit: 500, credit: 0 }, { accountId: 'proveedores', debit: 0, credit: 500 }]),
        ])
        const ind = s.cashFlowIndirect!
        const wcA = ind.operating.children!.find(c => c.id === 'efe:ind:wc-activos')!
        expect(wcA.amount).toBe(-1300) // deudores +800, mercaderías +500 ⇒ se restan
        const deudoresRow = wcA.children!.find(c => c.accountIds[0] === 'deudores')!
        expect(deudoresRow.amount).toBe(-800)

        const wcL = ind.operating.children!.find(c => c.id === 'efe:ind:wc-pasivos')!
        expect(wcL.amount).toBe(500)
        expect(wcL.children![0].amount).toBe(500)
    })

    it('las conciliaciones del EFE se conservan con el detalle nuevo', () => {
        const s = build([
            entry('2025-01-10', [{ accountId: 'caja', debit: 5000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 5000 }]),
            entry('2025-02-10', [{ accountId: 'deudores', debit: 800, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 800 }]),
            entry('2025-03-01', [{ accountId: 'caja', debit: 600, credit: 0 }, { accountId: 'deudores', debit: 0, credit: 600 }]),
            entry('2025-04-10', [{ accountId: 'rodados', debit: 1500, credit: 0 }, { accountId: 'caja', debit: 0, credit: 1500 }]),
            entry('2025-05-10', [{ accountId: 'ig', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }]),
            entry('2025-12-31', [{ accountId: 'deprec', debit: 300, credit: 0 }, { accountId: 'amort-acum', debit: 0, credit: 300 }]),
        ])
        for (const id of ['efe-metodos', 'efe-esp', 'efe-variacion']) {
            expect(s.validation.checks.find(c => c.id === id)?.passed, id).toBe(true)
        }
        const cf = s.cashFlowDirect!
        expect(cf.netChange.amount).toBe(cf.closingCash.amount - cf.openingCash.amount)
    })
})
