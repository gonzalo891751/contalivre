/**
 * Estado de Flujo de Efectivo — pestaña de Estados (Fase 2B).
 *
 * Consume el StatementsBundle del motor único de reporting: la pantalla,
 * el PDF y el XLSX parten del mismo objeto. Muestra método directo e
 * indirecto, transacciones no monetarias y el reporte de validación con
 * los invariantes del EFE.
 */

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import { db } from '../../storage/db'
import { loadStatementsForYear } from '../../reporting/loadStatements'
import type { CashFlowStatement2B, ReportLine, StatementsBundle } from '../../reporting/domain/types'

const fmt = (n: number) =>
    n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Line({ line, bold = false, indent = 0 }: { line: ReportLine; bold?: boolean; indent?: number }) {
    return (
        <>
            <tr style={{ fontWeight: bold ? 700 : 400 }}>
                <td style={{ padding: '4px 8px', paddingLeft: 8 + indent * 20 }}>{line.label}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(line.amount)}
                </td>
            </tr>
            {(line.children ?? []).map(c => (
                <Line key={c.id} line={c} indent={indent + 1} />
            ))}
        </>
    )
}

function MethodTable({ cf, title }: { cf: CashFlowStatement2B; title: string }) {
    return (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>{title}</h3>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <tbody>
                    <Line line={cf.openingCash} bold />
                    <Line line={cf.operating} bold />
                    <Line line={cf.investing} bold />
                    <Line line={cf.financing} bold />
                    {cf.unclassified.amount !== 0 && <Line line={cf.unclassified} bold />}
                    <Line line={cf.netChange} bold />
                    <Line line={cf.closingCash} bold />
                </tbody>
            </table>
        </div>
    )
}

export default function FlujoEfectivoTab() {
    const { year } = usePeriodYear()
    const [bundle, setBundle] = useState<StatementsBundle | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Recalcular cuando cambian los asientos (reactivo)
    const entriesCount = useLiveQuery(() => db.entries.count(), [], 0)

    useEffect(() => {
        let cancelled = false
        setError(null)
        loadStatementsForYear(year)
            .then(b => { if (!cancelled) setBundle(b) })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
        return () => { cancelled = true }
    }, [year, entriesCount])

    if (error) {
        return <div className="card" style={{ padding: 16 }}>Error al calcular el EFE: {error}</div>
    }
    if (!bundle || !bundle.cashFlowDirect || !bundle.cashFlowIndirect) {
        return <div className="card" style={{ padding: 16 }}>Calculando Estado de Flujo de Efectivo…</div>
    }

    const efeChecks = bundle.validation.checks.filter(c => c.id.startsWith('efe'))
    const failed = efeChecks.filter(c => !c.passed)

    return (
        <div>
            <div
                role="status"
                style={{
                    marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                    background: failed.length === 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)',
                    border: failed.length === 0 ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
                    color: failed.length === 0 ? '#15803d' : '#b91c1c',
                }}
            >
                {failed.length === 0
                    ? '✓ Invariantes del EFE verificados: variación = final − inicial; efectivo EFE = efectivo ESP; método directo = método indirecto.'
                    : `⚠ Estado NO validado: ${failed.map(f => f.label).join(' · ')}`}
            </div>

            <MethodTable cf={bundle.cashFlowDirect} title="Método directo" />
            <MethodTable cf={bundle.cashFlowIndirect} title="Método indirecto (conciliación desde el resultado)" />

            {bundle.cashFlowDirect.nonMonetaryDisclosures.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>
                        Transacciones sin efecto en el efectivo (se revelan, no integran flujos)
                    </h3>
                    <ul style={{ fontSize: '0.85rem', paddingLeft: 18, lineHeight: 1.8 }}>
                        {bundle.cashFlowDirect.nonMonetaryDisclosures.map(d => (
                            <li key={d.id}>{d.label} — ${fmt(d.amount)}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="card" style={{ padding: 16 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>Validación automática</h3>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <tbody>
                        {bundle.validation.checks.map(c => (
                            <tr key={c.id}>
                                <td style={{ padding: '3px 8px', width: 24 }}>{c.passed ? '✅' : '❌'}</td>
                                <td style={{ padding: '3px 8px' }}>{c.label}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: c.passed ? 'inherit' : '#b91c1c' }}>
                                    {c.difference !== undefined && c.difference !== 0 ? `Δ ${fmt(c.difference)}` : ''}
                                    {c.detail ? ` ${c.detail}` : ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    {bundle.validation.canPublish
                        ? 'Estados publicables: todos los invariantes se cumplen.'
                        : 'Los estados no pueden marcarse como validados mientras falle un invariante.'}
                </p>
            </div>
        </div>
    )
}
