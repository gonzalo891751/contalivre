/**
 * Dashboard Charts Component
 * Visual charts for accounting overview using recharts
 */
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts'
import type { FinancialStatements } from '../core/models'

interface DashboardChartsProps {
    statements: FinancialStatements | null
    hasEntries: boolean
}

const COLORS = {
    activo: '#4094DA',
    pasivo: '#c27827',
    patrimonio: '#5CA690',
    ingreso: '#3d9e70',
    gasto: '#d97146',
}

const ASSET_COLORS = ['#4094DA', '#6ab0e8', '#2d7fc4', '#5CA690', '#7cb8a6', '#8fc4b8']

export default function DashboardCharts({ statements, hasEntries }: DashboardChartsProps) {
    if (!hasEntries) {
        return (
            <div className="charts-section">
                <h2 className="section-title">📊 Resumen Contable</h2>
                <div className="charts-grid">
                    <div className="chart-card">
                        <h3 className="chart-title">Activo / Pasivo / Patrimonio Neto</h3>
                        <div className="chart-empty">
                            <div className="chart-empty-icon">📈</div>
                            <p>Sin movimientos todavía</p>
                            <p className="chart-empty-hint">Cargá tu primer asiento para ver el gráfico</p>
                        </div>
                    </div>
                    <div className="chart-card">
                        <h3 className="chart-title">Distribución del Activo</h3>
                        <div className="chart-empty">
                            <div className="chart-empty-icon">🥧</div>
                            <p>Sin datos para mostrar</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Calculate totals from financial statements
    const balanceSheet = statements?.balanceSheet
    const incomeStatement = statements?.incomeStatement

    // Data for Activo/Pasivo/PN chart
    const equityData = [
        {
            name: 'Activo',
            value: balanceSheet?.totalAssets || 0,
            fill: COLORS.activo
        },
        {
            name: 'Pasivo',
            value: balanceSheet?.totalLiabilities || 0,
            fill: COLORS.pasivo
        },
        {
            name: 'Patrimonio Neto',
            value: balanceSheet?.totalEquity || 0,
            fill: COLORS.patrimonio
        },
    ]

    // Asset distribution data - group by statementGroup
    const assetDistribution: { name: string; value: number }[] = []

    // Current Assets breakdown
    const currentAssets = balanceSheet?.currentAssets
    if (currentAssets && currentAssets.accounts.length > 0) {
        // Group by account group
        const assetGroups = new Map<string, number>()
        for (const acc of currentAssets.accounts) {
            const group = acc.account.group || 'Otros'
            assetGroups.set(group, (assetGroups.get(group) || 0) + Math.abs(acc.balance))
        }
        for (const [group, value] of assetGroups) {
            if (value > 0) {
                assetDistribution.push({ name: group, value })
            }
        }
    }

    // Non-Current Assets breakdown
    const nonCurrentAssets = balanceSheet?.nonCurrentAssets
    if (nonCurrentAssets && nonCurrentAssets.accounts.length > 0) {
        const assetGroups = new Map<string, number>()
        for (const acc of nonCurrentAssets.accounts) {
            const group = acc.account.group || 'Otros No Cte'
            assetGroups.set(group, (assetGroups.get(group) || 0) + Math.abs(acc.balance))
        }
        for (const [group, value] of assetGroups) {
            if (value > 0) {
                assetDistribution.push({ name: group, value })
            }
        }
    }

    // Income Statement chart data
    const incomeData = incomeStatement && (
        incomeStatement.sales.netTotal > 0 ||
        incomeStatement.cogs.netTotal !== 0 ||
        incomeStatement.adminExpenses.netTotal !== 0
    ) ? [
        { name: 'Ventas', value: incomeStatement.sales.netTotal, fill: COLORS.ingreso },
        { name: 'Costo', value: Math.abs(incomeStatement.cogs.netTotal), fill: COLORS.gasto },
        { name: 'Gs. Admin', value: Math.abs(incomeStatement.adminExpenses.netTotal), fill: '#d97146' },
        { name: 'Gs. Com.', value: Math.abs(incomeStatement.sellingExpenses.netTotal), fill: '#e8a87c' },
    ].filter(d => d.value > 0) : []

    const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`

    return (
        <div className="charts-section">
            <h2 className="section-title">📊 Resumen Contable</h2>
            <div className="charts-grid">
                {/* Activo / Pasivo / PN Chart */}
                <div className="chart-card">
                    <h3 className="chart-title">Activo / Pasivo / Patrimonio Neto</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={equityData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis type="number" tickFormatter={formatCurrency} />
                                <YAxis type="category" dataKey="name" width={100} />
                                <Tooltip
                                    formatter={(value) => formatCurrency(value as number)}
                                    contentStyle={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)'
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {equityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {balanceSheet && (
                        <div className="chart-footer">
                            <span className={balanceSheet.isBalanced ? 'status-ok' : 'status-error'}>
                                {balanceSheet.isBalanced ? '✓ Cuadra' : '✗ Descuadra'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Asset Distribution Chart */}
                <div className="chart-card">
                    <h3 className="chart-title">Distribución del Activo</h3>
                    {assetDistribution.length > 0 ? (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={assetDistribution}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                        labelLine={false}
                                    >
                                        {assetDistribution.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={ASSET_COLORS[index % ASSET_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value as number)}
                                        contentStyle={{
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)'
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="chart-empty">
                            <div className="chart-empty-icon">🥧</div>
                            <p>Sin activos registrados</p>
                        </div>
                    )}
                </div>

                {/* Income Statement Chart (optional) */}
                {incomeData.length > 0 && (
                    <div className="chart-card chart-card-wide">
                        <h3 className="chart-title">Resultado del Período</h3>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={incomeData} margin={{ left: 20, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis dataKey="name" />
                                    <YAxis tickFormatter={formatCurrency} />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value as number)}
                                        contentStyle={{
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)'
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {incomeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {incomeStatement && (
                            <div className="chart-footer">
                                <span className={incomeStatement.netIncome >= 0 ? 'status-ok' : 'status-error'}>
                                    Resultado: {formatCurrency(incomeStatement.netIncome)}
                                    {incomeStatement.netIncome >= 0 ? ' (Ganancia)' : ' (Pérdida)'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
