import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { createEntry, getTodayISO, createEmptyLine } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { validateEntry, sumDebits, sumCredits } from '../core/validation'
import type { JournalEntry, EntryLine } from '../core/models'
import { HelpPanel } from '../ui/HelpPanel'
import AccountSearchSelect from '../ui/AccountSearchSelect'

export default function Asientos() {
    const accounts = useLiveQuery(() => getPostableAccounts())
    const entries = useLiveQuery(() => db.entries.orderBy('date').reverse().toArray())

    // Form state
    const [date, setDate] = useState(getTodayISO())
    const [memo, setMemo] = useState('')
    const [lines, setLines] = useState<EntryLine[]>([createEmptyLine(), createEmptyLine()])
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState(false)

    // Validation
    const draftEntry: JournalEntry = {
        id: 'draft',
        date,
        memo,
        lines: lines.filter((l) => l.accountId), // Only lines with account
    }

    const validation = useMemo(() => {
        if (draftEntry.lines.length < 2) {
            return { ok: false, errors: ['Necesitás al menos 2 líneas con cuenta'], diff: 0 }
        }
        return validateEntry(draftEntry)
    }, [date, memo, lines])

    const totalDebit = sumDebits(draftEntry)
    const totalCredit = sumCredits(draftEntry)

    const updateLine = (index: number, updates: Partial<EntryLine>) => {
        const newLines = [...lines]
        newLines[index] = { ...newLines[index], ...updates }
        setLines(newLines)
    }

    const addLine = () => {
        setLines([...lines, createEmptyLine()])
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
    }

    const handleSave = async () => {
        setSaveError('')
        setSaveSuccess(false)

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

    const getAccountName = (accountId: string) => {
        const acc = accounts?.find((a) => a.id === accountId)
        return acc ? `${acc.code} - ${acc.name}` : ''
    }

    const formatAmount = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
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
                                accounts={accounts || []}
                                value={line.accountId}
                                onChange={(accountId) => updateLine(index, { accountId })}
                                placeholder="Buscar cuenta..."
                            />

                            <input
                                type="number"
                                className="form-input form-input-number"
                                value={line.debit || ''}
                                onChange={(e) =>
                                    updateLine(index, {
                                        debit: parseFloat(e.target.value) || 0,
                                        credit: 0,
                                    })
                                }
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                            />

                            <input
                                type="number"
                                className="form-input form-input-number"
                                value={line.credit || ''}
                                onChange={(e) =>
                                    updateLine(index, {
                                        credit: parseFloat(e.target.value) || 0,
                                        debit: 0,
                                    })
                                }
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                            />

                            <input
                                type="text"
                                className="form-input"
                                value={line.description || ''}
                                onChange={(e) => updateLine(index, { description: e.target.value })}
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

                {!validation.ok && validation.errors.length > 0 && (
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
                        Limpiar
                    </button>
                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={handleSave}
                        disabled={!validation.ok}
                    >
                        💾 Guardar asiento
                    </button>
                </div>
            </div>

            {/* Entry History */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Asientos guardados</h3>
                </div>

                {entries?.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📝</div>
                        <p>Todavía no hay asientos. ¡Cargá el primero arriba!</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Concepto</th>
                                    <th className="text-right">Debe</th>
                                    <th className="text-right">Haber</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries?.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{formatDate(entry.date)}</td>
                                        <td>
                                            <strong>{entry.memo || '(sin concepto)'}</strong>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                                {entry.lines.map((l, i) => (
                                                    <div key={i}>
                                                        {getAccountName(l.accountId)}: {l.debit > 0 ? `D $${formatAmount(l.debit)}` : `H $${formatAmount(l.credit)}`}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="table-number">${formatAmount(sumDebits(entry))}</td>
                                        <td className="table-number">${formatAmount(sumCredits(entry))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
