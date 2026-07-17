/**
 * Cierre contable, refundición y apertura — Fase 2B (§7).
 *
 * Ciclo didáctico y formal:
 * 1. previewClosing: controla el ejercicio y muestra qué va a pasar
 *    (no permite cerrar con errores críticos).
 * 2. generateClosingDrafts: crea EN BORRADOR la refundición de ingresos,
 *    la refundición de gastos y la transferencia del resultado a
 *    Resultados no asignados. El usuario puede verlos, entenderlos y recién
 *    entonces contabilizar.
 * 3. postClosing: contabiliza los borradores de cierre (idempotente) y
 *    cierra el ejercicio y sus períodos.
 * 4. generateOpeningEntry: asiento de apertura del ejercicio siguiente
 *    solo con cuentas patrimoniales; verifica que el patrimonio final de N
 *    sea igual al inicial de N+1.
 * 5. reopenClosedExercise: reapertura controlada con motivo — revierte los
 *    asientos automáticos de cierre/apertura y reabre el ejercicio.
 */

import { db } from '../../storage/db'
import type { Account, JournalEntry } from '../../core/models'
import type { AccountingExercise } from '../domain/types'
import { LOCAL_ACTOR, PostingError } from '../domain/types'
import { subAmounts, sumMoney, toCents } from '../domain/money'
import { isPostableAccount } from '../taxonomy/taxonomy'
import {
    createDraftEntry,
    deleteDraftEntry,
    postDraft,
    reverseEntry,
} from './journalService'
import {
    closeExercise as closeExerciseStatus,
    ensureExerciseForDate,
    getExercise,
    listExercises,
    reopenExercise as reopenExerciseStatus,
} from './contextService'
import { appendAuditEvent } from '../audit/auditLog'

export const CLOSING_MODULE = 'closing'
export const CLOSING_TYPES = {
    income: 'refundicion-ingresos',
    expense: 'refundicion-gastos',
    transfer: 'transferencia-resultado',
    opening: 'apertura',
} as const

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

/** Asientos que integran los libros de un ejercicio */
async function bookEntriesOfExercise(exercise: AccountingExercise): Promise<JournalEntry[]> {
    const entries = await db.entries
        .where('date')
        .between(exercise.startDate, exercise.endDate, true, true)
        .toArray()
    return entries.filter(e => e.status !== 'DRAFT')
}

/** Neto Debe−Haber por cuenta (en pesos cent-exactos) */
function netByAccount(entries: JournalEntry[]): Map<string, number> {
    const cents = new Map<string, number>()
    for (const entry of entries) {
        for (const l of entry.lines) {
            cents.set(l.accountId, (cents.get(l.accountId) ?? 0) + toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }
    const result = new Map<string, number>()
    for (const [id, c] of cents) result.set(id, c / 100)
    return result
}

function isClosingEntry(entry: JournalEntry): boolean {
    return entry.sourceModule === CLOSING_MODULE
}

/** Cuenta destino: Resultado del ejercicio (o Resultados no asignados) */
export async function resolveResultAccounts(): Promise<{
    resultAccount?: Account
    retainedAccount?: Account
    errors: string[]
}> {
    const accounts = await db.accounts.toArray()
    const candidates = accounts.filter(a =>
        a.kind === 'EQUITY' && isPostableAccount(a) && a.statementGroup === 'RETAINED_EARNINGS'
    )
    const errors: string[] = []
    const byName = (re: RegExp) => candidates.find(a => re.test(a.name.toLowerCase()))

    const resultAccount = byName(/resultado del ejercicio/) ?? candidates[0]
    const retainedAccount = byName(/no asignados|acumulados/) ?? candidates[0]

    if (!resultAccount) {
        errors.push('No existe una cuenta imputable de PN con grupo RETAINED_EARNINGS para recibir el resultado del ejercicio. Creá o mapeá una (ej: "Resultado del ejercicio").')
    }
    return { resultAccount, retainedAccount, errors }
}

// ─────────────────────────────────────────────────────────────
// 7.1 Vista previa de cierre
// ─────────────────────────────────────────────────────────────

export interface ClosingPreview {
    exerciseId: string
    exerciseName: string
    canClose: boolean
    blockers: string[]
    warnings: string[]
    draftCount: number
    postedCount: number
    journalDebit: number
    journalCredit: number
    /** resultado del ejercicio: ingresos − gastos (positivo = ganancia) */
    result: number
    incomeAccounts: Array<{ accountId: string; code: string; name: string; balance: number }>
    expenseAccounts: Array<{ accountId: string; code: string; name: string; balance: number }>
    alreadyClosed: boolean
    hasClosingEntries: boolean
}

export async function previewClosing(exerciseId: string): Promise<ClosingPreview> {
    const exercise = await getExercise(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)

    const blockers: string[] = []
    const warnings: string[] = []

    const allInRange = await db.entries
        .where('date')
        .between(exercise.startDate, exercise.endDate, true, true)
        .toArray()
    const drafts = allInRange.filter(e => e.status === 'DRAFT')
    const posted = allInRange.filter(e => e.status !== 'DRAFT')

    if (drafts.length > 0) {
        blockers.push(`Hay ${drafts.length} borrador(es) pendientes en el ejercicio: contabilizalos o eliminalos antes de cerrar.`)
    }

    // Integridad Diario
    const journalDebit = sumMoney(posted.flatMap(e => e.lines.map(l => l.debit || 0)))
    const journalCredit = sumMoney(posted.flatMap(e => e.lines.map(l => l.credit || 0)))
    if (toCents(journalDebit) !== toCents(journalCredit)) {
        blockers.push(`El Diario del ejercicio no balancea: Debe ${journalDebit} ≠ Haber ${journalCredit}.`)
    }

    // Cuentas inexistentes / sin taxonomía
    const accounts = await db.accounts.toArray()
    const accountsById = new Map(accounts.map(a => [a.id, a]))
    const nets = netByAccount(posted.filter(e => !isClosingEntry(e)))
    for (const [accountId, net] of nets) {
        if (toCents(net) === 0) continue
        const account = accountsById.get(accountId)
        if (!account) {
            blockers.push(`Hay movimientos imputados a una cuenta inexistente (id ${accountId}); regularizalos antes de cerrar.`)
            continue
        }
        if (!account.statementGroup && (account.kind === 'INCOME' || account.kind === 'EXPENSE'
            || account.kind === 'ASSET' || account.kind === 'LIABILITY' || account.kind === 'EQUITY')) {
            warnings.push(`La cuenta ${account.code} "${account.name}" tiene saldo y no tiene grupo de exposición asignado.`)
        }
    }

    const { errors: accountErrors } = await resolveResultAccounts()
    blockers.push(...accountErrors)

    const incomeAccounts: ClosingPreview['incomeAccounts'] = []
    const expenseAccounts: ClosingPreview['expenseAccounts'] = []
    for (const [accountId, net] of nets) {
        const account = accountsById.get(accountId)
        if (!account || toCents(net) === 0) continue
        if (account.kind === 'INCOME') {
            incomeAccounts.push({ accountId, code: account.code, name: account.name, balance: -net })
        } else if (account.kind === 'EXPENSE') {
            expenseAccounts.push({ accountId, code: account.code, name: account.name, balance: net })
        }
    }

    const totalIncome = sumMoney(incomeAccounts.map(a => a.balance))
    const totalExpense = sumMoney(expenseAccounts.map(a => a.balance))
    const result = subAmounts(totalIncome, totalExpense)

    const hasClosingEntries = posted.some(e => isClosingEntry(e) && e.sourceType !== CLOSING_TYPES.opening)

    return {
        exerciseId,
        exerciseName: exercise.name,
        canClose: blockers.length === 0 && exercise.status === 'OPEN',
        blockers: exercise.status !== 'OPEN'
            ? [...blockers, `El ejercicio ya está en estado ${exercise.status}.`]
            : blockers,
        warnings,
        draftCount: drafts.length,
        postedCount: posted.length,
        journalDebit,
        journalCredit,
        result,
        incomeAccounts: incomeAccounts.sort((a, b) => a.code.localeCompare(b.code)),
        expenseAccounts: expenseAccounts.sort((a, b) => a.code.localeCompare(b.code)),
        alreadyClosed: exercise.status === 'CLOSED',
        hasClosingEntries,
    }
}

// ─────────────────────────────────────────────────────────────
// 7.2 Refundición (borradores → contabilización)
// ─────────────────────────────────────────────────────────────

interface RefundicionLine {
    accountId: string
    debit: number
    credit: number
    description?: string
}

function buildRefundicionLines(
    accounts: Array<{ accountId: string; balance: number }>,
    resultAccountId: string,
    closes: 'INCOME' | 'EXPENSE'
): RefundicionLine[] {
    const lines: RefundicionLine[] = []
    let resultCents = 0
    for (const { accountId, balance } of accounts) {
        const cents = toCents(balance)
        if (cents === 0) continue
        if (closes === 'INCOME') {
            // saldo acreedor positivo ⇒ se debita para cancelarlo
            if (cents > 0) lines.push({ accountId, debit: balance, credit: 0 })
            else lines.push({ accountId, debit: 0, credit: -balance })
            resultCents += cents
        } else {
            // saldo deudor positivo ⇒ se acredita para cancelarlo
            if (cents > 0) lines.push({ accountId, debit: 0, credit: balance })
            else lines.push({ accountId, debit: -balance, credit: 0 })
            resultCents -= cents
        }
    }
    if (resultCents > 0) {
        lines.push({ accountId: resultAccountId, debit: 0, credit: resultCents / 100, description: 'Resultado del ejercicio' })
    } else if (resultCents < 0) {
        lines.push({ accountId: resultAccountId, debit: -resultCents / 100, credit: 0, description: 'Resultado del ejercicio' })
    }
    return lines
}

export interface ClosingDrafts {
    incomeDraft?: JournalEntry
    expenseDraft?: JournalEntry
    transferDraft?: JournalEntry
}

/**
 * Genera (o regenera) los borradores de cierre del ejercicio.
 * Elimina borradores de cierre previos del mismo ejercicio antes de crear
 * los nuevos (los POSTED de cierre bloquean la regeneración: ver postClosing).
 */
export async function generateClosingDrafts(
    exerciseId: string,
    actorId = LOCAL_ACTOR
): Promise<ClosingDrafts> {
    const exercise = await getExercise(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)

    const preview = await previewClosing(exerciseId)
    if (!preview.canClose) {
        throw new PostingError([`No se puede generar el cierre:`, ...preview.blockers])
    }
    if (preview.hasClosingEntries) {
        throw new PostingError(['El ejercicio ya tiene asientos de refundición contabilizados. Usá la reapertura para rehacer el cierre.'])
    }

    const { resultAccount, retainedAccount, errors } = await resolveResultAccounts()
    if (!resultAccount || errors.length > 0) throw new PostingError(errors)

    // Regenerar: borrar borradores de cierre previos
    const priorDrafts = (await db.entries
        .where('date').between(exercise.startDate, exercise.endDate, true, true).toArray())
        .filter(e => e.status === 'DRAFT' && isClosingEntry(e))
    for (const d of priorDrafts) await deleteDraftEntry(d.id, actorId)

    const drafts: ClosingDrafts = {}
    const closeDate = exercise.endDate

    if (preview.incomeAccounts.length > 0) {
        drafts.incomeDraft = await createDraftEntry({
            date: closeDate,
            memo: `Refundición de cuentas de ingresos — ${exercise.name}`,
            lines: buildRefundicionLines(preview.incomeAccounts, resultAccount.id, 'INCOME'),
            sourceModule: CLOSING_MODULE,
            sourceType: CLOSING_TYPES.income,
            sourceId: exerciseId,
            actorId,
        })
    }
    if (preview.expenseAccounts.length > 0) {
        drafts.expenseDraft = await createDraftEntry({
            date: closeDate,
            memo: `Refundición de cuentas de gastos — ${exercise.name}`,
            lines: buildRefundicionLines(preview.expenseAccounts, resultAccount.id, 'EXPENSE'),
            sourceModule: CLOSING_MODULE,
            sourceType: CLOSING_TYPES.expense,
            sourceId: exerciseId,
            actorId,
        })
    }
    // Transferencia del resultado a Resultados no asignados (si son cuentas distintas)
    if (retainedAccount && retainedAccount.id !== resultAccount.id && toCents(preview.result) !== 0) {
        const gain = preview.result > 0
        drafts.transferDraft = await createDraftEntry({
            date: closeDate,
            memo: `Transferencia del resultado del ejercicio a ${retainedAccount.name} — ${exercise.name}`,
            lines: gain
                ? [
                    { accountId: resultAccount.id, debit: preview.result, credit: 0 },
                    { accountId: retainedAccount.id, debit: 0, credit: preview.result },
                ]
                : [
                    { accountId: retainedAccount.id, debit: -preview.result, credit: 0 },
                    { accountId: resultAccount.id, debit: 0, credit: -preview.result },
                ],
            sourceModule: CLOSING_MODULE,
            sourceType: CLOSING_TYPES.transfer,
            sourceId: exerciseId,
            actorId,
        })
    }
    return drafts
}

/**
 * Contabiliza los borradores de cierre y cierra el ejercicio.
 * Idempotente: si el cierre ya está contabilizado no duplica.
 */
export async function postClosing(exerciseId: string, actorId = LOCAL_ACTOR): Promise<{
    postedEntryIds: string[]
    result: number
}> {
    const exercise = await getExercise(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)

    const inRange = await db.entries
        .where('date').between(exercise.startDate, exercise.endDate, true, true).toArray()

    // Idempotencia: cierre ya contabilizado ⇒ no duplicar
    const alreadyPosted = inRange.filter(e =>
        e.status !== 'DRAFT' && isClosingEntry(e) && e.sourceType !== CLOSING_TYPES.opening)
    if (alreadyPosted.length > 0 && exercise.status === 'CLOSED') {
        return { postedEntryIds: alreadyPosted.map(e => e.id), result: 0 }
    }

    const preview = await previewClosing(exerciseId)

    let closingDrafts = inRange.filter(e => e.status === 'DRAFT' && isClosingEntry(e))
    if (closingDrafts.length === 0 && alreadyPosted.length === 0) {
        await generateClosingDrafts(exerciseId, actorId)
        closingDrafts = (await db.entries
            .where('date').between(exercise.startDate, exercise.endDate, true, true).toArray())
            .filter(e => e.status === 'DRAFT' && isClosingEntry(e))
    }

    const postedIds: string[] = [...alreadyPosted.map(e => e.id)]
    // Orden estable: ingresos → gastos → transferencia
    const order = [CLOSING_TYPES.income, CLOSING_TYPES.expense, CLOSING_TYPES.transfer] as string[]
    closingDrafts.sort((a, b) => order.indexOf(a.sourceType ?? '') - order.indexOf(b.sourceType ?? ''))
    for (const draft of closingDrafts) {
        const posted = await postDraft(draft.id, actorId)
        postedIds.push(posted.id)
    }

    await closeExerciseStatus(exerciseId, actorId)

    await appendAuditEvent({
        eventType: 'EXERCISE_CLOSED',
        entityType: 'exercise',
        entityId: exerciseId,
        companyId: exercise.companyId,
        exerciseId,
        actorId,
        reason: 'Cierre con refundición contabilizada',
        metadata: { closingEntryIds: postedIds, result: preview.result },
    })

    return { postedEntryIds: postedIds, result: preview.result }
}

// ─────────────────────────────────────────────────────────────
// 7.3 Apertura del ejercicio siguiente
// ─────────────────────────────────────────────────────────────

export interface OpeningResult {
    entry: JournalEntry
    patrimonialTotalDebit: number
    patrimonialTotalCredit: number
}

/**
 * Genera el asiento de apertura del ejercicio siguiente a partir de los
 * saldos patrimoniales al cierre del ejercicio dado (posterior a la
 * refundición). Solo cuentas patrimoniales; los resultados del ejercicio
 * anterior NO reaparecen como cuentas dinámicas.
 *
 * Verifica: saldo patrimonial final de N = saldo inicial de N+1.
 */
export async function generateOpeningEntry(
    closedExerciseId: string,
    actorId = LOCAL_ACTOR
): Promise<OpeningResult> {
    const exercise = await getExercise(closedExerciseId)
    if (!exercise) throw new Error(`El ejercicio ${closedExerciseId} no existe`)

    const entries = await bookEntriesOfExercise(exercise)
    const hasRefundicion = entries.some(e => isClosingEntry(e) && e.sourceType !== CLOSING_TYPES.opening)
    if (!hasRefundicion) {
        throw new PostingError(['El ejercicio no tiene la refundición contabilizada: cerralo antes de generar la apertura.'])
    }

    // Saldos al cierre = apertura del propio ejercicio (si existe) + movimientos
    const accounts = await db.accounts.toArray()
    const accountsById = new Map(accounts.map(a => [a.id, a]))
    const nets = netByAccount(entries)

    // Verificar que las cuentas de resultado quedaron en cero
    for (const [accountId, net] of nets) {
        const account = accountsById.get(accountId)
        if (!account) continue
        if ((account.kind === 'INCOME' || account.kind === 'EXPENSE') && toCents(net) !== 0) {
            throw new PostingError([`La cuenta de resultado ${account.code} "${account.name}" quedó con saldo ${net} después de la refundición: revisá el cierre.`])
        }
    }

    const nextYear = Number(exercise.endDate.slice(0, 4)) + 1
    const nextExercise = await ensureExerciseForDate(`${nextYear}-01-01`, { actorId })

    // Idempotencia: apertura ya existente para el siguiente ejercicio
    const nextEntries = await db.entries
        .where('date').between(nextExercise.startDate, nextExercise.endDate, true, true).toArray()
    const existingOpening = nextEntries.find(e =>
        e.status !== 'DRAFT' && isClosingEntry(e) && e.sourceType === CLOSING_TYPES.opening && e.sourceId === closedExerciseId)
    if (existingOpening) {
        const d = sumMoney(existingOpening.lines.map(l => l.debit || 0))
        return { entry: existingOpening, patrimonialTotalDebit: d, patrimonialTotalCredit: d }
    }

    const lines: RefundicionLine[] = []
    for (const [accountId, net] of Array.from(nets.entries()).sort((a, b) => {
        const ca = accountsById.get(a[0])?.code ?? ''
        const cb = accountsById.get(b[0])?.code ?? ''
        return ca.localeCompare(cb)
    })) {
        const account = accountsById.get(accountId)
        if (!account) continue
        if (account.kind !== 'ASSET' && account.kind !== 'LIABILITY' && account.kind !== 'EQUITY') continue
        const cents = toCents(net)
        if (cents === 0) continue
        if (cents > 0) lines.push({ accountId, debit: net, credit: 0 })
        else lines.push({ accountId, debit: 0, credit: -net })
    }

    if (lines.length === 0) {
        throw new PostingError(['No hay saldos patrimoniales para abrir el ejercicio siguiente.'])
    }

    const totalDebit = sumMoney(lines.map(l => l.debit))
    const totalCredit = sumMoney(lines.map(l => l.credit))
    if (toCents(totalDebit) !== toCents(totalCredit)) {
        throw new PostingError([`La apertura no balancea (Debe ${totalDebit} ≠ Haber ${totalCredit}): el patrimonio del ejercicio cerrado es inconsistente.`])
    }

    const draft = await createDraftEntry({
        date: nextExercise.startDate,
        memo: `Asiento de apertura — ${nextExercise.name} (desde ${exercise.name})`,
        lines,
        sourceModule: CLOSING_MODULE,
        sourceType: CLOSING_TYPES.opening,
        sourceId: closedExerciseId,
        actorId,
    })
    const posted = await postDraft(draft.id, actorId)

    return { entry: posted, patrimonialTotalDebit: totalDebit, patrimonialTotalCredit: totalCredit }
}

// ─────────────────────────────────────────────────────────────
// 7.4 Reapertura controlada
// ─────────────────────────────────────────────────────────────

/**
 * Reabre un ejercicio cerrado: exige motivo, revierte los asientos
 * automáticos de cierre (refundición/transferencia) y la apertura del
 * ejercicio siguiente si existe, y deja todo auditado.
 */
export async function reopenClosedExercise(
    exerciseId: string,
    reason: string,
    actorId = LOCAL_ACTOR
): Promise<{ reversedEntryIds: string[] }> {
    if (!reason || reason.trim() === '') {
        throw new PostingError(['La reapertura requiere un motivo.'])
    }
    const exercise = await getExercise(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)

    // Reabrir el estado primero para poder contabilizar las reversiones
    await reopenExerciseStatus(exerciseId, reason, actorId)

    const reversed: string[] = []

    // Revertir apertura del ejercicio siguiente (si existe)
    const all = await listExercises(exercise.companyId)
    for (const other of all) {
        if (other.id === exerciseId) continue
        const entries = await db.entries
            .where('date').between(other.startDate, other.endDate, true, true).toArray()
        const opening = entries.find(e =>
            e.status === 'POSTED' && isClosingEntry(e) && e.sourceType === CLOSING_TYPES.opening && e.sourceId === exerciseId)
        if (opening) {
            const r = await reverseEntry(opening.id, { reason: `Reapertura de ${exercise.name}: ${reason}`, actorId })
            reversed.push(r.id)
        }
    }

    // Revertir refundición y transferencia del propio ejercicio
    const own = await bookEntriesOfExercise(exercise)
    const closingPosted = own.filter(e =>
        e.status === 'POSTED' && isClosingEntry(e) && e.sourceType !== CLOSING_TYPES.opening)
    // Orden inverso: transferencia → gastos → ingresos
    const order = [CLOSING_TYPES.transfer, CLOSING_TYPES.expense, CLOSING_TYPES.income] as string[]
    closingPosted.sort((a, b) => order.indexOf(a.sourceType ?? '') - order.indexOf(b.sourceType ?? ''))
    for (const entry of closingPosted) {
        const r = await reverseEntry(entry.id, { reason: `Reapertura: ${reason}`, actorId })
        reversed.push(r.id)
    }

    await appendAuditEvent({
        eventType: 'EXERCISE_REOPENED',
        entityType: 'exercise',
        entityId: exerciseId,
        companyId: exercise.companyId,
        exerciseId,
        actorId,
        reason,
        metadata: { reversedEntryIds: reversed, invalidatesPublishedStatements: true },
    })

    return { reversedEntryIds: reversed }
}
