import type { ZoneId, ZoneMap, MapTile, MapNode, TileType } from '../data/types'

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

const MAP_SIZE = 64

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

export function generateZoneMap(zoneId: ZoneId): ZoneMap {
  const cfg  = BIOME_MAP_CONFIGS[zoneId]
  const seed = hashStr(zoneId)

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
          type = 'terrain'
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
      if (tiles[r][c].type === 'terrain') {
        nodes.push({ x: c, y: r, type, icon, color })
        placed++
      }
    }
  }

  placeNodes('ore',       nodeCount.ore,       '⛏', cfg.oreColor)
  placeNodes('herb',      nodeCount.herb,      '✿', cfg.herbColor)
  placeNodes('mob_spawn', nodeCount.mob_spawn, '×', '#ff4444')
  placeNodes('boss_lair', nodeCount.boss_lair, '☠', '#ff8000')

  return { tiles, nodes }
}
