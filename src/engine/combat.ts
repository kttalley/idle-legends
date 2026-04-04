import type {
  Stats, MobInstance, Item, Slot, ClassType,
  CompiledTalentEffects, StatBonuses,
  ActiveDoT, ActiveBuff, CombatProcState,
  AbilityEffectDef,
} from '../data/types'
import { CLASS_DEFINITIONS } from '../data/classes'
import { HP_PER_STAMINA, CRIT_MULTIPLIER, AGILITY_CRIT_DIVISOR } from '../data/constants'

// ── Talent Effect Compilation ─────────────────────────────────────────────────
export function compileTalentEffects(
  playerClass: ClassType,
  talentAllocs: Record<string, number>,
): CompiledTalentEffects {
  const classDef = CLASS_DEFINITIONS[playerClass]
  const out: CompiledTalentEffects = {
    statBonuses: {},
    critDamageMultiplier: CRIT_MULTIPLIER,
    mobAttackSpeedFactor: 1.0,
    mobArmorReduction: 0,
    deepWoundsBleedPct: 0,
    vilePoisons: null,
    corruptionDps: 0,
    curseOfAgonyEnabled: false,
    siphonLifeHpPerTick: 0,
    nightfallProcChance: 0,
    amplifyCurseEnabled: false,
    frostbiteChance: 0,
    shatterCritBonus: 0,
    winterChillEnabled: false,
    iceBlockEnabled: false,
    iceBarrierAbsorb: 0,
    sealFateEnabled: false,
    sealFateRanks: 0,
    remorselessEnabled: false,
    sweepingStrikesEnabled: false,
    swordSpecEnabled: false,
    swordSpecProcChance: 0,
  }

  let damageMultBonus = 0
  let lethality = 0
  let iceShards = 0
  let mobAtkSpdReduction = 0
  let poisonBaseDps = 0
  let poisonProcChance = 0.15

  const addStat = (stat: keyof StatBonuses, val: number) => {
    out.statBonuses[stat] = ((out.statBonuses[stat] ?? 0) as number) + val
  }

  for (const talent of classDef.talents) {
    const ranks = talentAllocs[talent.id] ?? 0
    if (ranks === 0) continue

    for (const effect of talent.effects) {
      const total = effect.valuePerRank * ranks

      if (effect.type === 'stat' && effect.stat) {
        addStat(effect.stat, total)
      } else if (effect.type === 'mechanic' && effect.mechanic) {
        switch (effect.mechanic) {
          case 'deep_wounds':       out.deepWoundsBleedPct += total; break
          case 'two_handed_spec':   damageMultBonus += total; break
          case 'impale':            lethality += total; break
          case 'sweeping_strikes':  out.sweepingStrikesEnabled = true; break
          case 'sword_spec':
            out.swordSpecEnabled = true
            out.swordSpecProcChance += total
            break
          case 'mortal_strike':     mobAtkSpdReduction += total; break
          case 'frostbite':         if (total > 0) out.frostbiteChance += total; break
          case 'ice_shards':        iceShards += total; break
          case 'shatter':           out.shatterCritBonus += total; break
          case 'winters_chill':     out.winterChillEnabled = true; break
          case 'ice_block':         out.iceBlockEnabled = true; break
          case 'ice_barrier':       out.iceBarrierAbsorb += total; break
          case 'cold_snap':         break
          case 'lethality':
            if (effect.valuePerRank < 1) lethality += total
            else out.mobArmorReduction += total
            break
          case 'vile_poisons':
            if (effect.valuePerRank >= 1) poisonBaseDps += total
            else poisonProcChance += total
            break
          case 'cold_blood':        break
          case 'seal_fate':
            out.sealFateEnabled = true
            out.sealFateRanks = Math.max(out.sealFateRanks, ranks)
            break
          case 'remorseless_attacks':
            out.remorselessEnabled = true
            break
          case 'corruption':        out.corruptionDps += total; break
          case 'curse_of_agony':    out.curseOfAgonyEnabled = true; break
          case 'nightfall':         out.nightfallProcChance += total; break
          case 'siphon_life':       out.siphonLifeHpPerTick += total; break
          case 'amplify_curse':
            if (total === 1) out.amplifyCurseEnabled = true
            else mobAtkSpdReduction += total
            break
          case 'lifesteal':
            addStat('weaponDps', total * 8)
            break
        }
      }
    }
  }

  if (damageMultBonus > 0) {
    addStat('weaponDps', CLASS_DEFINITIONS[playerClass].baseStats.weaponDps * damageMultBonus)
  }
  out.critDamageMultiplier = CRIT_MULTIPLIER + lethality + iceShards
  out.mobAttackSpeedFactor = Math.max(0.4, 1.0 - mobAtkSpdReduction)
  if (poisonBaseDps > 0) {
    out.vilePoisons = { procChance: Math.min(0.8, poisonProcChance), dps: poisonBaseDps }
  }

  return out
}

// ── Stat Compilation ──────────────────────────────────────────────────────────
export function compileStats(
  playerClass: ClassType,
  level: number,
  equipment: Record<Slot, Item | null>,
  talentAllocs: Record<string, number>,
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
  const strength  = base.strength  + levelBonus + (fx.statBonuses.strength  ?? 0) + (eqBonuses.strength  ?? 0)
  const intellect = base.intellect + levelBonus + (fx.statBonuses.intellect ?? 0) + (eqBonuses.intellect ?? 0)
  const agility   = base.agility   + levelBonus + (fx.statBonuses.agility   ?? 0) + (eqBonuses.agility   ?? 0)
  const stamina   = base.stamina   + levelBonus + (fx.statBonuses.stamina   ?? 0) + (eqBonuses.stamina   ?? 0)
  const armor     = Math.max(0, base.armor + (fx.statBonuses.armor ?? 0) + (eqBonuses.armor ?? 0))
  const wDps      = base.weaponDps + (fx.statBonuses.weaponDps ?? 0) + (eqBonuses.weaponDps ?? 0)

  const attackSpeedSeconds = Math.max(0.5,
    base.attackSpeedSeconds +
    (fx.statBonuses.attackSpeedSeconds ?? 0) +
    (eqBonuses.attackSpeedSeconds ?? 0)
  )

  const primaryStat = playerClass === 'warrior' ? strength
    : (playerClass === 'mage' || playerClass === 'warlock') ? intellect
    : agility

  const critChance = Math.min(0.75,
    agility / AGILITY_CRIT_DIVISOR +
    (fx.statBonuses.critChance ?? 0) +
    (eqBonuses.critChance ?? 0)
  )
  const goldFindBonus = Math.max(base.goldFindBonus, eqBonuses.goldFindBonus ?? 1)
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

// ── Attack Resolution ─────────────────────────────────────────────────────────
export interface AttackResult {
  damage: number
  isCrit: boolean
  triggeredDoTs: ActiveDoT[]
  extraHit: boolean
  sealFatePoint: boolean
}

export function resolvePlayerAttack(
  stats: Stats,
  playerClass: ClassType,
  talentAllocs: Record<string, number>,
  procState: CombatProcState,
  activeBuffs: ActiveBuff[],
  multiplierOverride?: number,
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
  const damage = Math.max(1, Math.round(baseDmg * mult * critMult))

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
  }
}

export function resolveMobAttack(mob: MobInstance, playerArmor: number, mobSpeedFactor: number): number {
  const reductionPct = playerArmor / (playerArmor + 100)
  const baseDmg = mob.damage * mob.attackSpeedSeconds * mobSpeedFactor
  return Math.max(1, Math.round(baseDmg * (1 - reductionPct)))
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
