/**
 * Anexo de gastos por función — Fase 2E (§9).
 *
 * Función PURA del motor: matriz cuenta × función derivada exclusivamente de
 * la taxonomía estructural (`resultFunction`, con derivación de respaldo desde
 * `statementGroup`) y de las reglas versionadas de distribución (§9.2). Jamás
 * se infiere por nombre. COGS e INCOME_TAX quedan fuera del anexo: el costo
 * tiene su puente propio y el impuesto su renglón del ER.
 *
 * La distribución por regla es de EXPOSICIÓN: reparte el importe de la cuenta
 * en centavos exactos (el residuo de redondeo va a la función de mayor
 * porcentaje) y NUNCA modifica asientos. Una regla cuyos porcentajes no suman
 * exactamente 100 se considera inválida: la cuenta pasa a "sin función" y la
 * validación lo reporta.
 */

import type { Account, ExpenseAllocationRule, ResultFunction } from '../../core/models'
import { toCents } from '../../accounting/domain/money'
import type {
    ExpenseAccountRow,
    ExpensesByFunctionMatrix,
    IncomeStatement2B,
    NormalizedTrialBalance,
    ReportingInput,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

export const RESULT_FUNCTION_LABEL: Record<ResultFunction, string> = {
    ADMINISTRATION: 'Administración',
    SELLING: 'Comercialización',
    PRODUCTION: 'Producción / costos directos',
    FINANCIAL: 'Financieros',
    OTHER: 'Otros',
}

const FUNCTION_ORDER: ResultFunction[] = ['ADMINISTRATION', 'SELLING', 'PRODUCTION', 'FINANCIAL', 'OTHER']

const KNOWN_FUNCTIONS = new Set<string>(FUNCTION_ORDER)

/**
 * Función estructural de una cuenta de gasto. Mapping explícito primero;
 * derivación de respaldo por statementGroup. null = sin función (unmapped).
 */
export function deriveResultFunction(account: Account): ResultFunction | null {
    if (account.resultFunction && KNOWN_FUNCTIONS.has(account.resultFunction)) {
        return account.resultFunction as ResultFunction
    }
    switch (account.statementGroup) {
        case 'ADMIN_EXPENSES': return 'ADMINISTRATION'
        case 'SELLING_EXPENSES': return 'SELLING'
        case 'FINANCIAL_EXPENSES': return 'FINANCIAL'
        case 'OTHER_EXPENSES': return 'OTHER'
        default: return null
    }
}

/** Regla vigente para la cuenta en el período (la de mayor versión si hay varias) */
export function activeRuleFor(
    accountId: string,
    rules: ExpenseAllocationRule[],
    periodEnd: string
): ExpenseAllocationRule | null {
    const candidates = rules.filter(r =>
        r.accountId === accountId
        && r.validFrom <= periodEnd
        && (!r.validTo || r.validTo >= periodEnd))
    if (candidates.length === 0) return null
    return candidates.reduce((a, b) => (b.version > a.version ? b : a))
}

/** ¿Los porcentajes suman exactamente 100? (en centésimas, sin tolerancia) */
export function ruleIsValid(rule: ExpenseAllocationRule): boolean {
    if (rule.allocations.length === 0) return false
    const sumBps = rule.allocations.reduce((s, a) => s + Math.round(a.percentage * 100), 0)
    return sumBps === 10000 && rule.allocations.every(a => a.percentage > 0 && KNOWN_FUNCTIONS.has(a.function))
}

/** Reparte centavos exactos según la regla; el residuo va al mayor porcentaje */
function allocateCents(totalCents: number, rule: ExpenseAllocationRule): Partial<Record<ResultFunction, number>> {
    const cells: Partial<Record<ResultFunction, number>> = {}
    let assigned = 0
    let largest: ResultFunction = rule.allocations[0].function
    let largestPct = -1
    for (const a of rule.allocations) {
        const cents = Math.round(totalCents * (Math.round(a.percentage * 100) / 10000))
        cells[a.function] = (cells[a.function] ?? 0) + cents
        assigned += cents
        if (a.percentage > largestPct) { largestPct = a.percentage; largest = a.function }
    }
    const residue = totalCents - assigned
    if (residue !== 0) cells[largest] = (cells[largest] ?? 0) + residue
    return cells
}

export function buildExpensesByFunction(
    input: ReportingInput,
    resultTb: NormalizedTrialBalance,
    incomeStatement: IncomeStatement2B
): ExpensesByFunctionMatrix {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const rules = input.allocationRules ?? []
    const periodEnd = input.context.periodEnd

    const rows: ExpenseAccountRow[] = []
    const unmapped: ExpensesByFunctionMatrix['unmappedExpenses'] = []
    const totalsByFunction: Partial<Record<ResultFunction, number>> = {}
    let totalCents = 0
    const invalidRules: string[] = []

    // Comparativo por cuenta desde el anexo del ejercicio anterior (mismo motor)
    const compRows = new Map<string, number>()
    if (input.comparative?.expensesByFunction) {
        for (const r of input.comparative.expensesByFunction.rows) compRows.set(r.accountId, r.total)
        for (const u of input.comparative.expensesByFunction.unmappedExpenses) compRows.set(u.accountId, u.total)
    }

    for (const row of resultTb.rows) {
        const account = byId.get(row.accountId)
        if (!account || account.kind !== 'EXPENSE') continue
        if (account.statementGroup === 'COGS' || account.statementGroup === 'INCOME_TAX') continue
        // gasto del período: neto D−H (positivo = gasto)
        const cents = toCents(row.closing)
        if (cents === 0) continue

        const rule = activeRuleFor(row.accountId, rules, periodEnd)
        let cellsCents: Partial<Record<ResultFunction, number>> | null = null
        let source: ExpenseAccountRow['source'] = 'DERIVED'
        let ruleId: string | undefined

        if (rule) {
            if (ruleIsValid(rule)) {
                cellsCents = allocateCents(cents, rule)
                source = 'RULE'
                ruleId = rule.id
            } else {
                invalidRules.push(`${account.code} ${account.name} (regla ${rule.id}: los porcentajes no suman 100)`)
            }
        }
        if (!cellsCents) {
            const fn = deriveResultFunction(account)
            if (fn) {
                cellsCents = { [fn]: cents }
                source = account.resultFunction && KNOWN_FUNCTIONS.has(account.resultFunction) ? 'MAPPING' : 'DERIVED'
            }
        }

        if (!cellsCents) {
            unmapped.push({ accountId: row.accountId, code: account.code, name: account.name, total: fromCents(cents) })
            continue
        }

        const cells: Partial<Record<ResultFunction, number>> = {}
        for (const [fn, c] of Object.entries(cellsCents)) {
            cells[fn as ResultFunction] = fromCents(c!)
            totalsByFunction[fn as ResultFunction] = fromCents(toCents(totalsByFunction[fn as ResultFunction] ?? 0) + c!)
        }
        totalCents += cents
        rows.push({
            accountId: row.accountId,
            code: account.code,
            name: account.name,
            total: fromCents(cents),
            comparativeTotal: input.comparative ? (compRows.get(row.accountId) ?? 0) : undefined,
            cells,
            source,
            ruleId,
        })
    }

    rows.sort((a, b) => a.code.localeCompare(b.code))

    const columns = FUNCTION_ORDER
        .filter(fn => totalsByFunction[fn] !== undefined)
        .map(fn => ({ function: fn, label: RESULT_FUNCTION_LABEL[fn] }))

    // ── Invariantes (§9.4) ───────────────────────────────────
    const validations: ValidationCheck[] = []
    const check = (id: string, label: string, expected: number, actual: number, detail?: string) => {
        validations.push({
            id, label,
            passed: expected === actual,
            expected: fromCents(expected), actual: fromCents(actual),
            difference: fromCents(actual - expected), detail,
        })
    }

    // Suma de funciones de cada cuenta = total de la cuenta
    for (const r of rows) {
        const sum = Object.values(r.cells).reduce((s, v) => s + toCents(v ?? 0), 0)
        check(`gastos-fn-row-${r.accountId}`, `Anexo gastos: ${r.code} — funciones = total de la cuenta`, toCents(r.total), sum)
    }

    // Suma del anexo = gastos expuestos en el ER para las MISMAS cuentas
    // (dos caminos: anexo por cuenta vs renglones del ER). El ER expone los
    // gastos con signo positivo en admin/selling y como resultado negativo en
    // financieros/otros; acá se recomputa desde sus children.
    let erExpenseCents = 0
    const annexAccountIds = new Set([...rows.map(r => r.accountId), ...unmapped.map(u => u.accountId)])
    const collectFromEr = (line: { children?: { accountIds: string[]; amount: number }[] }, sign: 1 | -1) => {
        for (const c of line.children ?? []) {
            if (c.accountIds.length === 1 && annexAccountIds.has(c.accountIds[0])) {
                erExpenseCents += sign * toCents(c.amount)
            }
        }
    }
    collectFromEr(incomeStatement.adminExpenses, 1)
    collectFromEr(incomeStatement.sellingExpenses, 1)
    // financieros y otros vienen con signo económico (gasto = negativo)
    collectFromEr(incomeStatement.financialResults, -1)
    collectFromEr(incomeStatement.otherResults, -1)

    const annexTotalCents = totalCents + unmapped.reduce((s, u) => s + toCents(u.total), 0)
    check('gastos-fn-er', 'Anexo gastos: total del anexo = gastos expuestos en el ER',
        erExpenseCents, annexTotalCents)

    validations.push({
        id: 'gastos-fn-unmapped',
        label: 'Anexo gastos: sin cuentas de gasto sin función',
        passed: unmapped.length === 0 && invalidRules.length === 0,
        detail: [
            unmapped.length > 0 ? `Sin función: ${unmapped.map(u => `${u.code} ${u.name}`).join('; ')}` : null,
            invalidRules.length > 0 ? `Reglas inválidas: ${invalidRules.join('; ')}` : null,
        ].filter(Boolean).join(' · ') || undefined,
    })

    return {
        rows,
        columns,
        totals: {
            byFunction: totalsByFunction,
            total: fromCents(totalCents),
            comparativeTotal: input.comparative?.expensesByFunction
                ? input.comparative.expensesByFunction.totals.total
                : undefined,
        },
        unmappedExpenses: unmapped,
        validations,
    }
}
