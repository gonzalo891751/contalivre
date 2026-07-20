/**
 * Cuadro de moneda extranjera — Fase 2E (§12) / Fase 2F (§11).
 *
 * Función PURA: cuentas con metadata estructural de moneda distinta de la de
 * curso legal (ARS). El detalle operativo del módulo de moneda extranjera
 * (cantidad, cotización, fuente, fecha, tipo) ENRIQUECE la nota cuando existe,
 * pero la fuente del saldo es SIEMPRE el Diario: la medición implícita
 * (cantidad × cotización) se compara con la medición contable y cualquier
 * diferencia se EXPONE (no se oculta ni se lee DolarAPI como autoridad
 * normativa automática). Sin detalle operativo, cantidad y cotización quedan
 * como "información insuficiente".
 */

import { toCents } from '../../accounting/domain/money'
import type {
    ForeignCurrencyDetail,
    ForeignCurrencyDisclosure,
    ForeignCurrencyRow,
    NormalizedTrialBalance,
    ReportingInput,
} from '../domain/types'

const LEGAL_CURRENCY = 'ARS'

export function buildForeignCurrency(
    input: ReportingInput,
    tb: NormalizedTrialBalance
): ForeignCurrencyDisclosure {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const detailByAccount = new Map<string, ForeignCurrencyDetail>(
        (input.foreignCurrencyDetails ?? []).map(d => [d.ledgerAccountId, d]))
    const rows: ForeignCurrencyRow[] = []

    const compByAccount = new Map<string, number>()
    if (input.comparative) {
        for (const r of input.comparative.trialBalance.rows) compByAccount.set(r.accountId, toCents(r.closing))
    }

    let anyUnreconciled = false
    let anyDetail = false

    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        if (!account?.currency || account.currency === LEGAL_CURRENCY) continue
        if (toCents(row.closing) === 0 && !compByAccount.get(row.accountId)) continue

        const side: ForeignCurrencyRow['side'] =
            account.kind === 'ASSET' ? 'ASSET' : account.kind === 'LIABILITY' ? 'LIABILITY' : 'OTHER'
        const sign = side === 'LIABILITY' ? -1 : 1
        const comp = compByAccount.get(row.accountId)
        const measurement = sign * row.closing

        const detail = detailByAccount.get(row.accountId)
        let quantityStatus: ForeignCurrencyRow['quantityStatus'] = 'INSUFFICIENT_INFORMATION'
        let quantity: number | undefined
        let rate: number | undefined
        let impliedMeasurement: number | undefined
        let reconciliationDifference: number | undefined

        if (detail && detail.currency === account.currency) {
            anyDetail = true
            quantityStatus = 'CALCULATED'
            quantity = detail.quantity
            rate = detail.rate
            impliedMeasurement = Math.round(detail.quantity * detail.rate * 100) / 100
            reconciliationDifference = Math.round((measurement - impliedMeasurement) * 100) / 100
            if (toCents(reconciliationDifference) !== 0) anyUnreconciled = true
        }

        rows.push({
            accountId: row.accountId,
            code: account.code,
            name: account.name,
            currency: account.currency,
            side,
            monetary: account.monetaryClassification ?? 'MONETARY',
            measurement,
            comparativeMeasurement: input.comparative ? sign * ((comp ?? 0) / 100) : undefined,
            quantityStatus,
            quantity,
            rate,
            rateType: detail?.rateType,
            rateSource: detail?.rateSource,
            rateDate: detail?.rateDate,
            impliedMeasurement,
            reconciliationDifference,
            statementLineId: side === 'LIABILITY' ? 'esp:pasivo' : 'esp:activo',
        })
    }

    rows.sort((a, b) => a.code.localeCompare(b.code))

    const applicable = rows.length > 0
    const note = !applicable
        ? 'No hay cuentas con metadata de moneda extranjera con saldo en el ejercicio.'
        : anyDetail
            ? (anyUnreconciled
                ? 'El detalle operativo (cantidad y cotización utilizada) enriquece la nota. Hay diferencias entre la medición contable del Diario (fuente del saldo) y la implícita del módulo: se exponen en la columna Diferencia; ninguna partida se oculta.'
                : 'El detalle operativo (cantidad, cotización utilizada, fuente y fecha) reconcilia con la medición contable del Diario en todas las cuentas.')
            : 'Cantidades y cotizaciones por cuenta: información insuficiente (sin detalle operativo cargado). '
            + 'La medición corresponde al saldo del libro en moneda de curso legal. '
            + 'No se utiliza una cotización automática sin identificación de fuente y fecha.'

    return { applicable, rows, note, reconciled: applicable && anyDetail && !anyUnreconciled }
}
