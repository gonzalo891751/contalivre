/**
 * Shared AmountInput — supports `=expr` mini-calculator.
 *
 * Type `=0.4*5227200` and press Enter or blur to evaluate.
 * Regular numbers work normally.
 */

import { useState } from 'react'
import { parseAmountExpression } from '../lib/amount-expression'

const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.select(), 0)
}

export default function AmountInput({
    value,
    onChange,
    className,
    placeholder,
    hintColor = 'text-blue-500',
}: {
    value: number
    onChange: (v: number) => void
    className?: string
    placeholder?: string
    hintColor?: string
}) {
    const [rawText, setRawText] = useState<string | null>(null)
    const [hint, setHint] = useState<string | null>(null)

    const displayValue = rawText !== null ? rawText : (value || '')

    const evaluate = (text: string) => {
        if (text.trim().startsWith('=')) {
            const result = parseAmountExpression(text)
            if (result.ok) {
                onChange(result.value)
                setRawText(null)
                setHint(`${result.expr} = ${result.value}`)
                setTimeout(() => setHint(null), 4000)
                return
            }
        }
        setRawText(null)
    }

    return (
        <div className="relative">
            <input
                type="text"
                inputMode="decimal"
                value={displayValue}
                onChange={(e) => {
                    const v = e.target.value
                    if (v.startsWith('=')) {
                        setRawText(v)
                    } else {
                        setRawText(null)
                        onChange(Number(v) || 0)
                    }
                }}
                onBlur={(e) => evaluate(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        evaluate((e.target as HTMLInputElement).value)
                    }
                }}
                onFocus={selectOnFocus}
                className={className}
                placeholder={placeholder || '0,00 o =expr'}
            />
            {hint && (
                <span className={`absolute right-1 -bottom-4 text-[9px] ${hintColor} font-mono whitespace-nowrap z-10`}>{hint}</span>
            )}
        </div>
    )
}
