// Determinism harness for the headless fight resolver.
//
// This is the acceptance test for Track P step 0: **the same seed and the same two
// roster snapshots must produce a byte-identical fight log, twice.** Without it, ghost
// PvP is built on sand — a desync would only show up after rosters were live.
//
// Two things this deliberately does NOT do:
//
//  - It does not install a seeded global `Math.random`. `tools/sim/run.mjs` does that
//    for the economy harness, and it would make this test pass vacuously. The point is
//    that the fight is deterministic *because the seed is threaded through it*, not
//    because the whole process was pinned.
//  - It does not accept "same winner" as a pass. Two runs can agree on the winner and
//    still have diverged on every roll in between. Only the full log counts.

import type { ClassType, Item, MobInstance, Slot, StatBonuses } from '../data/types'
import { formatFightLog, runFight, type FightResult, type HeroCombatant } from '../engine/fight'
import { mulberry32, type Rng } from '../engine/rng'

const SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

/** A deterministic stand-in for a roster snapshot: gear derived from the seed alone. */
function rosterEquipment(rng: Rng, level: number): Record<Slot, Item | null> {
  const eq = {} as Record<Slot, Item | null>
  for (const slot of SLOTS) {
    const power = 1 + Math.floor(rng() * level)
    const bonuses: StatBonuses = {
      strength: Math.round(power * (0.5 + rng())),
      intellect: Math.round(power * (0.5 + rng())),
      agility: Math.round(power * (0.5 + rng())),
      stamina: Math.round(power * (1 + rng())),
      armor: Math.round(power * (0.5 + rng())),
      weaponDps: slot === 'weapon' ? Math.round(power * (2 + rng() * 2)) : 0,
      critChance: +(rng() * 0.03).toFixed(4),
    }
    eq[slot] = {
      id: `sim_${slot}_${level}`,
      name: `Sim ${slot}`,
      slot,
      rarity: 'common',
      level,
      statBonuses: bonuses,
      vendorValue: 0,
    }
  }
  return eq
}

/** Build a reproducible hero from a seed — stands in for a downloaded PvP snapshot. */
export function makeRoster(seed: number, playerClass: ClassType, level: number, name: string): HeroCombatant {
  const rng = mulberry32(seed)
  const allocs: Record<string, number> = {}
  return {
    name,
    playerClass,
    level,
    equipment: rosterEquipment(rng, level),
    talentAllocs: allocs,
    racialPassive: {},
  }
}

/** A reproducible mob — what an ambient hero actually fights in L0. */
export function makeMob(seed: number, level: number, name = 'Sim Beast'): MobInstance {
  const rng = mulberry32(seed)
  const maxHp = Math.round(60 + level * 22 * (0.8 + rng() * 0.4))
  return {
    id: `sim_mob_${seed}`,
    templateId: 'sim' as MobInstance['templateId'],
    name,
    currentHp: maxHp,
    maxHp,
    damage: Math.round(4 + level * 1.6 * (0.8 + rng() * 0.4)),
    xpReward: 0,
    goldMin: 0,
    goldMax: 0,
    lootTableIds: [],
    spriteKey: 'beast',
    attackSpeedSeconds: 2,
    isElite: false,
    isBoss: false,
    offset: { dx: 0, dy: 0 },
    dots: [],
  }
}

export interface DeterminismCase {
  label: string
  seed: number
  run: () => FightResult
}

export interface DeterminismReport {
  label: string
  seed: number
  identical: boolean
  events: number
  winner: 0 | 1 | null
  duration: number
  /** First differing line, when a case fails. */
  firstDiff?: string
}

/** Run a case twice from scratch and compare the serialised logs byte for byte. */
export function checkDeterminism(c: DeterminismCase): DeterminismReport {
  const a = formatFightLog(c.run())
  const b = formatFightLog(c.run())
  const result = c.run()

  let firstDiff: string | undefined
  if (a !== b) {
    const la = a.split('\n'), lb = b.split('\n')
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) { firstDiff = `line ${i + 1}:\n  run1: ${la[i] ?? '<eof>'}\n  run2: ${lb[i] ?? '<eof>'}`; break }
    }
  }

  return {
    label: c.label,
    seed: c.seed,
    identical: a === b,
    events: result.events.length,
    winner: result.winner,
    duration: result.duration,
    firstDiff,
  }
}

/**
 * The counter-test. A resolver that ignored its seed entirely — or one whose rolls got
 * stubbed to a constant — would sail through `checkDeterminism`, because a frozen fight
 * is trivially reproducible. So: distinct seeds must produce distinct fights.
 *
 * The bar is a THRESHOLD, not perfection, and that is not a fudge. A short fight
 * contains few rolls — a talentless warrior rolls once per swing (crit) over ~8 swings —
 * so two seeds landing the same crit pattern is ordinary birthday-paradox collision, not
 * a desync. Demanding 100% uniqueness there fails a perfectly correct engine. Feed this
 * a proc-rich fight (`standardCases`' duel) and keep the threshold below 1.
 */
export function checkSeedSensitivity(
  make: (seed: number) => FightResult,
  seeds: number[],
  minDistinctRatio = 0.9,
): { distinct: number; total: number; ratio: number; pass: boolean; collisions: string[] } {
  const seen = new Map<string, number>()
  const collisions: string[] = []
  for (const s of seeds) {
    const log = formatFightLog(make(s))
    // Compare on the body, not the header — the header embeds the seed, so two
    // identical fights under different seeds would otherwise look distinct.
    const body = log.split('\n').slice(1).join('\n')
    const prior = seen.get(body)
    if (prior !== undefined) collisions.push(`seed ${s} produced the same log as seed ${prior}`)
    else seen.set(body, s)
  }
  const ratio = seen.size / seeds.length
  return { distinct: seen.size, total: seeds.length, ratio, pass: ratio >= minDistinctRatio, collisions }
}

const CLASSES: ClassType[] = ['warrior', 'mage', 'rogue', 'warlock']

/** The standard suite: hero-vs-mob (Track L) and hero-vs-hero (Track P) across classes. */
export function standardCases(seeds: number[]): DeterminismCase[] {
  const cases: DeterminismCase[] = []
  for (const seed of seeds) {
    for (const cls of CLASSES) {
      cases.push({
        label: `${cls} vs mob`,
        seed,
        run: () => runFight(seed, makeRoster(seed + 1, cls, 30, `H${cls}`), makeMob(seed + 2, 30)),
      })
    }
    cases.push({
      label: 'warrior vs mage (duel)',
      seed,
      run: () => runFight(
        seed,
        makeRoster(seed + 11, 'warrior', 40, 'Concord'),
        makeRoster(seed + 22, 'mage', 40, 'Ashmarch'),
      ),
    })
  }
  return cases
}

export function formatDeterminismReport(rs: DeterminismReport[]): string {
  const fails = rs.filter(r => !r.identical)
  const lines: string[] = []
  lines.push('── Fight determinism ─────────────────────────────────────────────')
  lines.push(`cases: ${rs.length}   identical: ${rs.length - fails.length}   FAILED: ${fails.length}`)
  lines.push('')
  lines.push('  seed  case                      events  winner  dur    result')
  for (const r of rs) {
    lines.push(
      `  ${String(r.seed).padStart(4)}  ${r.label.padEnd(24)}  ` +
      `${String(r.events).padStart(6)}  ${String(r.winner).padStart(6)}  ` +
      `${r.duration.toFixed(1).padStart(5)}  ${r.identical ? 'ok' : 'DESYNC'}`,
    )
  }
  for (const f of fails) {
    lines.push('')
    lines.push(`DESYNC — ${f.label} (seed ${f.seed}):`)
    lines.push(f.firstDiff ?? '  (logs differ in length only)')
  }
  return lines.join('\n')
}
