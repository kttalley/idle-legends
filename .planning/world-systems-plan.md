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

> **Superseded by `.planning/economy-and-towns-plan.md`**, which measures the economy
> (gold has zero sinks; the 20-slot bag silently destroys loot after ~30 min) and
> re-frames this track around buying better idling rather than adding a shop.

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

---

## Track C — manual targeting & player intent

### The blocker, stated plainly

`currentMob: MobInstance | null` — **the store models exactly one enemy at a time**, and
`activeDoTs: ActiveDoT[]` is a single global list, not per-target. So "let the player pick
which enemy to fight" currently has nothing to pick *between*. Manual targeting is not a UI
feature here; it needs the combat model to hold more than one enemy first.

### Governing principle

Same rule as gathering (Track G): **manual is an override, never a requirement.** Auto-play
picks a target when the player hasn't; the moment the player picks one, that choice is
**locked until the target dies or is explicitly cancelled** — auto-retargeting must never
steal intent mid-fight. An idle player who never touches the screen sees no change.

### Staged

**C1 — Intent lock (small, no model change).** Click an enemy to commit to it: the hero
paths to it (routing already exists) and engages, and no auto behaviour may override that
until it dies or the player cancels. Even with a single mob this fixes the "auto gameplay
overrides what I wanted" complaint, because auto-approach and auto-wander currently do as
they please. Ships as a `targetIntent` field plus a guard on the auto branches.

**C2 — Multiple concurrent enemies (the real change).** `currentMob` → a keyed collection
plus `targetMobId`; DoTs become per-target; `mobMapOffset` (currently one offset) becomes
per-mob position. Auto-target picks the nearest when intent is unset. This is the bulk of
the work and it destabilises offline progression maths, so it wants its own milestone and
its own verification pass.

**C3 — Promote the ambient crowd (the payoff).** The living-world crowd already exists as
positioned, animated, depth-sorted entities that even skirmish with each other (`Ambient`,
`fightT`) — they are simply not attackable. Promoting a subset into real spawns is the
natural way to populate C2, and it is far better than bolting a multi-spawn timer onto the
existing system: the world already *looks* full of enemies, so making those same bodies
fightable is the shortest path to "hunt what you choose". It also collapses Track L's
living-world work and the targeting work into one payoff.

**Recommendation:** do C1 now (contained, fixes the intent complaint immediately), then
treat C2+C3 as a single milestone rather than two — C2 without C3 gives multi-target with
nothing interesting to target.

---

## Track F — mounts, flight masters, and city-gated travel

**Shape:** replace the current travel animation (the hero walks and the map scrolls past)
with an aerial flight-path ride, old-WoW flight-master style. Faction-flavoured mounts:
**gryphons for the Lastlight Concord, wyverns for the Ashmarch** — which is exactly the
split Track R already established, so the mount reads as faction identity, not decoration.
The hero graduates onto a mount the moment they leave a zone behind, so advancing to the
next zone is something you *see* rather than a progress bar.

**Why this is cheap here.** Nearly every piece already exists:
- `travelProgress` runs 0→1 over `travelDuration` (8s per zone step, `gameStore.ts:3367`)
  and `TravelOverlay` already renders it with a cancel action.
- The scene already animates entity **altitude** — `player.z` drives the jump arc — so
  lifting a rider off the ground is not new machinery.
- The camera already follows the player's feet and the ground is a wrapped torus, so a
  long scrolling overflight is the existing camera doing its normal job.
- Two rigs (gryphon, wyvern) × the palette registry covers faction and rarity variants,
  same content-multiplier trick as everything else.
- The town hub is already a real scene with a fixed NPC anchor layout (`townNpcs.ts`), so
  a flight master is a fifth `TownServiceKind` and one more anchor, not a new screen.

### F0 — the travel model changes shape first

Today `beginTravel(toZone)` (`gameStore.ts:3360`) is callable from anywhere, and
`enterTown`/`leaveTown` (`:3526`, `:3537`) are **instant mode flips** — you blink into the
town scene and blink back out. That is the thing to fix before any mount art matters.

**The rule:** you only leave a zone by *flying out of its city*, and you only arrive in a
zone by *landing in its city*. Zone-to-zone movement is city→city, arranged by that city's
flight master. Wilderness is somewhere you ride out to, never somewhere you depart from.

So one zone change becomes a **journey of three legs**, each with its own animation:

| Leg | From → to | Presentation |
|---|---|---|
| 1. **Ride in** | wilderness → origin city | mount up where you stand, ride to the city gate, land |
| 2. **Flight** | origin city → destination city | takeoff arc, cruise at altitude, descent |
| 3. **Ride out** | destination city → wilderness | lift from the pad, ride out to the hunting ground |

**This must not become a click tax.** The `ZoneSelector` button stays one click: it queues
all three legs and the journey runs itself. Walking to the city to talk to an NPC is the
*manual* path for a player who wants it, and the flight master is where you browse
destinations — but an idle player clicks the zone and watches. Same principle as Track G
and Track C: **manual is an override, never a requirement.** Auto-advance (the roamer at
`gameStore.ts:2954`) must build its journey through the same queue, not bypass it.

**Implementation.** Keep `travelProgress`/`travelDuration` as the per-leg clock and add a
journey wrapper — `travelLeg: 'ride_in' | 'flight' | 'ride_out'` plus the destination — so
the arrival handler (`:1788`) advances to the next leg instead of always dropping into
`gameMode: 'combat'`. Leg 2 ends in `enterTown`-equivalent state for the destination city;
leg 3 begins from it.

**Budget the legs out of the existing total** — do not add time. Total journey stays
`dist * 8`; ride-in and ride-out are fixed short (~1.5s each) and the flight absorbs the
remainder, so a one-zone hop is 1.5 + 5 + 1.5 = the 8s it is today. Throughput unchanged.

**Cancel, per leg.** `TravelOverlay`'s cancel currently just returns you to the origin zone.
Mid-air there is no coherent ground position to return to, so: cancelling during ride-in
drops you back in the wilderness; cancelling during flight **lands you at the origin city**
rather than aborting to nowhere; ride-out cancel leaves you in the destination city. Never
trap an idle player in a cutscene they can't leave.

**Save compatibility.** `rehydrateState` already nulls `travelTarget`/`travelProgress` on
load (`:497-499`), so a save taken mid-journey lands the hero back in their origin zone.
That is acceptable — but say so out loud, because with journeys it silently discards two
more legs than it used to. All new fields are additive with defaults, same pattern as the
quest system.

### F1 — BLOCKER: six of twelve zones have no city

`thornvale_jungle`, `ashfire_peaks`, `the_bloodfields`, `venom_hollows`, `cinderfall_wastes`
and `the_maw_eternal` have no entry in `data/towns.ts`. Under today's rules that is an
*economy* problem (see `.planning/economy-and-towns-plan.md` §0.5 — no vendor, no bag slots,
no rest). Under F0's rules it becomes a **traversal** problem: a zone with no city has no
flight master, so there is no way in and no way out. **F0 cannot ship until this is closed.**

It is data, not code (`TOWNS` entries + `linkedZone` + a faction/type per town), but the
names are world-bible territory, so they are the owner's call — `docs/art-direction.md`.

### F2 — the flight master

- A fifth `TownServiceKind` in `townNpcs.ts` (`rest | outfitter | factor | quartermaster`
  → `+ flightmaster`) and one more anchor in the shared `TOWN_NPCS` roster. The town scene
  gains a **landing pad** near that anchor — the point every arrival lands on and every
  departure lifts from, so the city has a visible front door.
- Their panel lists destination cities with flight time and the same lock reasons
  `ZoneSelector` already renders via `getZoneProgression`.
- **Destinations = every unlocked zone's city.** Do *not* gate on cities you've personally
  visited, old-WoW style — that re-creates the overland walk this track exists to remove,
  and it would strand a player who auto-advanced past a city they never entered.
- Hostile cities (Ironcrag Hold, Wardrum Bastion) charge a markup rather than refuse the
  flight, matching the smugglers-not-closed-doors call in Track T.

### F3 — rigs and presentation

1. Mount rigs + a flap animation; rider composited above the mount (single-layer, matching
   the existing one-weapon-layer simplification).
2. Travel mode in the scene controller: takeoff arc → cruise at altitude with the ground
   scrolling beneath → descent on arrival. Shadow scales with altitude (the scene already
   draws shadows separately from bodies, so this is a size multiplier).
3. **Legs 1 and 3 fly too, just low.** Reusing the same rig at low altitude with a faster
   flap avoids authoring a third ground-mount rig, and a hovering gryphon reads correctly
   in the genre. The alternative — a separate running rig — is the decision to revisit if
   the low-altitude version looks weightless.

**Risks:** flight is a *presentation* mode over an existing timer — it must not become a
gate on progression, and the total `travelDuration` must stay untouched so throughput is
unchanged. The genuinely new risk is F0: turning one instant mode flip into a three-leg
state machine touches travel, towns, auto-advance and offline at once. Land F0 behind the
existing overlay before any mount art exists, so a regression is a timing bug and not an
art bug.

**Effort:** F0 ~250–350 lines (store journey state + arrival chaining + cancel semantics),
F1 data only, F2 ~150 lines + one anchor, F3 ~350–500 lines plus two rigs.

**Sequencing:** F1 (data) → F0 (journey model) → F2 (flight master) → F3 (mounts + flight
presentation). Land the whole track after Track T's vendor, so cities are worth flying
between, and after the gathering pass.

## Recommended order across tracks

1. **Track W collision** (mask + collide-and-slide). It's the one that reads as *broken*
   right now, it's data-ready, and every later system (node placement, town NPCs, ambient
   crowds) assumes a walkable world.
2. **Track W pathing** (A*).
3. **Track T vendor + bank.** Highest gameplay-per-line in this document.
4. **Track G in-world gathering.** Do it after the vendor exists, so better materials have
   somewhere to go.
5. **Track F1** (the six missing cities) — data only, and it unblocks both the economy in
   the late zones and all of Track F. Cheap enough to slot in early once the names exist.
6. **Track F0–F3** (city-gated journeys, then mounts).
7. Track T trainer / quest board, Track G expedition screen.

## Open questions

1. **Repair/durability** — add durability, or drop the service? (Plan recommends drop.)
2. **Gathering minigame form** — in-world strike meter (recommended) or separate screen?
3. **Does blocking cliffs feel right?** It's safe by the connectivity data, but cliffs are
   generated as the *shoreline ring* around water, so blocking them widens every lake's
   footprint by one tile. Worth a look in-game before committing.
4. **Names for the six missing cities** (Track F1) — owner's call, and it blocks Track F.
5. **Do the wilderness legs fly or run?** (Plan: fly low, one rig — see F3.3.)
6. **Should the mount be visible outside travel?** A summonable mount for crossing a zone
   on the ground is a natural monetization SKU (Track M) but a different feature; Track F
   deliberately scopes the mount to journeys only.
