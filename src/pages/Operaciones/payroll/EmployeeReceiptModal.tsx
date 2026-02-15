import { useEffect, useState } from 'react'
import { Eye, Info, X } from '@phosphor-icons/react'
import type { Employee, PayrollLine, PayrollRun } from '../../../core/payroll/types'
import { updatePayrollLine } from '../../../storage/payroll'

const fmtCurrency2 = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)

const fmtPeriod = (period: string): string => {
    const [y, m] = period.split('-')
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${months[parseInt(m, 10) - 1]} ${y}`
}

const fmtDate = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

const fmtPercent = (n: number): string => `${(n * 100).toFixed(2)}%`

function ReceiptSection({
    title,
    rows,
    emptyText,
}: {
    title: string
    rows: NonNullable<PayrollLine['conceptBreakdown']>
    emptyText: string
}) {
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">{title}</div>
            {rows.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">{emptyText}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-white border-b border-slate-100">
                            <tr>
                                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Concepto</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Base</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Tasa</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(detail => (
                                <tr key={`${detail.conceptId}-${detail.kind}-${detail.amount}`}>
                                    <td className="px-4 py-2 text-slate-700" title={detail.formulaExpr || undefined}>
                                        {detail.conceptName}
                                        {detail.formulaExpr && <Info size={12} className="inline ml-1 text-slate-400" />}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600">
                                        {detail.baseAmount > 0 ? fmtCurrency2(detail.baseAmount) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600">
                                        {detail.rate != null ? fmtPercent(detail.rate) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                                        {fmtCurrency2(detail.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default function EmployeeReceiptModal({
    run,
    line,
    employee,
    hasLinkedJournal,
    onClose,
}: {
    run: PayrollRun
    line: PayrollLine
    employee: Employee
    hasLinkedJournal: boolean
    onClose: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [editGross, setEditGross] = useState(String(line.gross))
    const [editWithholds, setEditWithholds] = useState(String(line.employeeWithholds))
    const [editContrib, setEditContrib] = useState(String(line.employerContrib))
    const breakdown = line.conceptBreakdown || []
    const earnings = breakdown.filter(d => d.kind === 'earning')
    const deductions = breakdown.filter(d => d.kind === 'deduction')
    const employerContribs = breakdown.filter(d => d.kind === 'employer_contrib')
    const canEdit = run.status === 'draft'

    useEffect(() => {
        setEditing(false)
        setEditGross(String(line.gross))
        setEditWithholds(String(line.employeeWithholds))
        setEditContrib(String(line.employerContrib))
    }, [line.id, line.gross, line.employeeWithholds, line.employerContrib])

    const handleSaveOverride = async () => {
        await updatePayrollLine(line.id, {
            gross: parseFloat(editGross) || 0,
            employeeWithholds: parseFloat(editWithholds) || 0,
            employerContrib: parseFloat(editContrib) || 0,
        })
        setEditing(false)
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[1px] flex justify-end" onClick={onClose}>
            <div className="w-full max-w-2xl h-full overflow-y-auto bg-white shadow-2xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h4 className="text-lg font-semibold text-slate-900">Recibo (vista empleador)</h4>
                        <p className="text-sm text-slate-500">{fmtPeriod(run.period)}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1">Empleado</div>
                        <div className="font-medium text-slate-900">{employee.fullName}</div>
                        <div className="text-xs text-slate-500 mt-1">{employee.area || 'Sin área'} · {employee.position || employee.category || 'Sin rol'}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1">Datos laborales</div>
                        <div className="text-slate-700 text-xs">Ingreso: {employee.startDate ? fmtDate(employee.startDate) : 'Sin fecha'}</div>
                        <div className="text-slate-700 text-xs mt-1">Plantilla: {employee.templateId || 'Fuera de convenio'}</div>
                    </div>
                </div>

                {editing && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-violet-200 bg-violet-50">
                        <input value={editGross} onChange={e => setEditGross(e.target.value)} type="number" className="px-3 py-2 border border-violet-200 rounded-lg text-sm font-mono text-right" placeholder="Bruto" />
                        <input value={editWithholds} onChange={e => setEditWithholds(e.target.value)} type="number" className="px-3 py-2 border border-violet-200 rounded-lg text-sm font-mono text-right" placeholder="Retenciones" />
                        <input value={editContrib} onChange={e => setEditContrib(e.target.value)} type="number" className="px-3 py-2 border border-violet-200 rounded-lg text-sm font-mono text-right" placeholder="Contribuciones" />
                        <div className="sm:col-span-3 flex justify-end gap-2 pt-1">
                            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-white">Cancelar</button>
                            <button onClick={handleSaveOverride} className="px-3 py-1.5 text-sm rounded-md text-white bg-violet-600 hover:bg-violet-700">Guardar override</button>
                        </div>
                    </div>
                )}

                <ReceiptSection title="Haberes" rows={earnings} emptyText="Sin haberes detallados." />
                <ReceiptSection title="Descuentos / Retenciones" rows={deductions} emptyText="Sin descuentos detallados." />
                <ReceiptSection title="Contribuciones empleador" rows={employerContribs} emptyText="Sin contribuciones detalladas." />

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">Resumen</div>
                    <div className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-600">Bruto</span><span className="font-mono tabular-nums">{fmtCurrency2(line.gross)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Neto</span><span className="font-mono tabular-nums">{fmtCurrency2(line.net)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Costo empleador</span><span className="font-mono tabular-nums">{fmtCurrency2(line.gross + line.employerContrib)}</span></div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        onClick={() => setEditing(prev => !prev)}
                        disabled={!canEdit}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Editar conceptos
                    </button>
                    {hasLinkedJournal && run.journalEntryId && (
                        <button
                            onClick={() => window.open(`/asientos?entryId=${run.journalEntryId}`, '_self')}
                            className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <Eye size={14} /> Ver asiento
                        </button>
                    )}
                    <button
                        disabled
                        title="Próximamente"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-400 bg-slate-50 cursor-not-allowed"
                    >
                        Exportar PDF (próximamente)
                    </button>
                </div>
            </div>
        </div>
    )
}
