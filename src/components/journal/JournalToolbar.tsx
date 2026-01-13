/**
 * JournalToolbar - Search and filter toolbar for Libro Diario
 */
import { Search, Calendar, Filter, Download } from 'lucide-react'

interface JournalToolbarProps {
    searchQuery: string
    onSearchChange: (query: string) => void
    onDownloadPDF: () => void
    isExporting: boolean
}

export function JournalToolbar({
    searchQuery,
    onSearchChange,
    onDownloadPDF,
    isExporting
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
