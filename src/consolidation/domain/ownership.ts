/**
 * Participación, control y perímetro (Fase 2K §5).
 *
 * Distinciones que el módulo NO colapsa:
 *
 * - PARTICIPACIÓN PATRIMONIAL vs DERECHOS DE VOTO: pueden diferir (acciones
 *   preferidas sin voto, acciones de voto múltiple). La consolidación se decide
 *   por el CONTROL, que se apoya en los votos; la atribución del patrimonio y
 *   del resultado se hace por la participación patrimonial.
 * - CONTROL vs PORCENTAJE: superar el 50 % es indicio, no conclusión. El
 *   sistema exige una conclusión explícita y fundada; nunca la infiere sola.
 * - CONTROLADA vs ASOCIADA vs NEGOCIO CONJUNTO: sólo la controlada se consolida
 *   línea por línea. La asociada se MIDE por VPP (no "se consolida por VPP") y
 *   el negocio conjunto societario tampoco se incorpora como una subsidiaria.
 */

import type { ControlBasis, GroupMember, MemberRelation } from './types'

/** Tolerancia de porcentajes: 8 decimales, la escala de `percentage` del núcleo */
const OWNERSHIP_SCALE = 1e8

export function roundOwnership(value: number): number {
    if (!Number.isFinite(value)) return NaN
    return Math.round(value * OWNERSHIP_SCALE) / OWNERSHIP_SCALE
}

export function validateOwnership(value: number, label: string): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${label}: la participación debe ser un número finito`
    }
    if (value < 0 || value > 1) {
        return `${label}: la participación debe estar entre 0 y 1 (recibido ${value})`
    }
    return null
}

/**
 * Participación EFECTIVA de la controladora sobre una entidad, recorriendo la
 * cadena de tenencias indirectas. Ejemplo: si A posee el 80 % de B y B posee el
 * 60 % de C, la participación efectiva de A sobre C es 48 %, aunque el control
 * sobre C exista porque A controla B y B controla C.
 *
 * Devuelve null si la cadena tiene un ciclo o un eslabón inexistente: no se
 * inventa un porcentaje.
 */
export function computeEffectiveOwnership(
    memberId: string,
    membersById: Map<string, GroupMember>
): number | null {
    const visited = new Set<string>()
    let effective = 1
    let currentId: string | undefined = memberId

    while (currentId) {
        if (visited.has(currentId)) return null
        visited.add(currentId)
        const member: GroupMember | undefined = membersById.get(currentId)
        if (!member) return null
        if (member.relation === 'PARENT') break
        effective *= member.directOwnership
        currentId = member.heldThroughMemberId
        if (currentId === undefined) break
    }

    return roundOwnership(effective)
}

/** Porcentaje NO controlado por el grupo sobre una entidad consolidada */
export function nonControllingRatio(effectiveOwnership: number): number {
    return roundOwnership(1 - effectiveOwnership)
}

/**
 * ¿Existe control? Devuelve la conclusión registrada por el usuario junto con
 * las señales objetivas, para que la interfaz pueda advertir cuando la
 * conclusión y las señales no coinciden en lugar de sobrescribir ninguna.
 */
export interface ControlAssessment {
    declaredControl: boolean
    controlBasis: ControlBasis
    rationale: string
    /** derechos de voto aplicables (los votos si están declarados; si no, la participación) */
    effectiveVotingRights: number
    /** el porcentaje de votos supera el 50 % */
    majorityByVotes: boolean
    /** la conclusión declarada difiere de lo que sugiere el porcentaje */
    divergesFromPercentage: boolean
    /** el fundamento está vacío: la conclusión no está documentada */
    missingRationale: boolean
}

export function assessControl(member: GroupMember): ControlAssessment {
    const votes = member.votingRights ?? member.directOwnership
    const majorityByVotes = votes > 0.5
    return {
        declaredControl: member.hasControl,
        controlBasis: member.controlBasis,
        rationale: member.controlRationale,
        effectiveVotingRights: roundOwnership(votes),
        majorityByVotes,
        divergesFromPercentage: member.hasControl !== majorityByVotes,
        missingRationale: !member.controlRationale?.trim(),
    }
}

/** Tratamiento contable coherente con la relación declarada */
export function expectedMethodFor(relation: MemberRelation, hasControl: boolean): {
    method: GroupMember['method']
    explanation: string
} {
    if (relation === 'PARENT') {
        return { method: 'FULL', explanation: 'La controladora encabeza el juego consolidado' }
    }
    if (relation === 'SUBSIDIARY') {
        return hasControl
            ? { method: 'FULL', explanation: 'Existe control: se consolida línea por línea y se reconoce la participación no controladora' }
            : { method: 'EQUITY_METHOD', explanation: 'Sin control no hay consolidación: la participación se mide por valor patrimonial proporcional' }
    }
    if (relation === 'ASSOCIATE') {
        return { method: 'EQUITY_METHOD', explanation: 'Una asociada no se consolida: se MIDE por valor patrimonial proporcional y su medición queda en una sola línea del activo' }
    }
    return { method: 'EQUITY_METHOD', explanation: 'Un negocio conjunto societario no se incorpora como subsidiaria: se mide por valor patrimonial proporcional' }
}

/**
 * ¿La entidad integra el perímetro de consolidación total?
 * Sólo las controladas con control declarado y método FULL, dentro del período.
 */
export function isWithinPerimeter(member: GroupMember, reportingDate: string): boolean {
    if (member.relation === 'PARENT') return true
    if (member.method !== 'FULL') return false
    if (!member.hasControl) return false
    if (member.controlFrom > reportingDate) return false
    if (member.controlTo && member.controlTo < reportingDate) return false
    return true
}

/** Motivo por el cual una entidad quedó fuera del perímetro, en lenguaje llano */
export function perimeterExclusionReason(member: GroupMember, reportingDate: string): string | null {
    if (isWithinPerimeter(member, reportingDate)) return null
    if (member.method === 'EXCLUDED') {
        return member.exclusionReason?.trim()
            ? `Excluida: ${member.exclusionReason}`
            : 'Excluida sin fundamento normativo declarado'
    }
    if (member.relation === 'ASSOCIATE') return 'Asociada: se mide por valor patrimonial proporcional, no se consolida'
    if (member.relation === 'JOINT_VENTURE') return 'Negocio conjunto: no se incorpora como subsidiaria'
    if (!member.hasControl) return 'No se concluyó que exista control sobre la entidad'
    if (member.controlFrom > reportingDate) return `El control comienza el ${member.controlFrom}, posterior a la fecha de consolidación`
    if (member.controlTo && member.controlTo < reportingDate) return `El control se perdió el ${member.controlTo}, anterior a la fecha de consolidación`
    return 'Fuera del perímetro de consolidación'
}
