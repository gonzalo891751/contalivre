import { useLocation, NavLink } from 'react-router-dom'

interface MobileBottomNavProps {
    className?: string
}

interface NavItem {
    path: string
    label: string
    icon: string
}

// 5 items: Inicio | Mayor | (FAB Nuevo Asiento) | Estados | Planillas
// NO incluye "Cuentas" - eso va en el drawer
const navItems: NavItem[] = [
    { path: '/', label: 'Inicio', icon: '📊' },
    { path: '/mayor', label: 'Mayor', icon: '📖' },
    // FAB goes in the middle (handled separately)
    { path: '/estados', label: 'Estados', icon: '📈' },
    { path: '/planillas', label: 'Planillas', icon: '🧮' },
]

export default function MobileBottomNav({ className = '' }: MobileBottomNavProps) {
    const location = useLocation()

    // Check if current path matches or starts with the nav item path
    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    return (
        <nav className={`mobile-bottom-nav ${className}`} aria-label="Navegación principal">
            {/* First 2 items: Inicio, Mayor */}
            {navItems.slice(0, 2).map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
                    aria-current={isActive(item.path) ? 'page' : undefined}
                >
                    <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="mobile-nav-label">{item.label}</span>
                </NavLink>
            ))}

            {/* Center FAB - New Entry */}
            <div className="mobile-fab-container">
                <NavLink
                    to="/asientos"
                    className={`mobile-fab ${isActive('/asientos') ? 'active' : ''}`}
                    aria-label="Nuevo asiento"
                >
                    <span className="mobile-fab-icon" aria-hidden="true">📝</span>
                    <span className="mobile-fab-label">Nuevo</span>
                </NavLink>
            </div>

            {/* Last 2 items: Estados, Planillas */}
            {navItems.slice(2).map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
                    aria-current={isActive(item.path) ? 'page' : undefined}
                >
                    <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="mobile-nav-label">{item.label}</span>
                </NavLink>
            ))}
        </nav>
    )
}
