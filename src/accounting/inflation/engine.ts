/**
 * Motor de ajuste por inflación — Fase 2B (§10).
 *
 * Puro (sin Dexie/React). Base normativa declarada: RT 54 texto ordenado
 * por RT 59 y procedimiento de reexpresión en moneda de cierre; el registro
 * de norma/fuente/fecha acompaña al set de índices (indexRegistry).
 *
 * Especificación algebraica del RECPAM (§10.5):
 *   En moneda de cierre, para cada partida NO monetaria con neto (D−C)
 *   n_i anticuado al período p_i:  ajuste_i = n_i × (coef(p_i→cierre) − 1).
 *   La línea balanceante del comprobante de reexpresión es −Σ ajuste_i
 *   (débito = pérdida); expresado como resultado con ganancia positiva:
 *       RECPAM(ganancia +) = Σ_i ajuste_i
 *   (solo capital acreedor reexpresado ⇒ Σ < 0 ⇒ pérdida por mantener
 *   activos monetarios; deudas monetarias generan ganancia). Es la partida
 *   de CONCILIACIÓN posterior a reexpresar partidas no monetarias, PN y
 *   resultados: nunca una suma de posiciones monetarias de fin de mes.
 *
 * Control independiente (§10.6): método directo por exposición
 *       RECPAM_directo(ganancia +) = − Σ_p m_p × (coef(p→cierre) − 1)
 *   con m_p = variación de la posición monetaria neta originada en el
 *   período p (movimientos cronológicos reales). Como por partida doble
 *   m_p = − Σ n_i del mismo período, ambos métodos coinciden exactamente
 *   cuando la anticuación es completa; la igualdad se VERIFICA, no se
 *   fuerza. Si faltan movimientos para el directo se informa
 *   "No verificable por método directo" con el detalle de lo que falta.
 *
 * Índices: sin índice requerido no se calcula ni contabiliza (nunca
 * coeficiente 1, nunca interpolación silenciosa). Orígenes desconocidos
 * (saldos sin anticuación) bloquean el cierre formal y se reportan.
 */

import type { Account, JournalEntry } from '../../core/models'
import { toCents } from '../domain/money'
import { deriveMonetaryClassification } from '../taxonomy/taxonomy'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type { RecpamComputation, RecpamDetailRow, ReexpressedItem } from './types'

const fromCents = (c: number) => c / 100

export function getCoefficient(
    indexes: Map<string, number>,
    originPeriod: string,
    closePeriod: string
): number | null {
    const origin = indexes.get(originPeriod)
    const close = indexes.get(closePeriod)
    if (!origin || !close || origin <= 0) return null
    return close / origin
}

// ─────────────────────────────────────────────────────────────
// Anticuación desde el Diario
// ─────────────────────────────────────────────────────────────

export interface AnticuatedMovement {
    accountId: string
    /** YYYY-MM del asiento de origen */
    originPeriod: string
    /** neto Debe−Haber en el período (cent-exacto) */
    netAmount: number
    entryIds: string[]
}

export interface InflationInput {
    /** asientos del ejercicio que integran los libros (sin DRAFT) */
    entries: JournalEntry[]
    accounts: Account[]
    /** saldos previos SIN anticuación (mecanismo de acumulación legacy) */
    openingBalances: Map<string, { debit: number; credit: number }>
    /** período de cierre YYYY-MM */
    closePeriod: string
    indexes: Map<string, number>
    /** cuenta para el asiento propuesto de RECPAM (mapping explícito) */
    recpamAccountId?: string
}

export interface InflationResult {
    /** partidas no monetarias reexpresadas, con anticuación */
    items: ReexpressedItem[]
    /** ajuste total por cuenta (moneda de cierre − histórico) */
    adjustmentByAccount: Map<string, number>
    recpamIndirect: RecpamComputation
    recpamDirect: RecpamComputation
    /** |directo − indirecto| en centavos (0 = concilian) */
    reconciliationDifference: number
    reconciled: boolean
    /** períodos sin índice: BLOQUEAN el cálculo definitivo */
    missingPeriods: string[]
    /** cuentas no monetarias con saldo sin origen conocido: bloquean cierre formal */
    insufficientOrigins: Array<{ accountId: string; amount: number; reason: string }>
    /** líneas propuestas para el comprobante DRAFT (si hay cuenta RECPAM y no hay bloqueos) */
    proposedVoucherLines: Array<{ accountId: string; debit: number; credit: number; description: string }> | null
    canPost: boolean
    blockers: string[]
}

/** Agrupa los movimientos del Diario por cuenta y mes de origen */
export function anticuateMovements(entries: JournalEntry[]): AnticuatedMovement[] {
    const map = new Map<string, { cents: number; entryIds: Set<string> }>()
    for (const entry of entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        const period = entry.date.slice(0, 7)
        for (const l of entry.lines) {
            const key = `${l.accountId}::${period}`
            const m = map.get(key) ?? { cents: 0, entryIds: new Set<string>() }
            m.cents += toCents(l.debit || 0) - toCents(l.credit || 0)
            m.entryIds.add(entry.id)
            map.set(key, m)
        }
    }
    const result: AnticuatedMovement[] = []
    for (const [key, m] of map) {
        if (m.cents === 0) continue
        const [accountId, originPeriod] = key.split('::')
        result.push({ accountId, originPeriod, netAmount: fromCents(m.cents), entryIds: Array.from(m.entryIds) })
    }
    return result.sort((a, b) => a.originPeriod.localeCompare(b.originPeriod) || a.accountId.localeCompare(b.accountId))
}

// ─────────────────────────────────────────────────────────────
// Pipeline completo
// ─────────────────────────────────────────────────────────────

export function computeInflationAdjustment(input: InflationInput): InflationResult {
    const accountsById = new Map(input.accounts.map(a => [a.id, a]))
    const missing = new Set<string>()
    const insufficientOrigins: InflationResult['insufficientOrigins'] = []
    const blockers: string[] = []

    const isMonetary = (accountId: string): boolean | null => {
        const account = accountsById.get(accountId)
        if (!account) return null
        const cls = deriveMonetaryClassification(account)
        if (cls === 'MONETARY') return true
        if (cls === 'NON_MONETARY') return false
        return null // MIXED / NOT_APPLICABLE: requiere decisión del usuario
    }

    // Saldos de apertura sin anticuación: información insuficiente para no monetarias
    for (const [accountId, ob] of input.openingBalances) {
        const net = fromCents(toCents(ob.debit || 0) - toCents(ob.credit || 0))
        if (toCents(net) === 0) continue
        const monetary = isMonetary(accountId)
        if (monetary === false) {
            insufficientOrigins.push({
                accountId,
                amount: net,
                reason: 'Saldo de apertura sin fecha de origen: no se asigna automáticamente el inicio del ejercicio.',
            })
        } else if (monetary === null) {
            insufficientOrigins.push({
                accountId,
                amount: net,
                reason: 'Cuenta sin clasificación monetaria definida: requiere decisión del usuario.',
            })
        }
    }

    // Anticuación de movimientos del ejercicio
    const movements = anticuateMovements(input.entries)

    const items: ReexpressedItem[] = []
    const adjustmentByAccount = new Map<string, number>()
    const indirectDetail: RecpamDetailRow[] = []
    let indirectAdjustCents = 0 // Σ n_i × (coef − 1) en centavos

    const directDetail: RecpamDetailRow[] = []
    const monetaryByPeriod = new Map<string, number>() // m_p en centavos
    let directComputable = true
    const directMissing: string[] = []

    for (const mov of movements) {
        const monetary = isMonetary(mov.accountId)
        const account = accountsById.get(mov.accountId)

        if (monetary === null) {
            insufficientOrigins.push({
                accountId: mov.accountId,
                amount: mov.netAmount,
                reason: account
                    ? `Cuenta "${account.code} ${account.name}" sin clasificación monetaria definida.`
                    : `Cuenta inexistente (${mov.accountId}).`,
            })
            directComputable = false
            directMissing.push(mov.accountId)
            continue
        }

        if (monetary) {
            monetaryByPeriod.set(mov.originPeriod,
                (monetaryByPeriod.get(mov.originPeriod) ?? 0) + toCents(mov.netAmount))
            continue
        }

        // No monetaria: reexpresar con su anticuación
        const coef = getCoefficient(input.indexes, mov.originPeriod, input.closePeriod)
        if (coef === null) {
            if (!input.indexes.get(mov.originPeriod)) missing.add(mov.originPeriod)
            if (!input.indexes.get(input.closePeriod)) missing.add(input.closePeriod)
            continue
        }
        const historicCents = toCents(mov.netAmount)
        const restatedCents = Math.round(historicCents * coef)
        const adjustCents = restatedCents - historicCents

        items.push({
            accountId: mov.accountId,
            originPeriod: mov.originPeriod,
            historicAmount: mov.netAmount,
            coefficient: coef,
            restatedAmount: fromCents(restatedCents),
            adjustment: fromCents(adjustCents),
        })
        adjustmentByAccount.set(mov.accountId,
            (adjustmentByAccount.get(mov.accountId) ?? 0) + fromCents(adjustCents))
        indirectAdjustCents += adjustCents
        indirectDetail.push({
            period: mov.originPeriod,
            amountAtClose: fromCents(adjustCents),
            description: `${account?.code ?? '?'} ${account?.name ?? mov.accountId}: ${mov.netAmount} × (${coef.toFixed(6)} − 1)`,
        })
    }

    // RECPAM indirecto = partida de conciliación.
    // Σ ajustes (netDC) = Σ n_i×(coef−1); la línea balanceante del
    // comprobante es su opuesto, y como resultado (ganancia +):
    //   recpam = Σ n_i×(coef−1)
    // (ej: solo capital acreedor reexpresado ⇒ Σ negativo ⇒ pérdida ✓)
    const recpamIndirect: RecpamComputation = {
        method: 'INDIRECT',
        recpam: fromCents(indirectAdjustCents),
        detail: indirectDetail,
        warnings: [],
        missingPeriods: Array.from(missing).sort(),
    }

    // RECPAM directo por exposición monetaria cronológica
    let directCents = 0
    for (const [period, mCents] of Array.from(monetaryByPeriod.entries()).sort()) {
        const coef = getCoefficient(input.indexes, period, input.closePeriod)
        if (coef === null) {
            if (!input.indexes.get(period)) missing.add(period)
            continue
        }
        const lossCents = Math.round(mCents * (coef - 1))
        directCents += -lossCents
        directDetail.push({
            period,
            openingMonetaryPosition: fromCents(mCents),
            amountAtClose: fromCents(-lossCents),
            description: `Exposición ${fromCents(mCents)} originada en ${period} × (${coef.toFixed(6)} − 1)`,
        })
    }

    const recpamDirect: RecpamComputation = {
        method: 'DIRECT',
        recpam: fromCents(directCents),
        detail: directDetail,
        warnings: directComputable
            ? []
            : [`No verificable por método directo: faltan clasificar ${Array.from(new Set(directMissing)).join(', ')}`],
        missingPeriods: Array.from(missing).sort(),
    }

    const missingPeriods = Array.from(missing).sort()
    const reconciliationDifference = directComputable
        ? Math.abs(toCents(recpamDirect.recpam) - toCents(recpamIndirect.recpam))
        : NaN
    const reconciled = directComputable && reconciliationDifference === 0

    // Bloqueos
    if (missingPeriods.length > 0) {
        blockers.push(`Faltan índices para: ${missingPeriods.join(', ')}. Sin índice no se calcula, no se contabiliza y no se reemplaza por 1.`)
    }
    if (insufficientOrigins.length > 0) {
        blockers.push(`Hay ${insufficientOrigins.length} partida(s) con origen desconocido o sin clasificación: información insuficiente para el cierre formal.`)
    }
    if (directComputable && !reconciled) {
        blockers.push(`RECPAM directo (${recpamDirect.recpam}) e indirecto (${recpamIndirect.recpam}) no concilian.`)
    }

    // Comprobante propuesto (DRAFT): ajustes por cuenta + RECPAM balanceante
    let proposedVoucherLines: InflationResult['proposedVoucherLines'] = null
    if (blockers.length === 0 && input.recpamAccountId && indirectAdjustCents !== 0) {
        const lines: NonNullable<InflationResult['proposedVoucherLines']> = []
        for (const [accountId, adj] of adjustmentByAccount) {
            const cents = toCents(adj)
            if (cents === 0) continue
            const account = accountsById.get(accountId)
            const description = `Reexpresión RT 54 TO RT 59 — ${account?.name ?? accountId}`
            if (cents > 0) lines.push({ accountId, debit: adj, credit: 0, description })
            else lines.push({ accountId, debit: 0, credit: -adj, description })
        }
        // Línea balanceante: netDC necesario = −Σ ajustes.
        // Positivo ⇒ Débito (pérdida por exposición); negativo ⇒ Haber (ganancia).
        const balancingCents = -indirectAdjustCents
        if (balancingCents > 0) {
            lines.push({ accountId: input.recpamAccountId, debit: fromCents(balancingCents), credit: 0, description: 'RECPAM (pérdida por exposición a la inflación)' })
        } else if (balancingCents < 0) {
            lines.push({ accountId: input.recpamAccountId, debit: 0, credit: fromCents(-balancingCents), description: 'RECPAM (ganancia por exposición a la inflación)' })
        }
        proposedVoucherLines = lines
    }

    return {
        items,
        adjustmentByAccount,
        recpamIndirect,
        recpamDirect,
        reconciliationDifference,
        reconciled,
        missingPeriods,
        insufficientOrigins,
        proposedVoucherLines,
        canPost: blockers.length === 0 && proposedVoucherLines !== null,
        blockers,
    }
}
