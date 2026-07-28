/**
 * Fase 2J — el pre-cierre como etapa visible del ciclo.
 *
 * Verifica el recorrido que el usuario debe poder hacer sin conocer la
 * aplicación: encontrar el pre-cierre en la navegación principal, ver en qué
 * etapa está el ejercicio, qué cuentas ya fueron analizadas, cómo se determinó
 * el RECPAM y cuándo el ejercicio está listo para cerrar.
 *
 * Corre sobre el Checkpoint A de la auditoría, restaurado en un contexto propio.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const EVIDENCE = path.join(ROOT, 'docs', 'auditoria', 'evidencia')
const CHECKPOINT = path.join(ROOT, 'docs', 'auditoria', 'checkpoints', 'checkpoint-a-pre-cierre.json')

fs.mkdirSync(EVIDENCE, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true })
}

test.describe.configure({ mode: 'serial' })

test.describe('Pre-cierre y medición al cierre', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
        page = await context.newPage()
        await page.addInitScript(() => {
            localStorage.setItem('contalivre_period_year',
                JSON.stringify({ year: 2025, start: '2025-01-01', end: '2025-12-31' }))
        })

        // Escenario: el ejercicio 2025 completo, antes de la refundición
        await page.goto('/')
        const backup = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf-8'))
        await page.evaluate(async (data) => {
            const mod = await import('/src/accounting/backup/backupService.ts')
            await mod.restoreBackup(data)
            const seed = await import('/src/storage/seed.ts')
            await seed.repairInflationMetadata()
            const { db } = await import('/src/storage/db.ts')
            const c = await db.companies.toCollection().first()
            await db.companies.update(c!.id, {
                legalName: 'Purmamarca Comercial S.A. — Auditoría E2E',
                taxId: '30-71234567-4',
            })
        }, backup)
    })

    test.afterAll(async () => { await page?.context().close() })

    test('1 · el pre-cierre está en la navegación principal, antes de los estados', async () => {
        await page.goto('/')
        const rail = page.locator('nav').first()
        await expect(rail.getByRole('link', { name: 'Pre-cierre y medición' })).toBeVisible()

        // Y la planilla de AxI ya no aparece como segunda fuente de verdad
        await expect(page.getByRole('link', { name: 'Cierre: AxI + Valuación' })).toHaveCount(0)
    })

    test('2 · la ruta vieja de la planilla AxI lleva al pre-cierre', async () => {
        await page.goto('/planillas/cierre-valuacion')
        await expect(page).toHaveURL(/\/pre-cierre/)
        await expect(page.getByTestId('precierre-page')).toBeVisible({ timeout: 30_000 })
    })

    test('3 · el encabezado dice en qué situación está el ejercicio', async () => {
        await page.goto('/pre-cierre')
        const pagina = page.getByTestId('precierre-page')
        await expect(pagina).toBeVisible({ timeout: 30_000 })

        await expect(pagina).toContainText('Purmamarca Comercial S.A.')
        await expect(pagina).toContainText('Ejercicio 2025')
        await expect(pagina).toContainText('31/12/2025')
        await expect(pagina).toContainText('Moneda de cierre (2025-12)')
        await expect(pagina).toContainText('Conciliado')
        await expect(pagina).toContainText('Listos para publicar')
        await shot(page, '21-precierre-resumen')
    })

    test('4 · las once etapas muestran su estado real', async () => {
        const rail = page.getByTestId('etapa-COBERTURA')
        await expect(rail).toBeVisible()
        await expect(rail).toContainText('Completa')

        // «No aplicable» sólo aparece con su motivo
        await page.getByTestId('etapa-MEDICIONES').click()
        await expect(page.getByTestId('precierre-page')).toContainText('No aplica en este ejercicio')
    })

    test('5 · la cobertura muestra el 100 % y explica las partidas monetarias', async () => {
        await page.getByTestId('etapa-COBERTURA').click()
        await expect(page.getByTestId('cobertura-tabla')).toBeVisible()
        await expect(page.getByTestId('cobertura-pct')).toHaveText('100.00 %')

        // Una partida monetaria figura como controlada, no como omitida
        await page.getByRole('button', { name: 'Monetarias', exact: true }).click()
        await expect(page.getByTestId('cobertura-tabla'))
            .toContainText('Controlada — ya expresada en moneda de cierre')
        await shot(page, '22-precierre-cobertura')
    })

    test('6 · el RECPAM se puede inspeccionar por sus dos caminos', async () => {
        await page.getByTestId('etapa-RECPAM').click()
        await expect(page.getByTestId('recpam-panel')).toBeVisible()
        await expect(page.getByTestId('recpam-secuencial')).toHaveText('-4.432.331,94')
        await expect(page.getByTestId('recpam-analitico')).toHaveText('-4.432.331,92')
        await expect(page.getByTestId('recpam-diferencia')).toHaveText('-0,02')

        await page.getByRole('button', { name: /Ver la evolución de la posición monetaria/ }).click()
        await expect(page.getByTestId('recpam-panel')).toContainText('2025-01')
        await shot(page, '23-precierre-recpam')
    })

    test('7 · la última etapa habilita el cierre sólo cuando no hay bloqueos', async () => {
        await page.getByTestId('etapa-CIERRE').click()
        const boton = page.getByTestId('ir-al-cierre')
        await expect(boton).toBeVisible()
        await expect(boton).toBeEnabled()
        await shot(page, '24-precierre-listo-para-cerrar')
    })

    test('8 · un bloqueo real deshabilita el cierre y dice cómo resolverlo', async () => {
        // Se deja un borrador pendiente: es un bloqueo genuino del ciclo
        await page.evaluate(async () => {
            const { createDraftEntry } = await import('/src/accounting/application/journalService.ts')
            const { db } = await import('/src/storage/db.ts')
            const accounts = await db.accounts.toArray()
            const banco = accounts.find(a => a.code === '1.1.01.02')!
            const ventas = accounts.find(a => a.code === '4.1.01')!
            await createDraftEntry({
                date: '2025-06-15', memo: 'borrador pendiente',
                lines: [
                    { accountId: banco.id, debit: 1000, credit: 0 },
                    { accountId: ventas.id, debit: 0, credit: 1000 },
                ],
            })
        })

        await page.goto('/pre-cierre?etapa=AJUSTES')
        await expect(page.getByTestId('precierre-page')).toContainText('borrador(es) sin contabilizar')
        await expect(page.getByTestId('etapa-AJUSTES')).toContainText('Bloqueada')

        await page.getByTestId('etapa-CIERRE').click()
        await expect(page.getByTestId('ir-al-cierre')).toBeDisabled()
        await shot(page, '25-precierre-bloqueado')
    })

    test('9 · el mismo bloqueo impide cerrar el ejercicio desde Configuración', async () => {
        await page.goto('/configuracion?seccion=ejercicios')
        await page.getByRole('button', { name: 'Cierre…' }).click()
        await expect(page.getByTestId('cierre-blockers')).toContainText('borrador')
        await expect(page.getByTestId('cierre-post')).toBeDisabled()
    })

    test('10 · resuelto el bloqueo, el pre-cierre y el cierre vuelven a habilitarse', async () => {
        await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            const { deleteDraftEntry } = await import('/src/accounting/application/journalService.ts')
            const drafts = await db.entries.filter(e => e.status === 'DRAFT').toArray()
            for (const d of drafts) await deleteDraftEntry(d.id)
        })

        await page.goto('/pre-cierre?etapa=CIERRE')
        await expect(page.getByTestId('ir-al-cierre')).toBeEnabled({ timeout: 30_000 })
    })
})
