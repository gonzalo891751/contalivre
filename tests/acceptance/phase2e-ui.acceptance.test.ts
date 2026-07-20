/**
 * Fase 2E (§14) — limpieza de cabecera, terminología y validación compacta,
 * más afirmaciones de arquitectura de los presentadores nuevos.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf-8')

describe('Fase 2E — cabecera y terminología (§14)', () => {
    it('la cabecera de Estados menciona la información complementaria', () => {
        const header = read('components', 'Estados', 'EstadosHeader.tsx')
        expect(header).toContain('4 estados contables básicos e información complementaria')
        expect(header).not.toContain('Los 4 estados contables básicos<')
    })

    it('los identificadores técnicos viven en el popover "Detalles técnicos"', () => {
        const bar = read('components', 'Estados', 'canonical', 'ReportMetadataBar.tsx')
        expect(bar).toContain('Detalles técnicos')
        // la línea inline vieja (motor · schema · reporte · commit) ya no existe
        expect(bar).not.toContain('Motor {metadata.engineVersion} · schema')
    })

    it('la acción se llama "Guardar versión validada" (snapshot solo interno)', () => {
        const bar = read('components', 'Estados', 'canonical', 'ReportMetadataBar.tsx')
        expect(bar).toContain('Guardar versión validada')
        expect(bar).not.toContain('Publicar snapshot')
    })

    it('cuando todo valida se muestra el chip compacto "✓ Estados conciliados"', () => {
        const banner = read('components', 'Estados', 'canonical', 'ValidationBanner.tsx')
        expect(banner).toContain('Estados conciliados')
        expect(banner).toContain('aria-expanded')
    })

    it('los importes usan tabular-nums y no fuente monoespaciada de código', () => {
        const fmt = read('components', 'Estados', 'canonical', 'statementFormat.ts')
        expect(fmt).toContain('font-variant-numeric: tabular-nums')
        expect(/\.stmt-amount\s*{[^}]*font-mono/s.test(fmt)).toBe(false)
        expect(/\.stmt-card-total\s*{[^}]*font-mono/s.test(fmt)).toBe(false)
    })
})

describe('Fase 2E — presentadores nuevos (§3)', () => {
    const NEW_VIEWS = [
        'EquityMatrixView.tsx',
        'ExpensesByFunctionView.tsx',
        'CostOfSalesBridgeView.tsx',
        'FixedAssetsAnnexView.tsx',
        'ForeignCurrencyView.tsx',
        'NotesAndAnnexesTab.tsx',
        'FlujoEfectivoCanonicalTab.tsx',
    ]

    it('ningún presentador nuevo consulta Dexie ni motores legacy', () => {
        for (const f of NEW_VIEWS) {
            const c = read('components', 'Estados', 'canonical', f)
            expect(/from\s+['"][^'"]*storage\/db['"]/.test(c), `${f} importa Dexie`).toBe(false)
            expect(/from\s+['"][^'"]*utils\/resultsStatement['"]/.test(c), `${f} importa legacy`).toBe(false)
            expect(/localStorage/.test(c), `${f} usa localStorage`).toBe(false)
        }
    })

    it('el ER de la vista usa los subtotales del motor (no recalcula)', () => {
        const tabs = read('components', 'Estados', 'canonical', 'CanonicalTabs.tsx')
        expect(tabs).toContain('er.preTaxResult')
        expect(tabs).toContain('er.continuingResult')
        expect(tabs).toContain('incomeTaxStatus')
    })

    it('el EEPN abre en vista matricial por defecto con toggle a resumida', () => {
        const tabs = read('components', 'Estados', 'canonical', 'CanonicalTabs.tsx')
        expect(tabs).toContain("useState<'MATRIX' | 'SUMMARY'>('MATRIX')")
        expect(tabs).toContain('Vista matricial')
        expect(tabs).toContain('Vista resumida')
    })

    it('el EFE explica por qué cada ajuste del indirecto suma o resta', () => {
        const efe = read('components', 'Estados', 'canonical', 'FlujoEfectivoCanonicalTab.tsx')
        expect(efe).toContain('INDIRECT_HINTS')
        expect(efe).toContain('no produjo una salida de efectivo')
    })
})
