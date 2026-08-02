// The imperative bridge from game state → dimetric scene. Owns the canvas rAF
// work so the React host stays cheap: the host feeds store snapshots via sync(),
// forwards floatingNumber events to the attack triggers, and forwards keyboard
// input via setKey(); everything else (entity placement, animation, camera, jump,
// floaters) is handled here, read-only over the store — zero combat-logic diffs.
//
// World model: the 64×64 game zone is a torus. We bake it once as a PADDED_W×
// PADDED_W wrapped map (mapAdapter) and keep the player entity at its zone-snap
// buffer position in auto mode; a mob (when present) is GLUED to the player entity
// (mob.tx = player.tx + offset) so approach + engagement always read from the same
// anchor and lunges can never slingshot across the screen.

import { Scene, type Camera, type Entity } from '../scene'
import { bakeGround, feetX, feetY, HALF_W, HALF_H, type GroundBuffer } from '../tilemap'
import { loadSprite, loadSpriteOrPlaceholder } from '../indexedSprite'
import { makeHumanoidRig, makeBeastRig, makeTileset, makePropSheet, makePropEntities, TALL_PROP, makeBoltRig, makeBurstRig, TILE_ANIMS, TILE } from '../placeholderArt'
import { getPalette, hasPalette, registerPaletteRaw, RARITY_ACCENTS } from '../palettes'
import { composePalette } from '../palette'
import { heroPaletteId } from './heroWardrobe'
import { zoneMapToTileMap, biomePaletteId, MAP_SIZE, PAD } from './mapAdapter'
import { getWalkMask, isWalkable, nearestWalkable, hasLineOfWalk, findPath } from '../../engine/walkability'
import { TOWN_NPCS, NPC_TALK_RADIUS, type TownNpcDef, type TownServiceKind } from '../../data/townNpcs'
import { Animator } from '../animation'
import { HERO_SPRITES, MONSTER_SPRITES, ORIGINAL_SPRITE, resolveMobSprite, isMonsterSprite, isHumanoidMonster, heroSpriteId, useScaffoldArt } from './fftaRoster'
import { mulberry32, subStream, type Rng } from '../../engine/rng'
import { AGGRESSIVE_RE, combatantOnlyWorldFields, isRangedMob } from '../../engine/mobBehaviour'
import { runFight, type FightEvent, type HeroCombatant } from '../../engine/fight'
import {
  makeAmbientHero, pickBark, BARK_CHANCE, BARK_SECONDS, BARK_COOLDOWN_SECONDS,
  BARK_MAX_CONCURRENT, AMBIENT_BRAIN_HZ, AMBIENT_FIGHT_BUDGET,
  type AmbientIdentity, type AmbientState, type BarkEvent,
} from '../../engine/ambient'
import {
  takeChatLine, requestLiveBark, pumpChatPools, type ChatContext, type ChatSpeaker,
} from '../../engine/chatGen'
import { pushChat, resolveChat } from '../../engine/chatLog'
import { getParty, disbandParty, setCompanionStatus } from '../../engine/party'
import { entityKey } from '../../engine/whisper'
import { ZONES } from '../../data/zones'
import type { Facing, IndexedSprite } from '../types'
import type {
  GameState, MobInstance, ClassType, RaceType, FactionType, Rarity, FloatingNumber, MapNode, MapScenery, WeatherType, ZoneId,
  Item, Slot,
} from '../../data/types'

export const CSS_SCALE = 2

// FN color → spell school, for VFX classification (game-free; the store already
// tags Umbral Bolt hits with this exact color).
const SHADOW_BOLT_COLOR = '#cc44ff'

// ── Tuning ────────────────────────────────────────────────────────────────────
const MANUAL_SPEED = 4.2      // tiles/sec while WASD is held
const AUTO_LERP_K = 6         // exp-approach rate for auto-follow (1/s); tracks the
                              // store's drift/travel with a small steady-state lag
const JUMP_DURATION = 0.55    // seconds, apex at the midpoint
const JUMP_HEIGHT = 16        // px lift at apex
const SHAKE_DURATION = 0.26   // seconds a rumble decays over
const DEATH_DURATION = 0.7    // seconds a slain mob plays death + fades before retiring
const LUNGE_MAX = 1.35        // tiles; the attack lunge never exceeds this (no slingshot)
const ENGAGE_DIST = 1.5       // mob "engaged" threshold (matches the store's mobEngaged)
// Engagement gap from the player, in per-axis diagonal tiles. The store shrinks
// mobMapOffset to 0 (mob on the player's tile); we instead hold the mob off by
// this much once it has arrived. Melee is close enough to lunge; ranged stands
// back and casts. Sized for the dimetric projection: a diagonal step is only
// TILE_H (16px) tall on screen while sprites are ~32px, so ~2 tiles keeps melee
// bodies from overlapping even when the mob settles due-south of the player.
// Mob convergence. The mob is never hard-placed: it eases toward its target so it can
// always be SEEN covering ground. Floor keeps an exponential approach from crawling the
// last fraction of a tile; fade hides the moment a spawn materialises inside the (wide)
// visible radius.
// Footfall cadence. The rigs deliberately animate 'idle' while walking (their 'walk' tag
// is a flinchy jitter), so a moving unit is otherwise pixel-identical to a standing one —
// and because the camera is locked to the hero, that made "we walked to it" and "it walked
// to us" look exactly the same on screen. A small vertical bounce is the cheapest honest
// cue that a body is covering ground.
const WALK_CADENCE = 9         // rad/s; abs(sin) → ~2.9 steps/sec
const WALK_BOB_PX = 2
const MOB_CLOSE_K = 5          // approach rate while closing (1/s)
const MOB_ENGAGE_K = 14        // faster once engaged, so the fighting gap settles quickly
const MOB_MIN_CLOSE = 1.2      // tiles/sec floor
const BYSTANDER_SPEED = 3.4    // tiles/sec for an enemy walking in to take up station
const MOB_SPAWN_FADE = 0.4     // seconds
const MELEE_GAP_TILES = 2
const RANGED_GAP_TILES = 5

// ── Mappings (display-only; internal ids untouched) ──────────────────────────

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
}

// Ranged/caster mobs keep a multi-tile engagement distance and cast (spawn a bolt)
// instead of lunging; predators charge while territorial things hold their ground. Both
// patterns moved to `engine/mobBehaviour.ts` when the STORE started needing temperament
// too — see the note there on why this is single-sourced rather than duplicated.

function bestEquipmentRarity(state: GameState): Rarity {
  let best: Rarity = 'common'
  let rank = -1
  for (const item of Object.values(state.equipment)) {
    if (!item) continue
    const r = RARITY_RANK[item.rarity]
    if (r > rank) { rank = r; best = item.rarity }
  }
  return best
}

function mobPaletteId(mob: MobInstance): string {
  if (mob.isBoss) {
    const id = 'mob/boss'
    if (!hasPalette(id)) {
      registerPaletteRaw(id, composePalette(getPalette('team/enemy'), RARITY_ACCENTS.legendary))
    }
    return id
  }
  return mob.isElite ? 'elite' : 'team/enemy'
}

const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v

// ── Floaters (DOM pool, fixed size, zero per-frame allocation) ────────────────
// Each floater is anchored to an entity so the number rises from the unit and
// follows it; when the anchor is gone (mob died) it freezes at the last spot and
// finishes its rise/fade. Lifetime is short with an ease-out fade that begins
// immediately, and a full pool recycles the oldest entry (LRU) so new damage always
// shows instead of piling up at full opacity.
const FLOATER_POOL = 16
const FLOATER_LIFE = 0.95
interface Floater {
  el: HTMLDivElement
  t: number        // remaining seconds; <= 0 = free
  anchor: Entity | null
  wx: number       // last resolved world-x (buffer space)
  wy: number       // last resolved world-y (buffer space, already at head height)
}

// ── Lunge choreography (ported from the dev harness duel) ─────────────────────
/** A cached A* route plus the goal it was computed for, so it only repaths when needed. */
interface PathState {
  pts: { x: number; y: number }[]   // game-coord waypoints, remaining
  i: number                          // index of the waypoint being walked to
  gx: number; gy: number             // goal the route was built for (game coords)
  cool: number                       // seconds until a repath is allowed
}

interface Lunge {
  active: boolean
  t: number           // 0→1→0 triangle progress driver
  homeX: number       // buffer-tile home position
  homeY: number
  targetX: number     // buffer-tile target (clamped to LUNGE_MAX from home)
  targetY: number
}

interface InputState { up: boolean; down: boolean; left: boolean; right: boolean }

// ── Controller ───────────────────────────────────────────────────────────────

// ── Particle FX (bloom via additive compositing) ────────────────────────────
// World-buffer-space particles rendered after the scene with globalCompositeOperation
// 'lighter' (overlapping glows sum → bloom) + shadowBlur halos + radial-gradient orbs.
// Recovers the legacy CombatParticles vocabulary (orb/spark/ring/flash) at more volume.
interface Particle {
  x: number; y: number          // world-buffer px (feetX/feetY space)
  vx: number; vy: number        // px/sec
  life: number; decay: number   // 1→0, per second
  r: number
  color: string; glow: string
  kind: 0 | 1 | 2 | 3           // 0 spark · 1 orb · 2 ring · 3 flash
}
const PARTICLE_CAP = 640
const P_SPARK = 0, P_ORB = 1, P_RING = 2, P_FLASH = 3

// FX color pair (bright core → glow halo) per school/impact palette id.
const FX_COLORS: Record<string, { core: string; glow: string }> = {
  'spell/shadow': { core: '#e2b8ff', glow: '#9038d8' },
  'spell/fire':   { core: '#ffe070', glow: '#f0501c' },
  'spell/frost':  { core: '#dcf4ff', glow: '#3c8ce0' },
  'spell/holy':   { core: '#fff6c8', glow: '#f0c030' },
  'fx/hitflash':  { core: '#ffd8b0', glow: '#ff5828' },
}
function fxColors(pal: string): { core: string; glow: string } {
  return FX_COLORS[pal] ?? { core: '#eaf0ff', glow: '#7fb0ff' }
}

// Per-biome ambient particle character (environment life). Purely decorative canvas
// glow (additive) — no game state. rise<0 floats up (embers/fireflies); drift is the
// horizontal wind. Biomes not listed have no ambient emitter.
interface AmbientCfg { color: string; count: number; rise: number; drift: number; size: number; twinkle?: boolean }
const BIOME_AMBIENT: Partial<Record<ZoneId, AmbientCfg>> = {
  thornvale_jungle:  { color: '#a8ff60', count: 14, rise: -18, drift: 8,  size: 1.6, twinkle: true }, // fireflies
  grimshade_forest:  { color: '#9a7cff', count: 10, rise: -8,  drift: 6,  size: 1.4, twinkle: true }, // spirit motes
  ashfire_peaks:     { color: '#ff7020', count: 20, rise: -26, drift: 10, size: 1.5 },                // embers
  cinderfall_wastes: { color: '#ff8828', count: 18, rise: -24, drift: 12, size: 1.5 },                // ash embers
  dustwind_plains:   { color: '#d8c890', count: 14, rise: -2,  drift: 34, size: 1.3 },                // dust
  ironcrag_badlands: { color: '#c89060', count: 12, rise: -2,  drift: 30, size: 1.3 },                // grit
  warsong_mesa:      { color: '#d0a070', count: 12, rise: -2,  drift: 30, size: 1.3 },                // grit
  venom_hollows:     { color: '#b0ff50', count: 13, rise: -10, drift: 6,  size: 1.6, twinkle: true }, // toxic spores
  the_maw_eternal:   { color: '#60ff90', count: 12, rise: -12, drift: 5,  size: 1.5, twinkle: true }, // corrupt wisps
  the_bloodfields:   { color: '#ff5555', count: 9,  rise: -6,  drift: 10, size: 1.3 },                // war embers
}

// Biomes whose scenery reads as dead/rocky (grey wood, charred stone) vs. living
// (green foliage). Drives the scenery prop palette choice.
const BARREN_SCENERY = new Set<ZoneId>([
  'dustwind_plains', 'ironcrag_badlands', 'warsong_mesa', 'ashfire_peaks',
  'the_bloodfields', 'cinderfall_wastes', 'the_maw_eternal',
])

// ── Simulated MMO ambience (Track L0) ─────────────────────────────────────────
// Other heroes + monsters roam each zone so the world reads like a populated server
// rather than a lone duel. Purely local, seeded, render-only — no combat sim, no
// netcode. Heroes wear real (spriteId, paletteId) identities (the same wardrobe the
// player + future PvP snapshots use) and carry faction-coloured nameplates.
const AMBIENT_NAMES = [
  'Aldric', 'Brenna', 'Corvin', 'Dahlia', 'Eirik', 'Fenna', 'Gorvan', 'Haldis',
  'Ivo', 'Jora', 'Kaelen', 'Lyra', 'Morrin', 'Nyssa', 'Orin', 'Perrin',
  'Roan', 'Sable', 'Torin', 'Ulla', 'Vesk', 'Wren', 'Yorick', 'Zara',
]
const AMBIENT_CLASSES: ClassType[] = ['warrior', 'mage', 'rogue', 'warlock']
const CONCORD_RACES: RaceType[] = ['human', 'dwarf', 'elf']
const ASHMARCH_RACES: RaceType[] = ['orc', 'troll', 'goblin']
// Weighted toward common so a rare/epic/legendary drop-in reads as special.
const AMBIENT_RARITY: Rarity[] = ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'epic', 'legendary']
const AMBIENT_MEMBER_LEASH = 3.2   // how far a member roams from its group's anchor
const AMBIENT_GROUP_SPREAD = 9     // how far group anchors sit from the player (in view)
const AMBIENT_RECYCLE_DIST = 24    // anchor this far past the player recycles ahead
// ── L0 behaviour ranges (tiles) ───────────────────────────────────────────────
const AMBIENT_SEEK_RANGE = 6.5     // how far a hero will look for something to fight
const AMBIENT_ENGAGE_RANGE = 1.4   // close enough to start swinging
const AMBIENT_CHAT_RANGE = 4.0     // close enough to say something to another hero
const AMBIENT_MOB_RESPAWN = 7      // base seconds before a slain ambient monster returns
// ── Party companion (L2) ──────────────────────────────────────────────────────
const FOLLOW_NEAR = 2.2            // close enough; stop crowding the player
const FOLLOW_FAR = 3.4             // beyond this, close the gap
const FOLLOW_TELEPORT = 26         // hopelessly far (player travelled) → catch up off-screen
const FOLLOW_SPEED = 2.0           // slightly faster than idle wander, so they keep up
// A follower hunts over a much wider radius than a wandering hero. It is walking WITH
// the player, away from the anchored encounter groups, so at the normal 6.5-tile seek
// range it almost never found anything and simply trailed along in silence — which read
// as a companion with no behaviour at all.
const FOLLOW_SEEK_RANGE = 13
/** Base seconds between companion skirmishes. Low enough that a companion reads as
 *  actively fighting alongside you rather than occasionally remembering how. */
const COMPANION_SPAR_INTERVAL = 9

/** Ambient heroes fight unequipped — their power comes from level + spec, and giving
 *  them real loadouts would mean generating items, which is the player's economy. */
const EMPTY_EQUIPMENT: Record<Slot, Item | null> = {
  weapon: null, helm: null, chest: null, legs: null, boots: null, trinket: null,
}

// Encounter-group templates (heroes h, monsters m). Weighted so the world reads as a
// mix — parties fighting a mob, a lone monster, a 1v1 duel, a hero patrol — instead of
// one uniform crowd. `fight` groups start their members trading attack anims.
// Decorative crowd. Monsters appear here only as the OPPONENT in someone else's fight —
// that reads unmistakably as another hero's business, not as loose prey. The former
// hero-less "lone monster" and "monster pack" groups are gone: real, selectable enemies
// now populate the zone (store `mobs`), and a decorative monster standing next to a
// clickable one is just a lie about what you can attack.
const AMBIENT_GROUPS: { h: number; m: number; fight: boolean; w: number }[] = [
  { h: 2, m: 1, fight: true,  w: 4 },  // party vs monster
  { h: 1, m: 1, fight: true,  w: 4 },  // 1v1 duel
  { h: 2, m: 0, fight: false, w: 3 },  // hero patrol (2)
  { h: 1, m: 0, fight: false, w: 3 },  // lone hero
]
// Group counts by context — the open world is moderate; town/capital is a busy hub.
const AMBIENT_GROUPS_WORLD = 5
const AMBIENT_GROUPS_TOWN = 9

// ── Town hub (capital-as-a-busy-hub) ──────────────────────────────────────────
// In-town swaps to a flat pre-rendered FFTA town map as a static backdrop with a
// CLAMPED, non-wrapping camera, a dense idle crowd, and labeled building anchors you
// walk to (blacksmith / witch-doctor / tavern / stash). Town entities use RAW tile
// coords (no PAD/torus) — a distinct mode from the wrapping open world.
// LOCAL DEV SCAFFOLD ONLY (gitignored map art); launch-blocker to replace with original art.
const TOWN_MAP_FILE = 'map40.png'
const TOWN_SCALE = 1.6          // upscale the 512² town PNG to match sprite footprint
const TOWN_WALK_RADIUS = 6.5    // raw tiles the player may roam from town centre
const TOWN_CROWD = 12           // idle heroes milling in the square

interface TownFolk { e: Entity; hx: number; hy: number; tx: number; ty: number; t: number; name: string; faction: FactionType }
/** A service NPC: a body at a fixed anchor whose menu opens when the hero reaches it. */
interface TownNpcEnt { def: TownNpcDef; e: Entity }

// ── FFTA scaffold cache ────────────────────────────────────────────────────────
// Race/class and monster sprite selection lives in fftaRoster.ts.  This cache holds
// the loaded IndexedSprites so the same art can be reused across the player, mobs, and
// the ambient/town crowds.  Missing entries fall back to the programmatic rigs below.

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface Ambient {
  e: Entity
  kind: 'hero' | 'mob'
  gx: number; gy: number    // wrapping game-tile position (0..64)
  tgx: number; tgy: number  // current wander target (near the group anchor)
  t: number                 // seconds until repick
  fightT: number            // >0 → skirmishing (attack anims, no wander)
  atkCd: number
  name: string
  level: number
  faction: FactionType
  grp: number               // index into ambientGroups (its encounter cluster)

  // ── L0: behaviour ───────────────────────────────────────────────────────────
  /** This hero's own stream. Per-hero rather than shared, so culling an off-screen
   *  hero cannot change what the heroes still on screen roll. */
  rng: Rng
  state: AmbientState
  /** Full identity for heroes (class/race/level/spec/talents); null for monsters. */
  identity: AmbientIdentity | null
  /** Current bark text and the seconds it stays up. */
  bark: string | null
  barkT: number
  /** Seconds until this hero may speak again. */
  barkCd: number

  // ── L0b: real, simulated fights ─────────────────────────────────────────────
  /** The resolved fight, produced once by `runFight` and then PLAYED BACK over time.
   *  Resolving up front and replaying is what keeps a real combat sim off the frame
   *  budget — and it is the same shape Track P will use to render a ghost duel. */
  fightLog: FightEvent[] | null
  /** Playback cursor: elapsed sim-seconds, and the next event index to fire. */
  playT: number
  playIdx: number
  /** Index into `ambient` of the opponent this hero committed to. */
  foe: number
  /** Did this hero win its last fight? Drives the loot beat and which bark fires. */
  wonLast: boolean
  /** Party companion: return to following (not wandering) once this fight/loot ends. */
  rejoinAfter: boolean
  /** Monsters only: seconds until this corpse respawns. Without this the zone runs out
   *  of things to fight within a minute and the "busy server" decays into a stroll. */
  respawnT: number
}

/** Movement vector → dimetric facing (se:+x, sw:+y, nw:−x, ne:−y). */
function faceFromVec(dx: number, dy: number): Facing {
  return Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : (dy >= 0 ? 'sw' : 'ne')
}

export class WorldSceneController {
  private scene = new Scene()
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private floatersHost: HTMLElement
  private floaters: Floater[] = []

  private player!: Entity
  private mob: Entity | null = null

  private rigs: {
    player: IndexedSprite
    mobHumanoid: IndexedSprite
    mobBeast: IndexedSprite
  } | null = null
  /** Loaded FFTA scaffold sprites keyed by manifest id. Empty = use the placeholder rigs. */
  private spriteCache: Record<string, IndexedSprite> = {}
  /** Currently equipped player sprite id so sync() can swap on class/race change. */
  private playerSpriteId: string | null = null

  // Spell/impact FX rigs (accent-channel only → palette id picks the school).
  private burstRig!: IndexedSprite
  private boltRig!: IndexedSprite
  // In-flight projectiles; retired on arrival. Small list — splice on retirement
  // is fine (events are infrequent, not per-entity-per-frame).
  private bolts: { entity: Entity; fromX: number; fromY: number; toX: number; toY: number; t: number; palette: string; impact: Entity | null; mag: number }[] = []

  private ground: GroundBuffer | null = null
  private zone: string | null = null
  private tileset: IndexedSprite
  private propSheet: IndexedSprite
  /** Tall prop sprite per kind (Phase E), spawned as depth-sorted entities at nodes. */
  private tallProps: Record<number, IndexedSprite>
  /** Spawned tall-prop entities + the node each represents; retired on zone change. */
  private propEntities: { entity: Entity; gx: number; gy: number }[] = []

  // Simulated MMO ambience — other heroes/monsters roaming the zone in encounter groups.
  private ambient: Ambient[] = []
  private ambientGroups: { gx: number; gy: number; fight: boolean }[] = []
  private ambientSkirmishCd = 0
  /** Player level, mirrored from sync() purely to band ambient hero levels. */
  private playerLevel = 1
  /** Zone/faction display names, mirrored from sync() so generated chat uses the
   *  game's own generated proper nouns rather than generic fantasy filler. */
  private zoneDisplayName = ''
  private factionNames: Partial<Record<FactionType, string>> = {}
  private playerName = 'You'
  /** Seconds until the next chat-pool top-up check. */
  private chatPumpT = 0
  /** Accumulator for the fixed-rate behaviour tick (brains run slower than frames). */
  private ambientBrainAccum = 0
  /** Monotonic counter feeding each ambient fight a distinct, reproducible seed. */
  private ambientFightSeq = 0
  /** Index into `ambient` of the current party companion, or -1. */
  private followerIdx = -1
  /** Reusable sparring-partner slot for the companion, or -1 before it exists. */
  private companionFoeIdx = -1
  /** Seconds until the companion is handed a fresh thing to fight. */
  private companionSparCd = 0
  /** Attack animations the companion has played this session (debug/instrumentation). */
  private companionAttackCount = 0
  /** Group-level stream (recycle placement). Separate from the per-hero streams so
   *  re-anchoring a group cannot perturb what any individual hero rolls. */
  private ambientRng: Rng = mulberry32(1)

  // Town-hub mode: flat FFTA town backdrop + clamped camera + idle crowd + building
  // anchors. Town entities use RAW tile coords (no PAD/wrap). townMode is entered on
  // gameMode 'in_town'; the scene is "ready" once this.ground === this.townGround.
  private townMode = false
  private townGround: GroundBuffer | null = null
  private townCrowd: TownFolk[] = []
  private townBuildings: { label: string; tx: number; ty: number }[] = []
  private townNpcs: TownNpcEnt[] = []
  /** Which NPC the hero is currently close enough to talk to; null when nobody. */
  private nearNpc: TownServiceKind | null = null
  /** Fired when that changes, so the store can open/close the right panel. */
  onTownNpcChanged: ((id: TownServiceKind | null) => void) | null = null

  // Weather + ambience: synced from game state; phases advanced on real time in render.
  private weatherType: WeatherType = 'clear'
  private currentZone: ZoneId = 'sunhollow_meadows'
  private cloudPhase = 0
  private rainT = 0
  private ambientT = 0

  // The player entity's buffer position is the visual source of truth. In auto mode
  // it sits at the zone-snap spot; in manual mode WASD drives it (clamped to the
  // zone interior). The mob is glued to it via mobMapOffset (synced each sync()).
  private mobOffsetDx = 0
  private mobOffsetDy = 0
  private mobEngaged = false
  // Target-reticle tier tint; mirrors the HUD target frame's colors so the ring under
  // the enemy and the frame naming it read as the same target.
  private mobTier: 'normal' | 'elite' | 'boss' = 'normal'
  private showMob = false
  private mobIsRanged = false
  // Final engagement placement (buffer-tile offset from the player). While the mob
  // closes from the map edge this tracks the store's shrinking offset; once it has
  // arrived it is held at a fixed gap (MELEE_GAP_TILES / RANGED_GAP_TILES) along the
  // captured approach direction so the mob never sits on the player's tile.
  private mobPlacedDx = 0
  private mobPlacedDy = 0
  private mobApproachDx = Math.SQRT1_2
  private mobApproachDy = Math.SQRT1_2
  // Bearing is chosen once per encounter (see chooseMobBearing) and held until the mob goes.
  private mobBearingSet = false
  // Approach radius multiplier (≤1) when the encounter had to be staged nearer to find
  // clear ground. Never >1: a visual gap wider than the store's would leave blows landing
  // across open space.
  private mobRadiusScale = 1
  // World spot the mob holds while the encounter closes. Captured once when the mob
  // spawns, so the *hero* covers the ground between fights instead of standing still
  // while the enemy slides in. Null until a mob spawns / after it's engaged or gone.
  private mobAnchorX: number | null = null
  private mobAnchorY: number | null = null
  // Counts down from MOB_SPAWN_FADE while a freshly spawned mob fades in.
  private mobFadeT = 0
  // How long a tap-walk has been grinding against an obstacle (see the tap branch).
  private tapStuckT = 0
  // Player-committed target. Tapping an enemy commits to it: the hero walks in and starts
  // the fight, and no auto behaviour may wander off or re-pace that until the target dies
  // or the player orders otherwise. Auto play still picks the fight when the player has
  // expressed no intent — manual is an override, never a requirement.
  private targetLocked = false
  private engageSent = false
  /** Fired once when the hero reaches a committed target; the host maps it to the store's
   *  engageTarget(). The adapter stays read-only — it never touches the store itself. */
  onEngageTarget: (() => void) | null = null
  /** Fired when the player clicks a DIFFERENT enemy; host maps it to setTarget(id). */
  onSelectTarget: ((mobId: string) => void) | null = null
  /** Tapping an ambient hero opens their player card. The adapter stays read-only over
   *  game state: it reports who was tapped and where, the host owns the UI. */
  onHeroTapped: ((speaker: ChatSpeaker, clientX: number, clientY: number) => void) | null = null
  /** Where the hero's feet ended up, in game tile coords, while under MANUAL control.
   *
   *  Under manual steering this controller is the only thing that knows the hero's
   *  position — it owns WASD and taps, while the store's `playerMapPos` was historically
   *  a sine drift that ignored input. Nothing in the simulation could answer "how close
   *  is the player to that wolf", so proximity aggro was impossible. Reported through a
   *  callback rather than by importing the store, like every other write this file makes. */
  onPlayerMoved: ((x: number, y: number) => void) | null = null
  // Entities for the enemies the player is NOT currently fighting. The engaged one keeps
  // its own dedicated machinery (`this.mob`: approach anchor, bearing, routing, death
  // fade); these just stand in the world, depth-sorted and clickable, so the player has a
  // visible choice. World-anchored on spawn so they hold their ground as the hero moves.
  private otherMobEnts = new Map<string, { e: Entity; wx: number; wy: number }>()
  // Bystanders still walking in from beyond the horizon → their station (wx,wy above).
  private arriving = new Set<string>()
  /** Which mob `this.mob` currently represents. Identity, not sprite — see the handoff. */
  private mobId: string | null = null
  // Cached routes. Straight-line movement plus collide-and-slide wedges against any
  // concave shoreline; these let a mover go AROUND a lake instead of grinding its edge.
  private playerPath: PathState = { pts: [], i: 0, gx: 0, gy: 0, cool: 0 }
  private mobPath: PathState = { pts: [], i: 0, gx: 0, gy: 0, cool: 0 }

  private cam: Camera = { x: 0, y: 0, w: 0, h: 0 }

  // Render zoom: world-px → CSS-px factor (also the buffer downscale). Higher = more
  // zoomed in / fewer tiles visible. Owned here (not the module const) so the host can
  // zoom out on narrow mobile viewports where the dimetric FOV is otherwise too tight.
  private scale = CSS_SCALE
  private lastCssW = 0
  private lastCssH = 0

  // Tap / click-to-move (D2-style): a tapped ground point becomes a walk target the
  // player paths to at manual speed, then auto-follow resumes. WASD or a zone change
  // cancels it. Marker VFX (spawn flash + a pulsing destination ring) sell the input.
  private tapMoveActive = false
  private tapTx = 0
  private tapTy = 0
  private tapFlashT = 0    // one-shot expanding "click" flash (seconds remaining)
  private tapPulse = 0     // free-running clock for the destination ring pulse

  // Screen shake / rumble — impact juice. shakeMag is buffer-px amplitude; it decays
  // over shakeT and is applied as a per-frame random camera offset (render-only, so
  // Math.random is fine here — no gameplay determinism impact). A brief hit-stop
  // (hitStopT) freezes the sim for a few ms on big hits so the blow reads.
  private shakeMag = 0
  private shakeT = 0
  private hitStopT = 0

  // Manual control + jump state. manualMode is true while any WASD key is held.
  private input: InputState = { up: false, down: false, left: false, right: false }
  private manualMode = false
  private jumpActive = false
  private jumpT = 0
  private lastControlMode: 'idle' | 'manual' = 'idle'
  // Last movement vector (for facing when auto-drift would otherwise leave it stale).
  private lastFaceDx = 1
  private lastFaceDy = 1

  // Auto-follow target: the store's playerMapPos (wrapped into the buffer) plus a
  // persistent offset. The offset absorbs manual-walk displacement and combat-freeze
  // drift so auto-follow resumes from where the player actually is, not slingshotting
  // back to the store's playerMapPos. The player entity lerps toward autoTx/autoTy
  // each frame when not manual/engaged, so it walks and the camera-followed world
  // scrolls past (the harness "followed player" patrol).
  private storeMapX = 0
  private storeMapY = 0
  private autoOffsetDx = 0
  private autoOffsetDy = 0
  private autoTx = 0
  private autoTy = 0

  private playerLunge: Lunge = { active: false, t: 0, homeX: 0, homeY: 0, targetX: 0, targetY: 0 }
  private mobLunge: Lunge = { active: false, t: 0, homeX: 0, homeY: 0, targetX: 0, targetY: 0 }
  private playerFlashT = 0
  private mobFlashT = 0
  private playerBasePalette = 'team/player'
  private mobBasePalette = 'team/enemy'

  private lastNodes: MapNode[] = []
  // Walkable mask for the current zone (game coords, 64×64). Null until a zone is baked.
  private walkMask: Uint8Array | null = null
  private worldSeed = 0
  // Footfall phase per walker (see WALK_CADENCE).
  private playerBob = { t: 0 }
  private mobBob = { t: 0 }
  private bystanderBob = { t: 0 }
  // Does this mob charge the hero, or hold its ground and make the hero come to it?
  private mobAggressive = false

  // Death choreography. A slain mob is moved off `this.mob` into dyingMobs so it keeps
  // rendering its 'death' pose while fading out, then retires. playerDead forces the
  // player's downed pose while !isAlive. mobWasPresent gates kill-detection in sync.
  private dyingMobs: { e: Entity; t: number }[] = []
  private mobWasPresent = false
  private playerDead = false
  // The mob slain by the most recent sync(), held for exactly one floatingNumbers diff.
  // The store clears `currentMob` in the SAME tick it pushes the killing blow's floating
  // number, and the host runs sync() before diffing that feed — so without this the
  // finishing hit of every fight hit the `!this.mob` guard and rendered no attack at all
  // (no lunge, no cast, no bolt, no damage number). Kills are the payoff; they get the
  // full treatment, retargeted onto the corpse.
  private slainMob: Entity | null = null

  // Particle FX pool (bloom).
  private particles: Particle[] = []

  constructor(canvas: HTMLCanvasElement, floatersHost: HTMLElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.floatersHost = floatersHost
    this.tileset = makeTileset()   // programmatic default; init() may swap in the scaffold
    this.propSheet = makePropSheet()
    this.tallProps = makePropEntities()
  }

  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL
    const scaffold = `${base}local-assets/ffta-scaffold/`
    const ffaUnits = `${scaffold}ffta-units/`
    // Art source. DEFAULT = the ORIGINAL Idle Legends rigs in public/sprites/units/,
    // resolved from the roster key via ORIGINAL_SPRITE. `?ffta` (DEV builds only) loads
    // the gitignored FFTA scaffold instead. Both fall back to the programmatic
    // placeholder if their file is missing. Entities are cached by the roster key in
    // either mode, so swap/lookup stays id-stable.
    const scaffoldArt = useScaffoldArt
    const realUnits = `${base}sprites/units/`
    const unitIds = new Set<string>()
    for (const race of ['human', 'dwarf', 'elf', 'orc', 'troll', 'goblin', 'gnome', 'tauren'] as RaceType[]) {
      for (const cls of ['warrior', 'mage', 'rogue', 'warlock'] as ClassType[]) {
        for (const id of HERO_SPRITES[race][cls]) unitIds.add(id)
      }
    }
    for (const id of MONSTER_SPRITES) unitIds.add(id)
    const loadUnit = async (id: string): Promise<IndexedSprite> => {
      if (scaffoldArt) {
        return loadSpriteOrPlaceholder(`${ffaUnits}${id}.json`, () =>
          isMonsterSprite(id) ? makeBeastRig(`rig/${id}`) : makeHumanoidRig(`rig/${id}`))
      }
      const origId = ORIGINAL_SPRITE[id] ?? id
      const make = () => (isMonsterSprite(id) && !isHumanoidMonster(origId)) ? makeBeastRig(`rig/${id}`) : makeHumanoidRig(`rig/${id}`)
      const real = await loadSprite(`${realUnits}${origId}.json`)
      // keep the roster id as the sprite's id so cache key === entity sprite id
      return real ? { ...real, id } : make()
    }
    const entries = await Promise.all(
      Array.from(unitIds).map(async (id): Promise<[string, IndexedSprite]> => [id, await loadUnit(id)])
    )
    this.spriteCache = Object.fromEntries(entries)

    // Programmatic fallback rigs backstop any missing individual sprite (either mode).
    const player = this.spriteCache['ffa_soldier'] ?? makeHumanoidRig('rig/humanoid')
    const mobHumanoid = this.spriteCache['ffa_white_monk'] ?? makeHumanoidRig('rig/mob-humanoid')
    const mobBeast = this.spriteCache['ffa_bomb'] ?? makeBeastRig('rig/mob-beast')

    // FFTA-traced ground tiles (gitignored dev scaffold); falls back to the programmatic
    // tileset set in the constructor. Traced tiles are indexed to our semantic slots, so
    // biome palettes still recolor them.
    this.tileset = scaffoldArt ? await loadSpriteOrPlaceholder(`${scaffold}tiles.json`, makeTileset) : makeTileset()
    this.burstRig = makeBurstRig('fx/burst')
    this.boltRig = makeBoltRig('fx/bolt')

    this.player = this.scene.spawn(player, 'team/player', PAD + 32, PAD + 32)
    this.player.animator.set('idle')
    this.floaters = this.makeFloaters()

    // Assign this.rigs LAST — it is the flag sync()'s `if (!this.rigs) return` guard
    // uses to gate the first ground bake. The game's tick loop fires the store
    // subscription continuously; if rigs were set before the tiles.json await above,
    // a sync() landing in that await window would pass the guard while this.player was
    // still undefined, bake the ground, then throw on `this.player.tx = …` — leaving a
    // live, player-less controller whose renderFrame throws every frame = black map.
    // (This is the intermittent race behind the recurring "black viewport".)
    this.rigs = { player, mobHumanoid, mobBeast }
  }

  /** Swap an entity's sprite at runtime (race/class/mob changes). Preserves position and
   *  state; resets the animator to the new sprite's idle facing. Missing sprites fall back
   *  to the appropriate placeholder rig (player for the hero, beast/humanoid for mobs). */
  private swapEntitySprite(e: Entity, id: string): void {
    if (e.sprite.id === id) return
    const isPlayer = e === this.player
    const fallback = isPlayer
      ? this.rigs!.player
      : (isMonsterSprite(id) ? this.rigs!.mobBeast : this.rigs!.mobHumanoid)
    const sprite = this.spriteCache[id] ?? fallback
    e.sprite = sprite
    e.animator = new Animator(sprite)
    e.animator.set('idle')
  }

  private makeFloaters(): Floater[] {
    const pool: Floater[] = []
    for (let i = 0; i < FLOATER_POOL; i++) {
      const el = document.createElement('div')
      el.className = 'il-floater'
      el.style.opacity = '0'
      this.floatersHost.appendChild(el)
      pool.push({ el, t: 0, anchor: null, wx: 0, wy: 0 })
    }
    return pool
  }

  /** Spawn a floater anchored to `anchorEntity` (rises from its head). LRU: if the
   *  pool is saturated, evict the entry with the least remaining time.
   *
   *  `mayEvict = false` takes only genuinely FREE slots. Ambient heroes pass false: the
   *  crowd's damage numbers must never push the player's own numbers out of a saturated
   *  pool. Scenery that can delete the player's feedback is not scenery any more. */
  private spawnFloater(
    anchorEntity: Entity, text: string, crit: boolean, color: string, mayEvict = true,
  ): void {
    let slot = -1
    let least = Infinity
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i]
      if (f.t <= 0) { slot = i; break }      // free slot — take it
      if (mayEvict && f.t < least) { least = f.t; slot = i } // else track oldest for LRU eviction
    }
    if (slot < 0) return
    const f = this.floaters[slot]
    f.t = FLOATER_LIFE
    f.anchor = anchorEntity
    f.wx = anchorEntity.screenX
    f.wy = anchorEntity.screenY - anchorEntity.sprite.frameH
    f.el.textContent = text
    f.el.style.color = color
    f.el.className = crit ? 'il-floater il-crit' : 'il-floater'
  }

  // ── Keyboard input (forwarded by the host) ──────────────────────────────────
  // WASD walks the player entity (manual override of position); Space jumps.
  setKey(key: string, down: boolean): void {
    const k = key.toLowerCase()
    let handled = true
    switch (k) {
      case 'w': case 'arrowup': this.input.up = down; break
      case 's': case 'arrowdown': this.input.down = down; break
      case 'a': case 'arrowleft': this.input.left = down; break
      case 'd': case 'arrowright': this.input.right = down; break
      case ' ':
        if (down && !this.jumpActive) this.jumpActive = true
        break
      default: handled = false
    }
    if (handled) {
      this.manualMode = this.input.up || this.input.down || this.input.left || this.input.right
      if (this.manualMode) this.tapMoveActive = false // WASD overrides a tap target
    }
  }

  /** Release all movement keys (e.g. on window blur so the player doesn't walk off
   *  while a key is physically held but the app lost focus). */
  clearInput(): void {
    this.input = { up: false, down: false, left: false, right: false }
    this.manualMode = false
  }

  // ── Spell / impact FX (burst = one-shot ring, bolt = traveling orb) ──────────
  // Raising an entity on screen by Δpx without horizontal shift: subtract the same
  // amount from tx and ty — feetY depends on (tx+ty), feetX on (tx−ty), so this lifts
  // the anchor straight up. 1 tile ≈ 16px, so RISE=1 puts a projectile at body mid.
  private static readonly FX_RISE = 1

  private spawnBurst(tx: number, ty: number, paletteId: string): void {
    const e = this.scene.spawn(this.burstRig, paletteId, tx, ty)
    e.animator.set('attack') // one-shot expanding ring
    e.animator.restart()
    e.shadow = false
  }

  private spawnBolt(fromX: number, fromY: number, toX: number, toY: number, paletteId: string, impact: Entity | null = null, mag = 0): void {
    const e = this.scene.spawn(this.boltRig, paletteId, fromX, fromY)
    e.animator.set('idle') // looping pulse
    e.shadow = false
    this.bolts.push({ entity: e, fromX, fromY, toX, toY, t: 0, palette: paletteId, impact, mag })
  }

  /** True while an entity is playing out its death fade — its pose, palette and alpha
   *  belong to the fade, so hit reactions must not touch them. Scans a list that holds
   *  at most a couple of corpses, and only on impact. */
  private isDying(e: Entity): boolean {
    for (const d of this.dyingMobs) if (d.e === e) return true
    return false
  }

  /** Impact reaction shared by melee and projectile hits: flash + recoil the target,
   *  pop a burst + particle explosion, kick the camera. Colors derive from `fxPalette`. */
  private impactHit(target: Entity, fxPalette: string, mag: number, stop = 0): void {
    // A corpse still takes the burst/rumble/particles, but keeps its death pose. Skipping
    // the flash here also avoids stranding a dead target in 'fx/hitflash' forever — the
    // restore below is keyed on `this.mob`, which is already null once it's dying.
    if (!this.isDying(target)) {
      if (target === this.mob) { this.mobFlashT = 0.13 } else { this.playerFlashT = 0.13 }
      target.paletteId = 'fx/hitflash'
      target.animator.set('hit')
      target.animator.restart()
    }
    this.spawnBurst(target.tx, target.ty, fxPalette)
    this.punch(mag, stop)
    const m = this.worldMid(target)
    const c = fxColors(fxPalette)
    this.emitImpact(m.x, m.y, c.core, c.glow, mag >= 3 ? 1.5 : 1)
  }

  // ── Particles ──────────────────────────────────────────────────────────────
  /** Body-center world-buffer coords for an entity (where FX should originate/land). */
  private worldMid(e: Entity): { x: number; y: number } {
    const g = this.ground!
    return { x: feetX(g, e.tx, e.ty), y: feetY(g, e.tx, e.ty) - e.sprite.frameH * 0.45 - e.z }
  }

  private push(x: number, y: number, vx: number, vy: number, life: number, decay: number, r: number, color: string, glow: string, kind: Particle['kind']): void {
    if (this.particles.length >= PARTICLE_CAP) return
    this.particles.push({ x, y, vx, vy, life, decay, r, color, glow, kind })
  }

  /** Impact spray: radial sparks + an expanding shock ring + a soft central flash. */
  private emitImpact(x: number, y: number, color: string, glow: string, scale = 1): void {
    const n = Math.round(14 * scale)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
      const sp = (70 + Math.random() * 150) * scale
      this.push(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20, 1, 2.0 + Math.random() * 1.6, (1.4 + Math.random() * 1.8) * scale, color, glow, P_SPARK)
    }
    this.push(x, y, 0, 0, 1, 3.0, 4 * scale, color, glow, P_RING)
    this.push(x, y, 0, 0, 1, 5.5, 10 * scale, glow, glow, P_FLASH)
  }

  /** Charge-up: sparks converging toward the cast point. */
  private emitCharge(x: number, y: number, color: string, glow: string): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const d = 12 + Math.random() * 10
      this.push(x + Math.cos(a) * d, y + Math.sin(a) * d, -Math.cos(a) * 90, -Math.sin(a) * 90, 1, 3.2, 1.6, color, glow, P_SPARK)
    }
    this.push(x, y, 0, 0, 1, 4, 6, glow, glow, P_FLASH)
  }

  /** Trailing glow behind a projectile (called per frame while it flies). */
  private emitTrail(x: number, y: number, color: string, glow: string): void {
    this.push(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, 1, 3.6, 3.2, color, glow, P_ORB)
  }

  private updateParticles(dt: number): void {
    const ps = this.particles
    const damp = Math.exp(-6 * dt)
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]
      p.life -= p.decay * dt
      if (p.life <= 0) { ps.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === P_SPARK) p.vy += 220 * dt // gravity on sparks
      p.vx *= damp
      p.vy *= damp
    }
  }

  private drawParticles(): void {
    const ps = this.particles
    if (!ps.length) return
    const ctx = this.ctx
    const cx = this.cam.x, cy = this.cam.y
    ctx.save()
    ctx.globalCompositeOperation = 'lighter' // additive → overlapping glows bloom
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      const dx = p.x - cx, dy = p.y - cy
      const a = p.life < 1 ? p.life : 1
      ctx.globalAlpha = a
      if (p.kind === P_RING) {
        const rr = (1 - p.life) * 26 * (p.r / 4) + p.r
        ctx.strokeStyle = p.color
        ctx.shadowColor = p.glow
        ctx.shadowBlur = 8
        ctx.lineWidth = Math.max(0.5, p.life * 2.5)
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke()
      } else if (p.kind === P_SPARK) {
        ctx.strokeStyle = p.color
        ctx.shadowColor = p.glow
        ctx.shadowBlur = 6
        ctx.lineWidth = Math.max(0.6, p.r * p.life)
        const tl = 0.04
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx - p.vx * tl, dy - p.vy * tl); ctx.stroke()
      } else {
        // orb / flash — radial gradient, bright core → transparent edge
        const rr = Math.max(0.6, p.r * (p.kind === P_FLASH ? (0.4 + p.life) : p.life))
        const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr)
        g.addColorStop(0, p.glow)
        g.addColorStop(0.45, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  /** Kick the camera (rumble) and optionally freeze the sim briefly (hit-stop). */
  private punch(mag: number, stop = 0): void {
    if (mag > this.shakeMag) { this.shakeMag = mag; this.shakeT = SHAKE_DURATION }
    if (stop > this.hitStopT) this.hitStopT = stop
  }

  // Classify a floating-number event → the right visual. The store's FN feed is the
  // only combat signal we get; we branch on its existing flags/color so no game-data
  // changes are needed. DoT ticks no longer trigger a melee lunge (they used to).
  handleFloatingNumber(fn: FloatingNumber): void {
    if (fn.isMobDamage) { this.triggerMobAttack(fn); return }
    if (fn.isDoT) { this.triggerDotTick(fn); return }
    if (fn.color === SHADOW_BOLT_COLOR) { this.triggerShadowBolt(fn); return }
    this.triggerPlayerAttack(fn)
  }

  // ── Wrap helpers ───────────────────────────────────────────────────────────

  private static wrapMod(v: number): number {
    return ((v % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
  }

  // ── Collision ──────────────────────────────────────────────────────────────
  // The mask is in GAME coords; the scene works in PAD-offset buffer coords, and
  // isWalkable wraps internally, so subtracting PAD is the whole conversion.
  // Town is exempt: it's a small hand-authored box already clamped by TOWN_WALK_RADIUS,
  // with no tile mask of its own.

  private walkableAt(bx: number, by: number): boolean {
    if (this.townMode || !this.walkMask) return true
    return isWalkable(this.walkMask, bx - PAD, by - PAD)
  }

  /** Collide-and-slide one step in buffer space: each axis applies only if it lands on
   *  walkable ground, so brushing a shoreline slides along it instead of stopping dead. */
  private slide(x: number, y: number, dx: number, dy: number): { x: number; y: number; blocked: boolean } {
    // Escape hatch first: if we are ALREADY standing on blocked ground, every candidate
    // below fails and the body can never move again. Venom Hollows and Grimshade Forest
    // both put the zone spawn point (32,32) inside blocked terrain
    // (walkability.ts:155), so a hero can enter the zone already wedged — and manual
    // control routes every step through here, which made those two zones unplayable.
    // Sliding out is impossible from inside a wall; the only way out is to be placed.
    if (this.walkMask && !this.walkableAt(x, y)) {
      const w = nearestWalkable(this.walkMask, x - PAD, y - PAD)
      return {
        x: PAD + WorldSceneController.wrapMod(w.x),
        y: PAD + WorldSceneController.wrapMod(w.y),
        blocked: true,
      }
    }
    let nx = x, ny = y, blocked = false
    if (dx !== 0) { if (this.walkableAt(x + dx, y)) nx = x + dx; else blocked = true }
    if (dy !== 0) { if (this.walkableAt(nx, y + dy)) ny = y + dy; else blocked = true }
    return { x: nx, y: ny, blocked }
  }

  /**
   * Pick the bearing this encounter closes along, preferring one with clear ground
   * between hero and quarry.
   *
   * The store randomises the approach angle and only its *distance* drives engagement, so
   * rotating the bearing is free — and it stops encounters being staged across a lake,
   * which is what produced the hero pinned on the near bank while the mob swam over to
   * meet the timer. Tries the store's own bearing first, then the nearest rotations, so
   * the spawn direction stays as varied as before whenever the ground allows.
   */
  private chooseMobBearing(dist: number): void {
    const baseAng = Math.atan2(this.mobOffsetDy, this.mobOffsetDx)
    let ang = baseAng
    this.mobRadiusScale = 1
    if (this.walkMask && dist > 0.01) {
      const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
      const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
      const clear = (a: number, r: number) => {
        const ex = pgx + Math.cos(a) * r, ey = pgy + Math.sin(a) * r
        return isWalkable(this.walkMask!, ex, ey) && hasLineOfWalk(this.walkMask!, pgx, pgy, ex, ey)
      }
      // Sweep bearings at full range, then pull the radius in. Water-heavy zones
      // (venom_hollows is only 62% walkable) can have no clear line at all at 10–15
      // tiles; staging the encounter nearer keeps it on the hero's own landmass. Pulling
      // IN is always safe — a visual gap smaller than the store's never leaves attacks
      // landing across open space, whereas a larger one would.
      let done = false
      for (const scale of [1, 0.75, 0.5]) {
        for (let i = 0; i < 24 && !done; i++) {
          const cand = baseAng + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12))
          if (!clear(cand, dist * scale)) continue
          ang = cand
          this.mobRadiusScale = scale
          done = true
        }
        if (done) break
      }
      // Still nothing clear: keep the store bearing. The spawn nudge puts the mob on land
      // and the routed approach walks it around whatever is in the way.
    }
    this.mobApproachDx = Math.cos(ang)
    this.mobApproachDy = Math.sin(ang)
  }

  /** Advance a walker's footfall phase and return its vertical bounce in pixels. */
  private walkBobZ(phase: { t: number }, moving: boolean, dt: number): number {
    if (!moving) { phase.t = 0; return 0 }
    phase.t += dt * WALK_CADENCE
    return Math.abs(Math.sin(phase.t)) * WALK_BOB_PX
  }

  /**
   * Keep the hero inside the baked buffer.
   *
   * The open world is a TORUS, so the position wraps; town is a finite hand-authored box,
   * so it clamps. Mixing the two is a teleport generator: clamping during a long
   * committed walk pins the hero against the buffer edge, and then auto-follow — which
   * has always wrapped — moves them a whole map width in one step. Wrapping by exactly
   * MAP_SIZE lands on visually identical ground (that is what the padded border is for),
   * so the wrap itself is invisible.
   */
  private confinePlayer(loB: number, hiB: number): void {
    if (this.townMode) {
      this.player.tx = clamp(this.player.tx, loB, hiB)
      this.player.ty = clamp(this.player.ty, loB, hiB)
    } else {
      this.player.tx = PAD + WorldSceneController.wrapMod(this.player.tx - PAD)
      this.player.ty = PAD + WorldSceneController.wrapMod(this.player.ty - PAD)
    }
  }

  /** Buffer-space position of a game-coord point, on the wrapped copy nearest `nearBx`. */
  private toBuffer(gx: number, gy: number, nearBx: number, nearBy: number): { x: number; y: number } {
    return {
      x: nearBx + WorldSceneController.wrapDiff(gx, WorldSceneController.wrapMod(nearBx - PAD)),
      y: nearBy + WorldSceneController.wrapDiff(gy, WorldSceneController.wrapMod(nearBy - PAD)),
    }
  }

  /**
   * Walk an entity toward a buffer-space goal, routing around blocked ground.
   *
   * Straight-line movement is used while the goal is in plain sight — that keeps normal
   * approaches perfectly direct. Only when something is in the way does it fall back to a
   * cached A* route, repathing when the goal drifts or the route runs out. Without this,
   * a lake between the two bodies pins the walker against the shore forever while the
   * store's gap timer runs down regardless.
   */
  private followPath(
    e: Entity, st: PathState, goalBx: number, goalBy: number, speed: number, dt: number,
  ): { moving: boolean; mvx: number; mvy: number } {
    const still = { moving: false, mvx: 0, mvy: 0 }
    const stepLen = speed * dt
    if (stepLen <= 0) return still

    const gx = WorldSceneController.wrapMod(goalBx - PAD)
    const gy = WorldSceneController.wrapMod(goalBy - PAD)
    const ex = WorldSceneController.wrapMod(e.tx - PAD)
    const ey = WorldSceneController.wrapMod(e.ty - PAD)
    // Aim at the wrapped copy of the goal nearest the walker. Measuring in raw buffer
    // space instead sends it the long way round whenever the two straddle the seam.
    const goal = this.townMode ? { x: goalBx, y: goalBy } : this.toBuffer(gx, gy, e.tx, e.ty)
    goalBx = goal.x; goalBy = goal.y

    // Direct walk whenever the goal is actually in sight.
    if (!this.walkMask || hasLineOfWalk(this.walkMask, ex, ey, gx, gy)) {
      st.pts = []
      const dx = goalBx - e.tx, dy = goalBy - e.ty
      const d = Math.hypot(dx, dy)
      if (d < 0.02) return still
      const s = Math.min(d, stepLen)
      const ux = dx / d, uy = dy / d
      const r = this.slide(e.tx, e.ty, ux * s, uy * s)
      e.tx = r.x; e.ty = r.y
      return { moving: true, mvx: ux, mvy: uy }
    }

    st.cool -= dt
    const goalMoved = Math.hypot(WorldSceneController.wrapDiff(gx, st.gx), WorldSceneController.wrapDiff(gy, st.gy)) > 1.5
    if ((!st.pts.length || st.i >= st.pts.length || goalMoved) && st.cool <= 0) {
      st.pts = findPath(this.walkMask, ex, ey, gx, gy) ?? []
      st.i = 0
      st.gx = gx; st.gy = gy
      st.cool = 0.35   // cap repaths; the grid is tiny but this runs per mover
    }
    if (st.i >= st.pts.length) {
      // No route (or still cooling down) — slide toward the goal so it at least tries.
      const dx = goalBx - e.tx, dy = goalBy - e.ty
      const d = Math.hypot(dx, dy)
      if (d < 0.02) return still
      const r = this.slide(e.tx, e.ty, dx / d * stepLen, dy / d * stepLen)
      e.tx = r.x; e.ty = r.y
      return { moving: true, mvx: dx / d, mvy: dy / d }
    }

    const wp = st.pts[st.i]
    const b = this.toBuffer(wp.x, wp.y, e.tx, e.ty)
    const dx = b.x - e.tx, dy = b.y - e.ty
    const d = Math.hypot(dx, dy)
    if (d < 0.3) { st.i++; return { moving: true, mvx: dx / (d || 1), mvy: dy / (d || 1) } }
    const s = Math.min(d, stepLen)
    const ux = dx / d, uy = dy / d
    const r = this.slide(e.tx, e.ty, ux * s, uy * s)
    e.tx = r.x; e.ty = r.y
    return { moving: true, mvx: ux, mvy: uy }
  }

  private static wrapDiff(a: number, b: number): number {
    let d = a - b
    d = ((d % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
    if (d > MAP_SIZE / 2) d -= MAP_SIZE
    return d
  }

  // ── Read-only state sync (called by the host on store change) ──────────────

  sync(state: GameState): void {
    if (!this.rigs || !this.player) return // both are set only when init() fully completes

    // A kill is only "fresh" for the FN diff that immediately follows this sync.
    this.slainMob = null

    this.weatherType = state.weatherState?.type ?? 'clear'
    // Read before the zone-change branch below, so a rebake uses this run's seed.
    this.worldSeed = state.worldSeed ?? 0
    this.currentZone = state.currentZone
    // Ambient heroes band around the player's level so the crowd reads as peers. This
    // is the ONLY thing the ambient system reads off the player, and it is read-only —
    // nothing here writes back into combat, loot, XP or the economy.
    this.playerLevel = state.level ?? 1
    this.zoneDisplayName = state.generatedZoneNames?.[state.currentZone] ?? ZONES[state.currentZone]?.name ?? ''
    this.factionNames = state.factionNames ?? {}
    this.playerName = state.playerName || 'You'

    // ── Idle / manual control transitions ───────────────────────────────────────
    const controlMode = state.controlMode ?? 'idle'
    if (controlMode !== this.lastControlMode) {
      if (controlMode === 'idle') {
        // Returning to auto-pilot: drop any in-flight manual movement and commitment
        // so the hero resumes auto-follow and idle can pick its own targets.
        this.manualMode = false
        this.input = { up: false, down: false, left: false, right: false }
        this.tapMoveActive = false
        this.tapStuckT = 0
        this.targetLocked = false
        this.engageSent = false
      }
      this.lastControlMode = controlMode
    }

    // ── Town-hub transitions ──────────────────────────────────────────────────
    // Entering a town swaps the whole scene to the flat FFTA town backdrop + crowd;
    // leaving forces a clean zone rebake (leaveTownScene nulls this.zone). While in
    // town we skip all zone/mob sync (no torus follow, no combat).
    const inTown = state.gameMode === 'in_town'
    if (inTown && !this.townMode) {
      this.townMode = true
      this.enterTownScene().catch(err => console.error('[town] enter failed', err))
      return
    }
    if (!inTown && this.townMode) {
      this.leaveTownScene() // nulls this.zone → the zone-rebake block below re-runs
    }
    if (this.townMode) return // town scene owns everything until we leave

    // Zone change (or a never-baked ground — closes any first-bake race that would
    // otherwise leave a black viewport) → rebake ground + repopulate the zone.
    if (state.currentZone !== this.zone || !this.ground) {
      // Retire the previous zone's tall-prop + ambient entities first (even if the
      // new zone's map isn't ready yet, so stale entities never linger).
      this.retirePropEntities()
      this.retireAmbient()
      // The crowd is regenerated per zone, so a companion's body is about to stop
      // existing. Disband explicitly rather than leaving a member pointing at nothing.
      this.followerIdx = -1
      disbandParty()
      // Enemies belong to the zone they stood in — their world anchors are meaningless
      // once the ground is rebaked.
      for (const rec of this.otherMobEnts.values()) rec.e.active = false
      this.otherMobEnts.clear()
      const zm = state.zoneMaps[state.currentZone]
      if (zm) {
        const palId = biomePaletteId(state.currentZone)
        this.ground = bakeGround(
          zoneMapToTileMap(zm), this.tileset,
          palId, getPalette(palId),
          TILE_ANIMS, this.propSheet,
        )
        this.zone = state.currentZone
        this.lastNodes = zm.nodes
        this.walkMask = getWalkMask(zm)
        // Land on walkable ground: the zone spawn (32,32) is itself blocked in
        // grimshade_forest and venom_hollows, and an old save can hold a position that
        // is now inside water.
        const spawn = nearestWalkable(this.walkMask, state.playerMapPos.x, state.playerMapPos.y)
        this.player.tx = PAD + WorldSceneController.wrapMod(spawn.x)
        this.player.ty = PAD + WorldSceneController.wrapMod(spawn.y)
        // Cancel any in-flight manual movement/jump across the zone swap.
        this.manualMode = false
        this.jumpActive = false
        this.jumpT = 0
        this.tapMoveActive = false // drop any tap target from the previous zone
        this.input = { up: false, down: false, left: false, right: false }
        // Player snapped to the new zone's playerMapPos — clear the visual offset.
        this.autoOffsetDx = 0
        this.autoOffsetDy = 0
        // Spawn tall-prop entities at each node (Phase E) — depth-sorted with units,
        // replacing the old flat glyph overlay. Tinted with the biome palette.
        this.spawnPropEntities(zm.nodes, palId)
        // Plus scattered biome scenery (trees/boulders/spires/mounds/ruins) so the
        // world reads as populated FFTA-style terrain, not a bare tile grid.
        this.spawnScenery(zm.scenery ?? [])
        // Populate the zone with roaming heroes + monsters (simulated MMO ambience).
        this.spawnAmbient()
      }
    }

    if (!this.ground) return

    // Auto-follow target = store's map position (wrapped) + the persistent visual
    // offset. Updated every sync so combat drift / travel / gathering all drive the
    // walk, while manual-walk displacement and combat-freeze drift are absorbed into
    // the offset (synced in renderFrame) so there's no slingshot back to playerMapPos.
    this.storeMapX = WorldSceneController.wrapMod(state.playerMapPos.x)
    this.storeMapY = WorldSceneController.wrapMod(state.playerMapPos.y)
    this.autoTx = PAD + WorldSceneController.wrapMod(this.storeMapX + this.autoOffsetDx)
    this.autoTy = PAD + WorldSceneController.wrapMod(this.storeMapY + this.autoOffsetDy)

    // Player look: race/class sprite + race/equipment palette.
    const wantedPlayerSprite = heroSpriteId(state.playerRace, state.playerClass, state.playerName)
    if (this.playerSpriteId !== wantedPlayerSprite) {
      this.playerSpriteId = wantedPlayerSprite
      this.swapEntitySprite(this.player, wantedPlayerSprite)
    }
    this.playerBasePalette = heroPaletteId(
      state.playerClass, state.playerRace, state.playerFaction, bestEquipmentRarity(state),
      state.colorway,
    )
    if (this.playerFlashT <= 0) this.player.paletteId = this.playerBasePalette

    // Mob presence + approach offset (the store shrinks mobMapOffset toward 0).
    this.showMob = !!state.currentMob && state.gameMode === 'combat'
    this.mobOffsetDx = state.mobMapOffset.dx
    this.mobOffsetDy = state.mobMapOffset.dy
    // Requires a mob to actually BE there. Distance alone reads "engaged" whenever the
    // offset is zero — and the store zeroes it precisely when there is no mob — so with
    // no mob present this latched true and froze the player's auto-follow. That is what
    // killed the travel animation: the hero stayed pinned to the store position instead
    // of walking, so the world never scrolled past on the way to the next zone.
    this.mobEngaged = this.showMob && Math.hypot(this.mobOffsetDx, this.mobOffsetDy) < ENGAGE_DIST

    // ── Target handoff ────────────────────────────────────────────────────────
    // The engaged mob is identified by ID, not by sprite. Without this the scene only
    // knew "there is a mob": switching targets reused or respawned the entity using the
    // PREVIOUS target's anchor and bearing (so a body teleported across the field), and
    // syncOtherMobs then spawned a second body for the mob we had just left.
    const newTargetId = state.currentMob?.id ?? null
    if (newTargetId !== this.mobId) {
      if (this.mob && this.mobId) {
        const survived = state.mobs.some(m => m.id === this.mobId)
        if (survived) {
          // Still alive — hand its body to the bystander pool exactly where it stands.
          this.otherMobEnts.set(this.mobId, { e: this.mob, wx: this.mob.tx, wy: this.mob.ty })
        } else {
          // It died. With a population, `currentMob` is refilled by auto-select on the
          // same tick, so the old "no mob left" death test never fires any more — the
          // kill choreography has to hang off the ID change instead, or corpses would
          // silently become the next enemy.
          const e = this.mob
          e.paletteId = this.mobBasePalette
          e.animator.set('death')
          e.animator.restart()
          this.dyingMobs.push({ e, t: 0 })
          this.slainMob = e            // keep the killing blow's VFX target alive
          this.spawnBurst(e.tx, e.ty, 'spell/holy')
          this.punch(2.6, 0.05)
          const dm = this.worldMid(e)
          const dc = fxColors('spell/holy')
          this.emitImpact(dm.x, dm.y, dc.core, dc.glow, 1.7)
        }
      }
      this.mob = null
      // Per-encounter state belongs to the mob that just left.
      this.mobAnchorX = null; this.mobAnchorY = null
      this.mobBearingSet = false
      this.mobRadiusScale = 1
      this.mobFadeT = 0
      this.mobFlashT = 0
      this.mobLunge.active = false
      this.mobPath.pts = []
      this.playerPath.pts = []
      this.engageSent = false
      this.mobId = newTargetId
      // If the new target is already standing in the world as a bystander, adopt that
      // body and derive the encounter from where it ACTUALLY is. Re-deriving from the
      // store offset instead is what made a freshly selected enemy jump.
      const adopted = newTargetId ? this.otherMobEnts.get(newTargetId) : null
      if (adopted) {
        this.otherMobEnts.delete(newTargetId!)
        this.mob = adopted.e
        this.mobAnchorX = adopted.wx
        this.mobAnchorY = adopted.wy
        const ddx = adopted.wx - this.player.tx
        const ddy = adopted.wy - this.player.ty
        const dd = Math.hypot(ddx, ddy) || 1
        this.mobApproachDx = ddx / dd
        this.mobApproachDy = ddy / dd
        this.mobBearingSet = true      // the geometry IS the bearing; don't re-roll it
      }
    }

    if (this.showMob && state.currentMob) {
      const mob = state.currentMob
      this.mobIsRanged = isRangedMob(mob)
      this.mobTier = mob.isBoss ? 'boss' : mob.isElite ? 'elite' : 'normal'
      // Charging predators vs. things that hold their ground (see AGGRESSIVE_RE).
      this.mobAggressive = !mob.isBoss && AGGRESSIVE_RE.test(mob.name.toLowerCase())
      // Engagement placement: follow the store offset while the mob is still closing
      // (remembering its approach direction), then hold a fixed diagonal gap so it
      // never parks on the player. The radial hold is continuous with the approach
      // (the store shrinks along the same ray), so there is no snap on arrival.
      const gapTiles = this.mobIsRanged ? RANGED_GAP_TILES : MELEE_GAP_TILES
      const gapMag = Math.SQRT2 * gapTiles
      const offDist = Math.hypot(this.mobOffsetDx, this.mobOffsetDy)
      // Fix the bearing once per encounter, on ground you can actually walk. Only the
      // DISTANCE feeds engagement timing, so the magnitude below still tracks the store
      // exactly — the bearing is free to rotate.
      if (!this.mobBearingSet) { this.chooseMobBearing(offDist); this.mobBearingSet = true }
      // Scale only the approach leg — the melee/ranged hold distance is a floor, so a
      // pulled-in encounter can never end up with the mob standing on the hero.
      const mag = Math.max(gapMag, offDist * this.mobRadiusScale)
      this.mobPlacedDx = this.mobApproachDx * mag
      this.mobPlacedDy = this.mobApproachDy * mag

      const wantedMobSprite = resolveMobSprite(mob.name)
      if (!this.mob) {
        const sprite = this.spriteCache[wantedMobSprite] ??
          (isMonsterSprite(wantedMobSprite) ? this.rigs.mobBeast : this.rigs.mobHumanoid)
        this.mob = this.scene.spawn(
          sprite, mobPaletteId(mob), this.player.tx + this.mobPlacedDx, this.player.ty + this.mobPlacedDy,
        )
        // Pin where it waits — on walkable ground, so nothing lies in wait mid-lake.
        // Nudging the anchor keeps the encounter self-consistent: the hero's closing
        // target is derived FROM the anchor, so the gap is preserved either way.
        if (this.walkMask && !this.walkableAt(this.mob.tx, this.mob.ty)) {
          const w = nearestWalkable(this.walkMask, this.mob.tx - PAD, this.mob.ty - PAD)
          this.mob.tx = PAD + WorldSceneController.wrapMod(w.x)
          this.mob.ty = PAD + WorldSceneController.wrapMod(w.y)
        }
        this.mobAnchorX = this.mob.tx
        this.mobAnchorY = this.mob.ty
        this.mobFadeT = MOB_SPAWN_FADE
        this.mob.alpha = 0
      } else if (this.mob.sprite.id !== wantedMobSprite) {
        // Swap sprite when the mob template changes (rare; keeps the pool entity but re-spawns).
        this.mob.active = false
        const sprite = this.spriteCache[wantedMobSprite] ??
          (isMonsterSprite(wantedMobSprite) ? this.rigs.mobBeast : this.rigs.mobHumanoid)
        this.mob = this.scene.spawn(
          sprite, mobPaletteId(mob), this.player.tx + this.mobPlacedDx, this.player.ty + this.mobPlacedDy,
        )
      }
      if (this.mob) {
        this.mobBasePalette = mobPaletteId(mob)
        if (this.mobFlashT <= 0) this.mob.paletteId = this.mobBasePalette
      }
    } else if (this.mob) {
      // The mob entity should go away. If we were mid-combat, the player is alive, and
      // there's simply no mob now → it was slain: hand it to the death-fade list (plays
      // 'death', fades, loot pop). Otherwise (player died, mode switch, travel) retire
      // it immediately.
      const slain = state.gameMode === 'combat' && state.isAlive && !state.currentMob && this.mobWasPresent
      if (slain) {
        const e = this.mob
        e.paletteId = this.mobBasePalette   // clear any lingering hit-flash
        e.animator.set('death')
        e.animator.restart()
        this.dyingMobs.push({ e, t: 0 })
        this.slainMob = e                   // let the killing blow's VFX still find it
        this.spawnBurst(e.tx, e.ty, 'spell/holy') // loot/impact pop
        this.punch(2.6, 0.05)
        const dm = this.worldMid(e)
        const dc = fxColors('spell/holy')
        this.emitImpact(dm.x, dm.y, dc.core, dc.glow, 1.7)
      } else {
        this.mob.active = false
      }
      this.mob = null
      this.mobLunge.active = false
      this.mobFlashT = 0
      this.mobPlacedDx = 0
      this.mobPlacedDy = 0
      this.mobApproachDx = Math.SQRT1_2
      this.mobApproachDy = Math.SQRT1_2
      this.mobAnchorX = null
      this.mobAnchorY = null
      this.mobFadeT = 0
      this.mobBearingSet = false
      this.mobAggressive = false
      this.mobPath.pts = []
      this.mobId = null
      // The commitment ends with the target: "until the enemy is killed", not forever.
      this.targetLocked = false
      this.engageSent = false
    }

    this.syncOtherMobs(state)

    this.mobWasPresent = this.showMob
    this.playerDead = !state.isAlive
  }

  /**
   * Give every un-targeted enemy a body in the world, so "pick who you fight" is a thing
   * the player can see rather than an abstraction. They are pinned to the spot they
   * spawned on and left to idle — approach, routing and combat choreography belong to the
   * engaged target alone.
   */
  private syncOtherMobs(state: GameState): void {
    const targetId = state.currentMob?.id
    const alive = new Set<string>()
    if (state.gameMode === 'combat' && state.isAlive && !this.townMode) {
      for (const m of state.mobs) {
        if (m.id === targetId) continue
        alive.add(m.id)
        let rec = this.otherMobEnts.get(m.id)
        if (!rec || !rec.e.active) {
          const spriteId = resolveMobSprite(m.name)
          const sprite = this.spriteCache[spriteId] ??
            (isMonsterSprite(spriteId) ? this.rigs!.mobBeast : this.rigs!.mobHumanoid)
          // Place on walkable ground near its spawn offset, then keep that world spot.
          let wx = this.player.tx + m.offset.dx
          let wy = this.player.ty + m.offset.dy
          if (this.walkMask && !this.walkableAt(wx, wy)) {
            const w = nearestWalkable(this.walkMask, wx - PAD, wy - PAD)
            wx = PAD + WorldSceneController.wrapMod(w.x)
            wy = PAD + WorldSceneController.wrapMod(w.y)
          }
          // Spawn AT the mob's real position, and let the simulation move it from there.
          //
          // This used to enter from beyond the horizon and walk to a fixed station at
          // BYSTANDER_SPEED. That made sense while a station never moved. It is actively
          // wrong now: the station tracks the mob's own position every frame, so the
          // walk-in chases a moving goal, never gets within its arrival epsilon, and
          // never ends — measured as a mob travelling a dead-constant 1.70 tiles per
          // 500ms (3.4 t/s, i.e. BYSTANDER_SPEED) indefinitely, overriding the patrol
          // and chase speeds the simulation had chosen. Mobs now spawn far enough out
          // (12–26 tiles) that appearing in place does not read as popping in.
          const e = this.scene.spawn(sprite, mobPaletteId(m), wx, wy)
          e.animator.set('idle')
          rec = { e, wx, wy }
          this.otherMobEnts.set(m.id, rec)
        }
        // ── Track the mob's ACTUAL position, every frame ────────────────────────
        // This used to pin the entity to `rec.wx/wy`, the station computed once at spawn.
        // That was right when a mob's offset never changed after it arrived; it is wrong
        // now that mobs patrol, chase and leash, because the whole simulation was being
        // drawn at its spawn coordinates. `offset` is derived from the mob's real world
        // position each tick, so re-deriving the station here is what puts the world on
        // screen — without it the store simulates a living zone that nobody can see.
        // Anchor to the mob's OWN world position, measured against the player entity's
        // world position — the same formula the ambient crowd uses (see `updateAmbient`).
        //
        // Using `m.offset` here instead was subtly wrong and looked exactly like the mob
        // trailing the hero: the store computes `offset` against `playerMapPos`, but this
        // adds it to `this.player.tx`, the player ENTITY, which is a different point (it
        // lerps toward the store value, and `autoOffsetDx` absorbs manual walking into
        // it). Adding a delta measured from one origin onto a different origin makes the
        // mob inherit the hero's own motion — camera-glued, just with a world-derived
        // number rather than a fixed one.
        const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
        const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
        const liveX = this.player.tx + WorldSceneController.wrapDiff(m.pos.x, pgx)
        const liveY = this.player.ty + WorldSceneController.wrapDiff(m.pos.y, pgy)
        if (this.arriving.has(m.id)) {
          // Still walking in from beyond the horizon — keep the destination current so it
          // heads for where the mob now is rather than where it spawned.
          rec.wx = liveX; rec.wy = liveY
        } else {
          const pdx = liveX - rec.e.tx, pdy = liveY - rec.e.ty
          const moved = Math.hypot(pdx, pdy)
          rec.e.tx = liveX; rec.e.ty = liveY
          rec.wx = liveX; rec.wy = liveY
          // Face where it is going while it is going somewhere; only look at the hero once
          // it has stopped. A patrol that stares at you the whole way round reads as a
          // turret on rails, which is precisely how the old pinned version looked.
          if (moved > 1e-3) {
            this.faceToward(rec.e, rec.e.tx + pdx, rec.e.ty + pdy)
          } else {
            this.faceToward(rec.e, this.player.tx, this.player.ty)
          }
        }
        rec.e.paletteId = mobPaletteId(m)
      }
    }
    for (const [id, rec] of this.otherMobEnts) {
      if (alive.has(id)) continue
      rec.e.active = false
      this.otherMobEnts.delete(id)
      this.arriving.delete(id)
    }
  }

  /** Walk newly-arrived bystanders in from off-screen to their station, then let them
   *  hold it. Collided and routed like everything else that walks. */
  private advanceBystanders(dt: number): void {
    if (!this.arriving.size) return
    for (const id of [...this.arriving]) {
      const rec = this.otherMobEnts.get(id)
      if (!rec || !rec.e.active) { this.arriving.delete(id); continue }
      const dx = rec.wx - rec.e.tx, dy = rec.wy - rec.e.ty
      const d = Math.hypot(dx, dy)
      if (d < 0.3) {
        rec.e.tx = rec.wx; rec.e.ty = rec.wy
        this.arriving.delete(id)
        continue
      }
      const step = Math.min(d, BYSTANDER_SPEED * dt)
      const s = this.slide(rec.e.tx, rec.e.ty, dx / d * step, dy / d * step)
      // Wedged against terrain — take the station here rather than grinding forever.
      if (s.blocked && Math.hypot(s.x - rec.e.tx, s.y - rec.e.ty) < 1e-4) {
        rec.wx = rec.e.tx; rec.wy = rec.e.ty
        this.arriving.delete(id)
        continue
      }
      rec.e.tx = s.x; rec.e.ty = s.y
      this.faceToward(rec.e, rec.wx, rec.wy)
      rec.e.z = this.walkBobZ(this.bystanderBob, true, dt)
    }
  }

  private faceToward(e: Entity, targetX: number, targetY: number): void {
    const dx = targetX - e.tx
    const dy = targetY - e.ty
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
    let f: Facing
    if (dx >= 0 && dy >= 0) f = 'se'
    else if (dx >= 0 && dy < 0) f = 'ne'
    else if (dx < 0 && dy >= 0) f = 'sw'
    else f = 'nw'
    e.animator.face(f)
    // The base sheets face screen-left unmirrored, so flip when the target is to
    // screen-right. feetX = (tx-ty)*HALF_W, so screen-right is (dx-dy) >= 0. This
    // makes two profile fighters face each other; pure north/south keep the front/
    // back sheet (orientation unchanged), and the flip only happens as a target
    // crosses the screen-vertical axis — i.e. when the unit should actually turn.
    e.animator.mirror = (dx - dy) >= 0
  }

  // ── Combat-event triggers (called from the host's floatingNumbers effect) ───
  // All lunges are clamped to LUNGE_MAX from the attacker's home so a far anchor
  // can never produce a screen-spanning slingshot.

  private beginLunge(l: Lunge, e: Entity, targetEntity: Entity): void {
    let ddx = targetEntity.tx - e.tx
    let ddy = targetEntity.ty - e.ty
    const dl = Math.hypot(ddx, ddy)
    if (dl > LUNGE_MAX) { ddx = ddx / dl * LUNGE_MAX; ddy = ddy / dl * LUNGE_MAX }
    l.active = true
    l.t = 0
    l.homeX = e.tx
    l.homeY = e.ty
    l.targetX = e.tx + ddx
    l.targetY = e.ty + ddy
  }

  /** The entity a player-attack VFX should play against: the live mob, or — on the
   *  killing blow, where the store has already cleared `currentMob` — the corpse sync()
   *  just handed to the death fade. */
  private vfxTarget(): Entity | null {
    return this.mob ?? this.slainMob
  }

  triggerPlayerAttack(fn: FloatingNumber): void {
    const target = this.vfxTarget()
    if (!target || !this.ground) return
    const dying = this.isDying(target)
    this.beginLunge(this.playerLunge, this.player, target)
    this.player.animator.set('attack')
    this.player.animator.restart()
    this.faceToward(this.player, target.tx, target.ty)
    // Impact: defender flashes + recoils + floater. A corpse keeps its death pose.
    if (!dying) {
      this.mobFlashT = 0.13
      target.paletteId = 'fx/hitflash'
      target.animator.set('hit')
      target.animator.restart()
    }
    if (fn.isCrit) this.spawnBurst(target.tx, target.ty, 'spell/holy')
    // Rumble scales with the hit: crits kick hard + a brief hit-stop; normal a nudge.
    this.punch(fn.isCrit ? 3.6 : 1.3, fn.isCrit ? 0.05 : 0)
    // Melee spark spray — steel-white, gold on a crit.
    const mm = this.worldMid(target)
    const mc = fn.isCrit ? fxColors('spell/holy') : { core: '#eaf0ff', glow: '#7fb0ff' }
    this.emitImpact(mm.x, mm.y, mc.core, mc.glow, fn.isCrit ? 1.7 : 0.9)
    this.spawnFloater(
      target, `${fn.value}${fn.isCrit ? '!' : ''}`, fn.isCrit,
      fn.color ?? (fn.isCrit ? '#ffcc00' : '#88bbff'),
    )
  }

  triggerShadowBolt(fn: FloatingNumber): void {
    const target = this.vfxTarget()
    if (!target || !this.ground) return
    // Cast: a swing pose + a charge burst at the caster's hand, then a heavy bolt that
    // flashes/recoils the mob on arrival (impactHit) — the payoff is the landing.
    this.player.animator.set('attack')
    this.player.animator.restart()
    this.faceToward(this.player, target.tx, target.ty)
    const r = WorldSceneController.FX_RISE
    this.spawnBurst(this.player.tx - r, this.player.ty - r, 'spell/shadow')
    const cc = fxColors('spell/shadow')
    const pm = this.worldMid(this.player)
    this.emitCharge(pm.x, pm.y, cc.core, cc.glow)
    this.spawnBolt(
      this.player.tx - r, this.player.ty - r,
      target.tx - r, target.ty - r,
      'spell/shadow', target, 4.2,
    )
    this.spawnFloater(target, `${fn.value}!`, true, fn.color ?? SHADOW_BOLT_COLOR)
  }

  triggerDotTick(fn: FloatingNumber): void {
    const target = this.vfxTarget()
    if (!target || !this.ground) return
    // Ongoing affliction: a small recurrent pulse on the mob, no attacker lunge.
    this.spawnBurst(target.tx, target.ty, 'spell/shadow')
    const dc = fxColors('spell/shadow')
    const dm = this.worldMid(target)
    this.emitImpact(dm.x, dm.y, dc.core, dc.glow, 0.5)
    this.spawnFloater(target, `${fn.value}`, false, fn.color ?? '#aa88ff')
  }

  triggerMobAttack(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    this.faceToward(this.mob, this.player.tx, this.player.ty)
    if (this.mobIsRanged) {
      // Ranged: stand-off cast — a traveling bolt that lands on the player (impactHit
      // fires the flash/recoil/rumble on arrival, not at cast time).
      this.mob.animator.set('attack')
      this.mob.animator.restart()
      const r = WorldSceneController.FX_RISE
      this.spawnBolt(
        this.mob.tx - r, this.mob.ty - r,
        this.player.tx - r, this.player.ty - r,
        'spell/shadow', this.player, 2.6,
      )
    } else {
      // Melee: lunge in and the hit lands immediately.
      this.beginLunge(this.mobLunge, this.mob, this.player)
      this.mob.animator.set('attack')
      this.mob.animator.restart()
      this.impactHit(this.player, 'fx/hitflash', 2.0)
    }
    this.spawnFloater(this.player, `-${fn.value}`, false, '#ff6666')
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────

  setSize(cssW: number, cssH: number): void {
    this.lastCssW = cssW
    this.lastCssH = cssH
    const vw = Math.max(1, Math.floor(cssW / this.scale))
    const vh = Math.max(1, Math.floor(cssH / this.scale))
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw
      this.canvas.height = vh
      this.ctx.imageSmoothingEnabled = false
    }
    this.cam.w = vw
    this.cam.h = vh
  }

  /** Set the render zoom (world-px → CSS-px). The host picks a smaller value on narrow
   *  mobile breakpoints so more of the world is visible. Re-applies the buffer size. */
  setZoom(scale: number): void {
    const s = clamp(scale, 1, 3)
    if (s === this.scale) return
    this.scale = s
    if (this.lastCssW > 0) this.setSize(this.lastCssW, this.lastCssH)
  }

  /** Tap / click-to-move: project a viewport point (CSS px, page-relative) onto the
   *  ground plane and set it as the walk target. Ignored while downed. Screen→buffer
   *  uses the canvas's own rect ratio so it's correct at any zoom; buffer→tile inverts
   *  the flat-ground feet projection (elevation is ignored — close enough to path to). */
  /** Screen-space hit test against a unit's sprite box (feet anchor + frame extents). */
  private hitTestEntity(e: Entity, clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || this.canvas.width <= 0) return false
    const k = rect.width / this.canvas.width
    const sx = (e.screenX - this.cam.x) * k + rect.left
    const sy = (e.screenY - this.cam.y) * k + rect.top
    const halfW = (e.sprite.frameW * 0.5 + 6) * k
    const top = (e.sprite.frameH + e.z + 4) * k
    return clientX >= sx - halfW && clientX <= sx + halfW &&
           clientY <= sy + 8 * k && clientY >= sy - top
  }

  moveTo(clientX: number, clientY: number): void {
    const g = this.ground
    if (!g || this.playerDead) return
    // In town, tapping a service NPC walks the hero to them — the tap is "go see this
    // person", not "stand exactly on their tile". Stops just short so the two bodies do
    // not overlap and the arrival still lands inside NPC_TALK_RADIUS.
    if (this.townMode) {
      for (const n of this.townNpcs) {
        if (!this.hitTestEntity(n.e, clientX, clientY)) continue
        const dx = this.player.tx - n.e.tx, dy = this.player.ty - n.e.ty
        const d = Math.hypot(dx, dy) || 1
        const stand = NPC_TALK_RADIUS * 0.62
        this.tapTx = n.e.tx + (dx / d) * stand
        this.tapTy = n.e.ty + (dy / d) * stand
        this.tapMoveActive = true
        this.tapFlashT = 0.42
        this.manualMode = false
        this.playerPath.pts = []
        return
      }
    }
    // Tapping another PLAYER opens a whisper to them. Checked before enemies and before
    // ground, because an ambient hero is a person you can talk to and the tap should
    // never fall through to "walk to the dirt they are standing on". Nearest-first so
    // overlapping bodies resolve to the one in front.
    {
      let best: { a: Ambient; d: number } | null = null
      for (const a of this.ambient) {
        if (a.kind !== 'hero' || !a.e.active || !a.identity) continue
        if (!this.hitTestEntity(a.e, clientX, clientY)) continue
        const d = Math.hypot(a.e.tx - this.player.tx, a.e.ty - this.player.ty)
        if (!best || d < best.d) best = { a, d }
      }
      if (best) {
        const id = best.a.identity!
        this.onHeroTapped?.({
          name: best.a.name, playerClass: id.playerClass, race: id.race,
          faction: this.factionLabel(best.a.faction), level: best.a.level, spec: id.specTitle,
          talentAllocs: id.talentAllocs,
        }, clientX, clientY)
        return
      }
    }
    // Tapping the enemy commits to IT, rather than walking to the patch of ground it
    // happens to be standing on. Checked first so the target is never harder to click
    // than the dirt beneath it.
    if (this.mob && this.mob.active && this.showMob && this.hitTestEntity(this.mob, clientX, clientY)) {
      this.targetLocked = true
      this.engageSent = false
      this.tapMoveActive = false
      this.manualMode = false
      this.playerPath.pts = []
      return
    }
    // Another enemy — switch to it AND commit, so one tap both picks the fight and
    // starts walking to it. Nearest-first so overlapping bodies resolve to the front one.
    let pick: { id: string; d: number } | null = null
    for (const [id, rec] of this.otherMobEnts) {
      if (!rec.e.active || !this.hitTestEntity(rec.e, clientX, clientY)) continue
      const d = Math.hypot(rec.e.tx - this.player.tx, rec.e.ty - this.player.ty)
      if (!pick || d < pick.d) pick = { id, d }
    }
    if (pick) {
      this.targetLocked = true
      this.engageSent = false
      this.tapMoveActive = false
      this.manualMode = false
      this.playerPath.pts = []
      this.onSelectTarget?.(pick.id)
      return
    }
    // A ground order is the player changing their mind — it releases the commitment.
    // The cached route belonged to the old destination; keeping it makes the hero set off
    // along the previous path for up to a repath interval before correcting.
    this.targetLocked = false
    this.engageSent = false
    this.playerPath.pts = []
    this.playerPath.cool = 0
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const bufX = (clientX - rect.left) * (this.canvas.width / rect.width) + this.cam.x
    const bufY = (clientY - rect.top) * (this.canvas.height / rect.height) + this.cam.y
    // Invert feetX/feetY (height 0): A = tx−ty, B = tx+ty.
    const A = (bufX - g.originX - HALF_W) / HALF_W
    const B = (bufY - g.planeOffsetY - HALF_H) / HALF_H
    const lo = this.townMode ? -TOWN_WALK_RADIUS : PAD + 1
    const hi = this.townMode ? TOWN_WALK_RADIUS : PAD + MAP_SIZE - 1
    const tx = clamp((A + B) / 2, lo, hi)
    const ty = clamp((B - A) / 2, lo, hi)
    this.tapTx = tx
    this.tapTy = ty
    this.tapMoveActive = true
    this.tapFlashT = 0.42
    this.manualMode = false
  }

  renderFrame(dt: number): void {
    if (!this.ground || !this.rigs) return
    const g = this.ground

    // Hit-stop: freeze the sim (dt→0) for a few ms on big hits so the blow lands,
    // while rendering + camera shake keep going (decayed on real time).
    const realDt = dt
    if (this.hitStopT > 0) { this.hitStopT -= realDt; dt = 0 }
    if (this.shakeT > 0) this.shakeT -= realDt

    // Advance lunges (0→1→0 triangle over ~0.31s; contact visually at the apex).
    this.advanceLunge(this.playerLunge, this.player, dt)
    if (this.mob) this.advanceLunge(this.mobLunge, this.mob, dt)

    // Decay hit flashes → restore base palettes.
    if (this.playerFlashT > 0) {
      this.playerFlashT -= dt
      if (this.playerFlashT <= 0) this.player.paletteId = this.playerBasePalette
    }
    if (this.mobFlashT > 0) {
      this.mobFlashT -= dt
      if (this.mobFlashT <= 0 && this.mob) this.mob.paletteId = this.mobBasePalette
    }

    // ── Player movement (manual WASD, else tap-target, else auto-follow) + jump ──
    // Engagement / death cancels any pending tap target (don't resume walking to a
    // stale point after a fight ends).
    if (this.mobEngaged || this.playerDead) this.tapMoveActive = false
    // Dying releases the commitment too — a corpse should not keep marching to its target.
    if (this.playerDead) { this.targetLocked = false; this.engageSent = false }
    if (this.tapFlashT > 0) this.tapFlashT -= realDt
    this.tapPulse += realDt
    let moving = false
    let mvx = 0, mvy = 0
    // True when the hero's position is player-driven this frame (WASD or tap-to-move).
    // While it holds, the hero is NOT closing on the encounter, so the mob has to.
    let playerDriving = false
    // Movement bounds: raw town box in-town, else the padded zone interior (torus).
    const loB = this.townMode ? -TOWN_WALK_RADIUS : PAD + 1
    const hiB = this.townMode ? TOWN_WALK_RADIUS : PAD + MAP_SIZE - 1
    if (this.manualMode) {
      let dx = 0, dy = 0
      if (this.input.up) { dx -= 1; dy -= 1 }
      if (this.input.down) { dx += 1; dy += 1 }
      if (this.input.left) { dx -= 1; dy += 1 }
      if (this.input.right) { dx += 1; dy -= 1 }
      const len = Math.hypot(dx, dy)
      if (len > 0) {
        dx /= len; dy /= len
        const s = this.slide(this.player.tx, this.player.ty, dx * MANUAL_SPEED * dt, dy * MANUAL_SPEED * dt)
        this.player.tx = s.x
        this.player.ty = s.y
        this.confinePlayer(loB, hiB)
        moving = true; mvx = dx; mvy = dy; playerDriving = true
      }
    } else if (
      this.targetLocked && this.mob && this.showMob &&
      !this.mobEngaged && !this.playerLunge.active && !this.townMode
    ) {
      // Committed: close on the target at the hero's own pace and start the fight on
      // arrival, rather than waiting out the store's approach timer. Ranked above the
      // auto branches so nothing can pull the hero off a target they chose.
      const gapMag = Math.SQRT2 * (this.mobIsRanged ? RANGED_GAP_TILES : MELEE_GAP_TILES)
      let ax = this.player.tx - this.mob.tx, ay = this.player.ty - this.mob.ty
      const ad = Math.hypot(ax, ay) || 1
      // Stand off on the side the hero is already approaching from.
      const a = this.followPath(
        this.player, this.playerPath,
        this.mob.tx + (ax / ad) * gapMag, this.mob.ty + (ay / ad) * gapMag,
        MANUAL_SPEED, dt,
      )
      moving = a.moving; mvx = a.mvx; mvy = a.mvy
      this.syncOffset()
      if (!this.engageSent && ad <= gapMag + 0.75) {
        this.engageSent = true
        this.onEngageTarget?.()   // store collapses the approach gap → combat begins
      }
    } else if (this.tapMoveActive && !this.playerLunge.active && !this.mobEngaged) {
      // Tap/click-to-move: path straight to the tapped ground point at manual speed,
      // then hand back to auto-follow (syncOffset pins the auto target here so there's
      // no slingshot). Arrival snaps the target off; the marker VFX clears with it.
      const dx = this.tapTx - this.player.tx
      const dy = this.tapTy - this.player.ty
      const d = Math.hypot(dx, dy)
      if (d < 0.25) {
        this.tapMoveActive = false
        if (!this.townMode) this.syncOffset()
      } else {
        // Route around obstacles rather than grinding the near shore of a lake.
        const a = this.followPath(this.player, this.playerPath, this.tapTx, this.tapTy, MANUAL_SPEED, dt)
        this.confinePlayer(loB, hiB)
        if (!a.moving) { this.tapStuckT += dt; if (this.tapStuckT > 1.2) this.tapMoveActive = false }
        else this.tapStuckT = 0
        moving = a.moving; mvx = a.mvx; mvy = a.mvy; playerDriving = true
        if (!this.townMode) this.syncOffset()
      }
    } else if (
      !this.townMode && !this.playerLunge.active && !this.mobEngaged && !this.mobAggressive &&
      this.mob && this.showMob && this.mobAnchorX !== null && this.mobAnchorY !== null
    ) {
      // Closing on an encounter: the hero walks out to the waiting enemy. The store
      // still owns the distance (it shrinks mobMapOffset on its own schedule), so this
      // changes only WHICH body covers the ground — engagement still begins at exactly
      // the same moment. Deriving the player's spot from the store gap keeps the visual
      // separation equal to the logical one, so attacks never land across a visible gap.
      const gap = Math.hypot(this.mobPlacedDx, this.mobPlacedDy)
      const tgtX = this.mobAnchorX - this.mobApproachDx * gap
      const tgtY = this.mobAnchorY - this.mobApproachDy * gap
      // Routed, so a lake between hero and quarry is walked around instead of pinning
      // the hero on the near bank while the encounter timer expires anyway.
      const a = this.followPath(this.player, this.playerPath, tgtX, tgtY, MANUAL_SPEED, dt)
      this.confinePlayer(loB, hiB)
      moving = a.moving; mvx = a.mvx; mvy = a.mvy
      // Absorb the walk into the auto-follow offset so disengaging doesn't slingshot
      // the player back to the store's playerMapPos.
      this.syncOffset()
    } else if (!this.townMode && !this.playerLunge.active && !this.mobEngaged) {
      // Auto: torus-aware lerp toward the store's playerMapPos (plus offset) so the
      // player walks and the camera-followed world scrolls past. Frozen while a mob
      // is engaged (stand and fight) or mid-attack-lunge. Never in town (no torus follow).
      const a = this.approachAuto(dt)
      moving = a.moving; mvx = a.mvx; mvy = a.mvy
    } else if (!this.townMode) {
      // Frozen (mid-lunge or in melee): pin the auto target to the entity by
      // absorbing the store's drift into the offset, so resuming auto-follow
      // continues from here instead of yanking the player forward on disengage.
      this.syncOffset()
    }
    if (this.manualMode && !this.townMode) this.syncOffset()

    // ── Publish the hero's world position back to the store ───────────────────
    // Under manual control this controller is the ONLY thing that knows where the hero
    // is: it owns WASD and taps, while the store's `playerMapPos` was historically a
    // sine-wave drift that ignored input entirely. Nothing in the simulation could
    // therefore answer "how close is the player to that wolf", which is why proximity
    // aggro could not exist. Reporting it closes that loop.
    //
    // Only while actually steering — in auto mode the store owns the position and writing
    // to it here would fight `approachAuto` for control of the same value.
    if (!this.townMode && (this.manualMode || this.tapMoveActive)) {
      this.onPlayerMoved?.(
        WorldSceneController.wrapMod(this.player.tx - PAD),
        WorldSceneController.wrapMod(this.player.ty - PAD),
      )
    }

    // Jump arc (independent of horizontal movement). sin(πt) lifts and lands softly.
    if (this.jumpActive) {
      this.jumpT += dt / JUMP_DURATION
      if (this.jumpT >= 1) { this.jumpT = 0; this.jumpActive = false; this.player.z = 0 }
      else this.player.z = Math.sin(this.jumpT * Math.PI) * JUMP_HEIGHT
    } else {
      this.player.z = this.walkBobZ(this.playerBob, moving && !this.playerDead, dt)
    }

    // ── Player animation + facing ──
    const pAnim = this.player.animator.anim
    const inCombatAnim = pAnim === 'attack' || pAnim === 'hit'
    if (this.playerDead) {
      // Downed: hold the death pose, no movement/attack anim, cancel any lunge.
      this.player.animator.set('death')
      this.playerLunge.active = false
    } else {
    if (this.player.animator.finished && this.playerLunge.t >= 1) this.player.animator.set('idle')
    if (this.mob && this.mobEngaged && !this.playerLunge.active) {
      // Engaged: face the mob, idle between swings (attack/hit are set by triggers).
      this.faceToward(this.player, this.mob.tx, this.mob.ty)
      if (!inCombatAnim) this.player.animator.set('idle')
    } else if (moving) {
      this.lastFaceDx = mvx; this.lastFaceDy = mvy
      this.faceToward(this.player, this.player.tx + mvx, this.player.ty + mvy)
      // Movement uses the 'idle' tag on purpose: in the sprites we have (FFTA scaffold
      // and the placeholder rig alike) the idle tag holds the good-looking gait, while
      // the 'walk' tag is a flinchy jitter. Idle-as-walk is the intended movement anim;
      // the flinch/'hit' tag is reserved for taking damage.
      if (!inCombatAnim) this.player.animator.set('idle')
    } else if (!inCombatAnim) {
      this.player.animator.set('idle')
    }
    }

    // ── Mob placement + animation + facing ──
    // While closing, the mob HOLDS its anchor (the player is the one walking, above).
    // Once engaged it goes back to being glued at a fixed gap from the player, so it
    // stays put through lunges and any manual repositioning mid-fight.
    let mobMoved = false, mobMvx = 0, mobMvy = 0
    if (this.mob) {
      if (!this.mobLunge.active) {
        // Where the mob WANTS to be. While the hero is auto-driven and closing, that's
        // the anchor it's holding. But if the player took the wheel, the hero isn't
        // covering the ground any more — so the mob has to close the gap itself.
        // Exactly one body covers the ground. A territorial mob holds its anchor and the
        // hero walks in (below); an aggressive one charges and the hero stands to receive
        // it. Manual steering always forces the mob to close, since the hero plainly
        // isn't.
        const holding =
          !this.mobEngaged && !playerDriving && !this.mobAggressive &&
          this.mobAnchorX !== null && this.mobAnchorY !== null
        const mtx = holding ? this.mobAnchorX! : this.player.tx + this.mobPlacedDx
        const mty = holding ? this.mobAnchorY! : this.player.ty + this.mobPlacedDy

        // Ease toward it — never hard-place. Assigning the target directly is what made a
        // manually-moving player watch the mob TELEPORT to their side: it had been sitting
        // on an anchor the hero walked away from, and the switch to the player-relative
        // slot on engagement closed that whole distance in one frame. Converging means the
        // mob is always seen walking it.
        const mdx = mtx - this.mob.tx
        const mdy = mty - this.mob.ty
        const md = Math.hypot(mdx, mdy)
        mobMoved = false
        if (md > 0.001) {
          const k = this.mobEngaged ? MOB_ENGAGE_K : MOB_CLOSE_K
          const step = Math.min(md, Math.max(md * (1 - Math.exp(-k * dt)), MOB_MIN_CLOSE * dt))
          // Routed and collided, like everything else that walks. This used to assign
          // tx/ty outright with no ground check at all — which is why a mob would sail
          // straight across a lake the instant the store declared the fight joined.
          const r = this.followPath(this.mob, this.mobPath, mtx, mty, step / Math.max(dt, 1e-4), dt)
          if (r.moving && md > 0.35) { mobMoved = true; mobMvx = r.mvx; mobMvy = r.mvy }
        }
        // When the MOB is the one moving, the anchor rides along, so handing control back
        // (player stops steering) resumes the hold from where it actually stands.
        if (!holding) { this.mobAnchorX = this.mob.tx; this.mobAnchorY = this.mob.ty }
      }
      // Same footfall cue on the mob, so a CHARGING enemy visibly strides at you while a
      // territorial one stands its ground — the distinction the temperament split exists
      // to make, and which is invisible without it.
      if (!this.mobLunge.active) this.mob.z = this.walkBobZ(this.mobBob, mobMoved, dt)
      // Spawn fade — a mob materialises 10–15 tiles out, comfortably inside the visible
      // radius at this zoom, so without it an enemy simply blinks into existence.
      if (this.mobFadeT > 0) {
        this.mobFadeT = Math.max(0, this.mobFadeT - realDt)
        this.mob.alpha = 1 - this.mobFadeT / MOB_SPAWN_FADE
      }
      const mAnim = this.mob.animator.anim
      const mobInCombat = mAnim === 'attack' || mAnim === 'hit'
      if (this.mob.animator.finished && this.mobLunge.t >= 1) this.mob.animator.set('idle')
      // Face where it's GOING while it walks a route (which may be around an obstacle,
      // i.e. not at the player at all); face the player once engaged or standing. Facing
      // the player unconditionally is what made a mob pinned against terrain spin on the
      // spot — sub-tile jitter flipped its facing every frame.
      if (mobMoved && !this.mobEngaged) {
        this.faceToward(this.mob, this.mob.tx + mobMvx, this.mob.ty + mobMvy)
      } else {
        this.faceToward(this.mob, this.player.tx, this.player.ty)
      }
      // 'idle' for both engaged and approaching — the 'walk' tag is the flinchy jitter
      // (see the player movement note); idle holds the good gait for these sprites.
      if (!mobInCombat) this.mob.animator.set('idle')
    }

    this.scene.update(dt)

    // Advance traveling bolts → burst at the target on arrival, then retire.
    if (this.bolts.length) {
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const b = this.bolts[i]
        b.t += dt * 5.5 // ~0.18s flight
        if (b.t >= 1) {
          b.entity.active = false
          // Impact reaction on arrival (this is where a spell should *land* and feel
          // heavy) — flash/recoil the target, burst, rumble; else just a burst.
          if (b.impact && b.impact.active) this.impactHit(b.impact, b.palette, b.mag, 0.05)
          else this.spawnBurst(b.toX, b.toY, b.palette)
          this.bolts.splice(i, 1)
        } else {
          b.entity.tx = b.fromX + (b.toX - b.fromX) * b.t
          b.entity.ty = b.fromY + (b.toY - b.fromY) * b.t
          const tc = fxColors(b.palette)
          this.emitTrail(feetX(g, b.entity.tx, b.entity.ty), feetY(g, b.entity.tx, b.entity.ty), tc.core, tc.glow)
        }
      }
    }
    // Retire one-shot bursts once their anim finishes (free the pool slot).
    const es = this.scene.entities
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.active && e.sprite === this.burstRig && e.animator.finished) e.active = false
    }

    // Advance slain-mob death fades (real time, so it continues through hit-stop):
    // hold the 'death' pose, ease alpha to 0, sink slightly, then retire the entity.
    if (this.dyingMobs.length) {
      for (let i = this.dyingMobs.length - 1; i >= 0; i--) {
        const d = this.dyingMobs[i]
        d.t += realDt / DEATH_DURATION
        if (d.t >= 1) {
          d.e.active = false
          d.e.alpha = 1
          d.e.z = 0
          this.dyingMobs.splice(i, 1)
        } else {
          d.e.alpha = 1 - d.t * d.t     // ease-out fade
          d.e.z = -Math.min(3, d.t * 3) // slight sink into the ground
        }
      }
    }

    // Camera: follow the player's feet. In town the map is finite → CLAMP to its bounds
    // (no torus) so you never scroll past the edge into void; centre it if the map is
    // smaller than the viewport. In the open world, centre freely (wrapped ground).
    if (this.townMode && this.ground === this.townGround) {
      const cx = feetX(g, this.player.tx, this.player.ty) - this.cam.w / 2
      const cy = feetY(g, this.player.tx, this.player.ty) - this.cam.h / 2
      this.cam.x = g.width <= this.cam.w ? (g.width - this.cam.w) / 2 : clamp(cx, 0, g.width - this.cam.w)
      this.cam.y = g.height <= this.cam.h ? (g.height - this.cam.h) / 2 : clamp(cy, 0, g.height - this.cam.h)
    } else {
      this.cam.x = feetX(g, this.player.tx, this.player.ty) - this.cam.w / 2
      this.cam.y = feetY(g, this.player.tx, this.player.ty) - this.cam.h / 2
    }

    // Rumble: decaying random kick applied after centering (so it doesn't accumulate).
    if (this.shakeT > 0) {
      const k = this.shakeMag * (this.shakeT / SHAKE_DURATION)
      this.cam.x += (Math.random() * 2 - 1) * k
      this.cam.y += (Math.random() * 2 - 1) * k
    }

    // Advance the population: the roaming open-world crowd, or the idle town crowd.
    if (this.townMode) {
      try { this.updateTownCrowd(realDt) } catch (err) { console.error('[town] crowd update failed:', err) }
      try { this.updateNearestNpc() } catch (err) { console.error('[town] npc proximity failed:', err) }
    } else {
      // Pin tall-prop entities to the wrapped copy nearest the player before the sort
      // so they depth-correct against the player/mob as the player moves (Phase E).
      this.updatePropEntities()
      this.advanceBystanders(realDt)
      // Guarded so a stray ambient error can never take down the whole scene render.
      try { this.updateAmbient(realDt) } catch (err) { console.error('[ambient] update failed:', err) }
    }

    this.scene.render(this.ctx, this.cam, g, dt, this.drawTargetReticle)

    // Particle FX over the world (bloom via additive compositing). Advanced on real
    // time so glows keep flowing through hit-stop.
    this.updateParticles(realDt)
    this.drawParticles()

    // Fallback glyphs for any node type without a tall-prop sprite (open world only).
    if (!this.townMode) this.drawNodes(g)

    // Tap/click-to-move destination marker (over the world, under the HUD/nameplates).
    this.drawMoveMarker(g)

    // Nameplates: building destinations + idle crowd in town, else roaming heroes.
    try {
      if (this.townMode) this.drawTownLabels(g)
      else this.drawAmbientNameplates()
    } catch (err) { console.error('[nameplate] draw failed:', err) }

    // Player chevron — gold marker above the followed unit (rides above the jump).
    const px = Math.round(this.player.screenX - this.cam.x)
    const py = Math.round(this.player.screenY - this.cam.y - this.player.sprite.frameH - 6 - this.player.z)
    this.ctx.fillStyle = '#f4c84a'
    this.ctx.beginPath()
    this.ctx.moveTo(px - 4, py)
    this.ctx.lineTo(px + 4, py)
    this.ctx.lineTo(px, py + 5)
    this.ctx.closePath()
    this.ctx.fill()

    // Manual-mode indicator: a faint pulsing ring at the hero's feet.
    if (this.lastControlMode === 'manual') {
      const fy = Math.round(this.player.screenY - this.cam.y)
      this.ctx.save()
      this.ctx.strokeStyle = '#f4c84a'
      this.ctx.lineWidth = 2
      this.ctx.globalAlpha = 0.5 + Math.sin(this.tapPulse * 6) * 0.15
      this.ctx.beginPath()
      this.ctx.ellipse(px, fy, 18, 7, 0, 0, Math.PI * 2)
      this.ctx.stroke()
      this.ctx.restore()
    }

    // Ambient particles (biome life) then weather overlay — drawn over the world,
    // under the DOM HUD. Advanced on real time so they flow through hit-stop.
    this.drawAmbient(realDt)
    this.drawWeather(realDt)

    // Floaters (DOM pool).
    this.updateFloaters(dt)
  }

  // ── Weather overlay (dimetric scene) ──────────────────────────────────────────
  // Brings the store's weatherState into the world: an overcast dim + drifting cloud
  // shadows for cloudy/rain, plus animated rain streaks. Pure canvas overlay — no new
  // state, no game-logic touch.
  private drawWeather(dt: number): void {
    const t = this.weatherType
    if (t === 'clear') return
    const ctx = this.ctx
    const W = this.cam.w, H = this.cam.h

    // Overcast dim + slow-drifting soft cloud shadows.
    ctx.save()
    ctx.globalAlpha = t === 'rain' ? 0.20 : 0.11
    ctx.fillStyle = t === 'rain' ? '#0a1420' : '#1c1c26'
    ctx.fillRect(0, 0, W, H)
    this.cloudPhase = (this.cloudPhase + dt * 7) % (W + 260)
    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#000'
    for (let i = 0; i < 3; i++) {
      const cx = ((this.cloudPhase * (0.6 + i * 0.25) + i * 110) % (W + 260)) - 130
      const cy = 24 + i * 46
      ctx.beginPath()
      ctx.ellipse(cx, cy, 96, 30, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    if (t === 'rain') {
      this.rainT += dt
      ctx.save()
      ctx.strokeStyle = 'rgba(160,190,225,0.34)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < 64; i++) {
        const speed = 260 + (i % 5) * 46
        const x = ((i * 97) + this.rainT * 46) % W
        const y = (((i * 61) + this.rainT * speed) % (H + 24)) - 12
        ctx.moveTo(x, y)
        ctx.lineTo(x - 3, y + 10)
      }
      ctx.stroke()
      ctx.restore()
    }
  }

  // ── Ambient life (biome particles) ────────────────────────────────────────────
  // A handful of drifting glow motes give each biome idle motion — fireflies, embers,
  // dust, toxic spores. Additive blend for a soft bloom; positions are closed-form in
  // (index, time) so there is no per-frame particle state to allocate.
  private drawAmbient(dt: number): void {
    const cfg = BIOME_AMBIENT[this.currentZone]
    if (!cfg) return
    this.ambientT += dt
    const ctx = this.ctx, W = this.cam.w, H = this.cam.h, t = this.ambientT
    const mod = (v: number, m: number) => ((v % m) + m) % m
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = cfg.color
    for (let i = 0; i < cfg.count; i++) {
      const s = (i * 1103515245 + 12345) & 0x7fffffff
      const bx = (s % 1000) / 1000
      const by = ((s >> 9) % 1000) / 1000
      const px = mod(bx * W + t * cfg.drift * (0.5 + (i % 3) * 0.3) + Math.sin(t * 0.8 + i) * 8, W)
      const py = mod(by * H + t * cfg.rise, H)
      const a = cfg.twinkle ? 0.28 + 0.42 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)) : 0.5
      ctx.globalAlpha = a
      ctx.beginPath(); ctx.arc(px, py, cfg.size, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = a * 0.3
      ctx.beginPath(); ctx.arc(px, py, cfg.size * 2.4, 0, Math.PI * 2); ctx.fill()  // glow halo
    }
    ctx.restore()
  }

  /** Torus-aware exponential approach toward the store's playerMapPos (autoTx/autoTy).
   *  Returns the unit movement vector so the caller can drive the walk animation and
   *  facing. wrapDiff gives the shortest signed delta across the 64-tile torus, and
   *  wrapMod re-anchors the entity into the buffer interior — the wrapped ground
   *  buffer makes that re-anchor visually seamless (same game tile on both sides). */
  private approachAuto(dt: number): { moving: boolean; mvx: number; mvy: number } {
    const ddx = WorldSceneController.wrapDiff(this.autoTx - PAD, this.player.tx - PAD)
    const ddy = WorldSceneController.wrapDiff(this.autoTy - PAD, this.player.ty - PAD)
    const dist = Math.hypot(ddx, ddy)
    if (dist < 0.02) return { moving: false, mvx: 0, mvy: 0 }
    const step = 1 - Math.exp(-AUTO_LERP_K * dt)
    this.player.tx = PAD + WorldSceneController.wrapMod(this.player.tx - PAD + ddx * step)
    this.player.ty = PAD + WorldSceneController.wrapMod(this.player.ty - PAD + ddy * step)
    return { moving: true, mvx: ddx / dist, mvy: ddy / dist }
  }

  /** Recompute the visual offset = entity − store map pos (shortest toroidal delta).
   *  Called while the player is manual-controlled or frozen (engaged / mid-lunge) so
   *  the auto-follow target stays pinned to the entity; NOT called during auto-drive
   *  (that would cancel the very movement we want). Keeps auto from slingshotting
   *  back to the store's playerMapPos when manual override or combat ends. */
  private syncOffset(): void {
    this.autoOffsetDx = WorldSceneController.wrapDiff(this.player.tx - PAD, this.storeMapX)
    this.autoOffsetDy = WorldSceneController.wrapDiff(this.player.ty - PAD, this.storeMapY)
  }

  private advanceLunge(l: Lunge, e: Entity, dt: number): void {
    if (!l.active) return
    l.t += dt * 3.2
    const phase = l.t < 0.5 ? l.t * 2 : 2 - l.t * 2
    e.tx = l.homeX + (l.targetX - l.homeX) * 0.42 * phase
    e.ty = l.homeY + (l.targetY - l.homeY) * 0.42 * phase
    if (l.t >= 1) {
      l.active = false
      l.t = 1
      e.tx = l.homeX
      e.ty = l.homeY
    }
  }

  // ── Tall-prop entity lifecycle (Phase E) ──────────────────────────────────────

  private nodeTallProp(type: MapNode['type']): IndexedSprite | null {
    switch (type) {
      case 'ore': return this.tallProps[TALL_PROP.ORE_OUTCROP]
      case 'herb': return this.tallProps[TALL_PROP.HERB_BUSH]
      case 'boss_lair': return this.tallProps[TALL_PROP.LAIR]
      case 'mob_spawn': return this.tallProps[TALL_PROP.CAIRN]
      default: return null
    }
  }

  private retirePropEntities(): void {
    for (const pe of this.propEntities) pe.entity.active = false
    this.propEntities = []
  }

  private spawnPropEntities(nodes: MapNode[], palId: string): void {
    for (const node of nodes) {
      const sprite = this.nodeTallProp(node.type)
      if (!sprite) continue // unmapped types fall back to the drawNodes glyph
      // Spawn at PAD + wrapped game coord; updatePropEntities re-pins to the near
      // copy each frame so props wrap correctly as the player moves.
      const e = this.scene.spawn(
        sprite, palId,
        PAD + WorldSceneController.wrapMod(node.x),
        PAD + WorldSceneController.wrapMod(node.y),
      )
      e.shadow = false
      e.animator.set('idle')
      this.propEntities.push({ entity: e, gx: node.x, gy: node.y })
    }
  }

  // Tall biome scenery (trees, boulders, spires, mounds, ruins) — depth-sorted so a
  // unit can walk behind them, and shadowed to sit on the ground (FFTA-diorama look).
  // Props carry their OWN palette (verdant/barren), not the biome ground palette, so
  // they read as distinct objects instead of camouflaging into the terrain.
  private spawnScenery(scenery: MapScenery[]): void {
    const spal = BARREN_SCENERY.has(this.currentZone) ? 'prop/barren' : 'prop/verdant'
    for (const sc of scenery) {
      const sprite = this.tallProps[sc.kind]
      if (!sprite) continue
      const e = this.scene.spawn(
        sprite, spal,
        PAD + WorldSceneController.wrapMod(sc.x),
        PAD + WorldSceneController.wrapMod(sc.y),
      )
      e.shadow = true
      e.animator.set('idle')
      this.propEntities.push({ entity: e, gx: sc.x, gy: sc.y })
    }
  }

  private updatePropEntities(): void {
    if (!this.propEntities.length) return
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    for (const pe of this.propEntities) {
      // Pin to the wrapped copy nearest the player so the prop is always on the
      // visible side of the torus (mirrors drawNodes' wrapDiff logic).
      pe.entity.tx = this.player.tx + WorldSceneController.wrapDiff(pe.gx, pgx)
      pe.entity.ty = this.player.ty + WorldSceneController.wrapDiff(pe.gy, pgy)
    }
  }

  // ── Simulated MMO ambience ────────────────────────────────────────────────────
  private zoneSeed(): number {
    const s = this.currentZone
    let h = 0
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    // Fold in the run's world seed so the roaming crowd is arranged differently per
    // character too — otherwise every playthrough meets the same heroes in the same spots.
    return Math.abs(h ^ Math.imul(this.worldSeed, 0x9E3779B9))
  }

  private retireAmbient(): void {
    for (const a of this.ambient) a.e.active = false
    this.ambient = []
    this.ambientGroups = []
    // Indices into `ambient` are now meaningless; holding stale ones would point the
    // companion at whatever happens to land in that slot next.
    this.followerIdx = -1
    this.companionFoeIdx = -1
    this.companionSparCd = 0
  }

  // Place a group anchor a spread's distance from the player's tile, in a seeded
  // direction, so encounters sit around (not on top of) the player.
  private ambientAnchor(dirRnd: number, distRnd: number): { gx: number; gy: number } {
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    const ang = dirRnd * Math.PI * 2
    const dist = AMBIENT_GROUP_SPREAD * (0.5 + 0.5 * distRnd)
    let gx = WorldSceneController.wrapMod(pgx + Math.cos(ang) * dist)
    let gy = WorldSceneController.wrapMod(pgy + Math.sin(ang) * dist)
    // Anchor on land — a group seeded mid-lake would have to wade out in full view.
    if (this.walkMask && !this.walkableAt(gx + PAD, gy + PAD)) {
      const w = nearestWalkable(this.walkMask, gx, gy)
      gx = WorldSceneController.wrapMod(w.x)
      gy = WorldSceneController.wrapMod(w.y)
    }
    return { gx, gy }
  }

  private spawnAmbient(groupCount = AMBIENT_GROUPS_WORLD): void {
    if (!this.rigs) return
    const seed = this.zoneSeed()
    const rnd = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
    const totalW = AMBIENT_GROUPS.reduce((a, g) => a + g.w, 0)
    const jitter = (b: number) => (rnd(b) * 2 - 1) * 2.2   // member offset within a group
    let heroIndex = 0   // stable per-zone hero ordinal → stable identity sub-stream
    this.ambientRng = subStream(seed, 'groups')
    for (let gi = 0; gi < groupCount; gi++) {
      // Weighted-pick this encounter's shape.
      let r = rnd(gi * 13) * totalW
      let tmpl = AMBIENT_GROUPS[0]
      for (const g of AMBIENT_GROUPS) { if ((r -= g.w) < 0) { tmpl = g; break } }
      const a = this.ambientAnchor(rnd(gi * 13 + 1), rnd(gi * 13 + 2))
      this.ambientGroups.push({ gx: a.gx, gy: a.gy, fight: tmpl.fight })
      for (let k = 0; k < tmpl.h; k++) {
        const s = gi * 100 + k * 11 + 3
        // Identity now comes from `engine/ambient`, so an ambient hero has the same
        // shape as the player — class, race, level band, AND a real spec allocation
        // that both titles them and changes how their simulated fights go.
        const id = makeAmbientHero(seed, heroIndex, this.playerLevel)
        heroIndex++
        const spriteId = heroSpriteId(id.race, id.playerClass, id.name)
        const sprite = this.spriteCache[spriteId] ?? this.rigs.player
        const gx = WorldSceneController.wrapMod(a.gx + jitter(s + 4))
        const gy = WorldSceneController.wrapMod(a.gy + jitter(s + 5))
        const e = this.scene.spawn(sprite, heroPaletteId(id.playerClass, id.race, id.faction, id.rarity),
          PAD + WorldSceneController.wrapMod(gx), PAD + WorldSceneController.wrapMod(gy))
        e.shadow = true; e.animator.set('idle')  // idle tag IS the gait (walk is flinchy)
        this.ambient.push({
          e, kind: 'hero', gx, gy, tgx: gx, tgy: gy, t: rnd(s + 8) * 3,
          fightT: 0, atkCd: rnd(s + 7) * 0.6,
          name: id.name, level: id.level, faction: id.faction, grp: gi,
          rng: subStream(seed, `beh:${gi}:${k}`), state: tmpl.fight ? 'approach' : 'wander',
          identity: id, bark: null, barkT: 0, barkCd: rnd(s + 12) * BARK_COOLDOWN_SECONDS,
          fightLog: null, playT: 0, playIdx: 0, foe: -1, wonLast: false, respawnT: 0,
          rejoinAfter: false,
        })
      }
      for (let k = 0; k < tmpl.m; k++) {
        const s = gi * 100 + k * 11 + 60
        const monsterId = MONSTER_SPRITES[Math.floor(rnd(s) * MONSTER_SPRITES.length)]
        const sprite = this.spriteCache[monsterId] ?? this.rigs.mobBeast
        const pal = rnd(s + 1) < 0.25 ? 'elite' : 'team/enemy'
        const gx = WorldSceneController.wrapMod(a.gx + jitter(s + 2))
        const gy = WorldSceneController.wrapMod(a.gy + jitter(s + 3))
        const e = this.scene.spawn(sprite, pal, PAD + WorldSceneController.wrapMod(gx), PAD + WorldSceneController.wrapMod(gy))
        e.shadow = true; e.animator.set('idle')
        this.ambient.push({
          e, kind: 'mob', gx, gy, tgx: gx, tgy: gy, t: rnd(s + 4) * 3,
          fightT: 0, atkCd: rnd(s + 6) * 0.6,
          name: '', level: 0, faction: 'neutral', grp: gi,
          rng: subStream(seed, `beh:${gi}:m${k}`), state: 'idle',
          identity: null, bark: null, barkT: 0, barkCd: 0,
          fightLog: null, playT: 0, playIdx: 0, foe: -1, wonLast: false, respawnT: 0,
          rejoinAfter: false,
        })
      }
    }
  }

  // ── Town hub ────────────────────────────────────────────────────────────────
  // Load the flat FFTA town PNG once as a static GroundBuffer (cached). tile (0,0)'s
  // feet land ~centre so the crowd + player + building anchors sit on the square; the
  // origin is tuned by eye. LOCAL DEV SCAFFOLD ONLY (gitignored art), tear-out safe.
  private async loadTownGround(): Promise<GroundBuffer | null> {
    if (this.townGround) return this.townGround
    // Originals-by-default builds have no scaffold town PNG at all (local-assets/ is
    // gitignored and never copied into dist/), so don't even attempt the fetch — bake a
    // plaza instead. Before 2026-08-01 this path returned null in every production build
    // and enterTownScene bailed on it, which meant the shipped town was an inert screen:
    // no ground, no crowd, no NPCs, no services reachable.
    if (!useScaffoldArt) return this.makeTownPlaza()
    try {
      const base = import.meta.env.BASE_URL
      const res = await fetch(`${base}local-assets/ffta-scaffold/${TOWN_MAP_FILE}`)
      if (!res.ok) return this.makeTownPlaza()
      const bmp = await createImageBitmap(await res.blob())
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * TOWN_SCALE)
      c.height = Math.round(bmp.height * TOWN_SCALE)
      const cx = c.getContext('2d')!
      cx.imageSmoothingEnabled = false
      cx.drawImage(bmp, 0, 0, c.width, c.height)
      this.townGround = {
        canvas: c, originX: c.width / 2 - HALF_W, planeOffsetY: c.height * 0.5 - HALF_H,
        width: c.width, height: c.height, heights: null, bw: 0,
        sheet: null, sheetCols: 0, sheetFrameW: 0, sheetFrameH: 0, anims: [], elapsed: 0,
        wrapTiles: 0,   // town is a finite hand-authored map, not a torus — never tiled
      }
      return this.townGround
    } catch (e) {
      console.error('[town] loadTownGround failed', e)
      return this.makeTownPlaza()
    }
  }

  /**
   * The committed, shippable town ground: a paved plaza fading to grass, baked from the
   * same programmatic tileset the open world falls back to. Deliberately flat (no
   * `heights`) so walkability and NPC anchors need no extra cases.
   *
   * Anchoring: bakeGround lays map cell (0,0) at the buffer origin, but town tile coords
   * are centred on (0,0) and run negative (NPC anchors span roughly ±4). Biasing the
   * plane by the centre cell's Y makes town tile (0,0) land on map cell (C,C). Only Y
   * needs the bias — tileToScreenX depends on (tx − ty), so adding C to both cancels.
   */
  private makeTownPlaza(): GroundBuffer {
    const N = 24, C = N >> 1
    const tiles = new Uint8Array(N * N)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const d = Math.max(Math.abs(x - C), Math.abs(y - C))
        tiles[y * N + x] =
          d <= 6 ? ((x + y) % 2 === 0 ? TILE.PATH : TILE.PATH_ALT)   // chequered paving
          : d <= 8 ? TILE.PATH_ALT                                    // worn verge
          : (x * 7 + y * 3) % 11 === 0 ? TILE.FLOWER
          : (x + y) % 3 === 0 ? TILE.GRASS_ALT
          : TILE.GRASS
      }
    }
    const g = bakeGround(
      { w: N, h: N, tiles, props: [] },
      this.tileset, 'biome/meadow', getPalette('biome/meadow'), TILE_ANIMS, this.propSheet,
    )
    this.townGround = { ...g, planeOffsetY: g.planeOffsetY + 2 * C * HALF_H, wrapTiles: 0 }
    return this.townGround
  }

  private async enterTownScene(): Promise<void> {
    // Clear the open-world population + any lingering combat before the swap.
    this.retireAmbient()
    this.retirePropEntities()
    if (this.mob) { this.mob.active = false; this.mob = null }
    for (const rec of this.otherMobEnts.values()) rec.e.active = false
    this.otherMobEnts.clear()
    this.manualMode = false
    this.tapMoveActive = false
    this.input = { up: false, down: false, left: false, right: false }
    const g = await this.loadTownGround()
    if (!g || !this.townMode) return // failed, or the player already left during load
    this.ground = g
    this.player.tx = 0
    this.player.ty = 0
    this.player.z = 0
    this.player.animator.set('idle')
    this.spawnTownCrowd()
    this.spawnTownNpcs()
    this.townBuildings = []
  }

  /**
   * Give every town service a body standing at its anchor. These replace the bare
   * building labels: the services used to live in one panel over the scene, and now the
   * scene IS the menu — you walk to the person whose business you want.
   */
  private spawnTownNpcs(): void {
    if (!this.rigs) return
    for (const def of TOWN_NPCS) {
      const spriteId = heroSpriteId(def.race, def.cls, def.name)
      const sprite = this.spriteCache[spriteId] ?? this.rigs.player
      const e = this.scene.spawn(
        sprite, heroPaletteId(def.cls, def.race, def.faction, 'rare'), def.tx, def.ty,
      )
      e.shadow = true
      e.animator.set('idle')
      // Face roughly inward, so the square reads as populated rather than as a car park.
      e.animator.face(def.tx > 0 ? 'sw' : 'se')
      this.townNpcs.push({ def, e })
    }
  }

  /** Nearest NPC inside talking distance, or null. Reported only when it changes. */
  private updateNearestNpc(): void {
    let found: TownServiceKind | null = null
    let best = NPC_TALK_RADIUS
    for (const n of this.townNpcs) {
      const d = Math.hypot(n.e.tx - this.player.tx, n.e.ty - this.player.ty)
      if (d <= best) { best = d; found = n.def.id }
    }
    if (found !== this.nearNpc) {
      this.nearNpc = found
      this.onTownNpcChanged?.(found)
    }
  }

  private leaveTownScene(): void {
    for (const a of this.townCrowd) a.e.active = false
    this.townCrowd = []
    for (const n of this.townNpcs) n.e.active = false
    this.townNpcs = []
    if (this.nearNpc !== null) { this.nearNpc = null; this.onTownNpcChanged?.(null) }
    this.townBuildings = []
    this.townMode = false
    this.zone = null // force a clean zone rebake (repositions player, respawns crowd/props)
  }

  private spawnTownCrowd(): void {
    if (!this.rigs) return
    for (let i = 0; i < TOWN_CROWD; i++) {
      const ang = (i / TOWN_CROWD) * Math.PI * 2 + (i % 3)
      const r = 2 + (i % 4) * 1.15
      const hx = Math.cos(ang) * r
      const hy = Math.sin(ang) * r
      const faction: FactionType = i % 2 === 0 ? 'alliance' : 'horde'
      const races = faction === 'alliance' ? CONCORD_RACES : ASHMARCH_RACES
      const race = races[i % races.length]
      const cls = AMBIENT_CLASSES[i % AMBIENT_CLASSES.length]
      const rarity = AMBIENT_RARITY[i % AMBIENT_RARITY.length]
      const name = AMBIENT_NAMES[i % AMBIENT_NAMES.length]
      const spriteId = heroSpriteId(race, cls, name)
      const sprite = this.spriteCache[spriteId] ?? this.rigs.player
      const e = this.scene.spawn(sprite, heroPaletteId(cls, race, faction, rarity), hx, hy)
      e.shadow = true
      e.animator.set('idle')
      e.animator.face(i % 2 ? 'se' : 'sw')
      this.townCrowd.push({ e, hx, hy, tx: hx, ty: hy, t: Math.random() * 3, name, faction })
    }
  }

  private updateTownCrowd(dt: number): void {
    const SPEED = 1.0
    for (const a of this.townCrowd) {
      const dx = a.tx - a.e.tx, dy = a.ty - a.e.ty
      const d = Math.hypot(dx, dy)
      if (d < 0.3 || a.t <= 0) {
        a.tx = a.hx + (Math.random() * 2 - 1) * 1.6
        a.ty = a.hy + (Math.random() * 2 - 1) * 1.6
        a.t = 2 + Math.random() * 4
      } else {
        a.e.tx += dx / d * SPEED * dt
        a.e.ty += dy / d * SPEED * dt
        a.e.animator.face(faceFromVec(dx, dy))
      }
      a.t -= dt
    }
  }

  // Building destination labels + crowd nameplates (town). Same crisp outlined text as
  // the open-world nameplates; buildings gold, folk faction-tinted.
  private drawTownLabels(g: GroundBuffer): void {
    const ctx = this.ctx
    ctx.save()
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.font = '700 10px system-ui, -apple-system, "Segoe UI", sans-serif'
    for (const b of this.townBuildings) {
      const sx = Math.round(feetX(g, b.tx, b.ty) - this.cam.x)
      const sy = Math.round(feetY(g, b.tx, b.ty) - this.cam.y - 22)
      if (sx < -60 || sx > this.cam.w + 60) continue
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(0,0,0,0.95)'
      ctx.strokeText(b.label, sx, sy)
      ctx.fillStyle = '#ffe08a'
      ctx.fillText(b.label, sx, sy)
    }
    // Service NPCs: role above the head, lit up once the hero is close enough to talk.
    for (const n of this.townNpcs) {
      const sx = Math.round(n.e.screenX - this.cam.x)
      const sy = Math.round(n.e.screenY - this.cam.y - n.e.sprite.frameH - 4)
      if (sx < -70 || sx > this.cam.w + 70) continue
      const near = this.nearNpc === n.def.id
      ctx.font = `700 ${near ? 11 : 10}px system-ui, -apple-system, "Segoe UI", sans-serif`
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(0,0,0,0.95)'
      ctx.strokeText(n.def.role, sx, sy)
      ctx.fillStyle = near ? '#ffe08a' : '#c8a864'
      ctx.fillText(n.def.role, sx, sy)
      if (near) {
        ctx.font = '600 8px system-ui, -apple-system, "Segoe UI", sans-serif'
        ctx.lineWidth = 3
        ctx.strokeText(n.def.name, sx, sy + 10)
        ctx.fillStyle = '#d4b896'
        ctx.fillText(n.def.name, sx, sy + 10)
      }
    }
    ctx.font = '600 8px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.lineWidth = 3
    for (const a of this.townCrowd) {
      const sx = Math.round(a.e.screenX - this.cam.x)
      const sy = Math.round(a.e.screenY - this.cam.y - a.e.sprite.frameH - 2)
      if (sx < -40 || sx > this.cam.w + 40 || sy < 0 || sy > this.cam.h) continue
      ctx.strokeStyle = 'rgba(0,0,0,0.95)'
      ctx.strokeText(a.name, sx, sy)
      ctx.fillStyle = a.faction === 'horde' ? '#ff8a7a' : '#8ac0ff'
      ctx.fillText(a.name, sx, sy)
    }
    ctx.restore()
  }

  /** Radius (in tiles) from the player to a screen corner at the current zoom — the
   *  max tile-distance that can be on screen. Keeps ambient recycling off-frame so
   *  re-anchored groups slide in rather than pop (feet projection is flat-ground). */
  private visibleTileRadius(): number {
    const A = (this.cam.w / 2) / HALF_W
    const B = (this.cam.h / 2) / HALF_H
    return Math.hypot((A + B) / 2, (B - A) / 2)
  }

  private updateAmbient(dt: number): void {
    if (!this.ambient.length || !this.player) return
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    const SPEED = 1.3

    // Recycle groups that drift beyond the (zoom-aware) visible radius → re-anchor them
    // just past the screen edge, in the forward hemisphere of travel, so a fresh
    // encounter SLIDES into view instead of popping in. The ring scales with the FOV:
    // now that the world zooms out, a fixed 24-tile ring sat inside the frame (visible
    // radius to a screen corner is ~21 tiles at 1.5×), which is what caused the pop.
    const R = this.visibleTileRadius()
    const recycleAt = R + 9
    const travelAng = Math.atan2(this.lastFaceDy, this.lastFaceDx)
    for (let gi = 0; gi < this.ambientGroups.length; gi++) {
      const grp = this.ambientGroups[gi]
      if (Math.hypot(WorldSceneController.wrapDiff(grp.gx, pgx), WorldSceneController.wrapDiff(grp.gy, pgy)) <= recycleAt) continue
      const ang = travelAng + (this.ambientRng() - 0.5) * Math.PI // ±90° of travel = ahead
      const dist = R + 2 + this.ambientRng() * 5                  // just beyond the edge
      grp.gx = WorldSceneController.wrapMod(pgx + Math.cos(ang) * dist)
      grp.gy = WorldSceneController.wrapMod(pgy + Math.sin(ang) * dist)
      // Re-anchor onto walkable ground, else a whole group materialises mid-lake and
      // then has to shuffle out of it in full view.
      if (this.walkMask && !this.walkableAt(grp.gx + PAD, grp.gy + PAD)) {
        const w = nearestWalkable(this.walkMask, grp.gx, grp.gy)
        grp.gx = WorldSceneController.wrapMod(w.x)
        grp.gy = WorldSceneController.wrapMod(w.y)
      }
      for (let ai = 0; ai < this.ambient.length; ai++) {
        const a = this.ambient[ai]
        if (a.grp !== gi) continue
        // The companion's sparring partner belongs to the player, not to a group anchor —
        // recycling it across the map would yank it out of a fight in progress.
        if (ai === this.companionFoeIdx) continue
        a.gx = WorldSceneController.wrapMod(grp.gx + (a.rng() * 2 - 1) * 2.2)
        a.gy = WorldSceneController.wrapMod(grp.gy + (a.rng() * 2 - 1) * 2.2)
        a.tgx = a.gx; a.tgy = a.gy; a.t = a.rng() * 3
        // The whole group just teleported past the screen edge, so any encounter it was
        // in no longer exists. Drop it — otherwise a hero carries on playing back a
        // fight log next to an opponent that is no longer beside it.
        a.state = 'wander'
        a.foe = -1
        a.fightLog = null
        a.playT = 0
        a.playIdx = 0
        a.bark = null
        a.barkT = 0
        if (a.kind === 'mob') { a.state = 'idle'; a.respawnT = 0; a.e.active = true }
        a.e.animator.set('idle')
      }
    }

    // ── Brains ────────────────────────────────────────────────────────────────
    // Behaviour runs at a fixed low rate, not per frame. The scene must animate at
    // 60fps; deciding whether a hero wants to fight something does not, and this is
    // the single biggest lever on the perf risk the plan calls out.
    this.ambientBrainAccum += dt
    const brainStep = 1 / AMBIENT_BRAIN_HZ
    while (this.ambientBrainAccum >= brainStep) {
      this.ambientBrainAccum -= brainStep
      this.ambientBrain(brainStep)
    }

    for (const a of this.ambient) {
      if (!a.e) continue
      const anchor = this.ambientGroups[a.grp]
      if (!anchor) continue
      if (a.barkT > 0) a.barkT -= dt
      if (a.barkCd > 0) a.barkCd -= dt
      if (a.barkT <= 0) a.bark = null
      if (a.state === 'fight') {
        // Position is held; the fight's beats are driven by the playback in
        // `ambientBrain`, which sets the attack animations.
        if (a.e.animator.finished) a.e.animator.set('idle')
      } else if (a.state === 'loot') {
        if (a.e.animator.finished) a.e.animator.set('idle')
      } else if (a.state === 'follow') {
        // Keep station near the player. Deliberately a loose leash rather than a rigid
        // offset: a companion glued to your shoulder reads as a pet, one that drifts and
        // catches up reads as a person walking with you.
        const dx = WorldSceneController.wrapDiff(pgx, a.gx)
        const dy = WorldSceneController.wrapDiff(pgy, a.gy)
        const d = Math.hypot(dx, dy)
        if (d > FOLLOW_TELEPORT) {
          // The player travelled or tapped far away. Rather than trail hopelessly across
          // the zone, reappear just off-frame and walk in — the same trick the ambient
          // group recycler uses to avoid popping in front of the camera.
          a.gx = WorldSceneController.wrapMod(pgx - dx / (d || 1) * (this.visibleTileRadius() + 3))
          a.gy = WorldSceneController.wrapMod(pgy - dy / (d || 1) * (this.visibleTileRadius() + 3))
        } else if (d > FOLLOW_NEAR) {
          const nx = WorldSceneController.wrapMod(a.gx + dx / d * FOLLOW_SPEED * dt)
          const ny = WorldSceneController.wrapMod(a.gy + dy / d * FOLLOW_SPEED * dt)
          if (this.walkableAt(nx + PAD, a.gy + PAD)) a.gx = nx
          if (this.walkableAt(a.gx + PAD, ny + PAD)) a.gy = ny
          a.e.animator.face(faceFromVec(dx, dy))
        } else if (a.e.animator.finished) {
          a.e.animator.set('idle')
        }
      } else if (a.state === 'approach') {
        // Close on the committed opponent, then hand over to the fight state.
        const foe = this.ambient[a.foe]
        if (!foe || !foe.e.active) { a.state = 'wander'; a.foe = -1 }
        else {
          const dx = WorldSceneController.wrapDiff(foe.gx, a.gx)
          const dy = WorldSceneController.wrapDiff(foe.gy, a.gy)
          const d = Math.hypot(dx, dy)
          if (d <= AMBIENT_ENGAGE_RANGE) {
            a.e.animator.face(faceFromVec(dx, dy))
          } else {
            // A party companion closes at follow speed. It is chasing a target while the
            // player walks away from both of them, so the idle-wander gait left it
            // permanently in transit.
            const sp = a.state === 'approach' && this.ambient[this.followerIdx] === a ? FOLLOW_SPEED : SPEED
            const nx = WorldSceneController.wrapMod(a.gx + dx / d * sp * dt)
            const ny = WorldSceneController.wrapMod(a.gy + dy / d * sp * dt)
            if (this.walkableAt(nx + PAD, a.gy + PAD)) a.gx = nx
            if (this.walkableAt(a.gx + PAD, ny + PAD)) a.gy = ny
            a.e.animator.face(faceFromVec(dx, dy))
          }
        }
      } else {
        // Wander within a short leash of the group's anchor (keeps the cluster tight).
        const dx = WorldSceneController.wrapDiff(a.tgx, a.gx)
        const dy = WorldSceneController.wrapDiff(a.tgy, a.gy)
        const d = Math.hypot(dx, dy)
        if (d < 0.4 || a.t <= 0) {
          a.tgx = WorldSceneController.wrapMod(anchor.gx + (a.rng() * 2 - 1) * AMBIENT_MEMBER_LEASH)
          a.tgy = WorldSceneController.wrapMod(anchor.gy + (a.rng() * 2 - 1) * AMBIENT_MEMBER_LEASH)
          a.t = 2 + a.rng() * 4
        } else {
          // Ambient positions are game coords; walkableAt takes buffer coords, hence +PAD.
          // The crowd obeys the same ground rules as the hero — a dozen heroes wading
          // across a lake undoes the "busy server" illusion faster than anything else.
          const nx = WorldSceneController.wrapMod(a.gx + dx / d * SPEED * dt)
          const ny = WorldSceneController.wrapMod(a.gy + dy / d * SPEED * dt)
          const okX = this.walkableAt(nx + PAD, a.gy + PAD)
          if (okX) a.gx = nx
          if (this.walkableAt(a.gx + PAD, ny + PAD)) a.gy = ny
          else if (!okX) a.t = 0   // boxed in → pick a fresh wander target next tick
          a.e.animator.face(faceFromVec(dx, dy))
        }
        a.t -= dt
      }
      a.e.tx = this.player.tx + WorldSceneController.wrapDiff(a.gx, pgx)
      a.e.ty = this.player.ty + WorldSceneController.wrapDiff(a.gy, pgy)
    }

  }

  /**
   * The behaviour tick — wander → engage → fight → loot → move on.
   *
   * Runs at `AMBIENT_BRAIN_HZ`, not per frame, and only for heroes near the viewport.
   * Everything it rolls comes from the hero's own seeded stream, so the crowd is
   * reproducible and culling one hero cannot perturb another.
   *
   * A fight is resolved ONCE by `runFight` at the moment of engagement and then played
   * back over the following seconds. That keeps a real combat simulation off the frame
   * budget entirely, and it is deliberately the same mechanism Track P will use to
   * render a ghost duel: resolve from a seed, then animate the log.
   */
  private ambientBrain(step: number): void {
    if (!this.player) return
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    // Only think about heroes that are on (or just off) screen. This is the sim budget
    // the plan asks for — an off-screen crowd still exists and still drifts, it just
    // does not run fights or barks nobody can see.
    const thinkRadius = this.visibleTileRadius() + 4

    let fighting = 0
    for (const a of this.ambient) if (a.state === 'fight') fighting++
    let speaking = 0
    for (const a of this.ambient) if (a.barkT > 0) speaking++

    // ── Party sync ────────────────────────────────────────────────────────────
    // The party module owns membership; the adapter owns bodies. Reconcile the two each
    // brain tick by matching on entity key, so a hero who accepted an invite starts
    // following and one who left goes back to their own business.
    const party = getParty()
    if (party.length || this.followerIdx >= 0) {
      const wantKeys = new Set(party.map(m => m.key))
      let found = -1
      for (let i = 0; i < this.ambient.length; i++) {
        const a = this.ambient[i]
        if (a.kind !== 'hero' || !a.identity) continue
        const key = entityKey({
          name: a.name, playerClass: a.identity.playerClass, race: a.identity.race,
          faction: this.factionLabel(a.faction), level: a.level, spec: a.identity.specTitle,
        })
        if (wantKeys.has(key)) {
          found = i
          // Promote into follow ONLY from a free-roaming state.
          //
          // This originally exempted 'fight' and 'loot' but not 'approach', which quietly
          // made companions unable to fight at all: the behaviour tick would set
          // 'approach', and this block — which runs first on the very next tick — would
          // stomp it straight back to 'follow' and clear the target. The companion could
          // never traverse approach → fight, so the only fight you ever saw was one that
          // happened to already be in progress when they accepted the invite.
          // 'approach' is the first beat of their own fight cycle, not idle wandering.
          if (a.state === 'wander' || a.state === 'idle') {
            a.state = 'follow'
            a.foe = -1
          }
        } else if (a.state === 'follow') {
          a.state = 'wander'   // they left the party
        }
      }
      // A member whose body no longer exists (recycled with its group, or the zone
      // changed) cannot follow anyone. Disband rather than keep a ghost in the roster.
      if (party.length && found < 0 && this.followerIdx >= 0) {
        disbandParty()
      }
      this.followerIdx = found

      // Publish what the companion is doing, for the party frame. Health comes from the
      // fight they are currently playing back, so the bar moves for real rather than
      // being decorative — and returns to full between fights, because a companion's HP
      // only exists inside a resolved fight.
      const c = found >= 0 ? this.ambient[found] : null
      if (c && c.identity) {
        const ACTIVITY: Record<string, 'following' | 'moving in' | 'fighting' | 'looting' | 'idle'> = {
          follow: 'following', approach: 'moving in', fight: 'fighting',
          loot: 'looting', wander: 'idle', idle: 'idle',
        }
        let hpFrac = 1
        if (c.state === 'fight' && c.fightLog) {
          // Side 1 acted → the companion (side 0) took the hit; that event carries their
          // remaining and maximum health.
          for (let k = c.playIdx - 1; k >= 0; k--) {
            const e = c.fightLog[k]
            if (e.side === 1 && e.targetMaxHp > 0) { hpFrac = Math.max(0, e.targetHp / e.targetMaxHp); break }
          }
        }
        setCompanionStatus({
          name: c.name,
          activity: ACTIVITY[c.state] ?? 'idle',
          hpFrac,
          attacking: c.state === 'fight' && !c.e.animator.finished,
        })
      } else {
        setCompanionStatus(null)
      }
    }

    // Top up the generated-chat pools. Throttled hard and off the render path: the
    // request itself is async and the pump is a no-op unless a pool is actually low.
    this.chatPumpT -= step
    if (this.chatPumpT <= 0) {
      this.chatPumpT = 10
      const ctx = this.chatContext()
      if (ctx) pumpChatPools(ctx)
    }

    // Respawn slain ambient monsters back at their group anchor, so the zone keeps
    // supplying encounters instead of quietly emptying out.
    for (const m of this.ambient) {
      if (m.kind !== 'mob' || m.e.active || m.respawnT <= 0) continue
      m.respawnT -= step
      if (m.respawnT > 0) continue
      const anchor = this.ambientGroups[m.grp]
      if (!anchor) continue
      m.gx = WorldSceneController.wrapMod(anchor.gx + (m.rng() * 2 - 1) * 2.2)
      m.gy = WorldSceneController.wrapMod(anchor.gy + (m.rng() * 2 - 1) * 2.2)
      m.tgx = m.gx; m.tgy = m.gy
      m.state = 'idle'
      m.foe = -1
      m.fightLog = null
      m.e.active = true
      m.e.alpha = 1
      m.e.animator.set('idle')
    }

    for (let i = 0; i < this.ambient.length; i++) {
      const a = this.ambient[i]
      if (a.kind !== 'hero' || !a.identity) continue
      const near = Math.hypot(
        WorldSceneController.wrapDiff(a.gx, pgx), WorldSceneController.wrapDiff(a.gy, pgy),
      ) <= thinkRadius
      if (!near) continue

      switch (a.state) {
        case 'follow': {
          // A companion still has their own agenda: if something worth killing wanders
          // into reach they will break off, fight it, loot it, and then catch back up.
          // That is the whole difference between a party member and a pet. Their fight
          // is entirely their own — it never touches the player's target, HP, XP or loot.
          this.companionSparCd -= step
          // Prefer a real world monster if one happens to be free and close.
          let foe = this.nearestAmbientMob(i, FOLLOW_SEEK_RANGE)
          // Otherwise give them their own. The zone's ~2 shared monsters are permanently
          // claimed by the heroes standing on top of them, so without this a companion
          // simply never fights — which is exactly how it played.
          if (foe < 0 && this.companionSparCd <= 0) foe = this.spawnCompanionFoe(a)
          if (foe >= 0) {
            a.foe = foe
            a.state = 'approach'
            this.companionSparCd = COMPANION_SPAR_INTERVAL + a.rng() * COMPANION_SPAR_INTERVAL
            speaking += this.tryBark(a, 'engage', speaking)
          } else if (a.rng() < 0.05) {
            // Nothing to kill yet — talk to the player instead. A companion that never
            // says anything is just a sprite trailing behind you.
            speaking += this.tryBark(a, a.rng() < 0.5 ? 'passing' : 'idle', speaking)
          }
          break
        }

        case 'wander':
        case 'idle': {
          // Look for something to pick a fight with, within the sim budget.
          if (fighting >= AMBIENT_FIGHT_BUDGET) break
          const foe = this.nearestAmbientMob(i)
          if (foe >= 0) {
            a.foe = foe
            a.state = 'approach'
            speaking += this.tryBark(a, 'engage', speaking)
          } else if (a.rng() < 0.02) {
            speaking += this.tryBark(a, 'idle', speaking)
          } else {
            // Passing chatter — greeting a neighbour, or trash-talking a rival.
            const other = this.nearestAmbientHero(i)
            if (other >= 0) {
              const rival = this.ambient[other].faction !== a.faction
              speaking += this.tryBark(a, rival ? 'rivalFaction' : 'passing', speaking)
            }
          }
          break
        }

        case 'approach': {
          const foe = this.ambient[a.foe]
          // The target may have been retired (killed by someone else, or recycled with
          // its group) while we were walking over.
          if (!foe || !foe.e.active) { a.state = 'wander'; a.foe = -1; break }
          const d = Math.hypot(
            WorldSceneController.wrapDiff(foe.gx, a.gx), WorldSceneController.wrapDiff(foe.gy, a.gy),
          )
          if (d <= AMBIENT_ENGAGE_RANGE && fighting < AMBIENT_FIGHT_BUDGET) {
            this.beginAmbientFight(a, foe)
            fighting++
          }
          break
        }

        case 'fight': {
          const foe = this.ambient[a.foe]
          if (!a.fightLog || !foe) { a.state = 'wander'; a.foe = -1; break }
          a.playT += step
          // Fire every event whose simulated time has arrived.
          while (a.playIdx < a.fightLog.length && a.fightLog[a.playIdx].t <= a.playT) {
            const ev = a.fightLog[a.playIdx++]
            this.playAmbientFightEvent(a, foe, ev)
          }
          if (a.playIdx >= a.fightLog.length) {
            // Fight over. `wonLast` was set by the death event during playback.
            if (a.wonLast) {
              // The monster holds a death pose through the loot beat, then retires.
              foe.e.animator.set('death')
              a.state = 'loot'
              a.rejoinAfter = i === this.followerIdx
              a.t = 1.6 + a.rng() * 1.2
              speaking += this.tryBark(a, 'kill', speaking)
            } else {
              // The hero lost. Release the monster back to its idle wander — without
              // this it stays pinned in 'fight' forever, holding station against an
              // opponent that walked away.
              foe.state = 'idle'
              foe.foe = -1
              foe.e.animator.set('idle')
              a.state = i === this.followerIdx ? 'follow' : 'wander'
              a.foe = -1
              speaking += this.tryBark(a, 'died', speaking)
            }
            a.fightLog = null
          }
          break
        }

        case 'loot': {
          a.t -= step
          if (a.t <= 0) {
            speaking += this.tryBark(a, 'loot', speaking)
            // Retire the defeated monster and move on — "loot → move on" completed.
            // The corpse is scheduled to respawn rather than deleted: an ambient zone
            // that permanently consumes its own monsters empties out within a minute,
            // and a world of pure wanderers stops reading as a populated server.
            const foe = this.ambient[a.foe]
            if (foe && foe.kind === 'mob') {
              foe.e.active = false
              foe.state = 'idle'
              foe.foe = -1
              // The companion's sparring partner is respawned on the companion's own
              // cadence next to the player, not on the group-anchor respawn timer.
              foe.respawnT = a.foe === this.companionFoeIdx
                ? 0
                : AMBIENT_MOB_RESPAWN + a.rng() * AMBIENT_MOB_RESPAWN
            }
            a.foe = -1
            a.state = a.rejoinAfter || i === this.followerIdx ? 'follow' : 'wander'
            a.rejoinAfter = false
            a.t = 0
          }
          break
        }
      }
    }
  }

  /**
   * A snapshot of the ambient crowd, for driving the app headlessly over CDP.
   *
   * The living world is behaviour over time, so "does it work?" cannot be answered from
   * a screenshot — a hero mid-fight and a hero standing still look identical in a still
   * frame. This exposes the state machine so a probe can assert that heroes actually
   * reach `fight` and `loot` rather than merely milling about.
   */
  ambientDebug(): {
    total: number; heroes: number; mobs: number; freeMobs: number
    states: Record<string, number>
    barking: number; fighting: number; companionAttacks: number
    sample: { name: string; cls: string; lvl: number; spec: string | null; state: string; bark: string | null }[]
  } {
    const states: Record<string, number> = {}
    let heroes = 0, barking = 0, fighting = 0, mobs = 0, freeMobs = 0
    for (let j = 0; j < this.ambient.length; j++) {
      const o = this.ambient[j]
      if (o.kind !== 'mob' || !o.e.active) continue
      mobs++
      if (!this.ambient.some(x => x.foe === j && (x.state === 'fight' || x.state === 'approach'))) freeMobs++
    }
    const sample: { name: string; cls: string; lvl: number; spec: string | null; state: string; bark: string | null }[] = []
    for (const a of this.ambient) {
      if (a.kind !== 'hero') continue
      heroes++
      states[a.state] = (states[a.state] ?? 0) + 1
      if (a.barkT > 0) barking++
      if (a.state === 'fight') fighting++
      if (sample.length < 10 && a.identity) {
        sample.push({
          name: a.name, cls: a.identity.playerClass, lvl: a.level,
          spec: a.identity.specTitle, state: a.state, bark: a.bark,
        })
      }
    }
    return {
      total: this.ambient.length, heroes, mobs, freeMobs, states, barking, fighting,
      // How many attack animations the companion has played — the only honest way to
      // answer "is my party member actually fighting?" from outside.
      companionAttacks: this.companionAttackCount, sample,
    }
  }

  /**
   * On-screen positions of ambient heroes, for headless drivers that need to TAP one
   * (whisper flow). Buffer-space coords; a driver scales by canvas-rect / canvas-width.
   */
  ambientScreenPositions(): { name: string; sx: number; sy: number }[] {
    const out: { name: string; sx: number; sy: number }[] = []
    // Visibility is recomputed here from the camera rather than read off `e.onScreen`.
    // That flag is only assigned during a render pass, so a probe that asks between
    // passes — or before the first one — sees `false` for a hero that is plainly visible,
    // which looks exactly like an empty world.
    const camR = this.cam.x + this.cam.w, camB = this.cam.y + this.cam.h
    for (const a of this.ambient) {
      if (a.kind !== 'hero' || !a.e.active) continue
      const halfW = a.e.sprite.frameW * 0.5 + 4
      const top = a.e.sprite.frameH + a.e.z + 4
      const visible =
        a.e.screenX + halfW > this.cam.x && a.e.screenX - halfW < camR &&
        a.e.screenY + 6 > this.cam.y && a.e.screenY - top < camB
      if (!visible) continue
      out.push({
        name: a.name,
        sx: a.e.screenX - this.cam.x,
        sy: a.e.screenY - this.cam.y,
      })
    }
    return out
  }

  /**
   * Make sure the companion has something to fight, near the player.
   *
   * This exists because widening the search radius did NOT work, and it is worth writing
   * down why. The zone's encounter groups produce roughly **two** ambient monsters for
   * eight heroes (see `AMBIENT_GROUPS` weights), every one of them already claimed by a
   * hero standing at its group anchor. A companion walks away from those anchors — that
   * is what following means — so it was competing for a supply that was both tiny and
   * permanently spoken for. The problem was never how far it could see.
   *
   * So the companion gets its own sparring partner: one dedicated monster entity, spawned
   * on walkable ground a few tiles off the player, recycled after each fight. That makes
   * the companion visibly fight on a regular cadence right next to you, which is the
   * entire point of having one along.
   *
   * It is still ambient scenery — its own entity, its own simulated fight, its own
   * numbers. It is never one of the store's real `mobs`, so the player's combat, loot and
   * XP remain untouched.
   */
  private spawnCompanionFoe(companion: Ambient): number {
    if (!this.rigs || !this.player) return -1

    // One reusable slot rather than an ever-growing array.
    if (this.companionFoeIdx < 0 || !this.ambient[this.companionFoeIdx]) {
      const rng = companion.rng
      const monsterId = MONSTER_SPRITES[Math.floor(rng() * MONSTER_SPRITES.length)]
      const sprite = this.spriteCache[monsterId] ?? this.rigs.mobBeast
      const e = this.scene.spawn(sprite, 'team/enemy', this.player.tx, this.player.ty)
      e.shadow = true
      e.animator.set('idle')
      this.ambient.push({
        e, kind: 'mob', gx: 0, gy: 0, tgx: 0, tgy: 0, t: 0,
        fightT: 0, atkCd: 0, name: '', level: 0, faction: 'neutral',
        grp: companion.grp,
        rng: subStream(this.zoneSeed(), 'companion-foe'), state: 'idle',
        identity: null, bark: null, barkT: 0, barkCd: 0,
        fightLog: null, playT: 0, playIdx: 0, foe: -1, wonLast: false,
        respawnT: 0, rejoinAfter: false,
      })
      this.companionFoeIdx = this.ambient.length - 1
    }

    const foe = this.ambient[this.companionFoeIdx]
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    // Place it to one side of the player, far enough that the companion visibly walks
    // over rather than teleport-fighting on the spot.
    const ang = foe.rng() * Math.PI * 2
    // Close enough that the companion is visibly FIGHTING rather than visibly commuting.
    // Measured at 4–7 tiles the cycle was ~70% approach; the walk is not the interesting
    // part. Still far enough that they walk over rather than teleport-fight on the spot.
    const dist = 2.5 + foe.rng() * 2
    let gx = WorldSceneController.wrapMod(pgx + Math.cos(ang) * dist)
    let gy = WorldSceneController.wrapMod(pgy + Math.sin(ang) * dist)
    if (this.walkMask && !this.walkableAt(gx + PAD, gy + PAD)) {
      const w = nearestWalkable(this.walkMask, gx, gy)
      gx = WorldSceneController.wrapMod(w.x)
      gy = WorldSceneController.wrapMod(w.y)
    }
    foe.gx = gx; foe.gy = gy; foe.tgx = gx; foe.tgy = gy
    foe.state = 'idle'
    foe.foe = -1
    foe.fightLog = null
    foe.respawnT = 0
    foe.e.active = true
    foe.e.alpha = 1
    foe.e.animator.set('idle')
    return this.companionFoeIdx
  }

  /** Nearest living ambient monster within engage radius, or -1. */
  private nearestAmbientMob(from: number, range = AMBIENT_SEEK_RANGE): number {
    const me = this.ambient[from]
    let best = -1, bestD = range
    for (let j = 0; j < this.ambient.length; j++) {
      const o = this.ambient[j]
      if (o.kind !== 'mob' || !o.e.active) continue
      // Do not gang up: a monster already being fought is someone else's business.
      if (this.ambient.some(x => x.foe === j && (x.state === 'fight' || x.state === 'approach'))) continue
      const d = Math.hypot(
        WorldSceneController.wrapDiff(o.gx, me.gx), WorldSceneController.wrapDiff(o.gy, me.gy),
      )
      if (d < bestD) { bestD = d; best = j }
    }
    return best
  }

  /** Nearest other ambient hero within chat radius, or -1. */
  private nearestAmbientHero(from: number): number {
    const me = this.ambient[from]
    let best = -1, bestD = AMBIENT_CHAT_RANGE
    for (let j = 0; j < this.ambient.length; j++) {
      if (j === from) continue
      const o = this.ambient[j]
      if (o.kind !== 'hero' || !o.e.active) continue
      const d = Math.hypot(
        WorldSceneController.wrapDiff(o.gx, me.gx), WorldSceneController.wrapDiff(o.gy, me.gy),
      )
      if (d < bestD) { bestD = d; best = j }
    }
    return best
  }

  /**
   * Resolve a whole fight up front, then hand the log to the playback state.
   *
   * The synthetic `MobInstance` is built here rather than taken from the store's `mobs`
   * on purpose: an ambient hero fighting a REAL spawned mob would be reaching into the
   * player's world, which is exactly the boundary Track L0 must not cross.
   */
  private beginAmbientFight(a: Ambient, foe: Ambient): void {
    const id = a.identity!
    const hero: HeroCombatant = {
      name: id.name,
      playerClass: id.playerClass,
      level: id.level,
      equipment: EMPTY_EQUIPMENT,
      talentAllocs: id.talentAllocs,
      racialPassive: {},
    }
    const lvl = Math.max(1, id.level)
    const maxHp = Math.round(50 + lvl * 16)
    const mob: MobInstance = {
      id: `ambient_mob_${a.grp}`,
      templateId: 'ambient' as MobInstance['templateId'],
      name: 'Beast',
      currentHp: maxHp, maxHp,
      damage: Math.round(3 + lvl * 1.1),
      xpReward: 0, goldMin: 0, goldMax: 0, lootTableIds: [],
      spriteKey: 'beast', attackSpeedSeconds: 2,
      isElite: false, isBoss: false,
      offset: { dx: 0, dy: 0 }, dots: [],
      // Ambient scenery: positioned by the adapter, never in the store's `mobs`, and so
      // deliberately outside the zone's patrol/aggro simulation.
      ...combatantOnlyWorldFields(),
    }
    // A distinct seed per fight, drawn from this hero's stream so the whole sequence
    // stays reproducible from the zone seed.
    const seed = (Math.floor(a.rng() * 0xFFFFFFFF) ^ (++this.ambientFightSeq)) >>> 0
    try {
      const result = runFight(seed, hero, mob, { stepSeconds: 0.5, maxSeconds: 30, maxEvents: 64 })
      a.fightLog = result.events
      a.playT = 0
      a.playIdx = 0
      a.wonLast = result.winner === 0
      a.state = 'fight'
      foe.state = 'fight'
      foe.foe = this.ambient.indexOf(a)
      a.e.animator.face(faceFromVec(foe.gx - a.gx, foe.gy - a.gy))
      foe.e.animator.face(faceFromVec(a.gx - foe.gx, a.gy - foe.gy))
    } catch (err) {
      // A failed ambient sim must never take the scene down with it.
      console.error('[ambient] fight sim failed:', err)
      a.state = 'wander'
      a.foe = -1
    }
  }

  /** Turn one simulated fight event into animation + a damage floater. */
  private playAmbientFightEvent(a: Ambient, foe: Ambient, ev: FightEvent): void {
    const attacker = ev.side === 0 ? a : foe
    const target = ev.side === 0 ? foe : a
    switch (ev.kind) {
      case 'swing':
      case 'extra':
      case 'flurry':
        attacker.e.animator.set('attack')
        attacker.e.animator.restart()
        if (attacker === this.ambient[this.followerIdx]) this.companionAttackCount++
        if (ev.damage > 0) {
          this.spawnFloater(target.e, String(ev.damage), ev.crit, ev.crit ? '#ffcc00' : '#ffffff', false)
        }
        break
      case 'dot':
        this.spawnFloater(target.e, String(ev.damage), false, '#cc44ff', false)
        break
      case 'thorns':
        this.spawnFloater(target.e, String(ev.damage), false, '#88ddff', false)
        break
      case 'block':
        this.spawnFloater(target.e, 'block', false, '#aaccff', false)
        break
      case 'death':
        // `side` on a death event is the side that DIED.
        if (ev.side === 1) { foe.e.animator.set('idle'); a.wonLast = true }
        else { a.wonLast = false }
        break
    }
    // Low-health bark as the hero's health fraction crosses the line. `side === 1` means
    // the monster acted, so the hero is the one taking the hit.
    if (ev.side === 1 && ev.kind !== 'death' && a.identity && ev.targetMaxHp > 0) {
      if (ev.targetHp > 0 && ev.targetHp / ev.targetMaxHp < 0.25) {
        let speaking = 0
        for (const o of this.ambient) if (o.barkT > 0) speaking++
        this.tryBark(a, 'lowHp', speaking)
      }
    }
  }

  /**
   * Speak, maybe. Returns 1 if a bubble actually appeared so callers can keep the
   * concurrent count honest.
   *
   * Gated three ways — per-event probability, a per-hero cooldown, and a global ceiling
   * on simultaneous bubbles. Ungated, eight heroes killing things turns the zone into
   * chat spam, which reads as noise rather than as a populated server.
   */
  private tryBark(a: Ambient, event: BarkEvent, speaking: number, detail?: string): number {
    if (a.barkT > 0 || a.barkCd > 0) return 0
    if (speaking >= BARK_MAX_CONCURRENT) return 0
    if (a.rng() >= BARK_CHANCE[event]) return 0

    // Three tiers, best-available-immediately: a pre-generated pooled line if one is
    // waiting, otherwise a canned one. Either way the hero speaks THIS frame.
    const line = takeChatLine(event, a.rng) ?? pickBark(a.rng, event)
    a.bark = line
    a.barkT = BARK_SECONDS
    a.barkCd = BARK_COOLDOWN_SECONDS + a.rng() * 4

    // Everything a hero says out loud also lands in zone chat, so the panel reads as the
    // same conversation you can see happening in the world.
    const faction = a.faction === 'horde' ? 'horde' : 'alliance'
    const msg = pushChat({ channel: 'zone', from: a.name, faction, text: line })

    // Tier three: ask for a line that knows what actually just happened. ~4s, so it
    // arrives while the moment is still legible. If it lands and the hero is still
    // showing the placeholder, upgrade both the bubble and the chat line in place.
    const ctx = this.chatContext()
    if (ctx && a.identity) {
      requestLiveBark(
        event,
        {
          name: a.name, playerClass: a.identity.playerClass, race: a.identity.race,
          faction: this.factionLabel(a.faction), level: a.level, spec: a.identity.specTitle,
          talentAllocs: a.identity.talentAllocs,
        },
        ctx,
        generated => {
          if (a.bark === line && a.barkT > 0) a.bark = generated
          resolveChat(msg.id, generated)
        },
        detail,
      )
    }
    return 1
  }

  /** Display name for a faction, so generated lines use the game's own words. */
  private factionLabel(f: FactionType): string {
    return this.factionNames[f] ?? (f === 'horde' ? 'The Ashmarch' : 'The Lastlight Concord')
  }

  /** Context every generated line needs. Null until sync() has supplied zone names. */
  private chatContext(): ChatContext | null {
    if (!this.currentZone) return null
    const cfg = ZONES[this.currentZone]
    return {
      zoneName: this.zoneDisplayName || cfg?.name || this.currentZone,
      zoneTheme: cfg
        ? `${cfg.description} (levels ${cfg.levelRange[0]}–${cfg.levelRange[1]})`
        : 'open wilderness',
      factions: {
        alliance: this.factionLabel('alliance'),
        horde: this.factionLabel('horde'),
      },
    }
  }

  // Nameplates over ambient heroes — match the HUD's own-hero text: small, crisp,
  // heavy black outline (mirrors the HUD TEXT_SHADOW) so they read at any biome without
  // a muddy box. Faction-tinted; name only (no level) to keep the viewport clean.
  private drawAmbientNameplates(): void {
    if (!this.ambient.length) return
    const ctx = this.ctx
    ctx.save()
    ctx.font = '600 8px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.95)'
    for (const a of this.ambient) {
      if (a.kind !== 'hero') continue
      const sx = Math.round(a.e.screenX - this.cam.x)
      const sy = Math.round(a.e.screenY - this.cam.y - a.e.sprite.frameH - 2)
      if (sx < -40 || sx > this.cam.w + 40 || sy < 6 || sy > this.cam.h) continue
      ctx.strokeText(a.name, sx, sy)
      ctx.fillStyle = a.faction === 'horde' ? '#ff8a7a' : '#8ac0ff'
      ctx.fillText(a.name, sx, sy)
    }
    ctx.restore()
    this.drawAmbientBarks()
  }

  /**
   * Speech bubbles over ambient heroes.
   *
   * Drawn on the canvas rather than as DOM, and deliberately NOT routed through
   * `ThoughtBubble`. That component takes no props: it reads a single
   * `currentThought` / `thoughtExpiresAt` pair off the store and renders inside the
   * player's HUD avatar wrapper in `CombatView`. That is right for one hero and wrong
   * for a crowd — it is a single global slot, it lives in the HUD rather than in the
   * world, and driving 8–20 of them would mean as many absolutely-positioned DOM nodes
   * repositioned every frame, against the entity/perf budget the plan flags as this
   * track's top risk.
   *
   * So the player's bubble stays exactly as it is — their private inner voice, one at a
   * time — and the crowd gets its own world-space channel. Keeping them separate also
   * means ambient chatter can never overwrite what the player is thinking, which is the
   * "must not touch player state" rule showing up in the UI layer.
   */
  private drawAmbientBarks(): void {
    if (!this.ambient.length) return
    const ctx = this.ctx
    ctx.save()
    ctx.font = '500 8px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const a of this.ambient) {
      if (!a.bark || a.barkT <= 0 || a.kind !== 'hero') continue
      const sx = Math.round(a.e.screenX - this.cam.x)
      // Sit above the nameplate, which itself sits above the sprite.
      const sy = Math.round(a.e.screenY - this.cam.y - a.e.sprite.frameH - 14)
      if (sx < -60 || sx > this.cam.w + 60 || sy < 10 || sy > this.cam.h) continue

      // Fade in fast, hold, fade out over the last half second.
      const alpha = Math.min(1, a.barkT / 0.5, (BARK_SECONDS - a.barkT) / 0.15 + 0.2)
      ctx.globalAlpha = Math.max(0, alpha)

      const w = Math.ceil(ctx.measureText(a.bark).width) + 10
      const h = 13
      const x = sx - w / 2, y = sy - h / 2

      // Bubble body — matches ThoughtBubble's palette so the world and the HUD read as
      // one game, even though they are two independent systems.
      ctx.fillStyle = 'rgba(18,14,6,0.90)'
      ctx.strokeStyle = '#5a4020'
      ctx.lineWidth = 1
      const r = 4
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Tail pointing down at the speaker.
      ctx.beginPath()
      ctx.moveTo(sx - 3, y + h)
      ctx.lineTo(sx, y + h + 4)
      ctx.lineTo(sx + 3, y + h)
      ctx.closePath()
      ctx.fillStyle = 'rgba(18,14,6,0.90)'
      ctx.fill()

      ctx.fillStyle = '#d4b896'
      ctx.fillText(a.bark, sx, y + h / 2)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // D2-style click/tap feedback: a one-shot expanding flash at the moment of the tap,
  // plus a pulsing destination ring while the player is still walking there. On the
  // dimetric plane rings are flattened ellipses (ry = rx/2) so they lie on the ground.
  private drawMoveMarker(g: GroundBuffer): void {
    if (!this.tapMoveActive && this.tapFlashT <= 0) return
    const ctx = this.ctx
    const sx = feetX(g, this.tapTx, this.tapTy) - this.cam.x
    const sy = feetY(g, this.tapTx, this.tapTy) - this.cam.y
    if (sx < -30 || sx > this.cam.w + 30 || sy < -30 || sy > this.cam.h + 30) return
    ctx.save()
    if (this.tapMoveActive) {
      const pulse = 0.5 + 0.5 * Math.sin(this.tapPulse * 6)
      const rx = 7 + pulse * 2
      ctx.strokeStyle = 'rgba(244,200,74,0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx * 0.5, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(255,230,140,0.85)'
      ctx.beginPath(); ctx.ellipse(sx, sy, 1.6, 0.9, 0, 0, Math.PI * 2); ctx.fill()
    }
    if (this.tapFlashT > 0) {
      const p = 1 - this.tapFlashT / 0.42
      const rx = 6 + p * 16
      ctx.globalAlpha = 1 - p
      ctx.strokeStyle = '#ffe58a'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx * 0.5, 0, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }

  // Target reticle tint by tier — matches hud/UnitFrames' target-frame colors.
  private static readonly RETICLE_TINT = {
    normal: [224, 176, 160] as const,
    elite:  [199, 138, 240] as const,
    boss:   [255, 154,  60] as const,
  }

  /**
   * The ring under the enemy you're fighting. Passed to `scene.render` as a ground
   * decal so it paints on the terrain and under every body — the mob stands *in* it.
   * Arrow property: bound once, so handing it to render() allocates nothing per frame.
   *
   * Reads engaged vs. closing: a tight solid double ring once the fight is joined, a
   * wider faint single ring while the mob is still walking in. Elevation comes free —
   * feetY is height-aware, so the ring sits on the hillside the mob is standing on.
   */
  private drawTargetReticle = (ctx: CanvasRenderingContext2D): void => {
    const g = this.ground
    const target = this.mob
    if (!g || !target || !target.active || this.townMode || this.playerDead) return

    const cx = feetX(g, target.tx, target.ty) - this.cam.x
    const cy = feetY(g, target.tx, target.ty) - this.cam.y
    // Cull if off-screen (the ring is small; a generous margin is fine).
    if (cx < -32 || cx > this.cam.w + 32 || cy < -32 || cy > this.cam.h + 32) return

    const [r, gr, b] = WorldSceneController.RETICLE_TINT[this.mobTier]
    // 2:1 dimetric footprint, so the ellipse is half as tall as it is wide.
    // A committed target reads at full strength even before contact, so the player can
    // see their order was taken while the hero is still walking in.
    const committed = this.targetLocked || this.mobEngaged
    const pulse = 0.5 + 0.5 * Math.sin(this.tapPulse * (committed ? 5.2 : 2.4))
    const rx = committed ? 10 + pulse * 1.6 : 13 + pulse * 2.4
    const alpha = committed ? 0.75 + pulse * 0.25 : 0.3 + pulse * 0.16

    ctx.save()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `rgba(${r},${gr},${b},${alpha.toFixed(3)})`
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * 0.5, 0, 0, Math.PI * 2); ctx.stroke()
    if (committed) {
      // Inner ring + four cardinal ticks — the "locked on" read.
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(${r},${gr},${b},${(alpha * 0.55).toFixed(3)})`
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.62, rx * 0.31, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.5).toFixed(3)})`
      const tick = 3
      ctx.beginPath()
      ctx.moveTo(cx - rx, cy); ctx.lineTo(cx - rx + tick, cy)
      ctx.moveTo(cx + rx, cy); ctx.lineTo(cx + rx - tick, cy)
      ctx.moveTo(cx, cy - rx * 0.5); ctx.lineTo(cx, cy - rx * 0.5 + tick * 0.5)
      ctx.moveTo(cx, cy + rx * 0.5); ctx.lineTo(cx, cy + rx * 0.5 - tick * 0.5)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Fallback glyph overlay for node types without a tall-prop sprite (Phase E: the
   *  mapped types are now depth-sorted entities, so this draws nothing for them). */
  private drawNodes(g: GroundBuffer): void {
    if (!this.lastNodes.length) return
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    const ctx = this.ctx
    for (const node of this.lastNodes) {
      if (this.nodeTallProp(node.type)) continue // rendered as a prop entity
      const lx = WorldSceneController.wrapDiff(node.x, pgx)
      const ly = WorldSceneController.wrapDiff(node.y, pgy)
      if (Math.abs(lx) > 6 || Math.abs(ly) > 6) continue
      const bx = this.player.tx + lx
      const by = this.player.ty + ly
      const sx = Math.round(feetX(g, bx, by) - this.cam.x)
      const sy = Math.round(feetY(g, bx, by) - this.cam.y - 14)
      if (sx < -20 || sx > this.cam.w + 20 || sy < -20 || sy > this.cam.h + 20) continue
      ctx.fillStyle = node.color
      ctx.globalAlpha = 0.92
      ctx.beginPath()
      ctx.moveTo(sx, sy - 4)
      ctx.lineTo(sx + 4, sy)
      ctx.lineTo(sx, sy + 4)
      ctx.lineTo(sx - 4, sy)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.font = '7px ui-monospace, monospace'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.fillText(node.icon, sx, sy - 6)
    }
    ctx.textAlign = 'start'
  }

  private updateFloaters(dt: number): void {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i]
      if (f.t <= 0) continue
      f.t -= dt
      if (f.t <= 0) {
        f.el.style.opacity = '0'
        f.el.textContent = ''
        f.anchor = null
        continue
      }
      // Follow the anchor while it's alive; otherwise hold the last world spot.
      if (f.anchor && f.anchor.active) {
        f.wx = f.anchor.screenX
        f.wy = f.anchor.screenY - f.anchor.sprite.frameH
      }
      const life = FLOATER_LIFE
      const p = 1 - f.t / life           // 0→1 over the floater's life
      const rise = p * 22                // gentle upward drift
      // Quick rise-in, hold, then ease-out fade over the last ~45%.
      let op: number
      if (f.t > life * 0.55) op = 1
      else op = (f.t / (life * 0.55)) ** 1.3
      f.el.style.opacity = String(op)
      f.el.style.transform =
        `translate(${(f.wx - this.cam.x) * this.scale}px, ${(f.wy - this.cam.y - rise) * this.scale}px)`
    }
  }
}

// ── Dev HMR ───────────────────────────────────────────────────────────────────
// The dimetric renderer is a long-lived imperative controller (created once in a
// React effect with [] deps). React Fast Refresh re-renders the host component but
// never re-runs that effect, so an edit to this module leaves the OLD controller
// running with stale code — the "have to hard-refresh every time" symptom. Force a
// clean full page reload whenever this module hot-updates. Dev-only (import.meta.hot
// is undefined in production builds).
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload())
}