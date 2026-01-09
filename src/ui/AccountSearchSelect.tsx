/**
 * AccountSearchSelect - Searchable account selector component
 * Features:
 * - Search by code and name
 * - Shows account path in dropdown
 * - Keyboard navigation (arrows, Enter, Escape, Tab)
 * - Filters out non-imputable accounts (headers)
 * - Exposes focus() via ref for external control
 */
import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import type { Account } from '../core/models'

interface AccountSearchSelectProps {
    accounts: Account[]
    value: string // accountId
    onChange: (accountId: string) => void
    placeholder?: string
    filter?: (account: Account) => boolean
    onAccountSelected?: () => void // Callback after account is confirmed (Enter/click)
}

export interface AccountSearchSelectRef {
    focus: () => void
}

const AccountSearchSelect = forwardRef<AccountSearchSelectRef, AccountSearchSelectProps>(({
    accounts,
    value,
    onChange,
    placeholder = 'Buscar cuenta...',
    filter,
    onAccountSelected,
}, ref) => {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus()
    }))

    // Build account path map for display
    const accountPaths = useMemo(() => {
        const paths = new Map<string, string>()

        const buildPath = (acc: Account): string => {
            const parts: string[] = []
            let current: Account | undefined = acc
            while (current) {
                parts.unshift(current.name)
                current = accounts.find(a => a.id === current!.parentId)
            }
            return parts.join(' > ')
        }

        for (const acc of accounts) {
            paths.set(acc.id, buildPath(acc))
        }

        return paths
    }, [accounts])

    // Filter accounts based on search (only imputable accounts by default)
    const filteredAccounts = useMemo(() => {
        const q = search.toLowerCase()
        return accounts
            .filter(acc => filter ? filter(acc) : !acc.isHeader) // Use custom filter or default to !isHeader
            .filter(acc => {
                if (!q) return true
                return acc.code.toLowerCase().includes(q) ||
                    acc.name.toLowerCase().includes(q) ||
                    (accountPaths.get(acc.id) || '').toLowerCase().includes(q)
            })
            .slice(0, 20) // Limit results for performance
    }, [accounts, search, accountPaths, filter])

    // Selected account display
    const selectedAccount = accounts.find(a => a.id === value)
    const displayValue = selectedAccount
        ? `${selectedAccount.code} — ${selectedAccount.name}`
        : ''

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'Tab':
                // Allow native Tab navigation - just close dropdown
                setIsOpen(false)
                setSearch('')
                break
            case 'ArrowDown':
                e.preventDefault()
                setHighlightedIndex(prev =>
                    Math.min(prev + 1, filteredAccounts.length - 1)
                )
                break
            case 'ArrowUp':
                e.preventDefault()
                setHighlightedIndex(prev => Math.max(prev - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (filteredAccounts[highlightedIndex]) {
                    selectAccount(filteredAccounts[highlightedIndex])
                }
                break
            case 'Escape':
                setIsOpen(false)
                setSearch('')
                break
        }
    }

    const selectAccount = (acc: Account) => {
        onChange(acc.id)
        setIsOpen(false)
        setSearch('')
        // Notify parent that an account was selected (for focus chaining)
        onAccountSelected?.()
    }

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement
            if (item) {
                item.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [highlightedIndex, isOpen])

    // Reset highlight when search changes
    useEffect(() => {
        setHighlightedIndex(0)
    }, [search])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
                setIsOpen(false)
                setSearch('')
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="account-search-select">
            <input
                ref={inputRef}
                type="text"
                className="form-input"
                placeholder={placeholder}
                value={isOpen ? search : displayValue}
                onChange={(e) => {
                    setSearch(e.target.value)
                    if (!isOpen) setIsOpen(true)
                }}
                onFocus={() => {
                    setIsOpen(true)
                    setSearch('')
                }}
                onKeyDown={handleKeyDown}
            />

            {isOpen && (
                <div className="account-search-dropdown" ref={listRef}>
                    {filteredAccounts.length === 0 ? (
                        <div className="account-search-empty">
                            No se encontraron cuentas
                        </div>
                    ) : (
                        filteredAccounts.map((acc, index) => (
                            <div
                                key={acc.id}
                                className={`account-search-option ${index === highlightedIndex ? 'highlighted' : ''} ${acc.id === value ? 'selected' : ''}`}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                onClick={() => selectAccount(acc)}
                            >
                                <div className="account-search-code">{acc.code}</div>
                                <div className="account-search-name">{acc.name}</div>
                                <div className="account-search-path">{accountPaths.get(acc.id)}</div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
})

export default AccountSearchSelect
