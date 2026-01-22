import { useEffect, useState, type ReactNode } from 'react'

import Sidebar from './Sidebar'
import { TopHeader } from './TopHeader'
import MobileDrawer from './MobileDrawer'
import MobileBottomNav from './MobileBottomNav'
import { loadSeedDataIfNeeded } from '../../storage'
import { useMobileBreakpoint } from '../../hooks/useMobileBreakpoint'

interface Props {
    children: ReactNode
}

export default function MainLayout({ children }: Props) {
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const { isMobile } = useMobileBreakpoint()

    // Sidebar collapse state
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const stored = localStorage.getItem("contalivre.sidebar.collapsed")
        return stored === "true"
    })

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const newState = !prev
            localStorage.setItem("contalivre.sidebar.collapsed", String(newState))
            return newState
        })
    }

    // Sync body class with sidebar collapsed state
    useEffect(() => {
        if (isSidebarCollapsed && !isMobile) {
            document.body.classList.add('sidebar-is-collapsed')
        } else {
            document.body.classList.remove('sidebar-is-collapsed')
        }

        return () => {
            document.body.classList.remove('sidebar-is-collapsed')
        }
    }, [isSidebarCollapsed, isMobile])

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

    if (isLoading) {
        return (
            <div className="cl-shell cl-ui cl-prose">
                <div className={`layout ${!isMobile && isSidebarCollapsed ? 'collapsed' : ''}`}>
                    <TopHeader
                        onMobileMenuClick={() => setDrawerOpen(true)}
                        isMobile={isMobile}
                    />
                    {!isMobile && <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />}
                    <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                        <div className="empty-state">
                            <div className="empty-state-icon">...</div>
                            <p>Cargando aplicacion...</p>
                        </div>
                    </main>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="cl-shell cl-ui cl-prose">
                <div className={`layout ${!isMobile && isSidebarCollapsed ? 'collapsed' : ''}`}>
                    <TopHeader
                        onMobileMenuClick={() => setDrawerOpen(true)}
                        isMobile={isMobile}
                    />
                    {!isMobile && <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />}
                    <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                        <div className="alert alert-error">
                            <strong>Error al iniciar:</strong> {error}
                        </div>
                    </main>
                </div>
            </div>
        )
    }

    return (
        <div className="cl-shell cl-ui cl-prose">
            <div className={`layout ${!isMobile && isSidebarCollapsed ? 'collapsed' : ''}`}>
                {/* New Fixed Header - Always visible */}
                <TopHeader
                    onMobileMenuClick={() => setDrawerOpen(true)}
                    isMobile={isMobile}
                />

                {/* Desktop: Sidebar (below header) */}
                {!isMobile && (
                    <Sidebar
                        isCollapsed={isSidebarCollapsed}
                        onToggle={toggleSidebar}
                    />
                )}

                {/* Mobile: Drawer */}
                {isMobile && (
                    <MobileDrawer
                        isOpen={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                    />
                )}

                {/* Main Content */}
                <main className={`main-content ${isMobile ? 'main-content-mobile' : ''}`}>
                    {children}
                </main>

                {/* Mobile: Bottom Nav */}
                {isMobile && <MobileBottomNav />}
            </div>
        </div>
    )
}
