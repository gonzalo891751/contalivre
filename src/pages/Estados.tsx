import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance } from '../core/balance'
import { computeStatements, getStatementsStatusMessage } from '../core/statements'
import { HelpPanel } from '../ui/HelpPanel'
import type { StatementSection } from '../core/models'

function SectionDisplay({
    section,
    showNetTotal = false,
}: {
    section: StatementSection
    showNetTotal?: boolean
}) {
    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    if (section.accounts.length === 0) {
        return null
    }

    return (
        <div className="statement-group">
            <div className="statement-group-title">{section.label}</div>
            {section.accounts.map((item) => (
                <div
                    key={item.account.id}
                    className={`statement-row ${item.isContra ? 'text-muted' : ''}`}
                    style={{ fontStyle: item.isContra ? 'italic' : 'normal' }}
                >
                    <span>
                        {item.isContra ? '(-) ' : ''}
                        {item.account.name}
                    </span>
                    <span className="statement-value">
                        {item.balance < 0 ? '(' : ''}${formatAmount(Math.abs(item.balance))}
                        {item.balance < 0 ? ')' : ''}
                    </span>
                </div>
            ))}
            <div className="statement-row statement-row-total">
                <span>Total {section.label}</span>
                <span className="statement-value">
                    ${formatAmount(showNetTotal ? section.netTotal : section.subtotal)}
                </span>
            </div>
        </div>
    )
}

export default function Estados() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const statements = useMemo(() => {
        if (!accounts || !entries || entries.length === 0) return null
        const ledger = computeLedger(entries, accounts)
        const trialBalance = computeTrialBalance(ledger, accounts)
        return computeStatements(trialBalance, accounts)
    }, [accounts, entries])

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    if (!entries?.length) {
        return (
            <div>
                <header className="page-header">
                    <h1 className="page-title">Estados Contables</h1>
                </header>
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">📈</div>
                        <p>No hay asientos registrados. Cargá algunos para ver los estados contables.</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!statements) {
        return (
            <div>
                <header className="page-header">
                    <h1 className="page-title">Estados Contables</h1>
                </header>
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <p>Cargando...</p>
                </div>
            </div>
        )
    }

    const { balanceSheet, incomeStatement } = statements
    const statusMessages = getStatementsStatusMessage(statements)

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Estados Contables</h1>
                <p className="page-subtitle">
                    Estado de Situación Patrimonial y Estado de Resultados.
                </p>
            </header>

            <HelpPanel title="¿Qué son los Estados Contables?">
                <p>
                    Los <strong>Estados Contables</strong> resumen la situación económica y
                    financiera:
                </p>
                <ul style={{ marginLeft: 'var(--space-lg)' }}>
                    <li>
                        <strong>Estado de Situación Patrimonial:</strong> Activo = Pasivo + PN
                    </li>
                    <li>
                        <strong>Estado de Resultados:</strong> Ingresos - Costos - Gastos = Resultado
                    </li>
                </ul>
                <p>
                    Las <em>contra-cuentas</em> (amortización, previsiones) aparecen en cursiva y
                    se restan automáticamente de su grupo.
                </p>
            </HelpPanel>

            {/* Status messages */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
                {statusMessages.map((msg, i) => (
                    <div
                        key={i}
                        className={`alert ${msg.startsWith('✓')
                                ? 'alert-success'
                                : msg.startsWith('✗')
                                    ? 'alert-error'
                                    : 'alert-info'
                            }`}
                        style={{ marginBottom: 'var(--space-sm)' }}
                    >
                        {msg}
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 'var(--space-xl)' }}>
                {/* Estado de Situación Patrimonial */}
                <div className="statement">
                    <div className="statement-header">Estado de Situación Patrimonial</div>
                    <div className="statement-body">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                {/* ACTIVO */}
                                <div className="statement-section-title" style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
                                    ACTIVO
                                </div>

                                <SectionDisplay section={balanceSheet.currentAssets} showNetTotal />
                                <SectionDisplay section={balanceSheet.nonCurrentAssets} showNetTotal />

                                <div className="statement-grand-total" style={{ marginTop: 'var(--space-md)' }}>
                                    <span>TOTAL ACTIVO</span>
                                    <span>${formatAmount(balanceSheet.totalAssets)}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-6">
                                <div>
                                    {/* PASIVO */}
                                    <div className="statement-section-title" style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
                                        PASIVO
                                    </div>

                                    <SectionDisplay section={balanceSheet.currentLiabilities} showNetTotal />
                                    <SectionDisplay section={balanceSheet.nonCurrentLiabilities} showNetTotal />

                                    <div className="statement-row statement-row-total" style={{ marginTop: 'var(--space-sm)' }}>
                                        <span>TOTAL PASIVO</span>
                                        <span className="statement-value">${formatAmount(balanceSheet.totalLiabilities)}</span>
                                    </div>
                                </div>

                                <div>
                                    {/* PATRIMONIO NETO */}
                                    <div className="statement-section-title" style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
                                        PATRIMONIO NETO
                                    </div>

                                    <SectionDisplay section={balanceSheet.equity} showNetTotal />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="statement-grand-total">
                        <span>TOTAL PASIVO + PN</span>
                        <span>${formatAmount(balanceSheet.totalLiabilitiesAndEquity)}</span>
                    </div>

                    {!balanceSheet.isBalanced && (
                        <div className="alert alert-warning" style={{ margin: 'var(--space-md)', marginTop: 0 }}>
                            ⚠️ Activo ({formatAmount(balanceSheet.totalAssets)}) ≠ Pasivo + PN (
                            {formatAmount(balanceSheet.totalLiabilitiesAndEquity)})
                        </div>
                    )}
                </div>

                {/* Estado de Resultados */}
                <div className="statement">
                    <div className="statement-header">Estado de Resultados</div>
                    <div className="statement-body">
                        {/* Ventas */}
                        <SectionDisplay section={incomeStatement.sales} />

                        {/* Costo de ventas */}
                        <SectionDisplay section={incomeStatement.cogs} />

                        {/* Resultado bruto */}
                        <div
                            className="statement-row statement-row-total"
                            style={{
                                marginTop: 'var(--space-md)',
                                background: 'var(--color-bg)',
                                padding: 'var(--space-sm)',
                                borderRadius: 'var(--radius-sm)',
                            }}
                        >
                            <span>RESULTADO BRUTO</span>
                            <span className="statement-value">
                                ${formatAmount(incomeStatement.grossProfit)}
                            </span>
                        </div>

                        <div style={{ height: 'var(--space-md)' }} />

                        {/* Gastos operativos */}
                        <SectionDisplay section={incomeStatement.adminExpenses} />
                        <SectionDisplay section={incomeStatement.sellingExpenses} />

                        {/* Resultado operativo */}
                        <div
                            className="statement-row statement-row-total"
                            style={{
                                marginTop: 'var(--space-md)',
                                background: 'var(--color-bg)',
                                padding: 'var(--space-sm)',
                                borderRadius: 'var(--radius-sm)',
                            }}
                        >
                            <span>RESULTADO OPERATIVO</span>
                            <span className="statement-value">
                                ${formatAmount(incomeStatement.operatingIncome)}
                            </span>
                        </div>

                        <div style={{ height: 'var(--space-md)' }} />

                        {/* Resultados financieros */}
                        <SectionDisplay section={incomeStatement.financialIncome} />
                        <SectionDisplay section={incomeStatement.financialExpenses} />

                        {incomeStatement.netFinancialResult !== 0 && (
                            <div className="statement-row">
                                <span>Resultado financiero neto</span>
                                <span className="statement-value">
                                    ${formatAmount(incomeStatement.netFinancialResult)}
                                </span>
                            </div>
                        )}

                        {/* Otros resultados */}
                        <SectionDisplay section={incomeStatement.otherIncome} />
                        <SectionDisplay section={incomeStatement.otherExpenses} />

                        {incomeStatement.netOtherResult !== 0 && (
                            <div className="statement-row">
                                <span>Otros resultados neto</span>
                                <span className="statement-value">
                                    ${formatAmount(incomeStatement.netOtherResult)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div
                        className="statement-grand-total"
                        style={{
                            background:
                                incomeStatement.netIncome >= 0
                                    ? 'var(--color-success-bg)'
                                    : 'var(--color-error-bg)',
                            color:
                                incomeStatement.netIncome >= 0
                                    ? 'var(--color-success)'
                                    : 'var(--color-error)',
                        }}
                    >
                        <span>{incomeStatement.netIncome >= 0 ? 'GANANCIA DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO'}</span>
                        <span>${formatAmount(Math.abs(incomeStatement.netIncome))}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
