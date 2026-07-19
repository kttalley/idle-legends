// Phase 1 dev harness — standalone page (harness.html), dev-only, never in the app build.
// Proves: full-map render + scroll, 6+ animated units across 4 facings (2 mirrored),
// palette-swap variants on one rig, water tile animation via buffer swap, lazy bake LRU,
// zero-allocation frame loop, and the WoW/Diablo HUD composition as a DOM overlay.

import { bakedSheetCount } from '../palette'
import { getPalette } from '../palettes'
import { loadSpriteOrPlaceholder } from '../indexedSprite'
import { makeBeastRig, makeHumanoidRig, makeTileset, TILE } from '../placeholderArt'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../tilemap'
import { Scene, type Camera, type Entity } from '../scene'
import type { AnimName, Facing, TileMapData } from '../types'

const MAP_W = 64
const MAP_H = 64

// ── Deterministic harness map: meadow with a lake, a river, cliffs, a path ───

function hash2(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) % 1000
}

function buildMap(): TileMapData {
  const tiles = new Uint8Array(MAP_W * MAP_H)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x
      const lake = (x - 44) * (x - 44) + (y - 20) * (y - 20) < 64
      const river = Math.abs(x - 12 - Math.round(3 * Math.sin(y * 0.35))) < 2
      if (lake || river) {
        tiles[i] = TILE.WATER
      } else if (hash2(x, y) < 60) {
        tiles[i] = TILE.CLIFF
      } else if (Math.abs(y - 32) < 2 && x > 16 && x < 52) {
        tiles[i] = TILE.PATH
      } else {
        tiles[i] = hash2(x + 99, y) < 300 ? TILE.GRASS_ALT : TILE.GRASS
      }
    }
  }
  return { w: MAP_W, h: MAP_H, tiles }
}

/** Second water frame for the animated ground buffer. */
function withAltWater(map: TileMapData): TileMapData {
  const tiles = new Uint8Array(map.tiles)
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE.WATER) tiles[i] = TILE.WATER_ALT
  }
  return { w: map.w, h: map.h, tiles }
}

// ── Unit choreography (fixed-size, allocation-free per frame) ────────────────

const WALK_SQUARE: { dx: number; dy: number; facing: Facing }[] = [
  { dx: 1, dy: 0, facing: 'se' },
  { dx: 0, dy: 1, facing: 'sw' },
  { dx: -1, dy: 0, facing: 'nw' },
  { dx: 0, dy: -1, facing: 'ne' },
]

interface UnitCtl {
  entity: Entity
  mode: 'patrol' | 'combat-cycle' | 'showcase'
  // patrol state
  leg: number
  legT: number
  homeX: number
  homeY: number
  // combat-cycle state
  t: number
  phase: number
}

const PALETTE_CYCLE = ['race/human', 'race/orc', 'gear/t3', 'gear/t4+epic', 'elite', 'gear/t2+legendary']

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const fpsEl = document.getElementById('fps')!
  const allocEl = document.getElementById('alloc')!
  const minimap = document.getElementById('minimap') as HTMLCanvasElement
  const minictx = minimap.getContext('2d')!

  // Internal resolution at 1×, CSS-upscaled 2× (crisp via image-rendering: pixelated).
  const vw = Math.floor(window.innerWidth / 2)
  const vh = Math.floor(window.innerHeight / 2)
  canvas.width = vw
  canvas.height = vh
  ctx.imageSmoothingEnabled = false

  // Assets: scaffold-first (gitignored local-assets/), programmatic fallback.
  const base = import.meta.env.BASE_URL
  const humanoid = await loadSpriteOrPlaceholder(`${base}local-assets/ffta-scaffold/hero.json`, makeHumanoidRig)
  const humanoid2 = await loadSpriteOrPlaceholder(`${base}local-assets/ffta-scaffold/hero2.json`, () => makeHumanoidRig('rig/humanoid2'))
  const beast = await loadSpriteOrPlaceholder(`${base}local-assets/ffta-scaffold/beast.json`, makeBeastRig)
  const tileset = makeTileset()
  document.getElementById('artpath')!.textContent =
    humanoid.id.startsWith('rig/') ? 'art: programmatic placeholders' : 'art: ffta scaffold (local-only)'

  const map = buildMap()
  const groundA = bakeGround(map, tileset, 'biome/meadow', getPalette('biome/meadow'))
  const groundB = bakeGround(withAltWater(map), tileset, 'biome/meadow', getPalette('biome/meadow'))

  const scene = new Scene()
  const units: UnitCtl[] = []

  // 1–2: patrol walkers (all four facings + mirroring, walk anim, depth changes).
  for (const [sprite, hx, hy, pal] of [
    [humanoid, 24, 28, 'team/player'],
    [humanoid2, 38, 36, 'team/enemy'],
  ] as const) {
    const e = scene.spawn(sprite, pal, hx, hy)
    e.animator.set('walk')
    units.push({ entity: e, mode: 'patrol', leg: 0, legT: 0, homeX: hx, homeY: hy, t: 0, phase: 0 })
  }

  // 3–4: combat cycle pair (attack ↔ hit, facing each other).
  const atk = scene.spawn(humanoid, 'gear/t3', 30, 33)
  atk.animator.face('se')
  const def = scene.spawn(beast, 'elite', 31.6, 34.2)
  def.animator.face('nw')
  units.push({ entity: atk, mode: 'combat-cycle', leg: 0, legT: 0, homeX: 0, homeY: 0, t: 0, phase: 0 })
  units.push({ entity: def, mode: 'combat-cycle', leg: 0, legT: 0, homeX: 0, homeY: 0, t: 0.9, phase: 1 })

  // 5–6: idle beasts near the lake (palette variants of one rig).
  const b1 = scene.spawn(beast, 'unit/base', 40, 26)
  b1.animator.face('sw')
  const b2 = scene.spawn(beast, 'team/enemy', 43, 29)
  b2.animator.face('se')
  units.push({ entity: b1, mode: 'showcase', leg: 0, legT: 0, homeX: 0, homeY: 0, t: 0, phase: 2 })
  units.push({ entity: b2, mode: 'showcase', leg: 0, legT: 0, homeX: 0, homeY: 0, t: 1.5, phase: 3 })

  // Palette ladder: ONE rig × 6 palette ids, in a line along the path.
  for (let i = 0; i < PALETTE_CYCLE.length; i++) {
    const e = scene.spawn(humanoid, PALETTE_CYCLE[i], 20 + i * 2, 31.2)
    e.animator.face(i % 2 === 0 ? 'se' : 'sw')
  }

  // Camera: slow orbit around the action so scroll cost is always live.
  const cam: Camera = { x: 0, y: 0, w: vw, h: vh }
  const camCenterX = feetX(groundA, 30, 32)
  const camCenterY = feetY(groundA, 30, 32)

  // Minimap: static scaled ground + blips, redrawn at 4 Hz.
  minimap.width = 128
  minimap.height = 96

  const combatAnims: AnimName[] = ['attack', 'hit']
  let last = performance.now()
  let fpsAcc = 0
  let fpsFrames = 0
  let hudTimer = 0
  let waterTimer = 0
  let waterPhase = false
  let paletteTimer = 0
  let paletteCursor = 0
  const heap0 = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0

  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now

    // ── choreography ──
    for (let i = 0; i < units.length; i++) {
      const u = units[i]
      const e = u.entity
      if (u.mode === 'patrol') {
        const leg = WALK_SQUARE[u.leg]
        e.tx += leg.dx * dt * 2.2
        e.ty += leg.dy * dt * 2.2
        e.animator.face(leg.facing)
        u.legT += dt
        if (u.legT > 3.2) {
          u.legT = 0
          u.leg = (u.leg + 1) % 4
        }
      } else if (u.mode === 'combat-cycle') {
        u.t += dt
        if (u.t > 1.8) {
          u.t = 0
          e.animator.set(combatAnims[u.phase % 2])
          e.animator.restart()
          u.phase++
        }
        if (e.animator.finished) e.animator.set('idle')
      } else {
        u.t += dt
        if (u.t > 4) {
          u.t = 0
          e.animator.set(e.animator.anim === 'idle' ? 'walk' : 'idle')
        }
      }
    }

    // Palette ladder: rotate the first ladder unit's palette every 2.5 s (lazy bake demo).
    paletteTimer += dt
    if (paletteTimer > 2.5) {
      paletteTimer = 0
      paletteCursor = (paletteCursor + 1) % PALETTE_CYCLE.length
      scene.entities[6].paletteId = PALETTE_CYCLE[paletteCursor]
    }

    // Water animation: alternate pre-baked ground buffers (tile-swap technique).
    waterTimer += dt
    if (waterTimer > 0.45) {
      waterTimer = 0
      waterPhase = !waterPhase
    }
    const ground: GroundBuffer = waterPhase ? groundB : groundA

    // Camera orbit, clamped to the buffer.
    const t = now / 1000
    cam.x = Math.max(0, Math.min(ground.width - vw, camCenterX - vw / 2 + Math.sin(t * 0.22) * 180))
    cam.y = Math.max(0, Math.min(ground.height - vh, camCenterY - vh / 2 + Math.cos(t * 0.17) * 90))

    scene.update(dt)
    scene.render(ctx, cam, ground)

    // ── HUD meters (DOM, throttled) ──
    fpsAcc += dt
    fpsFrames++
    hudTimer += dt
    if (hudTimer > 0.5) {
      const fps = fpsFrames / fpsAcc
      fpsEl.textContent = `${fps.toFixed(0)} fps`
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      const heapDelta = mem ? ((mem.usedJSHeapSize - heap0) / 1048576).toFixed(1) + ' MB Δheap' : 'heap n/a'
      allocEl.textContent = `${bakedSheetCount()} baked sheets · ${heapDelta}`
      hudTimer = 0
      fpsAcc = 0
      fpsFrames = 0

      // Minimap refresh: whole map scaled + player blip.
      minictx.imageSmoothingEnabled = false
      minictx.drawImage(ground.canvas, 0, 0, ground.width, ground.height, 0, 0, 128, 96)
      minictx.fillStyle = '#fff'
      const p = units[0].entity
      minictx.fillRect((p.screenX / ground.width) * 128 - 1, (p.screenY / ground.height) * 96 - 1, 3, 3)
      minictx.fillStyle = '#f66'
      const m = units[3].entity
      minictx.fillRect((m.screenX / ground.width) * 128 - 1, (m.screenY / ground.height) * 96 - 1, 3, 3)
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

main()
