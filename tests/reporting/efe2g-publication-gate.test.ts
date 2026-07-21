/**
 * Fase 2G — Puerta de publicación unificada (EFE-003, spec §5.3).
 *
 * Un blocker en CUALQUIER expresión solicitada (nominal o moneda de cierre)
 * impide el estado publicable. Los blockers de reexpresión y la falta de
 * índices ahora gobiernan la publicación (antes se ignoraban).
 */

import { describe, it, expect } from 'vitest'
import { buildPublicationGate } from '../../src/reporting/engine/publicationGate'
import type { StatementValidationReport, ValidationCheck } from '../../src/reporting/domain/types'

function validation(checks: ValidationCheck[]): StatementValidationReport {
    const allPassed = checks.every(c => c.passed)
    return { context: {} as StatementValidationReport['context'], checks, allPassed, canPublish: allPassed }
}
const ok = (id: string): ValidationCheck => ({ id, label: id, passed: true })
const bad = (id: string): ValidationCheck => ({ id, label: id, passed: false })

describe('Fase 2G — publicationGate', () => {
    it('nominal limpio, sin moneda de cierre ⇒ publicable', () => {
        const gate = buildPublicationGate({ validation: validation([ok('efe-variacion'), ok('efe-metodos')]), restated: null, inflationSet: null })
        expect(gate.canPublish).toBe(true)
        expect(gate.canPublishNominal).toBe(true)
        expect(gate.restatedRequested).toBe(false)
        expect(gate.blockers).toEqual([])
    })

    it('control nominal en rojo ⇒ bloqueado con acción concreta', () => {
        const gate = buildPublicationGate({ validation: validation([bad('efe-metodos')]), restated: null, inflationSet: null })
        expect(gate.canPublish).toBe(false)
        expect(gate.canPublishNominal).toBe(false)
        const b = gate.blockers.find(b => b.id === 'nominal:efe-metodos')
        expect(b).toBeDefined()
        expect(b!.scope).toBe('NOMINAL')
        expect(b!.action).toBeTruthy()
    })

    it('reexpresión con blockers ⇒ moneda de cierre no publicable (EFE-003)', () => {
        const gate = buildPublicationGate({
            validation: validation([ok('efe-metodos')]),
            restated: { blockers: ['Hay flujos sin clasificación EFE'] },
            inflationSet: { name: 'IPC', missingPeriods: [] },
        })
        expect(gate.canPublishNominal).toBe(true)
        expect(gate.restatedRequested).toBe(true)
        expect(gate.canPublishRestated).toBe(false)
        expect(gate.canPublish).toBe(false)
        expect(gate.blockers.some(b => b.scope === 'RESTATED')).toBe(true)
    })

    it('faltan índices ⇒ blocker de cobertura', () => {
        const gate = buildPublicationGate({
            validation: validation([ok('efe-metodos')]),
            restated: { blockers: [] },
            inflationSet: { name: 'IPC', missingPeriods: ['2025-03'] },
        })
        expect(gate.canPublish).toBe(false)
        const b = gate.blockers.find(b => b.scope === 'INDEXES')
        expect(b).toBeDefined()
        expect(b!.message).toContain('2025-03')
    })

    it('blocker externo (política/mapping) ⇒ bloqueado', () => {
        const gate = buildPublicationGate({
            validation: validation([ok('efe-metodos')]),
            restated: null,
            inflationSet: null,
            extra: [{ id: 'policy:pending', scope: 'POLICY', message: 'Política EFE pendiente de revisión' }],
        })
        expect(gate.canPublish).toBe(false)
        expect(gate.blockers.some(b => b.scope === 'POLICY')).toBe(true)
    })
})
