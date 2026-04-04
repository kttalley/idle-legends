import React, { useState, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { CLASS_DEFINITIONS } from '../../data/classes'
import type { TalentNodeDef } from '../../data/types'

// ── Layout constants ──────────────────────────────────────────────────────────
const CELL_W  = 72   // px per column
const CELL_H  = 78   // px per row
const NODE_W  = 58   // node box width
const NODE_H  = 62   // node box height
const PAD     = 4    // grid padding

// Node center in SVG/absolute space
function nodeCenter(t: TalentNodeDef) {
  return {
    x: PAD + (t.col - 1) * CELL_W + CELL_W / 2,
    y: PAD + (t.row - 1) * CELL_H + CELL_H / 2,
  }
}

// Node top-left for absolute positioning
function nodeOrigin(t: TalentNodeDef) {
  const cx = PAD + (t.col - 1) * CELL_W + CELL_W / 2
  const cy = PAD + (t.row - 1) * CELL_H + CELL_H / 2
  return { x: cx - NODE_W / 2, y: cy - NODE_H / 2 }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface Tooltip {
  node: TalentNodeDef
  rank: number
  x: number
  y: number
}

// ── Main component ────────────────────────────────────────────────────────────
export function TalentTree() {
  const {
    playerClass, talentAllocs, talentPoints,
    allocateTalent, deallocateTalent, resetTalents,
  } = useGameStore()

  const classDef   = CLASS_DEFINITIONS[playerClass]
  const talents    = classDef.talents
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const maxRow = talents.reduce((m, t) => Math.max(m, t.row), 0)
  const maxCol = talents.reduce((m, t) => Math.max(m, t.col), 0)
  const totalSpent = Object.values(talentAllocs).reduce((a, b) => a + b, 0)

  const gridW = PAD * 2 + maxCol * CELL_W
  const gridH = PAD * 2 + maxRow * CELL_H

  // Build SVG connector lines from `requires` field
  const connections: { from: TalentNodeDef; to: TalentNodeDef }[] = []
  for (const node of talents) {
    if (node.requires) {
      const parent = talents.find(t => t.id === node.requires)
      if (parent) connections.push({ from: parent, to: node })
    }
  }

  // Determine node visual state
  function nodeState(t: TalentNodeDef): 'maxed' | 'partial' | 'available' | 'locked' {
    const rank = talentAllocs[t.id] ?? 0
    if (rank >= t.maxRanks) return 'maxed'
    if (rank > 0) return 'partial'

    // Check unlock requirements
    const rowNeeded = (t.row - 1) * 5
    if (totalSpent < rowNeeded) return 'locked'
    if (t.requires) {
      const prereq = talents.find(p => p.id === t.requires)
      if (!prereq) return 'locked'
      if ((talentAllocs[t.requires] ?? 0) < prereq.maxRanks) return 'locked'
    }
    if (talentPoints <= 0) return 'locked'
    return 'available'
  }

  const STATE_COLORS = {
    maxed:     { border: '#ffd700', bg: '#2a1f00', icon: '#ffd700', rank: '#ffd700' },
    partial:   { border: '#c8a118', bg: '#1a1200', icon: '#d4b896', rank: '#c8a118' },
    available: { border: '#6a5228', bg: '#12100a', icon: '#888',    rank: '#666' },
    locked:    { border: '#2a2010', bg: '#0d0b05', icon: '#333',    rank: '#333' },
  }

  function handleNodeClick(e: React.MouseEvent, t: TalentNodeDef) {
    e.preventDefault()
    if (e.button === 2) {
      deallocateTalent(t.id)
    } else {
      allocateTalent(t.id)
    }
  }

  function handleMouseEnter(e: React.MouseEvent, t: TalentNodeDef) {
    const rank = talentAllocs[t.id] ?? 0
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    setTooltip({
      node: t,
      rank,
      x: rect.right - containerRect.left + 6,
      y: rect.top - containerRect.top,
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2" style={{ fontSize: '0.65rem' }}>
        <span style={{ color: '#ffd700', fontWeight: 700 }}>
          {totalSpent} pts spent
        </span>
        <span style={{
          color: talentPoints > 0 ? '#00ff88' : '#666',
          fontWeight: talentPoints > 0 ? 700 : 400,
        }}>
          {talentPoints} unspent
        </span>
        <button
          className="rp-button"
          style={{ fontSize: '0.55rem', padding: '2px 6px' }}
          onClick={resetTalents}
          disabled={totalSpent === 0}
        >
          Reset
        </button>
      </div>

      {/* Hint */}
      <div style={{ fontSize: '0.55rem', color: '#555', marginBottom: 4, textAlign: 'center' }}>
        Left-click to allocate · Right-click to remove
      </div>

      {/* Grid container */}
      <div
        ref={containerRef}
        style={{ position: 'relative', width: gridW, height: gridH, margin: '0 auto' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* SVG connector lines */}
        <svg
          width={gridW}
          height={gridH}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
        >
          {connections.map(({ from, to }) => {
            const f = nodeCenter(from)
            const t2 = nodeCenter(to)
            const parentRank = talentAllocs[from.id] ?? 0
            const parentNode = talents.find(n => n.id === from.id)!
            const isActive = parentRank >= parentNode.maxRanks
            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={f.x} y1={f.y + NODE_H / 2 - 2}
                x2={t2.x} y2={t2.y - NODE_H / 2 + 2}
                stroke={isActive ? '#c8a118' : '#2a2010'}
                strokeWidth={isActive ? 2 : 1}
                strokeDasharray={isActive ? undefined : '3 3'}
              />
            )
          })}
        </svg>

        {/* Talent nodes */}
        {talents.map(t => {
          const rank   = talentAllocs[t.id] ?? 0
          const state  = nodeState(t)
          const colors = STATE_COLORS[state]
          const origin = nodeOrigin(t)

          return (
            <button
              key={t.id}
              onMouseDown={e => handleNodeClick(e, t)}
              onMouseEnter={e => handleMouseEnter(e, t)}
              onMouseLeave={() => setTooltip(null)}
              onContextMenu={e => e.preventDefault()}
              style={{
                position: 'absolute',
                left: origin.x,
                top: origin.y,
                width: NODE_W,
                height: NODE_H,
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: 6,
                cursor: state === 'locked' ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                padding: '2px 3px',
                opacity: state === 'locked' ? 0.45 : 1,
                zIndex: 1,
                transition: 'border-color 0.1s',
                boxShadow: state === 'maxed' ? '0 0 6px rgba(200,161,0,0.4)' : undefined,
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: '1.3rem', lineHeight: 1, color: colors.icon }}>
                {t.icon}
              </span>

              {/* Name */}
              <span style={{
                fontSize: '0.48rem',
                color: state === 'maxed' ? '#ffd700' : '#9d9d9d',
                textAlign: 'center',
                lineHeight: 1.2,
                maxWidth: NODE_W - 6,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {t.name}
              </span>

              {/* Rank display */}
              <span style={{
                fontSize: '0.5rem',
                color: colors.rank,
                fontWeight: 700,
                lineHeight: 1,
              }}>
                {rank}/{t.maxRanks}
              </span>
            </button>
          )
        })}

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tooltip.x, gridW - 170),
              top: Math.max(0, tooltip.y),
              zIndex: 10,
              background: '#1a1508',
              border: '1px solid #c8a118',
              borderRadius: 6,
              padding: '6px 8px',
              width: 160,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ color: '#ffd700', fontWeight: 700, fontSize: '0.65rem', marginBottom: 2 }}>
              {tooltip.node.icon} {tooltip.node.name}
            </div>
            <div style={{ color: '#9d9d9d', fontSize: '0.58rem', lineHeight: 1.4, marginBottom: 4 }}>
              {tooltip.node.description.replace('{n}', String(
                tooltip.node.effects.find(e => e.type === 'stat')?.valuePerRank
                ?? tooltip.node.effects[0]?.valuePerRank
                ?? '?'
              ))}
            </div>
            <div style={{ color: '#666', fontSize: '0.55rem' }}>
              Rank {tooltip.rank} / {tooltip.node.maxRanks}
              {tooltip.node.requiresPoints > 0 && (
                <span> · Requires {tooltip.node.requiresPoints} pts</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
