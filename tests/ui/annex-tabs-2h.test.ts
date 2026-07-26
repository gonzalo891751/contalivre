/**
 * Fase 2H §H8 y §7 — Las pestañas de Notas y Anexos son siempre navegables.
 *
 * Bug reproducido: `NotesAndAnnexesTab` deshabilitaba la pestaña cuando el
 * anexo no tenía datos (`disabled={!available[t.id]}`). El usuario veía una
 * pestaña gris, sin explicación y sin poder abrirla, justamente en el caso en
 * que más falta hace saber por qué no hay información.
 *
 * Ahora la pestaña se marca "sin datos" con TEXTO (no sólo color) y adentro
 * muestra un estado vacío que explica el motivo, el origen de los datos y la
 * acción sugerida.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8')
const readCode = (p: string) =>
    read(p)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

const TAB = 'src/components/Estados/canonical/NotesAndAnnexesTab.tsx'

describe('Fase 2H §H8 — pestañas de anexos', () => {
    it('ninguna pestaña se renderiza deshabilitada', () => {
        const source = readCode(TAB)
        expect(source).not.toMatch(/disabled=\{!/)
        expect(source).not.toContain('Sin datos aplicables en este ejercicio')
    })

    it('el CSS ya no define un estado deshabilitado para las pestañas', () => {
        expect(readCode(TAB)).not.toContain('.note-subtab:disabled')
    })

    it('la falta de datos se comunica con texto, no sólo con color', () => {
        const source = readCode(TAB)
        expect(source).toContain('note-subtab-flag')
        expect(source).toContain('sin datos')
    })

    it('cada anexo sin datos muestra un estado vacío informativo', () => {
        const source = readCode(TAB)
        expect(source).toContain('EmptyState')
        // Los cuatro anexos con datos condicionales tienen su rama vacía.
        const emptyStates = source.match(/<EmptyState/g) ?? []
        expect(emptyStates.length).toBeGreaterThanOrEqual(4)
    })

    it('el estado vacío explica motivo, origen y acción', () => {
        const empty = read('src/ui/EmptyState.tsx')
        expect(empty).toContain('reason')
        expect(empty).toContain('source')
        expect(empty).toContain('action')
        expect(empty).toContain('Origen de los datos')
        expect(empty).toContain("role=\"status\"")
    })

    it('el anexo de moneda extranjera es alcanzable aunque no haya partidas', () => {
        const source = readCode(TAB)
        // La rama MONEDA_EXT se renderiza siempre que la subpestaña esté activa,
        // con vista o con estado vacío, nunca bloqueada.
        expect(source).toContain("subtab === 'MONEDA_EXT'")
        expect(source).toContain('No hay partidas en moneda extranjera')
    })
})
