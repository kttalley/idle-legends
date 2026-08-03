import { create } from 'zustand'
import type {
  GameState, ClassType, RaceType, FactionType, ZoneId, Item, Slot,
  MobInstance, CombatLogEntry, FloatingNumber,
  Stats, ActiveDoT, ActiveBuff, CombatProcState,
  AllyCombatant,
  GameMode, RecipeId, MaterialId, WeatherType, TownId, Rarity, MerchantContract,
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
import { generateItem, itemPower } from '../data/items'
import { ZONE_ORDER } from '../data/zones'
import { generateZoneMap } from '../engine/mapGen'
import { ZONES } from '../data/zones'
import { CLASS_DEFINITIONS } from '../data/classes'
import {
  SPEC_OF_TALENT, TALENT_BY_ID, talentGate, canDeallocate, totalSpent,
} from '../data/specs'
import { ACTIVE_ABILITIES, getClassAbilities } from '../data/abilities'
import {
  compileStats, compileTalentEffects,
  resolvePlayerAttack, resolveMobAttack,
  makeShadowBoltHit, makeAbilityBuff, isGearUpgrade,
  emptyAbilityMod, RAMPAGE_MAX_STACKS, ARCANE_MAX_CHARGES, EXTRA_HIT_MULT, FLURRY_MULT,
} from '../engine/combat'
import { xpForLevel } from '../engine/progression'
import { getParty } from '../engine/party'
import type { Rng } from '../engine/rng'
import {
  canEnterZone,
  getZoneProgression,
  makeZoneQuest,
  isZoneQuestComplete,
  deriveActiveQuest,
  type ZoneQuest,
} from '../engine/zoneProgression'
import {
  findPath, getWalkMask, hasLineOfWalk, isWalkable, moveWithCollision, nearestWalkable,
} from '../engine/walkability'
import {
  aggroRadiusFor, CHASE_SPEED, LEASH_DISTANCE, patrolRangeFor, PATROL_SPEED, temperamentOf,
} from '../engine/mobBehaviour'
import {
  INVENTORY_SLOTS, MOB_RESPAWN_SECONDS, RESPAWN_TIMER_SECONDS,
  ELITE_HP_MULTIPLIER, ELITE_DAMAGE_MULTIPLIER, ELITE_SPAWN_CHANCE,
  BOSS_HP_MULTIPLIER, BOSS_DAMAGE_MULTIPLIER,
  AUTOSAVE_INTERVAL_MS, ZONE_STUCK_SECONDS,
  BAG_SLOTS_MAX_PURCHASED, BAG_SLOT_BASE_COST, BAG_SLOT_COST_GROWTH,
  SALVAGE_RATE, HOSTILE_TOWN_MARKUP, RARITY_ORDER,
  MERCHANT_CONTRACT_COST, MERCHANT_UPKEEP_RATE, MERCHANT_UPKEEP_MIN, MERCHANT_UPKEEP_SECONDS,
  TALENT_POINT_MAX,
} from '../data/constants'
import { isTownHostileToPlayer } from '../engine/zoneProgression'
import { rollLoot, placeDrop, salvageValue } from '../engine/loot'
import { generateNames, generateThought, generateFactionNamesFallback, generatePlayerNameFallback } from '../engine/nameGen'
import type { ThoughtEvent } from '../engine/nameGen'
import { slotStorage, summarize, newSlotId, setLastSlotId } from './saveSlots'
import { DEFAULT_COLORWAY, isColorwayUnlocked } from '../render/colorways'
import { getPurchaseState } from '../monetization/purchases'
import { emptyRates, accrueRates, projectOfflineProgress } from '../engine/offline'
import { compileUpgrades, upgradeCost, UPGRADE_BY_ID, type UpgradeId } from '../data/upgrades'
import type { TownServiceKind } from '../data/townNpcs'

// The slot currently loaded into the store — the target of every autosave. Null
// while at the character-select menu. Kept out of GameState so it isn't serialized
// into the save blob itself.
let activeSlotId: string | null = null
// Cached alongside it so the 10s autosave doesn't have to re-read and re-parse the whole
// saves file just to recover the slot's createdAt.
let activeSlotCreatedAt: number | null = null
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

/**
 * One deterministic draw off the store's combat proc stream — Track P0.
 *
 * The store's combat path is unseeded: `resolvePlayerAttack` is called with no `rng` and
 * `resolveMobAttack` with no fifth argument, and three talent procs (Nightfall, Creeping
 * Freeze, Echo) rolled straight off `Math.random()`. That is why the golden fight log
 * does not cover them, and why PLAN.md C5 insists this is paid down BEFORE any N-sided
 * work: N targets multiplies the unseeded rolls per tick, so going wide first makes the
 * debt strictly worse.
 *
 * mulberry32 inlined so the generator's whole state is the single number living on
 * `procState` — it therefore persists with the save for free and needs no fast-forward
 * on load, where a module-level `Rng` closure would silently reset every reload.
 *
 * This is the SEEDABLE half of the debt. It does not by itself put these procs inside
 * `runFight`; that needs the store/fight.ts fork decision recorded in C5.
 */
function procRoll(ps: CombatProcState, worldSeed: number): number {
  // Lazily seeded from the world so an existing save starts from its own stream rather
  // than a constant shared by every character. `|| 1` because state 0 is a fixed point.
  if (ps.procRngState === 0) ps.procRngState = ((worldSeed ^ 0x9E3779B9) | 0) || 1
  ps.procRngState = (ps.procRngState + 0x6D2B79F5) | 0
  let t = ps.procRngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ── Default proc state ────────────────────────────────────────────────────────
function defaultProcState(): CombatProcState {
  return {
    procRngState: 0,   // 0 = seed from the world on first draw (Track P0)
    winterChillStacks: 0,
    comboPoints: 0,
    remorselessActive: false,
    iceBlockUsed: false,
    lastStandUsed: false,
    rampageStacks: 0,
    arcaneCharges: 0,
    timedCritTimer: 0,
    openerUsed: false,
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

// ── Unattended zone progression ───────────────────────────────────────────────
/**
 * Decide whether an unattended hero should move on, or fall back.
 *
 * Advance is the easy half: take the next zone the moment it is legal. Retreat is what
 * makes advancing safe, and it deliberately measures THROUGHPUT rather than deaths. Death
 * costs nothing here — no gold penalty, three-second respawn — so dying a lot is not the
 * failure state. Taking no kills is. Before this existed a hero who wandered into a zone
 * the game had already unlocked for them landed zero kills in eleven simulated hours,
 * dying on repeat, with nothing in the log to say the run was over.
 *
 * Thrash between the two is prevented structurally rather than by a cooldown: a zone the
 * hero was driven out of records the level it beat them at, and auto-advance refuses to
 * return until they have passed it. Every retreat raises the bar; only levelling lowers
 * it. So the pair cannot oscillate, whatever combat tuning lands later.
 */
export function decideZoneMove(
  s: Pick<GameState,
    'currentZone' | 'level' | 'bossesDefeated' | 'zoneWatch' | 'zoneBlockedAtLevel' | 'settings'>,
): { to: ZoneId; retreat: boolean } | null {
  if (!s.settings?.autoAdvanceZones) return null

  const idx = ZONE_ORDER.indexOf(s.currentZone)

  // Retreat: long enough in this zone with nothing at all to show for it.
  if (s.zoneWatch.zone === s.currentZone &&
      s.zoneWatch.seconds >= ZONE_STUCK_SECONDS &&
      s.zoneWatch.kills === 0 &&
      idx > 0) {
    return { to: ZONE_ORDER[idx - 1] as ZoneId, retreat: true }
  }

  // Advance: the next zone is legal, and is not one that has already beaten us at this level.
  const next = ZONE_ORDER[idx + 1] as ZoneId | undefined
  if (!next) return null
  if (!canEnterZone(next, s.level, s.bossesDefeated)) return null
  const blockedAt = s.zoneBlockedAtLevel[next]
  if (blockedAt !== undefined && s.level <= blockedAt) return null
  return { to: next, retreat: false }
}

// ── Bag capacity & the price of it ────────────────────────────────────────────

/** Live bag capacity. `inventory.length` is kept equal to this. */
export function bagCapacity(s: Pick<GameState, 'bagSlotsPurchased'>): number {
  return INVENTORY_SLOTS + Math.min(BAG_SLOTS_MAX_PURCHASED, s.bagSlotsPurchased ?? 0)
}

/**
 * Price of the next bag slot, given how many are already bought.
 *
 * Geometric, and sized against the harness rather than guessed. Measured idle income
 * after salvage is ~27 gold/min, so the first slot (200g) lands about ten minutes into a
 * first session, and a full 8-hour idle window (~13,200g) buys the first twelve — leaving
 * the last eight as a genuinely long arc instead of an afternoon. Verified end to end:
 * `--buyslots` finishes an 8-hour run with 12 slots bought and gold spent down to near
 * zero, which is what a working sink looks like.
 */
export function bagSlotCost(purchased: number): number {
  return Math.round(BAG_SLOT_BASE_COST * Math.pow(BAG_SLOT_COST_GROWTH, purchased))
}

/** What a town actually charges — hostile ones trade, at a price. */
export function townPrice(base: number, townId: TownId | null, faction: FactionType): number {
  if (townId && isTownHostileToPlayer(townId, faction)) return Math.round(base * HOSTILE_TOWN_MARKUP)
  return base
}


// ── The merchant contract ─────────────────────────────────────────────────────
// The drop ladder itself lives in engine/loot.ts so the offline projection runs the
// identical code; re-exported here because the UI reaches for it through the store.
export { rarityRank, contractSells, contractWouldSell, salvageValue } from '../engine/loot'


/** What the factor bills this period: their cut of what they moved, never below the floor. */
export function contractUpkeep(c: MerchantContract): number {
  return Math.max(MERCHANT_UPKEEP_MIN, Math.round(c.soldSinceBill * MERCHANT_UPKEEP_RATE))
}

/**
 * Advance the retainer's billing clock and return the state patch, or null for no change.
 *
 * Pure, and applied at the very TOP of the tick — before it snapshots state — because the
 * tick reads `gold` into a local and writes it back at the end, so any `set()` issued
 * alongside would be silently overwritten by that stale copy. The same trap the weather
 * block avoids only by touching a field nothing else writes.
 *
 * Field time is what's billed. Standing in town isn't, because you aren't earning there
 * either, and draining a browsing player's gold would be a mean surprise. Nothing to
 * exploit: not being in the field is not being paid.
 *
 * The charge can never take gold negative and never accrues as debt. If the hero can't
 * cover it the contract LAPSES — which costs nothing and does nothing, so the player
 * falls back to exactly the behaviour they had before buying it — and it un-lapses on
 * its own the moment gold covers a bill. That is what makes it safe to leave running
 * unattended, which is the only way an idle player would ever use it.
 */
export function merchantUpkeepPatch(s: GameState, deltaSeconds: number): Partial<GameState> | null {
  const c = s.merchantContract
  if (!c || s.gameMode === 'in_town') return null

  const timer = c.upkeepTimer - deltaSeconds
  if (timer > 0) return { merchantContract: { ...c, upkeepTimer: timer } }

  // Carry the remainder so a long catch-up delta doesn't lose or double-bill time.
  const nextTimer = MERCHANT_UPKEEP_SECONDS + (timer % MERCHANT_UPKEEP_SECONDS)
  const due = contractUpkeep(c)

  if (s.gold >= due) {
    return {
      gold: s.gold - due,
      totalUpkeepPaid: s.totalUpkeepPaid + due,
      merchantContract: { ...c, upkeepTimer: nextTimer, lapsed: false, soldSinceBill: 0 },
      ...(c.lapsed
        ? { combatLog: [log('proc', 'Your factor is back on retainer.', '#88ccaa'), ...s.combatLog].slice(0, LOG_MAX) }
        : {}),
    }
  }
  if (!c.lapsed) {
    return {
      merchantContract: { ...c, upkeepTimer: nextTimer, lapsed: true, soldSinceBill: 0 },
      combatLog: [
        log('proc', `Your factor stopped working — ${due}g upkeep unpaid.`, '#ff8844'),
        ...s.combatLog,
      ].slice(0, LOG_MAX),
    }
  }
  return { merchantContract: { ...c, upkeepTimer: nextTimer, soldSinceBill: 0 } }
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
    talentVersion: TALENT_SCHEMA_VERSION,
    equipment: { weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null },
    inventory: Array(INVENTORY_SLOTS).fill(null),
    bagSlotsPurchased: 0,
    merchantContract: null,
    upgradeRanks: {},
    totalAutoSold: 0,
    totalUpkeepPaid: 0,
    gold: 0,
    totalSalvaged: 0,
    skillCooldowns: {},
    currentZone: 'sunhollow_meadows',
    activeTownNpc: null,
    mobs: [],
    targetMobId: null,
    allies: [],
    lastEngagedMobId: null,
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
    offlineRates: emptyRates(),
    lastOffline: null,
    zoneWatch: { zone: 'sunhollow_meadows', seconds: 0, kills: 0 },
    zoneBlockedAtLevel: {},
    totalPlayTime: 0,
    settings: {
      tickRateMs: 1000,
      combatTickSeconds: 2,
      showDamageNumbers: true,
      autoSellCommon: false,
      autoEquip: true,
      autoAdvanceZones: true,
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
    // Control mode
    controlMode: 'idle',
    colorway: DEFAULT_COLORWAY,
    manualIdleTimer: 0,
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
  saved.controlMode   = saved.controlMode   ?? 'idle'
  // Saves written before colorways existed, and any save naming a colorway this build
  // no longer ships, fall back to the default rather than rendering an unknown palette.
  saved.colorway      = saved.colorway ?? DEFAULT_COLORWAY
  // Track P0: saves written before the proc stream existed seed themselves on first draw.
  if (saved.procState) saved.procState.procRngState = saved.procState.procRngState ?? 0
  saved.manualIdleTimer = saved.manualIdleTimer ?? 0
  // Recompile stats
  const savedRacialPassive = RACE_DEFINITIONS[saved.playerRace]?.racialPassive ?? {}
  saved.talentAllocs  = saved.talentAllocs  ?? {}
  saved.talentPoints  = saved.talentPoints  ?? saved.level

  // ── Talent migration ────────────────────────────────────────────────────────
  // A save written against an older tree layout is refunded once and re-stamped. Every
  // id in the old warrior tree still exists (Ironcleave kept them deliberately), so
  // nothing here is a rescue — it is that the trees were extended and rebalanced under
  // the player's feet, and choosing again for free is the only honest response.
  //
  // The budget line below matters independently of the refund: points used to accrue
  // one per level forever against a tree that held ~48, so a long-lived save can be
  // carrying a pile of them that the cap no longer permits. Recomputing from level
  // rather than trusting the stored number self-heals exactly that.
  if ((saved.talentVersion ?? 0) < TALENT_SCHEMA_VERSION) {
    saved.talentAllocs = {}
    saved.talentVersion = TALENT_SCHEMA_VERSION
  }
  saved.talentPoints = Math.max(
    0,
    Math.min(saved.level, TALENT_POINT_MAX) - totalSpent(saved.talentAllocs),
  )

  saved.stats = compileStats(saved.playerClass, saved.level, saved.equipment, saved.talentAllocs, savedRacialPassive)
  saved.stats.currentHp = Math.min(saved.stats.maxHp, (saved.stats as any)._savedHp ?? saved.stats.maxHp)
  // Bag capacity. A save written before slots were purchasable has neither field, and
  // reads as the 20 it always had. The array is the live capacity, so reconcile it with
  // the counter rather than trusting either alone: grow to fit purchased slots, and if a
  // save somehow carries a longer array than it paid for, keep any items it holds instead
  // of truncating them away.
  saved.bagSlotsPurchased = Math.min(BAG_SLOTS_MAX_PURCHASED, saved.bagSlotsPurchased ?? 0)
  saved.totalSalvaged     = saved.totalSalvaged ?? 0
  // A save written before auto-equip existed opts IN: it is a strict improvement for the
  // hero it most affects, and leaving it off would preserve the very bug it fixes.
  saved.settings = {
    ...saved.settings,
    autoEquip: saved.settings?.autoEquip ?? true,
    autoAdvanceZones: saved.settings?.autoAdvanceZones ?? true,
  }
  saved.zoneWatch = { zone: saved.currentZone, seconds: 0, kills: 0 }
  saved.zoneBlockedAtLevel = saved.zoneBlockedAtLevel ?? {}
  saved.upgradeRanks      = saved.upgradeRanks ?? {}
  saved.offlineRates      = saved.offlineRates ?? emptyRates()
  saved.lastOffline       = null   // set by the load path if there is time to grant
  saved.totalAutoSold     = saved.totalAutoSold ?? 0
  saved.totalUpkeepPaid   = saved.totalUpkeepPaid ?? 0
  // A contract survives a reload, but never in the lapsed state: gold may well have
  // recovered while the save sat on disk, and a retainer that stays sulking after a
  // reload for no reason the player can see is just a bug with a story.
  saved.merchantContract  = saved.merchantContract
    ? { ...saved.merchantContract, lapsed: false, upkeepTimer: MERCHANT_UPKEEP_SECONDS,
        soldSinceBill: saved.merchantContract.soldSinceBill ?? 0 }
    : null
  saved.inventory         = saved.inventory ?? []
  const capacity = Math.max(bagCapacity(saved), saved.inventory.filter(Boolean).length)
  while (saved.inventory.length < capacity) saved.inventory.push(null)
  if (saved.inventory.length > capacity) {
    const kept = saved.inventory.filter(Boolean).slice(0, capacity)
    saved.inventory = [...kept, ...Array(capacity - kept.length).fill(null)]
  }
  saved.activeDoTs    = []
  // The zone repopulates on load; saves predating the population have neither field.
  saved.mobs          = []
  saved.targetMobId   = null
  saved.allies        = []
  saved.lastEngagedMobId = null
  saved.activeBuffs   = []
  // Per-encounter proc state is cleared on load — combo points and frozen timers belong to
  // a fight that is over. The RNG STREAM is not per-encounter and must survive.
  //
  // It did not. Line ~405 backfilled `procRngState` for old saves and then this line threw
  // the whole object away, reseeding from the world on every load — so the comment on
  // `procRoll` claiming the stream "persists with the save for free" described an intent
  // the code did not implement. Carried across explicitly now, which is what makes a
  // seeded store fight reproducible ACROSS a reload rather than only within one session.
  const carriedStream = saved.procState?.procRngState ?? 0
  saved.procState     = { ...defaultProcState(), procRngState: carriedStream }
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
  saved.activeTownNpc      = null
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
  // zoneMaps is 2.63 MB of pure derived data at full progression (12 zones × a 64×64 grid
  // whose every tile carries a `charSet: string[]`, plus ~700 props and ~90 scenery each)
  // — and rehydrateState regenerates all of it from (unlockedZones, worldSeed) on load,
  // discarding whatever was stored. Persisting it bought nothing and cost ~99% of the
  // blob: five slots came to 13.15 MB against a ~5 MB origin quota, so the SECOND
  // fully-progressed character could not be written at all.
  blob.zoneMaps = {}
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

function fn(
  value: number, isCrit: boolean, isMobDamage: boolean, isDoT: boolean, color?: string,
  /** Party-member key when the blow is an ALLY's — the renderer plays the hit on their
   *  body rather than the hero's. Absent for the player's own damage. */
  allyKey?: string,
): FloatingNumber {
  return {
    id: `fn_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    value, isCrit, isMobDamage, isDoT, color, allyKey,
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
 *
 * Wedge escape: collide-and-slide alone stops dead in a concave corner, where BOTH axes
 * are blocked. That is survivable in combat, where the drift angle rotates with the clock
 * and eventually points somewhere open — but it was fatal while gathering, whose angle was
 * frozen (see the gathering branch), so a wedged hero harvested one node forever and the
 * idle run ended silently. Rather than rely on the angle moving, fan the same step through
 * the eight compass directions and take the first that lands. `buildWalkMask` seals every
 * pocket below MIN_REGION and keeps the mask single-component, so a walkable tile always
 * has a walkable neighbour: the fan cannot come up empty. Structurally unstuckable rather
 * than tuned to be unlikely.
 */
function driftMapPos(state: GameState, dx: number, dy: number): { x: number; y: number } {
  const wrap = (v: number) => ((v % 64) + 64) % 64
  const zm = state.zoneMaps[state.currentZone]
  if (!zm) return { x: wrap(state.playerMapPos.x + dx), y: wrap(state.playerMapPos.y + dy) }
  const mask = getWalkMask(zm)
  const from = nearestWalkable(mask, state.playerMapPos.x, state.playerMapPos.y)
  let moved = moveWithCollision(mask, from.x, from.y, dx, dy)
  if (moved.blocked && moved.x === from.x && moved.y === from.y) {
    const mag = Math.hypot(dx, dy)
    const base = Math.atan2(dy, dx)
    for (let i = 1; i < 8; i++) {
      const a = base + (i * Math.PI) / 4
      const t = moveWithCollision(mask, from.x, from.y, Math.cos(a) * mag, Math.sin(a) * mag)
      if (t.x !== from.x || t.y !== from.y) { moved = t; break }
    }
  }
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
    let salvaged = 0
    if (free >= 0) {
      inventory[free] = item
      newLogs.push(log('loot_item', `${recipe.output.icon} Crafted ${item.name}!`, rarityColor(rarity)))
    } else {
      // Same rule as combat loot: a craft with nowhere to go is sold off, not voided.
      // Harsh for something the player earned the materials for — which is the point,
      // it should push them toward buying capacity, not toward losing the item.
      salvaged = salvageValue(item)
      newLogs.push(log('proc',
        `${recipe.output.icon} ${item.name} — no room, salvaged for ${salvaged}g`, '#c8a100'))
    }
    return {
      ...base,
      inventory,
      gold: state.gold + salvaged,
      totalSalvaged: state.totalSalvaged + salvaged,
      // Note: the merchant contract deliberately does NOT cover crafted goods. It buys
      // drops the hero didn't choose; selling something they gathered the materials for
      // and queued at the forge would be the retainer overstepping.
      lastCraft: {
        id: `craft_${Date.now()}`,
        recipeId: recipe.id,
        name: item.name,
        icon: recipe.output.icon,
        quality, rarity, kind: 'gear',
        // The reveal must not show off gear the hero doesn't actually have — if it
        // overflowed, the card says where it went.
        detail: salvaged > 0
          ? `${itemSummary(item)} — no room, salvaged for ${salvaged}g`
          : itemSummary(item),
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

/** Auto-pilot gait. Faster than a mob's patrol so the hero closes on things, and faster
 *  than a chase so a leashing mob genuinely falls behind. */
const PLAYER_WALK_SPEED = 3.0

/** The hero's cached route under auto-pilot. Module state rather than a `GameState` field
 *  because it is derived, regenerates in a tick, and has no business in the save blob —
 *  cleared alongside the other combat accumulators on load and on zone change. */
const playerPath: PathHolder = { path: null, pathCool: 0 }

/** Mob id → seconds we have spent failing to reach it. Derived, disposable, deliberately
 *  not in `GameState`. */
const unreachableFor = new Map<string, number>()
/** Skip a mob when choosing what to walk to after this long failing to reach it. */
const UNREACHABLE_SKIP_SECONDS = 3
/** Give up on it entirely after this long, so a replacement can spawn somewhere sane.
 *  Needed as well as the skip: auto-targeting picks by raw distance, so a marooned mob
 *  can still be made the TARGET, and a target the hero can never close on stops the idle
 *  loop just as dead as walking to it did. */
const UNREACHABLE_RETIRE_SECONDS = 12

/**
 * Where the hero is standing after this tick.
 *
 * Two owners, one position. Under MANUAL control the renderer owns the hero's feet —
 * it is the only thing that sees WASD and taps — and reports them back through
 * `reportPlayerWorldPos`, so the store must not fight it. Under IDLE the store walks the
 * hero itself, toward whatever it is trying to reach.
 *
 * The old behaviour was neither: a fixed sine-wave drift that ignored both input and
 * objective, which is why the store could never answer "how close is the player to that
 * wolf" and why proximity aggro was impossible before this.
 */
function advancePlayerPosition(
  state: GameState,
  controlMode: 'idle' | 'manual',
  mobs: MobInstance[],
  currentMob: MobInstance | null,
  dt: number,
): { x: number; y: number } {
  if (controlMode === 'manual') return state.playerMapPos

  const zm = state.zoneMaps[state.currentZone]
  const mask = zm ? getWalkMask(zm) : null

  // Rescue a hero standing on blocked ground BEFORE trying to move them.
  //
  // `driftMapPos` always did this and dropping it was a real regression: the zone spawn
  // point (32,32) is itself blocked in venom_hollows and grimshade_forest
  // (walkability.ts:155), and from inside a wall every direction `moveWithCollision`
  // is offered gets refused — including the 8-way fan-out, which only helps when at
  // least one bearing lands on open ground. The hero simply could not move, for the
  // whole run, in exactly those two zones.
  const here = mask
    ? nearestWalkable(mask, state.playerMapPos.x, state.playerMapPos.y)
    : state.playerMapPos

  // Walk to the target if there is one, otherwise to the nearest thing worth walking to.
  //
  // "Nearest" must mean nearest REACHABLE. A zone can have several disconnected
  // landmasses, and picking by raw distance means one mob across a lake — closer than
  // three perfectly reachable ones — captures the hero permanently. That is not a
  // hypothetical: it stranded a level-1 hero for 900 simulated seconds twice, in two
  // different scenario shapes, and each time it presented as "the economy stopped".
  let goal: { x: number; y: number } | null = null
  let goalId: string | null = null
  if (currentMob) {
    goal = currentMob.pos
    goalId = currentMob.id
  } else {
    let best: MobInstance | null = null
    let bestD = Infinity
    for (const m of mobs) {
      if ((unreachableFor.get(m.id) ?? 0) > UNREACHABLE_SKIP_SECONDS) continue
      const d = torusDistance(here, m.pos)
      if (d < bestD) { bestD = d; best = m }
    }
    // Everything is blacklisted — clear it and try again rather than stand still. The
    // world changes (mobs patrol, the hero is pushed around), so a verdict from ten
    // seconds ago is not binding forever.
    if (!best) {
      unreachableFor.clear()
      for (const m of mobs) {
        const d = torusDistance(here, m.pos)
        if (d < bestD) { bestD = d; best = m }
      }
    }
    if (best) { goal = best.pos; goalId = best.id }
  }

  if (goal) {
    // Stop at conversational distance rather than standing on top of it — the renderer
    // holds an engagement gap for melee, and marching into the same tile undoes it.
    const d = torusDistance(here, goal)
    if (d <= 1.2) {
      if (goalId) unreachableFor.delete(goalId)
      return here
    }
    const next = routeToward(mask, playerPath, here, goal, PLAYER_WALK_SPEED, dt)
    if (goalId) {
      if (playerPath.failed) {
        unreachableFor.set(goalId, (unreachableFor.get(goalId) ?? 0) + dt)
      } else if (torusDistance(next, here) > 1e-4) {
        // Making progress — forgive any earlier verdict.
        unreachableFor.delete(goalId)
      }
    }
    return next
  }

  // Nothing to walk to (empty zone, everything dead, waiting on a respawn). Keep the old
  // slow drift so the map still scrolls past and the hero does not stand frozen.
  const driftAngle = state.totalPlayTime * 0.08
  return driftMapPos(
    state,
    Math.cos(driftAngle) * 0.5 * dt,
    Math.sin(driftAngle * 0.7) * 0.3 * dt,
  )
}

/** Anything that walks somewhere deliberately and caches a route to get there. */
interface PathHolder {
  path: { x: number; y: number }[] | null
  pathCool: number
  /** True when the last A* attempt came back `null` — genuinely unreachable, as opposed
   *  to merely not computed yet. Callers need the difference: sliding toward something
   *  you can never reach grinds at a shoreline forever. */
  failed?: boolean
}

/**
 * Slide one step toward a goal, with an escape hatch when wedged.
 *
 * Collide-and-slide is the right per-frame primitive, but on its own it grinds forever
 * against a concave shoreline: the blocked direction is retried every tick and the body
 * never moves again. `driftMapPos` always had an 8-direction fallback for exactly this;
 * omitting it here froze the hero on a lake edge for 25 straight minutes of simulated
 * time, which the economy harness caught as a dead stop at 7 kills.
 */
function slideToward(
  mask: Uint8Array | null,
  from: { x: number; y: number },
  goal: { x: number; y: number },
  speed: number,
  dt: number,
): { x: number; y: number } {
  const dx = torusDelta(from.x, goal.x)
  const dy = torusDelta(from.y, goal.y)
  const d = Math.hypot(dx, dy)
  if (d < 0.05) return from
  const step = Math.min(d, speed * dt)
  const nx = dx / d * step, ny = dy / d * step
  if (!mask) return { x: wrapTileCoord(from.x + nx), y: wrapTileCoord(from.y + ny) }

  let moved = moveWithCollision(mask, from.x, from.y, nx, ny)
  if (moved.blocked && moved.x === from.x && moved.y === from.y) {
    // Wedged. Fan out around the intended heading and take the first bearing that moves.
    const base = Math.atan2(ny, nx)
    for (let i = 1; i < 8; i++) {
      const a = base + (i * Math.PI) / 4
      const t = moveWithCollision(mask, from.x, from.y, Math.cos(a) * step, Math.sin(a) * step)
      if (t.x !== from.x || t.y !== from.y) { moved = t; break }
    }
  }
  return { x: wrapTileCoord(moved.x), y: wrapTileCoord(moved.y) }
}

/**
 * Walk toward a goal along a real route, recomputing only when it goes stale.
 *
 * This is where Track C's pathfinding actually lands. `findPath` is A* over the 64×64
 * torus and already existed; what was missing was anything in the STORE calling it, so
 * every body in the simulation moved by direct vector and got caught on terrain.
 */
function routeToward(
  mask: Uint8Array | null,
  holder: PathHolder,
  from: { x: number; y: number },
  goal: { x: number; y: number },
  speed: number,
  dt: number,
): { x: number; y: number } {
  if (!mask) return slideToward(null, from, goal, speed, dt)

  holder.pathCool -= dt

  // Near enough, or in open sight of the goal: skip A* entirely. This is the common case
  // and keeps the pathfinder off the hot path for anything already in the open.
  const direct = torusDistance(from, goal)
  if (direct < 1.5 || hasLineOfWalk(mask, from.x, from.y, goal.x, goal.y)) {
    holder.path = null
    holder.failed = false
    return slideToward(mask, from, goal, speed, dt)
  }

  const stale = !holder.path || !holder.path.length
  if (stale && holder.pathCool <= 0) {
    holder.path = findPath(mask, from.x, from.y, goal.x, goal.y)
    // A null result means genuinely unreachable — a different state from "arrived", and
    // conflating the two is what makes a stranded body grind at a shoreline. Cool down
    // either way so an unreachable goal cannot burn a full-grid search every tick.
    holder.failed = holder.path === null
    holder.pathCool = holder.path ? 0.5 : 2.0
  }

  const wp = holder.path?.[0]
  if (!wp) return slideToward(mask, from, goal, speed, dt)

  const next = slideToward(mask, from, wp, speed, dt)
  if (torusDistance(next, wp) < 0.35) holder.path!.shift()
  return next
}

/**
 * Advance every mob in the zone: patrol its route, notice the hero, chase, or give up.
 *
 * This is what replaces "the targeted mob's bearing shrinks to zero". A mob is somewhere,
 * doing something, whether or not it is the player's current target — which is the whole
 * difference between a populated zone and a queue of enemies waiting to be served.
 *
 * Returns any log lines worth surfacing (being noticed is information the player needs).
 */
function advanceMobs(
  state: GameState,
  mobs: MobInstance[],
  player: { x: number; y: number },
  dt: number,
  targetMobId: string | null,
): ReturnType<typeof log>[] {
  const zm = state.zoneMaps[state.currentZone]
  const mask = zm ? getWalkMask(zm) : null
  const logs: ReturnType<typeof log>[] = []

  for (const m of mobs) {
    const distToPlayer = torusDistance(m.pos, player)
    const temperament = temperamentOf(m)

    // ── Noticing ────────────────────────────────────────────────────────────
    // You started it. Whoever the hero has targeted is aggroed regardless of distance —
    // a thing you are shooting at from across the zone should turn and come for you, and
    // this is also what makes idle auto-pilot's chosen quarry walk in to meet it.
    if (targetMobId && m.id === targetMobId) m.aggro = true

    // Proximity aggro, per temperament.
    if (!m.aggro && distToPlayer <= m.aggroRadius) {
      m.aggro = true
      m.patrolTarget = null
      // Only predators announce themselves. A territorial thing you walked into does not
      // need a line of combat log; you can see it, and narrating every mushroom you brush
      // past turns the feed into noise.
      if (temperament === 'predator') {
        logs.push(log('mob_attack', `${m.name} spots you and charges!`, '#ff8844'))
      }
    }

    if (m.aggro) {
      // ── Leash ─────────────────────────────────────────────────────────────
      // Without this a single wolf tows the hero across the entire zone and every
      // encounter ends up happening wherever the player happened to be running.
      const fromHome = torusDistance(m.pos, m.home)
      if (fromHome > LEASH_DISTANCE && distToPlayer > m.aggroRadius) {
        m.aggro = false
        m.patrolTarget = { ...m.home }
        continue
      }
      // A lair boss defends its ground and does not pursue.
      if (temperament === 'lair') continue
      m.pos = routeToward(mask, m, m.pos, player, CHASE_SPEED, dt)
      continue
    }

    // ── Patrol ──────────────────────────────────────────────────────────────
    const range = patrolRangeFor(m)
    if (range <= 0) continue   // bosses hold the lair

    if (m.patrolPause > 0) { m.patrolPause -= dt; continue }

    if (!m.patrolTarget) {
      const ang = Math.random() * Math.PI * 2
      const dist = Math.random() * range
      let tx = wrapTileCoord(m.home.x + Math.cos(ang) * dist)
      let ty = wrapTileCoord(m.home.y + Math.sin(ang) * dist)
      if (mask && !isWalkable(mask, tx, ty)) {
        const near = nearestWalkable(mask, tx, ty)
        tx = wrapTileCoord(near.x); ty = wrapTileCoord(near.y)
      }
      m.patrolTarget = { x: tx, y: ty }
    }

    const before = m.pos
    m.pos = routeToward(mask, m, m.pos, m.patrolTarget, PATROL_SPEED, dt)
    const arrived = torusDistance(m.pos, m.patrolTarget) < 0.3
    // Wedged against terrain counts as arrived, or a mob grinds into a cliff forever.
    const stuck = Math.hypot(torusDelta(before.x, m.pos.x), torusDelta(before.y, m.pos.y)) < 1e-4
    if (arrived || stuck) {
      m.patrolTarget = null
      // Pause at the waypoint. A body that pivots and departs the instant it arrives
      // reads as a patrol route; one that stops and looks around reads as an animal.
      m.patrolPause = 1.5 + Math.random() * 4
    }
  }

  return logs
}

/**
 * One step of the world: move the hero, move every mob, re-derive the player-relative
 * projections, and retire anything provably unreachable.
 *
 * Extracted so it can run on BOTH tick paths. The no-target branch returns early (there
 * is no fight to resolve), and it used to skip all of this — which meant that the moment
 * the hero had no target, the entire zone froze: no patrols, no aggro checks, no hero
 * movement. In idle that was nearly invisible because a target is almost always set, but
 * manual control deliberately clears the target, so it froze the world for exactly the
 * mode this work exists to serve.
 */
function tickWorld(
  state: GameState,
  controlMode: 'idle' | 'manual',
  mobs: MobInstance[],
  currentMob: MobInstance | null,
  targetMobId: string | null,
  dt: number,
): {
  playerMapPos: { x: number; y: number }
  mobs: MobInstance[]
  currentMob: MobInstance | null
  targetMobId: string | null
  mobMapOffset: { dx: number; dy: number }
  logs: ReturnType<typeof log>[]
} {
  const playerMapPos = advancePlayerPosition(state, controlMode, mobs, currentMob, dt)
  const logs = advanceMobs(state, mobs, playerMapPos, dt, targetMobId)

  // Retire the marooned. A mob the hero provably cannot walk to is not content, it is a
  // deadlock: auto-targeting picks by raw distance, so it can be selected and then never
  // closed on. Bosses are exempt — quietly deleting one would be worse than the stall.
  if (unreachableFor.size) {
    const marooned = mobs.filter(
      m => !m.isBoss && (unreachableFor.get(m.id) ?? 0) > UNREACHABLE_RETIRE_SECONDS,
    )
    for (const m of marooned) {
      unreachableFor.delete(m.id)
      mobs = mobs.filter(x => x.id !== m.id)
      if (targetMobId === m.id) { targetMobId = null; currentMob = null }
      logs.push(log('proc', `${m.name} wanders out of reach.`, '#8a8070'))
    }
  }

  // Derive the player-relative projections every existing consumer still reads: the
  // renderer's entity placement, `nearestMob`, `setTarget`, `engageTarget`.
  for (const m of mobs) {
    m.offset = {
      dx: torusDelta(playerMapPos.x, m.pos.x),
      dy: torusDelta(playerMapPos.y, m.pos.y),
    }
  }
  if (currentMob) {
    const live = mobs.find(m => m.id === currentMob!.id)
    if (live) currentMob = live
  }
  return {
    playerMapPos, mobs, currentMob, targetMobId,
    mobMapOffset: currentMob ? currentMob.offset : { dx: 0, dy: 0 },
    logs,
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

  // Hoisted: temperament and placement are both derived from the display name, since
  // that is what `mobBehaviour` matches on.
  const name = isBoss ? `[BOSS] ${template.name}`
    : isElite ? `★ ${template.name}`
    : template.name

  return {
    id: `mob_${++mobInstanceSeq}`,
    templateId: template.id,
    name,
    currentHp: Math.round(template.hp * hpMult * circuitMult),
    maxHp:     Math.round(template.hp * hpMult * circuitMult),
    // dmgMult belongs on damage, not on the swing interval. It used to be applied to
    // attackSpeedSeconds, but resolveMobAttack computes a swing as
    // `damage × attackSpeedSeconds × speedFactor` (combat.ts:463) — so a longer interval
    // raised per-swing damage by exactly the amount it lowered swing frequency, and the
    // multiplier cancelled itself. Elites hit 1.8× harder 1.8× less often for identical
    // DPS, which made them pure health sponges and left ELITE/BOSS_DAMAGE_MULTIPLIER as
    // dead constants. C6's "make elites hit harder" dial now actually turns something.
    damage: Math.round(template.damage * circuitMult * dmgMult),
    xpReward: Math.round(template.xpReward * (isBoss ? 3 : isElite ? 2 : 1) * circuitMult),
    goldMin: template.goldMin,
    goldMax: template.goldMax,
    lootTableIds: template.lootTableIds,
    spriteKey: template.spriteKey,
    attackSpeedSeconds: template.attackSpeedSeconds,
    isElite,
    isBoss,
    ...placeInWorld(state, { name, isBoss }),
    dots: [],
  }
}

/** Wrap a tile coordinate onto the 64×64 torus. */
function wrapTileCoord(v: number): number {
  return ((v % 64) + 64) % 64
}

/** Shortest signed distance a→b across the torus seam. */
function torusDelta(a: number, b: number): number {
  let d = b - a
  if (d > 32) d -= 64
  if (d < -32) d += 64
  return d
}

export function torusDistance(
  a: { x: number; y: number }, b: { x: number; y: number },
): number {
  return Math.hypot(torusDelta(a.x, b.x), torusDelta(a.y, b.y))
}

/**
 * Give a newly spawned mob a real place to stand.
 *
 * The old `spawnOffset` returned a bearing from the player, which meant a mob had no
 * location at all: walk east and the whole population walked east with you, permanently
 * arranged around the camera. Every zone therefore read as a slot machine dispensing
 * enemies rather than as ground with things living on it.
 *
 * A home anchor is chosen on walkable ground at a plausible remove — far enough that
 * arriving somewhere feels like travel, near enough that a zone is not empty — and the
 * mob spawns on it. `offset` is no longer authored here at all; the tick derives it.
 */
function placeInWorld(
  state: GameState, mob: { name: string; isBoss: boolean },
): Pick<MobInstance,
  'pos' | 'home' | 'patrolTarget' | 'patrolPause' | 'aggro' | 'aggroRadius' | 'offset'
  | 'path' | 'pathCool'> {
  const zm = state.zoneMaps[state.currentZone]
  const player = state.playerMapPos
  // Bosses hold a fixed lair rather than milling about the zone, so they are placed
  // further out: the walk to them is part of the encounter.
  const min = mob.isBoss ? 14 : 12
  const span = mob.isBoss ? 6 : 14

  let x = 0, y = 0
  const mask = zm ? getWalkMask(zm) : null

  // Try a few bearings before settling. Two things have to hold, and the second is the
  // one that is easy to miss: the ground must be walkable, AND it must be REACHABLE from
  // where the hero is standing.
  //
  // `walkability` seals small pockets but keeps any region of 24+ tiles, so a zone can
  // have several disconnected landmasses — the worst measured has seven. A mob placed on
  // the far side of a lake passes `isWalkable` and is still unreachable forever, and
  // because the hero walks to whatever is nearest, one such spawn can hold the entire
  // idle loop hostage. The economy harness caught exactly that: a level-1 hero, 900
  // seconds, zero kills.
  let placed = false
  for (let attempt = 0; attempt < 10; attempt++) {
    const ang = Math.random() * Math.PI * 2
    const dist = min + Math.random() * span
    x = wrapTileCoord(player.x + Math.cos(ang) * dist)
    y = wrapTileCoord(player.y + Math.sin(ang) * dist)
    if (!mask) { placed = true; break }
    if (!isWalkable(mask, x, y)) continue
    // Reachable? A straight walk is the cheap answer; A* is the honest one.
    if (hasLineOfWalk(mask, player.x, player.y, x, y)
        || findPath(mask, player.x, player.y, x, y) !== null) {
      placed = true
      break
    }
  }
  if (!placed && mask) {
    // Nothing sampled was reachable — rather than strand a spawn on an island, fall back
    // to ground the hero is provably standing on and push out from there.
    const near = nearestWalkable(mask, player.x, player.y)
    const ang = Math.random() * Math.PI * 2
    for (let r = min; r >= 2; r -= 2) {
      const cx = wrapTileCoord(near.x + Math.cos(ang) * r)
      const cy = wrapTileCoord(near.y + Math.sin(ang) * r)
      if (isWalkable(mask, cx, cy) && hasLineOfWalk(mask, near.x, near.y, cx, cy)) {
        x = cx; y = cy; break
      }
      x = wrapTileCoord(near.x); y = wrapTileCoord(near.y)
    }
  }

  const home = { x, y }
  return {
    pos: { x, y },
    home,
    patrolTarget: null,
    path: null,
    pathCool: 0,
    // Stagger the first waypoint pick, or every mob in a fresh zone steps off together
    // and the whole population moves in lockstep — which reads as a machine, not a place.
    patrolPause: Math.random() * 4,
    aggro: false,
    aggroRadius: aggroRadiusFor(mob),
    offset: { dx: torusDelta(player.x, x), dy: torusDelta(player.y, y) },
  }
}

/** How many enemies populate a zone at once. The boss fights alone — a lair should not
 *  be a crowd, and it keeps the climactic encounter reading as one. */
const MOB_POPULATION = 4

// ── Allies ────────────────────────────────────────────────────────────────────
/** An ally wears nothing. Frozen so a stray write cannot quietly gear the whole party. */
const EMPTY_EQUIPMENT: Record<Slot, Item | null> = Object.freeze({
  weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null,
}) as Record<Slot, Item | null>

/** Seconds a downed ally stays down before rejoining the fight. Long enough that losing
 *  one matters, short enough that a wipe-free fight does not become a solo fight. */
const ALLY_REVIVE_SECONDS = 12
/** Share of incoming mob swings that pick an ally rather than the player, when at least
 *  one ally is standing. Below half on purpose: the player is the one making decisions,
 *  and a mob that mostly hits someone else turns the fight into a spectator sport. */
const ALLY_THREAT_SHARE = 0.45

/**
 * Build the combat projection of one party member.
 *
 * Ungeared by design — see `AllyCombatant`. `rngState` is seeded off the world and the
 * member's key so two allies never walk the same stream, which is the determinism
 * regression per-hero sub-streams exist to prevent.
 */
function makeAlly(m: ReturnType<typeof getParty>[number], worldSeed: number): AllyCombatant {
  const sp = m.speaker
  const playerClass = (sp.playerClass as ClassType)
  const allocs = sp.talentAllocs ?? {}
  const racial = RACE_DEFINITIONS[sp.race as keyof typeof RACE_DEFINITIONS]?.racialPassive ?? {}
  const stats = compileStats(playerClass, sp.level, EMPTY_EQUIPMENT, allocs, racial)
  return {
    key: m.key, name: sp.name, playerClass, level: sp.level, talentAllocs: allocs,
    stats, currentHp: stats.maxHp, attackAccum: 0, downedFor: 0,
    procState: defaultProcState(),
    rngState: ((worldSeed ^ strHashKey(m.key)) | 0) || 1,
  }
}

/** Stable 32-bit hash of a party key, so an ally's stream is reproducible across reloads. */
function strHashKey(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** One draw off an ally's own stream. Same generator as `procRoll`, different owner. */
function allyRoll(a: AllyCombatant): number {
  a.rngState = (a.rngState + 0x6D2B79F5) | 0
  let t = a.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** How far the hero may have wandered and still resume the fight manual control dropped.
 *  Beyond this it is not the same encounter any more and "nearest" is the honest answer —
 *  resuming unconditionally would march the hero back across the zone to something they
 *  deliberately walked away from. */
const RESUME_TARGET_RADIUS = 12

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
/** Time since the last kill, for shedding Rampage stacks. */
let rampageDecayAccum = 0
/** A summoned minion swings on its own clock, not the hero's. */
let minionAccum = 0
const MINION_TICK_SECONDS = 2

/** Seconds of inactivity before manual control falls back to idle. */
const MANUAL_IDLE_TIMEOUT_SECONDS = 15

/**
 * Bumped whenever the talent trees change shape enough that existing allocations
 * should not be assumed still sensible. Version 2 is the three-specs-per-class rework:
 * one tree became three, tier gating became per-tree, and the lifetime point budget
 * gained a ceiling.
 */
const TALENT_SCHEMA_VERSION = 2

export function resetCombatAccumulators() {
  playerAttackAccum = 0
  mobAttackAccum    = 0
  siphonLifeAccum   = 0
  rampageDecayAccum = 0
  minionAccum       = 0
  playerPath.path   = null
  playerPath.pathCool = 0
  playerPath.failed = false
  unreachableFor.clear()
}

/** Seconds without a kill before Rampage sheds a stack. */
const RAMPAGE_DECAY_SECONDS = 8

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
  buyBagSlot: () => void
  setAutoEquip: (on: boolean) => void
  setAutoAdvanceZones: (on: boolean) => void
  setActiveTownNpc: (id: TownServiceKind | null) => void
  buyUpgrade: (id: UpgradeId) => void
  dismissOfflineReport: () => void
  buyMerchantContract: () => void
  setMerchantThreshold: (threshold: Rarity) => void
  cancelMerchantContract: () => void
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
  setControlMode: (mode: 'idle' | 'manual') => void
  /** Equip a cosmetic colorway. Returns false if it is not unlocked. */
  setColorway: (id: string) => boolean
  bumpManualInput: () => void
  reportPlayerWorldPos: (x: number, y: number) => void
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
    // Drawn from `Math.random` ALONE. This used to XOR in `Date.now()`, which made the
    // world unseedable: `tools/sim/run.mjs` installs a seeded global `Math.random`, so
    // every other roll in a scenario is reproducible, but the terrain still changed with
    // the wall clock. Consecutive `--assert` runs of identical code therefore disagreed —
    // offline parity measured 5.9%, 10.9% and 23.0% on three runs — and invariant
    // failures appeared and vanished between shapes.
    //
    // That was invisible until mobs and the hero started occupying real ground: when
    // enemies simply walked in from a ring, terrain barely touched the economy. Now it
    // decides all of it, so an unseeded map means an unmeasurable game. 32 bits of
    // `Math.random` is ample uniqueness for a real character.
    s.worldSeed = Math.floor(Math.random() * 0xFFFFFFFF) | 0
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
    activeSlotCreatedAt = Date.now()
    setLastSlotId(activeSlotId)
    set(s)
    get().saveGame()
    // Fire name generation async — game starts immediately, names trickle in. A
    // creation-chosen name is preserved (never overwritten by the LLM).
    // `slotAtRequest` pins the slot this generation belongs to. The request resolves
    // ~30s later, by which time the player may have gone back to the menu and opened a
    // DIFFERENT hero — and this continuation calls set() + saveGame() unconditionally,
    // so hero A's generated name, traits and faction names were written over hero B.
    const slotAtRequest = activeSlotId
    generateNames(playerClass, nameSeed)
      .then(names => {
        if (activeSlotId !== slotAtRequest) return   // player switched heroes; drop it
        set({
          playerName: chosenName || names.playerName,
          characterTraits: names.traits,
          generatedZoneNames: names.zoneNames,
          factionNames: names.factionNames,
          generatedTownNames: names.townNames ?? {},
          nameGenStatus: 'done',
        })
        get().saveGame()   // persist the generated identity into the slot
      })
      .catch((err) => {
        console.error('[nameGen] failed:', err)
        if (!chosenName && activeSlotId === slotAtRequest) set({ nameGenStatus: 'error' })
      })
  },

  loadSlot: (id) => {
    try {
      const slot = slotStorage.load(id)
      if (!slot || !slot.state?.initialized) {
        console.warn('[saves] slot', id, 'missing or not initialized')
        return false
      }
      const saved = rehydrateState(slot.state)
      resetCombatAccumulators()
      activeSlotId = id
      activeSlotCreatedAt = slot.createdAt
      setLastSlotId(id)
      // Grant time away BEFORE the state goes live, so the player never sees the
      // pre-offline numbers flash and then jump. `lastTickTimestamp` is stamped by
      // toSaveBlob at write time, which is what makes the elapsed window honest.
      const offline = projectOfflineProgress(saved, Date.now())
      set(offline ? { ...saved, ...offline.patch, lastOffline: offline.report } : saved)
      get().saveGame()   // refreshes lastPlayedAt
      return true
    } catch (err) {
      // Was a bare `catch { return false }`, and App.tsx discarded the boolean — so a
      // failed Continue was a silent no-op indistinguishable from "bounced back".
      console.error('[saves] loadSlot failed for', id, err)
      return false
    }
  },

  saveGame: () => {
    if (!activeSlotId) return
    const s = get()
    if (!s.initialized) return
    const now = Date.now()
    // createdAt is cached at load/create time. Reading it back through
    // slotStorage.load() here meant every autosave parsed the whole multi-megabyte
    // saves file twice — once for this lookup and once inside save() itself.
    slotStorage.save({
      id:           activeSlotId,
      createdAt:    activeSlotCreatedAt ?? now,
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
    activeSlotCreatedAt = null
    setLastSlotId(null)   // an explicit exit to the menu must not auto-resume on reload
    resetCombatAccumulators()
    set({ ...defaultState(), initialized: false })
  },

  resetGame: () => {
    // Full wipe of the active run only (not other slots). Retained for dev use;
    // not wired to any UI button.
    if (activeSlotId) slotStorage.delete(activeSlotId)
    activeSlotId = null
    activeSlotCreatedAt = null
    setLastSlotId(null)
    resetCombatAccumulators()
    set(defaultState())
  },

  // ── Main Tick ────────────────────────────────────────────────────────────────
  tick: (deltaSeconds) => {
    if (!get().initialized) return
    // Settle the retainer's bill before anything snapshots state — see the note on
    // merchantUpkeepPatch for why this cannot live alongside the other tick branches.
    const upkeep = merchantUpkeepPatch(get(), deltaSeconds)
    if (upkeep) set(upkeep)

    const state = get()

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
      // World drift — slow wander so map scrolls past player.
      // The angle is driven by `totalPlayTime`, which this branch used to leave frozen:
      // only the combat branch advanced it, and every other branch returns before that.
      // A frozen clock means a CONSTANT drift vector, so a hero whose one direction was
      // blocked pushed into the same wall every tick for the rest of the run. Advancing
      // it here (below) restores the intended slow curve; `driftMapPos` handles the
      // corner case where even a rotating heading is momentarily wedged.
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
        set({
          gatheringTimer: timer, playerMapPos: gatherMapPos, gatherSession: session,
          totalPlayTime: state.totalPlayTime + deltaSeconds,
        })
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
        totalPlayTime: state.totalPlayTime + deltaSeconds,
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
      controlMode, manualIdleTimer,
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

    // Gold recovered this tick from drops the bag had no room for — tracked separately
    // from `gold` so the overflow leak stays visible in the save rather than blending
    // into kill income.
    let salvaged = 0
    // Combat output this tick, folded into the decaying rate window at the end. This is
    // what offline progress replays, so it has to be measured rather than assumed.
    let killsThisTick = 0
    let xpThisTick = 0
    // ONLY the gold mobs drop. Proceeds from selling or scrapping loot are deliberately
    // excluded: the offline projection re-rolls those drops and runs them through the real
    // ladder, so folding them into the rate as well would pay for the same items twice.
    let killGoldThisTick = 0
    // Gold the merchant contract earned this tick, tracked separately so the retainer
    // can be judged against its own upkeep rather than on vibes.
    let autoSold = 0

    const fx = compileTalentEffects(state.playerClass, talentAllocs)
    // Hoisted: both the level-up recompile and the auto-equip recompile need it.
    const racialPassive = RACE_DEFINITIONS[state.playerRace]?.racialPassive ?? {}
    const upg = compileUpgrades(state.upgradeRanks)

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
      // wins while it lives; this only fills the vacuum. In manual mode the hero does not
      // auto-acquire a target so the player can move freely.
      if (controlMode === 'idle') {
        // Resume the fight manual control interrupted, before falling back to "nearest".
        // Only while it is still alive and close enough to plausibly still be the same
        // encounter — otherwise this would drag the hero back across the zone to something
        // it walked away from.
        const resumed = state.lastEngagedMobId
          ? mobs.find(m => m.id === state.lastEngagedMobId) ?? null
          : null
        target = resumed && torusDistance(resumed.pos, state.playerMapPos) <= RESUME_TARGET_RADIUS
          ? resumed
          : nearestMob(mobs)
        targetMobId = target?.id ?? null
      }
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

    // ── Manual-mode idle fallback ─────────────────────────────────────────────
    // Only counts down in active combat; menus/travel/gathering/town are not "manual"
    // control contexts, so they don't steal the player's 15 seconds.
    if (controlMode === 'manual') {
      manualIdleTimer = Math.max(0, manualIdleTimer - deltaSeconds)
      if (manualIdleTimer <= 0) {
        controlMode = 'idle'
        manualIdleTimer = 0
        targetMobId = null   // let idle auto-pilot pick freely next tick
        newLogs.push(log('proc', 'Manual control released — resuming idle patrol.', '#aaaaff'))
      }
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
        let spawned = persistedBoss ?? spawnMob(currentZone, state)
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
            // The roaming ambush that used to live here teleported a freshly spawned mob
            // to 2 tiles off the hero, made it the target, and yanked control back to
            // idle — a fight arriving out of nowhere on a dice roll. That is the exact
            // slot-machine beat this rework exists to remove. A mob now spawns somewhere
            // real and walks its patrol; if it comes for you it is because you got close
            // enough for it to notice, or because you hit it. See `advanceMobs`.
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
      //
      // Honours manual control, which the equivalent block above already did — this one
      // did not, and since it runs whenever a mob spawns (i.e. constantly), it re-acquired
      // a target within a second or two of the player taking over and defeated the gate
      // entirely. That is the auto-attacking and auto-walking that survived: with a target
      // set, the store fights it and the adapter's committed-target branch walks the hero
      // to it, neither of which ever consults `controlMode`.
      if (!currentMob) {
        target = mobs.find(m => m.id === targetMobId)
          ?? (controlMode === 'idle' ? nearestMob(mobs) : null)
        targetMobId = target?.id ?? null
        currentMob = target
        activeDoTs = target ? target.dots : []
        if (target) resetCombatAccumulators()
      }
    }

    // ── One seeded stream for the hero's whole combat path ────────────────────
    // Track P0 seeded three named procs (Nightfall, Creeping Freeze, Echo) and stopped
    // there, because the resolvers took no `rng` and the fork with `fight.ts` had not been
    // decided. It has been: the store adopts the shared model, and everything the hero
    // rolls now draws from THIS, so a fight is a pure function of `procState.procRngState`.
    //
    // Deliberately the same generator and the same state word `procRoll` already advances,
    // rather than a second stream beside it. Two streams would mean two things to persist,
    // two things to migrate, and an ordering question every time a new roll is added.
    //
    // Allies keep their own streams (`allyRoll`), which is the point of them being
    // separate: adding a party must not perturb what the hero rolls.
    const combatRng: Rng = () => procRoll(procState, state.worldSeed)

    // ── Party members, as combatants ─────────────────────────────────────────
    // `engine/party.ts` owns membership; this reconciles it into combat state. Joiners are
    // compiled here (once — `makeAlly` is not cheap), leavers drop, and an ally whose hero
    // has since levelled is recompiled. Reading `getParty()` from the store is fine: the
    // no-import rule is engine-must-not-import-store, and this is the other direction.
    let allies = state.allies.map(a => ({ ...a, procState: { ...a.procState } }))
    {
      const roster = getParty()
      const byKey = new Map(allies.map(a => [a.key, a]))
      allies = roster.map(m => {
        const existing = byKey.get(m.key)
        if (existing && existing.level === m.speaker.level) return existing
        // Rebuilt on level change so a companion that dinged actually gets stronger,
        // carrying HP across as a fraction rather than healing them for free.
        const fresh = makeAlly(m, state.worldSeed)
        if (existing) {
          fresh.currentHp = Math.max(1, Math.round(
            fresh.stats.maxHp * (existing.currentHp / Math.max(1, existing.stats.maxHp))))
          fresh.attackAccum = existing.attackAccum
          fresh.downedFor = existing.downedFor
          fresh.rngState = existing.rngState
        }
        return fresh
      })
    }

    // Downed allies get back up on their own clock.
    for (const a of allies) {
      if (a.downedFor <= 0) continue
      a.downedFor = Math.max(0, a.downedFor - deltaSeconds)
      if (a.downedFor === 0) {
        a.currentHp = Math.max(1, Math.round(a.stats.maxHp * 0.5))
        a.procState = defaultProcState()
        newLogs.push(log('player_respawn', `${a.name} gets back up.`, '#aaffaa'))
      }
    }

    // Nothing to FIGHT — but the world still turns, and the hero still has a body.
    //
    // This branch used to `set` a handful of combat fields and return, which quietly made
    // it the most consequential line in the tick: it skipped the world simulation AND
    // dropped `controlMode`/`manualIdleTimer` from the write, so the locals the countdown
    // had just decremented were discarded and the timer reverted to 15 every tick. Manual
    // control therefore never expired — and since manual control deliberately clears the
    // target, this branch is the one manual mode runs through constantly. The same
    // omission froze every mob's patrol and every aggro check for as long as the hero had
    // nothing targeted.
    if (!currentMob) {
      const idle = tickWorld(state, controlMode, mobs, null, targetMobId, deltaSeconds)
      if (idle.logs.length) newLogs.push(...idle.logs)
      set({ mobs: idle.mobs, targetMobId: idle.targetMobId, currentMob: null,
            mobMapOffset: idle.mobMapOffset, playerMapPos: idle.playerMapPos,
            // Allies are reconciled and revived ABOVE this branch, so they must be
            // written here too — dropping them would mean a downed companion never gets
            // back up while the hero has nothing targeted, which is most of the time
            // between fights. This is the same omission that once froze the whole world
            // tick (see the note on this branch above).
            allies,
            controlMode, manualIdleTimer,
            persistedBoss, mobRespawnTimer, procState, skillCooldowns, castState,
            totalPlayTime: state.totalPlayTime + deltaSeconds,
            combatLog: [...newLogs, ...state.combatLog].slice(0, LOG_MAX) })
      return
    }

    // ── Registering a kill ──────────────────────────────────────────────────
    // Lifted out of the player-swing block, where it used to live. That placement made
    // the player's weapon the ONLY thing that could register a death: a mob finished off
    // by a DoT tick, a summoned minion, thorns or an Umbral Bolt sat at <=0 HP until the
    // hero happened to swing again — and if the hero walked out of engagement range,
    // indefinitely. Party members made that untenable rather than merely untidy, since an
    // ally landing the killing blow is now routine.
    //
    // Everything below is the original handler, moved verbatim: loot, XP, levelling, zone
    // unlocks, quest completion, boss bookkeeping and the drop ladder all still run in the
    // store, exactly once, wherever the blow came from.
    const registerKill = (): boolean => {
      if (!currentMob || currentMob.currentHp > 0) return false
      const deadMob = currentMob!
      const loot = rollLoot(deadMob, level, stats.goldFindBonus, upg)
      gold += loot.gold
      killGoldThisTick += loot.gold

      newLogs.push(log('mob_death', `${deadMob.name} dies!`, '#ff4444'))
      newLogs.push(log('loot_gold',  `+${loot.gold} gold`,   '#ffd700'))

      // Rampage — each kill compounds into the next. Capped, and cleared whenever the
      // hero stops fighting (see `resetCombatAccumulators`), so it rewards an
      // uninterrupted streak rather than sitting at max forever.
      if (fx.rampageChance > 0 && procState.rampageStacks < RAMPAGE_MAX_STACKS) {
        procState.rampageStacks++
        newLogs.push(log('proc', `🔥 Rampage! ${procState.rampageStacks}/${RAMPAGE_MAX_STACKS}`, '#ff8800'))
      }
      rampageDecayAccum = 0
      // A new fight is a new chance to refuse to die, a fresh opener, and a fresh
      // stack of charges. Rampage is the deliberate exception: it is the ONE thing
      // meant to carry across kills, which is the whole shape of the talent.
      procState.lastStandUsed = false
      procState.openerUsed = false
      procState.arcaneCharges = 0

      // Thought: boss kill, elite kill, or regular kill (10% chance to avoid spam)
      if (deadMob.isBoss) {
        get().triggerThought('boss_kill', deadMob.name)
      } else if (deadMob.isElite) {
        get().triggerThought('elite_kill', deadMob.name)
      } else if (Math.random() < 0.15) {
        get().triggerThought('mob_kill')
      }

      xp += deadMob.xpReward
      killsThisTick++
      xpThisTick += deadMob.xpReward
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level)
        level++
        const newStats = compileStats(state.playerClass, level, equipment, talentAllocs, racialPassive)
        stats = { ...newStats, currentHp: Math.min(newStats.maxHp, stats.currentHp + 20) }
        newLogs.push(log('level_up', `★ Level Up! Now level ${level}!`, '#ffd700'))
        // Gain a talent point — but only while the hero is still under the lifetime
        // cap. Points used to accrue forever against a tree that could hold ~48 of
        // them; past that every level-up handed out a token with nowhere to spend it.
        // Levels beyond the cap still raise stats, they just stop paying talents.
        set(s => {
          if (s.talentPoints + totalSpent(s.talentAllocs) >= TALENT_POINT_MAX) return {}
          return { talentPoints: s.talentPoints + 1 }
        })
        // An ability slot opening is worth saying out loud — it is the only moment in
        // levelling where the action bar itself changes.
        for (const ab of getClassAbilities(state.playerClass)) {
          if (ab.unlockLevel === level) {
            newLogs.push(log('ability_use', `✦ ${ab.name} unlocked!`, '#ffd700'))
          }
        }
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

      // ── Where the drop goes ───────────────────────────────────────────────
      // One ladder, in this order: WEAR it, then sell it, then bag it, then salvage it.
      //
      // Equipping first is not a preference, it is the safety property. It means an
      // upgrade can never be sold or scrapped no matter how the merchant threshold is
      // set, because by the time anything else looks at the drop it is already on the
      // hero and what's being disposed of is the OLD piece. The displaced item then
      // takes the bag pressure instead of the good one.
      if (loot.item) {
        // One ladder — wear, sell, bag, salvage — shared verbatim with the offline
        // projection (engine/loot.ts). Two copies of "what happens to a drop" would
        // drift, and offline progress matching online is the entire promise.
        const placed = placeDrop(loot.item, equipment, inventory, {
          playerClass: state.playerClass, level, talentAllocs, racialPassive,
          autoEquip: state.settings.autoEquip !== false,
          contract: state.merchantContract, salvageBonus: upg.salvageRate,
        })
        if (placed.equipment !== equipment) {
          equipment = placed.equipment
          const rescored = compileStats(state.playerClass, level, equipment, talentAllocs, racialPassive)
          // Recompiling resets currentHp to full; carry the hero's real HP across, and
          // let a stamina gain raise the ceiling without healing them for free.
          rescored.currentHp = Math.min(rescored.maxHp, stats.currentHp)
          stats = rescored
          newLogs.push(log('loot_item', `Equipped ${loot.item.name}`, rarityColor(loot.item.rarity)))
        }
        inventory = placed.inventory
        gold += placed.sold + placed.salvaged
        autoSold += placed.sold
        salvaged += placed.salvaged
        if (placed.sold > 0 && placed.disposed) {
          newLogs.push(log('loot_item',
            `Factor bought ${placed.disposed.name} — ${placed.sold}g`, '#88ccaa'))
        } else if (placed.salvaged > 0 && placed.disposed) {
          newLogs.push(log('loot_item',
            `Bag full — salvaged ${placed.disposed.name} for ${placed.salvaged}g`, '#c8a100'))
        } else if (placed.outcome === 'bagged') {
          newLogs.push(log('loot_item', `Looted: ${loot.item.name}`, rarityColor(loot.item.rarity)))
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
      return true
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
        if (nightfallChance > 0 && combatRng() < nightfallChance) nightfallProc = true
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
      // A DoT that finishes the job now finishes it. This was the largest of the
      // unregistered-kill cases: an Affliction build does most of its damage here.
      registerKill()
    }

    // Gathering Dark Umbral Bolt proc
    if (nightfallProc && currentMob) {
      const boltDmg = makeShadowBoltHit(stats.weaponDps, stats.attackSpeedSeconds, 2.5)
      currentMob = { ...currentMob, currentHp: currentMob.currentHp - boltDmg }
      newFns.push(fn(boltDmg, true, false, false, '#cc44ff'))
      newLogs.push(log('proc', `⚡ Gathering Dark! Umbral Bolt hits for ${boltDmg}`, '#cc44ff'))
      registerKill()
    }

    // ── Timed crit ───────────────────────────────────────────────────────────
    // Ticks down whether or not the hero is swinging, so the free crit is a rhythm the
    // fight sits inside rather than a counter the player has to feed.
    if (fx.timedCritSeconds > 0 && procState.timedCritTimer > 0) {
      procState.timedCritTimer = Math.max(0, procState.timedCritTimer - deltaSeconds)
    }

    // ── Summoned minion ──────────────────────────────────────────────────────
    // Attacks on its own schedule alongside the hero. It exists so a Binding warlock's
    // damage does not stop the moment they stop pressing anything — which is the
    // fantasy, and happens to be exactly what an idle game wants.
    if (fx.minionDps > 0 && mobEngaged && currentMob) {
      minionAccum += deltaSeconds
      if (minionAccum >= MINION_TICK_SECONDS) {
        minionAccum -= MINION_TICK_SECONDS
        const dmg = Math.max(1, Math.round(fx.minionDps * MINION_TICK_SECONDS))
        currentMob = { ...currentMob, currentHp: currentMob.currentHp - dmg }
        newFns.push(fn(dmg, false, false, false, '#b060d0'))
        registerKill()
      }
    }

    // ── Rampage decay ────────────────────────────────────────────────────────
    // Stacks are shed on a timer since the last kill rather than cleared when the
    // target dies — between two kills in a streak `currentMob` is briefly null, and
    // clearing on that would wipe the streak the talent exists to reward.
    if (procState.rampageStacks > 0) {
      rampageDecayAccum += deltaSeconds
      while (rampageDecayAccum >= RAMPAGE_DECAY_SECONDS && procState.rampageStacks > 0) {
        rampageDecayAccum -= RAMPAGE_DECAY_SECONDS
        procState.rampageStacks--
      }
    }

    // ── Second Wind ──────────────────────────────────────────────────────────
    // Bulwark's mid-fight recovery. Only below half health, which is what stops it
    // being a flat regen aura and makes it a comeback rather than a cushion.
    if (fx.secondWindHpPerTick > 0 && isAlive && stats.currentHp > 0
        && stats.currentHp < stats.maxHp * 0.5) {
      stats.currentHp = Math.min(stats.maxHp, stats.currentHp + fx.secondWindHpPerTick * deltaSeconds)
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

      // A banked free crit is spent on THIS swing; the timer restarts from full.
      const timedCritReady = fx.timedCritSeconds > 0 && procState.timedCritTimer <= 0
      const isOpener = !procState.openerUsed

      const result = resolvePlayerAttack(
        stats, state.playerClass, talentAllocs, procState, activeBuffs, undefined,
        {
          mobHpFraction: currentMob!.currentHp / Math.max(1, currentMob!.maxHp),
          playerHpFraction: stats.currentHp / Math.max(1, stats.maxHp),
          rampageStacks: procState.rampageStacks,
          arcaneCharges: procState.arcaneCharges,
          targetBurning: activeDoTs.some(d => d.sourceType === 'burn'),
          isOpener,
          timedCritReady,
          // Was omitted, so crit / poison / extra-strike / flurry all fell back to the
          // global `Math.random` inside the resolver (combat.ts:356) while `fight.ts`
          // passed a seeded stream through the SAME function. Same code, different source
          // of truth — which is why the golden could never cover the store's path.
          rng: combatRng,
        },
      )

      if (timedCritReady) {
        procState.timedCritTimer = fx.timedCritSeconds
        newLogs.push(log('proc', '⚡ A moment of perfect stillness — guaranteed crit!', '#ffcc00'))
      }
      if (isOpener) {
        procState.openerUsed = true
        if (fx.openerBurstPct > 0) {
          newLogs.push(log('proc', `🗡 Opening strike! +${Math.round(fx.openerBurstPct * 100)}% damage`, '#c8a0ff'))
        }
      }
      // Arcane charges build on every landed swing and reset with the target.
      if (fx.arcaneChargePct > 0 && procState.arcaneCharges < ARCANE_MAX_CHARGES) {
        procState.arcaneCharges++
      }

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
        if (existing >= 0) {
          // Refresh DURATION, keep the TICK CLOCK — see the matching note in fight.ts.
          // Replacing outright reset `tickAccum` to 0, and since Corruption and Curse of
          // Agony are applied on every swing (3s tick interval against a 1.5–2.5s swing)
          // neither ever reached its first tick. The whole Bleakweave tree's signature
          // damage has been doing nothing.
          newDot.tickAccum = activeDoTs[existing].tickAccum
          activeDoTs[existing] = newDot
        } else activeDoTs.push(newDot)
      }

      // ── Proc hits: a real strike, at a reduced magnitude ────────────────────
      //
      // These were flat formulas — `weaponDps * attackSpeedSeconds * 0.7` and `* 0.5` —
      // that never entered the resolver at all. So an extra strike could not crit, could
      // not apply a bleed or a poison, ignored Executioner, Enrage, Rampage and Arcane
      // Charges, and fed neither Bloodthirst nor Seal Fate. Both talents say "strike
      // again"; what they did was deal a fraction of a swing.
      //
      // They now re-resolve a genuine attack and pass the old 0.7 / 0.5 through the
      // resolver's `multiplierOverride`, so the MAGNITUDE the game was tuned around is
      // preserved while the hit becomes a hit. `fight.ts` already re-resolved but at full
      // strength; it takes the same overrides, so the two loops finally agree.
      //
      // Not recursive, deliberately: a proc hit cannot proc again. `fight.ts` enforced the
      // same thing with a `kind === 'swing'` guard, which is one careless edit away from
      // an unbounded chain — here the procs simply are not consulted.
      // Bank a Seal Fate point and fire Sever at five. Shared by the primary swing and by
      // proc hits, so the cap is enforced in one place — incrementing in two would let
      // `comboPoints` run past five and skip the finisher entirely.
      const awardComboPoint = (): void => {
        procState.comboPoints++
        if (procState.comboPoints < 5) return
        procState.comboPoints = 0
        if (!currentMob || currentMob.currentHp <= 0) return
        const finisherDmg = Math.round(stats.weaponDps * stats.attackSpeedSeconds * 3)
        currentMob = { ...currentMob, currentHp: currentMob.currentHp - finisherDmg }
        newFns.push(fn(finisherDmg, true, false, false, '#ff8800'))
        newLogs.push(log('proc', `🎴 Sever! ${finisherDmg} damage!`, '#ff8800'))
      }

      const procHit = (mult: number, label: string, color: string): void => {
        // Nothing swings at a corpse. The mob can already be at or below zero from the
        // primary hit, and continuing to beat it inflated proc uptime and log noise.
        if (!currentMob || currentMob.currentHp <= 0) return
        const r = resolvePlayerAttack(
          stats, state.playerClass, talentAllocs, procState, activeBuffs, mult,
          {
            mobHpFraction: currentMob.currentHp / Math.max(1, currentMob.maxHp),
            playerHpFraction: stats.currentHp / Math.max(1, stats.maxHp),
            rampageStacks: procState.rampageStacks,
            arcaneCharges: procState.arcaneCharges,
            targetBurning: activeDoTs.some(d => d.sourceType === 'burn'),
            // The opener is the OPENING strike. A proc riding on it is not.
            isOpener: false,
            rng: combatRng,
          },
        )
        currentMob = { ...currentMob, currentHp: currentMob.currentHp - r.damage }
        if (state.settings.showDamageNumbers) {
          newFns.push(fn(r.damage, r.isCrit, false, false, color))
        }
        newLogs.push(log('proc', `${label} ${r.damage}${r.isCrit ? ' (CRIT!)' : ''}`, color))
        for (const newDot of r.triggeredDoTs) {
          const i = activeDoTs.findIndex(d => d.sourceType === newDot.sourceType)
          if (i >= 0) { newDot.tickAccum = activeDoTs[i].tickAccum; activeDoTs[i] = newDot }
          else activeDoTs.push(newDot)
        }
        if (r.lifeDrawn > 0 && stats.currentHp < stats.maxHp) {
          stats.currentHp = Math.min(stats.maxHp, stats.currentHp + r.lifeDrawn)
        }
        if (r.sealFatePoint) awardComboPoint()
      }

      if (result.extraHit) procHit(EXTRA_HIT_MULT, '⚡ Turning Steel! Extra strike for', '#aabbff')
      // Flurry — Warbringer's crit chain. Deliberately weaker per hit than Turning
      // Steel and gated on a crit rather than on every swing, so the two stack into a
      // fast-hands build without either one alone carrying it.
      if (result.flurryHit) procHit(FLURRY_MULT, '⚡ Flurry!', '#ffaa44')

      // Bloodthirst — health drawn back out of damage dealt. Warbringer's only
      // sustain, and the reason it can afford to have no mitigation at all.
      if (result.lifeDrawn > 0 && stats.currentHp < stats.maxHp) {
        const healed = Math.min(result.lifeDrawn, stats.maxHp - stats.currentHp)
        stats.currentHp += healed
        if (healed > 0) newFns.push(fn(healed, false, false, false, '#44ff88'))
      }

      // Written in Blood combo points. Banked by `awardComboPoint` above so a proc hit's
      // crit feeds the finisher too — it is a real strike now, and a rogue whose extra
      // strikes did not build combo points was being taxed for taking the talent.
      if (result.sealFatePoint) awardComboPoint()

      // Creeping Freeze proc
      if (fx.frostbiteChance > 0 && !procState.mobFrozen && combatRng() < fx.frostbiteChance) {
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
      registerKill()
    }

    // ── Party members attack the mob ─────────────────────────────────────────
    // Real damage, through the same `resolvePlayerAttack` the player uses — so an ally's
    // crits, DoTs and talent procs are the genuine article rather than a second damage
    // model. Every roll comes off the ally's OWN seeded stream, so adding a party does not
    // perturb the player's rolls and two allies never draw in lockstep.
    //
    // Each swing is attributed on the floating number (`allyKey`), which is what lets the
    // renderer play the hit on that companion's body instead of the hero's.
    if (mobEngaged && currentMob) {
      for (const ally of allies) {
        if (ally.downedFor > 0 || !currentMob) continue
        ally.attackAccum += deltaSeconds
        if (ally.attackAccum < ally.stats.attackSpeedSeconds) continue
        ally.attackAccum -= ally.stats.attackSpeedSeconds

        const res = resolvePlayerAttack(
          ally.stats, ally.playerClass, ally.talentAllocs, ally.procState, [], undefined,
          {
            mobHpFraction: currentMob.currentHp / Math.max(1, currentMob.maxHp),
            playerHpFraction: ally.currentHp / Math.max(1, ally.stats.maxHp),
            rampageStacks: ally.procState.rampageStacks,
            arcaneCharges: ally.procState.arcaneCharges,
            targetBurning: currentMob.dots.some(d => d.sourceType === 'burn'),
            isOpener: !ally.procState.openerUsed,
            rng: () => allyRoll(ally),
          },
        )
        ally.procState.openerUsed = true

        currentMob = { ...currentMob, currentHp: currentMob.currentHp - res.damage }
        if (state.settings.showDamageNumbers) {
          newFns.push(fn(res.damage, res.isCrit, false, false,
                         res.isCrit ? '#ffd27a' : '#9fe0a0', ally.key))
        }
        newLogs.push(log(
          res.isCrit ? 'player_crit' : 'player_attack',
          `${ally.name} hits ${currentMob.name} for ${res.damage}${res.isCrit ? ' (CRIT!)' : ''}`,
          res.isCrit ? '#ffd27a' : '#9fe0a0',
        ))
        // Allies apply their DoTs to the shared target, deduped by source like the
        // player's so three warlocks cannot stack nine corruptions.
        for (const newDot of res.triggeredDoTs) {
          const i = activeDoTs.findIndex(d => d.sourceType === newDot.sourceType)
          if (i >= 0) activeDoTs[i] = newDot
          else activeDoTs.push(newDot)
        }
        if (res.lifeDrawn > 0) {
          ally.currentHp = Math.min(ally.stats.maxHp, ally.currentHp + res.lifeDrawn)
        }
        // An ally can land the killing blow. That is the whole reason `registerKill`
        // exists at tick scope — loot, XP and the drop ladder still credit the player.
        registerKill()
      }
    }

    // ── Mob attacks player ───────────────────────────────────────────────────
    if (currentMob && !procState.mobFrozen && mobEngaged) {
      mobAttackAccum += deltaSeconds
      if (mobAttackAccum >= currentMob.attackSpeedSeconds) {
        mobAttackAccum -= currentMob.attackSpeedSeconds
        // ── Who does it swing at? ──────────────────────────────────────────
        // With a party standing, some of the incoming damage goes to them. Held below
        // half (ALLY_THREAT_SHARE) on purpose: the player is the one making decisions,
        // and a mob that mostly hits someone else turns the fight into a spectator sport.
        // The roll comes off the player's proc stream so it stays seeded and replayable.
        const standing = allies.filter(a => a.downedFor <= 0)
        const hitsAlly = standing.length > 0
          && combatRng() < ALLY_THREAT_SHARE
        if (hitsAlly) {
          // Round-robin by lowest health, so focus fire is on whoever is already hurt —
          // which is what makes a downed ally feel earned rather than arbitrary.
          const victim = standing.reduce((lo, a) =>
            a.currentHp / Math.max(1, a.stats.maxHp) < lo.currentHp / Math.max(1, lo.stats.maxHp) ? a : lo)
          const allyFx = compileTalentEffects(victim.playerClass, victim.talentAllocs)
          const hit = resolveMobAttack(
            currentMob, victim.stats.armor, allyFx.mobAttackSpeedFactor, allyFx,
            () => allyRoll(victim),
          )
          if (hit.blocked) {
            newLogs.push(log('proc', `🛡 ${victim.name} blocks!`, '#88aaff'))
          } else {
            victim.currentHp = Math.max(0, victim.currentHp - hit.damage)
            newFns.push(fn(hit.damage, false, true, false, '#ff9c9c', victim.key))
            if (hit.thorns > 0) {
              currentMob = { ...currentMob, currentHp: currentMob.currentHp - hit.thorns }
              newFns.push(fn(hit.thorns, false, false, false, '#ffaa44', victim.key))
            }
            if (victim.currentHp <= 0) {
              victim.downedFor = ALLY_REVIVE_SECONDS
              victim.attackAccum = 0
              newLogs.push(log('player_death', `${victim.name} goes down!`, '#ff4444'))
            }
          }
          // The mob spent its swing on the ally; the hero takes nothing this beat. Thorns
          // may have killed it, so register before falling through.
          registerKill()
        } else {
        // Fifth argument was omitted, so the avoidance roll drew off the global too.
        const swing = resolveMobAttack(currentMob, stats.armor, fx.mobAttackSpeedFactor, fx, combatRng)
        let mobDmg = swing.damage

        if (swing.blocked) {
          newFns.push(fn(0, false, true, false, '#88aaff'))
          newLogs.push(log('proc', `🛡 Blocked ${currentMob.name}'s blow!`, '#88aaff'))
        }

        // Retaliation — measured against damage actually dealt, so it never scales with
        // how badly the hero happens to be geared.
        if (swing.thorns > 0) {
          currentMob = { ...currentMob, currentHp: currentMob.currentHp - swing.thorns }
          newFns.push(fn(swing.thorns, false, false, false, '#ffaa44'))
          // NOT registered here. `registerKill` nulls `currentMob`, and the rest of this
          // exchange still reads it (the hit log at `${currentMob.name}` below). The mob's
          // blow has already been resolved by this point anyway, so the death is registered
          // once the exchange finishes — see after this block.
        }

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

        // The Last Yard — Bulwark's capstone. Once per fight, the blow that would have
        // killed the hero leaves them standing instead. Consumed via the same
        // once-per-encounter flag Glacial Tomb uses, and reset by the same
        // `defaultProcState()` on respawn and on engaging a new enemy.
        if (stats.currentHp <= 0 && fx.lastStandPct > 0 && !procState.lastStandUsed) {
          procState.lastStandUsed = true
          stats.currentHp = Math.max(1, Math.ceil(stats.maxHp * fx.lastStandPct))
          newLogs.push(log('proc', `💀 The Last Yard! You refuse to fall.`, '#ffd700'))
          newFns.push(fn(stats.currentHp, true, false, true, '#ffd700'))
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
        }   // end: mob swung at the hero rather than an ally
      }
    }

    // Retaliation's kill, registered once the exchange above has fully resolved — the
    // block reads `currentMob` throughout and `registerKill` nulls it. A no-op unless
    // thorns actually took the mob to zero.
    registerKill()

    // ── Auto-gather: if drifting near a resource node with no active combat ──
    let nextGameMode: GameMode = state.gameMode as GameMode
    let enteredNode: ReturnType<typeof nodeAt> = null
    if (nextGameMode === 'combat' && !currentMob) {
      enteredNode = nodeAt(state, state.playerMapPos)
      if (enteredNode) nextGameMode = 'gathering'
    }

    // ── Write the projections back into the population ────────────────────────
    // currentMob/activeDoTs were handed to the (single-target) combat code above; fold
    // the results back so `mobs` stays authoritative.
    //
    // This now runs BEFORE the world tick rather than after it. The combat code rebuilds
    // `currentMob` as a fresh object on every hit (`{ ...currentMob, currentHp: … }`), so
    // by this point it is no longer the same reference as its entry in `mobs` — and a
    // world tick that moved one of the two would silently have its work discarded when
    // the other was written out.
    if (currentMob) {
      currentMob.dots = activeDoTs
      const i = mobs.findIndex(m => m.id === currentMob!.id)
      // Update in place only. Absence means it was deliberately removed (slain, or a boss
      // cleared the field), so re-adding it here would undo that.
      if (i >= 0) { mobs[i] = currentMob; targetMobId = currentMob.id }
      else { currentMob = null; targetMobId = null }
    }

    // ── The world tick ────────────────────────────────────────────────────────
    // One simulation, both control modes and both tick paths — see `tickWorld`.
    const world = tickWorld(state, controlMode, mobs, currentMob, targetMobId, deltaSeconds)
    const playerMapPos = world.playerMapPos
    mobs = world.mobs
    currentMob = world.currentMob
    targetMobId = world.targetMobId
    const mobMapOffset = world.mobMapOffset
    if (world.logs.length) newLogs.push(...world.logs)

    // Prune old floating numbers
    const now = Date.now()
    const allFns = [...floatingNumbers.filter(f => now - f.createdAt < 1400), ...newFns]

    set({
      mobs, targetMobId,
      allies,
      stats, gold, xp, level, currentMob, persistedBoss, isAlive, respawnTimer, mobRespawnTimer,
      inventory, equipment, activeDoTs, activeBuffs, procState, castState, skillCooldowns,
      floatingNumbers: allFns,
      totalZoneKills, zoneKillCounts, bossesDefeated, unlockedZones, currentZone,
      controlMode, manualIdleTimer,
      totalPlayTime: state.totalPlayTime + deltaSeconds,
      offlineRates: accrueRates(
        state.offlineRates, deltaSeconds, killGoldThisTick, xpThisTick, killsThisTick,
      ),
      // Evidence for the retreat rule. Reset whenever the hero changes zone, so it always
      // describes the ground they are standing on.
      zoneWatch: state.zoneWatch.zone === currentZone
        ? { zone: currentZone, seconds: state.zoneWatch.seconds + deltaSeconds,
            kills: state.zoneWatch.kills + killsThisTick }
        : { zone: currentZone, seconds: deltaSeconds, kills: killsThisTick },
      totalSalvaged: state.totalSalvaged + salvaged,
      totalAutoSold: state.totalAutoSold + autoSold,
      // Bank what the factor moved this tick against their next bill.
      merchantContract: state.merchantContract && autoSold > 0
        ? { ...state.merchantContract, soldSinceBill: state.merchantContract.soldSinceBill + autoSold }
        : state.merchantContract,
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

    // ── Move on, or fall back ────────────────────────────────────────────────
    // Runs against the JUST-COMMITTED state so it sees this tick's zoneWatch, and only
    // between fights, so it never yanks the hero off an enemy mid-swing.
    const committed = get()
    if (committed.gameMode === 'combat' && committed.isAlive && !committed.currentMob) {
      const move = decideZoneMove(committed)
      if (move) {
        if (move.retreat) {
          set({
            // Remember the level this zone beat us at — auto-advance will not bring the
            // hero back until they have out-levelled the defeat.
            zoneBlockedAtLevel: {
              ...committed.zoneBlockedAtLevel, [committed.currentZone]: committed.level,
            },
            combatLog: [
              log('zone_change',
                `Nothing here falls to you. Falling back to ${ZONES[move.to].name}.`, '#ff8844'),
              ...committed.combatLog,
            ].slice(0, LOG_MAX),
          })
        }
        // Walk there, using the same journey a player's click would take — travel time
        // and all — rather than teleporting. `canEnterZone` gates on a MINIMUM level and
        // the prerequisite boss, so a retreat to already-cleared ground always passes.
        get().beginTravel(move.to)
      }
    }
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

  /**
   * Buy one more bag slot from the town outfitter — the game's first gold sink.
   *
   * Deliberately a purchase of *capacity*, not of an item: it is worth the same to a
   * player who never opens a menu again, because the thing it improves is the unattended
   * loop. That is the test every sink in this economy has to pass.
   */
  buyBagSlot: () => {
    const s = get()
    if (s.gameMode !== 'in_town') return
    if (s.bagSlotsPurchased >= BAG_SLOTS_MAX_PURCHASED) return
    const cost = townPrice(bagSlotCost(s.bagSlotsPurchased), s.currentTown, s.playerFaction)
    if (s.gold < cost) return
    const purchased = s.bagSlotsPurchased + 1
    set({
      gold: s.gold - cost,
      bagSlotsPurchased: purchased,
      inventory: [...s.inventory, null],
      combatLog: [
        log('proc', `Bought a bag slot for ${cost}g — ${INVENTORY_SLOTS + purchased} slots.`, '#c8a100'),
        ...s.combatLog,
      ].slice(0, LOG_MAX),
    })
  },

  dismissOfflineReport: () => { if (get().lastOffline) set({ lastOffline: null }) },

  /**
   * Buy one more rank of a standing upgrade — the sink that never runs out.
   *
   * Available in town like the rest of the economy's purchases. Costs grow geometrically
   * while the benefit stays linear, so this absorbs a gold curve that spans ~500× without
   * any price ever needing to be revisited, and can never run away with itself.
   */
  buyUpgrade: (id) => {
    const s = get()
    if (s.gameMode !== 'in_town') return
    const def = UPGRADE_BY_ID[id]
    if (!def) return
    const rank = s.upgradeRanks[id] ?? 0
    const cost = townPrice(upgradeCost(rank), s.currentTown, s.playerFaction)
    if (s.gold < cost) return
    set({
      gold: s.gold - cost,
      upgradeRanks: { ...s.upgradeRanks, [id]: rank + 1 },
      combatLog: [
        log('proc', `${def.name} ${rank + 1} — ${cost}g. ${def.description}.`, '#c8a100'),
        ...s.combatLog,
      ].slice(0, LOG_MAX),
    })
  },

  /** Reported by the world scene as the hero walks around town. */
  setActiveTownNpc: (id) => {
    if (get().activeTownNpc !== id) set({ activeTownNpc: id })
  },

  /** Player's call on whether the hero roams the world unsupervised. */
  setAutoAdvanceZones: (on) => {
    const s = get()
    if ((s.settings.autoAdvanceZones !== false) === on) return
    set({ settings: { ...s.settings, autoAdvanceZones: on } })
  },

  /** Player's call on whether drops are worn automatically. Persisted with the save. */
  setAutoEquip: (on) => {
    const s = get()
    if ((s.settings.autoEquip !== false) === on) return
    set({ settings: { ...s.settings, autoEquip: on } })
  },

  /**
   * Engage a factor. The keystone sink: it costs gold up front and gold to keep, and what
   * it buys is a better unattended run — junk converted at full price instead of clogging
   * the bag until everything after it salvages at 20%.
   *
   * Opens at `rare`, i.e. sell commons and uncommons, keep rare and up. That is the
   * setting that helps most while being impossible to regret.
   */
  buyMerchantContract: () => {
    const s = get()
    if (s.gameMode !== 'in_town') return
    if (s.merchantContract) return
    const cost = townPrice(MERCHANT_CONTRACT_COST, s.currentTown, s.playerFaction)
    if (s.gold < cost) return
    set({
      gold: s.gold - cost,
      merchantContract: {
        threshold: 'rare', upkeepTimer: MERCHANT_UPKEEP_SECONDS, lapsed: false, soldSinceBill: 0,
      },
      combatLog: [
        log('proc', `A factor takes your retainer — ${cost}g, then ${Math.round(MERCHANT_UPKEEP_RATE * 100)}% of what they move.`, '#88ccaa'),
        ...s.combatLog,
      ].slice(0, LOG_MAX),
    })
  },

  /** Retune what the factor is allowed to sell. Free, and available outside town —
   *  it is a standing instruction, not a renegotiation. `common` sells nothing. */
  setMerchantThreshold: (threshold) => {
    const s = get()
    if (!s.merchantContract) return
    if (s.merchantContract.threshold === threshold) return
    set({ merchantContract: { ...s.merchantContract, threshold } })
  },

  /** Dismiss the factor, so upkeep can never trap a player who no longer wants it.
   *  No refund — but nothing is lost either, since the bag reverts to T1 behaviour. */
  cancelMerchantContract: () => {
    const s = get()
    if (!s.merchantContract) return
    set({
      merchantContract: null,
      combatLog: [log('proc', 'You release your factor from retainer.', '#9d9d9d'), ...s.combatLog].slice(0, LOG_MAX),
    })
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
      gameMode: 'combat', currentTown: null, activeTownNpc: null, mobs: [], targetMobId: null, currentMob: null,
      mobRespawnTimer: 0, activeDoTs: [], travelTarget: null, travelProgress: 0,
      playerMapPos: { x: 32, y: 32 },
    })
  },

  // ── Talents ──────────────────────────────────────────────────────────────────
  // Both gates delegate to data/specs.ts rather than carrying their own copy of the
  // rules. The store and the tree UI used to each re-implement "is this legal", which
  // is one implementation too many: the UI could draw a node as available that the
  // store would then silently refuse, and the player got no click and no explanation.
  allocateTalent: (talentId) => {
    const s = get()
    const node = TALENT_BY_ID[talentId]
    if (!node) return
    if (SPEC_OF_TALENT[talentId] === undefined) return
    if (!talentGate(node, s.talentAllocs, s.talentPoints).ok) return

    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const talentAllocs = { ...s.talentAllocs, [talentId]: (s.talentAllocs[talentId] ?? 0) + 1 }
    const stats = compileStats(s.playerClass, s.level, s.equipment, talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs, talentPoints: s.talentPoints - 1, stats })
  },

  deallocateTalent: (talentId) => {
    const s = get()
    const node = TALENT_BY_ID[talentId]
    if (!node) return
    if (!canDeallocate(node, s.talentAllocs).ok) return

    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const talentAllocs = { ...s.talentAllocs, [talentId]: (s.talentAllocs[talentId] ?? 0) - 1 }
    const stats = compileStats(s.playerClass, s.level, s.equipment, talentAllocs, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs, talentPoints: s.talentPoints + 1, stats })
  },

  resetTalents: () => {
    const s = get()
    const racialPassive = RACE_DEFINITIONS[s.playerRace]?.racialPassive ?? {}
    const spent = totalSpent(s.talentAllocs)
    const stats = compileStats(s.playerClass, s.level, s.equipment, {}, racialPassive)
    stats.currentHp = Math.min(stats.maxHp, s.stats.currentHp)
    set({ talentAllocs: {}, talentPoints: s.talentPoints + spent, stats })
  },

  // ── Skill Bar ────────────────────────────────────────────────────────────────
  activateAbility: (abilityId) => {
    const s = get()
    if (!s.isAlive) return
    // Using an ability keeps manual control ALIVE, but does not seize it. Seizing now
    // drops the auto-pilot's target (see `bumpManualInput`), and firing a spell at the
    // thing you are fighting must not untarget it one line before the effect resolves.
    // Taking control is what movement input is for.
    if (s.controlMode === 'manual') get().bumpManualInput()
    if (s.castState) return                       // one cast at a time — no spam/queue
    if ((s.skillCooldowns[abilityId] ?? 0) > 0) return
    const ability = ACTIVE_ABILITIES.find(a => a.id === abilityId)
    if (!ability || !ability.classes.includes(s.playerClass)) return
    if (s.level < ability.unlockLevel) return      // slot not open yet
    // Allow self-target abilities (hot/heals) even without a mob; block others
    if (!s.currentMob && !ability.effects.some(e => e.type === 'hot')) return

    // Timed ability → begin a channel. The effect fires in tick when the cast bar
    // fills; cooldown starts on completion so an interrupt doesn't burn it.
    const mod = compileTalentEffects(s.playerClass, s.talentAllocs).abilityMods[abilityId]
    const castTime = (ability.castTimeSeconds ?? 0) * (mod?.castTimeMult ?? 1)
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

    // The hero's trees reach into the action bar here. `damageMult` scales every
    // magnitude the ability carries; `extraEffects` are riders talents bolted on; and
    // the cooldown it starts is the modified one, so a Warbringer's Red Harvest really
    // does come back sooner rather than merely claiming to in a tooltip.
    const castFx = compileTalentEffects(s.playerClass, s.talentAllocs)
    const mod = castFx.abilityMods[abilityId] ?? emptyAbilityMod()

    // Echo — the arcane tree's signature. The ability resolves a SECOND time, at full
    // strength, for free. Rolled once here rather than per-effect so a multi-effect
    // ability echoes as one coherent cast instead of partially.
    const echoed = castFx.echoChance > 0 && procRoll(procState, s.worldSeed) < castFx.echoChance
    const scale = mod.damageMult * (echoed ? 2 : 1)
    if (echoed) newLogs.push(log('proc', `✨ Echo! ${ability.name} resolves twice.`, '#c8a0ff'))

    for (const effect of [...ability.effects, ...mod.extraEffects]) {
      switch (effect.type) {
        case 'freeze_mob':
          procState.mobFrozen = true
          procState.mobFrozenTimer = effect.durationSeconds ?? 4
          break
        case 'shadow_bolt':
          if (currentMob) {
            const dmg = makeShadowBoltHit(stats.weaponDps, stats.attackSpeedSeconds, effect.value * scale)
            currentMob.currentHp -= dmg
            newFns.push(fn(dmg, true, false, false, '#cc44ff'))
            newLogs.push(log('ability_use', `☠ Umbral Bolt strikes for ${dmg}!`, '#cc44ff'))
          }
          break
        case 'hot':
          // Heal over time — apply as buff
          newBuffs.push(makeAbilityBuff(abilityId, { ...effect, value: effect.value * scale }, ability.name, ability.icon))
          newLogs.push(log('ability_use', `💚 ${ability.name} — healing over time...`, '#44ff88'))
          break
        default:
          newBuffs.push(makeAbilityBuff(abilityId, { ...effect, value: effect.value * scale }, ability.name, ability.icon))
          newLogs.push(log('ability_use', `✨ ${ability.name} activated!`, '#ffd700'))
      }
    }

    // Process hot immediately in tick, but set it up here
    // Handle next_hit_multiplier as well
    const skillCooldowns = {
      ...s.skillCooldowns,
      [abilityId]: ability.cooldownSeconds * mod.cooldownMult,
    }

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

  setColorway: (id) => {
    // The gate. Entitlements are read live from RevenueCat's cached CustomerInfo rather
    // than from the save, so a refund or an expired entitlement takes effect without
    // needing a migration — and a save carrying a colorway the player no longer owns
    // simply cannot be re-equipped.
    if (!isColorwayUnlocked(id, getPurchaseState().active)) return false
    set({ colorway: id })
    get().saveGame()
    return true
  },

  setControlMode: (mode) => {
    if (mode === get().controlMode) {
      if (mode === 'manual') set({ manualIdleTimer: MANUAL_IDLE_TIMEOUT_SECONDS })
      return
    }
    if (mode === 'manual') {
      set({ controlMode: 'manual', manualIdleTimer: MANUAL_IDLE_TIMEOUT_SECONDS })
    } else {
      set({ controlMode: 'idle', manualIdleTimer: 0 })
    }
  },

  // The renderer owns the hero's feet under manual control — it is the only thing that
  // sees WASD and taps — so it reports them back here. Without this the store has no idea
  // where the player actually is while they are steering, which is what made proximity
  // aggro impossible: `playerMapPos` was a sine-wave drift that ignored input entirely.
  reportPlayerWorldPos: (x, y) => {
    const wrap = (v: number) => ((v % 64) + 64) % 64
    const p = get().playerMapPos
    const nx = wrap(x), ny = wrap(y)
    // Sub-tenth-of-a-tile moves are below anything the simulation reacts to, and this is
    // called every frame — skipping them avoids a store write (and a React re-render
    // storm) 60 times a second while the hero stands still.
    if (Math.abs(p.x - nx) < 0.05 && Math.abs(p.y - ny) < 0.05) return
    set({ playerMapPos: { x: nx, y: ny } })
  },

  bumpManualInput: () => {
    if (get().controlMode === 'manual') {
      set({ manualIdleTimer: MANUAL_IDLE_TIMEOUT_SECONDS })
      return
    }
    // ── Taking control releases the auto-pilot's fight ────────────────────────
    // Gating target ACQUISITION was not enough: those checks are all `if (!currentMob)`,
    // so a fight already under way when the player grabs the reins simply continued —
    // the hero kept swinging and the adapter's committed-target branch kept walking them
    // back in. Measured as `engaged: true` persisting for 18s after a keypress, which is
    // exactly the "manual mode still autoattacks and autowalks" report.
    //
    // Dropping the target is what "override" has to mean. Anything with aggro on you
    // still chases and can still hit you — you are simply no longer swinging at something
    // you did not choose. Re-target deliberately by tapping it.
    set(s => ({
      controlMode: 'manual',
      manualIdleTimer: MANUAL_IDLE_TIMEOUT_SECONDS,
      // Remembered, not just discarded. Handing control back used to re-acquire via
      // `nearestMob`, which after any walking is usually a DIFFERENT enemy — and the
      // renderer rebinding to it looked like the monster teleporting (measured at 13–19
      // tiles in one frame). Keep the commitment so idle can resume the same fight.
      lastEngagedMobId: s.targetMobId ?? s.lastEngagedMobId,
      targetMobId: null,
      currentMob: null,
      activeDoTs: [],
    }))
    resetCombatAccumulators()
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
    get().bumpManualInput()
    set({ targetMobId: mobId, currentMob: mob, activeDoTs: mob.dots, mobMapOffset: mob.offset })
    resetCombatAccumulators()
  },

  engageTarget: () => {
    const s = get()
    const mob = s.currentMob
    if (!mob || s.gameMode !== 'combat' || !s.isAlive) return
    if (mob.offset.dx === 0 && mob.offset.dy === 0) return
    // Deliberately does NOT bump manual control. This fires from the render adapter when
    // a committed target is REACHED (`onEngageTarget`), which happens on every idle kill —
    // so bumping here re-asserted manual control a few times a minute forever, the 15s
    // timeout never elapsed, and `controlMode` was pinned to 'manual' for the whole
    // session. That is why manual mode was indistinguishable from idle: the flag never
    // meant anything. Arriving at a mob is the auto-pilot working, not the player
    // steering. Explicit intent still bumps it — `setTarget` (tapping an enemy),
    // `activateAbility` (pressing a button), WASD and tap-to-move.
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
