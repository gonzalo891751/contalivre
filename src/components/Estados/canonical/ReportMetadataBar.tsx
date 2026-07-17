/**
 * ReportMetadataBar — Fase 2C (§6.2 / §15.2): encabezado con identidad,
 * normativa, estado del reporte, versión del motor y acciones de exportación.
 * Muestra siempre desde qué contexto se generó lo que se ve.
 */

import type { ReportMetadata } from '../../../reporting/loadReportingBundle'

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
    VALIDATED: { label: 'Validado', bg: 'rgba(34,197,94,0.12)', color: '#15803d' },
    DRAFT: { label: 'Con borradores', bg: 'rgba(234,179,8,0.12)', color: '#a16207' },
    BLOCKED: { label: 'No validado', bg: 'rgba(239,68,68,0.12)', color: '#b91c1c' },
    LOADING: { label: 'Cargando', bg: 'rgba(148,163,184,0.15)', color: '#64748b' },
}

interface Props {
    metadata: ReportMetadata
    showComparative: boolean
    onToggleComparative: () => void
    onDownloadPdf: () => void
    onDownloadXlsx: () => void
    onEditCompany: () => void
    isExporting: boolean
}

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return d && m && y ? `${d}/${m}/${y}` : iso
}

export function ReportMetadataBar({ metadata, showComparative, onToggleComparative, onDownloadPdf, onDownloadXlsx, onEditCompany, isExporting }: Props) {
    const chip = STATUS_CHIP[metadata.status] ?? STATUS_CHIP.LOADING
    return (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {metadata.companyLegalName}
                        {metadata.companyTaxId && <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.85rem' }}> · CUIT {metadata.companyTaxId}</span>}
                        <button className="btn btn-icon btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={onEditCompany} title="Editar empresa">✎</button>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                        {metadata.exerciseLabel} · corte {fmtDate(metadata.periodEnd)} · {metadata.currency} ({metadata.unit}) · {metadata.normative}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                        Motor {metadata.engineVersion} · schema v{metadata.schemaVersion} · reporte {metadata.reportVersion} · commit {metadata.commit}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: chip.bg, color: chip.color }}>
                        {chip.label}
                    </span>
                    <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={showComparative} onChange={onToggleComparative} />
                        Comparativo
                    </label>
                    <button className="btn btn-secondary btn-sm" onClick={onDownloadPdf} disabled={isExporting}>
                        {isExporting ? '…' : 'PDF'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={onDownloadXlsx} disabled={isExporting}>
                        {isExporting ? '…' : 'Planilla'}
                    </button>
                </div>
            </div>
        </div>
    )
}
