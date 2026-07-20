// The imperative bridge from game state → dimetric scene. Owns the canvas rAF
// work so the React host stays cheap: the host feeds store snapshots via sync()
// and forwards floatingNumber events to the attack triggers; everything else
// (entity placement, animation, camera, floaters) is handled here, read-only
// over the store — zero combat-logic diffs.
//
// World model: the 64×64 game zone is a torus. We bake it once as a PADDED_W×
// PADDED_W wrapped map (mapAdapter) and place the player + mob in player-local
// buffer space, so a player-centered camera always sees real wrapped ground
// with no seams and no per-frame wrap math on the render core.

import { Scene, type Camera, type Entity } from '../scene'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../tilemap'
import { loadSpriteOrPlaceholder } from '../indexedSprite'
import { makeHumanoidRig, makeBeastRig, makeTileset } from '../placeholderArt'
import { getPalette, hasPalette, registerPaletteRaw, RARITY_ACCENTS } from '../palettes'
import { composePalette } from '../palette'
import { zoneMapToTileMap, biomePaletteId, MAP_SIZE, PAD } from './mapAdapter'
import type { Facing, IndexedSprite } from '../types'
import type {
  GameState, MobInstance, RaceType, Rarity, FloatingNumber, MapNode,
} from '../../data/types'

export const CSS_SCALE = 2

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

// ── Floaters (DOM pool, fixed size, zero per-frame allocation) ────────────────

const FLOATER_POOL = 12
interface Floater { el: HTMLDivElement; t: number; wx: number; wy: number }

// ── Lunge choreography (ported from the dev harness duel) ─────────────────────
interface Lunge {
  active: boolean
  t: number           // 0→1→0 triangle progress driver
  homeX: number       // buffer-tile home position
  homeY: number
  targetX: number     // buffer-tile target (defender) position
  targetY: number
}

// ── Controller ───────────────────────────────────────────────────────────────

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

  private ground: GroundBuffer | null = null
  private zone: string | null = null
  private tileset: IndexedSprite

  // Continuous (unwrapped) player position in game-tile space, advanced by the
  // wrap-aware per-tick delta so camera motion is smooth across the 64-tile seam.
  private displayX = 32
  private displayY = 32
  private prevPx = 32
  private prevPy = 32
  private velX = 0
  private velY = 0

  // Mob offset from the player (store snapshot); applied in renderFrame against
  // the lerped player position so the mob stays glued to the player between ticks.
  private mobOffsetDx = 0
  private mobOffsetDy = 0

  private cam: Camera = { x: 0, y: 0, w: 0, h: 0 }

  private playerLunge: Lunge = { active: false, t: 0, homeX: 0, homeY: 0, targetX: 0, targetY: 0 }
  private mobLunge: Lunge = { active: false, t: 0, homeX: 0, homeY: 0, targetX: 0, targetY: 0 }
  private playerFlashT = 0
  private mobFlashT = 0
  private playerBasePalette = 'team/player'
  private mobBasePalette = 'team/enemy'

  private lastNodes: MapNode[] = []
  private lastZoneId: string | null = null

  constructor(canvas: HTMLCanvasElement, floatersHost: HTMLElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.floatersHost = floatersHost
    this.tileset = makeTileset()
  }

  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL
    const scaffold = `${base}local-assets/ffta-scaffold/`
    const player = await loadSpriteOrPlaceholder(`${scaffold}hero.json`, () => makeHumanoidRig('rig/humanoid'))
    const mobHumanoid = await loadSpriteOrPlaceholder(`${scaffold}enemy1.json`, () => makeHumanoidRig('rig/mob-humanoid'))
    const mobBeast = await loadSpriteOrPlaceholder(`${scaffold}goblin.json`, () => makeBeastRig('rig/mob-beast'))
    this.rigs = { player, mobHumanoid, mobBeast }

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
      pool.push({ el, t: 0, wx: 0, wy: 0 })
    }
    return pool
  }

  private spawnFloater(wx: number, wy: number, text: string, crit: boolean, color: string): void {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i]
      if (f.t <= 0) {
        f.t = 1.1
        f.wx = wx
        f.wy = wy
        f.el.textContent = text
        f.el.style.color = color
        f.el.className = crit ? 'il-floater il-crit' : 'il-floater'
        return
      }
    }
  }

  // ── Wrap helpers ───────────────────────────────────────────────────────────

  private static wrapDiff(next: number, prev: number): number {
    // Full wrap to [-MAP_SIZE/2, MAP_SIZE/2). displayX is continuous (unbounded),
    // so a single ±MAP_SIZE step is not enough after long play.
    let d = next - prev
    d = ((d % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
    if (d > MAP_SIZE / 2) d -= MAP_SIZE
    return d
  }

  private static wrapMod(v: number): number {
    return ((v % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
  }

  // ── Read-only state sync (called by the host on store change) ──────────────

  sync(state: GameState): void {
    if (!this.rigs) return

    // Zone change → rebake ground, reset display to the zone's player pos.
    if (state.currentZone !== this.zone) {
      const zm = state.zoneMaps[state.currentZone]
      if (zm) {
        this.ground = bakeGround(
          zoneMapToTileMap(zm), this.tileset,
          biomePaletteId(state.currentZone), getPalette(biomePaletteId(state.currentZone)),
        )
        this.zone = state.currentZone
        this.lastZoneId = state.currentZone
        this.lastNodes = zm.nodes
        this.displayX = state.playerMapPos.x
        this.displayY = state.playerMapPos.y
        this.prevPx = state.playerMapPos.x
        this.prevPy = state.playerMapPos.y
        // Snap the player into the new zone's buffer (no lerp across a zone swap).
        this.player.tx = PAD + WorldSceneController.wrapMod(this.displayX)
        this.player.ty = PAD + WorldSceneController.wrapMod(this.displayY)
      }
    }

    if (!this.ground) return

    // Advance continuous display position by the wrap-aware per-tick delta.
    const dx = WorldSceneController.wrapDiff(state.playerMapPos.x, this.prevPx)
    const dy = WorldSceneController.wrapDiff(state.playerMapPos.y, this.prevPy)
    this.displayX += dx
    this.displayY += dy
    this.prevPx = state.playerMapPos.x
    this.prevPy = state.playerMapPos.y
    // Velocity (for walk facing) — smoothed lightly.
    this.velX = this.velX * 0.6 + dx * 0.4
    this.velY = this.velY * 0.6 + dy * 0.4

    const pbx = PAD + WorldSceneController.wrapMod(this.displayX)
    const pby = PAD + WorldSceneController.wrapMod(this.displayY)
    // (Player position is lerped toward (pbx,pby) in renderFrame; the snap-on-wrap
    //  there is invisible because the padded buffer shows identical content around
    //  both sides of the seam.)

    // Player palette: race + best-equipment rarity accent.
    this.playerBasePalette = playerPaletteId(state.playerRace, bestEquipmentRarity(state))
    if (this.playerFlashT <= 0) this.player.paletteId = this.playerBasePalette

    // Player animation: walk while alive & drifting; idle when dead or still.
    const drifting = Math.abs(this.velX) + Math.abs(this.velY) > 0.0001
    if (!state.isAlive) {
      this.player.animator.set('idle')
    } else if (this.player.animator.anim !== 'attack' && this.player.animator.anim !== 'hit') {
      this.player.animator.set(drifting ? 'walk' : 'idle')
    }

    // Mob entity: present only in combat with a currentMob.
    const showMob = !!state.currentMob && state.gameMode === 'combat'
    if (showMob && state.currentMob) {
      const mob = state.currentMob
      const wantBeast = isBeastMob(mob)
      if (!this.mob) {
        this.mob = this.scene.spawn(
          wantBeast ? this.rigs.mobBeast : this.rigs.mobHumanoid,
          mobPaletteId(mob), pbx + state.mobMapOffset.dx, pby + state.mobMapOffset.dy,
        )
        this.mobRigIsBeast = wantBeast
      } else {
        // Swap rig if the kind changed (rare; keeps the pool entity but re-spawns).
        if (wantBeast !== this.mobRigIsBeast) {
          this.mob.active = false
          this.mob = this.scene.spawn(
            wantBeast ? this.rigs.mobBeast : this.rigs.mobHumanoid,
            mobPaletteId(mob), pbx + state.mobMapOffset.dx, pby + state.mobMapOffset.dy,
          )
          this.mobRigIsBeast = wantBeast
        }
      }
      if (this.mob) {
        this.mobBasePalette = mobPaletteId(mob)
        if (this.mobFlashT <= 0) this.mob.paletteId = this.mobBasePalette
        const mbx = pbx + state.mobMapOffset.dx
        const mby = pby + state.mobMapOffset.dy
        if (!this.mobLunge.active) {
          this.mob.tx = mbx
          this.mob.ty = mby
        }
        const mobDist = Math.hypot(state.mobMapOffset.dx, state.mobMapOffset.dy)
        const approaching = mobDist > 1.5
        // Face each other while engaged; mob walks while approaching.
        if (!approaching) {
          this.faceToward(this.player, this.mob.tx, this.mob.ty)
          this.faceToward(this.mob, this.player.tx, this.player.ty)
          if (this.mob.animator.anim !== 'attack' && this.mob.animator.anim !== 'hit') {
            this.mob.animator.set('idle')
          }
        } else {
          this.faceToward(this.mob, this.player.tx, this.player.ty)
          if (this.mob.animator.anim !== 'attack' && this.mob.animator.anim !== 'hit') {
            this.mob.animator.set('walk')
          }
        }
      }
    } else if (this.mob) {
      this.mob.active = false
      this.mob = null
      this.mobLunge.active = false
      this.mobFlashT = 0
    }

    // Walk facing when drifting & not in an attack/hit anim.
    if (
      state.isAlive && drifting &&
      this.player.animator.anim !== 'attack' && this.player.animator.anim !== 'hit'
    ) {
      this.faceToward(this.player, this.player.tx + this.velX, this.player.ty + this.velY)
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
  }

  // ── Combat-event triggers (called from the host's floatingNumbers effect) ───

  triggerPlayerAttack(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    // Attacker lunge toward the mob (swing-through).
    this.playerLunge.active = true
    this.playerLunge.t = 0
    this.playerLunge.homeX = this.player.tx
    this.playerLunge.homeY = this.player.ty
    this.playerLunge.targetX = this.mob.tx
    this.playerLunge.targetY = this.mob.ty
    this.player.animator.set('attack')
    this.player.animator.restart()
    this.faceToward(this.player, this.mob.tx, this.mob.ty)
    // Impact: defender flashes + recoils + floater.
    this.mobFlashT = 0.13
    this.mob.paletteId = 'fx/hitflash'
    this.mob.animator.set('hit')
    this.mob.animator.restart()
    this.spawnFloater(
      this.mob.screenX, this.mob.screenY - this.mob.sprite.frameH,
      `${fn.value}${fn.isCrit ? '!' : ''}`, fn.isCrit, fn.color ?? (fn.isCrit ? '#ffcc00' : '#88bbff'),
    )
  }

  triggerMobAttack(fn: FloatingNumber): void {
    if (!this.mob || !this.ground) return
    this.mobLunge.active = true
    this.mobLunge.t = 0
    this.mobLunge.homeX = this.mob.tx
    this.mobLunge.homeY = this.mob.ty
    this.mobLunge.targetX = this.player.tx
    this.mobLunge.targetY = this.player.ty
    this.mob.animator.set('attack')
    this.mob.animator.restart()
    this.faceToward(this.mob, this.player.tx, this.player.ty)
    this.playerFlashT = 0.13
    this.player.paletteId = 'fx/hitflash'
    this.player.animator.set('hit')
    this.player.animator.restart()
    this.spawnFloater(
      this.player.screenX, this.player.screenY - this.player.sprite.frameH,
      `-${fn.value}`, false, '#ff6666',
    )
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

    // Animator returns to idle when a non-loop anim finishes.
    if (this.player.animator.finished && this.playerLunge.t >= 1) this.player.animator.set('idle')
    if (this.mob && this.mob.animator.finished && this.mobLunge.t >= 1) this.mob.animator.set('idle')

    this.scene.update(dt)

    // Camera centered on the player's feet (no clamp — padded ground fills edges).
    this.cam.x = feetX(g, this.player.tx, this.player.ty) - this.cam.w / 2
    this.cam.y = feetY(g, this.player.tx, this.player.ty) - this.cam.h / 2

    this.scene.render(this.ctx, this.cam, g)

    // Node markers (ore/herb/boss_lair/mob_spawn) near the player.
    this.drawNodes(g)

    // Player chevron — gold marker above the followed unit.
    const px = Math.round(this.player.screenX - this.cam.x)
    const py = Math.round(this.player.screenY - this.cam.y - this.player.sprite.frameH - 6)
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

  private drawNodes(g: GroundBuffer): void {
    if (!this.lastNodes.length) return
    const pbx = PAD + WorldSceneController.wrapMod(this.displayX)
    const pby = PAD + WorldSceneController.wrapMod(this.displayY)
    const ctx = this.ctx
    for (const node of this.lastNodes) {
      const lx = WorldSceneController.wrapDiff(node.x, this.displayX)
      const ly = WorldSceneController.wrapDiff(node.y, this.displayY)
      if (Math.abs(lx) > 6 || Math.abs(ly) > 6) continue
      const bx = pbx + lx
      const by = pby + ly
      const sx = Math.round(feetX(g, bx, by) - this.cam.x)
      const sy = Math.round(feetY(g, bx, by) - this.cam.y - 14)
      if (sx < -20 || sx > this.cam.w + 20 || sy < -20 || sy > this.cam.h + 20) continue
      // Small diamond marker in the node's color.
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
      // Glyph above.
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
        continue
      }
      const rise = (1.1 - f.t) * 26
      const op = f.t < 0.3 ? f.t / 0.3 : 1
      f.el.style.opacity = String(op)
      f.el.style.transform =
        `translate(${(f.wx - this.cam.x) * CSS_SCALE}px, ${(f.wy - this.cam.y - rise) * CSS_SCALE}px)`
    }
  }
}