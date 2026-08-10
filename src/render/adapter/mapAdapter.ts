// Thin read-only bridge: game ZoneMap → renderer TileMapData + biome palette id.
// This is the only place the dimetric renderer learns the shape of a game zone.
// game-logic is untouched; mapGen's ZoneMap output is consumed as-is.

import type { TileMapData } from '../types'
import type { ZoneMap, ZoneId } from '../../data/types'
import { TILE } from '../placeholderArt'
import { useScaffoldArt } from './fftaRoster'

export const MAP_SIZE = 64
// Wrapped border tiles baked around the map. Must be ≥ the largest mob approach
// offset (spawn dist 10–15 tiles, per-axis ≤15) and ≫ the on-screen viewport radius
// (~3 tiles), so the player-centered camera always sees real wrapped ground and a
// distant-approaching mob is never clipped to a buffer edge. 16 satisfies both.
export const PAD = 16
export const PADDED_W = MAP_SIZE + 2 * PAD // 96

// Per-tile elevation in "levels"; baked into the ground as raised diamonds + south-
// face rock cliffs so the flat torus reads with FFTA-style depth. feetY is height-aware
// (see tilemap.bakeGround). At ELEV_PX=10 per level the global ceiling gives up to 60px
// of relief — ~3.5 tile-heights, enough for a ridge to actually occlude what's behind it.
// Elevation is presentation-only: nothing in the game logic reads it.
export const MAX_ELEV = 6

// ── Biome elevation profiles ──────────────────────────────────────────────────
// Each zone gets a heightmap character: a meadow rolls gently (low ceiling, smooth),
// a peak zone builds literal mountains (tall ceiling, low gain so the field saturates
// into flat plains + flat-topped mesas with abrupt cliffs between, high fractal detail
// so those cliffs are jagged, not ruler-straight). The knobs:
//   maxElev — integer ceiling (clamps the quantized plateau levels)
//   gain    — divisor on the raw noise field. LOWER ⇒ the field saturates ⇒ more cells
//             pin to the floor AND the ceiling ⇒ dramatic flat plains + tall mesas.
//   exp     — plateauLevel exponent. HIGHER ⇒ biases toward the low plain (more ground
//             to walk); LOWER ⇒ more highlands / taller features.
//   detail  — weight on the high-frequency fractal octaves (rock grain, irregular
//             cliff edges). LOWER ⇒ smooth rolling hills; HIGHER ⇒ jagged, noisy peaks.
export interface BiomeElev { maxElev: number; gain: number; exp: number; detail: number }

const GENTLE: BiomeElev   = { maxElev: 2, gain: 2.0, exp: 1.9, detail: 0.12 } // rolling, few cliffs
const MID: BiomeElev      = { maxElev: 3, gain: 1.6, exp: 1.6, detail: 0.28 } // moderate hills + ridges
const CRAGGY: BiomeElev   = { maxElev: 5, gain: 1.18, exp: 1.15, detail: 0.42 } // badlands: sharp cliffs
const MESA: BiomeElev     = { maxElev: 5, gain: 1.22, exp: 1.3, detail: 0.34 } // flat-topped, steep sides
const PEAK: BiomeElev     = { maxElev: 6, gain: 1.05, exp: 1.0, detail: 0.50 } // literal mountains
const DRAMATIC: BiomeElev = { maxElev: 6, gain: 1.0, exp: 1.0, detail: 0.55 } // finale: maximum relief

const BIOME_ELEVATION: Record<ZoneId, BiomeElev> = {
  sunhollow_meadows:   GENTLE,   // meadow — small-mid elevation, mostly walkable
  dustwind_plains:     { maxElev: 2, gain: 2.2, exp: 2.1, detail: 0.10 }, // plains — flattest
  grimshade_forest:    MID,
  thornvale_jungle:    { maxElev: 3, gain: 1.5, exp: 1.5, detail: 0.36 }, // dense, ridgy
  ashfire_peaks:       PEAK,
  shattered_crossing:  MID,
  the_bloodfields:     { maxElev: 3, gain: 1.5, exp: 1.5, detail: 0.30 }, // war field, moderate
  ironcrag_badlands:   CRAGGY,
  venom_hollows:       { maxElev: 3, gain: 1.5, exp: 1.5, detail: 0.30 }, // swamp, low-mid
  warsong_mesa:        MESA,
  cinderfall_wastes:   { maxElev: 5, gain: 1.2, exp: 1.1, detail: 0.40 }, // volcanic rubble
  the_maw_eternal:     DRAMATIC,
}

const DEFAULT_ELEV: BiomeElev = GENTLE

function biomeElev(zoneId?: string): BiomeElev {
  return (zoneId && (BIOME_ELEVATION as Record<string, BiomeElev>)[zoneId]) || DEFAULT_ELEV
}

// ── Tile-type → tileset frame index ───────────────────────────────────────────
// Stable per-tile hash so grass gets texture variation and the wrapped border
// continues the interior pattern seamlessly (same game tile ⇒ same frame).
function hashTile(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0)
}

function tileToFrame(type: string, x: number, y: number): number {
  switch (type) {
    case 'water': return TILE.WATER
    case 'cliff': return TILE.CLIFF
    case 'sand': return TILE.SAND
    case 'rock': return TILE.ROCK
    case 'snow': return TILE.SNOW
    case 'moss': return TILE.MOSS
    case 'ember': return TILE.EMBER
    case 'bog': return TILE.BOG
    case 'dirt': return (hashTile(x, y) % 100) < 45 ? TILE.PATH_ALT : TILE.PATH
    case 'grass': return (hashTile(x, y) % 100) < 30 ? TILE.GRASS_ALT : TILE.GRASS
    case 'flower': return (hashTile(x, y) % 100) < 35 ? TILE.FLOWER : TILE.GRASS
    // resource_ore / resource_herb are nodes, not tile types (mapGen never sets
    // them on tiles), but defend anyway → treat as terrain.
    case 'terrain':
    case 'resource_ore':
    case 'resource_herb':
    default:
      // Unknown types (e.g. a future tile type, or an old save with only the base
      // set) fall back to grass so the ground always renders.
      return (hashTile(x, y) % 100) < 30 ? TILE.GRASS_ALT : TILE.GRASS
  }
}

// ── Elevation ─────────────────────────────────────────────────────────────────
// Landform field: summed sines whose frequencies are all integer multiples of the
// map period, so the heightmap is seamless across the 64-tile torus wrap. The mid
// octaves carry the weight here — a field built only from map-wide waves puts its
// few slope changes ~32 tiles apart, so any viewport-sized window of it is flat no
// matter how large the amplitude. Mixed anisotropic terms (3×5, 5×3) break up the
// checkerboard symmetry that same-frequency sin(x)cos(y) products otherwise give.
// Deterministic per tile — no Date/Math.random, so bakes are stable across reloads.
//
// The field is returned RAW (no gain division). Each biome applies its own `gain`
// in plateauLevel: a meadow divides by ~2 (the field rarely saturates → gentle
// rolling, no cliffs), a peak zone divides by ~1.0 (the field pins to the floor AND
// ceiling → flat plains + tall mesas with abrupt cliffs between). High-frequency
// fractal octaves (11..31) are weighted by the biome `detail` knob so a meadow stays
// smooth while a mountain zone gets jagged, noisy cliff edges instead of ruler-
// straight ones. All octaves use integer frequencies, so the torus wrap stays seam.
function landformNoise(x: number, y: number, detail = 0): number {
  const nx = (x / MAP_SIZE) * Math.PI * 2
  const ny = (y / MAP_SIZE) * Math.PI * 2
  // Low/mid-frequency landform (seamless: every multiplier is an integer).
  let n =
    Math.sin(nx * 1) * Math.cos(ny * 1) +
    Math.sin(nx * 2 + 1.3) * Math.cos(ny * 2) * 0.55 +
    Math.sin(nx * 3 - 0.4) * Math.cos(ny * 5 + 1.1) * 0.42 +
    Math.sin(nx * 5 + 0.7) * Math.cos(ny * 3 + 2.1) * 0.42 +
    Math.sin(nx * 8 + 2.2) * Math.cos(ny * 8 - 0.6) * 0.22
  // High-frequency fractal grain — rock texture + irregular cliff edges. Weighted
  // by `detail` (0..~0.55): ~0 for a smooth meadow, ~0.5 for jagged peaks. Decaying
  // amplitude per octave; anisotropic (different x/y freqs) avoids axis-aligned banding.
  if (detail > 0) {
    n +=
      Math.sin(nx * 11 + 0.3) * Math.cos(ny * 11 + 1.7) * detail * 0.50 +
      Math.sin(nx * 17 - 1.1) * Math.cos(ny * 13 + 0.6) * detail * 0.35 +
      Math.sin(nx * 23 + 2.4) * Math.cos(ny * 19 - 0.9) * detail * 0.25 +
      Math.sin(nx * 31 - 0.7) * Math.cos(ny * 29 + 1.2) * detail * 0.15
  }
  return n
}

/**
 * Continuous field → discrete plateau level. The quantization IS the art direction:
 * GBA-tactics maps read as *designed* because they're flat tables at integer heights
 * joined by abrupt one-level steps. An unquantized field just tilts every tile a
 * little differently and reads as noise, which is what this map used to do.
 *
 * The per-biome profile `p` shapes the field:
 *   gain  — divisor on the raw field. LOWER ⇒ saturates ⇒ flat plains + tall mesas.
 *   exp   — biases the histogram. HIGHER ⇒ more low plain to walk; LOWER ⇒ highlands.
 *   maxElev — the integer ceiling (clamps the quantized levels).
 */
function plateauLevel(x: number, y: number, p: BiomeElev): number {
  const t = Math.max(0, Math.min(1, (landformNoise(x, y, p.detail) / p.gain + 1) / 2))
  return Math.max(0, Math.min(p.maxElev, Math.round(Math.pow(t, p.exp) * p.maxElev)))
}

function tileHeight(type: string, x: number, y: number, p: BiomeElev): number {
  const base = plateauLevel(x, y, p)
  // Water sits one step below the land around it — a basin. Pinning it to a global
  // sea floor (the old behaviour) rings every inland pond with a full-height cliff
  // once the map has real relief.
  if (type === 'water') return Math.max(0, base - 1)
  // Rock and cliff read as outcrops: one step proud of the plateau they sit on.
  if (type === 'cliff' || type === 'rock') return Math.min(p.maxElev, base + 1)
  return base
}

/**
 * Convert a game ZoneMap into a PADDED wrapped TileMapData. The buffer bakes the
 * full 64×64 torus plus a `PAD`-wide wrapped border on every side, so a
 * player-centered camera never hits a seam (see combatAdapter for placement).
 * `heights` is the same shape as `tiles` (per-buffer-tile elevation, wrapped).
 */
// ── FFTA terrain elevation override (DEV / `?ffta` only) ───────────────────────
// The cracked FFTA elevation oracle (see ../ffta-decomp docs/system/map-format.md):
// each map's entry+0x10 is a record stream expanding to a 16x16 {height=lo,type=hi}
// grid. In `?ffta` dev mode we drive zone elevation from that grid instead of the
// procedural plateauLevel, so the world's tiles rise into real FFTA height shapes
// (cliffs/plateaus) through the existing bakeGround. Prod builds strip `useScaffoldArt`,
// so this is dead code when shipped — the FFTA data is reference-only, never bundled.
let fftaTerrain: Int16Array | null = null   // 256 raw heights (0..31), row-major 16x16
let fftaMapId = 1

export async function loadFftaTerrain(mapId = 1): Promise<void> {
  if (!useScaffoldArt) return
  fftaMapId = mapId
  try {
    const base = import.meta.env.BASE_URL
    const res = await fetch(`${base}local-assets/ffta-scaffold/maps/${mapId}/terrain.json`)
    if (!res.ok) return
    const d = await res.json()
    const rows: number[][] = d.height
    if (!Array.isArray(rows) || rows.length !== 16) return
    const a = new Int16Array(256)
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) a[r * 16 + c] = rows[r][c] | 0
    fftaTerrain = a
  } catch { /* scaffold absent or stale -> fall back to procedural */ }
}

// FFTA height 0..31 -> elevation level 0..MAX_ELEV. The zone game space is 64x64 and
// wraps every 64; 64/4=16 so each FFTA terrain cell maps to a 4x4 block of zone tiles,
// tiling the 16x16 grid exactly once with a clean wrap.
function fftaLevelAt(gx: number, gy: number): number {
  if (!fftaTerrain) return -1
  const tx = (gx >> 2) & 15, ty = (gy >> 2) & 15
  const h = fftaTerrain[ty * 16 + tx]
  return Math.min(MAX_ELEV, Math.round((h * MAX_ELEV) / 31))
}

export function zoneMapToTileMap(zm: ZoneMap, zoneId?: string): TileMapData {
  const p = biomeElev(zoneId)
  const tiles = new Uint8Array(PADDED_W * PADDED_W)
  const heights = new Uint8Array(PADDED_W * PADDED_W)
  // Flat props by game-tile coord (Phase D). Building the lookup by game coord and
  // resolving per buffer tile means props wrap into the padded border seamlessly —
  // each buffer tile inherits its wrapped game tile's prop. Optional on old saves.
  const propByGame = zm.props ? new Map<number, number>() : null
  if (zm.props) for (const pr of zm.props) propByGame!.set(pr.y * MAP_SIZE + pr.x, pr.artId)
  const props: { bx: number; by: number; artId: number }[] = []
  for (let by = 0; by < PADDED_W; by++) {
    for (let bx = 0; bx < PADDED_W; bx++) {
      const gx = (((bx - PAD) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const gy = (((by - PAD) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const tile = zm.tiles[gy]?.[gx]
      const i = by * PADDED_W + bx
      tiles[i] = tile ? tileToFrame(tile.type, gx, gy) : TILE.GRASS
      const fl = useScaffoldArt ? fftaLevelAt(gx, gy) : -1
      heights[i] = fl >= 0 ? fl : (tile ? tileHeight(tile.type, gx, gy, p) : plateauLevel(gx, gy, p))
      const artId = propByGame?.get(gy * MAP_SIZE + gx)
      if (artId !== undefined) props.push({ bx, by, artId })
    }
  }
  // The zone wraps every MAP_SIZE tiles, so the renderer can tile this bake to fill any
  // viewport rather than relying on PAD being wide enough — which it cannot be.
  return { w: PADDED_W, h: PADDED_W, tiles, heights, props, wrapTiles: MAP_SIZE }
}

// ── Zone → biome palette id ───────────────────────────────────────────────────
// Per-zone biome ground palette (environment-plan Phase A). Each zone resolves to a
// palette id registered in palettes.ts; tiles are palette-indexed so the swap is free
// (the bake cache lazily produces one sheet per (tileset, biome) pair). Grouped by
// zone character: greens, jungle, red-rock, charcoal/ember, dust, blood, sickly.
const BIOME_PALETTE: Record<ZoneId, string> = {
  sunhollow_meadows:   'biome/meadow',       // default grassland
  shattered_crossing:  'biome/forest',       // temperate forest greens
  thornvale_jungle:    'biome/jungle',       // deep saturated jungle
  the_maw_eternal:     'biome/maw',          // corrupted dark swamp
  dustwind_plains:     'biome/wastes',       // pale dust
  ironcrag_badlands:   'biome/badlands',     // red-rock badlands
  warsong_mesa:        'biome/badlands',     // red-rock mesa
  ashfire_peaks:       'biome/ashfire',      // charcoal + ember
  the_bloodfields:     'biome/bloodfields',  // red earth, blood water
  cinderfall_wastes:   'biome/cinder',       // cinder + glowing fissures
  grimshade_forest:    'biome/gloom',        // dark purple forest
  venom_hollows:       'biome/venom',        // sickly green-purple
}

export function biomePaletteId(zoneId: ZoneId): string {
  return BIOME_PALETTE[zoneId] ?? 'biome/meadow'
}