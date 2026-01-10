import { useState, useMemo, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { createEntry, updateEntry, getTodayISO, createEmptyLine } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { validateEntry, sumDebits, sumCredits } from '../core/validation'
import type { JournalEntry, EntryLine } from '../core/models'
import { HelpPanel } from '../ui/HelpPanel'
import AccountSearchSelect, { AccountSearchSelectRef } from '../ui/AccountSearchSelect'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
    const [isExporting, setIsExporting] = useState(false)

    // Validation UX state
    const [hasAttemptedSave, setHasAttemptedSave] = useState(false)

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleteSuccess, setDeleteSuccess] = useState(false)
    const [editingEntryData, setEditingEntryData] = useState<JournalEntry | null>(null)

    // Refs for focus management (grid)
    const dateRef = useRef<HTMLInputElement>(null)
    const lineRefs = useRef<Array<{
        account: AccountSearchSelectRef | null
        debit: HTMLInputElement | null
        credit: HTMLInputElement | null
        description: HTMLInputElement | null
    }>>([])

    const entriesRef = useRef<HTMLDivElement>(null)

    // Validation
    const draftEntry: JournalEntry = {
        id: editingEntryId || 'draft',
        date,
        memo,
        lines: lines.filter((l) => l.accountId),
    }

    const validation = useMemo(() => {
        if (draftEntry.lines.length < 2) {
            return { ok: false, errors: ['Necesitás al menos 2 líneas con cuenta'], diff: 0 }
        }
        return validateEntry(draftEntry)
    }, [date, memo, lines, editingEntryId])

    const totalDebit = sumDebits(draftEntry)
    const totalCredit = sumCredits(draftEntry)

    // Detect if the entry is "pristine"
    const isPristine = useMemo(() => {
        return !memo && lines.every(l =>
            !l.accountId &&
            l.debit === 0 &&
            l.credit === 0 &&
            !l.description
        ) && !editingEntryId
    }, [memo, lines, editingEntryId])

    const showErrors = hasAttemptedSave || (!isPristine && !editingEntryId)

    // Autofocus removed as per UX requirement


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
        setEditingEntryId(null)
        setEditingEntryData(null)
    }

    const handleEdit = (entry: JournalEntry) => {
        setEditingEntryId(entry.id)
        setEditingEntryData(JSON.parse(JSON.stringify(entry))) // Deep clone
    }

    const handleCancelEdit = () => {
        setEditingEntryId(null)
        setEditingEntryData(null)
    }

    const handleSaveEditedEntry = async () => {
        if (!editingEntryData || !editingEntryId) return

        // Validate
        const totalDebit = editingEntryData.lines.reduce((acc, l) => acc + (l.debit || 0), 0)
        const totalCredit = editingEntryData.lines.reduce((acc, l) => acc + (l.credit || 0), 0)
        const diff = Math.abs(totalDebit - totalCredit)
        const isBalanced = diff < 0.01

        if (!isBalanced) return // Should be blocked by UI, but double check

        try {
            await updateEntry(editingEntryId, editingEntryData)
            setEditingEntryId(null)
            setEditingEntryData(null)
        } catch (error) {
            console.error('Failed to update entry', error)
            alert('Error al guardar los cambios: ' + error)
        }
    }

    const handleSave = async () => {
        setHasAttemptedSave(true)
        setSaveError('')
        setSaveSuccess(false)

        if (!validation.ok) {
            return
        }

        try {
            const entryData = {
                date,
                memo,
                lines: lines.filter((l) => l.accountId),
            }

            if (editingEntryId) {
                await updateEntry(editingEntryId, entryData)
                setSaveSuccess(true)
                resetForm()
            } else {
                await createEntry(entryData)
                setSaveSuccess(true)
                resetForm()
                // Auto-focus Date after successful creation
                requestAnimationFrame(() => dateRef.current?.focus())
            }

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
    }, [validation, handleSave]) // Added handleSave to dependencies

    const getAccountName = (accountId: string) => {
        const acc = accounts?.find((a) => a.id === accountId)
        return acc ? acc.name : 'Cuenta desconocida'
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


    const handleDownloadPDF = async () => {
        if (!entriesRef.current) return
        setIsExporting(true)
        document.documentElement.classList.add('is-exporting')

        try {
            // Wait for state to propagate (hide actions)
            await new Promise(r => setTimeout(r, 100))

            const canvas = await html2canvas(entriesRef.current, {
                scale: 2, // High resolution
                backgroundColor: '#ffffff',
                ignoreElements: (element) => {
                    return element.getAttribute('data-export-exclude') === 'true' || element.classList.contains('no-export')
                }
            })

            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF('p', 'mm', 'a4')
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width

            // Image (Header is now inside)
            pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight)
            pdf.save(`libro_diario_${getTodayISO()}.pdf`)

        } catch (err) {
            console.error('Error exporting PDF:', err)
        } finally {
            setIsExporting(false)
            document.documentElement.classList.remove('is-exporting')
        }
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">Libro Diario</h1>
                    <p className="page-subtitle">Registro cronológico de asientos.</p>
                </div>
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
            </HelpPanel>

            {/* Entry Editor */}
            <div className={`entry-editor ${editingEntryId ? 'editing-mode' : ''}`} style={{ marginBottom: 'var(--space-xl)', borderColor: editingEntryId ? 'var(--color-primary)' : '' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                    <h3>{editingEntryId ? '✏️ Editando asiento' : 'Nuevo asiento'}</h3>
                    {editingEntryId && (
                        <span className="badge badge-primary">Modo Edición</span>
                    )}
                </div>

                {saveSuccess && (
                    <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
                        ✓ {editingEntryId ? 'Cambios guardados correctamente' : 'Asiento guardado correctamente'}
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
                            ref={dateRef}
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
                    <button type="button" className="btn btn-secondary" onClick={editingEntryId ? handleCancelEdit : resetForm}>
                        {editingEntryId ? 'Cancelar edición' : '🗑️ Limpiar'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!validation.ok}
                    >
                        {editingEntryId ? '💾 Guardar cambios' : '💾 Guardar asiento'}
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

            {/* Entry History - Final Aesthetic Polish */}
            <div ref={entriesRef} style={{ width: '100%' }}>
                <div style={{ maxWidth: '980px', margin: '0 auto', width: '100%' }}>
                    {/* PDF Legal Header */}
                    <div className="pdf-only" style={{ marginBottom: '20px', padding: '20px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '15px' }}>
                            <div>
                                <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, textTransform: 'uppercase', color: '#1e293b' }}>LIBRO DIARIO</h1>
                                <div style={{ fontSize: '14px', color: '#64748b' }}>Asientos registrados</div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                                Emitido: {new Date().toLocaleDateString('es-AR')}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px', color: '#334155' }}>
                            <div>
                                <div style={{ marginBottom: '4px' }}><strong>Ente:</strong> ______________________</div>
                                <div style={{ marginBottom: '4px' }}><strong>Domicilio:</strong> ______________________</div>
                                <div><strong>Condición IVA:</strong> Resp. Inscripto</div>
                            </div>
                            <div>
                                <div style={{ marginBottom: '4px' }}><strong>CUIT:</strong> ______________________</div>
                                <div style={{ marginBottom: '4px' }}><strong>Período:</strong> Del __/__/____ al __/__/____</div>
                                <div><strong>Moneda:</strong> Pesos Argentinos (ARS)</div>
                            </div>
                        </div>
                    </div>

                    <div data-export-exclude="true" style={{ marginBottom: 'var(--space-md)', paddingLeft: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Asientos registrados</h3>
                        {entries && entries.length > 0 && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleDownloadPDF}
                                disabled={isExporting}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {isExporting ? 'Generando...' : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                        Descargar PDF
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {entries?.length === 0 ? (
                        <div className="card empty-state">
                            <div className="empty-state-icon">📝</div>
                            <p>Todavía no hay asientos. ¡Cargá el primero arriba!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {entries?.map((entry, index) => {
                                const entryNumber = entries.length - index
                                const isEditing = editingEntryId === entry.id

                                // View Mode Data
                                const displayEntry = isEditing && editingEntryData ? editingEntryData : entry

                                // Inline Edit Logic helpers
                                const totalDebit = sumDebits(displayEntry)
                                const totalCredit = sumCredits(displayEntry)
                                const diff = totalDebit - totalCredit
                                const isBalanced = Math.abs(diff) < 0.01
                                const isValid = isBalanced && displayEntry.lines.length >= 2 && displayEntry.lines.every(l => l.accountId && (l.debit > 0 || l.credit > 0))

                                return (
                                    <div key={entry.id} className="card" style={{ padding: '0', overflow: 'hidden', border: isEditing ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', boxShadow: isEditing ? 'var(--shadow-md)' : 'var(--shadow-sm)' }}>

                                        {/* Header Row */}
                                        <div style={{
                                            padding: '12px 20px',
                                            background: 'var(--color-bg-subtle)',
                                            borderBottom: '1px solid var(--color-border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}>
                                            {isEditing ? (
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.95em', whiteSpace: 'nowrap' }}>Asiento N° {entryNumber}</span>
                                                    <input
                                                        type="date"
                                                        className="form-input form-input-sm"
                                                        value={displayEntry.date}
                                                        onChange={e => setEditingEntryData({ ...displayEntry, date: e.target.value })}
                                                        style={{ width: 'auto' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="form-input form-input-sm"
                                                        placeholder="Concepto..."
                                                        value={displayEntry.memo}
                                                        onChange={e => setEditingEntryData({ ...displayEntry, memo: e.target.value })}
                                                        style={{ flex: 1 }}
                                                    />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95em' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                                        Asiento N° {entryNumber}
                                                    </span>
                                                    <span style={{ color: 'var(--color-border-dark)', opacity: 0.5 }}>|</span>
                                                    <span style={{ color: 'var(--color-text)' }}>
                                                        {formatDate(entry.date)}
                                                    </span>
                                                    {entry.memo && (
                                                        <>
                                                            <span style={{ color: 'var(--color-border-dark)', opacity: 0.5 }}>|</span>
                                                            <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                                {entry.memo}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            <div className="no-export" style={{ display: 'flex', gap: '6px' }}>
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={handleCancelEdit}
                                                            title="Cancelar edición"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={handleSaveEditedEntry}
                                                            disabled={!isValid}
                                                            title={!isValid ? "El asiento debe cuadrar y tener al menos 2 líneas completas" : "Guardar cambios"}
                                                        >
                                                            Guardar
                                                        </button>
                                                    </>
                                                ) : (
                                                    !isExporting && (
                                                        <>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => handleEdit(entry)}
                                                                disabled={editingEntryId !== null} // Disable other edits
                                                                title="Editar asiento"
                                                                style={{ padding: '4px 8px', fontSize: '0.8em', opacity: editingEntryId !== null ? 0.3 : 1 }}
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                className="btn btn-danger-soft btn-sm"
                                                                onClick={() => setDeleteConfirmId(entry.id)}
                                                                disabled={editingEntryId !== null}
                                                                title="Eliminar asiento"
                                                                style={{ padding: '4px 8px', fontSize: '0.8em', opacity: editingEntryId !== null ? 0.3 : 1 }}
                                                            >
                                                                🗑️
                                                            </button>
                                                        </>
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        {/* Table Header - Inside Card */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: isEditing ? '1fr 120px 120px 40px' : '1fr 130px 130px',
                                            gap: '12px',
                                            padding: '8px 20px 6px',
                                            borderBottom: '1px solid rgba(0,0,0,0.03)'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuenta</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Debe</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Haber</div>
                                        </div>

                                        {/* Lines */}
                                        <div style={{ padding: '0' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {displayEntry.lines.map((l, i) => {
                                                    const isCredit = l.credit > 0

                                                    if (isEditing) {
                                                        // Edit Mode Line
                                                        return (
                                                            <div key={i} style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '1fr 120px 120px 40px',
                                                                gap: '12px',
                                                                alignItems: 'center',
                                                                padding: '8px 20px',
                                                                borderBottom: '1px solid rgba(0,0,0,0.04)',
                                                                background: '#fff'
                                                            }}>
                                                                <AccountSearchSelect
                                                                    accounts={accounts || []}
                                                                    value={l.accountId}
                                                                    onChange={(val) => {
                                                                        const newLines = [...displayEntry.lines]
                                                                        newLines[i] = { ...l, accountId: val }
                                                                        setEditingEntryData({ ...displayEntry, lines: newLines })
                                                                    }}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    className="form-input form-input-sm"
                                                                    style={{ textAlign: 'right' }}
                                                                    value={l.debit > 0 ? formatARNumber(l.debit) : ''}
                                                                    onChange={(e) => {
                                                                        const val = parseARNumber(e.target.value)
                                                                        const newLines = [...displayEntry.lines]
                                                                        newLines[i] = { ...l, debit: val, credit: 0 } // Mutual exclusion
                                                                        setEditingEntryData({ ...displayEntry, lines: newLines })
                                                                    }}
                                                                    placeholder="0,00"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    className="form-input form-input-sm"
                                                                    style={{ textAlign: 'right' }}
                                                                    value={l.credit > 0 ? formatARNumber(l.credit) : ''}
                                                                    onChange={(e) => {
                                                                        const val = parseARNumber(e.target.value)
                                                                        const newLines = [...displayEntry.lines]
                                                                        newLines[i] = { ...l, credit: val, debit: 0 } // Mutual exclusion
                                                                        setEditingEntryData({ ...displayEntry, lines: newLines })
                                                                    }}
                                                                    placeholder="0,00"
                                                                />
                                                                <button
                                                                    className="btn btn-icon btn-danger-soft btn-sm"
                                                                    onClick={() => {
                                                                        const newLines = displayEntry.lines.filter((_, idx) => idx !== i)
                                                                        setEditingEntryData({ ...displayEntry, lines: newLines })
                                                                    }}
                                                                    tabIndex={-1}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        )
                                                    }

                                                    // View Mode Line - Classic Arrow Style
                                                    return (
                                                        <div key={i} style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr 130px 130px',
                                                            gap: '12px',
                                                            alignItems: 'center',
                                                            padding: '8px 20px',
                                                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                                                            background: '#fff'
                                                        }}>
                                                            {/* Account Name */}
                                                            <div style={{ paddingLeft: isCredit ? '24px' : '0', display: 'flex', alignItems: 'center' }}>
                                                                {isCredit && (
                                                                    <span style={{
                                                                        color: 'var(--color-border-dark)',
                                                                        opacity: 0.6,
                                                                        marginRight: '8px',
                                                                        fontSize: '1em',
                                                                        transform: 'translateY(-1px)'
                                                                    }}>→</span>
                                                                )}
                                                                <div>
                                                                    <div style={{ fontWeight: 500, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                                                                        {getAccountName(l.accountId)}
                                                                    </div>
                                                                    {l.description && (
                                                                        <div style={{ fontSize: '0.8em', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                                            {l.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Debit */}
                                                            <div style={{ textAlign: 'right', fontSize: '0.95em', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                                {l.debit > 0 ? (
                                                                    <span>{formatAmount(l.debit)}</span>
                                                                ) : ''}
                                                            </div>

                                                            {/* Credit */}
                                                            <div style={{ textAlign: 'right', fontSize: '0.95em', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                                {l.credit > 0 ? (
                                                                    <span>{formatAmount(l.credit)}</span>
                                                                ) : ''}
                                                            </div>
                                                        </div>
                                                    )
                                                })}

                                                {isEditing && (
                                                    <div style={{ padding: '8px 20px' }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ width: '100%', borderStyle: 'dashed' }}
                                                            onClick={() => {
                                                                setEditingEntryData({
                                                                    ...displayEntry,
                                                                    lines: [...displayEntry.lines, createEmptyLine()]
                                                                })
                                                            }}
                                                        >
                                                            + Agregar línea
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Footer Totals */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: isEditing ? '1fr 120px 120px 40px' : '1fr 130px 130px',
                                            gap: '12px',
                                            padding: '10px 20px',
                                            background: 'rgba(15,23,42,0.02)',
                                            borderTop: '1px solid var(--color-border-light)',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                                {isEditing && !isBalanced ? (
                                                    <span style={{ color: 'var(--color-danger)', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                                                        Diferencia: ${formatAmount(Math.abs(diff))}
                                                    </span>
                                                ) : 'Totales'}
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.95em', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                ${formatAmount(totalDebit)}
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.95em', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                ${formatAmount(totalCredit)}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
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
