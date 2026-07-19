/**
 * EFE en moneda de cierre — Fase 2C (§9).
 *
 * Reexpresa cada flujo por el coeficiente de SU período de origen (no un
 * coeficiente anual único). El efectivo final está en moneda de cierre por
 * naturaleza (partida monetaria a la fecha de cierre); el efectivo inicial
 * se reexpresa por coef(inicio→cierre). La diferencia entre el efectivo
 * final nominal y (inicial reexpresado + Σ flujos reexpresados) es el
 * Resultado por exposición a la inflación del efectivo y equivalentes (REI),
 * que se muestra como línea de conciliación — no es un flujo.
 *
 * Invariantes garantizados por construcción:
 *   efectivo final = efectivo inicial reexpresado + Σ flujos reexpresados + REI
 *   variación = efectivo final − efectivo inicial reexpresado
 *   método directo (flujos) = método indirecto (flujos)
 *
 * Si algún flujo material pertenece a un período sin índice, se BLOQUEA la
 * reexpresión (no se estima con coeficiente 1).
 */

import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import { getCoefficient } from '../../accounting/inflation/engine'
import { directOperatingSubcategory, flowBucket, isCashAccount } from './buildCashFlow'
import type { CashFlowStatement2B, ReportLine, ReportingInput, StatementsBundle } from '../domain/types'

const fromCents = (c: number) => c / 100

function line(id: string, label: string, cents: number, level = 0, accountIds: string[] = [], children?: ReportLine[]): ReportLine {
    return { id, label, level: children ? 1 : level, amount: fromCents(cents), accountIds, children }
}

export interface RestatedCashFlow {
    direct: CashFlowStatement2B
    indirect: CashFlowStatement2B
    blockers: string[]
}

export function reexpressCashFlow(
    input: ReportingInput,
    bundle: StatementsBundle,
    indexes: Map<string, number>
): RestatedCashFlow {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const closePeriod = input.context.periodEnd.slice(0, 7)
    const blockers: string[] = []
    const missing = new Set<string>()

    const coefFor = (period: string): number | null => {
        const c = getCoefficient(indexes, period, closePeriod)
        if (c === null) missing.add(period)
        return c
    }

    const flowEntries = input.entries.filter(e =>
        e.status !== 'DRAFT'
        && !isStructuralClosingEntry(e)
        && !(e.sourceModule === 'closing' && e.sourceType === 'apertura'))

    // Acumuladores reexpresados (en centavos de moneda de cierre)
    const operating = new Map<string, { cents: number; ids: Set<string> }>()
    let investingCents = 0, financingCents = 0, unclassifiedCents = 0
    const investIds = new Set<string>(), finIds = new Set<string>(), unclIds = new Set<string>()

    // Indirecto reexpresado por período
    let resultCents = 0, wcAssetCents = 0, wcLiabCents = 0, nonCashInvFinCents = 0
    const resultIds = new Set<string>(), wcAIds = new Set<string>(), wcLIds = new Set<string>()

    // Misma apertura estructural que el método directo nominal (Fase 2E §7.2)
    const subcat = (accountId: string): string => {
        const account = byId.get(accountId)
        return account ? directOperatingSubcategory(account) : 'Otros cobros y pagos operativos'
    }

    for (const entry of flowEntries) {
        const period = entry.date.slice(0, 7)
        const coef = coefFor(period)
        const factor = coef ?? 1 // si falta, se registra blocker y no se publica

        let touchesCash = false
        let cashCents = 0
        for (const l of entry.lines) {
            if (isCashAccount(byId.get(l.accountId))) {
                touchesCash = true
                cashCents += toCents(l.debit || 0) - toCents(l.credit || 0)
            }
        }

        // ΔWC reexpresado (todas las operaciones)
        for (const l of entry.lines) {
            const bucket = flowBucket(byId.get(l.accountId))
            const netDC = Math.round((toCents(l.debit || 0) - toCents(l.credit || 0)) * factor)
            if (bucket === 'WC_ASSET') { wcAssetCents += netDC; wcAIds.add(l.accountId) }
            if (bucket === 'WC_LIAB') { wcLiabCents += netDC; wcLIds.add(l.accountId) }
            if (bucket === 'RESULT') { resultCents += -netDC; resultIds.add(l.accountId) } // H−D = ganancia
        }

        if (touchesCash && cashCents !== 0) {
            for (const l of entry.lines) {
                const account = byId.get(l.accountId)
                const bucket = flowBucket(account)
                if (bucket === 'CASH') continue
                const contribCents = Math.round((toCents(l.credit || 0) - toCents(l.debit || 0)) * factor)
                if (contribCents === 0) continue
                switch (bucket) {
                    case 'RESULT':
                    case 'WC_ASSET':
                    case 'WC_LIAB': {
                        const key = subcat(l.accountId)
                        const s = operating.get(key) ?? { cents: 0, ids: new Set<string>() }
                        s.cents += contribCents; s.ids.add(l.accountId)
                        operating.set(key, s)
                        break
                    }
                    case 'INVESTING': investingCents += contribCents; investIds.add(l.accountId); break
                    case 'FINANCING': financingCents += contribCents; finIds.add(l.accountId); break
                    case 'UNCLASSIFIED': unclassifiedCents += contribCents; unclIds.add(l.accountId); break
                }
            }
        } else if (!touchesCash) {
            let invFin = 0
            for (const l of entry.lines) {
                const bucket = flowBucket(byId.get(l.accountId))
                const netDC = Math.round((toCents(l.debit || 0) - toCents(l.credit || 0)) * factor)
                if (bucket === 'INVESTING' || bucket === 'FINANCING') invFin += netDC
            }
            nonCashInvFinCents += invFin
        }
    }

    // Efectivo inicial reexpresado y final nominal
    let openingCashNominalCents = 0
    for (const [accountId, ob] of input.openingBalances) {
        if (isCashAccount(byId.get(accountId))) openingCashNominalCents += toCents(ob.debit || 0) - toCents(ob.credit || 0)
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') {
            for (const l of entry.lines) {
                if (isCashAccount(byId.get(l.accountId))) openingCashNominalCents += toCents(l.debit || 0) - toCents(l.credit || 0)
            }
        }
    }
    const openingCoef = getCoefficient(indexes, input.context.periodStart.slice(0, 7), closePeriod)
    if (openingCashNominalCents !== 0 && openingCoef === null) missing.add(input.context.periodStart.slice(0, 7))
    const openingRestatedCents = Math.round(openingCashNominalCents * (openingCoef ?? 1))

    let closingCashNominalCents = 0
    for (const row of bundle.trialBalance.rows) {
        if (isCashAccount(byId.get(row.accountId))) closingCashNominalCents += toCents(row.closing)
    }

    // Totales de flujos reexpresados
    let operatingCents = 0
    const operatingChildren: ReportLine[] = []
    for (const [label, s] of operating) {
        operatingChildren.push(line(`efe-mc:op:${label}`, label, s.cents, 2, Array.from(s.ids)))
        operatingCents += s.cents
    }
    operatingChildren.sort((a, b) => a.label.localeCompare(b.label))
    const flowsCents = operatingCents + investingCents + financingCents + unclassifiedCents

    // REI del efectivo = final − (inicial reexpresado + flujos reexpresados)
    const reiCents = closingCashNominalCents - (openingRestatedCents + flowsCents)
    const netChangeCents = flowsCents + reiCents

    if (missing.size > 0) {
        blockers.push(`Faltan índices para reexpresar flujos de: ${Array.from(missing).sort().join(', ')}. Sin índice no se reexpresa (no se estima con coeficiente 1).`)
    }
    if (unclassifiedCents !== 0) {
        blockers.push('Hay flujos sin clasificación EFE: regularizar antes de publicar el EFE en moneda de cierre.')
    }

    const reiLine = line('efe-mc:rei', 'Resultado por exposición a la inflación del efectivo (REI)', reiCents)

    const direct: CashFlowStatement2B = {
        method: 'DIRECT',
        openingCash: line('efe-mc:inicial', 'Efectivo al inicio (reexpresado a moneda de cierre)', openingRestatedCents),
        operating: line('efe-mc:operativas', 'Actividades operativas', operatingCents, 1, operatingChildren.flatMap(c => c.accountIds), operatingChildren),
        investing: line('efe-mc:inversion', 'Actividades de inversión', investingCents, 1, Array.from(investIds)),
        financing: line('efe-mc:financiacion', 'Actividades de financiación', financingCents, 1, Array.from(finIds)),
        unclassified: line('efe-mc:sin-clasificar', 'Flujos sin clasificación (regularizar)', unclassifiedCents, 1, Array.from(unclIds)),
        netChange: line('efe-mc:variacion', 'Variación neta (flujos + REI)', netChangeCents),
        closingCash: line('efe-mc:final', 'Efectivo al cierre (moneda de cierre)', closingCashNominalCents),
        nonMonetaryDisclosures: [reiLine],
    }

    // Indirecto reexpresado
    const adjustmentsCents = -nonCashInvFinCents
    const opIndCents = resultCents - wcAssetCents - wcLiabCents + adjustmentsCents + unclassifiedCents
    const indChildren: ReportLine[] = [
        line('efe-mc:ind:resultado', 'Resultado del ejercicio (reexpresado)', resultCents, 2, Array.from(resultIds)),
        line('efe-mc:ind:ajustes', 'Partidas devengadas sin efecto en el efectivo (reexpresadas)', adjustmentsCents, 2),
        line('efe-mc:ind:wca', 'Variación de activos operativos (reexpresada)', -wcAssetCents, 2, Array.from(wcAIds)),
        line('efe-mc:ind:wcl', 'Variación de pasivos operativos (reexpresada)', -wcLiabCents, 2, Array.from(wcLIds)),
    ]

    const indirect: CashFlowStatement2B = {
        method: 'INDIRECT',
        openingCash: direct.openingCash,
        operating: line('efe-mc:operativas-ind', 'Actividades operativas (método indirecto)', opIndCents, 1, indChildren.flatMap(c => c.accountIds), indChildren),
        investing: direct.investing,
        financing: direct.financing,
        unclassified: direct.unclassified,
        netChange: line('efe-mc:variacion-ind', 'Variación neta (flujos + REI)', opIndCents + investingCents + financingCents + unclassifiedCents + reiCents),
        closingCash: direct.closingCash,
        nonMonetaryDisclosures: [reiLine],
    }

    // Verificación directo = indirecto en la porción de flujos operativos
    if (toCents(direct.operating.amount) !== toCents(indirect.operating.amount)) {
        blockers.push(`EFE moneda de cierre: método directo (${direct.operating.amount}) ≠ indirecto (${indirect.operating.amount}) en actividades operativas.`)
    }

    return { direct, indirect, blockers }
}
