/**
 * DeudasSocialesPage - Sueldos PRO
 *
 * Tabs: Dashboard | Empleados | Conceptos | Liquidaciones | Vencimientos | Asientos
 * Features: Onboarding wizard, concept-based liquidation, area reports.
 */

import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Plus,
    Pencil,
    Trash,
    Receipt,
    Money,
    CaretRight,
    CaretDown,
    CheckCircle,
    Clock,
    Warning,
    Eye,
    Bank,
    X,
    FloppyDisk,
    GearSix,
    Sparkle,
    ListChecks,
    Info,
} from '@phosphor-icons/react'
import {
    PieChart, Pie, Cell, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, ResponsiveContainer,
    Tooltip as RechartsTooltip,
} from 'recharts'
import OperationsPageHeader from '../../components/OperationsPageHeader'
import PayrollOnboardingWizard from './payroll/OnboardingWizard'
import { db } from '../../storage/db'
import {
    getAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getAllPayrollRuns,
    createPayrollRun,
    getPayrollLines,
    updatePayrollLine,
    deletePayrollRun,
    postPayrollRun,
    registerPayrollPayment,
    getPayrollPayments,
    getPayrollSettings,
    getPayrollMetrics,
    getPayrollJournalEntries,
    ensurePayrollSeeded,
    getAllConcepts,
    createConcept,
    updateConcept,
    deleteConcept,
    seedConceptsFromTemplate,
    getPayrollAreaMetrics,
    getOnboardingStatus,
} from '../../storage/payroll'
import type {
    Employee,
    PayrollRun,
    PayrollLine,
    PayrollSettings,
    PaymentSplit,
    PayrollConcept,
    TemplateType,
} from '../../core/payroll/types'
import { PAYROLL_TEMPLATES, DEFAULT_AREAS } from '../../core/payroll/types'
import type { Account, JournalEntry } from '../../core/models'
import type { AreaMetric, OnboardingStatus } from '../../storage/payroll'

type TabName = 'dashboard' | 'empleados' | 'conceptos' | 'liquidaciones' | 'vencimientos' | 'asientos'

const fmtCurrency = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n)

const fmtCurrency2 = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)

const fmtDate = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

const fmtPeriod = (period: string): string => {
    const [y, m] = period.split('-')
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${months[parseInt(m) - 1]} ${y}`
}

const fmtPercent = (n: number): string => `${(n * 100).toFixed(2)}%`

const DONUT_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899']
const AREA_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#06B6D4']

// ─── Status Badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: PayrollRun['status'] }) {
    const cfg = {
        draft: { label: 'Borrador', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
        posted: { label: 'Devengado', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
        partial: { label: 'Pago parcial', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
        paid: { label: 'Pagado', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    }[status]

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
            {cfg.label}
        </span>
    )
}

// ─── Onboarding Checklist Banner ────────────────────────────

function OnboardingBanner({
    status,
    onOpenWizard,
}: {
    status: OnboardingStatus
    onOpenWizard: () => void
}) {
    if (status.allComplete) return null

    const items = [
        { done: status.settingsConfigured, label: 'Tasas configuradas' },
        { done: status.accountsMapped, label: 'Cuentas mapeadas' },
        { done: status.areasConfigured, label: 'Areas definidas' },
        { done: status.conceptsSeeded, label: 'Conceptos cargados' },
        { done: status.employeesAdded, label: 'Empleados agregados' },
    ]

    return (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <ListChecks size={20} weight="duotone" className="text-violet-600" />
                    <span className="font-semibold text-sm text-violet-900">
                        Configuracion inicial ({status.completedSteps}/{status.totalSteps})
                    </span>
                </div>
                <button
                    onClick={onOpenWizard}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-1"
                >
                    <GearSix size={14} /> Completar setup
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {items.map(item => (
                    <span
                        key={item.label}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                            item.done
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                : 'bg-white text-slate-500 border border-slate-200'
                        }`}
                    >
                        {item.done ? <CheckCircle size={12} weight="fill" /> : <Clock size={12} />}
                        {item.label}
                    </span>
                ))}
            </div>
            <div className="mt-2 w-full bg-violet-100 rounded-full h-1.5">
                <div
                    className="bg-violet-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${(status.completedSteps / status.totalSteps) * 100}%` }}
                />
            </div>
        </div>
    )
}

// ─── Main Page Component ────────────────────────────────────

const ZERO_METRICS: Awaited<ReturnType<typeof getPayrollMetrics>> = {
    hasData: false,
    netPending: 0,
    retencionesDepositar: 0,
    cargasSocialesAPagar: 0,
    totalEmployees: 0,
    nextDueLabel: 'Sin vencimientos',
    dueSeverity: 'ok',
}

export default function DeudasSocialesPage() {
    const [activeTab, setActiveTab] = useState<TabName>('dashboard')
    const [wizardOpen, setWizardOpen] = useState(false)

    // Seed settings once on mount (WRITE — outside liveQuery)
    useEffect(() => { void ensurePayrollSeeded() }, [])

    // Global data — all read-only queries with fallback
    const employees = useLiveQuery(async () => {
        try { return await getAllEmployees() } catch (e) { console.error('[payroll] getAllEmployees', e); return [] }
    }, [])
    const runs = useLiveQuery(async () => {
        try { return await getAllPayrollRuns() } catch (e) { console.error('[payroll] getAllPayrollRuns', e); return [] }
    }, [])
    const settings = useLiveQuery(async () => {
        try { return await getPayrollSettings() } catch (e) { console.error('[payroll] getPayrollSettings', e); return undefined }
    }, [])
    const metrics = useLiveQuery(async () => {
        try { return await getPayrollMetrics() } catch (e) { console.error('[payroll] getPayrollMetrics', e); return ZERO_METRICS }
    }, [])
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])
    const payrollEntries = useLiveQuery(() => getPayrollJournalEntries(), [])
    const concepts = useLiveQuery(async () => {
        try { return await getAllConcepts() } catch (e) { console.error('[payroll] getAllConcepts', e); return [] }
    }, [])
    const areaMetrics = useLiveQuery(async () => {
        try { return await getPayrollAreaMetrics() } catch (e) { console.error('[payroll] getPayrollAreaMetrics', e); return [] }
    }, [])
    const onboardingStatus = useLiveQuery(async () => {
        try { return await getOnboardingStatus() } catch (e) { console.error('[payroll] getOnboardingStatus', e); return null }
    }, [])

    // Auto-open wizard if onboarding not completed
    useEffect(() => {
        if (settings && !settings.onboardingCompleted && onboardingStatus && !onboardingStatus.allComplete) {
            setWizardOpen(true)
        }
    }, [settings, onboardingStatus])

    const tabs: { key: TabName; label: string }[] = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'empleados', label: 'Empleados' },
        { key: 'conceptos', label: 'Conceptos' },
        { key: 'liquidaciones', label: 'Liquidaciones' },
        { key: 'vencimientos', label: 'Vencimientos' },
        { key: 'asientos', label: 'Asientos' },
    ]

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 bg-slate-50">
            <OperationsPageHeader
                title="Deudas Sociales / Sueldos"
                subtitle="Liquidaciones, devengamientos y pagos de sueldos y cargas sociales."
                shimmer
                badges={
                    metrics ? (
                        <div className="flex items-center gap-2">
                            <span className="bg-violet-50 text-violet-700 text-xs px-2.5 py-1 rounded-full font-semibold border border-violet-100">
                                {metrics.totalEmployees} empleado{metrics.totalEmployees !== 1 ? 's' : ''}
                            </span>
                            {metrics.dueSeverity === 'overdue' && (
                                <span className="bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 border border-red-100">
                                    <Warning weight="fill" size={10} /> {metrics.nextDueLabel}
                                </span>
                            )}
                            {metrics.dueSeverity === 'upcoming' && (
                                <span className="bg-amber-50 text-amber-600 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 border border-amber-100">
                                    <Clock weight="fill" size={10} /> {metrics.nextDueLabel}
                                </span>
                            )}
                            {metrics.dueSeverity === 'ok' && metrics.hasData && (
                                <span className="bg-emerald-50 text-emerald-600 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 border border-emerald-100">
                                    <CheckCircle weight="fill" size={10} /> Al dia
                                </span>
                            )}
                        </div>
                    ) : undefined
                }
            />

            {/* Onboarding Banner */}
            {onboardingStatus && !onboardingStatus.allComplete && (
                <OnboardingBanner status={onboardingStatus} onOpenWizard={() => setWizardOpen(true)} />
            )}

            {/* KPI Cards */}
            {metrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">Neto a Pagar</div>
                        <div className="font-mono text-xl font-bold text-slate-900">{fmtCurrency(metrics.netPending)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">Retenciones a Depositar</div>
                        <div className="font-mono text-xl font-bold text-slate-900">{fmtCurrency(metrics.retencionesDepositar)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">Cargas Soc. a Pagar</div>
                        <div className="font-mono text-xl font-bold text-slate-900">{fmtCurrency(metrics.cargasSocialesAPagar)}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs text-slate-500 mb-1">Prox. Vencimiento</div>
                        <div className="font-mono text-xl font-bold text-slate-900">{metrics.nextDueLabel}</div>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                            activeTab === tab.key
                                ? 'text-violet-600 border-b-2 border-violet-600'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="mt-4">
                {activeTab === 'dashboard' && (
                    <DashboardTab
                        metrics={metrics}
                        runs={runs}
                        areaMetrics={areaMetrics}
                        onNewRun={() => setActiveTab('liquidaciones')}
                    />
                )}
                {activeTab === 'empleados' && (
                    <EmpleadosTab employees={employees} settings={settings} />
                )}
                {activeTab === 'conceptos' && (
                    <ConceptosTab concepts={concepts} settings={settings} />
                )}
                {activeTab === 'liquidaciones' && (
                    <LiquidacionesTab
                        runs={runs}
                        employees={employees}
                        accounts={accounts}
                    />
                )}
                {activeTab === 'vencimientos' && (
                    <VencimientosTab runs={runs} settings={settings} />
                )}
                {activeTab === 'asientos' && (
                    <AsientosTab entries={payrollEntries} accounts={accounts} />
                )}
            </div>

            {/* Onboarding Wizard */}
            {wizardOpen && settings && accounts && (
                <PayrollOnboardingWizard
                    settings={settings}
                    accounts={accounts}
                    onComplete={() => setWizardOpen(false)}
                    onCancel={settings.onboardingCompleted ? () => setWizardOpen(false) : undefined}
                />
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════

function DashboardTab({
    metrics,
    runs,
    areaMetrics,
    onNewRun,
}: {
    metrics: Awaited<ReturnType<typeof getPayrollMetrics>> | undefined
    runs: PayrollRun[] | undefined
    areaMetrics: AreaMetric[] | undefined
    onNewRun: () => void
}) {
    const donutData = useMemo(() => {
        if (!metrics) return []
        return [
            { name: 'Neto', value: metrics.netPending },
            { name: 'Retenciones', value: metrics.retencionesDepositar },
            { name: 'Cargas Soc.', value: metrics.cargasSocialesAPagar },
        ].filter(d => d.value > 0)
    }, [metrics])

    const barData = useMemo(() => {
        if (!runs) return []
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        return runs
            .filter(r => r.status !== 'draft')
            .slice(0, 12)
            .reverse()
            .map(r => {
                const [, m] = r.period.split('-')
                return {
                    name: months[parseInt(m) - 1],
                    bruto: r.grossTotal,
                    neto: r.netTotal,
                    cargas: r.employerContribTotal,
                }
            })
    }, [runs])

    const areaBarData = useMemo(() => {
        if (!areaMetrics || areaMetrics.length === 0) return []
        return areaMetrics.map(a => ({
            name: a.area,
            bruto: a.totalGross,
            empleador: a.totalEmployerCost,
            empleados: a.employeeCount,
        }))
    }, [areaMetrics])

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={onNewRun}
                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
                >
                    <Plus weight="bold" size={16} /> Nueva Liquidacion
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-4">Composicion Obligaciones Pendientes</h3>
                    {donutData.length > 0 ? (
                        <div className="flex items-center gap-6">
                            <ResponsiveContainer width={180} height={180}>
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {donutData.map((_, i) => (
                                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(v) => fmtCurrency(Number(v))} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2">
                                {donutData.map((d, i) => (
                                    <div key={d.name} className="flex items-center gap-2 text-sm">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
                                        <span className="text-slate-600">{d.name}</span>
                                        <span className="font-mono font-medium text-slate-900">{fmtCurrency(d.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 py-8 text-center">Sin obligaciones pendientes.</p>
                    )}
                </div>

                {/* Bar chart - Monthly evolution */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-4">Evolucion Mensual</h3>
                    {barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={barData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <RechartsTooltip formatter={(v) => fmtCurrency(Number(v))} />
                                <Bar dataKey="bruto" name="Bruto" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="neto" name="Neto" fill="#10B981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="cargas" name="Cargas" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-sm text-slate-400 py-8 text-center">Registra liquidaciones para ver la evolucion.</p>
                    )}
                </div>
            </div>

            {/* Area breakdown chart */}
            {areaBarData.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-900 mb-4">Masa Salarial por Area</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={areaBarData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                            <RechartsTooltip formatter={(v) => fmtCurrency(Number(v))} />
                            <Bar dataKey="bruto" name="Bruto" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                            <Bar dataKey="empleador" name="Costo Empleador" fill="#C4B5FD" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex flex-wrap gap-3">
                        {areaBarData.map((a, i) => (
                            <div key={a.name} className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: AREA_COLORS[i % AREA_COLORS.length] }} />
                                {a.name}: {a.empleados} emp.
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// EMPLEADOS TAB
// ═══════════════════════════════════════════════════════════

function EmpleadosTab({
    employees,
    settings,
}: {
    employees: Employee[] | undefined
    settings: PayrollSettings | undefined
}) {
    const [showModal, setShowModal] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
    const [form, setForm] = useState({
        fullName: '',
        cuil: '',
        baseGross: '',
        category: '',
        area: '',
        startDate: '',
        status: 'active' as 'active' | 'inactive',
    })

    const areas = settings?.areas || [...DEFAULT_AREAS]

    const filtered = useMemo(() => {
        if (!employees) return []
        if (filter === 'all') return employees
        return employees.filter(e => e.status === filter)
    }, [employees, filter])

    const openNew = () => {
        setEditingId(null)
        setForm({ fullName: '', cuil: '', baseGross: '', category: '', area: '', startDate: '', status: 'active' })
        setShowModal(true)
    }

    const openEdit = (emp: Employee) => {
        setEditingId(emp.id)
        setForm({
            fullName: emp.fullName,
            cuil: emp.cuil || '',
            baseGross: String(emp.baseGross),
            category: emp.category || '',
            area: emp.area || '',
            startDate: emp.startDate || '',
            status: emp.status,
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        const gross = parseFloat(form.baseGross)
        if (!form.fullName.trim() || isNaN(gross) || gross <= 0) return

        if (editingId) {
            await updateEmployee(editingId, {
                fullName: form.fullName.trim(),
                cuil: form.cuil.trim() || undefined,
                baseGross: gross,
                category: form.category.trim() || undefined,
                area: form.area || undefined,
                startDate: form.startDate || undefined,
                status: form.status,
            })
        } else {
            await createEmployee({
                fullName: form.fullName.trim(),
                cuil: form.cuil.trim() || undefined,
                baseGross: gross,
                category: form.category.trim() || undefined,
                area: form.area || undefined,
                startDate: form.startDate || undefined,
                status: 'active',
                payType: 'monthly',
            })
        }
        setShowModal(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminar este empleado?')) return
        try {
            await deleteEmployee(id)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido'
            alert(msg)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div className="flex gap-2">
                    {(['active', 'inactive', 'all'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                filter === f
                                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {f === 'active' ? 'Activos' : f === 'inactive' ? 'Inactivos' : 'Todos'}
                        </button>
                    ))}
                </div>
                <button
                    onClick={openNew}
                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
                >
                    <Plus weight="bold" size={16} /> Nuevo Empleado
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">CUIL</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Bruto Base</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Area</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Estado</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                    No hay empleados. Crea uno para empezar.
                                </td>
                            </tr>
                        ) : (
                            filtered.map(emp => (
                                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900">{emp.fullName}</td>
                                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell font-mono text-xs">{emp.cuil || '—'}</td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-900">{fmtCurrency(emp.baseGross)}</td>
                                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                                        {emp.area ? (
                                            <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-xs rounded-full border border-violet-100">
                                                {emp.area}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            emp.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}>
                                            {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => openEdit(emp)}
                                                className="p-1.5 text-slate-400 hover:text-violet-600 rounded-md hover:bg-violet-50 transition-colors"
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(emp.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Employee Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-display font-semibold text-lg text-slate-900">
                                {editingId ? 'Editar Empleado' : 'Nuevo Empleado'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
                                <input
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                    value={form.fullName}
                                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                                    placeholder="Juan Perez"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">CUIL</label>
                                <input
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-mono"
                                    value={form.cuil}
                                    onChange={e => setForm(f => ({ ...f, cuil: e.target.value }))}
                                    placeholder="20-12345678-9"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Sueldo Bruto Base *</label>
                                    <input
                                        type="number"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-mono"
                                        value={form.baseGross}
                                        onChange={e => setForm(f => ({ ...f, baseGross: e.target.value }))}
                                        placeholder="800000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Fecha Ingreso</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-mono"
                                        value={form.startDate}
                                        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Area</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                        value={form.area}
                                        onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                                    >
                                        <option value="">Sin area</option>
                                        {areas.map(a => (
                                            <option key={a} value={a}>{a}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Categoria / Puesto</label>
                                    <input
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                        value={form.category}
                                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                        placeholder="Administrativo"
                                    />
                                </div>
                            </div>
                            {editingId && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                        value={form.status}
                                        onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 flex items-center gap-2"
                            >
                                <FloppyDisk size={16} /> Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// CONCEPTOS TAB
// ═══════════════════════════════════════════════════════════

function ConceptosTab({
    concepts,
}: {
    concepts: PayrollConcept[] | undefined
    settings: PayrollSettings | undefined
}) {
    const [showModal, setShowModal] = useState(false)
    const [editingConcept, setEditingConcept] = useState<PayrollConcept | null>(null)
    const [form, setForm] = useState({
        name: '',
        kind: 'earning' as PayrollConcept['kind'],
        calcMode: 'fixed_amount' as PayrollConcept['calcMode'],
        formulaExpr: '',
        baseRef: '' as string,
        defaultValue: '',
        defaultPercent: '',
        affectsEmployeeWithholds: true,
        affectsEmployerContrib: true,
    })

    const openNew = () => {
        setEditingConcept(null)
        setForm({
            name: '', kind: 'earning', calcMode: 'fixed_amount', formulaExpr: '',
            baseRef: '', defaultValue: '', defaultPercent: '',
            affectsEmployeeWithholds: true, affectsEmployerContrib: true,
        })
        setShowModal(true)
    }

    const openEdit = (c: PayrollConcept) => {
        setEditingConcept(c)
        setForm({
            name: c.name,
            kind: c.kind,
            calcMode: c.calcMode,
            formulaExpr: c.formulaExpr || '',
            baseRef: c.baseRef || '',
            defaultValue: c.defaultValue != null ? String(c.defaultValue) : '',
            defaultPercent: c.defaultPercent != null ? String(c.defaultPercent * 100) : '',
            affectsEmployeeWithholds: c.affectsEmployeeWithholds,
            affectsEmployerContrib: c.affectsEmployerContrib,
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.name.trim()) return
        const data: Omit<PayrollConcept, 'id'> = {
            name: form.name.trim(),
            kind: form.kind,
            calcMode: form.calcMode,
            formulaExpr: form.calcMode === 'formula' ? form.formulaExpr : undefined,
            baseRef: form.calcMode === 'percent_of_base' ? (form.baseRef as PayrollConcept['baseRef']) : undefined,
            defaultValue: form.defaultValue ? parseFloat(form.defaultValue) : undefined,
            defaultPercent: form.defaultPercent ? parseFloat(form.defaultPercent) / 100 : undefined,
            affectsEmployeeWithholds: form.affectsEmployeeWithholds,
            affectsEmployerContrib: form.affectsEmployerContrib,
            isActive: true,
            sortOrder: editingConcept?.sortOrder ?? ((concepts?.length || 0) * 10),
        }

        if (editingConcept) {
            await updateConcept(editingConcept.id, data)
        } else {
            await createConcept(data)
        }
        setShowModal(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminar este concepto?')) return
        await deleteConcept(id)
    }

    const handleToggleActive = async (c: PayrollConcept) => {
        await updateConcept(c.id, { isActive: !c.isActive })
    }

    const handleSeedTemplate = async (tid: TemplateType) => {
        if (!confirm('Esto reemplazara todos los conceptos actuales. Continuar?')) return
        await seedConceptsFromTemplate(tid)
    }

    const kindLabels = { earning: 'Haberes', deduction: 'Deducciones', employer_contrib: 'Contrib. Patronales' }
    const kindColors = {
        earning: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        deduction: 'bg-red-50 text-red-600 border-red-100',
        employer_contrib: 'bg-violet-50 text-violet-600 border-violet-100',
    }
    const calcModeLabels = {
        fixed_amount: 'Monto fijo',
        percent_of_base: '% sobre base',
        formula: 'Formula',
        variable_input: 'Input variable',
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h3 className="font-display font-semibold text-lg text-slate-900">Conceptos de Liquidacion</h3>
                    <span className="text-xs text-slate-500">
                        {concepts?.filter(c => c.isActive).length || 0} activos
                    </span>
                </div>
                <div className="flex gap-2">
                    <div className="relative group">
                        <button className="px-3 py-2 text-xs font-medium text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 flex items-center gap-1">
                            <Sparkle size={14} weight="fill" /> Cargar Plantilla
                        </button>
                        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 hidden group-hover:block w-48">
                            {PAYROLL_TEMPLATES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleSeedTemplate(t.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={openNew}
                        className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
                    >
                        <Plus weight="bold" size={16} /> Nuevo Concepto
                    </button>
                </div>
            </div>

            {/* Concepts Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Concepto</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Calculo</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Activo</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {!concepts || concepts.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                    No hay conceptos. Carga una plantilla o crea conceptos manualmente.
                                </td>
                            </tr>
                        ) : (
                            concepts.map(c => (
                                <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.isActive ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900">{c.name}</div>
                                        {c.formulaExpr && (
                                            <div className="text-xs text-slate-400 font-mono mt-0.5">{c.formulaExpr}</div>
                                        )}
                                        {c.defaultPercent != null && (
                                            <div className="text-xs text-slate-400 mt-0.5">{fmtPercent(c.defaultPercent)}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${kindColors[c.kind]}`}>
                                            {kindLabels[c.kind]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell text-xs">
                                        {calcModeLabels[c.calcMode]}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => handleToggleActive(c)}
                                            className={`w-8 h-5 rounded-full transition-colors ${c.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        >
                                            <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${c.isActive ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => openEdit(c)}
                                                className="p-1.5 text-slate-400 hover:text-violet-600 rounded-md hover:bg-violet-50 transition-colors"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Concept Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-display font-semibold text-lg text-slate-900">
                                {editingConcept ? 'Editar Concepto' : 'Nuevo Concepto'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                                <input
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Ej: Antiguedad"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={form.kind}
                                        onChange={e => setForm(f => ({ ...f, kind: e.target.value as PayrollConcept['kind'] }))}
                                    >
                                        <option value="earning">Haberes</option>
                                        <option value="deduction">Deduccion</option>
                                        <option value="employer_contrib">Contrib. Patronal</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Modo calculo</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={form.calcMode}
                                        onChange={e => setForm(f => ({ ...f, calcMode: e.target.value as PayrollConcept['calcMode'] }))}
                                    >
                                        <option value="fixed_amount">Monto fijo</option>
                                        <option value="percent_of_base">% sobre base</option>
                                        <option value="formula">Formula</option>
                                        <option value="variable_input">Input variable</option>
                                    </select>
                                </div>
                            </div>
                            {form.calcMode === 'formula' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Formula</label>
                                    <input
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={form.formulaExpr}
                                        onChange={e => setForm(f => ({ ...f, formulaExpr: e.target.value }))}
                                        placeholder="0.01 * years * base"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">
                                        Variables: years, base, gross, basic, remSum
                                    </p>
                                </div>
                            )}
                            {form.calcMode === 'percent_of_base' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Base de calculo</label>
                                        <select
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                            value={form.baseRef}
                                            onChange={e => setForm(f => ({ ...f, baseRef: e.target.value }))}
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="base_gross">Bruto base</option>
                                            <option value="base_basic">Basico</option>
                                            <option value="base_remunerative_sum">Suma remunerativa</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Porcentaje (%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none"
                                            value={form.defaultPercent}
                                            onChange={e => setForm(f => ({ ...f, defaultPercent: e.target.value }))}
                                            placeholder="8.33"
                                        />
                                    </div>
                                </div>
                            )}
                            {(form.calcMode === 'fixed_amount' || form.calcMode === 'variable_input') && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Valor predeterminado</label>
                                    <input
                                        type="number"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={form.defaultValue}
                                        onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                            )}
                            <div className="flex gap-4 pt-2">
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={form.affectsEmployeeWithholds}
                                        onChange={e => setForm(f => ({ ...f, affectsEmployeeWithholds: e.target.checked }))}
                                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    Afecta retenciones
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={form.affectsEmployerContrib}
                                        onChange={e => setForm(f => ({ ...f, affectsEmployerContrib: e.target.checked }))}
                                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    Afecta contribuciones
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 flex items-center gap-2"
                            >
                                <FloppyDisk size={16} /> Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// LIQUIDACIONES TAB
// ═══════════════════════════════════════════════════════════

function LiquidacionesTab({
    runs,
    employees,
    accounts,
}: {
    runs: PayrollRun[] | undefined
    employees: Employee[] | undefined
    accounts: Account[] | undefined
}) {
    const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
    const [showNewPeriod, setShowNewPeriod] = useState(false)
    const [newPeriod, setNewPeriod] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [paymentModal, setPaymentModal] = useState<{
        runId: string
        type: 'salary' | 'social_security'
        maxAmount: number
    } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const handleCreateRun = async () => {
        setError(null)
        try {
            await createPayrollRun(newPeriod)
            setShowNewPeriod(false)
            setSuccess('Liquidacion creada exitosamente')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error')
        }
    }

    const handlePost = async (runId: string) => {
        setError(null)
        try {
            await postPayrollRun(runId)
            setSuccess('Liquidacion devengada y asiento generado')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error')
        }
    }

    const handleDeleteRun = async (runId: string) => {
        if (!confirm('Eliminar esta liquidacion borrador?')) return
        setError(null)
        try {
            await deletePayrollRun(runId)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error')
        }
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                    <Warning weight="fill" size={16} /> {error}
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg flex items-center gap-2">
                    <CheckCircle weight="fill" size={16} /> {success}
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h3 className="font-display font-semibold text-lg text-slate-900">Liquidaciones por Periodo</h3>
                <button
                    onClick={() => setShowNewPeriod(true)}
                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
                >
                    <Plus weight="bold" size={16} /> Nueva Liquidacion
                </button>
            </div>

            {/* New period input */}
            {showNewPeriod && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-end gap-3">
                    <div>
                        <label className="block text-xs font-medium text-violet-700 mb-1">Periodo (YYYY-MM)</label>
                        <input
                            type="month"
                            className="px-3 py-2 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none font-mono"
                            value={newPeriod}
                            onChange={e => setNewPeriod(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCreateRun}
                            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
                        >
                            Crear
                        </button>
                        <button
                            onClick={() => setShowNewPeriod(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-white"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Runs List */}
            <div className="space-y-3">
                {!runs || runs.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 shadow-sm">
                        No hay liquidaciones. Crea una para empezar.
                    </div>
                ) : (
                    runs.map(run => (
                        <PayrollRunCard
                            key={run.id}
                            run={run}
                            employees={employees}
                            accounts={accounts}
                            isExpanded={expandedRunId === run.id}
                            onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                            onPost={() => handlePost(run.id)}
                            onDelete={() => handleDeleteRun(run.id)}
                            onPaySalary={() => setPaymentModal({
                                runId: run.id,
                                type: 'salary',
                                maxAmount: Math.max(0, run.netTotal - run.salaryPaid),
                            })}
                            onPaySS={() => setPaymentModal({
                                runId: run.id,
                                type: 'social_security',
                                maxAmount: Math.max(0, run.employeeWithholdTotal + run.employerContribTotal - run.socialSecurityPaid),
                            })}
                        />
                    ))
                )}
            </div>

            {/* Payment Modal */}
            {paymentModal && accounts && (
                <PaymentModal
                    {...paymentModal}
                    accounts={accounts}
                    onClose={() => setPaymentModal(null)}
                    onSuccess={(msg) => { setPaymentModal(null); setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }}
                    onError={(msg) => setError(msg)}
                />
            )}
        </div>
    )
}

// ─── PayrollRunCard ─────────────────────────────────────────

function PayrollRunCard({
    run,
    employees,
    isExpanded,
    onToggle,
    onPost,
    onDelete,
    onPaySalary,
    onPaySS,
}: {
    run: PayrollRun
    employees: Employee[] | undefined
    accounts: Account[] | undefined
    isExpanded: boolean
    onToggle: () => void
    onPost: () => void
    onDelete: () => void
    onPaySalary: () => void
    onPaySS: () => void
}) {
    const lines = useLiveQuery(() => getPayrollLines(run.id), [run.id])
    const payments = useLiveQuery(() => getPayrollPayments(run.id), [run.id])
    const empMap = useMemo(() => {
        const m = new Map<string, Employee>()
        employees?.forEach(e => m.set(e.id, e))
        return m
    }, [employees])

    const salaryRemaining = Math.max(0, run.netTotal - run.salaryPaid)
    const ssTotal = run.employeeWithholdTotal + run.employerContribTotal
    const ssRemaining = Math.max(0, ssTotal - run.socialSecurityPaid)

    // Check if any line has concept breakdown
    const hasConcepts = lines?.some(l => l.conceptBreakdown && l.conceptBreakdown.length > 0)

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <CaretRight
                        size={16}
                        className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <div>
                        <span className="font-semibold text-slate-900">{fmtPeriod(run.period)}</span>
                        <span className="text-xs text-slate-500 ml-2">({fmtDate(run.accrualDate)})</span>
                    </div>
                    <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <div className="hidden sm:block">
                        <span className="text-slate-500">Bruto:</span>{' '}
                        <span className="font-mono font-medium text-slate-900">{fmtCurrency(run.grossTotal)}</span>
                    </div>
                    <div>
                        <span className="text-slate-500">Neto:</span>{' '}
                        <span className="font-mono font-medium text-slate-900">{fmtCurrency(run.netTotal)}</span>
                    </div>
                </div>
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                    {/* Summary Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-xs text-slate-500">Bruto Total</div>
                            <div className="font-mono font-semibold text-slate-900">{fmtCurrency2(run.grossTotal)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-xs text-slate-500">Retenciones</div>
                            <div className="font-mono font-semibold text-slate-900">{fmtCurrency2(run.employeeWithholdTotal)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-xs text-slate-500">Contrib. Patronal</div>
                            <div className="font-mono font-semibold text-slate-900">{fmtCurrency2(run.employerContribTotal)}</div>
                        </div>
                        <div className="bg-violet-50 rounded-lg p-3">
                            <div className="text-xs text-violet-600">Neto a Pagar</div>
                            <div className="font-mono font-bold text-violet-700">{fmtCurrency2(run.netTotal)}</div>
                        </div>
                        {run.advancesAppliedTotal > 0 && (
                            <div className="bg-amber-50 rounded-lg p-3">
                                <div className="text-xs text-amber-600">Anticipos</div>
                                <div className="font-mono font-semibold text-amber-700">{fmtCurrency2(run.advancesAppliedTotal)}</div>
                            </div>
                        )}
                    </div>

                    {/* Lines Table */}
                    {lines && lines.length > 0 && (
                        <div className="space-y-2">
                            {lines.map(line => (
                                <PayrollLineRow
                                    key={line.id}
                                    line={line}
                                    employeeName={empMap.get(line.employeeId)?.fullName || 'Desconocido'}
                                    isDraft={run.status === 'draft'}
                                    hasConcepts={!!hasConcepts}
                                />
                            ))}
                        </div>
                    )}

                    {/* Payment Progress */}
                    {run.status !== 'draft' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-medium text-slate-600">Pago Sueldos</span>
                                    <span className="text-xs text-slate-500">{fmtCurrency2(run.salaryPaid)} / {fmtCurrency2(run.netTotal)}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-violet-500 h-2 rounded-full transition-all"
                                        style={{ width: `${run.netTotal > 0 ? Math.min(100, (run.salaryPaid / run.netTotal) * 100) : 0}%` }}
                                    />
                                </div>
                                {salaryRemaining > 0 && (
                                    <button
                                        onClick={onPaySalary}
                                        className="text-xs text-violet-600 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Money size={14} /> Registrar pago ({fmtCurrency(salaryRemaining)} pendiente)
                                    </button>
                                )}
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-medium text-slate-600">Pago Seg. Social</span>
                                    <span className="text-xs text-slate-500">{fmtCurrency2(run.socialSecurityPaid)} / {fmtCurrency2(ssTotal)}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-emerald-500 h-2 rounded-full transition-all"
                                        style={{ width: `${ssTotal > 0 ? Math.min(100, (run.socialSecurityPaid / ssTotal) * 100) : 0}%` }}
                                    />
                                </div>
                                {ssRemaining > 0 && (
                                    <button
                                        onClick={onPaySS}
                                        className="text-xs text-emerald-600 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Bank size={14} /> Registrar pago ({fmtCurrency(ssRemaining)} pendiente)
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Payments history */}
                    {payments && payments.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pagos Registrados</h4>
                            <div className="space-y-1">
                                {payments.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${p.type === 'salary' ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                                            <span className="text-slate-600">{p.type === 'salary' ? 'Sueldos' : 'Seg. Social'}</span>
                                            <span className="text-slate-400 text-xs">{fmtDate(p.date)}</span>
                                        </div>
                                        <span className="font-mono font-medium text-slate-900">{fmtCurrency2(p.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                        {run.status === 'draft' && (
                            <>
                                <button
                                    onClick={onPost}
                                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
                                >
                                    <Receipt size={16} /> Devengar (Generar Asiento)
                                </button>
                                <button
                                    onClick={onDelete}
                                    className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-2"
                                >
                                    <Trash size={16} /> Eliminar
                                </button>
                            </>
                        )}
                        {run.journalEntryId && (
                            <button
                                onClick={() => window.open(`/asientos`, '_self')}
                                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Eye size={16} /> Ver Asiento en Diario
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── PayrollLineRow (with concept breakdown) ────────────────

function PayrollLineRow({
    line,
    employeeName,
    isDraft,
}: {
    line: PayrollLine
    employeeName: string
    isDraft: boolean
    hasConcepts: boolean
}) {
    const [editing, setEditing] = useState(false)
    const [showBreakdown, setShowBreakdown] = useState(false)
    const [editGross, setEditGross] = useState(String(line.gross))
    const [editWithholds, setEditWithholds] = useState(String(line.employeeWithholds))
    const [editContrib, setEditContrib] = useState(String(line.employerContrib))

    const breakdown = line.conceptBreakdown

    const handleSave = async () => {
        await updatePayrollLine(line.id, {
            gross: parseFloat(editGross) || 0,
            employeeWithholds: parseFloat(editWithholds) || 0,
            employerContrib: parseFloat(editContrib) || 0,
        })
        setEditing(false)
    }

    return (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* Main row */}
            <div className="flex items-center px-3 py-2.5 text-sm">
                <div className="flex-1 flex items-center gap-2">
                    {breakdown && breakdown.length > 0 && (
                        <button
                            onClick={() => setShowBreakdown(!showBreakdown)}
                            className="text-slate-400 hover:text-violet-600 transition-colors"
                        >
                            {showBreakdown ? <CaretDown size={14} /> : <CaretRight size={14} />}
                        </button>
                    )}
                    <span className="font-medium text-slate-900">{employeeName}</span>
                </div>
                {editing && isDraft ? (
                    <>
                        <input type="number" className="w-24 px-2 py-1 border border-violet-200 rounded text-sm font-mono text-right mx-1" value={editGross} onChange={e => setEditGross(e.target.value)} />
                        <input type="number" className="w-24 px-2 py-1 border border-violet-200 rounded text-sm font-mono text-right mx-1" value={editWithholds} onChange={e => setEditWithholds(e.target.value)} />
                        <input type="number" className="w-24 px-2 py-1 border border-violet-200 rounded text-sm font-mono text-right mx-1" value={editContrib} onChange={e => setEditContrib(e.target.value)} />
                        <div className="flex gap-1 ml-2">
                            <button onClick={handleSave} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><FloppyDisk size={16} /></button>
                            <button onClick={() => setEditing(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={16} /></button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-right font-mono text-slate-700 w-24 px-2">{fmtCurrency2(line.gross)}</div>
                        <div className="text-right font-mono text-slate-700 w-24 px-2 hidden sm:block">{fmtCurrency2(line.employeeWithholds)}</div>
                        <div className="text-right font-mono text-slate-700 w-24 px-2 hidden sm:block">{fmtCurrency2(line.employerContrib)}</div>
                        <div className="text-right font-mono font-bold text-slate-900 w-24 px-2">{fmtCurrency2(line.net)}</div>
                        {isDraft && (
                            <button
                                onClick={() => setEditing(true)}
                                className="ml-1 p-1 text-slate-300 hover:text-violet-500 transition-opacity"
                                title="Editar"
                            >
                                <Pencil size={14} />
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Concept Breakdown */}
            {showBreakdown && breakdown && breakdown.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-400">
                                <th className="text-left py-1 font-medium">Concepto</th>
                                <th className="text-left py-1 font-medium">Tipo</th>
                                <th className="text-right py-1 font-medium">Base</th>
                                <th className="text-right py-1 font-medium">Tasa</th>
                                <th className="text-right py-1 font-medium">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {breakdown.map((detail, i) => (
                                <tr key={i} className="border-t border-slate-100/50">
                                    <td className="py-1.5 text-slate-700">
                                        {detail.conceptName}
                                        {detail.formulaExpr && (
                                            <span className="ml-1 text-slate-400 font-mono" title={detail.formulaExpr}>
                                                <Info size={10} className="inline" />
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                            detail.kind === 'earning'
                                                ? 'bg-emerald-50 text-emerald-600'
                                                : detail.kind === 'deduction'
                                                ? 'bg-red-50 text-red-600'
                                                : 'bg-violet-50 text-violet-600'
                                        }`}>
                                            {detail.kind === 'earning' ? 'HAB' : detail.kind === 'deduction' ? 'DED' : 'PAT'}
                                        </span>
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-slate-500">
                                        {detail.baseAmount > 0 ? fmtCurrency2(detail.baseAmount) : '—'}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-slate-500">
                                        {detail.rate != null ? fmtPercent(detail.rate) : '—'}
                                    </td>
                                    <td className={`py-1.5 text-right font-mono font-medium ${
                                        detail.kind === 'earning' ? 'text-emerald-700' : detail.kind === 'deduction' ? 'text-red-600' : 'text-violet-600'
                                    }`}>
                                        {detail.kind === 'deduction' ? '-' : ''}{fmtCurrency2(detail.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ─── PaymentModal ───────────────────────────────────────────

function PaymentModal({
    runId,
    type,
    maxAmount,
    accounts,
    onClose,
    onSuccess,
    onError,
}: {
    runId: string
    type: 'salary' | 'social_security'
    maxAmount: number
    accounts: Account[]
    onClose: () => void
    onSuccess: (msg: string) => void
    onError: (msg: string) => void
}) {
    const [date, setDate] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
    const [splits, setSplits] = useState<{ accountId: string; amount: string }[]>([
        { accountId: '', amount: String(maxAmount) },
    ])
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

    const paymentAccounts = useMemo(() =>
        accounts.filter(a =>
            !a.isHeader &&
            (a.kind === 'ASSET') &&
            (a.statementGroup === 'CASH_AND_BANKS' || a.code.startsWith('1.1.01'))
        ),
        [accounts]
    )

    const addSplit = () => setSplits(s => [...s, { accountId: '', amount: '' }])
    const removeSplit = (i: number) => setSplits(s => s.filter((_, idx) => idx !== i))

    const handleSave = async () => {
        setSaving(true)
        try {
            const paymentSplits: PaymentSplit[] = splits
                .filter(s => s.accountId && parseFloat(s.amount) > 0)
                .map(s => ({ accountId: s.accountId, amount: parseFloat(s.amount) }))

            if (paymentSplits.length === 0) {
                onError('Ingresa al menos una cuenta y monto')
                setSaving(false)
                return
            }

            await registerPayrollPayment(runId, type, date, paymentSplits, note || undefined)
            onSuccess(`Pago de ${type === 'salary' ? 'sueldos' : 'seguridad social'} registrado`)
        } catch (err: unknown) {
            onError(err instanceof Error ? err.message : 'Error')
        }
        setSaving(false)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 m-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display font-semibold text-lg text-slate-900">
                        Registrar Pago: {type === 'salary' ? 'Sueldos' : 'Seguridad Social'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="space-y-3">
                    <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                        <span className="text-xs text-violet-600 font-medium">Saldo pendiente: </span>
                        <span className="font-mono font-bold text-violet-700">{fmtCurrency2(maxAmount)}</span>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de Pago</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Cuentas de Pago (splits)</label>
                        <div className="space-y-2">
                            {splits.map((split, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <select
                                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={split.accountId}
                                        onChange={e => {
                                            const next = [...splits]
                                            next[i].accountId = e.target.value
                                            setSplits(next)
                                        }}
                                    >
                                        <option value="">Seleccionar cuenta...</option>
                                        {paymentAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-violet-500 outline-none"
                                        value={split.amount}
                                        onChange={e => {
                                            const next = [...splits]
                                            next[i].amount = e.target.value
                                            setSplits(next)
                                        }}
                                        placeholder="Monto"
                                    />
                                    {splits.length > 1 && (
                                        <button onClick={() => removeSplit(i)} className="text-slate-400 hover:text-red-500">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={addSplit}
                                className="text-xs text-violet-600 font-medium hover:underline flex items-center gap-1"
                            >
                                <Plus size={12} /> Agregar cuenta
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Nota (opcional)</label>
                        <input
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Transferencia bancaria..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <FloppyDisk size={16} /> {saving ? 'Registrando...' : 'Registrar Pago'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// VENCIMIENTOS TAB
// ═══════════════════════════════════════════════════════════

function VencimientosTab({
    runs,
    settings,
}: {
    runs: PayrollRun[] | undefined
    settings: PayrollSettings | undefined
}) {
    const pendingRuns = useMemo(() =>
        runs?.filter(r => r.status === 'posted' || r.status === 'partial') || [],
        [runs]
    )

    const obligations = useMemo(() => {
        if (!settings) return []
        const items: {
            id: string
            type: 'salary' | 'social_security'
            period: string
            amount: number
            dueDate: string
            overdue: boolean
            daysUntilDue: number
        }[] = []

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        for (const run of pendingRuns) {
            const [y, m] = run.period.split('-').map(Number)
            const salaryRemaining = Math.max(0, run.netTotal - run.salaryPaid)
            if (salaryRemaining > 0) {
                const salaryDue = new Date(y, m, Math.min(settings.dueDaySalary, 28))
                const daysUntil = Math.ceil((salaryDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                items.push({
                    id: `${run.id}-salary`,
                    type: 'salary',
                    period: run.period,
                    amount: salaryRemaining,
                    dueDate: `${salaryDue.getFullYear()}-${String(salaryDue.getMonth() + 1).padStart(2, '0')}-${String(salaryDue.getDate()).padStart(2, '0')}`,
                    overdue: daysUntil < 0,
                    daysUntilDue: daysUntil,
                })
            }

            const ssTotal = run.employeeWithholdTotal + run.employerContribTotal
            const ssRemaining = Math.max(0, ssTotal - run.socialSecurityPaid)
            if (ssRemaining > 0) {
                const ssDue = new Date(y, m, Math.min(settings.dueDaySocialSecurity, 28))
                const daysUntil = Math.ceil((ssDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                items.push({
                    id: `${run.id}-ss`,
                    type: 'social_security',
                    period: run.period,
                    amount: ssRemaining,
                    dueDate: `${ssDue.getFullYear()}-${String(ssDue.getMonth() + 1).padStart(2, '0')}-${String(ssDue.getDate()).padStart(2, '0')}`,
                    overdue: daysUntil < 0,
                    daysUntilDue: daysUntil,
                })
            }
        }

        return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    }, [pendingRuns, settings])

    const aging = useMemo(() => {
        const buckets = { current: 0, d30: 0, d60: 0, d90plus: 0 }
        for (const ob of obligations) {
            if (ob.daysUntilDue >= 0) buckets.current += ob.amount
            else if (ob.daysUntilDue >= -30) buckets.d30 += ob.amount
            else if (ob.daysUntilDue >= -60) buckets.d60 += ob.amount
            else buckets.d90plus += ob.amount
        }
        return buckets
    }, [obligations])

    const totalPending = obligations.reduce((s, o) => s + o.amount, 0)
    const overdueCount = obligations.filter(o => o.overdue).length
    const thisWeek = obligations.filter(o => o.daysUntilDue >= 0 && o.daysUntilDue <= 7).length

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Vence esta semana</div>
                    <div className="font-mono text-xl font-bold text-amber-600">{thisWeek}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Vencidos</div>
                    <div className="font-mono text-xl font-bold text-red-600">{overdueCount}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-500 mb-1">Total Pendiente</div>
                    <div className="font-mono text-xl font-bold text-slate-900">{fmtCurrency(totalPending)}</div>
                </div>
            </div>

            {/* Aging */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Aging</h3>
                <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">Al dia</div>
                        <div className="font-mono font-semibold text-emerald-600">{fmtCurrency(aging.current)}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">0-30 dias</div>
                        <div className="font-mono font-semibold text-amber-600">{fmtCurrency(aging.d30)}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">31-60 dias</div>
                        <div className="font-mono font-semibold text-orange-600">{fmtCurrency(aging.d60)}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1">+90 dias</div>
                        <div className="font-mono font-semibold text-red-600">{fmtCurrency(aging.d90plus)}</div>
                    </div>
                </div>
            </div>

            {/* Obligations List */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Obligacion</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Periodo</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Vencimiento</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Monto</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {obligations.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                    No hay obligaciones pendientes.
                                </td>
                            </tr>
                        ) : (
                            obligations.map(ob => (
                                <tr key={ob.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${ob.type === 'salary' ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                                            <span className="text-slate-900">{ob.type === 'salary' ? 'Sueldos (neto)' : 'Seguridad Social'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{fmtPeriod(ob.period)}</td>
                                    <td className="px-4 py-3 text-slate-600">{fmtDate(ob.dueDate)}</td>
                                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-900">{fmtCurrency2(ob.amount)}</td>
                                    <td className="px-4 py-3 text-center">
                                        {ob.overdue ? (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-100">Vencido</span>
                                        ) : ob.daysUntilDue <= 5 ? (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-100">Proximo</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">OK</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// ASIENTOS TAB
// ═══════════════════════════════════════════════════════════

function AsientosTab({
    entries,
    accounts,
}: {
    entries: JournalEntry[] | undefined
    accounts: Account[] | undefined
}) {
    const accountMap = useMemo(() => {
        const m = new Map<string, Account>()
        accounts?.forEach(a => m.set(a.id, a))
        return m
    }, [accounts])

    return (
        <div className="space-y-4">
            <h3 className="font-display font-semibold text-lg text-slate-900">Asientos Generados</h3>

            {!entries || entries.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 shadow-sm">
                    No hay asientos generados por este modulo.
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.map(entry => (
                        <div key={entry.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <span className="font-medium text-slate-900">{entry.memo}</span>
                                    <span className="text-xs text-slate-500 ml-2">{fmtDate(entry.date)}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    entry.sourceType === 'accrual'
                                        ? 'bg-violet-50 text-violet-600 border border-violet-100'
                                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                }`}>
                                    {entry.sourceType === 'accrual' ? 'Devengamiento' : 'Pago'}
                                </span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">Cuenta</th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">Debe</th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">Haber</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {entry.lines.map((line, i) => {
                                        const acc = accountMap.get(line.accountId)
                                        return (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-2 text-slate-900">
                                                    <span className="text-xs text-slate-400 mr-1">{acc?.code}</span>
                                                    {acc?.name || line.accountId}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-700">
                                                    {line.debit > 0 ? fmtCurrency2(line.debit) : ''}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-700">
                                                    {line.credit > 0 ? fmtCurrency2(line.credit) : ''}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
