/**
 * Selectores canónicos sobre el ReportingBundle — Fase 2D (§8).
 * Derivan cifras puntuales (p.ej. disponibilidades) desde el MISMO bundle del
 * motor, con la MISMA regla de clasificación que usan los estados/indicadores.
 * No recalculan estados: leen el balance normalizado ya construido.
 */

import { toCents } from '../accounting/domain/money'
import { isCashAccount } from './engine/buildCashFlow'
import type { Account } from '../core/models'
import type { ReportingBundle } from './loadReportingBundle'

/** ¿El plan tiene alguna cuenta de caja/bancos/equivalentes? */
export function hasCashAccounts(accounts: Account[]): boolean {
    return accounts.some(a => isCashAccount(a))
}

/** Disponibilidades (caja, bancos y equivalentes) al cierre del ejercicio. */
export function cashAndEquivalents(bundle: ReportingBundle, accounts: Account[]): number {
    const byId = new Map(accounts.map(a => [a.id, a]))
    let cents = 0
    for (const row of bundle.statements.trialBalance.rows) {
        if (isCashAccount(byId.get(row.accountId))) cents += toCents(row.closing)
    }
    return cents / 100
}
