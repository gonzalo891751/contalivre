/**
 * Estado de Flujo de Efectivo — Fase 2B (§11).
 *
 * Clasificación ESTRUCTURAL (metadata de cuenta; jamás por nombre):
 * - efectivo: statementGroup CASH_AND_BANKS o cashFlowCategory CASH_EQUIVALENT;
 * - override por cuenta: account.cashFlowCategory (OPERATING/INVESTING/FINANCING);
 * - derivación por statementGroup para el resto;
 * - cuentas sin clasificación ⇒ renglón "sin clasificar" que bloquea la
 *   publicación si es material (nunca se reparte silenciosamente).
 *
 * Método directo: flujos reales de los asientos que tocan efectivo,
 * clasificados por la contrapartida, línea por línea (exacto, sin prorrateos).
 *
 * Método indirecto: derivado algebraicamente de componentes reales
 * (resultado, Δ capital de trabajo, partidas devengadas sin efecto en el
 * efectivo). La igualdad directo = indirecto se VERIFICA, no se fuerza:
 *
 *   op_indirecto = resultado − ΔWC_activos − ΔWC_pasivos + X
 *   X = −(mov. inversión+financiación de asientos SIN efectivo)
 *
 * Las transacciones sin efecto en el efectivo que tocan inversión o
 * financiación (ej: compra de PPE a crédito) se EXCLUYEN de los flujos y se
 * revelan por separado.
 */

import type { Account } from '../../core/models'
import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type {
    CashFlowStatement2B,
    ReportLine,
    ReportingInput,
    StatementValidationReport,
    StatementsBundle,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

type FlowBucket =
    | 'CASH'
    | 'RESULT'
    | 'WC_ASSET'
    | 'WC_LIAB'
    | 'INVESTING'
    | 'FINANCING'
    | 'UNCLASSIFIED'

const WC_ASSET_GROUPS = new Set(['TRADE_RECEIVABLES', 'OTHER_RECEIVABLES', 'TAX_CREDITS', 'INVENTORIES'])
const WC_LIAB_GROUPS = new Set(['TRADE_PAYABLES', 'TAX_LIABILITIES', 'PAYROLL_LIABILITIES', 'OTHER_PAYABLES', 'DEFERRED_INCOME'])
const INVESTING_GROUPS = new Set(['PPE', 'INTANGIBLES', 'INVESTMENTS'])
const FINANCING_GROUPS = new Set(['LOANS', 'CAPITAL', 'RESERVES', 'RETAINED_EARNINGS'])

export function isCashAccount(account: Account | undefined): boolean {
    if (!account) return false
    if (account.cashFlowCategory === 'CASH_EQUIVALENT') return true
    return account.statementGroup === 'CASH_AND_BANKS'
}

export function flowBucket(account: Account | undefined): FlowBucket {
    if (!account) return 'UNCLASSIFIED'
    if (isCashAccount(account)) return 'CASH'
    // Override explícito por cuenta
    if (account.cashFlowCategory === 'INVESTING') return 'INVESTING'
    if (account.cashFlowCategory === 'FINANCING') return 'FINANCING'
    if (account.cashFlowCategory === 'OPERATING') {
        if (account.kind === 'INCOME' || account.kind === 'EXPENSE') return 'RESULT'
        return account.kind === 'ASSET' ? 'WC_ASSET' : 'WC_LIAB'
    }
    // Derivación estructural
    if (account.kind === 'INCOME' || account.kind === 'EXPENSE') return 'RESULT'
    if (account.kind === 'EQUITY') return 'FINANCING'
    const g = account.statementGroup
    if (g && WC_ASSET_GROUPS.has(g)) return 'WC_ASSET'
    if (g && WC_LIAB_GROUPS.has(g)) return 'WC_LIAB'
    if (g && INVESTING_GROUPS.has(g)) return 'INVESTING'
    if (g && FINANCING_GROUPS.has(g)) return 'FINANCING'
    return 'UNCLASSIFIED'
}

/** Subcategoría operativa del método directo (estructural) */
function directOperatingSubcategory(account: Account): string {
    const g = account.statementGroup
    if (g === 'TRADE_RECEIVABLES' || g === 'SALES') return 'Cobros de clientes'
    if (g === 'TRADE_PAYABLES' || g === 'INVENTORIES' || g === 'COGS') return 'Pagos a proveedores'
    if (g === 'PAYROLL_LIABILITIES') return 'Pagos al personal'
    if (g === 'TAX_LIABILITIES' || g === 'TAX_CREDITS') return 'Pagos/cobros de impuestos'
    return 'Otros cobros y pagos operativos'
}

interface FlowTotals {
    operating: Map<string, { cents: number; accountIds: Set<string> }>
    investing: { cents: number; accountIds: Set<string> }
    financing: { cents: number; accountIds: Set<string> }
    unclassified: { cents: number; accountIds: Set<string> }
    cashDelta: number
    openingCash: number
    closingCash: number
}

export interface CashFlowsResult {
    direct: CashFlowStatement2B
    indirect: CashFlowStatement2B
    validation: StatementValidationReport
}

export function buildCashFlows(input: ReportingInput, bundle: StatementsBundle): CashFlowsResult {
    const byId = new Map(input.accounts.map(a => [a.id, a]))

    // Asientos de flujo: sin borradores, sin refundición/transferencia, sin apertura
    const flowEntries = input.entries.filter(e =>
        e.status !== 'DRAFT'
        && !isStructuralClosingEntry(e)
        && !(e.sourceModule === 'closing' && e.sourceType === 'apertura'))

    // ── Efectivo inicial y final ─────────────────────────────
    let openingCashCents = 0
    for (const [accountId, ob] of input.openingBalances) {
        if (isCashAccount(byId.get(accountId))) {
            openingCashCents += toCents(ob.debit || 0) - toCents(ob.credit || 0)
        }
    }
    // La apertura formal (si existe) integra el efectivo inicial
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') {
            for (const l of entry.lines) {
                if (isCashAccount(byId.get(l.accountId))) {
                    openingCashCents += toCents(l.debit || 0) - toCents(l.credit || 0)
                }
            }
        }
    }

    // ── Método directo: línea por línea de asientos con efectivo ──
    const totals: FlowTotals = {
        operating: new Map(),
        investing: { cents: 0, accountIds: new Set() },
        financing: { cents: 0, accountIds: new Set() },
        unclassified: { cents: 0, accountIds: new Set() },
        cashDelta: 0,
        openingCash: openingCashCents,
        closingCash: 0,
    }

    // Componentes del método indirecto
    let wcAssetDeltaCents = 0
    let wcLiabDeltaCents = 0
    const wcAssetIds = new Set<string>()
    const wcLiabIds = new Set<string>()
    let nonCashInvFinCents = 0 // inv_N + fin_N (asientos sin efectivo)
    const nonMonetaryDisclosures: ReportLine[] = []

    for (const entry of flowEntries) {
        let cashCents = 0
        for (const l of entry.lines) {
            if (isCashAccount(byId.get(l.accountId))) {
                cashCents += toCents(l.debit || 0) - toCents(l.credit || 0)
            }
        }

        const touchesCash = cashCents !== 0 ||
            entry.lines.some(l => isCashAccount(byId.get(l.accountId)))

        // Acumular Δ capital de trabajo (todas las operaciones de flujo)
        for (const l of entry.lines) {
            const account = byId.get(l.accountId)
            const bucket = flowBucket(account)
            const netDC = toCents(l.debit || 0) - toCents(l.credit || 0)
            if (bucket === 'WC_ASSET') { wcAssetDeltaCents += netDC; wcAssetIds.add(l.accountId) }
            if (bucket === 'WC_LIAB') { wcLiabDeltaCents += netDC; wcLiabIds.add(l.accountId) }
        }

        if (touchesCash && cashCents !== 0) {
            totals.cashDelta += cashCents
            // Contrapartidas: contribución exacta por línea = Haber − Debe
            for (const l of entry.lines) {
                const account = byId.get(l.accountId)
                const bucket = flowBucket(account)
                if (bucket === 'CASH') continue
                const contribution = toCents(l.credit || 0) - toCents(l.debit || 0)
                if (contribution === 0) continue
                switch (bucket) {
                    case 'RESULT':
                    case 'WC_ASSET':
                    case 'WC_LIAB': {
                        const sub = directOperatingSubcategory(account!)
                        const s = totals.operating.get(sub) ?? { cents: 0, accountIds: new Set<string>() }
                        s.cents += contribution
                        s.accountIds.add(l.accountId)
                        totals.operating.set(sub, s)
                        break
                    }
                    case 'INVESTING':
                        totals.investing.cents += contribution
                        totals.investing.accountIds.add(l.accountId)
                        break
                    case 'FINANCING':
                        totals.financing.cents += contribution
                        totals.financing.accountIds.add(l.accountId)
                        break
                    case 'UNCLASSIFIED':
                        totals.unclassified.cents += contribution
                        totals.unclassified.accountIds.add(l.accountId)
                        break
                }
            }
        } else if (!touchesCash) {
            // Asiento sin efectivo: aporta a X del indirecto y, si toca
            // inversión/financiación, se revela como transacción no monetaria
            let invFin = 0
            for (const l of entry.lines) {
                const bucket = flowBucket(byId.get(l.accountId))
                const netDC = toCents(l.debit || 0) - toCents(l.credit || 0)
                if (bucket === 'INVESTING' || bucket === 'FINANCING') invFin += netDC
            }
            if (invFin !== 0) {
                nonCashInvFinCents += invFin
                nonMonetaryDisclosures.push({
                    id: `efe:no-monetaria:${entry.id}`,
                    label: `${entry.date} — ${entry.memo}`,
                    level: 2,
                    amount: fromCents(Math.abs(invFin)),
                    accountIds: entry.lines.map(l => l.accountId),
                })
            }
        }
    }

    totals.closingCash = openingCashCents + totals.cashDelta

    // ── Presentación método directo ──────────────────────────
    const operatingChildren: ReportLine[] = []
    let operatingCents = 0
    for (const [label, s] of totals.operating) {
        operatingChildren.push({
            id: `efe:op:${label}`, label, level: 2,
            amount: fromCents(s.cents), accountIds: Array.from(s.accountIds),
        })
        operatingCents += s.cents
    }
    operatingChildren.sort((a, b) => a.label.localeCompare(b.label))

    const line = (id: string, label: string, centsValue: number, accountIds: string[] = [], children?: ReportLine[]): ReportLine =>
        ({ id, label, level: children ? 1 : 0, amount: fromCents(centsValue), accountIds, children })

    const netChangeCents = operatingCents + totals.investing.cents + totals.financing.cents + totals.unclassified.cents

    const direct: CashFlowStatement2B = {
        method: 'DIRECT',
        openingCash: line('efe:inicial', 'Efectivo y equivalentes al inicio', openingCashCents),
        operating: line('efe:operativas', 'Actividades operativas', operatingCents,
            operatingChildren.flatMap(c => c.accountIds), operatingChildren),
        investing: line('efe:inversion', 'Actividades de inversión', totals.investing.cents, Array.from(totals.investing.accountIds)),
        financing: line('efe:financiacion', 'Actividades de financiación', totals.financing.cents, Array.from(totals.financing.accountIds)),
        unclassified: line('efe:sin-clasificar', 'Flujos sin clasificación (regularizar)', totals.unclassified.cents, Array.from(totals.unclassified.accountIds)),
        netChange: line('efe:variacion', 'Variación neta del efectivo', netChangeCents),
        closingCash: line('efe:final', 'Efectivo y equivalentes al cierre', totals.closingCash),
        nonMonetaryDisclosures,
    }

    // ── Método indirecto (componentes reales, sin plug) ─────
    const resultCents = toCents(bundle.incomeStatement.netIncome.amount)
    const adjustmentsCents = -nonCashInvFinCents // X = −(inv_N + fin_N)
    const operatingIndirectCents = resultCents - wcAssetDeltaCents - wcLiabDeltaCents + adjustmentsCents + totals.unclassified.cents

    const indirectChildren: ReportLine[] = [
        { id: 'efe:ind:resultado', label: 'Resultado del ejercicio', level: 2, amount: fromCents(resultCents), accountIds: bundle.incomeStatement.netIncome.accountIds },
        { id: 'efe:ind:ajustes', label: 'Partidas devengadas sin efecto en el efectivo (depreciaciones, altas no monetarias, etc.)', level: 2, amount: fromCents(adjustmentsCents), accountIds: [] },
        { id: 'efe:ind:wc-activos', label: 'Variación de créditos, inventarios y otros activos operativos', level: 2, amount: fromCents(-wcAssetDeltaCents), accountIds: Array.from(wcAssetIds) },
        { id: 'efe:ind:wc-pasivos', label: 'Variación de proveedores y otros pasivos operativos', level: 2, amount: fromCents(-wcLiabDeltaCents), accountIds: Array.from(wcLiabIds) },
    ]
    if (totals.unclassified.cents !== 0) {
        indirectChildren.push({ id: 'efe:ind:sin-clasificar', label: 'Flujos sin clasificación (regularizar)', level: 2, amount: fromCents(totals.unclassified.cents), accountIds: Array.from(totals.unclassified.accountIds) })
    }

    const indirect: CashFlowStatement2B = {
        method: 'INDIRECT',
        openingCash: direct.openingCash,
        operating: line('efe:operativas-ind', 'Actividades operativas (método indirecto)', operatingIndirectCents,
            indirectChildren.flatMap(c => c.accountIds), indirectChildren),
        investing: direct.investing,
        financing: direct.financing,
        unclassified: direct.unclassified,
        netChange: line('efe:variacion-ind', 'Variación neta del efectivo', operatingIndirectCents + totals.investing.cents + totals.financing.cents),
        closingCash: direct.closingCash,
        nonMonetaryDisclosures,
    }

    // ── Invariantes EFE (§11.6) ──────────────────────────────
    const checks: ValidationCheck[] = [...bundle.validation.checks]

    checks.push(mkCheck('efe-variacion', 'EFE: variación neta = efectivo final − inicial',
        totals.closingCash - openingCashCents, netChangeCents))

    // Efectivo del EFE = Caja y equivalentes del ESP
    let cashInBalanceCents = 0
    for (const row of bundle.trialBalance.rows) {
        if (isCashAccount(byId.get(row.accountId))) cashInBalanceCents += toCents(row.closing)
    }
    checks.push(mkCheck('efe-esp', 'Efectivo final del EFE = Caja y equivalentes del ESP',
        cashInBalanceCents, totals.closingCash))

    checks.push(mkCheck('efe-metodos', 'EFE: método directo = método indirecto',
        toCents(direct.operating.amount), toCents(indirect.operating.amount)))

    checks.push({
        id: 'efe-clasificacion',
        label: 'EFE: sin flujos materiales pendientes de clasificación',
        passed: totals.unclassified.cents === 0,
        actual: fromCents(totals.unclassified.cents),
        detail: totals.unclassified.cents !== 0
            ? `Cuentas sin categoría EFE: ${Array.from(totals.unclassified.accountIds).join(', ')}`
            : undefined,
    })

    const allPassed = checks.every(c => c.passed)
    const validation: StatementValidationReport = {
        context: bundle.validation.context,
        checks,
        allPassed,
        canPublish: allPassed,
    }

    return { direct, indirect, validation }

    function mkCheck(id: string, label: string, expected: number, actual: number): ValidationCheck {
        return {
            id, label,
            passed: expected === actual,
            expected: fromCents(expected),
            actual: fromCents(actual),
            difference: fromCents(actual - expected),
        }
    }
}
