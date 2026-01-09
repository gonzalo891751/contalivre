import type { JournalEntry, EntryLine, ValidationResult } from './models'

const TOLERANCE = 0.01 // Tolerancia para redondeo

/**
 * Valida una línea individual del asiento
 */
function validateLine(line: EntryLine, index: number): string[] {
    const errors: string[] = []
    const lineNum = index + 1

    // No puede tener debe Y haber al mismo tiempo
    if (line.debit > 0 && line.credit > 0) {
        errors.push(`Línea ${lineNum}: no puede tener Debe y Haber simultáneamente`)
    }

    // Valores negativos
    if (line.debit < 0) {
        errors.push(`Línea ${lineNum}: el Debe no puede ser negativo`)
    }
    if (line.credit < 0) {
        errors.push(`Línea ${lineNum}: el Haber no puede ser negativo`)
    }

    // Línea vacía (ni debe ni haber)
    if (line.debit === 0 && line.credit === 0) {
        errors.push(`Línea ${lineNum}: debe tener un valor en Debe o Haber`)
    }

    // Debe tener cuenta asignada
    if (!line.accountId || line.accountId.trim() === '') {
        errors.push(`Línea ${lineNum}: debe seleccionar una cuenta`)
    }

    return errors
}

/**
 * Valida un asiento contable completo
 * 
 * Reglas:
 * 1. Debe tener al menos 2 líneas
 * 2. Suma de Debe === Suma de Haber (con tolerancia)
 * 3. Cada línea tiene solo Debe O Haber, no ambos
 * 4. Todos los valores >= 0
 * 5. Cada línea tiene una cuenta asignada
 * 6. Debe tener fecha
 */
export function validateEntry(entry: JournalEntry): ValidationResult {
    const errors: string[] = []

    // Validar campos del asiento
    if (!entry.date || entry.date.trim() === '') {
        errors.push('El asiento debe tener una fecha')
    }

    // Mínimo 2 líneas
    if (!entry.lines || entry.lines.length < 2) {
        errors.push('El asiento debe tener al menos 2 líneas')
    }

    // Validar cada línea
    if (entry.lines) {
        entry.lines.forEach((line, index) => {
            errors.push(...validateLine(line, index))
        })
    }

    // Calcular sumas
    const totalDebit = entry.lines?.reduce((sum, line) => sum + (line.debit || 0), 0) ?? 0
    const totalCredit = entry.lines?.reduce((sum, line) => sum + (line.credit || 0), 0) ?? 0
    const diff = Math.round((totalDebit - totalCredit) * 100) / 100

    // Verificar balance
    if (Math.abs(diff) > TOLERANCE) {
        if (diff > 0) {
            errors.push(`El asiento no cuadra: faltan $${diff.toFixed(2)} en el Haber`)
        } else {
            errors.push(`El asiento no cuadra: faltan $${Math.abs(diff).toFixed(2)} en el Debe`)
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        diff,
    }
}

/**
 * Calcula la suma total del Debe de un asiento
 */
export function sumDebits(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
}

/**
 * Calcula la suma total del Haber de un asiento
 */
export function sumCredits(entry: JournalEntry): number {
    return entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)
}

/**
 * Verifica si un asiento está balanceado
 */
export function isBalanced(entry: JournalEntry): boolean {
    const diff = Math.abs(sumDebits(entry) - sumCredits(entry))
    return diff <= TOLERANCE
}
