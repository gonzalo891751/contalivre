import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Package,
    Notebook,
    ArrowLeft,
    ArrowsLeftRight,
    WarningCircle,
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
    repairInitialStockMovements,
    clearBienesPeriodData,
    generatePeriodicClosingJournalEntries,
    getAccountBalanceByCode,
} from '../../storage'
import { resolveOpeningEquityAccountId } from '../../storage/openingEquity'
import { db } from '../../storage/db'
import {
    calculateAllValuations,
    calculateBienesKPIs,
    canChangeCostingMethod,
} from '../../core/inventario/costing'
import {
    computeEndingInventoryValuation,
    type EndingInventoryValuation,
    type ProductEndingValuation,
} from '../../core/inventario/valuation-homogenea'
import type { IndexRow } from '../../core/cierre-valuacion/types'
import { getPeriodFromDate } from '../../core/cierre-valuacion/calc'
import { loadCierreValuacionState } from '../../storage'
import {
    buildRT6InventoryApplyPlan,
    type RT6InventoryApplyPlan,
    type RT6ApplyPlanItem,
    type OriginCategory,
} from '../../core/inventario/rt6-apply-plan'
import ProductModal from './components/ProductModal'
import MovementModalV3 from './components/MovementModalV3'
import { AccountAutocomplete } from './components/AccountAutocomplete'
import ProductValuationCard from './components/ProductValuationCard'
import ProductLotsDrawer from './components/ProductLotsDrawer'
import CierreInventarioTab from './components/CierreInventarioTab'
import InventarioOnboardingWizard from './components/InventarioOnboardingWizard'

type TabId = 'dashboard' | 'productos' | 'movimientos' | 'conciliacion' | 'cierre'
type ConciliationFilter = 'all' | 'compras' | 'ventas' | 'rt6'

interface RT6CartItem {
    id: string
    productId: string
    productName: string
    concepto: string
    originMovementId?: string
    originMovementLabel?: string
    valorOrigen: number
    coeficiente: number
    valorHomogeneo: number
    delta: number
}

// RT6 Preview Modal types
interface RT6PreviewData {
    entry: JournalEntry
    adjustmentAmount: number
    entryPeriod: string
    plan: RT6InventoryApplyPlan
    isAlreadyApplied?: boolean
}

const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'productos', label: 'Productos' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'conciliacion', label: 'Conciliacion' },
    { id: 'cierre', label: 'Cierre' },
]

type InventoryAccountCategory = 'mercaderias' | 'compras' | 'cmv' | 'ventas' | 'rt6_adjustment'

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
        codes: [DEFAULT_ACCOUNT_CODES.compras, '4.8.01', '5.1.03'],
        nameAny: ['compra'],
    },
    {
        key: 'gastosCompras',
        label: 'Gastos sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.gastosCompras, '4.8.02', '5.1.04'],
        nameAny: ['gasto', 'flete', 'seguro', 'compra'],
        optional: true,
    },
    {
        key: 'bonifCompras',
        label: 'Bonificaciones sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.bonifCompras, '4.8.03', '5.1.05'],
        nameAll: ['bonif', 'compra'],
    },
    {
        key: 'devolCompras',
        label: 'Devoluciones sobre compras',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.devolCompras, '4.8.04', '5.1.06'],
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
        codes: ['3.1.01', DEFAULT_ACCOUNT_CODES.aperturaInventario, '3.2.01'],
        nameAny: ['capital social', 'capital suscripto', 'resultados acumulados', 'resultados no asignados', 'apertura'],
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
        codes: [DEFAULT_ACCOUNT_CODES.bonifVentas, '4.8.05', '4.1.03'],
        nameAll: ['bonif', 'venta'],
        optional: true,
    },
    {
        key: 'devolVentas',
        label: 'Devoluciones sobre ventas',
        category: 'ventas',
        codes: [DEFAULT_ACCOUNT_CODES.devolVentas, '4.8.06', '4.1.04'],
        nameAll: ['devol', 'venta'],
        optional: true,
    },
    {
        key: 'descuentosObtenidos',
        label: 'Descuentos obtenidos',
        category: 'compras',
        codes: [DEFAULT_ACCOUNT_CODES.descuentosObtenidos, '4.6.09'],
        nameAny: ['descuento obtenido', 'descuentos obtenidos'],
        optional: true,
    },
    {
        key: 'descuentosOtorgados',
        label: 'Descuentos otorgados',
        category: 'ventas',
        codes: [DEFAULT_ACCOUNT_CODES.descuentosOtorgados, '4.2.01'],
        nameAny: ['descuento otorgado', 'descuentos otorgados'],
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
    const navigate = useNavigate()
    // Deep-link: read prefill from location state (e.g., from Proveedores page)
    const location = useLocation()
    const locationState = location.state as {
        prefillTab?: string
        prefillPaymentDirection?: string
        prefillCounterparty?: string
        prefillSourceMovementId?: string
        openModal?: boolean
    } | null

    // State
    const { year: periodYear, start: periodStart, end: periodEnd } = usePeriodYear()
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

    // RT6 Preview Modal
    const [rt6PreviewOpen, setRt6PreviewOpen] = useState(false)
    const [rt6PreviewData, setRt6PreviewData] = useState<RT6PreviewData | null>(null)
    const [rt6ApplyingId, setRt6ApplyingId] = useState<string | null>(null)

    // Search
    const [productSearch, setProductSearch] = useState('')
    const [conciliationFilter, setConciliationFilter] = useState<ConciliationFilter>('all')
    const [conciliationSearch, setConciliationSearch] = useState('')

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }, [])

    // Cierre
    const [closingPhysicalValue, setClosingPhysicalValue] = useState<number | null>(null)
    const [closingIsSaving, setClosingIsSaving] = useState(false)
    const [showHomogeneo, setShowHomogeneo] = useState(false)
    const [existenciaInicialLedger, setExistenciaInicialLedger] = useState<number | null>(null)
    // Date for opening balance calculation
    const [openingBalanceDate, setOpeningBalanceDate] = useState<string>('')

    // Sub-account balances for cierre (loaded from ledger for the period)
    const [cierreBalances, setCierreBalances] = useState<{
        gastosCompras: number; bonifCompras: number; devolCompras: number
        ventas: number; bonifVentas: number; devolVentas: number
    }>({ gastosCompras: 0, bonifCompras: 0, devolCompras: 0, ventas: 0, bonifVentas: 0, devolVentas: 0 })

    // Indices FACPCE (from cierre-valuacion module)
    const [facpceIndices, setFacpceIndices] = useState<IndexRow[]>([])
    // Layers drawer
    const [layersDrawerProduct, setLayersDrawerProduct] = useState<ProductEndingValuation | null>(null)
    // New dashboard lots drawer
    const [dashboardLotsProduct, setDashboardLotsProduct] = useState<ProductEndingValuation | null>(null)

    // KPI Range Mode: default 'ejercicio', persist in localStorage
    const [kpiRangeMode, setKpiRangeMode] = useState<'month' | 'ejercicio'>(() => {
        try {
            const saved = localStorage.getItem('inventario.dashboard.rangeMode')
            if (saved === 'month' || saved === 'ejercicio') return saved
        } catch { /* ignore */ }
        return 'ejercicio'
    })
    const changeKpiRangeMode = useCallback((mode: 'month' | 'ejercicio') => {
        setKpiRangeMode(mode)
        try { localStorage.setItem('inventario.dashboard.rangeMode', mode) } catch { /* ignore */ }
    }, [])

    // Onboarding wizard
    const [wizardOpen, setWizardOpen] = useState(false)
    const isConfigured = settings?.configCompleted === true

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
            const repairResult = await repairInitialStockMovements(periodId)
            const [loadedSettings, loadedProducts, loadedMovements] = await Promise.all([
                loadBienesSettings(),
                getAllBienesProducts(periodId),
                getAllBienesMovements(periodId),
            ])
            setSettings(loadedSettings)
            setProducts(loadedProducts)
            setMovements(loadedMovements)
            if (repairResult.fixed > 0) {
                showToast(`Existencias iniciales reparadas: ${repairResult.fixed}`, 'success')
            }
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

    // Auto-open onboarding wizard when config is missing
    useEffect(() => {
        if (settings && !settings.configCompleted && !isLoading) {
            setWizardOpen(true)
        }
    }, [settings, isLoading])

    const handleOnboardingComplete = async (patch: Partial<BienesSettings>) => {
        if (!settings) return
        const updated: BienesSettings = {
            ...settings,
            ...patch,
            lastUpdated: new Date().toISOString(),
        }
        await saveBienesSettings(updated)
        setSettings(updated)
        setAccountMappingsDraft(updated.accountMappings || {})
        setWizardOpen(false)
        showToast('Inventario configurado correctamente', 'success')
    }

    // Deep-link: open modal with prefill from Proveedores/Acreedores page
    useEffect(() => {
        if (!locationState?.prefillTab || !settings) return
        if (locationState.prefillTab === 'pagos' || locationState.prefillTab === 'compra') {
            const prefill: Partial<BienesMovement> = {}
            if (locationState.prefillTab === 'pagos') {
                prefill.type = 'PAYMENT'
                prefill.paymentDirection = (locationState.prefillPaymentDirection as any) || 'PAGO'
            }
            if (locationState.prefillCounterparty) {
                prefill.counterparty = locationState.prefillCounterparty
            }
            if (locationState.prefillSourceMovementId) {
                prefill.sourceMovementId = locationState.prefillSourceMovementId
            }
            setMovementPrefill(prefill)
            setMovementModalOpen(true)
            // Clear location state to prevent re-opening on re-render
            window.history.replaceState({}, '')
        }
    }, [locationState, settings])

    // Load FACPCE indices from cierre-valuacion module
    useEffect(() => {
        loadCierreValuacionState().then(state => {
            setFacpceIndices(state.indices || [])
        })
    }, [])

    useEffect(() => {
        if (settings) {
            setAccountMappingsDraft(settings.accountMappings || {})
            // Initialize opening balance date from settings or default
            if (settings.openingBalanceDate) {
                setOpeningBalanceDate(settings.openingBalanceDate)
            } else {
                // Smart default logic will run in the balance effect if string is empty, 
                // but we need to initialize it.
                // Actually, let's leave it empty to trigger "auto" logic, OR set it once here?
                // Better: if empty, the effect below calculates "auto" and sets it? 
                // No, we want the effect to use it if set, or calculate if not.
                // Let's settle on: if settings has it, use it. If not, use periodStart initially.
                setOpeningBalanceDate(periodStart)
            }
        }
    }, [settings, periodStart])

    // Computed values
    const yearRange = useMemo(() => {
        const [y, m, d] = periodStart.split('-').map(Number)
        const prev = new Date(y, m - 1, d - 1)
        const prevLabel = prev.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        return {
            start: periodStart,
            end: periodEnd,
            prevLabel,
        }
    }, [periodStart, periodEnd])

    const monthRange = useMemo(() => {
        const now = new Date()

        // Parse dates safely (Local time)
        const parseDate = (s: string) => {
            const [y, m, d] = s.split('-').map(Number)
            return new Date(y, m - 1, d)
        }

        const pStart = parseDate(periodStart)
        const pEnd = parseDate(periodEnd)

        // Determine target date (clamped to period)
        let target = now
        if (now < pStart) target = pStart
        else if (now > pEnd) target = pEnd

        const year = target.getFullYear()
        const monthIndex = target.getMonth()

        const startDate = new Date(year, monthIndex, 1)
        const endDate = new Date(year, monthIndex + 1, 0)

        const prevMonthIndex = monthIndex - 1
        const prevStartDate = prevMonthIndex >= 0 ? new Date(year, prevMonthIndex, 1) : null
        const prevEndDate = prevMonthIndex >= 0 ? new Date(year, prevMonthIndex + 1, 0) : null

        const toISO = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')

        return {
            start: toISO(startDate),
            end: toISO(endDate),
            prevStart: prevStartDate ? toISO(prevStartDate) : null,
            prevEnd: prevEndDate ? toISO(prevEndDate) : null,
            label: startDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
        }
    }, [periodStart, periodEnd])

    const valuations = useMemo<ProductValuation[]>(() => {
        if (!settings) return []
        return calculateAllValuations(products, movements, settings.costMethod)
    }, [products, movements, settings])

    // Determine KPI date range based on mode
    const kpiDateRange = useMemo(() => {
        if (kpiRangeMode === 'ejercicio') {
            return { start: periodStart, end: periodEnd, label: 'Ejercicio' }
        }
        return { start: monthRange.start, end: monthRange.end, label: monthRange.label }
    }, [kpiRangeMode, periodStart, periodEnd, monthRange])

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
        return calculateBienesKPIs(products, movements, settings.costMethod, kpiDateRange.start, kpiDateRange.end)
    }, [products, movements, settings, kpiDateRange])

    // Homogeneous ending inventory valuation (FIFO layers reexpressed to closing month)
    const efHomogenea = useMemo<EndingInventoryValuation | null>(() => {
        if (!settings || products.length === 0) return null
        const closingDate = periodEnd
        const closingPeriod = getPeriodFromDate(closingDate)
        return computeEndingInventoryValuation({
            products,
            movements,
            method: settings.costMethod,
            closingPeriod,
            indices: facpceIndices,
        })
    }, [products, movements, settings, periodYear, facpceIndices])

    // EI: saldo contable de Mercaderías al día anterior al inicio del ejercicio
    // Fallback: sum of product openingQty * openingUnitCost (legacy)
    const existenciaInicialFallback = useMemo(() => {
        return products.reduce((sum, p) => sum + p.openingQty * p.openingUnitCost, 0)
    }, [products])

    useEffect(() => {
        // Resolve account code from mapping (could be an ID or a code)
        const resolveCode = (
            mappedValue: string | undefined,
            defaultCodes: string | string[],
            options?: { aliasCodes?: string[]; nameAny?: string[] }
        ): string => {
            const codes = Array.isArray(defaultCodes) ? defaultCodes : [defaultCodes]
            if (mappedValue) {
                if (mappedValue.includes('.')) return mappedValue
                const acc = accounts?.find(a => a.id === mappedValue)
                return acc?.code || codes[0]
            }
            for (const code of Array.from(new Set(codes))) {
                const acc = accounts?.find(a => a.code === code)
                if (acc) return acc.code
            }
            if (options?.aliasCodes && options.aliasCodes.length > 0) {
                for (const code of options.aliasCodes) {
                    const acc = accounts?.find(a => a.code === code)
                    if (!acc) continue
                    if (!options.nameAny || options.nameAny.length === 0) return acc.code
                    const haystack = acc.name.toLowerCase()
                    if (options.nameAny.some(token => haystack.includes(token.toLowerCase()))) {
                        return acc.code
                    }
                }
            }
            return codes[0]
        }

        const loadCierreBalances = async () => {
            const mappings = settings?.accountMappings || {}
            const mercCode = resolveCode(mappings.mercaderias, DEFAULT_ACCOUNT_CODES.mercaderias)

            // Determine EI Date and Balance (Smart Default Logic)
            let finalEiDate = openingBalanceDate
            let finalEiBalance = 0

            // If user hasn't selected a date yet (or we are initializing), try to find best default
            if (!finalEiDate) {
                finalEiDate = periodStart
            }

            // Only strictly re-calculate if we are in "auto" mode? 
            // The requirement says: "Default inteligente: a) periodStart b) dayBeforeStart ... Si usuario cambia, usar ESA".
            // So we respect `openingBalanceDate` state. 
            // BUT, if we want to implement the "smart default" on first load, we might need a separate effect or check.
            // Let's do this: 
            // 1. Calculate balance at periodStart
            // 2. Calculate balance at dayBeforeStart
            // 3. If settings.openingBalanceDate is defined, just use that.
            // 4. If NOT defined, pick best one and SET it? Or just use it for display?
            // Requirement 3 says: "Guardar la fecha elegida en BienesSettings... Al cargar... si existe... usarlo".



            // Note: getAccountBalanceByCode returns sum of movements in range.
            // For "Saldo al...", we want balance from beginning of time up to DATE.
            // getAccountBalanceByCode(code, undefined, date) does exactly that (undefined start = beginning).

            // We need to support the "Smart Check" only if we haven't manually locked a date?
            // "Default inteligente... Si el usuario cambia la fecha manualmente, usar ESA fecha"
            // Let's implement the smart check whenever `openingBalanceDate` matches `periodStart` or is empty?
            // No, that might be confusing. 
            // Let's implement the smart logic ONLY if settings.openingBalanceDate is MISSING.

            if (!settings?.openingBalanceDate) {
                // Smart logic
                const [y, m, d] = periodStart.split('-').map(Number)
                const dayBefore = new Date(y, m - 1, d - 1)
                const dayBeforeISO = dayBefore.getFullYear() + '-' + String(dayBefore.getMonth() + 1).padStart(2, '0') + '-' + String(dayBefore.getDate()).padStart(2, '0')

                const balStart = await getAccountBalanceByCode(mercCode, undefined, periodStart)
                const balBefore = await getAccountBalanceByCode(mercCode, undefined, dayBeforeISO)

                // c) Si balance(periodStart) != 0 usar periodStart; 
                // si es 0 y dayBeforeStart != 0 usar dayBeforeStart; 
                // si ambos 0 usar periodStart.

                if (balStart !== 0) {
                    finalEiDate = periodStart
                    finalEiBalance = balStart
                } else if (balBefore !== 0) {
                    finalEiDate = dayBeforeISO
                    finalEiBalance = balBefore
                } else {
                    finalEiDate = periodStart
                    finalEiBalance = 0
                }

                // Update state if different (avoid loops)
                if (openingBalanceDate !== finalEiDate) {
                    setOpeningBalanceDate(finalEiDate)
                }
            } else {
                // Use explicit date
                finalEiDate = openingBalanceDate
                finalEiBalance = await getAccountBalanceByCode(mercCode, undefined, finalEiDate)
            }

            setExistenciaInicialLedger(finalEiBalance)

            // Sub-account balances for the period (yearRange)
            const start = periodStart
            const end = periodEnd

            const codes = {
                gastosCompras: resolveCode(
                    mappings.gastosCompras,
                    [DEFAULT_ACCOUNT_CODES.gastosCompras, '4.8.02', '5.1.04'],
                    { aliasCodes: ['4.8.03', '5.1.05'], nameAny: ['gasto', 'flete', 'seguro'] }
                ),
                bonifCompras: resolveCode(
                    mappings.bonifCompras,
                    [DEFAULT_ACCOUNT_CODES.bonifCompras, '4.8.03', '5.1.05'],
                    { aliasCodes: ['4.8.02', '5.1.04'], nameAny: ['bonif'] }
                ),
                devolCompras: resolveCode(mappings.devolCompras, [DEFAULT_ACCOUNT_CODES.devolCompras, '4.8.04', '5.1.06']),
                ventas: resolveCode(mappings.ventas, DEFAULT_ACCOUNT_CODES.ventas),
                bonifVentas: resolveCode(mappings.bonifVentas, [DEFAULT_ACCOUNT_CODES.bonifVentas, '4.8.05', '4.1.03']),
                devolVentas: resolveCode(mappings.devolVentas, [DEFAULT_ACCOUNT_CODES.devolVentas, '4.8.06', '4.1.04']),
            }

            const [gastosCompras, bonifCompras, devolCompras, ventas, bonifVentas, devolVentas] = await Promise.all([
                getAccountBalanceByCode(codes.gastosCompras, start, end),
                getAccountBalanceByCode(codes.bonifCompras, start, end),
                getAccountBalanceByCode(codes.devolCompras, start, end),
                getAccountBalanceByCode(codes.ventas, start, end),
                getAccountBalanceByCode(codes.bonifVentas, start, end),
                getAccountBalanceByCode(codes.devolVentas, start, end),
            ])

            setCierreBalances({
                gastosCompras: Math.abs(gastosCompras),   // Debit balance (expense)
                bonifCompras: Math.abs(bonifCompras),     // Credit balance (contra-expense)
                devolCompras: Math.abs(devolCompras),      // Credit balance (contra-expense)
                ventas: Math.abs(ventas),                  // Credit balance (income)
                bonifVentas: Math.abs(bonifVentas),        // Debit balance (contra-income)
                devolVentas: Math.abs(devolVentas),         // Debit balance (contra-income)
            })
        }

        loadCierreBalances()
    }, [periodYear, settings?.accountMappings, accounts, openingBalanceDate, periodStart, periodEnd, settings?.openingBalanceDate])

    const handleOpeningDateChange = async (newDate: string) => {
        setOpeningBalanceDate(newDate)
        if (settings) {
            const updated: BienesSettings = {
                ...settings,
                openingBalanceDate: newDate,
                lastUpdated: new Date().toISOString(),
            }
            await saveBienesSettings(updated)
            setSettings(updated) // This will trigger the effect again, but it's safe
        }
    }


    const existenciaInicial = existenciaInicialLedger !== null ? existenciaInicialLedger : existenciaInicialFallback

    const cierreMovements = useMemo(() => {
        const comprasMovs = movements.filter(m => m.type === 'PURCHASE' && !m.isDevolucion && m.quantity > 0)
        const compras = comprasMovs.reduce((sum, m) => sum + m.subtotal + (m.bonificacionAmount || 0), 0)
        const gastosComprasFromPurchases = movements.reduce(
            (sum, m) => sum + (m.type === 'PURCHASE' && !m.isDevolucion ? (m.gastosCompra || 0) : 0),
            0
        )
        const gastosComprasFromCapitalization = movements
            .filter(m => m.type === 'VALUE_ADJUSTMENT' && m.adjustmentKind === 'CAPITALIZATION')
            .reduce((sum, m) => sum + (m.gastosCompra ?? m.valueDelta ?? 0), 0)
        const gastosCompras = gastosComprasFromPurchases + gastosComprasFromCapitalization
        const devolCompras = movements
            .filter(m => m.type === 'PURCHASE' && m.isDevolucion)
            .reduce((sum, m) => sum + m.subtotal, 0)
        const bonifComprasInline = comprasMovs.reduce((sum, m) => sum + (m.bonificacionAmount || 0), 0)
        const bonifCompras = movements
            .filter(m => m.type === 'VALUE_ADJUSTMENT' && m.adjustmentKind === 'BONUS_PURCHASE')
            .reduce((sum, m) => sum + m.subtotal, 0) + bonifComprasInline

        const ventasMovs = movements.filter(m => m.type === 'SALE' && !m.isDevolucion)
        const ventas = ventasMovs.reduce((sum, m) => sum + m.subtotal + (m.bonificacionAmount || 0), 0)
        const devolVentas = movements
            .filter(m => m.type === 'SALE' && m.isDevolucion)
            .reduce((sum, m) => sum + m.subtotal, 0)
        const bonifVentasInline = ventasMovs.reduce((sum, m) => sum + (m.bonificacionAmount || 0), 0)
        const bonifVentas = movements
            .filter(m => m.type === 'VALUE_ADJUSTMENT' && m.adjustmentKind === 'BONUS_SALE')
            .reduce((sum, m) => sum + m.subtotal, 0) + bonifVentasInline

        return {
            compras,
            gastosCompras,
            bonifCompras,
            devolCompras,
            ventas,
            bonifVentas,
            devolVentas,
        }
    }, [movements])

    const cierreTotals = useMemo(() => ({
        ...cierreBalances,
        ...cierreMovements,
    }), [cierreBalances, cierreMovements])

    const comprasBrutas = cierreMovements.compras
    const ventasBrutas = cierreMovements.ventas

    // Full CMV formula: CMV = EI + (Compras + Gastos - Bonif - Devol) - EF
    const comprasNetas = comprasBrutas + cierreTotals.gastosCompras - cierreTotals.bonifCompras - cierreTotals.devolCompras
    const ventasNetas = ventasBrutas - cierreTotals.bonifVentas - cierreTotals.devolVentas

    const inventarioTeorico = kpis.stockValue
    const esFisicoDefinido = closingPhysicalValue !== null
    // CMV ALWAYS uses EF teórica (system-calculated), never physical
    const cmvPorDiferencia = existenciaInicial + comprasNetas - inventarioTeorico

    const lowStockCount = useMemo(() => {
        return valuations.filter(v => v.hasAlert).length
    }, [valuations])

    const costMethodLocked = useMemo(() => !canChangeCostingMethod(movements), [movements])

    // RT6 VALUE_ADJUSTMENT aggregation for cierre tab (histórico vs homogéneo)
    const rt6CierreAdjustments = useMemo(() => {
        const vaMovements = movements.filter(m => m.type === 'VALUE_ADJUSTMENT' && m.rt6SourceEntryId)
        const eiAdj = vaMovements.filter(m => m.originCategory === 'EI').reduce((s, m) => s + (m.valueDelta || 0), 0)
        const comprasAdj = vaMovements.filter(m => m.originCategory === 'COMPRAS').reduce((s, m) => s + (m.valueDelta || 0), 0)
        const gastosAdj = vaMovements.filter(m => m.originCategory === 'GASTOS_COMPRA').reduce((s, m) => s + (m.valueDelta || 0), 0)
        const bonifAdj = vaMovements.filter(m => m.originCategory === 'BONIF_COMPRA').reduce((s, m) => s + (m.valueDelta || 0), 0)
        const devolAdj = vaMovements.filter(m => m.originCategory === 'DEVOL_COMPRA').reduce((s, m) => s + (m.valueDelta || 0), 0)
        const hasAny = vaMovements.length > 0
        const totalAdj = eiAdj + comprasAdj + gastosAdj + bonifAdj + devolAdj
        return { eiAdj, comprasAdj, gastosAdj, bonifAdj, devolAdj, totalAdj, hasAny }
    }, [movements])

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
        if (!isConfigured) { setWizardOpen(true); return }
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

    /**
     * buildRT6Preview: Construye un preview con desglose por origen (Paso 2 RT6)
     * usando CierreValuacionState. Abre el modal de confirmación.
     */
    const handleOpenRT6Preview = async (entry: JournalEntry) => {
        if (products.length === 0) {
            showToast('Crea al menos un producto antes de aplicar ajustes RT6', 'error')
            return
        }

        // Check if already applied (by looking for VALUE_ADJUSTMENT with this rt6SourceEntryId)
        const existingAdjustments = movements.filter(m =>
            m.type === 'VALUE_ADJUSTMENT' && m.rt6SourceEntryId === entry.id
        )
        const isAlreadyApplied = existingAdjustments.length > 0

        // Find inventory-relevant lines in the RT6 entry (compras, bonif, devol, mercaderias accounts)
        const inventoryLines = entry.lines.filter(line => {
            const match = inventoryAccountResolution.byId.get(line.accountId)
            return match && (match.category === 'mercaderias' || match.category === 'compras')
        })

        if (inventoryLines.length === 0) {
            showToast('No se encontraron lineas de inventario en el asiento RT6', 'error')
            return
        }

        // Calculate the net adjustment amount from all inventory lines
        const adjustmentAmount = inventoryLines.reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0)

        if (Math.abs(adjustmentAmount) < 0.01) {
            showToast('El ajuste neto es cero, no hay nada que aplicar', 'error')
            return
        }

        const entryPeriod = entry.date.substring(0, 7)

        // Build inventory account map from resolved accounts
        const inventoryAccountMap = {
            mercaderias: inventoryAccountResolution.byKey.get('mercaderias')?.account.id,
            compras: inventoryAccountResolution.byKey.get('compras')?.account.id,
            gastosCompras: inventoryAccountResolution.byKey.get('gastosCompras')?.account.id,
            bonifCompras: inventoryAccountResolution.byKey.get('bonifCompras')?.account.id,
            devolCompras: inventoryAccountResolution.byKey.get('devolCompras')?.account.id,
        }

        // Identify accounts affected by this specific RT6 entry to scope the plan
        // This prevents the plan from including adjustments for accounts not present in this entry
        const affectedAccountIds = new Set(entry.lines.map(l => l.accountId).filter(Boolean) as string[])

        // Load cierre-valuacion state for Step 2 RT6 data
        try {
            const cierreState = await loadCierreValuacionState()
            const plan = buildRT6InventoryApplyPlan({
                adjustmentAmount,
                inventoryAccountMap,
                movements,
                products,
                cierreState,
                affectedAccountIds,
                openingDate: openingBalanceDate,
            })

            setRt6PreviewData({
                entry,
                adjustmentAmount,
                entryPeriod,
                plan,
                isAlreadyApplied,
            })
            setRt6PreviewOpen(true)
        } catch (error) {
            console.error('Error building RT6 apply plan:', error)
            showToast('Error al construir plan RT6: ' + (error instanceof Error ? error.message : 'desconocido'), 'error')
        }
    }

    /**
     * handleConfirmRT6Apply: Ejecuta la creación de movimientos VALUE_ADJUSTMENT
     * basándose en el plan RT6 con desglose por origen.
     */
    const handleConfirmRT6Apply = async () => {
        if (!rt6PreviewData || !rt6PreviewData.plan.isValid) return

        const { entry, plan } = rt6PreviewData

        setRt6ApplyingId(entry.id)

        try {
            for (const item of plan.items) {
                await createBienesMovement({
                    date: entry.date,
                    type: 'VALUE_ADJUSTMENT',
                    adjustmentKind: 'RT6',
                    productId: item.productId,
                    quantity: 0,
                    periodId,
                    ivaRate: 0,
                    ivaAmount: 0,
                    subtotal: Math.abs(item.valueDelta),
                    total: Math.abs(item.valueDelta),
                    costMethod: settings?.costMethod || 'PPP',
                    valueDelta: item.valueDelta,
                    rt6Period: item.period,
                    rt6SourceEntryId: entry.id,
                    originCategory: item.originCategory,
                    notes: `${item.label}${item.targetMovementId ? ' | Mov:' + item.targetMovementId.slice(0, 8) : ''}`,
                    reference: entry.id.slice(0, 8),
                    autoJournal: false,
                    linkedJournalEntryIds: [entry.id],
                })
            }
            showToast(`Ajuste RT6 aplicado: ${plan.items.length} movimiento(s) creados`, 'success')
            setRt6PreviewOpen(false)
            setRt6PreviewData(null)
            await loadData()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al aplicar ajuste RT6', 'error')
        } finally {
            setRt6ApplyingId(null)
        }
    }

    // Note: RT6 batch functionality preserved for future V3 modal integration
    const _handleSaveRT6Batch = async (items: RT6CartItem[], generateJournal: boolean, date: string) => {
        if (!settings) {
            showToast('Configura el modulo antes de registrar ajustes RT6', 'error')
            return
        }
        if (products.length === 0) {
            showToast('Crea al menos un producto antes de registrar ajustes RT6', 'error')
            return
        }
        const entryPeriod = date.substring(0, 7)
        try {
            for (const item of items) {
                await createBienesMovement({
                    date,
                    type: 'VALUE_ADJUSTMENT',
                    adjustmentKind: 'RT6',
                    productId: item.productId,
                    quantity: 0,
                    periodId,
                    ivaRate: 0,
                    ivaAmount: 0,
                    subtotal: Math.abs(item.delta),
                    total: Math.abs(item.delta),
                    costMethod: settings.costMethod,
                    valueDelta: item.delta,
                    rt6Period: entryPeriod,
                    notes: `Ajuste RT6 manual - ${entryPeriod} (${item.concepto})`,
                    reference: item.originMovementId?.slice(0, 8),
                    autoJournal: generateJournal,
                    linkedJournalEntryIds: [],
                })
            }
            showToast(`Ajustes RT6 registrados: ${items.length}`, 'success')
            await loadData()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al registrar ajustes RT6', 'error')
        }
    }
    void _handleSaveRT6Batch // preserved for future RT6 modal integration

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
            // PERIODIC mode: generate closing entries (CMV + optional DifInv)
            const efTeorica = kpis.stockValue
            const efFisica = closingPhysicalValue
            const cmvPreview = existenciaInicial + comprasNetas - efTeorica
            const difInvPreview = efFisica != null ? efFisica - efTeorica : 0

            let confirmMsg = `Se generaran los asientos de cierre periodico.\nEI: ${formatCurrency(existenciaInicial)}\nCompras Netas: ${formatCurrency(comprasNetas)}\nEF Teorica: ${formatCurrency(efTeorica)}\nCMV: ${formatCurrency(cmvPreview)}`
            if (efFisica != null && Math.abs(difInvPreview) > 0.01) {
                confirmMsg += `\nEF Fisica: ${formatCurrency(efFisica)}\nDif. Inventario: ${formatCurrency(difInvPreview)}`
            }
            confirmMsg += '\n\nContinuar?'

            if (!confirm(confirmMsg)) {
                return
            }
            setClosingIsSaving(true)
            try {
                const result = await generatePeriodicClosingJournalEntries({
                    existenciaInicial,
                    compras: comprasBrutas,
                    gastosCompras: cierreTotals.gastosCompras,
                    bonifCompras: cierreTotals.bonifCompras,
                    devolCompras: cierreTotals.devolCompras,
                    existenciaFinalTeorica: efTeorica,
                    existenciaFinalFisica: efFisica,
                    ventas: cierreTotals.ventas,
                    bonifVentas: cierreTotals.bonifVentas,
                    devolVentas: cierreTotals.devolVentas,
                    closingDate: periodEnd,
                    periodId,
                    periodLabel: `${periodId}`,
                })
                if (result.error) {
                    showToast(result.error, 'error')
                } else {
                    let msg = `Cierre generado: ${result.entryIds.length} asientos, CMV = ${formatCurrency(result.cmv)}`
                    if (Math.abs(result.difInv) > 0.01) {
                        msg += `, DifInv = ${formatCurrency(result.difInv)}`
                    }
                    showToast(msg, 'success')
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
        if (closingPhysicalValue === null || closingPhysicalValue < 0) {
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

        const memo = `Cierre inventario por diferencias - EI ${formatCurrency(existenciaInicial)} / Compras ${formatCurrency(comprasBrutas)} / EF Fisico ${formatCurrency(closingPhysicalValue)}`

        setClosingIsSaving(true)
        try {
            await createEntry({
                date: periodEnd,
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
                    comprasBrutas,
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

    const defaultOpeningContraId = useMemo(() => {
        return resolveOpeningEquityAccountId(
            accounts || [],
            settings?.accountMappings?.aperturaInventario || null
        )
    }, [accounts, settings])

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
        // Detect RT6 inflation adjustment entries
        const isRT6Entry = entry.memo?.toLowerCase().includes('ajuste por inflaci')
            || (entry.sourceModule === 'cierre-valuacion' && entry.metadata?.tipo === 'RT6')
        if (isRT6Entry && hasMatches) {
            primaryCategory = 'rt6_adjustment'
        }

        const triggerAccountId = primaryCategory
            ? entry.lines.find(line => matches.get(line.accountId)?.category === primaryCategory)?.accountId
            : undefined

        return {
            hasMatch: entry.sourceModule === 'inventory' || isRT6Entry || hasMatches,
            category: primaryCategory,
            triggerAccountId,
            matchedKeys,
            isRT6: isRT6Entry,
        }
    }, [inventoryAccountResolution])

    const getEntryTypeLabel = useCallback((category: InventoryAccountCategory | null) => {
        if (!category) return 'Inventario'
        if (category === 'rt6_adjustment') return 'Ajuste RT6 (Inflacion)'
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

    const salesProgress = useMemo(() => {
        if (!salesGoal || salesGoal <= 0) return null
        return Math.min(1, kpis.salesPeriod / salesGoal)
    }, [kpis.salesPeriod, salesGoal])

    // Enhanced KPIs for dashboard (FASE 2)
    const enhancedKPIs = useMemo(() => {
        const rangeMovements = movements.filter(m =>
            m.date >= kpiDateRange.start && m.date <= kpiDateRange.end
        )
        // Sales net: ventas - devoluciones venta - bonif ventas
        const salesGross = rangeMovements
            .filter(m => m.type === 'SALE' && !m.isDevolucion)
            .reduce((s, m) => s + m.subtotal, 0)
        const salesReturns = rangeMovements
            .filter(m => m.type === 'SALE' && m.isDevolucion)
            .reduce((s, m) => s + m.subtotal, 0)
        const ventasNetas = salesGross - salesReturns

        // CMV for range
        const cmv = rangeMovements
            .filter(m => m.type === 'SALE' || (m.type === 'ADJUSTMENT' && m.quantity < 0))
            .reduce((s, m) => {
                if (m.type === 'SALE' && m.isDevolucion) return s - Math.abs(m.costTotalAssigned || 0)
                return s + (m.costTotalAssigned || 0)
            }, 0)

        const resultadoBruto = ventasNetas - cmv

        // Sell-through: units sold net / units entered net
        const unitsSoldNet = rangeMovements
            .filter(m => m.type === 'SALE' && !m.isDevolucion)
            .reduce((s, m) => s + m.quantity, 0)
            - rangeMovements
                .filter(m => m.type === 'SALE' && m.isDevolucion)
                .reduce((s, m) => s + Math.abs(m.quantity), 0)
        const unitsEnteredNet = rangeMovements
            .filter(m => m.type === 'PURCHASE' && !m.isDevolucion)
            .reduce((s, m) => s + m.quantity, 0)
            - rangeMovements
                .filter(m => m.type === 'PURCHASE' && m.isDevolucion)
                .reduce((s, m) => s + Math.abs(m.quantity), 0)
        const sellThrough = unitsEnteredNet > 0 ? (unitsSoldNet / unitsEnteredNet) * 100 : 0

        // Rotation (annualized): CMV annualized / Average Stock
        const stockValue = kpis.stockValue
        const daysInRange = Math.max(1, Math.round(
            (new Date(kpiDateRange.end + 'T00:00:00').getTime() - new Date(kpiDateRange.start + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
        ))
        const cmvAnnualized = (cmv / daysInRange) * 365
        const rotation = stockValue > 0 ? cmvAnnualized / stockValue : 0

        // Cost unit actual
        const costUnitActual = kpis.totalUnits > 0 ? stockValue / kpis.totalUnits : 0

        return { ventasNetas, cmv, resultadoBruto, sellThrough, rotation, costUnitActual, unitsSoldNet, unitsEnteredNet }
    }, [movements, kpiDateRange, kpis])

    // Per-product sales for ProductValuationCard
    const perProductSales = useMemo(() => {
        const salesByProduct = new Map<string, number>()
        movements
            .filter(m => m.type === 'SALE' && m.date >= kpiDateRange.start && m.date <= kpiDateRange.end)
            .forEach(m => {
                const current = salesByProduct.get(m.productId) || 0
                if (m.isDevolucion) {
                    salesByProduct.set(m.productId, current - m.subtotal)
                } else {
                    salesByProduct.set(m.productId, current + m.subtotal)
                }
            })
        return salesByProduct
    }, [movements, kpiDateRange])

    // Mini chart data: monthly or weekly aggregation of sales
    const miniChartData = useMemo(() => {
        if (kpiRangeMode === 'ejercicio') {
            // Monthly bars for the exercise year
            const months: { label: string; value: number }[] = []
            const pStart = new Date(periodStart + 'T00:00:00')
            for (let i = 0; i < 12; i++) {
                const mDate = new Date(pStart.getFullYear(), pStart.getMonth() + i, 1)
                const mEnd = new Date(pStart.getFullYear(), pStart.getMonth() + i + 1, 0)
                const mStartISO = mDate.getFullYear() + '-' + String(mDate.getMonth() + 1).padStart(2, '0') + '-01'
                const mEndISO = mEnd.getFullYear() + '-' + String(mEnd.getMonth() + 1).padStart(2, '0') + '-' + String(mEnd.getDate()).padStart(2, '0')
                const sales = movements
                    .filter(m => m.type === 'SALE' && !m.isDevolucion && m.date >= mStartISO && m.date <= mEndISO)
                    .reduce((s, m) => s + m.subtotal, 0)
                months.push({
                    label: mDate.toLocaleDateString('es-AR', { month: 'short' }),
                    value: sales,
                })
            }
            return months
        } else {
            // Weekly bars for current month
            const weeks: { label: string; value: number }[] = []
            const mStart = new Date(monthRange.start + 'T00:00:00')
            const mEnd = new Date(monthRange.end + 'T00:00:00')
            let weekStart = new Date(mStart)
            let weekNum = 1
            while (weekStart <= mEnd) {
                const wEnd = new Date(weekStart)
                wEnd.setDate(wEnd.getDate() + 6)
                if (wEnd > mEnd) wEnd.setTime(mEnd.getTime())
                const wStartISO = weekStart.getFullYear() + '-' + String(weekStart.getMonth() + 1).padStart(2, '0') + '-' + String(weekStart.getDate()).padStart(2, '0')
                const wEndISO = wEnd.getFullYear() + '-' + String(wEnd.getMonth() + 1).padStart(2, '0') + '-' + String(wEnd.getDate()).padStart(2, '0')
                const sales = movements
                    .filter(m => m.type === 'SALE' && !m.isDevolucion && m.date >= wStartISO && m.date <= wEndISO)
                    .reduce((s, m) => s + m.subtotal, 0)
                weeks.push({ label: `S${weekNum}`, value: sales })
                weekStart = new Date(wEnd)
                weekStart.setDate(weekStart.getDate() + 1)
                weekNum++
            }
            return weeks
        }
    }, [kpiRangeMode, movements, periodStart, monthRange])

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
        // Strict filter: only entries that are genuinely inventory-related.
        // Avoids false positives like "Aporte inicial" (Banco/Capital) appearing in conciliation.
        const coreAccountIds = new Set<string>()
        const coreKeys: AccountMappingKey[] = [
            'mercaderias', 'compras', 'gastosCompras', 'cmv', 'ventas',
            'bonifCompras', 'devolCompras', 'bonifVentas', 'devolVentas',
        ]
        coreKeys.forEach(key => {
            const resolved = inventoryAccountResolution.byKey.get(key)
            if (resolved) coreAccountIds.add(resolved.account.id)
        })

        return scopedJournalEntries.filter(entry => {
            // Definitive: created by inventory module
            if (entry.sourceModule === 'inventory') return true
            // RT6 from cierre-valuacion
            if (entry.sourceModule === 'cierre-valuacion' && entry.metadata?.tipo === 'RT6') return true
            // Touches at least one CORE inventory account (not just peripherals like IVA, apertura)
            if (coreAccountIds.size > 0) {
                return entry.lines.some(line => coreAccountIds.has(line.accountId))
            }
            return false
        })
    }, [scopedJournalEntries, inventoryAccountResolution])

    const movementsWithoutEntry = useMemo(() => {
        return movements.filter(movement => (movement.linkedJournalEntryIds || []).length === 0)
    }, [movements])

    const entriesWithoutMovement = useMemo(() => {
        return inventoryEntries.filter(entry => !linkedEntryIds.has(entry.id))
    }, [inventoryEntries, linkedEntryIds])

    const conciliacionCount = movementsWithoutEntry.length + entriesWithoutMovement.length
    const rt6PendingCount = useMemo(() => {
        return entriesWithoutMovement.filter(entry => getEntryInventoryMatch(entry).isRT6).length
    }, [entriesWithoutMovement, getEntryInventoryMatch])

    const filteredMovementsWithoutEntry = useMemo(() => {
        const term = conciliationSearch.trim().toLowerCase()
        return movementsWithoutEntry.filter(movement => {
            if (conciliationFilter === 'compras' && movement.type !== 'PURCHASE') return false
            if (conciliationFilter === 'ventas' && movement.type !== 'SALE') return false
            if (conciliationFilter === 'rt6') {
                const notes = movement.notes?.toLowerCase() || ''
                if (movement.type !== 'VALUE_ADJUSTMENT' && !notes.includes('rt6')) return false
            }
            if (!term) return true
            const product = products.find(p => p.id === movement.productId)
            const haystack = [
                product?.name,
                product?.sku,
                movement.type,
                movement.reference,
                movement.notes,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            return haystack.includes(term) || Math.abs(movement.total).toString().includes(term)
        })
    }, [movementsWithoutEntry, conciliationFilter, conciliationSearch, products])

    const filteredEntriesWithoutMovement = useMemo(() => {
        const term = conciliationSearch.trim().toLowerCase()
        return entriesWithoutMovement.filter(entry => {
            const match = getEntryInventoryMatch(entry)
            if (conciliationFilter === 'compras' && match.category !== 'compras') return false
            if (conciliationFilter === 'ventas' && !(match.category === 'ventas' || match.category === 'cmv')) return false
            if (conciliationFilter === 'rt6' && !match.isRT6) return false
            if (!term) return true
            const haystack = [
                entry.memo,
                entry.id,
                match.category,
                entry.sourceModule,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            return haystack.includes(term) || Math.abs(getEntryTotal(entry)).toString().includes(term)
        })
    }, [entriesWithoutMovement, conciliationFilter, conciliationSearch, getEntryInventoryMatch, getEntryTotal])

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
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
                        onClick={() => navigate('/operaciones')}
                    >
                        <ArrowLeft size={14} /> Operaciones
                    </button>
                    <span className="text-slate-300">/</span>
                    <h2 className="text-lg font-display font-semibold text-slate-900">
                        Bienes de Cambio (Mercaderias)
                    </h2>
                    {/* KPI Range Toggle */}
                    <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button
                            onClick={() => changeKpiRangeMode('month')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                kpiRangeMode === 'month'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Mes
                        </button>
                        <button
                            onClick={() => changeKpiRangeMode('ejercicio')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                kpiRangeMode === 'ejercicio'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Ejercicio
                        </button>
                    </div>
                    <div className="hidden sm:flex items-center px-2 py-1 bg-slate-50 rounded-md text-xs font-mono text-slate-500">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                        {kpiDateRange.label}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Inventory Mode Badge */}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${settings?.inventoryMode === 'PERIODIC'
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
                            className={`pb-3 px-1 text-sm transition-all whitespace-nowrap flex items-center gap-2 border-b-2 ${activeTab === tab.id
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
                {/* Configuration Banner */}
                {!isConfigured && !isLoading && (
                    <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <WarningCircle size={20} weight="fill" className="text-amber-500 shrink-0" />
                            <div>
                                <div className="text-sm font-semibold text-amber-800">
                                    Configuracion pendiente
                                </div>
                                <p className="text-xs text-amber-600">
                                    Configura el modo contable, metodo de valuacion y cuentas antes de operar.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setWizardOpen(true)}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap"
                        >
                            Configurar ahora
                        </button>
                    </div>
                )}
                {/* DASHBOARD TAB */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* KPIs - Row 1: Primary metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {/* Stock Valuado */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock Valuado</span>
                                    <Coins className="text-blue-600 shrink-0" size={16} weight="duotone" />
                                </div>
                                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums truncate">
                                    {formatCurrency(kpis.stockValue)}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{kpis.totalUnits.toLocaleString()} u. · {kpis.totalProducts} prod.</div>
                            </div>

                            {/* Ventas Netas */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ventas Netas</span>
                                    <ChartBar className="text-purple-500 shrink-0" size={16} weight="duotone" />
                                </div>
                                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums truncate">
                                    {formatCurrency(enhancedKPIs.ventasNetas)}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{kpiDateRange.label}</div>
                                {salesProgress !== null && (
                                    <div className="h-1 w-full bg-gray-100 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${salesProgress * 100}%` }} />
                                    </div>
                                )}
                            </div>

                            {/* CMV */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CMV</span>
                                    <Scales className="text-amber-500 shrink-0" size={16} weight="duotone" />
                                </div>
                                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums truncate">
                                    {formatCurrency(enhancedKPIs.cmv)}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">Costo merc. vendida</div>
                            </div>

                            {/* Resultado Bruto */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resultado Bruto</span>
                                    <TrendUp className={enhancedKPIs.resultadoBruto >= 0 ? 'text-emerald-500' : 'text-red-500'} size={16} weight="bold" />
                                </div>
                                <div className={`font-mono text-xl font-bold tabular-nums truncate ${enhancedKPIs.resultadoBruto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(enhancedKPIs.resultadoBruto)}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                    Margen: {kpis.grossMargin.toFixed(1)}%
                                    <button type="button" onClick={() => openGoalModal('margin')} className="ml-1 text-slate-400 hover:text-slate-600 underline">obj {marginGoal.toFixed(0)}%</button>
                                </div>
                            </div>

                            {/* Sell-through */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sell-through</span>
                                    <ArrowsLeftRight className="text-sky-500 shrink-0" size={16} weight="duotone" />
                                </div>
                                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                                    {enhancedKPIs.sellThrough.toFixed(0)}%
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                    {enhancedKPIs.unitsSoldNet} vend / {enhancedKPIs.unitsEnteredNet} ingr
                                </div>
                            </div>

                            {/* Rotacion */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rotacion</span>
                                    <Percent className="text-orange-500 shrink-0" size={16} weight="duotone" />
                                </div>
                                <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                                    {enhancedKPIs.rotation.toFixed(1)}x
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">Anualizada · C/u {formatCurrency(enhancedKPIs.costUnitActual)}</div>
                            </div>
                        </div>

                        {/* Mini Chart (FASE 4) */}
                        {miniChartData.some(d => d.value > 0) && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Ventas {kpiRangeMode === 'ejercicio' ? 'por Mes' : 'por Semana'}
                                    </h3>
                                    <span className="text-[10px] text-slate-400">{kpiDateRange.label}</span>
                                </div>
                                <div className="flex items-end gap-1 h-20">
                                    {(() => {
                                        const maxVal = Math.max(...miniChartData.map(d => d.value), 1)
                                        return miniChartData.map((d, i) => (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                                                <div
                                                    className={`w-full rounded-t transition-all ${d.value > 0 ? 'bg-gradient-to-t from-blue-500 to-blue-400' : 'bg-slate-100'}`}
                                                    style={{ height: `${Math.max(2, (d.value / maxVal) * 100)}%` }}
                                                    title={`${d.label}: ${formatCurrency(d.value)}`}
                                                />
                                                <span className="text-[9px] text-slate-400 truncate w-full text-center">{d.label}</span>
                                            </div>
                                        ))
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Stock valuado por producto */}
                        {efHomogenea && efHomogenea.products.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Stock Valuado por Producto</h3>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            Valuacion al cierre ({getPeriodFromDate(periodEnd)}) · Metodo: {settings?.costMethod}
                                        </p>
                                    </div>
                                    {efHomogenea.missingPeriods.length > 0 && (
                                        <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                            Faltan indices: {efHomogenea.missingPeriods.join(', ')}
                                        </div>
                                    )}
                                </div>
                                {efHomogenea.products.map(pv => (
                                    <ProductValuationCard
                                        key={pv.product.id}
                                        product={pv}
                                        method={settings?.costMethod || 'FIFO'}
                                        formatCurrency={formatCurrency}
                                        onViewLots={() => setDashboardLotsProduct(pv)}
                                        bienesProduct={products.find(p => p.id === pv.product.id)}
                                        movements={movements}
                                        productSales={perProductSales.get(pv.product.id) || 0}
                                    />
                                ))}
                            </div>
                        )}

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
                                    onClick={() => {
                                        if (!isConfigured) { setWizardOpen(true); return }
                                        setProductModalOpen(true)
                                    }}
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
                                    if (!isConfigured) { setWizardOpen(true); return }
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
                                        onClick={() => {
                                            if (!isConfigured) { setWizardOpen(true); return }
                                            setProductModalOpen(true)
                                        }}
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
                                                    VALUE_ADJUSTMENT: { label: 'Ajuste RT6', color: 'bg-violet-50 text-violet-700' },
                                                    INITIAL_STOCK: { label: 'Existencia Inicial', color: 'bg-cyan-50 text-cyan-700' },
                                                    PAYMENT: { label: 'Cobro/Pago', color: 'bg-violet-50 text-violet-600' },
                                                }
                                                // Distinguish sub-types by adjustmentKind and qty
                                                let typeInfo = typeLabels[mov.type] || { label: mov.type, color: 'bg-slate-50 text-slate-600' }
                                                if (mov.isDevolucion) {
                                                    if (mov.type === 'PURCHASE') {
                                                        typeInfo = { label: 'Devolucion compra', color: 'bg-rose-50 text-rose-700' }
                                                    } else if (mov.type === 'SALE') {
                                                        typeInfo = { label: 'Devolucion venta', color: 'bg-rose-50 text-rose-700' }
                                                    }
                                                }
                                                // PURCHASE with qty=0 is a "solo gasto" (expense-only, no stock)
                                                if (mov.type === 'PURCHASE' && mov.quantity === 0) {
                                                    typeInfo = { label: 'Gasto s/compra', color: 'bg-amber-50 text-amber-700' }
                                                }
                                                if (mov.type === 'VALUE_ADJUSTMENT') {
                                                    if (mov.adjustmentKind === 'CAPITALIZATION') {
                                                        typeInfo = { label: 'Gasto Capitaliz.', color: 'bg-amber-50 text-amber-700' }
                                                    } else if (mov.adjustmentKind === 'BONUS_PURCHASE') {
                                                        typeInfo = { label: 'Bonif. compra', color: 'bg-indigo-50 text-indigo-700' }
                                                    } else if (mov.adjustmentKind === 'BONUS_SALE') {
                                                        typeInfo = { label: 'Bonif. venta', color: 'bg-indigo-50 text-indigo-700' }
                                                    } else if (mov.adjustmentKind === 'DISCOUNT_PURCHASE') {
                                                        typeInfo = { label: 'Desc. obtenido', color: 'bg-slate-100 text-slate-700' }
                                                    } else if (mov.adjustmentKind === 'DISCOUNT_SALE') {
                                                        typeInfo = { label: 'Desc. otorgado', color: 'bg-slate-100 text-slate-700' }
                                                    } else if (mov.adjustmentKind === 'RT6' || mov.rt6Period || mov.rt6SourceEntryId) {
                                                        typeInfo = { label: 'Ajuste RT6', color: 'bg-violet-50 text-violet-700' }
                                                    } else {
                                                        typeInfo = { label: 'Ajuste Valor', color: 'bg-slate-100 text-slate-600' }
                                                    }
                                                }
                                                // P2: Distinguish Cobro vs Pago
                                                if (mov.type === 'PAYMENT') {
                                                    if (mov.paymentDirection === 'COBRO') {
                                                        typeInfo = { label: 'Cobro', color: 'bg-emerald-50 text-emerald-700' }
                                                    } else if (mov.paymentDirection === 'PAGO') {
                                                        typeInfo = { label: 'Pago', color: 'bg-rose-50 text-rose-700' }
                                                    }
                                                }
                                                const isEntry = (mov.type === 'PURCHASE' && !mov.isDevolucion)
                                                    || (mov.type === 'SALE' && mov.isDevolucion)
                                                    || (mov.type === 'ADJUSTMENT' && mov.quantity > 0)
                                                    || mov.type === 'INITIAL_STOCK'
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
                                                            {mov.quantity === 0 ? '0' : `${isEntry ? '+' : '-'}${Math.abs(mov.quantity)}`}
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
                        <div className="max-w-7xl mx-auto">
                            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-50 p-2 rounded-full">
                                        <Scales className="text-blue-600" size={22} weight="duotone" />
                                    </div>
                                    <div>
                                        <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                                            Conciliación Inventario vs Contabilidad
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                V2
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            Detecta movimientos sin asiento y asientos sin movimiento.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
                                <div className="flex flex-wrap gap-4">
                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                                            <WarningCircle size={20} weight="duotone" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 uppercase font-bold tracking-wide">Sin Asiento</div>
                                            <div className="font-display font-bold text-xl text-slate-900">
                                                {movementsWithoutEntry.length}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                            <ArrowsLeftRight size={20} weight="duotone" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 uppercase font-bold tracking-wide">Sin Movimiento</div>
                                            <div className="font-display font-bold text-xl text-slate-900">
                                                {entriesWithoutMovement.length}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 ring-2 ring-blue-500/10">
                                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                            <TrendUp size={20} weight="duotone" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-indigo-600 uppercase font-bold tracking-wide">RT6 Pendientes</div>
                                            <div className="font-display font-bold text-xl text-slate-900">
                                                {rt6PendingCount}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={openNewMovementModal}
                                        className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl transition-all"
                                    >
                                        <Plus size={16} weight="bold" /> Nuevo Movimiento
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 text-sm">
                                <span className="text-slate-500 font-medium px-2">Filtrar:</span>
                                <button
                                    onClick={() => setConciliationFilter('all')}
                                    className={`px-3 py-1.5 rounded-full font-medium transition-colors ${conciliationFilter === 'all'
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => setConciliationFilter('compras')}
                                    className={`px-3 py-1.5 rounded-full font-medium transition-colors ${conciliationFilter === 'compras'
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    Compras
                                </button>
                                <button
                                    onClick={() => setConciliationFilter('ventas')}
                                    className={`px-3 py-1.5 rounded-full font-medium transition-colors ${conciliationFilter === 'ventas'
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    Ventas
                                </button>
                                <button
                                    onClick={() => setConciliationFilter('rt6')}
                                    className={`px-3 py-1.5 rounded-full font-medium transition-colors ${conciliationFilter === 'rt6'
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    RT6 (Ajustes)
                                </button>
                                <div className="ml-auto flex items-center gap-2">
                                    <div className="relative">
                                        <MagnifyingGlass size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={conciliationSearch}
                                            onChange={(e) => setConciliationSearch(e.target.value)}
                                            placeholder="Buscar producto o importe..."
                                            aria-label="Buscar en conciliacion"
                                            className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm w-60 focus:outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-semibold">
                                    Movimientos sin asiento: {movementsWithoutEntry.length}
                                </span>
                                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-semibold">
                                    Asientos sin movimiento: {entriesWithoutMovement.length}
                                </span>
                            </div>
                        </div>
                        {inventoryAccountResolution.usedHeuristic && (
                            <div className="max-w-7xl mx-auto bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                                <Info size={16} className="mt-0.5" />
                                <div>
                                    Detectamos cuentas de bienes de cambio por nombre o codigo. Recomendado: configurarlas en Operaciones → Inventario → Cierre.
                                </div>
                            </div>
                        )}

                        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-6 items-start h-full">
                            {/* Panel A — En Inventario */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[500px]">
                                <header className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                                    <div className="flex items-center gap-2">
                                        <Package className="text-slate-400" size={18} weight="fill" />
                                        <h3 className="font-display font-bold text-slate-800">En Inventario</h3>
                                    </div>
                                    <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md">
                                        Falta asiento
                                    </span>
                                </header>

                                <div className="p-4 flex flex-col gap-3">
                                    {filteredMovementsWithoutEntry.length === 0 ? (
                                        <div className="mt-auto p-6 text-center">
                                            <p className="text-sm text-slate-400 italic">
                                                &quot;Chequeá estos movimientos, parecen estar colgados sin su contraparte contable.&quot; — Boti
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                        {filteredMovementsWithoutEntry.map((mov) => {
                                            const product = products.find(p => p.id === mov.productId)
                                            const candidates = getEntryCandidatesForMovement(mov)
                                            const hasError = mov.journalStatus === 'error'
                                            const isMissing = mov.journalStatus === 'missing'
                                            const typeLabel = mov.type === 'PURCHASE'
                                                ? (mov.quantity === 0 ? 'GASTO S/COMPRA' : 'COMPRA')
                                                : mov.type === 'SALE'
                                                    ? 'VENTA'
                                                    : mov.type === 'VALUE_ADJUSTMENT'
                                                        ? (mov.adjustmentKind === 'CAPITALIZATION' ? 'GASTO CAPITALIZ.' : 'AJUSTE RT6')
                                                        : 'AJUSTE'
                                            const stockDelta = mov.type === 'SALE'
                                                ? -Math.abs(mov.quantity)
                                                : mov.quantity
                                            const unitLabel = product?.unit || 'u.'
                                            return (
                                                <div
                                                    key={mov.id}
                                                    className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer group relative overflow-hidden transition-all duration-200 hover:border-blue-200"
                                                >
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400" />
                                                    <div className="flex justify-between items-start mb-2 pl-2">
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-500 mb-0.5">
                                                                {typeLabel} • {formatDate(mov.date).toUpperCase()}
                                                            </div>
                                                            <div className="font-semibold text-slate-900">
                                                                {product?.name || 'Producto eliminado'}
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                Stock: {stockDelta >= 0 ? '+' : ''}{stockDelta.toLocaleString('es-AR')} {unitLabel}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono font-medium text-slate-900">
                                                                {formatCurrency(mov.total)}
                                                            </div>
                                                            <div className="bg-orange-50 text-orange-600 border border-orange-100 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1">
                                                                SIN ASIENTO
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="pl-2 flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleGenerateJournal(mov.id)}
                                                            className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded font-medium hover:bg-blue-100"
                                                        >
                                                            {hasError ? 'Reintentar' : isMissing ? 'Regenerar asiento' : 'Generar Asiento'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleStartLinkMovement(mov)}
                                                            className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded font-medium hover:bg-slate-100"
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
                                                                        className={`px-2 py-0.5 rounded-full border text-[10px] ${score === 'high'
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
                            </div>

                            {/* Panel B — En Diario */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[500px]">
                                <header className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                                    <div className="flex items-center gap-2">
                                        <Notebook className="text-slate-400" size={18} weight="fill" />
                                        <h3 className="font-display font-bold text-slate-800">En Diario</h3>
                                    </div>
                                    <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md">
                                        Falta mov. stock
                                    </span>
                                </header>

                                <div className="p-4 flex flex-col gap-4">
                                    {filteredEntriesWithoutMovement.length === 0 ? (
                                        <div className="text-center text-slate-500 text-sm py-8">
                                            No hay asientos pendientes de inventario.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                        {filteredEntriesWithoutMovement.map((entry) => {
                                            const total = getEntryTotal(entry)
                                            const candidates = getMovementCandidatesForEntry(entry)
                                            const entryMatch = getEntryInventoryMatch(entry)
                                            const entryTypeLabel = getEntryTypeLabel(entryMatch.category)
                                            const triggerAccountName = entryMatch.triggerAccountId
                                                ? getAccountName(entryMatch.triggerAccountId)
                                                : null
                                            const isRT6 = entryMatch.isRT6
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className={`bg-white border ${isRT6 ? 'border-blue-200' : 'border-slate-200'} rounded-xl p-0 shadow-sm relative overflow-hidden`}
                                                >
                                                    <div className={`px-4 py-2 border-b ${isRT6 ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'} flex justify-between items-center`}>
                                                        <div className="flex items-center gap-2">
                                                            {isRT6 && (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                                                                    RT6 (INFLACION)
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-slate-700 font-medium">
                                                                {entry.memo || 'Asiento sin leyenda'}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-slate-500">
                                                            {formatDate(entry.date).toUpperCase()}
                                                        </span>
                                                    </div>

                                                    <div className="p-4">
                                                        <div className="flex justify-between items-start">
                                                            <div className="pr-4">
                                                                <h4 className="font-semibold text-slate-900 text-sm">
                                                                    {isRT6 ? 'Ajuste por Inflación (RECPAM)' : (entry.memo || 'Asiento sin leyenda')}
                                                                </h4>
                                                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                                    {isRT6
                                                                        ? 'Este asiento refleja la pérdida/ganancia de poder adquisitivo, pero no se aplicó al valor del stock.'
                                                                        : entryTypeLabel
                                                                    }
                                                                </p>
                                                                {!isRT6 && triggerAccountName && (
                                                                    <p className="text-xs text-slate-400 mt-1">
                                                                        Cuenta: {triggerAccountName}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <div className="font-mono font-bold text-lg text-slate-900">
                                                                    {formatCurrency(total)}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 mt-1 uppercase">
                                                                    {isRT6 ? (total >= 0 ? 'Pérdida neta' : 'Ganancia neta') : `#${entry.id.slice(0, 8)}`}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="mt-4 flex flex-wrap gap-2">
                                                            {entryMatch.category === 'rt6_adjustment' ? (<>
                                                                <button
                                                                    onClick={() => handleOpenRT6Preview(entry)}
                                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5"
                                                                >
                                                                    <Sparkle size={14} weight="bold" /> Aplicar a Inventario
                                                                </button>
                                                                <button
                                                                    onClick={() => handleStartLinkEntry(entry)}
                                                                    className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 text-slate-600"
                                                                >
                                                                    Ver asiento
                                                                </button>
                                                            </>) : (<>
                                                                <button
                                                                    onClick={() => handleCreateMovementFromEntry(entry)}
                                                                    className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-medium hover:bg-emerald-100"
                                                                >
                                                                    Crear movimiento
                                                                </button>
                                                                <button
                                                                    onClick={() => handleStartLinkEntry(entry)}
                                                                    className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded font-medium hover:bg-slate-100"
                                                                >
                                                                    Vincular
                                                                </button>
                                                            </>)}
                                                        </div>
                                                    </div>

                                                    {/* Sugerencias de impacto (RT6) / Sugerencias (standard) */}
                                                    {isRT6 ? (
                                                        <div className="bg-slate-50 p-3 border-t border-slate-100">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Sparkle className="text-purple-500" size={14} weight="duotone" />
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                                                    Sugerencias de impacto
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-2 overflow-x-auto">
                                                                {(entryMatch.matchedKeys || []).map((key: string) => (
                                                                    <span key={key} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                                                                        {key === 'mercaderias' ? 'Mercaderías (Global)' :
                                                                         key === 'compras' ? 'Compras' :
                                                                         key === 'gastosCompras' ? 'Gastos s/Compras' :
                                                                         key === 'bonifCompras' ? 'Bonif. s/Compras' :
                                                                         key === 'devolCompras' ? 'Devol. s/Compras' : key}
                                                                    </span>
                                                                ))}
                                                                {(entryMatch.matchedKeys || []).length === 0 && (
                                                                    <span className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                                                                        Mercaderías (Global)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : candidates.length > 0 ? (
                                                        <div className="bg-slate-50 p-3 border-t border-slate-100 space-y-2">
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
                                                                            className={`px-2 py-0.5 rounded-full border text-[10px] ${score === 'high'
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
                                                    ) : null}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* CIERRE TAB */}
                {activeTab === 'cierre' && (() => {
                    const isPeriodic = settings?.inventoryMode === 'PERIODIC'
                    const rt6HasData = rt6CierreAdjustments.hasAny
                    const comprasNetasAdj = rt6CierreAdjustments.comprasAdj + rt6CierreAdjustments.gastosAdj + rt6CierreAdjustments.bonifAdj + rt6CierreAdjustments.devolAdj
                    const comprasNetasHomog = comprasNetas + comprasNetasAdj
                    const eiHomog = existenciaInicial + rt6CierreAdjustments.eiAdj
                    const efTeoricaHomog = efHomogenea?.totalEndingValueHomog ?? inventarioTeorico
                    const cmvHomog = eiHomog + comprasNetasHomog - efTeoricaHomog
                    const difInvLocal = esFisicoDefinido ? (closingPhysicalValue! - inventarioTeorico) : 0

                    // Count movements for status chip
                    const movementsCountCierre = movements.filter(m => m.type !== 'VALUE_ADJUSTMENT').length
                    // Count unlinked for alerts
                    const alertsCountCierre = movements.filter(m => (m.linkedJournalEntryIds || []).length === 0 && m.type !== 'VALUE_ADJUSTMENT').length

                    return (
                        <CierreInventarioTab
                            isPeriodic={isPeriodic}
                            costMethod={settings?.costMethod || 'FIFO'}
                            yearRangeStart={yearRange.start}
                            yearRangeEnd={yearRange.end}
                            existenciaInicial={existenciaInicial}
                            comprasBrutas={comprasBrutas}
                            gastosCompras={cierreTotals.gastosCompras}
                            bonifCompras={cierreTotals.bonifCompras}
                            devolCompras={cierreTotals.devolCompras}
                            comprasNetas={comprasNetas}
                            ventasBrutas={ventasBrutas}
                            bonifVentas={cierreTotals.bonifVentas}
                            devolVentas={cierreTotals.devolVentas}
                            ventasNetas={ventasNetas}
                            inventarioTeorico={inventarioTeorico}
                            cmvPorDiferencia={cmvPorDiferencia}
                            rt6HasData={rt6HasData}
                            rt6Adjustments={{
                                eiAdj: rt6CierreAdjustments.eiAdj,
                                comprasAdj: rt6CierreAdjustments.comprasAdj,
                                gastosAdj: rt6CierreAdjustments.gastosAdj,
                                bonifAdj: rt6CierreAdjustments.bonifAdj,
                                devolAdj: rt6CierreAdjustments.devolAdj,
                            }}
                            eiHomog={eiHomog}
                            comprasNetasHomog={comprasNetasHomog}
                            efTeoricaHomog={efTeoricaHomog}
                            cmvHomog={cmvHomog}
                            closingPhysicalValue={closingPhysicalValue}
                            setClosingPhysicalValue={setClosingPhysicalValue}
                            esFisicoDefinido={esFisicoDefinido}
                            difInvLocal={difInvLocal}
                            openingBalanceDate={openingBalanceDate || ''}
                            handleOpeningDateChange={handleOpeningDateChange}
                            hasSavedMappings={hasSavedMappings}
                            accountMappingsSummary={accountMappingsSummary}
                            openAccountConfigModal={openAccountConfigModal}
                            handleGenerateClosingEntry={handleGenerateClosingEntry}
                            closingIsSaving={closingIsSaving}
                            showHomogeneo={showHomogeneo}
                            setShowHomogeneo={setShowHomogeneo}
                            movementsCount={movementsCountCierre}
                            alertsCount={alertsCountCierre}
                            formatCurrency={formatCurrency}
                        />
                    )
                })()}

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
                    accounts={accounts || []}
                    defaultOpeningContraId={defaultOpeningContraId || undefined}
                />
            )}

            {movementModalOpen && settings && (
                <MovementModalV3
                    products={products}
                    valuations={valuations}
                    costMethod={settings.costMethod}
                    onSave={handleSaveMovement}
                    initialData={movementPrefill || undefined}
                    mode={editingMovement ? 'edit' : 'create'}
                    accounts={accounts}
                    periodId={periodId}
                    movements={movements}
                    entries={scopedJournalEntries}
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
                                                className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md border ${selectedLinkEntryId === entry.id
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
                                                    className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md border ${selectedLinkMovementId === movement.id
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
                    className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-slide-in ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
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

            {/* Dashboard Lots Drawer (new prototype-based UI) */}
            <ProductLotsDrawer
                product={dashboardLotsProduct}
                method={settings?.costMethod || 'FIFO'}
                closingPeriod={getPeriodFromDate(periodEnd)}
                formatCurrency={formatCurrency}
                onClose={() => setDashboardLotsProduct(null)}
                bienesProduct={dashboardLotsProduct?.product}
                movements={movements}
            />

            {/* Layers Drawer (EF Homogénea detail per product) */}
            {layersDrawerProduct && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setLayersDrawerProduct(null)} />
                    <div className="relative w-full max-w-lg bg-white shadow-xl animate-slide-in-right overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    Capas de Costo — {layersDrawerProduct.product.name}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    SKU: {layersDrawerProduct.product.sku} · Metodo: {layersDrawerProduct.method}
                                </p>
                            </div>
                            <button onClick={() => setLayersDrawerProduct(null)} className="p-1 hover:bg-slate-100 rounded">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                                <div>
                                    <span className="text-[10px] uppercase text-slate-400">Qty Final</span>
                                    <div className="font-mono text-lg font-bold">{layersDrawerProduct.endingQty} {layersDrawerProduct.product.unit}</div>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase text-slate-400">V. Origen</span>
                                    <div className="font-mono text-lg font-bold">{formatCurrency(layersDrawerProduct.endingValueOrigen)}</div>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase text-slate-400">V. Homogeneo</span>
                                    <div className="font-mono text-lg font-bold text-indigo-700">{formatCurrency(layersDrawerProduct.endingValueHomog)}</div>
                                </div>
                            </div>
                            <div className="text-sm text-slate-600">
                                Ajuste: <span className={`font-mono font-bold ${layersDrawerProduct.ajuste >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatCurrency(layersDrawerProduct.ajuste)}
                                </span>
                                <span className="text-slate-400 ml-1">({layersDrawerProduct.ajustePct.toFixed(2)}%)</span>
                            </div>

                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Detalle de Capas</h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-slate-400 border-b border-slate-200">
                                                <th className="text-left py-2 pr-2">Fecha Origen</th>
                                                <th className="text-right py-2 px-1">Qty</th>
                                                <th className="text-right py-2 px-1">$/u Origen</th>
                                                <th className="text-right py-2 px-1">Total Origen</th>
                                                <th className="text-right py-2 px-1">Coef</th>
                                                <th className="text-right py-2 px-1">$/u Homog</th>
                                                <th className="text-right py-2 pl-1">Total Homog</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {layersDrawerProduct.layers.map((layer, idx) => (
                                                <tr key={idx} className="border-b border-slate-50">
                                                    <td className="py-2 pr-2 font-mono">
                                                        {layer.date === 'PPP' ? 'PPP (prom.)' : layer.date}
                                                        {layer.indexOrigen === null && layer.date !== 'PPP' && (
                                                            <span className="text-amber-500 ml-1" title="Sin indice para este periodo">⚠</span>
                                                        )}
                                                    </td>
                                                    <td className="text-right py-2 px-1 font-mono">{layer.quantity}</td>
                                                    <td className="text-right py-2 px-1 font-mono">{layer.unitCostOrigen.toFixed(2)}</td>
                                                    <td className="text-right py-2 px-1 font-mono">{formatCurrency(layer.totalOrigen)}</td>
                                                    <td className="text-right py-2 px-1 font-mono text-indigo-600">{layer.coef.toFixed(4)}</td>
                                                    <td className="text-right py-2 px-1 font-mono text-indigo-700">{layer.unitCostHomog.toFixed(2)}</td>
                                                    <td className="text-right py-2 pl-1 font-mono text-indigo-700 font-bold">{formatCurrency(layer.totalHomog)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-200 font-bold">
                                                <td className="py-2 pr-2">Total</td>
                                                <td className="text-right py-2 px-1 font-mono">
                                                    {layersDrawerProduct.layers.reduce((s, l) => s + l.quantity, 0)}
                                                </td>
                                                <td className="text-right py-2 px-1"></td>
                                                <td className="text-right py-2 px-1 font-mono">{formatCurrency(layersDrawerProduct.endingValueOrigen)}</td>
                                                <td className="text-right py-2 px-1"></td>
                                                <td className="text-right py-2 px-1"></td>
                                                <td className="text-right py-2 pl-1 font-mono text-indigo-700">{formatCurrency(layersDrawerProduct.endingValueHomog)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {layersDrawerProduct.layers.some(l => l.indexOrigen !== null) && (
                                <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded">
                                    Indices FACPCE: {layersDrawerProduct.layers
                                        .filter(l => l.indexOrigen !== null)
                                        .map(l => `${l.originPeriod}: ${l.indexOrigen}`)
                                        .join(' | ')}
                                    {layersDrawerProduct.layers[0]?.indexCierre !== null && (
                                        <> | Cierre ({layersDrawerProduct.layers[0].closingPeriod}): {layersDrawerProduct.layers[0].indexCierre}</>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* RT6 Preview Modal */}
            {rt6PreviewOpen && rt6PreviewData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => {
                            if (!rt6ApplyingId) {
                                setRt6PreviewOpen(false)
                                setRt6PreviewData(null)
                            }
                        }}
                    />
                    <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
                        {/* Header */}
                        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 bg-white text-blue-700">
                                        RT6 (INFLACIÓN)
                                    </span>
                                    {rt6PreviewData.isAlreadyApplied && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                            YA APLICADO
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    Vista previa: Ajuste RT6
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Revisá los movimientos que se crearán antes de confirmar.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (!rt6ApplyingId) {
                                        setRt6PreviewOpen(false)
                                        setRt6PreviewData(null)
                                    }
                                }}
                                disabled={!!rt6ApplyingId}
                                className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                            >
                                <X size={20} weight="bold" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                            {/* Entry Source Info */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                                    Asiento Origen
                                </div>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-semibold text-slate-900">
                                            {rt6PreviewData.entry.memo || 'Ajuste por inflación'}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            #{rt6PreviewData.entry.id.slice(0, 8)} · {formatDate(rt6PreviewData.entry.date)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-mono font-bold text-xl ${rt6PreviewData.adjustmentAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {rt6PreviewData.adjustmentAmount >= 0 ? '+' : ''}{formatCurrency(rt6PreviewData.adjustmentAmount)}
                                        </div>
                                        <div className="text-[10px] text-slate-400 uppercase">
                                            Delta total
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Info message */}
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-3">
                                <Info className="text-blue-600 mt-0.5 shrink-0" size={16} weight="fill" />
                                <p className="text-xs text-blue-800">
                                    <strong>Esto NO cambia cantidades.</strong> Actualiza la valuacion homogenea vinculada a RT6 Paso 2 por periodo de origen.
                                </p>
                            </div>

                            {/* Unmatched origins warning */}
                            {rt6PreviewData.plan.unmatchedOrigins.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <WarningCircle className="text-red-600 shrink-0" size={16} weight="fill" />
                                        <span className="text-xs font-bold text-red-800">Origenes sin match en inventario</span>
                                    </div>
                                    <ul className="text-xs text-red-700 space-y-1 ml-6">
                                        {rt6PreviewData.plan.unmatchedOrigins.map((u, i) => (
                                            <li key={i}>{u.label} ({u.accountCode}) — {formatCurrency(u.delta)}</li>
                                        ))}
                                    </ul>
                                    <p className="text-[10px] text-red-500 mt-2">No se puede aplicar hasta resolver estos origenes.</p>
                                </div>
                            )}

                            {/* Desglose por origen (Paso 2) */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">
                                    Desglose por origen — Paso 2 ({rt6PreviewData.plan.items.length} ajustes)
                                </h4>
                                <div className="space-y-4">
                                    {(() => {
                                        // Group items by originCategory + period
                                        const groups = new Map<string, RT6ApplyPlanItem[]>()
                                        for (const item of rt6PreviewData.plan.items) {
                                            const key = `${item.originCategory}|${item.period}`
                                            if (!groups.has(key)) groups.set(key, [])
                                            groups.get(key)!.push(item)
                                        }
                                        const CATEGORY_LABELS: Record<OriginCategory, string> = {
                                            EI: 'Existencia Inicial',
                                            COMPRAS: 'Compras',
                                            GASTOS_COMPRA: 'Gastos s/compra',
                                            BONIF_COMPRA: 'Bonif s/compra',
                                            DEVOL_COMPRA: 'Devol s/compra',
                                        }
                                        return Array.from(groups.entries()).map(([key, groupItems]) => {
                                            const [cat, period] = key.split('|') as [OriginCategory, string]
                                            const groupDelta = groupItems.reduce((s, i) => s + i.valueDelta, 0)
                                            return (
                                                <div key={key} className="border border-slate-200 rounded-lg overflow-hidden">
                                                    <div className="bg-slate-50 px-3 py-2 flex justify-between items-center border-b border-slate-100">
                                                        <span className="text-xs font-semibold text-slate-700">
                                                            {CATEGORY_LABELS[cat]} — {period}
                                                        </span>
                                                        <span className={`font-mono text-xs font-bold ${groupDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {groupDelta >= 0 ? '+' : ''}{formatCurrency(groupDelta)}
                                                        </span>
                                                    </div>
                                                    <div className="divide-y divide-slate-100">
                                                        {groupItems.map((item, idx) => {
                                                            const prod = products.find(p => p.id === item.productId)
                                                            return (
                                                                <div key={idx} className="px-3 py-2 flex justify-between items-center">
                                                                    <div>
                                                                        <div className="text-sm text-slate-800">{prod?.name || 'Producto'}</div>
                                                                        <div className="text-[10px] text-slate-400">
                                                                            {item.targetMovementId ? `#${item.targetMovementId.slice(0, 8)}` : 'Apertura'} · Hist: {formatCurrency(item.historicalValue)}
                                                                        </div>
                                                                    </div>
                                                                    <div className={`font-mono text-sm font-semibold ${item.valueDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                        {item.valueDelta >= 0 ? '+' : ''}{formatCurrency(item.valueDelta)}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>

                                {/* Total Control */}
                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                    <div>
                                        <span className="text-sm font-medium text-slate-700">Total control</span>
                                        {Math.abs(rt6PreviewData.plan.roundingDiff) > 0.01 && (
                                            <span className="text-[10px] text-amber-500 ml-2">
                                                Dif. redondeo: {formatCurrency(rt6PreviewData.plan.roundingDiff)}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`font-mono font-bold text-lg ${rt6PreviewData.plan.totalDeltaControl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {rt6PreviewData.plan.totalDeltaControl >= 0 ? '+' : ''}{formatCurrency(rt6PreviewData.plan.totalDeltaControl)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3 bg-slate-50">
                            <button
                                onClick={() => {
                                    setRt6PreviewOpen(false)
                                    setRt6PreviewData(null)
                                }}
                                disabled={!!rt6ApplyingId}
                                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmRT6Apply}
                                disabled={!!rt6ApplyingId || rt6PreviewData.isAlreadyApplied || !rt6PreviewData.plan.isValid}
                                className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                            >
                                {rt6ApplyingId ? (
                                    <>Aplicando...</>
                                ) : rt6PreviewData.isAlreadyApplied ? (
                                    <>Ya aplicado</>
                                ) : !rt6PreviewData.plan.isValid ? (
                                    <>Origenes sin match</>
                                ) : (
                                    <><CheckCircle size={16} weight="fill" /> Confirmar y aplicar</>
                                )}
                            </button>
                        </div>
                    </div>
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

            {/* Onboarding Wizard */}
            {wizardOpen && settings && accounts && (
                <InventarioOnboardingWizard
                    settings={settings}
                    accounts={accounts}
                    onComplete={handleOnboardingComplete}
                    onCancel={isConfigured ? () => setWizardOpen(false) : undefined}
                />
            )}
        </div>
    )
}
