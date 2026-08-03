/**
 * Fixtures de consolidación (Fase 2K §19).
 *
 * Reconstruyen los casos de la planilla de la cátedra
 * "03 EECC Consolidados Sencillo HJA" a partir de los ENUNCIADOS, no copiando
 * las fórmulas de Excel. Cada caso se arma como dos balances de comprobación
 * individuales completos —los mismos que produciría el motor de ContaLivre— y
 * el resultado esperado se verifica contra la planilla.
 */

import type { Account } from '../../src/core/models'
import type { NormalizedTrialBalance, StatementsBundle, TrialBalanceRow2B } from '../../src/reporting/domain/types'
import type {
    ConsolidationEngineInput,
    ConsolidationEntityInput,
    ConsolidationExercise,
    ConsolidationAccountMapping,
    EconomicGroup,
    IntragroupOperation,
    ReciprocalBalance,
    ConsolidationWorksheet,
} from '../../src/consolidation/domain/types'

export const PARENT = 'controlante'
export const SUB = 'controlada'
export const SUB_B = 'controlada-b'

function acc(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: 'Consolidación',
        statementGroup: null,
        parentId: null,
        level: 2,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: true,
        ...partial,
    }
}

/** Plan de cuentas del caso de la cátedra */
export const CASE_ACCOUNTS: Account[] = [
    acc({ id: 'caja', code: '1.1.01', name: 'Caja y Bancos', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    acc({ id: 'creditos-ventas', code: '1.1.02', name: 'Créditos por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    acc({ id: 'otros-creditos', code: '1.1.03', name: 'Otros créditos', kind: 'ASSET', statementGroup: 'OTHER_RECEIVABLES' }),
    acc({ id: 'bienes-cambio', code: '1.1.04', name: 'Bienes de Cambio', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    acc({ id: 'inversiones-permanentes', code: '1.2.01', name: 'Inversiones permanentes', kind: 'ASSET', statementGroup: 'INVESTMENTS', section: 'NON_CURRENT', currentClassification: 'NON_CURRENT' }),
    acc({ id: 'bienes-uso', code: '1.2.02', name: 'Bienes de Uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', currentClassification: 'NON_CURRENT' }),
    acc({ id: 'deudas-comerciales', code: '2.1.01', name: 'Deudas comerciales', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    acc({ id: 'deudas-sociales', code: '2.1.02', name: 'Deudas sociales', kind: 'LIABILITY', statementGroup: 'PAYROLL_LIABILITIES' }),
    acc({ id: 'deudas-fiscales', code: '2.1.03', name: 'Deudas fiscales', kind: 'LIABILITY', statementGroup: 'TAX_LIABILITIES' }),
    acc({ id: 'otros-pasivos', code: '2.1.04', name: 'Otros pasivos', kind: 'LIABILITY', statementGroup: 'OTHER_PAYABLES' }),
    acc({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL' }),
    acc({ id: 'reserva-legal', code: '3.2.01', name: 'Reserva Legal', kind: 'EQUITY', statementGroup: 'RESERVES', equityComponent: 'LEGAL_RESERVE' }),
    acc({ id: 'resultados-no-asignados', code: '3.3.01', name: 'Resultados no Asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', equityComponent: 'PRIOR_RETAINED_EARNINGS' }),
    acc({ id: 'ventas', code: '4.1.01', name: 'Ventas de bienes y servicios', kind: 'INCOME', statementGroup: 'SALES', section: 'OPERATING' }),
    acc({ id: 'cmv', code: '5.1.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS', section: 'COST' }),
    acc({ id: 'gastos-administracion', code: '5.2.01', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', section: 'ADMIN' }),
    acc({ id: 'gastos-comercializacion', code: '5.3.01', name: 'Gastos de comercialización', kind: 'EXPENSE', statementGroup: 'SELLING_EXPENSES', section: 'SELLING' }),
    acc({ id: 'intereses-perdidos', code: '5.4.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES', section: 'FINANCIAL' }),
    acc({ id: 'intereses-ganados', code: '4.4.01', name: 'Intereses ganados', kind: 'INCOME', statementGroup: 'FINANCIAL_INCOME', section: 'FINANCIAL' }),
    acc({ id: 'resultado-inversiones', code: '4.5.01', name: 'Resultado de inversiones permanentes', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OTHER' }),
    acc({ id: 'impuesto-ganancias', code: '5.9.01', name: 'Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX', section: 'OTHER' }),
]

const ACCOUNT_BY_ID = new Map(CASE_ACCOUNTS.map(a => [a.id, a]))

/**
 * Saldos en convención Debe − Haber. Activos y gastos positivos; pasivos,
 * patrimonio e ingresos negativos. Es la misma convención del motor.
 */
export type Balances = Record<string, number>

/** Convierte saldos "de exposición" (todos positivos) a Debe − Haber */
export function exposure(balances: {
    assets?: Record<string, number>
    liabilities?: Record<string, number>
    equity?: Record<string, number>
    expenses?: Record<string, number>
    income?: Record<string, number>
}): Balances {
    const out: Balances = {}
    for (const [id, v] of Object.entries(balances.assets ?? {})) out[id] = v
    for (const [id, v] of Object.entries(balances.expenses ?? {})) out[id] = v
    for (const [id, v] of Object.entries(balances.liabilities ?? {})) out[id] = -v
    for (const [id, v] of Object.entries(balances.equity ?? {})) out[id] = -v
    for (const [id, v] of Object.entries(balances.income ?? {})) out[id] = -v
    return out
}

export function makeTrialBalance(companyId: string, balances: Balances): NormalizedTrialBalance {
    const rows: TrialBalanceRow2B[] = Object.entries(balances).map(([accountId, closing]) => {
        const account = ACCOUNT_BY_ID.get(accountId)
        if (!account) throw new Error(`Cuenta desconocida en el fixture: ${accountId}`)
        return {
            accountId,
            code: account.code,
            name: account.name,
            kind: account.kind,
            isContra: false,
            opening: 0,
            periodDebit: closing > 0 ? closing : 0,
            periodCredit: closing < 0 ? -closing : 0,
            closing,
            entryIds: [],
            unknownAccount: false,
        }
    })
    const totalDebit = rows.reduce((s, r) => s + r.periodDebit, 0)
    const totalCredit = rows.reduce((s, r) => s + r.periodCredit, 0)
    return {
        context: {
            companyId,
            exerciseId: `exercise-${companyId}-2022`,
            exerciseLabel: 'Ejercicio 2022',
            periodStart: '2022-01-01',
            periodEnd: '2022-12-31',
        },
        rows,
        totalPeriodDebit: totalDebit,
        totalPeriodCredit: totalCredit,
        totalOpeningDebit: 0,
        totalOpeningCredit: 0,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.005,
    }
}

/**
 * StatementsBundle mínimo. Los casos de la planilla ejercitan la hoja de
 * consolidación, que se construye sobre el balance de comprobación; el bundle
 * completo se ejercita en los tests de integración con la base real.
 */
function stubBundle(tb: NormalizedTrialBalance): StatementsBundle {
    return { trialBalance: tb } as unknown as StatementsBundle
}

export function makeEntity(input: {
    companyId: string
    companyName: string
    relation?: ConsolidationEntityInput['relation']
    method?: ConsolidationEntityInput['method']
    ownership?: number
    balances: Balances
    exerciseStatus?: string
}): ConsolidationEntityInput {
    const tb = makeTrialBalance(input.companyId, input.balances)
    return {
        companyId: input.companyId,
        companyName: input.companyName,
        relation: input.relation ?? 'SUBSIDIARY',
        method: input.method ?? 'FULL',
        ownership: input.ownership ?? 1,
        statements: stubBundle(tb),
        trialBalance: tb,
        accounts: CASE_ACCOUNTS,
        periodEnd: '2022-12-31',
        exerciseStatus: input.exerciseStatus ?? 'CLOSED',
    }
}

const GROUP: EconomicGroup = {
    id: 'grupo-catedra',
    name: 'Grupo Controlante S.A.',
    parentCompanyId: PARENT,
    presentationCurrency: 'ARS',
    measurementUnit: 'Moneda de cierre',
    createdAt: '2022-01-01T00:00:00.000Z',
    updatedAt: '2022-01-01T00:00:00.000Z',
    active: true,
}

const CONSOLIDATION: ConsolidationExercise = {
    id: 'consolidacion-2022',
    groupId: GROUP.id,
    label: 'Ejercicio 2022',
    reportingDate: '2022-12-31',
    periodStart: '2022-01-01',
    periodEnd: '2022-12-31',
    status: 'DRAFT',
    createdAt: '2022-12-31T00:00:00.000Z',
    updatedAt: '2022-12-31T00:00:00.000Z',
}

/**
 * Mapeo mínimo del grupo: la controladora declara cuál es su cuenta de
 * inversión en la controlada y cuál el resultado que esa inversión le genera.
 * Sin esta declaración el motor NO adivina: bloquea.
 */
export function investmentMappings(
    counterpartyCompanyId: string,
    parentCompanyId = PARENT
): ConsolidationAccountMapping[] {
    const base = {
        groupId: GROUP.id,
        companyId: parentCompanyId,
        source: 'MANUAL' as const,
        confidence: 'HIGH' as const,
        updatedAt: '2022-12-31T00:00:00.000Z',
        counterpartyCompanyId,
    }
    return [
        {
            ...base,
            id: `map-inv-${counterpartyCompanyId}`,
            accountId: 'inversiones-permanentes',
            consolidatedLineId: 'ANC_INVERSIONES',
            intragroupCategory: 'INVESTMENT_IN_SUBSIDIARY',
        },
        {
            ...base,
            id: `map-res-inv-${counterpartyCompanyId}`,
            accountId: 'resultado-inversiones',
            consolidatedLineId: 'ER_RESULTADO_INVERSIONES_PERMANENTES',
            intragroupCategory: 'EQUITY_METHOD_RESULT',
        },
    ]
}

export function makeInput(input: {
    entities: ConsolidationEntityInput[]
    mappings?: ConsolidationAccountMapping[]
    reciprocals?: ReciprocalBalance[]
    operations?: IntragroupOperation[]
}): ConsolidationEngineInput {
    return {
        consolidation: CONSOLIDATION,
        group: GROUP,
        entities: input.entities,
        mappings: input.mappings ?? investmentMappings(SUB),
        reciprocals: input.reciprocals ?? [],
        operations: input.operations ?? [],
        adjustments: [],
    }
}

export function makeOperation(input: Partial<IntragroupOperation> & {
    sellerCompanyId: string
    buyerCompanyId: string
    transferAmount: number
    groupCost: number
    realizedRatio: number
}): IntragroupOperation {
    return {
        id: input.id ?? 'op-1',
        consolidationId: CONSOLIDATION.id,
        type: input.type ?? 'GOODS',
        description: input.description ?? 'Operación intragrupo',
        createdAt: '2022-12-31T00:00:00.000Z',
        updatedAt: '2022-12-31T00:00:00.000Z',
        ...input,
    }
}

export function makeReciprocal(input: Partial<ReciprocalBalance> & {
    creditorCompanyId: string
    creditorAccountId: string
    creditorAmount: number
    debtorCompanyId: string
    debtorAccountId: string
    debtorAmount: number
}): ReciprocalBalance {
    return {
        id: input.id ?? 'rec-1',
        consolidationId: CONSOLIDATION.id,
        kind: input.kind ?? 'LOAN',
        currency: 'ARS',
        agreedAmount: input.agreedAmount ?? Math.min(input.creditorAmount, input.debtorAmount),
        status: input.status ?? 'RECONCILED',
        autoDetected: false,
        updatedAt: '2022-12-31T00:00:00.000Z',
        ...input,
    }
}

// ─────────────────────────────────────────────────────────────
// Lectores de la hoja
// ─────────────────────────────────────────────────────────────

/** Normaliza −0 a 0: el signo del cero no es información contable */
const noNegZero = (v: number) => (v === 0 ? 0 : v)

/** Importe consolidado de una línea, con su signo de EXPOSICIÓN (positivo) */
export function consolidated(ws: ConsolidationWorksheet, lineId: string): number {
    const row = ws.rows.find(r => r.lineId === lineId)
    if (!row) return 0
    return noNegZero(row.consolidated * row.naturalSign)
}

/** Importe de una entidad en una línea, con signo de exposición */
export function entityAmount(ws: ConsolidationWorksheet, lineId: string, companyId: string): number {
    const row = ws.rows.find(r => r.lineId === lineId)
    if (!row) return 0
    const entry = row.byEntity.find(e => e.companyId === companyId)
    return noNegZero((entry?.amount ?? 0) * row.naturalSign)
}

const SECTION_TOTAL = (ws: ConsolidationWorksheet, sections: string[]) =>
    noNegZero(ws.rows
        .filter(r => sections.includes(r.section))
        .reduce((s, r) => s + r.consolidated * r.naturalSign, 0))

export const totalAssets = (ws: ConsolidationWorksheet) =>
    SECTION_TOTAL(ws, ['ASSET_CURRENT', 'ASSET_NON_CURRENT'])

export const totalLiabilities = (ws: ConsolidationWorksheet) =>
    SECTION_TOTAL(ws, ['LIABILITY_CURRENT', 'LIABILITY_NON_CURRENT'])

/** Patrimonio neto SIN el resultado del ejercicio ni la PNC */
/** Patrimonio neto SIN el resultado del ejercicio y SIN la PNC */
export const equityBeforeResult = (ws: ConsolidationWorksheet) =>
    noNegZero(ws.rows
        .filter(r => r.section === 'EQUITY' && r.lineId !== 'PN_PARTICIPACION_NO_CONTROLADORA')
        .reduce((s, r) => s + r.consolidated * r.naturalSign, 0))

export const nonControllingInterest = (ws: ConsolidationWorksheet) =>
    consolidated(ws, 'PN_PARTICIPACION_NO_CONTROLADORA')

/**
 * Resultado TOTAL del grupo, antes de separar la parte de la PNC.
 * Excluye la línea "Resultado atribuible a la PNC", que es una reclasificación
 * dentro del propio estado y no un resultado adicional.
 */
export const totalGroupResult = (ws: ConsolidationWorksheet) =>
    noNegZero(ws.rows
        .filter(r => r.section === 'RESULT' && r.lineId !== 'ER_RESULTADO_PNC')
        .reduce((s, r) => s - r.consolidated, 0))

export const resultToNci = (ws: ConsolidationWorksheet) => {
    const row = ws.rows.find(r => r.lineId === 'ER_RESULTADO_PNC')
    return noNegZero(row ? row.consolidated : 0)
}

export const resultToOwners = (ws: ConsolidationWorksheet) =>
    noNegZero(totalGroupResult(ws) - resultToNci(ws))

/** Suma Debe−Haber de TODA la hoja consolidada: debe ser exactamente cero */
export const worksheetNet = (ws: ConsolidationWorksheet) =>
    Math.round(ws.rows.reduce((s, r) => s + r.consolidated * 100, 0))
