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
    // El tablero de tarjetas se reemplazó por el Análisis de Estados Contables:
    // las mismas garantías aplican a la pantalla, al resumen del inicio y a sus piezas.
    const analysisFiles = [
        join(SRC, 'pages', 'AnalisisPage.tsx'),
        ...allSourceFiles(join(SRC, 'components', 'Analisis')),
    ]
    const read = (f: string) => readFileSync(f, 'utf-8')

    it('el análisis y el resumen consumen el ReportingBundle', () => {
        for (const f of [join(SRC, 'components', 'Analisis', 'useAnalysis.ts'), join(SRC, 'components', 'Analisis', 'AnalysisSummary.tsx')]) {
            const c = read(f)
            expect(importsFrom(c, 'hooks/useReportingBundle') || importsFrom(c, 'reporting/loadReportingBundle'), rel(f)).toBe(true)
        }
    })

    it('el análisis no importa motores/heurísticas legacy ni consulta Dexie', () => {
        for (const f of analysisFiles) {
            const c = read(f)
            for (const legacy of ['core/statements', 'utils/resultsStatement', 'domain/reports', 'utils/indicators', 'useIndicatorsMetrics', 'storage/db']) {
                expect(importsFrom(c, legacy), `${rel(f)} importa ${legacy}`).toBe(false)
            }
        }
    })

    it('el análisis no usa ∞ ni puntaje universal de salud', () => {
        for (const f of analysisFiles) {
            const c = read(f)
            expect(/\bInfinity\b/.test(c), rel(f)).toBe(false)
            expect(/IntegralScore|computeScore|salud financiera.{0,20}\/\s*10/i.test(c), rel(f)).toBe(false)
        }
    })

    it('el hook legacy useIndicatorsMetrics fue retirado y nadie lo importa', () => {
        expect(existsSync(join(SRC, 'hooks', 'useIndicatorsMetrics.ts'))).toBe(false)
        const offenders = allSourceFiles(SRC).filter(f => importsFrom(readFileSync(f, 'utf-8'), 'useIndicatorsMetrics')).map(rel)
        expect(offenders, `Aún importan useIndicatorsMetrics: ${offenders.join(', ')}`).toEqual([])
    })
})
