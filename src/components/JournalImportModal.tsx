import { useCallback, useState, useEffect } from 'react'
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
        concepto: ['concepto', 'memo', 'glosa', 'descripcion_asiento', 'descripcion', 'obs', 'detalle'],
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

    // Fix unused variable
    void sheets

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
                description: ''
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
    // Render Helpers (Calculated)
    // ─────────────────────────────────────────────────────────────────────────

    const pendingResolutionCount = unresolvedKeys.filter(k => !accountResolution.has(k)).length

    // Validation checks
    const isStep2Valid = validationSummary.rowErrors === 0 && (mapping.cuenta_codigo || mapping.cuenta_nombre) && mapping.nro_asiento && mapping.fecha && mapping.debe && mapping.haber
    const isStep3Valid = pendingResolutionCount === 0
    const isStep4Valid = validationSummary.entryErrors === 0

    // ─────────────────────────────────────────────────────────────────────────
    // Render Steps
    // ─────────────────────────────────────────────────────────────────────────

    const renderStep2 = () => (
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
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group transition-all hover:shadow-md">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                        <span className="text-4xl text-slate-100">📝</span>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-6 border-b pb-2 flex items-center gap-2">
                        <span>1.</span> Datos del Asiento
                    </h3>
                    <div className="space-y-5">
                        {[
                            { id: 'nro_asiento', label: 'N° Asiento', req: true, desc: 'Identificador único del asiento' },
                            { id: 'fecha', label: 'Fecha', req: true, desc: 'DD/MM/AAAA o AAAA-MM-DD' },
                            { id: 'concepto', label: 'Concepto / Glosa', req: false, desc: 'Descripción del asiento o línea' },
                        ].map(f => (
                            <div key={f.id}>
                                <label className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-1.5">
                                    <span>{f.label} {f.req && <span className="text-red-500">*</span>}</span>
                                    {f.req && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Obligatorio</span>}
                                </label>
                                <select
                                    className={`
                                        w-full text-sm rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50 transition-all
                                        ${!mapping[f.id as keyof ColumnMapping] && f.req ? 'border-amber-300 bg-amber-50' : ''}
                                    `}
                                    value={mapping[f.id as keyof ColumnMapping]}
                                    onChange={e => setMapping(prev => ({ ...prev, [f.id]: e.target.value }))}
                                >
                                    <option value="">(Seleccionar columna...)</option>
                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <p className="text-xs text-slate-400 mt-1.5">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group transition-all hover:shadow-md">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                        <span className="text-4xl text-slate-100">📊</span>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-6 border-b pb-2 flex items-center gap-2">
                        <span>2.</span> Contabilidad
                    </h3>
                    <div className="space-y-6">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                Identificación de Cuenta <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">Por Código</label>
                                    <select
                                        className="w-full text-sm rounded-xl border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                                        value={mapping.cuenta_codigo}
                                        onChange={e => setMapping(prev => ({ ...prev, cuenta_codigo: e.target.value }))}
                                    >
                                        <option value="">(Ignorar)</option>
                                        {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1.5 uppercase tracking-wide">Por Nombre</label>
                                    <select
                                        className="w-full text-sm rounded-xl border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                                        value={mapping.cuenta_nombre}
                                        onChange={e => setMapping(prev => ({ ...prev, cuenta_nombre: e.target.value }))}
                                    >
                                        <option value="">(Ignorar)</option>
                                        {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>
                            {!(mapping.cuenta_codigo || mapping.cuenta_nombre) && (
                                <div className="flex items-center gap-2 mt-3 text-red-600 bg-red-50 p-2 rounded-lg text-xs font-medium">
                                    ⚠️ Seleccioná al menos código o nombre
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Debe <span className="text-red-500">*</span></label>
                                <select
                                    className={`
                                        w-full text-sm rounded-xl border-slate-300 focus:border-blue-500 bg-slate-50
                                        ${!mapping.debe ? 'border-amber-300 bg-amber-50' : ''}
                                    `}
                                    value={mapping.debe}
                                    onChange={e => setMapping(prev => ({ ...prev, debe: e.target.value }))}
                                >
                                    <option value="">(Seleccionar...)</option>
                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Haber <span className="text-red-500">*</span></label>
                                <select
                                    className={`
                                        w-full text-sm rounded-xl border-slate-300 focus:border-blue-500 bg-slate-50
                                        ${!mapping.haber ? 'border-amber-300 bg-amber-50' : ''}
                                    `}
                                    value={mapping.haber}
                                    onChange={e => setMapping(prev => ({ ...prev, haber: e.target.value }))}
                                >
                                    <option value="">(Seleccionar...)</option>
                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[500px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <span className="text-lg">👁️</span> Vista Previa
                    </h3>
                    <div className="flex gap-3 text-xs font-bold uppercase tracking-wide">
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
                            Válidos: {validationSummary.validRows}
                        </span>
                        <span className={`px-3 py-1 rounded-full ${validationSummary.rowErrors > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>
                            Errores: {validationSummary.rowErrors}
                        </span>
                    </div>
                </div>
                <div className="overflow-auto pb-20">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white sticky top-0 z-10 shadow-sm text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur w-24 border-b">Estado</th>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur border-b">Asiento</th>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur border-b">Fecha</th>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur border-b">Cuenta</th>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur text-right border-b">Debe</th>
                                <th className="px-4 py-3 bg-slate-50/95 backdrop-blur text-right border-b">Haber</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-slate-50/30">
                            {processedRows.slice(0, 50).map((row, i) => (
                                <tr key={i} className={`hover:bg-blue-50/50 transition-colors ${!row.isValid ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-2.5">
                                        {row.isValid ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide border border-green-200">OK</span>
                                        ) : (
                                            <span className="group relative inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide border border-red-200 cursor-help">
                                                ERROR
                                                <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                                                    {row.errors.join(', ')}
                                                </div>
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-slate-600 font-medium">{row.nro_asiento || '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{row.fechaISO || '—'}</td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col">
                                            {row.cuenta_codigo && <span className="font-mono text-xs text-slate-500 font-bold">{row.cuenta_codigo}</span>}
                                            <span className="text-slate-700 font-medium truncate max-w-[200px] text-xs mt-0.5">{row.cuenta_nombre || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">{row.debe > 0 ? row.debe.toFixed(2) : '-'}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">{row.haber > 0 ? row.haber.toFixed(2) : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )

    const renderStep3 = () => (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto h-full">
            {/* Header / Summary */}
            <div className="shrink-0">
                {pendingResolutionCount === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-3xl border border-green-100 text-center animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mb-4 shadow-sm">🎉</div>
                        <h3 className="text-2xl font-bold text-green-800">¡Todas las cuentas resueltas!</h3>
                        <p className="text-green-700/80 mt-2 max-w-md font-medium">
                            Hemos asignado correctamente todas las cuentas del archivo a tu Plan de Cuentas.
                            Podés continuar al siguiente paso.
                        </p>
                    </div>
                ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row gap-5 text-amber-900 shadow-sm items-center">
                        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-2xl shrink-0">⚠️</div>
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="font-bold text-lg text-amber-950">Acción Requerida</h3>
                            <p className="opacity-90 mt-1">
                                Encontramos <strong>{pendingResolutionCount} cuentas</strong> en el archivo que no coinciden automáticamente con tu Plan de Cuentas.
                                Asignalas manualmente para continuar.
                            </p>
                        </div>
                        <div className="px-4 py-2 bg-white/50 rounded-lg font-mono font-bold text-amber-800 border border-amber-100">
                            Pendientes: {pendingResolutionCount}
                        </div>
                    </div>
                )}
            </div>

            {/* Resolution Table */}
            {unresolvedKeys.length > 0 && (
                <div className={`
                    bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[400px] overflow-hidden transition-opacity duration-500
                    ${pendingResolutionCount === 0 ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}
                `}>
                    <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 flex justify-between uppercase tracking-wider text-xs">
                        <span>Asignación Manual ({unresolvedKeys.length})</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                <tr className="text-xs text-slate-500 uppercase border-b border-slate-100 font-semibold bg-slate-50/95 backdrop-blur">
                                    <th className="px-8 py-3 w-1/3">Cuenta en Archivo</th>
                                    <th className="px-8 py-3">Asignar a...</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {unresolvedKeys.map((key) => {
                                    const assignedId = accountResolution.get(key)
                                    const assignedAccount = availableAccounts.find(a => a.id === assignedId)
                                    const isResolved = !!assignedAccount

                                    return (
                                        <tr key={key} className={`group transition-colors ${isResolved ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}>
                                            <td className="px-8 py-4 align-top">
                                                <div className="font-bold text-slate-800 text-base">{key}</div>
                                                <div className="text-xs text-slate-400 mt-1 font-medium bg-slate-100 inline-block px-2 py-0.5 rounded">Sin coincidencia</div>
                                            </td>
                                            <td className="px-8 py-4 align-top">
                                                {isResolved ? (
                                                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl shadow-sm group-hover:bg-white group-hover:shadow-md transition-all">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Asignado a</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{assignedAccount.code}</span>
                                                                <span className="font-medium text-slate-800">{assignedAccount.name}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => resolveAccount(key, '')}
                                                            className="ml-4 text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-100 rounded-lg transition-colors"
                                                            title="Cambiar asignación"
                                                        >
                                                            ✏️
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="max-w-md">
                                                        <AccountSearchSelect
                                                            accounts={availableAccounts}
                                                            value=""
                                                            onChange={(id) => resolveAccount(key, id)}
                                                            placeholder="Buscar cuenta para asignar..."
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
    )

    const renderStep4 = () => (
        <div className="flex flex-col gap-8 max-w-6xl mx-auto h-full">

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Asientos</div>
                    <div className="text-5xl font-black text-slate-800 tracking-tight">{draftEntries.length}</div>
                </div>
                <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="text-xs font-bold text-green-600 uppercase tracking-widest mb-2">Listos</div>
                    <div className="text-5xl font-black text-green-600 tracking-tight">{validationSummary.balancedEntries}</div>
                </div>
                {validationSummary.entryErrors > 0 && (
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center justify-center text-center animate-pulse">
                        <div className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">Errores</div>
                        <div className="text-5xl font-black text-red-600 tracking-tight">{validationSummary.entryErrors}</div>
                    </div>
                )}
            </div>

            {/* Block Alert */}
            {validationSummary.entryErrors > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-xl flex items-center gap-4 shrink-0 shadow-sm">
                    <span className="text-3xl">⛔</span>
                    <div>
                        <h3 className="font-bold text-lg">Bloqueo de Importación</h3>
                        <p className="text-sm opacity-90 font-medium">
                            Existen asientos desbalanceados o incompletos ({validationSummary.entryErrors}).
                            Por seguridad, no se puede importar hasta que el archivo esté libre de errores críticos.
                        </p>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[300px]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
                    <span>Detalle de Asientos a Importar</span>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-mono">Total: {draftEntries.length}</span>
                </div>
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white sticky top-0 z-10 text-xs text-slate-500 uppercase font-bold tracking-wider shadow-sm">
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
                                <tr key={i} className={`hover:bg-slate-50 transition-colors ${!entry.isBalanced ? 'bg-red-50' : ''}`}>
                                    <td className="px-6 py-3.5">
                                        {entry.isBalanced && entry.validationErrors.length === 0 ? (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 tracking-wide">OK</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 tracking-wide">
                                                ERR
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5 font-mono text-slate-600 font-bold">{entry.nro_asiento}</td>
                                    <td className="px-6 py-3.5 whitespace-nowrap text-slate-600">{entry.fechaISO}</td>
                                    <td className="px-6 py-3.5 text-slate-600 truncate max-w-[200px] font-medium">{entry.concepto}</td>
                                    <td className="px-6 py-3.5 text-center text-slate-500 font-mono bg-slate-50/50">{entry.lines.length}</td>
                                    <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-700">
                                        $ {entry.totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )


    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={isLoading ? undefined : handleClose} />

            <div className={`
                relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden border border-white/20
                ${step === 1 ? 'max-w-xl' : 'max-w-6xl h-[90vh]'}
                transition-all duration-500 ease-in-out
            `}>

                {/* Header with Stepper */}
                <div className="px-8 py-6 border-b border-slate-100 bg-white/80 shrink-0">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                                <span className="bg-blue-100 text-blue-600 p-2 rounded-lg text-xl">📥</span>
                                Importar Asientos
                            </h2>
                            {file && <div className="text-sm font-medium text-slate-500 mt-2 ml-14 flex items-center gap-2">
                                📎 {file.name}
                            </div>}
                        </div>
                        {!isLoading && (
                            <button
                                onClick={handleClose}
                                className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
                                title="Cerrar"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Stepper */}
                    {step > 1 && (
                        <div className="flex items-center justify-center w-full max-w-3xl mx-auto">
                            {[
                                { n: 1, label: 'Archivo' },
                                { n: 2, label: 'Mapeo' },
                                { n: 3, label: 'Cuentas' },
                                { n: 4, label: 'Confirmar' }
                            ].map((s, i, arr) => {
                                const isActive = step === s.n
                                const isDone = step > s.n

                                return (
                                    <div key={s.n} className="flex items-center flex-1 last:flex-none">
                                        <div className="flex flex-col items-center gap-2 relative z-10 group cursor-default">
                                            <div className={`
                                                w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2
                                                ${isActive
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 scale-110'
                                                    : isDone
                                                        ? 'bg-green-500 border-green-500 text-white'
                                                        : 'bg-white border-slate-200 text-slate-300'}
                                            `}>
                                                {isDone ? (
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : s.n}
                                            </div>
                                            <span className={`
                                                text-xs font-bold whitespace-nowrap transition-colors duration-300
                                                ${isActive ? 'text-blue-700' : isDone ? 'text-green-600' : 'text-slate-300'}
                                            `}>
                                                {s.label}
                                            </span>
                                        </div>

                                        {i < arr.length - 1 && (
                                            <div className="flex-1 h-[2px] mx-4 relative overflow-hidden bg-slate-100 rounded-full">
                                                <div className={`
                                                    absolute inset-0 transition-all duration-500 ease-out
                                                    ${isDone ? 'bg-green-500 w-full' : isActive ? 'bg-blue-600 w-1/2' : 'w-0'}
                                                `} />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 bg-slate-50 relative">

                    {/* STEP 1: Upload */}
                    {step === 1 && (
                        <div className="flex flex-col h-full justify-center items-center">
                            <div
                                {...getRootProps()}
                                className={`
                                    w-full max-w-lg aspect-[3/2] flex flex-col items-center justify-center 
                                    border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300 group
                                    ${isDragActive
                                        ? 'border-blue-500 bg-blue-50/50 scale-105 shadow-xl shadow-blue-100'
                                        : 'border-slate-300 hover:border-blue-400 hover:bg-white bg-slate-50/50 hover:shadow-lg'}
                                `}
                            >
                                <input {...getInputProps()} />
                                <div className="p-6 bg-white rounded-full shadow-lg shadow-slate-200 mb-6 group-hover:scale-110 transition-transform duration-300 text-5xl">
                                    {isDragActive ? '📂' : '☁️'}
                                </div>
                                <h3 className="text-xl font-bold text-slate-700 mb-2">Subir archivo CSV o Excel</h3>
                                <p className="text-sm text-slate-400 text-center max-w-xs px-4">
                                    Arrastrá tu archivo aquí o hacé clic para buscar en tu dispositivo.
                                </p>
                            </div>

                            <button onClick={downloadTemplate} className="mt-8 group flex items-center gap-3 px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-medium hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm">
                                <span className="p-1.5 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">📄</span>
                                Descargar plantilla modelo
                            </button>
                        </div>
                    )}

                    {/* STEP 2: Map */}
                    {step === 2 && renderStep2()}

                    {/* STEP 3: Resolve Accounts */}
                    {step === 3 && renderStep3()}

                    {/* STEP 4: Confirmation */}
                    {step === 4 && renderStep4()}

                </div>

                {/* Sticky Footer */}
                <div className="px-8 py-5 border-t border-slate-200 bg-white/95 backdrop-blur shrink-0 flex justify-between items-center z-40 shadow-[0_-5px_30px_-15px_rgba(0,0,0,0.1)]">
                    <button onClick={handleClose} className="px-6 py-2.5 text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100">
                        Cancelar
                    </button>

                    <div className="flex gap-4 items-center">
                        {isLoading && (
                            <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs font-bold text-blue-700">{importProgress}</span>
                            </div>
                        )}

                        {step > 1 && !isLoading && (
                            <button
                                onClick={() => setStep(prev => prev - 1 as any)}
                                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200"
                            >
                                Atrás
                            </button>
                        )}

                        {!isLoading && step === 2 && (
                            <button
                                onClick={handleGoToResolution}
                                disabled={!isStep2Valid}
                                title={!isStep2Valid ? "Completá los campos obligatorios para continuar" : ""}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2
                                    ${!isStep2Valid
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 hover:shadow-blue-300'}
                                `}
                            >
                                Siguiente
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        )}

                        {!isLoading && step === 3 && (
                            <button
                                onClick={() => {
                                    setStep(4)
                                    prepareDraft(accountResolution)
                                }}
                                disabled={!isStep3Valid}
                                title={!isStep3Valid ? "Resolvé todas las cuentas pendientes para continuar" : ""}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2
                                    ${!isStep3Valid
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 hover:shadow-blue-300'}
                                `}
                            >
                                Siguiente
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        )}

                        {!isLoading && step === 4 && (
                            <button
                                onClick={handleImport}
                                disabled={!isStep4Valid}
                                className={`
                                    px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg shadow-green-200 transition-all flex items-center gap-2
                                    ${!isStep4Valid
                                        ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
                                        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:scale-105 hover:shadow-green-300'}
                                `}
                            >
                                Confirmar Importación
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
