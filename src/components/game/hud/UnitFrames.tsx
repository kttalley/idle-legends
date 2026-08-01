import React from 'react'
import { useGameStore } from '../../../store/gameStore'
import { HealthBar } from '../../ui/HealthBar'
import { StatusEffects } from '../StatusEffects'
import { CLASS_DEFINITIONS } from '../../../data/classes'
import { xpForLevel } from '../../../engine/progression'
import type { CastState } from '../../../data/types'
import { SpriteIcon } from '../../ui/SpriteIcon'
import { PartyFrame } from './PartyFrame'

// Compact, background-less unit read-outs (mobile-friendly). Just bars + text + status
// icons floating over the world — no card panel. The HP/XP bar tracks provide their own
// contrast; text carries a shadow for legibility.

// 1px corner outline + soft drop — legible over the busy tiles, paired with a light
// feathered scrim on the container (below) instead of a hard card panel.
const TEXT_SHADOW = '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 1px 3px rgba(0,0,0,0.9)'
const WIDTH = 150

// Match the bottom action bar's panel so the HUD reads as one system.
const SCRIM: React.CSSProperties = {
  background: 'rgba(8,8,14,0.6)',
  border: '1px solid #3a3630',
  borderRadius: 8,
  padding: '6px 8px',
}

function CastBar({ cast }: { cast: CastState }) {
  const pct = cast.total > 0 ? Math.max(0, Math.min(1, 1 - cast.remaining / cast.total)) : 0
  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 2, overflow: 'hidden', background: 'rgba(8,6,14,0.7)' }}>
      <div style={{ height: '100%', width: `${pct * 100}%`, background: 'linear-gradient(180deg, #ffe27a, #c8901c)' }} />
      <span style={{ position: 'absolute', left: 3, top: 0, fontSize: 8, lineHeight: '10px', color: '#fff8e0', fontWeight: 600, textShadow: TEXT_SHADOW, whiteSpace: 'nowrap' }}>
        {cast.icon} {cast.name}
      </span>
      <span style={{ position: 'absolute', right: 3, top: 0, fontSize: 8, lineHeight: '10px', color: '#fff8e0', textShadow: TEXT_SHADOW }}>
        {cast.remaining.toFixed(1)}s
      </span>
    </div>
  )
}

export function UnitFrames() {
  const {
    playerName, playerClass, level, xp, stats,
    activeBuffs, activeDoTs, procState, castState,
    currentMob, mobMapOffset, isAlive, respawnTimer, respawnNow,
  } = useGameStore()

  const classDef = CLASS_DEFINITIONS[playerClass]
  const xpNeeded = xpForLevel(level)
  const mobDist = Math.sqrt(mobMapOffset.dx ** 2 + mobMapOffset.dy ** 2)
  const mobApproaching = currentMob !== null && mobDist > 1.5
  const combo = procState.comboPoints

  return (
    <div style={{ width: WIDTH, display: 'flex', flexDirection: 'column', gap: 6, ...SCRIM }}>
      {/* ── Player ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10, textShadow: TEXT_SHADOW }}>
          <span className={classDef.colorClass} style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {playerName || classDef.name}
          </span>
          <span style={{ color: '#cdbf9a', flexShrink: 0 }}>Lv {level}</span>
        </div>
        <HealthBar current={Math.max(0, Math.round(stats.currentHp))} max={stats.maxHp} type="hp" height={9} />
        <HealthBar current={xp} max={xpNeeded} type="xp" height={3} showText={false} />
        {castState && <CastBar cast={castState} />}
        {combo > 0 && (
          <div style={{ fontSize: 9, color: '#ff8800', letterSpacing: 1, textShadow: TEXT_SHADOW }}>
            {'●'.repeat(combo)}{'○'.repeat(Math.max(0, 5 - combo))}
          </div>
        )}
        {activeBuffs.length > 0 && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><StatusEffects buffs={activeBuffs} /></div>}
        {!isAlive && (
          <div style={{ fontSize: 10, color: '#ff6a5a', display: 'flex', alignItems: 'center', gap: 6, textShadow: TEXT_SHADOW }}>
            <SpriteIcon emoji="💀" size={11} /> {Math.ceil(respawnTimer)}s
            <button onClick={respawnNow} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #6a2c24', background: 'rgba(42,18,16,0.9)', color: '#ffb0a0', cursor: 'pointer' }}>
              Respawn
            </button>
          </div>
        )}
      </div>

      {/* ── Party ── directly beneath your own frame, above the target. */}
      <PartyFrame />

      {/* ── Target ── */}
      {currentMob && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textShadow: TEXT_SHADOW,
            color: currentMob.isBoss ? '#ff9a3c' : currentMob.isElite ? '#c78af0' : '#e0b0a0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {currentMob.isBoss && <><SpriteIcon emoji="☠" size={11} /> </>}
            {!currentMob.isBoss && currentMob.isElite && <><SpriteIcon emoji="★" size={11} /> </>}
            {currentMob.name}
          </div>
          {mobApproaching ? (
            <div style={{ fontSize: 9, color: '#c89a6a', textShadow: TEXT_SHADOW }}>↘ approaching… ~{Math.round(mobDist / 2.5)}s</div>
          ) : (
            <HealthBar current={Math.max(0, currentMob.currentHp)} max={currentMob.maxHp} type="mob-hp" height={9} />
          )}
          {procState.mobFrozen && (
            <div style={{ fontSize: 9, color: '#6ab0ff', textShadow: TEXT_SHADOW }}><SpriteIcon emoji="❄" size={10} /> {procState.mobFrozenTimer.toFixed(1)}s</div>
          )}
          {activeDoTs.length > 0 && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><StatusEffects dots={activeDoTs} /></div>}
        </div>
      )}
    </div>
  )
}
