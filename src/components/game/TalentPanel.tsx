import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { CLASS_DEFINITIONS } from '../../data/classes'
import {
  spentInSpec, specCapacity, totalSpent, talentGate, canDeallocate, TALENT_BY_ID,
} from '../../data/specs'
import { TALENT_POINT_MAX } from '../../data/constants'
import type { SpecDefinition, TalentNodeDef, TalentEffectDef } from '../../data/types'
import { SpriteIcon } from '../ui/SpriteIcon'
import { useCoarsePointer } from '../ui/useLongPress'

/**
 * The talent screen.
 *
 * Three trees do not fit in a 252px sidebar, which is where the single tree lived — so
 * this is a full-screen surface instead of a panel tab. On a wide screen the three specs
 * stand side by side, because the whole decision the player is making is *between* them
 * and you cannot weigh three things you can only see one of. On a phone they become a
 * crest switcher, but each crest still carries its own point count, so the two trees you
 * are not looking at are never out of mind.
 *
 * Colour does the heavy lifting: every spec owns an accent (`SpecDefinition.accent`) and
 * it drives that column's meter, node borders, glow and connectors. Three trees rendered
 * in the same gold were three trees that read as one.
 */

// Node geometry, sized up on touch so a fingertip clears the 44px minimum — the same
// reactive source as the behaviour swap below, read at mount rather than module scope.
const GEOM = {
  fine:   { CELL_W: 76, CELL_H: 80, NODE_W: 62, NODE_H: 66 },
  coarse: { CELL_W: 80, CELL_H: 84, NODE_W: 66, NODE_H: 70 },
}
const PAD = 8

type Geom = typeof GEOM['fine']
type NodeState = 'maxed' | 'partial' | 'available' | 'unaffordable' | 'locked'

function nodeCenter(t: TalentNodeDef, g: Geom) {
  return {
    x: PAD + (t.col - 1) * g.CELL_W + g.CELL_W / 2,
    y: PAD + (t.row - 1) * g.CELL_H + g.CELL_H / 2,
  }
}
function nodeOrigin(t: TalentNodeDef, g: Geom) {
  const c = nodeCenter(t, g)
  return { x: c.x - g.NODE_W / 2, y: c.y - g.NODE_H / 2 }
}

/** Hex → rgba, so one accent can serve as border, glow and wash. */
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Stats named as a player would say them, and told apart from shares. */
const STAT_LABEL: Record<string, { label: string; pct?: boolean; unit?: string }> = {
  strength:  { label: 'Strength' },
  intellect: { label: 'Intellect' },
  agility:   { label: 'Agility' },
  stamina:   { label: 'Stamina' },
  armor:     { label: 'Armor' },
  weaponDps: { label: 'Weapon DPS' },
  critChance:         { label: 'Crit Chance', pct: true },
  goldFindBonus:      { label: 'Gold Find', pct: true },
  attackSpeedSeconds: { label: 'Attack Interval', unit: 's' },
}

const num = (v: number) => `${+v.toFixed(2)}`

/**
 * The description with `{n}` filled in with the PER-RANK value.
 *
 * Deliberately per-rank and not cumulative: almost every description is written "…by
 * {n} per rank", so substituting a running total would make a 2/3 talent claim "+4 per
 * rank" — a sentence that is simply false. The running total belongs on its own line
 * (see `Current` / `Next rank` below), where it can be stated as a total and be true.
 */
function describeTemplate(node: TalentNodeDef): string {
  const primary = node.effects.find(e => e.type === 'stat') ?? node.effects[0]
  if (!primary) return node.description
  const per = primary.valuePerRank
  // Fractions in the data are shares; the copy around them writes percentages.
  const shown = Math.abs(per) < 1 && per !== 0 ? num(per * 100) : num(per)
  return node.description.replace('{n}', shown)
}

/** One effect, summed to `rank`, in words rather than field names. */
function effectLine(effect: TalentEffectDef, rank: number): string {
  const total = effect.valuePerRank * Math.max(0, rank)
  if (effect.type === 'stat') {
    const meta = STAT_LABEL[effect.stat] ?? { label: String(effect.stat) }
    if (meta.pct) return `${meta.label} +${num(total * 100)}%`
    return `${meta.label} +${num(total)}${meta.unit ?? ''}`
  }
  if (effect.type === 'mechanic') {
    const name = effect.mechanic.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    // Sub-1 values are shares by convention across every tree; whole numbers are flat.
    return Math.abs(effect.valuePerRank) < 1
      ? `${name} ${num(total * 100)}%`
      : `${name} +${num(total)}`
  }
  return effect.note ?? `Modifies ${effect.ability}`
}

/** All of a node's effects at `rank`, as one line. */
function summarize(node: TalentNodeDef, rank: number): string {
  return node.effects.map(e => effectLine(e, rank)).join(' · ')
}

// ── One tree ──────────────────────────────────────────────────────────────────
interface TreeProps {
  spec: SpecDefinition
  allocs: Record<string, number>
  unspent: number
  geom: Geom
  coarse: boolean
  onLearn: (id: string) => void
  onUnlearn: (id: string) => void
  onInspect: (node: TalentNodeDef) => void
}

function SpecTree({ spec, allocs, unspent, geom, coarse, onLearn, onUnlearn, onInspect }: TreeProps) {
  const { CELL_W, CELL_H, NODE_W, NODE_H } = geom
  const inTree = spentInSpec(allocs, spec.id)
  const capacity = specCapacity(spec)

  const maxRow = spec.talents.reduce((m, t) => Math.max(m, t.row), 0)
  const maxCol = spec.talents.reduce((m, t) => Math.max(m, t.col), 0)
  const gridW = PAD * 2 + maxCol * CELL_W
  const gridH = PAD * 2 + maxRow * CELL_H

  // Connectors: `requires` edges plus any the spec declares explicitly.
  const connections = useMemo(() => {
    const seen = new Set<string>()
    const out: { from: TalentNodeDef; to: TalentNodeDef }[] = []
    const push = (fromId: string, toId: string) => {
      const key = `${fromId}->${toId}`
      if (seen.has(key)) return
      const from = spec.talents.find(t => t.id === fromId)
      const to   = spec.talents.find(t => t.id === toId)
      if (!from || !to) return
      seen.add(key)
      out.push({ from, to })
    }
    for (const node of spec.talents) if (node.requires) push(node.requires, node.id)
    for (const [a, b] of spec.connectors ?? []) push(a, b)
    return out
  }, [spec])

  function stateOf(t: TalentNodeDef): NodeState {
    const rank = allocs[t.id] ?? 0
    if (rank >= t.maxRanks) return 'maxed'
    if (rank > 0) return 'partial'
    // Tier and prerequisite are structural — they say "not yet, and here is why".
    // Having no points left is not structural, it is temporary, and conflating the two
    // (as the old tree did) told a player at 0 points that their whole tree was locked.
    if (inTree < t.requiresPoints) return 'locked'
    if (t.requires) {
      const prereq = TALENT_BY_ID[t.requires]
      if (!prereq || (allocs[t.requires] ?? 0) < prereq.maxRanks) return 'locked'
    }
    return unspent > 0 ? 'available' : 'unaffordable'
  }

  // Tier headers: the point threshold each row opens at, drawn down the left gutter so
  // the cost of going deep is visible before you have paid it.
  const tiers = useMemo(() => {
    const byRow = new Map<number, number>()
    for (const t of spec.talents) byRow.set(t.row, Math.max(byRow.get(t.row) ?? 0, t.requiresPoints))
    return [...byRow.entries()].sort((a, b) => a[0] - b[0])
  }, [spec])

  const empty = spec.talents.length === 0

  return (
    <div className="talent-col">
      {/* ── Crest + meter ── */}
      <div className="talent-col-head" style={{ borderColor: alpha(spec.accent, 0.45) }}>
        <div
          className="talent-crest"
          style={{
            borderColor: spec.accent,
            background: `radial-gradient(circle at 50% 40%, ${alpha(spec.accent, 0.32)}, transparent 70%)`,
            boxShadow: inTree > 0 ? `0 0 14px ${alpha(spec.accent, 0.45)}` : 'none',
          }}
        >
          <SpriteIcon talent={spec.icon as any} emoji="⚔" size={26} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="talent-col-name" style={{ color: spec.accent }}>{spec.name}</div>
          <div className="talent-col-tag">{spec.tagline}</div>
        </div>
        <div className="talent-col-count" style={{ color: inTree > 0 ? spec.accent : '#6a6458' }}>
          {inTree}<span style={{ color: '#5a544a' }}>/{capacity}</span>
        </div>
      </div>
      <div className="talent-meter">
        <div
          className="talent-meter-fill"
          style={{
            width: `${capacity ? (inTree / capacity) * 100 : 0}%`,
            background: `linear-gradient(90deg, ${alpha(spec.accent, 0.55)}, ${spec.accent})`,
          }}
        />
      </div>

      {empty ? (
        <div className="talent-empty">
          <div className="talent-empty-title">Not yet forged</div>
          <p>{spec.description}</p>
        </div>
      ) : (
        <div className="talent-grid-scroll">
          <div
            className="talent-grid"
            style={{ width: gridW + 26, height: gridH }}
            onContextMenu={e => e.preventDefault()}
          >
            {/* Tier gutter */}
            {tiers.map(([row, pts]) => (
              <div
                key={row}
                className="talent-tier"
                style={{
                  top: PAD + (row - 1) * CELL_H + CELL_H / 2 - 7,
                  color: inTree >= pts ? alpha(spec.accent, 0.9) : '#4a453c',
                }}
              >
                {pts}
              </div>
            ))}

            <svg
              width={gridW} height={gridH}
              style={{ position: 'absolute', left: 26, top: 0, pointerEvents: 'none', zIndex: 0 }}
            >
              <defs>
                <marker
                  id={`arw-${spec.id}`} markerWidth="6" markerHeight="6"
                  refX="3" refY="3" orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill={spec.accent} />
                </marker>
              </defs>
              {connections.map(({ from, to }) => {
                const f = nodeCenter(from, geom)
                const t2 = nodeCenter(to, geom)
                const lit = (allocs[from.id] ?? 0) >= from.maxRanks
                return (
                  <line
                    key={`${from.id}-${to.id}`}
                    x1={f.x} y1={f.y + NODE_H / 2 - 1}
                    x2={t2.x} y2={t2.y - NODE_H / 2 - 3}
                    stroke={lit ? spec.accent : '#2f2a22'}
                    strokeWidth={lit ? 2 : 1}
                    strokeDasharray={lit ? undefined : '3 4'}
                    markerEnd={lit ? `url(#arw-${spec.id})` : undefined}
                  />
                )
              })}
            </svg>

            {spec.talents.map(t => {
              const rank = allocs[t.id] ?? 0
              const st = stateOf(t)
              const origin = nodeOrigin(t, geom)
              const lit = st === 'maxed' || st === 'partial'
              const border = st === 'maxed' ? spec.accent
                : st === 'partial' ? alpha(spec.accent, 0.75)
                : st === 'available' ? alpha(spec.accent, 0.40)
                : st === 'unaffordable' ? '#3d3830'
                : '#241f19'

              return (
                <button
                  key={t.id}
                  className={`talent-node is-${st}`}
                  // Desktop keeps its fast path: left learns, right unlearns. Touch has
                  // no right button and no hover, so a tap opens the inspector where
                  // both actions are labelled buttons.
                  onMouseDown={e => {
                    e.preventDefault()
                    if (e.button === 2) onUnlearn(t.id)
                    else if (e.button === 0) coarse ? onInspect(t) : onLearn(t.id)
                  }}
                  onMouseEnter={() => !coarse && onInspect(t)}
                  onContextMenu={e => e.preventDefault()}
                  aria-label={`${t.name}, rank ${rank} of ${t.maxRanks}`}
                  style={{
                    left: origin.x + 26,
                    top: origin.y,
                    width: NODE_W,
                    height: NODE_H,
                    borderColor: border,
                    background: lit
                      ? `linear-gradient(180deg, ${alpha(spec.accent, 0.20)}, rgba(10,9,6,0.9))`
                      : 'linear-gradient(180deg, rgba(26,23,18,0.85), rgba(10,9,6,0.9))',
                    boxShadow: st === 'maxed' ? `0 0 12px ${alpha(spec.accent, 0.5)}` : undefined,
                    cursor: st === 'locked' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {st === 'maxed' && (
                    <span className="talent-notch" style={{ borderTopColor: spec.accent }} />
                  )}
                  <span className="talent-node-icon" style={{
                    opacity: st === 'locked' ? 0.3 : st === 'unaffordable' ? 0.55 : st === 'available' ? 0.8 : 1,
                  }}>
                    <SpriteIcon talentId={t.id} emoji={t.icon} size={22} title={t.name} />
                  </span>
                  <span className="talent-node-name" style={{ color: st === 'maxed' ? spec.accent : '#9d9d9d' }}>
                    {t.name}
                  </span>
                  {/* Rank pips. "3/5" was a number to read; five dots is a quantity to
                      see, and at 52px the difference is the whole legibility of the tree. */}
                  <span className="talent-pips">
                    {Array.from({ length: t.maxRanks }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          background: i < rank ? spec.accent : '#332e26',
                          boxShadow: i < rank ? `0 0 3px ${alpha(spec.accent, 0.8)}` : 'none',
                        }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── The panel ─────────────────────────────────────────────────────────────────
export function TalentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    playerClass, level, talentAllocs, talentPoints,
    allocateTalent, deallocateTalent, resetTalents,
  } = useGameStore()

  const specs = CLASS_DEFINITIONS[playerClass].specs
  const coarse = useCoarsePointer()
  const geom = GEOM[coarse ? 'coarse' : 'fine']
  const [activeSpec, setActiveSpec] = useState(0)
  const [inspected, setInspected] = useState<TalentNodeDef | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const spent = totalSpent(talentAllocs)
  const earned = Math.min(level, TALENT_POINT_MAX)
  const gate = inspected ? talentGate(inspected, talentAllocs, talentPoints) : null
  const undo = inspected ? canDeallocate(inspected, talentAllocs) : null
  const rank = inspected ? (talentAllocs[inspected.id] ?? 0) : 0

  const shown = coarse ? [specs[activeSpec]] : specs

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="talent-modal rp-glass-strong" role="dialog" aria-modal="true" aria-label="Talents">
        {/* ── Header ── */}
        <div className="talent-modal-head">
          <div>
            <div className="talent-modal-title">Talents</div>
            <div className="talent-modal-sub">
              {spent} spent · {earned} earned{level > TALENT_POINT_MAX ? ' (max)' : ''}
            </div>
          </div>
          <div className="talent-unspent" data-has={talentPoints > 0}>
            {talentPoints}
            <span>unspent</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="rp-button" onClick={resetTalents} disabled={spent === 0}>
              Reset
            </button>
            <button className="rp-button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* ── Mobile spec switcher ── */}
        {coarse && (
          <div className="talent-switch">
            {specs.map((s, i) => {
              const pts = spentInSpec(talentAllocs, s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSpec(i)}
                  className={i === activeSpec ? 'is-active' : ''}
                  style={{
                    borderColor: i === activeSpec ? s.accent : '#3a352c',
                    color: i === activeSpec ? s.accent : '#8a8578',
                  }}
                >
                  <SpriteIcon talent={s.icon as any} emoji="⚔" size={18} />
                  <span className="talent-switch-name">{s.name}</span>
                  <span className="talent-switch-pts" style={{ color: pts > 0 ? s.accent : '#5a544a' }}>
                    {pts}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Trees ── */}
        <div className="talent-cols">
          {shown.map(spec => (
            <SpecTree
              key={spec.id}
              spec={spec}
              allocs={talentAllocs}
              unspent={talentPoints}
              geom={geom}
              coarse={coarse}
              onLearn={allocateTalent}
              onUnlearn={deallocateTalent}
              onInspect={setInspected}
            />
          ))}
        </div>

        {/* ── Inspector ──
            Docked rather than floating: with three columns a hover tooltip has nowhere
            to go that is not on top of another tree. On desktop hovering fills it; on
            touch tapping does, and the two actions become real buttons. */}
        <div className="talent-inspect">
          {inspected ? (
            <>
              <div className="talent-inspect-head">
                <SpriteIcon talentId={inspected.id} emoji={inspected.icon} size={18} />
                <span className="talent-inspect-name">{inspected.name}</span>
                <span className="talent-inspect-rank">Rank {rank} / {inspected.maxRanks}</span>
              </div>
              <div className="talent-inspect-body">
                {describeTemplate(inspected)}
              </div>
              {/* What you have, and what the next point buys. The old tooltip showed
                  neither — it printed the per-rank value and left the player to do the
                  multiplication that decides whether the point is worth spending. */}
              <div className="talent-inspect-rows">
                {rank > 0 && (
                  <span className="talent-inspect-cur">Current: {summarize(inspected, rank)}</span>
                )}
                {rank < inspected.maxRanks && (
                  <span className="talent-inspect-next">
                    Next rank: {summarize(inspected, rank + 1)}
                  </span>
                )}
              </div>
              {gate && !gate.ok && gate.reason && gate.reason !== 'maxed' && (
                <div className="talent-inspect-warn">{gate.reason}</div>
              )}
              {coarse && (
                <div className="talent-inspect-actions">
                  <button
                    className="rp-button"
                    onClick={() => allocateTalent(inspected.id)}
                    disabled={!gate?.ok}
                    style={{ borderColor: '#c8a100', color: '#ffd700' }}
                  >
                    Learn
                  </button>
                  <button
                    className="rp-button"
                    onClick={() => deallocateTalent(inspected.id)}
                    disabled={!undo?.ok}
                    title={undo?.reason}
                  >
                    Unlearn
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="talent-inspect-idle">
              {coarse
                ? 'Tap a talent to inspect it, then Learn or Unlearn.'
                : 'Hover a talent to inspect it · Left-click learns · Right-click unlearns'}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
