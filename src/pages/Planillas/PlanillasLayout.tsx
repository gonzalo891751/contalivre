import { Outlet, useLocation } from 'react-router-dom'

export default function PlanillasLayout() {
    const location = useLocation()

    // Determine subtitle based on current route
    let subtitle = 'Herramientas de cálculo'

    if (location.pathname.includes('/inventario')) {
        subtitle = 'Inventario periódico (por diferencias)'
    } else if (location.pathname.includes('/amortizaciones')) {
        subtitle = 'Herramientas de cálculo' // Manteniendo el original de AmortizacionesPage
    }

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Planillas complementarias</h1>
                <p className="page-subtitle">{subtitle}</p>
            </header>

            <Outlet />
        </div>
    )
}
