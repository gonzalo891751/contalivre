import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { HelpPanel } from '../ui/HelpPanel'

export default function Mayor() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())
    const [selectedAccountId, setSelectedAccountId] = useState('')

    const ledger = useMemo(() => {
        if (!accounts || !entries) return null
        return computeLedger(entries, accounts)
    }, [accounts, entries])

    const selectedAccount = accounts?.find((a) => a.id === selectedAccountId)
    const ledgerAccount = ledger && selectedAccountId ? ledger.get(selectedAccountId) : null

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
        })
    }

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Libro Mayor</h1>
                <p className="page-subtitle">
                    Consultá los movimientos y saldo de cada cuenta.
                </p>
            </header>

            <HelpPanel title="¿Qué es el Mayor?">
                <p>
                    El <strong>Libro Mayor</strong> agrupa todos los movimientos de una cuenta.
                    Muestra todo lo que entró al Debe y todo lo que entró al Haber, más el saldo
                    resultante.
                </p>
                <p>
                    La cuenta "T" es una forma visual clásica de representar el mayor: Debe a la
                    izquierda, Haber a la derecha.
                </p>
            </HelpPanel>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="account-select">
                        Seleccioná una cuenta
                    </label>
                    <select
                        id="account-select"
                        className="form-select"
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        style={{ maxWidth: '400px' }}
                    >
                        <option value="">Elegir cuenta...</option>
                        {accounts?.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name} ({acc.type})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedAccount && ledgerAccount && (
                <>
                    {/* T-Account View */}
                    <div className="t-account" style={{ maxWidth: '600px', marginBottom: 'var(--space-xl)' }}>
                        <div className="t-account-header">
                            {selectedAccount.code} - {selectedAccount.name}
                        </div>
                        <div className="t-account-body">
                            <div className="t-account-side debit">
                                <div className="t-account-side-header">Debe</div>
                                {ledgerAccount.movements
                                    .filter((m) => m.debit > 0)
                                    .map((m, i) => (
                                        <div key={i} className="t-account-row">
                                            <span>{formatDate(m.date)}</span>
                                            <span>${formatAmount(m.debit)}</span>
                                        </div>
                                    ))}
                                <div className="t-account-row t-account-total">
                                    <span>Total</span>
                                    <span>${formatAmount(ledgerAccount.totalDebit)}</span>
                                </div>
                            </div>

                            <div className="t-account-side credit">
                                <div className="t-account-side-header">Haber</div>
                                {ledgerAccount.movements
                                    .filter((m) => m.credit > 0)
                                    .map((m, i) => (
                                        <div key={i} className="t-account-row">
                                            <span>{formatDate(m.date)}</span>
                                            <span>${formatAmount(m.credit)}</span>
                                        </div>
                                    ))}
                                <div className="t-account-row t-account-total">
                                    <span>Total</span>
                                    <span>${formatAmount(ledgerAccount.totalCredit)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Balance summary */}
                    <div className="card" style={{ maxWidth: '600px', marginBottom: 'var(--space-xl)' }}>
                        <div className="flex-between">
                            <div>
                                <strong>Saldo de la cuenta:</strong>
                            </div>
                            <div className="font-mono" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
                                ${formatAmount(Math.abs(ledgerAccount.balance))}
                                <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginLeft: 'var(--space-sm)' }}>
                                    ({ledgerAccount.balance >= 0 ? 'Deudor' : 'Acreedor'})
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Detailed movements table */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Movimientos detallados</h3>
                        </div>

                        {ledgerAccount.movements.length === 0 ? (
                            <div className="empty-state">
                                <p>Esta cuenta no tiene movimientos</p>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Concepto</th>
                                            <th className="text-right">Debe</th>
                                            <th className="text-right">Haber</th>
                                            <th className="text-right">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledgerAccount.movements.map((m, i) => (
                                            <tr key={i}>
                                                <td>{formatDate(m.date)}</td>
                                                <td>{m.memo || m.description || '-'}</td>
                                                <td className="table-number">
                                                    {m.debit > 0 ? `$${formatAmount(m.debit)}` : '-'}
                                                </td>
                                                <td className="table-number">
                                                    {m.credit > 0 ? `$${formatAmount(m.credit)}` : '-'}
                                                </td>
                                                <td className="table-number">
                                                    ${formatAmount(Math.abs(m.balance))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!selectedAccountId && (
                <div className="empty-state">
                    <div className="empty-state-icon">📖</div>
                    <p>Seleccioná una cuenta para ver sus movimientos</p>
                </div>
            )}
        </div>
    )
}
