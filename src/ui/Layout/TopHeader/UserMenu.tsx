import { useRef, useCallback } from 'react'
import { Gear, User, SignOut } from '@phosphor-icons/react'
import { type DropdownId } from '../../../hooks/useDropdownManager'
import DropdownMenu from './DropdownMenu'

interface UserMenuProps {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  registerRef: (id: DropdownId, ref: HTMLElement | null) => void
  user?: {
    name: string
    initials: string
    role: string
  }
}

const defaultUser = {
  name: 'Gonzalo M.',
  initials: 'GM',
  role: 'Admin',
}

export default function UserMenu({
  isOpen,
  onToggle,
  onClose,
  registerRef,
  user = defaultUser,
}: UserMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (wrapperRef.current !== node) {
        registerRef('user', node)
      }
      ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [registerRef]
  )

  return (
    <div ref={setRef} className="user-menu-wrapper">
      <button
        type="button"
        className="group flex items-center gap-3 px-2 py-1 rounded-xl transition-all duration-300 hover:bg-slate-800/50"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="user-dropdown"
      >
        {/* Text (Aligned Right) - Hidden on mobile */}
        <div className="hidden sm:flex flex-col items-end mr-1">
          <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
            {user.name}
          </span>
          <span className="text-[10px] font-mono text-slate-500 group-hover:text-blue-500 transition-colors uppercase">
            {user.role}
          </span>
        </div>

        {/* Avatar with Hover Glow */}
        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 font-semibold text-sm ring-2 ring-transparent group-hover:ring-blue-500/40 group-hover:shadow-glow transition-all duration-300">
          {user.initials}
        </div>
      </button>

      <DropdownMenu
        id="user-dropdown"
        isOpen={isOpen}
        onClose={onClose}
        align="right"
        className="user-dropdown"
      >
        <ul>
          <li>
            <a href="#">
              <Gear size={16} />
              Preferencias
            </a>
          </li>
          <li>
            <a href="#">
              <User size={16} />
              Mi Perfil
            </a>
          </li>
          <li className="user-dropdown-divider" />
          <li className="logout">
            <a href="#">
              <SignOut size={16} />
              Cerrar Sesion
            </a>
          </li>
        </ul>
      </DropdownMenu>
    </div>
  )
}
