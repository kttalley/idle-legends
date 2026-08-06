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
  EXTRA_HIT_MULT, FLURRY_MULT,
  resolveHeroTurn, advanceHeroUpkeep,
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
    procTargetId: null,  // one opponent for the whole fight; nothing to re-scope
    winterChillStacks: 0, comboPoints: 0, remorselessActive: false, iceBlockUsed: false,
    lastStandUsed: false, rampageStacks: 0, arcaneCharges: 0, timedCritTimer: 0,
    reapingArcTimer: 0, reapingArcCharges: 0,
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

    // ── Per-step upkeep, before anything resolves. Shared with the store, so a frozen
    // timer, a banked free crit and Second Wind now exist here too — they used to be
    // store-only, which meant an ambient hero or a duellist simply did not have them. ──
    for (let s2 = 0 as 0 | 1; s2 < 2; s2 = (s2 + 1) as 0 | 1) {
      const side = sides[s2]
      if (side.kind !== 'hero' || !side.hero) continue
      const hp = { currentHp: side.hp, maxHp: side.maxHp }
      advanceHeroUpkeep(
        side.procState,
        compileTalentEffects(side.hero.combatant.playerClass, side.hero.combatant.talentAllocs),
        hp, step,
      )
      side.hp = hp.currentHp
    }

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
        // The swing/extra/flurry SEQUENCE now lives in `combat.ts` (`resolveHeroTurn`),
        // shared with the store. It is the part that drifted: order, magnitudes, the rule
        // that procs are consulted once, and stopping the moment a side falls. What stays
        // here is what is genuinely this loop's own — mitigation against a hero defender,
        // Retaliation, the event log, and what a death means.
        const outcome = resolveHeroTurn(
          {
            stats,
            playerClass: combatant.playerClass,
            talentAllocs: combatant.talentAllocs,
            procState: me.procState,
            activeBuffs: me.buffs,
            targetHpFraction: foe.hp / foe.maxHp,
            playerHpFraction: me.hp / me.maxHp,
            targetBurning: foe.dots.some(d => d.sourceType === 'burn'),
            isOpener: me.opener,
            rampageStacks: me.procState.rampageStacks,
            arcaneCharges: me.procState.arcaneCharges,
            rng,
          },
          (hit) => {
            me.opener = false

            // A hero defender mitigates with armour AND the defensive talents they paid
            // for; a mob has neither, matching the store, where mob HP absorbs the raw
            // swing.
            let dealt = hit.damage
            let blockedHit = false
            let reflected = 0
            if (foe.kind === 'hero' && foe.hero) {
              const dfx = compileTalentEffects(foe.hero.combatant.playerClass, foe.hero.combatant.talentAllocs)
              blockedHit = dfx.avoidChance > 0 && rng() < dfx.avoidChance
              if (blockedHit) dealt = 0
              else {
                dealt = Math.max(1, Math.round(
                  mitigate(hit.damage, foe.armor) * (1 - dfx.damageReduction)))
                reflected = dfx.thornsPct > 0 ? Math.round(dealt * dfx.thornsPct) : 0
              }
            }

            if (blockedHit) {
              emit({ t, side: (1 - s) as 0 | 1, kind: 'block', damage: 0, crit: false,
                     targetHp: foe.hp, targetMaxHp: foe.maxHp })
              // Nothing landed, so no DoTs and no lifesteal — but the swing was spent and
              // the proc chain continues, exactly as a miss would.
              return { targetDied: false, targetHpFraction: foe.hp / foe.maxHp }
            }

            const dead = damage(foe, dealt)
            emit({ t, side: s, kind: hit.kind, damage: dealt, crit: hit.crit,
                   targetHp: foe.hp, targetMaxHp: foe.maxHp })
            // Refresh by source, do not accumulate — and carry the TICK CLOCK across, or a
            // DoT re-applied faster than its own interval never reaches a tick. See the
            // matching note in gameStore.
            for (const dot of hit.triggeredDoTs) {
              const i = foe.dots.findIndex(d => d.sourceType === dot.sourceType)
              if (i >= 0) { dot.tickAccum = foe.dots[i].tickAccum; foe.dots[i] = dot }
              else foe.dots.push(dot)
            }
            if (hit.lifeDrawn > 0) me.hp = Math.min(me.maxHp, me.hp + hit.lifeDrawn)

            if (!dead && reflected > 0) {
              const attackerDead = damage(me, reflected)
              emit({ t, side: (1 - s) as 0 | 1, kind: 'thorns', damage: reflected, crit: false,
                     targetHp: me.hp, targetMaxHp: me.maxHp })
              if (attackerDead) {
                emit({ t, side: s, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: me.maxHp })
                return { targetDied: false, attackerDied: true, targetHpFraction: foe.hp / foe.maxHp }
              }
            }
            return { targetDied: dead, targetHpFraction: foe.hp / foe.maxHp }
          },
        )
        if (outcome === 'target') {
          winner = s
          emit({ t, side: (1 - s) as 0 | 1, kind: 'death', damage: 0, crit: false, targetHp: 0, targetMaxHp: foe.maxHp })
          break outer
        }
        if (outcome === 'attacker') {
          // Retaliation killed the swinger; the death event was already emitted where it
          // happened, so only the verdict is left to record.
          winner = (1 - s) as 0 | 1
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
