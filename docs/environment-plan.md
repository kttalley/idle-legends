# Environment Plan — Tile Variety, Props, Animated Ground

A presentation-layer pass to give the dimetric world environmental variety: per-zone biome
identity, a prop/object layer, and animated ground tiles. **Game logic is untouched.** All art
is original placeholder art authored programmatically (the `src/render/placeholderArt.ts`
pattern) — the FFTA decomp is read-only reference for *technique and structure only*; no
pixels, palettes, constants, tables, or assets are carried over from it (see
`docs/graphics-spec.md` §0 and `PLAN.md` "Reference repo" rule).

This document is self-contained: a fresh context can execute it without prior conversation.

---

## 1. Current state (how ground works today)

- **Ground is baked ONCE per zone into a static offscreen canvas**, painter's-order
  back-to-front with elevation skirts. `Scene.render` blits that one canvas per frame.
  - `bakeGround(map, tileset, paletteId, palette)` — `src/render/tilemap.ts:87` (returns
    `GroundBuffer`; `return` at `:157`). Constants `TILE_W=32, TILE_H=16, HALF_W/H` at `:10-13`.
    `feetX/feetY` (height-aware) at `:60-66`.
  - Bake is triggered only on zone change — `combatAdapter.ts` `sync()`, search
    `this.ground = bakeGround(` (currently ~`:354`).
  - Per-frame blit — `src/render/scene.ts:84` (`ctx.drawImage(ground.canvas, …)`).
- **Tiles are single-frame.** `makeTileset()` (`src/render/placeholderArt.ts:228`) authors
  6 frames: `TILE = { GRASS:0, GRASS_ALT:1, WATER:2, WATER_ALT:3, CLIFF:4, PATH:5 }`
  (`:284`). Water has **2 authored frames (2 and 3)** but the `animations` field is `still(0)`
  (`:280`) — a single-frame loop, so the second water frame is never used. `fillDiamond`
  helper at `:212` paints a tile frame from a per-pixel slot function.
- **Tile-type variety is minimal.** `TileType = 'terrain' | 'water' | 'cliff' |
  'resource_ore' | 'resource_herb'` (`src/data/types.ts:357`). `tileToFrame()`
  (`src/render/adapter/mapAdapter.ts:31`) collapses everything but water/cliff to `GRASS` /
  `GRASS_ALT` (30% hash). `resource_ore`/`resource_herb` never appear on tiles (they are
  nodes, `mapAdapter.ts:37-39` comment).
- **Props are a flat overlay, not baked, not depth-sorted.** `combatAdapter.drawNodes(g)`
  (search `private drawNodes`, currently ~`:734`) draws ore/herb/mob_spawn/boss_lair markers
  each frame as 4px diamonds + a 7px glyph directly on the main canvas, **on top of the ground
  blit and on top of entities** (called after `this.scene.render`, currently ~`:674`). Nodes
  come from `ZoneMap.nodes: MapNode[]` (`src/data/types.ts:365, 371-373`) = `{x, y, type, icon,
  color}` — scatter points, no art, no footprint.
- **Biome palettes are stubbed to one.** `BIOME_PALETTE` (`src/render/adapter/mapAdapter.ts:95`)
  maps all 12 zones → `'biome/map080'`. Three derived palettes exist but are unused:
  `biome/meadow` (alias of map080), `biome/ashen`, `biome/gloom`
  (`src/render/palettes.ts:121-129`, composed from `biome/map080` via `composePalette`).
  Comment at `mapAdapter.ts:93-94`: "Per-zone biome variety is a Phase 4 pass."
- **Scene animates entities, not tiles.** `Animator` (`src/render/animation.ts`) advances a
  frame index per entity per frame. The ground is one static `drawImage`. The graphics spec
  explicitly calls out "only animated tiles (water shimmer, etc.) get periodic tile swaps"
  (`docs/graphics-spec.md`, search "animated tiles") as the intended model — not yet
  implemented. It also recommends "overhang/foreground props kept as depth-sorted entities so
  they sort in front of units by screen-Y" (search "foreground props") — also not implemented.
- **Zone generation** is `generateZoneMap(zoneId)` (`src/engine/mapGen.ts:194`), driven by
  `BIOME_MAP_CONFIGS` (`:28`, a `Record<ZoneId, BiomeMapConfig>` with `waterDensity`,
  `terrainChars/terrainColor`, `cliffChars/cliffColor`, …). CA terrain → places 4 ore + 4 herb
  + 3 mob_spawn + 1 boss_lair nodes on terrain tiles. The 12 configs already have distinct
  colors used by the *legacy ASCII* renderer; the dimetric renderer ignores them.

`TileMapData` shape (`src/render/types.ts:51`): `{ w, h, tiles: Uint8Array, heights?: Uint8Array }`.
`ZoneMap` shape (`src/data/types.ts:371`): `{ tiles: MapTile[][], nodes: MapNode[] }` where
`MapTile = { type: TileType, … }` (`:359`).

---

## 2. The FFTA reference model (technique only — do NOT copy assets)

Studied in `../ff-tactics-decomp` (read-only). The transferable ideas:

1. **Two-layer tile map:** BG0 = terrain, BG1 = props. Each 64×64 grid of u16 tile entries
   with per-cell `hflip | vflip | palbank` bits. Terrain under units; props under units **unless**
   a per-cell "top-layer behaviour" flag says the prop draws **in front** of units for depth.
2. **Tile animation via VRAM-slot swap:** each map carries an `anims` array of
   `{slot, frames:[{dur, gfx_off}]}`. A timer swaps the current frame's pixels into a target
   tile slot; the screenblock still references that slot, so the map "animates" in place.
   ~83 of 162 maps are animated. (Client-side equivalent in the decomp's viewer: a 100 ms
   `setInterval` clock swaps anim frames into a composite buffer.)
3. **Prop depth occlusion:** the "top-layer behaviour" flag is how a tree/crystal can stand in
   front of a unit that walks behind it — the prop sorts by screen-Y against units.

We re-implement these *behaviors* with original art and our existing palette-indexed Canvas
pipeline. No FFTA palettes, tile pixels, map data, or constants are used.

---

## 3. Phased plan

Phases are independent enough to land separately; commit at each gate and show the result.
Recommended order: **A → B → C → D → E** (A and B give the biggest visual jump for the least
effort; C unlocks per-biome variety for D/E).

### Phase A — Per-zone biome palettes  *(lowest effort, high impact)*

**Goal:** the 12 zones stop sharing one grassland palette; each biome reads distinct.

**Approach:**
- In `src/render/palettes.ts`, register 4-6 more biome palettes by `composePalette`-ing
  `biome/map080` with biome-appropriate slot overrides, following the existing
  `biome/ashen`/`biome/gloom` pattern (`:122-129`). Group them by zone character:
  meadow/forest (greens), jungle (deep green), badlands/mesa (red-rock), ashfire/cinderfall
  (charcoal+ember), wastes/plains (pale dust), maw/venom/grimshade (sickly green-purple), snow
  (cool gray-white) as taste dictates. Keep `biome/map080` as the default.
- In `src/render/adapter/mapAdapter.ts`, replace the `BIOME_PALETTE` table (`:95-108`) so each
  of the 12 `ZoneId` keys maps to its chosen palette id. `biomePaletteId()` (`:110`) is already
  wired through `bakeGround` → `bakedSheet`, so no other change is needed — the palette swap is
  free because tiles are palette-indexed.

**Touch:** `src/render/palettes.ts`, `src/render/adapter/mapAdapter.ts`.
**Verify:** travel through 3-4 zones; ground palette changes per zone. No game-logic diff.
**Effort:** ~30-50 lines.

### Phase B — Animate water via per-frame tile reblit  *(medium effort, high impact)*

**Goal:** water shimmers. The second water frame (`TILE.WATER_ALT`) is already authored but
unused; this wires it up the FFTA way (slot-swap), without rebaking the whole ground.

**Approach:**
- Add an optional `anims` field to `TileMapData` (`src/render/types.ts:51`), mirroring FFTA's
  shape but in our terms:
  `anims?: { tileX: number; tileY: number; frames: number[]; dur: number }[]`
  (one entry per animated *cell*, listing tileset frame indices to cycle and the frame
  duration in seconds). Keep it cell-based (not slot-based) since our bake is per-cell.
- In `bakeGround` (`src/render/tilemap.ts:87`), while iterating tiles, when a cell's frame is
  `TILE.WATER` (or any frame flagged animated), push an entry into `anims` recording that
  cell's **buffer (bx, by)** and the cycle `[TILE.WATER, TILE.WATER_ALT]` at ~0.4s. Store the
  `anims` array on the `GroundBuffer` returned (add the field to `GroundBuffer`).
- In `Scene.render` (`src/render/scene.ts`), **after** the ground blit (`:84`), reblit just the
  animated cells' current frames. Advance a single shared elapsed accumulator (or per-anim
  cursor) by `dt`; for each anim cell, `drawImage` the tileset frame (via the same
  `bakedSheet(tileset, paletteId, palette)` cache already used for entities) into the cell's
  screen rect, clipped to the camera. Keep it to water cells only — the count is small.
  - The tileset is already a `IndexedSprite`; reuse `bakedSheet` to get the paletted sheet
    canvas. The cell's screen position comes from the same `feetX/feetY` projection used in
    `bakeGround` — factor that out if not already shared.
- A small `TileAnimator` (or a `elapsed` field on `GroundBuffer` advanced in `Scene.update`)
  is cleaner than reusing the per-entity `Animator`. Model the clock on the spec's "periodic
  tile swaps" intent, not the decomp's exact timer.

**Touch:** `src/render/types.ts`, `src/render/tilemap.ts` (`bakeGround`, `GroundBuffer`),
`src/render/scene.ts` (`render`), possibly `src/render/adapter/mapAdapter.ts` (mark water
cells animated when building the `TileMapData`).
**Verify:** water tiles visibly cycle between the two frames; the rest of the ground stays
static (one blit + a handful of cell reblits). No perf cliff (anim cell count is small and
bounded by the viewport — cull off-screen anim cells).
**Effort:** ~80-120 lines.

### Phase C — More tile types + biome-flavored generation  *(medium effort, medium impact)*

**Goal:** each biome leans on a distinct tile set (sand, rock, snow, moss, path variants),
not just grass/water/cliff.

**Approach:**
- Extend `TILE` (`src/render/placeholderArt.ts:284`) with new frame indices (e.g. `SAND, ROCK,
  SNOW, MOSS, PATH_ALT, FLOWER`) and paint them in `makeTileset()` (`:228`) using
  `fillDiamond` (`:212`) — original art, palette-indexed, same 32×24 frame convention (bottom
  16 = ground diamond, top 8 = raised detail) as existing tiles.
- Extend `TileType` (`src/data/types.ts:357`) and `tileToFrame()`
  (`src/render/adapter/mapAdapter.ts:31`) so each new type maps to a frame.
- Extend `BIOME_MAP_CONFIGS` (`src/engine/mapGen.ts:28`) and `generateZoneMap()` (`:194`) so
  each biome emits its characteristic tile types (e.g. ashfire → rock + ember patches; snow
  zone → snow; jungle → moss). This is the one place game-data changes are needed, and it is
  generation-only (no combat/economy logic).
- `resource_ore` / `resource_herb` stay as **nodes** (Phase D/E gives them art), not tile
  types — keep the existing `mapAdapter.ts:37-39` policy.

**Touch:** `src/render/placeholderArt.ts`, `src/data/types.ts`, `src/render/adapter/mapAdapter.ts`,
`src/engine/mapGen.ts`.
**Verify:** zones show distinct terrain textures; save data still loads (new tile types must
  be forward-compatible — old saves with only `terrain|water|cliff` must still render; default
  unknown types to `GRASS` in `tileToFrame`).
**Effort:** ~150-250 lines.

### Phase D — Baked flat prop/scatter layer  *(medium-high effort, high impact)*

**Goal:** grass tufts, pebbles, flowers, small crystals — ground clutter that never needs to
occlude a unit — baked into the ground buffer so it's free at runtime.

**Approach:**
- Add a prop sheet: a new `makePropSheet()` in `src/render/placeholderArt.ts` returning an
  `IndexedSprite` of small (≤ one tile footprint) original prop frames (tuft, pebble, flower,
  crystal, mushroom, bone, cattail…), palette-indexed so biome palettes tint them too.
- Add a `props?: { x: number; y: number; artId: number }[]` field to `ZoneMap`
  (`src/data/types.ts:371`) (or reuse `nodes` for the resource props — see below).
- In `generateZoneMap()` (`src/engine/mapGen.ts:194`), scatter flat props onto terrain tiles
  deterministically (hash-seeded, no `Math.random` — match the existing `hashTile` discipline
  in `mapAdapter.ts:25`). Density per biome via `BIOME_MAP_CONFIGS`.
- In `bakeGround()` (`src/render/tilemap.ts:87`), after the terrain loop and **before the
  `return` at `:157`**, stamp the prop sheet frames at their tile positions, painter's-order
  with the terrain (so a prop on a higher tile draws in front of lower tiles behind it). Props
  are under units (no depth sort) — correct for ground clutter.
- Pass the prop sheet + props into `bakeGround` (extend its signature, or pass via the
  `TileMapData`/a new arg). Update the one call site in `combatAdapter.ts` `sync()`.

**Touch:** `src/render/placeholderArt.ts`, `src/data/types.ts`, `src/engine/mapGen.ts`,
`src/render/tilemap.ts`, `src/render/adapter/combatAdapter.ts` (call site only).
**Verify:** ground has non-repeating clutter; units walk over it without z-fighting; rebake
only on zone change (no per-frame cost).
**Effort:** ~200-300 lines.

### Phase E — Props as depth-sorted entities (FFTA "prop-in-front")  *(highest effort, highest impact)*

**Goal:** tall props (trees, rocks, structures, crates, crystal clusters) that a unit can walk
behind — depth-sorted against units by screen-Y, exactly what the spec's "foreground props"
note prescribes. Replaces the flat `drawNodes` glyph overlay with real prop sprites at
ore/herb/boss_lair nodes.

**Approach:**
- Author a tall-prop sheet (`makePropEntities()` in `src/render/placeholderArt.ts`):
  `IndexedSprite`s with a feet anchor (`anchor: {x, y}` at the tile diamond's feet) so the
  scene's painter sort places them correctly. Trees/rocks/crystals/structures, original art.
- In `combatAdapter.sync()`, after the zone bake, `scene.spawn(propSprite, paletteId, tx, ty)`
  (search `this.scene.spawn` — pattern at `:236` for the player) for each node/tall-prop,
  giving them `e.shadow = false` (or a small prop shadow) and a still animation. Keep handles
  on the `Entity[]` so they can be retired on zone change (set `active = false` like the mob
  does in `sync()`).
- Replace `drawNodes()` (search `private drawNodes` in `combatAdapter.ts`) with the spawned
  prop entities for ore/herb/boss_lair/mob_spawn. Keep a minimal fallback glyph only for any
  node type without a prop sprite. Props now sort with the player/mob by screen-Y → a unit
  walking "above" a tree is occluded by it, "below" it draws in front (FFTA BG1-in-front
  behaviour).
- Respect FFTA's two-tier rule: **flat** clutter (Phase D) stays baked/under-units; **tall**
  props (Phase E) are entities that can occlude. Don't make every prop an entity — only the
  ones that need depth.

**Touch:** `src/render/placeholderArt.ts`, `src/render/adapter/combatAdapter.ts` (`sync`,
retire-on-zone-change, replace `drawNodes`), `src/engine/mapGen.ts` (mark which props are tall
vs flat), `src/data/types.ts` (prop kind field if needed).
**Verify:** walk behind/in front of a tree — occlusion flips correctly with screen-Y; node
markers are gone (replaced by props); zone change cleanly retires old props.
**Effort:** ~400-600 lines.

---

## 4. Constraints / guardrails

- **Original art only.** All new tiles/props are drawn programmatically in
  `src/render/placeholderArt.ts` using the `Painter`/`fillDiamond` pattern, palette-indexed.
  Nothing (pixels, palettes, constants, tables, map data) is copied from the decomp.
- **Game logic untouched.** The renderer reads existing Zustand state through the adapter.
  The only game-data changes are in `src/engine/mapGen.ts` (generation) and `src/data/types.ts`
  (type/field additions) — no combat, economy, save, or store-tick logic changes.
- **Save compatibility.** New tile types and optional `ZoneMap.props` must be
  forward-compatible: old saves (only `terrain|water|cliff`, no `props`) must still load and
  render. `tileToFrame` must default unknown types to `GRASS`. `generateZoneMap` must
  backfill `props: []` for old zone maps.
- **Palette-indexed, palette-swappable.** New tiles/props use slot indices, not colors, so
  Phase A's biome palettes tint them automatically. No hardcoded hex in tile/prop art.
- **Deterministic.** No `Date.now()` / `Math.random()` in baking or generation — use the
  existing `hashStr`/`hashTile` discipline (`mapAdapter.ts:25`, `mapGen.ts:6`) so bakes and
  prop scatter are stable across reloads.
- **Static bake + cheap per-frame.** Keep the "bake once per zone, one blit per frame"
  invariant. Phase B adds only a bounded set of animated-cell reblits (cull off-screen).
  Phase D adds zero per-frame cost (baked). Phase E adds entity draw cost proportional to
  visible tall props — keep tall-prop counts modest per zone.
- **No new runtime frameworks.** Vanilla Canvas 2D inside the existing imperative adapter.

---

## 5. Key symbol reference (current locations — verify by grep, lines drift)

| Symbol | File | Where |
|---|---|---|
| `bakeGround`, `feetX/feetY`, `GroundBuffer`, `TILE_W/H` | `src/render/tilemap.ts` | `:87`, `:60-66`, `:157`, `:10-13` |
| `makeTileset`, `TILE`, `fillDiamond`, `still` | `src/render/placeholderArt.ts` | `:228`, `:284`, `:212`, `:280` |
| `tileToFrame`, `BIOME_PALETTE`, `biomePaletteId`, `bumpHeight`, `zoneMapToTileMap` | `src/render/adapter/mapAdapter.ts` | `:31`, `:95`, `:110`, `:50`, `:76` |
| ground bake call site, `drawNodes`, `scene.render`, `scene.spawn` | `src/render/adapter/combatAdapter.ts` | `this.ground = bakeGround(`, `private drawNodes`, `this.scene.render`, `this.scene.spawn` |
| `Scene.render` ground blit, `Scene.spawn` | `src/render/scene.ts` | `:84`, `spawn` |
| `TileMapData` | `src/render/types.ts` | `:51` |
| `Animator` (entity anim; not directly reusable for tiles) | `src/render/animation.ts` | class |
| `TileType`, `MapTile`, `MapNode`, `ZoneMap` | `src/data/types.ts` | `:357`, `:359`, `:365`, `:371` |
| `BIOME_MAP_CONFIGS`, `generateZoneMap` | `src/engine/mapGen.ts` | `:28`, `:194` |
| biome palettes (`map080`, `meadow`, `ashen`, `gloom`), `composePalette` | `src/render/palettes.ts` | `:112`, `:121-129`, import `:8` |

---

## 6. Execution order + commit gates

1. **Phase A** (biome palettes) → commit `feat: per-zone biome ground palettes` → show.
2. **Phase B** (water animation) → commit `feat: animated water tiles` → show.
3. **Phase C** (tile types + biome generation) → commit `feat: biome-flavored tile variety` → show.
4. **Phase D** (baked flat props) → commit `feat: baked ground clutter/props` → show.
5. **Phase E** (depth-sorted prop entities, replace `drawNodes`) → commit `feat: depth-sorted props, node art` → show.

Each phase is independently shippable. If timeboxed, A + B alone are a large visible win.