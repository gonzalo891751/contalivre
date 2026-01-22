import { List } from '@phosphor-icons/react'
import { useScrollCompact } from '../../../hooks/useScrollCompact'
import { useDropdownManager } from '../../../hooks/useDropdownManager'
import HeaderLogo from './HeaderLogo'
import PeriodPicker from './PeriodPicker'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'

interface TopHeaderProps {
  onMobileMenuClick?: () => void
  isMobile: boolean
}

export default function TopHeader({ onMobileMenuClick, isMobile }: TopHeaderProps) {
  const { isCompact } = useScrollCompact(30)
  const { isOpen, toggle, close, registerRef } = useDropdownManager()

  return (
    <header
      id="main-header"
      className={`top-header ${isCompact ? 'compact' : ''}`}
    >
      {/* Left: Mobile Toggle + Logo */}
      <div className="header-left">
        {isMobile && (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onMobileMenuClick}
            aria-label="Abrir menu"
          >
            <List size={24} />
          </button>
        )}
        <HeaderLogo isCompact={isCompact} />
      </div>

      {/* Center-Right: Period Selector (Desktop only) */}
      {!isMobile && (
        <div className="header-center">
          <PeriodPicker
            isOpen={isOpen('period')}
            onToggle={() => toggle('period')}
            onClose={close}
            registerRef={registerRef}
          />
        </div>
      )}

      {/* Right: Actions */}
      <div className="header-right">
        <NotificationsBell
          isOpen={isOpen('notif')}
          onToggle={() => toggle('notif')}
          onClose={close}
          registerRef={registerRef}
        />
        <UserMenu
          isOpen={isOpen('user')}
          onToggle={() => toggle('user')}
          onClose={close}
          registerRef={registerRef}
        />
      </div>
    </header>
  )
}
