/**
 * NewEntryModal - Modal for creating new journal entries
 */
import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Account, EntryLine } from '../../core/models'
import AccountSearchSelect, { AccountSearchSelectRef } from '../../ui/AccountSearchSelect'

interface NewEntryModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: { date: string; memo: string; lines: EntryLine[] }) => Promise<void>
    accounts: Account[]
    initialDate: string
}

const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

const parseARNumber = (value: string): number => {
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.max(0, num)
}

const formatARNumber = (n: number): string => {
    if (n === 0) return ''
    return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const createEmptyLine = (): EntryLine => ({
    accountId: '',
    debit: 0,
    credit: 0,
    description: ''
})

export function NewEntryModal({ isOpen, onClose, onSave, accounts, initialDate }: NewEntryModalProps) {
    const [date, setDate] = useState(initialDate)
    const [memo, setMemo] = useState('')
    const [lines, setLines] = useState<EntryLine[]>([createEmptyLine(), createEmptyLine()])
    const [isSaving, setIsSaving] = useState(false)

    // Refs for focus management
    const lineRefs = useRef<Array<{
        account: AccountSearchSelectRef | null
        debit: HTMLInputElement | null
        credit: HTMLInputElement | null
        description: HTMLInputElement | null
    }>>([])

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setDate(initialDate)
            setMemo('')
            setLines([createEmptyLine(), createEmptyLine()])
            setIsSaving(false)
        }
    }, [isOpen, initialDate])

    // ESC to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEsc)
        return () => document.removeEventListener('keydown', handleEsc)
    }, [isOpen, onClose])

    // Derived state
    const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
    const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
    const diff = totalDebit - totalCredit
    const isBalanced = Math.abs(diff) < 0.01 && totalDebit > 0
    const hasValidLines = lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0)).length >= 2
    const canSave = isBalanced && hasValidLines

    const updateLine = (index: number, updates: Partial<EntryLine>) => {
        const newLines = [...lines]
        const line = { ...newLines[index], ...updates }

        // Mutual exclusion: if debit > 0, clear credit and vice versa
        if (updates.debit !== undefined && updates.debit > 0) {
            line.credit = 0
        }
        if (updates.credit !== undefined && updates.credit > 0) {
            line.debit = 0
        }

        newLines[index] = line
        setLines(newLines)
    }

    const addLine = () => {
        setLines([...lines, createEmptyLine()])
        setTimeout(() => {
            const lastIndex = lines.length
            lineRefs.current[lastIndex]?.account?.focus()
        }, 50)
    }

    const removeLine = (index: number) => {
        if (lines.length > 2) {
            setLines(lines.filter((_, i) => i !== index))
        }
    }

    const handleSave = async () => {
        if (!canSave || isSaving) return

        setIsSaving(true)
        try {
            await onSave({
                date,
                memo,
                lines: lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0))
            })
            onClose()
        } catch (error) {
            console.error('Error saving entry:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleAccountSelected = (index: number) => {
        setTimeout(() => {
            lineRefs.current[index]?.debit?.focus()
        }, 50)
    }

    const handleKeyDown = (
        e: React.KeyboardEvent,
        index: number,
        field: 'debit' | 'credit' | 'description'
    ) => {
        const isLastLine = index === lines.length - 1

        if (e.key === 'Enter') {
            e.preventDefault()
            if (field === 'debit') {
                const val = lines[index].debit
                if (val > 0) {
                    lineRefs.current[index]?.description?.focus()
                } else {
                    lineRefs.current[index]?.credit?.focus()
                }
            } else if (field === 'credit') {
                lineRefs.current[index]?.description?.focus()
            } else if (field === 'description') {
                if (isLastLine) {
                    addLine()
                } else {
                    lineRefs.current[index + 1]?.account?.focus()
                }
            }
        }

        if (e.key === 'Tab' && !e.shiftKey) {
            if (field === 'debit' && lines[index].debit > 0) {
                e.preventDefault()
                lineRefs.current[index]?.description?.focus()
            } else if (field === 'description' && isLastLine) {
                e.preventDefault()
                addLine()
            }
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="journal-modal-overlay">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="journal-modal-backdrop"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="journal-modal"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="journal-modal-header">
                            <div>
                                <h2 className="journal-modal-title">Nuevo asiento</h2>
                                <p className="journal-modal-subtitle">
                                    Completá al menos 2 líneas que equilibren Debe y Haber.
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="journal-modal-close"
                                aria-label="Cerrar"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="journal-modal-body">
                            {/* Top Form */}
                            <div className="journal-modal-form-row">
                                <div className="journal-modal-form-group">
                                    <label className="journal-modal-label">Fecha</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="journal-modal-input journal-modal-input-date"
                                    />
                                </div>
                                <div className="journal-modal-form-group journal-modal-form-group-grow">
                                    <label className="journal-modal-label">Concepto / Leyenda</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Cobro facturas mes de enero..."
                                        value={memo}
                                        onChange={(e) => setMemo(e.target.value)}
                                        className="journal-modal-input"
                                    />
                                </div>
                            </div>

                            {/* Lines Table */}
                            <div className="journal-modal-lines">
                                <table className="journal-modal-lines-table">
                                    <thead>
                                        <tr>
                                            <th className="journal-modal-th-account">Cuenta</th>
                                            <th className="journal-modal-th-amount">Debe</th>
                                            <th className="journal-modal-th-amount">Haber</th>
                                            <th className="journal-modal-th-detail">Detalle (Opcional)</th>
                                            <th className="journal-modal-th-action"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line, index) => (
                                            <tr key={index} className="journal-modal-line-row">
                                                <td className="journal-modal-td-account">
                                                    <AccountSearchSelect
                                                        ref={(el) => {
                                                            if (!lineRefs.current[index]) {
                                                                lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                                            }
                                                            lineRefs.current[index].account = el
                                                        }}
                                                        accounts={accounts}
                                                        value={line.accountId}
                                                        onChange={(accountId) => updateLine(index, { accountId })}
                                                        placeholder="Buscar cuenta..."
                                                        onAccountSelected={() => handleAccountSelected(index)}
                                                    />
                                                </td>
                                                <td className="journal-modal-td-amount">
                                                    <input
                                                        ref={(el) => {
                                                            if (!lineRefs.current[index]) {
                                                                lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                                            }
                                                            lineRefs.current[index].debit = el
                                                        }}
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder="0,00"
                                                        value={line.debit > 0 ? formatARNumber(line.debit) : ''}
                                                        onChange={(e) => updateLine(index, { debit: parseARNumber(e.target.value) })}
                                                        onKeyDown={(e) => handleKeyDown(e, index, 'debit')}
                                                        disabled={line.credit > 0}
                                                        className="journal-modal-input-amount"
                                                    />
                                                </td>
                                                <td className="journal-modal-td-amount">
                                                    <input
                                                        ref={(el) => {
                                                            if (!lineRefs.current[index]) {
                                                                lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                                            }
                                                            lineRefs.current[index].credit = el
                                                        }}
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder="0,00"
                                                        value={line.credit > 0 ? formatARNumber(line.credit) : ''}
                                                        onChange={(e) => updateLine(index, { credit: parseARNumber(e.target.value) })}
                                                        onKeyDown={(e) => handleKeyDown(e, index, 'credit')}
                                                        disabled={line.debit > 0}
                                                        className="journal-modal-input-amount"
                                                    />
                                                </td>
                                                <td className="journal-modal-td-detail">
                                                    <input
                                                        ref={(el) => {
                                                            if (!lineRefs.current[index]) {
                                                                lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                                            }
                                                            lineRefs.current[index].description = el
                                                        }}
                                                        type="text"
                                                        placeholder="Detalle línea..."
                                                        value={line.description || ''}
                                                        onChange={(e) => updateLine(index, { description: e.target.value })}
                                                        onKeyDown={(e) => handleKeyDown(e, index, 'description')}
                                                        className="journal-modal-input-detail"
                                                    />
                                                </td>
                                                <td className="journal-modal-td-action">
                                                    <button
                                                        onClick={() => removeLine(index)}
                                                        className="journal-modal-remove-line"
                                                        disabled={lines.length <= 2}
                                                        tabIndex={-1}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <button onClick={addLine} className="journal-modal-add-line">
                                    <Plus size={16} /> Agregar línea
                                </button>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="journal-modal-footer">
                            {/* Balance Status */}
                            <div className="journal-modal-balance">
                                <div className="journal-modal-balance-item">
                                    <span className="journal-modal-balance-label">Total Debe</span>
                                    <span className="journal-modal-balance-value">{formatMoney(totalDebit)}</span>
                                </div>
                                <div className="journal-modal-balance-divider"></div>
                                <div className="journal-modal-balance-item">
                                    <span className="journal-modal-balance-label">Total Haber</span>
                                    <span className="journal-modal-balance-value">{formatMoney(totalCredit)}</span>
                                </div>

                                <div className={`journal-modal-balance-badge ${isBalanced ? 'balanced' : 'unbalanced'}`}>
                                    {isBalanced ? (
                                        <>
                                            <CheckCircle size={16} />
                                            <span>Asiento Balanceado</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle size={16} />
                                            <span>Diferencia: {formatMoney(Math.abs(diff))}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="journal-modal-actions">
                                <button onClick={onClose} className="journal-modal-btn-cancel">
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!canSave || isSaving}
                                    className={`journal-modal-btn-save ${canSave ? 'enabled' : 'disabled'}`}
                                >
                                    <span>{isSaving ? 'Guardando...' : 'Guardar asiento'}</span>
                                    {!isSaving && <ArrowRight size={16} />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
