import React from 'react'
import type { ActiveDoT, ActiveBuff } from '../../data/types'

interface StatusChip {
  key: string
  icon: string
  label: string
  color: string
  sub: string   // ticks remaining or duration
}

function buildDotChips(dots: ActiveDoT[]): StatusChip[] {
  return dots.map(d => ({
    key: d.id,
    icon: d.icon,
    label: d.label,
    color: d.color,
    sub: `${d.ticksRemaining}t`,
  }))
}

function buildBuffChips(buffs: ActiveBuff[]): StatusChip[] {
  return buffs.map(b => ({
    key: b.id,
    icon: b.icon,
    label: b.label,
    color: b.color,
    sub: b.stacks != null && b.stacks > 1
      ? `x${b.stacks}`
      : `${Math.ceil(b.durationRemaining)}s`,
  }))
}

interface Props {
  dots?: ActiveDoT[]
  buffs?: ActiveBuff[]
}

export function StatusEffects({ dots = [], buffs = [] }: Props) {
  const chips: StatusChip[] = [
    ...buildDotChips(dots),
    ...buildBuffChips(buffs),
  ]

  if (chips.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-1 justify-center"
      style={{ minHeight: 20 }}
    >
      {chips.map(chip => (
        <div
          key={chip.key}
          title={chip.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: `${chip.color}22`,
            border: `1px solid ${chip.color}99`,
            borderRadius: 4,
            padding: '1px 4px',
            fontSize: '0.6rem',
            color: chip.color,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>{chip.icon}</span>
          <span style={{ color: '#ccc' }}>{chip.sub}</span>
        </div>
      ))}
    </div>
  )
}
