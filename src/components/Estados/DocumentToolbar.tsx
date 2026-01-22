import { useState, useCallback } from 'react'
import { Info, ChevronDown, Share2, FileDown, Loader2 } from 'lucide-react'

// ============================================
// Types
// ============================================
interface DocumentToolbarProps {
    // Comparative feature
    showComparative: boolean
    onToggleComparative: (value: boolean) => void
    comparativeYear: number
    availableYears: number[]
    onYearChange: (year: number) => void
    hasComparativeData: boolean
    onImportClick: () => void
    onClearClick: () => void

    // Info panel content
    infoTitle?: string
    infoItems?: string[]

    // Actions
    onShare?: () => void
    onDownloadPdf: () => void
    isExporting?: boolean
}

// ============================================
// Component
// ============================================
export function DocumentToolbar({
    showComparative,
    onToggleComparative,
    comparativeYear,
    availableYears,
    onYearChange,
    hasComparativeData,
    onImportClick,
    onClearClick,
    infoTitle = 'Sobre este estado',
    infoItems = [],
    onShare,
    onDownloadPdf,
    isExporting = false,
}: DocumentToolbarProps) {
    const [guideOpen, setGuideOpen] = useState(false)
    const [yearDropdownOpen, setYearDropdownOpen] = useState(false)

    const handleToggle = useCallback(() => {
        const newValue = !showComparative
        onToggleComparative(newValue)

        // If turning on without data, trigger import
        if (newValue && !hasComparativeData) {
            onImportClick()
        }
    }, [showComparative, hasComparativeData, onToggleComparative, onImportClick])

    return (
        <div className="doc-toolbar">
            {/* Left: Info Accordion */}
            <div className="doc-toolbar-left">
                <button
                    onClick={() => setGuideOpen(p => !p)}
                    className="doc-toolbar-guide-btn"
                    aria-expanded={guideOpen}
                >
                    <div className="doc-toolbar-guide-icon">
                        <Info size={14} strokeWidth={2.5} />
                    </div>
                    <span className="doc-toolbar-guide-text">{infoTitle}</span>
                    <ChevronDown
                        size={14}
                        className={`doc-toolbar-chevron ${guideOpen ? 'open' : ''}`}
                    />
                </button>
                {guideOpen && infoItems.length > 0 && (
                    <div className="doc-toolbar-guide-content">
                        {infoItems.map((item, idx) => (
                            <p key={idx}>• {item}</p>
                        ))}
                    </div>
                )}
            </div>

            {/* Right: Actions */}
            <div className="doc-toolbar-right">
                {/* Comparative Switch */}
                <div className="doc-toolbar-compare">
                    <span className="doc-toolbar-compare-label">Comparar</span>

                    <button
                        onClick={handleToggle}
                        className={`doc-toolbar-toggle ${showComparative ? 'on' : ''}`}
                        role="switch"
                        aria-checked={showComparative}
                        aria-label="Activar modo comparativo"
                    >
                        <span className="doc-toolbar-toggle-knob" />
                    </button>

                    {/* Year Dropdown */}
                    <div className="doc-toolbar-year-dropdown">
                        <button
                            onClick={() => setYearDropdownOpen(p => !p)}
                            className="doc-toolbar-year-btn"
                            aria-haspopup="listbox"
                            aria-expanded={yearDropdownOpen}
                        >
                            <span className="doc-toolbar-year-text">vs {comparativeYear}</span>
                            <ChevronDown size={12} />
                        </button>

                        {yearDropdownOpen && (
                            <div className="doc-toolbar-year-menu">
                                {availableYears.map(year => (
                                    <button
                                        key={year}
                                        onClick={() => {
                                            onYearChange(year)
                                            setYearDropdownOpen(false)
                                        }}
                                        className={`doc-toolbar-year-option ${year === comparativeYear ? 'active' : ''}`}
                                    >
                                        vs {year}
                                    </button>
                                ))}
                                {hasComparativeData && (
                                    <>
                                        <div className="doc-toolbar-year-divider" />
                                        <button
                                            onClick={() => {
                                                onClearClick()
                                                setYearDropdownOpen(false)
                                            }}
                                            className="doc-toolbar-year-option danger"
                                        >
                                            Limpiar comparativo
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="doc-toolbar-divider" />

                {/* Share Button */}
                {onShare && (
                    <button onClick={onShare} className="doc-toolbar-btn secondary" aria-label="Compartir">
                        <Share2 size={16} />
                        <span className="doc-toolbar-btn-text">Compartir</span>
                    </button>
                )}

                {/* Download PDF Button */}
                <button
                    onClick={onDownloadPdf}
                    disabled={isExporting}
                    className="doc-toolbar-btn primary"
                    aria-label="Descargar PDF"
                >
                    {isExporting ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <FileDown size={16} />
                    )}
                    <span>Descargar PDF</span>
                </button>
            </div>

            <style>{styles}</style>
        </div>
    )
}

// ============================================
// Styles (matching prototype)
// ============================================
const styles = `
/* Container */
.doc-toolbar {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #f1f5f9;
    margin-bottom: 24px;
}

@media (min-width: 640px) {
    .doc-toolbar {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }
}

/* Left: Guide */
.doc-toolbar-left {
    flex: 1;
}

.doc-toolbar-guide-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    color: #64748b;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s ease;
}

.doc-toolbar-guide-btn:hover {
    color: #3B82F6;
}

.doc-toolbar-guide-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #eff6ff;
    color: #3B82F6;
    display: flex;
    align-items: center;
    justify-content: center;
}

.doc-toolbar-guide-text {
    font-weight: 500;
    border-bottom: 1px dashed #cbd5e1;
}

.doc-toolbar-chevron {
    transition: transform 0.2s ease;
}

.doc-toolbar-chevron.open {
    transform: rotate(180deg);
}

.doc-toolbar-guide-content {
    margin-top: 12px;
    padding-left: 32px;
    font-size: 0.75rem;
    color: #64748b;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.doc-toolbar-guide-content p {
    margin: 0;
}

/* Right: Actions */
.doc-toolbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

@media (min-width: 640px) {
    .doc-toolbar-right {
        gap: 16px;
        flex-wrap: nowrap;
    }
}

/* Compare Section */
.doc-toolbar-compare {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f8fafc;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    margin-right: 8px;
}

.doc-toolbar-compare-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
}

/* Toggle Switch */
.doc-toolbar-toggle {
    position: relative;
    width: 40px;
    height: 20px;
    background: #cbd5e1;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.3s ease;
}

.doc-toolbar-toggle.on {
    background: #10B981;
}

.doc-toolbar-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease;
}

.doc-toolbar-toggle.on .doc-toolbar-toggle-knob {
    transform: translateX(20px);
}

/* Year Dropdown */
.doc-toolbar-year-dropdown {
    position: relative;
}

.doc-toolbar-year-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.875rem;
    font-weight: 500;
    color: #334155;
    transition: color 0.2s ease;
}

.doc-toolbar-year-btn:hover {
    color: #3B82F6;
}

.doc-toolbar-year-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    min-width: 140px;
    z-index: 50;
    overflow: hidden;
}

.doc-toolbar-year-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: #334155;
    transition: background 0.15s ease;
}

.doc-toolbar-year-option:hover {
    background: #f8fafc;
}

.doc-toolbar-year-option.active {
    background: #eff6ff;
    color: #2563eb;
    font-weight: 600;
}

.doc-toolbar-year-option.danger {
    color: #ef4444;
}

.doc-toolbar-year-option.danger:hover {
    background: #fef2f2;
}

.doc-toolbar-year-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 4px 0;
}

/* Divider */
.doc-toolbar-divider {
    width: 1px;
    height: 24px;
    background: #e2e8f0;
    display: none;
}

@media (min-width: 640px) {
    .doc-toolbar-divider {
        display: block;
    }
}

/* Buttons */
.doc-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.doc-toolbar-btn.secondary {
    background: white;
    border: 1px solid #e2e8f0;
    color: #475569;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.doc-toolbar-btn.secondary:hover {
    background: #f8fafc;
}

.doc-toolbar-btn.primary {
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    border: none;
    color: white;
    font-weight: 600;
    padding: 10px 16px;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.doc-toolbar-btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
}

.doc-toolbar-btn.primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
}

.doc-toolbar-btn-text {
    display: none;
}

@media (min-width: 640px) {
    .doc-toolbar-btn-text {
        display: inline;
    }
}
`
