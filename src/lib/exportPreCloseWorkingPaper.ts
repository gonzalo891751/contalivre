/** Exportación integral del papel de trabajo de pre-cierre — Fase 2L. */

import type { ReportingBundle } from '../reporting/loadReportingBundle'
import { CRITERION_LABEL, RUBRO_LABEL } from '../reporting/measurement/measurementTypes'
import { writeWorkbook, type WorkbookSheet } from './spreadsheet'

type Cell = string | number | null

export function buildPreCloseWorkingPaperSheets(bundle: ReportingBundle): WorkbookSheet[] {
    const paper = bundle.closingWorkPaper
    const inflation = bundle.inflationWorkPaper
    const impact = bundle.closingImpact
    const recpam = bundle.recpam

    const summary: WorkbookSheet = {
        name: 'Resumen',
        rows: [
            ['Pre-cierre guiado y medición al cierre'],
            ['Documento de trabajo: no reemplaza el juicio profesional ni contabiliza por sí solo.'],
            [],
            ['Empresa', bundle.metadata.companyLegalName],
            ['CUIT', bundle.metadata.companyTaxId ?? 'Pendiente'],
            ['Ejercicio', bundle.metadata.exerciseLabel],
            ['Período', `${bundle.metadata.periodStart} a ${bundle.metadata.periodEnd}`],
            ['Marco', bundle.metadata.normative],
            ['Esquema', bundle.metadata.schemaVersion],
            ['Versión del reporte', bundle.metadata.reportVersion],
            ['Papel de trabajo', paper?.id ?? 'No guardado'],
            ['Versión del papel', paper?.version ?? 0],
            ['Estado', paper?.status ?? 'PENDIENTE'],
            ['Aplicabilidad AxI', inflation.applicabilityStatus],
            ['Serie', bundle.inflationSet?.name ?? '—'],
            ['Hash de serie', bundle.inflationSet?.contentHash ?? '—'],
            ['Estado de emisión', bundle.readiness.canPublish ? 'PUBLICABLE' : 'BLOQUEADO'],
            ['Estado de cierre', bundle.readiness.canClose ? 'LISTO' : 'BLOQUEADO'],
            ['Próxima acción', bundle.readiness.nextAction],
        ],
    }

    const checklist: WorkbookSheet = {
        name: 'Checklist',
        rows: [
            ['Etapa', 'Estado', 'Dependencias bloqueadas', 'Bloqueos', 'Advertencias', 'Puede continuar', 'Motivo / próxima acción'],
            ...bundle.readiness.stages.map((stage): Cell[] => [
                stage.label, stage.status, stage.dependencyBlockers.join(' · '), stage.blockingCount,
                stage.warningCount, stage.canContinue ? 'Sí' : 'No', stage.reason ?? stage.nextAction,
            ]),
            [],
            ['Control', 'Etapa', 'Severidad', 'Estado', 'Hallazgo', 'Por qué importa', 'Cómo resolver', 'Ruta'],
            ...bundle.readiness.checks.map((check): Cell[] => [
                check.id, check.stage, check.severity, check.passed ? 'OK' : 'PENDIENTE',
                check.detail ?? check.label, check.why ?? '', check.action ?? '', check.link ?? '',
            ]),
        ],
    }

    const measurements: WorkbookSheet = {
        name: 'Mediciones',
        rows: [
            ['ID', 'Cuenta', 'Rubro', 'Criterio', 'Importe anterior', 'Anterior reexpresado', 'Medición cierre', 'Diferencia', 'Estado', 'Fuente', 'Evidencia', 'Política', 'Asiento'],
            ...bundle.closingMeasurements.map((measurement): Cell[] => [
                measurement.id,
                `${measurement.accountCode} ${measurement.accountName}`,
                RUBRO_LABEL[measurement.rubro],
                CRITERION_LABEL[measurement.criterion],
                measurement.previousAmount,
                measurement.previousIsRestated ? 'Sí' : 'No',
                measurement.closingAmount,
                measurement.difference,
                measurement.status,
                measurement.source,
                measurement.evidence ?? '',
                measurement.policyDecisionId ?? '',
                measurement.journalEntryId ?? '',
            ]),
        ],
    }

    const recoverability: WorkbookSheet = {
        name: 'Recuperabilidad',
        rows: [
            ['Medición', 'Cuenta', 'Nivel', 'Base', 'Medición contable', 'VNR', 'Valor de uso', 'VR menos costos', 'Valor recuperable', 'Pérdida', 'Reverso', 'Límite reverso', 'Evidencia', 'Conclusión'],
            ...bundle.closingMeasurements.filter(m => m.recoverability).map((measurement): Cell[] => {
                const r = measurement.recoverability!
                return [measurement.id, `${measurement.accountCode} ${measurement.accountName}`, r.level, r.basis,
                    r.accountingAmount, r.netRealizableValue ?? null, r.valueInUse ?? null,
                    r.fairValueLessCosts ?? null, r.recoverableAmount, r.impairmentLoss, r.reversal,
                    r.reversalCap ?? null, r.evidence, r.conclusion]
            }),
        ],
    }

    const inflationRows: WorkbookSheet = {
        name: 'Papel AxI',
        rows: [
            ['Cuenta', 'Rubro', 'Clasificación', 'Tratamiento', 'Base', 'Método origen', 'Orígenes', 'Ajuste inflación', 'Medición cierre', 'Ajuste medición', 'Importe final', 'Resultado', 'Estado', 'Sin doble ajuste', 'Asientos', 'Evidencia'],
            ...inflation.rows.map((row): Cell[] => [
                `${row.code} ${row.name}`, row.rubro, row.classification, row.treatment, row.baseAmount,
                row.originMethod, row.origins.map(origin => origin.period).join(' · '), row.inflationAdjustment,
                row.closingMeasurement ?? null, row.measurementAdjustment, row.finalAmount, row.resultKind,
                row.status, row.doubleAdjustmentPrevented ? 'Sí' : 'No', row.entryIds.join(' '), row.evidence.join(' · '),
            ]),
        ],
    }

    const coefficients: WorkbookSheet = {
        name: 'Coeficientes',
        rows: [
            ['Período', 'Índice origen', 'Índice cierre', 'Coeficiente', 'Fórmula', 'Estado'],
            ...inflation.coefficients.map((row): Cell[] => [
                row.period, row.originIndex, row.closingIndex, row.coefficient, row.formula, row.status,
            ]),
        ],
    }

    const classification: WorkbookSheet = {
        name: 'Clasificación',
        rows: [
            ['Cuenta', 'Clasificación', 'Tratamiento', 'Método de origen', 'Período', 'Importe histórico', 'Índice origen', 'Índice cierre', 'Coeficiente', 'Reexpresado', 'Fórmula'],
            ...inflation.rows.flatMap(row => row.origins.map((origin): Cell[] => [
                `${row.code} ${row.name}`, row.classification, row.treatment, row.originMethod,
                origin.period, origin.historicAmount, origin.originIndex, origin.closingIndex,
                origin.coefficient, origin.restatedAmount, origin.formula,
            ])),
        ],
    }

    const recpamSheet: WorkbookSheet = {
        name: 'RECPAM',
        rows: [
            ['RECPAM no es la suma mecánica de diferencias por cuenta: se determina secuencialmente y se verifica por exposición monetaria.'],
            [],
            ['Determinación', 'Importe'],
            ['Secuencial', recpam?.sequential.amount ?? null],
            ['Analítica', recpam?.analytic.amount ?? null],
            ['Diferencia', recpam?.difference ?? null],
            ['Tolerancia', recpam ? recpam.toleranceCents / 100 : null],
            ['Conciliado', recpam?.reconciled ? 'Sí' : 'No / no aplicable'],
            [],
            ['Período', 'Posición inicial', 'Flujo monetario', 'Posición final', 'Coeficiente', 'Contribución RECPAM'],
            ...(recpam?.monetaryEvolution ?? []).map((row): Cell[] => [
                row.period, row.openingPosition, row.netFlow, row.closingPosition, row.coefficient, row.recpamContribution,
            ]),
        ],
    }

    const adjustments: WorkbookSheet = {
        name: 'Ajustes',
        rows: [
            ['ID', 'Tipo', 'Origen', 'Estado', 'Fecha', 'Memo', 'Cuenta', 'Debe', 'Haber', 'Explicación', 'Asiento'],
            ...(paper?.adjustments ?? []).flatMap(adjustment => adjustment.lines.map((line): Cell[] => [
                adjustment.id, adjustment.kind, adjustment.sourceId, adjustment.status, adjustment.date,
                adjustment.memo, `${line.accountCode} ${line.accountName}`, line.debit, line.credit,
                line.explanation, adjustment.journalEntryId ?? '',
            ])),
        ],
    }

    const pending: WorkbookSheet = {
        name: 'Pendientes',
        rows: [
            ['Control', 'Etapa', 'Severidad', 'Hallazgo', 'Acción'],
            ...bundle.readiness.checks.filter(check => !check.passed).map((check): Cell[] => [
                check.id, check.stage, check.severity, check.detail ?? check.label, check.action ?? '',
            ]),
            ...inflation.blockers.map((blocker): Cell[] => ['inflacion', 'UNIDAD_MEDIDA_INFLACION', 'BLOQUEA', blocker, 'Revisar papel AxI']),
        ],
    }

    const impactRows = (Object.keys(impact.before) as Array<keyof typeof impact.before>).map((key): Cell[] => [
        key, impact.before[key], impact.adjustments[key], impact.after[key], impact.after[key] - impact.before[key],
    ])
    const report: WorkbookSheet = {
        name: 'Informe final',
        rows: [
            ['Magnitud', 'Antes', 'Ajustes pendientes', 'Después', 'Variación'],
            ...impactRows,
            [],
            ['Cantidad de ajustes pendientes', impact.adjustmentCount],
            ['Diferencia ecuación antes', impact.equationDifferenceBefore],
            ['Diferencia ecuación después', impact.equationDifferenceAfter],
            ['Bloqueos', bundle.readiness.blockers.length],
            ['Advertencias', bundle.readiness.warnings.length],
            ['Conclusión', bundle.readiness.canPublish && bundle.readiness.canClose
                ? 'El juego no presenta bloqueos automáticos; requiere aprobación final del responsable.'
                : 'El juego permanece bloqueado hasta resolver los pendientes detallados.'],
        ],
    }

    const trace: WorkbookSheet = {
        name: 'Trazabilidad',
        rows: [
            ['Evento', 'Actor', 'Fecha', 'Detalle', 'Papel de trabajo'],
            ...(paper?.auditTrail ?? []).map((event): Cell[] => [event.action, event.actorId, event.timestamp, event.detail, paper?.id ?? '']),
            [],
            ['Cuenta AxI', 'Asientos origen', 'Evidencia'],
            ...inflation.rows.map((row): Cell[] => [`${row.code} ${row.name}`, row.entryIds.join(' '), row.evidence.join(' · ')]),
        ],
    }

    return [summary, checklist, measurements, recoverability, inflationRows, coefficients,
        classification, recpamSheet, adjustments, pending, report, trace]
}

export async function exportPreCloseWorkingPaper(bundle: ReportingBundle): Promise<void> {
    const safeExercise = bundle.metadata.exerciseLabel.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')
    await writeWorkbook(buildPreCloseWorkingPaperSheets(bundle), `ContaLivre_PreCierre_${safeExercise}`)
}
