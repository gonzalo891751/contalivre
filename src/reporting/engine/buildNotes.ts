/**
 * Notas a los estados contables — Fase 2B (§12) / Fase 2E (§8).
 *
 * Las notas cuantitativas son COMPOSICIONES de rubros: cada una lista las
 * cuentas que integran el rubro (con las regularizadoras en negativo, nunca
 * escondidas en el neto), su comparativo y su estado de reconciliación contra
 * el estado correspondiente. Cada valor declara su origen: DERIVED (reconcilia
 * con el rubro), MANUAL (nunca pisa un derivado), NOT_AVAILABLE o
 * NOT_APPLICABLE. Además numera las notas y estampa `noteRef` en las líneas
 * del ESP/ER para la referencia cruzada (badge "Nota X").
 */

import { toCents } from '../../accounting/domain/money'
import { isCashAccount } from './buildCashFlow'
import { NORMATIVE_BASELINE } from '../../accounting/migration/versions'
import type { StatementGroup } from '../../core/models'
import type { ReportLine, ReportingInput, StatementsBundle } from '../domain/types'

export type NoteValueOrigin = 'DERIVED' | 'MANUAL' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE'

export interface NoteLine {
    label: string
    amount: number | null
    /** comparativo del ejercicio anterior (null = sin dato, no cero) */
    comparativeAmount?: number | null
    origin: NoteValueOrigin
    accountIds: string[]
    /** cuenta regularizadora: se expone en negativo, nunca dentro del neto */
    isContra?: boolean
}

export interface StatementNote {
    id: string
    /** número correlativo ("Nota 3") para la referencia cruzada */
    number: number
    title: string
    /** texto de política/base (para notas cualitativas o mixtas) */
    text?: string
    lines: NoteLine[]
    /** total de la nota; debe reconciliar con el rubro cuando aplica */
    total: number | null
    comparativeTotal?: number | null
    /** rubro del estado contra el que reconcilia (id de ReportLine) */
    reconcilesWith?: string
    reconciled: boolean | null
}

const fromCents = (c: number) => c / 100

/** Suma los importes que el ESP asigna a un conjunto de cuentas (nivel cuenta) */
function sumStatementAmounts(bundle: StatementsBundle, accountIds: Set<string>): number {
    let cents = 0
    const walk = (l: ReportLine) => {
        if (l.level === 2 && l.accountIds.length === 1 && accountIds.has(l.accountIds[0])) {
            cents += toCents(l.amount)
        }
        for (const c of l.children ?? []) walk(c)
    }
    const bs = bundle.balanceSheet
    for (const root of [bs.currentAssets, bs.nonCurrentAssets, bs.currentLiabilities, bs.nonCurrentLiabilities, bs.equity]) {
        walk(root)
    }
    return cents
}

interface GroupNoteSpec {
    id: string
    title: string
    groups: StatementGroup[]
    text?: string
}

function buildGroupNote(
    spec: GroupNoteSpec,
    input: ReportingInput,
    bundle: StatementsBundle,
    number: number
): StatementNote {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const compByAccount = new Map<string, number>()
    if (input.comparative) {
        for (const row of input.comparative.trialBalance.rows) {
            compByAccount.set(row.accountId, toCents(row.closing))
        }
    }

    const lines: NoteLine[] = []
    let totalCents = 0
    let compTotalCents = 0
    let hasComp = false
    const noteAccounts = new Set<string>()

    const rowsById = new Map(bundle.trialBalance.rows.map(r => [r.accountId, r]))
    const allAccountIds = new Set<string>([...rowsById.keys(), ...compByAccount.keys()])

    for (const accountId of allAccountIds) {
        const account = byId.get(accountId)
        if (!account?.statementGroup || !spec.groups.includes(account.statementGroup)) continue
        const sign = account.kind === 'LIABILITY' || account.kind === 'EQUITY' ? -1 : 1

        const closingCents = toCents(rowsById.get(accountId)?.closing ?? 0)
        const compCents = compByAccount.get(accountId)
        const cents = sign * closingCents
        const comp = compCents === undefined ? undefined : sign * compCents
        if (cents === 0 && (comp === undefined || comp === 0)) continue

        totalCents += cents
        if (comp !== undefined) { compTotalCents += comp; hasComp = true }
        noteAccounts.add(accountId)
        lines.push({
            label: `${account.code} ${account.name}${account.isContra ? ' (regularizadora)' : ''}`,
            amount: fromCents(cents),
            comparativeAmount: input.comparative ? fromCents(comp ?? 0) : undefined,
            origin: 'DERIVED',
            accountIds: [accountId],
            isContra: account.isContra,
        })
    }

    lines.sort((a, b) => a.label.localeCompare(b.label))

    // Reconciliación: el total de la nota debe igualar lo que el ESP expone
    // para las MISMAS cuentas (dos caminos de agregación distintos).
    const statementCents = sumStatementAmounts(bundle, noteAccounts)
    const reconciled = lines.length === 0 ? null : statementCents === totalCents

    return {
        id: spec.id,
        number,
        title: spec.title,
        text: spec.text,
        lines: lines.length > 0 ? lines : [{ label: 'Sin saldos en el ejercicio', amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
        total: lines.length > 0 ? fromCents(totalCents) : null,
        comparativeTotal: input.comparative && hasComp ? fromCents(compTotalCents) : input.comparative ? 0 : undefined,
        reconciled,
    }
}

/** Nota de composición de un renglón del ER (p. ej. resultados financieros) */
function buildResultNote(
    id: string,
    title: string,
    line: ReportLine,
    number: number,
    text?: string
): StatementNote {
    const lines: NoteLine[] = (line.children ?? []).map(c => ({
        label: c.label,
        amount: c.amount,
        comparativeAmount: c.comparativeAmount,
        origin: 'DERIVED',
        accountIds: c.accountIds,
    }))
    return {
        id,
        number,
        title,
        text,
        lines: lines.length > 0 ? lines : [{ label: 'Sin resultados en el ejercicio', amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
        total: lines.length > 0 ? line.amount : null,
        comparativeTotal: line.comparativeAmount,
        reconcilesWith: line.id,
        reconciled: lines.length > 0 ? toCents(lines.reduce((s, l) => s + (l.amount ?? 0), 0)) === toCents(line.amount) : null,
    }
}

/**
 * Anexo de evolución de bienes de uso (§15 / 2E §11): por cuenta, valor de
 * origen y regularizadoras con movimientos del ejercicio. El total reconcilia
 * con el rubro del ESP. (El cuadro completo por clase vive en el view model
 * fixedAssetsAnnex; esta nota resume la composición.)
 */
function buildFixedAssetsNote(input: ReportingInput, bundle: StatementsBundle, number: number): StatementNote {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const lines: NoteLine[] = []
    let totalCents = 0
    const noteAccounts = new Set<string>()

    for (const row of bundle.trialBalance.rows) {
        const account = byId.get(row.accountId)
        if (account?.statementGroup !== 'PPE') continue
        const closingCents = toCents(row.closing)
        if (closingCents === 0 && toCents(row.periodDebit) === 0 && toCents(row.periodCredit) === 0) continue
        noteAccounts.add(row.accountId)
        totalCents += closingCents
        lines.push({
            label: `${account?.code} ${account?.name}${account?.isContra ? ' (regularizadora)' : ''}`,
            amount: fromCents(closingCents),
            origin: 'DERIVED',
            accountIds: [row.accountId],
            isContra: account?.isContra,
        })
    }

    const statementCents = sumStatementAmounts(bundle, noteAccounts)
    return {
        id: 'nota-bienes-uso',
        number,
        title: 'Bienes de uso',
        text: 'Composición neta del rubro. La evolución completa (valores de origen, altas, bajas y depreciaciones por clase) se expone en el anexo de bienes de uso.',
        lines: lines.length > 0 ? lines : [{ label: 'Sin bienes de uso en el ejercicio', amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
        total: lines.length > 0 ? fromCents(totalCents) : null,
        reconcilesWith: 'esp:anc',
        reconciled: lines.length === 0 ? null : statementCents === totalCents,
    }
}

/** Estampa noteRef en las líneas de cuenta (nivel 2) del ESP para las cuentas de la nota */
function stampNoteRefs(bundle: StatementsBundle, note: StatementNote) {
    const accountIds = new Set(note.lines.flatMap(l => l.accountIds))
    if (accountIds.size === 0) return
    const walk = (l: ReportLine) => {
        if (l.level === 2 && l.accountIds.length === 1 && accountIds.has(l.accountIds[0]) && !l.noteRef) {
            l.noteRef = String(note.number)
        }
        for (const c of l.children ?? []) walk(c)
    }
    const bs = bundle.balanceSheet
    for (const root of [bs.currentAssets, bs.nonCurrentAssets, bs.currentLiabilities, bs.nonCurrentLiabilities, bs.equity]) {
        walk(root)
    }
}

export function buildNotes(input: ReportingInput, bundle: StatementsBundle): StatementNote[] {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const notes: StatementNote[] = []
    let n = 0

    // Nota 1: bases de preparación (cualitativa, derivada de la configuración)
    notes.push({
        id: 'nota-bases',
        number: ++n,
        title: 'Bases de preparación y normativa aplicada',
        text: `${NORMATIVE_BASELINE}. Moneda: pesos argentinos. `
            + 'Contexto inflacionario: el ajuste integral por inflación se expone por separado; '
            + 'los importes de este juego se presentan en moneda nominal salvo indicación expresa. '
            + 'Este juego se genera en modo laboratorio educativo local y no constituye estados formales.',
        lines: [],
        total: null,
        reconciled: null,
    })

    // Nota 2: efectivo y equivalentes (política = misma del EFE)
    {
        const lines: NoteLine[] = []
        let totalCents = 0
        const compByAccount = new Map<string, number>()
        if (input.comparative) {
            for (const row of input.comparative.trialBalance.rows) compByAccount.set(row.accountId, toCents(row.closing))
        }
        let compTotal = 0
        for (const row of bundle.trialBalance.rows) {
            const account = byId.get(row.accountId)
            if (!isCashAccount(account)) continue
            const compCents = compByAccount.get(row.accountId)
            if (toCents(row.closing) === 0 && !compCents) continue
            totalCents += toCents(row.closing)
            if (compCents) compTotal += compCents
            lines.push({
                label: `${row.code} ${row.name}`,
                amount: row.closing,
                comparativeAmount: input.comparative ? fromCents(compCents ?? 0) : undefined,
                origin: 'DERIVED',
                accountIds: [row.accountId],
            })
        }
        const efeClosing = bundle.cashFlowDirect?.closingCash.amount
        const note: StatementNote = {
            id: 'nota-efectivo',
            number: ++n,
            title: 'Efectivo y equivalentes de efectivo',
            text: 'Integran el rubro las cuentas con metadata estructurada de efectivo/equivalente (misma política que el EFE). El total reconcilia con el efectivo al cierre del EFE y con el ESP.',
            lines: lines.length > 0 ? lines : [{ label: 'Sin efectivo al cierre', amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
            total: lines.length > 0 ? fromCents(totalCents) : null,
            comparativeTotal: input.comparative ? fromCents(compTotal) : undefined,
            reconcilesWith: 'efe:final',
            reconciled: efeClosing === undefined || lines.length === 0 ? null : totalCents === toCents(efeClosing),
        }
        notes.push(note)
        stampNoteRefs(bundle, note)
    }

    // Notas de composición por rubro del ESP (§8.2)
    const groupSpecs: GroupNoteSpec[] = [
        { id: 'nota-inversiones', title: 'Inversiones', groups: ['INVESTMENTS'] },
        {
            id: 'nota-creditos-ventas', title: 'Créditos por ventas', groups: ['TRADE_RECEIVABLES'],
            text: 'Las previsiones regularizadoras se exponen en negativo; el total es el neto expuesto en el ESP.',
        },
        { id: 'nota-otros-creditos', title: 'Otros créditos', groups: ['OTHER_RECEIVABLES', 'TAX_CREDITS'] },
        { id: 'nota-bienes-cambio', title: 'Bienes de cambio', groups: ['INVENTORIES'] },
    ]
    for (const spec of groupSpecs) {
        const note = buildGroupNote(spec, input, bundle, ++n)
        notes.push(note)
        stampNoteRefs(bundle, note)
    }

    // Bienes de uso (nota resumen; el anexo completo va por su view model)
    {
        const note = buildFixedAssetsNote(input, bundle, ++n)
        notes.push(note)
        stampNoteRefs(bundle, note)
    }

    const liabilitySpecs: GroupNoteSpec[] = [
        { id: 'nota-intangibles', title: 'Activos intangibles', groups: ['INTANGIBLES'] },
        { id: 'nota-deudas-comerciales', title: 'Deudas comerciales', groups: ['TRADE_PAYABLES'] },
        { id: 'nota-prestamos', title: 'Préstamos', groups: ['LOANS'] },
        { id: 'nota-remuneraciones', title: 'Remuneraciones y cargas sociales', groups: ['PAYROLL_LIABILITIES'] },
        { id: 'nota-cargas-fiscales', title: 'Cargas fiscales', groups: ['TAX_LIABILITIES'] },
        { id: 'nota-otras-deudas', title: 'Otras deudas', groups: ['OTHER_PAYABLES', 'DEFERRED_INCOME'] },
        { id: 'nota-pn', title: 'Patrimonio neto', groups: ['CAPITAL', 'RESERVES', 'RETAINED_EARNINGS'] },
    ]
    for (const spec of liabilitySpecs) {
        const note = buildGroupNote(spec, input, bundle, ++n)
        notes.push(note)
        stampNoteRefs(bundle, note)
    }

    // Resultados financieros y por tenencia (composición del renglón del ER)
    {
        const note = buildResultNote(
            'nota-resultados-financieros',
            'Resultados financieros y por tenencia',
            bundle.incomeStatement.financialResults,
            ++n,
            'Composición del renglón del ER, incluido el RECPAM cuando está registrado.'
        )
        notes.push(note)
        bundle.incomeStatement.financialResults.noteRef = String(note.number)
    }

    // Notas manuales persistentes (Fase 2F §8): SIEMPRE identificadas como
    // manuales; jamás modifican una nota derivada. Sin carga ⇒ NOT_AVAILABLE
    // (nunca texto de ejemplo como si fuera información real).
    const manualByType = new Map((input.manualDisclosures ?? []).map(d => [d.noteType, d]))
    for (const [noteType, id, title] of [
        ['hechos-posteriores', 'nota-hechos-posteriores', 'Hechos posteriores al cierre'],
        ['contingencias', 'nota-contingencias', 'Contingencias'],
        ['partes-relacionadas', 'nota-partes-relacionadas', 'Operaciones con partes relacionadas'],
        ['compromisos', 'nota-compromisos', 'Compromisos asumidos'],
        ['politicas-adicionales', 'nota-politicas-adicionales', 'Políticas contables adicionales'],
        ['otra-informacion', 'nota-otra-informacion', 'Otra información complementaria'],
    ] as const) {
        const disclosure = manualByType.get(noteType)
        if (!disclosure) {
            notes.push({
                id, number: ++n, title,
                text: 'Información de carga manual: no disponible hasta que el usuario la complete.',
                lines: [{ label: 'Sin información cargada', amount: null, origin: 'NOT_AVAILABLE', accountIds: [] }],
                total: null,
                reconciled: null,
            })
        } else if (disclosure.notApplicable) {
            notes.push({
                id, number: ++n, title,
                text: `No aplicable. Fundamento: ${disclosure.content}`,
                lines: [{ label: `No aplicable (carga manual, v${disclosure.version})`, amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
                total: null,
                reconciled: null,
            })
        } else {
            notes.push({
                id, number: ++n, title,
                text: disclosure.content,
                lines: [{
                    label: `Información de carga manual (v${disclosure.version}, ${disclosure.status === 'VALIDATED' ? 'validada' : 'borrador'})`,
                    amount: null, origin: 'MANUAL', accountIds: [],
                }],
                total: null,
                reconciled: null,
            })
        }
    }

    return notes
}
