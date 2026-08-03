/** Fase 2L — recorrido integral y evidencia visual del pre-cierre guiado. */

import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const AUDIT_EVIDENCE = path.join(ROOT, 'docs', 'auditoria', 'evidencia')
const AFTER_EVIDENCE = path.join(ROOT, 'docs', 'evidence', 'phase2l', 'despues')
const CHECKPOINT = path.join(ROOT, 'docs', 'auditoria', 'checkpoints', 'checkpoint-a-pre-cierre.json')

fs.mkdirSync(AUDIT_EVIDENCE, { recursive: true })
fs.mkdirSync(AFTER_EVIDENCE, { recursive: true })

async function shot(page: Page, name: string, auditName?: string): Promise<void> {
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(AFTER_EVIDENCE, `${name}.png`), fullPage: true })
    if (auditName) await page.screenshot({ path: path.join(AUDIT_EVIDENCE, `${auditName}.png`), fullPage: true })
}

test.describe.configure({ mode: 'serial' })

test.describe('Fase 2L — pre-cierre guiado', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
        page = await context.newPage()
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
                legalName: 'Purmamarca Comercial S.A. — Auditoría E2E',
                taxId: '30-71234567-4',
            })
            const exercise = await db.exercises.where('companyId').equals(company!.id)
                .filter(candidate => candidate.startDate.startsWith('2025')).first()
            const registry = await import('/src/accounting/inflation/indexRegistry.ts')
            const sets = await registry.listIndexSets()
            const closing = await import('/src/reporting/closing/closingWorkPaperService.ts')
            await closing.saveInflationPolicy(company!.id, exercise!.id, {
                applicability: 'APLICABLE',
                indexSetId: sets[0].id,
                contextAssessment: 'Contexto evaluado para el caso E2E.',
                rationale: 'El ejercicio se expresa en moneda de cierre.',
                normativeSource: 'RT 54, texto ordenado por RT 59.',
            })
        }, backup)
    })

    test.afterAll(async () => { await page?.context().close() })

    test('1 · conserva el acceso principal y la redirección histórica', async () => {
        await page.goto('/')
        await expect(page.locator('nav').first().getByRole('link', { name: 'Pre-cierre y medición' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Cierre: AxI + Valuación' })).toHaveCount(0)
        await page.goto('/planillas/cierre-valuacion')
        await expect(page).toHaveURL(/\/pre-cierre/)
    })

    test('2 · presenta identidad, progreso y ocho etapas sin contradicciones', async () => {
        await page.goto('/pre-cierre')
        const view = page.getByTestId('precierre-page')
        await expect(view).toBeVisible({ timeout: 30_000 })
        await expect(view).toContainText('Purmamarca Comercial S.A.')
        await expect(view).toContainText('Ejercicio 2025')
        await expect(view).toContainText('31/12/2025')
        await expect(view).toContainText('Moneda de cierre')
        await expect(page.locator('.preclose-step')).toHaveCount(8)
        await shot(page, '01-resumen-desktop', '21-precierre-resumen')
        await shot(page, '02-identidad-desktop')
    })

    test('3 · la cobertura incluye todas las cuentas y explica las monetarias', async () => {
        await page.getByTestId('etapa-INTEGRIDAD_COBERTURA').click()
        await expect(page.getByTestId('cobertura-tabla')).toBeVisible()
        await expect(page.getByTestId('cobertura-pct')).toHaveText('100.00 %')
        await page.getByRole('button', { name: 'Monetarias', exact: true }).click()
        await expect(page.getByTestId('cobertura-tabla'))
            .toContainText('Controlada — ya expresada en moneda de cierre')
        await shot(page, '03-integridad-cobertura-desktop', '22-precierre-cobertura')
    })

    test('4 · corte, inventario y bienes de uso muestran evidencia propia', async () => {
        await page.getByTestId('etapa-CORTE_DEVENGAMIENTOS').click()
        await expect(page.getByTestId('stage-accruals')).toBeVisible()
        await shot(page, '04-corte-devengamientos-desktop')

        await page.getByTestId('etapa-INVENTARIO_CMV').click()
        await expect(page.getByTestId('stage-inventory')).toBeVisible()
        await shot(page, '05-inventario-cmv-desktop')

        await page.getByTestId('etapa-BIENES_USO_DEPRECIACIONES').click()
        await expect(page.getByTestId('stage-fixed-assets')).toBeVisible()
        await shot(page, '06-bienes-uso-desktop')
    })

    test('5 · medición no aplicable conserva su motivo verificable', async () => {
        await page.getByTestId('etapa-MEDICION_RECUPERABILIDAD').click()
        await expect(page.getByTestId('precierre-page')).toContainText('No aplicable')
        await expect(page.getByTestId('precierre-page')).toContainText('No existen saldos en cuentas')
        await shot(page, '07-medicion-recuperabilidad-desktop')
    })

    test('6 · inflación expone serie, matriz, guardia y conciliación dual', async () => {
        await page.getByTestId('etapa-UNIDAD_MEDIDA_INFLACION').click()
        await expect(page.getByTestId('inflation-workpaper')).toBeVisible()
        await expect(page.getByTestId('inflation-workpaper-table')).toBeVisible()
        await expect(page.getByTestId('recpam-panel')).toBeVisible()
        await expect(page.getByTestId('recpam-diferencia')).toHaveText('-0,02')
        await page.getByRole('button', { name: /Ver la evolución de la posición monetaria/ }).click()
        await expect(page.getByTestId('recpam-panel')).toContainText('2025-01')
        await shot(page, '08-unidad-medida-inflacion-desktop', '23-precierre-recpam')
    })

    test('7 · la conciliación final habilita el cierre cuando no hay bloqueos', async () => {
        await page.getByTestId('etapa-CONCILIACION_EMISION').click()
        await expect(page.getByTestId('stage-final')).toBeVisible()
        await expect(page.getByTestId('ir-al-cierre')).toBeEnabled()
        await shot(page, '09-conciliacion-emision-desktop', '24-precierre-listo-para-cerrar')
    })

    test('8 · un borrador bloquea la etapa correcta y la compuerta final', async () => {
        await page.evaluate(async () => {
            const { createDraftEntry } = await import('/src/accounting/application/journalService.ts')
            const { db } = await import('/src/storage/db.ts')
            const accounts = await db.accounts.toArray()
            const bank = accounts.find(account => account.code === '1.1.01.02')!
            const sales = accounts.find(account => account.code === '4.1.01')!
            await createDraftEntry({
                date: '2025-06-15', memo: 'borrador pendiente',
                lines: [
                    { accountId: bank.id, debit: 1000, credit: 0 },
                    { accountId: sales.id, debit: 0, credit: 1000 },
                ],
            })
        })
        await page.goto('/pre-cierre?etapa=CORTE_DEVENGAMIENTOS')
        await expect(page.getByTestId('precierre-page')).toContainText('borrador(es) sin contabilizar')
        await expect(page.getByTestId('etapa-CORTE_DEVENGAMIENTOS')).toContainText('Bloqueada')
        await page.getByTestId('etapa-CONCILIACION_EMISION').click()
        await expect(page.getByTestId('etapa-CONCILIACION_EMISION')).toContainText('Bloqueada')
        await expect(page.locator('.preclose-next')).toContainText('Resolver antes de seguir')
        await expect(page.locator('.preclose-next')).toContainText('Resolver ahora')
        await expect(page.getByTestId('ir-al-cierre')).toBeDisabled()
        await shot(page, '10-bloqueo-visible-desktop', '25-precierre-bloqueado')
    })

    test('9 · la misma compuerta bloquea Configuración y vuelve a habilitarse al resolver', async () => {
        await page.goto('/configuracion?seccion=ejercicios')
        await page.getByRole('button', { name: 'Cierre…' }).click()
        await expect(page.getByTestId('cierre-blockers')).toContainText('borrador')
        await expect(page.getByTestId('cierre-post')).toBeDisabled()

        await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            const { deleteDraftEntry } = await import('/src/accounting/application/journalService.ts')
            const drafts = await db.entries.filter(entry => entry.status === 'DRAFT').toArray()
            for (const draft of drafts) await deleteDraftEntry(draft.id)
        })
        await page.goto('/pre-cierre?etapa=CONCILIACION_EMISION')
        await expect(page.getByTestId('ir-al-cierre')).toBeEnabled({ timeout: 30_000 })
    })
})
