/**
 * Fase 2F (§8) — Notas manuales persistentes.
 * Sanitización a texto plano, versionado con historial intacto, integración
 * con buildNotes (manual identificada, jamás pisa derivadas), "no aplicable"
 * con fundamento e invalidación de snapshots del ejercicio.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import {
    getCurrentDisclosures,
    getHistory,
    sanitizeContent,
    saveDisclosure,
} from '../../src/accounting/disclosures/manualDisclosuresService'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { createSnapshot, listSnapshots } from '../../src/reporting/snapshots/snapshotService'
import { exerciseIdForYear } from '../../src/accounting/application/contextService'

const EX = exerciseIdForYear(2025)
const BASE = { exerciseId: EX, companyId: 'company-default', noteType: 'hechos-posteriores' as const }

describe('Fase 2F — notas manuales', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
    })

    it('sanitiza HTML a texto plano (sin etiquetas ni javascript:)', () => {
        expect(sanitizeContent('<script>alert(1)</script>Incendio <b>posterior</b> al cierre'))
            .toBe('alert(1)Incendio posterior al cierre')
        expect(sanitizeContent('<a href="javascript:x()">link</a>')).toBe('link')
    })

    it('versiona con historial intacto y expone la vigente', async () => {
        const v1 = await saveDisclosure({ ...BASE, content: 'Versión uno', status: 'DRAFT' })
        const v2 = await saveDisclosure({ ...BASE, content: 'Versión dos', status: 'VALIDATED' })
        expect(v2.version).toBe(2)
        expect(v2.supersedesId).toBe(v1.id)

        const history = await getHistory(EX, 'hechos-posteriores')
        expect(history).toHaveLength(2)

        const current = await getCurrentDisclosures(EX)
        expect(current).toHaveLength(1)
        expect(current[0].content).toBe('Versión dos')
    })

    it('las notas manuales aparecen en el bundle identificadas, sin tocar derivadas', async () => {
        await saveDisclosure({ ...BASE, content: 'Incendio del depósito el 15/01, cubierto por seguro.', status: 'VALIDATED' })
        const bundle = await loadReportingBundle(2025)

        const nota = bundle.notes.find(n => n.id === 'nota-hechos-posteriores')!
        expect(nota.text).toContain('Incendio del depósito')
        expect(nota.lines[0].origin).toBe('MANUAL')
        expect(nota.total).toBeNull() // jamás importa un total

        // las derivadas siguen intactas
        const efectivo = bundle.notes.find(n => n.id === 'nota-efectivo')!
        expect(efectivo.total).toBe(1000)
        expect(efectivo.lines.every(l => l.origin === 'DERIVED')).toBe(true)
    })

    it('"No aplicable" exige fundamento y se expone como tal', async () => {
        await expect(saveDisclosure({ ...BASE, noteType: 'contingencias', content: '', status: 'VALIDATED', notApplicable: true }))
            .rejects.toThrow(/fundamento/)
        await saveDisclosure({ ...BASE, noteType: 'contingencias', content: 'Sin litigios en curso al cierre.', status: 'VALIDATED', notApplicable: true })
        const bundle = await loadReportingBundle(2025)
        const nota = bundle.notes.find(n => n.id === 'nota-contingencias')!
        expect(nota.text).toContain('No aplicable')
        expect(nota.text).toContain('Sin litigios')
        expect(nota.lines[0].origin).toBe('NOT_APPLICABLE')
    })

    it('guardar una nota validada INVALIDA los snapshots del ejercicio', async () => {
        const bundle = await loadReportingBundle(2025)
        await createSnapshot(bundle, { status: 'PUBLISHED' })
        expect((await listSnapshots(EX))[0].status).toBe('PUBLISHED')

        await saveDisclosure({ ...BASE, content: 'Hecho posterior relevante.', status: 'VALIDATED' })

        const after = await listSnapshots(EX)
        expect(after[0].status).toBe('INVALIDATED')
        expect(after[0].invalidatedReason).toContain('Nota manual')
    })

    it('un borrador NO invalida snapshots (todavía no integra el juego validado)', async () => {
        const bundle = await loadReportingBundle(2025)
        await createSnapshot(bundle, { status: 'PUBLISHED' })
        await saveDisclosure({ ...BASE, noteType: 'compromisos', content: 'Borrador en preparación.', status: 'DRAFT' })
        expect((await listSnapshots(EX))[0].status).toBe('PUBLISHED')
    })
})
