
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
    const TOLERANCE = 0.05

    const rightSide = totalLiabilities + totalEquity
    const diff = totalAssets - rightSide
    const isBalanced = Math.abs(diff) < TOLERANCE

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return (
        <div className="equation-card-wrapper">
            <div className={`equation-card ${isBalanced ? 'balanced' : 'imbalanced'}`}>

                {/* Header */}
                <div className="equation-header">
                    <span className="equation-icon">⚖️</span>
                    <span className="equation-title">Ecuación Patrimonial</span>
                </div>

                {/* Body: Compact Grid */}
                <div className="equation-grid">
                    {/* Activo (Col 1) */}
                    <div className="metric-col">
                        <span className="metric-label text-primary">ACTIVO</span>
                        <span className="metric-value">${formatAmount(totalAssets)}</span>
                    </div>

                    {/* = (Col 2) */}
                    <div className="symbol-col">
                        <span>=</span>
                    </div>

                    {/* Pasivo (Col 3) */}
                    <div className="metric-col">
                        <span className="metric-label text-error">PASIVO</span>
                        <span className="metric-value">${formatAmount(totalLiabilities)}</span>
                    </div>

                    {/* + (Col 4) */}
                    <div className="symbol-col">
                        <span>+</span>
                    </div>

                    {/* PN (Col 5) */}
                    <div className="metric-col">
                        <span className="metric-label text-success">PN</span>
                        <span className="metric-value">${formatAmount(totalEquity)}</span>
                    </div>
                </div>

                {/* Footer: Integrated Status Pill */}
                <div className="equation-footer">
                    {isBalanced ? (
                        <div className="status-pill success">
                            <span className="status-icon">✓</span>
                            <span>Balanceado</span>
                        </div>
                    ) : (
                        <div className="status-pill error">
                            <span className="status-icon">⚠️</span>
                            <span>Diferencia: ${formatAmount(diff)}</span>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .equation-card-wrapper {
                    margin-top: var(--space-xl);
                    width: 100%;
                    display: flex;
                    justify-content: center;
                }

                .equation-card {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    border-radius: 16px;
                    padding: 20px 32px;
                    width: 100%;
                    max-width: 800px; /* Constrain width for compactness */
                    box-shadow: 
                        0 4px 6px -1px rgba(0, 0, 0, 0.05), 
                        0 2px 4px -1px rgba(0, 0, 0, 0.03);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }

                .equation-card:hover {
                    transform: translateY(-1px);
                    box-shadow: 
                        0 10px 15px -3px rgba(0, 0, 0, 0.05), 
                        0 4px 6px -2px rgba(0, 0, 0, 0.025);
                    border-color: rgba(148, 163, 184, 0.5);
                }

                /* Status Top Border Highlight */
                .equation-card.balanced::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 3px;
                    background: linear-gradient(90deg, transparent, #22c55e, transparent);
                    opacity: 0.6;
                }

                .equation-card.imbalanced::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 3px;
                    background: linear-gradient(90deg, transparent, #ef4444, transparent);
                    opacity: 0.6;
                }

                .equation-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    margin-bottom: 16px;
                    opacity: 0.7;
                }
                
                .equation-title {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    font-weight: 600;
                    color: #64748b;
                }

                /* Compact Grid Layout */
                .equation-grid {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr auto 1fr;
                    gap: 16px;
                    align-items: center; /* Vertical center alignment */
                    margin-bottom: 20px;
                }

                .metric-col {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                }

                .metric-label {
                    font-size: 0.8rem;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }

                .metric-value {
                    font-size: 1.6rem;
                    font-weight: 700;
                    color: #1e293b;
                    font-feature-settings: "tnum";
                    letter-spacing: -0.02em;
                }

                .symbol-col {
                    font-size: 1.5rem;
                    color: #94a3b8;
                    font-weight: 300;
                    opacity: 0.5;
                    padding-bottom: 8px; /* Optical alignment with numbers */
                }

                .text-primary { color: #2563EB; }
                .text-error { color: #dc2626; } 
                .text-success { color: #7C3AED; } 

                .equation-footer {
                    display: flex;
                    justify-content: center;
                }

                .status-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                }

                .status-pill.success {
                    background-color: #f0fdf4;
                    color: #15803d;
                    border-color: rgba(34, 197, 94, 0.2);
                }

                .status-pill.error {
                    background-color: #fef2f2;
                    color: #b91c1c;
                    border-color: rgba(239, 68, 68, 0.2);
                }

                /* Mobile Stack */
                @media (max-width: 640px) {
                    .equation-grid {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }
                    .symbol-col {
                        display: none; /* Hide symbols on mobile stack for cleaner look, or rotate them */
                    }
                    /* Alternatively show them as small dividers */
                    .symbol-col {
                        display: flex;
                        justify-content: center;
                        height: 20px;
                        font-size: 1.2rem;
                        transform: rotate(90deg);
                    }
                }
            `}</style>
        </div>
    )
}
