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
  /** Chips shown before collapsing the rest into a +N. */
  max?: number
}

/**
 * How many chips fit before the column stops being readable.
 *
 * Four is not arbitrary: the unit frame sits top-left over the world, and a warrior
 * stacking Battle Cry, Hold the Line and a multi-stack Red Harvest routinely produced six
 * or seven wrapped rows marching down over the map. Past about four the stack stops being
 * a status readout and becomes an occlusion — and the ones that matter (the freshest) are
 * the ones pushed furthest from the health bar they belong to.
 */
const DEFAULT_MAX = 4

/**
 * Buff / debuff chips.
 *
 * The name used to live only in a `title`, so on a phone these read as an emoji next to a
 * number — you could see that something was ticking but not what. The fix is to show the
 * label rather than to add a gesture: information a player needs at a glance should not be
 * behind an interaction at all, on any device. Short labels ("Rend", "Poison") and the
 * existing wrap make room for it, and `title` stays for the fuller hover on desktop.
 */
export function StatusEffects({ dots = [], buffs = [], max = DEFAULT_MAX }: Props) {
  const chips: StatusChip[] = [
    ...buildDotChips(dots),
    ...buildBuffChips(buffs),
  ]

  if (chips.length === 0) return null

  // Keep the FIRST `max`, not the last. DoTs are built before buffs and both arrive in
  // application order, so the head of the list is the longest-running effect — the one
  // whose expiry the player is actually waiting on. Dropping the tail also keeps the
  // visible chips from reshuffling every time a short buff refreshes.
  const shown = chips.slice(0, max)
  const overflow = chips.length - shown.length

  return (
    <div
      className="flex flex-wrap gap-1 justify-center"
      style={{ minHeight: 20 }}
    >
      {shown.map(chip => (
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
            fontSize: '0.75rem',
            color: chip.color,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>{chip.icon}</span>
          <span style={{
            maxWidth: 62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {chip.label}
          </span>
          <span style={{ color: '#ccc' }}>{chip.sub}</span>
        </div>
      ))}
      {overflow > 0 && (
        <div
          // The hidden ones are still named here, so nothing becomes unknowable — it just
          // stops taking up the map.
          title={chips.slice(max).map(c => `${c.label} ${c.sub}`).join('\n')}
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid rgba(206,170,90,0.45)',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 4,
            padding: '1px 5px',
            fontSize: '0.75rem',
            lineHeight: 1.2,
            color: 'var(--gold-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
