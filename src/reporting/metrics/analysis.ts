/**
 * Análisis vertical y horizontal — Fase 2B (§13.2 / §13.3).
 * Deriva del mismo StatementsBundle del motor único.
 */

import { toCents } from '../../accounting/domain/money'
import type { ReportLine, StatementsBundle } from '../domain/types'
import type { HorizontalAnalysisRow, VerticalAnalysisRow } from './types'

const r2 = (n: number) => Math.round(n * 100) / 100

function flatten(line: ReportLine, out: ReportLine[] = []): ReportLine[] {
    out.push(line)
    for (const c of line.children ?? []) flatten(c, out)
    return out
}

function verticalRows(lines: ReportLine[], baseLabel: string, baseAmount: number): VerticalAnalysisRow[] {
    const baseCents = toCents(baseAmount)
    return lines.map(l => ({
        lineId: l.id,
        label: l.label,
        amount: l.amount,
        baseLabel,
        baseAmount,
        percentage: baseCents === 0 ? null : r2((l.amount / baseAmount) * 100),
        level: l.level,
    }))
}

/** ESP: cada rubro del activo sobre el total del activo; pasivo y PN sobre el total de la financiación */
export function verticalBalanceSheet(bundle: StatementsBundle): VerticalAnalysisRow[] {
    const bs = bundle.balanceSheet
    const activo = flatten(bs.totalAssets)
    const financiacion = [...flatten(bs.totalLiabilities), ...flatten(bs.equity), bs.totalLiabilitiesAndEquity]
    return [
        ...verticalRows(activo, 'Total del activo', bs.totalAssets.amount),
        ...verticalRows(financiacion, 'Total de la financiación (P + PN)', bs.totalLiabilitiesAndEquity.amount),
    ]
}

/** ER: cada componente sobre las ventas */
export function verticalIncomeStatement(bundle: StatementsBundle): VerticalAnalysisRow[] {
    const er = bundle.incomeStatement
    const lines = [
        er.sales, er.costOfSales, er.grossProfit,
        er.adminExpenses, er.sellingExpenses, er.operatingResult,
        er.financialResults, er.otherResults, er.preTaxResult,
        er.incomeTax, er.netIncome,
    ].flatMap(l => flatten(l))
    return verticalRows(lines, 'Ventas', er.sales.amount)
}

function horizontalRow(line: ReportLine): HorizontalAnalysisRow {
    const prev = line.comparativeAmount ?? null
    if (prev === null) {
        return {
            lineId: line.id, label: line.label, current: line.amount,
            previous: null, absoluteChange: null, percentageChange: null,
            note: 'Sin comparativo del ejercicio anterior.',
            level: line.level,
        }
    }
    const abs = r2(line.amount - prev)
    if (toCents(prev) === 0) {
        return {
            lineId: line.id, label: line.label, current: line.amount,
            previous: prev, absoluteChange: abs, percentageChange: null,
            note: 'Base cero: la variación porcentual no está definida.',
            level: line.level,
        }
    }
    if (prev < 0) {
        return {
            lineId: line.id, label: line.label, current: line.amount,
            previous: prev, absoluteChange: abs,
            percentageChange: null,
            note: 'Base negativa: el porcentaje convencional induce a error; leer la variación absoluta.',
            level: line.level,
        }
    }
    return {
        lineId: line.id, label: line.label, current: line.amount,
        previous: prev, absoluteChange: abs,
        percentageChange: r2((abs / prev) * 100),
        level: line.level,
    }
}

/** Horizontal del ESP (usa los comparativos adjuntos por el motor) */
export function horizontalBalanceSheet(bundle: StatementsBundle): HorizontalAnalysisRow[] {
    const bs = bundle.balanceSheet
    return [bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets,
        bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities,
        bs.equity, bs.totalLiabilitiesAndEquity]
        .flatMap(l => flatten(l))
        .map(horizontalRow)
}

/** Horizontal del ER */
export function horizontalIncomeStatement(bundle: StatementsBundle): HorizontalAnalysisRow[] {
    const er = bundle.incomeStatement
    return [er.sales, er.costOfSales, er.grossProfit, er.adminExpenses,
        er.sellingExpenses, er.operatingResult, er.financialResults,
        er.otherResults, er.preTaxResult, er.incomeTax, er.netIncome]
        .flatMap(l => flatten(l))
        .map(horizontalRow)
}
