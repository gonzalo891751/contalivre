/**
 * Casos de práctica para las empresas nuevas.
 *
 * Se cargan con los servicios normales (asientos contabilizados, cierre,
 * refundición y apertura reales), sobre el plan de cuentas base. El primer
 * ejercicio queda cerrado y el segundo abierto, para que el alumno pueda:
 * mirar los estados con comparativo, practicar el análisis y, si quiere,
 * hacer él mismo el cierre del segundo ejercicio.
 *
 * Los importes están pensados para que el análisis "cuente una historia":
 * - Comercial: 2024 rentable con palanca favorable; en 2025 compra un
 *   inmueble al contado, toma deuda cara y cobra más lento (palanca
 *   desfavorable, más ciclo de efectivo).
 * - Sin fines de lucro: un club que en 2024 cubre sus gastos con recursos y
 *   en 2025 depende más de un subsidio.
 */

import { db } from '../../storage/db'
import { postNewEntry } from '../application/journalService'
import { generateClosingDrafts, generateOpeningEntry, postClosing } from '../application/closingService'
import { exerciseIdFor, getDefaultCompany } from '../application/contextService'
import { saveInflationPolicy } from '../../reporting/closing/closingWorkPaperService'
import { ensureDefaultPolicy } from '../../reporting/policy/policyRepository'

export const PRACTICE_FIRST_YEAR = 2024
export const PRACTICE_SECOND_YEAR = 2025
export const PRACTICE_MODULE = 'caso-practica'
/** CUIT de fantasía: el cierre exige identificar a la entidad emisora */
export const PRACTICE_TAX_ID = '30-00000000-0'

type Row = [code: string, debit: number, credit: number]
type Spec = { date: string; memo: string; rows: Row[] }

const COMMERCIAL_2024: Spec[] = [
    { date: '2024-01-02', memo: 'Constitución: aporte de capital en efectivo', rows: [['1.1.01.02', 8000000, 0], ['3.1.01', 0, 8000000]] },
    { date: '2024-01-10', memo: 'Compra de rodado al contado', rows: [['1.2.01.04', 2400000, 0], ['1.1.01.02', 0, 2400000]] },
    { date: '2024-01-15', memo: 'Compra de muebles y útiles al contado', rows: [['1.2.01.03', 600000, 0], ['1.1.01.02', 0, 600000]] },
    { date: '2024-02-01', memo: 'Préstamo bancario a 3 años', rows: [['1.1.01.02', 2000000, 0], ['2.2.01.01', 0, 2000000]] },
    { date: '2024-03-01', memo: 'Compra de mercaderías a crédito', rows: [['1.1.04.01', 6000000, 0], ['1.1.03.01', 1260000, 0], ['2.1.01.01', 0, 7260000]] },
    { date: '2024-05-02', memo: 'Venta de mercaderías a crédito', rows: [['1.1.02.01', 12100000, 0], ['4.1.01', 0, 10000000], ['2.1.03.01', 0, 2100000]] },
    { date: '2024-05-02', memo: 'Costo de la venta', rows: [['4.3.01', 5000000, 0], ['1.1.04.01', 0, 5000000]] },
    { date: '2024-06-30', memo: 'Cobranza a clientes', rows: [['1.1.01.02', 10000000, 0], ['1.1.02.01', 0, 10000000]] },
    { date: '2024-07-31', memo: 'Pago a proveedores', rows: [['2.1.01.01', 6000000, 0], ['1.1.01.02', 0, 6000000]] },
    { date: '2024-12-20', memo: 'Sueldos del ejercicio', rows: [['4.5.01', 1200000, 0], ['1.1.01.02', 0, 1200000]] },
    { date: '2024-12-31', memo: 'Cargas sociales devengadas', rows: [['4.5.02', 324000, 0], ['2.1.02.02', 0, 324000]] },
    { date: '2024-12-20', memo: 'Alquiler del local', rows: [['4.5.03', 720000, 0], ['1.1.01.02', 0, 720000]] },
    { date: '2024-12-20', memo: 'Publicidad', rows: [['4.4.01', 400000, 0], ['1.1.01.02', 0, 400000]] },
    { date: '2024-12-31', memo: 'Ingresos brutos devengados', rows: [['4.4.05', 350000, 0], ['2.1.03.02', 0, 350000]] },
    { date: '2024-12-31', memo: 'Intereses del préstamo', rows: [['4.6.02', 360000, 0], ['1.1.01.02', 0, 360000]] },
    { date: '2024-12-31', memo: 'Depreciación de bienes de uso', rows: [['4.5.11', 540000, 0], ['1.2.01.94', 0, 480000], ['1.2.01.93', 0, 60000]] },
    { date: '2024-12-31', memo: 'Liquidación de IVA', rows: [['2.1.03.01', 2100000, 0], ['1.1.03.01', 0, 1260000], ['2.1.03.04', 0, 840000]] },
    { date: '2024-12-31', memo: 'Impuesto a las ganancias (35%)', rows: [['4.9.01', 387100, 0], ['2.1.03.02', 0, 387100]] },
]

const COMMERCIAL_2025: Spec[] = [
    { date: '2025-01-15', memo: 'Pago de cargas sociales, IVA e impuestos del ejercicio anterior', rows: [['2.1.02.02', 324000, 0], ['2.1.03.04', 840000, 0], ['2.1.03.02', 737100, 0], ['1.1.01.02', 0, 1901100]] },
    { date: '2025-02-15', memo: 'Préstamo bancario a 12 meses', rows: [['1.1.01.02', 3000000, 0], ['2.1.05.02', 0, 3000000]] },
    { date: '2025-02-20', memo: 'Compra de segundo rodado al contado', rows: [['1.2.01.04', 3000000, 0], ['1.1.01.02', 0, 3000000]] },
    { date: '2025-03-01', memo: 'Compra de inmueble para depósito al contado', rows: [['1.2.01.01', 6000000, 0], ['1.1.01.02', 0, 6000000]] },
    { date: '2025-03-10', memo: 'Compra de mercaderías a crédito', rows: [['1.1.04.01', 9000000, 0], ['1.1.03.01', 1890000, 0], ['2.1.01.01', 0, 10890000]] },
    // el cierre transfirió el resultado 2024 a Resultados no asignados
    { date: '2025-04-30', memo: 'Asamblea: reserva legal (5%) y dividendos en efectivo sobre el resultado 2024', rows: [['3.3.01', 335945, 0], ['3.2.01', 0, 35945], ['2.1.06.05', 0, 300000]] },
    { date: '2025-05-05', memo: 'Venta de mercaderías a crédito', rows: [['1.1.02.01', 18150000, 0], ['4.1.01', 0, 15000000], ['2.1.03.01', 0, 3150000]] },
    { date: '2025-05-05', memo: 'Costo de la venta', rows: [['4.3.01', 8250000, 0], ['1.1.04.01', 0, 8250000]] },
    { date: '2025-05-31', memo: 'Pago de dividendos', rows: [['2.1.06.05', 300000, 0], ['1.1.01.02', 0, 300000]] },
    { date: '2025-09-30', memo: 'Cobranza a clientes', rows: [['1.1.01.02', 16000000, 0], ['1.1.02.01', 0, 16000000]] },
    { date: '2025-10-31', memo: 'Pago a proveedores', rows: [['2.1.01.01', 10200000, 0], ['1.1.01.02', 0, 10200000]] },
    { date: '2025-12-20', memo: 'Sueldos del ejercicio', rows: [['4.5.01', 1800000, 0], ['1.1.01.02', 0, 1800000]] },
    { date: '2025-12-31', memo: 'Cargas sociales devengadas', rows: [['4.5.02', 486000, 0], ['2.1.02.02', 0, 486000]] },
    { date: '2025-12-20', memo: 'Alquiler del local', rows: [['4.5.03', 960000, 0], ['1.1.01.02', 0, 960000]] },
    { date: '2025-12-20', memo: 'Publicidad', rows: [['4.4.01', 700000, 0], ['1.1.01.02', 0, 700000]] },
    { date: '2025-12-31', memo: 'Ingresos brutos devengados', rows: [['4.4.05', 525000, 0], ['2.1.03.02', 0, 525000]] },
    { date: '2025-12-31', memo: 'Intereses de los préstamos', rows: [['4.6.02', 810000, 0], ['1.1.01.02', 0, 810000]] },
    { date: '2025-12-31', memo: 'Depreciación de bienes de uso', rows: [['4.5.11', 1260000, 0], ['1.2.01.94', 0, 1080000], ['1.2.01.93', 0, 60000], ['1.2.01.91', 0, 120000]] },
    { date: '2025-12-31', memo: 'Liquidación de IVA', rows: [['2.1.03.01', 3150000, 0], ['1.1.03.01', 0, 1890000], ['2.1.03.04', 0, 1260000]] },
    { date: '2025-12-31', memo: 'Impuesto a las ganancias (35%)', rows: [['4.9.01', 73150, 0], ['2.1.03.02', 0, 73150]] },
]

const NONPROFIT_2024: Spec[] = [
    { date: '2024-01-02', memo: 'Fondo social inicial aportado por los asociados fundadores', rows: [['1.1.01.02', 3000000, 0], ['3.1.01', 0, 3000000]] },
    { date: '2024-01-20', memo: 'Compra de equipamiento deportivo', rows: [['1.2.01.09', 900000, 0], ['1.1.01.02', 0, 900000]] },
    { date: '2024-01-25', memo: 'Compra de muebles para la sede', rows: [['1.2.01.03', 400000, 0], ['1.1.01.02', 0, 400000]] },
    { date: '2024-06-30', memo: 'Cuotas sociales del semestre devengadas', rows: [['1.1.03.04', 2400000, 0], ['4.1.01', 0, 2400000]] },
    { date: '2024-12-31', memo: 'Cuotas sociales del segundo semestre devengadas', rows: [['1.1.03.04', 2400000, 0], ['4.1.01', 0, 2400000]] },
    { date: '2024-12-31', memo: 'Cobranza de cuotas sociales', rows: [['1.1.01.02', 4300000, 0], ['1.1.03.04', 0, 4300000]] },
    { date: '2024-12-31', memo: 'Aranceles de escuelas deportivas cobrados', rows: [['1.1.01.02', 1800000, 0], ['4.1.02', 0, 1800000]] },
    { date: '2024-12-31', memo: 'Alquiler del salón para eventos', rows: [['1.1.01.02', 600000, 0], ['4.1.03', 0, 600000]] },
    { date: '2024-12-31', memo: 'Honorarios de profesores de deportes', rows: [['4.4.01', 2100000, 0], ['1.1.01.02', 0, 2100000]] },
    { date: '2024-12-31', memo: 'Talleres culturales', rows: [['4.4.02', 500000, 0], ['1.1.01.02', 0, 500000]] },
    { date: '2024-12-31', memo: 'Sueldo de administración', rows: [['4.5.01', 1500000, 0], ['1.1.01.02', 0, 1500000]] },
    { date: '2024-12-31', memo: 'Servicios de la sede (luz, gas, agua)', rows: [['4.5.05', 600000, 0], ['2.1.06.03', 0, 600000]] },
    { date: '2024-12-31', memo: 'Depreciación de bienes de uso', rows: [['4.5.11', 220000, 0], ['1.2.01.99', 0, 180000], ['1.2.01.93', 0, 40000]] },
]

const NONPROFIT_2025: Spec[] = [
    { date: '2025-01-20', memo: 'Pago de servicios del ejercicio anterior', rows: [['2.1.06.03', 600000, 0], ['1.1.01.02', 0, 600000]] },
    { date: '2025-06-30', memo: 'Cuotas sociales del semestre devengadas', rows: [['1.1.03.04', 2600000, 0], ['4.1.01', 0, 2600000]] },
    { date: '2025-08-15', memo: 'Subsidio municipal para el polideportivo', rows: [['1.1.01.02', 1500000, 0], ['4.1.04', 0, 1500000]] },
    { date: '2025-12-31', memo: 'Cuotas sociales del segundo semestre devengadas', rows: [['1.1.03.04', 2600000, 0], ['4.1.01', 0, 2600000]] },
    { date: '2025-12-31', memo: 'Cobranza de cuotas sociales', rows: [['1.1.01.02', 4400000, 0], ['1.1.03.04', 0, 4400000]] },
    { date: '2025-12-31', memo: 'Aranceles de escuelas deportivas cobrados', rows: [['1.1.01.02', 2000000, 0], ['4.1.02', 0, 2000000]] },
    { date: '2025-12-31', memo: 'Honorarios de profesores de deportes', rows: [['4.4.01', 3200000, 0], ['1.1.01.02', 0, 3200000]] },
    { date: '2025-12-31', memo: 'Talleres culturales', rows: [['4.4.02', 700000, 0], ['1.1.01.02', 0, 700000]] },
    { date: '2025-12-31', memo: 'Fiesta aniversario', rows: [['4.4.03', 450000, 0], ['1.1.01.02', 0, 450000]] },
    { date: '2025-12-31', memo: 'Sueldo de administración', rows: [['4.5.01', 2100000, 0], ['1.1.01.02', 0, 2100000]] },
    { date: '2025-12-31', memo: 'Servicios de la sede (luz, gas, agua)', rows: [['4.5.05', 900000, 0], ['2.1.06.03', 0, 900000]] },
    { date: '2025-12-31', memo: 'Depreciación de bienes de uso', rows: [['4.5.11', 220000, 0], ['1.2.01.99', 0, 180000], ['1.2.01.93', 0, 40000]] },
]

async function postSpecs(specs: Spec[], year: number): Promise<void> {
    const accounts = await db.accounts.toArray()
    const byCode = new Map(accounts.map(a => [a.code, a.id]))
    let i = 0
    for (const spec of specs) {
        const lines = spec.rows.map(([code, debit, credit]) => {
            const accountId = byCode.get(code)
            if (!accountId) throw new Error(`El plan de cuentas no tiene la cuenta ${code} que usa el caso de práctica.`)
            return { accountId, debit, credit }
        })
        await postNewEntry({
            date: spec.date, memo: spec.memo, lines,
            sourceModule: PRACTICE_MODULE, sourceId: `${PRACTICE_MODULE}-${year}-${i++}`,
            // el caso abre dos ejercicios a propósito: es una carga de escenario
            allowExerciseProvisioning: true,
        })
    }
}

/**
 * Carga el caso de práctica en la empresa abierta (que debe estar vacía).
 * Cierra el primer ejercicio y genera la apertura del segundo.
 */
export async function loadPracticeCase(kind: 'COMERCIAL' | 'SIN_FINES_DE_LUCRO'): Promise<void> {
    if (await db.entries.count() > 0) throw new Error('El caso de práctica sólo se carga en una empresa sin asientos.')
    // El cierre exige una entidad identificada (denominación propia y CUIT)
    let company = await getDefaultCompany()
    if (!company.taxId || company.legalName === 'Empresa ContaLivre') {
        company = {
            ...company,
            legalName: company.legalName === 'Empresa ContaLivre'
                ? (kind === 'SIN_FINES_DE_LUCRO' ? 'Asociación civil de práctica' : 'Empresa de práctica S.A.')
                : company.legalName,
            taxId: company.taxId || PRACTICE_TAX_ID,
            updatedAt: new Date().toISOString(),
        }
        await db.companies.put(company)
    }
    const nonProfit = kind === 'SIN_FINES_DE_LUCRO'
    await postSpecs(nonProfit ? NONPROFIT_2024 : COMMERCIAL_2024, PRACTICE_FIRST_YEAR)

    const firstExercise = exerciseIdFor(company.id, PRACTICE_FIRST_YEAR)
    await saveInflationPolicy(company.id, firstExercise, {
        applicability: 'NO_APLICABLE',
        rationale: 'Caso de práctica en moneda nominal: el objetivo es ejercitar el análisis de estados contables.',
        contextAssessment: 'Escenario didáctico sin índices de precios cargados.',
    })
    await generateClosingDrafts(firstExercise)
    await postClosing(firstExercise)
    await generateOpeningEntry(firstExercise)

    await postSpecs(nonProfit ? NONPROFIT_2025 : COMMERCIAL_2025, PRACTICE_SECOND_YEAR)
    await ensureDefaultPolicy(company.id)
}
