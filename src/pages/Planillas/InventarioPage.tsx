/**
 * InventarioPage - Periodic Inventory Management
 * 
 * Main page for the inventory module with three tabs:
 * A) Movimientos - Stock movements in units (kardex)
 * B) Cierre por diferencias - CMV calculation and closing entry generation
 * C) Configuración - Module settings and account mappings
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
    InventoryProduct,
    InventoryMovement,
    InventoryClosing,
    InventoryConfig,
    TipoMovimiento,
    ProductStock,
} from '../../core/inventario/types'
import {
    createEmptyProduct,
    createEmptyMovement,
    createDraftClosing,
    DEFAULT_ACCOUNT_CODES,
} from '../../core/inventario/types'
import {
    getStockByProduct,
    validateMovement,
    generateKardex,
    getMovementTypeLabel,
} from '../../core/inventario/movements'
import {
    updateClosingCalculations,
    formatCurrencyARS,
    formatDateDisplay,
    exportClosingToCSV,
    downloadCSV,
} from '../../core/inventario/closing'
import {
    loadInventoryConfig,
    saveInventoryConfig,
    getAllProducts,
    createProduct,
    updateProduct,
    getAllMovements,
    createMovement,
    updateMovement,
    deleteMovement,
    getAllClosings,
    createClosing,
    updateClosing as updateClosingInDb,
    getLatestPostedClosing,
    getAccountBalanceByCode,
    getAccountIdByCode,
} from '../../storage'
import { createEntry } from '../../storage'
import { generateClosingEntryLines, formatClosingMemo } from '../../core/inventario/closing'

// Tabs configuration
const TABS = [
    { id: 'movimientos', label: 'Movimientos (unidades)', icon: '📦' },
    { id: 'cierre', label: 'Cierre por diferencias', icon: '📊' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
] as const

type TabId = typeof TABS[number]['id']

export default function InventarioPage() {
    // State
    const [activeTab, setActiveTab] = useState<TabId>('movimientos')
    const [config, setConfig] = useState<InventoryConfig | null>(null)
    const [products, setProducts] = useState<InventoryProduct[]>([])
    const [movements, setMovements] = useState<InventoryMovement[]>([])
    const [closings, setClosings] = useState<InventoryClosing[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Load initial data
    useEffect(() => {
        async function loadData() {
            try {
                const [loadedConfig, loadedProducts, loadedMovements, loadedClosings] = await Promise.all([
                    loadInventoryConfig(),
                    getAllProducts(),
                    getAllMovements(),
                    getAllClosings(),
                ])
                setConfig(loadedConfig)
                setProducts(loadedProducts)
                setMovements(loadedMovements)
                setClosings(loadedClosings)
                setIsLoading(false)
            } catch (err) {
                console.error('Error loading inventory data:', err)
                setError(err instanceof Error ? err.message : 'Error desconocido')
                setIsLoading(false)
            }
        }
        loadData()
    }, [])

    // Computed: stock by product
    const stockByProduct = useMemo(() =>
        getStockByProduct(products, movements),
        [products, movements]
    )

    // Save config changes
    const handleConfigChange = useCallback(async (updates: Partial<InventoryConfig>) => {
        if (!config) return
        const newConfig = { ...config, ...updates }
        setConfig(newConfig)
        await saveInventoryConfig(newConfig)
    }, [config])

    if (isLoading) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">⏳</div>
                <p>Cargando inventario...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <strong>Error:</strong> {error}
            </div>
        )
    }

    return (
        <div className="inv-page">
            {/* Header removed - Rendered in PlanillasLayout */}

            {/* Tabs */}
            <div className="tabs-pills">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-pill ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="tab-icon">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'movimientos' && config && (
                <MovimientosTab
                    products={products}
                    setProducts={setProducts}
                    movements={movements}
                    setMovements={setMovements}
                    stockByProduct={stockByProduct}
                    config={config}
                />
            )}

            {activeTab === 'cierre' && config && (
                <CierreTab
                    config={config}
                    closings={closings}
                    setClosings={setClosings}
                />
            )}

            {activeTab === 'config' && config && (
                <ConfigTab
                    config={config}
                    onConfigChange={handleConfigChange}
                />
            )}
        </div>
    )
}

// ========================================
// Tab A: Movimientos
// ========================================

interface MovimientosTabProps {
    products: InventoryProduct[]
    setProducts: React.Dispatch<React.SetStateAction<InventoryProduct[]>>
    movements: InventoryMovement[]
    setMovements: React.Dispatch<React.SetStateAction<InventoryMovement[]>>
    stockByProduct: ProductStock[]
    config: InventoryConfig
}

function MovimientosTab({
    products,
    setProducts,
    movements,
    setMovements,
    stockByProduct,
    config,
}: MovimientosTabProps) {
    const [showProductModal, setShowProductModal] = useState(false)
    const [showMovementModal, setShowMovementModal] = useState(false)
    const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
    const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null)
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

    // Handle product save
    const handleSaveProduct = async (product: InventoryProduct) => {
        try {
            if (editingProduct) {
                await updateProduct(product.id, product)
                setProducts(prev => prev.map(p => p.id === product.id ? product : p))
            } else {
                await createProduct(product)
                setProducts(prev => [...prev, product])
            }
            setShowProductModal(false)
            setEditingProduct(null)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error al guardar producto')
        }
    }

    // Note: Product delete functionality will be added in a future iteration
    // For now, products can be managed via direct database access

    // Handle movement save
    const handleSaveMovement = async (movement: InventoryMovement) => {
        const validation = validateMovement(movement, movements, config)
        if (!validation.ok) {
            alert(validation.errors.join('\n'))
            return
        }

        try {
            if (editingMovement) {
                await updateMovement(movement.id, movement)
                setMovements(prev => prev.map(m => m.id === movement.id ? movement : m))
            } else {
                await createMovement(movement)
                setMovements(prev => [movement, ...prev])
            }
            setShowMovementModal(false)
            setEditingMovement(null)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error al guardar movimiento')
        }
    }

    // Handle movement delete
    const handleDeleteMovement = async (id: string) => {
        if (!confirm('¿Eliminar este movimiento?')) return
        try {
            await deleteMovement(id)
            setMovements(prev => prev.filter(m => m.id !== id))
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error al eliminar')
        }
    }

    // Filtered movements and kardex for selected product
    const kardex = useMemo(() => {
        if (!selectedProductId) return []
        return generateKardex(movements, selectedProductId)
    }, [movements, selectedProductId])

    return (
        <>
            {/* Toolbar */}
            <div className="inv-toolbar">
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setEditingProduct(null)
                        setShowProductModal(true)
                    }}
                >
                    <span>+</span> Nuevo producto
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        if (products.length === 0) {
                            alert('Primero agregue al menos un producto')
                            return
                        }
                        setEditingMovement(null)
                        setShowMovementModal(true)
                    }}
                    disabled={products.length === 0}
                >
                    <span>+</span> Nuevo movimiento
                </button>
            </div>

            {/* Stock Summary Cards */}
            <div className="card inv-summary-card">
                <div className="card-header">
                    <h3 className="card-title">Resumen de stock</h3>
                </div>
                {stockByProduct.length === 0 ? (
                    <div className="empty-state-mini">
                        <p>No hay productos registrados</p>
                    </div>
                ) : (
                    <div className="inv-stock-grid">
                        {stockByProduct.map(({ product, currentStock, hasAlert }) => (
                            <div
                                key={product.id}
                                className={`inv-stock-card ${hasAlert ? 'inv-stock-alert' : ''} ${selectedProductId === product.id ? 'inv-stock-selected' : ''}`}
                                onClick={() => setSelectedProductId(product.id)}
                            >
                                <div className="inv-stock-sku">{product.sku || '(sin SKU)'}</div>
                                <div className="inv-stock-desc">{product.description}</div>
                                <div className="inv-stock-qty">
                                    {currentStock.toLocaleString('es-AR')} {product.unit}
                                </div>
                                {hasAlert && <span className="inv-stock-alert-badge">⚠️ Bajo</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Kardex Table */}
            {selectedProductId && (
                <div className="card inv-table-card">
                    <div className="card-header">
                        <h3 className="card-title">
                            Kardex: {products.find(p => p.id === selectedProductId)?.description}
                        </h3>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedProductId(null)}
                        >
                            Ver todos
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th className="text-right">Entrada</th>
                                    <th className="text-right">Salida</th>
                                    <th className="text-right">Saldo</th>
                                    <th>Observación</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {kardex.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center">Sin movimientos</td>
                                    </tr>
                                ) : (
                                    kardex.map(row => (
                                        <tr key={row.movement.id}>
                                            <td>{formatDateDisplay(row.movement.date)}</td>
                                            <td>
                                                <span className={`chip chip-${row.movement.type.toLowerCase()}`}>
                                                    {getMovementTypeLabel(row.movement.type)}
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                {row.entrada > 0 ? row.entrada.toLocaleString('es-AR') : '—'}
                                            </td>
                                            <td className="text-right">
                                                {row.salida > 0 ? row.salida.toLocaleString('es-AR') : '—'}
                                            </td>
                                            <td className="text-right font-semibold">
                                                {row.saldo.toLocaleString('es-AR')}
                                            </td>
                                            <td>{row.movement.observation || '—'}</td>
                                            <td>
                                                <button
                                                    className="btn btn-icon btn-secondary"
                                                    onClick={() => {
                                                        setEditingMovement(row.movement)
                                                        setShowMovementModal(true)
                                                    }}
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-icon btn-danger-soft"
                                                    onClick={() => handleDeleteMovement(row.movement.id)}
                                                    title="Eliminar"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* All Movements Table (when no product selected) */}
            {!selectedProductId && movements.length > 0 && (
                <div className="card inv-table-card">
                    <div className="card-header">
                        <h3 className="card-title">Todos los movimientos</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Producto</th>
                                    <th>Tipo</th>
                                    <th className="text-right">Cantidad</th>
                                    <th>Observación</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movements.slice(0, 50).map(mov => {
                                    const prod = products.find(p => p.id === mov.productId)
                                    return (
                                        <tr key={mov.id}>
                                            <td>{formatDateDisplay(mov.date)}</td>
                                            <td>{prod?.sku || prod?.description || '(eliminado)'}</td>
                                            <td>
                                                <span className={`chip chip-${mov.type.toLowerCase()}`}>
                                                    {getMovementTypeLabel(mov.type)}
                                                </span>
                                            </td>
                                            <td className="text-right">{mov.quantity.toLocaleString('es-AR')}</td>
                                            <td>{mov.observation || '—'}</td>
                                            <td>
                                                <button
                                                    className="btn btn-icon btn-secondary"
                                                    onClick={() => {
                                                        setEditingMovement(mov)
                                                        setShowMovementModal(true)
                                                    }}
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-icon btn-danger-soft"
                                                    onClick={() => handleDeleteMovement(mov.id)}
                                                    title="Eliminar"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Product Modal */}
            {showProductModal && (
                <ProductModal
                    product={editingProduct}
                    onSave={handleSaveProduct}
                    onClose={() => {
                        setShowProductModal(false)
                        setEditingProduct(null)
                    }}
                />
            )}

            {/* Movement Modal */}
            {showMovementModal && (
                <MovementModal
                    movement={editingMovement}
                    products={products}
                    onSave={handleSaveMovement}
                    onClose={() => {
                        setShowMovementModal(false)
                        setEditingMovement(null)
                    }}
                />
            )}
        </>
    )
}

// ========================================
// Tab B: Cierre por diferencias
// ========================================

interface CierreTabProps {
    config: InventoryConfig
    closings: InventoryClosing[]
    setClosings: React.Dispatch<React.SetStateAction<InventoryClosing[]>>
}

function CierreTab({ config: _config, closings, setClosings }: CierreTabProps) {
    const [draft, setDraft] = useState<InventoryClosing | null>(null)
    const [isCalculating, setIsCalculating] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)

    // Initialize draft for current month
    useEffect(() => {
        async function initDraft() {
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth()
            const periodStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
            const lastDay = new Date(year, month + 1, 0).getDate()
            const periodEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

            // Check for existing draft
            const existingDraft = closings.find(c => c.status === 'DRAFT')
            if (existingDraft) {
                setDraft(existingDraft)
            } else {
                // Get EI from last posted closing
                const lastPosted = await getLatestPostedClosing()
                const newDraft = createDraftClosing(periodStart, periodEnd)
                newDraft.existenciaInicial = lastPosted?.existenciaFinal || 0
                setDraft(newDraft)
            }
        }
        initDraft()
    }, [closings])

    // Calculate values from ledger
    const handleCalculate = async () => {
        if (!draft) return
        setIsCalculating(true)

        try {
            const codes = DEFAULT_ACCOUNT_CODES
            const [compras, gastosCompras, bonifCompras, devolCompras, ventas, bonifVentas, devolVentas, ivaCF, ivaDF] = await Promise.all([
                getAccountBalanceByCode(codes.compras, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.gastosCompras, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.bonifCompras, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.devolCompras, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.ventas, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.bonifVentas, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.devolVentas, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.ivaCF, draft.periodStart, draft.periodEnd),
                getAccountBalanceByCode(codes.ivaDF, draft.periodStart, draft.periodEnd),
            ])

            const updatedDraft = updateClosingCalculations({
                ...draft,
                compras: Math.abs(compras), // Expense accounts have debit balance
                gastosCompras: Math.abs(gastosCompras),
                bonifCompras: Math.abs(bonifCompras),
                devolCompras: Math.abs(devolCompras),
                ventas: Math.abs(ventas), // Income accounts have credit balance
                bonifVentas: Math.abs(bonifVentas),
                devolVentas: Math.abs(devolVentas),
                ivaCF: Math.abs(ivaCF),
                ivaDF: Math.abs(ivaDF),
            })

            setDraft(updatedDraft)
        } catch (err) {
            console.error('Error calculating closing:', err)
            alert('Error al calcular valores desde el Libro Mayor')
        } finally {
            setIsCalculating(false)
        }
    }

    // Generate closing entry
    const handleGenerateEntry = async () => {
        if (!draft) return
        if (draft.existenciaFinal <= 0) {
            alert('Ingrese la Existencia Final antes de generar el asiento')
            return
        }

        setIsGenerating(true)
        try {
            // Get account IDs
            const codes = DEFAULT_ACCOUNT_CODES
            const mercaderiasId = await getAccountIdByCode(codes.mercaderias)
            const variacionId = await getAccountIdByCode(codes.variacionExistencias)

            if (!mercaderiasId || !variacionId) {
                alert('No se encontraron las cuentas Mercaderías o Variación de existencias. Verifique el plan de cuentas.')
                return
            }

            // Get current Mercaderías balance
            const mercaderiasBalance = await getAccountBalanceByCode(codes.mercaderias)

            // Generate entry lines
            const lines = generateClosingEntryLines(
                mercaderiasBalance,
                draft.existenciaFinal,
                mercaderiasId,
                variacionId
            )

            if (lines.length === 0) {
                alert('No es necesario ajustar Mercaderías (el saldo ya coincide con EF)')
                return
            }

            // Create journal entry
            const entry = await createEntry({
                date: draft.closingDate,
                memo: formatClosingMemo(draft),
                lines,
            })

            // Update and save closing
            const finalClosing = {
                ...draft,
                journalEntryId: entry.id,
                status: 'POSTED' as const,
                updatedAt: new Date().toISOString(),
            }

            if (closings.some(c => c.id === draft.id)) {
                await updateClosingInDb(draft.id, finalClosing)
                setClosings(prev => prev.map(c => c.id === draft.id ? finalClosing : c))
            } else {
                await createClosing(finalClosing)
                setClosings(prev => [...prev, finalClosing])
            }

            setDraft(null)
            alert('✅ Asiento de cierre generado exitosamente')
        } catch (err) {
            console.error('Error generating entry:', err)
            alert(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`)
        } finally {
            setIsGenerating(false)
        }
    }

    // Update draft field
    const handleDraftChange = (field: keyof InventoryClosing, value: number | string) => {
        if (!draft) return
        const updatedDraft = updateClosingCalculations({
            ...draft,
            [field]: value,
        })
        setDraft(updatedDraft)
    }

    return (
        <>
            {/* Period Selection */}
            <div className="card inv-period-card">
                <div className="card-header">
                    <h3 className="card-title">Período de cierre</h3>
                </div>
                <div className="inv-period-grid">
                    <div className="form-group">
                        <label className="form-label">Desde</label>
                        <input
                            type="date"
                            className="form-input"
                            value={draft?.periodStart || ''}
                            onChange={e => handleDraftChange('periodStart', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Hasta</label>
                        <input
                            type="date"
                            className="form-input"
                            value={draft?.periodEnd || ''}
                            onChange={e => handleDraftChange('periodEnd', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Fecha de cierre</label>
                        <input
                            type="date"
                            className="form-input"
                            value={draft?.closingDate || ''}
                            onChange={e => handleDraftChange('closingDate', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ alignSelf: 'end' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={handleCalculate}
                            disabled={isCalculating}
                        >
                            {isCalculating ? '⏳ Calculando...' : '🔄 Calcular desde Libro Mayor'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Existencias */}
            <div className="card inv-existencias-card">
                <div className="card-header">
                    <h3 className="card-title">Existencias</h3>
                </div>
                <div className="inv-existencias-grid">
                    <div className="inv-existencia-box">
                        <label className="form-label">Existencia Inicial (EI)</label>
                        <input
                            type="number"
                            className="form-input form-input-lg"
                            value={draft?.existenciaInicial || 0}
                            onChange={e => handleDraftChange('existenciaInicial', parseFloat(e.target.value) || 0)}
                            min={0}
                            step="0.01"
                        />
                        <small className="form-help">Si es primer período, EI = 0</small>
                    </div>
                    <div className="inv-existencia-box inv-existencia-ef">
                        <label className="form-label">Existencia Final (EF)</label>
                        <input
                            type="number"
                            className="form-input form-input-lg"
                            value={draft?.existenciaFinal || 0}
                            onChange={e => handleDraftChange('existenciaFinal', parseFloat(e.target.value) || 0)}
                            min={0}
                            step="0.01"
                        />
                        <small className="form-help">Valor neto del inventario al cierre</small>
                    </div>
                </div>
            </div>

            {/* Compras Netas */}
            <div className="card inv-compras-card">
                <div className="card-header">
                    <h3 className="card-title">Compras Netas del período</h3>
                </div>
                <div className="inv-detail-rows">
                    <div className="inv-detail-row">
                        <span>Compras</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.compras || 0)}</span>
                    </div>
                    <div className="inv-detail-row">
                        <span>+ Gastos sobre compras</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.gastosCompras || 0)}</span>
                    </div>
                    <div className="inv-detail-row inv-detail-negative">
                        <span>- Bonificaciones s/compras</span>
                        <span className="inv-detail-value">({formatCurrencyARS(draft?.bonifCompras || 0)})</span>
                    </div>
                    <div className="inv-detail-row inv-detail-negative">
                        <span>- Devoluciones s/compras</span>
                        <span className="inv-detail-value">({formatCurrencyARS(draft?.devolCompras || 0)})</span>
                    </div>
                    <div className="inv-detail-row inv-detail-total">
                        <span>= Compras Netas</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.comprasNetas || 0)}</span>
                    </div>
                </div>
            </div>

            {/* CMV Calculation */}
            <div className="card inv-cmv-card">
                <div className="card-header">
                    <h3 className="card-title">Cálculo del CMV</h3>
                </div>
                <div className="inv-formula">
                    <div className="inv-formula-row">
                        <span className="inv-formula-label">EI</span>
                        <span className="inv-formula-value">{formatCurrencyARS(draft?.existenciaInicial || 0)}</span>
                    </div>
                    <div className="inv-formula-operator">+</div>
                    <div className="inv-formula-row">
                        <span className="inv-formula-label">Compras Netas</span>
                        <span className="inv-formula-value">{formatCurrencyARS(draft?.comprasNetas || 0)}</span>
                    </div>
                    <div className="inv-formula-operator">−</div>
                    <div className="inv-formula-row">
                        <span className="inv-formula-label">EF</span>
                        <span className="inv-formula-value">{formatCurrencyARS(draft?.existenciaFinal || 0)}</span>
                    </div>
                    <div className="inv-formula-operator">=</div>
                    <div className="inv-formula-row inv-formula-result">
                        <span className="inv-formula-label">CMV</span>
                        <span className="inv-formula-value">{formatCurrencyARS(draft?.cmv || 0)}</span>
                    </div>
                </div>
            </div>

            {/* Resultado Bruto */}
            <div className="card inv-resultado-card">
                <div className="card-header">
                    <h3 className="card-title">Resultado Bruto estimado</h3>
                </div>
                <div className="inv-detail-rows">
                    <div className="inv-detail-row">
                        <span>Ventas Netas</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.ventasNetas || 0)}</span>
                    </div>
                    <div className="inv-detail-row inv-detail-negative">
                        <span>- CMV</span>
                        <span className="inv-detail-value">({formatCurrencyARS(draft?.cmv || 0)})</span>
                    </div>
                    <div className={`inv-detail-row inv-detail-total ${(draft?.resultadoBruto || 0) >= 0 ? 'inv-positive' : 'inv-negative'}`}>
                        <span>= Resultado Bruto</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.resultadoBruto || 0)}</span>
                    </div>
                </div>
            </div>

            {/* IVA Summary */}
            <div className="card inv-iva-card">
                <div className="card-header">
                    <h3 className="card-title">IVA del período (informativo)</h3>
                </div>
                <div className="inv-detail-rows">
                    <div className="inv-detail-row">
                        <span>IVA Crédito Fiscal</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.ivaCF || 0)}</span>
                    </div>
                    <div className="inv-detail-row">
                        <span>IVA Débito Fiscal</span>
                        <span className="inv-detail-value">{formatCurrencyARS(draft?.ivaDF || 0)}</span>
                    </div>
                    <div className={`inv-detail-row inv-detail-total ${(draft?.ivaBalance || 0) >= 0 ? '' : 'inv-positive'}`}>
                        <span>Saldo IVA</span>
                        <span className="inv-detail-value">
                            {formatCurrencyARS(draft?.ivaBalance || 0)}
                            <small style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                                {(draft?.ivaBalance || 0) >= 0 ? '(a favor del fisco)' : '(a favor del contribuyente)'}
                            </small>
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="inv-actions">
                <button
                    className="btn btn-primary btn-lg"
                    onClick={handleGenerateEntry}
                    disabled={isGenerating || !draft || draft.existenciaFinal <= 0}
                >
                    {isGenerating ? '⏳ Generando...' : '📝 Generar asiento de cierre'}
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        if (!draft) return
                        const csv = exportClosingToCSV(draft)
                        const date = new Date().toISOString().slice(0, 10)
                        downloadCSV(csv, `cierre-inventario-${date}.csv`)
                    }}
                    disabled={!draft}
                >
                    📤 Exportar CSV
                </button>
            </div>

            {/* Posted Closings List */}
            {closings.filter(c => c.status === 'POSTED').length > 0 && (
                <div className="card inv-history-card">
                    <div className="card-header">
                        <h3 className="card-title">Cierres anteriores</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th className="text-right">EI</th>
                                    <th className="text-right">EF</th>
                                    <th className="text-right">CMV</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {closings
                                    .filter(c => c.status === 'POSTED')
                                    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
                                    .map(closing => (
                                        <tr key={closing.id}>
                                            <td>{formatDateDisplay(closing.periodStart)} - {formatDateDisplay(closing.periodEnd)}</td>
                                            <td className="text-right">{formatCurrencyARS(closing.existenciaInicial)}</td>
                                            <td className="text-right">{formatCurrencyARS(closing.existenciaFinal)}</td>
                                            <td className="text-right">{formatCurrencyARS(closing.cmv)}</td>
                                            <td>
                                                <span className="chip chip-posted">Registrado</span>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    )
}

// ========================================
// Tab C: Configuración
// ========================================

interface ConfigTabProps {
    config: InventoryConfig
    onConfigChange: (updates: Partial<InventoryConfig>) => void
}

function ConfigTab({ config, onConfigChange }: ConfigTabProps) {
    return (
        <>
            <div className="card inv-config-card">
                <div className="card-header">
                    <h3 className="card-title">Modo de inventario</h3>
                </div>
                <div className="inv-config-section">
                    <label className="inv-radio-option inv-radio-selected">
                        <input type="radio" checked readOnly />
                        <div>
                            <strong>Periódico (por diferencias)</strong>
                            <p className="form-help">CMV = EI + Compras Netas - EF. Se calcula al cierre del período.</p>
                        </div>
                    </label>
                    <label className="inv-radio-option inv-radio-disabled">
                        <input type="radio" disabled />
                        <div>
                            <strong>Permanente (próxima versión)</strong>
                            <p className="form-help">CMV se calcula automáticamente por cada salida usando PEPS/UEPS/Promedio.</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className="card inv-config-card">
                <div className="card-header">
                    <h3 className="card-title">Opciones</h3>
                </div>
                <div className="inv-config-section">
                    <label className="inv-toggle-option">
                        <div className="toggle-container">
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={config.allowNegativeStock}
                                    onChange={e => onConfigChange({ allowNegativeStock: e.target.checked })}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div>
                            <strong>Permitir stock negativo</strong>
                            <p className="form-help">Si está desactivado, se bloqueará el registro de salidas que superen el stock disponible.</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className="card inv-config-card">
                <div className="card-header">
                    <h3 className="card-title">Cuentas contables</h3>
                </div>
                <div className="inv-config-section">
                    <p className="form-help" style={{ marginBottom: 'var(--space-md)' }}>
                        Las siguientes cuentas se utilizan para el cálculo y la generación del asiento de cierre:
                    </p>
                    <div className="inv-account-list">
                        {Object.entries(DEFAULT_ACCOUNT_CODES).map(([key, code]) => (
                            <div key={key} className="inv-account-row">
                                <span className="inv-account-key">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="inv-account-code">{code}</span>
                            </div>
                        ))}
                    </div>
                    <p className="form-help" style={{ marginTop: 'var(--space-md)' }}>
                        ⚠️ Si su plan de cuentas utiliza códigos diferentes, la configuración de mapping estará disponible en una próxima versión.
                    </p>
                </div>
            </div>
        </>
    )
}

// ========================================
// Modals
// ========================================

interface ProductModalProps {
    product: InventoryProduct | null
    onSave: (product: InventoryProduct) => void
    onClose: () => void
}

function ProductModal({ product, onSave, onClose }: ProductModalProps) {
    const [formData, setFormData] = useState<InventoryProduct>(() =>
        product || createEmptyProduct()
    )

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.description.trim()) {
            alert('La descripción es requerida')
            return
        }
        onSave(formData)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{product ? 'Editar producto' : 'Nuevo producto'}</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">SKU / Código</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.sku}
                                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                placeholder="Ej: SKU-001"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Descripción *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Nombre del producto"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Unidad de medida</label>
                            <select
                                className="form-select"
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value as 'u' | 'kg' | 'lt' })}
                            >
                                <option value="u">Unidades</option>
                                <option value="kg">Kilogramos</option>
                                <option value="lt">Litros</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Stock mínimo (alerta)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.minStock || ''}
                                onChange={e => setFormData({ ...formData, minStock: e.target.value ? parseInt(e.target.value) : undefined })}
                                placeholder="Opcional"
                                min={0}
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

interface MovementModalProps {
    movement: InventoryMovement | null
    products: InventoryProduct[]
    onSave: (movement: InventoryMovement) => void
    onClose: () => void
}

function MovementModal({ movement, products, onSave, onClose }: MovementModalProps) {
    const [formData, setFormData] = useState<InventoryMovement>(() =>
        movement || createEmptyMovement(products[0]?.id || '')
    )

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.productId) {
            alert('Seleccione un producto')
            return
        }
        if (formData.quantity <= 0 && formData.type !== 'AJUSTE') {
            alert('La cantidad debe ser mayor a 0')
            return
        }
        onSave(formData)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{movement ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Fecha *</label>
                            <input
                                type="date"
                                className="form-input"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Producto *</label>
                            <select
                                className="form-select"
                                value={formData.productId}
                                onChange={e => setFormData({ ...formData, productId: e.target.value })}
                                required
                            >
                                <option value="">-- Seleccionar --</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.sku ? `[${p.sku}] ` : ''}{p.description}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tipo *</label>
                            <select
                                className="form-select"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value as TipoMovimiento })}
                            >
                                <option value="ENTRADA">Entrada</option>
                                <option value="SALIDA">Salida</option>
                                <option value="AJUSTE">Ajuste</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cantidad *</label>
                            <input
                                type="number"
                                className="form-input"
                                value={formData.quantity}
                                onChange={e => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                                min={formData.type === 'AJUSTE' ? undefined : 0}
                                step="0.01"
                                required
                            />
                            {formData.type === 'AJUSTE' && (
                                <small className="form-help">Para ajustes, use valor negativo para reducir stock</small>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">Observación / Referencia</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.observation || ''}
                                onChange={e => setFormData({ ...formData, observation: e.target.value })}
                                placeholder="Ej: Factura A-0001-00001234"
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
