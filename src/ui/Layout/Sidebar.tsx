import { useState, useEffect } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'

interface NavItem {
    path: string
    label: string
    icon: string
    children?: { path: string; label: string }[]
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/cuentas', label: 'Plan de Cuentas', icon: '📋' },
    { path: '/asientos', label: 'Libro Diario', icon: '📝' },
    { path: '/mayor', label: 'Libro mayor', icon: '📖' },
    { path: '/balance', label: 'Balance de SyS', icon: '⚖️' },
    { path: '/estados', label: 'Estados contables', icon: '📈' },
    {
        path: '/planillas',
        label: 'Planillas',
        icon: '🧮',
        children: [
            { path: '/planillas/inventario', label: 'Inventario' },
            { path: '/planillas/conciliaciones', label: 'Conciliaciones' },
            { path: '/planillas/amortizaciones', label: 'Amortizaciones' },
        ]
    },
]

interface SidebarProps {
    isCollapsed: boolean
    onToggle: () => void
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const location = useLocation()

    // Auto-expand based on current location
    useEffect(() => {
        if (isCollapsed) return // Don't auto-expand accordion in collapsed mode

        navItems.forEach(item => {
            if (item.children) {
                if (location.pathname.startsWith(item.path)) {
                    setExpandedGroups(prev => new Set(prev).add(item.path))
                }
            }
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
            {/* Header with Logo + Toggle */}
            <div className="sidebar-header-row">
                <div className="sidebar-logo">
                    <Link to="/" aria-label="Ir a Inicio" title={isCollapsed ? "ContaLivre" : undefined}>
                        <img
                            src="/brand/contalivre-logo-v2.png"
                            alt="ContaLivre"
                            className="sidebar-logo-img"
                        />
                    </Link>
                </div>

                <button
                    onClick={onToggle}
                    className="sidebar-toggle-btn"
                    aria-label={isCollapsed ? "Expandir menú" : "Plegar menú"}
                    title={isCollapsed ? "Expandir menú" : "Plegar menú"}
                >
                    {isCollapsed ? '›' : '‹'}
                </button>
            </div>

            <div className={`sidebar-titles ${isCollapsed ? 'sr-only' : ''}`}>
                <h1 className="sidebar-title">ContaLivre</h1>
                <p className="sidebar-subtitle">Tu asistente contable</p>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const isExpanded = expandedGroups.has(item.path)
                    const hasChildren = !!item.children

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
                                    onClick={(e) => {
                                        if (hasChildren && !isCollapsed) {
                                            // Optional: click parent to toggle? 
                                            // Default: navigate (if parent has path) or toggle?
                                            // Logic says: item.path is valid defined path like /planillas
                                            // So let's allow navigation.
                                        }
                                    }}
                                >
                                    <div className={`flex items-center flex-1 ${isCollapsed ? 'justify-center mx-auto' : ''}`}>
                                        <span className={`icon ${isCollapsed ? 'icon-large' : ''}`}>{item.icon}</span>
                                        {!isCollapsed && <span className="item-label">{item.label}</span>}
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
                                            ›
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
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: 'var(--space-lg)' }} className={isCollapsed ? 'hidden-text' : ''}>
                <p style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>
                    {!isCollapsed ? 'ContaLivre v1.0' : 'v1.0'}
                </p>
            </div>

            {/* Inline styles kept for backwards compatibility but most moved to index.css */}
            <style>{`
                .nav-group {
                    display: flex;
                    flex-direction: column;
                    position: relative; /* For flyout positioning */
                }
                .nav-item-row {
                    position: relative;
                }
                .flex { display: flex; }
                .items-center { align-items: center; }
                .justify-center { justify-content: center; }
                .mx-auto { margin-left: auto; margin-right: auto; }
                .flex-1 { flex: 1; }
                
                .group-toggle {
                    background: none;
                    border: none;
                    color: inherit;
                    font-size: 1.2rem;
                    cursor: pointer;
                    padding: 0 8px;
                    transition: transform 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    opacity: 0.7;
                }
                .group-toggle:hover {
                    opacity: 1;
                    background-color: rgba(255,255,255,0.1);
                    border-radius: 4px;
                }
                .group-toggle.expanded {
                    transform: rotate(90deg);
                }
                
                .nav-children {
                    display: flex;
                    flex-direction: column;
                    padding-left: 12px; 
                }
                .sub-link {
                    font-size: 0.9em;
                    opacity: 0.9;
                }
                /* Indentation for normal tree */
                .nav-children .sub-link {
                    padding-left: 36px !important;
                }

                .sub-link.active {
                    font-weight: 600;
                    opacity: 1;
                }
                .sidebar-link {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .item-label {
                    margin-left: 0.5rem;
                }
                
                /* Collapsed specifics helper classes */
                .sidebar-header-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: var(--space-sm);
                }
                .sidebar-toggle-btn {
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1rem;
                    transition: all 0.2s;
                }
                .sidebar-toggle-btn:hover {
                    background: rgba(255,255,255,0.2);
                }
                
                .hidden-text {
                    text-align: center;
                }

                /* Flyout styles basics - Refined in index.css */
                .nav-children-flyout {
                    display: none;
                    position: absolute;
                    left: 100%; /* Right of sidebar */
                    top: 0;
                    background: white; /* Will be refined in index.css to match theme */
                    min-width: 180px;
                    border-radius: 0 8px 8px 0;
                    box-shadow: 4px 0 10px rgba(0,0,0,0.1);
                    padding: 8px 0;
                    z-index: 999;
                    flex-direction: column;
                }
                
                .nav-group:hover .nav-children-flyout {
                    display: flex;
                    animation: fadeIn 0.1s ease-out;
                }
                
                .nav-children-flyout .sub-link {
                    color: var(--color-text); /* Override sidebar white text */
                    padding: 8px 16px !important;
                }
                .nav-children-flyout .sub-link:hover {
                    background: var(--color-info-bg);
                    color: var(--color-primary);
                }
                
                .flyout-header {
                    padding: 8px 16px;
                    font-weight: bold;
                    color: var(--color-text-secondary);
                    border-bottom: 1px solid var(--color-border);
                    margin-bottom: 4px;
                    font-size: 0.85rem;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(-5px); }
                    to { opacity: 1; transform: translateX(0); }
                }

            `}</style>
        </aside>
    )
}
