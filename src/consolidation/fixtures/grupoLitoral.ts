/**
 * Dataset demostrativo "Grupo Litoral" (Fase 2K §25).
 *
 * Dos entidades REALES de la instalación, cada una con su propio Libro Diario,
 * sus propios ejercicios y sus propios estados producidos por el motor canónico.
 * No hay paquetes de reporte simulados ni importes precargados: todo sale de
 * asientos contabilizados por la puerta única de contabilización.
 *
 *   Litoral Holding S.A.      controladora
 *   Iberá Distribuciones S.A. controlada al 80 % (PNC del 20 %)
 *
 * El caso ejercita, con cifras verificables a mano:
 *   - préstamo intragrupo con intereses devengados y cobrados;
 *   - saldo comercial recíproco pendiente al cierre;
 *   - venta ASCENDENTE de mercaderías con el 70 % revendido a terceros
 *     (resultado no trascendido de 18.000 que se reparte con la PNC);
 *   - dividendos en efectivo, con la parte de la PNC saliendo del grupo;
 *   - medición de la inversión por VPP, de modo que la diferencia de
 *     consolidación da exactamente cero;
 *   - ejercicio 2024 completo como comparativo del 2025.
 *
 * NO TOCA PURMAMARCA. Usa empresas propias y un plan de cuentas propio en el
 * espacio de códigos 9.x, que la instalación no utiliza. (El código de cuenta
 * es único en toda la base —restricción heredada del esquema—, así que un
 * dataset nuevo necesita su propio espacio de códigos; queda declarado como
 * limitación en el informe.)
 */

import type { Account } from '../../core/models'
import { db, generateId } from '../../storage/db'
import {
    closeExercise,
    createCompany,
    getCompany,
    getExerciseForCompanyYear,
} from '../../accounting/application/contextService'
import { postNewEntry } from '../../accounting/application/journalService'
import {
    addMember,
    createConsolidation,
    createGroup,
    putIntragroupOperation,
    putMapping,
    putReciprocal,
    updateConsolidation,
} from '../repository'
import type { EconomicGroup } from '../domain/types'

export const LITORAL_PARENT_ID = 'company-litoral-holding'
export const LITORAL_SUB_ID = 'company-ibera-distribuciones'
export const LITORAL_GROUP_ID = 'group-litoral'

const A = {
    caja: 'gl-caja',
    deudores: 'gl-deudores',
    deudoresGrupo: 'gl-deudores-grupo',
    creditosGrupo: 'gl-creditos-grupo',
    mercaderias: 'gl-mercaderias',
    inversionIbera: 'gl-inversion-ibera',
    deudasComerciales: 'gl-deudas-comerciales',
    deudasGrupo: 'gl-deudas-grupo',
    prestamosGrupo: 'gl-prestamos-grupo',
    deudasFiscales: 'gl-deudas-fiscales',
    capital: 'gl-capital',
    resultadosNoAsignados: 'gl-rna',
    ventas: 'gl-ventas',
    cmv: 'gl-cmv',
    gastosAdmin: 'gl-gastos-admin',
    interesesGanados: 'gl-intereses-ganados',
    interesesPerdidos: 'gl-intereses-perdidos',
    resultadoInversiones: 'gl-resultado-inversiones',
    impuesto: 'gl-impuesto',
} as const

function account(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: 'Grupo Litoral',
        statementGroup: null,
        parentId: null,
        level: 3,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: true,
        companyId: LITORAL_PARENT_ID,
        ...partial,
    }
}

/**
 * Plan de cuentas COMPARTIDO por las dos entidades. Los saldos difieren porque
 * difieren los asientos de cada una, no porque tengan planes distintos.
 */
export const LITORAL_ACCOUNTS: Account[] = [
    // El rol de efectivo lo determina statementGroup CASH_AND_BANKS, igual que
    // en el resto de la aplicación (ver deriveLegacyPolicy).
    account({ id: A.caja, code: '9.1.01.01', name: 'Caja y bancos', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    account({ id: A.deudores, code: '9.1.02.01', name: 'Deudores por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    account({ id: A.deudoresGrupo, code: '9.1.02.02', name: 'Deudores por ventas — sociedades del grupo', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    account({ id: A.creditosGrupo, code: '9.1.03.01', name: 'Préstamos otorgados a sociedades del grupo', kind: 'ASSET', statementGroup: 'OTHER_RECEIVABLES' }),
    account({ id: A.mercaderias, code: '9.1.04.01', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    account({ id: A.inversionIbera, code: '9.1.05.01', name: 'Inversión permanente en Iberá Distribuciones S.A.', kind: 'ASSET', statementGroup: 'INVESTMENTS', section: 'NON_CURRENT', currentClassification: 'NON_CURRENT' }),
    account({ id: A.deudasComerciales, code: '9.2.01.01', name: 'Deudas comerciales', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    account({ id: A.deudasGrupo, code: '9.2.01.02', name: 'Deudas comerciales — sociedades del grupo', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    account({ id: A.prestamosGrupo, code: '9.2.02.01', name: 'Préstamos de sociedades del grupo', kind: 'LIABILITY', statementGroup: 'LOANS' }),
    account({ id: A.deudasFiscales, code: '9.2.03.01', name: 'Deudas fiscales', kind: 'LIABILITY', statementGroup: 'TAX_LIABILITIES' }),
    account({ id: A.capital, code: '9.3.01.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL' }),
    account({ id: A.resultadosNoAsignados, code: '9.3.02.01', name: 'Resultados no asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', equityComponent: 'PRIOR_RETAINED_EARNINGS' }),
    account({ id: A.ventas, code: '9.4.01.01', name: 'Ventas de mercaderías', kind: 'INCOME', statementGroup: 'SALES', section: 'OPERATING' }),
    account({ id: A.cmv, code: '9.5.01.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS', section: 'COST' }),
    account({ id: A.gastosAdmin, code: '9.5.02.01', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', section: 'ADMIN', resultFunction: 'ADMINISTRATION' }),
    account({ id: A.interesesGanados, code: '9.4.02.01', name: 'Intereses ganados', kind: 'INCOME', statementGroup: 'FINANCIAL_INCOME', section: 'FINANCIAL' }),
    account({ id: A.interesesPerdidos, code: '9.5.03.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES', section: 'FINANCIAL' }),
    account({ id: A.resultadoInversiones, code: '9.4.03.01', name: 'Resultado de inversiones permanentes', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OTHER' }),
    account({ id: A.impuesto, code: '9.5.09.01', name: 'Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX', section: 'OTHER' }),
]

type Line = { accountId: string; debit: number; credit: number }
const d = (accountId: string, amount: number): Line => ({ accountId, debit: amount, credit: 0 })
const h = (accountId: string, amount: number): Line => ({ accountId, debit: 0, credit: amount })

interface EntrySpec {
    date: string
    memo: string
    lines: Line[]
    opening?: boolean
}

// ─────────────────────────────────────────────────────────────
// Litoral Holding S.A. — controladora
// ─────────────────────────────────────────────────────────────

const PARENT_2024: EntrySpec[] = [
    { date: '2024-03-01', memo: 'Aporte de capital de los accionistas', lines: [d(A.caja, 900_000), h(A.capital, 900_000)] },
    { date: '2024-03-01', memo: 'Compra del 80 % del capital de Iberá Distribuciones S.A.', lines: [d(A.inversionIbera, 240_000), h(A.caja, 240_000)] },
    { date: '2024-06-01', memo: 'Compra de mercaderías de contado', lines: [d(A.mercaderias, 300_000), h(A.caja, 300_000)] },
    { date: '2024-09-01', memo: 'Venta de mercaderías a terceros, en cuenta corriente', lines: [d(A.deudores, 500_000), h(A.ventas, 500_000)] },
    { date: '2024-09-01', memo: 'Costo de las mercaderías vendidas', lines: [d(A.cmv, 280_000), h(A.mercaderias, 280_000)] },
    { date: '2024-11-30', memo: 'Gastos de administración pagados', lines: [d(A.gastosAdmin, 90_000), h(A.caja, 90_000)] },
    { date: '2024-12-31', memo: 'Valor patrimonial proporcional sobre el resultado de Iberá (80 % de 50.000)', lines: [d(A.inversionIbera, 40_000), h(A.resultadoInversiones, 40_000)] },
    { date: '2024-12-31', memo: 'Impuesto a las ganancias del ejercicio', lines: [d(A.impuesto, 45_000), h(A.deudasFiscales, 45_000)] },
]

const PARENT_2025: EntrySpec[] = [
    {
        date: '2025-01-01', memo: 'Asiento de apertura del ejercicio 2025', opening: true,
        lines: [
            d(A.caja, 270_000), d(A.deudores, 500_000), d(A.mercaderias, 20_000), d(A.inversionIbera, 280_000),
            h(A.deudasFiscales, 45_000), h(A.capital, 900_000), h(A.resultadosNoAsignados, 125_000),
        ],
    },
    { date: '2025-01-10', memo: 'Préstamo otorgado a Iberá Distribuciones S.A.', lines: [d(A.creditosGrupo, 200_000), h(A.caja, 200_000)] },
    { date: '2025-02-15', memo: 'Cobro de deudores del ejercicio anterior', lines: [d(A.caja, 500_000), h(A.deudores, 500_000)] },
    { date: '2025-03-15', memo: 'Compra de mercaderías a terceros, de contado', lines: [d(A.mercaderias, 350_000), h(A.caja, 350_000)] },
    { date: '2025-03-31', memo: 'Pago del impuesto a las ganancias del ejercicio anterior', lines: [d(A.deudasFiscales, 45_000), h(A.caja, 45_000)] },
    { date: '2025-06-20', memo: 'Compra de mercaderías a Iberá Distribuciones S.A.', lines: [d(A.mercaderias, 180_000), h(A.deudasGrupo, 180_000)] },
    { date: '2025-09-30', memo: 'Venta de mercaderías a terceros, en cuenta corriente', lines: [d(A.deudores, 700_000), h(A.ventas, 700_000)] },
    { date: '2025-09-30', memo: 'Costo de las mercaderías vendidas', lines: [d(A.cmv, 420_000), h(A.mercaderias, 420_000)] },
    { date: '2025-10-31', memo: 'Pago parcial a Iberá Distribuciones S.A.', lines: [d(A.deudasGrupo, 100_000), h(A.caja, 100_000)] },
    { date: '2025-11-30', memo: 'Cobro de intereses del préstamo a Iberá Distribuciones S.A.', lines: [d(A.caja, 24_000), h(A.interesesGanados, 24_000)] },
    { date: '2025-11-30', memo: 'Gastos de administración pagados', lines: [d(A.gastosAdmin, 120_000), h(A.caja, 120_000)] },
    { date: '2025-12-15', memo: 'Dividendos en efectivo cobrados de Iberá (reducen el valor de la inversión)', lines: [d(A.caja, 32_000), h(A.inversionIbera, 32_000)] },
    { date: '2025-12-31', memo: 'Valor patrimonial proporcional sobre el resultado ajustado de Iberá (80 % de 78.000)', lines: [d(A.inversionIbera, 62_400), h(A.resultadoInversiones, 62_400)] },
    { date: '2025-12-31', memo: 'Impuesto a las ganancias del ejercicio', lines: [d(A.impuesto, 60_000), h(A.deudasFiscales, 60_000)] },
]

// ─────────────────────────────────────────────────────────────
// Iberá Distribuciones S.A. — controlada al 80 %
// ─────────────────────────────────────────────────────────────

const SUB_2024: EntrySpec[] = [
    { date: '2024-03-01', memo: 'Aporte de capital de los accionistas', lines: [d(A.caja, 300_000), h(A.capital, 300_000)] },
    { date: '2024-06-01', memo: 'Compra de mercaderías de contado', lines: [d(A.mercaderias, 200_000), h(A.caja, 200_000)] },
    { date: '2024-09-01', memo: 'Venta de mercaderías a terceros, en cuenta corriente', lines: [d(A.deudores, 260_000), h(A.ventas, 260_000)] },
    { date: '2024-09-01', memo: 'Costo de las mercaderías vendidas', lines: [d(A.cmv, 150_000), h(A.mercaderias, 150_000)] },
    { date: '2024-11-30', memo: 'Gastos de administración pagados', lines: [d(A.gastosAdmin, 40_000), h(A.caja, 40_000)] },
    { date: '2024-12-31', memo: 'Impuesto a las ganancias del ejercicio', lines: [d(A.impuesto, 20_000), h(A.deudasFiscales, 20_000)] },
]

const SUB_2025: EntrySpec[] = [
    {
        date: '2025-01-01', memo: 'Asiento de apertura del ejercicio 2025', opening: true,
        lines: [
            d(A.caja, 60_000), d(A.deudores, 260_000), d(A.mercaderias, 50_000),
            h(A.deudasFiscales, 20_000), h(A.capital, 300_000), h(A.resultadosNoAsignados, 50_000),
        ],
    },
    { date: '2025-01-10', memo: 'Préstamo recibido de Litoral Holding S.A.', lines: [d(A.caja, 200_000), h(A.prestamosGrupo, 200_000)] },
    { date: '2025-02-15', memo: 'Cobro de deudores del ejercicio anterior', lines: [d(A.caja, 260_000), h(A.deudores, 260_000)] },
    { date: '2025-02-15', memo: 'Compra de mercaderías a terceros, de contado', lines: [d(A.mercaderias, 400_000), h(A.caja, 400_000)] },
    { date: '2025-03-31', memo: 'Pago del impuesto a las ganancias del ejercicio anterior', lines: [d(A.deudasFiscales, 20_000), h(A.caja, 20_000)] },
    { date: '2025-06-20', memo: 'Venta de mercaderías a Litoral Holding S.A.', lines: [d(A.deudoresGrupo, 180_000), h(A.ventas, 180_000)] },
    { date: '2025-06-20', memo: 'Costo de las mercaderías vendidas a Litoral Holding S.A.', lines: [d(A.cmv, 120_000), h(A.mercaderias, 120_000)] },
    { date: '2025-09-30', memo: 'Venta de mercaderías a terceros, en cuenta corriente', lines: [d(A.deudores, 400_000), h(A.ventas, 400_000)] },
    { date: '2025-09-30', memo: 'Costo de las mercaderías vendidas', lines: [d(A.cmv, 240_000), h(A.mercaderias, 240_000)] },
    { date: '2025-10-31', memo: 'Cobro parcial a Litoral Holding S.A.', lines: [d(A.caja, 100_000), h(A.deudoresGrupo, 100_000)] },
    { date: '2025-11-30', memo: 'Pago de intereses del préstamo a Litoral Holding S.A.', lines: [d(A.interesesPerdidos, 24_000), h(A.caja, 24_000)] },
    { date: '2025-11-30', memo: 'Gastos de administración pagados', lines: [d(A.gastosAdmin, 60_000), h(A.caja, 60_000)] },
    { date: '2025-12-15', memo: 'Dividendos en efectivo distribuidos (32.000 a la controladora, 8.000 a terceros)', lines: [d(A.resultadosNoAsignados, 40_000), h(A.caja, 40_000)] },
    { date: '2025-12-31', memo: 'Impuesto a las ganancias del ejercicio', lines: [d(A.impuesto, 40_000), h(A.deudasFiscales, 40_000)] },
]

// ─────────────────────────────────────────────────────────────
// Siembra
// ─────────────────────────────────────────────────────────────

async function postAll(companyId: string, specs: EntrySpec[]): Promise<void> {
    for (const spec of specs) {
        await postNewEntry({
            date: spec.date,
            memo: spec.memo,
            lines: spec.lines,
            companyId,
            allowExerciseProvisioning: true,
            ...(spec.opening ? { sourceModule: 'closing', sourceType: 'apertura', sourceId: `${companyId}-apertura-${spec.date.slice(0, 4)}` } : {}),
        })
    }
}

export interface LitoralSeedResult {
    group: EconomicGroup
    consolidation2024Id: string
    consolidation2025Id: string
}

/**
 * Siembra el grupo completo. Es IDEMPOTENTE: si las entidades ya existen, no
 * duplica nada (los asientos llevan clave de idempotencia por su origen y las
 * altas verifican existencia previa).
 */
export async function seedGrupoLitoral(): Promise<LitoralSeedResult> {
    const existing = await db.economicGroups.get(LITORAL_GROUP_ID)
    if (existing) {
        const consolidations = await db.consolidationExercises.where('groupId').equals(LITORAL_GROUP_ID).toArray()
        return {
            group: existing,
            consolidation2024Id: consolidations.find(c => c.reportingDate.startsWith('2024'))!.id,
            consolidation2025Id: consolidations.find(c => c.reportingDate.startsWith('2025'))!.id,
        }
    }

    // 1. Entidades
    if (!(await getCompany(LITORAL_PARENT_ID))) {
        await createCompany({
            id: LITORAL_PARENT_ID, legalName: 'Litoral Holding S.A.',
            taxId: '30-71000001-7', jurisdiction: 'AR-Corrientes',
        })
    }
    if (!(await getCompany(LITORAL_SUB_ID))) {
        await createCompany({
            id: LITORAL_SUB_ID, legalName: 'Iberá Distribuciones S.A.',
            taxId: '30-71000002-5', jurisdiction: 'AR-Corrientes',
        })
    }

    // 2. Plan de cuentas compartido
    const existingCodes = new Set((await db.accounts.toArray()).map(a => a.code))
    const missing = LITORAL_ACCOUNTS.filter(a => !existingCodes.has(a.code))
    if (missing.length > 0) await db.accounts.bulkPut(missing)

    // 3. Libros de cada entidad
    await postAll(LITORAL_PARENT_ID, PARENT_2024)
    await postAll(LITORAL_PARENT_ID, PARENT_2025)
    await postAll(LITORAL_SUB_ID, SUB_2024)
    await postAll(LITORAL_SUB_ID, SUB_2025)

    // Los ejercicios que alimentan una consolidación tienen que estar cerrados:
    // si siguen abiertos sus cifras pueden cambiar y el consolidado quedaría
    // apoyado en números provisorios. Cerrarlos no altera ningún importe.
    for (const companyId of [LITORAL_PARENT_ID, LITORAL_SUB_ID]) {
        for (const year of [2024, 2025]) {
            const exercise = await getExerciseForCompanyYear(companyId, year)
            if (exercise && exercise.status !== 'CLOSED') await closeExercise(exercise.id)
        }
    }

    // 4. Grupo económico y perímetro
    const group = await createGroup({
        id: LITORAL_GROUP_ID,
        name: 'Grupo Litoral',
        parentCompanyId: LITORAL_PARENT_ID,
        description: 'Caso demostrativo de consolidación: controladora, controlada al 80 %, operaciones intragrupo y participación no controladora.',
    })
    await addMember({
        groupId: group.id,
        companyId: LITORAL_SUB_ID,
        relation: 'SUBSIDIARY',
        method: 'FULL',
        directOwnership: 0.8,
        votingRights: 0.8,
        controlFrom: '2024-03-01',
        hasControl: true,
        controlBasis: 'MAJORITY_VOTING_RIGHTS',
        controlRationale:
            'Litoral Holding S.A. posee el 80 % del capital y de los derechos de voto de Iberá Distribuciones S.A. ' +
            'desde el 1 de marzo de 2024, lo que le permite dirigir sus políticas operativas y financieras.',
    })

    // 5. Mapeo: qué cuentas son intragrupo y contra quién
    const mapCommon = { groupId: group.id, source: 'AUTO' as const, confidence: 'HIGH' as const }
    await putMapping({
        ...mapCommon, companyId: LITORAL_PARENT_ID, accountId: A.inversionIbera,
        consolidatedLineId: 'ANC_INVERSIONES', intragroupCategory: 'INVESTMENT_IN_SUBSIDIARY',
        counterpartyCompanyId: LITORAL_SUB_ID,
        rationale: 'Inversión permanente en la controlada, medida por valor patrimonial proporcional',
    })
    await putMapping({
        ...mapCommon, companyId: LITORAL_PARENT_ID, accountId: A.resultadoInversiones,
        consolidatedLineId: 'ER_RESULTADO_INVERSIONES_PERMANENTES', intragroupCategory: 'EQUITY_METHOD_RESULT',
        counterpartyCompanyId: LITORAL_SUB_ID,
        rationale: 'Resultado que la inversión en la controlada genera en la controladora',
    })
    await putMapping({
        ...mapCommon, companyId: LITORAL_PARENT_ID, accountId: A.creditosGrupo,
        consolidatedLineId: 'AC_OTROS_CREDITOS', intragroupCategory: 'INTRAGROUP_LOAN_ASSET',
        counterpartyCompanyId: LITORAL_SUB_ID,
    })
    await putMapping({
        ...mapCommon, companyId: LITORAL_SUB_ID, accountId: A.prestamosGrupo,
        consolidatedLineId: 'PC_PRESTAMOS', intragroupCategory: 'INTRAGROUP_LOAN_LIABILITY',
        counterpartyCompanyId: LITORAL_PARENT_ID,
    })
    await putMapping({
        ...mapCommon, companyId: LITORAL_SUB_ID, accountId: A.deudoresGrupo,
        consolidatedLineId: 'AC_CREDITOS_VENTAS', intragroupCategory: 'INTRAGROUP_RECEIVABLE',
        counterpartyCompanyId: LITORAL_PARENT_ID,
    })
    await putMapping({
        ...mapCommon, companyId: LITORAL_PARENT_ID, accountId: A.deudasGrupo,
        consolidatedLineId: 'PC_DEUDAS_COMERCIALES', intragroupCategory: 'INTRAGROUP_PAYABLE',
        counterpartyCompanyId: LITORAL_SUB_ID,
    })

    // 6. Ejercicios de consolidación
    const consolidation2024 = await createConsolidation({
        groupId: group.id, year: 2024, label: 'Consolidado 2024',
    })
    const consolidation2025 = await createConsolidation({
        groupId: group.id, year: 2025, label: 'Consolidado 2025',
        previousConsolidationId: consolidation2024.id,
    })
    await updateConsolidation(consolidation2025.id, { previousConsolidationId: consolidation2024.id })

    // 7. Partidas recíprocas y operaciones internas del ejercicio 2025
    await putReciprocal({
        consolidationId: consolidation2025.id, kind: 'LOAN',
        creditorCompanyId: LITORAL_PARENT_ID, creditorAccountId: A.creditosGrupo, creditorAmount: 200_000,
        debtorCompanyId: LITORAL_SUB_ID, debtorAccountId: A.prestamosGrupo, debtorAmount: 200_000,
        autoDetected: true, status: 'RECONCILED',
    })
    await putReciprocal({
        consolidationId: consolidation2025.id, kind: 'TRADE',
        creditorCompanyId: LITORAL_SUB_ID, creditorAccountId: A.deudoresGrupo, creditorAmount: 80_000,
        debtorCompanyId: LITORAL_PARENT_ID, debtorAccountId: A.deudasGrupo, debtorAmount: 80_000,
        autoDetected: true, status: 'RECONCILED',
    })

    await putIntragroupOperation({
        id: `${LITORAL_GROUP_ID}-op-mercaderias-2025`,
        consolidationId: consolidation2025.id, type: 'GOODS',
        sellerCompanyId: LITORAL_SUB_ID, buyerCompanyId: LITORAL_PARENT_ID,
        description: 'Venta ascendente de mercaderías de Iberá a Litoral Holding',
        transferAmount: 180_000, groupCost: 120_000, realizedRatio: 0.7,
    })
    await putIntragroupOperation({
        id: `${LITORAL_GROUP_ID}-op-intereses-2025`,
        consolidationId: consolidation2025.id, type: 'INTEREST',
        sellerCompanyId: LITORAL_PARENT_ID, buyerCompanyId: LITORAL_SUB_ID,
        description: 'Intereses del préstamo intragrupo, devengados y pagados',
        transferAmount: 24_000, groupCost: 24_000, realizedRatio: 1,
    })

    // Flujos de efectivo intragrupo del ejercicio (Fase 2K §14)
    await db.intragroupOperations.put({
        id: `${LITORAL_GROUP_ID}-flujo-prestamo-2025`,
        consolidationId: consolidation2025.id, type: 'OTHER',
        sellerCompanyId: LITORAL_SUB_ID, buyerCompanyId: LITORAL_PARENT_ID,
        description: 'Desembolso del préstamo intragrupo',
        transferAmount: 0, groupCost: 0, realizedRatio: 1,
        cashFlow: { amount: 200_000, payerActivity: 'INVESTING', receiverActivity: 'FINANCING' },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    await db.intragroupOperations.put({
        id: `${LITORAL_GROUP_ID}-flujo-dividendos-2025`,
        consolidationId: consolidation2025.id, type: 'DIVIDENDS',
        sellerCompanyId: LITORAL_SUB_ID, buyerCompanyId: LITORAL_PARENT_ID,
        description: 'Dividendos cobrados de Iberá por la controladora (la porción de la PNC no es interna)',
        transferAmount: 0, groupCost: 0, realizedRatio: 1,
        cashFlow: { amount: 32_000, payerActivity: 'FINANCING', receiverActivity: 'INVESTING' },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })

    return {
        group,
        consolidation2024Id: consolidation2024.id,
        consolidation2025Id: consolidation2025.id,
    }
}

/** Ids de cuentas del dataset, para los tests y la interfaz */
export const LITORAL_ACCOUNT_IDS = A

/** Genera un id nuevo (evita colisiones si el dataset se siembra dos veces) */
export const newId = generateId
