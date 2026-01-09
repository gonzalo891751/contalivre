import { NavLink } from 'react-router-dom'

const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/cuentas', label: 'Plan de Cuentas', icon: '📋' },
    { path: '/asientos', label: 'Libro Diario', icon: '📝' },
    { path: '/mayor', label: 'Mayor', icon: '📖' },
    { path: '/balance', label: 'Balance', icon: '⚖️' },
    { path: '/estados', label: 'Estados', icon: '📈' },
    { path: '/practica', label: 'Práctica', icon: '🎯' },
]

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <img
                    src="/brand/contalivre-logo.png"
                    alt="ContaLivre"
                    style={{ maxHeight: '42px', width: 'auto', objectFit: 'contain' }}
                    onError={(e) => {
                        const img = e.currentTarget
                        const fallbackSpan = img.nextElementSibling as HTMLSpanElement
                        // Hide image and show emoji fallback
                        img.style.display = 'none'
                        if (fallbackSpan) fallbackSpan.style.display = 'inline'
                    }}
                />
                <span className="sidebar-logo-fallback" style={{ display: 'none', fontSize: '32px' }}>📚</span>
            </div>
            <h1 className="sidebar-title">ContaLivre</h1>
            <p className="sidebar-subtitle">Tu asistente contable</p>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `sidebar-link ${isActive ? 'active' : ''}`
                        }
                    >
                        <span className="icon">{item.icon}</span>
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: 'var(--space-lg)' }}>
                <p style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>
                    ContaLivre v1.0
                </p>
            </div>
        </aside>
    )
}
