import { useState, useRef, useEffect, useCallback } from 'react'
import type { Account } from '../core/models'

interface BottomSheetAccountPickerProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (account: Account) => void
    accounts: Account[]
    placeholder?: string
}

export default function BottomSheetAccountPicker({
    isOpen,
    onClose,
    onSelect,
    accounts,
    placeholder = 'Buscar cuenta...',
}: BottomSheetAccountPickerProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const startYRef = useRef<number | null>(null)

    // Filter accounts based on search
    const filteredAccounts = accounts.filter((account) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return (
            account.name.toLowerCase().includes(q) ||
            account.code.toLowerCase().includes(q)
        )
    })

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('')
            setTimeout(() => inputRef.current?.focus(), 100)
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    // ESC key to close
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    // Swipe down to close
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startYRef.current = e.touches[0].clientY
    }, [])

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (startYRef.current === null) return
        const diff = e.changedTouches[0].clientY - startYRef.current
        // Swipe down > 100px to close
        if (diff > 100) {
            onClose()
        }
        startYRef.current = null
    }, [onClose])

    const handleSelect = (account: Account) => {
        onSelect(account)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="bottom-sheet-overlay" onClick={onClose}>
            <div
                className="bottom-sheet"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                role="dialog"
                aria-modal="true"
                aria-label="Seleccionar cuenta"
            >
                {/* Handle bar */}
                <div className="bottom-sheet-handle">
                    <div className="bottom-sheet-handle-bar" />
                </div>

                {/* Header */}
                <div className="bottom-sheet-header">
                    <h2 className="bottom-sheet-title">Seleccionar cuenta</h2>
                    <button
                        type="button"
                        className="btn btn-icon btn-secondary"
                        onClick={onClose}
                        aria-label="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                {/* Search input */}
                <div className="bottom-sheet-search">
                    <input
                        ref={inputRef}
                        type="text"
                        className="form-input"
                        placeholder={placeholder}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                    />
                </div>

                {/* Account list */}
                <div className="bottom-sheet-list">
                    {filteredAccounts.length === 0 ? (
                        <div className="bottom-sheet-empty">
                            No se encontraron cuentas
                        </div>
                    ) : (
                        filteredAccounts.map((account) => (
                            <button
                                key={account.id}
                                type="button"
                                className="bottom-sheet-item"
                                onClick={() => handleSelect(account)}
                            >
                                <span className="bottom-sheet-item-code">
                                    {account.code}
                                </span>
                                <span className="bottom-sheet-item-name">
                                    {account.name}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
