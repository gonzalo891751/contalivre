import { useState } from 'react'
import type { Account, EntryLine } from '../core/models'
import BottomSheetAccountPicker from './BottomSheetAccountPicker'

interface MobileEntryEditorProps {
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
    showHelp?: boolean
    onToggleHelp?: () => void
}

// Get type from EntryLine (DEBE if debit > 0, HABER otherwise)
function getLineType(line: EntryLine): 'DEBE' | 'HABER' {
    return line.debit > 0 ? 'DEBE' : 'HABER'
}

// Get amount from EntryLine
function getLineAmount(line: EntryLine): number {
    return line.debit > 0 ? line.debit : line.credit
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

export default function MobileEntryEditor({
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
    onToggleHelp
}: MobileEntryEditorProps) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null)

    const getAccount = (accountId: string) => accounts.find(a => a.id === accountId)

    const handleOpenPicker = (index: number) => {
        setEditingLineIndex(index)
        setPickerOpen(true)
    }

    const handleSelectAccount = (account: Account) => {
        if (editingLineIndex !== null) {
            updateLine(editingLineIndex, { accountId: account.id })
        }
        setPickerOpen(false)
        setEditingLineIndex(null)
    }

    const handleTypeChange = (index: number, type: 'DEBE' | 'HABER') => {
        const amount = getLineAmount(lines[index])
        if (type === 'DEBE') {
            updateLine(index, { debit: amount, credit: 0 })
        } else {
            updateLine(index, { debit: 0, credit: amount })
        }
    }

    const handleAmountChange = (index: number, value: string) => {
        const amount = parseARNumber(value)
        const type = getLineType(lines[index])
        if (type === 'DEBE') {
            updateLine(index, { debit: amount, credit: 0 })
        } else {
            updateLine(index, { debit: 0, credit: amount })
        }
    }

    const diff = Math.abs(totalDebit - totalCredit)

    return (
        <>
            <div className="mobile-entry-editor">
                {/* Header row with title and help */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Nuevo asiento</h3>
                    {onToggleHelp && (
                        <button
                            type="button"
                            className="mobile-help-toggle"
                            onClick={onToggleHelp}
                        >
                            ℹ️ Ayuda
                        </button>
                    )}
                </div>

                {/* Entry header: Date + Memo */}
                <div className="mobile-entry-header">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="mobile-date">Fecha</label>
                        <input
                            id="mobile-date"
                            type="date"
                            className="form-input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="mobile-memo">Concepto</label>
                        <input
                            id="mobile-memo"
                            type="text"
                            className="form-input"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            placeholder="Ej: Compra de mercaderías"
                        />
                    </div>
                </div>

                {/* Entry line cards */}
                {lines.map((line, index) => {
                    const account = getAccount(line.accountId)
                    const lineType = getLineType(line)
                    const lineAmount = getLineAmount(line)

                    return (
                        <div key={index} className="entry-card">
                            <div className="entry-card-header">
                                <span className="entry-card-number">Línea {index + 1}</span>
                                {lines.length > 2 && (
                                    <button
                                        type="button"
                                        className="entry-card-delete"
                                        onClick={() => removeLine(index)}
                                        aria-label="Eliminar línea"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Account selector */}
                            <div className="entry-card-account">
                                <button
                                    type="button"
                                    className="entry-card-account-btn"
                                    onClick={() => handleOpenPicker(index)}
                                >
                                    {account ? (
                                        <div className="entry-card-account-selected">
                                            <span className="entry-card-account-code">{account.code}</span>
                                            <span className="entry-card-account-name">{account.name}</span>
                                        </div>
                                    ) : (
                                        <span className="entry-card-account-placeholder">
                                            Tocar para seleccionar cuenta...
                                        </span>
                                    )}
                                    <span className="entry-card-account-chevron">›</span>
                                </button>
                            </div>

                            {/* Segmented control: DEBE / HABER */}
                            <div className="entry-card-type">
                                <div className="entry-card-segmented">
                                    <button
                                        type="button"
                                        className={`entry-card-segment debe ${lineType === 'DEBE' ? 'active' : ''}`}
                                        onClick={() => handleTypeChange(index, 'DEBE')}
                                    >
                                        Debe
                                    </button>
                                    <button
                                        type="button"
                                        className={`entry-card-segment haber ${lineType === 'HABER' ? 'active' : ''}`}
                                        onClick={() => handleTypeChange(index, 'HABER')}
                                    >
                                        Haber
                                    </button>
                                </div>
                            </div>

                            {/* Amount input */}
                            <div className="entry-card-amount">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className={`entry-card-amount-input ${lineType.toLowerCase()}`}
                                    value={lineAmount > 0 ? formatARNumber(lineAmount) : ''}
                                    onChange={(e) => handleAmountChange(index, e.target.value)}
                                    placeholder="$ 0"
                                />
                            </div>

                            {/* Description (optional) */}
                            <div className="entry-card-description">
                                <input
                                    type="text"
                                    className="entry-card-description-input"
                                    value={line.description || ''}
                                    onChange={(e) => updateLine(index, { description: e.target.value })}
                                    placeholder="Detalle (opcional)"
                                />
                            </div>
                        </div>
                    )
                })}

                {/* Add line button */}
                <button
                    type="button"
                    className="entry-add-line-btn"
                    onClick={addLine}
                >
                    <span>+</span> Agregar línea
                </button>
            </div>

            {/* Sticky save bar */}
            <div className="mobile-entry-save-bar">
                <div className="mobile-entry-totals">
                    <div className="mobile-entry-total">
                        <span className="mobile-entry-total-label">Debe</span>
                        <span className="mobile-entry-total-value debe">${formatAmount(totalDebit)}</span>
                    </div>
                    <div className="mobile-entry-total">
                        <span className="mobile-entry-total-label">Haber</span>
                        <span className="mobile-entry-total-value haber">${formatAmount(totalCredit)}</span>
                    </div>
                    <div className={`mobile-entry-diff ${isValid ? 'balanced' : 'unbalanced'}`}>
                        {isValid ? '✓' : `-$${formatAmount(diff)}`}
                    </div>
                </div>
                <button
                    type="button"
                    className="mobile-entry-save-btn"
                    onClick={onSave}
                    disabled={!isValid}
                >
                    💾 Guardar
                </button>
            </div>

            {/* Bottom sheet account picker */}
            <BottomSheetAccountPicker
                isOpen={pickerOpen}
                onClose={() => {
                    setPickerOpen(false)
                    setEditingLineIndex(null)
                }}
                onSelect={handleSelectAccount}
                accounts={accounts.filter(a => !a.isHeader)}
                placeholder="Buscar por código o nombre..."
            />
        </>
    )
}
