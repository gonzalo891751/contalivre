import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

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
            { path: '/planillas/amortizaciones', label: 'Amortizaciones' },
        ]
    },
]

type LogoState = 'svg' | 'png' | 'emoji'

export default function Sidebar() {
    const [logoState, setLogoState] = useState<LogoState>('svg')
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const location = useLocation()

    // Auto-expand based on current location
    useEffect(() => {
        navItems.forEach(item => {
            if (item.children) {
                // If we are currently in a child path, ensure group is expanded
                // Or if we are exactly on the parent path (/planillas)
                if (location.pathname.startsWith(item.path)) {
                    setExpandedGroups(prev => new Set(prev).add(item.path))
                }
            }
        })
    }, [location.pathname])

    const handleLogoError = () => {
        if (logoState === 'svg') {
            setLogoState('png')
        } else if (logoState === 'png') {
            setLogoState('emoji')
        }
    }

    const toggleGroup = (path: string) => {
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



    const logoSrc = logoState === 'svg'
        ? '/brand/ContaLivresf.svg'
        : '/brand/contalivre-logo.png'

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                {logoState !== 'emoji' ? (
                    <img
                        src={logoSrc}
                        alt="ContaLivre"
                        className="sidebar-logo-img"
                        onError={handleLogoError}
                    />
                ) : (
                    <span className="sidebar-logo-emoji">📚</span>
                )}
            </div>
            <h1 className="sidebar-title">ContaLivre</h1>
            <p className="sidebar-subtitle">Tu asistente contable</p>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const isExpanded = expandedGroups.has(item.path)
                    const hasChildren = !!item.children


                    return (
                        <div key={item.path} className="nav-group">
                            <div className="nav-item-row">
                                <NavLink
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `sidebar-link ${isActive ? 'active' : ''}`
                                    }
                                    end={!hasChildren} // Only match exact for parent if it has children? No, highlighting parent for children is requested.
                                // Req: "Si estoy en cualquier /planillas/*, el item padre “Planillas” debe verse activo"
                                // NavLink handles this partially but we might need manual class if we want strict control.
                                // Actually default NavLink active matches startsWith by default in older versions, but v6 ends by default?
                                // NavLink v6 matches if nested route matches.
                                // Let's rely on NavLink logic or custom class.
                                >
                                    <div className="flex items-center flex-1">
                                        <span className="icon">{item.icon}</span>
                                        {item.label}
                                    </div>
                                    {hasChildren && (
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
                                    className="nav-children"
                                    style={{
                                        maxHeight: isExpanded ? '500px' : '0',
                                        opacity: isExpanded ? 1 : 0,
                                        overflow: 'hidden',
                                        transition: 'all 0.3s ease-in-out'
                                    }}
                                >
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

            <div style={{ marginTop: 'auto', paddingTop: 'var(--space-lg)' }}>
                <p style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>
                    ContaLivre v1.0
                </p>
            </div>

            <style>{`
                .nav-group {
                    display: flex;
                    flex-direction: column;
                }
                .nav-item-row {
                    position: relative;
                }
                .flex { display: flex; }
                .items-center { align-items: center; }
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
                    padding-left: 36px !important; /* Indent to align with text */
                    opacity: 0.9;
                }
                .sub-link.active {
                    font-weight: 600;
                    opacity: 1;
                    /* Maybe a left border or dot? */
                }
                .sidebar-link {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
            `}</style>
        </aside>
    )
}
