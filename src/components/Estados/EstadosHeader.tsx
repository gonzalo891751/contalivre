import { Scale, TrendingUp, Coins, PieChart, LockKeyhole, Building2, FileText } from 'lucide-react'

// ============================================
// Types
// ============================================
export type EstadosTab = 'ESP' | 'ER' | 'EFE' | 'EPN' | 'NA'

interface TabConfig {
    id: EstadosTab
    label: string
    icon: React.ElementType
    disabled?: boolean
    tooltip?: string
}

interface EstadosHeaderProps {
    activeTab: EstadosTab
    onTabChange: (tab: EstadosTab) => void
    empresaName: string
}

const TABS: TabConfig[] = [
    { id: 'ESP', label: 'Situación Patrimonial', icon: Scale },
    { id: 'ER', label: 'Resultados', icon: TrendingUp },
    { id: 'EFE', label: 'Flujo de Efectivo', icon: Coins, disabled: true, tooltip: 'Próximamente' },
    { id: 'EPN', label: 'Evolución PN', icon: PieChart },
    { id: 'NA', label: 'Notas y Anexos', icon: FileText },
]

// ============================================
// Component
// ============================================
export function EstadosHeader({ activeTab, onTabChange, empresaName }: EstadosHeaderProps) {
    return (
        <header className="estados-header">
            <div className="estados-header-content">
                <div className="estados-header-row">
                    {/* Titles */}
                    <div className="estados-header-titles">
                        <span className="estados-header-label">Reportes Contables</span>
                        <h1 className="estados-header-title">ESTADOS CONTABLES</h1>
                        <p className="estados-header-subtitle">Los 4 estados contables básicos</p>
                    </div>

                    {/* Context Bar */}
                    <div className="estados-context-bar">
                        <div className="estados-empresa-chip">
                            <div className="estados-empresa-icon">
                                <Building2 size={14} strokeWidth={2.5} />
                            </div>
                            <span className="estados-empresa-name">{empresaName}</span>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="estados-tabs" aria-label="Estados Contables">
                    {TABS.map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        const isDisabled = tab.disabled

                        return (
                            <div key={tab.id} className="estados-tab-wrapper">
                                <button
                                    onClick={() => !isDisabled && onTabChange(tab.id)}
                                    disabled={isDisabled}
                                    className={`estados-tab ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                                    aria-current={isActive ? 'page' : undefined}
                                    aria-label={tab.label}
                                >
                                    <Icon size={16} strokeWidth={2} />
                                    <span>{tab.label}</span>
                                    {isDisabled && <LockKeyhole size={12} className="estados-tab-lock" />}
                                </button>
                                {isDisabled && tab.tooltip && (
                                    <div className="estados-tab-tooltip">{tab.tooltip}</div>
                                )}
                            </div>
                        )
                    })}
                </nav>
            </div>

            <style>{styles}</style>
        </header>
    )
}

// ============================================
// Styles (matching prototype exactly)
// ============================================
const styles = `
/* Header Container */
.estados-header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.estados-header-content {
    max-width: 1280px;
    margin: 0 auto;
    padding: 16px 16px 0;
}

@media (min-width: 640px) {
    .estados-header-content {
        padding: 16px 24px 0;
    }
}

@media (min-width: 1024px) {
    .estados-header-content {
        padding: 16px 32px 0;
    }
}

/* Header Row */
.estados-header-row {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

@media (min-width: 768px) {
    .estados-header-row {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
    }
}

/* Titles */
.estados-header-titles {
    display: flex;
    flex-direction: column;
}

.estados-header-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    font-family: var(--font-display, 'Outfit', sans-serif);
    margin-bottom: 4px;
}

.estados-header-title {
    font-size: 1.875rem;
    font-weight: 800;
    font-family: var(--font-display, 'Outfit', sans-serif);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    padding-bottom: 4px;
    margin: 0;
    line-height: 1.2;
}

.estados-header-subtitle {
    font-size: 0.875rem;
    color: #64748b;
    margin: 4px 0 0;
}

/* Context Bar */
.estados-context-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f8fafc;
    padding: 6px;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
}

.estados-empresa-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    border: 1px solid #e2e8f0;
}

.estados-empresa-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
}

.estados-empresa-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #334155;
}

/* Navigation Tabs */
.estados-tabs {
    display: flex;
    padding: 4px;
    gap: 4px;
    background: rgba(241, 245, 249, 0.8);
    border-radius: 12px;
    width: fit-content;
    border: 1px solid #e2e8f0;
    margin-top: 32px;
    margin-bottom: 8px;
}

.estados-tab-wrapper {
    position: relative;
}

.estados-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 0.875rem;
    font-weight: 500;
    font-family: var(--font-display, 'Outfit', sans-serif);
    color: #64748b;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.estados-tab:hover:not(.disabled):not(.active) {
    color: #334155;
    background: rgba(226, 232, 240, 0.5);
}

.estados-tab.active {
    background: white;
    color: #3B82F6;
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    ring: 1px solid rgba(0, 0, 0, 0.05);
}

.estados-tab.disabled {
    color: #94a3b8;
    cursor: not-allowed;
    opacity: 0.7;
}

.estados-tab-lock {
    margin-left: 2px;
    opacity: 0.6;
}

/* Tooltip */
.estados-tab-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: 4px 8px;
    background: #1e293b;
    color: white;
    font-size: 0.75rem;
    border-radius: 4px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
}

.estados-tab-wrapper:hover .estados-tab-tooltip {
    opacity: 1;
}

.estados-tab-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: #1e293b;
}
`
