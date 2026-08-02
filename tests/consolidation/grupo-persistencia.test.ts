/**
 * Fase 2K §5, §21 — dominio y persistencia del grupo económico.
 *
 * Verifica que el módulo:
 *  - modele grupo, perímetro, control y participación sin colapsar conceptos;
 *  - exija fundamento explícito para concluir que existe control;
 *  - distinga controlada (consolidación total) de asociada (medición por VPP);
 *  - calcule la participación efectiva en tenencias indirectas;
 *  - rechace ajustes manuales que no balanceen;
 *  - conserve historia al revertir un ajuste;
 *  - NO escriba jamás en los libros de las entidades.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import { db } from '../../src/storage/db'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { DEFAULT_COMPANY_ID, createCompany } from '../../src/accounting/application/contextService'
import {
    addMember,
    approveAdjustment,
    createAdjustment,
    createConsolidation,
    createGroup,
    listAdjustments,
    listMemberLinks,
    listMembers,
    putIntragroupOperation,
    putReciprocal,
    removeMember,
    reverseAdjustment,
} from '../../src/consolidation/repository'
import {
    computeEffectiveOwnership,
    expectedMethodFor,
    isWithinPerimeter,
    perimeterExclusionReason,
} from '../../src/consolidation/domain/ownership'
import type { GroupMember } from '../../src/consolidation/domain/types'

const SUB = 'company-sub'
const SUBSUB = 'company-subsub'
const ASSOC = 'company-assoc'

async function seedGroup() {
    await createCompany({ id: SUB, legalName: 'Controlada S.A.' })
    await createCompany({ id: SUBSUB, legalName: 'Subcontrolada S.A.' })
    await createCompany({ id: ASSOC, legalName: 'Asociada S.A.' })
    const group = await createGroup({ name: 'Grupo de prueba', parentCompanyId: DEFAULT_COMPANY_ID })
    return group
}

describe('Fase 2K — grupo económico y perímetro', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('crear un grupo incorpora a la controladora como miembro PARENT', async () => {
        const group = await seedGroup()
        const members = await listMembers(group.id)
        expect(members).toHaveLength(1)
        expect(members[0].relation).toBe('PARENT')
        expect(members[0].companyId).toBe(DEFAULT_COMPANY_ID)
        expect(members[0].directOwnership).toBe(1)
    })

    it('no se puede quitar la controladora del grupo', async () => {
        const group = await seedGroup()
        const [parent] = await listMembers(group.id)
        await expect(removeMember(parent.id)).rejects.toThrow(/controladora/i)
    })

    it('concluir control exige fundamento: no se infiere del porcentaje', async () => {
        const group = await seedGroup()
        await expect(addMember({
            groupId: group.id, companyId: SUB, relation: 'SUBSIDIARY',
            directOwnership: 0.9, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS', controlRationale: '   ',
        })).rejects.toThrow(/fundamento/i)
    })

    it('rechaza participaciones fuera del rango 0..1', async () => {
        const group = await seedGroup()
        await expect(addMember({
            groupId: group.id, companyId: SUB, relation: 'SUBSIDIARY',
            directOwnership: 1.4, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS', controlRationale: 'Mayoría de votos',
        })).rejects.toThrow(/entre 0 y 1/)
    })

    it('una asociada se MIDE por VPP y queda fuera del perímetro', async () => {
        const group = await seedGroup()
        const member = await addMember({
            groupId: group.id, companyId: ASSOC, relation: 'ASSOCIATE',
            directOwnership: 0.3, controlFrom: '2022-01-01',
            hasControl: false, controlBasis: 'NO_CONTROL',
            controlRationale: 'Influencia significativa sin control',
        })
        expect(member.method).toBe('EQUITY_METHOD')
        expect(isWithinPerimeter(member, '2022-12-31')).toBe(false)
        expect(perimeterExclusionReason(member, '2022-12-31'))
            .toMatch(/se mide por valor patrimonial proporcional/i)
        expect(expectedMethodFor('ASSOCIATE', false).explanation).toMatch(/no se consolida/i)
    })

    it('la participación efectiva atraviesa la tenencia indirecta', async () => {
        const group = await seedGroup()
        const sub = await addMember({
            groupId: group.id, companyId: SUB, relation: 'SUBSIDIARY',
            directOwnership: 0.8, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS', controlRationale: '80 % de los votos',
        })
        const subsub = await addMember({
            groupId: group.id, companyId: SUBSUB, relation: 'SUBSIDIARY',
            directOwnership: 0.6, heldThroughMemberId: sub.id, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS',
            controlRationale: 'Controlada a través de Controlada S.A.',
        })
        const byId = new Map<string, GroupMember>((await listMembers(group.id)).map(m => [m.id, m]))
        expect(computeEffectiveOwnership(sub.id, byId)).toBe(0.8)
        // 0,8 × 0,6 = 0,48: el control existe, la participación efectiva es 48 %
        expect(computeEffectiveOwnership(subsub.id, byId)).toBe(0.48)
    })

    it('crear la consolidación vincula el ejercicio individual de cada miembro', async () => {
        const group = await seedGroup()
        await addMember({
            groupId: group.id, companyId: SUB, relation: 'SUBSIDIARY',
            directOwnership: 0.9, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS', controlRationale: '90 % de los votos',
        })
        const consolidation = await createConsolidation({ groupId: group.id, year: 2022 })
        const links = await listMemberLinks(consolidation.id)
        expect(links).toHaveLength(2)
        expect(links.map(l => l.sourceExerciseId).sort()).toEqual([
            'exercise-company-default-2022',
            `exercise-${SUB}-2022`,
        ])
        expect(links.every(l => l.sourceYear === 2022)).toBe(true)
    })

    it('un ajuste manual que no balancea se rechaza', async () => {
        const group = await seedGroup()
        const consolidation = await createConsolidation({ groupId: group.id, year: 2022 })
        await expect(createAdjustment({
            consolidationId: consolidation.id, date: '2022-12-31',
            category: 'RECLASSIFICATION', concept: 'Reclasificación', explanation: 'Prueba',
            lines: [
                { consolidatedLineId: 'AC_OTROS_CREDITOS', debit: 1000, credit: 0 },
                { consolidatedLineId: 'PC_OTRAS_DEUDAS', debit: 0, credit: 900 },
            ],
        })).rejects.toThrow(/no balancea/i)
    })

    it('revertir un ajuste conserva el original e invierte las líneas', async () => {
        const group = await seedGroup()
        const consolidation = await createConsolidation({ groupId: group.id, year: 2022 })
        const adjustment = await createAdjustment({
            consolidationId: consolidation.id, date: '2022-12-31',
            category: 'RECLASSIFICATION', concept: 'Reclasificación de otros créditos',
            explanation: 'Unificación de criterios de exposición',
            lines: [
                { consolidatedLineId: 'AC_OTROS_CREDITOS', debit: 1000, credit: 0 },
                { consolidatedLineId: 'AC_CREDITOS_VENTAS', debit: 0, credit: 1000 },
            ],
        })
        await approveAdjustment(adjustment.id)
        await reverseAdjustment(adjustment.id, 'Se identificó la partida correctamente')

        const all = await listAdjustments(consolidation.id)
        expect(all).toHaveLength(2)
        const original = all.find(a => a.id === adjustment.id)!
        const reversal = all.find(a => a.reversesAdjustmentId === adjustment.id)!
        expect(original.status).toBe('REVERSED')
        expect(original.reversalReason).toBe('Se identificó la partida correctamente')
        expect(reversal.lines[0].credit).toBe(1000)
        expect(reversal.lines[0].debit).toBe(0)
    })

    it('los papeles de trabajo NO tocan los libros de las entidades', async () => {
        await createCompany({ id: SUB, legalName: 'Controlada S.A.' })
        await postNewEntry({ date: '2022-02-01', memo: 'Venta', lines: simpleLines('deudores', 'ventas', 500_000) })
        await postNewEntry({ date: '2022-02-01', memo: 'Venta', companyId: SUB, lines: simpleLines('deudores', 'ventas', 100_000) })
        const before = await db.entries.toArray()

        const group = await createGroup({ name: 'Grupo', parentCompanyId: DEFAULT_COMPANY_ID })
        await addMember({
            groupId: group.id, companyId: SUB, relation: 'SUBSIDIARY',
            directOwnership: 0.9, controlFrom: '2022-01-01',
            hasControl: true, controlBasis: 'MAJORITY_VOTING_RIGHTS', controlRationale: '90 % de los votos',
        })
        const consolidation = await createConsolidation({ groupId: group.id, year: 2022 })
        await putReciprocal({
            consolidationId: consolidation.id, kind: 'TRADE',
            creditorCompanyId: DEFAULT_COMPANY_ID, creditorAccountId: 'deudores', creditorAmount: 30_000,
            debtorCompanyId: SUB, debtorAccountId: 'proveedores', debtorAmount: 30_000,
        })
        await putIntragroupOperation({
            consolidationId: consolidation.id, type: 'GOODS',
            sellerCompanyId: SUB, buyerCompanyId: DEFAULT_COMPANY_ID,
            description: 'Venta de mercaderías', transferAmount: 150_000, groupCost: 90_000, realizedRatio: 0,
        })
        await createAdjustment({
            consolidationId: consolidation.id, date: '2022-12-31',
            category: 'HOMOGENIZATION', concept: 'Uniformidad de criterios', explanation: 'Prueba',
            lines: [
                { consolidatedLineId: 'AC_BIENES_CAMBIO', debit: 500, credit: 0 },
                { consolidatedLineId: 'PN_RESULTADO_EJERCICIO', debit: 0, credit: 500 },
            ],
        })

        const after = await db.entries.toArray()
        expect(after).toHaveLength(before.length)
        expect(JSON.stringify(after)).toBe(JSON.stringify(before))
    })

    it('el saldo recíproco sin conciliar expone la diferencia y no la compensa', async () => {
        const group = await createGroup({ name: 'Grupo', parentCompanyId: DEFAULT_COMPANY_ID })
        await createCompany({ id: SUB, legalName: 'Controlada S.A.' })
        const consolidation = await createConsolidation({ groupId: group.id, year: 2022 })
        const record = await putReciprocal({
            consolidationId: consolidation.id, kind: 'TRADE',
            creditorCompanyId: DEFAULT_COMPANY_ID, creditorAccountId: 'deudores', creditorAmount: 30_000,
            debtorCompanyId: SUB, debtorAccountId: 'proveedores', debtorAmount: 28_000,
        })
        expect(record.status).toBe('PENDING')
        // Se elimina lo conciliado (28.000); los 2.000 restantes quedan a la vista
        expect(record.agreedAmount).toBe(28_000)
        expect(record.creditorAmount - record.debtorAmount).toBe(2_000)
    })
})
