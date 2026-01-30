import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Package,
    Coins,
    ChartBar,
    Percent,
    Plus,
    MagnifyingGlass,
    Export,
    PencilSimple,
    Trash,
    Warning,
    X,
    CheckCircle,
    TrendUp,
    Scales,
    Info,
    LinkSimple,
    ArrowSquareOut,
    Sparkle,
    GearSix,
} from '@phosphor-icons/react'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import { DEFAULT_ACCOUNT_CODES } from '../../core/inventario/types'
import type {
    BienesProduct,
    BienesMovement,
    BienesSettings,
    CostingMethod,
    ProductValuation,
    BienesKPIs,
    AccountMappingKey,
    InventoryMode,
} from '../../core/inventario/types'
import type { Account, JournalEntry } from '../../core/models'
import {
    loadBienesSettings,
    getAllBienesProducts,
    getAllBienesMovements,
    createBienesProduct,
    updateBienesProduct,
    deleteBienesProduct,
    deleteBienesProductWithMovements,
    createBienesMovement,
    updateBienesMovementWithJournal,
    generateJournalForMovement,
    linkMovementToEntries,
    createEntry,
    updateCostingMethod,
    saveBienesSettings,
    deleteBienesMovementWithJournal,
    reconcileMovementJournalLinks,
    clearBienesPeriodData,
    generatePeriodicClosingJournalEntries,
} from '../../storage'
import { db } from '../../storage/db'
import {
    calculateAllValuations,
    calculateBienesKPIs,
    canChangeCostingMethod,
} from '../../core/inventario/costing'
import ProductModal from './components/ProductModal'
import MovementModal from './components/MovementModal'
import { AccountAutocomplete } from './components/AccountAutocomplete'

type TabId = 'dashboard' | 'productos' | 'movimientos' | 'conciliacion' | 'cierre'

const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'productos', label: 'Productos' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'conciliacion', label: 'Conciliacion' },
    { id: 'cierre', label: 'Cierre' },
]

type InventoryAccountCategory = 'mercaderias' | 'compras' | 'cmv' | 'ventas'

type InventoryAccountRule = {
    key: AccountMappingKey
    label: string
    category: InventoryAccountCategory
    codes: string[]
    nameAny?: string[]
    nameAll?: string[]
    optional?: boolean
}

const BIENES_ACCOUNT_RULES: InventoryAccountRule[] = [
    {
        key: 'mercaderias',
        label: 'Mercaderias',
        category: 'mercaderias',
        codes: [DEFAULT_ACCOUNT_CODES.mercaderias, '1.2.01', '1.2.05'],
        nameAny: ['mercader', 'bienes de cambio', 'inventario', 'stock'],
    },
    {
        key: 'compras',
        label: 'Compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.compras, '4.8.01'],
        nameAny: ['compra'],
    },
    {
        key: 'gastosCompras',
        label: 'Gastos sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.gastosCompras, '4.8.02'],
        nameAny: ['gasto', 'flete', 'seguro', 'compra'],
        optional: true,
    },
    {
        key: 'bonifCompras',
        label: 'Bonificaciones sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.bonifCompras, '4.8.03'],
        nameAll: ['bonif', 'compra'],
    },
    {
        key: 'devolCompras',
        label: 'Devoluciones sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.devolCompras, '4.8.04'],
        nameAll: ['devol', 'compra'],
    },
    {
        key: 'cmv',
        label: 'CMV',
        category: 'cmv',
        codes: [DEFAULT_ACCOUNT_CODES.cmv, '4.3.01'],
        nameAny: ['cmv', 'costo mercader', 'costo de mercader', 'costo mercaderia'],
    },
    {
        key: 'aperturaInventario',
        label: 'Apertura Inventario',
        category: 'mercaderias',
        codes: [DEFAULT_ACCOUNT_CODES.aperturaInventario, '3.2.01'],
        nameAny: ['apertura', 'resultados acumulados'],
        optional: true,
    },
    {
        key: 'ventas',
        label: 'Ventas',
        category: 'ventas',
        codes: [DEFAULT_ACCOUNT_CODES.ventas, '4.1.01'],
        nameAny: ['venta'],
        optional: true,
    },
    {
        key: 'bonifVentas',
        label: 'Bonificaciones sobre ventas',
        category: 'ventas',
        codes: [DEFAULT_ACCOUNT_CODES.bonifVentas, '4.8.05'],
        nameAll: ['bonif', 'venta'],
        optional: true,
    },
    {
        key: 'devolVentas',
        label: 'Devoluciones sobre ventas',
        category: 'ventas',
        codes: [DEFAULT_ACCOUNT_CODES.devolVentas, '4.8.06'],
        nameAll: ['devol', 'venta'],
        optional: true,
    },
]

const REQUIRED_BIENES_RULES = BIENES_ACCOUNT_RULES.filter(rule => !rule.optional)
const OPTIONAL_BIENES_RULES = BIENES_ACCOUNT_RULES.filter(rule => rule.optional)

/**
 * Bienes de Cambio Page
 *
 * Main inventory management with FIFO/LIFO/PPP costing.
 * Follows the prototype at docs/prototypes/Inventario.html
 */
export default function InventarioBienesPage() {
    // State
    const { year: periodYear } = usePeriodYear()
    const periodId = String(periodYear)
    const [activeTab, setActiveTab] = useState<TabId>('dashboard')
    const [settings, setSettings] = useState<BienesSettings | null>(null)
    const [products, setProducts] = useState<BienesProduct[]>([])
    const [movements, setMovements] = useState<BienesMovement[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray(), [])
    const journalEntries = useLiveQuery(() => db.entries.orderBy('date').reverse().toArray(), [])

    // Modals
    const [productModalOpen, setProductModalOpen] = useState(false)
    const [movementModalOpen, setMovementModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<BienesProduct | null>(null)
    const [editingMovement, setEditingMovement] = useState<BienesMovement | null>(null)
    const [movementPrefill, setMovementPrefill] = useState<Partial<BienesMovement> | null>(null)
    const [pendingLinkEntryId, setPendingLinkEntryId] = useState<string | null>(null)
    const [entryDrawerOpen, setEntryDrawerOpen] = useState(false)
    const [entryDrawerEntries, setEntryDrawerEntries] = useState<JournalEntry[]>([])
    const [linkMovementTarget, setLinkMovementTarget] = useState<BienesMovement | null>(null)
    const [linkEntryTarget, setLinkEntryTarget] = useState<JournalEntry | null>(null)
    const [selectedLinkEntryId, setSelectedLinkEntryId] = useState<string>('')
    const [selectedLinkMovementId, setSelectedLinkMovementId] = useState<string>('')
    const [manualEditPrompt, setManualEditPrompt] = useState<BienesMovement | null>(null)
    const [manualEditAction, setManualEditAction] = useState<'keep' | 'regenerate' | null>(null)
    const [manualDeletePrompt, setManualDeletePrompt] = useState<BienesMovement | null>(null)

    // Search
    const [productSearch, setProductSearch] = useState('')

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }, [])

    // Cierre
    const [closingPhysicalValue, setClosingPhysicalValue] = useState(0)
    const [closingIsSaving, setClosingIsSaving] = useState(false)

    // Configuracion de cuentas Bienes de Cambio (conciliacion)
    const [accountMappingsDraft, setAccountMappingsDraft] = useState<Partial<Record<AccountMappingKey, string>>>({})
    const [accountMappingsSaving, setAccountMappingsSaving] = useState(false)
    const [accountConfigOpen, setAccountConfigOpen] = useState(false)
    const [clearModalOpen, setClearModalOpen] = useState(false)
    const [clearOption, setClearOption] = useState<'delete' | 'keep'>('delete')
    const [clearBusy, setClearBusy] = useState(false)
    const [goalModalOpen, setGoalModalOpen] = useState(false)
    const [goalType, setGoalType] = useState<'sales' | 'margin' | null>(null)
    const [goalDraft, setGoalDraft] = useState<string>('')

    // Load data
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true)
            await reconcileMovementJournalLinks(periodId)
            const [loadedSettings, loadedProducts, loadedMovements] = await Promise.all([
                loadBienesSettings(),
                getAllBienesProducts(periodId),
                getAllBienesMovements(periodId),
            ])
            setSettings(loadedSettings)
            setProducts(loadedProducts)
            setMovements(loadedMovements)
        } catch (error) {
            console.error('Error loading bienes data:', error)
            showToast('Error al cargar datos', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [periodId, showToast])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        if (settings) {
            setAccountMappingsDraft(settings.accountMappings || {})
        }
    }, [settings])

    // Computed values
    const yearRange = useMemo(() => {
        const startDate = new Date(periodYear, 0, 1)
        const endDate = new Date(periodYear, 11, 31)
        const toISO = (date: Date) => date.toISOString().split('T')[0]
        return {
            start: toISO(startDate),
            end: toISO(endDate),
        }
    }, [periodYear])

    const monthRange = useMemo(() => {
        const now = new Date()
        const monthIndex = now.getMonth()
        const startDate = new Date(periodYear, monthIndex, 1)
        const endDate = new Date(periodYear, monthIndex + 1, 0)
        const prevMonthIndex = monthIndex - 1
        const prevStartDate = prevMonthIndex >= 0 ? new Date(periodYear, prevMonthIndex, 1) : null
        const prevEndDate = prevMonthIndex >= 0 ? new Date(periodYear, prevMonthIndex + 1, 0) : null
        const toISO = (date: Date) => date.toISOString().split('T')[0]
        return {
            start: toISO(startDate),
            end: toISO(endDate),
            prevStart: prevStartDate ? toISO(prevStartDate) : null,
            prevEnd: prevEndDate ? toISO(prevEndDate) : null,
            label: startDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
        }
    }, [periodYear])

    const valuations = useMemo<ProductValuation[]>(() => {
        if (!settings) return []
        return calculateAllValuations(products, movements, settings.costMethod)
    }, [products, movements, settings])

    const kpis = useMemo<BienesKPIs>(() => {
        if (!settings) {
            return {
                totalProducts: 0,
                totalUnits: 0,
                stockValue: 0,
                cmvPeriod: 0,
                salesPeriod: 0,
                grossMargin: 0,
                lowStockAlerts: 0,
            }
        }
        return calculateBienesKPIs(products, movements, settings.costMethod, monthRange.start, monthRange.end)
    }, [products, movements, settings, monthRange])

    const existenciaInicial = useMemo(() => {
        return products.reduce((sum, p) => sum + p.openingQty * p.openingUnitCost, 0)
    }, [products])

    const comprasPeriodo = useMemo(() => {
        return movements
            .filter(m => m.type === 'PURCHASE')
            .reduce((sum, m) => sum + m.subtotal, 0)
    }, [movements])

    const inventarioTeorico = kpis.stockValue
    const diferenciaCierre = closingPhysicalValue - inventarioTeorico
    const cmvPorDiferencia = existenciaInicial + comprasPeriodo - (closingPhysicalValue || 0)
    const cierreAjusteMonto = Math.abs(diferenciaCierre)
    const cierreAjusteEntrada = diferenciaCierre > 0

    const lowStockCount = useMemo(() => {
        return valuations.filter(v => v.hasAlert).length
    }, [valuations])

    const costMethodLocked = useMemo(() => !canChangeCostingMethod(movements), [movements])

    const filteredProducts = useMemo(() => {
        if (!productSearch) return products
        const search = productSearch.toLowerCase()
        return products.filter(
            p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)
        )
    }, [products, productSearch])

    const handleSaveProduct = async (
        product: Omit<BienesProduct, 'id' | 'createdAt' | 'updatedAt'>,
        options?: { generateOpeningJournal?: boolean }
    ) => {
        try {
            if (editingProduct) {
                await updateBienesProduct(editingProduct.id, { ...product, periodId: editingProduct.periodId || periodId })
                showToast('Producto actualizado', 'success')
            } else {
                await createBienesProduct(
                    { ...product, periodId },
                    options?.generateOpeningJournal ? { generateOpeningJournal: true } : undefined,
                )
                showToast('Producto creado', 'success')
            }
            await loadData()
            setProductModalOpen(false)
            setEditingProduct(null)
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al guardar', 'error')
        }
    }

    const handleDeleteProduct = async (id: string) => {
        const productMovements = movements.filter(movement => movement.productId === id)
        if (productMovements.length === 0) {
            if (!confirm('Eliminar este producto?')) return
            const result = await deleteBienesProduct(id)
            if (result.success) {
                showToast('Producto eliminado', 'success')
                await loadData()
            } else {
                showToast(result.error || 'Error al eliminar', 'error')
            }
            return
        }

        const proceed = confirm(`Este producto tiene ${productMovements.length} movimientos. Se eliminaran los movimientos y asientos generados asociados. Continuar?`)
        if (!proceed) return

        const result = await deleteBienesProductWithMovements(id)
        if (result.success) {
            showToast('Producto eliminado (incluyendo movimientos y asientos generados).', 'success')
            await loadData()
        } else {
            showToast(result.error || 'Error al eliminar', 'error')
        }
    }

    const handleSaveMovement = async (movement: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => {
        try {
            if (editingMovement) {
                const movementPayload = { ...movement, periodId: editingMovement.periodId || periodId }
                await updateBienesMovementWithJournal(editingMovement.id, movementPayload, {
                    manualLinkAction: manualEditAction || undefined,
                })
                if (manualEditAction === 'keep') {
                    showToast('Movimiento actualizado (asiento manual sin cambios)', 'success')
                } else if (manualEditAction === 'regenerate') {
                    showToast('Movimiento actualizado y asiento regenerado', 'success')
                } else {
                    showToast('Movimiento actualizado', 'success')
                }
            } else {
                const movementToSave = pendingLinkEntryId
                    ? { ...movement, periodId, autoJournal: false, linkedJournalEntryIds: [] }
                    : { ...movement, periodId, linkedJournalEntryIds: [] }
                const saved = await createBienesMovement(movementToSave)

                if (pendingLinkEntryId) {
                    await linkMovementToEntries(saved.id, [pendingLinkEntryId])
                    showToast('Movimiento creado y vinculado', 'success')
                    setPendingLinkEntryId(null)
                } else if (movement.autoJournal) {
                    showToast('Asiento generado', 'success')
                } else {
                    showToast('Movimiento registrado', 'success')
                }
            }

            await loadData()
            setMovementModalOpen(false)
            setMovementPrefill(null)
            setEditingMovement(null)
            setManualEditAction(null)
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al guardar', 'error')
        }
    }

    const handleEditMovement = (movement: BienesMovement) => {
        const { manualEntries } = getMovementLinkInfo(movement)
        if (manualEntries.length > 0) {
            setManualEditPrompt(movement)
            return
        }
        setEditingMovement(movement)
        setManualEditAction(null)
        setMovementPrefill(movement)
        setPendingLinkEntryId(null)
        setMovementModalOpen(true)
    }

    const handleDeleteMovement = async (movement: BienesMovement) => {
        const { manualEntries, autoEntries } = getMovementLinkInfo(movement)
        if (manualEntries.length > 0) {
            setManualDeletePrompt(movement)
            return
        }

        const confirmText = autoEntries.length > 0
            ? 'Eliminar movimiento y asientos contables asociados?'
            : 'Eliminar movimiento?'
        if (!confirm(confirmText)) return

        const result = await deleteBienesMovementWithJournal(movement.id)
        if (result.success) {
            showToast('Movimiento eliminado', 'success')
            await loadData()
        } else {
            showToast(result.error || 'Error al eliminar movimiento', 'error')
        }
    }

    const handleConfirmManualEdit = (action: 'keep' | 'regenerate') => {
        if (!manualEditPrompt) return
        setManualEditAction(action)
        setEditingMovement(manualEditPrompt)
        setMovementPrefill(manualEditPrompt)
        setPendingLinkEntryId(null)
        setMovementModalOpen(true)
        setManualEditPrompt(null)
    }

    const handleConfirmManualDelete = async () => {
        if (!manualDeletePrompt) return
        const result = await deleteBienesMovementWithJournal(manualDeletePrompt.id, { keepManualEntries: true })
        if (result.success) {
            showToast('Movimiento eliminado (asiento manual conservado)', 'success')
            await loadData()
        } else {
            showToast(result.error || 'Error al eliminar movimiento', 'error')
        }
        setManualDeletePrompt(null)
    }

    const handleConfirmClear = async () => {
        setClearBusy(true)
        try {
            await clearBienesPeriodData(periodId, {
                deleteGeneratedEntries: clearOption === 'delete',
            })
            showToast('Inventario limpiado para el periodo seleccionado', 'success')
            await loadData()
            setClearModalOpen(false)
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al limpiar inventario', 'error')
        } finally {
            setClearBusy(false)
        }
    }

    const handleChangeCostMethod = async (newMethod: CostingMethod) => {
        if (!settings) return

        // Check if we can change
        if (!canChangeCostingMethod(movements)) {
            showToast('No se puede cambiar: ya hay salidas registradas', 'error')
            return
        }

        const result = await updateCostingMethod(newMethod, periodId)
        if (result.success) {
            await loadData()
            showToast(`Metodo cambiado a ${newMethod}`, 'success')
        } else {
            showToast(result.error || 'Error', 'error')
        }
    }

    const handleChangeInventoryMode = async (mode: InventoryMode) => {
        if (!settings) return
        const updated: BienesSettings = {
            ...settings,
            inventoryMode: mode,
            lastUpdated: new Date().toISOString(),
        }
        await saveBienesSettings(updated)
        setSettings(updated)
    }

    const handleChangeAutoJournal = async (auto: boolean) => {
        if (!settings) return
        const updated: BienesSettings = {
            ...settings,
            autoJournalEntries: auto,
            lastUpdated: new Date().toISOString(),
        }
        await saveBienesSettings(updated)
        setSettings(updated)
    }

    const handleAccountMappingChange = (key: AccountMappingKey, value: { code: string }) => {
        setAccountMappingsDraft(prev => ({
            ...prev,
            [key]: value.code || '',
        }))
    }

    const handleApplySuggestion = (key: AccountMappingKey) => {
        const suggestion = suggestedAccounts.get(key)
        if (!suggestion) return
        setAccountMappingsDraft(prev => ({
            ...prev,
            [key]: suggestion.code,
        }))
    }

    const handleClearMapping = (key: AccountMappingKey) => {
        setAccountMappingsDraft(prev => ({
            ...prev,
            [key]: '',
        }))
    }

    const handleSaveAccountMappings = async (closeOnSuccess?: boolean) => {
        if (!settings) return
        setAccountMappingsSaving(true)
        try {
            const cleaned = sanitizeMappings(accountMappingsDraft)
            const updated: BienesSettings = {
                ...settings,
                accountMappings: cleaned,
                lastUpdated: new Date().toISOString(),
            }
            await saveBienesSettings(updated)
            setSettings(updated)
            showToast('Cuentas de bienes de cambio guardadas', 'success')
            if (closeOnSuccess) {
                setAccountConfigOpen(false)
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al guardar cuentas', 'error')
        } finally {
            setAccountMappingsSaving(false)
        }
    }

    const openAccountConfigModal = () => {
        setAccountMappingsDraft(settings?.accountMappings || {})
        setAccountConfigOpen(true)
    }

    const openGoalModal = (type: 'sales' | 'margin') => {
        setGoalType(type)
        if (type === 'sales') {
            setGoalDraft(salesGoal !== null ? String(salesGoal) : '')
        } else {
            setGoalDraft(String(marginGoal))
        }
        setGoalModalOpen(true)
    }

    const handleSaveGoal = async () => {
        if (!settings || !goalType) return
        const raw = goalDraft.trim()
        const value = raw === '' ? null : Number(raw)

        if (raw !== '' && Number.isNaN(value)) {
            showToast('Ingresa un valor valido', 'error')
            return
        }

        if (goalType === 'margin') {
            if (value !== null && (value < 0 || value > 100)) {
                showToast('El objetivo debe estar entre 0 y 100', 'error')
                return
            }
        } else {
            if (value !== null && value < 0) {
                showToast('El objetivo debe ser mayor o igual a 0', 'error')
                return
            }
        }

        const updatedGoals = { ...(settings.periodGoals || {}) }
        const current = { ...(updatedGoals[periodId] || {}) }

        if (goalType === 'margin') {
            if (value === null) {
                delete current.marginTarget
            } else {
                current.marginTarget = value
            }
        } else {
            if (value === null || value === 0) {
                delete current.salesTarget
            } else {
                current.salesTarget = value
            }
        }

        if (Object.keys(current).length === 0) {
            delete updatedGoals[periodId]
        } else {
            updatedGoals[periodId] = current
        }

        const updatedSettings: BienesSettings = {
            ...settings,
            periodGoals: updatedGoals,
            lastUpdated: new Date().toISOString(),
        }

        await saveBienesSettings(updatedSettings)
        setSettings(updatedSettings)
        setGoalModalOpen(false)
        showToast('Objetivo actualizado', 'success')
    }

    const openNewMovementModal = () => {
        setMovementPrefill(null)
        setPendingLinkEntryId(null)
        setEditingMovement(null)
        setManualEditAction(null)
        setMovementModalOpen(true)
    }

    const handleGenerateJournal = async (movementId: string) => {
        const movement = movements.find(m => m.id === movementId)
        if (movement?.linkedJournalEntryIds?.length) {
            showToast('El movimiento ya tiene asientos vinculados. Desvincula o regenara manualmente si hace falta.', 'error')
            return
        }
        try {
            await generateJournalForMovement(movementId)
            showToast('Asiento generado', 'success')
            await loadData()
        } catch (error) {
            await db.bienesMovements.update(movementId, {
                journalStatus: 'error',
                updatedAt: new Date().toISOString(),
            })
            await loadData()
            showToast(error instanceof Error ? error.message : 'Error al generar asiento', 'error')
        }
    }

    const handleOpenEntryDrawer = (entryIds: string[]) => {
        if (!scopedJournalEntries) return
        const entries = scopedJournalEntries.filter(entry => entryIds.includes(entry.id))
        setEntryDrawerEntries(entries)
        setEntryDrawerOpen(true)
    }

    const handleStartLinkMovement = (movement: BienesMovement) => {
        setLinkMovementTarget(movement)
        setSelectedLinkEntryId('')
        setLinkEntryTarget(null)
    }

    const handleStartLinkEntry = (entry: JournalEntry) => {
        setLinkEntryTarget(entry)
        setSelectedLinkMovementId('')
        setLinkMovementTarget(null)
    }

    const buildPrefillFromEntry = (entry: JournalEntry): Partial<BienesMovement> => {
        const total = getEntryTotal(entry)
        const match = getEntryInventoryMatch(entry)
        const inferredType = inferMovementTypeFromEntry(entry)
        const hasPurchaseAdjustment = match.matchedKeys?.some(key => key === 'bonifCompras' || key === 'devolCompras') || false
        const adjustmentDirection = inferredType === 'ADJUSTMENT'
            ? (hasPurchaseAdjustment ? 'OUT' : inferAdjustmentDirection(entry))
            : 'IN'
        const quantity = inferredType === 'ADJUSTMENT' && adjustmentDirection === 'OUT' ? -1 : 1

        return {
            type: inferredType,
            date: entry.date,
            quantity,
            unitCost: inferredType === 'PURCHASE' || inferredType === 'ADJUSTMENT' ? total : undefined,
            unitPrice: inferredType === 'SALE' ? total : undefined,
            ivaRate: 0,
            subtotal: total,
            total,
            autoJournal: false,
            productId: products[0]?.id || '',
        }
    }

    const handleCreateMovementFromEntry = (entry: JournalEntry) => {
        if (products.length === 0) {
            showToast('Crea un producto antes de mapear el movimiento', 'error')
            return
        }
        const match = getEntryInventoryMatch(entry)
        const onlyMercaderias = match.category === 'mercaderias' &&
            (match.matchedKeys || []).length > 0 &&
            (match.matchedKeys || []).every(key => key === 'mercaderias')
        if (onlyMercaderias) {
            const proceed = confirm('Asiento de existencia/refundicion. Crear movimiento no es recomendado. Queres continuar igual?')
            if (!proceed) return
        }
        const prefill = buildPrefillFromEntry(entry)
        setMovementPrefill(prefill)
        setPendingLinkEntryId(entry.id)
        setMovementModalOpen(true)
    }

    const handleConfirmLinkMovement = async () => {
        if (!linkMovementTarget || !selectedLinkEntryId) {
            showToast('Selecciona un asiento para vincular', 'error')
            return
        }
        try {
            await linkMovementToEntries(linkMovementTarget.id, [selectedLinkEntryId])
            showToast('Asiento vinculado', 'success')
            setLinkMovementTarget(null)
            setSelectedLinkEntryId('')
            await loadData()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al vincular', 'error')
        }
    }

    const handleConfirmLinkEntry = async () => {
        if (!linkEntryTarget || !selectedLinkMovementId) {
            showToast('Selecciona un movimiento para vincular', 'error')
            return
        }
        try {
            await linkMovementToEntries(selectedLinkMovementId, [linkEntryTarget.id])
            showToast('Movimiento vinculado', 'success')
            setLinkEntryTarget(null)
            setSelectedLinkMovementId('')
            await loadData()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al vincular', 'error')
        }
    }

    const handleGenerateClosingEntry = async () => {
        const isPeriodic = settings?.inventoryMode === 'PERIODIC'

        if (isPeriodic) {
            // PERIODIC mode: generate 3 standard closing entries
            if (closingPhysicalValue <= 0) {
                showToast('Ingresa el inventario final fisico para generar los asientos', 'error')
                return
            }
            if (!confirm('Se generaran los asientos de cierre periodico (EI a CMV, Compras a CMV, EF a Mercaderias). Continuar?')) {
                return
            }
            setClosingIsSaving(true)
            try {
                const result = await generatePeriodicClosingJournalEntries({
                    existenciaInicial,
                    comprasNetas: comprasPeriodo,
                    existenciaFinal: closingPhysicalValue,
                    closingDate: new Date().toISOString().split('T')[0],
                    periodId,
                    periodLabel: `${periodId}`,
                })
                if (result.error) {
                    showToast(result.error, 'error')
                } else {
                    showToast(`Cierre generado: ${result.entryIds.length} asientos, CMV = ${formatCurrency(result.cmv)}`, 'success')
                }
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Error al generar asientos', 'error')
            } finally {
                setClosingIsSaving(false)
            }
            return
        }

        // PERMANENT mode: single adjustment entry for physical vs theoretical difference
        if (!mercaderiasAccountId || !diferenciaInventarioAccountId) {
            showToast('Faltan cuentas Mercaderias o Diferencia de inventario', 'error')
            return
        }
        if (closingPhysicalValue <= 0) {
            showToast('Ingresa el inventario final fisico para generar el asiento', 'error')
            return
        }

        const inventarioTeoricoLocal = kpis.stockValue
        const diferencia = closingPhysicalValue - inventarioTeoricoLocal

        if (Math.abs(diferencia) < 0.01) {
            showToast('No hay diferencias para ajustar', 'error')
            return
        }

        const closingId = `closing-${Date.now()}`
        const lines = diferencia > 0
            ? [
                {
                    accountId: mercaderiasAccountId,
                    debit: Math.abs(diferencia),
                    credit: 0,
                    description: 'Ajuste inventario final',
                },
                {
                    accountId: diferenciaInventarioAccountId,
                    debit: 0,
                    credit: Math.abs(diferencia),
                    description: 'Diferencia de inventario',
                },
            ]
            : [
                {
                    accountId: diferenciaInventarioAccountId,
                    debit: Math.abs(diferencia),
                    credit: 0,
                    description: 'Diferencia de inventario',
                },
                {
                    accountId: mercaderiasAccountId,
                    debit: 0,
                    credit: Math.abs(diferencia),
                    description: 'Ajuste inventario final',
                },
            ]

        const memo = `Cierre inventario por diferencias - EI ${formatCurrency(existenciaInicial)} / Compras ${formatCurrency(comprasPeriodo)} / EF Fisico ${formatCurrency(closingPhysicalValue)}`

        setClosingIsSaving(true)
        try {
            await createEntry({
                date: new Date().toISOString().split('T')[0],
                memo,
                lines,
                sourceModule: 'inventory',
                sourceType: 'closing',
                sourceId: closingId,
                createdAt: new Date().toISOString(),
                metadata: {
                    sourceModule: 'inventory',
                    sourceType: 'closing',
                    sourceId: closingId,
                    inventarioTeorico: inventarioTeoricoLocal,
                    inventarioFisico: closingPhysicalValue,
                    diferencia,
                    existenciaInicial,
                    comprasPeriodo,
                },
            })
            showToast('Asiento de cierre generado', 'success')
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al generar asiento', 'error')
        } finally {
            setClosingIsSaving(false)
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

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const scopedJournalEntries = useMemo(() => {
        if (!journalEntries) return []
        return journalEntries.filter(entry => entry.date >= yearRange.start && entry.date <= yearRange.end)
    }, [journalEntries, yearRange])

    const journalEntryMap = useMemo(() => {
        return new Map(scopedJournalEntries.map(entry => [entry.id, entry]))
    }, [scopedJournalEntries])

    const isAutoGeneratedEntry = useCallback((entry: JournalEntry | undefined, movementId: string) => {
        if (!entry) return false
        return entry.sourceModule === 'inventory'
            && entry.sourceId === movementId
            && !!entry.metadata?.journalRole
    }, [periodId])

    const getMovementLinkInfo = useCallback((movement: BienesMovement) => {
        const entries = (movement.linkedJournalEntryIds || [])
            .map(id => journalEntryMap.get(id))
            .filter(Boolean) as JournalEntry[]
        const autoEntries = entries.filter(entry => isAutoGeneratedEntry(entry, movement.id))
        const manualEntries = entries.filter(entry => !isAutoGeneratedEntry(entry, movement.id))
        return { entries, autoEntries, manualEntries }
    }, [journalEntryMap, isAutoGeneratedEntry])

    const normalizeText = (value: string) => value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

    const resolveAccountByIdOrCode = useCallback((value?: string | null) => {
        if (!accounts || !value) return null
        return accounts.find(acc => acc.id === value) || accounts.find(acc => acc.code === value) || null
    }, [accounts])

    const findAccountByRule = useCallback((rule: InventoryAccountRule) => {
        if (!accounts) return null
        for (const code of rule.codes || []) {
            const byCode = accounts.find(acc => acc.code === code)
            if (byCode) return byCode
        }
        const tokensAll = (rule.nameAll || []).map(normalizeText)
        const tokensAny = (rule.nameAny || []).map(normalizeText)
        if (tokensAll.length === 0 && tokensAny.length === 0) return null

        return accounts.find(acc => {
            if (acc.isHeader) return false
            const haystack = `${normalizeText(acc.name)} ${normalizeText(acc.code)}`
            if (tokensAll.length > 0) {
                return tokensAll.every(token => haystack.includes(token))
            }
            return tokensAny.some(token => haystack.includes(token))
        }) || null
    }, [accounts])

    const accountMap = useMemo(() => {
        return new Map((accounts || []).map(acc => [acc.id, acc]))
    }, [accounts])

    const getAccountName = useCallback((accountId: string) => {
        return accountMap.get(accountId)?.name || 'Cuenta desconocida'
    }, [accountMap])

    const findAccountByCodeOrName = useCallback((code: string, names: string[]) => {
        if (!accounts) return null
        const byCode = accounts.find(acc => acc.code === code)
        if (byCode) return byCode.id
        const targets = names.map(normalizeText)
        const byName = accounts.find(acc => targets.includes(normalizeText(acc.name)))
        return byName?.id || null
    }, [accounts])

    const suggestedAccounts = useMemo(() => {
        if (!accounts) return new Map<AccountMappingKey, Account | null>()
        const suggestions = new Map<AccountMappingKey, Account | null>()
        BIENES_ACCOUNT_RULES.forEach(rule => {
            suggestions.set(rule.key, findAccountByRule(rule))
        })
        return suggestions
    }, [accounts, findAccountByRule])

    const inventoryAccountResolution = useMemo(() => {
        const byKey = new Map<AccountMappingKey, { account: Account; source: 'config' | 'heuristic' }>()
        const byId = new Map<string, { key: AccountMappingKey; category: InventoryAccountCategory; source: 'config' | 'heuristic' }>()
        let usedHeuristic = false

        if (!accounts) {
            return { byKey, byId, universe: new Set<string>(), usedHeuristic }
        }

        BIENES_ACCOUNT_RULES.forEach(rule => {
            const mappedValue = settings?.accountMappings?.[rule.key]
            const mappedAccount = resolveAccountByIdOrCode(mappedValue)
            if (mappedAccount) {
                byKey.set(rule.key, { account: mappedAccount, source: 'config' })
                byId.set(mappedAccount.id, { key: rule.key, category: rule.category, source: 'config' })
                return
            }

            const allowHeuristic = !rule.optional || rule.key === 'gastosCompras'
            if (!allowHeuristic) return
            const heuristicAccount = findAccountByRule(rule)
            if (heuristicAccount) {
                byKey.set(rule.key, { account: heuristicAccount, source: 'heuristic' })
                byId.set(heuristicAccount.id, { key: rule.key, category: rule.category, source: 'heuristic' })
                usedHeuristic = true
            }
        })

        return { byKey, byId, universe: new Set(byId.keys()), usedHeuristic }
    }, [accounts, settings, findAccountByRule, resolveAccountByIdOrCode])

    const mappingAccounts = useMemo(() => {
        const result = new Map<AccountMappingKey, Account | null>()
        BIENES_ACCOUNT_RULES.forEach(rule => {
            const value = accountMappingsDraft[rule.key]
            result.set(rule.key, resolveAccountByIdOrCode(value) || null)
        })
        return result
    }, [accountMappingsDraft, resolveAccountByIdOrCode])

    const mercaderiasAccountId = useMemo(() => {
        const resolved = inventoryAccountResolution.byKey.get('mercaderias')?.account.id
        if (resolved) return resolved
        return findAccountByCodeOrName('1.1.04.01', ['Mercaderias'])
    }, [findAccountByCodeOrName, inventoryAccountResolution])

    const diferenciaInventarioAccountId = useMemo(() => {
        const mapped = resolveAccountByIdOrCode(settings?.accountMappings?.diferenciaInventario)
        return mapped?.id || findAccountByCodeOrName('4.3.02', ['Diferencia de inventario'])
    }, [findAccountByCodeOrName, resolveAccountByIdOrCode, settings])

    const getEntryTotal = useCallback((entry: JournalEntry) => {
        const debit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
        const credit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)
        return Math.max(debit, credit)
    }, [])

    const getEntryInventoryMatch = useCallback((entry: JournalEntry) => {
        const matches = new Map<string, { key: AccountMappingKey; category: InventoryAccountCategory }>()
        entry.lines.forEach(line => {
            const match = inventoryAccountResolution.byId.get(line.accountId)
            if (match) {
                matches.set(line.accountId, { key: match.key, category: match.category })
            }
        })

        const categories = new Set(Array.from(matches.values()).map(m => m.category))
        const matchedKeys = Array.from(new Set(Array.from(matches.values()).map(m => m.key)))
        const hasMatches = categories.size > 0

        const categoryPriority: InventoryAccountCategory[] = ['cmv', 'compras', 'ventas', 'mercaderias']
        let primaryCategory = categoryPriority.find(cat => categories.has(cat)) || null
        if (!primaryCategory && entry.sourceModule === 'inventory') {
            const journalRole = entry.metadata?.journalRole
            if (journalRole === 'cogs') primaryCategory = 'cmv'
            else if (journalRole === 'sale') primaryCategory = 'ventas'
            else if (entry.sourceType === 'purchase') primaryCategory = 'compras'
            else if (entry.sourceType === 'sale') primaryCategory = 'cmv'
            else if (entry.sourceType === 'adjustment') primaryCategory = 'mercaderias'
            else primaryCategory = 'mercaderias'
        }
        const triggerAccountId = primaryCategory
            ? entry.lines.find(line => matches.get(line.accountId)?.category === primaryCategory)?.accountId
            : undefined

        return {
            hasMatch: entry.sourceModule === 'inventory' || hasMatches,
            category: primaryCategory,
            triggerAccountId,
            matchedKeys,
        }
    }, [inventoryAccountResolution])

    const getEntryTypeLabel = useCallback((category: InventoryAccountCategory | null) => {
        if (!category) return 'Inventario'
        if (category === 'mercaderias') return 'Existencia/Refundicion'
        if (category === 'compras') return 'Compra/Dev/Bonif'
        if (category === 'cmv') return 'CMV'
        if (category === 'ventas') return 'Ventas'
        return 'Inventario'
    }, [])

    const sanitizeMappings = useCallback((mappings: Partial<Record<AccountMappingKey, string>>) => {
        const cleaned: Partial<Record<AccountMappingKey, string>> = {}
        Object.entries(mappings).forEach(([key, value]) => {
            if (value && value.trim()) {
                cleaned[key as AccountMappingKey] = value.trim()
            }
        })
        return cleaned
    }, [])

    const mappingsDirty = useMemo(() => {
        const current = sanitizeMappings(accountMappingsDraft)
        const saved = sanitizeMappings(settings?.accountMappings || {})
        return JSON.stringify(current) !== JSON.stringify(saved)
    }, [accountMappingsDraft, sanitizeMappings, settings])

    const savedMappings = useMemo(() => sanitizeMappings(settings?.accountMappings || {}), [sanitizeMappings, settings])

    const accountMappingsSummary = useMemo(() => {
        return BIENES_ACCOUNT_RULES
            .map(rule => {
                const value = savedMappings[rule.key]
                if (!value) return null
                const account = resolveAccountByIdOrCode(value)
                if (!account) return null
                return { key: rule.key, label: rule.label, account }
            })
            .filter(Boolean) as { key: AccountMappingKey; label: string; account: Account }[]
    }, [resolveAccountByIdOrCode, savedMappings])

    const hasSavedMappings = accountMappingsSummary.length > 0

    const periodGoals = useMemo(() => {
        return settings?.periodGoals?.[periodId] || {}
    }, [periodId, settings])

    const salesGoal = typeof periodGoals.salesTarget === 'number' ? periodGoals.salesTarget : null
    const marginGoal = typeof periodGoals.marginTarget === 'number' ? periodGoals.marginTarget : 40

    const salesDelta = useMemo(() => {
        const { prevStart, prevEnd } = monthRange
        if (!prevStart || !prevEnd) return null
        const prevSales = movements
            .filter(m => m.type === 'SALE' && m.date >= prevStart && m.date <= prevEnd)
            .reduce((sum, m) => sum + m.subtotal, 0)
        if (prevSales <= 0 || kpis.salesPeriod <= 0) return null
        return ((kpis.salesPeriod - prevSales) / prevSales) * 100
    }, [kpis.salesPeriod, monthRange, movements])

    const stockDelta = useMemo(() => {
        if (!settings) return null
        const { prevEnd } = monthRange
        if (!prevEnd) return null
        const currentCutoff = monthRange.end
        const prevCutoff = prevEnd

        const currentMovements = movements.filter(m => m.date <= currentCutoff)
        const prevMovements = movements.filter(m => m.date <= prevCutoff)

        const currentStock = calculateAllValuations(products, currentMovements, settings.costMethod)
            .reduce((sum, v) => sum + v.totalValue, 0)
        const prevStock = calculateAllValuations(products, prevMovements, settings.costMethod)
            .reduce((sum, v) => sum + v.totalValue, 0)

        if (prevStock <= 0 || currentStock <= 0) return null
        return ((currentStock - prevStock) / prevStock) * 100
    }, [monthRange, movements, products, settings])

    const salesProgress = useMemo(() => {
        if (!salesGoal || salesGoal <= 0) return null
        return Math.min(1, kpis.salesPeriod / salesGoal)
    }, [kpis.salesPeriod, salesGoal])

    const getMovementAmounts = useCallback((movement: BienesMovement) => {
        if (movement.type === 'SALE') {
            return {
                primary: movement.total,
                secondary: movement.costTotalAssigned || 0,
            }
        }
        if (movement.type === 'ADJUSTMENT') {
            const primary = Math.abs(movement.subtotal || 0)
            const secondary = Math.abs(movement.costTotalAssigned || 0)
            return { primary: primary || secondary, secondary }
        }
        return { primary: movement.total, secondary: 0 }
    }, [])

    const getDaysDiff = useCallback((a: string, b: string) => {
        const dateA = new Date(a + 'T00:00:00').getTime()
        const dateB = new Date(b + 'T00:00:00').getTime()
        return Math.abs(Math.round((dateA - dateB) / (1000 * 60 * 60 * 24)))
    }, [])

    const scoreEntryCandidate = useCallback((movement: BienesMovement, entry: JournalEntry) => {
        const daysDiff = getDaysDiff(movement.date, entry.date)
        const entryTotal = Math.abs(getEntryTotal(entry))
        const { primary, secondary } = getMovementAmounts(movement)
        const primaryAmount = Math.abs(primary)
        const secondaryAmount = Math.abs(secondary)
        const primaryDiff = primaryAmount > 0 ? Math.abs(entryTotal - primaryAmount) / primaryAmount : 1
        const secondaryDiff = secondaryAmount > 0 ? Math.abs(entryTotal - secondaryAmount) / secondaryAmount : 1
        const diff = Math.min(primaryDiff, secondaryDiff)

        const entryMatch = getEntryInventoryMatch(entry)
        const matchedKeys = entryMatch.matchedKeys || []
        const isPurchase = matchedKeys.includes('compras') || matchedKeys.includes('gastosCompras')
        const isPurchaseAdjustment = matchedKeys.includes('bonifCompras') || matchedKeys.includes('devolCompras')
        const isSales = entryMatch.category === 'ventas' || matchedKeys.includes('ventas') || matchedKeys.includes('bonifVentas') || matchedKeys.includes('devolVentas')
        const isCMV = matchedKeys.includes('cmv') || entryMatch.category === 'cmv'
        const isMercaderias = matchedKeys.includes('mercaderias') || entryMatch.category === 'mercaderias'

        const matchesMovementType = movement.type === 'PURCHASE'
            ? (isPurchase || isMercaderias) && !isPurchaseAdjustment
            : movement.type === 'ADJUSTMENT'
                ? isPurchaseAdjustment || isMercaderias
                : movement.type === 'SALE'
                    ? isCMV || isSales
                    : false

        if (matchesMovementType && daysDiff <= 2 && diff <= 0.01) {
            return { score: 'high', daysDiff, diff }
        }
        if (daysDiff <= 7 && diff <= 0.03) {
            return { score: 'medium', daysDiff, diff }
        }
        if (matchesMovementType) {
            return { score: 'low', daysDiff, diff }
        }
        return { score: 'none', daysDiff, diff }
    }, [getDaysDiff, getEntryInventoryMatch, getEntryTotal, getMovementAmounts])

    const inferMovementTypeFromEntry = useCallback((entry: JournalEntry) => {
        const match = getEntryInventoryMatch(entry)
        const matchedKeys = match.matchedKeys || []
        const isPurchaseAdjustment = matchedKeys.includes('bonifCompras') || matchedKeys.includes('devolCompras')

        if (isPurchaseAdjustment) return 'ADJUSTMENT'
        if (match.category === 'cmv' || match.category === 'ventas' || matchedKeys.includes('ventas') || matchedKeys.includes('bonifVentas') || matchedKeys.includes('devolVentas')) {
            return 'SALE'
        }
        if (matchedKeys.includes('compras') || matchedKeys.includes('gastosCompras')) return 'PURCHASE'
        if (match.category === 'mercaderias') return 'ADJUSTMENT'
        return 'PURCHASE'
    }, [getEntryInventoryMatch])

    const inferAdjustmentDirection = useCallback((entry: JournalEntry) => {
        if (!mercaderiasAccountId) return 'IN'
        const line = entry.lines.find(l => l.accountId === mercaderiasAccountId)
        if (!line) return 'IN'
        return line.debit > 0 ? 'IN' : 'OUT'
    }, [mercaderiasAccountId])

    const linkedEntryIds = useMemo(() => {
        const ids = new Set<string>()
        movements.forEach(movement => {
            movement.linkedJournalEntryIds?.forEach(id => ids.add(id))
        })
        const movementIds = new Set(movements.map(m => m.id))
        scopedJournalEntries.forEach(entry => {
            if (entry.sourceModule === 'inventory' && entry.sourceId && movementIds.has(entry.sourceId)) {
                ids.add(entry.id)
            }
        })
        return ids
    }, [movements, scopedJournalEntries])

    const inventoryEntries = useMemo(() => {
        return scopedJournalEntries.filter(entry => {
            if (entry.sourceModule === 'inventory') return true
            return getEntryInventoryMatch(entry).hasMatch
        })
    }, [scopedJournalEntries, getEntryInventoryMatch])

    const movementsWithoutEntry = useMemo(() => {
        return movements.filter(movement => (movement.linkedJournalEntryIds || []).length === 0)
    }, [movements])

    const entriesWithoutMovement = useMemo(() => {
        return inventoryEntries.filter(entry => !linkedEntryIds.has(entry.id))
    }, [inventoryEntries, linkedEntryIds])

    const conciliacionCount = movementsWithoutEntry.length + entriesWithoutMovement.length

    const getEntryCandidatesForMovement = useCallback((movement: BienesMovement) => {
        return inventoryEntries
            .map(entry => {
                const match = scoreEntryCandidate(movement, entry)
                return { entry, ...match }
            })
            .filter(candidate => candidate.score !== 'none')
            .sort((a, b) => {
                const scoreRank = { high: 3, medium: 2, low: 1 }
                return scoreRank[b.score as 'high' | 'medium' | 'low'] - scoreRank[a.score as 'high' | 'medium' | 'low']
            })
            .slice(0, 4)
    }, [inventoryEntries, scoreEntryCandidate])

    const getMovementCandidatesForEntry = useCallback((entry: JournalEntry) => {
        return movements
            .map(movement => {
                const match = scoreEntryCandidate(movement, entry)
                return { movement, ...match }
            })
            .filter(candidate => candidate.score !== 'none')
            .sort((a, b) => {
                const scoreRank = { high: 3, medium: 2, low: 1 }
                return scoreRank[b.score as 'high' | 'medium' | 'low'] - scoreRank[a.score as 'high' | 'medium' | 'low']
            })
            .slice(0, 4)
    }, [movements, scoreEntryCandidate])

    const linkMovementCandidates = useMemo(() => {
        if (!linkMovementTarget) return []
        return getEntryCandidatesForMovement(linkMovementTarget)
    }, [linkMovementTarget, getEntryCandidatesForMovement])

    const linkEntryCandidates = useMemo(() => {
        if (!linkEntryTarget) return []
        return getMovementCandidatesForEntry(linkEntryTarget)
    }, [linkEntryTarget, getMovementCandidatesForEntry])

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-slate-500">Cargando...</div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-display font-semibold text-slate-900">
                        Bienes de Cambio (Mercaderias)
                    </h2>
                    <div className="hidden sm:flex items-center px-2 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs font-mono text-slate-600">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                        Periodo {monthRange.label}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Inventory Mode Badge */}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        settings?.inventoryMode === 'PERIODIC'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                    }`}>
                        {settings?.inventoryMode === 'PERIODIC' ? 'Diferencias' : 'Permanente'}
                    </span>
                    {/* Costing Method Selector */}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Metodo:</span>
                        <select
                            value={settings?.costMethod || 'PPP'}
                            onChange={(e) => handleChangeCostMethod(e.target.value as CostingMethod)}
                            className="px-2 py-1 border border-slate-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            disabled={costMethodLocked}
                            title={costMethodLocked ? 'Bloqueado: ya hay ventas registradas' : undefined}
                        >
                            <option value="PPP">Prom. Ponderado</option>
                            <option value="FIFO">FIFO (PEPS)</option>
                            <option value="LIFO">LIFO (UEPS)</option>
                        </select>
                        {costMethodLocked && (
                            <span className="text-xs text-amber-600" title="Hay ventas registradas">
                                <Warning size={14} weight="fill" />
                            </span>
                        )}
                    </div>
                    {/* Settings Gear */}
                    <button
                        onClick={openAccountConfigModal}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Configuracion del modulo"
                    >
                        <GearSix size={20} />
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white border-b border-slate-200 px-6 pt-2 shrink-0">
                <div className="flex space-x-6 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 px-1 text-sm transition-all whitespace-nowrap flex items-center gap-2 border-b-2 ${
                                activeTab === tab.id
                                    ? 'text-blue-600 border-blue-600 font-semibold'
                                    : 'text-slate-500 border-transparent hover:text-slate-900 hover:border-slate-200'
                            }`}
                        >
                            {tab.label}
                            {tab.id === 'conciliacion' && conciliacionCount > 0 && (
                                <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {conciliacionCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                {/* DASHBOARD TAB */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Stock Valuado
                                    </span>
                                    <Coins className="text-blue-600" size={20} weight="duotone" />
                                </div>
                                <div className="font-mono text-2xl font-medium text-slate-900">
                                    {formatCurrency(kpis.stockValue)}
                                </div>
                                {stockDelta !== null ? (
                                    <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${
                                        stockDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
                                    }`}>
                                        <TrendUp weight="bold" size={12} /> {stockDelta >= 0 ? '+' : ''}{stockDelta.toFixed(1)}% vs mes anterior
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 mt-1">Sin base previa</div>
                                )}
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Unidades
                                    </span>
                                    <Package className="text-emerald-600" size={20} weight="duotone" />
                                </div>
                                <div className="font-mono text-2xl font-medium text-slate-900">
                                    {kpis.totalUnits.toLocaleString()} <span className="text-sm text-slate-500 font-sans">u.</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                    {kpis.totalProducts} productos activos
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Ventas (Periodo)
                                    </span>
                                    <ChartBar className="text-purple-500" size={20} weight="duotone" />
                                </div>
                                <div className="font-mono text-2xl font-medium text-slate-900">
                                    {formatCurrency(kpis.salesPeriod)}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Mes {monthRange.label}
                                </div>
                                {salesDelta !== null ? (
                                    <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${
                                        salesDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
                                    }`}>
                                        <TrendUp weight="bold" size={12} /> {salesDelta >= 0 ? '+' : ''}{salesDelta.toFixed(1)}% vs mes anterior
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 mt-1">Sin base previa</div>
                                )}
                                {salesProgress !== null ? (
                                    <>
                                        <div className="h-1 w-full bg-gray-100 rounded-full mt-3 overflow-hidden">
                                            <div
                                                className="h-full bg-purple-500 rounded-full"
                                                style={{ width: `${salesProgress * 100}%` }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openGoalModal('sales')}
                                            className="text-xs text-slate-500 mt-2 hover:text-slate-700"
                                        >
                                            Obj: {formatCurrency(salesGoal ?? 0)} (editar)
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openGoalModal('sales')}
                                        className="text-xs text-slate-400 mt-2 hover:text-slate-600"
                                    >
                                        Sin objetivo configurado
                                    </button>
                                )}
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Margen Bruto
                                    </span>
                                    <div className="flex items-center gap-2 text-orange-500">
                                        <Percent size={20} weight="duotone" />
                                        <span
                                            className="text-xs text-slate-400"
                                            title="Margen bruto = (Ventas - CMV) / Ventas"
                                        >
                                            <Info size={14} />
                                        </span>
                                    </div>
                                </div>
                                <div className="font-mono text-2xl font-medium text-slate-900">
                                    {kpis.grossMargin.toFixed(1)}%
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openGoalModal('margin')}
                                    className="text-xs text-slate-500 mt-1 hover:text-slate-700"
                                >
                                    Objetivo: {marginGoal.toFixed(1)}%
                                </button>
                                {kpis.salesPeriod <= 0 && (
                                    <div className="text-xs text-slate-400 mt-1">- Sin ventas en el periodo</div>
                                )}
                            </div>
                        </div>

                        {/* Low Stock Alert */}
                        {lowStockCount > 0 && (
                            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex items-start gap-3">
                                <Warning className="text-orange-500 mt-0.5" size={20} weight="fill" />
                                <div>
                                    <h4 className="text-orange-900 font-semibold text-sm">Stock Bajo Detectado</h4>
                                    <p className="text-orange-800 text-xs mt-1">
                                        Tenes {lowStockCount} items bajo stock minimo.
                                        Considera reponer pronto.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={openNewMovementModal}
                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all"
                            >
                                <Plus weight="bold" size={16} /> Registrar Movimiento
                            </button>
                            <button
                                onClick={() => setActiveTab('productos')}
                                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                            >
                                <MagnifyingGlass weight="bold" size={16} /> Consultar Stock
                            </button>
                        </div>

                        {/* Empty State */}
                        {products.length === 0 && (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <Package className="mx-auto text-slate-300 mb-4" size={48} weight="duotone" />
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin productos todavia</h3>
                                <p className="text-slate-500 mb-6">Comenza creando tu primer producto de inventario.</p>
                                <button
                                    onClick={() => setProductModalOpen(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                                >
                                    Crear primer producto
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* PRODUCTOS TAB */}
                {activeTab === 'productos' && (
                    <div className="space-y-4 animate-fade-in">
                        {/* Toolbar */}
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="relative w-full max-w-md">
                                    <MagnifyingGlass className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, SKU..."
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingProduct(null)
                                    setProductModalOpen(true)
                                }}
                                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-md text-sm font-medium ml-3 whitespace-nowrap hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Plus size={16} /> Nuevo Producto
                            </button>
                        </div>

                        {/* Products Table */}
                        {filteredProducts.length > 0 ? (
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoria</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Stock</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Costo Prom.</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Valor Total</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 text-sm">
                                            {filteredProducts.map((product) => {
                                                const valuation = valuations.find(v => v.product.id === product.id)
                                                return (
                                                    <tr
                                                        key={product.id}
                                                        className={`hover:bg-slate-50 transition-colors ${valuation?.hasAlert ? 'bg-red-50/30' : ''}`}
                                                    >
                                                        <td className="py-3 px-4 font-mono text-slate-500">{product.sku}</td>
                                                        <td className="py-3 px-4 font-medium text-slate-900">{product.name}</td>
                                                        <td className="py-3 px-4">
                                                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
                                                                {product.category}
                                                            </span>
                                                        </td>
                                                        <td className={`py-3 px-4 text-right font-mono font-medium ${valuation?.hasAlert ? 'text-red-600' : ''}`}>
                                                            {valuation?.currentStock || 0} {product.unit}
                                                        </td>
                                                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                                                            {formatCurrency(valuation?.averageCost || 0)}
                                                        </td>
                                                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                                                            {formatCurrency(valuation?.totalValue || 0)}
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingProduct(product)
                                                                    setProductModalOpen(true)
                                                                }}
                                                                className="text-slate-400 hover:text-blue-600 p-1"
                                                                title="Editar"
                                                            >
                                                                <PencilSimple size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProduct(product.id)}
                                                                className="text-slate-400 hover:text-red-600 p-1 ml-1"
                                                                title="Eliminar"
                                                            >
                                                                <Trash size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <Package className="mx-auto text-slate-300 mb-4" size={48} weight="duotone" />
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    {productSearch ? 'Sin resultados' : 'Sin productos'}
                                </h3>
                                <p className="text-slate-500 mb-6">
                                    {productSearch
                                        ? 'No se encontraron productos con esa busqueda.'
                                        : 'Comenza creando tu primer producto.'}
                                </p>
                                {!productSearch && (
                                    <button
                                        onClick={() => setProductModalOpen(true)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                                    >
                                        Crear producto
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* MOVIMIENTOS TAB */}
                {activeTab === 'movimientos' && (
                    <div className="space-y-4 animate-fade-in">
                        {/* Header */}
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-900">Kardex de Movimientos</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setClearModalOpen(true)}
                                    className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-md text-sm hover:bg-red-50 flex items-center gap-2"
                                >
                                    <Trash size={16} /> Limpiar
                                </button>
                                <button className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-50 flex items-center gap-2">
                                    <Export size={16} /> Exportar
                                </button>
                                <button
                                    onClick={openNewMovementModal}
                                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-md text-sm font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-2"
                                >
                                    <Plus weight="bold" size={16} /> Nuevo Movimiento
                                </button>
                            </div>
                        </div>

                        {/* Movements Table */}
                        {movements.length > 0 ? (
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Cant.</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Costo Unit.</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Asiento</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 text-sm">
                                            {movements.slice(0, 50).map((mov) => {
                                                const product = products.find(p => p.id === mov.productId)
                                                const typeLabels: Record<string, { label: string; color: string }> = {
                                                    PURCHASE: { label: 'Compra', color: 'bg-green-50 text-green-700' },
                                                    SALE: { label: 'Venta', color: 'bg-blue-50 text-blue-600' },
                                                    ADJUSTMENT: { label: 'Ajuste', color: 'bg-orange-50 text-orange-700' },
                                                    COUNT: { label: 'Conteo', color: 'bg-purple-50 text-purple-600' },
                                                }
                                                const typeInfo = typeLabels[mov.type] || { label: mov.type, color: 'bg-slate-50 text-slate-600' }
                                                const isEntry = mov.type === 'PURCHASE' || (mov.type === 'ADJUSTMENT' && mov.quantity > 0)
                                                const journalStatus = mov.journalStatus || ((mov.linkedJournalEntryIds || []).length > 0 ? 'generated' : 'none')
                                                const hasEntries = (mov.linkedJournalEntryIds || []).length > 0
                                                const statusConfig: Record<string, { label: string; className: string }> = {
                                                    generated: { label: 'Generado', className: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
                                                    linked: { label: 'Vinculado', className: 'text-blue-700 bg-blue-50 border-blue-100' },
                                                    none: { label: 'Sin asiento', className: 'text-slate-500 bg-slate-50 border-slate-200' },
                                                    missing: { label: 'Asiento eliminado', className: 'text-amber-700 bg-amber-50 border-amber-100' },
                                                    desync: { label: 'Desincronizado', className: 'text-orange-700 bg-orange-50 border-orange-100' },
                                                    error: { label: 'Error', className: 'text-red-600 bg-red-50 border-red-100' },
                                                }
                                                const status = statusConfig[journalStatus] || statusConfig.none
                                                const generateLabel = journalStatus === 'error'
                                                    ? 'Reintentar'
                                                    : journalStatus === 'missing'
                                                        ? 'Regenerar'
                                                        : 'Generar'

                                                return (
                                                    <tr key={mov.id} className="hover:bg-slate-50">
                                                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                                                            {formatDate(mov.date)}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`${typeInfo.color} px-2 py-0.5 rounded text-xs font-bold uppercase`}>
                                                                {typeInfo.label}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 font-medium text-slate-900">
                                                            {product?.name || 'Producto eliminado'}
                                                        </td>
                                                        <td className={`py-3 px-4 text-right font-mono ${isEntry ? 'text-green-600' : 'text-slate-900'}`}>
                                                            {isEntry ? '+' : '-'}{Math.abs(mov.quantity)}
                                                        </td>
                                                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                                                            {formatCurrency(mov.unitCost || mov.costUnitAssigned || 0)}
                                                        </td>
                                                        <td className="py-3 px-4 text-right font-mono font-medium">
                                                            {formatCurrency(mov.total)}
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <div className="flex flex-col items-center gap-2">
                                                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>
                                                                    {journalStatus === 'generated' && <CheckCircle weight="fill" size={12} />}
                                                                    {journalStatus === 'linked' && <LinkSimple size={12} weight="bold" />}
                                                                    {journalStatus === 'none' && <Info size={12} />}
                                                                    {journalStatus === 'missing' && <Warning size={12} weight="fill" />}
                                                                    {journalStatus === 'desync' && <Warning size={12} weight="fill" />}
                                                                    {journalStatus === 'error' && <Warning size={12} weight="fill" />}
                                                                    {status.label}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    {hasEntries ? (
                                                                        <button
                                                                            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                                                                            onClick={() => handleOpenEntryDrawer(mov.linkedJournalEntryIds)}
                                                                        >
                                                                            <ArrowSquareOut size={12} /> Ver
                                                                        </button>
                                                                    ) : mov.type !== 'COUNT' ? (
                                                                        <button
                                                                            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                                                                            onClick={() => handleGenerateJournal(mov.id)}
                                                                        >
                                                                            <Sparkle size={12} /> {generateLabel}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-[11px] text-slate-400">No aplica</span>
                                                                    )}
                                                                    <button
                                                                        className="text-xs text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1"
                                                                        onClick={() => handleStartLinkMovement(mov)}
                                                                    >
                                                                        <LinkSimple size={12} /> Vincular
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                                                                    onClick={() => handleEditMovement(mov)}
                                                                >
                                                                    <PencilSimple size={14} /> Editar
                                                                </button>
                                                                <button
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                                                                    onClick={() => handleDeleteMovement(mov)}
                                                                >
                                                                    <Trash size={14} /> Eliminar
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <ChartBar className="mx-auto text-slate-300 mb-4" size={48} weight="duotone" />
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin movimientos</h3>
                                <p className="text-slate-500 mb-6">
                                    Registra tu primera compra o venta para ver el kardex.
                                </p>
                                <button
                                    onClick={openNewMovementModal}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                                >
                                    Registrar movimiento
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* CONCILIACION TAB */}
                {activeTab === 'conciliacion' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-50 p-2 rounded-full">
                                    <Scales className="text-blue-600" size={22} weight="duotone" />
                                </div>
                                <div>
                                    <h3 className="text-slate-900 font-semibold text-sm">
                                        Conciliacion Inventario vs Contabilidad
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Detecta movimientos sin asiento y asientos sin movimiento.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-semibold">
                                    Movimientos sin asiento: {movementsWithoutEntry.length}
                                </span>
                                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-semibold">
                                    Asientos sin movimiento: {entriesWithoutMovement.length}
                                </span>
                            </div>
                        </div>
                        {inventoryAccountResolution.usedHeuristic && (
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                                <Info size={16} className="mt-0.5" />
                                <div>
                                    Detectamos cuentas de bienes de cambio por nombre o codigo. Recomendado: configurarlas en Operaciones → Inventario → Cierre.
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Panel A */}
                            <div className="bg-white rounded-xl border border-slate-200 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-semibold text-slate-900">Movimientos sin asiento</h4>
                                    <span className="text-xs text-slate-400">Panel A</span>
                                </div>

                                {movementsWithoutEntry.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm py-8">
                                        Todo conciliado en inventario.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {movementsWithoutEntry.map((mov) => {
                                            const product = products.find(p => p.id === mov.productId)
                                            const candidates = getEntryCandidatesForMovement(mov)
                                            const hasError = mov.journalStatus === 'error'
                                            const isMissing = mov.journalStatus === 'missing'
                                            return (
                                                <div key={mov.id} className="border border-slate-200 rounded-lg p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-900">
                                                            {product?.name || 'Producto eliminado'}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            {formatDate(mov.date)} • {mov.type}
                                                        </div>
                                                    </div>
                                                    <div className="font-mono text-sm text-slate-700">
                                                        {formatCurrency(mov.total)}
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => handleGenerateJournal(mov.id)}
                                                        className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                    >
                                                        {hasError ? 'Reintentar' : isMissing ? 'Regenerar asiento' : 'Generar asiento'}
                                                    </button>
                                                        <button
                                                            onClick={() => handleStartLinkMovement(mov)}
                                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-slate-600 border border-slate-200"
                                                        >
                                                            Vincular
                                                        </button>
                                                    </div>

                                                    {candidates.length > 0 && (
                                                        <div className="mt-3 border-t border-dashed border-slate-200 pt-2 space-y-2">
                                                            <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                                                Sugerencias
                                                            </div>
                                                            {candidates.map(({ entry, score }) => (
                                                                <button
                                                                    key={entry.id}
                                                                    onClick={() => {
                                                                        setLinkMovementTarget(mov)
                                                                        setSelectedLinkEntryId(entry.id)
                                                                    }}
                                                                    className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-slate-900"
                                                                >
                                                                    <span className="truncate">
                                                                        {entry.memo || 'Asiento sin leyenda'}
                                                                    </span>
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded-full border text-[10px] ${
                                                                            score === 'high'
                                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                                : score === 'medium'
                                                                                    ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                                                        }`}
                                                                    >
                                                                        {score === 'high' ? 'Alto' : score === 'medium' ? 'Medio' : 'Bajo'}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Panel B */}
                            <div className="bg-white rounded-xl border border-slate-200 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-semibold text-slate-900">Asientos sin movimiento</h4>
                                    <span className="text-xs text-slate-400">Panel B</span>
                                </div>

                                {entriesWithoutMovement.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm py-8">
                                        No hay asientos pendientes de inventario.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {entriesWithoutMovement.map((entry) => {
                                            const total = getEntryTotal(entry)
                                            const candidates = getMovementCandidatesForEntry(entry)
                                            const entryMatch = getEntryInventoryMatch(entry)
                                            const entryTypeLabel = getEntryTypeLabel(entryMatch.category)
                                            const triggerAccountName = entryMatch.triggerAccountId
                                                ? getAccountName(entryMatch.triggerAccountId)
                                                : null
                                            return (
                                                <div key={entry.id} className="border border-slate-200 rounded-lg p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-slate-900">
                                                                {entry.memo || 'Asiento sin leyenda'}
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {formatDate(entry.date)} • {entry.id.slice(0, 8)}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                                                                <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                                                                    {entryTypeLabel}
                                                                </span>
                                                                {triggerAccountName && (
                                                                    <span className="text-slate-400">
                                                                        Cuenta: {triggerAccountName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="font-mono text-sm text-slate-700">
                                                            {formatCurrency(total)}
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => handleCreateMovementFromEntry(entry)}
                                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                        >
                                                            Crear movimiento
                                                        </button>
                                                        <button
                                                            onClick={() => handleStartLinkEntry(entry)}
                                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-slate-600 border border-slate-200"
                                                        >
                                                            Vincular
                                                        </button>
                                                    </div>

                                                    {candidates.length > 0 && (
                                                        <div className="mt-3 border-t border-dashed border-slate-200 pt-2 space-y-2">
                                                            <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                                                Sugerencias
                                                            </div>
                                                            {candidates.map(({ movement, score }) => {
                                                                const product = products.find(p => p.id === movement.productId)
                                                                return (
                                                                    <button
                                                                        key={movement.id}
                                                                        onClick={() => {
                                                                            setLinkEntryTarget(entry)
                                                                            setSelectedLinkMovementId(movement.id)
                                                                        }}
                                                                        className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-slate-900"
                                                                    >
                                                                        <span className="truncate">
                                                                            {product?.name || 'Movimiento'} • {movement.type}
                                                                        </span>
                                                                        <span
                                                                            className={`px-2 py-0.5 rounded-full border text-[10px] ${
                                                                                score === 'high'
                                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                                    : score === 'medium'
                                                                                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                                                            }`}
                                                                        >
                                                                            {score === 'high' ? 'Alto' : score === 'medium' ? 'Medio' : 'Bajo'}
                                                                        </span>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* CIERRE TAB */}
                {activeTab === 'cierre' && (
                    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-900">Cierre de Inventario</h3>
                            <p className="text-slate-500">
                                {settings?.inventoryMode === 'PERIODIC'
                                    ? 'Modo Diferencias: CMV = EI + Compras Netas - EF. Genera 3 asientos de refundicion.'
                                    : `Modo Permanente: ajuste de inventario fisico vs teorico (${settings?.costMethod}).`
                                }
                            </p>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-900">Cuentas Bienes de Cambio</h4>
                                    <p className="text-xs text-slate-500">
                                        Se usan para conciliacion contable y asientos transitorios del inventario.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                                        hasSavedMappings
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                    }`}>
                                        {hasSavedMappings ? 'Configurado' : 'Sin configurar'}
                                    </span>
                                    <button
                                        onClick={openAccountConfigModal}
                                        className="px-3 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white"
                                    >
                                        Configurar cuentas
                                    </button>
                                </div>
                            </div>

                            {accountMappingsSummary.length > 0 ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {accountMappingsSummary.map(({ key, label, account }) => (
                                        <span
                                            key={key}
                                            className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold"
                                        >
                                            {label}: {account.code}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-4 text-xs text-slate-400">
                                    Todavia no hay cuentas configuradas para bienes de cambio.
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                                    <span className="text-sm font-medium text-slate-500">Existencia Inicial</span>
                                    <span className="font-mono text-lg font-medium text-slate-900">
                                        {formatCurrency(existenciaInicial)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                                    <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                        <Plus className="text-green-500" size={16} weight="bold" /> Compras del Periodo
                                    </span>
                                    <span className="font-mono text-lg font-medium text-green-600">
                                        {formatCurrency(comprasPeriodo)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center py-4 bg-slate-50 px-3 rounded-lg border border-slate-200">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-900 mb-1">Existencia Final (Teorico)</span>
                                        <span className="text-xs text-slate-500">Calculado por metodo {settings?.costMethod}</span>
                                    </div>
                                    <span className="font-mono text-xl font-bold text-slate-900">
                                        {formatCurrency(inventarioTeorico)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center py-3 border-b border-slate-200">
                                    <div>
                                        <span className="text-sm font-medium text-slate-600">Inventario Final (Fisico)</span>
                                        <p className="text-xs text-slate-400">Ingresar valor contado</p>
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        value={closingPhysicalValue || ''}
                                        onChange={(e) => setClosingPhysicalValue(Number(e.target.value))}
                                        className="w-40 border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        placeholder="0"
                                    />
                                </div>

                                <div className="flex justify-between items-center py-3">
                                    <span className="text-sm font-medium text-slate-500">Diferencia vs teorico</span>
                                    <span className={`font-mono text-lg font-semibold ${Math.abs(diferenciaCierre) < 0.01 ? 'text-slate-500' : diferenciaCierre > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {formatCurrency(diferenciaCierre)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center pt-4 mt-4 border-t-2 border-slate-200">
                                    <span className="text-lg font-bold text-slate-900">CMV por diferencias</span>
                                    <span className="font-mono text-2xl font-bold text-blue-600">
                                        {formatCurrency(cmvPorDiferencia)}
                                    </span>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">
                                    Previsualizacion Asiento de Cierre
                                </h4>
                                <div className="font-mono text-xs space-y-2">
                                    {cierreAjusteMonto < 0.01 ? (
                                        <div className="text-slate-500">Sin diferencias para ajustar.</div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between">
                                                <span>{cierreAjusteEntrada ? '1.1.04.01 Mercaderias' : '4.3.02 Diferencia de inventario'}</span>
                                                <div className="flex gap-4">
                                                    <span className="w-24 text-right font-bold">{formatCurrency(cierreAjusteMonto)}</span>
                                                    <span className="w-24 text-right text-slate-400">-</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>{cierreAjusteEntrada ? '4.3.02 Diferencia de inventario' : '1.1.04.01 Mercaderias'}</span>
                                                <div className="flex gap-4">
                                                    <span className="w-24 text-right text-slate-400">-</span>
                                                    <span className="w-24 text-right font-bold">{formatCurrency(cierreAjusteMonto)}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateClosingEntry}
                                disabled={closingIsSaving || closingPhysicalValue <= 0}
                                className="w-full mt-6 py-3 rounded-lg font-semibold bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={closingPhysicalValue <= 0 ? 'Ingresa el inventario final fisico' : undefined}
                            >
                                {closingIsSaving ? 'Generando...' : settings?.inventoryMode === 'PERIODIC' ? 'Generar Asientos de Cierre Periodico' : 'Generar Asiento de Cierre'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {productModalOpen && (
                <ProductModal
                    product={editingProduct}
                    onSave={handleSaveProduct}
                    onClose={() => {
                        setProductModalOpen(false)
                        setEditingProduct(null)
                    }}
                    defaultAutoJournal={settings?.autoJournalEntries ?? true}
                />
            )}

            {movementModalOpen && settings && (
                <MovementModal
                    products={products}
                    valuations={valuations}
                    costMethod={settings.costMethod}
                    onSave={handleSaveMovement}
                    initialData={movementPrefill || undefined}
                    mode={editingMovement ? 'edit' : 'create'}
                    onClose={() => {
                        setMovementModalOpen(false)
                        setMovementPrefill(null)
                        setPendingLinkEntryId(null)
                        setEditingMovement(null)
                        setManualEditAction(null)
                    }}
                />
            )}

            {accountConfigOpen && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setAccountConfigOpen(false)}
                    />
                    <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-display font-semibold text-lg">Configurar cuentas Bienes de Cambio</h3>
                                <p className="text-xs text-slate-500">
                                    Mapea las cuentas contables para conciliacion y asientos transitorios.
                                </p>
                            </div>
                            <button
                                onClick={() => setAccountConfigOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Inventory Mode & Auto-Journal */}
                            <div className="space-y-4">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                                    Modo contable
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="inventoryMode"
                                            value="PERMANENT"
                                            checked={(settings?.inventoryMode || 'PERMANENT') === 'PERMANENT'}
                                            onChange={() => handleChangeInventoryMode('PERMANENT')}
                                            className="accent-blue-600"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-slate-700">Permanente</span>
                                            <p className="text-[11px] text-slate-400">CMV automatico en cada venta</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="inventoryMode"
                                            value="PERIODIC"
                                            checked={settings?.inventoryMode === 'PERIODIC'}
                                            onChange={() => handleChangeInventoryMode('PERIODIC')}
                                            className="accent-blue-600"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-slate-700">Diferencias</span>
                                            <p className="text-[11px] text-slate-400">CMV al cierre (EI + CN - EF)</p>
                                        </div>
                                    </label>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer mt-2">
                                    <input
                                        type="checkbox"
                                        checked={settings?.autoJournalEntries ?? true}
                                        onChange={(e) => handleChangeAutoJournal(e.target.checked)}
                                        className="accent-blue-600 rounded"
                                    />
                                    <span className="text-sm text-slate-700">Generar asientos automaticamente al registrar movimientos</span>
                                </label>
                            </div>

                            <div className="border-t border-slate-100 pt-4">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">
                                    Cuentas contables
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {REQUIRED_BIENES_RULES.map(rule => {
                                    const selected = mappingAccounts.get(rule.key)
                                    const suggestion = suggestedAccounts.get(rule.key)
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
                                                value={{ code: selected?.code || '', name: selected?.name || '' }}
                                                onChange={(value) => handleAccountMappingChange(rule.key, value)}
                                                placeholder="Buscar cuenta..."
                                            />
                                            {!selected && suggestion && (
                                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                                    <span>Sugerida: {suggestion.code} - {suggestion.name}</span>
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
                            </div>

                            <div className="border-t border-slate-100 pt-4">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">
                                    Opcionales
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {OPTIONAL_BIENES_RULES.map(rule => {
                                        const selected = mappingAccounts.get(rule.key)
                                        const suggestion = suggestedAccounts.get(rule.key)
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
                                                    value={{ code: selected?.code || '', name: selected?.name || '' }}
                                                    onChange={(value) => handleAccountMappingChange(rule.key, value)}
                                                    placeholder="Buscar cuenta..."
                                                />
                                                {!selected && suggestion && (
                                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                                        <span>Sugerida: {suggestion.code} - {suggestion.name}</span>
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
                                </div>
                                <p className="text-[11px] text-slate-400 mt-3">
                                    Si no configuras estas cuentas, se usa deteccion automatica por nombre cuando aplica.
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setAccountConfigOpen(false)}
                                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleSaveAccountMappings(true)}
                                disabled={!mappingsDirty || accountMappingsSaving}
                                className="px-4 py-2 bg-slate-900 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {accountMappingsSaving ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {manualEditPrompt && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setManualEditPrompt(null)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
                            <h4 className="text-lg font-semibold text-slate-900">Movimiento con asiento manual</h4>
                            <p className="text-sm text-slate-500 mt-2">
                                Este movimiento esta vinculado a un asiento manual. Elegi como continuar.
                            </p>
                            <div className="mt-5 space-y-2">
                                <button
                                    onClick={() => handleConfirmManualEdit('keep')}
                                    className="w-full px-4 py-2 text-sm font-semibold rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                                >
                                    Editar inventario sin tocar el asiento
                                </button>
                                <button
                                    onClick={() => handleConfirmManualEdit('regenerate')}
                                    className="w-full px-4 py-2 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    Desvincular y generar asiento nuevo
                                </button>
                                <button
                                    onClick={() => setManualEditPrompt(null)}
                                    className="w-full px-4 py-2 text-sm font-semibold rounded-md text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {manualDeletePrompt && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setManualDeletePrompt(null)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
                            <h4 className="text-lg font-semibold text-slate-900">Eliminar movimiento</h4>
                            <p className="text-sm text-slate-500 mt-2">
                                Este movimiento esta vinculado a un asiento manual. El asiento se conservara.
                            </p>
                            <div className="mt-5 space-y-2">
                                <button
                                    onClick={handleConfirmManualDelete}
                                    className="w-full px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700"
                                >
                                    Eliminar movimiento y mantener asiento
                                </button>
                                <button
                                    onClick={() => setManualDeletePrompt(null)}
                                    className="w-full px-4 py-2 text-sm font-semibold rounded-md text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {entryDrawerOpen && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setEntryDrawerOpen(false)}
                    />
                    <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-display font-semibold text-lg">Detalle de Asientos</h3>
                                <p className="text-xs text-slate-500">
                                    {entryDrawerEntries.length} asiento{entryDrawerEntries.length === 1 ? '' : 's'} vinculado{entryDrawerEntries.length === 1 ? '' : 's'}
                                </p>
                            </div>
                            <button
                                onClick={() => setEntryDrawerOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <ArrowSquareOut size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {entryDrawerEntries.length === 0 ? (
                                <div className="text-center text-slate-500 text-sm">No hay asientos para mostrar.</div>
                            ) : (
                                entryDrawerEntries.map((entry) => {
                                    const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
                                    const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)
                                    return (
                                        <div key={entry.id} className="border border-slate-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">
                                                        {entry.memo || 'Asiento sin leyenda'}
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        {formatDate(entry.date)} • {entry.id.slice(0, 8)}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                                                    {entry.sourceType || 'manual'}
                                                </span>
                                            </div>
                                            <div className="mt-3 border border-slate-100 rounded-md overflow-hidden">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-50 text-slate-500">
                                                        <tr>
                                                            <th className="text-left px-3 py-2">Cuenta</th>
                                                            <th className="text-right px-3 py-2">Debe</th>
                                                            <th className="text-right px-3 py-2">Haber</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {entry.lines.map((line, idx) => (
                                                            <tr key={`${entry.id}-${idx}`}>
                                                                <td className="px-3 py-2 text-slate-600">
                                                                    {getAccountName(line.accountId)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-mono">
                                                                    {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-mono">
                                                                    {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-slate-50 text-slate-600">
                                                        <tr>
                                                            <td className="px-3 py-2 text-right font-semibold">Totales</td>
                                                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalDebit)}</td>
                                                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalCredit)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {clearModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => !clearBusy && setClearModalOpen(false)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-6">
                            <h4 className="text-lg font-semibold text-slate-900">Limpiar inventario</h4>
                            <p className="text-sm text-slate-500 mt-2">
                                Esto elimina productos y movimientos del periodo seleccionado. Elegi que hacer con los asientos.
                            </p>
                            <div className="mt-4 space-y-3">
                                <label className="flex items-start gap-3 border border-slate-200 rounded-lg p-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="clear-option"
                                        className="mt-1"
                                        checked={clearOption === 'delete'}
                                        onChange={() => setClearOption('delete')}
                                    />
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                            Limpiar inventario y borrar asientos generados
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Elimina los asientos automáticos del inventario para este periodo.
                                        </div>
                                    </div>
                                </label>
                                <label className="flex items-start gap-3 border border-slate-200 rounded-lg p-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="clear-option"
                                        className="mt-1"
                                        checked={clearOption === 'keep'}
                                        onChange={() => setClearOption('keep')}
                                    />
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                            Limpiar inventario y conservar asientos
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Mantiene los asientos pero desvincula del inventario.
                                        </div>
                                    </div>
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setClearModalOpen(false)}
                                    disabled={clearBusy}
                                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmClear}
                                    disabled={clearBusy}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50"
                                >
                                    {clearBusy ? 'Limpiando...' : 'Confirmar limpieza'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {goalModalOpen && goalType && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setGoalModalOpen(false)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
                            <h4 className="text-lg font-semibold text-slate-900">
                                {goalType === 'sales' ? 'Objetivo de ventas mensuales' : 'Objetivo de margen bruto'}
                            </h4>
                            <p className="text-sm text-slate-500 mt-2">
                                {goalType === 'sales'
                                    ? 'Define un objetivo mensual para comparar las ventas del periodo.'
                                    : 'Define el objetivo de margen bruto para el periodo.'}
                            </p>
                            <div className="mt-4">
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    {goalType === 'sales' ? 'Objetivo de ventas ($)' : 'Objetivo de margen (%)'}
                                </label>
                                <input
                                    type="number"
                                    min={goalType === 'sales' ? 0 : 0}
                                    max={goalType === 'sales' ? undefined : 100}
                                    step={goalType === 'sales' ? 1 : 0.1}
                                    value={goalDraft}
                                    onChange={(e) => setGoalDraft(e.target.value)}
                                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder={goalType === 'sales' ? 'Ej: 1000000' : 'Ej: 40'}
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setGoalModalOpen(false)}
                                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveGoal}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800"
                                >
                                    Guardar objetivo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {linkMovementTarget && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setLinkMovementTarget(null)}
                    />
                    <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-900">Vincular asiento</h3>
                            <p className="text-xs text-slate-500">
                                Movimiento #{linkMovementTarget.id.slice(0, 8)}
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-600">Selecciona un asiento</label>
                                <select
                                    value={selectedLinkEntryId}
                                    onChange={(e) => setSelectedLinkEntryId(e.target.value)}
                                    className="w-full mt-2 border border-slate-200 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="">Seleccionar...</option>
                                    {inventoryEntries.map(entry => (
                                        <option key={entry.id} value={entry.id}>
                                            {formatDate(entry.date)} - {entry.memo || 'Asiento'} ({formatCurrency(getEntryTotal(entry))})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {linkMovementCandidates.length > 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                                        Sugerencias
                                    </div>
                                    <div className="space-y-2">
                                        {linkMovementCandidates.map(({ entry, score }) => (
                                            <button
                                                key={entry.id}
                                                onClick={() => setSelectedLinkEntryId(entry.id)}
                                                className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md border ${
                                                    selectedLinkEntryId === entry.id
                                                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                        : 'border-slate-200 bg-white text-slate-600'
                                                }`}
                                            >
                                                <span className="truncate">{entry.memo || 'Asiento sin leyenda'}</span>
                                                <span className="text-[10px] uppercase">
                                                    {score === 'high' ? 'Alto' : score === 'medium' ? 'Medio' : 'Bajo'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                            <button
                                onClick={() => setLinkMovementTarget(null)}
                                className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-md"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmLinkMovement}
                                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md"
                            >
                                Vincular
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {linkEntryTarget && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setLinkEntryTarget(null)}
                    />
                    <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-900">Vincular movimiento</h3>
                            <p className="text-xs text-slate-500">
                                Asiento #{linkEntryTarget.id.slice(0, 8)}
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-600">Selecciona un movimiento</label>
                                <select
                                    value={selectedLinkMovementId}
                                    onChange={(e) => setSelectedLinkMovementId(e.target.value)}
                                    className="w-full mt-2 border border-slate-200 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="">Seleccionar...</option>
                                    {movements.map(movement => {
                                        const product = products.find(p => p.id === movement.productId)
                                        return (
                                            <option key={movement.id} value={movement.id}>
                                                {formatDate(movement.date)} - {product?.name || 'Movimiento'} ({movement.type})
                                            </option>
                                        )
                                    })}
                                </select>
                            </div>

                            {linkEntryCandidates.length > 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                                        Sugerencias
                                    </div>
                                    <div className="space-y-2">
                                        {linkEntryCandidates.map(({ movement, score }) => {
                                            const product = products.find(p => p.id === movement.productId)
                                            return (
                                                <button
                                                    key={movement.id}
                                                    onClick={() => setSelectedLinkMovementId(movement.id)}
                                                    className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md border ${
                                                        selectedLinkMovementId === movement.id
                                                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                            : 'border-slate-200 bg-white text-slate-600'
                                                    }`}
                                                >
                                                    <span className="truncate">{product?.name || 'Movimiento'} • {movement.type}</span>
                                                    <span className="text-[10px] uppercase">
                                                        {score === 'high' ? 'Alto' : score === 'medium' ? 'Medio' : 'Bajo'}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                            <button
                                onClick={() => setLinkEntryTarget(null)}
                                className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-md"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmLinkEntry}
                                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md"
                            >
                                Vincular
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-slide-in ${
                        toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
                    }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle className="text-emerald-400" size={20} weight="fill" />
                    ) : (
                        <Warning className="text-white" size={20} weight="fill" />
                    )}
                    <span className="font-medium text-sm">{toast.message}</span>
                </div>
            )}

            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-out;
                }
                @keyframes slide-in {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-in {
                    animation: slide-in 0.3s ease-out;
                }
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
