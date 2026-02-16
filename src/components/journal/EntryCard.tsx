/**
 * EntryCard - Premium journal entry card component
 *
 * Supports madre/subcuenta grouping: when a line references a subcuenta
 * whose parent is a category-level account (e.g., "Equipos de computación"),
 * the parent is shown as a visual header row with the subcuenta indented below.
 * The header row does NOT participate in totals.
 */
import { useMemo } from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { JournalEntry, Account } from '../../core/models'
import { resolveAccountDisplay } from '../../core/displayAccount'

interface EntryCardProps {
    entry: JournalEntry
    entryNumber: number
    accounts: Account[]
    onEdit: (entry: JournalEntry) => void
    onDelete: (id: string) => void
    disabled?: boolean
    formalView?: boolean
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

/** Control codes whose children are per-tercero subcuentas (handled by resolveAccountDisplay) */
const CONTROL_CODES_WITH_TERCEROS = new Set([
    '1.1.02.01', '1.1.02.02', '1.1.02.03', '1.1.01.04', '1.1.01.05',
    '2.1.01.01', '2.1.01.02', '2.1.01.04', '2.1.01.05', '2.1.06.01',
])

interface DisplayRow {
    type: 'madre-header' | 'line'
    parentName?: string
    parentCode?: string
    lineIndex: number
    indented?: boolean
}

/**
 * Build display rows with madre headers for subcuentas.
 * Groups lines by parent when the parent is a category-level account
 * (code with 4+ segments) and NOT a tercero-control account.
 */
function buildDisplayRows(lines: JournalEntry['lines'], accounts: Account[], formalView: boolean): DisplayRow[] {
    if (!formalView) {
        return lines.map((_, i) => ({ type: 'line' as const, lineIndex: i }))
    }

    const rows: DisplayRow[] = []
    const shownParents = new Set<string>()

    lines.forEach((line, index) => {
        const acc = accounts.find(a => a.id === line.accountId)
        const display = resolveAccountDisplay(line.accountId, accounts)

        // Check if this account should show a madre header
        if (acc?.parentId && !display.terceroDetail) {
            const parent = accounts.find(a => a.id === acc.parentId)
            if (parent) {
                const codeSegments = parent.code.split('.').length
                const isTerceroControl = CONTROL_CODES_WITH_TERCEROS.has(parent.code)
                // Show madre for category-level parents (4+ code segments) that aren't tercero controls
                if (codeSegments >= 4 && !isTerceroControl && !shownParents.has(parent.id)) {
                    shownParents.add(parent.id)
                    rows.push({
                        type: 'madre-header',
                        parentName: parent.name,
                        parentCode: parent.code,
                        lineIndex: index,
                    })
                }
                if (shownParents.has(parent.id)) {
                    rows.push({ type: 'line', lineIndex: index, indented: true })
                    return
                }
            }
        }

        rows.push({ type: 'line', lineIndex: index })
    })

    return rows
}

export function EntryCard({ entry, entryNumber, accounts, onEdit, onDelete, disabled, formalView = true }: EntryCardProps) {
    const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)

    const displayRows = useMemo(
        () => buildDisplayRows(entry.lines, accounts, formalView),
        [entry.lines, accounts, formalView]
    )

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
                        {displayRows.map((row, rowIdx) => {
                            if (row.type === 'madre-header') {
                                return (
                                    <tr key={`madre-${rowIdx}`} className="journal-entry-card-row" style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
                                        <td className="journal-entry-card-td-account">
                                            <div className="journal-entry-card-account-name" style={{ fontWeight: 600, fontStyle: 'italic', opacity: 0.7, fontSize: '0.8rem' }}>
                                                {row.parentName}
                                                <span className="journal-entry-card-account-code">{row.parentCode}</span>
                                            </div>
                                        </td>
                                        <td className="journal-entry-card-td-amount" style={{ opacity: 0.3 }}>-</td>
                                        <td className="journal-entry-card-td-amount" style={{ opacity: 0.3 }}>-</td>
                                    </tr>
                                )
                            }

                            const line = entry.lines[row.lineIndex]
                            const display = formalView
                                ? resolveAccountDisplay(line.accountId, accounts)
                                : (() => {
                                    const acc = accounts.find(a => a.id === line.accountId)
                                    return acc
                                        ? { name: acc.name, code: acc.code, terceroDetail: null }
                                        : { name: 'Cuenta desconocida', code: '?', terceroDetail: null }
                                })()
                            return (
                            <tr key={row.lineIndex} className="journal-entry-card-row">
                                <td className="journal-entry-card-td-account" style={row.indented ? { paddingLeft: '2rem' } : undefined}>
                                    <div className="journal-entry-card-account-name">
                                        {display.name}
                                        <span className="journal-entry-card-account-code">{display.code}</span>
                                    </div>
                                    {display.terceroDetail && (
                                        <div className="journal-entry-card-account-detail">
                                            {display.terceroDetail}
                                        </div>
                                    )}
                                    {!display.terceroDetail && line.description && (
                                        <div className="journal-entry-card-account-detail" style={row.indented ? { paddingLeft: '0' } : undefined}>
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
                            )
                        })}
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
