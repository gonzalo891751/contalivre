/**
 * EEPN Computation Engine
 *
 * Pure functions to compute the Estado de Evolución del Patrimonio Neto
 * from journal entries and account data.
 */

import type { Account, JournalEntry, EntryLine } from '../models'
import type {
    EEPNInput,
    EEPNResult,
    EEPNRow,
    EEPNRowType,
    EEPNCellValue,
    EEPNCellBreakdown,
    EEPNReconciliation,
    MovementClassification,
} from './types'
import { EEPN_COLUMNS, getColumnForAccount, isPNAccount } from './columns'

const TOLERANCE = 0.01

// ============================================
// Main Computation
// ============================================

/**
 * Compute EEPN from input data
 */
export function computeEEPN(input: EEPNInput): EEPNResult {
    const {
        accounts,
        entries,
        periodStart,
        periodEnd,
        overrides = new Map(),
        netIncomeFromER,
        pnFromBalance,
    } = input

    // Create account lookup
    const accountMap = new Map(accounts.map(a => [a.id, a]))
    const accountByCode = new Map(accounts.map(a => [a.code, a]))

    // Filter entries by period
    const entriesBefore = entries.filter(e => e.date < periodStart)
    const entriesInPeriod = entries.filter(e => e.date >= periodStart && e.date <= periodEnd)

    // Compute opening balances (before period start)
    const openingBalances = computePNBalances(entriesBefore, accountMap, accounts)

    // Compute closing balances (up to period end)
    const allEntriesUpToEnd = entries.filter(e => e.date <= periodEnd)
    const closingBalances = computePNBalances(allEntriesUpToEnd, accountMap, accounts)

    // Classify movements in period
    const classifiedMovements = classifyMovements(entriesInPeriod, accountMap, accounts)

    // Build rows
    const rows = buildRows(
        openingBalances,
        closingBalances,
        classifiedMovements,
        accountByCode,
        overrides,
        netIncomeFromER
    )

    // Calculate totals
    const pnInicio = sumRowTotal(rows, 'SALDO_INICIO')
    const pnCierre = sumRowTotal(rows, 'SALDO_CIERRE')
    const variacionNeta = pnCierre - pnInicio

    // Reconciliation
    const reconciliation = computeReconciliation(
        pnCierre,
        pnFromBalance,
        getRowTotal(rows, 'RESULTADO_EJERCICIO'),
        netIncomeFromER
    )

    return {
        columns: EEPN_COLUMNS,
        rows,
        pnInicio,
        pnCierre,
        variacionNeta,
        resultadoER: netIncomeFromER,
        reconciliation,
        overrides,
        period: {
            from: periodStart,
            to: periodEnd,
            label: `Ejercicio ${periodEnd.substring(0, 4)}`,
        },
    }
}

// ============================================
// Balance Computation
// ============================================

interface ColumnBalance {
    columnId: string
    balance: number
    breakdown: EEPNCellBreakdown[]
}

/**
 * Compute PN balances grouped by EEPN column
 */
function computePNBalances(
    entries: JournalEntry[],
    accountMap: Map<string, Account>,
    _allAccounts: Account[]
): Map<string, ColumnBalance> {
    const balances = new Map<string, ColumnBalance>()

    // Initialize all columns
    for (const col of EEPN_COLUMNS) {
        balances.set(col.id, { columnId: col.id, balance: 0, breakdown: [] })
    }

    // Sort entries by date
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))

    for (const entry of sorted) {
        for (const line of entry.lines) {
            const account = accountMap.get(line.accountId)
            if (!account || !isPNAccount(account.code)) continue

            const col = getColumnForAccount(account.code)
            if (!col) continue

            const colBalance = balances.get(col.id)!

            // Calculate movement
            // For EQUITY accounts (normalSide CREDIT), credits increase balance
            const netMovement = line.credit - line.debit
            // If contra account, sign is reversed in the balance already
            const signedMovement = account.isContra ? -netMovement : netMovement

            colBalance.balance += signedMovement
            colBalance.breakdown.push({
                entryId: entry.id,
                date: entry.date,
                memo: entry.memo,
                amount: signedMovement,
                accountCode: account.code,
                accountName: account.name,
            })
        }
    }

    return balances
}

// ============================================
// Movement Classification
// ============================================

interface ClassifiedMovement {
    entry: JournalEntry
    classification: MovementClassification
    pnLines: Array<{ line: EntryLine; account: Account; signedAmount: number }>
}

/**
 * Classify journal entries into EEPN row types
 */
function classifyMovements(
    entries: JournalEntry[],
    accountMap: Map<string, Account>,
    _allAccounts: Account[]
): ClassifiedMovement[] {
    const result: ClassifiedMovement[] = []

    for (const entry of entries) {
        // Extract PN lines
        const pnLines: ClassifiedMovement['pnLines'] = []
        let hasNonPNLines = false
        let touchesAREA = false
        let touchesDividendos = false
        let touchesReservas = false
        let touchesRNA = false
        let touchesCapital = false
        let touchesCaja = false
        let touchesResultadoEjercicio = false

        for (const line of entry.lines) {
            const account = accountMap.get(line.accountId)
            if (!account) continue

            if (isPNAccount(account.code)) {
                const netMovement = line.credit - line.debit
                const signedAmount = account.isContra ? -netMovement : netMovement
                pnLines.push({ line, account, signedAmount })

                // Track which PN areas are touched
                if (account.code.startsWith('3.3.03')) touchesAREA = true
                if (account.code.startsWith('3.3.04')) touchesDividendos = true
                if (account.code.startsWith('3.2')) touchesReservas = true
                if (account.code.startsWith('3.3.01')) touchesRNA = true
                if (account.code.startsWith('3.3.02')) touchesResultadoEjercicio = true
                if (account.code.startsWith('3.1')) touchesCapital = true
            } else {
                hasNonPNLines = true
                // Check for cash accounts (1.1.01.*)
                if (account.code.startsWith('1.1.01')) touchesCaja = true
                // Check for dividendos a pagar (2.1.06.05)
                if (account.code === '2.1.06.05') touchesDividendos = true
            }
        }

        // Skip if no PN lines
        if (pnLines.length === 0) continue

        // Determine if entry touching 3.3.02 is a refundición/cierre
        let isRefundicion = false
        if (touchesResultadoEjercicio && hasNonPNLines) {
            const nonPNAccounts = entry.lines
                .map(l => accountMap.get(l.accountId))
                .filter((acc): acc is Account => acc != null && !isPNAccount(acc.code))
            isRefundicion = nonPNAccounts.length > 0 && nonPNAccounts.every(
                acc => acc.code.startsWith('4.') || acc.code.startsWith('5.')
            )
        }

        // Classify based on heuristics
        const classification = classifyEntry(
            entry,
            pnLines,
            hasNonPNLines,
            touchesAREA,
            touchesDividendos,
            touchesReservas,
            touchesRNA,
            touchesCapital,
            touchesCaja,
            touchesResultadoEjercicio,
            isRefundicion
        )

        result.push({ entry, classification, pnLines })
    }

    return result
}

/**
 * Heuristic classification of a single entry
 */
function classifyEntry(
    _entry: JournalEntry,
    pnLines: ClassifiedMovement['pnLines'],
    hasNonPNLines: boolean,
    touchesAREA: boolean,
    touchesDividendos: boolean,
    touchesReservas: boolean,
    touchesRNA: boolean,
    touchesCapital: boolean,
    touchesCaja: boolean,
    touchesResultadoEjercicio: boolean,
    isRefundicion: boolean
): MovementClassification {
    // Rule 1: If touches AREA accounts -> AREA
    if (touchesAREA) {
        return { rowType: 'AREA', reason: 'Movimiento en cuentas AREA (3.3.03.*)' }
    }

    // Rule 2: Dividendos (touches 3.3.04 or 2.1.06.05)
    if (touchesDividendos) {
        return { rowType: 'DISTRIBUCIONES', reason: 'Distribución de dividendos' }
    }

    // Rule 3: Only PN accounts touched -> internal reclassification
    if (!hasNonPNLines) {
        // If touches reservas and RNA -> reservas transfer
        if (touchesReservas && touchesRNA) {
            return { rowType: 'RESERVAS', reason: 'Constitución/absorción de reservas' }
        }
        // If touches capital and something else -> capitalization
        if (touchesCapital) {
            return { rowType: 'CAPITALIZACIONES', reason: 'Capitalización / reclasificación PN' }
        }
        // Generic internal
        return { rowType: 'CAPITALIZACIONES', reason: 'Movimiento interno de PN' }
    }

    // Rule 4: Cash + Capital accounts -> new contribution
    if (touchesCaja && touchesCapital) {
        return { rowType: 'APORTES_PROPIETARIOS', reason: 'Aporte de capital' }
    }

    // Rule 5: Cash + RNA/Distribuciones and debit in PN -> withdrawal
    if (touchesCaja && (touchesRNA || touchesDividendos)) {
        // Check if it's a debit to PN (withdrawal)
        const totalPNMovement = pnLines.reduce((sum, pl) => sum + pl.signedAmount, 0)
        if (totalPNMovement < 0) {
            return { rowType: 'DISTRIBUCIONES', reason: 'Retiro / distribución' }
        }
    }

    // Rule 6: Check for Resultado del ejercicio movements (3.3.02)
    // Only classify as RESULTADO_EJERCICIO if it's a refundición/cierre entry
    // (counterparts are all 4.*/5.* accounts). Otherwise, it's an application
    // of result (e.g., fee payment, distribution) -> OTROS_MOVIMIENTOS.
    if (touchesResultadoEjercicio) {
        if (isRefundicion) {
            return { rowType: 'RESULTADO_EJERCICIO', reason: 'Asiento de cierre/refundición' }
        }
        return { rowType: 'OTROS_MOVIMIENTOS', reason: 'Aplicación de resultado del ejercicio' }
    }

    // Fallback
    return { rowType: 'OTROS_MOVIMIENTOS', reason: 'Otros movimientos de PN' }
}

// ============================================
// Row Building
// ============================================

/**
 * Build all EEPN rows
 */
function buildRows(
    openingBalances: Map<string, ColumnBalance>,
    _closingBalances: Map<string, ColumnBalance>,
    classifiedMovements: ClassifiedMovement[],
    _accountByCode: Map<string, Account>,
    overrides: Map<string, number>,
    netIncomeFromER?: number
): EEPNRow[] {
    const rows: EEPNRow[] = []

    // 1. Saldos al inicio
    rows.push(createBalanceRow('inicio', 'SALDO_INICIO', 'Saldos al inicio', openingBalances, overrides, true))

    // 2. RECPAM (ajuste saldos al inicio) - editable, defaults to 0
    rows.push(createMovementRow('recpam', 'RECPAM', 'RECPAM (ajuste saldos al inicio)', [], overrides))

    // 3. AREA
    const areaMovements = classifiedMovements.filter(m => m.classification.rowType === 'AREA')
    rows.push(createMovementRow('area', 'AREA', 'Modificación saldo inicio (AREA)', areaMovements, overrides))

    // 4. Saldo inicio ajustado (calculated: inicio + recpam + area)
    rows.push(createCalculatedRow(
        'inicio_ajustado',
        'SALDO_INICIO_AJUSTADO',
        'Saldo al inicio ajustado',
        [rows[0], rows[1], rows[2]],
        overrides,
        true
    ))

    // 4. Section header for variations
    rows.push(createHeaderRow('var_header', 'Variaciones del ejercicio'))

    // 5. Aportes de propietarios
    const aportesMovs = classifiedMovements.filter(m => m.classification.rowType === 'APORTES_PROPIETARIOS')
    rows.push(createMovementRow('aportes', 'APORTES_PROPIETARIOS', 'Aportes de propietarios', aportesMovs, overrides, 1))

    // 6. Capitalizaciones
    const capMovs = classifiedMovements.filter(m => m.classification.rowType === 'CAPITALIZACIONES')
    rows.push(createMovementRow('capitalizaciones', 'CAPITALIZACIONES', 'Capitalización / reclasificaciones', capMovs, overrides, 1))

    // 7. Reservas
    const resMovs = classifiedMovements.filter(m => m.classification.rowType === 'RESERVAS')
    rows.push(createMovementRow('reservas_mov', 'RESERVAS', 'Constitución de reservas', resMovs, overrides, 1))

    // 8. Distribuciones
    const distMovs = classifiedMovements.filter(m => m.classification.rowType === 'DISTRIBUCIONES')
    rows.push(createMovementRow('distribuciones_mov', 'DISTRIBUCIONES', 'Distribuciones y retiros', distMovs, overrides, 1))

    // 9. Resultado del ejercicio
    // Use netIncomeFromER if available, otherwise calculate from movements
    const resultadoRow = createResultadoRow(
        'resultado',
        classifiedMovements.filter(m => m.classification.rowType === 'RESULTADO_EJERCICIO'),
        overrides,
        netIncomeFromER
    )
    rows.push(resultadoRow)

    // 10. Otros movimientos
    const otrosMovs = classifiedMovements.filter(m => m.classification.rowType === 'OTROS_MOVIMIENTOS')
    rows.push(createMovementRow('otros', 'OTROS_MOVIMIENTOS', 'Otros movimientos de PN', otrosMovs, overrides, 1))

    // 11. Total variaciones (calculated)
    const variationRows = rows.filter(r =>
        ['APORTES_PROPIETARIOS', 'CAPITALIZACIONES', 'RESERVAS', 'DISTRIBUCIONES', 'RESULTADO_EJERCICIO', 'OTROS_MOVIMIENTOS'].includes(r.type)
    )
    rows.push(createCalculatedRow(
        'total_variaciones',
        'TOTAL_VARIACIONES',
        'Total variaciones del ejercicio',
        variationRows,
        overrides,
        true
    ))

    // 13. Saldos al cierre = inicio ajustado + variaciones (vertical sum)
    const inicioAjustadoRow = rows.find(r => r.type === 'SALDO_INICIO_AJUSTADO')!
    const totalVariacionesRow = rows.find(r => r.type === 'TOTAL_VARIACIONES')!
    rows.push(createCalculatedRow(
        'cierre',
        'SALDO_CIERRE',
        'SALDOS AL CIERRE',
        [inicioAjustadoRow, totalVariacionesRow],
        overrides,
        true
    ))

    return rows
}

/**
 * Create a balance row from computed balances
 */
function createBalanceRow(
    id: string,
    type: EEPNRowType,
    label: string,
    balances: Map<string, ColumnBalance>,
    overrides: Map<string, number>,
    isTotal = false
): EEPNRow {
    const cells = new Map<string, EEPNCellValue>()
    let total = 0

    for (const col of EEPN_COLUMNS) {
        const colBalance = balances.get(col.id)
        const overrideKey = `${id}:${col.id}`
        const overrideValue = overrides.get(overrideKey)

        const amount = overrideValue !== undefined ? overrideValue : (colBalance?.balance ?? 0)
        total += amount

        cells.set(col.id, {
            amount,
            isOverridden: overrideValue !== undefined,
            breakdown: colBalance?.breakdown,
        })
    }

    return { id, type, label, cells, total, isTotal }
}

/**
 * Create a movement row from classified movements
 */
function createMovementRow(
    id: string,
    type: EEPNRowType,
    label: string,
    movements: ClassifiedMovement[],
    overrides: Map<string, number>,
    indent = 0
): EEPNRow {
    const cells = new Map<string, EEPNCellValue>()
    let total = 0

    // Aggregate by column
    for (const col of EEPN_COLUMNS) {
        let amount = 0
        const breakdown: EEPNCellBreakdown[] = []

        for (const mov of movements) {
            for (const pl of mov.pnLines) {
                const plCol = getColumnForAccount(pl.account.code)
                if (plCol?.id === col.id) {
                    amount += pl.signedAmount
                    breakdown.push({
                        entryId: mov.entry.id,
                        date: mov.entry.date,
                        memo: mov.entry.memo,
                        amount: pl.signedAmount,
                        accountCode: pl.account.code,
                        accountName: pl.account.name,
                    })
                }
            }
        }

        const overrideKey = `${id}:${col.id}`
        const overrideValue = overrides.get(overrideKey)
        const finalAmount = overrideValue !== undefined ? overrideValue : amount
        total += finalAmount

        cells.set(col.id, {
            amount: finalAmount,
            isOverridden: overrideValue !== undefined,
            breakdown,
        })
    }

    return { id, type, label, cells, total, indent }
}

/**
 * Create resultado del ejercicio row
 */
function createResultadoRow(
    id: string,
    movements: ClassifiedMovement[],
    overrides: Map<string, number>,
    netIncomeFromER?: number
): EEPNRow {
    const cells = new Map<string, EEPNCellValue>()
    let total = 0

    // For resultado del ejercicio, we put the value in the 'resultado_ejercicio' column
    for (const col of EEPN_COLUMNS) {
        const overrideKey = `${id}:${col.id}`
        const overrideValue = overrides.get(overrideKey)

        let amount = 0
        const breakdown: EEPNCellBreakdown[] = []

        if (col.id === 'resultado_ejercicio') {
            // Use ER value if available, otherwise calculate from movements
            if (netIncomeFromER !== undefined && overrideValue === undefined) {
                amount = netIncomeFromER
            } else {
                // Calculate from movements in 3.3.02
                for (const mov of movements) {
                    for (const pl of mov.pnLines) {
                        if (pl.account.code.startsWith('3.3.02')) {
                            amount += pl.signedAmount
                            breakdown.push({
                                entryId: mov.entry.id,
                                date: mov.entry.date,
                                memo: mov.entry.memo,
                                amount: pl.signedAmount,
                                accountCode: pl.account.code,
                                accountName: pl.account.name,
                            })
                        }
                    }
                }
            }
        }

        const finalAmount = overrideValue !== undefined ? overrideValue : amount
        total += finalAmount

        cells.set(col.id, {
            amount: finalAmount,
            isOverridden: overrideValue !== undefined,
            breakdown,
        })
    }

    return {
        id,
        type: 'RESULTADO_EJERCICIO',
        label: 'Resultado del ejercicio',
        cells,
        total,
        indent: 1,
    }
}

/**
 * Create a calculated (sum) row
 */
function createCalculatedRow(
    id: string,
    type: EEPNRowType,
    label: string,
    sourceRows: EEPNRow[],
    overrides: Map<string, number>,
    isTotal = false
): EEPNRow {
    const cells = new Map<string, EEPNCellValue>()
    let total = 0

    for (const col of EEPN_COLUMNS) {
        const overrideKey = `${id}:${col.id}`
        const overrideValue = overrides.get(overrideKey)

        let amount = 0
        for (const row of sourceRows) {
            const cell = row.cells.get(col.id)
            if (cell) {
                amount += cell.amount
            }
        }

        const finalAmount = overrideValue !== undefined ? overrideValue : amount
        total += finalAmount

        cells.set(col.id, {
            amount: finalAmount,
            isOverridden: overrideValue !== undefined,
        })
    }

    return { id, type, label, cells, total, isTotal }
}

/**
 * Create a section header row
 */
function createHeaderRow(id: string, label: string): EEPNRow {
    return {
        id,
        type: 'SECTION_HEADER',
        label,
        cells: new Map(),
        total: 0,
        isHeader: true,
    }
}

// ============================================
// Reconciliation
// ============================================

function computeReconciliation(
    pnCierre: number,
    pnFromBalance?: number,
    resultadoEEPN?: number,
    resultadoER?: number
): EEPNReconciliation {
    const warnings: string[] = []

    // Check balance sheet match
    const balanceDiff = pnFromBalance !== undefined ? pnCierre - pnFromBalance : 0
    const matchesBalance = pnFromBalance === undefined || Math.abs(balanceDiff) < TOLERANCE

    if (!matchesBalance) {
        warnings.push(`PN EEPN (${formatNumber(pnCierre)}) no coincide con Balance (${formatNumber(pnFromBalance!)})`)
    }

    // Check ER match
    const erDiff = resultadoER !== undefined && resultadoEEPN !== undefined
        ? (resultadoEEPN - resultadoER)
        : 0
    const matchesER = resultadoER === undefined || Math.abs(erDiff) < TOLERANCE

    if (!matchesER) {
        warnings.push(`Resultado EEPN (${formatNumber(resultadoEEPN!)}) no coincide con ER (${formatNumber(resultadoER!)})`)
    }

    return { matchesBalance, balanceDiff, matchesER, erDiff, warnings }
}

// ============================================
// Utility Functions
// ============================================

function sumRowTotal(rows: EEPNRow[], type: EEPNRowType): number {
    const row = rows.find(r => r.type === type)
    return row?.total ?? 0
}

function getRowTotal(rows: EEPNRow[], type: EEPNRowType): number | undefined {
    const row = rows.find(r => r.type === type)
    return row?.total
}

function formatNumber(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ============================================
// Public Helpers
// ============================================

/**
 * Get cell value with override support
 */
export function getCellValue(row: EEPNRow, colId: string): number {
    return row.cells.get(colId)?.amount ?? 0
}

/**
 * Check if cell is overridden
 */
export function isCellOverridden(row: EEPNRow, colId: string): boolean {
    return row.cells.get(colId)?.isOverridden ?? false
}

/**
 * Get cell breakdown
 */
export function getCellBreakdown(row: EEPNRow, colId: string): EEPNCellBreakdown[] {
    return row.cells.get(colId)?.breakdown ?? []
}
