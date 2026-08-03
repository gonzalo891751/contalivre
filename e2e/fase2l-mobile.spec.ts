/** Fase 2L — aceptación visual móvil del pre-cierre guiado (390 × 844). */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECKPOINT = path.join(ROOT, 'docs', 'auditoria', 'checkpoints', 'checkpoint-a-pre-cierre.json')
const EVIDENCE = path.join(ROOT, 'docs', 'evidence', 'phase2l', 'despues')

fs.mkdirSync(EVIDENCE, { recursive: true })

test('Fase 2L — el recorrido se apila, conserva controles y no desborda', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('contalivre_period_year',
            JSON.stringify({ year: 2025, start: '2025-01-01', end: '2025-12-31' }))
    })
    await page.goto('/')
    const backup = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf-8'))
    await page.evaluate(async (data) => {
        const backupModule = await import('/src/accounting/backup/backupService.ts')
        await backupModule.restoreBackup(data)
        const seed = await import('/src/storage/seed.ts')
        await seed.repairInflationMetadata()
        const { db } = await import('/src/storage/db.ts')
        const company = await db.companies.toCollection().first()
        await db.companies.update(company!.id, {
            legalName: 'Purmamarca Comercial S.A. — Auditoría móvil',
            taxId: '30-71234567-4',
        })
        const exercise = await db.exercises.where('companyId').equals(company!.id)
            .filter(candidate => candidate.startDate.startsWith('2025')).first()
        const registry = await import('/src/accounting/inflation/indexRegistry.ts')
        const sets = await registry.listIndexSets()
        const closing = await import('/src/reporting/closing/closingWorkPaperService.ts')
        await closing.saveInflationPolicy(company!.id, exercise!.id, {
            applicability: 'APLICABLE', indexSetId: sets[0].id,
            rationale: 'El ejercicio se expresa en moneda de cierre.',
        })
    }, backup)

    await page.goto('/pre-cierre')
    await expect(page.getByTestId('precierre-page')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.preclose-step')).toHaveCount(8)
    const layout = await page.locator('.preclose-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns)
    expect(layout.split(' ').length).toBe(1)
    let dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
    await page.screenshot({ path: path.join(EVIDENCE, '11-resumen-mobile-390.png'), fullPage: true })

    await page.getByTestId('etapa-UNIDAD_MEDIDA_INFLACION').click()
    await expect(page.getByTestId('inflation-workpaper')).toBeVisible()
    await expect(page.getByTestId('inflation-workpaper-table')).toBeVisible()
    dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
    await page.screenshot({ path: path.join(EVIDENCE, '12-inflacion-mobile-390.png'), fullPage: true })
})
