import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'
import { HealthBar } from '../ui/HealthBar'
import { SpriteRenderer } from '../sprites/SpriteRenderer'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { xpForLevel } from '../../engine/progression'
import { SkillBar } from './SkillBar'
import { StatusEffects } from './StatusEffects'
import { ThoughtBubble } from './ThoughtBubble'
import { MinimapWidget } from './MinimapWidget'
import { TravelOverlay } from './TravelOverlay'
import { GatheringPanel } from './GatheringPanel'
import { CraftingPanel } from './CraftingPanel'
import { CLASS_PROFESSIONS } from '../../data/professions'

export function CombatView() {
  const {
    stats,
    currentMob,
    isAlive,
    respawnTimer,
    mobRespawnTimer,
    currentZone,
    level,
    xp,
    playerClass,
    floatingNumbers,
    activeDoTs,
    activeBuffs,
    procState,
    playerName,
    generatedZoneNames,
    respawnNow,
    gameMode,
    setMode,
  } = useGameStore()

  const zone     = ZONES[currentZone]
  const zoneName = generatedZoneNames[currentZone] ?? zone?.name
  const classDef = CLASS_DEFINITIONS[playerClass]
  const xpNeeded = xpForLevel(level)
  const prof     = CLASS_PROFESSIONS[playerClass]

  const isTraveling = gameMode === 'traveling'

  return (
    <div
      className="wow-panel flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${zone?.bgColor ?? '#1a1510'}cc 0%, #1a1510 100%)`,
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Zone name header with minimap */}
      <div className="wow-panel-header flex items-center" style={{ gap: 6 }}>
        <div style={{ flex: 1 }}>
          <span>{zoneName ?? 'Unknown Zone'}</span>
          <span style={{ fontSize: '0.65rem', color: '#9d9d9d', marginLeft: 8 }}>
            Lvl {zone?.levelRange[0]}–{zone?.levelRange[1]}
          </span>
        </div>
        <MinimapWidget />
      </div>

      {/* Mode switcher strip */}
      <div className="flex gap-1 px-2 pt-1" style={{ justifyContent: 'center' }}>
        {(['combat', 'gathering', 'crafting'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={isTraveling}
            style={{
              fontSize: '0.58rem',
              padding: '2px 7px',
              borderRadius: 3,
              border: `1px solid ${gameMode === m ? '#c8a864' : '#444'}`,
              background: gameMode === m ? '#2a1e00' : '#111',
              color: gameMode === m ? '#ffd700' : '#888',
              cursor: isTraveling ? 'default' : 'pointer',
              opacity: isTraveling ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            {m === 'combat'    ? '⚔ Fight'                              : null}
            {m === 'gathering' ? `${prof.gatherIcon} ${prof.gatheringName}` : null}
            {m === 'crafting'  ? `${prof.craftIcon} ${prof.craftingName}`   : null}
          </button>
        ))}
      </div>

      {/* ── Traveling overlay ── */}
      {gameMode === 'traveling' && <TravelOverlay />}

      {/* ── Gathering panel ── */}
      {gameMode === 'gathering' && <GatheringPanel />}

      {/* ── Crafting panel ── */}
      {gameMode === 'crafting' && <CraftingPanel />}

      {/* ── Combat arena ── */}
      {gameMode === 'combat' && (
        <>
          <div className="flex-1 flex items-center justify-around px-4 pt-2 pb-1" style={{ minHeight: 180 }}>

            {/* Player side */}
            <div className="flex flex-col items-center gap-1" style={{ width: 110 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase' }}>You</div>
                {playerName && (
                  <div style={{ fontSize: '0.58rem', color: '#d4b896', fontStyle: 'italic', marginTop: 1 }}>
                    {playerName}
                  </div>
                )}
              </div>

              {/* Player buffs */}
              <StatusEffects buffs={activeBuffs} />

              {/* Sprite + thought bubble wrapper */}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <ThoughtBubble />
                <SpriteRenderer
                  spriteKey={`player_${playerClass}`}
                  label={classDef.name}
                  width={64}
                  height={64}
                  scale={1.5}
                  animation={isAlive ? 'idle' : 'death'}
                />
              </div>

              {/* Combo points */}
              {procState.comboPoints > 0 && (
                <div style={{ fontSize: '0.55rem', color: '#ff8800' }}>
                  {'●'.repeat(procState.comboPoints)}{'○'.repeat(Math.max(0, 5 - procState.comboPoints))} CP
                </div>
              )}

              <div style={{ width: '100%' }}>
                <HealthBar
                  current={Math.max(0, stats.currentHp)}
                  max={stats.maxHp}
                  type="hp"
                  height={12}
                />
              </div>

              {!isAlive && (
                <div className="text-center" style={{ fontSize: '0.65rem', color: '#ff4444' }}>
                  💀 Respawn in {Math.ceil(respawnTimer)}s
                  <br />
                  <button className="wow-button mt-1" onClick={respawnNow} style={{ fontSize: '0.6rem' }}>
                    Respawn
                  </button>
                </div>
              )}
            </div>

            {/* VS */}
            <div style={{ color: '#555', fontSize: '1.2rem', fontWeight: 700 }}>⚔</div>

            {/* Mob side */}
            <div className="flex flex-col items-center gap-1" style={{ width: 130 }}>
              {currentMob ? (
                <>
                  <div style={{
                    fontSize: '0.65rem',
                    color: currentMob.isBoss ? '#ff8000' : currentMob.isElite ? '#a335ee' : '#888',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}>
                    {currentMob.name}
                  </div>

                  {/* Mob DoTs + frozen */}
                  <div className="flex flex-col items-center gap-0.5">
                    {procState.mobFrozen && (
                      <div style={{ fontSize: '0.55rem', color: '#6af' }}>
                        🥶 Frozen {procState.mobFrozenTimer.toFixed(1)}s
                      </div>
                    )}
                    <StatusEffects dots={activeDoTs} />
                  </div>

                  <SpriteRenderer
                    spriteKey={currentMob.spriteKey}
                    label={currentMob.name}
                    width={64}
                    height={64}
                    scale={currentMob.isBoss ? 2 : currentMob.isElite ? 1.7 : 1.5}
                    animation="idle"
                  />

                  <div style={{ width: '100%' }}>
                    <HealthBar
                      current={currentMob.currentHp}
                      max={currentMob.maxHp}
                      type="mob-hp"
                      height={12}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center" style={{ color: '#555', fontSize: '0.7rem', paddingTop: 40 }}>
                  {mobRespawnTimer > 0
                    ? `Next mob in ${Math.ceil(mobRespawnTimer)}s`
                    : 'Searching…'}
                </div>
              )}
            </div>
          </div>

          {/* Skill bar */}
          <SkillBar />
        </>
      )}

      {/* Floating damage numbers — always rendered on top */}
      {floatingNumbers.map(fn => (
        <div
          key={fn.id}
          className="damage-float absolute"
          style={{
            left: `${fn.x}%`,
            top: `${fn.y}%`,
            color: fn.isMobDamage
              ? '#ff6666'
              : fn.isDoT
                ? (fn.color ?? '#aa88ff')
                : fn.isCrit
                  ? '#ffcc00'
                  : '#88bbff',
            fontSize: fn.isCrit ? '1.3rem' : '1rem',
            pointerEvents: 'none',
          }}
        >
          {fn.isMobDamage ? '-' : ''}{fn.value}
          {fn.isCrit && !fn.isDoT ? '!' : ''}
        </div>
      ))}

      {/* XP / Level bar at bottom */}
      <div className="px-2 pb-2">
        <div className="flex justify-between text-xs mb-1" style={{ color: '#9d9d9d', fontSize: '0.65rem' }}>
          <span className={classDef.colorClass}>{classDef.name}</span>
          <span>Level {level}</span>
          <span>{xp} / {xpNeeded} XP</span>
        </div>
        <HealthBar current={xp} max={xpNeeded} type="xp" height={10} showText={false} />
      </div>
    </div>
  )
}
