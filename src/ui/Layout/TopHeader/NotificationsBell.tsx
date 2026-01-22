import { useRef, useCallback } from 'react'
import { Bell, CheckCircle } from '@phosphor-icons/react'
import { type DropdownId } from '../../../hooks/useDropdownManager'
import DropdownMenu from './DropdownMenu'

interface NotificationsBellProps {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  registerRef: (id: DropdownId, ref: HTMLElement | null) => void
}

export default function NotificationsBell({
  isOpen,
  onToggle,
  onClose,
  registerRef,
}: NotificationsBellProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (wrapperRef.current !== node) {
        registerRef('notif', node)
      }
      ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [registerRef]
  )

  // Sin notificaciones por ahora
  const notifications: unknown[] = []
  const hasUnread = notifications.length > 0

  return (
    <div ref={setRef} className="notifications-wrapper">
      <button
        type="button"
        className="notifications-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="notif-dropdown"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {hasUnread && <span className="notifications-badge" />}
      </button>

      <DropdownMenu
        id="notif-dropdown"
        isOpen={isOpen}
        onClose={onClose}
        align="right"
        className="notifications-dropdown"
      >
        <div className="notifications-dropdown-header">
          <h4>Notificaciones</h4>
        </div>
        <div className="notifications-empty">
          <CheckCircle size={32} weight="light" className="notifications-empty-icon" />
          <p className="notifications-empty-text">No tenés notificaciones nuevas</p>
        </div>
      </DropdownMenu>
    </div>
  )
}
