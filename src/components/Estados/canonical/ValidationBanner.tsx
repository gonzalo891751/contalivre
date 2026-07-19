/**
 * ValidationBanner — Fase 2C / Fase 2E (§14).
 *
 * Cuando todo valida: chip compacto "✓ Estados conciliados" que al hacer clic
 * despliega el detalle de invariantes. El banner grande queda reservado para
 * errores, bloqueantes, mappings faltantes o información insuficiente.
 */

import { useState } from 'react'
import type { StatementValidationReport } from '../../../reporting/domain/types'
import type { ReportStatus } from '../../../reporting/loadReportingBundle'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABEL: Record<ReportStatus, string> = {
    LOADING: 'Cargando…',
    DRAFT: 'Con borradores pendientes',
    BLOCKED: 'No validado',
    VALIDATED: 'Validado',
}

function ChecksTable({ report }: { report: StatementValidationReport }) {
    return (
        <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <tbody>
                {report.checks.map(c => (
                    <tr key={c.id}>
                        <td style={{ padding: '2px 6px' }}>{c.passed ? '✅' : '❌'}</td>
                        <td style={{ padding: '2px 6px' }}>{c.label}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right', color: c.passed ? 'inherit' : '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                            {c.difference !== undefined && c.difference !== 0 ? `Δ ${fmt(c.difference)}` : ''}
                            {c.detail ? ` ${c.detail}` : ''}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

export default function ValidationBanner({ report, status }: { report: StatementValidationReport; status: ReportStatus }) {
    const [open, setOpen] = useState(false)
    const failed = report.checks.filter(c => !c.passed)
    const ok = failed.length === 0

    // Todo conciliado: chip compacto, detalle a un clic (§14)
    if (ok) {
        return (
            <div style={{ marginBottom: 12 }}>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-expanded={open}
                    title={`Estado ${STATUS_LABEL[status]} · ver el detalle de los ${report.checks.length} invariantes`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                        background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)',
                        color: '#15803d', cursor: 'pointer',
                    }}
                >
                    ✓ Estados conciliados
                    {status === 'DRAFT' && <span style={{ fontWeight: 500, color: '#a16207' }}>· con borradores fuera de libros</span>}
                    <span aria-hidden style={{ fontSize: '0.65rem' }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div style={{ marginTop: 6, padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                        <ChecksTable report={report} />
                    </div>
                )}
            </div>
        )
    }

    // Con problemas: banner grande y detalle visible
    return (
        <div style={{ marginBottom: 16 }}>
            <div
                role="alert"
                style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: '#b91c1c',
                }}
            >
                ⚠ Estado {STATUS_LABEL[status]} — no publicable: {failed.map(f => f.label).join(' · ')}
            </div>
            <details style={{ marginTop: 6, fontSize: '0.8rem' }} open>
                <summary style={{ cursor: 'pointer', color: '#64748b' }}>Ver detalle de validaciones</summary>
                <ChecksTable report={report} />
            </details>
        </div>
    )
}
