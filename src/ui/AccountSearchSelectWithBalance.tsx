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
import type { BienesMovement, TaxLine } from '../core/inventario/types'
import { computeOpenItemsByDirection } from '../core/inventario/openItems'

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
 * Hook to get pending documents for payment/collection selection.
 */
export interface PendingDocument {
    id: string
    movementId: string
    date: string
    type: 'SALE' | 'PURCHASE'
    counterparty: string
    reference: string
    dueDate?: string
    originalTotal: number
    saldoPendiente: number
    ivaAmount: number
    subtotal: number
    taxes?: TaxLine[]
    pendingSubtotal: number
    pendingIva: number
    pendingTaxes?: TaxLine[]
    ajustesAplicados: number
    pagosAplicados: number
    applicationsCount: number
}

export interface PendingDocumentsResult {
    documents: PendingDocument[]
    hasUnlinked: boolean
    unlinkedCount: number
}

export function usePendingDocuments(
    movements: BienesMovement[] | undefined,
    direction: 'COBRO' | 'PAGO'
): PendingDocumentsResult {
    return useMemo(() => {
        const result = computeOpenItemsByDirection(movements, direction)
        const targetType = direction === 'COBRO' ? 'SALE' : 'PURCHASE'
        return {
            documents: result.items.map(item => ({
                id: item.docId,
                movementId: item.docId,
                date: item.date,
                type: targetType as 'SALE' | 'PURCHASE',
                counterparty: item.counterparty,
                reference: item.reference,
                dueDate: item.dueDate,
                originalTotal: item.originalTotal,
                saldoPendiente: item.saldoActual,
                ivaAmount: item.originalIva,
                subtotal: item.originalSubtotal,
                taxes: item.originalTaxes,
                pendingSubtotal: item.pendingSubtotal,
                pendingIva: item.pendingIva,
                pendingTaxes: item.pendingTaxes,
                ajustesAplicados: item.ajustesAplicados,
                pagosAplicados: item.pagosAplicados,
                applicationsCount: item.applications.length,
            })),
            hasUnlinked: result.unlinkedCount > 0,
            unlinkedCount: result.unlinkedCount,
        }
    }, [movements, direction])
}
