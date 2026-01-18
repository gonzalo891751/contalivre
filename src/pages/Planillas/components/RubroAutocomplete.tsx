import { useState, useEffect, useRef } from 'react';

interface RubroOption {
    code: string;
    name: string;
}

interface RubroAutocompleteProps {
    value: string; // rubro label / name
    onChange: (label: string) => void;
    options: RubroOption[];
    placeholder?: string;
    disabled?: boolean;
}

export function RubroAutocomplete({
    value,
    onChange,
    options,
    placeholder = 'Seleccionar rubro...',
    disabled = false,
}: RubroAutocompleteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<RubroOption[]>([]);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Sync query with value on open or value change
    useEffect(() => {
        if (!isOpen && value) {
            // When closed, if we have a value, finding it might be nice but 
            // the value is just a string label. We just keep query empty or matching?
            // Actually, keep query empty so user can type afresh, or set it to value?
            // Existing AccountAutocomplete sets it to displayValue.
            // Let's set it to value.
            setQuery(value);
        }
    }, [value, isOpen]);

    // Filter options based on query
    useEffect(() => {
        if (!query) {
            setFilteredOptions(options);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const filtered = options.filter(
            (opt) =>
                opt.name.toLowerCase().includes(lowerQuery) ||
                opt.code.toLowerCase().startsWith(lowerQuery)
        );
        setFilteredOptions(filtered);
        setHighlightIndex(0);
    }, [query, options]);

    const handleSelect = (option: RubroOption) => {
        onChange(option.name);
        setQuery(option.name);
        setIsOpen(false);
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
                setHighlightIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightIndex]) {
                    handleSelect(filteredOptions[highlightIndex]);
                } else if (query) {
                    // Allow custom value? Requirement says "searchable dropdown". 
                    // Usually strict selection logic is preferred for Rubros to ensure code mapping.
                    // But let's allow custom if they really want, or just select the first?
                    // For now, consistent with AccountAutocomplete which allows manual.
                    onChange(query);
                    setIsOpen(false);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setQuery(value || '');
                break;
        }
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
        <div className="rubro-autocomplete">
            <input
                ref={inputRef}
                type="text"
                className="form-input"
                value={isOpen ? query : value}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    setQuery(''); // clear on focus to show all? or keep value?
                    // Better UX: select all text?
                    // For now, let's just open.
                    setIsOpen(true);
                }}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                placeholder={placeholder}
                disabled={disabled}
            />

            {isOpen && filteredOptions.length > 0 && (
                <ul ref={listRef} className="rubro-dropdown">
                    {filteredOptions.map((opt, idx) => (
                        <li
                            key={opt.code}
                            className={`rubro-option ${idx === highlightIndex ? 'highlighted' : ''}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(opt);
                            }}
                            onMouseEnter={() => setHighlightIndex(idx)}
                        >
                            <span className="rubro-code">{opt.code}</span>
                            <span className="rubro-name">{opt.name}</span>
                        </li>
                    ))}
                </ul>
            )}

            <style>{`
                .rubro-autocomplete {
                    position: relative;
                    width: 100%;
                }
                .rubro-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    z-index: 100;
                    background: var(--surface-1);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-lg);
                    max-height: 280px;
                    overflow-y: auto;
                    margin: 8px 0 0 0;
                    padding: 4px;
                    list-style: none;
                }
                .rubro-option {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-sm) var(--space-md);
                    cursor: pointer;
                    border-radius: var(--radius-md);
                    transition: all 0.15s ease;
                }
                .rubro-option:not(:last-child) {
                    margin-bottom: 2px;
                }
                .rubro-option.highlighted {
                    background: var(--surface-2);
                    color: var(--brand-primary);
                }
                .rubro-code {
                    font-family: var(--font-mono);
                    font-size: 0.7rem;
                    color: var(--color-text-secondary);
                    min-width: 60px;
                    background: var(--surface-3);
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-align: center;
                }
                .rubro-name {
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    flex: 1;
                }
                .rubro-option.highlighted .rubro-code {
                   background: rgba(59, 130, 246, 0.1);
                   color: var(--brand-primary);
                }
            `}</style>
        </div>
    );
}
