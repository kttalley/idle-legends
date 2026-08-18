import React, { useState } from 'react'
import { WardrobePanel } from './WardrobePanel'
import { LadderModal } from './LadderPanel'
import { GameMenu } from './GameMenu'
import { SpriteIcon } from '../ui/SpriteIcon'

// Account-level navigation for the left rail: how you look, who else is out there, and the
// way back to character select.
//
// These lived in the CHARACTER SHEET's header, competing for width with a generated hero
// name that is routinely two words longer than the rail is wide. None of them is a
// character-sheet control — they all leave the sheet entirely — so they get their own strip
// at the top of the column instead.
//
// **Gold left this strip on 2026-08-15**, when the menu button arrived and four controls
// plus a readout stopped fitting across 232px — the coin ended up half-hidden behind the
// minimize arrow. It now lives at the foot of the bag (InventoryPanel), beside the items it
// is spent on, which is also where it was always going to be looked for.
//
// **"Heroes" was removed 2026-08-09 and is back as ☰.** It read as navigation sitting
// between two other navigation buttons, and it was actually an EXIT: it ended the run and
// returned to character select. A confirm() dialog is not enough to make a mis-tap safe
// when the control is styled identically to its neighbours and one of them opens a
// cosmetics modal. The exit now lives inside a MENU rather than on this strip, and arms
// itself before it fires — see GameMenu. The ☰ leads the row because a menu is where you
// look for the way out, and because opening one is not itself an action.
export function HeroBar() {
  const [open, setOpen] = useState<'wardrobe' | 'ladder' | 'menu' | null>(null)

  return (
    <div className="hero-bar">
      <button
        className="rp-button hero-bar-btn hero-bar-menu"
        onClick={() => setOpen('menu')}
        title="Menu — character select"
        aria-label="Menu — character select"
        aria-haspopup="dialog"
      >
        {/* The sprite, not the '☰' character. It is the same hamburger the mobile dock and
            the rail's collapsed chip now draw, and a font glyph beside pixel icons reads
            wrong at this size — different weight, different grid, system font. */}
        <SpriteIcon ui="menu" size={15} />
      </button>
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
      {open === 'wardrobe' && <WardrobePanel onClose={() => setOpen(null)} />}
      {open === 'ladder' && <LadderModal onClose={() => setOpen(null)} />}
      {open === 'menu' && <GameMenu onClose={() => setOpen(null)} />}
    </div>
  )
}
