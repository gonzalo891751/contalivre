/**
 * Papel de trabajo del Estado de Flujo de Efectivo — Fase 2G §14.B.
 *
 * Exportación AUXILIAR (XLSX) que consume EXCLUSIVAMENTE
 * `bundle.preparation` (CashFlowPreparationModel). Es un documento interno de
 * preparación: NO integra por sí solo los estados contables formales. El
 * exportador FORMAL no consume la matriz; este SÍ. Separación de contratos.
 */

import { writeWorkbook, type WorkbookSheet } from './spreadsheet'
import type { ReportingBundle } from '../reporting/loadReportingBundle'

type Cell = string | number | null
const u = (cents: number) => cents / 100

const WARNING = 'Documento interno de preparación. No integra por sí solo los estados contables formales.'

export function buildWorkingPaperSheets(bundle: ReportingBundle): WorkbookSheet[] {
    const prep = bundle.preparation
    const c = prep.controls
    const sheets: WorkbookSheet[] = []

    // 1. Resumen y controles
    sheets.push({
        name: 'Resumen y controles', rows: [
            ['Papel de trabajo del Estado de Flujo de Efectivo'],
            [WARNING],
            [],
            ['Empresa', bundle.metadata.companyLegalName],
            ['Ejercicio', prep.identity.exerciseLabel],
            ['Fecha de cierre', prep.identity.closeDate],
            ['Expresión', prep.identity.expression],
            ['Motor', prep.identity.engineVersion],
            ['Política EFE (versión)', prep.identity.policyVersion],
            ['Hash de contenido', prep.identity.contentHash],
            ['Hash de mappings', prep.identity.mappingsHash],
            ['Generado', prep.identity.generatedAt],
            ['Estado', bundle.publicationGate.canPublish ? 'PUBLICABLE' : 'BLOQUEADO'],
            [],
            ['Puente del efectivo', 'Importe'],
            ['Efectivo al inicio', u(prep.cashBridge.openingPublishedCents)],
            ['Modificaciones ej. anteriores (AREA)', u(prep.cashBridge.priorAdjustmentsCents)],
            ['Efectivo al inicio modificado', u(prep.cashBridge.openingAdjustedCents)],
            ['Variación neta', u(prep.cashBridge.netChangeCents)],
            ['Efectivo al cierre', u(prep.cashBridge.closingCents)],
            [],
            ['Controles', 'Diferencia', 'Estado'],
            ['Control total', u(c.totalControlCents), c.totalControlCents === 0 ? 'OK' : 'REVISAR'],
            ['Filas con diferencia', c.rowsWithDifference, c.rowsWithDifference === 0 ? 'OK' : 'REVISAR'],
            ['Directo = Indirecto', u(c.methodControlCents), c.methodControlCents === 0 ? 'OK' : 'REVISAR'],
            ['Inicio + variación = cierre', u(c.cashControlCents), c.cashControlCents === 0 ? 'OK' : 'REVISAR'],
            ['EFE = ESP', u(c.espControlCents), c.espControlCents === 0 ? 'OK' : 'REVISAR'],
            [],
            ['Columnas por actividad', 'Técnico', 'Económico'],
            ...c.columns.map((col): Cell[] => [col.activity, u(col.technicalCents), u(col.economicCents)]),
        ],
    })

    // 2. Matriz
    const activities = prep.activities
    sheets.push({
        name: 'Matriz', rows: [
            ['Cuenta', 'Código', 'Saldo inicial', 'Saldo final', 'Variación', 'Origen/Aplic.', ...activities.map(a => a), 'Total imputado', 'Control'],
            ...prep.matrixRows.map((r): Cell[] => [
                r.name, r.code, u(r.openingCents), u(r.closingCents), u(r.economicVariationCents),
                r.originApplication,
                ...activities.map(a => (r.activity === a ? u(r.economicVariationCents) : null)),
                u(r.economicVariationCents), u(r.control),
            ]),
            ['Total explicado', '', '', '', '', '',
                ...activities.map(a => { const col = c.columns.find(cc => cc.activity === a); return col ? u(col.economicCents) : null }),
                u(prep.cashBridge.netChangeCents), 0],
        ],
    })

    // 3. Puentes devengado → percibido
    sheets.push({
        name: 'Puentes', rows: [
            ['Puente', 'Fórmula', 'Resultado', 'Esperado', 'Residual', 'Concilia'],
            ...prep.bridges.map((b): Cell[] => [b.label, b.formula, u(b.resultCents), u(b.expectedCents), u(b.residualCents), b.reconciled ? 'Sí' : 'No']),
        ],
    })

    // 4. Trazabilidad (imputaciones)
    sheets.push({
        name: 'Trazabilidad', rows: [
            ['Cuenta', 'Causa', 'Actividad', 'Método', 'Importe', 'Fórmula', 'Regla', 'Asientos'],
            ...prep.imputations.map((i): Cell[] => [
                i.accountId, i.causeLabel, i.activity, i.method, u(i.economicCents), i.formula, i.rule, i.entryIds.join(' '),
            ]),
        ],
    })

    // 5. Operaciones no monetarias
    const nonMon = bundle.statements.cashFlowDirect?.nonMonetaryDisclosures ?? []
    sheets.push({
        name: 'No monetarias', rows: [
            ['Operaciones de inversión y financiación que no afectaron el efectivo', 'Importe'],
            ...(nonMon.length > 0 ? nonMon.map((l): Cell[] => [l.label, l.amount]) : [['Sin operaciones no monetarias en el período', '']]),
        ],
    })

    // 6. Componentes del efectivo (política)
    sheets.push({
        name: 'Componentes efectivo', rows: [
            ['Cuenta de efectivo', 'Código', 'Saldo inicial', 'Saldo final'],
            ...prep.cashBridge.components.map((cc): Cell[] => [cc.name, cc.code, u(cc.openingCents), u(cc.closingCents)]),
        ],
    })

    return sheets
}

/** Genera y descarga el papel de trabajo del EFE como .xlsx. */
export async function exportWorkingPaper(bundle: ReportingBundle): Promise<void> {
    const sheets = buildWorkingPaperSheets(bundle)
    await writeWorkbook(sheets, `EFE_papel_de_trabajo_${bundle.metadata.exerciseLabel}`.replace(/\s+/g, '_'))
}
