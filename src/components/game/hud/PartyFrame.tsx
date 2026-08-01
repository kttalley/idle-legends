import React, { useSyncExternalStore } from 'react'
import {
  getCompanionStatus, getParty, leaveParty, subscribeCompanionStatus, subscribeParty,
} from '../../../engine/party'
import { useGameStore } from '../../../store/gameStore'

// The party frame — your companion, read out beneath your own unit frame, exactly where
// an MMO puts it.
//
// Two sources, deliberately: `getParty()` for WHO (stable membership) and
// `getCompanionStatus()` for WHAT THEY'RE DOING (published by the render adapter each
// behaviour tick). Membership lives in the party module and the body lives in the scene,
// so neither alone can render this.
//
// The health bar is real: while the companion is playing back a fight, it reflects the
// remaining health from that simulated fight. Between fights it sits full, because a
// companion's HP only exists inside a resolved fight — they are not carrying a persistent
// health pool around the world.

const TEXT_SHADOW = '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 1px 3px rgba(0,0,0,0.9)'

const ACTIVITY_COLOR: Record<string, string> = {
  following: '#8a8070',
  'moving in': '#c8a86a',
  fighting: '#ff9a6a',
  looting: '#7fbf7f',
  idle: '#8a8070',
}

export function PartyFrame() {
  const party = useSyncExternalStore(subscribeParty, getParty)
  const status = useSyncExternalStore(subscribeCompanionStatus, getCompanionStatus)
  const factionNames = useGameStore(s => s.factionNames)
  const playerFactionKey = useGameStore(s => s.playerFaction)
  const playerFaction = factionNames?.[playerFactionKey] ?? ''

  if (!party.length) return null
  const member = party[0]
  const speaker = member.speaker
  // Generated faction names differ per run, so compare against the player's actual one.
  const hostile = speaker.faction.trim().toLowerCase() !== playerFaction.trim().toLowerCase()
  const hp = status?.hpFrac ?? 1
  const activity = status?.activity ?? 'following'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      // A hairline above separates the party from your own frame without a second card.
      borderTop: '1px solid rgba(200,161,0,0.18)', paddingTop: 5, marginTop: 1,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 10, textShadow: TEXT_SHADOW, gap: 4,
      }}>
        <span style={{
          fontWeight: 700, color: hostile ? '#ff8a7a' : '#8ac0ff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {speaker.name}
        </span>
        <span style={{ color: '#9a8f7a', fontSize: 9, flex: '0 0 auto' }}>Lv {speaker.level}</span>
      </div>

      {/* Health. Flashes brighter on the frames right after they swing, so the frame
          reacts to their fight the way your own frame reacts to yours. */}
      <div style={{
        position: 'relative', height: 7, borderRadius: 2, overflow: 'hidden',
        background: 'rgba(8,6,14,0.7)',
        boxShadow: status?.attacking ? '0 0 4px rgba(255,200,90,0.7)' : 'none',
      }}>
        <div style={{
          height: '100%', width: `${Math.max(0, Math.min(1, hp)) * 100}%`,
          background: hp > 0.5
            ? 'linear-gradient(180deg, #6fd06f, #2f8a2f)'
            : hp > 0.25
              ? 'linear-gradient(180deg, #e8c860, #a88820)'
              : 'linear-gradient(180deg, #e86060, #a02020)',
          transition: 'width 0.25s linear',
        }} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 9, textShadow: TEXT_SHADOW, gap: 4,
      }}>
        <span style={{
          color: '#c8a86a', fontStyle: 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {speaker.spec ?? speaker.playerClass}
        </span>
        <span style={{ color: ACTIVITY_COLOR[activity] ?? '#8a8070', flex: '0 0 auto' }}>
          {activity}
        </span>
      </div>

      <button
        onClick={() => leaveParty(member.key)}
        title={`Remove ${speaker.name} from your party`}
        style={{
          alignSelf: 'flex-start', background: 'none', border: 'none', padding: '2px 0',
          color: '#6b6152', fontSize: 8.5, cursor: 'pointer', textShadow: TEXT_SHADOW,
        }}
      >leave party</button>
    </div>
  )
}
