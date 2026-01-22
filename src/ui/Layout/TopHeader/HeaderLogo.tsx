import { Link } from 'react-router-dom'
import { Robot } from '@phosphor-icons/react'

interface HeaderLogoProps {
  isCompact: boolean
}

export default function HeaderLogo({ isCompact }: HeaderLogoProps) {
  return (
    <Link to="/" className="header-logo" aria-label="Ir a Inicio">
      <div className="header-logo-icon">
        <Robot size={24} weight="fill" color="white" />
      </div>
      <div className="header-logo-titles">
        <span className="header-logo-text">CONTALIVRE</span>
        <span
          className="header-logo-subtitle"
          style={{
            opacity: isCompact ? 0 : 1,
            height: isCompact ? 0 : 'auto',
            marginTop: isCompact ? 0 : '0.25rem',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
          }}
        >
          Tu asistente contable
        </span>
      </div>
    </Link>
  )
}
