/**
 * ReportMetadataBar — Fase 2C (§6.2) / Fase 2E (§14): encabezado con identidad,
 * normativa, estado del reporte y acciones. Los identificadores técnicos
 * (motor, schema, hash de reporte, commit) viven en el popover "Detalles
 * técnicos"; la acción de congelar versión se llama "Guardar versión validada"
 * (snapshot queda como nombre interno).
 */

import { useEffect, useRef, useState } from 'react'
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
    onExport: () => void
    onEditCompany: () => void
    onPublishSnapshot?: () => void
    snapshotInfo?: string
}

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return d && m && y ? `${d}/${m}/${y}` : iso
}

function TechDetailsPopover({ metadata }: { metadata: ReportMetadata }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDoc)
        document.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
    }, [open])

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(o => !o)}
                style={{ fontSize: '0.72rem' }}
            >
                Detalles técnicos
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label="Detalles técnicos del reporte"
                    style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30,
                        background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: '10px 14px',
                        fontSize: '0.75rem', color: '#475569', minWidth: 260, lineHeight: 1.7,
                    }}
                >
                    <div><strong>Versión app:</strong> {metadata.appVersion}</div>
                    <div><strong>Motor contable:</strong> {metadata.engineVersion}</div>
                    <div><strong>Schema:</strong> v{metadata.schemaVersion}</div>
                    <div><strong>Versión de reporte:</strong> {metadata.reportVersion}</div>
                    <div><strong>Commit:</strong> {metadata.commit}</div>
                    <div><strong>Build:</strong> {metadata.buildDate}</div>
                    <div><strong>Generado:</strong> {metadata.generatedAt.slice(0, 19).replace('T', ' ')}</div>
                </div>
            )}
        </div>
    )
}

export function ReportMetadataBar({ metadata, showComparative, onToggleComparative, onExport, onEditCompany, onPublishSnapshot, snapshotInfo }: Props) {
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
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: chip.bg, color: chip.color }}>
                        {chip.label}
                    </span>
                    <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={showComparative} onChange={onToggleComparative} />
                        Comparativo
                    </label>
                    <TechDetailsPopover metadata={metadata} />
                    <button className="btn btn-primary btn-sm" onClick={onExport}>
                        Exportar estados
                    </button>
                    {onPublishSnapshot && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={onPublishSnapshot}
                            disabled={metadata.status === 'BLOCKED'}
                            title={metadata.status === 'BLOCKED'
                                ? 'No se puede guardar una versión con validaciones en rojo'
                                : 'Congelar una versión validada del reporte (snapshot interno)'}
                        >
                            Guardar versión validada
                        </button>
                    )}
                </div>
            </div>
            {snapshotInfo && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 6 }}>{snapshotInfo}</div>
            )}
        </div>
    )
}
