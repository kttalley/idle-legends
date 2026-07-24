// Walkability: the single source of truth for "can something stand here".
//
// Lives in engine/, not render/, because BOTH position systems need it:
//   • the store's `playerMapPos` drift (gameStore.tick) — it feeds node proximity, so a
//     logical position sitting in a lake would silently trigger auto-gather from water;
//   • the renderer's `player.tx/ty` and every mob/ambient entity.
// Applying it to only one of them lets the two desync.
//
// Coordinates here are always GAME tile coords (0..63, torus-wrapped). The renderer works
// in PAD-offset buffer coords and converts at the boundary.

import { SCENERY_KIND, type ZoneMap, type ZoneId, type TileType } from '../data/types'

export const MAP_SIZE = 64

/**
 * Tiles nothing can walk on.
 *
 * `rock` is deliberately NOT here. It looks like an obstacle and it is raised by the
 * elevation pass, but it is a biome *terrain patch* emitted by `pickTerrain`, not a
 * discrete object — blocking it shatters the map. Measured over all 12 zones' real
 * generateZoneMap output (torus flood fill, share of walkable tiles in the largest
 * connected component):
 *
 *   water              → worst zone 10 components, largest 98.9%   ✅
 *   water + cliff      → worst zone  7 components, largest 99.1%   ✅  (this set)
 *   water + cliff+rock → ironcrag_badlands 78 components, largest 23.3%, 5 nodes
 *                        stranded on blocked tiles                  ❌
 */
export const BLOCKED_TILES: ReadonlySet<TileType> = new Set<TileType>(['water', 'cliff'])

/**
 * Scenery that occupies its tile. Split by whether you could plausibly step over it:
 * bushes, flowerbeds, reeds, stumps and low mounds are ground cover and stay walkable,
 * so the world does not turn into an obstacle course. Scenery density is only 1.6–3.0%
 * of land tiles and never lands on water/cliff/nodes (mapGen step 6), and these are
 * isolated single tiles, so blocking them cannot disconnect a region.
 *
 * Resource nodes are never blocked — they have to stay reachable to be gathered.
 */
const SOLID_SCENERY: ReadonlySet<number> = new Set<number>([
  SCENERY_KIND.TREE, SCENERY_KIND.ROCK_BIG, SCENERY_KIND.PINE, SCENERY_KIND.BOULDER,
  SCENERY_KIND.SPIRE, SCENERY_KIND.PILLAR, SCENERY_KIND.DEADTREE,
  SCENERY_KIND.HUT, SCENERY_KIND.TOWER, SCENERY_KIND.ARCH,
])

/** Components smaller than this are sealed off — see buildWalkMask. */
const MIN_REGION = 24

export function wrapTile(v: number): number {
  return ((v % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
}

/** Shortest signed delta a→b across the torus. */
export function wrapDelta(a: number, b: number): number {
  let d = a - b
  d = ((d % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
  if (d > MAP_SIZE / 2) d -= MAP_SIZE
  return d
}

/**
 * Build the 64×64 walkable mask (1 = walkable) for a zone.
 *
 * After marking blocked tiles it SEALS small pockets: a torus flood fill labels the
 * connected walkable regions and anything under MIN_REGION tiles is marked blocked too.
 * Without this, venom_hollows (6 pockets under 20 tiles) and thornvale_jungle can strand
 * a hero or a mob on a private island with no way out and no way in. Sealing also makes
 * the mask single-component by construction, so `nearestWalkable` can never hand back a
 * tile that is unreachable from everywhere else.
 */
export function buildWalkMask(zm: ZoneMap): Uint8Array {
  const mask = new Uint8Array(MAP_SIZE * MAP_SIZE)
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = zm.tiles[y]?.[x]?.type
      mask[y * MAP_SIZE + x] = t && BLOCKED_TILES.has(t) ? 0 : 1
    }
  }
  for (const sc of zm.scenery ?? []) {
    if (SOLID_SCENERY.has(sc.kind)) mask[wrapTile(sc.y) * MAP_SIZE + wrapTile(sc.x)] = 0
  }

  // Label regions (torus-aware, 4-neighbour), then seal every small one.
  const label = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1)
  const regions: number[][] = []
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s] !== -1) continue
    const id = regions.length
    const cells: number[] = []
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()!
      cells.push(i)
      const x = i % MAP_SIZE, y = (i / MAP_SIZE) | 0
      for (let d = 0; d < 4; d++) {
        const nx = wrapTile(x + (d === 0 ? 1 : d === 1 ? -1 : 0))
        const ny = wrapTile(y + (d === 2 ? 1 : d === 3 ? -1 : 0))
        const ni = ny * MAP_SIZE + nx
        if (!mask[ni] || label[ni] !== -1) continue
        label[ni] = id
        stack.push(ni)
      }
    }
    regions.push(cells)
  }
  // Always keep the largest region even if the map is pathologically fragmented.
  let biggest = -1, biggestN = -1
  for (let i = 0; i < regions.length; i++) {
    if (regions[i].length > biggestN) { biggestN = regions[i].length; biggest = i }
  }
  for (let i = 0; i < regions.length; i++) {
    if (i === biggest || regions[i].length >= MIN_REGION) continue
    for (const c of regions[i]) mask[c] = 0
  }
  return mask
}

// One mask per zone; zone maps are generated deterministically and never mutated, so a
// plain cache keyed by zone id is safe for the process lifetime.
const maskCache = new Map<ZoneId, Uint8Array>()

export function getWalkMask(zoneId: ZoneId, zm: ZoneMap): Uint8Array {
  let m = maskCache.get(zoneId)
  if (!m) { m = buildWalkMask(zm); maskCache.set(zoneId, m) }
  return m
}

/** Walkable test at a (possibly fractional, possibly out-of-range) game coord. */
export function isWalkable(mask: Uint8Array, x: number, y: number): boolean {
  const gx = wrapTile(Math.floor(x))
  const gy = wrapTile(Math.floor(y))
  return mask[gy * MAP_SIZE + gx] === 1
}

/**
 * Nearest walkable tile centre to (x, y), by expanding ring search. Used to rescue a
 * position that starts blocked — the zone spawn point (32,32) is itself on a blocked
 * tile in grimshade_forest and venom_hollows, so this is not a theoretical case.
 */
export function nearestWalkable(mask: Uint8Array, x: number, y: number): { x: number; y: number } {
  const sx = wrapTile(Math.floor(x))
  const sy = wrapTile(Math.floor(y))
  if (mask[sy * MAP_SIZE + sx] === 1) return { x, y }
  for (let r = 1; r <= MAP_SIZE / 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring only
        const nx = wrapTile(sx + dx), ny = wrapTile(sy + dy)
        if (mask[ny * MAP_SIZE + nx] === 1) return { x: nx + 0.5, y: ny + 0.5 }
      }
    }
  }
  return { x, y } // no walkable tile anywhere — caller keeps its position
}

/**
 * Pull any node that ended up outside the walkable region onto the nearest tile inside
 * it, and return how many moved. mapGen already refuses to place a node on water or
 * cliff, but it can still drop one on a small land island that pocket-sealing then
 * closes — a resource node you can never reach is dead content, and a boss_lair behind
 * one would be a hard progression block. Nodes are nudged rather than deleted so the
 * zone keeps its intended node count.
 */
export function relocateStrandedNodes(mask: Uint8Array, nodes: { x: number; y: number }[]): number {
  const taken = new Set<number>()
  for (const n of nodes) taken.add(wrapTile(n.y) * MAP_SIZE + wrapTile(n.x))
  let moved = 0
  for (const n of nodes) {
    const here = wrapTile(n.y) * MAP_SIZE + wrapTile(n.x)
    if (mask[here] === 1) continue
    taken.delete(here)
    const sx = wrapTile(n.x), sy = wrapTile(n.y)
    let placed = false
    for (let r = 1; r <= MAP_SIZE / 2 && !placed; r++) {
      for (let dy = -r; dy <= r && !placed; dy++) {
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const nx = wrapTile(sx + dx), ny = wrapTile(sy + dy)
          const ni = ny * MAP_SIZE + nx
          if (mask[ni] !== 1 || taken.has(ni)) continue
          n.x = nx; n.y = ny
          taken.add(ni)
          placed = true
          moved++
        }
      }
    }
    if (!placed) taken.add(here) // nowhere to go; leave it where it was
  }
  return moved
}

/**
 * Can you walk the straight segment a→b without touching blocked ground? Samples at
 * half-tile steps. Used to string-pull an A* result down to a few real waypoints, so
 * movement reads as walking rather than tracing grid cells.
 */
export function hasLineOfWalk(mask: Uint8Array, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = wrapDelta(bx, ax), dy = wrapDelta(by, ay)
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2)
  if (steps === 0) return isWalkable(mask, ax, ay)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!isWalkable(mask, ax + dx * t, ay + dy * t)) return false
  }
  return true
}

/**
 * A* across the torus, 8-connected, returning smoothed tile-centre waypoints from (but
 * excluding) the start, or null if unreachable. Diagonals may not cut a corner between
 * two blocked tiles.
 *
 * Grid is 64×64 = 4096 nodes, so this is microseconds; it runs on a tap or a mob spawn,
 * never per frame. Collide-and-slide is the per-frame primitive — sliding alone wedges
 * against any concave shoreline, which is precisely the "hero stuck on the lake edge"
 * failure this exists to fix.
 */
export function findPath(
  mask: Uint8Array, fromX: number, fromY: number, toX: number, toY: number,
): { x: number; y: number }[] | null {
  const start = wrapTile(Math.floor(fromY)) * MAP_SIZE + wrapTile(Math.floor(fromX))
  const goalPt = nearestWalkable(mask, toX, toY)
  const goal = wrapTile(Math.floor(goalPt.y)) * MAP_SIZE + wrapTile(Math.floor(goalPt.x))
  if (start === goal) return []
  if (mask[start] !== 1) return null

  const n = MAP_SIZE * MAP_SIZE
  const g = new Float32Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const gx = goal % MAP_SIZE, gy = (goal / MAP_SIZE) | 0

  // Octile heuristic over the torus.
  const h = (i: number) => {
    const dx = Math.abs(wrapDelta(i % MAP_SIZE, gx))
    const dy = Math.abs(wrapDelta((i / MAP_SIZE) | 0, gy))
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy)
  }

  // Binary min-heap of (f, node).
  const heapF: number[] = [], heapN: number[] = []
  const push = (f: number, node: number) => {
    heapF.push(f); heapN.push(node)
    let i = heapF.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heapF[p] <= heapF[i]) break
      ;[heapF[p], heapF[i]] = [heapF[i], heapF[p]]
      ;[heapN[p], heapN[i]] = [heapN[i], heapN[p]]
      i = p
    }
  }
  const pop = (): number => {
    const top = heapN[0]
    const lf = heapF.pop()!, ln = heapN.pop()!
    if (heapF.length) {
      heapF[0] = lf; heapN[0] = ln
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let s = i
        if (l < heapF.length && heapF[l] < heapF[s]) s = l
        if (r < heapF.length && heapF[r] < heapF[s]) s = r
        if (s === i) break
        ;[heapF[s], heapF[i]] = [heapF[i], heapF[s]]
        ;[heapN[s], heapN[i]] = [heapN[i], heapN[s]]
        i = s
      }
    }
    return top
  }

  g[start] = 0
  push(h(start), start)
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
  let found = false
  while (heapN.length) {
    const cur = pop()
    if (cur === goal) { found = true; break }
    if (closed[cur]) continue
    closed[cur] = 1
    const cx = cur % MAP_SIZE, cy = (cur / MAP_SIZE) | 0
    for (const [dx, dy] of DIRS) {
      const nx = wrapTile(cx + dx), ny = wrapTile(cy + dy)
      const ni = ny * MAP_SIZE + nx
      if (mask[ni] !== 1 || closed[ni]) continue
      if (dx !== 0 && dy !== 0) {
        // No corner-cutting: both orthogonal neighbours must be open.
        if (mask[wrapTile(cy) * MAP_SIZE + wrapTile(cx + dx)] !== 1) continue
        if (mask[wrapTile(cy + dy) * MAP_SIZE + wrapTile(cx)] !== 1) continue
      }
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1
      const ng = g[cur] + step
      if (ng >= g[ni]) continue
      g[ni] = ng
      came[ni] = cur
      push(ng + h(ni), ni)
    }
  }
  if (!found) return null

  // Reconstruct, then string-pull: keep a waypoint only where the straight line from the
  // last kept point would clip something.
  const raw: number[] = []
  for (let i = goal; i !== -1 && i !== start; i = came[i]) raw.push(i)
  raw.reverse()
  const pt = (i: number) => ({ x: (i % MAP_SIZE) + 0.5, y: ((i / MAP_SIZE) | 0) + 0.5 })
  const out: { x: number; y: number }[] = []
  let anchorX = fromX, anchorY = fromY
  for (let i = 0; i < raw.length; i++) {
    const p = pt(raw[i])
    const isLast = i === raw.length - 1
    const next = isLast ? null : pt(raw[i + 1])
    if (isLast || !next || !hasLineOfWalk(mask, anchorX, anchorY, next.x, next.y)) {
      out.push(p)
      anchorX = p.x; anchorY = p.y
    }
  }
  return out
}

/**
 * Move from (x, y) by (dx, dy) with collide-and-slide: each axis is applied only if it
 * lands somewhere walkable, so brushing a shoreline slides along it instead of stopping
 * dead. Returns the resolved position plus whether anything was blocked (callers use
 * that to retarget a wander).
 *
 * This is the per-frame primitive for continuous movers. Deliberate destinations across
 * an obstacle need a real path — that's the A* pass, not this.
 */
export function moveWithCollision(
  mask: Uint8Array, x: number, y: number, dx: number, dy: number,
): { x: number; y: number; blocked: boolean } {
  let nx = x, ny = y
  let blocked = false
  if (dx !== 0) {
    if (isWalkable(mask, x + dx, y)) nx = x + dx
    else blocked = true
  }
  if (dy !== 0) {
    if (isWalkable(mask, nx, y + dy)) ny = y + dy
    else blocked = true
  }
  return { x: nx, y: ny, blocked }
}
