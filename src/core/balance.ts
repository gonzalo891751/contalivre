import type { Account, Ledger, TrialBalance, TrialBalanceRow } from './models'
import {
    buildAccountHierarchy,
    computeRollupTotals,
    defaultPresentationPredicate,
    getDirectTotalsFromLedger,
    getPresentationAccountId,
    type PresentationPredicate,
} from './ledger/rollupBalances'

const TOLERANCE = 0.01

/**
 * Calcula el Balance de Sumas y Saldos a partir del libro mayor
 * 
 * El balance muestra:
 * - Sumas: total de débitos y créditos por cuenta
 * - Saldos: saldo deudor o acreedor por cuenta
 * 
 * Los totales de sumas deben coincidir (DEBE = HABER)
 * Los totales de saldos deben coincidir (Saldo Deudor = Saldo Acreedor)
 */
export function computeTrialBalance(ledger: Ledger, accounts: Account[]): TrialBalance {
    const rows: TrialBalanceRow[] = []

    let totalSumDebit = 0
    let totalSumCredit = 0
    let totalBalanceDebit = 0
    let totalBalanceCredit = 0

    // Ordenar cuentas por código
    const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code))

    for (const account of sortedAccounts) {
        // Skip header accounts
        if (account.isHeader) continue

        const ledgerAccount = ledger.get(account.id)

        const sumDebit = ledgerAccount?.totalDebit ?? 0
        const sumCredit = ledgerAccount?.totalCredit ?? 0

        // Solo incluir cuentas con movimientos
        if (sumDebit === 0 && sumCredit === 0) continue

        // Calcular saldo (va a saldo deudor o acreedor según diferencia)
        const diff = sumDebit - sumCredit
        const balanceDebit = diff > 0 ? diff : 0
        const balanceCredit = diff < 0 ? Math.abs(diff) : 0

        rows.push({
            account,
            sumDebit,
            sumCredit,
            balanceDebit,
            balanceCredit,
        })

        totalSumDebit += sumDebit
        totalSumCredit += sumCredit
        totalBalanceDebit += balanceDebit
        totalBalanceCredit += balanceCredit
    }

    // Redondear totales
    totalSumDebit = Math.round(totalSumDebit * 100) / 100
    totalSumCredit = Math.round(totalSumCredit * 100) / 100
    totalBalanceDebit = Math.round(totalBalanceDebit * 100) / 100
    totalBalanceCredit = Math.round(totalBalanceCredit * 100) / 100

    // Verificar si cuadra
    const sumsBalanced = Math.abs(totalSumDebit - totalSumCredit) <= TOLERANCE
    const balancesBalanced = Math.abs(totalBalanceDebit - totalBalanceCredit) <= TOLERANCE
    const isBalanced = sumsBalanced && balancesBalanced

    return {
        rows,
        totalSumDebit,
        totalSumCredit,
        totalBalanceDebit,
        totalBalanceCredit,
        isBalanced,
    }
}

/**
 * Calcula el Balance de Sumas y Saldos con roll-up jerarquico
 *
 * - Suma movimientos de subcuentas en sus cuentas madre
 * - Filtra a cuentas de presentacion (default: parent header)
 */
export function computeRollupTrialBalance(
    ledger: Ledger,
    accounts: Account[],
    options: { presentationPredicate?: PresentationPredicate } = {}
): TrialBalance {
    const rows: TrialBalanceRow[] = []

    let totalSumDebit = 0
    let totalSumCredit = 0
    let totalBalanceDebit = 0
    let totalBalanceCredit = 0

    const hierarchy = buildAccountHierarchy(accounts)
    const directTotals = getDirectTotalsFromLedger(ledger)
    const rollupTotals = computeRollupTotals(accounts, directTotals, hierarchy)
    const predicate = options.presentationPredicate ?? defaultPresentationPredicate

    // Ordenar cuentas por codigo
    const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code))

    for (const account of sortedAccounts) {
        // Skip header accounts
        if (account.isHeader) continue

        const presentationId = getPresentationAccountId(account.id, hierarchy, predicate)
        if (presentationId !== account.id) continue

        const rollup = rollupTotals.get(account.id)
        if (!rollup) continue

        const sumDebit = rollup.totalDebit
        const sumCredit = rollup.totalCredit

        if (sumDebit === 0 && sumCredit === 0) continue

        const diff = sumDebit - sumCredit
        const balanceDebit = diff > 0 ? diff : 0
        const balanceCredit = diff < 0 ? Math.abs(diff) : 0

        rows.push({
            account,
            sumDebit,
            sumCredit,
            balanceDebit,
            balanceCredit,
        })

        totalSumDebit += sumDebit
        totalSumCredit += sumCredit
        totalBalanceDebit += balanceDebit
        totalBalanceCredit += balanceCredit
    }

    totalSumDebit = Math.round(totalSumDebit * 100) / 100
    totalSumCredit = Math.round(totalSumCredit * 100) / 100
    totalBalanceDebit = Math.round(totalBalanceDebit * 100) / 100
    totalBalanceCredit = Math.round(totalBalanceCredit * 100) / 100

    const sumsBalanced = Math.abs(totalSumDebit - totalSumCredit) <= TOLERANCE
    const balancesBalanced = Math.abs(totalBalanceDebit - totalBalanceCredit) <= TOLERANCE
    const isBalanced = sumsBalanced && balancesBalanced

    return {
        rows,
        totalSumDebit,
        totalSumCredit,
        totalBalanceDebit,
        totalBalanceCredit,
        isBalanced,
    }
}

/**
 * Genera un mensaje explicativo sobre el estado del balance
 */
export function getBalanceStatusMessage(trialBalance: TrialBalance): string {
    if (trialBalance.isBalanced) {
        return '✓ El balance cuadra perfectamente. Los totales de Debe y Haber coinciden.'
    }

    const sumDiff = trialBalance.totalSumDebit - trialBalance.totalSumCredit
    const balanceDiff = trialBalance.totalBalanceDebit - trialBalance.totalBalanceCredit

    const messages: string[] = []

    if (Math.abs(sumDiff) > TOLERANCE) {
        messages.push(
            `Las sumas no cuadran: diferencia de $${Math.abs(sumDiff).toFixed(2)} ` +
            `(${sumDiff > 0 ? 'más Debe' : 'más Haber'})`
        )
    }

    if (Math.abs(balanceDiff) > TOLERANCE) {
        messages.push(
            `Los saldos no cuadran: diferencia de $${Math.abs(balanceDiff).toFixed(2)} ` +
            `(${balanceDiff > 0 ? 'más Deudor' : 'más Acreedor'})`
        )
    }

    return '✗ ' + messages.join('. ')
}
