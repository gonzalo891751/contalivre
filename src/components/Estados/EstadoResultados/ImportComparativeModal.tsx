import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { X, Upload, Check, AlertCircle, ArrowRight, Loader2, Search } from 'lucide-react'
import { normalizeText, parseAmount } from '../../../utils/formatters' // Correct import
import type { Account } from '../../../core/models'

// ============================================
// Types
// ============================================

export interface ImportedRecord {
    // System Data (Destination)
    code: string
    name: string
    amount: number

    // Source Data
    originalCode: string
    originalName: string
    originalAmount: number

    // Logic
    matchedAccountId?: string
    matchMethod: 'code' | 'name' | 'manual' | 'none'
    include: boolean
}

interface ImportComparativeModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (data: ImportedRecord[]) => void
    onClean?: () => void
    targetYear: number
    accounts: Account[]
    hasComparativeData?: boolean
}

interface ParsedRow {
    [key: string]: any
}

type Step = 'upload' | 'preview' | 'review'

// ============================================
// Modal Component
// ============================================

export function ImportComparativeModal({
    isOpen,
    onClose,
    onImport,
    onClean,
    targetYear,
    accounts,
    hasComparativeData
}: ImportComparativeModalProps) {
    const [step, setStep] = useState<Step>('upload')
    const [fileData, setFileData] = useState<ParsedRow[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [mapping, setMapping] = useState({
        code: '',
        name: '',
        amount: ''
    })
    const [processing, setProcessing] = useState(false)
    const [parseErrors, setParseErrors] = useState<string[]>([])

    // Review State
    const [candidates, setCandidates] = useState<ImportedRecord[]>([])
    const [filterText, setFilterText] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | 'matched' | 'unmatched'>('all')

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setStep('upload')
            setFileData([])
            setCandidates([])
            setParseErrors([])
            setMapping({ code: '', name: '', amount: '' })
        }
    }, [isOpen])

    // ============================================
    // Logic: File Handling
    // ============================================
    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0]
        if (!file) return

        setProcessing(true)
        setParseErrors([])

        const reader = new FileReader()

        const handleSuccess = (data: ParsedRow[], metaCols: string[]) => {
            if (data.length > 0) {
                setFileData(data)
                setColumns(metaCols)
                autoGuessMapping(metaCols)
                setStep('preview')
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
                        handleSuccess(results.data as ParsedRow[], results.meta.fields || Object.keys(results.data[0] || {}))
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
                } catch (err: any) {
                    handleError('Error al procesar Excel.')
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
            code: find(['codigo', 'cuenta', 'id']),
            name: find(['nombre', 'descripcion', 'detalle']),
            amount: find(['saldo', 'importe', 'monto', 'valor'])
        })
    }

    // ============================================
    // Logic: Matching (Step 2 -> 3)
    // ============================================
    const startMatching = () => {
        if (!mapping.amount || !mapping.name) return

        setProcessing(true)

        // Prepare Maps
        const accByCode = new Map<string, Account>()
        const accByName = new Map<string, Account>()
        accounts.forEach(a => {
            accByCode.set(a.code, a)
            accByName.set(normalizeText(a.name), a)
        })

        const newCandidates: ImportedRecord[] = []

        fileData.forEach(row => {
            const rawAmount = row[mapping.amount]
            if (rawAmount === undefined || rawAmount === null || rawAmount === '') return

            const amount = parseAmount(rawAmount)
            // if (amount === 0) return // Allow 0? Ideally usually not relevant, but maybe.

            const origCode = mapping.code ? String(row[mapping.code] || '').trim() : ''
            const origName = String(row[mapping.name] || '').trim()

            // Match Logic
            let match: Account | undefined
            let method: 'code' | 'name' | 'none' = 'none'

            // 1. Code
            if (origCode && accByCode.has(origCode)) {
                match = accByCode.get(origCode)
                method = 'code'
            }
            // 2. Name
            if (!match && origName) {
                const norm = normalizeText(origName)
                if (accByName.has(norm)) {
                    match = accByName.get(norm)
                    method = 'name'
                }
            }

            newCandidates.push({
                code: match ? match.code : '',
                name: match ? match.name : '',
                amount: amount,
                originalCode: origCode,
                originalName: origName,
                originalAmount: amount,
                matchedAccountId: match ? match.id : undefined,
                matchMethod: method,
                include: !!match // Default include if matched
            })
        })

        setCandidates(newCandidates)
        setStep('review')
        setProcessing(false)
    }

    // ============================================
    // Logic: Review Actions
    // ============================================
    const updateCandidate = (index: number, updates: Partial<ImportedRecord>) => {
        setCandidates(prev => {
            const next = [...prev]
            next[index] = { ...next[index], ...updates }

            // If account changed manually
            if (updates.matchedAccountId) {
                const acc = accounts.find(a => a.id === updates.matchedAccountId)
                if (acc) {
                    next[index].code = acc.code
                    next[index].name = acc.name
                    next[index].matchMethod = 'manual'
                    next[index].include = true
                }
            }
            return next
        })
    }

    const confirmImport = () => {
        const final = candidates.filter(c => c.include && c.matchedAccountId)
        onImport(final)
        onClose()
    }

    // Filter Logic
    const filteredCandidates = useMemo(() => {
        return candidates.filter(c => {
            if (filterStatus === 'matched' && !c.matchedAccountId) return false
            if (filterStatus === 'unmatched' && c.matchedAccountId) return false

            if (filterText) {
                const search = normalizeText(filterText)
                return normalizeText(c.originalName).includes(search) ||
                    normalizeText(c.name).includes(search) ||
                    c.originalCode?.includes(search) ||
                    c.code.includes(search)
            }
            return true
        })
    }, [candidates, filterText, filterStatus])

    // Stats
    const stats = useMemo(() => {
        return {
            total: candidates.length,
            matched: candidates.filter(c => c.matchedAccountId).length,
            included: candidates.filter(c => c.include).length
        }
    }, [candidates])


    if (!isOpen) return null

    return (
        <div className="er-modal-overlay">
            <div className="er-modal-card">
                {/* Header */}
                <div className="er-modal-header">
                    <div className="er-modal-title">
                        Importar Comparativo {targetYear}
                    </div>
                    <button className="er-modal-close" onClick={onClose} title="Cerrar">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="er-modal-body">
                    {step === 'upload' && (
                        <div className="er-step-content">
                            <div {...getRootProps()} className={`er-dropzone ${isDragActive ? 'active' : ''}`}>
                                <input {...getInputProps()} />
                                <Upload className="er-dropzone-icon" />
                                <div className="er-dropzone-text">
                                    {isDragActive ? 'Soltá el archivo acá...' : 'Hacé click o arrastrá tu archivo'}
                                </div>
                                <div className="er-dropzone-subtext">
                                    Soporta .xlsx, .xls y .csv
                                </div>
                                {parseErrors.length > 0 && (
                                    <div className="er-error-box">
                                        <AlertCircle size={16} />
                                        {parseErrors[0]}
                                    </div>
                                )}
                            </div>

                            {hasComparativeData && (
                                <div className="er-info-box">
                                    <AlertCircle size={16} />
                                    <p>Ya existen datos comparativos cargados.</p>
                                    {onClean && (
                                        <button onClick={onClean} className="er-link-btn text-error">
                                            Limpiar datos actuales
                                        </button>
                                    )}
                                </div>
                            )}

                            <div style={{ marginTop: 24, textAlign: 'center' }}>
                                <a href="#" onClick={(e) => { e.preventDefault(); alert('TODO: Descargar plantilla') }} className="er-link-btn">
                                    Descargar plantilla ejemplo
                                </a>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="er-step-content">
                            <p className="er-step-desc">Asigná las columnas del archivo a los datos del sistema.</p>

                            <div className="er-map-controls">
                                <div className="er-field-group">
                                    <label className="er-label">Columna Nombre (*)</label>
                                    <select
                                        className="er-select"
                                        value={mapping.name}
                                        onChange={e => setMapping(p => ({ ...p, name: e.target.value }))}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="er-field-group">
                                    <label className="er-label">Columna Importe (*)</label>
                                    <select
                                        className="er-select"
                                        value={mapping.amount}
                                        onChange={e => setMapping(p => ({ ...p, amount: e.target.value }))}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="er-field-group">
                                    <label className="er-label">Columna Código (Opcional)</label>
                                    <select
                                        className="er-select"
                                        value={mapping.code}
                                        onChange={e => setMapping(p => ({ ...p, code: e.target.value }))}
                                    >
                                        <option value="">(Ignorar)</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="er-preview-table-wrapper">
                                <table className="er-table">
                                    <thead>
                                        <tr>
                                            <th>Código</th>
                                            <th>Nombre</th>
                                            <th>Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fileData.slice(0, 5).map((r, i) => (
                                            <tr key={i}>
                                                <td>{mapping.code ? r[mapping.code] : '-'}</td>
                                                <td>{mapping.name ? r[mapping.name] : '-'}</td>
                                                <td>{mapping.amount ? r[mapping.amount] : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="er-step-content full-height">
                            <div className="er-stats-bar">
                                <div className="er-stat">
                                    <span className="er-stat-num">{stats.total}</span>
                                    <span className="er-stat-lbl">Filas</span>
                                </div>
                                <div className="er-stat">
                                    <span className="er-stat-num text-success">{stats.matched}</span>
                                    <span className="er-stat-lbl">Viculadas</span>
                                </div>
                                <div className="er-stat">
                                    <span className="er-stat-num text-primary">{stats.included}</span>
                                    <span className="er-stat-lbl">A importar</span>
                                </div>
                            </div>

                            <div className="er-filters">
                                <div className="er-search-wrapper">
                                    <Search size={16} className="er-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="er-search-input"
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value)}
                                    />
                                </div>
                                <div className="er-filter-tabs">
                                    <button
                                        className={`er-filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('all')}
                                    >Todos</button>
                                    <button
                                        className={`er-filter-tab ${filterStatus === 'matched' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('matched')}
                                    >Vinculados</button>
                                    <button
                                        className={`er-filter-tab ${filterStatus === 'unmatched' ? 'active' : ''}`}
                                        onClick={() => setFilterStatus('unmatched')}
                                    >Pendientes</button>
                                </div>
                            </div>

                            <div className="er-review-grid-wrapper">
                                <table className="er-table sticky-header">
                                    <thead>
                                        <tr>
                                            <th w-50>Incluir</th>
                                            <th>Datos Archivo</th>
                                            <th>Cuenta Sistema</th>
                                            <th>Importe Ajustado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCandidates.map((row) => {
                                            // Find actual index in real candidates array to update correctly
                                            const realIndex = candidates.indexOf(row)
                                            return (
                                                <tr key={realIndex} className={row.matchedAccountId ? 'row-matched' : 'row-pending'}>
                                                    <td className="text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.include}
                                                            onChange={e => updateCandidate(realIndex, { include: e.target.checked })}
                                                            disabled={!row.matchedAccountId} // Can only include if matched
                                                        />
                                                    </td>
                                                    <td>
                                                        <div className="er-cell-code">{row.originalCode}</div>
                                                        <div className="er-cell-name">{row.originalName}</div>
                                                        <div className="er-cell-sub">{formatAccountingLocal(row.originalAmount)}</div>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className={`er-table-select ${!row.matchedAccountId ? 'unassigned' : ''}`}
                                                            value={row.matchedAccountId || ''}
                                                            onChange={(e) => updateCandidate(realIndex, { matchedAccountId: e.target.value })}
                                                        >
                                                            <option value="">-- Seleccionar Cuenta --</option>
                                                            {accounts.map(acc => (
                                                                <option key={acc.id} value={acc.id}>
                                                                    {acc.code} - {acc.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {row.matchMethod !== 'none' && row.matchMethod !== 'manual' && (
                                                            <span className="er-match-badge">Auto: {row.matchMethod}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="er-table-input"
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
                </div>

                {/* Footer Buttons */}
                <div className="er-modal-footer">
                    <button className="er-btn-secondary" onClick={onClose}>Cancelar</button>

                    {step === 'preview' && (
                        <button
                            className="er-btn-primary"
                            disabled={!mapping.name || !mapping.amount || processing}
                            onClick={startMatching}
                        >
                            {processing ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                            Siguiente
                        </button>
                    )}

                    {step === 'review' && (
                        <button
                            className="er-btn-primary"
                            disabled={stats.included === 0}
                            onClick={confirmImport}
                        >
                            <Check size={16} /> Confirmar ({stats.included})
                        </button>
                    )}
                </div>
            </div>
            <style>{styles}</style>
        </div>
    )
}

function formatAccountingLocal(val: number) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(val)
}

// ============================================
// Styles
// ============================================
// Minimized styles for brevity, using ER vars
const styles = `
.er-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; justify-content: center; align-items: center; }
.er-modal-card { background: white; width: 900px; max-width: 95vw; height: 85vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
.er-modal-header { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
.er-modal-title { font-weight: 700; font-size: 1.1rem; color: #0f172a; }
.er-modal-close { padding: 8px; cursor: pointer; color: #64748b; background: none; border: none; border-radius: 4px; }
.er-modal-close:hover { background: #f1f5f9; color: #ef4444; }
.er-modal-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.er-modal-footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; background: #f8fafc; }

.er-step-content { padding: 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.er-step-content.full-height { padding: 0; }

.er-dropzone { border: 2px dashed #cbd5e1; border-radius: 12px; padding: 48px; text-align: center; cursor: pointer; transition: all 0.2s; background: #f8fafc; margin-bottom: 24px; }
.er-dropzone.active, .er-dropzone:hover { border-color: #3b82f6; background: #eff6ff; }
.er-dropzone-icon { width: 48px; height: 48px; color: #94a3b8; margin-bottom: 16px; }
.er-dropzone-text { font-weight: 600; color: #334155; margin-bottom: 4px; }
.er-dropzone-subtext { color: #64748b; font-size: 0.85rem; }

.er-error-box { margin-top: 16px; padding: 12px; background: #fef2f2; color: #ef4444; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.er-info-box { margin-top: 16px; padding: 12px; background: #eff6ff; color: #1e40af; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }

.er-link-btn { color: #2563eb; text-decoration: underline; background: none; border: none; cursor: pointer; font: inherit; }
.er-link-btn.text-error { color: #ef4444; }

/* Map */
.er-map-controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
.er-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px; display: block; }
.er-select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; }

/* Table */
.er-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.er-table th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #475569; position: sticky; top: 0; z-index: 10; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
.er-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #334155; }
.er-table tr:hover td { background: #f8fafc; }

.er-review-grid-wrapper { flex: 1; overflow-y: auto; }
.sticky-header th { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

/* Review Cells */
.er-cell-code { font-family: monospace; font-weight: 700; color: #64748b; font-size: 0.8rem; }
.er-cell-name { font-weight: 500; color: #0f172a; }
.er-cell-sub { font-size: 0.75rem; color: #94a3b8; }
.er-table-input { width: 100%; padding: 6px; border: 1px solid #e2e8f0; border-radius: 4px; font-variant-numeric: tabular-nums; text-align: right; }
.er-table-select { width: 100%; padding: 6px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.85rem; }
.er-table-select.unassigned { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }

.er-match-badge { display: inline-block; font-size: 0.65rem; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; margin-top: 4px; }

/* Stats Bar */
.er-stats-bar { display: flex; gap: 24px; padding: 16px 24px; background: white; border-bottom: 1px solid #f1f5f9; }
.er-stat { display: flex; flex-direction: column; }
.er-stat-num { font-size: 1.25rem; font-weight: 700; color: #0f172a; line-height: 1; }
.er-stat-lbl { font-size: 0.75rem; color: #64748b; margin-top: 4px; }
.text-success { color: #10b981; }
.text-primary { color: #2563eb; }

/* Filters */
.er-filters { display: flex; gap: 16px; padding: 12px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; align-items: center; }
.er-search-wrapper { position: relative; flex: 1; }
.er-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
.er-search-input { width: 100%; padding: 8px 8px 8px 36px; border: 1px solid #cbd5e1; border-radius: 6px; }
.er-filter-tabs { display: flex; gap: 4px; background: #e2e8f0; padding: 4px; border-radius: 6px; }
.er-filter-tab { background: none; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: #64748b; cursor: pointer; }
.er-filter-tab.active { background: white; color: #0f172a; shadow: 0 1px 2px rgba(0,0,0,0.1); }

/* Buttons */
.er-btn-primary { background: #1e293b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.er-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.er-btn-primary:hover:not(:disabled) { background: #0f172a; }
.er-btn-secondary { background: white; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; color: #475569; }
.er-btn-secondary:hover { background: #f8fafc; }
`
