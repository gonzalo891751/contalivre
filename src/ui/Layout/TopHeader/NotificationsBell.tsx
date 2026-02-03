import { useRef, useCallback } from 'react'
import { Bell, CheckCircle, Clock, CalendarCheck, Eye, X } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { type DropdownId } from '../../../hooks/useDropdownManager'
import { useUpcomingTaxNotifications } from '../../../hooks/useTaxNotifications'
import { calculateDaysRemaining } from '../../../core/impuestos/types'
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
  const { notifications, unreadCount, markSeen, dismiss, markAllSeen } = useUpcomingTaxNotifications()

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (wrapperRef.current !== node) {
        registerRef('notif', node)
      }
      ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [registerRef]
  )

  const hasUnread = unreadCount > 0

  const handleMarkSeen = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await markSeen(id)
  }

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await dismiss(id)
  }

  const handleMarkAllSeen = async () => {
    await markAllSeen()
  }

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
          {hasUnread && (
            <button
              onClick={handleMarkAllSeen}
              className="text-xs text-blue-600 hover:underline"
            >
              Marcar todas como leidas
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="notifications-empty">
            <CheckCircle size={32} weight="light" className="notifications-empty-icon" />
            <p className="notifications-empty-text">No tenes notificaciones nuevas</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map(notif => {
              const daysRemaining = calculateDaysRemaining(notif.dueDate)
              const isOverdue = daysRemaining < 0
              const isUrgent = daysRemaining >= 0 && daysRemaining <= 5

              return (
                <div
                  key={notif.id}
                  className={`notification-item ${!notif.seen ? 'unread' : ''}`}
                >
                  <div className="notification-icon">
                    {isOverdue ? (
                      <Clock size={20} weight="duotone" className="text-red-500" />
                    ) : isUrgent ? (
                      <Clock size={20} weight="duotone" className="text-amber-500" />
                    ) : (
                      <CalendarCheck size={20} weight="duotone" className="text-blue-500" />
                    )}
                  </div>
                  <div className="notification-content">
                    <p className="notification-title">{notif.title}</p>
                    <p className="notification-description">{notif.description}</p>
                    <p className={`notification-due ${isOverdue ? 'text-red-500' : isUrgent ? 'text-amber-500' : 'text-slate-400'}`}>
                      {isOverdue
                        ? `Vencido hace ${Math.abs(daysRemaining)} dias`
                        : daysRemaining === 0
                        ? 'Vence hoy'
                        : `Vence en ${daysRemaining} dias`}
                    </p>
                  </div>
                  <div className="notification-actions">
                    {!notif.seen && (
                      <button
                        onClick={(e) => handleMarkSeen(notif.id, e)}
                        className="notification-action-btn"
                        title="Marcar como leida"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDismiss(notif.id, e)}
                      className="notification-action-btn"
                      title="Descartar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="notifications-dropdown-footer">
          <Link
            to="/operaciones/impuestos"
            onClick={onClose}
            className="notifications-view-all"
          >
            Ver todas las obligaciones
          </Link>
        </div>
      </DropdownMenu>

      <style>{`
        .notification-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          transition: background-color 0.15s;
        }
        .notification-item:hover {
          background-color: #f8fafc;
        }
        .notification-item.unread {
          background-color: #eff6ff;
        }
        .notification-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .notification-content {
          flex: 1;
          min-width: 0;
        }
        .notification-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 2px;
        }
        .notification-description {
          font-size: 12px;
          color: #64748b;
          margin: 0 0 4px;
        }
        .notification-due {
          font-size: 11px;
          font-weight: 500;
          margin: 0;
        }
        .notification-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .notification-action-btn {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .notification-action-btn:hover {
          background: #e2e8f0;
          color: #475569;
        }
        .notifications-list {
          max-height: 320px;
          overflow-y: auto;
        }
        .notifications-dropdown-footer {
          padding: 12px 16px;
          border-top: 1px solid #e2e8f0;
          text-align: center;
        }
        .notifications-view-all {
          font-size: 13px;
          font-weight: 500;
          color: #3b82f6;
          text-decoration: none;
        }
        .notifications-view-all:hover {
          text-decoration: underline;
        }
        .notifications-dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
      `}</style>
    </div>
  )
}
