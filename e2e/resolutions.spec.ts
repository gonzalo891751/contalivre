/**
 * Fase 2F (§6.1) — Resoluciones intermedias: 1440×900, 1366×768, 1024×768 y
 * tablet 768×1024. Captura ESP y EEPN matriz en cada una (sticky, scroll y
 * legibilidad se revisan sobre la evidencia).
 */

import { test, expect } from '@playwright/test'
import { evidence, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

const RESOLUTIONS = [
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: 'tablet-768x1024', width: 768, height: 1024 },
]

for (const res of RESOLUTIONS) {
    test(`ESP y EEPN en ${res.name}`, async ({ page }) => {
        await page.setViewportSize({ width: res.width, height: res.height })
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        await evidence(page, `esp-${res.name}`)
        await openEstadosTab(page, 'Evolución PN')
        await expect(page.getByText('Saldos al cierre').first()).toBeVisible()
        await evidence(page, `eepn-${res.name}`)
    })
}
