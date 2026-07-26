import React from 'react'
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
const MODE_BTN = (active: boolean, disabled: boolean, touch: boolean): React.CSSProperties => ({
  fontSize: 15,
  width: touch ? 40 : 30,
  height: touch ? 40 : 30,
  touchAction: 'manipulation',
  borderRadius: 5,
  border: `1px solid ${active ? '#c8a864' : '#45403a'}`,
  background: active ? '#2a1e00' : 'linear-gradient(180deg, #201d26, #14121a)',
  color: active ? '#ffd700' : '#8a8578',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.35 : 1,
  transition: 'all 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export function ActionBar() {
  const { playerClass, gameMode, setMode, currentZone, currentTown, enterTown, mobMapOffset, currentMob, level, xp } = useGameStore()
  const prof = CLASS_PROFESSIONS[playerClass]
  const isTraveling = gameMode === 'traveling'
  const mobDist = Math.sqrt(mobMapOffset.dx ** 2 + mobMapOffset.dy ** 2)
  const mobApproaching = currentMob !== null && mobDist > 1.5
  const townId = ZONE_TOWN[currentZone]
  const xpNeeded = xpForLevel(level)

  const touch = useCoarsePointer()
  const isActive = (m: GameMode) => gameMode === m && !mobApproaching

  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      width: '100%',
    }}>
      {/* Main action bar panel */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(8,8,14,0.6)',
        border: '1px solid #3a3630',
        borderRadius: 8,
        padding: 6,
      }}>
        {/* Mode / town toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['combat', 'gathering', 'crafting'] as const).map(m => (
            <button
              key={m}
              onClick={() => !isTraveling && setMode(m)}
              disabled={isTraveling}
              title={`${m[0].toUpperCase()}${m.slice(1)}`}
              aria-label={`${m[0].toUpperCase()}${m.slice(1)} mode`}
              aria-pressed={isActive(m)}
              style={MODE_BTN(isActive(m), isTraveling, touch)}
            >
              <SpriteIcon emoji={m === 'combat' ? '⚔' : m === 'gathering' ? prof.gatherIcon : prof.craftIcon} size={18} />
            </button>
          ))}
          {townId && (
            <button
              onClick={() => !isTraveling && enterTown(townId)}
              disabled={isTraveling}
              title="Visit town"
              aria-label="Visit town"
              aria-pressed={gameMode === 'in_town'}
              style={MODE_BTN(gameMode === 'in_town', isTraveling, touch)}
            >
              <SpriteIcon emoji="🏠" size={18} />
            </button>
          )}
        </div>

        {/* Ability slots — only in active combat */}
        {gameMode === 'combat' && (
          <>
            <div style={{ width: 1, alignSelf: 'stretch', background: '#3a3630' }} />
            <SkillBar embedded />
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
