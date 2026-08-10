import React from 'react'

interface HealthBarProps {
  current: number
  max: number
  type?: 'hp' | 'xp' | 'mob-hp'
  showText?: boolean
  height?: number
  label?: string
}

export function HealthBar({ current, max, type = 'hp', showText = true, height = 14, label }: HealthBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0
  const barClass = type === 'hp' ? 'bar-hp' : type === 'xp' ? 'bar-xp' : 'bar-mob-hp'

  return (
    <div className="relative" style={{ height }}>
      <div className="bar-track w-full h-full">
        <div
          className={`bar-fill ${barClass}`}
          style={{ width: `${pct * 100}%`, height: '100%' }}
        />
      </div>
      {showText && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            fontSize: Math.max(9, height - 4),
            // Was `monospace`, which resolves to Courier on macOS/iOS — thin, wide and
            // low-contrast over a filled bar. The UI face with tabular figures keeps the
            // digits in fixed columns (the only reason mono was here) and reads far
            // better at 9–14px.
            fontFamily: 'var(--font-ui)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            color: type === 'xp' ? 'var(--gold)' : 'rgba(255,255,255,0.9)',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
            letterSpacing: 0,
          }}
        >
          {label ?? `${current} / ${max}`}
        </div>
      )}
    </div>
  )
}
