import React, { useRef, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { CombatLogEntry } from '../../data/types'

const EVENT_COLORS: Partial<Record<CombatLogEntry['type'], string>> = {
  player_attack:  '#88aaff',
  player_crit:    '#ffcc00',
  mob_attack:     '#ff8888',
  player_death:   '#ff4444',
  player_respawn: '#aaaaff',
  mob_death:      '#ff6644',
  loot_item:      undefined, // color on the entry
  loot_gold:      '#ffd700',
  level_up:       '#ffd700',
  zone_change:    '#00ff88',
  boss_spawn:     '#ff8000',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}

export function CombatLog() {
  const log = useGameStore(s => s.combatLog)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [log.length])

  return (
    <div className="wow-panel flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      <div className="wow-panel-header">Combat Log</div>
      <div className="combat-log flex-1 p-1" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
        {log.map(entry => (
          <div
            key={entry.id}
            style={{
              color: entry.color ?? EVENT_COLORS[entry.type] ?? '#d4b896',
              padding: '1px 4px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            <span style={{ color: '#555', marginRight: 4, fontSize: '0.6rem' }}>
              {formatTime(entry.timestamp)}
            </span>
            {entry.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
