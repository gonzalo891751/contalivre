/**
 * Hook for managing tax closure state
 * Uses Dexie liveQuery for reactive updates
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
    TaxObligationSummary,
    TaxPaymentLink,
    TaxSettlementObligation,
    TaxType,
} from '../core/impuestos/types'
import {
    getTaxClosure,
    ensureTaxClosure,
    updateTaxClosure,
    calculateIVAFromEntries,
    calculateIVAByAlicuota,
    getRetencionesPercepciones,
    calculateIIBBSuggestedBase,
    buildTaxEntryPreview,
    saveTaxEntryFromPreview,
    generateIVAEntry,
    generateIIBBEntry,
    generateMonotributoEntry,
    generateAutonomosEntry,
    getGeneratedEntriesForClosure,
    generateNotificationsForMonth,
    syncAutonomosNotification,
    listTaxObligationsWithPayments,
    listTaxPaymentsForSettlement,
    registerTaxSettlement,
    buildTaxSettlementEntryPreview,
    syncAgentDepositObligations,
} from '../storage/impuestos'
import type { RegisterTaxPaymentInput, TaxPaymentPreviewResult } from '../storage/impuestos'
import { db } from '../storage/db'
import type { JournalEntry } from '../core/models'
import type { TaxEntryType } from '../storage/impuestos'
import { buildTaxSettlementObligationId, computeTaxSettlementRemaining } from '../core/impuestos/settlements'
import { computeTaxObligationStatus } from '../core/impuestos/obligations'

export interface UseTaxClosureReturn {
    // Data
    closure: TaxClosePeriod | null
    ivaTotals: IVATotals | null
    ivaByAlicuota: IVAAlicuotaDetail[]
    retencionesPercepciones: RetencionPercepcionRow[]
    iibbSuggestedBase: number
    generatedEntries: JournalEntry[]
    taxObligations: TaxSettlementObligation[]

    // Loading states
    isLoading: boolean
    isCalculating: boolean
    isLocked: boolean

    // Actions
    refreshCalculations: () => Promise<void>
    updateSteps: (steps: Partial<TaxClosePeriod['steps']>) => Promise<void>
    updateIIBBTotals: (totals: IIBBTotals) => Promise<void>
    updateMTTotals: (categoria: string, monto: number) => Promise<void>
    updateAutonomosSettings: (settings: AutonomosSettings) => Promise<void>
    addOverride: (override: Omit<TaxOverrideRow, 'id'>) => Promise<void>
    removeOverride: (id: string) => Promise<void>
    buildEntryPreview: (
        type: TaxEntryType,
        override?: Partial<TaxClosePeriod>
    ) => Promise<{ entry?: Omit<JournalEntry, 'id'>; error?: string }>
    saveEntryFromPreview: (type: TaxEntryType, entry: Omit<JournalEntry, 'id'>) => Promise<{ success: boolean; error?: string }>
    generateEntry: (type: TaxEntryType, entry?: Omit<JournalEntry, 'id'>) => Promise<{ success: boolean; error?: string }>
    getObligationsByPeriod: (taxPeriod: string) => Promise<TaxSettlementObligation[]>
    getPaymentsByObligation: (obligation: TaxSettlementObligation) => Promise<TaxPaymentLink[]>
    buildSettlementPreview: (
        obligation: TaxSettlementObligation,
        payload: RegisterTaxPaymentInput
    ) => Promise<TaxPaymentPreviewResult>
    registerTaxSettlement: (
        obligation: TaxSettlementObligation,
        payload: RegisterTaxPaymentInput
    ) => Promise<{ success: boolean; error?: string; missingAccountLabel?: string; entryId?: string }>
    closePeriod: () => Promise<void>
    unlockPeriod: () => Promise<void>
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
    const notificationsSignatureRef = useRef<string | null>(null)

    const resolveEntryType = (entry: JournalEntry): TaxEntryType | null => {
        const meta = entry.metadata || {}
        const raw = (meta.taxType || meta.meta?.tax) as string | undefined
        const normalized = raw ? raw.toUpperCase() : ''
        if (normalized === 'IVA') return 'iva'
        if (normalized === 'IIBB' || normalized === 'IIBB_LOCAL' || normalized === 'IIBB_CM') return 'iibb'
        if (normalized === 'MONOTRIBUTO') return 'mt'
        if (normalized === 'AUTONOMOS') return 'autonomos'
        if (entry.sourceId?.startsWith('iva:')) return 'iva'
        if (entry.sourceId?.startsWith('iibb:')) return 'iibb'
        if (entry.sourceId?.startsWith('mt:')) return 'mt'
        if (entry.sourceId?.startsWith('autonomos:')) return 'autonomos'
        return null
    }

    const getMonthRange = (value: string) => {
        const [year, monthNum] = value.split('-').map(Number)
        const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
        const lastDay = new Date(year, monthNum, 0).getDate()
        const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        return { start, end }
    }

    const resolveSourceEntryId = (
        taxType: TaxType,
        closureDoc: TaxClosePeriod | null,
        entries: JournalEntry[]
    ): string | undefined => {
        if (closureDoc?.journalEntryIds) {
            if (taxType === 'IVA' && closureDoc.journalEntryIds.iva) return closureDoc.journalEntryIds.iva
            if (taxType === 'IIBB' && closureDoc.journalEntryIds.iibb) return closureDoc.journalEntryIds.iibb
            if (taxType === 'MONOTRIBUTO' && closureDoc.journalEntryIds.mt) return closureDoc.journalEntryIds.mt
            if (taxType === 'AUTONOMOS' && closureDoc.journalEntryIds.autonomos) return closureDoc.journalEntryIds.autonomos
        }

        const entry = entries.find(candidate => {
            const meta = candidate.metadata || {}
            const raw = (meta.taxType || meta.meta?.tax) as string | undefined
            const normalized = raw ? raw.toUpperCase() : ''
            if (taxType === 'IVA' && normalized === 'IVA') return true
            if (taxType === 'IIBB' && (normalized === 'IIBB' || normalized === 'IIBB_LOCAL' || normalized === 'IIBB_CM')) return true
            if (taxType === 'MONOTRIBUTO' && normalized === 'MONOTRIBUTO') return true
            if (taxType === 'AUTONOMOS' && normalized === 'AUTONOMOS') return true

            if (taxType === 'IVA' && candidate.sourceId?.startsWith('iva:')) return true
            if (taxType === 'IIBB' && candidate.sourceId?.startsWith('iibb:')) return true
            if (taxType === 'MONOTRIBUTO' && candidate.sourceId?.startsWith('mt:')) return true
            if (taxType === 'AUTONOMOS' && candidate.sourceId?.startsWith('autonomos:')) return true
            return false
        })

        return entry?.id
    }

    const matchesSettlementPayment = (
        payment: TaxPaymentLink,
        obligation: TaxSettlementObligation
    ): boolean => {
        const paymentDirection = payment.direction || 'PAYABLE'
        if (paymentDirection !== obligation.direction) return false

        const primaryId = obligation.sourceObligationId || obligation.id
        if (payment.obligationId === primaryId || payment.obligationId === obligation.id) return true

        if (payment.taxType && payment.periodKey) {
            if (payment.taxType === obligation.tax && payment.periodKey === obligation.periodKey) {
                return true
            }
        }

        if (payment.sourceTaxEntryId && obligation.sourceTaxEntryId) {
            return payment.sourceTaxEntryId === obligation.sourceTaxEntryId
        }

        return false
    }

    const computeSettlementAmount = (
        payments: TaxPaymentLink[],
        obligation: TaxSettlementObligation
    ): number => {
        return payments
            .filter(payment => matchesSettlementPayment(payment, obligation))
            .reduce((sum, payment) => sum + (payment.amount || 0), 0)
    }

    const buildSettlementObligations = (
        payables: TaxObligationSummary[],
        ivaTotalsInput: IVATotals | null,
        periodKey: string,
        closureDoc: TaxClosePeriod | null,
        entries: JournalEntry[],
        payments: TaxPaymentLink[]
    ): TaxSettlementObligation[] => {
        const buildPayable = (obligation: TaxObligationSummary): TaxSettlementObligation => {
            const sourceTaxEntryId = resolveSourceEntryId(obligation.taxType as TaxType, closureDoc, entries)
            const settlementId = buildTaxSettlementObligationId({
                tax: obligation.taxType as TaxType,
                periodKey: obligation.taxPeriod,
                direction: 'PAYABLE',
                jurisdiction: obligation.jurisdiction,
                sourceTaxEntryId,
            })

            const base: TaxSettlementObligation = {
                id: settlementId,
                tax: obligation.taxType as TaxType,
                direction: 'PAYABLE',
                amountTotal: obligation.amountDue,
                amountSettled: 0,
                amountRemaining: 0,
                periodKey: obligation.taxPeriod,
                suggestedDueDate: obligation.dueDate,
                jurisdiction: obligation.jurisdiction,
                sourceTaxEntryId,
                sourceObligationId: obligation.id,
                status: obligation.status,
            }

            const amountSettled = computeSettlementAmount(payments, base)
            const amountRemaining = computeTaxSettlementRemaining(base.amountTotal, amountSettled)
            const status = computeTaxObligationStatus(base.amountTotal, amountSettled)

            return {
                ...base,
                amountSettled,
                amountRemaining,
                status,
            }
        }

        const obligations: TaxSettlementObligation[] = (payables || []).map(buildPayable)

        if ((ivaTotalsInput?.saldo || 0) < 0) {
            const amountTotal = Math.abs(ivaTotalsInput?.saldo || 0)
            const sourceTaxEntryId = resolveSourceEntryId('IVA', closureDoc, entries)
            const settlementId = buildTaxSettlementObligationId({
                tax: 'IVA',
                periodKey,
                direction: 'RECEIVABLE',
                jurisdiction: 'NACIONAL',
                sourceTaxEntryId,
            })

            const base: TaxSettlementObligation = {
                id: settlementId,
                tax: 'IVA',
                direction: 'RECEIVABLE',
                amountTotal,
                amountSettled: 0,
                amountRemaining: 0,
                periodKey,
                suggestedDueDate: undefined,
                jurisdiction: 'NACIONAL',
                sourceTaxEntryId,
                status: 'PENDING',
            }

            const amountSettled = computeSettlementAmount(payments, base)
            const amountRemaining = computeTaxSettlementRemaining(amountTotal, amountSettled)
            const status = computeTaxObligationStatus(amountTotal, amountSettled)

            obligations.push({
                ...base,
                amountSettled,
                amountRemaining,
                status,
            })
        }

        return obligations
    }

    const entriesVersion = useLiveQuery(async () => {
        if (!month) return []
        const { start, end } = getMonthRange(month)
        return db.entries.where('date').between(start, end, true, true).toArray()
    }, [month])

    const movementsVersion = useLiveQuery(async () => {
        if (!month) return []
        const { start, end } = getMonthRange(month)
        return db.bienesMovements.where('date').between(start, end, true, true).primaryKeys()
    }, [month])

    const accountsVersion = useLiveQuery(async () => db.accounts.toCollection().primaryKeys(), [])

    const payableObligations = useLiveQuery(async () => {
        if (!month) return []
        return listTaxObligationsWithPayments(month)
    }, [month], [])

    const taxPayments = useLiveQuery(async () => {
        const payments = await db.taxPayments.toArray()
        if (payments.length === 0) return []
        const entries = await db.entries.bulkGet(payments.map(p => p.journalEntryId))
        return payments.filter((_payment, idx) => entries[idx])
    }, [], [])

    // Live query for the closure document
    const closure = useLiveQuery(
        () => {
            if (!month) return null
            return getTaxClosure(month, regime)
        },
        [month, regime],
        null
    )
    const isLocked = closure?.status === 'CLOSED'

    const taxObligations = useMemo(() => {
        if (!month) return []

        return buildSettlementObligations(
            (payableObligations || []) as TaxObligationSummary[],
            ivaTotals,
            month,
            closure ?? null,
            generatedEntries || [],
            (taxPayments || []) as TaxPaymentLink[]
        )
    }, [month, payableObligations, ivaTotals, closure, generatedEntries, taxPayments])

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
            const [ivaComputed, byAlicuota, retPerc, suggestedBase, entries] = await Promise.all([
                calculateIVAFromEntries(month),
                calculateIVAByAlicuota(month),
                getRetencionesPercepciones(month),
                calculateIIBBSuggestedBase(month),
                getGeneratedEntriesForClosure(month, regime),
            ])

            const currentClosure = closureRef.current
            const locked = currentClosure?.status === 'CLOSED'
            const snapshotIva = currentClosure?.snapshot?.ivaTotals || currentClosure?.ivaTotals || null

            setIvaTotals(locked && snapshotIva ? snapshotIva : ivaComputed)
            setIvaByAlicuota(byAlicuota)
            setRetencionesPercepciones(retPerc)
            setIibbSuggestedBase(suggestedBase)
            setGeneratedEntries(entries)

            if (currentClosure) {
                const updates: Partial<Omit<TaxClosePeriod, 'id'>> = {}

                if (!locked) {
                    updates.ivaTotals = ivaComputed
                }

                const journalEntryIds = { ...(currentClosure.journalEntryIds || {}) }
                const derivedIds: Record<string, string> = {}

                for (const entry of entries) {
                    const type = resolveEntryType(entry)
                    if (type) {
                        derivedIds[type] = entry.id
                    }
                }

                let idsChanged = false
                Object.entries(derivedIds).forEach(([key, value]) => {
                    if ((journalEntryIds as Record<string, string | undefined>)[key] !== value) {
                        ;(journalEntryIds as Record<string, string>)[key] = value
                        idsChanged = true
                    }
                })

                const existingIds = new Set(entries.map(entry => entry.id))
                for (const [key, value] of Object.entries(journalEntryIds)) {
                    if (value && !existingIds.has(value)) {
                        delete (journalEntryIds as Record<string, string>)[key]
                        idsChanged = true
                    }
                }

                if (idsChanged) {
                    updates.journalEntryIds = journalEntryIds
                    if (!locked) {
                        updates.steps = {
                            ...currentClosure.steps,
                            asientos: entries.length > 0,
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await updateTaxClosure(currentClosure.id, updates)
                }
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
        const signature = JSON.stringify({
            month,
            regime,
            includeAgentDeposits,
            includeIIBBCM,
            hasAutonomos: closure.autonomosSettings?.enabled,
            autonomosDueDay: closure.autonomosSettings?.dueDay,
            iibbJurisdiction: closure.iibbTotals?.jurisdiction || null,
        })
        if (notificationsSignatureRef.current === signature) {
            return
        }
        notificationsSignatureRef.current = signature

        generateNotificationsForMonth(month, regime, {
            hasAutonomos: closure.autonomosSettings?.enabled,
            autonomosDueDay: closure.autonomosSettings?.dueDay,
            includeAgentDeposits,
            includeIIBBCM,
            iibbJurisdiction: closure.iibbTotals?.jurisdiction,
        }).catch(console.error)
    }, [
        closure?.id,
        month,
        regime,
        closure?.autonomosSettings?.enabled,
        closure?.autonomosSettings?.dueDay,
        closure?.iibbCMJurisdictions?.length,
        closure?.iibbTotals?.jurisdiction,
        retencionesPercepciones,
    ])

    useEffect(() => {
        if (!month) return
        syncAgentDepositObligations(month, retencionesPercepciones, closure?.iibbTotals?.jurisdiction)
            .catch(console.error)
    }, [month, retencionesPercepciones, closure?.iibbTotals?.jurisdiction])

    // Update steps
    const updateSteps = useCallback(async (steps: Partial<TaxClosePeriod['steps']>) => {
        if (!closure) return
        if (closure.status === 'CLOSED') return

        await updateTaxClosure(closure.id, {
            steps: { ...closure.steps, ...steps },
        })
    }, [closure])

    // Update IIBB totals
    const updateIIBBTotals = useCallback(async (totals: IIBBTotals) => {
        if (!closure) return
        if (closure.status === 'CLOSED') return

        await updateTaxClosure(closure.id, { iibbTotals: totals })
    }, [closure])

    // Update MT totals
    const updateMTTotals = useCallback(async (categoria: string, monto: number) => {
        if (!closure) return
        if (closure.status === 'CLOSED') return

        await updateTaxClosure(closure.id, {
            mtTotals: { categoria, montoMensual: monto },
        })
    }, [closure])

    // Update Autónomos settings (RI only)
    const updateAutonomosSettings = useCallback(async (settings: AutonomosSettings) => {
        if (!closure) return
        if (closure.regime !== 'RI') return // Only for Responsable Inscripto
        if (closure.status === 'CLOSED') return

        await updateTaxClosure(closure.id, { autonomosSettings: settings })

        // Sync notification based on enabled status
        await syncAutonomosNotification(month, settings.enabled, settings.dueDay)
    }, [closure, month])

    // Add manual override
    const addOverride = useCallback(async (override: Omit<TaxOverrideRow, 'id'>) => {
        if (!closure) return
        if (closure.status === 'CLOSED') return

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
        if (closure.status === 'CLOSED') return

        await updateTaxClosure(closure.id, {
            overrides: (closure.overrides || []).filter(o => o.id !== id),
        })
    }, [closure])

    const buildEntryPreview = useCallback(async (type: TaxEntryType, override?: Partial<TaxClosePeriod>) => {
        if (!closure) {
            return { error: 'No hay cierre cargado' }
        }
        if (closure.status === 'CLOSED') {
            return { error: 'El periodo esta cerrado. Desbloquealo para generar asientos.' }
        }
        const closureInput = override ? { ...closure, ...override } : closure
        return buildTaxEntryPreview(closureInput, type)
    }, [closure])

    const saveEntryFromPreview = useCallback(async (type: TaxEntryType, entry: Omit<JournalEntry, 'id'>) => {
        if (!closure) return { success: false, error: 'No hay cierre cargado' }
        if (closure.status === 'CLOSED') {
            return { success: false, error: 'El periodo esta cerrado. Desbloquealo para generar asientos.' }
        }

        const result = await saveTaxEntryFromPreview(closure, type, entry)
        if (result.error) {
            return { success: false, error: result.error }
        }

        const journalEntryIds = { ...closure.journalEntryIds, [type]: result.entryId }
        await updateTaxClosure(closure.id, {
            journalEntryIds,
            steps: { ...closure.steps, asientos: true },
        })

        const entries = await getGeneratedEntriesForClosure(month, regime)
        setGeneratedEntries(entries)

        return { success: true }
    }, [closure, month, regime])

    // Generate entry
    const generateEntry = useCallback(async (
        type: TaxEntryType,
        entry?: Omit<JournalEntry, 'id'>
    ): Promise<{ success: boolean; error?: string }> => {
        if (!closure) return { success: false, error: 'No hay cierre cargado' }
        if (closure.status === 'CLOSED') {
            return { success: false, error: 'El periodo esta cerrado. Desbloquealo para generar asientos.' }
        }

        let result: { entryId: string; error?: string }

        if (entry) {
            result = await saveTaxEntryFromPreview(closure, type, entry)
        } else {
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

    const getObligationsByPeriod = useCallback(async (taxPeriod: string) => {
        const [payables, computedIva, closureDoc, generated, payments] = await Promise.all([
            listTaxObligationsWithPayments(taxPeriod),
            calculateIVAFromEntries(taxPeriod),
            getTaxClosure(taxPeriod, regime),
            getGeneratedEntriesForClosure(taxPeriod, regime),
            db.taxPayments.toArray(),
        ])

        const ivaTotalsForPeriod = closureDoc?.status === 'CLOSED'
            ? (closureDoc.snapshot?.ivaTotals || closureDoc.ivaTotals || computedIva)
            : computedIva

        return buildSettlementObligations(
            payables,
            ivaTotalsForPeriod,
            taxPeriod,
            closureDoc ?? null,
            generated,
            payments
        )
    }, [buildSettlementObligations, regime])

    const getPaymentsByObligation = useCallback(async (obligation: TaxSettlementObligation) => {
        return listTaxPaymentsForSettlement(obligation)
    }, [])

    const buildSettlementPreview = useCallback(async (
        obligation: TaxSettlementObligation,
        payload: RegisterTaxPaymentInput
    ) => {
        return buildTaxSettlementEntryPreview(obligation, payload)
    }, [])

    const registerSettlement = useCallback(async (
        obligation: TaxSettlementObligation,
        payload: RegisterTaxPaymentInput
    ): Promise<{ success: boolean; error?: string; missingAccountLabel?: string; entryId?: string }> => {
        const result = await registerTaxSettlement(obligation, payload)
        if (result.error) {
            return { success: false, error: result.error, missingAccountLabel: result.missingAccountLabel }
        }
        return { success: true, entryId: result.entryId }
    }, [])

    // Close period
    const closePeriod = useCallback(async () => {
        if (!closure) return
        if (closure.status === 'CLOSED') return

        const now = new Date().toISOString()
        const snapshot = {
            ivaTotals: ivaTotals || closure.ivaTotals,
            iibbTotals: closure.iibbTotals,
            mtTotals: closure.mtTotals,
            autonomosSettings: closure.autonomosSettings,
            journalEntryIds: closure.journalEntryIds,
            capturedAt: now,
        }

        await updateTaxClosure(closure.id, {
            status: 'CLOSED',
            closedAt: now,
            snapshot,
            auditTrail: [
                ...(closure.auditTrail || []),
                { action: 'CLOSED', timestamp: now },
            ],
            steps: {
                ...closure.steps,
                presentacion: true,
            },
        })
    }, [closure, ivaTotals])

    const unlockPeriod = useCallback(async () => {
        if (!closure) return
        if (closure.status !== 'CLOSED') return

        const now = new Date().toISOString()
        await updateTaxClosure(closure.id, {
            status: 'OPEN',
            auditTrail: [
                ...(closure.auditTrail || []),
                { action: 'UNLOCKED', timestamp: now },
            ],
        })
    }, [closure])

    return {
        closure: closure ?? null,
        ivaTotals,
        ivaByAlicuota,
        retencionesPercepciones,
        iibbSuggestedBase,
        generatedEntries,
        isLoading,
        isCalculating,
        isLocked,
        refreshCalculations,
        updateSteps,
        updateIIBBTotals,
        updateMTTotals,
        updateAutonomosSettings,
        addOverride,
        removeOverride,
        buildEntryPreview,
        saveEntryFromPreview,
        generateEntry,
        taxObligations: (taxObligations || []) as TaxSettlementObligation[],
        getObligationsByPeriod,
        getPaymentsByObligation,
        buildSettlementPreview,
        registerTaxSettlement: registerSettlement,
        closePeriod,
        unlockPeriod,
    }
}
