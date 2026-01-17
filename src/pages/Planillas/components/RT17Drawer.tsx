/**
 * RT17Drawer - Drawer component for configuring RT17 valuations
 */

import { useState, useEffect, useMemo } from 'react';
import type { PartidaRT17, LotUSD, RT17Type } from '../../../core/cierre-valuacion';
import {
    createDefaultPartidaRT17,
    createDefaultLotUSD,
    formatNumber,
    formatCurrencyARS,
} from '../../../core/cierre-valuacion';
import { AccountAutocomplete } from './AccountAutocomplete';

interface RT17DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingId: string | null;
    partidas: PartidaRT17[];
    onSave: (partida: PartidaRT17) => void;
}

const TYPE_OPTIONS: { value: RT17Type; label: string }[] = [
    { value: 'USD', label: 'Moneda Extranjera (USD)' },
    { value: 'Otros', label: 'Otros (Manual)' },
];

export function RT17Drawer({
    isOpen,
    onClose,
    editingId,
    partidas,
    onSave,
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

    // Computed values for USD
    const computedUSD = useMemo(() => {
        if (!temp || temp.type !== 'USD' || !temp.usdItems) return [];
        return temp.usdItems.map((item) => {
            const valCorriente = item.usd * item.tcCierre;
            const resTenencia = valCorriente - item.baseArs;
            return { ...item, valCorriente, resTenencia };
        });
    }, [temp]);

    const totalUSD = computedUSD.reduce((s, i) => s + i.usd, 0);
    const totalBase = computedUSD.reduce((s, i) => s + i.baseArs, 0);
    const totalCorriente = computedUSD.reduce((s, i) => s + i.valCorriente, 0);
    const totalResTenencia = totalCorriente - totalBase;

    // Handlers
    const handleSave = () => {
        if (temp) {
            onSave(temp);
        }
    };

    const handleAddLot = () => {
        if (temp) {
            setTemp({
                ...temp,
                usdItems: [...(temp.usdItems || []), createDefaultLotUSD()],
            });
        }
    };

    const handleUpdateLot = (index: number, updates: Partial<LotUSD>) => {
        if (temp && temp.usdItems) {
            const newItems = [...temp.usdItems];
            newItems[index] = { ...newItems[index], ...updates };
            setTemp({ ...temp, usdItems: newItems });
        }
    };

    const handleRemoveLot = (index: number) => {
        if (temp && temp.usdItems) {
            setTemp({
                ...temp,
                usdItems: temp.usdItems.filter((_, i) => i !== index),
            });
        }
    };

    if (!isOpen || !temp) return null;

    const isUSD = temp.type === 'USD';

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <div className="drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                    <h3>{editingId ? 'Editar Valuación (RT17)' : 'Nueva Valuación (RT17)'}</h3>
                    <button className="drawer-close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="drawer-body">
                    {/* Type & Account */}
                    <div className="drawer-grid">
                        <div className="form-group">
                            <label className="form-label">Tipo Valuación</label>
                            <select
                                className="form-select"
                                value={temp.type}
                                onChange={(e) =>
                                    setTemp({ ...temp, type: e.target.value as RT17Type })
                                }
                            >
                                {TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cuenta</label>
                            <AccountAutocomplete
                                value={{ code: temp.cuentaCodigo || '', name: temp.cuentaNombre }}
                                onChange={(val) => setTemp({
                                    ...temp,
                                    cuentaCodigo: val.code,
                                    cuentaNombre: val.name,
                                })}
                                rubroFilter={isUSD ? 'USD' : undefined}
                                placeholder="Buscar cuenta..."
                            />
                        </div>
                    </div>

                    {/* Subform based on type */}
                    <div className="drawer-section">
                        {isUSD ? (
                            <>
                                <p className="text-muted text-sm mb-sm">
                                    Lotes de moneda extranjera:
                                </p>

                                {temp.usdItems?.map((item, idx) => (
                                    <div key={item.id} className="drawer-usd-lot">
                                        <div className="drawer-usd-row">
                                            <div className="form-group">
                                                <label className="form-label-mini">Fecha Ingreso</label>
                                                <input
                                                    type="date"
                                                    className="form-input"
                                                    value={item.fechaIngreso}
                                                    onChange={(e) =>
                                                        handleUpdateLot(idx, {
                                                            fechaIngreso: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label-mini">Cantidad USD</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={item.usd || ''}
                                                    onChange={(e) =>
                                                        handleUpdateLot(idx, {
                                                            usd: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="drawer-usd-row">
                                            <div className="form-group">
                                                <label className="form-label-mini">TC Cierre</label>
                                                <input
                                                    type="number"
                                                    className="form-input form-input-highlight"
                                                    value={item.tcCierre || ''}
                                                    onChange={(e) =>
                                                        handleUpdateLot(idx, {
                                                            tcCierre: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label-mini">Base Histórica (ARS)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={item.baseArs || ''}
                                                    onChange={(e) =>
                                                        handleUpdateLot(idx, {
                                                            baseArs: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <button
                                                className="btn btn-icon btn-danger-soft"
                                                onClick={() => handleRemoveLot(idx)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <button className="btn btn-link" onClick={handleAddLot}>
                                    + Agregar Lote USD
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Valor Corriente (ARS)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={temp.manualCurrentValue || ''}
                                        onChange={(e) =>
                                            setTemp({
                                                ...temp,
                                                manualCurrentValue: Number(e.target.value),
                                            })
                                        }
                                        placeholder="Valor de mercado / VNR"
                                    />
                                </div>
                                <div className="drawer-info-box">
                                    Se comparará contra la base histórica o ajustada (si existe)
                                    para determinar el Resultado por Tenencia.
                                </div>
                            </>
                        )}
                    </div>

                    {/* Totals preview for USD */}
                    {isUSD && (temp.usdItems?.length || 0) > 0 && (
                        <div className="drawer-totals">
                            <div className="drawer-totals-row">
                                <span>Total USD:</span>
                                <span className="font-mono">US$ {formatNumber(totalUSD, 2)}</span>
                            </div>
                            <div className="drawer-totals-row">
                                <span>Base Histórica:</span>
                                <span className="font-mono">{formatCurrencyARS(totalBase)}</span>
                            </div>
                            <div className="drawer-totals-row">
                                <span>Valor Corriente:</span>
                                <span className="font-mono font-bold">
                                    {formatCurrencyARS(totalCorriente)}
                                </span>
                            </div>
                            <div className="drawer-totals-row drawer-totals-highlight">
                                <span>Resultado x Tenencia:</span>
                                <span
                                    className={`font-mono font-bold ${totalResTenencia > 0 ? 'text-success' : 'text-error'
                                        }`}
                                >
                                    {totalResTenencia > 0 ? '+' : ''}
                                    {formatCurrencyARS(totalResTenencia)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="drawer-footer">
                    <div className="drawer-footer-right">
                        <button className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button className="btn btn-primary" onClick={handleSave}>
                            Guardar Valuación
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                .drawer-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 50;
                    display: flex;
                    justify-content: flex-end;
                    background: rgba(15, 23, 42, 0.2);
                    backdrop-filter: blur(4px);
                }
                .drawer {
                    width: 100%;
                    max-width: 540px;
                    background: var(--surface-1);
                    height: 100%;
                    box-shadow: var(--shadow-lg);
                    display: flex;
                    flex-direction: column;
                    animation: slideIn 0.3s ease;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .drawer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md) var(--space-lg);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--surface-2);
                }
                .drawer-header h3 {
                    font-size: var(--font-size-lg);
                    font-weight: 600;
                    margin: 0;
                }
                .drawer-close {
                    background: none;
                    border: none;
                    font-size: 1.25rem;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    padding: var(--space-xs);
                    border-radius: var(--radius-sm);
                }
                .drawer-close:hover { background: var(--surface-3); }
                .drawer-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--space-lg);
                }
                .drawer-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--space-md);
                    margin-bottom: var(--space-md);
                }
                .drawer-section {
                    background: var(--surface-2);
                    border-radius: var(--radius-md);
                    padding: var(--space-md);
                    border: 1px solid var(--color-border);
                    margin-bottom: var(--space-md);
                }
                .drawer-usd-lot {
                    padding-bottom: var(--space-md);
                    margin-bottom: var(--space-md);
                    border-bottom: 1px solid var(--color-border);
                }
                .drawer-usd-lot:last-of-type {
                    border-bottom: none;
                    margin-bottom: 0;
                    padding-bottom: 0;
                }
                .drawer-usd-row {
                    display: flex;
                    gap: var(--space-sm);
                    align-items: flex-end;
                    margin-bottom: var(--space-sm);
                }
                .drawer-usd-row .form-group { flex: 1; margin-bottom: 0; }
                .form-label-mini {
                    display: block;
                    font-size: 0.65rem;
                    color: var(--color-text-muted);
                    margin-bottom: 2px;
                }
                .form-input-highlight {
                    border-color: var(--color-success);
                    background: rgba(16, 185, 129, 0.05);
                }
                .drawer-info-box {
                    background: var(--color-info-bg);
                    padding: var(--space-sm);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-xs);
                    color: var(--brand-primary);
                    margin-top: var(--space-sm);
                }
                .drawer-totals {
                    background: var(--color-info-bg);
                    border-radius: var(--radius-md);
                    padding: var(--space-sm) var(--space-md);
                }
                .drawer-totals-row {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--space-xs) 0;
                    font-size: var(--font-size-sm);
                }
                .drawer-totals-highlight {
                    border-top: 1px solid rgba(59, 130, 246, 0.2);
                    margin-top: var(--space-xs);
                    padding-top: var(--space-sm);
                }
                .drawer-footer {
                    display: flex;
                    justify-content: flex-end;
                    padding: var(--space-md) var(--space-lg);
                    border-top: 1px solid var(--color-border);
                    background: var(--surface-2);
                }
                .drawer-footer-right {
                    display: flex;
                    gap: var(--space-sm);
                }
                .btn-link {
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    font-weight: 500;
                    cursor: pointer;
                    padding: var(--space-sm) 0;
                }
                .btn-link:hover { text-decoration: underline; }
                .btn-icon {
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .text-sm { font-size: var(--font-size-sm); }
                .text-muted { color: var(--color-text-secondary); }
                .text-success { color: var(--color-success); }
                .text-error { color: var(--color-error); }
                .font-mono { font-family: var(--font-mono); }
                .font-bold { font-weight: 700; }
                .mb-sm { margin-bottom: var(--space-sm); }
            `}</style>
        </div>
    );
}
