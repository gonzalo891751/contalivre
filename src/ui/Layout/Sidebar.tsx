import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/cuentas', label: 'Plan de Cuentas', icon: '📋' },
    { path: '/asientos', label: 'Libro Diario', icon: '📝' },
    { path: '/mayor', label: 'Libro mayor', icon: '📖' },
    { path: '/balance', label: 'Balance de SyS', icon: '⚖️' },
    { path: '/estados', label: 'Estados contables', icon: '📈' },
    { path: '/planillas/amortizaciones', label: 'Planillas', icon: '🧮' },
]

type LogoState = 'svg' | 'png' | 'emoji'

export default function Sidebar() {
    const [logoState, setLogoState] = useState<LogoState>('svg')

    const handleLogoError = () => {
        if (logoState === 'svg') {
            setLogoState('png')
        } else if (logoState === 'png') {
            setLogoState('emoji')
        }
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
