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
    Lock,
    CheckCircle,
    Activity,
    AlertTriangle,
    FilePlus2,
    Wallet,
    UploadCloud,
    Wand2,
} from 'lucide-react'

import { useDashboardMetrics } from '../hooks/useDashboardMetrics'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { loadSeedDataIfNeeded } from '../storage/seed'
import IndicatorsDashboard from '../components/Indicators/IndicatorsDashboard'
import MappingWizardModal from '../components/mapping/MappingWizardModal'

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

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default function Dashboard() {
    const navigate = useNavigate()
    const metrics = useDashboardMetrics()
    const { year, setYear } = usePeriodYear()

    // Modal states
    const [showImportModal, setShowImportModal] = useState(false)
    const [showResetModal, setShowResetModal] = useState(false)
    const [showMappingWizard, setShowMappingWizard] = useState(false)
    
    // Destructure for easier access
    const { isLoading, hasCOA, unmappedCount, isSetupComplete, hasEntries, totals, kpis, charts, recentActivity } =
        metrics

    const showOnboarding = !hasEntries

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

    const handleNewExercise = () => {
        // Safe "New Exercise" - just switch to next year
        const nextYear = year + 1
        setYear(nextYear)
        setShowResetModal(false)
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
                            onClick={() => setShowMappingWizard(true)}
                            className="dashboard-header-btn"
                        >
                            <Wand2 size={16} />
                            <span className="dashboard-header-btn-text">Asistente de Mapeo</span>
                        </button>

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
                                <span className="dashboard-period-value">{year}</span>
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
                                {hasCOA && unmappedCount === 0 ? '1/2' : '0/2'} completado
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
                        </div>
                    </section>
                )}

                {/* FINANCIAL INSIGHTS SECTION - New Indicators Dashboard */}
                <section className={`${!isSetupComplete ? 'opacity-60 pointer-events-none select-none' : ''} mt-6`}>
                    <IndicatorsDashboard />
                </section>

                {/* COMPOSICIÓN PATRIMONIO SECTION */}
                <section className={`dashboard-patrimonio ${!isSetupComplete ? 'dashboard-insights--disabled' : ''}`}>
                    <div className="dashboard-section-header">
                        <h3 className="dashboard-section-title">Composición Patrimonio</h3>
                    </div>

                    {/* Full-width Equation Chart */}
                    <div className="dashboard-chart-card dashboard-chart-card--full">
                        <h4 className="dashboard-chart-title">Ecuación Patrimonial Fundamental</h4>
                        <div className="dashboard-chart-container dashboard-chart-container--equation">
                            {charts.equation.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart
                                        data={charts.equation}
                                        layout="vertical"
                                        margin={{ top: 20, right: 30, left: 70, bottom: 5 }}
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
                                            width={70}
                                            tick={{ fontSize: 14, fill: 'var(--text-muted)', fontWeight: 500 }}
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                background: 'var(--surface-1)',
                                                color: 'var(--text)',
                                            }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null
                                                const data = payload[0].payload
                                                const isActivo = data.name === 'Activo'

                                                if (isActivo) {
                                                    const corriente = data.activoCorriente || 0
                                                    const noCorriente = data.activoNoCorriente || 0
                                                    const total = corriente + noCorriente
                                                    return (
                                                        <div className="dashboard-eq-tooltip">
                                                            <div className="dashboard-eq-tooltip-title">Activo Total</div>
                                                            <div className="dashboard-eq-tooltip-row">
                                                                <span className="dashboard-eq-tooltip-dot" style={{ background: '#3B82F6' }} />
                                                                <span>Activo Corriente:</span>
                                                                <span className="dashboard-eq-tooltip-value">{formatCurrency(corriente)}</span>
                                                            </div>
                                                            <div className="dashboard-eq-tooltip-row">
                                                                <span className="dashboard-eq-tooltip-dot" style={{ background: '#60A5FA' }} />
                                                                <span>Activo No Corriente:</span>
                                                                <span className="dashboard-eq-tooltip-value">{formatCurrency(noCorriente)}</span>
                                                            </div>
                                                            <div className="dashboard-eq-tooltip-total">
                                                                <span>Total:</span>
                                                                <span>{formatCurrency(total)}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                } else {
                                                    const pCorriente = data.pasivoCorriente || 0
                                                    const pNoCorriente = data.pasivoNoCorriente || 0
                                                    const pn = data.pn || 0
                                                    const total = pCorriente + pNoCorriente + pn
                                                    return (
                                                        <div className="dashboard-eq-tooltip">
                                                            <div className="dashboard-eq-tooltip-title">Origen de Fondos</div>
                                                            <div className="dashboard-eq-tooltip-row">
                                                                <span className="dashboard-eq-tooltip-dot" style={{ background: '#EF4444' }} />
                                                                <span>Pasivo Corriente:</span>
                                                                <span className="dashboard-eq-tooltip-value">{formatCurrency(pCorriente)}</span>
                                                            </div>
                                                            <div className="dashboard-eq-tooltip-row">
                                                                <span className="dashboard-eq-tooltip-dot" style={{ background: '#F87171' }} />
                                                                <span>Pasivo No Corriente:</span>
                                                                <span className="dashboard-eq-tooltip-value">{formatCurrency(pNoCorriente)}</span>
                                                            </div>
                                                            <div className="dashboard-eq-tooltip-row">
                                                                <span className="dashboard-eq-tooltip-dot" style={{ background: '#10B981' }} />
                                                                <span>Patrimonio Neto:</span>
                                                                <span className="dashboard-eq-tooltip-value">{formatCurrency(pn)}</span>
                                                            </div>
                                                            <div className="dashboard-eq-tooltip-total">
                                                                <span>Total:</span>
                                                                <span>{formatCurrency(total)}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                            }}
                                        />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            wrapperStyle={{ fontSize: '12px', paddingBottom: '20px' }}
                                        />
                                        {/* Activo segments */}
                                        <Bar
                                            name="Activo Corriente"
                                            dataKey="activoCorriente"
                                            stackId="activo"
                                            fill="#3B82F6"
                                            barSize={40}
                                        />
                                        <Bar
                                            name="Activo No Corriente"
                                            dataKey="activoNoCorriente"
                                            stackId="activo"
                                            fill="#60A5FA"
                                            radius={[0, 8, 8, 0]}
                                            barSize={40}
                                        />
                                        {/* Origen segments */}
                                        <Bar
                                            name="Pasivo Corriente"
                                            dataKey="pasivoCorriente"
                                            stackId="origen"
                                            fill="#EF4444"
                                            barSize={40}
                                        />
                                        <Bar
                                            name="Pasivo No Corriente"
                                            dataKey="pasivoNoCorriente"
                                            stackId="origen"
                                            fill="#F87171"
                                            barSize={40}
                                        />
                                        <Bar
                                            name="Patrimonio Neto"
                                            dataKey="pn"
                                            stackId="origen"
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

                        {/* Health Insight */}
                        {(() => {
                            const debtShare = totals.assetsTotal > 0 ? totals.liabilitiesTotal / totals.assetsTotal : 0
                            const liquidityRisk = totals.assetsCurrent < totals.liabilitiesCurrent
                            const currentRatioLow = kpis.currentRatio > 0 && kpis.currentRatio < 1

                            let alertType: 'danger' | 'warning' | 'success' = 'success'
                            let alertMessages: string[] = []

                            if (debtShare > 0.60) {
                                alertType = 'danger'
                                alertMessages.push('El pasivo representa más del 60% del activo. Revisá endeudamiento y plazos.')
                            }
                            if (liquidityRisk) {
                                alertType = alertType === 'success' ? 'warning' : alertType
                                alertMessages.push('El Activo Corriente no cubre el Pasivo Corriente (riesgo de liquidez).')
                            }
                            if (currentRatioLow && !liquidityRisk) {
                                alertType = alertType === 'success' ? 'warning' : alertType
                                alertMessages.push('Ratio de liquidez menor a 1 - monitorear flujo de caja.')
                            }

                            if (alertMessages.length === 0) {
                                alertMessages.push('Salud financiera estable según estructura patrimonial y liquidez.')
                            }

                            return (
                                <div className={`dashboard-health-insight dashboard-health-insight--${alertType}`}>
                                    {alertType === 'success' ? (
                                        <CheckCircle size={18} />
                                    ) : (
                                        <AlertTriangle size={18} />
                                    )}
                                    <div className="dashboard-health-insight-content">
                                        {alertMessages.map((msg, i) => (
                                            <p key={i}>{msg}</p>
                                        ))}
                                    </div>
                                </div>
                            )
                        })()}
                    </div>

                    {/* Donut Charts Grid */}
                    <div className="dashboard-donuts-grid">
                        {/* Assets Composition */}
                        <div className="dashboard-chart-card">
                            <h4 className="dashboard-chart-title">Composición Activo</h4>
                            <div className="dashboard-chart-container">
                                {charts.assetsComposition.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <Pie
                                                data={charts.assetsComposition as Array<{ name: string; value: number; color: string }>}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={80}
                                                paddingAngle={4}
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
                                                    color: 'var(--text)',
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={50}
                                                iconType="circle"
                                                iconSize={10}
                                                wrapperStyle={{ fontSize: '13px', lineHeight: '1.6' }}
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
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <Pie
                                                data={charts.liabilitiesComposition as Array<{ name: string; value: number; color: string }>}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={80}
                                                paddingAngle={4}
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
                                                    color: 'var(--text)',
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={50}
                                                iconType="circle"
                                                iconSize={10}
                                                wrapperStyle={{ fontSize: '13px', lineHeight: '1.6' }}
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

            {/* NEW EXERCISE MODAL */}
            {showResetModal && (
                <div className="dashboard-modal-overlay">
                    <div className="dashboard-modal">
                        <div className="dashboard-modal-header">
                            <h3 className="dashboard-modal-title">Nuevo Ejercicio {year + 1}</h3>
                            <p className="dashboard-modal-subtitle">Se activará el período {year + 1}.</p>
                        </div>

                        <div className="dashboard-modal-body">
                            <p className="text-slate-600 mb-4 text-sm">
                                Esto creará un entorno limpio para tus operaciones del nuevo año.
                                <br />
                                Tus datos del ejercicio {year} <strong>se conservan intactos</strong> y podrás volver a ellos desde el selector de período.
                            </p>

                            <div className="dashboard-modal-actions">
                                <button
                                    onClick={() => setShowResetModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleNewExercise}
                                    className="btn btn-primary"
                                >
                                    Iniciar {year + 1}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MAPPING WIZARD MODAL */}
            <MappingWizardModal
                isOpen={showMappingWizard}
                onClose={() => setShowMappingWizard(false)}
            />
        </div>
    )
}
