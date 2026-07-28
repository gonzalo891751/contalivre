/**
 * Fase 2I §9 — DEF-A09 y DEF-A10: bienes de uso en moneda de cierre.
 *
 * Reproduce el caso de la auditoría: tres bienes incorporados en distintos
 * meses, uno de ellos vendido en septiembre.
 *
 *   Muebles y útiles   6.000.000  alta 01/2025   vida 10 años
 *   Rodado             4.000.000  alta 01/2025   vendido 30/09/2025
 *   Equipos            3.000.000  alta 02/2025   vida 3 años
 *
 * Lo informado antes de la corrección y lo correcto:
 *
 *   Valor de origen reexpresado   12.326.577,61   →   11.492.722,37
 *   Depreciación reexpresada       1.600.000,00   →    2.029.064,44
 *   Valor residual                10.726.577,61   →    9.463.657,93
 *
 * La sobrevaluación del valor residual era de 1.262.919,68 sobre un rubro de
 * 9,46 millones: el 13 %.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { reexpressFixedAssetsAnnex } from '../../src/reporting/engine/fixedAssetsInflation'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CLOSE = '2025-12'
const IPC = new Map<string, number>([
    ['2024-12', 7694.0075], ['2025-01', 7864.1257], ['2025-02', 8052.9927],
    ['2025-09', 9384.0922], ['2025-12', 10121.3715],
])
const coef = (p: string) => IPC.get(CLOSE)! / IPC.get(p)!

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'banco', code: '1.1.01.02', name: 'Banco', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'muebles', code: '1.2.01.03', name: 'Muebles y útiles', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Muebles y útiles' }),
    makeAccount({ id: 'rodados', code: '1.2.01.04', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'equipos', code: '1.2.01.05', name: 'Equipos', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Equipos de computación' }),
    makeAccount({ id: 'aaMuebles', code: '1.2.01.93', name: 'Amort. acum. Muebles', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Muebles y útiles' }),
    makeAccount({ id: 'aaRodados', code: '1.2.01.94', name: 'Amort. acum. Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'aaEquipos', code: '1.2.01.95', name: 'Amort. acum. Equipos', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Equipos de computación' }),
    makeAccount({ id: 'amortizaciones', code: '4.5.11', name: 'Amortizaciones', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'rdoVenta', code: '4.7.04', name: 'Resultado venta BU', kind: 'INCOME', statementGroup: 'OTHER_INCOME' }),
    makeAccount({ id: 'ivaDF', code: '2.1.03.01', name: 'IVA DF', kind: 'LIABILITY', statementGroup: 'TAX_LIABILITIES' }),
]

let seq = 0
const entry = (date: string, memo: string, lines: Array<[string, number, number]>): JournalEntry => ({
    id: `bu${++seq}`, date, memo, status: 'POSTED',
    lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
} as unknown as JournalEntry)

const ENTRIES: JournalEntry[] = [
    entry('2025-01-10', 'Compra de muebles y útiles', [['muebles', 6_000_000, 0], ['banco', 0, 6_000_000]]),
    entry('2025-01-10', 'Compra del rodado', [['rodados', 4_000_000, 0], ['banco', 0, 4_000_000]]),
    entry('2025-02-03', 'Compra de equipos', [['equipos', 3_000_000, 0], ['banco', 0, 3_000_000]]),
    entry('2025-09-30', 'Amortización del rodado hasta la venta', [['amortizaciones', 600_000, 0], ['aaRodados', 0, 600_000]]),
    entry('2025-09-30', 'Venta del rodado', [
        ['banco', 4_598_000, 0], ['aaRodados', 600_000, 0],
        ['rodados', 0, 4_000_000], ['ivaDF', 0, 798_000], ['rdoVenta', 0, 400_000],
    ]),
    entry('2025-12-31', 'Amortizaciones del ejercicio', [
        ['amortizaciones', 1_600_000, 0], ['aaMuebles', 0, 600_000], ['aaEquipos', 0, 1_000_000],
    ]),
]

const input: ReportingInput = ({
    context: { companyId: 'c', exerciseId: 'ex', exerciseLabel: 'Ejercicio 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' },
    entries: ENTRIES, openingBalances: new Map(), accounts: ACCOUNTS,
}) as unknown as ReportingInput

const annex = buildStatements(input).fixedAssetsAnnex
const restated = reexpressFixedAssetsAnnex(input, annex, IPC)
const clase = (name: string) => restated.rows.find(r => r.assetClass === name)

describe('anexo nominal (sin cambios)', () => {
    it('el valor residual nominal sigue siendo 7.400.000', () => {
        expect(annex.totals.grossClosing).toBe(9_000_000)
        expect(annex.totals.accumDepClosing).toBe(1_600_000)
        expect(annex.totals.residual).toBe(7_400_000)
    })
})

describe('DEF-A09 · la baja retira el importe reexpresado de su origen', () => {
    it('el rodado vendido no deja valor de origen reexpresado', () => {
        const rodados = clase('Rodados')
        expect(rodados?.grossRestated ?? 0).toBe(0)
        expect(rodados?.depRestated ?? 0).toBe(0)
    })

    it('el valor de origen reexpresado son sólo los bienes en existencia', () => {
        const esperado = 6_000_000 * coef('2025-01') + 3_000_000 * coef('2025-02')
        expect(restated.totals.grossRestated).toBeCloseTo(esperado, 0)
        expect(restated.totals.grossRestated).toBeCloseTo(11_492_722.37, 0)
    })

    it('ya no informa los 12.326.577,61 que surgían de reexpresar la baja por su mes', () => {
        const incorrecto = 6_000_000 * coef('2025-01') + 4_000_000 * coef('2025-01')
            + 3_000_000 * coef('2025-02') - 4_000_000 * coef('2025-09')
        expect(incorrecto).toBeCloseTo(12_326_577.60, 0)
        expect(restated.totals.grossRestated).not.toBeCloseTo(incorrecto, 0)
        expect(incorrecto - restated.totals.grossRestated).toBeCloseTo(833_855.24, 0)
    })
})

describe('DEF-A10 · la depreciación se reexpresa sobre la base reexpresada', () => {
    it('la depreciación acumulada deja de quedar en moneda nominal', () => {
        expect(restated.totals.depNominal).toBe(1_600_000)
        expect(restated.totals.depRestated).not.toBe(1_600_000)
        expect(restated.totals.depAdjustment).toBeGreaterThan(0)
    })

    it('cada clase deprecia sobre su propio valor de origen reexpresado', () => {
        const muebles = clase('Muebles y útiles')!
        const equipos = clase('Equipos de computación')!
        // Línea recta: 10 años sobre muebles, 3 años sobre equipos
        expect(muebles.depRestated).toBeCloseTo(muebles.grossRestated / 10, 0)
        expect(equipos.depRestated).toBeCloseTo(equipos.grossRestated / 3, 0)
    })

    it('la depreciación reexpresada total es 2.029.064', () => {
        expect(restated.totals.depRestated).toBeCloseTo(2_029_064.44, 0)
    })
})

describe('valor residual corregido', () => {
    it('informa 9.463.657 y no los 10.726.577 anteriores', () => {
        expect(restated.totals.residualRestated).toBeCloseTo(9_463_657.93, 0)
        expect(restated.totals.residualRestated).not.toBeCloseTo(10_726_577.61, 0)
    })

    it('la sobrevaluación corregida es de 1.262.919', () => {
        expect(10_726_577.61 - restated.totals.residualRestated).toBeCloseTo(1_262_919.68, 0)
    })

    it('el valor residual reexpresado supera al nominal, como corresponde en inflación', () => {
        expect(restated.totals.residualRestated).toBeGreaterThan(annex.totals.residual)
    })

    it('no quedan períodos sin índice', () => {
        expect(restated.blockers).toHaveLength(0)
    })
})

describe('las clases del anexo salen del mapping, no del nombre', () => {
    it('cada bien queda en su clase', () => {
        expect(restated.rows.map(r => r.assetClass).sort())
            .toEqual(['Equipos de computación', 'Muebles y útiles'])
    })
})
