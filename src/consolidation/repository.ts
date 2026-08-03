/**
 * Persistencia del módulo de consolidación (Fase 2K).
 *
 * ÚNICA puerta de escritura sobre las tablas del grupo económico. Ninguna de
 * estas operaciones escribe en `entries`, `accounts`, `exercises` ni `periods`:
 * los libros y los estados individuales de las entidades son INMUTABLES para
 * este módulo. Si alguna vez hiciera falta corregir una cifra individual, hay
 * que hacerlo en la entidad, por su propio Diario, y volver a consolidar.
 */

import { db, generateId } from '../storage/db'
import { roundMoney } from '../accounting/domain/money'
import { LOCAL_ACTOR } from '../accounting/domain/types'
import { exerciseIdFor, getDefaultCompany } from '../accounting/application/contextService'
import { validateOwnership } from './domain/ownership'
import type {
    AdjustmentCategory,
    ConsolidationAccountMapping,
    ConsolidationExercise,
    ConsolidationMemberLink,
    ConsolidationStatus,
    ControlBasis,
    EconomicGroup,
    GroupMember,
    IntragroupOperation,
    IntragroupOperationType,
    ManualAdjustmentLine,
    ManualConsolidationAdjustment,
    MemberRelation,
    ConsolidationMethod,
    ReciprocalBalance,
    ReciprocalKind,
    ConsolidatedLineId,
    IntragroupCategory,
} from './domain/types'

const nowISO = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────
// Grupos económicos
// ─────────────────────────────────────────────────────────────

export async function listGroups(): Promise<EconomicGroup[]> {
    const all = await db.economicGroups.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getGroup(id: string): Promise<EconomicGroup | undefined> {
    return db.economicGroups.get(id)
}

export async function createGroup(input: {
    id?: string
    name: string
    parentCompanyId: string
    presentationCurrency?: string
    measurementUnit?: string
    description?: string
}): Promise<EconomicGroup> {
    const name = input.name.trim()
    if (!name) throw new Error('La denominación del grupo económico es obligatoria')
    // La empresa por defecto se materializa de forma perezosa en toda la app.
    await getDefaultCompany()
    const parent = await db.companies.get(input.parentCompanyId)
    if (!parent) throw new Error(`La entidad controladora ${input.parentCompanyId} no existe`)

    const timestamp = nowISO()
    const group: EconomicGroup = {
        id: input.id ?? generateId(),
        name,
        parentCompanyId: input.parentCompanyId,
        presentationCurrency: input.presentationCurrency ?? parent.currency ?? 'ARS',
        measurementUnit: input.measurementUnit ?? 'Moneda de cierre',
        description: input.description,
        createdAt: timestamp,
        updatedAt: timestamp,
        active: true,
    }
    await db.economicGroups.add(group)

    // La controladora es miembro de su propio grupo por definición.
    await db.groupMembers.add({
        id: generateId(),
        groupId: group.id,
        companyId: input.parentCompanyId,
        relation: 'PARENT',
        method: 'FULL',
        directOwnership: 1,
        controlFrom: '1900-01-01',
        hasControl: true,
        controlBasis: 'MAJORITY_VOTING_RIGHTS',
        controlRationale: 'Entidad controladora del grupo',
        sortOrder: 0,
    })
    return group
}

export async function updateGroup(
    id: string,
    changes: Partial<Pick<EconomicGroup, 'name' | 'presentationCurrency' | 'measurementUnit' | 'description' | 'active'>>
): Promise<void> {
    await db.economicGroups.update(id, { ...changes, updatedAt: nowISO() })
}

export async function deleteGroup(id: string): Promise<void> {
    const consolidations = await db.consolidationExercises.where('groupId').equals(id).toArray()
    for (const c of consolidations) await deleteConsolidation(c.id)
    await db.consolidationMappings.where('groupId').equals(id).delete()
    await db.groupMembers.where('groupId').equals(id).delete()
    await db.economicGroups.delete(id)
}

// ─────────────────────────────────────────────────────────────
// Perímetro
// ─────────────────────────────────────────────────────────────

export async function listMembers(groupId: string): Promise<GroupMember[]> {
    const all = await db.groupMembers.where('groupId').equals(groupId).toArray()
    return all.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function addMember(input: {
    groupId: string
    companyId: string
    relation: MemberRelation
    method?: ConsolidationMethod
    directOwnership: number
    votingRights?: number
    heldThroughMemberId?: string
    controlFrom: string
    controlTo?: string
    hasControl: boolean
    controlBasis: ControlBasis
    controlRationale: string
    exclusionReason?: string
}): Promise<GroupMember> {
    const ownershipError = validateOwnership(input.directOwnership, 'Participación patrimonial')
    if (ownershipError) throw new Error(ownershipError)
    if (input.votingRights !== undefined) {
        const votesError = validateOwnership(input.votingRights, 'Derechos de voto')
        if (votesError) throw new Error(votesError)
    }
    if (!input.controlRationale?.trim()) {
        throw new Error('El fundamento de la conclusión sobre el control es obligatorio: el sistema no concluye control en silencio')
    }
    if (!(await db.companies.get(input.companyId))) {
        throw new Error(`La entidad ${input.companyId} no existe`)
    }
    const existing = await db.groupMembers
        .where('[groupId+companyId]').equals([input.groupId, input.companyId]).first()
    if (existing) throw new Error('La entidad ya integra el grupo')

    const members = await listMembers(input.groupId)
    const member: GroupMember = {
        id: generateId(),
        groupId: input.groupId,
        companyId: input.companyId,
        relation: input.relation,
        method: input.method ?? (input.relation === 'SUBSIDIARY' && input.hasControl ? 'FULL' : 'EQUITY_METHOD'),
        directOwnership: input.directOwnership,
        votingRights: input.votingRights,
        heldThroughMemberId: input.heldThroughMemberId,
        controlFrom: input.controlFrom,
        controlTo: input.controlTo,
        hasControl: input.hasControl,
        controlBasis: input.controlBasis,
        controlRationale: input.controlRationale.trim(),
        exclusionReason: input.exclusionReason,
        sortOrder: members.length,
    }
    await db.groupMembers.add(member)
    return member
}

export async function updateMember(id: string, changes: Partial<GroupMember>): Promise<void> {
    if (changes.directOwnership !== undefined) {
        const err = validateOwnership(changes.directOwnership, 'Participación patrimonial')
        if (err) throw new Error(err)
    }
    if (changes.votingRights !== undefined) {
        const err = validateOwnership(changes.votingRights, 'Derechos de voto')
        if (err) throw new Error(err)
    }
    await db.groupMembers.update(id, changes)
}

export async function removeMember(id: string): Promise<void> {
    const member = await db.groupMembers.get(id)
    if (!member) return
    if (member.relation === 'PARENT') {
        throw new Error('No se puede quitar la entidad controladora del grupo')
    }
    await db.consolidationMemberLinks.where('memberId').equals(id).delete()
    await db.groupMembers.delete(id)
}

// ─────────────────────────────────────────────────────────────
// Ejercicios de consolidación
// ─────────────────────────────────────────────────────────────

export async function listConsolidations(groupId: string): Promise<ConsolidationExercise[]> {
    const all = await db.consolidationExercises.where('groupId').equals(groupId).toArray()
    return all.sort((a, b) => b.reportingDate.localeCompare(a.reportingDate))
}

export async function getConsolidation(id: string): Promise<ConsolidationExercise | undefined> {
    return db.consolidationExercises.get(id)
}

/**
 * Crea el ejercicio de consolidación y vincula automáticamente a cada miembro
 * su ejercicio individual del mismo año. Los vínculos son editables: una
 * controlada puede cerrar antes, y eso se declara, no se disimula.
 */
export async function createConsolidation(input: {
    id?: string
    groupId: string
    year: number
    label?: string
    reportingDate?: string
    periodStart?: string
    inflationIndexSetId?: string
    previousConsolidationId?: string
}): Promise<ConsolidationExercise> {
    const group = await getGroup(input.groupId)
    if (!group) throw new Error(`El grupo ${input.groupId} no existe`)

    const timestamp = nowISO()
    const consolidation: ConsolidationExercise = {
        id: input.id ?? generateId(),
        groupId: input.groupId,
        label: input.label ?? `Ejercicio ${input.year}`,
        reportingDate: input.reportingDate ?? `${input.year}-12-31`,
        periodStart: input.periodStart ?? `${input.year}-01-01`,
        periodEnd: input.reportingDate ?? `${input.year}-12-31`,
        status: 'DRAFT',
        inflationIndexSetId: input.inflationIndexSetId,
        previousConsolidationId: input.previousConsolidationId,
        createdAt: timestamp,
        updatedAt: timestamp,
    }
    await db.consolidationExercises.add(consolidation)

    const members = await listMembers(input.groupId)
    for (const member of members) {
        const exerciseId = exerciseIdFor(member.companyId, input.year)
        const link: ConsolidationMemberLink = {
            id: generateId(),
            consolidationId: consolidation.id,
            memberId: member.id,
            companyId: member.companyId,
            sourceYear: input.year,
            sourceExerciseId: exerciseId,
            sourcePeriodEnd: `${input.year}-12-31`,
            ownership: member.directOwnership,
            votingRights: member.votingRights,
            included: member.method === 'FULL',
        }
        await db.consolidationMemberLinks.add(link)
    }
    return consolidation
}

export async function updateConsolidation(
    id: string,
    changes: Partial<Pick<ConsolidationExercise, 'label' | 'reportingDate' | 'periodStart' | 'periodEnd' | 'inflationIndexSetId' | 'previousConsolidationId'>>
): Promise<void> {
    const current = await getConsolidation(id)
    if (current?.status === 'LOCKED') {
        throw new Error('La consolidación está bloqueada: reabrila antes de modificarla')
    }
    await db.consolidationExercises.update(id, { ...changes, updatedAt: nowISO() })
}

export async function setConsolidationStatus(
    id: string,
    status: ConsolidationStatus,
    actorId = LOCAL_ACTOR
): Promise<void> {
    const timestamp = nowISO()
    await db.consolidationExercises.update(id, {
        status,
        updatedAt: timestamp,
        lockedAt: status === 'LOCKED' ? timestamp : undefined,
        lockedBy: status === 'LOCKED' ? actorId : undefined,
    })
}

export async function deleteConsolidation(id: string): Promise<void> {
    await db.consolidationMemberLinks.where('consolidationId').equals(id).delete()
    await db.reciprocalBalances.where('consolidationId').equals(id).delete()
    await db.intragroupOperations.where('consolidationId').equals(id).delete()
    await db.consolidationAdjustments.where('consolidationId').equals(id).delete()
    await db.consolidationExercises.delete(id)
}

export async function listMemberLinks(consolidationId: string): Promise<ConsolidationMemberLink[]> {
    return db.consolidationMemberLinks.where('consolidationId').equals(consolidationId).toArray()
}

export async function updateMemberLink(
    id: string,
    changes: Partial<Pick<ConsolidationMemberLink, 'sourceYear' | 'sourceExerciseId' | 'sourcePeriodEnd' | 'ownership' | 'votingRights' | 'homogenizationNote' | 'included'>>
): Promise<void> {
    if (changes.ownership !== undefined) {
        const err = validateOwnership(changes.ownership, 'Participación aplicable')
        if (err) throw new Error(err)
    }
    await db.consolidationMemberLinks.update(id, changes)
}

// ─────────────────────────────────────────────────────────────
// Mapeo
// ─────────────────────────────────────────────────────────────

export async function listMappings(groupId: string): Promise<ConsolidationAccountMapping[]> {
    return db.consolidationMappings.where('groupId').equals(groupId).toArray()
}

export async function putMapping(input: {
    groupId: string
    companyId: string
    accountId: string
    consolidatedLineId: ConsolidatedLineId
    intragroupCategory: IntragroupCategory
    counterpartyCompanyId?: string
    source: 'AUTO' | 'MANUAL'
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
    rationale?: string
}): Promise<ConsolidationAccountMapping> {
    const existing = await db.consolidationMappings
        .where('[groupId+companyId+accountId]')
        .equals([input.groupId, input.companyId, input.accountId])
        .first()
    const mapping: ConsolidationAccountMapping = {
        id: existing?.id ?? generateId(),
        groupId: input.groupId,
        companyId: input.companyId,
        accountId: input.accountId,
        consolidatedLineId: input.consolidatedLineId,
        intragroupCategory: input.intragroupCategory,
        counterpartyCompanyId: input.counterpartyCompanyId,
        source: input.source,
        confidence: input.confidence ?? 'HIGH',
        rationale: input.rationale,
        updatedAt: nowISO(),
    }
    await db.consolidationMappings.put(mapping)
    return mapping
}

export async function putMappings(mappings: Parameters<typeof putMapping>[0][]): Promise<void> {
    for (const m of mappings) await putMapping(m)
}

export async function deleteMapping(id: string): Promise<void> {
    await db.consolidationMappings.delete(id)
}

// ─────────────────────────────────────────────────────────────
// Saldos recíprocos
// ─────────────────────────────────────────────────────────────

export async function listReciprocals(consolidationId: string): Promise<ReciprocalBalance[]> {
    return db.reciprocalBalances.where('consolidationId').equals(consolidationId).toArray()
}

export async function putReciprocal(input: {
    id?: string
    consolidationId: string
    kind: ReciprocalKind
    creditorCompanyId: string
    creditorAccountId: string
    creditorAmount: number
    debtorCompanyId: string
    debtorAccountId: string
    debtorAmount: number
    currency?: string
    agreedAmount?: number
    differenceCause?: ReciprocalBalance['differenceCause']
    differenceNote?: string
    status?: ReciprocalStatusInput
    responsible?: string
    ageDays?: number
    autoDetected?: boolean
}): Promise<ReciprocalBalance> {
    const creditorAmount = roundMoney(input.creditorAmount)
    const debtorAmount = roundMoney(input.debtorAmount)
    // Sin conciliación explícita se elimina el importe COINCIDENTE (el menor en
    // valor absoluto). La diferencia nunca se compensa: queda expuesta.
    const agreed = input.agreedAmount !== undefined
        ? roundMoney(input.agreedAmount)
        : roundMoney(Math.min(Math.abs(creditorAmount), Math.abs(debtorAmount)))

    const record: ReciprocalBalance = {
        id: input.id ?? generateId(),
        consolidationId: input.consolidationId,
        kind: input.kind,
        creditorCompanyId: input.creditorCompanyId,
        creditorAccountId: input.creditorAccountId,
        creditorAmount,
        debtorCompanyId: input.debtorCompanyId,
        debtorAccountId: input.debtorAccountId,
        debtorAmount,
        currency: input.currency ?? 'ARS',
        agreedAmount: agreed,
        differenceCause: input.differenceCause,
        differenceNote: input.differenceNote,
        status: input.status ?? (creditorAmount === debtorAmount ? 'RECONCILED' : 'PENDING'),
        responsible: input.responsible,
        ageDays: input.ageDays,
        autoDetected: input.autoDetected ?? false,
        updatedAt: nowISO(),
    }
    await db.reciprocalBalances.put(record)
    return record
}

type ReciprocalStatusInput = ReciprocalBalance['status']

export async function deleteReciprocal(id: string): Promise<void> {
    await db.reciprocalBalances.delete(id)
}

// ─────────────────────────────────────────────────────────────
// Operaciones intragrupo
// ─────────────────────────────────────────────────────────────

export async function listIntragroupOperations(consolidationId: string): Promise<IntragroupOperation[]> {
    return db.intragroupOperations.where('consolidationId').equals(consolidationId).toArray()
}

export async function putIntragroupOperation(input: {
    id?: string
    consolidationId: string
    type: IntragroupOperationType
    sellerCompanyId: string
    buyerCompanyId: string
    description: string
    transferAmount: number
    groupCost: number
    realizedRatio: number
    manualUnrealizedAmount?: number
    manualReason?: string
    deferredTaxRate?: number
    depreciationOnUnrealized?: number
}): Promise<IntragroupOperation> {
    if (input.sellerCompanyId === input.buyerCompanyId) {
        throw new Error('Una operación intragrupo requiere dos entidades distintas')
    }
    if (!(input.realizedRatio >= 0 && input.realizedRatio <= 1)) {
        throw new Error(`La proporción realizada debe estar entre 0 y 1 (recibido ${input.realizedRatio})`)
    }
    if (input.manualUnrealizedAmount !== undefined && !input.manualReason?.trim()) {
        throw new Error('Un resultado no trascendido fijado a mano necesita su fundamento')
    }
    const existing = input.id ? await db.intragroupOperations.get(input.id) : undefined
    const timestamp = nowISO()
    const record: IntragroupOperation = {
        id: input.id ?? generateId(),
        consolidationId: input.consolidationId,
        type: input.type,
        sellerCompanyId: input.sellerCompanyId,
        buyerCompanyId: input.buyerCompanyId,
        description: input.description,
        transferAmount: roundMoney(input.transferAmount),
        groupCost: roundMoney(input.groupCost),
        realizedRatio: input.realizedRatio,
        manualUnrealizedAmount: input.manualUnrealizedAmount !== undefined ? roundMoney(input.manualUnrealizedAmount) : undefined,
        manualReason: input.manualReason,
        deferredTaxRate: input.deferredTaxRate,
        depreciationOnUnrealized: input.depreciationOnUnrealized !== undefined ? roundMoney(input.depreciationOnUnrealized) : undefined,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
    }
    await db.intragroupOperations.put(record)
    return record
}

export async function deleteIntragroupOperation(id: string): Promise<void> {
    await db.intragroupOperations.delete(id)
}

// ─────────────────────────────────────────────────────────────
// Ajustes manuales
// ─────────────────────────────────────────────────────────────

export async function listAdjustments(consolidationId: string): Promise<ManualConsolidationAdjustment[]> {
    return db.consolidationAdjustments.where('consolidationId').equals(consolidationId).toArray()
}

function assertBalanced(lines: ManualAdjustmentLine[]): void {
    if (lines.length < 2) throw new Error('Un ajuste de consolidación necesita al menos dos líneas')
    const debit = lines.reduce((s, l) => s + Math.round(roundMoney(l.debit || 0) * 100), 0)
    const credit = lines.reduce((s, l) => s + Math.round(roundMoney(l.credit || 0) * 100), 0)
    if (debit !== credit) {
        throw new Error(
            `El ajuste no balancea: Debe ${(debit / 100).toFixed(2)} ≠ Haber ${(credit / 100).toFixed(2)}. ` +
            'Toda eliminación de consolidación debe tener Debe = Haber.'
        )
    }
    if (debit === 0) throw new Error('Un ajuste de consolidación por importe cero no tiene efecto')
}

export async function createAdjustment(input: {
    consolidationId: string
    date: string
    category: AdjustmentCategory
    concept: string
    explanation: string
    documentReference?: string
    relatedCompanyIds?: string[]
    lines: ManualAdjustmentLine[]
    createdBy?: string
}): Promise<ManualConsolidationAdjustment> {
    if (!input.concept?.trim()) throw new Error('El concepto del ajuste es obligatorio')
    if (!input.explanation?.trim()) throw new Error('La explicación del ajuste es obligatoria')
    assertBalanced(input.lines)

    const record: ManualConsolidationAdjustment = {
        id: generateId(),
        consolidationId: input.consolidationId,
        date: input.date,
        category: input.category,
        concept: input.concept.trim(),
        explanation: input.explanation.trim(),
        documentReference: input.documentReference,
        relatedCompanyIds: input.relatedCompanyIds ?? [],
        lines: input.lines.map(l => ({
            ...l,
            debit: roundMoney(l.debit || 0),
            credit: roundMoney(l.credit || 0),
        })),
        status: 'DRAFT',
        createdBy: input.createdBy ?? LOCAL_ACTOR,
        createdAt: nowISO(),
    }
    await db.consolidationAdjustments.add(record)
    return record
}

export async function approveAdjustment(id: string, actorId = LOCAL_ACTOR): Promise<void> {
    const adjustment = await db.consolidationAdjustments.get(id)
    if (!adjustment) throw new Error(`El ajuste ${id} no existe`)
    if (adjustment.status === 'REVERSED') throw new Error('Un ajuste revertido no puede aprobarse')
    await db.consolidationAdjustments.update(id, {
        status: 'APPROVED',
        approvedBy: actorId,
        approvedAt: nowISO(),
    })
}

/**
 * Reversión auditada: el ajuste original SE CONSERVA con estado REVERSED y se
 * crea uno nuevo con las líneas invertidas. No se borra historia.
 */
export async function reverseAdjustment(
    id: string,
    reason: string,
    actorId = LOCAL_ACTOR
): Promise<ManualConsolidationAdjustment> {
    const original = await db.consolidationAdjustments.get(id)
    if (!original) throw new Error(`El ajuste ${id} no existe`)
    if (original.status === 'REVERSED') throw new Error('El ajuste ya está revertido')
    if (!reason?.trim()) throw new Error('La reversión de un ajuste necesita su motivo')

    const timestamp = nowISO()
    const reversal: ManualConsolidationAdjustment = {
        ...original,
        id: generateId(),
        concept: `Reversión — ${original.concept}`,
        explanation: reason.trim(),
        lines: original.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })),
        status: 'APPROVED',
        createdBy: actorId,
        createdAt: timestamp,
        approvedBy: actorId,
        approvedAt: timestamp,
        reversesAdjustmentId: original.id,
        reversedBy: undefined,
        reversedAt: undefined,
        reversalReason: undefined,
    }
    await db.consolidationAdjustments.add(reversal)
    await db.consolidationAdjustments.update(id, {
        status: 'REVERSED',
        reversedBy: actorId,
        reversedAt: timestamp,
        reversalReason: reason.trim(),
    })
    return reversal
}

export async function deleteAdjustment(id: string): Promise<void> {
    const adjustment = await db.consolidationAdjustments.get(id)
    if (!adjustment) return
    if (adjustment.status !== 'DRAFT') {
        throw new Error('Sólo un ajuste en borrador puede eliminarse; los aprobados se revierten')
    }
    await db.consolidationAdjustments.delete(id)
}
