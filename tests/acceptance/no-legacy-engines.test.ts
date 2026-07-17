/**
 * Fase 2C (§5.4): las páginas/componentes de estados NO deben importar los
 * motores/presentadores legacy para obtener cifras. Todo sale del motor
 * canónico (src/reporting) vía loadReportingBundle.
 *
 * Además: `xlsx` no debe existir en ningún import del código fuente
 * (reemplazado por src/lib/spreadsheet con exceljs).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')

function allSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
        else if (/\.(ts|tsx)$/.test(name)) out.push(full)
    }
    return out
}

const rel = (f: string) => relative(join(SRC, '..'), f).split(sep).join('/')

describe('Fase 2C — arquitectura de reporting', () => {
    const files = allSourceFiles(SRC)

    /** Detecta solo IMPORTS reales del módulo (ignora comentarios) */
    const importsFrom = (content: string, modulePath: string): boolean => {
        const re = new RegExp(`(import|export)[^;]*from\\s+['"][^'"]*${modulePath.replace(/[/]/g, '\\/')}[^'"]*['"]`)
        return re.test(content)
    }

    it('Estados.tsx no importa presentadores ni motores legacy de estados', () => {
        const estados = files.find(f => rel(f) === 'src/pages/Estados.tsx')!
        const content = readFileSync(estados, 'utf-8')
        const forbidden = [
            'utils/resultsStatement',
            'core/statements',
            'domain/reports/estadoResultados',
            'espComparativeStore',
        ]
        const hits = forbidden.filter(f => importsFrom(content, f))
        expect(hits, `Estados.tsx importa legacy: ${hits.join(', ')}`).toEqual([])
    })

    it('los componentes canónicos solo consumen el ReportingBundle', () => {
        const canonicalDir = join(SRC, 'components', 'Estados', 'canonical')
        for (const f of allSourceFiles(canonicalDir)) {
            const content = readFileSync(f, 'utf-8')
            expect(importsFrom(content, 'utils/resultsStatement'), rel(f)).toBe(false)
            expect(importsFrom(content, 'core/statements'), rel(f)).toBe(false)
            expect(importsFrom(content, 'domain/reports'), rel(f)).toBe(false)
        }
    })

    it('ningún archivo importa la dependencia vulnerable xlsx', () => {
        const offenders: string[] = []
        for (const f of files) {
            const content = readFileSync(f, 'utf-8')
            if (/from\s+['"]xlsx['"]/.test(content) || /require\(['"]xlsx['"]\)/.test(content)) {
                offenders.push(rel(f))
            }
        }
        expect(offenders, `Aún importan xlsx: ${offenders.join(', ')}`).toEqual([])
    })

    it('el RECPAM legacy fue eliminado del árbol de fuentes', () => {
        const exists = files.some(f => rel(f) === 'src/core/cierre-valuacion/recpam-indirecto.ts')
        expect(exists).toBe(false)
    })
})
