/**
 * E2E — Fase 2K §24: recorrido completo del módulo de consolidación.
 *
 * Cubre el camino que pide la fase: seleccionar el grupo, ver la controladora y
 * la controlada con su participación, verificar los requisitos previos, revisar
 * el papel de trabajo con sus eliminaciones, controlar la PNC, ver el juego
 * consolidado y exportarlo.
 *
 * El dataset se carga desde la propia pantalla (caso demostrativo Grupo
 * Litoral), que crea entidades y libros propios sin tocar ningún otro dato.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EVIDENCE_DIR = path.resolve(HERE, '..', 'docs', 'evidence', 'phase2k')
const SHOTS = path.join(EVIDENCE_DIR, 'screenshots')
const EXPORTS = path.join(EVIDENCE_DIR, 'exports')
for (const dir of [SHOTS, EXPORTS]) fs.mkdirSync(dir, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(350)
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

/**
 * Abre el módulo y siembra el caso demostrativo si hace falta (idempotente).
 *
 * La página se carga con `lazy`, así que primero hay que ESPERAR a que el
 * módulo se resuelva: preguntar por la visibilidad del botón antes de eso
 * devuelve false sin esperar y se saltearía la siembra.
 */
async function openConsolidation(page: Page): Promise<void> {
    await page.goto('/consolidacion')

    const seedButton = page.getByRole('button', { name: /Cargar el caso demostrativo/i })
    const worksheetTab = page.getByRole('tab', { name: 'Papel de trabajo' })

    // Espera a que la pantalla resuelva a uno de sus dos estados posibles
    await expect(seedButton.or(worksheetTab).first()).toBeVisible({ timeout: 60_000 })

    if (await seedButton.isVisible()) {
        await seedButton.click()
        await expect(seedButton).toBeHidden({ timeout: 90_000 })
    }
    await expect(worksheetTab).toBeVisible({ timeout: 90_000 })
}

test.describe('Fase 2K — consolidación de estados contables', () => {
    test('recorrido completo: grupo, perímetro, preparación, hoja, PNC y estados', async ({ page }) => {
        await openConsolidation(page)

        // ── 1 y 2. Grupo seleccionado, controladora y controlada visibles ──
        await expect(page.getByRole('combobox', { name: /Grupo económico/i }).or(
            page.locator('.cons-field select').first())).toBeVisible()
        await expect(page.getByText('Litoral Holding S.A.').first()).toBeVisible()
        await expect(page.getByText('Iberá Distribuciones S.A.').first()).toBeVisible()
        await expect(page.getByText(/80\.00 % · participación directa · PNC 20\.00 %/)).toBeVisible()

        // El resumen muestra el estado general del grupo
        await expect(page.getByText('1.389.000,00')).toBeVisible()   // activo consolidado
        await expect(page.getByText('1.211.400,00')).toBeVisible()   // PN de los propietarios
        await expect(page.getByText('77.600,00').first()).toBeVisible() // PNC
        await expect(page.locator('.cons-status-ok')).toContainText('puede emitirse')
        await shot(page, '01-resumen-del-grupo')

        // ── 3. Perímetro: control fundado, no deducido del porcentaje ──
        await page.getByRole('tab', { name: 'Perímetro' }).click()
        await expect(page.getByText(/El perímetro se define por el CONTROL/)).toBeVisible()
        await expect(page.getByText(/Consolidación total/).first()).toBeVisible()
        await expect(page.getByText(/posee el 80 % del capital y de los derechos de voto/)).toBeVisible()
        await shot(page, '02-perimetro')

        // ── 4. Requisitos previos ──
        await page.getByRole('tab', { name: 'Preparación' }).click()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        await expect(page.getByText(/Estados individuales de Litoral Holding S\.A\./)).toBeVisible()
        await expect(page.getByText(/Inversión de la controladora en Iberá/)).toBeVisible()
        // Ningún control bloqueado
        await expect(page.locator('.cons-check-blocked')).toHaveCount(0)
        await shot(page, '03-preparacion')

        // ── 5 a 7. Papel de trabajo, mapeo aplicado y eliminaciones ──
        await page.getByRole('tab', { name: 'Papel de trabajo' }).click()
        const sheet = page.locator('.cons-table')
        await expect(sheet).toBeVisible()
        // La inversión permanente queda eliminada
        const inversionRow = sheet.locator('tr', { hasText: 'Inversiones permanentes' }).first()
        await expect(inversionRow).toContainText('310.400,00')
        // Los saldos recíprocos quedan en cero
        const otrosCreditos = sheet.locator('tr', { hasText: 'Otros créditos' }).first()
        await expect(otrosCreditos).toContainText('(200.000,00)')

        // Detalle de una línea: entidades, cuentas y fundamento de la eliminación
        await sheet.getByRole('button', { name: /Bienes de cambio/ }).first().click()
        const detail = page.locator('.cons-detail')
        await expect(detail).toBeVisible()
        await expect(detail).toContainText('Litoral Holding S.A.')
        await expect(detail).toContainText('Iberá Distribuciones S.A.')
        await expect(detail).toContainText('Ganancia contenida en un activo que todavía está dentro del grupo')
        await detail.getByText('Ver el cálculo paso a paso').first().click()
        await expect(detail).toContainText(/Resultado NO trascendido/)
        await shot(page, '04-papel-de-trabajo-detalle')

        // ── 8. PNC y atribución del resultado ──
        await page.getByRole('tab', { name: 'Participación no controladora' }).click()
        await expect(page.getByText(/patrimonio de terceros dentro de las controladas/)).toBeVisible()
        const nciTable = page.locator('.cons-statement-table').first()
        await expect(nciTable).toContainText('406.000,00')   // PN de la controlada
        await expect(nciTable).toContainText('388.000,00')   // PN ajustado
        await expect(nciTable).toContainText('77.600,00')    // PNC al cierre
        await expect(nciTable).toContainText('15.600,00')    // resultado a la PNC
        await expect(page.getByText('186.400,00').first()).toBeVisible() // resultado a propietarios
        await shot(page, '05-participacion-no-controladora')

        // ── 9. Estados consolidados ──
        await page.getByRole('tab', { name: 'Estados consolidados' }).click()
        await expect(page.getByText(/Grupo Litoral — Estados contables consolidados/)).toBeVisible()
        const esp = page.locator('.cons-statement-table')
        await expect(esp).toContainText('Participación no controladora')
        await expect(esp).toContainText('1.289.000,00')  // PN total consolidado

        await page.getByRole('tab', { name: 'Resultados' }).click()
        await expect(page.locator('.cons-statement-table')).toContainText('202.000,00')

        await page.getByRole('tab', { name: 'Evolución del PN' }).click()
        await expect(page.locator('.cons-eepn')).toContainText('Saldos al inicio del ejercicio')
        await expect(page.locator('.cons-eepn')).toContainText('1.025.000,00')

        await page.getByRole('tab', { name: 'Flujo de efectivo' }).click()
        await expect(page.getByText('Efectivo al cierre del ejercicio')).toBeVisible()
        await expect(page.getByText(/Desembolso del préstamo intragrupo/)).toBeVisible()

        await page.getByRole('tab', { name: 'Notas' }).click()
        await expect(page.getByText('Bases de consolidación')).toBeVisible()
        await expect(page.getByText(/NO constituye una deuda del grupo/)).toBeVisible()
        await shot(page, '06-estados-consolidados-notas')
    })

    test('10. exporta el libro de trabajo y el juego completo', async ({ page }) => {
        await openConsolidation(page)
        await page.getByRole('tab', { name: 'Estados consolidados' }).click()

        const xlsxPromise = page.waitForEvent('download', { timeout: 120_000 })
        await page.getByRole('button', { name: /Libro de trabajo \(Excel\)/i }).click()
        const xlsx = await xlsxPromise
        const xlsxPath = path.join(EXPORTS, 'consolidacion-grupo-litoral.xlsx')
        await xlsx.saveAs(xlsxPath)
        expect(fs.statSync(xlsxPath).size).toBeGreaterThan(10_000)

        const pdfPromise = page.waitForEvent('download', { timeout: 120_000 })
        await page.getByRole('button', { name: /Juego completo \(PDF\)/i }).click()
        const pdf = await pdfPromise
        const pdfPath = path.join(EXPORTS, 'estados-consolidados-grupo-litoral.pdf')
        await pdf.saveAs(pdfPath)
        expect(fs.statSync(pdfPath).size).toBeGreaterThan(10_000)
    })

    test('el comparativo cambia el ejercicio y el EEPN queda sin saldo inicial', async ({ page }) => {
        await openConsolidation(page)
        // El ejercicio 2024 no tiene consolidación anterior vinculada
        const ejercicio = page.locator('.cons-field select').nth(1)
        const value2024 = await ejercicio.locator('option', { hasText: 'Consolidado 2024' }).getAttribute('value')
        await ejercicio.selectOption(value2024!)
        await page.getByRole('tab', { name: 'Estados consolidados' }).click()
        await page.getByRole('tab', { name: 'Evolución del PN' }).click()
        await expect(page.getByText(/Información insuficiente/).first()).toBeVisible()
        await expect(page.getByText(/no puede determinarse y no se estima/)).toBeVisible()
    })
})

test.describe('Fase 2K — móvil', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('la navegación no se rompe y la hoja se recorre en horizontal', async ({ page }) => {
        await openConsolidation(page)
        await expect(page.getByRole('heading', { name: 'Consolidación del grupo' })).toBeVisible()

        await page.getByRole('tab', { name: 'Papel de trabajo' }).click()
        const container = page.locator('.cons-table-container').first()
        await expect(container).toBeVisible()

        // La grilla se desborda a lo ancho pero DENTRO de su contenedor
        const overflow = await container.evaluate(el => el.scrollWidth > el.clientWidth)
        expect(overflow).toBe(true)

        // ...y la página NO ensancha el documento. Si lo hiciera, el navegador
        // expandiría el viewport de layout y el encabezado y la barra inferior
        // —que son `position: fixed`— se estirarían: la navegación se rompe.
        const docWidth = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
        }))
        expect(docWidth.scroll).toBeLessThanOrEqual(docWidth.client + 1)

        // La navegación sigue operativa: se puede volver a otra sección
        await page.getByRole('tab', { name: 'Resumen del grupo' }).click()
        await expect(page.getByText('Estructura del grupo')).toBeVisible()

        await shot(page, '07-movil-papel-de-trabajo')
    })
})
