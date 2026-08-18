// ── Enums / Union Types ───────────────────────────────────────────────────────

export type ClassType = 'warrior' | 'mage' | 'rogue' | 'warlock'

export type RaceType =
  | 'human' | 'dwarf' | 'elf'          // Lastlight Concord
  | 'orc'   | 'troll' | 'goblin'       // Ashmarch
  | 'gnome' | 'tauren'                  // Neutral

export type FactionType = 'alliance' | 'horde' | 'neutral'

export type ZoneId =
  | 'sunhollow_meadows'
  | 'dustwind_plains'
  | 'grimshade_forest'
  | 'thornvale_jungle'
  | 'ashfire_peaks'
  | 'shattered_crossing'
  | 'the_bloodfields'
  | 'ironcrag_badlands'
  | 'venom_hollows'
  | 'warsong_mesa'
  | 'cinderfall_wastes'
  | 'the_maw_eternal'

export type MobId = string
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
export type Slot = 'weapon' | 'helm' | 'chest' | 'legs' | 'boots' | 'trinket'
export type GameMode = 'combat' | 'traveling' | 'gathering' | 'crafting' | 'in_town'
export type MaterialId = string
export type RecipeId = string
/** Material / crafted-good quality. Maps 1:1 onto `Rarity` (and therefore onto a
 *  `rarity/*` + `gear/t*` palette id) — see engine/crafting.ts. */
export type QualityTier = 'coarse' | 'fine' | 'superior' | 'masterwork' | 'flawless'
export type TownId = string
// `repair` was declared here for the whole life of the project with no durability field
// anywhere behind it — a service that could never do anything. Dropped by owner decision
// rather than built out: durability is upkeep clicking, which is the opposite of what an
// idle game is for. See .planning/economy-and-towns-plan.md §4.1.
export type TownServiceType = 'rest' | 'vendor'

export interface TownConfig {
  id: TownId
  name: string
  faction: FactionType | 'neutral'
  type: 'friendly' | 'neutral' | 'hostile'
  services: TownServiceType[]
  linkedZone: ZoneId
  description: string
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface Stats {
  maxHp: number
  currentHp: number
  strength: number
  intellect: number
  agility: number
  stamina: number
  armor: number
  weaponDps: number
  attackSpeedSeconds: number
  critChance: number
  goldFindBonus: number
}

export interface StatBonuses {
  strength?: number
  intellect?: number
  agility?: number
  stamina?: number
  armor?: number
  weaponDps?: number
  critChance?: number
  goldFindBonus?: number
  attackSpeedSeconds?: number
}

// ── Talent System ─────────────────────────────────────────────────────────────
/**
 * Every distinct thing a talent can do to combat, as a flat vocabulary of keys.
 *
 * These are SUMMED (valuePerRank × ranks) into `CompiledTalentEffects.mechanics` and
 * only then derived into the named fields combat reads. One key means exactly one
 * thing: three of these used to be overloaded on the magnitude of their own value
 * (`lethality` meant crit-damage below 1 and armour-shred above it), which made the
 * data unreadable and the compiler's job a guessing game. Adding a tree should be
 * adding keys, never adding branches.
 */
export type TalentMechanicType =
  // ── Damage ──
  | 'damage_amp'      // all damage +X%
  | 'crit_damage'     // added to the crit multiplier
  | 'extra_strike'    // chance any swing strikes again
  | 'flurry'          // chance a CRIT strikes again
  | 'executioner'     // bonus against a target below a third health
  | 'enrage'          // bonus while YOU are below a third health
  | 'rampage'         // stacking bonus per kill in a streak
  | 'opener_burst'    // bonus on the first strike against a new target
  | 'timed_crit'      // periodic guaranteed critical strike
  | 'sweeping_strikes'
  | 'seal_fate'       // crits build combo points toward a finisher
  | 'remorseless_attacks'
  | 'arcane_charge'   // stacking damage that builds as you keep swinging
  | 'minion_dps'      // a summoned thing attacking alongside you
  | 'echo_chance'     // chance an ACTIVE ability resolves twice
  // ── Speed ──
  | 'attack_haste'
  | 'enemy_slow'
  // ── Defence ──
  | 'damage_reduction'
  | 'avoid_chance'    // blocked, parried or sidestepped — the blow simply misses
  | 'armor_scaling'
  | 'absorb_shield'   // a shield granted at the start of each fight
  | 'second_wind'
  | 'thorns'
  | 'last_stand'
  | 'death_ward'      // once per fight, survive at a sliver instead of dying
  | 'lifesteal'
  | 'bloodthirst'
  // ── Enemy state ──
  | 'armor_shred'
  | 'freeze_chance'
  | 'frozen_crit'     // crit bonus against a frozen target
  | 'burning_crit'    // crit bonus against a burning target
  | 'chill_stacks'
  // ── Damage over time ──
  | 'bleed_on_crit'
  | 'ignite'          // crits leave a burn
  | 'dot_amp'         // every DoT you own ticks harder
  | 'poison_potency' | 'poison_chance'
  | 'shadow_dot'     | 'curse_of_agony'
  | 'siphon_life'    | 'nightfall' | 'amplify_curse'

/** How a talent reshapes one of the three action-bar abilities. */
export type AbilityModKind = 'damage' | 'cooldown' | 'castTime' | 'rider'

export type TalentEffectDef =
  | { type: 'stat';     stat: keyof StatBonuses; valuePerRank: number }
  | { type: 'mechanic'; mechanic: TalentMechanicType; valuePerRank: number }
  /**
   * Reaches into the action bar. This is what makes three specs who press the SAME
   * three buttons fight three different fights — see `AbilityMod`.
   *
   * `valuePerRank` is a FRACTION for damage/cooldown/castTime (0.1 = +10% damage, or
   * -10% cooldown — see `AbilityMod` for the sign convention) and is ignored for
   * 'rider', which instead attaches `rider` once per rank.
   */
  | {
      type: 'ability'
      ability: string
      mod: AbilityModKind
      valuePerRank: number
      rider?: AbilityEffectDef
      /** Player-facing line shown under the ability's own description. */
      note?: string
    }

export interface TalentNodeDef {
  id: string
  name: string
  description: string   // use {n} as value placeholder
  icon: string          // emoji placeholder
  row: number           // 1–7
  col: number           // 1–4
  maxRanks: number
  /** Points that must be spent IN THIS SPEC's tree before the node opens. Canonically
   *  `(row - 1) * 5`. Per-tree, not global — that distinction is the whole difference
   *  between three specialisations and one tree wearing three hats. */
  requiresPoints: number
  requires?: string     // talent ID that must be maxed first
  effects: TalentEffectDef[]
}

/**
 * One specialisation: a self-contained tree with its own identity and its own point
 * pool for gating purposes. A class has exactly three, and points may be spent freely
 * across all of them — commitment is enforced by `requiresPoints` being counted
 * per-tree, not by forbidding the spend.
 */
export interface SpecDefinition {
  id: string
  classId: ClassType
  name: string
  /** One line under the crest. Says what fighting as this spec feels like. */
  tagline: string
  description: string
  /** Crest drawn from the shared talent icon sheet (render/talentIcons.ts). */
  icon: string
  /** Hex accent driving this column's whole visual identity — meters, node glow,
   *  connectors, the crest ring. Three trees that look alike are one tree. */
  accent: string
  talents: TalentNodeDef[]
  /** Extra connector lines beyond those implied by `requires`. */
  connectors?: [string, string][]
}

/**
 * Talent-driven changes to one action-bar ability, resolved at cast time.
 *
 * Sign convention: `damageMult` and `castTimeMult` multiply directly (1.2 = +20%
 * damage), while `cooldownMult` is ALSO a direct multiplier (0.8 = 20% faster) — a
 * talent that reads "reduces cooldown by 10%" contributes 0.1 and the compiler turns
 * it into the multiplier, so tree data never has to think in reciprocals.
 */
export interface AbilityMod {
  damageMult: number
  cooldownMult: number
  castTimeMult: number
  extraEffects: AbilityEffectDef[]
  /** Lines the ability's inspector shows beneath its base description. */
  notes: string[]
}

export interface CompiledTalentEffects {
  /** Raw summed mechanic totals. The single storage; everything below is derived
   *  from it so a new tree is data, not an engine change. */
  mechanics: Partial<Record<TalentMechanicType, number>>
  /** abilityId → the talent reshaping of that ability. */
  abilityMods: Record<string, AbilityMod>
  statBonuses: StatBonuses
  /** True multiplier on final weapon damage (1.15 = +15%). */
  damageAmp: number
  critDamageMultiplier: number
  mobAttackSpeedFactor: number
  mobArmorReduction: number
  deepWoundsBleedPct: number
  vilePoisons: { procChance: number; dps: number } | null
  corruptionDps: number
  curseOfAgonyEnabled: boolean
  siphonLifeHpPerTick: number
  nightfallProcChance: number
  amplifyCurseEnabled: boolean
  frostbiteChance: number
  shatterCritBonus: number
  winterChillEnabled: boolean
  iceBlockEnabled: boolean
  iceBarrierAbsorb: number
  sealFateEnabled: boolean
  sealFateRanks: number
  remorselessEnabled: boolean
  sweepingStrikesEnabled: boolean
  swordSpecEnabled: boolean
  swordSpecProcChance: number
  // ── Defence ──
  /** Flat share of incoming damage absorbed, 0–0.5. */
  damageReduction: number
  /** Chance a blow is turned aside entirely — blocked, parried or sidestepped. */
  avoidChance: number
  /** Bonus armour as a fraction of base armour. */
  armorScaling: number
  /** HP regained per second while below half health. */
  secondWindHpPerTick: number
  /** Share of damage taken reflected at the attacker. */
  thornsPct: number
  /** Survive a killing blow once per fight at this share of max HP. 0 = off. */
  lastStandPct: number
  // ── Offence ──
  /** Attack interval multiplier from haste talents (0.85 = 15% faster). */
  attackHasteFactor: number
  /** Chance a crit immediately strikes again. */
  flurryChance: number
  /** Damage bonus while below the enrage HP threshold. */
  enragePct: number
  /** Share of damage dealt returned as health. */
  bloodthirstPct: number
  /** Whether kills build stacking damage. */
  rampageChance: number
  /** Bonus on the first strike against a freshly engaged target. */
  openerBurstPct: number
  /** Seconds between free guaranteed crits. 0 = off. */
  timedCritSeconds: number
  /** Damage added per arcane charge, and the ceiling on them. */
  arcaneChargePct: number
  /** Damage per second contributed by a summoned minion. */
  minionDps: number
  /** Chance an active ability resolves a second time. */
  echoChance: number
  // ── Enemy state / DoTs ──
  /** Crit bonus against a burning target. */
  burningCritBonus: number
  /** Burn damage per second applied by crits. 0 = off. */
  ignitePct: number
  /** Multiplier on every DoT tick the hero owns. */
  dotAmp: number
}

// ── Active Abilities (Skill Bar) ──────────────────────────────────────────────
export type AbilityEffectType =
  | 'next_hit_multiplier' | 'armor_buff'     | 'lifesteal_buff'
  | 'speed_buff'          | 'freeze_mob'     | 'crit_guarantee'
  | 'crit_buff_pct'       | 'heal'           | 'hot'
  | 'dot_amplify'         | 'shadow_bolt'
  /** Your next attack also strikes everything standing near you, for `value` of the
   *  damage it dealt to the target. Carried as a buff and spent by the swing that uses
   *  it, exactly like `next_hit_multiplier` — the capstones that grant it describe an
   *  empowered BLOW ("Battle Cry becomes a whirlwind"), not an instant nuke. */
  | 'splash'

export interface ActiveAbilityDef {
  id: string
  name: string
  description: string
  icon: string
  cooldownSeconds: number
  /** Seconds of channel before the effect fires. Omit/0 = instant. Casting can be
   *  interrupted (death/target-loss) and pushed back by taking damage. */
  castTimeSeconds?: number
  classes: ClassType[]
  slot: 1 | 2 | 3
  /**
   * Level the slot opens at. Locked slots still RENDER on the bar — greyed and
   * captioned — so the action bar keeps its shape from level 1 and reads as something
   * growing rather than something missing.
   */
  unlockLevel: number
  effects: AbilityEffectDef[]
}

export interface AbilityEffectDef {
  type: AbilityEffectType
  value: number
  durationSeconds?: number
  stacks?: number
}

// ── DoT & Buff State ──────────────────────────────────────────────────────────
export interface ActiveDoT {
  id: string
  sourceType: 'bleed' | 'poison' | 'corruption' | 'curse' | 'shadow' | 'burn'
  label: string
  icon: string
  color: string
  tickDamage: number
  totalTicks: number
  ticksRemaining: number
  tickIntervalSeconds: number
  tickAccum: number
}

export interface ActiveBuff {
  id: string
  label: string
  icon: string
  color: string
  type: AbilityEffectType
  value: number
  stacks?: number
  durationRemaining: number
}

// Player spell-cast in progress. Timed abilities (castTimeSeconds > 0) set this while
// channelling; the tick advances `remaining` and fires the effect at 0. Taking damage
// pushes `remaining` back (capped); death/target-loss clears it (interrupt).
export interface CastState {
  abilityId: string
  name: string
  icon: string
  total: number      // total cast time (seconds)
  remaining: number  // seconds left until the effect fires
  pushback: number   // accumulated pushback seconds this cast (capped)
}

/**
 * Fields below that describe THE ENEMY rather than the hero. Cleared whenever the engaged
 * target changes, not only when one dies — see `clearTargetProcState`.
 *
 * This list is the seed of the per-target map N-sided combat will need (PLAN.md C5 stage
 * 6). It is deliberately still a single set rather than a `Record<mobId, …>`: only one
 * enemy is engaged at a time today, so a map would be a dictionary with one entry that
 * nothing exercises — structure with no coverage, which is the same trap the golden log
 * was in before stage 0. It becomes a map when a second target exists to put in it.
 */
export const TARGET_SCOPED_PROC_FIELDS = [
  'mobFrozen', 'mobFrozenTimer', 'winterChillStacks', 'comboPoints', 'arcaneCharges',
] as const

export interface CombatProcState {
  /**
   * Which mob the target-scoped fields above currently describe.
   *
   * Without it those fields were cleared only on a KILL, so switching targets carried them
   * to the new enemy: arcane charges and Winter Chill stacks built on one mob paid out on
   * another, and — worst — `mobFrozen` carried, so a freshly-tapped enemy was treated as
   * frozen and could not swing back at all, since the mob-attack branch is gated on it.
   */
  procTargetId: string | null
  winterChillStacks: number
  comboPoints: number
  remorselessActive: boolean
  iceBlockUsed: boolean
  /** Bulwark's The Last Yard fires once per encounter, like Glacial Tomb above it. */
  lastStandUsed: boolean
  /** Warbringer's Rampage: stacks carried from recent kills, decaying out of combat. */
  rampageStacks: number
  /** Arcane charges built by swinging, spent on nothing — they simply accumulate
   *  damage while the hero keeps the pressure up, and reset when the target dies. */
  arcaneCharges: number
  /** Counts down to the next free guaranteed crit; 0 means the next swing is one. */
  timedCritTimer: number
  /** Reaping Arc: seconds until the next window opens. Same rhythm as `timedCritTimer` —
   *  it ticks whether or not the hero is swinging, so it is something the fight sits
   *  inside rather than a counter that has to be fed. */
  reapingArcTimer: number
  /** Attacks left in the open Reaping Arc window, each at double damage. */
  reapingArcCharges: number
  /** The opener against THIS target has been spent. Reset on every new engagement. */
  openerUsed: boolean
  mobFrozen: boolean
  mobFrozenTimer: number
  iceBarrierHp: number
  /**
   * Track P0 — the store's combat proc stream.
   *
   * The store's combat path was entirely unseeded, so Nightfall, Creeping Freeze and Echo
   * rolled off bare `Math.random()`. Carrying the generator state HERE rather than in a
   * module-level variable means it persists with the save for free and needs no
   * fast-forward on load: a given character replays its procs identically across reloads.
   * 0 = not yet seeded; the first draw seeds it from the world.
   */
  procRngState: number
}

// ── Items ─────────────────────────────────────────────────────────────────────
export interface Item {
  id: string
  name: string
  slot: Slot
  rarity: Rarity
  level: number
  statBonuses: StatBonuses
  vendorValue: number
  spriteKey?: string
  /**
   * Never sell this, and never scrap it — whatever the numbers say.
   *
   * The drop ladder disposes by `itemPower`, which is the right rule for gear and the
   * wrong one for a unique, whose value is its identity rather than its stat budget. A
   * low-power unique otherwise looks exactly like vendor trash to BOTH disposal paths:
   * the factor sells it, or a full bag scraps it, and the player never learns the drop
   * happened. That failure is silent and permanent, so the flag exists before the first
   * unique does. Optional, so every save and every existing item reads as unprotected.
   */
  protected?: boolean
  /** Set on an authored unique — the join to `UNIQUE_BY_ID`, and what `compileUniques`
   *  reads to find the "Equip:" effect. Absent on every procedural drop. */
  uniqueId?: string
}

// ── The merchant contract ─────────────────────────────────────────────────────
/**
 * A retainer who buys your junk at full price the moment it drops, so it never occupies
 * a bag slot and never falls to salvage. Bought once, then billed for field time.
 */
export interface MerchantContract {
  /** Drops STRICTLY BELOW this rarity are sold on sight. `common` sells nothing, which
   *  is how the player switches the arrangement off without cancelling it. */
  threshold: Rarity
  /** Seconds of field time until the next upkeep charge. */
  upkeepTimer: number
  /** Gross gold the factor has taken in since the last bill — the base their cut is
   *  worked out from, reset every time they are paid. */
  soldSinceBill: number
  /**
   * Upkeep went unpaid. A lapsed contract does NOTHING — drops fall back to the bag and
   * to salvage exactly as if it were never bought — and it costs nothing while lapsed,
   * so it can never drive a hero's gold down. It resumes on its own once gold recovers.
   */
  lapsed: boolean
}

// ── Mobs ─────────────────────────────────────────────────────────────────────
export interface MobTemplate {
  id: MobId
  name: string
  hp: number
  damage: number
  xpReward: number
  goldMin: number
  goldMax: number
  lootTableIds: string[]
  spriteKey: string
  attackSpeedSeconds: number
}

/**
 * A party member, as combat sees them.
 *
 * Built from the `ChatSpeaker` the party module already stores, which carries the hero's
 * real class, level and `talentAllocs` — so an ally's numbers come from the same
 * `compileStats` the player's do, rather than from a made-up DPS figure.
 *
 * Deliberately UNGEARED: `compileStats` is called with an empty equipment set. That is
 * both the honest reading of an ambient hero (they have no inventory) and a natural reason
 * a companion contributes less than the player without needing a fudge multiplier to
 * defend. Their power still tracks level and spec, so a party scales with the run.
 */
/**
 * The hero's combat clocks.
 *
 * These were five module-level `let`s in gameStore.ts. Module state is per-BUNDLE, not
 * per-character, so two heroes in the same save slot shared one set: switching characters
 * carried the other's half-charged swing timer, Rampage decay and minion clock into the
 * new fight. Nothing crashed, which is why it survived — it just quietly started your
 * second character mid-swing.
 *
 * They live on the state now, which also puts them where N-sided combat needs them: the
 * player is one combatant among several, and every other combatant already carries its own
 * `attackAccum` (see `AllyCombatant`).
 *
 * Not persisted — cleared on load like `mobs`. A swing timer belongs to a fight, and a
 * fight does not survive a reload.
 */
export interface CombatAccumulators {
  /** Seconds banked toward the hero's next swing. */
  player: number
  /** Seconds banked toward the engaged mob's next swing. */
  mob: number
  /** Seconds toward the next Tithe of Wounds tick. */
  siphon: number
  /** Seconds since the last kill, for shedding Rampage stacks. */
  rampageDecay: number
  /** A summoned minion swings on its own clock, not the hero's. */
  minion: number
}

export interface AllyCombatant {
  /** Party-module key — the join between this and `getParty()`. */
  key: string
  name: string
  playerClass: ClassType
  level: number
  talentAllocs: Record<string, number>
  /**
   * Their level as a SHARE of the player's, captured when they joined.
   *
   * Ambient heroes are generated at `playerLevel × U(0.8, 1.2)` (ambient.ts:124), so a
   * ratio is the honest way to keep growing them: a companion recruited as a near-peer
   * stays a near-peer, and one who was already behind stays proportionally behind.
   *
   * Before this they simply never levelled — `makeAlly` recompiled only when
   * `speaker.level` changed, and that is fixed at invite time and never mutated. A
   * companion recruited at level 1 was still level 1 when the hero reached 9, so their
   * contribution decayed across a run and a long-standing party quietly became scenery.
   */
  levelRatio: number
  /** Compiled once on join and on level change, not per tick. */
  stats: Stats
  currentHp: number
  /** Seconds accumulated toward the next swing. Per-ally: a shared clock is what made
   *  C4's second companion inert, and the same trap applies here. */
  attackAccum: number
  /** Seconds until they get back up; 0 means standing. */
  downedFor: number
  /** Their own proc state, so Seal Fate combo points and the rest cannot bleed between
   *  allies or into the player's. */
  procState: CombatProcState
  /** Their own seeded stream, carried as a single number for the same reason the player's
   *  is (see `procRoll`) — no module-level closure that resets on reload. */
  rngState: number
}

export interface MobInstance {
  /** Unique per spawned instance — several mobs of the same template coexist. */
  id: string
  templateId: MobId
  /** Display name, tier prefix and all: `★ Grey Wolf`, `[BOSS] Elder Meadow Beast`. */
  name: string
  /**
   * The template's own name, with no tier prefix.
   *
   * Anything DERIVED from a mob's identity must read this rather than `name`, because the
   * prefix is presentation and derivations are not. `resolveMobSprite` keys off
   * `strHash(name) % pool.length`, so `★ Grey Wolf` and `Grey Wolf` hash differently and
   * an elite rendered as a different creature entirely from the trash version of itself —
   * the tier badge silently reassigned the body. Temperament matches on the name too, so
   * any future prefix could have changed whether a mob charges you.
   *
   * Optional at the type level would have been kinder to old saves, but mobs are session
   * state (`rehydrateState` clears them), so a required field costs no migration.
   */
  baseName: string
  currentHp: number
  maxHp: number
  damage: number
  xpReward: number
  goldMin: number
  goldMax: number
  lootTableIds: string[]
  spriteKey: string
  attackSpeedSeconds: number
  isElite: boolean
  isBoss: boolean
  /** Where this mob actually STANDS, in zone tile coordinates on the 64×64 torus.
   *
   *  This is the authoritative position. `offset` used to be it, which meant a mob had no
   *  place in the world at all — only a bearing from the player — so the whole population
   *  slid along with the camera as the hero walked and every zone read as a slot machine
   *  rather than as ground you move through. */
  pos: { x: number; y: number }
  /** The patrol anchor this mob belongs to; it walks a loop around this and returns here
   *  after losing interest. Fixed at spawn, in the same zone tile coordinates. */
  home: { x: number; y: number }
  /** Current patrol waypoint, in zone tile coordinates. Null while aggroed — a mob
   *  chasing the hero is not walking its route. */
  patrolTarget: { x: number; y: number } | null
  /** Seconds until this mob picks a new patrol waypoint (it pauses at each one; a body
   *  that never stops reads as a conveyor belt rather than as something living). */
  patrolPause: number
  /** Cached A* route to wherever this mob is going, in zone tile coordinates.
   *  Collide-and-slide alone wedges against any concave shoreline — the "stuck on the
   *  lake edge" failure — so deliberate destinations are routed, not slid toward. */
  path: { x: number; y: number }[] | null
  /** Seconds until this mob may recompute its route. A* over 4096 nodes is cheap but
   *  not free, and every mob repathing every tick is the one real cost here. */
  pathCool: number
  /** Has this mob noticed the hero? Set by proximity (per temperament) or by being hit,
   *  and it is what makes the world reactive instead of scripted. */
  aggro: boolean
  /** How close the hero must come before this mob notices, in tiles. Derived from
   *  temperament at spawn: predators charge from far, territorial things wait. */
  aggroRadius: number
  /** DERIVED each tick as `pos - playerMapPos` on the torus. Kept because the renderer,
   *  `nearestMob`, `setTarget` and existing saves all read it; it is no longer authored. */
  offset: { dx: number; dy: number }
  /** Damage-over-time effects live ON the mob, so switching targets can't leak another
   *  mob's bleeds onto the new one. `activeDoTs` mirrors the current target's list. */
  dots: ActiveDoT[]
  /** Seconds banked toward this mob's next swing. Per-mob because the whole population
   *  can be mid-swing at once — the hero's engaged target used to be the only thing that
   *  attacked, so one shared accumulator on the state was enough. It no longer is: a
   *  shared clock would let four mobs share one swing, or fire all four on the same beat.
   *
   *  Session state. `mobs` is cleared on load (`rehydrateState`), so this needs no
   *  migration; `persistedBoss` is the one mob that survives a reload, and it is
   *  defaulted on the way back in. */
  attackAccum: number
}

// ── Zones ─────────────────────────────────────────────────────────────────────
export interface ZoneConfig {
  id: ZoneId
  name: string
  description: string
  levelRange: [number, number]
  mobs: MobTemplate[]
  bossId: MobId
  unlockKills: number
  nextZone?: ZoneId
  bgColor: string
  spriteKey?: string
  faction: FactionType | 'contested'
  hostileToFaction?: FactionType
}

// ── Races ─────────────────────────────────────────────────────────────────────
export interface RaceDefinition {
  id: RaceType
  name: string
  faction: FactionType
  allowedClasses: ClassType[]
  racialPassive: StatBonuses
  racialPassiveLabel: string   // short description shown in UI
  description: string
  lore: string
}

// ── Classes ───────────────────────────────────────────────────────────────────
export interface ClassDefinition {
  id: ClassType
  name: string
  description: string
  primaryStat: 'strength' | 'intellect' | 'agility'
  baseStats: Omit<Stats, 'currentHp' | 'maxHp' | 'critChance'>
  /** Exactly three, in display order. See data/specs.ts for the lookups over them. */
  specs: SpecDefinition[]
  colorClass: string
  allowedRaces: RaceType[]
}

// ── Combat Log ────────────────────────────────────────────────────────────────
export type CombatEventType =
  | 'player_attack' | 'player_crit' | 'mob_attack'
  | 'player_death'  | 'player_respawn' | 'mob_death'
  | 'loot_item'     | 'loot_gold'   | 'level_up'
  | 'zone_change'   | 'boss_spawn'  | 'dot_tick'
  | 'ability_use'   | 'proc'

export interface CombatLogEntry {
  id: string
  timestamp: number
  type: CombatEventType
  message: string
  color?: string
}

export interface GameSettings {
  tickRateMs: number
  combatTickSeconds: number
  showDamageNumbers: boolean
  autoSellCommon: boolean
  /**
   * Wear a strict upgrade the moment it drops. ON by default, and it has to be: there is
   * no other path from a drop to the hero's body, so a character nobody clicks on fights
   * naked forever. Measured before this existed — an untouched hero stalled at level ~20
   * and then took zero kills in eleven simulated hours.
   */
  autoEquip: boolean
  /** Move on when the next zone opens, and fall back from one that proves too hard.
   *  Without it an untouched hero farms the starting zone forever. */
  autoAdvanceZones: boolean
  volume: number
}

import type { OfflineRates, OfflineReport } from '../engine/offline'
import type { UpgradeId } from './upgrades'
import type { TownServiceKind } from './townNpcs'

// ── Full Game State ───────────────────────────────────────────────────────────
export interface GameState {
  initialized: boolean
  playerClass: ClassType
  playerRace: RaceType
  playerFaction: FactionType
  playerName: string
  factionNames: Record<FactionType, string>   // generated per-playthrough
  characterTraits: string[]
  generatedZoneNames: Partial<Record<ZoneId, string>>
  nameGenStatus: 'idle' | 'loading' | 'done' | 'error'
  currentThought: string | null
  thoughtExpiresAt: number   // ms timestamp
  lastThoughtAt: number      // ms timestamp, throttle gate
  zoomLevel: number          // world-scene zoom step: 0 = most zoomed out (default) → 1 → 2 (in)
  level: number
  xp: number
  stats: Stats
  talentAllocs: Record<string, number>   // talentId → currentRank
  talentPoints: number
  /** Schema stamp for the talent trees. A save written against an older layout is
   *  refunded once on load and re-stamped — see `rehydrateState`. */
  talentVersion: number
  equipment: Record<Slot, Item | null>
  inventory: (Item | null)[]
  /** Bag slots bought with gold, on top of INVENTORY_SLOTS. `inventory.length` is the
   *  live capacity and is kept equal to base + this; the counter persists it. */
  bagSlotsPurchased: number
  /** The standing arrangement with a town factor, or null if none is held. */
  merchantContract: MerchantContract | null
  /** Cumulative gold the contract has earned, for auditing it against its upkeep. */
  totalAutoSold: number
  /** Cumulative upkeep paid. Together with totalAutoSold this makes the contract's
   *  net worth checkable rather than a matter of opinion. */
  totalUpkeepPaid: number
  gold: number
  /** Ranks bought in each standing upgrade — the endless gold sink. Ranks are the only
   *  persisted truth; their effects are compiled on use (see data/upgrades.ts). */
  upgradeRanks: Partial<Record<UpgradeId, number>>
  /** Cumulative value recovered from drops there was no room to carry. Kept so the
   *  economy can be audited — a silent loss is what this replaced. */
  totalSalvaged: number
  skillCooldowns: Record<string, number>  // abilityId → seconds remaining
  currentZone: ZoneId
  /** The town NPC the hero is currently standing with, if any. Set by the world scene
   *  from proximity — town services belong to people you walk up to, not to a menu. */
  activeTownNpc: TownServiceKind | null
  /** Every enemy present in the zone. The player picks which one to fight. */
  mobs: MobInstance[]
  /** The mob being fought. Null lets auto-play choose (nearest); set by the player to
   *  commit to a specific enemy. */
  targetMobId: string | null
  /**
   * Party members as COMBATANTS.
   *
   * `engine/party.ts` owns who is in the party — names, invites, chat. This is the combat
   * projection of that list: compiled stats, a swing clock, health, and whether they are
   * down. It lives in `GameState` because a companion now deals real damage to real mobs,
   * and damage that the store does not own is damage `econSim` cannot measure.
   *
   * This reverses Track C3's option 2, which kept companion combat purely cosmetic in the
   * render adapter precisely so it could not touch the economy. That bought honest
   * measurement at the cost of a party that visibly swung and changed nothing — and the
   * swing-with-no-consequence read as the companion being broken. Owner call: allies
   * fight for real, and the harness grows a partied scenario to keep measuring.
   *
   * Session-scoped, like `mobs`: rebuilt from `getParty()` each tick and cleared on load.
   */
  allies: AllyCombatant[]
  /** The hero's swing/minion/decay clocks. Session state, cleared on load. */
  combatAccum: CombatAccumulators
  /**
   * The mob the hero was fighting when manual control dropped the target.
   *
   * Taking the wheel clears `targetMobId` on purpose — that is what "override" means, and
   * it is what stopped manual mode auto-attacking. But handing the wheel BACK then ran
   * `nearestMob`, which after any amount of walking is usually a different enemy, and the
   * renderer rebinding to it read as the monster teleporting across the screen (measured
   * at 13–19 tiles in a single frame). Remembering the last commitment lets idle resume
   * the fight the player was actually in rather than pick a stranger.
   *
   * Session-scoped: mobs are not persisted, so this is cleared on load like `targetMobId`.
   */
  lastEngagedMobId: string | null
  /**
   * PROJECTION of the targeted mob, not a second source of truth — the tick derives it
   * from `mobs`/`targetMobId` each pass and writes changes back. It exists so the whole
   * combat resolution, HUD and renderer keep reading a single engaged enemy exactly as
   * before; only spawning, selection and death had to learn about the collection.
   */
  currentMob: MobInstance | null
  persistedBoss: MobInstance | null
  combatLog: CombatLogEntry[]
  isAlive: boolean
  respawnTimer: number
  mobRespawnTimer: number
  activeDoTs: ActiveDoT[]
  activeBuffs: ActiveBuff[]
  procState: CombatProcState
  castState: CastState | null   // active player spell-cast (null when not casting)
  floatingNumbers: FloatingNumber[]
  unlockedZones: ZoneId[]
  zoneKillCounts: Record<string, number>
  totalZoneKills: Record<ZoneId, number>
  bossesDefeated: ZoneId[]
  lastTickTimestamp: number
  /** Decaying window of what combat actually produced, used to project time away.
   *  See engine/offline.ts — this is what makes offline parity measured, not modelled. */
  offlineRates: OfflineRates
  /** The last "while you were away" report, held until the player dismisses it. */
  lastOffline: OfflineReport | null
  /** Field time and kills since arriving in the current zone — the evidence the retreat
   *  rule acts on. Transient; not worth persisting across a reload. */
  zoneWatch: { zone: ZoneId; seconds: number; kills: number }
  /**
   * Zones the hero has been driven out of, and the level they were when it happened.
   * Auto-advance refuses to re-enter until they have out-levelled that failure, which is
   * what stops advance and retreat from thrashing against each other: every retreat
   * raises the bar, and only levelling can lower it again.
   */
  zoneBlockedAtLevel: Partial<Record<ZoneId, number>>
  totalPlayTime: number
  settings: GameSettings
  // ── Map / Travel / Professions ──────────────────────────────────────────────
  gameMode: GameMode
  travelTarget: ZoneId | null
  travelProgress: number      // 0–1
  travelDuration: number      // total seconds
  gatheringTimer: number      // seconds until next harvest
  materials: Record<MaterialId, number>
  /** Banked quality points, parallel to `materials`. purity/count = the stock's average
   *  quality. Absent on pre-quality saves → `{}` → everything reads as Coarse, i.e. the
   *  exact pre-change behaviour. */
  materialPurity: Record<MaterialId, number>
  /** Live strike meter for the node being worked. Transient — nulled on rehydrate. */
  gatherSession: GatherSession | null
  activeRecipe: RecipeId | null
  craftingTimer: number
  /** Quality locked in when the active craft started (materials are consumed on
   *  completion, but the tier is decided up front so the UI can show it). */
  craftQuality: QualityTier | null
  /** The most recent craft's reveal card. Transient; auto-expires in the UI. */
  lastCraft: CraftResult | null
  /** The most recent level-up's banner. Transient; auto-expires in the UI, and only ever
   *  set by the live tick — an offline session's levels are reported by the offline
   *  toast, which already says how many were gained. */
  lastLevelUp: LevelUpEvent | null
  // ── World Map ───────────────────────────────────────────────────────────────
  zoneMaps: Partial<Record<ZoneId, ZoneMap>>
  /** Per-character world entropy; seeds terrain generation. 0 = the legacy fixed world. */
  worldSeed: number
  playerMapPos: { x: number; y: number }   // float tile position
  weatherState: WeatherState
  mobMapOffset: { dx: number; dy: number } // tiles from player to mob
  // ── Prestige / Circuit ──────────────────────────────────────────────────────
  zoneCircuit: number                      // prestige loop counter, starts at 0
  // ── Towns ──────────────────────────────────────────────────────────────────
  currentTown: TownId | null
  generatedTownNames: Record<TownId, string>
  // ── Zone Quests ─────────────────────────────────────────────────────────────
  activeQuest: ZoneQuest | null
  completedQuestIds: string[]
  // ── Control mode ───────────────────────────────────────────────────────────
  /** 'idle' = auto-pilot (existing behavior). 'manual' = player-driven movement/abilities. */
  controlMode: 'idle' | 'manual'
  /** Equipped cosmetic colorway id (src/render/colorways.ts). Purely visual: it maps to
   *  palette slot overrides and can never affect stats. Premium ids are gated by a
   *  RevenueCat entitlement at equip time, so a save carrying one the player no longer
   *  owns simply renders as the default. */
  colorway: string
  /** Seconds remaining before manual mode falls back to idle. Only counts down in combat. */
  manualIdleTimer: number
  /** Banked offline extension, in seconds — bought with gold, consumed by the absence that
   *  needs it. Sits ON TOP of the free cap and the permanent `long_watch` ranks; see
   *  WATCH_BANK_CAP_HOURS. Absent on old saves → 0, i.e. exactly the old behaviour. */
  watchBonusSeconds: number
}

// ── Gathering: the optional strike-meter overlay ──────────────────────────────
export type StrikeResult = 'perfect' | 'good' | 'miss'

/**
 * One node-working session. Purely additive over the untouched 5s harvest timer: if the
 * player never strikes, every field stays at its opening value and the harvest lands
 * exactly as it always did, at Coarse quality.
 */
export interface GatherSession {
  /** `${x},${y}` of the node being worked, or 'manual' when the mode was forced. */
  nodeKey: string
  richness: 0 | 1 | 2
  cursor: number          // 0–1 position along the track
  dir: 1 | -1
  speed: number           // track-lengths per second
  bandCenter: number      // 0–1
  bandHalfWidth: number   // 0–1
  streak: number
  strikesLeft: number
  lockout: number         // seconds of miss-recovery remaining
  purity: number          // banked so far for the harvest in progress
  lastResult: StrikeResult | null
  lastResultAt: number    // ms timestamp, drives the UI flash
  /** Harvests completed in this session — used to vary the sweep so it never becomes a
   *  metronome the player can tap blind. */
  harvests: number
}

export interface CraftResult {
  id: string
  recipeId: RecipeId
  name: string
  icon: string
  quality: QualityTier
  rarity: Rarity
  kind: 'consumable' | 'gear'
  /** One-line summary of what it rolled ("+18% DMG for 60s", "+24 Stamina, +11 Armor"). */
  detail: string
  /** Palette id the quality resolves to — the same id the renderer would dress it in. */
  paletteId: string
  /** Set for gear crafts so the reveal can show the real item. */
  item: Item | null
  createdAt: number
}

/**
 * A level-up worth announcing.
 *
 * Levelling used to be visible only as one line in a feed that is also carrying every
 * swing of the fight — on a phone, where the feed is a sheet you have to open, it was
 * invisible. This is the same contract `CraftResult` has: the store records the moment,
 * the UI reveals it once and lets it expire.
 */
export interface LevelUpEvent {
  id: string
  level: number
  /** Whether this level actually paid a talent point — levels past the lifetime cap do not. */
  talentPoint: boolean
  /** Names of abilities whose unlock level is this one; the action bar itself changed. */
  unlockedAbilities: string[]
  /** Max-HP gained, so the banner can say what got stronger. */
  maxHpGain: number
  createdAt: number
}

export interface ZoneQuest {
  id: string
  zoneId: ZoneId
  title: string
  description: string
  levelReq: number
  killsReq: number
  bossId: string
  rewardZoneId?: ZoneId
  completed: boolean
  claimed: boolean
}

// ── World Map ─────────────────────────────────────────────────────────────────
export type TileType =
  | 'terrain' | 'water' | 'cliff' | 'resource_ore' | 'resource_herb'
  // Biome-flavored terrain (environment-plan Phase C). Emitted by generateZoneMap per
  // biome character; old saves without these still render (tileToFrame defaults to grass).
  | 'sand' | 'rock' | 'snow' | 'moss' | 'flower' | 'ember' | 'bog' | 'grass' | 'dirt'

export interface MapTile {
  type: TileType
  charSet: string[]   // multiple chars for animated water, single for others
  color: string
}

export interface MapNode {
  x: number; y: number   // tile coords (0–63)
  type: 'ore' | 'herb' | 'mob_spawn' | 'boss_lair'
  icon: string; color: string
}

// Flat ground-clutter prop kinds (environment-plan Phase D). artId indexes the prop
// sheet authored in placeholderArt.makePropSheet; the data layer keeps the id contract
// so engine mapGen never imports from the render layer. ≤ one tile footprint, baked
// into the ground (under units, no depth sort).
export const PROP_KIND = {
  TUFT: 0, PEBBLE: 1, FLOWER: 2, CRYSTAL: 3, MUSHROOM: 4, BONE: 5, CATTAIL: 6, ROCK: 7,
} as const

export interface MapProp {
  x: number       // game tile coords (0–63)
  y: number
  artId: number   // PROP_KIND.*
}

// Tall depth-sorted scenery (trees, boulders, spires, mounds, bushes, ruins). Values
// mirror the renderer's TALL_PROP ids (the data layer owns placement, the render layer
// owns the art — same split as PROP_KIND ↔ PROP).
export const SCENERY_KIND = {
  TREE: 0, ROCK_BIG: 1, PINE: 7, BOULDER: 8, SPIRE: 9, MOUND: 10,
  BUSH: 11, FLOWERBED: 12, PILLAR: 13, DEADTREE: 14, STUMP: 15, REEDS: 16,
  HUT: 17, TOWER: 18, ARCH: 19,
  // Canopy giants (renderer: the 64×96 landmark sheet, same as HUT/TOWER/ARCH). 20–25 are
  // taken by town furniture on the render side, hence 26. Sparse by design — see
  // BIOME_CANOPY in mapGen: the point of a giant is that the ordinary trees around it
  // read as ordinary.
  GREAT_TREE: 26, GREAT_PINE: 27, GREAT_DEADTREE: 28,
} as const

export interface MapScenery {
  x: number
  y: number
  kind: number    // SCENERY_KIND.* (== TALL_PROP.* on the render side)
}

export interface ZoneMap {
  tiles: MapTile[][]   // [row][col], 64×64
  nodes: MapNode[]
  /** Flat ground clutter (Phase D); optional for forward-compat with old saves. */
  props?: MapProp[]
  /** Tall depth-sorted scenery scattered per biome; optional for old saves. */
  scenery?: MapScenery[]
}

export type WeatherType = 'clear' | 'cloudy' | 'rain'

export interface WeatherState {
  type: WeatherType
  timer: number         // seconds until next transition
  cloudOffset: number   // 0–1, drifts left→right
  rainPhase: number     // 0–1, drives rain drop y cycling
}

export interface FloatingNumber {
  id: string
  value: number
  isCrit: boolean
  isMobDamage: boolean
  isDoT: boolean
  color?: string
  /** Set when the blow came from a PARTY MEMBER rather than the hero. The world renderer
   *  keys off this to play the lunge and impact on that companion's body — without it an
   *  ally's damage appears to come out of the player, which is what made the first cut of
   *  ally combat read as the player hitting harder rather than the party helping. */
  allyKey?: string
  /**
   * Which MOB threw this blow. The symmetric partner of `allyKey`, and it exists for the
   * same reason: the renderer can only play a swing on a body it can name.
   *
   * Without it, `triggerMobAttack` had exactly one place to put the choreography — the
   * ENGAGED target — so it opened with `if (!this.mob) return`. Manual control
   * deliberately holds `targetMobId` at null, which makes every mob a bystander, which
   * made that early return fire on every incoming hit: no swing animation, no hero
   * recoil, not even a damage floater, while the store dutifully applied the damage.
   * Measured as three mobs stacked on the hero dealing 315 damage over 30s with their
   * animators reading `idle` on all 680 samples. That is the whole of "enemies follow you
   * and never attack" — they were attacking, invisibly.
   */
  mobId?: string
  x: number
  y: number
  createdAt: number
}
