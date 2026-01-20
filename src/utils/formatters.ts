/**
 * Accounting Formatters for Argentina (es-AR)
 */

export interface FormattedValue {
    text: string
    isNegative: boolean
    value: number
}

/**
 * Formats a number for accounting display.
 * - Positive: "1.234,56"
 * - Negative: "(1.234,56)" (no minus sign, wrapped in parentheses)
 * - Zero: "0,00"
 */
export function formatAccounting(amount: number): FormattedValue {
    const isNegative = amount < 0
    const absValue = Math.abs(amount)

    const formattedNumber = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(absValue)

    return {
        text: isNegative ? `-${formattedNumber}` : formattedNumber,
        isNegative,
        value: amount
    }
}

/**
 * Normalizes text for matching (lowercase, no accents, trimmed)
 */
export function normalizeText(text: string): string {
    if (!text) return ''
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
}

/**
 * Parses a string amount into a number.
 * Supports:
 * - "1.234,56" (AR standard)
 * - "(1.234,56)" (Negative with parens)
 * - "-1.234,56" (Negative with sign)
 * - "1234.56" (US standard)
 */
export function parseAmount(value: any): number {
    if (typeof value === 'number') return value
    if (!value) return 0

    let str = String(value).trim()

    // Check for negative in parentheses
    const isParensNegative = str.startsWith('(') && str.endsWith(')')
    if (isParensNegative) {
        str = str.slice(1, -1)
    }

    // Remove any currency symbols $ or USD or ARS
    str = str.replace(/[A-Za-z$]/g, '').trim()

    // Determine format
    // If it has comma and dot:
    // "1.234,56" -> dot is thousand, comma is decimal
    // "1,234.56" -> comma is thousand, dot is decimal

    const lastComma = str.lastIndexOf(',')
    const lastDot = str.lastIndexOf('.')

    if (lastComma > lastDot) {
        // European / AR format: 1.234,56
        // Remove dots, replace comma with dot
        str = str.replace(/\./g, '').replace(',', '.')
    } else if (lastDot > lastComma) {
        // US format: 1,234.56
        // Remove commas
        str = str.replace(/,/g, '')
    }

    const parsed = parseFloat(str)
    if (isNaN(parsed)) return 0

    return (isParensNegative) ? -parsed : parsed
}
