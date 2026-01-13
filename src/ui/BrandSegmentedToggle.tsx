/**
 * BrandSegmentedToggle - Premium segmented control component
 * Features:
 * - Sliding pill animation with CSS transform
 * - Blue→Green gradient for active state
 * - Hover glow effect
 * - Keyboard accessible with focus ring
 * - Responsive design
 */
import { useId } from 'react'

interface SegmentedOption {
  value: string
  label: string
}

interface BrandSegmentedToggleProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function BrandSegmentedToggle({
  options,
  value,
  onChange,
  className = ''
}: BrandSegmentedToggleProps) {
  const id = useId()
  const activeIndex = options.findIndex(opt => opt.value === value)

  return (
    <div
      className={`brand-segmented-toggle ${className}`}
      role="radiogroup"
      aria-label="View mode"
    >
      {/* Sliding pill background */}
      <div
        className="brand-segmented-pill"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
          width: `${100 / options.length}%`
        }}
        aria-hidden="true"
      />

      {/* Option buttons */}
      {options.map((option, index) => (
        <button
          key={option.value}
          id={`${id}-${option.value}`}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`brand-segmented-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
          tabIndex={value === option.value ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              const nextIndex = (index + 1) % options.length
              onChange(options[nextIndex].value)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              const prevIndex = (index - 1 + options.length) % options.length
              onChange(options[prevIndex].value)
            }
          }}
        >
          {option.label}
        </button>
      ))}

      <style>{`
        .brand-segmented-toggle {
          display: inline-flex;
          position: relative;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 9999px;
          padding: 4px;
          border: 1px solid rgba(209, 224, 235, 0.8);
          box-shadow: 0 1px 3px rgba(10, 31, 72, 0.06);
          width: 100%;
          max-width: 380px;
        }

        .brand-segmented-toggle:hover {
          box-shadow: 
            0 1px 3px rgba(10, 31, 72, 0.06),
            0 0 20px rgba(64, 148, 218, 0.15);
        }

        .brand-segmented-pill {
          position: absolute;
          top: 4px;
          bottom: 4px;
          left: 4px;
          background: linear-gradient(135deg, #4094DA 0%, #5CA690 100%);
          border-radius: 9999px;
          box-shadow: 
            0 4px 12px rgba(64, 148, 218, 0.35),
            0 2px 4px rgba(10, 31, 72, 0.1);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1;
        }

        .brand-segmented-option {
          flex: 1;
          position: relative;
          z-index: 2;
          border: none;
          background: transparent;
          padding: 10px 20px;
          font-size: 0.95rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          text-align: center;
          color: #4a6380;
          transition: color 0.25s ease;
          border-radius: 9999px;
          white-space: nowrap;
        }

        .brand-segmented-option:hover:not(.active) {
          color: #0A1F48;
        }

        .brand-segmented-option:focus-visible {
          outline: 2px solid #4094DA;
          outline-offset: 2px;
        }

        .brand-segmented-option.active {
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
        }

        /* Responsive */
        @media (max-width: 480px) {
          .brand-segmented-toggle {
            max-width: 100%;
          }
          
          .brand-segmented-option {
            padding: 8px 12px;
            font-size: 0.85rem;
          }
        }
      `}</style>
    </div>
  )
}
