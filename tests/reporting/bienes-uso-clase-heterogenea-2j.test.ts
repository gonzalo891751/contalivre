/**
 * Fase 2J §8 — ¿es universal el coeficiente medio por clase?
 *
 * La Fase 2I reexpresó la depreciación acumulada con el coeficiente medio de la
 * clase. Con todos los bienes de la clase incorporados el mismo mes y bajo la
 * misma política, ese promedio ES el coeficiente exacto. Con vidas útiles
 * distintas deja de serlo: la depreciación no es proporcional al costo, así que
 * ponderarla por costo se aparta del cálculo bien por bien.
 *
 * Estas pruebas construyen ese caso adverso, miden el apartamiento y verifican
 * que la ficha individual lo corrige. Cuando no hay ficha, el anexo lo DECLARA
 * en vez de presentar una cifra aproximada como si fuera exacta.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { reexpressFixedAssetsAnnex } from '../../src/reporting/engine/fixedAssetsInflation'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { FixedAsset } from '../../src/core/fixedAssets/types'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CLOSE = '2025-12'
const IPC = new Map<string, number>([
    ['2024-12', 7694.0075], ['2025-01', 7864.1257], ['2025-11', 9841.3581], ['2025-12', 10121.3715],
])
const coef = (p: string) => IPC.get(CLOSE)! / IPC.get(p)!

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'banco', code: '1.1.01.02', name: 'Banco', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'muebles', code: '1.2.01.03', name: 'Muebles y útiles', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Muebles y útiles' }),
    makeAccount({ id: 'aaMuebles', code: '1.2.01.93', name: 'Amort. acum. Muebles', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Muebles y útiles' }),
    makeAccount({ id: 'amortizaciones', code: '4.5.11', name: 'Amortizaciones', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
]

let seq = 0
const entry = (date: string, memo: string, lines: Array<[string, number, number]>): JournalEntry => ({
    id: `h${++seq}`, date, memo, status: 'POSTED',
    lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
} as unknown as JournalEntry)

/**
 * Una misma clase con dos bienes de igual costo pero muy distinta vida útil:
 *   A · alta 01/2025, 6.000.000, vida 10 años → 600.000 de depreciación
 *   B · alta 11/2025, 6.000.000, vida  2 años →  500.000 (2 meses de 3.000.000/año)
 */
const ENTRIES: JournalEntry[] = [
    entry('2025-01-10', 'Alta del bien A', [['muebles', 6_000_000, 0], ['banco', 0, 6_000_000]]),
    entry('2025-11-05', 'Alta del bien B', [['muebles', 6_000_000, 0], ['banco', 0, 6_000_000]]),
    entry('2025-12-31', 'Amortizaciones del ejercicio', [
        ['amortizaciones', 1_100_000, 0], ['aaMuebles', 0, 1_100_000],
    ]),
]

const ficha = (over: Partial<FixedAsset> & Pick<FixedAsset, 'id' | 'name' | 'acquisitionDate' | 'originalValue' | 'lifeYears'>): FixedAsset => ({
    periodId: '2025', category: 'Muebles y Utiles', accountId: 'muebles', contraAccountId: 'aaMuebles',
    residualValuePct: 0, method: 'lineal-year', status: 'active', rt6Enabled: false,
    lifeMonths: (over.lifeYears ?? 0) * 12,
    createdAt: '2025-01-01', updatedAt: '2025-01-01', linkedJournalEntryIds: [],
    ...over,
} as unknown as FixedAsset)

const build = (fichas?: FixedAsset[]) => {
    const input: ReportingInput = ({
        context: { companyId: 'c', exerciseId: 'ex', exerciseLabel: 'Ejercicio 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' },
        entries: ENTRIES, openingBalances: new Map(), accounts: ACCOUNTS,
        fixedAssetFichas: fichas,
    }) as unknown as ReportingInput
    const annex = buildStatements(input).fixedAssetsAnnex
    return reexpressFixedAssetsAnnex(input, annex, IPC)
}

/** Lo que da el cálculo bien por bien, hecho a mano */
const DEP_A = 600_000 * coef('2025-01')
const DEP_B = 500_000 * coef('2025-11')
const DEP_EXACTA = DEP_A + DEP_B

describe('el valor de origen se reexpresa bien en cualquier caso', () => {
    it('cada alta por el coeficiente de su mes', () => {
        const r = build()
        const esperado = 6_000_000 * coef('2025-01') + 6_000_000 * coef('2025-11')
        expect(r.totals.grossRestated).toBeCloseTo(esperado, 0)
    })
})

describe('sin ficha individual, el promedio de la clase se aparta', () => {
    const r = build()

    it('la depreciación reexpresada NO coincide con el cálculo bien por bien', () => {
        expect(r.totals.depRestated).not.toBeCloseTo(DEP_EXACTA, 0)
    })

    it('el apartamiento es material y verificable', () => {
        const apartamiento = DEP_EXACTA - r.totals.depRestated
        expect(Math.abs(apartamiento)).toBeGreaterThan(10_000)
    })

    it('el anexo DECLARA que la cifra es una aproximación en vez de presentarla como exacta', () => {
        expect(r.warnings ?? []).toHaveLength(1)
        expect(r.warnings![0]).toContain('Muebles y útiles')
        expect(r.warnings![0]).toContain('coeficiente medio')
        expect(r.warnings![0]).toContain('ficha')
    })

    it('no bloquea la publicación: es una advertencia, no un error', () => {
        expect(r.blockers).toHaveLength(0)
    })
})

describe('con ficha individual, cada bien se reexpresa por su propia fecha de alta', () => {
    const r = build([
        ficha({ id: 'A', name: 'Escritorios', acquisitionDate: '2025-01-10', originalValue: 6_000_000, lifeYears: 10 }),
        ficha({ id: 'B', name: 'Sillas ergonómicas', acquisitionDate: '2025-11-05', originalValue: 6_000_000, lifeYears: 2 }),
    ])

    it('la depreciación reexpresada coincide con el cálculo bien por bien', () => {
        expect(r.totals.depRestated).toBeCloseTo(DEP_EXACTA, 0)
    })

    it('ya no hay aproximación que declarar', () => {
        expect(r.warnings ?? []).toHaveLength(0)
    })

    it('el valor residual reexpresado se corrige en consecuencia', () => {
        const sinFicha = build()
        expect(r.totals.residualRestated).not.toBeCloseTo(sinFicha.totals.residualRestated, 0)
        expect(r.totals.residualRestated).toBeCloseTo(r.totals.grossRestated - DEP_EXACTA, 0)
    })
})

describe('una clase homogénea no necesita ficha: el promedio ES exacto', () => {
    const HOMOGENEA: JournalEntry[] = [
        entry('2025-01-10', 'Alta A', [['muebles', 6_000_000, 0], ['banco', 0, 6_000_000]]),
        entry('2025-01-10', 'Alta B', [['muebles', 4_000_000, 0], ['banco', 0, 4_000_000]]),
        entry('2025-12-31', 'Amortizaciones', [['amortizaciones', 1_000_000, 0], ['aaMuebles', 0, 1_000_000]]),
    ]
    const input: ReportingInput = ({
        context: { companyId: 'c', exerciseId: 'ex', exerciseLabel: 'Ejercicio 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' },
        entries: HOMOGENEA, openingBalances: new Map(), accounts: ACCOUNTS,
    }) as unknown as ReportingInput
    const r = reexpressFixedAssetsAnnex(input, buildStatements(input).fixedAssetsAnnex, IPC)

    it('la depreciación queda exactamente al coeficiente del único mes de alta', () => {
        expect(r.totals.depRestated).toBeCloseTo(1_000_000 * coef('2025-01'), 0)
    })

    it('y no se advierte una aproximación que no existe', () => {
        expect(r.warnings ?? []).toHaveLength(0)
    })
})
