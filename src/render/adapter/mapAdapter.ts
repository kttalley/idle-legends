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
// face skirts so the flat torus reads with FFTA-style depth. 0..2 keeps hills gentle
// and the skirt geometry cheap. feetY is height-aware (see tilemap.bakeGround).
export const MAX_ELEV = 2

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
// Periodic low-frequency bumps (sin waves at frequencies that divide MAP_SIZE) so
// the heightmap is seamless across the 64-tile torus wrap. Tile type then overrides:
// water stays low (0), cliffs sit on the hilltops (capped at MAX_ELEV). Deterministic
// per tile — no Date/Math.random, so bakes are stable across reloads.
function bumpHeight(x: number, y: number): number {
  const nx = (x / MAP_SIZE) * Math.PI * 2
  const ny = (y / MAP_SIZE) * Math.PI * 2
  // Three wave layers; sum ∈ ~[-3,3], normalized to 0..MAX_ELEV.
  const n =
    Math.sin(nx * 1) * Math.cos(ny * 1) +
    Math.sin(nx * 2 + 1.3) * Math.cos(ny * 2) * 0.5 +
    Math.sin(nx * 4 + 0.7) * Math.cos(ny * 4 + 2.1) * 0.25
  // Map n ∈ [-1.75, 1.75] → 0..MAX_ELEV, rounded.
  const t = (n + 1.75) / 3.5
  return Math.max(0, Math.min(MAX_ELEV, Math.round(t * MAX_ELEV)))
}

function tileHeight(type: string, x: number, y: number): number {
  const base = bumpHeight(x, y)
  if (type === 'water') return 0            // water is the low plane
  if (type === 'cliff') return Math.min(MAX_ELEV, Math.max(1, base)) // raised rock
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
      heights[i] = tile ? tileHeight(tile.type, gx, gy) : bumpHeight(gx, gy)
      const artId = propByGame?.get(gy * MAP_SIZE + gx)
      if (artId !== undefined) props.push({ bx, by, artId })
    }
  }
  return { w: PADDED_W, h: PADDED_W, tiles, heights, props }
}

// ── Zone → biome palette id ───────────────────────────────────────────────────
// Per-zone biome ground palette (environment-plan Phase A). Each zone resolves to a
// palette id registered in palettes.ts; tiles are palette-indexed so the swap is free
// (the bake cache lazily produces one sheet per (tileset, biome) pair). Grouped by
// zone character: greens, jungle, red-rock, charcoal/ember, dust, blood, sickly.
const BIOME_PALETTE: Record<ZoneId, string> = {
  sunhollow_meadows:   'biome/meadow',       // default grassland (alias of map080)
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