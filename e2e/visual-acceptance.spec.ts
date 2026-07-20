/**
 * Fase 2F (§6) — Aceptación visual REAL en navegador (escritorio 1920×1080).
 *
 * Carga el dataset RC en la app real (vite dev) y recorre todos los estados
 * capturando evidencia en docs/evidence/phase2f/screenshots. Verifica además
 * comportamientos clave (toggles, drilldown, validaciones, estado bloqueado).
 */

import { test, expect } from '@playwright/test'
import { evidence, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

test.describe('Aceptación visual — escritorio', () => {
    test('ESP, ER, EEPN, EFE, notas y anexos con el dataset RC', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)

        // ── ESP ──────────────────────────────────────────────
        await expect(page.getByText('Estados conciliados')).toBeVisible()
        await evidence(page, 'esp-1920')

        // comparativo (2024 derivado con el mismo motor)
        await page.getByLabel('Comparativo').check()
        await expect(page.getByText('Anterior').first()).toBeVisible({ timeout: 30_000 })
        await evidence(page, 'esp-comparativo-1920')

        // detalle de invariantes (chip → tabla)
        await page.getByRole('button', { name: /Estados conciliados/ }).click()
        await expect(page.getByText('Diario: total Debe = total Haber')).toBeVisible()
        await evidence(page, 'validaciones-detalle-1920')
        await page.getByRole('button', { name: /Estados conciliados/ }).click()

        // ── ER ───────────────────────────────────────────────
        await openEstadosTab(page, 'Resultados')
        await expect(page.getByText('Resultado antes del impuesto a las ganancias')).toBeVisible()
        await expect(page.getByText('Impuesto a las ganancias').first()).toBeVisible()
        await evidence(page, 'er-completo-1920')

        // drilldown: expandir ventas y abrir linaje de la cuenta
        await page.getByText('Ingresos por ventas').click()
        await page.getByText('RC.4.01 RC Ventas').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await evidence(page, 'drilldown-linaje-1920')
        await page.keyboard.press('Escape')

        // ── EEPN matriz ──────────────────────────────────────
        await openEstadosTab(page, 'Evolución PN')
        await expect(page.getByText('Aportes de los propietarios').first()).toBeVisible()
        await expect(page.getByText('Saldos al cierre').first()).toBeVisible()
        await evidence(page, 'eepn-matriz-1920')

        // estructura completa (filas con guiones, sin ceros)
        await page.getByRole('button', { name: 'Mostrar estructura completa' }).click()
        await evidence(page, 'eepn-matriz-completa-1920')

        // vista resumida
        await page.getByRole('button', { name: 'Vista resumida' }).click()
        await expect(page.getByText('Evolución del Patrimonio Neto')).toBeVisible()
        await evidence(page, 'eepn-resumen-1920')
        await page.getByRole('button', { name: 'Vista matricial' }).click()

        // ── EFE ──────────────────────────────────────────────
        await openEstadosTab(page, 'Flujo de Efectivo')
        await expect(page.getByText('Variación neta').first()).toBeVisible()
        await evidence(page, 'efe-directo-detalle-1920')

        const modo = page.getByRole('group', { name: 'Modo' })
        await modo.getByRole('button', { name: 'Resumen' }).click()
        await evidence(page, 'efe-directo-resumen-1920')
        await modo.getByRole('button', { name: 'Detalle' }).click()

        await page.getByRole('button', { name: 'Indirecto' }).click()
        await expect(page.getByText('Resultado del ejercicio').first()).toBeVisible()
        // la tarjeta de operativas abre por defecto en Detalle: las
        // explicaciones de por qué cada ajuste suma o resta están a la vista
        await expect(page.getByText('no produjo una salida de efectivo')).toBeVisible()
        await evidence(page, 'efe-indirecto-detalle-1920')

        // moneda de cierre deshabilitada sin set de índices (bloqueo honesto)
        const closingBtn = page.getByRole('button', { name: 'Moneda de cierre' })
        await expect(closingBtn).toBeDisabled()

        // ── Notas y anexos ───────────────────────────────────
        await openEstadosTab(page, 'Notas y Anexos')
        await expect(page.getByText(/Nota 1/).first()).toBeVisible()
        await evidence(page, 'notas-1920')

        // expandir créditos por ventas (regularizadora en negativo)
        await page.getByRole('button', { name: /Créditos por ventas/ }).click()
        await expect(page.getByText('(regularizadora)').first()).toBeVisible()
        await evidence(page, 'notas-creditos-prevision-1920')

        await page.getByRole('tab', { name: 'Gastos por función' }).click()
        await expect(page.getByText('Total del anexo').first()).toBeVisible()
        await evidence(page, 'gastos-por-funcion-1920')

        await page.getByRole('tab', { name: 'Costo de ventas' }).click()
        await expect(page.getByText('Bienes disponibles para la venta').first()).toBeVisible()
        await evidence(page, 'cmv-puente-1920')

        await page.getByRole('tab', { name: 'Bienes de uso' }).click()
        await expect(page.getByText('Valor residual').first()).toBeVisible()
        await evidence(page, 'bienes-de-uso-1920')

        await page.getByRole('tab', { name: 'Moneda extranjera' }).click()
        await expect(page.getByText('RC Banco cuenta en dólares').first()).toBeVisible()
        await evidence(page, 'moneda-extranjera-1920')

        // ── impresión (media print) ──────────────────────────
        await openEstadosTab(page, 'Situación Patrimonial')
        await page.emulateMedia({ media: 'print' })
        await evidence(page, 'esp-print-1920')
        await page.emulateMedia({ media: 'screen' })
    })

    test('estado BLOQUEADO por cuenta sin mapping y revalidación', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)

        await page.getByTestId('rc-unmapped-on').click()
        await expect(page.getByTestId('rc-status')).toContainText('Variante sin mapping activada')

        await gotoEstados(page)
        await expect(page.getByRole('alert')).toContainText('no publicable')
        await evidence(page, 'estado-bloqueado-1920')

        // el botón de guardar versión validada queda deshabilitado
        await expect(page.getByRole('button', { name: 'Guardar versión validada' })).toBeDisabled()

        await page.goto('/configuracion?seccion=datos')
        await page.getByTestId('rc-unmapped-off').click()
        await expect(page.getByTestId('rc-status')).toContainText('Variante revertida')

        await gotoEstados(page)
        await expect(page.getByText('Estados conciliados')).toBeVisible()
        await evidence(page, 'estado-revalidado-1920')
    })

    test('guardar versión validada e invalidación visible del flujo', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)

        await page.getByRole('button', { name: 'Guardar versión validada' }).click()
        // el mensaje transitorio es reemplazado por el resumen persistente
        await expect(page.getByText(/versión\(es\) validada\(s\)/)).toBeVisible({ timeout: 30_000 })
        await evidence(page, 'version-validada-1920')
    })
})
