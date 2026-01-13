import { ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react'
import type { Account, AccountKind } from '../../core/models'

interface TreeNode extends Account {
    children: TreeNode[]
}

interface AccountsTreeTableProps {
    tree: TreeNode[]
    expandedNodes: Set<string>
    onToggleExpand: (id: string) => void
    onEdit: (account: Account) => void
    onDelete: (account: Account) => void
    totalAccounts: number
}

// Get badge class for account type
function getTypeBadgeClass(kind: AccountKind): string {
    const classes: Record<AccountKind, string> = {
        ASSET: 'activo',
        LIABILITY: 'pasivo',
        EQUITY: 'patrimonio',
        INCOME: 'ingreso',
        EXPENSE: 'egreso',
    }
    return classes[kind] || 'activo'
}

// Get display label for account type based on section
function getTypeLabel(account: Account): string | null {
    // Hide for root rubros and Equity/Results
    if (account.level === 0 || ['EQUITY', 'INCOME', 'EXPENSE'].includes(account.kind)) {
        return null
    }

    // Show for Asset/Liability based on code prefix
    if (account.code.startsWith('1.1') || account.code.startsWith('2.1')) return 'Corriente'
    if (account.code.startsWith('1.2') || account.code.startsWith('2.2')) return 'No Corriente'

    return null
}

interface AccountRowProps {
    node: TreeNode
    level: number
    expandedNodes: Set<string>
    onToggleExpand: (id: string) => void
    onEdit: (account: Account) => void
    onDelete: (account: Account) => void
}

function AccountRow({
    node,
    level,
    expandedNodes,
    onToggleExpand,
    onEdit,
    onDelete
}: AccountRowProps) {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children.length > 0
    const isHeader = hasChildren || node.isHeader
    const typeLabel = getTypeLabel(node)

    return (
        <>
            <div className="accounts-tree-row">
                {/* Code Column */}
                <div className="accounts-tree-code">{node.code}</div>

                {/* Name Column */}
                <div className="accounts-tree-name-cell">
                    {/* Indentation */}
                    {level > 0 && (
                        <div
                            className="accounts-tree-indent"
                            style={{ width: `${level * 24}px` }}
                        >
                            <div className="accounts-tree-indent-line" />
                        </div>
                    )}

                    {/* Expand/Collapse Button */}
                    <button
                        className={`accounts-tree-expand-btn ${isExpanded ? 'expanded' : ''} ${!hasChildren ? 'hidden' : ''}`}
                        onClick={() => onToggleExpand(node.id)}
                        disabled={!hasChildren}
                    >
                        <ChevronRight size={14} />
                    </button>

                    {/* Account Name */}
                    <span className={`accounts-tree-name ${isHeader ? 'header' : 'leaf'}`}>
                        {node.name}
                    </span>

                    {/* Badges */}
                    {node.isContra && (
                        <span
                            className="accounts-tree-type-badge egreso"
                            style={{ marginLeft: '0.5rem', fontSize: '0.6rem' }}
                        >
                            Contra
                        </span>
                    )}
                </div>

                {/* Type Column */}
                <div>
                    {typeLabel && (
                        <span className={`accounts-tree-type-badge ${getTypeBadgeClass(node.kind)}`}>
                            {typeLabel}
                        </span>
                    )}
                </div>

                {/* Actions Column */}
                <div className="accounts-tree-actions">
                    <button
                        className="accounts-tree-action-btn"
                        onClick={() => onEdit(node)}
                        title="Editar"
                    >
                        <MoreHorizontal size={16} />
                    </button>
                    <button
                        className="accounts-tree-action-btn delete"
                        onClick={() => onDelete(node)}
                        title="Eliminar"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Render children if expanded */}
            {isExpanded && node.children.map((child) => (
                <AccountRow
                    key={child.id}
                    node={child}
                    level={level + 1}
                    expandedNodes={expandedNodes}
                    onToggleExpand={onToggleExpand}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </>
    )
}

export default function AccountsTreeTable({
    tree,
    expandedNodes,
    onToggleExpand,
    onEdit,
    onDelete,
    totalAccounts,
}: AccountsTreeTableProps) {
    return (
        <div className="accounts-tree">
            {/* Header */}
            <div className="accounts-tree-header">
                <div>Código</div>
                <div>Cuenta</div>
                <div>Tipo</div>
                <div>Acciones</div>
            </div>

            {/* Body */}
            <div>
                {tree.length === 0 ? (
                    <div className="accounts-tree-empty">
                        <p>No se encontraron cuentas con ese criterio.</p>
                    </div>
                ) : (
                    tree.map((node) => (
                        <AccountRow
                            key={node.id}
                            node={node}
                            level={0}
                            expandedNodes={expandedNodes}
                            onToggleExpand={onToggleExpand}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="accounts-tree-total">
                Total: {totalAccounts} cuentas
            </div>
        </div>
    )
}

export type { TreeNode }
