/**
 * EntryCard - Premium journal entry card component
 */
import { Edit2, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { JournalEntry, Account } from '../../core/models'

interface EntryCardProps {
    entry: JournalEntry
    entryNumber: number
    accounts: Account[]
    onEdit: (entry: JournalEntry) => void
    onDelete: (id: string) => void
    disabled?: boolean
}

const formatAmount = (n: number): string => {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const parseISODateLocal = (dateStr: string): Date | null => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
}

const formatDate = (dateStr: string) => {
    const parsed = parseISODateLocal(dateStr)
    if (!parsed) return dateStr
    return parsed.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
}

export function EntryCard({ entry, entryNumber, accounts, onEdit, onDelete, disabled }: EntryCardProps) {
    const getAccountName = (accountId: string) => {
        const acc = accounts.find((a) => a.id === accountId)
        return acc ? acc.name : 'Cuenta desconocida'
    }

    const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)

    // Format entry number with leading zeros
    const formattedNumber = String(entryNumber).padStart(4, '0')

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="journal-entry-card"
        >
            {/* Card Header */}
            <div className="journal-entry-card-header">
                <div className="journal-entry-card-header-left">
                    <div className="journal-entry-card-number">
                        {formattedNumber}
                    </div>
                    <div className="journal-entry-card-meta">
                        <div className="journal-entry-card-meta-row">
                            <span className="journal-entry-card-date">{formatDate(entry.date)}</span>
                            <span className="journal-entry-card-separator">•</span>
                            <span className="journal-entry-card-status">Registrado</span>
                        </div>
                        {entry.memo && (
                            <h3 className="journal-entry-card-concept">"{entry.memo}"</h3>
                        )}
                    </div>
                </div>

                <div className="journal-entry-card-actions">
                    <button
                        className="journal-entry-card-action-btn"
                        onClick={() => onEdit(entry)}
                        disabled={disabled}
                        title="Editar"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        className="journal-entry-card-action-btn journal-entry-card-action-btn-delete"
                        onClick={() => onDelete(entry.id)}
                        disabled={disabled}
                        title="Eliminar"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Card Table */}
            <div className="journal-entry-card-table-wrapper">
                <table className="journal-entry-card-table">
                    <thead>
                        <tr>
                            <th className="journal-entry-card-th-account">Cuenta / Detalle</th>
                            <th className="journal-entry-card-th-amount">Debe</th>
                            <th className="journal-entry-card-th-amount">Haber</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entry.lines.map((line, index) => (
                            <tr key={index} className="journal-entry-card-row">
                                <td className="journal-entry-card-td-account">
                                    <div className="journal-entry-card-account-name">
                                        {getAccountName(line.accountId)}
                                    </div>
                                    {line.description && (
                                        <div className="journal-entry-card-account-detail">
                                            {line.description}
                                        </div>
                                    )}
                                </td>
                                <td className="journal-entry-card-td-amount">
                                    {line.debit > 0 ? formatAmount(line.debit) : '-'}
                                </td>
                                <td className="journal-entry-card-td-amount">
                                    {line.credit > 0 ? formatAmount(line.credit) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="journal-entry-card-totals">
                            <td className="journal-entry-card-totals-label">Totales</td>
                            <td className="journal-entry-card-td-amount journal-entry-card-totals-value">
                                {formatAmount(totalDebit)}
                            </td>
                            <td className="journal-entry-card-td-amount journal-entry-card-totals-value">
                                {formatAmount(totalCredit)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </motion.div>
    )
}
