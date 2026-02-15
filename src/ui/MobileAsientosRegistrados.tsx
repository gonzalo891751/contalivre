import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { deleteJournalEntryWithSync } from '../storage/journalSync'
import type { JournalEntry, Account } from '../core/models'
import { sumDebits, sumCredits } from '../core/validation'
import { resolveAccountDisplay } from '../core/displayAccount'

interface MobileAsientosRegistradosProps {
    accounts: Account[]
}

// Format amount
const formatAmount = (n: number): string => {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const parseISODateLocal = (dateStr: string): Date | null => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
}

// Format date
const formatDate = (dateStr: string): string => {
    const parsed = parseISODateLocal(dateStr)
    if (!parsed) return dateStr
    return parsed.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
}

export default function MobileAsientosRegistrados({ accounts }: MobileAsientosRegistradosProps) {
    const entries = useLiveQuery(() => db.entries.orderBy('date').reverse().toArray())
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

    const isBalanced = (entry: JournalEntry): boolean => {
        return sumDebits(entry) === sumCredits(entry)
    }

    const handleDelete = async (id: string) => {
        try {
            const result = await deleteJournalEntryWithSync(id)
            setDeleteConfirmId(null)
            setMenuOpenId(null)
            if (result.mode !== 'deleted') {
                alert(result.message)
            }
        } catch (err) {
            console.error('Error deleting entry:', err)
            alert(err instanceof Error ? err.message : 'No se pudo eliminar el asiento')
        }
    }

    const handleDownloadCSV = () => {
        if (!entries || entries.length === 0) return

        const headers = ['Nro', 'Fecha', 'Concepto', 'Cuenta', 'Debe', 'Haber']
        const rows: string[][] = []

        entries.forEach((entry, entryIndex) => {
            entry.lines.forEach((line) => {
                const display = resolveAccountDisplay(line.accountId, accounts)
                const accountLabel = display.terceroDetail
                    ? `${display.name} / ${display.terceroDetail}`
                    : display.name
                rows.push([
                    String(entryIndex + 1),
                    formatDate(entry.date),
                    entry.memo || '',
                    accountLabel,
                    line.debit > 0 ? formatAmount(line.debit) : '',
                    line.credit > 0 ? formatAmount(line.credit) : '',
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
        setMenuOpenId(null)
    }

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id)
        setMenuOpenId(null)
    }

    const toggleMenu = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        setMenuOpenId(menuOpenId === id ? null : id)
    }

    if (!entries) {
        return null
    }

    const selectedDeleteEntry = deleteConfirmId
        ? entries.find(entry => entry.id === deleteConfirmId) || null
        : null
    const deletingPayrollAccrual = !!(
        selectedDeleteEntry &&
        selectedDeleteEntry.sourceModule === 'payroll' &&
        selectedDeleteEntry.sourceType === 'accrual'
    )

    return (
        <div className="mobile-registrados-section">
            <div className="mobile-registrados-header">
                <h3 className="mobile-registrados-title">Asientos registrados</h3>
                {entries.length > 0 && (
                    <button
                        type="button"
                        className="mobile-registrados-download"
                        onClick={handleDownloadCSV}
                        aria-label="Descargar CSV"
                    >
                        📥
                    </button>
                )}
            </div>

            {entries.length === 0 ? (
                <div className="mobile-registrados-empty">
                    <div className="mobile-registrados-empty-icon">📝</div>
                    <p>Todavía no hay asientos.</p>
                    <p className="mobile-registrados-empty-hint">¡Cargá el primero arriba!</p>
                </div>
            ) : (
                <div className="mobile-registrados-list">
                    {entries.map((entry) => {
                        const balanced = isBalanced(entry)
                        const isExpanded = expandedId === entry.id
                        const totalD = sumDebits(entry)
                        const totalH = sumCredits(entry)

                        return (
                            <div
                                key={entry.id}
                                className={`mobile-registrados-card ${isExpanded ? 'expanded' : ''}`}
                            >
                                {/* Card Header - clickable to expand */}
                                <div
                                    className="mobile-registrados-card-header"
                                    onClick={() => toggleExpand(entry.id)}
                                >
                                    <div className="mobile-registrados-card-row1">
                                        <span className="mobile-registrados-date">
                                            {formatDate(entry.date)}
                                        </span>
                                        <span className={`mobile-registrados-badge ${balanced ? 'balanced' : 'unbalanced'}`}>
                                            {balanced ? '✓ OK' : '✗ Difiere'}
                                        </span>
                                        <button
                                            type="button"
                                            className="mobile-registrados-menu-btn"
                                            onClick={(e) => toggleMenu(e, entry.id)}
                                            aria-label="Menú de opciones"
                                        >
                                            ⋯
                                        </button>
                                    </div>

                                    <div className="mobile-registrados-memo">
                                        {entry.memo || '(sin concepto)'}
                                    </div>

                                    <div className="mobile-registrados-totals-row">
                                        <span className="mobile-registrados-total">
                                            <span className="label">D</span>
                                            <span className="value debe">${formatAmount(totalD)}</span>
                                        </span>
                                        <span className="mobile-registrados-total">
                                            <span className="label">H</span>
                                            <span className="value haber">${formatAmount(totalH)}</span>
                                        </span>
                                        <span className="mobile-registrados-chevron">
                                            {isExpanded ? '▲' : '▼'}
                                        </span>
                                    </div>

                                    {/* Dropdown Menu */}
                                    {menuOpenId === entry.id && (
                                        <div
                                            className="mobile-registrados-dropdown"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDeleteConfirmId(entry.id)
                                                    setMenuOpenId(null)
                                                }}
                                            >
                                                🗑️ Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="mobile-registrados-detail">
                                        <div className="mobile-registrados-detail-header">
                                            <span>Cuenta</span>
                                            <span>Debe</span>
                                            <span>Haber</span>
                                        </div>
                                        {entry.lines.map((line, i) => {
                                            const display = resolveAccountDisplay(line.accountId, accounts)
                                            return (
                                            <div key={i} className="mobile-registrados-detail-row">
                                                <div className="mobile-registrados-detail-account">
                                                    <span className="code">{display.code}</span>
                                                    <span className="name">{display.name}</span>
                                                    {display.terceroDetail && (
                                                        <span className="name" style={{ fontSize: '0.75em', opacity: 0.7 }}>{display.terceroDetail}</span>
                                                    )}
                                                </div>
                                                <span className="mobile-registrados-detail-amount">
                                                    {line.debit > 0 ? `$${formatAmount(line.debit)}` : '-'}
                                                </span>
                                                <span className="mobile-registrados-detail-amount">
                                                    {line.credit > 0 ? `$${formatAmount(line.credit)}` : '-'}
                                                </span>
                                            </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="mobile-registrados-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
                    <div className="mobile-registrados-modal" onClick={(e) => e.stopPropagation()}>
                        <h4>{deletingPayrollAccrual ? '⚠️ Anular asiento payroll' : '⚠️ Eliminar asiento'}</h4>
                        <p>
                            {deletingPayrollAccrual
                                ? 'Se desposteará la liquidación de sueldos y volverá a borrador.'
                                : '¿Seguro que querés eliminarlo? No se puede deshacer.'}
                        </p>
                        <div className="mobile-registrados-modal-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => setDeleteConfirmId(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn-delete"
                                onClick={() => handleDelete(deleteConfirmId)}
                            >
                                {deletingPayrollAccrual ? 'Anular / Despostear' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
