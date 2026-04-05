import React, { useState, useMemo } from 'react'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { RACE_DEFINITIONS, FACTION_RACES } from '../../data/races'
import { FACTION_DEFINITIONS } from '../../data/factions'
import { AvatarRenderer, CLASS_PALETTES } from '../sprites/AvatarRenderer'
import { useGameStore } from '../../store/gameStore'
import type { ClassType, RaceType } from '../../data/types'

interface ClassSelectProps {
  onSelect: (cls: ClassType, race: RaceType) => void
}

type Step = 'class' | 'race'

const FACTION_ORDER: Array<'alliance' | 'horde' | 'neutral'> = ['alliance', 'horde', 'neutral']

export function ClassSelect({ onSelect }: ClassSelectProps) {
  const factionNames = useGameStore(s => s.factionNames)
  const [step, setStep]           = useState<Step>('class')
  const [hoveredClass, setHoveredClass] = useState<ClassType | null>(null)
  const [hoveredRace, setHoveredRace]   = useState<RaceType | null>(null)
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null)

  const classes = Object.values(CLASS_DEFINITIONS)

  const sessionSeeds = useMemo(() => {
    const base = Math.floor(Math.random() * 0xFFFFFF)
    return Object.fromEntries(
      classes.map((cls, i) => [cls.id, base ^ (i * 0x7A3F)])
    ) as Record<ClassType, number>
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const raceSeed = useMemo(() => Math.floor(Math.random() * 0xFFFFFF), [])

  function pickClass(cls: ClassType) {
    setSelectedClass(cls)
    setStep('race')
  }

  function pickRace(race: RaceType) {
    if (selectedClass) onSelect(selectedClass, race)
  }

  const allowedRaces = selectedClass
    ? CLASS_DEFINITIONS[selectedClass].allowedRaces
    : []

  // ── Class selection ──────────────────────────────────────────────────────────
  if (step === 'class') {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen"
        style={{ background: 'radial-gradient(ellipse at center, #1e1a10 0%, #0d0b05 100%)' }}
      >
        <div className="mb-8 text-center">
          <h1 style={{
            fontFamily: 'Cinzel Decorative, Cinzel, serif',
            fontSize: 'clamp(1.8rem, 5vw, 3rem)',
            color: '#ffd700',
            textShadow: '0 0 20px rgba(200,161,0,0.5), 0 2px 4px rgba(0,0,0,0.9)',
            letterSpacing: '0.1em',
            marginBottom: 4,
          }}>
            Idle Legends
          </h1>
          <p style={{ color: '#9d9d9d', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
            CHOOSE YOUR CLASS
          </p>
        </div>

        <div className="flex gap-6 flex-wrap justify-center px-4">
          {classes.map(cls => (
            <div
              key={cls.id}
              className="rp-panel cursor-pointer"
              style={{
                width: 180,
                padding: 16,
                textAlign: 'center',
                transition: 'all 0.15s',
                transform: hoveredClass === cls.id ? 'translateY(-4px)' : undefined,
                borderColor: hoveredClass === cls.id ? '#ffd700' : undefined,
              }}
              onMouseEnter={() => setHoveredClass(cls.id)}
              onMouseLeave={() => setHoveredClass(null)}
              onClick={() => pickClass(cls.id)}
            >
              <div className="flex justify-center mb-3">
                <AvatarRenderer
                  seed={sessionSeeds[cls.id as ClassType]}
                  palette={CLASS_PALETTES[cls.id as ClassType]}
                  cellSize={10}
                  animate={hoveredClass === cls.id}
                  circle
                />
              </div>
              <div className={`text-lg font-bold mb-1 ${cls.colorClass}`} style={{ fontFamily: 'Cinzel, serif' }}>
                {cls.name}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9d9d9d', lineHeight: 1.4, marginBottom: 8 }}>
                {cls.description}
              </div>
              <div style={{ fontSize: '0.6rem', borderTop: '1px solid #3a2c10', paddingTop: 6 }}>
                <div className="flex justify-between">
                  <span style={{ color: '#666' }}>Primary</span>
                  <span style={{ color: '#d4b896', textTransform: 'capitalize' }}>{cls.primaryStat}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span style={{ color: '#666' }}>Races</span>
                  <span style={{ color: '#d4b896' }}>{cls.allowedRaces.length}</span>
                </div>
              </div>
              <button
                className="rp-button w-full mt-3"
                style={{ background: hoveredClass === cls.id ? 'linear-gradient(180deg, #6a5228, #4a3518)' : undefined }}
              >
                Play {cls.name}
              </button>
            </div>
          ))}
        </div>

        <p style={{ color: '#555', fontSize: '0.65rem', marginTop: 32 }}>
          Your progress is saved automatically.
        </p>
      </div>
    )
  }

  // ── Race selection ───────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ background: 'radial-gradient(ellipse at center, #1e1a10 0%, #0d0b05 100%)' }}
    >
      <div className="mb-6 text-center">
        <button
          onClick={() => setStep('class')}
          style={{ color: '#666', fontSize: '0.7rem', marginBottom: 12, cursor: 'pointer', background: 'none', border: 'none' }}
        >
          ← Back to Class
        </button>
        <h1 style={{
          fontFamily: 'Cinzel Decorative, Cinzel, serif',
          fontSize: 'clamp(1.4rem, 4vw, 2.2rem)',
          color: '#ffd700',
          textShadow: '0 0 20px rgba(200,161,0,0.5), 0 2px 4px rgba(0,0,0,0.9)',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}>
          {selectedClass && <span className={CLASS_DEFINITIONS[selectedClass].colorClass}>{CLASS_DEFINITIONS[selectedClass].name}</span>}
        </h1>
        <p style={{ color: '#9d9d9d', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
          CHOOSE YOUR RACE
        </p>
      </div>

      {FACTION_ORDER.map(faction => {
        const factionRaces = FACTION_RACES[faction].filter(r => allowedRaces.includes(r))
        if (factionRaces.length === 0) return null
        const factionDef = FACTION_DEFINITIONS[faction]
        return (
          <div key={faction} className="mb-6 w-full max-w-2xl px-4">
            <div style={{
              fontSize: '0.65rem',
              color: factionDef.color,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 8,
              textAlign: 'center',
              textShadow: `0 0 6px ${factionDef.color}66`,
            }}>
              {factionNames[faction]}
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              {factionRaces.map(raceId => {
                const race = RACE_DEFINITIONS[raceId]
                const isHovered = hoveredRace === raceId
                return (
                  <div
                    key={raceId}
                    className="rp-panel cursor-pointer"
                    style={{
                      width: 160,
                      padding: 14,
                      textAlign: 'center',
                      transition: 'all 0.15s',
                      transform: isHovered ? 'translateY(-3px)' : undefined,
                      borderColor: isHovered ? factionDef.color : undefined,
                    }}
                    onMouseEnter={() => setHoveredRace(raceId)}
                    onMouseLeave={() => setHoveredRace(null)}
                    onClick={() => pickRace(raceId)}
                  >
                    <div className="flex justify-center mb-2">
                      <AvatarRenderer
                        seed={raceSeed ^ (raceId.charCodeAt(0) * 0x1F3A)}
                        palette={selectedClass ? CLASS_PALETTES[selectedClass] : CLASS_PALETTES.warrior}
                        cellSize={9}
                        animate={isHovered}
                        circle
                      />
                    </div>
                    <div style={{
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      fontFamily: 'Cinzel, serif',
                      color: factionDef.color,
                      marginBottom: 4,
                    }}>
                      {race.name}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#9d9d9d', lineHeight: 1.4, marginBottom: 6 }}>
                      {race.lore}
                    </div>
                    <div style={{
                      fontSize: '0.58rem',
                      color: '#b8a070',
                      borderTop: '1px solid #3a2c10',
                      paddingTop: 5,
                    }}>
                      {race.racialPassiveLabel}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <p style={{ color: '#555', fontSize: '0.65rem', marginTop: 16 }}>
        Neutral races may join either faction's path.
      </p>
    </div>
  )
}
