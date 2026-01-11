import React, { useCallback, useState, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { useLiveQuery } from 'dexie-react-hooks'
import { getPostableAccounts } from '../storage/accounts'
import { createEntry } from '../storage/entries'
import type { EntryLine } from '../core/models'

// ─────────────────────────────────────────────────────────────────────────────
// Types & Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ImportRow {
    asiento_ref: string | number
    fecha: string
    concepto: string
    cuenta_codigo: string
    cuenta_nombre: string
    debe: string | number
    haber: string | number
    detalle: string
    __rowNum__: number // Internal for error reporting
}

interface ParsedEntry {
    ref: string
    date: string
    memo: string
    lines: ParsedLine[]
    isValid: boolean
    errors: string[]
    warnings: string[]
}

interface ParsedLine {
    tempId: string
    accountId: string | null // null if account not found
    accountNameProvided: string
    accountCodeProvided: string
    debit: number
    credit: number
    description: string
    rowNum: number
}

interface JournalImportModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (count: number) => void
}

// Helper to parse Argentine numbers (1.234,56) or standard (1234.56)
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val
    if (!val) return 0
    const str = String(val).trim()
    if (str === '') return 0

    // Check if it has comma as decimal separator
    if (str.includes(',') && str.includes('.')) {
        // e.g. 1.234,56 -> remove dots, replace comma
        return parseFloat(str.replace(/\./g, '').replace(',', '.'))
    } else if (str.includes(',')) {
        // e.g. 1234,56 -> replace comma
        return parseFloat(str.replace(',', '.'))
    }
    return parseFloat(str)
}

// Helper to parse Dates
// Soportar “YYYY-MM-DD” y “DD/MM/YYYY” -> return “YYYY-MM-DD”
const parseDate = (val: any): string | null => {
    if (!val) return null
    // If Excel date number? (XLSX usually handles this if we interpret as cell dates, but we use raw json)
    // Here we assume string or Excel serial could happen if not cautious. 
    // Usually raw JSON from XLSX gives strings or numbers. 

    let str = String(val).trim()

    // Check DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const parts = str.split('/')
        const day = parts[0].padStart(2, '0')
        const month = parts[1].padStart(2, '0')
        const year = parts[2]
        return `${year}-${month}-${day}`
    }

    // Check YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str
    }

    return null
}

const SAMPLE_CSV = `asiento_ref,fecha,concepto,cuenta_codigo,cuenta_nombre,debe,haber,detalle
1,2024-01-01,Apertura Ejercicio,1.1.01,Caja,10000,0,Saldo inicial
1,2024-01-01,Apertura Ejercicio,3.1.01,Capital Social,0,10000,Saldo inicial
2,2024-01-02,Compra mercaderias,1.1.05,Mercaderias,5000,0,Fact A 123
2,2024-01-02,Compra mercaderias,1.1.01,Caja,0,5000,Pago efectivo`

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function JournalImportModal({ isOpen, onClose, onSuccess }: JournalImportModalProps) {
    const accounts = useLiveQuery(() => getPostableAccounts())

    const [step, setStep] = useState<1 | 2 | 3>(1) // 1: Upload, 2: Preview/Config, 3: Importing (Loading)
    const [file, setFile] = useState<File | null>(null)
    const [rawRows, setRawRows] = useState<ImportRow[]>([])
    const [previewEntries, setPreviewEntries] = useState<ParsedEntry[]>([])
    const [, setErrors] = useState<{ global: string[], rows: string[] }>({ global: [], rows: [] })
    const [importing, setImporting] = useState(false)
    const [progress, setProgress] = useState(0)

    // Reset state on close
    const handleClose = () => {
        if (importing) return
        setStep(1)
        setFile(null)
        setRawRows([])
        setPreviewEntries([])
        setErrors({ global: [], rows: [] })
        onClose()
    }

    // Step 1: Dropzone
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
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false, // We parse manually to handle formatting
                complete: (results) => {
                    const rows = results.data as any[]
                    // Add row numbers
                    const typedRows: ImportRow[] = rows.map((r, i) => normalizeKeys(r, i + 2)) // i + 2 because header is row 1
                    setRawRows(typedRows)
                    setStep(2)
                },
                error: (err) => {
                    setErrors(prev => ({ ...prev, global: [`Error leyendo CSV: ${err.message}`] }))
                }
            })
        } else if (ext === 'xlsx' || ext === 'xls') {
            try {
                const buffer = await f.arrayBuffer()
                const wb = XLSX.read(buffer)
                const sheetName = wb.SheetNames[0] // Take first sheet by default
                const ws = wb.Sheets[sheetName]
                const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" })
                const typedRows: ImportRow[] = jsonData.map((r: any, i) => normalizeKeys(r, i + 2))
                setRawRows(typedRows)
                setStep(2)
            } catch (err) {
                setErrors(prev => ({ ...prev, global: [`Error leyendo Excel: ${String(err)}`] }))
            }
        } else {
            setErrors(prev => ({ ...prev, global: ['Formato no soportado'] }))
        }
    }

    // Attempt to map varied column names to our standard
    const normalizeKeys = (row: any, rowNum: number): ImportRow => {
        const lowerKeys = Object.keys(row).reduce((acc, k) => {
            acc[k.toLowerCase().trim()] = row[k]
            return acc
        }, {} as Record<string, any>)

        // Utility to find value by possible keys
        const find = (options: string[]) => {
            for (const opt of options) {
                if (lowerKeys[opt] !== undefined) return lowerKeys[opt]
            }
            return ""
        }

        return {
            asiento_ref: find(['asiento_ref', 'asiento', 'ref', 'nro_asiento', 'id']),
            fecha: find(['fecha', 'date', 'fec']),
            concepto: find(['concepto', 'memo', 'descripcion_asiento']),
            cuenta_codigo: find(['cuenta_codigo', 'codigo', 'cod_cuenta', 'cuenta']),
            cuenta_nombre: find(['cuenta_nombre', 'nombre_cuenta', 'nombre', 'desc_cuenta', 'rubro']), // sometimes user puts name in 'cuenta'
            debe: find(['debe', 'debito', 'debit']),
            haber: find(['haber', 'credito', 'credit']),
            detalle: find(['detalle', 'nota', 'line_memo', 'descripcion']),
            __rowNum__: rowNum
        }
    }

    // Step 2: Validate & Process
    // We run this effect when rawRows or accounts change
    useMemo(() => {
        if (!rawRows.length || !accounts) return

        const grouped: Record<string, ImportRow[]> = {}
        // Group by ref
        rawRows.forEach(r => {
            const ref = String(r.asiento_ref || `GEN_${r.__rowNum__}`).trim()
            if (!grouped[ref]) grouped[ref] = []
            grouped[ref].push(r)
        })

        const result: ParsedEntry[] = []

        Object.keys(grouped).forEach(ref => {
            const rows = grouped[ref]
            const first = rows[0]

            // Validate Date
            const dateStr = parseDate(first.fecha);
            const entryErrors: string[] = []
            if (!dateStr) entryErrors.push(`Fila ${first.__rowNum__}: Fecha inválida (${first.fecha})`)

            const entryLines: ParsedLine[] = []

            rows.forEach(r => {
                const d = parseNumber(r.debe)
                const c = parseNumber(r.haber)

                // Diff or separate logic?
                // Requirements: “no permitir debe y haber simultáneos (o si ambos, tomar diferencia)” -> prefer strict but let's take net
                let finalD = 0
                let finalC = 0
                if (d > 0 && c > 0) {
                    if (d > c) finalD = d - c
                    else finalC = c - d
                } else {
                    finalD = d
                    finalC = c
                }

                // Account Match
                let matchedAccount = null
                const code = String(r.cuenta_codigo).trim()
                const name = String(r.cuenta_nombre).trim().toLowerCase()

                if (code) {
                    matchedAccount = accounts.find(a => a.code === code)
                }
                // Fallback to name match if no code match (or no code provided)
                if (!matchedAccount && name) {
                    matchedAccount = accounts.find(a => a.name.toLowerCase() === name)
                }

                if (!matchedAccount) {
                    entryErrors.push(`Fila ${r.__rowNum__}: Cuenta no encontrada (${code || name})`)
                }

                entryLines.push({
                    tempId: Math.random().toString(36),
                    accountId: matchedAccount ? matchedAccount.id : null,
                    accountCodeProvided: code,
                    accountNameProvided: name,
                    debit: finalD,
                    credit: finalC,
                    description: r.detalle || '',
                    rowNum: r.__rowNum__
                })
            })

            // Validate Totals
            const totalD = entryLines.reduce((sum, l) => sum + l.debit, 0)
            const totalC = entryLines.reduce((sum, l) => sum + l.credit, 0)
            const diff = Math.abs(totalD - totalC)

            if (diff > 0.01) {
                entryErrors.push(`Asiento Ref ${ref}: No balancea (Diferencia: ${diff.toFixed(2)})`)
            }
            if (entryLines.length < 2) {
                entryErrors.push(`Asiento Ref ${ref}: Debe tener al menos 2 líneas`)
            }

            result.push({
                ref,
                date: dateStr || '',
                memo: first.concepto || `Asiento importado ${ref}`,
                lines: entryLines,
                isValid: entryErrors.length === 0,
                errors: entryErrors,
                warnings: []
            })
        })

        setPreviewEntries(result)

    }, [rawRows, accounts])

    // stats
    const validCount = previewEntries.filter(e => e.isValid).length
    const errorCount = previewEntries.length - validCount
    const allValid = errorCount === 0 && previewEntries.length > 0

    // Handlers
    const downloadTemplate = () => {
        const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'plantilla_asientos.csv'
        link.click()
    }

    const handleImport = async () => {
        if (!allValid) return
        setImporting(true)
        setStep(3)

        let successCount = 0
        try {
            for (let i = 0; i < previewEntries.length; i++) {
                const e = previewEntries[i]
                setProgress(Math.round(((i + 1) / previewEntries.length) * 100))

                const dbLines: EntryLine[] = e.lines.map(l => ({
                    accountId: l.accountId!,
                    debit: l.debit,
                    credit: l.credit,
                    description: l.description
                }))

                await createEntry({
                    date: e.date,
                    memo: e.memo,
                    lines: dbLines
                })
                successCount++
                // Artificial delay for UX
                await new Promise(r => setTimeout(r, 50))
            }

            onSuccess(successCount)
            handleClose()
        } catch (err) {
            setErrors(prev => ({ ...prev, global: [`Error crítico importando: ${String(err)}`] }))
            setStep(2) // Go back to show error
        } finally {
            setImporting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <div
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-md transition-opacity"
                onClick={handleClose}
            />

            {/* Modal Content */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Importar Asientos</h2>
                        <p className="text-gray-500 text-sm mt-1">Desde Excel (.xlsx) o CSV</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto flex-1">

                    {step === 1 && (
                        <div className="flex flex-col gap-6">
                            <div
                                {...getRootProps()}
                                className={`
                                    border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 group
                                    ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}
                                `}
                            >
                                <input {...getInputProps()} />
                                <div className="mb-4">
                                    <svg className={`w-16 h-16 mx-auto ${isDragActive ? 'text-blue-500' : 'text-gray-300 group-hover:text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                                <p className="text-lg font-medium text-gray-700">
                                    {isDragActive ? '¡Soltá el archivo acá!' : 'Arrastrá tu archivo acá o hacé clic para buscarlo'}
                                </p>
                                <p className="text-sm text-gray-400 mt-2">Soporta .xlsx, .xls y .csv</p>
                            </div>

                            <div className="flex justify-center">
                                <button
                                    onClick={downloadTemplate}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2 hover:underline"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Descargar plantilla de ejemplo
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white p-2 rounded shadow-sm">
                                        📄
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-800">{file?.name}</div>
                                        <div className="text-xs text-gray-500">{(file?.size || 0 / 1024).toFixed(1)} KB</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setStep(1)}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    Cambiar archivo
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="text-sm text-gray-500 uppercase font-semibold">Asientos</div>
                                    <div className="text-3xl font-bold text-gray-800">{previewEntries.length}</div>
                                </div>
                                <div className={`p-4 rounded-lg border flex flex-col justify-center ${allValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className={`text-sm uppercase font-semibold ${allValid ? 'text-green-600' : 'text-red-600'}`}>
                                        {allValid ? 'Estado' : 'Errores'}
                                    </div>
                                    <div className={`text-xl font-bold ${allValid ? 'text-green-700' : 'text-red-700'}`}>
                                        {allValid ? '✅ Listo para importar' : `❌ ${errorCount} asientos con errores`}
                                    </div>
                                </div>
                            </div>

                            {/* Error List */}
                            {!allValid && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-4 max-h-40 overflow-y-auto">
                                    <h4 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                                        ⚠️ Por favor corregí los siguientes errores:
                                    </h4>
                                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                                        {previewEntries.flatMap(e => e.errors).slice(0, 10).map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                        {previewEntries.flatMap(e => e.errors).length > 10 && (
                                            <li className="italic">... y  más</li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {/* Preview Table */}
                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 border-b text-sm font-semibold text-gray-600">
                                    Vista previa (Primeros 5 asientos)
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-white border-b">
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Ref</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Cuenta</th>
                                                <th className="px-4 py-2 text-right font-medium text-gray-500">Debe</th>
                                                <th className="px-4 py-2 text-right font-medium text-gray-500">Haber</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500 w-10">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {previewEntries.slice(0, 5).map((entry, i) => (
                                                <React.Fragment key={i}>
                                                    {entry.lines.map((line, j) => (
                                                        <tr key={line.tempId} className={j === 0 ? 'bg-gray-50/50' : ''}>
                                                            <td className="px-4 py-1.5 align-top text-gray-600 whitespace-nowrap">
                                                                {j === 0 ? entry.date : ''}
                                                            </td>
                                                            <td className="px-4 py-1.5 align-top text-gray-600 font-mono text-xs">
                                                                {j === 0 ? entry.ref : ''}
                                                            </td>
                                                            <td className="px-4 py-1.5 align-top">
                                                                <div className={line.accountId ? 'text-gray-800' : 'text-red-500 font-bold'}>
                                                                    {line.accountId ? line.accountNameProvided || 'N/A' : `No encontrada: ${line.accountCodeProvided || line.accountNameProvided}`}
                                                                </div>
                                                                <div className="text-xs text-gray-400 truncate max-w-[200px]">{line.description}</div>
                                                            </td>
                                                            <td className="px-4 py-1.5 align-top text-right text-gray-700">
                                                                {line.debit > 0 ? line.debit.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '-'}
                                                            </td>
                                                            <td className="px-4 py-1.5 align-top text-right text-gray-700">
                                                                {line.credit > 0 ? line.credit.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '-'}
                                                            </td>
                                                            <td className="px-4 py-1.5 align-top text-center">
                                                                {j === 0 && (
                                                                    <span title={entry.isValid ? 'Correcto' : 'Error'} className="text-lg">
                                                                        {entry.isValid ? '✅' : '🔴'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="flex flex-col items-center justify-center h-64 gap-6">
                            <div className="w-full max-w-sm bg-gray-200 rounded-full h-2.5">
                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-gray-800">Importando asientos...</p>
                                <p className="text-gray-500">{progress}% completado</p>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        disabled={importing}
                        className="px-5 py-2.5 rounded-lg text-red-600 font-medium hover:bg-red-50 border border-transparent hover:border-red-100 transition-all disabled:opacity-50"
                    >
                        Cancelar
                    </button>

                    {step === 2 && (
                        <button
                            onClick={handleImport}
                            disabled={!allValid}
                            className={`
                                px-6 py-2.5 rounded-lg font-medium text-white shadow-lg shadow-blue-500/30 transition-all
                                ${allValid ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-0.5' : 'bg-gray-400 cursor-not-allowed shadow-none'}
                            `}
                        >
                            Importar {previewEntries.length} asientos
                        </button>
                    )}
                </div>

            </div>
        </div>
    )
}
