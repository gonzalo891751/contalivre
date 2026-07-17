/**
 * CapabilitiesPanel — Fase 2D (§4): alcance real de la versión (qué soporta y
 * qué no; lo no soportado no se simula). Extraído de AcercaDe.
 */

import { CAPABILITIES } from '../../../accounting/capabilities'

export function CapabilitiesPanel() {
    return (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Alcance real (capacidades)</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Qué soporta esta versión y qué no. Lo no soportado no se simula.
            </p>
            <table style={{ fontSize: '0.82rem', lineHeight: 1.7, width: '100%' }}>
                <tbody>
                    {CAPABILITIES.map(cap => (
                        <tr key={cap.id}>
                            <td style={{ paddingRight: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                <span style={{
                                    padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700,
                                    background: cap.status === 'SUPPORTED' ? 'rgba(34,197,94,0.12)'
                                        : cap.status === 'PARTIAL' ? 'rgba(234,179,8,0.12)'
                                        : cap.status === 'EDUCATIONAL_ONLY' ? 'rgba(59,130,246,0.12)'
                                        : 'rgba(148,163,184,0.18)',
                                    color: cap.status === 'SUPPORTED' ? '#15803d'
                                        : cap.status === 'PARTIAL' ? '#a16207'
                                        : cap.status === 'EDUCATIONAL_ONLY' ? '#1d4ed8'
                                        : '#64748b',
                                }}>
                                    {cap.status === 'SUPPORTED' ? 'Soportado'
                                        : cap.status === 'PARTIAL' ? 'Parcial'
                                        : cap.status === 'EDUCATIONAL_ONLY' ? 'Solo educativo'
                                        : 'No soportado'}
                                </span>
                            </td>
                            <td style={{ paddingRight: 12, fontWeight: 600, verticalAlign: 'top' }}>{cap.label}</td>
                            <td style={{ color: 'var(--text-muted)', verticalAlign: 'top' }}>{cap.detail}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
