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
    // resource_ore / resource_herb are nodes, not tile types (mapGen never sets
    // them on tiles), but defend anyway → treat as terrain.
    case 'terrain':
    case 'resource_ore':
    case 'resource_herb':
    default:
      return (hashTile(x, y) % 100) < 30 ? TILE.GRASS_ALT : TILE.GRASS
  }
}

/**
 * Convert a game ZoneMap into a PADDED wrapped TileMapData. The buffer bakes the
 * full 64×64 torus plus a `PAD`-wide wrapped border on every side, so a
 * player-centered camera never hits a seam (see combatAdapter for placement).
 */
export function zoneMapToTileMap(zm: ZoneMap): TileMapData {
  const tiles = new Uint8Array(PADDED_W * PADDED_W)
  for (let by = 0; by < PADDED_W; by++) {
    for (let bx = 0; bx < PADDED_W; bx++) {
      const gx = (((bx - PAD) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const gy = (((by - PAD) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const tile = zm.tiles[gy]?.[gx]
      tiles[by * PADDED_W + bx] = tile ? tileToFrame(tile.type, gx, gy) : TILE.GRASS
    }
  }
  return { w: PADDED_W, h: PADDED_W, tiles }
}

// ── Zone → biome palette id ───────────────────────────────────────────────────
// Phase 2 has three biome palettes; the 12 zones map onto the closest match.
// Phase 4 expands the biome palette registry; this is a placeholder mapping.
const BIOME_PALETTE: Record<ZoneId, string> = {
  sunhollow_meadows:   'biome/meadow',
  shattered_crossing:  'biome/meadow',
  thornvale_jungle:    'biome/meadow',
  the_maw_eternal:     'biome/meadow',
  dustwind_plains:     'biome/ashen',
  ironcrag_badlands:   'biome/ashen',
  warsong_mesa:        'biome/ashen',
  ashfire_peaks:       'biome/ashen',
  the_bloodfields:     'biome/ashen',
  cinderfall_wastes:   'biome/ashen',
  grimshade_forest:    'biome/gloom',
  venom_hollows:       'biome/gloom',
}

export function biomePaletteId(zoneId: ZoneId): string {
  return BIOME_PALETTE[zoneId] ?? 'biome/meadow'
}