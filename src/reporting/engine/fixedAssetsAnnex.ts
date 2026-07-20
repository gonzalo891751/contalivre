/**
 * Anexo de bienes de uso — Fase 2E (§11).
 *
 * Función PURA: cuadro por clase (annexGroup estructural; jamás inferida por
 * nombre) con valores de origen (inicial, altas, bajas, final), depreciaciones
 * acumuladas (inicial, del ejercicio, bajas, final) y valor residual, derivado
 * de las cuentas PPE y los flujos reales del Diario. La apertura formal
 * integra los saldos iniciales. Reexpresión: sin columna propia (los importes
 * siguen la expresión del juego; el ajuste integral se expone por separado).
 *
 * Invariante (§11): valor residual del anexo = bienes de uso netos del ESP.
 */

import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type {
    FixedAssetsAnnex,
    FixedAssetsAnnexRow,
    NormalizedTrialBalance,
    ReportingInput,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

export const UNCLASSIFIED_ASSET_CLASS = 'Sin clase asignada'

interface Acc {
    accountIds: Set<string>
    grossOpening: number; additions: number; disposals: number
    accumDepOpening: number; periodDepreciation: number; depDisposals: number
}

function newAcc(): Acc {
    return { accountIds: new Set(), grossOpening: 0, additions: 0, disposals: 0, accumDepOpening: 0, periodDepreciation: 0, depDisposals: 0 }
}

export function buildFixedAssetsAnnex(
    input: ReportingInput,
    tb: NormalizedTrialBalance
): FixedAssetsAnnex {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const isPpe = (accountId: string) => byId.get(accountId)?.statementGroup === 'PPE'
    const classOf = (accountId: string): string => {
        const a = byId.get(accountId)
        return a?.annexGroup?.trim() || UNCLASSIFIED_ASSET_CLASS
    }

    const classes = new Map<string, Acc>()
    const accFor = (assetClass: string): Acc => {
        let a = classes.get(assetClass)
        if (!a) { a = newAcc(); classes.set(assetClass, a) }
        return a
    }

    // Saldos iniciales: aperturas explícitas + apertura formal
    const addOpening = (accountId: string, netCents: number) => {
        const account = byId.get(accountId)
        if (!account) return
        const acc = accFor(classOf(accountId))
        acc.accountIds.add(accountId)
        if (account.isContra) acc.accumDepOpening += -netCents // acreedora positiva
        else acc.grossOpening += netCents
    }
    for (const [accountId, ob] of input.openingBalances) {
        if (!isPpe(accountId)) continue
        addOpening(accountId, toCents(ob.debit || 0) - toCents(ob.credit || 0))
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (!(entry.sourceModule === 'closing' && entry.sourceType === 'apertura')) continue
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            addOpening(l.accountId, toCents(l.debit || 0) - toCents(l.credit || 0))
        }
    }

    // Movimientos del ejercicio
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') continue
        for (const l of entry.lines) {
            if (!isPpe(l.accountId)) continue
            const account = byId.get(l.accountId)!
            const acc = accFor(classOf(l.accountId))
            acc.accountIds.add(l.accountId)
            const d = toCents(l.debit || 0)
            const c = toCents(l.credit || 0)
            if (account.isContra) {
                // regularizadora: créditos = depreciación del ejercicio;
                // débitos = bajas/desafectaciones de depreciación
                acc.periodDepreciation += c
                acc.depDisposals += d
            } else {
                acc.additions += d
                acc.disposals += c
            }
        }
    }

    const toRow = (assetClass: string, a: Acc): FixedAssetsAnnexRow => {
        const grossClosing = a.grossOpening + a.additions - a.disposals
        const accumDepClosing = a.accumDepOpening + a.periodDepreciation - a.depDisposals
        return {
            assetClass,
            accountIds: Array.from(a.accountIds),
            grossOpening: fromCents(a.grossOpening),
            additions: fromCents(a.additions),
            disposals: fromCents(a.disposals),
            grossClosing: fromCents(grossClosing),
            accumDepOpening: fromCents(a.accumDepOpening),
            periodDepreciation: fromCents(a.periodDepreciation),
            depDisposals: fromCents(a.depDisposals),
            accumDepClosing: fromCents(accumDepClosing),
            residual: fromCents(grossClosing - accumDepClosing),
        }
    }

    const rows = Array.from(classes.entries())
        .map(([cls, a]) => toRow(cls, a))
        .filter(r => r.grossOpening !== 0 || r.additions !== 0 || r.disposals !== 0
            || r.accumDepOpening !== 0 || r.periodDepreciation !== 0 || r.depDisposals !== 0)
        .sort((a, b) => a.assetClass.localeCompare(b.assetClass))

    // Totales
    const totalAcc = newAcc()
    for (const r of rows) {
        totalAcc.grossOpening += toCents(r.grossOpening)
        totalAcc.additions += toCents(r.additions)
        totalAcc.disposals += toCents(r.disposals)
        totalAcc.accumDepOpening += toCents(r.accumDepOpening)
        totalAcc.periodDepreciation += toCents(r.periodDepreciation)
        totalAcc.depDisposals += toCents(r.depDisposals)
        for (const id of r.accountIds) totalAcc.accountIds.add(id)
    }
    const totals = toRow('Total', totalAcc)

    // Comparativo: residual por clase del anexo anterior (mismo motor)
    const prev = input.comparative?.fixedAssetsAnnex
    if (prev) {
        const prevByClass = new Map(prev.rows.map(r => [r.assetClass, r.residual]))
        for (const r of rows) r.comparativeResidual = prevByClass.get(r.assetClass) ?? 0
        totals.comparativeResidual = prev.totals.residual
    }

    // ── Invariante: residual del anexo = PPE neto del ESP ────
    let espPpeCents = 0
    for (const row of tb.rows) {
        if (isPpe(row.accountId)) espPpeCents += toCents(row.closing)
    }
    const validations: ValidationCheck[] = [{
        id: 'ppe-anexo-esp',
        label: 'Anexo bienes de uso: valor residual = Bienes de uso netos del ESP',
        passed: toCents(totals.residual) === espPpeCents,
        expected: fromCents(espPpeCents),
        actual: totals.residual,
        difference: totals.residual - fromCents(espPpeCents),
    }]

    return {
        rows,
        totals,
        hasUnclassified: rows.some(r => r.assetClass === UNCLASSIFIED_ASSET_CLASS),
        validations,
    }
}
