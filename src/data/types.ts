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
export type TownId = string
export type TownServiceType = 'rest' | 'vendor' | 'repair'

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
export type TalentMechanicType =
  | 'deep_wounds' | 'two_handed_spec' | 'impale' | 'sweeping_strikes'
  | 'sword_spec'  | 'mortal_strike'
  | 'frostbite'   | 'ice_shards'   | 'shatter'  | 'winters_chill'
  | 'ice_block'   | 'ice_barrier'  | 'cold_snap'
  | 'lethality'   | 'vile_poisons' | 'cold_blood' | 'seal_fate'
  | 'remorseless_attacks'
  | 'corruption'  | 'curse_of_agony' | 'nightfall' | 'siphon_life'
  | 'amplify_curse' | 'lifesteal'

export interface TalentEffectDef {
  type: 'stat' | 'mechanic'
  stat?: keyof StatBonuses
  valuePerRank: number
  mechanic?: TalentMechanicType
}

export interface TalentNodeDef {
  id: string
  name: string
  description: string   // use {n} as value placeholder
  icon: string          // emoji placeholder
  row: number           // 1–7
  col: number           // 1–4
  maxRanks: number
  requiresPoints: number
  requires?: string     // talent ID that must be maxed first
  effects: TalentEffectDef[]
}

export interface CompiledTalentEffects {
  statBonuses: StatBonuses
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
}

// ── Active Abilities (Skill Bar) ──────────────────────────────────────────────
export type AbilityEffectType =
  | 'next_hit_multiplier' | 'armor_buff'     | 'lifesteal_buff'
  | 'speed_buff'          | 'freeze_mob'     | 'crit_guarantee'
  | 'crit_buff_pct'       | 'heal'           | 'hot'
  | 'dot_amplify'         | 'shadow_bolt'

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
  sourceType: 'bleed' | 'poison' | 'corruption' | 'curse' | 'shadow'
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

export interface CombatProcState {
  winterChillStacks: number
  comboPoints: number
  remorselessActive: boolean
  iceBlockUsed: boolean
  mobFrozen: boolean
  mobFrozenTimer: number
  iceBarrierHp: number
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

export interface MobInstance {
  /** Unique per spawned instance — several mobs of the same template coexist. */
  id: string
  templateId: MobId
  name: string
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
  /** This mob's own position relative to the player, in map tiles. The engaged target
   *  closes to 0; the rest hold station until chosen. */
  offset: { dx: number; dy: number }
  /** Damage-over-time effects live ON the mob, so switching targets can't leak another
   *  mob's bleeds onto the new one. `activeDoTs` mirrors the current target's list. */
  dots: ActiveDoT[]
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
  talents: TalentNodeDef[]
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
  volume: number
}

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
  equipment: Record<Slot, Item | null>
  inventory: (Item | null)[]
  gold: number
  skillCooldowns: Record<string, number>  // abilityId → seconds remaining
  currentZone: ZoneId
  /** Every enemy present in the zone. The player picks which one to fight. */
  mobs: MobInstance[]
  /** The mob being fought. Null lets auto-play choose (nearest); set by the player to
   *  commit to a specific enemy. */
  targetMobId: string | null
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
  totalPlayTime: number
  settings: GameSettings
  // ── Map / Travel / Professions ──────────────────────────────────────────────
  gameMode: GameMode
  travelTarget: ZoneId | null
  travelProgress: number      // 0–1
  travelDuration: number      // total seconds
  gatheringTimer: number      // seconds until next harvest
  materials: Record<MaterialId, number>
  activeRecipe: RecipeId | null
  craftingTimer: number
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
  x: number
  y: number
  createdAt: number
}
