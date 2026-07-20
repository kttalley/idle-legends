// Phase 1 dev harness — standalone page (harness.html), dev-only, never in the app build.
// Proves: full-map render + scroll, animated units across 4 facings (2 mirrored),
// palette-swap variants on one rig, a readable fight loop (lunge + hit-flash + damage
// floaters), water tile animation via buffer swap, lazy bake LRU, zero-allocation frame
// loop, and the WoW/Diablo HUD composition (camera-followed player, minimap, unit frames,
// action bar, inventory) as a DOM overlay.

import { bakedSheetCount } from '../palette'
import { getPalette } from '../palettes'
import { loadSpriteOrPlaceholder } from '../indexedSprite'
import { makeBeastRig, makeHumanoidRig, makeTileset, makePropSheet, TILE, TILE_ANIMS, PROP } from '../placeholderArt'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../tilemap'
import { Scene, type Camera, type Entity } from '../scene'
import type { Facing, TileMapData } from '../types'

const MAP_W = 64
const MAP_H = 64
const CSS_SCALE = 2 // canvas is 1×, CSS-upscaled 2× (image-rendering: pixelated)

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
  // Scatter flat props on land tiles (Phase D) so the harness previews clutter.
  const kinds = [PROP.TUFT, PROP.FLOWER, PROP.PEBBLE, PROP.MUSHROOM, PROP.TUFT]
  const props: { bx: number; by: number; artId: number }[] = []
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y * MAP_W + x]
      if (t === TILE.WATER || t === TILE.CLIFF) continue
      if (hash2(x + 7, y + 3) < 160) {
        props.push({ bx: x, by: y, artId: kinds[hash2(x + 51, y - 11) % kinds.length] })
      }
    }
  }
  return { w: MAP_W, h: MAP_H, tiles, props }
}

function withAltWater(map: TileMapData): TileMapData {
  const tiles = new Uint8Array(map.tiles)
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE.WATER) tiles[i] = TILE.WATER_ALT
  }
  return { w: map.w, h: map.h, tiles, props: map.props }
}

// ── Damage floater pool (DOM, fixed size, zero per-frame allocation) ─────────

const FLOATERS = 8

interface Floater {
  el: HTMLDivElement
  t: number // remaining seconds; <= 0 = free
  wx: number
  wy: number
}

function makeFloaters(): Floater[] {
  const host = document.getElementById('floaters')!
  const pool: Floater[] = []
  for (let i = 0; i < FLOATERS; i++) {
    const el = document.createElement('div')
    el.className = 'floater'
    host.appendChild(el)
    pool.push({ el, t: 0, wx: 0, wy: 0 })
  }
  return pool
}

function spawnFloater(pool: Floater[], wx: number, wy: number, text: string, crit: boolean): void {
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].t <= 0) {
      const f = pool[i]
      f.t = 1.1
      f.wx = wx
      f.wy = wy
      f.el.textContent = text
      f.el.className = crit ? 'floater crit' : 'floater'
      return
    }
  }
}

// ── Fight choreography ───────────────────────────────────────────────────────

interface Fighter {
  e: Entity
  homeX: number
  homeY: number
  basePalette: string
  // lunge: 0 = at home; runs 0→1 toward target and back
  lungeT: number
  lunging: boolean
  flashT: number
  faceTarget: Facing
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const fpsEl = document.getElementById('fps')!
  const allocEl = document.getElementById('alloc')!
  const minimap = document.getElementById('minimap') as HTMLCanvasElement
  const minictx = minimap.getContext('2d')!

  const vw = Math.floor(window.innerWidth / CSS_SCALE)
  const vh = Math.floor(window.innerHeight / CSS_SCALE)
  canvas.width = vw
  canvas.height = vh
  ctx.imageSmoothingEnabled = false

  // Assets: auto-exported FFTA roster first (gitignored local-assets/ffta-scaffold/ffta-units/),
  // with committed programmatic placeholders as the tear-out fallback.
  const base = import.meta.env.BASE_URL
  const scaffold = `${base}local-assets/ffta-scaffold/`
  const ffaUnits = `${scaffold}ffta-units/`
  const heroRig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_soldier.json`, makeHumanoidRig)
  const hero2Rig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_white_monk.json`, () => makeHumanoidRig('rig/humanoid2'))
  const enemyRig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_fencer.json`, () => makeHumanoidRig('rig/enemy'))
  const goblinRig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_goblin.json`, () => makeBeastRig('rig/goblin'))
  const redcapRig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_lamia.json`, () => makeBeastRig('rig/redcap'))
  const bombRig = await loadSpriteOrPlaceholder(`${ffaUnits}ffa_bomb.json`, () => makeBeastRig('rig/bomb'))
  const tileset = makeTileset()
  const propSheet = makePropSheet()
  document.getElementById('artpath')!.textContent =
    heroRig.id.startsWith('ffa_') ? 'art: auto-exported FFTA roster' : 'art: programmatic placeholders'

  // Ground: FFTA scaffold map if present (2× scale makes its 16×8 diamonds exactly our
  // 32×16 footprint), else the programmatic tileset. Same GroundBuffer contract either way.
  async function loadScaffoldGround(url: string): Promise<GroundBuffer | null> {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const blob = await res.blob()
      const img = await createImageBitmap(blob)
      const c = document.createElement('canvas')
      c.width = img.width * 2
      c.height = img.height * 2
      const cctx = c.getContext('2d')!
      cctx.imageSmoothingEnabled = false
      cctx.drawImage(img, 0, 0, c.width, c.height)
      // Origin tuned so the demo choreography (tiles ~20–44) lands on the map's ground.
      return { canvas: c, originX: 520, planeOffsetY: 170, width: c.width, height: c.height, heights: null, bw: 0,
               sheet: null, sheetCols: 0, sheetFrameW: 0, sheetFrameH: 0, anims: [], elapsed: 0 }
    } catch {
      return null
    }
  }

  const scaffoldGround = await loadScaffoldGround(`${scaffold}map1.png`)
  const map = buildMap()
  // groundA animates water (2↔3); groundB stays a static WATER_ALT preview (the alt
  // frame alone), so the two panes contrast live shimmer vs. the second frame.
  const groundA = scaffoldGround ?? bakeGround(map, tileset, 'biome/meadow', getPalette('biome/meadow'), TILE_ANIMS, propSheet)
  const groundB = scaffoldGround ?? bakeGround(withAltWater(map), tileset, 'biome/meadow', getPalette('biome/meadow'), undefined, propSheet)

  const scene = new Scene()
  const floaters = makeFloaters()

  // ── The PLAYER: walks a patrol square; the camera follows them. ──
  const player = scene.spawn(heroRig, 'team/player', 24, 28)
  player.animator.set('walk')
  const PATROL: { dx: number; dy: number; facing: Facing }[] = [
    { dx: 1, dy: 0, facing: 'se' },
    { dx: 0, dy: 1, facing: 'sw' },
    { dx: -1, dy: 0, facing: 'nw' },
    { dx: 0, dy: -1, facing: 'ne' },
  ]
  let patrolLeg = 0
  let patrolT = 0

  // ── The FIGHT: player-side unit vs FFTA enemy unit, lunge + flash + floaters. ──
  const duelistA: Fighter = {
    e: scene.spawn(hero2Rig, 'team/player', 30, 33),
    homeX: 30,
    homeY: 33,
    basePalette: 'team/player',
    lungeT: 0,
    lunging: false,
    flashT: 0,
    faceTarget: 'se',
  }
  const duelistB: Fighter = {
    e: scene.spawn(goblinRig, 'src/goblin', 31.8, 34.4),
    homeX: 31.8,
    homeY: 34.4,
    basePalette: 'src/goblin',
    lungeT: 0,
    lunging: false,
    flashT: 0,
    faceTarget: 'nw',
  }
  duelistA.e.animator.face('se')
  duelistB.e.animator.face('nw')
  const duel: [Fighter, Fighter] = [duelistA, duelistB]
  let duelTimer = 0.8
  let duelTurn = 0

  // ── Ambience: FFTA monsters by the lake + a wandering enemy humanoid. ──
  const b1 = scene.spawn(bombRig, 'src/bomb', 40, 26)
  b1.animator.face('sw')
  b1.animator.set('idle')
  const b2 = scene.spawn(redcapRig, 'src/redcap', 43, 29)
  b2.animator.face('se')
  b2.animator.set('walk')
  const wanderer = scene.spawn(enemyRig, 'team/enemy', 34, 24)
  wanderer.animator.set('walk')
  wanderer.animator.face('sw')
  let wanderT = 0

  // ── Palette ladder: ONE rig × 6 palette ids along the path. ──
  const PALETTE_CYCLE = ['race/human', 'race/orc', 'gear/t3', 'gear/t4+epic', 'elite', 'gear/t2+legendary']
  const ladder: Entity[] = []
  for (let i = 0; i < PALETTE_CYCLE.length; i++) {
    const e = scene.spawn(heroRig, PALETTE_CYCLE[i], 20 + i * 2, 31.2)
    e.animator.face(i % 2 === 0 ? 'se' : 'sw')
    ladder.push(e)
  }

  const cam: Camera = { x: 0, y: 0, w: vw, h: vh }
  minimap.width = 128
  minimap.height = 96

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

    // ── player patrol ──
    const leg = PATROL[patrolLeg]
    player.tx += leg.dx * dt * 2.0
    player.ty += leg.dy * dt * 2.0
    player.animator.face(leg.facing)
    patrolT += dt
    if (patrolT > 3.0) {
      patrolT = 0
      patrolLeg = (patrolLeg + 1) % 4
    }

    // ── duel: alternating lunge attacks ──
    duelTimer -= dt
    if (duelTimer <= 0) {
      duelTimer = 1.6
      const atk = duel[duelTurn % 2]
      atk.lunging = true
      atk.lungeT = 0
      atk.e.animator.set('attack')
      atk.e.animator.restart()
      duelTurn++
    }
    for (let i = 0; i < 2; i++) {
      const f = duel[i]
      const t = duel[1 - i]
      if (f.lunging) {
        f.lungeT += dt * 3.2
        // 0→1→0 triangle: out and back; contact at the apex.
        const phase = f.lungeT < 0.5 ? f.lungeT * 2 : 2 - f.lungeT * 2
        f.e.tx = f.homeX + (t.homeX - f.homeX) * 0.42 * phase
        f.e.ty = f.homeY + (t.homeY - f.homeY) * 0.42 * phase
        if (f.lungeT >= 0.5 && f.flashT <= 0 && t.flashT <= 0) {
          // Contact: defender flashes + recoils, damage floater above them.
          t.flashT = 0.13
          t.e.paletteId = 'fx/hitflash'
          t.e.animator.set('hit')
          t.e.animator.restart()
          const dmg = 40 + ((now | 0) % 60)
          const crit = (now | 0) % 5 === 0
          spawnFloater(floaters, t.e.screenX, t.e.screenY - t.e.sprite.frameH, String(crit ? dmg * 2 : dmg), crit)
        }
        if (f.lungeT >= 1) {
          f.lunging = false
          f.e.tx = f.homeX
          f.e.ty = f.homeY
        }
      }
      if (f.flashT > 0) {
        f.flashT -= dt
        if (f.flashT <= 0) f.e.paletteId = f.basePalette
      }
      if (f.e.animator.finished) f.e.animator.set('idle')
      f.e.animator.face(f.faceTarget)
    }

    // ── ambience ──
    wanderT += dt
    wanderer.tx = 34 + Math.sin(wanderT * 0.5) * 3
    wanderer.animator.face(Math.cos(wanderT * 0.5) > 0 ? 'se' : 'nw')

    // ── palette ladder rotation (lazy bake demo) ──
    paletteTimer += dt
    if (paletteTimer > 2.5) {
      paletteTimer = 0
      paletteCursor = (paletteCursor + 1) % PALETTE_CYCLE.length
      ladder[0].paletteId = PALETTE_CYCLE[paletteCursor]
    }

    // ── water animation: alternate pre-baked ground buffers ──
    waterTimer += dt
    if (waterTimer > 0.45) {
      waterTimer = 0
      waterPhase = !waterPhase
    }
    const ground: GroundBuffer = waterPhase ? groundB : groundA

    // ── camera: follow the player ──
    cam.x = Math.max(0, Math.min(ground.width - vw, feetX(ground, player.tx, player.ty) - vw / 2))
    cam.y = Math.max(0, Math.min(ground.height - vh, feetY(ground, player.tx, player.ty) - vh / 2))

    scene.update(dt)
    scene.render(ctx, cam, ground, dt)

    // ── player marker: gold chevron above the followed unit ──
    const px = Math.round(player.screenX - cam.x)
    const py = Math.round(player.screenY - cam.y - player.sprite.frameH - 6)
    ctx.fillStyle = '#f4c84a'
    ctx.beginPath()
    ctx.moveTo(px - 4, py)
    ctx.lineTo(px + 4, py)
    ctx.lineTo(px, py + 5)
    ctx.closePath()
    ctx.fill()

    // ── floaters (DOM pool; transform set per active floater) ──
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i]
      if (f.t <= 0) continue
      f.t -= dt
      if (f.t <= 0) {
        f.el.style.opacity = '0'
        continue
      }
      const rise = (1.1 - f.t) * 26
      f.el.style.opacity = f.t < 0.3 ? String(f.t / 0.3) : '1'
      f.el.style.transform = `translate(${(f.wx - cam.x) * CSS_SCALE}px, ${(f.wy - cam.y - rise) * CSS_SCALE}px)`
    }

    // ── meters + minimap (throttled) ──
    fpsAcc += dt
    fpsFrames++
    hudTimer += dt
    if (hudTimer > 0.5) {
      fpsEl.textContent = `${(fpsFrames / fpsAcc).toFixed(0)} fps`
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      const heapDelta = mem ? ((mem.usedJSHeapSize - heap0) / 1048576).toFixed(1) + ' MB Δheap' : 'heap n/a'
      allocEl.textContent = `${bakedSheetCount()} baked sheets · ${heapDelta}`
      hudTimer = 0
      fpsAcc = 0
      fpsFrames = 0

      minictx.imageSmoothingEnabled = false
      minictx.drawImage(ground.canvas, 0, 0, ground.width, ground.height, 0, 0, 128, 96)
      minictx.fillStyle = '#ffd75e'
      minictx.fillRect((player.screenX / ground.width) * 128 - 1, (player.screenY / ground.height) * 96 - 1, 3, 3)
      minictx.fillStyle = '#f66'
      minictx.fillRect((duelistB.e.screenX / ground.width) * 128 - 1, (duelistB.e.screenY / ground.height) * 96 - 1, 3, 3)
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

main()
