/**
 * MonetaryAccountsPanel - Panel for Monetary Accounts Classification
 *
 * Displays monetary accounts grouped by ACTIVO/PASIVO with validation and
 * reclassification actions.
 */

import { useMemo } from 'react';
import type { Account } from '../../../core/models';
import type { AccountBalance } from '../../../core/ledger/computeBalances';
import type { AccountOverride } from '../../../core/cierre-valuacion/types';
import {
    getInitialMonetaryClass,
    applyOverrides,
    isValidated,
    getAccountType,
    type MonetaryClass,
} from '../../../core/cierre-valuacion/monetary-classification';
import { formatCurrencyARS, formatNumber } from '../../../core/cierre-valuacion';

export interface MonetaryAccount {
    account: Account;
    balance: number;
    classification: MonetaryClass;
    isAuto: boolean;
    isValidated: boolean;
}

interface MonetaryAccountsPanelProps {
    accounts: Account[];
    balances: Map<string, AccountBalance>;
    overrides: Record<string, AccountOverride>;
    onToggleClassification: (accountId: string, currentClass: MonetaryClass) => void;
    onMarkValidated: (accountId: string) => void;
    onMarkAllValidated: () => void;
    onExclude: (accountId: string) => void;
}

export function MonetaryAccountsPanel({
    accounts,
    balances,
    overrides,
    onToggleClassification,
    onMarkValidated,
    onMarkAllValidated,
    onExclude,
}: MonetaryAccountsPanelProps) {
    // Classify and group accounts
    const { activosMon, pasivosMon, totals } = useMemo(() => {
        const activosMon: MonetaryAccount[] = [];
        const pasivosMon: MonetaryAccount[] = [];

        for (const account of accounts) {
            // Skip header accounts
            if (account.isHeader) continue;

            // Get classification
            const initialClass = getInitialMonetaryClass(account);
            const finalClass = applyOverrides(account.id, initialClass, overrides);

            // Only include monetary accounts
            if (finalClass !== 'MONETARY') continue;

            // Get balance
            const balance = balances.get(account.id);
            if (!balance) continue;

            const monetaryAcc: MonetaryAccount = {
                account,
                balance: balance.balance,
                classification: finalClass,
                isAuto: !overrides[account.id]?.classification,
                isValidated: isValidated(account.id, overrides),
            };

            // Group by account type
            const accountType = getAccountType(account);
            if (accountType === 'ACTIVO') {
                activosMon.push(monetaryAcc);
            } else if (accountType === 'PASIVO') {
                pasivosMon.push(monetaryAcc);
            }
        }

        // Calculate totals
        const totalActivosMon = activosMon.reduce((sum, a) => sum + Math.abs(a.balance), 0);
        const totalPasivosMon = pasivosMon.reduce((sum, a) => sum + Math.abs(a.balance), 0);
        const netoMon = totalActivosMon - totalPasivosMon;

        return {
            activosMon,
            pasivosMon,
            totals: {
                totalActivosMon,
                totalPasivosMon,
                netoMon,
            },
        };
    }, [accounts, balances, overrides]);

    const hasPendingValidations = useMemo(() => {
        return [...activosMon, ...pasivosMon].some(a => !a.isValidated);
    }, [activosMon, pasivosMon]);

    return (
        <div className="monetary-panel">
            {/* Summary Bar */}
            <div className="monetary-summary">
                <div className="monetary-summary-stats">
                    <div className="monetary-summary-item">
                        <span className="monetary-summary-label">Activo Mon.</span>
                        <span className="monetary-summary-value text-primary">
                            {formatCurrencyARS(totals.totalActivosMon)}
                        </span>
                    </div>
                    <div className="monetary-summary-divider" />
                    <div className="monetary-summary-item">
                        <span className="monetary-summary-label">Pasivo Mon.</span>
                        <span className="monetary-summary-value text-warning">
                            {formatCurrencyARS(totals.totalPasivosMon)}
                        </span>
                    </div>
                    <div className="monetary-summary-divider" />
                    <div className="monetary-summary-item">
                        <span className="monetary-summary-label">Neto (RECPAM)</span>
                        <span className="monetary-summary-value font-bold">
                            {formatCurrencyARS(totals.netoMon)}
                        </span>
                    </div>
                </div>
                {hasPendingValidations && (
                    <button
                        className="btn btn-sm btn-success"
                        onClick={onMarkAllValidated}
                    >
                        ✓ Marcar todo validado
                    </button>
                )}
            </div>

            <div className="monetary-grid">
                {/* Activos Monetarios */}
                <div className="monetary-section">
                    <div className="monetary-section-header">
                        <div className="monetary-section-badge activo" />
                        <h3 className="monetary-section-title">Activos Monetarios</h3>
                    </div>
                    <div className="monetary-table-container">
                        <table className="monetary-table">
                            <thead>
                                <tr>
                                    <th>Cuenta</th>
                                    <th className="text-right">Saldo</th>
                                    <th className="text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activosMon.map((item) => (
                                    <MonetaryAccountRow
                                        key={item.account.id}
                                        item={item}
                                        onToggle={() => onToggleClassification(item.account.id, item.classification)}
                                        onValidate={() => onMarkValidated(item.account.id)}
                                        onExclude={() => onExclude(item.account.id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pasivos Monetarios */}
                <div className="monetary-section">
                    <div className="monetary-section-header">
                        <div className="monetary-section-badge pasivo" />
                        <h3 className="monetary-section-title">Pasivos Monetarios</h3>
                    </div>
                    <div className="monetary-table-container">
                        <table className="monetary-table">
                            <thead>
                                <tr>
                                    <th>Cuenta</th>
                                    <th className="text-right">Saldo</th>
                                    <th className="text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pasivosMon.map((item) => (
                                    <MonetaryAccountRow
                                        key={item.account.id}
                                        item={item}
                                        onToggle={() => onToggleClassification(item.account.id, item.classification)}
                                        onValidate={() => onMarkValidated(item.account.id)}
                                        onExclude={() => onExclude(item.account.id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <style>{`
                .monetary-panel {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }

                /* Summary Bar */
                .monetary-summary {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md);
                    background: var(--surface-2);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                }
                .monetary-summary-stats {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                }
                .monetary-summary-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }
                .monetary-summary-label {
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--color-text-secondary);
                }
                .monetary-summary-value {
                    font-family: var(--font-mono);
                    font-size: var(--font-size-lg);
                    font-weight: 700;
                }
                .monetary-summary-divider {
                    width: 1px;
                    height: 2rem;
                    background: var(--color-border);
                }

                /* Grid */
                .monetary-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: var(--space-lg);
                }

                /* Section */
                .monetary-section {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                }
                .monetary-section-header {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                }
                .monetary-section-badge {
                    width: 4px;
                    height: 1.25rem;
                    border-radius: 2px;
                }
                .monetary-section-badge.activo {
                    background: var(--brand-primary);
                }
                .monetary-section-badge.pasivo {
                    background: #F59E0B;
                }
                .monetary-section-title {
                    font-size: var(--font-size-md);
                    font-weight: 700;
                    margin: 0;
                }

                /* Table */
                .monetary-table-container {
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                }
                .monetary-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: var(--font-size-sm);
                }
                .monetary-table thead {
                    background: var(--surface-2);
                    border-bottom: 2px solid var(--color-border);
                }
                .monetary-table th {
                    padding: var(--space-xs) var(--space-md);
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--color-text-secondary);
                    text-align: left;
                }
                .monetary-table td {
                    padding: var(--space-sm) var(--space-md);
                    border-bottom: 1px solid rgba(0, 0, 0, 0.03);
                }

                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .text-primary { color: var(--brand-primary); }
                .text-warning { color: #F59E0B; }
                .font-bold { font-weight: 700; }
            `}</style>
        </div>
    );
}

interface MonetaryAccountRowProps {
    item: MonetaryAccount;
    onToggle: () => void;
    onValidate: () => void;
    onExclude?: () => void; // Optional for future use
}

function MonetaryAccountRow({ item, onToggle, onValidate, onExclude: _onExclude }: MonetaryAccountRowProps) {
    const rowClass = item.isValidated ? '' : 'monetary-row-pending';

    return (
        <tr className={`monetary-row ${rowClass}`}>
            <td>
                <div className="monetary-account-cell">
                    <div className="monetary-account-name">{item.account.name}</div>
                    <div className="monetary-account-meta">
                        <span className="monetary-account-code">{item.account.code}</span>
                        {item.isAuto && (
                            <span className="badge badge-auto">AUTO</span>
                        )}
                        {item.isValidated && (
                            <span className="badge badge-validated">✓ Validado</span>
                        )}
                    </div>
                </div>
            </td>
            <td className="text-right font-mono">
                {formatNumber(Math.abs(item.balance), 2)}
            </td>
            <td className="text-center">
                <div className="monetary-actions">
                    <button
                        className="btn-icon-sm"
                        onClick={onToggle}
                        title="Reclasificar como No Monetaria"
                    >
                        ↔️
                    </button>
                    {!item.isValidated && (
                        <button
                            className="btn-icon-sm"
                            onClick={onValidate}
                            title="Marcar como Validado"
                        >
                            ✓
                        </button>
                    )}
                </div>
            </td>

            <style>{`
                .monetary-row {
                    transition: background 0.15s;
                }
                .monetary-row:hover {
                    background: var(--surface-2);
                }
                .monetary-row-pending {
                    background: rgba(251, 191, 36, 0.05);
                }

                .monetary-account-cell {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }
                .monetary-account-name {
                    font-weight: 500;
                }
                .monetary-account-meta {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                }
                .monetary-account-code {
                    font-size: var(--font-size-xs);
                    font-family: var(--font-mono);
                    color: var(--color-text-secondary);
                }

                .badge {
                    font-size: 0.65rem;
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                    font-weight: 600;
                }
                .badge-auto {
                    background: #DBEAFE;
                    color: #1D4ED8;
                    border: 1px solid #93C5FD;
                }
                .badge-validated {
                    color: var(--color-success);
                    font-size: var(--font-size-xs);
                }

                .monetary-actions {
                    display: flex;
                    gap: var(--space-xs);
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.15s;
                }
                .monetary-row:hover .monetary-actions {
                    opacity: 1;
                }

                .btn-icon-sm {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
                    transition: background 0.15s;
                }
                .btn-icon-sm:hover {
                    background: var(--surface-3);
                }

                .font-mono {
                    font-family: var(--font-mono);
                }
            `}</style>
        </tr>
    );
}
