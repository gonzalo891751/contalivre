import type { Account, JournalEntry, Ledger, LedgerAccount, LedgerMovement } from './models'

/**
 * Crea un libro mayor vacío
 */
export function createEmptyLedger(): Ledger {
    return new Map()
}

/**
 * Inicializa una cuenta en el mayor si no existe
 */
function ensureAccountInLedger(ledger: Ledger, account: Account): void {
    if (!ledger.has(account.id)) {
        ledger.set(account.id, {
            account,
            movements: [],
            totalDebit: 0,
            totalCredit: 0,
            balance: 0,
        })
    }
}

/**
 * Calcula el saldo de una cuenta según su lado natural (normalSide)
 * 
 * - Cuentas con normalSide DEBIT: saldo = debit - credit
 * - Cuentas con normalSide CREDIT: saldo = credit - debit
 * - Contra-cuentas (isContra): comportamiento normal, pero se neetan en estados
 */
export function calculateBalance(account: Account, totalDebit: number, totalCredit: number): number {
    // Use normalSide if available, otherwise infer from kind
    const normalSide = account.normalSide ||
        (['ASSET', 'EXPENSE'].includes(account.kind) ? 'DEBIT' : 'CREDIT')

    if (normalSide === 'DEBIT') {
        return totalDebit - totalCredit
    } else {
        return totalCredit - totalDebit
    }
}

/**
 * Mayoriza un asiento: agrega los movimientos al libro mayor
 * Retorna el mayor actualizado (nueva instancia)
 */
export function postEntryToLedger(
    entry: JournalEntry,
    ledger: Ledger,
    accounts: Account[]
): Ledger {
    // Crear copia del ledger
    const newLedger: Ledger = new Map(ledger)

    // Procesar cada línea del asiento
    for (const line of entry.lines) {
        const account = accounts.find((a) => a.id === line.accountId)
        if (!account) continue

        ensureAccountInLedger(newLedger, account)
        const ledgerAccount = newLedger.get(account.id)!

        // Actualizar totales
        ledgerAccount.totalDebit += line.debit || 0
        ledgerAccount.totalCredit += line.credit || 0

        // Calcular saldo actual
        const newBalance = calculateBalance(
            account,
            ledgerAccount.totalDebit,
            ledgerAccount.totalCredit
        )

        // Crear movimiento
        const movement: LedgerMovement = {
            entryId: entry.id,
            date: entry.date,
            memo: entry.memo,
            debit: line.debit || 0,
            credit: line.credit || 0,
            balance: newBalance,
            description: line.description,
        }

        ledgerAccount.movements.push(movement)
        ledgerAccount.balance = newBalance
    }

    return newLedger
}

/**
 * Calcula el libro mayor completo a partir de todos los asientos
 */
export function computeLedger(entries: JournalEntry[], accounts: Account[]): Ledger {
    let ledger = createEmptyLedger()

    // Inicializar todas las cuentas (aunque no tengan movimientos)
    for (const account of accounts) {
        ensureAccountInLedger(ledger, account)
    }

    // Ordenar asientos por fecha
    const sortedEntries = [...entries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Mayorizar cada asiento
    for (const entry of sortedEntries) {
        ledger = postEntryToLedger(entry, ledger, accounts)
    }

    return ledger
}

/**
 * Obtiene los movimientos de una cuenta específica
 */
export function getAccountMovements(ledger: Ledger, accountId: string): LedgerAccount | null {
    return ledger.get(accountId) || null
}

/**
 * Obtiene todas las cuentas del mayor con movimientos
 */
export function getActiveAccounts(ledger: Ledger): LedgerAccount[] {
    return Array.from(ledger.values()).filter(
        (la) => la.movements.length > 0 || la.totalDebit > 0 || la.totalCredit > 0
    )
}

/**
 * Obtiene el saldo de una cuenta considerando si es contra-cuenta
 * Para estados contables: las contra-cuentas se muestran con signo negativo
 */
export function getDisplayBalance(account: Account, balance: number): number {
    // Contra accounts are shown as negative in their group
    if (account.isContra) {
        return -Math.abs(balance)
    }
    return Math.abs(balance)
}
