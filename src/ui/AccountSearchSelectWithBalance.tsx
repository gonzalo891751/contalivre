/**
 * AccountSearchSelectWithBalance - Account selector with balance display
 *
 * Wraps AccountSearchSelect to show the current balance when an account is selected.
 * Used in payment/collection forms and anywhere account balances are relevant.
 */
import { useMemo } from 'react'
import AccountSearchSelect, { AccountSearchSelectRef } from './AccountSearchSelect'
import type { Account } from '../core/models'
import type { AccountBalance } from '../core/ledger/computeBalances'

interface AccountSearchSelectWithBalanceProps {
    accounts: Account[]
    value: string // accountId
    onChange: (accountId: string) => void
    placeholder?: string
    filter?: (account: Account) => boolean
    onAccountSelected?: () => void
    inputClassName?: string
    // Balance data
    balances?: Map<string, AccountBalance>
    showBalance?: boolean
    balanceLabel?: string
    ref?: React.Ref<AccountSearchSelectRef>
}

/** Format number as currency */
const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)
}

export default function AccountSearchSelectWithBalance({
    accounts,
    value,
    onChange,
    placeholder,
    filter,
    onAccountSelected,
    inputClassName,
    balances,
    showBalance = true,
    balanceLabel = 'Saldo',
}: AccountSearchSelectWithBalanceProps) {
    // Get balance for selected account
    const selectedBalance = useMemo(() => {
        if (!value || !balances) return null
        return balances.get(value)
    }, [value, balances])

    const balanceDisplay = useMemo(() => {
        if (!showBalance || !selectedBalance) return null
        const bal = selectedBalance.balance
        const isPositive = bal >= 0
        return {
            value: bal,
            formatted: formatCurrency(Math.abs(bal)),
            sign: isPositive ? '' : '-',
            colorClass: bal === 0 ? 'text-slate-400' : (isPositive ? 'text-emerald-600' : 'text-rose-600'),
        }
    }, [showBalance, selectedBalance])

    return (
        <div className="account-select-with-balance flex flex-col gap-1">
            <AccountSearchSelect
                accounts={accounts}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                filter={filter}
                onAccountSelected={onAccountSelected}
                inputClassName={inputClassName}
            />
            {balanceDisplay && (
                <div className="flex items-center gap-1 px-1">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                        {balanceLabel}:
                    </span>
                    <span className={`text-xs font-mono font-semibold ${balanceDisplay.colorClass}`}>
                        {balanceDisplay.sign}{balanceDisplay.formatted}
                    </span>
                </div>
            )}
        </div>
    )
}

/**
 * Hook to get pending documents for payment/collection selection
 * Returns movements with outstanding balances (saldo > 0)
 */
export interface PendingDocument {
    id: string
    movementId: string
    date: string
    type: 'SALE' | 'PURCHASE'
    counterparty: string
    reference: string
    originalTotal: number
    saldoPendiente: number
    ivaAmount: number
    subtotal: number
    taxes?: { kind: string; taxType: string; amount: number }[]
}

export function usePendingDocuments(
    movements: {
        id: string
        date: string
        type: string
        counterparty?: string
        reference?: string
        total: number
        subtotal: number
        ivaAmount: number
        taxes?: { kind: string; taxType: string; amount: number }[]
        isDevolucion?: boolean
        paymentDirection?: string
        sourceMovementId?: string
    }[] | undefined,
    payments: {
        id: string
        type: string
        paymentDirection?: string
        total: number
        notes?: string
        sourceMovementId?: string
    }[] | undefined,
    direction: 'COBRO' | 'PAGO'
): PendingDocument[] {
    return useMemo(() => {
        if (!movements) return []

        const targetType = direction === 'COBRO' ? 'SALE' : 'PURCHASE'

        // Get all original documents (sales/purchases that are not returns)
        const originalDocs = movements.filter(m =>
            m.type === targetType &&
            !m.isDevolucion &&
            m.total > 0
        )

        // Calculate payments by formal link (sourceMovementId) — primary path
        const paymentsBySourceId = new Map<string, number>()
        // Legacy fallback: payments matched by notes/reference (for backward compat)
        const paymentsByRef = new Map<string, number>()

        if (payments) {
            payments
                .filter(p => p.type === 'PAYMENT' && p.paymentDirection === direction)
                .forEach(p => {
                    if (p.sourceMovementId) {
                        // Formal link: payment explicitly references the purchase/sale
                        const current = paymentsBySourceId.get(p.sourceMovementId) || 0
                        paymentsBySourceId.set(p.sourceMovementId, current + p.total)
                    } else if (p.notes) {
                        // Legacy fallback: match by notes
                        const current = paymentsByRef.get(p.notes) || 0
                        paymentsByRef.set(p.notes, current + p.total)
                    }
                })
        }

        // Build pending documents list
        const pending: PendingDocument[] = []
        for (const doc of originalDocs) {
            // Primary: sum payments linked by sourceMovementId
            const paidByLink = paymentsBySourceId.get(doc.id) || 0
            // Legacy fallback: sum payments matched by reference
            const paidByRef = paymentsByRef.get(doc.reference || doc.id) || 0
            const saldoPendiente = doc.total - paidByLink - paidByRef

            if (saldoPendiente <= 0.01) continue // fully paid (epsilon for FP)

            pending.push({
                id: doc.id,
                movementId: doc.id,
                date: doc.date,
                type: targetType as 'SALE' | 'PURCHASE',
                counterparty: doc.counterparty || 'Sin tercero',
                reference: doc.reference || doc.id.slice(0, 8),
                originalTotal: doc.total,
                saldoPendiente,
                ivaAmount: doc.ivaAmount,
                subtotal: doc.subtotal,
                taxes: doc.taxes,
            })
        }

        pending.sort((a, b) => b.date.localeCompare(a.date))
        return pending
    }, [movements, payments, direction])
}
