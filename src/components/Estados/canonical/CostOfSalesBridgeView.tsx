/**
 * CostOfSalesBridgeView — Fase 2E (§10.4): determinación del costo de ventas.
 *
 * Puente visual EI + Compras (+ costos incorporables) = Bienes disponibles
 * − EF = CMV, como tarjetas encadenadas con drilldown, comparativo y estado
 * de conciliación con el ER y el ESP. Presentador PURO del bundle: los
 * estados NOT_APPLICABLE / INSUFFICIENT se muestran como texto, nunca $0.
 */

import type { CostOfSalesBridge, CostOfSalesValue } from '../../../reporting/domain/types'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABEL: Record<CostOfSalesValue['status'], string> = {
    CALCULATED: '',
    NOT_APPLICABLE: 'No aplicable',
    INSUFFICIENT_INFORMATION: 'Información insuficiente',
}

function Amount({ v }: { v: CostOfSalesValue }) {
    if (v.status !== 'CALCULATED' || v.amount == null) {
        return <span className="cmv-na" title={v.detail}>{STATUS_LABEL[v.status] || '—'}</span>
    }
    return <span className={`cmv-amount${v.amount < 0 ? ' is-neg' : ''}`}>{nf.format(v.amount)}</span>
}

function Step({ op, title, value, hint, emphasis, comparative, onClick }: {
    op?: '+' | '−' | '='
    title: string
    value: CostOfSalesValue
    hint?: string
    emphasis?: boolean
    comparative?: boolean
    onClick?: () => void
}) {
    const clickable = !!onClick && value.accountIds.length > 0
    return (
        <div className="cmv-step">
            {op && <span className="cmv-op" aria-hidden>{op}</span>}
            <div
                className={`cmv-card${emphasis ? ' is-emphasis' : ''}${clickable ? ' is-clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? onClick : undefined}
                onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!() } } : undefined}
                title={clickable ? 'Ver trazabilidad hasta los asientos' : value.detail}
            >
                <span className="cmv-card-title">{title}</span>
                <Amount v={value} />
                {comparative && value.comparativeAmount != null && (
                    <span className="cmv-comp">Ej. anterior: {nf.format(value.comparativeAmount)}</span>
                )}
                {hint && <span className="cmv-hint">{hint}</span>}
            </div>
        </div>
    )
}

export interface CostOfSalesBridgeViewProps {
    bridge: CostOfSalesBridge
    showComparative: boolean
    onDrilldown?: (label: string, accountIds: string[]) => void
}

export function CostOfSalesBridgeView({ bridge, showComparative, onDrilldown }: CostOfSalesBridgeViewProps) {
    const reconciles = bridge.validations.every(v => v.passed)
    const cmvCheck = bridge.validations.find(v => v.id === 'cmv-er')

    if (bridge.mode === 'NOT_APPLICABLE') {
        return (
            <div className="cmv-empty">
                Sin bienes de cambio ni costo registrado en el ejercicio: la determinación del costo de ventas no aplica.
                <style>{styles}</style>
            </div>
        )
    }

    if (bridge.mode === 'SERVICES') {
        return (
            <div>
                <p className="cmv-intro">
                    Empresa de servicios: no hay bienes de cambio, por lo que no se fuerzan existencias inicial y final.
                    El costo de servicios surge directamente del Estado de Resultados.
                </p>
                <Step
                    title="Costo de servicios (según ER)"
                    value={bridge.costOfSales}
                    emphasis
                    comparative={showComparative}
                    onClick={onDrilldown ? () => onDrilldown('Costo de servicios', bridge.costOfSales.accountIds) : undefined}
                />
                <style>{styles}</style>
            </div>
        )
    }

    return (
        <div>
            <p className="cmv-intro">
                Puente del costo de mercaderías vendidas: existencia inicial más compras y costos incorporables,
                menos existencia final. La igualdad con el CMV del ER se verifica; si difiere hay salidas de
                inventario imputadas a otras cuentas y la diferencia se expone (nunca se ajusta con una línea balanceante).
            </p>

            <div className={`cmv-status${reconciles ? ' ok' : ' bad'}`} role="status">
                {reconciles
                    ? '✓ El puente concilia con el CMV del Estado de Resultados y con los bienes de cambio del ESP.'
                    : `✗ El puente no concilia: ${bridge.validations.filter(v => !v.passed).map(v => v.detail ?? v.label).join(' · ')}`}
            </div>

            <div className="cmv-bridge">
                <Step
                    title="Existencia inicial (EI)"
                    value={bridge.openingInventory}
                    hint="Bienes de cambio al comienzo del ejercicio."
                    comparative={showComparative}
                    onClick={onDrilldown ? () => onDrilldown('Existencia inicial', bridge.openingInventory.accountIds) : undefined}
                />
                <Step
                    op="+"
                    title="Compras"
                    value={bridge.purchases}
                    hint={bridge.purchases.detail}
                    comparative={showComparative}
                    onClick={onDrilldown ? () => onDrilldown('Compras', bridge.purchases.accountIds) : undefined}
                />
                {/* Componentes estructurados (§10): solo cuando hay mapping */}
                {bridge.purchaseReturns.status === 'CALCULATED' && (
                    <Step op="−" title="Devoluciones y bonificaciones de compras" value={bridge.purchaseReturns} hint={bridge.purchaseReturns.detail} comparative={showComparative}
                        onClick={onDrilldown ? () => onDrilldown('Devoluciones y bonificaciones', bridge.purchaseReturns.accountIds) : undefined} />
                )}
                {bridge.acquisitionCosts.status === 'CALCULATED' && (
                    <Step op="+" title="Costos de adquisición (fletes)" value={bridge.acquisitionCosts} hint={bridge.acquisitionCosts.detail} comparative={showComparative}
                        onClick={onDrilldown ? () => onDrilldown('Costos de adquisición', bridge.acquisitionCosts.accountIds) : undefined} />
                )}
                {bridge.incorporableCosts.status === 'CALCULATED' && (
                    <Step op="+" title="Otros costos incorporables" value={bridge.incorporableCosts} hint={bridge.incorporableCosts.detail} comparative={showComparative}
                        onClick={onDrilldown ? () => onDrilldown('Otros costos incorporables', bridge.incorporableCosts.accountIds) : undefined} />
                )}
                <Step
                    op="="
                    title="Bienes disponibles para la venta"
                    value={bridge.goodsAvailableForSale}
                    emphasis
                    comparative={showComparative}
                />
                <Step
                    op="−"
                    title="Existencia final (EF)"
                    value={bridge.closingInventory}
                    hint="Bienes de cambio al cierre; concilia con el rubro del ESP."
                    comparative={showComparative}
                    onClick={onDrilldown ? () => onDrilldown('Existencia final', bridge.closingInventory.accountIds) : undefined}
                />
                {bridge.abnormalLosses.status === 'CALCULATED' && (
                    <Step op="−" title="Bajas / pérdidas anormales (no son CMV)" value={bridge.abnormalLosses} hint={bridge.abnormalLosses.detail} comparative={showComparative}
                        onClick={onDrilldown ? () => onDrilldown('Bajas anormales', bridge.abnormalLosses.accountIds) : undefined} />
                )}
                <Step
                    op="="
                    title="Costo de ventas (CMV)"
                    value={bridge.costOfSales}
                    emphasis
                    comparative={showComparative}
                    onClick={onDrilldown ? () => onDrilldown('Costo de ventas', bridge.costOfSales.accountIds) : undefined}
                />
            </div>

            {cmvCheck && (
                <p className="cmv-footnote">
                    CMV según el ER (registro perpetuo): <strong>{nf.format(bridge.costOfSalesPerIncomeStatement)}</strong>
                    {cmvCheck.passed ? ' — coincide con el puente.' : ' — difiere del puente (ver detalle arriba).'}
                </p>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
.cmv-intro { font-size: 0.82rem; color: #64748b; margin: 0 0 12px; line-height: 1.5; max-width: 720px; }
.cmv-empty { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #64748b; font-size: 0.88rem; }
.cmv-status { padding: 9px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 14px; }
.cmv-status.ok { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); color: #047857; }
.cmv-status.bad { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.35); color: #b91c1c; }

.cmv-bridge { display: flex; flex-direction: column; gap: 2px; max-width: 560px; }
.cmv-step { display: flex; align-items: stretch; gap: 10px; }
.cmv-op { width: 18px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-weight: 700; font-size: 1.05rem; flex-shrink: 0; }
.cmv-step:first-child .cmv-op { visibility: hidden; }
.cmv-card {
    flex: 1; display: flex; flex-direction: column; gap: 2px;
    background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; margin: 3px 0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.cmv-card.is-emphasis { border-color: #bfdbfe; background: rgba(59,130,246,0.04); }
.cmv-card.is-clickable { cursor: pointer; }
.cmv-card.is-clickable:hover { border-color: #93c5fd; }
.cmv-card.is-clickable:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }
.cmv-card-title { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.cmv-amount { font-size: 1.05rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.cmv-amount.is-neg { color: #dc2626; }
.cmv-na { font-size: 0.82rem; font-weight: 600; color: #a16207; }
.cmv-comp { font-size: 0.72rem; color: #94a3b8; font-variant-numeric: tabular-nums; }
.cmv-hint { font-size: 0.72rem; color: #94a3b8; line-height: 1.4; }
.cmv-footnote { font-size: 0.8rem; color: #475569; margin-top: 12px; }
`
