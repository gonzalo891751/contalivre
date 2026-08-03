/**
 * Consolidación del grupo económico (Fase 2K §4, §17).
 *
 * UBICACIÓN EN EL CICLO. La consolidación NO es una etapa más del pre-cierre de
 * una empresa: el pre-cierre y el cierre siguen siendo procesos individuales de
 * cada entidad jurídica. Este módulo vive DESPUÉS del cierre individual y se
 * apoya en los estados ya emitidos por cada entidad, por eso tiene página
 * propia junto a "Estados contables" y no dentro de ella.
 *
 * Toda la aritmética vive en src/consolidation. Esta pantalla presenta.
 */

import { useState } from 'react'
import {
    ArrowsLeftRight, Buildings, CheckCircle, Info, Path, Prohibit,
    Question, Table, TreeStructure, WarningCircle,
} from '@phosphor-icons/react'
import HojaDeTrabajo from '../components/Consolidacion/HojaDeTrabajo'
import EstadosConsolidados from '../components/Consolidacion/EstadosConsolidados'
import { HELP_TOPICS } from '../components/Consolidacion/pedagogia'
import { useConsolidacion } from '../components/Consolidacion/useConsolidacion'
import type { ReadinessCheck, ReadinessState } from '../consolidation/domain/types'

const money = (n: number) =>
    n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const READINESS_LABEL: Record<ReadinessState, string> = {
    COMPLETE: 'Completo',
    NEEDS_REVIEW: 'Requiere revisión',
    BLOCKED: 'Bloqueado',
    NOT_APPLICABLE: 'No aplica',
}

const READINESS_ICON: Record<ReadinessState, typeof CheckCircle> = {
    COMPLETE: CheckCircle,
    NEEDS_REVIEW: WarningCircle,
    BLOCKED: Prohibit,
    NOT_APPLICABLE: Info,
}

type TabId = 'resumen' | 'perimetro' | 'preparacion' | 'hoja' | 'pnc' | 'estados'

export default function ConsolidacionPage() {
    const state = useConsolidacion()
    const [tab, setTab] = useState<TabId>('resumen')
    const [openHelp, setOpenHelp] = useState<string | null>(null)

    const { group, consolidation, result, perimeter, loading, error } = state

    if (loading && !result) {
        return (
            <div className="cons-page">
                <PageHeader />
                <div className="card"><p>Calculando la consolidación…</p></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="cons-page">
                <PageHeader />
                <div className="alert alert-error" role="alert">
                    <strong>No se pudo calcular la consolidación.</strong>
                    <p>{error}</p>
                </div>
            </div>
        )
    }

    if (state.groups.length === 0) {
        return (
            <div className="cons-page">
                <PageHeader />
                <div className="card cons-empty">
                    <TreeStructure size={48} weight="duotone" aria-hidden="true" />
                    <h2>Todavía no hay ningún grupo económico</h2>
                    <p>
                        Un grupo económico reúne a una entidad controladora con sus controladas para presentarlas como
                        una sola entidad. Cada entidad conserva sus libros: la consolidación es un papel de trabajo del
                        grupo y no modifica ningún asiento.
                    </p>
                    <SeedDemoButton onSeeded={() => void state.reload()} />
                    <HelpBlock topic="queEsConsolidar" open onToggle={() => { }} />
                </div>
            </div>
        )
    }

    return (
        <div className="cons-page">
            <PageHeader />

            <div className="cons-selectors">
                <label className="cons-field">
                    <span>Grupo económico</span>
                    <select value={group?.id ?? ''} onChange={e => state.selectGroup(e.target.value)}>
                        {state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                </label>
                <label className="cons-field">
                    <span>Ejercicio de consolidación</span>
                    <select
                        value={consolidation?.id ?? ''}
                        onChange={e => state.selectConsolidation(e.target.value)}
                    >
                        {state.consolidations.map(c => (
                            <option key={c.id} value={c.id}>{c.label} — cierre {c.reportingDate}</option>
                        ))}
                    </select>
                </label>
            </div>

            <nav className="cons-tabs cons-tabs-main" role="tablist" aria-label="Secciones de la consolidación">
                {([
                    ['resumen', 'Resumen del grupo', Buildings],
                    ['perimetro', 'Perímetro', TreeStructure],
                    ['preparacion', 'Preparación', CheckCircle],
                    ['hoja', 'Papel de trabajo', Table],
                    ['pnc', 'Participación no controladora', ArrowsLeftRight],
                    ['estados', 'Estados consolidados', Path],
                ] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        className={`cons-tab ${tab === id ? 'cons-tab-active' : ''}`}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={16} weight="bold" aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </nav>

            {!result ? (
                <div className="card"><p>Seleccioná un ejercicio de consolidación.</p></div>
            ) : (
                <>
                    {tab === 'resumen' && (
                        <ResumenTab state={state} openHelp={openHelp} setOpenHelp={setOpenHelp} />
                    )}
                    {tab === 'perimetro' && (
                        <PerimetroTab perimeter={perimeter} openHelp={openHelp} setOpenHelp={setOpenHelp} />
                    )}
                    {tab === 'preparacion' && (
                        <PreparacionTab checks={result.readiness.checks} progress={result.readiness.progress} />
                    )}
                    {tab === 'hoja' && <HojaDeTrabajo worksheet={result.worksheet} />}
                    {tab === 'pnc' && (
                        <PncTab result={result} openHelp={openHelp} setOpenHelp={setOpenHelp} />
                    )}
                    {tab === 'estados' && (
                        <EstadosConsolidados statements={result.statements} worksheet={result.worksheet} />
                    )}
                </>
            )}
        </div>
    )
}

function PageHeader() {
    return (
        <header className="page-header">
            <h1 className="page-title">Consolidación del grupo</h1>
            <p className="page-subtitle">
                Presenta a la controladora y sus controladas como una única entidad económica. Los ajustes de
                consolidación son extracontables: no tocan los libros de ninguna entidad.
            </p>
        </header>
    )
}

/**
 * Siembra el caso demostrativo "Grupo Litoral". Crea entidades y asientos
 * PROPIOS, en su propio espacio de códigos de cuenta: no toca la empresa por
 * defecto ni ningún dataset existente.
 */
function SeedDemoButton({ onSeeded }: { onSeeded: () => void }) {
    const [seeding, setSeeding] = useState(false)
    const [failed, setFailed] = useState<string | null>(null)
    return (
        <div className="cons-seed">
            <button
                type="button" className="btn btn-primary" disabled={seeding}
                onClick={async () => {
                    setSeeding(true); setFailed(null)
                    try {
                        const { seedGrupoLitoral } = await import('../consolidation/fixtures/grupoLitoral')
                        await seedGrupoLitoral()
                        onSeeded()
                    } catch (e) {
                        setFailed(e instanceof Error ? e.message : String(e))
                    } finally {
                        setSeeding(false)
                    }
                }}
            >
                {seeding ? 'Creando el caso…' : 'Cargar el caso demostrativo «Grupo Litoral»'}
            </button>
            <p className="cons-muted">
                Crea dos entidades nuevas con sus propios libros (ejercicios 2024 y 2025), una controlada al 80 %,
                un préstamo con intereses, un saldo comercial recíproco, una venta intragrupo con mercadería
                parcialmente en stock y dividendos. No modifica ninguna empresa ni ningún asiento existente.
            </p>
            {failed && <div className="alert alert-error" role="alert">{failed}</div>}
        </div>
    )
}

function HelpBlock({
    topic, open, onToggle,
}: { topic: keyof typeof HELP_TOPICS; open: boolean; onToggle: () => void }) {
    const help = HELP_TOPICS[topic]
    return (
        <div className="cons-help">
            <button type="button" className="cons-help-toggle" onClick={onToggle} aria-expanded={open}>
                <Question size={15} weight="bold" aria-hidden="true" />
                {help.question}
            </button>
            {open && (
                <div className="cons-help-body">
                    {help.answer.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                    {help.normative && <p className="cons-normative">{help.normative}</p>}
                </div>
            )}
        </div>
    )
}

function ResumenTab({
    state, openHelp, setOpenHelp,
}: {
    state: ReturnType<typeof useConsolidacion>
    openHelp: string | null
    setOpenHelp: (v: string | null) => void
}) {
    const { group, consolidation, result, perimeter } = state
    if (!result || !group || !consolidation) return null

    const included = perimeter.filter(p => p.included)
    const excluded = perimeter.filter(p => !p.included)
    const unreconciled = result.input.reciprocals.filter(r => r.status !== 'RECONCILED').length
    const draftAdjustments = result.input.adjustments.filter(a => a.status === 'DRAFT').length
    const bs = result.statements.balanceSheet

    return (
        <div className="cons-resumen">
            <div className="cons-kpi-grid">
                <Kpi label="Grupo" value={group.name} detail={`Controladora: ${result.statements.parentCompanyName}`} />
                <Kpi
                    label="Ejercicio"
                    value={consolidation.label}
                    detail={`Cierre ${consolidation.reportingDate} · ${group.presentationCurrency} · ${group.measurementUnit}`}
                />
                <Kpi
                    label="Entidades consolidadas"
                    value={String(included.length)}
                    detail={excluded.length > 0 ? `${excluded.length} fuera del perímetro` : 'Ninguna entidad excluida'}
                />
                <Kpi
                    label="Avance de la preparación"
                    value={`${result.readiness.progress} %`}
                    detail={result.readiness.canConsolidate ? 'Sin bloqueos' : 'Con bloqueos pendientes'}
                    tone={result.readiness.canConsolidate ? 'ok' : 'blocked'}
                />
                <Kpi
                    label="Diferencias sin conciliar"
                    value={String(unreconciled)}
                    detail={unreconciled === 0 ? 'Todas las partidas recíprocas conciliadas' : 'Revisá la conciliación intragrupo'}
                    tone={unreconciled === 0 ? 'ok' : 'warn'}
                />
                <Kpi
                    label="Eliminaciones aplicadas"
                    value={String(result.worksheet.eliminations.length)}
                    detail={draftAdjustments > 0 ? `${draftAdjustments} ajuste(s) en borrador sin aplicar` : 'Todas balanceadas'}
                    tone={draftAdjustments === 0 ? 'ok' : 'warn'}
                />
            </div>

            <div className="cons-two-col">
                <section className="card">
                    <h3>Estructura del grupo</h3>
                    <div className="cons-tree">
                        <div className="cons-tree-parent">
                            <Buildings size={20} weight="duotone" aria-hidden="true" />
                            <div>
                                <strong>{result.statements.parentCompanyName}</strong>
                                <span>Controladora</span>
                            </div>
                        </div>
                        <ul className="cons-tree-children">
                            {perimeter.filter(p => p.member.relation !== 'PARENT').map(p => (
                                <li key={p.member.id} className={p.included ? '' : 'cons-tree-excluded'}>
                                    <div className="cons-tree-node">
                                        <span className="cons-tree-connector" aria-hidden="true" />
                                        <div>
                                            <strong>{p.companyName}</strong>
                                            <span>
                                                {(p.member.directOwnership * 100).toFixed(2)} % ·{' '}
                                                {p.member.heldThroughMemberId ? 'participación indirecta' : 'participación directa'}
                                                {p.included
                                                    ? ` · PNC ${((1 - p.member.directOwnership) * 100).toFixed(2)} %`
                                                    : ` · ${p.reason}`}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <HelpBlock
                        topic="queEsLaPnc"
                        open={openHelp === 'queEsLaPnc'}
                        onToggle={() => setOpenHelp(openHelp === 'queEsLaPnc' ? null : 'queEsLaPnc')}
                    />
                </section>

                <section className="card">
                    <h3>Estado general</h3>
                    <dl className="cons-summary-list">
                        <div><dt>Activo consolidado</dt><dd>{money(bs.totalAssets.amount)}</dd></div>
                        <div><dt>Pasivo consolidado</dt><dd>{money(bs.totalLiabilities.amount)}</dd></div>
                        <div>
                            <dt>Patrimonio de los propietarios de la controladora</dt>
                            <dd>{money(bs.equityOwners.amount)}</dd>
                        </div>
                        <div>
                            <dt>Participación no controladora</dt>
                            <dd>{money(bs.nonControllingInterest.amount)}</dd>
                        </div>
                        <div className="cons-summary-total">
                            <dt>Patrimonio neto consolidado</dt><dd>{money(bs.totalEquity.amount)}</dd>
                        </div>
                    </dl>

                    {result.statements.canPublish ? (
                        <p className="cons-status-ok">
                            <CheckCircle size={18} weight="fill" aria-hidden="true" />
                            El juego consolidado cierra todos sus controles y puede emitirse.
                        </p>
                    ) : (
                        <div className="alert alert-warning" role="status">
                            <strong>La emisión está bloqueada.</strong>
                            <ul>
                                {result.statements.blockers.slice(0, 6).map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                        </div>
                    )}
                    {result.statements.warnings.length > 0 && (
                        <div className="alert alert-info" role="status">
                            <strong>Advertencias</strong>
                            <ul>{result.statements.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </div>
                    )}
                </section>
            </div>

            <section className="card">
                <h3>Cómo se llega al consolidado</h3>
                <ol className="cons-flow">
                    <li><strong>Estados individuales</strong> de cada entidad, ya cerrados y homogéneos</li>
                    <li><strong>Suma línea por línea</strong> de todos sus rubros</li>
                    <li><strong>Eliminación de la inversión</strong> contra el patrimonio de la controlada</li>
                    <li><strong>Eliminación de saldos recíprocos</strong> y de operaciones internas</li>
                    <li><strong>Eliminación de resultados no trascendidos</strong> a terceros</li>
                    <li><strong>Reconocimiento de la participación no controladora</strong></li>
                    <li><strong>Estados consolidados</strong></li>
                </ol>
                <div className="cons-help-grid">
                    {(['queEsConsolidar', 'porQueDesapareceLaInversion', 'ventaInterna', 'porQueNoVanAlDiario'] as const)
                        .map(t => (
                            <HelpBlock
                                key={t} topic={t}
                                open={openHelp === t}
                                onToggle={() => setOpenHelp(openHelp === t ? null : t)}
                            />
                        ))}
                </div>
            </section>
        </div>
    )
}

function Kpi({ label, value, detail, tone }: {
    label: string; value: string; detail?: string; tone?: 'ok' | 'warn' | 'blocked'
}) {
    return (
        <div className={`cons-kpi ${tone ? `cons-kpi-${tone}` : ''}`}>
            <span className="cons-kpi-label">{label}</span>
            <strong className="cons-kpi-value">{value}</strong>
            {detail && <span className="cons-kpi-detail">{detail}</span>}
        </div>
    )
}

function PerimetroTab({
    perimeter, openHelp, setOpenHelp,
}: {
    perimeter: ReturnType<typeof useConsolidacion>['perimeter']
    openHelp: string | null
    setOpenHelp: (v: string | null) => void
}) {
    return (
        <div className="cons-perimetro">
            <div className="alert alert-info">
                <strong>El perímetro se define por el CONTROL, no por el porcentaje.</strong> Una controlada se
                consolida línea por línea; una asociada no se consolida: se <em>mide</em> por valor patrimonial
                proporcional y queda en una sola línea del activo.
            </div>

            <div className="cons-table-container">
                <table className="cons-statement-table">
                    <caption className="sr-only">Perímetro de consolidación</caption>
                    <thead>
                        <tr>
                            <th scope="col">Entidad</th>
                            <th scope="col">Relación</th>
                            <th scope="col">Participación</th>
                            <th scope="col">Votos</th>
                            <th scope="col">Control desde</th>
                            <th scope="col">Tratamiento</th>
                            <th scope="col">Fundamento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {perimeter.map(p => (
                            <tr key={p.member.id} className={p.included ? undefined : 'cons-row-excluded'}>
                                <th scope="row">{p.companyName}</th>
                                <td>{
                                    p.member.relation === 'PARENT' ? 'Controladora'
                                        : p.member.relation === 'SUBSIDIARY' ? 'Controlada'
                                            : p.member.relation === 'ASSOCIATE' ? 'Asociada' : 'Negocio conjunto'
                                }</td>
                                <td className="cons-amount">{(p.member.directOwnership * 100).toFixed(2)} %</td>
                                <td className="cons-amount">
                                    {((p.member.votingRights ?? p.member.directOwnership) * 100).toFixed(2)} %
                                </td>
                                <td>{p.member.relation === 'PARENT' ? '—' : p.member.controlFrom}</td>
                                <td>
                                    <span className={`cons-tag ${p.included ? 'cons-tag-ok' : 'cons-tag-muted'}`}>
                                        {p.member.method === 'FULL' ? 'Consolidación total'
                                            : p.member.method === 'EQUITY_METHOD' ? 'Medición por VPP' : 'Excluida'}
                                    </span>
                                </td>
                                <td className="cons-rationale">
                                    {p.included ? p.member.controlRationale : p.reason}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="cons-help-grid">
                {(['controlNoEsPorcentaje', 'asociadaNoSeConsolida'] as const).map(t => (
                    <HelpBlock
                        key={t} topic={t}
                        open={openHelp === t}
                        onToggle={() => setOpenHelp(openHelp === t ? null : t)}
                    />
                ))}
            </div>
        </div>
    )
}

function PreparacionTab({ checks, progress }: { checks: ReadinessCheck[]; progress: number }) {
    const order: ReadinessState[] = ['BLOCKED', 'NEEDS_REVIEW', 'COMPLETE', 'NOT_APPLICABLE']
    const sorted = [...checks].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))
    return (
        <div className="cons-preparacion">
            <div className="card cons-progress-card">
                <div className="cons-progress-head">
                    <h3>Preparación para consolidar</h3>
                    <strong>{progress} %</strong>
                </div>
                <div
                    className="cons-progress-bar" role="progressbar"
                    aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
                    aria-label="Avance de la preparación para consolidar"
                >
                    <span style={{ width: `${progress}%` }} />
                </div>
                <p className="cons-muted">
                    Mientras haya controles bloqueados, el juego consolidado puede calcularse y revisarse, pero no
                    emitirse formalmente.
                </p>
            </div>

            <ul className="cons-check-list">
                {sorted.map(check => {
                    const Icon = READINESS_ICON[check.state]
                    return (
                        <li key={check.id} className={`cons-check cons-check-${check.state.toLowerCase()}`}>
                            <Icon size={20} weight="fill" aria-hidden="true" />
                            <div>
                                <div className="cons-check-head">
                                    <strong>{check.label}</strong>
                                    <span className="cons-tag">{READINESS_LABEL[check.state]}</span>
                                </div>
                                <p>{check.detail}</p>
                                {check.remediation && (
                                    <p className="cons-remediation">Qué hacer: {check.remediation}</p>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function PncTab({
    result, openHelp, setOpenHelp,
}: {
    result: NonNullable<ReturnType<typeof useConsolidacion>['result']>
    openHelp: string | null
    setOpenHelp: (v: string | null) => void
}) {
    const { nci } = result.worksheet
    const is = result.statements.incomeStatement
    return (
        <div className="cons-pnc">
            <div className="alert alert-info">
                <strong>La participación no controladora es patrimonio de terceros dentro de las controladas.</strong>{' '}
                No es una deuda del grupo: por eso integra el patrimonio neto y no el pasivo.
            </div>

            {nci.length === 0 ? (
                <div className="card"><p>No hay controladas con participación de terceros en este grupo.</p></div>
            ) : (
                <div className="cons-table-container">
                    <table className="cons-statement-table">
                        <caption className="sr-only">Determinación de la participación no controladora</caption>
                        <thead>
                            <tr>
                                <th scope="col">Controlada</th>
                                <th scope="col">% no controlado</th>
                                <th scope="col">PN de la controlada</th>
                                <th scope="col">Result. no trascendidos propios</th>
                                <th scope="col">PN ajustado</th>
                                <th scope="col">PNC al cierre</th>
                                <th scope="col">Resultado del ejercicio</th>
                                <th scope="col">Resultado ajustado</th>
                                <th scope="col">Resultado a la PNC</th>
                                <th scope="col">Inversión contabilizada</th>
                                <th scope="col">VPP esperado</th>
                                <th scope="col">Diferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nci.map(d => (
                                <tr key={d.companyId}>
                                    <th scope="row">{d.companyName}</th>
                                    <td className="cons-amount">{(d.nonControllingRatio * 100).toFixed(2)} %</td>
                                    <td className="cons-amount">{money(d.subsidiaryEquity)}</td>
                                    <td className="cons-amount">{money(-d.unrealizedFromSubsidiary)}</td>
                                    <td className="cons-amount">{money(d.adjustedEquity)}</td>
                                    <td className="cons-amount"><strong>{money(d.closingNci)}</strong></td>
                                    <td className="cons-amount">{money(d.subsidiaryResult)}</td>
                                    <td className="cons-amount">{money(d.adjustedResult)}</td>
                                    <td className="cons-amount"><strong>{money(d.nciResult)}</strong></td>
                                    <td className="cons-amount">{money(d.bookedInvestment)}</td>
                                    <td className="cons-amount">{money(d.expectedInvestment)}</td>
                                    <td className={`cons-amount ${d.consolidationDifference !== 0 ? 'cons-amount-negative' : ''}`}>
                                        {money(d.consolidationDifference)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="cons-st-total">
                                <th scope="row">Total del grupo</th>
                                <td colSpan={4} />
                                <td className="cons-amount">
                                    {money(nci.reduce((s, d) => s + d.closingNci, 0))}
                                </td>
                                <td colSpan={2} />
                                <td className="cons-amount">{money(is.attributableToNci.amount)}</td>
                                <td colSpan={3} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            <section className="card">
                <h3>Atribución del resultado consolidado</h3>
                <dl className="cons-summary-list">
                    <div><dt>Resultado del ejercicio del grupo</dt><dd>{money(is.netIncome.amount)}</dd></div>
                    <div>
                        <dt>Atribuible a los propietarios de la controladora</dt>
                        <dd>{money(is.attributableToOwners.amount)}</dd>
                    </div>
                    <div>
                        <dt>Atribuible a la participación no controladora</dt>
                        <dd>{money(is.attributableToNci.amount)}</dd>
                    </div>
                </dl>
                <div className="cons-help-grid">
                    {(['ascendenteDescendente', 'resultadoNoTrascendido', 'diferenciaConsolidacion'] as const).map(t => (
                        <HelpBlock
                            key={t} topic={t}
                            open={openHelp === t}
                            onToggle={() => setOpenHelp(openHelp === t ? null : t)}
                        />
                    ))}
                </div>
            </section>
        </div>
    )
}
