// Phase 1 dev harness — standalone page (harness.html), dev-only, never in the app build.
// Proves: full-map render + scroll, animated units across 4 facings (2 mirrored),
// palette-swap variants on one rig, a readable fight loop (lunge + hit-flash + damage
// floaters), water tile animation via buffer swap, lazy bake LRU, zero-allocation frame
// loop, and the WoW/Diablo HUD composition (camera-followed player, minimap, unit frames,
// action bar, inventory) as a DOM overlay.

import { bakedSheetCount } from '../palette'
import { getPalette } from '../palettes'
import { loadSprite, loadSpriteOrPlaceholder, decompose } from '../indexedSprite'
import { makeBeastRig, makeHumanoidRig, makeTileset, makePropSheet, TILE, TILE_ANIMS, PROP } from '../placeholderArt'
import { bakeGround, feetX, feetY, type GroundBuffer } from '../tilemap'
import { Scene, type Camera, type Entity } from '../scene'
import { ORIGINAL_SPRITE, useScaffoldArt } from '../adapter/fftaRoster'
import type { Facing, TileMapData, SpriteManifest } from '../types'

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

  // Assets. DEFAULT = the ORIGINAL Idle Legends rigs (public/sprites/units/) resolved via
  // ORIGINAL_SPRITE; `?ffta` loads the gitignored scaffold instead (dev builds only —
  // the harness is itself dev-only). Both fall back to the committed programmatic placeholder.
  const base = import.meta.env.BASE_URL
  const scaffold = `${base}local-assets/ffta-scaffold/`
  const ffaUnits = `${scaffold}ffta-units/`
  const realUnits = `${base}sprites/units/`
  const scaffoldArt = useScaffoldArt
  const loadUnit = async (id: string, make: () => import('../types').IndexedSprite) => {
    if (scaffoldArt) return loadSpriteOrPlaceholder(`${ffaUnits}${id}.json`, make)
    const real = await loadSprite(`${realUnits}${ORIGINAL_SPRITE[id] ?? id}.json`)
    return real ? { ...real, id } : make()
  }
  const heroRig = await loadUnit('ffa_soldier', makeHumanoidRig)
  const hero2Rig = await loadUnit('ffa_white_monk', () => makeHumanoidRig('rig/humanoid2'))
  const enemyRig = await loadUnit('ffa_fencer', () => makeHumanoidRig('rig/enemy'))
  const goblinRig = await loadUnit('ffa_goblin', () => makeBeastRig('rig/goblin'))
  const redcapRig = await loadUnit('ffa_lamia', () => makeBeastRig('rig/redcap'))
  const bombRig = await loadUnit('ffa_bomb', () => makeBeastRig('rig/bomb'))
  const tileset = makeTileset()
  const propSheet = makePropSheet()
  document.getElementById('artpath')!.textContent =
    scaffoldArt ? 'art: FFTA dev scaffold (?ffta)' : 'art: original Idle Legends sprites'

  // Ground: auto-exported FFTA field map if present, else the programmatic tileset.
  // The FFTA assets are 8×8 tiles with per-cell palette banks; we recolor the sheet
  // once per bank and draw the visible 64×32 window (2× scale so 16×8 FFTA diamonds
  // match our 32×16 footprint). Falls back to procedural tiles if the scaffold is absent.
  interface TileEntry { t: number; h: boolean; v: boolean; b: number }

  function hexToRgb(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  }

  async function loadFFTAGround(baseUrl: string): Promise<GroundBuffer | null> {
    try {
      const [tilesRes, arrRes, palRes] = await Promise.all([
        fetch(`${baseUrl}tiles.json`),
        fetch(`${baseUrl}arrangement.json`),
        fetch(`${baseUrl}palette_lcda.json`),
      ])
      if (!tilesRes.ok || !arrRes.ok || !palRes.ok) return null
      const manifest = (await tilesRes.json()) as SpriteManifest
      const arrangement = (await arrRes.json()) as { w: number; h: number; layer0: TileEntry[]; layer1: TileEntry[] }
      const fullPalette = (await palRes.json()) as string[]

      const imgRes = await fetch(`${baseUrl}${manifest.image}`)
      if (!imgRes.ok) return null
      const blob = await imgRes.blob()
      const bmp = await createImageBitmap(blob)
      const imgCanvas = document.createElement('canvas')
      imgCanvas.width = bmp.width
      imgCanvas.height = bmp.height
      const ictx = imgCanvas.getContext('2d')!
      ictx.drawImage(bmp, 0, 0)
      const sprite = decompose(manifest, imgCanvas)
      const { frameW, frameH, cols, frameCount, indices } = sprite

      // Recolor the slot-index sheet once per palette bank. `decompose` returns
      // frame-major indices, so we rebuild each frame at its visual sheet position.
      const banks = Math.min(16, Math.floor(fullPalette.length / 16))
      const bankSheets: HTMLCanvasElement[] = []
      const sheetW = cols * frameW
      const sheetH = Math.ceil(frameCount / cols) * frameH
      const rows = Math.ceil(frameCount / cols)
      for (let bank = 0; bank < banks; bank++) {
        const c = document.createElement('canvas')
        c.width = sheetW
        c.height = sheetH
        const cx = c.getContext('2d')!
        const idata = cx.createImageData(sheetW, sheetH)
        const d = idata.data
        for (let f = 0; f < frameCount; f++) {
          const gx = (f % cols) * frameW
          const gy = Math.floor(f / cols) * frameH
          for (let y = 0; y < frameH; y++) {
            for (let x = 0; x < frameW; x++) {
              const slot = indices[f * frameW * frameH + y * frameW + x]
              if (slot === 0) continue
              const hex = fullPalette[bank * 16 + slot]
              if (!hex) continue
              const [r, g, b] = hexToRgb(hex)
              const p = ((gy + y) * sheetW + (gx + x)) * 4
              d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255
            }
          }
        }
        cx.putImageData(idata, 0, 0)
        bankSheets.push(c)
      }
      const defaultSheet = bankSheets[0]

      const out = document.createElement('canvas')
      out.width = arrangement.w * frameW * 2
      out.height = arrangement.h * frameH * 2
      const octx = out.getContext('2d')!
      octx.imageSmoothingEnabled = false
      octx.scale(2, 2)

      function drawLayer(layer: TileEntry[]) {
        for (let i = 0; i < layer.length; i++) {
          const e = layer[i]
          if (e.t === 0 || e.t >= frameCount) continue
          const sheet = bankSheets[e.b] ?? defaultSheet
          const sx = (e.t % cols) * frameW
          const sy = Math.floor(e.t / cols) * frameH
          const dx = (i % arrangement.w) * frameW
          const dy = Math.floor(i / arrangement.w) * frameH
          octx.save()
          octx.translate(dx + (e.h ? frameW : 0), dy + (e.v ? frameH : 0))
          octx.scale(e.h ? -1 : 1, e.v ? -1 : 1)
          octx.drawImage(sheet, sx, sy, frameW, frameH, 0, 0, frameW, frameH)
          octx.restore()
        }
      }

      drawLayer(arrangement.layer0)
      drawLayer(arrangement.layer1)

      // Origin tuned so the demo choreography (tiles ~20–44) lands on the map's ground.
      return {
        canvas: out, originX: 520, planeOffsetY: 170,
        width: out.width, height: out.height,
        heights: null, bw: 0, wrapTiles: 0,   // finite scaffold map, not a torus
        sheet: null, sheetCols: 0, sheetFrameW: 0, sheetFrameH: 0,
        anims: [], elapsed: 0,
      }
    } catch (e) {
      console.error('loadFFTAGround failed', e)
      return null
    }
  }

  const ffaGround = await loadFFTAGround(`${scaffold}maps/1/`)
  const map = buildMap()
  // No animated tile cycles yet for the FFTA ground, so both buffers are the same static map.
  const groundA = ffaGround ?? bakeGround(map, tileset, 'biome/meadow', getPalette('biome/meadow'), TILE_ANIMS, propSheet)
  const groundB = ffaGround ?? bakeGround(withAltWater(map), tileset, 'biome/meadow', getPalette('biome/meadow'), undefined, propSheet)

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
