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

/**
 * Detección de disposición de activos/pasivos NO operativos con resultado
 * asociado (Fase 2G §5.1, EFE-001). El cobro/pago BRUTO de una venta de bienes
 * de uso, intangibles o inversiones pertenece íntegro a la actividad de
 * inversión (o financiación); el resultado por la venta NO es un flujo
 * operativo. RT 54 (TO RT 59) párr. 656.
 *
 * Regla conservadora y exacta: sólo se pliega cuando el asiento toca efectivo y
 * sus contrapartidas NO cash pertenecen exclusivamente a UNA actividad no
 * operativa (inversión XOR financiación) y existe al menos un resultado. Si el
 * asiento mezcla capital de trabajo, ambas actividades o partidas sin
 * clasificar (ej. venta a crédito con cobro parcial), NO se pliega: esos casos
 * requieren evidencia transaccional/override y se tratan en hitos posteriores,
 * nunca con una reclasificación silenciosa.
 *
 * @returns 'INVESTING' | 'FINANCING' si corresponde plegar; null en otro caso.
 */
export function detectDisposalFold(
    lines: { accountId: string; debit?: number; credit?: number }[],
    byId: Map<string, Account>,
): 'INVESTING' | 'FINANCING' | null {
    let hasResult = false, hasInv = false, hasFin = false, hasWc = false, hasUncl = false
    for (const l of lines) {
        const bucket = flowBucket(byId.get(l.accountId))
        if (bucket === 'CASH') continue
        const contribution = toCents(l.credit || 0) - toCents(l.debit || 0)
        if (contribution === 0) continue
        switch (bucket) {
            case 'RESULT': hasResult = true; break
            case 'WC_ASSET': case 'WC_LIAB': hasWc = true; break
            case 'INVESTING': hasInv = true; break
            case 'FINANCING': hasFin = true; break
            case 'UNCLASSIFIED': hasUncl = true; break
        }
    }
    if (!hasResult || hasWc || hasUncl) return null
    if (hasInv && !hasFin) return 'INVESTING'
    if (hasFin && !hasInv) return 'FINANCING'
    return null
}

/**
 * Subcategoría operativa del método directo (Fase 2E §7.2): estructural por
 * statementGroup de la contrapartida; jamás por nombre. Compartida con la
 * reexpresión a moneda de cierre para que ambas expresiones expongan el mismo
 * nivel de apertura.
 */
export function directOperatingSubcategory(account: Account): string {
    const g = account.statementGroup
    if (g === 'TRADE_RECEIVABLES' || g === 'SALES') return 'Cobros de clientes'
    if (g === 'OTHER_OPERATING_INCOME' || g === 'OTHER_INCOME') return 'Cobros por otros ingresos operativos'
    if (g === 'TRADE_PAYABLES' || g === 'INVENTORIES' || g === 'COGS') return 'Pagos a proveedores de bienes y servicios'
    if (g === 'PAYROLL_LIABILITIES') return 'Pagos al personal y cargas sociales'
    if (g === 'ADMIN_EXPENSES' || g === 'SELLING_EXPENSES') return 'Pagos de gastos de administración y comercialización'
    if (g === 'INCOME_TAX') return 'Pagos de impuesto a las ganancias'
    if (g === 'TAX_LIABILITIES' || g === 'TAX_CREDITS') return 'Pagos y cobros de otros impuestos'
    if (g === 'FINANCIAL_INCOME') return 'Intereses y rendimientos cobrados'
    if (g === 'FINANCIAL_EXPENSES') return 'Intereses y costos financieros pagados'
    return 'Otros cobros y pagos operativos'
}

interface FlowTotals {
    operating: Map<string, { cents: number; accountIds: Set<string> }>
    investing: { cents: number; accountIds: Set<string>; byAccount: Map<string, number> }
    financing: { cents: number; accountIds: Set<string>; byAccount: Map<string, number> }
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
        investing: { cents: 0, accountIds: new Set(), byAccount: new Map() },
        financing: { cents: 0, accountIds: new Set(), byAccount: new Map() },
        unclassified: { cents: 0, accountIds: new Set() },
        cashDelta: 0,
        openingCash: openingCashCents,
        closingCash: 0,
    }

    // Componentes del método indirecto (con detalle por cuenta, Fase 2E §7.3)
    let wcAssetDeltaCents = 0
    let wcLiabDeltaCents = 0
    const wcAssetIds = new Set<string>()
    const wcLiabIds = new Set<string>()
    const wcAssetByAccount = new Map<string, number>()
    const wcLiabByAccount = new Map<string, number>()
    let nonCashInvFinCents = 0 // inv_N + fin_N (asientos sin efectivo)
    const adjustmentsByAccount = new Map<string, number>()
    const nonMonetaryDisclosures: ReportLine[] = []
    // Resultados de venta de activos/pasivos no operativos plegados a inversión/
    // financiación (EFE-001): deben eliminarse del resultado en el indirecto.
    let disposalResultCents = 0
    const disposalResultIds = new Set<string>()

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
            if (bucket === 'WC_ASSET') {
                wcAssetDeltaCents += netDC
                wcAssetIds.add(l.accountId)
                wcAssetByAccount.set(l.accountId, (wcAssetByAccount.get(l.accountId) ?? 0) + netDC)
            }
            if (bucket === 'WC_LIAB') {
                wcLiabDeltaCents += netDC
                wcLiabIds.add(l.accountId)
                wcLiabByAccount.set(l.accountId, (wcLiabByAccount.get(l.accountId) ?? 0) + netDC)
            }
        }

        if (touchesCash && cashCents !== 0) {
            totals.cashDelta += cashCents
            const fold = detectDisposalFold(entry.lines, byId)
            if (fold) {
                // Disposición de activo/pasivo NO operativo con resultado: el flujo
                // BRUTO (todo el efectivo del asiento) pertenece a la actividad; el
                // resultado se elimina del operativo (EFE-001, §5.1).
                const target = fold === 'INVESTING' ? totals.investing : totals.financing
                let primaryId: string | undefined
                let primaryAbs = -1
                let resultOfEntry = 0
                for (const l of entry.lines) {
                    const bucket = flowBucket(byId.get(l.accountId))
                    if (bucket === 'CASH') continue
                    const contribution = toCents(l.credit || 0) - toCents(l.debit || 0)
                    if (contribution === 0) continue
                    if (bucket === 'RESULT') {
                        resultOfEntry += contribution
                        disposalResultCents += contribution
                        disposalResultIds.add(l.accountId)
                    } else {
                        target.accountIds.add(l.accountId)
                        target.byAccount.set(l.accountId, (target.byAccount.get(l.accountId) ?? 0) + contribution)
                        if (Math.abs(contribution) > primaryAbs) { primaryAbs = Math.abs(contribution); primaryId = l.accountId }
                    }
                }
                // El resultado se atribuye a la cuenta principal para que el detalle
                // por cuenta sume el flujo bruto de efectivo de la operación.
                if (primaryId !== undefined && resultOfEntry !== 0) {
                    target.byAccount.set(primaryId, (target.byAccount.get(primaryId) ?? 0) + resultOfEntry)
                }
                target.cents += cashCents
            } else {
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
                            totals.investing.byAccount.set(l.accountId, (totals.investing.byAccount.get(l.accountId) ?? 0) + contribution)
                            break
                        case 'FINANCING':
                            totals.financing.cents += contribution
                            totals.financing.accountIds.add(l.accountId)
                            totals.financing.byAccount.set(l.accountId, (totals.financing.byAccount.get(l.accountId) ?? 0) + contribution)
                            break
                        case 'UNCLASSIFIED':
                            totals.unclassified.cents += contribution
                            totals.unclassified.accountIds.add(l.accountId)
                            break
                    }
                }
            }
        } else if (!touchesCash) {
            // Asiento sin efectivo: aporta a X del indirecto y, si toca
            // inversión/financiación, se revela como transacción no monetaria
            let invFin = 0
            for (const l of entry.lines) {
                const bucket = flowBucket(byId.get(l.accountId))
                const netDC = toCents(l.debit || 0) - toCents(l.credit || 0)
                if (bucket === 'INVESTING' || bucket === 'FINANCING') {
                    invFin += netDC
                    // X = −netDC: la depreciación (crédito a amort. acum.) suma
                    adjustmentsByAccount.set(l.accountId, (adjustmentsByAccount.get(l.accountId) ?? 0) - netDC)
                }
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

    /** Detalle por cuenta (label estructural código + nombre; nunca inferencias) */
    const accountDetail = (idPrefix: string, byAccount: Map<string, number>, sign: 1 | -1 = 1): ReportLine[] => {
        const out: ReportLine[] = []
        for (const [accountId, cents] of byAccount) {
            if (cents === 0) continue
            const account = byId.get(accountId)
            out.push({
                id: `${idPrefix}:${accountId}`,
                label: account ? `${account.code} ${account.name}` : `⚠ Cuenta inexistente (${accountId})`,
                level: 2,
                amount: fromCents(sign * cents),
                accountIds: [accountId],
            })
        }
        out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        return out
    }

    const netChangeCents = operatingCents + totals.investing.cents + totals.financing.cents + totals.unclassified.cents

    const investingChildren = accountDetail('efe:inv', totals.investing.byAccount)
    const financingChildren = accountDetail('efe:fin', totals.financing.byAccount)

    const direct: CashFlowStatement2B = {
        method: 'DIRECT',
        openingCash: line('efe:inicial', 'Efectivo y equivalentes al inicio', openingCashCents),
        operating: line('efe:operativas', 'Actividades operativas', operatingCents,
            operatingChildren.flatMap(c => c.accountIds), operatingChildren),
        investing: line('efe:inversion', 'Actividades de inversión', totals.investing.cents, Array.from(totals.investing.accountIds),
            investingChildren.length > 0 ? investingChildren : undefined),
        financing: line('efe:financiacion', 'Actividades de financiación', totals.financing.cents, Array.from(totals.financing.accountIds),
            financingChildren.length > 0 ? financingChildren : undefined),
        unclassified: line('efe:sin-clasificar', 'Flujos sin clasificación (regularizar)', totals.unclassified.cents, Array.from(totals.unclassified.accountIds)),
        netChange: line('efe:variacion', 'Variación neta del efectivo', netChangeCents),
        closingCash: line('efe:final', 'Efectivo y equivalentes al cierre', totals.closingCash),
        nonMonetaryDisclosures,
    }

    // ── Método indirecto (componentes reales, sin plug) ─────
    const resultCents = toCents(bundle.incomeStatement.netIncome.amount)
    const adjustmentsCents = -nonCashInvFinCents // X = −(inv_N + fin_N)
    // Se eliminan del operativo los resultados de venta cuyo flujo pertenece a
    // inversión/financiación (EFE-001): el efectivo bruto ya está en esa actividad.
    const operatingIndirectCents = resultCents - wcAssetDeltaCents - wcLiabDeltaCents + adjustmentsCents - disposalResultCents + totals.unclassified.cents

    const indirectChildren: ReportLine[] = [
        { id: 'efe:ind:resultado', label: 'Resultado del ejercicio', level: 2, amount: fromCents(resultCents), accountIds: bundle.incomeStatement.netIncome.accountIds },
        {
            id: 'efe:ind:ajustes', label: 'Partidas devengadas sin efecto en el efectivo (depreciaciones, altas no monetarias, etc.)',
            level: 2, amount: fromCents(adjustmentsCents), accountIds: Array.from(adjustmentsByAccount.keys()),
            children: accountDetail('efe:ind:ajuste', adjustmentsByAccount),
        },
        {
            id: 'efe:ind:wc-activos', label: 'Variación de créditos, inventarios y otros activos operativos',
            level: 2, amount: fromCents(-wcAssetDeltaCents), accountIds: Array.from(wcAssetIds),
            children: accountDetail('efe:ind:wca', wcAssetByAccount, -1),
        },
        {
            id: 'efe:ind:wc-pasivos', label: 'Variación de proveedores y otros pasivos operativos',
            level: 2, amount: fromCents(-wcLiabDeltaCents), accountIds: Array.from(wcLiabIds),
            children: accountDetail('efe:ind:wcl', wcLiabByAccount, -1),
        },
    ]
    if (disposalResultCents !== 0) {
        indirectChildren.push({
            id: 'efe:ind:result-no-operativo',
            label: 'Resultados de venta de activos reclasificados a inversión o financiación',
            level: 2, amount: fromCents(-disposalResultCents), accountIds: Array.from(disposalResultIds),
        })
    }
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
