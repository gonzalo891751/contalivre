import type {
    Account,
    TrialBalance,
    FinancialStatements,
    BalanceSheet,
    IncomeStatement,
    StatementSection,
    StatementGroup,
} from './models'

const TOLERANCE = 0.01

/**
 * Crea una sección vacía del estado contable
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
 * Calcula el saldo de una cuenta para estados contables
 * Considera normalSide y si es contra-cuenta
 */
function getStatementBalance(
    account: Account,
    balanceDebit: number,
    balanceCredit: number
): number {
    // Raw balance (positive value)
    const rawBalance = balanceDebit > 0 ? balanceDebit : balanceCredit

    // For contra accounts, return as negative
    if (account.isContra) {
        return -rawBalance
    }

    return rawBalance
}

/**
 * Agrupa cuentas por statementGroup
 */
function groupByStatementGroup(
    rows: Array<{ account: Account; balanceDebit: number; balanceCredit: number }>
): Map<StatementGroup, Array<{ account: Account; balance: number }>> {
    const groups = new Map<StatementGroup, Array<{ account: Account; balance: number }>>()

    for (const row of rows) {
        if (!row.account.statementGroup) continue
        if (row.account.isHeader) continue

        const balance = getStatementBalance(row.account, row.balanceDebit, row.balanceCredit)
        if (Math.abs(balance) < TOLERANCE) continue

        const group = row.account.statementGroup
        if (!groups.has(group)) {
            groups.set(group, [])
        }
        groups.get(group)!.push({
            account: row.account,
            balance,
        })
    }

    return groups
}

/**
 * Crea una sección sumando cuentas de los grupos especificados
 */
function createSection(
    key: string,
    label: string,
    groups: Map<StatementGroup, Array<{ account: Account; balance: number }>>,
    statementGroups: StatementGroup[]
): StatementSection {
    const section = createEmptySection(key, label)

    for (const sg of statementGroups) {
        const accs = groups.get(sg) || []
        for (const { account, balance } of accs) {
            section.accounts.push({
                account,
                balance,
                isContra: account.isContra,
            })
            section.subtotal += balance
        }
    }

    section.subtotal = Math.round(section.subtotal * 100) / 100
    section.netTotal = section.subtotal // For sections, netTotal = subtotal
    return section
}

/**
 * Calcula el Estado de Situación Patrimonial (mejorado)
 */
function computeBalanceSheet(
    trialBalance: TrialBalance,
    netIncome: number
): BalanceSheet {
    const rows = trialBalance.rows.map((r) => ({
        account: r.account,
        balanceDebit: r.balanceDebit,
        balanceCredit: r.balanceCredit,
    }))

    const groups = groupByStatementGroup(rows)

    // Activo Corriente
    const currentAssets = createSection('currentAssets', 'Activo Corriente', groups, [
        'CASH_AND_BANKS',
        'TRADE_RECEIVABLES',
        'OTHER_RECEIVABLES',
        'TAX_CREDITS',
        'INVENTORIES',
    ])

    // Activo No Corriente
    const nonCurrentAssets = createSection('nonCurrentAssets', 'Activo No Corriente', groups, [
        'PPE',
        'INTANGIBLES',
        'INVESTMENTS',
    ])

    const totalAssets = Math.round((currentAssets.netTotal + nonCurrentAssets.netTotal) * 100) / 100

    // Pasivo Corriente
    const currentLiabilities = createSection('currentLiabilities', 'Pasivo Corriente', groups, [
        'TRADE_PAYABLES',
        'TAX_LIABILITIES',
        'PAYROLL_LIABILITIES',
        'OTHER_PAYABLES',
        'DEFERRED_INCOME',
    ])

    // Pasivo No Corriente
    const nonCurrentLiabilities = createSection('nonCurrentLiabilities', 'Pasivo No Corriente', groups, [
        'LOANS',
    ])

    const totalLiabilities = Math.round((currentLiabilities.netTotal + nonCurrentLiabilities.netTotal) * 100) / 100

    // Patrimonio Neto
    const equity = createSection('equity', 'Patrimonio Neto', groups, [
        'CAPITAL',
        'RESERVES',
        'RETAINED_EARNINGS',
    ])

    // Agregar resultado del ejercicio al PN
    if (Math.abs(netIncome) > TOLERANCE) {
        equity.accounts.push({
            account: {
                id: '__current_result__',
                code: '---',
                name: netIncome >= 0 ? 'Resultado del ejercicio (Ganancia)' : 'Resultado del ejercicio (Pérdida)',
                kind: 'EQUITY',
                section: 'CURRENT',
                group: 'Resultados',
                statementGroup: 'RETAINED_EARNINGS',
                parentId: null,
                level: 0,
                normalSide: 'CREDIT',
                isContra: false,
                isHeader: false,
            },
            balance: netIncome,
            isContra: false,
        })
        equity.subtotal = Math.round((equity.subtotal + netIncome) * 100) / 100
        equity.netTotal = equity.subtotal
    }

    const totalEquity = equity.netTotal
    const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100

    return {
        currentAssets,
        nonCurrentAssets,
        totalAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        totalLiabilities,
        equity,
        totalEquity,
        totalLiabilitiesAndEquity,
        isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) <= TOLERANCE,
    }
}

/**
 * Calcula el Estado de Resultados (mejorado)
 * Estructura:
 *   Ventas
 * - Costo de ventas
 * = RESULTADO BRUTO
 * - Gastos de administración
 * - Gastos de comercialización
 * = RESULTADO OPERATIVO
 * +/- Resultados financieros
 * +/- Otros resultados
 * = RESULTADO DEL EJERCICIO
 */
function computeIncomeStatement(trialBalance: TrialBalance): IncomeStatement {
    const rows = trialBalance.rows.map((r) => ({
        account: r.account,
        balanceDebit: r.balanceDebit,
        balanceCredit: r.balanceCredit,
    }))

    const groups = groupByStatementGroup(rows)

    // Ventas
    const sales = createSection('sales', 'Ingresos por ventas', groups, [
        'SALES',
        'OTHER_OPERATING_INCOME',
    ])

    // Costo de ventas
    const cogs = createSection('cogs', 'Costo de ventas', groups, ['COGS'])

    // Resultado bruto
    const grossProfit = Math.round((sales.netTotal - Math.abs(cogs.netTotal)) * 100) / 100

    // Gastos de administración
    const adminExpenses = createSection('adminExpenses', 'Gastos de administración', groups, [
        'ADMIN_EXPENSES',
    ])

    // Gastos de comercialización
    const sellingExpenses = createSection('sellingExpenses', 'Gastos de comercialización', groups, [
        'SELLING_EXPENSES',
    ])

    // Resultado operativo
    const operatingIncome = Math.round(
        (grossProfit - Math.abs(adminExpenses.netTotal) - Math.abs(sellingExpenses.netTotal)) * 100
    ) / 100

    // Resultados financieros
    const financialIncome = createSection('financialIncome', 'Ingresos financieros', groups, [
        'FINANCIAL_INCOME',
    ])

    const financialExpenses = createSection('financialExpenses', 'Gastos financieros', groups, [
        'FINANCIAL_EXPENSES',
    ])

    const netFinancialResult = Math.round(
        (financialIncome.netTotal - Math.abs(financialExpenses.netTotal)) * 100
    ) / 100

    // Otros resultados
    const otherIncome = createSection('otherIncome', 'Otros ingresos', groups, ['OTHER_INCOME'])

    const otherExpenses = createSection('otherExpenses', 'Otros gastos', groups, ['OTHER_EXPENSES'])

    const netOtherResult = Math.round(
        (otherIncome.netTotal - Math.abs(otherExpenses.netTotal)) * 100
    ) / 100

    // Resultado del ejercicio
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

/**
 * Calcula los estados contables completos a partir del balance de sumas y saldos
 */
export function computeStatements(
    trialBalance: TrialBalance,
    _accounts: Account[]
): FinancialStatements {
    // Primero calculamos el estado de resultados para obtener el resultado del ejercicio
    const incomeStatement = computeIncomeStatement(trialBalance)

    // Luego el estado de situación patrimonial, incluyendo el resultado
    const balanceSheet = computeBalanceSheet(trialBalance, incomeStatement.netIncome)

    return {
        balanceSheet,
        incomeStatement,
    }
}

/**
 * Genera un mensaje explicativo sobre los estados contables
 */
export function getStatementsStatusMessage(statements: FinancialStatements): string[] {
    const messages: string[] = []

    // Estado de Resultados
    const { netIncome, grossProfit } = statements.incomeStatement

    if (grossProfit !== 0) {
        messages.push(`Resultado bruto: $${Math.abs(grossProfit).toFixed(2)} ${grossProfit >= 0 ? '(ganancia)' : '(pérdida)'}`)
    }

    if (netIncome > 0) {
        messages.push(`El ejercicio muestra una ganancia neta de $${netIncome.toFixed(2)}`)
    } else if (netIncome < 0) {
        messages.push(`El ejercicio muestra una pérdida neta de $${Math.abs(netIncome).toFixed(2)}`)
    } else {
        messages.push('El ejercicio está equilibrado (sin ganancia ni pérdida)')
    }

    // Estado de Situación Patrimonial
    if (statements.balanceSheet.isBalanced) {
        messages.push('✓ El Estado de Situación Patrimonial cuadra: Activo = Pasivo + PN')
    } else {
        const diff =
            statements.balanceSheet.totalAssets - statements.balanceSheet.totalLiabilitiesAndEquity
        messages.push(
            `✗ El Estado de Situación Patrimonial no cuadra: diferencia de $${Math.abs(diff).toFixed(2)}`
        )
    }

    return messages
}
