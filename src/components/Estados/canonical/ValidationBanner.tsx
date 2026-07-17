/**
 * ValidationBanner — Fase 2C: muestra el estado del reporte y sus invariantes.
 * No permite presentar como "validado" un estado con checks en rojo (§5.3).
 */

import type { StatementValidationReport } from '../../../reporting/domain/types'
import type { ReportStatus } from '../../../reporting/loadReportingBundle'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABEL: Record<ReportStatus, string> = {
    LOADING: 'Cargando…',
    DRAFT: 'Con borradores pendientes',
    BLOCKED: 'No validado',
    VALIDATED: 'Validado',
}

export default function ValidationBanner({ report, status }: { report: StatementValidationReport; status: ReportStatus }) {
    const failed = report.checks.filter(c => !c.passed)
    const ok = failed.length === 0
    return (
        <div style={{ marginBottom: 16 }}>
            <div
                role="status"
                style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                    background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)',
                    border: ok ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
                    color: ok ? '#15803d' : '#b91c1c',
                }}
            >
                {ok
                    ? `✓ Estado ${STATUS_LABEL[status]}: todos los invariantes contables se cumplen.`
                    : `⚠ Estado ${STATUS_LABEL[status]} — no publicable: ${failed.map(f => f.label).join(' · ')}`}
            </div>
            {!ok && (
                <details style={{ marginTop: 6, fontSize: '0.8rem' }}>
                    <summary style={{ cursor: 'pointer', color: '#64748b' }}>Ver detalle de validaciones</summary>
                    <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse' }}>
                        <tbody>
                            {report.checks.map(c => (
                                <tr key={c.id}>
                                    <td style={{ padding: '2px 6px' }}>{c.passed ? '✅' : '❌'}</td>
                                    <td style={{ padding: '2px 6px' }}>{c.label}</td>
                                    <td style={{ padding: '2px 6px', textAlign: 'right', color: c.passed ? 'inherit' : '#b91c1c' }}>
                                        {c.difference !== undefined && c.difference !== 0 ? `Δ ${fmt(c.difference)}` : ''}
                                        {c.detail ? ` ${c.detail}` : ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </details>
            )}
        </div>
    )
}
