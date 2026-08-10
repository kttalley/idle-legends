import type {
  Stats, MobInstance, Item, Slot, ClassType,
  CompiledTalentEffects, StatBonuses, TalentMechanicType, AbilityMod,
  ActiveDoT, ActiveBuff, CombatProcState,
  AbilityEffectDef,
} from '../data/types'
import { CLASS_DEFINITIONS } from '../data/classes'
import { allClassTalents } from '../data/specs'
import { HP_PER_STAMINA, CRIT_MULTIPLIER, AGILITY_CRIT_DIVISOR } from '../data/constants'
import type { Rng } from './rng'

/** A mod that changes nothing — the identity every ability starts from. */
export function emptyAbilityMod(): AbilityMod {
  return { damageMult: 1, cooldownMult: 1, castTimeMult: 1, extraEffects: [], notes: [] }
}

// ── Talent Effect Compilation ─────────────────────────────────────────────────
/**
 * Two passes, deliberately.
 *
 * The first sums every talent into a flat `mechanics` bag keyed by what the mechanic
 * IS; the second derives the named fields combat actually reads. This replaced a
 * 45-case switch that both summed and interpreted at once — and interpreted by
 * inspecting the magnitude of the data ("if valuePerRank < 1 this means crit damage,
 * otherwise armour shred"), which meant a tree could change meaning by being retuned.
 *
 * The payoff is that the nine trees still to be authored are pure data: a new mechanic
 * adds a key and one line of derivation, and a tree that only reuses existing
 * mechanics costs zero engine changes.
 */
export function compileTalentEffects(
  playerClass: ClassType,
  talentAllocs: Record<string, number>,
): CompiledTalentEffects {
  const mechanics: Partial<Record<TalentMechanicType, number>> = {}
  const statBonuses: StatBonuses = {}
  const abilityMods: Record<string, AbilityMod> = {}
  // Ranks are tracked separately from summed value for the handful of mechanics that
  // care how many TIMES they were taken rather than how much they add up to.
  const ranksOf: Partial<Record<TalentMechanicType, number>> = {}

  const addStat = (stat: keyof StatBonuses, val: number) => {
    statBonuses[stat] = ((statBonuses[stat] ?? 0) as number) + val
  }
  const modFor = (id: string) => (abilityMods[id] ??= emptyAbilityMod())

  // ── Pass 1: sum ──
  for (const talent of allClassTalents(playerClass)) {
    const ranks = talentAllocs[talent.id] ?? 0
    if (ranks === 0) continue

    for (const effect of talent.effects) {
      if (effect.type === 'stat') {
        addStat(effect.stat, effect.valuePerRank * ranks)
        continue
      }
      if (effect.type === 'mechanic') {
        mechanics[effect.mechanic] = (mechanics[effect.mechanic] ?? 0) + effect.valuePerRank * ranks
        ranksOf[effect.mechanic] = Math.max(ranksOf[effect.mechanic] ?? 0, ranks)
        continue
      }
      // effect.type === 'ability'
      const mod = modFor(effect.ability)
      const total = effect.valuePerRank * ranks
      switch (effect.mod) {
        case 'damage':   mod.damageMult   += total; break
        // Data says "reduces cooldown by 10%" and contributes 0.1, so no tree ever has
        // to think in reciprocals. Floored at a quarter of the base so no stack of
        // talents can drive a cooldown to zero.
        case 'cooldown': mod.cooldownMult  = Math.max(0.25, mod.cooldownMult - total); break
        case 'castTime': mod.castTimeMult  = Math.max(0.25, mod.castTimeMult - total); break
        case 'rider':    if (effect.rider) mod.extraEffects.push(effect.rider); break
      }
      if (effect.note && !mod.notes.includes(effect.note)) mod.notes.push(effect.note)
    }
  }

  // ── Pass 2: derive ──
  const m = (k: TalentMechanicType) => mechanics[k] ?? 0

  // Lifesteal talents are still expressed as a damage bonus rather than real leeching;
  // that was true before this rewrite and is preserved verbatim rather than silently
  // changed under cover of a refactor.
  if (m('lifesteal') > 0) addStat('weaponDps', m('lifesteal') * 8)

  const poisonDps = m('poison_potency')

  return {
    mechanics,
    abilityMods,
    statBonuses,
    /**
     * A true multiplier on final weapon damage, applied in `compileStats` after every
     * flat source.
     *
     * It used to be a share of the class's BASE weapon damage, on the reasoning that
     * scaling off the CURRENT weapon would compound with gear and become the best
     * talent in the game. That reasoning was sound and the implementation was not:
     * base weaponDps is 8 for a warrior and 5 for a warlock, so once eight trees
     * started buying this, four ranks of a capstone damage talent were worth +0.7 DPS.
     * A talent that reads "+8% damage" has to move the number the player can see.
     *
     * The compounding worry is handled by the per-rank values instead — every tree
     * spends 0.015–0.025 a rank, so a fully-committed tree lands around +15%, which is
     * a real talent and not a multiplier that eats the gear curve.
     */
    damageAmp: 1 + m('damage_amp'),
    critDamageMultiplier: CRIT_MULTIPLIER + m('crit_damage'),
    mobAttackSpeedFactor: Math.max(0.4, 1.0 - m('enemy_slow')),
    mobArmorReduction: m('armor_shred'),
    deepWoundsBleedPct: m('bleed_on_crit'),
    vilePoisons: poisonDps > 0
      ? { procChance: Math.min(0.8, 0.15 + m('poison_chance')), dps: poisonDps }
      : null,
    corruptionDps: m('shadow_dot'),
    curseOfAgonyEnabled: m('curse_of_agony') > 0,
    siphonLifeHpPerTick: m('siphon_life'),
    nightfallProcChance: m('nightfall'),
    amplifyCurseEnabled: m('amplify_curse') > 0,
    frostbiteChance: m('freeze_chance'),
    shatterCritBonus: m('frozen_crit'),
    winterChillEnabled: m('chill_stacks') > 0,
    iceBlockEnabled: m('death_ward') > 0,
    iceBarrierAbsorb: m('absorb_shield'),
    sealFateEnabled: m('seal_fate') > 0,
    sealFateRanks: ranksOf['seal_fate'] ?? 0,
    remorselessEnabled: m('remorseless_attacks') > 0,
    sweepingStrikesEnabled: m('sweeping_strikes') > 0,
    swordSpecEnabled: m('extra_strike') > 0,
    swordSpecProcChance: m('extra_strike'),
    // ── Defence ──
    // Capped at half: an idle hero who takes literally no damage never dies, and a zone
    // that cannot kill you is a zone with no reason to leave it. The same reasoning caps
    // avoidance — two 50% caps still let a blow through one fight in four.
    damageReduction: Math.min(0.5, m('damage_reduction')),
    avoidChance: Math.min(0.5, m('avoid_chance')),
    armorScaling: m('armor_scaling'),
    secondWindHpPerTick: m('second_wind'),
    thornsPct: m('thorns'),
    // Clamped to a share of max HP. It is a SHARE, and a data slip that made it 5.0
    // would otherwise have the hero survive a killing blow at five times full health —
    // which is exactly what a mistuned rank did before this clamp existed.
    lastStandPct: Math.min(0.5, m('last_stand')),
    // ── Offence ──
    attackHasteFactor: Math.max(0.5, 1 - m('attack_haste')),
    flurryChance: Math.min(0.6, m('flurry')),
    enragePct: m('enrage'),
    bloodthirstPct: m('bloodthirst'),
    rampageChance: m('rampage') > 0 ? 1 : 0,
    openerBurstPct: m('opener_burst'),
    // Data gives a RATE (fraction of a crit per second); the tick wants an interval.
    // Expressed that way so ranks add up linearly — inverting per-rank seconds would
    // make the second point in a talent worth less than the first for no stated reason.
    timedCritSeconds: m('timed_crit') > 0 ? 1 / m('timed_crit') : 0,
    arcaneChargePct: m('arcane_charge'),
    minionDps: m('minion_dps'),
    echoChance: Math.min(0.5, m('echo_chance')),
    // ── Enemy state / DoTs ──
    burningCritBonus: m('burning_crit'),
    ignitePct: m('ignite'),
    dotAmp: 1 + m('dot_amp'),
  }
}

// ── Stat Compilation ──────────────────────────────────────────────────────────
export function compileStats(
  playerClass: ClassType,
  level: number,
  equipment: Record<Slot, Item | null>,
  talentAllocs: Record<string, number>,
  racialPassive: StatBonuses = {},
): Stats {
  const classDef = CLASS_DEFINITIONS[playerClass]
  const base = classDef.baseStats
  const fx = compileTalentEffects(playerClass, talentAllocs)

  const eqBonuses: StatBonuses = {}
  for (const item of Object.values(equipment)) {
    if (!item) continue
    for (const [key, val] of Object.entries(item.statBonuses) as [keyof StatBonuses, number][]) {
      eqBonuses[key] = ((eqBonuses[key] ?? 0) as number) + val
    }
  }

  const levelBonus = Math.floor((level - 1) * 0.5)
  const strength  = base.strength  + levelBonus + (fx.statBonuses.strength  ?? 0) + (eqBonuses.strength  ?? 0) + (racialPassive.strength  ?? 0)
  const intellect = base.intellect + levelBonus + (fx.statBonuses.intellect ?? 0) + (eqBonuses.intellect ?? 0) + (racialPassive.intellect ?? 0)
  const agility   = base.agility   + levelBonus + (fx.statBonuses.agility   ?? 0) + (eqBonuses.agility   ?? 0) + (racialPassive.agility   ?? 0)
  const stamina   = base.stamina   + levelBonus + (fx.statBonuses.stamina   ?? 0) + (eqBonuses.stamina   ?? 0) + (racialPassive.stamina   ?? 0)
  // Bulwark's `armor_scaling` is a share of the armour you already have, so it rewards
  // stacking armour everywhere else rather than replacing it — applied last, over the
  // flat sum, which is the only ordering where "+4% armour" means what it says.
  const flatArmor = base.armor + (fx.statBonuses.armor ?? 0) + (eqBonuses.armor ?? 0) + (racialPassive.armor ?? 0)
  const armor     = Math.max(0, Math.round(flatArmor * (1 + fx.armorScaling)))
  const wDps      = base.weaponDps + (fx.statBonuses.weaponDps ?? 0) + (eqBonuses.weaponDps ?? 0) + (racialPassive.weaponDps ?? 0)

  // Warbringer buys swings per second here. Multiplicative on the final interval and
  // floored at 0.5s, the same floor every other speed source respects.
  const attackSpeedSeconds = Math.max(0.5, (
    base.attackSpeedSeconds +
    (fx.statBonuses.attackSpeedSeconds ?? 0) +
    (eqBonuses.attackSpeedSeconds ?? 0) +
    (racialPassive.attackSpeedSeconds ?? 0)
  ) * fx.attackHasteFactor)

  const primaryStat = playerClass === 'warrior' ? strength
    : (playerClass === 'mage' || playerClass === 'warlock') ? intellect
    : agility

  const critChance = Math.min(0.75,
    agility / AGILITY_CRIT_DIVISOR +
    (fx.statBonuses.critChance ?? 0) +
    (eqBonuses.critChance ?? 0) +
    (racialPassive.critChance ?? 0)
  )
  const goldFindBonus = Math.max(base.goldFindBonus,
    (eqBonuses.goldFindBonus ?? 1) + (racialPassive.goldFindBonus ?? 0))
  const maxHp = Math.floor(stamina * HP_PER_STAMINA + 50 + level * 5)

  return {
    maxHp,
    currentHp: maxHp,
    strength, intellect, agility, stamina, armor,
    // `damageAmp` multiplies the finished number, primary stat included, so "+15%
    // damage" means what a player would assume it means.
    weaponDps: Math.max(1, (wDps + primaryStat * 0.1) * fx.damageAmp),
    attackSpeedSeconds,
    critChance,
    goldFindBonus,
  }
}

// ── Gear scoring ──────────────────────────────────────────────────────────────
/**
 * How good a whole equipment set is for THIS class, as one number.
 *
 * Effective DPS × effective HP — the usual combat-power product. Both halves are read
 * out of the real combat math rather than modelled a second time, which is what keeps it
 * honest as the formulas change:
 *
 *  • **Sustained DPS is exactly `weaponDps`.** `resolvePlayerAttack` deals
 *    `weaponDps × attackSpeedSeconds` once every `attackSpeedSeconds`, so attack speed
 *    cancels out of the rate entirely — it changes hit granularity, not throughput.
 *    Lifted here by the expected crit multiplier.
 *  • **Armor is a multiplier on survivability.** `resolveMobAttack` reduces incoming
 *    damage by `armor / (armor + 100)`, so effective HP is `maxHp × (armor + 100) / 100`.
 *
 * Class-awareness comes for free: `compileStats` folds the class's own primary stat into
 * `weaponDps` (`+ primaryStat × 0.1`), so a strength trinket simply scores nothing on a
 * mage. That is the whole reason auto-equip cannot reuse `itemPower` from data/items.ts —
 * that one ranks by level and rarity alone, which is right for "would a merchant buy
 * this" and quite wrong for "should this hero wear it".
 */
export function gearScore(
  playerClass: ClassType,
  level: number,
  equipment: Record<Slot, Item | null>,
  talentAllocs: Record<string, number>,
  racialPassive: StatBonuses = {},
): number {
  const s = compileStats(playerClass, level, equipment, talentAllocs, racialPassive)
  const dps = s.weaponDps * (1 + s.critChance * (CRIT_MULTIPLIER - 1))
  const ehp = s.maxHp * (s.armor + 100) / 100
  return dps * ehp
}

/**
 * Would wearing `item` make this hero strictly better off? Compares whole compiled sets,
 * so a piece that trades armour for damage is judged on the net effect rather than on
 * whichever stat happens to be listed first.
 */
/**
 * How much stat advantage a unique is granted when competing with ordinary gear.
 *
 * At 1.5 the unique wins unless the rival carries half again its power. Not absolute:
 * see the note inside `isGearUpgrade` for the measured reason.
 */
export const UNIQUE_POWER_EDGE = 1.5

export function isGearUpgrade(
  item: Item,
  playerClass: ClassType,
  level: number,
  equipment: Record<Slot, Item | null>,
  talentAllocs: Record<string, number>,
  racialPassive: StatBonuses = {},
): boolean {
  // A unique is worn over anything ordinary, whatever the stat comparison says.
  //
  // `gearScore` prices STATS, and a unique's point is its effect — an "Equip:" line that
  // changes how the idle loop behaves. Those are invisible here, so a unique whose stat
  // budget is merely competitive rather than dominant would score at or below the
  // incumbent and an unattended hero would never put it on. That is the same silent
  // failure as the drop ladder selling one: protected from destruction, and never worn,
  // which in an idle game is indistinguishable from never having dropped.
  //
  // Only over NON-uniques, so two uniques in one slot still settle it on stats rather
  // than on which happened to drop second.
  //
  // The preference is STRONG BUT NOT ABSOLUTE, and the difference is not cosmetic. An
  // absolute rule was measured and it rots the hero: a unique picked up from the level-8
  // boss occupies its slot for the rest of the run, no ordinary drop can ever displace
  // it, and gear decays against level for eighty levels. Offline parity caught it at
  // 15.5% against a ±10% band — the hero's real throughput sagging away from the rate
  // that had been measured of them.
  //
  // So an ordinary piece takes the slot once it is decisively better. `UNIQUE_POWER_EDGE`
  // is how much better: at 1.5 a unique holds its slot across a comfortable stretch of
  // levelling and then yields to gear that has genuinely outgrown it, which is roughly
  // how a good drop is supposed to age.
  const current = equipment[item.slot]
  if (item.protected !== current?.protected && (item.protected || current)) {
    // Compare what each piece CONTRIBUTES, using the same class-aware scorer as everything
    // else here — `itemPower` is deliberately not used for auto-equip (see the note above
    // `gearScore`: it is class-blind, and a mage's plate is not a warrior's plate).
    const bare = gearScore(
      playerClass, level, { ...equipment, [item.slot]: null }, talentAllocs, racialPassive,
    )
    const withItem = gearScore(
      playerClass, level, { ...equipment, [item.slot]: item }, talentAllocs, racialPassive,
    ) - bare
    const withCurrent = gearScore(
      playerClass, level, { ...equipment, [item.slot]: current ?? null }, talentAllocs, racialPassive,
    ) - bare
    return item.protected
      ? withItem * UNIQUE_POWER_EDGE >= withCurrent
      : withItem >= withCurrent * UNIQUE_POWER_EDGE
  }

  const before = gearScore(playerClass, level, equipment, talentAllocs, racialPassive)
  const swapped = gearScore(
    playerClass, level, { ...equipment, [item.slot]: item }, talentAllocs, racialPassive,
  )
  return swapped > before
}

// ── Attack Resolution ─────────────────────────────────────────────────────────
export interface AttackResult {
  damage: number
  isCrit: boolean
  triggeredDoTs: ActiveDoT[]
  extraHit: boolean
  sealFatePoint: boolean
  /** Warbringer's Flurry: a crit that immediately swings again. */
  flurryHit: boolean
  /** Health drawn back out of the damage dealt (Bloodthirst). Already rounded. */
  lifeDrawn: number
  /** True while the hero is under the Enrage threshold and getting its bonus. */
  enraged: boolean
}

/**
 * Fight context the attack needs but cannot see from stats alone. Optional so callers
 * that do not care (gear scoring, the sim harness) are unaffected; omitting it simply
 * turns off the conditionals that depend on it, rather than defaulting them ON, which
 * would silently overvalue Executioner in every score it touches.
 */
export interface AttackContext {
  /** Target's remaining health, 0–1. Drives Executioner. */
  mobHpFraction?: number
  /** Hero's remaining health, 0–1. Drives Enrage. */
  playerHpFraction?: number
  /** Rampage stacks carried from recent kills. */
  rampageStacks?: number
  /** Arcane charges built against the current target. */
  arcaneCharges?: number
  /** The target is burning — drives the fire trees' crit bonus. */
  targetBurning?: boolean
  /** This is the first strike against a freshly engaged target. */
  isOpener?: boolean
  /** A free guaranteed crit is banked and about to be spent. */
  timedCritReady?: boolean
  /**
   * Source of randomness for this swing's rolls (crit, poison, extra-strike, flurry).
   *
   * Omitted, it falls back to the global `Math.random`, so every existing caller keeps
   * its current behaviour. Supplied, the swing becomes a pure function of the stream —
   * which is what makes a fight replayable from a seed (Track P's ghost duels) and what
   * lets ambient heroes roll without perturbing the player's own stream.
   */
  rng?: Rng
}

/** Below this share of health, Enrage pays out. */
const ENRAGE_THRESHOLD = 1 / 3
/** Below this share of health, a target is Executioner-eligible. */
const EXECUTE_THRESHOLD = 1 / 3
/** Damage each Rampage stack adds, and the ceiling on them. */
export const RAMPAGE_PER_STACK = 0.04
export const RAMPAGE_MAX_STACKS = 5
/**
 * Magnitude of a proc hit, as a share of a normal swing.
 *
 * Extra strike (Turning Steel) and Flurry (Rain of Blows) both say "strike again", and
 * both used to deal a flat fraction that never entered the resolver — no crit, no riders,
 * no situational multipliers. They now RE-RESOLVE a real attack and carry these through
 * `multiplierOverride`, which keeps the tuned magnitude while making the hit a hit.
 *
 * Shared by both loops so the store and `runFight` cannot drift apart on them again.
 */
export const EXTRA_HIT_MULT = 0.7
export const FLURRY_MULT = 0.5

/**
 * Reaping Arc, read straight off the talent's own description: "Every 30s your next 5
 * attacks deal double damage." Every hit spends a charge, not just the primary swing —
 * the text says attacks, and a proc hit is an attack. That is the one place this differs
 * from the free crit next to it, which is swing-only because a proc riding on a swing
 * would otherwise consume the moment that spawned it.
 */
export const REAPING_ARC_SECONDS = 30
export const REAPING_ARC_CHARGES = 5
export const REAPING_ARC_MULT = 2

/** Ceiling on arcane charges. Uncapped, a long fight would end in one swing. */
export const ARCANE_MAX_CHARGES = 8

export function resolvePlayerAttack(
  stats: Stats,
  playerClass: ClassType,
  talentAllocs: Record<string, number>,
  procState: CombatProcState,
  activeBuffs: ActiveBuff[],
  multiplierOverride?: number,
  ctx: AttackContext = {},
): AttackResult {
  const fx = compileTalentEffects(playerClass, talentAllocs)
  // Every outcome roll in this function draws from here. Unseeded callers get the global
  // exactly as before; a seeded caller gets a replayable swing.
  const rng = ctx.rng ?? Math.random

  const critGuaranteeBuff = activeBuffs.find(b => b.type === 'crit_guarantee' && (b.stacks ?? 0) > 0)
  const isCrit = !!(critGuaranteeBuff) || procState.remorselessActive || !!ctx.timedCritReady || (rng() < (
    stats.critChance +
    (procState.mobFrozen ? fx.shatterCritBonus : 0) +
    // Fire's mirror of frost's Shatter: a target already burning is easier to land on.
    (ctx.targetBurning ? fx.burningCritBonus : 0) +
    (procState.winterChillStacks * 0.02)
  ))

  const baseDmg = stats.weaponDps * stats.attackSpeedSeconds
  const nextHitBuff = activeBuffs.find(b => b.type === 'next_hit_multiplier' && (b.stacks ?? 0) > 0)
  const mult = multiplierOverride ?? (nextHitBuff ? nextHitBuff.value : 1)
  const critMult = isCrit ? fx.critDamageMultiplier : 1

  // ── Conditional damage: Executioner, Enrage, Rampage ──
  // All three are multiplicative on the same swing and all three are Warrior-tree
  // conditionals, so a hybrid build gets each one it actually paid for and no more.
  const enraged = fx.enragePct > 0
    && ctx.playerHpFraction !== undefined
    && ctx.playerHpFraction < ENRAGE_THRESHOLD
  const executing = fx.mechanics.executioner
    && ctx.mobHpFraction !== undefined
    && ctx.mobHpFraction < EXECUTE_THRESHOLD
  const opener = !!ctx.isOpener && fx.openerBurstPct > 0
  const situational =
    (enraged ? 1 + fx.enragePct : 1) *
    (executing ? 1 + (fx.mechanics.executioner ?? 0) : 1) *
    (opener ? 1 + fx.openerBurstPct : 1) *
    (1 + Math.min(RAMPAGE_MAX_STACKS, ctx.rampageStacks ?? 0) * RAMPAGE_PER_STACK) *
    (1 + Math.min(ARCANE_MAX_CHARGES, ctx.arcaneCharges ?? 0) * fx.arcaneChargePct)

  const damage = Math.max(1, Math.round(baseDmg * mult * critMult * situational))

  const dotAmpBuff = activeBuffs.find(b => b.type === 'dot_amplify')
  // Two amplifiers stack multiplicatively: the temporary one from an ability, and the
  // permanent one bought in a tree. They are different purchases and neither should
  // quietly make the other worthless.
  const dotAmpFactor = (dotAmpBuff ? dotAmpBuff.value : 1) * fx.dotAmp

  const triggeredDoTs: ActiveDoT[] = []
  if (isCrit && fx.deepWoundsBleedPct > 0) {
    triggeredDoTs.push(makeBleedDoT(stats.weaponDps, fx.deepWoundsBleedPct * dotAmpFactor))
  }
  // Ignite — fire's answer to the bleed. Same trigger (a crit), different curve: fewer,
  // harder ticks, and it is what `burning_crit` reads to decide the target is alight.
  if (isCrit && fx.ignitePct > 0) {
    triggeredDoTs.push(makeIgniteDoT(stats.weaponDps, fx.ignitePct * dotAmpFactor))
  }
  if (fx.vilePoisons && rng() < fx.vilePoisons.procChance) {
    triggeredDoTs.push(makePoisonDoT(fx.vilePoisons.dps * dotAmpFactor))
  }
  if (fx.corruptionDps > 0) {
    triggeredDoTs.push(makeCorruptionDoT(fx.corruptionDps * dotAmpFactor, fx.amplifyCurseEnabled))
  }
  if (fx.curseOfAgonyEnabled) {
    triggeredDoTs.push(makeCurseOfAgonyDoT(stats.weaponDps * dotAmpFactor))
  }

  return {
    damage,
    isCrit,
    triggeredDoTs,
    extraHit: fx.swordSpecEnabled && rng() < fx.swordSpecProcChance,
    sealFatePoint: isCrit && fx.sealFateEnabled,
    flurryHit: isCrit && fx.flurryChance > 0 && rng() < fx.flurryChance,
    lifeDrawn: fx.bloodthirstPct > 0 ? Math.round(damage * fx.bloodthirstPct) : 0,
    enraged,
  }
}

// ── Per-step upkeep ───────────────────────────────────────────────────────────
/**
 * Advance the clocks a hero carries between swings, and pay out the regen that rides on
 * them. Called once per simulation step by whoever is driving the fight.
 *
 * These lived only in `gameStore.tick`, so an ambient hero or a PvP duellist had no frozen
 * timer, no banked free crit and no Second Wind at all — three talents that simply did not
 * exist outside the player's own game. Everything here reads and writes `CombatProcState`
 * and health, which both loops already have, so it is the cheapest group of Track C5's
 * store-only effects to make shared.
 *
 * Deliberately NOT here: Siphon Life and Rampage decay. Both need an accumulator that is
 * neither on `CombatProcState` nor derivable from it, and inventing a home for two more
 * fields is a change to make when the rest of the upkeep follows them, not before.
 */
export function advanceHeroUpkeep(
  procState: CombatProcState,
  fx: Pick<CompiledTalentEffects,
    'timedCritSeconds' | 'secondWindHpPerTick' | 'sweepingStrikesEnabled'>,
  hp: { currentHp: number; maxHp: number },
  dt: number,
  /** Seconds off the Reaping Arc window, from worn uniques. Floored at a 5s cycle so no
   *  amount of haste can make the window permanent. */
  reapingArcHaste = 0,
): { healed: number } {
  // Frozen wears off on its own clock, whoever applied it.
  if (procState.mobFrozen) {
    procState.mobFrozenTimer -= dt
    if (procState.mobFrozenTimer <= 0) {
      procState.mobFrozen = false
      procState.mobFrozenTimer = 0
    }
  }

  // The free crit ticks down whether or not the hero is swinging, so it is a rhythm the
  // fight sits inside rather than a counter that has to be fed.
  if (fx.timedCritSeconds > 0 && procState.timedCritTimer > 0) {
    procState.timedCritTimer = Math.max(0, procState.timedCritTimer - dt)
  }

  // Reaping Arc, on the same rhythm. The talent ships to players reading "Every 30s your
  // next 5 attacks deal double damage" and, until now, did NOTHING: its effect compiled to
  // `sweepingStrikesEnabled` (combat.ts:128) and no code ever read that flag. A talent
  // point spent on it bought a description.
  if (fx.sweepingStrikesEnabled) {
    procState.reapingArcTimer = Math.max(0, procState.reapingArcTimer - dt)
    if (procState.reapingArcTimer <= 0 && procState.reapingArcCharges <= 0) {
      procState.reapingArcCharges = REAPING_ARC_CHARGES
      procState.reapingArcTimer = Math.max(5, REAPING_ARC_SECONDS - reapingArcHaste)
    }
  }

  // Second Wind. Below half health only — which is what stops it being a flat regen aura
  // and makes it a comeback rather than a cushion.
  let healed = 0
  if (fx.secondWindHpPerTick > 0 && hp.currentHp > 0 && hp.currentHp < hp.maxHp * 0.5) {
    const before = hp.currentHp
    hp.currentHp = Math.min(hp.maxHp, hp.currentHp + fx.secondWindHpPerTick * dt)
    healed = hp.currentHp - before
  }
  return { healed }
}

// ── One hero's turn ───────────────────────────────────────────────────────────
/**
 * A single landed blow within a turn: the primary swing, or a proc riding on it.
 *
 * `resolvePlayerAttack` resolves a SWING. It has never described a TURN — the sequence of
 * swing, then Turning Steel, then Flurry, each with its own magnitude, each stopping if the
 * target falls. That sequence lived twice: once in `gameStore.tick` and once in
 * `fight.ts`, and the two disagreed about almost every part of it. The store paid a flat
 * fraction that never entered the resolver, so proc hits could not crit; `fight.ts`
 * re-resolved at full strength, making the same proc worth up to 3x more there.
 */
export interface HeroHit {
  kind: 'swing' | 'extra' | 'flurry'
  damage: number
  crit: boolean
  triggeredDoTs: ActiveDoT[]
  lifeDrawn: number
  sealFatePoint: boolean
  enraged: boolean
}

/** What happened when a caller applied a hit, so the sequence knows whether to continue. */
export interface HitOutcome {
  targetDied: boolean
  /** Retaliation can kill the swinger. Distinct from `targetDied` because the caller has to
   *  credit a winner, and "someone died" is not enough to say who. */
  attackerDied?: boolean
  /** The target's health AFTER the blow — Executioner reads it for the next hit in the
   *  sequence, so a stale value silently misprices every proc that follows. */
  targetHpFraction: number
}

export type TurnOutcome = 'none' | 'target' | 'attacker'

/** Fight context for a whole turn. Mirrors `AttackContext`, minus the per-hit fields the
 *  sequence maintains itself (`mobHpFraction`, `isOpener`). */
export interface HeroTurnContext {
  stats: Stats
  playerClass: ClassType
  talentAllocs: Record<string, number>
  procState: CombatProcState
  activeBuffs: ActiveBuff[]
  targetHpFraction: number
  playerHpFraction: number
  targetBurning: boolean
  isOpener: boolean
  timedCritReady?: boolean
  rampageStacks?: number
  arcaneCharges?: number
  rng?: Rng
}

/**
 * Resolve one hero's turn, handing each landed blow to the caller in order.
 *
 * Inverted rather than returning a list, because the hits are SEQUENTIAL and
 * state-dependent: Executioner reads the target's health, so a proc hit has to be priced
 * against the health left after the swing before it. Computing them up front would misprice
 * every one and would happily swing at a corpse.
 *
 * What the caller keeps: applying damage, storing DoTs, logging, and deciding what a death
 * means. Those genuinely differ — the store owns loot and XP, `fight.ts` owns an event log —
 * and forcing them together is what would turn a shared helper back into a second combat
 * model.
 *
 * What this owns, because it is what drifted: the order, the magnitudes, the rule that
 * procs are consulted ONCE on the primary swing, and stopping the moment either side falls.
 */
export function resolveHeroTurn(
  ctx: HeroTurnContext,
  applyHit: (hit: HeroHit) => HitOutcome,
): TurnOutcome {
  let targetHpFraction = ctx.targetHpFraction

  const strike = (kind: HeroHit['kind']): TurnOutcome => {
    const res = resolvePlayerAttack(
      ctx.stats, ctx.playerClass, ctx.talentAllocs, ctx.procState, ctx.activeBuffs,
      kind === 'extra' ? EXTRA_HIT_MULT : kind === 'flurry' ? FLURRY_MULT : undefined,
      {
        mobHpFraction: targetHpFraction,
        playerHpFraction: ctx.playerHpFraction,
        rampageStacks: ctx.rampageStacks,
        arcaneCharges: ctx.arcaneCharges,
        targetBurning: ctx.targetBurning,
        // Only the primary swing can be an opener. A proc riding on it is not.
        isOpener: kind === 'swing' && ctx.isOpener,
        timedCritReady: kind === 'swing' ? ctx.timedCritReady : false,
        rng: ctx.rng,
      },
    )
    // Reaping Arc is spent HERE rather than inside `resolvePlayerAttack`, so the window
    // covers a turn's every hit exactly once and both loops consume it identically —
    // the divergence stage 2 spent its commits reconciling started as effects applied on
    // one side of this boundary and not the other.
    let damage = res.damage
    if (ctx.procState.reapingArcCharges > 0) {
      ctx.procState.reapingArcCharges--
      damage = Math.round(damage * REAPING_ARC_MULT)
    }

    const outcome = applyHit({
      kind,
      damage,
      crit: res.isCrit,
      triggeredDoTs: res.triggeredDoTs,
      lifeDrawn: res.lifeDrawn,
      sealFatePoint: res.sealFatePoint,
      enraged: res.enraged,
    })
    targetHpFraction = outcome.targetHpFraction
    if (outcome.attackerDied) return 'attacker'
    if (outcome.targetDied) return 'target'

    // Procs are consulted once, on the primary swing. Gated on the KIND rather than a depth
    // counter: the property wanted is "a proc hit cannot proc again", and a number can be
    // passed wrongly by a future caller in a way a kind cannot.
    if (kind === 'swing') {
      if (res.extraHit) { const e = strike('extra'); if (e !== 'none') return e }
      if (res.flurryHit) { const f = strike('flurry'); if (f !== 'none') return f }
    }
    return 'none'
  }

  return strike('swing')
}

export interface MobAttackResult {
  /** Damage that actually lands on the hero, after armour, block and reduction. */
  damage: number
  /** The blow was turned aside entirely (Bulwark). */
  blocked: boolean
  /** Damage sent back at the attacker (Retaliation / Spiked Shield). */
  thorns: number
}

/**
 * Order matters and is deliberate: **block → armour → flat reduction**.
 *
 * Block is all-or-nothing and happens first, so a blocked blow costs the hero nothing
 * and the reduction stack is not "wasted" on it. Armour then applies its usual
 * diminishing curve, and Bulwark's flat reduction takes its share of what survives —
 * last, because a flat share applied BEFORE armour would compound with it and let a
 * deep Bulwark build reach effective immunity, which is why the compiler also caps it
 * at 50%.
 *
 * Thorns is measured against the damage the mob actually DEALT (post-armour, post-
 * reduction), not the damage it swung for. Reflecting the raw swing would make the
 * talent scale with how badly you are geared.
 */
export function resolveMobAttack(
  mob: MobInstance,
  playerArmor: number,
  mobSpeedFactor: number,
  fx?: Pick<CompiledTalentEffects, 'avoidChance' | 'damageReduction' | 'thornsPct'>,
  /** Seeded source for the avoidance roll; defaults to the global as before. */
  rng: Rng = Math.random,
): MobAttackResult {
  const blocked = !!fx && fx.avoidChance > 0 && rng() < fx.avoidChance
  if (blocked) return { damage: 0, blocked: true, thorns: 0 }

  const reductionPct = playerArmor / (playerArmor + 100)
  const baseDmg = mob.damage * mob.attackSpeedSeconds * mobSpeedFactor
  const afterArmor = baseDmg * (1 - reductionPct)
  const damage = Math.max(1, Math.round(afterArmor * (1 - (fx?.damageReduction ?? 0))))

  return {
    damage,
    blocked: false,
    thorns: fx && fx.thornsPct > 0 ? Math.round(damage * fx.thornsPct) : 0,
  }
}

// ── DoT Factories ─────────────────────────────────────────────────────────────
// DoT ids are a monotonic counter rather than `Date.now() + Math.random()`. Two
// reasons, and the boring one is the better one:
//
//  - Uniqueness. The old minter could collide outright — two DoTs applied in the same
//    millisecond with the same 4 random chars is unlikely but not impossible, and a
//    collision means one DoT silently replacing another in a keyed list.
//  - Determinism. Ids surface in a replayed fight log, so a random id would make two
//    identical fights compare as different (Track P) even when every roll matched.
//
// The counter starts from a per-session base so ids minted before a reload can never
// collide with ids minted after one; `resetDotIds` pins it for a headless sim.
let dotSeq = 0
let dotBase = Date.now() % 1_000_000

/** Pin the DoT id sequence so a replayed fight mints byte-identical ids. */
export function resetDotIds(base = 0): void {
  dotBase = base
  dotSeq = 0
}

function makeId() { return `dot_${dotBase}_${++dotSeq}` }

export function makeBleedDoT(weaponDps: number, pct: number): ActiveDoT {
  return { id: makeId(), sourceType: 'bleed', label: 'Rend', icon: '🩸', color: '#cc2200',
    tickDamage: Math.max(1, Math.round(weaponDps * pct * 2)),
    totalTicks: 6, ticksRemaining: 6, tickIntervalSeconds: 2, tickAccum: 0 }
}

export function makeIgniteDoT(weaponDps: number, pct: number): ActiveDoT {
  return { id: makeId(), sourceType: 'burn', label: 'Ignite', icon: '🔥', color: '#ff7722',
    tickDamage: Math.max(1, Math.round(weaponDps * pct * 3)),
    totalTicks: 4, ticksRemaining: 4, tickIntervalSeconds: 2, tickAccum: 0 }
}

export function makePoisonDoT(dps: number): ActiveDoT {
  return { id: makeId(), sourceType: 'poison', label: 'Poison', icon: '☠', color: '#44cc00',
    tickDamage: Math.max(1, Math.round(dps * 2)),
    totalTicks: 5, ticksRemaining: 5, tickIntervalSeconds: 2, tickAccum: 0 }
}

export function makeCorruptionDoT(dps: number, amplified: boolean): ActiveDoT {
  return { id: makeId(), sourceType: 'corruption', label: 'Rot', icon: '💜', color: '#9b59d0',
    tickDamage: Math.max(1, Math.round(dps * 3 * (amplified ? 1.5 : 1))),
    totalTicks: 6, ticksRemaining: 6, tickIntervalSeconds: 3, tickAccum: 0 }
}

export function makeCurseOfAgonyDoT(weaponDps: number): ActiveDoT {
  return { id: makeId(), sourceType: 'curse', label: 'Agony', icon: '🌀', color: '#aa00cc',
    tickDamage: Math.max(1, Math.round(weaponDps * 0.4)),
    totalTicks: 8, ticksRemaining: 8, tickIntervalSeconds: 3, tickAccum: 0 }
}

export function makeShadowBoltHit(weaponDps: number, attackSpeed: number, mult: number): number {
  return Math.round(weaponDps * attackSpeed * mult)
}

// ── Ability Buffs ─────────────────────────────────────────────────────────────
export function makeAbilityBuff(
  abilityId: string,
  effect: AbilityEffectDef,
  abilityName: string,
  abilityIcon: string,
): ActiveBuff {
  const colorMap: Record<string, string> = {
    armor_buff: '#6699ff', lifesteal_buff: '#ff4444', speed_buff: '#ffcc00',
    crit_guarantee: '#ffaa00', crit_buff_pct: '#ffcc00', hot: '#44ff88',
    dot_amplify: '#aa00cc', next_hit_multiplier: '#ffffff', splash: '#ff9944',
  }
  return {
    id: `buff_${abilityId}_${Date.now()}`,
    label: abilityName,
    icon: abilityIcon,
    color: colorMap[effect.type] ?? '#ffd700',
    type: effect.type,
    value: effect.value,
    stacks: effect.stacks,
    durationRemaining: effect.durationSeconds ?? 10,
  }
}
