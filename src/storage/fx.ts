/**
 * Moneda Extranjera - Storage Layer
 *
 * CRUD operations for the foreign currency module using Dexie/IndexedDB.
 * Includes journal entry generation and reconciliation.
 */

import { db } from './db'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import type {
    FxAccount,
    FxMovement,
    FxDebt,
    FxDebtInstallment,
    FxLiability,
    FxSettings,
    FxAccountMappingKey,
    FxJournalStatus,
    PaymentFrequency,
    LoanSystem,
} from '../core/monedaExtranjera/types'
import {
    createDefaultFxSettings,
    generateFxId,
    DEFAULT_FX_ACCOUNT_CODES,
} from '../core/monedaExtranjera/types'
import { createEntry } from './entries'

// ========================================
// Account Resolution Helpers
// ========================================

const normalizeText = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const ACCOUNT_FALLBACKS: Record<string, { code: string; names: string[] }> = {
    cajaME: { code: '1.1.01.10', names: ['Caja ME', 'Caja Moneda Extranjera', 'Caja USD', 'Caja Dolares'] },
    bancoME: { code: '1.1.01.11', names: ['Banco ME', 'Banco Moneda Extranjera', 'Banco USD'] },
    inversionME: { code: '1.1.05.03', names: ['Inversiones ME', 'Inversiones USD'] },
    pasivoME: { code: '2.1.01.10', names: ['Pasivo ME', 'Deudas ME', 'Prestamos ME', 'Deuda en USD'] },
    diferenciaCambio: { code: '4.6.03', names: ['Diferencia de cambio', 'Diferencias de cambio', 'Resultado por tenencia'] },
    interesesGanados: { code: '4.6.01', names: ['Intereses ganados', 'Intereses cobrados'] },
    interesesPerdidos: { code: '4.6.02', names: ['Intereses perdidos', 'Intereses pagados'] },
    cajaARS: { code: '1.1.01.01', names: ['Caja', 'Caja ARS', 'Caja Pesos', 'Caja moneda nacional'] },
    bancoARS: { code: '1.1.01.02', names: ['Banco', 'Bancos', 'Banco ARS', 'Banco cuenta corriente', 'Banco c/c ARS'] },
    comisionesBancarias: { code: '4.6.04', names: ['Comisiones bancarias', 'Gastos bancarios', 'Comisiones', 'Comisiones y gastos bancarios'] },
}

const resolveAccountByIdOrCode = (accounts: Account[], idOrCode?: string) => {
    if (!idOrCode) return null
    return accounts.find(a => a.id === idOrCode) || accounts.find(a => a.code === idOrCode) || null
}

const resolveAccountId = (
    accounts: Account[],
    options: { mappedId?: string | null; code?: string; names?: string[] }
): string | null => {
    const direct = resolveAccountByIdOrCode(accounts, options.mappedId || undefined)
    if (direct) return direct.id
    if (options.code) {
        const byCode = accounts.find(a => a.code === options.code)
        if (byCode) return byCode.id
    }
    if (options.names && options.names.length > 0) {
        const targets = options.names.map(normalizeText)
        const byName = accounts.find(a => targets.some(t => normalizeText(a.name).includes(t)))
        if (byName) return byName.id
    }
    return null
}

const resolveMappedAccountId = (
    accounts: Account[],
    settings: FxSettings,
    key: FxAccountMappingKey
) => {
    const mappedId = settings.accountMappings?.[key] || null
    const fallback = ACCOUNT_FALLBACKS[key]
    return resolveAccountId(accounts, {
        mappedId,
        code: fallback?.code || DEFAULT_FX_ACCOUNT_CODES[key],
        names: fallback?.names,
    })
}

// ========================================
// FX Debt Helpers
// ========================================

const frequencyToMonths: Record<PaymentFrequency, number> = {
    MENSUAL: 1,
    BIMESTRAL: 2,
    TRIMESTRAL: 3,
    SEMESTRAL: 6,
    ANUAL: 12,
    UNICO: 0,
}

const isValidDate = (value: string) => {
    const time = Date.parse(value)
    return !Number.isNaN(time)
}

const addMonths = (dateISO: string, months: number): string => {
    const base = new Date(dateISO)
    if (Number.isNaN(base.getTime())) {
        return new Date().toISOString().split('T')[0]
    }
    const year = base.getFullYear()
    const month = base.getMonth()
    const day = base.getDate()
    const next = new Date(year, month + months, day)
    return next.toISOString().split('T')[0]
}

function generateFxDebtSchedule(params: {
    principalME: number
    interestRateAnnual: number
    installments: number
    frequency: PaymentFrequency
    system: LoanSystem
    firstDueDate: string
}): FxDebtInstallment[] {
    const { principalME, interestRateAnnual, installments, frequency, system, firstDueDate } = params

    if (installments <= 0 || principalME <= 0) return []
    if (!isValidDate(firstDueDate)) return []

    const monthsPerPeriod = frequencyToMonths[frequency] ?? 1
    const periodsPerYear = monthsPerPeriod > 0 ? Math.max(1, Math.round(12 / monthsPerPeriod)) : 1
    const ratePerPeriod = interestRateAnnual / periodsPerYear

    const schedule: FxDebtInstallment[] = []
    let remaining = principalME

    const round2 = (value: number) => Math.round(value * 100) / 100

    if (system === 'BULLET' || frequency === 'UNICO') {
        const interest = round2(remaining * ratePerPeriod)
        const total = round2(remaining + interest)
        schedule.push({
            number: 1,
            dueDate: firstDueDate,
            capitalME: round2(remaining),
            interestME: interest,
            totalME: total,
            paid: false,
        })
        return schedule
    }

    if (system === 'AMERICANO') {
        const interestOnly = round2(remaining * ratePerPeriod)
        for (let i = 1; i <= installments; i++) {
            const isLast = i === installments
            const capital = isLast ? round2(remaining) : 0
            const interest = interestOnly
            const total = round2(capital + interest)
            schedule.push({
                number: i,
                dueDate: addMonths(firstDueDate, monthsPerPeriod * (i - 1)),
                capitalME: capital,
                interestME: interest,
                totalME: total,
                paid: false,
            })
        }
        return schedule
    }

    if (system === 'ALEMAN') {
        const capitalFixed = round2(principalME / installments)
        for (let i = 1; i <= installments; i++) {
            const interest = round2(remaining * ratePerPeriod)
            const capital = i === installments ? round2(remaining) : capitalFixed
            const total = round2(capital + interest)
            schedule.push({
                number: i,
                dueDate: addMonths(firstDueDate, monthsPerPeriod * (i - 1)),
                capitalME: capital,
                interestME: interest,
                totalME: total,
                paid: false,
            })
            remaining = round2(remaining - capital)
        }
        return schedule
    }

    // FRANCES (cuota fija)
    const rate = ratePerPeriod
    const cuota = rate === 0
        ? round2(principalME / installments)
        : round2((principalME * rate) / (1 - Math.pow(1 + rate, -installments)))

    for (let i = 1; i <= installments; i++) {
        const interest = round2(remaining * rate)
        const capital = round2(cuota - interest)
        const total = round2(capital + interest)
        schedule.push({
            number: i,
            dueDate: addMonths(firstDueDate, monthsPerPeriod * (i - 1)),
            capitalME: capital,
            interestME: interest,
            totalME: total,
            paid: false,
        })
        remaining = round2(remaining - capital)
    }

    return schedule
}

// ========================================
// Settings
// ========================================

/**
 * Load FX settings (creates default if not exists)
 */
export async function loadFxSettings(): Promise<FxSettings> {
    const settings = await db.fxSettings.get('fx-settings')
    if (settings) return settings

    const defaultSettings = createDefaultFxSettings()
    await db.fxSettings.put(defaultSettings)
    return defaultSettings
}

/**
 * Save FX settings
 */
export async function saveFxSettings(settings: FxSettings): Promise<void> {
    settings.lastUpdated = new Date().toISOString()
    await db.fxSettings.put(settings)
}

// ========================================
// FX Accounts
// ========================================

const matchesPeriod = (itemPeriodId: string | undefined, periodId?: string) => {
    if (!periodId) return true
    return !itemPeriodId || itemPeriodId === periodId
}

/**
 * Get all FX accounts
 */
export async function getAllFxAccounts(periodId?: string): Promise<FxAccount[]> {
    const accounts = await db.fxAccounts.toArray()
    return accounts.filter(account => matchesPeriod(account.periodId, periodId))
}

/**
 * Get FX accounts by type
 */
export async function getFxAccountsByType(type: 'ASSET' | 'LIABILITY', periodId?: string): Promise<FxAccount[]> {
    const accounts = await db.fxAccounts.where('type').equals(type).toArray()
    return accounts.filter(account => matchesPeriod(account.periodId, periodId))
}

/**
 * Get FX account by ID
 */
export async function getFxAccountById(id: string): Promise<FxAccount | undefined> {
    return db.fxAccounts.get(id)
}

/**
 * Create FX account
 */
export async function createFxAccount(
    account: Omit<FxAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FxAccount> {
    const now = new Date().toISOString()
    const newAccount: FxAccount = {
        ...account,
        id: generateFxId('fxa'),
        createdAt: now,
        updatedAt: now,
    }
    await db.fxAccounts.add(newAccount)
    return newAccount
}

/**
 * Update FX account
 */
export async function updateFxAccount(
    id: string,
    updates: Partial<FxAccount>
): Promise<void> {
    await db.fxAccounts.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Delete FX account (only if no movements)
 */
export async function deleteFxAccount(id: string): Promise<{ success: boolean; error?: string }> {
    const movements = await db.fxMovements.where('accountId').equals(id).count()
    if (movements > 0) {
        return {
            success: false,
            error: 'No se puede eliminar la cuenta porque tiene movimientos registrados.',
        }
    }
    await db.fxAccounts.delete(id)
    return { success: true }
}

// ========================================
// FX Movements
// ========================================

/**
 * Get all FX movements
 */
export async function getAllFxMovements(periodId?: string): Promise<FxMovement[]> {
    const movements = await db.fxMovements.orderBy('date').reverse().toArray()
    return movements.filter(m => matchesPeriod(m.periodId, periodId))
}

/**
 * Get movements by account
 */
export async function getFxMovementsByAccount(accountId: string, periodId?: string): Promise<FxMovement[]> {
    const movements = await db.fxMovements.where('accountId').equals(accountId).sortBy('date')
    return movements.filter(m => matchesPeriod(m.periodId, periodId))
}

/**
 * Result of journal entry preview/build
 */
export interface FxJournalPreview {
    entries: Omit<JournalEntry, 'id'>[]
    lines: {
        accountId: string
        accountCode?: string
        accountName?: string
        debit: number
        credit: number
        description: string
    }[]
    totalDebit: number
    totalCredit: number
    isBalanced: boolean
    costoARS?: number // For sales: FIFO cost
    resultadoARS?: number // For sales: gain/loss
    error?: string
}

/**
 * Build journal entries for a movement (with preview data)
 */
async function buildJournalEntriesForFxMovement(
    movement: FxMovement,
    fxAccount?: FxAccount,
    _options?: { preview?: boolean }
): Promise<FxJournalPreview> {
    const accounts = await db.accounts.toArray()
    const accountMap = new Map(accounts.map(a => [a.id, a]))
    const settings = await loadFxSettings()

    if (!fxAccount) {
        fxAccount = await getFxAccountById(movement.accountId)
    }
    if (!fxAccount) {
        return {
            entries: [],
            lines: [],
            totalDebit: 0,
            totalCredit: 0,
            isBalanced: true,
            error: 'Cuenta FX no encontrada',
        }
    }

    // === RESOLVE ACCOUNTS ===
    const isDebtDisbursement = movement.type === 'TOMA_DEUDA' || movement.type === 'DESEMBOLSO_DEUDA'
    if (isDebtDisbursement && fxAccount.type !== 'LIABILITY') {
        return {
            entries: [],
            lines: [],
            totalDebit: 0,
            totalCredit: 0,
            isBalanced: true,
            error: 'La cuenta origen de la deuda debe ser un pasivo ME.',
        }
    }

    // 1. ME Account: MUST be fxAccount.accountId (the linked ledger account)
    const meAccountId = fxAccount.accountId
    if (!meAccountId && !isDebtDisbursement) {
        return {
            entries: [],
            lines: [],
            totalDebit: 0,
            totalCredit: 0,
            isBalanced: true,
            error: `La cartera "${fxAccount.name}" no tiene cuenta contable asociada. Configúrala primero.`,
        }
    }

    // 2. Contrapartida ARS: Use movement's selection, or fallback to settings
    const contrapartidaId = movement.contrapartidaAccountId
        || resolveMappedAccountId(accounts, settings, 'bancoARS')
        || resolveMappedAccountId(accounts, settings, 'cajaARS')

    // 3. Comisiones account
    const comisionId = movement.comisionAccountId
        || resolveMappedAccountId(accounts, settings, 'comisionesBancarias')

    // 4. Diferencia de cambio account
    const difCambioId = resolveMappedAccountId(accounts, settings, 'diferenciaCambio')

    // 5. Intereses account
    const interesesId = resolveMappedAccountId(accounts, settings, 'interesesPerdidos')

    // 6. Debt disbursement accounts (liability + asset target)
    let debtLiabilityAccountId: string | null = null
    let debtAssetAccountId: string | null = null
    let debtAssetFxAccount: FxAccount | undefined

    if (isDebtDisbursement) {
        debtLiabilityAccountId = meAccountId || null
        if (movement.targetAccountId) {
            debtAssetFxAccount = await getFxAccountById(movement.targetAccountId)
            debtAssetAccountId = debtAssetFxAccount?.accountId || null
        }
    }

    // Validate required accounts
    const missing: string[] = []
    if (isDebtDisbursement) {
        if (!debtAssetAccountId) missing.push('Cuenta Activo ME')
        if (!debtLiabilityAccountId) missing.push('Cuenta Pasivo ME')
    } else {
        if (!meAccountId) missing.push('Cuenta ME')
        if ((movement.type === 'COMPRA' || movement.type === 'VENTA' || movement.type === 'PAGO_DEUDA') && !contrapartidaId) {
            missing.push('Contrapartida ARS')
        }
        if ((movement.comisionARS || 0) > 0 && !comisionId) {
            missing.push('Cuenta de Comisiones')
        }
    }

    if (missing.length > 0) {
        return {
            entries: [],
            lines: [],
            totalDebit: 0,
            totalCredit: 0,
            isBalanced: true,
            error: `Faltan cuentas contables: ${missing.join(', ')}`,
        }
    }

    // === BUILD ENTRY LINES ===
    const entryLines: EntryLine[] = []
    const createdAt = new Date().toISOString()
    let memo = ''
    let journalRole = ''
    let costoARS: number | undefined
    let resultadoARS: number | undefined

    const arsAmount = movement.arsAmount // amount * rate
    const comisionARS = movement.comisionARS || 0

    // Helper to add line
    const addLine = (accountId: string, debit: number, credit: number, description: string) => {
        if (debit > 0 || credit > 0) {
            entryLines.push({ accountId, debit, credit, description })
        }
    }

    // === TOMA/DESEMBOLSO DEUDA: Debit Activo ME, Credit Pasivo ME ===
    if (isDebtDisbursement) {
        const label = movement.type === 'TOMA_DEUDA' ? 'Toma deuda' : 'Desembolso deuda'
        addLine(debtAssetAccountId!, arsAmount, 0, `${label} ${movement.amount} ${movement.currency}`)
        addLine(debtLiabilityAccountId!, 0, arsAmount, `${label} ${movement.amount} ${movement.currency}`)

        memo = `${label} ${movement.amount} ${movement.currency} - ${debtAssetFxAccount?.name || 'Activo ME'}`
        journalRole = movement.type === 'TOMA_DEUDA' ? 'FX_DEBT_OPEN' : 'FX_DEBT_DISB'
    }

    // === COMPRA: Debit ME, Debit Comision (if any), Credit Contrapartida ===
    if (movement.type === 'COMPRA') {
        const totalEgreso = arsAmount + comisionARS

        addLine(meAccountId!, arsAmount, 0, `Compra ${movement.amount} ${movement.currency} @ ${movement.rate}`)
        if (comisionARS > 0 && comisionId) {
            addLine(comisionId, comisionARS, 0, 'Comisión operación')
        }
        addLine(contrapartidaId!, 0, totalEgreso, 'Egreso ARS')

        memo = `Compra ${movement.amount} ${movement.currency} - ${fxAccount.name}`
        journalRole = 'FX_BUY'
    }

    // === VENTA: Debit Contrapartida, Credit ME (at cost), Result +/- ===
    if (movement.type === 'VENTA') {
        // For sales, we need to calculate FIFO cost
        costoARS = movement.costoARS
        if (costoARS === undefined) {
            // Calculate FIFO cost if not provided
            const fifoResult = await calculateFIFOCost(movement.accountId, movement.amount, movement.periodId, movement.date)
            costoARS = fifoResult.totalCost
        }

        const producidoNeto = arsAmount - comisionARS // What you actually receive
        resultadoARS = producidoNeto - costoARS // Gain if positive, loss if negative

        // Entry lines:
        // D: Contrapartida (neto recibido)
        // D: Comisión (si hay)
        // C: Cuenta ME (al costo FIFO)
        // D/C: Diferencia de cambio (resultado)

        addLine(contrapartidaId!, producidoNeto, 0, `Ingreso neto ARS (${movement.amount} ${movement.currency} @ ${movement.rate})`)
        if (comisionARS > 0 && comisionId) {
            addLine(comisionId, comisionARS, 0, 'Comisión operación')
        }
        addLine(meAccountId!, 0, costoARS, `Venta ${movement.amount} ${movement.currency} (costo)`)

        if (resultadoARS !== 0 && difCambioId) {
            if (resultadoARS > 0) {
                // Ganancia: Credit diferencia de cambio
                addLine(difCambioId, 0, resultadoARS, 'Ganancia por diferencia de cambio')
            } else {
                // Pérdida: Debit diferencia de cambio
                addLine(difCambioId, Math.abs(resultadoARS), 0, 'Pérdida por diferencia de cambio')
            }
        }

        memo = `Venta ${movement.amount} ${movement.currency} - ${fxAccount.name}`
        journalRole = 'FX_SELL'
    }

    // === INGRESO: Debit ME, Credit Diferencia de cambio ===
    if (movement.type === 'INGRESO') {
        addLine(meAccountId!, arsAmount, 0, `Ingreso ${movement.amount} ${movement.currency}`)
        if (difCambioId) {
            addLine(difCambioId, 0, arsAmount, 'Ajuste/Ingreso')
        }
        memo = `Ingreso ${movement.currency} - ${fxAccount.name}`
        journalRole = 'FX_INCOME'
    }

    // === EGRESO: Debit Diferencia de cambio, Credit ME ===
    if (movement.type === 'EGRESO') {
        if (difCambioId) {
            addLine(difCambioId, arsAmount, 0, 'Ajuste/Egreso')
        }
        addLine(meAccountId!, 0, arsAmount, `Egreso ${movement.amount} ${movement.currency}`)
        memo = `Egreso ${movement.currency} - ${fxAccount.name}`
        journalRole = 'FX_EXPENSE'
    }

    // === TRANSFERENCIA: Debit target ME, Credit source ME ===
    if (movement.type === 'TRANSFERENCIA' && movement.targetAccountId) {
        const targetAccount = await getFxAccountById(movement.targetAccountId)
        const targetMeId = targetAccount?.accountId

        if (targetMeId) {
            addLine(targetMeId, arsAmount, 0, `Ingreso ${movement.amount} ${movement.currency}`)
            addLine(meAccountId!, 0, arsAmount, `Egreso ${movement.amount} ${movement.currency}`)
            memo = `Transferencia ${movement.currency} - ${fxAccount.name} -> ${targetAccount?.name}`
            journalRole = 'FX_TRANSFER'
        } else {
            return {
                entries: [],
                lines: [],
                totalDebit: 0,
                totalCredit: 0,
                isBalanced: true,
                error: `La cartera destino "${targetAccount?.name}" no tiene cuenta contable asociada.`,
            }
        }
    }

    // === PAGO_DEUDA: Debit Pasivo + Intereses, Credit Contrapartida ===
    if (movement.type === 'PAGO_DEUDA' && fxAccount.type === 'LIABILITY') {
        const capitalME = movement.capitalAmount || movement.amount
        const interestARS = movement.interestARS || 0
        const capitalARS = capitalME * movement.rate
        const totalARS = capitalARS + interestARS + comisionARS

        addLine(meAccountId!, capitalARS, 0, `Pago capital ${capitalME} ${movement.currency}`)
        if (interestARS > 0 && interesesId) {
            addLine(interesesId, interestARS, 0, 'Intereses')
        }
        if (comisionARS > 0 && comisionId) {
            addLine(comisionId, comisionARS, 0, 'Comisión')
        }
        addLine(contrapartidaId!, 0, totalARS, 'Egreso ARS')

        memo = `Pago deuda ${movement.currency} - ${fxAccount.creditor || fxAccount.name}`
        journalRole = 'FX_PAYMENT'
    }

    // === AJUSTE: Debit/Credit ME vs Diferencia de Cambio ===
    if (movement.type === 'AJUSTE') {
        const isPositive = movement.amount > 0
        if (difCambioId) {
            if (isPositive) {
                addLine(meAccountId!, Math.abs(arsAmount), 0, `Ajuste +${movement.amount} ${movement.currency}`)
                addLine(difCambioId, 0, Math.abs(arsAmount), 'Diferencia de cambio')
            } else {
                addLine(difCambioId, Math.abs(arsAmount), 0, 'Diferencia de cambio')
                addLine(meAccountId!, 0, Math.abs(arsAmount), `Ajuste ${movement.amount} ${movement.currency}`)
            }
        }
        memo = `Ajuste ${movement.currency} - ${fxAccount.name}`
        journalRole = 'FX_ADJUSTMENT'
    }

    // === BUILD PREVIEW DATA ===
    const totalDebit = entryLines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = entryLines.reduce((sum, l) => sum + l.credit, 0)
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    const previewLines = entryLines.map(line => {
        const account = accountMap.get(line.accountId)
        return {
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description || '',
            accountCode: account?.code,
            accountName: account?.name,
        }
    })

    // === BUILD ENTRY ===
    const metadata = {
        sourceModule: 'fx',
        sourceId: movement.id,
        sourceType: movement.type.toLowerCase(),
        journalRole,
        fxAccountId: movement.accountId,
        fxAccountName: fxAccount.name,
        amount: movement.amount,
        currency: movement.currency,
        rate: movement.rate,
        rateType: movement.rateType,
        rateSide: movement.rateSide,
        costoARS,
        resultadoARS,
    }

    const entries: Omit<JournalEntry, 'id'>[] = entryLines.length > 0 ? [{
        date: movement.date,
        memo,
        lines: entryLines,
        sourceModule: 'fx',
        sourceId: movement.id,
        sourceType: movement.type.toLowerCase(),
        createdAt,
        metadata,
    }] : []

    return {
        entries,
        lines: previewLines,
        totalDebit,
        totalCredit,
        isBalanced,
        costoARS,
        resultadoARS,
        error: !isBalanced ? 'El asiento no balancea' : undefined,
    }
}

/**
 * Preview journal entries for a movement without saving
 */
export async function previewFxMovementJournal(
    movement: Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>,
    fxAccount?: FxAccount
): Promise<FxJournalPreview> {
    // Create a temporary movement object with a fake ID for preview
    const tempMovement: FxMovement = {
        ...movement,
        id: 'preview-temp',
        linkedJournalEntryIds: [],
        journalStatus: 'none',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }
    return buildJournalEntriesForFxMovement(tempMovement, fxAccount, { preview: true })
}

// ========================================
// FIFO Cost Calculation
// ========================================

/**
 * Calculate FIFO cost for selling a given amount of FC
 */
export async function calculateFIFOCost(
    accountId: string,
    amountToSell: number,
    periodId?: string,
    upToDate?: string
): Promise<{ totalCost: number; lotsConsumed: { lotId?: string; movementId: string; amount: number; cost: number }[] }> {
    // Get all purchase movements for this account, sorted by date (FIFO)
    const movements = await getFxMovementsByAccount(accountId, periodId)
    const purchaseMovements = movements
        .filter(m => (m.type === 'COMPRA' || m.type === 'INGRESO') && (!upToDate || m.date <= upToDate))
        .sort((a, b) => a.date.localeCompare(b.date))

    const saleMovements = movements
        .filter(m => (m.type === 'VENTA' || m.type === 'EGRESO') && (!upToDate || m.date <= upToDate))
        .sort((a, b) => a.date.localeCompare(b.date))

    // Build virtual lots from purchases
    interface VirtualLot {
        movementId: string
        date: string
        amountOriginal: number
        amountRemaining: number
        rate: number
    }

    const lots: VirtualLot[] = purchaseMovements.map(m => ({
        movementId: m.id,
        date: m.date,
        amountOriginal: m.amount,
        amountRemaining: m.amount,
        rate: m.rate,
    }))

    // Also add opening balance as a "lot"
    const account = await getFxAccountById(accountId)
    if (account && account.openingBalance > 0) {
        lots.unshift({
            movementId: 'opening',
            date: account.openingDate,
            amountOriginal: account.openingBalance,
            amountRemaining: account.openingBalance,
            rate: account.openingRate,
        })
    }

    // Consume lots for past sales (to get current state)
    for (const sale of saleMovements) {
        let remaining = sale.amount
        for (const lot of lots) {
            if (remaining <= 0) break
            if (lot.amountRemaining <= 0) continue

            const consume = Math.min(lot.amountRemaining, remaining)
            lot.amountRemaining -= consume
            remaining -= consume
        }
    }

    // Now consume lots for the new sale
    const lotsConsumed: { lotId?: string; movementId: string; amount: number; cost: number }[] = []
    let totalCost = 0
    let remainingToSell = amountToSell

    for (const lot of lots) {
        if (remainingToSell <= 0) break
        if (lot.amountRemaining <= 0) continue

        const consume = Math.min(lot.amountRemaining, remainingToSell)
        const cost = consume * lot.rate

        lotsConsumed.push({
            movementId: lot.movementId,
            amount: consume,
            cost,
        })

        totalCost += cost
        remainingToSell -= consume
    }

    return { totalCost, lotsConsumed }
}

const isAutoGeneratedEntryForMovement = (entry: JournalEntry | undefined, movementId: string) => {
    if (!entry) return false
    return entry.sourceModule === 'fx'
        && entry.sourceId === movementId
        && !!entry.metadata?.journalRole
}

const stripFxLinkFromEntry = (entry: JournalEntry, movementId: string): JournalEntry => {
    if (entry.sourceModule !== 'fx' || entry.sourceId !== movementId) {
        return entry
    }

    const metadata = { ...(entry.metadata || {}) }
    delete metadata.sourceModule
    delete metadata.sourceId
    delete metadata.sourceType
    delete metadata.linkedBy
    delete metadata.fxAccountId
    delete metadata.fxAccountName

    return {
        ...entry,
        sourceModule: undefined,
        sourceId: undefined,
        sourceType: undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
}

/**
 * Create FX movement with optional journal entry
 */
export async function createFxMovement(
    movement: Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>
): Promise<FxMovement> {
    const now = new Date().toISOString()
    const movementId = generateFxId('fxm')

    const isDebtDisbursement = movement.type === 'TOMA_DEUDA' || movement.type === 'DESEMBOLSO_DEUDA'
    if (isDebtDisbursement) {
        if (!movement.debtId) {
            throw new Error('La deuda asociada es obligatoria.')
        }
        if (!movement.targetAccountId) {
            throw new Error('Cuenta destino requerida para la deuda.')
        }
    }

    if (movement.type === 'VENTA') {
        const balance = await calculateFxAccountBalance(movement.accountId, movement.periodId, movement.date)
        if (movement.amount > balance.balance) {
            throw new Error(`Stock insuficiente. Disponible: ${balance.balance.toFixed(2)}`)
        }
    }

    // For sales, calculate FIFO cost if not provided
    let costoARS = movement.costoARS
    let resultadoARS = movement.resultadoARS

    if (movement.type === 'VENTA' && costoARS === undefined) {
        const fifoResult = await calculateFIFOCost(
            movement.accountId,
            movement.amount,
            movement.periodId,
            movement.date
        )
        costoARS = fifoResult.totalCost
        const comisionARS = movement.comisionARS || 0
        const producidoNeto = movement.arsAmount - comisionARS
        resultadoARS = producidoNeto - costoARS
    }

    const newMovement: FxMovement = {
        ...movement,
        id: movementId,
        costoARS,
        resultadoARS,
        linkedJournalEntryIds: [],
        journalStatus: movement.autoJournal ? 'generated' : 'none',
        createdAt: now,
        updatedAt: now,
    }

    const fxAccount = await getFxAccountById(movement.accountId)
    if (isDebtDisbursement && fxAccount && fxAccount.type !== 'LIABILITY') {
        throw new Error('La cuenta de deuda debe ser un pasivo ME.')
    }

    if (!movement.autoJournal) {
        await db.fxMovements.add(newMovement)
        return newMovement
    }

    // Generate journal entries
    const { entries, error } = await buildJournalEntriesForFxMovement(newMovement, fxAccount)
    if (error) {
        throw new Error(error)
    }

    const createdEntries: JournalEntry[] = []
    await db.transaction('rw', db.fxMovements, db.entries, async () => {
        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.fxMovements.add({
            ...newMovement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        })
    })

    return {
        ...newMovement,
        linkedJournalEntryIds: createdEntries.map(e => e.id),
        journalStatus: 'generated',
    }
}

/**
 * Update FX movement with journal handling
 */
export async function updateFxMovementWithJournal(
    id: string,
    updates: Partial<Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>>,
    options?: { manualLinkAction?: 'keep' | 'regenerate' }
): Promise<FxMovement> {
    const existing = await db.fxMovements.get(id)
    if (!existing) {
        throw new Error('Movimiento no encontrado')
    }

    const now = new Date().toISOString()
    const baseMovement: FxMovement = {
        ...existing,
        ...updates,
        updatedAt: now,
    }

    const isDebtDisbursement = baseMovement.type === 'TOMA_DEUDA' || baseMovement.type === 'DESEMBOLSO_DEUDA'
    if (isDebtDisbursement) {
        if (!baseMovement.debtId) {
            throw new Error('La deuda asociada es obligatoria.')
        }
        if (!baseMovement.targetAccountId) {
            throw new Error('Cuenta destino requerida para la deuda.')
        }
    }

    const fxAccount = await getFxAccountById(baseMovement.accountId)

    const linkedIds = existing.linkedJournalEntryIds || []
    const linkedEntries = linkedIds.length > 0
        ? await db.entries.where('id').anyOf(linkedIds).toArray()
        : []
    const autoEntries = linkedEntries.filter(e => isAutoGeneratedEntryForMovement(e, id))
    const manualEntries = linkedEntries.filter(e => !isAutoGeneratedEntryForMovement(e, id))
    const hasManualEntries = manualEntries.length > 0

    if (hasManualEntries && options?.manualLinkAction !== 'keep' && options?.manualLinkAction !== 'regenerate') {
        throw new Error('Movimiento vinculado a asiento manual. Selecciona como proceder.')
    }

    const shouldRegenerate = options?.manualLinkAction === 'regenerate'
        || autoEntries.length > 0
        || baseMovement.autoJournal

    if (hasManualEntries && options?.manualLinkAction === 'keep') {
        await db.transaction('rw', db.fxMovements, async () => {
            await db.fxMovements.update(id, {
                ...baseMovement,
                linkedJournalEntryIds: linkedEntries.map(e => e.id),
                journalStatus: 'desync',
                journalMissingReason: undefined,
            })
        })

        return {
            ...baseMovement,
            linkedJournalEntryIds: linkedEntries.map(e => e.id),
            journalStatus: 'desync',
        }
    }

    let createdEntries: JournalEntry[] = []

    if (shouldRegenerate) {
        const { entries, error } = await buildJournalEntriesForFxMovement(baseMovement, fxAccount)
        if (error) {
            throw new Error(error)
        }

        await db.transaction('rw', db.fxMovements, db.entries, async () => {
            if (autoEntries.length > 0) {
                await db.entries.bulkDelete(autoEntries.map(e => e.id))
            }

            if (hasManualEntries) {
                for (const entry of manualEntries) {
                    const cleaned = stripFxLinkFromEntry(entry, id)
                    await db.entries.put(cleaned)
                }
            }

            for (const entryData of entries) {
                const created = await createEntry(entryData)
                createdEntries.push(created)
            }

            await db.fxMovements.update(id, {
                ...baseMovement,
                autoJournal: true,
                linkedJournalEntryIds: createdEntries.map(e => e.id),
                journalStatus: 'generated',
                journalMissingReason: undefined,
            })
        })

        return {
            ...baseMovement,
            autoJournal: true,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        }
    }

    const fallbackStatus: FxJournalStatus = existing.journalStatus === 'missing' ? 'missing' : 'none'
    const existingLinkedIds = linkedEntries.map(e => e.id)

    await db.transaction('rw', db.fxMovements, async () => {
        await db.fxMovements.update(id, {
            ...baseMovement,
            linkedJournalEntryIds: existingLinkedIds,
            journalStatus: existingLinkedIds.length > 0 ? (hasManualEntries ? 'linked' : 'generated') : fallbackStatus,
            journalMissingReason: existingLinkedIds.length === 0 && fallbackStatus === 'missing' ? 'entry_deleted' : undefined,
        })
    })

    return {
        ...baseMovement,
        linkedJournalEntryIds: existingLinkedIds,
        journalStatus: existingLinkedIds.length > 0 ? (hasManualEntries ? 'linked' : 'generated') : fallbackStatus,
    }
}

/**
 * Generate journal for existing movement
 */
export async function generateJournalForFxMovement(
    movementId: string
): Promise<{ movement: FxMovement; entries: JournalEntry[] }> {
    const movement = await db.fxMovements.get(movementId)
    if (!movement) {
        throw new Error('Movimiento no encontrado')
    }
    if (movement.linkedJournalEntryIds?.length) {
        throw new Error('El movimiento ya tiene asientos vinculados')
    }

    const fxAccount = await getFxAccountById(movement.accountId)
    const { entries, error } = await buildJournalEntriesForFxMovement(movement, fxAccount)
    if (error) {
        throw new Error(error)
    }

    const createdEntries: JournalEntry[] = []
    await db.transaction('rw', db.fxMovements, db.entries, async () => {
        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.fxMovements.update(movementId, {
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
            journalMissingReason: undefined,
            updatedAt: new Date().toISOString(),
        })
    })

    return {
        movement: {
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
            updatedAt: new Date().toISOString(),
        },
        entries: createdEntries,
    }
}

/**
 * Link movement to existing journal entries
 */
export async function linkFxMovementToEntries(
    movementId: string,
    entryIds: string[]
): Promise<FxMovement> {
    const movement = await db.fxMovements.get(movementId)
    if (!movement) {
        throw new Error('Movimiento no encontrado')
    }
    if (entryIds.length === 0) {
        throw new Error('Selecciona al menos un asiento')
    }

    const uniqueIds = Array.from(new Set([...(movement.linkedJournalEntryIds || []), ...entryIds]))

    await db.transaction('rw', db.fxMovements, db.entries, async () => {
        for (const entryId of entryIds) {
            const entry = await db.entries.get(entryId)
            if (!entry) {
                throw new Error('Asiento no encontrado')
            }
            const updated: JournalEntry = {
                ...entry,
                sourceModule: entry.sourceModule || 'fx',
                sourceId: entry.sourceId || movement.id,
                sourceType: entry.sourceType || movement.type.toLowerCase(),
                metadata: {
                    ...(entry.metadata || {}),
                    sourceModule: 'fx',
                    sourceId: movement.id,
                    sourceType: movement.type.toLowerCase(),
                    linkedBy: 'fx',
                },
            }
            await db.entries.put(updated)
        }

        await db.fxMovements.update(movementId, {
            linkedJournalEntryIds: uniqueIds,
            journalStatus: 'linked',
            journalMissingReason: undefined,
            updatedAt: new Date().toISOString(),
        })
    })

    return {
        ...movement,
        linkedJournalEntryIds: uniqueIds,
        journalStatus: 'linked',
        updatedAt: new Date().toISOString(),
    }
}

/**
 * Mark movement as non-accounting (no journal)
 */
export async function markFxMovementAsNonAccounting(movementId: string): Promise<FxMovement> {
    const movement = await db.fxMovements.get(movementId)
    if (!movement) {
        throw new Error('Movimiento no encontrado')
    }
    if ((movement.linkedJournalEntryIds || []).length > 0) {
        throw new Error('El movimiento ya tiene asientos vinculados.')
    }

    const now = new Date().toISOString()
    await db.fxMovements.update(movementId, {
        autoJournal: false,
        journalStatus: 'none',
        journalMissingReason: undefined,
        updatedAt: now,
    })

    return {
        ...movement,
        autoJournal: false,
        journalStatus: 'none',
        journalMissingReason: undefined,
        updatedAt: now,
    }
}

/**
 * Delete FX movement with journal handling
 */
export async function deleteFxMovementWithJournal(
    id: string,
    options?: { keepManualEntries?: boolean }
): Promise<{ success: boolean; error?: string; deletedEntries?: number }> {
    const movement = await db.fxMovements.get(id)
    if (!movement) {
        return { success: false, error: 'Movimiento no encontrado' }
    }

    const linkedIds = movement.linkedJournalEntryIds || []
    const linkedEntries = linkedIds.length > 0
        ? await db.entries.where('id').anyOf(linkedIds).toArray()
        : []
    const autoEntries = linkedEntries.filter(e => isAutoGeneratedEntryForMovement(e, id))
    const manualEntries = linkedEntries.filter(e => !isAutoGeneratedEntryForMovement(e, id))

    if (manualEntries.length > 0 && !options?.keepManualEntries) {
        return {
            success: false,
            error: 'Movimiento vinculado a asiento manual. Confirma para eliminar sin tocar el asiento.',
        }
    }

    await db.transaction('rw', db.fxMovements, db.entries, async () => {
        if (autoEntries.length > 0) {
            await db.entries.bulkDelete(autoEntries.map(e => e.id))
        }
        if (manualEntries.length > 0 && options?.keepManualEntries) {
            for (const entry of manualEntries) {
                const cleaned = stripFxLinkFromEntry(entry, id)
                await db.entries.put(cleaned)
            }
        }
        await db.fxMovements.delete(id)
    })

    return { success: true, deletedEntries: autoEntries.length }
}

/**
 * Reconcile FX movement journal links
 */
export async function reconcileFxJournalLinks(
    periodId?: string
): Promise<{ updated: number }> {
    const allMovements = await db.fxMovements.toArray()
    const scopedMovements = periodId
        ? allMovements.filter(m => matchesPeriod(m.periodId, periodId))
        : allMovements
    const withLinks = scopedMovements.filter(m => (m.linkedJournalEntryIds || []).length > 0 || m.journalStatus === 'missing')

    if (withLinks.length === 0) {
        return { updated: 0 }
    }

    const allIds = new Set<string>()
    withLinks.forEach(m => {
        m.linkedJournalEntryIds?.forEach(id => allIds.add(id))
    })

    if (allIds.size === 0) {
        let updated = 0
        await db.transaction('rw', db.fxMovements, async () => {
            for (const movement of withLinks) {
                if ((movement.linkedJournalEntryIds || []).length === 0 && movement.journalStatus !== 'none') {
                    await db.fxMovements.update(movement.id, {
                        journalStatus: movement.journalStatus === 'missing' ? 'missing' : 'none',
                        journalMissingReason: movement.journalStatus === 'missing' ? movement.journalMissingReason || 'entry_deleted' : undefined,
                        updatedAt: new Date().toISOString(),
                    })
                    updated++
                }
            }
        })
        return { updated }
    }

    const entries = await db.entries.where('id').anyOf(Array.from(allIds)).toArray()
    const entryMap = new Map(entries.map(e => [e.id, e]))
    let updated = 0

    await db.transaction('rw', db.fxMovements, async () => {
        for (const movement of withLinks) {
            const linkedIds = movement.linkedJournalEntryIds || []
            const existingIds = linkedIds.filter(id => entryMap.has(id))
            const changed = existingIds.length !== linkedIds.length
            const hasMissing = existingIds.length === 0

            const existingEntries = existingIds.map(id => entryMap.get(id)).filter(Boolean) as JournalEntry[]
            const hasManual = existingEntries.some(e => !isAutoGeneratedEntryForMovement(e, movement.id))

            let nextStatus: FxJournalStatus = movement.journalStatus || 'none'
            if (hasMissing) {
                nextStatus = 'missing'
            } else if (nextStatus === 'desync') {
                nextStatus = 'desync'
            } else if (existingEntries.length > 0) {
                nextStatus = hasManual ? 'linked' : 'generated'
            } else {
                nextStatus = 'none'
            }

            const shouldUpdate = changed || nextStatus !== movement.journalStatus
            if (!shouldUpdate) continue

            await db.fxMovements.update(movement.id, {
                linkedJournalEntryIds: existingIds,
                journalStatus: nextStatus,
                journalMissingReason: hasMissing ? 'entry_deleted' : undefined,
                updatedAt: new Date().toISOString(),
            })
            updated++
        }
    })

    return { updated }
}

/**
 * Find orphan journal entries (entries that touch FX accounts but aren't linked to any movement)
 */
export async function findOrphanFxEntries(periodId?: string): Promise<JournalEntry[]> {
    // Get all FX accounts to know which ledger accounts are FX-related
    const fxAccounts = await getAllFxAccounts(periodId)
    const fxAccountIds = new Set(fxAccounts.map(a => a.accountId).filter(Boolean) as string[])

    if (fxAccountIds.size === 0) {
        return []
    }

    // Get all movements to know which entry IDs are linked
    const movements = await getAllFxMovements(periodId)
    const linkedEntryIds = new Set<string>()
    movements.forEach(m => {
        m.linkedJournalEntryIds?.forEach(id => linkedEntryIds.add(id))
    })

    // Get all entries
    const allEntries = await db.entries.toArray()

    // Find entries that:
    // 1. Touch at least one FX account (in their lines)
    // 2. Are NOT already linked to a movement (not in linkedEntryIds)
    // 3. Don't have sourceModule='fx' (which would mean they were auto-generated)
    const orphans = allEntries.filter(entry => {
        // Already linked? Skip
        if (linkedEntryIds.has(entry.id)) return false

        // Auto-generated by FX module? Skip
        if (entry.sourceModule === 'fx') return false

        // Check if any line touches an FX account
        const touchesFxAccount = entry.lines.some(line =>
            fxAccountIds.has(line.accountId)
        )

        return touchesFxAccount
    })

    return orphans
}

/**
 * Get full reconciliation data for UI
 */
export interface FxReconciliationData {
    movementsWithoutEntry: FxMovement[]
    orphanEntries: JournalEntry[]
    totalMovementsChecked: number
    totalEntriesChecked: number
}

export async function getReconciliationData(periodId?: string): Promise<FxReconciliationData> {
    // First, run the reconciliation to update statuses
    await reconcileFxJournalLinks(periodId)

    // Get movements without entries (status = 'none' with autoJournal=true, or 'missing')
    const movements = await getAllFxMovements(periodId)
    const movementsWithoutEntry = movements.filter(m =>
        m.journalStatus === 'missing' ||
        (m.journalStatus === 'none' && m.autoJournal) ||
        ((m.linkedJournalEntryIds || []).length === 0 && m.autoJournal)
    )

    // Get orphan entries
    const orphanEntries = await findOrphanFxEntries(periodId)

    return {
        movementsWithoutEntry,
        orphanEntries,
        totalMovementsChecked: movements.length,
        totalEntriesChecked: orphanEntries.length,
    }
}

// ========================================
// FX Debts (Structured Liabilities)
// ========================================

const validateFxDebtPayload = (debt: Omit<FxDebt, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => {
    const errors: string[] = []

    if (!debt.name?.trim()) errors.push('El nombre de la deuda es obligatorio.')
    if (!debt.accountId) errors.push('Cuenta de pasivo ME requerida.')
    if (!debt.periodId) errors.push('Periodo requerido.')
    if (debt.principalME <= 0) errors.push('El principal debe ser mayor a 0.')
    if (debt.rateInicial <= 0) errors.push('El tipo de cambio inicial debe ser mayor a 0.')
    if (!debt.currency) errors.push('Moneda requerida.')
    if (debt.installments <= 0) errors.push('Las cuotas deben ser mayor a 0.')
    if (!isValidDate(debt.originDate)) errors.push('Fecha de origen inválida.')
    if (!isValidDate(debt.firstDueDate)) errors.push('Fecha de primer vencimiento inválida.')

    if (errors.length > 0) {
        throw new Error(errors.join(' '))
    }
}

const buildFxDebtFromLiability = (liability: FxLiability): FxDebt => {
    const now = new Date().toISOString()
    const principalME = liability.originalAmount
    const rateInicial = liability.rate
    const installments = Math.max(1, liability.installments || 1)
    const frequency = liability.frequency
    const interestRateAnnual = liability.interestRate || 0
    const schedule = generateFxDebtSchedule({
        principalME,
        interestRateAnnual,
        installments,
        frequency,
        system: 'FRANCES',
        firstDueDate: liability.startDate,
    }).map((item, index) => ({
        ...item,
        paid: index < (liability.paidInstallments || 0),
    }))

    const remaining = liability.remainingAmount ?? principalME
    const status: FxDebt['status'] = remaining <= 0 ? 'PAID' : 'ACTIVE'

    return {
        id: generateFxId('fxd'),
        name: liability.reference || `Deuda ${liability.currency}`,
        accountId: liability.accountId,
        periodId: liability.periodId,
        principalME,
        currency: liability.currency,
        rateInicial,
        rateType: liability.rateType,
        rateSide: 'venta',
        principalARS: principalME * rateInicial,
        originDate: liability.startDate,
        interestRateAnnual,
        installments,
        frequency,
        system: 'FRANCES',
        firstDueDate: liability.startDate,
        schedule,
        saldoME: remaining,
        paidInstallments: liability.paidInstallments || 0,
        status,
        creditor: liability.creditor,
        reference: liability.reference,
        notes: liability.notes,
        autoJournal: liability.autoJournal,
        linkedJournalEntryIds: liability.linkedJournalEntryIds || [],
        journalStatus: liability.journalStatus,
        legacyLiabilityId: liability.id,
        createdAt: liability.createdAt || now,
        updatedAt: liability.updatedAt || now,
    }
}

async function migrateFxLiabilitiesToDebts(periodId?: string): Promise<number> {
    const liabilities = await getAllFxLiabilities(periodId)
    if (liabilities.length === 0) return 0

    const existingDebts = await db.fxDebts.toArray()
    const existingLegacyIds = new Set(existingDebts.map(d => d.legacyLiabilityId).filter(Boolean) as string[])

    const toCreate = liabilities
        .filter(l => !existingLegacyIds.has(l.id))
        .map(buildFxDebtFromLiability)

    if (toCreate.length === 0) return 0

    await db.transaction('rw', db.fxDebts, async () => {
        await db.fxDebts.bulkAdd(toCreate)
    })

    return toCreate.length
}

export async function getAllFxDebts(periodId?: string): Promise<FxDebt[]> {
    await migrateFxLiabilitiesToDebts(periodId)
    const debts = await db.fxDebts.toArray()
    return debts.filter(d => matchesPeriod(d.periodId, periodId))
}

export async function getFxDebtById(id: string): Promise<FxDebt | undefined> {
    return db.fxDebts.get(id)
}

export async function createFxDebt(
    debt: Omit<FxDebt, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>,
    options?: {
        disbursementAccountId?: string
        disbursementDate?: string
        disbursementRate?: number
        disbursementRateType?: FxDebt['rateType']
        autoJournal?: boolean
    }
): Promise<FxDebt> {
    validateFxDebtPayload(debt)

    const now = new Date().toISOString()
    const principalARS = debt.principalARS || debt.principalME * debt.rateInicial
    const schedule = debt.schedule && debt.schedule.length > 0
        ? debt.schedule
        : generateFxDebtSchedule({
            principalME: debt.principalME,
            interestRateAnnual: debt.interestRateAnnual,
            installments: debt.installments,
            frequency: debt.frequency,
            system: debt.system,
            firstDueDate: debt.firstDueDate,
        })

    const newDebt: FxDebt = {
        ...debt,
        id: generateFxId('fxd'),
        principalARS,
        saldoME: debt.saldoME ?? debt.principalME,
        schedule,
        linkedJournalEntryIds: [],
        journalStatus: 'none',
        createdAt: now,
        updatedAt: now,
    }

    const shouldCreateDisbursement = !!options?.disbursementAccountId
    const autoJournal = options?.autoJournal ?? debt.autoJournal

    if (!shouldCreateDisbursement) {
        await db.fxDebts.add(newDebt)
        return newDebt
    }

    const disbursementRate = options?.disbursementRate || debt.rateInicial
    const movementId = generateFxId('fxm')
    const movement: FxMovement = {
        id: movementId,
        date: options?.disbursementDate || debt.originDate,
        type: 'TOMA_DEUDA',
        accountId: debt.accountId,
        targetAccountId: options!.disbursementAccountId,
        periodId: debt.periodId,
        amount: debt.principalME,
        currency: debt.currency,
        rate: disbursementRate,
        rateType: options?.disbursementRateType || debt.rateType,
        rateSide: debt.rateSide,
        rateSource: 'Manual',
        arsAmount: debt.principalME * disbursementRate,
        autoJournal,
        linkedJournalEntryIds: [],
        journalStatus: autoJournal ? 'generated' : 'none',
        debtId: newDebt.id,
        counterparty: debt.creditor,
        createdAt: now,
        updatedAt: now,
    }

    const fxAccount = await getFxAccountById(movement.accountId)
    let createdEntries: JournalEntry[] = []

    // Include all stores that may be accessed during journal generation:
    // - fxDebts: main debt record
    // - fxMovements: disbursement movement
    // - fxAccounts: lookup for target account
    // - accounts: ledger accounts for journal building
    // - entries: journal entries
    await db.transaction('rw', [db.fxDebts, db.fxMovements, db.fxAccounts, db.accounts, db.entries], async () => {
        await db.fxDebts.add(newDebt)

        if (!autoJournal) {
            await db.fxMovements.add(movement)
            return
        }

        const { entries, error } = await buildJournalEntriesForFxMovement(movement, fxAccount)
        if (error) {
            throw new Error(error)
        }

        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.fxMovements.add({
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        })

        await db.fxDebts.update(newDebt.id, {
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        })
    })

    return {
        ...newDebt,
        linkedJournalEntryIds: createdEntries.map(e => e.id),
        journalStatus: createdEntries.length > 0 ? 'generated' : 'none',
    }
}

export async function updateFxDebt(id: string, updates: Partial<FxDebt>): Promise<void> {
    await db.fxDebts.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
    })
}

export async function deleteFxDebt(id: string): Promise<{ success: boolean; error?: string }> {
    await db.fxDebts.delete(id)
    return { success: true }
}

export async function addFxDebtDisbursement(params: {
    debtId: string
    amount: number
    rate: number
    date: string
    targetAccountId: string
    autoJournal?: boolean
}): Promise<{ debt: FxDebt; movement: FxMovement; entries: JournalEntry[] }> {
    const debt = await db.fxDebts.get(params.debtId)
    if (!debt) {
        throw new Error('Deuda no encontrada')
    }
    if (params.amount <= 0) {
        throw new Error('El monto del desembolso debe ser mayor a 0.')
    }
    if (params.rate <= 0) {
        throw new Error('El tipo de cambio debe ser mayor a 0.')
    }
    if (!isValidDate(params.date)) {
        throw new Error('Fecha del desembolso inválida.')
    }
    if (!params.targetAccountId) {
        throw new Error('Cuenta destino requerida.')
    }

    const autoJournal = params.autoJournal ?? debt.autoJournal
    const now = new Date().toISOString()
    const movementId = generateFxId('fxm')
    const movement: FxMovement = {
        id: movementId,
        date: params.date,
        type: 'DESEMBOLSO_DEUDA',
        accountId: debt.accountId,
        targetAccountId: params.targetAccountId,
        periodId: debt.periodId,
        amount: params.amount,
        currency: debt.currency,
        rate: params.rate,
        rateType: debt.rateType,
        rateSide: debt.rateSide,
        rateSource: 'Manual',
        arsAmount: params.amount * params.rate,
        autoJournal,
        linkedJournalEntryIds: [],
        journalStatus: autoJournal ? 'generated' : 'none',
        debtId: debt.id,
        counterparty: debt.creditor,
        createdAt: now,
        updatedAt: now,
    }

    const nextPrincipalME = debt.principalME + params.amount
    const nextSaldoME = debt.saldoME + params.amount
    const nextPrincipalARS = (debt.principalARS || 0) + (params.amount * params.rate)

    let nextSchedule = debt.schedule || []
    if (debt.paidInstallments === 0) {
        nextSchedule = generateFxDebtSchedule({
            principalME: nextPrincipalME,
            interestRateAnnual: debt.interestRateAnnual,
            installments: debt.installments,
            frequency: debt.frequency,
            system: debt.system,
            firstDueDate: debt.firstDueDate,
        })
    } else {
        const lastDue = nextSchedule.length > 0
            ? nextSchedule[nextSchedule.length - 1].dueDate
            : debt.firstDueDate
        nextSchedule = [
            ...nextSchedule,
            {
                number: nextSchedule.length + 1,
                dueDate: addMonths(lastDue, frequencyToMonths[debt.frequency] || 1),
                capitalME: Math.round(params.amount * 100) / 100,
                interestME: 0,
                totalME: Math.round(params.amount * 100) / 100,
                paid: false,
            },
        ]
    }

    const fxAccount = await getFxAccountById(movement.accountId)
    const createdEntries: JournalEntry[] = []

    // Include all stores for journal generation (accounts lookup + entries)
    await db.transaction('rw', [db.fxDebts, db.fxMovements, db.fxAccounts, db.accounts, db.entries], async () => {
        await db.fxDebts.update(debt.id, {
            principalME: nextPrincipalME,
            saldoME: nextSaldoME,
            principalARS: nextPrincipalARS,
            schedule: nextSchedule,
            status: 'ACTIVE',
            updatedAt: now,
        })

        if (!autoJournal) {
            await db.fxMovements.add(movement)
            return
        }

        const { entries, error } = await buildJournalEntriesForFxMovement(movement, fxAccount)
        if (error) {
            throw new Error(error)
        }

        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.fxMovements.add({
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        })
    })

    return {
        debt: {
            ...debt,
            principalME: nextPrincipalME,
            saldoME: nextSaldoME,
            principalARS: nextPrincipalARS,
            schedule: nextSchedule,
            status: 'ACTIVE',
            updatedAt: now,
        },
        movement: {
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: createdEntries.length > 0 ? 'generated' : movement.journalStatus,
        },
        entries: createdEntries,
    }
}

export async function addFxDebtPayment(params: {
    debtId: string
    capitalME: number
    interestARS?: number
    rate: number
    date: string
    contrapartidaAccountId?: string
    comisionARS?: number
    comisionAccountId?: string
    autoJournal?: boolean
}): Promise<{ debt: FxDebt; movement: FxMovement; entries: JournalEntry[] }> {
    const debt = await db.fxDebts.get(params.debtId)
    if (!debt) {
        throw new Error('Deuda no encontrada')
    }
    if (params.capitalME <= 0) {
        throw new Error('El capital a pagar debe ser mayor a 0.')
    }
    if (params.capitalME > debt.saldoME) {
        throw new Error('El pago excede el saldo de la deuda.')
    }
    if (params.rate <= 0) {
        throw new Error('El tipo de cambio debe ser mayor a 0.')
    }
    if (!isValidDate(params.date)) {
        throw new Error('Fecha de pago inválida.')
    }

    const autoJournal = params.autoJournal ?? debt.autoJournal
    const now = new Date().toISOString()
    const movementId = generateFxId('fxm')
    const movement: FxMovement = {
        id: movementId,
        date: params.date,
        type: 'PAGO_DEUDA',
        accountId: debt.accountId,
        periodId: debt.periodId,
        amount: params.capitalME,
        currency: debt.currency,
        rate: params.rate,
        rateType: debt.rateType,
        rateSide: debt.rateSide,
        rateSource: 'Manual',
        arsAmount: params.capitalME * params.rate,
        autoJournal,
        linkedJournalEntryIds: [],
        journalStatus: autoJournal ? 'generated' : 'none',
        debtId: debt.id,
        capitalAmount: params.capitalME,
        interestARS: params.interestARS || 0,
        contrapartidaAccountId: params.contrapartidaAccountId,
        comisionARS: params.comisionARS,
        comisionAccountId: params.comisionAccountId,
        counterparty: debt.creditor,
        createdAt: now,
        updatedAt: now,
    }

    const nextSaldoME = Math.max(0, debt.saldoME - params.capitalME)
    let nextPaidInstallments = debt.paidInstallments || 0
    let nextSchedule = debt.schedule || []
    const unpaidIndex = nextSchedule.findIndex(item => !item.paid)
    if (unpaidIndex >= 0 && params.capitalME >= (nextSchedule[unpaidIndex].capitalME || 0)) {
        nextSchedule = nextSchedule.map((item, index) => {
            if (index !== unpaidIndex) return item
            return {
                ...item,
                paid: true,
                paidDate: params.date,
                paidMovementId: movementId,
                paidRate: params.rate,
            }
        })
        nextPaidInstallments = Math.max(nextPaidInstallments, unpaidIndex + 1)
    }

    const nextStatus: FxDebt['status'] = nextSaldoME <= 0 ? 'PAID' : 'ACTIVE'

    const fxAccount = await getFxAccountById(movement.accountId)
    const createdEntries: JournalEntry[] = []

    // Include all stores for journal generation (accounts lookup + entries)
    await db.transaction('rw', [db.fxDebts, db.fxMovements, db.fxAccounts, db.accounts, db.entries], async () => {
        await db.fxDebts.update(debt.id, {
            saldoME: nextSaldoME,
            paidInstallments: nextPaidInstallments,
            schedule: nextSchedule,
            status: nextStatus,
            updatedAt: now,
        })

        if (!autoJournal) {
            await db.fxMovements.add(movement)
            return
        }

        const { entries, error } = await buildJournalEntriesForFxMovement(movement, fxAccount)
        if (error) {
            throw new Error(error)
        }

        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.fxMovements.add({
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: 'generated',
        })
    })

    return {
        debt: {
            ...debt,
            saldoME: nextSaldoME,
            paidInstallments: nextPaidInstallments,
            schedule: nextSchedule,
            status: nextStatus,
            updatedAt: now,
        },
        movement: {
            ...movement,
            linkedJournalEntryIds: createdEntries.map(e => e.id),
            journalStatus: createdEntries.length > 0 ? 'generated' : movement.journalStatus,
        },
        entries: createdEntries,
    }
}

// ========================================
// FX Liabilities
// ========================================

/**
 * Get all FX liabilities
 */
export async function getAllFxLiabilities(periodId?: string): Promise<FxLiability[]> {
    const liabilities = await db.fxLiabilities.toArray()
    return liabilities.filter(l => matchesPeriod(l.periodId, periodId))
}

/**
 * Create FX liability
 */
export async function createFxLiability(
    liability: Omit<FxLiability, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus'>
): Promise<FxLiability> {
    const now = new Date().toISOString()
    const newLiability: FxLiability = {
        ...liability,
        id: generateFxId('fxl'),
        linkedJournalEntryIds: liability.linkedJournalEntryIds || [],
        journalStatus: 'none',
        createdAt: now,
        updatedAt: now,
    }
    await db.fxLiabilities.add(newLiability)
    return newLiability
}

/**
 * Update FX liability
 */
export async function updateFxLiability(
    id: string,
    updates: Partial<FxLiability>
): Promise<void> {
    await db.fxLiabilities.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Delete FX liability
 */
export async function deleteFxLiability(id: string): Promise<{ success: boolean; error?: string }> {
    await db.fxLiabilities.delete(id)
    return { success: true }
}

// ========================================
// Balance Calculations
// ========================================

/**
 * Calculate FX account balance (in foreign currency)
 */
export async function calculateFxAccountBalance(
    accountId: string,
    periodId?: string,
    upToDate?: string
): Promise<{ balance: number; weightedAvgRate: number }> {
    const account = await getFxAccountById(accountId)
    if (!account) {
        return { balance: 0, weightedAvgRate: 0 }
    }

    let balance = account.openingBalance
    let totalArs = account.openingBalance * account.openingRate

    const movements = await getFxMovementsByAccount(accountId, periodId)
    const relevantMovements = upToDate
        ? movements.filter(m => m.date <= upToDate)
        : movements

    for (const m of relevantMovements) {
        const sign = getMovementSign(m.type, account.type)
        balance += sign * m.amount
        totalArs += sign * m.arsAmount
    }

    // Handle transfers where this account is the target
    const allMovements = await getAllFxMovements(periodId)
    const incomingTransfers = allMovements.filter(
        m => (m.type === 'TRANSFERENCIA' || m.type === 'TOMA_DEUDA' || m.type === 'DESEMBOLSO_DEUDA')
            && m.targetAccountId === accountId
            && (!upToDate || m.date <= upToDate)
    )

    for (const m of incomingTransfers) {
        balance += m.amount
        totalArs += m.arsAmount
    }

    const weightedAvgRate = balance > 0 ? totalArs / balance : 0

    return { balance, weightedAvgRate }
}

/**
 * Get sign for a movement type (positive or negative for balance)
 */
function getMovementSign(type: FxMovement['type'], accountType: 'ASSET' | 'LIABILITY'): number {
    if (accountType === 'ASSET') {
        switch (type) {
            case 'COMPRA':
            case 'INGRESO':
            case 'AJUSTE':
                return 1
            case 'VENTA':
            case 'EGRESO':
            case 'TRANSFERENCIA':
                return -1
            case 'PAGO_DEUDA':
            case 'TOMA_DEUDA':
            case 'DESEMBOLSO_DEUDA':
                return 0 // Not applicable for assets
        }
    } else {
        // LIABILITY
        switch (type) {
            case 'PAGO_DEUDA':
                return -1 // Reduces liability
            case 'INGRESO':
            case 'TOMA_DEUDA':
            case 'DESEMBOLSO_DEUDA':
                return 1 // Increases liability (new debt)
            default:
                return 0
        }
    }
    return 0
}

// ========================================
// Bulk Operations
// ========================================

/**
 * Clear all FX data for a period
 */
export async function clearFxPeriodData(
    periodId: string,
    options: { deleteGeneratedEntries: boolean }
): Promise<{ deletedAccounts: number; deletedMovements: number; deletedEntries: number }> {
    const accounts = await getAllFxAccounts(periodId)
    const movements = await getAllFxMovements(periodId)
    const debts = await getAllFxDebts(periodId)
    const liabilities = await getAllFxLiabilities(periodId)

    const movementIds = new Set(movements.map(m => m.id))
    const allEntries = await db.entries.toArray()
    const linkedEntries = allEntries.filter(e => e.sourceModule === 'fx' && e.sourceId && movementIds.has(e.sourceId))

    const autoEntries = linkedEntries.filter(e => isAutoGeneratedEntryForMovement(e, e.sourceId || ''))
    const manualEntries = linkedEntries.filter(e => !isAutoGeneratedEntryForMovement(e, e.sourceId || ''))

    await db.transaction('rw', db.fxMovements, db.fxDebts, db.fxLiabilities, db.entries, async () => {
        if (options.deleteGeneratedEntries) {
            if (autoEntries.length > 0) {
                await db.entries.bulkDelete(autoEntries.map(e => e.id))
            }
            if (manualEntries.length > 0) {
                for (const entry of manualEntries) {
                    const cleaned = stripFxLinkFromEntry(entry, entry.sourceId || '')
                    await db.entries.put(cleaned)
                }
            }
        } else {
            for (const entry of linkedEntries) {
                const cleaned = stripFxLinkFromEntry(entry, entry.sourceId || '')
                await db.entries.put(cleaned)
            }
        }

        if (movements.length > 0) {
            await db.fxMovements.bulkDelete(movements.map(m => m.id))
        }
        if (debts.length > 0) {
            await db.fxDebts.bulkDelete(debts.map(d => d.id))
        }
        if (liabilities.length > 0) {
            await db.fxLiabilities.bulkDelete(liabilities.map(l => l.id))
        }
    })

    if (accounts.length > 0) {
        await db.fxAccounts.bulkDelete(accounts.map(a => a.id))
    }

    return {
        deletedAccounts: accounts.length,
        deletedMovements: movements.length,
        deletedEntries: options.deleteGeneratedEntries ? autoEntries.length : 0,
    }
}

/**
 * Clear all FX data
 */
export async function clearAllFxData(): Promise<void> {
    await Promise.all([
        db.fxAccounts.clear(),
        db.fxMovements.clear(),
        db.fxDebts.clear(),
        db.fxLiabilities.clear(),
        db.fxSettings.clear(),
        db.fxRatesCache.clear(),
    ])
}
