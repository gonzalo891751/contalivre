/**
 * Fase 2I §4 — disposiciones y adquisiciones de activos no operativos en el EFE.
 *
 * DEF-A06: el cobro íntegro de la venta de un bien de uso pertenece a
 * actividades de inversión (RT 54 t.o. RT 59, párr. 656). El resultado por la
 * venta se ELIMINA del operativo en la conciliación del método indirecto, que
 * es un ajuste extracontable y no un asiento.
 *
 * La salvaguarda anterior desactivaba el plegado cuando el asiento tocaba
 * capital de trabajo, y una venta gravada SIEMPRE trae la línea de IVA débito
 * fiscal: la regla quedaba inhabilitada justo en el caso que motiva la norma.
 *
 * DEF-A07: la compra de un bien de uso con pago diferido no produce flujo el
 * día de la compra —se revela como transacción sin movimiento de efectivo— y su
 * cancelación posterior es un egreso de inversión, no un pago operativo.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows, detectDeferredAcquisition, detectDisposalFold } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'banco', code: '1.1.01.02', name: 'Banco c/c ARS', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'ivaCF', code: '1.1.03.01', name: 'IVA Crédito Fiscal', kind: 'ASSET', statementGroup: 'TAX_CREDITS' }),
    makeAccount({ id: 'rodados', code: '1.2.01.04', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'equipos', code: '1.2.01.05', name: 'Equipos', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'aaRodados', code: '1.2.01.94', name: 'Amort. acum. Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT' }),
    makeAccount({ id: 'acreedores', code: '2.1.06.01', name: 'Acreedores varios', kind: 'LIABILITY', statementGroup: 'OTHER_PAYABLES' }),
    makeAccount({ id: 'ivaDF', code: '2.1.03.01', name: 'IVA Débito Fiscal', kind: 'LIABILITY', statementGroup: 'TAX_LIABILITIES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'rdoVenta', code: '4.7.04', name: 'Resultado venta bienes de uso', kind: 'INCOME', statementGroup: 'OTHER_INCOME' }),
    makeAccount({ id: 'amortizaciones', code: '4.5.11', name: 'Amortizaciones', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
]

const byId = new Map(ACCOUNTS.map(a => [a.id, a]))

let seq = 0
const entry = (date: string, memo: string, lines: Array<[string, number, number]>): JournalEntry => ({
    id: `e${++seq}`, entryNumber: ++seq, date, memo, status: 'POSTED',
    lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
    createdAt: date, updatedAt: date,
} as unknown as JournalEntry)

const makeInput = (entries: JournalEntry[]): ReportingInput =>
    ({ context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS }) as unknown as ReportingInput

function efe(entries: JournalEntry[]) {
    const input = makeInput(entries)
    const bundle = buildStatements(input)
    return buildCashFlows(input, bundle)
}

const APORTE = entry('2025-01-02', 'Aporte de capital', [
    ['banco', 30_000_000, 0], ['capital', 0, 30_000_000],
])

describe('DEF-A06 · venta de un bien de uso con IVA', () => {
    // Rodado de 4.000.000, amortizado 600.000, vendido en 3.800.000 + IVA 798.000
    const VENTA = entry('2025-09-30', 'Venta del rodado al contado', [
        ['banco', 4_598_000, 0],
        ['aaRodados', 600_000, 0],
        ['rodados', 0, 4_000_000],
        ['ivaDF', 0, 798_000],
        ['rdoVenta', 0, 400_000],
    ])

    it('el plegado ya no se desactiva por la línea de impuesto', () => {
        expect(detectDisposalFold(VENTA.lines, byId)).toBe('INVESTING')
    })

    it('el cobro íntegro va a inversión y nada de la venta queda en operativo', () => {
        const { direct } = efe([APORTE, VENTA])

        expect(direct.investing.amount).toBe(4_598_000)
        // Ninguna subcategoría operativa recoge la venta
        const operativas = direct.operating.children ?? []
        expect(operativas.map(c => c.label)).not.toContain('Cobros por otros ingresos operativos')
        expect(direct.operating.amount).toBe(0)
    })

    it('el resultado de la venta se elimina del operativo como ajuste extracontable', () => {
        const { indirect } = efe([APORTE, VENTA])
        const ajuste = (indirect.operating.children ?? [])
            .find(c => c.id === 'efe:ind:result-no-operativo')

        expect(ajuste).toBeDefined()
        expect(ajuste!.amount).toBe(-400_000)
        expect(ajuste!.worksheetOnly).toBe(true)
        expect(ajuste!.worksheetReason).toMatch(/no genera asiento/i)
    })

    it('directo e indirecto llegan a la misma variación neta', () => {
        const { direct, indirect, validation } = efe([APORTE, VENTA])

        expect(direct.operating.amount).toBe(indirect.operating.amount)
        expect(direct.netChange.amount).toBe(indirect.netChange.amount)
        expect(direct.netChange.amount).toBe(34_598_000)
        expect(validation.checks.find(c => c.id === 'efe-metodos')?.passed).toBe(true)
        expect(validation.checks.find(c => c.id === 'efe-variacion')?.passed).toBe(true)
    })

    it('no se genera ningún asiento por el ajuste de conciliación', () => {
        const entries = [APORTE, VENTA]
        const antes = entries.length
        efe(entries)
        expect(entries).toHaveLength(antes)
    })
})

describe('DEF-A07 · compra de un bien de uso con pago diferido', () => {
    const COMPRA = entry('2025-02-03', 'Compra de equipos en cuenta corriente', [
        ['equipos', 3_000_000, 0],
        ['ivaCF', 630_000, 0],
        ['acreedores', 0, 3_630_000],
    ])
    const PAGO = entry('2025-05-15', 'Pago a acreedores por los equipos', [
        ['acreedores', 3_630_000, 0],
        ['banco', 0, 3_630_000],
    ])

    it('la compra a crédito se reconoce como adquisición diferida', () => {
        const detected = detectDeferredAcquisition(COMPRA.lines, byId)
        expect(detected?.activity).toBe('INVESTING')
        expect(detected?.liabilities.get('acreedores')).toBe(363_000_000) // centavos
    })

    it('la compra no produce flujo y se revela como transacción sin efectivo', () => {
        const { direct } = efe([APORTE, COMPRA])

        expect(direct.investing.amount).toBe(0)
        expect(direct.operating.amount).toBe(0)
        const revelacion = direct.nonMonetaryDisclosures.find(d => d.label.includes('cuenta corriente'))
        expect(revelacion).toBeDefined()
        expect(revelacion!.worksheetOnly).toBe(true)
        expect(revelacion!.amount).toBe(3_000_000)
    })

    it('el pago posterior se clasifica en inversión y no como pago operativo', () => {
        const { direct } = efe([APORTE, COMPRA, PAGO])

        expect(direct.investing.amount).toBe(-3_630_000)
        expect(direct.operating.amount).toBe(0)
        const detalle = (direct.investing.children ?? []).find(c => c.accountIds.includes('acreedores'))
        expect(detalle?.amount).toBe(-3_630_000)
    })

    it('directo e indirecto siguen coincidiendo con el pago reclasificado', () => {
        const { direct, indirect, validation } = efe([APORTE, COMPRA, PAGO])

        expect(direct.operating.amount).toBe(indirect.operating.amount)
        expect(direct.netChange.amount).toBe(26_370_000)
        expect(validation.checks.find(c => c.id === 'efe-metodos')?.passed).toBe(true)
    })

    it('un pago mayor que la deuda de inversión deja el excedente en operativo', () => {
        const PAGO_MAYOR = entry('2025-05-15', 'Pago a acreedores', [
            ['acreedores', 4_000_000, 0],
            ['banco', 0, 4_000_000],
        ])
        const { direct } = efe([APORTE, COMPRA, PAGO_MAYOR])

        expect(direct.investing.amount).toBe(-3_630_000)
        expect(direct.operating.amount).toBe(-370_000)
    })
})

describe('la depreciación sigue siendo un ajuste del indirecto, no una adquisición', () => {
    const DEPRECIACION = entry('2025-12-31', 'Amortización del ejercicio', [
        ['amortizaciones', 600_000, 0],
        ['aaRodados', 0, 600_000],
    ])

    it('no se confunde con una adquisición diferida', () => {
        expect(detectDeferredAcquisition(DEPRECIACION.lines, byId)).toBeNull()
    })

    it('se suma de vuelta al resultado en el método indirecto', () => {
        const { indirect } = efe([APORTE, DEPRECIACION])
        const ajustes = (indirect.operating.children ?? []).find(c => c.id === 'efe:ind:ajustes')
        expect(ajustes?.amount).toBe(600_000)
        expect(ajustes?.worksheetOnly).toBe(true)
    })
})
