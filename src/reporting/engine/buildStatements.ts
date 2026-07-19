/**
 * Motor único de reporting — engine (Fase 2B, §8).
 *
 * Fuente canónica: asientos POSTED/REVERSED del contexto + saldos de
 * apertura explícitos + taxonomía de cuentas. Toda la aritmética es en
 * centavos enteros (ADR modelo monetario). Ninguna línea se omite: las
 * cuentas inexistentes aparecen como fila propia y bloquean la publicación.
 */

import type { Account } from '../../core/models'
import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import { buildEquityMatrix } from './equityMatrix'
import { buildExpensesByFunction } from './expensesByFunction'
import { buildCostOfSales } from './costOfSales'
import { buildFixedAssetsAnnex } from './fixedAssetsAnnex'
import { buildForeignCurrency } from './foreignCurrency'
import type {
    BalanceSheet2B,
    EquityStatement2B,
    IncomeStatement2B,
    IncomeTaxStatus,
    NormalizedTrialBalance,
    ReportLine,
    ReportingInput,
    StatementValidationReport,
    StatementsBundle,
    TrialBalanceRow2B,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

// ─────────────────────────────────────────────────────────────
// 1. Balance de comprobación normalizado
// ─────────────────────────────────────────────────────────────

interface Accumulator {
    openingCents: number
    debitCents: number
    creditCents: number
    entryIds: Set<string>
}

export function buildNormalizedTrialBalance(input: ReportingInput): NormalizedTrialBalance {
    const acc = new Map<string, Accumulator>()
    const ensure = (id: string): Accumulator => {
        let a = acc.get(id)
        if (!a) {
            a = { openingCents: 0, debitCents: 0, creditCents: 0, entryIds: new Set() }
            acc.set(id, a)
        }
        return a
    }

    for (const [accountId, ob] of input.openingBalances) {
        const a = ensure(accountId)
        a.openingCents += toCents(ob.debit || 0) - toCents(ob.credit || 0)
    }

    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        for (const l of entry.lines) {
            const a = ensure(l.accountId)
            a.debitCents += toCents(l.debit || 0)
            a.creditCents += toCents(l.credit || 0)
            a.entryIds.add(entry.id)
        }
    }

    const accountsById = new Map(input.accounts.map(a => [a.id, a]))
    const rows: TrialBalanceRow2B[] = []
    let totD = 0, totC = 0, totOD = 0, totOC = 0

    for (const [accountId, a] of acc) {
        const account = accountsById.get(accountId)
        const closingCents = a.openingCents + a.debitCents - a.creditCents
        rows.push({
            accountId,
            code: account?.code ?? '?',
            name: account?.name ?? `⚠ Cuenta inexistente (${accountId})`,
            kind: account?.kind ?? 'ASSET',
            isContra: account?.isContra ?? false,
            opening: fromCents(a.openingCents),
            periodDebit: fromCents(a.debitCents),
            periodCredit: fromCents(a.creditCents),
            closing: fromCents(closingCents),
            entryIds: Array.from(a.entryIds),
            unknownAccount: !account,
        })
        totD += a.debitCents
        totC += a.creditCents
        if (a.openingCents > 0) totOD += a.openingCents
        else totOC += -a.openingCents
    }

    rows.sort((a, b) => a.code.localeCompare(b.code))

    return {
        context: input.context,
        rows,
        totalPeriodDebit: fromCents(totD),
        totalPeriodCredit: fromCents(totC),
        totalOpeningDebit: fromCents(totOD),
        totalOpeningCredit: fromCents(totOC),
        isBalanced: totD === totC && totOD === totOC,
    }
}

// ─────────────────────────────────────────────────────────────
// Helpers de líneas
// ─────────────────────────────────────────────────────────────

function makeLine(id: string, label: string, level: number, amountCents: number, accountIds: string[], children?: ReportLine[]): ReportLine {
    return { id, label, level, amount: fromCents(amountCents), accountIds, children }
}

interface GroupSpec {
    id: string
    label: string
    filter: (account: Account | undefined, row: TrialBalanceRow2B) => boolean
    /** signo: +1 usa neto D−C (deudoras), −1 usa H−D (acreedoras) */
    sign: 1 | -1
}

function buildGroupLine(tb: NormalizedTrialBalance, accountsById: Map<string, Account>, spec: GroupSpec, useClosing = true): ReportLine {
    const children: ReportLine[] = []
    let totalCents = 0
    for (const row of tb.rows) {
        const account = accountsById.get(row.accountId)
        if (!spec.filter(account, row)) continue
        const netCents = toCents(useClosing ? row.closing : fromCents(toCents(row.periodDebit) - toCents(row.periodCredit)))
        if (netCents === 0) continue
        const amountCents = spec.sign * netCents
        totalCents += amountCents
        children.push(makeLine(`${spec.id}:${row.accountId}`, `${row.code} ${row.name}`, 2, amountCents, [row.accountId]))
    }
    return makeLine(spec.id, spec.label, 1, totalCents,
        children.flatMap(c => c.accountIds), children)
}

const cents = (line: ReportLine) => toCents(line.amount)

// ─────────────────────────────────────────────────────────────
// 2. Estado de Situación Patrimonial
// ─────────────────────────────────────────────────────────────

export function buildBalanceSheet(tb: NormalizedTrialBalance, accounts: Account[], pendingResultCents: number): BalanceSheet2B {
    const byId = new Map(accounts.map(a => [a.id, a]))

    const isCurrent = (a: Account | undefined) => (a?.currentClassification ?? (a?.section === 'NON_CURRENT' ? 'NON_CURRENT' : 'CURRENT')) === 'CURRENT'

    const currentAssets = buildGroupLine(tb, byId, {
        id: 'esp:ac', label: 'Activo corriente', sign: 1,
        filter: a => !!a && a.kind === 'ASSET' && isCurrent(a),
    })
    const nonCurrentAssets = buildGroupLine(tb, byId, {
        id: 'esp:anc', label: 'Activo no corriente', sign: 1,
        filter: a => !!a && a.kind === 'ASSET' && !isCurrent(a),
    })
    // Cuentas inexistentes: se exponen (nunca se omiten) dentro del activo
    const unknown = buildGroupLine(tb, byId, {
        id: 'esp:unknown', label: '⚠ Cuentas inexistentes (regularizar)', sign: 1,
        filter: (_a, row) => row.unknownAccount,
    })

    const currentLiabilities = buildGroupLine(tb, byId, {
        id: 'esp:pc', label: 'Pasivo corriente', sign: -1,
        filter: a => !!a && a.kind === 'LIABILITY' && isCurrent(a),
    })
    const nonCurrentLiabilities = buildGroupLine(tb, byId, {
        id: 'esp:pnc', label: 'Pasivo no corriente', sign: -1,
        filter: a => !!a && a.kind === 'LIABILITY' && !isCurrent(a),
    })

    const equityAccounts = buildGroupLine(tb, byId, {
        id: 'esp:pn-cuentas', label: 'Cuentas de patrimonio neto', sign: -1,
        filter: a => !!a && a.kind === 'EQUITY',
    })

    const equityChildren = [...(equityAccounts.children ?? [])]
    if (pendingResultCents !== 0) {
        equityChildren.push(makeLine('esp:pn-resultado', 'Resultado del ejercicio (pendiente de refundición)', 2, pendingResultCents, []))
    }
    const equity = makeLine('esp:pn', 'Patrimonio neto', 1,
        cents(equityAccounts) + pendingResultCents,
        equityAccounts.accountIds, equityChildren)

    const totalAssetsCents = cents(currentAssets) + cents(nonCurrentAssets) + cents(unknown)
    const totalLiabCents = cents(currentLiabilities) + cents(nonCurrentLiabilities)

    const totalAssets = makeLine('esp:activo', 'Total del activo', 0, totalAssetsCents,
        [...currentAssets.accountIds, ...nonCurrentAssets.accountIds, ...unknown.accountIds],
        unknown.children && unknown.children.length > 0
            ? [currentAssets, nonCurrentAssets, unknown]
            : [currentAssets, nonCurrentAssets])
    const totalLiabilities = makeLine('esp:pasivo', 'Total del pasivo', 0, totalLiabCents,
        [...currentLiabilities.accountIds, ...nonCurrentLiabilities.accountIds],
        [currentLiabilities, nonCurrentLiabilities])
    const totalLE = makeLine('esp:pasivo-pn', 'Total pasivo + patrimonio neto', 0,
        totalLiabCents + cents(equity), [...totalLiabilities.accountIds, ...equity.accountIds])

    return {
        currentAssets,
        nonCurrentAssets,
        totalAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        totalLiabilities,
        equity,
        totalLiabilitiesAndEquity: totLine(totalLE),
        equationDifference: fromCents(totalAssetsCents - (totalLiabCents + cents(equity))),
    }

    function totLine(l: ReportLine) { return l }
}

// ─────────────────────────────────────────────────────────────
// 3. Estado de Resultados (sin heurísticas por nombre)
// ─────────────────────────────────────────────────────────────

const ER_GROUPS = {
    sales: new Set(['SALES']),
    cogs: new Set(['COGS']),
    admin: new Set(['ADMIN_EXPENSES']),
    selling: new Set(['SELLING_EXPENSES']),
    financial: new Set(['FINANCIAL_INCOME', 'FINANCIAL_EXPENSES']),
    other: new Set(['OTHER_OPERATING_INCOME', 'OTHER_INCOME', 'OTHER_EXPENSES']),
    tax: new Set(['INCOME_TAX']),
}

export function buildIncomeStatement(resultTb: NormalizedTrialBalance, accounts: Account[]): IncomeStatement2B {
    const byId = new Map(accounts.map(a => [a.id, a]))
    const isResult = (a: Account | undefined) => !!a && (a.kind === 'INCOME' || a.kind === 'EXPENSE')
    const inGroup = (a: Account | undefined, set: Set<string>) => isResult(a) && !!a?.statementGroup && set.has(a.statementGroup)

    // signo económico: ingresos H−D positivos; gastos D−H positivos ⇒
    // usamos "resultado" = H−D (positivo = ganancia) en todas las líneas
    const sales = buildGroupLine(resultTb, byId, {
        id: 'er:ventas', label: 'Ingresos por ventas', sign: -1,
        filter: a => inGroup(a, ER_GROUPS.sales),
    })
    const costOfSales = buildGroupLine(resultTb, byId, {
        id: 'er:cmv', label: 'Costo de ventas', sign: 1,
        filter: a => inGroup(a, ER_GROUPS.cogs),
    })
    const adminExpenses = buildGroupLine(resultTb, byId, {
        id: 'er:admin', label: 'Gastos de administración', sign: 1,
        filter: a => inGroup(a, ER_GROUPS.admin),
    })
    const sellingExpenses = buildGroupLine(resultTb, byId, {
        id: 'er:comercializacion', label: 'Gastos de comercialización', sign: 1,
        filter: a => inGroup(a, ER_GROUPS.selling),
    })
    const financialResults = buildGroupLine(resultTb, byId, {
        id: 'er:financieros', label: 'Resultados financieros y por tenencia (incl. RECPAM)', sign: -1,
        filter: a => inGroup(a, ER_GROUPS.financial),
    })
    // "Otros" incluye además cuentas de resultado SIN mapping (expuestas,
    // nunca omitidas; la validación las marca)
    const otherResults = buildGroupLine(resultTb, byId, {
        id: 'er:otros', label: 'Otros ingresos y egresos', sign: -1,
        filter: a => inGroup(a, ER_GROUPS.other) ||
            (isResult(a) && (!a?.statementGroup || ![...ER_GROUPS.sales, ...ER_GROUPS.cogs, ...ER_GROUPS.admin, ...ER_GROUPS.selling, ...ER_GROUPS.financial, ...ER_GROUPS.other, ...ER_GROUPS.tax].includes(a.statementGroup as string))),
    })
    // Impuesto a las ganancias: SOLO mapping estructural (Fase 2E, §5.2).
    // Signo 1: cargo por impuesto positivo (D−H); un recupero queda negativo.
    const incomeTax = buildGroupLine(resultTb, byId, {
        id: 'er:impuesto', label: 'Impuesto a las ganancias', sign: 1,
        filter: a => inGroup(a, ER_GROUPS.tax),
    })

    const hasTaxMapping = accounts.some(a =>
        (a.kind === 'INCOME' || a.kind === 'EXPENSE') && a.statementGroup === 'INCOME_TAX' && a.active !== false)
    const hasResultActivity = resultTb.rows.some(r => {
        const a = byId.get(r.accountId)
        return isResult(a) && (toCents(r.periodDebit) !== 0 || toCents(r.periodCredit) !== 0)
    })
    const incomeTaxStatus: IncomeTaxStatus =
        hasTaxMapping ? 'CALCULATED'
            : hasResultActivity ? 'INSUFFICIENT_INFORMATION'
                : 'NOT_APPLICABLE'

    const grossCents = cents(sales) - cents(costOfSales)
    const operatingCents = grossCents - cents(adminExpenses) - cents(sellingExpenses)
    const preTaxCents = operatingCents + cents(financialResults) + cents(otherResults)
    // Sin mapping, el impuesto integra el neto en 0 pero se EXPONE como
    // "información insuficiente" (nunca como $0 calculado).
    const taxCents = cents(incomeTax)
    const continuingCents = preTaxCents - taxCents
    // Operaciones discontinuadas: capability NOT_SUPPORTED ⇒ neto = continuadas.
    const netCents = continuingCents

    const operativeIds = [...sales.accountIds, ...costOfSales.accountIds, ...adminExpenses.accountIds, ...sellingExpenses.accountIds]
    const preTaxIds = [...operativeIds, ...financialResults.accountIds, ...otherResults.accountIds]

    return {
        sales,
        costOfSales,
        grossProfit: makeLine('er:bruto', 'Resultado bruto', 0, grossCents, [...sales.accountIds, ...costOfSales.accountIds]),
        adminExpenses,
        sellingExpenses,
        operatingResult: makeLine('er:operativo', 'Resultado operativo', 0, operatingCents, operativeIds),
        financialResults,
        otherResults,
        preTaxResult: makeLine('er:antes-impuesto', 'Resultado antes del impuesto a las ganancias', 0, preTaxCents, preTaxIds),
        incomeTax,
        incomeTaxStatus,
        continuingResult: makeLine('er:continuadas', 'Resultado de operaciones que continúan', 0, continuingCents,
            [...preTaxIds, ...incomeTax.accountIds]),
        netIncome: makeLine('er:neto', 'Resultado del ejercicio', 0, netCents,
            [...preTaxIds, ...incomeTax.accountIds]),
    }
}

// ─────────────────────────────────────────────────────────────
// 4. Estado de Evolución del Patrimonio Neto
// ─────────────────────────────────────────────────────────────

export function buildEquityStatement(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    incomeStatement: IncomeStatement2B
): EquityStatement2B {
    const byId = new Map(input.accounts.map(a => [a.id, a]))

    // Apertura del PN = −(neto de apertura de PN + resultados acumulados legacy)
    let openingCents = 0
    const openingIds: string[] = []
    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        const kind = account?.kind
        if (kind === 'EQUITY' || kind === 'INCOME' || kind === 'EXPENSE') {
            openingCents += -toCents(row.opening)
            if (toCents(row.opening) !== 0) openingIds.push(row.accountId)
        }
    }

    // Movimientos del período sobre cuentas de PN, EXCLUYENDO refundición/
    // transferencia (el resultado ingresa por su propia línea)
    const nonClosing = input.entries.filter(e => e.status !== 'DRAFT' && !isStructuralClosingEntry(e))
    const movByAccount = new Map<string, { cents: number; entryIds: Set<string> }>()
    for (const entry of nonClosing) {
        for (const l of entry.lines) {
            const account = byId.get(l.accountId)
            if (account?.kind !== 'EQUITY') continue
            const m = movByAccount.get(l.accountId) ?? { cents: 0, entryIds: new Set() }
            m.cents += toCents(l.credit || 0) - toCents(l.debit || 0) // acreedor positivo
            m.entryIds.add(entry.id)
            movByAccount.set(l.accountId, m)
        }
    }

    let contributionsCents = 0
    let distributionsCents = 0
    let reservesCents = 0
    let otherCents = 0
    const contribIds: string[] = []
    const distribIds: string[] = []
    const reservesIds: string[] = []
    const otherIds: string[] = []

    for (const [accountId, m] of movByAccount) {
        if (m.cents === 0) continue
        const group = byId.get(accountId)?.statementGroup
        if (group === 'CAPITAL' && m.cents > 0) {
            contributionsCents += m.cents; contribIds.push(accountId)
        } else if (group === 'RETAINED_EARNINGS' && m.cents < 0) {
            distributionsCents += -m.cents; distribIds.push(accountId)
        } else if (group === 'RESERVES') {
            reservesCents += m.cents; reservesIds.push(accountId)
        } else {
            otherCents += m.cents; otherIds.push(accountId)
        }
    }

    const resultCents = cents(incomeStatement.netIncome)
    const closingCents = openingCents + contributionsCents - distributionsCents + reservesCents + otherCents + resultCents

    return {
        openingBalance: makeLine('eepn:apertura', 'Saldos al inicio', 0, openingCents, openingIds),
        contributions: makeLine('eepn:aportes', 'Aportes de los propietarios', 1, contributionsCents, contribIds),
        distributions: makeLine('eepn:distribuciones', 'Distribuciones', 1, distributionsCents, distribIds),
        reservesMovements: makeLine('eepn:reservas', 'Constitución/desafectación de reservas', 1, reservesCents, reservesIds),
        otherMovements: makeLine('eepn:otros', 'Otros movimientos del PN', 1, otherCents, otherIds),
        periodResult: makeLine('eepn:resultado', 'Resultado del ejercicio', 1, resultCents, incomeStatement.netIncome.accountIds),
        closingBalance: makeLine('eepn:cierre', 'Saldos al cierre', 0, closingCents,
            [...new Set([...openingIds, ...contribIds, ...distribIds, ...reservesIds, ...otherIds])]),
    }
}

// ─────────────────────────────────────────────────────────────
// 5. Validación automática (§8.5)
// ─────────────────────────────────────────────────────────────

function check(id: string, label: string, expectedCents: number, actualCents: number, detail?: string): ValidationCheck {
    return {
        id, label,
        passed: expectedCents === actualCents,
        expected: fromCents(expectedCents),
        actual: fromCents(actualCents),
        difference: fromCents(actualCents - expectedCents),
        detail,
    }
}

export function validateStatements(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    bs: BalanceSheet2B,
    er: IncomeStatement2B,
    eepn: EquityStatement2B
): StatementValidationReport {
    const checks: ValidationCheck[] = []

    // Diario Debe = Haber
    checks.push(check('journal-balance', 'Diario: total Debe = total Haber',
        toCents(tb.totalPeriodDebit), toCents(tb.totalPeriodCredit)))

    // Apertura balanceada (apertura = cierre previo, verificable localmente)
    checks.push(check('opening-balance', 'Saldos de apertura balanceados',
        toCents(tb.totalOpeningDebit), toCents(tb.totalOpeningCredit)))

    // Mayor = Diario (por construcción del TB normalizado: se verifica que
    // la suma de movimientos por cuenta iguala los totales del diario)
    const rowsDebit = tb.rows.reduce((s, r) => s + toCents(r.periodDebit), 0)
    checks.push(check('ledger-journal', 'Mayor: débitos por cuenta = Debe del Diario',
        toCents(tb.totalPeriodDebit), rowsDebit))

    // Activo = Pasivo + PN
    checks.push(check('equation', 'Activo = Pasivo + Patrimonio neto',
        cents(bs.totalAssets), cents(bs.totalLiabilitiesAndEquity)))

    // ER = EEPN (resultado incorporado)
    checks.push(check('er-eepn', 'Resultado del ER = resultado incorporado al EEPN',
        cents(er.netIncome), cents(eepn.periodResult)))

    // Puente del impuesto (Fase 2E, §5.3): antes del impuesto − IG = neto
    checks.push(check('er-pretax', 'ER: resultado antes del impuesto − IG = resultado del ejercicio',
        cents(er.preTaxResult) - cents(er.incomeTax), cents(er.netIncome)))

    // PN del ESP = cierre del EEPN
    checks.push(check('eepn-esp', 'PN del ESP = saldo final del EEPN',
        cents(bs.equity), cents(eepn.closingBalance)))

    // Cuentas inexistentes con saldo: bloquean publicación
    const unknownRows = tb.rows.filter(r => r.unknownAccount && toCents(r.closing) !== 0)
    checks.push({
        id: 'unknown-accounts',
        label: 'Sin cuentas inexistentes con saldo',
        passed: unknownRows.length === 0,
        detail: unknownRows.length > 0
            ? `Cuentas a regularizar: ${unknownRows.map(r => r.accountId).join(', ')}`
            : undefined,
    })

    // Cuentas de resultado con saldo y sin mapping de exposición
    const accountsById = new Map(input.accounts.map(a => [a.id, a]))
    const unmapped = tb.rows.filter(r => {
        const a = accountsById.get(r.accountId)
        return a && (a.kind === 'INCOME' || a.kind === 'EXPENSE') && !a.statementGroup && toCents(r.closing) !== 0
    })
    checks.push({
        id: 'unmapped-results',
        label: 'Cuentas de resultado con saldo tienen grupo de exposición',
        passed: unmapped.length === 0,
        detail: unmapped.length > 0
            ? `Sin mapping: ${unmapped.map(r => `${r.code} ${r.name}`).join('; ')}`
            : undefined,
    })

    const allPassed = checks.every(c => c.passed)
    return { context: input.context, checks, allPassed, canPublish: allPassed }
}

// ─────────────────────────────────────────────────────────────
// 6. Orquestador
// ─────────────────────────────────────────────────────────────

/** Resultado del período pendiente de refundición según el TB principal */
function pendingResultCents(tb: NormalizedTrialBalance, accounts: Account[]): number {
    const byId = new Map(accounts.map(a => [a.id, a]))
    let cents = 0
    for (const row of tb.rows) {
        const kind = byId.get(row.accountId)?.kind
        if (kind === 'INCOME' || kind === 'EXPENSE') cents += -toCents(row.closing)
    }
    return cents
}

export function buildStatements(input: ReportingInput): StatementsBundle {
    // TB principal: TODOS los asientos del contexto (incluye refundición y apertura)
    const trialBalance = buildNormalizedTrialBalance(input)

    // TB de resultados: excluye refundición/transferencia (el ER muestra el
    // período aunque el ejercicio esté cerrado); la apertura no trae I/E.
    const resultInput: ReportingInput = {
        ...input,
        entries: input.entries.filter(e => !isStructuralClosingEntry(e)),
        openingBalances: new Map(), // el ER es de flujo del período, sin apertura
    }
    const resultTb = buildNormalizedTrialBalance(resultInput)

    const incomeStatement = buildIncomeStatement(resultTb, input.accounts)
    const balanceSheet = buildBalanceSheet(trialBalance, input.accounts, pendingResultCents(trialBalance, input.accounts))
    const equityStatement = buildEquityStatement(input, trialBalance, incomeStatement)
    const equityMatrix = buildEquityMatrix(input, trialBalance, incomeStatement)
    const expensesByFunction = buildExpensesByFunction(input, resultTb, incomeStatement)
    const costOfSales = buildCostOfSales(input, trialBalance, incomeStatement)
    const fixedAssetsAnnex = buildFixedAssetsAnnex(input, trialBalance)
    const foreignCurrency = buildForeignCurrency(input, trialBalance)
    const validation = validateStatements(input, trialBalance, balanceSheet, incomeStatement, equityStatement)

    // Puente EEPN matriz ↔ EEPN vertical ↔ ESP (Fase 2E, §6.8): el cierre de
    // la matriz debe coincidir con el cierre del EEPN (que ya se compara con
    // el PN del ESP); además se arrastran los invariantes internos de la matriz.
    validation.checks.push({
        id: 'eepn-matrix-closing',
        label: 'EEPN matriz: saldo final = saldo final del EEPN',
        passed: toCents(equityMatrix.closingRow.total) === toCents(equityStatement.closingBalance.amount),
        expected: equityStatement.closingBalance.amount,
        actual: equityMatrix.closingRow.total,
        difference: equityMatrix.closingRow.total - equityStatement.closingBalance.amount,
    })
    const matrixFailed = equityMatrix.validations.filter(v => !v.passed)
    validation.checks.push({
        id: 'eepn-matrix-internal',
        label: 'EEPN matriz: invariantes internos (filas, columnas, resultado)',
        passed: matrixFailed.length === 0,
        detail: matrixFailed.length > 0 ? matrixFailed.map(v => v.label).join(' · ') : undefined,
    })

    // Anexo de gastos por función (§9.4): conciliación con el ER + funciones
    const expensesFailed = expensesByFunction.validations.filter(v => !v.passed)
    validation.checks.push({
        id: 'gastos-funcion',
        label: 'Anexo de gastos por función: concilia con el ER y no hay gastos sin función',
        passed: expensesFailed.length === 0,
        detail: expensesFailed.length > 0 ? expensesFailed.map(v => v.detail ?? v.label).join(' · ') : undefined,
    })

    // Determinación del CMV (§10.5): el puente concilia con el ER y con el ESP
    const cmvFailed = costOfSales.validations.filter(v => !v.passed)
    validation.checks.push({
        id: 'cmv-puente',
        label: 'Costo de ventas: el puente EI + compras − EF concilia con el ER y el ESP',
        passed: cmvFailed.length === 0,
        detail: cmvFailed.length > 0 ? cmvFailed.map(v => v.detail ?? v.label).join(' · ') : undefined,
    })

    // Anexo de bienes de uso (§11): valor residual = PPE neto del ESP
    const ppeFailed = fixedAssetsAnnex.validations.filter(v => !v.passed)
    validation.checks.push({
        id: 'ppe-anexo',
        label: 'Anexo de bienes de uso: valor residual = Bienes de uso netos del ESP',
        passed: ppeFailed.length === 0,
        detail: ppeFailed.length > 0 ? ppeFailed.map(v => v.detail ?? v.label).join(' · ') : undefined,
    })

    validation.allPassed = validation.checks.every(c => c.passed)
    validation.canPublish = validation.allPassed

    // Comparativo: importes espejados línea a línea por id
    if (input.comparative) {
        attachComparatives(balanceSheet, input.comparative.balanceSheet)
        attachComparativesER(incomeStatement, input.comparative.incomeStatement)
    }

    return {
        context: input.context,
        trialBalance,
        balanceSheet,
        incomeStatement,
        equityStatement,
        equityMatrix,
        expensesByFunction,
        costOfSales,
        fixedAssetsAnnex,
        foreignCurrency,
        cashFlowDirect: null,   // se completa en buildCashFlow (EFE)
        cashFlowIndirect: null,
        validation,
    }
}

function indexLines(root: ReportLine, map: Map<string, ReportLine>) {
    map.set(root.id, root)
    for (const c of root.children ?? []) indexLines(c, map)
}

function applyComparative(target: ReportLine, source: Map<string, ReportLine>) {
    const match = source.get(target.id)
    target.comparativeAmount = match ? match.amount : null
    for (const c of target.children ?? []) applyComparative(c, source)
}

function attachComparatives(bs: BalanceSheet2B, prev: BalanceSheet2B) {
    const map = new Map<string, ReportLine>()
    for (const line of [prev.totalAssets, prev.totalLiabilities, prev.equity, prev.totalLiabilitiesAndEquity,
        prev.currentAssets, prev.nonCurrentAssets, prev.currentLiabilities, prev.nonCurrentLiabilities]) {
        indexLines(line, map)
    }
    for (const line of [bs.totalAssets, bs.totalLiabilities, bs.equity, bs.totalLiabilitiesAndEquity,
        bs.currentAssets, bs.nonCurrentAssets, bs.currentLiabilities, bs.nonCurrentLiabilities]) {
        applyComparative(line, map)
    }
}

/** Solo las líneas del ER (excluye campos de estado como incomeTaxStatus) */
function erLines(er: IncomeStatement2B): ReportLine[] {
    return [er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses,
        er.operatingResult, er.financialResults, er.otherResults,
        er.preTaxResult, er.incomeTax, er.continuingResult, er.netIncome]
}

function attachComparativesER(er: IncomeStatement2B, prev: IncomeStatement2B) {
    const map = new Map<string, ReportLine>()
    for (const line of erLines(prev)) indexLines(line, map)
    for (const line of erLines(er)) applyComparative(line, map)
}
