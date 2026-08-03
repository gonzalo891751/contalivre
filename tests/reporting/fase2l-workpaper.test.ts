/** Persistencia, lifecycle e invariantes del papel de trabajo Fase 2L. */

import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/storage/db'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import { ensureExerciseForDate, closeExercise, reopenExercise, getDefaultCompany } from '../../src/accounting/application/contextService'
import { postNewEntry } from '../../src/accounting/application/journalService'
import {
    approveClosingAdjustment,
    emptyClosingWorkPaper,
    getClosingWorkPaper,
    markClosingAdjustmentExtracontable,
    postClosingAdjustment,
    reverseClosingAdjustment,
    saveAdjustmentProposal,
    saveInflationOriginDecision,
    saveInflationPolicy,
    savePolicyDecision,
    saveStageReview,
    validateClosingWorkPaper,
} from '../../src/reporting/closing/closingWorkPaperService'
import type { ClosingAdjustmentProposal } from '../../src/reporting/closing/closingWorkPaperTypes'

describe('papel de trabajo persistente', () => {
    beforeEach(async () => { await resetDb(); await seedTestAccounts() })

    async function context() {
        const company = await getDefaultCompany()
        const exercise = await ensureExerciseForDate('2025-12-31')
        return { company, exercise }
    }

    it('1 · no aplicable sin motivo se rechaza', async () => {
        const { company, exercise } = await context()
        await expect(saveInflationPolicy(company.id, exercise.id, { applicability: 'NO_APLICABLE' }))
            .rejects.toThrow(/motivo verificable/)
    })

    it('2 · aplicable sin serie se rechaza', async () => {
        const { company, exercise } = await context()
        await expect(saveInflationPolicy(company.id, exercise.id, { applicability: 'APLICABLE' }))
            .rejects.toThrow(/serie de índices/)
    })

    it('3 · la política guarda actor, fecha, versión y auditoría', async () => {
        const { company, exercise } = await context()
        const paper = await saveInflationPolicy(company.id, exercise.id, {
            applicability: 'NO_APLICABLE', rationale: 'Contexto estable verificado.', normativeSource: 'RT 54 TO RT 59',
        })
        expect(paper.version).toBe(2)
        expect(paper.inflation.reviewedAt).toBeTruthy()
        expect(paper.auditTrail[paper.auditTrail.length - 1]?.action).toBe('INFLATION_POLICY_UPDATED')
    })

    it('4 · no aplicable de una etapa requiere motivo', async () => {
        const { company, exercise } = await context()
        await expect(saveStageReview(company.id, exercise.id, {
            stage: 'INVENTARIO_CMV', status: 'NO_APLICABLE',
        })).rejects.toThrow(/motivo concreto/)
    })

    it('5 · el origen promedio necesita justificar simplificación', async () => {
        const { company, exercise } = await context()
        await expect(saveInflationOriginDecision(company.id, exercise.id, {
            accountId: 'mercaderias', classification: 'NON_MONETARY', originMethod: 'PROMEDIO',
            originPeriods: ['2025-06'], closingValueProtected: false, rationale: 'Agrupación mensual',
            reviewedBy: 'x', reviewedAt: 'x',
        })).rejects.toThrow(/justificar la simplificación/)
    })

    it('6 · una política inválida para partidas similares se bloquea', async () => {
        const { company, exercise } = await context()
        const base = {
            id: 'p1', accountId: 'mercaderias', rubro: 'BIENES_DE_CAMBIO' as const,
            accountKind: 'ASSET' as const, normalSide: 'DEBIT' as const, destination: 'VENTA' as const,
            criterion: 'VALOR_NETO_REALIZACION' as const, entityCategory: 'PEQUENA' as const,
            marketAvailable: true, reliableDataAvailable: true, material: true,
            rationale: 'Partida destinada a venta.', normativeSource: 'RT 54 TO RT 59', effectiveAt: '2025-12-31',
            selectedBy: 'x', selectedAt: 'x',
        }
        await savePolicyDecision(company.id, exercise.id, base)
        await db.accounts.put({ ...(await db.accounts.get('mercaderias'))!, id: 'mercaderias-2', code: '1.1.04.02' })
        await expect(savePolicyDecision(company.id, exercise.id, {
            ...base, id: 'p2', accountId: 'mercaderias-2', criterion: 'COSTO_REPOSICION',
        })).rejects.toThrow(/partida similar/)
    })

    it('7 · un ajuste desbalanceado se rechaza en centavos', async () => {
        const { company, exercise } = await context()
        await expect(saveAdjustmentProposal(company.id, exercise.id, {
            id: 'bad', kind: 'INFLACION', sourceId: 'src', status: 'PROPUESTO', date: '2025-12-31', memo: 'bad',
            calculatedAt: 'now', calculatedBy: 'x', rationale: 'test',
            lines: [
                { accountId: 'caja', accountCode: '1', accountName: 'Caja', debit: 10, credit: 0, explanation: 'x' },
                { accountId: 'capital', accountCode: '3', accountName: 'Capital', debit: 0, credit: 9.99, explanation: 'x' },
            ],
        })).rejects.toThrow(/no balancea/)
    })

    it('8 · no admite dos ajustes activos para el mismo origen', async () => {
        const { company, exercise } = await context()
        const proposal = adjustment('a1', 'same-source')
        await saveAdjustmentProposal(company.id, exercise.id, proposal)
        await expect(saveAdjustmentProposal(company.id, exercise.id, adjustment('a2', 'same-source')))
            .rejects.toThrow(/mismo origen/)
    })

    it('9 · el asiento debe aprobarse antes de contabilizar', async () => {
        const { company, exercise } = await context()
        await saveAdjustmentProposal(company.id, exercise.id, adjustment('a1', 'src-a'))
        await expect(postClosingAdjustment(company.id, exercise.id, 'a1')).rejects.toThrow(/aprobarse/)
    })

    it('10 · contabilización repetida es idempotente', async () => {
        const { company, exercise } = await context()
        await saveAdjustmentProposal(company.id, exercise.id, adjustment('a1', 'src-a'))
        await approveClosingAdjustment(company.id, exercise.id, 'a1')
        const first = await postClosingAdjustment(company.id, exercise.id, 'a1')
        const count = await db.entries.count()
        const second = await postClosingAdjustment(company.id, exercise.id, 'a1')
        expect(await db.entries.count()).toBe(count)
        expect(second.adjustments[0].journalEntryId).toBe(first.adjustments[0].journalEntryId)
    })

    it('11 · la reversión conserva antecedente y crea la contrapartida formal', async () => {
        const { company, exercise } = await context()
        await saveAdjustmentProposal(company.id, exercise.id, adjustment('a1', 'src-a'))
        await approveClosingAdjustment(company.id, exercise.id, 'a1')
        const posted = await postClosingAdjustment(company.id, exercise.id, 'a1')
        const entryId = posted.adjustments[0].journalEntryId!
        const reversed = await reverseClosingAdjustment(company.id, exercise.id, 'a1', 'Cambio de estimación')
        expect(reversed.adjustments[0].status).toBe('REVERTIDO')
        expect((await db.entries.get(entryId))?.status).toBe('REVERSED')
        expect((await db.entries.toArray()).some(entry => entry.reversedEntryId === entryId)).toBe(true)
    })

    it('12 · un tratamiento extracontable exige motivo y no escribe el Diario', async () => {
        const { company, exercise } = await context()
        await saveAdjustmentProposal(company.id, exercise.id, adjustment('a1', 'src-a'))
        const count = await db.entries.count()
        const result = await markClosingAdjustmentExtracontable(company.id, exercise.id, 'a1', 'Sólo exposición en nota.')
        expect(result.adjustments[0].status).toBe('EXTRACONTABLE')
        expect(await db.entries.count()).toBe(count)
    })

    it('13 · los asientos originales quedan intactos tras proponer, postear y revertir', async () => {
        const { company, exercise } = await context()
        const original = await postNewEntry({ date: '2025-02-01', memo: 'original', lines: simpleLines('caja', 'capital', 500) })
        const before = JSON.stringify(await db.entries.get(original.id))
        await saveAdjustmentProposal(company.id, exercise.id, adjustment('a1', 'src-a'))
        await approveClosingAdjustment(company.id, exercise.id, 'a1')
        await postClosingAdjustment(company.id, exercise.id, 'a1')
        await reverseClosingAdjustment(company.id, exercise.id, 'a1', 'Prueba')
        expect(JSON.stringify(await db.entries.get(original.id))).toBe(before)
    })

    it('14 · cerrar y reabrir no borra el papel de trabajo', async () => {
        const { company, exercise } = await context()
        await saveInflationPolicy(company.id, exercise.id, {
            applicability: 'NO_APLICABLE', rationale: 'Contexto estable verificado.',
        })
        await closeExercise(exercise.id)
        await reopenExercise(exercise.id, 'Corrección documentada')
        expect((await db.exercises.get(exercise.id))?.status).toBe('OPEN')
        expect((await getClosingWorkPaper(company.id, exercise.id))?.inflation.rationale).toContain('Contexto estable')
    })

    it('15 · el validador detecta duplicados aun en un objeto importado', () => {
        const paper = emptyClosingWorkPaper('c', 'e')
        const one = adjustment('a1', 'same')
        expect(() => validateClosingWorkPaper({ ...paper, adjustments: [one, { ...one, id: 'a2' }] }))
            .toThrow(/duplicado/)
    })

    it('16 · un papel importado no puede omitir serie ni motivo de no aplicabilidad', () => {
        const paper = emptyClosingWorkPaper('c', 'e')
        expect(() => validateClosingWorkPaper({
            ...paper,
            inflation: { applicability: 'APLICABLE' },
        })).toThrow(/serie de índices/)
        expect(() => validateClosingWorkPaper({
            ...paper,
            stageReviews: [{ stage: 'INVENTARIO_CMV', status: 'NO_APLICABLE' }],
        })).toThrow(/sin motivo verificable/)
    })
})

function adjustment(id: string, sourceId: string): ClosingAdjustmentProposal {
    return {
        id, kind: 'INFLACION', sourceId, status: 'PROPUESTO', date: '2025-12-31', memo: 'Ajuste probado',
        calculatedAt: '2025-12-31T20:00:00Z', calculatedBy: 'test', rationale: 'Caso de prueba balanceado.',
        lines: [
            { accountId: 'caja', accountCode: '1.1.01.01', accountName: 'Caja', debit: 100, credit: 0, explanation: 'Ajuste' },
            { accountId: 'capital', accountCode: '3.1.01', accountName: 'Capital', debit: 0, credit: 100, explanation: 'Contrapartida' },
        ],
    }
}
