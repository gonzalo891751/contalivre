import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Buildings,
    Calculator,
    Check,
    CheckSquareOffset,
    Clock,
    MagnifyingGlass,
    Package,
    type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

interface PlanillaCard {
    id: string
    title: string
    badge: string
    badgeClass: string
    description: string
    features: string[]
    lastUsed: string
    href: string
    icon: PhosphorIcon
}

const PLANILLAS: PlanillaCard[] = [
    {
        id: 'inventario',
        title: 'Inventario periódico',
        badge: 'STOCK',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
        description: 'Gestión de existencias, valuación FIFO/PPP y ajustes de stock manuales.',
        features: ['Ficha de stock', 'Reporte de valuación', 'Importación masiva'],
        lastUsed: '12/01/2026',
        href: '/planillas/inventario',
        icon: Package,
    },
    {
        id: 'conciliaciones',
        title: 'Conciliaciones',
        badge: 'CONTROL',
        badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200/60',
        description: 'Herramienta de cruce automático entre libro banco y extractos importados.',
        features: ['Match inteligente (AI)', 'Detección de diferencias', 'Ajustes automáticos'],
        lastUsed: 'Ayer, 14:30',
        href: '/planillas/conciliaciones',
        icon: CheckSquareOffset,
    },
    {
        id: 'amortizaciones',
        title: 'Amortizaciones',
        badge: 'BIENES DE USO',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200/60',
        description: 'Cálculo de depreciaciones anuales, altas, bajas y tabla de vida útil.',
        features: ['Método lineal / acelerado', 'Cuadro de marcha', 'Generación de asiento'],
        lastUsed: '—',
        href: '/planillas/amortizaciones',
        icon: Buildings,
    },
    {
        id: 'cierre',
        title: 'Ajuste por Inflación + Valuación',
        badge: 'CIERRE',
        badgeClass: 'bg-violet-50 text-violet-700 border border-violet-200/60',
        description: 'Ajuste por inflación contable y valuación de activos al cierre del ejercicio.',
        features: ['Índices FACPCE actualizados', 'RECPAM automático', 'Papeles de trabajo PDF'],
        lastUsed: '30/12/2025',
        href: '/planillas/cierre-valuacion',
        icon: Calculator,
    },
]

export default function PlanillasHome() {
    const [query, setQuery] = useState('')

    const filteredCards = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        if (!normalized) return PLANILLAS

        return PLANILLAS.filter((card) => {
            const haystack = [
                card.title,
                card.description,
                card.badge,
                ...card.features,
            ]
                .join(' ')
                .toLowerCase()

            return haystack.includes(normalized)
        })
    }, [query])

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold text-[var(--text-strong)] font-[var(--font-display)]">
                        Planillas complementarias
                    </h1>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Herramientas de cálculo y ajustes auxiliares.
                    </p>
                </div>

                <div className="w-full sm:max-w-[280px]">
                    <label className="relative block">
                        <span className="sr-only">Buscar planilla</span>
                        <MagnifyingGlass
                            size={18}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                        />
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar planilla..."
                            className="w-full rounded-[10px] border border-[var(--border)] bg-white py-2.5 pl-10 pr-3 text-sm text-[var(--text)] shadow-sm transition focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                            aria-label="Buscar planilla"
                        />
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredCards.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-6 text-sm text-[var(--text-muted)]">
                        No hay planillas que coincidan con tu búsqueda.
                    </div>
                ) : (
                    filteredCards.map((card) => {
                        const Icon = card.icon
                        return (
                            <div
                                key={card.id}
                                className="group flex h-full flex-col rounded-[12px] border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--brand-primary)] transition group-hover:bg-[rgba(59,130,246,0.12)]">
                                        <Icon size={24} weight="duotone" />
                                    </div>
                                    <span className={`badge px-2.5 py-0.5 text-[0.7rem] ${card.badgeClass}`}>
                                        {card.badge}
                                    </span>
                                </div>

                                <h3 className="mt-4 text-[1.35rem] font-semibold leading-tight text-[var(--text-strong)] font-[var(--font-display)]">
                                    {card.title}
                                </h3>
                                <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--text-muted)]">
                                    {card.description}
                                </p>

                                <ul className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-3 text-[0.85rem] text-[var(--text-muted)]">
                                    {card.features.map((feature) => (
                                        <li key={feature} className="flex items-center gap-2">
                                            <Check size={16} weight="bold" className="text-emerald-600" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-4">
                                    <Link to={card.href} className="btn btn-primary w-full">
                                        Abrir
                                    </Link>
                                </div>

                                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-[var(--font-mono)]">
                                    <Clock size={14} />
                                    <span>Último uso: {card.lastUsed}</span>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
