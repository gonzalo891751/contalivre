/**
 * ProveedoresAcreedoresPage - Gestión de Proveedores y Acreedores Varios
 *
 * Pantalla gemela de docs/prototypes/proveedores.html.
 * Toggle: Proveedores (2.1.01.01) / Acreedores Varios (2.1.06.01)
 * Tabs: Dashboard, Listado, Movimientos, Vencimientos
 * Datos reales desde Mayor (subcuentas hijas de cuenta control).
 */

import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    Truck,
    Briefcase,
    MagnifyingGlass,
    Plus,
    Invoice,
    Money,
    ClockCountdown,
    ListDashes,
    CaretRight,
    CaretDown,
    Receipt,
    Scroll,
    Bank,
    Info,
    ArrowsLeftRight,
} from '@phosphor-icons/react'
import { db } from '../../storage/db'
import { computeBalances } from '../../core/ledger/computeBalances'
import { createBienesMovement } from '../../storage/bienes'
import type { Account } from '../../core/models'
import type { CostingMethod } from '../../core/inventario/types'
import PerfeccionarModal from './PerfeccionarModal'
import type { PerfeccionarSaveData } from './PerfeccionarModal'

// Account codes for control accounts
const PROVEEDORES_CODE = '2.1.01.01'
const ACREEDORES_CODE = '2.1.06.01'

type ModuleMode = 'proveedores' | 'acreedores'
type TabName = 'dashboard' | 'listado' | 'movimientos' | 'vencimientos'

/** Format number as ARS currency */
const fmtCurrency = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)

/** Format ISO date to short locale string */
const fmtDate = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

/** Short date for vencimientos timeline */
const fmtDateShort = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return {
        month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(d).toUpperCase(),
        day: d.getDate(),
    }
}

/** Days until a date from today */
const daysUntil = (iso: string): number => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(iso + 'T12:00:00')
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** Derive tercero info from a child account and its balance */
interface TerceroRow {
    accountId: string
    name: string
    code: string
    balance: number // positive = owed to tercero (credit normal side for liability)
    status: 'ok' | 'pending' | 'overdue'
    nextDueDate: string | null
}

/** Pending document for vencimientos */
interface PendingDoc {
    movementId: string
    date: string
    counterparty: string
    reference: string
    total: number
    saldoPendiente: number
    dueDate: string | null
    paymentCondition?: string
    instrumentType?: string
    instrumentNumber?: string
    accountId: string | null // subcuenta ID
}

/** Instrument born from RECLASS (perfeccionamiento) */
interface ReclassInstrument {
    movementId: string
    sourceMovementId: string | null
    counterparty: string
    amount: number
    date: string
    dueDate: string | null
    instrumentType?: string
    instrumentNumber?: string
    instrumentBank?: string
}

export default function ProveedoresAcreedoresPage() {
    const navigate = useNavigate()
    const location = useLocation()

    // Read initial mode from location state if navigated with prefill
    const initialMode = (location.state as any)?.mode === 'acreedores' ? 'acreedores' : 'proveedores'
    const [mode, setMode] = useState<ModuleMode>(initialMode)
    const [activeTab, setActiveTab] = useState<TabName>('dashboard')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'pending' | 'overdue'>('all')

    const controlCode = mode === 'proveedores' ? PROVEEDORES_CODE : ACREEDORES_CODE

    // ---- Data Hooks ----
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray(), [])
    const entries = useLiveQuery(() => db.entries.toArray(), [])
    const movements = useLiveQuery(() => db.bienesMovements.toArray(), [])

    // Compute balances from ledger
    const balances = useMemo(() => {
        if (!accounts || !entries) return null
        return computeBalances(entries, accounts)
    }, [accounts, entries])

    // Find control account and its children
    const controlAccount = useMemo(() => {
        if (!accounts) return null
        return accounts.find(a => a.code === controlCode) || null
    }, [accounts, controlCode])

    const childAccounts = useMemo(() => {
        if (!accounts || !controlAccount) return []
        return accounts
            .filter(a => a.parentId === controlAccount.id && !a.isHeader)
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [accounts, controlAccount])

    // Build tercero rows from child accounts + balances
    const terceroRows = useMemo((): TerceroRow[] => {
        if (!balances || childAccounts.length === 0) return []

        return childAccounts.map(acc => {
            const accBal = balances.get(acc.id)
            const balance = accBal?.balance || 0

            // Check for overdue/pending from movements with dueDate
            let nextDueDate: string | null = null
            let status: TerceroRow['status'] = balance > 0 ? 'pending' : 'ok'

            if (movements) {
                const today = new Date().toISOString().split('T')[0]
                const accMovements = movements.filter(m =>
                    (m.type === 'PURCHASE' || m.type === 'PAYMENT') &&
                    m.counterparty &&
                    normalizeForCompare(m.counterparty) === normalizeForCompare(acc.name)
                )
                // Find closest dueDate from PURCHASE movements
                const dueDates = accMovements
                    .filter(m => m.type === 'PURCHASE' && (m as any).dueDate)
                    .map(m => (m as any).dueDate as string)
                    .sort()

                if (dueDates.length > 0) {
                    // Closest future or most recent past due
                    const futureDues = dueDates.filter(d => d >= today)
                    nextDueDate = futureDues.length > 0 ? futureDues[0] : dueDates[dueDates.length - 1]

                    if (nextDueDate && nextDueDate < today && balance > 0) {
                        status = 'overdue'
                    }
                }
            }

            return { accountId: acc.id, name: acc.name, code: acc.code, balance, status, nextDueDate }
        }).filter(t => t.balance !== 0 || true) // Show all terceros including zero balance
    }, [balances, childAccounts, movements])

    // Build pending docs (PURCHASE movements with saldo > 0)
    const pendingDocs = useMemo((): PendingDoc[] => {
        if (!movements || !accounts) return []

        const childAccountNames = new Set(childAccounts.map(a => normalizeForCompare(a.name)))
        const childAccountByName = new Map(childAccounts.map(a => [normalizeForCompare(a.name), a.id]))

        // Get PURCHASE movements for the current mode
        const purchases = movements.filter(m =>
            m.type === 'PURCHASE' &&
            !m.isDevolucion &&
            m.total > 0 &&
            m.counterparty
        ).filter(m => {
            // Filter by mode: check if the counterparty has a child account under our control
            const norm = normalizeForCompare(m.counterparty!)
            return childAccountNames.has(norm)
        })

        // Calculate payments for each purchase by sourceMovementId
        const paymentsBySource = new Map<string, number>()
        movements
            .filter(m => m.type === 'PAYMENT' && m.paymentDirection === 'PAGO' && m.sourceMovementId)
            .forEach(m => {
                const current = paymentsBySource.get(m.sourceMovementId!) || 0
                paymentsBySource.set(m.sourceMovementId!, current + m.total)
            })

        // Also handle legacy payments by notes/reference
        movements
            .filter(m => m.type === 'PAYMENT' && m.paymentDirection === 'PAGO' && !m.sourceMovementId && m.notes)
            .forEach(m => {
                const ref = m.notes || ''
                const current = paymentsBySource.get(ref) || 0
                paymentsBySource.set(ref, current + m.total)
            })

        // RECLASS amounts by source comprobante
        const reclassBySource = new Map<string, number>()
        movements
            .filter(m => m.type === 'RECLASS' && m.sourceMovementId)
            .forEach(m => {
                const current = reclassBySource.get(m.sourceMovementId!) || 0
                reclassBySource.set(m.sourceMovementId!, current + m.total)
            })

        const docs: PendingDoc[] = []
        for (const purchase of purchases) {
            const paidByLink = paymentsBySource.get(purchase.id) || 0
            const paidByRef = purchase.reference ? (paymentsBySource.get(purchase.reference) || 0) : 0
            const reclassed = reclassBySource.get(purchase.id) || 0
            const totalPaid = paidByLink + paidByRef
            const saldoPendiente = purchase.total - totalPaid - reclassed

            if (saldoPendiente <= 0.01) continue // fully paid (with epsilon)

            const norm = normalizeForCompare(purchase.counterparty!)
            docs.push({
                movementId: purchase.id,
                date: purchase.date,
                counterparty: purchase.counterparty!,
                reference: purchase.reference || purchase.id.slice(0, 8),
                total: purchase.total,
                saldoPendiente,
                dueDate: (purchase as any).dueDate || null,
                paymentCondition: (purchase as any).paymentCondition,
                instrumentType: (purchase as any).instrumentType,
                instrumentNumber: (purchase as any).instrumentNumber,
                accountId: childAccountByName.get(norm) || null,
            })
        }

        docs.sort((a, b) => {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
            if (a.dueDate) return -1
            if (b.dueDate) return 1
            return b.date.localeCompare(a.date)
        })

        return docs
    }, [movements, accounts, childAccounts])

    // Build RECLASS instruments for the expandable listado
    const reclassInstruments = useMemo((): ReclassInstrument[] => {
        if (!movements) return []
        return movements
            .filter(m => m.type === 'RECLASS' && (m.paymentMethod === 'proveedores' || m.paymentMethod === 'acreedores') && m.counterparty)
            .map(m => ({
                movementId: m.id,
                sourceMovementId: m.sourceMovementId || null,
                counterparty: m.counterparty!,
                amount: m.total,
                date: m.date,
                dueDate: (m as any).dueDate || null,
                instrumentType: (m as any).instrumentType,
                instrumentNumber: (m as any).instrumentNumber,
                instrumentBank: (m as any).instrumentBank,
            }))
    }, [movements])

    // KPIs
    const totalDebt = useMemo(() => terceroRows.reduce((sum, t) => sum + t.balance, 0), [terceroRows])

    const dueThisWeek = useMemo(() => {
        const today = new Date().toISOString().split('T')[0]
        const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
        return pendingDocs
            .filter(d => d.dueDate && d.dueDate >= today && d.dueDate <= weekLater)
            .reduce((sum, d) => sum + d.saldoPendiente, 0)
    }, [pendingDocs])

    const overdueOver90 = useMemo(() => {
        const today = new Date()
        return pendingDocs
            .filter(d => {
                if (!d.dueDate) return false
                const due = new Date(d.dueDate + 'T12:00:00')
                return (today.getTime() - due.getTime()) / 86400000 > 90
            })
            .reduce((sum, d) => sum + d.saldoPendiente, 0)
    }, [pendingDocs])

    // Filtered tercero list
    const filteredTerceros = useMemo(() => {
        let list = terceroRows
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(t => t.name.toLowerCase().includes(q) || t.code.includes(q))
        }
        if (statusFilter !== 'all') {
            list = list.filter(t => t.status === statusFilter)
        }
        return list
    }, [terceroRows, searchQuery, statusFilter])

    // All movements for the movimientos tab
    const allModuleMovements = useMemo(() => {
        if (!movements || !entries) return []
        const childIds = new Set(childAccounts.map(a => a.id))
        if (childIds.size === 0 && controlAccount) childIds.add(controlAccount.id)

        // Entries that touch any of our accounts
        return (entries || [])
            .filter(e => e.lines.some(l => childIds.has(l.accountId) || (controlAccount && l.accountId === controlAccount.id)))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 100)
    }, [entries, childAccounts, controlAccount, movements])

    // Navigation handlers
    const handlePay = useCallback((terceroName?: string, sourceMovementId?: string) => {
        navigate('/operaciones/inventario', {
            state: {
                prefillTab: 'pagos',
                prefillPaymentDirection: 'PAGO',
                prefillCounterparty: terceroName,
                prefillSourceMovementId: sourceMovementId,
            },
        })
    }, [navigate])

    const handleNewPurchase = useCallback(() => {
        navigate('/operaciones/inventario', {
            state: {
                prefillTab: mode === 'proveedores' ? 'compra' : 'compra',
                openModal: true,
            },
        })
    }, [navigate, mode])

    // Perfeccionar modal state
    const [perfeccionarOpen, setPerfeccionarOpen] = useState(false)
    const [perfeccionarTercero, setPerfeccionarTercero] = useState('')
    const [perfeccionarSourceId, setPerfeccionarSourceId] = useState<string | undefined>()
    const [perfeccionarAmount, setPerfeccionarAmount] = useState<number | undefined>()

    const handleOpenPerfeccionar = useCallback((terceroName: string, sourceMovementId?: string, defaultAmount?: number) => {
        setPerfeccionarTercero(terceroName)
        setPerfeccionarSourceId(sourceMovementId)
        setPerfeccionarAmount(defaultAmount)
        setPerfeccionarOpen(true)
    }, [])

    const handleSavePerfeccionar = useCallback(async (data: PerfeccionarSaveData) => {
        if (!perfeccionarTercero.trim()) {
            throw new Error('Selecciona un tercero')
        }

        const settings = await db.bienesSettings.get('bienes-settings')
        const costMethod: CostingMethod = settings?.costMethod || 'PPP'

        const paymentSplits = data.splits.map(s => ({
            accountId: s.accountId,
            amount: s.amount,
            method: s.instrumentType || 'Documento',
        }))

        const firstSplit = data.splits[0]

        await createBienesMovement({
            type: 'RECLASS',
            productId: '',
            date: data.date,
            quantity: 0,
            ivaRate: 0,
            ivaAmount: 0,
            subtotal: data.totalAmount,
            total: data.totalAmount,
            costMethod,
            counterparty: perfeccionarTercero.trim(),
            paymentMethod: mode,
            paymentSplits,
            autoJournal: true,
            linkedJournalEntryIds: [],
            notes: data.notes || `Perfeccionamiento de pasivo - ${perfeccionarTercero}`,
            reference: firstSplit?.instrumentNumber || undefined,
            dueDate: firstSplit?.dueDate || undefined,
            termDays: firstSplit?.termDays || undefined,
            instrumentType: firstSplit?.instrumentType || undefined,
            instrumentNumber: firstSplit?.instrumentNumber || undefined,
            instrumentBank: firstSplit?.instrumentBank || undefined,
            paymentCondition: 'DOCUMENTADO',
            sourceMovementId: data.sourceMovementId || undefined,
        })
    }, [perfeccionarTercero, mode])

    // Pending docs formatted for the modal
    const pendingDocsForModal = useMemo(() =>
        pendingDocs.map(d => ({
            movementId: d.movementId,
            date: d.date,
            counterparty: d.counterparty,
            reference: d.reference,
            total: d.total,
            saldoPendiente: d.saldoPendiente,
        })),
    [pendingDocs])

    const switchMode = useCallback((m: ModuleMode) => {
        setMode(m)
        setSearchQuery('')
        setStatusFilter('all')
        setActiveTab('dashboard')
    }, [])

    // --- Config ---
    const moduleTitle = mode === 'proveedores' ? 'Proveedores' : 'Acreedores Varios'
    const moduleDesc = mode === 'proveedores'
        ? 'Gestioná tus compras, cuentas corrientes y vencimientos.'
        : 'Gestioná deudas varias y gastos no operativos.'
    const ctaLabel = mode === 'proveedores' ? 'Registrar Compra' : 'Registrar Gasto'

    // ================================================================
    // RENDER
    // ================================================================

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 fade-in">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/operaciones')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                    >
                        <ArrowLeft size={14} weight="bold" /> Volver a Operaciones
                    </button>
                    <nav className="hidden md:flex text-slate-500 text-xs items-center gap-2">
                        <span className="text-slate-400">|</span>
                        <span>Operaciones</span>
                        <CaretRight size={10} className="text-slate-400" />
                        <span className="font-medium text-slate-900">{moduleTitle}</span>
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    {/* TOGGLE Proveedores / Acreedores */}
                    <div className="bg-slate-100 p-1 rounded-lg flex items-center">
                        <button
                            onClick={() => switchMode('proveedores')}
                            className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs transition-all ${mode === 'proveedores'
                                ? 'bg-white text-blue-600 shadow-sm font-semibold'
                                : 'text-slate-500 font-medium hover:text-slate-700 hover:bg-white/50'}`}
                        >
                            <Truck size={14} weight="bold" /> Proveedores
                        </button>
                        <button
                            onClick={() => switchMode('acreedores')}
                            className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs transition-all ${mode === 'acreedores'
                                ? 'bg-white text-blue-600 shadow-sm font-semibold'
                                : 'text-slate-500 font-medium hover:text-slate-700 hover:bg-white/50'}`}
                        >
                            <Briefcase size={14} weight="bold" /> Acreedores
                        </button>
                    </div>

                    <div className="h-6 w-px bg-slate-200" />

                    {/* CTA */}
                    <button
                        onClick={handleNewPurchase}
                        className="btn-primary px-4 py-2 rounded-md font-medium text-xs flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={14} weight="bold" />
                        {ctaLabel}
                    </button>
                </div>
            </div>

            {/* TITLE + KPIs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display font-bold text-3xl text-slate-900">{moduleTitle}</h1>
                    <p className="text-slate-500 mt-1">{moduleDesc}</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">
                            Deuda Total <span className="text-[9px] text-slate-300 ml-1">(Mayor)</span>
                        </div>
                        <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                            {fmtCurrency(totalDebt)}
                        </div>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-orange-400">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Vence esta semana</div>
                        <div className="font-mono text-lg font-bold text-orange-600 tabular-nums">
                            {fmtCurrency(dueThisWeek)}
                        </div>
                    </div>
                </div>
            </div>

            {/* TABS */}
            <div className="border-b border-slate-200 flex gap-6 overflow-x-auto">
                {([
                    { key: 'dashboard', label: 'Dashboard' },
                    { key: 'listado', label: 'Listado' },
                    { key: 'movimientos', label: 'Movimientos' },
                    { key: 'vencimientos', label: 'Vencimientos' },
                ] as const).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`pb-3 font-medium transition-colors whitespace-nowrap ${activeTab === tab.key
                            ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                            : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            {activeTab === 'dashboard' && (
                <DashboardTab
                    pendingDocsCount={pendingDocs.length}
                    totalDebt={totalDebt}
                    overdueOver90={overdueOver90}
                    pendingDocs={pendingDocs}
                />
            )}

            {activeTab === 'listado' && (
                <ListadoTab
                    terceros={filteredTerceros}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    onPay={handlePay}
                    onPerfeccionar={handleOpenPerfeccionar}
                    onNew={handleNewPurchase}
                    ctaLabel={mode === 'proveedores' ? 'Nuevo Proveedor (desde Compras)' : 'Nuevo Acreedor (desde Compras)'}
                    pendingDocs={pendingDocs}
                    reclassInstruments={reclassInstruments}
                />
            )}

            {activeTab === 'movimientos' && (
                <MovimientosTab
                    movements={allModuleMovements}
                    accounts={accounts || []}
                />
            )}

            {activeTab === 'vencimientos' && (
                <VencimientosTab
                    pendingDocs={pendingDocs}
                    onPay={handlePay}
                />
            )}

            {/* PERFECCIONAR MODAL */}
            <PerfeccionarModal
                open={perfeccionarOpen}
                onClose={() => setPerfeccionarOpen(false)}
                onSave={handleSavePerfeccionar}
                side={mode}
                terceroName={perfeccionarTercero}
                accounts={accounts || []}
                pendingDocs={pendingDocsForModal}
                initialSourceMovementId={perfeccionarSourceId}
                initialAmount={perfeccionarAmount}
                accentColor="amber"
                sourceLabel={mode === 'proveedores' ? 'Proveedores (2.1.01.01)' : 'Acreedores Varios (2.1.06.01)'}
                destControlCodes={['2.1.01.02', '2.1.01.04', '2.1.01.05']}
            />
        </div>
    )
}

// ================================================================
// SUB-COMPONENTS: TABS
// ================================================================

function DashboardTab({
    pendingDocsCount,
    totalDebt,
    overdueOver90,
    pendingDocs,
}: {
    pendingDocsCount: number
    totalDebt: number
    overdueOver90: number
    pendingDocs: PendingDoc[]
}) {
    // Aging buckets
    const aging = useMemo(() => {
        const today = new Date()
        const buckets = { d30: 0, d60: 0, d90: 0, d90plus: 0 }
        for (const doc of pendingDocs) {
            if (!doc.dueDate) { buckets.d30 += doc.saldoPendiente; continue }
            const due = new Date(doc.dueDate + 'T12:00:00')
            const daysPast = (today.getTime() - due.getTime()) / 86400000
            if (daysPast <= 30) buckets.d30 += doc.saldoPendiente
            else if (daysPast <= 60) buckets.d60 += doc.saldoPendiente
            else if (daysPast <= 90) buckets.d90 += doc.saldoPendiente
            else buckets.d90plus += doc.saldoPendiente
        }
        return buckets
    }, [pendingDocs])

    const maxAging = Math.max(aging.d30, aging.d60, aging.d90, aging.d90plus, 1)

    return (
        <div className="fade-in space-y-6">
            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Docs to pay */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xl">
                            <Invoice size={24} weight="duotone" />
                        </div>
                        <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-semibold border border-slate-200">Mensual</span>
                    </div>
                    <div className="text-slate-500 text-sm font-medium">Documentos a Pagar</div>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">{pendingDocsCount}</span>
                        <span className="text-xs text-slate-400">pendientes</span>
                    </div>
                </div>

                {/* Global balance */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xl">
                            <Money size={24} weight="duotone" />
                        </div>
                        <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-semibold border border-slate-200">Total</span>
                    </div>
                    <div className="text-slate-500 text-sm font-medium">
                        Saldo Global <span className="text-[10px] text-slate-400 font-normal">(Mayor)</span>
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">{fmtCurrency(totalDebt)}</div>
                </div>

                {/* Overdue +90 */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 text-xl">
                            <ClockCountdown size={24} weight="duotone" />
                        </div>
                        <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded text-xs font-semibold border border-orange-200">Crítico</span>
                    </div>
                    <div className="text-slate-500 text-sm font-medium">Vencido (+90 días)</div>
                    <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">{fmtCurrency(overdueOver90)}</div>
                </div>
            </div>

            {/* Aging chart */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-display font-semibold text-lg mb-6">Antigüedad de Deuda (Aging)</h3>
                <div className="flex flex-col gap-4">
                    {[
                        { label: '0-30d', value: aging.d30, color: 'bg-blue-500' },
                        { label: '31-60d', value: aging.d60, color: 'bg-blue-300' },
                        { label: '61-90d', value: aging.d90, color: 'bg-orange-300' },
                        { label: '+90d', value: aging.d90plus, color: 'bg-red-400' },
                    ].map(row => (
                        <div key={row.label} className="flex items-center gap-4 text-xs">
                            <span className="w-12 font-mono text-slate-500 text-right">{row.label}</span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${row.color} rounded-full transition-all`}
                                    style={{ width: `${Math.max((row.value / maxAging) * 100, 0)}%` }}
                                />
                            </div>
                            <span className="w-24 font-mono font-medium text-right tabular-nums">{fmtCurrency(row.value)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ListadoTab({
    terceros,
    searchQuery,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    onPay,
    onPerfeccionar,
    onNew,
    ctaLabel,
    pendingDocs,
    reclassInstruments,
}: {
    terceros: TerceroRow[]
    searchQuery: string
    onSearchChange: (q: string) => void
    statusFilter: 'all' | 'ok' | 'pending' | 'overdue'
    onStatusFilterChange: (f: 'all' | 'ok' | 'pending' | 'overdue') => void
    onPay: (name: string, sourceMovementId?: string) => void
    onPerfeccionar: (name: string, sourceMovementId?: string, defaultAmount?: number) => void
    onNew: () => void
    ctaLabel: string
    pendingDocs: PendingDoc[]
    reclassInstruments: ReclassInstrument[]
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const toggleExpand = useCallback((id: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const docsByTercero = useMemo(() => {
        const map = new Map<string, PendingDoc[]>()
        for (const doc of pendingDocs) {
            const key = normalizeForCompare(doc.counterparty)
            const arr = map.get(key) || []
            arr.push(doc)
            map.set(key, arr)
        }
        return map
    }, [pendingDocs])

    const instrumentsBySource = useMemo(() => {
        const map = new Map<string, ReclassInstrument[]>()
        for (const inst of reclassInstruments) {
            if (!inst.sourceMovementId) continue
            const arr = map.get(inst.sourceMovementId) || []
            arr.push(inst)
            map.set(inst.sourceMovementId, arr)
        }
        return map
    }, [reclassInstruments])

    const unlinkedInstrumentsByTercero = useMemo(() => {
        const map = new Map<string, ReclassInstrument[]>()
        for (const inst of reclassInstruments) {
            if (inst.sourceMovementId) continue
            const key = normalizeForCompare(inst.counterparty)
            const arr = map.get(key) || []
            arr.push(inst)
            map.set(key, arr)
        }
        return map
    }, [reclassInstruments])

    const today = new Date().toISOString().split('T')[0]

    return (
        <div className="fade-in space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-3">
                <Info size={18} weight="fill" className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-900">
                    <strong>Importante:</strong> Los terceros se crean automaticamente desde Compras/Pagos.
                    Los saldos se calculan desde el Libro Mayor (subcuenta control).
                    Expandi cada tercero para ver comprobantes e instrumentos.
                </p>
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="relative w-full md:w-80">
                    <MagnifyingGlass size={18} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Buscar por nombre, codigo..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => onStatusFilterChange(e.target.value as any)}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:border-blue-500 block p-2 px-3 shadow-sm cursor-pointer"
                    >
                        <option value="all">Todos los estados</option>
                        <option value="ok">Al dia</option>
                        <option value="pending">Con vencimientos</option>
                        <option value="overdue">Atrasado</option>
                    </select>
                    <button
                        onClick={onNew}
                        className="btn-primary px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2"
                    >
                        <Plus size={14} weight="bold" /> {ctaLabel}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                <th className="w-10 px-3 py-4" />
                                <th className="px-4 py-4">Entidad / Razon Social</th>
                                <th className="px-4 py-4 text-center">Estado</th>
                                <th className="px-4 py-4">Prox. Vencimiento</th>
                                <th className="px-4 py-4 text-right">Saldo (Mayor)</th>
                                <th className="px-4 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {terceros.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <MagnifyingGlass size={32} className="text-slate-400" weight="duotone" />
                                            </div>
                                            <h3 className="text-slate-900 font-medium mb-1">Sin resultados</h3>
                                            <p className="text-slate-500 text-xs">Registra una compra para crear un tercero automaticamente.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                terceros.map(t => {
                                    const isExpanded = expanded.has(t.accountId)
                                    const terceroDocs = docsByTercero.get(normalizeForCompare(t.name)) || []
                                    const terceroUnlinked = unlinkedInstrumentsByTercero.get(normalizeForCompare(t.name)) || []
                                    const hasSubRows = terceroDocs.length > 0 || terceroUnlinked.length > 0

                                    return (
                                        <React.Fragment key={t.accountId}>
                                            <tr
                                                className={`hover:bg-slate-50 transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50/50' : ''}`}
                                                onClick={() => hasSubRows && toggleExpand(t.accountId)}
                                            >
                                                <td className="px-3 py-4 text-center">
                                                    {hasSubRows ? (
                                                        <button className="text-slate-400 hover:text-slate-600 transition-transform">
                                                            {isExpanded
                                                                ? <CaretDown size={14} weight="bold" />
                                                                : <CaretRight size={14} weight="bold" />}
                                                        </button>
                                                    ) : <span className="w-[14px] inline-block" />}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center">
                                                        <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold mr-3 text-xs">
                                                            {t.name.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-slate-900">{t.name}</div>
                                                            <div className="text-xs text-slate-500 font-mono">{t.code}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <StatusBadge status={t.status} />
                                                </td>
                                                <td className="px-4 py-4 text-sm">
                                                    {t.nextDueDate ? <DueDateLabel iso={t.nextDueDate} /> : <span className="text-slate-400">—</span>}
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className={`font-mono font-medium tabular-nums ${t.balance > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                                                        {t.balance > 0 ? fmtCurrency(t.balance) : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-2">
                                                        {t.balance > 0 && (
                                                            <>
                                                                <button
                                                                    onClick={() => onPerfeccionar(t.name)}
                                                                    className="bg-white border border-slate-200 text-amber-600 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-50 hover:border-amber-200 transition-colors flex items-center gap-1"
                                                                    title="Perfeccionar pasivo (pasar a documentado)"
                                                                >
                                                                    <ArrowsLeftRight size={12} weight="bold" /> Perfeccionar
                                                                </button>
                                                                <button
                                                                    onClick={() => onPay(t.name)}
                                                                    className="bg-white border border-slate-200 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded hover:bg-blue-50 hover:border-blue-200 transition-colors"
                                                                >
                                                                    Pagar
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* EXPANDED: Comprobantes + Instrumentos */}
                                            {isExpanded && terceroDocs.map(doc => {
                                                const isOverdue = doc.dueDate ? doc.dueDate < today : false
                                                const days = doc.dueDate ? daysUntil(doc.dueDate) : null
                                                const isOver90 = days !== null && days < -90
                                                const docStatus = isOver90 ? '+90d' : isOverdue ? 'vencido' : 'al dia'
                                                const linkedInstruments = instrumentsBySource.get(doc.movementId) || []

                                                return (
                                                    <React.Fragment key={`doc-${doc.movementId}`}>
                                                        <tr className="bg-blue-50/30 border-t border-slate-100">
                                                            <td className="px-3 py-2" />
                                                            <td className="px-4 py-2" colSpan={2}>
                                                                <div className="flex items-center gap-2 pl-6">
                                                                    <Receipt size={14} className="text-slate-400 shrink-0" />
                                                                    <div>
                                                                        <span className="text-xs font-medium text-slate-700">{doc.reference}</span>
                                                                        <span className="text-[10px] text-slate-400 ml-2">{fmtDate(doc.date)}</span>
                                                                        {doc.dueDate && (
                                                                            <span className="text-[10px] text-slate-400 ml-2">Vto: {fmtDate(doc.dueDate)}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                                        docStatus === '+90d' ? 'bg-red-50 text-red-600' :
                                                                        docStatus === 'vencido' ? 'bg-orange-50 text-orange-600' :
                                                                        'bg-emerald-50 text-emerald-600'
                                                                    }`}>
                                                                        {docStatus === '+90d' ? '+90d' : docStatus === 'vencido' ? 'Vencido' : 'Al dia'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-right">
                                                                <span className="font-mono text-xs tabular-nums text-slate-700">{fmtCurrency(doc.saldoPendiente)}</span>
                                                                {doc.total !== doc.saldoPendiente && (
                                                                    <span className="text-[10px] text-slate-400 ml-1">(de {fmtCurrency(doc.total)})</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <button
                                                                        onClick={() => onPerfeccionar(t.name, doc.movementId, doc.saldoPendiente)}
                                                                        className="text-amber-600 text-[10px] font-semibold px-2 py-1 rounded hover:bg-amber-50 transition-colors flex items-center gap-1"
                                                                        title="Perfeccionar este comprobante"
                                                                    >
                                                                        <ArrowsLeftRight size={10} weight="bold" /> Perfeccionar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => onPay(t.name, doc.movementId)}
                                                                        className="text-blue-600 text-[10px] font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                                                    >
                                                                        Pagar
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {linkedInstruments.map(inst => {
                                                            const InstIcon = inst.instrumentType === 'PAGARE' ? Scroll
                                                                : (inst.instrumentType === 'ECHEQ' || inst.instrumentType === 'CHEQUE') ? Bank
                                                                : Receipt
                                                            return (
                                                                <tr key={`inst-${inst.movementId}`} className="bg-blue-50/15 border-t border-dashed border-slate-100">
                                                                    <td className="px-3 py-1.5" />
                                                                    <td className="px-4 py-1.5" colSpan={2}>
                                                                        <div className="flex items-center gap-2 pl-12">
                                                                            <InstIcon size={12} className="text-amber-500 shrink-0" />
                                                                            <span className="text-[10px] font-medium text-amber-700">
                                                                                {inst.instrumentType || 'Documento'}
                                                                                {inst.instrumentNumber && ` #${inst.instrumentNumber}`}
                                                                            </span>
                                                                            {inst.instrumentBank && (
                                                                                <span className="text-[10px] text-slate-400">{inst.instrumentBank}</span>
                                                                            )}
                                                                            {inst.dueDate && (
                                                                                <span className="text-[10px] text-slate-400">Vto: {fmtDate(inst.dueDate)}</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-1.5 text-right">
                                                                        <span className="font-mono text-[10px] tabular-nums text-amber-600">{fmtCurrency(inst.amount)}</span>
                                                                    </td>
                                                                    <td className="px-4 py-1.5" />
                                                                </tr>
                                                            )
                                                        })}
                                                    </React.Fragment>
                                                )
                                            })}

                                            {isExpanded && terceroUnlinked.map(inst => {
                                                const InstIcon = inst.instrumentType === 'PAGARE' ? Scroll
                                                    : (inst.instrumentType === 'ECHEQ' || inst.instrumentType === 'CHEQUE') ? Bank
                                                    : Receipt
                                                return (
                                                    <tr key={`uinst-${inst.movementId}`} className="bg-blue-50/15 border-t border-dashed border-slate-100">
                                                        <td className="px-3 py-1.5" />
                                                        <td className="px-4 py-1.5" colSpan={2}>
                                                            <div className="flex items-center gap-2 pl-6">
                                                                <InstIcon size={12} className="text-amber-500 shrink-0" />
                                                                <span className="text-[10px] font-medium text-amber-700">
                                                                    {inst.instrumentType || 'Documento'}
                                                                    {inst.instrumentNumber && ` #${inst.instrumentNumber}`}
                                                                </span>
                                                                {inst.instrumentBank && (
                                                                    <span className="text-[10px] text-slate-400">{inst.instrumentBank}</span>
                                                                )}
                                                                {inst.dueDate && (
                                                                    <span className="text-[10px] text-slate-400">Vto: {fmtDate(inst.dueDate)}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-1.5 text-right">
                                                            <span className="font-mono text-[10px] tabular-nums text-amber-600">{fmtCurrency(inst.amount)}</span>
                                                        </td>
                                                        <td className="px-4 py-1.5" />
                                                    </tr>
                                                )
                                            })}
                                        </React.Fragment>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function MovimientosTab({
    movements,
    accounts,
}: {
    movements: { id: string; date: string; memo: string; lines: { accountId: string; debit: number; credit: number; description?: string }[] }[]
    accounts: Account[]
}) {
    const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])

    if (movements.length === 0) {
        return (
            <div className="fade-in">
                <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
                    <ListDashes size={48} className="text-blue-600 mx-auto mb-4" weight="duotone" />
                    <h3 className="font-display font-semibold text-lg text-slate-900">Historial de Movimientos</h3>
                    <p className="text-slate-500 max-w-md mx-auto mt-2">
                        Acá vas a ver todas las facturas, pagos y ajustes realizados históricamente.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="fade-in space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Descripción</th>
                                <th className="px-6 py-3">Cuenta</th>
                                <th className="px-6 py-3 text-right">Debe</th>
                                <th className="px-6 py-3 text-right">Haber</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {movements.map(entry => (
                                entry.lines.map((line, idx) => {
                                    const acc = accountMap.get(line.accountId)
                                    return (
                                        <tr key={`${entry.id}-${idx}`} className="hover:bg-slate-50">
                                            <td className="px-6 py-2.5 text-slate-600 font-mono text-xs tabular-nums">
                                                {idx === 0 ? fmtDate(entry.date) : ''}
                                            </td>
                                            <td className="px-6 py-2.5 text-slate-700">
                                                {idx === 0 ? entry.memo : <span className="text-slate-400 text-xs">{line.description || ''}</span>}
                                            </td>
                                            <td className="px-6 py-2.5 text-slate-600 text-xs">
                                                {acc ? `${acc.code} ${acc.name}` : line.accountId.slice(0, 8)}
                                            </td>
                                            <td className="px-6 py-2.5 text-right font-mono tabular-nums text-xs">
                                                {line.debit > 0 ? fmtCurrency(line.debit) : ''}
                                            </td>
                                            <td className="px-6 py-2.5 text-right font-mono tabular-nums text-xs">
                                                {line.credit > 0 ? fmtCurrency(line.credit) : ''}
                                            </td>
                                        </tr>
                                    )
                                })
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function VencimientosTab({
    pendingDocs,
    onPay,
}: {
    pendingDocs: PendingDoc[]
    onPay: (name: string, sourceMovementId?: string) => void
}) {
    if (pendingDocs.length === 0) {
        return (
            <div className="fade-in text-center py-8 text-slate-400 text-sm">
                No hay vencimientos pendientes.
            </div>
        )
    }

    const today = new Date().toISOString().split('T')[0]

    return (
        <div className="fade-in space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="font-display font-semibold text-lg">Agenda de Pagos</h2>
                <div className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Vencido</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Esta semana</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Vigente</span>
                </div>
            </div>

            <div className="space-y-4">
                {pendingDocs.map(doc => {
                    const isOverdue = doc.dueDate ? doc.dueDate < today : false
                    const days = doc.dueDate ? daysUntil(doc.dueDate) : null
                    const isThisWeek = days !== null && days >= 0 && days <= 7
                    const borderColor = isOverdue ? 'border-l-red-500' : isThisWeek ? 'border-l-orange-400' : 'border-l-slate-300'

                    const icon = doc.instrumentType === 'PAGARE' ? Scroll :
                        doc.instrumentType === 'ECHEQ' || doc.instrumentType === 'CHEQUE' ? Bank : Receipt

                    const IconComp = icon

                    return (
                        <div
                            key={doc.movementId}
                            className={`bg-white p-4 rounded-lg shadow-sm border border-slate-200 border-l-4 ${borderColor} flex items-center justify-between hover:shadow-md transition-shadow`}
                        >
                            <div className="flex items-center gap-4">
                                {doc.dueDate ? (
                                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-slate-50 rounded border border-slate-100">
                                        <span className="text-[10px] text-slate-500 uppercase font-bold">{fmtDateShort(doc.dueDate).month}</span>
                                        <span className="text-lg font-bold text-slate-900 font-mono leading-none">{fmtDateShort(doc.dueDate).day}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-slate-50 rounded border border-slate-100">
                                        <span className="text-[10px] text-slate-400">S/V</span>
                                    </div>
                                )}
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">{doc.counterparty}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                        <IconComp size={12} />
                                        {doc.reference}
                                        {doc.paymentCondition && (
                                            <span className="ml-2 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                {doc.paymentCondition === 'CTA_CTE' ? 'Cta. Cte.'
                                                    : doc.paymentCondition === 'DOCUMENTADO' ? 'Documentado'
                                                        : 'Contado'}
                                            </span>
                                        )}
                                    </div>
                                    {doc.dueDate && (
                                        <div className="text-[10px] mt-0.5">
                                            {isOverdue ? (
                                                <span className="text-red-500 font-medium">Vencido hace {Math.abs(days!)}d</span>
                                            ) : isThisWeek ? (
                                                <span className="text-orange-500 font-medium">Vence en {days}d</span>
                                            ) : (
                                                <span className="text-slate-400">En {days}d</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`font-mono font-bold tabular-nums ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                                    {fmtCurrency(doc.saldoPendiente)}
                                </div>
                                <button
                                    onClick={() => onPay(doc.counterparty, doc.movementId)}
                                    className="text-[10px] font-medium text-blue-600 hover:underline mt-1"
                                >
                                    Registrar Pago
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ================================================================
// UTILITY COMPONENTS
// ================================================================

function StatusBadge({ status }: { status: TerceroRow['status'] }) {
    const config = {
        ok: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'Al Día' },
        pending: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'Vencimientos' },
        overdue: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', label: 'Atrasado' },
    }[status]

    return (
        <span className={`${config.bg} ${config.text} px-2.5 py-0.5 rounded text-xs font-semibold border ${config.border}`}>
            {config.label}
        </span>
    )
}

function DueDateLabel({ iso }: { iso: string }) {
    const days = daysUntil(iso)
    const text = fmtDate(iso)
    if (days < 0) return <span className="text-red-500 font-medium">{text} (Hace {Math.abs(days)}d)</span>
    if (days <= 7) return <span className="text-orange-500 font-medium">{text} (En {days}d)</span>
    return <span className="text-slate-600">{text}</span>
}

/** Normalize name for comparison: lowercase, trim, collapse spaces, remove accents */
function normalizeForCompare(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}
