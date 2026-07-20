/**
 * Tabs canónicos ESP/ER/EEPN/Notas — Fase 2C (§5.1) / rediseño Fase 2D (§1).
 *
 * Renderizan EXCLUSIVAMENTE desde el ReportingBundle del motor. No importan
 * utils/resultsStatement, core/statements ni domain/reports. Los importes ya
 * vienen calculados; acá solo se presentan (diseño anterior recuperado) con
 * detalle desplegable, comparativo y drilldown de trazabilidad.
 */

import { useState } from 'react'
import { StatementCard, StatementRows } from './StatementView'
import { statementStyles } from './statementFormat'
import ValidationBanner from './ValidationBanner'
import LineageModal from './LineageModal'
import { EquityMatrixView } from './EquityMatrixView'
import type { ReportLine } from '../../../reporting/domain/types'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'

function useLineage(bundle: ReportingBundle) {
    const [target, setTarget] = useState<ReportLine | null>(null)
    const modal = target ? (
        <LineageModal
            bundle={bundle.statements}
            lineId={target.id}
            label={target.label}
            accountIds={target.accountIds}
            onClose={() => setTarget(null)}
        />
    ) : null
    return { open: (l: ReportLine) => setTarget(l), modal }
}

// ── ESP ──────────────────────────────────────────────────────
export function ESPCanonicalTab({ bundle, onOpenNote }: { bundle: ReportingBundle; onOpenNote?: (ref: string) => void }) {
    const { open, modal } = useLineage(bundle)
    const bs = bundle.statements.balanceSheet
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <div className={`stmt-grid${showComp ? '' : ' two-col'}`}>
                <StatementCard
                    title="Activo"
                    accent="green"
                    total={bs.totalAssets.amount}
                    comparativeTotal={bs.totalAssets.comparativeAmount}
                    showComparative={showComp}
                >
                    <StatementRows lines={bs.totalAssets.children ?? [bs.currentAssets, bs.nonCurrentAssets]} showComparative={showComp} onLineClick={open} onNoteClick={onOpenNote} />
                </StatementCard>

                <StatementCard
                    title="Pasivo y Patrimonio Neto"
                    accent="blue"
                    total={bs.totalLiabilitiesAndEquity.amount}
                    comparativeTotal={bs.totalLiabilitiesAndEquity.comparativeAmount}
                    showComparative={showComp}
                >
                    <StatementRows lines={[bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity]} showComparative={showComp} onLineClick={open} onNoteClick={onOpenNote} />
                </StatementCard>
            </div>
            {modal}
            <style>{statementStyles}</style>
        </div>
    )
}

// ── ER ───────────────────────────────────────────────────────
const TAX_STATUS_INFO: Record<string, { label: string; hint: string }> = {
    NOT_APPLICABLE: {
        label: 'No aplicable',
        hint: 'El ejercicio no registra actividad de resultados que genere impuesto a las ganancias.',
    },
    INSUFFICIENT_INFORMATION: {
        label: 'Información insuficiente',
        hint: 'Ninguna cuenta del plan está mapeada al grupo "Impuesto a las ganancias". Configurala en Configuración → Plan de cuentas y mapeos; el importe no se muestra como $ 0,00 calculado.',
    },
}

export function ERCanonicalTab({ bundle, onOpenNote }: { bundle: ReportingBundle; onOpenNote?: (ref: string) => void }) {
    const { open, modal } = useLineage(bundle)
    const er = bundle.statements.incomeStatement
    const showComp = bundle.metadata.hasComparative
    const taxCalculated = er.incomeTaxStatus === 'CALCULATED'
    const taxInfo = TAX_STATUS_INFO[er.incomeTaxStatus]
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />
            <StatementCard title="Estado de Resultados" accent="red" showComparative={showComp}>
                <StatementRows
                    lines={[er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.preTaxResult]}
                    showComparative={showComp}
                    onLineClick={open}
                    onNoteClick={onOpenNote}
                />
                {taxCalculated ? (
                    <StatementRows lines={[er.incomeTax]} showComparative={showComp} onLineClick={open} hideColumnHeaders />
                ) : (
                    <div className="stmt-rubro-row" title={taxInfo?.hint}>
                        <span className="stmt-rubro-label">
                            <span className="stmt-caret-spacer" aria-hidden />
                            <span className="stmt-rubro-name">Impuesto a las ganancias</span>
                            <span className="stmt-note-badge" style={{ background: 'rgba(234,179,8,0.12)', color: '#a16207', borderColor: 'rgba(234,179,8,0.35)' }}>
                                {taxInfo?.label}
                            </span>
                        </span>
                        <span className="stmt-amount" style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>
                    </div>
                )}
                {!taxCalculated && taxInfo && (
                    <p style={{ fontSize: '0.74rem', color: '#a16207', margin: '2px 12px 6px', lineHeight: 1.45 }}>{taxInfo.hint}</p>
                )}
                <StatementRows
                    lines={[er.continuingResult, er.netIncome]}
                    showComparative={showComp}
                    onLineClick={open}
                    hideColumnHeaders
                />
            </StatementCard>
            {modal}
            <style>{statementStyles}</style>
        </div>
    )
}

// ── EEPN ─────────────────────────────────────────────────────
export function EEPNCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const { open, modal } = useLineage(bundle)
    const [view, setView] = useState<'MATRIX' | 'SUMMARY'>('MATRIX')
    const [matrixTarget, setMatrixTarget] = useState<{ label: string; accountIds: string[] } | null>(null)
    const eepn = bundle.statements.equityStatement
    const showComp = bundle.metadata.hasComparative
    return (
        <div>
            <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />

            <div className="eqm-toolbar" role="group" aria-label="Vista del EEPN" style={{ marginRight: 12 }}>
                <button type="button" className={`eqm-filter-btn${view === 'MATRIX' ? ' active' : ''}`} aria-pressed={view === 'MATRIX'} onClick={() => setView('MATRIX')}>
                    Vista matricial
                </button>
                <button type="button" className={`eqm-filter-btn${view === 'SUMMARY' ? ' active' : ''}`} aria-pressed={view === 'SUMMARY'} onClick={() => setView('SUMMARY')}>
                    Vista resumida
                </button>
            </div>

            {view === 'MATRIX' ? (
                <EquityMatrixView
                    matrix={bundle.statements.equityMatrix}
                    onCellClick={(label, accountIds) => setMatrixTarget({ label, accountIds })}
                />
            ) : (
                <StatementCard title="Evolución del Patrimonio Neto" accent="violet" showComparative={showComp}>
                    <StatementRows
                        lines={[eepn.openingBalance, eepn.contributions, eepn.distributions, eepn.reservesMovements, eepn.otherMovements, eepn.periodResult, eepn.closingBalance]}
                        showComparative={showComp}
                        onLineClick={open}
                    />
                </StatementCard>
            )}

            {matrixTarget && (
                <LineageModal
                    bundle={bundle.statements}
                    lineId="eepn:matrix"
                    label={matrixTarget.label}
                    accountIds={matrixTarget.accountIds}
                    onClose={() => setMatrixTarget(null)}
                />
            )}
            {modal}
            <style>{statementStyles}</style>
        </div>
    )
}

// ── Notas ────────────────────────────────────────────────────
// La pestaña de notas y anexos vive en NotesAndAnnexesTab (Fase 2E, §8).
export { NotesAndAnnexesTab as NotasCanonicalTab } from './NotesAndAnnexesTab'
