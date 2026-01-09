import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger, computeTrialBalance } from '../core'
import { computeStatements } from '../core/statements'
import DashboardCharts from './DashboardCharts'

export default function Dashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

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

    return (
        <div>
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
        </div>
    )
}
