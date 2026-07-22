/**
 * Puerta de publicación unificada — Fase 2G §5.3 (EFE-003).
 *
 * Un ÚNICO lugar decide si un juego de estados (y en particular el EFE) puede
 * publicarse/guardarse/exportarse como VALIDADO. Considera, hoy:
 *  - validación general de estados + controles nominales del EFE;
 *  - controles reexpresados (moneda de cierre): índices, clasificación, igualdad
 *    directo=indirecto;
 *  - cobertura e identidad del set de índices (períodos faltantes).
 *
 * Se deja preparado para incorporar (en hitos posteriores) comparativo,
 * políticas EFE pendientes, errores de mapping e integridad de snapshots: se
 * agregan como blockers con su `scope`. Ningún estado con blockers en una
 * expresión solicitada puede aparecer como VALIDATED (§5.3).
 */

import type { StatementValidationReport } from '../domain/types'

export type PublicationScope =
    | 'NOMINAL'
    | 'RESTATED'
    | 'INDEXES'
    | 'COMPARATIVE'
    | 'POLICY'
    | 'MAPPING'
    | 'SNAPSHOT'

export interface PublicationBlocker {
    id: string
    scope: PublicationScope
    message: string
    /** acción concreta y pedagógica para resolverlo (§2.13) */
    action?: string
}

export interface PublicationGate {
    /** la expresión en moneda nominal es publicable */
    canPublishNominal: boolean
    /** se solicitó una expresión en moneda de cierre */
    restatedRequested: boolean
    /** la expresión en moneda de cierre es publicable (true si no se solicitó) */
    canPublishRestated: boolean
    /** publicable global considerando las expresiones solicitadas */
    canPublish: boolean
    blockers: PublicationBlocker[]
    warnings: PublicationBlocker[]
    checkedAt: string
}

export interface PublicationGateInput {
    validation: StatementValidationReport
    /** resultado de la reexpresión (null si no se pidió moneda de cierre) */
    restated: { blockers: string[] } | null
    /** identidad/cobertura del set de índices aplicado (null si no se pidió) */
    inflationSet: { name: string; missingPeriods: string[] } | null
    /** blockers adicionales aportados por otras dimensiones (políticas, mapping…) */
    extra?: PublicationBlocker[]
}

function actionForCheck(id: string): string | undefined {
    switch (id) {
        case 'efe-variacion': return 'Verificá que efectivo al cierre − efectivo al inicio = variación neta.'
        case 'efe-esp': return 'Conciliá el efectivo del EFE con Caja y equivalentes del ESP.'
        case 'efe-metodos': return 'El método directo debe igualar al indirecto en actividades operativas.'
        case 'efe-clasificacion': return 'Clasificá en Configuración las cuentas sin categoría de flujo de efectivo.'
        default: return 'Revisá los estados y los mapeos de cuentas antes de publicar.'
    }
}

export function buildPublicationGate(inp: PublicationGateInput): PublicationGate {
    const blockers: PublicationBlocker[] = []
    const warnings: PublicationBlocker[] = []

    // ── Controles nominales (EFE + heredados del bundle) ─────────
    for (const c of inp.validation.checks) {
        if (!c.passed) {
            blockers.push({
                id: `nominal:${c.id}`,
                scope: 'NOMINAL',
                message: c.detail ? `${c.label} — ${c.detail}` : c.label,
                action: actionForCheck(c.id),
            })
        }
    }
    const canPublishNominal = inp.validation.canPublish

    // ── Expresión en moneda de cierre ────────────────────────────
    const restatedRequested = inp.restated !== null
    if (inp.restated) {
        inp.restated.blockers.forEach((message, i) => {
            blockers.push({
                id: `restated:${i}`,
                scope: 'RESTATED',
                message,
                action: 'Revisá índices, clasificación y la igualdad directo=indirecto en moneda de cierre.',
            })
        })
    }
    if (inp.inflationSet && inp.inflationSet.missingPeriods.length > 0) {
        blockers.push({
            id: 'indexes:missing',
            scope: 'INDEXES',
            message: `Faltan índices para ${inp.inflationSet.missingPeriods.join(', ')} en el set "${inp.inflationSet.name}".`,
            action: 'Completá el set de índices para todos los períodos del ejercicio.',
        })
    }
    const restatedClean =
        (!inp.restated || inp.restated.blockers.length === 0) &&
        (!inp.inflationSet || inp.inflationSet.missingPeriods.length === 0)
    const canPublishRestated = !restatedRequested || restatedClean

    // ── Blockers externos (políticas, mapping, comparativo, snapshot) ─
    for (const b of inp.extra ?? []) blockers.push(b)

    const externalBlocking = (inp.extra ?? []).length > 0
    const canPublish = canPublishNominal && canPublishRestated && !externalBlocking

    return {
        canPublishNominal,
        restatedRequested,
        canPublishRestated,
        canPublish,
        blockers,
        warnings,
        checkedAt: new Date().toISOString(),
    }
}
