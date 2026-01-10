import { useState, useMemo, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { createEntry, getTodayISO, createEmptyLine } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { validateEntry, sumDebits, sumCredits } from '../core/validation'
import type { JournalEntry, EntryLine } from '../core/models'
import { HelpPanel } from '../ui/HelpPanel'
import AccountSearchSelect, { AccountSearchSelectRef } from '../ui/AccountSearchSelect'

// ─────────────────────────────────────────────────────────────────────────────
// Number formatting utilities for Argentine format (miles con punto)
// ─────────────────────────────────────────────────────────────────────────────

const parseARNumber = (value: string): number => {
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.max(0, num)
}

const formatARNumber = (n: number): string => {
    if (n === 0) return ''
    return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const formatAmount = (n: number): string => {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AsientosDesktop() {
    const accounts = useLiveQuery(() => getPostableAccounts())
    const entries = useLiveQuery(() => db.entries.orderBy('date').reverse().toArray())

    // Form state
    const [date, setDate] = useState(getTodayISO())
    const [memo, setMemo] = useState('')
    const [lines, setLines] = useState<EntryLine[]>([createEmptyLine(), createEmptyLine()])
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState(false)

    // Validation UX state
    const [hasAttemptedSave, setHasAttemptedSave] = useState(false)

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleteSuccess, setDeleteSuccess] = useState(false)

    // Refs for focus management (grid)
    const lineRefs = useRef<Array<{
        account: AccountSearchSelectRef | null
        debit: HTMLInputElement | null
        credit: HTMLInputElement | null
        description: HTMLInputElement | null
    }>>([])

    // Validation
    const draftEntry: JournalEntry = {
        id: 'draft',
        date,
        memo,
        lines: lines.filter((l) => l.accountId),
    }

    const validation = useMemo(() => {
        if (draftEntry.lines.length < 2) {
            return { ok: false, errors: ['Necesitás al menos 2 líneas con cuenta'], diff: 0 }
        }
        return validateEntry(draftEntry)
    }, [date, memo, lines])

    const totalDebit = sumDebits(draftEntry)
    const totalCredit = sumCredits(draftEntry)

    // Detect if the entry is "pristine"
    const isPristine = useMemo(() => {
        return !memo && lines.every(l =>
            !l.accountId &&
            l.debit === 0 &&
            l.credit === 0 &&
            !l.description
        )
    }, [memo, lines])

    const showErrors = hasAttemptedSave || !isPristine

    // Autofocus on first account search when page loads
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const timer = setTimeout(() => {
                lineRefs.current[0]?.account?.focus()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [accounts])

    const updateLine = (index: number, updates: Partial<EntryLine>) => {
        const newLines = [...lines]
        const line = { ...newLines[index], ...updates }

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
        // Focus the new line's account after render
        setTimeout(() => {
            const lastIndex = lines.length // Because we added one
            lineRefs.current[lastIndex]?.account?.focus()
        }, 50)
    }

    const removeLine = (index: number) => {
        if (lines.length > 2) {
            setLines(lines.filter((_, i) => i !== index))
        }
    }

    const resetForm = () => {
        setDate(getTodayISO())
        setMemo('')
        setLines([createEmptyLine(), createEmptyLine()])
        setSaveError('')
        setSaveSuccess(false)
        setHasAttemptedSave(false)
    }

    const handleSave = async () => {
        setHasAttemptedSave(true)
        setSaveError('')
        setSaveSuccess(false)

        if (!validation.ok) {
            return
        }

        try {
            await createEntry({
                date,
                memo,
                lines: lines.filter((l) => l.accountId),
            })
            setSaveSuccess(true)
            resetForm()
            setTimeout(() => setSaveSuccess(false), 3000)
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Error al guardar')
        }
    }

    const handleAccountSelected = (index: number) => {
        // Move focus to Debit
        setTimeout(() => {
            lineRefs.current[index]?.debit?.focus()
        }, 50)
    }

    // Keyboard Navigation Logic
    const handleKeyDown = (
        e: React.KeyboardEvent,
        index: number,
        field: 'account' | 'debit' | 'credit' | 'description'
    ) => {
        const isLastLine = index === lines.length - 1

        switch (e.key) {
            case 'Enter': {
                e.preventDefault()
                // If it's the last line and last field (or valid previous field), try to save
                if (validation.ok && (field === 'description' || field === 'credit' || (field === 'debit' && lines[index].debit > 0)) && isLastLine) {
                    handleSave()
                    return
                }

                // If not ready to save, move to next field naturally or custom
                if (field === 'account') {
                    // Should be handled by AccountSelect onAccountSelected, but if Enter pressed without selection:
                    lineRefs.current[index]?.debit?.focus()
                } else if (field === 'debit') {
                    // Smart navigation: if debit has value, skip credit
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
                        // Auto-add line
                        addLine()
                    } else {
                        // Go to next line account
                        lineRefs.current[index + 1]?.account?.focus()
                    }
                }
                break
            }
            case 'Tab': {
                if (e.shiftKey) return // Let default shift-tab work

                if (field === 'debit') {
                    const val = lines[index].debit
                    if (val > 0) {
                        e.preventDefault()
                        lineRefs.current[index]?.description?.focus()
                    }
                } else if (field === 'description' && isLastLine) {
                    e.preventDefault()
                    addLine()
                }
                break
            }
        }
    }

    // Global shortcut for Ctrl+Enter
    useEffect(() => {
        const handleGlobalStart = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (validation.ok) {
                    handleSave()
                }
            }
        }
        window.addEventListener('keydown', handleGlobalStart)
        return () => window.removeEventListener('keydown', handleGlobalStart)
    }, [validation])

    const getAccountName = (accountId: string) => {
        const acc = accounts?.find((a) => a.id === accountId)
        return acc ? `${acc.code} - ${acc.name}` : ''
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    }

    const handleDeleteEntry = async (id: string) => {
        try {
            await db.entries.delete(id)
            setDeleteConfirmId(null)
            setDeleteSuccess(true)
            setTimeout(() => setDeleteSuccess(false), 3000)
        } catch (err) {
            console.error('Error deleting entry:', err)
        }
    }

    const handleDownloadCSV = () => {
        if (!entries || entries.length === 0) return

        const headers = ['Nro', 'Fecha', 'Concepto', 'Cuenta', 'Debe', 'Haber', 'Detalle']
        const rows: string[][] = []

        entries.forEach((entry, entryIndex) => {
            entry.lines.forEach((line) => {
                rows.push([
                    String(entryIndex + 1),
                    formatDate(entry.date),
                    entry.memo || '',
                    getAccountName(line.accountId),
                    line.debit > 0 ? formatAmount(line.debit) : '',
                    line.credit > 0 ? formatAmount(line.credit) : '',
                    line.description || ''
                ])
            })
        })

        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const today = new Date().toISOString().split('T')[0]
        link.href = url
        link.download = `libro-diario_${today}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Libro Diario</h1>
                <p className="page-subtitle">Registrá asientos contables y mirá el historial.</p>
            </header>

            <HelpPanel title="¿Cómo cargo un asiento?">
                <p>
                    Un asiento tiene dos partes: el <strong>Debe</strong> (lo que entra o aumenta) y el{' '}
                    <strong>Haber</strong> (lo que sale o disminuye).
                </p>
                <p>
                    <strong>Regla de oro:</strong> La suma del Debe siempre tiene que ser igual a la suma
                    del Haber. Si no cuadra, el asiento no se puede guardar.
                </p>
                <p>
                    <em>Ejemplo:</em> Si comprás mercaderías en efectivo por $1000, aumenta Mercaderías
                    (Debe) y disminuye Caja (Haber).
                </p>
            </HelpPanel>

            {/* Entry Editor */}
            <div className="entry-editor" style={{ marginBottom: 'var(--space-xl)' }}>
                <h3 style={{ marginBottom: 'var(--space-lg)' }}>Nuevo asiento</h3>

                {saveSuccess && (
                    <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
                        ✓ Asiento guardado correctamente
                    </div>
                )}

                {saveError && (
                    <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                        {saveError}
                    </div>
                )}

                <div className="entry-header">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="date">
                            Fecha
                        </label>
                        <input
                            id="date"
                            type="date"
                            className="form-input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            tabIndex={-1}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="memo">
                            Concepto / Memo
                        </label>
                        <input
                            id="memo"
                            type="text"
                            className="form-input"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            placeholder="Ej: Compra de mercaderías según factura A-0001"
                            tabIndex={-1}
                        />
                    </div>
                </div>

                <div className="entry-lines">
                    <div className="entry-line-header">
                        <span>Cuenta</span>
                        <span>Debe</span>
                        <span>Haber</span>
                        <span>Descripción</span>
                        <span></span>
                    </div>

                    {lines.map((line, index) => (
                        <div key={index} className="entry-line">
                            <AccountSearchSelect
                                ref={(el) => {
                                    if (!lineRefs.current[index]) lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                    lineRefs.current[index].account = el
                                }}
                                accounts={accounts || []}
                                value={line.accountId}
                                onChange={(accountId) => updateLine(index, { accountId })}
                                placeholder="Buscar cuenta..."
                                onAccountSelected={() => handleAccountSelected(index)}
                            />

                            <input
                                ref={(el) => {
                                    if (!lineRefs.current[index]) lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                    lineRefs.current[index].debit = el
                                }}
                                type="text"
                                inputMode="numeric"
                                className={`form-input form-input-number ${line.credit > 0 ? 'input-disabled' : ''}`}
                                value={line.debit > 0 ? formatARNumber(line.debit) : ''}
                                onChange={(e) => updateLine(index, { debit: parseARNumber(e.target.value) })}
                                onKeyDown={(e) => handleKeyDown(e, index, 'debit')}
                                disabled={line.credit > 0}
                                placeholder="0"
                            />

                            <input
                                ref={(el) => {
                                    if (!lineRefs.current[index]) lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                    lineRefs.current[index].credit = el
                                }}
                                type="text"
                                inputMode="numeric"
                                className={`form-input form-input-number ${line.debit > 0 ? 'input-disabled' : ''}`}
                                value={line.credit > 0 ? formatARNumber(line.credit) : ''}
                                onChange={(e) => updateLine(index, { credit: parseARNumber(e.target.value) })}
                                onKeyDown={(e) => handleKeyDown(e, index, 'credit')}
                                disabled={line.debit > 0}
                                placeholder="0"
                            />

                            <input
                                ref={(el) => {
                                    if (!lineRefs.current[index]) lineRefs.current[index] = { account: null, debit: null, credit: null, description: null }
                                    lineRefs.current[index].description = el
                                }}
                                type="text"
                                className="form-input"
                                value={line.description || ''}
                                onChange={(e) => updateLine(index, { description: e.target.value })}
                                onKeyDown={(e) => handleKeyDown(e, index, 'description')}
                                placeholder="Detalle (opcional)"
                            />

                            <button
                                type="button"
                                className="btn btn-secondary btn-icon"
                                onClick={() => removeLine(index)}
                                disabled={lines.length <= 2}
                                title="Eliminar línea"
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    <button type="button" className="btn btn-secondary" onClick={addLine}>
                        + Agregar línea
                    </button>
                </div>

                <div className="entry-totals">
                    <div className="entry-total">
                        <div className="entry-total-label">Total Debe</div>
                        <div className="entry-total-value">${formatAmount(totalDebit)}</div>
                    </div>
                    <div className="entry-total">
                        <div className="entry-total-label">Total Haber</div>
                        <div className="entry-total-value">${formatAmount(totalCredit)}</div>
                    </div>
                    <div className={`entry-balance ${validation.ok ? 'balanced' : 'unbalanced'}`}>
                        {validation.ok ? '✓ Cuadra' : `✗ Diferencia: $${formatAmount(Math.abs(validation.diff))}`}
                    </div>
                </div>

                {showErrors && !validation.ok && validation.errors.length > 0 && (
                    <div className="alert alert-warning" style={{ marginBottom: 'var(--space-md)' }}>
                        <div>
                            <strong>El asiento tiene errores:</strong>
                            <ul style={{ margin: '0.5rem 0 0 1rem', paddingLeft: 0 }}>
                                {validation.errors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                <div className="entry-actions">
                    <button type="button" className="btn btn-secondary" onClick={resetForm}>
                        🗑️ Limpiar
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!validation.ok}
                    >
                        💾 Guardar asiento
                    </button>
                </div>

                {/* Partner Account Guide Helper */}
                {useMemo(() => {
                    const hasPartnerAccount = lines.some(line => {
                        const acc = accounts?.find(a => a.id === line.accountId)
                        if (!acc) return false
                        const name = acc.name.toLowerCase()
                        return name.includes('socio') || name.includes('dividendo') || name.includes('distrib') || name.includes('retiro')
                    })

                    if (!hasPartnerAccount) return null

                    return (
                        <div className="alert alert-info" style={{ marginTop: 'var(--space-lg)' }}>
                            <strong>💡 Guía rápida para Socios y Dividendos:</strong>
                            <ul style={{ margin: '0.5rem 0 0 1rem', paddingLeft: 0, fontSize: '0.9em' }}>
                                <li>
                                    <strong>Préstamo al socio:</strong> Debe <em>Créditos a socios</em> / Haber <em>Caja</em>
                                </li>
                                <li>
                                    <strong>La empresa debe al socio:</strong> Debe <em>Caja</em> / Haber <em>Deudas con socios</em>
                                </li>
                                <li>
                                    <strong>Retiro de utilidades:</strong> Debe <em>Retiros de socios (PN)</em> / Haber <em>Dividendos a pagar</em>
                                </li>
                            </ul>
                        </div>
                    )
                }, [lines, accounts])}
            </div>

            {/* Delete success toast */}
            {deleteSuccess && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
                    ✓ Asiento eliminado correctamente
                </div>
            )}

            {/* Entry History */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Asientos registrados</h3>
                    {entries && entries.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleDownloadCSV}
                        >
                            📥 Descargar libro diario
                        </button>
                    )}
                </div>

                {entries?.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📝</div>
                        <p>Todavía no hay asientos. ¡Cargá el primero arriba!</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table entries-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Concepto</th>
                                    <th className="text-right">Debe</th>
                                    <th className="text-right">Haber</th>
                                    <th className="text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries?.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{formatDate(entry.date)}</td>
                                        <td>
                                            <strong>{entry.memo || '(sin concepto)'}</strong>
                                            <div className="entry-lines-detail">
                                                {entry.lines.map((l, i) => (
                                                    <div key={i}>
                                                        {getAccountName(l.accountId)}: {l.debit > 0 ? `D $${formatAmount(l.debit)}` : `H $${formatAmount(l.credit)}`}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="table-number">${formatAmount(sumDebits(entry))}</td>
                                        <td className="table-number">${formatAmount(sumCredits(entry))}</td>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                className="btn btn-danger-soft btn-sm"
                                                onClick={() => setDeleteConfirmId(entry.id)}
                                                title="Eliminar asiento"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">⚠️ Confirmar eliminación</h3>
                            <button
                                type="button"
                                className="btn btn-icon btn-secondary"
                                onClick={() => setDeleteConfirmId(null)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>¿Eliminar este asiento? Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setDeleteConfirmId(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleDeleteEntry(deleteConfirmId)}
                            >
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
