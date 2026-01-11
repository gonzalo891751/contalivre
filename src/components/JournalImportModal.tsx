import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { createEntry, getAllEntries, resetExercise } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import { db } from '../storage/db'
import type { JournalEntry, Account } from '../core/models'
import AccountSearchSelect from '../ui/AccountSearchSelect'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface JournalImportModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (count: number) => void
}

interface RawRow {
    [key: string]: string | number | undefined
}

interface ProcessedEntry {
    nro_asiento: string
    fechaISO: string
    cuenta_codigo: string
    cuenta_nombre: string
    debe: number
    haber: number
    concepto: string
    detalle: string
    sourceRowIndex: number
    errors: string[]
    isValid: boolean
}

interface ColumnMapping {
    nro_asiento: string
    fecha: string
    cuenta_codigo: string
    cuenta_nombre: string
    debe: string
    haber: string
    concepto: string // optional
    detalle: string // optional
}

interface DraftEntry {
    nro_asiento: string
    fechaISO: string
    concepto: string
    lines: {
        accountId: string
        debit: number
        credit: number
        description: string
    }[]
    totalDebe: number
    totalHaber: number
    isBalanced: boolean
    validationErrors: string[]
}

const SAMPLE_CSV = `nro_asiento,fecha,cuenta_codigo,cuenta_nombre,debe,haber,detalle
1,2026-01-10,1.1.01.01,Caja,5000,,Saldo inicial
1,2026-01-10,3.1.01.01,Capital Social,,5000,Saldo inicial
2,2026-01-11,4.1.01.01,Ventas,,2500,Fact A 123
2,2026-01-11,1.1.02.01,Banco,,2500,Cobro Factura`

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalizeHeader = (h: string): string => {
    return h.trim().toLowerCase()
        .replace(/\s+|-/g, '_')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
}

const normalizeText = (t: string): string => {
    return t.trim().toLowerCase().replace(/\s+/g, ' ')
}

const parseARNumber = (val: any): number => {
    if (typeof val === 'number') return val
    if (!val) return 0
    let str = String(val).trim()
    if (!str) return 0

    // Remove currency symbols
    str = str.replace('$', '').trim()

    // 1.234,56 -> remove dots, replace comma with dot
    if (str.includes(',') && str.includes('.')) {
        if (str.indexOf('.') < str.indexOf(',')) {
            // 1.234,56 (AR/EU)
            return parseFloat(str.replace(/\./g, '').replace(',', '.'))
        } else {
            // 1,234.56 (US - unlikely but safe check)
            return parseFloat(str.replace(/,/g, ''))
        }
    }
    // 1234,56 -> replace comma
    else if (str.includes(',')) {
        return parseFloat(str.replace(',', '.'))
    }

    const num = parseFloat(str)
    return isNaN(num) ? 0 : num
}

const parseDateStrict = (val: any): string | null => {
    if (!val) return null

    // Excel serial date
    if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000))
        if (isNaN(date.getTime())) return null
        return date.toISOString().split('T')[0]
    }

    const str = String(val).trim()

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const d = new Date(str)
        return isNaN(d.getTime()) ? null : str
    }

    // DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [day, month, year] = str.split('/')
        const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
        if (isNaN(d.getTime())) return null
        return d.toISOString().split('T')[0]
    }

    return null
}

const detectMapping = (headers: string[]): ColumnMapping => {
    const map: ColumnMapping = {
        nro_asiento: '', fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: '', detalle: ''
    }

    const synonyms: Record<keyof ColumnMapping, string[]> = {
        nro_asiento: ['nro_asiento', 'asiento', 'asiento_ref', 'numero_asiento', 'n_asiento', 'nro', 'n', 'id'],
        fecha: ['fecha', 'date', 'fec'],
        cuenta_codigo: ['cuenta_codigo', 'codigo_cuenta', 'cod_cuenta', 'codigo', 'id_cuenta', 'cuenta_id'],
        cuenta_nombre: ['cuenta_nombre', 'nombre_cuenta', 'cuenta', 'account', 'detalle_cuenta', 'nombre'],
        debe: ['debe', 'debito', 'debit', 'dr'],
        haber: ['haber', 'credito', 'credit', 'cr'],
        concepto: ['concepto', 'memo', 'glosa', 'descripcion_asiento'],
        detalle: ['detalle', 'descripcion', 'detalle_linea', 'obs', 'observacion', 'nota']
    }

    headers.forEach(h => {
        const norm = normalizeHeader(h)
        for (const field of Object.keys(synonyms) as Array<keyof ColumnMapping>) {
            if (!map[field] && synonyms[field].some(s => norm === s || norm.includes(s))) {
                map[field] = h
            }
        }
    })

    return map
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function JournalImportModal({ isOpen, onClose, onSuccess }: JournalImportModalProps) {
    // Pipeline State
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1) // 1:File, 2:Map, 3:Resolve, 4:Review
    const [file, setFile] = useState<File | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [importProgress, setImportProgress] = useState('')

    // Data State
    const [rawRows, setRawRows] = useState<RawRow[]>([])
    const [rawHeaders, setRawHeaders] = useState<string[]>([])
    // Removed unused workbook/selectedSheet states if not strictly needed or re-add suppression
    const [, setWorkbook] = useState<XLSX.WorkBook | null>(null)
    const [sheets, setSheets] = useState<string[]>([])
    const [, setSelectedSheet] = useState<string>('')
    const [availableAccounts, setAvailableAccounts] = useState<Account[]>([])

    // Processing State
    const [mapping, setMapping] = useState<ColumnMapping>({
        nro_asiento: '', fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: '', detalle: ''
    })
    const [processedRows, setProcessedRows] = useState<ProcessedEntry[]>([])

    // Resolution State
    // keys map -> accountId. Keys can be arbitrary strings (code or name from file)
    const [accountResolution, setAccountResolution] = useState<Map<string, string>>(new Map())
    const [unresolvedKeys, setUnresolvedKeys] = useState<string[]>([])

    // Draft State
    const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([])
    const [validationSummary, setValidationSummary] = useState({
        totalRows: 0, validRows: 0, rowErrors: 0,
        totalEntries: 0, balancedEntries: 0, entryErrors: 0
    })

    // Load accounts on mount
    useEffect(() => {
        if (isOpen) {
            getPostableAccounts().then(setAvailableAccounts)
        }
    }, [isOpen])

    const downloadTemplate = () => {
        const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'plantilla_asientos.csv'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleClose = () => {
        if (isLoading) return // Prevent close during import
        setStep(1)
        setFile(null)
        setRawRows([])
        setRawHeaders([])
        setWorkbook(null)
        setSheets([])
        setProcessedRows([])
        setAccountResolution(new Map())
        setUnresolvedKeys([])
        setDraftEntries([])
        onClose()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: File Selection & Parsing
    // ─────────────────────────────────────────────────────────────────────────

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const f = acceptedFiles[0]
        if (f) {
            setFile(f)
            parseFile(f)
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        },
        multiple: false
    })

    const parseFile = async (f: File) => {
        const ext = f.name.split('.').pop()?.toLowerCase()
        if (ext === 'csv') {
            Papa.parse(f, {
                header: true, skipEmptyLines: true,
                complete: (results) => {
                    setRawHeaders(results.meta.fields || [])
                    setRawRows(results.data as RawRow[])
                    setMapping(detectMapping(results.meta.fields || []))
                    setStep(2)
                }
            })
        } else if (ext === 'xlsx' || ext === 'xls') {
            const data = await f.arrayBuffer()
            const wb = XLSX.read(data, { type: 'array' })
            setWorkbook(wb)
            setSheets(wb.SheetNames)
            if (wb.SheetNames.length > 0) selectSheet(wb, wb.SheetNames[0])
            setStep(2)
        }
    }

    const selectSheet = (wb: XLSX.WorkBook, sheetName: string) => {
        setSelectedSheet(sheetName)
        const ws = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" })
        if (data.length > 0) {
            const headers = Object.keys(data[0])
            setRawHeaders(headers)
            setRawRows(data)
            setMapping(detectMapping(headers))
        } else {
            setRawRows([])
            setRawHeaders([])
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Mapping & Processing (Strict)
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (step !== 2 || rawRows.length === 0) return

        let lastFecha: string | null = null
        let lastAsiento: string | null = null

        const processed: ProcessedEntry[] = rawRows.map((row, idx) => {
            const errors: string[] = []

            const rawNro = String(row[mapping.nro_asiento] || '').trim()
            const rawFecha = row[mapping.fecha]
            const rawCuentaCodigo = String(row[mapping.cuenta_codigo] || '').trim()
            const rawCuentaNombre = String(row[mapping.cuenta_nombre] || '').trim()
            const rawDebe = row[mapping.debe]
            const rawHaber = row[mapping.haber]
            const concepto = String(row[mapping.concepto] || '').trim()
            const detalle = String(row[mapping.detalle] || '').trim()

            const debe = parseARNumber(rawDebe)
            const haber = parseARNumber(rawHaber)

            // Fill-down Logic
            let actualNro = rawNro
            if (!actualNro) {
                if (lastAsiento) actualNro = lastAsiento
                else errors.push('Falta N° Asiento')
            } else {
                lastAsiento = actualNro
            }

            let actualFechaVal: string | null = null
            const hasRawFecha = rawFecha !== undefined && rawFecha !== null && String(rawFecha).trim() !== ''
            if (!hasRawFecha) {
                if (lastFecha) actualFechaVal = lastFecha
                else errors.push('Falta Fecha')
            } else {
                const validDate = parseDateStrict(rawFecha)
                if (validDate) {
                    actualFechaVal = validDate
                    lastFecha = validDate
                } else {
                    errors.push(`Fecha inválida: ${rawFecha}`)
                }
            }

            // Validations
            if (!rawCuentaCodigo && !rawCuentaNombre) {
                // Ignore empty spacer rows
                const isEmptyRow = !actualNro && !hasRawFecha && debe === 0 && haber === 0 && !detalle && !concepto
                if (!isEmptyRow) errors.push('Falta Cuenta')
            }

            if (debe > 0 && haber > 0) errors.push('Debe y Haber > 0 simultáneamente')
            if ((rawCuentaCodigo || rawCuentaNombre) && debe === 0 && haber === 0) {
                errors.push('Importe cero')
            }

            // Phase 3 Prep: Identification Key for Resolution
            // We'll prefer Code if present, else Name.
            // This just identifies the "Raw Value" we need to match later.
            return {
                nro_asiento: actualNro,
                fechaISO: actualFechaVal || '',
                cuenta_codigo: rawCuentaCodigo,
                cuenta_nombre: rawCuentaNombre,
                debe,
                haber,
                concepto,
                detalle,
                sourceRowIndex: idx + 2,
                errors,
                isValid: errors.length === 0
            }
        })

        setProcessedRows(processed)

        const valid = processed.filter(p => p.isValid).length
        const total = processed.length

        const summary: Record<string, any> = {}
        processed.forEach(p => { if (p.nro_asiento) summary[p.nro_asiento] = true })

        setValidationSummary(prev => ({
            ...prev,
            totalRows: total,
            validRows: valid,
            rowErrors: total - valid,
            totalEntries: Object.keys(summary).length
        }))

    }, [mapping, rawRows, step])

    const handleGoToResolution = () => {
        // Identify all unique account keys that need resolution
        const validRows = processedRows.filter(r => r.isValid)
        const keysToResolve = new Set<string>()
        const newResolution = new Map<string, string>()

        validRows.forEach(row => {
            // Priority: Code > Name
            const key = row.cuenta_codigo || row.cuenta_nombre
            if (!key) return

            // Try Auto-Match
            let match: Account | undefined

            // 1. By Code (Exact)
            if (row.cuenta_codigo) {
                match = availableAccounts.find(a => a.code === row.cuenta_codigo)
            }
            // 2. By Name (Case insensitive)
            if (!match && row.cuenta_nombre) {
                const search = normalizeText(row.cuenta_nombre)
                match = availableAccounts.find(a => normalizeText(a.name) === search)
            }

            if (match) {
                newResolution.set(key, match.id)
            } else {
                keysToResolve.add(key)
            }
        })

        setAccountResolution(newResolution)
        if (keysToResolve.size > 0) {
            setUnresolvedKeys(Array.from(keysToResolve))
            setStep(3)
        } else {
            setStep(4) // Skip to final review if all matched
            prepareDraft(newResolution)
        }
    }

    const prepareDraft = (resolutionMap: Map<string, string>) => {
        const groups = new Map<string, DraftEntry>()
        const validRows = processedRows.filter(r => r.isValid)

        for (const row of validRows) {
            const key = row.cuenta_codigo || row.cuenta_nombre
            const accountId = resolutionMap.get(key)

            if (!accountId) continue // Should not happen if validation passed

            if (!groups.has(row.nro_asiento)) {
                groups.set(row.nro_asiento, {
                    nro_asiento: row.nro_asiento,
                    fechaISO: row.fechaISO, // Already inherited/validated
                    concepto: row.concepto, // Usually header concept, might take first one found
                    lines: [],
                    totalDebe: 0,
                    totalHaber: 0,
                    isBalanced: false,
                    validationErrors: []
                })
            }

            const entry = groups.get(row.nro_asiento)!

            // If concept is empty in this row but entry has none, verify? 
            // We usually take the concept from the first line or try to find a non-empty one.
            if (!entry.concepto && row.concepto) entry.concepto = row.concepto

            entry.lines.push({
                accountId,
                debit: row.debe,
                credit: row.haber,
                description: row.detalle || row.concepto || ''
            })

            entry.totalDebe += row.debe
            entry.totalHaber += row.haber
        }

        // Final Validation Per Entry
        const entries = Array.from(groups.values()).map(e => {
            const diff = Math.abs(e.totalDebe - e.totalHaber)
            e.isBalanced = diff < 0.01

            if (!e.isBalanced) e.validationErrors.push(`Desbalanceado (Dif: ${diff.toFixed(2)})`)
            if (e.lines.length < 2) e.validationErrors.push('Menos de 2 líneas')

            return e
        })

        setDraftEntries(entries)
        setValidationSummary(prev => ({
            ...prev,
            totalEntries: entries.length,
            balancedEntries: entries.filter(e => e.isBalanced && e.validationErrors.length === 0).length,
            entryErrors: entries.filter(e => !e.isBalanced || e.validationErrors.length > 0).length
        }))

        if (step !== 4) setStep(4)
    }

    const resolveAccount = (key: string, accountId: string) => {
        setAccountResolution(prev => new Map(prev).set(key, accountId))
        setUnresolvedKeys(prev => prev.filter(k => k !== key))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Import Execution (Atomic + Snapshot)
    // ─────────────────────────────────────────────────────────────────────────

    const handleImport = async () => {
        if (isLoading) return
        setIsLoading(true)
        setImportProgress('Iniciando respaldo de seguridad...')

        // Declare snapshot outside to access in catch block if needed, 
        // OR just fetch it inside and keep logic clean.
        // Actually, for rollback, I need to know what to restore.
        let snapshot: JournalEntry[] = []

        try {
            // 1. Snapshot
            snapshot = await getAllEntries()

            // 2. Import Loop
            let importedCount = 0
            const total = draftEntries.length

            for (let i = 0; i < total; i++) {
                const draft = draftEntries[i]
                setImportProgress(`Importando asiento ${i + 1} de ${total}...`)

                const newEntryData: Omit<JournalEntry, 'id'> = {
                    date: draft.fechaISO,
                    memo: draft.concepto || `Importación Asiento ${draft.nro_asiento}`,
                    lines: draft.lines.map(l => ({
                        accountId: l.accountId,
                        debit: l.debit,
                        credit: l.credit,
                        description: l.description
                    }))
                }

                await createEntry(newEntryData)
                importedCount++
            }

            setImportProgress('¡Importación completada con éxito!')
            await new Promise(r => setTimeout(r, 800)) // Show success briefly
            onSuccess(importedCount)
            handleClose()

        } catch (error: any) {
            console.error('Import failed', error)
            setImportProgress('Error detectado. Restaurando estado anterior...')

            // 3. Rollback (Atomic Undo)
            try {
                // We use resetExercise() to clear then restore snapshot
                // This is drastic but ensures 100% atomic rollback to previous state
                const { deletedEntries } = await resetExercise()
                console.log(`Rolled back ${deletedEntries} entries. Restoring snapshot of ${snapshot.length} entries...`)

                // Bulk restore
                // snapshot is JournalEntry[], createEntry expects Omit<JournalEntry, 'id'> BUT
                // db.entries.bulkAdd can take full objects (with ID) to restore exactly as was.
                // We need to cast or just pass it if db supports it. 
                // Dexie bulkAdd supports objects with keys.
                if (snapshot.length > 0) {
                    await db.entries.bulkAdd(snapshot)
                }

                alert(`Error durante la importación:\n${error.message}\n\nSe han restaurado los datos originales.`)
            } catch (rollbackError) {
                console.error('CRITICAL: Rollback failed', rollbackError)
                alert('ERROR CRÍTICO: Falló la importación y también la restauración. Por favor contacte soporte.')
            }
        } finally {
            setIsLoading(false)
            setImportProgress('')
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={isLoading ? undefined : handleClose} />

            <div className={`
                relative bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden border border-slate-100
                ${step === 1 ? 'max-w-2xl' : 'max-w-6xl h-[90vh]'}
                transition-all duration-300
            `}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {isLoading ? '⏳ Importando...' : step === 3 ? '🔍 Resolver Cuentas' : step === 4 ? '✅ Confirmar Importación' : '📥 Importar Asientos'}
                        </h2>
                        {step > 1 && !isLoading && (
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                <span>Paso {step} de 4</span>
                                {file && <span className="text-slate-300">|</span>}
                                {file && <span>{file.name}</span>}
                            </div>
                        )}
                        {isLoading && <p className="text-sm text-blue-600 mt-1">{importProgress}</p>}
                    </div>
                    {!isLoading && <button onClick={handleClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">✕</button>}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6">

                    {/* STEP 1: Upload */}
                    {step === 1 && (
                        <div className="flex flex-col h-full justify-center">
                            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400 hover:bg-white'}`}>
                                <input {...getInputProps()} />
                                <div className="text-4xl mb-4">📂</div>
                                <p className="text-lg font-medium text-slate-700">Arrastrá tu archivo o hacé click</p>
                                <p className="text-sm text-slate-400 mt-2">.csv, .xlsx, .xls</p>
                            </div>
                            <div className="mt-8 text-center">
                                <button onClick={downloadTemplate} className="text-sm text-blue-600 font-medium hover:underline">
                                    Descargar plantilla ejemplo
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Map & Preview */}
                    {step === 2 && (
                        <div className="flex flex-col gap-6">
                            {/* Validation Stats */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asientos</div>
                                    <div className="text-2xl font-bold text-slate-700">{validationSummary.totalEntries}</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Líneas</div>
                                    <div className="text-2xl font-bold text-slate-700">{validationSummary.totalRows}</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm">
                                    <div className="text-xs font-bold text-green-600 uppercase tracking-wider">Válidas</div>
                                    <div className="text-2xl font-bold text-green-700">{validationSummary.validRows}</div>
                                </div>
                                <div className={`p-4 rounded-xl border shadow-sm ${validationSummary.rowErrors > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider ${validationSummary.rowErrors > 0 ? 'text-red-600' : 'text-slate-400'}`}>Errores</div>
                                    <div className={`text-2xl font-bold ${validationSummary.rowErrors > 0 ? 'text-red-700' : 'text-slate-700'}`}>{validationSummary.rowErrors}</div>
                                </div>
                            </div>

                            {/* Column Mapping */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5">
                                <div className="mb-4 font-semibold text-slate-700">Mapeo de Columnas</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {Object.keys(mapping).map((key) => {
                                        const field = key as keyof ColumnMapping
                                        const isRequired = ['nro_asiento', 'fecha', 'debe', 'haber'].includes(field)
                                        return (
                                            <div key={field}>
                                                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase">
                                                    {field.replace('_', ' ')} {isRequired && <span className="text-red-500">*</span>}
                                                </label>
                                                <select
                                                    className={`w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${!mapping[field] && isRequired ? 'border-red-300 bg-red-50' : ''}`}
                                                    value={mapping[field]}
                                                    onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                                                >
                                                    <option value="">(Ignorar)</option>
                                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="mt-4 p-3 bg-blue-50 text-xs text-blue-800 border border-blue-100 rounded-lg">
                                    <strong>Nota:</strong> Mapeá 'Cuenta Código' O 'Cuenta Nombre' (o ambos) para identificar las cuentas.
                                </div>
                            </div>

                            {/* Preview Table */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-[300px]">
                                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                    <span className="font-semibold text-slate-700">Vista Previa (50 filas)</span>
                                </div>
                                <div className="overflow-auto max-h-[400px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 font-medium border-b w-16">Fila</th>
                                                <th className="px-4 py-3 font-medium border-b">Estado</th>
                                                <th className="px-4 py-3 font-medium border-b">N° Asiento</th>
                                                <th className="px-4 py-3 font-medium border-b">Fecha</th>
                                                <th className="px-4 py-3 font-medium border-b">Cuenta (Cod / Nom)</th>
                                                <th className="px-4 py-3 font-medium border-b text-right">Debe</th>
                                                <th className="px-4 py-3 font-medium border-b text-right">Haber</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {processedRows.slice(0, 50).map((row, i) => (
                                                <tr key={i} className={`hover:bg-slate-50 ${!row.isValid ? 'bg-red-50/50' : ''}`}>
                                                    <td className="px-4 py-2 text-slate-400 text-xs">{row.sourceRowIndex}</td>
                                                    <td className="px-4 py-2">
                                                        {row.isValid ? (
                                                            <span className="text-xs font-bold text-green-600">OK</span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-red-600" title={row.errors.join('\n')}>
                                                                Error ({row.errors.length})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 font-mono">{row.nro_asiento}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{row.fechaISO}</td>
                                                    <td className="px-4 py-2 text-xs">
                                                        <div className="font-mono text-slate-500">{row.cuenta_codigo}</div>
                                                        <div className="font-medium text-slate-700">{row.cuenta_nombre}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono">{row.debe > 0 ? row.debe.toFixed(2) : '-'}</td>
                                                    <td className="px-4 py-2 text-right font-mono">{row.haber > 0 ? row.haber.toFixed(2) : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Resolve Accounts */}
                    {step === 3 && (
                        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-yellow-800">
                                <span className="text-2xl">⚠️</span>
                                <div>
                                    <h3 className="font-bold">Cuentas no reconocidas</h3>
                                    <p className="text-sm mt-1">
                                        Detectamos <strong>{unresolvedKeys.length}</strong> cuentas en el archivo que no coinciden exactamente con tu Plan de Cuentas.
                                        Por favor asignalas manualmente a una cuenta existente.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 font-medium">Cuenta en Archivo</th>
                                            <th className="px-6 py-4 font-medium">Asignar a Cuenta del Sistema</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {unresolvedKeys.map((key) => (
                                            <tr key={key} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 font-medium text-slate-700">
                                                    {key}
                                                </td>
                                                <td className="px-6 py-4 w-[400px]">
                                                    <AccountSearchSelect
                                                        accounts={availableAccounts}
                                                        value=""
                                                        onChange={(id) => resolveAccount(key, id)}
                                                        placeholder="Buscar cuenta por código o nombre..."
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Final Validation & Confirmation */}
                    {step === 4 && (
                        <div className="flex flex-col gap-6">

                            {/* Final Summary Stats */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asientos a Importar</div>
                                    <div className="text-3xl font-bold text-slate-800">{draftEntries.length}</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm">
                                    <div className="text-xs font-bold text-green-600 uppercase tracking-wider">Balanceados</div>
                                    <div className="text-3xl font-bold text-green-700">{validationSummary.balancedEntries}</div>
                                </div>
                                <div className={`p-4 rounded-xl border shadow-sm ${validationSummary.entryErrors > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider ${validationSummary.entryErrors > 0 ? 'text-red-600' : 'text-slate-400'}`}>Desbalanceados / Erróneos</div>
                                    <div className={`text-3xl font-bold ${validationSummary.entryErrors > 0 ? 'text-red-700' : 'text-slate-700'}`}>{validationSummary.entryErrors}</div>
                                </div>
                            </div>

                            {validationSummary.entryErrors > 0 && (
                                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex gap-3">
                                    <span className="text-2xl">⛔</span>
                                    <div>
                                        <h3 className="font-bold">Error Crítico: Asientos Desbalanceados</h3>
                                        <p className="text-sm">No se puede proceder con la importación porque existen asientos que no balancean (Debe != Haber). Revisá la lista abajo.</p>
                                    </div>
                                </div>
                            )}

                            {/* Draft Table */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-[300px]">
                                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 font-semibold text-slate-700">
                                    Detalle de Asientos
                                </div>
                                <div className="overflow-auto max-h-[400px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 font-medium border-b">N°</th>
                                                <th className="px-4 py-3 font-medium border-b">Fecha</th>
                                                <th className="px-4 py-3 font-medium border-b">Concepto</th>
                                                <th className="px-4 py-3 font-medium border-b text-center">Líneas</th>
                                                <th className="px-4 py-3 font-medium border-b text-right">Total Debe</th>
                                                <th className="px-4 py-3 font-medium border-b text-right">Total Haber</th>
                                                <th className="px-4 py-3 font-medium border-b">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {draftEntries.map((entry, i) => (
                                                <tr key={i} className={`hover:bg-slate-50 ${!entry.isBalanced ? 'bg-red-50' : ''}`}>
                                                    <td className="px-4 py-2 font-mono text-slate-600">{entry.nro_asiento}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{entry.fechaISO}</td>
                                                    <td className="px-4 py-2 text-slate-600 truncate max-w-[200px]">{entry.concepto}</td>
                                                    <td className="px-4 py-2 text-center text-slate-500">{entry.lines.length}</td>
                                                    <td className="px-4 py-2 text-right font-mono font-medium">{entry.totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-2 text-right font-mono font-medium">{entry.totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-2">
                                                        {entry.isBalanced && entry.validationErrors.length === 0 ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">OK</span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-red-600">
                                                                {entry.validationErrors[0] || 'Error'}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                    <div className="text-sm text-slate-500">
                        {step === 3 && unresolvedKeys.length > 0 && `${unresolvedKeys.length} cuentas pendientes`}
                    </div>
                    <div className="flex gap-3">
                        {!isLoading && (
                            <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
                                Cancelar
                            </button>
                        )}

                        {step === 2 && (
                            <button
                                onClick={handleGoToResolution}
                                disabled={validationSummary.rowErrors > 0}
                                className={`
                                    px-6 py-2 text-sm font-semibold text-white rounded-lg shadow-sm
                                    ${validationSummary.rowErrors > 0
                                        ? 'bg-slate-300 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow mx-1'}
                                `}
                            >
                                Siguiente: Validar Cuentas
                            </button>
                        )}

                        {step === 3 && (
                            <button
                                onClick={() => {
                                    setStep(4)
                                    prepareDraft(accountResolution)
                                }}
                                disabled={unresolvedKeys.length > 0}
                                className={`
                                    px-6 py-2 text-sm font-semibold text-white rounded-lg shadow-sm
                                    ${unresolvedKeys.length > 0
                                        ? 'bg-slate-300 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow mx-1'}
                                `}
                            >
                                Siguiente: Confirmar
                            </button>
                        )}

                        {step === 4 && (
                            <button
                                onClick={handleImport}
                                disabled={isLoading || validationSummary.entryErrors > 0}
                                className={`
                                    px-6 py-2 text-sm font-semibold text-white rounded-lg shadow-sm flex items-center gap-2
                                    ${(isLoading || validationSummary.entryErrors > 0)
                                        ? 'bg-slate-300 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 hover:shadow mx-1'}
                                `}
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Procesando...
                                    </>
                                ) : (
                                    '✅ Confirmar Importación'
                                )}
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
