/**
 * ExpenseAllocationEditor — Fase 2F (§7): editor visual de reglas de
 * distribución de gastos entre funciones.
 *
 * Configuración → Plan de cuentas y mapeos → Distribución de gastos.
 * Crea/versiona reglas (DRAFT editable, ACTIVE inmutable con vigencia),
 * valida 100 % exacto y superposiciones, previsualiza el impacto sobre el
 * gasto del período y muestra el historial. La distribución modifica la
 * EXPOSICIÓN del anexo de gastos; el Diario no se toca.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../../storage/db'
import { usePeriodYear } from '../../../hooks/usePeriodYear'
import {
    createRule,
    deleteDraftRule,
    endRuleValidity,
    isAllocatableAccount,
    listRules,
    updateDraftRule,
    validateRuleInput,
    type AllocationRuleInput,
} from '../../../accounting/taxonomy/allocationRulesService'
import { RESULT_FUNCTION_LABEL, deriveResultFunction } from '../../../reporting/engine/expensesByFunction'
import type { Account, ExpenseAllocationRule, ResultFunction } from '../../../core/models'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FUNCTIONS: ResultFunction[] = ['ADMINISTRATION', 'SELLING', 'PRODUCTION', 'FINANCIAL', 'OTHER']

interface DraftAllocation { function: ResultFunction; percentage: string }

const EMPTY_FORM = {
    validFrom: '',
    validTo: '',
    reason: '',
    allocations: [{ function: 'ADMINISTRATION', percentage: '60' }, { function: 'SELLING', percentage: '40' }] as DraftAllocation[],
}

export function ExpenseAllocationEditor() {
    const { year } = usePeriodYear()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [rules, setRules] = useState<ExpenseAllocationRule[]>([])
    const [accountId, setAccountId] = useState('')
    const [balance, setBalance] = useState<number | null>(null)
    const [form, setForm] = useState({ ...EMPTY_FORM, validFrom: `${year}-01-01` })
    const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
    const [supersedesId, setSupersedesId] = useState<string | undefined>(undefined)
    const [errors, setErrors] = useState<string[]>([])
    const [message, setMessage] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const reload = useCallback(() => {
        db.accounts.toArray().then(all => setAccounts(all.filter(a => isAllocatableAccount(a)).sort((a, b) => a.code.localeCompare(b.code))))
        listRules().then(setRules)
    }, [])
    useEffect(reload, [reload])

    // saldo del período seleccionado (solo informativo para la vista previa)
    useEffect(() => {
        if (!accountId) { setBalance(null); return }
        let cancelled = false
        db.entries.where('date').between(`${year}-01-01`, `${year}-12-31`, true, true).toArray().then(entries => {
            if (cancelled) return
            let cents = 0
            for (const e of entries) {
                if (e.status === 'DRAFT') continue
                for (const l of e.lines) {
                    if (l.accountId !== accountId) continue
                    cents += Math.round((l.debit || 0) * 100) - Math.round((l.credit || 0) * 100)
                }
            }
            setBalance(cents / 100)
        })
        return () => { cancelled = true }
    }, [accountId, year, rules])

    const account = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId])
    const accountRules = useMemo(() =>
        rules.filter(r => r.accountId === accountId).sort((a, b) => b.version - a.version),
    [rules, accountId])

    const sumPct = useMemo(() =>
        form.allocations.reduce((s, a) => s + (Math.round(Number(a.percentage || 0) * 100) || 0), 0) / 100,
    [form.allocations])

    const buildInput = (status: 'DRAFT' | 'ACTIVE'): AllocationRuleInput => ({
        accountId,
        validFrom: form.validFrom,
        validTo: form.validTo || undefined,
        allocations: form.allocations
            .filter(a => a.percentage !== '')
            .map(a => ({ function: a.function, percentage: Number(a.percentage) })),
        reason: form.reason,
        status,
        supersedesId,
    })

    const resetForm = () => {
        setForm({ ...EMPTY_FORM, validFrom: `${year}-01-01` })
        setEditingDraftId(null)
        setSupersedesId(undefined)
        setErrors([])
    }

    const save = async (status: 'DRAFT' | 'ACTIVE') => {
        setBusy(true)
        setMessage(null)
        try {
            const input = buildInput(status)
            const validation = await validateRuleInput(input, editingDraftId ?? undefined)
            if (validation.length > 0) {
                setErrors(validation.map(v => v.message))
                return
            }
            if (editingDraftId) await updateDraftRule(editingDraftId, input)
            else await createRule(input)
            setMessage(status === 'ACTIVE' ? '✓ Regla activa guardada (versionada y auditada).' : '✓ Borrador guardado (el motor no lo aplica).')
            resetForm()
            reload()
        } catch (e) {
            setErrors([e instanceof Error ? e.message : String(e)])
        } finally {
            setBusy(false)
        }
    }

    const loadIntoForm = (rule: ExpenseAllocationRule, mode: 'edit-draft' | 'duplicate' | 'supersede') => {
        setForm({
            validFrom: mode === 'supersede' ? '' : rule.validFrom,
            validTo: rule.validTo ?? '',
            reason: mode === 'edit-draft' ? rule.reason : '',
            allocations: rule.allocations.map(a => ({ function: a.function, percentage: String(a.percentage) })),
        })
        setEditingDraftId(mode === 'edit-draft' ? rule.id : null)
        setSupersedesId(mode === 'supersede' ? rule.id : undefined)
        setErrors([])
        setMessage(mode === 'supersede'
            ? 'Versionado: la regla anterior se cierra automáticamente el día previo a la nueva vigencia.'
            : null)
    }

    const setAlloc = (i: number, patch: Partial<DraftAllocation>) =>
        setForm(f => ({ ...f, allocations: f.allocations.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))

    return (
        <div className="card" style={{ padding: 16, marginTop: 20 }} data-testid="allocation-editor">
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Distribución de gastos entre funciones</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px', lineHeight: 1.5 }}>
                Reglas versionadas que reparten un gasto entre funciones en el anexo (suma exacta 100 %).
                Modifican la <strong>exposición</strong>, nunca el Diario. Las reglas activas son inmutables:
                para cambiarlas se crea una versión nueva y la anterior cierra su vigencia.
            </p>

            <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                    Cuenta de gasto
                    <select value={accountId} onChange={e => { setAccountId(e.target.value); resetForm() }} data-testid="alloc-account">
                        <option value="">— elegí una cuenta —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                </label>

                {account && (
                    <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>Función actual: <strong>{RESULT_FUNCTION_LABEL[deriveResultFunction(account) ?? 'OTHER']}</strong></span>
                        <span>Gasto del período {year}: <strong data-testid="alloc-balance">{balance == null ? '…' : `$ ${nf.format(balance)}`}</strong></span>
                    </div>
                )}

                {account && (
                    <>
                        <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                            <legend style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', padding: '0 6px' }}>FUNCIONES Y PORCENTAJES</legend>
                            {form.allocations.map((a, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                    <select value={a.function} onChange={e => setAlloc(i, { function: e.target.value as ResultFunction })}>
                                        {FUNCTIONS.map(f => <option key={f} value={f}>{RESULT_FUNCTION_LABEL[f]}</option>)}
                                    </select>
                                    <input
                                        type="number" min={0.01} max={100} step={0.01} value={a.percentage}
                                        onChange={e => setAlloc(i, { percentage: e.target.value })}
                                        style={{ width: 90 }} aria-label={`Porcentaje ${RESULT_FUNCTION_LABEL[a.function]}`}
                                    />
                                    <span style={{ fontSize: '0.8rem' }}>%</span>
                                    {balance != null && a.percentage !== '' && (
                                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                            → $ {nf.format((balance * Number(a.percentage)) / 100)}
                                        </span>
                                    )}
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, allocations: f.allocations.filter((_, j) => j !== i) }))} aria-label="Quitar función">✕</button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, allocations: [...f.allocations, { function: 'OTHER', percentage: '' }] }))}>
                                + Agregar función
                            </button>
                            <div style={{ marginTop: 8, fontSize: '0.82rem', fontWeight: 700, color: sumPct === 100 ? '#047857' : '#b91c1c' }} data-testid="alloc-sum">
                                Total: {nf.format(sumPct)} % {sumPct === 100 ? '✓' : '(debe ser exactamente 100 %)'}
                            </div>
                        </fieldset>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                                Vigencia desde
                                <input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} data-testid="alloc-from" />
                            </label>
                            <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                                Vigencia hasta (opcional)
                                <input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} />
                            </label>
                        </div>

                        <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
                            Motivo (auditado)
                            <input
                                type="text" value={form.reason} placeholder="p. ej. superficie ocupada por cada área"
                                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                data-testid="alloc-reason"
                            />
                        </label>

                        {balance != null && sumPct === 100 && (
                            <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem' }} data-testid="alloc-preview">
                                <strong>Vista previa ({year}):</strong> gasto total $ {nf.format(balance)}
                                {form.allocations.filter(a => a.percentage !== '').map(a => (
                                    <div key={a.function} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {RESULT_FUNCTION_LABEL[a.function]} {a.percentage} %: $ {nf.format((balance * Number(a.percentage)) / 100)}
                                    </div>
                                ))}
                                <div style={{ color: '#64748b', marginTop: 4 }}>Se modifica la exposición del anexo; el Diario no cambia.</div>
                            </div>
                        )}

                        {errors.length > 0 && (
                            <div role="alert" style={{ color: '#b91c1c', fontSize: '0.8rem' }} data-testid="alloc-errors">
                                {errors.map((e, i) => <div key={i}>✗ {e}</div>)}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save('ACTIVE')} data-testid="alloc-save">
                                {editingDraftId ? 'Activar borrador' : supersedesId ? 'Guardar versión nueva' : 'Guardar regla activa'}
                            </button>
                            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save('DRAFT')}>
                                Guardar como borrador
                            </button>
                            {(editingDraftId || supersedesId) && (
                                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resetForm}>Cancelar</button>
                            )}
                        </div>
                    </>
                )}

                {message && <div style={{ fontSize: '0.8rem', color: '#047857' }} data-testid="alloc-message">{message}</div>}

                {account && accountRules.length > 0 && (
                    <div>
                        <h4 style={{ fontSize: '0.85rem', margin: '8px 0 6px' }}>Historial de la cuenta</h4>
                        <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }} data-testid="alloc-history">
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                    <th style={{ padding: 4 }}>Versión</th><th>Estado</th><th>Vigencia</th><th>Distribución</th><th>Motivo</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {accountRules.map(r => (
                                    <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: 4 }}>v{r.version}</td>
                                        <td>{r.status === 'DRAFT' ? 'Borrador' : r.validTo && r.validTo < `${year}-12-31` ? 'Finalizada' : 'Activa'}</td>
                                        <td>{r.validFrom} → {r.validTo ?? 'sin fin'}</td>
                                        <td>{r.allocations.map(a => `${RESULT_FUNCTION_LABEL[a.function]} ${a.percentage}%`).join(' · ')}</td>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            {r.status === 'DRAFT' ? (
                                                <>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => loadIntoForm(r, 'edit-draft')}>Editar</button>{' '}
                                                    <button className="btn btn-secondary btn-sm" style={{ color: '#b91c1c' }} onClick={() => { void deleteDraftRule(r.id).then(reload) }}>Eliminar</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => loadIntoForm(r, 'supersede')}>Nueva versión</button>{' '}
                                                    <button className="btn btn-secondary btn-sm" onClick={() => loadIntoForm(r, 'duplicate')}>Duplicar</button>{' '}
                                                    {!r.validTo && (
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => {
                                                                const d = window.prompt('Finalizar vigencia el (YYYY-MM-DD):', `${year}-12-31`)
                                                                if (d) void endRuleValidity(r.id, d, 'Fin de vigencia desde el editor').then(reload).catch(e2 => setErrors([String(e2 instanceof Error ? e2.message : e2)]))
                                                            }}
                                                        >
                                                            Finalizar
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
