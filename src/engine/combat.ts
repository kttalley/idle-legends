import type {
  Stats, MobInstance, Item, Slot, ClassType,
  CompiledTalentEffects, StatBonuses, TalentMechanicType, AbilityMod,
  ActiveDoT, ActiveBuff, CombatProcState,
  AbilityEffectDef,
} from '../data/types'
import { CLASS_DEFINITIONS } from '../data/classes'
import { allClassTalents } from '../data/specs'
import { HP_PER_STAMINA, CRIT_MULTIPLIER, AGILITY_CRIT_DIVISOR } from '../data/constants'

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

  // `two_handed_spec` is a share of the class's BASE weapon damage, not of the hero's
  // current weapon — otherwise it would scale with gear and quietly become the best
  // talent in the game at high item level.
  const damageMultBonus = m('two_handed_spec')
  if (damageMultBonus > 0) {
    addStat('weaponDps', CLASS_DEFINITIONS[playerClass].baseStats.weaponDps * damageMultBonus)
  }
  // Lifesteal talents are still expressed as a damage bonus rather than real leeching;
  // that was true before this rewrite and is preserved verbatim rather than silently
  // changed under cover of a refactor.
  if (m('lifesteal') > 0) addStat('weaponDps', m('lifesteal') * 8)

  const poisonDps = m('poison_potency')

  return {
    mechanics,
    abilityMods,
    statBonuses,
    critDamageMultiplier: CRIT_MULTIPLIER + m('impale') + m('lethality') + m('ice_shards'),
    mobAttackSpeedFactor: Math.max(0.4, 1.0 - m('mortal_strike') - m('curse_exhaustion')),
    mobArmorReduction: m('expose_armor'),
    deepWoundsBleedPct: m('deep_wounds'),
    vilePoisons: poisonDps > 0
      ? { procChance: Math.min(0.8, 0.15 + m('poison_chance')), dps: poisonDps }
      : null,
    corruptionDps: m('corruption'),
    curseOfAgonyEnabled: m('curse_of_agony') > 0,
    siphonLifeHpPerTick: m('siphon_life'),
    nightfallProcChance: m('nightfall'),
    amplifyCurseEnabled: m('amplify_curse') > 0,
    frostbiteChance: m('frostbite'),
    shatterCritBonus: m('shatter'),
    winterChillEnabled: m('winters_chill') > 0,
    iceBlockEnabled: m('ice_block') > 0,
    iceBarrierAbsorb: m('ice_barrier'),
    sealFateEnabled: m('seal_fate') > 0,
    sealFateRanks: ranksOf['seal_fate'] ?? 0,
    remorselessEnabled: m('remorseless_attacks') > 0,
    sweepingStrikesEnabled: m('sweeping_strikes') > 0,
    swordSpecEnabled: m('sword_spec') > 0,
    swordSpecProcChance: m('sword_spec'),
    // ── Bulwark ──
    // Capped at half: an idle hero who takes literally no damage never dies, and a zone
    // that cannot kill you is a zone with no reason to leave it.
    damageReduction: Math.min(0.5, m('damage_reduction')),
    blockChance: Math.min(0.5, m('block_chance')),
    armorScaling: m('armor_scaling'),
    secondWindHpPerTick: m('second_wind'),
    thornsPct: m('thorns'),
    lastStandPct: m('last_stand'),
    // ── Warbringer ──
    attackHasteFactor: Math.max(0.5, 1 - m('attack_haste')),
    flurryChance: Math.min(0.6, m('flurry')),
    enragePct: m('enrage'),
    bloodthirstPct: m('bloodthirst'),
    rampageChance: m('rampage') > 0 ? 1 : 0,
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
    weaponDps: Math.max(1, wDps + primaryStat * 0.1),
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
export function isGearUpgrade(
  item: Item,
  playerClass: ClassType,
  level: number,
  equipment: Record<Slot, Item | null>,
  talentAllocs: Record<string, number>,
  racialPassive: StatBonuses = {},
): boolean {
  const current = gearScore(playerClass, level, equipment, talentAllocs, racialPassive)
  const swapped = gearScore(
    playerClass, level, { ...equipment, [item.slot]: item }, talentAllocs, racialPassive,
  )
  return swapped > current
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
}

/** Below this share of health, Enrage pays out. */
const ENRAGE_THRESHOLD = 1 / 3
/** Below this share of health, a target is Executioner-eligible. */
const EXECUTE_THRESHOLD = 1 / 3
/** Damage each Rampage stack adds, and the ceiling on them. */
export const RAMPAGE_PER_STACK = 0.04
export const RAMPAGE_MAX_STACKS = 5

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

  const critGuaranteeBuff = activeBuffs.find(b => b.type === 'crit_guarantee' && (b.stacks ?? 0) > 0)
  const isCrit = !!(critGuaranteeBuff) || procState.remorselessActive || (Math.random() < (
    stats.critChance +
    (procState.mobFrozen ? fx.shatterCritBonus : 0) +
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
  const situational =
    (enraged ? 1 + fx.enragePct : 1) *
    (executing ? 1 + (fx.mechanics.executioner ?? 0) : 1) *
    (1 + Math.min(RAMPAGE_MAX_STACKS, ctx.rampageStacks ?? 0) * RAMPAGE_PER_STACK)

  const damage = Math.max(1, Math.round(baseDmg * mult * critMult * situational))

  const dotAmpBuff = activeBuffs.find(b => b.type === 'dot_amplify')
  const dotAmpFactor = dotAmpBuff ? dotAmpBuff.value : 1

  const triggeredDoTs: ActiveDoT[] = []
  if (isCrit && fx.deepWoundsBleedPct > 0) {
    triggeredDoTs.push(makeBleedDoT(stats.weaponDps, fx.deepWoundsBleedPct * dotAmpFactor))
  }
  if (fx.vilePoisons && Math.random() < fx.vilePoisons.procChance) {
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
    extraHit: fx.swordSpecEnabled && Math.random() < fx.swordSpecProcChance,
    sealFatePoint: isCrit && fx.sealFateEnabled,
    flurryHit: isCrit && fx.flurryChance > 0 && Math.random() < fx.flurryChance,
    lifeDrawn: fx.bloodthirstPct > 0 ? Math.round(damage * fx.bloodthirstPct) : 0,
    enraged,
  }
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
  fx?: Pick<CompiledTalentEffects, 'blockChance' | 'damageReduction' | 'thornsPct'>,
): MobAttackResult {
  const blocked = !!fx && fx.blockChance > 0 && Math.random() < fx.blockChance
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
function makeId() { return `dot_${Date.now()}_${Math.random().toString(36).slice(2,6)}` }

export function makeBleedDoT(weaponDps: number, pct: number): ActiveDoT {
  return { id: makeId(), sourceType: 'bleed', label: 'Rend', icon: '🩸', color: '#cc2200',
    tickDamage: Math.max(1, Math.round(weaponDps * pct * 2)),
    totalTicks: 6, ticksRemaining: 6, tickIntervalSeconds: 2, tickAccum: 0 }
}

export function makePoisonDoT(dps: number): ActiveDoT {
  return { id: makeId(), sourceType: 'poison', label: 'Poison', icon: '☠', color: '#44cc00',
    tickDamage: Math.max(1, Math.round(dps * 2)),
    totalTicks: 5, ticksRemaining: 5, tickIntervalSeconds: 2, tickAccum: 0 }
}

export function makeCorruptionDoT(dps: number, amplified: boolean): ActiveDoT {
  return { id: makeId(), sourceType: 'corruption', label: 'Corruption', icon: '💜', color: '#9b59d0',
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
    dot_amplify: '#aa00cc', next_hit_multiplier: '#ffffff',
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
