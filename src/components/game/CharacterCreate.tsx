import React, { useState } from 'react'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { RACE_DEFINITIONS } from '../../data/races'
import { FACTION_DEFINITIONS } from '../../data/factions'
import { generatePlayerNameFallback } from '../../engine/nameGen'
import { NAME_MAX, nameRejection } from '../../moderation/wordFilter'
import { useGameStore } from '../../store/gameStore'
import { HeroPreview } from './HeroPreview'
import type { ClassType, RaceType, FactionType } from '../../data/types'
import { SpriteIcon } from '../ui/SpriteIcon'

interface CharacterCreateProps {
  onCreate: (cls: ClassType, race: RaceType, opts: { name: string; faction: FactionType }) => void
  onBack?:  () => void   // return to character select (only when other heroes exist)
}

const randSeed = () => Math.floor(Math.random() * 0x7fffffff)

export function CharacterCreate({ onCreate, onBack }: CharacterCreateProps) {
  const factionNames = useGameStore(s => s.factionNames)

  const [cls,  setCls]  = useState<ClassType>('warrior')
  const [race, setRace] = useState<RaceType>(CLASS_DEFINITIONS.warrior.allowedRaces[0])
  const [neutralSide, setNeutralSide] = useState<FactionType>('alliance')

  const [nameSeed, setNameSeed]     = useState(randSeed)
  const [customName, setCustomName] = useState<string | null>(null)
  const [editing, setEditing]       = useState(false)

  const raceFaction      = RACE_DEFINITIONS[race].faction
  const effectiveFaction = raceFaction === 'neutral' ? neutralSide : raceFaction
  const name             = customName ?? generatePlayerNameFallback(nameSeed, cls)

  const classDef = CLASS_DEFINITIONS[cls]
  const allowedRaces = classDef.allowedRaces

  function pickClass(c: ClassType) {
    setCls(c)
    if (!CLASS_DEFINITIONS[c].allowedRaces.includes(race)) {
      setRace(CLASS_DEFINITIONS[c].allowedRaces[0])
    }
  }

  function reroll() {
    setCustomName(null)
    setEditing(false)
    setNameSeed(randSeed())
  }

  // ── The name filter (App Review 1.2) ──────────────────────────────────────
  // A character name is the ONLY thing one player authors that another player sees — it is
  // published to `roster_snapshots` and shown on the ladder and on ghosts in the world. So
  // it is the whole user-generated surface, and this is where the filter belongs.
  //
  // Computed on every keystroke rather than checked on submit, so the player sees the
  // problem while they are still typing rather than being bounced by a button that stopped
  // working for no stated reason.
  const rejection = nameRejection(name)

  function begin() {
    const finalName = name.trim() || generatePlayerNameFallback(nameSeed, cls)
    // Belt and braces. The button is disabled while `rejection` is set, but a disabled
    // button is a UI state and this is the gate — Enter, a stale render or a future
    // refactor should not be able to walk past it.
    if (nameRejection(finalName)) return
    onCreate(cls, race, { name: finalName, faction: effectiveFaction })
  }

  const factionDef = FACTION_DEFINITIONS[effectiveFaction]

  return (
    <div
      className="flex flex-col items-center px-4"
      style={{
        // Padding carries the SAFE-AREA insets rather than being a flat `py-6`.
        // `viewport-fit=cover` (index.html) makes the WebView span the whole display, so a
        // fixed 24px top put "Create Your Hero" underneath the Dynamic Island on an
        // iPhone 17 Pro — the title cut in half by the pill and the clock sitting on the
        // first letter. This is the first screen a new player and an App Store reviewer
        // ever see, so it is the worst possible place for it.
        paddingTop: 'calc(1.5rem + var(--safe-t))',
        paddingBottom: 'calc(1.5rem + var(--safe-b))',
        // Definite viewport height + internal scroll: the app shell locks body to
        // 100dvh/overflow-hidden, so this screen must own its own scroll or tall
        // content (small phones) clips unreachably. min-h-screen (100vh) is a trap
        // here — it exceeds 100dvh by the mobile URL bar and overflows the locked body.
        height: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'radial-gradient(ellipse at center, #1e1a10 0%, #0d0b05 100%)',
      }}
    >
      <div className="text-center mb-4" style={{ width: '100%', maxWidth: 460 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ color: '#666', fontSize: '0.7rem', marginBottom: 8, cursor: 'pointer', background: 'none', border: 'none', float: 'left' }}
          >
            ← Back to Heroes
          </button>
        )}
        <h1 style={{
          fontFamily: '"Cinzel Decorative", var(--font-display)',
          fontSize: 'clamp(1.5rem, 5vw, 2.4rem)',
          color: 'var(--gold)',
          textShadow: '0 0 20px rgba(200,161,0,0.5), 0 2px 4px rgba(0,0,0,0.9)',
          letterSpacing: '0.1em',
        }}>
          Create Your Hero
        </h1>
      </div>

      {/* ── Live dimetric preview ── */}
      <HeroPreview playerClass={cls} race={race} faction={effectiveFaction} name={name} size={172} />

      {/* ── Name (generated + reroll/edit) ── */}
      <div className="flex items-center gap-2 mt-3 mb-1" style={{ width: '100%', maxWidth: 340 }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setCustomName(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false) }}
            maxLength={NAME_MAX}
            className="flex-1 rp-panel"
            style={{
              fontFamily: 'var(--font-display)', color: 'var(--gold-bright)', fontSize: '1rem',
              textAlign: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.4)',
            }}
          />
        ) : (
          <div
            className="flex-1 rp-panel"
            style={{
              fontFamily: 'var(--font-display)', color: 'var(--gold-bright)', fontSize: '1rem',
              textAlign: 'center', padding: '7px 10px', cursor: 'text',
            }}
            onClick={() => setEditing(true)}
            title="Tap to edit"
          >
            {name || 'Unnamed'}
          </div>
        )}
        <button className="rp-button" style={{ fontSize: '0.9rem', padding: '6px 10px' }} title="Reroll name" onClick={reroll}><SpriteIcon ui="dice" size={16} /></button>
        <button className="rp-button" style={{ fontSize: '0.75rem', padding: '6px 10px' }} title="Edit name" onClick={() => setEditing(true)}><SpriteIcon ui="quill" size={14} /></button>
      </div>

      {/* Never quotes the offending term back. Echoing it would turn this message into a
          probe for finding out exactly which spellings the filter lets through. */}
      {rejection && (
        <div role="alert" style={{
          maxWidth: 340, fontSize: '0.55rem', color: '#e08a7a', textAlign: 'center',
          lineHeight: 1.5, marginBottom: 2,
        }}>
          {rejection}
        </div>
      )}

      {/* ── Class ── */}
      <div className="mt-4" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.15em', marginBottom: 6 }}>CLASS</div>
        <div className="flex gap-2 flex-wrap">
          {Object.values(CLASS_DEFINITIONS).map(c => {
            const on = c.id === cls
            return (
              <button
                key={c.id}
                className="rp-button flex-1"
                style={{
                  minWidth: 90, padding: '8px 6px', fontFamily: 'var(--font-display)', fontSize: '0.8rem',
                  background: on ? 'linear-gradient(180deg, var(--wood-lit), #4a3518)' : undefined,
                  borderColor: on ? 'var(--gold)' : undefined,
                }}
                onClick={() => pickClass(c.id as ClassType)}
              >
                <span className={c.colorClass}>{c.name}</span>
              </button>
            )
          })}
        </div>
        {/* What the class actually plays like.
            `ClassDefinition.description` has existed since the classes were written and
            was rendered nowhere — so the first real decision the game asks of you was made
            from a name and a colour swatch. The primary stat rides along because it is the
            one mechanical fact that changes how the class feels to play, and it is
            otherwise not discoverable until the character sheet exists. */}
        <div className="create-class-blurb">
          <p>{classDef.description}</p>
          <span className="create-class-stat">
            Primary stat · <b className={classDef.colorClass}>{classDef.primaryStat}</b>
          </span>
        </div>
      </div>

      {/* ── Race ── */}
      <div className="mt-3" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.15em', marginBottom: 6 }}>RACE</div>
        <div className="flex gap-2 flex-wrap">
          {allowedRaces.map(rid => {
            const r = RACE_DEFINITIONS[rid]
            const on = rid === race
            return (
              <button
                key={rid}
                className="rp-button"
                style={{
                  padding: '7px 10px', fontSize: '0.75rem',
                  background: on ? 'linear-gradient(180deg, var(--wood-lit), #4a3518)' : undefined,
                  borderColor: on ? 'var(--gold)' : undefined,
                }}
                onClick={() => setRace(rid)}
                title={r.racialPassiveLabel}
              >
                {r.name}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '0.58rem', color: '#8a7a58', marginTop: 5 }}>
          {RACE_DEFINITIONS[race].racialPassiveLabel}
        </div>
      </div>

      {/* ── Faction (toggle only for neutral races) ── */}
      <div className="mt-3" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.15em', marginBottom: 6 }}>FACTION</div>
        {raceFaction === 'neutral' ? (
          <div className="flex gap-2">
            {(['alliance', 'horde'] as FactionType[]).map(f => {
              const on = neutralSide === f
              const fd = FACTION_DEFINITIONS[f]
              return (
                <button
                  key={f}
                  className="rp-button flex-1"
                  style={{
                    padding: '8px', fontSize: '0.72rem',
                    color: fd.color,
                    background: on ? `linear-gradient(180deg, ${fd.color}33, ${fd.color}11)` : undefined,
                    borderColor: on ? fd.color : undefined,
                  }}
                  onClick={() => setNeutralSide(f)}
                >
                  {factionNames[f] ?? fd.name}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rp-panel" style={{ padding: '8px 10px', textAlign: 'center', color: factionDef.color, fontSize: '0.8rem' }}>
            {factionNames[effectiveFaction] ?? factionDef.name}
          </div>
        )}
      </div>

      <button
        className="rp-button mt-6"
        style={{
          width: '100%', maxWidth: 460, padding: '12px', fontSize: '0.95rem',
          fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
          background: 'linear-gradient(180deg, #7a5f2c, #52401c)', borderColor: 'var(--gold)',
          opacity: rejection ? 0.5 : 1,
        }}
        onClick={begin}
        disabled={!!rejection}
      >
        Begin Your Legend
      </button>

      <p style={{ color: '#555', fontSize: '0.62rem', marginTop: 14 }}>
        Your hero saves automatically. You can create more from the menu.
      </p>
    </div>
  )
}
