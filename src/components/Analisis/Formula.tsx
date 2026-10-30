/**
 * Fórmula en notación de apunte (KaTeX). Nunca rompe la pantalla: si el TeX
 * no compila, muestra el texto plano.
 */

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export function Formula({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
    const html = useMemo(() => {
        try {
            return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false })
        } catch {
            return null
        }
    }, [tex, display])
    if (html === null) return <code className={className}>{tex}</code>
    return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
