/**
 * LineageModal — Fase 2C (§13): drilldown didáctico visible.
 *
 * Desde un renglón de un estado (o un indicador) abre: cuentas → saldo →
 * movimientos del Mayor → asientos → operación de origen. Usa exclusivamente
 * el objeto de linaje del motor (getLineLineage); no recalcula nada.
 */

import { useEffect, useState } from 'react'
import { getLineLineage, type LineLineage } from '../../../reporting/lineage'
import type { StatementsBundle } from '../../../reporting/domain/types'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface LineageModalProps {
    bundle: StatementsBundle
    lineId: string
    label: string
    accountIds: string[]
    onClose: () => void
}

export default function LineageModal({ bundle, lineId, label, accountIds, onClose }: LineageModalProps) {
    const [lineage, setLineage] = useState<LineLineage | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        getLineLineage(bundle, lineId, accountIds)
            .then(l => { if (!cancelled) setLineage(l) })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
        return () => { cancelled = true }
    }, [bundle, lineId, accountIds])

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={onClose}
        >
            <div
                style={{ background: 'white', borderRadius: 14, maxWidth: 900, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Trazabilidad del importe</div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0' }}>{label}</h3>
                    </div>
                    <button className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Cerrar">✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && <p style={{ color: '#b91c1c' }}>Error: {error}</p>}
                    {!lineage && !error && <p>Cargando linaje…</p>}
                    {lineage && (
                        <>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
                                Cuentas que forman el importe → movimientos del Mayor → asientos → operación de origen.
                                {' '}Total Debe ${fmt(lineage.totalDebit)} · Total Haber ${fmt(lineage.totalCredit)}.
                            </p>
                            {lineage.movements.length === 0 ? (
                                <p style={{ color: '#64748b' }}>Sin movimientos en el ejercicio para estas cuentas.</p>
                            ) : (
                                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '6px 8px' }}>Asiento</th>
                                            <th style={{ padding: '6px 8px' }}>Fecha</th>
                                            <th style={{ padding: '6px 8px' }}>Cuenta</th>
                                            <th style={{ padding: '6px 8px' }}>Concepto / Operación</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Debe</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineage.movements.map((m, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>
                                                    {m.entryNumber ? `N° ${m.entryNumber}` : '—'}
                                                    {m.status === 'REVERSED' && <span style={{ color: '#64748b' }}> (rev.)</span>}
                                                </td>
                                                <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{m.date}</td>
                                                <td style={{ padding: '5px 8px' }}>{m.accountLabel}</td>
                                                <td style={{ padding: '5px 8px' }}>
                                                    {m.memo}
                                                    {m.sourceModule && (
                                                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}> · {m.sourceModule}/{m.sourceType}</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.debit ? fmt(m.debit) : '—'}</td>
                                                <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.credit ? fmt(m.credit) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
