/**
 * Caso demostrativo Purmamarca — Fase 2G.1 §6.
 *
 * Seed REPRODUCIBLE para QA manual del Estado de Flujo de Efectivo. Usa los
 * servicios normales del sistema (puerta única `postOperation`); NO hardcodea
 * reglas del motor. Etiquetado `sourceModule='purmamarca-demo'`, idempotente por
 * `sourceId`, con guardia de base limpia y reset ACOTADO a este caso.
 *
 * Restricción arquitectónica documentada (§6): ContaLivre opera con UNA empresa
 * (DEFAULT_COMPANY_ID) y el pipeline de reporting no conmuta de compañía. La
 * "empresa separada" que pide la especificación no es representable sin un
 * refactor de multiempresa. Se resuelve, sin improvisar, con el mismo mecanismo
 * de aislamiento probado del fixture RC: guardia de base limpia + scoping por
 * `sourceModule` + reset acotado. Así no se contaminan datos reales y el caso se
 * carga/borra de forma segura. La razón social del caso se fija en la empresa por
 * defecto sólo cuando la base está vacía.
 *
 * Importes esperados (§6): efectivo inicial 10.000 · cierre 49.000 · variación
 * 39.000 · operación 4.000 · inversión 30.000 · financiación 5.000 ·
 * cobros 32.000 · pagos 28.000 · controles 0.
 */

import { db } from '../../storage/db'
import { postOperation } from '../application/journalService'
import { getDefaultCompany } from '../application/contextService'
import { resetApplication } from '../maintenance/resetService'
import { ensureDefaultPolicy } from '../../reporting/policy/policyRepository'
import type { Account } from '../../core/models'

export const PURMAMARCA_MODULE = 'purmamarca-demo'
export const PURMAMARCA_PREFIX = 'pur-'
export const PURMAMARCA_YEAR = 2022
export const PURMAMARCA_COMPANY_NAME = 'Purmamarca S.A. — Caso demostrativo'

function acc(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: partial.group ?? 'Purmamarca (demo)',
        statementGroup: null,
        parentId: null,
        level: 1,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: true,
        ...partial,
    }
}

/** Plan de cuentas del caso (mappings estructurales completos = §6 "cargar mappings"). */
export const PURMAMARCA_ACCOUNTS: Account[] = [
    acc({ id: 'pur-caja', code: 'PUR.1.01', name: 'Caja y bancos', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', group: 'Caja y Bancos' }),
    acc({ id: 'pur-creditos', code: 'PUR.1.02', name: 'Créditos por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', group: 'Créditos por ventas' }),
    acc({ id: 'pur-mercaderias', code: 'PUR.1.03', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES', group: 'Bienes de cambio' }),
    acc({ id: 'pur-bienes-uso', code: 'PUR.1.04', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', group: 'Bienes de uso' }),
    acc({ id: 'pur-proveedores', code: 'PUR.2.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', group: 'Deudas comerciales' }),
    acc({ id: 'pur-capital', code: 'PUR.3.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', group: 'Capital', equityComponent: 'CAPITAL' }),
    acc({ id: 'pur-aportes', code: 'PUR.3.02', name: 'Aportes irrevocables', kind: 'EQUITY', statementGroup: 'CAPITAL', group: 'Aportes irrevocables', equityComponent: 'CAPITAL' }),
    acc({ id: 'pur-ventas', code: 'PUR.4.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', group: 'Ventas' }),
    acc({ id: 'pur-cmv', code: 'PUR.5.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS', group: 'Costo de ventas' }),
]

interface FxLine { accountId: string; debit: number; credit: number }
interface FxEntry { date: string; memo: string; type: string; lines: FxLine[] }
const d = (accountId: string, amount: number): FxLine => ({ accountId, debit: amount, credit: 0 })
const h = (accountId: string, amount: number): FxLine => ({ accountId, credit: amount, debit: 0 })

/**
 * Asiento de constitución (2021): establece el saldo de apertura de 2022 vía
 * movimientos previos (getOpeningBalances suma los asientos anteriores al
 * período). Caja 10.000 + Bienes de uso 30.000 al Debe; Capital 40.000 al Haber.
 */
export const PURMAMARCA_OPENING_ENTRY: FxEntry = {
    date: `${PURMAMARCA_YEAR - 1}-12-31`, memo: 'Constitución: aportes de los socios (apertura del caso)', type: 'constitucion',
    lines: [d('pur-caja', 10000), d('pur-bienes-uso', 30000), h('pur-capital', 40000)],
}

/** Asientos del ejercicio 2022 (idénticos al caso Purmamarca EFE). */
export const PURMAMARCA_ENTRIES: FxEntry[] = [
    { date: `${PURMAMARCA_YEAR}-02-10`, memo: 'Venta de mercaderías a crédito', type: 'venta', lines: [d('pur-creditos', 35000), h('pur-ventas', 35000)] },
    { date: `${PURMAMARCA_YEAR}-03-10`, memo: 'Cobro parcial de clientes', type: 'cobro', lines: [d('pur-caja', 32000), h('pur-creditos', 32000)] },
    { date: `${PURMAMARCA_YEAR}-04-10`, memo: 'Compra de mercaderías a crédito', type: 'compra', lines: [d('pur-mercaderias', 30000), h('pur-proveedores', 30000)] },
    { date: `${PURMAMARCA_YEAR}-05-10`, memo: 'Pago parcial a proveedores', type: 'pago', lines: [d('pur-proveedores', 28000), h('pur-caja', 28000)] },
    { date: `${PURMAMARCA_YEAR}-06-30`, memo: 'Costo de mercaderías vendidas', type: 'cmv', lines: [d('pur-cmv', 20000), h('pur-mercaderias', 20000)] },
    { date: `${PURMAMARCA_YEAR}-09-10`, memo: 'Venta de bienes de uso a valor contable', type: 'venta-bu', lines: [d('pur-caja', 30000), h('pur-bienes-uso', 30000)] },
    { date: `${PURMAMARCA_YEAR}-11-10`, memo: 'Aporte irrevocable de los socios', type: 'aporte', lines: [d('pur-caja', 5000), h('pur-aportes', 5000)] },
]

/** Importes esperados (en $), §6. */
export const PURMAMARCA_EXPECTED = {
    openingCash: 10000, closingCash: 49000, netChange: 39000,
    operating: 4000, investing: 30000, financing: 5000,
    cobros: 32000, pagos: 28000,
} as const

/** Asientos "extraños" (no del caso ni cierres) presentes en la base. */
async function foreignEntries() {
    const entries = await db.entries.toArray()
    return entries.filter(e =>
        e.status !== 'DRAFT'
        && e.sourceModule !== PURMAMARCA_MODULE
        && e.sourceModule !== 'closing')
}

/** ¿La base contiene SOLO datos del caso (o está vacía)? */
export async function isSafeToLoadPurmamarca(): Promise<{ safe: boolean; reason?: string }> {
    const foreign = await foreignEntries()
    if (foreign.length > 0) {
        return { safe: false, reason: `La base tiene ${foreign.length} asiento(s) ajenos al caso; cargá Purmamarca sobre una base limpia (reseteo total primero).` }
    }
    return { safe: true }
}

export async function isPurmamarcaLoaded(): Promise<boolean> {
    const entries = await db.entries.toArray()
    return entries.some(e => e.sourceModule === PURMAMARCA_MODULE)
}

export interface PurmamarcaLoadResult {
    accounts: number
    entries: number
    idempotent: boolean
    companyRenamed: boolean
}

/**
 * Carga el caso Purmamarca. Idempotente (sourceIds fijos). Sólo sobre base
 * limpia. Marca la razón social del caso demostrativo cuando la base está vacía.
 */
export async function loadPurmamarcaDemo(): Promise<PurmamarcaLoadResult> {
    const guard = await isSafeToLoadPurmamarca()
    if (!guard.safe) throw new Error(guard.reason)

    await db.accounts.bulkPut(PURMAMARCA_ACCOUNTS)

    // Razón social del caso (sólo si la empresa aún no tiene asientos reales).
    let companyRenamed = false
    const company = await getDefaultCompany()
    const hadRealEntries = (await foreignEntries()).length > 0
    if (!hadRealEntries && company.legalName !== PURMAMARCA_COMPANY_NAME) {
        await db.companies.put({ ...company, legalName: PURMAMARCA_COMPANY_NAME })
        companyRenamed = true
    }

    let idempotent = true
    const post = async (e: FxEntry, sourceId: string) => {
        const res = await postOperation({
            date: e.date, memo: e.memo, lines: e.lines,
            sourceModule: PURMAMARCA_MODULE, sourceType: e.type, sourceId,
            // El caso abre dos ejercicios a propósito (apertura 2021 y el 2022):
            // es una carga de escenario, no una fecha mal tipeada.
            allowExerciseProvisioning: true,
        })
        if (!res.idempotentHit) idempotent = false
    }

    await post(PURMAMARCA_OPENING_ENTRY, 'pur-opening')
    for (let i = 0; i < PURMAMARCA_ENTRIES.length; i++) await post(PURMAMARCA_ENTRIES[i], `pur-${PURMAMARCA_YEAR}-${i}`)

    // Política EFE por defecto de la empresa (§6 "cargar política").
    await ensureDefaultPolicy(company.id)

    return { accounts: PURMAMARCA_ACCOUNTS.length, entries: PURMAMARCA_ENTRIES.length + 1, idempotent, companyRenamed }
}

/**
 * Reset ACOTADO al caso (§6 "resetear únicamente ese caso / no borrar otras
 * empresas"). ContaLivre no permite el borrado físico selectivo de asientos
 * POSTED (invariante ACC-001: sólo el servicio único reversa/anula). Por eso el
 * reset del caso PROCEDE únicamente cuando la base contiene EXCLUSIVAMENTE el
 * caso Purmamarca (que es la condición garantizada por la guardia de carga): en
 * ese escenario usa el reseteo total sancionado (`resetApplication`). Si hubiera
 * asientos ajenos, se NIEGA para no borrar datos de otros: el usuario debe usar
 * el reseteo total explícito con plena conciencia.
 */
export async function resetPurmamarcaDemo(): Promise<{ removed: number }> {
    const foreign = await foreignEntries()
    if (foreign.length > 0) {
        throw new Error(`Hay ${foreign.length} asiento(s) ajeno(s) al caso: el reset acotado se niega para no borrar otros datos. Usá el reseteo total explícito si realmente querés vaciar la base.`)
    }
    const entries = await db.entries.toArray()
    const removed = entries.filter(e => e.sourceModule === PURMAMARCA_MODULE).length
    await resetApplication('purmamarca-demo')
    return { removed }
}
