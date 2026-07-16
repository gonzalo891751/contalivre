/**
 * Validación de contabilización — Fase 2A
 *
 * Dos niveles:
 * - validateDraftStructure: estructura mínima de un borrador (fecha, líneas,
 *   importes finitos y no negativos). Un borrador puede estar desbalanceado
 *   mientras se edita: NO impacta libros.
 * - validateForPosting: validación completa previa a POSTED. Todo error aquí
 *   bloquea la contabilización; nada se omite silenciosamente.
 */

import type { Account, JournalEntry } from '../../core/models'
import type { AccountingExercise, AccountingPeriod } from '../domain/types'
import { moneyEquals, sumMoney, validateAmount } from '../domain/money'
import { isActiveAccount, isPostableAccount } from '../taxonomy/taxonomy'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface DraftValidationResult {
    ok: boolean
    errors: string[]
}

export function isValidISODate(date: unknown): date is string {
    if (typeof date !== 'string' || !ISO_DATE_RE.test(date)) return false
    const [y, m, d] = date.split('-').map(Number)
    if (m < 1 || m > 12 || d < 1) return false
    const daysInMonth = new Date(y, m, 0).getDate()
    return d <= daysInMonth
}

/** Formatea YYYY-MM-DD como dd/mm/yyyy para mensajes de error */
function fmtDate(date: string): string {
    const [y, m, d] = date.split('-')
    return `${d}/${m}/${y}`
}

/**
 * Estructura mínima de borrador: fecha válida, al menos una línea,
 * importes finitos y no negativos, sin Debe y Haber simultáneos.
 */
export function validateDraftStructure(entry: Pick<JournalEntry, 'date' | 'lines' | 'memo'>): DraftValidationResult {
    const errors: string[] = []

    if (!isValidISODate(entry.date)) {
        errors.push(`La fecha "${entry.date ?? ''}" no es una fecha válida (formato esperado: AAAA-MM-DD)`)
    }
    if (!Array.isArray(entry.lines) || entry.lines.length === 0) {
        errors.push('El asiento debe tener al menos una línea')
    } else {
        entry.lines.forEach((line, i) => {
            const n = i + 1
            const debitError = validateAmount(line.debit, `Línea ${n} (Debe)`)
            if (debitError) errors.push(debitError)
            const creditError = validateAmount(line.credit, `Línea ${n} (Haber)`)
            if (creditError) errors.push(creditError)
            if (line.debit > 0 && line.credit > 0) {
                errors.push(`Línea ${n}: no puede tener Debe y Haber simultáneamente`)
            }
        })
    }

    return { ok: errors.length === 0, errors }
}

export interface PostingValidationContext {
    accountsById: Map<string, Account>
    exercise: AccountingExercise
    period: AccountingPeriod
}

/**
 * Validación completa previa a POSTED. Devuelve la lista de errores
 * (vacía si el asiento puede contabilizarse).
 */
export function validateForPosting(
    entry: JournalEntry,
    ctx: PostingValidationContext
): string[] {
    const errors: string[] = []
    const { accountsById, exercise, period } = ctx

    // ── Fecha ────────────────────────────────────────────────
    if (!isValidISODate(entry.date)) {
        errors.push(`La fecha "${entry.date ?? ''}" no es una fecha válida (formato esperado: AAAA-MM-DD)`)
        return errors // sin fecha válida no puede evaluarse ejercicio/período
    }

    // ── Ejercicio y período ──────────────────────────────────
    if (exercise.status !== 'OPEN') {
        errors.push(`El ejercicio "${exercise.name}" está ${exercise.status === 'CLOSED' ? 'cerrado' : 'en proceso de cierre'} y no admite contabilizaciones`)
    }
    if (entry.date < exercise.startDate || entry.date > exercise.endDate) {
        errors.push(`La fecha ${fmtDate(entry.date)} está fuera del ejercicio "${exercise.name}" (${fmtDate(exercise.startDate)} a ${fmtDate(exercise.endDate)})`)
    }
    if (period.status === 'CLOSED' || period.status === 'SOFT_CLOSED') {
        errors.push(`La fecha ${fmtDate(entry.date)} pertenece al período "${period.name}", que está cerrado`)
    }
    if (entry.date < period.startDate || entry.date > period.endDate) {
        errors.push(`La fecha ${fmtDate(entry.date)} está fuera del período "${period.name}" (${fmtDate(period.startDate)} a ${fmtDate(period.endDate)})`)
    }

    // ── Líneas ───────────────────────────────────────────────
    if (!Array.isArray(entry.lines) || entry.lines.length < 2) {
        errors.push('El asiento debe tener al menos 2 líneas para contabilizarse')
    }

    const lines = entry.lines ?? []
    lines.forEach((line, i) => {
        const n = i + 1

        // Importes finitos y no negativos
        const debitError = validateAmount(line.debit, `Línea ${n} (Debe)`)
        if (debitError) errors.push(debitError)
        const creditError = validateAmount(line.credit, `Línea ${n} (Haber)`)
        if (creditError) errors.push(creditError)
        if (debitError || creditError) return

        // Ni Debe ni Haber / ambos
        if (line.debit > 0 && line.credit > 0) {
            errors.push(`Línea ${n}: no puede tener Debe y Haber simultáneamente`)
        }
        if (line.debit === 0 && line.credit === 0) {
            errors.push(`Línea ${n}: debe tener un valor en Debe o en Haber`)
        }

        // Cuenta: existencia, imputabilidad, vigencia
        if (!line.accountId || String(line.accountId).trim() === '') {
            errors.push(`Línea ${n}: debe seleccionar una cuenta`)
            return
        }
        const account = accountsById.get(line.accountId)
        if (!account) {
            errors.push(`Línea ${n}: la cuenta con id "${line.accountId}" no existe en el plan de cuentas`)
            return
        }
        if (!isPostableAccount(account)) {
            errors.push(`Línea ${n}: la cuenta "${account.code} ${account.name}" es agrupadora y no es imputable`)
        }
        if (!isActiveAccount(account)) {
            errors.push(`Línea ${n}: la cuenta "${account.code} ${account.name}" está inactiva y no admite nuevas imputaciones`)
        }
    })

    // ── Partida doble ────────────────────────────────────────
    if (lines.length >= 2) {
        const totalDebit = sumMoney(lines.map(l => l.debit || 0))
        const totalCredit = sumMoney(lines.map(l => l.credit || 0))
        if (!Number.isFinite(totalDebit) || !Number.isFinite(totalCredit)) {
            errors.push('El asiento contiene importes no finitos y no puede contabilizarse')
        } else if (!moneyEquals(totalDebit, totalCredit)) {
            const diff = totalDebit - totalCredit
            if (diff > 0) {
                errors.push(`El asiento no cuadra: faltan $${diff.toFixed(2)} en el Haber (Debe ${totalDebit.toFixed(2)} ≠ Haber ${totalCredit.toFixed(2)})`)
            } else {
                errors.push(`El asiento no cuadra: faltan $${Math.abs(diff).toFixed(2)} en el Debe (Debe ${totalDebit.toFixed(2)} ≠ Haber ${totalCredit.toFixed(2)})`)
            }
        }
    }

    return errors
}
