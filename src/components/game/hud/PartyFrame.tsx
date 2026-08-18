import React, { useSyncExternalStore } from 'react'
import { factionNameColor } from '../../../data/factions'
import {
  getCompanionStatuses, getParty, leaveParty, subscribeCompanionStatus, subscribeParty,
} from '../../../engine/party'
import { useGameStore } from '../../../store/gameStore'

// The party frame — your companions, read out beneath your own unit frame, exactly where
// an MMO puts it.
//
// THREE sources, and each owns something the others cannot see:
//   • `getParty()`            — WHO is in the party. Membership, stable, party order.
//   • `GameState.allies`      — their real HEALTH and whether they are down. Party members
//                               deal and take real damage, so this is authoritative.
//   • `getCompanionStatuses()`— WHAT THEY ARE DOING, published by the render adapter each
//                               behaviour tick. The store has no idea whether a body is
//                               walking, closing or swinging.
//
// The health bar used to come from the adapter too, scraped out of the ambient fight log
// a companion was playing back — because back then a companion's HP only existed inside a
// simulated fight and sat full the rest of the time. That is no longer true, and reading
// it from the store is what makes the bar mean something: when it empties, they go down.
//
// Renders every member. It previously rendered `party[0]` only, so the second and third
// members were invisible even after C4 made the roster plural.

const TEXT_SHADOW = '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 1px 3px rgba(0,0,0,0.9)'

const ACTIVITY_COLOR: Record<string, string> = {
  following: 'var(--muted-warm)',
  'moving in': '#c8a86a',
  fighting: '#ff9a6a',
  looting: '#7fbf7f',
  idle: 'var(--muted-warm)',
}

function hpGradient(frac: number): string {
  if (frac > 0.5) return 'linear-gradient(180deg, #6fd06f, #2f8a2f)'
  if (frac > 0.25) return 'linear-gradient(180deg, #e8c860, #a88820)'
  return 'linear-gradient(180deg, #e86060, #a02020)'
}

export function PartyFrame() {
  const party = useSyncExternalStore(subscribeParty, getParty)
  const statuses = useSyncExternalStore(subscribeCompanionStatus, getCompanionStatuses)
  const allies = useGameStore(s => s.allies)
  const factionNames = useGameStore(s => s.factionNames)
  const playerFactionKey = useGameStore(s => s.playerFaction)
  const playerFaction = factionNames?.[playerFactionKey] ?? ''

  if (!party.length) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      // A hairline above separates the party from your own frame without a second card.
      borderTop: '1px solid rgba(200,161,0,0.18)', paddingTop: 5, marginTop: 1,
    }}>
      {party.map(member => {
        const speaker = member.speaker
        const status = statuses[member.key]
        // Combat state is keyed by the same party key the store joins on.
        const ally = allies.find(a => a.key === member.key)
        const downed = !!ally && ally.downedFor > 0
        // No ally record yet means the tick has not reconciled them — full rather than
        // empty, so a just-joined member does not flash up as a corpse.
        const hp = ally ? Math.max(0, Math.min(1, ally.currentHp / Math.max(1, ally.stats.maxHp))) : 1
        // A party member is ALWAYS your own faction now — `joinParty` refuses anyone else
        // — so this is no longer a hostility read. It is the same global rule as
        // everywhere else: colour the name by whose banner they carry.
        const activity = downed ? 'down' : (status?.activity ?? 'following')

        return (
          <div key={member.key} style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            // The whole frame dims while they are down — one read for "this one is out"
            // that does not depend on noticing an empty bar.
            opacity: downed ? 0.45 : 1,
            filter: downed ? 'saturate(0.35)' : 'none',
            transition: 'opacity 0.2s linear',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              fontSize: 10, textShadow: TEXT_SHADOW, gap: 4,
            }}>
              <span style={{
                fontWeight: 700, color: factionNameColor(speaker.faction),
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {speaker.name}
              </span>
              <span style={{ color: '#9a8f7a', fontSize: 9, flex: '0 0 auto' }}>Lv {speaker.level}</span>
              {/* Dismiss sits ON the name row rather than as its own "leave party" line.
                  With one member that row cost nothing; at PARTY_MAX it cost ~17px × 3,
                  and measurement put the third frame 39px INTO `.hud-bottom` on a 360px-tall
                  landscape phone. `.hud-tl` is capped and clipped, so that collision would
                  not have clipped — it would just have drawn over the action bar. */}
              <button
                onClick={() => leaveParty(member.key)}
                title={`Remove ${speaker.name} from your party`}
                aria-label={`Remove ${speaker.name} from your party`}
                style={{
                  // pointerEvents: see UnitFrames — .hud-layer is click-through, so a
                  // control that does not re-enable them is inert. This one never worked.
                  background: 'none', border: 'none', padding: '0 0 0 4px', margin: 0,
                  color: '#6b6152', fontSize: 11, lineHeight: 1, cursor: 'pointer',
                  textShadow: TEXT_SHADOW, pointerEvents: 'auto', flex: '0 0 auto',
                }}
              >×</button>
            </div>

            {/* Health. Real, from the store. Flashes on the frames right after they swing,
                so the frame reacts to their fight the way your own reacts to yours. */}
            <div style={{
              position: 'relative', height: 7, borderRadius: 2, overflow: 'hidden',
              background: 'rgba(8,6,14,0.7)',
              boxShadow: status?.attacking && !downed ? '0 0 4px rgba(255,200,90,0.7)' : 'none',
            }}>
              <div style={{
                height: '100%', width: `${hp * 100}%`,
                background: hpGradient(hp),
                transition: 'width 0.25s linear',
              }} />
              {downed && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 7.5, letterSpacing: 0.5, color: '#ffb0b0',
                  textShadow: TEXT_SHADOW, pointerEvents: 'none',
                }}>
                  {/* Counting up to the rejoin is the difference between "they are dead"
                      and "they are coming back" — the second is what is actually true. */}
                  {`▲ ${Math.ceil(ally!.downedFor)}s`}
                </div>
              )}
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
              <span style={{
                color: downed ? '#e08080' : (ACTIVITY_COLOR[activity] ?? 'var(--muted-warm)'),
                flex: '0 0 auto',
              }}>
                {activity}
              </span>
            </div>

          </div>
        )
      })}
    </div>
  )
}
