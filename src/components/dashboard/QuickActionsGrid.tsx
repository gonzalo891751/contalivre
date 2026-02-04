import { Link } from 'react-router-dom'
import { Activity, Building2, Coins, FileDown, FileText, PieChart, Zap, type LucideIcon } from 'lucide-react'

interface QuickAction {
    title: string
    description: string
    to: string
    icon: LucideIcon
}

const quickActions: QuickAction[] = [
    {
        title: 'Operaciones',
        description: 'Inventario, bienes de uso e impuestos.',
        to: '/operaciones',
        icon: Activity,
    },
    {
        title: 'Libro Diario',
        description: 'Carga y revision de asientos.',
        to: '/asientos',
        icon: FileText,
    },
    {
        title: 'Libro Mayor',
        description: 'Saldos y movimientos por cuenta.',
        to: '/mayor',
        icon: Coins,
    },
    {
        title: 'Estados Contables',
        description: 'Balance, SyS y reportes de cierre.',
        to: '/estados',
        icon: PieChart,
    },
    {
        title: 'Plan de Cuentas',
        description: 'Gestion de cuentas y rubros.',
        to: '/cuentas',
        icon: Building2,
    },
    {
        title: 'Planillas',
        description: 'Papeles de trabajo y calculos.',
        to: '/planillas',
        icon: FileDown,
    },
]

export default function QuickActionsGrid() {
    return (
        <section className="dashboard-quick-actions">
            <div className="dashboard-section-header">
                <h3 className="dashboard-section-title">
                    <Zap size={20} />
                    Accesos Rapidos
                </h3>
            </div>

            <div className="quick-actions-grid">
                {quickActions.map((action) => {
                    const Icon = action.icon
                    return (
                        <Link key={action.to} to={action.to} className="quick-action-card">
                            <span className="quick-action-icon">
                                <Icon size={20} />
                            </span>
                            <span className="quick-action-content">
                                <span className="quick-action-title">{action.title}</span>
                                <span className="quick-action-desc">{action.description}</span>
                            </span>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
