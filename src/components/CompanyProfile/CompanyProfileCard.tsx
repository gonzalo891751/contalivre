/**
 * CompanyProfileCard
 * Dashboard card with empty/filled states
 * Pixel-perfect replication of prototype
 */

import { Building2, IdCard, Pencil, FileText, AlertCircle } from 'lucide-react'
import type { CompanyProfile } from '../../core/companyProfile/types'
import './CompanyProfile.css'

interface CompanyProfileCardProps {
    profile: CompanyProfile | null
    isConfigured: boolean
    onEdit: () => void
    onPrintPdf: () => void
}

/**
 * Format date for display (YYYY-MM-DD -> DD/MM/YYYY)
 */
function formatDate(dateStr?: string): string {
    if (!dateStr) return '-'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
}

export function CompanyProfileCard({
    profile,
    isConfigured,
    onEdit,
    onPrintPdf,
}: CompanyProfileCardProps) {
    if (!isConfigured) {
        // EMPTY STATE
        return (
            <div className="cp-card cp-card-empty">
                <div className="cp-card-empty-icon">
                    <AlertCircle size={32} />
                </div>
                <h4 className="cp-card-empty-title">Faltan configurar los datos</h4>
                <p className="cp-card-empty-text">
                    Para que los Estados Contables y reportes PDF salgan bien,
                    necesitamos que cargues la información fiscal de la empresa.
                </p>
                <button className="cp-card-empty-btn" onClick={onEdit}>
                    <Pencil size={16} />
                    Configurar ficha ahora
                </button>
            </div>
        )
    }

    // FILLED STATE
    const fiscalYearDisplay = profile?.fiscalYearStart && profile?.fiscalYearEnd
        ? `${formatDate(profile.fiscalYearStart)} al ${formatDate(profile.fiscalYearEnd)}`
        : '-'

    return (
        <div className="cp-card">
            <div className="cp-card-filled-header">
                <div className="cp-card-filled-info">
                    <div className="cp-card-filled-icon">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h2 className="cp-card-filled-name">{profile?.legalName}</h2>
                        <div className="cp-card-filled-cuit">
                            <IdCard size={14} />
                            <span className="cp-card-filled-cuit-value">{profile?.cuit}</span>
                        </div>
                    </div>
                </div>
                <div className="cp-card-filled-actions">
                    <button className="cp-card-btn cp-card-btn-secondary" onClick={onPrintPdf}>
                        <FileText size={16} />
                        PDF Oficial
                    </button>
                    <button className="cp-card-btn cp-card-btn-outline" onClick={onEdit}>
                        <Pencil size={16} />
                        Editar
                    </button>
                </div>
            </div>
            <div className="cp-card-filled-body">
                <div>
                    <div className="cp-card-field-label">Actividad Principal</div>
                    <div className="cp-card-field-value">{profile?.mainActivity || '-'}</div>
                </div>
                <div>
                    <div className="cp-card-field-label">Domicilio Legal</div>
                    <div className="cp-card-field-value">{profile?.legalAddress || '-'}</div>
                </div>
                <div>
                    <div className="cp-card-field-label">Ejercicio Actual</div>
                    <div className="cp-card-field-value">{fiscalYearDisplay}</div>
                </div>
            </div>
        </div>
    )
}

export default CompanyProfileCard
