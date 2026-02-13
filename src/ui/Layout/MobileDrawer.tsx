import { useEffect, useRef, useCallback } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'
import {
    SquaresFour,
    RocketLaunch,
    TreeStructure,
    Notebook,
    BookBookmark,
    Scales,
    ChartLineUp,
    Table,
    Package,
    Truck,
    ShoppingCart,
    Robot,
    type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

interface NavItem {
    path: string
    label: string
    icon: PhosphorIcon
    children?: { path: string; label: string; icon?: PhosphorIcon }[]
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: SquaresFour },
    {
        path: '/operaciones',
        label: 'Operaciones',
        icon: RocketLaunch,
        children: [
            { path: '/operaciones/inventario', label: 'Inventario', icon: Package },
            { path: '/operaciones/proveedores', label: 'Proveedores', icon: Truck },
            { path: '/operaciones/clientes', label: 'Clientes', icon: ShoppingCart },
        ],
    },
    { path: '/cuentas', label: 'Plan de Cuentas', icon: TreeStructure },
    { path: '/asientos', label: 'Libro Diario', icon: Notebook },
    { path: '/mayor', label: 'Libro Mayor', icon: BookBookmark },
    { path: '/balance', label: 'Balance de SyS', icon: Scales },
    { path: '/estados', label: 'Estados contables', icon: ChartLineUp },
    {
        path: '/planillas',
        label: 'Planillas',
        icon: Table,
        children: [
            { path: '/planillas/conciliaciones', label: 'Conciliaciones' },
            { path: '/planillas/amortizaciones', label: 'Amortizaciones' },
            { path: '/planillas/cierre-valuacion', label: 'Cierre: AxI + Valuación' },
        ]
    },
]

interface MobileDrawerProps {
    isOpen: boolean
    onClose: () => void
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null)
    const location = useLocation()
    const startXRef = useRef<number | null>(null)
    const currentXRef = useRef<number>(0)

    // Close on route change
    useEffect(() => {
        if (isOpen) {
            onClose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname])

    // Focus trap and ESC key
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        // Lock body scroll
        document.body.style.overflow = 'hidden'
        document.addEventListener('keydown', handleKeyDown)

        // Focus the drawer
        drawerRef.current?.focus()

        return () => {
            document.body.style.overflow = ''
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, onClose])

    // Swipe to close
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startXRef.current = e.touches[0].clientX
    }, [])

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (startXRef.current === null) return
        currentXRef.current = e.touches[0].clientX - startXRef.current
    }, [])

    const handleTouchEnd = useCallback(() => {
        // If swiped left more than 80px, close
        if (currentXRef.current < -80) {
            onClose()
        }
        startXRef.current = null
        currentXRef.current = 0
    }, [onClose])

    if (!isOpen) return null

    return (
        <div className="mobile-drawer-overlay" onClick={onClose}>
            <div
                ref={drawerRef}
                className="mobile-drawer"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Menu de navegacion"
            >
                {/* Header with Logo */}
                <div className="mobile-drawer-header">
                    <Link
                        to="/"
                        className="mobile-drawer-logo-link"
                        aria-label="Ir a Inicio"
                        onClick={onClose}
                    >
                        <div className="mobile-drawer-logo-icon">
                            <Robot size={24} weight="fill" color="white" />
                        </div>
                        <div className="mobile-drawer-logo-text">
                            <span className="mobile-drawer-title">CONTALIVRE</span>
                            <span className="mobile-drawer-subtitle">Tu asistente contable</span>
                        </div>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="mobile-drawer-nav">
                    {navItems.map((item) => {
                        const IconComponent = item.icon
                        return (
                            <div key={item.path} className="mobile-drawer-nav-group">
                                <NavLink
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `mobile-drawer-link ${isActive ? 'active' : ''}`
                                    }
                                    end={!item.children}
                                >
                                    <IconComponent size={20} className="mobile-drawer-icon" />
                                    {item.label}
                                </NavLink>
                                {item.children && (
                                    <div className="mobile-drawer-children">
                                        {item.children.map((child) => {
                                            const ChildIcon = child.icon
                                            return (
                                            <NavLink
                                                key={child.path}
                                                to={child.path}
                                                className={({ isActive }) =>
                                                    `mobile-drawer-link mobile-drawer-child ${isActive ? 'active' : ''}`
                                                }
                                            >
                                                {ChildIcon && <ChildIcon size={16} className="mobile-drawer-icon" />}
                                                {child.label}
                                            </NavLink>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </nav>

                {/* Footer */}
                <div className="mobile-drawer-footer">
                    <p>&copy; 2026 Gonzalo Mendez</p>
                    <p className="mobile-drawer-version">ContaLivre v1.0.4</p>
                </div>
            </div>
        </div>
    )
}
