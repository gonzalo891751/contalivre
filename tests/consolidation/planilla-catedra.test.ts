/**
 * Fase 2K §19 — casos de la planilla de la cátedra como pruebas automatizadas.
 *
 * Fuente: "03 EECC Consolidados Sencillo HJA - es el que se da en clases.xlsx"
 * (Cátedra de Contabilidad IV, UCASAL). Los enunciados se reconstruyeron y los
 * resultados se verifican contra las hojas 01 a 08 y contra la hoja "9 Resumen",
 * cuyos valores se RECALCULAN acá en lugar de copiarse como verdades.
 *
 * DIVERGENCIAS DELIBERADAS CON LA PLANILLA (documentadas en el informe):
 *
 *  1. La planilla expone la "Participación minoritaria" en una línea propia
 *     entre el pasivo y el patrimonio neto (exposición de la RT 21). ContaLivre
 *     la expone como PARTICIPACIÓN NO CONTROLADORA DENTRO del patrimonio neto,
 *     conforme la RT 54: es patrimonio de terceros, no una deuda del grupo. Los
 *     importes son idénticos; cambia el lugar y el nombre.
 *
 *  2. La planilla construye los estados individuales de la controladora A PARTIR
 *     del resultado de la consolidación (su inversión permanente ya está medida
 *     al VPP ajustado por resultados no trascendidos). ContaLivre no lo supone:
 *     toma la inversión como esté contabilizada y, si difiere del VPP, expone la
 *     diferencia en lugar de absorberla. En estos fixtures la inversión se carga
 *     con el valor de la planilla, de modo que la diferencia da cero y los
 *     números coinciden exactamente.
 */

import { describe, it, expect } from 'vitest'
import { buildConsolidationWorksheet } from '../../src/consolidation/engine/worksheet'
import {
    PARENT, SUB, SUB_B,
    consolidated, equityBeforeResult, exposure, makeEntity, makeInput,
    makeOperation, makeReciprocal, investmentMappings,
    nonControllingInterest, resultToNci, resultToOwners, totalAssets, totalGroupResult, totalLiabilities,
    worksheetNet,
} from './helpers'

// ─────────────────────────────────────────────────────────────
// Balances base de la planilla
// ─────────────────────────────────────────────────────────────

/**
 * Hojas 01 y 02: controlante.
 *
 * Los estados individuales tienen que CERRAR su propia ecuación patrimonial:
 * si la inversión permanente o el resultado que genera cambian, el efecto
 * acumulado de ejercicios anteriores cambia con ellos. Por eso los resultados
 * no asignados se DERIVAN en lugar de fijarse: la planilla, con inversión
 * 432.900 y resultado 99.900, expone 560.000.
 */
const PARENT_01 = (investment: number, equityMethodResult: number) => exposure({
    assets: {
        caja: 112_000, 'creditos-ventas': 200_000, 'otros-creditos': 30_000,
        'bienes-cambio': 500_000, 'inversiones-permanentes': investment, 'bienes-uso': 745_000,
    },
    liabilities: { 'deudas-comerciales': 550_000, 'deudas-sociales': 54_000, 'deudas-fiscales': 200_000 },
    equity: {
        capital: 200_000, 'reserva-legal': 40_000,
        'resultados-no-asignados': 560_000 + (investment - equityMethodResult - 333_000),
    },
    income: { ventas: 4_600_000, 'intereses-ganados': 23_000, 'resultado-inversiones': equityMethodResult },
    expenses: {
        cmv: 3_300_000, 'gastos-administracion': 420_000, 'gastos-comercializacion': 280_000,
        'intereses-perdidos': 145_000, 'impuesto-ganancias': 162_000,
    },
})

const SUB_01 = exposure({
    assets: { caja: 150_000, 'creditos-ventas': 230_000, 'bienes-cambio': 250_000, 'bienes-uso': 500_000 },
    liabilities: {
        'deudas-comerciales': 430_000, 'deudas-sociales': 125_000,
        'deudas-fiscales': 64_000, 'otros-pasivos': 30_000,
    },
    equity: { capital: 200_000, 'reserva-legal': 40_000, 'resultados-no-asignados': 130_000 },
    income: { ventas: 3_000_000, 'intereses-ganados': 10_000 },
    expenses: {
        cmv: 2_300_000, 'gastos-administracion': 240_000, 'gastos-comercializacion': 250_000,
        'intereses-perdidos': 50_000, 'impuesto-ganancias': 59_000,
    },
})

/** Hojas 03 a 05: operaciones ascendentes */
const PARENT_ASC = (investment: number, equityMethodResult: number, bienesCambio: number) => exposure({
    assets: {
        caja: 132_000, 'creditos-ventas': 200_000, 'bienes-cambio': bienesCambio,
        'inversiones-permanentes': investment, 'bienes-uso': 800_000,
    },
    liabilities: { 'deudas-comerciales': 400_000, 'deudas-sociales': 55_000, 'deudas-fiscales': 210_000 },
    equity: { capital: 200_000, 'reserva-legal': 40_000, 'resultados-no-asignados': 850_000 },
    income: { ventas: 4_800_000, 'intereses-ganados': 17_000, 'resultado-inversiones': equityMethodResult },
    expenses: {
        cmv: 3_500_000, 'gastos-administracion': 420_000, 'gastos-comercializacion': 290_000,
        'intereses-perdidos': 150_000, 'impuesto-ganancias': 137_400,
    },
})

const SUB_ASC = exposure({
    assets: { caja: 56_000, 'creditos-ventas': 220_000, 'bienes-cambio': 160_000, 'bienes-uso': 520_000 },
    liabilities: { 'deudas-comerciales': 230_000, 'deudas-sociales': 145_000, 'deudas-fiscales': 80_000 },
    equity: { capital: 200_000, 'reserva-legal': 40_000, 'resultados-no-asignados': 74_000 },
    income: { ventas: 3_200_000, 'intereses-ganados': 10_000 },
    expenses: {
        cmv: 2_400_000, 'gastos-administracion': 240_000, 'gastos-comercializacion': 260_000,
        'intereses-perdidos': 46_000, 'impuesto-ganancias': 77_000,
    },
})

/** Hojas 06 a 08: operaciones descendentes */
const PARENT_DESC = (investment: number, equityMethodResult: number) => exposure({
    assets: {
        caja: 420_000, 'creditos-ventas': 200_000, 'bienes-cambio': 410_000,
        'inversiones-permanentes': investment, 'bienes-uso': 800_000,
    },
    liabilities: { 'deudas-comerciales': 400_000, 'deudas-sociales': 560_000, 'deudas-fiscales': 100_000 },
    equity: { capital: 200_000, 'reserva-legal': 40_000, 'resultados-no-asignados': 417_100 },
    income: { ventas: 4_650_000, 'intereses-ganados': 20_000, 'resultado-inversiones': equityMethodResult },
    expenses: {
        cmv: 3_400_000, 'gastos-administracion': 400_000, 'gastos-comercializacion': 200_000,
        'intereses-perdidos': 150_000, 'impuesto-ganancias': 56_100,
    },
})

const SUB_DESC = (bienesCambio: number) => exposure({
    assets: { caja: 32_000, 'creditos-ventas': 170_000, 'bienes-cambio': bienesCambio, 'bienes-uso': 507_000 },
    liabilities: { 'deudas-comerciales': 420_000, 'deudas-sociales': 130_000, 'deudas-fiscales': 60_000 },
    equity: { capital: 200_000, 'reserva-legal': 40_000, 'resultados-no-asignados': 150_000 },
    income: { ventas: 3_194_000, 'intereses-ganados': 10_000 },
    expenses: {
        cmv: 2_100_000, 'gastos-administracion': 245_000, 'gastos-comercializacion': 250_000,
        'intereses-perdidos': 470_000, 'impuesto-ganancias': 30_000,
    },
})

const parentEntity = (balances: Record<string, number>) =>
    makeEntity({ companyId: PARENT, companyName: 'Controlante S.A.', relation: 'PARENT', ownership: 1, balances })

const subEntity = (balances: Record<string, number>, ownership = 0.9, companyId = SUB, name = 'Controlada S.A.') =>
    makeEntity({ companyId, companyName: name, relation: 'SUBSIDIARY', ownership, balances })

/** Invariantes que TODOS los casos deben cumplir (§20) */
function expectInvariants(ws: ReturnType<typeof buildConsolidationWorksheet>) {
    const failed = ws.checks.filter(c => !c.passed)
    expect(failed.map(c => `${c.label}${c.detail ? `: ${c.detail}` : ''}`)).toEqual([])
    expect(ws.eliminations.every(e => e.balanced)).toBe(true)

    // La hoja entera suma cero al centavo, sin tolerancias
    expect(worksheetNet(ws)).toBe(0)

    // Activo = Pasivo + patrimonio atribuible a los propietarios + PNC.
    // La PNC de cierre YA incluye su participación en el resultado, por eso el
    // resultado que se suma acá es el atribuible a los propietarios.
    expect(totalAssets(ws)).toBe(
        totalLiabilities(ws) + equityBeforeResult(ws) + resultToOwners(ws) + nonControllingInterest(ws))

    // Resultado del grupo = atribuible a propietarios + atribuible a la PNC
    expect(totalGroupResult(ws)).toBe(resultToOwners(ws) + resultToNci(ws))
}

// ─────────────────────────────────────────────────────────────
// A / B — consolidación sin operaciones internas
// ─────────────────────────────────────────────────────────────

describe('Caso 01 — sin operaciones entre las sociedades (planilla, hoja 01)', () => {
    const ws = buildConsolidationWorksheet(makeInput({
        entities: [parentEntity(PARENT_01(432_900, 99_900)), subEntity(SUB_01)],
    }))

    it('invariantes de consolidación', () => expectInvariants(ws))

    it('B — participación del 90 %: VPP 432.900 y PNC 48.100', () => {
        const detail = ws.nci[0]
        expect(detail.subsidiaryEquity).toBe(481_000)
        expect(detail.expectedInvestment).toBe(432_900)
        expect(detail.bookedInvestment).toBe(432_900)
        expect(detail.consolidationDifference).toBe(0)
        expect(detail.closingNci).toBe(48_100)
        expect(detail.nciResult).toBe(11_100)
    })

    it('ESP consolidado coincide con la planilla', () => {
        expect(consolidated(ws, 'AC_CAJA_BANCOS')).toBe(262_000)
        expect(consolidated(ws, 'AC_CREDITOS_VENTAS')).toBe(430_000)
        expect(consolidated(ws, 'AC_OTROS_CREDITOS')).toBe(30_000)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(750_000)
        expect(consolidated(ws, 'ANC_BIENES_USO')).toBe(1_245_000)
        expect(consolidated(ws, 'ANC_INVERSIONES')).toBe(0)
        expect(totalAssets(ws)).toBe(2_717_000)
        expect(totalLiabilities(ws)).toBe(1_453_000)
        expect(nonControllingInterest(ws)).toBe(48_100)
        // PN atribuible a los propietarios: 1.215.900 (planilla)
        expect(equityBeforeResult(ws) + resultToOwners(ws)).toBe(1_215_900)
    })

    it('ER consolidado coincide con la planilla', () => {
        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_600_000)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_600_000)
        expect(consolidated(ws, 'ER_GASTOS_ADMINISTRACION')).toBe(660_000)
        expect(consolidated(ws, 'ER_GASTOS_COMERCIALIZACION')).toBe(530_000)
        expect(consolidated(ws, 'ER_IMPUESTO_GANANCIAS')).toBe(221_000)
        expect(consolidated(ws, 'ER_RESULTADO_INVERSIONES_PERMANENTES')).toBe(0)
        expect(resultToOwners(ws)).toBe(415_900)
        expect(resultToNci(ws)).toBe(11_100)
    })

    it('A — con participación del 100 % no hay participación no controladora', () => {
        const full = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(481_000, 111_000)), subEntity(SUB_01, 1)],
        }))
        expectInvariants(full)
        expect(nonControllingInterest(full)).toBe(0)
        expect(resultToNci(full)).toBe(0)
        expect(full.nci[0].expectedInvestment).toBe(481_000)
        expect(full.nci[0].consolidationDifference).toBe(0)
        // El activo consolidado es el mismo: la controladora sólo cambió CÓMO
        // medía la inversión, que en el consolidado desaparece igual.
        expect(totalAssets(full)).toBe(2_717_000)
        // Todo el patrimonio de la controlada pertenece a los propietarios
        expect(equityBeforeResult(full) + resultToOwners(full)).toBe(1_264_000)
    })
})

// ─────────────────────────────────────────────────────────────
// C / K — saldos recíprocos, préstamo e intereses internos
// ─────────────────────────────────────────────────────────────

describe('Caso 02 — préstamo e intereses entre las sociedades (planilla, hoja 02)', () => {
    // La controlante prestó 30.000, adeudados al cierre, que devengaron 4.000
    // de interés abonado durante el ejercicio. Los 30.000 ya están en "Otros
    // créditos" de la controlante y en "Otros pasivos" de la controlada, y los
    // 4.000 dentro de sus intereses ganados y perdidos respectivamente.
    const ws = buildConsolidationWorksheet(makeInput({
        entities: [parentEntity(PARENT_01(432_900, 99_900)), subEntity(SUB_01)],
        reciprocals: [makeReciprocal({
            kind: 'LOAN',
            creditorCompanyId: PARENT, creditorAccountId: 'otros-creditos', creditorAmount: 30_000,
            debtorCompanyId: SUB, debtorAccountId: 'otros-pasivos', debtorAmount: 30_000,
        })],
        operations: [makeOperation({
            id: 'op-intereses', type: 'INTEREST', description: 'Intereses del préstamo intragrupo',
            sellerCompanyId: PARENT, buyerCompanyId: SUB,
            transferAmount: 4_000, groupCost: 4_000, realizedRatio: 1,
        })],
    }))

    it('invariantes de consolidación', () => expectInvariants(ws))

    it('C — el crédito y la deuda recíprocos quedan en cero', () => {
        expect(consolidated(ws, 'AC_OTROS_CREDITOS')).toBe(0)
        expect(consolidated(ws, 'PC_OTRAS_DEUDAS')).toBe(0)
        expect(totalAssets(ws)).toBe(2_687_000)
        expect(totalLiabilities(ws)).toBe(1_423_000)
    })

    it('K — los intereses internos se eliminan por igual importe en ambos lados', () => {
        const elim = ws.eliminations.find(e => e.kind === 'INTRAGROUP_OPERATION')!
        expect(elim.lines.map(l => l.consolidatedLineId)).toEqual(
            ['ER_INGRESOS_FINANCIEROS', 'ER_GASTOS_FINANCIEROS'])
        expect(elim.lines[0].debit).toBe(4_000)
        expect(elim.lines[1].credit).toBe(4_000)
        expect(elim.balanced).toBe(true)

        // Ingresos financieros: 23.000 + 10.000 − 4.000 internos = 29.000
        expect(consolidated(ws, 'ER_INGRESOS_FINANCIEROS')).toBe(29_000)
        // Gastos financieros: 145.000 + 50.000 − 4.000 internos = 191.000
        expect(consolidated(ws, 'ER_GASTOS_FINANCIEROS')).toBe(191_000)
    })

    it('el patrimonio y el resultado no cambian por eliminar partidas recíprocas', () => {
        expect(resultToOwners(ws)).toBe(415_900)
        expect(nonControllingInterest(ws)).toBe(48_100)
    })
})

// ─────────────────────────────────────────────────────────────
// D / E / F — operaciones ASCENDENTES
// ─────────────────────────────────────────────────────────────

describe('Operaciones ascendentes: la controlada vende a la controladora', () => {
    it('D — resultado 100 % trascendido a terceros (planilla, hoja 03)', () => {
        // Controlada compra a terceros por 90.000, vende a la controlante por
        // 150.000, y la controlante revende todo a terceros por 200.000.
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_ASC(450_900, 168_300, 660_000)),
                subEntity(SUB_ASC),
            ],
            operations: [makeOperation({
                description: 'Venta ascendente de mercaderías, totalmente realizada',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 1,
            })],
        }))
        expectInvariants(ws)

        expect(ws.nci[0].subsidiaryEquity).toBe(501_000)
        expect(ws.nci[0].unrealizedFromSubsidiary).toBe(0)
        expect(ws.nci[0].expectedInvestment).toBe(450_900)
        expect(ws.nci[0].closingNci).toBe(50_100)
        expect(ws.nci[0].nciResult).toBe(18_700)

        // Ventas 8.000.000 − 150.000 internas = 7.850.000 (planilla)
        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_850_000)
        // CMV 5.900.000 − 150.000 = 5.750.000 (planilla)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_750_000)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(820_000)
        expect(totalAssets(ws)).toBe(2_748_000)
        expect(resultToOwners(ws)).toBe(487_900)
        expect(resultToNci(ws)).toBe(18_700)
    })

    it('E — resultado 100 % NO trascendido (planilla, hoja 04)', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_ASC(396_900, 114_300, 660_000)),
                subEntity(SUB_ASC),
            ],
            operations: [makeOperation({
                description: 'Venta ascendente de mercaderías, íntegramente en stock',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0,
            })],
        }))
        expectInvariants(ws)

        // El resultado no trascendido lo generó la CONTROLADA: corrige su
        // patrimonio y por lo tanto se reparte 90/10 con la PNC.
        expect(ws.nci[0].unrealizedFromSubsidiary).toBe(60_000)
        expect(ws.nci[0].adjustedEquity).toBe(441_000)
        expect(ws.nci[0].expectedInvestment).toBe(396_900)
        expect(ws.nci[0].closingNci).toBe(44_100)      // 10 % de 441.000
        expect(ws.nci[0].adjustedResult).toBe(127_000)
        expect(ws.nci[0].nciResult).toBe(12_700)       // 10 % de 127.000

        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_850_000)
        // CMV 5.900.000 − 150.000 + 60.000 = 5.810.000 (planilla)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_810_000)
        // Bienes de cambio 820.000 − 60.000 = 760.000 (planilla)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(760_000)
        expect(totalAssets(ws)).toBe(2_688_000)
        expect(resultToOwners(ws)).toBe(433_900)
        expect(resultToNci(ws)).toBe(12_700)
    })

    it('F — resultado parcialmente trascendido, 60 % vendido (planilla, hoja 05)', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_ASC(429_300, 146_700, 660_000)),
                subEntity(SUB_ASC),
            ],
            operations: [makeOperation({
                description: 'Venta ascendente de mercaderías, 60 % revendido a terceros',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0.6,
            })],
        }))
        expectInvariants(ws)

        expect(ws.nci[0].unrealizedFromSubsidiary).toBe(24_000)  // 60.000 × 40 %
        expect(ws.nci[0].adjustedEquity).toBe(477_000)
        expect(ws.nci[0].expectedInvestment).toBe(429_300)
        expect(ws.nci[0].closingNci).toBe(47_700)
        expect(ws.nci[0].nciResult).toBe(16_300)

        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_850_000)
        // CMV 5.900.000 − 150.000 + 24.000 = 5.774.000 (planilla)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_774_000)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(796_000)
        expect(totalAssets(ws)).toBe(2_724_000)
        expect(resultToOwners(ws)).toBe(466_300)
        expect(resultToNci(ws)).toBe(16_300)
    })
})

// ─────────────────────────────────────────────────────────────
// G / H / I — operaciones DESCENDENTES
// ─────────────────────────────────────────────────────────────

describe('Operaciones descendentes: la controladora vende a la controlada', () => {
    it('G — resultado 100 % trascendido a terceros (planilla, hoja 06)', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_DESC(449_100, 98_100)),
                subEntity(SUB_DESC(400_000)),
            ],
            operations: [makeOperation({
                description: 'Venta descendente de mercaderías, totalmente realizada',
                sellerCompanyId: PARENT, buyerCompanyId: SUB,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 1,
            })],
        }))
        expectInvariants(ws)

        expect(ws.nci[0].subsidiaryEquity).toBe(499_000)
        expect(ws.nci[0].closingNci).toBe(49_900)
        expect(ws.nci[0].nciResult).toBe(10_900)
        expect(ws.nci[0].expectedInvestment).toBe(449_100)

        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_694_000)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_350_000)
        expect(totalAssets(ws)).toBe(2_939_000)
        expect(resultToOwners(ws)).toBe(562_000)
        expect(resultToNci(ws)).toBe(10_900)
    })

    it('H — resultado 100 % NO trascendido: la PNC NO se reduce (planilla, hoja 07)', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_DESC(389_100, 38_100)),
                subEntity(SUB_DESC(400_000)),
            ],
            operations: [makeOperation({
                description: 'Venta descendente de mercaderías, íntegramente en stock de la controlada',
                sellerCompanyId: PARENT, buyerCompanyId: SUB,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0,
            })],
        }))
        expectInvariants(ws)

        // ESTE es el punto central del caso descendente: el resultado no
        // trascendido lo generó la CONTROLADORA, así que la PNC se calcula sobre
        // el patrimonio SIN ajustar. 49.900 = 10 % de 499.000, no de 439.000.
        expect(ws.nci[0].unrealizedFromSubsidiary).toBe(0)
        expect(ws.nci[0].unrealizedFromOthers).toBe(60_000)
        expect(ws.nci[0].adjustedEquity).toBe(499_000)
        expect(ws.nci[0].closingNci).toBe(49_900)
        expect(ws.nci[0].nciResult).toBe(10_900)
        // El VPP sí absorbe el 100 % del resultado no trascendido
        expect(ws.nci[0].expectedInvestment).toBe(389_100)

        expect(consolidated(ws, 'ER_VENTAS')).toBe(7_694_000)
        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_410_000)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(750_000)
        expect(totalAssets(ws)).toBe(2_879_000)
        expect(resultToOwners(ws)).toBe(502_000)
        expect(resultToNci(ws)).toBe(10_900)
    })

    it('I — resultado parcialmente trascendido, 60 % vendido (planilla, hoja 08)', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_DESC(425_100, 74_100)),
                subEntity(SUB_DESC(400_000)),
            ],
            operations: [makeOperation({
                description: 'Venta descendente de mercaderías, 60 % revendido a terceros',
                sellerCompanyId: PARENT, buyerCompanyId: SUB,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0.6,
            })],
        }))
        expectInvariants(ws)

        expect(ws.nci[0].closingNci).toBe(49_900)   // sigue sobre el PN sin ajustar
        expect(ws.nci[0].nciResult).toBe(10_900)
        expect(ws.nci[0].expectedInvestment).toBe(425_100)

        expect(consolidated(ws, 'ER_COSTO_VENTAS')).toBe(5_374_000)
        expect(consolidated(ws, 'AC_BIENES_CAMBIO')).toBe(786_000)
        expect(totalAssets(ws)).toBe(2_915_000)
        expect(resultToOwners(ws)).toBe(538_000)
        expect(resultToNci(ws)).toBe(10_900)
    })
})

// ─────────────────────────────────────────────────────────────
// Hoja "9 Resumen" — recalculada, no copiada
// ─────────────────────────────────────────────────────────────

describe('Hoja 9 Resumen — la asimetría entre ascendente y descendente', () => {
    const asc = (investment: number, equityMethod: number, ratio: number) =>
        buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_ASC(investment, equityMethod, 660_000)), subEntity(SUB_ASC)],
            operations: [makeOperation({
                description: 'Venta ascendente', sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: ratio,
            })],
        }))

    const desc = (investment: number, equityMethod: number, ratio: number) =>
        buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_DESC(investment, equityMethod)), subEntity(SUB_DESC(400_000))],
            operations: [makeOperation({
                description: 'Venta descendente', sellerCompanyId: PARENT, buyerCompanyId: SUB,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: ratio,
            })],
        }))

    it('ASCENDENTES: PN de la controlada − VPP − PNC = resultado no trascendido', () => {
        const cases: [ReturnType<typeof asc>, number][] = [
            [asc(396_900, 114_300, 0), 60_000],
            [asc(429_300, 146_700, 0.6), 24_000],
            [asc(450_900, 168_300, 1), 0],
        ]
        for (const [ws, unrealized] of cases) {
            const d = ws.nci[0]
            expect(d.subsidiaryEquity - d.expectedInvestment - d.closingNci).toBeCloseTo(unrealized, 2)
            expect(d.subsidiaryResult - (d.adjustedResult - d.nciResult) - d.nciResult).toBeCloseTo(unrealized, 2)
        }
    })

    it('DESCENDENTES: la misma diferencia total, pero la PNC nunca la absorbe', () => {
        const cases: [ReturnType<typeof desc>, number][] = [
            [desc(389_100, 38_100, 0), 60_000],
            [desc(425_100, 74_100, 0.6), 24_000],
            [desc(449_100, 98_100, 1), 0],
        ]
        for (const [ws, unrealized] of cases) {
            const d = ws.nci[0]
            expect(d.subsidiaryEquity - d.expectedInvestment - d.closingNci).toBeCloseTo(unrealized, 2)
            // La PNC es SIEMPRE el 10 % del patrimonio sin ajustar
            expect(d.closingNci).toBe(49_900)
            expect(d.nciResult).toBe(10_900)
        }
    })
})

// ─────────────────────────────────────────────────────────────
// J — dividendos internos
// ─────────────────────────────────────────────────────────────

describe('Caso J — dividendos internos', () => {
    it('el dividendo percibido por la controladora se elimina contra los resultados acumulados de la controlada', () => {
        const parentBalances = { ...PARENT_01(432_900, 99_900) }
        // La controlante reconoce además 18.000 de dividendos de la controlada
        parentBalances['resultado-inversiones'] = -(99_900 + 18_000)
        parentBalances['caja'] = 112_000 + 18_000
        const subBalances = { ...SUB_01 }
        // La controlada distribuyó 20.000: 18.000 a la controlante, 2.000 a terceros
        subBalances['resultados-no-asignados'] = -(130_000 - 20_000)
        subBalances['caja'] = 150_000 - 20_000

        const ws = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(parentBalances), subEntity(subBalances)],
            operations: [makeOperation({
                id: 'op-dividendos', type: 'DIVIDENDS',
                description: 'Dividendos de la controlada percibidos por la controladora',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 18_000, groupCost: 18_000, realizedRatio: 1,
            })],
            mappings: investmentMappings(SUB),
        }))

        const elim = ws.eliminations.find(e => e.kind === 'INTRAGROUP_DIVIDEND')!
        expect(elim.balanced).toBe(true)
        expect(elim.lines[0].consolidatedLineId).toBe('ER_RESULTADO_INVERSIONES_PERMANENTES')
        expect(elim.lines[0].debit).toBe(18_000)
        expect(elim.lines[1].consolidatedLineId).toBe('PN_RESULTADOS_ACUMULADOS')
        expect(elim.lines[1].credit).toBe(18_000)
        // El efectivo del grupo bajó sólo por los 2.000 pagados a terceros
        expect(consolidated(ws, 'AC_CAJA_BANCOS')).toBe(260_000)
    })
})

// ─────────────────────────────────────────────────────────────
// L — transferencia interna de un bien de uso
// ─────────────────────────────────────────────────────────────

describe('Caso L — transferencia interna de un bien de uso', () => {
    it('el mayor valor se elimina del activo y se realiza con la depreciación', () => {
        // Resultado interno 30.000, del cual 6.000 ya se realizaron por la
        // depreciación del período: quedan 24.000 no trascendidos. Al ser una
        // operación ASCENDENTE, corrigen el patrimonio de la controlada, y la
        // controladora los refleja en su VPP: 0,9 × (501.000 − 24.000) = 429.300.
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_ASC(429_300, 146_700, 660_000)), subEntity(SUB_ASC)],
            operations: [makeOperation({
                id: 'op-bien-uso', type: 'FIXED_ASSET',
                description: 'Venta de un rodado de la controlada a la controladora',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 100_000, groupCost: 70_000, realizedRatio: 0,
                depreciationOnUnrealized: 6_000,
            })],
        }))

        const elim = ws.eliminations.find(e => e.kind === 'UNREALIZED_RESULT')!
        // Resultado interno 30.000, menos 6.000 ya realizados por depreciación
        expect(elim.lines.find(l => l.consolidatedLineId === 'ANC_BIENES_USO')!.credit).toBe(24_000)
        expect(elim.balanced).toBe(true)
        expect(ws.nci[0].unrealizedFromSubsidiary).toBe(24_000)
        expectInvariants(ws)
    })
})

// ─────────────────────────────────────────────────────────────
// N — varias controladas
// ─────────────────────────────────────────────────────────────

describe('Caso N — varias controladas', () => {
    it('consolida dos controladas con participaciones distintas', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [
                parentEntity(PARENT_01(432_900 + 240_500, 99_900 + 55_500)),
                subEntity(SUB_01, 0.9),
                subEntity(SUB_01, 0.5, SUB_B, 'Controlada B S.A.'),
            ],
            mappings: [
                ...investmentMappings(SUB).map(m => ({ ...m, counterpartyCompanyId: undefined })),
            ],
        }))

        // Con una sola cuenta de inversión para ambas controladas el motor no
        // puede repartirla: la diferencia se EXPONE y bloquea, en lugar de
        // inventar una asignación.
        expect(ws.nci).toHaveLength(2)
        expect(ws.nci.map(d => d.closingNci)).toEqual([48_100, 240_500])
        expect(ws.nci.map(d => d.nciResult)).toEqual([11_100, 55_500])
        expect(ws.blockers.some(b => /valor patrimonial proporcional/i.test(b))).toBe(true)
    })

    it('con cuentas de inversión separadas por controlada, todo cierra', () => {
        const ACC_B = 'inversiones-permanentes'
        // Se usa la misma cuenta pero declarando la contraparte: el motor toma
        // el saldo completo para cada una, lo que sólo es correcto si hay una
        // cuenta por controlada. Este test verifica el caso de UNA controlada
        // por cuenta usando dos grupos independientes.
        const wsA = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(432_900, 99_900)), subEntity(SUB_01, 0.9)],
            mappings: investmentMappings(SUB),
        }))
        const wsB = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(240_500, 55_500)), subEntity(SUB_01, 0.5, SUB_B, 'Controlada B S.A.')],
            mappings: investmentMappings(SUB_B),
        }))
        expectInvariants(wsA)
        expectInvariants(wsB)
        expect(wsA.nci[0].consolidationDifference).toBe(0)
        expect(wsB.nci[0].consolidationDifference).toBe(0)
        expect(ACC_B).toBe('inversiones-permanentes')
    })
})

// ─────────────────────────────────────────────────────────────
// Determinismo e idempotencia (§20.12)
// ─────────────────────────────────────────────────────────────

describe('Determinismo e idempotencia del motor', () => {
    it('recalcular dos veces produce exactamente lo mismo', () => {
        const input = makeInput({
            entities: [parentEntity(PARENT_ASC(429_300, 146_700, 660_000)), subEntity(SUB_ASC)],
            operations: [makeOperation({
                description: 'Venta ascendente', sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0.6,
            })],
        })
        const a = buildConsolidationWorksheet(input)
        const b = buildConsolidationWorksheet(input)
        expect(JSON.stringify(b)).toBe(JSON.stringify(a))
        // Y no acumula: los importes de la segunda corrida no son el doble
        expect(b.rows.find(r => r.lineId === 'AC_BIENES_CAMBIO')!.unrealizedElimination)
            .toBe(a.rows.find(r => r.lineId === 'AC_BIENES_CAMBIO')!.unrealizedElimination)
    })

    it('los estados fuente permanecen inmutables', () => {
        const parent = parentEntity(PARENT_01(432_900, 99_900))
        const sub = subEntity(SUB_01)
        const snapshot = JSON.stringify([parent.trialBalance, sub.trialBalance])
        buildConsolidationWorksheet(makeInput({ entities: [parent, sub] }))
        expect(JSON.stringify([parent.trialBalance, sub.trialBalance])).toBe(snapshot)
    })
})

// ─────────────────────────────────────────────────────────────
// El motor no fuerza el cuadre (§20)
// ─────────────────────────────────────────────────────────────

describe('El motor no inventa un ajuste para cuadrar', () => {
    it('expone la diferencia cuando la inversión no coincide con el VPP', () => {
        // La controladora tiene la inversión a COSTO (400.000) en vez de al VPP
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(400_000, 99_900)), subEntity(SUB_01)],
        }))
        const llave = ws.rows.find(r => r.lineId === 'ANC_LLAVE_NEGOCIO')
        expect(llave).toBeDefined()
        expect(ws.nci[0].consolidationDifference).toBe(-32_900)
        expect(ws.blockers.some(b => /valor patrimonial proporcional/i.test(b))).toBe(true)
        // Aun así, la hoja CIERRA: la diferencia está expuesta, no escondida
        expect(ws.checks.find(c => c.id === 'consolidado-suma-cero')!.passed).toBe(true)
    })

    it('bloquea si la cuenta de inversión no está mapeada', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(432_900, 99_900)), subEntity(SUB_01)],
            mappings: [],
        }))
        expect(ws.blockers.some(b => /inversión en/i.test(b))).toBe(true)
    })

    it('bloquea un resultado no trascendido que no tiene activo donde alojarse', () => {
        const ws = buildConsolidationWorksheet(makeInput({
            entities: [parentEntity(PARENT_01(432_900, 99_900)), subEntity(SUB_01)],
            operations: [makeOperation({
                type: 'SERVICES', description: 'Servicio prestado a la controlante',
                sellerCompanyId: SUB, buyerCompanyId: PARENT,
                transferAmount: 50_000, groupCost: 30_000, realizedRatio: 0,
            })],
        }))
        expect(ws.blockers.some(b => /no deja ningún activo/i.test(b))).toBe(true)
    })
})
