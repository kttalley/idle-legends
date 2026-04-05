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
    mobMapOffset,
    equipment,
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

  // ── Combat animation state ──────────────────────────────────────────────────
  const [playerAnimClass, setPlayerAnimClass] = useState('')
  const [mobAnimClass,    setMobAnimClass]    = useState('')
  const [impactChar,      setImpactChar]      = useState<string | null>(null)
  const [impactColor,     setImpactColor]     = useState('#ffffff')

  // Detect spell class for player attack animation
  const isSpellClass =
    playerPalette.shades[0] === '#050a30' ||  // mage
    playerPalette.shades[0] === '#100520'      // warlock

  const prevFnIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const currentIds = new Set(floatingNumbers.map(fn => fn.id))
    // Find IDs not seen before
    const newFns = floatingNumbers.filter(fn => !prevFnIds.current.has(fn.id))
    prevFnIds.current = currentIds

    if (newFns.length === 0) return

    for (const fn of newFns) {
      if (!fn.isMobDamage) {
        // Player attacked — lunge + impact flash
        setPlayerAnimClass(isSpellClass ? 'avatar-spell-cast' : 'avatar-attacking')
        const char  = fn.isCrit ? '★' : fn.isDoT ? '●' : isSpellClass ? '●' : '✕'
        const color = fn.isCrit ? '#ffcc00' : fn.isDoT ? '#aa88ff' : isSpellClass ? '#70a0ff' : '#ff8866'
        setImpactChar(char)
        setImpactColor(color)
        setTimeout(() => { setPlayerAnimClass(''); setImpactChar(null) }, 280)
      } else {
        // Mob attacked — player takes hit
        setMobAnimClass('avatar-hit')
        setTimeout(() => setMobAnimClass(''), 350)
      }
    }
  }, [floatingNumbers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-mode status label
  const autoStatus = (() => {
    if (isTraveling) return null
    if (mobApproaching) return { label: `${currentMob!.isBoss ? '⚠' : '↘'} ${currentMob!.name} approaching…`, color: currentMob!.isBoss ? '#ff8000' : '#ff6666' }
    if (gameMode === 'gathering') return { label: `${prof.gatherIcon} Gathering…`, color: '#88cc88' }
    if (gameMode === 'crafting') return { label: `${prof.craftIcon} Crafting…`, color: '#ffd700' }
    if (gameMode === 'combat' && currentMob) return { label: `⚔ Fighting ${currentMob.name}`, color: '#88aaff' }
    return null
  })()

  return (
    <div
      className="rp-panel flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${zone?.bgColor ?? '#1a1510'}cc 0%, #1a1510 100%)`,
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* ── World Map — always visible at top ── */}
      <div style={{ padding: '4px 4px 0 4px', flexShrink: 0 }}>
        <WorldMapView />
      </div>

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
        </div>
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
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
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

            {/* Combat gap — VS / impact overlay */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, flexShrink: 0 }}>
              <span style={{ color: mobApproaching ? '#ff6644' : '#555', fontSize: mobApproaching ? '0.65rem' : '1rem', fontWeight: 700, transition: 'all 0.3s' }}>
                {mobApproaching ? `↘ ${Math.round(mobDist)}` : '⚔'}
              </span>
              {impactChar && (
                <span
                  style={{
                    position: 'absolute',
                    fontSize: impactChar === '★' ? '1.4rem' : '1.1rem',
                    color: impactColor,
                    textShadow: `0 0 8px ${impactColor}`,
                    pointerEvents: 'none',
                    animation: 'impact-flash 0.25s ease-out forwards',
                  }}
                >
                  {impactChar}
                </span>
              )}
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

                  <div style={mobApproaching ? { opacity: 0.4, filter: 'blur(1.5px)', transition: 'all 0.5s' } : { transition: 'all 0.5s' }}>
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
            fontSize: fn.isCrit ? '1.1rem' : '0.9rem',
            pointerEvents: 'none',
          }}
        >
          {fn.isMobDamage ? '-' : ''}{fn.value}
          {fn.isCrit && !fn.isDoT ? '!' : ''}
        </div>
      ))}

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
