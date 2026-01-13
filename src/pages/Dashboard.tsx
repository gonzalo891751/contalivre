import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import {
    TrendingUp,
    ArrowRight,
    Lock,
    CheckCircle,
    Activity,
    AlertCircle,
    FilePlus2,
    RefreshCw,
    Wallet,
    UploadCloud,
} from 'lucide-react'

import { useDashboardMetrics } from '../hooks/useDashboardMetrics'
import { loadSeedDataIfNeeded } from '../storage/seed'
import { deleteAllAccounts } from '../storage/accounts'
import { resetExercise } from '../storage/entries'

// ============================================================================
// Formatters
// ============================================================================

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)
}

const formatPercent = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value)
}

// ============================================================================
// Sub-components
// ============================================================================

/** Tooltip for KPI explanations */
function InfoTooltip({
    text,
    formula,
    interpretation,
}: {
    text: string
    formula?: string
    interpretation?: string
}) {
    return (
        <div className="dashboard-info-tooltip-wrapper">
            <div className="dashboard-info-tooltip-trigger">
                <AlertCircle size={16} />
            </div>
            <div className="dashboard-info-tooltip">
                <div className="dashboard-info-tooltip-title">{text}</div>
                {formula && <div className="dashboard-info-tooltip-formula">{formula}</div>}
                {interpretation && (
                    <div className="dashboard-info-tooltip-interpretation">💡 {interpretation}</div>
                )}
                <div className="dashboard-info-tooltip-arrow"></div>
            </div>
        </div>
    )
}

/** KPI status badge */
function KpiStatus({
    value,
    thresholds,
    labels,
}: {
    value: number
    thresholds: [number, number]
    labels: [string, string, string]
}) {
    let status: 'good' | 'warning' | 'bad' = 'warning'

    if (value >= thresholds[1]) status = 'good'
    else if (value <= thresholds[0]) status = 'bad'

    return (
        <div className={`dashboard-kpi-status dashboard-kpi-status--${status}`}>
            <span className="dashboard-kpi-status-dot"></span>
            {status === 'good' ? labels[0] : status === 'warning' ? labels[1] : labels[2]}
        </div>
    )
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default function Dashboard() {
    const navigate = useNavigate()
    const metrics = useDashboardMetrics()

    // Modal states
    const [showImportModal, setShowImportModal] = useState(false)
    const [showResetModal, setShowResetModal] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [isResetting, setIsResetting] = useState(false)

    // Destructure for easier access
    const { isLoading, hasCOA, unmappedCount, isSetupComplete, hasEntries, totals, kpis, charts, recentActivity } =
        metrics

    const showOnboarding = !isSetupComplete

    // ========================================================================
    // Handlers
    // ========================================================================

    const handleLoadStandardCOA = async () => {
        try {
            await loadSeedDataIfNeeded()
            setShowImportModal(false)
            // Force refresh by navigating to cuentas and back
            navigate('/cuentas')
        } catch (error) {
            console.error('Error loading standard COA:', error)
        }
    }

    const handleImportExcel = () => {
        setShowImportModal(false)
        // Navigate to cuentas page where import functionality exists
        navigate('/cuentas')
    }

    const handleResetExercise = async () => {
        if (deleteConfirmText !== 'NUEVO') return

        setIsResetting(true)
        try {
            // Delete all entries first (foreign key safety)
            await resetExercise()
            // Then delete all accounts
            await deleteAllAccounts()

            setShowResetModal(false)
            setDeleteConfirmText('')
        } catch (error) {
            console.error('Error resetting exercise:', error)
        } finally {
            setIsResetting(false)
        }
    }

    const handleCreateEntry = () => {
        if (!hasCOA) {
            // Show toast or alert
            alert('Primero configurá el Plan de Cuentas.')
            return
        }
        navigate('/asientos')
    }

    // ========================================================================
    // Loading state
    // ========================================================================

    if (isLoading) {
        return (
            <div className="dashboard-loading">
                <div className="dashboard-loading-spinner"></div>
                <p>Cargando datos...</p>
            </div>
        )
    }

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <div className="dashboard">
            {/* HEADER */}
            <header className="dashboard-header">
                <div className="dashboard-header-content">
                    <div className="dashboard-header-left">
                        <h1 className="dashboard-greeting">¡Bienvenido!</h1>
                        <p className="dashboard-subtitle">
                            {isSetupComplete
                                ? 'Resumen financiero en tiempo real.'
                                : 'Vamos a poner en orden tu contabilidad.'}
                        </p>
                    </div>

                    <div className="dashboard-header-right">
                        <button
                            onClick={() => setShowResetModal(true)}
                            className="dashboard-header-btn"
                        >
                            <FilePlus2 size={16} />
                            <span className="dashboard-header-btn-text">Nuevo Ejercicio</span>
                        </button>

                        <div className="dashboard-header-divider"></div>

                        <div className="dashboard-period-badge">
                            <div className="dashboard-period-icon">
                                <Activity size={20} />
                            </div>
                            <div className="dashboard-period-info">
                                <span className="dashboard-period-label">Período</span>
                                <span className="dashboard-period-value">2026</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                {/* ONBOARDING SECTION */}
                {showOnboarding && (
                    <section className="dashboard-onboarding">
                        <div className="dashboard-section-header">
                            <h3 className="dashboard-section-title">
                                <TrendingUp size={20} />
                                Primeros pasos
                            </h3>
                            <span className="dashboard-progress-text">
                                {hasCOA ? (unmappedCount > 0 ? '1/3' : '2/3') : '0/3'} completado
                            </span>
                        </div>

                        <div className="dashboard-steps-grid">
                            {/* Step 1: Plan de Cuentas - only show if not complete */}
                            {!(hasCOA && unmappedCount === 0) && (
                                <div
                                    className={`dashboard-step-card ${hasCOA && unmappedCount === 0
                                        ? 'dashboard-step-card--completed'
                                        : hasCOA && unmappedCount > 0
                                            ? 'dashboard-step-card--warning'
                                            : 'dashboard-step-card--active'
                                        }`}
                                >
                                    {hasCOA && unmappedCount === 0 && (
                                        <CheckCircle size={24} className="dashboard-step-check" />
                                    )}
                                    <span className="dashboard-step-number">Paso 1</span>
                                    <h4 className="dashboard-step-title">Plan de Cuentas</h4>
                                    {!hasCOA ? (
                                        <>
                                            <p className="dashboard-step-desc">
                                                Definí tus Activos, Pasivos y Resultados.
                                            </p>
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                className="btn btn-primary dashboard-step-cta"
                                            >
                                                Configurar Ahora
                                            </button>
                                        </>
                                    ) : unmappedCount > 0 ? (
                                        <>
                                            <p className="dashboard-step-desc dashboard-step-desc--warning">
                                                Hay {unmappedCount} cuenta(s) por vincular.
                                            </p>
                                            <button
                                                onClick={() => navigate('/cuentas')}
                                                className="btn btn-secondary dashboard-step-cta"
                                            >
                                                Revisar Cuentas
                                            </button>
                                        </>
                                    ) : (
                                        <p className="dashboard-step-success">¡Configuración lista!</p>
                                    )}
                                </div>
                            )}

                            {/* Step 2: Cargar Asiento */}
                            <div
                                className={`dashboard-step-card ${!hasCOA ? 'dashboard-step-card--locked' : ''
                                    }`}
                            >
                                {!hasCOA && <Lock size={20} className="dashboard-step-lock" />}
                                <span className="dashboard-step-number">Paso 2</span>
                                <h4 className="dashboard-step-title">Cargar Asiento</h4>
                                <p className="dashboard-step-desc">Registrá tu primera operación.</p>
                                <button
                                    disabled={!hasCOA}
                                    onClick={handleCreateEntry}
                                    className="btn btn-secondary dashboard-step-cta"
                                >
                                    Nuevo Asiento
                                </button>
                            </div>

                            {/* Step 3: Ver Reportes */}
                            <div
                                className={`dashboard-step-card ${!hasEntries ? 'dashboard-step-card--locked' : ''
                                    }`}
                            >
                                {!hasEntries && <Lock size={20} className="dashboard-step-lock" />}
                                <span className="dashboard-step-number">Paso 3</span>
                                <h4 className="dashboard-step-title">Ver Reportes</h4>
                                <p className="dashboard-step-desc">Analizá tu estado contable.</p>
                                <button
                                    disabled={!hasEntries}
                                    onClick={() => navigate('/estados')}
                                    className="btn btn-secondary dashboard-step-cta"
                                >
                                    Ver Estados
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* FINANCIAL INSIGHTS SECTION */}
                <section
                    className={`dashboard-insights ${!isSetupComplete ? 'dashboard-insights--disabled' : ''
                        }`}
                >
                    <div className="dashboard-section-header">
                        <h3 className="dashboard-section-title">Panorama Financiero</h3>
                        {isSetupComplete && (
                            <button
                                onClick={() => navigate('/estados')}
                                className="dashboard-link-btn"
                            >
                                Ver balance completo <ArrowRight size={14} />
                            </button>
                        )}
                    </div>

                    {/* KPI Cards */}
                    <div className="dashboard-kpi-grid">
                        {/* Capital de Trabajo */}
                        <div className="dashboard-kpi-card">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Capital de Trabajo</span>
                                <InfoTooltip
                                    text="Fondo de Maniobra"
                                    formula="Activo Corr. - Pasivo Corr."
                                    interpretation="Dinero disponible para operar a corto plazo sin pedir deuda."
                                />
                            </div>
                            <span className="dashboard-kpi-value">
                                {formatCurrency(kpis.workingCapital)}
                            </span>
                            <KpiStatus
                                value={kpis.workingCapital}
                                thresholds={[0, 1000]}
                                labels={['Positivo', 'Riesgoso', 'Déficit']}
                            />
                        </div>

                        {/* Liquidez Corriente */}
                        <div className="dashboard-kpi-card">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Liquidez Corriente</span>
                                <InfoTooltip
                                    text="Ratio de Liquidez"
                                    formula="Activo Corr. / Pasivo Corr."
                                    interpretation="Por cada $1 que debés a corto plazo, cuánto tenés para pagar. Ideal > 1.5."
                                />
                            </div>
                            <span className="dashboard-kpi-value">{kpis.currentRatio.toFixed(2)}</span>
                            <KpiStatus
                                value={kpis.currentRatio}
                                thresholds={[1.0, 1.5]}
                                labels={['Excelente', 'Aceptable', 'Crítico']}
                            />
                        </div>

                        {/* Prueba Ácida */}
                        <div className="dashboard-kpi-card dashboard-kpi-card--accent">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Prueba Ácida</span>
                                <InfoTooltip
                                    text="Liquidez Seca"
                                    formula="(Activo Corr. - Inv) / Pasivo Corr."
                                    interpretation="¿Podés pagar YA sin vender mercadería? Ideal > 1."
                                />
                            </div>
                            <span className="dashboard-kpi-value">{kpis.acidTest.toFixed(2)}</span>
                            <KpiStatus
                                value={kpis.acidTest}
                                thresholds={[0.5, 1.0]}
                                labels={['Sólido', 'Justo', 'Riesgo']}
                            />
                        </div>

                        {/* Solvencia Total */}
                        <div className="dashboard-kpi-card">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Solvencia Total</span>
                                <InfoTooltip
                                    text="Solvencia General"
                                    formula="Activo Total / Pasivo Total"
                                    interpretation="Capacidad de cubrir todas las deudas con todos los bienes."
                                />
                            </div>
                            <span className="dashboard-kpi-value">{kpis.solvencyRatio.toFixed(2)}</span>
                            <KpiStatus
                                value={kpis.solvencyRatio}
                                thresholds={[1.0, 1.5]}
                                labels={['Solvente', 'Estable', 'Insolvente']}
                            />
                        </div>

                        {/* Autonomía Financiera */}
                        <div className="dashboard-kpi-card">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Autonomía Fin.</span>
                                <InfoTooltip
                                    text="Ratio de Propiedad"
                                    formula="PN / Activo Total"
                                    interpretation="% de la empresa que realmente es tuya."
                                />
                            </div>
                            <span className="dashboard-kpi-value">{formatPercent(kpis.equityRatio)}</span>
                            <KpiStatus
                                value={kpis.equityRatio}
                                thresholds={[0.3, 0.5]}
                                labels={['Alta', 'Media', 'Dependiente']}
                            />
                        </div>

                        {/* Caja Disponible */}
                        <div className="dashboard-kpi-card dashboard-kpi-card--highlight">
                            <div className="dashboard-kpi-header">
                                <span className="dashboard-kpi-label">Caja Disponible</span>
                            </div>
                            <span className="dashboard-kpi-value">{formatCurrency(totals.cash)}</span>
                            <div className="dashboard-kpi-status dashboard-kpi-status--neutral">
                                <TrendingUp size={12} /> Actual
                            </div>
                        </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="dashboard-charts-grid">
                        {/* Ecuación Patrimonial Chart */}
                        <div className="dashboard-chart-card dashboard-chart-card--wide">
                            <h4 className="dashboard-chart-title">Ecuación Patrimonial Fundamental</h4>
                            <div className="dashboard-chart-container dashboard-chart-container--equation">
                                {charts.equation.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart
                                            data={charts.equation}
                                            layout="vertical"
                                            margin={{ top: 20, right: 30, left: 30, bottom: 5 }}
                                            barGap={10}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                horizontal={false}
                                                stroke="var(--border)"
                                            />
                                            <XAxis type="number" hide />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={80}
                                                tick={{ fontSize: 14, fill: 'var(--text-muted)', fontWeight: 500 }}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: 'transparent' }}
                                                contentStyle={{
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                    background: 'var(--surface-1)',
                                                }}
                                                formatter={(value, name) => {
                                                    const numValue = typeof value === 'number' ? value : 0
                                                    const label =
                                                        name === 'activo'
                                                            ? 'Total Activo'
                                                            : name === 'pasivo'
                                                                ? 'Pasivo (Deudas)'
                                                                : 'Patrimonio Neto'
                                                    return [formatCurrency(numValue), label]
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="top"
                                                align="right"
                                                wrapperStyle={{ fontSize: '12px', paddingBottom: '20px' }}
                                            />
                                            <Bar
                                                name="Activo"
                                                dataKey="activo"
                                                fill="#3B82F6"
                                                radius={[0, 8, 8, 0]}
                                                barSize={40}
                                            />
                                            <Bar
                                                name="Pasivo (Deudas)"
                                                dataKey="pasivo"
                                                stackId="a"
                                                fill="#EF4444"
                                                barSize={40}
                                            />
                                            <Bar
                                                name="Patrimonio Neto"
                                                dataKey="pn"
                                                stackId="a"
                                                fill="#10B981"
                                                radius={[0, 8, 8, 0]}
                                                barSize={40}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="dashboard-chart-empty">
                                        <p>Sin datos para mostrar</p>
                                    </div>
                                )}
                            </div>
                            <p className="dashboard-chart-footer">
                                El <strong className="text-blue">Activo</strong> (lo que tenés) se financia con{' '}
                                <strong className="text-red">Pasivo</strong> (deuda) y{' '}
                                <strong className="text-green">Patrimonio</strong> (capital propio).
                            </p>
                        </div>

                        {/* Assets Composition */}
                        <div className="dashboard-chart-card">
                            <h4 className="dashboard-chart-title">Composición Activo</h4>
                            <div className="dashboard-chart-container">
                                {charts.assetsComposition.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={charts.assetsComposition as Array<{ name: string; value: number; color: string }>}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={70}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {charts.assetsComposition.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
                                                contentStyle={{
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                    background: 'var(--surface-1)',
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={36}
                                                iconType="circle"
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: '10px' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="dashboard-chart-empty">
                                        <p>Sin datos</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Liabilities Composition */}
                        <div className="dashboard-chart-card">
                            <h4 className="dashboard-chart-title">Composición Pasivo</h4>
                            <div className="dashboard-chart-container">
                                {charts.liabilitiesComposition.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={charts.liabilitiesComposition as Array<{ name: string; value: number; color: string }>}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={70}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {charts.liabilitiesComposition.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
                                                contentStyle={{
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                    background: 'var(--surface-1)',
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={36}
                                                iconType="circle"
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: '10px' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="dashboard-chart-empty">
                                        <p>Sin datos</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* RECENT ACTIVITY */}
                <section className="dashboard-activity">
                    <h3 className="dashboard-section-title">Últimos Movimientos</h3>
                    <div className="dashboard-activity-table-container">
                        {recentActivity.length > 0 ? (
                            <table className="dashboard-activity-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Concepto</th>
                                        <th className="text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentActivity.map((item) => (
                                        <tr key={item.id}>
                                            <td className="dashboard-activity-date">{item.date}</td>
                                            <td className="dashboard-activity-concept">{item.concept}</td>
                                            <td className="dashboard-activity-amount">
                                                {formatCurrency(item.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="dashboard-activity-empty">
                                <p>No hay movimientos registrados aún.</p>
                                {hasCOA && (
                                    <button onClick={handleCreateEntry} className="btn btn-primary">
                                        Crear primer asiento
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {/* COA CONFIGURATION MODAL */}
            {showImportModal && (
                <div className="dashboard-modal-overlay">
                    <div className="dashboard-modal">
                        <div className="dashboard-modal-header">
                            <h3 className="dashboard-modal-title">Configuración de Plan de Cuentas</h3>
                            <p className="dashboard-modal-subtitle">Elegí la mejor opción para tu empresa.</p>
                        </div>

                        <div className="dashboard-modal-body">
                            <button onClick={handleLoadStandardCOA} className="dashboard-modal-option">
                                <div className="dashboard-modal-option-icon dashboard-modal-option-icon--green">
                                    <Wallet size={24} />
                                </div>
                                <div className="dashboard-modal-option-content">
                                    <span className="dashboard-modal-option-title">Usar Plan Estándar</span>
                                    <span className="dashboard-modal-option-desc">
                                        Plantilla lista para Pymes y Comercios.
                                    </span>
                                </div>
                            </button>

                            <button onClick={handleImportExcel} className="dashboard-modal-option">
                                <div className="dashboard-modal-option-icon dashboard-modal-option-icon--blue">
                                    <UploadCloud size={24} />
                                </div>
                                <div className="dashboard-modal-option-content">
                                    <span className="dashboard-modal-option-title">Importar Excel / CSV</span>
                                    <span className="dashboard-modal-option-desc">
                                        Migrá tus cuentas desde otro sistema.
                                    </span>
                                </div>
                            </button>
                        </div>

                        <div className="dashboard-modal-footer">
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="dashboard-modal-cancel"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RESET EXERCISE MODAL */}
            {showResetModal && (
                <div className="dashboard-modal-overlay dashboard-modal-overlay--danger">
                    <div className="dashboard-modal dashboard-modal--danger">
                        <div className="dashboard-modal-body dashboard-modal-body--center">
                            <div className="dashboard-modal-danger-icon">
                                <RefreshCw size={32} />
                            </div>
                            <h3 className="dashboard-modal-title">¿Iniciar Nuevo Ejercicio?</h3>
                            <p className="dashboard-modal-warning-text">
                                Acción destructiva. Se{' '}
                                <strong className="text-red">borrará el Plan de Cuentas y los Asientos</strong>.
                                Exportá tu balance antes de continuar.
                            </p>

                            <div className="dashboard-modal-confirm-input">
                                <label>Escribí "NUEVO" para confirmar</label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="NUEVO"
                                    disabled={isResetting}
                                />
                            </div>

                            <div className="dashboard-modal-actions">
                                <button
                                    onClick={() => {
                                        setShowResetModal(false)
                                        setDeleteConfirmText('')
                                    }}
                                    className="btn btn-secondary"
                                    disabled={isResetting}
                                >
                                    Cancelar
                                </button>
                                <button
                                    disabled={deleteConfirmText !== 'NUEVO' || isResetting}
                                    onClick={handleResetExercise}
                                    className="btn btn-danger"
                                >
                                    {isResetting ? 'Reiniciando...' : 'Reiniciar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
