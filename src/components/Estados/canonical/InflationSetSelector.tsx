/**
 * InflationSetSelector — Fase 2F (§13): selección del set de índices para las
 * expresiones en moneda de cierre (EFE, bienes de uso, …).
 *
 * Muestra la identidad del set (nombre, estado, fuente, fecha, hash,
 * cobertura, faltantes) y avisa cuando faltan índices. El MISMO set alimenta
 * todo el juego; sin set válido, "Moneda de cierre" no se habilita.
 */

import { useEffect, useState } from 'react'
import { listIndexSets } from '../../../accounting/inflation/indexRegistry'
import type { InflationIndexSet } from '../../../accounting/inflation/types'
import type { AppliedInflationSet } from '../../../reporting/loadReportingBundle'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
    OFFICIAL: { label: 'Oficial', color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
    MANUAL: { label: 'Manual', color: '#a16207', bg: 'rgba(234,179,8,0.12)' },
    EXAMPLE: { label: 'Ejemplo', color: '#7c3aed', bg: 'rgba(139,92,246,0.12)' },
}

export interface InflationSetSelectorProps {
    selectedId: string | null
    onSelect: (id: string | null) => void
    applied: AppliedInflationSet | null
}

export function InflationSetSelector({ selectedId, onSelect, applied }: InflationSetSelectorProps) {
    const [sets, setSets] = useState<InflationIndexSet[]>([])

    useEffect(() => { listIndexSets().then(setSets) }, [])

    const chip = applied ? STATUS_LABEL[applied.status] ?? STATUS_LABEL.MANUAL : null
    const hasMissing = applied != null && applied.missingPeriods.length > 0

    return (
        <div className="infl-selector" data-testid="inflation-set-selector">
            <label className="infl-label">
                Índices (moneda de cierre)
                <select
                    value={selectedId ?? ''}
                    onChange={e => onSelect(e.target.value || null)}
                    data-testid="inflation-set-select"
                >
                    <option value="">Moneda nominal (sin reexpresión)</option>
                    {sets.map(s => <option key={s.id} value={s.id}>{s.name} · {STATUS_LABEL[s.status]?.label ?? s.status}</option>)}
                </select>
            </label>

            {sets.length === 0 && (
                <span className="infl-hint">No hay sets de índices cargados. Cargalos en Cierre (AxI) para habilitar la moneda de cierre.</span>
            )}

            {applied && chip && (
                <div className="infl-meta">
                    <span className="infl-badge" style={{ color: chip.color, background: chip.bg }}>{chip.label}</span>
                    <span title="Fuente">{applied.source}</span>
                    <span title="Importado">· {applied.importedAt.slice(0, 10)}</span>
                    <span title="Cobertura">· {applied.coverageFrom} → {applied.coverageTo}</span>
                    <span title="Hash de integridad" className="infl-hash">· #{applied.contentHash.slice(0, 8)}</span>
                    {hasMissing && (
                        <span className="infl-missing" role="alert">
                            ⚠ Faltan índices: {applied.missingPeriods.join(', ')} — la reexpresión se bloquea para esos períodos
                        </span>
                    )}
                </div>
            )}
            <style>{styles}</style>
        </div>
    )
}

const styles = `
.infl-selector { display: flex; flex-direction: column; gap: 4px; }
.infl-label { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: #475569; }
.infl-label select { padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 0.8rem; max-width: 260px; }
.infl-hint { font-size: 0.72rem; color: #a16207; }
.infl-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.72rem; color: #64748b; }
.infl-badge { font-size: 0.66rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; }
.infl-hash { font-variant-numeric: tabular-nums; }
.infl-missing { color: #b91c1c; font-weight: 600; width: 100%; }
`
