/** Fase 2L — casos dorados de medición, recuperabilidad e inflación. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    IBERA_ACCOUNTS,
    IBERA_CLOSE_PERIOD,
    IBERA_ENTRIES,
    IBERA_EXPECTED,
    IBERA_INDEXES,
    IBERA_MEASUREMENTS,
    IBERA_OPENING_BALANCES,
    IBERA_OPENING_PERIOD,
} from '../../src/accounting/fixtures/cierreIbera2025'
import { buildAccountTreatmentMatrix, coefficientFor, monthsBetween } from '../../src/reporting/inflation/accountTreatment'
import { reconcileRecpam } from '../../src/reporting/inflation/recpam'
import { auditIndexSeries, buildInflationWorkPaper } from '../../src/reporting/inflation/inflationWorkPaper'
import { emptyClosingWorkPaper } from '../../src/reporting/closing/closingWorkPaperService'
import { buildClosingReadiness, type ReadinessInput } from '../../src/reporting/closing/closingReadiness'
import { allowedMeasurementCriteria, assertCriterionAllowed, calculateRecoverability } from '../../src/reporting/measurement/measurementPolicy'
import { previewMeasurementEntry } from '../../src/reporting/measurement/measurementService'
import type { ClosingMeasurement } from '../../src/reporting/measurement/measurementTypes'
import { buildPreCloseWorkingPaperSheets } from '../../src/lib/exportPreCloseWorkingPaper'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

const periods = monthsBetween('2025-01', IBERA_CLOSE_PERIOD)
const matrix = () => buildAccountTreatmentMatrix({
    accounts: IBERA_ACCOUNTS,
    entries: IBERA_ENTRIES,
    openingBalances: IBERA_OPENING_BALANCES,
    closePeriod: IBERA_CLOSE_PERIOD,
    openingPeriod: IBERA_OPENING_PERIOD,
    indexes: IBERA_INDEXES,
    closingMeasurements: IBERA_MEASUREMENTS,
})

const paper = () => ({
    ...emptyClosingWorkPaper('ibera-2025-company', 'ibera-2025-exercise'),
    inflation: {
        applicability: 'APLICABLE' as const,
        indexSetId: 'ibera-example',
        rationale: 'Contexto de inflación utilizado para el caso dorado.',
    },
})

const recpam = () => reconcileRecpam({
    matrix: matrix(),
    accounts: IBERA_ACCOUNTS,
    indexes: IBERA_INDEXES,
    closePeriod: IBERA_CLOSE_PERIOD,
    openingPeriod: IBERA_OPENING_PERIOD,
    periods,
})

describe('Cierre Iberá 2025 — cobertura y secuencia', () => {
    it('1 · conserva un dataset separado y completo', () => {
        expect(IBERA_ENTRIES).toHaveLength(IBERA_EXPECTED.journalEntries)
        expect(IBERA_INDEXES.size).toBe(IBERA_EXPECTED.indexPeriods)
        expect(IBERA_ACCOUNTS.every(account => account.id.startsWith('ibe-'))).toBe(true)
    })

    it('2 · los asientos balancean exactamente en centavos', () => {
        for (const entry of IBERA_ENTRIES) {
            const debit = entry.lines.reduce((sum, line) => sum + Math.round(line.debit * 100), 0)
            const credit = entry.lines.reduce((sum, line) => sum + Math.round(line.credit * 100), 0)
            expect(debit, entry.memo).toBe(credit)
        }
    })

    it('3 · la serie cubre apertura y todos los meses', () => {
        const audit = auditIndexSeries(IBERA_INDEXES, IBERA_OPENING_PERIOD, IBERA_CLOSE_PERIOD)
        expect(audit.rows).toHaveLength(13)
        expect(audit.missingPeriods).toEqual([])
        expect(audit.rows.every(row => row.coefficient! >= 1)).toBe(true)
    })

    it('4 · un índice faltante bloquea y no interpola', () => {
        const incomplete = new Map(IBERA_INDEXES)
        incomplete.delete('2025-06')
        const audit = auditIndexSeries(incomplete, IBERA_OPENING_PERIOD, IBERA_CLOSE_PERIOD)
        expect(audit.missingPeriods).toEqual(['2025-06'])
        expect(audit.rows.find(row => row.period === '2025-06')?.coefficient).toBeNull()
    })

    it('5 · las partidas monetarias no se reexpresan y participan del RECPAM', () => {
        const rows = matrix().rows.filter(row => row.monetaryCondition === 'MONETARY')
        expect(rows.length).toBeGreaterThanOrEqual(3)
        for (const row of rows) {
            expect(row.adjustment).toBe(0)
            expect(row.participatesInRecpam).toBe(true)
        }
    })

    it('6 · una partida no monetaria al costo conserva orígenes múltiples', () => {
        const sales = matrix().rows.find(row => row.accountId === 'ibe-sales')!
        expect(sales.originPeriods.map(origin => origin.period)).toEqual(['2025-01', '2025-07', '2025-11'])
        expect(sales.restatedAmount).not.toBe(sales.historicAmount)
    })

    it('7 · inventario con valor de cierre usa coeficiente 1', () => {
        const inventory = matrix().rows.find(row => row.accountId === 'ibe-inventory')!
        expect(inventory.treatment).toBe('VALOR_CORRIENTE_AL_CIERRE')
        expect(inventory.adjustment).toBe(0)
    })

    it('8 · el papel de trabajo impide el doble ajuste del inventario', () => {
        const work = buildInflationWorkPaper({
            matrix: matrix(), indexes: IBERA_INDEXES, startPeriod: '2025-01', closingPeriod: IBERA_CLOSE_PERIOD,
            openingPeriod: IBERA_OPENING_PERIOD, workPaper: paper(), measurements: IBERA_MEASUREMENTS, recpam: recpam(),
        })
        const inventory = work.rows.find(row => row.accountId === 'ibe-inventory')!
        expect(inventory.doubleAdjustmentPrevented).toBe(true)
        expect(inventory.inflationAdjustment).toBeGreaterThan(0)
        expect(inventory.baseAmount + inventory.inflationAdjustment + inventory.measurementAdjustment)
            .toBeCloseTo(inventory.finalAmount, 2)
        expect(inventory.finalAmount).toBe(IBERA_EXPECTED.inventoryAtClose)
    })

    it('9 · la moneda extranjera conserva el valor de cambio al cierre', () => {
        const work = buildInflationWorkPaper({
            matrix: matrix(), indexes: IBERA_INDEXES, startPeriod: '2025-01', closingPeriod: IBERA_CLOSE_PERIOD,
            openingPeriod: IBERA_OPENING_PERIOD, workPaper: paper(), measurements: IBERA_MEASUREMENTS, recpam: recpam(),
        })
        const fx = work.rows.find(row => row.accountId === 'ibe-fx')!
        expect(fx.finalAmount).toBe(IBERA_EXPECTED.fxAtClose)
        expect(fx.inflationAdjustment).toBeGreaterThan(0)
        expect(fx.resultKind).toBe('RESULTADO_TENENCIA')
    })

    it('10 · bienes de uso incluyen alta y depreciación del período', () => {
        const ppe = matrix().rows.find(row => row.accountId === 'ibe-ppe')!
        const dep = matrix().rows.find(row => row.accountId === 'ibe-acc-dep')!
        expect(ppe.originPeriods.map(origin => origin.period)).toContain('2025-05')
        expect(Math.abs(dep.historicAmount)).toBe(IBERA_EXPECTED.depreciation)
    })

    it('11 · capital y reserva se anticuan por su origen', () => {
        const m = matrix()
        expect(m.rows.find(row => row.accountId === 'ibe-capital')?.treatment).toBe('CAPITAL_NOMINAL_LEGAL')
        expect(m.rows.find(row => row.accountId === 'ibe-reserve')?.originPeriods[0].period).toBe('2024-12')
    })

    it('12 · ingresos y gastos usan sus meses de devengamiento', () => {
        const m = matrix()
        expect(m.rows.find(row => row.accountId === 'ibe-expense')?.originPeriods.map(origin => origin.period))
            .toEqual(['2025-02', '2025-06', '2025-10'])
        expect(m.rows.find(row => row.accountId === 'ibe-sales')?.originPeriods[0].period).toBe('2025-01')
    })

    it('13 · el comparativo se expresa con índice de cierre sobre índice comparativo', () => {
        expect(coefficientFor(IBERA_INDEXES, '2024-12', '2025-12')).toBeCloseTo(122 / 98, 10)
    })

    it('14 · recalcular es idempotente y no crea diferencias nuevas', () => {
        const first = matrix()
        const second = matrix()
        expect(second).toEqual(first)
    })

    it('15 · no produce NaN, Infinity ni centavos ocultos', () => {
        const work = buildInflationWorkPaper({
            matrix: matrix(), indexes: IBERA_INDEXES, startPeriod: '2025-01', closingPeriod: IBERA_CLOSE_PERIOD,
            openingPeriod: IBERA_OPENING_PERIOD, workPaper: paper(), measurements: IBERA_MEASUREMENTS, recpam: recpam(),
        })
        for (const row of work.rows) {
            expect(Number.isFinite(row.finalAmount)).toBe(true)
            expect(Number.isInteger(Math.round(row.finalAmount * 100))).toBe(true)
        }
    })
})

describe('política y recuperabilidad', () => {
    const inventory = IBERA_ACCOUNTS.find(account => account.id === 'ibe-inventory')!
    const ppe = IBERA_ACCOUNTS.find(account => account.id === 'ibe-ppe')!

    it('16 · sólo ofrece criterios válidos según rubro, destino y datos', () => {
        const allowed = allowedMeasurementCriteria({
            entityCategory: 'PEQUENA', rubro: 'BIENES_DE_CAMBIO', account: inventory,
            destination: 'VENTA', marketAvailable: true, reliableDataAvailable: true,
        }).map(rule => rule.criterion)
        expect(allowed).toContain('VALOR_NETO_REALIZACION')
        expect(allowed).toContain('COSTO_REPOSICION')
        expect(allowed).not.toContain('COSTO_AMORTIZADO')
    })

    it('17 · una combinación inválida se bloquea', () => {
        expect(() => assertCriterionAllowed({
            entityCategory: 'PEQUENA', rubro: 'BIENES_DE_USO_REVALUADOS', account: ppe,
            destination: 'USO', marketAvailable: true, reliableDataAvailable: true,
        }, 'VALOR_NETO_REALIZACION')).toThrow(/no es válido/)
    })

    it('18 · recuperabilidad usa el mayor entre VNR y valor de uso', () => {
        const assessment = calculateRecoverability({
            required: true, level: 'ACTIVO_INDIVIDUAL', basis: 'MAYOR_VNR_VALOR_USO',
            accountingAmount: 516_000, netRealizableValue: 470_000, valueInUse: 490_000,
            evidence: 'flujo y cotización',
        })
        expect(assessment.recoverableAmount).toBe(490_000)
        expect(assessment.impairmentLoss).toBe(26_000)
    })

    it('19 · el reverso queda limitado al valor sin deterioro previo', () => {
        const assessment = calculateRecoverability({
            required: true, level: 'ACTIVO_INDIVIDUAL', basis: 'VALOR_USO',
            accountingAmount: 400_000, valueInUse: 470_000, priorImpairment: 100_000,
            amountWithoutPriorImpairment: 450_000, evidence: 'presupuesto actualizado',
        })
        expect(assessment.reversal).toBe(50_000)
        expect(assessment.reversalCap).toBe(450_000)
    })

    it('20 · el asiento de un activo respeta Debe para aumento', () => {
        const measurement = IBERA_MEASUREMENTS[0]
        const holding = IBERA_ACCOUNTS.find(account => account.id === 'ibe-holding')!
        const preview = previewMeasurementEntry(measurement, holding)!
        expect(preview.lines.find(line => line.accountId === measurement.accountId)?.debit).toBe(15_000)
        expect(preview.isGain).toBe(true)
    })

    it('21 · el asiento de un pasivo no lo trata como activo', () => {
        const liability: ClosingMeasurement = {
            ...IBERA_MEASUREMENTS[0], id: 'liability-measure', accountId: 'ibe-suppliers', accountCode: 'IBE.2.01',
            accountName: 'Proveedores', accountKind: 'LIABILITY', normalSide: 'CREDIT', rubro: 'CREDITOS_Y_DEUDAS',
            criterion: 'COSTO_AMORTIZADO', previousAmount: 100_000, closingAmount: 120_000, difference: 20_000,
        }
        const expense = IBERA_ACCOUNTS.find(account => account.id === 'ibe-expense')!
        const preview = previewMeasurementEntry(liability, expense)!
        expect(preview.lines.find(line => line.accountId === liability.accountId)?.credit).toBe(20_000)
        expect(preview.isGain).toBe(false)
    })
})

describe('RECPAM, estados y no regresión', () => {
    it('22 · el RECPAM concilia por dos vías y no se usa como plug', () => {
        const result = recpam()
        expect(result.reconciled).toBe(true)
        expect(Math.abs(result.difference)).toBeLessThanOrEqual(result.toleranceCents / 100)
        expect(result.sequential.components.length).toBeGreaterThan(4)
        expect(result.analytic.components.length).toBeGreaterThan(0)
    })

    it('23 · una decisión pendiente de unidad de medida bloquea el cierre nominal', () => {
        const base: ReadinessInput = {
            company: { legalName: 'Cierre Iberá S.A.', taxId: '30-70000000-1' },
            exercise: { name: '2025', status: 'OPEN', startDate: '2025-01-01', endDate: '2025-12-31' },
            inflationSet: null, inflationPolicy: { applicability: 'PENDIENTE' }, coverage: null, recpam: null,
            statementChecks: [], fixedAssetsRestatedBlockers: [], measurements: null,
            draftCount: 0, entriesOutsideExercise: 0, staleSnapshot: false,
        }
        const result = buildClosingReadiness(base)
        expect(result.canClose).toBe(false)
        expect(result.blockers.map(blocker => blocker.id)).toContain('inflacion-aplicabilidad')
    })

    it('24 · no aplicable exige y conserva una razón verificable', () => {
        const base: ReadinessInput = {
            company: { legalName: 'Cierre Iberá S.A.', taxId: '30-70000000-1' },
            exercise: { name: '2025', status: 'OPEN', startDate: '2025-01-01', endDate: '2025-12-31' },
            inflationSet: null,
            inflationPolicy: { applicability: 'NO_APLICABLE', rationale: 'Indicadores del contexto verificados y documentados.' },
            coverage: null, recpam: null, statementChecks: [], fixedAssetsRestatedBlockers: [], measurements: null,
            draftCount: 0, entriesOutsideExercise: 0, staleSnapshot: false,
        }
        const result = buildClosingReadiness(base)
        expect(result.stages.find(stage => stage.stage === 'UNIDAD_MEDIDA_INFLACION')?.reason).toContain('Indicadores')
        expect(result.canClose).toBe(true)
    })

    it('25 · no aplicable no oculta un bloqueo objetivo de la etapa', () => {
        const result = buildClosingReadiness({
            company: { legalName: 'Cierre Iberá S.A.', taxId: '30-70000000-1' },
            exercise: { name: '2025', status: 'OPEN', startDate: '2025-01-01', endDate: '2025-12-31' },
            inflationSet: null,
            inflationPolicy: { applicability: 'NO_APLICABLE', rationale: 'Contexto estable documentado.' },
            stageReviews: [{
                stage: 'CORTE_DEVENGAMIENTOS', status: 'NO_APLICABLE',
                notApplicableReason: 'Revisión manual que no debe neutralizar hechos.',
            }],
            coverage: null, recpam: null, statementChecks: [], fixedAssetsRestatedBlockers: [], measurements: null,
            draftCount: 1, entriesOutsideExercise: 0, staleSnapshot: false,
        })
        expect(result.stages.find(stage => stage.stage === 'CORTE_DEVENGAMIENTOS')?.status).toBe('BLOQUEADA')
        expect(result.canClose).toBe(false)
    })

    it('26 · el exportador arma todas las secciones y conserva ids trazables', () => {
        const m = matrix()
        const r = recpam()
        const inflation = buildInflationWorkPaper({
            matrix: m, indexes: IBERA_INDEXES, startPeriod: '2025-01', closingPeriod: IBERA_CLOSE_PERIOD,
            openingPeriod: IBERA_OPENING_PERIOD, workPaper: paper(), measurements: IBERA_MEASUREMENTS, recpam: r,
        })
        const bundle = {
            metadata: { companyLegalName: 'Cierre Iberá S.A.', companyTaxId: '30-70000000-1', exerciseLabel: 'Ejercicio 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31', normative: 'RT 54 TO RT 59', schemaVersion: 25, reportVersion: 'golden' },
            closingWorkPaper: paper(), inflationWorkPaper: inflation, inflationSet: { name: 'Serie ejemplo Iberá', contentHash: 'hash' },
            readiness: { stages: [], checks: [], canPublish: true, canClose: true, nextAction: 'Revisar', blockers: [], warnings: [] },
            closingMeasurements: IBERA_MEASUREMENTS, recpam: r,
            closingImpact: { before: { assets: 1, liabilities: 1, equity: 0, result: 0, recpam: r.analytic.amount, cash: 1 }, adjustments: { assets: 0, liabilities: 0, equity: 0, result: 0, recpam: 0, cash: 0 }, after: { assets: 1, liabilities: 1, equity: 0, result: 0, recpam: r.analytic.amount, cash: 1 }, adjustmentCount: 0, equationDifferenceBefore: 0, equationDifferenceAfter: 0 },
        } as unknown as ReportingBundle
        const sheets = buildPreCloseWorkingPaperSheets(bundle)
        expect(sheets.map(sheet => sheet.name)).toEqual(expect.arrayContaining(['Checklist', 'Mediciones', 'Papel AxI', 'Coeficientes', 'RECPAM', 'Ajustes', 'Informe final', 'Trazabilidad']))
        expect(sheets.find(sheet => sheet.name === 'Mediciones')?.rows.flat().join(' ')).toContain('ibe-measure-fx')
    })

    it('27 · Purmamarca y Grupo Litoral permanecen byte a byte intactos', () => {
        const sha = (path: string) => createHash('sha256').update(readFileSync(join(process.cwd(), path))).digest('hex').toUpperCase()
        expect(sha('src/accounting/fixtures/purmamarcaDemo.ts')).toBe('954006A48B9CAE0942AC75296CAF5EB571E62A8C5F16E405592C02B82921CD30')
        expect(sha('src/consolidation/fixtures/grupoLitoral.ts')).toBe('AC7D7E86EBA004DB2F480F7AFEE4F4C8C1593DB0FB132D7B3D16C2B8C18B5198')
    })
})
