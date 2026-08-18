import React, { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { SpriteIcon } from '../ui/SpriteIcon'

// ── The level-up moment ───────────────────────────────────────────────────────
// Levelling used to announce itself with one line in the combat feed — a feed that is
// also carrying every swing of the fight, and which on a phone is a sheet you have to
// open first. The single most important progression beat in an idle game was, in
// practice, invisible.
//
// Same contract as the craft reveal (CraftResultToast): the store records the moment,
// this shows it once in the centre of the screen, and it expires on its own. Tapping it
// dismisses early. It never blocks play — an idle player must be able to walk away
// mid-level and come back to a running game, not a modal.

const DISMISS_MS = 5000

export function LevelUpToast() {
  const event = useGameStore(s => s.lastLevelUp)
  const dismiss = useGameStore(s => s.dismissLevelUp)

  useEffect(() => {
    if (!event) return
    const t = setTimeout(dismiss, DISMISS_MS)
    return () => clearTimeout(t)
  }, [event?.id, dismiss]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return null

  return (
    <div className="levelup-toast" onClick={dismiss} role="status">
      <div className="levelup-eyebrow">
        <SpriteIcon emoji="✦" size={13} />
        <span>Level Up</span>
        <SpriteIcon emoji="✦" size={13} />
      </div>
      <div className="levelup-headline">You leveled up!</div>
      <div className="levelup-level">
        <span className="levelup-level-word">Level</span>
        <span className="levelup-level-num">{event.level}</span>
      </div>
      {/* What actually changed. Three quiet lines rather than a wall: the number is the
          headline, these are the receipts. */}
      <div className="levelup-gains">
        {event.maxHpGain > 0 && (
          <div className="levelup-gain">+{event.maxHpGain} max health</div>
        )}
        {event.talentPoint && (
          <div className="levelup-gain is-lit">A talent point to spend</div>
        )}
        {event.unlockedAbilities.map(name => (
          <div key={name} className="levelup-gain is-lit">{name} unlocked</div>
        ))}
      </div>
    </div>
  )
}
