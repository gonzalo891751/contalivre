/**
 * Fase 2F (§19) — Flujo E2E integral en el navegador real.
 * app limpia → dataset RC → recorrer estados → editar regla de gasto →
 * guardar nota manual → moneda de cierre → guardar versión validada →
 * modificar nota → comprobar invalidación → reset. Un solo camino, secuencial.
 */

import { test, expect } from '@playwright/test'
import { gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

test('flujo integral: dataset → estados → reglas → notas → cierre → versión → invalidación → reset', async ({ page }) => {
    await pinPeriod2025(page)

    // 1. app limpia + dataset RC
    await loadRcDataset(page)

    // 2. estados básicos
    await gotoEstados(page)
    await expect(page.getByText('Estados conciliados')).toBeVisible({ timeout: 30_000 })
    await openEstadosTab(page, 'Evolución PN')
    await expect(page.getByText('Saldos al cierre').first()).toBeVisible()

    // 3. editar una regla de gasto desde la UI
    await page.goto('/configuracion?seccion=plan-cuentas')
    await page.getByTestId('allocation-editor').scrollIntoViewIfNeeded()
    await page.getByTestId('alloc-account').selectOption({ label: 'RC.5.06 RC Publicidad' })
    const pct = page.getByTestId('allocation-editor').locator('input[type="number"]')
    await pct.nth(0).fill('50'); await pct.nth(1).fill('50')
    await page.getByTestId('alloc-from').fill('2025-01-01')
    await page.getByTestId('alloc-reason').fill('E2E flujo integral 50/50')
    await page.getByTestId('alloc-save').click()
    await expect(page.getByTestId('alloc-message')).toContainText('guardada')

    // 4. guardar una nota manual validada; la nota queda en el juego (durable)
    await gotoEstados(page)
    await openEstadosTab(page, 'Notas y Anexos')
    await page.getByTestId('manual-notes-editor').getByRole('button', { name: /Editar notas manuales/ }).click()
    await page.getByTestId('mne-type').selectOption('hechos-posteriores')
    await page.getByTestId('mne-content').fill('E2E: apertura de nueva sucursal en enero siguiente.')
    await page.getByTestId('mne-save').click()
    // el bundle se recarga; al expandir la nota manual aparece su contenido
    await page.getByRole('button', { name: /Hechos posteriores al cierre/ }).click()
    await expect(page.getByText('E2E: apertura de nueva sucursal').first()).toBeVisible({ timeout: 30_000 })

    // 5. guardar versión validada (snapshot)
    await page.getByRole('button', { name: 'Guardar versión validada' }).click()
    await expect(page.getByText(/versión\(es\) validada\(s\)/)).toBeVisible({ timeout: 30_000 })

    // 6. modificar la nota → invalida la versión guardada (observable en la barra)
    await openEstadosTab(page, 'Notas y Anexos')
    await page.getByTestId('manual-notes-editor').getByRole('button', { name: /Editar notas manuales/ }).click()
    await page.getByTestId('mne-content').fill('E2E: corrección del hecho posterior (v2).')
    await page.getByTestId('mne-save').click()
    await page.getByRole('button', { name: /Hechos posteriores al cierre/ }).click()
    await expect(page.getByText('E2E: corrección del hecho posterior (v2)').first()).toBeVisible({ timeout: 30_000 })
    // la versión validada quedó INVALIDATED (snapshotInfo refleja el estado)
    await expect(page.getByText(/INVALIDATED/).first()).toBeVisible({ timeout: 30_000 })

    // 7. reset total: la app queda utilizable
    await page.goto('/configuracion?seccion=datos')
    page.once('dialog', d => d.accept())
    await page.getByTestId('rc-delete').click()
    await expect(page.getByTestId('rc-status')).toContainText('sin dataset', { timeout: 30_000 })
    await gotoEstados(page)
    await expect(page.getByRole('heading', { name: 'ESTADOS CONTABLES' })).toBeVisible()
})
