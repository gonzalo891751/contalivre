import { Link } from 'react-router-dom'
import {
    RocketLaunch,
    Notebook,
    BookBookmark,
    ChartLineUp,
    TreeStructure,
    Table,
    Lightning,
    type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

interface QuickAction {
    to: string
    label: string
    description: string
    icon: PhosphorIcon
}

const quickActions: QuickAction[] = [
    {
        to: '/operaciones',
        label: 'Operaciones',
        description: 'Inventario, bienes y fiscal',
        icon: RocketLaunch,
    },
    {
        to: '/asientos',
        label: 'Libro Diario',
        description: 'Carga y revisión de asientos',
        icon: Notebook,
    },
    {
        to: '/mayor',
        label: 'Libro Mayor',
        description: 'Saldos detallados por cuenta',
        icon: BookBookmark,
    },
    {
        to: '/estados',
        label: 'Estados Contables',
        description: 'Balance, resultados y reportes',
        icon: ChartLineUp,
    },
    {
        to: '/cuentas',
        label: 'Plan de Cuentas',
        description: 'Estructura y clasificación',
        icon: TreeStructure,
    },
    {
        to: '/planillas',
        label: 'Planillas',
        description: 'Cálculos y papeles de trabajo',
        icon: Table,
    },
]

export default function QuickActionsGrid() {
    return (
        <section className="quick-actions">
            <h3 className="quick-actions-title">
                <Lightning size={20} weight="duotone" />
                Accesos Rápidos
            </h3>
            <div className="quick-actions-grid">
                {quickActions.map((action) => {
                    const IconComponent = action.icon
                    return (
                        <Link
                            key={action.to}
                            to={action.to}
                            className="quick-action-card"
                        >
                            <div className="quick-action-icon">
                                <IconComponent size={24} weight="duotone" />
                            </div>
                            <div className="quick-action-content">
                                <span className="quick-action-label">{action.label}</span>
                                <span className="quick-action-desc">{action.description}</span>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
