import { useEffect, useState, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import { loadSeedDataIfNeeded } from '../../storage'

interface Props {
    children: ReactNode
}

export default function MainLayout({ children }: Props) {
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
            <div className="layout">
                <Sidebar />
                <main className="main-content">
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
                <Sidebar />
                <main className="main-content">
                    <div className="alert alert-error">
                        <strong>Error al iniciar:</strong> {error}
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="layout">
            <Sidebar />
            <main className="main-content">{children}</main>
        </div>
    )
}
