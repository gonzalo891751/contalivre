/**
 * AccountSearchSelect - Searchable account selector component
 * Updated to use React Portal for the dropdown to avoid clipping in modals/tables.
 */
import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import type { Account } from '../core/models'

interface AccountSearchSelectProps {
    accounts: Account[]
    value: string // accountId
    onChange: (accountId: string) => void
    placeholder?: string
    filter?: (account: Account) => boolean
    onAccountSelected?: () => void
    inputClassName?: string
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
    inputClassName = 'h-11',
}, ref) => {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })

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

    // Filter accounts
    const filteredAccounts = useMemo(() => {
        const q = search.toLowerCase()
        return accounts
            .filter(acc => filter ? filter(acc) : !acc.isHeader)
            .filter(acc => {
                if (!q) return true
                return acc.code.toLowerCase().includes(q) ||
                    acc.name.toLowerCase().includes(q) ||
                    (accountPaths.get(acc.id) || '').toLowerCase().includes(q)
            })
            .slice(0, 20)
    }, [accounts, search, accountPaths, filter])

    // Selected account display
    const selectedAccount = accounts.find(a => a.id === value)
    const displayValue = selectedAccount
        ? `${selectedAccount.code} — ${selectedAccount.name}`
        : ''

    // Update coordinates
    const updatePosition = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect()
            setCoords({
                top: rect.bottom, // Fixed position relative to viewport
                left: rect.left,
                width: rect.width
            })
        }
    }

    // Update position on open and scroll/resize
    useEffect(() => {
        if (isOpen) {
            updatePosition()
            window.addEventListener('scroll', updatePosition, true) // Capture phase for all scrolls
            window.addEventListener('resize', updatePosition)
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [isOpen])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'Tab':
                if (isOpen) {
                    setIsOpen(false)
                    setSearch('')
                }
                break
            case 'ArrowDown':
                e.preventDefault()
                if (!isOpen) setIsOpen(true)
                setHighlightedIndex(prev =>
                    Math.min(prev + 1, filteredAccounts.length - 1)
                )
                break
            case 'ArrowUp':
                e.preventDefault()
                if (!isOpen) setIsOpen(true)
                setHighlightedIndex(prev => Math.max(prev - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                e.stopPropagation()
                if (isOpen && filteredAccounts[highlightedIndex]) {
                    selectAccount(filteredAccounts[highlightedIndex])
                } else if (!isOpen && filteredAccounts.length > 0 && search) {
                    selectAccount(filteredAccounts[0])
                }
                break
            case 'Escape':
                e.preventDefault()
                setIsOpen(false)
                setSearch('')
                break
        }
    }

    const selectAccount = (acc: Account) => {
        onChange(acc.id)
        setIsOpen(false)
        setSearch('')
        onAccountSelected?.()
    }

    // Scroll highlighted item
    useEffect(() => {
        if (isOpen && listRef.current) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement
            if (item) {
                item.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [highlightedIndex, isOpen])

    // Click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                inputRef.current &&
                !inputRef.current.contains(e.target as Node) &&
                listRef.current &&
                !listRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false)
                setSearch('')
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    return (
        <div className="account-search-select w-full">
            <input
                ref={inputRef}
                type="text"
                className={`form-input w-full truncate placeholder:text-slate-400 ${inputClassName}`}
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

            {isOpen && createPortal(
                <div
                    ref={listRef}
                    className="fixed z-[9999] bg-white border border-slate-200 shadow-2xl rounded-xl flex flex-col"
                    style={{
                        top: coords.top + 8,
                        left: coords.left,
                        width: coords.width,
                    }}
                >
                    <div className="overflow-y-auto max-h-[320px] p-1.5 custom-scrollbar">
                        {filteredAccounts.length === 0 ? (
                            <div className="p-4 text-sm text-slate-500 text-center italic">
                                No se encontraron cuentas
                            </div>
                        ) : (
                            filteredAccounts.map((acc, index) => (
                                <div
                                    key={acc.id}
                                    className={`
                                        flex flex-col gap-0.5 px-3 py-2.5 cursor-pointer rounded-lg transition-colors duration-150 mb-0.5 last:mb-0
                                        ${index === highlightedIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}
                                        ${acc.id === value ? 'bg-sky-50 ring-1 ring-sky-100' : ''}
                                    `}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    // Use onMouseDown to prevent blur before click
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        selectAccount(acc)
                                    }}
                                >
                                    {/* Line 1: Code */}
                                    <div className="text-xs font-semibold text-sky-600 tabular-nums">
                                        {acc.code}
                                    </div>

                                    {/* Line 2: Name */}
                                    <div className="text-sm font-semibold text-slate-900 leading-tight">
                                        {acc.name}
                                    </div>

                                    {/* Line 3: Path */}
                                    <div className="text-xs text-slate-400 font-medium truncate mt-0.5">
                                        {accountPaths.get(acc.id) || acc.name}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
})

export default AccountSearchSelect
