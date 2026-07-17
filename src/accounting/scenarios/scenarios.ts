/**
 * Escenarios educativos guiados — Fase 2C (§14).
 *
 * Cada escenario vive en un EJERCICIO de demostración propio (años 9001-9003)
 * claramente identificado, y es restablecible sin tocar los datos reales del
 * usuario. Los reportes de ContaLivre son por ejercicio, de modo que un
 * escenario nunca contamina un ejercicio real.
 *
 * Nota de alcance: el servicio de contabilización es mono-empresa por diseño
 * (Fase 2A), por lo que el aislamiento es a nivel EJERCICIO (no de empresa
 * separada). Cada asiento del escenario lleva metadata { scenario: id } y
 * pertenece a un año demo; el reset borra solo ese ejercicio.
 */

import { db } from '../../storage/db'
import { createDraftEntry, postDraft } from '../application/journalService'
import { resetJournalRangeForScenario } from './scenarioReset'
import { postClosing, generateOpeningEntry } from '../application/closingService'
import { exerciseIdForYear } from '../migration/migrateV17'

export interface ScenarioStep {
    order: number
    title: string
    /** consigna para el usuario */
    prompt: string
    /** explicación conceptual del hecho económico */
    explanation: string
    date: string
    memo: string
    lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>
    /** pista opcional */
    hint?: string
}

export interface ScenarioDef {
    id: string
    year: number
    title: string
    description: string
    /** cuentas mínimas requeridas (por code) para el escenario */
    requiredAccountCodes: string[]
    steps: ScenarioStep[]
    /** ejecuta cierre + apertura al final */
    closeAtEnd: boolean
}

export const SCENARIO_YEARS = { comercial: 9001, servicios: 9002, inflacion: 9003 } as const

/** Resuelve accountId por código dentro del plan actual */
async function accountIdByCode(code: string): Promise<string | null> {
    const acc = await db.accounts.where('code').equals(code).first()
    return acc?.id ?? null
}

/**
 * Instancia un escenario: resetea su ejercicio demo y contabiliza todos sus
 * pasos vía el servicio único (idempotente por reset previo). Devuelve el
 * año del ejercicio para que la UI lo seleccione.
 */
export async function runScenario(def: ScenarioDef): Promise<{ year: number; postedSteps: number; missingAccounts: string[] }> {
    // Verificar cuentas requeridas
    const missing: string[] = []
    const codeToId = new Map<string, string>()
    for (const code of def.requiredAccountCodes) {
        const id = await accountIdByCode(code)
        if (!id) missing.push(code)
        else codeToId.set(code, id)
    }
    if (missing.length > 0) return { year: def.year, postedSteps: 0, missingAccounts: missing }

    // Reset del ejercicio demo (borra solo asientos de escenario de ese año)
    await resetScenario(def)

    let posted = 0
    for (const step of def.steps) {
        const draft = await createDraftEntry({
            date: step.date,
            memo: step.memo,
            lines: step.lines,
            sourceModule: 'scenario',
            sourceType: def.id,
            sourceId: `${def.id}-step-${step.order}`,
            metadata: { scenario: def.id, scenarioStep: step.order, demo: true },
        })
        await postDraft(draft.id)
        posted++
    }

    if (def.closeAtEnd) {
        const exId = exerciseIdForYear(def.year)
        await postClosing(exId)
        await generateOpeningEntry(exId).catch(() => { /* opcional */ })
    }

    return { year: def.year, postedSteps: posted, missingAccounts: [] }
}

/** Restablece un escenario: borra los asientos de ese ejercicio demo */
export async function resetScenario(def: ScenarioDef): Promise<{ deleted: number }> {
    return resetJournalRangeForScenario(def.year, def.id)
}

// ─────────────────────────────────────────────────────────────
// Definiciones (usan códigos del plan seed estándar)
// ─────────────────────────────────────────────────────────────

const CODES = {
    caja: '1.1.01.01',
    banco: '1.1.01.02',
    deudores: '1.1.02.01',
    mercaderias: '1.1.04.01',
    rodados: '1.2.01.04',
    amortRodados: '1.2.01.94',
    proveedores: '2.1.01.01',
    prestamos: '2.1.05.02',
    sueldosPagar: '2.1.02.01',
    capital: '3.1.01',
    ventas: '4.1.01',
    cmv: '4.2.01',
    gastos: '4.3.01',
    interes: '4.4.01',
}

/** Construye las definiciones resolviendo los ids en runtime */
export async function getScenarioDefinitions(): Promise<ScenarioDef[]> {
    const id = async (code: string) => (await accountIdByCode(code)) ?? code
    const A = {} as Record<keyof typeof CODES, string>
    for (const k of Object.keys(CODES) as Array<keyof typeof CODES>) A[k] = await id(CODES[k])

    const comercial: ScenarioDef = {
        id: 'comercial',
        year: SCENARIO_YEARS.comercial,
        title: 'Empresa comercial',
        description: 'Compra-venta con capital, crédito, CMV, cobros/pagos, gasto, préstamo, bien de uso, depreciación y cierre.',
        requiredAccountCodes: [CODES.caja, CODES.deudores, CODES.mercaderias, CODES.proveedores, CODES.capital, CODES.ventas, CODES.cmv, CODES.gastos, CODES.prestamos, CODES.rodados, CODES.amortRodados],
        closeAtEnd: true,
        steps: [
            { order: 1, title: 'Aporte de capital', prompt: 'Los socios aportan $1.000.000 en efectivo. ¿Qué cuentas se mueven?', explanation: 'El aporte aumenta el activo (Caja) y el patrimonio (Capital).', date: '9001-01-05', memo: 'Aporte de capital', lines: [{ accountId: A.caja, debit: 1000000, credit: 0 }, { accountId: A.capital, debit: 0, credit: 1000000 }], hint: 'Caja al Debe, Capital al Haber.' },
            { order: 2, title: 'Compra al contado', prompt: 'Se compran mercaderías por $200.000 en efectivo.', explanation: 'Aumenta Bienes de cambio y disminuye Caja.', date: '9001-02-01', memo: 'Compra mercaderías contado', lines: [{ accountId: A.mercaderias, debit: 200000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 200000 }] },
            { order: 3, title: 'Compra a crédito', prompt: 'Se compran mercaderías por $100.000 a crédito.', explanation: 'Aumenta Bienes de cambio y el pasivo con Proveedores.', date: '9001-02-15', memo: 'Compra mercaderías crédito', lines: [{ accountId: A.mercaderias, debit: 100000, credit: 0 }, { accountId: A.proveedores, debit: 0, credit: 100000 }] },
            { order: 4, title: 'Venta a crédito', prompt: 'Se vende a crédito por $300.000.', explanation: 'Nace un crédito (Deudores) y un ingreso (Ventas).', date: '9001-03-10', memo: 'Venta a crédito', lines: [{ accountId: A.deudores, debit: 300000, credit: 0 }, { accountId: A.ventas, debit: 0, credit: 300000 }] },
            { order: 5, title: 'Costo de la venta', prompt: 'El costo de lo vendido es $180.000.', explanation: 'Se reconoce el CMV y sale del inventario.', date: '9001-03-10', memo: 'Costo de ventas', lines: [{ accountId: A.cmv, debit: 180000, credit: 0 }, { accountId: A.mercaderias, debit: 0, credit: 180000 }] },
            { order: 6, title: 'Cobro', prompt: 'Se cobran $150.000 de los deudores.', explanation: 'Aumenta Caja, disminuye el crédito.', date: '9001-04-01', memo: 'Cobro a clientes', lines: [{ accountId: A.caja, debit: 150000, credit: 0 }, { accountId: A.deudores, debit: 0, credit: 150000 }] },
            { order: 7, title: 'Pago a proveedores', prompt: 'Se pagan $60.000 a proveedores.', explanation: 'Disminuye el pasivo y la Caja.', date: '9001-04-15', memo: 'Pago a proveedores', lines: [{ accountId: A.proveedores, debit: 60000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 60000 }] },
            { order: 8, title: 'Gasto devengado', prompt: 'Se paga un gasto de $10.000 en efectivo.', explanation: 'Gasto del período contra Caja.', date: '9001-09-01', memo: 'Gasto pagado', lines: [{ accountId: A.gastos, debit: 10000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 10000 }] },
            { order: 9, title: 'Préstamo recibido', prompt: 'El banco otorga un préstamo de $300.000.', explanation: 'Aumenta Caja y el pasivo financiero.', date: '9001-08-01', memo: 'Préstamo bancario', lines: [{ accountId: A.caja, debit: 300000, credit: 0 }, { accountId: A.prestamos, debit: 0, credit: 300000 }] },
            { order: 10, title: 'Alta de bien de uso a crédito', prompt: 'Se compra un rodado por $120.000 a crédito.', explanation: 'Alta de PPE contra proveedores (transacción sin efectivo para el EFE).', date: '9001-07-01', memo: 'Compra rodado', lines: [{ accountId: A.rodados, debit: 120000, credit: 0 }, { accountId: A.proveedores, debit: 0, credit: 120000 }] },
            { order: 11, title: 'Depreciación', prompt: 'La depreciación del ejercicio es $12.000.', explanation: 'Gasto de depreciación contra la amortización acumulada (regularizadora).', date: '9001-12-31', memo: 'Depreciación', lines: [{ accountId: A.gastos, debit: 12000, credit: 0 }, { accountId: A.amortRodados, debit: 0, credit: 12000 }] },
        ],
    }

    const servicios: ScenarioDef = {
        id: 'servicios',
        year: SCENARIO_YEARS.servicios,
        title: 'Empresa de servicios',
        description: 'Ingresos devengados, cobros, gastos, bien de uso, préstamo, depreciación y estados.',
        requiredAccountCodes: [CODES.caja, CODES.deudores, CODES.capital, CODES.ventas, CODES.gastos, CODES.prestamos, CODES.rodados, CODES.amortRodados],
        closeAtEnd: true,
        steps: [
            { order: 1, title: 'Aporte inicial', prompt: 'Aporte de $300.000 en efectivo.', explanation: 'Activo (Caja) y patrimonio (Capital).', date: '9002-01-05', memo: 'Aporte', lines: [{ accountId: A.caja, debit: 300000, credit: 0 }, { accountId: A.capital, debit: 0, credit: 300000 }] },
            { order: 2, title: 'Servicio devengado a crédito', prompt: 'Se presta un servicio por $200.000 a cobrar.', explanation: 'Ingreso devengado y crédito, aunque no haya cobro.', date: '9002-03-01', memo: 'Servicio a crédito', lines: [{ accountId: A.deudores, debit: 200000, credit: 0 }, { accountId: A.ventas, debit: 0, credit: 200000 }] },
            { order: 3, title: 'Servicio cobrado', prompt: 'Se prestan y cobran servicios por $300.000.', explanation: 'Ingreso y Caja simultáneos.', date: '9002-04-01', memo: 'Servicio contado', lines: [{ accountId: A.caja, debit: 300000, credit: 0 }, { accountId: A.ventas, debit: 0, credit: 300000 }] },
            { order: 4, title: 'Gasto pagado', prompt: 'Gastos de $180.000 pagados en efectivo.', explanation: 'Gasto del período contra Caja.', date: '9002-05-01', memo: 'Gastos', lines: [{ accountId: A.gastos, debit: 180000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 180000 }] },
            { order: 5, title: 'Equipo al contado', prompt: 'Compra de equipo por $100.000.', explanation: 'Alta de PPE contra Caja (flujo de inversión).', date: '9002-06-01', memo: 'Compra equipo', lines: [{ accountId: A.rodados, debit: 100000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 100000 }] },
            { order: 6, title: 'Préstamo', prompt: 'Préstamo de $200.000.', explanation: 'Caja y pasivo financiero.', date: '9002-07-01', memo: 'Préstamo', lines: [{ accountId: A.caja, debit: 200000, credit: 0 }, { accountId: A.prestamos, debit: 0, credit: 200000 }] },
            { order: 7, title: 'Depreciación', prompt: 'Depreciación de $10.000.', explanation: 'Gasto contra amortización acumulada.', date: '9002-12-31', memo: 'Depreciación', lines: [{ accountId: A.gastos, debit: 10000, credit: 0 }, { accountId: A.amortRodados, debit: 0, credit: 10000 }] },
        ],
    }

    const inflacion: ScenarioDef = {
        id: 'inflacion',
        year: SCENARIO_YEARS.inflacion,
        title: 'Ajuste por inflación',
        description: 'Capital y bien de uso de enero, inventario de julio; base para índices 100/160/200 y RECPAM.',
        requiredAccountCodes: [CODES.caja, CODES.mercaderias, CODES.rodados, CODES.proveedores, CODES.capital, CODES.ventas, CODES.deudores],
        closeAtEnd: false,
        steps: [
            { order: 1, title: 'Aporte de capital (enero)', prompt: 'Aporte de $1.000.000 en enero.', explanation: 'El capital es no monetario: se reexpresará por el coeficiente enero→cierre.', date: '9003-01-10', memo: 'Aporte capital', lines: [{ accountId: A.caja, debit: 1000000, credit: 0 }, { accountId: A.capital, debit: 0, credit: 1000000 }] },
            { order: 2, title: 'Bien de uso (enero)', prompt: 'Compra de rodado por $600.000 al contado en enero.', explanation: 'PPE no monetario: coeficiente 2,00 (índice 200/100).', date: '9003-01-20', memo: 'Compra PPE', lines: [{ accountId: A.rodados, debit: 600000, credit: 0 }, { accountId: A.caja, debit: 0, credit: 600000 }] },
            { order: 3, title: 'Inventario (julio)', prompt: 'Compra de mercaderías por $200.000 a crédito en julio.', explanation: 'Inventario no monetario: coeficiente 1,25 (índice 200/160).', date: '9003-07-05', memo: 'Compra inventario', lines: [{ accountId: A.mercaderias, debit: 200000, credit: 0 }, { accountId: A.proveedores, debit: 0, credit: 200000 }] },
            { order: 4, title: 'Venta (julio)', prompt: 'Venta a crédito por $100.000 en julio.', explanation: 'El ingreso se reexpresa por su período; la posición monetaria genera RECPAM.', date: '9003-07-15', memo: 'Venta', lines: [{ accountId: A.deudores, debit: 100000, credit: 0 }, { accountId: A.ventas, debit: 0, credit: 100000 }] },
        ],
    }

    return [comercial, servicios, inflacion]
}
