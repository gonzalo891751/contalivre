import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../../../storage/db'
import { addFxDebtPayment, createFxMovement, getAllFxAccounts } from '../../../storage'
import type { Account } from '../../../core/models'
import type { FxDebt } from '../../../core/monedaExtranjera/types'

const formatCurrencyARS = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

interface LoanPaymentModalProps {
    open: boolean
    onClose: () => void
    debt: FxDebt
    ledgerAccounts: Account[]
    oficialRate: number
    periodId: string
    defaultDate: string
    onSuccess: (msg: string) => void
}

export default function LoanPaymentModal({
    open,
    onClose,
    debt,
    ledgerAccounts,
    oficialRate,
    periodId,
    defaultDate,
    onSuccess,
}: LoanPaymentModalProps) {
    const isARS = debt.currency === 'ARS'
    const fxAccounts = useLiveQuery(() => getAllFxAccounts(periodId), [periodId]) || []
    const debtMovements = useLiveQuery(() => db.fxMovements.where('debtId').equals(debt.id).toArray(), [debt.id]) || []

    const [mode, setMode] = useState<'cuota' | 'libre' | 'total'>('cuota')
    const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState(0)
    const [totalARS, setTotalARS] = useState(0)
    const [rate, setRate] = useState(isARS ? 1 : oficialRate)
    const [date, setDate] = useState(defaultDate)
    const [source, setSource] = useState<'ARS' | 'ME'>('ARS')
    const [contrapartidaId, setContrapartidaId] = useState('')
    const [sourceFxAccountId, setSourceFxAccountId] = useState('')
    const [saving, setSaving] = useState(false)

    const interestPendingARS = useMemo(() => {
        const accrued = debtMovements
            .filter(m => m.type === 'DEVENGO_INTERES')
            .reduce((sum, m) => sum + (m.arsAmount || 0), 0)
        const paid = debtMovements
            .filter(m => m.type === 'PAGO_DEUDA')
            .reduce((sum, m) => sum + (m.interestAppliedARS ?? m.interestARS ?? 0), 0)
        return Math.max(0, Math.round((accrued - paid) * 100) / 100)
    }, [debtMovements])

    const unpaidInstallments = useMemo(
        () => (debt.schedule || []).filter(i => !i.paid),
        [debt.schedule]
    )

    const installmentOptions = useMemo(
        () => unpaidInstallments.map(i => {
            const totalInstallmentARS = isARS
                ? (i.totalME || (i.capitalME + i.interestME))
                : (i.totalME || (i.capitalME + i.interestME)) * (rate || 1)
            return {
                value: i.number,
                label: `Cuota ${i.number} - ${formatCurrencyARS(totalInstallmentARS)}`,
                totalInstallmentARS,
            }
        }),
        [unpaidInstallments, isARS, rate]
    )

    const estimatedInterestApplied = Math.min(totalARS, interestPendingARS)
    const estimatedCapitalApplied = Math.max(0, totalARS - estimatedInterestApplied)
    const capitalPendingARS = isARS ? debt.saldoME : debt.saldoME * (rate || 1)
    const totalPendingARS = capitalPendingARS + interestPendingARS

    useEffect(() => {
        if (!open) return
        setMode('cuota')
        setRate(isARS ? 1 : oficialRate)
        setDate(defaultDate)
        setContrapartidaId('')
        setSourceFxAccountId('')
        setSource('ARS')
        const firstUnpaid = unpaidInstallments[0]
        setSelectedInstallmentNumber(firstUnpaid?.number || 0)
        const suggested = firstUnpaid
            ? (isARS ? firstUnpaid.totalME : firstUnpaid.totalME * (oficialRate || 1))
            : 0
        setTotalARS(Math.max(0, Math.round(suggested * 100) / 100))
    }, [open, isARS, oficialRate, unpaidInstallments, defaultDate])

    useEffect(() => {
        if (mode === 'total') {
            setTotalARS(Math.round(totalPendingARS * 100) / 100)
            return
        }
        if (mode === 'cuota') {
            const selected = installmentOptions.find(i => i.value === selectedInstallmentNumber) || installmentOptions[0]
            if (selected) {
                setSelectedInstallmentNumber(selected.value)
                setTotalARS(Math.round(selected.totalInstallmentARS * 100) / 100)
            } else {
                setTotalARS(0)
            }
        }
    }, [mode, selectedInstallmentNumber, installmentOptions, totalPendingARS])

    const arsOptions = useMemo(
        () => ledgerAccounts
            .filter(a => !a.isHeader && (a.code.startsWith('1.1.01') || a.code.startsWith('1.1.02')))
            .map(a => ({ value: a.id, label: `${a.code} - ${a.name}` })),
        [ledgerAccounts]
    )

    const meAssetOptions = useMemo(
        () => fxAccounts
            .filter(a => a.type === 'ASSET' && a.currency === debt.currency)
            .map(a => ({ value: a.id, label: a.name })),
        [fxAccounts, debt.currency]
    )

    const effectiveContra = source === 'ME' && sourceFxAccountId
        ? fxAccounts.find(a => a.id === sourceFxAccountId)?.accountId || contrapartidaId
        : contrapartidaId

    const contraAccountLabel = useMemo(() => {
        const id = effectiveContra
        if (!id) return 'Banco/Caja'
        const account = ledgerAccounts.find(a => a.id === id)
        return account ? `${account.code} - ${account.name}` : 'Banco/Caja'
    }, [effectiveContra, ledgerAccounts])

    const liabilityAccountLabel = useMemo(() => {
        const fxLiability = fxAccounts.find(a => a.id === debt.accountId)
        const liabilityAccount = ledgerAccounts.find(a => a.id === fxLiability?.accountId)
        return liabilityAccount
            ? `${liabilityAccount.code} - ${liabilityAccount.name}`
            : 'Préstamos bancarios CP/LP (subcuenta)'
    }, [fxAccounts, debt.accountId, ledgerAccounts])

    const handlePay = async () => {
        if (totalARS <= 0) { onSuccess('El monto total debe ser mayor a 0'); return }
        if (!isARS && (!rate || rate <= 0)) { onSuccess('El tipo de cambio es obligatorio para pagos en moneda extranjera'); return }
        if (!effectiveContra && source === 'ARS') { onSuccess('Selecciona cuenta de origen del pago'); return }
        if (source === 'ME' && !sourceFxAccountId) { onSuccess('Selecciona cartera ME de origen'); return }

        setSaving(true)
        try {
            await addFxDebtPayment({
                debtId: debt.id,
                totalARS,
                rate,
                date,
                contrapartidaAccountId: effectiveContra,
                autoJournal: true,
            })

            if (source === 'ME' && sourceFxAccountId && !isARS) {
                const estimatedCapitalME = Math.max(0, estimatedCapitalApplied / (rate || 1))
                await createFxMovement({
                    date,
                    type: 'EGRESO',
                    accountId: sourceFxAccountId,
                    periodId,
                    amount: estimatedCapitalME,
                    currency: debt.currency,
                    rate,
                    rateType: 'Oficial',
                    rateSide: 'venta',
                    rateSource: 'BNA',
                    arsAmount: estimatedCapitalApplied,
                    autoJournal: false,
                })
            }

            onSuccess(mode === 'total' ? 'Cancelación total registrada' : 'Pago registrado correctamente')
        } catch (err) {
            onSuccess(err instanceof Error ? err.message : 'Error al registrar pago')
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <h3 className="font-display text-lg font-bold text-slate-900">Pago - {debt.creditor || debt.name}</h3>
                    <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Cerrar
                    </button>
                </div>
                <div className="max-h-[70vh] space-y-4 overflow-y-auto px-8 py-6">
                    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                        {([
                            { id: 'cuota', label: 'Cuota' },
                            { id: 'libre', label: 'Pago libre' },
                            { id: 'total', label: 'Cancelar total' },
                        ] as const).map(m => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMode(m.id)}
                                className={cx('flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition', mode === m.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Monto total pagado (ARS)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={totalARS || ''}
                                onChange={e => setTotalARS(Number(e.target.value) || 0)}
                                disabled={mode === 'total'}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        {mode === 'cuota' && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuota a sugerir</label>
                                <select
                                    value={selectedInstallmentNumber || ''}
                                    onChange={e => setSelectedInstallmentNumber(Number(e.target.value) || 0)}
                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                >
                                    {installmentOptions.length === 0 && <option value="">Sin cuotas pendientes</option>}
                                    {installmentOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        )}
                        {!isARS && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Tipo de cambio (ARS por unidad ME)</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={rate || ''}
                                    onChange={e => setRate(Number(e.target.value) || 0)}
                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Fecha de pago</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </div>

                    {!isARS && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Origen del pago</label>
                            <select
                                value={source}
                                onChange={e => setSource(e.target.value as 'ARS' | 'ME')}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="ARS">Cuenta ARS (Caja/Banco)</option>
                                <option value="ME">Cartera ME ({debt.currency})</option>
                            </select>
                        </div>
                    )}

                    {source === 'ME' && !isARS ? (
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Cartera ME origen</label>
                            <select
                                value={sourceFxAccountId}
                                onChange={e => setSourceFxAccountId(e.target.value)}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">Selecciona cartera</option>
                                {meAssetOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Cuenta ARS origen</label>
                            <select
                                value={contrapartidaId}
                                onChange={e => setContrapartidaId(e.target.value)}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">Selecciona cuenta</option>
                                {arsOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                        <div className="flex justify-between"><span>Interés pendiente:</span><span className="font-mono">{formatCurrencyARS(interestPendingARS)}</span></div>
                        <div className="flex justify-between"><span>Interés aplicado:</span><span className="font-mono">{formatCurrencyARS(estimatedInterestApplied)}</span></div>
                        <div className="flex justify-between"><span>Capital aplicado:</span><span className="font-mono">{formatCurrencyARS(estimatedCapitalApplied)}</span></div>
                        <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">Preview asiento único:</div>
                        {estimatedInterestApplied > 0 && <div className="mt-1 flex justify-between text-xs"><span>Debe 2.1.05.90</span><span>{formatCurrencyARS(estimatedInterestApplied)}</span></div>}
                        {estimatedCapitalApplied > 0 && <div className="flex justify-between text-xs"><span>Debe {liabilityAccountLabel}</span><span>{formatCurrencyARS(estimatedCapitalApplied)}</span></div>}
                        <div className="flex justify-between text-xs"><span>Haber {contraAccountLabel}</span><span>{formatCurrencyARS(totalARS)}</span></div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <button type="button" onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                        Cancelar
                    </button>
                    <button type="button" onClick={handlePay} disabled={saving} className="rounded-md bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                        {saving ? 'Procesando...' : mode === 'total' ? 'Cancelar total' : 'Registrar pago'}
                    </button>
                </div>
            </div>
        </div>
    )
}
