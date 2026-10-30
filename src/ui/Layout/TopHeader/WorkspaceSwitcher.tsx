/**
 * Selector de empresa de práctica en el encabezado. Muestra la empresa abierta
 * y permite pasar a otra (recarga la app sobre la base de esa empresa).
 */

import { useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Buildings, CaretDown, Check, Plus } from '@phosphor-icons/react'
import { type DropdownId } from '../../../hooks/useDropdownManager'
import { activateWorkspace, getActiveWorkspace, listWorkspaces, ENTITY_KIND_LABEL } from '../../../storage/workspaces'

interface Props {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  registerRef: (id: DropdownId, ref: HTMLElement | null) => void
}

export default function WorkspaceSwitcher({ isOpen, onToggle, onClose, registerRef }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const setRef = useCallback((node: HTMLDivElement | null) => {
    if (wrapperRef.current !== node) registerRef('workspace', node)
    wrapperRef.current = node
  }, [registerRef])

  const active = getActiveWorkspace()
  const workspaces = isOpen ? listWorkspaces() : []

  const open = (id: string) => {
    onClose()
    if (id === active.id) return
    activateWorkspace(id)
    window.location.assign('/')
  }

  return (
    <div ref={setRef} className="ws-switcher">
      <button
        type="button"
        className="ws-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={`Empresa abierta: ${active.name} (${ENTITY_KIND_LABEL[active.entityKind].toLowerCase()})`}
      >
        <Buildings size={16} weight="duotone" aria-hidden />
        <span className="ws-trigger-name">{active.name}</span>
        <CaretDown size={12} aria-hidden />
      </button>
      {isOpen && (
        <div className="ws-menu" role="menu">
          <div className="ws-menu-title">Empresas de práctica</div>
          {workspaces.map(ws => (
            <button key={ws.id} type="button" role="menuitem" className={`ws-item${ws.id === active.id ? ' is-active' : ''}`} onClick={() => open(ws.id)}>
              <span className="ws-item-name">{ws.name}</span>
              {ws.id === active.id ? <Check size={14} aria-hidden /> : <span className="emp-badge">{ws.entityKind === 'SIN_FINES_DE_LUCRO' ? 'Sin fines de lucro' : 'Con fines de lucro'}</span>}
            </button>
          ))}
          <div className="ws-sep" />
          <Link to="/empresas" className="ws-item" role="menuitem" onClick={onClose}>
            <span className="ws-item-name"><Plus size={14} aria-hidden /> Crear o administrar empresas</span>
          </Link>
        </div>
      )}
    </div>
  )
}
