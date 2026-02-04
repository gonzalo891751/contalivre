/**
 * Bienes de Uso (Fixed Assets) Page
 *
 * Main page for managing fixed assets with:
 * - List view with asset cards and progress bars
 * - Detail view with tabs (Resumen, Planilla, Asiento, Eventos)
 * - Create/Edit modal
 * - RT6 (inflation adjustment) toggle
 */

import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    Plus,
    MagnifyingGlass,
    Car,
    Buildings,
    Wrench,
    Desktop,
    Armchair,
    MapPin,
    Package,
    X,
    Warning,
    CheckCircle,
    Clock,
    Trash,
    PencilSimple,
    Receipt,
    CalendarPlus,
    CurrencyCircleDollar,
    Code,
    Stamp,
} from '@phosphor-icons/react'
import { db } from '../../storage/db'
import type { JournalEntry } from '../../core/models'
import {
    getAllFixedAssets,
    createFixedAsset,
    updateFixedAsset,
    deleteFixedAsset,
    calculateFixedAssetDepreciationWithEvents,
    generateAmortizationEntry,
    generateDepreciationSchedule,
    buildFixedAssetOpeningEntry,
    syncFixedAssetOpeningEntry,
    syncFixedAssetAcquisitionEntry,
    buildFixedAssetEventJournalEntry,
    createFixedAssetEvent,
    syncFixedAssetEventJournalEntry,
    buildFixedAssetRT6Entry,
    syncFixedAssetRT6Entry,
    calculateRT6Adjustment,
} from '../../storage/fixedAssets'
import { ensureAssetAccounts, validateCategoryParentsExist } from '../../lib/assetAccounts'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import {
    type FixedAsset,
    type FixedAssetCategory,
    type FixedAssetMethod,
    type FixedAssetStatus,
    type FixedAssetEvent,
    type FixedAssetEventType,
    type FixedAssetOriginType,
    type AcquisitionData,
    type OpeningData,
    type PaymentSplit,
    FIXED_ASSET_CATEGORIES,
    TANGIBLE_CATEGORIES,
    INTANGIBLE_CATEGORIES,
    STATUS_LABELS,
    METHOD_LABELS,
    getAssetTypeFromCategory,
    createDefaultAcquisition,
    createDefaultOpening,
} from '../../core/fixedAssets/types'
import AccountSearchSelect from '../../ui/AccountSearchSelect'

type ViewMode = 'list' | 'detail'
type TabId = 'resumen' | 'planilla' | 'asiento' | 'eventos'
type EventFormState = {
    type: FixedAssetEventType
    date: string
    amount: number
    contraAccountId: string
    notes: string
}

// Category to icon mapping
const CATEGORY_ICONS: Record<FixedAssetCategory, typeof Car> = {
    // Tangibles
    'Rodados': Car,
    'Inmuebles': Buildings,
    'Instalaciones': Buildings,
    'Maquinarias': Wrench,
    'Equipos de Computacion': Desktop,
    'Muebles y Utiles': Armchair,
    'Terrenos': MapPin,
    'Otros': Package,
    // Intangibles
    'Software': Code,
    'Marcas y Patentes': Stamp,
    'Otros Intangibles': Package,
}

// Status to badge style mapping
const STATUS_STYLES: Record<FixedAssetStatus, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    in_progress: 'bg-amber-50 text-amber-600 border-amber-100',
    sold: 'bg-red-50 text-red-600 border-red-100',
    amortized: 'bg-slate-100 text-slate-600 border-slate-200',
}

const ENTRY_STATUS_STYLES: Record<'generated' | 'pending' | 'error', string> = {
    generated: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    pending: 'bg-amber-50 text-amber-700 border-amber-100',
    error: 'bg-red-50 text-red-700 border-red-100',
}

const EVENT_TYPE_LABELS: Record<FixedAssetEventType, string> = {
    IMPROVEMENT: 'Mejora',
    REVALUATION: 'Revalúo',
    DISPOSAL: 'Baja / Venta',
    DAMAGE: 'Deterioro',
}

const ENTRY_STATUS_LABELS: Record<'generated' | 'pending' | 'error', string> = {
    generated: 'Generado',
    pending: 'Pendiente',
    error: 'Error',
}

export default function BienesUsoPage() {
    const navigate = useNavigate()
    const { year: periodYear } = usePeriodYear()
    const periodId = String(periodYear)

    // State
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabId>('resumen')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null)
    const [rt6Enabled, setRt6Enabled] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [isEventModalOpen, setIsEventModalOpen] = useState(false)
    const [eventForm, setEventForm] = useState<EventFormState | null>(null)
    const [eventError, setEventError] = useState<string | null>(null)
    const [eventPreview, setEventPreview] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [eventPreviewError, setEventPreviewError] = useState<string | null>(null)
    const [openingPreview, setOpeningPreview] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [openingPreviewError, setOpeningPreviewError] = useState<string | null>(null)
    const [rt6Preview, setRT6Preview] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [rt6PreviewError, setRT6PreviewError] = useState<string | null>(null)
    const [rt6Info, setRT6Info] = useState<Awaited<ReturnType<typeof calculateRT6Adjustment>> | null>(null)

    // Data queries
    const assets = useLiveQuery(() => getAllFixedAssets(periodId), [periodId])
    const selectedAsset = useLiveQuery(
        () => (selectedAssetId ? db.fixedAssets.get(selectedAssetId) : undefined),
        [selectedAssetId]
    )
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])
    const events = useLiveQuery(
        () => db.fixedAssetEvents.where('periodId').equals(periodId).toArray(),
        [periodId]
    )
    const openingEntry = useLiveQuery(
        async () => {
            if (!selectedAsset) return undefined
            if (selectedAsset.openingJournalEntryId) {
                const byId = await db.entries.get(selectedAsset.openingJournalEntryId)
                if (byId) return byId
            }
            const all = await db.entries.toArray()
            return all.find(e => {
                const meta = e.metadata?.meta
                return (
                    e.sourceModule === 'fixed-assets' &&
                    e.sourceType === 'opening' &&
                    meta?.kind === 'opening' &&
                    meta?.assetId === selectedAsset.id &&
                    meta?.fiscalYear === periodYear
                )
            })
        },
        [selectedAsset?.id, selectedAsset?.openingJournalEntryId, periodYear]
    )
    const rt6Entry = useLiveQuery(
        async () => {
            if (!selectedAsset) return undefined
            if (selectedAsset.rt6JournalEntryId) {
                const byId = await db.entries.get(selectedAsset.rt6JournalEntryId)
                if (byId) return byId
            }
            const all = await db.entries.toArray()
            return all.find(e => {
                const meta = e.metadata?.meta
                return (
                    e.sourceModule === 'fixed-assets' &&
                    e.sourceType === 'rt6' &&
                    meta?.kind === 'rt6' &&
                    meta?.assetId === selectedAsset.id &&
                    meta?.fiscalYear === periodYear
                )
            })
        },
        [selectedAsset?.id, selectedAsset?.rt6JournalEntryId, periodYear]
    )
    const eventEntries = useLiveQuery(
        async () => {
            if (!selectedAsset) return []
            const all = await db.entries.toArray()
            return all.filter(e => {
                const meta = e.metadata?.meta
                return (
                    e.sourceModule === 'fixed-assets' &&
                    e.sourceType === 'event' &&
                    meta?.kind === 'event' &&
                    meta?.assetId === selectedAsset.id
                )
            })
        },
        [selectedAsset?.id]
    )
    const cierreState = useLiveQuery(
        async () => {
            const all = await db.cierreValuacionState.toArray()
            return all.find(s => s.id === 'cierre-valuacion-state')
        },
        []
    )

    const indices = cierreState?.indices || []

    const eventsByAsset = useMemo(() => {
        const map = new Map<string, FixedAssetEvent[]>()
        if (!events) return map
        for (const event of events) {
            const list = map.get(event.assetId) || []
            list.push(event)
            map.set(event.assetId, list)
        }
        return map
    }, [events])

    const accountMap = useMemo(() => {
        if (!accounts) return new Map<string, { name: string; code: string }>()
        return new Map(accounts.map(acc => [acc.id, { name: acc.name, code: acc.code }]))
    }, [accounts])

    const eventEntryMap = useMemo(() => {
        if (!eventEntries) return new Map<string, JournalEntry>()
        return new Map(eventEntries.map(entry => [entry.id, entry]))
    }, [eventEntries])

    const selectedEvents = useMemo(() => {
        if (!selectedAssetId || !events) return []
        return events
            .filter(event => event.assetId === selectedAssetId)
            .sort((a, b) => a.date.localeCompare(b.date))
    }, [events, selectedAssetId])

    // Determine if asset is PURCHASE or OPENING type
    const assetOriginType = useMemo(() => {
        if (!selectedAsset) return 'PURCHASE'
        if (selectedAsset.originType) return selectedAsset.originType
        // Backwards compatibility: infer from date
        const fiscalYearStart = new Date(periodYear, 0, 1)
        return new Date(selectedAsset.acquisitionDate) < fiscalYearStart ? 'OPENING' : 'PURCHASE'
    }, [selectedAsset, periodYear])

    const isPurchaseAsset = assetOriginType === 'PURCHASE'
    const isCurrentYearPurchase = useMemo(() => {
        if (!selectedAsset) return false
        const fiscalYearStart = new Date(periodYear, 0, 1)
        return isPurchaseAsset && new Date(selectedAsset.acquisitionDate) >= fiscalYearStart
    }, [selectedAsset, periodYear, isPurchaseAsset])

    const openingApplicable = useMemo(() => {
        if (!selectedAsset) return false
        // PURCHASE assets from current year don't need opening
        if (isCurrentYearPurchase) return false
        // OPENING assets or legacy assets from previous years need opening
        return true
    }, [selectedAsset, isCurrentYearPurchase])

    const openingStatus = useMemo(() => {
        if (!selectedAsset) return 'pending' as const
        if (!openingApplicable) return 'pending' as const
        if (openingEntry) return 'generated' as const
        if (selectedAsset.openingJournalEntryId && !openingEntry) return 'error' as const
        return 'pending' as const
    }, [openingApplicable, openingEntry, selectedAsset])

    // Acquisition entry (for PURCHASE assets)
    const acquisitionEntry = useLiveQuery(
        async () => {
            if (!selectedAsset?.acquisitionJournalEntryId) return null
            return db.entries.get(selectedAsset.acquisitionJournalEntryId)
        },
        [selectedAsset?.acquisitionJournalEntryId]
    )

    const acquisitionStatus = useMemo(() => {
        if (!selectedAsset) return 'pending' as const
        if (!isCurrentYearPurchase) return 'pending' as const
        if (acquisitionEntry) return 'generated' as const
        if (selectedAsset.acquisitionJournalEntryId && !acquisitionEntry) return 'error' as const
        return 'pending' as const
    }, [isCurrentYearPurchase, acquisitionEntry, selectedAsset])

    const rt6Status = useMemo(() => {
        if (!selectedAsset) return 'pending' as const
        if (rt6Entry) return 'generated' as const
        if (selectedAsset.rt6JournalEntryId && !rt6Entry) return 'error' as const
        return 'pending' as const
    }, [rt6Entry, selectedAsset])

    useEffect(() => {
        let mounted = true
        const loadOpeningPreview = async () => {
            if (!selectedAsset) {
                setOpeningPreview(null)
                setOpeningPreviewError(null)
                return
            }
            const { entry, error } = await buildFixedAssetOpeningEntry(selectedAsset, periodYear)
            if (!mounted) return
            setOpeningPreview(entry)
            setOpeningPreviewError(error || null)
        }
        loadOpeningPreview()
        return () => {
            mounted = false
        }
    }, [selectedAsset, periodYear])

    useEffect(() => {
        let mounted = true
        const loadRT6Preview = async () => {
            if (!selectedAsset) {
                setRT6Preview(null)
                setRT6PreviewError(null)
                setRT6Info(null)
                return
            }
            const calc = await calculateRT6Adjustment(selectedAsset, periodYear)
            if (mounted) {
                setRT6Info(calc)
            }
            const { entry, error } = await buildFixedAssetRT6Entry(selectedAsset, periodYear)
            if (!mounted) return
            setRT6Preview(entry)
            setRT6PreviewError(error || null)
        }
        loadRT6Preview()
        return () => {
            mounted = false
        }
    }, [selectedAsset, periodYear, indices.length])

    useEffect(() => {
        let mounted = true
        const loadEventPreview = async () => {
            if (!selectedAsset || !eventForm) {
                setEventPreview(null)
                setEventPreviewError(null)
                return
            }
            const now = new Date().toISOString()
            const previewEvent: FixedAssetEvent = {
                id: 'preview',
                periodId,
                assetId: selectedAsset.id,
                date: eventForm.date,
                type: eventForm.type,
                amount: eventForm.amount,
                contraAccountId: eventForm.contraAccountId || undefined,
                notes: eventForm.notes,
                linkedJournalEntryId: null,
                createdAt: now,
                updatedAt: now,
            }
            const { entry, error } = await buildFixedAssetEventJournalEntry(
                previewEvent,
                selectedAsset,
                periodYear
            )
            if (!mounted) return
            setEventPreview(entry)
            setEventPreviewError(error || null)
        }
        loadEventPreview()
        return () => {
            mounted = false
        }
    }, [eventForm, periodId, periodYear, selectedAsset])

    // Filtered assets
    const filteredAssets = useMemo(() => {
        if (!assets) return []
        return assets.filter(asset => {
            const matchesSearch =
                !searchQuery ||
                asset.name.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory =
                categoryFilter === 'all' || asset.category === categoryFilter
            return matchesSearch && matchesCategory
        })
    }, [assets, searchQuery, categoryFilter])

    // RT6 calculation helper
    const calculateRT6Value = (originalValue: number, originDate: string): number => {
        if (!rt6Enabled || indices.length === 0) return originalValue

        const originPeriod = originDate.slice(0, 7)
        const closingPeriod = `${periodYear}-12`

        const indexBase = indices.find((i: { period: string }) => i.period === originPeriod)?.value
        const indexClose = indices.find((i: { period: string }) => i.period === closingPeriod)?.value

        if (!indexBase || !indexClose) return originalValue

        return originalValue * (indexClose / indexBase)
    }

    // Toast helper
    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    // Handlers
    const handleSelectAsset = (asset: FixedAsset) => {
        setSelectedAssetId(asset.id)
        setViewMode('detail')
        setActiveTab('resumen')
    }

    const handleBackToList = () => {
        setViewMode('list')
        setSelectedAssetId(null)
    }

    const handleOpenCreateModal = () => {
        setEditingAsset(null)
        setIsModalOpen(true)
    }

    const handleOpenEditModal = (asset: FixedAsset) => {
        setEditingAsset(asset)
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setEditingAsset(null)
    }

    const handleDeleteAsset = async (asset: FixedAsset) => {
        if (!confirm(`¿Eliminar "${asset.name}"? Esta accion no se puede deshacer.`)) return

        const result = await deleteFixedAsset(asset.id)
        if (result.success) {
            showToast('Bien eliminado correctamente', 'success')
            handleBackToList()
        } else {
            showToast(result.error || 'Error al eliminar', 'error')
        }
    }

    const handleGenerateEntry = async () => {
        if (!selectedAsset) return

        const result = await generateAmortizationEntry(selectedAsset, periodYear)
        if (result.success) {
            showToast('Asiento generado correctamente', 'success')
        } else {
            showToast(result.error || 'Error al generar asiento', 'error')
        }
    }

    const handleSyncOpeningEntry = async () => {
        if (!selectedAsset) return
        const result = await syncFixedAssetOpeningEntry(selectedAsset, periodYear)
        if (result.success) {
            showToast('Asiento de apertura actualizado', 'success')
        } else {
            showToast(result.error || 'Error al generar asiento de apertura', 'error')
        }
    }

    const handleOpenEventModal = () => {
        if (!selectedAsset) return
        setEventError(null)
        setEventForm({
            type: 'IMPROVEMENT',
            date: new Date().toISOString().split('T')[0],
            amount: 0,
            contraAccountId: '',
            notes: '',
        })
        setIsEventModalOpen(true)
    }

    const handleCloseEventModal = () => {
        setIsEventModalOpen(false)
        setEventError(null)
        setEventForm(null)
        setEventPreview(null)
        setEventPreviewError(null)
    }

    const handleSaveEvent = async () => {
        if (!selectedAsset || !eventForm) return

        if (!eventForm.date) {
            setEventError('La fecha del evento es obligatoria.')
            return
        }
        if (eventForm.type !== 'DISPOSAL' && eventForm.amount <= 0) {
            setEventError('El importe debe ser mayor a 0.')
            return
        }
        if (!eventForm.contraAccountId && eventForm.type !== 'DAMAGE' && eventForm.type !== 'REVALUATION') {
            setEventError('Seleccioná la cuenta contrapartida.')
            return
        }

        try {
            const created = await createFixedAssetEvent({
                periodId,
                assetId: selectedAsset.id,
                date: eventForm.date,
                type: eventForm.type,
                amount: eventForm.amount,
                contraAccountId: eventForm.contraAccountId || undefined,
                notes: eventForm.notes,
                linkedJournalEntryId: null,
            })

            const entryResult = await syncFixedAssetEventJournalEntry(
                created,
                selectedAsset,
                periodYear
            )

            if (!entryResult.success) {
                showToast(entryResult.error || 'Evento guardado, asiento pendiente', 'error')
            } else {
                showToast('Evento registrado correctamente', 'success')
            }

            if (created.type === 'DISPOSAL') {
                await updateFixedAsset(selectedAsset.id, {
                    status: 'sold',
                    disposalDate: created.date,
                    disposalValue: created.amount,
                })
            }

            handleCloseEventModal()
        } catch (err) {
            setEventError(err instanceof Error ? err.message : 'Error al guardar el evento')
        }
    }

    const handleGenerateRT6Entry = async () => {
        if (!selectedAsset) return
        const result = await syncFixedAssetRT6Entry(selectedAsset, periodYear)
        if (result.success) {
            showToast('Ajuste RT6 generado correctamente', 'success')
        } else {
            showToast(result.error || 'Error al generar ajuste RT6', 'error')
        }
    }

    // Format helpers
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value)
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—'
        return new Date(dateStr).toLocaleDateString('es-AR')
    }

    const renderEntryPreview = (entry: Omit<JournalEntry, 'id'>) => {
        const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
        const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)

        return (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                        <tr>
                            <th className="px-4 py-2 text-left font-medium">Cuenta</th>
                            <th className="px-4 py-2 text-right font-medium">Debe</th>
                            <th className="px-4 py-2 text-right font-medium">Haber</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entry.lines.map((line, idx) => {
                            const accountInfo = accountMap.get(line.accountId)
                            const label = accountInfo
                                ? `${accountInfo.code} — ${accountInfo.name}`
                                : line.accountId
                            return (
                                <tr key={`${line.accountId}-${idx}`} className="border-t border-slate-100">
                                    <td className="px-4 py-2 text-slate-700">{label}</td>
                                    <td className="px-4 py-2 text-right font-mono">
                                        {line.debit ? formatCurrency(line.debit) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono">
                                        {line.credit ? formatCurrency(line.credit) : '—'}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot className="bg-slate-50 font-medium">
                        <tr>
                            <td className="px-4 py-2 text-right">Totales</td>
                            <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalDebit)}</td>
                            <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalCredit)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        )
    }

    const resolveEventEntry = (event: FixedAssetEvent) => {
        if (event.linkedJournalEntryId) {
            return eventEntryMap.get(event.linkedJournalEntryId) || null
        }
        return (
            eventEntries?.find(
                entry => entry.metadata?.meta?.eventId === event.id
            ) || null
        )
    }

    const getEventStatus = (event: FixedAssetEvent) => {
        const entry = resolveEventEntry(event)
        if (entry) return 'generated' as const
        if (event.linkedJournalEntryId && !entry) return 'error' as const
        return 'pending' as const
    }

    // Render asset card
    const renderAssetCard = (asset: FixedAsset) => {
        const calc = calculateFixedAssetDepreciationWithEvents(
            asset,
            periodYear,
            eventsByAsset.get(asset.id) || []
        )
        const Icon = CATEGORY_ICONS[asset.category] || Package
        const statusStyle = STATUS_STYLES[asset.status]

        const displayCost = rt6Enabled
            ? calculateRT6Value(calc.valorOrigenAjustado, asset.acquisitionDate)
            : calc.valorOrigenAjustado
        const displayNBV = rt6Enabled
            ? calculateRT6Value(calc.valorLibro, asset.acquisitionDate)
            : calc.valorLibro

        return (
            <div
                key={asset.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group"
                onClick={() => handleSelectAsset(asset)}
            >
                <div className="flex justify-between items-start mb-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Icon weight="duotone" size={24} />
                    </div>
                    <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${statusStyle}`}
                    >
                        {STATUS_LABELS[asset.status]}
                    </span>
                </div>

                <h3 className="font-semibold text-slate-900 mb-1 truncate">{asset.name}</h3>
                <p className="text-xs text-slate-500 mb-3">{asset.category}</p>

                {/* Progress bar */}
                <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Desgaste</span>
                        <span>{calc.porcentajeDesgaste.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                            style={{ width: `${Math.min(calc.porcentajeDesgaste, 100)}%` }}
                        />
                    </div>
                </div>

                <div className="flex justify-between items-end pt-3 border-t border-slate-100">
                    <div>
                        <div className="text-xs text-slate-500">Valor Libro</div>
                        <div className="font-mono font-semibold text-slate-900">
                            {formatCurrency(displayNBV)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500">Costo</div>
                        <div className="font-mono text-sm text-slate-600">
                            {formatCurrency(displayCost)}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Render detail view
    const renderDetailView = () => {
        if (!selectedAsset) return null

        const calc = calculateFixedAssetDepreciationWithEvents(
            selectedAsset,
            periodYear,
            eventsByAsset.get(selectedAsset.id) || []
        )
        const schedule = generateDepreciationSchedule(selectedAsset, periodYear)
        const Icon = CATEGORY_ICONS[selectedAsset.category] || Package

        const displayCost = rt6Enabled
            ? calculateRT6Value(calc.valorOrigenAjustado, selectedAsset.acquisitionDate)
            : calc.valorOrigenAjustado
        const displayAccum = rt6Enabled
            ? calculateRT6Value(calc.acumuladaCierre, selectedAsset.acquisitionDate)
            : calc.acumuladaCierre
        const displayNBV = rt6Enabled
            ? calculateRT6Value(calc.valorLibro, selectedAsset.acquisitionDate)
            : calc.valorLibro

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Icon weight="duotone" size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="font-display font-bold text-xl text-slate-900">
                                    {selectedAsset.name}
                                </h2>
                                <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${STATUS_STYLES[selectedAsset.status]}`}
                                >
                                    {STATUS_LABELS[selectedAsset.status]}
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                                    {METHOD_LABELS[selectedAsset.method]}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                {selectedAsset.category} · Alta: {formatDate(selectedAsset.acquisitionDate)}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleOpenEditModal(selectedAsset)}
                            className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                        >
                            <PencilSimple size={16} /> Editar
                        </button>
                        <button
                            onClick={() => handleDeleteAsset(selectedAsset)}
                            className="px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-2"
                        >
                            <Trash size={16} /> Eliminar
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                    {(['resumen', 'planilla', 'asiento', 'eventos'] as TabId[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                activeTab === tab
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {tab === 'resumen' && 'Resumen'}
                            {tab === 'planilla' && 'Planilla'}
                            {tab === 'asiento' && 'Asiento Anual'}
                            {tab === 'eventos' && 'Eventos'}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'resumen' && (
                    <div className="space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="text-xs text-slate-500 mb-1">Valor Origen</div>
                                <div className="font-mono font-semibold text-lg text-slate-900">
                                    {formatCurrency(displayCost)}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="text-xs text-slate-500 mb-1">Amort. Acumulada</div>
                                <div className="font-mono font-semibold text-lg text-red-600">
                                    {formatCurrency(displayAccum)}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="text-xs text-slate-500 mb-1">Valor Residual</div>
                                <div className="font-mono font-semibold text-lg text-slate-600">
                                    {formatCurrency(calc.valorResidual)}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="text-xs text-slate-500 mb-1">Valor Libro (NBV)</div>
                                <div className="font-mono font-semibold text-lg text-emerald-600">
                                    {formatCurrency(displayNBV)}
                                </div>
                            </div>
                        </div>

                        {/* Progress */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6">
                            <h3 className="font-semibold text-slate-900 mb-4">Progreso de Amortizacion</h3>
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-slate-600 mb-2">
                                    <span>Desgaste acumulado</span>
                                    <span className="font-mono">{calc.porcentajeDesgaste.toFixed(1)}%</span>
                                </div>
                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(calc.porcentajeDesgaste, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <div className="text-xs text-slate-500">Vida util</div>
                                    <div className="font-semibold text-slate-900">
                                        {selectedAsset.lifeYears} años
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Amort. Anual</div>
                                    <div className="font-mono font-semibold text-slate-900">
                                        {formatCurrency(calc.amortizacionAnual)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Amort. Ejercicio</div>
                                    <div className="font-mono font-semibold text-blue-600">
                                        {formatCurrency(calc.amortizacionEjercicio)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'planilla' && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="font-semibold text-slate-900">Planilla de Amortizaciones</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium">Año</th>
                                        <th className="px-4 py-3 text-right font-medium">Base Amortizable</th>
                                        <th className="px-4 py-3 text-right font-medium">Cuota Anual</th>
                                        <th className="px-4 py-3 text-right font-medium">Total Acumulado</th>
                                        <th className="px-4 py-3 text-right font-medium">Valor Residual</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {schedule.map(row => (
                                        <tr
                                            key={row.year}
                                            className={row.isCurrent ? 'bg-blue-50' : ''}
                                        >
                                            <td className="px-4 py-3 font-medium">
                                                {row.year}
                                                {row.isCurrent && (
                                                    <span className="ml-2 text-xs text-blue-600">(Actual)</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(row.baseAmortizable)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(row.cuotaAnual)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(row.acumulado)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(row.valorResidual)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'asiento' && (
                    <div className="space-y-6">
                        {/* Acquisition Entry (for PURCHASE assets from current year) */}
                        {isCurrentYearPurchase && (
                            <div className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-blue-900">Asiento de Adquisicion</h3>
                                        <p className="text-sm text-blue-600">
                                            Registra la compra del bien en el ejercicio {periodYear}.
                                        </p>
                                    </div>
                                    <span
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${ENTRY_STATUS_STYLES[acquisitionStatus]}`}
                                    >
                                        Compra: {ENTRY_STATUS_LABELS[acquisitionStatus]}
                                    </span>
                                </div>

                                {acquisitionEntry ? (
                                    renderEntryPreview(acquisitionEntry)
                                ) : selectedAsset?.acquisition ? (
                                    <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
                                        <div className="font-medium mb-1">Datos de compra registrados:</div>
                                        <div className="text-xs space-y-0.5">
                                            <div>Neto: ${selectedAsset.acquisition.netAmount.toFixed(2)}</div>
                                            {selectedAsset.acquisition.withVat && (
                                                <div>IVA ({selectedAsset.acquisition.vatRate}%): ${selectedAsset.acquisition.vatAmount.toFixed(2)}</div>
                                            )}
                                            <div>Total: ${selectedAsset.acquisition.totalAmount.toFixed(2)}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500">
                                        No hay datos de adquisicion. Edite el bien para agregarlos.
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <button
                                        onClick={async () => {
                                            if (!selectedAsset) return
                                            const result = await syncFixedAssetAcquisitionEntry(selectedAsset)
                                            if (result.success) {
                                                showToast('Asiento de adquisicion generado', 'success')
                                            } else {
                                                showToast(result.error || 'Error al generar asiento', 'error')
                                            }
                                        }}
                                        disabled={!selectedAsset?.acquisition}
                                        className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Regenerar Asiento Compra
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Opening Entry (for OPENING assets or legacy assets) */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900">Asiento de Apertura</h3>
                                    <p className="text-sm text-slate-500">
                                        {openingApplicable
                                            ? 'Registra el saldo inicial del bien al inicio del ejercicio.'
                                            : isCurrentYearPurchase
                                                ? 'Este bien es una compra del ejercicio; ver asiento de adquisicion arriba.'
                                                : 'Este bien no requiere asiento de apertura.'}
                                    </p>
                                </div>
                                <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${ENTRY_STATUS_STYLES[openingStatus]}`}
                                >
                                    Apertura: {ENTRY_STATUS_LABELS[openingStatus]}
                                </span>
                            </div>

                            {openingApplicable ? (
                                openingPreview ? (
                                    renderEntryPreview(openingPreview)
                                ) : (
                                    <div className="text-sm text-slate-500">
                                        {openingPreviewError || 'No hay datos para mostrar el asiento.'}
                                    </div>
                                )
                            ) : (
                                <div className="text-sm text-slate-400 italic">
                                    {isCurrentYearPurchase
                                        ? 'Ver asiento de adquisicion.'
                                        : 'No aplica.'}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button
                                    onClick={handleSyncOpeningEntry}
                                    disabled={!openingApplicable}
                                    title={
                                        openingApplicable
                                            ? 'Regenerar asiento de apertura'
                                            : 'Solo aplica a bienes anteriores al ejercicio.'
                                    }
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Regenerar Asiento Apertura
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900">Ajuste RT6 (RECPAM)</h3>
                                    <p className="text-sm text-slate-500">
                                        Reexpresión a moneda de cierre con índices FACPCE.
                                    </p>
                                </div>
                                <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${ENTRY_STATUS_STYLES[rt6Status]}`}
                                >
                                    RT6: {ENTRY_STATUS_LABELS[rt6Status]}
                                </span>
                            </div>

                            {rt6Preview ? (
                                renderEntryPreview(rt6Preview)
                            ) : (
                                <div className="text-sm text-slate-500">
                                    {rt6PreviewError || 'No hay ajuste disponible.'}
                                </div>
                            )}

                            {'error' in (rt6Info || {}) && (
                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                    {(rt6Info as { error: string }).error}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button
                                    onClick={handleGenerateRT6Entry}
                                    disabled={!rt6Preview || 'error' in (rt6Info || {})}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <CurrencyCircleDollar size={18} /> Generar Ajuste RT6
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="font-semibold text-slate-900">
                                    Preview Asiento - 31/12/{periodYear}
                                </h3>
                                {selectedAsset.linkedJournalEntryIds.length > 0 && (
                                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                                        <CheckCircle weight="fill" size={12} /> Asiento generado
                                    </span>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                                            <th className="px-4 py-3 text-left font-medium">Tipo</th>
                                            <th className="px-4 py-3 text-right font-medium">Debe</th>
                                            <th className="px-4 py-3 text-right font-medium">Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        <tr>
                                            <td className="px-4 py-3">Amortizaciones Bienes de Uso</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                Resultado Negativo
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(calc.amortizacionEjercicio)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-400">
                                                —
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3">Amort. Acum. {selectedAsset.name}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                Regularizadora de Activo
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-400">
                                                —
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(calc.amortizacionEjercicio)}
                                            </td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-medium">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3">
                                                Total
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(calc.amortizacionEjercicio)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {formatCurrency(calc.amortizacionEjercicio)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={handleGenerateEntry}
                                disabled={
                                    calc.amortizacionEjercicio <= 0 ||
                                    selectedAsset.linkedJournalEntryIds.length > 0
                                }
                                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Receipt size={20} />
                                {selectedAsset.linkedJournalEntryIds.length > 0
                                    ? 'Asiento ya generado'
                                    : 'Generar Asiento'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'eventos' && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-slate-900">Eventos del Bien</h3>
                                <p className="text-sm text-slate-500">
                                    Mejoras, revalúos o bajas anticipadas con su impacto contable.
                                </p>
                            </div>
                            <button
                                onClick={handleOpenEventModal}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2"
                            >
                                <CalendarPlus size={18} /> Nuevo Evento
                            </button>
                        </div>

                        {selectedEvents.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                                <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                                <h3 className="font-semibold text-slate-900 mb-2">Sin eventos</h3>
                                <p className="text-sm text-slate-500">
                                    Registrá mejoras, revalúos o bajas para mantener el historial.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">Fecha</th>
                                            <th className="px-4 py-3 text-left font-medium">Tipo</th>
                                            <th className="px-4 py-3 text-left font-medium">Nota</th>
                                            <th className="px-4 py-3 text-right font-medium">Importe</th>
                                            <th className="px-4 py-3 text-right font-medium">Asiento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedEvents.map(event => {
                                            const status = getEventStatus(event)
                                            return (
                                                <tr key={event.id}>
                                                    <td className="px-4 py-3 text-slate-700">
                                                        {formatDate(event.date)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-xs font-semibold uppercase text-slate-600">
                                                            {EVENT_TYPE_LABELS[event.type]}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">
                                                        {event.notes || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono">
                                                        {event.amount ? formatCurrency(event.amount) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${ENTRY_STATUS_STYLES[status]}`}
                                                        >
                                                            {ENTRY_STATUS_LABELS[status]}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
                        toast.type === 'success'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-red-500 text-white'
                    }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle weight="fill" size={20} />
                    ) : (
                        <Warning weight="fill" size={20} />
                    )}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={viewMode === 'detail' ? handleBackToList : () => navigate('/operaciones')}
                        className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="font-display font-bold text-2xl text-slate-900">
                            {viewMode === 'detail' && selectedAsset
                                ? selectedAsset.name
                                : 'Bienes de Uso'}
                        </h1>
                        <p className="text-sm text-slate-500">
                            {viewMode === 'detail'
                                ? 'Detalle del bien'
                                : 'Activos fijos, amortizaciones y ajuste por inflacion'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* RT6 Toggle */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-xs font-medium text-slate-600">Moneda Homogenea (RT6)</span>
                        <button
                            onClick={() => setRt6Enabled(!rt6Enabled)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                                rt6Enabled ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                    rt6Enabled ? 'translate-x-5' : ''
                                }`}
                            />
                        </button>
                    </div>

                    {viewMode === 'list' && (
                        <button
                            onClick={handleOpenCreateModal}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-lg font-semibold shadow-md flex items-center gap-2"
                        >
                            <Plus size={18} /> Nuevo Bien
                        </button>
                    )}
                </div>
            </div>

            {/* RT6 Warning */}
            {rt6Enabled && indices.length === 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                    <Warning className="text-amber-500 flex-shrink-0" size={18} />
                    <span className="text-sm text-amber-700">
                        No hay indices RT6 cargados. Los valores se muestran sin ajustar. Cargalos en Planillas → Cierre: AxI + Valuacion.
                    </span>
                </div>
            )}

            {/* Content */}
            {viewMode === 'list' ? (
                <>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="relative flex-1">
                            <MagnifyingGlass
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                size={18}
                            />
                            <input
                                type="text"
                                placeholder="Buscar bienes..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                            className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="all">Todas las categorias</option>
                            {FIXED_ASSET_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Assets Grid */}
                    {!assets ? (
                        <div className="text-center py-12">
                            <div className="animate-pulse text-slate-400">Cargando...</div>
                        </div>
                    ) : filteredAssets.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                            <Armchair size={64} className="mx-auto text-slate-300 mb-4" />
                            <h3 className="font-display font-semibold text-lg text-slate-900 mb-2">
                                {searchQuery || categoryFilter !== 'all'
                                    ? 'Sin resultados'
                                    : 'No hay bienes de uso'}
                            </h3>
                            <p className="text-sm text-slate-500 mb-6">
                                {searchQuery || categoryFilter !== 'all'
                                    ? 'Intenta con otros filtros'
                                    : 'Agrega tu primer activo fijo para comenzar'}
                            </p>
                            {!searchQuery && categoryFilter === 'all' && (
                                <button
                                    onClick={handleOpenCreateModal}
                                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-xl font-semibold shadow-lg"
                                >
                                    Crear primer bien
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredAssets.map(renderAssetCard)}
                        </div>
                    )}
                </>
            ) : (
                renderDetailView()
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <AssetModal
                    asset={editingAsset}
                    periodId={periodId}
                    onClose={handleCloseModal}
                    onSuccess={() => {
                        handleCloseModal()
                        showToast(
                            editingAsset ? 'Bien actualizado correctamente' : 'Bien creado correctamente',
                            'success'
                        )
                    }}
                    onError={error => showToast(error, 'error')}
                />
            )}

            {isEventModalOpen && selectedAsset && eventForm && accounts && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center">
                            <div>
                                <h2 className="font-display font-bold text-lg text-slate-900">
                                    Registrar Evento
                                </h2>
                                <p className="text-xs text-slate-500">
                                    {selectedAsset.name} · {EVENT_TYPE_LABELS[eventForm.type]}
                                </p>
                            </div>
                            <button
                                onClick={handleCloseEventModal}
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {eventError && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
                                    {eventError}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                        Tipo de Evento
                                    </label>
                                    <select
                                        value={eventForm.type}
                                        onChange={e =>
                                            setEventForm({
                                                ...eventForm,
                                                type: e.target.value as FixedAssetEventType,
                                            })
                                        }
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="IMPROVEMENT">Mejora (Aumenta costo)</option>
                                        <option value="REVALUATION">Revalúo técnico</option>
                                        <option value="DISPOSAL">Baja / Venta</option>
                                        <option value="DAMAGE">Deterioro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                        Fecha
                                    </label>
                                    <input
                                        type="date"
                                        value={eventForm.date}
                                        onChange={e =>
                                            setEventForm({ ...eventForm, date: e.target.value })
                                        }
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    {eventForm.type === 'DISPOSAL'
                                        ? 'Precio de Venta'
                                        : eventForm.type === 'REVALUATION'
                                            ? 'Ajuste / Nuevo Valor'
                                            : 'Importe'}
                                </label>
                                <input
                                    type="number"
                                    value={eventForm.amount || ''}
                                    onChange={e =>
                                        setEventForm({
                                            ...eventForm,
                                            amount: parseFloat(e.target.value) || 0,
                                        })
                                    }
                                    min="0"
                                    step="0.01"
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    Cuenta contrapartida
                                </label>
                                <AccountSearchSelect
                                    accounts={accounts}
                                    value={eventForm.contraAccountId}
                                    onChange={accountId =>
                                        setEventForm({ ...eventForm, contraAccountId: accountId })
                                    }
                                    placeholder="Buscar cuenta..."
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    Caja, bancos, proveedores o reserva según el evento.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    Notas
                                </label>
                                <input
                                    type="text"
                                    value={eventForm.notes}
                                    onChange={e =>
                                        setEventForm({ ...eventForm, notes: e.target.value })
                                    }
                                    placeholder="Motivo o referencia..."
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                                <h4 className="text-sm font-semibold text-slate-700">Vista previa contable</h4>
                                {eventPreview ? (
                                    renderEntryPreview(eventPreview)
                                ) : (
                                    <p className="text-xs text-slate-500">
                                        {eventPreviewError || 'Completá los datos para ver el asiento.'}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCloseEventModal}
                                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEvent}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-lg font-semibold shadow-md"
                                >
                                    Registrar Evento
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ========================================
// Asset Modal Component
// ========================================

const VAT_RATES = [21, 10.5, 27, 0] as const
const DOC_TYPES = ['FC A', 'FC B', 'FC C', 'FC E', 'Ticket', 'Otro'] as const

interface AssetModalProps {
    asset: FixedAsset | null
    periodId: string
    onClose: () => void
    onSuccess: () => void
    onError: (error: string) => void
}

function AssetModal({ asset, periodId, onClose, onSuccess, onError }: AssetModalProps) {
    const isEditing = !!asset
    const [loading, setLoading] = useState(false)
    const [autoCreateAccounts, setAutoCreateAccounts] = useState(true)

    // Load accounts for AccountSearchSelect
    const modalAccounts = useLiveQuery(() => db.accounts.toArray(), []) || []
    const fiscalYear = Number(periodId)

    // Form state - basic info
    const [formData, setFormData] = useState({
        name: asset?.name || '',
        category: asset?.category || ('Muebles y Utiles' as FixedAssetCategory),
        acquisitionDate: asset?.acquisitionDate || new Date().toISOString().split('T')[0],
        status: asset?.status || ('active' as FixedAssetStatus),
        originalValue: asset?.originalValue || 0,
        residualValuePct: asset?.residualValuePct || 0,
        method: asset?.method || ('lineal-year' as FixedAssetMethod),
        lifeYears: asset?.lifeYears || 5,
        lifeMonths: asset?.lifeMonths || 60,
        lifeUnits: asset?.lifeUnits || 0,
        rt6Enabled: asset?.rt6Enabled || false,
        notes: asset?.notes || '',
    })

    // Origin type (only for new assets)
    const [originType, setOriginType] = useState<FixedAssetOriginType>(
        asset?.originType || 'PURCHASE'
    )

    // Acquisition data (for PURCHASE origin)
    const [acquisition, setAcquisition] = useState<AcquisitionData>(
        asset?.acquisition || createDefaultAcquisition()
    )

    // Opening data (for OPENING origin)
    const [opening, setOpening] = useState<OpeningData>(
        asset?.opening || createDefaultOpening()
    )

    // Update lifeMonths when lifeYears changes
    useEffect(() => {
        if (formData.method === 'lineal-year') {
            setFormData(prev => ({ ...prev, lifeMonths: prev.lifeYears * 12 }))
        }
    }, [formData.lifeYears, formData.method])

    // Update acquisition amounts when values change
    useEffect(() => {
        if (originType === 'PURCHASE') {
            const net = formData.originalValue
            const vatAmount = acquisition.withVat
                ? Math.round((net * acquisition.vatRate / 100) * 100) / 100
                : 0
            const total = net + vatAmount
            setAcquisition(prev => ({
                ...prev,
                netAmount: net,
                vatAmount,
                totalAmount: total,
            }))
        }
    }, [formData.originalValue, acquisition.vatRate, acquisition.withVat, originType])

    // Handle adding a payment split
    const handleAddSplit = () => {
        setAcquisition(prev => ({
            ...prev,
            splits: [...prev.splits, { accountId: '', amount: 0 }],
        }))
    }

    // Handle removing a split
    const handleRemoveSplit = (index: number) => {
        setAcquisition(prev => ({
            ...prev,
            splits: prev.splits.filter((_, i) => i !== index),
        }))
    }

    // Handle updating a split
    const handleUpdateSplit = (index: number, field: keyof PaymentSplit, value: string | number) => {
        setAcquisition(prev => ({
            ...prev,
            splits: prev.splits.map((s, i) =>
                i === index ? { ...s, [field]: value } : s
            ),
        }))
    }

    // Auto-distribute remaining amount to first split
    const handleDistributeRemaining = () => {
        const total = acquisition.totalAmount
        const currentSum = acquisition.splits.reduce((sum, s) => sum + s.amount, 0)
        const remaining = Math.round((total - currentSum) * 100) / 100
        if (remaining > 0 && acquisition.splits.length > 0) {
            handleUpdateSplit(0, 'amount', acquisition.splits[0].amount + remaining)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validation
        if (!formData.name.trim()) {
            onError('El nombre es obligatorio')
            return
        }
        if (formData.originalValue <= 0) {
            onError('El valor de origen debe ser mayor a 0')
            return
        }
        if (formData.method !== 'none' && formData.method !== 'units' && formData.lifeYears <= 0) {
            onError('La vida util debe ser mayor a 0')
            return
        }

        // Validate acquisition data for PURCHASE
        if (!isEditing && originType === 'PURCHASE') {
            if (acquisition.splits.length === 0) {
                onError('Debe agregar al menos una contrapartida de pago')
                return
            }
            const splitsTotal = acquisition.splits.reduce((sum, s) => sum + s.amount, 0)
            if (Math.abs(splitsTotal - acquisition.totalAmount) > 0.01) {
                onError(`Las contrapartidas (${splitsTotal.toFixed(2)}) no suman el total (${acquisition.totalAmount.toFixed(2)})`)
                return
            }
            for (const split of acquisition.splits) {
                if (!split.accountId) {
                    onError('Todas las contrapartidas deben tener una cuenta seleccionada')
                    return
                }
            }
        }

        // Validate opening data for OPENING
        if (!isEditing && originType === 'OPENING') {
            if (!opening.contraAccountId) {
                onError('Debe seleccionar una cuenta de contrapartida para la apertura')
                return
            }
        }

        setLoading(true)

        try {
            let savedAsset: FixedAsset | null = null
            const assetType = getAssetTypeFromCategory(formData.category)

            if (isEditing && asset) {
                // Update existing
                savedAsset = await updateFixedAsset(asset.id, {
                    ...formData,
                    assetType,
                    lifeMonths: formData.method === 'lineal-month'
                        ? formData.lifeMonths
                        : formData.lifeYears * 12,
                })
            } else {
                // Create new
                let accountId = ''
                let contraAccountId = ''

                if (autoCreateAccounts) {
                    // Validate parent accounts exist
                    const validation = await validateCategoryParentsExist(formData.category)
                    if (!validation.valid) {
                        const missing = [validation.missingAsset, validation.missingContra]
                            .filter(Boolean)
                            .join(', ')
                        onError(`Faltan cuentas padre en el Plan de Cuentas: ${missing}`)
                        setLoading(false)
                        return
                    }

                    // Create accounts
                    const accounts = await ensureAssetAccounts(formData.category, formData.name)
                    accountId = accounts.assetAccountId
                    contraAccountId = accounts.contraAccountId
                } else {
                    onError('La seleccion manual de cuentas no esta implementada. Use auto-crear.')
                    setLoading(false)
                    return
                }

                savedAsset = await createFixedAsset({
                    ...formData,
                    periodId,
                    accountId,
                    contraAccountId,
                    assetType,
                    originType,
                    lifeMonths: formData.method === 'lineal-month'
                        ? formData.lifeMonths
                        : formData.lifeYears * 12,
                    acquisition: originType === 'PURCHASE' ? {
                        ...acquisition,
                        date: formData.acquisitionDate,
                    } : undefined,
                    opening: originType === 'OPENING' ? opening : undefined,
                })
            }

            // Generate appropriate journal entry
            if (savedAsset && Number.isFinite(fiscalYear)) {
                if (originType === 'PURCHASE' && !isEditing) {
                    // Generate acquisition entry
                    const acqResult = await syncFixedAssetAcquisitionEntry(savedAsset)
                    if (!acqResult.success && acqResult.status !== 'skipped') {
                        onError(acqResult.error || 'No se pudo generar el asiento de adquisicion')
                    }
                } else {
                    // Generate opening entry (for OPENING origin or editing)
                    const openingResult = await syncFixedAssetOpeningEntry(savedAsset, fiscalYear)
                    if (!openingResult.success && openingResult.status !== 'skipped') {
                        // Not critical - just log
                        console.warn('Opening entry:', openingResult.error)
                    }
                }
            }

            onSuccess()
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setLoading(false)
        }
    }

    // Calculate splits total for display
    const splitsTotal = acquisition.splits.reduce((sum, s) => sum + s.amount, 0)
    const splitsRemaining = Math.round((acquisition.totalAmount - splitsTotal) * 100) / 100

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center z-10">
                    <h2 className="font-display font-bold text-lg text-slate-900">
                        {isEditing ? 'Editar Bien' : 'Nuevo Bien de Uso / Intangible'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Origin Type Selector (only for new assets) */}
                    {!isEditing && (
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <label className="block text-xs font-semibold text-slate-500 mb-2">
                                Origen del Alta
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOriginType('PURCHASE')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        originType === 'PURCHASE'
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="font-semibold text-sm text-slate-800">
                                        Compra en el ejercicio
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        Nuevo bien adquirido en {fiscalYear}
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOriginType('OPENING')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        originType === 'OPENING'
                                            ? 'border-emerald-500 bg-emerald-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="font-semibold text-sm text-slate-800">
                                        Viene del ejercicio anterior
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        Bien ya en uso (saldos iniciales)
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            Nombre del Bien *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ej: Toyota Hilux 2024"
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Category & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                Categoria
                            </label>
                            <select
                                value={formData.category}
                                onChange={e =>
                                    setFormData({
                                        ...formData,
                                        category: e.target.value as FixedAssetCategory,
                                    })
                                }
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            >
                                <optgroup label="Bienes de Uso (Tangibles)">
                                    {TANGIBLE_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Bienes Intangibles">
                                    {INTANGIBLE_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                Estado
                            </label>
                            <select
                                value={formData.status}
                                onChange={e =>
                                    setFormData({
                                        ...formData,
                                        status: e.target.value as FixedAssetStatus,
                                    })
                                }
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="active">En Uso</option>
                                <option value="in_progress">En Proyecto</option>
                            </select>
                        </div>
                    </div>

                    {/* Date & Value */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                Fecha de Alta / Origen
                            </label>
                            <input
                                type="date"
                                value={formData.acquisitionDate}
                                onChange={e =>
                                    setFormData({ ...formData, acquisitionDate: e.target.value })
                                }
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                {originType === 'PURCHASE' && acquisition.withVat
                                    ? 'Valor Neto (sin IVA) *'
                                    : 'Valor de Origen *'}
                            </label>
                            <input
                                type="number"
                                value={formData.originalValue || ''}
                                onChange={e =>
                                    setFormData({
                                        ...formData,
                                        originalValue: parseFloat(e.target.value) || 0,
                                    })
                                }
                                placeholder="0"
                                min="0"
                                step="0.01"
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* PURCHASE: IVA and Document fields */}
                    {!isEditing && originType === 'PURCHASE' && (
                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-blue-800">Datos de la Compra</span>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={acquisition.withVat}
                                        onChange={e => setAcquisition({
                                            ...acquisition,
                                            withVat: e.target.checked,
                                        })}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <span className="text-blue-700">Discrimina IVA</span>
                                </label>
                            </div>

                            {acquisition.withVat && (
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                            Alicuota IVA
                                        </label>
                                        <select
                                            value={acquisition.vatRate}
                                            onChange={e => setAcquisition({
                                                ...acquisition,
                                                vatRate: parseFloat(e.target.value),
                                            })}
                                            className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm"
                                        >
                                            {VAT_RATES.map(rate => (
                                                <option key={rate} value={rate}>{rate}%</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                            IVA
                                        </label>
                                        <div className="px-3 py-2 bg-blue-100 border border-blue-200 rounded-lg text-sm font-mono">
                                            ${acquisition.vatAmount.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-blue-700 mb-1">
                                            Total
                                        </label>
                                        <div className="px-3 py-2 bg-blue-100 border border-blue-200 rounded-lg text-sm font-mono font-semibold">
                                            ${acquisition.totalAmount.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-blue-700 mb-1">
                                        Tipo Comprobante
                                    </label>
                                    <select
                                        value={acquisition.docType}
                                        onChange={e => setAcquisition({
                                            ...acquisition,
                                            docType: e.target.value,
                                        })}
                                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm"
                                    >
                                        {DOC_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-blue-700 mb-1">
                                        Numero
                                    </label>
                                    <input
                                        type="text"
                                        value={acquisition.docNumber}
                                        onChange={e => setAcquisition({
                                            ...acquisition,
                                            docNumber: e.target.value,
                                        })}
                                        placeholder="0001-00000001"
                                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm"
                                    />
                                </div>
                            </div>

                            {/* Payment Splits */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-blue-700">
                                        Contrapartidas de Pago
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddSplit}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        + Agregar
                                    </button>
                                </div>

                                {acquisition.splits.length === 0 ? (
                                    <div className="text-xs text-blue-600 bg-blue-100 rounded-lg p-3 text-center">
                                        Agrega al menos una cuenta de pago (ej: Bancos, Proveedores)
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {acquisition.splits.map((split, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="flex-1">
                                                    <AccountSearchSelect
                                                        accounts={modalAccounts}
                                                        value={split.accountId}
                                                        onChange={id => handleUpdateSplit(idx, 'accountId', id)}
                                                        placeholder="Buscar cuenta..."
                                                    />
                                                </div>
                                                <input
                                                    type="number"
                                                    value={split.amount || ''}
                                                    onChange={e => handleUpdateSplit(idx, 'amount', parseFloat(e.target.value) || 0)}
                                                    placeholder="Monto"
                                                    className="w-28 px-2 py-1.5 bg-white border border-blue-200 rounded text-sm"
                                                    step="0.01"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSplit(idx)}
                                                    className="p-1 text-red-400 hover:text-red-600"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Splits summary */}
                                        <div className="flex justify-between text-xs pt-2 border-t border-blue-200">
                                            <span className="text-blue-700">
                                                Total contrapartidas: <span className="font-mono">${splitsTotal.toFixed(2)}</span>
                                            </span>
                                            {Math.abs(splitsRemaining) > 0.01 && (
                                                <button
                                                    type="button"
                                                    onClick={handleDistributeRemaining}
                                                    className={`font-medium ${splitsRemaining > 0 ? 'text-amber-600' : 'text-red-600'}`}
                                                >
                                                    {splitsRemaining > 0
                                                        ? `Faltan $${splitsRemaining.toFixed(2)} - Completar`
                                                        : `Exceso $${Math.abs(splitsRemaining).toFixed(2)}`
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* OPENING: Initial accumulated depreciation */}
                    {!isEditing && originType === 'OPENING' && (
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 space-y-4">
                            <span className="text-sm font-semibold text-emerald-800">Datos de Apertura</span>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-emerald-700 mb-1">
                                        Amort. Acum. Inicial
                                    </label>
                                    <input
                                        type="number"
                                        value={opening.initialAccumDep || ''}
                                        onChange={e => setOpening({
                                            ...opening,
                                            initialAccumDep: parseFloat(e.target.value) || 0,
                                        })}
                                        placeholder="0"
                                        min="0"
                                        step="0.01"
                                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm"
                                    />
                                    <p className="text-xs text-emerald-600 mt-1">
                                        Amortizacion acumulada al 01/01/{fiscalYear}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-emerald-700 mb-1">
                                        Valor Libro Inicial
                                    </label>
                                    <div className="px-3 py-2 bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-mono">
                                        ${(formData.originalValue - (opening.initialAccumDep || 0)).toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-emerald-700 mb-1">
                                    Cuenta Contrapartida
                                </label>
                                <AccountSearchSelect
                                    accounts={modalAccounts}
                                    value={opening.contraAccountId}
                                    onChange={id => setOpening({ ...opening, contraAccountId: id })}
                                    placeholder="Ej: Capital Social, Apertura..."
                                />
                                <p className="text-xs text-emerald-600 mt-1">
                                    Cuenta que balancea el asiento de apertura
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Method */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            Metodo de Amortizacion
                        </label>
                        <select
                            value={formData.method}
                            onChange={e =>
                                setFormData({ ...formData, method: e.target.value as FixedAssetMethod })
                            }
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="lineal-year">Lineal (Anual)</option>
                            <option value="lineal-month">Lineal (Mensual)</option>
                            <option value="units">Unidades de Produccion</option>
                            <option value="none">No Amortizable</option>
                        </select>
                    </div>

                    {/* Life years/months based on method */}
                    {formData.method !== 'none' && formData.method !== 'units' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    {formData.method === 'lineal-month' ? 'Vida Util (Meses)' : 'Vida Util (Años)'}
                                </label>
                                <input
                                    type="number"
                                    value={formData.method === 'lineal-month'
                                        ? formData.lifeMonths || ''
                                        : formData.lifeYears || ''
                                    }
                                    onChange={e => {
                                        const val = parseInt(e.target.value) || 0
                                        if (formData.method === 'lineal-month') {
                                            setFormData({
                                                ...formData,
                                                lifeMonths: val,
                                                lifeYears: Math.ceil(val / 12),
                                            })
                                        } else {
                                            setFormData({
                                                ...formData,
                                                lifeYears: val,
                                                lifeMonths: val * 12,
                                            })
                                        }
                                    }}
                                    min="1"
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    % Valor Residual
                                </label>
                                <input
                                    type="number"
                                    value={formData.residualValuePct || ''}
                                    onChange={e =>
                                        setFormData({
                                            ...formData,
                                            residualValuePct: parseFloat(e.target.value) || 0,
                                        })
                                    }
                                    min="0"
                                    max="100"
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    {formData.method === 'units' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                Total Unidades Estimadas
                            </label>
                            <input
                                type="number"
                                value={formData.lifeUnits || ''}
                                onChange={e =>
                                    setFormData({
                                        ...formData,
                                        lifeUnits: parseInt(e.target.value) || 0,
                                    })
                                }
                                min="1"
                                placeholder="Ej: 100000 km"
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    )}

                    {formData.method === 'none' && (
                        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
                            Los bienes no amortizables (como terrenos) mantienen su valor de origen sin desgaste.
                        </div>
                    )}

                    {/* Auto-create accounts toggle (only for new assets) */}
                    {!isEditing && (
                        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <input
                                type="checkbox"
                                id="autoCreateAccounts"
                                checked={autoCreateAccounts}
                                onChange={e => setAutoCreateAccounts(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="autoCreateAccounts" className="text-sm text-slate-700">
                                <span className="font-medium">Auto-crear cuentas contables</span>
                                <br />
                                <span className="text-xs text-slate-500">
                                    Crea automaticamente la cuenta del activo y su amortizacion acumulada
                                </span>
                            </label>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-lg font-semibold shadow-md disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Bien'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
