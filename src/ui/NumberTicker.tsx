import { useEffect, useRef, useState } from 'react'

interface NumberTickerProps {
    value: number
    format?: (n: number) => string
    duration?: number
    className?: string
}

/**
 * Animated number counter (ReactBits-inspired, local copy).
 * Smoothly interpolates from previous value to new value.
 */
export default function NumberTicker({
    value,
    format = n => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }),
    duration = 600,
    className = '',
}: NumberTickerProps) {
    const [display, setDisplay] = useState(value)
    const prevRef = useRef(value)
    const rafRef = useRef<number>(0)

    useEffect(() => {
        const from = prevRef.current
        const to = value
        prevRef.current = to

        if (from === to) {
            setDisplay(to)
            return
        }

        const start = performance.now()
        const animate = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplay(from + (to - from) * eased)
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate)
            }
        }
        rafRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(rafRef.current)
    }, [value, duration])

    return <span className={className}>{format(display)}</span>
}
