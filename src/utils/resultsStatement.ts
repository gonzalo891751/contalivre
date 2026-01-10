import type {
    Account,
    JournalEntry,
    TrialBalance,
    IncomeStatement,
    StatementSection,
    TrialBalanceRow
} from '../core/models'

const TOLERANCE = 0.01

/**
 * Normaliza strings para comparación (trim, lowercase, sin tildes)
 */
function normalize(str: string): string {
    return str.toLowerCase()
        .trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Identifica el ID de la cuenta "Resultado del ejercicio"
 */
export function findResultAccountId(accounts: Account[]): string | null {
    // Prioridad 1: Nombre exacto normalizado
    const targetName = "resultado del ejercicio"
    const found = accounts.find(a => normalize(a.name) === targetName)
    if (found) return found.id

    // Prioridad 2: Buscar en rubro patrimonio neto si hay algo parecido
    // (Por ahora simplificamos a nombre)
    return null
}

/**
 * Detecta y devuelve los IDs de los asientos de cierre/refundición
 */
export function getClosingEntryIds(entries: JournalEntry[], accounts: Account[]): string[] {
    const resultAccountId = findResultAccountId(accounts)
    if (!resultAccountId) return []

    const closingIds: string[] = []

    for (const entry of entries) {
        // Criterio 1: Tiene linea con resultadoDelEjercicio
        const hasResultAccount = entry.lines.some(l => l.accountId === resultAccountId)
        if (!hasResultAccount) continue

        // Criterio 2: Toca múltiples cuentas de resultado (Ingreso/Gasto)
        // Contamos cuántas líneas son de cuentas de resultado
        let resultLinesCount = 0
        for (const line of entry.lines) {
            const acc = accounts.find(a => a.id === line.accountId)
            if (acc && (acc.kind === 'INCOME' || acc.kind === 'EXPENSE')) {
                resultLinesCount++
            }
        }

        // Si toca al menos 2 cuentas de resultados y la cuenta de resultado del ejercicio, es muy probable que sea cierre
        // (El asiento de cierre típico debita los ingresos y acredita los gastos, o viceversa, y la diferencia a Res Ejercicio)
        if (resultLinesCount >= 2) {
            closingIds.push(entry.id)
        }
    }

    return closingIds
}

/**
 * Filtra los asientos excluyendo los de cierre
 */
export function excludeClosingEntries(entries: JournalEntry[], accounts: Account[]): JournalEntry[] {
    const closingIds = getClosingEntryIds(entries, accounts)
    if (closingIds.length === 0) return entries
    return entries.filter(e => !closingIds.includes(e.id))
}

/**
 * Helper para crear secciones
 */
function createEmptySection(key: string, label: string): StatementSection {
    return {
        key,
        label,
        accounts: [],
        subtotal: 0,
        netTotal: 0,
    }
}

/**
 * Calcula el monto con signo (Credit - Debit).
 * > 0 => Saldo Acreedor (Ganancia en cuentas de res)
 * < 0 => Saldo Deudor (Pérdida en cuentas de res)
 */
function getSignedAmount(row: TrialBalanceRow): number {
    // TrialBalanceRow ya tiene balanceDebit/Credit neteados (uno es 0)
    // Signed = Credit - Debit
    return row.balanceCredit - row.balanceDebit
}

/**
 * Agrega una cuenta a una sección
 */
function addAccountToSection(section: StatementSection, row: TrialBalanceRow, signedAmount: number) {
    // En el ER mostramos valor absoluto
    section.accounts.push({
        account: row.account,
        balance: Math.abs(signedAmount),
        isContra: false // Ya no usamos isContra para el signo visual, usamos signo intrínseco
    })
    section.subtotal += signedAmount
}

/**
 * Finaliza la sección (redondeos)
 */
function finalizeSection(section: StatementSection) {
    section.subtotal = Math.round(section.subtotal * 100) / 100
    section.netTotal = section.subtotal
}

/**
 * Nueva lógica de cálculo del ER basada en signos
 */
export function computeRevisedIncomeStatement(trialBalance: TrialBalance): IncomeStatement {
    // Preparar secciones
    const sales = createEmptySection('sales', 'Ingresos por ventas')
    const cogs = createEmptySection('cogs', 'Costo de ventas')
    const adminExpenses = createEmptySection('adminExpenses', 'Gastos de administración')
    const sellingExpenses = createEmptySection('sellingExpenses', 'Gastos de comercialización')

    // Secciones dinámicas (split)
    const financialIncome = createEmptySection('financialIncome', 'Ingresos financieros')
    const financialExpenses = createEmptySection('financialExpenses', 'Gastos financieros')

    const otherIncome = createEmptySection('otherIncome', 'Otros ingresos')
    const otherExpenses = createEmptySection('otherExpenses', 'Otros gastos')

    // Iterar filas del balance
    for (const row of trialBalance.rows) {
        // Solo cuentas de Resultado
        if (!['INCOME', 'EXPENSE'].includes(row.account.kind)) continue
        if (Math.abs(row.balanceDebit + row.balanceCredit) < TOLERANCE) continue

        const signedAmount = getSignedAmount(row)
        const group = row.account.statementGroup

        // 1. Ventas y Costo (Manejo tradicional)
        if (group === 'SALES' || group === 'OTHER_OPERATING_INCOME') {
            addAccountToSection(sales, row, signedAmount)
            continue
        }
        if (group === 'COGS') {
            addAccountToSection(cogs, row, signedAmount)
            continue
        }

        // 2. Gastos Operativos (Admin y Ventas) - Asumimos comportamiento "Standard"
        // Si hay una "Ganancia" acá (saldo acreedor), restará al gasto (haciéndolo menos negativo o positivo)
        if (group === 'ADMIN_EXPENSES') {
            addAccountToSection(adminExpenses, row, signedAmount)
            continue
        }
        if (group === 'SELLING_EXPENSES') {
            addAccountToSection(sellingExpenses, row, signedAmount)
            continue
        }

        // 3. Financieros (Manejo dinámico por signo)
        if (group === 'FINANCIAL_INCOME' || group === 'FINANCIAL_EXPENSES') {
            if (signedAmount > 0) {
                // Ganancia
                addAccountToSection(financialIncome, row, signedAmount)
            } else {
                // Pérdida
                addAccountToSection(financialExpenses, row, signedAmount)
            }
            continue
        }

        // 4. Otros Resultados (Manejo dinámico por signo)
        if (group === 'OTHER_INCOME' || group === 'OTHER_EXPENSES') {
            if (signedAmount > 0) {
                addAccountToSection(otherIncome, row, signedAmount)
            } else {
                addAccountToSection(otherExpenses, row, signedAmount)
            }
            continue
        }

        // Si no tiene grupo o no matchea, por defecto a Otros
        if (signedAmount > 0) {
            addAccountToSection(otherIncome, row, signedAmount)
        } else {
            addAccountToSection(otherExpenses, row, signedAmount)
        }
    }

    // Finalizar Secciones
    finalizeSection(sales)
    finalizeSection(cogs)
    finalizeSection(adminExpenses)
    finalizeSection(sellingExpenses)
    finalizeSection(financialIncome)
    finalizeSection(financialExpenses)
    finalizeSection(otherIncome)
    finalizeSection(otherExpenses)

    // Calcular Totales
    // Resultado Bruto = Ventas + Costo (Costo es negativo)
    const grossProfit = Math.round((sales.netTotal + cogs.netTotal) * 100) / 100

    // Resultado Operativo = Bruto + Admin + Comercialización (Gastos son negativos)
    const operatingIncome = Math.round(
        (grossProfit + adminExpenses.netTotal + sellingExpenses.netTotal) * 100
    ) / 100

    // Neto Financiero
    const netFinancialResult = Math.round(
        (financialIncome.netTotal + financialExpenses.netTotal) * 100
    ) / 100

    // Neto Otros
    const netOtherResult = Math.round(
        (otherIncome.netTotal + otherExpenses.netTotal) * 100
    ) / 100

    // Resultado Final
    const netIncome = Math.round(
        (operatingIncome + netFinancialResult + netOtherResult) * 100
    ) / 100

    return {
        sales,
        cogs,
        grossProfit,
        adminExpenses,
        sellingExpenses,
        operatingIncome,
        financialIncome,
        financialExpenses,
        netFinancialResult,
        otherIncome,
        otherExpenses,
        netOtherResult,
        netIncome,
    }
}
