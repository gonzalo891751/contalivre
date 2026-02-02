/**
 * MovementModalV3 - Registrar Movimiento
 *
 * Basado en el prototipo: docs/prototypes/modalmovimientos2.html
 *
 * - Layout 2 columnas: form izquierda scrolleable + vista previa derecha sticky
 * - Tab Compra: formulario con bonif, desc financiero, gastos con IVA y capitalizar
 * - Tab Venta: formulario "gemelo" sin gastos
 * - Tab Ajuste: sub-tabs (Devoluciones, Stock Fisico, Diferencia de Cambio)
 * - Devoluciones centralizadas en Ajuste
 * - Pago mixto con AccountSearchSelect
 */

import { useState, useMemo, useEffect } from 'react'
import {
    X,
    Warning,
    Check,
    Plus,
    MagnifyingGlass,
    Info,
    Trash,
    ShoppingCart,
    Tag,
    ArrowsCounterClockwise,
    Wallet,
    Receipt,
    Percent,
    Files,
    ArrowDownLeft,
    ArrowUpRight,
    Sliders,
    ArrowUUpLeft,
    Package,
    Robot,
    HandCoins,
    ArrowsLeftRight,
    CalendarBlank,
    TrendUp,
} from '@phosphor-icons/react'
import type {
    BienesProduct,
    BienesMovement,
    BienesMovementType,
    CostingMethod,
    IVARate,
    ProductValuation,
    TaxLine,
    TaxLineKind,
    TaxType,
    TaxCalcMode,
    TaxCalcBase,
} from '../../../core/inventario/types'

/** Round to 2 decimal places, handling floating point errors */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
import type { Account } from '../../../core/models'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'

type MainTab = 'compra' | 'venta' | 'ajuste'
type AjusteSubTab = 'devoluciones' | 'stock' | 'rt6' | 'bonif_desc'
type DevolucionTipo = 'DEVOLUCION_COMPRA' | 'DEVOLUCION_VENTA'

interface GastoAccesorio {
    id: string
    concepto: string
    monto: number
    gravadoIVA: boolean
    capitalizar: boolean
}

interface PaymentSplit {
    id: string
    accountId: string
    amount: number
}

interface MovementModalV3Props {
    products: BienesProduct[]
    valuations: ProductValuation[]
    costMethod: CostingMethod
    onSave: (movement: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => Promise<void>
    onClose: () => void
    initialData?: Partial<BienesMovement>
    mode?: 'create' | 'edit'
    accounts?: Account[]
    periodId: string
    movements?: BienesMovement[]
}

const TAX_RATE = 0.21

export default function MovementModalV3({
    products,
    valuations,
    costMethod,
    onSave,
    onClose,
    initialData,
    mode = 'create',
    accounts,
    periodId,
    movements,
}: MovementModalV3Props) {
    const isEditing = mode === 'edit'

    // Main tab state
    const [mainTab, setMainTab] = useState<MainTab>('compra')
    const [ajusteSubTab, setAjusteSubTab] = useState<AjusteSubTab>('devoluciones')

    // Form data for Compra/Venta
    const [formData, setFormData] = useState({
        productId: products[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        quantity: 1,
        unitCost: 0,
        unitPrice: 0,
        ivaRate: 21 as IVARate,
        counterparty: '',
        notes: '',
        reference: '',
        referenceType: 'FC A',
        autoJournal: true,
        // Condiciones comerciales
        bonificacionPct: 0,
        descuentoFinancieroPct: 0,
        // Solo Gasto mode
        isSoloGasto: false,
        sourceMovementId: '',
    })

    // Gastos accesorios (solo compra)
    const [gastos, setGastos] = useState<GastoAccesorio[]>([
        { id: 'gasto-1', concepto: '', monto: 0, gravadoIVA: true, capitalizar: true }
    ])

    // Payment splits
    const [splits, setSplits] = useState<PaymentSplit[]>([
        { id: 'split-1', accountId: '', amount: 0 }
    ])

    // Percepciones / Impuestos adicionales
    const [taxes, setTaxes] = useState<TaxLine[]>([])
    const [discriminarIVA, setDiscriminarIVA] = useState(true)

    // Quick-add retención panel state
    const [showRetencionPanel, setShowRetencionPanel] = useState(false)
    const [retencionForm, setRetencionForm] = useState({
        calcMode: 'PERCENT' as TaxCalcMode,
        rate: 100,
        base: 'IVA' as TaxCalcBase,
        amount: 0,
        taxType: 'IVA' as TaxType,
    })

    // Ajuste - Stock Fisico
    const [stockAjuste, setStockAjuste] = useState({
        productId: products[0]?.id || '',
        direction: 'IN' as 'IN' | 'OUT',
        quantity: 0,
        unitCost: 0,
        notes: '',
    })

    // Ajuste - Devoluciones
    const [devolucion, setDevolucion] = useState({
        tipo: 'DEVOLUCION_COMPRA' as DevolucionTipo,
        productId: products[0]?.id || '',
        originalMovementId: '',
        cantidadDevolver: 1,
        searchTerm: '',
    })
    const [devolucionSplits, setDevolucionSplits] = useState<PaymentSplit[]>([
        { id: 'dev-split-1', accountId: '', amount: 0 }
    ])

    // Ajuste - RT6 (Ajuste por Inflacion)
    const [rt6, setRt6] = useState({
        productId: products[0]?.id || '',
        originMovementId: '',
        rt6Period: '',
        valueDelta: 0,
        notes: '',
    })

    const [postAdjust, setPostAdjust] = useState({
        applyOn: 'PURCHASE' as 'PURCHASE' | 'SALE',
        productId: products[0]?.id || '',
        originalMovementId: '',
        kind: 'BONUS' as 'BONUS' | 'DISCOUNT',
        inputMode: 'PCT' as 'PCT' | 'AMOUNT',
        value: 0,
        notes: '',
    })
    const [postAdjustSplits, setPostAdjustSplits] = useState<PaymentSplit[]>([
        { id: 'post-split-1', accountId: '', amount: 0 }
    ])

    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Initialize from initialData
    useEffect(() => {
        if (!initialData) return

        let tab: MainTab = 'compra'
        if (initialData.type === 'SALE') tab = 'venta'
        else if (initialData.type === 'ADJUSTMENT' || initialData.type === 'VALUE_ADJUSTMENT') tab = 'ajuste'

        setMainTab(tab)

        if (initialData.paymentSplits && initialData.paymentSplits.length > 0) {
            setSplits(initialData.paymentSplits.map((s, i) => ({
                id: `split-${i}`,
                accountId: s.accountId,
                amount: s.amount
            })))
        }

        // Initialize taxes and discriminarIVA from existing movement
        if (initialData.taxes && initialData.taxes.length > 0) {
            setTaxes(initialData.taxes)
        }
        if (typeof initialData.discriminarIVA === 'boolean') {
            setDiscriminarIVA(initialData.discriminarIVA)
        }

        setFormData(prev => ({
            ...prev,
            productId: initialData.productId || prev.productId || products[0]?.id || '',
            date: initialData.date || prev.date,
            quantity: typeof initialData.quantity === 'number' ? Math.abs(initialData.quantity) : prev.quantity,
            unitCost: initialData.unitCost ?? prev.unitCost,
            unitPrice: initialData.unitPrice ?? prev.unitPrice,
            ivaRate: initialData.ivaRate ?? prev.ivaRate,
            counterparty: initialData.counterparty || prev.counterparty,
            notes: initialData.notes || prev.notes,
            reference: initialData.reference || prev.reference,
            autoJournal: initialData.autoJournal ?? prev.autoJournal,
            bonificacionPct: initialData.bonificacionPct ?? 0,
            descuentoFinancieroPct: initialData.descuentoFinancieroPct ?? 0,
            sourceMovementId: initialData.sourceMovementId || '',
        }))
    }, [initialData, products])

    // Product & valuation
    const _selectedProduct = useMemo(
        () => products.find((p) => p.id === formData.productId),
        [products, formData.productId]
    )
    void _selectedProduct // reserved for future use
    const selectedValuation = useMemo(
        () => valuations.find((v) => v.product.id === formData.productId),
        [valuations, formData.productId]
    )

    // Calculations for Compra/Venta
    const calculations = useMemo(() => {
        const baseAmount = mainTab === 'venta' ? formData.unitPrice : formData.unitCost
        const qty = formData.isSoloGasto ? 0 : formData.quantity
        const subtotalItems = qty * baseAmount

        // Bonificacion reduces base imponible
        const bonifAmount = subtotalItems * (formData.bonificacionPct / 100)
        const netoAfterBonif = subtotalItems - bonifAmount

        // Gastos sobre compra (solo en compra y si no es solo gasto con capitalizar=false)
        let gastosNetos = 0
        let gastosIVA = 0
        if (mainTab === 'compra') {
            gastos.forEach(g => {
                if (g.monto > 0) {
                    gastosNetos += g.monto
                    if (g.gravadoIVA) {
                        gastosIVA += g.monto * TAX_RATE
                    }
                }
            })
        }

        // Base imponible = neto despues de bonif + gastos netos
        const baseImponible = netoAfterBonif + gastosNetos

        // IVA sobre items (si no es solo gasto sin items)
        const ivaItems = netoAfterBonif * (formData.ivaRate / 100)
        const ivaTotal = ivaItems + gastosIVA

        // Subtotal comprobante = base imponible + IVA
        const subtotalComprobante = baseImponible + ivaTotal

        // Descuento financiero (no afecta IVA, reduce total a pagar)
        const descuentoFinAmount = subtotalComprobante * (formData.descuentoFinancieroPct / 100)

        // Percepciones / impuestos adicionales (no afectan base ni IVA, solo suman al total)
        // Calculate each tax amount based on its calcMode (PERCENT uses baseImponible or ivaTotal)
        const taxesWithAmounts = taxes.map(t => {
            if (t.calcMode === 'PERCENT' && t.rate !== undefined) {
                const baseValue = t.base === 'IVA' ? ivaTotal : baseImponible
                return { ...t, calculatedAmount: round2(baseValue * (t.rate / 100)) }
            }
            return { ...t, calculatedAmount: t.amount || 0 }
        })
        const taxesTotal = taxesWithAmounts.reduce((sum, t) => sum + t.calculatedAmount, 0)

        // Total final = subtotal comprobante - descuento + percepciones
        const totalFinal = subtotalComprobante - descuentoFinAmount + taxesTotal

        // CMV estimado (para venta)
        const estimatedCost = selectedValuation?.averageCost || 0
        const estimatedCMV = mainTab === 'venta' ? qty * estimatedCost : 0

        return {
            subtotalItems,
            bonifAmount,
            netoAfterBonif,
            gastosNetos,
            gastosIVA,
            baseImponible,
            ivaItems,
            ivaTotal,
            subtotalComprobante,
            descuentoFinAmount,
            taxesTotal,
            taxesWithAmounts,  // Include calculated amounts for each tax
            totalFinal,
            estimatedCost,
            estimatedCMV,
        }
    }, [formData, mainTab, gastos, selectedValuation, taxes])

    // Payment validation
    const splitTotals = useMemo(() => {
        const assigned = splits.reduce((sum, s) => sum + s.amount, 0)
        const remaining = calculations.totalFinal - assigned
        const percentage = calculations.totalFinal > 0 ? (assigned / calculations.totalFinal) * 100 : 0
        return { assigned, remaining, percentage }
    }, [splits, calculations.totalFinal])

    // Available movements for devoluciones
    const availableMovementsForReturn = useMemo(() => {
        if (!movements) return []
        const tipo = devolucion.tipo
        const filterType = tipo === 'DEVOLUCION_COMPRA' ? 'PURCHASE' : 'SALE'

        return movements
            .filter(m =>
                m.productId === devolucion.productId &&
                m.type === filterType &&
                !m.isDevolucion &&
                m.quantity > 0
            )
            .map(m => ({
                id: m.id,
                label: `${m.date} - ${m.reference || m.id.slice(0, 8)} - ${m.counterparty || 'Sin tercero'} - Qty: ${m.quantity}`,
                quantity: m.quantity,
                unitCost: m.unitCost || 0,
                unitPrice: m.unitPrice || 0,
                ivaRate: m.ivaRate,
                total: m.total,
            }))
    }, [movements, devolucion.productId, devolucion.tipo])

    const availableMovementsForPostAdjust = useMemo(() => {
        if (!movements) return []
        const filterType = postAdjust.applyOn === 'PURCHASE' ? 'PURCHASE' : 'SALE'
        return movements
            .filter(m =>
                m.productId === postAdjust.productId &&
                m.type === filterType &&
                !m.isDevolucion &&
                m.quantity > 0
            )
            .map(m => ({
                id: m.id,
                label: `${m.date} - ${m.reference || m.id.slice(0, 8)} - Qty: ${m.quantity}`,
                subtotal: m.subtotal,
                ivaRate: m.ivaRate,
                counterparty: m.counterparty,
                reference: m.reference,
            }))
    }, [movements, postAdjust.productId, postAdjust.applyOn])

    const availablePurchasesForAssociation = useMemo(() => {
        if (!movements) return []
        const layerQtyByMovement = new Map<string, number>()
        selectedValuation?.layers.forEach(layer => {
            layerQtyByMovement.set(layer.movementId, (layerQtyByMovement.get(layer.movementId) || 0) + layer.quantity)
        })
        return movements
            .filter(m =>
                m.productId === formData.productId &&
                m.type === 'PURCHASE' &&
                !m.isDevolucion &&
                m.quantity > 0
            )
            .filter(m => (layerQtyByMovement.get(m.id) || 0) > 0)
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
            .map(m => {
                const remaining = layerQtyByMovement.get(m.id) || 0
                return {
                    id: m.id,
                    label: `${m.date} - ${m.reference || m.id.slice(0, 8)} - Qty: ${m.quantity} (Rem: ${remaining})`,
                }
            })
    }, [movements, formData.productId, selectedValuation])

    // Selected original movement for return
    const selectedOriginalMovement = useMemo(() => {
        return availableMovementsForReturn.find(m => m.id === devolucion.originalMovementId)
    }, [availableMovementsForReturn, devolucion.originalMovementId])

    const selectedPostMovement = useMemo(() => {
        return availableMovementsForPostAdjust.find(m => m.id === postAdjust.originalMovementId)
    }, [availableMovementsForPostAdjust, postAdjust.originalMovementId])

    useEffect(() => {
        if (!formData.isSoloGasto || !formData.sourceMovementId) return
        const exists = availablePurchasesForAssociation.some(m => m.id === formData.sourceMovementId)
        if (!exists) {
            setFormData(prev => ({ ...prev, sourceMovementId: '' }))
        }
    }, [formData.isSoloGasto, formData.sourceMovementId, availablePurchasesForAssociation])

    useEffect(() => {
        if (!postAdjust.originalMovementId) return
        const exists = availableMovementsForPostAdjust.some(m => m.id === postAdjust.originalMovementId)
        if (!exists) {
            setPostAdjust(prev => ({ ...prev, originalMovementId: '' }))
        }
    }, [postAdjust.originalMovementId, availableMovementsForPostAdjust])

    useEffect(() => {
        if (!accounts || postAdjustSplits.length === 0) return
        if (postAdjustSplits[0].accountId) return
        const targetCode = postAdjust.applyOn === 'PURCHASE' ? '2.1.01.01' : '1.1.02.01'
        const acc = accounts.find(a => a.code === targetCode)
        if (!acc) return
        setPostAdjustSplits(prev => prev.map((s, i) => (i === 0 ? { ...s, accountId: acc.id } : s)))
    }, [accounts, postAdjust.applyOn, postAdjustSplits])

    // Return calculations
    const devolucionCalculations = useMemo(() => {
        if (!selectedOriginalMovement) {
            return { unitValue: 0, subtotal: 0, iva: 0, total: 0 }
        }

        const isCompra = devolucion.tipo === 'DEVOLUCION_COMPRA'
        const unitValue = isCompra
            ? selectedOriginalMovement.unitCost
            : selectedOriginalMovement.unitPrice
        const subtotal = devolucion.cantidadDevolver * unitValue
        const iva = subtotal * (selectedOriginalMovement.ivaRate / 100)
        const total = subtotal + iva

        return { unitValue, subtotal, iva, total }
    }, [selectedOriginalMovement, devolucion])

    const postAdjustCalculations = useMemo(() => {
        const base = selectedPostMovement?.subtotal || 0
        const neto = postAdjust.inputMode === 'PCT'
            ? base * (postAdjust.value / 100)
            : postAdjust.value
        const isBonus = postAdjust.kind === 'BONUS'
        const ivaRate = isBonus ? (selectedPostMovement?.ivaRate || 21) : 0
        const iva = isBonus ? neto * (ivaRate / 100) : 0
        const total = neto + iva
        return { base, neto, ivaRate, iva, total }
    }, [postAdjust, selectedPostMovement])

    const postAdjustSplitTotals = useMemo(() => {
        const assigned = postAdjustSplits.reduce((sum, s) => sum + s.amount, 0)
        const remaining = postAdjustCalculations.total - assigned
        return { assigned, remaining }
    }, [postAdjustSplits, postAdjustCalculations.total])

    // Available movements for RT6 adjustment
    const availableMovementsForRT6 = useMemo(() => {
        if (!movements) return []
        return movements
            .filter(m =>
                m.productId === rt6.productId &&
                (m.type === 'PURCHASE' || m.type === 'ADJUSTMENT' || m.type === 'VALUE_ADJUSTMENT') &&
                m.quantity >= 0
            )
            .map(m => ({
                id: m.id,
                label: `${m.date} - ${m.type} - ${m.reference || m.id.slice(0, 8)} - Qty: ${m.quantity} @ ${m.unitCost || 0}`,
                unitCost: m.unitCost || 0,
                quantity: m.quantity,
            }))
    }, [movements, rt6.productId])

    // Handlers
    const handleChange = (field: keyof typeof formData, value: string | number | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError(null)
    }

    const handleAddGasto = () => {
        setGastos(prev => [
            ...prev,
            { id: `gasto-${Date.now()}`, concepto: '', monto: 0, gravadoIVA: true, capitalizar: true }
        ])
    }

    const handleRemoveGasto = (id: string) => {
        setGastos(prev => prev.filter(g => g.id !== id))
    }

    const handleGastoChange = (id: string, field: keyof GastoAccesorio, value: string | number | boolean) => {
        setGastos(prev => prev.map(g => {
            if (g.id !== id) return g
            return { ...g, [field]: value }
        }))
    }

    const handleAddSplit = () => {
        setSplits(prev => [
            ...prev,
            { id: `split-${Date.now()}`, accountId: '', amount: 0 }
        ])
    }

    const handleRemoveSplit = (id: string) => {
        setSplits(prev => prev.filter(s => s.id !== id))
    }

    const handleSplitChange = (id: string, field: 'accountId' | 'amount', value: string | number) => {
        setSplits(prev => prev.map(s => {
            if (s.id !== id) return s
            return { ...s, [field]: value }
        }))
    }

    const handleAutoFillSplit = () => {
        const zeroSplit = splits.find(s => s.amount === 0)
        if (zeroSplit) {
            handleSplitChange(zeroSplit.id, 'amount', splitTotals.remaining)
        } else {
            setSplits(prev => [
                ...prev,
                { id: `split-${Date.now()}`, accountId: '', amount: splitTotals.remaining }
            ])
        }
    }

    // Tax/Perception handlers
    const handleAddTax = () => {
        setTaxes(prev => [
            ...prev,
            {
                id: `tax-${Date.now()}`,
                kind: 'PERCEPCION' as TaxLineKind,
                taxType: 'IIBB' as TaxType,
                amount: 0,
                calcMode: 'PERCENT' as TaxCalcMode,
                rate: 3,
                base: 'NETO' as TaxCalcBase,
            }
        ])
    }

    const handleRemoveTax = (id: string) => {
        setTaxes(prev => prev.filter(t => t.id !== id))
    }

    const handleTaxChange = (id: string, field: keyof TaxLine, value: string | number) => {
        setTaxes(prev => prev.map(t => {
            if (t.id !== id) return t
            return { ...t, [field]: value }
        }))
    }

    // Quick-add retención panel handlers
    const handleOpenRetencionPanel = () => {
        // Reset form with defaults
        setRetencionForm({
            calcMode: 'PERCENT',
            rate: 100,
            base: 'IVA',
            amount: 0,
            taxType: 'IVA',
        })
        setShowRetencionPanel(true)
    }

    const handleApplyRetencion = () => {
        // Calculate amount based on mode
        let finalAmount: number
        if (retencionForm.calcMode === 'PERCENT') {
            const baseValue = retencionForm.base === 'IVA' ? calculations.ivaTotal : calculations.baseImponible
            finalAmount = round2(baseValue * (retencionForm.rate / 100))
        } else {
            finalAmount = retencionForm.amount
        }

        if (finalAmount <= 0) {
            setShowRetencionPanel(false)
            return
        }

        // Compra: retención practicada → Pasivo (2.1.03.03 Retenciones a depositar)
        // Venta: retención sufrida → Activo (1.1.03.07 Retenciones IVA de terceros)
        const targetCode = mainTab === 'compra' ? '2.1.03.03' : '1.1.03.07'
        const acc = accounts?.find(a => a.code === targetCode)

        const newSplit: PaymentSplit = {
            id: `split-ret-${Date.now()}`,
            accountId: acc?.id || '',
            amount: finalAmount,
        }
        setSplits(prev => [...prev, newSplit])
        setShowRetencionPanel(false)
    }

    // Calculated retention amount for display
    const retencionCalculatedAmount = useMemo(() => {
        if (retencionForm.calcMode !== 'PERCENT') return retencionForm.amount
        const baseValue = retencionForm.base === 'IVA' ? calculations.ivaTotal : calculations.baseImponible
        return round2(baseValue * (retencionForm.rate / 100))
    }, [retencionForm, calculations.ivaTotal, calculations.baseImponible])

    // Devolucion handlers
    const handleAddDevolucionSplit = () => {
        setDevolucionSplits(prev => [
            ...prev,
            { id: `dev-split-${Date.now()}`, accountId: '', amount: 0 }
        ])
    }

    const handleRemoveDevolucionSplit = (id: string) => {
        setDevolucionSplits(prev => prev.filter(s => s.id !== id))
    }

    const handleDevolucionSplitChange = (id: string, field: 'accountId' | 'amount', value: string | number) => {
        setDevolucionSplits(prev => prev.map(s => {
            if (s.id !== id) return s
            return { ...s, [field]: value }
        }))
    }

    const handleAddPostSplit = () => {
        setPostAdjustSplits(prev => [
            ...prev,
            { id: `post-split-${Date.now()}`, accountId: '', amount: 0 }
        ])
    }

    const handleRemovePostSplit = (id: string) => {
        setPostAdjustSplits(prev => prev.filter(s => s.id !== id))
    }

    const handlePostSplitChange = (id: string, field: 'accountId' | 'amount', value: string | number) => {
        setPostAdjustSplits(prev => prev.map(s => {
            if (s.id !== id) return s
            return { ...s, [field]: value }
        }))
    }

    const handleAutoFillPostSplit = () => {
        const zeroSplit = postAdjustSplits.find(s => s.amount === 0)
        if (zeroSplit) {
            handlePostSplitChange(zeroSplit.id, 'amount', postAdjustSplitTotals.remaining)
        } else {
            setPostAdjustSplits(prev => [
                ...prev,
                { id: `post-split-${Date.now()}`, accountId: '', amount: postAdjustSplitTotals.remaining }
            ])
        }
    }

    const devolucionSplitTotals = useMemo(() => {
        const assigned = devolucionSplits.reduce((sum, s) => sum + s.amount, 0)
        const remaining = devolucionCalculations.total - assigned
        return { assigned, remaining }
    }, [devolucionSplits, devolucionCalculations.total])

    // Format currency
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(value)
    }

    // Handle Submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Ajuste - Devoluciones
        if (mainTab === 'ajuste' && ajusteSubTab === 'devoluciones') {
            if (!devolucion.originalMovementId) {
                setError('Selecciona un movimiento original para devolver')
                return
            }
            if (devolucion.cantidadDevolver <= 0) {
                setError('La cantidad a devolver debe ser mayor a 0')
                return
            }
            if (selectedOriginalMovement && devolucion.cantidadDevolver > selectedOriginalMovement.quantity) {
                setError(`La cantidad a devolver no puede ser mayor a ${selectedOriginalMovement.quantity}`)
                return
            }

            const invalidSplit = devolucionSplits.find(s => !s.accountId || s.amount <= 0)
            if (invalidSplit) {
                setError('Completa todas las cuentas de contrapartida con importe mayor a 0')
                return
            }
            if (Math.abs(devolucionSplitTotals.remaining) > 1) {
                setError(`El total asignado no coincide. Diferencia: ${formatCurrency(devolucionSplitTotals.remaining)}`)
                return
            }

            setIsSaving(true)
            try {
                const isCompra = devolucion.tipo === 'DEVOLUCION_COMPRA'
                const qty = isCompra ? -devolucion.cantidadDevolver : devolucion.cantidadDevolver
                await onSave({
                    type: isCompra ? 'PURCHASE' : 'SALE',
                    productId: devolucion.productId,
                    date: formData.date,
                    quantity: qty,
                    periodId,
                    unitCost: isCompra ? devolucionCalculations.unitValue : undefined,
                    unitPrice: !isCompra ? devolucionCalculations.unitValue : undefined,
                    ivaRate: selectedOriginalMovement?.ivaRate || 21,
                    ivaAmount: devolucionCalculations.iva,
                    subtotal: devolucionCalculations.subtotal,
                    total: devolucionCalculations.total,
                    costMethod,
                    counterparty: formData.counterparty || undefined,
                    paymentMethod: 'MIXTO',
                    paymentSplits: devolucionSplits.map(s => ({ accountId: s.accountId, amount: s.amount, method: 'DEVOLUCION' })),
                    notes: `Devolucion de ${isCompra ? 'compra' : 'venta'} - Mov. original: ${devolucion.originalMovementId}`,
                    reference: formData.reference || undefined,
                    autoJournal: formData.autoJournal,
                    isDevolucion: true,
                    sourceMovementId: devolucion.originalMovementId,
                })
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar devolucion')
                setIsSaving(false)
            }
            return
        }

        // Ajuste - Bonif/Descuentos post
        if (mainTab === 'ajuste' && ajusteSubTab === 'bonif_desc') {
            if (!postAdjust.originalMovementId) {
                setError('Selecciona un movimiento original para ajustar')
                return
            }
            if (postAdjust.value <= 0) {
                setError('El monto o porcentaje debe ser mayor a 0')
                return
            }

            const invalidSplit = postAdjustSplits.find(s => !s.accountId || s.amount <= 0)
            if (invalidSplit) {
                setError('Completa todas las cuentas de contrapartida con importe mayor a 0')
                return
            }
            if (Math.abs(postAdjustSplitTotals.remaining) > 1) {
                setError(`El total asignado no coincide. Diferencia: ${formatCurrency(postAdjustSplitTotals.remaining)}`)
                return
            }
            if (postAdjustCalculations.neto <= 0) {
                setError('El importe neto del ajuste debe ser mayor a 0')
                return
            }

            setIsSaving(true)
            try {
                const isPurchase = postAdjust.applyOn === 'PURCHASE'
                const adjustmentKind = isPurchase
                    ? (postAdjust.kind === 'BONUS' ? 'BONUS_PURCHASE' : 'DISCOUNT_PURCHASE')
                    : (postAdjust.kind === 'BONUS' ? 'BONUS_SALE' : 'DISCOUNT_SALE')
                const counterparty = selectedPostMovement?.counterparty || formData.counterparty || undefined
                await onSave({
                    type: 'VALUE_ADJUSTMENT',
                    adjustmentKind,
                    productId: postAdjust.productId,
                    date: formData.date,
                    quantity: 0,
                    periodId,
                    unitCost: 0,
                    unitPrice: 0,
                    ivaRate: postAdjustCalculations.ivaRate as IVARate,
                    ivaAmount: postAdjustCalculations.iva,
                    subtotal: postAdjustCalculations.neto,
                    total: postAdjustCalculations.total,
                    costMethod,
                    counterparty,
                    paymentMethod: 'MIXTO',
                    paymentSplits: postAdjustSplits.map(s => ({ accountId: s.accountId, amount: s.amount, method: 'AJUSTE' })),
                    notes: postAdjust.notes || undefined,
                    reference: selectedPostMovement?.reference || formData.reference || undefined,
                    autoJournal: formData.autoJournal,
                    sourceMovementId: postAdjust.originalMovementId,
                })
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar ajuste')
                setIsSaving(false)
            }
            return
        }

        // Ajuste - Stock Fisico
        if (mainTab === 'ajuste' && ajusteSubTab === 'stock') {
            if (stockAjuste.quantity <= 0) {
                setError('La cantidad debe ser mayor a 0')
                return
            }
            if (stockAjuste.direction === 'IN' && stockAjuste.unitCost <= 0) {
                setError('El costo unitario debe ser mayor a 0 para entrada')
                return
            }

            setIsSaving(true)
            try {
                const qty = stockAjuste.direction === 'OUT' ? -stockAjuste.quantity : stockAjuste.quantity
                const val = valuations.find(v => v.product.id === stockAjuste.productId)
                const cost = stockAjuste.direction === 'IN' ? stockAjuste.unitCost : (val?.averageCost || 0)

                await onSave({
                    type: 'ADJUSTMENT',
                    productId: stockAjuste.productId,
                    date: formData.date,
                    quantity: qty,
                    periodId,
                    unitCost: cost,
                    ivaRate: 0,
                    ivaAmount: 0,
                    subtotal: Math.abs(qty) * cost,
                    total: Math.abs(qty) * cost,
                    costMethod,
                    notes: stockAjuste.notes || undefined,
                    autoJournal: formData.autoJournal,
                })
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar ajuste')
                setIsSaving(false)
            }
            return
        }

        // Ajuste - RT6 (Inflacion)
        if (mainTab === 'ajuste' && ajusteSubTab === 'rt6') {
            if (!rt6.originMovementId) {
                setError('Selecciona un movimiento de origen para aplicar el ajuste')
                return
            }
            if (rt6.valueDelta === 0) {
                setError('El delta de valor debe ser distinto de 0')
                return
            }
            if (!rt6.rt6Period.trim()) {
                setError('Indica el periodo RT6')
                return
            }

            setIsSaving(true)
            try {
                await onSave({
                    type: 'VALUE_ADJUSTMENT',
                    adjustmentKind: 'RT6',
                    productId: rt6.productId,
                    date: formData.date,
                    quantity: 0, // RT6 no modifica cantidad
                    periodId,
                    unitCost: 0,
                    ivaRate: 0,
                    ivaAmount: 0,
                    subtotal: Math.abs(rt6.valueDelta),
                    total: Math.abs(rt6.valueDelta),
                    costMethod,
                    valueDelta: rt6.valueDelta,
                    rt6Period: rt6.rt6Period,
                    rt6SourceEntryId: rt6.originMovementId,
                    notes: rt6.notes || `Ajuste RT6 - Periodo: ${rt6.rt6Period}`,
                    autoJournal: formData.autoJournal,
                })
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar ajuste RT6')
                setIsSaving(false)
            }
            return
        }

        // Compra / Venta standard
        if (!formData.productId) {
            setError('Selecciona un producto')
            return
        }
        if (!formData.isSoloGasto && formData.quantity <= 0) {
            setError('La cantidad debe ser mayor a 0')
            return
        }
        if (mainTab === 'compra' && !formData.isSoloGasto && formData.unitCost <= 0) {
            setError('El costo unitario debe ser mayor a 0')
            return
        }
        if (mainTab === 'venta' && formData.unitPrice <= 0) {
            setError('El precio de venta debe ser mayor a 0')
            return
        }

        // Validate payment splits
        const validSplits = splits.filter(s => s.accountId && s.amount > 0)
        if (validSplits.length === 0) {
            setError('Agrega al menos una cuenta de pago/cobro')
            return
        }
        if (Math.abs(splitTotals.remaining) > 1) {
            setError(`El total asignado no coincide. Diferencia: ${formatCurrency(splitTotals.remaining)}`)
            return
        }

        // Solo Gasto validation
        if (formData.isSoloGasto) {
            const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0)
            if (totalGastos <= 0) {
                setError('Agrega al menos un gasto con monto mayor a 0')
                return
            }
        }

        // Hardening: type coherence checks
        if (mainTab === 'venta' && formData.isSoloGasto) {
            setError('Solo gasto no aplica en ventas')
            return
        }

        setIsSaving(true)
        try {
            // Calculate gastos totals for capitalizable vs expense
            let gastosCapitalizables = 0
            let gastosNoCap = 0
            gastos.forEach(g => {
                if (g.capitalizar) {
                    gastosCapitalizables += g.monto
                } else {
                    gastosNoCap += g.monto
                }
            })

            const isSoloGastoCap = formData.isSoloGasto && gastosCapitalizables > 0
            const movementType: BienesMovementType = isSoloGastoCap
                ? 'VALUE_ADJUSTMENT'
                : formData.isSoloGasto
                    ? 'PURCHASE'
                    : (mainTab === 'compra' ? 'PURCHASE' : 'SALE')

            // Build taxes with final calculated amounts (for PERCENT mode, amount is computed; for AMOUNT mode, use raw)
            const finalTaxes: TaxLine[] = calculations.taxesWithAmounts
                .filter(t => t.calculatedAmount > 0)
                .map(t => ({
                    id: t.id,
                    kind: t.kind,
                    taxType: t.taxType,
                    amount: t.calculatedAmount,  // Always store the final calculated amount
                    accountId: t.accountId,
                    calcMode: t.calcMode,
                    rate: t.rate,
                    base: t.base,
                }))

            await onSave({
                type: movementType,
                productId: formData.productId,
                date: formData.date,
                quantity: formData.isSoloGasto ? 0 : formData.quantity,
                periodId,
                unitCost: mainTab === 'compra' ? formData.unitCost : undefined,
                unitPrice: mainTab === 'venta' ? formData.unitPrice : undefined,
                ivaRate: formData.ivaRate,
                ivaAmount: calculations.ivaTotal,
                subtotal: calculations.netoAfterBonif,
                total: calculations.totalFinal,
                costMethod,
                counterparty: formData.counterparty || undefined,
                paymentMethod: 'MIXTO',
                paymentSplits: validSplits.map(s => ({ accountId: s.accountId, amount: s.amount, method: 'MIXTO' })),
                notes: formData.notes || undefined,
                reference: formData.reference || undefined,
                autoJournal: formData.autoJournal,
                bonificacionPct: formData.bonificacionPct || undefined,
                bonificacionAmount: calculations.bonifAmount || undefined,
                descuentoFinancieroPct: formData.descuentoFinancieroPct || undefined,
                descuentoFinancieroAmount: calculations.descuentoFinAmount || undefined,
                gastosCompra: calculations.gastosNetos || undefined,
                // Percepciones / IVA como costo - taxes include calcMode/rate/base for re-editing
                taxes: finalTaxes.length > 0 ? finalTaxes : undefined,
                discriminarIVA: mainTab === 'compra' ? discriminarIVA : undefined,
                // For VALUE_ADJUSTMENT (solo gasto capitalizado)
                valueDelta: isSoloGastoCap ? gastosCapitalizables : undefined,
                adjustmentKind: isSoloGastoCap ? 'CAPITALIZATION' : undefined,
                // Ensure no RT6 fields leak into capitalization
                rt6Period: undefined,
                rt6SourceEntryId: undefined,
                sourceMovementId: formData.isSoloGasto && formData.sourceMovementId ? formData.sourceMovementId : undefined,
            })
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al guardar')
            setIsSaving(false)
        }
    }

    // Tab styles based on mode
    const getTabClasses = (tab: MainTab) => {
        const isActive = mainTab === tab
        const colors = {
            compra: 'text-blue-600',
            venta: 'text-emerald-600',
            ajuste: 'text-orange-500',
        }
        return isActive
            ? `px-6 py-2 rounded-md text-sm font-semibold bg-white ${colors[tab]} shadow-sm border border-slate-200 transition-all flex items-center gap-2`
            : 'px-6 py-2 rounded-md text-sm font-medium text-slate-500 hover:text-slate-700 transition-all flex items-center gap-2 opacity-70 hover:opacity-100'
    }

    // Header config based on mode
    const headerConfig = {
        compra: {
            title: 'Registrar Compra',
            subtitle: 'Inventario / Bienes de Cambio',
            icon: ShoppingCart,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
        },
        venta: {
            title: 'Registrar Venta',
            subtitle: 'Inventario / Bienes de Cambio',
            icon: Tag,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
        },
        ajuste: {
            title: ajusteSubTab === 'devoluciones' ? 'Registrar Devolucion' : 'Registrar Ajuste',
            subtitle: 'Inventario / Bienes de Cambio',
            icon: ArrowsCounterClockwise,
            iconBg: 'bg-orange-50',
            iconColor: 'text-orange-500',
        },
    }

    const config = headerConfig[mainTab]
    const HeaderIcon = config.icon

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-[1250px] h-[92vh] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* 1. HEADER */}
                <header className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`${config.iconBg} p-2 rounded-lg ${config.iconColor} transition-colors duration-300`}>
                            <HeaderIcon size={24} weight="duotone" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 leading-tight font-display">
                                {isEditing ? 'Editar Movimiento' : config.title}
                            </h2>
                            <p className="text-sm text-slate-500">{config.subtitle}</p>
                        </div>
                    </div>

                    {/* TABS */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setMainTab('compra')}
                            className={getTabClasses('compra')}
                        >
                            <ArrowDownLeft size={16} weight="bold" /> Compra
                        </button>
                        <button
                            type="button"
                            onClick={() => setMainTab('venta')}
                            className={getTabClasses('venta')}
                        >
                            <ArrowUpRight size={16} weight="bold" /> Venta
                        </button>
                        <button
                            type="button"
                            onClick={() => setMainTab('ajuste')}
                            className={getTabClasses('ajuste')}
                        >
                            <Sliders size={16} weight="bold" /> Ajuste
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full"
                    >
                        <X size={20} weight="bold" />
                    </button>
                </header>

                {/* 2. CONTENT AREA (Split View) */}
                <div className="flex flex-1 overflow-hidden">

                    {/* LEFT: FORM (Scrollable) */}
                    <div className="w-7/12 overflow-y-auto p-6 bg-slate-50 space-y-6 relative custom-scroll">

                        {/* Error Banner */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-fade-in">
                                <Warning size={16} weight="fill" /> {error}
                            </div>
                        )}

                        {/* AJUSTE SUB-TABS */}
                        {mainTab === 'ajuste' && (
                            <div className="mb-4 animate-fade-in">
                                <div className="flex gap-2 border-b border-slate-200 pb-2">
                                    <button
                                        type="button"
                                        onClick={() => setAjusteSubTab('devoluciones')}
                                        className={`px-4 py-1.5 text-sm font-${ajusteSubTab === 'devoluciones' ? 'semibold' : 'medium'} ${
                                            ajusteSubTab === 'devoluciones'
                                                ? 'text-blue-600 border-b-2 border-blue-600'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Devoluciones
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAjusteSubTab('stock')}
                                        className={`px-4 py-1.5 text-sm font-${ajusteSubTab === 'stock' ? 'semibold' : 'medium'} ${
                                            ajusteSubTab === 'stock'
                                                ? 'text-blue-600 border-b-2 border-blue-600'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        Stock Fisico
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAjusteSubTab('rt6')}
                                        className={`px-4 py-1.5 text-sm font-${ajusteSubTab === 'rt6' ? 'semibold' : 'medium'} ${
                                            ajusteSubTab === 'rt6'
                                                ? 'text-blue-600 border-b-2 border-blue-600'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <TrendUp size={14} weight="bold" className="inline mr-1" />
                                        Inflacion (RT6)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAjusteSubTab('bonif_desc')}
                                        className={`px-4 py-1.5 text-sm font-${ajusteSubTab === 'bonif_desc' ? 'semibold' : 'medium'} ${
                                            ajusteSubTab === 'bonif_desc'
                                                ? 'text-blue-600 border-b-2 border-blue-600'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Percent size={14} weight="bold" className="inline mr-1" />
                                        Bonif. / Descuentos
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* DEVOLUCIONES FORM */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'devoluciones' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* Tipo devolucion */}
                                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                    <label className="block text-xs font-semibold text-orange-800 mb-2">Tipo de Devolucion</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDevolucion(prev => ({ ...prev, tipo: 'DEVOLUCION_COMPRA', originalMovementId: '' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                devolucion.tipo === 'DEVOLUCION_COMPRA'
                                                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                                            }`}
                                        >
                                            Devolucion de Compra
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDevolucion(prev => ({ ...prev, tipo: 'DEVOLUCION_VENTA', originalMovementId: '' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                devolucion.tipo === 'DEVOLUCION_VENTA'
                                                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                                            }`}
                                        >
                                            Devolucion de Venta
                                        </button>
                                    </div>
                                </div>

                                {/* Producto */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Package size={16} weight="duotone" className="text-blue-600" /> Producto
                                    </h3>
                                    <select
                                        value={devolucion.productId}
                                        onChange={(e) => setDevolucion(prev => ({ ...prev, productId: e.target.value, originalMovementId: '' }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                </section>

                                {/* FECHA - Devoluciones */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-48">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                        />
                                    </div>
                                </section>

                                {/* Movimiento Original */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <ArrowUUpLeft size={16} weight="duotone" className="text-orange-500" /> Movimiento Original a Revertir
                                    </h3>
                                    <div className="relative">
                                        <MagnifyingGlass className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                        <select
                                            value={devolucion.originalMovementId}
                                            onChange={(e) => setDevolucion(prev => ({ ...prev, originalMovementId: e.target.value }))}
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none"
                                        >
                                            <option value="">Selecciona un movimiento...</option>
                                            {availableMovementsForReturn.map(m => (
                                                <option key={m.id} value={m.id}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {availableMovementsForReturn.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-2">
                                            No hay movimientos de {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'compra' : 'venta'} para este producto.
                                        </p>
                                    )}
                                </section>

                                {/* Cantidad a devolver */}
                                {selectedOriginalMovement && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                            Cantidad a Devolver
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Disponible: {selectedOriginalMovement.quantity}</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={selectedOriginalMovement.quantity}
                                                    value={devolucion.cantidadDevolver}
                                                    onChange={(e) => setDevolucion(prev => ({ ...prev, cantidadDevolver: Number(e.target.value) }))}
                                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-orange-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                    {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Costo Unitario' : 'Precio Unitario'}
                                                </label>
                                                <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-right text-slate-500">
                                                    {formatCurrency(devolucionCalculations.unitValue)}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {/* Contrapartida Devolucion */}
                                {selectedOriginalMovement && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                            <ArrowsLeftRight size={16} weight="duotone" className="text-orange-500" /> Contrapartida
                                        </h3>
                                        <div className="space-y-2">
                                            {devolucionSplits.map((split) => (
                                                <div key={split.id} className="flex gap-2 items-center">
                                                    <div className="flex-1">
                                                        <AccountSearchSelect
                                                            accounts={accounts || []}
                                                            value={split.accountId}
                                                            onChange={(val) => handleDevolucionSplitChange(split.id, 'accountId', val)}
                                                            placeholder="Buscar cuenta..."
                                                            inputClassName="h-[38px] text-xs px-2 py-1.5"
                                                        />
                                                    </div>
                                                    <input
                                                        type="number"
                                                        value={split.amount}
                                                        onChange={(e) => handleDevolucionSplitChange(split.id, 'amount', Number(e.target.value))}
                                                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none focus:ring-1 focus:ring-orange-500 h-[38px]"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDevolucionSplit(split.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    >
                                                        <Trash size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
                                            <button
                                                type="button"
                                                onClick={handleAddDevolucionSplit}
                                                className="text-orange-600 text-xs font-semibold flex items-center gap-1 hover:bg-orange-50 px-2 py-1 rounded transition-colors"
                                            >
                                                <Plus weight="bold" /> Agregar cuenta
                                            </button>
                                            <div className="text-right">
                                                <div className="text-[10px] uppercase font-bold text-slate-400">Restante</div>
                                                <div className={`font-mono font-bold text-sm ${Math.abs(devolucionSplitTotals.remaining) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {formatCurrency(devolucionSplitTotals.remaining)}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}

                        {/* STOCK FISICO FORM */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'stock' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* FECHA - Stock */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-48">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </section>

                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        Tipo de Ajuste
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setStockAjuste(prev => ({ ...prev, direction: 'IN' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                stockAjuste.direction === 'IN'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            Entrada (aumenta stock)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStockAjuste(prev => ({ ...prev, direction: 'OUT' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                stockAjuste.direction === 'OUT'
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            Salida (baja stock)
                                        </button>
                                    </div>
                                </section>

                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Package size={16} weight="duotone" className="text-blue-600" /> Producto
                                    </h3>
                                    <select
                                        value={stockAjuste.productId}
                                        onChange={(e) => setStockAjuste(prev => ({ ...prev, productId: e.target.value }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                </section>

                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={stockAjuste.quantity}
                                                onChange={(e) => setStockAjuste(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        {stockAjuste.direction === 'IN' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Costo Unitario</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-2 text-slate-400">$</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={stockAjuste.unitCost}
                                                        onChange={(e) => setStockAjuste(prev => ({ ...prev, unitCost: Number(e.target.value) }))}
                                                        className="w-full pl-7 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo / Notas</label>
                                    <input
                                        type="text"
                                        value={stockAjuste.notes}
                                        onChange={(e) => setStockAjuste(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Ej: Rotura, perdida, inventario fisico..."
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </section>
                            </div>
                        )}

                        {/* RT6 - AJUSTE POR INFLACION FORM */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'rt6' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* FECHA - RT6 */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-48">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </section>

                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-start gap-3">
                                    <TrendUp size={20} className="text-indigo-600 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-indigo-800">Ajuste por Inflacion (RT 6)</h4>
                                        <p className="text-xs text-indigo-700 mt-1">
                                            Ajuste manual del valor de un lote existente. No modifica cantidades, solo el valor monetario (valueDelta).
                                        </p>
                                    </div>
                                </div>

                                {/* Producto */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Package size={16} weight="duotone" className="text-blue-600" /> Producto
                                    </h3>
                                    <select
                                        value={rt6.productId}
                                        onChange={(e) => setRt6(prev => ({ ...prev, productId: e.target.value, originMovementId: '' }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                </section>

                                {/* Movimiento origen */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <MagnifyingGlass size={16} weight="duotone" className="text-indigo-600" /> Movimiento / Lote de Origen
                                    </h3>
                                    <select
                                        value={rt6.originMovementId}
                                        onChange={(e) => setRt6(prev => ({ ...prev, originMovementId: e.target.value }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Selecciona un movimiento...</option>
                                        {availableMovementsForRT6.map(m => (
                                            <option key={m.id} value={m.id}>{m.label}</option>
                                        ))}
                                    </select>
                                    {availableMovementsForRT6.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-2">
                                            No hay movimientos con stock para este producto.
                                        </p>
                                    )}
                                </section>

                                {/* Periodo y Delta */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <TrendUp size={16} weight="duotone" className="text-indigo-600" /> Datos del Ajuste
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Periodo RT6</label>
                                            <input
                                                type="text"
                                                value={rt6.rt6Period}
                                                onChange={(e) => setRt6(prev => ({ ...prev, rt6Period: e.target.value }))}
                                                placeholder="Ej: 2024-12, Q4-2024"
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Delta de Valor ($)</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={rt6.valueDelta || ''}
                                                    onChange={(e) => setRt6(prev => ({ ...prev, valueDelta: Number(e.target.value) }))}
                                                    placeholder="Monto (+/-)"
                                                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Positivo = aumento, Negativo = disminucion</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Notas */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notas / Referencia</label>
                                    <input
                                        type="text"
                                        value={rt6.notes}
                                        onChange={(e) => setRt6(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Ej: Ajuste RT6 periodo dic-2024, coeficiente 1.12..."
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </section>
                            </div>
                        )}

                        {/* BONIF / DESCUENTOS POST */}
                        {mainTab === 'ajuste' && ajusteSubTab === 'bonif_desc' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* FECHA */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-48">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => handleChange('date', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </section>

                                {/* Aplicar sobre */}
                                <section className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <label className="block text-xs font-semibold text-indigo-800 mb-2">Aplicar sobre</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPostAdjust(prev => ({ ...prev, applyOn: 'PURCHASE', originalMovementId: '' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                postAdjust.applyOn === 'PURCHASE'
                                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                                            }`}
                                        >
                                            Compra
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPostAdjust(prev => ({ ...prev, applyOn: 'SALE', originalMovementId: '' }))}
                                            className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${
                                                postAdjust.applyOn === 'SALE'
                                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                                            }`}
                                        >
                                            Venta
                                        </button>
                                    </div>
                                </section>

                                {/* Producto */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Package size={16} weight="duotone" className="text-blue-600" /> Producto
                                    </h3>
                                    <select
                                        value={postAdjust.productId}
                                        onChange={(e) => setPostAdjust(prev => ({ ...prev, productId: e.target.value, originalMovementId: '' }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                </section>

                                {/* Movimiento original */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <MagnifyingGlass size={16} weight="duotone" className="text-indigo-600" /> Movimiento original
                                    </h3>
                                    <select
                                        value={postAdjust.originalMovementId}
                                        onChange={(e) => setPostAdjust(prev => ({ ...prev, originalMovementId: e.target.value }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Selecciona un movimiento...</option>
                                        {availableMovementsForPostAdjust.map(m => (
                                            <option key={m.id} value={m.id}>{m.label}</option>
                                        ))}
                                    </select>
                                    {availableMovementsForPostAdjust.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-2">
                                            No hay movimientos disponibles para este producto.
                                        </p>
                                    )}
                                </section>

                                {/* Tipo de Ajuste */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Percent size={16} weight="duotone" className="text-purple-600" /> Tipo de Ajuste
                                    </h3>
                                    <select
                                        value={postAdjust.kind}
                                        onChange={(e) => setPostAdjust(prev => ({ ...prev, kind: e.target.value as 'BONUS' | 'DISCOUNT' }))}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        {postAdjust.applyOn === 'PURCHASE' ? (
                                            <>
                                                <option value="BONUS">Bonificacion sobre compras</option>
                                                <option value="DISCOUNT">Descuento obtenido (financiero)</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="BONUS">Bonificacion sobre ventas</option>
                                                <option value="DISCOUNT">Descuento otorgado (financiero)</option>
                                            </>
                                        )}
                                    </select>
                                </section>

                                {/* Importe */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Tag size={16} weight="duotone" className="text-emerald-600" /> Importe del ajuste
                                    </h3>
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => setPostAdjust(prev => ({ ...prev, inputMode: 'PCT' }))}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                                                postAdjust.inputMode === 'PCT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'
                                            }`}
                                        >
                                            %
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPostAdjust(prev => ({ ...prev, inputMode: 'AMOUNT' }))}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                                                postAdjust.inputMode === 'AMOUNT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'
                                            }`}
                                        >
                                            $
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">{postAdjust.inputMode === 'PCT' ? 'Porcentaje' : 'Monto'}</label>
                                            <div className="relative">
                                                {postAdjust.inputMode === 'AMOUNT' && <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>}
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={postAdjust.value || ''}
                                                    onChange={(e) => setPostAdjust(prev => ({ ...prev, value: Number(e.target.value) }))}
                                                    className={`w-full ${postAdjust.inputMode === 'AMOUNT' ? 'pl-8' : 'pl-3'} pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-emerald-500 outline-none`}
                                                />
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500 space-y-1">
                                            <div className="flex justify-between"><span>Base</span><span className="font-mono">{formatCurrency(postAdjustCalculations.base)}</span></div>
                                            <div className="flex justify-between"><span>Neto</span><span className="font-mono">{formatCurrency(postAdjustCalculations.neto)}</span></div>
                                            <div className="flex justify-between"><span>IVA</span><span className="font-mono">{formatCurrency(postAdjustCalculations.iva)}</span></div>
                                            <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatCurrency(postAdjustCalculations.total)}</span></div>
                                        </div>
                                    </div>
                                </section>

                                {/* Contrapartidas */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Wallet size={16} weight="duotone" className="text-blue-600" /> Contrapartidas
                                    </h3>
                                    <div className="space-y-3">
                                        {postAdjustSplits.map((split) => (
                                            <div key={split.id} className="flex items-center gap-3 relative">
                                                <div className="flex-1 relative">
                                                    <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1 z-10">CUENTA</label>
                                                    <AccountSearchSelect
                                                        accounts={accounts || []}
                                                        value={split.accountId}
                                                        onChange={(val) => handlePostSplitChange(split.id, 'accountId', val)}
                                                        placeholder="Buscar cuenta..."
                                                        inputClassName="h-[52px] pt-4 text-sm"
                                                    />
                                                </div>
                                                <div className="w-1/3 relative">
                                                    <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1">IMPORTE</label>
                                                    <input
                                                        type="number"
                                                        value={split.amount || ''}
                                                        onChange={(e) => handlePostSplitChange(split.id, 'amount', Number(e.target.value))}
                                                        className="w-full px-3 py-3 pt-5 border border-slate-300 rounded-lg text-sm font-mono text-right outline-none focus:border-blue-500 bg-white h-[52px]"
                                                        placeholder="0,00"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePostSplit(split.id)}
                                                    className="mt-2 p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    title="Eliminar linea"
                                                >
                                                    <Trash size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                                        <span className="text-xs text-slate-500 italic">Selecciona la contrapartida del ajuste.</span>
                                        <button
                                            type="button"
                                            onClick={handleAddPostSplit}
                                            className="text-xs font-semibold text-blue-600 cursor-pointer hover:underline flex items-center gap-1"
                                        >
                                            <Plus weight="bold" /> Agregar otra cuenta
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center mt-3">
                                        <button
                                            type="button"
                                            onClick={handleAutoFillPostSplit}
                                            className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-600"
                                        >
                                            Autocompletar restante
                                        </button>
                                        <div className="text-right">
                                            <div className="text-[10px] uppercase font-bold text-slate-400">Restante</div>
                                            <div className={`font-mono font-bold text-sm ${Math.abs(postAdjustSplitTotals.remaining) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatCurrency(postAdjustSplitTotals.remaining)}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Notas */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notas / Referencia</label>
                                    <input
                                        type="text"
                                        value={postAdjust.notes}
                                        onChange={(e) => setPostAdjust(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Ej: Ajuste post-factura"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </section>
                            </div>
                        )}

                        {/* COMPRA / VENTA FORM */}
                        {(mainTab === 'compra' || mainTab === 'venta') && (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* SECTION: OPERACION */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                            <Tag size={16} weight="duotone" className="text-blue-600" /> Detalle Operacion
                                        </h3>

                                        {/* Toggle Solo Gasto (Solo en Compra) */}
                                        {mainTab === 'compra' && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-slate-500">Solo gasto sin stock?</span>
                                                <label className="flex items-center cursor-pointer relative">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.isSoloGasto}
                                                        onChange={(e) => {
                                                            const next = e.target.checked
                                                            handleChange('isSoloGasto', next)
                                                            if (!next) {
                                                                handleChange('sourceMovementId', '')
                                                            }
                                                        }}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-slate-200 rounded-full border border-slate-300 peer-checked:bg-blue-600 transition-colors duration-200" />
                                                    <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 peer-checked:translate-x-5 shadow-sm" />
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-12 gap-4">
                                        {/* FECHA */}
                                        <div className="col-span-4">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="col-span-8" /> {/* spacer */}

                                        <div className="col-span-12">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Bien de Cambio / Item</label>
                                            <div className="relative">
                                                <MagnifyingGlass className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                                <select
                                                    value={formData.productId}
                                                    onChange={(e) => handleChange('productId', e.target.value)}
                                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none"
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
                                        </div>

                                        {formData.isSoloGasto && mainTab === 'compra' && (
                                            <div className="col-span-12">
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Compra asociada (opcional)</label>
                                                <select
                                                    value={formData.sourceMovementId}
                                                    onChange={(e) => handleChange('sourceMovementId', e.target.value)}
                                                    disabled={availablePurchasesForAssociation.length === 0}
                                                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${availablePurchasesForAssociation.length === 0 ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white border-slate-300'}`}
                                                >
                                                    <option value="">Sin asociar (prorrateo FIFO)</option>
                                                    {availablePurchasesForAssociation.map((m) => (
                                                        <option key={m.id} value={m.id}>{m.label}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Solo afecta la capitalizacion del costo en capas FIFO.
                                                </p>
                                            </div>
                                        )}

                                        {!formData.isSoloGasto && (
                                            <>
                                                <div className="col-span-4">
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={formData.quantity}
                                                        onChange={(e) => handleChange('quantity', Number(e.target.value))}
                                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>

                                                <div className="col-span-4">
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                        {mainTab === 'venta' ? 'Precio Venta (Neto)' : 'Costo Unitario (Neto)'}
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={mainTab === 'venta' ? formData.unitPrice : formData.unitCost}
                                                            onChange={(e) => handleChange(mainTab === 'venta' ? 'unitPrice' : 'unitCost', Number(e.target.value))}
                                                            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="col-span-4">
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Total Item</label>
                                                    <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-500 text-right font-medium">
                                                        {formatCurrency(calculations.subtotalItems)}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </section>

                                {/* SECTION: CONDICIONES COMERCIALES */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Percent size={16} weight="duotone" className="text-purple-600" /> Condiciones Comerciales
                                    </h3>
                                    <div className="grid grid-cols-2 gap-6">
                                        {/* Bonificacion */}
                                        <div className="relative">
                                            <div className="flex justify-between mb-1">
                                                <label className="block text-xs font-semibold text-slate-700">Bonificacion (%)</label>
                                                <span title="Descuento comercial. Reduce la base imponible y el IVA.">
                                                    <Info size={14} className="text-slate-400 hover:text-blue-600 cursor-help" />
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.5"
                                                    value={formData.bonificacionPct || ''}
                                                    onChange={(e) => handleChange('bonificacionPct', Number(e.target.value))}
                                                    className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-purple-500 outline-none"
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Impacta Base Imponible e IVA</p>
                                        </div>

                                        {/* Descuento Financiero */}
                                        <div className="relative">
                                            <div className="flex justify-between mb-1">
                                                <label className="block text-xs font-semibold text-slate-700">Descuento Financiero (%)</label>
                                                <span title="Resultado financiero. No altera el valor del bien, reduce el total a pagar.">
                                                    <Info size={14} className="text-slate-400 hover:text-blue-600 cursor-help" />
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.5"
                                                    value={formData.descuentoFinancieroPct || ''}
                                                    onChange={(e) => handleChange('descuentoFinancieroPct', Number(e.target.value))}
                                                    className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-purple-500 outline-none"
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Genera resultado financiero</p>
                                        </div>
                                    </div>
                                </section>

                                {/* SECTION: GASTOS ACCESORIOS (Solo Compra) */}
                                {mainTab === 'compra' && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                            <Receipt size={16} weight="duotone" className="text-emerald-600" /> Gastos Accesorios
                                        </h3>

                                        <div className="space-y-3">
                                            {gastos.map((gasto) => (
                                                <div key={gasto.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                                                    <div className="grid grid-cols-12 gap-3 items-center">
                                                        <div className="col-span-5">
                                                            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Concepto</label>
                                                            <input
                                                                type="text"
                                                                value={gasto.concepto}
                                                                onChange={(e) => handleGastoChange(gasto.id, 'concepto', e.target.value)}
                                                                placeholder="Flete, seguro, etc."
                                                                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-blue-500 outline-none"
                                                            />
                                                        </div>
                                                        <div className="col-span-3">
                                                            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Monto</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={gasto.monto || ''}
                                                                onChange={(e) => handleGastoChange(gasto.id, 'monto', Number(e.target.value))}
                                                                className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 rounded focus:border-blue-500 outline-none"
                                                            />
                                                        </div>
                                                        <div className="col-span-3 flex flex-col gap-1 pl-2 border-l border-slate-200">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={gasto.gravadoIVA}
                                                                    onChange={(e) => handleGastoChange(gasto.id, 'gravadoIVA', e.target.checked)}
                                                                    className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                                />
                                                                <span className="text-[10px] font-medium text-slate-600">Gravado (IVA)</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={gasto.capitalizar}
                                                                    onChange={(e) => handleGastoChange(gasto.id, 'capitalizar', e.target.checked)}
                                                                    className="w-3.5 h-3.5 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                                                                />
                                                                <span className="text-[10px] font-medium text-slate-600">Capitalizar (Stock)</span>
                                                            </label>
                                                        </div>
                                                        <div className="col-span-1 flex justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveGasto(gasto.id)}
                                                                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                                title="Eliminar gasto"
                                                            >
                                                                <Trash size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleAddGasto}
                                            className="mt-3 text-blue-600 text-xs font-semibold flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                        >
                                            <Plus weight="bold" /> Agregar gasto
                                        </button>
                                    </section>
                                )}

                                {/* SECTION: DISCRIMINAR IVA (solo compra) */}
                                {mainTab === 'compra' && (
                                    <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-sm font-bold text-slate-800">Discriminar IVA</span>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {discriminarIVA
                                                        ? 'IVA se imputa a Credito Fiscal (Responsable Inscripto)'
                                                        : 'IVA se suma al costo de mercaderias (Monotributo / Exento)'}
                                                </p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={discriminarIVA}
                                                    onChange={(e) => setDiscriminarIVA(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
                                            </label>
                                        </div>
                                    </section>
                                )}

                                {/* SECTION: PERCEPCIONES / IMPUESTOS ADICIONALES */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Receipt size={16} weight="duotone" className="text-amber-600" /> Impuestos / Percepciones
                                    </h3>

                                    {taxes.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic mb-2">Sin percepciones adicionales en este comprobante.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {taxes.map((tax) => {
                                                const taxCalc = calculations.taxesWithAmounts.find(t => t.id === tax.id)
                                                const calculatedAmount = taxCalc?.calculatedAmount || 0
                                                const isPercent = tax.calcMode === 'PERCENT'
                                                return (
                                                    <div key={tax.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <div className="grid grid-cols-12 gap-2 items-end">
                                                            {/* Tipo selector */}
                                                            <div className="col-span-4">
                                                                <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Tipo</label>
                                                                <select
                                                                    value={`${tax.kind}:${tax.taxType}`}
                                                                    onChange={(e) => {
                                                                        const [kind, taxType] = e.target.value.split(':') as [TaxLineKind, TaxType]
                                                                        handleTaxChange(tax.id, 'kind', kind)
                                                                        handleTaxChange(tax.id, 'taxType', taxType)
                                                                    }}
                                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none bg-white"
                                                                >
                                                                    <option value="PERCEPCION:IVA">Percepcion IVA</option>
                                                                    <option value="PERCEPCION:IIBB">Percepcion IIBB</option>
                                                                    <option value="PERCEPCION:GANANCIAS">Percepcion Ganancias</option>
                                                                    <option value="PERCEPCION:SUSS">Percepcion SUSS</option>
                                                                    <option value="PERCEPCION:OTRO">Percepcion Otro</option>
                                                                </select>
                                                            </div>
                                                            {/* Mode toggle: Monto / % */}
                                                            <div className="col-span-3">
                                                                <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Modo</label>
                                                                <div className="flex bg-slate-200 rounded p-0.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleTaxChange(tax.id, 'calcMode', 'AMOUNT')}
                                                                        className={`flex-1 px-2 py-1 text-xs font-semibold rounded transition-colors ${!isPercent ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}
                                                                    >
                                                                        Monto
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleTaxChange(tax.id, 'calcMode', 'PERCENT')}
                                                                        className={`flex-1 px-2 py-1 text-xs font-semibold rounded transition-colors ${isPercent ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}
                                                                    >
                                                                        %
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {/* Amount or Rate input */}
                                                            <div className="col-span-4">
                                                                {isPercent ? (
                                                                    <div className="flex gap-1">
                                                                        <div className="flex-1">
                                                                            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Tasa %</label>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.01"
                                                                                value={tax.rate ?? ''}
                                                                                onChange={(e) => handleTaxChange(tax.id, 'rate', Number(e.target.value))}
                                                                                className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 rounded focus:border-amber-500 outline-none"
                                                                                placeholder="3"
                                                                            />
                                                                        </div>
                                                                        <div className="w-16">
                                                                            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Base</label>
                                                                            <select
                                                                                value={tax.base || 'NETO'}
                                                                                onChange={(e) => handleTaxChange(tax.id, 'base', e.target.value)}
                                                                                className="w-full px-1 py-1.5 text-xs border border-slate-300 rounded focus:border-amber-500 outline-none bg-white"
                                                                            >
                                                                                <option value="NETO">Neto</option>
                                                                                <option value="IVA">IVA</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Monto</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.01"
                                                                            value={tax.amount || ''}
                                                                            onChange={(e) => handleTaxChange(tax.id, 'amount', Number(e.target.value))}
                                                                            className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 rounded focus:border-amber-500 outline-none"
                                                                            placeholder="0,00"
                                                                        />
                                                                    </>
                                                                )}
                                                            </div>
                                                            {/* Delete button */}
                                                            <div className="col-span-1 flex justify-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveTax(tax.id)}
                                                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                                    title="Eliminar percepcion"
                                                                >
                                                                    <Trash size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* Calculated amount display for % mode */}
                                                        {isPercent && (
                                                            <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                                                                <span className="text-slate-500">
                                                                    {tax.rate || 0}% sobre {tax.base === 'IVA' ? 'IVA' : 'Neto'} ({formatCurrency(tax.base === 'IVA' ? calculations.ivaTotal : calculations.baseImponible)})
                                                                </span>
                                                                <span className="font-mono font-semibold text-amber-600">= {formatCurrency(calculatedAmount)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleAddTax}
                                        className="mt-3 text-amber-600 text-xs font-semibold flex items-center gap-1 hover:bg-amber-50 px-2 py-1 rounded transition-colors"
                                    >
                                        <Plus weight="bold" /> Agregar percepcion
                                    </button>
                                </section>

                                {/* SECTION: PAGO / COBRO */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-visible z-10 animate-fade-in">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                                        <Wallet size={64} weight="duotone" className="text-blue-600" />
                                    </div>

                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        {mainTab === 'compra' ? (
                                            <><Wallet size={16} weight="duotone" className="text-blue-600" /> Pago / Contrapartidas</>
                                        ) : (
                                            <><HandCoins size={16} weight="duotone" className="text-emerald-600" /> Cobro / Contrapartidas</>
                                        )}
                                    </h3>

                                    {/* Payment Rows Container */}
                                    <div className="space-y-3">
                                        {splits.map((split) => (
                                            <div key={split.id} className="flex items-center gap-3 relative">
                                                <div className="flex-1 relative">
                                                    <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1 z-10">CUENTA</label>
                                                    <AccountSearchSelect
                                                        accounts={accounts || []}
                                                        value={split.accountId}
                                                        onChange={(val) => handleSplitChange(split.id, 'accountId', val)}
                                                        placeholder="Buscar cuenta..."
                                                        inputClassName="h-[52px] pt-4 text-sm"
                                                    />
                                                </div>
                                                <div className="w-1/3 relative">
                                                    <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1">IMPORTE</label>
                                                    <input
                                                        type="number"
                                                        value={split.amount || ''}
                                                        onChange={(e) => handleSplitChange(split.id, 'amount', Number(e.target.value))}
                                                        className="w-full px-3 py-3 pt-5 border border-slate-300 rounded-lg text-sm font-mono text-right outline-none focus:border-blue-500 bg-white h-[52px]"
                                                        placeholder="0,00"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSplit(split.id)}
                                                    className="mt-2 p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    title="Eliminar linea"
                                                >
                                                    <Trash size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-slate-500 italic">Podes combinar multiples medios.</span>
                                            <button
                                                type="button"
                                                onClick={handleAddSplit}
                                                className="text-xs font-semibold text-blue-600 cursor-pointer hover:underline flex items-center gap-1"
                                            >
                                                <Plus weight="bold" /> Agregar otra cuenta
                                            </button>
                                        </div>
                                        {!showRetencionPanel ? (
                                            <button
                                                type="button"
                                                onClick={handleOpenRetencionPanel}
                                                className="text-xs font-semibold text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition-colors flex items-center gap-1 self-start"
                                            >
                                                <Plus weight="bold" /> {mainTab === 'compra' ? 'Agregar retencion (a depositar)' : 'Agregar retencion sufrida (a favor)'}
                                            </button>
                                        ) : (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-xs font-bold text-amber-700 uppercase">
                                                        {mainTab === 'compra' ? 'Retencion a depositar' : 'Retencion sufrida'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowRetencionPanel(false)}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-12 gap-2 items-end">
                                                    {/* Tipo selector */}
                                                    <div className="col-span-3">
                                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Tipo</label>
                                                        <select
                                                            value={retencionForm.taxType}
                                                            onChange={(e) => setRetencionForm(prev => ({ ...prev, taxType: e.target.value as TaxType }))}
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:border-amber-500 outline-none bg-white"
                                                        >
                                                            <option value="IVA">IVA</option>
                                                            <option value="IIBB">IIBB</option>
                                                            <option value="GANANCIAS">Ganancias</option>
                                                            <option value="OTRO">Otro</option>
                                                        </select>
                                                    </div>
                                                    {/* Mode toggle */}
                                                    <div className="col-span-3">
                                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Modo</label>
                                                        <div className="flex bg-slate-200 rounded p-0.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setRetencionForm(prev => ({ ...prev, calcMode: 'AMOUNT' }))}
                                                                className={`flex-1 px-2 py-1 text-xs font-semibold rounded transition-colors ${retencionForm.calcMode === 'AMOUNT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}
                                                            >
                                                                Monto
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setRetencionForm(prev => ({ ...prev, calcMode: 'PERCENT' }))}
                                                                className={`flex-1 px-2 py-1 text-xs font-semibold rounded transition-colors ${retencionForm.calcMode === 'PERCENT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}
                                                            >
                                                                %
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {/* Amount or Rate input */}
                                                    <div className="col-span-4">
                                                        {retencionForm.calcMode === 'PERCENT' ? (
                                                            <div className="flex gap-1">
                                                                <div className="flex-1">
                                                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Tasa %</label>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="100"
                                                                        step="0.01"
                                                                        value={retencionForm.rate}
                                                                        onChange={(e) => setRetencionForm(prev => ({ ...prev, rate: Number(e.target.value) }))}
                                                                        className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 rounded focus:border-amber-500 outline-none"
                                                                    />
                                                                </div>
                                                                <div className="w-14">
                                                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Base</label>
                                                                    <select
                                                                        value={retencionForm.base}
                                                                        onChange={(e) => setRetencionForm(prev => ({ ...prev, base: e.target.value as TaxCalcBase }))}
                                                                        className="w-full px-1 py-1.5 text-xs border border-slate-300 rounded focus:border-amber-500 outline-none bg-white"
                                                                    >
                                                                        <option value="IVA">IVA</option>
                                                                        <option value="NETO">Neto</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Monto</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={retencionForm.amount || ''}
                                                                    onChange={(e) => setRetencionForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                                                    className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 rounded focus:border-amber-500 outline-none"
                                                                    placeholder="0,00"
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                    {/* Apply button */}
                                                    <div className="col-span-2">
                                                        <button
                                                            type="button"
                                                            onClick={handleApplyRetencion}
                                                            className="w-full px-2 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded hover:bg-amber-600 transition-colors"
                                                        >
                                                            Aplicar
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Calculated amount display for % mode */}
                                                {retencionForm.calcMode === 'PERCENT' && (
                                                    <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between items-center text-xs">
                                                        <span className="text-amber-700">
                                                            {retencionForm.rate}% sobre {retencionForm.base === 'IVA' ? 'IVA' : 'Neto'} ({formatCurrency(retencionForm.base === 'IVA' ? calculations.ivaTotal : calculations.baseImponible)})
                                                        </span>
                                                        <span className="font-mono font-semibold text-amber-700">= {formatCurrency(retencionCalculatedAmount)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* SECTION: DATOS COMPROBANTE */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm opacity-90 hover:opacity-100 transition-opacity animate-fade-in">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Files size={16} weight="duotone" className="text-slate-500" /> Comprobante
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Entidad / Tercero</label>
                                            <input
                                                type="text"
                                                value={formData.counterparty}
                                                onChange={(e) => handleChange('counterparty', e.target.value)}
                                                placeholder={mainTab === 'compra' ? 'Nombre del proveedor' : 'Nombre del cliente'}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="w-1/3">
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                                                <select
                                                    value={formData.referenceType}
                                                    onChange={(e) => handleChange('referenceType', e.target.value)}
                                                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                                                >
                                                    <option>FC A</option>
                                                    <option>FC B</option>
                                                    <option>FC C</option>
                                                    <option>Tique</option>
                                                    <option>Remito</option>
                                                </select>
                                            </div>
                                            <div className="w-2/3">
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Numero</label>
                                                <input
                                                    type="text"
                                                    value={formData.reference}
                                                    onChange={(e) => handleChange('reference', e.target.value)}
                                                    placeholder="0001-00002342"
                                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="h-10"></div>
                            </form>
                        )}
                    </div>

                    {/* RIGHT: PREVIEW & ACTIONS (Sticky) */}
                    <div className="w-5/12 bg-white border-l border-slate-200 flex flex-col relative z-20">

                        <div className="flex-1 p-6 overflow-y-auto custom-scroll">

                            {/* SUMMARY CARD - Compra/Venta */}
                            {(mainTab === 'compra' || mainTab === 'venta') && (
                                <>
                                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6 shadow-sm">
                                        <h4 className="text-sm font-display font-bold text-slate-900 mb-4">Resumen de Importes</h4>

                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between text-slate-500">
                                                <span>Subtotal Items</span>
                                                <span className="font-mono">{formatCurrency(calculations.subtotalItems)}</span>
                                            </div>

                                            {calculations.bonifAmount > 0 && (
                                                <div className="flex justify-between text-purple-600">
                                                    <span>(-) Bonificacion ({formData.bonificacionPct}%)</span>
                                                    <span className="font-mono">- {formatCurrency(calculations.bonifAmount)}</span>
                                                </div>
                                            )}

                                            {mainTab === 'compra' && calculations.gastosNetos > 0 && (
                                                <div className="flex justify-between text-slate-500">
                                                    <span>(+) Gastos Netos</span>
                                                    <span className="font-mono">+ {formatCurrency(calculations.gastosNetos)}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between text-slate-600 font-medium pt-2 border-t border-slate-200 border-dashed">
                                                <span>Base Imponible</span>
                                                <span className="font-mono">{formatCurrency(calculations.baseImponible)}</span>
                                            </div>

                                            <div className="flex justify-between text-slate-500">
                                                <span>IVA ({formData.ivaRate}%){mainTab === 'compra' && !discriminarIVA ? ' (como costo)' : ''}</span>
                                                <span className="font-mono">{formatCurrency(calculations.ivaTotal)}</span>
                                            </div>

                                            <div className="flex justify-between text-slate-700 font-bold pt-2 mt-2 border-t border-slate-200">
                                                <span>Subtotal Comprobante</span>
                                                <span className="font-mono">{formatCurrency(calculations.subtotalComprobante)}</span>
                                            </div>

                                            {calculations.descuentoFinAmount > 0 && (
                                                <div className="flex justify-between text-emerald-600">
                                                    <span>(-) Desc. Financiero</span>
                                                    <span className="font-mono">- {formatCurrency(calculations.descuentoFinAmount)}</span>
                                                </div>
                                            )}

                                            {calculations.taxesTotal > 0 && (
                                                <div className="flex justify-between text-amber-600">
                                                    <span>(+) Impuestos adicionales</span>
                                                    <span className="font-mono">+ {formatCurrency(calculations.taxesTotal)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-slate-300 flex justify-between items-center">
                                            <span className="text-lg font-display font-bold text-slate-900">
                                                {mainTab === 'venta' ? 'Total a Cobrar' : 'Total a Pagar'}
                                            </span>
                                            <span className="text-2xl font-display font-bold text-blue-600 tracking-tight">
                                                {formatCurrency(calculations.totalFinal)}
                                            </span>
                                        </div>

                                        {mainTab === 'venta' && calculations.estimatedCMV > 0 && (
                                            <div className="mt-3 pt-3 border-t border-dashed border-slate-200 flex justify-between text-sm text-slate-500">
                                                <span>CMV Estimado ({costMethod})</span>
                                                <span className="font-mono">{formatCurrency(calculations.estimatedCMV)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* PAYMENT VALIDATION */}
                                    <div className="mb-6">
                                        <div className="flex justify-between text-xs font-semibold uppercase text-slate-400 mb-2 tracking-wider">
                                            <span>Balance de Fondos</span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                                            <div
                                                className={`h-full transition-all duration-500 ${Math.abs(splitTotals.remaining) <= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(splitTotals.percentage, 100)}%` }}
                                            />
                                        </div>

                                        <div className={`flex justify-between items-center px-3 py-2 rounded-lg border transition-colors ${
                                            Math.abs(splitTotals.remaining) <= 1
                                                ? 'bg-green-50 border-green-200'
                                                : 'bg-slate-50 border-slate-200'
                                        }`}>
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                {Math.abs(splitTotals.remaining) <= 1 ? (
                                                    <>
                                                        <Check size={16} weight="fill" className="text-green-600" />
                                                        <span className="text-green-700">Pagos asignados correctamente</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Warning size={16} weight="fill" className="text-amber-600" />
                                                        <span className="text-slate-500">Pendiente asignacion</span>
                                                    </>
                                                )}
                                            </div>
                                            <span className={`font-mono font-bold text-sm ${Math.abs(splitTotals.remaining) <= 1 ? 'text-green-700' : 'text-slate-700'}`}>
                                                {Math.abs(splitTotals.remaining) <= 1 ? 'Restante: $ 0,00' : `Faltan: ${formatCurrency(splitTotals.remaining)}`}
                                            </span>
                                        </div>

                                        {Math.abs(splitTotals.remaining) > 1 && (
                                            <button
                                                type="button"
                                                onClick={handleAutoFillSplit}
                                                className="mt-2 text-xs text-blue-600 font-semibold hover:underline"
                                            >
                                                Autocompletar restante
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* SUMMARY CARD - Devoluciones */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'devoluciones' && selectedOriginalMovement && (
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6 shadow-sm">
                                    <h4 className="text-sm font-display font-bold text-slate-900 mb-4">Resumen Devolucion</h4>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-500">
                                            <span>Cantidad a devolver</span>
                                            <span className="font-mono">{devolucion.cantidadDevolver} u</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Valor unitario</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.unitValue)}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600 font-medium pt-2 border-t border-slate-200">
                                            <span>Subtotal Neto</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>IVA ({selectedOriginalMovement.ivaRate}%)</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.iva)}</span>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-300 flex justify-between items-center">
                                        <span className="text-lg font-display font-bold text-slate-900">Total Devolucion</span>
                                        <span className="text-2xl font-display font-bold text-orange-500 tracking-tight">
                                            {formatCurrency(devolucionCalculations.total)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* SUMMARY CARD - Stock Ajuste */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'stock' && (
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6 shadow-sm">
                                    <h4 className="text-sm font-display font-bold text-slate-900 mb-4">Resumen Ajuste</h4>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Tipo</span>
                                            <span className={`font-semibold ${stockAjuste.direction === 'IN' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {stockAjuste.direction === 'IN' ? 'Entrada (+)' : 'Salida (-)'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Cantidad</span>
                                            <span className="font-mono">{stockAjuste.quantity} u</span>
                                        </div>
                                        {stockAjuste.direction === 'IN' && (
                                            <div className="flex justify-between text-slate-500">
                                                <span>Costo unitario</span>
                                                <span className="font-mono">{formatCurrency(stockAjuste.unitCost)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SUMMARY CARD - RT6 */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'rt6' && (
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6 shadow-sm">
                                    <h4 className="text-sm font-display font-bold text-slate-900 mb-4">Resumen Ajuste RT6</h4>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-500">
                                            <span>Periodo</span>
                                            <span className="font-mono">{rt6.rt6Period || '-'}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Movimiento origen</span>
                                            <span className="font-mono text-xs">{rt6.originMovementId ? rt6.originMovementId.slice(0, 12) + '...' : '-'}</span>
                                        </div>
                                        <div className={`flex justify-between font-bold pt-2 border-t border-slate-200 ${rt6.valueDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            <span>Delta de Valor</span>
                                            <span className="font-mono">{rt6.valueDelta >= 0 ? '+' : ''}{formatCurrency(rt6.valueDelta)}</span>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-300">
                                        <p className="text-xs text-slate-500">
                                            Tipo: <span className="font-semibold">VALUE_ADJUSTMENT</span> — No modifica cantidad, solo valor.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* SUMMARY CARD - Bonif/Descuentos */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'bonif_desc' && selectedPostMovement && (
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6 shadow-sm">
                                    <h4 className="text-sm font-display font-bold text-slate-900 mb-4">Resumen Ajuste</h4>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Tipo</span>
                                            <span className="font-semibold">
                                                {postAdjust.kind === 'BONUS' ? 'Bonificacion' : 'Descuento financiero'}
                                                {' '}
                                                {postAdjust.applyOn === 'PURCHASE' ? '(Compra)' : '(Venta)'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Base movimiento</span>
                                            <span className="font-mono">{formatCurrency(postAdjustCalculations.base)}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600 font-medium pt-2 border-t border-slate-200">
                                            <span>Neto ajuste</span>
                                            <span className="font-mono">{formatCurrency(postAdjustCalculations.neto)}</span>
                                        </div>
                                        {postAdjust.kind === 'BONUS' && (
                                            <div className="flex justify-between text-slate-500">
                                                <span>IVA ({postAdjustCalculations.ivaRate}%)</span>
                                                <span className="font-mono">{formatCurrency(postAdjustCalculations.iva)}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-300 flex justify-between items-center">
                                        <span className="text-lg font-display font-bold text-slate-900">Total Ajuste</span>
                                        <span className="text-2xl font-display font-bold text-emerald-600 tracking-tight">
                                            {formatCurrency(postAdjustCalculations.total)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* PREVIEW ASIENTO - RT6 */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'rt6' && rt6.valueDelta !== 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center text-xs">
                                            <Robot size={14} weight="fill" />
                                        </div>
                                        <span className="text-xs font-bold text-indigo-600 uppercase">Vista Previa Contable</span>
                                    </div>

                                    <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 shadow-inner">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-700">
                                                    <th className="text-left pb-2 font-normal">Cuenta</th>
                                                    <th className="text-right pb-2 font-normal">Debe</th>
                                                    <th className="text-right pb-2 font-normal">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {rt6.valueDelta > 0 ? (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">Mercaderias (Ajuste RT6)</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{Math.abs(rt6.valueDelta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a RECPAM (R+)</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{Math.abs(rt6.valueDelta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">RECPAM (R-)</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{Math.abs(rt6.valueDelta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Mercaderias (Ajuste RT6)</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{Math.abs(rt6.valueDelta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                                        *Asiento automatico RT6 — Mercaderias vs RECPAM.
                                    </p>
                                </div>
                            )}

                            {/* PREVIEW ASIENTO - Bonif/Descuentos */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'bonif_desc' && selectedPostMovement && postAdjustCalculations.neto > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-emerald-600 text-white flex items-center justify-center text-xs">
                                            <Robot size={14} weight="fill" />
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 uppercase">Vista Previa Contable</span>
                                    </div>

                                    <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 shadow-inner">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-700">
                                                    <th className="text-left pb-2 font-normal">Cuenta</th>
                                                    <th className="text-right pb-2 font-normal">Debe</th>
                                                    <th className="text-right pb-2 font-normal">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {postAdjust.applyOn === 'PURCHASE' ? (
                                                    postAdjust.kind === 'BONUS' ? (
                                                        <>
                                                            <tr>
                                                                <td className="py-1.5 text-white">Proveedores / Caja</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-slate-400">a Bonif. s/compras</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{postAdjustCalculations.neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                            {postAdjustCalculations.iva > 0 && (
                                                                <tr>
                                                                    <td className="py-1.5 pl-4 text-slate-400">a IVA CF (Reversion)</td>
                                                                    <td className="py-1.5 text-right">-</td>
                                                                    <td className="py-1.5 text-right text-white">{postAdjustCalculations.iva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <tr>
                                                                <td className="py-1.5 text-white">Proveedores / Caja</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-slate-400">a Desc. obtenidos</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        </>
                                                    )
                                                ) : (
                                                    postAdjust.kind === 'BONUS' ? (
                                                        <>
                                                            <tr>
                                                                <td className="py-1.5 text-white">Bonif. s/ventas</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{postAdjustCalculations.neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                            {postAdjustCalculations.iva > 0 && (
                                                                <tr>
                                                                    <td className="py-1.5 text-white">IVA DF (Reversion)</td>
                                                                    <td className="py-1.5 text-right text-emerald-400">{postAdjustCalculations.iva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="py-1.5 text-right">-</td>
                                                                </tr>
                                                            )}
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-slate-400">a Deudores / Caja</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <tr>
                                                                <td className="py-1.5 text-white">Desc. otorgados</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-slate-400">a Deudores / Caja</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{postAdjustCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        </>
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* PREVIEW ASIENTO */}
                            {(mainTab === 'compra' || mainTab === 'venta') && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center text-xs">
                                            <Robot size={14} weight="fill" />
                                        </div>
                                        <span className="text-xs font-bold text-blue-600 uppercase">Vista Previa Contable</span>
                                    </div>

                                    <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 shadow-inner relative overflow-hidden">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-700">
                                                    <th className="text-left pb-2 font-normal">Cuenta</th>
                                                    <th className="text-right pb-2 font-normal">Debe</th>
                                                    <th className="text-right pb-2 font-normal">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {mainTab === 'compra' && (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">Mercaderias (Activo)</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{(calculations.netoAfterBonif + calculations.gastosNetos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        {calculations.ivaTotal > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 text-white">IVA Credito Fiscal</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{calculations.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                        )}
                                                        {calculations.bonifAmount > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-purple-300">a Bonif. s/compras</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{calculations.bonifAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        )}
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Caja / Banco / Prov.</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{calculations.totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                        {calculations.descuentoFinAmount > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-purple-300">a Desc. Obtenidos (R+)</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{calculations.descuentoFinAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        )}
                                                    </>
                                                )}
                                                {mainTab === 'venta' && (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">Caja / Deudores (Activo)</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{calculations.totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        {calculations.descuentoFinAmount > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 text-purple-300">Desc. Otorgados (R-)</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{calculations.descuentoFinAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                        )}
                                                        {calculations.bonifAmount > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 text-purple-300">Bonif. s/ventas</td>
                                                                <td className="py-1.5 text-right text-emerald-400">{calculations.bonifAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                            </tr>
                                                        )}
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Ventas</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{calculations.netoAfterBonif.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                        {calculations.ivaTotal > 0 && (
                                                            <tr>
                                                                <td className="py-1.5 pl-4 text-slate-400">a IVA Debito Fiscal</td>
                                                                <td className="py-1.5 text-right">-</td>
                                                                <td className="py-1.5 text-right text-white">{calculations.ivaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        )}
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                                        *Calculo automatico segun imputaciones.
                                    </p>
                                </div>
                            )}

                            {/* PREVIEW ASIENTO - Devoluciones */}
                            {mainTab === 'ajuste' && ajusteSubTab === 'devoluciones' && selectedOriginalMovement && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-orange-500 text-white flex items-center justify-center text-xs">
                                            <Robot size={14} weight="fill" />
                                        </div>
                                        <span className="text-xs font-bold text-orange-500 uppercase">Vista Previa Contable</span>
                                    </div>

                                    <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 shadow-inner">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-700">
                                                    <th className="text-left pb-2 font-normal">Cuenta</th>
                                                    <th className="text-right pb-2 font-normal">Debe</th>
                                                    <th className="text-right pb-2 font-normal">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {devolucion.tipo === 'DEVOLUCION_COMPRA' ? (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">Proveedores / Caja</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{devolucionCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Devol. s/compras</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{devolucionCalculations.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a IVA CF (Reversion)</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{devolucionCalculations.iva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        <tr>
                                                            <td className="py-1.5 text-white">Devol. s/ventas</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{devolucionCalculations.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 text-white">IVA DF (Reversion)</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{devolucionCalculations.iva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Caja / Deudores</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{devolucionCalculations.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* FOOTER ACTIONS */}
                        <div className="p-6 border-t border-slate-200 bg-white shrink-0">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <span className="text-sm font-medium text-slate-900">Generar asiento contable</span>
                                    <p className="text-xs text-slate-500">Crea automaticamente el registro en Libro Diario.</p>
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
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-3 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                    className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white font-bold shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? (
                                        'Guardando...'
                                    ) : (
                                        <>
                                            <Check weight="bold" />
                                            <span>
                                                {mainTab === 'compra' ? 'Confirmar Compra' :
                                                 mainTab === 'venta' ? 'Confirmar Venta' :
                                                 'Confirmar Ajuste'}
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }

                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-scroll::-webkit-scrollbar-thumb { background-color: #CBD5E1; border-radius: 20px; }
            `}</style>
        </div>
    )
}
