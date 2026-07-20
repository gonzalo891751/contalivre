/**
 * Fase 2F (§7) — E2E del editor visual de distribución de gastos.
 * Crea una regla 70/30 sobre RC Publicidad desde la UI, verifica la vista
 * previa, el guardado versionado y que el anexo de gastos la aplique.
 */

import { test, expect } from '@playwright/test'
import { evidence, gotoEstados, loadRcDataset, pinPeriod2025 } from './helpers'

test('editor de reglas: crear 70/30 desde la UI y verla aplicada en el anexo', async ({ page }) => {
    await pinPeriod2025(page)
    await loadRcDataset(page)

    await page.goto('/configuracion?seccion=plan-cuentas')
    const editor = page.getByTestId('allocation-editor')
    await editor.scrollIntoViewIfNeeded()

    // RC Publicidad (60.000 en 2025), sin regla previa
    await page.getByTestId('alloc-account').selectOption({ label: 'RC.5.06 RC Publicidad' })
    await expect(page.getByTestId('alloc-balance')).toContainText('60.000,00')

    // porcentaje por defecto 60/40 → cambiar a 70/30
    const pctInputs = editor.locator('input[type="number"]')
    await pctInputs.nth(0).fill('70')
    await pctInputs.nth(1).fill('30')
    await expect(page.getByTestId('alloc-sum')).toContainText('100,00 % ✓')

    await page.getByTestId('alloc-from').fill('2025-01-01')
    await page.getByTestId('alloc-reason').fill('E2E: campaña compartida entre áreas')

    // vista previa con importes
    await expect(page.getByTestId('alloc-preview')).toContainText('42.000,00')
    await expect(page.getByTestId('alloc-preview')).toContainText('18.000,00')
    await evidence(page, 'editor-reglas-preview-1920')

    await page.getByTestId('alloc-save').click()
    await expect(page.getByTestId('alloc-message')).toContainText('Regla activa guardada')

    // el anexo aplica la regla (badge % y reparto 42.000/18.000)
    await gotoEstados(page)
    await page.getByRole('tab', { name: 'Notas y Anexos' }).click()
    await page.getByRole('tab', { name: 'Gastos por función' }).click()
    const row = page.getByRole('row', { name: /RC Publicidad/ })
    await expect(row).toContainText('42.000,00')
    await expect(row).toContainText('18.000,00')
    await evidence(page, 'editor-reglas-aplicada-anexo-1920')
})
