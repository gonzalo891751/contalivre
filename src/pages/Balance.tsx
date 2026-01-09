import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance, getBalanceStatusMessage } from '../core/balance'
import { HelpPanel } from '../ui/HelpPanel'

const KIND_BADGES: Record<string, string> = {
    ASSET: 'badge-activo',
    LIABILITY: 'badge-pasivo',
    EQUITY: 'badge-patrimonio',
    INCOME: 'badge-ingreso',
    EXPENSE: 'badge-gasto',
}

const KIND_LABELS: Record<string, string> = {
    ASSET: 'Activo',
    LIABILITY: 'Pasivo',
    EQUITY: 'PN',
    INCOME: 'Ingreso',
    EXPENSE: 'Gasto',
}

export default function Balance() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const trialBalance = useMemo(() => {
        if (!accounts || !entries) return null
        const ledger = computeLedger(entries, accounts)
        return computeTrialBalance(ledger, accounts)
    }, [accounts, entries])

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    if (!trialBalance) {
        return (
            <div>
                <header className="page-header">
                    <h1 className="page-title">Balance de Sumas y Saldos</h1>
                </header>
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <p>Cargando...</p>
                </div>
            </div>
        )
    }

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Balance de Sumas y Saldos</h1>
                <p className="page-subtitle">
                    Verificá que los totales de Debe y Haber coincidan.
                </p>
            </header>

            <HelpPanel title="¿Qué es el Balance de Sumas y Saldos?">
                <p>
                    El <strong>Balance de Sumas y Saldos</strong> (o Balance de Comprobación) resume
                    todos los movimientos del período. Muestra para cada cuenta:
                </p>
                <ul style={{ marginLeft: 'var(--space-lg)' }}>
                    <li><strong>Sumas:</strong> Total de débitos y créditos registrados</li>
                    <li><strong>Saldos:</strong> La diferencia (saldo deudor o acreedor)</li>
                </ul>
                <p>
                    Si todos los asientos están bien, la columna de Debe total es igual a la de
                    Haber total, y lo mismo para los saldos. Si no cuadra, hay un error en algún asiento.
                </p>
            </HelpPanel>

            {/* Status indicator */}
            <div className={`alert ${trialBalance.isBalanced ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 'var(--space-lg)' }}>
                {getBalanceStatusMessage(trialBalance)}
            </div>

            {trialBalance.rows.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">⚖️</div>
                        <p>No hay movimientos para mostrar. Cargá algunos asientos primero.</p>
                    </div>
                </div>
            ) : (
                <div className="card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Cuenta</th>
                                    <th>Tipo</th>
                                    <th className="text-right">Σ Debe</th>
                                    <th className="text-right">Σ Haber</th>
                                    <th className="text-right">Saldo Deudor</th>
                                    <th className="text-right">Saldo Acreedor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trialBalance.rows.map((row) => (
                                    <tr key={row.account.id}>
                                        <td className="font-mono">{row.account.code}</td>
                                        <td>{row.account.name}</td>
                                        <td>
                                            <span className={`badge ${KIND_BADGES[row.account.kind]}`}>
                                                {KIND_LABELS[row.account.kind]}
                                            </span>
                                        </td>
                                        <td className="table-number">${formatAmount(row.sumDebit)}</td>
                                        <td className="table-number">${formatAmount(row.sumCredit)}</td>
                                        <td className="table-number">
                                            {row.balanceDebit > 0 ? `$${formatAmount(row.balanceDebit)}` : '-'}
                                        </td>
                                        <td className="table-number">
                                            {row.balanceCredit > 0 ? `$${formatAmount(row.balanceCredit)}` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ fontWeight: 700, background: 'var(--color-bg)' }}>
                                    <td colSpan={3}>TOTALES</td>
                                    <td className="table-number">${formatAmount(trialBalance.totalSumDebit)}</td>
                                    <td className="table-number">${formatAmount(trialBalance.totalSumCredit)}</td>
                                    <td className="table-number">${formatAmount(trialBalance.totalBalanceDebit)}</td>
                                    <td className="table-number">${formatAmount(trialBalance.totalBalanceCredit)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
