/**
 * Fase 2G (§18D) — Aceptación E2E de la vista de Preparación del EFE.
 * Exposición ↔ Preparación, matriz, controles, celda interactiva y foco del modal.
 */

import { test, expect } from '@playwright/test'
import { evidence2g, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

test.describe('Fase 2G — Preparación del EFE (escritorio)', () => {
    test('conmuta a Preparación, muestra matriz y controles, y abre el detalle de una celda', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        await openEstadosTab(page, 'Flujo de Efectivo')
        await evidence2g(page, 'exposicion-efe')

        // Conmutar Exposición → Preparación
        await page.getByRole('button', { name: 'Preparación', exact: true }).click()
        await expect(page.getByRole('heading', { name: /Cómo se construye el Estado de Flujo de Efectivo/ })).toBeVisible()

        // Panel de controles y matriz presentes
        await expect(page.getByText('Directo = Indirecto')).toBeVisible()
        await expect(page.getByRole('region', { name: 'Matriz de preparación' })).toBeVisible()
        await evidence2g(page, 'preparacion-matriz-controles')

        // Celda interactiva → panel con fórmula (§12.5)
        const firstCell = page.locator('.prep-cell-btn').first()
        await firstCell.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Fórmula')).toBeVisible()
        await evidence2g(page, 'preparacion-celda-formula', false)

        // Foco inicial en el botón cerrar; Escape cierra y devuelve el foco (§13)
        await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)

        // Filtro por actividad no rompe la tabla
        await page.getByLabel('Filtrar por actividad').selectOption('OPERATING')
        await expect(page.getByRole('region', { name: 'Matriz de preparación' })).toBeVisible()
    })

    test('Configuración: panel de políticas del EFE', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await page.goto('/configuracion?seccion=plan-cuentas')
        await expect(page.getByRole('heading', { name: /Políticas del Estado de Flujo de Efectivo/ })).toBeVisible({ timeout: 30_000 })
        await evidence2g(page, 'configuracion-politicas-efe')
    })
})
