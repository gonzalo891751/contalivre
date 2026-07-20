/**
 * Cuadro de moneda extranjera — Fase 2E (§12).
 *
 * Función PURA: cuentas con metadata estructural de moneda distinta de la de
 * curso legal (ARS). Sin datos estructurados de cantidad y cotización por
 * cuenta, esas columnas se declaran INSUFFICIENT_INFORMATION (no se estima
 * con una fuente automática como DolarAPI sin aclaración normativa). La
 * medición contable es el saldo del libro; el linaje apunta a la cuenta.
 */

import { toCents } from '../../accounting/domain/money'
import type {
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
    const rows: ForeignCurrencyRow[] = []

    const compByAccount = new Map<string, number>()
    if (input.comparative) {
        for (const r of input.comparative.trialBalance.rows) compByAccount.set(r.accountId, toCents(r.closing))
    }

    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        if (!account?.currency || account.currency === LEGAL_CURRENCY) continue
        if (toCents(row.closing) === 0 && !compByAccount.get(row.accountId)) continue

        const side: ForeignCurrencyRow['side'] =
            account.kind === 'ASSET' ? 'ASSET' : account.kind === 'LIABILITY' ? 'LIABILITY' : 'OTHER'
        const sign = side === 'LIABILITY' ? -1 : 1
        const comp = compByAccount.get(row.accountId)

        rows.push({
            accountId: row.accountId,
            code: account.code,
            name: account.name,
            currency: account.currency,
            side,
            monetary: account.monetaryClassification ?? 'MONETARY',
            measurement: sign * row.closing,
            comparativeMeasurement: input.comparative ? sign * ((comp ?? 0) / 100) : undefined,
            quantityStatus: 'INSUFFICIENT_INFORMATION',
            statementLineId: side === 'LIABILITY' ? 'esp:pasivo' : 'esp:activo',
        })
    }

    rows.sort((a, b) => a.code.localeCompare(b.code))

    return {
        applicable: rows.length > 0,
        rows,
        note: rows.length > 0
            ? 'Cantidades y cotizaciones por cuenta: información insuficiente (sin datos estructurados). '
            + 'La medición contable corresponde al saldo del libro en moneda de curso legal. '
            + 'No se utiliza una cotización automática sin identificación de fuente y fecha.'
            : 'No hay cuentas con metadata de moneda extranjera con saldo en el ejercicio.',
    }
}
