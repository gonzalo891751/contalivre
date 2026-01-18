/**
 * RT6Drawer - Drawer component for configuring RT6 partidas
 */

import { useState, useEffect, useMemo } from 'react';
import type { PartidaRT6, LotRT6, GrupoContable, IndexRow, RT6ProfileType } from '../../../core/cierre-valuacion';
import {
    createDefaultPartidaRT6,
    createDefaultLotRT6,
    getPeriodFromDate,
    getIndexForPeriod,
    calculateCoef,
    formatNumber,
    formatCurrencyARS,
    getRubrosByGroup,
    getAccountMetadata,
    ExtendedGrupo
} from '../../../core/cierre-valuacion';
import { Account } from '../../../core/models';
import { getAllAccounts } from '../../../storage/accounts';
import { AccountAutocomplete } from './AccountAutocomplete';
import { RubroAutocomplete } from './RubroAutocomplete';

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

const GRUPO_OPTIONS: { value: GrupoContable; label: string }[] = [
    { value: 'ACTIVO', label: 'Activo' },
    { value: 'PASIVO', label: 'Pasivo' },
    { value: 'PN', label: 'Patrimonio Neto' },
];

const PROFILE_OPTIONS: { value: RT6ProfileType; label: string; description: string }[] = [
    { value: 'mercaderias', label: 'Mercaderías (Stock)', description: 'Múltiples lotes de compra con fechas distintas' },
    { value: 'moneda_extranjera', label: 'Moneda Extranjera', description: 'USD con tipo de cambio de ingreso' },
    { value: 'generic', label: 'Genérico', description: 'Fecha origen + Base histórica ARS' },
];

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
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);

    // Dynamic Rubros based on selected Group
    const [availableRubros, setAvailableRubros] = useState<Account[]>([]);
    // We store the selected Rubro Code for filtering accounts
    const [selectedRubroCode, setSelectedRubroCode] = useState<string>('');
    // Contra warning
    const [isContra, setIsContra] = useState(false);

    // Load accounts for Rubro lookup
    useEffect(() => {
        getAllAccounts().then(setAllAccounts);
    }, []);

    // Effect: Update available Rubros when Group changes or accounts load
    useEffect(() => {
        if (!temp?.grupo || !allAccounts.length) {
            setAvailableRubros([]);
            return;
        }

        const group: ExtendedGrupo = temp.grupo as ExtendedGrupo;
        const rubros = getRubrosByGroup(group, allAccounts);
        setAvailableRubros(rubros);

    }, [temp?.grupo, allAccounts]);

    // Initialize temp state when drawer opens (and Repair Legacy Data)
    useEffect(() => {
        if (isOpen) {
            if (editingId) {
                const existing = partidas.find((p) => p.id === editingId);
                if (existing) {
                    const clone = JSON.parse(JSON.stringify(existing)) as PartidaRT6;

                    // REPAIR / SYNC LOGIC:
                    // If we have an account code, it is the master source of truth.
                    // We re-derive group and check if rubro is valid.
                    if (clone.cuentaCodigo && allAccounts.length > 0) {
                        const accountObj = allAccounts.find(a => a.code === clone.cuentaCodigo);
                        const meta = getAccountMetadata(clone.cuentaCodigo, accountObj);

                        // 1. Force Group match
                        // Ensure compatibility: If meta.group is 'RESULTADOS', it might not effectively be a valid RT6 group 
                        // depending on business logic, but strict typing requires a check.
                        // Assuming 'RESULTADOS' is not valid for RT6 items typically (unless CoGS), 
                        // but if it happens, we cast it. However, strict type 'GrupoContable' excludes 'RESULTADOS'.
                        // We might need to extend 'GrupoContable' or handle this case.
                        // For now, only repairing if it is a valid target group.
                        if (meta.group !== 'RESULTADOS' && clone.grupo !== meta.group) {
                            console.warn(`[RT6] Fixing group for ${clone.cuentaCodigo}: ${clone.grupo} -> ${meta.group}`);
                            clone.grupo = meta.group as GrupoContable;
                        }

                        // 2. Set strict rubro filtering if possible
                        // If the stored rubroLabel matches a known header, set the code.
                        // Ideally we should look up the parent of the accountObj if available.
                        if (accountObj && accountObj.parentId) {
                            const parent = allAccounts.find(a => a.id === accountObj.parentId);
                            if (parent) {
                                setSelectedRubroCode(parent.code);
                                // Optional: Update label if it was empty/legacy 'Otros'
                                if (!clone.rubroLabel || clone.rubro === 'Otros') {
                                    clone.rubroLabel = parent.name;
                                }
                            }
                        } else {
                            // Fallback: match by label
                            const rubroHeader = allAccounts.find(a => a.isHeader && a.name === clone.rubroLabel);
                            if (rubroHeader) {
                                setSelectedRubroCode(rubroHeader.code);
                            }
                        }

                        // Set Contra flag
                        setIsContra(meta.isContra);
                    }

                    setTemp(clone);
                }
            } else {
                // NEW: Start completely empty (no defaults)
                setTemp({
                    ...createDefaultPartidaRT6(),
                    grupo: 'ACTIVO', // Default group is fine but rubro/account must be empty.
                    // Actually user wants "Grupo: placeholder Seleccionar...",
                    // but our PartidaRT6 type enforces GrupoContable enum.
                    // We'll default to ACTIVO but clear rubro clearly.
                    rubroLabel: '',
                    cuentaCodigo: '',
                    cuentaNombre: '',
                    profileType: undefined,
                });
                setSelectedRubroCode('');
                setIsContra(false);
            }
        } else {
            setTemp(null);
            setSelectedRubroCode('');
            setIsContra(false);
        }
    }, [isOpen, editingId, partidas, allAccounts]); // Depend on allAccounts to run repair

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
    const handleGroupChange = (newGroup: GrupoContable) => {
        if (temp) {
            setTemp({
                ...temp,
                grupo: newGroup,
                rubroLabel: '',   // Reset rubro
                cuentaCodigo: '', // Reset account
                cuentaNombre: '',
            });
            setSelectedRubroCode('');
            setIsContra(false);
        }
    };

    const handleRubroChange = (newRubroLabel: string) => {
        if (temp) {
            setTemp({ ...temp, rubroLabel: newRubroLabel, cuentaCodigo: '', cuentaNombre: '' });
            setIsContra(false);

            // Attempt to resolve code for strict filtering
            const found = availableRubros.find(r => r.name === newRubroLabel);
            if (found) {
                setSelectedRubroCode(found.code);
            } else {
                setSelectedRubroCode('');
            }
        }
    };

    // Update account handler to check contra
    const handleAccountChange = (val: { code: string; name: string }) => {
        if (!temp) return;

        const accountObj = allAccounts.find(a => a.code === val.code);
        const meta = getAccountMetadata(val.code, accountObj);

        setTemp({
            ...temp,
            cuentaCodigo: val.code,
            cuentaNombre: val.name,
        });
        setIsContra(meta.isContra);
    };

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

    // Auto-detect profile from rubro name if not set
    const effectiveProfile = temp.profileType || (
        temp.rubroLabel?.toLowerCase().includes('mercader') ? 'mercaderias' :
            temp.rubroLabel?.toLowerCase().includes('moneda') || temp.rubroLabel?.toLowerCase().includes('caja') ? 'moneda_extranjera' :
                'generic'
    );

    // For moneda extranjera, compute base from USD * TC
    const usdComputedBase = (temp.usdAmount || 0) * (temp.tcIngreso || 0);

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
                    {/* Grupo, Rubro & Account */}
                    <div className="drawer-form-row">
                        <div className="form-group" style={{ flex: '0 0 140px' }}>
                            <label className="form-label">Grupo</label>
                            <select
                                className="form-select"
                                value={temp.grupo}
                                onChange={(e) => handleGroupChange(e.target.value as GrupoContable)}
                            >
                                {GRUPO_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Rubro</label>
                            <RubroAutocomplete
                                value={temp.rubroLabel || ''}
                                onChange={handleRubroChange}
                                options={availableRubros.map(r => ({ code: r.code, name: r.name }))}
                                placeholder="Seleccionar..."
                            />
                            <div className="text-xs text-muted mt-1">
                                {selectedRubroCode ? `Filtro: ${selectedRubroCode}.*` : 'Escriba o seleccione para filtrar'}
                            </div>
                        </div>

                        {/* Account Picker */}
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                            <label className="form-label">
                                Cuenta Contable
                                {isContra && <span className="badge badge-orange ml-sm">Regularizadora (R)</span>}
                            </label>
                            <AccountAutocomplete
                                value={{ code: temp.cuentaCodigo || '', name: temp.cuentaNombre }}
                                onChange={handleAccountChange}
                                rubroPrefix={selectedRubroCode}
                                placeholder={selectedRubroCode ? `Buscar en ${temp.rubroLabel}...` : "Buscar cuenta..."}
                            />
                            {/* Validation Hint */}
                            {selectedRubroCode && temp.cuentaCodigo && !temp.cuentaCodigo.startsWith(selectedRubroCode) && (
                                <div className="text-error text-xs mt-1">
                                    ⚠️ La cuenta no pertenece al rubro seleccionado.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Profile Type Selector */}
                    <div className="drawer-profile-selector">
                        <label className="form-label">Tipo de Partida</label>
                        <div className="profile-options">
                            {PROFILE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`profile-option ${effectiveProfile === opt.value ? 'active' : ''}`}
                                    onClick={() => setTemp({ ...temp, profileType: opt.value })}
                                >
                                    <span className="profile-option-icon">
                                        {opt.value === 'mercaderias' ? '📦' : opt.value === 'moneda_extranjera' ? '💵' : '📋'}
                                    </span>
                                    <span className="profile-option-label">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="drawer-section">
                        {/* MERCADERIAS PROFILE */}
                        {effectiveProfile === 'mercaderias' && (
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
                        )}

                        {/* MONEDA EXTRANJERA PROFILE */}
                        {effectiveProfile === 'moneda_extranjera' && (
                            <>
                                <div className="drawer-section-header">
                                    <span className="drawer-section-title">💵 Moneda Extranjera</span>
                                </div>
                                <p className="text-muted text-sm mb-sm">
                                    Ingresá el monto en USD y el tipo de cambio de la fecha de ingreso:
                                </p>
                                <div className="drawer-grid">
                                    <div className="form-group">
                                        <label className="form-label">Fecha Ingreso</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={temp.items[0]?.fechaOrigen || ''}
                                            onChange={(e) => {
                                                const newItem = {
                                                    id: temp.items[0]?.id || 'new',
                                                    fechaOrigen: e.target.value,
                                                    importeBase: usdComputedBase,
                                                };
                                                setTemp({ ...temp, items: [newItem] });
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Monto USD</label>
                                        <div className="input-icon-wrapper">
                                            <span className="input-prefix">US$</span>
                                            <input
                                                type="number"
                                                className="form-input input-with-prefix"
                                                value={temp.usdAmount || ''}
                                                onChange={(e) => {
                                                    const usd = Number(e.target.value);
                                                    const base = usd * (temp.tcIngreso || 0);
                                                    const newItem = {
                                                        id: temp.items[0]?.id || 'new',
                                                        fechaOrigen: temp.items[0]?.fechaOrigen || '',
                                                        importeBase: base,
                                                    };
                                                    setTemp({ ...temp, usdAmount: usd, items: [newItem] });
                                                }}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">TC Ingreso ($/USD)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={temp.tcIngreso || ''}
                                            onChange={(e) => {
                                                const tc = Number(e.target.value);
                                                const base = (temp.usdAmount || 0) * tc;
                                                const newItem = {
                                                    id: temp.items[0]?.id || 'new',
                                                    fechaOrigen: temp.items[0]?.fechaOrigen || '',
                                                    importeBase: base,
                                                };
                                                setTemp({ ...temp, tcIngreso: tc, items: [newItem] });
                                            }}
                                            placeholder="Ej: 950.00"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Base Histórica (ARS)</label>
                                        <div className="computed-value">
                                            <span className="font-mono">{formatCurrencyARS(usdComputedBase)}</span>
                                            <span className="text-xs text-muted">USD × TC</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* GENERIC PROFILE */}
                        {effectiveProfile === 'generic' && (
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

                /* Profile Selector */
                .drawer-profile-selector {
                    margin-bottom: var(--space-md);
                }
                .profile-options {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--space-sm);
                    margin-top: var(--space-sm);
                }
                .profile-option {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-xs);
                    padding: var(--space-md);
                    background: var(--surface-2);
                    border: 2px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .profile-option:hover {
                    border-color: var(--brand-primary);
                    background: rgba(59, 130, 246, 0.05);
                }
                .profile-option.active {
                    border-color: var(--brand-primary);
                    background: rgba(59, 130, 246, 0.1);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
                }
                .profile-option-icon {
                    font-size: 1.5rem;
                }
                .profile-option-label {
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    text-align: center;
                }

                /* Computed Value Display */
                .computed-value {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    padding: var(--space-sm);
                    background: var(--surface-1);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                }
                .computed-value .font-mono {
                    font-size: var(--font-size-md);
                    font-weight: 700;
                    color: var(--brand-primary);
                }

                /* Input with prefix */
                .input-icon-wrapper {
                    position: relative;
                }
                .input-prefix {
                    position: absolute;
                    left: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    font-weight: 600;
                }
                .input-with-prefix {
                    padding-left: 42px;
                }
            `}</style>
        </div>
    );
}
