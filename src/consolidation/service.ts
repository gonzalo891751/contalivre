/**
 * Servicio de consolidación (Fase 2K §6, §7, §23).
 *
 * Une la persistencia con el motor puro: carga los estados individuales
 * CANÓNICOS de cada entidad usando el mismo motor de reporting que produce los
 * estados de una empresa sola, arma la entrada del motor de consolidación y
 * devuelve la hoja de trabajo y el juego consolidado.
 *
 * Lectura pura: este servicio NO escribe nada. Las escrituras viven en
 * repository.ts y ninguna de ellas toca los libros de las entidades.
 */

import { db } from '../storage/db'
import { getCompany, getExerciseForCompanyYear } from '../accounting/application/contextService'
import { loadReportingInput } from '../reporting/loadStatements'
import { buildStatements, buildNormalizedTrialBalance } from '../reporting/engine/buildStatements'
import { buildCashFlows } from '../reporting/engine/buildCashFlow'
import { isStructuralClosingEntry } from '../utils/resultsStatement'
import { getActivePolicy } from '../reporting/policy/policyRepository'
import { buildConsolidationWorksheet } from './engine/worksheet'
import { buildConsolidatedStatements, type ConsolidatedStatements } from './engine/statements'
import { deriveConsolidatedLine, suggestIntragroupCategory } from './domain/lines'
import { isWithinPerimeter, perimeterExclusionReason, assessControl } from './domain/ownership'
import {
    getConsolidation,
    getGroup,
    listAdjustments,
    listIntragroupOperations,
    listMemberLinks,
    listMappings,
    listMembers,
    listReciprocals,
} from './repository'
import type {
    ConsolidationEngineInput,
    ConsolidationEntityInput,
    ConsolidationWorksheet,
    GroupMember,
    MappingSuggestion,
    ReadinessCheck,
    ReadinessReport,
} from './domain/types'

// ─────────────────────────────────────────────────────────────
// Carga de la entrada del motor
// ─────────────────────────────────────────────────────────────

/**
 * Estados individuales de una entidad, producidos por el MOTOR CANÓNICO.
 *
 * Se calculan dos representaciones que no son intercambiables:
 *  - `statements`: el juego completo (ESP, ER, EEPN, EFE, anexos), idéntico al
 *    que la entidad ve en su propia pantalla de Estados;
 *  - `trialBalance`: el balance de comprobación ANTES de la refundición, que es
 *    la base sobre la que se consolida.
 */
async function loadEntityInput(
    member: GroupMember,
    year: number,
    ownership: number
): Promise<ConsolidationEntityInput> {
    const company = await getCompany(member.companyId)
    const exercise = await getExerciseForCompanyYear(member.companyId, year)
    const input = await loadReportingInput(year, { companyId: member.companyId })

    const policy = await getActivePolicy(input.context.companyId, input.context.exerciseId).catch(() => null)
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements, policy)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation

    // Base de consolidación: se excluye el asiento estructural de refundición
    // (el patrimonio queda sin el resultado del ejercicio y las cuentas de
    // resultado conservan el movimiento del período), y se preservan los saldos
    // de apertura. La suma Debe−Haber sigue siendo exactamente cero.
    const trialBalance = buildNormalizedTrialBalance({
        ...input,
        entries: input.entries.filter(e => !isStructuralClosingEntry(e)),
    })

    return {
        companyId: member.companyId,
        companyName: company?.legalName ?? member.companyId,
        relation: member.relation,
        method: member.method,
        ownership,
        statements,
        trialBalance,
        accounts: input.accounts,
        periodEnd: input.context.periodEnd,
        exerciseStatus: exercise?.status ?? 'OPEN',
    }
}

export async function loadConsolidationEngineInput(
    consolidationId: string,
    options: { withComparative?: boolean } = {}
): Promise<ConsolidationEngineInput> {
    const consolidation = await getConsolidation(consolidationId)
    if (!consolidation) throw new Error(`La consolidación ${consolidationId} no existe`)
    const group = await getGroup(consolidation.groupId)
    if (!group) throw new Error(`El grupo ${consolidation.groupId} no existe`)

    const [members, links, mappings, reciprocals, operations, adjustments] = await Promise.all([
        listMembers(group.id),
        listMemberLinks(consolidationId),
        listMappings(group.id),
        listReciprocals(consolidationId),
        listIntragroupOperations(consolidationId),
        listAdjustments(consolidationId),
    ])

    const linkByMember = new Map(links.map(l => [l.memberId, l]))
    const entities: ConsolidationEntityInput[] = []
    for (const member of members) {
        const link = linkByMember.get(member.id)
        if (link && !link.included && member.relation !== 'PARENT') continue
        if (member.relation !== 'PARENT' && !isWithinPerimeter(member, consolidation.reportingDate)) continue
        const year = link?.sourceYear ?? Number(consolidation.reportingDate.slice(0, 4))
        const ownership = link?.ownership ?? member.directOwnership
        entities.push(await loadEntityInput(member, year, ownership))
    }

    let comparative: ConsolidationWorksheet | null = null
    if (options.withComparative && consolidation.previousConsolidationId) {
        try {
            const prevInput = await loadConsolidationEngineInput(consolidation.previousConsolidationId)
            comparative = buildConsolidationWorksheet(prevInput)
        } catch {
            comparative = null
        }
    }

    return {
        consolidation,
        group,
        entities,
        mappings,
        reciprocals,
        operations,
        adjustments,
        comparative,
    }
}

export interface ConsolidationResult {
    input: ConsolidationEngineInput
    worksheet: ConsolidationWorksheet
    statements: ConsolidatedStatements
    readiness: ReadinessReport
}

export async function runConsolidation(
    consolidationId: string,
    options: { withComparative?: boolean } = {}
): Promise<ConsolidationResult> {
    const input = await loadConsolidationEngineInput(consolidationId, options)
    const worksheet = buildConsolidationWorksheet(input)
    const statements = buildConsolidatedStatements(input, worksheet)
    const readiness = await buildReadinessReport(consolidationId, input)
    return { input, worksheet, statements, readiness }
}

// ─────────────────────────────────────────────────────────────
// Panel de preparación (§6)
// ─────────────────────────────────────────────────────────────

const MAX_CLOSING_GAP_MONTHS = 3

function monthsBetween(a: string, b: string): number {
    const [ay, am] = a.split('-').map(Number)
    const [by, bm] = b.split('-').map(Number)
    return Math.abs((by - ay) * 12 + (bm - am))
}

export async function buildReadinessReport(
    consolidationId: string,
    preloaded?: ConsolidationEngineInput
): Promise<ReadinessReport> {
    const input = preloaded ?? await loadConsolidationEngineInput(consolidationId)
    const { consolidation, group } = input
    const checks: ReadinessCheck[] = []

    const members = await listMembers(group.id)
    const links = await listMemberLinks(consolidationId)
    const linkByCompany = new Map(links.map(l => [l.companyId, l]))

    // 1. Perímetro definido
    const subsidiaries = members.filter(m => m.relation !== 'PARENT')
    checks.push({
        id: 'perimetro',
        label: 'Perímetro de consolidación definido',
        state: subsidiaries.length === 0 ? 'BLOCKED' : 'COMPLETE',
        detail: subsidiaries.length === 0
            ? 'El grupo no tiene ninguna entidad además de la controladora'
            : `${subsidiaries.length} entidad(es) además de la controladora`,
        remediation: subsidiaries.length === 0 ? 'Incorporá al menos una controlada al grupo' : undefined,
    })

    // 2. Conclusión sobre el control, fundada
    for (const member of subsidiaries) {
        const assessment = assessControl(member)
        const company = await getCompany(member.companyId)
        const name = company?.legalName ?? member.companyId
        checks.push({
            id: `control-${member.companyId}`,
            label: `Conclusión sobre el control de ${name}`,
            companyId: member.companyId,
            state: assessment.missingRationale ? 'BLOCKED'
                : assessment.divergesFromPercentage ? 'NEEDS_REVIEW' : 'COMPLETE',
            detail: assessment.missingRationale
                ? 'La conclusión sobre el control no está fundada'
                : assessment.divergesFromPercentage
                    ? `Se concluyó ${assessment.declaredControl ? 'que HAY' : 'que NO hay'} control con ` +
                      `${(assessment.effectiveVotingRights * 100).toFixed(2)} % de los votos: la conclusión no surge del porcentaje ` +
                      'y por eso el fundamento es imprescindible'
                    : assessment.rationale,
            remediation: assessment.missingRationale ? 'Registrá el fundamento en el perímetro' : undefined,
        })
    }

    // 3. Estados individuales disponibles y ejercicios en condiciones
    for (const entity of input.entities) {
        checks.push({
            id: `estados-${entity.companyId}`,
            label: `Estados individuales de ${entity.companyName}`,
            companyId: entity.companyId,
            state: entity.trialBalance.rows.length === 0 ? 'BLOCKED'
                : entity.exerciseStatus === 'OPEN' ? 'NEEDS_REVIEW' : 'COMPLETE',
            detail: entity.trialBalance.rows.length === 0
                ? 'No hay movimientos registrados en el ejercicio seleccionado'
                : entity.exerciseStatus === 'OPEN'
                    ? 'El ejercicio individual sigue abierto: sus cifras pueden cambiar'
                    : `Ejercicio ${entity.exerciseStatus}`,
            remediation: entity.trialBalance.rows.length === 0
                ? 'Verificá el ejercicio vinculado en Estados fuente'
                : entity.exerciseStatus === 'OPEN'
                    ? 'Cerrá el ejercicio individual antes de emitir el juego consolidado'
                    : undefined,
        })

        // 4. Compatibilidad de fechas de cierre
        const link = linkByCompany.get(entity.companyId)
        const gap = monthsBetween(entity.periodEnd.slice(0, 7), consolidation.reportingDate.slice(0, 7))
        if (entity.companyId !== group.parentCompanyId && gap > 0) {
            checks.push({
                id: `fechas-${entity.companyId}`,
                label: `Fecha de cierre de ${entity.companyName}`,
                companyId: entity.companyId,
                state: gap > MAX_CLOSING_GAP_MONTHS ? 'BLOCKED'
                    : link?.homogenizationNote ? 'COMPLETE' : 'NEEDS_REVIEW',
                detail: `Cierra el ${entity.periodEnd}, ${gap} mes(es) antes que la controladora ` +
                    `(${consolidation.reportingDate})`,
                remediation: gap > MAX_CLOSING_GAP_MONTHS
                    ? `La diferencia supera los ${MAX_CLOSING_GAP_MONTHS} meses admitidos: la controlada debe preparar ` +
                      'estados especiales a la fecha de cierre de la controladora'
                    : link?.homogenizationNote
                        ? undefined
                        : 'Identificá las operaciones significativas posteriores y documentá el fundamento en el vínculo del ejercicio',
            })
        }
    }

    // 5. Mapeo de cuentas completo
    const mappingGaps = await findUnmappedAccounts(input)
    checks.push({
        id: 'mapeo',
        label: 'Mapeo de cuentas al plan consolidado',
        state: mappingGaps.blocking > 0 ? 'BLOCKED' : mappingGaps.review > 0 ? 'NEEDS_REVIEW' : 'COMPLETE',
        detail: mappingGaps.blocking > 0
            ? `${mappingGaps.blocking} cuenta(s) sin línea consolidada`
            : mappingGaps.review > 0
                ? `${mappingGaps.review} cuenta(s) con destino ambiguo`
                : 'Todas las cuentas con saldo tienen línea consolidada',
        remediation: mappingGaps.blocking > 0 || mappingGaps.review > 0
            ? 'Revisalas en Mapeo de cuentas' : undefined,
    })

    // 6. Inversión en cada controlada, identificada
    const investmentMapped = new Set(
        input.mappings
            .filter(m => m.intragroupCategory === 'INVESTMENT_IN_SUBSIDIARY' && m.counterpartyCompanyId)
            .map(m => m.counterpartyCompanyId!)
    )
    for (const entity of input.entities) {
        if (entity.companyId === group.parentCompanyId || entity.method !== 'FULL') continue
        checks.push({
            id: `inversion-${entity.companyId}`,
            label: `Inversión de la controladora en ${entity.companyName}`,
            companyId: entity.companyId,
            state: investmentMapped.has(entity.companyId) ? 'COMPLETE' : 'BLOCKED',
            detail: investmentMapped.has(entity.companyId)
                ? 'La cuenta de inversión está identificada y se eliminará contra el patrimonio neto'
                : 'No hay ninguna cuenta identificada como inversión en esta controlada',
            remediation: investmentMapped.has(entity.companyId)
                ? undefined
                : 'Marcá la cuenta de inversión permanente en Mapeo de cuentas e indicá la contraparte',
        })
    }

    // 7. Saldos recíprocos conciliados
    const unreconciled = input.reciprocals.filter(r => r.status !== 'RECONCILED')
    checks.push({
        id: 'reciprocos',
        label: 'Conciliación de saldos recíprocos',
        state: input.reciprocals.length === 0 ? 'NOT_APPLICABLE'
            : unreconciled.length > 0 ? 'BLOCKED' : 'COMPLETE',
        detail: input.reciprocals.length === 0
            ? 'No se declararon partidas recíprocas entre las entidades'
            : unreconciled.length > 0
                ? `${unreconciled.length} partida(s) sin conciliar`
                : `${input.reciprocals.length} partida(s) conciliadas`,
        remediation: unreconciled.length > 0 ? 'Conciliá o documentá la diferencia en Conciliación intragrupo' : undefined,
    })

    // 8. Ajustes manuales pendientes de aprobación
    const draftAdjustments = input.adjustments.filter(a => a.status === 'DRAFT')
    checks.push({
        id: 'ajustes',
        label: 'Ajustes manuales de consolidación',
        state: input.adjustments.length === 0 ? 'NOT_APPLICABLE'
            : draftAdjustments.length > 0 ? 'NEEDS_REVIEW' : 'COMPLETE',
        detail: draftAdjustments.length > 0
            ? `${draftAdjustments.length} ajuste(s) en borrador que NO se aplican al consolidado`
            : `${input.adjustments.length} ajuste(s) aprobados`,
        remediation: draftAdjustments.length > 0 ? 'Aprobalos o eliminalos antes de emitir' : undefined,
    })

    // 9. Moneda y unidad de medida uniformes
    const currencies = new Set<string>()
    for (const entity of input.entities) {
        const company = await getCompany(entity.companyId)
        currencies.add(company?.currency ?? 'ARS')
    }
    checks.push({
        id: 'moneda',
        label: 'Moneda uniforme en todas las entidades',
        state: currencies.size <= 1 ? 'COMPLETE' : 'BLOCKED',
        detail: currencies.size <= 1
            ? `Todas las entidades operan en ${[...currencies][0] ?? group.presentationCurrency}`
            : `Conviven ${[...currencies].join(', ')}: los estados de las entidades del exterior deben convertirse antes de consolidar`,
        remediation: currencies.size > 1
            ? 'La conversión de estados en moneda extranjera no está implementada en esta fase'
            : undefined,
    })

    const blocked = checks.filter(c => c.state === 'BLOCKED').length
    const applicable = checks.filter(c => c.state !== 'NOT_APPLICABLE').length
    const complete = checks.filter(c => c.state === 'COMPLETE').length

    return {
        checks,
        canConsolidate: blocked === 0,
        progress: applicable === 0 ? 0 : Math.round((complete / applicable) * 100),
    }
}

async function findUnmappedAccounts(
    input: ConsolidationEngineInput
): Promise<{ blocking: number; review: number }> {
    const explicit = new Set(input.mappings.map(m => `${m.companyId}::${m.accountId}`))
    let blocking = 0
    let review = 0
    for (const entity of input.entities) {
        const byId = new Map(entity.accounts.map(a => [a.id, a]))
        for (const row of entity.trialBalance.rows) {
            if (row.closing === 0) continue
            if (explicit.has(`${entity.companyId}::${row.accountId}`)) continue
            const account = byId.get(row.accountId)
            if (!account) { blocking += 1; continue }
            const derived = deriveConsolidatedLine(account)
            if (derived.lineId === 'SIN_CLASIFICAR') blocking += 1
            else if (derived.confidence === 'LOW') review += 1
        }
    }
    return { blocking, review }
}

// ─────────────────────────────────────────────────────────────
// Asistente de mapeo (§7)
// ─────────────────────────────────────────────────────────────

export async function suggestMappings(consolidationId: string): Promise<MappingSuggestion[]> {
    const input = await loadConsolidationEngineInput(consolidationId)
    const existing = new Set(input.mappings.map(m => `${m.companyId}::${m.accountId}`))
    const out: MappingSuggestion[] = []

    for (const entity of input.entities) {
        const byId = new Map(entity.accounts.map(a => [a.id, a]))
        for (const row of entity.trialBalance.rows) {
            if (row.closing === 0) continue
            if (existing.has(`${entity.companyId}::${row.accountId}`)) continue
            const account = byId.get(row.accountId)
            if (!account) continue
            const derived = deriveConsolidatedLine(account)
            const intragroup = suggestIntragroupCategory(account)
            out.push({
                companyId: entity.companyId,
                accountId: account.id,
                code: account.code,
                name: account.name,
                consolidatedLineId: derived.lineId,
                intragroupCategory: intragroup.category,
                confidence: derived.confidence,
                rationale: intragroup.needsReview
                    ? `${derived.rationale}. ${intragroup.rationale}`
                    : derived.rationale,
                needsReview: intragroup.needsReview || derived.confidence !== 'HIGH',
            })
        }
    }
    return out.sort((a, b) => a.companyId.localeCompare(b.companyId) || a.code.localeCompare(b.code))
}

// ─────────────────────────────────────────────────────────────
// Detección de saldos recíprocos (§10)
// ─────────────────────────────────────────────────────────────

export interface ReciprocalCandidate {
    creditorCompanyId: string
    creditorAccountId: string
    creditorAccountName: string
    creditorAmount: number
    debtorCompanyId: string
    debtorAccountId: string
    debtorAccountName: string
    debtorAmount: number
    difference: number
    kind: 'TRADE' | 'LOAN' | 'INTEREST' | 'DIVIDEND' | 'CURRENT_ACCOUNT' | 'OTHER'
}

const RECEIVABLE_CATEGORIES = new Set([
    'INTRAGROUP_RECEIVABLE', 'INTRAGROUP_LOAN_ASSET', 'INTRAGROUP_DIVIDEND_RECEIVABLE',
])
const PAYABLE_CATEGORIES = new Set([
    'INTRAGROUP_PAYABLE', 'INTRAGROUP_LOAN_LIABILITY', 'INTRAGROUP_DIVIDEND_PAYABLE',
])

const KIND_BY_CATEGORY: Record<string, ReciprocalCandidate['kind']> = {
    INTRAGROUP_RECEIVABLE: 'TRADE',
    INTRAGROUP_PAYABLE: 'TRADE',
    INTRAGROUP_LOAN_ASSET: 'LOAN',
    INTRAGROUP_LOAN_LIABILITY: 'LOAN',
    INTRAGROUP_DIVIDEND_RECEIVABLE: 'DIVIDEND',
    INTRAGROUP_DIVIDEND_PAYABLE: 'DIVIDEND',
}

/**
 * Propone partidas recíprocas cruzando las cuentas MARCADAS como intragrupo con
 * su contraparte declarada. No adivina por el nombre de la cuenta ni por
 * coincidencia de importes: si el usuario no declaró la contraparte, el motor
 * no inventa una relación entre dos entidades.
 */
export async function detectReciprocals(consolidationId: string): Promise<ReciprocalCandidate[]> {
    const input = await loadConsolidationEngineInput(consolidationId)
    const balanceOf = (companyId: string, accountId: string) => {
        const entity = input.entities.find(e => e.companyId === companyId)
        return entity?.trialBalance.rows.find(r => r.accountId === accountId)?.closing ?? 0
    }
    const nameOf = (companyId: string, accountId: string) => {
        const entity = input.entities.find(e => e.companyId === companyId)
        return entity?.trialBalance.rows.find(r => r.accountId === accountId)?.name ?? accountId
    }

    const receivables = input.mappings.filter(m =>
        RECEIVABLE_CATEGORIES.has(m.intragroupCategory) && m.counterpartyCompanyId)
    const payables = input.mappings.filter(m =>
        PAYABLE_CATEGORIES.has(m.intragroupCategory) && m.counterpartyCompanyId)

    const out: ReciprocalCandidate[] = []
    for (const receivable of receivables) {
        const match = payables.find(p =>
            p.companyId === receivable.counterpartyCompanyId &&
            p.counterpartyCompanyId === receivable.companyId &&
            KIND_BY_CATEGORY[p.intragroupCategory] === KIND_BY_CATEGORY[receivable.intragroupCategory])
        if (!match) continue
        const creditorAmount = balanceOf(receivable.companyId, receivable.accountId)
        const debtorAmount = -balanceOf(match.companyId, match.accountId)
        out.push({
            creditorCompanyId: receivable.companyId,
            creditorAccountId: receivable.accountId,
            creditorAccountName: nameOf(receivable.companyId, receivable.accountId),
            creditorAmount,
            debtorCompanyId: match.companyId,
            debtorAccountId: match.accountId,
            debtorAccountName: nameOf(match.companyId, match.accountId),
            debtorAmount,
            difference: creditorAmount - debtorAmount,
            kind: KIND_BY_CATEGORY[receivable.intragroupCategory] ?? 'OTHER',
        })
    }
    return out
}

/** Motivo por el cual una entidad del grupo quedó fuera del perímetro */
export async function describePerimeter(groupId: string, reportingDate: string): Promise<{
    member: GroupMember
    companyName: string
    included: boolean
    reason: string | null
}[]> {
    const members = await listMembers(groupId)
    const out = []
    for (const member of members) {
        const company = await getCompany(member.companyId)
        out.push({
            member,
            companyName: company?.legalName ?? member.companyId,
            included: isWithinPerimeter(member, reportingDate),
            reason: perimeterExclusionReason(member, reportingDate),
        })
    }
    return out
}

/** Empresas que todavía no integran el grupo, para el selector de alta */
export async function listCandidateCompanies(groupId: string): Promise<{ id: string; legalName: string }[]> {
    const members = await listMembers(groupId)
    const taken = new Set(members.map(m => m.companyId))
    const companies = await db.companies.toArray()
    return companies
        .filter(c => !taken.has(c.id))
        .map(c => ({ id: c.id, legalName: c.legalName }))
        .sort((a, b) => a.legalName.localeCompare(b.legalName))
}
