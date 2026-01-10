import { useMemo } from 'react'

interface EquationBarProps {
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
}

export function EquationBar({
    totalAssets,
    totalLiabilities,
    totalEquity
}: EquationBarProps) {
    const TOLERANCE = 0.05 // increased slightly to be safe against floating point

    const rightSide = totalLiabilities + totalEquity
    const diff = totalAssets - rightSide
    const isBalanced = Math.abs(diff) < TOLERANCE

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return (
        <div className="equation-bar-container">
            <div className={`equation-bar ${isBalanced ? 'balanced' : 'imbalanced'}`}>
                <div className="equation-content">
                    <div className="equation-part">
                        <span className="equation-label">TOTAL ACTIVO</span>
                        <span className="equation-value">${formatAmount(totalAssets)}</span>
                    </div>

                    <div className="equation-operator">=</div>

                    <div className="equation-part">
                        <span className="equation-label">TOTAL PASIVO</span>
                        <span className="equation-value">${formatAmount(totalLiabilities)}</span>
                    </div>

                    <div className="equation-operator">+</div>

                    <div className="equation-part">
                        <span className="equation-label">TOTAL PN</span>
                        <span className="equation-value">${formatAmount(totalEquity)}</span>
                    </div>
                </div>

                <div className="equation-status">
                    {isBalanced ? (
                        <span className="status-badge success">
                            ✓ ECUACIÓN VERIFICADA
                        </span>
                    ) : (
                        <span className="status-badge error">
                            ⚠ DIFERENCIA: ${formatAmount(diff)}
                        </span>
                    )}
                </div>
            </div>

            <style>{`
                .equation-bar-container {
                    margin-top: var(--space-xl);
                    width: 100%;
                }

                .equation-bar {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-lg);
                    border-radius: var(--radius-md);
                    border: 1px solid;
                    background: var(--color-bg-surface);
                    box-shadow: var(--shadow-md);
                    transition: all 0.3s ease;
                }

                .equation-bar.balanced {
                    border-color: var(--color-success-border);
                    background: linear-gradient(to bottom, var(--color-bg-surface), #f0fdf4);
                }

                .equation-bar.imbalanced {
                    border-color: var(--color-error-border);
                    background: linear-gradient(to bottom, var(--color-bg-surface), #fef2f2);
                }

                .equation-content {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: var(--space-md);
                    width: 100%;
                }

                .equation-part {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }

                .equation-label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--color-text-secondary);
                    font-weight: 600;
                }

                .equation-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--color-text-primary);
                    font-feature-settings: "tnum";
                }

                .equation-operator {
                    font-size: 1.5rem;
                    color: var(--color-text-tertiary);
                    font-weight: 300;
                    padding: 0 var(--space-xs);
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                }

                .status-badge.success {
                    background-color: var(--color-success-bg);
                    color: var(--color-success);
                }

                .status-badge.error {
                    background-color: var(--color-error-bg);
                    color: var(--color-error);
                }

                @media (max-width: 640px) {
                    .equation-content {
                        flex-direction: column;
                        align-items: center;
                        gap: var(--space-sm);
                    }
                    
                    .equation-operator {
                        transform: rotate(90deg);
                        margin: -8px 0;
                    }
                }
            `}</style>
        </div>
    )
}
