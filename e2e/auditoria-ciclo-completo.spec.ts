/**
 * Auditoría E2E del ciclo contable completo — Purmamarca Comercial S.A. 2025.
 *
 * Recorre la aplicación como lo haría quien lleva la contabilidad: ficha de la
 * empresa, ejercicio, índices oficiales, carga del año por el importador del
 * Libro Diario, revisión de libros y estados, pre-cierre, refundición, cierre y
 * apertura del ejercicio siguiente.
 *
 * Produce, además de las aserciones:
 *  - docs/auditoria/evidencia/*.png       capturas de cada pantalla relevante
 *  - docs/auditoria/checkpoints/checkpoint-a-pre-cierre.json
 *  - docs/auditoria/checkpoints/checkpoint-b-cierre-y-apertura.json
 *
 * Los dos checkpoints son respaldos restaurables desde Configuración → Respaldo.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DATA = path.join(ROOT, 'docs', 'auditoria', 'datos')
const EVIDENCE = path.join(ROOT, 'docs', 'auditoria', 'evidencia')
const CHECKPOINTS = path.join(ROOT, 'docs', 'auditoria', 'checkpoints')

for (const dir of [EVIDENCE, CHECKPOINTS]) fs.mkdirSync(dir, { recursive: true })

const ASIENTOS_CSV = path.join(DATA, 'asientos-purmamarca-2025.csv')
const INDICES_CSV = path.join(DATA, 'indices-ipc-2024-2025.csv')
const ESPERADO = JSON.parse(fs.readFileSync(path.join(DATA, 'esperado-2025.json'), 'utf-8'))

const EMPRESA = 'Purmamarca Comercial S.A. — Auditoría E2E'
const FUENTE_INDICES =
    'INDEC — IPC Nacional Nivel General, base diciembre 2016 = 100 ' +
    '(serie 145.3_INGNACNAL_DICI_M_15, portal datos.gob.ar)'

async function shot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true })
}

/** Exporta el respaldo íntegro usando el mismo servicio que la pantalla de Respaldo */
async function saveCheckpoint(page: Page, file: string): Promise<Record<string, number>> {
    const backup = await page.evaluate(async () => {
        const mod = await import('/src/accounting/backup/backupService.ts')
        return mod.exportBackup()
    })
    fs.writeFileSync(path.join(CHECKPOINTS, file), JSON.stringify(backup, null, 2), 'utf-8')
    return (backup as { checksums: { tableCounts: Record<string, number> } }).checksums.tableCounts
}

/** Texto plano de la pantalla, para localizar cifras sin depender del maquetado */
async function screenText(page: Page): Promise<string> {
    const main = page.locator('main').first()
    await expect(main).not.toContainText('Cargando aplicacion', { timeout: 30_000 })
    // Los importes usan espacio duro (U+00A0) entre el signo y el número
    const NBSP = String.fromCharCode(0xa0)
    return (await main.innerText()).split(NBSP).join(' ')
}

/** Las solapas de Estados se exponen como tab, no como botón */
async function abrirSolapa(page: Page, nombre: string): Promise<void> {
    await page.getByRole('tab', { name: nombre, exact: false }).first().click()
    await page.waitForTimeout(500)
}

async function esperarBalance(page: Page): Promise<string> {
    await page.goto('/balance')
    await expect(page.getByText('El balance cuadra perfectamente')).toBeVisible({ timeout: 30_000 })
    return screenText(page)
}

test.describe.configure({ mode: 'serial' })

/**
 * Un único contexto para todo el recorrido: la contabilidad vive en IndexedDB
 * y el ejercicio se construye paso a paso, igual que lo haría una persona.
 */
test.describe('Auditoría del ciclo contable completo', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
        page = await context.newPage()
        await page.addInitScript(() => {
            localStorage.setItem('contalivre_period_year',
                JSON.stringify({ year: 2025, start: '2025-01-01', end: '2025-12-31' }))
        })
    })

    test.afterAll(async () => { await page?.context().close() })

    test('1 · configuración de la empresa y del ejercicio', async () => {
        await page.goto('/')
        await page.getByRole('button', { name: 'Configurar ficha ahora' }).click()

        await page.getByPlaceholder('Ej: Tech Solutions S.R.L.').fill(EMPRESA)
        await page.getByPlaceholder('30-12345678-9').fill('30-71234567-4')
        await page.getByPlaceholder('Ej: Servicios de informática').fill('Compraventa mayorista de mercaderías')
        await page.getByPlaceholder('Calle, Altura, Localidad').fill('Av. Belgrano 1234, San Salvador de Jujuy')
        const fechas = page.locator('.cp-modal-panel input[type=date]')
        await fechas.nth(0).fill('2025-01-01')
        await fechas.nth(1).fill('2025-12-31')
        await page.getByRole('button', { name: 'Guardar Cambios' }).click()

        await expect(page.getByText(EMPRESA).first()).toBeVisible()
        await expect(page.getByText('01/01/2025 al 31/12/2025')).toBeVisible()
        await shot(page, '01-ficha-empresa')
    })

    test('2 · registro de la serie oficial de índices', async () => {
        await page.goto('/configuracion?seccion=inflacion')
        await expect(page.getByTestId('indices-oficiales-panel')).toBeVisible()

        await page.getByTestId('indices-name').fill('IPC Nacional Nivel General — dic-2024 a dic-2025')
        await page.getByTestId('indices-status').selectOption('OFFICIAL')
        await page.getByTestId('indices-source').fill(FUENTE_INDICES)
        await page.getByTestId('indices-source-url')
            .fill('https://apis.datos.gob.ar/series/api/series/?ids=145.3_INGNACNAL_DICI_M_15')
        await page.getByTestId('indices-series').fill(fs.readFileSync(INDICES_CSV, 'utf-8'))

        await expect(page.getByText('13 períodos leídos: 2024-12 → 2025-12')).toBeVisible()
        await page.getByTestId('indices-save').click()

        await expect(page.getByText(/Se registró .* con 13 períodos/)).toBeVisible()
        await expect(page.getByText('2024-12 → 2025-12 (13)')).toBeVisible()
        await shot(page, '02-indices-oficiales')
    })

    test('3 · carga del ejercicio por el importador del Libro Diario', async () => {
        await page.goto('/asientos')
        await page.getByRole('button', { name: 'Importar' }).click()

        await page.locator('input[type=file][accept*=".csv"]').setInputFiles(ASIENTOS_CSV)
        await expect(page.getByText('asientos-purmamarca-2025.csv')).toBeVisible()
        await page.getByRole('button', { name: /Siguiente paso/ }).click()

        // El automapeo asigna "cuenta_codigo" también a Cuenta Nombre: se corrige
        const selects = page.locator('.climpOverlay select')
        await selects.nth(5).selectOption('cuenta_nombre')
        await page.getByRole('button', { name: /Siguiente paso/ }).click()

        await expect(page.getByText('Todas las cuentas coinciden')).toBeVisible()
        await page.getByRole('button', { name: /Siguiente paso/ }).click()

        await expect(page.getByText('Asientos detectados: 95')).toBeVisible()
        await expect(page.getByText('Líneas totales: 300')).toBeVisible()
        await shot(page, '03-import-confirmacion')

        await page.getByRole('button', { name: 'Confirmar importación' }).click()
        await expect(page.locator('.climpOverlay')).toHaveCount(0, { timeout: 180_000 })

        await page.goto('/asientos')
        await expect(page.getByText('0095').first()).toBeVisible({ timeout: 30_000 })
        await shot(page, '04-libro-diario')
    })

    test('4 · el balance de sumas y saldos cuadra con la matriz esperada', async () => {
        const text = await esperarBalance(page)

        // Total Debe = Total Haber = 460.158.600,00
        expect(text).toContain('$460.158.600,00')
        // Saldos clave del caso
        expect(text).toContain('$28.989.200,00')   // Banco c/c ARS
        expect(text).toContain('$16.100.000,00')   // Mercaderías
        expect(text).toContain('$11.939.100,00')   // Deudores por ventas
        expect(text).toContain('$5.912.000,00')    // Proveedores
        expect(text).toContain('$9.000.000,00')    // Préstamos bancarios
        await shot(page, '05-balance-sumas-y-saldos')
    })

    test('5 · los estados contables concilian y la compuerta de publicación pasa', async () => {
        await page.goto('/estados')
        await expect(page.getByRole('button', { name: 'Exportar estados' })).toBeVisible({ timeout: 30_000 })

        // Moneda de cierre disponible gracias al set registrado
        const select = page.getByTestId('inflation-set-select')
        const value = await select.locator('option').nth(1).getAttribute('value')
        await select.selectOption(value!)

        await expect(page.getByRole('button', { name: /Estados conciliados/ })).toBeVisible({ timeout: 30_000 })

        const esp = await screenText(page)
        expect(esp).toContain('$ 69.327.300,00')   // Activo = Pasivo + PN
        expect(esp).toContain('$ 61.927.300,00')   // Activo corriente
        expect(esp).toContain('$ 42.863.500,00')   // Patrimonio neto
        await shot(page, '06-estado-situacion-patrimonial')

        await abrirSolapa(page, 'Resultados')
        const er = await screenText(page)
        expect(er).toContain('$ 86.610.000,00')    // ingresos por ventas
        expect(er).toContain('$ 35.500.000,00')    // costo de ventas
        expect(er).toContain('$ 12.863.500,00')    // resultado del ejercicio
        await shot(page, '07-estado-de-resultados')

        await abrirSolapa(page, 'Flujo de Efectivo')
        const efe = await screenText(page)
        expect(efe).toContain('$ 29.168.200,00')   // variación neta = efectivo al cierre
        await shot(page, '08-flujo-de-efectivo')

        await abrirSolapa(page, 'Evolución PN')
        const eepn = await screenText(page)
        expect(eepn).toContain('42.863.500,00')
        await shot(page, '09-evolucion-patrimonio-neto')

        await abrirSolapa(page, 'Notas y Anexos')
        await shot(page, '10-notas-y-anexos')
    })

    test('5 bis · Fase 2I — cobertura de cuentas, RECPAM dual y bienes de uso', async () => {
        await page.goto('/configuracion?seccion=inflacion')
        await expect(page.getByTestId('matriz-cobertura-panel')).toBeVisible({ timeout: 30_000 })

        // §2: el 100 % de las cuentas con actividad tiene tratamiento declarado
        await expect(page.getByTestId('matriz-cobertura-pct')).toHaveText('100.00 %', { timeout: 30_000 })
        await expect(page.getByTestId('matriz-pendientes')).toHaveCount(0)

        // §7: las dos determinaciones del RECPAM concilian
        await expect(page.getByTestId('recpam-secuencial')).toHaveText('-4.432.331,94')
        await expect(page.getByTestId('recpam-analitico')).toHaveText('-4.432.331,92')
        await expect(page.getByTestId('recpam-diferencia')).toHaveText('-0,02')
        await shot(page, '17-matriz-cobertura-y-recpam')

        // §9: el anexo de bienes de uso en moneda de cierre, corregido
        await page.goto('/estados')
        await expect(page.getByRole('button', { name: 'Exportar estados' })).toBeVisible({ timeout: 30_000 })
        const select = page.getByTestId('inflation-set-select')
        await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!)
        await abrirSolapa(page, 'Notas y Anexos')
        await abrirSolapa(page, 'Bienes de uso')
        // Los controles segmentados son radiogroups accesibles (Fase 2H)
        await page.getByTestId('ppe-expresion')
            .getByRole('radio', { name: 'Moneda de cierre', exact: true }).click()
        await page.waitForTimeout(600)

        const anexo = await screenText(page)
        expect(anexo).toContain('11.492.722,37')   // valor de origen reexpresado
        expect(anexo).toContain('2.029.064,42')    // depreciación reexpresada
        expect(anexo).toContain('9.463.657,95')    // valor residual corregido
        expect(anexo).not.toContain('10.726.577,61')
        expect(anexo).not.toContain('Sin clase asignada')
        await shot(page, '18-bienes-de-uso-moneda-de-cierre')
    })

    test('5 ter · Fase 2I — el EFE clasifica las disposiciones y el pago diferido', async () => {
        await page.goto('/estados')
        await expect(page.getByRole('button', { name: 'Exportar estados' })).toBeVisible({ timeout: 30_000 })
        await abrirSolapa(page, 'Flujo de Efectivo')

        const efe = await screenText(page)
        // DEF-A06: la ganancia por la venta ya no es un cobro operativo
        expect(efe).not.toContain('Cobros por otros ingresos operativos')
        // DEF-A07: el pago de la compra a crédito salió del operativo
        expect(efe).toContain('$ 4.850.200,00')     // operativo
        expect(efe).toContain('-$ 12.282.000,00')   // inversión
        expect(efe).toContain('$ 29.168.200,00')    // variación neta, sin cambios
        await shot(page, '19-efe-disposiciones-clasificadas')

        // Los ajustes del método indirecto se declaran extracontables
        await page.getByRole('radio', { name: 'Indirecto', exact: true }).click()
        await page.waitForTimeout(600)
        expect(await screenText(page)).toContain('No afecta el Libro Diario')
        await shot(page, '20-efe-indirecto-extracontable')
    })

    test('6 · CHECKPOINT A — estado completo antes de la refundición', async () => {
        await page.goto('/configuracion?seccion=ejercicios')
        const fila = page.locator('.cfg-content tbody tr').first()
        await expect(fila).toContainText('Ejercicio 2025')
        await expect(fila).toContainText('Abierto')

        await page.getByRole('button', { name: 'Cierre…' }).click()
        const panel = page.getByTestId('cierre-panel')
        await expect(panel).toBeVisible()
        await expect(panel).toContainText('Ganancia del ejercicio')
        await expect(panel).toContainText('$ 12.863.500,00')
        await expect(page.getByTestId('cierre-blockers')).toHaveCount(0)
        await shot(page, '11-checkpoint-a-vista-previa-de-cierre')

        const counts = await saveCheckpoint(page, 'checkpoint-a-pre-cierre.json')
        expect(counts.entries).toBe(95)
        expect(counts.inflationIndexSets).toBe(1)
        expect(counts.exercises).toBe(1)
    })

    test('7 · refundición en borrador, cierre y protección del ejercicio', async () => {
        await page.goto('/configuracion?seccion=ejercicios')
        await page.getByRole('button', { name: 'Cierre…' }).click()

        await page.getByTestId('cierre-drafts').click()
        await expect(page.getByText(/asiento\(s\) de refundición EN BORRADOR/)).toBeVisible({ timeout: 30_000 })
        await shot(page, '12-refundicion-en-borrador')

        // Los borradores no tocan los libros: el balance sigue igual
        expect(await esperarBalance(page)).toContain('$460.158.600,00')

        await page.goto('/configuracion?seccion=ejercicios')
        await page.getByRole('button', { name: 'Cierre…' }).click()
        await page.getByTestId('cierre-post').click()
        await page.getByTestId('cierre-post-confirm').click()
        await expect(page.getByText(/Cierre contabilizado/)).toBeVisible({ timeout: 60_000 })
        await shot(page, '13-cierre-contabilizado')

        await expect(page.locator('.cfg-content tbody tr').first()).toContainText('Cerrado')

        // Idempotencia: reabrir el panel ya no ofrece contabilizar y nada se duplica
        const antes = await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            return db.entries.count()
        })
        await page.reload()
        await page.getByRole('button', { name: 'Cierre…' }).click()
        await expect(page.getByTestId('cierre-opening')).toBeVisible()
        await expect(page.getByTestId('cierre-post')).toHaveCount(0)
        const despues = await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            return db.entries.count()
        })
        expect(despues).toBe(antes)
    })

    test('8 · las cuentas de resultado quedan saldadas y el patrimonio se conserva', async () => {
        await esperarBalance(page)

        const saldos = await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            const [entries, accounts] = await Promise.all([db.entries.toArray(), db.accounts.toArray()])
            const byId = new Map(accounts.map(a => [a.id, a]))
            const netos = new Map<string, number>()
            for (const e of entries) {
                if (e.status === 'DRAFT') continue
                if (e.date < '2025-01-01' || e.date > '2025-12-31') continue
                for (const l of e.lines) {
                    const cents = Math.round((l.debit || 0) * 100) - Math.round((l.credit || 0) * 100)
                    netos.set(l.accountId, (netos.get(l.accountId) ?? 0) + cents)
                }
            }
            let resultado = 0, patrimonio = 0
            for (const [id, cents] of netos) {
                const kind = byId.get(id)?.kind
                if (kind === 'INCOME' || kind === 'EXPENSE') resultado += Math.abs(cents)
                if (kind === 'EQUITY') patrimonio += -cents
            }
            return { resultadoAbs: resultado / 100, patrimonio: patrimonio / 100 }
        })

        // Invariante 19: ninguna cuenta de resultado conserva saldo
        expect(saldos.resultadoAbs).toBe(0)
        // Invariante 20: el patrimonio no desaparece; ahora incluye el resultado
        expect(saldos.patrimonio).toBe(ESPERADO.patrimonioNeto)
        await shot(page, '14-balance-post-refundicion')
    })

    test('9 · apertura del ejercicio siguiente sin arrastrar cuentas nominales', async () => {
        await page.goto('/configuracion?seccion=ejercicios')
        await page.getByRole('button', { name: 'Cierre…' }).click()
        await page.getByTestId('cierre-opening').click()
        await expect(page.getByText(/Apertura generada/)).toBeVisible({ timeout: 60_000 })
        await shot(page, '15-apertura-generada')

        const apertura = await page.evaluate(async () => {
            const { db } = await import('/src/storage/db.ts')
            const [entries, accounts] = await Promise.all([db.entries.toArray(), db.accounts.toArray()])
            const byId = new Map(accounts.map(a => [a.id, a]))
            const ap = entries.filter(e => e.sourceType === 'apertura' && e.status !== 'DRAFT')
            const lines = ap.flatMap(e => e.lines)
            return {
                asientos: ap.length,
                fecha: ap[0]?.date,
                debe: lines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0) / 100,
                haber: lines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0) / 100,
                kinds: [...new Set(lines.map(l => byId.get(l.accountId)?.kind))],
            }
        })

        expect(apertura.asientos).toBe(1)                 // sin apertura duplicada
        expect(apertura.fecha).toBe('2026-01-01')
        expect(apertura.debe).toBe(apertura.haber)
        // Invariante 21: sin cuentas nominales en la apertura
        expect(apertura.kinds.sort()).toEqual(['ASSET', 'EQUITY', 'LIABILITY'])

        const counts = await saveCheckpoint(page, 'checkpoint-b-cierre-y-apertura.json')
        expect(counts.entries).toBeGreaterThan(95)
    })

    test('10 · el ejercicio cerrado queda protegido y sigue consultable', async () => {
        const rechazo = await page.evaluate(async () => {
            const { postNewEntry } = await import('/src/accounting/application/journalService.ts')
            const { db } = await import('/src/storage/db.ts')
            const accounts = await db.accounts.toArray()
            const banco = accounts.find(a => a.code === '1.1.01.02')!
            const ventas = accounts.find(a => a.code === '4.1.01')!
            try {
                await postNewEntry({
                    date: '2025-12-30', memo: 'intento posterior al cierre',
                    lines: [
                        { accountId: banco.id, debit: 100, credit: 0 },
                        { accountId: ventas.id, debit: 0, credit: 100 },
                    ],
                })
                return 'ACEPTADO'
            } catch (e) {
                return e instanceof Error ? e.message : String(e)
            }
        })
        expect(rechazo).not.toBe('ACEPTADO')
        expect(rechazo).toMatch(/cerrad/i)

        // El ejercicio cerrado sigue siendo consultable
        await esperarBalance(page)
        await shot(page, '16-ejercicio-cerrado-protegido')
    })
})
