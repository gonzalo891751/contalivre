/**
 * Fase 2D (§5): la "Práctica guiada" se retira de la aplicación. Los escenarios
 * educativos siguen existiendo SOLO como utilidades de test (golden), nunca como
 * superficie de UI. Este test bloquea que vuelvan a colarse en el árbol de src.
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

describe('Fase 2D — Práctica guiada retirada', () => {
    const files = allSourceFiles(SRC)

    it('la página PracticaPage ya no existe', () => {
        expect(existsSync(join(SRC, 'pages', 'PracticaPage.tsx'))).toBe(false)
    })

    it('ningún archivo de src importa los lanzadores de escenarios (solo los tests)', () => {
        const offenders = files.filter(f => {
            const c = readFileSync(f, 'utf-8')
            // el propio módulo de escenarios se permite; nadie más en src debe importarlo
            if (rel(f).startsWith('src/accounting/scenarios/')) return false
            return /from\s+['"][^'"]*accounting\/scenarios[^'"]*['"]/.test(c)
        }).map(rel)
        expect(offenders, `Importan escenarios desde la app: ${offenders.join(', ')}`).toEqual([])
    })

    it('App.tsx no monta la página de práctica', () => {
        const app = readFileSync(join(SRC, 'App.tsx'), 'utf-8')
        expect(/import\(['"][^'"]*PracticaPage['"]\)/.test(app)).toBe(false)
        expect(app.includes('<PracticaPage')).toBe(false)
    })
})
