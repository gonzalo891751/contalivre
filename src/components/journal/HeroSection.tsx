/**
 * HeroSection - Premium hero card for Libro Diario page
 */
import { Plus, Download } from 'lucide-react'
import { motion } from 'framer-motion'

interface HeroSectionProps {
    onNewEntry: () => void
    onImport: () => void
}

export function HeroSection({ onNewEntry, onImport }: HeroSectionProps) {
    return (
        <div className="journal-hero">
            {/* Decorative Background Element */}
            <div className="journal-hero-decoration" />

            <div className="journal-hero-content">
                <div className="journal-hero-text">
                    <h1 className="journal-hero-title">Libro Diario</h1>
                    <p className="journal-hero-description">
                        En esta página se encuentran todos los asientos registrados.
                        <span className="journal-hero-description-desktop">
                            {' '}Mantené tu contabilidad al día revisando que todo balancee correctamente.
                        </span>
                    </p>
                </div>

                <div className="journal-hero-actions">
                    <button
                        className="journal-btn-secondary"
                        onClick={onImport}
                    >
                        <Download size={18} />
                        <span>Importar</span>
                    </button>

                    <motion.button
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onNewEntry}
                        className="journal-btn-primary"
                    >
                        <Plus size={20} />
                        <span>Nuevo asiento</span>
                    </motion.button>
                </div>
            </div>
        </div>
    )
}
