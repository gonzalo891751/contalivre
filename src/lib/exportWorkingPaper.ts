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
import type { CashFlowPreparationModel } from '../reporting/preparation/cashFlowPreparation'

type Cell = string | number | null
const u = (cents: number) => cents / 100

const WARNING = 'Documento interno de preparación. No integra por sí solo los estados contables formales.'

/** Expresión del papel de trabajo (§3.E): nominal, moneda de cierre o ambas. */
export type WorkingPaperExpression = 'NOMINAL' | 'CLOSING_CURRENCY' | 'BOTH'

/** Sheets propias de UN modelo de preparación (nominal o reexpresado). */
function modelSheets(prep: CashFlowPreparationModel, bundle: ReportingBundle, prefix: string): WorkbookSheet[] {
    const c = prep.controls
    const restated = prep.identity.expression === 'CLOSING_CURRENCY'
    const sheets: WorkbookSheet[] = []

    sheets.push({
        name: `${prefix}Resumen y controles`, rows: [
            ['Papel de trabajo del Estado de Flujo de Efectivo'],
            [WARNING],
            [],
            ['Empresa', bundle.metadata.companyLegalName],
            ['Ejercicio', prep.identity.exerciseLabel],
            ['Fecha de cierre', prep.identity.closeDate],
            ['Expresión', prep.identity.expression],
            ['Set de índices', prep.identity.indexSetId ?? '—'],
            ['Hash del set', prep.identity.indexSetHash ?? '—'],
            ['Cobertura', prep.identity.coverage],
            ['Motor', prep.identity.engineVersion],
            ['Algoritmo de preparación', prep.identity.algorithmVersion],
            ['Política EFE (versión)', prep.identity.policyVersion],
            ['Hash de contenido', prep.identity.contentHash],
            ['Hash de mappings', prep.identity.mappingsHash],
            ['Generado', prep.identity.generatedAt],
            ['Estado', prep.identity.blockers.length === 0 && bundle.publicationGate.canPublish ? 'PUBLICABLE' : 'BLOQUEADO'],
            ...(prep.identity.blockers.length > 0 ? [[], ['Blockers'], ...prep.identity.blockers.map((b): Cell[] => [b])] : []),
            [],
            ['Puente del efectivo', 'Importe'],
            ['Efectivo al inicio (publicado)', u(prep.cashBridge.openingPublishedCents)],
            ...(restated ? [['Efectivo al inicio reexpresado', u(prep.cashBridge.openingRestatedCents ?? 0)] as Cell[]] : []),
            ['Modificaciones ej. anteriores (AREA)', u(prep.cashBridge.priorAdjustmentsCents)],
            ['Efectivo al inicio modificado', u(restated ? (prep.cashBridge.openingAdjustedRestatedCents ?? 0) : prep.cashBridge.openingAdjustedCents)],
            ...(restated ? [['Σ flujos reexpresados', u(prep.cashBridge.flowsRestatedCents ?? 0)] as Cell[], ['REI del efectivo', u(prep.cashBridge.reiCents ?? 0)] as Cell[]] : []),
            ['Variación neta', u(prep.cashBridge.netChangeCents)],
            ['Efectivo al cierre', u(prep.cashBridge.closingCents)],
            [],
            ['Controles', 'Diferencia', 'Estado'],
            ['Control total', u(c.totalControlCents), c.totalControlCents === 0 ? 'OK' : 'REVISAR'],
            ['Filas con diferencia', c.rowsWithDifference, c.rowsWithDifference === 0 ? 'OK' : 'REVISAR'],
            ['Directo = Indirecto', u(c.methodControlCents), c.methodControlCents === 0 ? 'OK' : 'REVISAR'],
            ['Inicio + variación = cierre', u(c.cashControlCents), c.cashControlCents === 0 ? 'OK' : 'REVISAR'],
            ['EFE = ESP', u(c.espControlCents), c.espControlCents === 0 ? 'OK' : 'REVISAR'],
            ['Todos conciliados', '', c.allReconciled ? 'OK' : 'REVISAR'],
            [],
            ['Columnas por actividad', 'Técnico', 'Económico'],
            ...c.columns.map((col): Cell[] => [col.activity, u(col.technicalCents), u(col.economicCents)]),
        ],
    })

    const activities = prep.activities
    sheets.push({
        name: `${prefix}Matriz`, rows: [
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

    sheets.push({
        name: `${prefix}Puentes`, rows: [
            ['Puente', 'Fórmula', 'Resultado', 'Esperado', 'Residual', 'Concilia'],
            ...prep.bridges.map((b): Cell[] => [b.label, b.formula, u(b.resultCents), u(b.expectedCents), u(b.residualCents), b.reconciled ? 'Sí' : 'No']),
        ],
    })

    sheets.push({
        name: `${prefix}Trazabilidad`, rows: [
            ['Cuenta', 'Causa', 'Actividad', 'Método', 'Importe', 'Fórmula', 'Regla', 'Asientos'],
            ...prep.imputations.map((i): Cell[] => [
                i.accountId, i.causeLabel, i.activity, i.method, u(i.economicCents), i.formula, i.rule, i.entryIds.join(' '),
            ]),
        ],
    })

    // Hoja "Reexpresión" — evidencia por contribución (§3.E). La suma reconcilia
    // con la exposición formal reexpresada.
    if (restated && prep.contributions) {
        let sumRestated = 0
        const rows: Cell[][] = prep.contributions.map((cn): Cell[] => {
            sumRestated += cn.restatedCents
            return [
                cn.originDate, cn.entryId, cn.code, `${cn.causeLabel} (${cn.activity})`,
                u(cn.amountNominalCents), cn.originIndex ?? '—', cn.closeIndex ?? '—',
                cn.coefficient ?? 'SIN ÍNDICE', u(cn.restatedRawCents), u(cn.restatedCents), u(cn.roundingDiffCents),
            ]
        })
        sheets.push({
            name: `${prefix}Reexpresión`, rows: [
                ['Fecha', 'Asiento', 'Cuenta', 'Concepto', 'Importe nominal', 'Índice origen', 'Índice cierre', 'Coeficiente', 'Reexpresado (sin redondear)', 'Reexpresado', 'Dif. redondeo'],
                ...rows,
                [],
                ['Total reexpresado (Debe−Haber no efectivo)', '', '', '', '', '', '', '', '', u(sumRestated), ''],
            ],
        })
    }

    return sheets
}

export function buildWorkingPaperSheets(bundle: ReportingBundle, expression: WorkingPaperExpression = 'NOMINAL'): WorkbookSheet[] {
    const nominal = bundle.preparation
    const restated = bundle.preparationRestated
    const wantNominal = expression === 'NOMINAL' || expression === 'BOTH'
    const wantRestated = (expression === 'CLOSING_CURRENCY' || expression === 'BOTH') && restated != null
    const both = wantNominal && wantRestated

    const sheets: WorkbookSheet[] = []
    if (wantNominal) sheets.push(...modelSheets(nominal, bundle, both ? 'N·' : ''))
    if (wantRestated) sheets.push(...modelSheets(restated!, bundle, both ? 'MC·' : ''))

    // Sheets compartidas (una sola vez)
    const nonMon = bundle.statements.cashFlowDirect?.nonMonetaryDisclosures ?? []
    sheets.push({
        name: 'No monetarias', rows: [
            ['Operaciones de inversión y financiación que no afectaron el efectivo', 'Importe'],
            ...(nonMon.length > 0 ? nonMon.map((l): Cell[] => [l.label, l.amount]) : [['Sin operaciones no monetarias en el período', '']]),
        ],
    })
    sheets.push({
        name: 'Componentes efectivo', rows: [
            ['Cuenta de efectivo', 'Código', 'Saldo inicial', 'Saldo final'],
            ...nominal.cashBridge.components.map((cc): Cell[] => [cc.name, cc.code, u(cc.openingCents), u(cc.closingCents)]),
        ],
    })

    return sheets
}

/** Genera y descarga el papel de trabajo del EFE como .xlsx. */
export async function exportWorkingPaper(bundle: ReportingBundle, expression: WorkingPaperExpression = 'NOMINAL'): Promise<void> {
    const sheets = buildWorkingPaperSheets(bundle, expression)
    const suffix = expression === 'CLOSING_CURRENCY' ? '_moneda_de_cierre' : expression === 'BOTH' ? '_nominal_y_cierre' : ''
    await writeWorkbook(sheets, `EFE_papel_de_trabajo_${bundle.metadata.exerciseLabel}${suffix}`.replace(/\s+/g, '_'))
}
