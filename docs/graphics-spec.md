# Graphics System Spec — Dimetric, Palette-Indexed Renderer

Phase 0 output. This document captures the *architecture* of a GBA-era tactics renderer —
studied once from the reference decompilation — expressed in my own words, and translates it
into a plan for a vanilla Canvas 2D renderer for Stillmarch. It is knowledge, not code: no
data tables, constants, palette values, symbol names, or assets are carried over from the
reference. Where the reference only partially explains a mechanism, this spec says so and
falls back to documented, public GBA hardware behavior.

Everything here is written so Phase 1 (`src/render/*`) can be implemented directly against it.

---

## 0. Orientation — how a GBA-era engine actually draws a frame

Understanding the target renderer requires understanding the constraints the original design
answered, because those constraints are exactly what we get to *relax* in a browser.

The GBA composites a fixed 240×160 screen from two kinds of source:

- **Backgrounds (BG):** up to four tiled layers, each a grid of references into a shared bank
  of 8×8 tiles. This is the map/terrain and the HUD.
- **Objects (OBJ / sprites):** up to 128 hardware sprites, each a small rectangle of tiles,
  positioned freely. Units, monsters, weapons, cursors, and damage numbers are all OBJ.

Both draw from **indexed color**: every pixel is a 4-bit index (0–15) into a 16-color
sub-palette; index 0 is always transparent. Color itself lives in a separate small palette
memory as 15-bit BGR values. This indirection — pixels store *slots*, not colors — is the
single most important idea we adopt, because it is what makes palette-swapping free.

The reference engine follows a strict **build-then-flush** discipline: game logic never writes
graphics hardware directly. Each frame it writes RAM "shadow" copies of the display state (an
object list, background scroll, palette uploads queued as transfer records) and then, during
the vertical-blank interrupt, a single routine copies all of it to hardware at once. This
avoids tearing and bounds all hardware contact to one window. For us this maps cleanly onto
"mutate a plain-JS scene during the frame, then do all Canvas drawing in one `requestAnimationFrame`
pass" — the double-buffer discipline is already how a well-behaved Canvas loop works.

---

## 1. Sprite system

### 1.1 Tiles, cels, and the "metasprite"

The atomic unit of sprite art is the **8×8 tile** at 4 bits per pixel (16 colors, 32 bytes).
A single character is far bigger than one tile, so a logical sprite is a **metasprite**: a
small ordered list of hardware sprite "parts," each part being a rectangle of tiles (8×8,
8×16, 16×16, up to 64×64) placed at a signed (x, y) offset from the character's origin. A
humanoid in the reference is assembled from a handful of parts — a stack of tall body columns
plus small head/cap pieces — that together tile out a compact character rectangle a couple of
tiles wide and a few tiles tall.

The key structural facts, generalized:

- A **frame** (one drawn pose at one instant) is described by a *part list*: `count`, then
  per part an (x, y) offset, a shape/size class, and a tile index into the currently-loaded
  tile bank. The part list carries *no pixels* — only layout and which tiles to use.
- Crucially, **one part-list skeleton is shared across many characters.** In the reference,
  every humanoid standing pose reuses the *same* metasprite layout; only the underlying tile
  pixels and the palette differ per character. This is the decisive economy: geometry is
  authored once, identity comes from tiles + palette.
- Different *pose families* (standing/walking vs. attacking/casting) use *different*
  metasprite layouts, because an attack pose occupies a different silhouette. So the layout
  is a function of (pose family), not of (character).

### 1.2 How a character composites at runtime

The reference resolves a character to pixels through a short indirection chain, which is worth
internalizing because our system collapses it:

1. A unit's **type** indexes a class-definition table that yields a **graphic id** (plus a
   palette selector). Different races sharing one job get different graphic ids — the mapping
   is computed from (race, job), so it is deliberately *not* a flat 1-D table.
2. The **graphic id** indexes a metasprite/animation table → a **pose table** → a
   **frame script** (the animation: an ordered list of frame records, each carrying a tile-
   sheet offset, a tile count, and a selector for which metasprite layout that frame uses).
3. The current frame's **tiles** are copied ("DMA'd") from a raw tile region into the sprite
   tile bank at a per-unit base; the metasprite's tile indices are relative to that base.
4. The **metasprite layout** for the frame is `layout_base + frame.layout_offset` — i.e. the
   frame record itself selects the silhouette (humanoid vs. large unit vs. weapon/effect).
5. The metasprite builder walks the part list and emits hardware sprite entries, offsetting
   every part by the unit's screen (x, y), tile base, palette bank, priority, and flip flags.

The load-bearing takeaways for us:

- **Tiles and layout are decoupled from color.** Color is a separate per-unit "palette bank"
  argument applied at composite time, never baked into the frame.
- **Animation is "advance an offset."** Consecutive animation frames are stored as
  fixed-stride, contiguous runs in the tile region, so "frame N" is just
  `sheet_base + N × frame_stride`; adjacent frames share most of their bytes (the source we
  studied literally used that byte-similarity to auto-segment the region). We do not need this
  packing trick, but it confirms the mental model: an animation is a sheet of same-size frames
  played in order.

### 1.3 Facing directions and mirroring

Facing is expressed two ways, and the reference uses both:

- **Distinct poses per facing.** The pose table has multiple entries that correspond to
  facing directions (the reference's poses are effectively facings × animation), so some
  facings are genuinely different drawn art.
- **Hardware horizontal/vertical flip.** Each sprite part can be mirrored by a flip flag at
  composite time; the builder mirrors a part by reflecting its offset about the part's own
  width/height so the metasprite stays coherently assembled.

This is the exact hybrid we adopt in simplified form (§4): draw two facings, mirror them to
get the other two, so a "left-facing" sheet flips to "right-facing" for free.

### 1.4 Anchor / origin conventions

Every part offset is **signed and relative to a single per-character origin**, and the builder
translates the whole part list by the unit's world position. So a character has one anchor
point, and the art is authored around it. Practically the anchor sits at the character's
**ground contact / feet-center**, because:

- Depth sorting is by screen-Y of the ground point (§3.3), so the sort key must be the feet.
- Mirroring reflects about the part rectangle, so a centered horizontal origin keeps a flipped
  sprite standing in the same spot.

Units also carry a separate, shared **shadow** sprite under the feet, reinforcing that the
anchor is the ground point, not the art's bounding-box center.

---

## 2. Palette system

### 2.1 Indexed color and palette organization

Pixels are indices; colors live in a separate palette memory as 15-bit BGR values (5 bits per
channel). Sprite color memory is organized as **16 banks of 16 colors** (4bpp). A sprite part
names one bank; its pixel indices 0–15 select within that bank; index 0 is transparent. So a
sprite's entire appearance-color is "which 16-color bank," a single small number applied at
draw time.

The reference sources its per-character 16-color banks three ways, which generalize to two
patterns we care about:

- **Shared/system banks** loaded directly from a master table (UI, common elements).
- **Per-unit palette *sets*** pulled from a compressed archive: one archive entry decodes to a
  small group of consecutive banks that are loaded together for a unit. (The archive uses a
  custom dictionary compression; irrelevant to us — the *output* is just groups of 16-color
  banks.) The engine even keeps three display-tuned variants of every palette, one per output
  device gamma. We collapse that to a single variant.

### 2.2 How palette swaps produce unit and team variants

This is the mechanism the entire Stillmarch art strategy is built on, so it's worth stating
precisely how the reference does it:

- A unit's class-definition entry stores a **palette-set id** and a **slot/nibble** selecting
  which color-arrangement within the set the unit wears.
- **Player vs. enemy** ("team color") is *two adjacent set ids* that are **byte-for-byte
  identical except in the team-color slot** — i.e. the two teams share almost all colors and
  differ only in one ramp. This is the cleanest possible demonstration that team identity is a
  *palette channel*, not new art.
- **Monster "palette swaps"** (the classic three-color reskins of one creature) are done as
  **different palette sets applied to the same tiles/metasprite** — one rig, three color sets,
  three "species."

So across the reference, **variant = same tiles + different 16-color arrangement.** Identity
(race tint, team, elite recolor, monster reskin) is data in a color table, never a redraw.
That is precisely the property we are going to systematize with a *semantic* slot convention
(§5) so the same trick also expresses gear tiers and rarity.

---

## 3. Tile / map system

### 3.1 Tile sizes and layers

Maps are built from the same **8×8, 4bpp tiles** as sprites, referenced through a grid of
**screen entries** — each entry is a tile index plus horizontal/vertical flip bits plus a
palette-bank selector. So a map tile, like a sprite pixel, is indirected: the grid stores
*which tile + which palette*, and flips let one tile serve several orientations.

The reference map is a **two-layer arrangement**, both layers a large (64×64) grid of tile
entries:

- **Bottom layer** — the ground plane; always drawn below units.
- **Top layer** — props/overhangs; normally also below units, **but** a per-tile "behaviour"
  table can promote a top-layer tile to draw *in front of* units, which is how a tree or a
  wall correctly occludes a character standing behind it.

A separate low-resolution **terrain grid** (a coarse per-cell `{height, type-bitfield}` map)
carries gameplay semantics — walkable / water / blocking / fly-over — decoupled from the
visual tile grid. Height feeds the depth/occlusion decision.

The visual tiles form FFTA's isometric look; internally each drawn "map tile" is actually a
**horizontal pair** of tile entries (a 2-wide metatile), which is why the ground reads as
diamonds. The arrangement stream is compact: it is a run of `(cell coord, count, indices…)`
records, each index expanded through a lookup table into one or two adjacent tile entries, and
painted into the layer buffer last-write-wins. We do not need this packing; the point is that
**the map is authored as metatiles placed on a grid, then flattened to a tile buffer once.**

### 3.2 The projection

The field is a **dimetric (2:1-ish) grid with a fixed camera**: tiles read as diamonds, the
camera does not rotate, and depth is a screen-space property. This is the geometry we keep
verbatim (it's genre technique, not content) and the reason our footprint is ~32×16.

### 3.3 Draw order

Composition is strictly layered and then depth-sorted within the object pass:

1. Background layers first, in priority order (ground, then props).
2. Objects (units, monsters, effects) composited against the backgrounds, **z-ordered
   back-to-front by screen-Y of their ground point** — this is painter's order and it is the
   whole depth model on a flat draw surface.
3. Top-layer tiles flagged "in front" are drawn after the units they should occlude.
4. Overlays (blends/windows for translucent range highlights, fades, weather-like effects)
   last.

The map itself is **static per scene**: the engine builds the tile buffer once and only
scrolls it; only animated tiles (water shimmer, etc.) get periodic tile swaps. This directly
justifies our "render the map once to an offscreen buffer, then blit + scroll" plan.

---

## 4. Translation plan — GBA-era architecture → browser Canvas 2D

The target (from `PLAN.md`): vanilla Canvas 2D, 2:1 dimetric tiles (~32×16 footprint),
pre-baked recolored sheets cached by `(spriteId, paletteId)`, a static map rendered once to an
offscreen buffer, painter's-order entity sort, mobile-Safari performance budget.

### 4.1 What we ADOPT (the transferable architecture)

- **Indexed art as the authoring format.** Sprites and tiles are authored as **palette-index
  maps** (an integer per pixel, 0 = transparent) plus a small JSON manifest, exactly as GBA
  art is. This is what makes recoloring free and what lets hand-drawn Aseprite art drop in
  later unchanged.
- **The metasprite idea, in its simplest form: one shared rig.** A unit is a small set of
  frames sharing a layout; identity = (which index-sheet) + (which palette). We keep "layout
  authored once, reused across characters."
- **Per-part / per-frame anchors around a single feet-center origin**, so mirroring and depth
  sorting work (§1.4).
- **Palette-swap as the variant engine** (§2.2, §5) — the core Stillmarch multiplier.
- **Two-layer map + "prop can draw in front of unit" occlusion**, mapped to: ground baked into
  the static buffer; overhang/foreground props kept as depth-sorted entities so they can sort
  in front of units by screen-Y.
- **Static map buffer + scroll**, and **painter's-order** object sort by ground screen-Y.
- **Build-then-flush loop**: mutate a plain scene object each frame, do all `drawImage` calls
  in one rAF pass, allocate nothing in the hot loop (pre-size arrays, reuse objects) to hold
  the mobile-Safari frame budget.
- **Pre-baking.** The GBA recolors implicitly (palette bank chosen at scan-out). We can't
  recolor per-pixel cheaply in Canvas, so we **pre-bake**: for each `(spriteId, paletteId)`
  we walk the index map once, write an RGBA sheet through the palette LUT, cache it as a
  canvas/bitmap, and thereafter just `drawImage` it. Same end result (free variants), moved
  from scan-out time to load/first-use time.

### 4.2 What we SIMPLIFY

| Reference | Our simplification | Why it's safe |
|---|---|---|
| Elevation + per-cell height driving occlusion | **Flat maps, no elevation.** Depth = screen-Y only | Stillmarch' `ZoneMap` is already flat (`terrain`/`water`/`cliff` types, no height); we render "cliff" as a tile style, not a Z |
| Multiple genuinely-distinct facing poses | **Two drawn facings, mirrored to four** | Hardware flip already did half of this in the reference; §1.3 |
| Many animation states (attack/cast/jump/knockback/…) each with its own metasprite | **Four animations: idle / walk / attack / hit** | Matches the combat feed the game already exposes (`floatingNumbers` → attack/hit) and map traversal (walk) |
| Paper-doll of many equipment layers | **Single weapon layer** over the body rig | Enough to *see* loot (weapon rig by item type, weapon palette by rarity) without paper-doll complexity |
| Three display-gamma palette variants | **One palette variant** | Single output device (the browser); gamma tuning is irrelevant |
| Custom LZ/dictionary codecs for tiles & palettes | **Plain PNG + JSON**, decoded by the browser | Compression was a cartridge-size concern; we have none |
| Two-wide metatile arrangement stream w/ lookup expansion | **Author tiles directly on the grid**; keep only the 2:1 diamond footprint | The packing solved ROM size; the *geometry* is the part we keep |
| 16-bank / 16-color hardware palette limits per object | **Convention-limited 16-slot palettes** (§5), not hardware-enforced | We keep 16 slots as a *discipline* (so hand-authored art stays swap-friendly and future GBA-legality stays possible), but nothing crashes if art uses more |

### 4.3 What we DROP entirely (GBA hardware with no browser equivalent)

These are mechanisms of the console's fixed-function display hardware. Canvas 2D has no analog
and needs none — the browser's compositor and our own draw loop replace them:

- **OAM (the 128-hardware-object table) and the per-VBlank OAM DMA flush.** Our "objects" are
  just entries in a JS array we iterate and `drawImage`; there is no 128-sprite cap, no
  attribute packing, no shadow-buffer double-buffer to flush. (We keep the *spirit* — build a
  list, draw it once per frame.)
- **VRAM / charblock / screenblock tile banks and tile-index addressing.** We hold decoded
  RGBA bitmaps and blit them; there is no fixed tile memory to DMA into, no "tile base," no
  1-D vs 2-D mapping bit.
- **Hardware palette memory (BGR555 banks) and scan-out-time index→color resolution.** We
  resolve indices to color *once* at bake time into RGBA; there is no live palette RAM.
- **Affine OBJ / affine BG matrices (rotation/scaling via PA–PD matrices, `ObjAffineSet`).**
  If we ever need rot/scale, Canvas `setTransform` does it directly; the matrix hardware and
  its interleaving into the object table are dropped.
- **Hardware priority bits, windows (WIN0/1), mosaic, and hardware alpha-blend (BLDCNT).**
  Draw order gives priority; `globalAlpha` / `globalCompositeOperation` / an overlay pass give
  blending and fades; clipping regions give windows. None of the register machinery survives.
- **The BIOS decompression SWIs and the DMA transfer queue.** Assets are PNG/JSON the browser
  decodes; there is no cartridge codec and no manual DMA scheduling.
- **The VBlank interrupt as the sole hardware writer.** `requestAnimationFrame` is our frame
  clock; there is no interrupt, no forced-blank, no scanline timing.

Dropping these is not a loss of fidelity — they were the *implementation* of "draw indexed
tiles and sprites with palettes and depth," and we implement that same behavior with Canvas
primitives instead.

### 4.4 Concrete mapping to `src/render/*` and existing game state

- `indexedSprite.ts` — load index-map PNG + JSON manifest → per-sprite `{ width, height,
  frames[], anchors[], Uint8 indices }`. (Mirrors §1.1 frame/part model, flattened to a single
  rig.)
- `palette.ts` / `palettes.ts` — named 16-slot palettes; **pre-bake** RGBA sheets cached by
  `(spriteId, paletteId)` (§4.1). Registry is semantic (§5).
- `animation.ts` — frame tags (`idle`/`walk`/`attack`/`hit`), per-frame anchors, two-facing
  mirror logic (§1.3–1.4).
- `tilemap.ts` — 2:1 dimetric grid (~32×16), ground baked to an offscreen buffer once;
  foreground/overhang props kept as depth entities (§3, §4.1). Consumes the game's existing
  `ZoneMap { tiles: MapTile[][] (64×64), nodes: MapNode[] }` where `MapTile.type` is
  `terrain | water | cliff | resource_ore | resource_herb` — each type maps to a tile style,
  nodes to prop/marker entities.
- `scene.ts` — entity list, painter's-order sort by ground screen-Y, zero-alloc rAF loop
  (§3.3, §4.1).
- `placeholderArt.ts` — programmatic silhouette rigs + tilesets in the exact authored index
  format (structurally perfect, ugly), deleted when real art lands.
- `adapter/combatAdapter.ts` — reads `gameMode` / `floatingNumbers` / `currentMob` →
  diorama entities (the attack/hit feed already exists; §4.2).
- `adapter/mapAdapter.ts` — `ZoneMap` + `playerMapPos` (fractional, 64×64 wrap) + `mobMapOffset`
  → tilemap + entities, preserving the player-centered fractional-scroll camera.

---

## 5. Our semantic palette-slot convention (OUR design, informed by the study)

The reference proves variants are palette data (§2.2) but its slot meanings are ad hoc per
character. Stillmarch turns that into a **fixed, semantic 16-slot contract** so *any* rig can
express race, gear tier, elite status, and rarity without redrawing — and so the palette
registry becomes the game's itemization taxonomy. This is our design; the study only tells us
it will work.

### 5.1 The 16 slots

Every sprite (unit body, weapon, tile, icon) is authored to this contract. Index 0 stays
transparent, matching the hardware convention and keeping future GBA-legality possible.

| Slots | Meaning | Recolored by |
|---|---|---|
| **0** | Transparent | never |
| **1–4** | Skin / base-flesh ramp (dark → light) | **race variant** |
| **5–8** | Primary material ramp (main garment / body color) | **gear tier**, team, monster reskin |
| **9–12** | Secondary material ramp (trim / cloth / hide) | gear tier, faction accent |
| **13–15** | Metal / accent — **reserved as the rarity-signal channel** | **rarity tier** (tier glow / metal color) |

Reserving 13–15 as a dedicated rarity channel is the key forward-looking decision: a rig can
show its rarity purely by swapping three accent colors, so a common and a legendary version of
the same item are one manifest entry + one palette entry apart, with identical pixels.

### 5.2 How each game concept becomes a palette id (not new art)

All of these are **named** palette ids in `palettes.ts` from day one (`race/*`, `gear/t1..t4`,
`elite`, `rarity/common..legendary`, `team/*`), so the registry doubles as itemization data and
so a future purchased/granted palette id is renderable the instant it's granted.

- **Race variants** → swap the **skin ramp (1–4)** (and optionally a signature accent). One
  humanoid rig serves every playable race; `race/human`, `race/dwarf`, … are palette ids.
- **Gear tiers (t1–t4)** → swap the **primary + secondary material ramps (5–12)** to progressively
  richer materials (cloth → leather → mail → plate as *color*, not shape). `gear/t1..t4`.
- **Elite mobs** → a monster's normal set with a shifted **primary ramp (5–8)** and an
  emphasized **accent (13–15)** — the classic "same monster, meaner colors." `elite` applied
  over the base monster palette.
- **Rarity tiers** → swap **only the accent slots (13–15)** for the tier's signal color/glow,
  leaving the item's own material colors intact. `rarity/common..legendary`. Because it's an
  isolated channel, rarity composes with gear tier (a t3 sword can be common or epic).
- **Teams / factions** → swap one ramp (as in the reference's adjacent-set trick, §2.2), so
  friendly and hostile share a rig. `team/*`.
- **Weapon-as-loot** (single weapon layer, §4.2) → weapon **rig** chosen by item type, weapon
  **palette id** chosen by rarity tier — so improving loot is *visible* using the same
  swap-only mechanism.
- **Prismatic / one-of-a-kind (future)** → a palette id generated deterministically from a
  player's seed; because it's just another named palette id, the renderer needs no special
  case.

The invariant to protect through Phase 1: **the renderer only ever knows `(spriteId, paletteId)`;
every gameplay/monetization concept above resolves to a `paletteId` upstream.** That is what
keeps "one rig × N palettes" true as a content and revenue multiplier.

---

## 6. Partial-knowledge notes & fallbacks

Where the reference was only partially decompiled, this spec used general, public GBA behavior:

- The reference's **exact `(race, job) → graphic id` formula** is spawn-computed and was never
  fully pinned in the study; only that it is computed, not a flat table. We don't need it —
  our mapping from unit → `(spriteId, paletteId)` is our own upstream data. (Falls back to: it
  confirms "identity is computed data feeding a shared rig," which is all we adopt.)
- The reference's **per-frame layout selector** (frame record choosing humanoid vs. large vs.
  weapon silhouette) is understood structurally but its full layout catalog wasn't enumerated.
  We simplify to a single rig + one weapon layer, so we don't need the catalog.
- **Composition ordering, indexed/4bpp tile format, BGR555 palettes, OAM/flip semantics, the
  build-then-flush loop, and the two-layer map with front-of-unit occlusion** are all
  runtime-verified in the reference and consistent with public GBA hardware documentation, so
  they are stated with confidence.

---

## 7. Load-bearing insights for Phase 1 (summary)

1. **Pixels are slots, not colors.** Author index maps + a 16-color palette; resolve to RGBA
   once at bake time. This single indirection is the whole variant economy.
2. **One rig, many identities.** Layout/tiles are authored once and shared; race/team/tier/
   rarity/elite/monster are all *palette id*, never new art. The renderer's only knobs are
   `(spriteId, paletteId)`.
3. **Reserve slots 13–15 as the rarity channel now.** It costs nothing in Phase 1 and makes
   rarity/gear/elite composable forever.
4. **Depth is screen-Y of the feet.** Single feet-center anchor per sprite; painter's sort;
   foreground props are depth entities so they occlude correctly on a flat surface.
5. **Static map, dynamic objects.** Bake the ground once to an offscreen buffer and scroll it;
   keep only units/props/effects as per-frame entities; build-then-flush with zero hot-loop
   allocation for the mobile budget.
</content>
