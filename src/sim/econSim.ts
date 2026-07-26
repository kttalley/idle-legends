// ── Headless economy harness ──────────────────────────────────────────────────
//
// Drives the REAL Zustand store (no UI, no React) so the numbers below are the
// game's numbers, not a model of them. Run it with `node tools/sim/run.mjs`,
// which esbuild-bundles this file with a localStorage shim.
//
// This file is never imported by the app. It lives under src/ so `tsc --noEmit`
// typechecks it against the live store — a harness that drifts from the code it
// measures is worse than no harness. Same reason `src/render/dev/harness.ts` is
// where it is.
//
// Why it exists: the economy had no measurements. `.planning/economy-and-towns-plan.md`
// §4.3 makes measuring the gold curve a precondition for pricing anything.

import { useGameStore } from '../store/gameStore'
import { INVENTORY_SLOTS, RARITY_WEIGHTS } from '../data/constants'
import type { ClassType, RaceType, ZoneId } from '../data/types'
import { ZONE_ORDER } from '../data/zones'
import { canEnterZone } from '../engine/zoneProgression'

// ── Expected value of a destroyed drop ────────────────────────────────────────
// The bag-full branch logs a name, not a price, so a lost item's worth has to be
// modelled. `generateItem` prices at `level × rarityMult × U(0.8,1.2)`, so the
// expectation over the drop table is level × E[rarityMult].
const RARITY_VALUE_MULT: Record<string, number> = {
  common: 1, uncommon: 3, rare: 8, epic: 25, legendary: 100,
}
export const EXPECTED_VALUE_MULT = (() => {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let acc = 0
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    acc += (weight / total) * RARITY_VALUE_MULT[rarity]
  }
  return acc   // ≈ 4.15 gold per item level
})()

export interface Sample {
  /** Simulated minutes since the run started. */
  minute: number
  level: number
  zone: ZoneId
  circuit: number
  /** Cumulative gold held (the sim never spends, so this is also gold earned). */
  gold: number
  bagUsed: number
  bagSize: number
  /** Cumulative counts since the run started. */
  itemsLooted: number
  itemsLost: number
  /** Cumulative modelled vendor value of everything the bag-full branch ate. */
  lostValueEst: number
  deaths: number
  // ── Liveness probe ──────────────────────────────────────────────────────────
  // A stalled run reads identically to a slow one in the gold column alone, so
  // the sampler also records what the hero was actually doing.
  mode: string
  alive: boolean
  hpPct: number
  /** Mobs standing in the zone, and the distance to the engaged one. */
  mobCount: number
  targetDist: number | null
  /** Kills recorded in the current zone, cumulative. */
  zoneKills: number
  /** Logical map position — a frozen one means the world drift is pinned. */
  pos: { x: number; y: number }
}

export interface ScenarioOpts {
  minutes: number
  playerClass?: ClassType
  playerRace?: RaceType
  /** Seconds of game time per tick. The real loop runs at rAF cadence; a coarser
   *  step is the whole point of a harness, but combat resolves at most one swing
   *  per tick, so this must stay below the fastest attack interval. */
  stepSeconds?: number
  /** Sample cadence, in simulated minutes. */
  sampleEveryMinutes?: number
  /**
   * Emulate a player who moves on when a zone opens up. An untouched idle player
   * NEVER leaves the starting zone — `selectZone` is a click — so the zone-tier
   * gold curve is only observable with this on. Both regimes are real; the idle
   * one is the house-rule baseline.
   */
  advanceZones?: boolean
  /** Sell every common on every sample, i.e. the closest thing to a sink today. */
  sellCommons?: boolean
  /** Seed for the harness's `Math.random` swap — makes a run reproducible. */
  seed?: number | null
}

/** Installed by tools/sim/run.mjs. Null restores the real `Math.random`. */
declare const __setSeed: undefined | ((seed: number | null) => void)

export interface ScenarioResult {
  opts: Required<ScenarioOpts>
  samples: Sample[]
  final: Sample
  /** Simulated minute at which the bag first hit capacity, or null. */
  firstFullAtMinute: number | null
  /** Wall-clock milliseconds the simulation took. */
  wallMs: number
}

/** Log ids already accounted for, so each combat-log line is counted once. */
function makeLogReader() {
  const seen = new Set<string>()
  return (entries: { id: string; message: string }[]) => {
    const fresh: string[] = []
    for (const e of entries) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      fresh.push(e.message)
    }
    return fresh
  }
}

export function runScenario(opts: ScenarioOpts): ScenarioResult {
  const o: Required<ScenarioOpts> = {
    playerClass: 'warrior',
    playerRace: 'human',
    stepSeconds: 0.25,
    sampleEveryMinutes: 5,
    advanceZones: false,
    sellCommons: false,
    seed: null,
    ...opts,
  }

  if (typeof __setSeed === 'function') __setSeed(o.seed)

  const store = useGameStore
  store.getState().initGame(o.playerClass, o.playerRace)

  const readNewLogs = makeLogReader()
  const samples: Sample[] = []
  let itemsLooted = 0
  let itemsLost = 0
  let lostValueEst = 0
  let deaths = 0
  let firstFullAtMinute: number | null = null

  const totalTicks = Math.round((o.minutes * 60) / o.stepSeconds)
  const ticksPerSample = Math.round((o.sampleEveryMinutes * 60) / o.stepSeconds)
  const started = Date.now()

  for (let t = 1; t <= totalTicks; t++) {
    store.getState().tick(o.stepSeconds)
    const s = store.getState()

    for (const msg of readNewLogs(s.combatLog)) {
      if (msg.startsWith('Looted:')) itemsLooted++
      else if (msg.startsWith('Bag full!')) {
        itemsLost++
        lostValueEst += s.level * EXPECTED_VALUE_MULT
      } else if (msg.includes('bags full')) {
        itemsLost++
        lostValueEst += s.level * EXPECTED_VALUE_MULT
      } else if (msg.includes('You have died') || msg.includes('has slain you')) deaths++
    }

    if (firstFullAtMinute === null && s.inventory.every(Boolean)) {
      firstFullAtMinute = (t * o.stepSeconds) / 60
    }

    if (t % ticksPerSample === 0) {
      const minute = (t * o.stepSeconds) / 60

      if (o.advanceZones) {
        // Move on the moment the next zone is legal. This is the "engaged player
        // who keeps up with progression" regime.
        const idx = ZONE_ORDER.indexOf(s.currentZone)
        // ZONE_ORDER is declared `string[]` in data/zones.ts; every entry is a ZoneId.
        const next = ZONE_ORDER[idx + 1] as ZoneId | undefined
        if (next && canEnterZone(next, s.level, s.bossesDefeated)) {
          store.getState().selectZone(next)
        }
      }
      if (o.sellCommons) store.getState().sellAllCommon()

      const after = store.getState()
      const tgt = after.currentMob
      samples.push({
        minute,
        level: after.level,
        zone: after.currentZone,
        circuit: after.zoneCircuit ?? 0,
        gold: after.gold,
        bagUsed: after.inventory.filter(Boolean).length,
        bagSize: after.inventory.length,
        itemsLooted, itemsLost, lostValueEst, deaths,
        mode: after.gameMode,
        alive: after.isAlive,
        hpPct: after.stats.maxHp > 0 ? after.stats.currentHp / after.stats.maxHp : 0,
        mobCount: after.mobs.length,
        targetDist: tgt ? Math.hypot(tgt.offset.dx, tgt.offset.dy) : null,
        zoneKills: after.totalZoneKills[after.currentZone] ?? 0,
        pos: { ...after.playerMapPos },
      })
    }
  }

  return {
    opts: o,
    samples,
    final: samples[samples.length - 1],
    firstFullAtMinute,
    wallMs: Date.now() - started,
  }
}

// ── Stall detection ───────────────────────────────────────────────────────────
// An idle game's cardinal failure is a run that stops progressing while nobody is
// watching. A "stall" here is deliberately strict: gold did not move at all across
// consecutive samples through to the end of the run. Anything slow-but-alive is
// not a stall.

export interface StallVerdict {
  stalled: boolean
  /** Simulated minute progress last moved. */
  lastProgressMinute: number
  /** Simulated minutes spent frozen at the end of the run. */
  frozenMinutes: number
  /** The state the run froze in — the diagnosis. */
  frozenIn: string | null
}

export function detectStall(r: ScenarioResult): StallVerdict {
  const s = r.samples
  if (s.length < 2) return { stalled: false, lastProgressMinute: 0, frozenMinutes: 0, frozenIn: null }
  let last = 0
  for (let i = 1; i < s.length; i++) {
    if (s[i].gold !== s[i - 1].gold || s[i].zoneKills !== s[i - 1].zoneKills) last = s[i].minute
  }
  const frozen = s[s.length - 1].minute - last
  // Two consecutive dead samples is the threshold; one can be an unlucky window.
  const stalled = frozen >= 2 * r.opts.sampleEveryMinutes
  return {
    stalled,
    lastProgressMinute: last,
    frozenMinutes: frozen,
    frozenIn: stalled ? `${s[s.length - 1].alive ? s[s.length - 1].mode : 'dead'}` : null,
  }
}

export interface SweepResult {
  runs: { seed: number; verdict: StallVerdict; final: Sample }[]
  stalledCount: number
  total: number
}

/** Run the same scenario across N seeds and report how many soft-lock. */
export function runSweep(base: ScenarioOpts, seeds: number[]): SweepResult {
  const runs = seeds.map(seed => {
    const r = runScenario({ ...base, seed })
    return { seed, verdict: detectStall(r), final: r.final }
  })
  return { runs, stalledCount: runs.filter(x => x.verdict.stalled).length, total: runs.length }
}

export function formatSweep(sw: SweepResult, minutes: number): string {
  const out: string[] = []
  out.push(`sweep: ${sw.total} seeds × ${minutes} simulated minutes`)
  out.push('')
  out.push([pad('seed', 6), pad('stalled', 8), pad('froze@min', 10), pad('frozenFor', 10),
            pad('state', 10, true), pad('gold', 8), pad('lvl', 4), pad('lost', 6)].join(' '))
  out.push('-'.repeat(70))
  for (const { seed, verdict, final } of sw.runs) {
    out.push([pad(seed, 6), pad(verdict.stalled ? 'YES' : 'no', 8),
              pad(verdict.stalled ? verdict.lastProgressMinute.toFixed(0) : '-', 10),
              pad(verdict.stalled ? `${verdict.frozenMinutes.toFixed(0)}min` : '-', 10),
              pad(verdict.frozenIn ?? '-', 10, true), pad(final.gold, 8),
              pad(final.level, 4), pad(final.itemsLost, 6)].join(' '))
  }
  out.push('')
  const pct = (100 * sw.stalledCount) / sw.total
  out.push(`SOFT-LOCKED: ${sw.stalledCount}/${sw.total} runs (${pct.toFixed(0)}%)`)
  const alive = sw.runs.filter(r => !r.verdict.stalled)
  if (alive.length) {
    const avgGold = alive.reduce((a, r) => a + r.final.gold, 0) / alive.length
    const avgLost = alive.reduce((a, r) => a + r.final.itemsLost, 0) / alive.length
    const avgLoot = alive.reduce((a, r) => a + r.final.itemsLooted, 0) / alive.length
    out.push(`healthy runs: avg ${avgGold.toFixed(0)}g (${(avgGold / minutes).toFixed(1)}/min), ` +
             `${avgLoot.toFixed(0)} kept / ${avgLost.toFixed(0)} destroyed ` +
             `(${(100 * avgLost / (avgLoot + avgLost)).toFixed(0)}% of drops lost)`)
  }
  return out.join('\n')
}

// ── Report ────────────────────────────────────────────────────────────────────

function pad(s: string | number, w: number, left = false): string {
  const str = String(s)
  return left ? str.padEnd(w) : str.padStart(w)
}

export function formatReport(r: ScenarioResult): string {
  const out: string[] = []
  const o = r.opts
  out.push(
    `scenario: ${o.minutes}min  class=${o.playerClass}/${o.playerRace}  step=${o.stepSeconds}s` +
    `  advanceZones=${o.advanceZones}  sellCommons=${o.sellCommons}  (${r.wallMs}ms wall)`,
  )
  out.push('')
  out.push(
    [pad('min', 6), pad('lvl', 4), pad('zone', 20, true), pad('gold', 9), pad('g/min', 8),
     pad('bag', 7), pad('loot', 6), pad('lost', 6), pad('lostVal', 9),
     pad('mode', 10, true), pad('hp%', 5), pad('mobs', 5), pad('dist', 6), pad('kills', 6),
     pad('pos', 14)].join(' '),
  )
  out.push('-'.repeat(133))

  let prevGold = 0
  let prevMin = 0
  for (const s of r.samples) {
    const rate = (s.gold - prevGold) / Math.max(1e-9, s.minute - prevMin)
    out.push(
      [pad(s.minute.toFixed(0), 6), pad(s.level, 4), pad(s.zone, 20, true),
       pad(s.gold, 9), pad(rate.toFixed(1), 8), pad(`${s.bagUsed}/${s.bagSize}`, 7),
       pad(s.itemsLooted, 6), pad(s.itemsLost, 6), pad(Math.round(s.lostValueEst), 9),
       pad(s.alive ? s.mode : 'DEAD', 10, true), pad((s.hpPct * 100).toFixed(0), 5),
       pad(s.mobCount, 5), pad(s.targetDist === null ? '-' : s.targetDist.toFixed(1), 6),
       pad(s.zoneKills, 6), pad(`${s.pos.x.toFixed(2)},${s.pos.y.toFixed(2)}`, 14)].join(' '),
    )
    prevGold = s.gold
    prevMin = s.minute
  }

  const f = r.final
  out.push('')
  out.push(`bag first full at: ${r.firstFullAtMinute === null ? 'never' : `${r.firstFullAtMinute.toFixed(1)} min`}` +
           `  (capacity ${INVENTORY_SLOTS})`)
  out.push(`gold earned:       ${f.gold}  (${(f.gold / f.minute).toFixed(1)}/min average)`)
  out.push(`items looted:      ${f.itemsLooted}`)
  out.push(`items DESTROYED:   ${f.itemsLost}  (~${Math.round(f.lostValueEst)}g of modelled vendor value)`)
  if (f.itemsLooted + f.itemsLost > 0) {
    const pct = (100 * f.itemsLost) / (f.itemsLooted + f.itemsLost)
    out.push(`loot loss rate:    ${pct.toFixed(1)}% of all drops`)
  }
  out.push(`deaths:            ${f.deaths}`)
  return out.join('\n')
}
