// A fight, resolved without the store.
//
// ── Why this file exists ──────────────────────────────────────────────────────
// Until now there was no way to run a fight. `combat.ts` resolves a *swing*; the fight
// itself — swing cadence, DoT ticking, HP, who died — lived inside `gameStore.tick`,
// interleaved with worldgen, weather, loot, XP and thought triggers. That meant
// "simulate a fight" and "advance the player's entire game" were the same operation.
//
// Two features need a fight that is not the player's game:
//
//  - **Ambient heroes (Track L).** The crowd roaming a zone must fight *visibly* without
//    touching the player's combat, loot, XP or economy. With the loop trapped in the
//    store that guarantee was impossible to make; here it is structural, because this
//    module cannot reach the store at all.
//  - **Ghost PvP (Track P).** Two clients replay one duel from one seed and must agree.
//    That needs a fight that is a pure function of (seed, combatants).
//
// ── What this is NOT ──────────────────────────────────────────────────────────
// This is a LOOP, not a second combat model. Every number it produces comes from
// `compileStats` / `resolvePlayerAttack` / `resolveMobAttack`. If the damage formula
// changes in `combat.ts`, it changes here for free.
//
// Known fidelity gap, deliberate and worth stating plainly: three procs still live in
// the store tick rather than in the resolvers — Nightfall (gameStore ~L1388), Creeping
// Freeze (~L1570) and Echo (~L2251). This loop does not fire them, because reproducing
// them here would be exactly the duplicated combat model the design forbids. For
// ambient scenery that is invisible. For Track P's duels it is a real difference, and
// closing it means lifting those three out of the tick into the resolvers — remaining
// P0 work, tracked in PLAN.md.

import type {
  ActiveBuff, ActiveDoT, ClassType, CombatProcState, Item, MobInstance, Slot, StatBonuses, Stats,
} from '../data/types'
import {
  compileStats, compileTalentEffects, resolveMobAttack, resolvePlayerAttack, resetDotIds,
} from './combat'
import { mulberry32, type Rng } from './rng'

/** A hero-shaped combatant — the player, an ambient hero, or a PvP roster snapshot. */
export interface HeroCombatant {
  name: string
  playerClass: ClassType
  level: number
  equipment: Record<Slot, Item | null>
  talentAllocs: Record<string, number>
  racialPassive?: StatBonuses
}

/** One thing that happened, in order. The unit of comparison for determinism tests. */
export interface FightEvent {
  /** Seconds since the fight began, quantised to the simulation step. */
  t: number
  /** Index of the side that acted: 0 = attacker, 1 = defender. */
  side: 0 | 1
  kind: 'swing' | 'extra' | 'flurry' | 'dot' | 'block' | 'thorns' | 'death'
  damage: number
  crit: boolean
  /** Remaining HP of the side that took the damage, after it landed. */
  targetHp: number
  /** That side's maximum HP. Carried so a consumer can compute a health FRACTION without
   *  having to recompile the combatant's stats; excluded from `formatFightLog` since it
   *  is constant per side and would only pad the comparison artefact. */
  targetMaxHp: number
  /** DoT id for `dot` events — included so the log catches id drift too. */
  note?: string
}

export interface FightResult {
  seed: number
  /** 0 or 1, or null if the fight hit `maxSeconds` without a death. */
  winner: 0 | 1 | null
  /** Simulated seconds elapsed. */
  duration: number
  events: FightEvent[]
  /** Final HP of each side. */
  hp: [number, number]
}

export interface FightOpts {
  /** Simulation step. Smaller is more faithful and more expensive. */
  stepSeconds?: number
  /** Safety valve — a fight that cannot resolve must still terminate. */
  maxSeconds?: number
  /** Cap on retained events. A capped log is still deterministic; it is just shorter. */
  maxEvents?: number
}

const DEFAULT_STEP = 0.25
const DEFAULT_MAX_SECONDS = 120
const DEFAULT_MAX_EVENTS = 4096

/** A fresh proc state. Mirrors the store's own reset, kept local so this file stands alone. */
function freshProcState(): CombatProcState {
  return {
    procRngState: 0,   // fight.ts draws off its own seeded stream, not this one
    winterChillStacks: 0, comboPoints: 0, remorselessActive: false, iceBlockUsed: false,
    lastStandUsed: false, rampageStacks: 0, arcaneCharges: 0, timedCritTimer: 0,
    openerUsed: false, mobFrozen: false, mobFrozenTimer: 0, iceBarrierHp: 0,
  }
}

/** Internal per-side state. Heroes and mobs differ only in how a swing resolves. */
interface Side {
  kind: 'hero' | 'mob'
  name: string
  hp: number
  maxHp: number
  armor: number
  attackSeconds: number
  accum: number
  procState: CombatProcState
  buffs: ActiveBuff[]
  /** DoTs burning on THIS side (applied by the opponent). */
  dots: ActiveDoT[]
  hero?: { combatant: HeroCombatant; stats: Stats }
  mob?: MobInstance
  opener: boolean
}

function heroSide(c: HeroCombatant): Side {
  const stats = compileStats(c.playerClass, c.level, c.equipment, c.talentAllocs, c.racialPassive ?? {})
  return {
    kind: 'hero', name: c.name, hp: stats.maxHp, maxHp: stats.maxHp, armor: stats.armor,
    attackSeconds: stats.attackSpeedSeconds, accum: 0, procState: freshProcState(),
    buffs: [], dots: [], hero: { combatant: c, stats }, opener: true,
  }
}

function mobSide(m: MobInstance): Side {
  return {
    kind: 'mob', name: m.name, hp: m.currentHp, maxHp: m.maxHp, armor: 0,
    attackSeconds: m.attackSpeedSeconds, accum: 0, procState: freshProcState(),
    buffs: [], dots: [], mob: m, opener: true,
  }
}

/** Armour mitigation, matching `resolveMobAttack`'s curve exactly. */
function mitigate(raw: number, armor: number): number {
  return Math.max(1, Math.round(raw * (1 - armor / (armor + 100))))
}

/**
 * Run a fight to a conclusion.
 *
 * Deterministic in `seed`: the same seed and the same two combatants always produce the
 * same `FightResult`, including event ordering and DoT ids.
 *
 * Accepts hero-vs-mob (what ambient heroes do) and hero-vs-hero (what a Track P duel
 * will do). Mob-vs-mob is not meaningful and is not supported.
 */
export function runFight(
  seed: number,
  a: HeroCombatant | MobInstance,
  b: HeroCombatant | MobInstance,
  opts: FightOpts = {},
): FightResult {
  const step = opts.stepSeconds ?? DEFAULT_STEP
  const maxSeconds = opts.maxSeconds ?? DEFAULT_MAX_SECONDS
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS

  // One stream for the whole fight. Both clients walk it in the same order because the
  // loop below is fully ordered: side 0 resolves before side 1 at every step.
  const rng: Rng = mulberry32(seed)
  // Pin DoT ids to the seed so a replay mints identical ids rather than merely
  // equivalent ones — otherwise two correct fights compare as different logs.
  resetDotIds(seed >>> 16)

  const isHero = (x: HeroCombatant | MobInstance): x is HeroCombatant =>
    (x as HeroCombatant).playerClass !== undefined
  const sides: [Side, Side] = [
    isHero(a) ? heroSide(a) : mobSide(a),
    isHero(b) ? heroSide(b) : mobSide(b),
  ]

  const events: FightEvent[] = []
  let t = 0
  let winner: 0 | 1 | null = null

  const emit = (e: FightEvent) => { if (events.length < maxEvents) events.push(e) }

  // Apply damage; returns true if the target died on this blow.
  const damage = (target: Side, amount: number): boolean => {
    target.hp = Math.max(0, target.hp - amount)
    return target.hp <= 0
  }

  outer:
  while (t < maxSeconds) {
    t = +(t + step).toFixed(4)

    // ── DoT ticks. Resolved before swings so a DoT that kills does so cleanly. ──
    for (let s = 0 as 0 | 1; s < 2; s = (s + 1) as 0 | 1) {
      const side = sides[s]
      if (!side.dots.length) continue
      const survivors: ActiveDoT[] = []
      for (const dot of side.dots) {
        dot.tickAccum += step
        if (dot.tickAccum >= dot.tickIntervalSeconds) {
          dot.tickAccum -= dot.tickIntervalSeconds
          dot.ticksRemaining--
          const dead = damage(side, dot.tickDamage)
          emit({ t, side: (1 - s) as 0 | 1, kind: 'dot', damage: dot.tickDamage,
                 crit: false, targetHp: side.hp, targetMaxHp: side.maxHp, note: dot.id })
          if (dead) { winner = (1 - s) as 0 | 1; emit({ t, side: s, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: side.maxHp }); break outer }
        }
        if (dot.ticksRemaining > 0) survivors.push(dot)
      }
      side.dots = survivors
    }

    // ── Swings, side 0 then side 1. The fixed order is what keeps two clients in step. ──
    for (let s = 0 as 0 | 1; s < 2; s = (s + 1) as 0 | 1) {
      const me = sides[s]
      const foe = sides[(1 - s) as 0 | 1]
      me.accum += step
      if (me.accum < me.attackSeconds) continue
      me.accum -= me.attackSeconds

      if (me.kind === 'hero' && me.hero) {
        const { combatant, stats } = me.hero
        const swing = (kind: 'swing' | 'extra' | 'flurry'): boolean => {
          const res = resolvePlayerAttack(
            stats, combatant.playerClass, combatant.talentAllocs, me.procState, me.buffs,
            undefined,
            {
              mobHpFraction: foe.hp / foe.maxHp,
              playerHpFraction: me.hp / me.maxHp,
              rampageStacks: me.procState.rampageStacks,
              arcaneCharges: me.procState.arcaneCharges,
              targetBurning: foe.dots.some(d => d.sourceType === 'burn'),
              isOpener: me.opener,
              rng,
            },
          )
          me.opener = false

          // A hero defender mitigates with armour; a mob has none, matching the store,
          // where mob HP absorbs the raw swing.
          const dealt = foe.kind === 'hero' ? mitigate(res.damage, foe.armor) : res.damage
          const dead = damage(foe, dealt)
          emit({ t, side: s, kind, damage: dealt, crit: res.isCrit, targetHp: foe.hp, targetMaxHp: foe.maxHp })
          // Refresh by source, do not accumulate. This used to `push(...)` blindly, which
          // is fine for a crit-gated bleed and catastrophic for the UNCONDITIONAL DoTs:
          // Corruption and Curse of Agony trigger on EVERY swing (combat.ts:409, :412), so
          // a warlock stacked one fresh 6-tick corruption per swing and reached a steady
          // state of roughly ceil(18 / attackSeconds) running at once — around 9x the
          // store's throughput, which refreshes a single DoT per `sourceType`.
          //
          // The store's merge is the correct one and is what every tooltip describes, so
          // this loop adopts it rather than the other way round.
          for (const dot of res.triggeredDoTs) {
            const i = foe.dots.findIndex(d => d.sourceType === dot.sourceType)
            if (i >= 0) {
              // Refresh DURATION, keep the TICK CLOCK. Carrying `tickAccum` across is not
              // a detail: Corruption and Curse of Agony tick every 3s (combat.ts:518, :524)
              // and are re-applied on EVERY swing, and every class swings faster than that
              // (1.5–2.5s base). Installing a fresh DoT resets the clock, so it never
              // reaches its first tick and deals literally zero damage. The golden caught
              // exactly that: warlock dot events went to 0 and the fights got LONGER.
              dot.tickAccum = foe.dots[i].tickAccum
              foe.dots[i] = dot
            } else foe.dots.push(dot)
          }
          if (res.lifeDrawn > 0) me.hp = Math.min(me.maxHp, me.hp + res.lifeDrawn)
          if (dead) return true

          if (kind === 'swing') {
            if (res.extraHit && swing('extra')) return true
            if (res.flurryHit && swing('flurry')) return true
          }
          return false
        }
        if (swing('swing')) {
          winner = s
          emit({ t, side: (1 - s) as 0 | 1, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: foe.maxHp })
          break outer
        }
      } else if (me.kind === 'mob' && me.mob && foe.kind === 'hero' && foe.hero) {
        const fx = compileTalentEffects(foe.hero.combatant.playerClass, foe.hero.combatant.talentAllocs)
        // The literal `1` here made `enemy_slow` inert in this loop while the store passed
        // the real factor (gameStore's `resolveMobAttack(..., fx.mobAttackSpeedFactor, fx)`),
        // so a Glacial Rite mage mitigated incoming damage in the player's fight and not at
        // all in an ambient one or a duel. Same talent, same resolver, two answers.
        //
        // Note what this does NOT fix, in either loop: the factor only shrinks per-swing
        // DAMAGE. Neither cadence is slowed — this loop's `me.accum < me.attackSeconds`
        // and the store's `mobAttackAccum >= currentMob.attackSpeedSeconds` both threshold
        // the unmodified interval. "Enemy slow" is a damage reduction wearing a speed name.
        const res = resolveMobAttack(me.mob, foe.armor, fx.mobAttackSpeedFactor, fx, rng)
        if (res.blocked) {
          emit({ t, side: s, kind: 'block', damage: 0, crit: false, targetHp: foe.hp, targetMaxHp: foe.maxHp })
        } else {
          const dead = damage(foe, res.damage)
          emit({ t, side: s, kind: 'swing', damage: res.damage, crit: false, targetHp: foe.hp, targetMaxHp: foe.maxHp })
          if (dead) {
            winner = s
            emit({ t, side: (1 - s) as 0 | 1, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: foe.maxHp })
            break outer
          }
          if (res.thorns > 0) {
            const thornsDead = damage(me, res.thorns)
            emit({ t, side: (1 - s) as 0 | 1, kind: 'thorns', damage: res.thorns, crit: false, targetHp: me.hp, targetMaxHp: me.maxHp })
            if (thornsDead) {
              winner = (1 - s) as 0 | 1
              emit({ t, side: s, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: me.maxHp })
              break outer
            }
          }
        }
      }
    }
  }

  return { seed, winner, duration: t, events, hp: [sides[0].hp, sides[1].hp] }
}

/**
 * Serialise a result to a stable string. This is the artefact the determinism test
 * compares — a structural diff would let field-order changes read as desyncs.
 */
export function formatFightLog(r: FightResult): string {
  const lines = [`seed=${r.seed} winner=${r.winner} duration=${r.duration} hp=${r.hp[0]},${r.hp[1]}`]
  for (const e of r.events) {
    lines.push(`${e.t.toFixed(2)} s${e.side} ${e.kind} dmg=${e.damage} crit=${e.crit ? 1 : 0} hp=${e.targetHp}${e.note ? ` id=${e.note}` : ''}`)
  }
  return lines.join('\n')
}
