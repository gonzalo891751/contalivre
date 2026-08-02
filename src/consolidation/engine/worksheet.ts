/**
 * Motor de consolidación — hoja de trabajo (Fase 2K §8 a §13, §20).
 *
 * ESPACIO ÚNICO DEBE−HABER
 * ─────────────────────────
 * Toda la hoja vive en un único espacio donde cada importe es el neto
 * Debe − Haber: activos y gastos positivos, pasivos, patrimonio e ingresos
 * negativos. La base de cada entidad es su balance de comprobación ANTES de la
 * refundición, cuya suma es exactamente cero. En consecuencia:
 *
 *   - cada eliminación es un asiento balanceado en ese mismo espacio;
 *   - la suma de TODA la hoja consolidada es cero por construcción;
 *   - la ecuación patrimonial no se "comprueba comparando dos modelos": es
 *     aritmética, y si no cierra hay un error real que el motor denuncia.
 *
 * DETERMINISMO E IDEMPOTENCIA
 * ───────────────────────────
 * El motor es una función pura de sus entradas. No lee ni escribe la base, no
 * usa la fecha actual ni ningún azar, y no acumula estado entre corridas:
 * recalcular dos veces con los mismos datos produce byte a byte lo mismo, y por
 * lo tanto no duplica ningún ajuste.
 *
 * NADA SE FUERZA A CUADRAR
 * ────────────────────────
 * Cuando la inversión contabilizada por la controladora no coincide con el
 * valor patrimonial proporcional que corresponde, la diferencia NO se absorbe:
 * se expone como llave de negocio / diferencia de consolidación y, si nadie la
 * explica, bloquea la emisión. No existe ninguna cuenta "ajuste de cierre".
 */

import { toCents } from '../../accounting/domain/money'
import type { Account } from '../../core/models'
import type { ValidationCheck } from '../../reporting/domain/types'
import { CONSOLIDATED_LINES, deriveConsolidatedLine, getLineSpec, isResultLine } from '../domain/lines'
import { computeUnrealized, netUnrealizedAfterDepreciation, type UnrealizedResult } from './unrealized'
import { OPERATION_RULES, operationRationale } from './operationRules'
import type {
    ConsolidatedLineId,
    ConsolidationEngineInput,
    ConsolidationEntityInput,
    ConsolidationWorksheet,
    EliminationEntry,
    EliminationLine,
    NonControllingInterestDetail,
    WorksheetRow,
} from '../domain/types'

const fromCents = (c: number) => c / 100
const fmt = (cents: number) =>
    (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Columna de la hoja a la que se imputa cada clase de eliminación */
type WorksheetColumn =
    | 'homogenization'
    | 'investmentElimination'
    | 'nonControllingInterest'
    | 'reciprocalElimination'
    | 'operationElimination'
    | 'unrealizedElimination'
    | 'deferredTax'
    | 'manualAdjustment'

const COLUMN_BY_KIND: Record<EliminationEntry['kind'], WorksheetColumn> = {
    HOMOGENIZATION: 'homogenization',
    INVESTMENT_VS_EQUITY: 'investmentElimination',
    EQUITY_METHOD_RESULT: 'investmentElimination',
    NON_CONTROLLING_INTEREST: 'nonControllingInterest',
    RECIPROCAL_BALANCE: 'reciprocalElimination',
    INTRAGROUP_OPERATION: 'operationElimination',
    INTRAGROUP_DIVIDEND: 'operationElimination',
    INTRAGROUP_CASH_FLOW: 'operationElimination',
    UNREALIZED_RESULT: 'unrealizedElimination',
    UNREALIZED_RESULT_REVERSAL: 'unrealizedElimination',
    DEFERRED_TAX: 'deferredTax',
    MANUAL: 'manualAdjustment',
}

// ─────────────────────────────────────────────────────────────
// Resolución de la línea consolidada de cada cuenta
// ─────────────────────────────────────────────────────────────

interface LineResolver {
    resolve(companyId: string, accountId: string): ConsolidatedLineId
    accountsFor(companyId: string, category: string): { accountId: string; counterpartyCompanyId?: string }[]
}

function buildResolver(input: ConsolidationEngineInput): LineResolver {
    const accountsById = new Map<string, Account>()
    for (const entity of input.entities) {
        for (const account of entity.accounts) accountsById.set(account.id, account)
    }
    const explicit = new Map<string, ConsolidatedLineId>()
    const byCategory = new Map<string, { accountId: string; counterpartyCompanyId?: string }[]>()
    for (const m of input.mappings) {
        explicit.set(`${m.companyId}::${m.accountId}`, m.consolidatedLineId)
        if (m.intragroupCategory !== 'NONE') {
            const key = `${m.companyId}::${m.intragroupCategory}`
            const list = byCategory.get(key) ?? []
            list.push({ accountId: m.accountId, counterpartyCompanyId: m.counterpartyCompanyId })
            byCategory.set(key, list)
        }
    }
    return {
        resolve(companyId, accountId) {
            const override = explicit.get(`${companyId}::${accountId}`)
            if (override) return override
            const account = accountsById.get(accountId)
            if (!account) return 'SIN_CLASIFICAR'
            return deriveConsolidatedLine(account).lineId
        },
        accountsFor(companyId, category) {
            return byCategory.get(`${companyId}::${category}`) ?? []
        },
    }
}

// ─────────────────────────────────────────────────────────────
// Acumulador de la hoja
// ─────────────────────────────────────────────────────────────

interface RowAccumulator {
    lineId: ConsolidatedLineId
    byEntity: Map<string, { cents: number; accountIds: Set<string> }>
    columns: Record<WorksheetColumn, number>
    eliminationIds: Set<string>
}

function emptyColumns(): Record<WorksheetColumn, number> {
    return {
        homogenization: 0,
        investmentElimination: 0,
        nonControllingInterest: 0,
        reciprocalElimination: 0,
        operationElimination: 0,
        unrealizedElimination: 0,
        deferredTax: 0,
        manualAdjustment: 0,
    }
}

class Worksheet {
    private rows = new Map<ConsolidatedLineId, RowAccumulator>()

    private ensure(lineId: ConsolidatedLineId): RowAccumulator {
        let row = this.rows.get(lineId)
        if (!row) {
            row = { lineId, byEntity: new Map(), columns: emptyColumns(), eliminationIds: new Set() }
            this.rows.set(lineId, row)
        }
        return row
    }

    addEntityAmount(lineId: ConsolidatedLineId, companyId: string, cents: number, accountId: string): void {
        const row = this.ensure(lineId)
        const entry = row.byEntity.get(companyId) ?? { cents: 0, accountIds: new Set<string>() }
        entry.cents += cents
        entry.accountIds.add(accountId)
        row.byEntity.set(companyId, entry)
    }

    applyElimination(entry: EliminationEntry): void {
        const column = COLUMN_BY_KIND[entry.kind]
        for (const line of entry.lines) {
            const row = this.ensure(line.consolidatedLineId)
            row.columns[column] += toCents(line.debit) - toCents(line.credit)
            row.eliminationIds.add(entry.id)
        }
    }

    build(entityOrder: string[]): WorksheetRow[] {
        const specs = new Map(CONSOLIDATED_LINES.map(s => [s.id, s]))
        const out: WorksheetRow[] = []
        for (const [lineId, row] of this.rows) {
            const spec = specs.get(lineId)!
            const byEntity = entityOrder
                .filter(companyId => row.byEntity.has(companyId))
                .map(companyId => {
                    const e = row.byEntity.get(companyId)!
                    return {
                        companyId,
                        amount: fromCents(e.cents),
                        accountIds: Array.from(e.accountIds).sort(),
                    }
                })
            const subtotalCents = Array.from(row.byEntity.values()).reduce((s, e) => s + e.cents, 0)
            const c = row.columns
            const consolidatedCents = subtotalCents + c.homogenization + c.investmentElimination +
                c.nonControllingInterest + c.reciprocalElimination + c.operationElimination +
                c.unrealizedElimination + c.deferredTax + c.manualAdjustment

            // Filas totalmente vacías no se exponen: no aportan información.
            if (subtotalCents === 0 && consolidatedCents === 0 && row.eliminationIds.size === 0) continue

            out.push({
                lineId,
                label: spec.label,
                section: spec.section,
                sortOrder: spec.sortOrder,
                naturalSign: spec.naturalSign,
                byEntity,
                subtotal: fromCents(subtotalCents),
                homogenization: fromCents(c.homogenization),
                investmentElimination: fromCents(c.investmentElimination),
                nonControllingInterest: fromCents(c.nonControllingInterest),
                reciprocalElimination: fromCents(c.reciprocalElimination),
                operationElimination: fromCents(c.operationElimination),
                unrealizedElimination: fromCents(c.unrealizedElimination),
                deferredTax: fromCents(c.deferredTax),
                manualAdjustment: fromCents(c.manualAdjustment),
                consolidated: fromCents(consolidatedCents),
                eliminationIds: Array.from(row.eliminationIds),
            })
        }
        return out.sort((a, b) => a.sortOrder - b.sortOrder)
    }
}

// ─────────────────────────────────────────────────────────────
// Construcción de asientos de eliminación
// ─────────────────────────────────────────────────────────────

function makeElimination(
    entry: Omit<EliminationEntry, 'balanced'>
): EliminationEntry {
    const debit = entry.lines.reduce((s, l) => s + toCents(l.debit), 0)
    const credit = entry.lines.reduce((s, l) => s + toCents(l.credit), 0)
    return { ...entry, balanced: debit === credit }
}

/** Línea de eliminación en centavos, expresada como Debe o Haber según el signo */
function line(
    lineId: ConsolidatedLineId,
    cents: number,
    description: string,
    companyId?: string,
    accountId?: string
): EliminationLine {
    return {
        consolidatedLineId: lineId,
        companyId,
        accountId,
        debit: cents > 0 ? fromCents(cents) : 0,
        credit: cents < 0 ? fromCents(-cents) : 0,
        description,
    }
}

// ─────────────────────────────────────────────────────────────
// Motor
// ─────────────────────────────────────────────────────────────

export function buildConsolidationWorksheet(
    input: ConsolidationEngineInput
): ConsolidationWorksheet {
    const { group, consolidation } = input
    const parentId = group.parentCompanyId
    const resolver = buildResolver(input)
    const sheet = new Worksheet()
    const eliminations: EliminationEntry[] = []
    const blockers: string[] = []
    const warnings: string[] = []

    const parent = input.entities.find(e => e.companyId === parentId)
    if (!parent) {
        blockers.push('El juego individual de la entidad controladora no está disponible: sin él no hay consolidación posible')
    }
    const subsidiaries = input.entities.filter(e => e.companyId !== parentId && e.method === 'FULL')
    const entityOrder = [parentId, ...subsidiaries.map(s => s.companyId)]
    const entityById = new Map(input.entities.map(e => [e.companyId, e]))
    const nameOf = (companyId: string) => entityById.get(companyId)?.companyName ?? companyId

    // ── 1. Suma línea por línea de los estados individuales ──
    for (const entity of input.entities) {
        if (entity.companyId !== parentId && entity.method !== 'FULL') continue
        for (const row of entity.trialBalance.rows) {
            const cents = toCents(row.closing)
            if (cents === 0) continue
            const lineId = resolver.resolve(entity.companyId, row.accountId)
            sheet.addEntityAmount(lineId, entity.companyId, cents, row.accountId)
            if (lineId === 'SIN_CLASIFICAR') {
                blockers.push(
                    `${nameOf(entity.companyId)}: la cuenta ${row.code} ${row.name} no tiene línea consolidada asignada. ` +
                    'Asignala en el mapeo del grupo antes de emitir.'
                )
            }
        }
    }

    // ── 2. Resultados no trascendidos a terceros ──
    const unrealized: UnrealizedResult[] = input.operations
        .filter(op => op.type !== 'DIVIDENDS')
        .map(op => computeUnrealized(op, parentId))

    const unrealizedByOrigin = new Map<string, number>()
    for (const u of unrealized) {
        const net = toCents(netUnrealizedAfterDepreciation(u))
        unrealizedByOrigin.set(u.originCompanyId, (unrealizedByOrigin.get(u.originCompanyId) ?? 0) + net)
    }

    // ── 3. Eliminación de la inversión contra el patrimonio neto y PNC ──
    const nci: NonControllingInterestDetail[] = []
    for (const sub of subsidiaries) {
        const detail = buildInvestmentElimination({
            parent, sub, parentId, resolver, unrealized, unrealizedByOrigin,
            eliminations, blockers, warnings, nameOf,
        })
        if (detail) nci.push(detail)
    }

    // ── 4. Saldos recíprocos ──
    for (const reciprocal of input.reciprocals) {
        const agreedCents = toCents(reciprocal.agreedAmount)
        if (agreedCents === 0) continue
        const creditorLine = resolver.resolve(reciprocal.creditorCompanyId, reciprocal.creditorAccountId)
        const debtorLine = resolver.resolve(reciprocal.debtorCompanyId, reciprocal.debtorAccountId)
        const difference = toCents(reciprocal.creditorAmount) - toCents(reciprocal.debtorAmount)

        eliminations.push(makeElimination({
            id: `elim-reciprocal-${reciprocal.id}`,
            kind: 'RECIPROCAL_BALANCE',
            origin: reciprocal.autoDetected ? 'SUGGESTED' : 'MANUAL',
            label: `Saldos recíprocos — ${nameOf(reciprocal.creditorCompanyId)} / ${nameOf(reciprocal.debtorCompanyId)}`,
            rationale:
                'Una entidad del grupo no puede deberse dinero a sí misma. El crédito de una y la deuda de la otra ' +
                'son la misma partida vista desde dos lados: para la entidad económica única no existe ninguna de las dos.',
            normativeReference: 'RT 54 — preparación de estados contables consolidados',
            computation: [
                `Saldo según ${nameOf(reciprocal.creditorCompanyId)} (acreedora): ${fmt(toCents(reciprocal.creditorAmount))}`,
                `Saldo según ${nameOf(reciprocal.debtorCompanyId)} (deudora): ${fmt(toCents(reciprocal.debtorAmount))}`,
                `Diferencia sin conciliar: ${fmt(difference)}`,
                `Se elimina el importe CONCILIADO: ${fmt(agreedCents)}. La diferencia no se compensa: queda expuesta.`,
            ],
            lines: [
                line(debtorLine, agreedCents, `Baja de la deuda con ${nameOf(reciprocal.creditorCompanyId)}`, reciprocal.debtorCompanyId, reciprocal.debtorAccountId),
                line(creditorLine, -agreedCents, `Baja del crédito contra ${nameOf(reciprocal.debtorCompanyId)}`, reciprocal.creditorCompanyId, reciprocal.creditorAccountId),
            ],
            relatedCompanyIds: [reciprocal.creditorCompanyId, reciprocal.debtorCompanyId],
            sourceId: reciprocal.id,
        }))

        if (difference !== 0 && reciprocal.status !== 'RECONCILED') {
            blockers.push(
                `Saldo recíproco sin conciliar entre ${nameOf(reciprocal.creditorCompanyId)} y ` +
                `${nameOf(reciprocal.debtorCompanyId)}: diferencia de ${fmt(difference)}` +
                (reciprocal.differenceCause ? ` (causa declarada: ${reciprocal.differenceCause})` : ' sin causa declarada') +
                '. Conciliá la partida o documentá la diferencia antes de emitir.'
            )
        } else if (difference !== 0) {
            warnings.push(
                `Diferencia conciliada de ${fmt(difference)} entre ${nameOf(reciprocal.creditorCompanyId)} y ` +
                `${nameOf(reciprocal.debtorCompanyId)}: ${reciprocal.differenceNote ?? 'sin nota'}`
            )
        }
    }

    // ── 5. Operaciones internas ──
    for (const op of input.operations) {
        const rule = OPERATION_RULES[op.type]
        const transferCents = toCents(op.transferAmount)

        if (op.type === 'DIVIDENDS') {
            if (transferCents === 0) continue
            eliminations.push(makeElimination({
                id: `elim-dividend-${op.id}`,
                kind: 'INTRAGROUP_DIVIDEND',
                origin: 'AUTOMATIC',
                label: `Dividendos intragrupo — ${nameOf(op.sellerCompanyId)} → ${nameOf(op.buyerCompanyId)}`,
                rationale: operationRationale('DIVIDENDS'),
                normativeReference: 'RT 54 — operaciones entre entidades consolidadas',
                computation: [
                    `Dividendos distribuidos por ${nameOf(op.sellerCompanyId)} y percibidos por ${nameOf(op.buyerCompanyId)}: ${fmt(transferCents)}`,
                    'Se elimina el ingreso de la perceptora y se repone la distribución en los resultados acumulados de la distribuidora.',
                    'Los dividendos pagados a la participación no controladora NO se eliminan: salen efectivamente del grupo.',
                ],
                lines: [
                    line(rule.buyerLine, transferCents, `Baja del dividendo reconocido como ingreso`, op.buyerCompanyId),
                    line(rule.sellerLine, -transferCents, `Reposición de la distribución interna`, op.sellerCompanyId),
                ],
                relatedCompanyIds: [op.sellerCompanyId, op.buyerCompanyId],
                sourceId: op.id,
            }))
            continue
        }

        // 5.a — eliminación de la operación bruta (ingreso contra costo)
        if (rule.grossElimination && transferCents !== 0) {
            eliminations.push(makeElimination({
                id: `elim-op-${op.id}`,
                kind: 'INTRAGROUP_OPERATION',
                origin: 'AUTOMATIC',
                label: `${rule.label} — ${nameOf(op.sellerCompanyId)} → ${nameOf(op.buyerCompanyId)}`,
                rationale: operationRationale(op.type),
                normativeReference: 'RT 54 — eliminación de operaciones entre entidades consolidadas',
                computation: [
                    `Importe de la operación dentro del grupo: ${fmt(transferCents)}`,
                    'Se elimina íntegramente el ingreso del vendedor contra el costo que el comprador cargó por esa compra.',
                    'Esta eliminación NO altera el resultado del grupo: sólo evita exponer un ingreso y un costo que no existieron frente a terceros.',
                ],
                lines: [
                    line(rule.sellerLine, transferCents, `Baja del ingreso interno de ${nameOf(op.sellerCompanyId)}`, op.sellerCompanyId),
                    line(rule.buyerLine, -transferCents, `Baja del costo interno de ${nameOf(op.buyerCompanyId)}`, op.buyerCompanyId),
                ],
                relatedCompanyIds: [op.sellerCompanyId, op.buyerCompanyId],
                sourceId: op.id,
            }))
        }
    }

    // 5.b — eliminación del resultado no trascendido contenido en el activo
    for (const u of unrealized) {
        const rule = OPERATION_RULES[u.operation.type]
        const netCents = toCents(netUnrealizedAfterDepreciation(u))
        if (netCents === 0) continue

        if (!rule.assetLine) {
            blockers.push(
                `La operación "${u.operation.description}" (${rule.label}) arroja un resultado no trascendido de ` +
                `${fmt(netCents)}, pero este tipo de operación no deja ningún activo dentro del grupo donde ese ` +
                'resultado esté contenido. Revisá la proporción realizada o el tipo de operación: el motor no ' +
                'inventa una contrapartida para hacer cuadrar.'
            )
            continue
        }

        const costLine = rule.grossElimination ? rule.buyerLine : rule.sellerLine
        eliminations.push(makeElimination({
            id: `elim-unrealized-${u.operation.id}`,
            kind: 'UNREALIZED_RESULT',
            origin: u.manual ? 'MANUAL' : 'AUTOMATIC',
            label: `Resultado no trascendido — ${u.operation.description}`,
            rationale:
                'El activo sigue dentro del grupo, medido al precio que una entidad le cobró a la otra. Para la ' +
                'entidad económica única ese mayor valor no es una ganancia: nadie de afuera la pagó todavía. Se ' +
                'elimina el resultado y el activo vuelve a su costo para el grupo. Cuando el bien salga hacia ' +
                'terceros, la ganancia se reconocerá en ese momento.',
            normativeReference: 'RT 54 — resultados no trascendidos a terceros',
            computation: u.computation,
            lines: [
                line(costLine, netCents, 'Reposición del costo del grupo', u.holdingCompanyId),
                line(rule.assetLine, -netCents, 'Baja del mayor valor contenido en el activo', u.holdingCompanyId),
            ],
            relatedCompanyIds: [u.originCompanyId, u.holdingCompanyId],
            sourceId: u.operation.id,
        }))

        if (u.deferredTax !== 0) {
            const taxCents = toCents(u.deferredTax)
            eliminations.push(makeElimination({
                id: `elim-deferred-tax-${u.operation.id}`,
                kind: 'DEFERRED_TAX',
                origin: 'AUTOMATIC',
                label: `Impuesto diferido sobre el resultado no trascendido — ${u.operation.description}`,
                rationale:
                    'La entidad vendedora ya tributó sobre un resultado que el grupo todavía no reconoce. Ese ' +
                    'impuesto se difiere hasta que el resultado se realice frente a terceros.',
                computation: [
                    `Resultado no trascendido: ${fmt(netCents)}`,
                    `Tasa aplicada: ${((u.operation.deferredTaxRate ?? 0) * 100).toFixed(2)} %`,
                    `Impuesto diferido: ${fmt(taxCents)}`,
                ],
                lines: [
                    line('AC_OTROS_CREDITOS', taxCents, 'Crédito por impuesto diferido', u.originCompanyId),
                    line('ER_IMPUESTO_GANANCIAS', -taxCents, 'Menor cargo por impuesto del grupo', u.originCompanyId),
                ],
                relatedCompanyIds: [u.originCompanyId],
                sourceId: u.operation.id,
            }))
        }
    }

    // ── 6. Ajustes manuales aprobados ──
    for (const adjustment of input.adjustments) {
        if (adjustment.status !== 'APPROVED') continue
        eliminations.push(makeElimination({
            id: `elim-manual-${adjustment.id}`,
            kind: adjustment.category === 'HOMOGENIZATION' ? 'HOMOGENIZATION' : 'MANUAL',
            origin: 'MANUAL',
            label: adjustment.concept,
            rationale: adjustment.explanation,
            computation: [
                `Categoría: ${adjustment.category}`,
                `Fecha: ${adjustment.date}`,
                adjustment.documentReference ? `Referencia: ${adjustment.documentReference}` : 'Sin referencia documental',
                `Registrado por ${adjustment.createdBy}; aprobado por ${adjustment.approvedBy ?? '—'}`,
            ],
            lines: adjustment.lines.map(l => ({
                consolidatedLineId: l.consolidatedLineId,
                companyId: l.companyId,
                accountId: l.accountId,
                debit: l.debit,
                credit: l.credit,
                description: l.description ?? adjustment.concept,
            })),
            relatedCompanyIds: adjustment.relatedCompanyIds,
            sourceId: adjustment.id,
        }))
    }

    // ── 7. Aplicación a la hoja ──
    for (const elimination of eliminations) {
        if (!elimination.balanced) {
            blockers.push(
                `La eliminación "${elimination.label}" no balancea (Debe ≠ Haber). ` +
                'Ninguna eliminación desbalanceada se incorpora al consolidado.'
            )
            continue
        }
        sheet.applyElimination(elimination)
    }

    const rows = sheet.build(entityOrder)
    const checks = buildChecks(rows, eliminations, nci, input)

    for (const check of checks) {
        if (!check.passed) blockers.push(`${check.label}${check.detail ? `: ${check.detail}` : ''}`)
    }

    return {
        consolidationId: consolidation.id,
        groupName: group.name,
        parentCompanyId: parentId,
        reportingDate: consolidation.reportingDate,
        periodStart: consolidation.periodStart,
        periodEnd: consolidation.periodEnd,
        presentationCurrency: group.presentationCurrency,
        measurementUnit: group.measurementUnit,
        entities: [parent, ...subsidiaries].filter(Boolean).map(e => ({
            companyId: e!.companyId,
            name: e!.companyName,
            role: e!.relation,
            ownership: e!.ownership,
        })),
        rows,
        eliminations,
        nci,
        checks,
        blockers: dedupe(blockers),
        warnings: dedupe(warnings),
    }
}

// ─────────────────────────────────────────────────────────────
// Eliminación de la inversión contra el patrimonio neto
// ─────────────────────────────────────────────────────────────

interface InvestmentContext {
    parent: ConsolidationEntityInput | undefined
    sub: ConsolidationEntityInput
    parentId: string
    resolver: LineResolver
    unrealized: UnrealizedResult[]
    unrealizedByOrigin: Map<string, number>
    eliminations: EliminationEntry[]
    blockers: string[]
    warnings: string[]
    nameOf: (companyId: string) => string
}

function buildInvestmentElimination(ctx: InvestmentContext): NonControllingInterestDetail | null {
    const { parent, sub, parentId, resolver, unrealized, unrealizedByOrigin, eliminations, blockers, nameOf } = ctx
    if (!parent) return null

    const p = sub.ownership
    const subTb = sub.trialBalance
    const subAccounts = new Map(sub.accounts.map(a => [a.id, a]))

    // Patrimonio neto de la controlada, en la convención Debe−Haber:
    // las cuentas de patrimonio son acreedoras, así que su neto es negativo.
    let equityCents = 0
    let resultCents = 0
    const equityByLine = new Map<ConsolidatedLineId, { cents: number; accountIds: string[] }>()
    for (const row of subTb.rows) {
        const account = subAccounts.get(row.accountId)
        if (!account) continue
        const cents = toCents(row.closing)
        if (cents === 0) continue
        if (account.kind === 'EQUITY') {
            equityCents += cents
            const lineId = resolver.resolve(sub.companyId, row.accountId)
            const bucket = equityByLine.get(lineId) ?? { cents: 0, accountIds: [] }
            bucket.cents += cents
            bucket.accountIds.push(row.accountId)
            equityByLine.set(lineId, bucket)
        } else if (account.kind === 'INCOME' || account.kind === 'EXPENSE') {
            resultCents += cents
        }
    }
    // Importes positivos "de exposición": patrimonio y resultado del ejercicio.
    const priorEquity = -equityCents          // PN sin el resultado del ejercicio
    const subResult = -resultCents            // resultado del ejercicio (ganancia > 0)
    const totalEquity = priorEquity + subResult

    // Resultados no trascendidos ORIGINADOS por esta controlada: corrigen su
    // patrimonio y su resultado, y por lo tanto se reparten con la PNC.
    const unrealizedFromSub = unrealizedByOrigin.get(sub.companyId) ?? 0
    // Resultados no trascendidos originados por OTRAS entidades y alojados en el
    // activo de ésta: los generó su vendedor, no ella, y no deben reducir su PNC.
    const unrealizedFromOthers = unrealized
        .filter(u => u.holdingCompanyId === sub.companyId && u.originCompanyId !== sub.companyId)
        .reduce((s, u) => s + toCents(netUnrealizedAfterDepreciation(u)), 0)

    const adjustedEquity = totalEquity - unrealizedFromSub
    const adjustedResult = subResult - unrealizedFromSub

    const nciClosing = Math.round(adjustedEquity * (1 - p))
    const nciResult = Math.round(adjustedResult * (1 - p))
    const parentShareEquity = adjustedEquity - nciClosing
    const parentShareResult = adjustedResult - nciResult

    // El VPP que la controladora DEBERÍA tener contabilizado: su parte del
    // patrimonio ajustado, menos los resultados no trascendidos que ella misma
    // generó y que quedaron alojados en el activo de esta controlada.
    const expectedInvestment = parentShareEquity - unrealizedFromOthers
    const expectedEquityMethodResult = parentShareResult - unrealizedFromOthers

    // Importes efectivamente contabilizados por la controladora
    const investmentAccounts = resolver
        .accountsFor(parentId, 'INVESTMENT_IN_SUBSIDIARY')
        .filter(a => !a.counterpartyCompanyId || a.counterpartyCompanyId === sub.companyId)
    const equityMethodAccounts = resolver
        .accountsFor(parentId, 'EQUITY_METHOD_RESULT')
        .filter(a => !a.counterpartyCompanyId || a.counterpartyCompanyId === sub.companyId)

    const parentRowById = new Map(parent.trialBalance.rows.map(r => [r.accountId, r]))
    const bookedInvestment = investmentAccounts
        .reduce((s, a) => s + toCents(parentRowById.get(a.accountId)?.closing ?? 0), 0)
    const bookedEquityMethod = -equityMethodAccounts
        .reduce((s, a) => s + toCents(parentRowById.get(a.accountId)?.closing ?? 0), 0)

    if (investmentAccounts.length === 0) {
        blockers.push(
            `No hay ninguna cuenta de ${nameOf(parentId)} mapeada como "inversión en ${nameOf(sub.companyId)}". ` +
            'Sin ella la inversión no puede eliminarse contra el patrimonio neto de la controlada.'
        )
    }

    const consolidationDifference = bookedInvestment - expectedInvestment
    const equityMethodDifference = bookedEquityMethod - expectedEquityMethodResult

    // ── Asiento de eliminación ──
    const lines: EliminationLine[] = []
    for (const [lineId, bucket] of equityByLine) {
        // Debe: se da de baja el patrimonio de la controlada (saldo acreedor)
        lines.push(line(lineId, -bucket.cents, `Baja del patrimonio neto de ${nameOf(sub.companyId)}`, sub.companyId, bucket.accountIds[0]))
    }
    for (const a of investmentAccounts) {
        const cents = toCents(parentRowById.get(a.accountId)?.closing ?? 0)
        if (cents !== 0) {
            lines.push(line('ANC_INVERSIONES', -cents, `Baja de la inversión en ${nameOf(sub.companyId)}`, parentId, a.accountId))
        }
    }
    for (const a of equityMethodAccounts) {
        const cents = toCents(parentRowById.get(a.accountId)?.closing ?? 0)
        if (cents !== 0) {
            lines.push(line('ER_RESULTADO_INVERSIONES_PERMANENTES', -cents, `Baja del resultado por la inversión en ${nameOf(sub.companyId)}`, parentId, a.accountId))
        }
    }
    if (nciClosing !== 0) {
        lines.push(line('PN_PARTICIPACION_NO_CONTROLADORA', -nciClosing, `Participación no controladora al cierre en ${nameOf(sub.companyId)}`, sub.companyId))
    }
    if (nciResult !== 0) {
        lines.push(line('ER_RESULTADO_PNC', nciResult, `Resultado del ejercicio atribuible a la participación no controladora de ${nameOf(sub.companyId)}`, sub.companyId))
    }
    const residual = consolidationDifference + equityMethodDifference
    if (residual !== 0) {
        lines.push(line('ANC_LLAVE_NEGOCIO', residual,
            `Diferencia entre la inversión contabilizada y el valor patrimonial proporcional de ${nameOf(sub.companyId)}`,
            parentId))
    }

    eliminations.push(makeElimination({
        id: `elim-investment-${sub.companyId}`,
        kind: 'INVESTMENT_VS_EQUITY',
        origin: 'AUTOMATIC',
        label: `Inversión contra patrimonio neto — ${nameOf(sub.companyId)}`,
        rationale:
            'La inversión que la controladora tiene registrada y el patrimonio neto de la controlada son la MISMA ' +
            'riqueza contada dos veces: la inversión representa esos mismos activos y pasivos que ahora se incorporan ' +
            'línea por línea. Por eso la inversión desaparece del consolidado. Lo que queda del patrimonio de la ' +
            'controlada que no pertenece a los propietarios de la controladora se expone como participación no ' +
            'controladora, DENTRO del patrimonio neto: es patrimonio de terceros, no una deuda del grupo.',
        normativeReference: 'RT 54 — método de consolidación total y participación no controladora',
        computation: [
            `Patrimonio neto de ${nameOf(sub.companyId)} sin el resultado del ejercicio: ${fmt(priorEquity)}`,
            `Resultado del ejercicio de la controlada: ${fmt(subResult)}`,
            `Patrimonio neto total al cierre: ${fmt(totalEquity)}`,
            unrealizedFromSub !== 0
                ? `Menos resultados no trascendidos generados por la controlada: ${fmt(-unrealizedFromSub)} ⇒ patrimonio ajustado ${fmt(adjustedEquity)}`
                : 'Sin resultados no trascendidos generados por la controlada',
            `Participación de la controladora: ${(p * 100).toFixed(4)} % ⇒ ${fmt(parentShareEquity)}`,
            `Participación no controladora: ${((1 - p) * 100).toFixed(4)} % ⇒ ${fmt(nciClosing)}`,
            unrealizedFromOthers !== 0
                ? `Menos resultados no trascendidos generados por otras entidades y alojados en el activo de la controlada: ${fmt(-unrealizedFromOthers)} (los generó su vendedor, por eso NO reducen la participación no controladora)`
                : 'Sin resultados no trascendidos generados por otras entidades alojados en esta controlada',
            `Valor patrimonial proporcional esperado: ${fmt(expectedInvestment)}`,
            `Inversión contabilizada por ${nameOf(parentId)}: ${fmt(bookedInvestment)}`,
            `Diferencia de consolidación: ${fmt(consolidationDifference)}`,
            `Resultado del ejercicio atribuible a la participación no controladora: ${fmt(nciResult)}`,
        ],
        lines,
        relatedCompanyIds: [parentId, sub.companyId],
        sourceId: sub.companyId,
    }))

    if (residual !== 0) {
        blockers.push(
            `La inversión de ${nameOf(parentId)} en ${nameOf(sub.companyId)} difiere del valor patrimonial ` +
            `proporcional en ${fmt(residual)}. El motor NO absorbe esa diferencia: registrala como llave de negocio ` +
            'con su fundamento, o corregí la medición de la inversión en los libros de la controladora.'
        )
    }

    return {
        companyId: sub.companyId,
        companyName: sub.companyName,
        ownership: p,
        nonControllingRatio: 1 - p,
        subsidiaryEquity: fromCents(totalEquity),
        unrealizedFromSubsidiary: fromCents(unrealizedFromSub),
        adjustedEquity: fromCents(adjustedEquity),
        closingNci: fromCents(nciClosing),
        subsidiaryResult: fromCents(subResult),
        adjustedResult: fromCents(adjustedResult),
        nciResult: fromCents(nciResult),
        bookedInvestment: fromCents(bookedInvestment),
        expectedInvestment: fromCents(expectedInvestment),
        consolidationDifference: fromCents(residual),
        unrealizedFromOthers: fromCents(unrealizedFromOthers),
    }
}

// ─────────────────────────────────────────────────────────────
// Invariantes (§20)
// ─────────────────────────────────────────────────────────────

function buildChecks(
    rows: WorksheetRow[],
    eliminations: EliminationEntry[],
    nci: NonControllingInterestDetail[],
    input: ConsolidationEngineInput
): ValidationCheck[] {
    const checks: ValidationCheck[] = []
    const sumCents = (pick: (r: WorksheetRow) => number) =>
        rows.reduce((s, r) => s + toCents(pick(r)), 0)

    // 1. La hoja consolidada suma cero: activo = pasivo + patrimonio neto
    const totalConsolidated = sumCents(r => r.consolidated)
    checks.push({
        id: 'consolidado-suma-cero',
        label: 'La hoja consolidada cierra: activo = pasivo + patrimonio neto (incluida la participación no controladora)',
        passed: totalConsolidated === 0,
        expected: 0,
        actual: fromCents(totalConsolidated),
        difference: fromCents(totalConsolidated),
        detail: totalConsolidated !== 0
            ? `La suma Debe−Haber de la hoja consolidada es ${fmt(totalConsolidated)} en lugar de cero`
            : undefined,
    })

    // 2. La suma previa de los estados individuales también cierra
    const totalSubtotal = sumCents(r => r.subtotal)
    checks.push({
        id: 'suma-previa-cierra',
        label: 'La suma línea por línea de los estados individuales cierra antes de eliminar',
        passed: totalSubtotal === 0,
        expected: 0,
        actual: fromCents(totalSubtotal),
        detail: totalSubtotal !== 0
            ? `Algún estado individual no cierra su ecuación patrimonial: diferencia de ${fmt(totalSubtotal)}`
            : undefined,
    })

    // 3. Cada columna de ajuste balancea por separado
    const columns: { key: keyof WorksheetRow; label: string }[] = [
        { key: 'homogenization', label: 'homogeneización' },
        { key: 'investmentElimination', label: 'inversión contra patrimonio neto' },
        { key: 'reciprocalElimination', label: 'saldos recíprocos' },
        { key: 'operationElimination', label: 'operaciones internas' },
        { key: 'unrealizedElimination', label: 'resultados no trascendidos' },
        { key: 'deferredTax', label: 'impuesto diferido' },
        { key: 'manualAdjustment', label: 'ajustes manuales' },
    ]
    for (const col of columns) {
        const total = sumCents(r => r[col.key] as number)
        checks.push({
            id: `columna-balancea-${String(col.key)}`,
            label: `La columna de ${col.label} balancea (Debe = Haber)`,
            passed: total === 0,
            expected: 0,
            actual: fromCents(total),
            detail: total !== 0 ? `Diferencia de ${fmt(total)}` : undefined,
        })
    }

    // 4. Toda eliminación tiene Debe = Haber
    const unbalanced = eliminations.filter(e => !e.balanced)
    checks.push({
        id: 'eliminaciones-balanceadas',
        label: 'Toda eliminación de consolidación tiene Debe = Haber',
        passed: unbalanced.length === 0,
        detail: unbalanced.length > 0
            ? `No balancean: ${unbalanced.map(e => e.label).join(' · ')}`
            : undefined,
    })

    // 5. La inversión en controladas consolidadas queda en cero
    const investmentRow = rows.find(r => r.lineId === 'ANC_INVERSIONES')
    const investmentLeft = investmentRow ? toCents(investmentRow.consolidated) : 0
    checks.push({
        id: 'inversion-eliminada',
        label: 'La inversión en las controladas consolidadas queda eliminada',
        passed: investmentLeft === 0,
        actual: fromCents(investmentLeft),
        detail: investmentLeft !== 0
            ? `Quedan ${fmt(investmentLeft)} en inversiones permanentes. Si corresponden a asociadas medidas por VPP ` +
              'está bien que permanezcan; si son de controladas consolidadas, faltó mapear la cuenta.'
            : undefined,
    })

    // 6. La suma de entidades + ajustes coincide exactamente con el consolidado
    const reconciliationFailures = rows.filter(r => {
        const recomputed = toCents(r.subtotal) + toCents(r.homogenization) + toCents(r.investmentElimination) +
            toCents(r.nonControllingInterest) + toCents(r.reciprocalElimination) + toCents(r.operationElimination) +
            toCents(r.unrealizedElimination) + toCents(r.deferredTax) + toCents(r.manualAdjustment)
        return recomputed !== toCents(r.consolidated)
    })
    checks.push({
        id: 'filas-reconcilian',
        label: 'En cada línea, suma previa + ajustes + eliminaciones = importe consolidado',
        passed: reconciliationFailures.length === 0,
        detail: reconciliationFailures.length > 0
            ? `No reconcilian: ${reconciliationFailures.map(r => r.label).join(' · ')}`
            : undefined,
    })

    // 7. La PNC expuesta coincide con la calculada por controlada
    const nciRow = rows.find(r => r.lineId === 'PN_PARTICIPACION_NO_CONTROLADORA')
    const nciExposed = nciRow ? -toCents(nciRow.consolidated) : 0
    const nciComputed = nci.reduce((s, d) => s + toCents(d.closingNci), 0)
    checks.push({
        id: 'pnc-coincide',
        label: 'La participación no controladora expuesta coincide con la calculada por controlada',
        passed: nciExposed === nciComputed,
        expected: fromCents(nciComputed),
        actual: fromCents(nciExposed),
        difference: fromCents(nciExposed - nciComputed),
        detail: nciExposed !== nciComputed
            ? `Expuesta ${fmt(nciExposed)} contra ${fmt(nciComputed)} calculada`
            : undefined,
    })

    // 8. Ningún importe es NaN ni infinito
    const invalid = rows.filter(r =>
        [r.subtotal, r.consolidated, r.investmentElimination, r.unrealizedElimination]
            .some(v => !Number.isFinite(v)))
    checks.push({
        id: 'importes-finitos',
        label: 'Ningún importe consolidado es NaN ni infinito',
        passed: invalid.length === 0,
        detail: invalid.length > 0 ? `Líneas afectadas: ${invalid.map(r => r.label).join(' · ')}` : undefined,
    })

    // 9. Las entidades del perímetro tienen su ejercicio en condiciones
    const openExercises = input.entities.filter(e => e.method === 'FULL' && e.exerciseStatus === 'OPEN')
    checks.push({
        id: 'ejercicios-cerrados',
        label: 'Los ejercicios individuales que alimentan la consolidación están cerrados o aprobados',
        passed: openExercises.length === 0,
        detail: openExercises.length > 0
            ? `Siguen abiertos: ${openExercises.map(e => e.companyName).join(', ')}. Sus cifras pueden cambiar.`
            : undefined,
    })

    return checks
}

function dedupe(values: string[]): string[] {
    return Array.from(new Set(values))
}

export { isResultLine, getLineSpec }
