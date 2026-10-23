import React, { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONE_TOWN } from '../../data/towns'
import { SpriteIcon } from '../ui/SpriteIcon'
import { trackEvent } from '../../net/funnel'

// ── The first full bag ────────────────────────────────────────────────────────
//
// A new hero's bag fills around minute 9–12, and from then on nearly every drop is
// salvaged for a gold or two. The only places that said so were the combat log (hidden on
// a phone) and a line inside the inventory panel (which a new player has no reason to
// open). The funnel showed that same stretch, minutes 6–20, to be where players leave.
//
// So the first time it happens, say it once, plainly, and offer the fix: the town, where
// the loot sells for real gold and the outfitter sells more bag space. One answer per
// character, recorded in the save, whichever button is pressed.

export function BagFullTip() {
  const seen = useGameStore(s => s.bagFullTipSeen === true)
  const gameMode = useGameStore(s => s.gameMode)
  const isAlive = useGameStore(s => s.isAlive)
  const bagFull = useGameStore(s => s.inventory.length > 0 && s.inventory.every(Boolean))
  const questUp = useGameStore(s => !!s.activeQuest?.completed && !s.activeQuest.claimed)
  const hasTown = useGameStore(s => !!ZONE_TOWN[s.currentZone])
  const answer = useGameStore(s => s.answerBagFullTip)

  // Not over the quest toast (same spot on screen), and not mid-journey or in town.
  const show = !seen && bagFull && isAlive && !questUp
    && (gameMode === 'combat' || gameMode === 'gathering')

  useEffect(() => { if (show) trackEvent('bag_full') }, [show])
  if (!show) return null

  return (
    <div style={{ position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 'min(360px, 92vw)' }}>
      <div
        className="rp-panel"
        style={{ padding: '10px 12px', borderColor: 'var(--gold)', boxShadow: '0 8px 32px rgba(0,0,0,0.9), 0 0 16px rgba(255,215,0,0.15)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <SpriteIcon emoji="🎒" size={17} />
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold)' }}>
            Your bag is full
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#b8a070', lineHeight: 1.4, marginBottom: 10 }}>
          New loot is being scrapped for a gold or two. In town it sells for its real worth,
          and the outfitter sells more bag space.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasTown && (
            <button
              className="rp-button flex-1"
              style={{ fontSize: '0.75rem', background: 'linear-gradient(180deg, var(--wood-lit), #4a3518)' }}
              onClick={() => answer(true)}
            >
              Go to town
            </button>
          )}
          <button
            className="rp-button"
            style={{ fontSize: '0.75rem', color: hasTown ? '#a09080' : 'var(--gold-bright)', flex: hasTown ? undefined : 1 }}
            onClick={() => answer(false)}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
