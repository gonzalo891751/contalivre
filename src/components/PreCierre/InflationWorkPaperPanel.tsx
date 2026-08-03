import { useMemo, useState } from 'react'
import { Calculator, Funnel, ShieldCheck, Table } from '@phosphor-icons/react'
import type { ReportingBundle } from '../../reporting/loadReportingBundle'
import { Callout, Chip, MetricCard, SectionCard } from '../Consolidacion/ui'
import { RecpamPanel } from './RecpamPanel'

const money = (value: number) => new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(value)

type Filter = 'TODAS' | 'BLOQUEADAS' | 'MONETARIAS' | 'NO_MONETARIAS' | 'VALOR_CIERRE'

export function InflationWorkPaperPanel({ bundle }: { bundle: ReportingBundle }) {
    const work = bundle.inflationWorkPaper
    const [filter, setFilter] = useState<Filter>('TODAS')
    const [query, setQuery] = useState('')
    const [groupByRubro, setGroupByRubro] = useState(false)

    const rows = useMemo(() => work.rows.filter(row => {
        if (query && !`${row.code} ${row.name} ${row.rubro}`.toLowerCase().includes(query.toLowerCase())) return false
        if (filter === 'BLOQUEADAS') return row.status === 'BLOQUEADO'
        if (filter === 'MONETARIAS') return row.classification === 'MONETARY'
        if (filter === 'NO_MONETARIAS') return row.classification === 'NON_MONETARY'
        if (filter === 'VALOR_CIERRE') return row.doubleAdjustmentPrevented
        return true
    }).sort((a, b) => groupByRubro
        ? a.rubro.localeCompare(b.rubro) || a.code.localeCompare(b.code)
        : a.code.localeCompare(b.code)), [work.rows, filter, query, groupByRubro])

    return (
        <div className="preclose-stage-stack" data-testid="inflation-workpaper">
            <div className="preclose-metrics preclose-metrics-four">
                <MetricCard label="Aplicabilidad" value={statusLabel(work.applicabilityStatus)} compact
                    tone={work.applicabilityStatus === 'APLICABLE' ? 'accent' : work.applicabilityStatus === 'PENDIENTE' ? 'warn' : 'neutral'} />
                <MetricCard label="Períodos cubiertos" value={`${work.coefficients.length - work.missingPeriods.length} / ${work.coefficients.length}`}
                    detail={`${work.openingPeriod} → ${work.closingPeriod}`} tone={work.missingPeriods.length ? 'blocked' : 'ok'} />
                <MetricCard label="Cuentas analizadas" value={String(work.rows.length)}
                    detail={`${work.rows.filter(row => row.status === 'BLOQUEADO').length} bloqueadas`} />
                <MetricCard label="RECPAM" value={work.recpam ? money(work.recpam.analytic.amount) : 'Pendiente'}
                    detail={work.recpam?.reconciled ? 'Conciliado por dos vías' : 'Sin conciliación concluida'}
                    tone={work.recpam?.reconciled ? 'ok' : 'warn'} />
            </div>

            <Callout icon={ShieldCheck}>
                <strong>Guardia contra doble ajuste.</strong> Una partida medida a valor corriente a la fecha de cierre
                conserva coeficiente 1. La medición cambia el valor; la reexpresión cambia la unidad de medida.
            </Callout>

            <SectionCard icon={Calculator} title="Serie y coeficientes"
                description="Índice de cierre ÷ índice de origen, sin interpolaciones silenciosas.">
                <div className="preclose-coeff-grid">
                    {work.coefficients.map(row => (
                        <div className={`preclose-coeff ${row.status === 'FALTA_INDICE' ? 'is-blocked' : ''}`} key={row.period}>
                            <div><strong>{row.period}</strong><Chip tone={row.status === 'OK' ? 'ok' : 'block'}>{row.status === 'OK' ? 'Completo' : 'Falta índice'}</Chip></div>
                            <span>{row.formula}</span>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard icon={Table} title="Papel de trabajo por cuenta"
                description="Base, origen, coeficiente, medición posterior, resultado y evidencia." flush
                actions={<span className="preclose-row-count">{rows.length} fila(s)</span>}>
                <div className="preclose-table-toolbar">
                    <div className="preclose-filter-group" aria-label="Filtros del papel de trabajo">
                        {([
                            ['TODAS', 'Todas'], ['BLOQUEADAS', 'Atención'], ['MONETARIAS', 'Monetarias'],
                            ['NO_MONETARIAS', 'No monetarias'], ['VALOR_CIERRE', 'Valor de cierre'],
                        ] as Array<[Filter, string]>).map(([value, label]) => (
                            <button key={value} type="button" className={filter === value ? 'is-active' : ''}
                                onClick={() => setFilter(value)}>{label}</button>
                        ))}
                    </div>
                    <label className="preclose-search"><Funnel size={15} /><span className="sr-only">Buscar cuenta</span>
                        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cuenta o rubro…" />
                    </label>
                    <label className="preclose-check-inline">
                        <input type="checkbox" checked={groupByRubro} onChange={event => setGroupByRubro(event.target.checked)} />
                        Agrupar por rubro
                    </label>
                </div>
                <div className="preclose-table-wrap">
                    <table className="preclose-table" data-testid="inflation-workpaper-table">
                        <thead><tr>
                            <th>Cuenta</th><th>Clasificación</th><th>Base / origen</th><th>Fórmula</th>
                            <th className="num">Ajuste AxI</th><th className="num">Medición cierre</th>
                            <th className="num">Importe final</th><th>Resultado</th><th>Estado</th>
                        </tr></thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.accountId}>
                                    <td><strong>{row.code}</strong><span>{row.name}</span><small>{row.rubro}</small></td>
                                    <td>{row.classification}<small>{row.treatment}</small></td>
                                    <td className="num">{money(row.baseAmount)}<small>{row.origins.map(origin => origin.period).join(' · ') || 'Sin origen'}</small></td>
                                    <td className="formula">{row.origins[0]?.formula ?? 'No corresponde'}</td>
                                    <td className="num">{money(row.inflationAdjustment)}</td>
                                    <td className="num">{row.closingMeasurement === undefined ? '—' : money(row.closingMeasurement)}</td>
                                    <td className="num strong">{money(row.finalAmount)}</td>
                                    <td>{resultLabel(row.resultKind)}</td>
                                    <td><Chip tone={row.status === 'OK' ? 'ok' : row.status === 'BLOQUEADO' ? 'block' : 'warn'}>{row.status}</Chip>
                                        {row.doubleAdjustmentPrevented && <small>Coeficiente 1 verificado</small>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {bundle.recpam && (
                <SectionCard icon={Calculator} title="Conciliación del RECPAM"
                    description="Determinación secuencial y control analítico por exposición monetaria.">
                    <RecpamPanel recpam={bundle.recpam} />
                </SectionCard>
            )}
        </div>
    )
}

function statusLabel(status: ReportingBundle['inflationWorkPaper']['applicabilityStatus']): string {
    if (status === 'APLICABLE') return 'Ajuste aplicable'
    if (status === 'NO_APLICABLE') return 'No aplicable documentado'
    return 'Decisión pendiente'
}

function resultLabel(kind: ReportingBundle['inflationWorkPaper']['rows'][number]['resultKind']): string {
    return ({
        RECPAM: 'Exposición monetaria',
        RESULTADO_TENENCIA: 'Resultado por tenencia',
        DETERIORO: 'Deterioro',
        SIN_RESULTADO_DIRECTO: 'Sin resultado directo',
        REQUIERE_DECISION: 'Requiere decisión',
    })[kind]
}
