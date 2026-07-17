/**
 * Trazabilidad didáctica — Fase 2B (§14).
 *
 * Desde cualquier línea de un estado (ReportLine.accountIds) se abre el
 * detalle completo: cuentas → movimientos del Mayor → asientos → operación
 * de origen. El linaje sale del mismo TB normalizado del motor.
 */

import { db } from '../storage/db'
import type { JournalEntry } from '../core/models'
import type { StatementsBundle } from './domain/types'

export interface LineageMovement {
    entryId: string
    entryNumber?: number
    date: string
    memo: string
    accountId: string
    accountLabel: string
    debit: number
    credit: number
    /** operación de origen (para "ir a la operación") */
    sourceModule?: string
    sourceType?: string
    sourceId?: string
    status?: string
}

export interface LineLineage {
    lineId: string
    accountIds: string[]
    movements: LineageMovement[]
    totalDebit: number
    totalCredit: number
}

/**
 * Detalle de una línea de reporte: todos los movimientos de sus cuentas
 * dentro del contexto del bundle.
 */
export async function getLineLineage(
    bundle: StatementsBundle,
    lineId: string,
    accountIds: string[]
): Promise<LineLineage> {
    const accountSet = new Set(accountIds)
    const rows = bundle.trialBalance.rows.filter(r => accountSet.has(r.accountId))
    const entryIds = new Set(rows.flatMap(r => r.entryIds))
    const accounts = new Map((await db.accounts.toArray()).map(a => [a.id, a]))

    const movements: LineageMovement[] = []
    let totalDebit = 0
    let totalCredit = 0

    const entries = (await db.entries.bulkGet(Array.from(entryIds)))
        .filter((e): e is JournalEntry => !!e)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.entryNumber ?? 0) - (b.entryNumber ?? 0))

    for (const entry of entries) {
        for (const line of entry.lines) {
            if (!accountSet.has(line.accountId)) continue
            const account = accounts.get(line.accountId)
            movements.push({
                entryId: entry.id,
                entryNumber: entry.entryNumber,
                date: entry.date,
                memo: entry.memo,
                accountId: line.accountId,
                accountLabel: account ? `${account.code} ${account.name}` : `⚠ ${line.accountId}`,
                debit: line.debit || 0,
                credit: line.credit || 0,
                sourceModule: entry.sourceModule,
                sourceType: entry.sourceType,
                sourceId: entry.sourceId,
                status: entry.status,
            })
            totalDebit += line.debit || 0
            totalCredit += line.credit || 0
        }
    }

    return {
        lineId,
        accountIds,
        movements,
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
    }
}
