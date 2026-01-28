import { useState, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import type {
    BienesProduct,
    UnidadMedida,
    ProductCategory,
    IVARate,
} from '../../../core/inventario/types'
import { generateAutoSKU } from '../../../core/inventario/types'
import { getAllBienesSKUs } from '../../../storage'

interface ProductModalProps {
    product: BienesProduct | null // null = new product
    onSave: (product: Omit<BienesProduct, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
    onClose: () => void
}

const UNIT_OPTIONS: { value: UnidadMedida; label: string }[] = [
    { value: 'u', label: 'Unidades' },
    { value: 'kg', label: 'Kilogramos' },
    { value: 'lt', label: 'Litros' },
]

const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
    { value: 'MERCADERIA', label: 'Mercaderia' },
    { value: 'MATERIA_PRIMA', label: 'Materia Prima' },
    { value: 'PRODUCTO_TERMINADO', label: 'Producto Terminado' },
    { value: 'OTROS', label: 'Otros' },
]

const IVA_OPTIONS: { value: IVARate; label: string }[] = [
    { value: 21, label: '21%' },
    { value: 10.5, label: '10.5%' },
    { value: 0, label: 'Exento' },
]

export default function ProductModal({ product, onSave, onClose }: ProductModalProps) {
    const isEditing = !!product

    const [formData, setFormData] = useState({
        sku: '',
        name: '',
        description: '',
        unit: 'u' as UnidadMedida,
        category: 'MERCADERIA' as ProductCategory,
        reorderPoint: 0,
        ivaRate: 21 as IVARate,
        openingQty: 0,
        openingUnitCost: 0,
        openingDate: new Date().toISOString().split('T')[0],
    })

    const [existingSKUs, setExistingSKUs] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load existing SKUs for auto-generation
    useEffect(() => {
        getAllBienesSKUs().then(setExistingSKUs)
    }, [])

    // Populate form when editing
    useEffect(() => {
        if (product) {
            setFormData({
                sku: product.sku,
                name: product.name,
                description: product.description || '',
                unit: product.unit,
                category: product.category,
                reorderPoint: product.reorderPoint,
                ivaRate: product.ivaRate,
                openingQty: product.openingQty,
                openingUnitCost: product.openingUnitCost,
                openingDate: product.openingDate,
            })
        }
    }, [product])

    // Auto-generate SKU when name changes (only for new products)
    useEffect(() => {
        if (!isEditing && formData.name && !formData.sku) {
            const autoSKU = generateAutoSKU(formData.name, existingSKUs)
            setFormData(prev => ({ ...prev, sku: autoSKU }))
        }
    }, [formData.name, isEditing, existingSKUs])

    const handleChange = (field: keyof typeof formData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validation
        if (!formData.name.trim()) {
            setError('El nombre es obligatorio')
            return
        }
        if (!formData.sku.trim()) {
            setError('El SKU es obligatorio')
            return
        }

        setIsSaving(true)
        try {
            await onSave({
                ...formData,
                description: formData.description || undefined,
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al guardar')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Panel (slide from right) */}
            <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-display font-semibold text-lg">
                        {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Nombre del Producto *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder="Ej: Monitor 24 IPS Dell"
                        />
                    </div>

                    {/* SKU */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                            SKU *
                        </label>
                        <input
                            type="text"
                            value={formData.sku}
                            onChange={(e) => handleChange('sku', e.target.value.toUpperCase())}
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder="Ej: HARD-001"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            Se genera automaticamente o ingresa uno personalizado
                        </p>
                    </div>

                    {/* Category & Unit Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Categoria
                            </label>
                            <select
                                value={formData.category}
                                onChange={(e) => handleChange('category', e.target.value)}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {CATEGORY_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Unidad de Medida
                            </label>
                            <select
                                value={formData.unit}
                                onChange={(e) => handleChange('unit', e.target.value)}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {UNIT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* IVA & Reorder Point Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Alicuota IVA
                            </label>
                            <select
                                value={formData.ivaRate}
                                onChange={(e) => handleChange('ivaRate', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {IVA_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Punto de reorden (stock minimo)
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={formData.reorderPoint}
                                onChange={(e) => handleChange('reorderPoint', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-right font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Cuando tu stock baja de este valor, te avisamos que conviene reponer.
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Descripcion (opcional)
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            rows={2}
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                            placeholder="Detalles adicionales..."
                        />
                    </div>

                    {/* Opening Inventory Section */}
                    {!isEditing && (
                        <div className="border-t border-slate-200 pt-5 mt-5">
                            <h4 className="text-sm font-semibold text-slate-900 mb-3">
                                Inventario Inicial
                            </h4>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                                        Cantidad
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.openingQty}
                                        onChange={(e) => handleChange('openingQty', Number(e.target.value))}
                                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-right font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                                        Costo Unitario
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2 text-slate-400">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.openingUnitCost}
                                            onChange={(e) => handleChange('openingUnitCost', Number(e.target.value))}
                                            className="w-full pl-6 border border-slate-200 rounded-md px-3 py-2 text-sm text-right font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                                        Fecha
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.openingDate}
                                        onChange={(e) => handleChange('openingDate', e.target.value)}
                                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </form>

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
                        {isSaving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Producto'}
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
