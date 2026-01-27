/**
 * RT17Drawer - Drawer component for configuring RT17 valuations
 *
 * Supports multiple valuation methods:
 * - FX: Foreign currency (exchange rate)
 * - VNR: Net Realizable Value (market price - selling costs)
 * - VPP: Equity Method (% ownership × equity of subsidiary)
 * - REPOSICION: Replacement cost
 * - REVALUO: Technical revaluation (RT31)
 * - MANUAL: Manual value input
 */

import { useState, useEffect, useCallback } from 'react';
import type { ComputedPartidaRT17, RT17Valuation } from '../../../core/cierre-valuacion';
import { formatCurrencyARS } from '../../../core/cierre-valuacion';
import type { ValuationMethod } from '../../../core/cierre-valuacion/monetary-classification';

interface RT17DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingPartida?: ComputedPartidaRT17;
    onSave: (valuation: RT17Valuation) => void;
}

// Method labels for UI
const METHOD_LABELS: Record<ValuationMethod, string> = {
    FX: 'Tipo de Cambio (ME)',
    VNR: 'Valor Neto de Realizacion',
    VPP: 'Valor Patrimonial Proporcional',
    REPOSICION: 'Costo de Reposicion',
    REVALUO: 'Revaluo Tecnico (RT31)',
    MANUAL: 'Valor Manual',
    NA: 'No Aplica',
};

const METHOD_DESCRIPTIONS: Record<ValuationMethod, string> = {
    FX: 'Cantidad × Tipo de cambio al cierre',
    VNR: 'Precio de mercado - Gastos de venta',
    VPP: 'Porcentaje de tenencia × PN de la participada',
    REPOSICION: 'Costo actual de adquirir/producir el bien',
    REVALUO: 'Valor determinado por tasacion tecnica',
    MANUAL: 'Ingreso manual del valor corriente',
    NA: 'Cuenta derivada (amortizaciones, regularizadoras)',
};

interface MethodState {
    method: ValuationMethod;
    // FX fields
    fxAmount?: number;
    fxCurrency?: string;
    fxRate?: number;
    fxRateSource?: string;
    fxRateDate?: string;
    fxRateType?: 'compra' | 'venta';
    // VNR fields
    vnrPrice?: number;
    vnrQuantity?: number;
    vnrCosts?: number;
    vnrSource?: string;
    // VPP fields
    vppPercentage?: number;
    vppEquity?: number;
    vppDate?: string;
    // Reposicion fields
    reposicionValue?: number;
    reposicionSource?: string;
    // Revaluo fields
    revaluoValue?: number;
    revaluoDate?: string;
    revaluoExpert?: string;
    // Manual fields
    manualValue?: number;
    manualNotes?: string;
}

export function RT17Drawer({
    isOpen,
    onClose,
    editingPartida,
    onSave,
}: RT17DrawerProps) {
    const [temp, setTemp] = useState<ComputedPartidaRT17 | null>(null);
    const [methodState, setMethodState] = useState<MethodState>({ method: 'MANUAL' });
    const [isFetchingRate, setIsFetchingRate] = useState(false);

    // Initialize state when drawer opens
    useEffect(() => {
        if (isOpen && editingPartida) {
            setTemp(JSON.parse(JSON.stringify(editingPartida)));

            // Determine suggested method
            let suggestedMethod: ValuationMethod = 'MANUAL';

            if (editingPartida.profileType === 'moneda_extranjera' || editingPartida.type === 'USD') {
                suggestedMethod = 'FX';
            } else if (editingPartida.profileType === 'mercaderias') {
                suggestedMethod = 'REPOSICION';
            } else if (editingPartida.grupo === 'PN') {
                suggestedMethod = 'NA';
            }

            setMethodState({
                method: suggestedMethod,
                fxAmount: editingPartida.sourceUsdAmount,
                fxCurrency: 'USD',
                fxRate: editingPartida.tcCierre,
                manualValue: editingPartida.manualCurrentValue,
            });
        } else {
            setTemp(null);
            setMethodState({ method: 'MANUAL' });
        }
    }, [isOpen, editingPartida]);

    // Calculate current value based on method
    const calculateCurrentValue = useCallback((): number => {
        switch (methodState.method) {
            case 'FX':
                return (methodState.fxAmount || 0) * (methodState.fxRate || 0);
            case 'VNR':
                return ((methodState.vnrPrice || 0) * (methodState.vnrQuantity || 1)) - (methodState.vnrCosts || 0);
            case 'VPP':
                return ((methodState.vppPercentage || 0) / 100) * (methodState.vppEquity || 0);
            case 'REPOSICION':
                return methodState.reposicionValue || 0;
            case 'REVALUO':
                return methodState.revaluoValue || 0;
            case 'MANUAL':
                return methodState.manualValue || 0;
            case 'NA':
                return temp?.baseReference || 0;
            default:
                return 0;
        }
    }, [methodState, temp]);

    const currentValue = calculateCurrentValue();
    const baseReference = temp?.baseReference || 0;
    const resultadoTenencia = currentValue - baseReference;

    // Fetch exchange rate (simple implementation)
    const fetchExchangeRate = async () => {
        setIsFetchingRate(true);
        try {
            // Try to fetch from a public API (BCRA or similar)
            // For now, we'll show a manual input with a note
            // In production, this would call an actual API
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network
            // Set a placeholder - user can override
            setMethodState(prev => ({
                ...prev,
                fxRateSource: 'Manual (API no disponible)',
                fxRateDate: new Date().toISOString().substring(0, 10),
            }));
        } catch {
            // Fallback to manual
        } finally {
            setIsFetchingRate(false);
        }
    };

    const handleSave = () => {
        if (!temp) return;

        onSave({
            rt6ItemId: temp.sourcePartidaId || temp.id,
            valCorriente: currentValue,
            resTenencia: resultadoTenencia,
            status: 'done',
            tcCierre: methodState.fxRate,
            manualCurrentValue: methodState.manualValue,
            method: methodState.method,
            metadata: {
                fxAmount: methodState.fxAmount,
                fxCurrency: methodState.fxCurrency,
                fxRateSource: methodState.fxRateSource,
                vnrPrice: methodState.vnrPrice,
                vnrQuantity: methodState.vnrQuantity,
                vnrCosts: methodState.vnrCosts,
                vppPercentage: methodState.vppPercentage,
                vppEquity: methodState.vppEquity,
                reposicionSource: methodState.reposicionSource,
                revaluoExpert: methodState.revaluoExpert,
            },
        });
    };

    if (!isOpen || !temp) return null;

    const isPN = temp.grupo === 'PN';

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <div className="drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                    <div>
                        <h3 className="text-lg font-bold">Valuacion: {temp.cuentaNombre}</h3>
                        <div className="text-sm text-muted">{temp.rubroLabel || 'Sin rubro'}</div>
                    </div>
                    <button className="drawer-close" onClick={onClose}>
                        <i className="ph-bold ph-x" />
                    </button>
                </div>

                <div className="drawer-body">
                    {/* 1. TOP CARD: Valor Homogeneo (Locked) */}
                    <div className="axi-locked-card">
                        <div className="axi-locked-icon">
                            <i className="ph-fill ph-lock" />
                        </div>
                        <div className="axi-locked-content">
                            <div className="axi-locked-header">
                                <span className="axi-locked-label">Valor Homogeneo (AXI)</span>
                                <span className="axi-locked-badge">Bloqueado</span>
                            </div>
                            <div className="axi-locked-amount font-mono tabular-nums">
                                {formatCurrencyARS(baseReference)}
                            </div>
                            <div className="axi-locked-helper">
                                Calculado en Paso 2 (Reexpresion). Base comparativa invariable.
                            </div>
                        </div>
                    </div>

                    {/* 2. METHOD SELECTOR (if not PN) */}
                    {!isPN && (
                        <div className="method-selector">
                            <label className="form-label">Metodo de Valuacion</label>
                            <select
                                className="form-select"
                                value={methodState.method}
                                onChange={(e) => setMethodState({ ...methodState, method: e.target.value as ValuationMethod })}
                            >
                                {Object.entries(METHOD_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            <p className="method-description">{METHOD_DESCRIPTIONS[methodState.method]}</p>
                        </div>
                    )}

                    {/* 3. METHOD-SPECIFIC INPUT SECTIONS */}
                    <div className="drawer-section">
                        {isPN ? (
                            <div className="pn-locked-block">
                                <div className="pn-locked-icon">
                                    <i className="ph-fill ph-prohibit" />
                                </div>
                                <h4>No requiere accion</h4>
                                <p>Patrimonio Neto no requiere valuacion adicional segun RT17.</p>
                            </div>
                        ) : methodState.method === 'NA' ? (
                            <div className="pn-locked-block">
                                <div className="pn-locked-icon">
                                    <i className="ph-fill ph-arrow-bend-down-right" />
                                </div>
                                <h4>Cuenta derivada</h4>
                                <p>Esta cuenta sigue el valor del activo principal (ej: amortizaciones).</p>
                            </div>
                        ) : methodState.method === 'FX' ? (
                            <div className="animate-fade-in">
                                <div className="fx-origin-card">
                                    <span className="fx-origin-label">Existencia {methodState.fxCurrency || 'USD'}</span>
                                    <input
                                        type="number"
                                        className="fx-origin-input"
                                        value={methodState.fxAmount || ''}
                                        onChange={(e) => setMethodState({ ...methodState, fxAmount: Number(e.target.value) })}
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="form-label">Tipo de Cambio Cierre <span className="text-error">*</span></label>
                                    <div className="fx-rate-row">
                                        <input
                                            type="number"
                                            className="form-input font-bold"
                                            value={methodState.fxRate || ''}
                                            onChange={(e) => setMethodState({ ...methodState, fxRate: Number(e.target.value) })}
                                            placeholder="Ej: 1050.50"
                                            autoFocus
                                        />
                                        <button
                                            className="btn btn-secondary btn-fetch-rate"
                                            onClick={fetchExchangeRate}
                                            disabled={isFetchingRate}
                                        >
                                            {isFetchingRate ? 'Buscando...' : 'Traer TC'}
                                        </button>
                                    </div>
                                    {methodState.fxRateSource && (
                                        <div className="fx-rate-source">
                                            <i className="ph-fill ph-info" />
                                            <span>Fuente: {methodState.fxRateSource}</span>
                                            {methodState.fxRateDate && <span> | {methodState.fxRateDate}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : methodState.method === 'VNR' ? (
                            <div className="animate-fade-in">
                                <div className="grid-2">
                                    <div className="mb-4">
                                        <label className="form-label">Precio Unitario</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={methodState.vnrPrice || ''}
                                            onChange={(e) => setMethodState({ ...methodState, vnrPrice: Number(e.target.value) })}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="form-label">Cantidad</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={methodState.vnrQuantity || ''}
                                            onChange={(e) => setMethodState({ ...methodState, vnrQuantity: Number(e.target.value) })}
                                            placeholder="1"
                                        />
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">Gastos de Venta (a deducir)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={methodState.vnrCosts || ''}
                                        onChange={(e) => setMethodState({ ...methodState, vnrCosts: Number(e.target.value) })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">Fuente / Mercado (opcional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={methodState.vnrSource || ''}
                                        onChange={(e) => setMethodState({ ...methodState, vnrSource: e.target.value })}
                                        placeholder="Ej: Bolsa de Comercio"
                                    />
                                </div>
                            </div>
                        ) : methodState.method === 'VPP' ? (
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Porcentaje de Tenencia (%)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={methodState.vppPercentage || ''}
                                        onChange={(e) => setMethodState({ ...methodState, vppPercentage: Number(e.target.value) })}
                                        placeholder="Ej: 30"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">PN de la Participada al Cierre</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={methodState.vppEquity || ''}
                                        onChange={(e) => setMethodState({ ...methodState, vppEquity: Number(e.target.value) })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">Fecha del PN (opcional)</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={methodState.vppDate || ''}
                                        onChange={(e) => setMethodState({ ...methodState, vppDate: e.target.value })}
                                    />
                                </div>
                                <div className="vpp-note">
                                    <i className="ph-fill ph-info" />
                                    <span>Si no tiene el PN de la participada, puede dejar pendiente y completar despues.</span>
                                </div>
                            </div>
                        ) : methodState.method === 'REPOSICION' ? (
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Costo de Reposicion Total <span className="text-error">*</span></label>
                                    <input
                                        type="number"
                                        className="form-input font-bold"
                                        value={methodState.reposicionValue || ''}
                                        onChange={(e) => setMethodState({ ...methodState, reposicionValue: Number(e.target.value) })}
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                    <p className="text-xs text-muted mt-2">
                                        Costo actual de adquirir o producir este bien al cierre.
                                    </p>
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">Fuente (opcional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={methodState.reposicionSource || ''}
                                        onChange={(e) => setMethodState({ ...methodState, reposicionSource: e.target.value })}
                                        placeholder="Ej: Cotizacion proveedor"
                                    />
                                </div>
                            </div>
                        ) : methodState.method === 'REVALUO' ? (
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Valor Revaluado <span className="text-error">*</span></label>
                                    <input
                                        type="number"
                                        className="form-input font-bold"
                                        value={methodState.revaluoValue || ''}
                                        onChange={(e) => setMethodState({ ...methodState, revaluoValue: Number(e.target.value) })}
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                                <div className="grid-2">
                                    <div className="mb-4">
                                        <label className="form-label">Fecha del Revaluo</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={methodState.revaluoDate || ''}
                                            onChange={(e) => setMethodState({ ...methodState, revaluoDate: e.target.value })}
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="form-label">Perito / Tasador</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={methodState.revaluoExpert || ''}
                                            onChange={(e) => setMethodState({ ...methodState, revaluoExpert: e.target.value })}
                                            placeholder="Nombre del perito"
                                        />
                                    </div>
                                </div>
                                <div className="revaluo-note">
                                    <i className="ph-fill ph-seal-check" />
                                    <span>Revaluo tecnico segun RT31. Requiere informe de tasador.</span>
                                </div>
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Valor Corriente <span className="text-error">*</span></label>
                                    <input
                                        type="number"
                                        className="form-input font-bold"
                                        value={methodState.manualValue || ''}
                                        onChange={(e) => setMethodState({ ...methodState, manualValue: Number(e.target.value) })}
                                        placeholder="Valor de mercado"
                                        autoFocus
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="form-label">Notas (opcional)</label>
                                    <textarea
                                        className="form-input"
                                        value={methodState.manualNotes || ''}
                                        onChange={(e) => setMethodState({ ...methodState, manualNotes: e.target.value })}
                                        placeholder="Justificacion del valor ingresado"
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Result Preview */}
                        {!isPN && methodState.method !== 'NA' && currentValue > 0 && (
                            <div className="rxt-preview-box">
                                <div className="rxt-preview-header">
                                    <span>Resultado por Tenencia estimado:</span>
                                </div>
                                <div className="rxt-preview-details">
                                    <div className="rxt-preview-row">
                                        <span className="text-muted">Valor Corriente:</span>
                                        <span className="font-mono">{formatCurrencyARS(currentValue)}</span>
                                    </div>
                                    <div className="rxt-preview-row">
                                        <span className="text-muted">(-) Valor Homogeneo:</span>
                                        <span className="font-mono text-muted">{formatCurrencyARS(baseReference)}</span>
                                    </div>
                                    <div className="rxt-preview-divider"></div>
                                    <div className="rxt-preview-total">
                                        <span className="font-bold">Resultado (RxT):</span>
                                        <span className={`font-mono font-bold tabular-nums ${resultadoTenencia >= 0 ? 'text-success' : 'text-error'}`}>
                                            {resultadoTenencia >= 0 ? '+' : ''}
                                            {formatCurrencyARS(resultadoTenencia)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="drawer-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!isPN && methodState.method !== 'NA' && currentValue === 0}
                    >
                        Guardar Valuacion
                    </button>
                </div>
            </div>

            <style>{`
                /* AxI Locked Card */
                .axi-locked-card {
                    background: rgba(59, 130, 246, 0.05);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    border-radius: var(--radius-lg);
                    padding: var(--space-md);
                    margin-bottom: var(--space-lg);
                    display: flex;
                    gap: var(--space-md);
                    align-items: flex-start;
                }
                .axi-locked-icon {
                    width: 44px;
                    height: 44px;
                    background: rgba(59, 130, 246, 0.1);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    color: var(--brand-primary);
                }
                .axi-locked-content { flex: 1; }
                .axi-locked-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                }
                .axi-locked-label {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--brand-primary);
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }
                .axi-locked-badge {
                    font-size: 10px;
                    font-weight: 500;
                    color: var(--color-text-muted);
                    font-style: italic;
                }
                .axi-locked-amount {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--color-text);
                    margin-bottom: 4px;
                }
                .axi-locked-helper {
                    font-size: 11px;
                    color: var(--color-text-secondary);
                    opacity: 0.8;
                }

                /* Method Selector */
                .method-selector {
                    margin-bottom: var(--space-lg);
                }
                .form-select {
                    width: 100%;
                    padding: var(--space-md);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    background: var(--surface-1);
                    font-size: var(--font-size-md);
                    cursor: pointer;
                }
                .form-select:focus {
                    outline: none;
                    border-color: var(--brand-primary);
                }
                .method-description {
                    font-size: 0.8rem;
                    color: var(--color-text-muted);
                    margin-top: 6px;
                    font-style: italic;
                }

                /* FX Specific */
                .fx-origin-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #F8FAFC;
                    border: 1px solid #E2E8F0;
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin-bottom: 16px;
                }
                .fx-origin-label {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #475569;
                }
                .fx-origin-input {
                    width: 150px;
                    padding: 8px 12px;
                    border: 1px solid #E2E8F0;
                    border-radius: 6px;
                    font-family: var(--font-mono);
                    font-weight: 700;
                    font-size: 1rem;
                    text-align: right;
                }
                .fx-rate-row {
                    display: flex;
                    gap: 8px;
                }
                .btn-fetch-rate {
                    white-space: nowrap;
                    padding: 8px 16px;
                }
                .fx-rate-source {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 8px;
                    font-size: 0.75rem;
                    color: var(--color-text-muted);
                    background: #F9FAFB;
                    padding: 6px 10px;
                    border-radius: 4px;
                }

                /* VPP Note */
                .vpp-note, .revaluo-note {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 12px;
                    background: #FEF3C7;
                    border: 1px solid #FDE68A;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    color: #92400E;
                }
                .revaluo-note {
                    background: #DBEAFE;
                    border-color: #93C5FD;
                    color: #1E40AF;
                }
                .vpp-note i, .revaluo-note i {
                    flex-shrink: 0;
                    font-size: 1rem;
                }

                /* Grid */
                .grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }

                /* RxT Preview Box */
                .rxt-preview-box {
                    background: var(--surface-2);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    padding: var(--space-md);
                    margin-top: var(--space-lg);
                }
                .rxt-preview-header {
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-sm);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .rxt-preview-details {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .rxt-preview-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: var(--font-size-sm);
                }
                .rxt-preview-divider {
                    height: 1px;
                    background: var(--color-border);
                    margin: var(--space-sm) 0;
                }
                .rxt-preview-total {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                /* Drawer */
                .drawer-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 100;
                    display: flex;
                    justify-content: flex-end;
                    background: rgba(15, 23, 42, 0.2);
                    backdrop-filter: blur(4px);
                }
                .drawer {
                    width: 100%;
                    max-width: 520px;
                    background: var(--surface-1);
                    height: 100%;
                    box-shadow: var(--shadow-lg);
                    display: flex;
                    flex-direction: column;
                    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .drawer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-lg);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--surface-1);
                }
                .drawer-close {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    border: none;
                    background: var(--surface-2);
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .drawer-close:hover {
                    background: var(--surface-3);
                    color: var(--color-text);
                }
                .drawer-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--space-lg);
                }
                .drawer-section {
                    animation: fadeIn 0.4s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .drawer-footer {
                    padding: var(--space-lg);
                    border-top: 1px solid var(--color-border);
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-md);
                    background: var(--surface-1);
                }

                /* Form Elements */
                .form-label {
                    display: block;
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                    color: var(--color-text);
                    margin-bottom: var(--space-xs);
                }
                .form-input {
                    width: 100%;
                    padding: var(--space-md);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    background: var(--surface-1);
                    font-size: var(--font-size-md);
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .form-input:focus {
                    outline: none;
                    border-color: var(--brand-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                textarea.form-input {
                    resize: vertical;
                    min-height: 60px;
                }
                .mb-4 { margin-bottom: 16px; }
                .mt-2 { margin-top: 8px; }
                .font-mono { font-family: var(--font-mono); }
                .font-bold { font-weight: 700; }
                .tabular-nums { font-variant-numeric: tabular-nums; }
                .text-muted { color: var(--color-text-secondary); }
                .text-success { color: var(--color-success); }
                .text-error { color: var(--color-error); }
                .text-lg { font-size: 1.125rem; }
                .text-sm { font-size: 0.875rem; }
                .text-xs { font-size: 0.75rem; }

                /* PN Locked Block */
                .pn-locked-block {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-xl);
                    text-align: center;
                    background: var(--surface-2);
                    border-radius: var(--radius-lg);
                    border: 1px dashed var(--color-border);
                }
                .pn-locked-icon {
                    font-size: 2.5rem;
                    color: var(--color-text-muted);
                    opacity: 0.5;
                }
                .pn-locked-block h4 {
                    margin: 0;
                    font-weight: 700;
                    color: var(--color-text-secondary);
                }
                .pn-locked-block p {
                    margin: 0;
                    font-size: var(--font-size-sm);
                    color: var(--color-text-muted);
                }
            `}</style>
        </div>
    );
}
