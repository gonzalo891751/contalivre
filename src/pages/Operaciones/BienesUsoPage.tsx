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
    FIXED_ASSET_CATEGORIES,
    STATUS_LABELS,
    METHOD_LABELS,
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
    'Rodados': Car,
    'Inmuebles': Buildings,
    'Instalaciones': Buildings,
    'Maquinarias': Wrench,
    'Equipos de Computacion': Desktop,
    'Muebles y Utiles': Armchair,
    'Terrenos': MapPin,
    'Otros': Package,
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

    const openingApplicable = useMemo(() => {
        if (!selectedAsset) return false
        const fiscalYearStart = new Date(periodYear, 0, 1)
        return new Date(selectedAsset.acquisitionDate) < fiscalYearStart
    }, [selectedAsset, periodYear])

    const openingStatus = useMemo(() => {
        if (!selectedAsset) return 'pending' as const
        if (!openingApplicable) return 'pending' as const
        if (openingEntry) return 'generated' as const
        if (selectedAsset.openingJournalEntryId && !openingEntry) return 'error' as const
        return 'pending' as const
    }, [openingApplicable, openingEntry, selectedAsset])

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
                        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900">Asiento de Apertura</h3>
                                    <p className="text-sm text-slate-500">
                                        {openingApplicable
                                            ? 'Registra el saldo inicial del bien al inicio del ejercicio.'
                                            : 'Este bien es del ejercicio actual y no requiere apertura.'}
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
                                <div className="text-sm text-slate-500">
                                    No aplica para bienes incorporados en {periodYear}.
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

    // Form state
    const [formData, setFormData] = useState({
        name: asset?.name || '',
        category: asset?.category || ('Muebles y Utiles' as FixedAssetCategory),
        acquisitionDate: asset?.acquisitionDate || new Date().toISOString().split('T')[0],
        status: asset?.status || ('active' as FixedAssetStatus),
        originalValue: asset?.originalValue || 0,
        residualValuePct: asset?.residualValuePct || 0,
        method: asset?.method || ('lineal-year' as FixedAssetMethod),
        lifeYears: asset?.lifeYears || 5,
        lifeUnits: asset?.lifeUnits || 0,
        rt6Enabled: asset?.rt6Enabled || false,
        notes: asset?.notes || '',
    })

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

        setLoading(true)

        try {
            let savedAsset: FixedAsset | null = null
            if (isEditing && asset) {
                // Update existing
                savedAsset = await updateFixedAsset(asset.id, {
                    ...formData,
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
                    // For manual mode, we'd need account selection UI
                    // For now, require auto-create
                    onError('La seleccion manual de cuentas no esta implementada. Use auto-crear.')
                    setLoading(false)
                    return
                }

                savedAsset = await createFixedAsset({
                    ...formData,
                    periodId,
                    accountId,
                    contraAccountId,
                })
            }

            const fiscalYear = Number(periodId)
            if (savedAsset && Number.isFinite(fiscalYear)) {
                const openingResult = await syncFixedAssetOpeningEntry(savedAsset, fiscalYear)
                if (!openingResult.success && openingResult.status !== 'skipped') {
                    onError(openingResult.error || 'No se pudo generar el asiento de apertura')
                }
            }

            onSuccess()
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center">
                    <h2 className="font-display font-bold text-lg text-slate-900">
                        {isEditing ? 'Editar Bien' : 'Nuevo Bien de Uso'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                                {FIXED_ASSET_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
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
                                Fecha de Alta
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
                                Valor de Origen *
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

                    {/* Conditional fields based on method */}
                    {formData.method !== 'none' && formData.method !== 'units' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    Vida Util (Años)
                                </label>
                                <input
                                    type="number"
                                    value={formData.lifeYears || ''}
                                    onChange={e =>
                                        setFormData({
                                            ...formData,
                                            lifeYears: parseInt(e.target.value) || 0,
                                        })
                                    }
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
                            Los bienes no amortizables (como terrenos) mantienen su valor de origen sin
                            desgaste.
                        </div>
                    )}

                    {/* Auto-create accounts toggle (only for new assets) */}
                    {!isEditing && (
                        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <input
                                type="checkbox"
                                id="autoCreateAccounts"
                                checked={autoCreateAccounts}
                                onChange={e => setAutoCreateAccounts(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="autoCreateAccounts" className="text-sm text-blue-800">
                                <span className="font-medium">Auto-crear cuentas contables</span>
                                <br />
                                <span className="text-xs text-blue-600">
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
