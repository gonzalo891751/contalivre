/**
 * EmptyState — estado vacío informativo (Fase 2H §H8, §3.C y §7).
 *
 * Regla de la fase: una pantalla sin movimientos no puede romper el diseño ni
 * ocultar funciones. Debe decir por qué no hay información, de dónde saldrían
 * los datos y qué puede hacer el usuario. Nunca datos ficticios ni una pestaña
 * gris sin explicación.
 */

import type { ReactNode } from 'react'
import { Info } from '@phosphor-icons/react'

export interface EmptyStateProps {
    title: string
    /** Por qué no hay información en este ejercicio. */
    reason: string
    /** De dónde provienen los datos que llenarían este anexo. */
    source?: string
    /** Acción sugerida concreta. */
    action?: ReactNode
}

export default function EmptyState({ title, reason, source, action }: EmptyStateProps) {
    return (
        <div
            role="status"
            style={{
                border: '1px dashed #cbd5e1',
                borderRadius: 12,
                padding: '24px 20px',
                background: '#f8fafc',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
            }}
        >
            <Info weight="duotone" size={26} color="#3B82F6" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{title}</p>
                <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.85rem', lineHeight: 1.55, maxWidth: '68ch' }}>
                    {reason}
                </p>
                {source && (
                    <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5, maxWidth: '68ch' }}>
                        <strong style={{ color: '#475569' }}>Origen de los datos:</strong> {source}
                    </p>
                )}
                {action && <div style={{ marginTop: 12 }}>{action}</div>}
            </div>
        </div>
    )
}
