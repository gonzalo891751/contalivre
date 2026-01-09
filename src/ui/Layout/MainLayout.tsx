import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileTopBar from './MobileTopBar'
import MobileDrawer from './MobileDrawer'
import MobileBottomNav from './MobileBottomNav'
import { loadSeedDataIfNeeded } from '../../storage'
import { useMobileBreakpoint } from '../../hooks/useMobileBreakpoint'

interface Props {
    children: ReactNode
}

// Map routes to page titles
function getPageTitle(pathname: string): string {
    if (pathname === '/') return 'Dashboard'
    if (pathname === '/cuentas') return 'Plan de Cuentas'
    if (pathname === '/asientos') return 'Libro Diario'
    if (pathname === '/mayor') return 'Libro Mayor'
    if (pathname === '/balance') return 'Balance de SyS'
    if (pathname === '/estados') return 'Estados contables'
    if (pathname.startsWith('/planillas')) {
        if (pathname === '/planillas/inventario') return 'Inventario'
        if (pathname === '/planillas/amortizaciones') return 'Amortizaciones'
        return 'Planillas'
    }
    return 'ContaLivre'
}

export default function MainLayout({ children }: Props) {
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const { isMobile } = useMobileBreakpoint()
    const location = useLocation()

    useEffect(() => {
        async function init() {
            try {
                await loadSeedDataIfNeeded()
                setIsLoading(false)
            } catch (err) {
                console.error('Error initializing app:', err)
                setError(err instanceof Error ? err.message : 'Error desconocido')
                setIsLoading(false)
            }
        }
        init()
    }, [])

    const pageTitle = getPageTitle(location.pathname)

    if (isLoading) {
        return (
            <div className="layout">
                {!isMobile && <Sidebar />}
                <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                    <div className="empty-state">
                        <div className="empty-state-icon">⏳</div>
                        <p>Cargando aplicación...</p>
                    </div>
                </main>
            </div>
        )
    }

    if (error) {
        return (
            <div className="layout">
                {!isMobile && <Sidebar />}
                <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                    <div className="alert alert-error">
                        <strong>Error al iniciar:</strong> {error}
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="layout">
            {/* Desktop: Sidebar */}
            {!isMobile && <Sidebar />}

            {/* Mobile: Top Bar + Drawer */}
            {isMobile && (
                <>
                    <MobileTopBar
                        title={pageTitle}
                        onMenuClick={() => setDrawerOpen(true)}
                    />
                    <MobileDrawer
                        isOpen={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                    />
                </>
            )}

            {/* Main Content */}
            <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                {children}
            </main>

            {/* Mobile: Bottom Nav */}
            {isMobile && <MobileBottomNav />}
        </div>
    )
}
