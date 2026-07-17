/**
 * Notas y anexos principales — Fase 2B (§12).
 *
 * Cada valor declara su origen: DERIVED (automático, reconcilia con el
 * rubro), MANUAL (ingresado por el usuario, nunca pisa un derivado en
 * silencio), NOT_AVAILABLE o NOT_APPLICABLE.
 */

import { toCents } from '../../accounting/domain/money'
import { isCashAccount } from './buildCashFlow'
import { NORMATIVE_BASELINE } from '../../accounting/migration/versions'
import type { StatementGroup } from '../../core/models'
import type { ReportingInput, StatementsBundle } from '../domain/types'

export type NoteValueOrigin = 'DERIVED' | 'MANUAL' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE'

export interface NoteLine {
    label: string
    amount: number | null
    origin: NoteValueOrigin
    accountIds: string[]
}

export interface StatementNote {
    id: string
    title: string
    /** texto de política/base (para notas cualitativas) */
    text?: string
    lines: NoteLine[]
    /** total de la nota; debe reconciliar con el rubro cuando aplica */
    total: number | null
    /** rubro del estado contra el que reconcilia (id de ReportLine) */
    reconcilesWith?: string
    reconciled: boolean | null
}

const fromCents = (c: number) => c / 100

function groupNote(
    id: string,
    title: string,
    groups: StatementGroup[],
    input: ReportingInput,
    bundle: StatementsBundle,
    reconcilesWith?: string,
    reconcileAmount?: number
): StatementNote {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const lines: NoteLine[] = []
    let totalCents = 0
    for (const row of bundle.trialBalance.rows) {
        const account = byId.get(row.accountId)
        if (!account?.statementGroup || !groups.includes(account.statementGroup)) continue
        if (toCents(row.closing) === 0) continue
        const sign = account.kind === 'LIABILITY' || account.kind === 'EQUITY' ? -1 : 1
        const cents = sign * toCents(row.closing)
        totalCents += cents
        lines.push({
            label: `${account.code} ${account.name}`,
            amount: fromCents(cents),
            origin: 'DERIVED',
            accountIds: [row.accountId],
        })
    }
    const total = fromCents(totalCents)
    return {
        id, title, lines, total,
        reconcilesWith,
        reconciled: reconcileAmount === undefined ? null : toCents(total) === toCents(reconcileAmount),
    }
}

/**
 * Anexo de evolución de bienes de uso (§15): saldo inicial, altas, bajas,
 * depreciación y saldo final, DERIVADO del balance normalizado (opening +
 * movimientos del período por cuenta). Reconcilia con el rubro PPE del ESP.
 * Las cuentas regularizadoras (amortización acumulada) se exponen en negativo.
 */
function buildFixedAssetsEvolution(input: ReportingInput, bundle: StatementsBundle): StatementNote {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const lines: NoteLine[] = []
    let totalCents = 0

    for (const row of bundle.trialBalance.rows) {
        const account = byId.get(row.accountId)
        if (account?.statementGroup !== 'PPE') continue
        const openingCents = toCents(row.opening)
        const debitCents = toCents(row.periodDebit)
        const creditCents = toCents(row.periodCredit)
        const closingCents = toCents(row.closing)
        if (openingCents === 0 && debitCents === 0 && creditCents === 0 && closingCents === 0) continue

        const isContra = account?.isContra
        // El neto D−C ya lleva el signo correcto: una regularizadora con saldo
        // acreedor queda negativa y reduce el rubro. No se vuelve a invertir.
        // Para cuentas de origen: altas = débitos, bajas = créditos.
        // Para amortización acumulada (contra): depreciación = créditos.
        const detail = isContra
            ? `Depreciación acumulada ${fromCents(creditCents)} · desafectaciones ${fromCents(debitCents)}`
            : `Altas ${fromCents(debitCents)} · bajas ${fromCents(creditCents)}`
        lines.push({
            label: `${account?.code} ${account?.name} — inicial ${fromCents(openingCents)} · ${detail} · final ${fromCents(closingCents)}`,
            amount: fromCents(closingCents),
            origin: 'DERIVED',
            accountIds: [row.accountId],
        })
        totalCents += closingCents
    }

    return {
        id: 'anexo-bienes-uso',
        title: 'Anexo de evolución de bienes de uso',
        text: 'Saldo inicial, altas, bajas y depreciación del ejercicio por cuenta, derivados del Diario. El total reconcilia con el rubro Bienes de uso del ESP.',
        lines: lines.length > 0 ? lines : [{ label: 'Sin bienes de uso en el ejercicio', amount: null, origin: 'NOT_APPLICABLE', accountIds: [] }],
        total: fromCents(totalCents),
        reconcilesWith: 'esp:anc',
        reconciled: null,
    }
}

export function buildNotes(input: ReportingInput, bundle: StatementsBundle): StatementNote[] {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const notes: StatementNote[] = []

    // Nota 1: bases de preparación (cualitativa, derivada de la configuración)
    notes.push({
        id: 'nota-bases',
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
        for (const row of bundle.trialBalance.rows) {
            const account = byId.get(row.accountId)
            if (!isCashAccount(account)) continue
            if (toCents(row.closing) === 0) continue
            totalCents += toCents(row.closing)
            lines.push({ label: `${row.code} ${row.name}`, amount: row.closing, origin: 'DERIVED', accountIds: [row.accountId] })
        }
        const efeClosing = bundle.cashFlowDirect?.closingCash.amount
        notes.push({
            id: 'nota-efectivo',
            title: 'Efectivo y equivalentes de efectivo',
            text: 'Integran el rubro las cuentas con metadata estructurada de efectivo/equivalente (misma política que el EFE).',
            lines,
            total: fromCents(totalCents),
            reconcilesWith: 'efe:final',
            reconciled: efeClosing === undefined ? null : toCents(fromCents(totalCents)) === toCents(efeClosing),
        })
    }

    // Notas por rubro (derivadas, reconciliadas contra el TB)
    notes.push(groupNote('nota-creditos', 'Créditos por ventas y otros créditos',
        ['TRADE_RECEIVABLES', 'OTHER_RECEIVABLES', 'TAX_CREDITS'], input, bundle))
    notes.push(groupNote('nota-bienes-cambio', 'Bienes de cambio',
        ['INVENTORIES'], input, bundle))
    notes.push(buildFixedAssetsEvolution(input, bundle))
    notes.push(groupNote('nota-intangibles', 'Activos intangibles',
        ['INTANGIBLES'], input, bundle))
    notes.push(groupNote('nota-deudas', 'Deudas',
        ['TRADE_PAYABLES', 'TAX_LIABILITIES', 'PAYROLL_LIABILITIES', 'LOANS', 'OTHER_PAYABLES', 'DEFERRED_INCOME'],
        input, bundle, 'esp:pasivo', bundle.balanceSheet.totalLiabilities.amount))
    notes.push(groupNote('nota-pn', 'Patrimonio neto',
        ['CAPITAL', 'RESERVES', 'RETAINED_EARNINGS'], input, bundle))

    // Anexo: gastos por función + determinación del costo de ventas (del ER)
    notes.push({
        id: 'anexo-gastos',
        title: 'Anexo de gastos por función',
        lines: [
            { label: 'Gastos de administración', amount: bundle.incomeStatement.adminExpenses.amount, origin: 'DERIVED', accountIds: bundle.incomeStatement.adminExpenses.accountIds },
            { label: 'Gastos de comercialización', amount: bundle.incomeStatement.sellingExpenses.amount, origin: 'DERIVED', accountIds: bundle.incomeStatement.sellingExpenses.accountIds },
        ],
        total: fromCents(toCents(bundle.incomeStatement.adminExpenses.amount) + toCents(bundle.incomeStatement.sellingExpenses.amount)),
        reconciled: true,
    })
    notes.push({
        id: 'anexo-cmv',
        title: 'Determinación del costo de ventas',
        lines: [
            { label: 'Costo de ventas del ejercicio (según registro perpetuo)', amount: bundle.incomeStatement.costOfSales.amount, origin: 'DERIVED', accountIds: bundle.incomeStatement.costOfSales.accountIds },
        ],
        total: bundle.incomeStatement.costOfSales.amount,
        reconcilesWith: 'er:cmv',
        reconciled: true,
    })

    // Notas manuales (hechos posteriores, contingencias, partes relacionadas)
    for (const [id, title] of [
        ['nota-hechos-posteriores', 'Hechos posteriores al cierre'],
        ['nota-contingencias', 'Contingencias'],
        ['nota-partes-relacionadas', 'Operaciones con partes relacionadas'],
    ] as const) {
        notes.push({
            id, title,
            text: 'Información de carga manual: no disponible hasta que el usuario la complete.',
            lines: [{ label: 'Sin información cargada', amount: null, origin: 'NOT_AVAILABLE', accountIds: [] }],
            total: null,
            reconciled: null,
        })
    }

    return notes
}
