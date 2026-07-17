/**
 * ReportLineTable — Fase 2C: render genérico de un árbol de ReportLine del
 * motor canónico. Soporta comparativo y drilldown (clic en el renglón).
 * No recalcula nada: recibe importes ya calculados por el motor.
 */

import type { ReportLine } from '../../../reporting/domain/types'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface ReportLineRowProps {
    line: ReportLine
    showComparative: boolean
    onLineClick?: (line: ReportLine) => void
    depth?: number
}

function Row({ line, showComparative, onLineClick, depth = 0 }: ReportLineRowProps) {
    const isTotal = line.level === 0
    const clickable = !!onLineClick && line.accountIds.length > 0
    return (
        <>
            <tr
                style={{
                    fontWeight: isTotal ? 700 : line.level === 1 ? 600 : 400,
                    borderTop: isTotal ? '2px solid #cbd5e1' : undefined,
                    cursor: clickable ? 'pointer' : 'default',
                }}
                onClick={clickable ? () => onLineClick!(line) : undefined}
                title={clickable ? 'Ver trazabilidad hasta los asientos' : undefined}
            >
                <td style={{ padding: '5px 8px', paddingLeft: 8 + depth * 18 }}>
                    {line.label}
                    {clickable && <span style={{ marginLeft: 6, color: '#94a3b8', fontSize: '0.7rem' }}>↳</span>}
                    {line.noteRef && <sup style={{ color: '#2563eb', marginLeft: 4 }}>Nota {line.noteRef}</sup>}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.amount)}</td>
                {showComparative && (
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                        {line.comparativeAmount == null ? '—' : fmt(line.comparativeAmount)}
                    </td>
                )}
            </tr>
            {(line.children ?? []).map(c => (
                <Row key={c.id} line={c} showComparative={showComparative} onLineClick={onLineClick} depth={depth + 1} />
            ))}
        </>
    )
}

interface ReportLineTableProps {
    title?: string
    lines: ReportLine[]
    showComparative?: boolean
    comparativeLabel?: string
    currentLabel?: string
    onLineClick?: (line: ReportLine) => void
}

export default function ReportLineTable({
    title,
    lines,
    showComparative = false,
    comparativeLabel = 'Ejercicio anterior',
    currentLabel = 'Ejercicio actual',
    onLineClick,
}: ReportLineTableProps) {
    return (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            {title && <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>{title}</h3>}
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'right', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left' }}></th>
                        <th style={{ padding: '4px 8px' }}>{currentLabel}</th>
                        {showComparative && <th style={{ padding: '4px 8px' }}>{comparativeLabel}</th>}
                    </tr>
                </thead>
                <tbody>
                    {lines.map(l => (
                        <Row key={l.id} line={l} showComparative={showComparative} onLineClick={onLineClick} />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
