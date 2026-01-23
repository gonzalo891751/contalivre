import { Outlet, useLocation } from 'react-router-dom'

export default function PlanillasLayout() {
    const location = useLocation()
    const isHome = location.pathname === '/planillas' || location.pathname === '/planillas/'

    // Determine subtitle based on current route
    let subtitle = 'Herramientas de cálculo'

    if (location.pathname.includes('/inventario')) {
        subtitle = 'Inventario periódico (por diferencias)'
    } else if (location.pathname.includes('/amortizaciones')) {
        subtitle = 'Herramientas de cálculo'
    } else if (location.pathname.includes('/conciliaciones')) {
        subtitle = 'Conciliación y arqueo'
    } else if (location.pathname.includes('/cierre-valuacion')) {
        subtitle = 'Ajuste por Inflación + Valuación'
    }

    return (
        <div>
            {!isHome && (
                <header className="page-header">
                    <h1 className="page-title">Planillas complementarias</h1>
                    <p className="page-subtitle">{subtitle}</p>
                </header>
            )}

            <Outlet />
        </div>
    )
}
