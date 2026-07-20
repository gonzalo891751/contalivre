/**
 * Playwright — Fase 2F (§6/§19): validación real en navegador.
 *
 * Corre contra el servidor de desarrollo de Vite (MODE=development, que
 * habilita el panel del fixture RC). Las capturas de evidencia se guardan en
 * docs/evidence/phase2f/. Un solo worker: el dataset vive en IndexedDB del
 * contexto y los flujos son secuenciales por diseño.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    timeout: 180_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:4517',
        screenshot: 'off',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium-desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
            // mobile.spec corre en chromium-mobile (390×844), no acá
            testIgnore: /mobile\.spec\.ts/,
        },
        {
            name: 'chromium-mobile',
            use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
            testMatch: /mobile\.spec\.ts/,
        },
        {
            // Segundo motor (§19): el flujo integral también en Firefox
            name: 'firefox-desktop',
            use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
            testMatch: /full-flow\.spec\.ts/,
        },
    ],
    webServer: {
        command: 'npm run dev -- --port 4517 --strictPort',
        url: 'http://localhost:4517',
        reuseExistingServer: true,
        timeout: 120_000,
    },
})
