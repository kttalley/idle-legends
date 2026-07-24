import React from 'react'
import { useGameStore } from '../../../store/gameStore'
import { SkillBar } from '../SkillBar'
import { SpriteIcon } from '../../ui/SpriteIcon'
import { HealthBar } from '../../ui/HealthBar'
import { CLASS_PROFESSIONS } from '../../../data/professions'
import { ZONE_TOWN } from '../../../data/towns'
import { xpForLevel } from '../../../engine/progression'
import type { GameMode } from '../../../data/types'

// Bottom-docked action bar: mode/town toggle buttons on the left, the class ability
// slots on the right (only while actually in combat). Reskinned WoW/Diablo shell over
// the dimetric world. Pointer-events are on so its buttons are tappable through the
// otherwise click-through HUD overlay.

const MODE_BTN = (active: boolean, disabled: boolean): React.CSSProperties => ({
  fontSize: 15,
  width: 30,
  height: 30,
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

  const isActive = (m: GameMode) => gameMode === m && !mobApproaching

  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    }}>
      {/* Main action bar panel */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(8,8,14,0.6)',
        border: '1px solid #3a3630',
        borderRadius: 8,
        padding: 7,
      }}>
        {/* Mode / town toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['combat', 'gathering', 'crafting'] as const).map(m => (
            <button
              key={m}
              onClick={() => !isTraveling && setMode(m)}
              disabled={isTraveling}
              title={`${m[0].toUpperCase()}${m.slice(1)}`}
              style={MODE_BTN(isActive(m), isTraveling)}
            >
              <SpriteIcon emoji={m === 'combat' ? '⚔' : m === 'gathering' ? prof.gatherIcon : prof.craftIcon} size={18} />
            </button>
          ))}
          {townId && (
            <button
              onClick={() => !isTraveling && enterTown(townId)}
              disabled={isTraveling}
              title="Visit town"
              style={MODE_BTN(gameMode === 'in_town', isTraveling)}
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

      {/* XP bar below the action buttons, WoW-style */}
      <div style={{ width: '100%', maxWidth: 420 }}>
        <HealthBar
          current={xp}
          max={xpNeeded}
          type="xp"
          height={10}
          label={`XP ${Math.floor(xp)} / ${xpNeeded}`}
        />
        <div style={{ fontSize: '0.55rem', color: '#9d9d9d', marginTop: 2, textAlign: 'center' }}>
          {xpNeeded - Math.floor(xp)} XP to level {level + 1}
        </div>
      </div>
    </div>
  )
}
