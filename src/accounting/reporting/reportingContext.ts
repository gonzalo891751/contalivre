/**
 * Contexto de reporting — Fase 2A
 *
 * Todas las consultas de Diario, Mayor, Balance y Estados deben pasar por
 * este módulo: reciben un ReportingContext explícito (empresa + ejercicio +
 * rango de fechas) y NUNCA leen todos los asientos globalmente.
 *
 * Reglas:
 * - Los borradores (status DRAFT) jamás integran los libros.
 * - Los asientos POSTED y REVERSED integran los libros (el reverso enlazado
 *   neutraliza al REVERSED; excluirlo duplicaría el efecto de la reversión).
 * - Los saldos anteriores al ejercicio solo ingresan por el mecanismo
 *   explícito getOpeningBalances (no hay refundición formal todavía).
 */

import { db } from '../../storage/db'
import type { JournalEntry } from '../../core/models'
import { DEFAULT_COMPANY_ID, exerciseIdForYear, getExercise } from '../application/contextService'

export interface ReportingContext {
    companyId: string
    exerciseId: string
    periodStart: string   // YYYY-MM-DD inclusive
    periodEnd: string     // YYYY-MM-DD inclusive
    comparativeExerciseId?: string
}

/** ¿El asiento integra los libros? (excluye borradores) */
export function isBookEntry(entry: JournalEntry): boolean {
    return entry.status !== 'DRAFT'
}

/**
 * Resuelve un ReportingContext para un año calendario (compatibilidad con
 * usePeriodYear). Si el ejercicio persistido existe usa sus fechas reales.
 */
export async function resolveContextForYear(
    year: number,
    range?: { start?: string; end?: string }
): Promise<ReportingContext> {
    const exerciseId = exerciseIdForYear(year)
    const exercise = await getExercise(exerciseId)
    return {
        companyId: DEFAULT_COMPANY_ID,
        exerciseId,
        periodStart: range?.start ?? exercise?.startDate ?? `${year}-01-01`,
        periodEnd: range?.end ?? exercise?.endDate ?? `${year}-12-31`,
    }
}

/**
 * Asientos que integran los libros dentro del contexto, ordenados por fecha.
 * Consulta indexada por rango de fechas (no toArray() global).
 */
export async function getEntriesForContext(ctx: ReportingContext): Promise<JournalEntry[]> {
    const entries = await db.entries
        .where('date')
        .between(ctx.periodStart, ctx.periodEnd, true, true)
        .toArray()
    return entries
        .filter(e => isBookEntry(e) && (e.companyId ?? DEFAULT_COMPANY_ID) === ctx.companyId)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.entryNumber ?? 0) - (b.entryNumber ?? 0))
}

/**
 * ¿El ejercicio del contexto tiene contabilizado su asiento de apertura
 * formal (generado por el servicio de cierre)?
 */
export async function hasFormalOpeningEntry(ctx: ReportingContext): Promise<boolean> {
    const entries = await db.entries
        .where('date')
        .between(ctx.periodStart, ctx.periodEnd, true, true)
        .toArray()
    return entries.some(e =>
        e.status !== 'DRAFT' && e.sourceModule === 'closing' && e.sourceType === 'apertura')
}

/**
 * Saldos de apertura: mecanismo EXPLÍCITO para incorporar al ESP los saldos
 * acumulados de ejercicios anteriores mientras no exista refundición formal.
 * Devuelve neto Debe-Haber por cuenta de los asientos previos al inicio del
 * contexto. El ER nunca debe usar esto.
 *
 * Fase 2B: si el ejercicio tiene ASIENTO DE APERTURA formal contabilizado,
 * los saldos iniciales ya están DENTRO del ejercicio y este mecanismo
 * devuelve vacío (evita la doble contabilización de la historia previa).
 */
export async function getOpeningBalances(ctx: ReportingContext): Promise<Map<string, { debit: number; credit: number }>> {
    if (await hasFormalOpeningEntry(ctx)) {
        return new Map()
    }
    const prior = await db.entries
        .where('date')
        .below(ctx.periodStart)
        .toArray()
    const map = new Map<string, { debit: number; credit: number }>()
    for (const entry of prior) {
        if (!isBookEntry(entry)) continue
        if ((entry.companyId ?? DEFAULT_COMPANY_ID) !== ctx.companyId) continue
        for (const line of entry.lines) {
            const acc = map.get(line.accountId) ?? { debit: 0, credit: 0 }
            acc.debit += line.debit || 0
            acc.credit += line.credit || 0
            map.set(line.accountId, acc)
        }
    }
    return map
}
