/**
 * Fixtures sectoriales — Fase 2H (§5 agropecuario, §6 sin fines de lucro).
 *
 * Casos pequeños pero completos, usados por las pruebas para verificar que las
 * cuentas sectoriales llegan efectivamente a ESP, ER, EFE, notas y anexos.
 *
 * NO se cargan automáticamente en la base del usuario: se invocan de forma
 * explícita desde pruebas o desde una acción manual de QA.
 */

import { db } from '../../storage/db'
import { postOperation } from '../application/journalService'
import { activateSectorProfile } from '../../storage/sectorProfiles'
import type { Account } from '../../core/models'

const FIXTURE_MODULE = 'fixture-sector-2h'

interface FixtureEntry {
    date: string
    memo: string
    type: string
    lines: Array<{ accountId: string; debit: number; credit: number }>
}

/**
 * Cuentas del núcleo que los fixtures necesitan y que el plan de prueba mínimo
 * no trae. Se agregan por código, sin pisar nada existente.
 */
const SUPPORT_ACCOUNTS: Array<Pick<Account, 'code' | 'name' | 'kind' | 'section' | 'group' | 'statementGroup'>> = [
    { code: '1.1.01.01', name: 'Caja ARS', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS' },
    { code: '1.1.02.01', name: 'Deudores por ventas', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES' },
    { code: '1.2.01.01', name: 'Instalaciones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE' },
    { code: '2.1.01.01', name: 'Proveedores', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES' },
    { code: '3.1.01', name: 'Capital social', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL' },
    { code: '4.1.01', name: 'Ventas', kind: 'INCOME', section: 'OPERATING', group: 'Ventas', statementGroup: 'SALES' },
    { code: '4.3.01', name: 'Costo mercaderías vendidas', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS' },
]

async function ensureSupportAccounts(): Promise<Map<string, string>> {
    const byCode = new Map<string, string>()
    for (const support of SUPPORT_ACCOUNTS) {
        const existing = await db.accounts.where('code').equals(support.code).first()
        if (existing) {
            byCode.set(support.code, existing.id)
            continue
        }
        const id = `fx-${support.code}`
        await db.accounts.add({
            id,
            code: support.code,
            name: support.name,
            kind: support.kind,
            section: support.section,
            group: support.group,
            statementGroup: support.statementGroup,
            parentId: null,
            level: support.code.split('.').length - 1,
            normalSide: ['ASSET', 'EXPENSE'].includes(support.kind) ? 'DEBIT' : 'CREDIT',
            isContra: false,
            isHeader: false,
            active: true,
            isPostable: true,
        })
        byCode.set(support.code, id)
    }
    return byCode
}

/** Resuelve ids por código para todas las cuentas que usa un fixture. */
async function resolveIds(codes: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const code of codes) {
        const account = await db.accounts.where('code').equals(code).first()
        if (!account) throw new Error(`Fixture sectorial: falta la cuenta ${code}`)
        out[code] = account.id
    }
    return out
}

async function postAll(entries: FixtureEntry[], prefix: string): Promise<void> {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        await postOperation({
            date: entry.date,
            memo: entry.memo,
            lines: entry.lines,
            sourceModule: FIXTURE_MODULE,
            sourceType: entry.type,
            sourceId: `${prefix}-${i}`,
        })
    }
}

// ─────────────────────────────────────────────────────────────
// Establecimiento agropecuario
// ─────────────────────────────────────────────────────────────

export const AGRO_FIXTURE_YEAR = 2026

/**
 * Ciclo agropecuario mínimo pero completo:
 *  1. aporte inicial de los propietarios;
 *  2. compra de insumos;
 *  3. aplicación de insumos a la producción en proceso;
 *  4. obtención del producto agropecuario (cosecha);
 *  5. resultado por producción (crecimiento vegetativo, sin venta);
 *  6. venta del producto y su costo;
 *  7. mortandad reconocida como pérdida.
 */
export async function loadAgroFixture(): Promise<{ entries: number }> {
    await activateSectorProfile('AGRICULTURAL')
    await ensureSupportAccounts()

    const id = await resolveIds([
        '1.1.01.01', // Caja
        '1.1.02.01', // Deudores por ventas
        '2.1.01.01', // Proveedores
        '3.1.01', // Capital
        '1.1.08.02', // Insumos agropecuarios
        '1.1.08.03', // Producción en proceso
        '1.1.08.01', // Productos agropecuarios obtenidos
        '1.1.07.01', // Activos biológicos en crecimiento
        '4.1.06', // Ventas de productos agropecuarios
        '4.3.06', // Costo de productos agropecuarios vendidos
        '4.6.10', // Resultado por producción
        '4.7.10', // Pérdidas por mortandad y mermas
    ])

    const entries: FixtureEntry[] = [
        {
            date: `${AGRO_FIXTURE_YEAR}-01-02`,
            memo: 'Aporte inicial de los propietarios',
            type: 'aporte',
            lines: [
                { accountId: id['1.1.01.01'], debit: 2000000, credit: 0 },
                { accountId: id['3.1.01'], debit: 0, credit: 2000000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-03-05`,
            memo: 'Compra de semillas y agroquímicos a crédito',
            type: 'compra-insumos',
            lines: [
                { accountId: id['1.1.08.02'], debit: 600000, credit: 0 },
                { accountId: id['2.1.01.01'], debit: 0, credit: 600000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-04-10`,
            memo: 'Aplicación de insumos a la sementera',
            type: 'aplicacion-insumos',
            lines: [
                { accountId: id['1.1.08.03'], debit: 600000, credit: 0 },
                { accountId: id['1.1.08.02'], debit: 0, credit: 600000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-06-30`,
            memo: 'Resultado por producción: crecimiento del activo biológico',
            type: 'resultado-produccion',
            lines: [
                { accountId: id['1.1.07.01'], debit: 250000, credit: 0 },
                { accountId: id['4.6.10'], debit: 0, credit: 250000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-11-20`,
            memo: 'Cosecha: obtención del producto agropecuario',
            type: 'cosecha',
            lines: [
                { accountId: id['1.1.08.01'], debit: 850000, credit: 0 },
                { accountId: id['1.1.08.03'], debit: 0, credit: 600000 },
                { accountId: id['1.1.07.01'], debit: 0, credit: 250000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-12-05`,
            memo: 'Venta de granos a crédito',
            type: 'venta',
            lines: [
                { accountId: id['1.1.02.01'], debit: 1100000, credit: 0 },
                { accountId: id['4.1.06'], debit: 0, credit: 1100000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-12-05`,
            memo: 'Costo de los productos agropecuarios vendidos',
            type: 'costo-venta',
            lines: [
                { accountId: id['4.3.06'], debit: 800000, credit: 0 },
                { accountId: id['1.1.08.01'], debit: 0, credit: 800000 },
            ],
        },
        {
            date: `${AGRO_FIXTURE_YEAR}-12-20`,
            memo: 'Merma de existencias reconocida como pérdida',
            type: 'merma',
            lines: [
                { accountId: id['4.7.10'], debit: 50000, credit: 0 },
                { accountId: id['1.1.08.01'], debit: 0, credit: 50000 },
            ],
        },
    ]

    await postAll(entries, 'agro')
    return { entries: entries.length }
}

// ─────────────────────────────────────────────────────────────
// Empresa industrial
// ─────────────────────────────────────────────────────────────

export const INDUSTRIAL_FIXTURE_YEAR = 2026

/**
 * Ciclo industrial mínimo para el anexo de costo de producción (§H6):
 * compra de materia prima, consumo, mano de obra directa, costos indirectos,
 * depreciación productiva, terminación de productos y venta con su costo.
 */
export async function loadIndustrialFixture(): Promise<{ entries: number }> {
    await activateSectorProfile('INDUSTRIAL')
    await ensureSupportAccounts()

    const id = await resolveIds([
        '1.1.01.01', // Caja
        '2.1.01.01', // Proveedores
        '3.1.01', // Capital
        '1.1.10.01', // Materias primas
        '1.1.10.02', // Productos en proceso
        '1.1.10.03', // Productos terminados
        '4.3.07.01', // Mano de obra directa
        '4.3.07.02', // Materiales e insumos directos
        '4.3.07.03', // Costos indirectos de producción
        '4.3.07.04', // Depreciaciones afectadas a producción
        '4.3.01', // Costo de mercaderías vendidas
        '4.1.01', // Ventas
    ])

    const entries: FixtureEntry[] = [
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-01-02`,
            memo: 'Aporte inicial',
            type: 'aporte',
            lines: [
                { accountId: id['1.1.01.01'], debit: 1000000, credit: 0 },
                { accountId: id['3.1.01'], debit: 0, credit: 1000000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-02-10`,
            memo: 'Compra de materias primas',
            type: 'compra-mp',
            lines: [
                { accountId: id['1.1.10.01'], debit: 400000, credit: 0 },
                { accountId: id['2.1.01.01'], debit: 0, credit: 400000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-03-31`,
            memo: 'Consumo de materias primas en producción',
            type: 'consumo-mp',
            lines: [
                { accountId: id['4.3.07.02'], debit: 300000, credit: 0 },
                { accountId: id['1.1.10.01'], debit: 0, credit: 300000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-03-31`,
            memo: 'Mano de obra directa del período',
            type: 'mod',
            lines: [
                { accountId: id['4.3.07.01'], debit: 200000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 200000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-03-31`,
            memo: 'Costos indirectos de producción',
            type: 'cip',
            lines: [
                { accountId: id['4.3.07.03'], debit: 80000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 80000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-12-31`,
            memo: 'Depreciación de maquinaria fabril',
            type: 'depreciacion-productiva',
            lines: [
                { accountId: id['4.3.07.04'], debit: 20000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 20000 },
            ],
        },
        {
            // Los costos acumulados se capitalizan a producción en proceso: por
            // eso las cuentas de costo quedan saldadas y el ER no duplica el CMV.
            date: `${INDUSTRIAL_FIXTURE_YEAR}-12-31`,
            memo: 'Capitalización de los costos a producción en proceso',
            type: 'capitalizacion',
            lines: [
                { accountId: id['1.1.10.02'], debit: 600000, credit: 0 },
                { accountId: id['4.3.07.02'], debit: 0, credit: 300000 },
                { accountId: id['4.3.07.01'], debit: 0, credit: 200000 },
                { accountId: id['4.3.07.03'], debit: 0, credit: 80000 },
                { accountId: id['4.3.07.04'], debit: 0, credit: 20000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-12-31`,
            memo: 'Productos terminados en el período',
            type: 'terminacion',
            lines: [
                { accountId: id['1.1.10.03'], debit: 600000, credit: 0 },
                { accountId: id['1.1.10.02'], debit: 0, credit: 600000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-12-10`,
            memo: 'Venta de productos terminados',
            type: 'venta',
            lines: [
                { accountId: id['1.1.01.01'], debit: 900000, credit: 0 },
                { accountId: id['4.1.01'], debit: 0, credit: 900000 },
            ],
        },
        {
            date: `${INDUSTRIAL_FIXTURE_YEAR}-12-10`,
            memo: 'Costo de los productos vendidos',
            type: 'costo-venta',
            lines: [
                { accountId: id['4.3.01'], debit: 600000, credit: 0 },
                { accountId: id['1.1.10.03'], debit: 0, credit: 600000 },
            ],
        },
    ]

    await postAll(entries, 'industrial')
    return { entries: entries.length }
}

// ─────────────────────────────────────────────────────────────
// Asociación civil / club
// ─────────────────────────────────────────────────────────────

export const NONPROFIT_FIXTURE_YEAR = 2026

/**
 * Ciclo de una asociación civil, tal como pide §6:
 *  1. cuotas de asociados devengadas y cobradas;
 *  2. donación para fines generales;
 *  3. subsidio con destino específico (pasivo hasta cumplir la afectación);
 *  4. aplicación del subsidio y devengamiento del recurso afectado;
 *  5. gasto administrativo;
 *  6. gasto de actividad deportiva;
 *  7. adquisición de un bien de uso.
 */
export async function loadNonprofitFixture(): Promise<{ entries: number }> {
    await activateSectorProfile('NONPROFIT')
    await ensureSupportAccounts()

    const id = await resolveIds([
        '1.1.01.01', // Caja
        '1.2.01.01', // Instalaciones (bien de uso)
        '1.1.09.01', // Cuotas sociales a cobrar
        '2.1.08.01', // Subsidios con cargo de rendición
        '4.1.10.01', // Cuotas de asociados
        '4.1.10.02', // Donaciones para fines generales
        '4.1.10.03', // Recursos con destino específico devengados
        '4.4.10.01', // Gastos de actividades deportivas
        '4.5.20.01', // Gastos de conducción institucional
    ])

    const entries: FixtureEntry[] = [
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-01-31`,
            memo: 'Devengamiento de cuotas sociales del ejercicio',
            type: 'cuotas-devengadas',
            lines: [
                { accountId: id['1.1.09.01'], debit: 900000, credit: 0 },
                { accountId: id['4.1.10.01'], debit: 0, credit: 900000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-02-15`,
            memo: 'Cobro de cuotas sociales',
            type: 'cuotas-cobradas',
            lines: [
                { accountId: id['1.1.01.01'], debit: 800000, credit: 0 },
                { accountId: id['1.1.09.01'], debit: 0, credit: 800000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-03-10`,
            memo: 'Donación recibida para fines generales',
            type: 'donacion',
            lines: [
                { accountId: id['1.1.01.01'], debit: 300000, credit: 0 },
                { accountId: id['4.1.10.02'], debit: 0, credit: 300000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-04-01`,
            memo: 'Subsidio recibido con cargo de rendición (aún no aplicado)',
            type: 'subsidio-recibido',
            lines: [
                { accountId: id['1.1.01.01'], debit: 500000, credit: 0 },
                { accountId: id['2.1.08.01'], debit: 0, credit: 500000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-09-30`,
            memo: 'Aplicación del subsidio: se devenga el recurso afectado',
            type: 'subsidio-aplicado',
            lines: [
                { accountId: id['2.1.08.01'], debit: 400000, credit: 0 },
                { accountId: id['4.1.10.03'], debit: 0, credit: 400000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-06-30`,
            memo: 'Gastos de conducción institucional',
            type: 'gasto-administrativo',
            lines: [
                { accountId: id['4.5.20.01'], debit: 250000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 250000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-07-15`,
            memo: 'Gastos de la actividad deportiva',
            type: 'gasto-actividad',
            lines: [
                { accountId: id['4.4.10.01'], debit: 600000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 600000 },
            ],
        },
        {
            date: `${NONPROFIT_FIXTURE_YEAR}-08-20`,
            memo: 'Adquisición de instalaciones deportivas',
            type: 'alta-bien-uso',
            lines: [
                { accountId: id['1.2.01.01'], debit: 700000, credit: 0 },
                { accountId: id['1.1.01.01'], debit: 0, credit: 700000 },
            ],
        },
    ]

    await postAll(entries, 'ong')
    return { entries: entries.length }
}
