import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { createEntry } from '../storage/entries'
import { getPostableAccounts } from '../storage/accounts'
import type { Account } from '../core/models'

type Step = 1 | 2 | 3 | 4

type ImportAsientosUXProps = {
    embed?: boolean
    buttonLabel?: string
    onSuccess?: (count: number) => void
    autoOpen?: boolean
    onClose?: () => void
}

const canUseDOM = () => typeof window !== 'undefined' && typeof document !== 'undefined'

export default function ImportAsientosUX({ embed = true, buttonLabel = 'Importar asientos', onSuccess, autoOpen, onClose }: ImportAsientosUXProps) {
    const [open, setOpen] = useState(autoOpen ?? false)
    const [helpOpen, setHelpOpen] = useState(false)
    const [step, setStep] = useState<Step>(1)
    const [file, setFile] = useState<File | null>(null)

    const [toast, setToast] = useState<string | null>(null)

    // Logic State
    const [rawRows, setRawRows] = useState<any[]>([])
    const [rawHeaders, setRawHeaders] = useState<string[]>([])
    const [mapping, setMapping] = useState<any>({ fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: '', nro_asiento: '', detalle: '' })
    const [availableAccounts, setAvailableAccounts] = useState<Account[]>([])
    const [accountResolution, setAccountResolution] = useState<Map<string, string>>(new Map())
    const [processedEntries, setProcessedEntries] = useState<any[]>([])
    const [validationStats, setValidationStats] = useState({ totalSeats: 0, totalLines: 0, warnings: 0 })
    const [importLoading, setImportLoading] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)

    // Auto-open logic for non-embed mode or autoOpen prop
    useEffect(() => {
        if (autoOpen) {
            setOpen(true)
        } else if (!embed) {
            setOpen(true)
        }
    }, [embed, autoOpen])

    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const modalRef = useRef<HTMLDivElement | null>(null)

    // Inject isolated CSS once
    useEffect(() => {
        if (!canUseDOM()) return
        const id = 'climp-styles-v1'
        if (document.getElementById(id)) return

        const style = document.createElement('style')
        style.id = id
        style.textContent = `
      .climp * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .climpOverlay{
        position:fixed; inset:0; z-index:9999;
        background: rgba(15,23,42,.55);
        backdrop-filter: blur(6px);
        display:flex; align-items:center; justify-content:center;
        padding: 24px;
      }
      .climpModal{
        width: min(1040px, 100%);
        max-height: 85vh;
        background:#fff;
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(0,0,0,.25);
        overflow:hidden;
        transform: translateY(8px);
        animation: climpIn .18s ease-out forwards;
        border: 1px solid rgba(148,163,184,.45);
        display: flex;
        flex-direction: column;
      }
      @keyframes climpIn { to { transform: translateY(0); } }

      .climpHeader{
        display:flex; align-items:center; justify-content:space-between;
        padding: 16px 18px;
        border-bottom:1px solid rgba(226,232,240,.9);
        background:
          radial-gradient(1200px 1200px at 0% 0%, rgba(37,99,235,.08) 0%, transparent 45%),
          radial-gradient(900px 900px at 100% 0%, rgba(34,197,94,.08) 0%, transparent 45%),
          #ffffff;
        flex-shrink: 0;
      }
      /* ... other header styles ... */
      .climpTitleRow{ display:flex; align-items:center; gap:10px; }
      .climpTitle{
        font-size: 20px; font-weight: 800; color:#0f172a; letter-spacing: -0.02em;
      }
      .climpSub{
        margin-top: 2px;
        font-size: 13px; color:#64748b;
      }
      .climpHeaderActions{ display:flex; align-items:center; gap:10px; }
      .climpLinkBtn{
        border:0; background:transparent; color:#2563eb;
        font-weight:700; font-size: 13px; cursor:pointer;
        display:flex; align-items:center; gap:8px;
        padding: 8px 10px; border-radius: 10px;
      }
      .climpLinkBtn:hover{ background: rgba(37,99,235,.08); }
      .climpCloseBtn{
        width: 36px; height: 36px; border-radius: 10px;
        border:1px solid rgba(226,232,240,.9); background:#fff;
        cursor:pointer;
        display:grid; place-items:center;
      }
      .climpCloseBtn:hover{ background:#f8fafc; }

      .climpBody{
        padding: 14px 18px 24px;
        display:flex; flex-direction:column; gap:12px;
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .climpStepper{
        padding: 4px 2px 6px;
        flex-shrink: 0;
      }
      /* ... stepper styles preserved ... */
      .climpSteps{
        display:flex; align-items:center; justify-content:space-between;
        gap: 10px;
      }
      .climpStep{
        display:flex; flex-direction:column; align-items:center; gap:6px;
        min-width: 90px;
      }
      .climpDot{
        width: 34px; height: 34px; border-radius: 999px;
        display:grid; place-items:center;
        font-weight: 900; font-size: 13px;
        border:2px solid rgba(148,163,184,.45);
        color:#64748b;
        background:#fff;
      }
      .climpDotActive{
        border-color:#2563eb; color:#2563eb;
        box-shadow: 0 0 0 6px rgba(37,99,235,.10);
      }
      .climpDotDone{
        border-color:#22c55e; color:#16a34a;
        box-shadow: 0 0 0 6px rgba(34,197,94,.10);
      }
      .climpStepLabel{
        font-size: 12px; font-weight: 800;
        color:#64748b;
      }
      .climpStepLabelActive{ color:#2563eb; }
      .climpStepLabelDone{ color:#16a34a; }
      .climpLine{
        height: 4px; border-radius: 999px;
        background: rgba(226,232,240,.9);
        margin: 8px 14px 0;
        position: relative;
        overflow:hidden;
      }
      .climpLineFill{
        position:absolute; inset:0;
        width: var(--pct, 0%);
        background: linear-gradient(90deg, #2563eb, #22c55e);
        border-radius: 999px;
        transition: width .18s ease;
      }

      .climpPanel{
        border:1px solid rgba(226,232,240,.95);
        border-radius: 16px;
        padding: 16px;
        background:
          radial-gradient(700px 700px at 0% 0%, rgba(37,99,235,.06) 0%, transparent 42%),
          radial-gradient(600px 600px at 100% 0%, rgba(34,197,94,.06) 0%, transparent 42%),
          #fff;
      }

      .climpDropzone{
        border: 2px dashed rgba(148,163,184,.55);
        border-radius: 16px;
        padding: 18px;
        min-height: 170px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap: 10px;
        background: rgba(248,250,252,.7);
        cursor:pointer;
        transition: transform .12s ease, border-color .12s ease, background .12s ease;
      }
      .climpDropzone:hover{
        transform: translateY(-1px);
        border-color: rgba(37,99,235,.65);
        background: rgba(239,246,255,.75);
      }
      .climpDropIcon{
        width: 46px; height: 46px; border-radius: 999px;
        display:grid; place-items:center;
        background: rgba(37,99,235,.10);
        border: 1px solid rgba(37,99,235,.20);
      }
      .climpDropTitle{ font-size: 18px; font-weight: 900; color:#0f172a; letter-spacing:-0.02em; text-align:center; }
      .climpDropSub{ font-size: 13px; color:#64748b; text-align:center; }
      .climpHint{ font-size: 12px; color:#64748b; margin-top: 8px; display:flex; align-items:center; justify-content:center; gap:8px; }
      .climpSmallLink{
        border:0; background:transparent; cursor:pointer;
        color:#2563eb; font-weight:800; font-size: 12px;
        display:inline-flex; align-items:center; gap:8px;
        padding: 6px 8px; border-radius: 10px;
      }
      .climpSmallLink:hover{ background: rgba(37,99,235,.08); }

      .climpGrid2{
        display:grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      @media (min-width: 980px){
        .climpGrid2{ grid-template-columns: 1fr 1fr; }
      }
      .climpCard{
        border:1px solid rgba(226,232,240,.95);
        border-radius: 16px;
        background:#fff;
        overflow:hidden;
      }
      .climpCardHeader{
        padding: 12px 14px;
        border-bottom:1px solid rgba(226,232,240,.95);
        background: rgba(248,250,252,.85);
        display:flex; align-items:center; justify-content:space-between; gap:10px;
      }
      .climpCardTitle{
        display:flex; align-items:center; gap:10px;
        font-weight: 900; color:#0f172a; font-size: 13px;
        letter-spacing: .02em;
        text-transform: uppercase;
      }
      .climpCardBody{ padding: 12px 14px; display:flex; flex-direction:column; gap:10px; }

      .climpFieldLabel{
        font-size: 11px;
        font-weight: 900;
        color:#64748b;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .climpSelect{
        width:100%;
        border-radius: 12px;
        border:1px solid rgba(226,232,240,.95) !important;
        background: rgba(248,250,252,.95) !important;
        padding: 10px 12px !important;
        font-size: 13px !important;
        color:#0f172a !important;
        outline: none !important;
      }
      .climpSelect:focus{
        border-color: rgba(37,99,235,.65) !important;
        box-shadow: 0 0 0 6px rgba(37,99,235,.12) !important;
      }

      .climpTableWrap{
        border:1px solid rgba(226,232,240,.95);
        border-radius: 14px;
        overflow:auto;
        background:#fff;
      }
      .climpTable{
        width:100%;
        border-collapse: collapse;
        min-width: 720px;
      }
      .climpTh{
        background: rgba(248,250,252,.9);
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
        font-weight: 900;
        color:#64748b;
        text-align:left;
        padding: 10px 12px;
        border-bottom:1px solid rgba(226,232,240,.95);
        white-space: nowrap;
      }
      .climpTd{
        padding: 10px 12px;
        border-bottom:1px solid rgba(241,245,249,.9);
        font-size: 13px;
        color:#0f172a;
        white-space: nowrap;
      }
      .climpTdNum{ text-align:right; font-variant-numeric: tabular-nums; }

      .climpBadgeOk{
        display:inline-flex; align-items:center; gap:6px;
        font-size: 12px; font-weight: 900;
        color:#16a34a;
        background: rgba(34,197,94,.12);
        border:1px solid rgba(34,197,94,.22);
        padding: 4px 10px; border-radius: 999px;
      }
      .climpBadgeWarn{
        display:inline-flex; align-items:center; gap:6px;
        font-size: 12px; font-weight: 900;
        color:#b45309;
        background: rgba(245,158,11,.14);
        border:1px solid rgba(245,158,11,.22);
        padding: 4px 10px; border-radius: 999px;
      }

      .climpFooter{
        display:flex; align-items:center; justify-content:space-between;
        gap: 10px;
        padding: 14px 18px;
        border-top:1px solid rgba(226,232,240,.95);
        background:#fff;
        flex-shrink: 0;
        z-index: 10;
      }
      .climpBtn{
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 900;
        font-size: 13px;
        cursor:pointer;
        border:1px solid rgba(226,232,240,.95);
        background:#fff;
        color:#0f172a;
        transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
      }
      .climpBtn:hover{ transform: translateY(-1px); box-shadow: 0 10px 18px rgba(15,23,42,.08); background:#f8fafc; }
      .climpBtnPrimary{
        border: 0;
        background: linear-gradient(90deg, #2563eb, #22c55e);
        color:#fff;
        box-shadow: 0 12px 22px rgba(37,99,235,.18);
      }
      .climpBtnPrimary:hover{ box-shadow: 0 16px 28px rgba(37,99,235,.22); background: linear-gradient(90deg, #1d4ed8, #16a34a); }
      .climpBtnDisabled{
        opacity:.55; cursor:not-allowed;
        transform:none !important;
        box-shadow:none !important;
      }

      .climpTrigger{
        display:inline-flex; align-items:center; gap:10px;
        border-radius: 12px;
        padding: 10px 14px;
        border:1px solid rgba(34,197,94,.25);
        background: linear-gradient(90deg, rgba(37,99,235,.12), rgba(34,197,94,.12));
        color:#0f172a;
        font-weight: 900;
        cursor:pointer;
        transition: transform .12s ease, box-shadow .12s ease;
      }
      .climpTrigger:hover{ transform: translateY(-1px); box-shadow: 0 12px 22px rgba(15,23,42,.10); }

      .climpToast{
        position: fixed; right: 18px; bottom: 18px; z-index: 10000;
        background:#0f172a; color:#fff;
        border-radius: 14px;
        padding: 12px 14px;
        box-shadow: 0 20px 50px rgba(0,0,0,.25);
        font-weight: 800;
        font-size: 13px;
      }
      .climpHelpBox{
        border:1px solid rgba(226,232,240,.95);
        border-radius: 16px;
        background: rgba(248,250,252,.9);
        padding: 12px 14px;
        font-size: 13px;
        color:#0f172a;
      }
      .climpHelpBox p{ margin: 6px 0; color:#334155; }
      .climpHelpBox strong{ color:#0f172a; }
      
      @keyframes climpSpin { to { transform: rotate(360deg); } }
      .climpSpinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(255,255,255,.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: climpSpin .6s linear infinite;
      }
    `
        document.head.appendChild(style)
    }, [])

    // Lock body scroll when modal open
    useEffect(() => {
        if (!canUseDOM()) return
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    // ESC to close
    useEffect(() => {
        if (!canUseDOM()) return
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const progressPct = useMemo(() => {
        if (step === 1) return '0%'
        if (step === 2) return '33%'
        if (step === 3) return '66%'
        return '100%'
    }, [step])

    // --------------------------------------------------------
    // HELPERS (Adapted from JournalImportModal)
    // --------------------------------------------------------
    const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+|-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const normalizeText = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')

    const parseARNumber = (val: any): number => {
        if (typeof val === 'number') return val
        if (!val) return 0
        let str = String(val).trim().replace('$', '').trim()
        if (str.includes(',') && str.includes('.')) {
            if (str.indexOf('.') < str.indexOf(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.'))
            else return parseFloat(str.replace(/,/g, ''))
        } else if (str.includes(',')) return parseFloat(str.replace(',', '.'))
        const num = parseFloat(str)
        return isNaN(num) ? 0 : num
    }

    const parseDateStrict = (val: any): string | null => {
        if (!val) return null
        if (typeof val === 'number') {
            const date = new Date(Math.round((val - 25569) * 86400 * 1000))
            return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
        }
        const str = String(val).trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
            const [day, month, year] = str.split('/')
            const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
            return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
        }
        return null
    }

    // Load accounts
    useEffect(() => {
        if (open) getPostableAccounts().then(setAvailableAccounts)
    }, [open])

    // Detect Mapping
    const detectMapping = (headers: string[]) => {
        const map: any = { fecha: '', cuenta_codigo: '', cuenta_nombre: '', debe: '', haber: '', concepto: '', nro_asiento: '', detalle: '' }
        const synonyms: any = {
            nro_asiento: ['nro', 'asiento', 'id'],
            fecha: ['fecha', 'date', 'fec'],
            cuenta_codigo: ['cuenta_codigo', 'codigo_cuenta', 'cod', 'id_cuenta'],
            cuenta_nombre: ['cuenta_nombre', 'nombre_cuenta', 'cuenta', 'account'],
            debe: ['debe', 'debito', 'debit'],
            haber: ['haber', 'credito', 'credit'],
            concepto: ['concepto', 'memo', 'glosa', 'descripcion_asiento'],
            detalle: ['detalle', 'descripcion_linea', 'desc_linea', 'linea']
        }
        headers.forEach(h => {
            const norm = normalizeHeader(h)
            for (const field of Object.keys(synonyms)) {
                if (!map[field] && synonyms[field].some((s: string) => norm === s || norm.includes(s))) {
                    map[field] = h
                }
            }
        })
        return map
    }

    // Step 1: File Parsing
    const onPickFile = async (f: File | null) => {
        if (!f) return
        setFile(f)
        const ext = f.name.split('.').pop()?.toLowerCase()

        const finish = (data: any[], headers: string[]) => {
            setRawRows(data)
            setRawHeaders(headers)
            setMapping(detectMapping(headers))
        }

        if (ext === 'csv') {
            Papa.parse(f, {
                header: true, skipEmptyLines: true,
                complete: (results) => finish(results.data as any[], results.meta.fields || [])
            })
        } else if (ext === 'xlsx' || ext === 'xls') {
            const data = await f.arrayBuffer()
            const wb = XLSX.read(data, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const json = XLSX.utils.sheet_to_json(ws, { defval: "" })
            if (json.length > 0) finish(json, Object.keys(json[0] as any))
        }
    }

    // Step 2 Calculation (Preview)
    const previewData = useMemo(() => {
        if (step !== 2 || rawRows.length === 0) return []

        let lastNro: string | null = null
        let lastFecha: string | null = null
        let lastConcepto: string | null = null

        return rawRows.slice(0, 50).map((row, i) => {
            const rawNro = String(row[mapping.nro_asiento] || '').trim()
            const rawFecha = row[mapping.fecha]
            const rawConcepto = String(row[mapping.concepto] || '').trim()

            // Fill-down
            let actualNro = rawNro
            if (!actualNro && lastNro) actualNro = lastNro
            if (actualNro) lastNro = actualNro

            let actualFecha = parseDateStrict(rawFecha)
            if (!actualFecha && lastFecha) actualFecha = lastFecha
            if (actualFecha) lastFecha = actualFecha

            // Fallback grouping key: if no nro_asiento, use Date+Concepto
            if (!actualNro) {
                // If we have a concepto, assume it's a new entry if date changes or just use date+concepto hash
                // For simplified preview, just show current row state
            }
            if (rawConcepto) lastConcepto = rawConcepto

            const debe = parseARNumber(row[mapping.debe])
            const haber = parseARNumber(row[mapping.haber])
            const cuentaCode = String(row[mapping.cuenta_codigo] || '').trim()
            const cuentaName = String(row[mapping.cuenta_nombre] || '').trim()
            const detalle = String(row[mapping.detalle] || '').trim()

            const isValid = !!(actualFecha && (cuentaCode || cuentaName) && (debe > 0 || haber > 0) && !(debe > 0 && haber > 0) && (mapping.fecha && mapping.debe && mapping.haber))

            return {
                i: i + 1,
                nro: actualNro,
                fecha: actualFecha,
                cuenta: cuentaCode || cuentaName,
                desc: detalle || rawConcepto || lastConcepto || '', // Visual preview logic
                debe, haber,
                ok: isValid
            }
        })
    }, [step, rawRows, mapping])

    // Step 3 Logic: Analyze Accounts
    const missingAccounts = useMemo(() => {
        if (step !== 3) return []
        const codeMap = new Map(); availableAccounts.forEach(a => codeMap.set(a.code, a.id))
        const nameMap = new Map(); availableAccounts.forEach(a => nameMap.set(normalizeText(a.name), a.id))

        const missing = new Map<string, { code: string, desc: string }>()

        rawRows.forEach(row => {
            const code = String(row[mapping.cuenta_codigo] || '').trim()
            const name = String(row[mapping.cuenta_nombre] || '').trim()
            if (!code && !name) return

            const key = code || name
            if (accountResolution.has(key)) return // Already resolved

            let match = code ? codeMap.get(code) : undefined
            if (!match && name) match = nameMap.get(normalizeText(name))

            if (match) {
                // Auto-resolve silently if not already in map? 
                // We can't update state in render. We should trust the resolution map logic triggered by "prepareStep3"
                return
            }
            if (!missing.has(key)) missing.set(key, { code: key, desc: name || code })
        })

        return Array.from(missing.values())
    }, [step, rawRows, mapping, availableAccounts, accountResolution])

    // Transition Logic
    const prepareStep3 = () => {
        // Auto-resolve loop
        const codeMap = new Map(); availableAccounts.forEach(a => codeMap.set(a.code, a.id))
        const nameMap = new Map(); availableAccounts.forEach(a => nameMap.set(normalizeText(a.name), a.id))
        const newRes = new Map(accountResolution)

        rawRows.forEach(row => {
            const code = String(row[mapping.cuenta_codigo] || '').trim()
            const name = String(row[mapping.cuenta_nombre] || '').trim()
            const key = code || name
            if (!key) return
            if (newRes.has(key)) return

            let match = code ? codeMap.get(code) : undefined
            if (!match && name) match = nameMap.get(normalizeText(name))
            if (match) newRes.set(key, match)
        })
        setAccountResolution(newRes)
    }

    useEffect(() => {
        if (step === 3) prepareStep3()
    }, [step]) // Run once when entering step 3

    // Step 4 Logic: Group & Validate
    useEffect(() => {
        if (step !== 4) return

        const entries = new Map<string, any>()
        let lastNro: string | null = null
        let lastFecha: string | null = null
        let lastConcepto: string | null = null
        let warnings = 0

        rawRows.forEach((row, idx) => {
            // Fill down logic
            let nro = String(row[mapping.nro_asiento] || '').trim()
            const rawFecha = row[mapping.fecha]
            let fecha = parseDateStrict(rawFecha)
            let concepto = String(row[mapping.concepto] || '').trim()

            if (!nro && lastNro) nro = lastNro
            if (!fecha && lastFecha) fecha = lastFecha

            // Fallback ID if no NRO
            const entryId = nro || (fecha + (concepto || lastConcepto || 'GENERIC'))

            if (nro) lastNro = nro
            if (fecha) lastFecha = fecha
            if (concepto) lastConcepto = concepto

            if (!fecha) return // Skip invalid date rows

            if (!entries.has(entryId)) {
                entries.set(entryId, {
                    nro, fecha,
                    memo: concepto || lastConcepto || `Asiento Importado ${nro || idx}`,
                    lines: [],
                    debe: 0, haber: 0
                })
            }
            const entry = entries.get(entryId)
            if (!entry.memo && concepto) entry.memo = concepto // Update memo if found later

            const code = String(row[mapping.cuenta_codigo] || '').trim()
            const name = String(row[mapping.cuenta_nombre] || '').trim()
            const key = code || name
            const accountId = accountResolution.get(key)

            if (accountId) {
                const debe = parseARNumber(row[mapping.debe])
                const haber = parseARNumber(row[mapping.haber])
                const detalle = String(row[mapping.detalle] || '').trim()

                if (debe > 0 || haber > 0) {
                    entry.lines.push({ accountId, debit: debe, credit: haber, description: detalle })
                    entry.debe += debe
                    entry.haber += haber
                }
            } else {
                if (key) warnings++
            }
        })

        const finalEntries = Array.from(entries.values())
        setProcessedEntries(finalEntries)
        setValidationStats({
            totalSeats: finalEntries.length,
            totalLines: finalEntries.reduce((acc, e) => acc + e.lines.length, 0),
            warnings
        })

    }, [step])

    const canGoNext = useMemo(() => {
        if (step === 1) return !!file
        if (step === 2) return !!(mapping.fecha && mapping.debe && mapping.haber && (mapping.cuenta_codigo || mapping.cuenta_nombre))
        if (step === 3) return missingAccounts.length === 0
        return true
    }, [step, file, mapping, missingAccounts])

    const openModal = () => {
        setOpen(true)
        setHelpOpen(false)
        setStep(1)
        setFile(null)
    }

    const closeModal = () => {
        setOpen(false)
        setHelpOpen(false)
        setStep(1)
        setFile(null)
        setRawRows([])
        setValidationStats({ totalSeats: 0, totalLines: 0, warnings: 0 })
        onClose?.()
    }

    const next = () => setStep((s) => (Math.min(4, s + 1) as Step))
    const back = () => setStep((s) => (Math.max(1, s - 1) as Step))

    // Note: onPickFile logic is already defined above at line 477. We should remove this duplicate/broken one.
    // But we need the 'confirm' function which was lost or merged here.

    const confirm = async () => {
        setIsConfirming(true)
        setImportLoading(true)
        try {
            // Simulate wait for UX
            await new Promise(r => setTimeout(r, 800))

            let count = 0
            for (const e of processedEntries) {
                if (Math.abs(e.debe - e.haber) > 0.01) continue
                if (e.lines.length < 2) continue
                await createEntry({
                    date: e.fecha,
                    memo: e.memo,
                    lines: e.lines
                })
                count++
            }
            setToast(`✅ Se importaron ${count} asientos exitosamente.`)
            setTimeout(() => {
                setToast(null)
                closeModal()
                // window.location.reload() // Optional
                onSuccess?.(count)
            }, 2000)
        } catch (err) {
            console.error(err)
            setToast('❌ Error al importar. Revisa la consola.')
        } finally {
            setImportLoading(false)
            setIsConfirming(false)
        }
    }

    const downloadTemplate = () => {
        const csv =
            'NroAsiento,Fecha,Concepto,CuentaCodigo,Debe,Haber,DetalleLinea\n' +
            '1,2024-03-01,Apertura Caja,1.1.01.01,1000,0,\n' +
            '1,2024-03-01,Apertura Caja,3.1.01.01,0,1000,Capital Social\n' +
            '2,2024-03-02,Compra Insumos,5.2.01.01,500,0,Resmas A4\n' +
            '2,2024-03-02,Compra Insumos,1.1.01.01,0,500,\n'
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'modelo_importacion.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    const Stepper = () => {
        const dotClass = (n: Step) => {
            if (step === n) return 'climpDot climpDotActive'
            if (step > n) return 'climpDot climpDotDone'
            return 'climpDot'
        }
        const labelClass = (n: Step) => {
            if (step === n) return 'climpStepLabel climpStepLabelActive'
            if (step > n) return 'climpStepLabel climpStepLabelDone'
            return 'climpStepLabel'
        }
        return (
            <div className="climpStepper">
                <div className="climpSteps">
                    <div className="climpStep">
                        <div className={dotClass(1)}>1</div>
                        <div className={labelClass(1)}>Archivo</div>
                    </div>
                    <div className="climpStep">
                        <div className={dotClass(2)}>2</div>
                        <div className={labelClass(2)}>Mapeo</div>
                    </div>
                    <div className="climpStep">
                        <div className={dotClass(3)}>3</div>
                        <div className={labelClass(3)}>Cuentas</div>
                    </div>
                    <div className="climpStep">
                        <div className={dotClass(4)}>4</div>
                        <div className={labelClass(4)}>Confirmar</div>
                    </div>
                </div>
                <div className="climpLine" style={{ ['--pct' as any]: progressPct }}>
                    <div className="climpLineFill" />
                </div>
            </div>
        )
    }

    const renderStep = () => {
        if (step === 1) {
            return (
                <div className="climpPanel">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx"
                        style={{ display: 'none' }}
                        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                    />

                    <div
                        className="climpDropzone"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault()
                            const f = e.dataTransfer.files?.[0]
                            if (f) onPickFile(f)
                        }}
                    >
                        <div className="climpDropIcon" aria-hidden="true">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <div className="climpDropTitle">Arrastrá tu archivo CSV o Excel acá</div>
                        <div className="climpDropSub">o hacé clic para buscar en tu equipo</div>
                        <div className="climpDropSub" style={{ fontSize: 12 }}>Soporta .xlsx, .csv (Max 10MB)</div>

                        {file && (
                            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900, color: '#0f172a' }}>
                                📎 {file.name} <span style={{ color: '#64748b', fontWeight: 800 }}>({Math.round(file.size / 1024)} KB)</span>
                            </div>
                        )}
                    </div>

                    <div className="climpHint">
                        <button className="climpSmallLink" onClick={downloadTemplate} type="button">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Descargar plantilla modelo
                        </button>
                        <span style={{ color: '#94a3b8' }}>•</span>
                        <span>Tip: en producción acá va drag & drop real + parseo CSV/XLSX</span>
                    </div>
                </div>
            )
        }

        if (step === 2) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="climpGrid2">
                        <div className="climpCard">
                            <div className="climpCardHeader">
                                <div className="climpCardTitle">
                                    <span aria-hidden="true">☰</span> Datos del Asiento
                                </div>
                            </div>
                            <div className="climpCardBody">
                                <div>
                                    <div className="climpFieldLabel">Fecha *</div>
                                    <select className="climpSelect" value={mapping.fecha} onChange={e => setMapping({ ...mapping, fecha: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="climpFieldLabel">N° Asiento</div>
                                    <select className="climpSelect" value={mapping.nro_asiento} onChange={e => setMapping({ ...mapping, nro_asiento: e.target.value })}>
                                        <option value="">(Opcional)</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="climpFieldLabel">Concepto General</div>
                                    <select className="climpSelect" value={mapping.concepto} onChange={e => setMapping({ ...mapping, concepto: e.target.value })}>
                                        <option value="">(Opcional)</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="climpFieldLabel">Detalle Línea</div>
                                    <select className="climpSelect" value={mapping.detalle} onChange={e => setMapping({ ...mapping, detalle: e.target.value })}>
                                        <option value="">(Opcional)</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="climpCard">
                            <div className="climpCardHeader">
                                <div className="climpCardTitle">
                                    <span aria-hidden="true">🗄</span> Contabilidad
                                </div>
                                <span className="climpBadgeOk">Estado: Leíble</span>
                            </div>
                            <div className="climpCardBody">
                                <div>
                                    <div className="climpFieldLabel">Cuenta Código</div>
                                    <select className="climpSelect" value={mapping.cuenta_codigo} onChange={e => setMapping({ ...mapping, cuenta_codigo: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="climpFieldLabel">Cuenta Nombre</div>
                                    <select className="climpSelect" value={mapping.cuenta_nombre} onChange={e => setMapping({ ...mapping, cuenta_nombre: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="climpGrid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                    <div>
                                        <div className="climpFieldLabel">Debe *</div>
                                        <select className="climpSelect" value={mapping.debe} onChange={e => setMapping({ ...mapping, debe: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <div className="climpFieldLabel">Haber *</div>
                                        <select className="climpSelect" value={mapping.haber} onChange={e => setMapping({ ...mapping, haber: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            {rawHeaders.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="climpCard">
                        <div className="climpCardHeader">
                            <div className="climpCardTitle">Vista previa de datos</div>
                        </div>
                        <div className="climpCardBody">
                            <div className="climpTableWrap">
                                <table className="climpTable">
                                    <thead>
                                        <tr>
                                            <th className="climpTh">Fila</th>
                                            <th className="climpTh">Fecha</th>
                                            <th className="climpTh">Cuenta</th>
                                            <th className="climpTh">Descripción</th>
                                            <th className="climpTh" style={{ textAlign: 'right' }}>
                                                Debe
                                            </th>
                                            <th className="climpTh" style={{ textAlign: 'right' }}>
                                                Haber
                                            </th>
                                            <th className="climpTh">Validación</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.map((r, i) => (
                                            <tr key={i}>
                                                <td className="climpTd">{r.i}</td>
                                                <td className="climpTd">{r.fecha}</td>
                                                <td className="climpTd" style={{ color: r.ok ? '#0f172a' : '#dc2626', fontWeight: 900 }}>
                                                    {r.cuenta || '—'}
                                                </td>
                                                <td className="climpTd">{r.desc}</td>
                                                <td className="climpTd climpTdNum">{r.debe > 0 ? r.debe.toFixed(2) : '-'}</td>
                                                <td className="climpTd climpTdNum">{r.haber > 0 ? r.haber.toFixed(2) : '-'}</td>
                                                <td className="climpTd">
                                                    {r.ok ? <span className="climpBadgeOk">✓ OK</span> : <span className="climpBadgeWarn">Revisar</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Tip: acá después conectamos el parseo real y validación con tu plan de cuentas.
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        if (step === 3) {
            if (missingAccounts.length === 0) {
                return (
                    <div className="climpPanel" style={{ background: 'rgba(34,197,94,.06)' }}>
                        <div style={{ fontWeight: 900, color: '#16a34a', fontSize: 16, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            ✅ Todas las cuentas coinciden
                        </div>
                        <div style={{ color: '#15803d', fontWeight: 700, fontSize: 13 }}>
                            No hay cuentas por vincular. Podés continuar.
                        </div>
                    </div>
                )
            }

            return (
                <div className="climpPanel" style={{ background: 'rgba(245,158,11,.06)' }}>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 16, marginBottom: 6 }}>
                        ⚠️ Cuentas no encontradas
                    </div>
                    <div style={{ color: '#b45309', fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
                        Detectamos códigos de cuenta en el archivo que no existen en tu plan actual. Vinculalas para continuar.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {missingAccounts.map((m) => (
                            <div key={m.code} className="climpCard">
                                <div className="climpCardBody">
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div className="climpFieldLabel">Código en archivo</div>
                                            <div style={{ fontSize: 18, fontWeight: 1000, color: '#0f172a' }}>{m.code}</div>
                                            <div style={{ fontSize: 13, color: '#64748b' }}>Descripción: “{m.desc}”</div>
                                        </div>
                                        <div style={{ width: 'min(420px, 100%)' }}>
                                            <div className="climpFieldLabel">Acción requerida</div>
                                            <select
                                                className="climpSelect"
                                                value={accountResolution.get(m.code) || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    const newMap = new Map(accountResolution)
                                                    if (val) newMap.set(m.code, val)
                                                    else newMap.delete(m.code)
                                                    setAccountResolution(newMap)
                                                }}
                                            >
                                                <option value="">Vincular a...</option>
                                                {availableAccounts.map(a => (
                                                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                                                ))}
                                            </select>
                                            <div style={{ marginTop: 8 }}>
                                                {accountResolution.has(m.code) ? <span className="climpBadgeOk">✓ Listo para importar</span> : <span className="climpBadgeWarn">Pendiente</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }

        return (
            <div className="climpPanel">
                <div style={{ fontWeight: 1000, fontSize: 16, color: '#0f172a' }}>✅ Confirmación</div>
                <div style={{ marginTop: 8, color: '#334155', fontSize: 13 }}>
                    Revisá el resumen y confirmá la importación.
                </div>

                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    <div className="climpHelpBox">
                        <strong>Archivo:</strong> {file ? file.name : ''}<br />
                        <strong>Asientos detectados:</strong> {validationStats.totalSeats}<br />
                        <strong>Líneas totales:</strong> {validationStats.totalLines}<br />
                        <strong>Advertencias:</strong> {validationStats.warnings > 0 ? `${validationStats.warnings} cuentas sin vincular (se ignorarán esas líneas)` : 'Ninguna'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Nota: esta confirmación es “UX first”. Después conectamos el import real (createEntry/updateEntry) y listo.
                    </div>
                </div>
            </div>
        )
    }

    const Modal = () => {
        if (!open) return null
        const content = (
            <div
                className="climp climpOverlay"
                onMouseDown={(e) => {
                    // click outside closes
                    if (modalRef.current && e.target instanceof Node && !modalRef.current.contains(e.target)) closeModal()
                }}
            >
                <div className="climpModal" ref={modalRef} role="dialog" aria-modal="true">
                    <div className="climpHeader">
                        <div>
                            <div className="climpTitleRow">
                                <span aria-hidden="true">⬇️</span>
                                <div>
                                    <div className="climpTitle">Importar asientos</div>
                                    <div className="climpSub">Subí tu archivo y mapeá columnas en unos minutos.</div>
                                </div>
                            </div>
                        </div>
                        <div className="climpHeaderActions">
                            <button className="climpLinkBtn" onClick={() => setHelpOpen((v) => !v)} type="button">
                                <span aria-hidden="true">❔</span> Ayuda
                            </button>
                            <button className="climpCloseBtn" onClick={closeModal} type="button" aria-label="Cerrar">
                                ✕
                            </button>
                        </div>
                    </div>

                    <div className="climpBody">
                        <Stepper />

                        {helpOpen && (
                            <div className="climpHelpBox">
                                <strong>¿Cómo tiene que venir el archivo?</strong>
                                <p>Ideal: Fecha, Código de cuenta, Descripción, Debe, Haber.</p>
                                <p>Regla: cada fila representa una línea del asiento; después se agrupa por N°/Fecha si lo agregás.</p>
                                <p>Truco: si una cuenta no existe, acá te deja vincularla sin cortar el flujo.</p>
                            </div>
                        )}

                        {renderStep()}
                    </div>

                    <div className="climpFooter">
                        <button className="climpBtn" type="button" onClick={closeModal} disabled={isConfirming}>
                            Cancelar
                        </button>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className={`climpBtn ${step === 1 ? 'climpBtnDisabled' : ''}`} type="button" onClick={back} disabled={step === 1 || isConfirming}>
                                Atrás
                            </button>

                            {step < 4 ? (
                                <button
                                    className={`climpBtn climpBtnPrimary ${!canGoNext ? 'climpBtnDisabled' : ''}`}
                                    type="button"
                                    onClick={next}
                                    disabled={!canGoNext || isConfirming}
                                    title={!canGoNext ? 'Primero cargá un archivo' : 'Siguiente paso'}
                                >
                                    Siguiente paso
                                </button>
                            ) : (
                                <button
                                    className="climpBtn climpBtnPrimary"
                                    type="button"
                                    onClick={confirm}
                                    disabled={importLoading || isConfirming}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                                >
                                    {isConfirming && <div className="climpSpinner" />}
                                    {isConfirming ? 'Cargando cuentas, esperá un momento...' : (importLoading ? 'Importando...' : 'Confirmar importación')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )

        return canUseDOM() ? createPortal(content, document.body) : content
    }

    return (
        <>
            {embed && (
                <button className="climp climpTrigger" type="button" onClick={openModal}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {buttonLabel}
                </button>
            )}

            <Modal />

            {toast && <div className="climp climpToast">{toast}</div>}
        </>
    )
}
