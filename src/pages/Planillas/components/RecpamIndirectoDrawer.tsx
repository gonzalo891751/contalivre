/**
 * RecpamIndirectoDrawer — Fase 2C: consume el MOTOR NUEVO de inflación
 * (src/accounting/inflation/engine). Muestra el RECPAM indirecto como
 * partida de conciliación, el método directo de control, la conciliación
 * entre ambos y los bloqueantes (índices faltantes / orígenes desconocidos).
 *
 * El algoritmo legacy (posiciones monetarias de fin de mes) quedó sin
 * consumidores: ACC-010 cerrado en la UI.
 */

import type { InflationResult } from '../../../accounting/inflation/engine';
import { formatCurrencyARS } from '../../../core/cierre-valuacion';

interface RecpamIndirectoDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    result: InflationResult | null;
    loading: boolean;
}

export function RecpamIndirectoDrawer({
    isOpen,
    onClose,
    result,
    loading,
}: RecpamIndirectoDrawerProps) {
    if (!isOpen) return null;

    const reconciled = result?.reconciled ?? false;

    return (
        <>
            <div className="recpam-drawer-backdrop" onClick={onClose} aria-hidden="true" />

            <div className="recpam-drawer-panel">
                <div className="recpam-drawer-header">
                    <div>
                        <h2 className="recpam-drawer-title">RECPAM — Motor RT 54 (TO RT 59)</h2>
                        <p className="recpam-drawer-subtitle">
                            Indirecto por conciliación + control directo por exposición
                        </p>
                    </div>
                    <button className="recpam-drawer-close" onClick={onClose} aria-label="Cerrar">
                        <i className="ph-bold ph-x" />
                    </button>
                </div>

                <div className="recpam-drawer-content">
                    {loading && (
                        <div className="recpam-drawer-loading">
                            <div className="recpam-drawer-spinner" />
                            <p>Calculando…</p>
                        </div>
                    )}

                    {!loading && !result && (
                        <div className="recpam-drawer-empty">
                            <p>No hay datos disponibles para calcular el RECPAM.</p>
                            <p className="text-muted">Cargá asientos e índices del período.</p>
                        </div>
                    )}

                    {!loading && result && (
                        <>
                            {/* Bloqueantes */}
                            {result.blockers.length > 0 && (
                                <div className="recpam-info-callout" style={{ borderColor: '#f59e0b', background: 'rgba(234,179,8,0.08)' }}>
                                    <i className="ph-fill ph-warning recpam-info-icon" />
                                    <div>
                                        <strong>Cálculo bloqueado para contabilizar:</strong>
                                        <ul style={{ margin: '6px 0 0 16px', fontSize: '0.85rem', lineHeight: 1.6 }}>
                                            {result.blockers.map((b, i) => <li key={i}>{b}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Método indirecto (partida de conciliación) */}
                            <section style={{ marginTop: 16 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Método indirecto (partida de conciliación)</h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 8px' }}>
                                    Fórmula: RECPAM (ganancia +) = Σ nᵢ × (coef(origenᵢ→cierre) − 1) sobre las
                                    partidas no monetarias, PN y resultados anticuados. Es la partida que hace
                                    balancear el estado reexpresado; nunca una suma de posiciones monetarias
                                    de fin de mes.
                                </p>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                                    {formatCurrencyARS(result.recpamIndirect.recpam)}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, marginLeft: 8, color: result.recpamIndirect.recpam >= 0 ? '#15803d' : '#b91c1c' }}>
                                        {result.recpamIndirect.recpam >= 0 ? 'Ganancia por exposición' : 'Pérdida por exposición'}
                                    </span>
                                </div>
                                <table style={{ width: '100%', fontSize: '0.78rem', marginTop: 8, borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                            <th style={{ padding: '4px 6px' }}>Origen</th>
                                            <th style={{ padding: '4px 6px' }}>Componente</th>
                                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Ajuste</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.recpamIndirect.detail.slice(0, 50).map((row, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.period}</td>
                                                <td style={{ padding: '4px 6px' }}>{row.description}</td>
                                                <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatCurrencyARS(row.amountAtClose)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>

                            {/* Método directo de control */}
                            <section style={{ marginTop: 20 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Control por método directo</h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 8px' }}>
                                    Fórmula: RECPAM (ganancia +) = −Σ mₚ × (coef(p→cierre) − 1), con mₚ =
                                    variación de la posición monetaria neta originada en cada período
                                    (movimientos cronológicos reales).
                                </p>
                                {result.recpamDirect.warnings.length > 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: '#b45309' }}>
                                        {result.recpamDirect.warnings.join(' ')}
                                    </p>
                                ) : (
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                        {formatCurrencyARS(result.recpamDirect.recpam)}
                                    </div>
                                )}
                                <table style={{ width: '100%', fontSize: '0.78rem', marginTop: 8, borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {result.recpamDirect.detail.map((row, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.period}</td>
                                                <td style={{ padding: '4px 6px' }}>{row.description}</td>
                                                <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatCurrencyARS(row.amountAtClose)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>

                            {/* Conciliación */}
                            <section style={{ marginTop: 20, padding: 12, borderRadius: 8, border: `1px solid ${reconciled ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`, background: reconciled ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)' }}>
                                <strong style={{ fontSize: '0.9rem' }}>
                                    {reconciled ? '✓ Métodos conciliados' : '✗ Métodos NO conciliados'}
                                </strong>
                                <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                                    Indirecto: {formatCurrencyARS(result.recpamIndirect.recpam)} · Directo:{' '}
                                    {result.recpamDirect.warnings.length > 0
                                        ? 'no verificable'
                                        : formatCurrencyARS(result.recpamDirect.recpam)}
                                    {Number.isFinite(result.reconciliationDifference) && (
                                        <> · Diferencia: {formatCurrencyARS(result.reconciliationDifference / 100)}</>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
