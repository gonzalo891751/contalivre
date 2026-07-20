/**
 * Fase 2F (§16) — Generación REAL de exportables con el dataset RC.
 * Los artefactos quedan en docs/evidence/phase2f/exports para la revisión
 * formal manual documentada en el informe.
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import { EXPORTS_DIR, gotoEstados, loadRcDataset, pinPeriod2025 } from './helpers'

async function exportFromModal(page: import('@playwright/test').Page, opts: {
    file: string
    format: 'PDF' | 'XLSX'
    onlyContent?: string[]
    efeMethod?: 'Directo' | 'Indirecto' | 'Ambos'
}): Promise<void> {
    await page.getByRole('button', { name: 'Exportar estados' }).click()
    const dialog = page.getByRole('dialog', { name: 'Exportar estados' })
    await expect(dialog).toBeVisible()

    if (opts.format === 'XLSX') {
        await dialog.getByRole('button', { name: /Planilla/ }).click()
    } else {
        await dialog.getByRole('button', { name: /PDF formal/ }).click()
    }

    if (opts.onlyContent) {
        // desmarcar todo y marcar solo lo pedido
        for (const cb of await dialog.getByRole('checkbox').all()) {
            if (await cb.isChecked() && await cb.isEnabled()) await cb.uncheck()
        }
        for (const label of opts.onlyContent) {
            await dialog.getByText(label, { exact: false }).first().click()
        }
    }
    if (opts.efeMethod) {
        await dialog.getByRole('button', { name: opts.efeMethod, exact: true }).click()
    }

    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 })
    await dialog.getByRole('button', { name: opts.format === 'PDF' ? 'Exportar PDF' : 'Exportar planilla' }).click()
    const download = await downloadPromise
    await download.saveAs(path.join(EXPORTS_DIR, opts.file))
}

test.describe('Exportación formal real', () => {
    test('juego completo PDF, EEPN PDF, EFE directo/indirecto PDF y planilla completa', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        // comparativo activado para exportar con dos columnas
        await page.getByLabel('Comparativo').check()
        await expect(page.getByText('Exportar estados')).toBeVisible({ timeout: 30_000 })

        await exportFromModal(page, { file: 'juego-completo.pdf', format: 'PDF', efeMethod: 'Ambos' })
        await exportFromModal(page, { file: 'eepn-matriz.pdf', format: 'PDF', onlyContent: ['Evolución del PN'] })
        await exportFromModal(page, { file: 'efe-directo.pdf', format: 'PDF', onlyContent: ['Flujo de Efectivo'], efeMethod: 'Directo' })
        await exportFromModal(page, { file: 'efe-indirecto.pdf', format: 'PDF', onlyContent: ['Flujo de Efectivo'], efeMethod: 'Indirecto' })
        await exportFromModal(page, { file: 'planilla-completa.xlsx', format: 'XLSX', efeMethod: 'Ambos' })
    })
})
