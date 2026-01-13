import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText } from 'lucide-react'

import { db } from '../storage/db'
import { createEntry, getTodayISO, createEmptyLine } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { sumDebits, sumCredits } from '../core/validation'
import type { JournalEntry, EntryLine } from '../core/models'

import ImportAsientosUX from '../components/ImportAsientosUX'
import { HeroSection, JournalToolbar, EntryCard, NewEntryModal } from '../components/journal'
import { downloadJournalPdf } from '../pdf/journalPdf'
import AccountSearchSelect from '../ui/AccountSearchSelect'

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

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isImportOpen, setIsImportOpen] = useState(false)

    // UI State
    const [searchQuery, setSearchQuery] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null)

    // Inline editing state
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
    const [editingEntryData, setEditingEntryData] = useState<JournalEntry | null>(null)

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleteSuccess, setDeleteSuccess] = useState(false)

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────────────────

    const handleNewEntry = () => {
        setIsModalOpen(true)
    }

    const handleImport = () => {
        setIsImportOpen(true)
    }

    const handleSaveNewEntry = async (data: { date: string; memo: string; lines: EntryLine[] }) => {
        await createEntry({
            date: data.date,
            memo: data.memo,
            lines: data.lines,
        })
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

        const totalDebit = editingEntryData.lines.reduce((acc, l) => acc + (l.debit || 0), 0)
        const totalCredit = editingEntryData.lines.reduce((acc, l) => acc + (l.credit || 0), 0)
        const diff = Math.abs(totalDebit - totalCredit)
        const isBalanced = diff < 0.01

        if (!isBalanced) return

        try {
            await db.entries.update(editingEntryId, {
                date: editingEntryData.date,
                memo: editingEntryData.memo,
                lines: editingEntryData.lines,
            })
            setEditingEntryId(null)
            setEditingEntryData(null)
        } catch (error) {
            console.error('Failed to update entry', error)
            alert('Error al guardar los cambios: ' + error)
        }
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
        if (!entries || entries.length === 0) return
        setIsExporting(true)

        try {
            await downloadJournalPdf(entries, accounts || [], {
                entityName: '',
                cuit: '',
                address: '',
                ivaCondition: 'Resp. Inscripto',
                periodStart: '',
                periodEnd: '',
                currency: 'Pesos Argentinos (ARS)',
                generatedBy: 'Generado por ContaLivre'
            })
        } catch (err) {
            console.error('Error exporting PDF:', err)
            alert('Hubo un error al generar el PDF.')
        } finally {
            setIsExporting(false)
        }
    }

    const getAccountName = (accountId: string) => {
        const acc = accounts?.find((a) => a.id === accountId)
        return acc ? acc.name : 'Cuenta desconocida'
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Filter entries (simple search)
    // ─────────────────────────────────────────────────────────────────────────

    const filteredEntries = (entries || []).filter(entry => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()

        // Search in memo
        if (entry.memo.toLowerCase().includes(q)) return true

        // Search in account names
        const accountMatches = entry.lines.some(line => {
            const accName = getAccountName(line.accountId).toLowerCase()
            return accName.includes(q)
        })
        if (accountMatches) return true

        // Search in amounts
        const amountMatches = entry.lines.some(line => {
            const debitStr = formatAmount(line.debit)
            const creditStr = formatAmount(line.credit)
            return debitStr.includes(q) || creditStr.includes(q)
        })
        if (amountMatches) return true

        return false
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div>
            {/* Hero Section */}
            <HeroSection
                onNewEntry={handleNewEntry}
                onImport={handleImport}
            />

            {/* Import Modal (hidden trigger) */}
            {isImportOpen && (
                <ImportAsientosUX
                    embed={false}
                    buttonLabel=""
                    autoOpen
                    onClose={() => setIsImportOpen(false)}
                    onSuccess={(count) => {
                        setImportSuccessCount(count)
                        setIsImportOpen(false)
                        setTimeout(() => setImportSuccessCount(null), 5000)
                    }}
                />
            )}

            {/* Import Success Toast */}
            {importSuccessCount !== null && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
                    ✓ Se importaron {importSuccessCount} asientos correctamente.
                </div>
            )}

            {/* Delete success toast */}
            {deleteSuccess && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
                    ✓ Asiento eliminado correctamente
                </div>
            )}

            {/* Toolbar */}
            <JournalToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onDownloadPDF={handleDownloadPDF}
                isExporting={isExporting}
            />

            {/* Entries List */}
            <div>
                {filteredEntries.length === 0 ? (
                    <div className="journal-empty-state">
                        <div className="journal-empty-state-icon">
                            <FileText size={32} />
                        </div>
                        <h3 className="journal-empty-state-title">
                            {entries?.length === 0
                                ? 'No hay asientos registrados'
                                : 'No se encontraron resultados'
                            }
                        </h3>
                        <p className="journal-empty-state-description">
                            {entries?.length === 0
                                ? 'Comenzá registrando tu primer movimiento contable haciendo clic en "Nuevo asiento".'
                                : 'Intentá con otros términos de búsqueda.'
                            }
                        </p>
                    </div>
                ) : (
                    <div>
                        {filteredEntries.map((entry) => {
                            const entryNumber = (entries?.length || 0) - (entries?.findIndex(e => e.id === entry.id) || 0)
                            const isEditing = editingEntryId === entry.id
                            const displayEntry = isEditing && editingEntryData ? editingEntryData : entry

                            // Inline Edit Logic helpers
                            const totalDebit = sumDebits(displayEntry)
                            const totalCredit = sumCredits(displayEntry)
                            const diff = totalDebit - totalCredit
                            const isBalanced = Math.abs(diff) < 0.01
                            const isValid = isBalanced && displayEntry.lines.length >= 2 && displayEntry.lines.every(l => l.accountId && (l.debit > 0 || l.credit > 0))

                            if (isEditing && editingEntryData) {
                                // Inline Edit Mode Card
                                return (
                                    <div key={entry.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid var(--brand-primary)', boxShadow: 'var(--shadow-md)', marginBottom: '1rem' }}>
                                        {/* Header Row - Edit Mode */}
                                        <div style={{
                                            padding: '12px 20px',
                                            background: 'var(--surface-2)',
                                            borderBottom: '1px solid var(--border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '12px',
                                            flexWrap: 'wrap'
                                        }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
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
                                                    style={{ flex: 1, minWidth: 0 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={handleCancelEdit}
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
                                            </div>
                                        </div>

                                        {/* Table Header */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 120px 120px 40px',
                                            gap: '12px',
                                            padding: '8px 20px 6px',
                                            borderBottom: '1px solid var(--border)'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuenta</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Debe</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Haber</div>
                                            <div></div>
                                        </div>

                                        {/* Lines */}
                                        <div>
                                            {displayEntry.lines.map((l, i) => (
                                                <div key={i} style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 120px 120px 40px',
                                                    gap: '12px',
                                                    alignItems: 'center',
                                                    padding: '8px 20px',
                                                    borderBottom: '1px solid var(--border)',
                                                    background: 'var(--surface-1)'
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
                                                            newLines[i] = { ...l, debit: val, credit: 0 }
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
                                                            newLines[i] = { ...l, credit: val, debit: 0 }
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
                                                        disabled={displayEntry.lines.length <= 2}
                                                        tabIndex={-1}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}

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
                                        </div>

                                        {/* Footer Totals */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 120px 120px 40px',
                                            gap: '12px',
                                            padding: '10px 20px',
                                            background: 'var(--surface-2)',
                                            borderTop: '1px solid var(--border)',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                {!isBalanced ? (
                                                    <span style={{ color: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
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
                                            <div></div>
                                        </div>
                                    </div>
                                )
                            }

                            // Normal View Mode Card
                            return (
                                <EntryCard
                                    key={entry.id}
                                    entry={entry}
                                    entryNumber={entryNumber}
                                    accounts={accounts || []}
                                    onEdit={handleEdit}
                                    onDelete={(id) => setDeleteConfirmId(id)}
                                    disabled={editingEntryId !== null}
                                />
                            )
                        })}
                    </div>
                )}
            </div>

            {/* New Entry Modal */}
            <NewEntryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveNewEntry}
                accounts={accounts || []}
                initialDate={getTodayISO()}
            />

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
