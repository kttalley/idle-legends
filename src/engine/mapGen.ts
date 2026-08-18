import { PROP_KIND, SCENERY_KIND, type ZoneId, type ZoneMap, type MapTile, type MapNode, type MapProp, type MapScenery, type TileType } from '../data/types'
import { buildWalkMask, relocateStrandedNodes } from './walkability'

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function seededRand(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297 + 233) * 16807
  return x - Math.floor(x)
}

// ── Biome configs ─────────────────────────────────────────────────────────────
interface BiomeMapConfig {
  waterDensity: number
  terrainChars: string[]
  waterChars: string[]
  cliffChars: string[]
  terrainColor: string
  waterColor: string
  cliffColor: string
  oreColor: string
  herbColor: string
}

const BIOME_MAP_CONFIGS: Record<ZoneId, BiomeMapConfig> = {
  sunhollow_meadows: {
    waterDensity: 0.30,
    terrainChars: ['.', ',', "'", '·'],
    waterChars:   ['~', '≈', '-', '·'],
    cliffChars:   ['^', '¬'],
    terrainColor: '#4a7c59',
    waterColor:   '#4488aa',
    cliffColor:   '#2d5c3a',
    oreColor:     '#c8a050',
    herbColor:    '#88cc44',
  },
  dustwind_plains: {
    waterDensity: 0.15,
    terrainChars: ['.', '~', '≈', ','],
    waterChars:   ['~', '-', '·'],
    cliffChars:   ['#', '¬'],
    terrainColor: '#8b6914',
    waterColor:   '#668844',
    cliffColor:   '#5c4400',
    oreColor:     '#c8a050',
    herbColor:    '#88aa44',
  },
  grimshade_forest: {
    waterDensity: 0.35,
    terrainChars: ['♦', '♠', '·', '#'],
    waterChars:   ['~', '≈', '·', '-'],
    cliffChars:   ['#', '♦'],
    terrainColor: '#2d1b4e',
    waterColor:   '#1a3a6e',
    cliffColor:   '#1a0e30',
    oreColor:     '#aa66cc',
    herbColor:    '#6633aa',
  },
  thornvale_jungle: {
    waterDensity: 0.40,
    terrainChars: ['#', '%', '&', '·'],
    waterChars:   ['~', '≈', '=', '·'],
    cliffChars:   ['#', '%'],
    terrainColor: '#1a5c2a',
    waterColor:   '#1a6644',
    cliffColor:   '#0d3316',
    oreColor:     '#88aa22',
    herbColor:    '#44cc66',
  },
  ashfire_peaks: {
    waterDensity: 0.10,
    terrainChars: ['^', '·', '/', '\\'],
    waterChars:   ['~', '·', '-'],
    cliffChars:   ['/', '\\'],
    terrainColor: '#8b1a1a',
    waterColor:   '#cc4422',
    cliffColor:   '#5c0a0a',
    oreColor:     '#ff6600',
    herbColor:    '#cc3300',
  },
  shattered_crossing: {
    waterDensity: 0.25,
    terrainChars: ['.', ',', "'", '·'],
    waterChars:   ['~', '≈', '-', '·'],
    cliffChars:   ['^', '¬'],
    terrainColor: '#4a7c59',
    waterColor:   '#4488aa',
    cliffColor:   '#2d5c3a',
    oreColor:     '#c8a050',
    herbColor:    '#88cc44',
  },
  the_bloodfields: {
    waterDensity: 0.20,
    terrainChars: ['.', '~', '≈', ','],
    waterChars:   ['~', '-', '·'],
    cliffChars:   ['#', '¬'],
    terrainColor: '#8b1a1a',
    waterColor:   '#cc4422',
    cliffColor:   '#5c0a0a',
    oreColor:     '#c8a050',
    herbColor:    '#cc3300',
  },
  ironcrag_badlands: {
    waterDensity: 0.10,
    terrainChars: ['.', '~', '≈', ','],
    waterChars:   ['~', '-', '·'],
    cliffChars:   ['#', '¬'],
    terrainColor: '#5c4400',
    waterColor:   '#8b6914',
    cliffColor:   '#3d2e00',
    oreColor:     '#c8a050',
    herbColor:    '#88aa44',
  },
  venom_hollows: {
    waterDensity: 0.40,
    terrainChars: ['♦', '♠', '·', '#'],
    waterChars:   ['~', '≈', '·', '-'],
    cliffChars:   ['#', '♦'],
    terrainColor: '#2d1b4e',
    waterColor:   '#1a3a6e',
    cliffColor:   '#1a0e30',
    oreColor:     '#aa66cc',
    herbColor:    '#6633aa',
  },
  warsong_mesa: {
    waterDensity: 0.15,
    terrainChars: ['.', '~', '≈', ','],
    waterChars:   ['~', '-', '·'],
    cliffChars:   ['#', '¬'],
    terrainColor: '#8b6914',
    waterColor:   '#668844',
    cliffColor:   '#5c4400',
    oreColor:     '#c8a050',
    herbColor:    '#88aa44',
  },
  cinderfall_wastes: {
    waterDensity: 0.05,
    terrainChars: ['^', '·', '/', '\\'],
    waterChars:   ['~', '·', '-'],
    cliffChars:   ['/', '\\'],
    terrainColor: '#cf4520',
    waterColor:   '#cc4422',
    cliffColor:   '#8b1a1a',
    oreColor:     '#ff6600',
    herbColor:    '#cc3300',
  },
  the_maw_eternal: {
    waterDensity: 0.30,
    terrainChars: ['#', '%', '&', '·'],
    waterChars:   ['~', '≈', '=', '·'],
    cliffChars:   ['#', '%'],
    terrainColor: '#1a5c2a',
    waterColor:   '#1a6644',
    cliffColor:   '#0d3316',
    oreColor:     '#88aa22',
    herbColor:    '#44cc66',
  },
}

// Dominant terrain tile type per biome (environment-plan Phase C). Emitted for every
// non-water, non-cliff cell so each biome reads with its characteristic ground instead
// of uniform grass. The dimetric renderer maps these to tileset frames (mapAdapter
// tileToFrame); the legacy ASCII view treats any non-water/cliff type as land, so the
// new types are forward-compatible there too. Old saves without these types still
// render (tileToFrame defaults unknown → grass).
// Each biome mixes several ground materials (dominant + accents) rather than a single
// flat tile, so a zone reads as textured terrain instead of one repeated diamond. The
// per-material art (placeholderArt.makeTileset) is distinct in SHAPE, and the biome
// palette tints all of them — together that makes each zone unmistakable.
type TerrainMix = ReadonlyArray<{ type: TileType; w: number }>
const BIOME_TERRAIN: Record<ZoneId, TerrainMix> = {
  sunhollow_meadows:  [{ type: 'grass', w: 6 }, { type: 'flower', w: 3 }, { type: 'dirt', w: 1 }],
  shattered_crossing: [{ type: 'grass', w: 5 }, { type: 'moss', w: 3 }, { type: 'dirt', w: 2 }],
  thornvale_jungle:   [{ type: 'moss', w: 6 }, { type: 'grass', w: 3 }, { type: 'bog', w: 1 }],
  the_maw_eternal:    [{ type: 'bog', w: 5 }, { type: 'moss', w: 3 }, { type: 'ember', w: 2 }],
  dustwind_plains:    [{ type: 'sand', w: 6 }, { type: 'dirt', w: 3 }, { type: 'rock', w: 1 }],
  ironcrag_badlands:  [{ type: 'rock', w: 5 }, { type: 'sand', w: 3 }, { type: 'dirt', w: 2 }],
  warsong_mesa:       [{ type: 'sand', w: 5 }, { type: 'rock', w: 4 }, { type: 'dirt', w: 1 }],
  ashfire_peaks:      [{ type: 'rock', w: 5 }, { type: 'ember', w: 4 }, { type: 'sand', w: 1 }],
  the_bloodfields:    [{ type: 'dirt', w: 5 }, { type: 'sand', w: 3 }, { type: 'rock', w: 2 }],
  cinderfall_wastes:  [{ type: 'ember', w: 5 }, { type: 'sand', w: 3 }, { type: 'rock', w: 2 }],
  grimshade_forest:   [{ type: 'moss', w: 6 }, { type: 'dirt', w: 3 }, { type: 'bog', w: 1 }],
  venom_hollows:      [{ type: 'bog', w: 5 }, { type: 'moss', w: 4 }, { type: 'water', w: 1 }],
}

/** Deterministic weighted pick from a biome's material mix, in coarse patches so the
 *  same material clusters (via a low-frequency cell hash) rather than salt-and-pepper. */
function pickTerrain(mix: TerrainMix, seed: number, r: number, c: number): TileType {
  // Quantize to 2×2 cells so a material fills a small patch, not single tiles.
  const roll = seededRand(seed + 17, Math.floor(r / 2) * 64 + Math.floor(c / 2))
  const total = mix.reduce((a, m) => a + m.w, 0)
  let t = roll * total
  for (const m of mix) { if ((t -= m.w) < 0) return m.type }
  return mix[0].type
}

// Flat ground-clutter scatter per biome (environment-plan Phase D). `density` is the
// fraction of land tiles that carry a prop; `kinds` is the weighted pool (repeat an id
// to weight it). Deterministic via seededRand (no Math.random) so a zone's clutter is
// stable across reloads. artId values are PROP_KIND.* (data-layer contract).
const BIOME_PROPS: Record<ZoneId, { density: number; kinds: number[] }> = {
  sunhollow_meadows:  { density: 0.18, kinds: [PROP_KIND.TUFT, PROP_KIND.FLOWER, PROP_KIND.PEBBLE, PROP_KIND.TUFT] },
  shattered_crossing: { density: 0.20, kinds: [PROP_KIND.TUFT, PROP_KIND.MUSHROOM, PROP_KIND.PEBBLE, PROP_KIND.FLOWER] },
  thornvale_jungle:   { density: 0.24, kinds: [PROP_KIND.TUFT, PROP_KIND.MUSHROOM, PROP_KIND.CATTAIL, PROP_KIND.FLOWER] },
  the_maw_eternal:    { density: 0.22, kinds: [PROP_KIND.CATTAIL, PROP_KIND.MUSHROOM, PROP_KIND.TUFT, PROP_KIND.BONE] },
  dustwind_plains:    { density: 0.14, kinds: [PROP_KIND.PEBBLE, PROP_KIND.BONE, PROP_KIND.ROCK] },
  ironcrag_badlands:  { density: 0.16, kinds: [PROP_KIND.PEBBLE, PROP_KIND.ROCK, PROP_KIND.BONE, PROP_KIND.CRYSTAL] },
  warsong_mesa:       { density: 0.14, kinds: [PROP_KIND.PEBBLE, PROP_KIND.ROCK, PROP_KIND.BONE] },
  ashfire_peaks:      { density: 0.16, kinds: [PROP_KIND.BONE, PROP_KIND.ROCK, PROP_KIND.PEBBLE, PROP_KIND.CRYSTAL] },
  the_bloodfields:    { density: 0.18, kinds: [PROP_KIND.BONE, PROP_KIND.ROCK, PROP_KIND.PEBBLE] },
  cinderfall_wastes:  { density: 0.14, kinds: [PROP_KIND.BONE, PROP_KIND.ROCK, PROP_KIND.PEBBLE, PROP_KIND.CRYSTAL] },
  grimshade_forest:   { density: 0.20, kinds: [PROP_KIND.MUSHROOM, PROP_KIND.BONE, PROP_KIND.TUFT, PROP_KIND.FLOWER] },
  venom_hollows:      { density: 0.22, kinds: [PROP_KIND.MUSHROOM, PROP_KIND.CATTAIL, PROP_KIND.TUFT] },
}

const MAP_SIZE = 64

// Tall scenery scattered per biome (trees, boulders, spires, mounds, bushes, ruins).
// Sparse (these occlude and are depth-sorted entities, not baked). `kinds` is the
// weighted pool (repeat an id to weight it); REEDS auto-restrict to water edges.
const SK = SCENERY_KIND
const BIOME_SCENERY: Record<ZoneId, { density: number; kinds: number[] }> = {
  sunhollow_meadows:  { density: 0.020, kinds: [SK.TREE, SK.BUSH, SK.FLOWERBED, SK.BUSH, SK.TREE, SK.MOUND] },
  shattered_crossing: { density: 0.024, kinds: [SK.TREE, SK.PINE, SK.BUSH, SK.STUMP, SK.PILLAR] },
  thornvale_jungle:   { density: 0.030, kinds: [SK.TREE, SK.BUSH, SK.FLOWERBED, SK.TREE, SK.REEDS] },
  the_maw_eternal:    { density: 0.026, kinds: [SK.DEADTREE, SK.PILLAR, SK.SPIRE, SK.REEDS, SK.DEADTREE] },
  dustwind_plains:    { density: 0.016, kinds: [SK.MOUND, SK.BOULDER, SK.DEADTREE, SK.MOUND] },
  ironcrag_badlands:  { density: 0.022, kinds: [SK.BOULDER, SK.SPIRE, SK.MOUND, SK.BOULDER] },
  warsong_mesa:       { density: 0.020, kinds: [SK.BOULDER, SK.SPIRE, SK.MOUND, SK.PILLAR] },
  ashfire_peaks:      { density: 0.024, kinds: [SK.SPIRE, SK.BOULDER, SK.DEADTREE, SK.SPIRE] },
  the_bloodfields:    { density: 0.022, kinds: [SK.DEADTREE, SK.BOULDER, SK.PILLAR, SK.MOUND] },
  cinderfall_wastes:  { density: 0.024, kinds: [SK.SPIRE, SK.PILLAR, SK.DEADTREE, SK.BOULDER] },
  grimshade_forest:   { density: 0.028, kinds: [SK.DEADTREE, SK.PINE, SK.BUSH, SK.STUMP, SK.DEADTREE] },
  venom_hollows:      { density: 0.026, kinds: [SK.DEADTREE, SK.BUSH, SK.REEDS, SK.MOUND, SK.DEADTREE] },
}

// A handful of structure landmarks per zone. Ruined/war biomes get arches; settled biomes
// get the occasional homestead. Kept rare so they read as points of interest.
//
// The TOWER used to appear in eleven of the twelve pools and was usually the first or
// second entry, which made it the default silhouette of the whole world — you could not
// cross a zone without one on screen, and a landmark you see everywhere is scenery. It is
// now the RAREST of the three: one weighted slot in five biomes, none in the rest. A
// watchtower means someone is holding this ground, so the biomes that get one are the
// contested ones (the crossing, the mesa, the badlands, the bloodfields, the wastes).
// Everywhere else the ruin and the homestead carry the job, with the small PILLAR still
// available as a quieter marker.
const BIOME_LANDMARK: Record<ZoneId, { count: number; kinds: number[] }> = {
  sunhollow_meadows:  { count: 3, kinds: [SK.HUT, SK.HUT, SK.ARCH] },
  shattered_crossing: { count: 4, kinds: [SK.HUT, SK.ARCH, SK.ARCH, SK.TOWER] },
  thornvale_jungle:   { count: 2, kinds: [SK.ARCH, SK.PILLAR] },
  the_maw_eternal:    { count: 3, kinds: [SK.ARCH, SK.PILLAR, SK.ARCH] },
  dustwind_plains:    { count: 2, kinds: [SK.HUT, SK.HUT, SK.TOWER] },
  ironcrag_badlands:  { count: 3, kinds: [SK.ARCH, SK.HUT, SK.ARCH, SK.TOWER] },
  warsong_mesa:       { count: 3, kinds: [SK.HUT, SK.ARCH, SK.ARCH, SK.TOWER] },
  ashfire_peaks:      { count: 2, kinds: [SK.ARCH, SK.PILLAR] },
  the_bloodfields:    { count: 4, kinds: [SK.ARCH, SK.PILLAR, SK.ARCH, SK.TOWER] },
  cinderfall_wastes:  { count: 3, kinds: [SK.ARCH, SK.PILLAR, SK.ARCH] },
  grimshade_forest:   { count: 3, kinds: [SK.HUT, SK.ARCH, SK.PILLAR] },
  venom_hollows:      { count: 2, kinds: [SK.ARCH, SK.PILLAR] },
}

// Canopy giants — the 64×96 trees, scattered like landmarks rather than like scenery.
//
// Scale variety is the point. Every living thing in a biome used to be 32×48, so a forest
// was a field of identical lollipops and nothing gave the hero a size. A handful of trees
// three times taller fixes that from one pass — and because they depth-sort like any other
// prop, they also give the player something to walk BEHIND, which is most of what sells a
// diorama as a place.
//
// Counts are per 64×64 map and deliberately in the same range as the structure landmarks:
// a giant that turns up every few tiles is just the new normal size.
const BIOME_CANOPY: Record<ZoneId, { count: number; kinds: number[] }> = {
  sunhollow_meadows:  { count: 5, kinds: [SK.GREAT_TREE] },
  shattered_crossing: { count: 6, kinds: [SK.GREAT_TREE, SK.GREAT_PINE] },
  thornvale_jungle:   { count: 9, kinds: [SK.GREAT_TREE, SK.GREAT_TREE, SK.GREAT_PINE] },
  the_maw_eternal:    { count: 6, kinds: [SK.GREAT_DEADTREE] },
  dustwind_plains:    { count: 3, kinds: [SK.GREAT_DEADTREE] },
  ironcrag_badlands:  { count: 3, kinds: [SK.GREAT_DEADTREE] },
  warsong_mesa:       { count: 3, kinds: [SK.GREAT_DEADTREE] },
  ashfire_peaks:      { count: 4, kinds: [SK.GREAT_DEADTREE] },
  the_bloodfields:    { count: 4, kinds: [SK.GREAT_DEADTREE] },
  cinderfall_wastes:  { count: 4, kinds: [SK.GREAT_DEADTREE] },
  grimshade_forest:   { count: 8, kinds: [SK.GREAT_PINE, SK.GREAT_DEADTREE, SK.GREAT_PINE] },
  venom_hollows:      { count: 6, kinds: [SK.GREAT_DEADTREE, SK.GREAT_PINE] },
}

// ── CA terrain generation ─────────────────────────────────────────────────────
function countNeighbours(grid: number[][], r: number, c: number): number {
  let count = 0
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= MAP_SIZE || nc < 0 || nc >= MAP_SIZE) {
        count++ // treat out-of-bounds as terrain
      } else {
        count += grid[nr][nc]
      }
    }
  }
  return count
}

function caSmooth(grid: number[][], threshold = 5): number[][] {
  const next = grid.map(row => [...row])
  for (let r = 0; r < MAP_SIZE; r++) {
    for (let c = 0; c < MAP_SIZE; c++) {
      const n = countNeighbours(grid, r, c)
      next[r][c] = n >= threshold ? 1 : 0
    }
  }
  return next
}

/**
 * @param worldSeed Per-run entropy mixed into every layer of the generation — terrain,
 *   node placement, clutter, scenery and landmarks. Zone identity previously WAS the
 *   whole seed, so every character in every playthrough walked a byte-identical world
 *   forever. 0 reproduces that original map exactly, which is what old saves pass so
 *   their world doesn't shift underneath them.
 */
export function generateZoneMap(zoneId: ZoneId, worldSeed = 0): ZoneMap {
  const cfg  = BIOME_MAP_CONFIGS[zoneId]
  const seed = Math.abs(hashStr(zoneId) ^ Math.imul(worldSeed, 0x9E3779B9))

  // Step 1: Init grid — 1 = terrain, 0 = water
  let grid: number[][] = []
  for (let r = 0; r < MAP_SIZE; r++) {
    grid[r] = []
    for (let c = 0; c < MAP_SIZE; c++) {
      grid[r][c] = seededRand(seed, r * MAP_SIZE + c) > cfg.waterDensity ? 1 : 0
    }
  }

  // Step 2: 4 CA smoothing passes
  for (let pass = 0; pass < 4; pass++) {
    grid = caSmooth(grid, pass < 2 ? 5 : 4)
  }

  // Step 3: Build tile map
  const tiles: MapTile[][] = []
  for (let r = 0; r < MAP_SIZE; r++) {
    tiles[r] = []
    for (let c = 0; c < MAP_SIZE; c++) {
      const isWater = grid[r][c] === 0

      let type: TileType
      let charSet: string[]
      let color: string

      if (isWater) {
        type = 'water'
        charSet = cfg.waterChars
        color = cfg.waterColor
      } else {
        // Check cliff: terrain cell bordering ≥3 water neighbours
        let waterNeighbours = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            const nr = r + dr; const nc = c + dc
            if (nr >= 0 && nr < MAP_SIZE && nc >= 0 && nc < MAP_SIZE && grid[nr][nc] === 0) {
              waterNeighbours++
            }
          }
        }
        if (waterNeighbours >= 3) {
          type = 'cliff'
          charSet = cfg.cliffChars
          color = cfg.cliffColor
        } else {
          // Biome-flavored ground: a weighted mix of materials in coarse patches, so
          // the zone reads as varied terrain. charSet/color stay on the terrain values
          // for the legacy ASCII view; the dimetric renderer keys off `type` only.
          type = pickTerrain(BIOME_TERRAIN[zoneId], seed, r, c)
          charSet = cfg.terrainChars
          color = cfg.terrainColor
        }
      }

      // Pick a stable char from the set using seeded offset
      const charIdx = Math.floor(seededRand(seed + 1, r * MAP_SIZE + c) * charSet.length)
      // For water, store all chars for animation; for others, store the selected + full set
      const finalCharSet = type === 'water' ? charSet : [charSet[charIdx]]

      tiles[r][c] = { type, charSet: finalCharSet, color }
    }
  }

  // Step 4: Place resource nodes on terrain tiles
  const nodes: MapNode[] = []
  const nodeCount = { ore: 4, herb: 4, mob_spawn: 3, boss_lair: 1 }
  let nodeIdx = 0

  const placeNodes = (
    type: MapNode['type'],
    count: number,
    icon: string,
    color: string,
  ) => {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < 200) {
      attempts++
      const r = Math.floor(seededRand(seed + 100, nodeIdx) * MAP_SIZE)
      const c = Math.floor(seededRand(seed + 200, nodeIdx) * MAP_SIZE)
      nodeIdx++
      // Place on any walkable land tile (grass or any biome-flavored ground type);
      // never on water or cliffs.
      const t = tiles[r][c].type
      if (t !== 'water' && t !== 'cliff') {
        nodes.push({ x: c, y: r, type, icon, color })
        placed++
      }
    }
  }

  placeNodes('ore',       nodeCount.ore,       '⛏', cfg.oreColor)
  placeNodes('herb',      nodeCount.herb,      '✿', cfg.herbColor)
  placeNodes('mob_spawn', nodeCount.mob_spawn, '×', '#ff4444')
  placeNodes('boss_lair', nodeCount.boss_lair, '☠', '#ff8000')

  // Step 5: scatter flat ground-clutter props on land tiles (Phase D). Deterministic
  // per tile via seededRand, density + weighted kind pool per biome (BIOME_PROPS).
  const pcfg = BIOME_PROPS[zoneId]
  const props: MapProp[] = []
  for (let r = 0; r < MAP_SIZE; r++) {
    for (let c = 0; c < MAP_SIZE; c++) {
      const t = tiles[r][c].type
      if (t === 'water' || t === 'cliff') continue
      const k = r * MAP_SIZE + c
      if (seededRand(seed + 300, k) >= pcfg.density) continue
      const kind = pcfg.kinds[Math.floor(seededRand(seed + 400, k) * pcfg.kinds.length)]
      props.push({ x: c, y: r, artId: kind })
    }
  }

  // Step 6: scatter tall depth-sorted scenery (trees, boulders, spires, mounds, ruins).
  // Sparse; never on water/cliff or on a node tile. REEDS require a water neighbour so
  // they read as bank vegetation. Deterministic per tile.
  const scfg = BIOME_SCENERY[zoneId]
  const nodeSet = new Set(nodes.map(n => n.y * MAP_SIZE + n.x))
  const isWater = (r: number, c: number) =>
    r >= 0 && r < MAP_SIZE && c >= 0 && c < MAP_SIZE && tiles[r][c].type === 'water'
  const scenery: MapScenery[] = []
  for (let r = 0; r < MAP_SIZE; r++) {
    for (let c = 0; c < MAP_SIZE; c++) {
      const t = tiles[r][c].type
      if (t === 'water' || t === 'cliff') continue
      const k = r * MAP_SIZE + c
      if (nodeSet.has(k)) continue
      if (seededRand(seed + 500, k) >= scfg.density) continue
      const kind = scfg.kinds[Math.floor(seededRand(seed + 600, k) * scfg.kinds.length)]
      if (kind === SCENERY_KIND.REEDS &&
          !(isWater(r - 1, c) || isWater(r + 1, c) || isWater(r, c - 1) || isWater(r, c + 1))) continue
      scenery.push({ x: c, y: r, kind })
    }
  }

  // Step 7: a few structure landmarks (hut / watchtower / ruined arch) — rare and
  // well-separated so they read as landmarks, not clutter. Ruined biomes get ruins.
  const landCfg = BIOME_LANDMARK[zoneId]
  let lmPlaced = 0, lmAttempts = 0
  const minSep = 10
  while (lmPlaced < landCfg.count && lmAttempts < 60) {
    const li = lmAttempts++
    const r = Math.floor(seededRand(seed + 700, li) * MAP_SIZE)
    const c = Math.floor(seededRand(seed + 800, li) * MAP_SIZE)
    const t = tiles[r][c].type
    if (t === 'water' || t === 'cliff') continue
    if (nodeSet.has(r * MAP_SIZE + c)) continue
    // keep landmarks apart from each other
    if (scenery.some(s => s.kind >= SCENERY_KIND.HUT &&
        Math.abs(s.x - c) < minSep && Math.abs(s.y - r) < minSep)) continue
    const kind = landCfg.kinds[Math.floor(seededRand(seed + 900, li) * landCfg.kinds.length)]
    scenery.push({ x: c, y: r, kind })
    lmPlaced++
  }

  // Step 7b: canopy giants. Same placement discipline as the structures above and
  // deliberately sharing their separation test — `kind >= SCENERY_KIND.HUT` covers both
  // groups, so running this pass second keeps giants apart from each other AND stops an
  // oak growing up through a watchtower. A tighter spacing than the structures get: a
  // grove of three reads as forest, whereas three towers in sight of each other read as a
  // mistake.
  const canopyCfg = BIOME_CANOPY[zoneId]
  let cpPlaced = 0, cpAttempts = 0
  const canopySep = 7
  while (cpPlaced < canopyCfg.count && cpAttempts < 160) {
    const ci = cpAttempts++
    const r = Math.floor(seededRand(seed + 1100, ci) * MAP_SIZE)
    const c = Math.floor(seededRand(seed + 1200, ci) * MAP_SIZE)
    const t = tiles[r][c].type
    if (t === 'water' || t === 'cliff') continue
    if (nodeSet.has(r * MAP_SIZE + c)) continue
    if (scenery.some(s => s.kind >= SCENERY_KIND.HUT &&
        Math.abs(s.x - c) < canopySep && Math.abs(s.y - r) < canopySep)) continue
    const kind = canopyCfg.kinds[Math.floor(seededRand(seed + 1300, ci) * canopyCfg.kinds.length)]
    scenery.push({ x: c, y: r, kind })
    cpPlaced++
  }

  // Step 8: reachability pass. Build the walkable mask (which seals off small pockets)
  // and pull any node that landed inside one back onto reachable ground. Steps 4 and 6
  // only check the tile itself, so a node can sit on perfectly good land that happens to
  // be a 3-tile island — reachable in neither direction.
  const zoneMap: ZoneMap = { tiles, nodes, props, scenery }
  relocateStrandedNodes(buildWalkMask(zoneMap), nodes)
  return zoneMap
}
