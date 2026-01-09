import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger, computeTrialBalance } from '../core'
import { computeStatements } from '../core/statements'
import DashboardCharts from './DashboardCharts'

export default function Dashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray())
    const entries = useLiveQuery(() => db.entries.toArray())
    const [balanceStatus, setBalanceStatus] = useState<'balanced' | 'unbalanced' | 'empty'>('empty')

    useEffect(() => {
        if (accounts && entries && entries.length > 0) {
            const ledger = computeLedger(entries, accounts)
            const trialBalance = computeTrialBalance(ledger, accounts)
            setBalanceStatus(trialBalance.isBalanced ? 'balanced' : 'unbalanced')
        } else {
            setBalanceStatus('empty')
        }
    }, [accounts, entries])

    const lastEntry = entries?.length ? entries[entries.length - 1] : null
    const postableCount = accounts?.filter(a => !a.isHeader).length ?? 0
    const headerCount = accounts?.filter(a => a.isHeader).length ?? 0
    const hasEntries = (entries?.length ?? 0) > 0

    // Compute financial statements for charts
    const statements = useMemo(() => {
        if (!accounts || !entries || entries.length === 0) return null
        const ledger = computeLedger(entries, accounts)
        const trialBalance = computeTrialBalance(ledger, accounts)
        return computeStatements(trialBalance, accounts)
    }, [accounts, entries])

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    }

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">
                    Bienvenido a ContaLivre, tu asistente contable. Desde acá podés acceder a todas las funciones.
                </p>
            </header>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">📋</div>
                    <div className="stat-content">
                        <div className="stat-value">{accounts?.length ?? 0}</div>
                        <div className="stat-label">
                            Cuentas totales
                            <br />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                ({postableCount} imputables, {headerCount} rubros)
                            </span>
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">📝</div>
                    <div className="stat-content">
                        <div className="stat-value">{entries?.length ?? 0}</div>
                        <div className="stat-label">Asientos registrados</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <div className="stat-value">
                            {lastEntry ? formatDate(lastEntry.date) : '—'}
                        </div>
                        <div className="stat-label">Último asiento</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div
                        className="stat-icon"
                        style={{
                            background:
                                balanceStatus === 'balanced'
                                    ? 'var(--color-success-bg)'
                                    : balanceStatus === 'unbalanced'
                                        ? 'var(--color-error-bg)'
                                        : 'var(--color-info-bg)',
                            color:
                                balanceStatus === 'balanced'
                                    ? 'var(--color-success)'
                                    : balanceStatus === 'unbalanced'
                                        ? 'var(--color-error)'
                                        : 'var(--color-info)',
                        }}
                    >
                        {balanceStatus === 'balanced' ? '✓' : balanceStatus === 'unbalanced' ? '✗' : '—'}
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">
                            {balanceStatus === 'balanced'
                                ? 'Cuadra'
                                : balanceStatus === 'unbalanced'
                                    ? 'No cuadra'
                                    : 'Sin datos'}
                        </div>
                        <div className="stat-label">Estado del balance</div>
                    </div>
                </div>
            </div>

            <div className="card">
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
                        ⚖️ Balance
                    </Link>
                    <Link to="/estados" className="btn btn-secondary quick-access-btn">
                        📈 Estados
                    </Link>
                    <Link to="/practica" className="btn btn-secondary quick-access-btn">
                        🎯 Práctica
                    </Link>
                </div>
            </div>

            {/* Charts Section */}
            <DashboardCharts
                statements={statements}
                hasEntries={hasEntries}
            />

            {entries?.length === 0 && (
                <div className="alert alert-info" style={{ marginTop: 'var(--space-xl)' }}>
                    <div>
                        <strong>¡Empezá a practicar!</strong>
                        <p style={{ margin: '0.5rem 0 0 0' }}>
                            Todavía no hay asientos registrados. Andá a{' '}
                            <Link to="/asientos">Libro Diario</Link> para cargar tu primer asiento.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
