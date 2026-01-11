import { useCallback, useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { createEntry, deleteEntry } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
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
    // Removed 'detalle'
    sourceRowIndex: number
    errors: string[]
    isValid: boolean
}

// Removed 'detalle' from mapping
interface ColumnMapping {
    nro_asiento: string
    fecha: string
    cuenta_codigo: string
    cuenta_nombre: string
    debe: string
    haber: string
    concepto: string
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

const SAMPLE_CSV = `nro_asiento,fecha,cuenta_codigo,cuenta_nombre,debe,haber,concepto
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
        nro_asiento: '', fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: ''
    }

    const synonyms: Record<keyof ColumnMapping, string[]> = {
        nro_asiento: ['nro_asiento', 'asiento', 'asiento_ref', 'numero_asiento', 'n_asiento', 'nro', 'n', 'id'],
        fecha: ['fecha', 'date', 'fec'],
        cuenta_codigo: ['cuenta_codigo', 'codigo_cuenta', 'cod_cuenta', 'codigo', 'id_cuenta', 'cuenta_id'],
        cuenta_nombre: ['cuenta_nombre', 'nombre_cuenta', 'cuenta', 'account', 'detalle_cuenta', 'nombre'],
        debe: ['debe', 'debito', 'debit', 'dr'],
        haber: ['haber', 'credito', 'credit', 'cr'],
        concepto: ['concepto', 'memo', 'glosa', 'descripcion_asiento', 'detalle', 'descripcion', 'obs'], // Added synonyms from 'detalle' here
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
    const [, setWorkbook] = useState<XLSX.WorkBook | null>(null)
    const [sheets, setSheets] = useState<string[]>([])
    const [, setSelectedSheet] = useState<string>('')
    const [availableAccounts, setAvailableAccounts] = useState<Account[]>([])

    // Processing State
    const [mapping, setMapping] = useState<ColumnMapping>({
        nro_asiento: '', fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: ''
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
        link.download = "plantilla_asientos.csv"
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
                // Ignore empty spacer rows if everything is empty
                const isEmptyRow = !actualNro && !hasRawFecha && debe === 0 && haber === 0 && !concepto
                if (!isEmptyRow) errors.push('Falta Cuenta')
            }

            if (debe > 0 && haber > 0) errors.push('Debe y Haber > 0 simultáneamente')
            if ((rawCuentaCodigo || rawCuentaNombre) && debe === 0 && haber === 0 && (debe !== 0 || haber !== 0)) {
                errors.push('Importe cero')
            }

            return {
                nro_asiento: actualNro,
                fechaISO: actualFechaVal || '',
                cuenta_codigo: rawCuentaCodigo,
                cuenta_nombre: rawCuentaNombre,
                debe,
                haber,
                concepto,
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
        const validRows = processedRows.filter(r => r.isValid)
        const keysToResolve = new Set<string>()
        const newResolution = new Map<string, string>()

        const codeMap = new Map<string, string>() // code -> id
        const nameMap = new Map<string, string>() // normalized name -> id

        availableAccounts.forEach(acc => {
            codeMap.set(acc.code, acc.id)
            nameMap.set(normalizeText(acc.name), acc.id)
        })

        validRows.forEach(row => {
            const key = row.cuenta_codigo || row.cuenta_nombre
            if (!key) return

            let matchedId: string | undefined

            if (row.cuenta_codigo) matchedId = codeMap.get(row.cuenta_codigo)
            if (!matchedId && row.cuenta_nombre) matchedId = nameMap.get(normalizeText(row.cuenta_nombre))

            if (matchedId) {
                newResolution.set(key, matchedId)
            } else {
                keysToResolve.add(key)
            }
        })

        setAccountResolution(newResolution)
        if (keysToResolve.size > 0) {
            setUnresolvedKeys(Array.from(keysToResolve))
            setStep(3)
        } else {
            setStep(4)
            prepareDraft(newResolution)
        }
    }

    const prepareDraft = (resolutionMap: Map<string, string>) => {
        const groups = new Map<string, DraftEntry>()
        const validRows = processedRows.filter(r => r.isValid)

        for (const row of validRows) {
            const key = row.cuenta_codigo || row.cuenta_nombre
            const accountId = resolutionMap.get(key)

            if (!accountId) continue

            if (!groups.has(row.nro_asiento)) {
                groups.set(row.nro_asiento, {
                    nro_asiento: row.nro_asiento,
                    fechaISO: row.fechaISO,
                    concepto: row.concepto,
                    lines: [],
                    totalDebe: 0,
                    totalHaber: 0,
                    isBalanced: false,
                    validationErrors: []
                })
            }

            const entry = groups.get(row.nro_asiento)!

            if (!entry.concepto && row.concepto) entry.concepto = row.concepto

            entry.lines.push({
                accountId,
                debit: row.debe,
                credit: row.haber,
                description: row.concepto || ''
            })

            entry.totalDebe += row.debe
            entry.totalHaber += row.haber
        }

        const entries = Array.from(groups.values()).map(e => {
            const diff = Math.abs(e.totalDebe - e.totalHaber)
            e.isBalanced = diff < 0.01

            if (!e.isBalanced) e.validationErrors.push(`Desbalance (Dif: ${diff.toFixed(2)})`)
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
        // Do NOT remove from unresolvedKeys immediately to keep UI stable if user wants to change it?
        // Ah, requirement was to clear it or show "assigned".
        // Better UX: Keep it in a "Resolved" state within the same list or move it?
        // User asked for: row shows "Assigned to: [Chip]" + "Change" button.
        // So we keep it in unresolvedKeys or a separate list. 
        // Simpler: use unresolvedKeys for "keys found in file that were NOT auto-matched initially".
        // We just check accountResolution to see if it has a value.
    }

    const handleImport = async () => {
        if (isLoading) return
        setIsLoading(true)
        setImportProgress('Iniciando importación segura...')

        const insertedIds: string[] = []
        let errorOccurred = false

        try {
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

                const created = await createEntry(newEntryData)
                if (created && created.id) {
                    insertedIds.push(created.id)
                }
            }

            setImportProgress('¡Importación completada!')
            await new Promise(r => setTimeout(r, 800))
            onSuccess(insertedIds.length)
            handleClose()

        } catch (error: any) {
            errorOccurred = true
            console.error('Import failed', error)
            setImportProgress('Error detectado. Deshaciendo cambios (Rollback)...')

            try {
                for (const id of insertedIds) {
                    await deleteEntry(id)
                }
                alert(`Error durante la importación:\n${error.message}\n\Se deshicieron los ${insertedIds.length} asientos creados.`)
            } catch (rollbackError) {
                console.error('CRITICAL: Rollback failed', rollbackError)
                alert('ERROR CRÍTICO: Falló la importación y el rollback parcial.')
            }
        } finally {
            setIsLoading(false)
            setImportProgress('')
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render Helpers
    // ─────────────────────────────────────────────────────────────────────────

    const pendingResolutionCount = unresolvedKeys.filter(k => !accountResolution.has(k)).length
    const isStep2Valid = validationSummary.rowErrors === 0 && (mapping.cuenta_codigo || mapping.cuenta_nombre)
    const isStep3Valid = pendingResolutionCount === 0
    const isStep4Valid = validationSummary.entryErrors === 0

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={isLoading ? undefined : handleClose} />

            <div className={`
                relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden border border-white/20
                ${step === 1 ? 'max-w-2xl' : 'max-w-5xl h-[85vh]'}
                transition-all duration-300
            `}>

                {/* Header with Stepper */}
                <div className="px-8 py-6 border-b border-slate-100 bg-white/50 shrink-0">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                📥 Importar Asientos
                            </h2>
                            {file && <div className="text-sm text-slate-500 mt-1">{file.name}</div>}
                        </div>
                        {!isLoading && <button onClick={handleClose} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-full transition-colors">✕</button>}
                    </div>

                    {/* Stepper */}
                    {step > 1 && (
                        <div className="flex items-center gap-4">
                            {[
                                { n: 1, label: 'Archivo' },
                                { n: 2, label: 'Mapeo' },
                                { n: 3, label: 'Cuentas' },
                                { n: 4, label: 'Confirmar' }
                            ].map((s, i) => {
                                const isActive = step === s.n
                                const isDone = step > s.n
                                return (
                                    <div key={s.n} className="flex items-center gap-2">
                                        <div className={`
                                            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                                            ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : isDone ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}
                                        `}>
                                            {isDone ? '✓' : s.n}
                                        </div>
                                        <div className={`text-sm font-medium ${isActive ? 'text-slate-800' : 'text-slate-400 hidden md:block'}`}>
                                            {s.label}
                                        </div>
                                        {i < 3 && <div className="w-8 h-[2px] bg-slate-100 mx-2 hidden md:block" />}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 bg-slate-50/50">

                    {/* STEP 1: Upload */}
                    {step === 1 && (
                        <div className="flex flex-col h-full justify-center items-center max-w-lg mx-auto">
                            <div {...getRootProps()} className={`w-full aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 group
                                ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-white bg-slate-50'}`}>
                                <input {...getInputProps()} />
                                <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-4xl">📂</span>
                                </div>
                                <p className="text-lg font-semibold text-slate-700">Arrastrá tu archivo aquí</p>
                                <p className="text-sm text-slate-400 mt-2">Soporta .csv, .xlsx, .xls</p>
                            </div>
                            <button onClick={downloadTemplate} className="mt-8 text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors flex items-center gap-2">
                                <span className="text-lg">📄</span> Descargar plantilla de ejemplo
                            </button>
                        </div>
                    )}

                    {/* STEP 2: Map */}
                    {step === 2 && (
                        <div className="flex flex-col gap-8">

                            {/* Alert for Requirements */}
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-900/80 items-start">
                                <span className="text-xl">ℹ️</span>
                                <div className="text-sm">
                                    <strong>Campos Obligatorios:</strong> Para importar correctamente, asegurate de mapear:
                                    <ul className="list-disc list-inside mt-1 ml-1 space-y-1">
                                        <li>N° de Asiento, Fecha, Debe, Haber</li>
                                        <li>Cuenta: por <b>Código</b> (recomendado) o <b>Nombre</b> (o ambos)</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Mapping Grid */}
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="font-semibold text-slate-800 mb-4 border-b pb-2">Datos del Asiento</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: 'nro_asiento', label: 'N° Asiento', req: true, desc: 'Identificador único del asiento' },
                                            { id: 'fecha', label: 'Fecha', req: true, desc: 'DD/MM/AAAA o AAAA-MM-DD' },
                                            { id: 'concepto', label: 'Concepto / Glosa', req: false, desc: 'Descripción del asiento o línea' },
                                        ].map(f => (
                                            <div key={f.id}>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                                    {f.label} {f.req && <span className="text-red-500">*</span>}
                                                </label>
                                                <select
                                                    className="w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50"
                                                    value={mapping[f.id as keyof ColumnMapping]}
                                                    onChange={e => setMapping(prev => ({ ...prev, [f.id]: e.target.value }))}
                                                >
                                                    <option value="">(Ignorar)</option>
                                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                                <p className="text-xs text-slate-400 mt-1">{f.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="font-semibold text-slate-800 mb-4 border-b pb-2">Contabilidad</h3>
                                    <div className="space-y-4">
                                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Identificación de Cuenta <span className="text-red-500">*</span></label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs text-slate-500 block mb-1">Por Código</label>
                                                    <select
                                                        className="w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 bg-white"
                                                        value={mapping.cuenta_codigo}
                                                        onChange={e => setMapping(prev => ({ ...prev, cuenta_codigo: e.target.value }))}
                                                    >
                                                        <option value="">(Ignorar)</option>
                                                        {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-500 block mb-1">Por Nombre</label>
                                                    <select
                                                        className="w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 bg-white"
                                                        value={mapping.cuenta_nombre}
                                                        onChange={e => setMapping(prev => ({ ...prev, cuenta_nombre: e.target.value }))}
                                                    >
                                                        <option value="">(Ignorar)</option>
                                                        {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            {!(mapping.cuenta_codigo || mapping.cuenta_nombre) && (
                                                <p className="text-xs text-red-500 mt-2">Debes seleccionar al menos uno.</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Debe <span className="text-red-500">*</span></label>
                                                <select
                                                    className="w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 bg-slate-50"
                                                    value={mapping.debe}
                                                    onChange={e => setMapping(prev => ({ ...prev, debe: e.target.value }))}
                                                >
                                                    <option value="">(Ignorar)</option>
                                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Haber <span className="text-red-500">*</span></label>
                                                <select
                                                    className="w-full text-sm rounded-lg border-slate-300 focus:border-blue-500 bg-slate-50"
                                                    value={mapping.haber}
                                                    onChange={e => setMapping(prev => ({ ...prev, haber: e.target.value }))}
                                                >
                                                    <option value="">(Ignorar)</option>
                                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col max-h-[400px]">
                                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <h3 className="font-semibold text-slate-700">Vista Previa</h3>
                                    <div className="flex gap-4 text-xs font-medium">
                                        <span className="text-green-600">Válidos: {validationSummary.validRows}</span>
                                        <span className={validationSummary.rowErrors > 0 ? 'text-red-600' : 'text-slate-400'}>
                                            Errores: {validationSummary.rowErrors}
                                        </span>
                                    </div>
                                </div>
                                <div className="overflow-auto pb-20">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white sticky top-0 z-10 shadow-sm text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur w-20">Estado</th>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur">Asiento</th>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur">Fecha</th>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur">Cuenta (Cod / Nom)</th>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur text-right">Debe</th>
                                                <th className="px-4 py-3 bg-slate-50/90 backdrop-blur text-right">Haber</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {processedRows.slice(0, 50).map((row, i) => (
                                                <tr key={i} className={`hover:bg-blue-50/30 transition-colors ${!row.isValid ? 'bg-red-50/50' : ''}`}>
                                                    <td className="px-4 py-2">
                                                        {row.isValid ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide">OK</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide cursor-help" title={row.errors.join('\n')}>ERR</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 font-mono text-slate-600">{row.nro_asiento || '—'}</td>
                                                    <td className="px-4 py-2 text-slate-600">{row.fechaISO || '—'}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-xs text-slate-500">{row.cuenta_codigo || '—'}</span>
                                                            <span className="text-slate-700 font-medium truncate max-w-[200px]">{row.cuenta_nombre || '—'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-slate-600">{row.debe > 0 ? row.debe.toFixed(2) : '-'}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-slate-600">{row.haber > 0 ? row.haber.toFixed(2) : '-'}</td>
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
                        <div className="flex flex-col gap-8 max-w-4xl mx-auto h-full">

                            {pendingResolutionCount === 0 ? (
                                <div className="flex flex-col items-center justify-center p-12 bg-green-50 rounded-3xl border border-green-100 text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mb-4">🎉</div>
                                    <h3 className="text-xl font-bold text-green-800">¡Todas las cuentas resueltas!</h3>
                                    <p className="text-green-700/80 mt-2 max-w-sm">
                                        Hemos asignado correctamente todas las cuentas del archivo a tu Plan de Cuentas.
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-yellow-800 animate-in slide-in-from-top-4">
                                    <span className="text-2xl mt-1">⚠️</span>
                                    <div>
                                        <h3 className="font-bold">Acción Requerida</h3>
                                        <p className="text-sm mt-1">
                                            Hay <strong>{pendingResolutionCount}</strong> cuentas en el archivo que no coinciden con tu sistema.
                                            Asignalas manualmente para continuar.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {unresolvedKeys.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-visible flex flex-col min-h-[400px]">
                                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 flex justify-between">
                                        <span>Asignación Manual</span>
                                        <span className="text-slate-400 font-normal">Pendientes: {pendingResolutionCount}</span>
                                    </div>

                                    {/* Overflow visible for dropdowns */}
                                    <div className="flex-1 overflow-visible p-2">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead>
                                                <tr className="text-xs text-slate-500 uppercase border-b border-slate-100">
                                                    <th className="px-6 py-3 font-medium w-1/3">Cuenta en Archivo</th>
                                                    <th className="px-6 py-3 font-medium">Asignar a...</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {unresolvedKeys.map((key) => {
                                                    const assignedId = accountResolution.get(key)
                                                    const assignedAccount = availableAccounts.find(a => a.id === assignedId)

                                                    return (
                                                        <tr key={key} className="hover:bg-slate-50 group">
                                                            <td className="px-6 py-4">
                                                                <div className="font-medium text-slate-800 text-base">{key}</div>
                                                                <div className="text-xs text-slate-400 mt-1">No se encontró coincidencia automática</div>
                                                            </td>
                                                            <td className="px-6 py-4 relative z-0">
                                                                {assignedAccount ? (
                                                                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Asignado a</span>
                                                                            <span className="font-medium text-blue-900">{assignedAccount.code} - {assignedAccount.name}</span>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => resolveAccount(key, '')} // Clear
                                                                            className="text-blue-400 hover:text-blue-600 p-1 font-medium hover:bg-blue-100 rounded text-sm transition-colors"
                                                                        >
                                                                            Cambiar
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="relative z-50">
                                                                        <AccountSearchSelect
                                                                            accounts={availableAccounts}
                                                                            value=""
                                                                            onChange={(id) => resolveAccount(key, id)}
                                                                            placeholder="Buscar cuenta..."
                                                                        />
                                                                    </div>
                                                                )}
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
                    )}

                    {/* STEP 4: Confirmation */}
                    {step === 4 && (
                        <div className="flex flex-col gap-8 max-w-5xl mx-auto">

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                                    <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Asientos</div>
                                    <div className="text-4xl font-bold text-slate-800">{draftEntries.length}</div>
                                </div>
                                <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center text-center">
                                    <div className="text-sm font-bold text-green-600 uppercase tracking-wider mb-2">Listos para Importar</div>
                                    <div className="text-4xl font-bold text-green-700">{validationSummary.balancedEntries}</div>
                                </div>
                                {validationSummary.entryErrors > 0 && (
                                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center justify-center text-center">
                                        <div className="text-sm font-bold text-red-600 uppercase tracking-wider mb-2">Con Errores</div>
                                        <div className="text-4xl font-bold text-red-700">{validationSummary.entryErrors}</div>
                                    </div>
                                )}
                            </div>

                            {validationSummary.entryErrors > 0 && (
                                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                                    <span className="text-3xl">⛔</span>
                                    <div>
                                        <h3 className="font-bold text-lg">Bloqueo de Importación</h3>
                                        <p className="text-sm opacity-90">Existen asientos desbalanceados o incompletos. Por seguridad, no se puede importar hasta corregir el archivo.</p>
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[300px]">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 font-semibold text-slate-800">
                                    Detalle de Asientos ({draftEntries.length})
                                </div>
                                <div className="overflow-auto max-h-[400px] flex-1">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white sticky top-0 z-10 text-xs text-slate-500 uppercase font-semibold">
                                            <tr>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b">Estado</th>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b">N°</th>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b">Fecha</th>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b">Concepto</th>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b text-center">Líneas</th>
                                                <th className="px-6 py-3 bg-slate-50/95 backdrop-blur border-b text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {draftEntries.map((entry, i) => (
                                                <tr key={i} className={`hover:bg-slate-50 ${!entry.isBalanced ? 'bg-red-50' : ''}`}>
                                                    <td className="px-6 py-3">
                                                        {entry.isBalanced && entry.validationErrors.length === 0 ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">OK</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">ERR</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 font-mono text-slate-600">{entry.nro_asiento}</td>
                                                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">{entry.fechaISO}</td>
                                                    <td className="px-6 py-3 text-slate-600 truncate max-w-[200px]">{entry.concepto}</td>
                                                    <td className="px-6 py-3 text-center text-slate-500">{entry.lines.length}</td>
                                                    <td className="px-6 py-3 text-right font-mono font-medium text-slate-800">
                                                        $ {entry.totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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

                {/* Sticky Footer */}
                <div className="px-8 py-5 border-t border-slate-200 bg-white shrink-0 flex justify-between items-center z-20 shadow-[0_-5px_20px_-10px_rgba(0,0,0,0.05)]">
                    <button onClick={handleClose} className="px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                        Cancelar
                    </button>

                    <div className="flex gap-3">
                        {step > 1 && (
                            <button
                                onClick={() => setStep(prev => prev - 1 as any)}
                                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Atrás
                            </button>
                        )}

                        {step === 2 && (
                            <button
                                onClick={handleGoToResolution}
                                disabled={!isStep2Valid || validationSummary.rowErrors > 0}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-blue-200 transition-all
                                    ${(!isStep2Valid || validationSummary.rowErrors > 0)
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 hover:shadow-xl'}
                                `}
                            >
                                Siguiente
                            </button>
                        )}

                        {step === 3 && (
                            <button
                                onClick={() => {
                                    setStep(4)
                                    prepareDraft(accountResolution)
                                }}
                                disabled={!isStep3Valid}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-blue-200 transition-all
                                    ${!isStep3Valid
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 hover:shadow-xl'}
                                `}
                            >
                                Siguiente
                            </button>
                        )}

                        {step === 4 && (
                            <button
                                onClick={handleImport}
                                disabled={isLoading || !isStep4Valid}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-green-200 transition-all flex items-center gap-2
                                    ${(isLoading || !isStep4Valid)
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed'
                                        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:scale-105 hover:shadow-xl'}
                                `}
                            >
                                {isLoading ? 'Procesando...' : 'Confirmar Importación'}
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
