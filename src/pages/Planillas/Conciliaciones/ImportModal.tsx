import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface ImportModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (rows: any[], mode: 'replace' | 'append') => void
}

type Step = 'upload' | 'settings'

interface ColumnMapping {
    fecha: string
    concepto: string
    debe: string
    haber: string
    ref: string // Optional
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    const [step, setStep] = useState<Step>('upload')
    const [rawRows, setRawRows] = useState<any[]>([])
    const [headers, setHeaders] = useState<string[]>([])
    const [fileName, setFileName] = useState('')
    const [mapping, setMapping] = useState<ColumnMapping>({ fecha: '', concepto: '', debe: '', haber: '', ref: '' })
    const [importMode, setImportMode] = useState<'replace' | 'append'>('replace')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [showPreview, setShowPreview] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setStep('upload')
            setRawRows([])
            setHeaders([])
            setFileName('')
            setMapping({ fecha: '', concepto: '', debe: '', haber: '', ref: '' })
            setError('')
            setShowPreview(false)

            // Lock body scroll
            document.body.style.overflow = 'hidden'
        }

        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    // Escape key listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null
    if (typeof document === 'undefined') return null

    // Helper for handling backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    // --- Logic: File Parsing ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsLoading(true)
        setFileName(file.name)
        setError('')

        setTimeout(() => {
            if (file.name.endsWith('.csv')) {
                parseCSV(file)
            } else if (file.name.match(/\.(xlsx|xls)$/)) {
                parseExcel(file)
            } else {
                setError('Formato no soportado. Use .csv o .xlsx')
                setIsLoading(false)
            }
        }, 300)
    }

    const parseCSV = (file: File) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.warn("CSV Errors:", results.errors)
                }
                processParsedData(results.data, results.meta.fields || [])
                setIsLoading(false)
            },
            error: (err) => {
                setError('Error al leer CSV: ' + err.message)
                setIsLoading(false)
            }
        })
    }

    const parseExcel = (file: File) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = e.target?.result
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
                const firstSheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[firstSheetName]
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

                if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
                    const keys = Object.keys(jsonData[0] as object)
                    processParsedData(jsonData, keys)
                } else {
                    setError('El archivo parece estar vacío o no tiene formato de tabla.')
                }
            } catch (err: any) {
                setError('Error al leer Excel: ' + err.message)
            } finally {
                setIsLoading(false)
            }
        }
        reader.readAsBinaryString(file)
    }

    const processParsedData = (data: any[], detectedHeaders: string[]) => {
        setRawRows(data)
        setHeaders(detectedHeaders)
        autoMapColumns(detectedHeaders)
        setStep('settings')
    }

    // --- Logic: Auto Mapping ---
    const autoMapColumns = (cols: string[]) => {
        const lowerCols = cols.map(c => c.toLowerCase())
        const findCol = (keywords: string[]) => {
            const index = lowerCols.findIndex(c => keywords.some(k => c.includes(k)))
            return index >= 0 ? cols[index] : ''
        }

        const newMapping = {
            fecha: findCol(['fecha', 'date', 'f. op', 'operacion', 'movimiento']),
            concepto: findCol(['concepto', 'detalle', 'descrip', 'narrativa', 'referencia']),
            debe: findCol(['debe', 'debito', 'debit', 'entrada', 'cargo']),
            haber: findCol(['haber', 'credito', 'credit', 'salida', 'abono']),
            ref: findCol(['ref', 'nro', 'num', 'comprobante', 'id'])
        }

        setMapping(newMapping)
    }

    // --- Logic: Normalization & Final Import ---
    const handleConfirmImport = () => {
        if (!mapping.fecha || !mapping.concepto) {
            setError('Por favor asigna al menos Fecha y Concepto.')
            return
        }

        const processed: any[] = []
        let errorsCount = 0

        rawRows.forEach((row, idx) => {
            const fechaRaw = row[mapping.fecha]
            const conceptoRaw = row[mapping.concepto] || ''
            const refRaw = mapping.ref ? row[mapping.ref] : ''
            const debeRaw = mapping.debe ? row[mapping.debe] : 0
            const haberRaw = mapping.haber ? row[mapping.haber] : 0

            // 1. Normalize Date
            let finalDate = ''
            try {
                if (fechaRaw instanceof Date) {
                    finalDate = fechaRaw.toISOString().substring(0, 10)
                } else if (typeof fechaRaw === 'number') {
                    // Excel serial date handled by cellDates normally
                } else if (typeof fechaRaw === 'string') {
                    finalDate = parseDateString(fechaRaw)
                }
            } catch (e) { }

            // 2. Normalize Details
            const finalConcepto = refRaw ? `REF ${refRaw} - ${conceptoRaw}` : conceptoRaw

            // 3. Normalize Amounts
            const finalDebe = parseAmount(debeRaw)
            const finalHaber = parseAmount(haberRaw)

            if (finalDate) {
                processed.push({
                    fecha: finalDate,
                    concepto: finalConcepto,
                    debe: finalDebe,
                    haber: finalHaber
                })
            } else {
                errorsCount++
            }
        })

        if (processed.length === 0 && rawRows.length > 0) {
            setError('No se pudieron procesar filas válidas. Revisa el mapeo de columnas.')
            return
        }

        onImport(processed, importMode)
    }

    // Helpers
    const parseDateString = (str: string): string => {
        if (!str) return ''
        const clean = str.trim()
        if (clean.match(/^\d{4}-\d{2}-\d{2}/)) return clean.substring(0, 10)
        const parts = clean.split(/[-/]/)
        if (parts.length === 3) {
            let d = parts[0]
            let m = parts[1]
            let y = parts[2]
            if (y.length === 2) y = '20' + y
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        return ''
    }

    const parseAmount = (val: any): number => {
        if (typeof val === 'number') return val
        if (!val) return 0
        if (typeof val === 'string') {
            let clean = val.replace(/[$\s]/g, '')
            const lastDot = clean.lastIndexOf('.')
            const lastComma = clean.lastIndexOf(',')
            if (lastComma > lastDot) {
                clean = clean.replace(/\./g, '').replace(',', '.')
            } else if (lastDot > lastComma) {
                clean = clean.replace(/,/g, '')
            }
            const num = parseFloat(clean)
            return isNaN(num) ? 0 : num
        }
        return 0
    }

    const isValid = mapping.fecha && mapping.concepto

    return createPortal(
        <div
            className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onMouseDown={handleBackdropClick}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200"
                onMouseDown={e => e.stopPropagation()}
            >
                {/* Header Premium */}
                <div className="px-6 sm:px-8 py-5 border-b border-slate-200 flex justify-between items-start bg-white shrink-0">
                    <div className="flex items-start gap-5">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 text-white">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                                <line x1="8" y1="12" x2="16" y2="12"></line>
                            </svg>
                        </div>
                        <div className="pt-0.5">
                            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-none mb-1">
                                Importar extracto
                            </h3>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Importá movimientos desde tu banco o sistema externo.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-600">
                            {step === 'upload' ? 'Paso 1 de 2' : 'Paso 2 de 2'}
                        </div>
                        <button
                            onClick={onClose}
                            className="h-10 w-10 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                            aria-label="Cerrar modal"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body - Scrollable Area */}
                <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-3 animate-in slide-in-from-top-2">
                            <div className="p-1.5 bg-red-100 rounded-lg shrink-0 text-red-600 mt-0.5">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            </div>
                            <div className="text-sm font-medium leading-relaxed">{error}</div>
                        </div>
                    )}

                    {step === 'upload' ? (
                        <div className="flex flex-col h-full justify-center min-h-[400px]">
                            <div
                                className={`
                                    relative flex flex-col items-center justify-center p-10 
                                    border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer group 
                                    ${isLoading
                                        ? 'border-blue-300 bg-blue-50/20'
                                        : 'border-slate-200 bg-slate-50/40 hover:border-blue-400 hover:bg-slate-50'}
                                `}
                                style={{ minHeight: '320px' }}
                                onClick={() => !isLoading && fileInputRef.current?.click()}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                    disabled={isLoading}
                                />

                                {isLoading ? (
                                    <div className="flex flex-col items-center animate-pulse">
                                        <div className="h-14 w-14 rounded-full border-[4px] border-slate-200 border-t-blue-600 animate-spin mb-6"></div>
                                        <span className="text-slate-700 font-bold text-lg">Procesando archivo...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="h-16 w-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-300">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="17 8 12 3 7 8" />
                                                <line x1="12" y1="3" x2="12" y2="15" />
                                            </svg>
                                        </div>

                                        <h4 className="text-xl font-bold text-slate-800 mb-2">Subir archivo</h4>
                                        <p className="text-slate-500 text-sm sm:text-base mb-6 text-center max-w-sm leading-relaxed">
                                            Arrastrá un archivo Excel o CSV, o hacé click para seleccionarlo.
                                        </p>

                                        <div className="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                            <span className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wide">.XLSX</span>
                                            <span className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wide">.CSV</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-7 animate-in slide-in-from-bottom-6 duration-500 pb-2">

                            {/* File Info Card */}
                            <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                                <div className="flex items-center gap-5">
                                    <div className="h-12 w-12 bg-white text-emerald-600 rounded-full border border-slate-200 flex items-center justify-center shadow-sm text-xs font-bold shrink-0">
                                        {fileName.split('.').pop()?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-slate-900 mb-0.5">{fileName}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                Carga exitosa
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium">• {rawRows.length} filas detectadas</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setStep('upload')}
                                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline px-2 transition-colors"
                                >
                                    Cambiar archivo
                                </button>
                            </div>

                            {/* Section 1: Mapping */}
                            <section>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-md">1</div>
                                    <h4 className="text-sm font-extrabold tracking-wide text-slate-900 uppercase">Mapeo de columnas</h4>
                                </div>

                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
                                        {/* Required */}
                                        <div className="space-y-6">
                                            <div className="group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Columna Fecha</label>
                                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wide">Requerido</span>
                                                </div>
                                                <SelectCol
                                                    value={mapping.fecha}
                                                    options={headers}
                                                    onChange={v => setMapping({ ...mapping, fecha: v })}
                                                    placeholder="Seleccionar columna..."
                                                />
                                            </div>
                                            <div className="group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Columna Concepto</label>
                                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wide">Requerido</span>
                                                </div>
                                                <SelectCol
                                                    value={mapping.concepto}
                                                    options={headers}
                                                    onChange={v => setMapping({ ...mapping, concepto: v })}
                                                    placeholder="Seleccionar columna..."
                                                />
                                            </div>
                                        </div>

                                        {/* Optional */}
                                        <div className="space-y-6">
                                            <div className="group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Debe / Entradas</label>
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Opcional</span>
                                                </div>
                                                <SelectCol
                                                    value={mapping.debe}
                                                    options={headers}
                                                    onChange={v => setMapping({ ...mapping, debe: v })}
                                                    placeholder="Sin asignar"
                                                />
                                            </div>
                                            <div className="group">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Haber / Salidas</label>
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Opcional</span>
                                                </div>
                                                <SelectCol
                                                    value={mapping.haber}
                                                    options={headers}
                                                    onChange={v => setMapping({ ...mapping, haber: v })}
                                                    placeholder="Sin asignar"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section 2: Options */}
                            <section>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-md">2</div>
                                    <h4 className="text-sm font-extrabold tracking-wide text-slate-900 uppercase">Opciones de importación</h4>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <label className={`
                                        relative flex items-start gap-4 p-5 rounded-2xl border cursor-pointer transition-all duration-200
                                        ${importMode === 'replace'
                                            ? 'border-blue-400 bg-blue-50/30 ring-2 ring-blue-500/20 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}
                                    `}>
                                        <div className="mt-0.5">
                                            <input
                                                type="radio"
                                                name="mode"
                                                className="h-5 w-5 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                checked={importMode === 'replace'}
                                                onChange={() => setImportMode('replace')}
                                            />
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold mb-1.5 ${importMode === 'replace' ? 'text-blue-700' : 'text-slate-800'}`}>Reemplazar datos</div>
                                            <p className="text-sm text-slate-500 leading-relaxed">Borra todo lo existente en la tabla externa e inserta los nuevos datos. Ideal para corregir cargas.</p>
                                        </div>
                                    </label>

                                    <label className={`
                                        relative flex items-start gap-4 p-5 rounded-2xl border cursor-pointer transition-all duration-200
                                        ${importMode === 'append'
                                            ? 'border-blue-400 bg-blue-50/30 ring-2 ring-blue-500/20 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}
                                    `}>
                                        <div className="mt-0.5">
                                            <input
                                                type="radio"
                                                name="mode"
                                                className="h-5 w-5 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                checked={importMode === 'append'}
                                                onChange={() => setImportMode('append')}
                                            />
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold mb-1.5 ${importMode === 'append' ? 'text-blue-700' : 'text-slate-800'}`}>Anexar datos</div>
                                            <p className="text-sm text-slate-500 leading-relaxed">Mantiene la información actual y agrega las nuevas filas al final. Para importaciones mensuales.</p>
                                        </div>
                                    </label>
                                </div>
                            </section>

                            {/* Section 3: Preview */}
                            <section>
                                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                                    <button
                                        onClick={() => setShowPreview(!showPreview)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                                    >
                                        <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <line x1="3" y1="9" x2="21" y2="9"></line>
                                                <line x1="9" y1="21" x2="9" y2="9"></line>
                                            </svg>
                                            Vista previa de datos
                                        </span>
                                        <span className={`text-slate-400 transition-transform duration-300 ${showPreview ? 'rotate-180' : ''}`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </span>
                                    </button>

                                    {showPreview && (
                                        <div className="overflow-x-auto max-h-64 border-t border-slate-200">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr>
                                                        {headers.map((h, i) => (
                                                            <th key={i} className="p-3 border-b border-slate-200 bg-slate-50 font-bold text-slate-600 whitespace-nowrap sticky top-0 z-10">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {rawRows.slice(0, 10).map((row, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            {headers.map((h, j) => (
                                                                <td key={j} className="p-3 truncate max-w-[180px] text-slate-600 font-medium font-mono border-r border-slate-50 last:border-0">{String(row[h] || '')}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </section>

                        </div>
                    )}
                </div>

                {/* Footer Sticky */}
                <div className="px-6 sm:px-8 py-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 sticky bottom-0 z-20">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition shadow-sm"
                    >
                        Cancelar
                    </button>
                    {step === 'settings' && (
                        <button
                            onClick={handleConfirmImport}
                            disabled={!isValid}
                            className={`
                                px-6 py-2.5 rounded-xl text-sm font-extrabold text-white shadow-md transition-all flex items-center gap-2
                                ${isValid
                                    ? 'bg-gradient-to-r from-blue-600 to-emerald-500 hover:brightness-110 hover:shadow-blue-500/20 transform active:scale-95'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
                            `}
                        >
                            Importar datos
                            {isValid && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

// Helpers Components
function SelectCol({ value, options, onChange, placeholder }: { value: string, options: string[], onChange: (val: string) => void, placeholder?: string }) {
    return (
        <div className="relative group">
            <select
                className={`
                    w-full h-11 pl-3 pr-10 text-sm rounded-xl border appearance-none transition-all cursor-pointer font-medium
                    ${value
                        ? 'border-blue-400 bg-blue-50/30 text-blue-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}
                    focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                `}
                value={value}
                onChange={e => onChange(e.target.value)}
            >
                <option value="">{placeholder || '-- Seleccionar --'}</option>
                {options.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        </div>
    )
}
