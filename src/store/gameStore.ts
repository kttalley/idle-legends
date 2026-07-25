import { create } from 'zustand'
import type {
  GameState, ClassType, RaceType, FactionType, ZoneId, Item, Slot,
  MobInstance, CombatLogEntry, FloatingNumber,
  Stats, ActiveDoT, ActiveBuff, CombatProcState,
  GameMode, RecipeId, MaterialId, WeatherType, TownId,
} from '../data/types'
import type { GatherSession, CraftResult, QualityTier } from '../data/types'
import { TOWNS } from '../data/towns'
import { RACE_DEFINITIONS } from '../data/races'
import { ZONE_MATERIALS, RECIPES, isGearRecipe } from '../data/professions'
import type { Recipe, CraftStatEffect } from '../data/professions'
import {
  GATHER_SECONDS, STRIKES_PER_HARVEST, STRIKE_LOCKOUT_SECONDS, MAX_PURITY_PER_UNIT,
  QUALITY_LABEL, QUALITY_MULT, QUALITY_PALETTE, QUALITY_RARITY,
  bandHalfWidthFor, consumeInputs, nodeRichness, qualityAtLeast, recipeQuality, rollSweep,
  resolveStrike,
} from '../engine/crafting'
import { generateItem } from '../data/items'
import { ZONE_ORDER } from '../data/zones'
import { generateZoneMap } from '../engine/mapGen'
import { ZONES } from '../data/zones'
import { CLASS_DEFINITIONS } from '../data/classes'
import { ACTIVE_ABILITIES, getClassAbilities } from '../data/abilities'
import {
  compileStats, compileTalentEffects,
  resolvePlayerAttack, resolveMobAttack,
  makeShadowBoltHit, makeAbilityBuff,
} from '../engine/combat'
import { xpForLevel } from '../engine/progression'
import {
  canEnterZone,
  getZoneProgression,
  makeZoneQuest,
  isZoneQuestComplete,
  deriveActiveQuest,
  type ZoneQuest,
} from '../engine/zoneProgression'
import { getWalkMask, moveWithCollision, nearestWalkable } from '../engine/walkability'
import {
  INVENTORY_SLOTS, MOB_RESPAWN_SECONDS, RESPAWN_TIMER_SECONDS,
  ELITE_HP_MULTIPLIER, ELITE_DAMAGE_MULTIPLIER, ELITE_SPAWN_CHANCE,
  BOSS_HP_MULTIPLIER, BOSS_DAMAGE_MULTIPLIER,
  AUTOSAVE_INTERVAL_MS,
} from '../data/constants'
import { rollLoot } from '../engine/loot'
import { generateNames, generateThought, generateFactionNamesFallback, generatePlayerNameFallback } from '../engine/nameGen'
import type { ThoughtEvent } from '../engine/nameGen'
import { slotStorage, summarize, newSlotId } from './saveSlots'

// The slot currently loaded into the store — the target of every autosave. Null
// while at the character-select menu. Kept out of GameState so it isn't serialized
// into the save blob itself.
let activeSlotId: string | null = null
const LOG_MAX  = 150
// Cast pushback: seconds added to a channel per mob hit, and the per-cast cap.
const CAST_PUSHBACK_PER_HIT = 0.5
const CAST_PUSHBACK_CAP     = 2.0

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function seededRandLocal(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297 + 233) * 16807
  return x - Math.floor(x)
}

// ── Default proc state ────────────────────────────────────────────────────────
function defaultProcState(): CombatProcState {
  return {
    winterChillStacks: 0,
    comboPoints: 0,
    remorselessActive: false,
    iceBlockUsed: false,
    mobFrozen: false,
    mobFrozenTimer: 0,
    iceBarrierHp: 0,
  }
}

// ── Zoom preference (global UI pref, persisted outside the per-character save slot) ──
const ZOOM_KEY = 'il_zoom_level'
const ZOOM_STEPS = 3
function readZoomPref(): number {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY))
    return Number.isFinite(n) ? Math.min(ZOOM_STEPS - 1, Math.max(0, Math.floor(n))) : 0
  } catch { return 0 }
}
function writeZoomPref(n: number): void {
  try { localStorage.setItem(ZOOM_KEY, String(n)) } catch { /* private mode / no storage */ }
}

// ── Default State ─────────────────────────────────────────────────────────────
function defaultState(): GameState {
  return {
    initialized: false,
    playerClass: 'warrior',
    playerRace: 'human',
    playerFaction: 'alliance',
    playerName: '',
    factionNames: generateFactionNamesFallback(Date.now() ^ Math.floor(Math.random() * 0xFFFFFF)),
    characterTraits: [],
    generatedZoneNames: {},
    nameGenStatus: 'idle',
    currentThought: null,
    thoughtExpiresAt: 0,
    lastThoughtAt: 0,
    zoomLevel: readZoomPref(),
    level: 1,
    xp: 0,
    stats: {} as Stats,
    talentAllocs: {},
    talentPoints: 1,  // start with 1 point at level 1
    equipment: { weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null },
    inventory: Array(INVENTORY_SLOTS).fill(null),
    gold: 0,
    skillCooldowns: {},
    currentZone: 'sunhollow_meadows',
    mobs: [],
    targetMobId: null,
    currentMob: null,
    persistedBoss: null,
    combatLog: [],
    isAlive: true,
    respawnTimer: 0,
    mobRespawnTimer: 0,
    activeDoTs: [],
    activeBuffs: [],
    procState: defaultProcState(),
    castState: null,
    floatingNumbers: [],
    unlockedZones: ['sunhollow_meadows'],
    zoneKillCounts: {},
    totalZoneKills: {
      sunhollow_meadows: 0, dustwind_plains: 0, grimshade_forest: 0,
      thornvale_jungle: 0, ashfire_peaks: 0,
      shattered_crossing: 0, the_bloodfields: 0,
      ironcrag_badlands: 0, venom_hollows: 0, warsong_mesa: 0,
      cinderfall_wastes: 0, the_maw_eternal: 0,
    },
    bossesDefeated: [],
    zoneCircuit: 0,
    lastTickTimestamp: Date.now(),
    totalPlayTime: 0,
    settings: {
      tickRateMs: 1000,
      combatTickSeconds: 2,
      showDamageNumbers: true,
      autoSellCommon: false,
      volume: 0.5,
    },
    // Map / Travel / Professions
    gameMode: 'combat',
    travelTarget: null,
    travelProgress: 0,
    travelDuration: 0,
    gatheringTimer: GATHER_SECONDS,
    materials: {},
    materialPurity: {},
    gatherSession: null,
    activeRecipe: null,
    craftingTimer: 0,
    craftQuality: null,
    lastCraft: null,
    // World Map
    zoneMaps: {},
    // Per-run world entropy. 0 = the original fixed world (what every save before this
    // field had); initGame rolls a real one so each character gets their own terrain.
    worldSeed: 0,
    playerMapPos: { x: 32, y: 32 },
    weatherState: { type: 'clear', timer: 45, cloudOffset: 0, rainPhase: 0 },
    mobMapOffset: { dx: 0, dy: 0 },
    // Towns
    currentTown: null,
    generatedTownNames: {},
    // Zone Quests
    activeQuest: makeZoneQuest('sunhollow_meadows', 'alliance'),
    completedQuestIds: [],
  }
}

// ── Rehydrate a saved blob into a runnable state ────────────────────────────────
// Backfills fields added since the save was written, recompiles derived stats, and
// resets all transient/combat state. Shared by every load path (slot load,
// migrated legacy save). Mutates and returns `saved`.
function rehydrateState(saved: GameState): GameState {
  // Ensure new fields exist on old saves
  saved.playerRace    = saved.playerRace    ?? 'human'
  saved.playerFaction = saved.playerFaction ?? 'alliance'
  saved.factionNames  = saved.factionNames  ?? generateFactionNamesFallback(Date.now())
  // Recompile stats
  const savedRacialPassive = RACE_DEFINITIONS[saved.playerRace]?.racialPassive ?? {}
  saved.stats = compileStats(saved.playerClass, saved.level, saved.equipment, saved.talentAllocs ?? {}, savedRacialPassive)
  saved.stats.currentHp = Math.min(saved.stats.maxHp, (saved.stats as any)._savedHp ?? saved.stats.maxHp)
  saved.talentAllocs  = saved.talentAllocs  ?? {}
  saved.talentPoints  = saved.talentPoints  ?? saved.level
  saved.activeDoTs    = []
  // The zone repopulates on load; saves predating the population have neither field.
  saved.mobs          = []
  saved.targetMobId   = null
  saved.activeBuffs   = []
  saved.procState     = defaultProcState()
  saved.castState     = null
  saved.skillCooldowns = {}
  // New fields — default if missing
  saved.gameMode      = 'combat'
  saved.travelTarget  = null
  saved.travelProgress = 0
  saved.travelDuration = 0
  saved.gatheringTimer = GATHER_SECONDS
  saved.materials     = saved.materials ?? {}
  // Quality fields (added after this save was written). A pre-quality hero's stock simply
  // reads as Coarse — purity 0 — which is exactly what it was worth before quality existed.
  saved.materialPurity = saved.materialPurity ?? {}
  saved.gatherSession  = null   // transient: the live strike meter
  saved.activeRecipe  = null
  saved.craftingTimer = 0
  saved.craftQuality  = null
  saved.lastCraft     = null
  // Generate maps for all unlocked zones
  saved.worldSeed = saved.worldSeed ?? 0   // pre-worldSeed saves keep their original world
  const zoneMaps: GameState['zoneMaps'] = {}
  for (const zid of (saved.unlockedZones ?? ['sunhollow_meadows'])) {
    zoneMaps[zid] = generateZoneMap(zid, mapSeed(saved as GameState))
  }
  saved.zoneMaps      = zoneMaps
  saved.playerMapPos  = { x: 32, y: 32 }
  saved.weatherState  = { type: 'clear', timer: 45, cloudOffset: 0, rainPhase: 0 }
  saved.mobMapOffset       = { dx: 0, dy: 0 }
  saved.currentTown        = null
  saved.generatedTownNames = saved.generatedTownNames ?? {}
  saved.zoomLevel          = readZoomPref()  // global UI pref, not per-slot
  // Zone quest fields (added after this save was written)
  saved.activeQuest = saved.activeQuest ?? deriveActiveQuest(saved)
  saved.completedQuestIds = saved.completedQuestIds ?? []
  return saved
}

// Serialize the live state into a save blob, stashing currentHp (derived stats are
// recomputed on load, but current HP must survive).
function toSaveBlob(s: GameState): GameState {
  const blob = { ...s } as GameState;
  (blob.stats as any) = { ...s.stats, _savedHp: s.stats.currentHp }
  // Stamp the write time so elapsed-offline is computable on load (calculateOfflineTime).
  // It was only ever set at character creation, which made every offline window equal the
  // hero's whole lifetime. Nothing consumes it yet — see the plan's out-of-scope note —
  // but it must be honest before anything can.
  blob.lastTickTimestamp = Date.now()
  // The strike meter is a live UI object, never a saved one.
  blob.gatherSession = null
  return blob
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(
  type: CombatLogEntry['type'],
  message: string,
  color?: string,
): CombatLogEntry {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, timestamp: Date.now(), type, message, color }
}

function fn(value: number, isCrit: boolean, isMobDamage: boolean, isDoT: boolean, color?: string): FloatingNumber {
  return {
    id: `fn_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    value, isCrit, isMobDamage, isDoT, color,
    x: 45 + (Math.random() - 0.5) * 22,
    y: 40 + (Math.random() - 0.5) * 12,
    createdAt: Date.now(),
  }
}

/**
 * Seed every zone's terrain from the character's own world PLUS the prestige circuit, so
 * a run has its own geography and each circuit through the world regenerates it rather
 * than replaying the identical map. Both components are 0 on legacy saves, which
 * reproduces the original fixed world exactly.
 */
export function mapSeed(s: Pick<GameState, 'worldSeed' | 'zoneCircuit'>): number {
  return (s.worldSeed ?? 0) ^ Math.imul(s.zoneCircuit ?? 0, 0x85EBCA6B)
}

/**
 * Apply a drift step to the LOGICAL map position, refusing to enter unwalkable ground.
 *
 * This is not cosmetic: `playerMapPos` drives resource-node proximity, so a hero drifting
 * across a lake would trigger auto-gather from open water. It also self-heals a position
 * that is already blocked — the zone spawn (32,32) sits on a blocked tile in two zones,
 * and old saves can hold such a position — because a blocked start would otherwise refuse
 * every step and strand the drift forever.
 */
function driftMapPos(state: GameState, dx: number, dy: number): { x: number; y: number } {
  const wrap = (v: number) => ((v % 64) + 64) % 64
  const zm = state.zoneMaps[state.currentZone]
  if (!zm) return { x: wrap(state.playerMapPos.x + dx), y: wrap(state.playerMapPos.y + dy) }
  const mask = getWalkMask(state.currentZone, zm)
  const from = nearestWalkable(mask, state.playerMapPos.x, state.playerMapPos.y)
  const moved = moveWithCollision(mask, from.x, from.y, dx, dy)
  return { x: wrap(moved.x), y: wrap(moved.y) }
}

// ── Gathering: node lookup + the optional strike meter ────────────────────────
const NODE_RANGE = 2.5

/** The resource node the hero is standing at, if any. */
function nodeAt(state: GameState, pos: { x: number; y: number }) {
  const zMap = state.zoneMaps[state.currentZone]
  if (!zMap) return null
  for (const node of zMap.nodes) {
    if (node.type !== 'ore' && node.type !== 'herb') continue
    const ndx = Math.min(Math.abs(node.x - pos.x), 64 - Math.abs(node.x - pos.x))
    const ndy = Math.min(Math.abs(node.y - pos.y), 64 - Math.abs(node.y - pos.y))
    if (Math.sqrt(ndx * ndx + ndy * ndy) < NODE_RANGE) return node
  }
  return null
}

/**
 * Open a session on a node. Everything here is presentation for a player who chooses to
 * engage — the harvest timer, yield and material are decided entirely elsewhere, so a
 * session that receives no input is indistinguishable from the pre-change behaviour.
 */
function openGatherSession(state: GameState, node: { x: number; y: number } | null): GatherSession {
  const key = node ? `${node.x},${node.y}` : 'manual'
  const richness = node ? nodeRichness(mapSeed(state), node.x, node.y) : 0
  const seed = hashStr(`${state.currentZone}:${key}`) ^ mapSeed(state)
  const sweep = rollSweep(seed, 0)
  return {
    nodeKey: key,
    richness,
    cursor: sweep.dir === 1 ? 0 : 1,
    dir: sweep.dir,
    speed: sweep.speed,
    bandCenter: sweep.bandCenter,
    bandHalfWidth: bandHalfWidthFor(richness),
    streak: 0,
    strikesLeft: STRIKES_PER_HARVEST,
    lockout: 0,
    purity: 0,
    lastResult: null,
    lastResultAt: 0,
    harvests: 0,
  }
}

/** Advance the sweep. Pure motion — never touches the harvest timer. */
function advanceGatherSession(s: GatherSession, dt: number): GatherSession {
  let cursor = s.cursor + s.dir * s.speed * dt
  let dir = s.dir
  // Reflect at the ends so the track reads as a swing, not a wrap-around jump.
  while (cursor < 0 || cursor > 1) {
    if (cursor < 0) { cursor = -cursor; dir = 1 }
    else { cursor = 2 - cursor; dir = -1 }
  }
  return { ...s, cursor, dir, lockout: Math.max(0, s.lockout - dt) }
}

/** Re-roll the sweep for the next harvest, carrying the streak. */
function rearmGatherSession(state: GameState, s: GatherSession): GatherSession {
  const harvests = s.harvests + 1
  const seed = hashStr(`${state.currentZone}:${s.nodeKey}`) ^ mapSeed(state)
  const sweep = rollSweep(seed, harvests)
  return {
    ...s,
    harvests,
    speed: sweep.speed,
    bandCenter: sweep.bandCenter,
    strikesLeft: STRIKES_PER_HARVEST,
    purity: 0,
  }
}

// ── Crafting helpers ──────────────────────────────────────────────────────────
function hasInputs(mats: Record<MaterialId, number>, r: Recipe): boolean {
  for (const inp of r.inputs) if ((mats[inp.materialId] ?? 0) < inp.qty) return false
  return true
}

/**
 * What auto-craft picks when the hero walks away from a node.
 *
 * Legacy behaviour was "first satisfiable recipe in RECIPES order". That branch is
 * preserved verbatim for consumables; the only addition is a preceding gear branch gated
 * on Superior-or-better material quality — a tier that is arithmetically unreachable at
 * purity 0. An idle player therefore takes the identical legacy path.
 */
function pickAutoRecipe(
  playerClass: ClassType,
  mats: Record<MaterialId, number>,
  purity: Record<MaterialId, number>,
): Recipe | null {
  for (const r of RECIPES) {
    if (r.classFor !== playerClass || !isGearRecipe(r) || !hasInputs(mats, r)) continue
    if (qualityAtLeast(recipeQuality(mats, purity, r.inputs), 'superior')) return r
  }
  for (const r of RECIPES) {
    if (r.classFor !== playerClass || isGearRecipe(r)) continue
    if (hasInputs(mats, r)) return r
  }
  return null
}

function effectSummary(eff: CraftStatEffect, mult: number): string {
  const dur = Math.round((eff.durationSeconds ?? 0) * mult)
  if (eff.type === 'instant_heal') return `Heals ${Math.round(eff.value * mult)} HP`
  if (eff.type === 'buff_armor')   return `+${Math.round(eff.value * mult)} Armor for ${dur}s`
  if (eff.type === 'buff_crit')    return `+${(eff.value * mult * 100).toFixed(1)}% Crit for ${dur}s`
  return `+${(eff.value * mult * 100).toFixed(1)}% Damage for ${dur}s`
}

function itemSummary(item: Item): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(item.statBonuses)) {
    if (v == null) continue
    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
    parts.push(k === 'critChance' ? `+${(v * 100).toFixed(1)}% Crit` : `+${v} ${label}`)
  }
  return parts.join(' · ') || 'No bonuses'
}

/**
 * Resolve a finished craft: consume inputs (count AND purity, proportionally), mint the
 * output at the earned quality, and post the reveal card. Returns a state patch.
 */
function resolveCraft(state: GameState, recipe: Recipe, quality: QualityTier): Partial<GameState> {
  const spent = consumeInputs(state.materials, state.materialPurity, recipe.inputs)
  const mult = QUALITY_MULT[quality]
  const rarity = QUALITY_RARITY[quality]
  const qLabel = QUALITY_LABEL[quality]
  const newLogs: CombatLogEntry[] = []

  const base: Partial<GameState> = {
    activeRecipe: null,
    craftingTimer: 0,
    craftQuality: null,
    materials: spent.materials,
    materialPurity: spent.purity,
    gameMode: 'combat',   // return to wandering after craft completes
  }

  if (isGearRecipe(recipe) && recipe.gear) {
    // Crafted gear is minted at the rarity the MATERIALS earned — no gamble. Rarity is a
    // palette accent (heroWardrobe), so equipping this visibly recolours the hero.
    const item = generateItem(
      recipe.gear.slot, state.level, 0, rarity, `${qLabel} ${recipe.output.name}`,
    )
    const inventory = [...state.inventory]
    const free = inventory.indexOf(null)
    if (free >= 0) {
      inventory[free] = item
      newLogs.push(log('loot_item', `${recipe.output.icon} Crafted ${item.name}!`, rarityColor(rarity)))
    } else {
      newLogs.push(log('proc', `${recipe.output.icon} ${item.name} crafted — bags full!`, '#ff8844'))
    }
    return {
      ...base,
      inventory,
      lastCraft: {
        id: `craft_${Date.now()}`,
        recipeId: recipe.id,
        name: item.name,
        icon: recipe.output.icon,
        quality, rarity, kind: 'gear',
        detail: itemSummary(item),
        paletteId: QUALITY_PALETTE[quality],
        item,
        createdAt: Date.now(),
      },
      combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX),
    }
  }

  // Consumable: quality scales BOTH the magnitude and the duration. coarse === 1.0, so an
  // idle player's numbers are unchanged.
  const eff = recipe.output.effect
  let stats = state.stats
  let activeBuffs = state.activeBuffs
  let detail = ''
  if (eff) {
    detail = effectSummary(eff, mult)
    if (eff.type === 'instant_heal') {
      const healed = Math.round(eff.value * mult)
      stats = { ...state.stats, currentHp: Math.min(state.stats.maxHp, state.stats.currentHp + healed) }
      newLogs.push(log('proc', `${recipe.output.icon} ${qLabel} ${recipe.output.name} — healed ${healed} HP`, '#44ff88'))
    } else {
      const buffMap: Record<string, string> = {
        buff_dmg_pct: 'next_hit_multiplier',
        buff_armor:   'armor_buff',
        buff_crit:    'crit_buff_pct',
      }
      activeBuffs = [...state.activeBuffs, {
        id:                `craft_buff_${Date.now()}`,
        label:             `${qLabel} ${recipe.output.name}`,
        icon:              recipe.output.icon,
        color:             rarityColor(rarity),
        type:              buffMap[eff.type] as any,
        value:             eff.value * mult,
        durationRemaining: (eff.durationSeconds ?? 30) * mult,
      }]
      newLogs.push(log('proc', `${recipe.output.icon} Crafted ${qLabel} ${recipe.output.name}!`, rarityColor(rarity)))
    }
  }

  return {
    ...base,
    stats,
    activeBuffs,
    lastCraft: {
      id: `craft_${Date.now()}`,
      recipeId: recipe.id,
      name: `${qLabel} ${recipe.output.name}`,
      icon: recipe.output.icon,
      quality, rarity, kind: 'consumable',
      detail,
      paletteId: QUALITY_PALETTE[quality],
      item: null,
      createdAt: Date.now(),
    },
    combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX),
  }
}

function spawnMob(zoneId: ZoneId, state: GameState): MobInstance | null {
  const zone = ZONES[zoneId]
  if (!zone) return null
  const totalKills = state.totalZoneKills[zoneId] ?? 0
  const bossDefeated = state.bossesDefeated.includes(zoneId)
  const canSpawnBoss = totalKills >= zone.unlockKills && !bossDefeated

  let template
  if (canSpawnBoss) {
    template = zone.mobs.find(m => m.id === zone.bossId)!
  } else {
    const nonBoss = zone.mobs.filter(m => m.id !== zone.bossId)
    template = nonBoss[Math.floor(Math.random() * nonBoss.length)]
  }

  const isElite = !canSpawnBoss && Math.random() < ELITE_SPAWN_CHANCE
  const isBoss  = canSpawnBoss
  const hpMult  = isBoss ? BOSS_HP_MULTIPLIER  : isElite ? ELITE_HP_MULTIPLIER  : 1
  const dmgMult = isBoss ? BOSS_DAMAGE_MULTIPLIER : isElite ? ELITE_DAMAGE_MULTIPLIER : 1

  // Circuit scaling: each completed loop increases mob HP and damage by 50%
  const circuitMult = 1 + (state.zoneCircuit ?? 0) * 0.5

  return {
    id: `mob_${++mobInstanceSeq}`,
    templateId: template.id,
    name: isBoss ? `[BOSS] ${template.name}` : isElite ? `★ ${template.name}` : template.name,
    currentHp: Math.round(template.hp * hpMult * circuitMult),
    maxHp:     Math.round(template.hp * hpMult * circuitMult),
    damage: Math.round(template.damage * circuitMult),
    xpReward: Math.round(template.xpReward * (isBoss ? 3 : isElite ? 2 : 1) * circuitMult),
    goldMin: template.goldMin,
    goldMax: template.goldMax,
    lootTableIds: template.lootTableIds,
    spriteKey: template.spriteKey,
    attackSpeedSeconds: template.attackSpeedSeconds * dmgMult,
    isElite,
    isBoss,
    offset: spawnOffset(),
    dots: [],
  }
}

/** A fresh spawn ring position: far enough to walk to, near enough to find. */
function spawnOffset(): { dx: number; dy: number } {
  const ang = Math.random() * Math.PI * 2
  const dist = 9 + Math.random() * 7
  return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist }
}

/** How many enemies populate a zone at once. The boss fights alone — a lair should not
 *  be a crowd, and it keeps the climactic encounter reading as one. */
const MOB_POPULATION = 4

function isBossPresent(mobs: MobInstance[]): boolean {
  return mobs.some(m => m.isBoss)
}

/** Nearest mob to the player, used when the player has expressed no preference. */
function nearestMob(mobs: MobInstance[]): MobInstance | null {
  let best: MobInstance | null = null
  let bestD = Infinity
  for (const m of mobs) {
    const d = m.offset.dx * m.offset.dx + m.offset.dy * m.offset.dy
    if (d < bestD) { bestD = d; best = m }
  }
  return best
}

let mobInstanceSeq = 0
let playerAttackAccum = 0
let mobAttackAccum    = 0
let siphonLifeAccum   = 0

export function resetCombatAccumulators() {
  playerAttackAccum = 0
  mobAttackAccum    = 0
  siphonLifeAccum   = 0
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface GameActions {
  initGame: (playerClass: ClassType, playerRace: RaceType, opts?: { name?: string; faction?: FactionType }) => void
  loadSlot: (id: string) => boolean
  saveGame: () => void
  returnToMenu: () => void
  resetGame: () => void
  tick: (deltaSeconds: number) => void
  equipItem: (inventoryIndex: number) => void
  unequipItem: (slot: Slot) => void
  sellItem: (inventoryIndex: number) => void
  sellAllCommon: () => void
  selectZone: (zoneId: ZoneId) => void
  devJumpZone: (zoneId: ZoneId) => void
  allocateTalent: (talentId: string) => void
  deallocateTalent: (talentId: string) => void
  resetTalents: () => void
  activateAbility: (abilityId: string) => void
  finishCast: (abilityId: string) => void
  respawnNow: () => void
  dismissFloatingNumber: (id: string) => void
  triggerThought: (event: ThoughtEvent, extra?: string) => void
  beginTravel: (toZone: ZoneId) => void
  cancelTravel: () => void
  cycleZoom: () => void
  setMode: (mode: GameMode) => void
  startCrafting: (recipeId: RecipeId) => void
  strikeNode: () => void
  dismissCraftResult: () => void
  enterTown: (townId: TownId) => void
  leaveTown: () => void
  restInTown: () => void
  claimQuestReward: (questId: string) => void
  dismissQuestReward: (questId: string) => void
  engageTarget: () => void
  setTarget: (mobId: string) => void
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...defaultState(),

  initGame: (playerClass, playerRace, opts) => {
    const s = defaultState()
    s.playerClass = playerClass
    s.playerRace = playerRace
    // Faction: explicit choice (neutral races may pick a side) else the race default.
    s.playerFaction = opts?.faction ?? RACE_DEFINITIONS[playerRace].faction
    s.initialized = true
    s.talentPoints = 1
    s.stats = compileStats(playerClass, 1, s.equipment, s.talentAllocs, RACE_DEFINITIONS[playerRace].racialPassive)
    s.stats.currentHp = s.stats.maxHp
    s.lastTickTimestamp = Date.now()
    // Roll this character's world. Zone identity used to be the entire seed, so every
    // playthrough shared one fixed map; now each hero gets their own terrain, node
    // placement and scenery, and every prestige circuit re-rolls it again.
    s.worldSeed = (Math.floor(Math.random() * 0xFFFFFFFF) ^ Date.now()) | 0
    s.zoneMaps = { sunhollow_meadows: generateZoneMap('sunhollow_meadows', mapSeed(s)) }
    s.activeQuest = makeZoneQuest('sunhollow_meadows', s.playerFaction)
    s.completedQuestIds = []
    const nameSeed = Date.now() ^ Math.floor(Math.random() * 0xFFFFFF)
    s.factionNames = generateFactionNamesFallback(nameSeed)  // instant fallback shown immediately
    // A name chosen in creation is authoritative: set it now and mark naming done so
    // the game is fully playable offline; the LLM only enriches the rest afterward.
    const chosenName = opts?.name?.trim() || ''
    if (chosenName) {
      s.playerName = chosenName
      s.nameGenStatus = 'done'
    } else {
      s.nameGenStatus = 'loading'
    }
    resetCombatAccumulators()
    // Mint a fresh save slot for this character and persist it immediately, so the
    // run survives a reload even before the first autosave.
    activeSlotId = newSlotId()
    set(s)
    get().saveGame()
    // Fire name generation async — game starts immediately, names trickle in. A
    // creation-chosen name is preserved (never overwritten by the LLM).
    generateNames(playerClass, nameSeed)
      .then(names => { set({
        playerName: chosenName || names.playerName,
        characterTraits: names.traits,
        generatedZoneNames: names.zoneNames,
        factionNames: names.factionNames,
        generatedTownNames: names.townNames ?? {},
        nameGenStatus: 'done',
      }); get().saveGame() })  // persist the generated identity into the slot
      .catch((err) => { console.error('[nameGen] failed:', err); if (!chosenName) set({ nameGenStatus: 'error' }) })
  },

  loadSlot: (id) => {
    try {
      const slot = slotStorage.load(id)
      if (!slot || !slot.state?.initialized) return false
      const saved = rehydrateState(slot.state)
      resetCombatAccumulators()
      activeSlotId = id
      set(saved)
      get().saveGame()   // refreshes lastPlayedAt
      return true
    } catch {
      return false
    }
  },

  saveGame: () => {
    if (!activeSlotId) return
    const s = get()
    if (!s.initialized) return
    const now = Date.now()
    const existing = slotStorage.load(activeSlotId)
    slotStorage.save({
      id:           activeSlotId,
      createdAt:    existing?.createdAt ?? now,
      lastPlayedAt: now,
      summary:      summarize(s),
      state:        toSaveBlob(s),
    })
  },

  // Save the active run and drop back to the character-select menu (no data loss —
  // this replaces the old destructive "New Game" wipe).
  returnToMenu: () => {
    get().saveGame()
    activeSlotId = null
    resetCombatAccumulators()
    set({ ...defaultState(), initialized: false })
  },

  resetGame: () => {
    // Full wipe of the active run only (not other slots). Retained for dev use;
    // not wired to any UI button.
    if (activeSlotId) slotStorage.delete(activeSlotId)
    activeSlotId = null
    resetCombatAccumulators()
    set(defaultState())
  },

  // ── Main Tick ────────────────────────────────────────────────────────────────
  tick: (deltaSeconds) => {
    const state = get()
    if (!state.initialized) return

    // ── Weather tick (always runs) ────────────────────────────────────────────
    {
      const w = state.weatherState
      const newTimer  = w.timer - deltaSeconds
      const newOffset = (w.cloudOffset + deltaSeconds * 0.012) % 1
      const newRain   = w.type === 'rain' ? (w.rainPhase + deltaSeconds * 0.4) % 1 : w.rainPhase

      if (newTimer <= 0) {
        const nextWeather = (t: WeatherType): WeatherType => {
          if (t === 'clear')  return 'cloudy'
          if (t === 'cloudy') return w.timer < 0 ? 'clear' : 'rain'
          return 'cloudy'
        }
        // Alternate cloudy→rain vs cloudy→clear using cloudOffset as a coin flip
        const next = (() => {
          if (w.type === 'clear')  return 'cloudy' as WeatherType
          if (w.type === 'rain')   return 'cloudy' as WeatherType
          // cloudy: 50% go to rain, 50% go back to clear
          return (w.cloudOffset < 0.5 ? 'rain' : 'clear') as WeatherType
        })()
        const dur = next === 'clear' ? 40 + Math.random() * 20
                  : next === 'cloudy' ? 12 + Math.random() * 8
                  : 20 + Math.random() * 15
        set({ weatherState: { type: next, timer: dur, cloudOffset: newOffset, rainPhase: newRain } })
        void nextWeather  // suppress unused warning
      } else {
        set({ weatherState: { ...w, timer: newTimer, cloudOffset: newOffset, rainPhase: newRain } })
      }
    }

    // ── Travel tick ──────────────────────────────────────────────────────────
    if (state.gameMode === 'traveling' && state.travelTarget) {
      const newProgress = state.travelProgress + deltaSeconds / state.travelDuration
      // Advance playerMapPos.x in direction of travel
      const fromIdx = ZONE_ORDER.indexOf(state.currentZone)
      const toIdx   = ZONE_ORDER.indexOf(state.travelTarget)
      const direction = toIdx > fromIdx ? 1 : -1
      const newX = ((state.playerMapPos.x + direction * 64 * deltaSeconds / state.travelDuration) + 64) % 64
      if (newProgress >= 1) {
        const dest = state.travelTarget
        const destMap = state.zoneMaps[dest] ?? generateZoneMap(dest, mapSeed(state))
        const activeQuest = !state.bossesDefeated.includes(dest)
          ? makeZoneQuest(dest, state.playerFaction)
          : state.activeQuest
        resetCombatAccumulators()
        set({
          currentZone: dest, mobs: [], targetMobId: null, currentMob: null, mobRespawnTimer: 0,
          activeDoTs: [], gameMode: 'combat', travelTarget: null, travelProgress: 0,
          playerMapPos: { x: 32, y: 32 },
          zoneMaps: { ...state.zoneMaps, [dest]: destMap },
          activeQuest,
        })
      } else {
        set({ travelProgress: newProgress, playerMapPos: { x: newX, y: state.playerMapPos.y } })
      }
      return
    }

    // ── Gathering tick ───────────────────────────────────────────────────────
    // The harvest half of this branch is byte-for-byte the old behaviour: same
    // GATHER_SECONDS cadence, same +1 unit, same material. The additions are (a) a purity
    // ledger fed only by the optional strike meter, and (b) a loop instead of a single
    // decrement, so a large catch-up delta yields the harvests it earned instead of
    // silently dropping the surplus.
    if (state.gameMode === 'gathering') {
      // World drift — slow wander so map scrolls past player
      const gatherDriftAngle = state.totalPlayTime * 0.08
      const gatherDriftX = Math.cos(gatherDriftAngle) * 0.5 * deltaSeconds
      const gatherDriftY = Math.sin(gatherDriftAngle * 0.7) * 0.3 * deltaSeconds
      const gatherMapPos = driftMapPos(state, gatherDriftX, gatherDriftY)

      const matId: MaterialId = ZONE_MATERIALS[state.currentZone][state.playerClass]
      const standingNode = nodeAt(state, gatherMapPos)

      // Keep a session open on whatever node we're at. Opening one is free — it only
      // matters if the player strikes.
      let session = state.gatherSession
      const wantKey = standingNode ? `${standingNode.x},${standingNode.y}` : 'manual'
      if (!session || session.nodeKey !== wantKey) session = openGatherSession(state, standingNode)
      session = advanceGatherSession(session, deltaSeconds)

      let timer = state.gatheringTimer - deltaSeconds
      let mats = state.materials
      let purity = state.materialPurity
      let harvested = 0

      // Bounded so a pathological delta can't spin. 64 harvests = >5 minutes of catch-up.
      while (timer <= 0 && harvested < 64) {
        mats = { ...mats, [matId]: (mats[matId] ?? 0) + 1 }
        // Purity banked by this unit — 0 unless the player worked the meter.
        const earned = Math.min(session.purity, MAX_PURITY_PER_UNIT)
        if (earned > 0) purity = { ...purity, [matId]: (purity[matId] ?? 0) + earned }
        session = rearmGatherSession(state, session)
        timer += GATHER_SECONDS
        harvested++
      }

      if (harvested === 0) {
        set({ gatheringTimer: timer, playerMapPos: gatherMapPos, gatherSession: session })
        return
      }

      const stillNearNode = !!standingNode
      let nextGatherMode: GameMode = stillNearNode ? 'gathering' : 'combat'
      let autoRecipe: RecipeId | null = null
      let autoQuality: QualityTier | null = null

      // Auto-craft when leaving a resource node if materials are sufficient
      if (!stillNearNode) {
        const picked = pickAutoRecipe(state.playerClass, mats, purity)
        if (picked) {
          autoRecipe = picked.id
          autoQuality = recipeQuality(mats, purity, picked.inputs)
          nextGatherMode = 'crafting'
        }
      }

      set({
        gatheringTimer: timer,
        materials: mats,
        materialPurity: purity,
        gatherSession: stillNearNode ? session : null,
        playerMapPos: gatherMapPos,
        gameMode: nextGatherMode,
        activeRecipe: autoRecipe,
        craftQuality: autoQuality,
        craftingTimer: autoRecipe ? (RECIPES.find(r => r.id === autoRecipe)?.craftTime ?? 0) : 0,
      })
      return
    }

    // ── Crafting tick ────────────────────────────────────────────────────────
    if (state.gameMode === 'crafting' && state.activeRecipe) {
      const newTimer = state.craftingTimer - deltaSeconds
      if (newTimer <= 0) {
        const recipe = RECIPES.find(r => r.id === state.activeRecipe)
        if (recipe) {
          // The tier was locked when the craft started; re-derive only as a fallback for a
          // craft that predates the field (an in-flight save from an older build).
          const quality = state.craftQuality
            ?? recipeQuality(state.materials, state.materialPurity, recipe.inputs)
          set(resolveCraft(state, recipe, quality))
        } else {
          set({ activeRecipe: null, craftingTimer: 0, craftQuality: null })
        }
      } else {
        set({ craftingTimer: newTimer })
      }
      return
    }

    // ── In-town: no combat ───────────────────────────────────────────────────
    if (state.gameMode === 'in_town') return

    const newLogs: CombatLogEntry[] = []
    const newFns: FloatingNumber[]  = []
    let {
      stats, currentMob, persistedBoss, isAlive, respawnTimer, mobRespawnTimer,
      gold, xp, level, inventory, equipment, activeDoTs, activeBuffs,
      procState, castState, floatingNumbers, totalZoneKills, zoneKillCounts,
      bossesDefeated, unlockedZones, currentZone, skillCooldowns, talentAllocs,
    } = state

    // Clone
    stats          = { ...stats }
    equipment      = { ...equipment }
    inventory      = [...inventory]
    activeDoTs     = activeDoTs.map(d => ({ ...d }))
    activeBuffs    = activeBuffs.map(b => ({ ...b }))
    procState      = { ...procState }
    castState      = castState ? { ...castState } : null
    floatingNumbers = [...floatingNumbers]
    // Ability id whose channel completes this tick — its effects are applied via
    // finishCast() after the main set() (reuses the instant-cast resolution path).
    let castCompletedId: string | null = null
    totalZoneKills  = { ...totalZoneKills }
    zoneKillCounts  = { ...zoneKillCounts }
    bossesDefeated  = [...bossesDefeated]
    unlockedZones   = [...unlockedZones]
    skillCooldowns  = { ...skillCooldowns }

    const fx = compileTalentEffects(state.playerClass, talentAllocs)

    // ── Resolve the engaged target out of the population ─────────────────────
    // `mobs` is the source of truth; currentMob/mobMapOffset/activeDoTs are projections
    // of whichever one is targeted, rebuilt here and written back at the end of the tick.
    // Everything between those two points is the original single-target combat code,
    // untouched — only spawning, selection and death know about the collection.
    let mobs = state.mobs.map(m => ({ ...m, offset: { ...m.offset }, dots: m.dots.map(d => ({ ...d })) }))
    let targetMobId = state.targetMobId
    let target = mobs.find(m => m.id === targetMobId) ?? null
    if (!target) {
      // No valid choice standing — auto-play picks the nearest. The player's pick always
      // wins while it lives; this only fills the vacuum.
      target = nearestMob(mobs)
      targetMobId = target?.id ?? null
    }
    currentMob = target
    activeDoTs = target ? target.dots : []
    const mobOffset = target ? target.offset : { dx: 0, dy: 0 }

    // Is the mob close enough to fight? (arrives from map edge over ~5s)
    const rawMobDist = Math.sqrt(mobOffset.dx ** 2 + mobOffset.dy ** 2)
    const mobEngaged = !!target && rawMobDist < 1.5

    // ── Tick down skill cooldowns ───────────────────────────────────────────
    for (const id of Object.keys(skillCooldowns)) {
      skillCooldowns[id] = Math.max(0, skillCooldowns[id] - deltaSeconds)
    }

    // ── Tick down active buffs ──────────────────────────────────────────────
    activeBuffs = activeBuffs.filter(b => {
      b.durationRemaining -= deltaSeconds
      return b.durationRemaining > 0
    })

    // ── Tick down frozen state ──────────────────────────────────────────────
    if (procState.mobFrozen) {
      procState.mobFrozenTimer -= deltaSeconds
      if (procState.mobFrozenTimer <= 0) procState.mobFrozen = false
    }

    // ── Advance the player's spell cast ─────────────────────────────────────
    // Interrupt if the caster dies or the target is gone; otherwise fill the bar.
    // When it completes, mark the ability for finishCast() (applied after set()).
    if (castState) {
      if (!isAlive || !currentMob) {
        newLogs.push(log('ability_use', `${castState.name} interrupted.`, '#aa7766'))
        castState = null
      } else {
        castState.remaining -= deltaSeconds
        if (castState.remaining <= 0) {
          castCompletedId = castState.abilityId
          castState = null
        }
      }
    }

    // ── Player respawn ──────────────────────────────────────────────────────
    if (!isAlive) {
      respawnTimer = Math.max(0, respawnTimer - deltaSeconds)
      if (respawnTimer <= 0) {
        isAlive = true
        stats.currentHp = Math.floor(stats.maxHp * 0.5)
        procState = defaultProcState()
        activeDoTs = []
        newLogs.push(log('player_respawn', 'You rise from the grave...', '#aaaaff'))
        resetCombatAccumulators()
      }
      set({ stats, isAlive, respawnTimer, skillCooldowns, castState: null,
            combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX) })
      return
    }

    // ── Keep the zone populated ─────────────────────────────────────────────
    // Top the population up on the respawn timer rather than replacing a single slot.
    // A waiting boss takes the field alone: it resumes with its HP preserved and the
    // rest of the crowd clears out, so the climactic fight isn't a scrum.
    // A boss already on the field blocks further spawns; a BANKED boss (persistedBoss,
    // preserved when it killed the player) must still be allowed to retake the field,
    // even at full population — gating on it would deadlock the zone with no mob and no
    // spawn ever again.
    if (!isBossPresent(mobs) && (persistedBoss || mobs.length < MOB_POPULATION)) {
      mobRespawnTimer = Math.max(0, mobRespawnTimer - deltaSeconds)
      if (mobRespawnTimer <= 0) {
        const spawned = persistedBoss ?? spawnMob(currentZone, state)
        persistedBoss = null
        if (spawned) {
          if (spawned.isBoss) {
            mobs = [spawned]            // the lair empties for the boss
            targetMobId = spawned.id
            // Re-project immediately: currentMob may still point at a regular mob this
            // tick resolved before the boss cleared the field, and the write-back at the
            // end would otherwise resurrect it alongside the boss.
            currentMob = spawned
            activeDoTs = spawned.dots
            resetCombatAccumulators()
          } else {
            mobs.push(spawned)
          }
          if (fx.iceBarrierAbsorb > 0 && procState.iceBarrierHp <= 0) {
            procState.iceBarrierHp = fx.iceBarrierAbsorb
          }
          newLogs.push(log(
            'mob_death',
            `${spawned.isBoss ? '⚠ BOSS: ' : spawned.isElite ? '★ Elite: ' : ''}${spawned.name} appears!`,
            spawned.isBoss ? '#ff8000' : spawned.isElite ? '#a335ee' : '#cccccc'
          ))
          if (spawned.isBoss) get().triggerThought('boss_spawn', spawned.name)
        }
        mobRespawnTimer = MOB_RESPAWN_SECONDS
      }
      // Re-resolve: the population may have just gained the mob we should be fighting.
      if (!currentMob) {
        target = mobs.find(m => m.id === targetMobId) ?? nearestMob(mobs)
        targetMobId = target?.id ?? null
        currentMob = target
        activeDoTs = target ? target.dots : []
        if (target) resetCombatAccumulators()
      }
    }

    // Nothing to fight at all — hold here until the population refills.
    if (!currentMob) {
      set({ mobs, targetMobId, currentMob: null, mobMapOffset: { dx: 0, dy: 0 },
            persistedBoss, mobRespawnTimer, procState, skillCooldowns, castState,
            combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX) })
      return
    }

    // ── Process active DoTs ─────────────────────────────────────────────────
    const dotDamageThisTick: number[] = []
    const nightfallChance = fx.nightfallProcChance
    let nightfallProc = false

    activeDoTs = activeDoTs.filter(dot => {
      dot.tickAccum += deltaSeconds
      if (dot.tickAccum >= dot.tickIntervalSeconds) {
        dot.tickAccum -= dot.tickIntervalSeconds
        dot.ticksRemaining--
        dotDamageThisTick.push(dot.tickDamage)
        if (nightfallChance > 0 && Math.random() < nightfallChance) nightfallProc = true
      }
      return dot.ticksRemaining > 0
    })

    if (dotDamageThisTick.length > 0 && currentMob) {
      const totalDotDmg = dotDamageThisTick.reduce((a, b) => a + b, 0)
      currentMob = { ...currentMob, currentHp: currentMob.currentHp - totalDotDmg }
      if (state.settings.showDamageNumbers) {
        newFns.push(fn(totalDotDmg, false, false, true, '#aa88ff'))
      }
      newLogs.push(log('dot_tick', `Affliction deals ${totalDotDmg} damage`, '#aa88ff'))
    }

    // Gathering Dark Umbral Bolt proc
    if (nightfallProc && currentMob) {
      const boltDmg = makeShadowBoltHit(stats.weaponDps, stats.attackSpeedSeconds, 2.5)
      currentMob = { ...currentMob, currentHp: currentMob.currentHp - boltDmg }
      newFns.push(fn(boltDmg, true, false, false, '#cc44ff'))
      newLogs.push(log('proc', `⚡ Gathering Dark! Umbral Bolt hits for ${boltDmg}`, '#cc44ff'))
    }

    // ── Tithe of Wounds ──────────────────────────────────────────────────────
    if (fx.siphonLifeHpPerTick > 0) {
      siphonLifeAccum += deltaSeconds
      if (siphonLifeAccum >= 3) {
        siphonLifeAccum -= 3
        stats.currentHp = Math.min(stats.maxHp, stats.currentHp + fx.siphonLifeHpPerTick)
      }
    }

    // ── Player attacks mob ───────────────────────────────────────────────────
    if (mobEngaged) playerAttackAccum += deltaSeconds
    else playerAttackAccum = 0  // reset during approach so first strike lands on arrival
    if (mobEngaged && playerAttackAccum >= stats.attackSpeedSeconds) {
      playerAttackAccum -= stats.attackSpeedSeconds

      const result = resolvePlayerAttack(
        stats, state.playerClass, talentAllocs, procState, activeBuffs
      )

      // Consume crit guarantee stack
      const cgBuff = activeBuffs.find(b => b.type === 'crit_guarantee' && (b.stacks ?? 0) > 0)
      if (cgBuff && result.isCrit) cgBuff.stacks = (cgBuff.stacks ?? 1) - 1

      // Consume next-hit multiplier
      const nhBuff = activeBuffs.find(b => b.type === 'next_hit_multiplier' && (b.stacks ?? 0) > 0)
      if (nhBuff) nhBuff.stacks = (nhBuff.stacks ?? 1) - 1

      // Consume lifesteal buff
      const lsBuff = activeBuffs.find(b => b.type === 'lifesteal_buff' && result.isCrit)
      if (lsBuff && (lsBuff.stacks ?? 0) > 0) {
        lsBuff.stacks = (lsBuff.stacks ?? 1) - 1
        stats.currentHp = Math.min(stats.maxHp, stats.currentHp + Math.round(result.damage * lsBuff.value))
      }

      currentMob = { ...currentMob!, currentHp: currentMob!.currentHp - result.damage }

      if (state.settings.showDamageNumbers) {
        newFns.push(fn(result.damage, result.isCrit, false, false, result.isCrit ? '#ffcc00' : '#88aaff'))
      }
      newLogs.push(log(
        result.isCrit ? 'player_crit' : 'player_attack',
        `You hit ${currentMob!.name} for ${result.damage}${result.isCrit ? ' (CRIT!)' : ''}`,
        result.isCrit ? '#ffcc00' : '#88aaff',
      ))

      // Apply new DoTs (deduplicate by sourceType — refresh existing)
      for (const newDot of result.triggeredDoTs) {
        const existing = activeDoTs.findIndex(d => d.sourceType === newDot.sourceType)
        if (existing >= 0) activeDoTs[existing] = newDot
        else activeDoTs.push(newDot)
      }

      // Extra hit from sword spec
      if (result.extraHit) {
        const xtraHit = Math.round(stats.weaponDps * stats.attackSpeedSeconds * 0.7)
        currentMob = { ...currentMob!, currentHp: currentMob!.currentHp - xtraHit }
        newFns.push(fn(xtraHit, false, false, false, '#aabbff'))
        newLogs.push(log('proc', `⚡ Turning Steel! Extra strike for ${xtraHit}`, '#aabbff'))
      }

      // Written in Blood combo points
      if (result.sealFatePoint) {
        procState.comboPoints++
        if (procState.comboPoints >= 5) {
          procState.comboPoints = 0
          const finisherDmg = Math.round(stats.weaponDps * stats.attackSpeedSeconds * 3)
          currentMob = { ...currentMob!, currentHp: currentMob!.currentHp - finisherDmg }
          newFns.push(fn(finisherDmg, true, false, false, '#ff8800'))
          newLogs.push(log('proc', `🎴 Sever! ${finisherDmg} damage!`, '#ff8800'))
        }
      }

      // Creeping Freeze proc
      if (fx.frostbiteChance > 0 && !procState.mobFrozen && Math.random() < fx.frostbiteChance) {
        procState.mobFrozen = true
        procState.mobFrozenTimer = 4 + (talentAllocs['frost_permafrost'] ?? 0)
        newLogs.push(log('proc', `🥶 Creeping Freeze! Enemy frozen!`, '#66ccff'))
      }

      // Deepening Cold stacks
      if (fx.winterChillEnabled) {
        procState.winterChillStacks = Math.min(5, procState.winterChillStacks + 1)
      }

      // Reset remorseless
      procState.remorselessActive = false

      // ── Mob dies ────────────────────────────────────────────────────────────
      if (currentMob!.currentHp <= 0) {
        const deadMob = currentMob!
        const loot = rollLoot(deadMob, level, stats.goldFindBonus)
        gold += loot.gold

        newLogs.push(log('mob_death', `${deadMob.name} dies!`, '#ff4444'))
        newLogs.push(log('loot_gold',  `+${loot.gold} gold`,   '#ffd700'))

        // Thought: boss kill, elite kill, or regular kill (10% chance to avoid spam)
        if (deadMob.isBoss) {
          get().triggerThought('boss_kill', deadMob.name)
        } else if (deadMob.isElite) {
          get().triggerThought('elite_kill', deadMob.name)
        } else if (Math.random() < 0.15) {
          get().triggerThought('mob_kill')
        }

        xp += deadMob.xpReward
        while (xp >= xpForLevel(level)) {
          xp -= xpForLevel(level)
          level++
          const racialPassive = RACE_DEFINITIONS[state.playerRace]?.racialPassive ?? {}
          const newStats = compileStats(state.playerClass, level, equipment, talentAllocs, racialPassive)
          stats = { ...newStats, currentHp: Math.min(newStats.maxHp, stats.currentHp + 20) }
          newLogs.push(log('level_up', `★ Level Up! Now level ${level}!`, '#ffd700'))
          // Gain a talent point
          set(s => ({ talentPoints: s.talentPoints + 1 }))
          get().triggerThought('level_up', `level ${level}`)
          // Level-based unlock: only zones whose prerequisite boss is already down.
          for (const rawId of ZONE_ORDER) {
            const zoneId = rawId as ZoneId
            if (unlockedZones.includes(zoneId)) continue
            if (canEnterZone(zoneId, level, bossesDefeated)) {
              unlockedZones.push(zoneId)
              newLogs.push(log('zone_change', `New zone unlocked: ${ZONES[zoneId].name}!`, '#00ff88'))
              if (!state.zoneMaps[zoneId]) {
                set(s => ({ zoneMaps: { ...s.zoneMaps, [zoneId]: generateZoneMap(zoneId, mapSeed(s)) } }))
              }
            }
          }
        }

        const killKey = `${currentZone}:${deadMob.templateId}`
        zoneKillCounts[killKey] = (zoneKillCounts[killKey] ?? 0) + 1
        totalZoneKills[currentZone] = (totalZoneKills[currentZone] ?? 0) + 1

        if (deadMob.isBoss && !bossesDefeated.includes(currentZone)) {
          bossesDefeated.push(currentZone)
          const zone = ZONES[currentZone]
          const nextZoneId = zone.nextZone

          // Update the active quest for this zone to completed.
          let activeQuest: ZoneQuest | null = state.activeQuest
          if (activeQuest?.zoneId === currentZone) {
            activeQuest = { ...activeQuest, completed: true }
          }

          if (nextZoneId) {
            const canEnterNext = canEnterZone(nextZoneId, level, bossesDefeated)
            if (canEnterNext && !unlockedZones.includes(nextZoneId)) {
              unlockedZones.push(nextZoneId)
              newLogs.push(log('zone_change', `★ Boss slain! ${ZONES[nextZoneId].name} unlocked!`, '#ff8000'))
              if (!state.zoneMaps[nextZoneId]) {
                set(s => ({ zoneMaps: { ...s.zoneMaps, [nextZoneId]: generateZoneMap(nextZoneId, mapSeed(s)) } }))
              }
            } else if (!canEnterNext) {
              newLogs.push(log('zone_change', `${ZONES[nextZoneId].name} will unlock at level ${ZONES[nextZoneId].levelRange[0]}`, '#ff8800'))
            }
          } else {
            // Final zone (the_maw_eternal) — circuit increment, loop back to start.
            // Drop the cached maps: mapSeed folds in the circuit, so the next lap through
            // the world is generated fresh instead of replaying the same geography.
            set(s => ({ zoneCircuit: s.zoneCircuit + 1, zoneMaps: {} }))
            bossesDefeated.length = 0  // reset all boss kills for the new circuit
            currentZone = 'sunhollow_meadows'
            activeQuest = makeZoneQuest('sunhollow_meadows', state.playerFaction)
            newLogs.push(log('zone_change', `The world resets. Stronger now. Circuit ${(state.zoneCircuit ?? 0) + 1} begins.`, '#cc88ff'))
          }

          // Apply the completed quest to the local copy so it is persisted in the tick set().
          state.activeQuest = activeQuest
        }

        if (loot.item) {
          const empty = inventory.findIndex(s => s === null)
          if (empty >= 0) {
            inventory[empty] = loot.item
            newLogs.push(log('loot_item', `Looted: ${loot.item.name}`, rarityColor(loot.item.rarity)))
          } else {
            newLogs.push(log('loot_item', `Bag full! Lost: ${loot.item.name}`, '#ff6666'))
          }
        }

        if (fx.remorselessEnabled) procState.remorselessActive = true
        procState.winterChillStacks = 0
        procState.mobFrozen = false
        procState.iceBarrierHp = 0
        // Drop the corpse out of the population and release the player's commitment —
        // "until the enemy is killed" ends here. The next tick auto-picks the nearest
        // survivor unless the player names another.
        mobs = mobs.filter(m => m.id !== currentMob!.id)
        targetMobId = null
        currentMob = null
        activeDoTs  = []
        mobRespawnTimer = MOB_RESPAWN_SECONDS
        resetCombatAccumulators()
      }
    }

    // ── Mob attacks player ───────────────────────────────────────────────────
    if (currentMob && !procState.mobFrozen && mobEngaged) {
      mobAttackAccum += deltaSeconds
      if (mobAttackAccum >= currentMob.attackSpeedSeconds) {
        mobAttackAccum -= currentMob.attackSpeedSeconds
        let mobDmg = resolveMobAttack(currentMob, stats.armor, fx.mobAttackSpeedFactor)

        // Winterward absorb
        if (procState.iceBarrierHp > 0) {
          const absorbed = Math.min(procState.iceBarrierHp, mobDmg)
          procState.iceBarrierHp -= absorbed
          mobDmg -= absorbed
        }

        if (mobDmg > 0) {
          stats.currentHp = Math.max(0, stats.currentHp - mobDmg)
          newFns.push(fn(mobDmg, false, true, false))
          newLogs.push(log('mob_attack', `${currentMob.name} hits you for ${mobDmg}`, '#ff8888'))

          // Cast pushback: a hit while channelling delays the cast (WoW-style),
          // capped per-cast so a fast mob can't lock you out forever.
          if (castState && castState.pushback < CAST_PUSHBACK_CAP) {
            const pb = Math.min(CAST_PUSHBACK_PER_HIT, CAST_PUSHBACK_CAP - castState.pushback)
            castState.pushback += pb
            castState.remaining = Math.min(castState.total, castState.remaining + pb)
          }

          // Glacial Tomb: immune when near death
          if (fx.iceBlockEnabled && !procState.iceBlockUsed && stats.currentHp / stats.maxHp < 0.15) {
            procState.iceBlockUsed = true
            stats.currentHp = Math.ceil(stats.maxHp * 0.15)
            const iceBlockBuff: ActiveBuff = {
              id: `buff_ice_block_${Date.now()}`,
              label: 'Glacial Tomb',
              icon: '🧊',
              color: '#6699ff',
              type: 'armor_buff',
              value: 999,
              durationRemaining: 5,
            }
            activeBuffs.push(iceBlockBuff)
            newLogs.push(log('proc', '🧊 Glacial Tomb! Immune for 5s!', '#66ccff'))
          }
        }

        // Near-death thought (10-20% HP, once per encounter)
        if (mobDmg > 0 && stats.currentHp / stats.maxHp < 0.2 && stats.currentHp > 0) {
          get().triggerThought('near_death', `${Math.round(stats.currentHp / stats.maxHp * 100)}% HP`)
        }

        if (stats.currentHp <= 0) {
          // Check ice block
          const iceBuff = activeBuffs.find(b => b.label === 'Glacial Tomb')
          if (!iceBuff) {
            isAlive = false
            respawnTimer = RESPAWN_TIMER_SECONDS
            stats.currentHp = 0
            castState = null   // death interrupts any channel
            if (currentMob?.isBoss) {
              persistedBoss = currentMob
            }
            // Dying scatters the encounter: the crowd disperses and the player starts the
            // next one fresh, rather than respawning already surrounded.
            mobs = []
            targetMobId = null
            currentMob = null
            activeDoTs = []
            newLogs.push(log('player_death', `You have been slain! Respawning in ${RESPAWN_TIMER_SECONDS}s...`, '#ff4444'))
            get().triggerThought('player_death')
            resetCombatAccumulators()
          }
        }
      }
    }

    // ── Auto-gather: if drifting near a resource node with no active combat ──
    let nextGameMode: GameMode = state.gameMode as GameMode
    let enteredNode: ReturnType<typeof nodeAt> = null
    if (nextGameMode === 'combat' && !currentMob) {
      enteredNode = nodeAt(state, state.playerMapPos)
      if (enteredNode) nextGameMode = 'gathering'
    }

    // ── World drift (combat) — slow wander so map scrolls past player ────────
    const driftAngle = state.totalPlayTime * 0.08
    const driftX = Math.cos(driftAngle) * 0.5 * deltaSeconds
    const driftY = Math.sin(driftAngle * 0.7) * 0.3 * deltaSeconds
    const playerMapPos = driftMapPos(state, driftX, driftY)

    // ── Mob movement ──────────────────────────────────────────────────────────
    // Only the ENGAGED target closes; the rest hold station so the player has a standing
    // choice of enemies rather than a queue that walks into them one at a time.
    let mobMapOffset = { dx: 0, dy: 0 }
    if (currentMob) {
      const off = currentMob.offset
      const dist = Math.sqrt(off.dx * off.dx + off.dy * off.dy)
      if (dist !== 0) {
        const speed = 2.5  // tiles per second
        if (dist < 0.3) currentMob.offset = { dx: 0, dy: 0 }
        else {
          const factor = Math.max(0, 1 - speed * deltaSeconds / dist)
          currentMob.offset = { dx: off.dx * factor, dy: off.dy * factor }
        }
      }
      mobMapOffset = currentMob.offset
    }

    // ── Write the projections back into the population ────────────────────────
    // currentMob/activeDoTs were handed to the (single-target) combat code above; fold
    // the results back so `mobs` stays authoritative.
    if (currentMob) {
      currentMob.dots = activeDoTs
      const i = mobs.findIndex(m => m.id === currentMob!.id)
      // Update in place only. Absence means it was deliberately removed (slain, or a boss
      // cleared the field), so re-adding it here would undo that.
      if (i >= 0) { mobs[i] = currentMob; targetMobId = currentMob.id }
      else { currentMob = null; targetMobId = null }
    }

    // Prune old floating numbers
    const now = Date.now()
    const allFns = [...floatingNumbers.filter(f => now - f.createdAt < 1400), ...newFns]

    set({
      mobs, targetMobId,
      stats, gold, xp, level, currentMob, persistedBoss, isAlive, respawnTimer, mobRespawnTimer,
      inventory, equipment, activeDoTs, activeBuffs, procState, castState, skillCooldowns,
      floatingNumbers: allFns,
      totalZoneKills, zoneKillCounts, bossesDefeated, unlockedZones, currentZone,
      totalPlayTime: state.totalPlayTime + deltaSeconds,
      combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX),
      mobMapOffset,
      playerMapPos,
      gameMode: nextGameMode,
      gatheringTimer: nextGameMode === 'gathering' ? GATHER_SECONDS : state.gatheringTimer,
      gatherSession: nextGameMode === 'gathering'
        ? openGatherSession(state, enteredNode)
        : state.gatherSession,
      activeQuest: state.activeQuest,
      completedQuestIds: state.completedQuestIds,
    })

    // A channel completed this tick → resolve its effects now (own get()/set(),
    // reads the just-committed state; reuses the instant-cast path + cooldown).
    if (castCompletedId) get().finishCast(castCompletedId)
  },

  // ── Equipment ────────────────────────────────────────────────────────────────
  equipItem: (i) => {
    const s = get()
    const item = s.inventory[i]
    if (!item) return
    const equipment = { ...s.equipment }
    const inventory = [...s.inventory]
    equipment[item.slot] = item
    inventory[i] = s.equipment[item.slot]
    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const stats = compileStats(s.playerClass, s.level, equipment, s.talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ equipment, inventory, stats })
  },

  unequipItem: (slot) => {
    const s = get()
    const item = s.equipment[slot]
    if (!item) return
    const empty = s.inventory.findIndex(x => x === null)
    if (empty < 0) return
    const equipment = { ...s.equipment, [slot]: null }
    const inventory = [...s.inventory]
    inventory[empty] = item
    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const stats = compileStats(s.playerClass, s.level, equipment, s.talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ equipment, inventory, stats })
  },

  sellItem: (i) => {
    const s = get()
    const item = s.inventory[i]
    if (!item) return
    const inventory = [...s.inventory]
    inventory[i] = null
    set({ inventory, gold: s.gold + item.vendorValue })
  },

  sellAllCommon: () => {
    const s = get()
    let gained = 0
    const inventory = s.inventory.map(item => {
      if (item?.rarity === 'common') { gained += item.vendorValue; return null }
      return item
    })
    set({ inventory, gold: s.gold + gained })
  },

  // ── Zone ─────────────────────────────────────────────────────────────────────
  selectZone: (zoneId) => {
    const s = get()
    if (!canEnterZone(zoneId, s.level, s.bossesDefeated)) return
    resetCombatAccumulators()
    const activeQuest = !s.bossesDefeated.includes(zoneId)
      ? makeZoneQuest(zoneId, s.playerFaction)
      : s.activeQuest
    set({ currentZone: zoneId, mobs: [], targetMobId: null, currentMob: null, mobRespawnTimer: 0, activeDoTs: [], activeQuest })
  },

  // Dev-only override: jump to ANY zone (unlock + generate its map if needed), so the
  // biome can be inspected up close. Not part of normal progression.
  devJumpZone: (zoneId) => {
    const s = get()
    const unlockedZones = s.unlockedZones.includes(zoneId) ? s.unlockedZones : [...s.unlockedZones, zoneId]
    const zoneMaps = s.zoneMaps[zoneId] ? s.zoneMaps : { ...s.zoneMaps, [zoneId]: generateZoneMap(zoneId, mapSeed(s)) }
    resetCombatAccumulators()
    set({
      unlockedZones, zoneMaps, currentZone: zoneId,
      gameMode: 'combat', currentTown: null, mobs: [], targetMobId: null, currentMob: null,
      mobRespawnTimer: 0, activeDoTs: [], travelTarget: null, travelProgress: 0,
      playerMapPos: { x: 32, y: 32 },
    })
  },

  // ── Talents ──────────────────────────────────────────────────────────────────
  allocateTalent: (talentId) => {
    const s = get()
    if (s.talentPoints <= 0) return
    const classDef = CLASS_DEFINITIONS[s.playerClass]
    const node = classDef.talents.find(t => t.id === talentId)
    if (!node) return
    const current = s.talentAllocs[talentId] ?? 0
    if (current >= node.maxRanks) return

    // Check points-in-tree requirement
    const totalSpent = Object.values(s.talentAllocs).reduce((a, b) => a + b, 0)
    const rowCost = (node.row - 1) * 5  // need 5 pts per row to unlock
    if (totalSpent < rowCost) return

    // Check hard prerequisite
    if (node.requires) {
      const prereqNode = classDef.talents.find(t => t.id === node.requires)
      if (!prereqNode) return
      if ((s.talentAllocs[node.requires] ?? 0) < prereqNode.maxRanks) return
    }

    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const talentAllocs = { ...s.talentAllocs, [talentId]: current + 1 }
    const stats = compileStats(s.playerClass, s.level, s.equipment, talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs, talentPoints: s.talentPoints - 1, stats })
  },

  deallocateTalent: (talentId) => {
    const s = get()
    const current = s.talentAllocs[talentId] ?? 0
    if (current <= 0) return
    // Don't deallocate if another talent requires this one maxed
    const classDef = CLASS_DEFINITIONS[s.playerClass]
    for (const node of classDef.talents) {
      if (node.requires === talentId) {
        const reqNode = classDef.talents.find(t => t.id === talentId)!
        if (current <= reqNode.maxRanks && (s.talentAllocs[node.id] ?? 0) > 0) return
      }
    }
    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const talentAllocs = { ...s.talentAllocs, [talentId]: current - 1 }
    const stats = compileStats(s.playerClass, s.level, s.equipment, talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs, talentPoints: s.talentPoints + 1, stats })
  },

  resetTalents: () => {
    const s = get()
    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const totalSpent = Object.values(s.talentAllocs).reduce((a, b) => a + b, 0)
    const stats = compileStats(s.playerClass, s.level, s.equipment, {}, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs: {}, talentPoints: s.talentPoints + totalSpent, stats })
  },

  // ── Skill Bar ────────────────────────────────────────────────────────────────
  activateAbility: (abilityId) => {
    const s = get()
    if (!s.isAlive) return
    if (s.castState) return                       // one cast at a time — no spam/queue
    if ((s.skillCooldowns[abilityId] ?? 0) > 0) return
    const ability = ACTIVE_ABILITIES.find(a => a.id === abilityId)
    if (!ability || !ability.classes.includes(s.playerClass)) return
    // Allow self-target abilities (hot/heals) even without a mob; block others
    if (!s.currentMob && !ability.effects.some(e => e.type === 'hot')) return

    // Timed ability → begin a channel. The effect fires in tick when the cast bar
    // fills; cooldown starts on completion so an interrupt doesn't burn it.
    const castTime = ability.castTimeSeconds ?? 0
    if (castTime > 0) {
      set({ castState: { abilityId, name: ability.name, icon: ability.icon, total: castTime, remaining: castTime, pushback: 0 } })
      return
    }

    // Instant ability → resolve now.
    get().finishCast(abilityId)
  },

  // Apply an ability's effects and start its cooldown. Called directly for instant
  // abilities, and by tick when a channelled cast completes.
  finishCast: (abilityId) => {
    const s = get()
    const ability = ACTIVE_ABILITIES.find(a => a.id === abilityId)
    if (!ability) return

    const newFns: FloatingNumber[] = []
    const newLogs: CombatLogEntry[] = []
    const newBuffs = [...s.activeBuffs]
    let stats = { ...s.stats }
    let currentMob = s.currentMob ? { ...s.currentMob } : null
    let procState = { ...s.procState }

    for (const effect of ability.effects) {
      switch (effect.type) {
        case 'freeze_mob':
          procState.mobFrozen = true
          procState.mobFrozenTimer = effect.durationSeconds ?? 4
          break
        case 'shadow_bolt':
          if (currentMob) {
            const dmg = makeShadowBoltHit(stats.weaponDps, stats.attackSpeedSeconds, effect.value)
            currentMob.currentHp -= dmg
            newFns.push(fn(dmg, true, false, false, '#cc44ff'))
            newLogs.push(log('ability_use', `☠ Umbral Bolt strikes for ${dmg}!`, '#cc44ff'))
          }
          break
        case 'hot':
          // Heal over time — apply as buff
          newBuffs.push(makeAbilityBuff(abilityId, effect, ability.name, ability.icon))
          newLogs.push(log('ability_use', `💚 ${ability.name} — healing over time...`, '#44ff88'))
          break
        default:
          newBuffs.push(makeAbilityBuff(abilityId, effect, ability.name, ability.icon))
          newLogs.push(log('ability_use', `✨ ${ability.name} activated!`, '#ffd700'))
      }
    }

    // Process hot immediately in tick, but set it up here
    // Handle next_hit_multiplier as well
    const skillCooldowns = { ...s.skillCooldowns, [abilityId]: ability.cooldownSeconds }

    // If mob died from shadow bolt
    if (currentMob && currentMob.currentHp <= 0) {
      // Minimal kill handling — full path is in tick; just clear mob
      newLogs.push(log('mob_death', `${currentMob.name} dies to Umbral Bolt!`, '#ff4444'))
      const loot = rollLoot(currentMob, s.level, stats.goldFindBonus)
      const slainId = currentMob.id
      set(prev => ({
        // Only the slain mob leaves — the rest of the crowd is still standing there.
        mobs: prev.mobs.filter(m => m.id !== slainId),
        targetMobId: null, currentMob: null, mobRespawnTimer: 3,
        activeDoTs: [], procState,
        gold: prev.gold + loot.gold,
        skillCooldowns,
        activeBuffs: newBuffs,
        floatingNumbers: [...prev.floatingNumbers, ...newFns],
        combatLog: [...newLogs, ...prev.combatLog].slice(0, LOG_MAX),
      }))
      return
    }

    set(prev => ({
      // Fold the damage back into the population, else the next tick re-projects from
      // `mobs` and the hit is silently undone.
      mobs: currentMob ? prev.mobs.map(m => (m.id === currentMob!.id ? currentMob! : m)) : prev.mobs,
      currentMob,
      procState,
      skillCooldowns,
      activeBuffs: newBuffs,
      floatingNumbers: [...prev.floatingNumbers, ...newFns],
      combatLog: [...newLogs, ...prev.combatLog].slice(0, LOG_MAX),
    }))
  },

  respawnNow: () => {
    const s = get()
    const stats = { ...s.stats, currentHp: Math.floor(s.stats.maxHp * 0.3) }
    set({ isAlive: true, respawnTimer: 0, stats, procState: defaultProcState() })
    resetCombatAccumulators()
  },

  dismissFloatingNumber: (id) => {
    set(s => ({ floatingNumbers: s.floatingNumbers.filter(fn => fn.id !== id) }))
  },

  // ── Thought system ────────────────────────────────────────────────────────────
  triggerThought: (event, extra) => {
    const s = get()
    const now = Date.now()
    const THOUGHT_COOLDOWN_MS = 18_000
    const THOUGHT_DURATION_MS = 5_000

    // Don't fire if: no name gen done, thought still visible, or cooldown active
    if (s.nameGenStatus !== 'done') return
    if (now < s.thoughtExpiresAt) return
    if (now - s.lastThoughtAt < THOUGHT_COOLDOWN_MS) return

    // Optimistically mark as triggered to prevent duplicate calls
    set({ lastThoughtAt: now })

    generateThought(
      s.playerName || 'The Wanderer',
      s.playerClass,
      s.characterTraits,
      event,
      extra,
    ).then(thought => {
      set({ currentThought: thought, thoughtExpiresAt: Date.now() + THOUGHT_DURATION_MS })
      // Auto-clear after duration
      setTimeout(() => {
        set(cur => cur.currentThought === thought ? { currentThought: null } : {})
      }, THOUGHT_DURATION_MS + 400)
    }).catch(() => { /* silent fail */ })
  },

  // ── Travel ────────────────────────────────────────────────────────────────────
  beginTravel: (toZone) => {
    const s = get()
    if (!canEnterZone(toZone, s.level, s.bossesDefeated)) return
    if (toZone === s.currentZone) return
    const fromIdx = ZONE_ORDER.indexOf(s.currentZone)
    const toIdx   = ZONE_ORDER.indexOf(toZone)
    const dist    = Math.abs(fromIdx - toIdx)
    const dur     = dist * 8  // 8s per zone step
    // Clear the mob offset too: the travel tick returns before the approach lerp, so a
    // leftover engagement distance would sit stale for the whole journey.
    set({ gameMode: 'traveling', travelTarget: toZone, travelProgress: 0, travelDuration: dur,
          mobs: [], targetMobId: null, currentMob: null, activeDoTs: [], activeBuffs: [], mobRespawnTimer: 0,
          mobMapOffset: { dx: 0, dy: 0 } })
    resetCombatAccumulators()
  },

  cancelTravel: () => {
    set({ gameMode: 'combat', travelTarget: null, travelProgress: 0 })
    resetCombatAccumulators()
  },

  // Cycle the world-scene zoom: 0 (most out, default) → 1 → 2 (in) → 0. Persisted as a
  // global UI pref (writeZoomPref); DimetricWorldScene maps the step to a render scale.
  cycleZoom: () => {
    const next = (get().zoomLevel + 1) % ZOOM_STEPS
    writeZoomPref(next)
    set({ zoomLevel: next })
  },

  setMode: (mode) => {
    const s = get()
    if (s.gameMode === 'traveling') return
    if (mode === 'gathering') {
      set({
        gameMode: 'gathering', gatheringTimer: GATHER_SECONDS,
        gatherSession: openGatherSession(s, nodeAt(s, s.playerMapPos)),
        mobs: [], targetMobId: null, currentMob: null, activeDoTs: [], mobRespawnTimer: 0,
      })
      resetCombatAccumulators()
    } else if (mode === 'combat') {
      set({ gameMode: 'combat', gatherSession: null, mobRespawnTimer: 0 })
      resetCombatAccumulators()
    } else if (mode === 'crafting') {
      set({ gameMode: 'crafting', gatherSession: null, mobs: [], targetMobId: null, currentMob: null, activeDoTs: [], mobRespawnTimer: 0 })
      resetCombatAccumulators()
    }
  },

  startCrafting: (recipeId) => {
    const s = get()
    const recipe = RECIPES.find(r => r.id === recipeId)
    if (!recipe || recipe.classFor !== s.playerClass) return
    if (!hasInputs(s.materials, recipe)) return
    // Lock the tier in now so the panel can promise what it will produce; the inputs are
    // still consumed on completion, exactly as before.
    set({
      activeRecipe: recipeId,
      craftingTimer: recipe.craftTime,
      craftQuality: recipeQuality(s.materials, s.materialPurity, recipe.inputs),
    })
  },

  /**
   * The player struck the vein. This is the ONLY interactive surface of the whole system,
   * and it can do exactly one thing: bank purity. It never touches `gatheringTimer`,
   * `materials`, or the mode — so no amount of striking (or not striking) changes how
   * fast or how much the hero gathers, only how good it is.
   */
  strikeNode: () => {
    const s = get()
    if (s.gameMode !== 'gathering') return
    const session = s.gatherSession
    if (!session) return
    // Swallowed during miss-recovery: mashing costs the tap's opportunity rather than
    // being merely unrewarded, which is what makes timing strictly better than spam.
    if (session.lockout > 0 || session.strikesLeft <= 0) return

    const out = resolveStrike(
      session.cursor, session.bandCenter, session.bandHalfWidth, session.streak, session.richness,
    )
    set({
      gatherSession: {
        ...session,
        streak: out.streak,
        strikesLeft: session.strikesLeft - 1,
        lockout: out.result === 'miss' ? STRIKE_LOCKOUT_SECONDS : 0,
        purity: Math.min(MAX_PURITY_PER_UNIT, session.purity + out.purity),
        lastResult: out.result,
        lastResultAt: Date.now(),
      },
    })
  },

  dismissCraftResult: () => {
    if (get().lastCraft) set({ lastCraft: null })
  },

  // ── Towns ─────────────────────────────────────────────────────────────────────
  enterTown: (townId) => {
    resetCombatAccumulators()
    set({
      gameMode: 'in_town',
      currentTown: townId,
      mobs: [], targetMobId: null, currentMob: null,
      mobRespawnTimer: 0,
      activeDoTs: [],
    })
  },

  leaveTown: () => {
    resetCombatAccumulators()
    set({ gameMode: 'combat', currentTown: null, mobRespawnTimer: 0 })
  },

  restInTown: () => {
    const s = get()
    if (!s.currentTown) return
    const town = TOWNS[s.currentTown]
    if (!town || !town.services.includes('rest')) return
    const stats = { ...s.stats, currentHp: s.stats.maxHp }
    set({
      stats,
      combatLog: [
        { id: `rest_${Date.now()}`, timestamp: Date.now(), type: 'proc' as const, message: 'You rest and recover fully.', color: '#44ff88' },
        ...s.combatLog,
      ].slice(0, 150),
    })
  },

  // ── Quest rewards ─────────────────────────────────────────────────────────────
  claimQuestReward: (questId) => {
    const s = get()
    const quest = s.activeQuest
    if (!quest || quest.id !== questId || !quest.completed || quest.claimed) return
    // Gate on canEnterZone, the same predicate beginTravel uses. Testing the stored
    // `unlockedZones` array instead let the two disagree: the array is only appended on
    // boss death when the level requirement already happened to be met, so a player who
    // out-killed their level saw the button do nothing at all. The toast also hides the
    // button in that case now — this keeps the store honest either way.
    const completedQuestIds = [...s.completedQuestIds, questId]
    const canGo = !!quest.rewardZoneId && canEnterZone(quest.rewardZoneId, s.level, s.bossesDefeated)
    set({ activeQuest: { ...quest, claimed: true }, completedQuestIds })
    if (canGo) get().beginTravel(quest.rewardZoneId!)
  },

  /**
   * The player walked their hero into a target they chose, so join the fight now instead
   * of waiting out the scripted approach. Collapsing the offset is all that is needed —
   * the tick derives engagement from it, so combat starts through the normal path with
   * no special-cased "manual attack" branch.
   */
  /**
   * The player named the enemy they want. Their pick holds until it dies (the tick only
   * auto-selects when `targetMobId` resolves to nothing), so auto-play can never pull
   * them off a chosen fight. Switching mid-fight is allowed and simply re-projects:
   * DoTs live on each mob, so the old target keeps its bleeds rather than donating them.
   */
  setTarget: (mobId) => {
    const s = get()
    const mob = s.mobs.find(m => m.id === mobId)
    if (!mob || !s.isAlive || s.gameMode !== 'combat') return
    if (s.targetMobId === mobId) return
    set({ targetMobId: mobId, currentMob: mob, activeDoTs: mob.dots, mobMapOffset: mob.offset })
    resetCombatAccumulators()
  },

  engageTarget: () => {
    const s = get()
    const mob = s.currentMob
    if (!mob || s.gameMode !== 'combat' || !s.isAlive) return
    if (mob.offset.dx === 0 && mob.offset.dy === 0) return
    // Collapse the target's own approach, and fold it back into the population so the
    // next tick's projection sees the closed gap.
    const closed = { ...mob, offset: { dx: 0, dy: 0 } }
    set({
      mobs: s.mobs.map(m => (m.id === closed.id ? closed : m)),
      currentMob: closed,
      mobMapOffset: closed.offset,
    })
  },

  dismissQuestReward: (questId) => {
    const s = get()
    const quest = s.activeQuest
    if (!quest || quest.id !== questId || !quest.completed || quest.claimed) return
    set({ activeQuest: { ...quest, claimed: true }, completedQuestIds: [...s.completedQuestIds, questId] })
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────
export function rarityColor(rarity: string): string {
  const map: Record<string, string> = {
    common: '#9d9d9d', uncommon: '#1eff00', rare: '#0070dd',
    epic: '#a335ee', legendary: '#ff8000',
  }
  return map[rarity] ?? '#ffffff'
}
