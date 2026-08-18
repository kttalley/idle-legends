import React from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { ZONE_MATERIALS, MATERIALS, CLASS_PROFESSIONS } from '../../data/professions'
import { ZONES } from '../../data/zones'
import { HealthBar } from '../ui/HealthBar'
import { SpriteIcon } from '../ui/SpriteIcon'
import { StrikeMeter } from './StrikeMeter'
import {
  GATHER_SECONDS, QUALITY_LABEL, QUALITY_RARITY, RICHNESS_COLOR, RICHNESS_LABEL,
  stockPurity, stockQuality,
} from '../../engine/crafting'
import { projectGathering } from '../../engine/offline'

// The gathering panel is now the STOCK LEDGER — what you hold and how good it is. The
// moment-to-moment interaction lives on the world itself (StrikeMeter), so this panel
// never has to be looked at for the hero to keep working.

export function GatheringPanel() {
  const {
    currentZone, playerClass, gatheringTimer, materials, materialPurity, gatherSession,
    setMode, generatedZoneNames,
  } = useGameStore()

  const prof     = CLASS_PROFESSIONS[playerClass]
  const matId    = ZONE_MATERIALS[currentZone][playerClass]
  const mat      = MATERIALS[matId]
  const zoneName = generatedZoneNames[currentZone] ?? ZONES[currentZone]?.name ?? currentZone

  // All materials this class can ever gather
  const classMaterials = Object.values(ZONE_MATERIALS).map(z => z[playerClass])
  const uniqueMats     = [...new Set(classMaterials)]

  const hasMaterials = uniqueMats.some(m => (materials[m] ?? 0) > 0)
  const gatherPct    = 1 - gatheringTimer / GATHER_SECONDS

  // The idle floor, stated to the player rather than only promised in a design doc.
  const idle = projectGathering(60)

  return (
    <div className="flex flex-col gap-2" style={{ padding: '8px 10px' }}>
      {/* The minigame first, and inside the panel rather than floating beneath it.
          As separate layers the panel simply covered the meter — the one thing in
          gathering mode the player is actually meant to be looking at. */}
      <div className="flex justify-center"><StrikeMeter /></div>

      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          {prof.gatheringName}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--parchment)', marginTop: 1 }}>
          <SpriteIcon emoji={prof.gatherIcon} size={16} /> {prof.gatherVerb} — {zoneName}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#aaa', marginTop: 1 }}>
          Harvesting <SpriteIcon emoji={mat.icon} size={14} title={mat.name} /> {mat.name}
          {gatherSession && (
            <span style={{ color: RICHNESS_COLOR[gatherSession.richness], marginLeft: 5 }}>
              · {RICHNESS_LABEL[gatherSession.richness]} vein
            </span>
          )}
        </div>
      </div>

      {/* Gather progress bar */}
      <div>
        <HealthBar
          current={gatherPct * 100}
          max={100}
          type="xp"
          height={10}
          showText={false}
        />
        <div style={{ fontSize: '0.55rem', color: '#888', textAlign: 'center', marginTop: 2 }}>
          Next harvest in {gatheringTimer.toFixed(1)}s
          <span style={{ color: '#5a564e' }}>
            {'  ·  '}idle rate {idle.unitsPerMinute}/min at {QUALITY_LABEL[idle.quality]}
          </span>
        </div>
      </div>

      {/* Materials inventory — each stack carries its own quality */}
      <div>
        <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: 3 }}>
          Materials
          <span style={{ textTransform: 'none', color: '#4c4840', marginLeft: 5 }}>
            — strike the vein to raise quality
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {uniqueMats.map(mId => {
            const m   = MATERIALS[mId]
            const qty = materials[mId] ?? 0
            const q   = stockQuality(materials, materialPurity, mId)
            const p   = stockPurity(materials, materialPurity, mId)
            const qc  = rarityColor(QUALITY_RARITY[q])
            return (
              <div
                key={mId}
                title={qty > 0 ? `${QUALITY_LABEL[q]} — ${p.toFixed(1)} purity per unit` : 'None held'}
                style={{
                  background: qty > 0 ? '#2a2010' : '#111',
                  border: `1px solid ${qty > 0 ? `${qc}66` : '#333'}`,
                  borderRadius: 4,
                  padding: '2px 5px',
                  fontSize: '0.6rem',
                  color: qty > 0 ? 'var(--parchment)' : '#444',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <SpriteIcon emoji={m.icon} size={14} title={m.name} />
                <span>{m.name}</span>
                <span style={{ color: qty > 0 ? 'var(--gold)' : '#444', fontWeight: 600 }}>×{qty}</span>
                {qty > 0 && (
                  <span style={{ color: qc, fontSize: '0.52rem' }}>{QUALITY_LABEL[q]}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* No footer. This panel used to end with "Fight" and a jump to the craft — both of
          which are the action bar's own mode toggles, permanently on screen a couple of
          inches below and already showing which mode is lit. Drawing them again here made
          the bar look like it might not work, and cost the panel a row of height on the
          screen size that can least afford one. Dismissal is the frame's ✕; switching
          activity is the bar's job. */}
    </div>
  )
}
