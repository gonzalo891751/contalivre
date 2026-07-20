/**
 * Fase 2F (§15) — Reset total en el navegador real y app utilizable después.
 * Carga el dataset RC, verifica que Estados funciona, resetea vía el panel de
 * fixture (reseteo total) y comprueba que la app queda usable (Configuración y
 * Estados cargan; el dataset desaparece) y que el dataset puede recargarse.
 */

import { test, expect } from '@playwright/test'
import { evidence, loadRcDataset, pinPeriod2025 } from './helpers'

test('reset total deja la app utilizable y el dataset recargable', async ({ page }) => {
    await pinPeriod2025(page)
    await loadRcDataset(page)

    // Estados funciona con el dataset
    await page.goto('/estados')
    await expect(page.getByRole('heading', { name: 'ESTADOS CONTABLES' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Estados conciliados')).toBeVisible({ timeout: 30_000 })

    // Reset total desde el panel de fixture (acepta el confirm)
    await page.goto('/configuracion?seccion=datos')
    page.once('dialog', d => d.accept())
    await page.getByTestId('rc-delete').click()
    await expect(page.getByTestId('rc-status')).toContainText('reseteado', { timeout: 30_000 })
    await expect(page.getByTestId('rc-status')).toContainText('sin dataset')
    await evidence(page, 'post-reset-1920')

    // La app sigue utilizable: Estados carga (base limpia, sin el dataset RC)
    await page.goto('/estados')
    await expect(page.getByRole('heading', { name: 'ESTADOS CONTABLES' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('RC Capital social')).toHaveCount(0)

    // El dataset puede recargarse sobre la base limpia (idempotencia del flujo)
    await loadRcDataset(page)
    await page.goto('/estados')
    await expect(page.getByText('Estados conciliados')).toBeVisible({ timeout: 30_000 })
})
