/**
 * Empresas de práctica: crear, abrir, renombrar y eliminar.
 *
 * Cada empresa es una base independiente en este navegador (ver
 * storage/workspaces). Abrir otra empresa recarga la aplicación sobre su base.
 */

import { useState } from 'react'
import { Buildings, Plus, Trash, PencilSimple, ArrowSquareOut, Check } from '@phosphor-icons/react'
import {
    activateWorkspace, createWorkspace, deleteWorkspace, getActiveWorkspace, listWorkspaces, updateWorkspace,
    ENTITY_KIND_LABEL, type EntityKind, type Workspace, type WorkspaceStart,
} from '../storage/workspaces'
import { setActiveEntityKind } from '../accounting/application/workspaceSetup'

function openWorkspace(id: string) {
    activateWorkspace(id)
    // la base abierta se elige al iniciar: se recarga la aplicación
    window.location.assign('/')
}

function WorkspaceCard({ ws, active, onChanged }: { ws: Workspace; active: boolean; onChanged: () => void }) {
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(ws.name)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const save = async () => {
        try {
            updateWorkspace(ws.id, { name })
            setEditing(false); setError(null); onChanged()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
    }
    const remove = async () => {
        if (!window.confirm(`¿Eliminar "${ws.name}"? Se borran todos sus asientos y datos de este navegador. No se puede deshacer.`)) return
        setBusy(true)
        try {
            await deleteWorkspace(ws.id)
            onChanged()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }
    const toggleKind = async () => {
        const next: EntityKind = ws.entityKind === 'SIN_FINES_DE_LUCRO' ? 'CON_FINES_DE_LUCRO' : 'SIN_FINES_DE_LUCRO'
        await setActiveEntityKind(next)
        onChanged()
    }

    return (
        <article className={`emp-card${active ? ' is-active' : ''}`}>
            <div className="emp-card-head">
                {editing ? (
                    <label className="aec-field" style={{ flex: 1 }}>
                        <span>Nombre</span>
                        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} autoFocus />
                    </label>
                ) : (
                    <h3 className="emp-card-name">{ws.name}</h3>
                )}
                <Buildings size={22} weight="duotone" aria-hidden />
            </div>
            <div className="emp-badges">
                {active && <span className="emp-badge is-active">Abierta</span>}
                <span className={`emp-badge${ws.entityKind === 'SIN_FINES_DE_LUCRO' ? ' is-esfl' : ''}`}>{ENTITY_KIND_LABEL[ws.entityKind]}</span>
                {ws.start === 'EJEMPLO' && <span className="emp-badge">Caso de práctica</span>}
            </div>
            {ws.description && <p className="emp-note">{ws.description}</p>}
            {error && <p className="emp-error">{error}</p>}
            <div className="emp-card-actions">
                {!active && <button type="button" className="aec-btn" onClick={() => openWorkspace(ws.id)}><ArrowSquareOut size={15} aria-hidden /> Abrir</button>}
                {editing
                    ? <button type="button" className="aec-btn" onClick={save}><Check size={15} aria-hidden /> Guardar</button>
                    : <button type="button" className="aec-btn aec-btn-ghost" onClick={() => setEditing(true)}><PencilSimple size={15} aria-hidden /> Renombrar</button>}
                {active && (
                    <button type="button" className="aec-btn aec-btn-ghost" onClick={toggleKind} title="Cambia la denominación de los estados contables">
                        Pasar a {ws.entityKind === 'SIN_FINES_DE_LUCRO' ? 'con fines de lucro' : 'sin fines de lucro'}
                    </button>
                )}
                {!active && <button type="button" className="aec-btn aec-btn-danger" onClick={remove} disabled={busy}><Trash size={15} aria-hidden /> Eliminar</button>}
            </div>
        </article>
    )
}

function NewWorkspaceForm({ onCancel }: { onCancel: () => void }) {
    const [name, setName] = useState('')
    const [kind, setKind] = useState<EntityKind>('CON_FINES_DE_LUCRO')
    const [start, setStart] = useState<WorkspaceStart>('EJEMPLO')
    const [description, setDescription] = useState('')
    const [error, setError] = useState<string | null>(null)

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const ws = createWorkspace({ name, entityKind: kind, start, description })
            openWorkspace(ws.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }
    }

    return (
        <form className="aec-section emp-form" onSubmit={submit}>
            <h2 className="aec-h2">Nueva empresa de práctica</h2>
            <label className="aec-field">
                <span>Nombre</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej.: Distribuidora del Litoral S.A." required autoFocus />
            </label>
            <fieldset className="emp-options" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="aec-h4">Tipo de ente</legend>
                <label className="emp-option">
                    <input type="radio" name="kind" checked={kind === 'CON_FINES_DE_LUCRO'} onChange={() => setKind('CON_FINES_DE_LUCRO')} />
                    <div><strong>Con fines de lucro</strong><span>Sociedad comercial: estado de resultados, capital social, resultados no asignados.</span></div>
                </label>
                <label className="emp-option">
                    <input type="radio" name="kind" checked={kind === 'SIN_FINES_DE_LUCRO'} onChange={() => setKind('SIN_FINES_DE_LUCRO')} />
                    <div><strong>Sin fines de lucro</strong><span>Asociación civil, club o fundación: estado de recursos y gastos, fondo social, superávit.</span></div>
                </label>
            </fieldset>
            <fieldset className="emp-options" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="aec-h4">Punto de partida</legend>
                <label className="emp-option">
                    <input type="radio" name="start" checked={start === 'EJEMPLO'} onChange={() => setStart('EJEMPLO')} />
                    <div><strong>Con un caso de práctica</strong><span>Dos ejercicios cargados (2024 cerrado y 2025 abierto) para analizar estados y practicar el cierre.</span></div>
                </label>
                <label className="emp-option">
                    <input type="radio" name="start" checked={start === 'VACIA'} onChange={() => setStart('VACIA')} />
                    <div><strong>Vacía</strong><span>Solo el plan de cuentas: cargás vos el asiento de apertura y las operaciones del enunciado.</span></div>
                </label>
            </fieldset>
            <label className="aec-field">
                <span>Nota (opcional)</span>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej.: Práctico 4 de Contabilidad III" />
            </label>
            {error && <p className="emp-error">{error}</p>}
            <div className="emp-card-actions">
                <button type="submit" className="aec-btn"><Plus size={15} aria-hidden /> Crear y abrir</button>
                <button type="button" className="aec-btn aec-btn-ghost" onClick={onCancel}>Cancelar</button>
            </div>
        </form>
    )
}

export default function EmpresasPage() {
    const [, setVersion] = useState(0)
    const [creating, setCreating] = useState(false)
    const workspaces = listWorkspaces()
    const active = getActiveWorkspace()
    const refresh = () => setVersion(v => v + 1)

    return (
        <div className="emp-root aec-root">
            <header className="aec-header">
                <div>
                    <p className="aec-eyebrow">Empresas de práctica</p>
                    <h1 className="aec-title">Tus empresas</h1>
                    <p className="aec-subtitle">
                        Cada empresa tiene su propio plan de cuentas, asientos, estados y módulos. Podés tener una con fines de lucro y
                        otra sin fines de lucro, o una por cada práctico.
                    </p>
                </div>
                {!creating && <button type="button" className="aec-btn" onClick={() => setCreating(true)}><Plus size={15} aria-hidden /> Nueva empresa</button>}
            </header>

            {creating && <NewWorkspaceForm onCancel={() => setCreating(false)} />}

            <div className="emp-grid">
                {workspaces.map(ws => <WorkspaceCard key={`${ws.id}-${ws.name}-${ws.entityKind}`} ws={ws} active={ws.id === active.id} onChanged={refresh} />)}
            </div>

            <p className="emp-note" style={{ marginTop: 18 }}>
                Los datos se guardan en este navegador, separados por empresa. Para llevarlos a otra computadora usá
                Configuración → Copia de seguridad en cada empresa. Si borrás los datos del navegador, se pierden.
            </p>
        </div>
    )
}
