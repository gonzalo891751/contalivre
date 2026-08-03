/** Pre-cierre guiado, medición y ajuste por inflación — Fase 2L. */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
    ArrowRight, Buildings, CheckCircle, ClipboardText, Compass, DownloadSimple,
    Info, Path, PlayCircle, Question, Scales, WarningCircle, XCircle,
} from '@phosphor-icons/react'
import { db } from '../storage/db'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { listIndexSets } from '../accounting/inflation/indexRegistry'
import { loadReportingBundle, type ReportingBundle } from '../reporting/loadReportingBundle'
import { listPendingMeasurements } from '../reporting/measurement/measurementService'
import type { PendingMeasurement } from '../reporting/measurement/measurementTypes'
import {
    STAGE_ORDER,
    type ReadinessStage,
    type StageReport,
    type StageStatus,
} from '../reporting/closing/closingReadiness'
import {
    saveInflationPolicy,
    saveStageReview,
} from '../reporting/closing/closingWorkPaperService'
import { exportPreCloseWorkingPaper } from '../lib/exportPreCloseWorkingPaper'
import { CoberturaCuentasTabla } from '../components/PreCierre/CoberturaCuentasTabla'
import { MedicionesPanel } from '../components/PreCierre/MedicionesPanel'
import { InflationWorkPaperPanel } from '../components/PreCierre/InflationWorkPaperPanel'
import { Callout, Chip, HelpAccordion, MetricCard, SectionCard, Verdict, type ChipTone } from '../components/Consolidacion/ui'
import type { InflationIndexSet } from '../accounting/inflation/types'

const money = (value: number) => new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(value)

const exerciseId = (bundle: ReportingBundle) =>
    `exercise-${bundle.metadata.companyId}-${bundle.metadata.periodStart.slice(0, 4)}`

const LEGACY_STAGE: Record<string, ReadinessStage> = {
    RESUMEN: 'IDENTIDAD_EJERCICIO',
    COBERTURA: 'INTEGRIDAD_COBERTURA',
    AJUSTES: 'CORTE_DEVENGAMIENTOS',
    INVENTARIO: 'INVENTARIO_CMV',
    BIENES_USO: 'BIENES_USO_DEPRECIACIONES',
    MEDICIONES: 'MEDICION_RECUPERABILIDAD',
    AXI: 'UNIDAD_MEDIDA_INFLACION',
    RECPAM: 'UNIDAD_MEDIDA_INFLACION',
    CONTROLES: 'CONCILIACION_EMISION',
    ESTADOS: 'CONCILIACION_EMISION',
    CIERRE: 'CONCILIACION_EMISION',
}

const STATUS: Record<StageStatus, { label: string; tone: ChipTone }> = {
    PENDIENTE: { label: 'Pendiente', tone: 'muted' },
    EN_REVISION: { label: 'En revisión', tone: 'accent' },
    CON_ADVERTENCIAS: { label: 'Con advertencias', tone: 'warn' },
    BLOQUEADA: { label: 'Bloqueada', tone: 'block' },
    COMPLETA: { label: 'Completa', tone: 'ok' },
    NO_APLICABLE: { label: 'No aplicable', tone: 'muted' },
}

export default function PreCierrePage() {
    const navigate = useNavigate()
    const [params, setParams] = useSearchParams()
    const { year, end } = usePeriodYear()
    const [sets, setSets] = useState<InflationIndexSet[]>([])
    const [setId, setSetId] = useState('')
    const [bundle, setBundle] = useState<ReportingBundle | null>(null)
    const [pending, setPending] = useState<PendingMeasurement[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [noApplyReason, setNoApplyReason] = useState('')
    const [openHelp, setOpenHelp] = useState(false)

    const rawStage = params.get('etapa') ?? 'IDENTIDAD_EJERCICIO'
    const activeStage = (STAGE_ORDER.includes(rawStage as ReadinessStage)
        ? rawStage
        : LEGACY_STAGE[rawStage] ?? 'IDENTIDAD_EJERCICIO') as ReadinessStage
    const setStage = (stage: ReadinessStage) => setParams({ etapa: stage })

    useEffect(() => {
        void listIndexSets().then(list => {
            setSets(list)
            setSetId(current => current || list[0]?.id || '')
        })
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const next = await loadReportingBundle(year, {
                withComparative: true,
                inflationIndexSetId: setId || undefined,
            })
            setBundle(next)
            if (next.closingWorkPaper?.inflation.indexSetId && !setId) {
                setSetId(next.closingWorkPaper.inflation.indexSetId)
            }
            setNoApplyReason(next.closingWorkPaper?.inflation.rationale ?? '')
            const balances = new Map(next.statements.trialBalance.rows.map(row => [row.accountId, row.closing]))
            const accounts = await db.accounts.toArray()
            setPending(await listPendingMeasurements(exerciseId(next), accounts, balances).catch(() => []))
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught))
            setBundle(null)
        } finally {
            setLoading(false)
        }
    }, [year, setId])

    useEffect(() => { void load() }, [load])

    const stages = bundle?.readiness.stages ?? []
    const stage = stages.find(candidate => candidate.stage === activeStage) ?? stages[0]

    if (loading && !bundle) return <div className="empty-state" style={{ padding: 48 }}>Analizando el ejercicio y sus evidencias…</div>
    if (error) return <div className="card" role="alert" style={{ margin: 24, padding: 16, borderLeft: '4px solid #c2410c' }}>No se pudo analizar el ejercicio: {error}</div>
    if (!bundle || !stage) return null

    const progress = bundle.readiness.applicableStages === 0
        ? 0
        : Math.round(bundle.readiness.completedStages / bundle.readiness.applicableStages * 100)
    const unitLabel = bundle.closingWorkPaper?.inflation.applicability === 'NO_APLICABLE'
        ? 'Moneda nominal · decisión documentada'
        : bundle.inflationSet ? `Moneda de cierre · ${bundle.inflationSet.coverageTo}` : 'Unidad de medida pendiente'

    const savePolicy = async (applicability: 'APLICABLE' | 'NO_APLICABLE') => {
        setSaving(true); setMessage(null)
        try {
            await saveInflationPolicy(bundle.metadata.companyId, exerciseId(bundle), {
                applicability,
                indexSetId: applicability === 'APLICABLE' ? setId : undefined,
                contextAssessment: applicability === 'APLICABLE'
                    ? 'Contexto evaluado para expresar el juego completo en moneda de cierre.'
                    : 'Contexto evaluado y documentado para el ejercicio.',
                rationale: applicability === 'NO_APLICABLE' ? noApplyReason : 'El contexto contable requiere moneda de cierre.',
                normativeSource: 'RT 54, texto ordenado por RT 59, párrafos 97 a 100 y 176 a 200.',
            })
            setMessage(applicability === 'APLICABLE'
                ? 'Aplicabilidad y serie guardadas con trazabilidad.'
                : 'No aplicación guardada con su fundamento verificable.')
            await load()
        } catch (caught) {
            setMessage(caught instanceof Error ? caught.message : String(caught))
        } finally { setSaving(false) }
    }

    const markReview = async (status: 'EN_REVISION' | 'REVISADA') => {
        setSaving(true); setMessage(null)
        try {
            await saveStageReview(bundle.metadata.companyId, exerciseId(bundle), { stage: stage.stage, status })
            setMessage(status === 'EN_REVISION' ? 'Etapa marcada en revisión.' : 'Revisión de la etapa documentada.')
            await load()
        } catch (caught) {
            setMessage(caught instanceof Error ? caught.message : String(caught))
        } finally { setSaving(false) }
    }

    const goNext = () => {
        const unresolved = stage.checks.find(check => !check.passed && check.link)
        if (unresolved?.link) return navigate(unresolved.link)
        if (stage.dependencyBlockers[0]) return setStage(stage.dependencyBlockers[0])
        const index = STAGE_ORDER.indexOf(stage.stage)
        if (index < STAGE_ORDER.length - 1) return setStage(STAGE_ORDER[index + 1])
        navigate(bundle.readiness.canClose ? '/configuracion?seccion=ejercicios' : '/estados')
    }

    return (
        <div className="cons-page preclose-page" data-testid="precierre-page">
            <header className="preclose-hero">
                <div className="preclose-hero-top">
                    <div className="preclose-hero-id">
                        <span className="preclose-hero-mark" aria-hidden><Path size={23} weight="bold" /></span>
                        <div>
                            <p className="preclose-eyebrow">Fase final del ciclo contable</p>
                            <h1 className="preclose-title">Pre-cierre guiado</h1>
                            <p className="preclose-subtitle">Del Libro Diario a un juego conciliado: corte, medición, recuperabilidad, moneda de cierre y emisión.</p>
                        </div>
                    </div>
                    <div className="preclose-hero-actions">
                        <button className="btn btn-sm" onClick={() => void exportPreCloseWorkingPaper(bundle)}>
                            <DownloadSimple size={15} /> Exportar papel de trabajo
                        </button>
                        <button className="btn btn-sm" onClick={() => navigate('/estados')}>Ver estados</button>
                    </div>
                </div>
                <div className="preclose-hero-meta">
                    <Meta label="Empresa" value={bundle.metadata.companyLegalName} />
                    <Meta label="CUIT" value={bundle.metadata.companyTaxId ?? 'Pendiente'} />
                    <Meta label="Ejercicio" value={bundle.metadata.exerciseLabel} />
                    <Meta label="Cierre" value={end.split('-').reverse().join('/')} />
                    <Meta label="Unidad de medida" value={unitLabel} />
                </div>
                <div className="preclose-progress" aria-label={`Avance ${progress} %`}>
                    <div className="preclose-progress-copy"><span>Avance verificable</span><strong>{bundle.readiness.completedStages} de {bundle.readiness.applicableStages} etapas · {progress} %</strong></div>
                    <div className="preclose-progress-track"><span style={{ width: `${progress}%` }} /></div>
                </div>
            </header>

            {message && <Callout icon={Info}>{message}</Callout>}

            <div className="preclose-layout">
                <nav className="preclose-rail" aria-label="Etapas del pre-cierre">
                    <p className="preclose-rail-label">Recorrido</p>
                    {stages.map((candidate, index) => (
                        <button key={candidate.stage} type="button"
                            className={`preclose-step ${candidate.stage === stage.stage ? 'is-active' : ''}`}
                            aria-current={candidate.stage === stage.stage ? 'step' : undefined}
                            onClick={() => setStage(candidate.stage)} data-testid={`etapa-${candidate.stage}`}>
                            <span className="preclose-step-index">{index + 1}</span>
                            <span className="preclose-step-copy">
                                <span className="preclose-step-title">{candidate.label.replace(/^\d+ · /, '')}</span>
                                <Chip tone={STATUS[candidate.status].tone}>{STATUS[candidate.status].label}{candidate.blockingCount ? ` · ${candidate.blockingCount}` : ''}</Chip>
                            </span>
                        </button>
                    ))}
                </nav>

                <main className="preclose-content">
                    <header className="preclose-stage-header">
                        <h2>{stage.label}</h2>
                        <p>{stage.description}</p>
                        <div className="preclose-stage-objective"><Compass size={16} weight="bold" /> <span><strong>Objetivo:</strong> {stage.objective}</span></div>
                    </header>

                    {stage.status === 'NO_APLICABLE' && stage.reason && (
                        <Callout icon={Info}><strong>No aplicable.</strong> {stage.reason}</Callout>
                    )}

                    <SectionCard icon={Question} title="Qué debe responder esta etapa" description="Preguntas breves para orientar la revisión.">
                        <ul className="preclose-question-list">
                            {stage.keyQuestions.map(question => <li key={question}><CheckCircle size={15} weight="bold" />{question}</li>)}
                        </ul>
                    </SectionCard>

                    <Findings stage={stage} onGo={navigate} />
                    <StageBody stage={stage} bundle={bundle} pending={pending} closingDate={end} onChanged={load}
                        sets={sets} setId={setId} onSetId={setSetId} noApplyReason={noApplyReason}
                        onNoApplyReason={setNoApplyReason} onSavePolicy={savePolicy} saving={saving} />

                    <HelpAccordion open={openHelp} onToggle={() => setOpenHelp(open => !open)}
                        question="¿Cómo se conecta esta etapa con los estados contables?"
                        answer={pedagogicalAnswer(stage, bundle)}
                        normative="RT 54, texto ordenado por RT 59. Ayuda contextual; la conclusión depende del caso y su evidencia." />
                </main>

                <aside className="preclose-aside" aria-label="Próxima acción e impacto">
                    <section className="preclose-next">
                        <header className="preclose-next-head"><span>Próxima acción</span><strong>{stage.canContinue ? 'Continuar el recorrido' : 'Resolver antes de seguir'}</strong></header>
                        <div className="preclose-next-body">
                            <p>{stage.nextAction}</p>
                            <button className="btn btn-primary btn-sm" onClick={goNext}>{!stage.canContinue ? 'Resolver ahora' : 'Continuar'} <ArrowRight size={14} /></button>
                        </div>
                    </section>
                    <section className="preclose-aside-card">
                        <h3>Estado del juego</h3>
                        <MiniRow label="Bloqueos" value={String(bundle.readiness.blockers.length)} />
                        <MiniRow label="Advertencias" value={String(bundle.readiness.warnings.length)} />
                        <MiniRow label="Ajustes pendientes" value={String(bundle.closingImpact.adjustmentCount)} />
                        <MiniRow label="Diferencia ecuación" value={money(bundle.closingImpact.equationDifferenceAfter)} />
                    </section>
                    <section className="preclose-aside-card preclose-aside-actions">
                        <h3>Revisión profesional</h3>
                        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void markReview('EN_REVISION')}><PlayCircle size={14} /> Iniciar revisión</button>
                        <button className="btn btn-secondary btn-sm" disabled={saving || stage.blockingCount > 0} onClick={() => void markReview('REVISADA')}><CheckCircle size={14} /> Documentar revisión</button>
                    </section>
                </aside>
            </div>
        </div>
    )
}

function Findings({ stage, onGo }: { stage: StageReport; onGo: (link: string) => void }) {
    if (stage.checks.length === 0) return null
    return (
        <SectionCard icon={ClipboardText} title="Hallazgos y controles" description="Qué se encontró, por qué importa y cómo resolverlo.">
            <div className="preclose-findings">
                {stage.checks.map(check => {
                    const kind = check.passed ? 'is-ok' : check.severity === 'BLOQUEA' ? 'is-block' : 'is-warn'
                    const Icon = check.passed ? CheckCircle : check.severity === 'BLOQUEA' ? XCircle : WarningCircle
                    return (
                        <article className={`preclose-finding ${kind}`} key={check.id}>
                            <span className="preclose-finding-icon"><Icon size={17} weight="fill" /></span>
                            <div className="preclose-finding-copy">
                                <strong>{check.label}</strong>
                                {check.detail && <p>{check.detail}</p>}
                                {!check.passed && check.why && <p><b>Por qué importa:</b> {check.why}</p>}
                                {!check.passed && check.action && <small><b>Cómo resolver:</b> {check.action}</small>}
                            </div>
                            {!check.passed && check.link && <button className="btn btn-secondary btn-sm" onClick={() => onGo(check.link!)}>{check.actionLabel ?? 'Resolver'}</button>}
                        </article>
                    )
                })}
            </div>
        </SectionCard>
    )
}

function StageBody(props: {
    stage: StageReport
    bundle: ReportingBundle
    pending: PendingMeasurement[]
    closingDate: string
    onChanged: () => Promise<void>
    sets: InflationIndexSet[]
    setId: string
    onSetId: (value: string) => void
    noApplyReason: string
    onNoApplyReason: (value: string) => void
    onSavePolicy: (applicability: 'APLICABLE' | 'NO_APLICABLE') => Promise<void>
    saving: boolean
}) {
    const { stage, bundle } = props
    if (stage.stage === 'IDENTIDAD_EJERCICIO') return <IdentityPanel bundle={bundle} />
    if (stage.stage === 'INTEGRIDAD_COBERTURA') return bundle.treatmentMatrix
        ? <SectionCard icon={Scales} title="Matriz universal de cobertura" description="Cada cuenta con saldo o movimiento, incluso si no se reexpresa." flush><CoberturaCuentasTabla matrix={bundle.treatmentMatrix} /></SectionCard>
        : <Callout icon={WarningCircle}>La matriz se habilita al seleccionar una serie para previsualizar los coeficientes; la aplicabilidad debe resolverse en la etapa 7.</Callout>
    if (stage.stage === 'CORTE_DEVENGAMIENTOS') return <CutoffPanel bundle={bundle} />
    if (stage.stage === 'INVENTARIO_CMV') return <InventoryPanel bundle={bundle} />
    if (stage.stage === 'BIENES_USO_DEPRECIACIONES') return <FixedAssetsPanel bundle={bundle} />
    if (stage.stage === 'MEDICION_RECUPERABILIDAD') return (
        <SectionCard icon={Scales} title="Espacio de mediciones" description="Política, fuente, valor recuperable, asiento e impacto; nada se contabiliza en silencio.">
            <MedicionesPanel companyId={bundle.metadata.companyId} exerciseId={exerciseId(bundle)}
                closingDate={props.closingDate} pending={props.pending}
                balances={new Map(bundle.statements.trialBalance.rows.map(row => [row.accountId, row.closing]))}
                onChanged={props.onChanged} />
        </SectionCard>
    )
    if (stage.stage === 'UNIDAD_MEDIDA_INFLACION') return (
        <>
            <InflationPolicyPanel {...props} />
            <InflationWorkPaperPanel bundle={bundle} />
        </>
    )
    return <FinalPanel bundle={bundle} />
}

function IdentityPanel({ bundle }: { bundle: ReportingBundle }) {
    return (
        <div className="preclose-stage-stack" data-testid="stage-identity">
            <div className="preclose-metrics">
                <MetricCard icon={Buildings} label="Entidad emisora" value={bundle.metadata.companyLegalName} compact detail={bundle.metadata.companyTaxId ?? 'CUIT pendiente'} />
                <MetricCard icon={ClipboardText} label="Ejercicio" value={bundle.metadata.exerciseLabel} compact detail={`${bundle.metadata.periodStart} → ${bundle.metadata.periodEnd}`} />
                <MetricCard icon={Scales} label="Marco" value="RT 54 (TO RT 59)" compact detail={bundle.metadata.unit} tone="accent" />
            </div>
            <Callout icon={Info}>La identidad y el ejercicio gobiernan fecha de medición, corte, comparativos y trazabilidad. Si fallan, el problema se muestra como falta concreta; no como una afirmación positiva contradictoria.</Callout>
        </div>
    )
}

function CutoffPanel({ bundle }: { bundle: ReportingBundle }) {
    const draft = bundle.readiness.checks.find(check => check.id === 'sin-borradores')?.actual ?? 0
    const outside = bundle.readiness.checks.find(check => check.id === 'sin-asientos-fuera')?.actual ?? 0
    return <div className="preclose-metrics" data-testid="stage-accruals">
        <MetricCard label="Borradores" value={String(draft)} detail="Contabilizar o eliminar deliberadamente" tone={draft ? 'blocked' : 'ok'} />
        <MetricCard label="Fuera del período" value={String(outside)} detail="Revisión de corte" tone={outside ? 'warn' : 'ok'} />
        <MetricCard label="Fecha de cierre" value={bundle.metadata.periodEnd} compact detail="Hechos posteriores se evalúan por separado" />
    </div>
}

function InventoryPanel({ bundle }: { bundle: ReportingBundle }) {
    const inventoryRows = bundle.inflationWorkPaper.rows.filter(row => row.rubro === 'INVENTORIES')
    return <div className="preclose-stage-stack" data-testid="stage-inventory">
        <div className="preclose-metrics">
            <MetricCard label="Cuentas de inventario" value={String(inventoryRows.length)} detail="Con saldo o movimiento" />
            <MetricCard label="Costo de ventas" value={money(bundle.statements.incomeStatement.costOfSales.amount)} detail="Estado de Resultados" />
            <MetricCard label="Orígenes identificados" value={String(inventoryRows.reduce((sum, row) => sum + row.origins.length, 0))} detail="Capas/meses trazables" tone={inventoryRows.some(row => row.status === 'BLOQUEADO') ? 'blocked' : 'ok'} />
        </div>
        <Callout icon={Info}>El costo de reposición o el VNR son mediciones; las capas al costo conservan su origen para reexpresión. Una capa marcada en moneda de cierre no vuelve a ajustarse.</Callout>
    </div>
}

function FixedAssetsPanel({ bundle }: { bundle: ReportingBundle }) {
    const totals = bundle.statements.fixedAssetsAnnex.totals
    return <div className="preclose-metrics" data-testid="stage-fixed-assets">
        <MetricCard label="Altas del ejercicio" value={money(totals.additions)} detail="Valor de incorporación" />
        <MetricCard label="Depreciación" value={money(totals.periodDepreciation)} detail="Cargo del período" />
        <MetricCard label="Valor residual" value={money(totals.residual)} detail={`${bundle.statements.fixedAssetsAnnex.rows.length} clase(s)`}
            tone={bundle.statements.fixedAssetsAnnex.hasUnclassified ? 'warn' : 'ok'} />
    </div>
}

function InflationPolicyPanel(props: {
    bundle: ReportingBundle
    sets: InflationIndexSet[]
    setId: string
    onSetId: (value: string) => void
    noApplyReason: string
    onNoApplyReason: (value: string) => void
    onSavePolicy: (applicability: 'APLICABLE' | 'NO_APLICABLE') => Promise<void>
    saving: boolean
}) {
    return (
        <SectionCard icon={Scales} title="Conclusión sobre la unidad de medida"
            description="La decisión es independiente de que exista o no una serie cargada.">
            <div className="preclose-policy" data-testid="inflation-policy">
                <div className="preclose-policy-row">
                    <label className="preclose-field"><span>Serie a utilizar si aplica</span>
                        <select value={props.setId} onChange={event => props.onSetId(event.target.value)} data-testid="precierre-set">
                            <option value="">Seleccionar una serie…</option>
                            {props.sets.map(set => <option key={set.id} value={set.id}>{set.name} · {set.status}</option>)}
                        </select>
                    </label>
                    <button className="btn btn-primary btn-sm" disabled={props.saving || !props.setId}
                        onClick={() => void props.onSavePolicy('APLICABLE')}>Confirmar que aplica</button>
                </div>
                <div className="preclose-policy-row">
                    <label className="preclose-field"><span>Motivo verificable si no aplica</span>
                        <textarea rows={2} value={props.noApplyReason} onChange={event => props.onNoApplyReason(event.target.value)}
                            placeholder="Hechos evaluados, conclusión y fuente…" />
                    </label>
                    <button className="btn btn-secondary btn-sm" disabled={props.saving || !props.noApplyReason.trim()}
                        onClick={() => void props.onSavePolicy('NO_APLICABLE')}>Documentar no aplicación</button>
                </div>
            </div>
        </SectionCard>
    )
}

function FinalPanel({ bundle }: { bundle: ReportingBundle }) {
    const impact = bundle.closingImpact
    const rows: Array<[string, keyof typeof impact.before]> = [
        ['Activo', 'assets'], ['Pasivo', 'liabilities'], ['Patrimonio neto', 'equity'],
        ['Resultado', 'result'], ['RECPAM', 'recpam'], ['Efectivo', 'cash'],
    ]
    return (
        <div className="preclose-stage-stack" data-testid="stage-final">
            <SectionCard icon={Scales} title="Impacto antes y después" description="Sólo suma propuestas pendientes; lo contabilizado ya integra la columna Antes.">
                <div className="preclose-impact-table">
                    <div className="preclose-impact-row"><span>Magnitud</span><span>Antes</span><span>Ajustes</span><span>Después</span></div>
                    {rows.map(([label, key]) => <div className="preclose-impact-row" key={key}><span>{label}</span><span>{money(impact.before[key])}</span><span>{money(impact.adjustments[key])}</span><span>{money(impact.after[key])}</span></div>)}
                </div>
            </SectionCard>
            <Verdict tone={bundle.readiness.canPublish && bundle.readiness.canClose ? 'ok' : 'blocked'}
                icon={bundle.readiness.canPublish && bundle.readiness.canClose ? CheckCircle : XCircle}
                title={bundle.readiness.canPublish && bundle.readiness.canClose ? 'Juego conciliado y sin bloqueos automáticos' : 'El juego todavía no puede emitirse o cerrarse'}>
                <p>{bundle.readiness.canPublish && bundle.readiness.canClose
                    ? 'La aprobación final sigue siendo una decisión del responsable; el sistema no la presume.'
                    : `${bundle.readiness.blockers.length} bloqueo(s) y ${bundle.readiness.warnings.length} advertencia(s) permanecen visibles.`}</p>
            </Verdict>
            <button className="btn btn-primary btn-sm" data-testid="ir-al-cierre" disabled={!bundle.readiness.canClose}
                onClick={() => window.location.assign('/configuracion?seccion=ejercicios')}>Ir al cierre del ejercicio</button>
        </div>
    )
}

function pedagogicalAnswer(stage: StageReport, bundle: ReportingBundle): string {
    const specific: Record<ReadinessStage, string> = {
        IDENTIDAD_EJERCICIO: `En ${bundle.metadata.exerciseLabel}, la identidad define quién emite y el período define qué hechos, mediciones y comparativos pertenecen al juego.`,
        INTEGRIDAD_COBERTURA: 'Cada cuenta con actividad debe tener un tratamiento. Las monetarias también se controlan: no se reexpresan, pero integran la exposición que origina el RECPAM.',
        CORTE_DEVENGAMIENTOS: 'El corte separa ejercicios; el devengamiento reconoce los efectos del período aunque todavía no se hayan cobrado o pagado.',
        INVENTARIO_CMV: 'Existencia inicial más compras y producción, menos existencia final, debe explicar el costo de ventas. Medición y reexpresión se aplican en secuencia.',
        BIENES_USO_DEPRECIACIONES: 'El valor residual del anexo debe coincidir con el ESP. Las altas se anticuan desde su origen y la depreciación sigue la base medida en moneda de cierre.',
        MEDICION_RECUPERABILIDAD: 'Primero se aplica la política de medición; después se compara con el valor recuperable cuando corresponde. Deterioro no es revaluación ni ajuste por inflación.',
        UNIDAD_MEDIDA_INFLACION: 'La RT 54 TO RT 59 exige identificar orígenes y usar índice de cierre dividido por índice de origen. Valores corrientes al cierre quedan con coeficiente 1.',
        CONCILIACION_EMISION: 'ESP, ER, EEPN y EFE deben contar la misma historia. El RECPAM se concilia, el efectivo no cambia por una reexpresión y los comparativos usan moneda de cierre actual.',
    }
    return specific[stage.stage]
}

function Meta({ label, value }: { label: string; value: string }) {
    return <div className="preclose-meta"><span>{label}</span><strong title={value}>{value}</strong></div>
}

function MiniRow({ label, value }: { label: string; value: string }) {
    return <div className="preclose-mini-row"><span>{label}</span><strong>{value}</strong></div>
}
