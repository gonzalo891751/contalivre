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

const KIND_BADGES: Record<AccountKind, string> = {
    ASSET: 'badge-activo',
    LIABILITY: 'badge-pasivo',
    EQUITY: 'badge-patrimonio',
    INCOME: 'badge-ingreso',
    EXPENSE: 'badge-gasto',
}

interface TreeNode extends Account {
    children: TreeNode[]
    expanded?: boolean
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

function AccountRow({
    node,
    level,
    expandedNodes,
    toggleExpand,
    onEdit,
    onDelete,
}: {
    node: TreeNode
    level: number
    expandedNodes: Set<string>
    toggleExpand: (id: string) => void
    onEdit: (account: Account) => void
    onDelete: (account: Account) => void
}) {
    const isExpanded = expandedNodes.has(node.id)
    const hasKids = node.children.length > 0
    const indent = level * 20

    // Detect if this is a "Mother" account
    const isParentAccount = hasKids || node.isHeader

    // Determine row class based on level
    const rowClass = level === 0
        ? 'account-row-level-0'
        : level === 1
            ? 'account-row-level-1'
            : 'account-row-leaf'

    // Display Type Logic
    const getDisplayType = () => {
        // Hide for root rubros and Equity/Results
        if (level === 0 || ['EQUITY', 'INCOME', 'EXPENSE'].includes(node.kind)) return null

        // Show for Asset/Liability based on code prefix
        if (node.code.startsWith('1.1') || node.code.startsWith('2.1')) return 'Corriente'
        if (node.code.startsWith('1.2') || node.code.startsWith('2.2')) return 'No Corriente'

        return null
    }

    const displayType = getDisplayType()

    return (
        <>
            <tr className={rowClass}>
                <td style={{ paddingLeft: `${indent + 8}px`, paddingTop: '10px', paddingBottom: '10px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {hasKids ? (
                            <button
                                className="btn btn-icon btn-sm"
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    padding: 0,
                                    cursor: 'pointer',
                                    color: 'var(--color-primary)'
                                }}
                                onClick={() => toggleExpand(node.id)}
                            >
                                {isExpanded ? '▼' : '▶'}
                            </button>
                        ) : (
                            <span style={{ width: '24px', display: 'inline-block' }} />
                        )}
                        <span className="font-mono" style={{ fontWeight: level <= 1 ? 'bold' : 'normal' }}>
                            {node.code}
                        </span>
                    </span>
                </td>
                <td style={{ paddingTop: '10px', paddingBottom: '10px' }}>
                    <span>{node.name}</span>

                    {node.isContra && (
                        <span className="badge" style={{ marginLeft: '8px', background: '#fce4ec', color: '#c62828', fontSize: '10px', fontWeight: 600 }}>
                            Contra
                        </span>
                    )}
                    {node.isHeader && level > 1 && (
                        <span className="badge" style={{ marginLeft: '8px', background: '#e3f2fd', color: '#1565c0', fontSize: '10px', fontWeight: 600 }}>
                            Rubro
                        </span>
                    )}
                </td>
                <td style={{ paddingTop: '10px', paddingBottom: '10px' }}>
                    {displayType && (
                        <span className={`badge ${KIND_BADGES[node.kind]}`} style={{ opacity: isParentAccount ? 1 : 0.85 }}>
                            {displayType}
                        </span>
                    )}
                </td>
                <td style={{ paddingTop: '10px', paddingBottom: '10px' }}>
                    <div className="account-row-actions" style={{ opacity: isParentAccount ? 1 : 0.6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => onEdit(node)}>
                            Editar
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => onDelete(node)}>
                            ✕
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded &&
                node.children.map((child) => (
                    <AccountRow
                        key={child.id}
                        node={child}
                        level={level + 1}
                        expandedNodes={expandedNodes}
                        toggleExpand={toggleExpand}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                ))}
        </>
    )
}

export default function Cuentas() {
    const [searchQuery, setSearchQuery] = useState('')
    const [filterKind, setFilterKind] = useState<AccountKind | ''>('')
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
    const [initialExpansionDone, setInitialExpansionDone] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
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
        <div>
            <header className="page-header">
                <h1 className="page-title">Plan de Cuentas</h1>
                <p className="page-subtitle">
                    Estructura jerárquica de cuentas. Hacé clic en ▶ para expandir rubros.
                </p>
            </header>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="flex-between gap-md" style={{ flexWrap: 'wrap' }}>
                    <div className="flex gap-md" style={{ flex: 1 }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Buscar por código o nombre..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ maxWidth: '300px' }}
                        />
                        <select
                            className="form-select"
                            value={filterKind}
                            onChange={(e) => setFilterKind(e.target.value as AccountKind | '')}
                            style={{ maxWidth: '180px' }}
                        >
                            <option value="">Todos los tipos</option>
                            {KIND_OPTIONS.map((k) => (
                                <option key={k.value} value={k.value}>
                                    {k.label}
                                </option>
                            ))}
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={expandAll}>
                            Expandir todo
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={collapseAll}>
                            Colapsar
                        </button>
                    </div>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        + Nueva cuenta
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '200px' }}>Código</th>
                                <th>Nombre</th>
                                <th style={{ width: '120px' }}>Tipo</th>
                                <th style={{ width: '120px' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tree.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center text-muted" style={{ padding: 'var(--space-xl)' }}>
                                        No se encontraron cuentas
                                    </td>
                                </tr>
                            ) : (
                                tree.map((node) => (
                                    <AccountRow
                                        key={node.id}
                                        node={node}
                                        level={0}
                                        expandedNodes={expandedNodes}
                                        toggleExpand={toggleExpand}
                                        onEdit={openModal}
                                        onDelete={handleDelete}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {allAccounts && (
                    <div className="text-muted text-right" style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)' }}>
                        Total: {allAccounts.length} cuentas
                    </div>
                )}
            </div>

            {/* Modal */}
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
