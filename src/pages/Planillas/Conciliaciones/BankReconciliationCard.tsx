import { useState } from 'react'

interface RowData {
    id: string | number
    fecha: string
    concepto: string
    debe: number
    haber: number
}

interface BankReconciliationCardProps {
    saldoLibros: number
    saldoExterno: number

    // Details Lists
    depositsInTransit: RowData[]
    outstandingPayments: RowData[]
    bankCredits: RowData[]
    bankDebits: RowData[]

    // Calculated Results
    reconciledBankBalance: number
    adjustedBookBalance: number
    diff: number
    isBalanced: boolean

    onFocusRow?: (side: 'libros' | 'externo', id: string | number) => void
}

export default function BankReconciliationCard({
    saldoLibros,
    saldoExterno,
    depositsInTransit,
    outstandingPayments,
    bankCredits,
    bankDebits,
    reconciledBankBalance,
    adjustedBookBalance,
    diff,
    isBalanced,
    onFocusRow
}: BankReconciliationCardProps) {

    const [expanded, setExpanded] = useState(false)

    // --- Helpers ---
    const formatMoney = (val: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val)
    }

    // Totals for display
    const totalDepositsInTransit = depositsInTransit.reduce((acc, r) => acc + r.debe, 0)
    const totalOutstandingPayments = outstandingPayments.reduce((acc, r) => acc + r.haber, 0)
    const totalBankCredits = bankCredits.reduce((acc, r) => acc + r.haber, 0)
    const totalBankDebits = bankDebits.reduce((acc, r) => acc + r.debe, 0)

    // Helper for rendering balance with badge
    const renderBalance = (amount: number, type: 'extracto' | 'libros' | 'generic') => {
        // Formato para extracto: Positivo = ACREEDOR (Haber>Debe), Negativo = DEUDOR.
        // Formato para libros: Positivo = DEUDOR (Debe>Haber), Negativo = ACREEDOR.
        const absVal = Math.abs(amount)
        let label = ''
        let colorClass = ''

        if (type === 'extracto') {
            if (amount >= 0) {
                label = 'ACREEDOR' // Normal state for bank
                colorClass = 'text-dark'
            } else {
                label = 'DEUDOR' // Overdraft
                colorClass = 'text-danger'
            }
        } else if (type === 'libros') {
            if (amount >= 0) {
                label = 'DEUDOR' // Normal state for asset
                colorClass = 'text-dark'
            } else {
                label = 'ACREEDOR' // Negative asset?
                colorClass = 'text-danger'
            }
        } else {
            // Generic 'adjusted' or 'reconciled'
            // Usually follows the side it belongs to contextually, but here we can just show value.
            // Or stick to one convention. Let's use the visual color: Dark for positive, Red for negative.
            colorClass = amount >= 0 ? 'text-primary' : 'text-danger'
        }

        return (
            <div className="flex items-center gap-2">
                {label && <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-500">{label}</span>}
                <span className={colorClass}>{formatMoney(absVal)}</span>
            </div>
        )
    }

    return (
        <div className="bank-recon-card fade-in">
            {/* Header */}
            <div className="recon-header">
                <div className="flex items-center gap-2">
                    <h3 className="recon-title">Conciliación bancaria</h3>
                    <div className="tooltip-container">
                        <svg className="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        <div className="tooltip-content">
                            Fórmula: saldo extracto + depósitos en tránsito − pagos pendientes = saldo conciliado
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Columns */}
            <div className="recon-grid">

                {/* DO NOT modify this implementation without verifying the layout requests from user. 
                    Requested: "Según extracto" (left/col1), "Según libros" (right/col2) if optional part included. 
                */}

                {/* Left: Extracto Side */}
                <div className="recon-col border-r-desktop">
                    <div className="recon-row-group">
                        <div className="recon-row">
                            <span className="label font-bold text-dark">Saldo según extracto</span>
                            <div className="amount font-bold">
                                {renderBalance(saldoExterno, 'extracto')}
                            </div>
                        </div>
                        <div className="recon-row text-success">
                            <span className="label pl-4">+ Depósitos en tránsito</span>
                            <span className="amount">{formatMoney(totalDepositsInTransit)}</span>
                        </div>
                        <div className="recon-row text-danger">
                            <span className="label pl-4">− Pagos pendientes</span>
                            <span className="amount">({formatMoney(totalOutstandingPayments)})</span>
                        </div>
                        <div className="divider-h"></div>
                        <div className="recon-row">
                            <span className="label font-bold text-xl text-primary">Saldo conciliado</span>
                            <div className="amount font-bold text-xl">
                                {renderBalance(reconciledBankBalance, 'generic')}
                            </div>
                        </div>
                    </div>
                    {/* Status Badge (if this side was standalone, but we compare with Books side below) */}
                </div>

                {/* Right: Books Side */}
                <div className="recon-col">
                    <div className="recon-row-group">
                        <div className="recon-row">
                            <span className="label font-bold text-dark">Saldo según libros</span>
                            <div className="amount font-bold">
                                {renderBalance(saldoLibros, 'libros')}
                            </div>
                        </div>
                        <div className="recon-row text-success">
                            <span className="label pl-4">+ Créditos bancarios (no reg.)</span>
                            <span className="amount">{formatMoney(totalBankCredits)}</span>
                        </div>
                        <div className="recon-row text-danger">
                            <span className="label pl-4">− Débitos bancarios (no reg.)</span>
                            <span className="amount">({formatMoney(totalBankDebits)})</span>
                        </div>
                        <div className="divider-h"></div>
                        <div className="recon-row">
                            <span className="label font-bold text-dark">Saldo libros ajustado</span>
                            <div className="amount font-bold">
                                {renderBalance(adjustedBookBalance, 'generic')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Validation Footer */}
            <div className="recon-footer">
                <div className={`status-badge ${isBalanced ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                    {isBalanced ? (
                        <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            <span>Conciliación OK</span>
                        </>
                    ) : (
                        <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            <span>Revisar diferencias (Residual: {formatMoney(Math.abs(diff))})</span>
                        </>
                    )}
                </div>

                <button
                    className="btn-expand"
                    onClick={() => setExpanded(!expanded)}
                >
                    <span>Ver detalle</span>
                    <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>
            </div>

            {/* Detail Section */}
            {expanded && (
                <div className="recon-details fade-in-up">
                    <div className="detail-cards-grid">

                        <div className="detail-card">
                            <h4 className="detail-title text-success">Depósitos en tránsito ({depositsInTransit.length})</h4>
                            <div className="detail-list">
                                {depositsInTransit.length === 0 ? <div className="text-muted text-xs p-2">Ninguno</div> :
                                    depositsInTransit.map(r => (
                                        <div key={r.id} className="detail-item" onClick={() => onFocusRow?.('libros', r.id)}>
                                            <span className="truncate flex-1">{r.fecha.substring(0, 10)} - {r.concepto}</span>
                                            <span className="font-mono">{formatMoney(r.debe)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        <div className="detail-card">
                            <h4 className="detail-title text-danger">Pagos pendientes ({outstandingPayments.length})</h4>
                            <div className="detail-list">
                                {outstandingPayments.length === 0 ? <div className="text-muted text-xs p-2">Ninguno</div> :
                                    outstandingPayments.map(r => (
                                        <div key={r.id} className="detail-item" onClick={() => onFocusRow?.('libros', r.id)}>
                                            <span className="truncate flex-1">{r.fecha.substring(0, 10)} - {r.concepto}</span>
                                            <span className="font-mono">{formatMoney(r.haber)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        <div className="detail-card">
                            <h4 className="detail-title text-success">Créditos bancarios ({bankCredits.length})</h4>
                            <div className="detail-list bg-slate-50">
                                {bankCredits.length === 0 ? <div className="text-muted text-xs p-2">Ninguno</div> :
                                    bankCredits.map(r => (
                                        <div key={r.id} className="detail-item" onClick={() => onFocusRow?.('externo', r.id)}>
                                            <span className="truncate flex-1">{r.fecha ? r.fecha.substring(0, 10) : ''} - {r.concepto}</span>
                                            <span className="font-mono">{formatMoney(r.haber)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        <div className="detail-card">
                            <h4 className="detail-title text-danger">Débitos bancarios ({bankDebits.length})</h4>
                            <div className="detail-list bg-slate-50">
                                {bankDebits.length === 0 ? <div className="text-muted text-xs p-2">Ninguno</div> :
                                    bankDebits.map(r => (
                                        <div key={r.id} className="detail-item" onClick={() => onFocusRow?.('externo', r.id)}>
                                            <span className="truncate flex-1">{r.fecha ? r.fecha.substring(0, 10) : ''} - {r.concepto}</span>
                                            <span className="font-mono">{formatMoney(r.debe)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                    </div>
                </div>
            )}

            <style>{`
                .bank-recon-card {
                    background: #ffffff;
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                    overflow: hidden;
                    width: 100%;
                }
                .recon-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    background: #f8fafc;
                }
                .recon-title {
                    font-size: 1rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                /* Tooltip */
                .tooltip-container { position: relative; display: flex; align-items: center; cursor: help; color: #94a3b8; }
                .tooltip-content {
                    visibility: hidden;
                    position: absolute; left: 24px; top: 50%; transform: translateY(-50%);
                    background: #1e293b; color: white; padding: 6px 12px;
                    border-radius: 6px; font-size: 0.75rem; width: max-content; max-width: 300px;
                    z-index: 10;
                    opacity: 0; transition: opacity 0.2s;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    pointer-events: none;
                }
                .tooltip-container:hover .tooltip-content { visibility: visible; opacity: 1; }

                /* Grid Layout */
                .recon-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                }
                @media (min-width: 768px) {
                    .recon-grid { grid-template-columns: 1fr 1fr; }
                    .border-r-desktop { border-right: 1px solid #f1f5f9; }
                }

                .recon-col { padding: 24px; }
                .recon-row-group { display: flex; flex-direction: column; gap: 12px; }
                
                .recon-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: #475569; }
                
                .text-dark { color: #0f172a; }
                .text-primary { color: var(--primary-color); }
                .text-success { color: #15803d; }
                .text-danger { color: #dc2626; }
                .pl-4 { padding-left: 16px; }
                
                .divider-h { height: 1px; background: #e2e8f0; margin: 8px 0; }
                
                .recon-footer {
                    padding: 16px 24px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .status-badge {
                    display: flex; align-items: center; gap: 8px;
                    padding: 6px 12px; border-radius: 99px;
                    font-weight: 700; font-size: 0.85rem; border: 1px solid;
                }

                .btn-expand {
                    background: transparent; border: none;
                    color: #64748b; font-size: 0.85rem; font-weight: 600;
                    display: flex; align-items: center; gap: 6px; cursor: pointer;
                }
                .btn-expand:hover { color: #1e293b; }

                /* Details Section */
                .recon-details {
                    padding: 0 24px 24px;
                    background: #f8fafc;
                    border-top: 1px solid #f1f5f9;
                }
                .detail-cards-grid {
                    display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px;
                }
                @media (min-width: 1024px) {
                    .detail-cards-grid { grid-template-columns: repeat(2, 1fr); }
                }
                
                .detail-card {
                    background: white; border: 1px solid #e2e8f0; border-radius: 8px;
                    overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .detail-title {
                    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
                    padding: 8px 12px; margin: 0; background: #fafafa; border-bottom: 1px solid #f1f5f9;
                }
                .detail-list {
                    max-height: 150px; overflow-y: auto; padding: 4px 0;
                }
                .detail-item {
                    display: flex; justify-content: space-between; font-size: 0.8rem;
                    padding: 6px 12px; cursor: pointer; color: #334155;
                }
                .detail-item:hover { background: #f1f5f9; }
                
            `}</style>
        </div>
    )
}
