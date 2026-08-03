/**
 * Mediciones a valores corrientes al cierre — Fase 2J §7.
 *
 * El recorrido que la pantalla tiene que dejar claro es:
 *
 *   Medición anterior → Medición al cierre → Diferencia → Resultado reconocido
 *   → Asiento → Impacto en los estados
 *
 * El asiento se PROPONE y se muestra completo antes de contabilizarse. Nunca se
 * genera solo, y siempre se puede revertir con un motivo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../storage/db'
import {
    listMeasurements, postMeasurement, previewMeasurementEntry,
    reverseMeasurement, saveMeasurement,
} from '../../reporting/measurement/measurementService'
import {
    CRITERION_LABEL, RUBRO_LABEL,
    type ClosingMeasurement, type MeasurementCriterion, type PendingMeasurement,
} from '../../reporting/measurement/measurementTypes'
import type { Account } from '../../core/models'
import { allowedMeasurementCriteria, calculateRecoverability } from '../../reporting/measurement/measurementPolicy'
import { savePolicyDecision } from '../../reporting/closing/closingWorkPaperService'
import { generateId } from '../../storage/db'
import { LOCAL_ACTOR } from '../../accounting/domain/types'
import type { MeasurementDestination } from '../../reporting/closing/closingWorkPaperTypes'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export interface MedicionesPanelProps {
    companyId: string
    exerciseId: string
    closingDate: string
    pending: PendingMeasurement[]
    /** saldo contable de cada cuenta al cierre */
    balances: Map<string, number>
    onChanged: () => void | Promise<void>
}

export function MedicionesPanel(props: MedicionesPanelProps) {
    const [measurements, setMeasurements] = useState<ClosingMeasurement[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [editing, setEditing] = useState<PendingMeasurement | null>(null)
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
    const [busy, setBusy] = useState(false)

    const reload = useCallback(async () => {
        const [list, accs] = await Promise.all([
            listMeasurements(props.exerciseId).catch(() => []),
            db.accounts.toArray(),
        ])
        setMeasurements(list)
        setAccounts(accs)
    }, [props.exerciseId])

    useEffect(() => { void reload() }, [reload])

    const holdingAccounts = useMemo(
        () => accounts.filter(a => (a.kind === 'INCOME' || a.kind === 'EXPENSE') && !a.isHeader
            && (a.statementGroup === 'FINANCIAL_INCOME' || a.statementGroup === 'FINANCIAL_EXPENSES'
                || a.statementGroup === 'OTHER_INCOME' || a.statementGroup === 'OTHER_EXPENSES')),
        [accounts],
    )

    if (props.pending.length === 0 && measurements.length === 0) {
        return (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Ninguna partida de este ejercicio exige medición a valores corrientes al cierre.
                La exigencia sale de la política declarada de cada cuenta en el plan de cuentas,
                no de una regla general: aplicar valores corrientes donde no corresponde sería tan
                incorrecto como omitirlos donde sí.
            </p>
        )
    }

    return (
        <div data-testid="mediciones-panel">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Estas partidas se miden al cierre según la política declarada para su rubro. La
                medición no es una reexpresión: cambia el importe porque cambió el valor del bien,
                y por eso la partida queda expresada en moneda de cierre y no vuelve a multiplicarse
                por un coeficiente.
            </p>

            {props.pending.length > 0 && (
                <div className="card" role="alert" data-testid="mediciones-pendientes"
                    style={{ padding: 12, marginBottom: 14, borderLeft: '4px solid #f59e0b' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#a16207' }}>
                        {props.pending.length} partida(s) pendiente(s) de medir
                    </strong>
                    <table style={{ width: '100%', fontSize: '0.78rem', marginTop: 8, borderCollapse: 'collapse' }}>
                        <tbody>
                            {props.pending.map(p => (
                                <tr key={p.accountId} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '5px 0' }}>
                                        <strong>{p.accountCode}</strong> {p.accountName}
                                        <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{RUBRO_LABEL[p.rubro]}</div>
                                    </td>
                                    <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {money(p.balance)}
                                    </td>
                                    <td style={{ padding: '5px 0', textAlign: 'right' }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => setEditing(p)}
                                            data-testid={`medir-${p.accountCode}`}>
                                            Medir al cierre
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <FormularioMedicion
                    pending={editing}
                    closingDate={props.closingDate}
                    previousAmount={props.balances.get(editing.accountId) ?? editing.balance}
                    holdingAccounts={holdingAccounts}
                    accounts={accounts}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={async (values) => {
                        setBusy(true); setMessage(null)
                        try {
                            const account = accounts.find(a => a.id === editing.accountId)!
                            const now = new Date().toISOString()
                            const policyDecision = {
                                id: generateId(),
                                accountId: account.id,
                                rubro: editing.rubro,
                                accountKind: account.kind,
                                normalSide: account.normalSide,
                                destination: values.destination,
                                criterion: values.criterion,
                                entityCategory: 'PEQUENA' as const,
                                marketAvailable: values.marketAvailable,
                                reliableDataAvailable: values.reliableDataAvailable,
                                material: true,
                                rationale: values.policyRationale,
                                normativeSource: 'RT 54, texto ordenado por RT 59 — política por rubro y recuperabilidad.',
                                source: values.source,
                                effectiveAt: props.closingDate,
                                selectedBy: LOCAL_ACTOR,
                                selectedAt: now,
                            }
                            await savePolicyDecision(props.companyId, props.exerciseId, policyDecision)
                            const recoverability = values.recoverabilityRequired && values.recoverableAmount !== undefined
                                ? calculateRecoverability({
                                    required: true,
                                    level: 'ACTIVO_INDIVIDUAL',
                                    basis: 'VNR',
                                    accountingAmount: values.closingAmount,
                                    netRealizableValue: values.recoverableAmount,
                                    evidence: values.recoverabilityEvidence || values.evidence || values.source,
                                })
                                : undefined
                            const finalAmount = recoverability
                                ? values.closingAmount - recoverability.impairmentLoss + recoverability.reversal
                                : values.closingAmount
                            const saved = await saveMeasurement({
                                companyId: props.companyId,
                                exerciseId: props.exerciseId,
                                measuredAt: props.closingDate,
                                rubro: editing.rubro,
                                account,
                                criterion: values.criterion,
                                entityCategory: 'PEQUENA',
                                destination: values.destination,
                                marketAvailable: values.marketAvailable,
                                reliableDataAvailable: values.reliableDataAvailable,
                                policyDecision,
                                previousAmount: values.previousAmount,
                                previousIsRestated: values.previousIsRestated,
                                closingAmount: finalAmount,
                                unitValue: values.unitValue,
                                quantity: values.quantity,
                                source: values.source,
                                sourceUrl: values.sourceUrl,
                                evidence: values.evidence,
                                market: values.market,
                                method: values.method,
                                assumptions: values.assumptions,
                                recoverableAmount: values.recoverableAmount,
                                recoverability,
                                holdingResultAccountId: values.holdingAccountId,
                                responsible: values.responsible,
                                notes: values.notes,
                            })
                            setEditing(null)
                            await reload()
                            setMessage({
                                kind: 'ok',
                                text: `Medición guardada como propuesta. Diferencia ${money(saved.difference)}: revisá el asiento antes de contabilizarlo.`,
                            })
                        } catch (e) {
                            setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
                        } finally { setBusy(false) }
                    }}
                />
            )}

            {measurements.length > 0 && (
                <div style={{ display: 'grid', gap: 12 }}>
                    {measurements.map(m => (
                        <TarjetaMedicion
                            key={m.id}
                            measurement={m}
                            accounts={accounts}
                            holdingAccounts={holdingAccounts}
                            busy={busy}
                            onPost={async (holdingId) => {
                                setBusy(true); setMessage(null)
                                try {
                                    await postMeasurement(m.id, holdingId)
                                    await reload(); await props.onChanged()
                                    setMessage({ kind: 'ok', text: 'Resultado por tenencia contabilizado.' })
                                } catch (e) {
                                    setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
                                } finally { setBusy(false) }
                            }}
                            onReverse={async (reason) => {
                                setBusy(true); setMessage(null)
                                try {
                                    await reverseMeasurement(m.id, reason)
                                    await reload(); await props.onChanged()
                                    setMessage({ kind: 'ok', text: 'Medición revertida; queda como antecedente.' })
                                } catch (e) {
                                    setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
                                } finally { setBusy(false) }
                            }}
                        />
                    ))}
                </div>
            )}

            {message && (
                <div className="card" role="status" style={{
                    padding: 12, marginTop: 12, fontSize: '0.83rem',
                    borderLeft: `4px solid ${message.kind === 'ok' ? '#22c55e' : '#ef4444'}`,
                }}>{message.text}</div>
            )}
        </div>
    )
}

interface FormValues {
    criterion: MeasurementCriterion
    previousAmount: number
    previousIsRestated: boolean
    closingAmount: number
    destination: MeasurementDestination
    marketAvailable: boolean
    reliableDataAvailable: boolean
    policyRationale: string
    quantity?: number
    unitValue?: number
    source: string
    sourceUrl?: string
    evidence?: string
    market?: string
    method?: string
    assumptions?: string
    recoverableAmount?: number
    recoverabilityRequired: boolean
    recoverabilityEvidence?: string
    holdingAccountId?: string
    responsible?: string
    notes?: string
}

function FormularioMedicion({ pending, closingDate, previousAmount, holdingAccounts, accounts, busy, onCancel, onSave }: {
    pending: PendingMeasurement
    closingDate: string
    previousAmount: number
    holdingAccounts: Account[]
    accounts: Account[]
    busy: boolean
    onCancel: () => void
    onSave: (v: FormValues) => void | Promise<void>
}) {
    const account = accounts.find(candidate => candidate.id === pending.accountId)!
    const defaultDestination: MeasurementDestination = pending.rubro === 'BIENES_DE_CAMBIO'
        ? 'VENTA' : pending.rubro === 'CREDITOS_Y_DEUDAS' ? 'COBRO_PAGO'
            : pending.rubro === 'BIENES_DE_USO_REVALUADOS' ? 'USO' : 'NEGOCIACION'
    const [v, setV] = useState<FormValues>({
        criterion: 'COSTO_REPOSICION',
        previousAmount,
        previousIsRestated: false,
        closingAmount: previousAmount,
        destination: defaultDestination,
        marketAvailable: true,
        reliableDataAvailable: true,
        policyRationale: '',
        source: '',
        recoverabilityRequired: false,
        holdingAccountId: holdingAccounts[0]?.id,
    })
    const criteria = useMemo(() => allowedMeasurementCriteria({
        entityCategory: 'PEQUENA', rubro: pending.rubro, account,
        destination: v.destination, marketAvailable: v.marketAvailable,
        reliableDataAvailable: v.reliableDataAvailable,
    }), [pending.rubro, account, v.destination, v.marketAvailable, v.reliableDataAvailable])
    useEffect(() => {
        if (criteria.length > 0 && !criteria.some(rule => rule.criterion === v.criterion)) {
            setV(current => ({ ...current, criterion: criteria[0].criterion }))
        }
    }, [criteria, v.criterion])
    const finalAmount = v.recoverabilityRequired && v.recoverableAmount !== undefined
        ? Math.min(v.closingAmount, v.recoverableAmount) : v.closingAmount
    const diferencia = finalAmount - v.previousAmount

    return (
        <div className="card" style={{ padding: 16, marginBottom: 14, borderLeft: '4px solid #2563eb' }} data-testid="medicion-formulario">
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 2px' }}>
                Medir {pending.accountCode} {pending.accountName}
            </h4>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '0 0 12px' }}>
                {RUBRO_LABEL[pending.rubro]} · medición al {closingDate.split('-').reverse().join('/')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Campo label="Criterio de medición">
                    <select value={v.criterion} onChange={e => setV({ ...v, criterion: e.target.value as MeasurementCriterion })}
                        style={input} data-testid="medicion-criterio">
                        {criteria.map(rule => (
                            <option key={rule.criterion} value={rule.criterion}>{CRITERION_LABEL[rule.criterion]}</option>
                        ))}
                    </select>
                </Campo>
                <Campo label="Destino de la partida">
                    <select value={v.destination} onChange={e => setV({ ...v, destination: e.target.value as MeasurementDestination })} style={input}>
                        <option value="USO">Uso</option><option value="VENTA">Venta</option>
                        <option value="NEGOCIACION">Negociación</option><option value="COBRO_PAGO">Cobro o pago</option>
                        <option value="INVERSION">Inversión</option><option value="NO_DEFINIDO">A definir</option>
                    </select>
                </Campo>
                <Campo label="Medición anterior (importe contable)">
                    <input type="number" step="0.01" value={v.previousAmount}
                        onChange={e => setV({ ...v, previousAmount: Number(e.target.value) })} style={input} />
                </Campo>
                <Campo label="Medición al cierre">
                    <input type="number" step="0.01" value={v.closingAmount}
                        onChange={e => setV({ ...v, closingAmount: Number(e.target.value) })} style={input}
                        data-testid="medicion-cierre" />
                </Campo>
                <Campo label="Valor recuperable (opcional)">
                    <input type="number" step="0.01" value={v.recoverableAmount ?? ''}
                        onChange={e => setV({ ...v, recoverableAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                        style={input} />
                </Campo>
                <Campo label="Base anterior">
                    <label style={{ display: 'flex', gap: 7, alignItems: 'center', minHeight: 38, fontSize: '0.78rem' }}>
                        <input type="checkbox" checked={v.previousIsRestated} onChange={e => setV({ ...v, previousIsRestated: e.target.checked })} />
                        Ya estaba expresada en moneda de cierre
                    </label>
                </Campo>
                <Campo label="Datos para la política">
                    <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: '0.76rem' }}><input type="checkbox" checked={v.marketAvailable} onChange={e => setV({ ...v, marketAvailable: e.target.checked })} />Mercado disponible</label>
                    <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: '0.76rem' }}><input type="checkbox" checked={v.reliableDataAvailable} onChange={e => setV({ ...v, reliableDataAvailable: e.target.checked })} />Datos fiables</label>
                </Campo>
                <Campo label="Cantidad (opcional)">
                    <input type="number" step="0.0001" value={v.quantity ?? ''}
                        onChange={e => setV({ ...v, quantity: e.target.value === '' ? undefined : Number(e.target.value) })} style={input} />
                </Campo>
                <Campo label="Valor unitario (opcional)">
                    <input type="number" step="0.01" value={v.unitValue ?? ''}
                        onChange={e => setV({ ...v, unitValue: e.target.value === '' ? undefined : Number(e.target.value) })} style={input} />
                </Campo>
                <Campo label="Fuente del valor">
                    <input value={v.source} onChange={e => setV({ ...v, source: e.target.value })} style={input}
                        placeholder="Lista de precios, cotización, tasación…" data-testid="medicion-fuente" />
                </Campo>
                <Campo label="Referencia o URL (opcional)">
                    <input value={v.sourceUrl ?? ''} onChange={e => setV({ ...v, sourceUrl: e.target.value })} style={input} />
                </Campo>
                <Campo label="Mercado considerado (opcional)">
                    <input value={v.market ?? ''} onChange={e => setV({ ...v, market: e.target.value })} style={input} />
                </Campo>
                <Campo label="Documento de respaldo (opcional)">
                    <input value={v.evidence ?? ''} onChange={e => setV({ ...v, evidence: e.target.value })} style={input} />
                </Campo>
                <Campo label="Resultado por tenencia — cuenta">
                    <select value={v.holdingAccountId ?? ''} onChange={e => setV({ ...v, holdingAccountId: e.target.value })}
                        style={input} data-testid="medicion-cuenta-tenencia">
                        {holdingAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                </Campo>
                <Campo label="Responsable (opcional)">
                    <input value={v.responsible ?? ''} onChange={e => setV({ ...v, responsible: e.target.value })} style={input} />
                </Campo>
            </div>

            <Campo label="Fundamento de la política seleccionada">
                <textarea rows={2} value={v.policyRationale} onChange={e => setV({ ...v, policyRationale: e.target.value })}
                    style={{ ...input, resize: 'vertical' }} placeholder="Por qué este criterio corresponde a este rubro, destino y evidencia…" />
            </Campo>

            <label style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10, fontSize: '0.8rem', fontWeight: 600 }}>
                <input type="checkbox" checked={v.recoverabilityRequired} onChange={e => setV({ ...v, recoverabilityRequired: e.target.checked })} />
                Corresponde evaluar recuperabilidad
            </label>
            {v.recoverabilityRequired && (
                <Campo label="Evidencia de recuperabilidad">
                    <input value={v.recoverabilityEvidence ?? ''} onChange={e => setV({ ...v, recoverabilityEvidence: e.target.value })}
                        style={input} placeholder="Indicadores, cálculo y documento de respaldo…" />
                </Campo>
            )}

            <Campo label="Método y supuestos (opcional)">
                <textarea rows={2} value={v.assumptions ?? ''} onChange={e => setV({ ...v, assumptions: e.target.value })}
                    style={{ ...input, resize: 'vertical' }} />
            </Campo>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
                <Recorrido label="Medición anterior" value={money(v.previousAmount)} />
                <span style={{ color: '#cbd5e1' }}>→</span>
                <Recorrido label="Medición al cierre" value={money(finalAmount)} />
                <span style={{ color: '#cbd5e1' }}>→</span>
                <Recorrido label="Diferencia" value={money(diferencia)}
                    accent={diferencia === 0 ? '#64748b' : diferencia > 0 ? '#15803d' : '#b91c1c'} />
                <span style={{ color: '#cbd5e1' }}>→</span>
                <Recorrido label="Resultado a reconocer"
                    value={diferencia === 0 ? 'Sin resultado' : diferencia > 0 ? 'Ganancia por tenencia' : 'Pérdida por tenencia'} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy || !v.source.trim() || !v.policyRationale.trim()
                    || (v.recoverabilityRequired && (v.recoverableAmount === undefined || !v.recoverabilityEvidence?.trim()))}
                    onClick={() => void onSave(v)} data-testid="medicion-guardar">
                    Guardar como propuesta
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onCancel}>Cancelar</button>
            </div>
        </div>
    )
}

function TarjetaMedicion({ measurement, accounts, holdingAccounts, busy, onPost, onReverse }: {
    measurement: ClosingMeasurement
    accounts: Account[]
    holdingAccounts: Account[]
    busy: boolean
    onPost: (holdingAccountId: string) => void | Promise<void>
    onReverse: (reason: string) => void | Promise<void>
}) {
    const [holdingId, setHoldingId] = useState(measurement.holdingResultAccountId ?? holdingAccounts[0]?.id ?? '')
    const [reason, setReason] = useState('')
    const [confirmReverse, setConfirmReverse] = useState(false)

    const holding = accounts.find(a => a.id === holdingId)
    const preview = holding ? previewMeasurementEntry(measurement, holding) : null

    const chip = measurement.status === 'CONTABILIZADA'
        ? { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Contabilizada' }
        : measurement.status === 'REVERTIDA'
            ? { bg: 'rgba(148,163,184,0.18)', color: '#475569', label: 'Revertida' }
            : { bg: 'rgba(37,99,235,0.10)', color: '#1d4ed8', label: 'Propuesta' }

    return (
        <div className="card" style={{ padding: 14 }} data-testid={`medicion-${measurement.accountCode}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                    <strong style={{ fontSize: '0.9rem' }}>{measurement.accountCode} {measurement.accountName}</strong>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        {RUBRO_LABEL[measurement.rubro]} · {CRITERION_LABEL[measurement.criterion]}
                    </div>
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: chip.bg, color: chip.color, alignSelf: 'flex-start' }}>
                    {chip.label}
                </span>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
                <Recorrido label="Anterior" value={money(measurement.previousAmount)} />
                <span style={{ color: '#cbd5e1' }}>→</span>
                <Recorrido label="Al cierre" value={money(measurement.closingAmount)} />
                <span style={{ color: '#cbd5e1' }}>→</span>
                <Recorrido label="Diferencia" value={money(measurement.difference)}
                    accent={measurement.difference >= 0 ? '#15803d' : '#b91c1c'} />
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 10 }}>
                Fuente: {measurement.source}
                {measurement.market && ` · Mercado: ${measurement.market}`}
                {measurement.evidence && ` · Respaldo: ${measurement.evidence}`}
                {measurement.recoverableAmount != null && ` · Valor recuperable: ${money(measurement.recoverableAmount)}`}
            </div>

            {preview && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                        Asiento propuesto · {preview.memo}
                    </div>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                        <tbody>
                            {preview.lines.map((l, i) => (
                                <tr key={i}>
                                    <td style={{ padding: '3px 0' }}>{l.accountCode} {l.accountName}</td>
                                    <td style={{ padding: '3px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {l.debit > 0 ? money(l.debit) : ''}
                                    </td>
                                    <td style={{ padding: '3px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {l.credit > 0 ? money(l.credit) : ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {measurement.status === 'PROPUESTA' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={holdingId} onChange={e => setHoldingId(e.target.value)} style={{ ...input, width: 'auto' }}>
                        {holdingAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" disabled={busy || !holdingId}
                        onClick={() => void onPost(holdingId)} data-testid={`contabilizar-${measurement.accountCode}`}>
                        Contabilizar el resultado por tenencia
                    </button>
                </div>
            )}

            {measurement.status === 'CONTABILIZADA' && (
                confirmReverse ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo de la reversión"
                            style={{ ...input, width: 'auto', minWidth: 240 }} />
                        <button className="btn btn-danger btn-sm" disabled={busy || !reason.trim()}
                            onClick={() => void onReverse(reason)}>Confirmar reversión</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setConfirmReverse(false)}>Cancelar</button>
                    </div>
                ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirmReverse(true)}>Revertir…</button>
                )
            )}
        </div>
    )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
            {label}
            {children}
        </label>
    )
}

function Recorrido({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div>
            <div style={{ fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: accent ?? '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    )
}

const input: React.CSSProperties = {
    padding: '7px 9px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
    fontSize: '0.82rem', fontWeight: 400, color: '#0f172a', width: '100%',
}
