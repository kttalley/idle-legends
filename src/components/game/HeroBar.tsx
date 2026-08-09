import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { GoldDisplay } from '../ui/GoldDisplay'
import { WardrobePanel } from './WardrobePanel'

// Account-level navigation for the left rail: what you own, how you look, who you play.
//
// All three of these lived in the CHARACTER SHEET's header, competing for width with a
// generated hero name that is routinely two words longer than the rail is wide. None of
// them is a character-sheet control — gold is a global resource, and the other two leave
// the sheet entirely — so they get their own strip at the top of the column instead.
export function HeroBar() {
  const gold         = useGameStore(s => s.gold)
  const returnToMenu = useGameStore(s => s.returnToMenu)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)

  return (
    <div className="hero-bar">
      <button
        className="rp-button hero-bar-btn"
        onClick={() => setWardrobeOpen(true)}
        title="Wardrobe — cosmetic colourways"
      >
        Looks
      </button>
      {/* Ejects the player out of their run, so it confirms first and is big enough to be
          aimed at — a mis-tap here ends the session. */}
      <button
        className="rp-button hero-bar-btn"
        onClick={() => {
          if (confirm('Return to character select?\n\nYour progress is saved.')) returnToMenu()
        }}
        title="Save and return to character select"
      >
        Heroes
      </button>
      <div className="hero-bar-gold">
        <GoldDisplay gold={gold} />
      </div>

      {wardrobeOpen && <WardrobePanel onClose={() => setWardrobeOpen(false)} />}
    </div>
  )
}
