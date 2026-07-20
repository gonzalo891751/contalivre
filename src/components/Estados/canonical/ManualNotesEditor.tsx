/**
 * ManualNotesEditor — Fase 2F (§8): captura y versionado de notas manuales.
 *
 * Vive en la pestaña Notas. Escribe EXCLUSIVAMENTE por el servicio de
 * disclosures (texto plano sanitizado, versionado, snapshots invalidados);
 * las cifras de las notas derivadas no se tocan. Tras guardar dispara la
 * recarga del bundle para que la nota se vea de inmediato.
 */

import { useCallback, useEffect, useState } from 'react'
import {
    MANUAL_NOTE_TYPES,
    getHistory,
    saveDisclosure,
} from '../../../accounting/disclosures/manualDisclosuresService'
import type { ManualDisclosure, ManualNoteType } from '../../../core/models'

export interface ManualNotesEditorProps {
    exerciseId: string
    companyId: string
    onSaved: () => void
}

export function ManualNotesEditor({ exerciseId, companyId, onSaved }: ManualNotesEditorProps) {
    const [open, setOpen] = useState(false)
    const [noteType, setNoteType] = useState<ManualNoteType>('hechos-posteriores')
    const [content, setContent] = useState('')
    const [notApplicable, setNotApplicable] = useState(false)
    const [history, setHistory] = useState<ManualDisclosure[]>([])
    const [message, setMessage] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const loadHistory = useCallback(() => {
        getHistory(exerciseId, noteType).then(h => {
            setHistory(h)
            const current = h[0]
            setContent(current?.content ?? '')
            setNotApplicable(current?.notApplicable ?? false)
        })
    }, [exerciseId, noteType])
    useEffect(loadHistory, [loadHistory])

    const save = async (status: 'DRAFT' | 'VALIDATED') => {
        setBusy(true)
        setMessage(null)
        try {
            const saved = await saveDisclosure({ exerciseId, companyId, noteType, content, status, notApplicable })
            setMessage(`✓ Guardada v${saved.version} (${status === 'VALIDATED' ? 'validada; los snapshots del ejercicio quedaron invalidados' : 'borrador'}).`)
            loadHistory()
            onSaved()
        } catch (e) {
            setMessage(`✗ ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="mne-card" data-testid="manual-notes-editor">
            <button type="button" className="mne-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
                ✎ Editar notas manuales (hechos posteriores, contingencias, etc.)
            </button>
            {open && (
                <div className="mne-body">
                    <p className="mne-hint">
                        Texto plano versionado (el HTML se elimina). Guardar una versión validada invalida los
                        snapshots del ejercicio. Las notas derivadas del motor no se modifican desde acá.
                    </p>
                    <label className="mne-field">
                        Nota
                        <select value={noteType} onChange={e => setNoteType(e.target.value as ManualNoteType)} data-testid="mne-type">
                            {MANUAL_NOTE_TYPES.map(t => <option key={t.type} value={t.type}>{t.title}</option>)}
                        </select>
                    </label>
                    <label className="mne-check">
                        <input type="checkbox" checked={notApplicable} onChange={e => setNotApplicable(e.target.checked)} />
                        No aplicable (el texto queda como fundamento)
                    </label>
                    <textarea
                        rows={5}
                        value={content}
                        placeholder={notApplicable ? 'Fundamento de la no aplicabilidad…' : 'Contenido de la nota…'}
                        onChange={e => setContent(e.target.value)}
                        data-testid="mne-content"
                    />
                    <div className="mne-actions">
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save('VALIDATED')} data-testid="mne-save">
                            Guardar validada
                        </button>
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save('DRAFT')}>
                            Guardar borrador
                        </button>
                    </div>
                    {message && <div className="mne-message" data-testid="mne-message">{message}</div>}
                    {history.length > 0 && (
                        <div className="mne-history">
                            <strong>Historial:</strong>
                            {history.map(h => (
                                <div key={h.id}>
                                    v{h.version} · {h.status === 'VALIDATED' ? 'validada' : 'borrador'}
                                    {h.notApplicable ? ' · no aplicable' : ''} · {h.updatedAt.slice(0, 16).replace('T', ' ')}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <style>{styles}</style>
        </div>
    )
}

const styles = `
.mne-card { background: white; border: 1px dashed #cbd5e1; border-radius: 12px; margin: 4px 0 14px; }
.mne-head { width: 100%; text-align: left; padding: 10px 16px; background: transparent; border: none; cursor: pointer; font-size: 0.84rem; font-weight: 600; color: #475569; }
.mne-head:hover { color: #2563eb; }
.mne-head:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.mne-body { padding: 0 16px 14px; display: grid; gap: 10px; max-width: 640px; }
.mne-hint { font-size: 0.76rem; color: #64748b; margin: 0; line-height: 1.5; }
.mne-field { display: grid; gap: 4px; font-size: 0.8rem; font-weight: 600; }
.mne-field select, .mne-body textarea { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.84rem; font-family: inherit; }
.mne-check { display: flex; gap: 8px; align-items: center; font-size: 0.8rem; }
.mne-actions { display: flex; gap: 8px; }
.mne-message { font-size: 0.8rem; color: #047857; }
.mne-history { font-size: 0.74rem; color: #64748b; line-height: 1.6; }
`
