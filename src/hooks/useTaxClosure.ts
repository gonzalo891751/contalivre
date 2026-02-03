/**
 * Hook for managing tax closure state
 * Uses Dexie liveQuery for reactive updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
    TaxClosePeriod,
    TaxRegime,
    IVATotals,
    IIBBTotals,
    IVAAlicuotaDetail,
    RetencionPercepcionRow,
    TaxOverrideRow,
    AutonomosSettings,
} from '../core/impuestos/types'
import {
    getTaxClosure,
    ensureTaxClosure,
    updateTaxClosure,
    calculateIVAFromEntries,
    calculateIVAByAlicuota,
    getRetencionesPercepciones,
    calculateIIBBSuggestedBase,
    generateIVAEntry,
    generateIIBBEntry,
    generateMonotributoEntry,
    generateAutonomosEntry,
    getGeneratedEntriesForClosure,
    generateNotificationsForMonth,
    syncAutonomosNotification,
} from '../storage/impuestos'
import { db } from '../storage/db'
import type { JournalEntry } from '../core/models'

export interface UseTaxClosureReturn {
    // Data
    closure: TaxClosePeriod | null
    ivaTotals: IVATotals | null
    ivaByAlicuota: IVAAlicuotaDetail[]
    retencionesPercepciones: RetencionPercepcionRow[]
    iibbSuggestedBase: number
    generatedEntries: JournalEntry[]

    // Loading states
    isLoading: boolean
    isCalculating: boolean

    // Actions
    refreshCalculations: () => Promise<void>
    updateSteps: (steps: Partial<TaxClosePeriod['steps']>) => Promise<void>
    updateIIBBTotals: (totals: IIBBTotals) => Promise<void>
    updateMTTotals: (categoria: string, monto: number) => Promise<void>
    updateAutonomosSettings: (settings: AutonomosSettings) => Promise<void>
    addOverride: (override: Omit<TaxOverrideRow, 'id'>) => Promise<void>
    removeOverride: (id: string) => Promise<void>
    generateEntry: (type: 'iva' | 'iibb' | 'mt' | 'autonomos') => Promise<{ success: boolean; error?: string }>
    closePeriod: () => Promise<void>
}

export function useTaxClosure(month: string, regime: TaxRegime): UseTaxClosureReturn {
    const [isLoading, setIsLoading] = useState(true)
    const [isCalculating, setIsCalculating] = useState(false)
    const [ivaTotals, setIvaTotals] = useState<IVATotals | null>(null)
    const [ivaByAlicuota, setIvaByAlicuota] = useState<IVAAlicuotaDetail[]>([])
    const [retencionesPercepciones, setRetencionesPercepciones] = useState<RetencionPercepcionRow[]>([])
    const [iibbSuggestedBase, setIibbSuggestedBase] = useState(0)
    const [generatedEntries, setGeneratedEntries] = useState<JournalEntry[]>([])
    const closureRef = useRef<TaxClosePeriod | null>(null)

    const getMonthRange = (value: string) => {
        const [year, monthNum] = value.split('-').map(Number)
        const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
        const lastDay = new Date(year, monthNum, 0).getDate()
        const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        return { start, end }
    }

    const entriesVersion = useLiveQuery(async () => {
        if (!month) return []
        const { start, end } = getMonthRange(month)
        return db.entries.where('date').between(start, end, true, true).primaryKeys()
    }, [month])

    const movementsVersion = useLiveQuery(async () => {
        if (!month) return []
        const { start, end } = getMonthRange(month)
        return db.bienesMovements.where('date').between(start, end, true, true).primaryKeys()
    }, [month])

    const accountsVersion = useLiveQuery(async () => db.accounts.toCollection().primaryKeys(), [])

    // Live query for the closure document
    const closure = useLiveQuery(
        () => {
            if (!month) return null
            return getTaxClosure(month, regime)
        },
        [month, regime],
        null
    )

    useEffect(() => {
        closureRef.current = closure ?? null
    }, [closure])

    // Ensure closure exists (Write Effect)
    useEffect(() => {
        if (!month) return
        if (closure === undefined) {
            ensureTaxClosure(month, regime).catch(console.error)
        }
    }, [closure, month, regime])

    // Update loading state
    useEffect(() => {
        if (!month) {
            setIsLoading(false)
            return
        }
        setIsLoading(!closure)
    }, [closure, month])

    useEffect(() => {
        if (month) return
        setIvaTotals(null)
        setIvaByAlicuota([])
        setRetencionesPercepciones([])
        setIibbSuggestedBase(0)
        setGeneratedEntries([])
    }, [month])

    // Calculate IVA totals when month changes
    const refreshCalculations = useCallback(async () => {
        if (!month) return

        setIsCalculating(true)
        try {
            const [iva, byAlicuota, retPerc, suggestedBase, entries] = await Promise.all([
                calculateIVAFromEntries(month),
                calculateIVAByAlicuota(month),
                getRetencionesPercepciones(month),
                calculateIIBBSuggestedBase(month),
                getGeneratedEntriesForClosure(month, regime),
            ])

            setIvaTotals(iva)
            setIvaByAlicuota(byAlicuota)
            setRetencionesPercepciones(retPerc)
            setIibbSuggestedBase(suggestedBase)
            setGeneratedEntries(entries)

            const currentClosure = closureRef.current
            if (currentClosure) {
                const updates: Partial<Omit<TaxClosePeriod, 'id'>> = { ivaTotals: iva }
                const journalEntryIds = currentClosure.journalEntryIds || {}
                const ids = Object.values(journalEntryIds).filter(Boolean) as string[]

                if (ids.length > 0) {
                    const existing = await db.entries.bulkGet(ids)
                    const existingIds = new Set(existing.filter(Boolean).map(entry => entry!.id))
                    const nextIds = { ...journalEntryIds }
                    let changed = false

                    for (const [key, value] of Object.entries(journalEntryIds)) {
                        if (value && !existingIds.has(value)) {
                            delete nextIds[key as keyof typeof nextIds]
                            changed = true
                        }
                    }

                    if (changed) {
                        updates.journalEntryIds = nextIds
                        updates.steps = { ...currentClosure.steps, asientos: false }
                    }
                }

                await updateTaxClosure(currentClosure.id, updates)
            }
        } catch (error) {
            console.error('Error calculating tax data:', error)
        } finally {
            setIsCalculating(false)
        }
    }, [month, regime, closure?.id])

    // Initial calculation
    useEffect(() => {
        if (closure) {
            refreshCalculations()
        }
    }, [closure?.id, month, regime, entriesVersion, movementsVersion, accountsVersion, refreshCalculations])

    useEffect(() => {
        if (!closure) return
        const includeAgentDeposits = retencionesPercepciones.some(
            r => r.direction === 'PRACTICADA' && r.impuesto === 'IVA'
        )
        const includeIIBBCM = (closure.iibbCMJurisdictions || []).length > 0

        generateNotificationsForMonth(month, regime, {
            hasAutonomos: closure.autonomosSettings?.enabled,
            autonomosDueDay: closure.autonomosSettings?.dueDay,
            includeAgentDeposits,
            includeIIBBCM,
        }).catch(console.error)
    }, [
        closure?.id,
        month,
        regime,
        closure?.autonomosSettings?.enabled,
        closure?.autonomosSettings?.dueDay,
        closure?.iibbCMJurisdictions?.length,
        retencionesPercepciones,
    ])

    // Update steps
    const updateSteps = useCallback(async (steps: Partial<TaxClosePeriod['steps']>) => {
        if (!closure) return

        await updateTaxClosure(closure.id, {
            steps: { ...closure.steps, ...steps },
        })
    }, [closure])

    // Update IIBB totals
    const updateIIBBTotals = useCallback(async (totals: IIBBTotals) => {
        if (!closure) return

        await updateTaxClosure(closure.id, { iibbTotals: totals })
    }, [closure])

    // Update MT totals
    const updateMTTotals = useCallback(async (categoria: string, monto: number) => {
        if (!closure) return

        await updateTaxClosure(closure.id, {
            mtTotals: { categoria, montoMensual: monto },
        })
    }, [closure])

    // Update Autónomos settings (RI only)
    const updateAutonomosSettings = useCallback(async (settings: AutonomosSettings) => {
        if (!closure) return
        if (closure.regime !== 'RI') return // Only for Responsable Inscripto

        await updateTaxClosure(closure.id, { autonomosSettings: settings })

        // Sync notification based on enabled status
        await syncAutonomosNotification(month, settings.enabled, settings.dueDay)
    }, [closure, month])

    // Add manual override
    const addOverride = useCallback(async (override: Omit<TaxOverrideRow, 'id'>) => {
        if (!closure) return

        const newOverride: TaxOverrideRow = {
            ...override,
            id: `override-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        }

        await updateTaxClosure(closure.id, {
            overrides: [...(closure.overrides || []), newOverride],
        })
    }, [closure])

    // Remove override
    const removeOverride = useCallback(async (id: string) => {
        if (!closure) return

        await updateTaxClosure(closure.id, {
            overrides: (closure.overrides || []).filter(o => o.id !== id),
        })
    }, [closure])

    // Generate entry
    const generateEntry = useCallback(async (type: 'iva' | 'iibb' | 'mt' | 'autonomos'): Promise<{ success: boolean; error?: string }> => {
        if (!closure) return { success: false, error: 'No hay cierre cargado' }

        let result: { entryId: string; error?: string }

        switch (type) {
            case 'iva':
                result = await generateIVAEntry(closure)
                break
            case 'iibb':
                result = await generateIIBBEntry(closure)
                break
            case 'autonomos':
                result = await generateAutonomosEntry(closure)
                break
            case 'mt':
                result = await generateMonotributoEntry(closure)
                break
            default:
                return { success: false, error: 'Tipo de asiento desconocido' }
        }

        if (result.error) {
            return { success: false, error: result.error }
        }

        // Update closure with entry ID
        const journalEntryIds = { ...closure.journalEntryIds, [type]: result.entryId }
        await updateTaxClosure(closure.id, {
            journalEntryIds,
            steps: { ...closure.steps, asientos: true },
        })

        // Refresh entries list
        const entries = await getGeneratedEntriesForClosure(month, regime)
        setGeneratedEntries(entries)

        return { success: true }
    }, [closure, month, regime])

    // Close period
    const closePeriod = useCallback(async () => {
        if (!closure) return

        await updateTaxClosure(closure.id, {
            status: 'DJ_SUBMITTED',
            steps: {
                ...closure.steps,
                presentacion: true,
            },
        })
    }, [closure])

    return {
        closure,
        ivaTotals,
        ivaByAlicuota,
        retencionesPercepciones,
        iibbSuggestedBase,
        generatedEntries,
        isLoading,
        isCalculating,
        refreshCalculations,
        updateSteps,
        updateIIBBTotals,
        updateMTTotals,
        updateAutonomosSettings,
        addOverride,
        removeOverride,
        generateEntry,
        closePeriod,
    }
}
