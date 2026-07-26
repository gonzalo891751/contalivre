/**
 * Fase 2H §H1 — Regresión de los controles segmentados de EFE y EEPN.
 *
 * Bug reproducido antes del arreglo:
 *  - EFE: `FlujoEfectivoCanonicalTab` devolvía en la rama PREPARACION un
 *    `<style>` que sólo incluía `statementStyles`, omitiendo `efeStyles`, donde
 *    vivía el CSS `.efe-segmented*` del conmutador de Vista. Resultado en
 *    pantalla: "ExposiciónPreparación" como texto plano concatenado.
 *  - EEPN: `EEPNCanonicalTab` dibujaba los botones `.eqm-filter-btn`, pero ese
 *    CSS estaba dentro de `EquityMatrixView`. Al elegir "Vista resumida" ese
 *    componente se desmontaba, su `<style>` desaparecía y quedaba
 *    "Vista matricialVista resumida" como texto plano.
 *
 * La corrección es estructural: un único `SegmentedControl` cuyo CSS vive en la
 * hoja global `src/styles/index.css`. Estas pruebas fijan tanto el
 * comportamiento accesible del componente como la invariante arquitectónica que
 * impide que el CSS vuelva a depender de una rama de renderizado.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within, fireEvent } from '@testing-library/react'
import SegmentedControl from '../../src/ui/SegmentedControl'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

/**
 * Las invariantes de abajo son sobre CÓDIGO, no sobre prosa: los comentarios de
 * este repositorio describen el bug corregido y mencionan a propósito las clases
 * viejas (`.eqm-filter-btn`, `<style>`). Sin quitar comentarios, las
 * aserciones darían falsos positivos contra su propia documentación.
 */
const readCode = (p: string) =>
    read(p)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

const GLOBAL_CSS = 'src/styles/index.css'
const EFE_TAB = 'src/components/Estados/canonical/FlujoEfectivoCanonicalTab.tsx'
const CANONICAL_TABS = 'src/components/Estados/canonical/CanonicalTabs.tsx'

describe('Fase 2H §H1 — SegmentedControl: comportamiento', () => {
    const options = [
        { value: 'EXPOSICION' as const, label: 'Exposición' },
        { value: 'PREPARACION' as const, label: 'Preparación' },
    ]

    it('expone un radiogroup con una opción marcada y etiquetas separadas', () => {
        render(<SegmentedControl label="Vista" value="EXPOSICION" options={options} onChange={() => {}} />)

        const group = screen.getByRole('radiogroup', { name: 'Vista' })
        const radios = within(group).getAllByRole('radio')

        expect(radios).toHaveLength(2)
        // Cada opción es un <button> real, no texto suelto: esto es lo que se perdía.
        radios.forEach(radio => expect(radio.tagName).toBe('BUTTON'))
        expect(radios[0]).toHaveAttribute('aria-checked', 'true')
        expect(radios[1]).toHaveAttribute('aria-checked', 'false')
        expect(radios[0]).toHaveTextContent('Exposición')
        expect(radios[1]).toHaveTextContent('Preparación')
    })

    it('no concatena las etiquetas: cada opción es un nodo independiente', () => {
        const { container } = render(
            <SegmentedControl label="Vista" value="EXPOSICION" options={options} onChange={() => {}} />
        )
        const track = container.querySelector('.cl-seg-track')!
        // El texto del contenedor sí es la concatenación, pero debe haber DOS hijos
        // botón con la clase de estilo: eso es lo que garantiza el diseño segmentado.
        expect(track.querySelectorAll('button.cl-seg-btn')).toHaveLength(2)
    })

    it('marca visualmente la opción activa con una clase propia (no sólo color)', () => {
        const { container } = render(
            <SegmentedControl label="Vista" value="PREPARACION" options={options} onChange={() => {}} />
        )
        const active = container.querySelectorAll('button.cl-seg-btn.is-active')
        expect(active).toHaveLength(1)
        expect(active[0]).toHaveTextContent('Preparación')
    })

    it('usa roving tabindex: sólo la opción activa es tabulable', () => {
        render(<SegmentedControl label="Vista" value="EXPOSICION" options={options} onChange={() => {}} />)
        const radios = screen.getAllByRole('radio')
        expect(radios[0]).toHaveAttribute('tabindex', '0')
        expect(radios[1]).toHaveAttribute('tabindex', '-1')
    })

    it('cambia de opción con las flechas del teclado', () => {
        const onChange = vi.fn()
        render(<SegmentedControl label="Vista" value="EXPOSICION" options={options} onChange={onChange} />)

        const first = screen.getAllByRole('radio')[0]
        fireEvent.keyDown(first, { key: 'ArrowRight' })
        expect(onChange).toHaveBeenCalledWith('PREPARACION')

        onChange.mockClear()
        // Desde la primera opción hacia atrás envuelve a la última habilitada.
        fireEvent.keyDown(first, { key: 'ArrowLeft' })
        expect(onChange).toHaveBeenCalledWith('PREPARACION')
    })

    it('responde al clic', () => {
        const onChange = vi.fn()
        render(<SegmentedControl label="Vista" value="EXPOSICION" options={options} onChange={onChange} />)

        fireEvent.click(screen.getByRole('radio', { name: /Preparación/ }))
        expect(onChange).toHaveBeenCalledWith('PREPARACION')
    })

    it('una opción deshabilitada explica siempre por qué (no queda muda)', () => {
        render(
            <SegmentedControl
                label="Expresión"
                value="NOMINAL"
                onChange={() => {}}
                options={[
                    { value: 'NOMINAL' as const, label: 'Moneda nominal' },
                    {
                        value: 'CLOSING' as const,
                        label: 'Moneda de cierre',
                        disabled: true,
                        disabledReason: 'Cargá un set de índices en el módulo de inflación',
                    },
                ]}
            />
        )

        const closing = screen.getByRole('radio', { name: /Moneda de cierre/ })
        expect(closing).toBeDisabled()
        expect(closing).toHaveAttribute('title', 'Cargá un set de índices en el módulo de inflación')
        // El motivo también es accesible por lector de pantalla.
        expect(closing).toHaveAccessibleDescription('Cargá un set de índices en el módulo de inflación')
    })

    it('salta las opciones deshabilitadas al navegar con el teclado', () => {
        const onChange = vi.fn()
        render(
            <SegmentedControl
                label="Expresión"
                value="NOMINAL"
                onChange={onChange}
                options={[
                    { value: 'NOMINAL' as const, label: 'Nominal' },
                    { value: 'CLOSING' as const, label: 'Cierre', disabled: true, disabledReason: 'Sin índices' },
                ]}
            />
        )
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Nominal' }), { key: 'ArrowRight' })
        // Sólo hay una opción habilitada: no puede saltar a la deshabilitada.
        expect(onChange).not.toHaveBeenCalledWith('CLOSING')
    })
})

describe('Fase 2H §H1 — invariante: el CSS no puede depender de la rama de renderizado', () => {
    it('el CSS del control segmentado vive en la hoja global', () => {
        const css = read(GLOBAL_CSS)
        expect(css).toContain('.cl-seg-track')
        expect(css).toContain('.cl-seg-btn')
        expect(css).toContain('.cl-seg-btn.is-active')
        expect(css).toContain('.cl-seg-btn:focus-visible')
    })

    it('el componente SegmentedControl no inyecta su propio <style>', () => {
        expect(readCode('src/ui/SegmentedControl.tsx')).not.toMatch(/<style>/)
    })

    it('el EFE usa SegmentedControl para Vista, Método, Expresión y Modo', () => {
        const source = readCode(EFE_TAB)
        expect(source).toContain("import SegmentedControl from '../../../ui/SegmentedControl'")
        // Ya no queda el control local con CSS de ciclo de vida frágil.
        expect(source).not.toContain('efe-segmented')
        expect(source).not.toMatch(/function Segmented</)
        for (const testId of ['efe-vista', 'efe-metodo', 'efe-expresion', 'efe-modo']) {
            expect(source).toContain(testId)
        }
    })

    it('la rama PREPARACION del EFE emite los mismos estilos que EXPOSICION', () => {
        const source = readCode(EFE_TAB)
        // Causa raíz original: `<style>{statementStyles}</style>` sin efeStyles.
        const preparacionBranch = source.slice(
            source.indexOf("if (view === 'PREPARACION')"),
            source.indexOf("const showClosing")
        )
        expect(preparacionBranch).toContain('{statementStyles}{efeStyles}')
    })

    it('el EEPN usa SegmentedControl y ya no depende de .eqm-filter-btn', () => {
        const source = readCode(CANONICAL_TABS)
        expect(source).toContain("import SegmentedControl from '../../../ui/SegmentedControl'")
        expect(source).not.toContain('eqm-filter-btn')
        expect(source).toContain('eepn-vista')
    })

    it('ningún componente redefine el CSS del control segmentado', () => {
        // Si un componente volviera a DEFINIR .cl-seg* dentro de su <style>, el
        // diseño del control volvería a depender de que ese componente esté montado.
        for (const file of [
            'src/components/Estados/canonical/EquityMatrixView.tsx',
            EFE_TAB,
            CANONICAL_TABS,
            'src/components/Estados/canonical/preparacionStyles.ts',
        ]) {
            expect(read(file), `${file} no debe definir reglas .cl-seg*`).not.toMatch(/\.cl-seg[\w-]*\s*(,|\{)/)
        }
    })

    it('el filtro de filas del EEPN también usa el control común', () => {
        const source = readCode('src/components/Estados/canonical/EquityMatrixView.tsx')
        expect(source).toContain('SegmentedControl')
        expect(source).not.toContain('eqm-filter-btn')
    })
})
