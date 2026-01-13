import { Download } from 'lucide-react'

interface LedgerHeroProps {
    onExportPDF?: () => void
}

export default function LedgerHero({ onExportPDF }: LedgerHeroProps) {
    return (
        <header className="ledger-hero">
            <div className="ledger-hero-content">
                <div className="ledger-hero-info">
                    <div className="ledger-hero-title-row">
                        <h1 className="ledger-hero-title brand-gradient-text">
                            Libro Mayor
                        </h1>
                        <span className="ledger-hero-badge">Contabilidad</span>
                    </div>
                    <p className="ledger-hero-description">
                        Analizá los saldos de tus cuentas al detalle. Filtrá por estado para encontrar desvíos o cuentas a conciliar.
                    </p>
                </div>

                <div className="ledger-hero-actions">
                    <button
                        className="btn-premium btn-premium-primary"
                        onClick={onExportPDF}
                        aria-label="Exportar a PDF"
                    >
                        <Download size={16} />
                        Exportar PDF
                    </button>
                </div>
            </div>
        </header>
    )
}
