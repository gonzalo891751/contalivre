/**
 * Safe arithmetic expression parser for amount inputs.
 *
 * Supports `+ - * / ( )` with decimal numbers.
 * Only activates when the input starts with `=`.
 * Uses shunting-yard / RPN evaluation — no `eval`.
 */

type Token = { type: 'NUM'; value: number } | { type: 'OP'; value: string } | { type: 'LPAREN' } | { type: 'RPAREN' }

const OPERATORS: Record<string, { prec: number; assoc: 'L' | 'R' }> = {
    '+': { prec: 1, assoc: 'L' },
    '-': { prec: 1, assoc: 'L' },
    '*': { prec: 2, assoc: 'L' },
    '/': { prec: 2, assoc: 'L' },
}

/**
 * Tokenize the expression string into numbers, operators, and parentheses.
 * Handles negative numbers (unary minus at start or after `(` or operator).
 */
function tokenize(expr: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    while (i < expr.length) {
        const ch = expr[i]
        if (ch === ' ') { i++; continue }
        if (ch === '(') { tokens.push({ type: 'LPAREN' }); i++; continue }
        if (ch === ')') { tokens.push({ type: 'RPAREN' }); i++; continue }
        if (ch in OPERATORS) {
            // Handle unary minus: if '-' at start or after '(' or after operator
            if (ch === '-') {
                const prev = tokens[tokens.length - 1]
                const isUnary = !prev || prev.type === 'LPAREN' || prev.type === 'OP'
                if (isUnary) {
                    // Read the number after the minus
                    i++
                    const start = i
                    while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) i++
                    if (i === start) throw new Error('Expresión inválida: "-" sin número')
                    tokens.push({ type: 'NUM', value: -parseFloat(expr.slice(start, i)) })
                    continue
                }
            }
            tokens.push({ type: 'OP', value: ch })
            i++
            continue
        }
        if (/\d/.test(ch) || ch === '.') {
            const start = i
            while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) i++
            const numStr = expr.slice(start, i)
            const num = parseFloat(numStr)
            if (isNaN(num)) throw new Error(`Número inválido: "${numStr}"`)
            tokens.push({ type: 'NUM', value: num })
            continue
        }
        throw new Error(`Carácter no permitido: "${ch}"`)
    }
    return tokens
}

/**
 * Shunting-yard algorithm: convert infix tokens to RPN (postfix) queue.
 */
function toRPN(tokens: Token[]): Token[] {
    const output: Token[] = []
    const opStack: Token[] = []

    for (const token of tokens) {
        if (token.type === 'NUM') {
            output.push(token)
        } else if (token.type === 'OP') {
            const o1 = OPERATORS[token.value]
            while (opStack.length > 0) {
                const top = opStack[opStack.length - 1]
                if (top.type === 'OP') {
                    const o2 = OPERATORS[top.value]
                    if ((o1.assoc === 'L' && o1.prec <= o2.prec) || (o1.assoc === 'R' && o1.prec < o2.prec)) {
                        output.push(opStack.pop()!)
                        continue
                    }
                }
                break
            }
            opStack.push(token)
        } else if (token.type === 'LPAREN') {
            opStack.push(token)
        } else if (token.type === 'RPAREN') {
            let foundParen = false
            while (opStack.length > 0) {
                const top = opStack.pop()!
                if (top.type === 'LPAREN') { foundParen = true; break }
                output.push(top)
            }
            if (!foundParen) throw new Error('Paréntesis desbalanceados')
        }
    }

    while (opStack.length > 0) {
        const top = opStack.pop()!
        if (top.type === 'LPAREN') throw new Error('Paréntesis desbalanceados')
        output.push(top)
    }

    return output
}

/**
 * Evaluate an RPN queue and return the numeric result.
 */
function evaluateRPN(rpn: Token[]): number {
    const stack: number[] = []
    for (const token of rpn) {
        if (token.type === 'NUM') {
            stack.push(token.value)
        } else if (token.type === 'OP') {
            if (stack.length < 2) throw new Error('Expresión incompleta')
            const b = stack.pop()!
            const a = stack.pop()!
            switch (token.value) {
                case '+': stack.push(a + b); break
                case '-': stack.push(a - b); break
                case '*': stack.push(a * b); break
                case '/':
                    if (b === 0) throw new Error('División por cero')
                    stack.push(a / b)
                    break
                default: throw new Error(`Operador desconocido: "${token.value}"`)
            }
        }
    }
    if (stack.length !== 1) throw new Error('Expresión inválida')
    return stack[0]
}

export type ParseResult =
    | { ok: true; value: number; expr: string }
    | { ok: false; error: string }

/**
 * Parse and evaluate an amount expression.
 *
 * - Only processes strings starting with `=`
 * - Normalizes AR-style decimals (`,` → `.`)
 * - Returns `{ ok: true, value, expr }` on success
 * - Returns `{ ok: false, error }` on failure
 * - Returns `{ ok: false }` if the input doesn't start with `=` (not an expression)
 */
export function parseAmountExpression(input: string): ParseResult {
    const trimmed = input.trim()
    if (!trimmed.startsWith('=')) {
        return { ok: false, error: 'No es una expresión (no empieza con =)' }
    }

    const rawExpr = trimmed.slice(1).trim()
    if (!rawExpr) {
        return { ok: false, error: 'Expresión vacía' }
    }

    // Normalize: replace comma with dot for decimals
    // Be careful: in AR, '.' can be thousands separator and ',' decimal separator
    // Strategy: replace commas with dots (handles decimal commas)
    // For thousands separators, we remove dots that are followed by 3 digits and then a comma or end
    // Simple approach: just replace all commas with dots
    const normalized = rawExpr.replace(/,/g, '.')

    try {
        const tokens = tokenize(normalized)
        if (tokens.length === 0) {
            return { ok: false, error: 'Expresión vacía' }
        }
        const rpn = toRPN(tokens)
        const value = evaluateRPN(rpn)

        if (!isFinite(value)) {
            return { ok: false, error: 'Resultado infinito' }
        }

        // Round to 2 decimals
        const rounded = Math.round((value + Number.EPSILON) * 100) / 100

        return { ok: true, value: rounded, expr: rawExpr }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }
    }
}
