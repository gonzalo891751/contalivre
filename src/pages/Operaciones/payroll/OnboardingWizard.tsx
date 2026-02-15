/**
 * PayrollOnboardingWizard — 4-step setup for Sueldos PRO module
 *
 * Step 1: General config (rates, due days)
 * Step 2: Account mapping (auto-detect + manual override)
 * Step 3: Areas + Template selection + seed concepts
 * Step 4: Quick employee add
 */

import { useState, useMemo, useCallback } from 'react'
import {
    GearSix,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    Sparkle,
    Check,
    Users,
    MapPin,
    CurrencyDollar,
    Plus,
    Trash,
    Info,
} from '@phosphor-icons/react'
import type { Account } from '../../../core/models'
import type {
    PayrollSettings,
    PayrollAccountMappings,
    TemplateType,
} from '../../../core/payroll/types'
import {
    DEFAULT_AREAS,
    PAYROLL_TEMPLATES,
    PAYROLL_ACCOUNT_FALLBACKS,
} from '../../../core/payroll/types'
import {
    updatePayrollSettings,
    seedConceptsFromTemplate,
    createEmployee,
} from '../../../storage/payroll'

// ─── Account rules for auto-detect ──────────────────────────

interface AccountRule {
    key: keyof PayrollAccountMappings
    label: string
    codes: string[]
    names: string[]
    required: boolean
}

const ACCOUNT_RULES: AccountRule[] = Object.entries(PAYROLL_ACCOUNT_FALLBACKS).map(([key, fb]) => ({
    key: key as keyof PayrollAccountMappings,
    label: key === 'sueldosYJornales' ? 'Sueldos y Jornales (Gasto)'
        : key === 'cargasSociales' ? 'Cargas Sociales (Gasto)'
        : key === 'sueldosAPagar' ? 'Sueldos a Pagar (Pasivo)'
        : key === 'retencionesADepositar' ? 'Retenciones a Depositar (Pasivo)'
        : key === 'cargasSocialesAPagar' ? 'Cargas Sociales a Pagar (Pasivo)'
        : 'Anticipos al Personal (Activo)',
    codes: fb.codes,
    names: fb.names,
    required: key !== 'anticiposAlPersonal',
}))

const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ─── Props ──────────────────────────────────────────────────

interface PayrollOnboardingWizardProps {
    settings: PayrollSettings
    accounts: Account[]
    onComplete: () => void
    onCancel?: () => void
}

// ─── Component ──────────────────────────────────────────────

export default function PayrollOnboardingWizard({
    settings,
    accounts,
    onComplete,
    onCancel,
}: PayrollOnboardingWizardProps) {
    const [step, setStep] = useState(1)
    const [saving, setSaving] = useState(false)

    // Step 1: Config
    const [withholdRate, setWithholdRate] = useState(String(settings.defaultEmployeeWithholdRate * 100))
    const [contribRate, setContribRate] = useState(String(settings.defaultEmployerContribRate * 100))
    const [artRate, setArtRate] = useState(String(settings.defaultArtRate * 100))
    const [dueSalary, setDueSalary] = useState(String(settings.dueDaySalary))
    const [dueSS, setDueSS] = useState(String(settings.dueDaySocialSecurity))

    // Step 2: Account mappings
    const [mappings, setMappings] = useState<Partial<PayrollAccountMappings>>(
        settings.accountMappings || {}
    )

    // Step 3: Areas + Template
    const [areas, setAreas] = useState<string[]>(settings.areas || [...DEFAULT_AREAS])
    const [newArea, setNewArea] = useState('')
    const [templateId, setTemplateId] = useState<TemplateType>(settings.defaultTemplate || 'out_of_cct')

    // Step 4: Quick employees
    const [quickEmployees, setQuickEmployees] = useState<{ name: string; gross: string; area: string }[]>([
        { name: '', gross: '', area: '' },
    ])

    // ─── Account resolution ─────────────────────────────────

    const findAccount = useCallback(
        (rule: AccountRule): Account | null => {
            if (!accounts.length) return null
            for (const code of rule.codes) {
                const found = accounts.find(a => a.code === code && !a.isHeader)
                if (found) return found
            }
            for (const name of rule.names) {
                const norm = normalize(name)
                const found = accounts.find(a => normalize(a.name) === norm && !a.isHeader)
                if (found) return found
            }
            for (const name of rule.names) {
                const norm = normalize(name)
                const found = accounts.find(a => normalize(a.name).includes(norm) && !a.isHeader)
                if (found) return found
            }
            return null
        },
        [accounts]
    )

    const suggestions = useMemo(() => {
        const map = new Map<keyof PayrollAccountMappings, Account | null>()
        ACCOUNT_RULES.forEach(r => map.set(r.key, findAccount(r)))
        return map
    }, [findAccount])

    const handleAutoConfig = () => {
        const next = { ...mappings }
        ACCOUNT_RULES.forEach(rule => {
            if (next[rule.key]) return
            const suggested = suggestions.get(rule.key)
            if (suggested) next[rule.key] = suggested.id
        })
        setMappings(next)
    }

    const requiredMapped = ACCOUNT_RULES
        .filter(r => r.required)
        .every(r => mappings[r.key])

    // ─── Actions ────────────────────────────────────────────

    const handleAddArea = () => {
        const trimmed = newArea.trim()
        if (trimmed && !areas.includes(trimmed)) {
            setAreas([...areas, trimmed])
            setNewArea('')
        }
    }

    const handleRemoveArea = (area: string) => {
        setAreas(areas.filter(a => a !== area))
    }

    const handleFinish = async () => {
        setSaving(true)
        try {
            // Save settings
            await updatePayrollSettings({
                defaultEmployeeWithholdRate: parseFloat(withholdRate) / 100 || 0.17,
                defaultEmployerContribRate: parseFloat(contribRate) / 100 || 0.2633,
                defaultArtRate: parseFloat(artRate) / 100 || 0.025,
                dueDaySalary: parseInt(dueSalary) || 4,
                dueDaySocialSecurity: parseInt(dueSS) || 11,
                accountMappings: mappings as PayrollAccountMappings,
                areas,
                defaultTemplate: templateId,
                onboardingCompleted: true,
            })

            // Seed concepts from template
            await seedConceptsFromTemplate(templateId)

            // Create quick employees
            for (const emp of quickEmployees) {
                const gross = parseFloat(emp.gross)
                if (emp.name.trim() && !isNaN(gross) && gross > 0) {
                    await createEmployee({
                        fullName: emp.name.trim(),
                        baseGross: gross,
                        status: 'active',
                        payType: 'monthly',
                        area: emp.area || undefined,
                        templateId,
                    })
                }
            }

            onComplete()
        } finally {
            setSaving(false)
        }
    }

    // ─── Step Indicator ─────────────────────────────────────

    const STEP_LABELS = ['Config', 'Cuentas', 'Areas', 'Empleados']

    const stepIndicator = (
        <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3, 4].map(s => (
                <div key={s} className="flex items-center gap-2">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                            s < step
                                ? 'bg-emerald-500 text-white'
                                : s === step
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-200 text-slate-500'
                        }`}
                    >
                        {s < step ? <Check size={16} weight="bold" /> : s}
                    </div>
                    {s < 4 && (
                        <div className={`w-8 h-0.5 ${s < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    )}
                </div>
            ))}
            <span className="ml-2 text-xs text-slate-500">{STEP_LABELS[step - 1]}</span>
        </div>
    )

    // ─── Render ─────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                                <GearSix size={24} weight="duotone" />
                            </div>
                            <div>
                                <h2 className="text-lg font-display font-semibold text-slate-900">
                                    Configurar Sueldos
                                </h2>
                                <p className="text-sm text-slate-500">
                                    Configura tasas, cuentas contables, areas y plantillas.
                                </p>
                            </div>
                        </div>
                        {stepIndicator}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        {/* ─── STEP 1: Config ─── */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <CurrencyDollar size={20} weight="duotone" />
                                    Tasas y Vencimientos
                                </h3>
                                <p className="text-sm text-slate-500">
                                    Configura las tasas predeterminadas de retenciones, contribuciones y ART.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">
                                            Retenciones empleado (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                            value={withholdRate}
                                            onChange={e => setWithholdRate(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">
                                            Contribuciones patronales (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                            value={contribRate}
                                            onChange={e => setContribRate(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">
                                            ART (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                            value={artRate}
                                            onChange={e => setArtRate(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Vto. Sueldos (dia)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="28"
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                                value={dueSalary}
                                                onChange={e => setDueSalary(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Vto. Seg. Social (dia)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="28"
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                                value={dueSS}
                                                onChange={e => setDueSS(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2 text-xs text-slate-500 mt-4">
                                    <Info size={16} weight="fill" className="text-slate-400 mt-0.5 shrink-0" />
                                    <span>Estas tasas se usan como predeterminadas al crear liquidaciones. Siempre podes ajustarlas por empleado.</span>
                                </div>
                            </div>
                        )}

                        {/* ─── STEP 2: Account Mapping ─── */}
                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                        <MapPin size={20} weight="duotone" />
                                        Mapeo de Cuentas
                                    </h3>
                                    <button
                                        onClick={handleAutoConfig}
                                        className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors flex items-center gap-1"
                                    >
                                        <Sparkle size={14} weight="fill" /> Auto-detectar
                                    </button>
                                </div>
                                <p className="text-sm text-slate-500">
                                    Vincula las cuentas contables que se usaran en los asientos de sueldos.
                                </p>

                                <div className="space-y-3 mt-4">
                                    {ACCOUNT_RULES.map(rule => {
                                        const currentId = mappings[rule.key]
                                        const currentAcc = accounts.find(a => a.id === currentId)
                                        const suggestion = suggestions.get(rule.key)

                                        return (
                                            <div key={rule.key} className="bg-white border border-slate-200 rounded-lg p-3">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="text-xs font-medium text-slate-700">
                                                        {rule.label}
                                                        {rule.required && <span className="text-red-400 ml-0.5">*</span>}
                                                    </label>
                                                    {!currentId && suggestion && (
                                                        <button
                                                            onClick={() => setMappings(prev => ({ ...prev, [rule.key]: suggestion.id }))}
                                                            className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                                                        >
                                                            <Sparkle size={10} /> {suggestion.code} - {suggestion.name}
                                                        </button>
                                                    )}
                                                </div>
                                                <select
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                                    value={currentId || ''}
                                                    onChange={e => setMappings(prev => ({ ...prev, [rule.key]: e.target.value || undefined }))}
                                                >
                                                    <option value="">Seleccionar cuenta...</option>
                                                    {accounts
                                                        .filter(a => !a.isHeader)
                                                        .map(a => (
                                                            <option key={a.id} value={a.id}>
                                                                {a.code} - {a.name}
                                                            </option>
                                                        ))
                                                    }
                                                </select>
                                                {currentAcc && (
                                                    <div className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                                                        <CheckCircle size={12} weight="fill" />
                                                        {currentAcc.code} - {currentAcc.name}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ─── STEP 3: Areas + Template ─── */}
                        {step === 3 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-2">
                                        <Users size={20} weight="duotone" />
                                        Areas / Departamentos
                                    </h3>
                                    <p className="text-sm text-slate-500 mb-3">
                                        Define las areas de tu empresa para clasificar empleados y generar reportes.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {areas.map(area => (
                                            <span
                                                key={area}
                                                className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-100 flex items-center gap-1.5"
                                            >
                                                {area}
                                                <button
                                                    onClick={() => handleRemoveArea(area)}
                                                    className="text-violet-400 hover:text-red-500"
                                                >
                                                    <Trash size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                            value={newArea}
                                            onChange={e => setNewArea(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddArea()}
                                            placeholder="Nueva area..."
                                        />
                                        <button
                                            onClick={handleAddArea}
                                            className="px-3 py-2 text-sm font-medium text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-base font-semibold text-slate-900 mb-2">
                                        Plantilla de Conceptos
                                    </h3>
                                    <p className="text-sm text-slate-500 mb-3">
                                        Selecciona una plantilla predefinida con conceptos de liquidacion.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {PAYROLL_TEMPLATES.map(tmpl => (
                                            <button
                                                key={tmpl.id}
                                                type="button"
                                                onClick={() => setTemplateId(tmpl.id)}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${
                                                    templateId === tmpl.id
                                                        ? 'border-violet-500 bg-violet-50/50 shadow-sm'
                                                        : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="font-semibold text-slate-900 mb-1">{tmpl.name}</div>
                                                <p className="text-xs text-slate-500 leading-relaxed">{tmpl.description}</p>
                                                <div className="mt-2 text-xs text-slate-400">
                                                    {tmpl.concepts.length} conceptos
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── STEP 4: Quick Employees ─── */}
                        {step === 4 && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <Users size={20} weight="duotone" />
                                    Agregar Empleados (opcional)
                                </h3>
                                <p className="text-sm text-slate-500">
                                    Agrega rapidamente tu nomina. Siempre podes agregar mas despues.
                                </p>

                                <div className="space-y-2 mt-4">
                                    {quickEmployees.map((emp, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <input
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                                value={emp.name}
                                                onChange={e => {
                                                    const next = [...quickEmployees]
                                                    next[i].name = e.target.value
                                                    setQuickEmployees(next)
                                                }}
                                                placeholder="Nombre completo"
                                            />
                                            <input
                                                type="number"
                                                className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500 outline-none"
                                                value={emp.gross}
                                                onChange={e => {
                                                    const next = [...quickEmployees]
                                                    next[i].gross = e.target.value
                                                    setQuickEmployees(next)
                                                }}
                                                placeholder="Bruto"
                                            />
                                            <select
                                                className="w-36 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                                value={emp.area}
                                                onChange={e => {
                                                    const next = [...quickEmployees]
                                                    next[i].area = e.target.value
                                                    setQuickEmployees(next)
                                                }}
                                            >
                                                <option value="">Area...</option>
                                                {areas.map(a => (
                                                    <option key={a} value={a}>{a}</option>
                                                ))}
                                            </select>
                                            {quickEmployees.length > 1 && (
                                                <button
                                                    onClick={() => setQuickEmployees(quickEmployees.filter((_, idx) => idx !== i))}
                                                    className="text-slate-400 hover:text-red-500 p-1"
                                                >
                                                    <Trash size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setQuickEmployees([...quickEmployees, { name: '', gross: '', area: '' }])}
                                        className="text-xs text-violet-600 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Agregar otro
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-between">
                        <div className="flex gap-2">
                            {step > 1 && (
                                <button
                                    onClick={() => setStep(step - 1)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <ArrowLeft size={16} /> Atras
                                </button>
                            )}
                            {onCancel && (
                                <button
                                    onClick={onCancel}
                                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>

                        <div>
                            {step < 4 ? (
                                <button
                                    onClick={() => setStep(step + 1)}
                                    disabled={step === 2 && !requiredMapped}
                                    className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    Siguiente <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleFinish}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <CheckCircle size={16} weight="fill" />
                                    {saving ? 'Guardando...' : 'Finalizar Configuracion'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
