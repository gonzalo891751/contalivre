/**
 * AccountAutocomplete - Reusable account picker with Plan de Cuentas integration
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Account } from '../../../core/models';
import { searchAccounts, getPostableAccounts } from '../../../storage/accounts';
import { filterAccountsByRubro, type RubroType } from '../../../core/cierre-valuacion';

interface AccountAutocompleteProps {
    value: { code: string; name: string; isManual?: boolean };
    onChange: (value: { code: string; name: string; isManual?: boolean }) => void;
    rubroFilter?: RubroType | 'USD';
    placeholder?: string;
    disabled?: boolean;
}

interface AccountOption {
    code: string;
    name: string;
    kind?: string;
    isPrioritized?: boolean;
}

export function AccountAutocomplete({
    value,
    onChange,
    rubroFilter,
    placeholder = 'Buscar cuenta...',
    disabled = false,
}: AccountAutocompleteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState<AccountOption[]>([]);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [showAll, setShowAll] = useState(false);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load accounts on mount
    useEffect(() => {
        getPostableAccounts().then(setAllAccounts);
    }, []);

    // Update options when query or filter changes
    const updateOptions = useCallback(async () => {
        let accounts = allAccounts;

        if (query) {
            accounts = await searchAccounts(query);
        }

        let finalOptions: AccountOption[] = [];

        if (rubroFilter && !showAll) {
            const { prioritized, others } = filterAccountsByRubro(rubroFilter, accounts, query);
            finalOptions = [
                ...prioritized.map(a => ({ ...a, isPrioritized: true })),
                ...others.slice(0, 5).map(a => ({ ...a, isPrioritized: false })),
            ];
        } else {
            finalOptions = accounts.slice(0, 20).map(a => ({
                code: a.code,
                name: a.name,
                kind: a.kind,
                isPrioritized: false,
            }));
        }

        setOptions(finalOptions);
        setHighlightIndex(0);
    }, [query, rubroFilter, showAll, allAccounts]);

    useEffect(() => {
        if (isOpen) {
            updateOptions();
        }
    }, [isOpen, updateOptions]);

    // Display value
    const displayValue = value.code ? `${value.code} — ${value.name}` : '';

    // Handlers
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        if (!isOpen) setIsOpen(true);
    };

    const handleSelect = (option: AccountOption) => {
        onChange({ code: option.code, name: option.name, isManual: false });
        setQuery('');
        setIsOpen(false);
    };

    const handleManualEntry = () => {
        if (query.trim()) {
            onChange({ code: '', name: query.trim(), isManual: true });
            setQuery('');
            setIsOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(i => Math.min(i + 1, options.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (options[highlightIndex]) {
                    handleSelect(options[highlightIndex]);
                } else if (query) {
                    handleManualEntry();
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setQuery('');
                break;
        }
    };

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleBlur = () => {
        // Delay to allow click on options
        setTimeout(() => setIsOpen(false), 200);
    };

    // Scroll highlighted option into view
    useEffect(() => {
        if (listRef.current && isOpen) {
            const item = listRef.current.children[highlightIndex] as HTMLElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightIndex, isOpen]);

    return (
        <div className="account-autocomplete">
            <div className="account-autocomplete-input-wrapper">
                <input
                    ref={inputRef}
                    type="text"
                    className="form-input"
                    value={isOpen ? query : displayValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    disabled={disabled}
                />
                {value.isManual && (
                    <span className="account-autocomplete-manual-chip">Manual</span>
                )}
            </div>

            {isOpen && (
                <ul ref={listRef} className="account-autocomplete-dropdown">
                    {options.length === 0 && query && (
                        <li className="account-autocomplete-empty">
                            No se encontraron cuentas.
                            <button
                                className="account-autocomplete-manual-btn"
                                onMouseDown={(e) => { e.preventDefault(); handleManualEntry(); }}
                            >
                                Usar "{query}" (manual)
                            </button>
                        </li>
                    )}

                    {options.map((opt, idx) => (
                        <li
                            key={opt.code || idx}
                            className={`account-autocomplete-option ${idx === highlightIndex ? 'highlighted' : ''
                                } ${opt.isPrioritized ? 'prioritized' : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                            onMouseEnter={() => setHighlightIndex(idx)}
                        >
                            <span className="account-autocomplete-code">{opt.code}</span>
                            <span className="account-autocomplete-name">{opt.name}</span>
                            {opt.kind && (
                                <span className={`account-autocomplete-kind badge-${opt.kind?.toLowerCase()}`}>
                                    {opt.kind}
                                </span>
                            )}
                        </li>
                    ))}

                    {rubroFilter && !showAll && options.length > 0 && (
                        <li className="account-autocomplete-show-all">
                            <button
                                onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}
                            >
                                Ver todas las cuentas
                            </button>
                        </li>
                    )}
                </ul>
            )}

            <style>{`
                .account-autocomplete {
                    position: relative;
                    width: 100%;
                }
                .account-autocomplete-input-wrapper {
                    position: relative;
                }
                .account-autocomplete-manual-chip {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 0.65rem;
                    background: var(--color-warning-bg);
                    color: var(--color-warning);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                }
                .account-autocomplete-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    z-index: 100;
                    background: var(--surface-1);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    box-shadow: var(--shadow-lg);
                    max-height: 280px;
                    overflow-y: auto;
                    margin: 0;
                    padding: 0;
                    list-style: none;
                }
                .account-autocomplete-option {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) var(--space-md);
                    cursor: pointer;
                    border-bottom: 1px solid var(--color-border);
                }
                .account-autocomplete-option:last-child {
                    border-bottom: none;
                }
                .account-autocomplete-option.highlighted {
                    background: var(--surface-2);
                }
                .account-autocomplete-option.prioritized {
                    background: rgba(59, 130, 246, 0.05);
                }
                .account-autocomplete-code {
                    font-family: var(--font-mono);
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    min-width: 80px;
                }
                .account-autocomplete-name {
                    flex: 1;
                    font-size: var(--font-size-sm);
                }
                .account-autocomplete-kind {
                    font-size: 0.6rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .badge-asset { background: #DBEAFE; color: #1D4ED8; }
                .badge-liability { background: #FEE2E2; color: #DC2626; }
                .badge-equity { background: #D1FAE5; color: #059669; }
                .badge-income { background: #FEF3C7; color: #D97706; }
                .badge-expense { background: #FCE7F3; color: #DB2777; }
                .account-autocomplete-empty {
                    padding: var(--space-md);
                    text-align: center;
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }
                .account-autocomplete-manual-btn {
                    display: block;
                    margin-top: var(--space-sm);
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    cursor: pointer;
                    font-weight: 500;
                }
                .account-autocomplete-show-all {
                    padding: var(--space-sm);
                    text-align: center;
                    border-top: 1px solid var(--color-border);
                }
                .account-autocomplete-show-all button {
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    font-size: var(--font-size-sm);
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
}
