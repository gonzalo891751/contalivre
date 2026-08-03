/**
 * Sistema de componentes del módulo de Consolidación (Fase 2K.1).
 *
 * La Fase 2K resolvió cada pantalla con marcado ad hoc, y por eso las tarjetas
 * se parecían entre sí sin querer y las ayudas pedagógicas parecían botones
 * deshabilitados. Acá viven los patrones que el módulo repite, para que la
 * jerarquía sea una decisión del sistema y no de cada pantalla.
 *
 * Ninguno de estos componentes calcula nada: reciben lo que el motor ya
 * resolvió y sólo deciden cómo se lee.
 */

import { useId, type ReactNode } from 'react'
import { CaretDown, Question, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { HELP_TOPICS } from './pedagogia'

// ─────────────────────────────────────────────────────────────
// Encabezado de sección
// ─────────────────────────────────────────────────────────────

export function SectionCard({
    icon: Icon, title, description, actions, children, flush,
}: {
    icon?: PhosphorIcon
    title: string
    description?: string
    actions?: ReactNode
    children: ReactNode
    /** el cuerpo llega hasta el borde (tablas, listas a sangre) */
    flush?: boolean
}) {
    return (
        <section className="cons-section">
            <header className="cons-section-head">
                <div className="cons-section-head-main">
                    {Icon && (
                        <span className="cons-section-head-icon" aria-hidden="true">
                            <Icon size={17} weight="bold" />
                        </span>
                    )}
                    <div>
                        <h3 className="cons-section-title">{title}</h3>
                        {description && <p className="cons-section-desc">{description}</p>}
                    </div>
                </div>
                {actions}
            </header>
            <div className={flush ? 'cons-section-body cons-section-body-flush' : 'cons-section-body'}>
                {children}
            </div>
        </section>
    )
}

// ─────────────────────────────────────────────────────────────
// Tarjeta de métrica
// ─────────────────────────────────────────────────────────────

export type MetricTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'blocked'

export function MetricCard({
    label, value, detail, tone = 'neutral', icon: Icon, compact,
}: {
    label: string
    value: string
    detail?: string
    tone?: MetricTone
    icon?: PhosphorIcon
    /** para valores de texto largo, que no deben competir con las cifras */
    compact?: boolean
}) {
    return (
        <article className={`cons-kpi ${tone !== 'neutral' ? `cons-kpi-${tone}` : ''}`}>
            <div className="cons-kpi-head">
                <span className="cons-kpi-label">{label}</span>
                {Icon && (
                    <span className="cons-kpi-icon" aria-hidden="true">
                        <Icon size={15} weight="bold" />
                    </span>
                )}
            </div>
            <strong className={`cons-kpi-value ${compact ? 'cons-kpi-value-sm' : ''}`}>{value}</strong>
            {detail && <span className="cons-kpi-detail">{detail}</span>}
        </article>
    )
}

// ─────────────────────────────────────────────────────────────
// Chips de estado
// ─────────────────────────────────────────────────────────────

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'block' | 'muted'

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
    return <span className={`cons-chip ${tone !== 'neutral' ? `cons-chip-${tone}` : ''}`}>{children}</span>
}

// ─────────────────────────────────────────────────────────────
// Aviso contextual
// ─────────────────────────────────────────────────────────────

export function Callout({ icon: Icon, children }: { icon?: PhosphorIcon; children: ReactNode }) {
    return (
        <div className="cons-callout" role="note">
            {Icon && <Icon size={18} weight="fill" aria-hidden="true" />}
            <div>{children}</div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Ayuda pedagógica (acordeón)
// ─────────────────────────────────────────────────────────────

/**
 * Acordeón de ayuda. El contenido sólo se monta cuando está abierto, así que
 * tener diez ayudas en la página no cuesta nada mientras están cerradas.
 */
export function HelpAccordion({
    topic, question, answer, normative, open, onToggle,
}: {
    topic?: keyof typeof HELP_TOPICS
    question?: string
    answer?: string
    normative?: string
    open: boolean
    onToggle: () => void
}) {
    const help = topic ? HELP_TOPICS[topic] : {
        question: question ?? '¿Qué se controla en esta etapa?',
        answer: answer ?? '',
        normative,
    }
    const panelId = useId()
    return (
        <div className={`cons-help ${open ? 'cons-help-open' : ''}`}>
            <button
                type="button"
                className="cons-help-toggle"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
            >
                <span className="cons-help-mark" aria-hidden="true">
                    <Question size={15} weight="bold" />
                </span>
                <span>{help.question}</span>
                <CaretDown className="cons-help-caret" size={14} weight="bold" aria-hidden="true" />
            </button>
            {open && (
                <div className="cons-help-body" id={panelId}>
                    {help.answer.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                    {help.normative && <span className="cons-normative">{help.normative}</span>}
                </div>
            )}
        </div>
    )
}

/** Rejilla de ayudas con un único abierto por vez */
export function HelpGrid({
    topics, openTopic, onToggle,
}: {
    topics: (keyof typeof HELP_TOPICS)[]
    openTopic: string | null
    onToggle: (topic: string | null) => void
}) {
    return (
        <div className="cons-help-grid">
            {topics.map(t => (
                <HelpAccordion
                    key={t}
                    topic={t}
                    open={openTopic === t}
                    onToggle={() => onToggle(openTopic === t ? null : t)}
                />
            ))}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Estado ejecutivo (filas monetarias)
// ─────────────────────────────────────────────────────────────

export function ExecRow({
    label, value, sub,
}: { label: string; value: string; sub?: boolean }) {
    return (
        <div className={`cons-exec-row ${sub ? 'cons-exec-sub' : ''}`}>
            <dt className="cons-exec-label">{label}</dt>
            <dd className="cons-exec-value">{value}</dd>
        </div>
    )
}

export function ExecTotal({ label, value }: { label: string; value: string }) {
    return (
        <div className="cons-exec-row cons-exec-total">
            <dt className="cons-exec-label">{label}</dt>
            <dd className="cons-exec-value">{value}</dd>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Veredicto
// ─────────────────────────────────────────────────────────────

export function Verdict({
    tone, icon: Icon, title, children,
}: {
    tone: 'ok' | 'blocked'
    icon: PhosphorIcon
    title: string
    children?: ReactNode
}) {
    return (
        <div className={`cons-verdict cons-verdict-${tone}`} role="status">
            <Icon size={19} weight="fill" aria-hidden="true" />
            <div>
                <strong>{title}</strong>
                {children}
            </div>
        </div>
    )
}
