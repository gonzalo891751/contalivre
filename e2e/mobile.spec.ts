/**
 * Fase 2F (§6.1/§6.3) — Aceptación visual móvil 390×844.
 * EEPN por movimiento, EFE apilado y notas como tarjetas.
 */

import { test, expect } from '@playwright/test'
import { evidence, evidence2g, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

test.describe('Aceptación visual — móvil 390×844', () => {
    test('estados en móvil con el dataset RC', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)

        await evidence(page, 'esp-movil-390')

        await openEstadosTab(page, 'Resultados')
        await evidence(page, 'er-movil-390')

        // EEPN móvil: selector de movimiento + tarjeta por componente
        await openEstadosTab(page, 'Evolución PN')
        const select = page.locator('#eqm-mobile-select')
        await expect(select).toBeVisible()
        await select.selectOption({ label: 'Aportes de los propietarios' })
        await expect(page.getByText('Total del movimiento')).toBeVisible()
        await evidence(page, 'eepn-movil-aportes-390')
        await select.selectOption({ label: 'Saldos al cierre' })
        await evidence(page, 'eepn-movil-cierre-390')

        await openEstadosTab(page, 'Flujo de Efectivo')
        await evidence(page, 'efe-movil-390')

        // Fase 2G (§12.7/§18F): Preparación en móvil usa tarjetas, sin recorte.
        await page.getByRole('radio', { name: 'Preparación', exact: true }).click()
        await expect(page.getByRole('heading', { name: /Cómo se construye/ })).toBeVisible()
        // La tabla de escritorio está oculta; se muestran tarjetas por cuenta
        await expect(page.locator('.prep-card').first()).toBeVisible()
        // Aserción geométrica: sin overflow horizontal de página (viewport 390)
        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
        await evidence2g(page, 'preparacion-movil-390')

        await openEstadosTab(page, 'Notas y Anexos')
        await evidence(page, 'notas-movil-390')

        await page.getByRole('tab', { name: 'Costo de ventas' }).click()
        await evidence(page, 'cmv-movil-390')
    })
})

/**
 * Fase 2H (cierre del PR #28) — Escenarios móviles de las áreas que tocó la fase.
 *
 * No se duplica toda la matriz de escritorio: se cubren las tres zonas
 * modificadas, con aserciones geométricas reales (sin desborde horizontal de
 * página y controles dentro del viewport), no sólo capturas.
 */
test.describe('Fase 2H — móvil 390×844', () => {
    /** El documento no puede desbordar horizontalmente en 390 px. */
    async function expectNoPageOverflow(page: import('@playwright/test').Page) {
        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
    }

    /** Ningún elemento del locator puede quedar fuera del viewport. */
    async function expectInsideViewport(locator: import('@playwright/test').Locator) {
        const box = await locator.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(-1)
        expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    }

    test('A — EFE en Preparación conserva los controles segmentados', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        await openEstadosTab(page, 'Flujo de Efectivo')

        const vista = page.getByRole('radiogroup', { name: 'Vista' })
        await expect(vista).toBeVisible()
        // El control conserva su caja también en móvil: nada de texto plano.
        await expect(vista).toHaveCSS('border-style', 'solid')
        await expectInsideViewport(vista)

        await vista.getByRole('radio', { name: 'Preparación', exact: true }).click()
        await expect(vista.getByRole('radio', { name: 'Preparación', exact: true }))
            .toHaveAttribute('aria-checked', 'true')
        await expect(vista).toHaveCSS('border-style', 'solid')

        // El conmutador de expresión de 2G.1 también es accesible en móvil.
        const expresion = page.getByRole('radiogroup', { name: 'Expresión' })
        await expect(expresion).toBeVisible()
        await expectInsideViewport(expresion)

        await expectNoPageOverflow(page)
        await evidence2g(page, '2h-movil-efe-preparacion')
    })

    test('B — Operaciones con ejercicio vacío se apila y no inventa importes', async ({ page }) => {
        await pinPeriod2025(page)
        await page.goto('/operaciones')
        await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible({ timeout: 30_000 })

        const body = page.locator('body')
        await expect(body).not.toContainText('320.000')
        await expect(body).not.toContainText('Vencimientos')
        await expect(body).not.toContainText('-$ 0,00')
        await expect(page.getByText('todavía no tiene asientos contabilizados')).toBeVisible()

        // Tarjetas apiladas en una sola columna: todas comparten el mismo x.
        const cards = page.getByRole('link', { name: /Abrir módulo/ })
        const count = await cards.count()
        expect(count).toBeGreaterThanOrEqual(8)
        const firstBox = await cards.first().boundingBox()
        const secondBox = await cards.nth(1).boundingBox()
        expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThanOrEqual(1)
        await expectInsideViewport(cards.first())

        await expectNoPageOverflow(page)
        // La evidencia se toma ANTES de navegar: si no, la captura muestra el
        // módulo destino cargando y no la portada que se quiere documentar.
        await evidence2g(page, '2h-movil-operaciones-vacia')

        // La navegación funciona: se entra a un módulo desde la portada.
        await cards.first().click()
        await expect(page).not.toHaveURL(/\/operaciones$/)
    })

    test('C — Notas y Anexos: las cinco pestañas son usables en móvil', async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        await openEstadosTab(page, 'Notas y Anexos')

        const subtabs = page.locator('.note-subtab')
        await expect(subtabs).toHaveCount(5)

        // Contenido propio de cada anexo. El de costo se dibuja con tarjetas, no
        // con una tabla, así que se verifica por su texto y no por el elemento.
        const annexes: { label: string; expect: RegExp }[] = [
            { label: 'Gastos por función', expect: /Total del anexo|sin función/i },
            { label: 'Costo de ventas', expect: /Existencia inicial|Costo de servicios|no aplica/i },
            { label: 'Bienes de uso', expect: /Valor residual|todavía no tiene información/i },
            { label: 'Moneda extranjera', expect: /Medición \(Diario\)|No hay partidas en moneda extranjera/i },
        ]

        for (const annex of annexes) {
            const tab = subtabs.filter({ hasText: annex.label })
            await expect(tab).toBeEnabled()
            await tab.click()
            await expect(tab).toHaveAttribute('aria-selected', 'true')

            // Muestra datos o su estado vacío explicativo, nunca una pantalla muda.
            await expect(page.getByText(annex.expect).first()).toBeVisible({ timeout: 15_000 })

            // Y la página nunca desborda: las tablas anchas scrollean adentro.
            await expectNoPageOverflow(page)
        }

        await evidence2g(page, '2h-movil-anexos')
    })
})
