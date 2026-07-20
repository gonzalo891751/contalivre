/**
 * Anexo de bienes de uso en moneda de cierre — Fase 2F (§12).
 *
 * Reexpresa el valor de origen y la depreciación acumulada por clase,
 * anticuando cada movimiento a su período y aplicando coef(origen→cierre)
 * del set de índices provisto. El saldo de apertura se reexpresa por
 * coef(inicio→cierre). NO recalcula el anexo nominal (lo recibe); solo
 * agrega el ajuste por reexpresión. Sin índice para un período requerido,
 * se BLOQUEA (no se estima con coeficiente 1).
 */

import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import { getCoefficient } from '../../accounting/inflation/engine'
import { UNCLASSIFIED_ASSET_CLASS } from './fixedAssetsAnnex'
import type {
    FixedAssetsAnnex,
    FixedAssetsAnnexRestated,
    FixedAssetsRestatedRow,
    ReportingInput,
} from '../domain/types'

const fromCents = (c: number) => c / 100

interface ClassAcc {
    accountIds: Set<string>
    grossRestatedCents: number
    depRestatedCents: number
}

export function reexpressFixedAssetsAnnex(
    input: ReportingInput,
    annex: FixedAssetsAnnex,
    indexes: Map<string, number>
): FixedAssetsAnnexRestated {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const isPpe = (accountId: string) => byId.get(accountId)?.statementGroup === 'PPE'
    const classOf = (accountId: string): string => byId.get(accountId)?.annexGroup?.trim() || UNCLASSIFIED_ASSET_CLASS
    const closePeriod = input.context.periodEnd.slice(0, 7)
    const startPeriod = input.context.periodStart.slice(0, 7)

    const missing = new Set<string>()
    const coef = (period: string): number => {
        const c = getCoefficient(indexes, period, closePeriod)
        if (c === null) { missing.add(period); return 1 }
        return c
    }

    const classes = new Map<string, ClassAcc>()
    const accFor = (cls: string): ClassAcc => {
        let a = classes.get(cls)
        if (!a) { a = { accountIds: new Set(), grossRestatedCents: 0, depRestatedCents: 0 } as ClassAcc; classes.set(cls, a) }
        return a
    }

    // Apertura (explícita + formal): reexpresa por coef(inicio→cierre)
    const openingCoef = coef(startPeriod)
    const addOpening = (accountId: string, netCents: number) => {
        const account = byId.get(accountId)
        if (!account) return
        const acc = accFor(classOf(accountId))
        acc.accountIds.add(accountId)
        const restated = Math.round(netCents * openingCoef)
        if (account.isContra) acc.depRestatedCents += -restated
        else acc.grossRestatedCents += restated
    }
    for (const [accountId, ob] of input.openingBalances) {
        if (!isPpe(accountId)) continue
        addOpening(accountId, toCents(ob.debit || 0) - toCents(ob.credit || 0))
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (!(entry.sourceModule === 'closing' && entry.sourceType === 'apertura')) continue
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            addOpening(l.accountId, toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }

    // Movimientos del ejercicio: cada uno por su período
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') continue
        const period = entry.date.slice(0, 7)
        const c = coef(period)
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            const account = byId.get(l.accountId)!
            const acc = accFor(classOf(l.accountId))
            acc.accountIds.add(l.accountId)
            const netDebit = toCents(l.debit || 0) - toCents(l.credit || 0)
            const restated = Math.round(netDebit * c)
            if (account.isContra) acc.depRestatedCents += -restated  // dep. acum. acreedora positiva
            else acc.grossRestatedCents += restated
        }
    }

    // Filas: nominal (del anexo recibido) + ajuste + reexpresado
    const nominalByClass = new Map(annex.rows.map(r => [r.assetClass, r]))
    const rows: FixedAssetsRestatedRow[] = []
    let totGrossN = 0, totGrossR = 0, totDepN = 0, totDepR = 0
    for (const [cls, acc] of classes) {
        const nominal = nominalByClass.get(cls)
        const grossNominalCents = nominal ? toCents(nominal.grossClosing) : 0
        const depNominalCents = nominal ? toCents(nominal.accumDepClosing) : 0
        if (grossNominalCents === 0 && depNominalCents === 0 && acc.grossRestatedCents === 0 && acc.depRestatedCents === 0) continue
        rows.push(makeRow(cls, Array.from(acc.accountIds), grossNominalCents, acc.grossRestatedCents, depNominalCents, acc.depRestatedCents))
        totGrossN += grossNominalCents; totGrossR += acc.grossRestatedCents
        totDepN += depNominalCents; totDepR += acc.depRestatedCents
    }
    rows.sort((a, b) => a.assetClass.localeCompare(b.assetClass))

    const totals = makeRow('Total', [], totGrossN, totGrossR, totDepN, totDepR)

    const blockers: string[] = []
    if (missing.size > 0) {
        blockers.push(`Faltan índices para reexpresar bienes de uso de: ${Array.from(missing).sort().join(', ')}. Sin índice no se reexpresa.`)
    }

    return { rows, totals, closePeriod, blockers }
}

function makeRow(
    assetClass: string, accountIds: string[],
    grossNominalCents: number, grossRestatedCents: number,
    depNominalCents: number, depRestatedCents: number
): FixedAssetsRestatedRow {
    return {
        assetClass, accountIds,
        grossNominal: fromCents(grossNominalCents),
        grossAdjustment: fromCents(grossRestatedCents - grossNominalCents),
        grossRestated: fromCents(grossRestatedCents),
        depNominal: fromCents(depNominalCents),
        depAdjustment: fromCents(depRestatedCents - depNominalCents),
        depRestated: fromCents(depRestatedCents),
        residualRestated: fromCents(grossRestatedCents - depRestatedCents),
    }
}
