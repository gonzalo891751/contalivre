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

    test('Preparación en MONEDA DE CIERRE: banner honesto, coeficiente por contribución y export', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)

        // Seleccionar el set de índices (habilita la moneda de cierre)
        const setSelect = page.getByTestId('inflation-set-selector').locator('select')
        const rcValue = await setSelect.locator('option', { hasText: 'Índices RC' }).first().getAttribute('value')
        await setSelect.selectOption(rcValue!)

        await openEstadosTab(page, 'Flujo de Efectivo')
        await page.getByRole('button', { name: 'Preparación', exact: true }).click()
        // El bundle se recalcula con índices: esperar a que la moneda de cierre se habilite
        const cierreBtn = page.getByRole('button', { name: 'Moneda de cierre', exact: true })
        await expect(cierreBtn).toBeEnabled({ timeout: 30_000 })
        await cierreBtn.click()

        // Banner honesto (§3.D, §9): no rotula "cierre" mostrando nominal
        await expect(page.getByText('Importes expresados en moneda de cierre')).toBeVisible()
        await expect(page.getByText(/Cada cobro, pago y ajuste fue reexpresado desde su período de origen/)).toBeVisible()
        // REI del efectivo en el puente reexpresado
        await expect(page.getByText('REI del efectivo')).toBeVisible()
        await evidence2g(page, 'preparacion-moneda-cierre')

        // Detalle de celda con evidencia por contribución (índice/coeficiente)
        await page.locator('.prep-cell-btn').first().click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByText('Reexpresión por contribución')).toBeVisible()
        await expect(dialog.getByRole('columnheader', { name: 'Coef.' })).toBeVisible()
        await evidence2g(page, 'preparacion-cierre-coeficiente', false)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)

        // Export del papel de trabajo en moneda de cierre disponible (§3.E)
        await expect(page.getByRole('button', { name: /Exportar XLSX \(moneda de cierre\)/ })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Exportar ambas' })).toBeVisible()
    })

    test('Configuración: panel de políticas del EFE (edición)', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await page.goto('/configuracion?seccion=plan-cuentas')
        await expect(page.getByRole('heading', { name: /Políticas del Estado de Flujo de Efectivo/ })).toBeVisible({ timeout: 30_000 })
        // Si aún no hay política en esta base, crearla (deja el panel en modo edición)
        const createBtn = page.getByRole('button', { name: /Crear política por defecto/ })
        if (await createBtn.isVisible().catch(() => false)) await createBtn.click()
        // Panel FUNCIONAL: existe el guardado versionado
        await expect(page.getByRole('button', { name: /Guardar como nueva versión/ })).toBeVisible({ timeout: 15_000 })
        await evidence2g(page, 'configuracion-politicas-efe')
    })
})
