# Plan — The Economy: Gold, Inventory, Towns & Merchants

**Status:** draft plan — awaiting approval.
**Written as a cold-start brief:** a fresh session can execute this without prior conversation.

Supersedes and expands **Track T** in `.planning/world-systems-plan.md`.

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

## 4. Decisions needed before building

1. **Drop `repair`?** There is no durability system, so the service is meaningless today.
   Recommend **removing it from `TownServiceType`** rather than building durability, which
   is an anti-idle chore that adds upkeep clicking. If you want the gold sink, T1–T4 are
   better sinks.
2. **Should the merchant contract have upkeep** (a recurring drain, keeps gold scarce
   long-term) or be a one-off purchase (simpler, but gold re-inflates once bought)?
   Recommend upkeep, because an idle game needs a *continuous* sink to stay meaningful at
   hour 50.
3. **Gold curve.** 14/min at level 6 is the only datapoint; nobody has checked how it scales
   with zone tier or the prestige circuit multiplier. Price anything before measuring this
   and it will be wrong within an hour of play.

---

## 5. Watch out for

- **`sellAllCommon` already exists** and is the closest thing to a sink today — build on it
  rather than around it.
- **Idle/offline parity** is the house rule (see `.planning/gathering-crafting-plan.md`):
  anything added must leave a player who never touches the screen no worse off. The
  merchant contract should make them *better* off, which is the point.
- **`vendorValue` is already on every `Item`** and surfaced in the tooltip, so pricing has a
  foundation.
- The economy is one of the few systems with **no test harness yet**. The pattern used
  elsewhere this session — drive the real store headlessly under an esbuild bundle with a
  `localStorage` shim, and assert invariants over tens of thousands of ticks — works well
  here and is worth setting up early. Measure gold in/out per hour before pricing anything.
