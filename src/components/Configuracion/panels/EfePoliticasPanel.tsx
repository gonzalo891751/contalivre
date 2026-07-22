/**
 * Políticas del Estado de Flujo de Efectivo — Fase 2G §21.
 *
 * Permite revisar la política EFE de la empresa con textos pedagógicos (no
 * códigos internos): efectivo y equivalentes, fondos restringidos, sobregiros,
 * intereses, dividendos, impuesto a las ganancias y overrides. Marca cuando
 * requiere revisión (política heredada por migración v22).
 */

import { useEffect, useState } from 'react'
import { getDefaultCompany } from '../../../accounting/application/contextService'
import { getActivePolicy, ensureDefaultPolicy, savePolicy } from '../../../reporting/policy/policyRepository'
import { db } from '../../../storage/db'
import type { CashFlowPolicy, CashRole } from '../../../reporting/policy/cashFlowPolicy'

const ROLE_LABEL: Record<CashRole, string> = {
    CASH: 'Efectivo (caja)',
    DEMAND_DEPOSIT: 'Depósito a la vista',
    CASH_EQUIVALENT: 'Equivalente de efectivo',
    RESTRICTED_FUND: 'Fondo restringido (no integra el efectivo)',
    NON_EQUIVALENT_INVESTMENT: 'Inversión que no es equivalente',
    OVERDRAFT: 'Sobregiro / adelanto en cuenta corriente',
    EXCLUDED: 'Excluido del efectivo',
}

const YES_NO = (b?: boolean) => (b ? 'Sí' : 'No')

export function EfePoliticasPanel() {
    const [policy, setPolicy] = useState<CashFlowPolicy | null>(null)
    const [names, setNames] = useState<Map<string, string>>(new Map())
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)
        const company = await getDefaultCompany()
        const p = await getActivePolicy(company.id)
        const accounts = await db.accounts.toArray()
        setNames(new Map(accounts.map(a => [a.id, `${a.code} ${a.name}`])))
        setPolicy(p)
        setLoading(false)
    }
    useEffect(() => { load() }, [])

    const createDefault = async () => {
        const company = await getDefaultCompany()
        await ensureDefaultPolicy(company.id)
        await load()
    }
    const markReviewed = async () => {
        if (!policy) return
        await savePolicy({ ...policy, requiresReview: false, version: policy.version + 1 })
        await load()
    }

    if (loading) return <div className="cfg-panel"><p>Cargando políticas…</p></div>

    if (!policy) {
        return (
            <div className="cfg-panel">
                <h3>Políticas del Estado de Flujo de Efectivo</h3>
                <p style={{ opacity: .8 }}>Todavía no hay una política del EFE para esta empresa.</p>
                <button type="button" className="btn" onClick={createDefault}>Crear política por defecto</button>
            </div>
        )
    }

    const cash = policy.cashClassifications
    const equivalents = cash.filter(c => c.role === 'CASH_EQUIVALENT')

    return (
        <div className="cfg-panel">
            <h3 style={{ marginBottom: 4 }}>Políticas del Estado de Flujo de Efectivo</h3>
            <p style={{ opacity: .75, fontSize: '.86rem', maxWidth: '62ch' }}>
                Definen qué cuentas integran el efectivo y equivalentes, y cómo se clasifican los intereses,
                dividendos e impuesto a las ganancias. Estas decisiones afectan la exposición del EFE.
            </p>

            {policy.requiresReview && (
                <div role="alert" style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 10, border: '1px solid #e0a800', background: 'rgba(224,168,0,.08)' }}>
                    ⚠ <strong>Requiere revisión.</strong> Esta política fue creada automáticamente al migrar y asumía que
                    toda cuenta de Caja y Bancos es un equivalente de efectivo, sin evaluar liquidez, riesgo ni plazo.
                    Revisá las clasificaciones y confirmá.
                    <div style={{ marginTop: 8 }}><button type="button" className="btn" onClick={markReviewed}>Marcar como revisada</button></div>
                </div>
            )}

            <h4 style={{ marginTop: 16 }}>Efectivo y equivalentes</h4>
            {cash.length === 0 && <p style={{ opacity: .7 }}>No hay cuentas clasificadas como efectivo o equivalentes.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {cash.map(c => (
                    <li key={c.accountId} style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{names.get(c.accountId) ?? c.accountId}</div>
                        <div style={{ fontSize: '.82rem', opacity: .85 }}>{ROLE_LABEL[c.role]}</div>
                        {c.role === 'CASH_EQUIVALENT' && (
                            <div style={{ fontSize: '.76rem', opacity: .7, marginTop: 4 }}>
                                Se considera equivalente porque se mantiene para atender compromisos de corto plazo,
                                es fácilmente convertible en un importe conocido y su riesgo es insignificante.
                                {c.attributes && ` (Alta liquidez: ${YES_NO(c.attributes.highLiquidity)} · Riesgo insignificante: ${YES_NO(c.attributes.insignificantRisk)} · Vence ≤ 3 meses: ${YES_NO(c.attributes.shortMaturity)})`}
                            </div>
                        )}
                        {c.justification && <div style={{ fontSize: '.74rem', opacity: .6, marginTop: 4 }}>{c.justification}</div>}
                    </li>
                ))}
            </ul>
            {equivalents.length > 0 && (
                <p style={{ fontSize: '.76rem', opacity: .7, marginTop: 6 }}>
                    Los fondos restringidos NO integran el efectivo; una inversión sólo es equivalente si cumple los criterios de liquidez, riesgo y plazo.
                </p>
            )}

            <h4 style={{ marginTop: 16 }}>Intereses, dividendos e impuesto</h4>
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,auto) 1fr', gap: '6px 14px', fontSize: '.84rem' }}>
                <dt style={{ opacity: .7 }}>Intereses pagados</dt><dd style={{ margin: 0 }}>{policy.interestsPaid === 'FINANCING' ? 'Actividades de financiación' : 'Actividades operativas'}</dd>
                <dt style={{ opacity: .7 }}>Intereses cobrados</dt><dd style={{ margin: 0 }}>{policy.interestsReceived === 'INVESTING' ? 'Actividades de inversión' : 'Actividades operativas'}</dd>
                <dt style={{ opacity: .7 }}>Dividendos pagados</dt><dd style={{ margin: 0 }}>{policy.dividendsPaid === 'OPERATING' ? 'Actividades operativas' : 'Actividades de financiación'}</dd>
                <dt style={{ opacity: .7 }}>Dividendos cobrados</dt><dd style={{ margin: 0 }}>{policy.dividendsReceived === 'INVESTING' ? 'Actividades de inversión' : 'Actividades operativas'}</dd>
                <dt style={{ opacity: .7 }}>Impuesto a las ganancias</dt><dd style={{ margin: 0 }}>{policy.incomeTax === 'SPECIFIC' ? 'Operativo, con asociación específica cuando corresponde' : 'Operativo por defecto'}</dd>
                <dt style={{ opacity: .7 }}>Sobregiros</dt><dd style={{ margin: 0 }}>{policy.overdrafts === 'FINANCING' ? 'Pasivo de financiación' : 'Componente del efectivo'}</dd>
            </dl>

            <h4 style={{ marginTop: 16 }}>Ajustes manuales (overrides)</h4>
            <p style={{ fontSize: '.84rem', opacity: .8 }}>
                {policy.overrides.length === 0
                    ? 'No hay overrides. Toda clasificación surge de la política y del mapping de cuentas.'
                    : `${policy.overrides.length} override(s) auditables con motivo, fecha y vigencia.`}
            </p>

            <p style={{ fontSize: '.72rem', opacity: .55, marginTop: 12 }}>
                Política v{policy.version} · {policy.status === 'ACTIVE' ? 'activa' : 'reemplazada'} · fuente: {policy.source}
            </p>
        </div>
    )
}
