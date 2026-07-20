/**
 * Fase 2F (§6.1/§6.3) — Aceptación visual móvil 390×844.
 * EEPN por movimiento, EFE apilado y notas como tarjetas.
 */

import { test, expect } from '@playwright/test'
import { evidence, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

test.describe('Aceptación visual — móvil 390×844', () => {
    test('estados en móvil con el dataset RC', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)

        await evidence(page, 'esp-movil-390')

        await openEstadosTab(page, 'Resultados')
        await evidence(page, 'er-movil-390')

        // EEPN móvil: selector de movimiento + tarjeta por componente
        await openEstadosTab(page, 'Evolución PN')
        const select = page.locator('#eqm-mobile-select')
        await expect(select).toBeVisible()
        await select.selectOption({ label: 'Aportes de los propietarios' })
        await expect(page.getByText('Total del movimiento')).toBeVisible()
        await evidence(page, 'eepn-movil-aportes-390')
        await select.selectOption({ label: 'Saldos al cierre' })
        await evidence(page, 'eepn-movil-cierre-390')

        await openEstadosTab(page, 'Flujo de Efectivo')
        await evidence(page, 'efe-movil-390')

        await openEstadosTab(page, 'Notas y Anexos')
        await evidence(page, 'notas-movil-390')

        await page.getByRole('tab', { name: 'Costo de ventas' }).click()
        await evidence(page, 'cmv-movil-390')
    })
})
