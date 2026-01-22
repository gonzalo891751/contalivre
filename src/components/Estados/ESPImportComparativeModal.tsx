import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { X, Upload, Check, AlertCircle, ArrowRight, Loader2, Search } from 'lucide-react'
import { normalizeText, parseAmount } from '../../utils/formatters'
import { fuzzyMatchAccount, type MatchConfidence } from '../../utils/fuzzyMatch'
import {
    saveESPComparative,
    type ESPComparativeRecord
} from '../../storage/espComparativeStore'
import type { Account } from '../../core/models'

// ============================================
// Types
// ============================================
interface ESPImportComparativeModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    targetYear: number
    currentYear: number
    empresaId: string
    accounts: Account[]
}

interface ParsedRow {
    [key: string]: any
}

interface CandidateRecord {
    originalCode: string
    originalName: string
    originalAmount: number
    accountCode: string
    accountName: string
    accountId?: string
    amount: number
    matchMethod: 'code' | 'exact' | 'synonym' | 'fuzzy' | 'manual' | 'none'
    confidence: MatchConfidence
    include: boolean
}

type Step = 'upload' | 'mapping' | 'success'

// ============================================
// Component
// ============================================
export function ESPImportComparativeModal({
    isOpen,
    onClose,
    onSuccess,
    targetYear,
    // currentYear,
    empresaId,
    accounts
}: ESPImportComparativeModalProps) {
    // Wizard state
    const [step, setStep] = useState<Step>('upload')
    const [processing, setProcessing] = useState(false)

    // File state
    const [fileName, setFileName] = useState('')
    const [fileData, setFileData] = useState<ParsedRow[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [parseErrors, setParseErrors] = useState<string[]>([])

    // Mapping state
    const [mapping, setMapping] = useState({
        code: '',
        name: '',
        amount: ''
    })

    // Review state
    const [candidates, setCandidates] = useState<CandidateRecord[]>([])
    const [filterText, setFilterText] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | 'matched' | 'unmatched'>('all')

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setStep('upload')
            setFileName('')
            setFileData([])
            setColumns([])
            setParseErrors([])
            setMapping({ code: '', name: '', amount: '' })
            setCandidates([])
            setFilterText('')
            setFilterStatus('all')
        }
    }, [isOpen])

    // ============================================
    // File Handling
    // ============================================
    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0]
        if (!file) return

        setProcessing(true)
        setParseErrors([])
        setFileName(file.name)

        const reader = new FileReader()

        const handleSuccess = (data: ParsedRow[], metaCols: string[]) => {
            if (data.length > 0) {
                setFileData(data)
                setColumns(metaCols)
                autoGuessMapping(metaCols)
            } else {
                setParseErrors(['El archivo no contiene datos válidos.'])
            }
            setProcessing(false)
        }

        const handleError = (msg: string) => {
            setParseErrors([msg])
            setProcessing(false)
        }

        if (file.name.endsWith('.csv')) {
            reader.onload = (e) => {
                const text = e.target?.result as string
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        handleSuccess(
                            results.data as ParsedRow[],
                            results.meta.fields || Object.keys(results.data[0] || {})
                        )
                    },
                    error: (err: any) => handleError(`Error CSV: ${err.message}`)
                })
            }
            reader.readAsText(file)
        } else {
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer)
                    const workbook = XLSX.read(data, { type: 'array' })
                    const firstSheet = workbook.SheetNames[0]
                    const worksheet = workbook.Sheets[firstSheet]
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

                    if (jsonData.length > 1) {
                        const header = jsonData[0] as string[]
                        const rows = XLSX.utils.sheet_to_json(worksheet) as ParsedRow[]
                        handleSuccess(rows, header)
                    } else {
                        handleError('La hoja de cálculo está vacía.')
                    }
                } catch {
                    handleError('Error al procesar archivo Excel.')
                }
            }
            reader.readAsArrayBuffer(file)
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv']
        },
        maxFiles: 1
    })

    const autoGuessMapping = (cols: string[]) => {
        const lowerCols = cols.map(c => normalizeText(c))
        const find = (keys: string[]) => {
            const idx = lowerCols.findIndex(c => keys.some(k => c.includes(k)))
            return idx >= 0 ? cols[idx] : ''
        }
        setMapping({
            code: find(['codigo', 'cuenta', 'code', 'id']),
            name: find(['nombre', 'descripcion', 'detalle', 'name']),
            amount: find(['saldo', 'importe', 'monto', 'valor', 'balance', 'amount'])
        })
    }

    const clearFile = () => {
        setFileName('')
        setFileData([])
        setColumns([])
        setParseErrors([])
        setMapping({ code: '', name: '', amount: '' })
    }

    // ============================================
    // Mapping -> Matching
    // ============================================
    const startMatching = () => {
        if (!mapping.amount || !mapping.name) return

        setProcessing(true)

        const newCandidates: CandidateRecord[] = []

        for (const row of fileData) {
            const rawAmount = row[mapping.amount]
            if (rawAmount === undefined || rawAmount === null || rawAmount === '') continue

            const amount = parseAmount(rawAmount)
            const origCode = mapping.code ? String(row[mapping.code] || '').trim() : ''
            const origName = String(row[mapping.name] || '').trim()

            if (!origName) continue

            // Use fuzzy matching
            const match = fuzzyMatchAccount(origCode, origName, accounts)

            newCandidates.push({
                originalCode: origCode,
                originalName: origName,
                originalAmount: amount,
                accountCode: match?.accountCode || '',
                accountName: match?.accountName || '',
                accountId: match?.accountId,
                amount,
                matchMethod: match?.method || 'none',
                confidence: match?.confidence || 'none',
                include: !!match
            })
        }

        setCandidates(newCandidates)
        setStep('mapping')
        setProcessing(false)
    }

    // ============================================
    // Review Actions
    // ============================================
    const updateCandidate = (index: number, updates: Partial<CandidateRecord>) => {
        setCandidates(prev => {
            const next = [...prev]
            next[index] = { ...next[index], ...updates }

            // If manually selecting account
            if (updates.accountId) {
                const acc = accounts.find(a => a.id === updates.accountId)
                if (acc) {
                    next[index].accountCode = acc.code
                    next[index].accountName = acc.name
                    next[index].matchMethod = 'manual'
                    next[index].confidence = 'alta'
                    next[index].include = true
                }
            }

            return next
        })
    }

    const confirmImport = () => {
        setProcessing(true)

        // Filter to included records
        const toSave: ESPComparativeRecord[] = candidates
            .filter(c => c.include && c.accountId)
            .map(c => ({
                accountCode: c.accountCode,
                accountName: c.accountName,
                accountId: c.accountId,
                amount: c.amount,
                originalCode: c.originalCode,
                originalName: c.originalName,
                matchMethod: c.matchMethod as ESPComparativeRecord['matchMethod'],
                confidence: c.confidence as ESPComparativeRecord['confidence']
            }))

        // Save to storage
        saveESPComparative(empresaId, targetYear, toSave)

        // Show success
        setStep('success')
        setProcessing(false)

        // Auto close after delay
        setTimeout(() => {
            onSuccess()
            onClose()
        }, 1500)
    }

    // ============================================
    // Filter Logic
    // ============================================
    const filteredCandidates = useMemo(() => {
        return candidates.filter(c => {
            if (filterStatus === 'matched' && !c.accountId) return false
            if (filterStatus === 'unmatched' && c.accountId) return false

            if (filterText) {
                const search = normalizeText(filterText)
                return normalizeText(c.originalName).includes(search) ||
                    normalizeText(c.accountName).includes(search) ||
                    c.originalCode?.includes(search) ||
                    c.accountCode.includes(search)
            }
            return true
        })
    }, [candidates, filterText, filterStatus])

    const stats = useMemo(() => ({
        total: candidates.length,
        matched: candidates.filter(c => c.accountId).length,
        included: candidates.filter(c => c.include).length,
        alta: candidates.filter(c => c.confidence === 'alta').length,
        media: candidates.filter(c => c.confidence === 'media').length,
        baja: candidates.filter(c => c.confidence === 'baja').length
    }), [candidates])

    if (!isOpen) return null

    return (
        <div className="esp-modal-overlay">
            <div className="esp-modal-card">
                {/* Header */}
                <div className="esp-modal-header">
                    <div>
                        <div className="esp-modal-title">Importar Comparativo {targetYear}</div>
                        <div className="esp-modal-subtitle">Estado de Situación Patrimonial</div>
                    </div>
                    <button className="esp-modal-close" onClick={onClose} aria-label="Cerrar">
                        <X size={24} />
                    </button>
                </div>

                {/* Steps Indicator */}
                <div className="esp-steps-bar">
                    <div className={`esp-step ${step === 'upload' ? 'active' : 'done'}`}>
                        <div className="esp-step-dot">1</div>
                        <span>Subir archivo</span>
                    </div>
                    <div className="esp-step-line" />
                    <div className={`esp-step ${step === 'mapping' ? 'active' : step === 'success' ? 'done' : ''}`}>
                        <div className="esp-step-dot">2</div>
                        <span>Mapeo</span>
                    </div>
                    <div className="esp-step-line" />
                    <div className={`esp-step ${step === 'success' ? 'active' : ''}`}>
                        <div className="esp-step-dot">3</div>
                        <span>Listo</span>
                    </div>
                </div>

                {/* Body */}
                <div className="esp-modal-body">
                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div className="esp-step-content">
                            {!fileName ? (
                                <div
                                    {...getRootProps()}
                                    className={`esp-dropzone ${isDragActive ? 'active' : ''}`}
                                >
                                    <input {...getInputProps()} />
                                    <Upload className="esp-dropzone-icon" />
                                    <div className="esp-dropzone-text">
                                        {isDragActive
                                            ? 'Soltá el archivo acá...'
                                            : 'Arrastrá tu archivo Excel o CSV acá'}
                                    </div>
                                    <div className="esp-dropzone-subtext">
                                        o hacé clic para buscar en tu compu
                                    </div>
                                </div>
                            ) : (
                                <div className="esp-file-selected">
                                    <div className="esp-file-info">
                                        <div className="esp-file-icon">📄</div>
                                        <div>
                                            <div className="esp-file-name">{fileName}</div>
                                            <div className="esp-file-rows">{fileData.length} filas detectadas</div>
                                        </div>
                                    </div>
                                    <button onClick={clearFile} className="esp-file-clear">
                                        Quitar archivo
                                    </button>
                                </div>
                            )}

                            {parseErrors.length > 0 && (
                                <div className="esp-error-box">
                                    <AlertCircle size={16} />
                                    {parseErrors[0]}
                                </div>
                            )}

                            {/* Mapping Preview */}
                            {fileData.length > 0 && (
                                <div className="esp-map-section">
                                    <div className="esp-map-title">Mapear columnas</div>
                                    <div className="esp-map-controls">
                                        <div className="esp-field-group">
                                            <label className="esp-label">Columna Nombre (*)</label>
                                            <select
                                                className="esp-select"
                                                value={mapping.name}
                                                onChange={e => setMapping(p => ({ ...p, name: e.target.value }))}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="esp-field-group">
                                            <label className="esp-label">Columna Saldo (*)</label>
                                            <select
                                                className="esp-select"
                                                value={mapping.amount}
                                                onChange={e => setMapping(p => ({ ...p, amount: e.target.value }))}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="esp-field-group">
                                            <label className="esp-label">Columna Código (Opcional)</label>
                                            <select
                                                className="esp-select"
                                                value={mapping.code}
                                                onChange={e => setMapping(p => ({ ...p, code: e.target.value }))}
                                            >
                                                <option value="">(Ignorar)</option>
                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Preview Table */}
                                    <div className="esp-preview-wrapper">
                                        <table className="esp-preview-table">
                                            <thead>
                                                <tr>
                                                    <th>Código</th>
                                                    <th>Nombre</th>
                                                    <th>Saldo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fileData.slice(0, 5).map((row, i) => (
                                                    <tr key={i}>
                                                        <td>{mapping.code ? row[mapping.code] : '-'}</td>
                                                        <td>{mapping.name ? row[mapping.name] : '-'}</td>
                                                        <td>{mapping.amount ? row[mapping.amount] : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {fileData.length > 5 && (
                                            <div className="esp-preview-more">
                                                +{fileData.length - 5} filas más
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Mapping Review */}
                    {step === 'mapping' && (
                        <div className="esp-step-content full-height">
                            {/* Stats Bar */}
                            <div className="esp-stats-bar">
                                <div className="esp-stat">
                                    <span className="esp-stat-num">{stats.total}</span>
                                    <span className="esp-stat-lbl">Filas</span>
                                </div>
                                <div className="esp-stat">
                                    <span className="esp-stat-num text-success">{stats.matched}</span>
                                    <span className="esp-stat-lbl">Vinculadas</span>
                                </div>
                                <div className="esp-stat">
                                    <span className="esp-stat-num text-primary">{stats.included}</span>
                                    <span className="esp-stat-lbl">A importar</span>
                                </div>
                                <div className="esp-stat-separator" />
                                <div className="esp-confidence-stats">
                                    <span className="esp-conf-badge alta">{stats.alta} Alta</span>
                                    <span className="esp-conf-badge media">{stats.media} Media</span>
                                    <span className="esp-conf-badge baja">{stats.baja} Baja</span>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="esp-filters">
                                <div className="esp-search-wrapper">
                                    <Search size={16} className="esp-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="esp-search-input"
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value)}
                                    />
                                </div>
                                <div className="esp-filter-tabs">
                                    <button
                                        className={`esp-filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('all')}
                                    >Todos</button>
                                    <button
                                        className={`esp-filter-tab ${filterStatus === 'matched' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('matched')}
                                    >Vinculados</button>
                                    <button
                                        className={`esp-filter-tab ${filterStatus === 'unmatched' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('unmatched')}
                                    >Pendientes</button>
                                </div>
                            </div>

                            {/* Review Table */}
                            <div className="esp-review-wrapper">
                                <table className="esp-review-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 50 }}>Incl.</th>
                                            <th>Datos del Archivo</th>
                                            <th>Cuenta del Sistema</th>
                                            <th style={{ width: 80 }}>Conf.</th>
                                            <th style={{ width: 120 }}>Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCandidates.map((row) => {
                                            const realIndex = candidates.indexOf(row)
                                            return (
                                                <tr key={realIndex} className={row.accountId ? 'matched' : 'pending'}>
                                                    <td className="text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.include}
                                                            onChange={e => updateCandidate(realIndex, { include: e.target.checked })}
                                                            disabled={!row.accountId}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div className="esp-cell-code">{row.originalCode || '-'}</div>
                                                        <div className="esp-cell-name">{row.originalName}</div>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className={`esp-account-select ${!row.accountId ? 'unassigned' : ''}`}
                                                            value={row.accountId || ''}
                                                            onChange={(e) => updateCandidate(realIndex, { accountId: e.target.value })}
                                                        >
                                                            <option value="">-- Seleccionar Cuenta --</option>
                                                            {accounts.map(acc => (
                                                                <option key={acc.id} value={acc.id}>
                                                                    {acc.code} - {acc.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {row.matchMethod !== 'none' && row.matchMethod !== 'manual' && (
                                                            <span className="esp-match-badge">Auto: {row.matchMethod}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`esp-conf-badge ${row.confidence}`}>
                                                            {row.confidence !== 'none' ? row.confidence : '-'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="esp-amount-input"
                                                            value={row.amount}
                                                            onChange={e => updateCandidate(realIndex, { amount: parseFloat(e.target.value) || 0 })}
                                                        />
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Success */}
                    {step === 'success' && (
                        <div className="esp-step-content esp-success-content">
                            <div className="esp-success-icon">
                                <Check size={48} />
                            </div>
                            <h3 className="esp-success-title">¡Listo!</h3>
                            <p className="esp-success-text">
                                Los datos de {targetYear} se importaron correctamente.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="esp-modal-footer">
                    <button className="esp-btn-secondary" onClick={onClose}>Cancelar</button>

                    {step === 'upload' && fileData.length > 0 && (
                        <button
                            className="esp-btn-primary"
                            disabled={!mapping.name || !mapping.amount || processing}
                            onClick={startMatching}
                        >
                            {processing ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                            Siguiente
                        </button>
                    )}

                    {step === 'mapping' && (
                        <button
                            className="esp-btn-primary"
                            disabled={stats.included === 0 || processing}
                            onClick={confirmImport}
                        >
                            {processing ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                            Confirmar ({stats.included})
                        </button>
                    )}
                </div>
            </div>

            <style>{styles}</style>
        </div>
    )
}

// ============================================
// Styles
// ============================================
const styles = `
/* Overlay */
.esp-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
}

/* Card */
.esp-modal-card {
    background: white;
    width: 950px;
    max-width: 100%;
    max-height: 90vh;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Header */
.esp-modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
}

.esp-modal-title {
    font-weight: 700;
    font-size: 1.25rem;
    color: #0f172a;
    font-family: var(--font-display, 'Outfit', sans-serif);
}

.esp-modal-subtitle {
    font-size: 0.875rem;
    color: #64748b;
    margin-top: 2px;
}

.esp-modal-close {
    padding: 8px;
    cursor: pointer;
    color: #64748b;
    background: none;
    border: none;
    border-radius: 8px;
    transition: all 0.15s ease;
}

.esp-modal-close:hover {
    background: #fee2e2;
    color: #ef4444;
}

/* Steps Bar */
.esp-steps-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid #f1f5f9;
}

.esp-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    color: #94a3b8;
}

.esp-step.active {
    color: #3B82F6;
    font-weight: 600;
}

.esp-step.done {
    color: #10B981;
}

.esp-step-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
}

.esp-step.active .esp-step-dot {
    background: #3B82F6;
    color: white;
}

.esp-step.done .esp-step-dot {
    background: #10B981;
    color: white;
}

.esp-step-line {
    width: 40px;
    height: 2px;
    background: #e2e8f0;
}

/* Body */
.esp-modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.esp-step-content {
    padding: 24px;
    flex: 1;
    overflow-y: auto;
}

.esp-step-content.full-height {
    padding: 0;
    display: flex;
    flex-direction: column;
}

/* Dropzone */
.esp-dropzone {
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    padding: 48px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: #f8fafc;
}

.esp-dropzone:hover, .esp-dropzone.active {
    border-color: #3B82F6;
    background: #eff6ff;
}

.esp-dropzone-icon {
    width: 48px;
    height: 48px;
    color: #94a3b8;
    margin: 0 auto 16px;
}

.esp-dropzone-text {
    font-weight: 600;
    color: #334155;
    margin-bottom: 4px;
}

.esp-dropzone-subtext {
    color: #64748b;
    font-size: 0.85rem;
}

/* File Selected */
.esp-file-selected {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
}

.esp-file-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.esp-file-icon {
    font-size: 2rem;
}

.esp-file-name {
    font-weight: 600;
    color: #0f172a;
}

.esp-file-rows {
    font-size: 0.875rem;
    color: #64748b;
}

.esp-file-clear {
    padding: 8px 16px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    color: #ef4444;
    cursor: pointer;
}

.esp-file-clear:hover {
    background: #fef2f2;
}

/* Error Box */
.esp-error-box {
    margin-top: 16px;
    padding: 12px;
    background: #fef2f2;
    color: #ef4444;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
}

/* Mapping Section */
.esp-map-section {
    margin-top: 24px;
}

.esp-map-title {
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 12px;
}

.esp-map-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 16px;
}

.esp-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 6px;
    display: block;
}

.esp-select {
    width: 100%;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    background: white;
}

.esp-select:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Preview Table */
.esp-preview-wrapper {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
}

.esp-preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

.esp-preview-table th {
    background: #f1f5f9;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.esp-preview-table td {
    padding: 10px 12px;
    border-top: 1px solid #f1f5f9;
    color: #334155;
}

.esp-preview-more {
    padding: 8px;
    text-align: center;
    font-size: 0.75rem;
    color: #64748b;
    background: #f8fafc;
}

/* Stats Bar */
.esp-stats-bar {
    display: flex;
    gap: 24px;
    padding: 16px 24px;
    background: white;
    border-bottom: 1px solid #f1f5f9;
    align-items: center;
}

.esp-stat {
    display: flex;
    flex-direction: column;
}

.esp-stat-num {
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1;
}

.esp-stat-lbl {
    font-size: 0.75rem;
    color: #64748b;
    margin-top: 4px;
}

.text-success { color: #10B981; }
.text-primary { color: #3B82F6; }

.esp-stat-separator {
    width: 1px;
    height: 32px;
    background: #e2e8f0;
}

.esp-confidence-stats {
    display: flex;
    gap: 8px;
}

.esp-conf-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    text-transform: uppercase;
}

.esp-conf-badge.alta {
    background: #dcfce7;
    color: #166534;
}

.esp-conf-badge.media {
    background: #fef3c7;
    color: #92400e;
}

.esp-conf-badge.baja {
    background: #fee2e2;
    color: #991b1b;
}

.esp-conf-badge.none {
    background: #f1f5f9;
    color: #64748b;
}

/* Filters */
.esp-filters {
    display: flex;
    gap: 16px;
    padding: 12px 24px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    align-items: center;
}

.esp-search-wrapper {
    position: relative;
    flex: 1;
}

.esp-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
}

.esp-search-input {
    width: 100%;
    padding: 10px 10px 10px 40px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
}

.esp-search-input:focus {
    outline: none;
    border-color: #3B82F6;
}

.esp-filter-tabs {
    display: flex;
    gap: 4px;
    background: #e2e8f0;
    padding: 4px;
    border-radius: 8px;
}

.esp-filter-tab {
    background: none;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
}

.esp-filter-tab:hover {
    background: rgba(255, 255, 255, 0.5);
}

.esp-filter-tab.active {
    background: white;
    color: #0f172a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* Review Table */
.esp-review-wrapper {
    flex: 1;
    overflow-y: auto;
}

.esp-review-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

.esp-review-table th {
    background: #f1f5f9;
    padding: 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.esp-review-table td {
    padding: 12px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
}

.esp-review-table tr:hover td {
    background: #f8fafc;
}

.esp-review-table tr.pending td {
    background: #fffbeb;
}

.esp-cell-code {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-weight: 600;
    font-size: 0.75rem;
    color: #64748b;
}

.esp-cell-name {
    font-weight: 500;
    color: #0f172a;
}

.esp-account-select {
    width: 100%;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
}

.esp-account-select.unassigned {
    border-color: #fca5a5;
    background: #fef2f2;
}

.esp-match-badge {
    display: inline-block;
    font-size: 0.65rem;
    background: #dbeafe;
    color: #1e40af;
    padding: 2px 6px;
    border-radius: 4px;
    margin-top: 4px;
}

.esp-amount-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    text-align: right;
}

.text-center { text-align: center; }

/* Success */
.esp-success-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 64px 24px;
}

.esp-success-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #dcfce7;
    color: #10B981;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    animation: bounce 0.5s ease;
}

@keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}

.esp-success-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px;
    font-family: var(--font-display, 'Outfit', sans-serif);
}

.esp-success-text {
    color: #64748b;
    margin: 0;
}

/* Footer */
.esp-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    background: #f8fafc;
}

.esp-btn-secondary {
    padding: 10px 20px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s ease;
}

.esp-btn-secondary:hover {
    background: #f8fafc;
}

.esp-btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.esp-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
}

.esp-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
}
`
