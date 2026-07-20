import React from 'react'
import { useGameStore } from '../../../store/gameStore'
import { HealthBar } from '../../ui/HealthBar'
import { StatusEffects } from '../StatusEffects'
import { CLASS_DEFINITIONS } from '../../../data/classes'
import { xpForLevel } from '../../../engine/progression'
import type { CastState } from '../../../data/types'

const CARD: React.CSSProperties = {
  pointerEvents: 'auto',
  width: 172,
  background: 'rgba(8,8,14,0.82)',
  border: '1px solid #3a3630',
  borderRadius: 6,
  padding: '7px 9px',
}

const NAME_ROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 5,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 6,
}

/** Slim cast-progress bar — fills toward completion; shows the spell icon + name. */
function CastBar({ cast }: { cast: CastState }) {
  const pct = cast.total > 0 ? Math.max(0, Math.min(1, 1 - cast.remaining / cast.total)) : 0
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative', height: 12 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#100d18', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: 'linear-gradient(180deg, #ffe27a, #c8901c)',
            transition: 'width 0.06s linear',
          }} />
        </div>
        <span style={{ position: 'relative', fontSize: 9, marginLeft: 3, lineHeight: '12px' }}>{cast.icon}</span>
        <span style={{
          position: 'relative', fontSize: 8, color: '#fff8e0', fontWeight: 600,
          lineHeight: '12px', textShadow: '0 1px 1px #000', whiteSpace: 'nowrap',
        }}>
          {cast.name}
        </span>
        <span style={{
          position: 'absolute', right: 4, fontSize: 8, color: '#fff8e0',
          lineHeight: '12px', textShadow: '0 1px 1px #000',
        }}>
          {cast.remaining.toFixed(1)}s
        </span>
      </div>
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
    <div style={{ display: 'flex', gap: 8 }}>
      {/* ── Player frame ── */}
      <div style={CARD}>
        <div style={NAME_ROW}>
          <span className={classDef.colorClass} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {playerName || classDef.name}
          </span>
          <span style={{ color: '#8a8578', fontWeight: 400, flexShrink: 0 }}>Lv {level}</span>
        </div>

        <HealthBar current={Math.max(0, Math.round(stats.currentHp))} max={stats.maxHp} type="hp" height={11} />
        <div style={{ height: 3 }} />
        <HealthBar current={xp} max={xpNeeded} type="xp" height={7} showText={false} />

        {castState && <CastBar cast={castState} />}

        {combo > 0 && (
          <div style={{ marginTop: 4, fontSize: 9, color: '#ff8800', letterSpacing: 1 }}>
            {'●'.repeat(combo)}{'○'.repeat(Math.max(0, 5 - combo))}
          </div>
        )}

        {activeBuffs.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <StatusEffects buffs={activeBuffs} />
          </div>
        )}

        {!isAlive && (
          <div style={{ marginTop: 5, fontSize: 10, color: '#ff5555', display: 'flex', alignItems: 'center', gap: 6 }}>
            💀 Slain — {Math.ceil(respawnTimer)}s
            <button
              onClick={respawnNow}
              style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 3,
                border: '1px solid #6a2c24', background: '#2a1210', color: '#ffb0a0', cursor: 'pointer',
              }}
            >
              Respawn
            </button>
          </div>
        )}
      </div>

      {/* ── Target frame ── */}
      {currentMob && (
        <div style={{ ...CARD, borderColor: currentMob.isBoss ? '#8a5a1c' : currentMob.isElite ? '#5a2c8a' : '#6a2c24' }}>
          <div style={NAME_ROW}>
            <span style={{
              color: currentMob.isBoss ? '#ff9a3c' : currentMob.isElite ? '#c78af0' : '#e0b0a0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {currentMob.isBoss ? '☠ ' : currentMob.isElite ? '★ ' : ''}{currentMob.name}
            </span>
          </div>

          {mobApproaching ? (
            <div style={{ fontSize: 9, color: '#c89a6a', padding: '3px 0' }}>
              ↘ approaching… ~{Math.round(mobDist / 2.5)}s
            </div>
          ) : (
            <HealthBar current={Math.max(0, currentMob.currentHp)} max={currentMob.maxHp} type="mob-hp" height={11} />
          )}

          {procState.mobFrozen && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#6ab0ff' }}>
              🥶 Frozen {procState.mobFrozenTimer.toFixed(1)}s
            </div>
          )}

          {activeDoTs.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <StatusEffects dots={activeDoTs} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
