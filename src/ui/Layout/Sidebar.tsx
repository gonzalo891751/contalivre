import { useState, useEffect } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'
import {
    LayoutDashboard,
    FolderTree,
    NotebookPen,
    Library,
    Scale,
    FileChartColumn,
    Table2,
    ChevronRight,
    Moon,
    Sun,
    PanelLeftOpen,
    PanelLeftClose,
    type LucideIcon
} from 'lucide-react'

interface NavItem {
    path: string
    label: string
    icon: LucideIcon
    children?: { path: string; label: string }[]
}

interface NavGroup {
    label: string
    items: NavItem[]
}

interface SidebarProps {
    isCollapsed: boolean
    onToggle: () => void
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const location = useLocation()

    // Sidebar-only theme state (not global)
    const [sidebarTheme, setSidebarTheme] = useState<'light' | 'dark'>(() => {
        const stored = localStorage.getItem('contalivre.sidebarTheme')
        return stored === 'dark' ? 'dark' : 'light'
    })

    const toggleSidebarTheme = () => {
        setSidebarTheme(prev => {
            const next = prev === 'light' ? 'dark' : 'light'
            localStorage.setItem('contalivre.sidebarTheme', next)
            return next
        })
    }

    // Navigation Groups Definition
    const navGroups: NavGroup[] = [
        {
            label: 'PRINCIPAL',
            items: [
                { path: '/', label: 'Dashboard', icon: LayoutDashboard }
            ]
        },
        {
            label: 'CONTABILIDAD',
            items: [
                { path: '/cuentas', label: 'Plan de Cuentas', icon: FolderTree },
                { path: '/asientos', label: 'Libro Diario', icon: NotebookPen },
                { path: '/mayor', label: 'Libro Mayor', icon: Library },
                { path: '/balance', label: 'Balance de SyS', icon: Scale },
                { path: '/estados', label: 'Estados contables', icon: FileChartColumn },
            ]
        },
        {
            label: 'HERRAMIENTAS',
            items: [
                {
                    path: '/planillas',
                    label: 'Planillas',
                    icon: Table2,
                    children: [
                        { path: '/planillas/inventario', label: 'Inventario' },
                        { path: '/planillas/conciliaciones', label: 'Conciliaciones' },
                        { path: '/planillas/amortizaciones', label: 'Amortizaciones' },
                    ]
                },
            ]
        }
    ]

    // Auto-expand based on current location
    useEffect(() => {
        if (isCollapsed) return

        navGroups.forEach(group => {
            group.items.forEach(item => {
                if (item.children) {
                    if (location.pathname.startsWith(item.path)) {
                        setExpandedGroups(prev => new Set(prev).add(item.path))
                    }
                }
            })
        })
    }, [location.pathname, isCollapsed]) // Dependencies should ideally include navGroups but it's constant

    const toggleGroup = (path: string) => {
        if (isCollapsed) return
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }

    return (
        <aside
            className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
            data-theme={sidebarTheme}
        >
            {/* Header with Logo + Toggle */}
            <div className="sidebar-header-row !mb-0 !pb-3">
                <div className="sidebar-logo !mb-0">
                    <Link to="/" aria-label="Ir a Inicio" title={isCollapsed ? "ContaLivre" : undefined}>
                        <img
                            src="/brand/logo-for-dark-bg.png"
                            alt="ContaLivre"
                            className="sidebar-logo-img"
                        />
                    </Link>
                </div>
            </div>

            {/* Separator - Subtle line */}
            <div className={`px-4 transition-all duration-300 ${isCollapsed ? 'my-2' : 'my-3'}`}>
                <div className="h-px bg-slate-200/60 dark:bg-slate-700/50" />
            </div>

            <nav className="sidebar-nav">
                {navGroups.map((group) => (
                    <div key={group.label} className="nav-section">
                        {/* Section Header */}
                        <div className={`sidebar-section-header !pt-2 !pb-2 ${isCollapsed ? 'sr-only' : ''}`}>
                            {group.label}
                        </div>

                        {group.items.map((item) => {
                            const isExpanded = expandedGroups.has(item.path)
                            const hasChildren = !!item.children
                            const IconComponent = item.icon

                            return (
                                <div key={item.path} className={`nav-group ${isCollapsed ? 'item-collapsed' : ''}`}>
                                    <div className="nav-item-row">
                                        <NavLink
                                            to={item.path}
                                            className={({ isActive }) =>
                                                `sidebar-link ${isActive ? 'active' : ''}`
                                            }
                                            title={isCollapsed ? item.label : undefined}
                                            end={!hasChildren}
                                        >
                                            <div className={`sidebar-link-content ${isCollapsed ? 'collapsed' : ''}`}>
                                                <IconComponent
                                                    size={20}
                                                    strokeWidth={2}
                                                    className="sidebar-icon"
                                                />
                                                {!isCollapsed && <span className="sidebar-link-label">{item.label}</span>}
                                            </div>

                                            {!isCollapsed && hasChildren && (
                                                <button
                                                    className={`group-toggle ${isExpanded ? 'expanded' : ''}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        toggleGroup(item.path);
                                                    }}
                                                    aria-label={isExpanded ? "Colapsar" : "Expandir"}
                                                    aria-expanded={isExpanded}
                                                >
                                                    <ChevronRight size={16} strokeWidth={2} />
                                                </button>
                                            )}
                                        </NavLink>
                                    </div>

                                    {hasChildren && (
                                        <div
                                            className={isCollapsed ? "nav-children-flyout" : "nav-children"}
                                            style={!isCollapsed ? {
                                                maxHeight: isExpanded ? '500px' : '0',
                                                opacity: isExpanded ? 1 : 0,
                                                overflow: 'hidden',
                                                transition: 'all 0.3s ease-in-out'
                                            } : undefined}
                                        >
                                            {isCollapsed && <div className="flyout-header">{item.label}</div>}
                                            {item.children!.map(child => (
                                                <NavLink
                                                    key={child.path}
                                                    to={child.path}
                                                    className={({ isActive }) =>
                                                        `sidebar-link sub-link ${isActive ? 'active' : ''}`
                                                    }
                                                >
                                                    {child.label}
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* Premium Footer */}
            <div className="sidebar-footer">
                <div className="sidebar-footer-row">
                    {!isCollapsed && <span className="sidebar-footer-label">Modo Oscuro</span>}
                    <button
                        className="sidebar-footer-btn"
                        onClick={toggleSidebarTheme}
                        title={sidebarTheme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
                        aria-label={sidebarTheme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
                    >
                        {sidebarTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>
                </div>
                <div className="sidebar-footer-row">
                    {!isCollapsed && <span className="sidebar-footer-version">v1.0</span>}
                    <button
                        className="sidebar-footer-btn"
                        onClick={onToggle}
                        title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                        aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                    >
                        {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>
                </div>
            </div>
        </aside>
    )
}
