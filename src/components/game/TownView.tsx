import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { TOWNS } from '../../data/towns'
import { isTownHostileToPlayer } from '../../engine/zoneProgression'

const FACTION_COLOR: Record<string, string> = {
  alliance: '#6699ff',
  horde:    '#ff4444',
  neutral:  '#ddaa44',
}

const TYPE_LABEL: Record<string, string> = {
  friendly: 'Friendly',
  neutral:  'Neutral',
  hostile:  'Hostile',
}

const TYPE_COLOR: Record<string, string> = {
  friendly: '#44ff88',
  neutral:  '#ddaa44',
  hostile:  '#ff4444',
}

export function TownView() {
  const { currentTown, generatedTownNames, restInTown, leaveTown, playerFaction } = useGameStore()
  const [restFeedback, setRestFeedback] = useState(false)

  if (!currentTown) return null
  const town = TOWNS[currentTown]
  if (!town) return null

  const displayName = generatedTownNames[currentTown] ?? town.name
  const factionColor = FACTION_COLOR[town.faction] ?? '#d4b896'
  const typeLabel = TYPE_LABEL[town.type] ?? town.type
  const typeColor = TYPE_COLOR[town.type] ?? '#888'
  const hostileToPlayer = isTownHostileToPlayer(currentTown, playerFaction)

  function handleRest() {
    if (hostileToPlayer) return
    restInTown()
    setRestFeedback(true)
    setTimeout(() => setRestFeedback(false), 2000)
  }

  return (
    <div
      className="rp-panel"
      style={{
        margin: '4px 6px',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: factionColor }}>
          {displayName}
        </span>
        <span
          style={{
            fontSize: '0.5rem',
            color: typeColor,
            border: `1px solid ${typeColor}`,
            borderRadius: 3,
            padding: '0 4px',
            lineHeight: '1.4',
          }}
        >
          {typeLabel}{town.type === 'hostile' ? ' ⚠' : ''}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: '0.55rem', color: '#9d9d9d', fontStyle: 'italic' }}>
        {town.description}
      </div>

      {hostileToPlayer && (
        <div style={{ fontSize: '0.55rem', color: '#ff6666' }}>
          The locals recognize you as an enemy of {town.faction === 'horde' ? 'the Ashmarch' : 'the Concord'}. Rest is denied here.
        </div>
      )}

      {/* Services */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {town.services.includes('rest') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="rp-button"
              onClick={handleRest}
              disabled={hostileToPlayer}
              style={{ fontSize: '0.55rem', padding: '2px 8px' }}
            >
              Rest & Recover
            </button>
            {restFeedback && (
              <span style={{ fontSize: '0.5rem', color: '#44ff88' }}>
                Full HP restored
              </span>
            )}
          </div>
        )}
        {town.services.includes('vendor') && (
          <span style={{ fontSize: '0.55rem', color: '#888' }}>
            Vendor: coming soon
          </span>
        )}
        {town.services.includes('repair') && (
          <span style={{ fontSize: '0.55rem', color: '#888' }}>
            Repair: coming soon
          </span>
        )}
      </div>

      {/* Leave */}
      <div>
        <button
          className="rp-button"
          onClick={leaveTown}
          style={{ fontSize: '0.55rem', padding: '2px 8px' }}
        >
          Leave Town
        </button>
      </div>
    </div>
  )
}
