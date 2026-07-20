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
import { bakeGround, feetX, feetY, type GroundBuffer } from '../tilemap'
import { loadSpriteOrPlaceholder } from '../indexedSprite'
import { makeHumanoidRig, makeBeastRig, makeTileset, makePropSheet, makePropEntities, TALL_PROP, makeBoltRig, makeBurstRig, TILE_ANIMS } from '../placeholderArt'
import { getPalette, hasPalette, registerPaletteRaw, RARITY_ACCENTS } from '../palettes'
import { composePalette } from '../palette'
import { zoneMapToTileMap, biomePaletteId, MAP_SIZE, PAD } from './mapAdapter'
import type { Facing, IndexedSprite } from '../types'
import type {
  GameState, MobInstance, RaceType, Rarity, FloatingNumber, MapNode,
} from '../../data/types'

export const CSS_SCALE = 2

// FN color → spell school, for VFX classification (game-free; the store already
// tags Shadow Bolt hits with this exact color).
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
const MELEE_GAP_TILES = 2
const RANGED_GAP_TILES = 5

// ── Mappings (display-only; internal ids untouched) ──────────────────────────

const RACE_PALETTE: Record<RaceType, string> = {
  human: 'race/human', dwarf: 'race/dwarf', elf: 'race/elf', orc: 'race/orc',
  troll: 'race/troll', goblin: 'race/goblin', gnome: 'race/gnome',
  // tauren → hornborn rig palette (Track R rename is display-only; renderer just
  // needs a palette id that exists).
  tauren: 'race/hornborn',
}

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
}

const BEAST_RE = /wolf|boar|raptor|tiger|vulture|bomb|beast|whelp|dragon|worg|serpent|spider|hydra|cat|raptor|devourer|hound|wyrm|basilisk/
function isBeastMob(mob: MobInstance): boolean {
  const k = `${mob.templateId} ${mob.spriteKey}`.toLowerCase()
  return BEAST_RE.test(k)
}

// Ranged/caster mobs keep a multi-tile engagement distance and cast (spawn a bolt)
// instead of lunging. Matched on the mob name so the bestiary's archers/shamans/
// warlocks read as ranged without a data flag.
const RANGED_RE = /archer|ranger|hunter|gunner|warlock|mage|magus|caster|spellcaster|shaman|priest|seer|oracle|necromancer|sorcerer|conjurer|elementalist|pyromancer|cryomancer/
function isRangedMob(mob: MobInstance): boolean {
  return RANGED_RE.test(mob.name.toLowerCase())
}

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

/** Compose race skin + rarity accent (the itemization signal) once, cache by key. */
function playerPaletteId(race: RaceType, rarity: Rarity): string {
  const id = `player/${race}/${rarity}`
  if (hasPalette(id)) return id
  const base = getPalette(RACE_PALETTE[race] ?? 'race/human')
  const accents = RARITY_ACCENTS[rarity] ?? RARITY_ACCENTS.common
  registerPaletteRaw(id, composePalette(base, accents))
  return id
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

export class WorldSceneController {
  private scene = new Scene()
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private floatersHost: HTMLElement
  private floaters: Floater[] = []

  private player!: Entity
  private mob: Entity | null = null
  private mobRigIsBeast = false

  private rigs: {
    player: IndexedSprite
    mobHumanoid: IndexedSprite
    mobBeast: IndexedSprite
  } | null = null

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
  private propEntities: { entity: Entity; node: MapNode }[] = []

  // The player entity's buffer position is the visual source of truth. In auto mode
  // it sits at the zone-snap spot; in manual mode WASD drives it (clamped to the
  // zone interior). The mob is glued to it via mobMapOffset (synced each sync()).
  private mobOffsetDx = 0
  private mobOffsetDy = 0
  private mobEngaged = false
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

  private cam: Camera = { x: 0, y: 0, w: 0, h: 0 }

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

  // Death choreography. A slain mob is moved off `this.mob` into dyingMobs so it keeps
  // rendering its 'death' pose while fading out, then retires. playerDead forces the
  // player's downed pose while !isAlive. mobWasPresent gates kill-detection in sync.
  private dyingMobs: { e: Entity; t: number }[] = []
  private mobWasPresent = false
  private playerDead = false

  // Particle FX pool (bloom).
  private particles: Particle[] = []

  constructor(canvas: HTMLCanvasElement, floatersHost: HTMLElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.floatersHost = floatersHost
    this.tileset = makeTileset()
    this.propSheet = makePropSheet()
    this.tallProps = makePropEntities()
  }

  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL
    const scaffold = `${base}local-assets/ffta-scaffold/`
    const player = await loadSpriteOrPlaceholder(`${scaffold}hero.json`, () => makeHumanoidRig('rig/humanoid'))
    const mobHumanoid = await loadSpriteOrPlaceholder(`${scaffold}enemy1.json`, () => makeHumanoidRig('rig/mob-humanoid'))
    const mobBeast = await loadSpriteOrPlaceholder(`${scaffold}goblin.json`, () => makeBeastRig('rig/mob-beast'))
    this.rigs = { player, mobHumanoid, mobBeast }
    this.burstRig = makeBurstRig('fx/burst')
    this.boltRig = makeBoltRig('fx/bolt')

    this.player = this.scene.spawn(player, 'team/player', PAD + 32, PAD + 32)
    this.player.animator.set('idle')

    this.floaters = this.makeFloaters()
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
   *  pool is saturated, evict the entry with the least remaining time. */
  private spawnFloater(anchorEntity: Entity, text: string, crit: boolean, color: string): void {
    let slot = -1
    let least = Infinity
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i]
      if (f.t <= 0) { slot = i; break }      // free slot — take it
      if (f.t < least) { least = f.t; slot = i } // else track oldest for LRU eviction
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

  /** Impact reaction shared by melee and projectile hits: flash + recoil the target,
   *  pop a burst + particle explosion, kick the camera. Colors derive from `fxPalette`. */
  private impactHit(target: Entity, fxPalette: string, mag: number, stop = 0): void {
    if (target === this.mob) { this.mobFlashT = 0.13 } else { this.playerFlashT = 0.13 }
    target.paletteId = 'fx/hitflash'
    target.animator.set('hit')
    target.animator.restart()
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

  private static wrapDiff(a: number, b: number): number {
    let d = a - b
    d = ((d % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
    if (d > MAP_SIZE / 2) d -= MAP_SIZE
    return d
  }

  // ── Read-only state sync (called by the host on store change) ──────────────

  sync(state: GameState): void {
    if (!this.rigs) return

    // Zone change → rebake ground, snap the player into the new zone's player tile.
    if (state.currentZone !== this.zone) {
      // Retire the previous zone's tall-prop entities first (even if the new zone's
      // map isn't ready yet, so stale props never linger).
      this.retirePropEntities()
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
        this.player.tx = PAD + WorldSceneController.wrapMod(state.playerMapPos.x)
        this.player.ty = PAD + WorldSceneController.wrapMod(state.playerMapPos.y)
        // Cancel any in-flight manual movement/jump across the zone swap.
        this.manualMode = false
        this.jumpActive = false
        this.jumpT = 0
        this.input = { up: false, down: false, left: false, right: false }
        // Player snapped to the new zone's playerMapPos — clear the visual offset.
        this.autoOffsetDx = 0
        this.autoOffsetDy = 0
        // Spawn tall-prop entities at each node (Phase E) — depth-sorted with units,
        // replacing the old flat glyph overlay. Tinted with the biome palette.
        this.spawnPropEntities(zm.nodes, palId)
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

    // Player palette: race + best-equipment rarity accent.
    this.playerBasePalette = playerPaletteId(state.playerRace, bestEquipmentRarity(state))
    if (this.playerFlashT <= 0) this.player.paletteId = this.playerBasePalette

    // Mob presence + approach offset (the store shrinks mobMapOffset toward 0).
    this.showMob = !!state.currentMob && state.gameMode === 'combat'
    this.mobOffsetDx = state.mobMapOffset.dx
    this.mobOffsetDy = state.mobMapOffset.dy
    this.mobEngaged = Math.hypot(this.mobOffsetDx, this.mobOffsetDy) < ENGAGE_DIST

    if (this.showMob && state.currentMob) {
      const mob = state.currentMob
      this.mobIsRanged = isRangedMob(mob)
      // Engagement placement: follow the store offset while the mob is still closing
      // (remembering its approach direction), then hold a fixed diagonal gap so it
      // never parks on the player. The radial hold is continuous with the approach
      // (the store shrinks along the same ray), so there is no snap on arrival.
      const gapTiles = this.mobIsRanged ? RANGED_GAP_TILES : MELEE_GAP_TILES
      const gapMag = Math.SQRT2 * gapTiles
      const offDist = Math.hypot(this.mobOffsetDx, this.mobOffsetDy)
      if (offDist > gapMag) {
        this.mobApproachDx = this.mobOffsetDx / offDist
        this.mobApproachDy = this.mobOffsetDy / offDist
        this.mobPlacedDx = this.mobOffsetDx
        this.mobPlacedDy = this.mobOffsetDy
      } else {
        this.mobPlacedDx = this.mobApproachDx * gapMag
        this.mobPlacedDy = this.mobApproachDy * gapMag
      }

      const wantBeast = isBeastMob(mob)
      if (!this.mob) {
        this.mob = this.scene.spawn(
          wantBeast ? this.rigs.mobBeast : this.rigs.mobHumanoid,
          mobPaletteId(mob), this.player.tx + this.mobPlacedDx, this.player.ty + this.mobPlacedDy,
        )
        this.mobRigIsBeast = wantBeast
      } else if (wantBeast !== this.mobRigIsBeast) {
        // Swap rig if the kind changed (rare; keeps the pool entity but re-spawns).
        this.mob.active = false
        this.mob = this.scene.spawn(
          wantBeast ? this.rigs.mobBeast : this.rigs.mobHumanoid,
          mobPaletteId(mob), this.player.tx + this.mobPlacedDx, this.player.ty + this.mobPlacedDy,
        )
        this.mobRigIsBeast = wantBeast
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
    }

    this.mobWasPresent = this.showMob
    this.playerDead = !state.isAlive
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

  triggerPlayerAttack(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    this.beginLunge(this.playerLunge, this.player, this.mob)
    this.player.animator.set('attack')
    this.player.animator.restart()
    this.faceToward(this.player, this.mob.tx, this.mob.ty)
    // Impact: defender flashes + recoils + floater.
    this.mobFlashT = 0.13
    this.mob.paletteId = 'fx/hitflash'
    this.mob.animator.set('hit')
    this.mob.animator.restart()
    if (fn.isCrit) this.spawnBurst(this.mob.tx, this.mob.ty, 'spell/holy')
    // Rumble scales with the hit: crits kick hard + a brief hit-stop; normal a nudge.
    this.punch(fn.isCrit ? 3.6 : 1.3, fn.isCrit ? 0.05 : 0)
    // Melee spark spray — steel-white, gold on a crit.
    const mm = this.worldMid(this.mob)
    const mc = fn.isCrit ? fxColors('spell/holy') : { core: '#eaf0ff', glow: '#7fb0ff' }
    this.emitImpact(mm.x, mm.y, mc.core, mc.glow, fn.isCrit ? 1.7 : 0.9)
    this.spawnFloater(
      this.mob, `${fn.value}${fn.isCrit ? '!' : ''}`, fn.isCrit,
      fn.color ?? (fn.isCrit ? '#ffcc00' : '#88bbff'),
    )
  }

  triggerShadowBolt(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    // Cast: a swing pose + a charge burst at the caster's hand, then a heavy bolt that
    // flashes/recoils the mob on arrival (impactHit) — the payoff is the landing.
    this.player.animator.set('attack')
    this.player.animator.restart()
    this.faceToward(this.player, this.mob.tx, this.mob.ty)
    const r = WorldSceneController.FX_RISE
    this.spawnBurst(this.player.tx - r, this.player.ty - r, 'spell/shadow')
    const cc = fxColors('spell/shadow')
    const pm = this.worldMid(this.player)
    this.emitCharge(pm.x, pm.y, cc.core, cc.glow)
    this.spawnBolt(
      this.player.tx - r, this.player.ty - r,
      this.mob.tx - r, this.mob.ty - r,
      'spell/shadow', this.mob, 4.2,
    )
    this.spawnFloater(this.mob, `${fn.value}!`, true, fn.color ?? SHADOW_BOLT_COLOR)
  }

  triggerDotTick(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    // Ongoing affliction: a small recurrent pulse on the mob, no attacker lunge.
    this.spawnBurst(this.mob.tx, this.mob.ty, 'spell/shadow')
    const dc = fxColors('spell/shadow')
    const dm = this.worldMid(this.mob)
    this.emitImpact(dm.x, dm.y, dc.core, dc.glow, 0.5)
    this.spawnFloater(this.mob, `${fn.value}`, false, fn.color ?? '#aa88ff')
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
    const vw = Math.max(1, Math.floor(cssW / CSS_SCALE))
    const vh = Math.max(1, Math.floor(cssH / CSS_SCALE))
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw
      this.canvas.height = vh
      this.ctx.imageSmoothingEnabled = false
    }
    this.cam.w = vw
    this.cam.h = vh
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

    // ── Player movement (manual WASD, else auto-follow the store's map pos) + jump ──
    let moving = false
    let mvx = 0, mvy = 0
    if (this.manualMode) {
      let dx = 0, dy = 0
      if (this.input.up) { dx -= 1; dy -= 1 }
      if (this.input.down) { dx += 1; dy += 1 }
      if (this.input.left) { dx -= 1; dy += 1 }
      if (this.input.right) { dx += 1; dy -= 1 }
      const len = Math.hypot(dx, dy)
      if (len > 0) {
        dx /= len; dy /= len
        this.player.tx = clamp(this.player.tx + dx * MANUAL_SPEED * dt, PAD + 1, PAD + MAP_SIZE - 1)
        this.player.ty = clamp(this.player.ty + dy * MANUAL_SPEED * dt, PAD + 1, PAD + MAP_SIZE - 1)
        moving = true; mvx = dx; mvy = dy
      }
    } else if (!this.playerLunge.active && !this.mobEngaged) {
      // Auto: torus-aware lerp toward the store's playerMapPos (plus offset) so the
      // player walks and the camera-followed world scrolls past. Frozen while a mob
      // is engaged (stand and fight) or mid-attack-lunge.
      const a = this.approachAuto(dt)
      moving = a.moving; mvx = a.mvx; mvy = a.mvy
    } else {
      // Frozen (mid-lunge or in melee): pin the auto target to the entity by
      // absorbing the store's drift into the offset, so resuming auto-follow
      // continues from here instead of yanking the player forward on disengage.
      this.syncOffset()
    }
    if (this.manualMode) this.syncOffset()

    // Jump arc (independent of horizontal movement). sin(πt) lifts and lands softly.
    if (this.jumpActive) {
      this.jumpT += dt / JUMP_DURATION
      if (this.jumpT >= 1) { this.jumpT = 0; this.jumpActive = false; this.player.z = 0 }
      else this.player.z = Math.sin(this.jumpT * Math.PI) * JUMP_HEIGHT
    } else {
      this.player.z = 0
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

    // ── Mob placement (glued to the player) + animation + facing ──
    if (this.mob) {
      if (!this.mobLunge.active) {
        this.mob.tx = this.player.tx + this.mobPlacedDx
        this.mob.ty = this.player.ty + this.mobPlacedDy
      }
      const mAnim = this.mob.animator.anim
      const mobInCombat = mAnim === 'attack' || mAnim === 'hit'
      if (this.mob.animator.finished && this.mobLunge.t >= 1) this.mob.animator.set('idle')
      this.faceToward(this.mob, this.player.tx, this.player.ty)
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

    // Camera centered on the player's feet (height-aware → follows up hills).
    this.cam.x = feetX(g, this.player.tx, this.player.ty) - this.cam.w / 2
    this.cam.y = feetY(g, this.player.tx, this.player.ty) - this.cam.h / 2

    // Rumble: decaying random kick applied after centering (so it doesn't accumulate).
    if (this.shakeT > 0) {
      const k = this.shakeMag * (this.shakeT / SHAKE_DURATION)
      this.cam.x += (Math.random() * 2 - 1) * k
      this.cam.y += (Math.random() * 2 - 1) * k
    }

    // Pin tall-prop entities to the wrapped copy nearest the player before the sort
    // so they depth-correct against the player/mob as the player moves (Phase E).
    this.updatePropEntities()

    this.scene.render(this.ctx, this.cam, g, dt)

    // Particle FX over the world (bloom via additive compositing). Advanced on real
    // time so glows keep flowing through hit-stop.
    this.updateParticles(realDt)
    this.drawParticles()

    // Fallback glyphs for any node type without a tall-prop sprite (Phase E: the
    // mapped node types — ore/herb/boss_lair/mob_spawn — are now depth-sorted props).
    this.drawNodes(g)

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

    // Floaters (DOM pool).
    this.updateFloaters(dt)
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
      this.propEntities.push({ entity: e, node })
    }
  }

  private updatePropEntities(): void {
    if (!this.propEntities.length) return
    const pgx = WorldSceneController.wrapMod(this.player.tx - PAD)
    const pgy = WorldSceneController.wrapMod(this.player.ty - PAD)
    for (const pe of this.propEntities) {
      // Pin to the wrapped copy nearest the player so the prop is always on the
      // visible side of the torus (mirrors drawNodes' wrapDiff logic).
      pe.entity.tx = this.player.tx + WorldSceneController.wrapDiff(pe.node.x, pgx)
      pe.entity.ty = this.player.ty + WorldSceneController.wrapDiff(pe.node.y, pgy)
    }
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
        `translate(${(f.wx - this.cam.x) * CSS_SCALE}px, ${(f.wy - this.cam.y - rise) * CSS_SCALE}px)`
    }
  }
}