
/**
 * SegmentedTabs - Premium segmented control component
 * Features:
 * - Sliding pill animation with CSS transform
 * - Blue→Green gradient for active state
 * - Hover glow effect
 * - Keyboard accessible with focus ring
 * - Responsive design
 * - Centered text with Flexbox
 */
import { useId } from 'react'

interface SegmentedOption {
    value: string
    label: string
}

interface SegmentedTabsProps {
    options: SegmentedOption[]
    value: string
    onChange: (value: string) => void
    className?: string
}

export default function SegmentedTabs({
    options,
    value,
    onChange,
    className = ''
}: SegmentedTabsProps) {
    const id = useId()
    const activeIndex = options.findIndex(opt => opt.value === value)

    return (
        <div
            className={`segmented-tabs-container ${className}`}
            role="radiogroup"
            aria-label="View mode"
        >
            <div className="segmented-tabs-wrapper">
                {/* Sliding pill background */}
                <div
                    className="segmented-tabs-pill"
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
                        className={`segmented-tabs-option ${value === option.value ? 'active' : ''}`}
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
                        <span className="truncate px-2">{option.label}</span>
                    </button>
                ))}
            </div>

            <style>{`
        .segmented-tabs-container {
          width: 100%;
          max-width: 480px; /* Slightly wider for better text fit */
          margin: 0 auto;
        }

        .segmented-tabs-wrapper {
          display: flex;
          position: relative;
          background: rgba(241, 245, 249, 0.8); /* Slate 100 soft */
          backdrop-filter: blur(8px);
          border-radius: 9999px;
          padding: 4px;
          border: 1px solid rgba(203, 213, 225, 0.6); /* Slate 300 soft */
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
          width: 100%;
          height: 48px; /* Fixed height for consistency */
        }

        .segmented-tabs-pill {
          position: absolute;
          top: 4px;
          bottom: 4px;
          left: 4px;
          background: linear-gradient(135deg, #0ea5e9 0%, #10b981 100%); /* Sky to Emerald */
          border-radius: 9999px;
          box-shadow: 
            0 2px 8px rgba(14, 165, 233, 0.25),
            0 1px 2px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); /* Eloquent ease */
          z-index: 1;
        }

        .segmented-tabs-option {
          flex: 1;
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          padding: 0;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          color: #64748b; /* Slate 500 */
          transition: color 0.2s ease;
          border-radius: 9999px;
          outline: none;
        }

        .segmented-tabs-option:hover:not(.active) {
          color: #1e293b; /* Slate 800 */
          background-color: rgba(255,255,255,0.4); 
          transform: translateY(-0.5px);
        }

        .segmented-tabs-option:focus-visible {
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.5);
        }

        .segmented-tabs-option.active {
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        @media (max-width: 640px) {
            .segmented-tabs-wrapper {
                height: 44px;
            }
            .segmented-tabs-option {
                font-size: 0.8rem;
            }
        }
      `}</style>
        </div>
    )
}
