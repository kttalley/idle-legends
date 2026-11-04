import React, { useState } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { ZONES } from '../../../data/zones'
import { isZoneQuestComplete } from '../../../engine/zoneProgression'
import { SpriteIcon } from '../../ui/SpriteIcon'
import { DAILY_BOUNTY_KILLS } from '../../../data/constants'

// The objective tracker — what the player is supposed to be doing, while they are doing it.
//
// `activeQuest` has been in the store since zone progression shipped, and until now it was
// rendered in exactly one place: `QuestToast`, which gates on `completed && !claimed`. So
// the game stated its objective only at the moment that objective stopped being one. A
// new player watched an idle game with no stated goal for their entire first session and
// then got congratulated for reaching a goal nobody had mentioned.
//
// Top-right under the minimap, which is where two decades of this genre have trained
// people to look for it. Collapsible, because a tracker you cannot shut up becomes clutter
// once you know the loop — and the collapsed state persists, so the veteran is not
// re-dismissing it every session.
//
// Click-through everywhere except its own header: `.hud-layer` is pointer-events:none so
// the world stays tappable underneath, and this claims back only the toggle.

const STORE_KEY = 'idle_legends_tracker_collapsed'

function loadCollapsed(): boolean {
  try { return localStorage.getItem(STORE_KEY) === '1' } catch { return false }
}

export function ObjectiveTracker() {
  const activeQuest = useGameStore(s => s.activeQuest)
  const totalZoneKills = useGameStore(s => s.totalZoneKills)
  const bossesDefeated = useGameStore(s => s.bossesDefeated)
  const generatedZoneNames = useGameStore(s => s.generatedZoneNames)
  const level = useGameStore(s => s.level)
  const gameMode = useGameStore(s => s.gameMode)
  const bounty = useGameStore(s => s.dailyBounty)

  const [collapsed, setCollapsed] = useState(loadCollapsed)

  // Nothing to track once it is done — `QuestToast` owns the completion moment, and two
  // surfaces claiming the same beat would just talk over each other.
  //
  // Completion is RECOMPUTED from the engine's predicate rather than read off
  // `activeQuest.completed`. The flag is a cache written when the killing blow lands, and
  // it is only as good as that one write: a save whose boss was already down when the
  // quest was minted, or any future path that grants a boss kill without going through
  // that branch, leaves the flag false forever. The tracker then sits there asking for a
  // boss that is already dead — and it would be contradicting itself on screen, since the
  // tick below reads `bossesDefeated` directly. One source of truth for both.
  if (!activeQuest) return null
  if (isZoneQuestComplete(activeQuest, totalZoneKills, bossesDefeated)) return null
  // In town or mid-journey the objective is not actionable, and the mode panel already
  // owns that part of the screen.
  if (gameMode === 'in_town' || gameMode === 'traveling') return null

  const zone = ZONES[activeQuest.zoneId]
  const zoneName = generatedZoneNames[activeQuest.zoneId] ?? zone?.name ?? activeQuest.zoneId
  const kills = totalZoneKills[activeQuest.zoneId] ?? 0
  const killsDone = Math.min(kills, activeQuest.killsReq)
  const killsMet = kills >= activeQuest.killsReq
  const bossDown = bossesDefeated.includes(activeQuest.zoneId)
  const bossName = zone?.mobs.find(m => m.id === activeQuest.bossId)?.name ?? 'the boss'
  const underLevelled = level < activeQuest.levelReq

  const toggle = () => setCollapsed(prev => {
    const next = !prev
    try { localStorage.setItem(STORE_KEY, next ? '1' : '0') } catch { /* private mode */ }
    return next
  })

  return (
    <div className="objective-tracker">
      <button
        type="button"
        className="objective-tracker-head"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show objectives' : 'Hide objectives'}
      >
        <span className={`objective-chevron${collapsed ? ' is-collapsed' : ''}`} aria-hidden>▾</span>
        {/* Built from the GENERATED zone name rather than `activeQuest.title`, which was
            baked from the static name when the quest was minted and drifts once the world
            renames a zone. Also the reason there is no separate zone line under this: the
            title already says it, the minimap says it directly above, and three copies of
            "Sunhollow Meadows" in one corner is how the title ended up truncated. */}
        <span className="objective-title">Clear {zoneName}</span>
      </button>

      {!collapsed && (
        <div className="objective-body">
          {/* Objective one: thin the zone out. The bar is the honest read — "38 / 50" is a
              number you have to do arithmetic on to feel. */}
          <div className={`objective-row${killsMet ? ' is-done' : ''}`}>
            <span className="objective-tick" aria-hidden>{killsMet ? '✓' : '•'}</span>
            <span className="objective-text">Slay {activeQuest.killsReq} in the region</span>
            <span className="objective-count">{killsDone}/{activeQuest.killsReq}</span>
          </div>
          <div className="objective-meter" aria-hidden>
            <i style={{ width: `${(killsDone / Math.max(1, activeQuest.killsReq)) * 100}%` }} />
          </div>

          {/* Objective two, gated on the first — stated up front rather than revealed, so
              the player can see the shape of the whole zone from minute one. */}
          <div className={`objective-row${bossDown ? ' is-done' : killsMet ? '' : ' is-locked'}`}>
            <span className="objective-tick" aria-hidden>
              {bossDown ? '✓' : killsMet ? <SpriteIcon ui="warn" size={10} /> : '•'}
            </span>
            <span className="objective-text">Defeat {bossName}</span>
            {killsMet && !bossDown && <span className="objective-count is-ready">ready</span>}
          </div>

          {/* The daily bounty: same rows, so it reads as one more thing to do here rather
              than a separate system to learn. A stale day reads as a fresh bounty. */}
          {(() => {
            const d = new Date()
            const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const b = bounty?.day === today ? bounty : { progress: 0, done: false }
            const n = Math.min(b.progress, DAILY_BOUNTY_KILLS)
            return (
              <>
                <div className={`objective-row${b.done ? ' is-done' : ''}`}>
                  <span className="objective-tick" aria-hidden>{b.done ? '✓' : '★'}</span>
                  <span className="objective-text" title="Every day, your first kills earn a gold purse and a rare-or-better item">Daily bounty</span>
                  <span className="objective-count">{b.done ? 'done' : `${n}/${DAILY_BOUNTY_KILLS}`}</span>
                </div>
                {!b.done && (
                  <div className="objective-meter" aria-hidden>
                    <i style={{ width: `${(n / DAILY_BOUNTY_KILLS) * 100}%` }} />
                  </div>
                )}
              </>
            )
          })()}

          {underLevelled && (
            <div className="objective-warn">
              <SpriteIcon ui="warn" size={10} /> Level {activeQuest.levelReq} recommended
            </div>
          )}
        </div>
      )}
    </div>
  )
}
