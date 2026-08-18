// ── The quality model ─────────────────────────────────────────────────────────
// The one rule this system teaches: **the quality of your materials is the quality of
// your goods.** Gathering banks "purity" per material; crafting averages the purity of
// what it consumes and that average is the output tier — which is a `Rarity`, which is a
// palette id (`palettes.ts` §rarity/gear), which is what the hero visibly wears.
//
// Everything here is a pure function over numbers so the idle-parity claim is checkable:
// with zero purity, `purityToQuality` returns 'coarse' and `QUALITY_MULT.coarse` is
// exactly 1.0, so a player who never interacts gets byte-identical pre-change results.

import type { MaterialId, QualityTier, Rarity, StrikeResult } from '../data/types'

// ── Baseline timings (idle floor — do not change without changing the design doc) ──
/** Seconds per harvest. The strike meter never touches this: engagement raises quality,
 *  never throughput. Single source of truth for the tick AND the UI's idle-rate readout. */
export const GATHER_SECONDS = 5
/** Units yielded per completed harvest, with or without any player input. */
export const GATHER_YIELD = 1

// ── Strike meter tuning ───────────────────────────────────────────────────────
/** A small budget of deliberate taps, not a mash bar. A miss spends one too. */
export const STRIKES_PER_HARVEST = 4
/** Recovery after a miss. Taps landing inside it are swallowed (no cost, no reward), so
 *  mashing is strictly worse than timing rather than merely unrewarded. */
export const STRIKE_LOCKOUT_SECONDS = 0.45
/** Ceiling on purity banked by a single unit — reachable only by near-perfect play. */
export const MAX_PURITY_PER_UNIT = 12

const PURITY_PERFECT = 3
const PURITY_GOOD = 1
/** Consecutive hits compound, capped so a long session cannot run away. */
const STREAK_STEP = 0.15
const STREAK_CAP = 6

// ── Tiers ─────────────────────────────────────────────────────────────────────
export const QUALITY_ORDER: readonly QualityTier[] =
  ['coarse', 'fine', 'superior', 'masterwork', 'flawless'] as const

export const QUALITY_LABEL: Record<QualityTier, string> = {
  coarse: 'Coarse', fine: 'Fine', superior: 'Superior',
  masterwork: 'Masterwork', flawless: 'Flawless',
}

/** Quality → rarity. This is the join that turns a gathering session into a palette. */
export const QUALITY_RARITY: Record<QualityTier, Rarity> = {
  coarse: 'common', fine: 'uncommon', superior: 'rare',
  masterwork: 'epic', flawless: 'legendary',
}

/** Quality → a palette id that already exists in the registry (palettes.ts registers
 *  `gear/t{1..4}+{rarity}` for every combination). Zero new art for five visible tiers. */
export const QUALITY_PALETTE: Record<QualityTier, string> = {
  coarse: 'gear/t1+common',
  fine: 'gear/t2+uncommon',
  superior: 'gear/t3+rare',
  masterwork: 'gear/t4+epic',
  flawless: 'gear/t4+legendary',
}

/** Effect/duration scalar. `coarse === 1.0` is the idle-parity guarantee. */
export const QUALITY_MULT: Record<QualityTier, number> = {
  coarse: 1.0, fine: 1.25, superior: 1.6, masterwork: 2.1, flawless: 3.0,
}

/** Minimum average purity per unit for each tier. */
export const QUALITY_PURITY_FLOOR: Record<QualityTier, number> = {
  coarse: 0, fine: 2, superior: 5, masterwork: 8, flawless: 11,
}

export function purityToQuality(purityPerUnit: number): QualityTier {
  let out: QualityTier = 'coarse'
  for (const q of QUALITY_ORDER) {
    if (purityPerUnit >= QUALITY_PURITY_FLOOR[q]) out = q
  }
  return out
}

export function qualityRank(q: QualityTier): number {
  return QUALITY_ORDER.indexOf(q)
}

export function qualityAtLeast(q: QualityTier, min: QualityTier): boolean {
  return qualityRank(q) >= qualityRank(min)
}

// ── Node richness ─────────────────────────────────────────────────────────────
// Derived, not stored: a pure hash of (world seed, tile coords) so every hero's world
// lays out its good veins differently with **no map-format change** and no save
// migration. 0 thin · 1 solid · 2 rich.
export const RICHNESS_LABEL = ['Thin', 'Solid', 'Rich'] as const
export const RICHNESS_COLOR = ['#8a8578', '#88bb66', '#ffd700'] as const

export function nodeRichness(seed: number, x: number, y: number): 0 | 1 | 2 {
  let h = (seed ^ 0x9e3779b9) | 0
  h = Math.imul(h ^ Math.round(x * 4), 0x85ebca6b)
  h = Math.imul(h ^ Math.round(y * 4), 0xc2b2ae35)
  h ^= h >>> 15
  const r = (h >>> 0) % 100
  // Rich veins stay uncommon so finding one is an event worth walking to.
  return r < 15 ? 2 : r < 50 ? 1 : 0
}

/** Richer veins forgive more — a wider band — and pay more per hit. */
export function bandHalfWidthFor(richness: 0 | 1 | 2): number {
  return [0.085, 0.11, 0.15][richness]
}

export function richnessMult(richness: 0 | 1 | 2): number {
  return [1.0, 1.15, 1.3][richness]
}

/**
 * Opening sweep for a harvest. Varied per harvest index (and per node) so the meter never
 * degenerates into a metronome the player can tap without looking.
 */
export function rollSweep(seed: number, harvestIndex: number): { speed: number; bandCenter: number; dir: 1 | -1 } {
  let h = Math.imul((seed ^ 0x27d4eb2d) + harvestIndex * 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  const a = (h >>> 0) % 1000 / 1000
  h = Math.imul(h ^ 0x165667b1, 0xc2b2ae35)
  const b = (h >>> 0) % 1000 / 1000
  return {
    speed: 0.5 + a * 0.45,             // 0.50–0.95 track-lengths/sec
    bandCenter: 0.2 + b * 0.6,         // never flush against an edge
    dir: b < 0.5 ? 1 : -1,
  }
}

// ── Strike resolution ─────────────────────────────────────────────────────────
export interface StrikeOutcome {
  result: StrikeResult
  /** Purity earned by this strike (0 on a miss). */
  purity: number
  /** Streak AFTER the strike. */
  streak: number
}

/** Inner fraction of the band that counts as a perfect hit. */
const PERFECT_FRACTION = 0.35

export function resolveStrike(
  cursor: number,
  bandCenter: number,
  bandHalfWidth: number,
  streak: number,
  richness: 0 | 1 | 2,
): StrikeOutcome {
  const d = Math.abs(cursor - bandCenter)
  if (d > bandHalfWidth) return { result: 'miss', purity: 0, streak: 0 }

  const perfect = d <= bandHalfWidth * PERFECT_FRACTION
  const nextStreak = streak + 1
  const base = perfect ? PURITY_PERFECT : PURITY_GOOD
  const streakMult = 1 + Math.min(nextStreak, STREAK_CAP) * STREAK_STEP
  const purity = base * streakMult * richnessMult(richness)
  return { result: perfect ? 'perfect' : 'good', purity, streak: nextStreak }
}

// ── Tempering: the craft's own skill moment ───────────────────────────────────
//
// Gathering has the strike meter, so working a vein is something a present player does
// BETTER than an absent one. Crafting had no such beat at all — output quality was
// inherited wholesale from material quality, which made the forge a vending machine: put
// Masterwork in, get Masterwork out, and the player's only contribution was having walked
// to a node earlier.
//
// The temper is the missing half. While a craft runs, a marker sweeps a heat band; land
// strikes in it and the piece comes out one tier ABOVE its materials. It cannot go the
// other way — a botched temper simply forfeits the bonus — because punishing an idle
// player for not watching a progress bar is the opposite of what this game is.
//
// Geometry is deliberately the same as the gathering meter's (`rollSweep`, a reflecting
// cursor, a band with a perfect core). One learned gesture, used in both professions.

/** Strikes offered per craft. */
export const TEMPER_STRIKES = 3
/** Heat needed to raise the piece a tier. Two perfects, or three good hits. */
export const TEMPER_THRESHOLD = 4
const TEMPER_HEAT_PERFECT = 2
const TEMPER_HEAT_GOOD = 1

export interface TemperOutcome {
  result: StrikeResult
  heat: number
}

/** Resolve one temper strike. Same band geometry as `resolveStrike`, simpler payout: this
 *  is a yes/no bonus, not an accumulating purity score. */
export function resolveTemper(
  cursor: number, bandCenter: number, bandHalfWidth: number,
): TemperOutcome {
  const d = Math.abs(cursor - bandCenter)
  if (d > bandHalfWidth) return { result: 'miss', heat: 0 }
  const perfect = d <= bandHalfWidth * PERFECT_FRACTION
  return {
    result: perfect ? 'perfect' : 'good',
    heat: perfect ? TEMPER_HEAT_PERFECT : TEMPER_HEAT_GOOD,
  }
}

/** The tier a finished craft lands on, given its material tier and the heat banked.
 *  Never below the material tier — the temper is upside only. */
export function temperedQuality(base: QualityTier, heat: number): QualityTier {
  if (heat < TEMPER_THRESHOLD) return base
  const next = QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, qualityRank(base) + 1)]
  return next ?? base
}

// ── Stock quality ─────────────────────────────────────────────────────────────
/** Average purity per unit currently held of a material (0 when none held / none banked). */
export function stockPurity(
  materials: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
  materialId: MaterialId,
): number {
  const count = materials[materialId] ?? 0
  if (count <= 0) return 0
  return (purity[materialId] ?? 0) / count
}

export function stockQuality(
  materials: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
  materialId: MaterialId,
): QualityTier {
  return purityToQuality(stockPurity(materials, purity, materialId))
}

/**
 * Qty-weighted average purity of a recipe's inputs — the tier the craft will produce.
 * Weighting by qty means the bulk material dominates, which is the intuitive reading.
 */
export function recipePurity(
  materials: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
  inputs: { materialId: MaterialId; qty: number }[],
): number {
  let weighted = 0
  let total = 0
  for (const inp of inputs) {
    weighted += stockPurity(materials, purity, inp.materialId) * inp.qty
    total += inp.qty
  }
  return total > 0 ? weighted / total : 0
}

export function recipeQuality(
  materials: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
  inputs: { materialId: MaterialId; qty: number }[],
): QualityTier {
  return purityToQuality(recipePurity(materials, purity, inputs))
}

/**
 * Spend a recipe's inputs. Purity is drawn down **proportionally** (average × qty), so a
 * stock has one quality and you cannot hoard the good units while spending coarse ones.
 */
export function consumeInputs(
  materials: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
  inputs: { materialId: MaterialId; qty: number }[],
): { materials: Record<MaterialId, number>; purity: Record<MaterialId, number> } {
  const nextMats = { ...materials }
  const nextPure = { ...purity }
  for (const inp of inputs) {
    const avg = stockPurity(materials, purity, inp.materialId)
    nextMats[inp.materialId] = Math.max(0, (nextMats[inp.materialId] ?? 0) - inp.qty)
    nextPure[inp.materialId] = Math.max(0, (nextPure[inp.materialId] ?? 0) - avg * inp.qty)
    // Holding nothing must hold no purity, or the next unit gathered would inherit it.
    if (nextMats[inp.materialId] <= 0) nextPure[inp.materialId] = 0
  }
  return { materials: nextMats, purity: nextPure }
}
