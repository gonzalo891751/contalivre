import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import {
    createAccount,
    updateAccount,
    deleteAccount,
    generateNextCode,
    hasChildren,
} from '../storage/accounts'
import type { Account, AccountKind, AccountSection, StatementGroup } from '../core/models'
import { getDefaultNormalSide } from '../core/models'
import AccountSearchSelect from '../ui/AccountSearchSelect'
import {
    AccountsHero,
    AccountsToolbar,
    AccountsTreeTable,
    ImportWizard,
    type TreeNode,
} from '../components/accounts'

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
    { value: 'ASSET', label: 'Activo' },
    { value: 'LIABILITY', label: 'Pasivo' },
    { value: 'EQUITY', label: 'Patrimonio Neto' },
    { value: 'INCOME', label: 'Ingreso' },
    { value: 'EXPENSE', label: 'Gasto/Costo' },
]

const SECTION_OPTIONS: Record<AccountKind, { value: AccountSection; label: string }[]> = {
    ASSET: [
        { value: 'CURRENT', label: 'Corriente' },
        { value: 'NON_CURRENT', label: 'No Corriente' },
    ],
    LIABILITY: [
        { value: 'CURRENT', label: 'Corriente' },
        { value: 'NON_CURRENT', label: 'No Corriente' },
    ],
    EQUITY: [
        { value: 'CURRENT', label: 'Capital y Reservas' },
    ],
    INCOME: [
        { value: 'OPERATING', label: 'Operativo' },
        { value: 'FINANCIAL', label: 'Financiero' },
        { value: 'OTHER', label: 'Otros' },
    ],
    EXPENSE: [
        { value: 'COST', label: 'Costo de ventas' },
        { value: 'ADMIN', label: 'Administración' },
        { value: 'SELLING', label: 'Comercialización' },
        { value: 'FINANCIAL', label: 'Financiero' },
        { value: 'OTHER', label: 'Otros' },
    ],
}

function buildTree(accounts: Account[]): TreeNode[] {
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []

    // Create nodes
    for (const acc of accounts) {
        map.set(acc.id, { ...acc, children: [] })
    }

    // Build hierarchy
    for (const acc of accounts) {
        const node = map.get(acc.id)!
        if (acc.parentId && map.has(acc.parentId)) {
            map.get(acc.parentId)!.children.push(node)
        } else {
            roots.push(node)
        }
    }

    return roots
}

export default function Cuentas() {
    const [searchQuery, setSearchQuery] = useState('')
    const [filterKind, setFilterKind] = useState<AccountKind | ''>('')
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
    const [initialExpansionDone, setInitialExpansionDone] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isImportOpen, setIsImportOpen] = useState(false)
    const [editingAccount, setEditingAccount] = useState<Account | null>(null)
    const [advancedMode, setAdvancedMode] = useState(false)
    const [error, setError] = useState('')

    // Form state
    const [formParentId, setFormParentId] = useState<string | null>(null)
    const [formCode, setFormCode] = useState('')
    const [formName, setFormName] = useState('')
    const [formKind, setFormKind] = useState<AccountKind>('ASSET')
    const [formSection, setFormSection] = useState<AccountSection>('CURRENT')
    const [formGroup, setFormGroup] = useState('')
    const [formIsContra, setFormIsContra] = useState(false)
    const [formIsHeader, setFormIsHeader] = useState(false)

    const allAccounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())

    const tree = useMemo(() => {
        if (!allAccounts) return []
        let filtered = allAccounts

        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(
                (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
            )
        }

        if (filterKind) {
            filtered = filtered.filter((a) => a.kind === filterKind)
        }

        return buildTree(filtered)
    }, [allAccounts, searchQuery, filterKind])

    // Calculate max level for KPI
    const maxLevel = useMemo(() => {
        if (!allAccounts || allAccounts.length === 0) return 0
        return Math.max(...allAccounts.map(a => a.level)) + 1
    }, [allAccounts])

    // Auto-expand level 1 nodes (root accounts) on initial load
    useEffect(() => {
        if (allAccounts && !initialExpansionDone) {
            const level1Ids = allAccounts
                .filter(a => a.parentId === null)
                .map(a => a.id)
            setExpandedNodes(new Set(level1Ids))
            setInitialExpansionDone(true)
        }
    }, [allAccounts, initialExpansionDone])

    // Auto-expand parents when search matches child nodes
    useEffect(() => {
        if (!allAccounts || !searchQuery) return

        const q = searchQuery.toLowerCase()
        const matchingIds = new Set(
            allAccounts
                .filter(a => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
                .map(a => a.id)
        )

        // Collect all parent IDs that need to be expanded
        const parentsToExpand = new Set<string>()
        for (const acc of allAccounts) {
            if (matchingIds.has(acc.id) && acc.parentId) {
                let parentId: string | null = acc.parentId
                while (parentId) {
                    parentsToExpand.add(parentId)
                    const parent = allAccounts.find(a => a.id === parentId)
                    parentId = parent?.parentId ?? null
                }
            }
        }

        if (parentsToExpand.size > 0) {
            setExpandedNodes(prev => new Set([...prev, ...parentsToExpand]))
        }
    }, [allAccounts, searchQuery])

    const toggleExpand = (id: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const expandAll = () => {
        if (!allAccounts) return
        setExpandedNodes(new Set(allAccounts.map((a) => a.id)))
    }

    const collapseAll = () => {
        setExpandedNodes(new Set())
    }

    const openModal = async (account?: Account) => {
        setError('')
        setAdvancedMode(false)

        if (account) {
            // Edit mode
            setEditingAccount(account)
            setFormParentId(account.parentId)
            setFormCode(account.code)
            setFormName(account.name)
            setFormKind(account.kind)
            setFormSection(account.section)
            setFormGroup(account.group)
            setFormIsContra(account.isContra)
            setFormIsHeader(account.isHeader)
        } else {
            // Create mode
            setEditingAccount(null)
            setFormParentId(null)
            setFormCode('')
            setFormName('')
            setFormKind('ASSET')
            setFormSection('CURRENT')
            setFormGroup('')
            setFormIsContra(false)
            setFormIsHeader(false)

            // Generate initial code
            const nextCode = await generateNextCode(null)
            setFormCode(nextCode)
        }

        setIsModalOpen(true)
    }

    const handleParentChange = async (parentId: string | null) => {
        setFormParentId(parentId)

        if (!editingAccount) {
            const nextCode = await generateNextCode(parentId)
            setFormCode(nextCode)

            // Inherit kind/section from parent
            if (parentId) {
                const parent = allAccounts?.find((a) => a.id === parentId)
                if (parent) {
                    setFormKind(parent.kind)
                    setFormSection(parent.section)
                    setFormGroup(parent.group)
                }
            }
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        try {
            const accountData = {
                code: formCode,
                name: formName,
                kind: formKind,
                section: formSection,
                group: formGroup || formName,
                statementGroup: null as StatementGroup | null,
                parentId: formParentId,
                normalSide: getDefaultNormalSide(formKind),
                isContra: formIsContra,
                isHeader: formIsHeader,
            }

            if (editingAccount) {
                await updateAccount(editingAccount.id, accountData)
            } else {
                await createAccount(accountData)
            }

            setIsModalOpen(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        }
    }

    const handleDelete = async (account: Account) => {
        const kids = await hasChildren(account.id)
        if (kids) {
            alert('No se puede eliminar: la cuenta tiene subcuentas')
            return
        }

        if (!confirm(`¿Seguro que querés eliminar "${account.name}"?`)) {
            return
        }

        try {
            await deleteAccount(account.id)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'No se pudo eliminar')
        }
    }

    return (
        <div className="accounts-page">
            {/* Hero Section */}
            <AccountsHero
                totalAccounts={allAccounts?.length ?? 0}
                totalLevels={maxLevel}
                isBalanced={true}
                onImport={() => setIsImportOpen(true)}
                onNewAccount={() => openModal()}
            />

            {/* Toolbar */}
            <AccountsToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                filterKind={filterKind}
                onFilterChange={setFilterKind}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
            />

            {/* Tree Table */}
            <AccountsTreeTable
                tree={tree}
                expandedNodes={expandedNodes}
                onToggleExpand={toggleExpand}
                onEdit={openModal}
                onDelete={handleDelete}
                totalAccounts={allAccounts?.length ?? 0}
            />

            {/* Import Wizard */}
            <ImportWizard
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                accounts={allAccounts ?? []}
                onComplete={() => {
                    // Dexie live query auto-refreshes
                }}
            />

            {/* New/Edit Account Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" style={{ maxWidth: '550px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}
                            </h3>
                            <button className="btn btn-icon btn-secondary" onClick={() => setIsModalOpen(false)}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {error && (
                                    <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                                        {error}
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Cuenta madre (opcional)</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <AccountSearchSelect
                                                accounts={allAccounts || []}
                                                value={formParentId || ''}
                                                onChange={(id) => handleParentChange(id || null)}
                                                placeholder="Buscar cuenta madre..."
                                                filter={(a) => a.isHeader && a.id !== editingAccount?.id}
                                            />
                                        </div>
                                        {formParentId && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => handleParentChange(null)}
                                                title="Quitar madre (volver a raíz)"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    <div className="form-help-text">
                                        {formParentId ?
                                            'Se asignará como subcuenta de la seleccionada.' :
                                            'Se creará como una cuenta raíz (sin madre).'
                                        }
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Código (automático)</label>
                                    <input
                                        type="text"
                                        className="form-input font-mono"
                                        value={formCode}
                                        onChange={(e) => setFormCode(e.target.value)}
                                        readOnly={!advancedMode}
                                        style={{ background: advancedMode ? 'white' : 'var(--color-bg)' }}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Nombre</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="Ej: Bancos cuenta corriente"
                                        required
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Tipo</label>
                                        <select
                                            className="form-select"
                                            value={formKind}
                                            onChange={(e) => {
                                                const k = e.target.value as AccountKind
                                                setFormKind(k)
                                                setFormSection(SECTION_OPTIONS[k][0].value)
                                            }}
                                            disabled={!!formParentId}
                                        >
                                            {KIND_OPTIONS.map((k) => (
                                                <option key={k.value} value={k.value}>
                                                    {k.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Clasificación</label>
                                        <select
                                            className="form-select"
                                            value={formSection}
                                            onChange={(e) => setFormSection(e.target.value as AccountSection)}
                                            disabled={!!formParentId}
                                        >
                                            {SECTION_OPTIONS[formKind].map((s) => (
                                                <option key={s.value} value={s.value}>
                                                    {s.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={advancedMode}
                                            onChange={(e) => setAdvancedMode(e.target.checked)}
                                        />
                                        Modo avanzado
                                    </label>
                                </div>

                                {advancedMode && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                        <div className="form-group">
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formIsHeader}
                                                    onChange={(e) => setFormIsHeader(e.target.checked)}
                                                />
                                                Cuenta rubro (no imputable)
                                            </label>
                                        </div>

                                        <div className="form-group">
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formIsContra}
                                                    onChange={(e) => setFormIsContra(e.target.checked)}
                                                />
                                                Contra-cuenta (regularizadora)
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
