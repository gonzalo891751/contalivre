/**
 * IndicesImportWizard - 3-step modal wizard for importing indices
 * Step 1: Upload file (drag/drop or select)
 * Step 2: Map columns and preview
 * Step 3: Preview parsed data and confirm
 */

import { useState, useRef, useCallback } from 'react';
import type { IndexRow } from '../../../core/cierre-valuacion';
import {
    parseCsvToTable,
    parseXlsxFile,
    buildIndexRowsFromMapping,
    toIndexRows,
    autoDetectMapping,
    type XlsxParseResult,
    type MappingConfig,
    type ParsedIndexRow,
} from '../../../core/cierre-valuacion';

interface IndicesImportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (indices: IndexRow[]) => void;
}

type Step = 1 | 2 | 3;

export function IndicesImportWizard({ isOpen, onClose, onImport }: IndicesImportWizardProps) {
    const [step, setStep] = useState<Step>(1);
    const [file, setFile] = useState<File | null>(null);
    const [rawData, setRawData] = useState<(string | number | null)[][]>([]);
    const [sheets, setSheets] = useState<{ name: string; rowCount: number }[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [mapping, setMapping] = useState<MappingConfig>({ periodColumn: 0, indexColumn: 1, hasHeader: true });
    const [parsedRows, setParsedRows] = useState<ParsedIndexRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // Reset state when closed
    const handleClose = () => {
        setStep(1);
        setFile(null);
        setRawData([]);
        setSheets([]);
        setSelectedSheet('');
        setParsedRows([]);
        setError(null);
        onClose();
    };

    // Step 1: File handling
    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        setError(null);
        setIsLoading(true);

        try {
            const ext = selectedFile.name.split('.').pop()?.toLowerCase();

            if (ext === 'csv') {
                const text = await selectedFile.text();
                const data = parseCsvToTable(text);
                setRawData(data);
                setSheets([]);
                setSelectedSheet('');
                const detectedMapping = autoDetectMapping(data);
                setMapping(detectedMapping);
            } else if (ext === 'xlsx' || ext === 'xls') {
                const result: XlsxParseResult = await parseXlsxFile(selectedFile);
                setRawData(result.data);
                setSheets(result.sheets);
                setSelectedSheet(result.selectedSheet);
                const detectedMapping = autoDetectMapping(result.data);
                setMapping(detectedMapping);
            } else {
                throw new Error('Formato no soportado. Usá CSV o XLSX.');
            }

            setStep(2);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al leer archivo');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFileSelect(droppedFile);
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Step 2: Process mapping
    const handleProcessMapping = () => {
        const parsed = buildIndexRowsFromMapping(rawData, mapping);
        setParsedRows(parsed);
        setStep(3);
    };

    // Step 3: Confirm import
    const handleConfirmImport = () => {
        const indexRows = toIndexRows(parsedRows);
        onImport(indexRows);
        handleClose();
    };

    // Stats for step 3
    const validCount = parsedRows.filter(r => r.isValid).length;
    const invalidCount = parsedRows.filter(r => !r.isValid).length;

    if (!isOpen) return null;

    return (
        <div className="import-wizard-overlay" onClick={handleClose}>
            <div className="import-wizard-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="import-wizard-header">
                    <h3>Importar Índices</h3>
                    <div className="import-wizard-steps">
                        <span className={`import-wizard-step ${step >= 1 ? 'active' : ''}`}>1. Archivo</span>
                        <span className={`import-wizard-step ${step >= 2 ? 'active' : ''}`}>2. Mapeo</span>
                        <span className={`import-wizard-step ${step >= 3 ? 'active' : ''}`}>3. Confirmar</span>
                    </div>
                    <button className="import-wizard-close" onClick={handleClose}>✕</button>
                </div>

                {/* Body */}
                <div className="import-wizard-body">
                    {/* STEP 1: Upload */}
                    {step === 1 && (
                        <div className="import-wizard-step-content">
                            <div
                                ref={dropZoneRef}
                                className="import-wizard-dropzone"
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="import-wizard-dropzone-icon">📥</div>
                                <p className="import-wizard-dropzone-text">
                                    Arrastrá un archivo aquí o hacé clic para seleccionar
                                </p>
                                <p className="import-wizard-dropzone-hint">
                                    Formatos aceptados: CSV, XLSX, XLS
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {file && (
                                <div className="import-wizard-file-info">
                                    📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                </div>
                            )}

                            {isLoading && (
                                <div className="import-wizard-loading">Leyendo archivo...</div>
                            )}

                            {error && (
                                <div className="import-wizard-error">{error}</div>
                            )}

                            <div className="import-wizard-help">
                                <strong>💡 Tip:</strong> Podés subir el archivo XLSX/CSV de FACPCE directamente.
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Mapping */}
                    {step === 2 && (
                        <div className="import-wizard-step-content">
                            {/* Sheet selector for Excel */}
                            {sheets.length > 1 && (
                                <div className="import-wizard-field">
                                    <label>Hoja:</label>
                                    <select
                                        value={selectedSheet}
                                        onChange={(e) => setSelectedSheet(e.target.value)}
                                        className="form-select"
                                    >
                                        {sheets.map(s => (
                                            <option key={s.name} value={s.name}>
                                                {s.name} ({s.rowCount} filas)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Column mapping */}
                            <div className="import-wizard-mapping-grid">
                                <div className="import-wizard-field">
                                    <label>Columna "Período":</label>
                                    <select
                                        value={mapping.periodColumn}
                                        onChange={(e) => setMapping({ ...mapping, periodColumn: parseInt(e.target.value) })}
                                        className="form-select"
                                    >
                                        {rawData[0]?.map((_, i) => (
                                            <option key={i} value={i}>
                                                Columna {i + 1} {rawData[0]?.[i] ? `(${rawData[0][i]})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="import-wizard-field">
                                    <label>Columna "Índice":</label>
                                    <select
                                        value={mapping.indexColumn}
                                        onChange={(e) => setMapping({ ...mapping, indexColumn: parseInt(e.target.value) })}
                                        className="form-select"
                                    >
                                        {rawData[0]?.map((_, i) => (
                                            <option key={i} value={i}>
                                                Columna {i + 1} {rawData[0]?.[i] ? `(${rawData[0][i]})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <label className="import-wizard-checkbox">
                                <input
                                    type="checkbox"
                                    checked={mapping.hasHeader}
                                    onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })}
                                />
                                La primera fila es encabezado
                            </label>

                            {/* Preview table */}
                            <div className="import-wizard-preview-label">Vista previa (primeras 10 filas):</div>
                            <div className="import-wizard-preview-table">
                                <table className="table table-sm">
                                    <thead>
                                        <tr>
                                            {rawData[0]?.map((_, i) => (
                                                <th key={i} className={
                                                    i === mapping.periodColumn ? 'col-period' :
                                                        i === mapping.indexColumn ? 'col-index' : ''
                                                }>
                                                    Col {i + 1}
                                                    {i === mapping.periodColumn && ' (Período)'}
                                                    {i === mapping.indexColumn && ' (Índice)'}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rawData.slice(0, 10).map((row, ri) => (
                                            <tr key={ri} className={ri === 0 && mapping.hasHeader ? 'row-header' : ''}>
                                                {row.map((cell, ci) => (
                                                    <td key={ci} className={
                                                        ci === mapping.periodColumn ? 'col-period' :
                                                            ci === mapping.indexColumn ? 'col-index' : ''
                                                    }>
                                                        {cell !== null ? String(cell) : '—'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Confirm */}
                    {step === 3 && (
                        <div className="import-wizard-step-content">
                            <div className="import-wizard-summary">
                                <div className="import-wizard-summary-item success">
                                    ✓ Filas válidas: <strong>{validCount}</strong>
                                </div>
                                {invalidCount > 0 && (
                                    <div className="import-wizard-summary-item warning">
                                        ⚠ Filas descartadas: <strong>{invalidCount}</strong>
                                    </div>
                                )}
                            </div>

                            <div className="import-wizard-preview-label">Datos a importar:</div>
                            <div className="import-wizard-preview-table">
                                <table className="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Período</th>
                                            <th className="text-right">Índice</th>
                                            <th className="text-center">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.slice(0, 20).map((row, i) => (
                                            <tr key={i} className={row.isValid ? '' : 'row-invalid'}>
                                                <td className="font-mono">
                                                    {row.period || <span className="text-muted">{String(row.periodRaw)}</span>}
                                                </td>
                                                <td className="text-right font-mono">
                                                    {row.index !== null ? row.index.toFixed(2) : <span className="text-muted">{String(row.indexRaw)}</span>}
                                                </td>
                                                <td className="text-center">
                                                    {row.isValid ? (
                                                        <span className="status-ok">✓</span>
                                                    ) : (
                                                        <span className="status-error" title={row.error}>✗</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {parsedRows.length > 20 && (
                                <div className="import-wizard-more">
                                    ... y {parsedRows.length - 20} más
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="import-wizard-footer">
                    {step > 1 && (
                        <button className="btn btn-secondary" onClick={() => setStep((step - 1) as Step)}>
                            ← Anterior
                        </button>
                    )}
                    <div className="import-wizard-footer-right">
                        <button className="btn btn-secondary" onClick={handleClose}>
                            Cancelar
                        </button>
                        {step === 2 && (
                            <button className="btn btn-primary" onClick={handleProcessMapping}>
                                Continuar →
                            </button>
                        )}
                        {step === 3 && validCount > 0 && (
                            <button className="btn btn-primary" onClick={handleConfirmImport}>
                                Importar {validCount} índices
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .import-wizard-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 100;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(4px);
                }
                .import-wizard-modal {
                    width: 100%;
                    max-width: 700px;
                    max-height: 90vh;
                    background: var(--surface-1);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-lg);
                    display: flex;
                    flex-direction: column;
                    animation: slideUp 0.2s ease;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .import-wizard-header {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-md) var(--space-lg);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--surface-2);
                    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                }
                .import-wizard-header h3 {
                    margin: 0;
                    font-size: var(--font-size-lg);
                    font-weight: 600;
                }
                .import-wizard-steps {
                    display: flex;
                    gap: var(--space-md);
                    margin-left: auto;
                }
                .import-wizard-step {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-secondary);
                    opacity: 0.5;
                }
                .import-wizard-step.active {
                    opacity: 1;
                    color: var(--brand-primary);
                    font-weight: 600;
                }
                .import-wizard-close {
                    background: none;
                    border: none;
                    font-size: 1.25rem;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    padding: var(--space-xs);
                }
                .import-wizard-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--space-lg);
                }
                .import-wizard-step-content {
                    min-height: 300px;
                }
                .import-wizard-dropzone {
                    border: 2px dashed var(--color-border);
                    border-radius: var(--radius-md);
                    padding: var(--space-xl);
                    text-align: center;
                    cursor: pointer;
                    transition: border-color 0.2s, background 0.2s;
                }
                .import-wizard-dropzone:hover {
                    border-color: var(--brand-primary);
                    background: rgba(59, 130, 246, 0.05);
                }
                .import-wizard-dropzone-icon {
                    font-size: 3rem;
                    margin-bottom: var(--space-md);
                }
                .import-wizard-dropzone-text {
                    font-size: var(--font-size-md);
                    font-weight: 500;
                    margin-bottom: var(--space-sm);
                }
                .import-wizard-dropzone-hint {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }
                .import-wizard-file-info {
                    margin-top: var(--space-md);
                    padding: var(--space-sm) var(--space-md);
                    background: var(--surface-2);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }
                .import-wizard-loading {
                    margin-top: var(--space-md);
                    text-align: center;
                    color: var(--color-text-secondary);
                }
                .import-wizard-error {
                    margin-top: var(--space-md);
                    padding: var(--space-sm) var(--space-md);
                    background: var(--color-error-bg);
                    color: var(--color-error);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }
                .import-wizard-help {
                    margin-top: var(--space-lg);
                    padding: var(--space-sm) var(--space-md);
                    background: var(--color-info-bg);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }
                .import-wizard-field {
                    margin-bottom: var(--space-md);
                }
                .import-wizard-field label {
                    display: block;
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    margin-bottom: var(--space-xs);
                }
                .import-wizard-mapping-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--space-md);
                }
                .import-wizard-checkbox {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    font-size: var(--font-size-sm);
                    margin-bottom: var(--space-md);
                    cursor: pointer;
                }
                .import-wizard-preview-label {
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    margin-bottom: var(--space-sm);
                    color: var(--color-text-secondary);
                }
                .import-wizard-preview-table {
                    max-height: 250px;
                    overflow: auto;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                }
                .import-wizard-preview-table .table {
                    margin: 0;
                    font-size: var(--font-size-sm);
                }
                .import-wizard-preview-table th,
                .import-wizard-preview-table td {
                    padding: var(--space-xs) var(--space-sm);
                    white-space: nowrap;
                }
                .col-period { background: rgba(59, 130, 246, 0.1); }
                .col-index { background: rgba(16, 185, 129, 0.1); }
                .row-header { font-weight: 600; background: var(--surface-2); }
                .row-invalid { background: rgba(239, 68, 68, 0.05); }
                .import-wizard-summary {
                    display: flex;
                    gap: var(--space-md);
                    margin-bottom: var(--space-md);
                }
                .import-wizard-summary-item {
                    padding: var(--space-sm) var(--space-md);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }
                .import-wizard-summary-item.success {
                    background: var(--color-success-bg);
                    color: var(--color-success);
                }
                .import-wizard-summary-item.warning {
                    background: var(--color-warning-bg);
                    color: var(--color-warning);
                }
                .import-wizard-more {
                    text-align: center;
                    padding: var(--space-sm);
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }
                .status-ok { color: var(--color-success); font-weight: bold; }
                .status-error { color: var(--color-error); font-weight: bold; }
                .import-wizard-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md) var(--space-lg);
                    border-top: 1px solid var(--color-border);
                    background: var(--surface-2);
                    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
                }
                .import-wizard-footer-right {
                    display: flex;
                    gap: var(--space-sm);
                    margin-left: auto;
                }
            `}</style>
        </div>
    );
}
