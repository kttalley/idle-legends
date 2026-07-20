import React, { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'
import { HealthBar } from '../ui/HealthBar'
import { AvatarRenderer, CLASS_PALETTES, mobAvatarPalette, hashStr } from '../sprites/AvatarRenderer'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { xpForLevel } from '../../engine/progression'
import { SkillBar } from './SkillBar'
import { StatusEffects } from './StatusEffects'
import { ThoughtBubble } from './ThoughtBubble'
import { WorldMapView } from './WorldMapView'
import { DimetricWorldScene } from './DimetricWorldScene'
import { TravelOverlay } from './TravelOverlay'
import { GatheringPanel } from './GatheringPanel'
import { CraftingPanel } from './CraftingPanel'
import { TownView } from './TownView'
import { CLASS_PROFESSIONS } from '../../data/professions'
import { CombatParticles } from './CombatParticles'
import type { CombatParticlesHandle } from './CombatParticles'
import { ZONE_TOWN } from '../../data/towns'
import { TOWNS } from '../../data/towns'

// Phase 2: the unified dimetric world scene replaces the ASCII strip + combat
// arena. Flip to false to fall back to the original presentation path.
const DIMETRIC_ENABLED = true

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
    mobMapOffset,
    equipment,
    currentTown,
    enterTown,
  } = useGameStore()

  const zone     = ZONES[currentZone]
  const zoneName = generatedZoneNames[currentZone] ?? zone?.name
  const classDef = CLASS_DEFINITIONS[playerClass]
  const xpNeeded = xpForLevel(level)
  const prof     = CLASS_PROFESSIONS[playerClass]

  // Player avatar seed: class + level + equipped item ids XORed together
  const equipHash = Object.values(equipment)
    .filter(Boolean)
    .reduce((acc, item) => acc ^ hashStr(item!.id), 0)
  const playerAvatarSeed = hashStr(playerClass) ^ (level * 7) ^ equipHash
  const playerPalette    = CLASS_PALETTES[playerClass]

  // Mob avatar
  const mobSeed    = currentMob ? hashStr(currentMob.templateId) ^ (currentMob.isElite ? 0xABCDEF : 0) : 0
  const mobPalette = currentMob ? mobAvatarPalette(hashStr(currentMob.templateId), currentMob.isElite, currentMob.isBoss) : null
  const mobCellSize = currentMob?.isBoss ? 13 : currentMob?.isElite ? 11 : 9

  const isTraveling = gameMode === 'traveling'
  const mobDist = Math.sqrt(mobMapOffset.dx ** 2 + mobMapOffset.dy ** 2)
  const mobApproaching = currentMob !== null && mobDist > 1.5

  // ── Refs for particle system ────────────────────────────────────────────────
  const combatContainerRef = useRef<HTMLDivElement>(null)
  const playerAvatarRef    = useRef<HTMLDivElement>(null)
  const mobAvatarRef       = useRef<HTMLDivElement>(null)
  const particlesRef       = useRef<CombatParticlesHandle>(null)

  // ── Combat animation state ──────────────────────────────────────────────────
  const [playerAnimClass, setPlayerAnimClass] = useState('')
  const [mobAnimClass,    setMobAnimClass]    = useState('')

  // Detect spell class for player attack animation
  const isSpellClass =
    playerPalette.shades[0] === '#050a30' ||  // mage
    playerPalette.shades[0] === '#100520'      // warlock

  // Class palette glow colors for projectiles
  const playerGlow = playerPalette.glow
  const playerProjectileColor = playerPalette.shades[3] ?? playerPalette.shades[0]

  const prevFnIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (DIMETRIC_ENABLED) return // the dimetric host owns the FN combat-event feed
    const newFns = floatingNumbers.filter(fn => !prevFnIds.current.has(fn.id))
    prevFnIds.current = new Set(floatingNumbers.map(fn => fn.id))

    if (newFns.length === 0) return

    for (const fn of newFns) {
      if (!fn.isMobDamage) {
        // Player attacked
        setPlayerAnimClass(isSpellClass ? 'avatar-spell-cast' : 'avatar-attacking')
        setTimeout(() => setPlayerAnimClass(''), 280)

        // Fire projectile — rogue = slash, warrior = blunt, spell classes = orb
        const isSharp = playerClass === 'rogue'
        const kind = isSpellClass
          ? 'spell'
          : fn.isCrit
            ? (isSharp ? 'crit_slash' : 'crit_blunt')
            : (isSharp ? 'melee_slash' : 'melee_blunt')
        particlesRef.current?.fireAttack(kind, playerProjectileColor, playerGlow)
      } else {
        // Mob attacked — player takes hit
        setMobAnimClass('avatar-hit')
        setTimeout(() => setMobAnimClass(''), 350)
        particlesRef.current?.fireAttack('mob', '#ff4444', '#ff0000')
      }
    }
  }, [floatingNumbers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-mode status label
  const autoStatus = (() => {
    if (isTraveling) return null
    if (mobApproaching) return { label: `${currentMob!.isBoss ? '⚠' : '↘'} ${currentMob!.name} approaching…`, color: currentMob!.isBoss ? '#ff8000' : '#ff6666' }
    if (gameMode === 'gathering') return { label: `${prof.gatherIcon} Gathering…`, color: '#88cc88' }
    if (gameMode === 'crafting') return { label: `${prof.craftIcon} Crafting…`, color: '#ffd700' }
    if (gameMode === 'in_town' && currentTown) return { label: `🏠 In Town`, color: '#ddaa44' }
    if (gameMode === 'combat' && currentMob) return { label: `⚔ Fighting ${currentMob.name}`, color: '#88aaff' }
    return null
  })()

  return (
    <div
      ref={combatContainerRef}
      className="rp-panel flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${zone?.bgColor ?? '#1a1510'}cc 0%, #1a1510 100%)`,
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
      }}
    >
      {!DIMETRIC_ENABLED && (
        <CombatParticles
          ref={particlesRef}
          playerRef={playerAvatarRef}
          mobRef={mobAvatarRef}
          containerRef={combatContainerRef}
        />
      )}
      {/* ── World Map — always visible at top (legacy path only) ── */}
      {!DIMETRIC_ENABLED && (
        <div style={{ padding: '4px 4px 0 4px', flexShrink: 0 }}>
          <WorldMapView />
        </div>
      )}

      {/* ── Thin zone info + status + override buttons ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 8px',
        borderBottom: '1px solid #2a2010',
        flexShrink: 0,
        gap: 6,
      }}>
        <span style={{ fontSize: '0.6rem', color: '#d4b896', flexShrink: 0 }}>
          {zoneName ?? 'Unknown Zone'}
          <span style={{ fontSize: '0.55rem', color: '#666', marginLeft: 6 }}>
            Lvl {zone?.levelRange[0]}–{zone?.levelRange[1]}
          </span>
        </span>

        {/* Auto-activity status */}
        {autoStatus && (
          <span style={{ fontSize: '0.52rem', color: autoStatus.color, flex: 1, textAlign: 'center', opacity: 0.9 }}>
            {autoStatus.label}
          </span>
        )}

        {/* Override buttons */}
        <div className="flex gap-1" style={{ flexShrink: 0 }}>
          {(['combat', 'gathering', 'crafting'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={isTraveling}
              title={`Force ${m} mode`}
              style={{
                fontSize: '0.50rem',
                padding: '1px 4px',
                borderRadius: 3,
                border: `1px solid ${gameMode === m && !mobApproaching ? '#c8a864' : '#2a2a2a'}`,
                background: gameMode === m && !mobApproaching ? '#2a1e00' : '#0d0d0d',
                color: gameMode === m && !mobApproaching ? '#ffd700' : '#444',
                cursor: isTraveling ? 'default' : 'pointer',
                opacity: isTraveling ? 0.3 : 1,
                transition: 'all 0.15s',
              }}
            >
              {m === 'combat'    ? '⚔'                : null}
              {m === 'gathering' ? prof.gatherIcon     : null}
              {m === 'crafting'  ? prof.craftIcon      : null}
            </button>
          ))}
          {ZONE_TOWN[currentZone] && (
            <button
              onClick={() => enterTown(ZONE_TOWN[currentZone]!)}
              disabled={isTraveling}
              title="Visit town"
              style={{
                fontSize: '0.50rem',
                padding: '1px 4px',
                borderRadius: 3,
                border: `1px solid ${gameMode === 'in_town' ? '#c8a864' : '#2a2a2a'}`,
                background: gameMode === 'in_town' ? '#2a1e00' : '#0d0d0d',
                color: gameMode === 'in_town' ? '#ffd700' : '#444',
                cursor: isTraveling ? 'default' : 'pointer',
                opacity: isTraveling ? 0.3 : 1,
                transition: 'all 0.15s',
              }}
            >
              🏠
            </button>
          )}
        </div>
      </div>

      {/* ── Unified dimetric world scene (Phase 2) — the always-visible backdrop ── */}
      {DIMETRIC_ENABLED && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <DimetricWorldScene />
        </div>
      )}
      {DIMETRIC_ENABLED && gameMode === 'combat' && <SkillBar />}

      {/* ── Traveling overlay ── */}
      {gameMode === 'traveling' && <TravelOverlay />}

      {/* ── Gathering panel ── */}
      {gameMode === 'gathering' && <GatheringPanel />}

      {/* ── Crafting panel ── */}
      {gameMode === 'crafting' && <CraftingPanel />}

      {/* ── Town panel ── */}
      {gameMode === 'in_town' && currentTown && <TownView />}

      {/* ── Combat arena (legacy path only) ── */}
      {!DIMETRIC_ENABLED && gameMode === 'combat' && (
        <>
          <div className="flex-1 flex items-center justify-around px-4 pt-1 pb-1" style={{ minHeight: 140 }}>

            {/* Player side */}
            <div className="flex flex-col items-center gap-1" style={{ width: 100 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase' }}>You</div>
                {playerName && (
                  <div style={{ fontSize: '0.55rem', color: '#d4b896', fontStyle: 'italic', marginTop: 1 }}>
                    {playerName}
                  </div>
                )}
              </div>

              {/* Player buffs */}
              <StatusEffects buffs={activeBuffs} />

              {/* Avatar + thought bubble wrapper */}
              <div ref={playerAvatarRef} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <ThoughtBubble />
                <AvatarRenderer
                  seed={playerAvatarSeed}
                  palette={playerPalette}
                  cellSize={9}
                  animate={isAlive}
                  attackAnim={playerAnimClass === 'avatar-attacking' || playerAnimClass === 'avatar-spell-cast'}
                  hitAnim={mobAnimClass === 'avatar-hit'}
                />
              </div>

              {/* Combo points */}
              {procState.comboPoints > 0 && (
                <div style={{ fontSize: '0.5rem', color: '#ff8800' }}>
                  {'●'.repeat(procState.comboPoints)}{'○'.repeat(Math.max(0, 5 - procState.comboPoints))} CP
                </div>
              )}

              <div style={{ width: '100%' }}>
                <HealthBar
                  current={Math.max(0, stats.currentHp)}
                  max={stats.maxHp}
                  type="hp"
                  height={10}
                />
              </div>

              {!isAlive && (
                <div className="text-center" style={{ fontSize: '0.6rem', color: '#ff4444' }}>
                  💀 {Math.ceil(respawnTimer)}s
                  <br />
                  <button className="rp-button mt-1" onClick={respawnNow} style={{ fontSize: '0.55rem' }}>
                    Respawn
                  </button>
                </div>
              )}
            </div>

            {/* Combat gap — approach indicator only (particles handle the rest) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, flexShrink: 0 }}>
              <span style={{ color: mobApproaching ? '#ff6644' : '#333', fontSize: mobApproaching ? '0.65rem' : '0.9rem', fontWeight: 700, transition: 'all 0.3s' }}>
                {mobApproaching ? `↘ ${Math.round(mobDist)}` : '⚔'}
              </span>
            </div>

            {/* Mob side */}
            <div className="flex flex-col items-center gap-1" style={{ width: 120 }}>
              {currentMob ? (
                <>
                  <div style={{
                    fontSize: '0.6rem',
                    color: currentMob.isBoss ? '#ff8000' : currentMob.isElite ? '#a335ee' : '#888',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}>
                    {currentMob.name}
                  </div>

                  {/* Mob DoTs + frozen — only when engaged */}
                  {!mobApproaching && (
                    <div className="flex flex-col items-center gap-0.5">
                      {procState.mobFrozen && (
                        <div style={{ fontSize: '0.5rem', color: '#6af' }}>
                          🥶 {procState.mobFrozenTimer.toFixed(1)}s
                        </div>
                      )}
                      <StatusEffects dots={activeDoTs} />
                    </div>
                  )}

                  <div ref={mobAvatarRef} style={mobApproaching ? { opacity: 0.4, filter: 'blur(1.5px)', transition: 'all 0.5s' } : { transition: 'all 0.5s' }}>
                    {mobPalette && (
                      <AvatarRenderer
                        seed={mobSeed}
                        palette={mobPalette}
                        cellSize={mobCellSize}
                        animate={!mobApproaching}
                      />
                    )}
                  </div>

                  {mobApproaching ? (
                    <div style={{ fontSize: '0.5rem', color: '#888', textAlign: 'center' }}>
                      incoming in ~{Math.round(mobDist / 2.5)}s
                    </div>
                  ) : (
                    <div style={{ width: '100%' }}>
                      <HealthBar
                        current={currentMob.currentHp}
                        max={currentMob.maxHp}
                        type="mob-hp"
                        height={10}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center" style={{ color: '#555', fontSize: '0.65rem', paddingTop: 30 }}>
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

      {/* Floating damage numbers — always rendered on top (legacy path only;
          the dimetric host owns its own floater pool) */}
      {!DIMETRIC_ENABLED && (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        {floatingNumbers.map(fn => (
          <div
            key={fn.id}
            className="damage-float"
            style={{
              position: 'absolute',
              left: `${fn.x}%`,
              top: `${fn.y}%`,
              color: fn.isMobDamage
                ? '#ff6666'
                : fn.isDoT
                  ? (fn.color ?? '#aa88ff')
                  : fn.isCrit
                    ? '#ffcc00'
                    : '#88bbff',
              fontSize: fn.isCrit ? '1.1rem' : '0.9rem',
              pointerEvents: 'none',
            }}
          >
            {fn.isMobDamage ? '-' : ''}{fn.value}
            {fn.isCrit && !fn.isDoT ? '!' : ''}
          </div>
        ))}
      </div>
      )}

      {/* XP / Level bar at bottom */}
      <div className="px-2 pb-1" style={{ flexShrink: 0 }}>
        <div className="flex justify-between text-xs mb-0.5" style={{ color: '#9d9d9d', fontSize: '0.6rem' }}>
          <span className={classDef.colorClass}>{classDef.name}</span>
          <span>Level {level}</span>
          <span>{xp} / {xpNeeded} XP</span>
        </div>
        <HealthBar current={xp} max={xpNeeded} type="xp" height={8} showText={false} />
      </div>
    </div>
  )
}
