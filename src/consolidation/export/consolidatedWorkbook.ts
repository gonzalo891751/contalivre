/**
 * Exportación del libro de trabajo de consolidación a Excel (Fase 2K §22).
 *
 * Se extiende la infraestructura formal ya existente (exceljs, la misma que usa
 * la exportación de estados individuales). El libro es AUDITABLE, no una copia
 * de la planilla de la cátedra: cada hoja declara el grupo, el ejercicio y la
 * unidad de medida, los importes van con formato numérico real (no texto), y
 * ninguna celda contiene un valor sin explicación.
 */

import ExcelJS from 'exceljs'
import type { ConsolidationWorksheet } from '../domain/types'
import type { ConsolidatedStatements } from '../engine/statements'

const MONEY_FORMAT = '#,##0.00;(#,##0.00);"—"'
const HEADER_FILL = 'FF1E3A5F'

function titleRow(sheet: ExcelJS.Worksheet, statements: ConsolidatedStatements, subtitle: string): void {
    sheet.addRow([statements.groupName])
    sheet.addRow([subtitle])
    sheet.addRow([`Controladora: ${statements.parentCompanyName}`])
    sheet.addRow([`Ejercicio ${statements.periodStart} al ${statements.periodEnd} · Cierre ${statements.reportingDate}`])
    sheet.addRow([`Moneda: ${statements.currency} · Unidad de medida: ${statements.measurementUnit}`])
    sheet.addRow([])
    sheet.getRow(1).font = { bold: true, size: 14 }
    sheet.getRow(2).font = { bold: true, size: 12 }
    for (let i = 3; i <= 5; i++) sheet.getRow(i).font = { size: 10, color: { argb: 'FF555555' } }
}

function styleHeader(row: ExcelJS.Row): void {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    row.alignment = { vertical: 'middle', wrapText: true }
}

function autoWidth(sheet: ExcelJS.Worksheet, widths: number[]): void {
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w })
}

export function buildConsolidationWorkbook(
    worksheet: ConsolidationWorksheet,
    statements: ConsolidatedStatements
): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'ContaLivre'
    wb.created = new Date()

    // ── 1. Portada y control ──
    const cover = wb.addWorksheet('Portada y control')
    titleRow(cover, statements, 'Estados contables consolidados')
    cover.addRow(['Entidades incluidas en la consolidación'])
    cover.lastRow!.font = { bold: true }
    styleHeader(cover.addRow(['Entidad', 'Rol', 'Participación']))
    for (const e of statements.entities) {
        cover.addRow([
            e.name,
            e.role === 'PARENT' ? 'Controladora' : 'Controlada',
            e.role === 'PARENT' ? '' : e.ownership,
        ]).getCell(3).numFmt = '0.00%'
    }
    cover.addRow([])
    cover.addRow(['Controles de integridad'])
    cover.lastRow!.font = { bold: true }
    styleHeader(cover.addRow(['Control', 'Resultado', 'Diferencia', 'Detalle']))
    for (const check of statements.checks) {
        const row = cover.addRow([
            check.label,
            check.passed ? 'PASA' : 'NO PASA',
            check.difference ?? '',
            check.detail ?? '',
        ])
        row.getCell(3).numFmt = MONEY_FORMAT
        if (!check.passed) row.getCell(2).font = { bold: true, color: { argb: 'FFB00020' } }
    }
    if (statements.blockers.length > 0) {
        cover.addRow([])
        cover.addRow(['Impedimentos para la emisión formal'])
        cover.lastRow!.font = { bold: true, color: { argb: 'FFB00020' } }
        for (const b of statements.blockers) cover.addRow([b])
    }
    autoWidth(cover, [60, 14, 18, 70])

    // ── 2. Hoja de consolidación ──
    const ws = wb.addWorksheet('Hoja de consolidación')
    titleRow(ws, statements, 'Papel de trabajo de consolidación')
    const entityNames = worksheet.entities.map(e => e.name)
    styleHeader(ws.addRow([
        'Sección', 'Rubro', ...entityNames, 'Suma previa',
        'Homogeneización', 'Inversión / PN', 'Participación no controladora',
        'Saldos recíprocos', 'Operaciones internas', 'Resultados no trascendidos',
        'Impuesto diferido', 'Ajustes manuales', 'Consolidado',
    ]))
    for (const row of worksheet.rows) {
        const sign = row.naturalSign
        const excelRow = ws.addRow([
            row.section,
            row.label,
            ...worksheet.entities.map(e => {
                const entry = row.byEntity.find(b => b.companyId === e.companyId)
                return (entry?.amount ?? 0) * sign
            }),
            row.subtotal * sign,
            row.homogenization * sign,
            row.investmentElimination * sign,
            row.nonControllingInterest * sign,
            row.reciprocalElimination * sign,
            row.operationElimination * sign,
            row.unrealizedElimination * sign,
            row.deferredTax * sign,
            row.manualAdjustment * sign,
            row.consolidated * sign,
        ])
        for (let c = 3; c <= excelRow.cellCount; c++) excelRow.getCell(c).numFmt = MONEY_FORMAT
    }
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 7 }]
    autoWidth(ws, [22, 42, ...entityNames.map(() => 16), 16, 16, 16, 18, 16, 16, 18, 16, 16, 18])

    // ── 3. Eliminaciones ──
    const elim = wb.addWorksheet('Eliminaciones')
    titleRow(elim, statements, 'Detalle de las eliminaciones de consolidación')
    styleHeader(elim.addRow([
        'Id', 'Tipo', 'Origen', 'Concepto', 'Línea consolidada', 'Entidad', 'Debe', 'Haber', 'Balancea', 'Fundamento',
    ]))
    for (const e of worksheet.eliminations) {
        for (const l of e.lines) {
            const row = elim.addRow([
                e.id, e.kind, e.origin, e.label, l.consolidatedLineId,
                worksheet.entities.find(x => x.companyId === l.companyId)?.name ?? l.companyId ?? '',
                l.debit, l.credit, e.balanced ? 'Sí' : 'NO', e.rationale,
            ])
            row.getCell(7).numFmt = MONEY_FORMAT
            row.getCell(8).numFmt = MONEY_FORMAT
        }
    }
    autoWidth(elim, [28, 24, 12, 44, 30, 24, 16, 16, 10, 90])

    // ── 4. Cálculo de cada eliminación (trazabilidad pedagógica) ──
    const calc = wb.addWorksheet('Cálculo de eliminaciones')
    titleRow(calc, statements, 'Cómo se determinó cada eliminación, paso a paso')
    styleHeader(calc.addRow(['Concepto', 'Paso', 'Detalle']))
    for (const e of worksheet.eliminations) {
        e.computation.forEach((step, i) => calc.addRow([i === 0 ? e.label : '', i + 1, step]))
        calc.addRow([])
    }
    autoWidth(calc, [44, 8, 110])

    // ── 5. Participación no controladora ──
    const nci = wb.addWorksheet('Participación no controladora')
    titleRow(nci, statements, 'Determinación de la participación no controladora')
    styleHeader(nci.addRow([
        'Controlada', '% no controlado', 'PN de la controlada', 'Resultados no trascendidos propios',
        'PN ajustado', 'PNC al cierre', 'Resultado del ejercicio', 'Resultado ajustado',
        'Resultado atribuible a la PNC', 'Inversión contabilizada', 'VPP esperado', 'Diferencia',
    ]))
    for (const d of worksheet.nci) {
        const row = nci.addRow([
            d.companyName, d.nonControllingRatio, d.subsidiaryEquity, -d.unrealizedFromSubsidiary,
            d.adjustedEquity, d.closingNci, d.subsidiaryResult, d.adjustedResult,
            d.nciResult, d.bookedInvestment, d.expectedInvestment, d.consolidationDifference,
        ])
        row.getCell(2).numFmt = '0.00%'
        for (let c = 3; c <= 12; c++) row.getCell(c).numFmt = MONEY_FORMAT
    }
    autoWidth(nci, [28, 16, 20, 26, 18, 18, 20, 20, 24, 22, 18, 16])

    // ── 6. Estados consolidados ──
    const esp = wb.addWorksheet('ESP consolidado')
    titleRow(esp, statements, 'Estado de Situación Patrimonial Consolidado')
    styleHeader(esp.addRow(['Concepto', 'Importe']))
    const bs = statements.balanceSheet
    const writeLine = (sheet: ExcelJS.Worksheet, label: string, amount: number, bold = false) => {
        const row = sheet.addRow([label, amount])
        row.getCell(2).numFmt = MONEY_FORMAT
        if (bold) row.font = { bold: true }
    }
    for (const group of [bs.currentAssets, bs.nonCurrentAssets]) {
        writeLine(esp, group.label, group.amount, true)
        for (const child of group.children ?? []) writeLine(esp, `    ${child.label}`, child.amount)
    }
    writeLine(esp, bs.totalAssets.label, bs.totalAssets.amount, true)
    esp.addRow([])
    for (const group of [bs.currentLiabilities, bs.nonCurrentLiabilities]) {
        writeLine(esp, group.label, group.amount, true)
        for (const child of group.children ?? []) writeLine(esp, `    ${child.label}`, child.amount)
    }
    writeLine(esp, bs.totalLiabilities.label, bs.totalLiabilities.amount, true)
    esp.addRow([])
    writeLine(esp, bs.equityOwners.label, bs.equityOwners.amount, true)
    for (const child of bs.equityOwners.children ?? []) writeLine(esp, `    ${child.label}`, child.amount)
    writeLine(esp, bs.nonControllingInterest.label, bs.nonControllingInterest.amount, true)
    writeLine(esp, bs.totalEquity.label, bs.totalEquity.amount, true)
    writeLine(esp, bs.totalLiabilitiesAndEquity.label, bs.totalLiabilitiesAndEquity.amount, true)
    autoWidth(esp, [64, 20])

    const er = wb.addWorksheet('ER consolidado')
    titleRow(er, statements, 'Estado de Resultados Consolidado')
    styleHeader(er.addRow(['Concepto', 'Importe']))
    const is = statements.incomeStatement
    for (const l of [
        is.sales, is.costOfSales, is.grossProfit, is.adminExpenses, is.sellingExpenses,
        is.operatingResult, is.financialIncome, is.financialExpenses, is.otherResults,
        is.preTaxResult, is.incomeTax, is.netIncome,
    ]) writeLine(er, l.label, l.amount, l.level === 0)
    er.addRow([])
    writeLine(er, is.attributableToOwners.label, is.attributableToOwners.amount, true)
    writeLine(er, is.attributableToNci.label, is.attributableToNci.amount, true)
    autoWidth(er, [64, 20])

    const eepn = wb.addWorksheet('EEPN consolidado')
    titleRow(eepn, statements, 'Estado de Evolución del Patrimonio Neto Consolidado')
    styleHeader(eepn.addRow(['Concepto', ...statements.equityStatement.columns.map(c => c.label)]))
    for (const row of statements.equityStatement.rows) {
        const excelRow = eepn.addRow([
            row.label,
            ...statements.equityStatement.columns.map(c =>
                row.insufficient ? 'Información insuficiente' : (row.cells[c.id] ?? 0)),
        ])
        for (let c = 2; c <= excelRow.cellCount; c++) {
            if (!row.insufficient) excelRow.getCell(c).numFmt = MONEY_FORMAT
        }
        if (row.isSubtotal) excelRow.font = { bold: true }
    }
    eepn.addRow([])
    eepn.addRow([statements.equityStatement.note])
    autoWidth(eepn, [50, 18, 18, 24, 22, 30, 26, 24])

    if (statements.cashFlow) {
        const efe = wb.addWorksheet('EFE consolidado')
        titleRow(efe, statements, 'Estado de Flujo de Efectivo Consolidado')
        styleHeader(efe.addRow([
            'Concepto', ...worksheet.entities.map(e => e.name),
            'Suma previa', 'Eliminación de flujos internos', 'Consolidado',
        ]))
        const cf = statements.cashFlow
        writeLine(efe, 'Efectivo al inicio del ejercicio', cf.openingCash, true)
        for (const l of cf.lines) {
            const row = efe.addRow([
                l.label,
                ...worksheet.entities.map(e => l.byEntity.find(b => b.companyId === e.companyId)?.amount ?? 0),
                l.subtotal, l.elimination, l.consolidated,
            ])
            for (let c = 2; c <= row.cellCount; c++) row.getCell(c).numFmt = MONEY_FORMAT
        }
        writeLine(efe, 'Variación neta del efectivo', cf.netChange, true)
        writeLine(efe, 'Efectivo al cierre del ejercicio', cf.closingCash, true)
        efe.addRow([])
        efe.addRow(['Flujos entre entidades del grupo eliminados'])
        efe.lastRow!.font = { bold: true }
        styleHeader(efe.addRow(['Concepto', 'Paga', 'Cobra', 'Importe', 'Actividad del pagador', 'Actividad del cobrador']))
        for (const e of cf.eliminations) {
            const row = efe.addRow([
                e.description,
                worksheet.entities.find(x => x.companyId === e.payerCompanyId)?.name ?? e.payerCompanyId,
                worksheet.entities.find(x => x.companyId === e.receiverCompanyId)?.name ?? e.receiverCompanyId,
                e.amount, e.payerActivity, e.receiverActivity,
            ])
            row.getCell(4).numFmt = MONEY_FORMAT
        }
        autoWidth(efe, [46, ...worksheet.entities.map(() => 18), 18, 26, 18, 20])
    }

    // ── 7. Notas ──
    const notes = wb.addWorksheet('Notas')
    titleRow(notes, statements, 'Notas a los estados contables consolidados')
    for (const note of statements.notes) {
        notes.addRow([note.title]).font = { bold: true, size: 12 }
        for (const p of note.paragraphs) notes.addRow([p])
        if (note.table) {
            styleHeader(notes.addRow(note.table.headers))
            for (const r of note.table.rows) notes.addRow(r)
        }
        if (note.requiresNarrative) {
            notes.addRow(['[Requiere que el emisor complete la narrativa profesional]'])
                .font = { italic: true, color: { argb: 'FFB06000' } }
        }
        notes.addRow([])
    }
    notes.getColumn(1).width = 110
    notes.getColumn(1).alignment = { wrapText: true, vertical: 'top' }
    for (let i = 2; i <= 8; i++) notes.getColumn(i).width = 26

    return wb
}

/** Descarga el libro en el navegador */
export async function downloadConsolidationWorkbook(
    worksheet: ConsolidationWorksheet,
    statements: ConsolidatedStatements
): Promise<void> {
    const wb = buildConsolidationWorkbook(worksheet, statements)
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const slug = statements.groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    link.download = `consolidacion-${slug}-${statements.reportingDate}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
