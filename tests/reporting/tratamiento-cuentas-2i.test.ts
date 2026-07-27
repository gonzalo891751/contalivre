/**
 * Fase 2I §2, §6 y §7 — matriz universal de tratamiento y RECPAM dual.
 *
 * Dos niveles de prueba:
 *
 *  1. Mecánica, sobre un caso mínimo con importes calculables a mano.
 *  2. Integración, sobre el Checkpoint A real de la auditoría (Purmamarca 2025,
 *     95 asientos, serie oficial del INDEC). Ahí se exige cobertura del 100 % y
 *     que las dos determinaciones del RECPAM concilien.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAccountTreatmentMatrix, coefficientFor } from '../../src/reporting/inflation/accountTreatment'
import { reconcileRecpam } from '../../src/reporting/inflation/recpam'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'

const CLOSE = '2025-12'
const OPENING = '2024-12'
const PERIODS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)

/** Serie oficial INDEC, IPC Nacional Nivel General, base dic-2016 = 100 */
const IPC = new Map<string, number>([
    ['2024-12', 7694.0075], ['2025-01', 7864.1257], ['2025-02', 8052.9927],
    ['2025-03', 8353.3158], ['2025-04', 8585.6078], ['2025-05', 8714.4871],
    ['2025-06', 8855.5681], ['2025-07', 9023.9730], ['2025-08', 9193.2441],
    ['2025-09', 9384.0922], ['2025-10', 9603.8623], ['2025-11', 9841.3581],
    ['2025-12', 10121.3715],
])

let seq = 0
const entry = (date: string, lines: Array<[string, number, number]>): JournalEntry => ({
    id: `t${++seq}`, date, memo: `asiento ${seq}`, status: 'POSTED',
    lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
} as unknown as JournalEntry)

describe('mecánica de la matriz de tratamiento', () => {
    const ACCOUNTS: Account[] = [
        makeAccount({ id: 'banco', code: '1.1.01.02', name: 'Banco', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
        makeAccount({ id: 'merc', code: '1.1.04.01', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
        makeAccount({ id: 'prepago', code: '1.1.03.22', name: 'Seguros pagados por adelantado', kind: 'ASSET', statementGroup: 'OTHER_RECEIVABLES', monetaryClassification: 'NON_MONETARY' }),
        makeAccount({ id: 'pfijo', code: '1.1.05.01', name: 'Plazo fijo', kind: 'ASSET', statementGroup: 'INVESTMENTS', monetaryClassification: 'MONETARY' }),
        makeAccount({ id: 'fci', code: '1.1.05.02', name: 'FCI', kind: 'ASSET', statementGroup: 'INVESTMENTS', monetaryClassification: 'NON_MONETARY', tags: ['medicion:valor-corriente'] }),
        makeAccount({ id: 'accion', code: '1.2.03.02', name: 'Acciones sin declarar', kind: 'ASSET', statementGroup: 'INVESTMENTS' }),
        makeAccount({ id: 'prov', code: '2.1.01.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
        makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL' }),
        makeAccount({ id: 'ajusteCap', code: '3.1.02', name: 'Ajuste de capital', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL_ADJUSTMENT' }),
        makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    ]

    const build = (entries: JournalEntry[]) => buildAccountTreatmentMatrix({
        accounts: ACCOUNTS, entries, openingBalances: new Map(),
        closePeriod: CLOSE, openingPeriod: OPENING, indexes: IPC,
    })

    const matrix = build([
        entry('2025-01-02', [['banco', 1_000_000, 0], ['capital', 0, 1_000_000]]),
        entry('2025-03-10', [['merc', 500_000, 0], ['prov', 0, 500_000]]),
        entry('2025-06-01', [['prepago', 120_000, 0], ['banco', 0, 120_000]]),
        entry('2025-06-01', [['pfijo', 300_000, 0], ['banco', 0, 300_000]]),
        entry('2025-07-01', [['fci', 200_000, 0], ['banco', 0, 200_000]]),
        entry('2025-08-01', [['ventas', 0, 400_000], ['banco', 400_000, 0]]),
    ])
    const row = (code: string) => matrix.rows.find(r => r.code === code)!

    it('el efectivo es monetario, no se reexpresa y participa del RECPAM', () => {
        const banco = row('1.1.01.02')
        expect(banco.treatment).toBe('MONETARIA_SIN_REEXPRESION')
        expect(banco.currencyBefore).toBe('MONEDA_DE_CIERRE')
        expect(banco.participatesInRecpam).toBe(true)
        expect(banco.restatedAmount).toBe(banco.historicAmount)
        expect(banco.adjustment).toBe(0)
        // "No se reexpresa" no es "no fue analizada": tiene tratamiento y motivo
        expect(banco.observations.join(' ')).toMatch(/RECPAM/)
    })

    it('los bienes de cambio se anticuan por el período de cada compra', () => {
        const merc = row('1.1.04.01')
        expect(merc.treatment).toBe('REEXPRESION_POR_ANTICUACION')
        expect(merc.originPeriods).toHaveLength(1)
        expect(merc.originPeriods[0].period).toBe('2025-03')
        const coef = coefficientFor(IPC, '2025-03', CLOSE)!
        expect(merc.restatedAmount).toBeCloseTo(500_000 * coef, 2)
        expect(merc.participatesInRecpam).toBe(false)
    })

    it('un gasto pagado por adelantado es NO monetario aunque se exponga en créditos', () => {
        const prepago = row('1.1.03.22')
        expect(prepago.monetaryCondition).toBe('NON_MONETARY')
        expect(prepago.treatment).toBe('REEXPRESION_POR_ANTICUACION')
        expect(prepago.participatesInRecpam).toBe(false)
    })

    it('un plazo fijo en pesos es monetario aunque el rubro Inversiones sea mixto', () => {
        const pf = row('1.1.05.01')
        expect(pf.monetaryCondition).toBe('MONETARY')
        expect(pf.treatment).toBe('MONETARIA_SIN_REEXPRESION')
        expect(pf.participatesInRecpam).toBe(true)
    })

    it('una partida medida a valor corriente del cierre no se multiplica de nuevo', () => {
        const fci = row('1.1.05.02')
        expect(fci.treatment).toBe('VALOR_CORRIENTE_AL_CIERRE')
        expect(fci.currencyBefore).toBe('MONEDA_DE_CIERRE')
        expect(fci.restatedAmount).toBe(fci.historicAmount)
        expect(fci.adjustment).toBe(0)
    })

    it('una inversión sin condición declarada bloquea en lugar de asumir', () => {
        const m = build([
            entry('2025-01-02', [['banco', 1_000_000, 0], ['capital', 0, 1_000_000]]),
            entry('2025-05-05', [['accion', 250_000, 0], ['banco', 0, 250_000]]),
        ])
        const accion = m.rows.find(r => r.code === '1.2.03.02')!
        expect(accion.treatment).toBe('REQUIERE_DECISION')
        expect(accion.status).toBe('BLOQUEADO')
        expect(m.complete).toBe(false)
        expect(m.coverage.pending.map(p => p.code)).toContain('1.2.03.02')
        expect(m.coverage.coveragePct).toBeLessThan(100)
    })

    it('el capital se mide reexpresado pero se expone a su valor nominal legal', () => {
        const capital = row('3.1.01')
        expect(capital.treatment).toBe('CAPITAL_NOMINAL_LEGAL')
        // Exposición: valor nominal
        expect(capital.presentationAmount).toBe(-1_000_000)
        // Medición: anticuada al mes del aporte
        const coef = coefficientFor(IPC, '2025-01', CLOSE)!
        expect(capital.restatedAmount).toBeCloseTo(-1_000_000 * coef, 2)
        // La diferencia es exactamente el Ajuste de capital
        expect(capital.adjustment).toBeCloseTo(-1_000_000 * (coef - 1), 2)
    })

    it('las ventas se anticuan por su mes de devengamiento, no por diciembre', () => {
        const ventas = row('4.1.01')
        expect(ventas.originPeriods[0].period).toBe('2025-08')
        const coef = coefficientFor(IPC, '2025-08', CLOSE)!
        expect(coef).toBeGreaterThan(1)
        expect(ventas.restatedAmount).toBeCloseTo(-400_000 * coef, 2)
    })

    it('sin índice de un período la cuenta se bloquea y no se estima', () => {
        const incompleto = new Map(IPC)
        incompleto.delete('2025-03')
        const m = buildAccountTreatmentMatrix({
            accounts: ACCOUNTS,
            entries: [entry('2025-03-10', [['merc', 500_000, 0], ['prov', 0, 500_000]])],
            openingBalances: new Map(), closePeriod: CLOSE, openingPeriod: OPENING, indexes: incompleto,
        })
        expect(m.coverage.missingPeriods).toEqual(['2025-03'])
        expect(m.complete).toBe(false)
        expect(m.rows.find(r => r.code === '1.1.04.01')!.status).toBe('BLOQUEADO')
    })
})

describe('Checkpoint A real — Purmamarca 2025', () => {
    const backup = JSON.parse(readFileSync(
        join(__dirname, '..', '..', 'docs', 'auditoria', 'checkpoints', 'checkpoint-a-pre-cierre.json'), 'utf-8'))

    const accounts: Account[] = backup.tables.accounts
    const entries: JournalEntry[] = backup.tables.entries
    const indexSet = backup.tables.inflationIndexSets[0]
    const indexes = new Map<string, number>(
        (indexSet.values as Array<{ period: string; value: number }>).map(v => [v.period, v.value]))

    // La metadata contable de la Fase 2I se aplica al plan por reparación; el
    // respaldo se tomó antes, así que acá se replica lo que hace el arranque.
    const DECLARED: Record<string, 'MONETARY' | 'NON_MONETARY'> = {
        '1.1.03.21': 'NON_MONETARY', '1.1.03.22': 'NON_MONETARY', '1.1.03.23': 'NON_MONETARY',
        '1.1.05.01': 'MONETARY', '1.1.05.02': 'NON_MONETARY', '1.1.05.03': 'MONETARY',
        '1.2.03.01': 'NON_MONETARY',
    }
    const withMetadata = accounts.map(a => ({
        ...a,
        monetaryClassification: a.monetaryClassification ?? DECLARED[a.code],
        equityComponent: a.equityComponent ?? (a.code === '3.1.02' ? 'CAPITAL_ADJUSTMENT' : a.code === '3.1.01' ? 'CAPITAL' : undefined),
    })) as Account[]

    const matrix = buildAccountTreatmentMatrix({
        accounts: withMetadata,
        entries: entries.filter(e => e.date >= '2025-01-01' && e.date <= '2025-12-31'),
        openingBalances: new Map(), closePeriod: CLOSE, openingPeriod: OPENING, indexes,
    })

    it('la serie de índices conserva los cuatro decimales de la fuente', () => {
        expect(indexes.get('2024-12')).toBe(7694.0075)
        expect(indexes.get('2025-12')).toBe(10121.3715)
        expect(indexSet.status).toBe('OFFICIAL')
    })

    it('el 100 % de las cuentas con actividad tiene tratamiento declarado', () => {
        expect(matrix.coverage.pending, JSON.stringify(matrix.coverage.pending)).toHaveLength(0)
        expect(matrix.coverage.coveragePct).toBe(100)
        expect(matrix.coverage.balanceCoveragePct).toBe(100)
        expect(matrix.coverage.accountsWithActivity).toBe(43)
        expect(matrix.complete).toBe(true)
    })

    it('ninguna cuenta queda sin criterio de medición ni sin período de origen', () => {
        for (const row of matrix.rows) {
            expect(row.measurementCriterion, `${row.code} sin criterio`).toBeTruthy()
            expect(row.treatment, `${row.code} sin tratamiento`).not.toBe('REQUIERE_DECISION')
            expect(row.originPeriods.length, `${row.code} sin anticuación`).toBeGreaterThan(0)
            expect(row.observations.length, `${row.code} sin fundamento`).toBeGreaterThan(0)
        }
    })

    it('las partidas monetarias no se reexpresan pero sí participan del RECPAM', () => {
        const monetarias = matrix.rows.filter(r => r.monetaryCondition === 'MONETARY')
        expect(monetarias.length).toBeGreaterThan(10)
        for (const row of monetarias) {
            expect(row.restatedAmount, `${row.code} fue reexpresada`).toBe(row.historicAmount)
            expect(row.participatesInRecpam, `${row.code} fuera del RECPAM`).toBe(true)
        }
    })

    it('las dos determinaciones del RECPAM concilian dentro de la tolerancia', () => {
        const rec = reconcileRecpam({
            matrix, accounts: withMetadata, indexes,
            closePeriod: CLOSE, openingPeriod: OPENING, periods: PERIODS,
        })

        expect(rec.analytic.amount).toBeCloseTo(-4_432_331.92, 2)
        expect(rec.sequential.amount).toBeCloseTo(-4_432_331.92, 1)
        expect(Math.abs(rec.difference)).toBeLessThanOrEqual(rec.toleranceCents / 100)
        expect(rec.reconciled).toBe(true)
        expect(rec.blockers).toHaveLength(0)
    })

    it('el RECPAM es una pérdida coherente con una posición monetaria activa', () => {
        const rec = reconcileRecpam({
            matrix, accounts: withMetadata, indexes,
            closePeriod: CLOSE, openingPeriod: OPENING, periods: PERIODS,
        })
        const posicionFinal = rec.monetaryEvolution[rec.monetaryEvolution.length - 1].closingPosition
        expect(posicionFinal).toBeGreaterThan(0)          // activa neta
        expect(rec.analytic.amount).toBeLessThan(0)       // por lo tanto, pérdida
        expect(rec.monetaryEvolution.length).toBe(PERIODS.length + 1)
    })

    it('una cuenta sin clasificar bloquea la conciliación del RECPAM', () => {
        // Se le quita la condición declarada al plazo fijo: el rubro Inversiones
        // es mixto, así que sin declaración la cuenta no puede resolverse sola.
        const sinDeclarar = withMetadata.map(a =>
            a.code === '1.1.05.01' ? { ...a, monetaryClassification: undefined } : a) as Account[]

        const roto = buildAccountTreatmentMatrix({
            accounts: sinDeclarar,
            entries: entries.filter(e => e.date >= '2025-01-01' && e.date <= '2025-12-31'),
            openingBalances: new Map(), closePeriod: CLOSE, openingPeriod: OPENING, indexes,
        })
        const rec = reconcileRecpam({
            matrix: roto, accounts: sinDeclarar, indexes,
            closePeriod: CLOSE, openingPeriod: OPENING, periods: PERIODS,
        })

        expect(roto.complete).toBe(false)
        expect(roto.coverage.pending.map(p => p.code)).toEqual(['1.1.05.01'])
        expect(roto.coverage.coveragePct).toBeLessThan(100)
        expect(rec.reconciled).toBe(false)
        expect(rec.blockers.some(b => b.includes('sin tratamiento declarado'))).toBe(true)
    })
})
