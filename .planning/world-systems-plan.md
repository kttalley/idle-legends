# Plan — World Systems: Collision & Pathing, Gathering/Crafting, Towns

**Status:** draft plan — awaiting approval.

Three tracks that are not covered by `PLAN.md` (renderer), `docs/environment-plan.md`
(tile art), or `.planning/zone-progression-plan.md` (zone gating). Each is independently
executable. This document is self-contained: a fresh context can run it without prior
conversation.

---

## Track W — Walkability, collision & pathing

### Problem

There is **no collision logic anywhere in the codebase** (verified by grep: no
`walkable`/`passable`/`blocked`/`collision` outside CSS). Every mover walks through
everything — the hero strolls across lakes, mobs spawn in water, ambient heroes wander
through cliffs, and tap-to-move paths straight through obstacles.

### Two position systems — both need this

| System | Owner | Used for | Wraps |
|---|---|---|---|
| `playerMapPos` | `gameStore.tick` (drift, `gameStore.ts:1023`) | node proximity → auto-gather (`:1009`) | mod 64 |
| `player.tx/ty` | `combatAdapter` (WASD / tap / closing walk / `approachAuto`) | everything visual | PAD-offset torus |

The renderer's auto-follow lerps toward the store position, and `syncOffset()` absorbs
drift. **Collision must apply to both** — blocking only the visual layer lets the logical
position sit in a lake next to a node, silently triggering auto-gather from open water.

### Which tiles block — measured, not guessed

Flood-fill connectivity over all 12 zones' real `generateZoneMap` output (torus-aware,
4-neighbour). `largest%` = share of walkable tiles in the biggest connected component:

| Blocked set | Worst zone | Components | Largest | Verdict |
|---|---|---|---|---|
| `water` | venom_hollows | 10 | 98.9% | ✅ safe |
| `water + cliff` | venom_hollows | 7 | 99.1% | ✅ **chosen** |
| `water + cliff + rock` | ironcrag_badlands | **78** | **23.3%** | ❌ shatters the map |

`rock` is a biome *terrain patch* type from `pickTerrain`, not an obstacle — blocking it
turns ashfire_peaks (49% blocked, 77 components, 9 nodes stranded on blocked tiles) and
ironcrag_badlands into confetti. **Block `water` and `cliff` only.** Rock stays walkable
despite being elevated; that is fine, elevation is cosmetic.

Under `water + cliff`, blocked share per zone ranges 0% (dustwind_plains, ashfire_peaks,
ironcrag_badlands, warsong_mesa, cinderfall_wastes) to 36.7% (venom_hollows).

### Known edge cases the data surfaced

1. **Spawn point (32,32) is blocked** in `grimshade_forest` and `venom_hollows`. Needs a
   `nearestWalkable()` nudge on zone entry / respawn / travel arrival.
2. **Isolated pockets.** venom_hollows has 6 pockets under 20 tiles; thornvale_jungle has
   1. Anything spawning in one is trapped. Fix by *sealing*: a per-zone flood fill marks
   any component under `MIN_REGION` (~24 tiles) as blocked, so nothing ever spawns there
   and the mask is guaranteed single-component. Cached per zone alongside the ground bake.
3. **1 unreachable node** in thornvale_jungle under `water+cliff`. After sealing, relocate
   any node not in the main region to the nearest walkable tile at generation time.

### Implementation

**New `src/engine/walkability.ts`** — engine, not render, because the store needs it too:

```typescript
export const BLOCKED_TILES: ReadonlySet<TileType>   // water, cliff
export function buildWalkMask(zm: ZoneMap): Uint8Array   // 64×64, pocket-sealed, cached
export function isWalkable(mask: Uint8Array, x: number, y: number): boolean  // torus-wrapped
export function nearestWalkable(mask: Uint8Array, x: number, y: number): {x, y}
export function findPath(mask: Uint8Array, from: Vec2, to: Vec2): Vec2[] | null  // A*, torus
```

The mask is a `Uint8Array` keyed by zone and cached — one flood fill per zone, built lazily
next to the existing ground bake. A* over 64×64 with a torus-aware octile heuristic is
microseconds; it runs on tap and on mob spawn, never per frame.

**Consumers:**

| Site | Change |
|---|---|
| `gameStore.tick` drift (`:1023`) | reject a drift step that lands on blocked; slide along the free axis |
| zone entry / travel arrival / respawn | `nearestWalkable` nudge on `playerMapPos` |
| `combatAdapter` manual WASD (`:1105`) | collide-and-slide per axis |
| `combatAdapter` closing walk (new branch) | path to the mob anchor, not a straight line |
| `combatAdapter` tap-to-move (`:1109`) | `findPath` → follow waypoints; reject taps on blocked tiles (or route to nearest walkable) |
| `combatAdapter` mob anchor (`sync`, spawn) | `nearestWalkable` on the spawn offset so mobs never wait in a lake |
| `updateAmbient` (`:1752`) | collide-and-slide + retarget on block; recycle ring lands on walkable |
| tall prop entities (Phase E) | mark their tile blocked in the mask (trees/rocks/lairs are solid) |

**Movement model:** collide-and-slide per axis for continuous movers (cheap, no pathfinder
in the frame loop), A* only for deliberate destinations (tap, mob approach). Slide alone
gets stuck in concave pockets; A* alone is overkill per frame. The pair covers both.

**Effort:** ~450–650 lines. Ship in two commits: mask + collision (all movers stop clipping),
then A* pathing (tap/approach route around).

**Verify:** walk the hero into a lake — blocked, slides along the shore; tap across a lake —
routes around it; 200 mob spawns in venom_hollows — none in water; ambient crowd never
crosses water; every zone's mask is single-component after sealing.

---

## Track G — Gathering & crafting engagement

### Problem

Gathering is a **5-second countdown with zero player agency** (`gatheringTimer: 5`,
`gameStore.ts:485-533`): drift near a node → mode flips to `gathering` → timer → material
→ auto-craft if a recipe is satisfiable (`:520`). The player never makes a decision.
`professions.ts` is 428 lines of real recipe/material data driving a non-interaction.

### The governing constraint

**This is an idle game.** A minigame that *gates* progress breaks idle play and offline
progression, and it punishes the exact player the genre serves. So:

> Gathering stays fully automatic and idle-safe. Active play is an **optional overlay that
> raises quality, never a requirement to get output.**

Skip it entirely → today's baseline yield. Engage → better material tier. This is the same
principle that makes the talent system work, and it keeps `offline.ts` coherent.

### Recommended: in-world node striking (not a separate screen)

You floated a separate minigame screen. My recommendation is **against** it as the primary
form — it would fight the dimetric world you just built and force a context switch that
idle players will resent. Instead:

- The node is already a depth-sorted in-world prop (environment-plan Phase E).
- On approach, a **strike meter** arcs across the node — tap/click in the sweet spot.
- Consecutive hits build a **streak**, and streak raises **material quality tier**, not
  quantity. Missing just ends the streak; the base yield still lands.
- Quality tier feeds the crafted item's rarity → **which is already a palette ID**. So a
  good gathering run visibly changes the gear you're wearing. That closes the loop between
  Track G and the renderer's palette-as-rarity premise with no new art.

Node type can flavour the interaction cheaply: ore = rhythm strikes (pickaxe), herb = a
"careful pull" hold-and-release, both reading off the same meter component.

**Secondary (later): expedition screen.** A dedicated screen earns its place only for a
*deliberate, multi-minute* activity — a gathering expedition with route choices, risk/reward,
and a material haul. That's a real feature, not a polish pass; sequence it after the in-world
layer proves the interaction is fun.

### Crafting

- Replace silent auto-craft with a **craft result moment**: quality roll, stat effect, and a
  rarity-tinted item reveal. Auto-craft stays for idle players (toggle), but it announces.
- Add **quality tiers** to `Recipe` output driven by input material tier + a small skill
  factor, mapping to the existing `gear/t1..t4` palette IDs.

**Effort:** ~350–500 lines + one new meter component. No store schema break (additive fields
with `rehydrateState` defaults, same pattern as the quest system).

---

## Track T — A town that actually works

### Problem

`TownServiceType = 'rest' | 'vendor' | 'repair'`. Only **rest** is implemented. `TownView.tsx`
literally renders `Vendor: coming soon`. And **`repair` has no durability system behind it** —
grep finds zero `durability` in the codebase — so the service is currently meaningless.

### What already exists to build on

The hard part is done: commit `fa73705` added a **town-hub dimetric scene** (`townMode`,
`townGround`, `updateTownCrowd`) — the capital renders as a busy hub with a crowd. Towns are
a real place, they just have nothing to do in them.

### Scope

1. **Vendor (the priority).** Buy/sell against `items.ts`. Sell junk drops for gold — the
   game currently has gold with weak sinks. Stock rotates per town and is faction/zone
   flavoured. Hostile towns already deny rest (zone-progression plan §7); they should charge
   a markup rather than refuse trade — smugglers are more interesting than closed doors.
2. **Repair — decide first.** Either add equipment durability (a genuine gold sink, and the
   reason vendors matter) or **drop `repair` from `TownServiceType`**. Do not ship a button
   that does nothing. My recommendation: drop it for now; durability is an anti-idle
   mechanic that adds chores, and the gold sink is better served by vendor stock and
   cosmetics.
3. **Storage / bank.** Inventory is 20 slots (`INVENTORY_SLOTS`). A town bank is the
   natural pressure valve and gives towns a reason to exist between runs.
4. **Trainer.** Talent respec for gold — a second real sink, and it makes the talent system
   (which is working well) more explorable.
5. **Quest board.** The quest system from `.planning/zone-progression-plan.md` currently
   auto-assigns one zone quest. A board turns towns into the place you *choose* work.
6. **In-world NPCs.** Vendor/trainer/banker as addressable props in the town scene rather
   than a menu list — the town crowd already renders; give three of them jobs and a barks
   line (reuses `ThoughtBubble`/`nameGen`).

**Effort:** vendor ~300 lines, bank ~200, trainer ~150, quest board ~250, NPC anchors ~200.

**Sequencing:** vendor → bank → trainer → quest board. Vendor alone converts towns from
decoration into a destination.

---

## Recommended order across tracks

1. **Track W collision** (mask + collide-and-slide). It's the one that reads as *broken*
   right now, it's data-ready, and every later system (node placement, town NPCs, ambient
   crowds) assumes a walkable world.
2. **Track W pathing** (A*).
3. **Track T vendor + bank.** Highest gameplay-per-line in this document.
4. **Track G in-world gathering.** Do it after the vendor exists, so better materials have
   somewhere to go.
5. Track T trainer / quest board, Track G expedition screen.

## Open questions

1. **Repair/durability** — add durability, or drop the service? (Plan recommends drop.)
2. **Gathering minigame form** — in-world strike meter (recommended) or separate screen?
3. **Does blocking cliffs feel right?** It's safe by the connectivity data, but cliffs are
   generated as the *shoreline ring* around water, so blocking them widens every lake's
   footprint by one tile. Worth a look in-game before committing.
