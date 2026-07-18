/**
 * MapeosPanel — Fase 2D (§4): asistente de mapeos contables, ahora embebido en
 * Configuración → Plan de cuentas y mapeos (antes página /mapeos).
 * Lista cuentas por estado de metadata, muestra el impacto antes de guardar y
 * persiste con auditoría. Las heurísticas solo proponen.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Account, MonetaryClassification, CurrentClassification, StatementGroup } from '../../../core/models'
import {
    buildMappingReport,
    describeImpact,
    proposeMapping,
    saveMapping,
    ISSUE_LABELS,
    type AccountMappingStatus,
    type MappingReport,
} from '../../../accounting/taxonomy/mappingAssistant'

const STATEMENT_GROUPS: StatementGroup[] = [
    'CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'OTHER_RECEIVABLES', 'TAX_CREDITS', 'INVENTORIES',
    'PPE', 'INTANGIBLES', 'INVESTMENTS', 'TRADE_PAYABLES', 'TAX_LIABILITIES', 'PAYROLL_LIABILITIES',
    'LOANS', 'OTHER_PAYABLES', 'DEFERRED_INCOME', 'CAPITAL', 'RESERVES', 'RETAINED_EARNINGS',
    'SALES', 'OTHER_OPERATING_INCOME', 'COGS', 'ADMIN_EXPENSES', 'SELLING_EXPENSES',
    'FINANCIAL_INCOME', 'FINANCIAL_EXPENSES', 'OTHER_INCOME', 'OTHER_EXPENSES',
]
const MONETARY: MonetaryClassification[] = ['MONETARY', 'NON_MONETARY', 'MIXED', 'NOT_APPLICABLE']
const CURRENT: CurrentClassification[] = ['CURRENT', 'NON_CURRENT', 'NOT_APPLICABLE']
const CASHFLOW = ['OPERATING', 'INVESTING', 'FINANCING', 'CASH_EQUIVALENT', 'NOT_APPLICABLE'] as const

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function EditRow({ status, onSaved }: { status: AccountMappingStatus; onSaved: () => void }) {
    const { account } = status
    const [draft, setDraft] = useState<Partial<Account>>({})
    const [saving, setSaving] = useState(false)

    const proposal = useMemo(() => proposeMapping(account), [account])
    const merged: Partial<Account> = { ...draft }
    const impact = describeImpact(account, merged)

    const set = (field: keyof Account, value: unknown) =>
        setDraft(d => ({ ...d, [field]: value === '' ? undefined : value }))

    const handleSave = async () => {
        setSaving(true)
        try {
            await saveMapping(account.id, merged, { reason: 'Ajuste desde el asistente de mapeos' })
            setDraft({})
            onSaved()
        } finally {
            setSaving(false)
        }
    }

    return (
        <tr style={{ borderTop: '1px solid #e2e8f0' }}>
            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                <strong>{account.code}</strong> {account.name}
                <div style={{ fontSize: '0.72rem', color: '#b45309' }}>
                    {status.issues.map(i => ISSUE_LABELS[i]).join(' · ')}
                </div>
            </td>
            <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(status.balance)}</td>
            <td style={{ padding: '6px 8px' }}>
                <select value={(draft.statementGroup ?? account.statementGroup ?? '') as string} onChange={e => set('statementGroup', e.target.value)}>
                    <option value="">— rubro —</option>
                    {STATEMENT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
            </td>
            <td style={{ padding: '6px 8px' }}>
                <select value={(draft.monetaryClassification ?? account.monetaryClassification ?? '') as string} onChange={e => set('monetaryClassification', e.target.value)}>
                    <option value="">— monet. —</option>
                    {MONETARY.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </td>
            <td style={{ padding: '6px 8px' }}>
                <select value={(draft.currentClassification ?? account.currentClassification ?? '') as string} onChange={e => set('currentClassification', e.target.value)}>
                    <option value="">— corr. —</option>
                    {CURRENT.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </td>
            <td style={{ padding: '6px 8px' }}>
                <select value={(draft.cashFlowCategory ?? account.cashFlowCategory ?? '') as string} onChange={e => set('cashFlowCategory', e.target.value)}>
                    <option value="">— EFE —</option>
                    {CASHFLOW.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </td>
            <td style={{ padding: '6px 8px', maxWidth: 320 }}>
                {Object.keys(proposal).length > 0 && Object.keys(draft).length === 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setDraft(proposal)} title="Aplicar propuesta heurística (revisá antes de guardar)">
                        Proponer
                    </button>
                )}
                {impact.descriptions.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4 }}>{impact.descriptions.join(' ')}</div>
                )}
            </td>
            <td style={{ padding: '6px 8px' }}>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || impact.changes.length === 0}>
                    {saving ? '…' : 'Guardar'}
                </button>
            </td>
        </tr>
    )
}

export function MapeosPanel() {
    const [report, setReport] = useState<MappingReport | null>(null)
    const [showComplete, setShowComplete] = useState(false)

    const reload = () => { buildMappingReport().then(setReport) }
    useEffect(reload, [])

    if (!report) return <div className="empty-state"><p>Analizando el plan de cuentas…</p></div>

    return (
        <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Revisá y completá la metadata de las cuentas. Las cuentas con saldo y mapping
                obligatorio faltante impiden marcar los estados como validados.
            </p>

            <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><strong>{report.total}</strong> cuentas · <strong>{report.complete.length}</strong> completas · <strong style={{ color: '#b45309' }}>{report.incomplete.length}</strong> a revisar</div>
                <div style={{ color: report.blockingCount > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                    {report.blockingCount > 0
                        ? `⚠ ${report.blockingCount} cuenta(s) con saldo bloquean la publicación`
                        : '✓ No hay cuentas con saldo que bloqueen la publicación'}
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                            <th style={{ padding: '8px' }}>Cuenta / Problemas</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Saldo</th>
                            <th style={{ padding: '8px' }}>Rubro ESP/ER</th>
                            <th style={{ padding: '8px' }}>Monetaria</th>
                            <th style={{ padding: '8px' }}>Corriente</th>
                            <th style={{ padding: '8px' }}>EFE</th>
                            <th style={{ padding: '8px' }}>Impacto</th>
                            <th style={{ padding: '8px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.incomplete.map(s => <EditRow key={s.account.id} status={s} onSaved={reload} />)}
                        {showComplete && report.complete.map(s => <EditRow key={s.account.id} status={s} onSaved={reload} />)}
                    </tbody>
                </table>
            </div>

            <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowComplete(v => !v)}>
                {showComplete ? 'Ocultar cuentas completas' : `Ver ${report.complete.length} cuentas completas`}
            </button>
        </div>
    )
}
