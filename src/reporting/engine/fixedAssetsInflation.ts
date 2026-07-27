/**
 * Anexo de bienes de uso en moneda de cierre — Fase 2F (§12), corregido en 2I.
 *
 * El anexo se reconstruye por LOTES DE ORIGEN, no aplicando el coeficiente del
 * mes de cada asiento (DEF-A09 y DEF-A10):
 *
 * - Cada alta abre un lote con su período y su costo. Una baja consume lotes
 *   por antigüedad, de modo que retira el importe reexpresado que corresponde
 *   al ORIGEN del bien dado de baja. Antes se reexpresaba la baja por el mes en
 *   que ocurrió, como si el bien hubiera nacido ese mes: la resta no cancelaba
 *   la incorporación y el valor de origen al cierre quedaba inflado.
 *
 * - La depreciación acumulada se reexpresa con el mismo coeficiente medio que
 *   el activo que regulariza, identificado por su clase de anexo. Antes se
 *   reexpresaba por la fecha del asiento de amortización, que se registra al
 *   cierre y tiene coeficiente 1: la depreciación quedaba en moneda nominal
 *   contra un activo reexpresado, y el valor residual se sobrevaluaba.
 *
 * Sin índice para un período requerido se BLOQUEA; no se estima con coeficiente 1.
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

/** Lote de incorporación pendiente de consumir por una baja */
interface Lot {
    period: string
    cents: number
}

interface ClassAcc {
    accountIds: Set<string>
    /** lotes de valor de origen, en orden de incorporación */
    lots: Lot[]
    /** depreciación acumulada nominal (positiva) */
    depNominalCents: number
}

/**
 * Consume lotes por antigüedad. Devuelve el importe consumido a valores de
 * origen para poder descontarlo también de la depreciación acumulada.
 */
function consumeLots(lots: Lot[], cents: number): void {
    let pending = cents
    while (pending > 0 && lots.length > 0) {
        const lot = lots[0]
        const take = Math.min(lot.cents, pending)
        lot.cents -= take
        pending -= take
        if (lot.cents === 0) lots.shift()
    }
    // Si la baja excede lo incorporado en el ejercicio (bien de un ejercicio
    // anterior sin apertura registrada) el remanente no tiene lote que
    // consumir: queda expuesto como diferencia en la conciliación del anexo.
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
    // Sin el índice del cierre no hay coeficiente posible para NINGUNA partida:
    // conviene decirlo así y no listar cada período de origen como faltante.
    if (!indexes.get(closePeriod)) missing.add(closePeriod)
    const coef = (period: string): number => {
        const c = getCoefficient(indexes, period, closePeriod)
        if (c === null) { missing.add(period); return 1 }
        return c
    }

    const classes = new Map<string, ClassAcc>()
    const accFor = (cls: string): ClassAcc => {
        let a = classes.get(cls)
        if (!a) { a = { accountIds: new Set(), lots: [], depNominalCents: 0 }; classes.set(cls, a) }
        return a
    }

    /** Aplica un movimiento de PPE al lote/depreciación de su clase */
    const apply = (accountId: string, period: string, netDebitCents: number) => {
        const account = byId.get(accountId)
        if (!account || netDebitCents === 0) return
        const acc = accFor(classOf(accountId))
        acc.accountIds.add(accountId)

        if (account.isContra) {
            // Depreciación acumulada: saldo acreedor positivo
            acc.depNominalCents += -netDebitCents
            return
        }
        if (netDebitCents > 0) {
            acc.lots.push({ period, cents: netDebitCents })
        } else {
            consumeLots(acc.lots, -netDebitCents)
        }
    }

    // Apertura (explícita + formal): un único lote al período de inicio
    for (const [accountId, ob] of input.openingBalances) {
        if (!isPpe(accountId)) continue
        apply(accountId, startPeriod, toCents(ob.debit || 0) - toCents(ob.credit || 0))
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (!(entry.sourceModule === 'closing' && entry.sourceType === 'apertura')) continue
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            apply(l.accountId, startPeriod, toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }

    // Movimientos del ejercicio, en orden cronológico para que las bajas
    // consuman los lotes correctos
    const movements = input.entries
        .filter(e => e.status !== 'DRAFT'
            && !isStructuralClosingEntry(e)
            && !(e.sourceModule === 'closing' && e.sourceType === 'apertura'))
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))

    for (const entry of movements) {
        const period = entry.date.slice(0, 7)
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            apply(l.accountId, period, toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }

    // ── Reexpresión por clase ────────────────────────────────
    const nominalByClass = new Map(annex.rows.map(r => [r.assetClass, r]))
    const rows: FixedAssetsRestatedRow[] = []
    let totGrossN = 0, totGrossR = 0, totDepN = 0, totDepR = 0

    for (const [cls, acc] of classes) {
        const nominal = nominalByClass.get(cls)
        const grossNominalCents = nominal ? toCents(nominal.grossClosing) : 0
        const depNominalCents = nominal ? toCents(nominal.accumDepClosing) : acc.depNominalCents

        // Valor de origen reexpresado: cada lote vivo por el coeficiente de SU período
        let grossRestatedCents = 0
        for (const lot of acc.lots) {
            grossRestatedCents += Math.round(lot.cents * coef(lot.period))
        }

        /**
         * La depreciación acumulada sigue al activo que regulariza: se reexpresa
         * con el coeficiente medio de los bienes vivos de la clase. Cuando la
         * depreciación es proporcional al costo —que es el caso de la línea
         * recta, el método del plan base— esto equivale a calcularla sobre el
         * valor de origen reexpresado.
         */
        const ratio = grossNominalCents !== 0 ? grossRestatedCents / grossNominalCents : 1
        const depRestatedCents = Math.round(depNominalCents * ratio)

        if (grossNominalCents === 0 && depNominalCents === 0 && grossRestatedCents === 0) continue

        rows.push(makeRow(cls, Array.from(acc.accountIds), grossNominalCents, grossRestatedCents, depNominalCents, depRestatedCents))
        totGrossN += grossNominalCents; totGrossR += grossRestatedCents
        totDepN += depNominalCents; totDepR += depRestatedCents
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
