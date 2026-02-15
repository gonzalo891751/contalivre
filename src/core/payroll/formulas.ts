/**
 * Safe payroll formula evaluator.
 *
 * Evaluates expressions like "0.01 * years * base" with whitelisted variables.
 * Reuses the shunting-yard parser from amount-expression.ts pattern — no eval().
 */

import { parseAmountExpression } from '../../lib/amount-expression'

/** Variables available in payroll formulas */
export interface PayrollFormulaVars {
    years: number   // seniority in years
    base: number    // base gross salary
    gross: number   // total gross (remunerative sum)
    basic: number   // basic salary
    remSum: number  // remunerative sum
}

const ALLOWED_VARS = ['years', 'base', 'gross', 'basic', 'remSum'] as const

/**
 * Evaluate a payroll formula expression with variable substitution.
 * Returns the computed amount (rounded to 2 decimals).
 * Throws if formula is invalid or contains disallowed tokens.
 */
export function evaluatePayrollFormula(
    expr: string,
    vars: PayrollFormulaVars,
): number {
    if (!expr || !expr.trim()) return 0

    // Validate: only allowed chars (digits, operators, parens, dots, spaces, variable names)
    const cleaned = expr.trim()
    const validPattern = /^[0-9+\-*/().,%\s a-zA-Z_]+$/
    if (!validPattern.test(cleaned)) {
        throw new Error(`Formula contiene caracteres no permitidos: "${cleaned}"`)
    }

    // Replace variable names with their numeric values
    let processed = cleaned
    for (const varName of ALLOWED_VARS) {
        const regex = new RegExp(`\\b${varName}\\b`, 'g')
        processed = processed.replace(regex, String(vars[varName]))
    }

    // Check for any remaining alphabetic tokens (disallowed variables)
    const remaining = processed.replace(/[0-9+\-*/().%\s,]/g, '')
    if (remaining.length > 0) {
        throw new Error(`Variables no reconocidas en formula: "${remaining}"`)
    }

    // Use existing safe parser (prepend '=' as it expects)
    const result = parseAmountExpression('=' + processed)
    if (result.ok) return result.value
    throw new Error(`Formula invalida: ${result.error}`)
}

/**
 * Preview a formula's computation for display.
 * Returns a human-readable string showing the substitution.
 */
export function previewFormula(
    expr: string,
    vars: PayrollFormulaVars,
): string {
    if (!expr) return '—'
    let preview = expr.trim()
    for (const varName of ALLOWED_VARS) {
        const regex = new RegExp(`\\b${varName}\\b`, 'g')
        const val = vars[varName]
        preview = preview.replace(regex, String(val))
    }
    try {
        const result = evaluatePayrollFormula(expr, vars)
        return `${preview} = ${result.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    } catch {
        return `${preview} = ?`
    }
}
