export type EvaluationResult = {
    value: number | null
    error?: string
}

/**
 * Token types for the expression parser
 */
type TokenType = 'NUMBER' | 'OPERATOR' | 'LPAREN' | 'RPAREN'

interface Token {
    type: TokenType
    value: string
}

/**
 * Validates and tokenizes the input expression.
 * Handles "1.234,56" and "1,234.56" formats.
 */
function tokenize(expr: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    let lastType: TokenType | null = null

    // Remove leading '=' if present
    const cleanExpr = expr.startsWith('=') ? expr.slice(1) : expr

    while (i < cleanExpr.length) {
        const char = cleanExpr[i]

        if (/\s/.test(char)) {
            i++
            continue
        }

        if (/[+\-*/]/.test(char)) {
            // Check for unary minus:
            // It's unary if it's '-' AND (it's the first token OR the last token was an operator or '(')
            if (char === '-' && (lastType === null || lastType === 'OPERATOR' || lastType === 'LPAREN')) {
                // Treat unary minus as part of the number OR as a special operator. 
                // Easier approach: treat it as a number multiplier -1 * next number? 
                // Or better: Tokenize as 'u-' or just handle in parser.
                // Let's keep it simple: If it's a negative number start, consume the number.
                // BUT "=-5" is valid. "5*-5" is valid.
                // Let's handle unary minus by pre-pending 0 if it's at start, 
                // or replacing "(-" with "(0-"? No that breaks "5*-5".

                // Standard Shunting Yard Unary handling:
                // Make it a generic operator, but with higher precedence?
                // Let's stick to simple tokenizing first.
            }
            tokens.push({ type: 'OPERATOR', value: char })
            lastType = 'OPERATOR'
            i++
            continue
        }

        if (char === '(') {
            tokens.push({ type: 'LPAREN', value: char })
            lastType = 'LPAREN'
            i++
            continue
        }

        if (char === ')') {
            tokens.push({ type: 'RPAREN', value: char })
            lastType = 'RPAREN'
            i++
            continue
        }

        if (/[0-9.,]/.test(char)) {
            let numStr = ''
            while (i < cleanExpr.length && /[0-9.,]/.test(cleanExpr[i])) {
                numStr += cleanExpr[i]
                i++
            }

            // Normalize number string to JS float format
            // Rules:
            // 1. If contains "," and ".", the last one is the decimal separator.
            // 2. If only "," -> treat as decimal separator (es-AR preferred) UNLESS it looks like "1,000" (thousands). 
            //    But "1,000" could be 1.0 or 1000. Ambiguous.
            //    User requirement: "tolerate input like '1.234,56' or '1,234.56'".
            //    Heuristic: 
            //    - if multiple dots/commas, the last one is decimal.
            //    - if mixed, the one that appears last is decimal.
            //    - "1.234,56" -> dot is thousands, comma is decimal.
            //    - "1,234.56" -> comma is thousands, dot is decimal.

            let normalized = numStr

            const firstDot = numStr.indexOf('.')
            const lastDot = numStr.lastIndexOf('.')
            const firstComma = numStr.indexOf(',')
            const lastComma = numStr.lastIndexOf(',')

            if (firstDot !== -1 && firstComma !== -1) {
                // Mixed mode
                if (lastDot > lastComma) {
                    // 1,234.56 -> remove commas
                    normalized = numStr.replace(/,/g, '')
                } else {
                    // 1.234,56 -> remove dots, replace comma with dot
                    normalized = numStr.replace(/\./g, '').replace(',', '.')
                }
            } else if (firstComma !== -1) {
                // Only commas
                // If multiple commas, it's thousands: 1,000,000 -> 1000000
                // If single comma: "1,50" -> 1.50
                const commaCount = (numStr.match(/,/g) || []).length
                if (commaCount > 1) {
                    // 1,234,567 -> assume thousands
                    normalized = numStr.replace(/,/g, '')
                } else {
                    // Single comma. Check position. "1,000" vs "1,23"
                    // In es-AR, comma is decimal. user said "es-AR 0,00".
                    // So we assume single comma is decimal separator.
                    normalized = numStr.replace(',', '.')
                }
            } else if (firstDot !== -1) {
                // Only dots
                // 1.000.000 -> thousands
                // 1.50 -> decimal? 
                // In es-AR, dot is usually thousands. But in programming "1.50" is 1.5.
                // If multiple dots -> thousands.
                const dotCount = (numStr.match(/\./g) || []).length
                if (dotCount > 1) {
                    normalized = numStr.replace(/\./g, '')
                } else {
                    // Single dot. Ambiguous. 
                    // Given the prompt "tolerate input like 1.234,56 or 1,234.56", 
                    // it implies mixed usage. But for single separators:
                    // "Default to es-AR" -> 1.000 is 1000, 1,00 is 1.
                    // BUT user might be a dev typing 1.5. 
                    // Let's look at the context: "support both . and , as decimal separators".
                    // This creates a conflict for "1.234". Is it 1234 or 1.234?
                    // Strategy: 
                    // If it has 3 decimals "1.234" -> likely thousands? No, "1.234" could be tiny number.
                    // Let's prioritize the Project's format. "es-AR".
                    // In es-AR (via toLocaleString), "1.234" is one thousand two hundred. "1,234" is one comma two three.
                    // However, we want to be nice.
                    // Let's stick to: if "." and "," both exist, determine roles by order.
                    // If only one exists:
                    // "," -> always decimal.
                    // "." -> if dot is followed by 3 digits and end of string (like 1.000), treat as thousands? 
                    // No that's risky. 
                    // SAFEST: treat "." as decimal if no commas present, UNLESS multiple dots.
                    // REASON: "50*1000" -> 50000. No separators.
                    // "1.5" -> 1.5.
                    // "1000" -> 1000.
                    // "1.234.567" -> 1234567.
                    // "1.234" -> 1.234 (treat as decimal). 
                    // If user wants 1000, they type 1000. If they type 1.000, they might mean 1.
                    // Let's assume "." is decimal if single, unless it's clearly thousands? 
                    // Wait, user said "0,00" is app format. So "," is definitely decimal.
                    // If I type "10.5", I interpret as 10.5.
                    // If I type "1000,5", I interpret as 1000.5.
                }
            }

            tokens.push({ type: 'NUMBER', value: normalized })
            lastType = 'NUMBER'
            continue
        }

        throw new Error(`Invalid character: ${char}`)
    }

    return tokens
}

/**
 * Evaluates the expression using Shunting-yard algorithm
 */
export function evaluateMoneyExpression(expr: string): EvaluationResult {
    if (!expr) return { value: null }

    // Quick check: if it's just a number without "=", return it parsed
    // (Though the requirement says "starts with =", we might want to be robust)
    if (!expr.startsWith('=')) {
        // If it's a plain string, try to parse it as AR number directly
        const clean = expr.replace(/\./g, '').replace(',', '.')
        const val = parseFloat(clean)
        return isNaN(val) ? { value: null, error: 'Invalid number' } : { value: val }
    }

    try {
        const tokens = tokenize(expr)

        // RPN Conversion
        const outputQueue: Token[] = []
        const operatorStack: Token[] = []

        const precedence: Record<string, number> = {
            '+': 1,
            '-': 1,
            '*': 2,
            '/': 2
        }

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i]

            if (token.type === 'NUMBER') {
                outputQueue.push(token)
            } else if (token.type === 'OPERATOR') {
                // Unary minus handling: if operator is '-' and it's unary
                // Detection: same as tokenizer. 
                // If tokens[i].value is '-' and (i==0 or prev is operator/lparen)
                // We push a "0" to outputQueue before handling the minus?
                // Or treat as unary operator.
                // Simple hack: if unary minus, push '0' number then treat as binary '-'
                const isUnary = token.value === '-' && (i === 0 || tokens[i - 1].type === 'OPERATOR' || tokens[i - 1].type === 'LPAREN');

                if (isUnary) {
                    outputQueue.push({ type: 'NUMBER', value: '0' })
                }

                while (
                    operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1].type === 'OPERATOR' &&
                    precedence[operatorStack[operatorStack.length - 1].value] >= precedence[token.value]
                ) {
                    outputQueue.push(operatorStack.pop()!)
                }
                operatorStack.push(token)
            } else if (token.type === 'LPAREN') {
                operatorStack.push(token)
            } else if (token.type === 'RPAREN') {
                while (
                    operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1].type !== 'LPAREN'
                ) {
                    outputQueue.push(operatorStack.pop()!)
                }
                if (operatorStack.length === 0) {
                    throw new Error('Mismatched parentheses')
                }
                operatorStack.pop() // Pop LPAREN
            }
        }

        while (operatorStack.length > 0) {
            const op = operatorStack.pop()!
            if (op.type === 'LPAREN') throw new Error('Mismatched parentheses')
            outputQueue.push(op)
        }

        // Evaluate RPN
        const stack: number[] = []

        for (const token of outputQueue) {
            if (token.type === 'NUMBER') {
                stack.push(parseFloat(token.value))
            } else if (token.type === 'OPERATOR') {
                if (stack.length < 2) throw new Error('Invalid expression')
                const b = stack.pop()!
                const a = stack.pop()!

                let res = 0
                switch (token.value) {
                    case '+': res = a + b; break;
                    case '-': res = a - b; break;
                    case '*': res = a * b; break;
                    case '/':
                        if (Math.abs(b) < 1e-9) throw new Error('Division by zero');
                        res = a / b;
                        break;
                }
                stack.push(res)
            }
        }

        if (stack.length !== 1) throw new Error('Invalid expression')

        const final = stack[0]
        if (!isFinite(final) || isNaN(final)) throw new Error('Invalid result')

        // Round to 2 decimals
        const rounded = Math.round(final * 100) / 100

        return { value: rounded }

    } catch (err: any) {
        return { value: null, error: err.message || 'Error' }
    }
}
