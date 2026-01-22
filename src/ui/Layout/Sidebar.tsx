import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
    SquaresFour,
    TreeStructure,
    Notebook,
    BookBookmark,
    Scales,
    ChartLineUp,
    Table,
    CaretRight,
    CaretLeft,
    type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

interface NavItem {
    path: string
    label: string
    icon: PhosphorIcon
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

    // Navigation Groups Definition with Phosphor icons
    const navGroups: NavGroup[] = [
        {
            label: 'PRINCIPAL',
            items: [
                { path: '/', label: 'Dashboard', icon: SquaresFour }
            ]
        },
        {
            label: 'CONTABILIDAD',
            items: [
                { path: '/cuentas', label: 'Plan de Cuentas', icon: TreeStructure },
                { path: '/asientos', label: 'Libro Diario', icon: Notebook },
                { path: '/mayor', label: 'Libro Mayor', icon: BookBookmark },
                { path: '/balance', label: 'Balance de SyS', icon: Scales },
                { path: '/estados', label: 'Estados contables', icon: ChartLineUp },
            ]
        },
        {
            label: 'HERRAMIENTAS',
            items: [
                {
                    path: '/planillas',
                    label: 'Planillas',
                    icon: Table,
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
    }, [location.pathname, isCollapsed])

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
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Navigation */}
            <nav className="sidebar-nav">
                {navGroups.map((group) => (
                    <div key={group.label} className="nav-section">
                        {/* Section Header */}
                        <div className={`sidebar-section-header ${isCollapsed ? 'sr-only' : ''}`}>
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
                                                    <CaretRight size={16} />
                                                </button>
                                            )}

                                            {/* Tooltip for collapsed mode */}
                                            <span className="nav-tooltip">{item.label}</span>
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

            {/* Sidebar Footer */}
            <div className="sidebar-footer">
                {/* Collapse Button (Desktop only) */}
                <button
                    className="sidebar-collapse-btn desktop-only"
                    onClick={onToggle}
                    title={isCollapsed ? 'Expandir menu' : 'Contraer menu'}
                    aria-label={isCollapsed ? 'Expandir menu' : 'Contraer menu'}
                >
                    {isCollapsed ? <CaretRight size={20} /> : <CaretLeft size={20} />}
                </button>

                {/* Credits - hidden when collapsed */}
                {!isCollapsed && (
                    <div className="sidebar-credits">
                        <p>&copy; 2026 Gonzalo Mendez</p>
                        <p>Todos los derechos reservados.</p>
                        <p className="version">ContaLivre v1.0.4</p>
                    </div>
                )}
            </div>
        </aside>
    )
}
