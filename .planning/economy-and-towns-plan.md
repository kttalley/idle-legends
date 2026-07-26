# Plan — The Economy: Gold, Inventory, Towns & Merchants

**Status: T1 and T2 BUILT (2026-07-25). T3 open, T4 blocked on a false premise, T5 open.**
**Written as a cold-start brief:** a fresh session can execute this without prior conversation.

Supersedes and expands **Track T** in `.planning/world-systems-plan.md`.

---

## 0. What was built, and what measuring it changed

A headless harness landed first (`src/sim/econSim.ts`, run via `node tools/sim/run.mjs`).
It drives the real store with a seeded `Math.random`, samples the gold curve, asserts
invariants every tick, and can sweep N seeds. **Every number below came out of it.**
Everything §1 claimed was confirmed; several things this plan assumed were not.

| | Status |
|---|---|
| **T1 — bag space, stop destroying loot** | **Done.** Overflow salvages at `SALVAGE_RATE` (0.20) instead of deleting; purchasable bag slots (20 base + up to 20 at 200g × 1.25ⁿ) at the town outfitter; hostile towns charge `HOSTILE_TOWN_MARKUP` rather than refusing. |
| **T2 — merchant contract** | **Done.** 1,500g retainer, bills 25% of what it moves. Sells drops below a player-set rarity **and** no better than anything already owned for that slot, so it can never eat an upgrade. Lapses (harmlessly) if unpaid. |
| **`repair`** | **Dropped** from `TownServiceType` — owner decision, §4.1. |
| **T3 — vendor stock** | Open. Price it against §0.2, not against the early curve. |
| **T4 — trainer respec** | **Blocked — see §0.3.** Its premise is false. |
| **T5 — town NPCs** | Open. |

### 0.1 Two soft-locks found on the way (both fixed)

Neither was an economy bug; both ended unattended runs, which is the same disease.

1. **`getWalkMask` cached by zone id** while `mapSeed()` had started folding in
   `worldSeed` and `zoneCircuit` — so a second character, or any prestige circuit, ran
   against the *first* terrain's collision. A hero standing where the stale mask said
   "wall" could not move. **15% of seeded 8-hour runs soft-locked.** Now keyed on the
   ZoneMap object (WeakMap), which cannot go stale by construction.
2. **The gathering drift steered by a stopped clock** — its angle is `totalPlayTime *
   0.08`, and only the combat branch ever advanced `totalPlayTime`. Constant vector, so
   one blocked heading was permanent rather than momentary. Fixed, plus `driftMapPos`
   now fans a blocked step through eight directions (the mask is single-component by
   construction, so the fan cannot come up empty).

0/40 soft-locks after, in both idle and advancing regimes.

### 0.2 The gold curve — measure before pricing anything (§4.3, now answered)

Gold/min is **not** flat; it spans roughly **500×** across the level range:

| level | zone | gold/min |
|---|---|---|
| 8–19 | sunhollow / dustwind | 13 → 27 |
| 25–33 | grimshade / thornvale | ~6 → 145 |
| 45–60 | ashfire / bloodfields | 200 → 430 |
| 75–89 | ironcrag / warsong | ~450 |

An equipping player who buys everything ends 20 simulated hours with **~248,000 gold and
nothing left to spend it on** — every bag slot bought by hour 12. So:

- **T1/T2 pricing is right for the early game and irrelevant late.** That is fine; they
  are early-game upgrades you outgrow the cost of.
- **The late-game sink does not exist yet, and contract upkeep will never be it** — the
  factor's throughput is only ~14% of late income, so no rate on it moves the needle.
  T3/T4 must be priced against **hundreds of gold per minute**, not against the 13/min
  that §1 measured at level 6.

### 0.3 T4's premise is false — do not build it as written

T4 says respec "makes the talent trees explorable instead of a one-way commitment."
They are already explorable: `resetTalents` is free, unlimited, and available anywhere,
and right-click deallocates a single point for nothing. **Charging for respec would not
add a sink; it would delete a free feature to sell it back** — the same anti-pattern that
got `repair` dropped, and a direct violation of PLAN.md Track M's "never engineer pain to
sell relief."

If the trainer should exist, it needs something *additive* to sell. Talent **loadouts**
(save/swap builds, already listed as QoL in PLAN.md Track M) are the obvious candidate:
a real sink, purely additive, and idle-friendly since a build can be swapped per zone.
**Owner call — not taken here.**

### 0.4 The biggest remaining hole: nothing ever equips itself

**There is no auto-equip anywhere in this codebase.** Gear reaches the hero only when a
player clicks an item in the bag. So a hero nobody touches fights **naked forever**, and
the measurements are stark:

- Idle hero, never equipped: stalls at **level ~20**, then enters the next legal zone and
  takes 0 kills in 11 simulated hours while dying repeatedly. The run is over.
- Same seed, equipping strict upgrades: **level 89 across 10 zones** in 20 hours.

This is why the pure-idle gold numbers plateau, and it caps what T1/T2 can be worth — the
contract's whole upgrade-guard exists to work around gear that never gets worn. For a game
whose premise is progress while unattended, this is arguably a larger hole than the bag
was, and it is upstream of the rest of this track. **Not built — it changes combat balance
and is an owner call.** Recommended as the next thing after T3.

*(Also worth knowing: an idle hero never changes zone either — `selectZone` is a click —
so the pure-idle player simply farms zone 1 forever at ~13–27 g/min. Stable, but static.)*

---

## 1. The finding: gold does nothing, and the bag is a silent wall

Measured against the real store (30 minutes of simulated play, fresh warrior):

| | |
|---|---|
| Gold earned | **413** (~14/min, indefinitely) |
| Gold **spent** | **0** |
| Inventory | **20 / 20 slots — completely full** |
| Level | 6 |

Two structural problems, both verified by grep rather than impression:

**Gold has no sink at all.** There is not a single gold *decrement* anywhere in the
codebase. `rollLoot` and `sellItem`/`sellAllCommon` add gold; nothing subtracts it. Rest is
free. The vendor renders the literal string `coming soon`. `repair` is a declared
`TownServiceType` with **no durability system behind it** — there is no `durability` field
anywhere. So gold is a number that goes up, forever, with nothing on the other side of the
ledger. That is exactly the "wtf is gold for" instinct, and the answer today is: nothing.

**The bag is a hard wall that destroys value in silence.** `INVENTORY_SLOTS = 20`, and the
only disposal is *manual* selling. When full, `gameStore.ts` logs
`Bag full! Lost: {item}` — the drop is **destroyed**. Bags fill in under 30 minutes.

That second one matters more than it looks. **This is an idle game**: the premise is that
progress continues while unattended. Today the core reward loop *silently self-terminates*
after roughly half an hour away, and the player's only remedy is to come back and click.
The crafting refactor made this worse, not better — crafted gear now competes for the same
20 slots.

---

## 2. The design principle

> **Gold should buy better idling.**

In an idle game a sink that demands attention (browsing a shop) never drains an idle
player's gold, so "add a vendor" alone does not fix the economy — it just adds a menu the
engaged player uses and the idle player ignores. The sinks that work are the ones that
*improve the unattended loop*, because every player wants them and they scale with how much
you idle.

That reframes the whole track: the shop is not the point. **Automation is the product, and
gold is how you buy it.**

---

## 3. Build order

### T1 — Bag space, and stop destroying loot *(do this first)*

The 20-slot wall is a correctness problem before it is a design one.

- **Overflow must not vaporise items.** Options, in preference order: auto-sell the drop and
  bank the gold (announce it in the log); or hold it in a small overflow "courier" queue the
  player empties in town. Never silently destroy.
- **Purchasable bag slots** — gold's first real job, and immediately legible: more slots
  means longer unattended runs.
- **Town bank / stash** with its own purchasable capacity.

Touch: `data/constants.ts` (`INVENTORY_SLOTS`), `gameStore.ts` (the two `Bag full!`
branches — combat loot ~`:1264` and crafting ~`:452`), `InventoryPanel.tsx`.

### T2 — The merchant contract *(the idle-native sink)*

Buy a standing arrangement, not an item: a retainer who **auto-sells drops below a chosen
rarity threshold while you are away**. Costs gold up front, optionally upkeep.

This is the keystone. It converts the full-bag failure from a dead stop into a gold faucet,
it is worth buying for every play style, and it makes gold's purpose obvious the moment you
own one. Pair with a per-rarity keep/sell filter so it never eats a legendary.

### T3 — Vendor

Buy/sell against `data/items.ts`. Rotating stock seeded per town from `worldSeed` (the same
per-run entropy the terrain uses, so a run's shops differ). Hostile towns already deny rest
(zone-progression plan §7) — they should **charge a markup rather than refuse trade**;
smugglers are more interesting than closed doors.

### T4 — Trainer

Talent respec for gold. A second real sink, and it makes the talent trees — which are good,
and now have per-node iconography — explorable instead of a one-way commitment.

### T5 — NPCs in the town scene

The town hub already renders as a dimetric scene with a crowd (commit `fa73705`). Give the
vendor, banker and trainer bodies at anchors with barks (reuse `ThoughtBubble`/`nameGen`)
rather than leaving towns a menu list.

---

## 4. Decisions — RESOLVED

1. ~~**Drop `repair`?**~~ **Dropped** (owner decision). No durability system existed behind
   it and durability is an anti-idle chore.
2. ~~**Should the merchant contract have upkeep?**~~ **Yes, upkeep** (owner decision) — but
   measuring it changed the *shape*. A flat fee was net-negative for the first three hours
   after purchase and 2% of income by hour 20; no flat number works across a 500× curve.
   It bills a **25% cut of what the factor moves**, floor 1g. Still a recurring bill that
   can lapse, but it can never be a losing deal. Note §0.2: upkeep is **not** the
   late-game sink and cannot be made into one.
3. ~~**Gold curve.**~~ **Measured — see §0.2.** It spans ~500×. The 14/min datapoint was
   level 6; late zones run ~450/min.

### Still open for the owner

4. **Auto-equip (§0.4)** — the largest remaining hole in the idle loop. Recommended next.
5. **What the trainer sells (§0.3)** — respec is already free, so T4 needs a different
   product (loadouts?) or should be dropped.

---

## 5. Watch out for

- **`sellAllCommon` already exists** and is the closest thing to a sink today — build on it
  rather than around it.
- **Idle/offline parity** is the house rule (see `.planning/gathering-crafting-plan.md`):
  anything added must leave a player who never touches the screen no worse off. The
  merchant contract should make them *better* off, which is the point.
- **`vendorValue` is already on every `Item`** and surfaced in the tooltip, so pricing has a
  foundation.
- ~~The economy has **no test harness**~~ — it has one now: `src/sim/econSim.ts` +
  `tools/sim/run.mjs`. Use it before changing any number.

  ```
  node tools/sim/run.mjs --minutes 480 --sample 60            # idle baseline
  node tools/sim/run.mjs --minutes 1200 --advance --equip \
                         --buyslots --contract --seed 1       # the works
  node tools/sim/run.mjs --minutes 300 --assert --sweep 10    # invariants, every tick
  node tools/sim/run.mjs --minutes 480 --sweep 40 --advance   # soft-lock sweep
  ```

  Flags: `--advance` (change zone when legal), `--equip` (wear strict upgrades — **off is
  the true idle baseline**, see §0.4), `--sell`, `--buyslots`, `--contract`, `--seed N`
  (reproducible), `--sweep N`, `--assert`. `--seed` matters: both soft-locks in §0.1 were
  intermittent and would not have been findable without it.
