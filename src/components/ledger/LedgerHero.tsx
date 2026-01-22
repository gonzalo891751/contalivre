import { Download } from 'lucide-react'

interface LedgerHeroProps {
    onExportPDF?: () => void
}

export default function LedgerHero({ onExportPDF }: LedgerHeroProps) {
    return (
        <header className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-emerald-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent mb-2">
                        Libro Mayor
                    </h1>
                    <p className="text-slate-500 max-w-xl">
                        Analizá los saldos de tus cuentas al detalle. Filtrá por estado para encontrar desvíos o cuentas a conciliar.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02] transition-all text-sm"
                        onClick={onExportPDF}
                        type="button"
                        aria-label="Exportar a PDF"
                    >
                        <Download size={18} />
                        <span>Exportar PDF</span>
                    </button>
                </div>
            </div>
        </header>
    )
}
