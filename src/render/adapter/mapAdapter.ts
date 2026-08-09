// Thin read-only bridge: game ZoneMap → renderer TileMapData + biome palette id.
// This is the only place the dimetric renderer learns the shape of a game zone.
// game-logic is untouched; mapGen's ZoneMap output is consumed as-is.

import type { TileMapData } from '../types'
import type { ZoneMap, ZoneId } from '../../data/types'
import { TILE } from '../placeholderArt'

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
// map period, so the heightmap is seamless across the 64-tile torus wrap. The high
// octaves carry the weight here — a field built only from map-wide waves puts its
// few slope changes ~32 tiles apart, so any viewport-sized window of it is flat no
// matter how large the amplitude. Mixed anisotropic terms (3×5, 5×3) break up the
// checkerboard symmetry that same-frequency sin(x)cos(y) products otherwise give.
// Deterministic per tile — no Date/Math.random, so bakes are stable across reloads.
function landformNoise(x: number, y: number): number {
  const nx = (x / MAP_SIZE) * Math.PI * 2
  const ny = (y / MAP_SIZE) * Math.PI * 2
  const n =
    Math.sin(nx * 1) * Math.cos(ny * 1) +
    Math.sin(nx * 2 + 1.3) * Math.cos(ny * 2) * 0.55 +
    Math.sin(nx * 3 - 0.4) * Math.cos(ny * 5 + 1.1) * 0.42 +
    Math.sin(nx * 5 + 0.7) * Math.cos(ny * 3 + 2.1) * 0.42 +
    Math.sin(nx * 8 + 2.2) * Math.cos(ny * 8 - 0.6) * 0.22
  // Gain, not a normalization. Dividing by the sum of amplitudes (2.61) would be
  // "correct" and useless: summed sines cluster near their mean, so the field would
  // never approach ±1 and the top elevation bands would go unused — which is exactly
  // why this map used to read flat. 1.4 is just inside the field's observed range
  // (-1.94..1.59), so the tails clip: genuine flat plains at the bottom, flat mesa
  // tops at the top, and the full 0..MAX_ELEV span in between.
  return n / 1.4
}

/**
 * Continuous field → discrete plateau level. The quantization IS the art direction:
 * GBA-tactics maps read as *designed* because they're flat tables at integer heights
 * joined by abrupt one-level steps. An unquantized field just tilts every tile a
 * little differently and reads as noise, which is what this map used to do.
 * The exponent biases toward the low plain so highlands stay the exception and most
 * of the zone is flat ground to walk and fight on.
 */
function plateauLevel(x: number, y: number): number {
  const t = Math.max(0, Math.min(1, (landformNoise(x, y) + 1) / 2))
  return Math.max(0, Math.min(MAX_ELEV, Math.round(Math.pow(t, 1.6) * MAX_ELEV)))
}

function tileHeight(type: string, x: number, y: number): number {
  const base = plateauLevel(x, y)
  // Water sits one step below the land around it — a basin. Pinning it to a global
  // sea floor (the old behaviour) rings every inland pond with a full-height cliff
  // once the map has real relief.
  if (type === 'water') return Math.max(0, base - 1)
  // Rock and cliff read as outcrops: one step proud of the plateau they sit on.
  if (type === 'cliff' || type === 'rock') return Math.min(MAX_ELEV, base + 1)
  return base
}

/**
 * Convert a game ZoneMap into a PADDED wrapped TileMapData. The buffer bakes the
 * full 64×64 torus plus a `PAD`-wide wrapped border on every side, so a
 * player-centered camera never hits a seam (see combatAdapter for placement).
 * `heights` is the same shape as `tiles` (per-buffer-tile elevation, wrapped).
 */
export function zoneMapToTileMap(zm: ZoneMap): TileMapData {
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
      heights[i] = tile ? tileHeight(tile.type, gx, gy) : plateauLevel(gx, gy)
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