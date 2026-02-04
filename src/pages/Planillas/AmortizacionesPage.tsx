import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    FileText,
    Info,
    PencilSimple,
    Plus,
    Printer,
    Trash,
    Tray,
    X,
} from '@phosphor-icons/react'
import { db } from '../../storage/db'
import {
    type AmortizationAsset,
    type AmortizationMethod,
    type AmortizationParams,
    type AmortizationState,
    createDefaultAsset,
    createInitialState,
    generateAssetId,
} from '../../core/amortizaciones/types'
import {
    calculateAllRows,
    calculateTotals,
    parseDate,
} from '../../core/amortizaciones/calc'
import { loadAmortizationState, saveAmortizationState } from '../../storage'
import {
    calculateFixedAssetDepreciationWithEvents,
    createFixedAsset,
    getAllFixedAssets,
} from '../../storage/fixedAssets'
import { ensureAssetAccounts, validateCategoryParentsExist } from '../../lib/assetAccounts'
import {
    type FixedAssetCategory,
    type FixedAssetEvent,
    METHOD_LABELS,
} from '../../core/fixedAssets/types'
import { usePeriodYear } from '../../hooks/usePeriodYear'

const DEFAULT_RUBRO = 'Muebles y Útiles'

const RUBROS = [
    DEFAULT_RUBRO,
    'Rodados',
    'Instalaciones',
    'Eq. Computación',
    'Maquinarias',
    'Inmuebles',
    'Terrenos',
    'Mejoras',
    'Otros Bienes',
]

const RUBRO_ALIASES: Record<string, string> = {
    'Muebles y Utiles': DEFAULT_RUBRO,
    'Eq. Computacion': 'Eq. Computación',
}

const CATEGORY_TO_RUBRO: Record<FixedAssetCategory, string> = {
    // Tangibles
    'Muebles y Utiles': DEFAULT_RUBRO,
    'Equipos de Computacion': 'Eq. Computación',
    'Rodados': 'Rodados',
    'Instalaciones': 'Instalaciones',
    'Maquinarias': 'Maquinarias',
    'Inmuebles': 'Inmuebles',
    'Terrenos': 'Terrenos',
    'Otros': 'Otros Bienes',
    // Intangibles
    'Software': 'Intangibles',
    'Marcas y Patentes': 'Intangibles',
    'Otros Intangibles': 'Intangibles',
}

const LEGACY_RUBRO_TO_CATEGORY: Record<string, FixedAssetCategory> = {
    [DEFAULT_RUBRO]: 'Muebles y Utiles',
    'Rodados': 'Rodados',
    'Instalaciones': 'Instalaciones',
    'Eq. Computación': 'Equipos de Computacion',
    'Maquinarias': 'Maquinarias',
    'Inmuebles': 'Inmuebles',
    'Terrenos': 'Terrenos',
    'Mejoras': 'Otros',
    'Otros Bienes': 'Otros',
}

const DEFAULT_LIFE_YEARS: Record<string, number> = {
    Rodados: 5,
    [DEFAULT_RUBRO]: 10,
    'Eq. Computación': 3,
    Inmuebles: 50,
    Instalaciones: 10,
    Maquinarias: 10,
    Terrenos: 0,
    Mejoras: 10,
    'Otros Bienes': 5,
}

const amountFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

type ActiveTab = 'carga' | 'anexo'

type AssetFormState = {
    rubro: string
    fechaAlta: string
    detalle: string
    valorOrigen: string
    vidaUtilValor: string
    metodo: AmortizationMethod
    residualPct: string
    noAmortiza: boolean
}

const normalizeRubro = (rubro: string) => RUBRO_ALIASES[rubro] ?? rubro

const mapLegacyRubroToCategory = (rubro: string): FixedAssetCategory => {
    const normalized = normalizeRubro(rubro)
    return LEGACY_RUBRO_TO_CATEGORY[normalized] || 'Otros'
}

const emptyForm = (): AssetFormState => {
    const rubro = DEFAULT_RUBRO
    return {
        rubro,
        fechaAlta: new Date().toISOString().slice(0, 10),
        detalle: '',
        valorOrigen: '',
        vidaUtilValor: String(DEFAULT_LIFE_YEARS[rubro] ?? 0),
        metodo: 'lineal-year',
        residualPct: '0',
        noAmortiza: false,
    }
}

const isAssetPopulated = (asset: AmortizationAsset) => {
    return Boolean(asset.detalle?.trim() || asset.valorOrigen || asset.fechaAlta)
}

const formatAmount = (value: number) => amountFormatter.format(value)

const dashIfZero = (value: number | null | undefined) => {
    if (!value || Math.abs(value) < 0.01) return '-'
    return formatAmount(value)
}

const formatPercentOrDash = (value: number | null | undefined) => {
    if (!value || Math.abs(value) < 0.01) return '-'
    return `${value}%`
}

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const [y, m, d] = dateStr.split('-')
    if (!y || !m || !d) return '-'
    return `${d}/${m}/${y}`
}

const formatMetodoLabel = (metodo: AmortizationMethod, noAmortiza: boolean) => {
    if (noAmortiza || metodo === 'none') return 'No Amortiza'
    if (metodo === 'lineal-month') return 'Lineal (Mes)'
    return 'Lineal (Año)'
}

const normalizeState = (loaded: AmortizationState): AmortizationState => {
    const initial = createInitialState()
    const params = loaded.params ?? initial.params
    const residual = Number.isFinite(params.residualPctGlobal) ? params.residualPctGlobal : 0
    const nextParams: AmortizationParams = {
        ...params,
        fechaCierreEjercicio: params.fechaCierreEjercicio || initial.params.fechaCierreEjercicio,
        residualPctGlobal: residual,
        amortizablePctGlobal: 100 - residual,
        prorrateoMensual: Boolean(params.prorrateoMensual),
    }

    const assetsByPeriod = { ...(loaded.assetsByPeriod ?? {}) }
    const periodKey = nextParams.fechaCierreEjercicio
    let assets = loaded.assets ?? []

    if (assetsByPeriod[periodKey]) {
        assets = assetsByPeriod[periodKey]
    } else if (assets.length > 0) {
        assetsByPeriod[periodKey] = assets
    }

    const normalizedAssets = assets.map((asset) => {
        const rubro = normalizeRubro(asset.rubro || DEFAULT_RUBRO)
        const defaultLife = DEFAULT_LIFE_YEARS[rubro] ?? null
        const vidaUtilValor = Number.isFinite(asset.vidaUtilValor) ? asset.vidaUtilValor : defaultLife
        const noAmortiza = asset.noAmortiza ?? (rubro === 'Terrenos' || (vidaUtilValor ?? 0) <= 0)
        const metodo = asset.metodo ?? (noAmortiza ? 'none' : (nextParams.prorrateoMensual ? 'lineal-month' : 'lineal-year'))
        const residualPct = Number.isFinite(asset.residualPct) ? asset.residualPct : nextParams.residualPctGlobal
        const amortizablePct = 100 - residualPct

        return {
            ...createDefaultAsset(asset.id ?? generateAssetId(), nextParams),
            ...asset,
            rubro,
            residualPct,
            amortizablePct,
            vidaUtilValor,
            vidaUtilTipo: 'AÑOS' as const,
            metodo,
            noAmortiza,
            overrideGlobals: false,
        }
    })

    assetsByPeriod[periodKey] = normalizedAssets

    return {
        ...loaded,
        params: nextParams,
        assets: normalizedAssets,
        assetsByPeriod,
        lastUpdated: loaded.lastUpdated ?? new Date().toISOString(),
    }
}

export default function AmortizacionesPage() {
    const [state, setState] = useState<AmortizationState | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<ActiveTab>('carga')
    const [viewMode, setViewMode] = useState<'v2' | 'legacy'>('v2')
    const [legacyReadOnly, setLegacyReadOnly] = useState(false)
    const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
    const [migrationError, setMigrationError] = useState<string | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [formState, setFormState] = useState<AssetFormState | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const saveTimeoutRef = useRef<number | null>(null)
    const viewBeforePrintRef = useRef<ActiveTab | null>(null)
    const { year: periodYear } = usePeriodYear()

    const periodId = String(periodYear)
    const fixedAssets = useLiveQuery(() => getAllFixedAssets(periodId), [periodId])
    const fixedAssetEvents = useLiveQuery(
        () => db.fixedAssetEvents.where('periodId').equals(periodId).toArray(),
        [periodId]
    )

    useEffect(() => {
        async function load() {
            const loadedState = await loadAmortizationState()
            const normalized = normalizeState(loadedState)
            setState(normalized)
            setIsLoading(false)
        }
        load()
    }, [])

    useEffect(() => {
        const handleAfterPrint = () => {
            if (viewBeforePrintRef.current && viewBeforePrintRef.current !== 'anexo') {
                setActiveTab(viewBeforePrintRef.current)
            }
            viewBeforePrintRef.current = null
        }
        window.addEventListener('afterprint', handleAfterPrint)
        return () => window.removeEventListener('afterprint', handleAfterPrint)
    }, [])

    const debouncedSave = useCallback((newState: AmortizationState) => {
        if (saveTimeoutRef.current !== null) {
            window.clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            saveAmortizationState(newState)
            saveTimeoutRef.current = null
        }, 400)
    }, [])

    const updateState = useCallback((updater: (prev: AmortizationState) => AmortizationState) => {
        setState((prev) => {
            if (!prev) return prev
            const nextState = updater(prev)
            const periodKey = nextState.params.fechaCierreEjercicio
            const assetsByPeriod = {
                ...(nextState.assetsByPeriod ?? {}),
                [periodKey]: nextState.assets,
            }
            const normalizedState = {
                ...nextState,
                assetsByPeriod,
            }
            debouncedSave(normalizedState)
            return normalizedState
        })
    }, [debouncedSave])

    const changeClosingDate = useCallback((nextDate: string) => {
        updateState((prev) => {
            const prevPeriod = prev.params.fechaCierreEjercicio
            const assetsByPeriod = {
                ...(prev.assetsByPeriod ?? {}),
                [prevPeriod]: prev.assets,
            }
            const nextAssets = assetsByPeriod[nextDate] ?? []
            return {
                ...prev,
                params: {
                    ...prev.params,
                    fechaCierreEjercicio: nextDate,
                },
                assets: nextAssets,
                assetsByPeriod,
            }
        })
    }, [updateState])

    const deleteAsset = useCallback((id: string) => {
        if (!window.confirm('¿Eliminar este bien?')) return
        updateState((prev) => ({
            ...prev,
            assets: prev.assets.filter((asset) => asset.id !== id),
        }))
    }, [updateState])

    const upsertAsset = useCallback((asset: AmortizationAsset) => {
        updateState((prev) => {
            const exists = prev.assets.some((item) => item.id === asset.id)
            return {
                ...prev,
                assets: exists
                    ? prev.assets.map((item) => (item.id === asset.id ? asset : item))
                    : [...prev.assets, asset],
            }
        })
    }, [updateState])

    const openModal = useCallback((asset?: AmortizationAsset) => {
        setFormError(null)
        if (asset) {
            setEditingId(asset.id)
            setFormState({
                rubro: asset.rubro,
                fechaAlta: asset.fechaAlta || new Date().toISOString().slice(0, 10),
                detalle: asset.detalle || '',
                valorOrigen: asset.valorOrigen ? String(asset.valorOrigen) : '',
                vidaUtilValor: Number.isFinite(asset.vidaUtilValor) ? String(asset.vidaUtilValor) : '',
                metodo: asset.metodo === 'none' ? 'lineal-year' : asset.metodo,
                residualPct: Number.isFinite(asset.residualPct) ? String(asset.residualPct) : '0',
                noAmortiza: asset.noAmortiza || asset.metodo === 'none',
            })
        } else {
            setEditingId(null)
            setFormState(emptyForm())
        }
        setIsModalOpen(true)
    }, [])

    const closeModal = useCallback(() => {
        setIsModalOpen(false)
        setFormError(null)
        setFormState(null)
        setEditingId(null)
    }, [])

    const handleRubroChange = useCallback((nextRubro: string) => {
        setFormState((prev) => {
            if (!prev) return prev
            const rubro = normalizeRubro(nextRubro)
            const defaultLife = DEFAULT_LIFE_YEARS[rubro] ?? 0
            const isTerrenos = rubro === 'Terrenos'
            return {
                ...prev,
                rubro,
                vidaUtilValor: String(defaultLife),
                noAmortiza: isTerrenos,
            }
        })
    }, [])

    const handleNoAmortizaChange = useCallback((checked: boolean) => {
        setFormState((prev) => {
            if (!prev) return prev
            const fallbackLife = String(DEFAULT_LIFE_YEARS[prev.rubro] ?? 0)
            return {
                ...prev,
                noAmortiza: checked,
                vidaUtilValor: checked ? '0' : (prev.vidaUtilValor || fallbackLife),
            }
        })
    }, [])

    const handleSaveAsset = useCallback(() => {
        if (!state || !formState) return

        const detalle = formState.detalle.trim()
        const valorOrigen = Number(formState.valorOrigen)
        const vidaUtilValor = Number(formState.vidaUtilValor)
        const residualPct = Number(formState.residualPct)
        const noAmortiza = formState.noAmortiza

        if (!detalle) {
            setFormError('Por favor ingresá el detalle del bien.')
            return
        }
        if (!Number.isFinite(valorOrigen) || valorOrigen <= 0) {
            setFormError('El valor de origen debe ser mayor a 0.')
            return
        }
        if (!noAmortiza && (!Number.isFinite(vidaUtilValor) || vidaUtilValor <= 0)) {
            setFormError('La vida útil debe ser mayor a 0.')
            return
        }
        if (!noAmortiza && (!Number.isFinite(residualPct) || residualPct < 0 || residualPct > 100)) {
            setFormError('El valor residual debe estar entre 0 y 100.')
            return
        }

        const metodo = noAmortiza ? 'none' : formState.metodo
        const normalizedResidual = noAmortiza ? 0 : (Number.isFinite(residualPct) ? residualPct : 0)

        const newAsset: AmortizationAsset = {
            id: editingId ?? generateAssetId(),
            rubro: formState.rubro,
            fechaAlta: formState.fechaAlta,
            detalle,
            valorOrigen,
            residualPct: normalizedResidual,
            amortizablePct: 100 - normalizedResidual,
            vidaUtilValor: noAmortiza ? 0 : vidaUtilValor,
            vidaUtilTipo: 'AÑOS',
            metodo,
            noAmortiza,
            overrideGlobals: false,
        }

        upsertAsset(newAsset)
        closeModal()
    }, [closeModal, editingId, formState, state, upsertAsset])

    const handlePrint = useCallback(() => {
        viewBeforePrintRef.current = activeTab
        setActiveTab('anexo')
        window.setTimeout(() => {
            window.print()
        }, 100)
    }, [activeTab])

    const legacyAssets = useMemo(() => {
        if (!state) return []
        return state.assets.filter(isAssetPopulated)
    }, [state])

    const v2Assets = useMemo(() => fixedAssets || [], [fixedAssets])

    const v2EventsByAsset = useMemo(() => {
        const map = new Map<string, FixedAssetEvent[]>()
        if (!fixedAssetEvents) return map
        for (const event of fixedAssetEvents) {
            const list = map.get(event.assetId) || []
            list.push(event)
            map.set(event.assetId, list)
        }
        return map
    }, [fixedAssetEvents])

    const legacyHasData = legacyAssets.length > 0
    const v2HasData = v2Assets.length > 0
    const legacyMismatch =
        legacyHasData &&
        (!v2HasData ||
            Math.abs(legacyAssets.length - v2Assets.length) >=
                Math.max(3, Math.round(legacyAssets.length * 0.3)))

    const shouldShowMigration = viewMode === 'v2' && legacyMismatch

    const v2Rows = useMemo(() => {
        return v2Assets.map(asset => {
            const events = v2EventsByAsset.get(asset.id) || []
            const calc = calculateFixedAssetDepreciationWithEvents(asset, periodYear, events)
            const rubro = CATEGORY_TO_RUBRO[asset.category as FixedAssetCategory] || asset.category
            const metodoLabel =
                asset.method === 'none' || asset.category === 'Terrenos'
                    ? 'No Amortiza'
                    : METHOD_LABELS[asset.method]
            return { asset, calc, rubro, metodoLabel }
        })
    }, [v2Assets, v2EventsByAsset, periodYear])

    const v2Totals = useMemo(() => {
        return v2Rows.reduce(
            (acc, row) => {
                acc.amortizacionEjercicio += row.calc.amortizacionEjercicio
                acc.vrContable += row.calc.valorLibro
                return acc
            },
            { amortizacionEjercicio: 0, vrContable: 0 }
        )
    }, [v2Rows])

    const v2AnnexGroups = useMemo(() => {
        const groups = new Map<string, {
            rubro: string
            originStart: number
            originAlta: number
            originEnd: number
            amortStart: number
            amortYear: number
            amortEnd: number
            net: number
        }>()

        v2Rows.forEach(({ asset, calc, rubro }) => {
            const altaYear = new Date(asset.acquisitionDate).getFullYear()
            const isAlta = altaYear === periodYear
            const valorOrigen = calc.valorOrigenAjustado

            if (!groups.has(rubro)) {
                groups.set(rubro, {
                    rubro,
                    originStart: 0,
                    originAlta: 0,
                    originEnd: 0,
                    amortStart: 0,
                    amortYear: 0,
                    amortEnd: 0,
                    net: 0,
                })
            }

            const group = groups.get(rubro)
            if (!group) return

            group.originStart += isAlta ? 0 : valorOrigen
            group.originAlta += isAlta ? valorOrigen : 0
            group.originEnd += valorOrigen
            group.amortStart += calc.acumuladaInicio
            group.amortYear += calc.amortizacionEjercicio
            group.amortEnd += calc.acumuladaCierre
            group.net += calc.valorLibro
        })

        return Array.from(groups.values())
    }, [v2Rows, periodYear])

    const v2AnnexTotals = useMemo(() => {
        return v2AnnexGroups.reduce(
            (acc, group) => {
                acc.originEnd += group.originEnd
                acc.amortYear += group.amortYear
                acc.net += group.net
                return acc
            },
            { originEnd: 0, amortYear: 0, net: 0 }
        )
    }, [v2AnnexGroups])

    const handleMigrateLegacy = useCallback(async () => {
        if (!legacyAssets.length) return
        setMigrationStatus('running')
        setMigrationError(null)
        try {
            const existing = await getAllFixedAssets(periodId)
            const existingLegacyIds = new Set(
                existing.map(asset => asset.legacySourceId).filter(Boolean) as string[]
            )
            const existingFingerprint = new Set(
                existing.map(asset =>
                    `${asset.name}|${asset.acquisitionDate}|${Math.round(asset.originalValue * 100) / 100}`
                )
            )

            let createdCount = 0

            for (const legacyAsset of legacyAssets) {
                if (existingLegacyIds.has(legacyAsset.id)) continue
                const fingerprint = `${legacyAsset.detalle}|${legacyAsset.fechaAlta}|${Math.round((legacyAsset.valorOrigen || 0) * 100) / 100}`
                if (existingFingerprint.has(fingerprint)) continue

                const category = mapLegacyRubroToCategory(legacyAsset.rubro)
                const validation = await validateCategoryParentsExist(category)
                if (!validation.valid) {
                    throw new Error(
                        `Faltan cuentas padre para ${category}: ${
                            validation.missingAsset || validation.missingContra || 'sin detalle'
                        }`
                    )
                }

                const accounts = await ensureAssetAccounts(category, legacyAsset.detalle || 'Bien de uso')
                const method =
                    legacyAsset.noAmortiza || legacyAsset.metodo === 'none'
                        ? 'none'
                        : legacyAsset.metodo === 'lineal-month'
                            ? 'lineal-month'
                            : 'lineal-year'

                await createFixedAsset({
                    name: legacyAsset.detalle || 'Bien de uso',
                    periodId,
                    legacySourceId: legacyAsset.id,
                    category,
                    accountId: accounts.assetAccountId,
                    contraAccountId: accounts.contraAccountId,
                    acquisitionDate: legacyAsset.fechaAlta,
                    originalValue: legacyAsset.valorOrigen || 0,
                    residualValuePct: legacyAsset.residualPct || 0,
                    method,
                    lifeYears: legacyAsset.vidaUtilValor || 0,
                    status: 'active',
                    rt6Enabled: false,
                    notes: legacyAsset.detalle || '',
                })
                createdCount += 1
            }

            setMigrationStatus('done')
            if (createdCount === 0) {
                setMigrationError('No se detectaron bienes nuevos para migrar.')
            }
        } catch (err) {
            setMigrationStatus('error')
            setMigrationError(err instanceof Error ? err.message : 'Error al migrar datos legacy.')
        }
    }, [legacyAssets, periodId])

    const assets = useMemo(() => {
        if (!state) return []
        return state.assets.filter(isAssetPopulated)
    }, [state])

    const rows = useMemo(() => {
        if (!state) return []
        return calculateAllRows(assets, state.params)
    }, [assets, state])

    const totals = useMemo(() => calculateTotals(rows), [rows])

    const annexGroups = useMemo(() => {
        if (!state) return []
        const fyEnd = parseDate(state.params.fechaCierreEjercicio)
        const closingYear = fyEnd?.getFullYear() ?? new Date().getFullYear()

        const groups = new Map<string, {
            rubro: string
            originStart: number
            originAlta: number
            originEnd: number
            amortStart: number
            amortYear: number
            amortEnd: number
            net: number
        }>()

        rows.forEach((row) => {
            const { asset, calculated } = row
            const rubro = asset.rubro || 'Sin rubro'
            const altaYear = parseDate(asset.fechaAlta)?.getFullYear()
            const isAlta = altaYear === closingYear
            const valorOrigen = asset.valorOrigen ?? 0
            const amortStart = calculated.acumuladaInicio ?? 0
            const amortYear = calculated.amortizacionEjercicio ?? 0
            const amortEnd = calculated.acumuladaCierre ?? 0
            const net = calculated.vrContable ?? Math.max(0, valorOrigen - amortEnd)

            if (!groups.has(rubro)) {
                groups.set(rubro, {
                    rubro,
                    originStart: 0,
                    originAlta: 0,
                    originEnd: 0,
                    amortStart: 0,
                    amortYear: 0,
                    amortEnd: 0,
                    net: 0,
                })
            }

            const group = groups.get(rubro)
            if (!group) return

            group.originStart += isAlta ? 0 : valorOrigen
            group.originAlta += isAlta ? valorOrigen : 0
            group.originEnd += valorOrigen
            group.amortStart += amortStart
            group.amortYear += amortYear
            group.amortEnd += amortEnd
            group.net += net
        })

        return Array.from(groups.values())
    }, [rows, state])

    const annexTotals = useMemo(() => {
        return annexGroups.reduce(
            (acc, group) => {
                acc.originEnd += group.originEnd
                acc.amortYear += group.amortYear
                acc.net += group.net
                return acc
            },
            { originEnd: 0, amortYear: 0, net: 0 }
        )
    }, [annexGroups])

    const subtitleYear = Number.isFinite(periodYear)
        ? periodYear
        : Number(state?.params.fechaCierreEjercicio?.slice(0, 4)) || new Date().getFullYear()

    const pageStyles = `
.amort-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 2rem;
}
.amort-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.amort-back-link {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
}
.amort-back-link:hover {
  color: var(--brand-primary);
}
.amort-header-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.amort-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  margin: 0;
  color: var(--text-strong);
}
.amort-subtitle {
  font-size: 0.95rem;
  color: var(--text-muted);
}
.amort-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.amort-tabs {
  display: flex;
  gap: 0.25rem;
  background: var(--surface-2);
  padding: 0.25rem;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.amort-tab-btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.amort-tab-btn.active {
  background: white;
  color: var(--brand-primary);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}
.amort-tab-btn:hover:not(.active) {
  color: var(--text-strong);
}
.amort-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
}
.amort-params {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
}
.amort-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 180px;
}
.amort-input-group label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.amort-input {
  padding: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
}
.amort-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
}
.amort-kpis {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.amort-kpi {
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  min-width: 140px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.amort-kpi-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 0.2rem;
  white-space: nowrap;
}
.amort-kpi-value {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-strong);
}
.amort-kpi-value.highlight {
  color: var(--brand-primary);
}
.amort-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  background: var(--surface-2);
  padding: 0.5rem 1rem;
  border-radius: 20px;
}
.amort-table-wrapper {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.amort-scroll {
  overflow-x: auto;
}
.amort-work-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  white-space: nowrap;
}
.amort-work-table th {
  background: #F8FAFC;
  color: var(--text-muted);
  font-weight: 600;
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}
.amort-work-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-strong);
}
.amort-work-table tr:hover {
  background: #F1F5F9;
}
.amort-text-right {
  text-align: right;
}
.amort-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.amort-muted {
  color: var(--text-muted);
}
.amort-highlight {
  color: var(--brand-primary);
  font-weight: 600;
}
.amort-action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.25rem;
}
.amort-action-btn:hover {
  color: var(--text-strong);
}
.amort-action-delete {
  color: var(--color-error);
}
.amort-action-delete:hover {
  color: var(--color-error);
}
.amort-empty {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}
.amort-empty-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 0.5rem;
  color: var(--text-tertiary);
}
.amort-annex {
  background: white;
  padding: 2rem;
  min-height: 800px;
}
.amort-annex-header {
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--text-strong);
  padding-bottom: 1rem;
}
.amort-annex-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
}
.amort-annex-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}
.amort-annex-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
}
.amort-annex-table th {
  background: white;
  border: 1px solid #94A3B8;
  padding: 0.4rem;
  font-size: 0.7rem;
  text-align: center;
  font-weight: 700;
  color: black;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.amort-annex-table td {
  border: 1px solid #CBD5E1;
  padding: 0.4rem 0.5rem;
  font-size: 0.8rem;
}
.amort-annex-number {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.amort-annex-rubro {
  background: #F1F5F9;
  font-weight: 700;
  color: var(--text-strong);
}
.amort-annex-total {
  background: #E2E8F0;
  font-weight: 800;
  border-top: 2px solid black;
}
.amort-annex-sep {
  border-right: 2px solid #CBD5E1;
}
.amort-modal {
  max-width: 560px;
}
.amort-modal-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
}
.amort-modal-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
}
.amort-modal-close:hover {
  color: var(--text-strong);
}
.amort-modal-separator {
  height: 1px;
  background: var(--border);
  margin: 0.5rem 0;
}
.amort-helper {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}
.amort-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-strong);
}
.amort-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--brand-primary);
}
.amort-hidden {
  display: none !important;
}
@media (max-width: 640px) {
  .amort-annex-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  .top-header,
  .sidebar,
  .mobile-bottom-nav,
  .mobile-drawer,
  .amort-print-hide {
    display: none !important;
  }
  .main-content {
    padding: 0 !important;
  }
  .amort-view-carga {
    display: none !important;
  }
  .amort-view-anexo {
    display: block !important;
  }
  .amort-annex {
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: white !important;
  }
  .amort-annex-table th,
  .amort-annex-table td {
    border-color: #000 !important;
    color: #000 !important;
  }
  .amort-annex-rubro,
  .amort-annex-total {
    background: #f0f0f0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`

    if (viewMode === 'v2') {
        return (
            <div className="amort-page">
                <style>{pageStyles}</style>

                <header className="amort-header">
                    <Link to="/planillas" className="amort-back-link">
                        <ArrowLeft size={14} /> Volver a planillas
                    </Link>
                    <div className="amort-header-bar">
                        <div>
                            <h1 className="amort-title">Planilla de Amortizaciones</h1>
                            <p className="amort-subtitle">
                                Ejercicio {subtitleYear} · Fuente: Bienes de Uso V2
                            </p>
                        </div>

                        <div className="amort-actions amort-print-hide">
                            <div className="amort-tabs" role="tablist">
                                <button
                                    type="button"
                                    className={`amort-tab-btn ${activeTab === 'carga' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('carga')}
                                    aria-selected={activeTab === 'carga'}
                                >
                                    <PencilSimple size={16} /> Carga
                                </button>
                                <button
                                    type="button"
                                    className={`amort-tab-btn ${activeTab === 'anexo' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('anexo')}
                                    aria-selected={activeTab === 'anexo'}
                                >
                                    <FileText size={16} /> Anexo Imprimible
                                </button>
                            </div>

                            <div className="amort-divider" />

                            {legacyHasData && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setLegacyReadOnly(false)
                                        setViewMode('legacy')
                                    }}
                                >
                                    Ver legacy
                                </button>
                            )}
                            <button className="btn btn-secondary" onClick={handlePrint}>
                                <Printer size={16} /> Imprimir
                            </button>
                        </div>
                    </div>
                </header>

                {shouldShowMigration && (
                    <div className="amort-print-hide bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="text-sm font-semibold text-amber-800 mb-1">
                            Datos legacy detectados
                        </div>
                        <p className="text-sm text-amber-700 mb-3">
                            Hay {legacyAssets.length} bienes en la planilla legacy. Podés migrarlos a V2
                            sin borrar el historial anterior.
                        </p>
                        {migrationError && (
                            <div className="text-xs text-amber-700 mb-2">
                                {migrationError}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button
                                className="btn btn-primary"
                                onClick={handleMigrateLegacy}
                                disabled={migrationStatus === 'running'}
                            >
                                {migrationStatus === 'running' ? 'Migrando...' : 'Migrar a V2'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setLegacyReadOnly(true)
                                    setViewMode('legacy')
                                }}
                            >
                                Ver legacy (solo lectura)
                            </button>
                        </div>
                    </div>
                )}

                <section className="amort-header-bar">
                    <div className="amort-params">
                        <div className="amort-pill">
                            <Info size={14} /> Gestioná los bienes desde Operaciones › Bienes de Uso.
                        </div>
                        <div className="amort-pill">
                            <Info size={14} /> Moneda Homogénea disponible en el módulo de bienes.
                        </div>
                    </div>

                    <div className="amort-kpis">
                        <div className="amort-kpi">
                            <span className="amort-kpi-label">Depreciación Ej.</span>
                            <span className="amort-kpi-value highlight">
                                {dashIfZero(v2Totals.amortizacionEjercicio)}
                            </span>
                        </div>
                        <div className="amort-kpi">
                            <span className="amort-kpi-label">Valor Neto Total</span>
                            <span className="amort-kpi-value">
                                {dashIfZero(v2Totals.vrContable)}
                            </span>
                        </div>
                        <div className="amort-kpi">
                            <span className="amort-kpi-label">Bienes Cargados</span>
                            <span className="amort-kpi-value">{v2Assets.length}</span>
                        </div>
                    </div>
                </section>

                <section className={`amort-table-wrapper amort-view-carga ${activeTab === 'carga' ? '' : 'amort-hidden'}`}>
                    <div className="amort-scroll">
                        <table className="amort-work-table">
                            <thead>
                                <tr>
                                    <th>Rubro</th>
                                    <th>Detalle del Bien</th>
                                    <th>F. Alta</th>
                                    <th>Vida Útil</th>
                                    <th>Método</th>
                                    <th className="amort-text-right">V. Origen</th>
                                    <th className="amort-text-right">% Res.</th>
                                    <th className="amort-text-right">Amort. Ejercicio</th>
                                    <th className="amort-text-right">Acum. Cierre</th>
                                    <th className="amort-text-right">Valor Neto</th>
                                    <th style={{ textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {v2Rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="amort-empty">
                                            <div className="amort-empty-icon">
                                                <Tray size={32} />
                                            </div>
                                            No hay bienes cargados.
                                        </td>
                                    </tr>
                                ) : (
                                    v2Rows.map(({ asset, calc, rubro, metodoLabel }) => (
                                        <tr key={asset.id}>
                                            <td><strong>{rubro}</strong></td>
                                            <td>{asset.name}</td>
                                            <td className="amort-mono">{formatDate(asset.acquisitionDate)}</td>
                                            <td className="amort-mono amort-text-right">
                                                {asset.method === 'none' || asset.category === 'Terrenos' || !asset.lifeYears
                                                    ? '-'
                                                    : asset.lifeYears}
                                            </td>
                                            <td className="amort-muted" style={{ fontSize: '0.75rem' }}>
                                                {metodoLabel}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {calc.valorOrigenAjustado ? formatAmount(calc.valorOrigenAjustado) : '-'}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {formatPercentOrDash(asset.residualValuePct)}
                                            </td>
                                            <td className="amort-mono amort-text-right amort-highlight">
                                                {dashIfZero(calc.amortizacionEjercicio)}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {dashIfZero(calc.acumuladaCierre)}
                                            </td>
                                            <td className="amort-mono amort-text-right" style={{ fontWeight: 700 }}>
                                                {calc.valorLibro ? formatAmount(calc.valorLibro) : '-'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <Link
                                                    to="/operaciones/bienes-uso"
                                                    className="amort-action-btn"
                                                    title="Ver en Operaciones"
                                                >
                                                    <PencilSimple size={16} />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className={`amort-table-wrapper amort-view-anexo ${activeTab === 'anexo' ? '' : 'amort-hidden'}`}>
                    <div className="amort-annex">
                        <div className="amort-annex-header">
                            <div className="amort-annex-title">
                                ANEXO — BIENES DE USO
                            </div>
                            <div style={{ marginTop: '0.5rem' }}>
                                Correspondiente al ejercicio anual finalizado el{' '}
                                <span style={{ fontWeight: 600 }}>
                                    {formatDate(`${subtitleYear}-12-31`)}
                                </span>
                            </div>
                        </div>

                        <div className="amort-annex-meta">
                            <div>
                                <strong>Entidad:</strong> -
                            </div>
                            <div>
                                <strong>CUIT:</strong> -
                            </div>
                        </div>

                        <div className="amort-scroll">
                            <table className="amort-annex-table">
                                <thead>
                                    <tr>
                                        <th rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'middle', minWidth: 150, borderBottom: '2px solid #64748B' }}>
                                            RUBRO
                                        </th>
                                        <th colSpan={4} style={{ borderBottom: '1px solid #94A3B8' }}>
                                            VALORES DE INCORPORACIÓN
                                        </th>
                                        <th colSpan={4} style={{ borderBottom: '1px solid #94A3B8' }}>
                                            AMORTIZACIONES
                                        </th>
                                        <th style={{ borderBottom: '2px solid #64748B' }}>
                                            VALOR NETO
                                        </th>
                                    </tr>
                                    <tr>
                                        <th style={{ minWidth: 90 }}>Al Inicio</th>
                                        <th style={{ minWidth: 90 }}>Altas</th>
                                        <th style={{ minWidth: 90 }}>Bajas</th>
                                        <th style={{ minWidth: 90, borderRight: '2px solid #CBD5E1' }}>Al Cierre</th>
                                        <th style={{ minWidth: 90 }}>Acum. Inicio</th>
                                        <th style={{ minWidth: 90 }}>Bajas</th>
                                        <th style={{ minWidth: 90 }}>Del Ejercicio</th>
                                        <th style={{ minWidth: 90, borderRight: '2px solid #CBD5E1' }}>Acum. Cierre</th>
                                        <th style={{ minWidth: 100 }}>Al Cierre</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {v2AnnexGroups.map((group) => (
                                        <tr key={group.rubro} className="amort-annex-rubro">
                                            <td style={{ textAlign: 'left' }}>{group.rubro}</td>
                                            <td className="amort-annex-number">{dashIfZero(group.originStart)}</td>
                                            <td className="amort-annex-number">{dashIfZero(group.originAlta)}</td>
                                            <td className="amort-annex-number">-</td>
                                            <td className="amort-annex-number amort-annex-sep">{dashIfZero(group.originEnd)}</td>
                                            <td className="amort-annex-number">{dashIfZero(group.amortStart)}</td>
                                            <td className="amort-annex-number">-</td>
                                            <td className="amort-annex-number">{dashIfZero(group.amortYear)}</td>
                                            <td className="amort-annex-number amort-annex-sep">{dashIfZero(group.amortEnd)}</td>
                                            <td className="amort-annex-number">{dashIfZero(group.net)}</td>
                                        </tr>
                                    ))}
                                    <tr className="amort-annex-total">
                                        <td style={{ textAlign: 'left' }}>TOTALES</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number amort-annex-sep">{dashIfZero(v2AnnexTotals.originEnd)}</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number">{dashIfZero(v2AnnexTotals.amortYear)}</td>
                                        <td className="amort-annex-number amort-annex-sep">-</td>
                                        <td className="amort-annex-number">{dashIfZero(v2AnnexTotals.net)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    if (isLoading || !state) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">⏳</div>
                <p>Cargando planilla...</p>
            </div>
        )
    }

    return (
        <div className="amort-page">
            <style>{pageStyles}</style>

            <div className="amort-header amort-print-hide">
                <Link
                    to="/planillas"
                    className="amort-back-link"
                >
                    <ArrowLeft size={14} />
                    Volver a Planillas
                </Link>

                <div className="amort-header-bar">
                    <div>
                        <h1 className="amort-title">
                            Amortizaciones
                        </h1>
                        <p className="amort-subtitle">
                            Anexo de Bienes de Uso (Ejercicio {subtitleYear})
                        </p>
                    </div>

                    <div className="amort-actions">
                        <div className="amort-tabs" role="tablist">
                            <button
                                type="button"
                                className={`amort-tab-btn ${activeTab === 'carga' ? 'active' : ''}`}
                                onClick={() => setActiveTab('carga')}
                                aria-selected={activeTab === 'carga'}
                            >
                                <PencilSimple size={16} /> Carga
                            </button>
                            <button
                                type="button"
                                className={`amort-tab-btn ${activeTab === 'anexo' ? 'active' : ''}`}
                                onClick={() => setActiveTab('anexo')}
                                aria-selected={activeTab === 'anexo'}
                            >
                                <FileText size={16} /> Anexo Imprimible
                            </button>
                        </div>

                        <div className="amort-divider" />

                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setLegacyReadOnly(false)
                                setViewMode('v2')
                            }}
                        >
                            Ver V2
                        </button>
                        <button className="btn btn-secondary" onClick={handlePrint}>
                            <Printer size={16} /> Imprimir
                        </button>
                        {!legacyReadOnly && (
                            <button className="btn btn-primary" onClick={() => openModal()}>
                                <Plus size={16} /> Agregar Bien
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <section className="card amort-params amort-print-hide">
                <div className="amort-input-group">
                    <label htmlFor="amort-closing">Cierre de Ejercicio</label>
                    <input
                        id="amort-closing"
                        type="date"
                        className="amort-input"
                        value={state.params.fechaCierreEjercicio}
                        onChange={(event) => changeClosingDate(event.target.value)}
                    />
                </div>

                <div className="amort-kpis">
                    <div className="amort-kpi">
                        <span className="amort-kpi-label">Depreciación Ej.</span>
                        <span className="amort-kpi-value highlight">
                            {dashIfZero(totals.amortizacionEjercicio)}
                        </span>
                    </div>
                    <div className="amort-kpi">
                        <span className="amort-kpi-label">Valor Neto Total</span>
                        <span className="amort-kpi-value">
                            {dashIfZero(totals.vrContable)}
                        </span>
                    </div>
                    <div className="amort-kpi">
                        <span className="amort-kpi-label">Bienes Cargados</span>
                        <span className="amort-kpi-value">{assets.length}</span>
                    </div>
                </div>

                <div style={{ flex: 1 }} />

                <div className="amort-pill">
                    <Info size={14} /> Moneda Homogénea
                </div>
            </section>

            <section className={`amort-table-wrapper amort-view-carga ${activeTab === 'carga' ? '' : 'amort-hidden'}`}>
                <div className="amort-scroll">
                    <table className="amort-work-table">
                        <thead>
                            <tr>
                                <th>Rubro</th>
                                <th>Detalle del Bien</th>
                                <th>F. Alta</th>
                                <th>Vida Útil</th>
                                <th>Método</th>
                                <th className="amort-text-right">V. Origen</th>
                                <th className="amort-text-right">% Res.</th>
                                <th className="amort-text-right">Amort. Ejercicio</th>
                                <th className="amort-text-right">Acum. Cierre</th>
                                <th className="amort-text-right">Valor Neto</th>
                                <th style={{ textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="amort-empty">
                                        <div className="amort-empty-icon">
                                            <Tray size={32} />
                                        </div>
                                        No hay bienes cargados.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => {
                                    const { asset, calculated } = row
                                    return (
                                        <tr key={asset.id}>
                                            <td><strong>{asset.rubro}</strong></td>
                                            <td>{asset.detalle}</td>
                                            <td className="amort-mono">{formatDate(asset.fechaAlta)}</td>
                                            <td className="amort-mono amort-text-right">
                                                {asset.noAmortiza || !asset.vidaUtilValor ? '-' : asset.vidaUtilValor}
                                            </td>
                                            <td className="amort-muted" style={{ fontSize: '0.75rem' }}>
                                                {formatMetodoLabel(asset.metodo, asset.noAmortiza)}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {asset.valorOrigen ? formatAmount(asset.valorOrigen) : '-'}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {formatPercentOrDash(asset.residualPct)}
                                            </td>
                                            <td className="amort-mono amort-text-right amort-highlight">
                                                {dashIfZero(calculated.amortizacionEjercicio)}
                                            </td>
                                            <td className="amort-mono amort-text-right">
                                                {dashIfZero(calculated.acumuladaCierre)}
                                            </td>
                                            <td className="amort-mono amort-text-right" style={{ fontWeight: 700 }}>
                                                {calculated.vrContable !== null && calculated.vrContable !== undefined
                                                    ? formatAmount(calculated.vrContable)
                                                    : '-'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {legacyReadOnly ? (
                                                    <span className="amort-muted" style={{ fontSize: '0.75rem' }}>
                                                        Solo lectura
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="amort-action-btn"
                                                            onClick={() => openModal(asset)}
                                                            title="Editar"
                                                        >
                                                            <PencilSimple size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="amort-action-btn amort-action-delete"
                                                            onClick={() => deleteAsset(asset.id)}
                                                            title="Eliminar"
                                                        >
                                                            <Trash size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className={`amort-table-wrapper amort-view-anexo ${activeTab === 'anexo' ? '' : 'amort-hidden'}`}>
                <div className="amort-annex">
                    <div className="amort-annex-header">
                        <div className="amort-annex-title">
                            ANEXO — BIENES DE USO
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                            Correspondiente al ejercicio anual finalizado el{' '}
                            <span style={{ fontWeight: 600 }}>{formatDate(state.params.fechaCierreEjercicio)}</span>
                        </div>
                    </div>

                    <div className="amort-annex-meta">
                        <div>
                            <strong>Entidad:</strong> -
                        </div>
                        <div>
                            <strong>CUIT:</strong> -
                        </div>
                    </div>

                    <div className="amort-scroll">
                        <table className="amort-annex-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'middle', minWidth: 150, borderBottom: '2px solid #64748B' }}>
                                        RUBRO
                                    </th>
                                    <th colSpan={4} style={{ borderBottom: '1px solid #94A3B8' }}>
                                        VALORES DE INCORPORACIÓN
                                    </th>
                                    <th colSpan={4} style={{ borderBottom: '1px solid #94A3B8' }}>
                                        AMORTIZACIONES
                                    </th>
                                    <th style={{ borderBottom: '2px solid #64748B' }}>
                                        VALOR NETO
                                    </th>
                                </tr>
                                <tr>
                                    <th style={{ minWidth: 90 }}>Al Inicio</th>
                                    <th style={{ minWidth: 90 }}>Altas</th>
                                    <th style={{ minWidth: 90 }}>Bajas</th>
                                    <th style={{ minWidth: 90, borderRight: '2px solid #CBD5E1' }}>Al Cierre</th>
                                    <th style={{ minWidth: 90 }}>Acum. Inicio</th>
                                    <th style={{ minWidth: 90 }}>Bajas</th>
                                    <th style={{ minWidth: 90 }}>Del Ejercicio</th>
                                    <th style={{ minWidth: 90, borderRight: '2px solid #CBD5E1' }}>Acum. Cierre</th>
                                    <th style={{ minWidth: 100 }}>Al Cierre</th>
                                </tr>
                            </thead>
                            <tbody>
                                {annexGroups.map((group) => (
                                    <tr key={group.rubro} className="amort-annex-rubro">
                                        <td style={{ textAlign: 'left' }}>{group.rubro}</td>
                                        <td className="amort-annex-number">{dashIfZero(group.originStart)}</td>
                                        <td className="amort-annex-number">{dashIfZero(group.originAlta)}</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number amort-annex-sep">{dashIfZero(group.originEnd)}</td>
                                        <td className="amort-annex-number">{dashIfZero(group.amortStart)}</td>
                                        <td className="amort-annex-number">-</td>
                                        <td className="amort-annex-number">{dashIfZero(group.amortYear)}</td>
                                        <td className="amort-annex-number amort-annex-sep">{dashIfZero(group.amortEnd)}</td>
                                        <td className="amort-annex-number">{dashIfZero(group.net)}</td>
                                    </tr>
                                ))}
                                <tr className="amort-annex-total">
                                    <td style={{ textAlign: 'left' }}>TOTALES</td>
                                    <td className="amort-annex-number">-</td>
                                    <td className="amort-annex-number">-</td>
                                    <td className="amort-annex-number">-</td>
                                    <td className="amort-annex-number amort-annex-sep">{dashIfZero(annexTotals.originEnd)}</td>
                                    <td className="amort-annex-number">-</td>
                                    <td className="amort-annex-number">-</td>
                                    <td className="amort-annex-number">{dashIfZero(annexTotals.amortYear)}</td>
                                    <td className="amort-annex-number amort-annex-sep">-</td>
                                    <td className="amort-annex-number">{dashIfZero(annexTotals.net)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {isModalOpen && formState && (
                <div className="modal-overlay amort-print-hide" onClick={closeModal}>
                    <div className="modal amort-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title amort-modal-title">
                                {editingId ? 'Editar Bien de Uso' : 'Nuevo Bien de Uso'}
                            </h3>
                            <button
                                className="amort-modal-close"
                                onClick={closeModal}
                                aria-label="Cerrar"
                                type="button"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {formError && (
                                <div className="alert alert-warning">{formError}</div>
                            )}

                            <div className="amort-input-group">
                                <label htmlFor="amort-rubro">Rubro</label>
                                <select
                                    id="amort-rubro"
                                    className="amort-input"
                                    value={formState.rubro}
                                    onChange={(event) => handleRubroChange(event.target.value)}
                                >
                                    {RUBROS.map((rubro) => (
                                        <option key={rubro} value={rubro}>
                                            {rubro}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="amort-input-group">
                                <label htmlFor="amort-detalle">Detalle / Descripción</label>
                                <input
                                    id="amort-detalle"
                                    type="text"
                                    className="amort-input"
                                    value={formState.detalle}
                                    placeholder="Ej: Notebook Dell Inspiron 15..."
                                    onChange={(event) =>
                                        setFormState((prev) =>
                                            prev ? { ...prev, detalle: event.target.value } : prev
                                        )
                                    }
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="amort-input-group">
                                    <label htmlFor="amort-fecha">Fecha de Alta</label>
                                    <input
                                        id="amort-fecha"
                                        type="date"
                                        className="amort-input"
                                        value={formState.fechaAlta}
                                        onChange={(event) =>
                                            setFormState((prev) =>
                                                prev ? { ...prev, fechaAlta: event.target.value } : prev
                                            )
                                        }
                                    />
                                </div>
                                <div className="amort-input-group">
                                    <label htmlFor="amort-valor">Valor de Origen ($)</label>
                                    <input
                                        id="amort-valor"
                                        type="number"
                                        className="amort-input"
                                        value={formState.valorOrigen}
                                        placeholder="0.00"
                                        min={0}
                                        step="0.01"
                                        onChange={(event) =>
                                            setFormState((prev) =>
                                                prev ? { ...prev, valorOrigen: event.target.value } : prev
                                            )
                                        }
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                <div className="amort-input-group" style={{ flex: 1 }}>
                                    <label htmlFor="amort-vida">Vida Útil (Años)</label>
                                    <input
                                        id="amort-vida"
                                        type="number"
                                        className="amort-input"
                                        value={formState.vidaUtilValor}
                                        min={0}
                                        disabled={formState.noAmortiza}
                                        onChange={(event) =>
                                            setFormState((prev) =>
                                                prev ? { ...prev, vidaUtilValor: event.target.value } : prev
                                            )
                                        }
                                    />
                                </div>
                                <div style={{ paddingBottom: '0.6rem' }}>
                                    <label className="amort-check">
                                        <input
                                            type="checkbox"
                                            checked={formState.noAmortiza}
                                            onChange={(event) => handleNoAmortizaChange(event.target.checked)}
                                        />
                                        NO AMORTIZA
                                    </label>
                                </div>
                            </div>

                            <div className="amort-modal-separator" />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="amort-input-group">
                                    <label htmlFor="amort-metodo">Método de amortización</label>
                                    <select
                                        id="amort-metodo"
                                        className="amort-input"
                                        value={formState.metodo}
                                        disabled={formState.noAmortiza}
                                        onChange={(event) =>
                                            setFormState((prev) =>
                                                prev ? { ...prev, metodo: event.target.value as AmortizationMethod } : prev
                                            )
                                        }
                                    >
                                        <option value="lineal-year">Lineal (Año completo)</option>
                                        <option value="lineal-month">Lineal (Prorrateo mensual)</option>
                                        <option value="decreasing" disabled>Decreciente (Próximamente)</option>
                                    </select>
                                </div>
                                <div className="amort-input-group">
                                    <label htmlFor="amort-residual">Valor residual (%)</label>
                                    <input
                                        id="amort-residual"
                                        type="number"
                                        className="amort-input"
                                        value={formState.residualPct}
                                        min={0}
                                        max={100}
                                        disabled={formState.noAmortiza}
                                        onChange={(event) =>
                                            setFormState((prev) =>
                                                prev ? { ...prev, residualPct: event.target.value } : prev
                                            )
                                        }
                                    />
                                    <div className="amort-helper">Porcentaje sobre valor origen.</div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveAsset}>
                                Guardar Bien
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
