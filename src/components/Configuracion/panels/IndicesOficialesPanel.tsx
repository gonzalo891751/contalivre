/**
 * IndicesOficialesPanel — registro canónico de índices para la moneda de cierre.
 *
 * La planilla de Cierre (AxI) guarda su propia tabla de trabajo, que NO es el
 * registro que consume el motor de estados contables. Este panel es el único
 * lugar donde una serie entra al registro versionado (`inflationIndexSets`)
 * con proveniencia completa: nombre, estado, fuente, URL y hash de integridad.
 * Sin un set registrado acá, "Moneda de cierre" no puede habilitarse.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { listIndexSets, saveIndexSet } from '../../../accounting/inflation/indexRegistry'
import { missingMonths, parseIndexSeries } from '../../../accounting/inflation/parseIndexSeries'
import type { IndexSetStatus, InflationIndexSet } from '../../../accounting/inflation/types'

const STATUS_LABEL: Record<IndexSetStatus, string> = {
    OFFICIAL: 'Oficial',
    MANUAL: 'Manual',
    EXAMPLE: 'Ejemplo',
}

const PLACEHOLDER = `periodo,valor
2024-12,7694.0075
2025-01,7864.1257
2025-12,10121.3715`

export function IndicesOficialesPanel() {
    const [sets, setSets] = useState<InflationIndexSet[]>([])
    const [name, setName] = useState('')
    const [status, setStatus] = useState<IndexSetStatus>('OFFICIAL')
    const [source, setSource] = useState('')
    const [sourceUrl, setSourceUrl] = useState('')
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
    const fileRef = useRef<HTMLInputElement | null>(null)

    const reload = async () => setSets(await listIndexSets())
    useEffect(() => { void reload() }, [])

    const parsed = useMemo(() => parseIndexSeries(text), [text])
    const gaps = useMemo(() => missingMonths(parsed.values), [parsed.values])
    const canSave = name.trim() !== '' && source.trim() !== '' && parsed.values.length > 0 && !busy

    const handleFile = async (file: File | null) => {
        if (!file) return
        setText(await file.text())
        if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''))
    }

    const handleSave = async () => {
        setBusy(true); setMessage(null)
        try {
            const set = await saveIndexSet({
                name: name.trim(),
                status,
                source: source.trim(),
                sourceUrl: sourceUrl.trim() || undefined,
                values: parsed.values,
            })
            await reload()
            setText(''); setName(''); setSource(''); setSourceUrl('')
            setMessage({
                kind: 'ok',
                text: `Se registró "${set.name}" con ${set.values.length} períodos (${set.values[0].period} → ${set.values[set.values.length - 1].period}). Ya podés elegirlo en Estados contables → Índices.`,
            })
        } catch (e) {
            setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div data-testid="indices-oficiales-panel">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Los estados contables en moneda de cierre usan un <strong>set de índices registrado</strong>,
                con su fuente y su hash de integridad. La tabla de la planilla de Cierre (AxI) es un papel de
                trabajo y no alcanza: la serie tiene que registrarse acá para que el motor pueda usarla.
            </p>

            <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                            <th style={{ padding: 8 }}>Set</th>
                            <th style={{ padding: 8 }}>Estado</th>
                            <th style={{ padding: 8 }}>Fuente</th>
                            <th style={{ padding: 8 }}>Cobertura</th>
                            <th style={{ padding: 8 }}>Importado</th>
                            <th style={{ padding: 8 }}>Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sets.map(s => (
                            <tr key={s.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8, fontWeight: 600 }}>{s.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>v{s.version}</span></td>
                                <td style={{ padding: 8 }}>{STATUS_LABEL[s.status] ?? s.status}</td>
                                <td style={{ padding: 8, color: '#64748b' }}>
                                    {s.sourceUrl
                                        ? <a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.source}</a>
                                        : s.source}
                                </td>
                                <td style={{ padding: 8, color: '#64748b' }}>
                                    {s.values.length > 0 ? `${s.values[0].period} → ${s.values[s.values.length - 1].period} (${s.values.length})` : '—'}
                                </td>
                                <td style={{ padding: 8, color: '#64748b' }}>{s.importedAt.slice(0, 10)}</td>
                                <td style={{ padding: 8, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>#{s.contentHash.slice(5, 13)}</td>
                            </tr>
                        ))}
                        {sets.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>
                                Todavía no hay ningún set registrado: los estados sólo pueden emitirse en moneda nominal.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>Registrar una serie</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
                <label style={labelStyle}>
                    Nombre del set
                    <input value={name} onChange={e => setName(e.target.value)} style={inputStyle}
                        placeholder="IPC Nacional Nivel General 2025" data-testid="indices-name" />
                </label>
                <label style={labelStyle}>
                    Estado
                    <select value={status} onChange={e => setStatus(e.target.value as IndexSetStatus)} style={inputStyle} data-testid="indices-status">
                        <option value="OFFICIAL">Oficial (serie publicada)</option>
                        <option value="MANUAL">Manual (carga propia)</option>
                        <option value="EXAMPLE">Ejemplo (didáctico)</option>
                    </select>
                </label>
                <label style={labelStyle}>
                    Fuente
                    <input value={source} onChange={e => setSource(e.target.value)} style={inputStyle}
                        placeholder="INDEC — IPC Nacional, base dic-2016=100" data-testid="indices-source" />
                </label>
                <label style={labelStyle}>
                    URL de la fuente (opcional)
                    <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} style={inputStyle}
                        placeholder="https://…" data-testid="indices-source-url" />
                </label>
            </div>

            <label style={{ ...labelStyle, marginBottom: 8 }}>
                Serie (una línea por mes: período y valor)
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    placeholder={PLACEHOLDER}
                    data-testid="indices-series"
                    style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', resize: 'vertical' }}
                />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    style={{ display: 'none' }}
                    onChange={e => void handleFile(e.target.files?.[0] ?? null)}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                    Cargar desde archivo CSV
                </button>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {parsed.values.length > 0
                        ? `${parsed.values.length} períodos leídos: ${parsed.values[0].period} → ${parsed.values[parsed.values.length - 1].period}`
                        : 'Todavía no se leyó ningún período.'}
                </span>
            </div>

            {gaps.length > 0 && (
                <div className="card" role="alert" style={{ padding: 10, marginBottom: 10, borderLeft: '4px solid #f59e0b', fontSize: '0.8rem', color: '#a16207' }}>
                    La serie tiene meses faltantes: {gaps.join(', ')}. La reexpresión se bloquea en esos períodos;
                    completalos con la fuente oficial (nunca por interpolación).
                </div>
            )}

            {parsed.rejected.length > 0 && (
                <div className="card" role="alert" style={{ padding: 10, marginBottom: 10, borderLeft: '4px solid #ef4444', fontSize: '0.8rem', color: '#b91c1c' }}>
                    <strong>{parsed.rejected.length} fila(s) no se pudieron leer:</strong>
                    <ul style={{ margin: '6px 0 0 18px' }}>
                        {parsed.rejected.slice(0, 5).map(r => <li key={r.line}>Fila {r.line}: {r.reason}</li>)}
                    </ul>
                </div>
            )}

            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!canSave} data-testid="indices-save">
                {busy ? 'Registrando…' : 'Registrar set de índices'}
            </button>

            {message && (
                <div className="card" role="status" style={{
                    padding: 12, marginTop: 12, fontSize: '0.83rem',
                    borderLeft: `4px solid ${message.kind === 'ok' ? '#22c55e' : '#ef4444'}`,
                }}>
                    {message.text}
                </div>
            )}
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: '0.78rem', fontWeight: 600, color: '#475569',
}
const inputStyle: React.CSSProperties = {
    padding: '7px 9px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
    fontSize: '0.83rem', fontWeight: 400, color: '#0f172a', width: '100%',
}
