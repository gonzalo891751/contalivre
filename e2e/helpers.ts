/**
 * Helpers E2E — Fase 2F. Carga del dataset RC, período fijo 2025 y utilidades
 * de captura de evidencia con nombres estables.
 */

import { expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const EVIDENCE_DIR = path.resolve(HERE, '..', 'docs', 'evidence', 'phase2f')
export const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, 'screenshots')
export const EXPORTS_DIR = path.join(EVIDENCE_DIR, 'exports')

/** Evidencia de la Fase 2G (§22) */
export const EVIDENCE_2G_DIR = path.resolve(HERE, '..', 'docs', 'evidence', 'phase2g')
export const SCREENSHOTS_2G_DIR = path.join(EVIDENCE_2G_DIR, 'screenshots')

for (const dir of [SCREENSHOTS_DIR, EXPORTS_DIR, SCREENSHOTS_2G_DIR]) fs.mkdirSync(dir, { recursive: true })

/** Captura de evidencia Fase 2G en docs/evidence/phase2g/screenshots */
export async function evidence2g(page: Page, name: string, fullPage = true): Promise<void> {
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(SCREENSHOTS_2G_DIR, `${name}.png`), fullPage })
}

/** Fija el período 2025 (dataset RC) ANTES de cargar la app */
export async function pinPeriod2025(page: Page): Promise<void> {
    await page.addInitScript(() => {
        localStorage.setItem('contalivre_period_year',
            JSON.stringify({ year: 2025, start: '2025-01-01', end: '2025-12-31' }))
    })
}

/** Carga el dataset RC desde el panel de fixture (idempotente) */
export async function loadRcDataset(page: Page): Promise<void> {
    await page.goto('/configuracion?seccion=datos')
    const panel = page.getByTestId('rc-fixture-panel')
    await expect(panel).toBeVisible()
    await page.getByTestId('rc-load').click()
    await expect(page.getByTestId('rc-status')).toContainText('Dataset RC cargado', { timeout: 90_000 })
}

/** Captura con nombre estable en docs/evidence/phase2f/screenshots */
export async function evidence(page: Page, name: string, fullPage = true): Promise<void> {
    await page.waitForTimeout(350) // asentar animaciones/liveQuery
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage })
}

/** Abre la pestaña de Estados indicada (por su etiqueta visible) */
export async function openEstadosTab(page: Page, label: string): Promise<void> {
    await page.getByRole('tab', { name: label, exact: false }).first().click()
}

export async function gotoEstados(page: Page): Promise<void> {
    await page.goto('/estados')
    await expect(page.getByRole('heading', { name: 'ESTADOS CONTABLES' })).toBeVisible({ timeout: 30_000 })
    // el bundle terminó de calcular cuando aparece la barra de metadatos
    await expect(page.getByRole('button', { name: 'Exportar estados' })).toBeVisible({ timeout: 30_000 })
}
