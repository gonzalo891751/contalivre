/**
 * Consolidación del grupo económico (Fase 2K §4, §17 · refinada en la 2K.1).
 *
 * UBICACIÓN EN EL CICLO. La consolidación NO es una etapa más del pre-cierre de
 * una empresa: el pre-cierre y el cierre siguen siendo procesos individuales de
 * cada entidad jurídica. Este módulo vive DESPUÉS del cierre individual y se
 * apoya en los estados ya emitidos por cada entidad, por eso tiene página
 * propia junto a "Estados contables" y no dentro de ella.
 *
 * Toda la aritmética vive en src/consolidation. Esta pantalla presenta, y desde
 * la Fase 2K.1 lo hace con el sistema de componentes de components/Consolidacion/ui.
 */

import { useState } from 'react'
import {
    ArrowsLeftRight, Buildings, CheckCircle, Info, ListChecks, Path, Prohibit,
    Stack, Table, TreeStructure, Warning, WarningCircle,
} from '@phosphor-icons/react'
import HojaDeTrabajo from '../components/Consolidacion/HojaDeTrabajo'
import EstadosConsolidados from '../components/Consolidacion/EstadosConsolidados'
import {
    Callout, Chip, ExecRow, ExecTotal, HelpGrid, MetricCard, SectionCard, Verdict,
} from '../components/Consolidacion/ui'
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

const READINESS_CHIP: Record<ReadinessState, 'ok' | 'warn' | 'block' | 'muted'> = {
    COMPLETE: 'ok',
    NEEDS_REVIEW: 'warn',
    BLOCKED: 'block',
    NOT_APPLICABLE: 'muted',
}

type TabId = 'resumen' | 'perimetro' | 'preparacion' | 'hoja' | 'pnc' | 'estados'

const TABS = [
    ['resumen', 'Resumen del grupo', Buildings],
    ['perimetro', 'Perímetro', TreeStructure],
    ['preparacion', 'Preparación', ListChecks],
    ['hoja', 'Papel de trabajo', Table],
    ['pnc', 'Participación no controladora', ArrowsLeftRight],
    ['estados', 'Estados consolidados', Path],
] as const

export default function ConsolidacionPage() {
    const state = useConsolidacion()
    const [tab, setTab] = useState<TabId>('resumen')
    const [openHelp, setOpenHelp] = useState<string | null>(null)

    const { group, consolidation, result, perimeter, loading, error } = state

    if (loading && !result) {
        return (
            <div className="cons-page">
                <PageIntro />
                <SectionCard title="Calculando la consolidación…">
                    <p className="cons-muted">
                        Se están cargando los estados individuales de cada entidad y aplicando las eliminaciones.
                    </p>
                </SectionCard>
            </div>
        )
    }

    if (error) {
        return (
            <div className="cons-page">
                <PageIntro />
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
                <PageIntro />
                <EstadoInicial onSeeded={() => void state.reload()} />
            </div>
        )
    }

    return (
        <div className="cons-page">
            <GroupHero state={state} />

            <nav className="cons-tabs cons-tabs-main" role="tablist" aria-label="Secciones de la consolidación">
                {TABS.map(([id, label, Icon]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        className={`cons-tab ${tab === id ? 'cons-tab-active' : ''}`}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={15} weight="bold" aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </nav>

            {!result || !group || !consolidation ? (
                <SectionCard title="Sin ejercicio seleccionado">
                    <p className="cons-muted">Elegí un ejercicio de consolidación para ver el papel de trabajo.</p>
                </SectionCard>
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

/** Título de la página cuando todavía no hay un grupo que encabezar */
function PageIntro() {
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

// ─────────────────────────────────────────────────────────────
// Encabezado del grupo
// ─────────────────────────────────────────────────────────────

/**
 * Identidad del grupo y del ejercicio abierto. Reemplaza al título genérico y a
 * las dos primeras "tarjetas KPI" de la Fase 2K, que en realidad no eran
 * métricas sino identidad, y por eso competían con las cifras de verdad.
 */
function GroupHero({ state }: { state: ReturnType<typeof useConsolidacion> }) {
    const { group, consolidation, result } = state
    if (!group) return null
    const canPublish = result?.statements.canPublish ?? false

    return (
        <header className="cons-hero">
            <div className="cons-hero-top">
                <div className="cons-hero-id">
                    <span className="cons-hero-mark" aria-hidden="true">
                        <Buildings size={22} weight="duotone" />
                    </span>
                    <div>
                        <span className="cons-hero-eyebrow">Grupo económico</span>
                        <h1 className="cons-hero-title">{group.name}</h1>
                        <p className="cons-hero-sub">
                            Controladora: <strong>{result?.statements.parentCompanyName ?? '—'}</strong>
                            {' · '}Estados contables consolidados
                        </p>
                    </div>
                </div>

                <div className="cons-hero-controls">
                    <label className="cons-field">
                        <span>Cambiar de grupo</span>
                        <select value={group.id} onChange={e => state.selectGroup(e.target.value)}>
                            {state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </label>
                    <label className="cons-field">
                        <span>Ejercicio</span>
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
            </div>

            {consolidation && (
                <div className="cons-hero-meta">
                    <div className="cons-hero-meta-item">
                        <span className="cons-hero-meta-label">Ejercicio</span>
                        <span className="cons-hero-meta-value">{consolidation.label}</span>
                    </div>
                    <div className="cons-hero-meta-item">
                        <span className="cons-hero-meta-label">Cierre</span>
                        <span className="cons-hero-meta-value">{consolidation.reportingDate}</span>
                    </div>
                    <div className="cons-hero-meta-item">
                        <span className="cons-hero-meta-label">Período</span>
                        <span className="cons-hero-meta-value">
                            {consolidation.periodStart} al {consolidation.periodEnd}
                        </span>
                    </div>
                    <div className="cons-hero-meta-item">
                        <span className="cons-hero-meta-label">Moneda</span>
                        <span className="cons-hero-meta-value">{group.presentationCurrency}</span>
                    </div>
                    <div className="cons-hero-meta-item">
                        <span className="cons-hero-meta-label">Unidad de medida</span>
                        <span className="cons-hero-meta-value">{group.measurementUnit}</span>
                    </div>
                    {result && (
                        <div className="cons-hero-meta-item" style={{ marginLeft: 'auto', justifyContent: 'center' }}>
                            <span className={`cons-hero-status ${canPublish ? 'cons-hero-status-ok' : 'cons-hero-status-blocked'}`}>
                                {canPublish
                                    ? <><CheckCircle size={15} weight="fill" aria-hidden="true" /> Listo para emitir</>
                                    : <><Warning size={15} weight="fill" aria-hidden="true" /> Emisión bloqueada</>}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </header>
    )
}

// ─────────────────────────────────────────────────────────────
// Estado inicial
// ─────────────────────────────────────────────────────────────

function EstadoInicial({ onSeeded }: { onSeeded: () => void }) {
    const [seeding, setSeeding] = useState(false)
    const [failed, setFailed] = useState<string | null>(null)

    return (
        <section className="cons-section">
            <div className="cons-empty">
                <div className="cons-empty-copy">
                    <span className="cons-empty-eyebrow">
                        <TreeStructure size={14} weight="bold" aria-hidden="true" />
                        Grupo económico
                    </span>
                    <h2>Todavía no hay ningún grupo económico</h2>
                    <p>
                        Un grupo reúne a una entidad controladora con sus controladas para presentarlas como una sola
                        entidad económica. Cada entidad conserva sus libros: la consolidación es un papel de trabajo
                        del grupo y no modifica ningún asiento.
                    </p>
                    <div className="cons-empty-actions">
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
                        <p className="cons-empty-hint">
                            Crea dos entidades con sus propios libros (ejercicios 2024 y 2025), una controlada al 80 %,
                            un préstamo con intereses, un saldo comercial recíproco, una venta intragrupo con mercadería
                            parcialmente en stock y dividendos. No modifica ninguna empresa ni ningún asiento existente.
                        </p>
                    </div>
                    {failed && <div className="alert alert-error" role="alert">{failed}</div>}
                </div>

                {/* Esquema sobrio de lo que es un grupo: controladora y controladas */}
                <figure className="cons-empty-figure" aria-hidden="true">
                    <div className="cons-fig-node cons-fig-parent">
                        <Buildings size={16} weight="duotone" />
                        Controladora
                    </div>
                    <span className="cons-fig-stem" />
                    <div className="cons-fig-branch">
                        <div className="cons-fig-leg">
                            <span className="cons-fig-stem" />
                            <div className="cons-fig-node">Controlada A</div>
                        </div>
                        <div className="cons-fig-leg">
                            <span className="cons-fig-stem" />
                            <div className="cons-fig-node">Controlada B</div>
                        </div>
                    </div>
                    <figcaption className="cons-fig-caption">
                        Los activos y pasivos se suman al 100 %; lo que las entidades se hicieron entre sí se elimina.
                    </figcaption>
                </figure>
            </div>
        </section>
    )
}

// ─────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────

const FLOW_STEPS: [string, string][] = [
    ['Estados individuales', 'de cada entidad, ya cerrados y homogéneos'],
    ['Suma línea por línea', 'de todos sus rubros'],
    ['Eliminación de la inversión', 'contra el patrimonio de la controlada'],
    ['Eliminación de saldos recíprocos', 'y de operaciones internas'],
    ['Eliminación de resultados no trascendidos', 'a terceros'],
    ['Reconocimiento de la participación no controladora', ''],
    ['Estados consolidados', ''],
]

function ResumenTab({
    state, openHelp, setOpenHelp,
}: {
    state: ReturnType<typeof useConsolidacion>
    openHelp: string | null
    setOpenHelp: (v: string | null) => void
}) {
    const { result, perimeter } = state
    if (!result) return null

    const included = perimeter.filter(p => p.included)
    const excluded = perimeter.filter(p => !p.included)
    const unreconciled = result.input.reciprocals.filter(r => r.status !== 'RECONCILED').length
    const draftAdjustments = result.input.adjustments.filter(a => a.status === 'DRAFT').length
    const bs = result.statements.balanceSheet
    const canPublish = result.statements.canPublish

    return (
        <div className="cons-resumen">
            <div className="cons-kpi-grid">
                <MetricCard
                    label="Entidades consolidadas"
                    value={String(included.length)}
                    detail={excluded.length > 0
                        ? `${excluded.length} fuera del perímetro`
                        : 'Ninguna entidad excluida'}
                    tone="accent"
                    icon={Buildings}
                />
                <MetricCard
                    label="Avance de la preparación"
                    value={`${result.readiness.progress} %`}
                    detail={result.readiness.canConsolidate
                        ? 'Sin controles bloqueados'
                        : 'Hay controles bloqueados'}
                    tone={result.readiness.canConsolidate ? 'ok' : 'blocked'}
                    icon={ListChecks}
                />
                <MetricCard
                    label="Diferencias sin conciliar"
                    value={String(unreconciled)}
                    detail={unreconciled === 0
                        ? 'Todas las partidas recíprocas conciliadas'
                        : 'Revisá la conciliación intragrupo'}
                    tone={unreconciled === 0 ? 'ok' : 'warn'}
                    icon={ArrowsLeftRight}
                />
                <MetricCard
                    label="Eliminaciones aplicadas"
                    value={String(result.worksheet.eliminations.length)}
                    detail={draftAdjustments > 0
                        ? `${draftAdjustments} ajuste(s) en borrador sin aplicar`
                        : 'Todas balanceadas (Debe = Haber)'}
                    tone={draftAdjustments === 0 ? 'ok' : 'warn'}
                    icon={Stack}
                />
            </div>

            <div className="cons-two-col">
                <SectionCard
                    icon={TreeStructure}
                    title="Estructura del grupo"
                    description="Participación y participación no controladora de cada entidad"
                >
                    <div className="cons-tree">
                        <div className="cons-tree-parent">
                            <span className="cons-tree-parent-icon" aria-hidden="true">
                                <Buildings size={19} weight="duotone" />
                            </span>
                            <span className="cons-tree-parent-text">
                                <span className="cons-tree-parent-name">{result.statements.parentCompanyName}</span>
                                <span className="cons-tree-parent-role">Controladora</span>
                            </span>
                        </div>
                        <ul className="cons-tree-children">
                            {perimeter.filter(p => p.member.relation !== 'PARENT').map(p => (
                                <li key={p.member.id} className={p.included ? '' : 'cons-tree-excluded'}>
                                    <div className="cons-tree-node">
                                        <span className="cons-tree-node-icon" aria-hidden="true">
                                            <Buildings size={16} weight="regular" />
                                        </span>
                                        <span className="cons-tree-node-text">
                                            <span className="cons-tree-node-name">{p.companyName}</span>
                                            {p.included ? (
                                                <span className="cons-tree-chips">
                                                    <Chip tone="accent">
                                                        {(p.member.directOwnership * 100).toFixed(2)} % participación
                                                    </Chip>
                                                    <Chip tone="muted">
                                                        PNC {((1 - p.member.directOwnership) * 100).toFixed(2)} %
                                                    </Chip>
                                                    <Chip tone="muted">
                                                        {p.member.heldThroughMemberId ? 'Indirecta' : 'Directa'}
                                                    </Chip>
                                                </span>
                                            ) : (
                                                <span className="cons-tree-reason">{p.reason}</span>
                                            )}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </SectionCard>

                <SectionCard
                    icon={Path}
                    title="Estado del grupo"
                    description="Situación patrimonial consolidada al cierre"
                >
                    <dl className="cons-exec">
                        <ExecRow label="Activo consolidado" value={money(bs.totalAssets.amount)} />
                        <ExecRow label="Pasivo consolidado" value={money(bs.totalLiabilities.amount)} />
                        <ExecRow
                            label="Patrimonio de los propietarios de la controladora"
                            value={money(bs.equityOwners.amount)}
                            sub
                        />
                        <ExecRow
                            label="Participación no controladora"
                            value={money(bs.nonControllingInterest.amount)}
                            sub
                        />
                        <ExecTotal label="Patrimonio neto consolidado" value={money(bs.totalEquity.amount)} />
                    </dl>

                    {canPublish ? (
                        <Verdict tone="ok" icon={CheckCircle} title="El juego consolidado puede emitirse">
                            Cierra todos sus controles de integridad: la ecuación patrimonial, la atribución del
                            resultado y el balance de cada eliminación.
                        </Verdict>
                    ) : (
                        <Verdict tone="blocked" icon={Prohibit} title="La emisión está bloqueada">
                            <ul>
                                {result.statements.blockers.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                        </Verdict>
                    )}
                    {result.statements.warnings.length > 0 && (
                        <Verdict tone="blocked" icon={WarningCircle} title="Advertencias">
                            <ul>{result.statements.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </Verdict>
                    )}
                </SectionCard>
            </div>

            <SectionCard
                icon={Path}
                title="Cómo se llega al consolidado"
                description="La consolidación no es una tabla: es un proceso con etapas verificables"
            >
                <ol className="cons-flow">
                    {FLOW_STEPS.map(([strong, rest], i) => (
                        <li key={strong} className={i === FLOW_STEPS.length - 1 ? 'cons-flow-last' : ''}>
                            <span className="cons-flow-step" aria-hidden="true">{i + 1}</span>
                            <span className="cons-flow-text">
                                <strong>{strong}</strong>{rest ? ` ${rest}` : ''}
                            </span>
                        </li>
                    ))}
                </ol>
            </SectionCard>

            <SectionCard
                icon={Info}
                title="Para entender el proceso"
                description="Las ideas de fondo detrás de cada eliminación"
            >
                <HelpGrid
                    topics={['queEsConsolidar', 'porQueDesapareceLaInversion', 'ventaInterna', 'porQueNoVanAlDiario']}
                    openTopic={openHelp}
                    onToggle={setOpenHelp}
                />
            </SectionCard>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Perímetro
// ─────────────────────────────────────────────────────────────

function PerimetroTab({
    perimeter, openHelp, setOpenHelp,
}: {
    perimeter: ReturnType<typeof useConsolidacion>['perimeter']
    openHelp: string | null
    setOpenHelp: (v: string | null) => void
}) {
    return (
        <div className="cons-perimetro">
            <Callout icon={Info}>
                <strong>El perímetro se define por el CONTROL, no por el porcentaje.</strong> Una controlada se
                consolida línea por línea; una asociada no se consolida: se <em>mide</em> por valor patrimonial
                proporcional y queda en una sola línea del activo.
            </Callout>

            <SectionCard
                icon={TreeStructure}
                title="Entidades del grupo"
                description="Relación, participación y fundamento de la conclusión sobre el control"
                flush
            >
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
                                        <Chip tone={p.included ? 'ok' : 'muted'}>
                                            {p.member.method === 'FULL' ? 'Consolidación total'
                                                : p.member.method === 'EQUITY_METHOD' ? 'Medición por VPP' : 'Excluida'}
                                        </Chip>
                                    </td>
                                    <td className="cons-rationale">
                                        {p.included ? p.member.controlRationale : p.reason}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <SectionCard icon={Info} title="Sobre el perímetro">
                <HelpGrid
                    topics={['controlNoEsPorcentaje', 'asociadaNoSeConsolida']}
                    openTopic={openHelp}
                    onToggle={setOpenHelp}
                />
            </SectionCard>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Preparación
// ─────────────────────────────────────────────────────────────

function PreparacionTab({ checks, progress }: { checks: ReadinessCheck[]; progress: number }) {
    const order: ReadinessState[] = ['BLOCKED', 'NEEDS_REVIEW', 'COMPLETE', 'NOT_APPLICABLE']
    const sorted = [...checks].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))
    const counts = order.map(s => [s, checks.filter(c => c.state === s).length] as const)

    return (
        <div className="cons-preparacion">
            <section className="cons-section cons-progress-card">
                <div className="cons-progress-head">
                    <h3>Preparación para consolidar</h3>
                    <span className="cons-progress-figure">{progress} %</span>
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
                <div className="cons-progress-legend">
                    {counts.filter(([, n]) => n > 0).map(([s, n]) => (
                        <Chip key={s} tone={READINESS_CHIP[s]}>{n} {READINESS_LABEL[s].toLowerCase()}</Chip>
                    ))}
                </div>
            </section>

            <ul className="cons-check-list">
                {sorted.map(check => {
                    const Icon = READINESS_ICON[check.state]
                    return (
                        <li key={check.id} className={`cons-check cons-check-${check.state.toLowerCase()}`}>
                            <Icon size={20} weight="fill" aria-hidden="true" />
                            <div>
                                <div className="cons-check-head">
                                    <strong>{check.label}</strong>
                                    <Chip tone={READINESS_CHIP[check.state]}>{READINESS_LABEL[check.state]}</Chip>
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

// ─────────────────────────────────────────────────────────────
// Participación no controladora
// ─────────────────────────────────────────────────────────────

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
            <Callout icon={Info}>
                <strong>La participación no controladora es patrimonio de terceros dentro de las controladas.</strong>{' '}
                No es una deuda del grupo: por eso integra el patrimonio neto y no el pasivo.
            </Callout>

            <div className="cons-kpi-grid">
                <MetricCard
                    label="PNC al cierre"
                    value={money(nci.reduce((s, d) => s + d.closingNci, 0))}
                    detail={`${nci.length} controlada(s) con participación de terceros`}
                    tone="accent"
                    icon={ArrowsLeftRight}
                />
                <MetricCard
                    label="Resultado del ejercicio del grupo"
                    value={money(is.netIncome.amount)}
                    detail="Antes de atribuirlo entre propietarios y PNC"
                    icon={Path}
                />
                <MetricCard
                    label="Atribuible a los propietarios"
                    value={money(is.attributableToOwners.amount)}
                    detail="De la controladora"
                    tone="ok"
                    icon={Buildings}
                />
                <MetricCard
                    label="Atribuible a la PNC"
                    value={money(is.attributableToNci.amount)}
                    detail="De los accionistas ajenos al grupo"
                    tone="accent"
                    icon={ArrowsLeftRight}
                />
            </div>

            {nci.length === 0 ? (
                <SectionCard title="Sin participación de terceros">
                    <p className="cons-muted">No hay controladas con participación de terceros en este grupo.</p>
                </SectionCard>
            ) : (
                <SectionCard
                    icon={ArrowsLeftRight}
                    title="Determinación de la participación no controladora"
                    description="Patrimonio ajustado, PNC al cierre y contraste de la inversión con el VPP esperado"
                    flush
                >
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
                                        <td className="cons-amount cons-cell-total">{money(d.closingNci)}</td>
                                        <td className="cons-amount">{money(d.subsidiaryResult)}</td>
                                        <td className="cons-amount">{money(d.adjustedResult)}</td>
                                        <td className="cons-amount cons-cell-total">{money(d.nciResult)}</td>
                                        <td className="cons-amount">{money(d.bookedInvestment)}</td>
                                        <td className="cons-amount">{money(d.expectedInvestment)}</td>
                                        <td className={`cons-amount ${d.consolidationDifference !== 0 ? 'cons-amount-negative' : ''}`}>
                                            {money(d.consolidationDifference)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="cons-total-row">
                                    <th scope="row">Total del grupo</th>
                                    <td colSpan={4} />
                                    <td className="cons-amount cons-cell-total">
                                        {money(nci.reduce((s, d) => s + d.closingNci, 0))}
                                    </td>
                                    <td colSpan={2} />
                                    <td className="cons-amount cons-cell-total">{money(is.attributableToNci.amount)}</td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </SectionCard>
            )}

            <SectionCard icon={Info} title="Por qué la atribución cambia según quién vendió">
                <HelpGrid
                    topics={['ascendenteDescendente', 'resultadoNoTrascendido', 'diferenciaConsolidacion', 'queEsLaPnc']}
                    openTopic={openHelp}
                    onToggle={setOpenHelp}
                />
            </SectionCard>
        </div>
    )
}
