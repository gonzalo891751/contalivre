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
    PaymentDirection,
} from '../../../core/inventario/types'

/** Round to 2 decimal places, handling floating point errors */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Convert final price (with IVA) to net price. If rate=0, final==net */
const netFromFinal = (final: number, rate: number): number => {
    if (rate <= 0) return final
    return round2(final / (1 + rate / 100))
}

/** Convert net price to final price (with IVA) */
const finalFromNet = (net: number, rate: number): number => {
    return round2(net * (1 + rate / 100))
}

/** Select all text on focus for numeric inputs (avoids "0 pegado" issue) */
const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.select(), 0)
}

/** Inline validation error message */
const FieldError = ({ msg }: { msg?: string }) => {
    if (!msg) return null
    return <p className="text-[11px] text-red-500 mt-0.5">{msg}</p>
}

import type { Account, JournalEntry } from '../../../core/models'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'
import AccountSearchSelectWithBalance, { usePendingDocuments, type PendingDocument } from '../../../ui/AccountSearchSelectWithBalance'
import { useLedgerBalances } from '../../../hooks/useLedgerBalances'

type MainTab = 'compra' | 'venta' | 'ajuste' | 'pagos'
type AjusteSubTab = 'devoluciones' | 'stock' | 'rt6' | 'bonif_desc'
type DevolucionTipo = 'DEVOLUCION_COMPRA' | 'DEVOLUCION_VENTA'
type PagoCobroMode = 'COBRO' | 'PAGO'

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
    /** Journal entries for balance calculation */
    entries?: JournalEntry[]
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
    entries,
}: MovementModalV3Props) {
    const isEditing = mode === 'edit'

    // Compute ledger balances for account selectors
    const { byAccount: ledgerBalances } = useLedgerBalances(entries, accounts)

    // Existing terceros (derived from child accounts under Proveedores/Acreedores/Deudores)
    const existingTerceros = useMemo(() => {
        if (!accounts || !ledgerBalances) return []
        const controlCodes = ['2.1.01.01', '2.1.06.01', '1.1.02.01'] // Proveedores, Acreedores, Deudores
        const controlAccounts = accounts.filter(a => controlCodes.includes(a.code))
        const controlIds = new Set(controlAccounts.map(a => a.id))
        const children = accounts.filter(a => a.parentId && controlIds.has(a.parentId) && !a.isHeader)
        const seen = new Set<string>()
        return children
            .map(a => {
                const bal = ledgerBalances.get(a.id)
                const normalizedName = a.name.toLowerCase().trim()
                if (seen.has(normalizedName)) return null
                seen.add(normalizedName)
                return { name: a.name, balance: bal?.balance || 0, accountId: a.id }
            })
            .filter(Boolean) as { name: string; balance: number; accountId: string }[]
    }, [accounts, ledgerBalances])

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
        // Payment condition (Proveedores/Acreedores)
        paymentCondition: '' as '' | 'CONTADO' | 'CTA_CTE' | 'DOCUMENTADO',
        termDays: 0,
        dueDate: '',
        instrumentType: '' as '' | 'PAGARE' | 'ECHEQ' | 'CHEQUE',
        instrumentNumber: '',
        instrumentBank: '',
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
    // Modo de ingreso de precio: NETO (sin IVA) o FINAL (con IVA incluido)
    // Útil cuando discriminarIVA=false (Monotributo/Exento) para evitar calcular neto a mano
    const [priceInputMode, setPriceInputMode] = useState<'NETO' | 'FINAL'>('NETO')

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
    // Taxes de devolución (copia proporcional del original, editable)
    const [devolucionTaxes, setDevolucionTaxes] = useState<TaxLine[]>([])
    // Modo contrapartida: 'NOTA_CREDITO' (default seguro a Deudores/Proveedores) o 'REEMBOLSO_EFECTIVO' (Caja/Banco)
    const [devolucionContraMode, setDevolucionContraMode] = useState<'NOTA_CREDITO' | 'REEMBOLSO_EFECTIVO'>('NOTA_CREDITO')

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

    // P2: Pagos/Cobros posteriores
    const [pagoCobroMode, setPagoCobroMode] = useState<PagoCobroMode>('COBRO')
    const [pagoCobro, setPagoCobro] = useState({
        tercero: '',
        originMovementId: '',
        amount: 0,
    })
    const [pagoCobroSplits, setPagoCobroSplits] = useState<PaymentSplit[]>([
        { id: 'pc-split-1', accountId: '', amount: 0 }
    ])
    // Retención en pagos/cobros
    const [pagoCobroRetencion, setPagoCobroRetencion] = useState({
        enabled: false,
        calcMode: 'PERCENT' as TaxCalcMode,
        rate: 100, // 100% = retención total del IVA
        base: 'IVA' as TaxCalcBase,
        taxType: 'IVA' as TaxType,
        amount: 0,
    })

    // Pending documents for payment/collection selection
    const allPendingDocs = usePendingDocuments(movements, movements, pagoCobroMode)

    // Filter pending docs by selected tercero (FASE 3B)
    const pendingDocs = useMemo(() => {
        if (!pagoCobro.tercero?.trim()) return allPendingDocs
        const normTercero = pagoCobro.tercero.toLowerCase().trim()
        return allPendingDocs.filter(d =>
            d.counterparty.toLowerCase().trim() === normTercero ||
            d.counterparty.toLowerCase().trim().includes(normTercero) ||
            normTercero.includes(d.counterparty.toLowerCase().trim())
        )
    }, [allPendingDocs, pagoCobro.tercero])

    // Selected pending document for payment/collection
    const selectedPendingDoc = useMemo<PendingDocument | null>(() => {
        if (!pagoCobro.originMovementId) return null
        return allPendingDocs.find(d => d.movementId === pagoCobro.originMovementId) || null
    }, [allPendingDocs, pagoCobro.originMovementId])

    // Override flags: prevent auto-overwriting user manual choices
    const [userOverrodePaymentCondition, setUserOverrodePaymentCondition] = useState(false)
    const [userOverrodeDueDate, setUserOverrodeDueDate] = useState(false)

    // Tercero combobox state
    const [showTerceroDropdown, setShowTerceroDropdown] = useState(false)
    const [showPagoTerceroDropdown, setShowPagoTerceroDropdown] = useState(false)

    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    // Tercero preview: saldo + pending docs for selected counterparty
    const terceroPreview = useMemo(() => {
        const name = mainTab === 'pagos' ? pagoCobro.tercero : formData.counterparty
        if (!name?.trim() || !movements) return null
        const normName = name.toLowerCase().trim()
        const tercero = existingTerceros.find(t => t.name.toLowerCase().trim() === normName)
        if (!tercero) return null

        const pending = (movements || [])
            .filter(m =>
                m.type === 'PURCHASE' && !m.isDevolucion && m.total > 0 &&
                m.counterparty?.toLowerCase().trim() === normName
            )
            .slice(0, 5)
            .map(m => {
                const paid = (movements || [])
                    .filter(p => p.type === 'PAYMENT' && p.sourceMovementId === m.id)
                    .reduce((s, p) => s + p.total, 0)
                const saldo = m.total - paid
                return saldo > 0.01 ? { ref: m.reference || m.id.slice(0, 8), date: m.date, dueDate: (m as any).dueDate, saldo } : null
            })
            .filter(Boolean) as { ref: string; date: string; dueDate?: string; saldo: number }[]

        return { balance: tercero.balance, pending }
    }, [mainTab, pagoCobro.tercero, formData.counterparty, existingTerceros, movements])

    // Filtered terceros for combobox dropdown
    const filteredTerceros = useMemo(() => {
        const query = mainTab === 'pagos' ? pagoCobro.tercero : formData.counterparty
        if (!query?.trim()) return existingTerceros
        const q = query.toLowerCase().trim()
        return existingTerceros.filter(t => t.name.toLowerCase().includes(q))
    }, [mainTab, pagoCobro.tercero, formData.counterparty, existingTerceros])

    // Sync pagoCobro amount when selecting a pending document
    useEffect(() => {
        if (!selectedPendingDoc) return
        setPagoCobro(prev => ({
            ...prev,
            amount: selectedPendingDoc.saldoPendiente,
            tercero: selectedPendingDoc.counterparty,
        }))
        // Pre-fill splits with default account (Caja)
        if (accounts && pagoCobroSplits.length === 1 && !pagoCobroSplits[0].accountId) {
            const cajaCode = '1.1.01.01'
            const cajaAcc = accounts.find(a => a.code === cajaCode)
            if (cajaAcc) {
                setPagoCobroSplits([{
                    id: 'pc-split-1',
                    accountId: cajaAcc.id,
                    amount: selectedPendingDoc.saldoPendiente,
                }])
            }
        }
    }, [selectedPendingDoc?.movementId])

    // Calculate retention amount for pagoCobro
    useEffect(() => {
        if (!pagoCobroRetencion.enabled || !selectedPendingDoc) return
        const ivaOriginal = selectedPendingDoc.ivaAmount || 0
        const saldoRatio = selectedPendingDoc.originalTotal > 0
            ? selectedPendingDoc.saldoPendiente / selectedPendingDoc.originalTotal
            : 1
        const ivaProporcional = ivaOriginal * saldoRatio
        const baseValue = pagoCobroRetencion.base === 'IVA' ? ivaProporcional : selectedPendingDoc.subtotal * saldoRatio
        const calculated = pagoCobroRetencion.calcMode === 'PERCENT'
            ? round2(baseValue * (pagoCobroRetencion.rate / 100))
            : pagoCobroRetencion.amount
        setPagoCobroRetencion(prev => ({ ...prev, amount: calculated }))
    }, [pagoCobroRetencion.enabled, pagoCobroRetencion.calcMode, pagoCobroRetencion.rate, pagoCobroRetencion.base, selectedPendingDoc?.movementId])

    // Auto-infer paymentCondition from selected split accounts (Compra AND Venta)
    useEffect(() => {
        if (userOverrodePaymentCondition || (mainTab !== 'compra' && mainTab !== 'venta') || formData.isSoloGasto) return
        if (!accounts || splits.length === 0) return

        const isVenta = mainTab === 'venta'

        // Compra side: Proveedores/Acreedores → CTA_CTE, Documentos a Pagar → DOCUMENTADO
        // Venta side: Deudores por Ventas → CTA_CTE, Documentos a Cobrar → DOCUMENTADO
        const ctaCteControlCodes = isVenta
            ? new Set(['1.1.02.01']) // Deudores por ventas
            : new Set(['2.1.01.01', '2.1.06.01']) // Proveedores, Acreedores
        const documentosControlCodes = isVenta
            ? new Set(['1.1.02.02', '1.1.02.03']) // Documentos a cobrar, Deudores con tarjeta
            : new Set(['2.1.01.02', '2.1.01.04', '2.1.01.05']) // Documentos/Valores a pagar
        const cajaControlCodes = new Set(['1.1.01.01', '1.1.01.02', '1.1.01.03', '1.1.01.04'])

        let hasCtaCte = false
        let hasDocumentos = false
        let hasCaja = false

        for (const split of splits) {
            if (!split.accountId) continue
            const acc = accounts.find(a => a.id === split.accountId)
            if (!acc) continue

            const code = acc.code
            if (ctaCteControlCodes.has(code)) hasCtaCte = true
            if (documentosControlCodes.has(code)) hasDocumentos = true
            if (cajaControlCodes.has(code)) hasCaja = true

            const parent = acc.parentId ? accounts.find(a => a.id === acc.parentId) : null
            if (parent) {
                if (ctaCteControlCodes.has(parent.code)) hasCtaCte = true
                if (documentosControlCodes.has(parent.code)) hasDocumentos = true
                if (cajaControlCodes.has(parent.code)) hasCaja = true
            }
        }

        let inferred: '' | 'CONTADO' | 'CTA_CTE' | 'DOCUMENTADO' = ''
        if (hasDocumentos) inferred = 'DOCUMENTADO'
        else if (hasCtaCte) inferred = 'CTA_CTE'
        else if (hasCaja && !hasCtaCte && !hasDocumentos) inferred = 'CONTADO'

        if (inferred && inferred !== formData.paymentCondition) {
            setFormData(prev => ({ ...prev, paymentCondition: inferred }))
        }
    }, [splits, accounts, mainTab, formData.isSoloGasto, userOverrodePaymentCondition])

    // Initialize from initialData
    useEffect(() => {
        if (!initialData) return

        let tab: MainTab = 'compra'
        if (initialData.type === 'SALE') tab = 'venta'
        else if (initialData.type === 'ADJUSTMENT' || initialData.type === 'VALUE_ADJUSTMENT') tab = 'ajuste'
        else if (initialData.type === 'PAYMENT') tab = 'pagos'

        setMainTab(tab)

        // Prefill payment direction and tercero for PAYMENT type (from deep-link)
        if (initialData.type === 'PAYMENT') {
            if (initialData.paymentDirection) {
                setPagoCobroMode(initialData.paymentDirection as PagoCobroMode)
            }
            // Prefill pagoCobro state for tercero and source movement
            setPagoCobro(prev => ({
                ...prev,
                tercero: initialData.counterparty || prev.tercero,
                originMovementId: initialData.sourceMovementId || prev.originMovementId,
            }))
        }

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
            // Payment condition fields
            paymentCondition: initialData.paymentCondition || prev.paymentCondition,
            termDays: initialData.termDays ?? prev.termDays,
            dueDate: initialData.dueDate || prev.dueDate,
            instrumentType: initialData.instrumentType || prev.instrumentType,
            instrumentNumber: initialData.instrumentNumber || prev.instrumentNumber,
            instrumentBank: initialData.instrumentBank || prev.instrumentBank,
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
        // Determinar el precio base según modo de entrada (NETO o FINAL)
        // Si priceInputMode=FINAL y es compra, el valor ingresado es precio final (con IVA)
        // y debemos calcular el neto para la base imponible
        let baseAmount = mainTab === 'venta' ? formData.unitPrice : formData.unitCost

        // Si modo FINAL en compras: el usuario ingresó precio final, derivamos el neto
        const usingFinalMode = mainTab === 'compra' && priceInputMode === 'FINAL'
        if (usingFinalMode && baseAmount > 0) {
            baseAmount = netFromFinal(baseAmount, formData.ivaRate)
        }

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
            // Costo unitario neto derivado (útil cuando modo=FINAL)
            derivedNetUnitCost: baseAmount,
        }
    }, [formData, mainTab, gastos, selectedValuation, taxes, priceInputMode])

    // Payment validation
    const splitTotals = useMemo(() => {
        const assigned = splits.reduce((sum, s) => sum + s.amount, 0)
        const remaining = calculations.totalFinal - assigned
        const percentage = calculations.totalFinal > 0 ? (assigned / calculations.totalFinal) * 100 : 0
        return { assigned, remaining, percentage }
    }, [splits, calculations.totalFinal])

    // Validation errors per tab (computed, not stored)
    const validationErrors = useMemo(() => {
        const errors: Record<string, string> = {}
        if (mainTab === 'compra' || mainTab === 'venta') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!formData.productId) errors.productId = 'Producto es obligatorio'
            if (!formData.isSoloGasto && formData.quantity <= 0) errors.quantity = 'Cantidad debe ser mayor a 0'
            if (mainTab === 'compra' && !formData.isSoloGasto && formData.unitCost <= 0) errors.unitCost = 'Costo unitario es obligatorio'
            if (mainTab === 'venta' && formData.unitPrice <= 0) errors.unitPrice = 'Precio de venta es obligatorio'
            if (!formData.counterparty?.trim()) errors.counterparty = mainTab === 'compra' ? 'Proveedor es obligatorio' : 'Cliente es obligatorio'
            if (!formData.paymentCondition) errors.paymentCondition = 'Condicion de pago es obligatoria'
            const validSplits = splits.filter(s => s.accountId && s.amount > 0)
            if (validSplits.length === 0) errors.splits = 'Asigna al menos una cuenta con importe'
            if (validSplits.length > 0 && Math.abs(splitTotals.remaining) > 1) errors.splitsBalance = 'Los importes no coinciden con el total'
        } else if (mainTab === 'ajuste' && ajusteSubTab === 'devoluciones') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!devolucion.productId) errors.productId = 'Producto es obligatorio'
            if (!devolucion.originalMovementId) errors.originalMovementId = 'Selecciona un movimiento a revertir'
            if (devolucion.cantidadDevolver <= 0) errors.cantidadDevolver = 'Cantidad debe ser mayor a 0'
        } else if (mainTab === 'ajuste' && ajusteSubTab === 'stock') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!stockAjuste.productId) errors.productId = 'Producto es obligatorio'
            if (stockAjuste.quantity <= 0) errors.quantity = 'Cantidad debe ser mayor a 0'
            if (stockAjuste.direction === 'IN' && stockAjuste.unitCost <= 0) errors.unitCost = 'Costo unitario es obligatorio para entrada'
        } else if (mainTab === 'ajuste' && ajusteSubTab === 'rt6') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!rt6.originMovementId) errors.originMovementId = 'Selecciona un movimiento de origen'
            if (!rt6.rt6Period.trim()) errors.rt6Period = 'Periodo RT6 es obligatorio'
            if (rt6.valueDelta === 0) errors.valueDelta = 'Delta de valor no puede ser 0'
        } else if (mainTab === 'ajuste' && ajusteSubTab === 'bonif_desc') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!postAdjust.originalMovementId) errors.originalMovementId = 'Selecciona un movimiento a ajustar'
            if (postAdjust.value <= 0) errors.value = 'Monto o porcentaje es obligatorio'
        } else if (mainTab === 'pagos') {
            if (!formData.date) errors.date = 'Fecha es obligatoria'
            if (!pagoCobro.tercero?.trim()) errors.tercero = pagoCobroMode === 'COBRO' ? 'Cliente es obligatorio' : 'Proveedor es obligatorio'
            if (pagoCobro.amount <= 0) errors.amount = 'Importe debe ser mayor a 0'
            const invalidSplit = pagoCobroSplits.find(s => !s.accountId || s.amount <= 0)
            if (invalidSplit) errors.pagoSplits = 'Completa todas las cuentas con importe'
            const pcSplitsTotal = pagoCobroSplits.reduce((s, sp) => s + sp.amount, 0)
            if (pagoCobro.amount > 0 && Math.abs(pagoCobro.amount - pcSplitsTotal) > 1) errors.pagoSplitsBalance = 'Los importes no coinciden con el total'
        }
        return errors
    }, [mainTab, ajusteSubTab, formData, splits, splitTotals.remaining, devolucion, stockAjuste, rt6, postAdjust, pagoCobro, pagoCobroSplits, pagoCobroMode])

    const hasValidationErrors = Object.keys(validationErrors).length > 0

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
                counterparty: m.counterparty || '',
                quantity: m.quantity,
                unitCost: m.unitCost || 0,
                unitPrice: m.unitPrice || 0,
                ivaRate: m.ivaRate,
                ivaAmount: m.ivaAmount || 0,
                subtotal: m.subtotal || 0,
                total: m.total,
                // Campos adicionales para calcular neto efectivo
                bonificacionPct: m.bonificacionPct || 0,
                bonificacionAmount: m.bonificacionAmount || 0,
                // Percepciones/impuestos adicionales del original
                taxes: m.taxes || [],
                // Splits de pago originales (para prorrateo opcional)
                paymentSplits: m.paymentSplits || [],
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

    // FASE 3A: Auto-infer tercero from devolución original movement
    useEffect(() => {
        if (!selectedOriginalMovement?.counterparty) return
        // Only auto-set if counterparty is empty (don't override manual entry)
        if (!formData.counterparty) {
            setFormData(prev => ({ ...prev, counterparty: selectedOriginalMovement.counterparty }))
        }
    }, [selectedOriginalMovement?.id])

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

    // Default contrapartida: Proveedores (compra) / Deudores por ventas (venta)
    useEffect(() => {
        if (isEditing || !accounts || splits.length === 0) return
        if (splits[0].accountId) return // user already selected or initialData prefilled
        const isVenta = mainTab === 'venta'
        const targetCode = isVenta ? '1.1.02.01' : '2.1.01.01' // Deudores / Proveedores
        const acc = accounts.find(a => a.code === targetCode)
        if (!acc) return
        setSplits(prev => prev.map((s, i) => (i === 0 ? { ...s, accountId: acc.id } : s)))
    }, [accounts, mainTab, isEditing])

    // Sincronizar taxes de devolución cuando cambia el movimiento original o la cantidad
    useEffect(() => {
        if (!selectedOriginalMovement) {
            setDevolucionTaxes([])
            return
        }
        const originTaxes = selectedOriginalMovement.taxes || []
        if (originTaxes.length === 0) {
            setDevolucionTaxes([])
            return
        }
        const originQty = selectedOriginalMovement.quantity
        const returnQty = devolucion.cantidadDevolver
        const ratio = originQty > 0 ? returnQty / originQty : 0

        // Calcular taxes proporcionales basados en el original
        const isCompra = devolucion.tipo === 'DEVOLUCION_COMPRA'
        const unitValueGross = isCompra ? selectedOriginalMovement.unitCost : selectedOriginalMovement.unitPrice
        const bonifPct = selectedOriginalMovement.bonificacionPct || 0
        const bonifAmount = selectedOriginalMovement.bonificacionAmount || 0
        const grossTotal = originQty * unitValueGross
        const netAfterBonif = grossTotal - (bonifAmount > 0 ? bonifAmount : grossTotal * (bonifPct / 100))
        const returnNeto = round2((netAfterBonif / originQty) * returnQty)
        const returnIva = round2(returnNeto * (selectedOriginalMovement.ivaRate / 100))

        const newTaxes: TaxLine[] = originTaxes
            .filter(t => t.kind === 'PERCEPCION' && t.amount > 0)
            .map((t, idx) => {
                let calculatedAmount: number
                if (t.calcMode === 'PERCENT' && t.rate && t.base) {
                    // Recalcular basado en la base original
                    const base = t.base === 'NETO' ? returnNeto : returnIva
                    calculatedAmount = round2(base * (t.rate / 100))
                } else {
                    // Prorratear por cantidad
                    calculatedAmount = round2(t.amount * ratio)
                }
                return {
                    ...t,
                    id: `devtax-${idx}-${Date.now()}`,
                    amount: calculatedAmount,
                }
            })
        setDevolucionTaxes(newTaxes)
    }, [selectedOriginalMovement?.id, devolucion.cantidadDevolver, devolucion.tipo])

    // Sincronizar splits de devolución según modo contrapartida
    useEffect(() => {
        if (!selectedOriginalMovement || !accounts) return

        const isCompra = devolucion.tipo === 'DEVOLUCION_COMPRA'
        const originQty = selectedOriginalMovement.quantity
        const returnQty = devolucion.cantidadDevolver
        const ratio = originQty > 0 ? returnQty / originQty : 0

        // Calcular total de devolución para contrapartida
        const unitValueGross = isCompra ? selectedOriginalMovement.unitCost : selectedOriginalMovement.unitPrice
        const bonifPct = selectedOriginalMovement.bonificacionPct || 0
        const bonifAmount = selectedOriginalMovement.bonificacionAmount || 0
        const grossTotal = originQty * unitValueGross
        const netAfterBonif = grossTotal - (bonifAmount > 0 ? bonifAmount : grossTotal * (bonifPct / 100))
        const returnNeto = round2((netAfterBonif / originQty) * returnQty)
        const returnIva = round2(returnNeto * (selectedOriginalMovement.ivaRate / 100))
        const originTaxes = selectedOriginalMovement.taxes || []
        const taxesTotal = originTaxes
            .filter(t => t.kind === 'PERCEPCION')
            .reduce((sum, t) => {
                if (t.calcMode === 'PERCENT' && t.rate && t.base) {
                    const base = t.base === 'NETO' ? returnNeto : returnIva
                    return sum + round2(base * (t.rate / 100))
                }
                return sum + round2((t.amount || 0) * ratio)
            }, 0)
        const totalDevolucion = round2(returnNeto + returnIva + taxesTotal)

        if (devolucionContraMode === 'NOTA_CREDITO') {
            // Modo seguro: contrapartida a Deudores (venta) o Proveedores (compra)
            // Genera Nota de Crédito/Débito sin movimiento de efectivo
            const targetCode = isCompra ? '2.1.01.01' : '1.1.02.01' // Proveedores / Deudores
            const acc = accounts.find(a => a.code === targetCode)
            if (acc) {
                setDevolucionSplits([{ id: 'dev-split-1', accountId: acc.id, amount: totalDevolucion }])
            }
        } else if (devolucionContraMode === 'REEMBOLSO_EFECTIVO') {
            // Reembolsar en Caja/Banco: permite edición manual de contrapartidas
            // Si el original tiene splits, prorratea; sino inicializa con Caja ARS
            const originSplits = selectedOriginalMovement.paymentSplits || []
            if (originSplits.length > 0) {
                const originTotal = originSplits.reduce((sum, s) => sum + s.amount, 0)
                const newSplits: PaymentSplit[] = originSplits.map((s, idx) => {
                    const splitRatio = originTotal > 0 ? s.amount / originTotal : 0
                    return {
                        id: `dev-split-${idx}`,
                        accountId: s.accountId,
                        amount: round2(totalDevolucion * splitRatio),
                    }
                })
                // Ajustar última línea para cerrar exacto
                const splitSum = newSplits.reduce((sum, s) => sum + s.amount, 0)
                const diff = round2(totalDevolucion - splitSum)
                if (Math.abs(diff) > 0 && newSplits.length > 0) {
                    newSplits[newSplits.length - 1].amount = round2(newSplits[newSplits.length - 1].amount + diff)
                }
                setDevolucionSplits(newSplits)
            } else {
                // Sin splits originales: inicializar con Caja ARS
                const cajaCode = '1.1.01.01' // Caja
                const cajaAcc = accounts.find(a => a.code === cajaCode)
                if (cajaAcc) {
                    setDevolucionSplits([{ id: 'dev-split-1', accountId: cajaAcc.id, amount: totalDevolucion }])
                } else {
                    // Fallback si no hay cuenta Caja
                    setDevolucionSplits([{ id: 'dev-split-1', accountId: '', amount: totalDevolucion }])
                }
            }
        }
    }, [selectedOriginalMovement?.id, devolucion.cantidadDevolver, devolucion.tipo, devolucionContraMode, accounts])

    // Return calculations - ahora considera bonificación y taxes
    const devolucionCalculations = useMemo(() => {
        if (!selectedOriginalMovement) {
            return { unitValue: 0, unitValueGross: 0, subtotal: 0, iva: 0, taxesTotal: 0, total: 0, ratio: 0 }
        }

        const isCompra = devolucion.tipo === 'DEVOLUCION_COMPRA'
        const originQty = selectedOriginalMovement.quantity
        const returnQty = devolucion.cantidadDevolver
        const ratio = originQty > 0 ? returnQty / originQty : 0

        // Precio unitario BRUTO (sin bonificación) del original
        const unitValueGross = isCompra
            ? selectedOriginalMovement.unitCost
            : selectedOriginalMovement.unitPrice

        // Calcular precio unitario NETO EFECTIVO (con bonificación aplicada)
        const bonifPct = selectedOriginalMovement.bonificacionPct || 0
        const bonifAmount = selectedOriginalMovement.bonificacionAmount || 0

        // Calcular neto efectivo: bruto - bonificación
        const grossTotal = originQty * unitValueGross
        const netAfterBonif = grossTotal - (bonifAmount > 0 ? bonifAmount : grossTotal * (bonifPct / 100))
        const unitValueNet = round2(netAfterBonif / originQty)

        // Subtotal de devolución = qty devolver * precio unitario neto efectivo
        const subtotal = round2(returnQty * unitValueNet)

        // IVA proporcional: recalcular usando la alícuota original sobre el neto
        const iva = round2(subtotal * (selectedOriginalMovement.ivaRate / 100))

        // Taxes proporcionales (usar devolucionTaxes editables si hay, sino calcular)
        const taxesTotal = round2(devolucionTaxes.reduce((sum, t) => sum + (t.amount || 0), 0))

        // Total devolución = subtotal + iva + taxes
        const total = round2(subtotal + iva + taxesTotal)

        return { unitValue: unitValueNet, unitValueGross, subtotal, iva, taxesTotal, total, ratio }
    }, [selectedOriginalMovement, devolucion, devolucionTaxes])

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

    const handleAutoFillSplit = (targetSplitId?: string) => {
        if (targetSplitId) {
            // Fill specific row with remaining (Total - sum of OTHER rows)
            const otherSum = splits.filter(s => s.id !== targetSplitId).reduce((sum, s) => sum + s.amount, 0)
            const remaining = Math.max(0, round2(calculations.totalFinal - otherSum))
            handleSplitChange(targetSplitId, 'amount', remaining)
        } else {
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
    }

    // Tax/Perception handlers
    const handleAddTax = () => {
        setTaxes(prev => [
            ...prev,
            {
                id: `tax-${Date.now()}`,
                kind: 'PERCEPCION' as TaxLineKind,
                taxType: 'IVA' as TaxType,
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
        setSubmitted(true)

        // Check validation errors and scroll to first one
        if (hasValidationErrors) {
            const firstKey = Object.keys(validationErrors)[0]
            const el = document.querySelector(`[data-field="${firstKey}"]`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                const input = el.querySelector('input,select') as HTMLElement
                if (input) setTimeout(() => input.focus(), 300)
            }
            return
        }

        // P2: Pagos/Cobros
        if (mainTab === 'pagos') {
            if (pagoCobro.amount <= 0) {
                setError('El importe debe ser mayor a 0')
                return
            }
            const invalidSplit = pagoCobroSplits.find(s => !s.accountId || s.amount <= 0)
            if (invalidSplit) {
                setError('Completa todas las cuentas con importe mayor a 0')
                return
            }
            const splitsTotal = pagoCobroSplits.reduce((s, sp) => s + sp.amount, 0)
            if (Math.abs(pagoCobro.amount - splitsTotal) > 1) {
                setError(`El total asignado no coincide. Diferencia: ${formatCurrency(pagoCobro.amount - splitsTotal)}`)
                return
            }

            setIsSaving(true)
            try {
                await onSave({
                    type: 'PAYMENT',
                    paymentDirection: pagoCobroMode as PaymentDirection,
                    productId: '', // No afecta producto específico
                    date: formData.date,
                    quantity: 0, // No afecta stock
                    periodId,
                    ivaRate: 0,
                    ivaAmount: 0,
                    subtotal: pagoCobro.amount,
                    total: pagoCobro.amount,
                    costMethod,
                    counterparty: pagoCobro.tercero || undefined,
                    paymentMethod: 'MIXTO',
                    paymentSplits: pagoCobroSplits.map(s => ({ accountId: s.accountId, amount: s.amount, method: pagoCobroMode })),
                    notes: formData.notes || undefined,
                    reference: formData.reference || undefined,
                    autoJournal: formData.autoJournal,
                    sourceMovementId: pagoCobro.originMovementId || undefined,
                })
                onClose()
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al guardar')
                setIsSaving(false)
            }
            return
        }

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
                    // Incluir taxes de devolución para reversión en asientos
                    taxes: devolucionTaxes.length > 0 ? devolucionTaxes : undefined,
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

            // Usar costo neto derivado si estamos en modo FINAL
            const effectiveUnitCost = mainTab === 'compra'
                ? (priceInputMode === 'FINAL' ? calculations.derivedNetUnitCost : formData.unitCost)
                : undefined

            // Consumidor Final: if SALE with no counterparty, use generic tercero
            const effectiveCounterparty = formData.counterparty?.trim()
                || (mainTab === 'venta' ? 'Consumidor Final' : undefined)

            await onSave({
                type: movementType,
                productId: formData.productId,
                date: formData.date,
                quantity: formData.isSoloGasto ? 0 : formData.quantity,
                periodId,
                unitCost: effectiveUnitCost,
                unitPrice: mainTab === 'venta' ? formData.unitPrice : undefined,
                ivaRate: formData.ivaRate,
                ivaAmount: calculations.ivaTotal,
                subtotal: calculations.netoAfterBonif,
                total: calculations.totalFinal,
                costMethod,
                counterparty: effectiveCounterparty,
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
                // Payment condition & maturity (Proveedores/Acreedores)
                paymentCondition: formData.paymentCondition || undefined,
                termDays: formData.termDays || undefined,
                dueDate: formData.dueDate || undefined,
                instrumentType: formData.instrumentType || undefined,
                instrumentNumber: formData.instrumentNumber || undefined,
                instrumentBank: formData.instrumentBank || undefined,
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
        const colors: Record<MainTab, string> = {
            compra: 'text-blue-600',
            venta: 'text-emerald-600',
            ajuste: 'text-orange-500',
            pagos: 'text-violet-600',
        }
        return isActive
            ? `px-6 py-2 rounded-md text-sm font-semibold bg-white ${colors[tab]} shadow-sm border border-slate-200 transition-all flex items-center gap-2`
            : 'px-6 py-2 rounded-md text-sm font-medium text-slate-500 hover:text-slate-700 transition-all flex items-center gap-2 opacity-70 hover:opacity-100'
    }

    // Header config based on mode
    const headerConfig: Record<MainTab, { title: string; subtitle: string; icon: typeof ShoppingCart; iconBg: string; iconColor: string }> = {
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
        pagos: {
            title: pagoCobroMode === 'COBRO' ? 'Registrar Cobro' : 'Registrar Pago',
            subtitle: 'Cuentas Corrientes',
            icon: HandCoins,
            iconBg: 'bg-violet-50',
            iconColor: 'text-violet-600',
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
                        <button
                            type="button"
                            onClick={() => setMainTab('pagos')}
                            className={getTabClasses('pagos')}
                        >
                            <HandCoins size={16} weight="bold" /> Pagos
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
                                        <ArrowUUpLeft size={16} weight="duotone" className="text-orange-500" /> Movimiento Original a Revertir <span className="text-red-400">*</span>
                                    </h3>
                                    <div className="relative" data-field="originalMovementId">
                                        <MagnifyingGlass className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                        <select
                                            value={devolucion.originalMovementId}
                                            onChange={(e) => setDevolucion(prev => ({ ...prev, originalMovementId: e.target.value }))}
                                            className={`w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none ${submitted && validationErrors.originalMovementId ? 'border-red-300' : 'border-slate-300'}`}
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
                                    {submitted && <FieldError msg={validationErrors.originalMovementId} />}
                                </section>

                                {/* Bloque: Traído del comprobante original */}
                                {selectedOriginalMovement && (
                                    <section className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                                        <h4 className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Info size={14} /> Traído del Comprobante Original
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <span className="text-slate-500 block">
                                                    {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Costo Unit. Bruto' : 'Precio Unit. Bruto'}
                                                </span>
                                                <span className="font-mono font-semibold text-slate-700">{formatCurrency(devolucionCalculations.unitValueGross)}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Alícuota IVA</span>
                                                <span className="font-mono font-semibold text-slate-700">{selectedOriginalMovement.ivaRate}%</span>
                                            </div>
                                            {selectedOriginalMovement.bonificacionPct > 0 && (
                                                <div>
                                                    <span className="text-slate-500 block">Bonificación</span>
                                                    <span className="font-mono font-semibold text-orange-600">-{selectedOriginalMovement.bonificacionPct}%</span>
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-slate-500 block">
                                                    {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Costo Neto Efectivo' : 'Precio Neto Efectivo'}
                                                </span>
                                                <span className="font-mono font-bold text-orange-700">{formatCurrency(devolucionCalculations.unitValue)}</span>
                                            </div>
                                        </div>
                                        {selectedOriginalMovement.taxes && selectedOriginalMovement.taxes.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-orange-200">
                                                <span className="text-slate-500 text-[10px] uppercase">Percepciones del original:</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {selectedOriginalMovement.taxes.map((t, i) => (
                                                        <span key={i} className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded">
                                                            {t.taxType}: {formatCurrency(t.amount)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-orange-600 mt-2 italic">
                                            Los valores se heredan automáticamente. Puedes ajustar la cantidad y percepciones a revertir abajo.
                                        </p>
                                    </section>
                                )}

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
                                                    inputMode="numeric"
                                                    value={devolucion.cantidadDevolver || ''}
                                                    onChange={(e) => setDevolucion(prev => ({ ...prev, cantidadDevolver: Number(e.target.value) }))}
                                                    onFocus={selectOnFocus}
                                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-orange-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                    {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Costo Unitario Neto' : 'Precio Unitario Neto'}
                                                </label>
                                                <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-right text-slate-500">
                                                    {formatCurrency(devolucionCalculations.unitValue)}
                                                </div>
                                                {selectedOriginalMovement.bonificacionPct > 0 && (
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        (Con bonif. {selectedOriginalMovement.bonificacionPct}% ya aplicada)
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {/* Impuestos adicionales de devolución */}
                                {selectedOriginalMovement && devolucionTaxes.length > 0 && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
                                            <Receipt size={16} weight="duotone" className="text-orange-500" /> Impuestos a Revertir
                                        </h3>
                                        <p className="text-xs text-slate-500 mb-3">
                                            Percepciones del comprobante original (proporcionales a la cantidad devuelta)
                                        </p>
                                        <div className="space-y-2">
                                            {devolucionTaxes.map((tax, idx) => (
                                                <div key={tax.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <div className="flex-1 text-sm text-slate-600">
                                                        <span className="font-medium">{tax.kind === 'PERCEPCION' ? 'Percepción' : tax.kind}</span>
                                                        <span className="text-slate-400 ml-1">({tax.taxType})</span>
                                                        {tax.calcMode === 'PERCENT' && tax.rate && (
                                                            <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-1 py-0.5 rounded">
                                                                {tax.rate}% s/{tax.base}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        inputMode="decimal"
                                                        value={tax.amount || ''}
                                                        onChange={(e) => {
                                                            const newAmount = Number(e.target.value)
                                                            setDevolucionTaxes(prev => prev.map((t, i) =>
                                                                i === idx ? { ...t, amount: round2(newAmount) } : t
                                                            ))
                                                        }}
                                                        onFocus={selectOnFocus}
                                                        className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none focus:ring-1 focus:ring-orange-500"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-sm">
                                            <span className="text-slate-500">Total impuestos a revertir</span>
                                            <span className="font-mono font-semibold text-orange-600">{formatCurrency(devolucionCalculations.taxesTotal)}</span>
                                        </div>
                                    </section>
                                )}

                                {/* Contrapartida Devolucion */}
                                {selectedOriginalMovement && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
                                            <ArrowsLeftRight size={16} weight="duotone" className="text-orange-500" /> Contrapartida
                                        </h3>

                                        {/* Selector de modo contrapartida */}
                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                            <button
                                                type="button"
                                                onClick={() => setDevolucionContraMode('NOTA_CREDITO')}
                                                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                                                    devolucionContraMode === 'NOTA_CREDITO'
                                                        ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                                                }`}
                                            >
                                                Nota de {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Debito' : 'Credito'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDevolucionContraMode('REEMBOLSO_EFECTIVO')}
                                                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                                                    devolucionContraMode === 'REEMBOLSO_EFECTIVO'
                                                        ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'
                                                }`}
                                            >
                                                Reembolsar Caja/Banco
                                            </button>
                                        </div>

                                        {/* Info modo seleccionado */}
                                        {devolucionContraMode === 'NOTA_CREDITO' && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                                                <div className="flex items-start gap-2">
                                                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <strong>Contrapartida: {devolucion.tipo === 'DEVOLUCION_COMPRA' ? 'Proveedores' : 'Deudores por ventas'}.</strong>{' '}
                                                        El importe queda como saldo a favor sin movimiento de efectivo.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {devolucionContraMode === 'REEMBOLSO_EFECTIVO' && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
                                                <div className="flex items-start gap-2">
                                                    <Warning size={14} className="mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <strong>Reembolso en efectivo/banco.</strong>{' '}
                                                        Podes agregar retenciones como lineas adicionales. Edita las contrapartidas segun corresponda.
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {devolucionSplits.map((split) => (
                                                <div key={split.id} className="flex gap-2 items-center">
                                                    <div className="flex-1">
                                                        <AccountSearchSelectWithBalance
                                                            accounts={accounts || []}
                                                            value={split.accountId}
                                                            onChange={(val) => handleDevolucionSplitChange(split.id, 'accountId', val)}
                                                            placeholder="Buscar cuenta..."
                                                            inputClassName="h-[38px] text-xs px-2 py-1.5"
                                                            balances={ledgerBalances}
                                                            showBalance={true}
                                                        />
                                                    </div>
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={split.amount || ''}
                                                        onChange={(e) => handleDevolucionSplitChange(split.id, 'amount', Number(e.target.value))}
                                                        onFocus={selectOnFocus}
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
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad <span className="text-red-400">*</span></label>
                                            <input
                                                type="number"
                                                min="1"
                                                inputMode="numeric"
                                                value={stockAjuste.quantity || ''}
                                                onChange={(e) => setStockAjuste(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                                onFocus={selectOnFocus}
                                                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none ${submitted && validationErrors.quantity ? 'border-red-300' : 'border-slate-300'}`}
                                            />
                                            {submitted && <FieldError msg={validationErrors.quantity} />}
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
                                                        inputMode="decimal"
                                                        value={stockAjuste.unitCost || ''}
                                                        onChange={(e) => setStockAjuste(prev => ({ ...prev, unitCost: Number(e.target.value) }))}
                                                        onFocus={selectOnFocus}
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
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Periodo RT6 <span className="text-red-400">*</span></label>
                                            <input
                                                type="text"
                                                value={rt6.rt6Period}
                                                onChange={(e) => setRt6(prev => ({ ...prev, rt6Period: e.target.value }))}
                                                placeholder="Ej: 2024-12, Q4-2024"
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Delta de Valor ($) <span className="text-red-400">*</span></label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={rt6.valueDelta || ''}
                                                    onChange={(e) => setRt6(prev => ({ ...prev, valueDelta: Number(e.target.value) }))}
                                                    onFocus={selectOnFocus}
                                                    inputMode="decimal"
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
                                                    onFocus={selectOnFocus}
                                                    inputMode="decimal"
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
                                                        inputMode="decimal"
                                                        value={split.amount || ''}
                                                        onChange={(e) => handlePostSplitChange(split.id, 'amount', Number(e.target.value))}
                                                        onFocus={selectOnFocus}
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

                        {/* P2: PAGOS/COBROS FORM */}
                        {mainTab === 'pagos' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* Selector Cobro/Pago */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <HandCoins size={16} weight="duotone" className="text-violet-500" /> Tipo de Operacion
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPagoCobroMode('COBRO')}
                                            className={`py-3 text-sm font-semibold rounded-lg border transition-all flex items-center justify-center gap-2 ${
                                                pagoCobroMode === 'COBRO'
                                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                                            }`}
                                        >
                                            <ArrowDownLeft size={18} weight="bold" /> Cobro (Cliente)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPagoCobroMode('PAGO')}
                                            className={`py-3 text-sm font-semibold rounded-lg border transition-all flex items-center justify-center gap-2 ${
                                                pagoCobroMode === 'PAGO'
                                                    ? 'bg-rose-100 text-rose-700 border-rose-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-rose-300'
                                            }`}
                                        >
                                            <ArrowUpRight size={18} weight="bold" /> Pago (Proveedor)
                                        </button>
                                    </div>
                                </section>

                                {/* Selector de Comprobante Pendiente */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Files size={16} weight="duotone" className="text-violet-500" />
                                        Comprobante a Cancelar
                                    </h3>
                                    <p className="text-xs text-slate-500 mb-3">
                                        Selecciona el comprobante pendiente de {pagoCobroMode === 'COBRO' ? 'cobro' : 'pago'}, o deja vacío para registrar sin vincular.
                                    </p>
                                    <select
                                        value={pagoCobro.originMovementId}
                                        onChange={(e) => {
                                            setPagoCobro(prev => ({ ...prev, originMovementId: e.target.value }))
                                            // Reset retention when changing document
                                            setPagoCobroRetencion(prev => ({ ...prev, enabled: false, amount: 0 }))
                                        }}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                                    >
                                        <option value="">— Sin vincular comprobante —</option>
                                        {pendingDocs.map(doc => (
                                            <option key={doc.movementId} value={doc.movementId}>
                                                {doc.date} | {doc.reference} | {doc.counterparty} | Saldo: {formatCurrency(doc.saldoPendiente)}
                                            </option>
                                        ))}
                                    </select>
                                    {pendingDocs.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-2 italic">
                                            No hay comprobantes pendientes de {pagoCobroMode === 'COBRO' ? 'cobro' : 'pago'}.
                                        </p>
                                    )}
                                </section>

                                {/* Resumen del Comprobante Original */}
                                {selectedPendingDoc && (
                                    <section className="bg-violet-50 border border-violet-200 p-4 rounded-xl">
                                        <h4 className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Info size={14} /> Datos del Comprobante Original
                                        </h4>
                                        <div className="grid grid-cols-3 gap-3 text-xs">
                                            <div>
                                                <span className="text-slate-500 block">Neto</span>
                                                <span className="font-mono font-semibold text-slate-700">{formatCurrency(selectedPendingDoc.subtotal)}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">IVA</span>
                                                <span className="font-mono font-semibold text-slate-700">{formatCurrency(selectedPendingDoc.ivaAmount)}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Total Original</span>
                                                <span className="font-mono font-semibold text-slate-700">{formatCurrency(selectedPendingDoc.originalTotal)}</span>
                                            </div>
                                        </div>
                                        {selectedPendingDoc.taxes && selectedPendingDoc.taxes.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-violet-200">
                                                <span className="text-slate-500 text-[10px] uppercase">Percepciones del original:</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {selectedPendingDoc.taxes.map((t, i) => (
                                                        <span key={i} className="bg-violet-100 text-violet-700 text-[10px] px-2 py-0.5 rounded">
                                                            {t.taxType}: {formatCurrency(t.amount)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="mt-3 pt-2 border-t border-violet-200 flex justify-between items-center">
                                            <span className="text-violet-700 font-semibold text-sm">Saldo Pendiente</span>
                                            <span className="font-mono font-bold text-violet-800 text-lg">{formatCurrency(selectedPendingDoc.saldoPendiente)}</span>
                                        </div>
                                    </section>
                                )}

                                {/* Fecha y Tercero */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Receipt size={16} weight="duotone" className="text-violet-500" /> Datos del {pagoCobroMode === 'COBRO' ? 'Cobro' : 'Pago'}
                                    </h3>
                                    <div className="grid grid-cols-12 gap-4">
                                        <div className="col-span-4">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                                            />
                                        </div>
                                        <div className="col-span-8 relative" data-field="tercero">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                {pagoCobroMode === 'COBRO' ? 'Cliente' : 'Proveedor'} <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={pagoCobro.tercero}
                                                onChange={(e) => {
                                                    setPagoCobro(prev => ({ ...prev, tercero: e.target.value }))
                                                    setShowPagoTerceroDropdown(true)
                                                }}
                                                onFocus={() => setShowPagoTerceroDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowPagoTerceroDropdown(false), 200)}
                                                placeholder={pagoCobroMode === 'COBRO' ? 'Buscar o crear cliente...' : 'Buscar o crear proveedor...'}
                                                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500 ${submitted && validationErrors.tercero ? 'border-red-300' : 'border-slate-300'}`}
                                                autoComplete="off"
                                            />
                                            {showPagoTerceroDropdown && filteredTerceros.length > 0 && (
                                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                                    {filteredTerceros.map(t => (
                                                        <button
                                                            key={t.accountId}
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault()
                                                                setPagoCobro(prev => ({ ...prev, tercero: t.name }))
                                                                setShowPagoTerceroDropdown(false)
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 flex justify-between items-center"
                                                        >
                                                            <span className="font-medium text-slate-700">{t.name}</span>
                                                            <span className={`font-mono text-xs ${t.balance > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                {t.balance !== 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.balance) : ''}
                                                            </span>
                                                        </button>
                                                    ))}
                                                    {pagoCobro.tercero.trim() && !filteredTerceros.some(t => t.name.toLowerCase() === pagoCobro.tercero.toLowerCase().trim()) && (
                                                        <div className="px-3 py-2 text-xs text-violet-600 border-t border-slate-100">
                                                            <Plus size={12} weight="bold" className="inline mr-1" />
                                                            Crear nuevo: &quot;{pagoCobro.tercero.trim()}&quot;
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {/* Mini-panel: tercero saldo + pendientes */}
                                            {terceroPreview && mainTab === 'pagos' && (
                                                <div className="mt-2 p-2.5 bg-violet-50 border border-violet-200 rounded-lg text-xs">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-semibold text-violet-700">Saldo actual</span>
                                                        <span className={`font-mono font-bold ${terceroPreview.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(terceroPreview.balance)}
                                                        </span>
                                                    </div>
                                                    {terceroPreview.pending.length > 0 && (
                                                        <div className="mt-1.5 pt-1.5 border-t border-violet-200 space-y-1">
                                                            <span className="text-[10px] uppercase font-bold text-violet-500">Pendientes</span>
                                                            {terceroPreview.pending.map((p, i) => (
                                                                <div key={i} className="flex justify-between text-violet-700">
                                                                    <span>{p.ref} ({p.date}){p.dueDate ? ` → Vto: ${p.dueDate}` : ''}</span>
                                                                    <span className="font-mono">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.saldo)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {submitted && <FieldError msg={validationErrors.tercero} />}
                                        </div>
                                    </div>
                                    <div className="mt-4" data-field="amount">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Importe a {pagoCobroMode === 'COBRO' ? 'Cobrar' : 'Pagar'} <span className="text-red-400">*</span>
                                            {selectedPendingDoc && (
                                                <span className="text-slate-400 font-normal ml-2">(máx: {formatCurrency(selectedPendingDoc.saldoPendiente)})</span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max={selectedPendingDoc?.saldoPendiente || undefined}
                                            step="0.01"
                                            inputMode="decimal"
                                            value={pagoCobro.amount || ''}
                                            onChange={(e) => {
                                                const val = Number(e.target.value)
                                                const max = selectedPendingDoc?.saldoPendiente
                                                setPagoCobro(prev => ({ ...prev, amount: max && val > max ? max : val }))
                                            }}
                                            onFocus={selectOnFocus}
                                            placeholder="0.00"
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-right outline-none focus:ring-1 focus:ring-violet-500"
                                        />
                                        {submitted && <FieldError msg={validationErrors.amount} />}
                                    </div>
                                </section>

                                {/* Panel de Retención */}
                                {selectedPendingDoc && (
                                    <section className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
                                                <Percent size={14} />
                                                {pagoCobroMode === 'COBRO' ? 'Retención Sufrida' : 'Retención a Depositar'}
                                            </h4>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <span className="text-xs text-amber-700">Aplicar</span>
                                                <input
                                                    type="checkbox"
                                                    checked={pagoCobroRetencion.enabled}
                                                    onChange={(e) => setPagoCobroRetencion(prev => ({ ...prev, enabled: e.target.checked }))}
                                                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                                                />
                                            </label>
                                        </div>
                                        {pagoCobroRetencion.enabled && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-amber-600 uppercase font-semibold block mb-1">Modo</label>
                                                        <select
                                                            value={pagoCobroRetencion.calcMode}
                                                            onChange={(e) => setPagoCobroRetencion(prev => ({ ...prev, calcMode: e.target.value as TaxCalcMode }))}
                                                            className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white"
                                                        >
                                                            <option value="PERCENT">Porcentaje</option>
                                                            <option value="AMOUNT">Monto Fijo</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-amber-600 uppercase font-semibold block mb-1">Base</label>
                                                        <select
                                                            value={pagoCobroRetencion.base}
                                                            onChange={(e) => setPagoCobroRetencion(prev => ({ ...prev, base: e.target.value as TaxCalcBase }))}
                                                            className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white"
                                                            disabled={pagoCobroRetencion.calcMode === 'AMOUNT'}
                                                        >
                                                            <option value="IVA">IVA</option>
                                                            <option value="NETO">Neto</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-amber-600 uppercase font-semibold block mb-1">
                                                            {pagoCobroRetencion.calcMode === 'PERCENT' ? 'Tasa %' : 'Monto'}
                                                        </label>
                                                        {pagoCobroRetencion.calcMode === 'PERCENT' ? (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="0.1"
                                                                inputMode="decimal"
                                                                value={pagoCobroRetencion.rate || ''}
                                                                onChange={(e) => setPagoCobroRetencion(prev => ({ ...prev, rate: Number(e.target.value) }))}
                                                                onFocus={selectOnFocus}
                                                                className="w-full border border-amber-300 rounded px-2 py-1 text-xs font-mono text-right bg-white"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                inputMode="decimal"
                                                                value={pagoCobroRetencion.amount || ''}
                                                                onChange={(e) => setPagoCobroRetencion(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                                                onFocus={selectOnFocus}
                                                                className="w-full border border-amber-300 rounded px-2 py-1 text-xs font-mono text-right bg-white"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-amber-200">
                                                    <span className="text-xs text-amber-700">Retención calculada:</span>
                                                    <span className="font-mono font-bold text-amber-800">{formatCurrency(pagoCobroRetencion.amount)}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // Add retention as a split
                                                        const retencionAccountCode = pagoCobroMode === 'COBRO' ? '1.1.03.07' : '2.1.03.03'
                                                        const retencionAcc = accounts?.find(a => a.code === retencionAccountCode)
                                                        if (retencionAcc && pagoCobroRetencion.amount > 0) {
                                                            const existingRetIdx = pagoCobroSplits.findIndex(s => s.accountId === retencionAcc.id)
                                                            if (existingRetIdx >= 0) {
                                                                // Update existing
                                                                setPagoCobroSplits(prev => prev.map((s, i) =>
                                                                    i === existingRetIdx ? { ...s, amount: pagoCobroRetencion.amount } : s
                                                                ))
                                                            } else {
                                                                // Add new
                                                                setPagoCobroSplits(prev => [...prev, {
                                                                    id: `pc-split-ret-${Date.now()}`,
                                                                    accountId: retencionAcc.id,
                                                                    amount: pagoCobroRetencion.amount,
                                                                }])
                                                            }
                                                        }
                                                    }}
                                                    className="w-full bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-amber-700 transition-colors"
                                                >
                                                    Agregar Retención a las Formas de {pagoCobroMode === 'COBRO' ? 'Cobro' : 'Pago'}
                                                </button>
                                            </div>
                                        )}
                                    </section>
                                )}

                                {/* Formas de Cobro/Pago */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Wallet size={16} weight="duotone" className="text-violet-500" />
                                        {pagoCobroMode === 'COBRO' ? 'Formas de Cobro' : 'Formas de Pago'}
                                    </h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        {pagoCobroMode === 'COBRO'
                                            ? 'Agrega Caja, Banco, o retenciones sufridas (a favor)'
                                            : 'Agrega Caja, Banco, o retenciones practicadas (a depositar)'}
                                    </p>
                                    <div className="space-y-2">
                                        {pagoCobroSplits.map((split) => (
                                            <div key={split.id} className="flex gap-2 items-center">
                                                <div className="flex-1">
                                                    <AccountSearchSelectWithBalance
                                                        accounts={accounts || []}
                                                        value={split.accountId}
                                                        onChange={(val) => {
                                                            setPagoCobroSplits(prev => prev.map(s =>
                                                                s.id === split.id ? { ...s, accountId: val } : s
                                                            ))
                                                        }}
                                                        placeholder="Buscar cuenta..."
                                                        inputClassName="h-[38px] text-xs px-2 py-1.5"
                                                        balances={ledgerBalances}
                                                        showBalance={true}
                                                    />
                                                </div>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={split.amount || ''}
                                                    onChange={(e) => {
                                                        setPagoCobroSplits(prev => prev.map(s =>
                                                            s.id === split.id ? { ...s, amount: Number(e.target.value) } : s
                                                        ))
                                                    }}
                                                    onFocus={selectOnFocus}
                                                    className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-right outline-none focus:ring-1 focus:ring-violet-500 h-[38px]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setPagoCobroSplits(prev => prev.filter(s => s.id !== split.id))}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {submitted && <FieldError msg={validationErrors.pagoSplits || validationErrors.pagoSplitsBalance} />}
                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100" data-field="pagoSplits">
                                        <button
                                            type="button"
                                            onClick={() => setPagoCobroSplits(prev => [
                                                ...prev,
                                                { id: `pc-split-${Date.now()}`, accountId: '', amount: 0 }
                                            ])}
                                            className="text-violet-600 text-xs font-semibold flex items-center gap-1 hover:bg-violet-50 px-2 py-1 rounded transition-colors"
                                        >
                                            <Plus weight="bold" /> Agregar cuenta
                                        </button>
                                        <div className="text-right">
                                            <div className="text-[10px] uppercase font-bold text-slate-400">Restante</div>
                                            <div className={`font-mono font-bold text-sm ${Math.abs(pagoCobro.amount - pagoCobroSplits.reduce((s, sp) => s + sp.amount, 0)) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatCurrency(pagoCobro.amount - pagoCobroSplits.reduce((s, sp) => s + sp.amount, 0))}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Referencia / Notas */}
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Referencia</label>
                                            <input
                                                type="text"
                                                value={formData.reference}
                                                onChange={(e) => handleChange('reference', e.target.value)}
                                                placeholder="Ej: Recibo #001"
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Notas</label>
                                            <input
                                                type="text"
                                                value={formData.notes}
                                                onChange={(e) => handleChange('notes', e.target.value)}
                                                placeholder="Observaciones..."
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500"
                                            />
                                        </div>
                                    </div>
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
                                        <div className="col-span-4" data-field="date">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                <CalendarBlank size={12} weight="bold" className="inline mr-1" />Fecha <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${submitted && validationErrors.date ? 'border-red-300' : 'border-slate-300'}`}
                                            />
                                            {submitted && <FieldError msg={validationErrors.date} />}
                                        </div>
                                        <div className="col-span-8" /> {/* spacer */}

                                        <div className="col-span-12" data-field="productId">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Bien de Cambio / Item <span className="text-red-400">*</span></label>
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
                                                <div className="col-span-4" data-field="quantity">
                                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad <span className="text-red-400">*</span></label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        inputMode="numeric"
                                                        value={formData.quantity || ''}
                                                        onChange={(e) => handleChange('quantity', Number(e.target.value))}
                                                        onFocus={selectOnFocus}
                                                        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none ${submitted && validationErrors.quantity ? 'border-red-300' : 'border-slate-300'}`}
                                                    />
                                                    {submitted && <FieldError msg={validationErrors.quantity} />}
                                                </div>

                                                <div className="col-span-4" data-field={mainTab === 'venta' ? 'unitPrice' : 'unitCost'}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="text-xs font-semibold text-slate-700">
                                                            {mainTab === 'venta'
                                                                ? 'Precio Venta (Neto)'
                                                                : (priceInputMode === 'FINAL' ? 'Costo c/IVA (Final)' : 'Costo Unitario (Neto)')
                                                            } <span className="text-red-400">*</span>
                                                        </label>
                                                        {/* Toggle Neto/Final - solo en Compra */}
                                                        {mainTab === 'compra' && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (priceInputMode === 'NETO' && formData.unitCost > 0) {
                                                                            // Convertir neto a final para mantener equivalencia
                                                                            const finalVal = finalFromNet(formData.unitCost, formData.ivaRate)
                                                                            handleChange('unitCost', finalVal)
                                                                        } else if (priceInputMode === 'FINAL' && formData.unitCost > 0) {
                                                                            // Convertir final a neto
                                                                            const netoVal = netFromFinal(formData.unitCost, formData.ivaRate)
                                                                            handleChange('unitCost', netoVal)
                                                                        }
                                                                        setPriceInputMode(prev => prev === 'NETO' ? 'FINAL' : 'NETO')
                                                                    }}
                                                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
                                                                        priceInputMode === 'FINAL'
                                                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                    }`}
                                                                    title="Alternar entre Precio Neto (sin IVA) y Precio Final (con IVA)"
                                                                >
                                                                    {priceInputMode === 'FINAL' ? 'c/IVA' : 's/IVA'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            inputMode="decimal"
                                                            value={(mainTab === 'venta' ? formData.unitPrice : formData.unitCost) || ''}
                                                            onChange={(e) => handleChange(mainTab === 'venta' ? 'unitPrice' : 'unitCost', Number(e.target.value))}
                                                            onFocus={selectOnFocus}
                                                            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                    {/* Mostrar neto derivado cuando estamos en modo FINAL */}
                                                    {mainTab === 'compra' && priceInputMode === 'FINAL' && formData.unitCost > 0 && (
                                                        <p className="text-[10px] text-amber-600 mt-1">
                                                            Neto derivado: {formatCurrency(calculations.derivedNetUnitCost)}
                                                        </p>
                                                    )}
                                                    {submitted && <FieldError msg={mainTab === 'venta' ? validationErrors.unitPrice : validationErrors.unitCost} />}
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
                                                    onFocus={selectOnFocus}
                                                    inputMode="decimal"
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
                                                    onFocus={selectOnFocus}
                                                    inputMode="decimal"
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
                                                                onFocus={selectOnFocus}
                                                                inputMode="decimal"
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
                                                                                onFocus={selectOnFocus}
                                                                                inputMode="decimal"
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
                                                                            onFocus={selectOnFocus}
                                                                            inputMode="decimal"
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

                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                            {mainTab === 'compra' ? (
                                                <><Wallet size={16} weight="duotone" className="text-blue-600" /> Pago / Contrapartidas</>
                                            ) : (
                                                <><HandCoins size={16} weight="duotone" className="text-emerald-600" /> Imputacion del cobro</>
                                            )}
                                        </h3>
                                        {mainTab === 'venta' && formData.counterparty?.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Find Deudores por ventas account (1.1.02.01) or a child for the counterparty
                                                    const deudoresAcc = (accounts || []).find(a => a.code === '1.1.02.01')
                                                    if (!deudoresAcc) return
                                                    const total = formData.ivaRate > 0
                                                        ? round2(formData.quantity * formData.unitPrice * (1 + formData.ivaRate / 100))
                                                        : round2(formData.quantity * formData.unitPrice)
                                                    setSplits([{ id: `split-ctacte-${Date.now()}`, accountId: deudoresAcc.id, amount: total }])
                                                    if (!userOverrodePaymentCondition) {
                                                        handleChange('paymentCondition', 'CTA_CTE')
                                                    }
                                                }}
                                                className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-100 transition-colors"
                                                title="Imputa el total a Deudores por Ventas (cliente). El cobro real se registra despues en Pagos/Cobros."
                                            >
                                                Vender en Cta. Cte.
                                            </button>
                                        )}
                                    </div>
                                    {mainTab === 'venta' && (
                                        <p className="text-[10px] text-slate-400 mb-3 -mt-2">
                                            Si vendes a cuenta corriente, imputa a Deudores por Ventas. El cobro real se registra despues en Pagos/Cobros.
                                        </p>
                                    )}

                                    {/* Payment Rows Container */}
                                    <div className="space-y-3">
                                        {splits.map((split) => (
                                            <div key={split.id}>
                                                <div className="flex items-center gap-3 relative">
                                                    <div className="flex-1 relative">
                                                        <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1 z-10">CUENTA</label>
                                                        <AccountSearchSelectWithBalance
                                                            accounts={accounts || []}
                                                            value={split.accountId}
                                                            onChange={(val) => handleSplitChange(split.id, 'accountId', val)}
                                                            placeholder="Buscar cuenta..."
                                                            inputClassName="h-[52px] pt-4 text-sm"
                                                            balances={ledgerBalances}
                                                            showBalance={true}
                                                        />
                                                    </div>
                                                    <div className="w-1/3 relative">
                                                        <label className="text-[10px] font-bold text-slate-400 absolute left-3 top-1">IMPORTE</label>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={split.amount || ''}
                                                            onChange={(e) => handleSplitChange(split.id, 'amount', Number(e.target.value))}
                                                            onFocus={selectOnFocus}
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
                                                {splitTotals.remaining > 1 && !split.amount && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoFillSplit(split.id)}
                                                        className="mt-1 ml-auto text-[11px] text-blue-600 font-semibold hover:bg-blue-50 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                                                    >
                                                        <Robot size={12} /> Autocompletar restante ({formatCurrency(round2(calculations.totalFinal - splits.filter(s => s.id !== split.id).reduce((sum, s) => sum + s.amount, 0)))})
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {submitted && <FieldError msg={validationErrors.splits || validationErrors.splitsBalance} />}
                                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2" data-field="splits">
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
                                                                        inputMode="decimal"
                                                                        value={retencionForm.rate || ''}
                                                                        onChange={(e) => setRetencionForm(prev => ({ ...prev, rate: Number(e.target.value) }))}
                                                                        onFocus={selectOnFocus}
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
                                                                    inputMode="decimal"
                                                                    value={retencionForm.amount || ''}
                                                                    onChange={(e) => setRetencionForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                                                    onFocus={selectOnFocus}
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
                                        <div className="relative" data-field="counterparty">
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                {mainTab === 'compra' ? 'Proveedor' : 'Cliente'} <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.counterparty}
                                                onChange={(e) => {
                                                    handleChange('counterparty', e.target.value)
                                                    setShowTerceroDropdown(true)
                                                }}
                                                onFocus={() => setShowTerceroDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowTerceroDropdown(false), 200)}
                                                placeholder={mainTab === 'compra' ? 'Buscar o crear proveedor...' : 'Buscar o crear cliente...'}
                                                className={`w-full px-3 py-2 bg-white border rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 ${submitted && validationErrors.counterparty ? 'border-red-300' : 'border-slate-300'}`}
                                                autoComplete="off"
                                            />
                                            {showTerceroDropdown && filteredTerceros.length > 0 && (
                                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                                                    {filteredTerceros.map(t => (
                                                        <button
                                                            key={t.accountId}
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault()
                                                                handleChange('counterparty', t.name)
                                                                setShowTerceroDropdown(false)
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between items-center"
                                                        >
                                                            <span className="font-medium text-slate-700">{t.name}</span>
                                                            <span className={`font-mono text-xs ${t.balance > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                {t.balance !== 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.balance) : ''}
                                                            </span>
                                                        </button>
                                                    ))}
                                                    {formData.counterparty.trim() && !filteredTerceros.some(t => t.name.toLowerCase() === formData.counterparty.toLowerCase().trim()) && (
                                                        <div className="px-3 py-2 text-xs text-blue-600 border-t border-slate-100">
                                                            <Plus size={12} weight="bold" className="inline mr-1" />
                                                            Crear nuevo: &quot;{formData.counterparty.trim()}&quot;
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {/* Mini-panel: tercero saldo + pendientes */}
                                            {terceroPreview && (mainTab === 'compra' || mainTab === 'venta') && (
                                                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-semibold text-blue-700">Saldo actual</span>
                                                        <span className={`font-mono font-bold ${terceroPreview.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(terceroPreview.balance)}
                                                        </span>
                                                    </div>
                                                    {terceroPreview.pending.length > 0 && (
                                                        <div className="mt-1.5 pt-1.5 border-t border-blue-200 space-y-1">
                                                            <span className="text-[10px] uppercase font-bold text-blue-500">Pendientes</span>
                                                            {terceroPreview.pending.map((p, i) => (
                                                                <div key={i} className="flex justify-between text-blue-700">
                                                                    <span>{p.ref} ({p.date}){p.dueDate ? ` → Vto: ${p.dueDate}` : ''}</span>
                                                                    <span className="font-mono">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.saldo)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {submitted && <FieldError msg={validationErrors.counterparty} />}
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

                                {/* CONDICIÓN DE PAGO (compra y venta) */}
                                {(mainTab === 'compra' || mainTab === 'venta') && !formData.isSoloGasto && (
                                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-6" data-field="paymentCondition">
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                                            {mainTab === 'venta' ? 'Condición de Cobro' : 'Condición de Pago'} <span className="text-red-400">*</span>
                                        </label>
                                        <div className="flex bg-white p-1 rounded-lg border border-slate-200 mb-4 shadow-sm">
                                            {(['CONTADO', 'CTA_CTE', 'DOCUMENTADO'] as const).map(cond => (
                                                <button
                                                    key={cond}
                                                    type="button"
                                                    onClick={() => {
                                                        setUserOverrodePaymentCondition(true)
                                                        handleChange('paymentCondition', cond)
                                                        if ((cond === 'CTA_CTE' || cond === 'DOCUMENTADO') && formData.termDays > 0 && formData.date && !userOverrodeDueDate) {
                                                            const due = new Date(formData.date + 'T12:00:00')
                                                            due.setDate(due.getDate() + formData.termDays)
                                                            handleChange('dueDate', due.toISOString().split('T')[0])
                                                        }
                                                    }}
                                                    className={`flex-1 py-1.5 text-xs font-medium rounded text-center transition-all ${formData.paymentCondition === cond
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'text-slate-600 hover:text-slate-900'}`}
                                                >
                                                    {cond === 'CONTADO' ? 'Contado' : cond === 'CTA_CTE' ? 'Cta. Cte.' : 'Documentado'}
                                                </button>
                                            ))}
                                        </div>
                                        {submitted && <FieldError msg={validationErrors.paymentCondition} />}

                                        {formData.paymentCondition === 'CONTADO' && (
                                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                                <span className="text-blue-500">ℹ</span> Se registra el pago en la contrapartida seleccionada.
                                            </div>
                                        )}

                                        {formData.paymentCondition === 'CTA_CTE' && (
                                            <div className="space-y-3">
                                                <div className="flex items-end gap-3">
                                                    <div className="w-28">
                                                        <label className="text-xs font-medium block mb-1">Días Plazo</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={formData.termDays || ''}
                                                            onFocus={selectOnFocus}
                                                            inputMode="numeric"
                                                            onChange={(e) => {
                                                                const days = parseInt(e.target.value) || 0
                                                                handleChange('termDays', days)
                                                                if (formData.date && days > 0 && !userOverrodeDueDate) {
                                                                    const due = new Date(formData.date + 'T12:00:00')
                                                                    due.setDate(due.getDate() + days)
                                                                    handleChange('dueDate', due.toISOString().split('T')[0])
                                                                }
                                                            }}
                                                            placeholder="0"
                                                            className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white border font-mono text-center"
                                                        />
                                                    </div>
                                                    <div className="flex gap-1 mb-0.5">
                                                        {[7, 15, 30, 45, 60, 90].map(d => (
                                                            <button
                                                                key={d}
                                                                type="button"
                                                                onClick={() => {
                                                                    handleChange('termDays', d)
                                                                    if (formData.date && !userOverrodeDueDate) {
                                                                        const due = new Date(formData.date + 'T12:00:00')
                                                                        due.setDate(due.getDate() + d)
                                                                        handleChange('dueDate', due.toISOString().split('T')[0])
                                                                    }
                                                                }}
                                                                className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${formData.termDays === d
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                                            >
                                                                {d}d
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium block mb-1">Vencimiento</label>
                                                    <input
                                                        type="date"
                                                        value={formData.dueDate}
                                                        onChange={(e) => {
                                                            setUserOverrodeDueDate(true)
                                                            handleChange('dueDate', e.target.value)
                                                        }}
                                                        className="w-full text-sm border-slate-300 rounded-md px-2 py-1.5 bg-white border"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {formData.paymentCondition === 'DOCUMENTADO' && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-medium block mb-1">Tipo de Documento</label>
                                                        <select
                                                            value={formData.instrumentType}
                                                            onChange={(e) => handleChange('instrumentType', e.target.value)}
                                                            className="w-full text-sm border-slate-300 rounded-md px-2 py-2 bg-white border"
                                                        >
                                                            <option value="">Seleccionar...</option>
                                                            <option value="PAGARE">Pagaré</option>
                                                            <option value="ECHEQ">Echeq</option>
                                                            <option value="CHEQUE">Cheque</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium block mb-1">Número</label>
                                                        <input
                                                            type="text"
                                                            value={formData.instrumentNumber}
                                                            onChange={(e) => handleChange('instrumentNumber', e.target.value)}
                                                            placeholder="Nro. documento"
                                                            className="w-full text-sm border-slate-300 rounded-md px-2 py-2 bg-white border"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-medium block mb-1">Vencimiento</label>
                                                        <input
                                                            type="date"
                                                            value={formData.dueDate}
                                                            onChange={(e) => handleChange('dueDate', e.target.value)}
                                                            className="w-full text-sm border-slate-300 rounded-md px-2 py-2 bg-white border"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium block mb-1">Banco (opcional)</label>
                                                        <input
                                                            type="text"
                                                            value={formData.instrumentBank}
                                                            onChange={(e) => handleChange('instrumentBank', e.target.value)}
                                                            placeholder="Banco emisor"
                                                            className="w-full text-sm border-slate-300 rounded-md px-2 py-2 bg-white border"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>
                                )}

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
                                                onClick={() => handleAutoFillSplit()}
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
                                            <span>Valor unitario (neto efectivo)</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.unitValue)}</span>
                                        </div>
                                        {selectedOriginalMovement.bonificacionPct > 0 && (
                                            <div className="flex justify-between text-slate-400 text-xs">
                                                <span>Bonificacion aplicada</span>
                                                <span className="font-mono">{selectedOriginalMovement.bonificacionPct}%</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-slate-600 font-medium pt-2 border-t border-slate-200">
                                            <span>Subtotal Neto</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>IVA ({selectedOriginalMovement.ivaRate}%)</span>
                                            <span className="font-mono">{formatCurrency(devolucionCalculations.iva)}</span>
                                        </div>
                                        {devolucionCalculations.taxesTotal > 0 && (
                                            <div className="flex justify-between text-orange-600">
                                                <span>Impuestos adicionales</span>
                                                <span className="font-mono">{formatCurrency(devolucionCalculations.taxesTotal)}</span>
                                            </div>
                                        )}
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
                                                            <td className="py-1.5 text-white">
                                                                Mercaderias (Activo)
                                                                {!discriminarIVA && calculations.ivaTotal > 0 && (
                                                                    <span className="text-[10px] text-amber-400 ml-1">(IVA incluido)</span>
                                                                )}
                                                            </td>
                                                            <td className="py-1.5 text-right text-emerald-400">
                                                                {/* When discriminarIVA=false, include IVA in Mercaderias */}
                                                                {discriminarIVA
                                                                    ? (calculations.netoAfterBonif + calculations.gastosNetos).toLocaleString('es-AR', { minimumFractionDigits: 2 })
                                                                    : (calculations.netoAfterBonif + calculations.gastosNetos + calculations.ivaTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })
                                                                }
                                                            </td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        {/* IVA CF line only shows when discriminarIVA=true */}
                                                        {discriminarIVA && calculations.ivaTotal > 0 && (
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
                                        {mainTab === 'compra' && !discriminarIVA && calculations.ivaTotal > 0 && (
                                            <span className="block text-amber-400 mt-1">
                                                IVA como costo (proveedor no discrimina IVA)
                                            </span>
                                        )}
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

                            {/* PREVIEW ASIENTO - Pagos/Cobros */}
                            {mainTab === 'pagos' && pagoCobro.amount > 0 && pagoCobroSplits.some(s => s.accountId && s.amount > 0) && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-violet-600 text-white flex items-center justify-center text-xs">
                                            <Robot size={14} weight="fill" />
                                        </div>
                                        <span className="text-xs font-bold text-violet-600 uppercase">Vista Previa Contable</span>
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
                                                {pagoCobroMode === 'COBRO' ? (
                                                    <>
                                                        {/* COBRO: Debe splits (Caja/Banco/Ret), Haber Deudores */}
                                                        {pagoCobroSplits.filter(s => s.accountId && s.amount > 0).map((split) => {
                                                            const acc = accounts?.find(a => a.id === split.accountId)
                                                            return (
                                                                <tr key={split.id}>
                                                                    <td className="py-1.5 text-white">{acc?.name || 'Cuenta'}</td>
                                                                    <td className="py-1.5 text-right text-emerald-400">{split.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="py-1.5 text-right">-</td>
                                                                </tr>
                                                            )
                                                        })}
                                                        <tr>
                                                            <td className="py-1.5 pl-4 text-slate-400">a Deudores por ventas</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                            <td className="py-1.5 text-right text-white">{pagoCobro.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* PAGO: Debe Proveedores, Haber splits (Caja/Banco/Ret) */}
                                                        <tr>
                                                            <td className="py-1.5 text-white">Proveedores</td>
                                                            <td className="py-1.5 text-right text-emerald-400">{pagoCobro.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 text-right">-</td>
                                                        </tr>
                                                        {pagoCobroSplits.filter(s => s.accountId && s.amount > 0).map((split) => {
                                                            const acc = accounts?.find(a => a.id === split.accountId)
                                                            return (
                                                                <tr key={split.id}>
                                                                    <td className="py-1.5 pl-4 text-slate-400">a {acc?.name || 'Cuenta'}</td>
                                                                    <td className="py-1.5 text-right">-</td>
                                                                    <td className="py-1.5 text-right text-white">{split.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t border-slate-600">
                                                    <td className="py-2 text-slate-400 font-semibold">Total</td>
                                                    <td className="py-2 text-right text-emerald-400 font-semibold">
                                                        {pagoCobroSplits.reduce((sum, s) => sum + (s.accountId ? s.amount : 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-2 text-right text-white font-semibold">
                                                        {pagoCobroSplits.reduce((sum, s) => sum + (s.accountId ? s.amount : 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        {/* Balance check */}
                                        {Math.abs(pagoCobro.amount - pagoCobroSplits.reduce((sum, s) => sum + s.amount, 0)) > 0.01 && (
                                            <div className="mt-2 p-2 bg-red-900/50 rounded text-red-300 text-[10px] flex items-center gap-1">
                                                <Warning size={12} /> Asiento desbalanceado: revisar totales
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                                        *{pagoCobroMode === 'COBRO' ? 'Cobro de cliente' : 'Pago a proveedor'} — Deudores/Proveedores vs Caja/Bancos.
                                    </p>
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
                                    disabled={isSaving || (submitted && hasValidationErrors)}
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
                                                 mainTab === 'pagos' ? (pagoCobroMode === 'COBRO' ? 'Confirmar Cobro' : 'Confirmar Pago') :
                                                 ajusteSubTab === 'devoluciones' ? 'Confirmar Devolucion' :
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
