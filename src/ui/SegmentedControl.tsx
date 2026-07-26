/**
 * SegmentedControl — control segmentado único y reutilizable (Fase 2H §H1).
 *
 * Motivación (bug reproducido en Fase 2H): los controles segmentados del EFE y
 * del EEPN se dibujaban con clases cuyo CSS vivía dentro de un `<style>` que
 * React montaba junto a un componente hermano condicional. Al cambiar de vista
 * ese hermano se desmontaba, el `<style>` desaparecía del DOM y los botones
 * quedaban como texto plano concatenado ("ExposiciónPreparación").
 *
 * Regla estructural: el CSS de este control vive en `src/styles/index.css`
 * (hoja global importada una sola vez en main.tsx). Su vida NO depende de
 * ninguna rama de renderizado, así que el control no puede volver a perder su
 * diseño al conmutar de vista.
 *
 * Accesibilidad: radiogroup + roving tabindex + flechas. Una opción
 * deshabilitada SIEMPRE debe explicar por qué (`disabledReason`), que se expone
 * como `title` y como texto accesible asociado.
 */

import { useId, useRef } from 'react'

export interface SegmentedOption<T extends string> {
    value: T
    label: string
    /** Deshabilita la opción. Exige `disabledReason` para no dejar un control mudo. */
    disabled?: boolean
    /** Motivo visible (tooltip) y accesible por el que la opción no está disponible. */
    disabledReason?: string
}

export interface SegmentedControlProps<T extends string> {
    /** Etiqueta del grupo. Se muestra salvo que `hideLabel` sea true, pero siempre es accesible. */
    label: string
    value: T
    options: SegmentedOption<T>[]
    onChange: (value: T) => void
    hideLabel?: boolean
    size?: 'sm' | 'md'
    className?: string
    /** Identificador estable para pruebas E2E. */
    testId?: string
}

export default function SegmentedControl<T extends string>({
    label,
    value,
    options,
    onChange,
    hideLabel = false,
    size = 'md',
    className = '',
    testId,
}: SegmentedControlProps<T>) {
    const groupId = useId()
    const trackRef = useRef<HTMLDivElement>(null)

    const enabled = options.filter(o => !o.disabled)

    /** Mueve la selección a la siguiente/anterior opción habilitada y le da el foco. */
    const move = (from: T, direction: 1 | -1) => {
        if (enabled.length === 0) return
        const currentIndex = enabled.findIndex(o => o.value === from)
        // Si el valor actual está deshabilitado arrancamos desde el borde.
        const base = currentIndex === -1 ? (direction === 1 ? -1 : 0) : currentIndex
        const next = enabled[(base + direction + enabled.length) % enabled.length]
        onChange(next.value)
        // El foco sigue a la selección (patrón radiogroup). Se hace en el frame
        // siguiente para que el botón destino ya tenga tabIndex=0.
        const focusNext = () => {
            const escape =
                typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                    ? CSS.escape
                    : (raw: string) => raw.replace(/["\\]/g, '\\$&')
            trackRef.current
                ?.querySelector<HTMLButtonElement>(`[data-seg-value="${escape(next.value)}"]`)
                ?.focus()
        }
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(focusNext)
        } else {
            focusNext()
        }
    }

    return (
        <div
            className={`cl-seg cl-seg--${size} ${className}`.trim()}
            data-testid={testId}
        >
            <span className={`cl-seg-label${hideLabel ? ' cl-seg-label--hidden' : ''}`} id={`${groupId}-label`}>
                {label}
            </span>
            <div className="cl-seg-track" role="radiogroup" aria-labelledby={`${groupId}-label`} ref={trackRef}>
                {options.map(option => {
                    const selected = option.value === value
                    const reasonId = option.disabled && option.disabledReason ? `${groupId}-${option.value}-why` : undefined
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            data-seg-value={option.value}
                            aria-checked={selected}
                            aria-describedby={reasonId}
                            className={`cl-seg-btn${selected ? ' is-active' : ''}`}
                            disabled={option.disabled}
                            title={option.disabled ? option.disabledReason : undefined}
                            // Roving tabindex: sólo la opción activa entra en el orden de tabulación.
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onChange(option.value)}
                            onKeyDown={event => {
                                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                                    event.preventDefault()
                                    move(option.value, 1)
                                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                                    event.preventDefault()
                                    move(option.value, -1)
                                }
                            }}
                        >
                            {option.label}
                            {reasonId && (
                                <span className="cl-seg-sr" id={reasonId}>
                                    {option.disabledReason}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
