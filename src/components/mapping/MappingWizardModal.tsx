/**
 * Mapping Wizard Modal
 * 
 * Multi-step wizard for mapping user accounts to ContaLivre taxonomy.
 * Supports auto-detection, manual review, and persistence to Dexie.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    X,
    Wand2,
    AlertTriangle,
    CheckCircle,
    ChevronRight,
    Sparkles,
    Search,
    Info,
    FileSpreadsheet,
    ArrowRight,
} from 'lucide-react'

import { db } from '../../storage/db'
import { updateAccount } from '../../storage/accounts'
import { loadSeedDataIfNeeded } from '../../storage/seed'
import type { Account, StatementGroup } from '../../core/models'
import { TAXONOMY_NODES, getTaxonomyLabel, getSuggestedTaxonomy } from '../../domain/taxonomy/contalivreTaxonomy'
import {
    loadMapping,
    saveMapping,
    createEmptyMappingConfig,
    calculateCoverage,
    getMappingStats,
    type MappingEntry,
    type MappingConfig,
    type Confidence,
} from '../../domain/mapping/mappingStorage'
import { autoDetect, getAutoDetectStats } from '../../domain/mapping/autoDetect'

// ============================================================================
// Types
// ============================================================================

interface MappingWizardModalProps {
    isOpen: boolean
    onClose: () => void
}

type WizardStep = 0 | 1 | 2 | 3 | 4

// ============================================================================
// Constants
// ============================================================================

const STEP_LABELS = [
    'Verificar',
    'Resumen',
    'Auto-detectar',
    'Revisión',
    'Validar',
]

// ============================================================================
// Helper Components
// ============================================================================

function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
    if (!confidence) return <span className="mapping-badge mapping-badge--none">—</span>

    const labels = { high: 'Alta', medium: 'Media', low: 'Baja' }
    return (
        <span className={`mapping-badge mapping-badge--${confidence}`}>
            {labels[confidence]}
        </span>
    )
}

function Stepper({ currentStep }: { currentStep: number }) {
    return (
        <div className="mapping-stepper">
            <div className="mapping-stepper-labels">
                {STEP_LABELS.slice(1).map((label, idx) => (
                    <span
                        key={idx}
                        className={`mapping-stepper-label ${idx + 1 <= currentStep ? 'mapping-stepper-label--active' : ''}`}
                    >
                        {idx + 1}. {label}
                    </span>
                ))}
            </div>
            <div className="mapping-stepper-track">
                {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="mapping-stepper-segment">
                        <div
                            className={`mapping-stepper-dot ${step <= currentStep ? 'mapping-stepper-dot--active' : ''}`}
                        />
                        {step < 4 && (
                            <div
                                className={`mapping-stepper-line ${step < currentStep ? 'mapping-stepper-line--active' : ''}`}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// Step Components
// ============================================================================

function GateStep({
    onLoadStandard,
    onGoToCuentas,
    onImport,
    isLoading,
}: {
    onLoadStandard: () => void
    onGoToCuentas: () => void
    onImport: () => void
    isLoading: boolean
}) {
    return (
        <div className="mapping-gate">
            <div className="mapping-gate-icon">
                <AlertTriangle size={48} />
            </div>
            <h2 className="mapping-gate-title">Falta tu Plan de Cuentas</h2>
            <p className="mapping-gate-description">
                Para mapear tus cuentas necesitamos que primero cargues un plan de cuentas.
                Podés usar nuestro plan modelo o importar uno propio.
            </p>

            <div className="mapping-gate-actions">
                <button
                    className="btn-premium btn-premium-primary mapping-gate-btn"
                    onClick={onLoadStandard}
                    disabled={isLoading}
                >
                    <FileSpreadsheet size={18} />
                    {isLoading ? 'Cargando...' : 'Usar Plan Modelo (Argentina)'}
                </button>

                <button
                    className="btn-premium btn-premium-secondary mapping-gate-btn"
                    onClick={onGoToCuentas}
                >
                    <ArrowRight size={18} />
                    Ir a Plan de Cuentas
                </button>

                <button
                    className="mapping-gate-link"
                    onClick={onImport}
                >
                    Importar Excel/CSV
                </button>
            </div>
        </div>
    )
}

function SummaryStep({
    accounts,
    mappingConfig,
}: {
    accounts: Account[]
    mappingConfig: MappingConfig
}) {
    const stats = useMemo(() => {
        const leafAccounts = accounts.filter(a => !a.isHeader)
        const maxLevel = accounts.length > 0
            ? Math.max(...accounts.map(a => a.level)) + 1
            : 0

        const mappingStats = getMappingStats(mappingConfig.entries)

        return {
            total: accounts.length,
            leaf: leafAccounts.length,
            levels: maxLevel,
            coverage: mappingConfig.coverage,
            mapped: mappingStats.mapped,
        }
    }, [accounts, mappingConfig])

    return (
        <div className="mapping-summary">
            <h2 className="mapping-step-title">Resumen del Plan</h2>
            <p className="mapping-step-description">
                Analizamos tu plan de cuentas. Estos son los datos clave antes de mapear.
            </p>

            <div className="mapping-summary-grid">
                <div className="mapping-summary-card">
                    <span className="mapping-summary-label">Total Cuentas</span>
                    <span className="mapping-summary-value">{stats.total}</span>
                </div>
                <div className="mapping-summary-card">
                    <span className="mapping-summary-label">Cuentas Imputables</span>
                    <span className="mapping-summary-value">{stats.leaf}</span>
                </div>
                <div className="mapping-summary-card">
                    <span className="mapping-summary-label">Niveles</span>
                    <span className="mapping-summary-value">{stats.levels}</span>
                </div>
            </div>

            <div className="mapping-coverage-card">
                <div className="mapping-coverage-header">
                    <span className="mapping-coverage-label">Cobertura Actual</span>
                    <span className="mapping-coverage-value">{stats.coverage}%</span>
                </div>
                <div className="mapping-coverage-bar">
                    <div
                        className="mapping-coverage-fill"
                        style={{ width: `${stats.coverage}%` }}
                    />
                </div>
            </div>

            <div className="mapping-info-box">
                <Info size={18} />
                <div>
                    <strong>¿Por qué mapear?</strong>
                    <p>
                        ContaLivre necesita saber cuáles son tus cuentas de "Caja", "Ventas", etc.
                        para calcular indicadores y generar estados contables correctamente.
                    </p>
                </div>
            </div>
        </div>
    )
}

function AutoDetectStep({
    onRunAutoDetect,
    stats,
    hasRun,
    isRunning,
}: {
    onRunAutoDetect: () => void
    stats: ReturnType<typeof getAutoDetectStats> | null
    hasRun: boolean
    isRunning: boolean
}) {
    return (
        <div className="mapping-autodetect">
            {!hasRun ? (
                <>
                    <div className="mapping-autodetect-icon">
                        <Sparkles size={48} />
                    </div>
                    <h2 className="mapping-step-title">Auto-detectar Mapeo</h2>
                    <p className="mapping-step-description">
                        Nuestro algoritmo analiza los nombres de tus cuentas y sugiere
                        la clasificación correcta automáticamente.
                    </p>

                    <div className="mapping-autodetect-features">
                        <div className="mapping-autodetect-feature">
                            <CheckCircle size={16} />
                            Detecta "Caja", "Bancos", "IVA", etc.
                        </div>
                        <div className="mapping-autodetect-feature">
                            <CheckCircle size={16} />
                            Identifica cuentas regularizadoras
                        </div>
                        <div className="mapping-autodetect-feature">
                            <CheckCircle size={16} />
                            Asigna categorías de estados contables
                        </div>
                    </div>

                    <button
                        className="btn-premium btn-premium-primary mapping-autodetect-btn"
                        onClick={onRunAutoDetect}
                        disabled={isRunning}
                    >
                        <Wand2 size={18} />
                        {isRunning ? 'Analizando...' : 'Ejecutar Auto-detección'}
                    </button>
                </>
            ) : stats && (
                <>
                    <div className="mapping-autodetect-icon mapping-autodetect-icon--success">
                        <CheckCircle size={48} />
                    </div>
                    <h2 className="mapping-step-title">¡Análisis Completado!</h2>
                    <p className="mapping-step-description">
                        Detectamos {stats.detected} de {stats.total} cuentas imputables.
                    </p>

                    <div className="mapping-autodetect-stats">
                        <div className="mapping-stat mapping-stat--high">
                            <span className="mapping-stat-value">{stats.highConfidence}</span>
                            <span className="mapping-stat-label">Alta confianza</span>
                        </div>
                        <div className="mapping-stat mapping-stat--medium">
                            <span className="mapping-stat-value">{stats.mediumConfidence}</span>
                            <span className="mapping-stat-label">Media confianza</span>
                        </div>
                        <div className="mapping-stat mapping-stat--low">
                            <span className="mapping-stat-value">{stats.lowConfidence}</span>
                            <span className="mapping-stat-label">Baja confianza</span>
                        </div>
                        {stats.undetected > 0 && (
                            <div className="mapping-stat mapping-stat--none">
                                <span className="mapping-stat-value">{stats.undetected}</span>
                                <span className="mapping-stat-label">Sin detectar</span>
                            </div>
                        )}
                    </div>

                    <p className="mapping-autodetect-hint">
                        Continuá al siguiente paso para revisar y ajustar las sugerencias.
                    </p>
                </>
            )}
        </div>
    )
}

function ReviewStep({
    accounts,
    mappingConfig,
    onUpdateEntry,
}: {
    accounts: Account[]
    mappingConfig: MappingConfig
    onUpdateEntry: (accountId: string, updates: Partial<MappingEntry>) => void
}) {
    const [searchQuery, setSearchQuery] = useState('')
    const [filterConfidence, setFilterConfidence] = useState<'all' | 'low' | 'unmapped'>('all')

    const leafAccounts = useMemo(() =>
        accounts.filter(a => !a.isHeader).sort((a, b) => a.code.localeCompare(b.code)),
        [accounts]
    )

    const filteredAccounts = useMemo(() => {
        return leafAccounts.filter(account => {
            const entry = mappingConfig.entries[account.id]

            // Search filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase()
                if (!account.name.toLowerCase().includes(q) &&
                    !account.code.toLowerCase().includes(q)) {
                    return false
                }
            }

            // Confidence filter
            if (filterConfidence === 'low' && entry?.confidence !== 'low') {
                return false
            }
            if (filterConfidence === 'unmapped' && entry?.taxonomyId) {
                return false
            }

            return true
        })
    }, [leafAccounts, mappingConfig.entries, searchQuery, filterConfidence])

    return (
        <div className="mapping-review">
            <div className="mapping-review-header">
                <h2 className="mapping-step-title">Revisión de Mapeo</h2>

                <div className="mapping-review-filters">
                    <div className="mapping-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar cuenta..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <select
                        className="mapping-filter-select"
                        value={filterConfidence}
                        onChange={(e) => setFilterConfidence(e.target.value as typeof filterConfidence)}
                    >
                        <option value="all">Todas ({leafAccounts.length})</option>
                        <option value="low">Baja confianza</option>
                        <option value="unmapped">Sin mapear</option>
                    </select>
                </div>
            </div>

            <div className="mapping-review-table-container">
                <table className="mapping-review-table">
                    <thead>
                        <tr>
                            <th className="mapping-col-code">Código</th>
                            <th className="mapping-col-name">Cuenta</th>
                            <th className="mapping-col-taxonomy">Taxonomía</th>
                            <th className="mapping-col-contra">Contra</th>
                            <th className="mapping-col-confidence">Conf.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAccounts.map(account => {
                            const entry = mappingConfig.entries[account.id] || {
                                taxonomyId: null,
                                confidence: null,
                                contra: account.isContra,
                                includeInKpis: true,
                            }

                            const suggestedOptions = getSuggestedTaxonomy(account.kind, account.section)

                            return (
                                <tr key={account.id} className={!entry.taxonomyId ? 'mapping-row--unmapped' : ''}>
                                    <td className="mapping-col-code">
                                        <code>{account.code}</code>
                                    </td>
                                    <td className="mapping-col-name">
                                        {account.name}
                                    </td>
                                    <td className="mapping-col-taxonomy">
                                        <select
                                            value={entry.taxonomyId || ''}
                                            onChange={(e) => onUpdateEntry(account.id, {
                                                taxonomyId: (e.target.value || null) as StatementGroup | null,
                                                confidence: e.target.value ? 'high' : null,
                                            })}
                                            className={`mapping-taxonomy-select ${!entry.taxonomyId ? 'mapping-taxonomy-select--empty' : ''}`}
                                        >
                                            <option value="">(Sin mapear)</option>
                                            <optgroup label="Sugeridas">
                                                {suggestedOptions.map(id => (
                                                    <option key={id} value={id}>
                                                        {getTaxonomyLabel(id)}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Todas">
                                                {TAXONOMY_NODES.filter(n => !suggestedOptions.includes(n.id)).map(node => (
                                                    <option key={node.id} value={node.id}>
                                                        {node.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                    </td>
                                    <td className="mapping-col-contra">
                                        <label className="mapping-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={entry.contra}
                                                onChange={(e) => onUpdateEntry(account.id, {
                                                    contra: e.target.checked,
                                                })}
                                            />
                                            <span className="mapping-checkbox-box" />
                                        </label>
                                    </td>
                                    <td className="mapping-col-confidence">
                                        <ConfidenceBadge confidence={entry.confidence} />
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {filteredAccounts.length === 0 && (
                    <div className="mapping-review-empty">
                        No se encontraron cuentas con los filtros aplicados.
                    </div>
                )}
            </div>
        </div>
    )
}

function ValidationStep({
    accounts,
    mappingConfig,
}: {
    accounts: Account[]
    mappingConfig: MappingConfig
}) {
    const stats = useMemo(() => {
        const leafAccounts = accounts.filter(a => !a.isHeader)
        const leafIds = leafAccounts.map(a => a.id)
        const coverage = calculateCoverage(mappingConfig.entries, leafIds)
        const mappingStats = getMappingStats(mappingConfig.entries)

        const unmapped = leafAccounts.filter(a => !mappingConfig.entries[a.id]?.taxonomyId)

        // Check for contra warnings (amort accounts not marked as contra)
        const contraWarnings = leafAccounts.filter(a => {
            const entry = mappingConfig.entries[a.id]
            const nameLC = a.name.toLowerCase()
            const looksLikeContra = nameLC.includes('amort') ||
                nameLC.includes('previsión') ||
                nameLC.includes('provision')
            return looksLikeContra && !entry?.contra
        })

        return {
            coverage,
            mapped: mappingStats.mapped,
            unmapped: unmapped.length,
            unmappedList: unmapped.slice(0, 5),
            contraWarnings: contraWarnings.slice(0, 3),
            isValid: coverage >= 80,
        }
    }, [accounts, mappingConfig])

    return (
        <div className="mapping-validation">
            <h2 className="mapping-step-title">Validación</h2>
            <p className="mapping-step-description">
                Verificamos tu mapeo para asegurar que esté listo para usar.
            </p>

            <div className="mapping-validation-card mapping-validation-card--primary">
                <div className="mapping-validation-header">
                    <span className="mapping-validation-label">Cobertura de Mapeo</span>
                    <span className={`mapping-validation-value ${stats.isValid ? 'mapping-validation-value--success' : 'mapping-validation-value--warning'}`}>
                        {stats.coverage}%
                    </span>
                </div>
                <div className="mapping-coverage-bar mapping-coverage-bar--large">
                    <div
                        className={`mapping-coverage-fill ${stats.isValid ? '' : 'mapping-coverage-fill--warning'}`}
                        style={{ width: `${stats.coverage}%` }}
                    />
                </div>
                <p className="mapping-validation-detail">
                    {stats.mapped} cuentas mapeadas
                    {stats.unmapped > 0 && ` • ${stats.unmapped} sin mapear`}
                </p>
            </div>

            {stats.unmapped > 0 && (
                <div className="mapping-validation-section">
                    <h4 className="mapping-validation-section-title">
                        <AlertTriangle size={16} />
                        Cuentas sin mapear ({stats.unmapped})
                    </h4>
                    <ul className="mapping-validation-list">
                        {stats.unmappedList.map(account => (
                            <li key={account.id}>
                                <code>{account.code}</code> {account.name}
                            </li>
                        ))}
                        {stats.unmapped > 5 && (
                            <li className="mapping-validation-more">
                                ... y {stats.unmapped - 5} más
                            </li>
                        )}
                    </ul>
                </div>
            )}

            {stats.contraWarnings.length > 0 && (
                <div className="mapping-validation-section mapping-validation-section--warning">
                    <h4 className="mapping-validation-section-title">
                        <AlertTriangle size={16} />
                        Posibles cuentas regularizadoras
                    </h4>
                    <p className="mapping-validation-hint">
                        Estas cuentas parecen ser regularizadoras pero no están marcadas como "Contra":
                    </p>
                    <ul className="mapping-validation-list">
                        {stats.contraWarnings.map(account => (
                            <li key={account.id}>
                                <code>{account.code}</code> {account.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={`mapping-validation-status ${stats.isValid ? 'mapping-validation-status--success' : 'mapping-validation-status--warning'}`}>
                {stats.isValid ? (
                    <>
                        <CheckCircle size={20} />
                        <span>Tu mapeo está listo para guardar</span>
                    </>
                ) : (
                    <>
                        <AlertTriangle size={20} />
                        <span>Recomendamos mapear al menos el 80% de cuentas</span>
                    </>
                )}
            </div>
        </div>
    )
}

// ============================================================================
// Main Component
// ============================================================================

export default function MappingWizardModal({ isOpen, onClose }: MappingWizardModalProps) {
    const navigate = useNavigate()

    // Data
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray()) ?? []
    const hasCOA = accounts.length > 0

    // State
    const [currentStep, setCurrentStep] = useState<WizardStep>(0)
    const [mappingConfig, setMappingConfig] = useState<MappingConfig>(createEmptyMappingConfig)
    const [autoDetectStats, setAutoDetectStats] = useState<ReturnType<typeof getAutoDetectStats> | null>(null)
    const [hasRunAutoDetect, setHasRunAutoDetect] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Initialize step based on COA state
    useEffect(() => {
        if (isOpen) {
            const initialStep = hasCOA ? 1 : 0
            setCurrentStep(initialStep as WizardStep)

            // Load existing mapping if available
            const existing = loadMapping()
            if (existing) {
                setMappingConfig(existing)
                if (Object.keys(existing.entries).length > 0) {
                    const stats = getAutoDetectStats(existing.entries)
                    setAutoDetectStats(stats)
                    setHasRunAutoDetect(true)
                }
            } else {
                setMappingConfig(createEmptyMappingConfig())
                setAutoDetectStats(null)
                setHasRunAutoDetect(false)
            }
        }
    }, [isOpen, hasCOA])

    // Update coverage when entries change
    useEffect(() => {
        if (accounts.length > 0) {
            const leafIds = accounts.filter(a => !a.isHeader).map(a => a.id)
            const coverage = calculateCoverage(mappingConfig.entries, leafIds)
            if (coverage !== mappingConfig.coverage) {
                setMappingConfig(prev => ({ ...prev, coverage }))
            }
        }
    }, [mappingConfig.entries, accounts])

    // Handlers
    const handleLoadStandardPlan = useCallback(async () => {
        setIsLoading(true)
        try {
            await loadSeedDataIfNeeded()
            // Will auto-advance when hasCOA becomes true
        } catch (error) {
            console.error('Error loading standard COA:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const handleGoToCuentas = useCallback(() => {
        onClose()
        navigate('/cuentas')
    }, [navigate, onClose])

    const handleImport = useCallback(() => {
        onClose()
        navigate('/cuentas?import=1')
    }, [navigate, onClose])

    const handleRunAutoDetect = useCallback(() => {
        setIsLoading(true)

        // Simulate slight delay for UX
        setTimeout(() => {
            const entries = autoDetect(accounts)
            const stats = getAutoDetectStats(entries)

            setMappingConfig(prev => ({
                ...prev,
                entries: { ...prev.entries, ...entries },
            }))
            setAutoDetectStats(stats)
            setHasRunAutoDetect(true)
            setIsLoading(false)
        }, 500)
    }, [accounts])

    const handleUpdateEntry = useCallback((accountId: string, updates: Partial<MappingEntry>) => {
        setMappingConfig(prev => ({
            ...prev,
            entries: {
                ...prev.entries,
                [accountId]: {
                    ...prev.entries[accountId],
                    ...updates,
                },
            },
        }))
    }, [])

    const handleSave = useCallback(async () => {
        setIsSaving(true)

        try {
            // Save to localStorage
            saveMapping(mappingConfig)

            // Update Dexie accounts with statementGroup and isContra
            const updates = Object.entries(mappingConfig.entries)
            for (const [accountId, entry] of updates) {
                if (entry.taxonomyId) {
                    await updateAccount(accountId, {
                        statementGroup: entry.taxonomyId,
                        isContra: entry.contra,
                    })
                }
            }

            onClose()
        } catch (error) {
            console.error('Error saving mapping:', error)
        } finally {
            setIsSaving(false)
        }
    }, [mappingConfig, onClose])

    const handleNext = useCallback(() => {
        if (currentStep < 4) {
            setCurrentStep((currentStep + 1) as WizardStep)
        } else {
            handleSave()
        }
    }, [currentStep, handleSave])

    const handleBack = useCallback(() => {
        if (currentStep > 1) {
            setCurrentStep((currentStep - 1) as WizardStep)
        }
    }, [currentStep])

    // Don't render if not open
    if (!isOpen) return null

    // Render step content
    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <GateStep
                        onLoadStandard={handleLoadStandardPlan}
                        onGoToCuentas={handleGoToCuentas}
                        onImport={handleImport}
                        isLoading={isLoading}
                    />
                )
            case 1:
                return <SummaryStep accounts={accounts} mappingConfig={mappingConfig} />
            case 2:
                return (
                    <AutoDetectStep
                        onRunAutoDetect={handleRunAutoDetect}
                        stats={autoDetectStats}
                        hasRun={hasRunAutoDetect}
                        isRunning={isLoading}
                    />
                )
            case 3:
                return (
                    <ReviewStep
                        accounts={accounts}
                        mappingConfig={mappingConfig}
                        onUpdateEntry={handleUpdateEntry}
                    />
                )
            case 4:
                return <ValidationStep accounts={accounts} mappingConfig={mappingConfig} />
            default:
                return null
        }
    }

    const showStepper = currentStep > 0
    const showBackButton = currentStep > 1
    const nextButtonText = currentStep === 4
        ? (isSaving ? 'Guardando...' : 'Guardar y Finalizar')
        : currentStep === 2 && !hasRunAutoDetect
            ? 'Omitir'
            : 'Continuar'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal mapping-wizard-modal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header mapping-wizard-header">
                    <div className="mapping-wizard-header-content">
                        <div className="mapping-wizard-header-icon">
                            <Wand2 size={24} />
                        </div>
                        <div>
                            <h3 className="modal-title">Asistente de Mapeo</h3>
                            <p className="mapping-wizard-subtitle">
                                Vinculá tu plan contable con la taxonomía de ContaLivre
                            </p>
                        </div>
                    </div>
                    <button className="btn btn-icon btn-secondary" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Stepper */}
                {showStepper && (
                    <div className="mapping-wizard-stepper-container">
                        <Stepper currentStep={currentStep} />
                    </div>
                )}

                {/* Content */}
                <div className="modal-body mapping-wizard-body">
                    {renderStepContent()}
                </div>

                {/* Footer */}
                {currentStep > 0 && (
                    <div className="modal-footer mapping-wizard-footer">
                        <div className="mapping-wizard-footer-left">
                            {showBackButton && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleBack}
                                    disabled={isSaving}
                                >
                                    Atrás
                                </button>
                            )}
                        </div>
                        <div className="mapping-wizard-footer-right">
                            <button
                                className="btn btn-secondary"
                                onClick={onClose}
                                disabled={isSaving}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-premium btn-premium-primary"
                                onClick={handleNext}
                                disabled={isSaving}
                            >
                                {nextButtonText}
                                {!isSaving && currentStep < 4 && <ChevronRight size={16} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
