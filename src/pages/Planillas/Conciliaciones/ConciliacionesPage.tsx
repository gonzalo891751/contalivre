import { useState, useMemo } from 'react'
import { useLedger } from '../../../hooks/useLedger'
import type { Account } from '../../../core/models'
import ImportModal from './ImportModal'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'
import BrandSwitch from '../../../ui/BrandSwitch'

// Helper to determine if an account is likely cash/bank
const isCashOrBank = (account: Account) => {
    const name = account.name.toLowerCase()
    return name.includes('banco') ||
        name.includes('caja') ||
        name.includes('efectivo') ||
        name.includes('cta cte') ||
        name.includes('valores') ||
        name.includes('recaudacion')
}

// CONSTANTS
const GRID_TEMPLATE = "120px minmax(0, 1fr) 130px 130px 48px"

export default function ConciliacionesPage() {
    const { accounts, ledger } = useLedger()

    const [tipo] = useState<'bancaria' | 'arqueo'>('bancaria')
    const [cuentaId, setCuentaId] = useState('') // Selected Account ID
    const [showAllAccounts, setShowAllAccounts] = useState(false)
    const [desde, setDesde] = useState('2026-01-01')
    const [hasta, setHasta] = useState('2026-01-31')
    const [searchText, setSearchText] = useState('')

    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [importSuccessMsg, setImportSuccessMsg] = useState('')

    // State for difference widget expansion
    const [isDiffExpanded, setIsDiffExpanded] = useState(false)

    // --- Account Selector Logic ---
    const accountOptions = useMemo(() => {
        if (!accounts) return []
        const relevant = accounts.filter(a => isCashOrBank(a))

        let list = showAllAccounts ? accounts : relevant
        if (cuentaId && !list.find(a => a.id === cuentaId)) {
            const current = accounts.find(a => a.id === cuentaId)
            if (current) list = [...list, current].sort((a, b) => a.name.localeCompare(b.name))
        }
        return list
    }, [accounts, showAllAccounts, cuentaId])

    useMemo(() => {
        if (!cuentaId && accountOptions.length > 0) {
            setCuentaId(accountOptions[0].id)
        }
    }, [accountOptions, cuentaId])

    // --- Real Data: Libros ---
    const librosRows = useMemo(() => {
        if (!ledger || !cuentaId) return []
        const acc = ledger.get(cuentaId)
        if (!acc) return []

        return acc.movements.filter(m => {
            const d = m.date.substring(0, 10)
            return d >= desde && d <= hasta
        }).map((m, idx) => ({
            id: m.entryId + '_' + idx,
            fecha: m.date,
            concepto: m.memo || m.description || 'Sin concepto',
            debe: m.debit,
            haber: m.credit
        }))
    }, [ledger, cuentaId, desde, hasta])

    // --- Mock Data: Externo ---
    const [externoRows, setExternoRows] = useState([
        { id: 101, fecha: '2026-01-02', concepto: 'DEP-001 Depósito efectivo', debe: 100000, haber: 0 },
        { id: 102, fecha: '2026-01-06', concepto: 'OP-023 Cheque 4522 pagado', debe: 0, haber: 25000 },
        { id: 103, fecha: '2026-01-08', concepto: 'REC-110 Transferencia A. Pérez', debe: 15500, haber: 0 },
    ])

    const handleImportData = (rows: any[], mode: 'replace' | 'append') => {
        const newRows = rows.map((r, i) => ({
            id: Date.now() + i,
            fecha: r.fecha,
            concepto: r.concepto,
            debe: r.debe,
            haber: r.haber
        }))

        if (mode === 'replace') {
            setExternoRows(newRows)
            setImportSuccessMsg(`Se reemplazaron las filas con ${newRows.length} registros nuevos.`)
        } else {
            setExternoRows(prev => [...prev, ...newRows])
            setImportSuccessMsg(`Se agregaron ${newRows.length} registros nuevos.`)
        }
        setIsImportModalOpen(false)
        setTimeout(() => setImportSuccessMsg(''), 4000)
    }

    // --- Helpers ---
    const formatMoney = (val: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val)
    }

    const formatShortMoney = (val: number) => {
        return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
    }

    const formatDateAR = (isoDate: string) => {
        if (!isoDate) return ''
        const [y, m, d] = isoDate.substring(0, 10).split('-')
        return `${d}/${m}/${y}`
    }

    const handleAddRow = () => {
        const newRow = {
            id: Date.now(),
            fecha: desde,
            concepto: '',
            debe: 0,
            haber: 0
        }
        setExternoRows([...externoRows, newRow])
    }

    const handleDeleteRow = (id: number) => {
        setExternoRows(externoRows.filter(r => r.id !== id))
    }

    const handleExternoChange = (id: number, field: string, value: any) => {
        setExternoRows(externoRows.map(r => {
            if (r.id === id) {
                return { ...r, [field]: value }
            }
            return r
        }))
    }

    const [editingDateId, setEditingDateId] = useState<string | number | null>(null)

    // --- Filtering & Totals ---
    const matchFilter = (row: any) => {
        if (!searchText) return true
        const s = searchText.toLowerCase()
        const txtMatch = row.concepto.toLowerCase().includes(s)
        const numMatch = row.debe.toString().includes(s) || row.haber.toString().includes(s)
        return txtMatch || numMatch
    }

    const filteredLibros = useMemo(() => librosRows.filter(matchFilter), [librosRows, searchText])
    const filteredExterno = useMemo(() => externoRows.filter(matchFilter), [externoRows, searchText])

    const calculateTotals = (rows: any[]) => {
        const tDebe = rows.reduce((acc, r) => acc + (Number(r.debe) || 0), 0)
        const tHaber = rows.reduce((acc, r) => acc + (Number(r.haber) || 0), 0)
        return { tDebe, tHaber, saldo: tDebe - tHaber }
    }

    const totalsLibros = useMemo(() => calculateTotals(filteredLibros), [filteredLibros])
    const totalsExterno = useMemo(() => calculateTotals(filteredExterno), [filteredExterno])

    const difference = totalsExterno.saldo - totalsLibros.saldo
    const isBalanced = Math.abs(difference) <= 0.01

    return (
        <div className="conciliaciones-page fade-in">
            {/* Header Section */}
            <div className="conciliaciones-header">
                <div className="header-top">
                    <div>
                        <h1 className="page-title">Conciliaciones</h1>
                        <p className="page-subtitle">Compará tus libros con una fuente externa (extracto o conteo).</p>
                    </div>
                </div>

                {/* Simplified Controls Card */}
                <div className="card controls-card">
                    <div className="controls-flex-row">
                        {/* Control: Fechas */}
                        <div className="control-group">
                            <label className="control-label">PERÍODO</label>
                            <div className="date-inputs-wrapper">
                                <input
                                    type="date"
                                    className="premium-input"
                                    value={desde}
                                    onChange={e => setDesde(e.target.value)}
                                />
                                <span className="separator">→</span>
                                <input
                                    type="date"
                                    className="premium-input"
                                    value={hasta}
                                    onChange={e => setHasta(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Control: Search */}
                        <div className="control-group flex-grow">
                            <label className="control-label">BUSCAR</label>
                            <div className="search-wrapper">
                                <input
                                    type="text"
                                    className="premium-input search-input"
                                    placeholder="Concepto, importe..."
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                />
                                <div className="search-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Show success message if any */}
            {importSuccessMsg && (
                <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded mb-4 flex justify-between items-center animate-pulse-once">
                    <span>{importSuccessMsg}</span>
                    <button onClick={() => setImportSuccessMsg('')} className="text-green-600 font-bold">&times;</button>
                </div>
            )}

            {/* Tables Grid */}
            <div className="tables-grid">

                {/* Table 1: Libros (Read Only) */}
                <div className="table-card">
                    <div className="table-header header-row-aligned">
                        <div className="title-section">
                            <h3 className="panel-title">Libros <span className="text-muted font-normal text-sm ml-1">(Mayor)</span></h3>
                        </div>
                        <div className="header-controls-right">
                            <div className="account-select-compact">
                                <AccountSearchSelect
                                    accounts={accountOptions}
                                    value={cuentaId}
                                    onChange={setCuentaId}
                                    placeholder="Seleccioná cuenta..."
                                />
                                <div className="select-chevron-sm">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                                </div>
                            </div>
                            <BrandSwitch
                                label="Ver todas"
                                checked={showAllAccounts}
                                onCheckedChange={setShowAllAccounts}
                            />
                        </div>
                    </div>

                    {/* Grid Head */}
                    <div className="grid-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                        <div className="gh-cell">Fecha</div>
                        <div className="gh-cell">Concepto</div>
                        <div className="gh-cell text-right">Debe</div>
                        <div className="gh-cell text-right">Haber</div>
                        <div className="gh-cell"></div> {/* Empty action col for alignment */}
                    </div>

                    {/* Grid Body */}
                    <div className="table-container">
                        {filteredLibros.map(row => (
                            <div key={row.id} className="grid-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                                <div className="gd-cell text-secondary">{formatDateAR(row.fecha)}</div>
                                <div className="gd-cell cell-concept" title={row.concepto}>{row.concepto}</div>
                                <div className="gd-cell text-right text-debit tabular-nums" title={formatMoney(row.debe)}>
                                    {row.debe > 0 ? formatShortMoney(row.debe) : '-'}
                                </div>
                                <div className="gd-cell text-right text-credit tabular-nums" title={formatMoney(row.haber)}>
                                    {row.haber > 0 ? formatShortMoney(row.haber) : '-'}
                                </div>
                                <div className="gd-cell"></div>
                            </div>
                        ))}
                        {filteredLibros.length === 0 && (
                            <div className="empty-state-container">
                                {cuentaId
                                    ? "No se encontraron movimientos."
                                    : "Seleccione una cuenta."}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="table-footer-custom">
                        {/* Totals Row */}
                        <div className="grid-footer-row totals-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                            <div className="gf-cell font-bold text-dark">Totales</div>
                            <div className="gf-cell"></div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsLibros.tDebe)}</div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsLibros.tHaber)}</div>
                            <div className="gf-cell"></div>
                        </div>

                        {/* Saldo Row */}
                        <div className="saldo-row">
                            <span className="saldo-label">SALDO</span>
                            <span className={`saldo-badge ${totalsLibros.saldo >= 0 ? 'badge-deudor' : 'badge-acreedor'}`}>
                                {totalsLibros.saldo >= 0 ? 'DEUDOR' : 'ACREEDOR'} {formatMoney(Math.abs(totalsLibros.saldo))}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Table 2: Externo (Editable) */}
                <div className="table-card">
                    <div className="table-header">
                        <div className="header-title-group">
                            <h3 className="panel-title">Externo <span className="text-muted font-normal text-sm ml-1">({tipo === 'bancaria' ? 'Extracto' : 'Conteo'})</span></h3>
                        </div>
                        <div className="actions">
                            <button
                                className="btn-brand-gradient"
                                onClick={() => setIsImportModalOpen(true)}
                                title="Importar desde Excel o CSV"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span className="hidden-mobile">Importar</span>
                            </button>
                            <button className="btn-premium-secondary" onClick={handleAddRow}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                <span className="hidden-mobile">Fila</span>
                            </button>
                        </div>
                    </div>

                    {/* Grid Head */}
                    <div className="grid-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                        <div className="gh-cell">Fecha</div>
                        <div className="gh-cell">Concepto</div>
                        <div className="gh-cell text-right">Debe</div>
                        <div className="gh-cell text-right">Haber</div>
                        <div className="gh-cell"></div>
                    </div>

                    <div className="table-container">
                        {filteredExterno.map(row => (
                            <div key={row.id} className="grid-row editable-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                                <div className="gd-cell p-0">
                                    {editingDateId === row.id ? (
                                        <input
                                            type="date"
                                            className="edit-input"
                                            value={row.fecha}
                                            onChange={e => handleExternoChange(row.id, 'fecha', e.target.value)}
                                            onBlur={() => setEditingDateId(null)}
                                            autoFocus
                                        />
                                    ) : (
                                        <div
                                            className="edit-placeholder"
                                            onClick={() => setEditingDateId(row.id)}
                                        >
                                            {row.fecha ? formatDateAR(row.fecha) : 'dd/mm'}
                                        </div>
                                    )}
                                </div>
                                <div className="gd-cell p-0">
                                    <input
                                        type="text"
                                        className="edit-input"
                                        value={row.concepto}
                                        onChange={e => handleExternoChange(row.id, 'concepto', e.target.value)}
                                    />
                                </div>
                                <div className="gd-cell p-0">
                                    <input
                                        type="number"
                                        className="edit-input text-right tabular-nums"
                                        value={row.debe}
                                        onChange={e => handleExternoChange(row.id, 'debe', parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="gd-cell p-0">
                                    <input
                                        type="number"
                                        className="edit-input text-right tabular-nums"
                                        value={row.haber}
                                        onChange={e => handleExternoChange(row.id, 'haber', parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="gd-cell flex-center">
                                    <button
                                        className="btn-delete-action"
                                        onClick={() => handleDeleteRow(row.id)}
                                        title="Eliminar fila"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredExterno.length === 0 && (
                            <div className="empty-state-container">
                                Sin datos externos.
                            </div>
                        )}
                    </div>

                    <div className="table-footer-custom">
                        {/* Totals Row */}
                        <div className="grid-footer-row totals-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                            <div className="gf-cell font-bold text-dark">Totales</div>
                            <div className="gf-cell"></div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsExterno.tDebe)}</div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsExterno.tHaber)}</div>
                            <div className="gf-cell"></div>
                        </div>

                        {/* Saldo Row */}
                        <div className="saldo-row">
                            <span className="saldo-label">SALDO</span>
                            <span className={`saldo-badge ${totalsExterno.saldo >= 0 ? 'badge-deudor' : 'badge-acreedor'}`}>
                                {totalsExterno.saldo >= 0 ? 'DEUDOR' : 'ACREEDOR'} {formatMoney(Math.abs(totalsExterno.saldo))}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Difference Widget */}
            <div className="bottom-widget-container">
                <button
                    className={`diff-pill ${isBalanced ? 'status-ok' : (difference > 0 ? 'status-surplus' : 'status-missing')}`}
                    onClick={() => setIsDiffExpanded(!isDiffExpanded)}
                >
                    <div className="pill-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </div>
                    <div className="pill-content">
                        <span className="pill-label">Diferencia</span>
                        <span className="pill-amount tabular-nums">{formatMoney(Math.abs(difference))}</span>
                    </div>
                    <div className="pill-tag">
                        {isBalanced ? 'OK' : (difference > 0 ? 'Sobra' : 'Falta')}
                    </div>
                    <div className="pill-chevron">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isDiffExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </button>

                {isDiffExpanded && (
                    <div className="diff-details-popover fade-in-up">
                        <div className="popover-row">
                            <span className="pop-label">Saldo Externo:</span>
                            <span className={`pop-value ${totalsExterno.saldo >= 0 ? 'text-deudor' : 'text-acreedor'}`}>
                                {formatMoney(totalsExterno.saldo)} ({totalsExterno.saldo >= 0 ? 'D' : 'A'})
                            </span>
                        </div>
                        <div className="popover-row">
                            <span className="pop-label">Saldo Libros:</span>
                            <span className={`pop-value ${totalsLibros.saldo >= 0 ? 'text-deudor' : 'text-acreedor'}`}>
                                {formatMoney(totalsLibros.saldo)} ({totalsLibros.saldo >= 0 ? 'D' : 'A'})
                            </span>
                        </div>
                        <div className="popover-divider"></div>
                        <div className="popover-explanation text-xs text-muted">
                            Diferencia = Saldo Externo - Saldo Libros
                        </div>
                    </div>
                )}
            </div>

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportData}
            />

            <style>{`
                .conciliaciones-page {
                    padding: var(--space-md);
                    /* Removed fixed height/overflow to allow full page scroll */
                    min-height: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }
                
                /* Typography & Header */
                .conciliaciones-header {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-md);
                    flex-shrink: 0;
                }
                .page-title {
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: var(--text-primary);
                    margin: 0;
                    line-height: 1.2;
                    letter-spacing: -0.02em;
                }
                .page-subtitle {
                    color: var(--text-secondary);
                    margin: 4px 0 0;
                    font-size: 1rem;
                    font-weight: 400;
                }

                /* Controls Card */
                .controls-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px 24px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .controls-flex-row {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                @media (min-width: 768px) {
                    .controls-flex-row {
                        flex-direction: row;
                        align-items: flex-end;
                    }
                }

                .control-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .flex-grow { flex: 1; }
                
                .control-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }

                /* Premium Inputs */
                .premium-input {
                    display: block;
                    width: 100%;
                    padding: 0 12px;
                    height: 40px;
                    background-color: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    transition: all 0.2s ease;
                }
                .premium-input:focus {
                    background-color: #ffffff;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px var(--primary-color-alpha);
                }
                
                .date-inputs-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .separator { font-size: 1.2rem; color: #cbd5e1; padding-bottom: 2px; }

                /* Search Input */
                .search-wrapper { position: relative; width: 100%; }
                .search-input { padding-left: 36px; }
                .search-icon {
                    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
                    pointer-events: none; color: #94a3b8; display: flex; align-items: center;
                }

                /* Tables Grid Layout */
                .tables-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: var(--space-lg);
                    /* Removed flex:1/overflow to allow natural growth */
                }
                @media (min-width: 1024px) {
                    .tables-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                .table-card {
                    background: var(--bg-paper);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-sm);
                    display: flex;
                    flex-direction: column;
                    border: 1px solid var(--border-color);
                    /* Removed height:100% and overflow:hidden */
                }

                .table-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #ffffff;
                    min-height: 72px;
                }
                .header-row-aligned {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-controls-right {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .panel-title {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                /* Compact Account Select in Header */
                .account-select-compact {
                    position: relative;
                    width: 320px;
                    min-width: 200px;
                }
                .account-select-compact input {
                    height: 36px;
                    font-size: 0.9rem;
                    border-radius: 6px;
                    padding-right: 24px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                }
                .select-chevron-sm {
                    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                    pointer-events: none; color: #94a3b8;
                }

                /* Actions */
                .actions { display: flex; gap: 8px; }

                 .btn-brand-gradient {
                    display: flex; align-items: center; gap: 8px;
                    background: linear-gradient(135deg, #2563eb 0%, #10b981 100%);
                    color: white; border: none; padding: 6px 14px;
                    border-radius: 6px; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 36px;
                }
                .btn-premium-secondary {
                    display: flex; align-items: center; gap: 6px;
                    background-color: white; color: var(--text-secondary);
                    border: 1px solid var(--border-color); padding: 6px 14px;
                    border-radius: 6px; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; height: 36px;
                }
                
                @media (max-width: 640px) {
                    .hidden-mobile { display: none; }
                }

                /* GRID LAYOUT IMPLEMENTATION */
                .grid-header {
                    display: grid;
                    /* grid-template-columns set inline */
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .gh-cell { padding: 10px 12px; }

                .table-container {
                    /* Removed flex:1 and overflow-y:auto */
                    overflow-x: hidden;
                    background: #ffffff;
                    position: relative;
                }
                
                .grid-row {
                    display: grid;
                    /* grid-template-columns set inline */
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    align-items: center; /* Vertical center */
                    transition: background 0.1s;
                }
                .grid-row:hover { background-color: #f8fafc; }
                
                .gd-cell {
                    padding: 8px 12px;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    height: 100%;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                }
                .p-0 { padding: 0 !important; }
                .text-right { justify-content: flex-end; text-align: right; }
                .text-center { justify-content: center; }
                .flex-center { justify-content: center; display: flex; align-items: center; }

                /* Editable Inputs in Grid */
                .edit-input {
                    width: 100%; height: 100%;
                    padding: 0 8px; border: none;
                    background: #f1f5f9;
                    font-family: inherit; font-size: inherit;
                    outline: 2px solid var(--primary-color);
                    border-radius: 0;
                }
                .edit-placeholder {
                    cursor: text;
                    width: 100%; height: 100%;
                    display: flex; align-items: center; padding: 0 12px;
                }
                .edit-placeholder:hover { background: #f1f5f9; }

                .btn-delete-action {
                    width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 99px; color: #94a3b8;
                    background: transparent; border: none; cursor: pointer;
                }
                .btn-delete-action:hover { background-color: #fef2f2; color: #dc2626; }

                /* Empty State */
                .empty-state-container {
                    padding: 40px; text-align: center; color: #94a3b8; font-weight: 500; font-size: 0.95rem;
                }

                /* Footer Totals & Saldo */
                .table-footer-custom {
                    background: #ffffff;
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                }
                
                .grid-footer-row {
                    display: grid;
                    align-items: center;
                    padding: 0;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                }
                .totals-row {
                    background-color: #f8fafc; /* Slate 50 approx */
                    border-bottom: 1px solid #f1f5f9;
                }
                .gf-cell {
                    padding: 10px 12px;
                }
                .text-dark { color: #0f172a; }
                
                .saldo-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 20px 8px 12px; /* Extra padding right for alignment */
                    background-color: #ffffff;
                }
                .saldo-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }
                
                .saldo-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 999px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    border: 1px solid transparent;
                }
                .badge-deudor {
                    background-color: #eff6ff; /* Blue 50 */
                    color: #1d4ed8;       /* Blue 700 */
                    border-color: #dbeafe;    /* Blue 200 */
                }
                .badge-acreedor {
                    background-color: #fef2f2; /* Red 50 */
                    color: #b91c1c;       /* Red 700 */
                    border-color: #fecaca;    /* Red 200 */
                }
                
                /* Bottom Widget */
                .bottom-widget-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding-bottom: 8px;
                    position: relative;
                }
                
                .diff-pill {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 6px 8px 6px 16px;
                    border-radius: 999px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 280px;
                }
                .diff-pill:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
                
                .status-ok { border-color: #86efac; background: #f0fdf4; color: #15803d; }
                .status-surplus { border-color: #93c5fd; background: #eff6ff; color: #1e40af; }
                .status-missing { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
                
                .pill-icon { display: flex; align-items: center; }
                .pill-content { display: flex; flex-direction: column; align-items: flex-start; flex: 1; }
                .pill-label { font-size: 0.65rem; text-transform: uppercase; font-weight: 700; opacity: 0.8; }
                .pill-amount { font-size: 1rem; font-weight: 800; line-height: 1.1; }
                
                .pill-tag {
                    font-size: 0.75rem; font-weight: 700;
                    background: rgba(255,255,255,0.6);
                    padding: 2px 8px; border-radius: 4px;
                }
                .pill-chevron { margin-left: 8px; opacity: 0.5; transition: transform 0.2s; }
                
                .diff-details-popover {
                    position: absolute;
                    bottom: 70px; /* Above the pill */
                    background: white;
                    border-radius: 12px;
                    padding: 16px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid #e2e8f0;
                    width: 300px;
                    z-index: 50;
                }
                .popover-row {
                    display: flex; justify-content: space-between;
                    margin-bottom: 8px; font-size: 0.9rem;
                }
                .pop-label { color: #64748b; }
                .pop-value { font-weight: 600; }
                .popover-divider { height: 1px; background: #f1f5f9; margin: 8px 0; }
                
                .text-deudor { color: #1e3a8a; } 
                .text-acreedor { color: #7f1d1d; }

                /* Animation */
                .fade-in { animation: fadeIn 0.3s ease-out; }
                .fade-in-up { animation: fadeInUp 0.2s ease-out; }
                
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            `}</style>
        </div>
    )
}
