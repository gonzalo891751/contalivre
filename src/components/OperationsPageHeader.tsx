/**
 * OperationsPageHeader - Shared header for /operaciones sub-pages
 *
 * Provides consistent layout: Back button + breadcrumb + title + subtitle + right-side actions.
 * Supports optional TextShimmer on the title (desktop only, respects prefers-reduced-motion).
 */

import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CaretRight } from '@phosphor-icons/react'
import TextShimmer from '../ui/TextShimmer'

export interface OperationsPageHeaderProps {
    /** Navigate-back target (default: '/operaciones') */
    backHref?: string
    /** Back button label (default: 'Operaciones') */
    backLabel?: string
    /** Custom back handler (overrides backHref navigation) */
    onBack?: () => void
    /** Page title */
    title: string
    /** Optional subtitle below the title */
    subtitle?: string
    /** Right-side actions slot (buttons, toggles, selectors) */
    rightSlot?: ReactNode
    /** Optional badges displayed next to the title */
    badges?: ReactNode
    /** Enable shimmer animation on the title (default: false) */
    shimmer?: boolean
}

export default function OperationsPageHeader({
    backHref = '/operaciones',
    backLabel = 'Operaciones',
    onBack,
    title,
    subtitle,
    rightSlot,
    badges,
    shimmer = false,
}: OperationsPageHeaderProps) {
    const navigate = useNavigate()

    const handleBack = onBack || (() => navigate(backHref))

    return (
        <div className="flex flex-col gap-3 mb-6">
            {/* Row 1: Back + Breadcrumb + Right-side actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleBack}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors"
                        aria-label={`Volver a ${backLabel}`}
                    >
                        <ArrowLeft size={14} weight="bold" />
                        <span className="hidden sm:inline">Volver</span>
                    </button>

                    {/* Breadcrumb (desktop only) */}
                    <nav className="hidden md:flex text-slate-500 text-xs items-center gap-1.5">
                        <span className="text-slate-300">|</span>
                        <span>{backLabel}</span>
                        <CaretRight size={10} className="text-slate-400" />
                        <span className="font-medium text-slate-900">{title}</span>
                    </nav>
                </div>

                {/* Right-side slot */}
                {rightSlot && (
                    <div className="flex items-center gap-3">
                        {rightSlot}
                    </div>
                )}
            </div>

            {/* Row 2: Title + Subtitle + Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="font-display font-bold text-2xl text-slate-900">
                        {shimmer ? (
                            <TextShimmer duration={3}>{title}</TextShimmer>
                        ) : (
                            title
                        )}
                    </h1>
                    {subtitle && (
                        <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>
                    )}
                </div>
                {badges && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {badges}
                    </div>
                )}
            </div>
        </div>
    )
}
