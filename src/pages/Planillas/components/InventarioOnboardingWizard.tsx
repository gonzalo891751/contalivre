/**
 * InventarioOnboardingWizard — 3-step setup for Bienes de Cambio module
 *
 * Step 1: Choose inventory mode (Permanente / Diferencias)
 * Step 2: Choose costing method (FIFO / LIFO / PPP)
 * Step 3: Map required accounts (with auto-configure)
 */

import { useState, useMemo, useCallback } from 'react'
import {
    GearSix,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    Sparkle,
    Info,
    Check,
} from '@phosphor-icons/react'
import type { Account } from '../../../core/models'
import type {
    BienesSettings,
    CostingMethod,
    InventoryMode,
    AccountMappingKey,
} from '../../../core/inventario/types'
import { DEFAULT_ACCOUNT_CODES } from '../../../core/inventario/types'
import { AccountAutocomplete } from './AccountAutocomplete'
import { normalizeText } from '../../../storage/bienes'

// ─── Account rules per mode ──────────────────────────────────

interface WizardAccountRule {
    key: AccountMappingKey
    label: string
    codes: string[]
    nameAny?: string[]
    nameAll?: string[]
    required: boolean
    modes: InventoryMode[] // which modes this rule applies to
}

const WIZARD_ACCOUNT_RULES: WizardAccountRule[] = [
    {
        key: 'mercaderias',
        label: 'Mercaderias (Activo)',
        codes: [DEFAULT_ACCOUNT_CODES.mercaderias, '1.2.01', '1.2.05'],
        nameAny: ['mercader', 'bienes de cambio', 'inventario', 'stock'],
        required: true,
        modes: ['PERMANENT', 'PERIODIC'],
    },
    {
        key: 'cmv',
        label: 'CMV - Costo de Mercaderias Vendidas (Resultado)',
        codes: [DEFAULT_ACCOUNT_CODES.cmv, '4.3.01'],
        nameAny: ['cmv', 'costo mercader', 'costo de mercader'],
        required: true,
        modes: ['PERMANENT', 'PERIODIC'],
    },
    {
        key: 'compras',
        label: 'Compras (Resultado)',
        codes: [DEFAULT_ACCOUNT_CODES.compras, '4.8.01', '5.1.03'],
        nameAny: ['compra'],
        required: true,
        modes: ['PERIODIC'],
    },
    {
        key: 'bonifCompras',
        label: 'Bonificaciones sobre compras (Resultado)',
        codes: [DEFAULT_ACCOUNT_CODES.bonifCompras, '4.8.03', '5.1.05'],
        nameAll: ['bonif', 'compra'],
        required: true,
        modes: ['PERIODIC'],
    },
    {
        key: 'devolCompras',
        label: 'Devoluciones sobre compras (Resultado)',
        codes: [DEFAULT_ACCOUNT_CODES.devolCompras, '4.8.04', '5.1.06'],
        nameAll: ['devol', 'compra'],
        required: true,
        modes: ['PERIODIC'],
    },
    {
        key: 'aperturaInventario',
        label: 'Apertura Inventario (PN / Capital)',
        codes: ['3.1.01', DEFAULT_ACCOUNT_CODES.aperturaInventario, '3.2.01'],
        nameAny: ['capital social', 'capital suscripto', 'resultados acumulados', 'resultados no asignados', 'apertura'],
        required: false,
        modes: ['PERMANENT', 'PERIODIC'],
    },
    {
        key: 'gastosCompras',
        label: 'Gastos sobre compras (Resultado)',
        codes: [DEFAULT_ACCOUNT_CODES.gastosCompras, '4.8.02', '5.1.04'],
        nameAny: ['gasto', 'flete', 'seguro'],
        required: false,
        modes: ['PERIODIC'],
    },
]

// ─── Props ───────────────────────────────────────────────────

interface InventarioOnboardingWizardProps {
    settings: BienesSettings
    accounts: Account[]
    onComplete: (patch: Partial<BienesSettings>) => Promise<void>
    onCancel?: () => void
}

// ─── Component ───────────────────────────────────────────────

export default function InventarioOnboardingWizard({
    settings,
    accounts,
    onComplete,
    onCancel,
}: InventarioOnboardingWizardProps) {
    const [step, setStep] = useState(1)
    const [mode, setMode] = useState<InventoryMode>(settings.inventoryMode || 'PERMANENT')
    const [method, setMethod] = useState<CostingMethod>(settings.costMethod || 'PPP')
    const [mappings, setMappings] = useState<Partial<Record<AccountMappingKey, string>>>(
        settings.accountMappings || {}
    )
    const [saving, setSaving] = useState(false)

    // ─── Account resolution ──────────────────────────────────

    const findAccountByRule = useCallback(
        (rule: WizardAccountRule): Account | null => {
            if (!accounts || accounts.length === 0) return null
            for (const code of rule.codes) {
                const byCode = accounts.find(a => a.code === code && !a.isHeader)
                if (byCode) return byCode
            }
            const tokensAll = (rule.nameAll || []).map(normalizeText)
            const tokensAny = (rule.nameAny || []).map(normalizeText)
            if (tokensAll.length === 0 && tokensAny.length === 0) return null
            return (
                accounts.find(acc => {
                    if (acc.isHeader) return false
                    const haystack = `${normalizeText(acc.name)} ${normalizeText(acc.code)}`
                    if (tokensAll.length > 0) return tokensAll.every(t => haystack.includes(t))
                    return tokensAny.some(t => haystack.includes(t))
                }) || null
            )
        },
        [accounts]
    )

    const rulesForMode = useMemo(
        () => WIZARD_ACCOUNT_RULES.filter(r => r.modes.includes(mode)),
        [mode]
    )

    const requiredRules = useMemo(() => rulesForMode.filter(r => r.required), [rulesForMode])
    const optionalRules = useMemo(() => rulesForMode.filter(r => !r.required), [rulesForMode])

    const suggestions = useMemo(() => {
        const map = new Map<AccountMappingKey, Account | null>()
        rulesForMode.forEach(r => map.set(r.key, findAccountByRule(r)))
        return map
    }, [rulesForMode, findAccountByRule])

    const resolveAccount = useCallback(
        (idOrCode?: string) => {
            if (!idOrCode) return null
            return accounts.find(a => a.id === idOrCode) || accounts.find(a => a.code === idOrCode) || null
        },
        [accounts]
    )

    // ─── Actions ─────────────────────────────────────────────

    const handleAutoConfig = () => {
        const newMappings = { ...mappings }
        rulesForMode.forEach(rule => {
            if (newMappings[rule.key]) return // already mapped
            const suggested = suggestions.get(rule.key)
            if (suggested) newMappings[rule.key] = suggested.code
        })
        setMappings(newMappings)
    }

    const handleApplySuggestion = (key: AccountMappingKey) => {
        const suggested = suggestions.get(key)
        if (suggested) setMappings(prev => ({ ...prev, [key]: suggested.code }))
    }

    const handleMappingChange = (key: AccountMappingKey, value: { code: string }) => {
        setMappings(prev => ({ ...prev, [key]: value.code || '' }))
    }

    const handleClearMapping = (key: AccountMappingKey) => {
        setMappings(prev => ({ ...prev, [key]: '' }))
    }

    const handleFinish = async () => {
        setSaving(true)
        try {
            const cleaned: Partial<Record<AccountMappingKey, string>> = {}
            Object.entries(mappings).forEach(([k, v]) => {
                if (v && v.trim()) cleaned[k as AccountMappingKey] = v.trim()
            })
            await onComplete({
                inventoryMode: mode,
                costMethod: method,
                accountMappings: cleaned,
                configCompleted: true,
            })
        } finally {
            setSaving(false)
        }
    }

    const allRequiredMapped = requiredRules.every(r => {
        const v = mappings[r.key]
        return v && v.trim().length > 0
    })

    // ─── Render ──────────────────────────────────────────────

    const stepIndicator = (
        <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                            s < step
                                ? 'bg-emerald-500 text-white'
                                : s === step
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200 text-slate-500'
                        }`}
                    >
                        {s < step ? <Check size={16} weight="bold" /> : s}
                    </div>
                    {s < 3 && (
                        <div className={`w-12 h-0.5 ${s < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    )}
                </div>
            ))}
        </div>
    )

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                <GearSix size={24} weight="duotone" />
                            </div>
                            <div>
                                <h2 className="text-lg font-display font-semibold text-slate-900">
                                    Configurar Bienes de Cambio
                                </h2>
                                <p className="text-sm text-slate-500">
                                    Antes de empezar, configura el inventario.
                                </p>
                            </div>
                        </div>
                        {stepIndicator}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        {/* ─── STEP 1: Inventory Mode ─── */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-slate-900">
                                    Modo contable del inventario
                                </h3>
                                <p className="text-sm text-slate-500">
                                    Selecciona como vas a registrar el costo de mercaderias vendidas.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setMode('PERMANENT')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            mode === 'PERMANENT'
                                                ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="font-semibold text-slate-900 mb-1">
                                            Inventario Permanente
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            El CMV se calcula automaticamente en cada venta,
                                            usando el metodo de valuacion elegido (FIFO/LIFO/PPP).
                                            Ideal si registras compras y ventas detalladas.
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('PERIODIC')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                                            mode === 'PERIODIC'
                                                ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="font-semibold text-slate-900 mb-1">
                                            Inventario por Diferencias
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            El CMV se determina al cierre del ejercicio mediante la
                                            formula: EI + Compras Netas - EF.
                                            Adecuado para empresas con gran volumen de productos.
                                        </p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── STEP 2: Costing Method ─── */}
                        {step === 2 && (
                            <div className="space-y-4">
                                <h3 className="text-base font-semibold text-slate-900">
                                    Metodo de valuacion
                                </h3>
                                <p className="text-sm text-slate-500">
                                    Determina como se asigna el costo a las unidades vendidas.
                                </p>
                                <div className="space-y-3 mt-4">
                                    {([
                                        {
                                            value: 'PPP' as CostingMethod,
                                            label: 'Promedio Ponderado (PPP)',
                                            desc: 'Costo promedio de todas las compras. El mas utilizado en Argentina. Simple y aceptado por AFIP.',
                                        },
                                        {
                                            value: 'FIFO' as CostingMethod,
                                            label: 'FIFO / PEPS (Primero Entrado, Primero Salido)',
                                            desc: 'Las unidades mas antiguas se venden primero. Refleja mejor el valor actual del stock.',
                                        },
                                        {
                                            value: 'LIFO' as CostingMethod,
                                            label: 'LIFO / UEPS (Ultimo Entrado, Primero Salido)',
                                            desc: 'Las unidades mas recientes se venden primero. Menos comun, no permitido por NIC/NIIF.',
                                        },
                                    ]).map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setMethod(opt.value)}
                                            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                                                method === opt.value
                                                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="font-semibold text-slate-900 text-sm">
                                                {opt.label}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ─── STEP 3: Account Mapping ─── */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-900">
                                            Cuentas contables
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            Mapea las cuentas del plan contable para generar asientos.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAutoConfig}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all"
                                    >
                                        <Sparkle size={14} weight="fill" />
                                        Auto-configurar
                                    </button>
                                </div>

                                {/* Required accounts */}
                                <div className="space-y-3">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                        Obligatorias
                                    </div>
                                    {requiredRules.map(rule => {
                                        const selected = resolveAccount(mappings[rule.key])
                                        const suggested = suggestions.get(rule.key)
                                        return (
                                            <div key={rule.key} className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-semibold text-slate-600">
                                                        {rule.label}
                                                    </label>
                                                    {selected && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleClearMapping(rule.key)}
                                                            className="text-[10px] text-slate-400 hover:text-slate-600"
                                                        >
                                                            Limpiar
                                                        </button>
                                                    )}
                                                </div>
                                                <AccountAutocomplete
                                                    value={{
                                                        code: selected?.code || '',
                                                        name: selected?.name || '',
                                                    }}
                                                    onChange={v => handleMappingChange(rule.key, v)}
                                                    placeholder="Buscar cuenta..."
                                                />
                                                {!selected && suggested && (
                                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                                        <span>
                                                            Sugerida: {suggested.code} - {suggested.name}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApplySuggestion(rule.key)}
                                                            className="text-blue-600 font-semibold"
                                                        >
                                                            Usar
                                                        </button>
                                                    </div>
                                                )}
                                                {!selected && !suggested && (
                                                    <div className="text-[11px] text-amber-500 flex items-center gap-1">
                                                        <Info size={12} />
                                                        No se encontro cuenta sugerida. Selecciona manualmente.
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Optional accounts */}
                                {optionalRules.length > 0 && (
                                    <div className="space-y-3 border-t border-slate-100 pt-4">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                            Opcionales
                                        </div>
                                        {optionalRules.map(rule => {
                                            const selected = resolveAccount(mappings[rule.key])
                                            const suggested = suggestions.get(rule.key)
                                            return (
                                                <div key={rule.key} className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs font-semibold text-slate-600">
                                                            {rule.label}
                                                        </label>
                                                        {selected && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleClearMapping(rule.key)}
                                                                className="text-[10px] text-slate-400 hover:text-slate-600"
                                                            >
                                                                Limpiar
                                                            </button>
                                                        )}
                                                    </div>
                                                    <AccountAutocomplete
                                                        value={{
                                                            code: selected?.code || '',
                                                            name: selected?.name || '',
                                                        }}
                                                        onChange={v => handleMappingChange(rule.key, v)}
                                                        placeholder="Buscar cuenta..."
                                                    />
                                                    {!selected && suggested && (
                                                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                                                            <span>
                                                                Sugerida: {suggested.code} - {suggested.name}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApplySuggestion(rule.key)}
                                                                className="text-blue-600 font-semibold"
                                                            >
                                                                Usar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        <p className="text-[11px] text-slate-400">
                                            Si no configuras estas cuentas, se usa deteccion automatica.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                        <div>
                            {onCancel && step === 1 && (
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="text-sm text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </button>
                            )}
                            {step > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setStep(s => s - 1)}
                                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                                >
                                    <ArrowLeft size={14} /> Atras
                                </button>
                            )}
                        </div>
                        <div>
                            {step < 3 && (
                                <button
                                    type="button"
                                    onClick={() => setStep(s => s + 1)}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                                >
                                    Siguiente <ArrowRight size={14} />
                                </button>
                            )}
                            {step === 3 && (
                                <button
                                    type="button"
                                    onClick={handleFinish}
                                    disabled={saving || !allRequiredMapped}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <CheckCircle size={16} weight="fill" />
                                    {saving ? 'Guardando...' : 'Finalizar configuracion'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
