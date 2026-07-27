import type { ClassType, SpecDefinition, TalentNodeDef } from './types'
import { CLASS_DEFINITIONS } from './classes'

// ── Spec lookups ──────────────────────────────────────────────────────────────
// Three trees per class replaced one, and the difference between "three specs" and
// "one tree wearing three hats" lives entirely in ONE function: `spentInSpec`. Tier
// gating used to count every point the hero owned, which is indistinguishable from
// per-tree counting when there is only one tree — and catastrophic with three, because
// points fed to Bulwark would open Ironcleave's capstone for free.
//
// Every lookup below is built once at module load. They are pure derivations of
// CLASS_DEFINITIONS; nothing here is a second source of truth.

/** talentId → the spec that owns it. */
export const SPEC_OF_TALENT: Record<string, string> = {}
/** talentId → the node itself, across every class. */
export const TALENT_BY_ID: Record<string, TalentNodeDef> = {}
/** specId → the spec. */
export const SPEC_BY_ID: Record<string, SpecDefinition> = {}

for (const classDef of Object.values(CLASS_DEFINITIONS)) {
  for (const spec of classDef.specs) {
    SPEC_BY_ID[spec.id] = spec
    for (const node of spec.talents) {
      if (SPEC_OF_TALENT[node.id] !== undefined) {
        console.warn(`[specs] duplicate talent id "${node.id}" — ids must be globally unique`)
      }
      SPEC_OF_TALENT[node.id] = spec.id
      TALENT_BY_ID[node.id] = node
    }
  }
}

/** Every talent a class can learn, flattened across its three specs. */
export function allClassTalents(classId: ClassType): TalentNodeDef[] {
  return CLASS_DEFINITIONS[classId].specs.flatMap(s => s.talents)
}

export function classSpecs(classId: ClassType): SpecDefinition[] {
  return CLASS_DEFINITIONS[classId].specs
}

/**
 * Points spent inside ONE tree. This is the gating primitive — `requiresPoints` is
 * measured against it, never against the hero's total spend.
 */
export function spentInSpec(allocs: Record<string, number>, specId: string): number {
  let total = 0
  for (const [id, ranks] of Object.entries(allocs)) {
    if (ranks > 0 && SPEC_OF_TALENT[id] === specId) total += ranks
  }
  return total
}

/** Total ranks a tree can absorb — the denominator on its meter. */
export function specCapacity(spec: SpecDefinition): number {
  return spec.talents.reduce((sum, t) => sum + t.maxRanks, 0)
}

/** Points spent across every tree. */
export function totalSpent(allocs: Record<string, number>): number {
  return Object.values(allocs).reduce((a, b) => a + b, 0)
}

/**
 * The hero's title: whichever tree they have fed most. Points may be spent freely
 * across all three, so a spec is something you turn out to have become rather than
 * something you declared — ties and an empty allocation both read as no spec yet.
 */
export function deepestSpec(
  classId: ClassType,
  allocs: Record<string, number>,
): SpecDefinition | null {
  let best: SpecDefinition | null = null
  let bestPts = 0
  let tied = false
  for (const spec of CLASS_DEFINITIONS[classId].specs) {
    const pts = spentInSpec(allocs, spec.id)
    if (pts > bestPts) { best = spec; bestPts = pts; tied = false }
    else if (pts === bestPts && pts > 0) tied = true
  }
  return tied ? null : best
}

/**
 * Can this node take another rank right now? The single rule the UI draws and the
 * store enforces — they used to each carry their own copy, and a copy is a chance to
 * disagree about what the player is allowed to do.
 */
export function talentGate(
  node: TalentNodeDef,
  allocs: Record<string, number>,
  unspentPoints: number,
): { ok: boolean; reason?: string; shortfall?: number } {
  const rank = allocs[node.id] ?? 0
  if (rank >= node.maxRanks) return { ok: false, reason: 'maxed' }

  const specId = SPEC_OF_TALENT[node.id]
  const spec = specId ? SPEC_BY_ID[specId] : undefined
  const inTree = specId ? spentInSpec(allocs, specId) : 0
  if (inTree < node.requiresPoints) {
    return {
      ok: false,
      reason: `Requires ${node.requiresPoints} points in ${spec?.name ?? 'this tree'} — you have ${inTree}`,
      shortfall: node.requiresPoints - inTree,
    }
  }

  if (node.requires) {
    const prereq = TALENT_BY_ID[node.requires]
    if (!prereq) return { ok: false, reason: 'Prerequisite missing' }
    if ((allocs[node.requires] ?? 0) < prereq.maxRanks) {
      return { ok: false, reason: `Requires ${prereq.maxRanks}/${prereq.maxRanks} ${prereq.name}` }
    }
  }

  if (unspentPoints <= 0) return { ok: false, reason: 'No unspent points' }
  return { ok: true }
}

/**
 * Is removing a rank from this node legal? Blocked when a dependent talent is still
 * invested and this node is the reason it is legal.
 */
export function canDeallocate(
  node: TalentNodeDef,
  allocs: Record<string, number>,
): { ok: boolean; reason?: string } {
  const rank = allocs[node.id] ?? 0
  if (rank <= 0) return { ok: false, reason: 'Nothing invested here' }

  const specId = SPEC_OF_TALENT[node.id]
  if (!specId) return { ok: true }

  // A dependent that requires this node MAXED would be orphaned by the removal.
  for (const dep of SPEC_BY_ID[specId].talents) {
    if (dep.requires === node.id && (allocs[dep.id] ?? 0) > 0 && rank <= node.maxRanks) {
      return { ok: false, reason: `${dep.name} depends on this` }
    }
  }

  // Removing a point must not strand a DEEPER node below its tier requirement. Without
  // this the player can refund out of row 2 while row 7 stays lit, which is the same
  // hole the gating exists to close, entered backwards.
  const after = spentInSpec(allocs, specId) - 1
  for (const other of SPEC_BY_ID[specId].talents) {
    if (other.id === node.id) continue
    if ((allocs[other.id] ?? 0) > 0 && other.requiresPoints > after) {
      return { ok: false, reason: `Would strand ${other.name}` }
    }
  }

  return { ok: true }
}
