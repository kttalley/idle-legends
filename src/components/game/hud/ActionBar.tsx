import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { SkillBar } from '../SkillBar'
import { SpriteIcon } from '../../ui/SpriteIcon'
import { HealthBar } from '../../ui/HealthBar'
import { useCoarsePointer } from '../../ui/useLongPress'
import { CLASS_PROFESSIONS } from '../../../data/professions'
import { ZONE_TOWN } from '../../../data/towns'
import { xpForLevel } from '../../../engine/progression'
import type { GameMode } from '../../../data/types'

// Bottom-docked action bar: mode/town toggle buttons on the left, the class ability
// slots on the right (only while actually in combat). Reskinned WoW/Diablo shell over
// the dimetric world. Pointer-events are on so its buttons are tappable through the
// otherwise click-through HUD overlay.

// 30px was a mouse-sized target. Coarse pointers get 40 — still compact enough for the
// bar, comfortably past the point where a thumb starts missing.
//
// Each toggle now carries a visible caption under its icon. They previously had `title`
// and `aria-label` only, which is a hover tooltip on desktop and, on the phone this ships
// to, nothing whatsoever — five unlabelled glyphs the player is invited to guess at. The
// caption is what makes the mode switcher self-describing on the platform that matters.
// Geometry only — the material (glass, hairlines, press response) lives in `.mode-btn`
// in index.css, next to the `.skill-slot` panes it has to stay consistent with.
// Sized to its caption rather than to a fixed 42px, because the caption is now the
// PROFESSION and those are not all four letters long — a rogue's is "Leatherworking". The
// floor keeps the three buttons the same comfortable thumb target they were when they all
// happened to fit; only the widest labels actually spend more than it.
const MODE_BTN = (touch: boolean): React.CSSProperties => ({
  minWidth: touch ? 42 : 38,
  minHeight: touch ? 40 : 34,
  padding: touch ? '3px 6px' : '2px 5px',
})

export function ActionBar() {
  const { playerClass, gameMode, setMode, mobMapOffset, currentMob, level, xp } = useGameStore()
  const prof = CLASS_PROFESSIONS[playerClass]
  const isTraveling = gameMode === 'traveling'
  const mobDist = Math.sqrt(mobMapOffset.dx ** 2 + mobMapOffset.dy ** 2)
  const mobApproaching = currentMob !== null && mobDist > 1.5
  const xpNeeded = xpForLevel(level)

  const touch = useCoarsePointer()
  const isActive = (m: GameMode) => gameMode === m && !mobApproaching

  // "Gather" and "Craft" were generic verbs on a bar whose ICONS were already
  // class-specific — a warrior saw a pick and a hammer captioned as though every class did
  // the same two jobs. The professions are the whole point of the pair, so the buttons say
  // which two they are: Mining/Smithing, Herbalism/Alchemy, Skinning/Leatherworking.
  const modeText: Record<GameMode, string> = {
    combat: 'Fight', gathering: prof.gatheringName, crafting: prof.craftingName,
    traveling: 'Travel', in_town: 'Town',
  }

  // Publish the bar's real height as --actionbar-h.
  //
  // The chat sheet and the whisper window both reserve this much space so they can never
  // cover the primary controls, and it was a hardcoded 96px in :root — a guess that was
  // already approximate and went stale the moment these buttons gained captions. Measuring
  // it means the reservation cannot drift from the thing being reserved against. Same
  // treatment as --log-h; see App.tsx.
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = barRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      const h = el.getBoundingClientRect().height
      // Include the bottom stack's own padding. `.hud-bottom` holds this bar clear of the
      // dock, and a reservation measured without it leaves the chat sheet overlapping the
      // bar by exactly that many pixels — 4px, which is invisible in a screenshot and
      // still means a tap near the top of the action bar lands on chat instead. Read
      // rather than hardcoded, or this is the same stale-constant bug one level down.
      const parent = el.parentElement
      const pad = parent ? parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0
      if (h > 0) document.documentElement.style.setProperty('--actionbar-h', `${Math.ceil(h + pad)}px`)
    }
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    publish()
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={barRef} style={{
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      width: '100%',
    }}>
      {/* Main action bar panel.
          Five labelled mode toggles plus three ability slots do not fit across 390px —
          measured at 45px of overflow, which clipped the third ability slot off the right
          edge. Wrapping is the answer rather than shrinking: the ability slots are the
          primary interaction and the toggles already sit near the minimum comfortable
          thumb target, so trimming either to buy a row that only phones need would make
          the common case worse to serve the narrow one. On anything wider this stays a
          single row and the rule costs nothing.
          The extra height is free of consequence now that --actionbar-h is measured from
          this element rather than hardcoded — the chat sheet and whisper window reserve
          whatever the bar actually is. */}
      <div
        className="actionbar-shell"
        style={{
          rowGap: touch ? 4 : 6,
          gap: touch ? 5 : 8,
          padding: touch ? '5px 7px' : 6,
        }}
      >
        {/* Activity modes only.
            Town and the idle/manual toggle used to sit here too, which put five buttons
            plus three spell panes on one 390px row and forced the whole bar to wrap. They
            are also a different KIND of control: fight/gather/craft is "what am I doing
            right now", while town and auto-pilot are navigation and meta. Those two moved
            onto the minimap's free corners, where the map and zoom controls already live —
            see MinimapRadar. */}
        <div style={{ display: 'flex', gap: touch ? 3 : 4 }}>
          {(['combat', 'gathering', 'crafting'] as const).map(m => (
            <button
              key={m}
              className={`mode-btn${isActive(m) ? ' is-active' : ''}`}
              onClick={() => !isTraveling && setMode(m)}
              disabled={isTraveling}
              title={modeText[m]}
              aria-label={`${modeText[m]} mode`}
              aria-pressed={isActive(m)}
              style={MODE_BTN(touch)}
            >
              <SpriteIcon emoji={m === 'combat' ? '⚔' : m === 'gathering' ? prof.gatherIcon : prof.craftIcon} size={16} />
              <span className="mode-btn-label">{modeText[m]}</span>
            </button>
          ))}
        </div>

        {/* Ability slots — only in active combat */}
        {gameMode === 'combat' && (
          <>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--glass-hairline)' }} />
            <SkillBar embedded compact={touch} />
          </>
        )}
      </div>

      {/* XP strip: full-bleed and flush to the very bottom edge. The old "N XP to level
          M" caption below it was a second row of low-contrast text floating over the
          world — its information now rides in the bar's own label, costing zero height. */}
      <div style={{ width: '100%' }}>
        <HealthBar
          current={xp}
          max={xpNeeded}
          type="xp"
          height={11}
          label={`XP ${Math.floor(xp)} / ${xpNeeded}  ·  ${xpNeeded - Math.floor(xp)} to L${level + 1}`}
        />
      </div>
    </div>
  )
}
