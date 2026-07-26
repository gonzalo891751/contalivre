/**
 * Conciliación módulo ↔ Libro Diario para bienes de uso — Fase 2H (§H7).
 *
 * Cierra el circuito Operaciones → ficha → asiento → planilla → anexo: muestra,
 * lado a lado, lo que dicen las fichas del módulo y lo que dice el anexo (que se
 * arma con el Diario). Si difieren, la diferencia se expone con su probable
 * causa. El saldo contable siempre manda: acá no se ajusta nada.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle, Warning } from '@phosphor-icons/react'
import { getAllFixedAssets, getFixedAssetsMetrics } from '../../../storage/fixedAssets'
import { usePeriodYear } from '../../../hooks/usePeriodYear'
import { reconcileFixedAssets } from '../../../reporting/fixedAssetsReconciliation'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function FixedAssetsReconciliationPanel({ bundle }: { bundle: ReportingBundle }) {
    const { year } = usePeriodYear()
    const periodId = String(year)

    const metrics = useLiveQuery(() => getFixedAssetsMetrics(periodId, year), [periodId, year])
    const assets = useLiveQuery(() => getAllFixedAssets(periodId), [periodId])

    if (!metrics || !assets) return null

    const reconciliation = reconcileFixedAssets(
        bundle,
        { totalCost: metrics.totalCost, totalAccumulated: metrics.totalAccumulated, count: metrics.count },
        assets
    )

    if (reconciliation.empty) return null

    return (
        <section
            style={{
                marginTop: 20,
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 16,
                background: 'white',
            }}
            aria-label="Conciliación con el módulo de Bienes de uso"
        >
            <h4 style={{ margin: '0 0 4px', fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                Conciliación con el módulo de Bienes de uso
            </h4>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5, maxWidth: '72ch' }}>
                El anexo se construye con el Libro Diario. El módulo de Bienes de uso guarda la ficha de cada bien y es
                el que genera esos asientos. Si las dos columnas no coinciden hay un bien sin contabilizar o un asiento
                cargado por fuera del módulo.
            </p>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 14px',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: reconciliation.reconciled ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${reconciliation.reconciled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.35)'}`,
                    color: reconciliation.reconciled ? '#047857' : '#b91c1c',
                }}
                role="status"
            >
                {reconciliation.reconciled ? <CheckCircle weight="fill" size={15} aria-hidden /> : <Warning weight="fill" size={15} aria-hidden />}
                {reconciliation.reconciled
                    ? `Concilia: las ${reconciliation.assetCount} ficha(s) del módulo coinciden con el Libro Diario.`
                    : 'No concilia: el módulo y el Libro Diario informan importes distintos.'}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead>
                        <tr>
                            <th scope="col" style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>Concepto</th>
                            <th scope="col" style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>Módulo</th>
                            <th scope="col" style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>Libro Diario</th>
                            <th scope="col" style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reconciliation.rows.map(row => (
                            <tr key={row.label}>
                                <td style={{ padding: '6px 8px', borderTop: '1px solid #f1f5f9', color: '#334155' }}>{row.label}</td>
                                <td style={{ padding: '6px 8px', borderTop: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf.format(row.perModule)}</td>
                                <td style={{ padding: '6px 8px', borderTop: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf.format(row.perLedger)}</td>
                                <td style={{
                                    padding: '6px 8px',
                                    borderTop: '1px solid #f1f5f9',
                                    textAlign: 'right',
                                    fontVariantNumeric: 'tabular-nums',
                                    fontWeight: 700,
                                    color: row.reconciled ? '#059669' : '#dc2626',
                                }}>
                                    {row.reconciled ? '✓ 0,00' : nf.format(row.difference)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {reconciliation.assetsWithoutEntries.length > 0 && (
                <p role="alert" style={{ marginTop: 12, fontSize: '0.78rem', color: '#854d0e', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                    ⚠ {reconciliation.assetsWithoutEntries.length} ficha(s) sin asiento enlazado:{' '}
                    {reconciliation.assetsWithoutEntries.map(a => a.name).join(' · ')}. Contabilizá el alta desde
                    Operaciones → Bienes de uso para que integren el anexo.
                </p>
            )}
        </section>
    )
}
