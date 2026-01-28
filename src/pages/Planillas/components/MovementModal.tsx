import { useState, useMemo, useEffect } from 'react'
import { X, Warning } from '@phosphor-icons/react'
import type {
    BienesProduct,
    BienesMovement,
    BienesMovementType,
    CostingMethod,
    IVARate,
    ProductValuation,
} from '../../../core/inventario/types'

interface MovementModalProps {
    products: BienesProduct[]
    valuations: ProductValuation[]
    costMethod: CostingMethod
    onSave: (movement: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => Promise<void>
    onClose: () => void
    initialData?: Partial<BienesMovement>
    mode?: 'create' | 'edit'
}

const TYPE_OPTIONS: { value: BienesMovementType; label: string }[] = [
    { value: 'PURCHASE', label: 'Compra' },
    { value: 'SALE', label: 'Venta' },
    { value: 'ADJUSTMENT', label: 'Ajuste' },
]

const PAYMENT_OPTIONS = [
    'Efectivo',
    'Cuenta Corriente',
    'Transferencia',
    'Cheque',
]

export default function MovementModal({
    products,
    valuations,
    costMethod,
    onSave,
    onClose,
    initialData,
    mode = 'create',
}: MovementModalProps) {
    const isEditing = mode === 'edit'
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
    })

    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Get selected product and valuation
    const selectedProduct = useMemo(
        () => products.find((p) => p.id === formData.productId),
        [products, formData.productId]
    )

    const selectedValuation = useMemo(
        () => valuations.find((v) => v.product.id === formData.productId),
        [valuations, formData.productId]
    )

    // Apply initial data when provided (conciliacion -> prefill)
    useEffect(() => {
        if (!initialData) return
        const direction = initialData.type === 'ADJUSTMENT' && typeof initialData.quantity === 'number' && initialData.quantity < 0
            ? 'OUT'
            : 'IN'
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

    // Set IVA rate from product when product changes (skip adjustment)
    useEffect(() => {
        if (selectedProduct && formData.type !== 'ADJUSTMENT') {
            setFormData((prev) => ({
                ...prev,
                ivaRate: selectedProduct.ivaRate,
            }))
        }
    }, [selectedProduct, formData.type])

    useEffect(() => {
        if (formData.type === 'ADJUSTMENT') {
            setFormData(prev => ({ ...prev, ivaRate: 0 }))
        }
    }, [formData.type])

    // Calculate amounts
    const calculations = useMemo(() => {
        const baseAmount = formData.type === 'SALE' ? formData.unitPrice : formData.unitCost
        const estimatedCost = selectedValuation?.averageCost || 0
        const isAdjustmentOut = formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT'
        const adjustedBase = isAdjustmentOut ? estimatedCost : baseAmount
        const subtotal = formData.quantity * adjustedBase
        const ivaAmount = formData.type === 'PURCHASE' || formData.type === 'SALE'
            ? subtotal * (formData.ivaRate / 100)
            : 0
        const total = subtotal + ivaAmount

        const estimatedCMV = formData.type === 'SALE'
            ? formData.quantity * estimatedCost
            : 0

        return { subtotal, ivaAmount, total, estimatedCost, estimatedCMV }
    }, [formData, selectedValuation])

    // Stock check for sales/adjustment out
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

    const handleChange = (field: keyof typeof formData, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validation
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
            })
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

    return (
        <div className="fixed inset-0 z-50">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Panel */}
            <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-display font-semibold text-lg">
                        {isEditing ? 'Editar Movimiento' : 'Registrar Movimiento'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center gap-2">
                            <Warning size={16} weight="fill" /> {error}
                        </div>
                    )}

                    {/* Type Selector */}
                    <div className="grid grid-cols-3 gap-3 p-1 bg-slate-100 rounded-lg">
                        {TYPE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleChange('type', opt.value)}
                                className={`py-2 text-sm font-medium rounded-md transition-all ${
                                    formData.type === opt.value
                                        ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {formData.type === 'ADJUSTMENT' && (
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
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Fecha
                            </label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => handleChange('date', e.target.value)}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Metodo Costeo
                            </label>
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
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Cantidad
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.quantity}
                                onChange={(e) => handleChange('quantity', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                            {stockWarning && (
                                <p className="text-xs text-red-600 mt-1">{stockWarning}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                {formData.type === 'SALE' ? 'Precio Venta' : 'Costo Unitario'}
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={
                                        formData.type === 'SALE'
                                            ? formData.unitPrice
                                            : formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT'
                                                ? calculations.estimatedCost
                                                : formData.unitCost
                                    }
                                    onChange={(e) =>
                                        handleChange(
                                            formData.type === 'SALE' ? 'unitPrice' : 'unitCost',
                                            Number(e.target.value)
                                        )
                                    }
                                    className="w-full pl-6 border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                    disabled={formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT'}
                                />
                            </div>
                            {formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT' && (
                                <p className="text-xs text-slate-500 mt-1">
                                    Se utiliza el costo estimado ({costMethod}) al momento del ajuste.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Counterparty & Payment */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                {formData.type === 'PURCHASE'
                                    ? 'Proveedor'
                                    : formData.type === 'SALE'
                                        ? 'Cliente'
                                        : 'Motivo'} (opcional)
                            </label>
                            <input
                                type="text"
                                value={formData.counterparty}
                                onChange={(e) => handleChange('counterparty', e.target.value)}
                                placeholder={formData.type === 'PURCHASE'
                                    ? 'Nombre del proveedor'
                                    : formData.type === 'SALE'
                                        ? 'Nombre del cliente'
                                        : 'Ej: Rotura / perdida / ajuste'}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Forma de Pago
                            </label>
                            <select
                                value={formData.paymentMethod}
                                onChange={(e) => handleChange('paymentMethod', e.target.value)}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {PAYMENT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Reference */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Referencia / Nro. Factura (opcional)
                        </label>
                        <input
                            type="text"
                            value={formData.reference}
                            onChange={(e) => handleChange('reference', e.target.value)}
                            placeholder="Ej: FC-A-0001-00012345"
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>

                    <hr className="border-slate-200" />

                    {/* Auto Journal Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-sm font-medium text-slate-900">
                                Generar asiento contable
                            </span>
                            <p className="text-xs text-slate-500">
                                Crea automaticamente el registro en Libro Diario.
                            </p>
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

                    {/* Preview Box */}
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Resumen
                            </span>
                            <span className="text-xs font-mono text-slate-500">{formData.date}</span>
                        </div>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-600">Subtotal</span>
                                <span className="font-mono font-medium">
                                    {formatCurrency(calculations.subtotal)}
                                </span>
                            </div>
                            {formData.type !== 'ADJUSTMENT' && (
                                <div className="flex justify-between">
                                    <span className="text-slate-600">IVA ({formData.ivaRate}%)</span>
                                    <span className="font-mono font-medium">
                                        {formatCurrency(calculations.ivaAmount)}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between pt-2 border-t border-slate-200">
                                <span className="font-semibold text-slate-900">Total</span>
                                <span className="font-mono font-bold text-lg">
                                    {formatCurrency(calculations.total)}
                                </span>
                            </div>

                            {formData.type === 'SALE' && calculations.estimatedCMV > 0 && (
                                <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-500">
                                    <span>CMV Estimado ({costMethod})</span>
                                    <span className="font-mono">
                                        {formatCurrency(calculations.estimatedCMV)}
                                    </span>
                                </div>
                            )}
                            {formData.type === 'ADJUSTMENT' && formData.adjustmentDirection === 'OUT' && (
                                <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-500">
                                    <span>Costo estimado ({costMethod})</span>
                                    <span className="font-mono">
                                        {formatCurrency(calculations.subtotal)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-md font-medium shadow-lg shadow-blue-500/20 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Confirmar'}
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes slide-in-right {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.3s ease-out;
                }
            `}</style>
        </div>
    )
}
