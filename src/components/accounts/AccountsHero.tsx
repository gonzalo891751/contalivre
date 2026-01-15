import { Upload, Plus, Wand2 } from 'lucide-react'

interface AccountsHeroProps {
    totalAccounts: number
    totalLevels: number
    isBalanced: boolean
    onImport: () => void
    onNewAccount: () => void
    onMapping?: () => void
}

export default function AccountsHero({
    totalAccounts,
    totalLevels,
    isBalanced,
    onImport,
    onNewAccount,
    onMapping,
}: AccountsHeroProps) {
    return (
        <header className="accounts-hero">
            <div className="accounts-hero-content">
                <div className="accounts-hero-info">
                    <div className="accounts-hero-title-row">
                        <h1 className="accounts-hero-title brand-gradient-text">
                            Plan de Cuentas
                        </h1>
                        <span className="accounts-hero-badge">Contabilidad</span>
                    </div>
                    <p className="accounts-hero-description">
                        Estructurá la contabilidad de tu negocio. Organizá activos, pasivos y resultados para tener reportes claros.
                    </p>
                </div>

                <div className="accounts-hero-actions">
                    {onMapping && (
                        <button
                            className="btn-premium btn-premium-primary"
                            onClick={onMapping}
                        >
                            <Wand2 size={16} />
                            Asistente de Mapeo
                        </button>
                    )}
                    <button
                        className="btn-premium btn-premium-secondary"
                        onClick={onImport}
                    >
                        <Upload size={16} />
                        Importar
                    </button>
                    <button
                        className="btn-premium btn-premium-secondary"
                        onClick={onNewAccount}
                    >
                        <Plus size={16} />
                        Nueva Cuenta
                    </button>
                </div>
            </div>

            <div className="accounts-hero-kpis">
                <div className="accounts-kpi">
                    <span className="accounts-kpi-label">Total Cuentas</span>
                    <span className="accounts-kpi-value">{totalAccounts}</span>
                </div>
                <div className="accounts-kpi">
                    <span className="accounts-kpi-label">Niveles</span>
                    <span className="accounts-kpi-value">{totalLevels}</span>
                </div>
                <div className="accounts-kpi">
                    <span className="accounts-kpi-label">Estado</span>
                    <div className="accounts-kpi-status">
                        <span
                            className="accounts-kpi-dot"
                            style={{
                                background: isBalanced ? 'var(--color-success)' : 'var(--color-warning)'
                            }}
                        />
                        <span
                            className="accounts-kpi-status-text"
                            style={{
                                color: isBalanced ? 'var(--color-success)' : 'var(--color-warning)'
                            }}
                        >
                            {isBalanced ? 'Balanceado' : 'Desbalanceado'}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    )
}
