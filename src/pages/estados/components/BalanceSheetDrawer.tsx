/**
 * Balance Sheet Drawer
 * Shows detail of accounts within a rubro (off-canvas panel)
 */
import { useEffect, useCallback } from 'react'
import type { Rubro } from '../adapters/balanceSheetViewModel'
import { formatCurrencyARS } from '../../../core/amortizaciones/calc'

// ============================================
// Props
// ============================================

interface BalanceSheetDrawerProps {
    isOpen: boolean
    onClose: () => void
    rubro: Rubro | null
}

// ============================================
// Component
// ============================================

export function BalanceSheetDrawer({ isOpen, onClose, rubro }: BalanceSheetDrawerProps) {
    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    const handleBackdropClick = useCallback(() => {
        onClose()
    }, [onClose])

    if (!isOpen || !rubro) return null

    const totalAmount = rubro.accounts.reduce((sum, acc) => sum + acc.amount, 0)

    return (
        <div className={`bsd-overlay ${isOpen ? 'visible' : ''}`}>
            {/* Backdrop */}
            <div className="bsd-backdrop" onClick={handleBackdropClick}></div>

            {/* Panel */}
            <div className={`bsd-panel ${isOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="bsd-header">
                    <div className="bsd-header-info">
                        <span className="bsd-header-label">Detalle de Rubro</span>
                        <h3 className="bsd-title">{rubro.label}</h3>
                    </div>
                    <button className="bsd-close-btn" onClick={onClose} aria-label="Cerrar">
                        <i className="ph-bold ph-x"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="bsd-content">
                    {rubro.accounts.length > 0 ? (
                        <div className="bsd-accounts-list">
                            {rubro.accounts.map((account, idx) => (
                                <div key={idx} className="bsd-account-row">
                                    <div className="bsd-account-info">
                                        <span className="bsd-account-code">{account.code}</span>
                                        <span className="bsd-account-name">
                                            {account.name}
                                            {account.isContra && (
                                                <span className="bsd-contra-badge">Regularizadora</span>
                                            )}
                                        </span>
                                    </div>
                                    <span className={`bsd-account-amount ${account.amount < 0 ? 'negative' : ''}`}>
                                        {formatCurrencyARS(account.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bsd-empty-state">
                            No hay cuentas imputadas directamente a este rubro.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bsd-footer">
                    <div className="bsd-footer-total">
                        <span>Total Rubro</span>
                        <span className="bsd-total-amount">{formatCurrencyARS(totalAmount)}</span>
                    </div>
                    <button className="bsd-edit-btn" disabled>
                        <i className="ph ph-pencil-simple"></i>
                        Editar Asignación de Cuentas
                    </button>
                </div>
            </div>

            <style>{drawerStyles}</style>
        </div>
    )
}

// ============================================
// Styles
// ============================================

const drawerStyles = `
/* Overlay */
.bsd-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    visibility: hidden;
}

.bsd-overlay.visible {
    visibility: visible;
}

/* Backdrop */
.bsd-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(4px);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.bsd-overlay.visible .bsd-backdrop {
    opacity: 1;
}

/* Panel */
.bsd-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    max-width: 420px;
    background: white;
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.15);
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
}

.bsd-panel.open {
    transform: translateX(0);
}

/* Header */
.bsd-header {
    padding: 24px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.bsd-header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.bsd-header-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
}

.bsd-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.5rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
}

.bsd-close-btn {
    padding: 8px;
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s ease;
}

.bsd-close-btn:hover {
    background: #e2e8f0;
    color: #0f172a;
}

.bsd-close-btn i {
    font-size: 1.25rem;
}

/* Content */
.bsd-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.bsd-accounts-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.bsd-account-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 12px;
    border-bottom: 1px dashed #e2e8f0;
}

.bsd-account-row:last-child {
    border-bottom: none;
}

.bsd-account-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
    padding-right: 16px;
}

.bsd-account-code {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    color: #64748b;
}

.bsd-account-name {
    font-size: 0.9375rem;
    font-weight: 500;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.bsd-contra-badge {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: #fef2f2;
    color: #dc2626;
    padding: 2px 6px;
    border-radius: 4px;
}

.bsd-account-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-weight: 500;
    color: #0f172a;
    white-space: nowrap;
}

.bsd-account-amount.negative {
    color: #dc2626;
}

/* Empty State */
.bsd-empty-state {
    text-align: center;
    padding: 48px 24px;
    color: #64748b;
    font-style: italic;
}

/* Footer */
.bsd-footer {
    padding: 24px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
}

.bsd-footer-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.125rem;
    font-weight: 700;
}

.bsd-total-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    color: #3B82F6;
}

.bsd-edit-btn {
    width: 100%;
    margin-top: 16px;
    padding: 12px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease;
}

.bsd-edit-btn:hover:not(:disabled) {
    color: #3B82F6;
    border-color: #3B82F6;
}

.bsd-edit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Prevent body scroll when drawer is open */
@media print {
    .bsd-overlay {
        display: none !important;
    }
}
`

export default BalanceSheetDrawer
