import React, { useState } from 'react'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { RACE_DEFINITIONS } from '../../data/races'
import { FACTION_DEFINITIONS, FACTION_NAME_COLOR } from '../../data/factions'
import { ZONES } from '../../data/zones'
import { HeroAvatar } from '../sprites/HeroAvatar'
import { MAX_SLOTS } from '../../store/saveSlots'
import type { SaveSlotMeta } from '../../store/saveSlots'

interface CharacterSelectProps {
  slots:      SaveSlotMeta[]
  onContinue: (id: string) => void
  onCreate:   () => void
  onDelete:   (id: string) => void
}

function relativeTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60)     return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)     return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)     return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function CharacterSelect({ slots, onContinue, onCreate, onDelete }: CharacterSelectProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const full = slots.length >= MAX_SLOTS

  return (
    <div
      className="flex flex-col items-center px-4"
      style={{
        // Same safe-area fix as CharacterCreate: `viewport-fit=cover` means a flat `py-8`
        // puts the Stillmarch wordmark under the Dynamic Island on a notched iPhone.
        paddingTop: 'calc(2rem + var(--safe-t))',
        paddingBottom: 'calc(2rem + var(--safe-b))',
        // Own scroll container: the app shell locks body to 100dvh/overflow-hidden, so
        // with several hero cards the list must scroll here. Dropped justify-center +
        // min-h-screen — centering pushed tall content off both ends unreachably, and
        // 100vh exceeds 100dvh on mobile (URL bar), overflowing the locked body.
        height: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'radial-gradient(ellipse at center, #1e1a10 0%, #0d0b05 100%)',
      }}
    >
      <div className="mb-8 text-center">
        <h1 style={{
          fontFamily: '"Cinzel Decorative", var(--font-display)',
          fontSize: 'clamp(1.8rem, 5vw, 3rem)',
          color: 'var(--gold)',
          textShadow: '0 0 20px rgba(200,161,0,0.5), 0 2px 4px rgba(0,0,0,0.9)',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}>
          Stillmarch
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
          CHOOSE YOUR HERO
        </p>
      </div>

      <div className="flex gap-5 flex-wrap justify-center px-4" style={{ maxWidth: 900 }}>
        {slots.map(slot => {
          const s = slot.summary
          const cls    = CLASS_DEFINITIONS[s.playerClass]
          const race   = RACE_DEFINITIONS[s.playerRace]
          const zone   = ZONES[s.currentZone]
          const isConfirming = confirmDelete === slot.id

          return (
            <div
              key={slot.id}
              className="rp-panel"
              style={{ width: 220, padding: 16, textAlign: 'center', position: 'relative' }}
            >
              <div className="flex justify-center mb-3">
                <HeroAvatar
                  race={s.playerRace}
                  playerClass={s.playerClass}
                  name={s.playerName}
                  faction={s.playerFaction}
                  size={72}
                  animate={false}
                  circle
                />
              </div>

              <div className={`text-lg font-bold ${cls?.colorClass ?? ''}`} style={{ fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
                {s.playerName || 'The Wanderer'}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2, marginBottom: 8 }}>
                Lv {s.level} {race?.name ?? s.playerRace} {cls?.name ?? s.playerClass}
              </div>

              <div style={{ fontSize: '0.58rem', borderTop: '1px solid var(--edge)', paddingTop: 6, marginBottom: 10 }}>
                <div className="flex justify-between">
                  <span style={{ color: '#666' }}>Faction</span>
                  {/* The TEXT tone, not the crest tone. `FACTION_DEFINITIONS[].color` is
                      the deep banner colour meant for fills; at 0.58rem on a dark card the
                      Ashmarch's `#c0392b` reads as brown. Same table as every nameplate. */}
                  <span style={{ color: FACTION_NAME_COLOR[s.playerFaction] ?? 'var(--parchment)' }}>
                    {s.factionName || FACTION_DEFINITIONS[s.playerFaction]?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span style={{ color: '#666' }}>Zone</span>
                  <span style={{ color: 'var(--parchment)' }}>{zone?.name ?? s.currentZone}</span>
                </div>
                {s.zoneCircuit > 0 && (
                  <div className="flex justify-between mt-1">
                    <span style={{ color: '#666' }}>Circuit</span>
                    <span style={{ color: '#cc88ff' }}>{s.zoneCircuit}</span>
                  </div>
                )}
                <div className="flex justify-between mt-1">
                  <span style={{ color: '#666' }}>Played</span>
                  <span style={{ color: '#8a8a8a' }}>{relativeTime(slot.lastPlayedAt)}</span>
                </div>
              </div>

              {isConfirming ? (
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#ff8888', marginBottom: 6 }}>
                    Delete this hero permanently?
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rp-button flex-1"
                      style={{ fontSize: '0.62rem', background: 'linear-gradient(180deg, #7a2020, #4a1010)' }}
                      onClick={() => { onDelete(slot.id); setConfirmDelete(null) }}
                    >
                      Delete
                    </button>
                    <button
                      className="rp-button flex-1"
                      style={{ fontSize: '0.62rem' }}
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    className="rp-button flex-1"
                    style={{ fontSize: '0.68rem', background: 'linear-gradient(180deg, var(--wood-lit), #4a3518)' }}
                    onClick={() => onContinue(slot.id)}
                  >
                    Continue
                  </button>
                  <button
                    className="rp-button"
                    style={{ fontSize: '0.62rem', color: '#b06666', padding: '0 8px' }}
                    title="Delete hero"
                    onClick={() => setConfirmDelete(slot.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* New Character card */}
        <div
          className="rp-panel"
          style={{
            width: 220,
            padding: 16,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 260,
            cursor: full ? 'not-allowed' : 'pointer',
            opacity: full ? 0.5 : 1,
            borderStyle: 'dashed',
          }}
          onClick={() => { if (!full) onCreate() }}
        >
          <div style={{ fontSize: '2.5rem', color: 'var(--wood-lit)', lineHeight: 1 }}>＋</div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--parchment)', fontSize: '0.85rem', marginTop: 8 }}>
            New Character
          </div>
          <div style={{ fontSize: '0.58rem', color: '#666', marginTop: 6 }}>
            {full ? `Max ${MAX_SLOTS} heroes` : `${slots.length} / ${MAX_SLOTS} slots used`}
          </div>
        </div>
      </div>

      <p style={{ color: '#555', fontSize: '0.65rem', marginTop: 32 }}>
        Each hero saves independently. Progress is saved automatically.
      </p>
    </div>
  )
}
