import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger, computeTrialBalance } from '../core'
import { computeStatements } from '../core/statements'
import { resetExercise } from '../storage/entries'
import DashboardCharts from './DashboardCharts'

export default function Dashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [isResetting, setIsResetting] = useState(false)

    const hasEntries = (entries?.length ?? 0) > 0
    const totalAccounts = accounts?.length ?? 0
    const postableCount = accounts?.filter(a => !a.isHeader).length ?? 0
    const headerCount = accounts?.filter(a => a.isHeader).length ?? 0

    // Compute financial statements for charts
    const statements = useMemo(() => {
        if (!accounts || !entries || entries.length === 0) return null
        const ledger = computeLedger(entries, accounts)
        const trialBalance = computeTrialBalance(ledger, accounts)
        return computeStatements(trialBalance, accounts)
    }, [accounts, entries])

    const handleResetExercise = async () => {
        setIsResetting(true)
        try {
            const { deletedEntries } = await resetExercise()
            // Auto close after short delay or keep open to show success?
            // Existing requirement says: "Al éxito: toast/snackbar ...UI se refresca"
            // Since we rely on LiveQuery, UI will refresh automatically when db clears.

            // Just wait a tiny bit to show loading state
            await new Promise(r => setTimeout(r, 500))

            setIsResetModalOpen(false)
            // Simple alert for now as requested fallback, or better:
            // We can show a temporary success message in the dashboard or use window.alert
            // But let's try to notify user nicely.
            setTimeout(() => {
                alert(`Ejercicio reiniciado correctamente. Se eliminaron ${deletedEntries} asientos.`)
            }, 100)

        } catch (error) {
            console.error('Error reseteando ejercicio:', error)
            alert('Error al reiniciar el ejercicio. Por favor intentá nuevamente.')
        } finally {
            setIsResetting(false)
        }
    }

    return (
        <div style={{ paddingBottom: 'var(--space-xl)' }}>
            <header className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">
                    Bienvenido a ContaLivre, tu asistente contable. Desde acá podés acceder a todas las funciones.
                </p>
            </header>

            {/* Charts Section - Now at the top */}
            <DashboardCharts
                statements={statements}
                hasEntries={hasEntries}
                totalAccounts={totalAccounts}
                postableCount={postableCount}
                headerCount={headerCount}
            />

            {/* Quick Access - Now below charts */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="card-header">
                    <h2 className="card-title">Accesos rápidos</h2>
                </div>

                <div className="quick-access-grid">
                    <Link to="/asientos" className="btn btn-primary quick-access-btn">
                        📝 Nuevo asiento
                    </Link>
                    <Link to="/cuentas" className="btn btn-secondary quick-access-btn">
                        📋 Plan de cuentas
                    </Link>
                    <Link to="/mayor" className="btn btn-secondary quick-access-btn">
                        📖 Mayor
                    </Link>
                    <Link to="/balance" className="btn btn-secondary quick-access-btn">
                        ⚖️ Balance de SyS
                    </Link>
                    <Link to="/estados" className="btn btn-secondary quick-access-btn">
                        📈 Estados contables
                    </Link>
                    <Link to="/planillas/amortizaciones" className="btn btn-secondary quick-access-btn">
                        🧮 Planillas
                    </Link>
                </div>
            </div>

            {/* Management Section */}
            <div className="card" style={{ borderColor: 'var(--color-border)' }}>
                <div className="card-header">
                    <h2 className="card-title">Gestión del Ejercicio</h2>
                </div>
                <div style={{ padding: 'var(--space-md)' }}>
                    <p className="text-muted" style={{ marginBottom: 'var(--space-md)' }}>
                        Opciones avanzadas para la administración de los datos contables.
                    </p>
                    <button
                        className="btn"
                        style={{
                            color: '#e02424', // Red-600
                            borderColor: '#e02424',
                            background: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        onClick={() => setIsResetModalOpen(true)}
                        disabled={!hasEntries}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                        Iniciar nuevo ejercicio
                    </button>
                    {!hasEntries && (
                        <span style={{ marginLeft: '12px', fontSize: '0.85em', color: 'var(--color-text-muted)' }}>
                            (No hay asientos registrados)
                        </span>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {isResetModalOpen && (
                <div className="modal-overlay" onClick={() => !isResetting && setIsResetModalOpen(false)}>
                    <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: '#e02424' }}>
                                ⚠️ Iniciar nuevo ejercicio
                            </h3>
                            <button
                                className="btn btn-icon btn-secondary"
                                onClick={() => setIsResetModalOpen(false)}
                                disabled={isResetting}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="alert alert-warning" style={{ background: '#fff5f5', color: '#9b1c1c', border: '1px solid #fed7d7', marginBottom: '16px' }}>
                                <strong>¡Atención!</strong> Esta acción es irreversible.
                            </div>
                            <p style={{ marginBottom: '16px' }}>
                                Se eliminarán <strong>TODOS</strong> los asientos del Libro Diario.
                                El Plan de Cuentas y configuración se mantendrán intactos.
                            </p>
                            {entries && (
                                <p className="text-muted" style={{ fontSize: '0.9em' }}>
                                    Asientos a eliminar: <strong>{entries.length}</strong>
                                </p>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setIsResetModalOpen(false)}
                                disabled={isResetting}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger" // Assuming this class exists or falls back to styles
                                style={{ background: '#c53030', color: 'white' }}
                                onClick={handleResetExercise}
                                disabled={isResetting}
                            >
                                {isResetting ? 'Eliminando...' : 'Sí, eliminar todo y reiniciar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
