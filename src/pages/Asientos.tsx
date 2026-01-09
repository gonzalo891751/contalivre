import { Component, ReactNode } from 'react'
import { useMobileBreakpoint } from '../hooks/useMobileBreakpoint'
import AsientosMobile from './AsientosMobile'
import AsientosDesktop from './AsientosDesktop'

// ─────────────────────────────────────────────────────────────────────────────
// Error Boundary for Asientos page
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
    hasError: boolean
    error?: Error
}

interface ErrorBoundaryProps {
    children: ReactNode
}

class AsientosErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    handleReload = () => {
        window.location.reload()
    }

    handleGoHome = () => {
        window.location.href = '/'
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '50vh',
                    gap: '1rem'
                }}>
                    <div style={{ fontSize: '3rem' }}>⚠️</div>
                    <h2 style={{ margin: 0, color: '#374151' }}>
                        Hubo un error al cargar Libro Diario
                    </h2>
                    <p style={{ color: '#6b7280', margin: 0 }}>
                        Intentá recargar la página o volver al inicio.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            onClick={this.handleReload}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'linear-gradient(135deg, #4094DA 0%, #5ca690 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            🔄 Recargar
                        </button>
                        <button
                            onClick={this.handleGoHome}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: '#f3f4f6',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            🏠 Ir a Inicio
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Wrapper Component (NO hooks except the one for mobile detection)
// This ensures consistent hook order regardless of viewport
// ─────────────────────────────────────────────────────────────────────────────

export default function Asientos() {
    const { isMobile } = useMobileBreakpoint()

    return (
        <AsientosErrorBoundary>
            {isMobile ? <AsientosMobile /> : <AsientosDesktop />}
        </AsientosErrorBoundary>
    )
}
