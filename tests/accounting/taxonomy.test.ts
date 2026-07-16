/**
 * Fase 2A — Taxonomía contable estructurada (ACC-007 / ACC-009).
 */

import { describe, it, expect } from 'vitest'
import {
    deriveMonetaryClassification,
    isPostableAccount,
    materializeTaxonomy,
    validateChartOfAccounts,
} from '../../src/accounting/taxonomy/taxonomy'
import { getInitialMonetaryClass } from '../../src/core/cierre-valuacion/monetary-classification'
import { makeAccount, TEST_ACCOUNTS } from './helpers'

const byId = (id: string) => TEST_ACCOUNTS.find(a => a.id === id)!

describe('Fase 2A — clasificación monetaria (RT 54 TO RT 59)', () => {
    it('Caja y Bancos: monetaria', () => {
        expect(deriveMonetaryClassification(byId('caja'))).toBe('MONETARY')
        expect(deriveMonetaryClassification(byId('banco'))).toBe('MONETARY')
    })

    it('Créditos en moneda: monetaria', () => {
        expect(deriveMonetaryClassification(byId('deudores'))).toBe('MONETARY')
    })

    it('Deudas en moneda: monetaria', () => {
        expect(deriveMonetaryClassification(byId('proveedores'))).toBe('MONETARY')
        expect(deriveMonetaryClassification(byId('gastos-a-pagar'))).toBe('MONETARY')
    })

    it('Bienes de Cambio: NO monetaria (ACC-009)', () => {
        expect(deriveMonetaryClassification(byId('mercaderias'))).toBe('NON_MONETARY')
    })

    it('Bienes de Uso e Intangibles: no monetarias', () => {
        expect(deriveMonetaryClassification(byId('bienes-uso'))).toBe('NON_MONETARY')
        expect(deriveMonetaryClassification(byId('intangibles'))).toBe('NON_MONETARY')
    })

    it('Capital y partidas de PN: no monetarias a efectos de reexpresión', () => {
        expect(deriveMonetaryClassification(byId('capital'))).toBe('NON_MONETARY')
    })

    it('la cuenta agrupadora no es imputable', () => {
        expect(isPostableAccount(byId('header-activo'))).toBe(false)
        expect(isPostableAccount(byId('caja'))).toBe(true)
    })

    it('el motor de inflación respeta la metadata persistida por encima del prefijo', () => {
        // Cuenta con código 1.1.04 (prefijo históricamente mal mapeado como
        // MONETARY) pero metadata NON_MONETARY: la metadata manda.
        const mercaderias = materializeTaxonomy(byId('mercaderias'), 'company-default')
        expect(mercaderias.monetaryClassification).toBe('NON_MONETARY')
        expect(getInitialMonetaryClass(mercaderias)).toBe('NON_MONETARY')
    })

    it('el prefijo 1.1.04 ya no fuerza MONETARY sin metadata', () => {
        const sinMetadata = makeAccount({
            id: 'x-114', code: '1.1.04.09', name: 'Cuenta ambigua', kind: 'ASSET',
        })
        // Sin statementGroup ni metadata ni keywords: requiere decisión del usuario
        const cls = getInitialMonetaryClass(sinMetadata)
        expect(cls).not.toBe('MONETARY')
    })

    it('materializeTaxonomy es idempotente y completa los campos', () => {
        const enriched = materializeTaxonomy(byId('mercaderias'), 'company-default')
        expect(enriched.accountClass).toBe('ASSET')
        expect(enriched.currentClassification).toBe('CURRENT')
        expect(enriched.isPostable).toBe(true)
        expect(enriched.active).toBe(true)

        const again = materializeTaxonomy(enriched, 'otra-empresa')
        expect(again.companyId).toBe(enriched.companyId) // no pisa metadata existente
        expect(again.monetaryClassification).toBe(enriched.monetaryClassification)
    })
})

describe('Fase 2A — validación del plan de cuentas', () => {
    it('detecta códigos duplicados', () => {
        const issues = validateChartOfAccounts([
            makeAccount({ id: 'a', code: '1.1', name: 'A', kind: 'ASSET' }),
            makeAccount({ id: 'b', code: '1.1', name: 'B', kind: 'ASSET' }),
        ])
        expect(issues.some(i => i.message.includes('Código duplicado'))).toBe(true)
    })

    it('detecta padre inexistente', () => {
        const issues = validateChartOfAccounts([
            makeAccount({ id: 'a', code: '1.1.01', name: 'A', kind: 'ASSET', parentId: 'no-existe' }),
        ])
        expect(issues.some(i => i.message.includes('padre inexistente'))).toBe(true)
    })

    it('detecta ciclos jerárquicos', () => {
        const issues = validateChartOfAccounts([
            makeAccount({ id: 'a', code: '1', name: 'A', kind: 'ASSET', parentId: 'b' }),
            makeAccount({ id: 'b', code: '2', name: 'B', kind: 'ASSET', parentId: 'a' }),
        ])
        expect(issues.some(i => i.message.includes('Ciclo jerárquico'))).toBe(true)
    })

    it('detecta activo con naturaleza acreedora sin marca de regularizadora', () => {
        const issues = validateChartOfAccounts([
            makeAccount({ id: 'a', code: '1.9', name: 'Raro', kind: 'ASSET', normalSide: 'CREDIT' }),
        ])
        expect(issues.some(i => i.message.includes('regularizadora'))).toBe(true)
    })

    it('acepta un plan válido', () => {
        const issues = validateChartOfAccounts(TEST_ACCOUNTS)
        expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
    })
})
