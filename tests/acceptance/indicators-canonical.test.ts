/**
 * Fase 2D (§8): el tablero de Indicadores consume SOLO el catálogo canónico del
 * ReportingBundle. Prohíbe reintroducir los motores/heurísticas legacy y el
 * puntaje universal de "salud". El hook legacy useIndicatorsMetrics se retiró.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

function allSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
        else if (/\.(ts|tsx)$/.test(name)) out.push(full)
    }
    return out
}
const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const importsFrom = (c: string, m: string) =>
    new RegExp(`(import|export)[^;]*from\\s+['"][^'"]*${m.replace(/[/]/g, '\\/')}[^'"]*['"]`).test(c)

describe('Fase 2D — indicadores canónicos', () => {
    const dash = join(SRC, 'components', 'Indicators', 'IndicatorsDashboard.tsx')
    const content = readFileSync(dash, 'utf-8')

    it('IndicatorsDashboard consume el ReportingBundle', () => {
        expect(importsFrom(content, 'hooks/useReportingBundle') || importsFrom(content, 'reporting/loadReportingBundle')).toBe(true)
    })

    it('IndicatorsDashboard no importa motores/heurísticas legacy', () => {
        for (const legacy of ['core/statements', 'utils/resultsStatement', 'domain/reports', 'utils/indicators', 'useIndicatorsMetrics']) {
            expect(importsFrom(content, legacy), `importa ${legacy}`).toBe(false)
        }
    })

    it('IndicatorsDashboard no usa ∞ ni puntaje universal de salud', () => {
        expect(/\bInfinity\b/.test(content)).toBe(false)
        expect(/IntegralScore|computeScore|salud financiera.{0,20}\/\s*10/i.test(content)).toBe(false)
    })

    it('el hook legacy useIndicatorsMetrics fue retirado y nadie lo importa', () => {
        expect(existsSync(join(SRC, 'hooks', 'useIndicatorsMetrics.ts'))).toBe(false)
        const offenders = allSourceFiles(SRC).filter(f => importsFrom(readFileSync(f, 'utf-8'), 'useIndicatorsMetrics')).map(rel)
        expect(offenders, `Aún importan useIndicatorsMetrics: ${offenders.join(', ')}`).toEqual([])
    })
})
