/**
 * Conector del módulo de moneda extranjera → reporting (Fase 2F §11).
 *
 * Normaliza las posiciones operativas (FxAccount + FxMovement) en
 * ForeignCurrencyDetail para enriquecer la nota. NO es la fuente del saldo:
 * el Diario lo es; esto solo aporta cantidad y la cotización efectivamente
 * utilizada. Se computa la posición en moneda extranjera como saldo de
 * apertura + Σ de movimientos con signo estructural por tipo, y la cotización
 * como la del último movimiento (o la de apertura si no hay movimientos).
 */

import { db } from '../storage/db'
import type { FxMovementType } from '../core/monedaExtranjera/types'
import type { ForeignCurrencyDetail } from './domain/types'

/** Signo del movimiento sobre la posición en moneda extranjera de la cuenta origen */
const POSITION_SIGN: Record<FxMovementType, number> = {
    COMPRA: +1, INGRESO: +1, TOMA_DEUDA: +1, DESEMBOLSO_DEUDA: +1, DEVENGO_INTERES: +1, REVALUACION_DEUDA: +1,
    VENTA: -1, EGRESO: -1, PAGO_DEUDA: -1,
    TRANSFERENCIA: -1, // sale de la cuenta origen (entra en la target, tratada aparte)
    AJUSTE: +1,
}

export async function loadForeignCurrencyDetails(periodEnd: string): Promise<ForeignCurrencyDetail[]> {
    const [accounts, movements] = await Promise.all([
        db.fxAccounts.toArray(),
        db.fxMovements.toArray(),
    ])
    const linked = accounts.filter(a => a.accountId && a.currency !== 'ARS')
    if (linked.length === 0) return []

    const inPeriod = movements
        .filter(m => m.date <= periodEnd)
        .sort((a, b) => a.date.localeCompare(b.date))

    const details: ForeignCurrencyDetail[] = []
    for (const acc of linked) {
        let quantity = acc.openingBalance || 0
        let rate = acc.openingRate || 0
        let rateType: string | undefined
        let rateSource: string | undefined
        let rateDate: string | undefined = acc.openingDate

        for (const m of inPeriod) {
            const affectsSource = m.accountId === acc.id
            const affectsTarget = m.targetAccountId === acc.id
            if (!affectsSource && !affectsTarget) continue
            if (affectsSource) quantity += (POSITION_SIGN[m.type] ?? 0) * m.amount
            if (affectsTarget) quantity += m.amount // recibe en transferencia
            // la cotización utilizada = la del último movimiento que toca la cuenta
            rate = m.rate
            rateType = m.rateType
            rateSource = m.rateSource
            rateDate = m.date
        }

        details.push({
            ledgerAccountId: acc.accountId!,
            currency: acc.currency,
            quantity: Math.round(quantity * 100) / 100,
            rate,
            rateType,
            rateSource,
            rateDate,
        })
    }
    return details
}
