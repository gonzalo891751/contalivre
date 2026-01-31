/**
 * MovementModalV2 - Registrar Movimiento con tabs Compra/Venta/Ajuste
 *
 * Siguiendo el prototipo: docs/prototypes/botoncitoycon.html
 *
 * - Tab Compra: formulario de compra estándar
 * - Tab Venta: formulario de venta estándar
 * - Tab Ajuste: sub-tabs
 *   - Ajuste de Stock (entrada/salida física)
 *   - Ajuste por Inflación (RT6) manual
 *   - Diferencia Inventario (placeholder para Prompt 2)
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
    X,
    Warning,
    Check,
    Plus,
    MagnifyingGlass,
    CaretDown,
    Info,
    Trash,
    ArrowRight,
    Sparkle,
} from '@phosphor-icons/react'
import type {
    BienesProduct,
    BienesMovement,
    BienesMovementType,
    CostingMethod,
    IVARate,
    ProductValuation,
} from '../../../core/inventario/types'
import type { Account } from '../../../core/models'

type MainTab = 'compra' | 'venta' | 'ajuste'
type AjusteSubTab = 'stock' | 'rt6' | 'diferencia'

interface RT6CartItem {
    id: string
    productId: string
    productName: string
    concepto: string // 'compras' | 'mercaderias' | 'gastos' | etc.
    originMovementId?: string
    originMovementLabel?: string
    valorOrigen: number
    coeficiente: number
    valorHomogeneo: number
    delta: number
}

interface MovementModalV2Props {
    products: BienesProduct[]
    valuations: ProductValuation[]
    costMethod: CostingMethod
    onSave: (movement: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => Promise<void>
    onSaveRT6Batch?: (items: RT6CartItem[], generateJournal: boolean, date: string) => Promise<void>
    onClose: () => void
    initialData?: Partial<BienesMovement>
    mode?: 'create' | 'edit'
    accounts?: Account[]
    facpceIndices?: { period: string; index: number }[]
    periodId: string
    movements?: BienesMovement[]
}

const PAYMENT_OPTIONS = ['Cuenta Corriente', 'Efectivo', 'Transferencia', 'Cheque']

const RUBRO_OPTIONS = [
    { value: 'compras', label: 'Compras' },
    { value: 'mercaderias', label: 'Mercaderías' },
    { value: 'gastos', label: 'Gastos s/Compras' },
    { value: 'bonif', label: 'Bonificaciones s/Compras' },
    { value: 'devol', label: 'Devoluciones s/Compras' },
]

export default function MovementModalV2({
    products,
    valuations,
    costMethod,
    onSave,
    onSaveRT6Batch,
    onClose,
    initialData,
    mode = 'create',
    accounts: _accounts,
    facpceIndices,
    periodId: _periodId,
    movements,
}: MovementModalV2Props) {
    const isEditing = mode === 'edit'

    // Main tab state
    const [mainTab, setMainTab] = useState<MainTab>('compra')
    const [ajusteSubTab, setAjusteSubTab] = useState<AjusteSubTab>('stock')

    // Form data for Compra/Venta/Stock Adjustment
    const [formData, setFormData] = useState({
        type: 'PURCHASE' as BienesMovementType,
        productId: products[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        quantity: 1,
        unitCost: 0,
        unitPrice: 0,
        ivaRate: 21 as IVARate,
        counterparty: '',
        paymentMethod: 'Cuenta Corriente',
        notes: '',
        reference: '',
        autoJournal: false,
        adjustmentDirection: 'IN' as 'IN' | 'OUT',
        bonificacionPct: 0,
        descuentoFinancieroPct: 0,
        gastosCompra: 0,
        isDevolucion: false,
    })

    // RT6 Manual Adjustment state
    const [rt6Data, setRt6Data] = useState({
        productId: products[0]?.id || '',
        concepto: 'compras',
        originMovementId: '',
        date: new Date().toISOString().split('T')[0],
        manualDelta: '',
        useManualDelta: false,
        generateJournal: true,
    })
    const [rt6Cart, setRt6Cart] = useState<RT6CartItem[]>([])

    // Diferencia Inventario state (placeholder)
    const [difData, setDifData] = useState({
        productId: products[0]?.id || '',
        cantidadContada: 0,
        valorFisico: 0,
    })

    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Initialize from initialData
    useEffect(() => {
        if (!initialData) return
        const direction = initialData.type === 'ADJUSTMENT' && typeof initialData.quantity === 'number' && initialData.quantity < 0
            ? 'OUT'
            : 'IN'

        // Determine main tab from type
        let tab: MainTab = 'compra'
        if (initialData.type === 'SALE') tab = 'venta'
        else if (initialData.type === 'ADJUSTMENT' || initialData.type === 'VALUE_ADJUSTMENT') tab = 'ajuste'

        setMainTab(tab)
        setFormData(prev => ({
            ...prev,
            type: initialData.type || prev.type,
            productId: initialData.productId || prev.productId || products[0]?.id || '',
            date: initialData.date || prev.date,
            quantity: typeof initialData.quantity === 'number' ? Math.abs(initialData.quantity) : prev.quantity,
            unitCost: initialData.unitCost ?? prev.unitCost,
            unitPrice: initialData.unitPrice ?? prev.unitPrice,
            ivaRate: initialData.ivaRate ?? prev.ivaRate,
            counterparty: initialData.counterparty || prev.counterparty,
            paymentMethod: initialData.paymentMethod || prev.paymentMethod,
            notes: initialData.notes || prev.notes,
            reference: initialData.reference || prev.reference,
            autoJournal: initialData.autoJournal ?? prev.autoJournal,
            adjustmentDirection: direction,
        }))
    }, [initialData, products])

    // Sync type with main tab
    useEffect(() => {
        if (mainTab === 'compra') {
            setFormData(prev => ({ ...prev, type: 'PURCHASE' }))
        } else if (mainTab === 'venta') {
            setFormData(prev => ({ ...prev, type: 'SALE' }))
        } else if (mainTab === 'ajuste' && ajusteSubTab === 'stock') {
            setFormData(prev => ({ ...prev, type: 'ADJUSTMENT' }))
        }
    }, [mainTab, ajusteSubTab])

    // Product & valuation
    const selectedProduct = useMemo(
        () => products.find((p) => p.id === formData.productId),
        [products, formData.productId]
    )
    const selectedValuation = useMemo(
        () => valuations.find((v) => v.product.id === formData.productId),
        [valuations, formData.productId]
    )

    // Calculations
    const calculations = useMemo(() => {
        const baseAmount = formData.type === 'SALE' ? formData.unitPrice : formData.unitCost
        const estimatedCost = selectedValuation?.averageCost || 0
        const isAdjustmentOut = formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT'
        const adjustedBase = isAdjustmentOut ? estimatedCost : baseAmount
        const bruto = formData.quantity * adjustedBase

        const bonificacionAmt = bruto * (formData.bonificacionPct / 100)
        const netoAfterBonif = bruto - bonificacionAmt
        const ivaAmount = formData.type === 'PURCHASE' || formData.type === 'SALE'
            ? netoAfterBonif * (formData.ivaRate / 100)
            : 0
        const descuentoAmt = bruto * (formData.descuentoFinancieroPct / 100)
        const gastos = formData.type === 'PURCHASE' ? formData.gastosCompra : 0
        const subtotal = bruto
        const total = netoAfterBonif + ivaAmount + gastos - descuentoAmt
        const estimatedCMV = formData.type === 'SALE' ? formData.quantity * estimatedCost : 0

        return { subtotal, bruto, bonificacionAmt, netoAfterBonif, ivaAmount, descuentoAmt, gastos, total, estimatedCost, estimatedCMV }
    }, [formData, selectedValuation])

    // Stock warning
    const stockWarning = useMemo(() => {
        const isStockExit = formData.type === 'SALE' ||
            (formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT')
        if (isStockExit && selectedValuation) {
            if (formData.quantity > selectedValuation.currentStock) {
                return `Stock insuficiente. Disponible: ${selectedValuation.currentStock} ${selectedProduct?.unit || 'u'}`
            }
        }
        return null
    }, [formData.type, formData.quantity, formData.adjustmentDirection, selectedValuation, selectedProduct])

    // RT6 calculations
    const rt6Calculations = useMemo(() => {
        if (!facpceIndices || facpceIndices.length === 0) {
            return { valorOrigen: 0, coeficiente: 1, valorHomogeneo: 0, delta: 0 }
        }

        // Get selected product movements for origin selection
        const productMovements = movements?.filter(m =>
            m.productId === rt6Data.productId &&
            m.type === 'PURCHASE'
        ) || []

        let valorOrigen = 0
        let fechaOrigen = ''

        if (rt6Data.originMovementId) {
            const originMov = productMovements.find(m => m.id === rt6Data.originMovementId)
            if (originMov) {
                valorOrigen = originMov.subtotal
                fechaOrigen = originMov.date
            }
        }

        // Get coefficient from FACPCE indices
        const closingPeriod = rt6Data.date.substring(0, 7)
        const closingIndex = facpceIndices.find(i => i.period === closingPeriod)?.index || 1
        const originPeriod = fechaOrigen.substring(0, 7)
        const originIndex = facpceIndices.find(i => i.period === originPeriod)?.index || closingIndex
        const coeficiente = originIndex > 0 ? closingIndex / originIndex : 1

        const valorHomogeneo = valorOrigen * coeficiente
        const delta = valorHomogeneo - valorOrigen

        return { valorOrigen, coeficiente, valorHomogeneo, delta }
    }, [rt6Data, facpceIndices, movements])

    // Available origin movements for RT6
    const availableOriginMovements = useMemo(() => {
        if (!movements) return []
        return movements.filter(m =>
            m.productId === rt6Data.productId &&
            m.type === 'PURCHASE' &&
            !m.isDevolucion
        ).map(m => ({
            id: m.id,
            label: `${m.date} • Lote ${m.reference || m.id.slice(0, 6)} • $${m.subtotal.toLocaleString('es-AR')}`,
            subtotal: m.subtotal,
            date: m.date,
        }))
    }, [movements, rt6Data.productId])

    const handleChange = (field: keyof typeof formData, value: string | number | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError(null)
    }

    const handleRT6Change = (field: keyof typeof rt6Data, value: string | boolean) => {
        setRt6Data(prev => ({ ...prev, [field]: value }))
    }

    const handleAddToRT6Cart = useCallback(() => {
        const product = products.find(p => p.id === rt6Data.productId)
        if (!product) return

        const finalDelta = rt6Data.useManualDelta && rt6Data.manualDelta
            ? parseFloat(rt6Data.manualDelta) || 0
            : rt6Calculations.delta

        if (Math.abs(finalDelta) < 0.01) {
            setError('El delta es cero, no hay ajuste que agregar.')
            return
        }

        const newItem: RT6CartItem = {
            id: `rt6-${Date.now()}`,
            productId: rt6Data.productId,
            productName: product.name,
            concepto: rt6Data.concepto,
            originMovementId: rt6Data.originMovementId || undefined,
            originMovementLabel: availableOriginMovements.find(m => m.id === rt6Data.originMovementId)?.label,
            valorOrigen: rt6Calculations.valorOrigen,
            coeficiente: rt6Calculations.coeficiente,
            valorHomogeneo: rt6Calculations.valorHomogeneo,
            delta: finalDelta,
        }

        setRt6Cart(prev => [...prev, newItem])

        // Reset form for next item
        setRt6Data(prev => ({
            ...prev,
            originMovementId: '',
            manualDelta: '',
            useManualDelta: false,
        }))
    }, [rt6Data, rt6Calculations, products, availableOriginMovements])

    const handleRemoveFromRT6Cart = (id: string) => {
        setRt6Cart(prev => prev.filter(item => item.id !== id))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Handle RT6 batch submission
        if (mainTab === 'ajuste' && ajusteSubTab === 'rt6') {
            if (rt6Cart.length === 0) {
                setError('Agrega al menos un ajuste al carrito.')
                return
            }
            if (!onSaveRT6Batch) {
                setError('No se configuró el handler para RT6 batch.')
                return
            }
            setIsSaving(true)
            try {
                await onSaveRT6Batch(rt6Cart, rt6Data.generateJournal, rt6Data.date)
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar ajustes RT6')
                setIsSaving(false)
            }
            return
        }

        // Handle Diferencia Inventario (placeholder - just show message)
        if (mainTab === 'ajuste' && ajusteSubTab === 'diferencia') {
            setError('La funcionalidad de Diferencia de Inventario homogénea se implementará en Prompt 2.')
            return
        }

        // Standard movement validation
        if (!formData.productId) {
            setError('Selecciona un producto')
            return
        }
        if (formData.quantity <= 0) {
            setError('La cantidad debe ser mayor a 0')
            return
        }
        if (formData.type === 'PURCHASE' && formData.unitCost <= 0) {
            setError('El costo unitario debe ser mayor a 0')
            return
        }
        if (formData.type === 'SALE' && formData.unitPrice <= 0) {
            setError('El precio unitario debe ser mayor a 0')
            return
        }
        if (formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'IN' && formData.unitCost <= 0) {
            setError('El costo unitario debe ser mayor a 0')
            return
        }
        if (stockWarning) {
            setError(stockWarning)
            return
        }

        setIsSaving(true)
        try {
            await onSave({
                type: formData.type,
                productId: formData.productId,
                date: formData.date,
                quantity: formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT'
                    ? -Math.abs(formData.quantity)
                    : formData.quantity,
                unitCost: formData.type === 'PURCHASE' || (formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'IN')
                    ? formData.unitCost
                    : undefined,
                unitPrice: formData.type === 'SALE' ? formData.unitPrice : undefined,
                ivaRate: formData.type === 'ADJUSTMENT' ? 0 : formData.ivaRate,
                ivaAmount: formData.type === 'ADJUSTMENT' ? 0 : calculations.ivaAmount,
                subtotal: calculations.subtotal,
                total: calculations.total,
                costMethod,
                counterparty: formData.counterparty || undefined,
                paymentMethod: formData.paymentMethod || undefined,
                notes: formData.notes || undefined,
                reference: formData.reference || undefined,
                autoJournal: formData.autoJournal,
                bonificacionPct: formData.bonificacionPct || undefined,
                bonificacionAmount: calculations.bonificacionAmt || undefined,
                descuentoFinancieroPct: formData.descuentoFinancieroPct || undefined,
                descuentoFinancieroAmount: calculations.descuentoAmt || undefined,
                gastosCompra: calculations.gastos || undefined,
                isDevolucion: formData.isDevolucion || undefined,
            })
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al guardar')
            setIsSaving(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value)
    }

    const rt6CartTotal = useMemo(() => {
        return rt6Cart.reduce((sum, item) => sum + item.delta, 0)
    }, [rt6Cart])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-modal-in">
                {/* Header */}
                <header className="bg-white border-b border-slate-100 p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                            <Sparkle size={20} weight="bold" />
                        </div>
                        <h2 className="font-display font-bold text-lg text-slate-900">
                            {isEditing ? 'Editar Movimiento' : 'Registrar Movimiento'}
                        </h2>
                    </div>

                    {/* Main Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setMainTab('compra')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mainTab === 'compra'
                                    ? 'bg-white text-blue-600 shadow-sm font-bold'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            Compra
                        </button>
                        <button
                            type="button"
                            onClick={() => setMainTab('venta')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mainTab === 'venta'
                                    ? 'bg-white text-blue-600 shadow-sm font-bold'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            Venta
                        </button>
                        <button
                            type="button"
                            onClick={() => setMainTab('ajuste')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mainTab === 'ajuste'
                                    ? 'bg-white text-blue-600 shadow-sm font-bold'
                                    : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            Ajuste
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-900 p-2 rounded-full transition-colors"
                    >
                        <X size={20} weight="bold" />
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Column: Form */}
                    <div className="w-full lg:w-7/12 p-6 overflow-y-auto border-r border-slate-100 bg-white">
                        {/* Error */}
                        {error && (
                            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
                                <Warning size={16} weight="fill" /> {error}
                            </div>
                        )}

                        {/* Ajuste Sub-tabs */}
                        {mainTab === 'ajuste' && (
                            <div className="mb-6 flex gap-6 border-b border-slate-100 pb-1">
                                <button
                                    type="button"
                                    onClick={() => setAjusteSubTab('stock')}
                                    className={`text-sm pb-2 transition-colors ${
                                        ajusteSubTab === 'stock'
                                            ? 'font-bold text-blue-600 border-b-2 border-blue-600'
                                            : 'font-medium text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Ajuste de Stock
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAjusteSubTab('rt6')}
                                    className={`text-sm pb-2 transition-colors ${
                                        ajusteSubTab === 'rt6'
                                            ? 'font-bold text-blue-600 border-b-2 border-blue-600'
                                            : 'font-medium text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Ajuste por Inflación (RT6)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAjusteSubTab('diferencia')}
                                    className={`text-sm pb-2 transition-colors ${
                                        ajusteSubTab === 'diferencia'
                                            ? 'font-bold text-blue-600 border-b-2 border-blue-600'
                                            : 'font-medium text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    Diferencia Inventario
                                </button>
                            </div>
                        )}

                        {/* Form Content based on tab */}
                        {(mainTab === 'compra' || mainTab === 'venta' || (mainTab === 'ajuste' && ajusteSubTab === 'stock')) && (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Stock Adjustment Direction */}
                                {mainTab === 'ajuste' && ajusteSubTab === 'stock' && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                                            Tipo de ajuste
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleChange('adjustmentDirection', 'IN')}
                                                className={`py-2 text-xs font-semibold rounded-md border transition-all ${
                                                    formData.adjustmentDirection === 'IN'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                Entrada (aumenta stock)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleChange('adjustmentDirection', 'OUT')}
                                                className={`py-2 text-xs font-semibold rounded-md border transition-all ${
                                                    formData.adjustmentDirection === 'OUT'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                Salida (baja stock)
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Product & Date */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            Producto
                                        </label>
                                        <select
                                            value={formData.productId}
                                            onChange={(e) => handleChange('productId', e.target.value)}
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        >
                                            {products.map((p) => {
                                                const val = valuations.find((v) => v.product.id === p.id)
                                                return (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} (Stock: {val?.currentStock || 0})
                                                    </option>
                                                )
                                            })}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Método Costeo</label>
                                        <input
                                            type="text"
                                            value={costMethod}
                                            disabled
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-500"
                                        />
                                    </div>
                                </div>

                                {/* Quantity & Price */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={formData.quantity}
                                            onChange={(e) => handleChange('quantity', Number(e.target.value))}
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        {stockWarning && (
                                            <p className="text-xs text-red-600 mt-1">{stockWarning}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            {mainTab === 'venta' ? 'Precio Venta' : 'Costo Unitario'}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2 text-slate-400">$</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={
                                                    mainTab === 'venta'
                                                        ? formData.unitPrice
                                                        : mainTab === 'ajuste' && formData.adjustmentDirection === 'OUT'
                                                            ? calculations.estimatedCost
                                                            : formData.unitCost
                                                }
                                                onChange={(e) =>
                                                    handleChange(
                                                        mainTab === 'venta' ? 'unitPrice' : 'unitCost',
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-full pl-6 border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                                disabled={mainTab === 'ajuste' && formData.adjustmentDirection === 'OUT'}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Bonif/Desc/Gastos for Compra/Venta */}
                                {(mainTab === 'compra' || mainTab === 'venta') && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                {mainTab === 'compra' ? 'Condiciones de compra' : 'Condiciones de venta'}
                                            </span>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.isDevolucion}
                                                    onChange={(e) => handleChange('isDevolucion', e.target.checked)}
                                                    className="accent-amber-600 rounded"
                                                />
                                                <span className="text-xs font-semibold text-amber-700">
                                                    {mainTab === 'compra' ? 'Devolución de compra' : 'Devolución de venta'}
                                                </span>
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Bonificación (%)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.5"
                                                    value={formData.bonificacionPct || ''}
                                                    onChange={(e) => handleChange('bonificacionPct', Number(e.target.value))}
                                                    className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono text-right outline-none"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Dto. financiero (%)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.5"
                                                    value={formData.descuentoFinancieroPct || ''}
                                                    onChange={(e) => handleChange('descuentoFinancieroPct', Number(e.target.value))}
                                                    className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono text-right outline-none"
                                                    placeholder="0"
                                                />
                                            </div>
                                            {mainTab === 'compra' && (
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Gastos s/compra ($)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={formData.gastosCompra || ''}
                                                        onChange={(e) => handleChange('gastosCompra', Number(e.target.value))}
                                                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono text-right outline-none"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Counterparty & Payment */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            {mainTab === 'compra' ? 'Proveedor' : mainTab === 'venta' ? 'Cliente' : 'Motivo'} (opcional)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.counterparty}
                                            onChange={(e) => handleChange('counterparty', e.target.value)}
                                            placeholder={mainTab === 'compra' ? 'Nombre del proveedor' : mainTab === 'venta' ? 'Nombre del cliente' : 'Ej: Rotura / pérdida'}
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Forma de Pago</label>
                                        <select
                                            value={formData.paymentMethod}
                                            onChange={(e) => handleChange('paymentMethod', e.target.value)}
                                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white outline-none"
                                        >
                                            {PAYMENT_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Reference */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Referencia / Nro. Factura (opcional)</label>
                                    <input
                                        type="text"
                                        value={formData.reference}
                                        onChange={(e) => handleChange('reference', e.target.value)}
                                        placeholder="Ej: FC-A-0001-00012345"
                                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none"
                                    />
                                </div>

                                <hr className="border-slate-200" />

                                {/* Auto Journal Toggle */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-sm font-medium text-slate-900">Generar asiento contable</span>
                                        <p className="text-xs text-slate-500">Crea automáticamente el registro en Libro Diario.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.autoJournal}
                                            onChange={(e) => handleChange('autoJournal', e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                                    </label>
                                </div>
                            </form>
                        )}

                        {/* RT6 Manual Form */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'rt6' && (
                            <div className="space-y-6">
                                {/* RT6 Form Fields */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Concepto</label>
                                        <select
                                            value={rt6Data.concepto}
                                            onChange={(e) => handleRT6Change('concepto', e.target.value)}
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white outline-none"
                                        >
                                            {RUBRO_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Fecha Ajuste</label>
                                        <input
                                            type="date"
                                            value={rt6Data.date}
                                            onChange={(e) => handleRT6Change('date', e.target.value)}
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Producto</label>
                                    <select
                                        value={rt6Data.productId}
                                        onChange={(e) => handleRT6Change('productId', e.target.value)}
                                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none"
                                    >
                                        {products.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Origen a Ajustar</label>
                                    <div className="relative">
                                        <MagnifyingGlass className="absolute left-3 top-3 text-slate-400" size={16} />
                                        <select
                                            value={rt6Data.originMovementId}
                                            onChange={(e) => handleRT6Change('originMovementId', e.target.value)}
                                            className="w-full pl-9 p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none appearance-none"
                                        >
                                            <option value="">Seleccioná un movimiento...</option>
                                            {availableOriginMovements.map(mov => (
                                                <option key={mov.id} value={mov.id}>{mov.label}</option>
                                            ))}
                                        </select>
                                        <CaretDown className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={16} />
                                    </div>
                                    {availableOriginMovements.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-1">No hay compras para este producto.</p>
                                    )}
                                </div>

                                {/* Calculation Panel */}
                                {rt6Data.originMovementId && (
                                    <div className="bg-blue-50/30 rounded-xl p-4 border border-blue-100">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-bold text-blue-800">Cálculo Sugerido</h4>
                                            <span className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                                Coef: {rt6Calculations.coeficiente.toFixed(4)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Valor Origen</div>
                                                <div className="font-mono font-medium text-slate-900">
                                                    {formatCurrency(rt6Calculations.valorOrigen)}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-center text-slate-300 pt-4">
                                                <ArrowRight weight="bold" />
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Valor Homogéneo</div>
                                                <div className="font-mono font-bold text-slate-900">
                                                    {formatCurrency(rt6Calculations.valorHomogeneo)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-blue-100 flex justify-between items-center">
                                            <div className="text-sm text-blue-800 font-medium">Delta (RECPAM) a registrar</div>
                                            <div className={`font-mono font-bold text-lg ${rt6Calculations.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {rt6Calculations.delta >= 0 ? '+' : ''} {formatCurrency(rt6Calculations.delta)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Manual Override Toggle */}
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rt6Data.useManualDelta}
                                            onChange={(e) => handleRT6Change('useManualDelta', e.target.checked.toString())}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                                        <span className="ms-3 text-sm font-medium text-slate-700">Editar delta manualmente</span>
                                    </label>
                                </div>

                                {rt6Data.useManualDelta && (
                                    <div className="pl-4 border-l-2 border-slate-200">
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Delta Manual</label>
                                        <input
                                            type="text"
                                            value={rt6Data.manualDelta}
                                            onChange={(e) => handleRT6Change('manualDelta', e.target.value)}
                                            placeholder="$ 0,00"
                                            className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono outline-none"
                                        />
                                        <p className="text-xs text-slate-400 mt-1">
                                            Ingresá la diferencia exacta si el cálculo automático no te cierra.
                                        </p>
                                    </div>
                                )}

                                {/* Add to Cart Button */}
                                <div className="mt-6">
                                    <button
                                        type="button"
                                        onClick={handleAddToRT6Cart}
                                        disabled={!rt6Data.originMovementId && !rt6Data.useManualDelta}
                                        className="text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Plus weight="bold" /> Agregar al carrito de ajustes
                                    </button>
                                </div>

                                {/* RT6 Cart */}
                                {rt6Cart.length > 0 && (
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">
                                            Ajustes a aplicar ({rt6Cart.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {rt6Cart.map(item => (
                                                <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-slate-900">{item.productName}</div>
                                                        <div className="text-xs text-slate-500">
                                                            {item.concepto} • {item.originMovementLabel || 'Manual'}
                                                        </div>
                                                    </div>
                                                    <div className={`font-mono font-bold ${item.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {item.delta >= 0 ? '+' : ''}{formatCurrency(item.delta)}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFromRT6Cart(item.id)}
                                                        className="ml-2 p-1 text-slate-400 hover:text-red-600 transition-colors"
                                                    >
                                                        <Trash size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-700">Total Delta</span>
                                            <span className={`font-mono font-bold text-lg ${rt6CartTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {rt6CartTotal >= 0 ? '+' : ''}{formatCurrency(rt6CartTotal)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Generate Journal Toggle for RT6 */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-sm font-medium text-slate-900">Generar asiento contable</span>
                                        <p className="text-xs text-slate-500">Crea asiento RT6 manual en Libro Diario.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rt6Data.generateJournal}
                                            onChange={(e) => handleRT6Change('generateJournal', e.target.checked.toString())}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Diferencia Inventario (Placeholder) */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'diferencia' && (
                            <div className="space-y-6">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                                    <Info size={20} className="text-amber-600 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-amber-800">Funcionalidad en desarrollo</h4>
                                        <p className="text-xs text-amber-700 mt-1">
                                            La funcionalidad completa de Diferencia de Inventario con cálculo homogéneo se implementará en Prompt 2.
                                            Por ahora podés ver la estructura de la UI.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Producto</label>
                                    <select
                                        value={difData.productId}
                                        onChange={(e) => setDifData(prev => ({ ...prev, productId: e.target.value }))}
                                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none"
                                    >
                                        {products.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Cantidad Contada</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={difData.cantidadContada}
                                            onChange={(e) => setDifData(prev => ({ ...prev, cantidadContada: Number(e.target.value) }))}
                                            className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono text-right outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor Físico ($)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={difData.valorFisico}
                                            onChange={(e) => setDifData(prev => ({ ...prev, valorFisico: Number(e.target.value) }))}
                                            className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-mono text-right outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                {/* Preview placeholder */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-dashed border-slate-300">
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">Preview Asiento Diferencia</div>
                                    <div className="font-mono text-xs text-slate-500">
                                        <div className="flex justify-between">
                                            <span>Mercaderías (o Diferencia Inventario)</span>
                                            <span>$ —</span>
                                        </div>
                                        <div className="flex justify-between pl-4">
                                            <span>a Diferencia Inventario (o Mercaderías)</span>
                                            <span>$ —</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Preview */}
                    <div className="hidden lg:flex w-5/12 bg-slate-50 p-6 border-l border-slate-100 flex-col">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Vista Previa</h3>

                        {(mainTab === 'compra' || mainTab === 'venta' || (mainTab === 'ajuste' && ajusteSubTab === 'stock')) && (
                            <div className="sticky top-6 space-y-4">
                                {/* Result Card */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                            <Check weight="fill" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-900">Resumen del movimiento</div>
                                            <div className="text-xs text-slate-500">Impacto en contabilidad e inventario</div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm py-2 border-b border-dashed border-slate-200">
                                            <span className="text-slate-600">
                                                {formData.isDevolucion ? 'Importe devolución' : 'Subtotal (bruto)'}
                                            </span>
                                            <span className="font-mono font-medium">{formatCurrency(calculations.bruto)}</span>
                                        </div>
                                        {calculations.bonificacionAmt > 0 && (
                                            <div className="flex justify-between text-sm py-1 text-red-500">
                                                <span>− Bonificación ({formData.bonificacionPct}%)</span>
                                                <span className="font-mono">({formatCurrency(calculations.bonificacionAmt)})</span>
                                            </div>
                                        )}
                                        {mainTab !== 'ajuste' && (
                                            <div className="flex justify-between text-sm py-2 border-b border-dashed border-slate-200">
                                                <span className="text-slate-600">IVA ({formData.ivaRate}%)</span>
                                                <span className="font-mono font-medium">{formatCurrency(calculations.ivaAmount)}</span>
                                            </div>
                                        )}
                                        {calculations.gastos > 0 && (
                                            <div className="flex justify-between text-sm py-1 text-slate-600">
                                                <span>+ Gastos s/compra</span>
                                                <span className="font-mono">{formatCurrency(calculations.gastos)}</span>
                                            </div>
                                        )}
                                        {calculations.descuentoAmt > 0 && (
                                            <div className="flex justify-between text-sm py-1 text-emerald-600">
                                                <span>− Dto. financiero ({formData.descuentoFinancieroPct}%)</span>
                                                <span className="font-mono">({formatCurrency(calculations.descuentoAmt)})</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-2 border-t border-slate-200">
                                            <span className="font-semibold text-slate-900">Total</span>
                                            <span className="font-mono font-bold text-lg">{formatCurrency(calculations.total)}</span>
                                        </div>
                                        {mainTab === 'venta' && calculations.estimatedCMV > 0 && (
                                            <div className="flex justify-between text-sm pt-2 border-t border-dashed border-slate-200 text-slate-500">
                                                <span>CMV Estimado ({costMethod})</span>
                                                <span className="font-mono">{formatCurrency(calculations.estimatedCMV)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Info Box */}
                                <div className="bg-blue-50 p-3 rounded-lg flex gap-3 items-start">
                                    <Info className="text-blue-500 mt-0.5" weight="fill" />
                                    <p className="text-xs text-blue-800 leading-snug">
                                        {mainTab === 'compra' && "La compra aumenta el stock y genera un asiento de compra."}
                                        {mainTab === 'venta' && "La venta reduce el stock y registra el CMV automáticamente."}
                                        {mainTab === 'ajuste' && "El ajuste de stock modifica las cantidades sin afectar el valor por unidad."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {mainTab === 'ajuste' && ajusteSubTab === 'rt6' && (
                            <div className="sticky top-6 space-y-4">
                                {/* RT6 Preview */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                            <Check weight="fill" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-900">Resultado del ajuste</div>
                                            <div className="text-xs text-slate-500">Impacto en contabilidad e inventario</div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm py-2 border-b border-dashed border-slate-200">
                                            <span className="text-slate-600">Stock físico</span>
                                            <span className="font-medium text-slate-900">Sin cambios</span>
                                        </div>
                                        <div className="flex justify-between text-sm py-2 border-b border-dashed border-slate-200">
                                            <span className="text-slate-600">Valor Inventario</span>
                                            <span className={`font-mono font-bold ${rt6CartTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {rt6CartTotal >= 0 ? '+' : ''}{formatCurrency(rt6CartTotal)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Asiento Preview */}
                                {rt6Cart.length > 0 && rt6Data.generateJournal && (
                                    <div className="bg-slate-900 rounded-xl p-4 text-slate-300 font-mono text-xs leading-relaxed shadow-lg">
                                        <div className="text-slate-500 mb-2 font-sans font-bold text-[10px] uppercase">
                                            Previsualización del Asiento
                                        </div>
                                        {rt6CartTotal >= 0 ? (
                                            <>
                                                <div className="flex justify-between mb-1">
                                                    <span>Mercaderías (Revalúo)</span>
                                                    <span className="text-white">{Math.abs(rt6CartTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex justify-between pl-4 text-slate-400">
                                                    <span>a RECPAM</span>
                                                    <span>{Math.abs(rt6CartTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex justify-between mb-1">
                                                    <span>RECPAM</span>
                                                    <span className="text-white">{Math.abs(rt6CartTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex justify-between pl-4 text-slate-400">
                                                    <span>a Mercaderías</span>
                                                    <span>{Math.abs(rt6CartTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="mt-3 pt-2 border-t border-slate-700 text-[10px] italic text-slate-500">
                                            // Ajuste por inflación (manual) - {rt6Cart.length} item(s)
                                        </div>
                                    </div>
                                )}

                                <div className="bg-blue-50 p-3 rounded-lg flex gap-3 items-start">
                                    <Info className="text-blue-500 mt-0.5" weight="fill" />
                                    <p className="text-xs text-blue-800 leading-snug">
                                        <strong>Recordá:</strong> Esto ajusta la valuación contable. Si necesitás corregir cantidades físicas, usá la pestaña "Ajuste de Stock".
                                    </p>
                                </div>
                            </div>
                        )}

                        {mainTab === 'ajuste' && ajusteSubTab === 'diferencia' && (
                            <div className="sticky top-6">
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                    <div className="text-sm font-bold text-slate-900 mb-3">Preview</div>
                                    <div className="text-xs text-slate-500">
                                        Completá los datos para ver la previsualización del asiento de diferencia de inventario.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <footer className="bg-white border-t border-slate-100 p-4 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || (mainTab === 'ajuste' && ajusteSubTab === 'rt6' && rt6Cart.length === 0)}
                        className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-emerald-500 shadow-lg shadow-blue-500/20 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                        {isSaving ? 'Guardando...' : (
                            <>
                                <Check weight="bold" /> Confirmar {mainTab === 'ajuste' && ajusteSubTab === 'rt6' ? 'Ajustes' : 'Movimiento'}
                            </>
                        )}
                    </button>
                </footer>
            </div>

            <style>{`
                @keyframes modal-in {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                .animate-modal-in {
                    animation: modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
            `}</style>
        </div>
    )
}
