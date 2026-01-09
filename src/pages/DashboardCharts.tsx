/**
 * Dashboard Charts Component
 * Visual charts for accounting overview using recharts
 */
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts'
import type { FinancialStatements } from '../core/models'

interface DashboardChartsProps {
    statements: FinancialStatements | null
    hasEntries: boolean
    totalAccounts: number
    postableCount: number
    headerCount: number
}

const COLORS = {
    activo: '#4094DA',
    pasivo: '#c27827',
    patrimonio: '#5CA690',
}

const ASSET_COLORS = ['#4094DA', '#6ab0e8', '#2d7fc4', '#5CA690', '#7cb8a6', '#8fc4b8']

// Custom tooltip styles
const tooltipStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '8px 12px',
    boxShadow: '0 4px 12px rgba(10, 31, 72, 0.1)',
}

export default function DashboardCharts({
    statements,
    hasEntries,
    totalAccounts,
    postableCount,
    headerCount
}: DashboardChartsProps) {
    const formatCurrency = (value: number) =>
        `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

    // Empty state component
    const EmptyState = ({ icon, title, hint }: { icon: string; title: string; hint?: string }) => (
        <div className="chart-empty">
            <div className="chart-empty-icon">{icon}</div>
            <p>{title}</p>
            {hint && <p className="chart-empty-hint">{hint}</p>}
        </div>
    )

    // Header with KPI
    const ChartsHeader = () => (
        <div className="charts-header">
            <h2 className="section-title">📊 Resumen Contable</h2>
            <div className="charts-header-kpi-premium">
                <span className="charts-header-kpi-icon">📚</span>
                <span className="charts-header-kpi-value">{totalAccounts}</span>
                <span className="charts-header-kpi-label">
                    cuentas (<strong>{postableCount}</strong> imputables, <strong>{headerCount}</strong> rubros)
                </span>
            </div>
        </div>
    )

    if (!hasEntries) {
        return (
            <div className="charts-section">
                <ChartsHeader />
                <div className="charts-grid">
                    <div className="chart-card">
                        <h3 className="chart-title">Activo vs Pasivo + Patrimonio Neto</h3>
                        <EmptyState
                            icon="📊"
                            title="Todavía no hay movimientos"
                            hint="Cargá tu primer asiento para ver el resumen"
                        />
                    </div>
                    <div className="chart-card">
                        <h3 className="chart-title">Distribución del Activo</h3>
                        <EmptyState
                            icon="🍩"
                            title="Sin datos para mostrar"
                            hint="Los activos aparecerán acá cuando registres operaciones"
                        />
                    </div>
                </div>
            </div>
        )
    }

    // Calculate totals from financial statements
    const balanceSheet = statements?.balanceSheet

    // Data for stacked comparison chart (Activo vs Pasivo+PN)
    const comparisonData = [
        {
            name: 'Activo',
            activo: balanceSheet?.totalAssets || 0,
            pasivo: 0,
            patrimonio: 0,
        },
        {
            name: 'Pasivo + PN',
            activo: 0,
            pasivo: balanceSheet?.totalLiabilities || 0,
            patrimonio: balanceSheet?.totalEquity || 0,
        },
    ]

    // Asset distribution data - group by statementGroup
    const assetDistribution: { name: string; value: number }[] = []

    // Current Assets breakdown
    const currentAssets = balanceSheet?.currentAssets
    if (currentAssets && currentAssets.accounts.length > 0) {
        const assetGroups = new Map<string, number>()
        for (const acc of currentAssets.accounts) {
            const group = acc.account.group || 'Otros Corrientes'
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
            const group = acc.account.group || 'Otros No Corrientes'
            assetGroups.set(group, (assetGroups.get(group) || 0) + Math.abs(acc.balance))
        }
        for (const [group, value] of assetGroups) {
            if (value > 0) {
                assetDistribution.push({ name: group, value })
            }
        }
    }

    // Custom tooltip for comparison chart
    const ComparisonTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload) return null
        const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0)
        return (
            <div style={tooltipStyle}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
                {payload.map((p: any, i: number) => (
                    p.value > 0 && (
                        <p key={i} style={{ color: p.fill, margin: '2px 0' }}>
                            {p.name}: {formatCurrency(p.value)}
                        </p>
                    )
                ))}
                <p style={{ fontWeight: 600, borderTop: '1px solid var(--color-border)', marginTop: 4, paddingTop: 4 }}>
                    Total: {formatCurrency(total)}
                </p>
            </div>
        )
    }

    return (
        <div className="charts-section">
            <ChartsHeader />
            <div className="charts-grid">
                {/* Comparison Chart: Activo vs (Pasivo + PN) */}
                <div className="chart-card">
                    <h3 className="chart-title">Activo vs Pasivo + Patrimonio Neto</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart
                                data={comparisonData}
                                layout="vertical"
                                margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis type="number" tickFormatter={formatCurrency} />
                                <YAxis type="category" dataKey="name" width={90} />
                                <Tooltip content={<ComparisonTooltip />} />
                                <Bar
                                    dataKey="activo"
                                    name="Activo"
                                    stackId="stack"
                                    fill={COLORS.activo}
                                    radius={[0, 4, 4, 0]}
                                    isAnimationActive={true}
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                                <Bar
                                    dataKey="pasivo"
                                    name="Pasivo"
                                    stackId="stack"
                                    fill={COLORS.pasivo}
                                    isAnimationActive={true}
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                                <Bar
                                    dataKey="patrimonio"
                                    name="Patrimonio Neto"
                                    stackId="stack"
                                    fill={COLORS.patrimonio}
                                    radius={[0, 4, 4, 0]}
                                    isAnimationActive={true}
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {balanceSheet && (
                        <div className="chart-footer">
                            <span className={`status-badge ${balanceSheet.isBalanced ? 'status-badge-ok' : 'status-badge-error'}`}>
                                {balanceSheet.isBalanced ? '✓ Ecuación contable verificada' : '✗ Descuadre detectado'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Asset Distribution Donut Chart */}
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
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        isAnimationActive={true}
                                        animationDuration={1000}
                                        animationEasing="ease-out"
                                    >
                                        {assetDistribution.map((_, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={ASSET_COLORS[index % ASSET_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value as number)}
                                        contentStyle={tooltipStyle}
                                    />
                                    <Legend
                                        layout="horizontal"
                                        align="center"
                                        verticalAlign="bottom"
                                        wrapperStyle={{ fontSize: '12px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyState
                            icon="🍩"
                            title="Sin activos registrados"
                            hint="Los activos aparecerán cuando registres operaciones"
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
