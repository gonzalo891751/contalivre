/**
 * Políticas del Estado de Flujo de Efectivo — Fase 2G §21 + Fase 2G.1 §5.
 *
 * Panel FUNCIONAL de edición (no sólo revisión): clasificación de cada cuenta de
 * efectivo por rol con atributos, políticas de intereses/dividendos/IG/
 * sobregiros, y overrides auditables (listado + revocación). Cada guardado crea
 * una NUEVA versión (versionado) y advierte que puede alterar el EFE. Persiste
 * con `savePolicy` (campos JSON existentes; sin cambio de esquema).
 */

import { useEffect, useMemo, useState } from 'react'
import { getDefaultCompany } from '../../../accounting/application/contextService'
import { getActivePolicy, ensureDefaultPolicy, savePolicy } from '../../../reporting/policy/policyRepository'
import { db } from '../../../storage/db'
import type { Account } from '../../../core/models'
import type { CashAccountClassification, CashFlowPolicy, CashRole } from '../../../reporting/policy/cashFlowPolicy'

const ROLE_LABEL: Record<CashRole, string> = {
    CASH: 'Efectivo (caja)',
    DEMAND_DEPOSIT: 'Depósito a la vista',
    CASH_EQUIVALENT: 'Equivalente de efectivo',
    RESTRICTED_FUND: 'Fondo restringido (no integra el efectivo)',
    NON_EQUIVALENT_INVESTMENT: 'Inversión que no es equivalente',
    OVERDRAFT: 'Sobregiro / adelanto en cuenta corriente',
    EXCLUDED: 'Excluido del efectivo',
}
const ROLES = Object.keys(ROLE_LABEL) as CashRole[]

/** Roles que integran el efectivo y equivalentes (para la validación visual). */
const COUNTS_AS_CASH = new Set<CashRole>(['CASH', 'DEMAND_DEPOSIT', 'CASH_EQUIVALENT'])

export function EfePoliticasPanel() {
    const [saved, setSaved] = useState<CashFlowPolicy | null>(null)
    const [draft, setDraft] = useState<CashFlowPolicy | null>(null)
    const [accounts, setAccounts] = useState<Account[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        const company = await getDefaultCompany()
        const p = await getActivePolicy(company.id)
        setAccounts(await db.accounts.toArray())
        setSaved(p)
        setDraft(p ? structuredClone(p) : null)
        setLoading(false)
    }
    useEffect(() => { void load() }, [])

    const nameOf = useMemo(() => new Map(accounts.map(a => [a.id, `${a.code} ${a.name}`])), [accounts])
    const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])

    const createDefault = async () => {
        const company = await getDefaultCompany()
        await ensureDefaultPolicy(company.id)
        await load()
    }

    const patch = (p: Partial<CashFlowPolicy>) => setDraft(d => (d ? { ...d, ...p } : d))
    const setClassification = (accountId: string, patchC: Partial<CashAccountClassification>) => {
        setDraft(d => {
            if (!d) return d
            const list = [...d.cashClassifications]
            const i = list.findIndex(c => c.accountId === accountId)
            if (i >= 0) list[i] = { ...list[i], ...patchC }
            else list.push({ accountId, role: 'CASH', ...patchC })
            return { ...d, cashClassifications: list }
        })
    }
    const revokeOverride = (id: string) =>
        setDraft(d => (d ? { ...d, overrides: d.overrides.filter(o => o.id !== id) } : d))

    const save = async () => {
        if (!draft) return
        const affected = `${draft.exerciseId ?? 'todos los ejercicios de la empresa'}`
        if (!window.confirm(`Esta modificación puede alterar el Estado de Flujo de Efectivo de ${affected}. Se guardará como una nueva versión de la política. ¿Continuar?`)) return
        await savePolicy({ ...draft, version: draft.version + 1, requiresReview: false, status: 'ACTIVE' })
        setMessage('✓ Política guardada como nueva versión.')
        await load()
    }

    if (loading) return <div className="cfg-panel"><p>Cargando políticas…</p></div>
    if (!draft) {
        return (
            <div className="cfg-panel">
                <h3>Políticas del Estado de Flujo de Efectivo</h3>
                <p style={{ opacity: .8 }}>Todavía no hay una política del EFE para esta empresa.</p>
                <button type="button" className="btn" onClick={createDefault}>Crear política por defecto</button>
            </div>
        )
    }

    // Candidatas a efectivo que aún no están clasificadas
    const classifiedIds = new Set(draft.cashClassifications.map(c => c.accountId))
    const candidates = accounts.filter(a => a.statementGroup === 'CASH_AND_BANKS' && !classifiedIds.has(a.id))
    const equivalents = draft.cashClassifications.filter(c => c.role === 'CASH_EQUIVALENT')
    const cashTotal = draft.cashClassifications.filter(c => COUNTS_AS_CASH.has(c.role)).length

    // Advertencias de equivalentes (§5.B)
    const equivalentWarnings = equivalents.flatMap(c => {
        const w: string[] = []
        const a = c.attributes
        if (!a || a.shortMaturity === false) w.push(`${nameOf.get(c.accountId) ?? c.accountId}: plazo mayor al permitido para un equivalente.`)
        if (a && a.insignificantRisk === false) w.push(`${nameOf.get(c.accountId) ?? c.accountId}: riesgo no insignificante.`)
        if (a && a.restricted) w.push(`${nameOf.get(c.accountId) ?? c.accountId}: tiene restricción de uso.`)
        if (!a) w.push(`${nameOf.get(c.accountId) ?? c.accountId}: faltan datos de liquidez/riesgo/plazo.`)
        return w
    })

    const complete = !draft.requiresReview && equivalentWarnings.length === 0

    return (
        <div className="cfg-panel">
            <h3 style={{ marginBottom: 4 }}>Políticas del Estado de Flujo de Efectivo</h3>
            <p style={{ opacity: .75, fontSize: '.86rem', maxWidth: '62ch' }}>
                Definen qué cuentas integran el efectivo y equivalentes, y cómo se clasifican los intereses,
                dividendos e impuesto a las ganancias. Cada cambio se guarda como una nueva versión y puede alterar el EFE.
            </p>

            {/* Validación visual honesta (§5.I) */}
            <div role="status" style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border,#e2e8f0)', display: 'grid', gap: 4 }}>
                <div><strong>Estado de la política:</strong>{' '}
                    {draft.requiresReview ? '⚠ Requiere revisión (heredada por migración)'
                        : equivalentWarnings.length > 0 ? '⚠ Requiere atención (advertencias abajo)'
                            : '✓ Completa'}
                </div>
                <div style={{ fontSize: '.8rem', opacity: .8 }}>{cashTotal} cuenta(s) integran el efectivo y equivalentes · {draft.overrides.length} override(s).</div>
                {equivalentWarnings.map((w, i) => <div key={i} style={{ fontSize: '.78rem', color: '#b45309' }}>⚠ {w}</div>)}
            </div>

            {/* A + B. Efectivo y equivalentes (editable) */}
            <h4 style={{ marginTop: 16 }}>Efectivo y equivalentes</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {draft.cashClassifications.map(c => (
                    <li key={c.accountId} style={{ border: '1px solid var(--border,#e2e8f0)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 6 }}>
                        <div style={{ fontWeight: 600 }}>{nameOf.get(c.accountId) ?? c.accountId}</div>
                        <label style={{ fontSize: '.82rem' }}>Rol:{' '}
                            <select value={c.role} onChange={e => setClassification(c.accountId, { role: e.target.value as CashRole })}>
                                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                            </select>
                        </label>
                        {c.role === 'CASH_EQUIVALENT' && (
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.78rem' }}>
                                <label><input type="checkbox" checked={!!c.attributes?.highLiquidity} onChange={e => setClassification(c.accountId, { attributes: { ...c.attributes, highLiquidity: e.target.checked } })} /> Alta liquidez</label>
                                <label><input type="checkbox" checked={!!c.attributes?.insignificantRisk} onChange={e => setClassification(c.accountId, { attributes: { ...c.attributes, insignificantRisk: e.target.checked } })} /> Riesgo insignificante</label>
                                <label><input type="checkbox" checked={!!c.attributes?.shortMaturity} onChange={e => setClassification(c.accountId, { attributes: { ...c.attributes, shortMaturity: e.target.checked } })} /> Vence ≤ 3 meses</label>
                                <label><input type="checkbox" checked={!!c.attributes?.restricted} onChange={e => setClassification(c.accountId, { attributes: { ...c.attributes, restricted: e.target.checked } })} /> Restringido</label>
                            </div>
                        )}
                        <input
                            type="text" placeholder="Fundamento (opcional)" value={c.justification ?? ''}
                            onChange={e => setClassification(c.accountId, { justification: e.target.value })}
                            style={{ fontSize: '.78rem', width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border,#e2e8f0)' }}
                        />
                    </li>
                ))}
            </ul>
            {candidates.length > 0 && (
                <div style={{ marginTop: 8, fontSize: '.82rem' }}>
                    Agregar cuenta:{' '}
                    <select defaultValue="" onChange={e => { if (e.target.value) setClassification(e.target.value, { role: 'CASH' }) }}>
                        <option value="">— elegir cuenta de Caja y Bancos —</option>
                        {candidates.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                </div>
            )}

            {/* C-F. Intereses, dividendos, IG y sobregiros (editable) */}
            <h4 style={{ marginTop: 16 }}>Intereses, dividendos, impuesto y sobregiros</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,auto) 1fr', gap: '8px 14px', fontSize: '.84rem', alignItems: 'center' }}>
                <span style={{ opacity: .7 }}>Intereses pagados</span>
                <select value={draft.interestsPaid} onChange={e => patch({ interestsPaid: e.target.value as CashFlowPolicy['interestsPaid'] })}>
                    <option value="OPERATING">Actividades operativas</option><option value="FINANCING">Actividades de financiación</option>
                </select>
                <span style={{ opacity: .7 }}>Intereses cobrados</span>
                <select value={draft.interestsReceived} onChange={e => patch({ interestsReceived: e.target.value as CashFlowPolicy['interestsReceived'] })}>
                    <option value="OPERATING">Actividades operativas</option><option value="INVESTING">Actividades de inversión</option>
                </select>
                <span style={{ opacity: .7 }}>Dividendos pagados</span>
                <select value={draft.dividendsPaid} onChange={e => patch({ dividendsPaid: e.target.value as CashFlowPolicy['dividendsPaid'] })}>
                    <option value="FINANCING">Actividades de financiación</option><option value="OPERATING">Actividades operativas (si la política lo permite)</option>
                </select>
                <span style={{ opacity: .7 }}>Dividendos cobrados</span>
                <select value={draft.dividendsReceived} onChange={e => patch({ dividendsReceived: e.target.value as CashFlowPolicy['dividendsReceived'] })}>
                    <option value="OPERATING">Actividades operativas</option><option value="INVESTING">Actividades de inversión</option>
                </select>
                <span style={{ opacity: .7 }}>Impuesto a las ganancias</span>
                <select value={draft.incomeTax} onChange={e => patch({ incomeTax: e.target.value as CashFlowPolicy['incomeTax'] })}>
                    <option value="OPERATING">Operativo por defecto</option><option value="SPECIFIC">Operativo con asociación específica</option>
                </select>
                <span style={{ opacity: .7 }}>Sobregiros</span>
                <select value={draft.overdrafts} onChange={e => patch({ overdrafts: e.target.value as CashFlowPolicy['overdrafts'] })}>
                    <option value="CASH_COMPONENT">Componente del efectivo</option><option value="FINANCING">Pasivo de financiación</option>
                </select>
            </div>

            {/* G. Overrides (listado + revocación) */}
            <h4 style={{ marginTop: 16 }}>Ajustes manuales (overrides)</h4>
            {draft.overrides.length === 0
                ? <p style={{ fontSize: '.84rem', opacity: .8 }}>No hay overrides. Toda clasificación surge de la política y del mapping de cuentas.</p>
                : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                        <thead><tr style={{ textAlign: 'left', opacity: .7 }}><th>Objetivo</th><th>Actividad</th><th>Motivo</th><th>Vigencia</th><th>Ver.</th><th></th></tr></thead>
                        <tbody>
                            {draft.overrides.map(o => (
                                <tr key={o.id} style={{ borderTop: '1px solid var(--border,#e2e8f0)' }}>
                                    <td>{o.target}: {o.targetId}</td>
                                    <td>{o.classification}{o.assignedCents != null ? ` (asignado ${(o.assignedCents / 100).toFixed(2)})` : ''}</td>
                                    <td>{o.reason}</td>
                                    <td>{o.validFrom ?? '—'} → {o.validTo ?? '—'}</td>
                                    <td>{o.version}</td>
                                    <td><button type="button" className="btn btn-sm" style={{ color: '#b91c1c' }} onClick={() => revokeOverride(o.id)}>Revocar</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

            {/* H-J. Guardado versionado con advertencia de impacto */}
            <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" className="btn btn-primary" disabled={!dirty} onClick={save}>Guardar como nueva versión</button>
                {dirty && <button type="button" className="btn" onClick={() => setDraft(saved ? structuredClone(saved) : null)}>Cancelar cambios</button>}
                <span style={{ fontSize: '.72rem', opacity: .55 }}>
                    Política v{draft.version} · {complete ? 'completa' : 'requiere revisión'} · fuente: {draft.source}
                </span>
            </div>
            {message && <p style={{ fontSize: '.8rem', color: '#15803d', marginTop: 6 }}>{message}</p>}
            <p style={{ fontSize: '.72rem', opacity: .55, marginTop: 8 }}>
                Guardar aplica desde el período actual. Los snapshots validados históricos no se modifican; para aplicar
                retroactivamente, editá la vigencia (validFrom) del cambio con confirmación explícita.
            </p>
        </div>
    )
}
