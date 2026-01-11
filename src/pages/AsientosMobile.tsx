import { useState, useMemo } from 'react'
import JournalImportModal from '../components/JournalImportModal'
import { useLiveQuery } from 'dexie-react-hooks'
import { createEntry, getTodayISO, createEmptyLine } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { validateEntry, sumDebits, sumCredits } from '../core/validation'
import type { EntryLine, JournalEntry } from '../core/models'
import MobileAsientosGrid from '../ui/MobileAsientosGrid'
import MobileAsientosRegistrados from '../ui/MobileAsientosRegistrados'

export default function AsientosMobile() {
    const accounts = useLiveQuery(() => getPostableAccounts())

    // Form state
    const [date, setDate] = useState(getTodayISO())
    const [memo, setMemo] = useState('')
    const [lines, setLines] = useState<EntryLine[]>([createEmptyLine(), createEmptyLine()])
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)

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

    const updateLine = (index: number, updates: Partial<EntryLine>) => {
        const newLines = [...lines]
        const line = { ...newLines[index], ...updates }

        // Debe/Haber mutual exclusion
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

    // Loading state
    if (!accounts) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '50vh',
                color: '#6b7280'
            }}>
                Cargando...
            </div>
        )
    }

    return (
        <div className="mobile-asientos-page">
            <div style={{ padding: '12px 16px 0' }}>
                <button
                    className="btn btn-white w-full"
                    onClick={() => setIsImportModalOpen(true)}
                    style={{
                        border: '1px solid var(--color-border)',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '12px',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        borderRadius: '12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#0ea5e9' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Importar asientos
                </button>
            </div>

            <MobileAsientosGrid
                accounts={accounts}
                date={date}
                setDate={setDate}
                memo={memo}
                setMemo={setMemo}
                lines={lines}
                updateLine={updateLine}
                addLine={addLine}
                removeLine={removeLine}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                isValid={validation.ok}
                onSave={handleSave}
                saveSuccess={saveSuccess}
                saveError={saveError}
            />
            <MobileAsientosRegistrados accounts={accounts} />

            <JournalImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => {
                    // Mobile might just auto-refresh via liveQuery
                }}
            />
        </div>
    )
}

