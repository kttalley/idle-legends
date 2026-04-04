import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONE_MATERIALS, MATERIALS, CLASS_PROFESSIONS } from '../../data/professions'
import { ZONES } from '../../data/zones'
import { HealthBar } from '../ui/HealthBar'

export function GatheringPanel() {
  const {
    currentZone, playerClass, gatheringTimer, materials,
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
  const gatherPct    = 1 - gatheringTimer / 5   // 5s cycle

  return (
    <div className="flex flex-col gap-2 flex-1" style={{ padding: '10px 8px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          {prof.gatheringName}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#d4b896', marginTop: 1 }}>
          {prof.gatherIcon} {prof.gatherVerb} — {zoneName}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#aaa', marginTop: 1 }}>
          Harvesting {mat.icon} {mat.name}
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
        </div>
      </div>

      {/* Materials inventory */}
      <div>
        <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: 3 }}>
          Materials
        </div>
        <div className="flex flex-wrap gap-1">
          {uniqueMats.map(mId => {
            const m   = MATERIALS[mId]
            const qty = materials[mId] ?? 0
            return (
              <div
                key={mId}
                style={{
                  background: qty > 0 ? '#2a2010' : '#111',
                  border: `1px solid ${qty > 0 ? '#c9a22755' : '#333'}`,
                  borderRadius: 4,
                  padding: '2px 5px',
                  fontSize: '0.6rem',
                  color: qty > 0 ? '#d4b896' : '#444',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <span>{m.icon}</span>
                <span>{m.name}</span>
                <span style={{ color: qty > 0 ? '#ffd700' : '#444', fontWeight: 600 }}>×{qty}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto" style={{ paddingTop: 4 }}>
        <button
          className="rp-button"
          onClick={() => setMode('combat')}
          style={{ fontSize: '0.6rem', flex: 1 }}
        >
          ⚔ Fight
        </button>
        <button
          className="rp-button"
          onClick={() => setMode('crafting')}
          disabled={!hasMaterials}
          style={{ fontSize: '0.6rem', flex: 1, opacity: hasMaterials ? 1 : 0.4 }}
        >
          🔨 Craft
        </button>
      </div>
    </div>
  )
}
