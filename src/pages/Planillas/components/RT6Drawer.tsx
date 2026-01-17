/**
 * RT6Drawer - Drawer component for configuring RT6 partidas
 */

import { useState, useEffect, useMemo } from 'react';
import type { PartidaRT6, LotRT6, RubroType, IndexRow } from '../../../core/cierre-valuacion';
import {
    createDefaultPartidaRT6,
    createDefaultLotRT6,
    getPeriodFromDate,
    getIndexForPeriod,
    calculateCoef,
    formatNumber,
    formatCurrencyARS,
} from '../../../core/cierre-valuacion';
import { AccountAutocomplete } from './AccountAutocomplete';

interface RT6DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingId: string | null;
    partidas: PartidaRT6[];
    indices: IndexRow[];
    closingPeriod: string;
    onSave: (partida: PartidaRT6) => void;
    onDelete: (id: string) => void;
}

const RUBRO_OPTIONS: { value: RubroType; label: string }[] = [
    { value: 'Mercaderias', label: 'Mercaderías (Stock)' },
    { value: 'BienesUso', label: 'Bienes de Uso' },
    { value: 'Capital', label: 'Capital / Aportes' },
    { value: 'Otros', label: 'Otros (Manual)' },
];

// Map rubro to filter type
const RUBRO_FILTER_MAP: Record<RubroType, RubroType | undefined> = {
    Mercaderias: 'Mercaderias',
    BienesUso: 'BienesUso',
    Capital: 'Capital',
    Otros: undefined,
};

export function RT6Drawer({
    isOpen,
    onClose,
    editingId,
    partidas,
    indices,
    closingPeriod,
    onSave,
    onDelete,
}: RT6DrawerProps) {
    const [temp, setTemp] = useState<PartidaRT6 | null>(null);

    // Initialize temp state when drawer opens
    useEffect(() => {
        if (isOpen) {
            if (editingId) {
                const existing = partidas.find((p) => p.id === editingId);
                if (existing) {
                    setTemp(JSON.parse(JSON.stringify(existing)));
                }
            } else {
                setTemp(createDefaultPartidaRT6());
            }
        } else {
            setTemp(null);
        }
    }, [isOpen, editingId, partidas]);

    // Index helpers
    const closingIndex = getIndexForPeriod(indices, closingPeriod);

    const getCoefForDate = (date: string) => {
        const period = getPeriodFromDate(date);
        const baseIndex = getIndexForPeriod(indices, period);
        return calculateCoef(closingIndex, baseIndex);
    };

    // Computed totals
    const computedItems = useMemo(() => {
        if (!temp) return [];
        return temp.items.map((item) => {
            const coef = getCoefForDate(item.fechaOrigen);
            const homog = item.importeBase * coef;
            return { ...item, coef, homog, recpam: homog - item.importeBase };
        });
    }, [temp, indices, closingPeriod]);

    const totalBase = computedItems.reduce((s, i) => s + i.importeBase, 0);
    const totalHomog = computedItems.reduce((s, i) => s + i.homog, 0);
    const totalRecpam = totalHomog - totalBase;

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
                items: [...temp.items, createDefaultLotRT6()],
            });
        }
    };

    const handleUpdateLot = (index: number, updates: Partial<LotRT6>) => {
        if (temp) {
            const newItems = [...temp.items];
            newItems[index] = { ...newItems[index], ...updates };
            setTemp({ ...temp, items: newItems });
        }
    };

    const handleRemoveLot = (index: number) => {
        if (temp) {
            setTemp({
                ...temp,
                items: temp.items.filter((_, i) => i !== index),
            });
        }
    };

    const handleDelete = () => {
        if (editingId && confirm('¿Eliminar esta partida?')) {
            onDelete(editingId);
            onClose();
        }
    };

    if (!isOpen || !temp) return null;

    const isMercaderias = temp.rubro === 'Mercaderias';

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <div className="drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                    <h3>{editingId ? 'Editar Partida (RT6)' : 'Nueva Partida (RT6)'}</h3>
                    <button className="drawer-close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="drawer-body">
                    {/* Rubro & Account */}
                    <div className="drawer-grid">
                        <div className="form-group">
                            <label className="form-label">Rubro</label>
                            <select
                                className="form-select"
                                value={temp.rubro}
                                onChange={(e) =>
                                    setTemp({ ...temp, rubro: e.target.value as RubroType })
                                }
                            >
                                {RUBRO_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cuenta Contable</label>
                            <AccountAutocomplete
                                value={{ code: temp.cuentaCodigo, name: temp.cuentaNombre }}
                                onChange={(val) => setTemp({
                                    ...temp,
                                    cuentaCodigo: val.code,
                                    cuentaNombre: val.name,
                                })}
                                rubroFilter={RUBRO_FILTER_MAP[temp.rubro]}
                                placeholder="Buscar cuenta..."
                            />
                        </div>
                    </div>

                    {/* Subform based on rubro */}
                    <div className="drawer-section">
                        {isMercaderias ? (
                            <>
                                <div className="drawer-section-header">
                                    <span className="drawer-section-title">Lotes de compras</span>
                                    <div className="drawer-tabs">
                                        <button className="drawer-tab active">Manual</button>
                                        <button className="drawer-tab" disabled title="Próximamente">
                                            📦 Inventario
                                        </button>
                                    </div>
                                </div>
                                <p className="text-muted text-sm mb-sm">
                                    Cargá los lotes de compra históricos:
                                </p>

                                {temp.items.map((item, idx) => (
                                    <div key={item.id} className="drawer-lot-row">
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={item.fechaOrigen}
                                            onChange={(e) =>
                                                handleUpdateLot(idx, { fechaOrigen: e.target.value })
                                            }
                                        />
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={item.importeBase || ''}
                                            onChange={(e) =>
                                                handleUpdateLot(idx, {
                                                    importeBase: Number(e.target.value),
                                                })
                                            }
                                            placeholder="Importe base"
                                        />
                                        <span className="drawer-lot-coef">
                                            ×{formatNumber(computedItems[idx]?.coef || 1, 4)}
                                        </span>
                                        <button
                                            className="btn btn-icon btn-danger-soft"
                                            onClick={() => handleRemoveLot(idx)}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}

                                <button className="btn btn-link" onClick={handleAddLot}>
                                    + Agregar Lote
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-muted text-sm mb-sm">Datos de la partida:</p>
                                <div className="drawer-grid">
                                    <div className="form-group">
                                        <label className="form-label">Fecha Origen</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={temp.items[0]?.fechaOrigen || ''}
                                            onChange={(e) => {
                                                const newItem = {
                                                    id: temp.items[0]?.id || 'new',
                                                    fechaOrigen: e.target.value,
                                                    importeBase: temp.items[0]?.importeBase || 0,
                                                };
                                                setTemp({ ...temp, items: [newItem] });
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Valor Origen (ARS)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={temp.items[0]?.importeBase || ''}
                                            onChange={(e) => {
                                                const newItem = {
                                                    id: temp.items[0]?.id || 'new',
                                                    fechaOrigen: temp.items[0]?.fechaOrigen || '',
                                                    importeBase: Number(e.target.value),
                                                };
                                                setTemp({ ...temp, items: [newItem] });
                                            }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Totals preview */}
                    {temp.items.length > 0 && (
                        <div className="drawer-totals">
                            <div className="drawer-totals-row">
                                <span>Total Base:</span>
                                <span className="font-mono">{formatCurrencyARS(totalBase)}</span>
                            </div>
                            <div className="drawer-totals-row">
                                <span>Total Homogéneo:</span>
                                <span className="font-mono font-bold">
                                    {formatCurrencyARS(totalHomog)}
                                </span>
                            </div>
                            <div className="drawer-totals-row drawer-totals-highlight">
                                <span>RECPAM (RT6):</span>
                                <span className="font-mono font-bold text-success">
                                    +{formatCurrencyARS(totalRecpam)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="drawer-footer">
                    {editingId && (
                        <button className="btn btn-danger-soft" onClick={handleDelete}>
                            Eliminar
                        </button>
                    )}
                    <div className="drawer-footer-right">
                        <button className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button className="btn btn-primary" onClick={handleSave}>
                            Guardar Partida
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
                .drawer-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-sm);
                }
                .drawer-section-title {
                    font-weight: 600;
                    font-size: var(--font-size-sm);
                }
                .drawer-tabs {
                    display: flex;
                    gap: var(--space-sm);
                }
                .drawer-tab {
                    background: none;
                    border: none;
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    padding: var(--space-xs) var(--space-sm);
                    border-radius: var(--radius-sm);
                }
                .drawer-tab.active {
                    color: var(--brand-primary);
                    background: var(--color-info-bg);
                }
                .drawer-tab:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .drawer-lot-row {
                    display: flex;
                    gap: var(--space-sm);
                    align-items: center;
                    margin-bottom: var(--space-sm);
                }
                .drawer-lot-row input:first-child { width: 140px; flex-shrink: 0; }
                .drawer-lot-row input:nth-child(2) { flex: 1; }
                .drawer-lot-coef {
                    font-family: var(--font-mono);
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                    width: 60px;
                    text-align: right;
                }
                .drawer-totals {
                    background: var(--color-success-bg);
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
                    border-top: 1px solid rgba(16, 185, 129, 0.2);
                    margin-top: var(--space-xs);
                    padding-top: var(--space-sm);
                }
                .drawer-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md) var(--space-lg);
                    border-top: 1px solid var(--color-border);
                    background: var(--surface-2);
                }
                .drawer-footer-right {
                    display: flex;
                    gap: var(--space-sm);
                    margin-left: auto;
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
                }
                .text-sm { font-size: var(--font-size-sm); }
                .text-muted { color: var(--color-text-secondary); }
                .text-success { color: var(--color-success); }
                .font-mono { font-family: var(--font-mono); }
                .font-bold { font-weight: 700; }
                .mb-sm { margin-bottom: var(--space-sm); }
            `}</style>
        </div>
    );
}
