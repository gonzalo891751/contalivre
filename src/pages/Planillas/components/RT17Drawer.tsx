/**
 * RT17Drawer - Drawer component for configuring RT17 valuations
 */

import { useState, useEffect } from 'react';
import type { PartidaRT17, RT6ProfileType } from '../../../core/cierre-valuacion';
import {
    createDefaultPartidaRT17,
    formatNumber,
    formatCurrencyARS,
} from '../../../core/cierre-valuacion';

interface RT17DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingId: string | null;
    partidas: PartidaRT17[];
    onSave: (partida: PartidaRT17) => void;
    baselineHomog?: number;
    /** Source partida profile type for method-specific UI */
    profileType?: RT6ProfileType;
    /** Source partida USD amount (if moneda_extranjera) */
    sourceUsdAmount?: number;
}

export function RT17Drawer({
    isOpen,
    onClose,
    editingId,
    partidas,
    onSave,
    baselineHomog,
    profileType,
    sourceUsdAmount,
}: RT17DrawerProps) {
    const [temp, setTemp] = useState<PartidaRT17 | null>(null);

    // Initialize temp state when drawer opens
    useEffect(() => {
        if (isOpen) {
            if (editingId) {
                const existing = partidas.find((p) => p.id === editingId);
                if (existing) {
                    setTemp(JSON.parse(JSON.stringify(existing)));
                }
            } else {
                setTemp(createDefaultPartidaRT17());
            }
        } else {
            setTemp(null);
        }
    }, [isOpen, editingId, partidas]);

    const handleSave = () => {
        if (temp) {
            onSave(temp);
        }
    };

    if (!isOpen || !temp) return null;

    const isUSD = temp.type === 'USD';

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <div className="drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                    <div>
                        <h3 className="text-lg font-bold">Valuación: {temp.cuentaNombre}</h3>
                        <div className="text-sm text-muted">{temp.rubroLabel || 'Sin rubro'}</div>
                    </div>
                    <button className="drawer-close" onClick={onClose}>✕</button>
                </div>

                <div className="drawer-body">
                    {/* 1. TOP CARD: Valor Homogéneo (Locked) - Matches Prototype */}
                    <div className="axi-locked-card">
                        <div className="axi-locked-icon">
                            🔒
                        </div>
                        <div className="axi-locked-content">
                            <div className="axi-locked-header">
                                <span className="axi-locked-label">Valor Homogéneo (AXI)</span>
                                <span className="axi-locked-badge">Bloqueado</span>
                            </div>
                            <div className="axi-locked-amount font-mono tabular-nums">
                                {formatCurrencyARS(baselineHomog || 0)}
                            </div>
                            <div className="axi-locked-helper">
                                Calculado en Paso 2 (Reexpresión). Base comparativa invariable.
                            </div>
                        </div>
                    </div>

                    {/* 2. METHOD INPUT SECTIONS */}
                    <div className="drawer-section">
                        {temp.grupo === 'PN' ? (
                            <div className="pn-locked-block">
                                <div className="pn-locked-icon">🚫</div>
                                <h4>No requiere acción</h4>
                                <p>Patrimonio Neto no requiere valuación adicional según RT17.</p>
                            </div>
                        ) : (profileType === 'mercaderias' ? (
                            /* MERCADERIAS */
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Costo de Reposición Total <span className="text-error">*</span></label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="form-input font-bold"
                                            value={temp.manualCurrentValue || ''}
                                            onChange={(e) => setTemp({ ...temp, manualCurrentValue: Number(e.target.value) })}
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-xs text-muted mt-2">
                                        Ingresá el costo de reposición total para este stock al cierre.
                                    </p>
                                </div>

                                {temp.manualCurrentValue ? (
                                    <div className="rxt-preview-box">
                                        <div className="rxt-preview-header">
                                            <span>Resultado por Tenencia estimado:</span>
                                        </div>
                                        <div className="rxt-preview-details">
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">Valor Corriente:</span>
                                                <span className="font-mono">{formatCurrencyARS(temp.manualCurrentValue)}</span>
                                            </div>
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">(-) Valor Homogéneo:</span>
                                                <span className="font-mono text-muted">{formatCurrencyARS(baselineHomog || 0)}</span>
                                            </div>
                                            <div className="rxt-preview-divider"></div>
                                            <div className="rxt-preview-total">
                                                <span className="font-bold">Resultado (RxT):</span>
                                                <span className={`font-mono font-bold tabular-nums ${(temp.manualCurrentValue - (baselineHomog || 0)) >= 0 ? 'text-success' : 'text-error'}`}>
                                                    {(temp.manualCurrentValue - (baselineHomog || 0)) >= 0 ? '+' : ''}
                                                    {formatCurrencyARS(temp.manualCurrentValue - (baselineHomog || 0))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : (profileType === 'moneda_extranjera' || isUSD) ? (
                            /* MONEDA EXTRANJERA */
                            <div className="animate-fade-in">
                                <div className="flex items-center justify-between bg-slate-50 rounded p-3 mb-4 border border-slate-200">
                                    <span className="text-sm font-medium text-slate-600">Existencia USD (Origen)</span>
                                    <span className="font-mono font-bold text-slate-800">US$ {formatNumber(sourceUsdAmount || 0, 2)}</span>
                                </div>

                                <div className="mb-4">
                                    <label className="form-label">Tipo de Cambio Cierre <span className="text-error">*</span></label>
                                    <input
                                        type="number"
                                        className="form-input font-bold"
                                        value={temp.tcCierre || ''}
                                        onChange={(e) => setTemp({ ...temp, tcCierre: Number(e.target.value) })}
                                        placeholder="Ej: 1050.50"
                                        autoFocus
                                    />
                                    <p className="text-xs text-muted mt-2">
                                        Cotización del dólar al cierre del ejercicio.
                                    </p>
                                </div>

                                {temp.tcCierre ? (
                                    <div className="rxt-preview-box">
                                        <div className="rxt-preview-header">
                                            <span>Resultado por Tenencia estimado:</span>
                                        </div>
                                        <div className="rxt-preview-details">
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">Valor Corriente (USD × TC):</span>
                                                <span className="font-mono">{formatCurrencyARS((sourceUsdAmount || 0) * temp.tcCierre)}</span>
                                            </div>
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">(-) Valor Homogéneo:</span>
                                                <span className="font-mono text-muted">{formatCurrencyARS(baselineHomog || 0)}</span>
                                            </div>
                                            <div className="rxt-preview-divider"></div>
                                            <div className="rxt-preview-total">
                                                <span className="font-bold">Resultado (RxT):</span>
                                                <span className={`font-mono font-bold tabular-nums ${((sourceUsdAmount || 0) * temp.tcCierre - (baselineHomog || 0)) >= 0 ? 'text-success' : 'text-error'}`}>
                                                    {((sourceUsdAmount || 0) * temp.tcCierre - (baselineHomog || 0)) >= 0 ? '+' : ''}
                                                    {formatCurrencyARS((sourceUsdAmount || 0) * temp.tcCierre - (baselineHomog || 0))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            /* GENERICO */
                            <div className="animate-fade-in">
                                <div className="mb-4">
                                    <label className="form-label">Valor Corriente (Manual) <span className="text-error">*</span></label>
                                    <input
                                        type="number"
                                        className="form-input font-bold"
                                        value={temp.manualCurrentValue || ''}
                                        onChange={(e) => setTemp({ ...temp, manualCurrentValue: Number(e.target.value) })}
                                        placeholder="Valor de mercado / VNR"
                                        autoFocus
                                    />
                                </div>

                                {temp.manualCurrentValue ? (
                                    <div className="rxt-preview-box">
                                        <div className="rxt-preview-header">
                                            <span>Resultado por Tenencia estimado:</span>
                                        </div>
                                        <div className="rxt-preview-details">
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">Valor Corriente:</span>
                                                <span className="font-mono">{formatCurrencyARS(temp.manualCurrentValue)}</span>
                                            </div>
                                            <div className="rxt-preview-row">
                                                <span className="text-muted">(-) Valor Homogéneo:</span>
                                                <span className="font-mono text-muted">{formatCurrencyARS(baselineHomog || 0)}</span>
                                            </div>
                                            <div className="rxt-preview-divider"></div>
                                            <div className="rxt-preview-total">
                                                <span className="font-bold">Resultado (RxT):</span>
                                                <span className={`font-mono font-bold tabular-nums ${(temp.manualCurrentValue - (baselineHomog || 0)) >= 0 ? 'text-success' : 'text-error'}`}>
                                                    {(temp.manualCurrentValue - (baselineHomog || 0)) >= 0 ? '+' : ''}
                                                    {formatCurrencyARS(temp.manualCurrentValue - (baselineHomog || 0))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="drawer-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        Guardar Valuación
                    </button>
                </div>
            </div>

            <style>{`
                /* AxI Locked Card - Prototype Style */
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
                    box-shadow: var(--shadow-sm);
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

                /* RxT Preview Box - Prototype Style */
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
                    max-width: 500px;
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
                .drawer-footer {
                    padding: var(--space-lg);
                    border-top: 1px solid var(--color-border);
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-md);
                    background: var(--surface-1);
                }
                .font-mono { font-family: var(--font-mono); }
                .tabular-nums { font-variant-numeric: tabular-nums; }
                .text-muted { color: var(--color-text-secondary); }
                .text-success { color: var(--color-success); }
                .text-error { color: var(--color-error); }
                .font-bold { font-weight: 700; }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 8px;
                    border-radius: 9999px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    background: var(--surface-2);
                    color: var(--color-text-secondary);
                }

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
