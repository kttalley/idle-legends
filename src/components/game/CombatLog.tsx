import React, { useRef, useEffect, useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { CombatLogEntry } from '../../data/types'

// The other half of the log slot. COMBAT and CHAT are two tabs on one panel, so they are
// built the same way: a header-less feed that fills the container, oldest at the top,
// newest at the bottom, auto-following the tail.
//
// Two things used to make this read as a different component bolted into the same box:
//
//   • It nested an `rp-panel` with its own "Combat Log" header INSIDE a panel whose tab
//     strip already said COMBAT — a title for a thing the label above it had just named.
//   • The feed was `column-reverse` over an oldest→newest array, so the newest line
//     appeared at the TOP and the list grew upward, the opposite of chat. The
//     `bottomRef` sentinel is the last child, which under `column-reverse` sits at the
//     visual top — so "scroll to latest" scrolled away from where new lines arrive.
//     Dropping the reverse fixes the order and the scroll anchor together.

const EVENT_COLORS: Partial<Record<CombatLogEntry['type'], string>> = {
  player_attack:  '#88aaff',
  player_crit:    '#ffcc00',
  mob_attack:     '#ff8888',
  player_death:   'var(--danger)',
  player_respawn: '#aaaaff',
  mob_death:      '#ff6644',
  loot_item:      undefined, // color on the entry
  loot_gold:      'var(--gold)',
  level_up:       'var(--gold)',
  zone_change:    '#00ff88',
  boss_spawn:     'var(--warn)',
}

/** Events worth a raised row rather than a plain line — the ones you scroll back to find. */
const NOTABLE: Partial<Record<CombatLogEntry['type'], true>> = {
  level_up: true, boss_spawn: true, zone_change: true,
  loot_item: true, player_death: true,
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function CombatLog() {
  const log = useGameStore(s => s.combatLog)
  const bottomRef = useRef<HTMLDivElement>(null)

  // The store keeps this newest-FIRST — every writer does `[...newLogs, ...state.combatLog]`
  // so that `.slice(0, LOG_MAX)` drops the oldest — which is what the old `column-reverse`
  // was really compensating for. Sorting by timestamp here is the honest version: ascending
  // puts the oldest at the top, and because `sort` is stable and a whole batch shares one
  // `Date.now()`, the order WITHIN a tick's batch survives (a plain `.reverse()` would flip
  // it, so a killing blow would print before the hit that landed it).
  const ordered = useMemo(
    () => [...log].sort((a, b) => a.timestamp - b.timestamp),
    [log],
  )

  // Follow the tail, exactly as ChatPanel does.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [log.length])

  return (
    <div className="combat-log">
      {ordered.length === 0 && (
        <div className="combat-log-empty">Nothing has happened yet.</div>
      )}
      {ordered.map(entry => (
        <div
          key={entry.id}
          className={`combat-line${NOTABLE[entry.type] ? ' combat-line-notable' : ''}`}
          style={{ color: entry.color ?? EVENT_COLORS[entry.type] ?? 'var(--parchment)' }}
        >
          <span className="combat-line-time">{formatTime(entry.timestamp)}</span>
          <span>{entry.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
