import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { CLASS_DEFINITIONS } from '../../data/classes'
import { spentInSpec, specCapacity, totalSpent, deepestSpec } from '../../data/specs'
import { TALENT_POINT_MAX } from '../../data/constants'
import { SpriteIcon } from '../ui/SpriteIcon'
import { TalentPanel } from './TalentPanel'

/**
 * The talent SUMMARY, in the character sidebar.
 *
 * This used to be the whole talent tree, crammed into a 252px rail. Three specs cannot
 * live there, so the tree moved to a full-screen surface (`TalentPanel`) and what stays
 * behind is the thing a sidebar is actually good at: telling you at a glance where your
 * points went and whether you have any left. One button opens the real screen.
 */
export function TalentTree() {
  const { playerClass, level, talentAllocs, talentPoints } = useGameStore()
  const [open, setOpen] = useState(false)

  const specs = CLASS_DEFINITIONS[playerClass].specs
  const spent = totalSpent(talentAllocs)
  const earned = Math.min(level, TALENT_POINT_MAX)
  const title = deepestSpec(playerClass, talentAllocs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* The hero's title — whichever tree they have fed most. Blank until they have
          actually committed to one, because "no spec yet" is true and worth saying. */}
      <div className="talent-sum-head">
        <span style={{ color: title ? title.accent : '#6a6458', fontWeight: 700 }}>
          {title ? title.name : 'No specialization yet'}
        </span>
        <span style={{ color: '#6a6458', fontSize: '0.55rem' }}>
          {spent}/{earned} pts
        </span>
      </div>

      {specs.map(spec => {
        const pts = spentInSpec(talentAllocs, spec.id)
        const cap = specCapacity(spec)
        return (
          <button
            key={spec.id}
            className="talent-sum-row"
            onClick={() => setOpen(true)}
            title={`${spec.name} — ${spec.tagline}`}
          >
            <span
              className="talent-sum-crest"
              style={{
                borderColor: pts > 0 ? spec.accent : '#3a352c',
                boxShadow: pts > 0 ? `0 0 8px ${spec.accent}55` : 'none',
              }}
            >
              <SpriteIcon talent={spec.icon as any} emoji="⚔" size={16} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="talent-sum-name" style={{ color: pts > 0 ? spec.accent : '#8a8578' }}>
                {spec.name}
                {cap === 0 && <em className="talent-sum-soon"> · soon</em>}
              </span>
              <span className="talent-sum-bar">
                <i style={{
                  width: `${cap ? (pts / cap) * 100 : 0}%`,
                  background: spec.accent,
                }} />
              </span>
            </span>
            <span className="talent-sum-pts" style={{ color: pts > 0 ? spec.accent : '#5a544a' }}>
              {pts}
            </span>
          </button>
        )
      })}

      <button
        className="rp-button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          fontSize: '0.6rem',
          padding: '5px 0',
          borderColor: talentPoints > 0 ? '#00cc66' : undefined,
          color: talentPoints > 0 ? '#00ff88' : undefined,
          fontWeight: talentPoints > 0 ? 700 : 400,
        }}
      >
        {talentPoints > 0 ? `Spend ${talentPoints} point${talentPoints === 1 ? '' : 's'}` : 'View talents'}
      </button>

      <TalentPanel open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
