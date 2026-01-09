import { useState, useEffect, useRef, useCallback } from 'react'
import type { Account, EntryLine } from '../core/models'
import BottomSheetAccountPicker from './BottomSheetAccountPicker'

interface MobileAsientosGridProps {
    accounts: Account[]
    date: string
    setDate: (date: string) => void
    memo: string
    setMemo: (memo: string) => void
    lines: EntryLine[]
    updateLine: (index: number, updates: Partial<EntryLine>) => void
    addLine: () => void
    removeLine: (index: number) => void
    totalDebit: number
    totalCredit: number
    isValid: boolean
    onSave: () => void
    saveSuccess?: boolean
    saveError?: string
}

// Parse Argentine number format
const parseARNumber = (value: string): number => {
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.max(0, num)
}

// Format number to Argentine format
const formatARNumber = (n: number): string => {
    if (n === 0) return ''
    return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const formatAmount = (n: number): string => {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Format date for collapsed header
const formatDateShort = (dateStr: string): string => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export default function MobileAsientosGrid({
    accounts,
    date,
    setDate,
    memo,
    setMemo,
    lines,
    updateLine,
    addLine,
    removeLine,
    totalDebit,
    totalCredit,
    isValid,
    onSave,
    saveSuccess,
    saveError
}: MobileAsientosGridProps) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null)
    const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
    const lastScrollY = useRef(0)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const prefersReducedMotion = useRef(
        typeof window !== 'undefined'
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false
    )

    const getAccount = (accountId: string) => accounts.find(a => a.id === accountId)

    // Scroll direction detection for collapsible header
    useEffect(() => {
        const scroller = document.querySelector('.main-content') || window
        let ticking = false

        const getScrollY = () => {
            return scroller instanceof Window ? scroller.scrollY : (scroller as HTMLElement).scrollTop
        }

        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const currentScrollY = getScrollY()
                    const scrollThreshold = 40

                    if (currentScrollY > scrollThreshold && currentScrollY > lastScrollY.current) {
                        // Scrolling down past threshold
                        setIsHeaderCollapsed(true)
                    } else if (currentScrollY < lastScrollY.current) {
                        // Scrolling up
                        setIsHeaderCollapsed(false)
                    }

                    lastScrollY.current = currentScrollY
                    ticking = false
                })
                ticking = true
            }
        }

        scroller.addEventListener('scroll', handleScroll, { passive: true })
        return () => scroller.removeEventListener('scroll', handleScroll)
    }, [])

    const handleOpenPicker = (index: number) => {
        setEditingLineIndex(index)
        setPickerOpen(true)
    }

    const handleSelectAccount = useCallback((account: Account) => {
        if (editingLineIndex !== null) {
            updateLine(editingLineIndex, { accountId: account.id })
        }
        setPickerOpen(false)
        setEditingLineIndex(null)
    }, [editingLineIndex, updateLine])

    // Handle Debe/Haber mutual exclusion
    const handleDebitChange = (index: number, value: string) => {
        const amount = parseARNumber(value)
        updateLine(index, { debit: amount, credit: amount > 0 ? 0 : lines[index].credit })
    }

    const handleCreditChange = (index: number, value: string) => {
        const amount = parseARNumber(value)
        updateLine(index, { credit: amount, debit: amount > 0 ? 0 : lines[index].debit })
    }

    const handleAddLine = () => {
        addLine()
        // Focus will be handled by the new row
    }

    const diff = Math.abs(totalDebit - totalCredit)

    return (
        <div className="mobile-asientos-container">
            {/* Collapsible Header */}
            <div
                className={`mobile-asientos-header ${isHeaderCollapsed ? 'collapsed' : ''}`}
                style={prefersReducedMotion.current ? { transition: 'none' } : undefined}
            >
                {isHeaderCollapsed ? (
                    // Collapsed: single line summary
                    <div className="mobile-asientos-header-collapsed">
                        <span className="mobile-asientos-date-pill">{formatDateShort(date)}</span>
                        {memo && <span className="mobile-asientos-memo-preview">· {memo.slice(0, 25)}{memo.length > 25 ? '…' : ''}</span>}
                    </div>
                ) : (
                    // Expanded: full inputs
                    <div className="mobile-asientos-header-expanded">
                        <div className="mobile-asientos-header-row">
                            <label className="mobile-asientos-label">Fecha</label>
                            <input
                                type="date"
                                className="mobile-asientos-date-input"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                        <div className="mobile-asientos-header-row">
                            <label className="mobile-asientos-label">Concepto</label>
                            <input
                                type="text"
                                className="mobile-asientos-memo-input"
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="Opcional: descripción del asiento"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Success/Error messages */}
            {saveSuccess && (
                <div className="mobile-asientos-alert success">✓ Asiento guardado</div>
            )}
            {saveError && (
                <div className="mobile-asientos-alert error">{saveError}</div>
            )}

            {/* Scrollable Grid Container */}
            <div className="mobile-asientos-grid-wrapper" ref={scrollContainerRef}>
                {/* Grid Header (sticky) */}
                <div className="mobile-asientos-grid-header">
                    <span className="mobile-asientos-col-cuenta">Cuenta</span>
                    <span className="mobile-asientos-col-debe">Debe</span>
                    <span className="mobile-asientos-col-haber">Haber</span>
                    <span className="mobile-asientos-col-action"></span>
                </div>

                {/* Grid Rows */}
                <div className="mobile-asientos-grid-body">
                    {lines.map((line, index) => {
                        const account = getAccount(line.accountId)
                        const hasAccount = !!account
                        const hasDebit = line.debit > 0
                        const hasHaber = line.credit > 0
                        const rowState = !hasAccount ? 'incomplete' : hasDebit ? 'debit-active' : hasHaber ? 'credit-active' : 'ready'

                        return (
                            <div key={index} className={`mobile-asientos-row ${rowState}`}>
                                {/* Account chip/button */}
                                <button
                                    type="button"
                                    className={`mobile-asientos-account-chip ${hasAccount ? 'selected' : ''}`}
                                    onClick={() => handleOpenPicker(index)}
                                >
                                    <span className="chip-icon">{hasAccount ? '📋' : '➕'}</span>
                                    {account ? (
                                        <span className="chip-content">
                                            <span className="chip-name">{account.name.length > 14 ? account.name.slice(0, 14) + '…' : account.name}</span>
                                            <span className="chip-code">{account.code}</span>
                                        </span>
                                    ) : (
                                        <span className="chip-placeholder">Seleccioná cuenta</span>
                                    )}
                                    <span className="chip-chevron">▾</span>
                                </button>

                                {/* Debe input */}
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className={`mobile-asientos-amount-input debe ${hasDebit ? 'active' : ''}`}
                                    value={formatARNumber(line.debit)}
                                    onChange={(e) => handleDebitChange(index, e.target.value)}
                                    placeholder="0"
                                />

                                {/* Haber input */}
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className={`mobile-asientos-amount-input haber ${hasHaber ? 'active' : ''}`}
                                    value={formatARNumber(line.credit)}
                                    onChange={(e) => handleCreditChange(index, e.target.value)}
                                    placeholder="0"
                                />

                                {/* Delete button */}
                                {lines.length > 2 ? (
                                    <button
                                        type="button"
                                        className="mobile-asientos-delete-btn"
                                        onClick={() => removeLine(index)}
                                        aria-label="Eliminar línea"
                                    >
                                        ✕
                                    </button>
                                ) : (
                                    <span className="mobile-asientos-delete-placeholder"></span>
                                )}
                            </div>
                        )
                    })}

                    {/* Add line button */}
                    <button
                        type="button"
                        className="mobile-asientos-add-btn"
                        onClick={handleAddLine}
                    >
                        + Agregar línea
                    </button>
                </div>
            </div>

            {/* Sticky Save Bar */}
            <div className="mobile-asientos-save-bar">
                <div className="mobile-asientos-totals">
                    <div className="mobile-asientos-total">
                        <span className="mobile-asientos-total-label">D</span>
                        <span className="mobile-asientos-total-value debe">{formatAmount(totalDebit)}</span>
                    </div>
                    <div className="mobile-asientos-total">
                        <span className="mobile-asientos-total-label">H</span>
                        <span className="mobile-asientos-total-value haber">{formatAmount(totalCredit)}</span>
                    </div>
                    <div className={`mobile-asientos-diff ${isValid ? 'balanced' : 'unbalanced'}`}>
                        {isValid ? '✓ OK' : `−${formatAmount(diff)}`}
                    </div>
                </div>
                <button
                    type="button"
                    className="mobile-asientos-save-btn"
                    onClick={onSave}
                    disabled={!isValid}
                >
                    Guardar
                </button>
            </div>

            {/* Bottom Sheet Account Picker */}
            <BottomSheetAccountPicker
                isOpen={pickerOpen}
                onClose={() => {
                    setPickerOpen(false)
                    setEditingLineIndex(null)
                }}
                onSelect={handleSelectAccount}
                accounts={accounts.filter(a => !a.isHeader)}
                placeholder="Buscar cuenta..."
            />
        </div>
    )
}
