import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { GoldDisplay } from '../ui/GoldDisplay'
import { WardrobePanel } from './WardrobePanel'
import { LadderModal } from './LadderPanel'

// Account-level navigation for the left rail: what you own, how you look, who else is out
// there.
//
// These lived in the CHARACTER SHEET's header, competing for width with a generated hero
// name that is routinely two words longer than the rail is wide. None of them is a
// character-sheet control — gold is a global resource, and the others leave the sheet
// entirely — so they get their own strip at the top of the column instead.
//
// **"Heroes" was removed 2026-08-09.** It read as navigation sitting between two other
// navigation buttons, and it was actually an EXIT: it ended the run and returned to
// character select. A confirm() dialog is not enough to make a mis-tap safe when the
// control is styled identically to its neighbours and one of them opens a cosmetics
// modal. Switching characters needs a home that reads as leaving — deliberately unbuilt
// for now rather than replaced in place.
export function HeroBar() {
  const gold = useGameStore(s => s.gold)
  const [open, setOpen] = useState<'wardrobe' | 'ladder' | null>(null)

  return (
    <div className="hero-bar">
      <button
        className="rp-button hero-bar-btn"
        onClick={() => setOpen('wardrobe')}
        title="Wardrobe — cosmetic colourways"
      >
        Looks
      </button>
      {/* The ladder is what makes the `Idle MMORPG` listing name honest (store/LAUNCH.md
          §4b), so it needs a top-level home rather than living inside a feed. */}
      <button
        className="rp-button hero-bar-btn"
        onClick={() => setOpen('ladder')}
        title="The ladder — standings and duels"
      >
        Ladder
      </button>
      <div className="hero-bar-gold">
        <GoldDisplay gold={gold} />
      </div>

      {open === 'wardrobe' && <WardrobePanel onClose={() => setOpen(null)} />}
      {open === 'ladder' && <LadderModal onClose={() => setOpen(null)} />}
    </div>
  )
}
