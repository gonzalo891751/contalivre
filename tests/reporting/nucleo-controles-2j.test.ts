/**
 * Fase 2J §9 — núcleo ÚNICO de controles del ejercicio.
 *
 * Antes cada puerta tenía su propia idea del estado del ejercicio: la compuerta
 * de publicación corría sus controles y el cierre no los consultaba, así que un
 * ejercicio con el RECPAM sin conciliar, con cuentas sin clasificar o con
 * mediciones pendientes podía cerrarse igual.
 *
 * Estas pruebas fijan el contrato: qué bloquea, qué sólo advierte, qué separa
 * publicar de cerrar, y que ninguna etapa se marque «no aplicable» sin decir
 * por qué.
 */

import { describe, it, expect } from 'vitest'
import {
    buildClosingReadiness, STAGE_META,
    type ReadinessInput,
} from '../../src/reporting/closing/closingReadiness'

const BASE: ReadinessInput = {
    company: { legalName: 'Purmamarca Comercial S.A.', taxId: '30-71234567-4' },
    exercise: { name: 'Ejercicio 2025', status: 'OPEN', startDate: '2025-01-01', endDate: '2025-12-31' },
    inflationSet: { name: 'IPC Nacional', missingPeriods: [] },
    coverage: {
        accountsWithActivity: 43, accountsResolved: 43,
        coveragePct: 100, balanceCoveragePct: 100, pending: [], missingPeriods: [],
    },
    recpam: { reconciled: true, difference: -0.02, toleranceCents: 100, blockers: [] },
    statementChecks: [
        { id: 'journal-balance', label: 'Diario: total Debe = total Haber', passed: true },
        { id: 'equation', label: 'Activo = Pasivo + Patrimonio neto', passed: true },
        { id: 'cmv-puente', label: 'Costo de ventas: el puente concilia', passed: true },
        { id: 'ppe-anexo', label: 'Anexo de bienes de uso: valor residual = ESP', passed: true },
        { id: 'efe-metodos', label: 'EFE: método directo = método indirecto', passed: true },
    ],
    fixedAssetsRestatedBlockers: [],
    measurements: null,
    draftCount: 0,
    entriesOutsideExercise: 0,
    staleSnapshot: false,
}

const con = (patch: Partial<ReadinessInput>) => buildClosingReadiness({ ...BASE, ...patch })

describe('ejercicio en condiciones', () => {
    const r = con({})

    it('permite publicar y cerrar', () => {
        expect(r.blockers).toHaveLength(0)
        expect(r.canPublish).toBe(true)
        expect(r.canClose).toBe(true)
    })

    it('todas las etapas aplicables quedan completas', () => {
        expect(r.completedStages).toBe(r.applicableStages)
        expect(r.applicableStages).toBeGreaterThan(5)
    })

    it('cada etapa declara su nombre y su descripción en lenguaje contable', () => {
        for (const stage of r.stages) {
            expect(stage.label).toBe(STAGE_META[stage.stage].label)
            expect(stage.description.length).toBeGreaterThan(20)
        }
    })

    it('ninguna etapa se marca no aplicable sin explicar por qué', () => {
        for (const stage of r.stages) {
            if (stage.status === 'NO_APLICABLE') {
                expect(stage.reason, `${stage.stage} sin motivo`).toBeTruthy()
            }
        }
    })
})

describe('lo que bloquea el cierre', () => {
    it('el RECPAM sin conciliar', () => {
        const r = con({ recpam: { reconciled: false, difference: 15000, toleranceCents: 100, blockers: ['difieren'] } })
        expect(r.canClose).toBe(false)
        expect(r.canPublish).toBe(false)
        const check = r.blockers.find(b => b.id === 'recpam-conciliado')!
        expect(check.stage).toBe('UNIDAD_MEDIDA_INFLACION')
        expect(check.difference).toBe(15000)
        expect(check.tolerance).toBe(1)
        expect(check.action).toBeTruthy()
        expect(check.link).toBeTruthy()
    })

    it('las cuentas sin tratamiento declarado', () => {
        const r = con({
            coverage: {
                ...BASE.coverage!, accountsResolved: 42, coveragePct: 97.7,
                pending: [{ code: '1.1.05.01', name: 'Plazo fijo', reason: 'rubro mixto' }],
            },
        })
        expect(r.canClose).toBe(false)
        const check = r.blockers.find(b => b.id === 'cobertura-cuentas')!
        expect(check.detail).toContain('1.1.05.01')
    })

    it('los índices faltantes', () => {
        const r = con({ inflationSet: { name: 'IPC', missingPeriods: ['2025-07'] } })
        expect(r.canClose).toBe(false)
        expect(r.blockers.find(b => b.id === 'indices-completos')?.detail).toContain('2025-07')
    })

    it('las mediciones al cierre pendientes', () => {
        const r = con({
            measurements: { required: 2, done: 1, pending: [{ rubro: '1.1.04.01 Mercaderías', reason: 'falta medir' }] },
        })
        expect(r.canClose).toBe(false)
        expect(r.blockers.find(b => b.id === 'mediciones-pendientes')?.detail).toContain('Mercaderías')
    })

    it('los borradores pendientes', () => {
        const r = con({ draftCount: 3 })
        expect(r.canClose).toBe(false)
        expect(r.blockers.find(b => b.id === 'sin-borradores')?.actual).toBe(3)
        const final = r.stages.find(stage => stage.stage === 'CONCILIACION_EMISION')!
        expect(final.status).toBe('BLOQUEADA')
        expect(final.dependencyBlockers).toContain('CORTE_DEVENGAMIENTOS')
    })

    it('la falta de identidad de la empresa', () => {
        const r = con({ company: { legalName: 'Empresa ContaLivre' } })
        expect(r.canClose).toBe(false)
        expect(r.canPublish).toBe(false)
        expect(r.blockers.some(b => b.id === 'identidad-empresa')).toBe(true)
    })

    it('un control del motor que no pasa, en la etapa que le corresponde', () => {
        const r = con({
            statementChecks: [
                ...BASE.statementChecks.filter(c => c.id !== 'cmv-puente'),
                { id: 'cmv-puente', label: 'Costo de ventas: el puente concilia', passed: false, difference: 1900000 },
            ],
        })
        expect(r.canClose).toBe(false)
        const check = r.blockers.find(b => b.id === 'motor:cmv-puente')!
        expect(check.stage).toBe('INVENTARIO_CMV')
        expect(r.stages.find(s => s.stage === 'INVENTARIO_CMV')!.status).toBe('BLOQUEADA')
    })

    it('la reexpresión incompleta del anexo de bienes de uso', () => {
        const r = con({ fixedAssetsRestatedBlockers: ['Faltan índices para 2025-03'] })
        expect(r.canClose).toBe(false)
        expect(r.stages.find(s => s.stage === 'BIENES_USO_DEPRECIACIONES')!.status).toBe('BLOQUEADA')
    })
})

describe('lo que sólo advierte', () => {
    it('los asientos en otros ejercicios no impiden cerrar', () => {
        const r = con({ entriesOutsideExercise: 4 })
        expect(r.canClose).toBe(true)
        expect(r.warnings.some(w => w.id === 'sin-asientos-fuera')).toBe(true)
        expect(r.stages.find(s => s.stage === 'CORTE_DEVENGAMIENTOS')!.status).toBe('CON_ADVERTENCIAS')
    })
})

describe('publicar y cerrar son puertas distintas', () => {
    it('un ejercicio ya cerrado no puede volver a cerrarse pero sí publicar sus estados', () => {
        const r = con({
            exercise: { name: 'Ejercicio 2025', status: 'CLOSED', startDate: '2025-01-01', endDate: '2025-12-31' },
        })
        expect(r.canClose).toBe(false)
        expect(r.canPublish).toBe(true)
        expect(r.publishBlockers).toHaveLength(0)
        expect(r.blockers.some(b => b.id === 'ejercicio-abierto')).toBe(true)
    })

    it('un juego de estados desactualizado impide publicar y cerrar', () => {
        const r = con({ staleSnapshot: true })
        expect(r.canPublish).toBe(false)
        expect(r.canClose).toBe(false)
    })
})

describe('la unidad de medida exige una conclusión documentada', () => {
    const pending = con({ inflationSet: null, coverage: null, recpam: null, inflationPolicy: { applicability: 'PENDIENTE' } })

    it('la ausencia de una serie no equivale a no aplicable', () => {
        const stage = pending.stages.find(s => s.stage === 'UNIDAD_MEDIDA_INFLACION')!
        expect(stage.status).toBe('BLOQUEADA')
        expect(pending.blockers.some(check => check.id === 'inflacion-aplicabilidad')).toBe(true)
        expect(pending.canClose).toBe(false)
    })

    it('no aplicable sólo se acepta con motivo verificable', () => {
        const r = con({
            inflationSet: null, coverage: null, recpam: null,
            inflationPolicy: { applicability: 'NO_APLICABLE', rationale: 'Contexto estable verificado con indicadores del período.' },
        })
        const stage = r.stages.find(s => s.stage === 'UNIDAD_MEDIDA_INFLACION')!
        expect(stage.status).toBe('NO_APLICABLE')
        expect(stage.reason).toContain('Contexto estable')
        expect(r.canClose).toBe(true)
    })
})
