/**
 * ExportEstadosModal — Fase 2D (§3).
 *
 * Diferencia la vista web amigable de la EXPORTACIÓN formal. Permite elegir
 * formato (PDF formal RT 54 T.O. RT 59 / planilla), contenido, método del EFE,
 * expresión monetaria, comparativo y sello de borrador. Ejecuta la exportación
 * contra el mismo ReportingBundle (no recalcula).
 */

import { useMemo, useState } from 'react'
import { X, FileText, Table, Download } from 'lucide-react'
import type { ReportingBundle } from '../../reporting/loadReportingBundle'
import {
    defaultExportOptions,
    hasAnyContent,
    type ExportEstadosOptions,
    type ExportContentSelection,
} from '../../lib/exportOptions'
import { exportReportBundlePdfFormal } from '../../pdf/reportBundlePdfFormal'
import { exportReportBundleWorkbook } from '../../lib/exportReportBundle'

interface Props {
    bundle: ReportingBundle
    onClose: () => void
}

const CONTENT_LABELS: { key: keyof ExportContentSelection; label: string }[] = [
    { key: 'esp', label: 'Situación Patrimonial (ESP)' },
    { key: 'er', label: 'Resultados (ER)' },
    { key: 'eepn', label: 'Evolución del PN (EEPN)' },
    { key: 'efe', label: 'Flujo de Efectivo (EFE)' },
    { key: 'notas', label: 'Notas' },
    { key: 'indicadores', label: 'Indicadores' },
    { key: 'analisis', label: 'Análisis vertical y horizontal' },
]

export function ExportEstadosModal({ bundle, onClose }: Props) {
    const hasComparative = bundle.metadata.hasComparative
    const restatedAvailable = !!bundle.cashFlowRestated
    const [opts, setOpts] = useState<ExportEstadosOptions>(() => defaultExportOptions(hasComparative))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const canExport = useMemo(() => hasAnyContent(opts.content), [opts.content])

    const setContent = (key: keyof ExportContentSelection, value: boolean) =>
        setOpts(o => ({ ...o, content: { ...o.content, [key]: value } }))

    const handleExport = async () => {
        if (!canExport) return
        setBusy(true)
        setError(null)
        try {
            if (opts.format === 'PDF_FORMAL') {
                await exportReportBundlePdfFormal(bundle, opts)
            } else {
                await exportReportBundleWorkbook(bundle, opts)
            }
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="exp-overlay" role="dialog" aria-modal="true" aria-labelledby="exp-title" onClick={onClose}>
            <div className="exp-modal" onClick={e => e.stopPropagation()}>
                <header className="exp-header">
                    <h2 id="exp-title">Exportar estados</h2>
                    <button className="exp-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
                </header>

                <div className="exp-body">
                    {/* Formato */}
                    <section className="exp-section">
                        <span className="exp-section-title">Formato</span>
                        <div className="exp-format-grid">
                            <button
                                type="button"
                                className={`exp-format-card${opts.format === 'PDF_FORMAL' ? ' active' : ''}`}
                                aria-pressed={opts.format === 'PDF_FORMAL'}
                                onClick={() => setOpts(o => ({ ...o, format: 'PDF_FORMAL' }))}
                            >
                                <FileText size={22} />
                                <strong>PDF formal</strong>
                                <span>Presentación RT 54 T.O. RT 59 (FACPCE/CENCyA)</span>
                            </button>
                            <button
                                type="button"
                                className={`exp-format-card${opts.format === 'SPREADSHEET' ? ' active' : ''}`}
                                aria-pressed={opts.format === 'SPREADSHEET'}
                                onClick={() => setOpts(o => ({ ...o, format: 'SPREADSHEET' }))}
                            >
                                <Table size={22} />
                                <strong>Planilla</strong>
                                <span>Workbook .xlsx con una hoja por estado</span>
                            </button>
                        </div>
                    </section>

                    {/* Contenido */}
                    <section className="exp-section">
                        <span className="exp-section-title">Contenido</span>
                        <div className="exp-checks">
                            {CONTENT_LABELS.map(({ key, label }) => (
                                <label key={key} className="exp-check">
                                    <input
                                        type="checkbox"
                                        checked={opts.content[key]}
                                        onChange={e => setContent(key, e.target.checked)}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        {!canExport && <p className="exp-warn">Seleccioná al menos un estado para exportar.</p>}
                    </section>

                    {/* EFE */}
                    {opts.content.efe && (
                        <section className="exp-section">
                            <span className="exp-section-title">Flujo de efectivo</span>
                            <div className="exp-inline">
                                <div className="exp-field">
                                    <span className="exp-field-label">Método</span>
                                    <div className="exp-pills">
                                        <button type="button" className={`exp-pill${opts.efeMethod === 'DIRECT' ? ' active' : ''}`} onClick={() => setOpts(o => ({ ...o, efeMethod: 'DIRECT' }))}>Directo</button>
                                        <button type="button" className={`exp-pill${opts.efeMethod === 'INDIRECT' ? ' active' : ''}`} onClick={() => setOpts(o => ({ ...o, efeMethod: 'INDIRECT' }))}>Indirecto</button>
                                    </div>
                                </div>
                                <div className="exp-field">
                                    <span className="exp-field-label">Expresión</span>
                                    <div className="exp-pills">
                                        <button type="button" className={`exp-pill${opts.currency === 'NOMINAL' ? ' active' : ''}`} onClick={() => setOpts(o => ({ ...o, currency: 'NOMINAL' }))}>Nominal</button>
                                        <button
                                            type="button"
                                            className={`exp-pill${opts.currency === 'CLOSING' ? ' active' : ''}`}
                                            disabled={!restatedAvailable}
                                            title={!restatedAvailable ? 'Requiere índices cargados en el módulo de inflación' : undefined}
                                            onClick={() => setOpts(o => ({ ...o, currency: 'CLOSING' }))}
                                        >Moneda de cierre</button>
                                    </div>
                                </div>
                            </div>
                            {opts.currency === 'CLOSING' && (
                                <p className="exp-note">La moneda de cierre aplica al EFE; el resto de los estados se exportan en {bundle.metadata.currency}.</p>
                            )}
                        </section>
                    )}

                    {/* Opciones */}
                    <section className="exp-section">
                        <span className="exp-section-title">Opciones</span>
                        <label className={`exp-check${!hasComparative ? ' disabled' : ''}`}>
                            <input
                                type="checkbox"
                                checked={opts.comparative && hasComparative}
                                disabled={!hasComparative}
                                onChange={e => setOpts(o => ({ ...o, comparative: e.target.checked }))}
                            />
                            Incluir cifras comparativas del ejercicio anterior
                            {!hasComparative && <span className="exp-muted"> (activá el comparativo en pantalla)</span>}
                        </label>
                        <label className="exp-check">
                            <input
                                type="checkbox"
                                checked={opts.markDraft || !bundle.statements.validation.canPublish}
                                disabled={!bundle.statements.validation.canPublish}
                                onChange={e => setOpts(o => ({ ...o, markDraft: e.target.checked }))}
                            />
                            Sellar como BORRADOR
                            {!bundle.statements.validation.canPublish && <span className="exp-muted"> (obligatorio: el reporte no es publicable)</span>}
                        </label>
                    </section>

                    {error && <p className="exp-error">No se pudo exportar: {error}</p>}
                </div>

                <footer className="exp-footer">
                    <button className="exp-btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
                    <button className="exp-btn-primary" onClick={handleExport} disabled={!canExport || busy}>
                        <Download size={16} />
                        {busy ? 'Generando…' : opts.format === 'PDF_FORMAL' ? 'Exportar PDF' : 'Exportar planilla'}
                    </button>
                </footer>

                <style>{modalStyles}</style>
            </div>
        </div>
    )
}

const modalStyles = `
.exp-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.exp-modal { background: white; border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.exp-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; background: white; z-index: 1; }
.exp-header h2 { font-size: 1.15rem; font-weight: 800; margin: 0; color: #0f172a; }
.exp-close { border: none; background: none; cursor: pointer; color: #64748b; padding: 4px; border-radius: 6px; display: flex; }
.exp-close:hover { background: #f1f5f9; color: #0f172a; }
.exp-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 20px; }
.exp-section { display: flex; flex-direction: column; gap: 10px; }
.exp-section-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }

.exp-format-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 480px) { .exp-format-grid { grid-template-columns: 1fr; } }
.exp-format-card {
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
    padding: 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.15s ease; color: #64748b;
}
.exp-format-card strong { color: #0f172a; font-size: 0.92rem; }
.exp-format-card span { font-size: 0.72rem; line-height: 1.35; }
.exp-format-card:hover { border-color: #cbd5e1; }
.exp-format-card.active { border-color: #3B82F6; background: rgba(59,130,246,0.05); color: #3B82F6; }
.exp-format-card.active strong { color: #2563eb; }

.exp-checks { display: flex; flex-direction: column; gap: 8px; }
.exp-check { display: flex; align-items: center; gap: 9px; font-size: 0.88rem; color: #334155; cursor: pointer; }
.exp-check input { width: 16px; height: 16px; cursor: pointer; }
.exp-check.disabled { color: #94a3b8; cursor: default; }
.exp-muted { color: #94a3b8; font-size: 0.78rem; }

.exp-inline { display: flex; gap: 24px; flex-wrap: wrap; }
.exp-field { display: flex; flex-direction: column; gap: 6px; }
.exp-field-label { font-size: 0.72rem; font-weight: 600; color: #64748b; }
.exp-pills { display: inline-flex; padding: 3px; gap: 3px; background: #f1f5f9; border-radius: 9px; border: 1px solid #e2e8f0; }
.exp-pill { padding: 6px 12px; font-size: 0.8rem; font-weight: 600; color: #64748b; background: transparent; border: none; border-radius: 6px; cursor: pointer; }
.exp-pill.active { background: white; color: #3B82F6; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.exp-pill:disabled { opacity: 0.5; cursor: not-allowed; }

.exp-note { font-size: 0.76rem; color: #a16207; margin: 0; }
.exp-warn { font-size: 0.78rem; color: #b45309; margin: 0; }
.exp-error { font-size: 0.82rem; color: #b91c1c; margin: 0; }

.exp-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; border-top: 1px solid #e2e8f0; position: sticky; bottom: 0; background: white; }
.exp-btn-secondary { padding: 9px 16px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; font-weight: 600; font-size: 0.88rem; color: #334155; cursor: pointer; }
.exp-btn-secondary:hover:not(:disabled) { background: #f8fafc; }
.exp-btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px; border: none; background: #3B82F6; color: white; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; }
.exp-btn-primary:hover:not(:disabled) { background: #2563eb; }
.exp-btn-primary:disabled, .exp-btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
`
