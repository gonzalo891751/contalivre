/**
 * JournalToolbar - Search and filter toolbar for Libro Diario
 */
import { Search, Calendar, Filter, Download, Eye, List } from 'lucide-react'

interface JournalToolbarProps {
    searchQuery: string
    onSearchChange: (query: string) => void
    onDownloadPDF: () => void
    isExporting: boolean
    formalView?: boolean
    onToggleView?: () => void
}

export function JournalToolbar({
    searchQuery,
    onSearchChange,
    onDownloadPDF,
    isExporting,
    formalView = true,
    onToggleView,
}: JournalToolbarProps) {
    return (
        <div className="journal-toolbar">
            <div className="journal-toolbar-search">
                <Search className="journal-toolbar-search-icon" size={18} />
                <input
                    type="text"
                    placeholder="Buscar por concepto, cuenta o importe..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="journal-toolbar-search-input"
                />
            </div>

            <div className="journal-toolbar-actions">
                {onToggleView && (
                    <button
                        className={`journal-toolbar-btn ${formalView ? 'journal-toolbar-btn-active' : ''}`}
                        onClick={onToggleView}
                        title={formalView ? 'Vista formal: cuentas colectivas' : 'Vista analítica: subcuentas individuales'}
                    >
                        {formalView ? <Eye size={16} /> : <List size={16} />}
                        <span>{formalView ? 'Formal' : 'Analítica'}</span>
                    </button>
                )}
                <button className="journal-toolbar-btn" disabled>
                    <Calendar size={16} />
                    <span>Este mes</span>
                </button>
                <button className="journal-toolbar-btn" disabled>
                    <Filter size={16} />
                    <span>Filtrar</span>
                </button>
                <button
                    className="journal-toolbar-btn-pdf"
                    onClick={onDownloadPDF}
                    disabled={isExporting}
                >
                    <Download size={16} />
                    <span>{isExporting ? 'Generando...' : 'PDF'}</span>
                </button>
            </div>
        </div>
    )
}
