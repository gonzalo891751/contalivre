/**
 * Fase 2H (§H12) — Aceptación E2E de lo incorporado en esta fase.
 *
 * Cubre los casos que el pedido enumera y que no estaban en las suites previas:
 * controles segmentados en todas las vistas, empresa vacía sin importes
 * fantasma, activación idempotente de los perfiles sectoriales, distribución de
 * gastos por porcentaje y por base, y anexos siempre navegables.
 *
 * Corre en chromium-desktop y firefox-desktop; los casos de layout chico viven
 * en mobile.spec.
 */

import { test, expect, type Page } from '@playwright/test'
import { evidence2g, gotoEstados, loadRcDataset, openEstadosTab, pinPeriod2025 } from './helpers'

/** Una empresa recién inicializada, sin dataset ni asientos. */
async function gotoEmptyCompany(page: Page): Promise<void> {
    await pinPeriod2025(page)
    await page.goto('/operaciones')
}

test.describe('Fase 2H — controles segmentados', () => {
    // Los conmutadores sólo tienen sentido con estados calculados: se usa el
    // dataset RC, el mismo de las suites anteriores.
    test.beforeEach(async ({ page }) => {
        await pinPeriod2025(page)
        await loadRcDataset(page)
    })

    test('el conmutador del EFE conserva su diseño al pasar a Preparación', async ({ page }) => {
        await gotoEstados(page)
        await openEstadosTab(page, 'Flujo de Efectivo')

        const vista = page.getByRole('radiogroup', { name: 'Vista' })
        await expect(vista).toBeVisible()

        // En Exposición los botones son controles reales, no texto suelto.
        const exposicion = vista.getByRole('radio', { name: 'Exposición', exact: true })
        const preparacion = vista.getByRole('radio', { name: 'Preparación', exact: true })
        await expect(exposicion).toHaveAttribute('aria-checked', 'true')

        // El radiogroup ES el track del control: si el CSS se pierde, deja de
        // tener borde y radio y los botones quedan como texto plano.
        await expect(vista).toHaveCSS('border-style', 'solid')
        await expect(vista).toHaveCSS('border-radius', '10px')

        await preparacion.click()
        await expect(preparacion).toHaveAttribute('aria-checked', 'true')

        // Y en Preparación el control SIGUE siendo un control segmentado.
        await expect(vista).toHaveCSS('border-style', 'solid')
        await expect(vista).toHaveCSS('border-radius', '10px')
        await expect(vista.getByRole('radio', { name: 'Exposición', exact: true })).toBeVisible()

        await evidence2g(page, '2h-efe-preparacion-segmentado')

        // Vuelta a Exposición.
        await exposicion.click()
        await expect(exposicion).toHaveAttribute('aria-checked', 'true')
    })

    test('el conmutador del EEPN sobrevive a la vista resumida', async ({ page }) => {
        await gotoEstados(page)
        await openEstadosTab(page, 'Evolución PN')

        const vista = page.getByRole('radiogroup', { name: 'Vista del EEPN' })
        const resumida = vista.getByRole('radio', { name: 'Vista resumida' })
        const matricial = vista.getByRole('radio', { name: 'Vista matricial' })

        await resumida.click()
        await expect(resumida).toHaveAttribute('aria-checked', 'true')
        // Era el caso roto: al desmontarse la matriz desaparecía el CSS.
        await expect(vista).toHaveCSS('border-style', 'solid')
        await expect(vista).toHaveCSS('border-radius', '10px')
        await expect(matricial).toBeVisible()

        await evidence2g(page, '2h-eepn-resumida-segmentado')

        await matricial.click()
        await expect(matricial).toHaveAttribute('aria-checked', 'true')
    })

    test('los controles segmentados se manejan con el teclado', async ({ page }) => {
        await gotoEstados(page)
        await openEstadosTab(page, 'Flujo de Efectivo')

        const metodo = page.getByRole('radiogroup', { name: 'Método' })
        // exact: true — "Directo" también sería subcadena de "Indirecto".
        const directo = metodo.getByRole('radio', { name: 'Directo', exact: true })
        await directo.focus()
        await page.keyboard.press('ArrowRight')

        await expect(metodo.getByRole('radio', { name: 'Indirecto', exact: true }))
            .toHaveAttribute('aria-checked', 'true')
    })
})

test.describe('Fase 2H — empresa vacía', () => {
    test('Operaciones no muestra importes fantasma ni vencimientos inventados', async ({ page }) => {
        await gotoEmptyCompany(page)

        await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible({ timeout: 30_000 })

        const body = page.locator('body')
        await expect(body).not.toContainText('320.000')
        await expect(body).not.toContainText('Vencimientos')
        // El cero se expresa de forma uniforme: nunca "-$ 0,00".
        await expect(body).not.toContainText('-$ 0,00')

        // Y se explica por qué todo está en cero.
        await expect(page.getByText('todavía no tiene asientos contabilizados')).toBeVisible()

        await evidence2g(page, '2h-operaciones-empresa-vacia')
    })

    test('los anexos son navegables aunque no haya datos', async ({ page }) => {
        await pinPeriod2025(page)
        await gotoEstados(page)
        await openEstadosTab(page, 'Notas y Anexos')

        // Ninguna subpestaña puede estar deshabilitada (era el bug).
        const subtabs = page.locator('.note-subtab')
        const count = await subtabs.count()
        expect(count).toBe(5)
        for (let i = 0; i < count; i++) {
            await expect(subtabs.nth(i)).toBeEnabled()
        }

        // Moneda extranjera abre y explica el estado vacío o muestra el cuadro.
        await subtabs.filter({ hasText: 'Moneda extranjera' }).click()
        await expect(
            page.getByText(/No hay partidas en moneda extranjera|Total activos en moneda extranjera/)
        ).toBeVisible()

        await evidence2g(page, '2h-anexos-navegables')
    })
})

test.describe('Fase 2H — perfiles sectoriales', () => {
    test('activar el perfil agropecuario es idempotente', async ({ page }) => {
        await pinPeriod2025(page)
        await page.goto('/configuracion?seccion=plan-cuentas')

        const panel = page.getByRole('region', { name: /Perfiles de actividad/ })
            .or(page.locator('section').filter({ hasText: 'Perfiles de actividad' }).first())
        await expect(panel.first()).toBeVisible({ timeout: 30_000 })

        const fila = page.locator('li').filter({ hasText: 'Agropecuaria' }).first()
        await fila.getByRole('button', { name: 'Activar' }).click()

        await expect(page.getByText(/Se incorporaron \d+ cuentas del perfil Agropecuaria/)).toBeVisible({ timeout: 30_000 })

        // Segunda activación: no debe duplicar nada.
        await fila.getByRole('button', { name: 'Desactivar' }).click()
        await fila.getByRole('button', { name: 'Activar' }).click()
        await expect(page.getByText(/ya tenía todas sus cuentas en el plan; no se duplicó ninguna/)).toBeVisible({ timeout: 30_000 })

        await evidence2g(page, '2h-perfil-agro-idempotente')
    })

    test('el perfil sin fines de lucro cambia la exposición del estado', async ({ page }) => {
        await pinPeriod2025(page)
        await page.goto('/configuracion?seccion=plan-cuentas')

        const fila = page.locator('li').filter({ hasText: 'Entidad sin fines de lucro' }).first()
        await expect(fila).toBeVisible({ timeout: 30_000 })
        await fila.getByRole('button', { name: 'Activar' }).click()
        await expect(page.getByText(/perfil Entidad sin fines de lucro/)).toBeVisible({ timeout: 30_000 })

        await gotoEstados(page)
        await openEstadosTab(page, 'Resultados')

        // El mismo motor, distinta denominación.
        await expect(page.getByText('Estado de Recursos y Gastos')).toBeVisible({ timeout: 30_000 })
        await evidence2g(page, '2h-ong-recursos-y-gastos')
    })
})

test.describe('Fase 2H — distribución de gastos', () => {
    test('el editor permite porcentaje manual y base por inductor', async ({ page }) => {
        await pinPeriod2025(page)
        await page.goto('/configuracion?seccion=plan-cuentas')

        const editor = page.getByTestId('allocation-editor')
        await expect(editor).toBeVisible({ timeout: 30_000 })

        // Elegir una cuenta de gasto cualquiera del plan.
        const account = editor.getByTestId('alloc-account')
        await account.selectOption({ index: 1 })

        // Base por defecto: porcentaje manual, con el control al 100 %.
        const basis = editor.getByTestId('alloc-basis')
        await expect(basis).toBeVisible()
        await expect(editor.getByTestId('alloc-sum')).toContainText('100,00 %')

        // Cambiar a distribución por empleados: aparecen los inductores.
        await basis.selectOption('EMPLOYEES')
        await editor.getByTestId('alloc-driver-ADMINISTRATION').fill('3')
        await editor.getByTestId('alloc-driver-SELLING').fill('1')

        // 3 y 1 ⇒ 75 % y 25 %, y el total sigue siendo exactamente 100 %.
        await expect(editor.getByTestId('alloc-sum')).toContainText('100,00 %')
        await expect(editor).toContainText('75.00 %')
        await expect(editor).toContainText('25.00 %')

        await evidence2g(page, '2h-gastos-base-empleados')
    })

    test('el anexo de gastos ofrece vista de preparación con la base aplicada', async ({ page }) => {
        // Con el dataset RC hay gastos reales y una regla 60/40 sobre alquileres.
        await pinPeriod2025(page)
        await loadRcDataset(page)
        await gotoEstados(page)
        await openEstadosTab(page, 'Notas y Anexos')

        await page.locator('.note-subtab').filter({ hasText: 'Gastos por función' }).click()

        const vista = page.getByRole('radiogroup', { name: 'Vista del anexo' })
        await expect(vista).toBeVisible({ timeout: 30_000 })
        await vista.getByRole('radio', { name: 'Preparación', exact: true }).click()

        // El papel de trabajo muestra base, porcentaje e importe por asignación.
        await expect(page.getByRole('columnheader', { name: 'Valor de la base' })).toBeVisible()
        await expect(page.getByRole('columnheader', { name: 'Porcentaje' })).toBeVisible()
        await expect(page.getByText('no modifica el asiento')).toBeVisible()

        // La regla 60/40 del dataset RC aparece con su reparto.
        await expect(page.getByText('60.00 %').first()).toBeVisible()
        await expect(page.getByText('40.00 %').first()).toBeVisible()

        await evidence2g(page, '2h-gastos-preparacion')
    })
})
