/**
 * BrandSwitch - Premium toggle switch component
 * Features:
 * - Animated thumb with translate-x transition
 * - Track color: gray (OFF) → blue-green gradient (ON)
 * - Glow effect when ON
 * - Springy animation with cubic-bezier
 * - Clickable label
 * - Accessible: role="switch", aria-checked, focus ring
 */
import { useId } from 'react'

interface BrandSwitchProps {
    label: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    id?: string
    className?: string
}

export default function BrandSwitch({
    label,
    checked,
    onCheckedChange,
    id: providedId,
    className = ''
}: BrandSwitchProps) {
    const autoId = useId()
    const id = providedId || autoId

    return (
        <label
            htmlFor={id}
            className={`brand-switch ${checked ? 'on' : ''} ${className}`}
        >
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                className="brand-switch-track"
                onClick={() => onCheckedChange(!checked)}
                onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        onCheckedChange(!checked)
                    }
                }}
            >
                <span className="brand-switch-thumb" aria-hidden="true" />
            </button>
            <span className="brand-switch-label">{label}</span>

            <style>{`
        .brand-switch {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
        }

        .brand-switch-track {
          position: relative;
          width: 44px;
          height: 24px;
          background: #d1e0eb;
          border: none;
          border-radius: 9999px;
          cursor: pointer;
          transition: 
            background 0.25s ease,
            box-shadow 0.25s ease;
          padding: 0;
          flex-shrink: 0;
        }

        .brand-switch-track:focus-visible {
          outline: 2px solid #4094DA;
          outline-offset: 2px;
        }

        .brand-switch-track:hover {
          background: #c1d5e5;
        }

        .brand-switch.on .brand-switch-track {
          background: linear-gradient(135deg, #4094DA 0%, #5CA690 100%);
          box-shadow: 0 0 16px rgba(92, 166, 144, 0.4);
        }

        .brand-switch.on .brand-switch-track:hover {
          box-shadow: 0 0 20px rgba(92, 166, 144, 0.55);
        }

        .brand-switch-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(10, 31, 72, 0.15);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .brand-switch.on .brand-switch-thumb {
          transform: translateX(20px);
        }

        .brand-switch-label {
          font-size: 0.9rem;
          color: #4a6380;
          transition: color 0.2s ease;
        }

        .brand-switch:hover .brand-switch-label {
          color: #0A1F48;
        }

        .brand-switch.on .brand-switch-label {
          color: #0A1F48;
          font-weight: 500;
        }
      `}</style>
        </label>
    )
}
