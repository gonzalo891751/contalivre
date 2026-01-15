import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
    X,
    Upload,
    FileSpreadsheet,
    ArrowRight,
    CheckCircle2,
    AlertTriangle,
    GitMerge,
    RefreshCw,
    Bot
} from 'lucide-react'
import type { Account } from '../../core/models'
import {
    parseFile,
    detectColumns,
    mapRowsToImportedRows,
    validateImport,
    convertToAccounts,
    computeImportSummary,
    type ColumnMapping,
    type ValidationResult,
    type ImportSummary
} from '../../lib/importAccounts'
import { replaceAllAccounts, mergeAccounts } from '../../storage/accounts'

interface ImportWizardProps {
    isOpen: boolean
    onClose: () => void
    accounts: Account[]
    onComplete: () => void
}

type ImportMode = 'merge' | 'replace'
type Step = 1 | 2 | 3 | 4

export default function ImportWizard({
    isOpen,
    onClose,
    accounts,
    onComplete,
}: ImportWizardProps) {
    // Wizard state
    const [step, setStep] = useState<Step>(1)
    const [file, setFile] = useState<File | null>(null)
    const [rawRows, setRawRows] = useState<string[][]>([])
    const [importMode, setImportMode] = useState<ImportMode>('merge')
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Mapping state
    const [mapping, setMapping] = useState<ColumnMapping>({
        code: null,
        name: null,
        kind: null,
        section: null,
        parentCode: null,
    })
    const [detectedColumns, setDetectedColumns] = useState<string[]>([])

    // Validation state
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
    const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

    // Import result
    const [importResult, setImportResult] = useState<{ created: number; updated?: number; skipped?: number } | null>(null)

    // Replace confirmation
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)

    // =========================================================================
    // File Upload (Step 1)
    // =========================================================================

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return

        const selectedFile = acceptedFiles[0]
        setFile(selectedFile)
        setError(null)

        try {
            const rows = await parseFile(selectedFile)
            setRawRows(rows)

            // Auto-detect column mapping from first row (headers)
            if (rows.length > 0) {
                const headers = rows[0]
                setDetectedColumns(headers)
                const detected = detectColumns(headers)
                setMapping(detected)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al procesar archivo')
            setFile(null)
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
        },
        maxFiles: 1,
    })

    // =========================================================================
    // Navigation
    // =========================================================================

    const canProceed = (): boolean => {
        switch (step) {
            case 1:
                return file !== null && rawRows.length > 0
            case 2:
                // Require code and name mapping minimally
                return mapping.code !== null && mapping.name !== null
            case 3:
                return validationResult !== null && validationResult.valid.length > 0
            default:
                return false
        }
    }

    const nextStep = async () => {
        if (step === 2) {
            // Process mapping and validate
            const importedRows = mapRowsToImportedRows(rawRows, mapping)
            const result = validateImport(importedRows)
            setValidationResult(result)

            // Compute summary
            const existingCodes = new Set(accounts.map(a => a.code))
            const summary = computeImportSummary(
                result.valid,
                existingCodes,
                rawRows.length - 1, // Exclude header
                result.errors.length
            )
            setImportSummary(summary)

            setStep(3)
        } else if (step === 3) {
            // Confirmation step - check if Replace mode needs extra confirmation
            if (importMode === 'replace' && !showReplaceConfirm) {
                setShowReplaceConfirm(true)
                return
            }

            await executeImport()
        } else {
            setStep((step + 1) as Step)
        }
    }

    const prevStep = () => {
        setShowReplaceConfirm(false)
        if (step > 1) {
            setStep((step - 1) as Step)
        }
    }

    // =========================================================================
    // Import Execution
    // =========================================================================

    const executeImport = async () => {
        if (!validationResult) return

        setIsProcessing(true)
        setError(null)

        try {
            // Convert validated rows to accounts
            const accountsToImport = convertToAccounts(validationResult.valid)

            let result: { created: number; updated?: number; skipped?: number }

            if (importMode === 'replace') {
                result = await replaceAllAccounts(accountsToImport)
            } else {
                result = await mergeAccounts(accountsToImport, false)
            }

            setImportResult(result)
            setStep(4)
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al importar cuentas')
        } finally {
            setIsProcessing(false)
        }
    }

    // =========================================================================
    // Reset & Close
    // =========================================================================

    const handleClose = () => {
        setStep(1)
        setFile(null)
        setRawRows([])
        setImportMode('merge')
        setMapping({ code: null, name: null, kind: null, section: null, parentCode: null })
        setDetectedColumns([])
        setValidationResult(null)
        setImportSummary(null)
        setImportResult(null)
        setError(null)
        setShowReplaceConfirm(false)
        onClose()
    }

    // =========================================================================
    // Render
    // =========================================================================

    if (!isOpen) return null

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="text-center py-8">
                        <div
                            {...getRootProps()}
                            className={`import-upload-zone ${isDragActive ? 'drag-over' : ''}`}
                        >
                            <input {...getInputProps()} />
                            <div className="import-upload-zone-icon">
                                <Upload size={32} />
                            </div>
                            <h4 className="import-upload-zone-title">
                                Arrastrá tu archivo acá
                            </h4>
                            <p className="import-upload-zone-hint">
                                Soportamos Excel (.xlsx) o CSV.<br />
                                Asegurate de que tenga al menos Código y Nombre.
                            </p>

                            {file ? (
                                <div className="import-file-chip">
                                    <FileSpreadsheet size={20} />
                                    <span className="import-file-chip-name">{file.name}</span>
                                    <button
                                        className="import-file-chip-remove"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setFile(null)
                                            setRawRows([])
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <button className="btn-premium btn-premium-secondary" style={{ pointerEvents: 'none' }}>
                                    Seleccionar archivo
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="import-confirm-alert warning" style={{ marginTop: '1rem' }}>
                                <AlertTriangle size={20} />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                )

            case 2:
                // Mapping & Mode Step
                return (
                    <div className="space-y-6">
                        {/* Info Banner */}
                        <div className="import-confirm-alert info">
                            <Bot size={24} />
                            <div>
                                <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>¡Archivo detectado!</p>
                                <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                    Leímos {rawRows.length - 1} filas. Mapeá las columnas y elegí cómo importar.
                                </p>
                            </div>
                        </div>

                        {/* Mode Selection */}
                        <div className="import-mode-options">
                            <label className={`import-mode-option ${importMode === 'merge' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="importMode"
                                    value="merge"
                                    checked={importMode === 'merge'}
                                    onChange={() => setImportMode('merge')}
                                />
                                <div className="import-mode-header">
                                    <div className="import-mode-icon">
                                        <GitMerge size={20} />
                                    </div>
                                    <span className="import-mode-label">Combinar (Recomendado)</span>
                                </div>
                                <p className="import-mode-description">
                                    Agrega cuentas nuevas. No borra ni duplica las existentes.
                                </p>
                                {importMode === 'merge' && (
                                    <CheckCircle2 className="import-mode-check" size={20} />
                                )}
                            </label>

                            <label className={`import-mode-option replace ${importMode === 'replace' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="importMode"
                                    value="replace"
                                    checked={importMode === 'replace'}
                                    onChange={() => setImportMode('replace')}
                                />
                                <div className="import-mode-header">
                                    <div className="import-mode-icon">
                                        <RefreshCw size={20} />
                                    </div>
                                    <span className="import-mode-label">Reemplazar Todo</span>
                                </div>
                                <p className="import-mode-description">
                                    Borra TODAS las cuentas actuales y crea un plan nuevo.
                                </p>
                                {importMode === 'replace' && (
                                    <CheckCircle2 className="import-mode-check" size={20} />
                                )}
                            </label>
                        </div>

                        {/* Column Mapping */}
                        <div>
                            <p className="import-preview-label" style={{ marginBottom: '1rem' }}>
                                Mapeo de columnas
                            </p>

                            <div className="import-mapping-row">
                                <div className="import-mapping-field">
                                    <span className="import-mapping-field-label">Código de Cuenta</span>
                                    <span className="import-mapping-field-required">* Requerido</span>
                                </div>
                                <ArrowRight className="import-mapping-arrow" size={16} />
                                <select
                                    className="import-mapping-select"
                                    value={mapping.code ?? ''}
                                    onChange={(e) => setMapping({ ...mapping, code: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">Seleccionar columna...</option>
                                    {detectedColumns.map((col, i) => (
                                        <option key={i} value={i}>
                                            {col || `Columna ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="import-mapping-row">
                                <div className="import-mapping-field">
                                    <span className="import-mapping-field-label">Nombre</span>
                                    <span className="import-mapping-field-required">* Requerido</span>
                                </div>
                                <ArrowRight className="import-mapping-arrow" size={16} />
                                <select
                                    className="import-mapping-select"
                                    value={mapping.name ?? ''}
                                    onChange={(e) => setMapping({ ...mapping, name: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">Seleccionar columna...</option>
                                    {detectedColumns.map((col, i) => (
                                        <option key={i} value={i}>
                                            {col || `Columna ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="import-mapping-row">
                                <div className="import-mapping-field">
                                    <span className="import-mapping-field-label">Clase (Kind)</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Opcional (Activo, Pasivo...)</span>
                                </div>
                                <ArrowRight className="import-mapping-arrow" size={16} />
                                <select
                                    className="import-mapping-select"
                                    value={mapping.kind ?? ''}
                                    onChange={(e) => setMapping({ ...mapping, kind: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">Inferir automáticamente</option>
                                    {detectedColumns.map((col, i) => (
                                        <option key={i} value={i}>
                                            {col || `Columna ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="import-mapping-row">
                                <div className="import-mapping-field">
                                    <span className="import-mapping-field-label">Subclase (Section)</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Opcional (Corriente, Operativo...)</span>
                                </div>
                                <ArrowRight className="import-mapping-arrow" size={16} />
                                <select
                                    className="import-mapping-select"
                                    value={mapping.section ?? ''}
                                    onChange={(e) => setMapping({ ...mapping, section: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">Inferir automáticamente</option>
                                    {detectedColumns.map((col, i) => (
                                        <option key={i} value={i}>
                                            {col || `Columna ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                            <p>
                                <strong>💡 Tip de importación:</strong> Si no asignás Clase ni Subclase, intentaremos detectarlas
                                automáticamente por el código de cuenta (ej: 1.x → Activo) o palabras clave del nombre.
                            </p>
                        </div>

                        {/* Preview Table */}
                        {rawRows.length > 1 && (
                            <div>
                                <p className="import-preview-label">Vista Previa (Primeras 10 filas)</p>

                                {/* Simulated Rows */}
                                {mapping.code !== null && mapping.name !== null && (
                                    <div className="alert alert-info" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                        <Bot size={16} />
                                        <span style={{ fontSize: '0.8rem' }}>
                                            Simulación de importación basada en tus reglas.
                                        </span>
                                    </div>
                                )}

                                <div className="import-preview-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Fila</th>
                                                <th>Código</th>
                                                <th>Nombre</th>
                                                <th>Clasificación Detectada</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* We simulate the first 10 rows (skipping header) */}
                                            {mapRowsToImportedRows(rawRows.slice(0, 11), mapping)
                                                .map((row, i) => (
                                                    <tr key={i}>
                                                        <td>{i + 1}</td>
                                                        <td>{row.code}</td>
                                                        <td>{row.name}</td>
                                                        <td>
                                                            <span className={`badge badge-sm ${row.kind === 'ASSET' ? 'badge-success' :
                                                                    row.kind === 'LIABILITY' ? 'badge-warning' :
                                                                        row.kind === 'EQUITY' ? 'badge-info' :
                                                                            'badge-secondary'
                                                                }`}>
                                                                {row.kind}
                                                            </span>
                                                            <span className="text-muted" style={{ fontSize: '0.7em', marginLeft: '4px' }}>
                                                                {row.section}
                                                            </span>
                                                            {row.isDefaultKind && (
                                                                <span title="Clasificación por defecto (no se pudo inferir)" style={{ marginLeft: '4px', cursor: 'help' }}>⚠️</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )

            case 3:
                return (
                    <div>
                        {showReplaceConfirm && importMode === 'replace' ? (
                            <div className="text-center py-8">
                                <div className="import-confirm-alert warning" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
                                    <AlertTriangle size={24} />
                                    <div style={{ textAlign: 'left' }}>
                                        <p style={{ fontWeight: 700 }}>⚠️ Atención</p>
                                        <p style={{ fontSize: '0.9rem' }}>
                                            Esto eliminará TODAS las {accounts.length} cuentas actuales y las reemplazará con las del archivo.
                                            Esta acción no se puede deshacer.
                                        </p>
                                    </div>
                                </div>
                                <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                                    ¿Confirmás que querés reemplazar el plan de cuentas?
                                </p>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <button
                                        className="btn-premium btn-premium-secondary"
                                        onClick={() => setShowReplaceConfirm(false)}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn-premium btn-premium-danger"
                                        onClick={executeImport}
                                        style={{ background: 'var(--color-error)', color: 'white' }}
                                    >
                                        Sí, reemplazar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Summary */}
                                <div className="import-confirm-alert info" style={{ marginBottom: '1.5rem' }}>
                                    <Bot size={24} />
                                    <div>
                                        <p style={{ fontWeight: 700 }}>Resumen de importación</p>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                            Modo: <strong>{importMode === 'merge' ? 'Combinar' : 'Reemplazar'}</strong>
                                        </p>
                                    </div>
                                </div>

                                <div className="import-confirm-summary">
                                    <div className="import-confirm-stat">
                                        <div className="import-confirm-stat-value">{importSummary?.valid ?? 0}</div>
                                        <div className="import-confirm-stat-label">Filas válidas</div>
                                    </div>
                                    {importMode === 'merge' && (
                                        <>
                                            <div className="import-confirm-stat">
                                                <div className="import-confirm-stat-value" style={{ color: 'var(--color-success)' }}>
                                                    {importSummary?.newAccounts ?? 0}
                                                </div>
                                                <div className="import-confirm-stat-label">Nuevas</div>
                                            </div>
                                            <div className="import-confirm-stat">
                                                <div className="import-confirm-stat-value" style={{ color: 'var(--color-warning)' }}>
                                                    {importSummary?.existingAccounts ?? 0}
                                                </div>
                                                <div className="import-confirm-stat-label">Ya existen</div>
                                            </div>
                                        </>
                                    )}
                                    {(validationResult?.errors?.length ?? 0) > 0 && (
                                        <div className="import-confirm-stat">
                                            <div className="import-confirm-stat-value" style={{ color: 'var(--color-error)' }}>
                                                {validationResult?.errors.length ?? 0}
                                            </div>
                                            <div className="import-confirm-stat-label">Errores</div>
                                        </div>
                                    )}
                                </div>

                                {/* Errors list */}
                                {validationResult && validationResult.errors.length > 0 && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <p className="import-preview-label">Errores detectados</p>
                                        <div className="import-preview-table" style={{ maxHeight: '10rem' }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Fila</th>
                                                        <th>Error</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {validationResult.errors.slice(0, 10).map((err, i) => (
                                                        <tr key={i}>
                                                            <td>{err.row}</td>
                                                            <td>{err.message}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {validationResult.errors.length > 10 && (
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                                ... y {validationResult.errors.length - 10} errores más
                                            </p>
                                        )}
                                    </div>
                                )}

                                {error && (
                                    <div className="import-confirm-alert warning">
                                        <AlertTriangle size={20} />
                                        <span>{error}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )

            case 4:
                return (
                    <div className="import-success">
                        <div className="import-success-icon">
                            <CheckCircle2 size={40} />
                        </div>
                        <h3 className="import-success-title">¡Importación Exitosa!</h3>
                        <p className="import-success-description">
                            Se {importMode === 'replace' ? 'reemplazó el plan con' : 'importaron'}{' '}
                            <strong>{importResult?.created ?? 0} cuentas</strong>
                            {importResult?.skipped ? ` (${importResult.skipped} ya existían)` : ''}.
                        </p>
                        <button className="btn-premium btn-premium-primary" onClick={handleClose}>
                            Volver al Plan de Cuentas
                        </button>
                    </div>
                )
        }
    }

    return (
        <div className="import-wizard-overlay">
            <div className="import-wizard-backdrop" onClick={handleClose} />
            <div className="import-wizard-modal">
                {/* Header */}
                {step < 4 && (
                    <div className="import-wizard-header">
                        <h3 className="import-wizard-title">Importar Plan de Cuentas</h3>
                        <button className="import-wizard-close" onClick={handleClose}>
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Stepper */}
                {step < 4 && (
                    <div className="import-wizard-stepper">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="import-wizard-step" style={{ flex: s < 3 ? 1 : 0 }}>
                                <div
                                    className={`import-wizard-step-number ${step > s ? 'completed' : step === s ? 'active' : 'pending'
                                        }`}
                                >
                                    {step > s ? <CheckCircle2 size={14} /> : s}
                                </div>
                                {s < 3 && (
                                    <div
                                        className={`import-wizard-step-line ${step > s ? 'completed' : 'pending'}`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Body */}
                <div className="import-wizard-body">
                    {isProcessing ? (
                        <div className="import-processing">
                            <div className="import-processing-spinner" />
                            <p className="import-processing-text">Procesando cuentas...</p>
                        </div>
                    ) : (
                        renderStepContent()
                    )}
                </div>

                {/* Footer */}
                {step < 4 && !isProcessing && !showReplaceConfirm && (
                    <div className="import-wizard-footer">
                        <button
                            className="btn-premium btn-premium-ghost"
                            onClick={step === 1 ? handleClose : prevStep}
                        >
                            {step === 1 ? 'Cancelar' : 'Atrás'}
                        </button>
                        <button
                            className="btn-premium btn-premium-primary"
                            onClick={nextStep}
                            disabled={!canProceed()}
                        >
                            {step === 3 ? 'Finalizar Importación' : 'Continuar'}
                            <ArrowRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
