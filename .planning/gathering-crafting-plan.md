# Gathering & Crafting — "Work the Vein" / "The Forge Moment"

Implements Track G of `.planning/world-systems-plan.md`, with two deliberate departures
from that document (argued in §7).

---

## 1. The problem, restated

Gathering was a 5-second countdown with **zero player agency**. Crafting auto-fired
whenever materials sufficed and produced a silent 30-second buff. `professions.ts` is 428
lines of real material/recipe data driving a non-interaction. There was nothing to *do*,
and nothing that a session of doing it would *change*.

## 2. The governing constraint

**This is an idle game.** Every interaction below is an **optional overlay that raises
quality, never a gate on throughput**:

> A player who never touches the screen gathers at exactly the same rate, crafts exactly
> the same recipes, and gets exactly the same numbers as before this change.

The parity is structural, not a balance guess — see §6.

## 3. Gathering — "Work the Vein"

While `gameMode === 'gathering'`, a **strike meter** runs over the world: a cursor sweeps
left↔right across a track, and a **sweet band** sits somewhere on it. The player taps the
meter (or presses `E`) to strike the vein.

- **4 strikes per harvest.** Not a mash bar — a small budget of deliberate taps.
- **Perfect** (inner 35% of the band) = 3 purity. **Good** (rest of the band) = 1 purity.
  **Miss** = 0, breaks the streak, and imposes a 0.45s recovery lockout during which taps
  are swallowed.
- **Streak** multiplies purity (`1 + min(streak,6) × 0.15`), so consecutive perfects
  compound. The streak survives across harvests inside one node session.
- **Node richness** — `thin / solid / rich`, derived deterministically from the world seed
  and the node's tile coordinates (`nodeRichness()`), so no map-format change and every
  hero's world lays out its good veins differently. Richness widens the band and
  multiplies purity, which gives the map's resource nodes a reason to be chosen between.

The harvest itself is untouched: the same 5-second timer, the same **1 unit** of the same
material. Striking only decides *how good that unit is*.

Purity is banked per material (`materialPurity`), parallel to the existing `materials`
counts. Average purity per unit is the material's quality:

| purity / unit | quality | rarity | palette |
|---|---|---|---|
| 0 | Coarse | common | `gear/t1+common` |
| ≥ 2 | Fine | uncommon | `gear/t2+uncommon` |
| ≥ 5 | Superior | rare | `gear/t3+rare` |
| ≥ 8 | Masterwork | epic | `gear/t4+epic` |
| ≥ 11 | Flawless | legendary | `gear/t4+legendary` |

Perfect play on a rich vein tops out at the 12-purity cap → Flawless. Random mashing lands
around 1 purity → Coarse. Not playing at all is Coarse. That is the whole skill gradient.

## 4. Crafting — quality flows through, and the reveal

**Quality of your materials is the quality of your goods.** The output tier is the
qty-weighted average purity of the consumed inputs — no second timing minigame (§7).

1. **Consumables** scale by `QUALITY_MULT` (`coarse 1.0 → flawless 3.0`) on both the effect
   value and its duration. Coarse is exactly 1.0, so the idle player's numbers are byte-for
   -byte what they were.
2. **Gear recipes (new).** Eight new recipes — two per class — output an *equippable item*
   instead of a buff, at the rarity the material quality earned. This is the payoff: the
   in-world hero's accent palette is driven by `bestEquipmentRarity()`
   (`combatAdapter.ts:1057` → `heroWardrobe.heroPaletteId`), so equipping a Flawless
   crafted chest **visibly recolours the hero in the world scene**. Item quality is a
   palette id, exactly as `palettes.ts` premises — a good gathering session changes what
   you are wearing, at zero art cost.
3. **The craft result moment.** Auto-craft no longer happens silently: every completed
   craft posts a `lastCraft` reveal — rarity-tinted item card with the quality name and the
   effect it rolled. It auto-expires, so an idle player is never blocked by a modal.

Crafting consumes purity proportionally (`avgPurity × qty`), so you cannot hoard one great
unit and spend coarse ones; the stock has one average and spending draws it down evenly.

## 5. Auto-craft, and why it stays

Auto-craft is the idle player's crafting. The rule is now:

```
if a GEAR recipe is satisfiable AND its material quality is Superior or better → craft it
else                                                                          → today's first-match consumable (unchanged order)
```

The gear branch is **unreachable at purity 0** (coarse < superior). An idle player
therefore takes the identical consumable branch, in the identical recipe order, as before.
An active player's auto-crafter starts producing gear on its own. Engagement changed the
*kind and quality* of the output; it did not change the rate.

## 6. Idle & offline parity — how it is guaranteed

| Guarantee | Mechanism |
|---|---|
| Same gather rate | `GATHER_SECONDS = 5` is untouched and is now the single exported constant both the tick and the UI read. Strikes never touch the timer. |
| Same yield per harvest | Still exactly `+1` unit. Purity is a separate ledger. |
| Same craft outputs when idle | `QUALITY_MULT.coarse === 1.0` and `purityToQuality(0) === 'coarse'`. |
| Same auto-craft selection when idle | The new gear branch requires `superior`, which purity 0 cannot reach. |
| Offline / large-delta coherence | The gathering tick now **loops** harvests instead of dropping them, so one 5s catch-up delta yields the harvests it should have (previously a delta > 5s silently lost the surplus). Capped at 64 harvests per tick to bound a pathological delta. |
| The promise is visible | `engine/offline.ts` exports `projectGathering(seconds)`, the baseline model (units/min at coarse quality), and the gathering panel renders it — the idle floor is stated to the player, not just asserted here. |

`gatherSession` is transient and nulled in `rehydrateState`; `materialPurity` persists and
defaults to `{}` on any old save, so a pre-change hero simply starts with coarse stock.
No save-format break — the same additive pattern as `activeQuest` / `worldSeed`.

## 7. Where this departs from Track G

1. **Track G proposed different interactions per node type** (ore = rhythm strikes, herb =
   hold-and-release). Rejected for now: two input grammars double the tuning surface and
   the hold-and-release variant is hostile on touch. One meter, with *richness* varying its
   band width and *material tier* varying its sweep speed, already gives every node a
   different feel from the same component. The node-type split is cheap to add later on
   top of the same `resolveStrike()`.
2. **Track G proposed a second timing interaction at the forge** ("quality roll, stat
   effect, reveal"). Rejected as padding: repeating the gathering minigame at craft time
   teaches the player nothing new and doubles the tax on an idle game. Crafting instead
   became a *decision* (which recipe — cheap consumables now, or bank the good stock for a
   gear piece) plus a *reveal*. The skill lives in gathering; crafting is where it pays.
3. **Added, not in Track G: gear recipes.** Track G's closing loop ("a good session
   visibly changes the gear the hero is wearing") is not actually reachable while every
   recipe outputs a transient buff. Eight gear recipes are what make the palette
   through-line real.

## 8. Deliberately out of scope

- **Profession skill / mastery.** Quality is purely material-driven, which keeps the rule
  legible ("good materials, good goods"). A mastery curve is an obvious follow-up but it
  would blur the one thing this change is trying to teach.
- **Offline material awards.** `lastTickTimestamp` is now stamped on save so an offline
  award is computable, but granting materials for 8 offline hours is a balance decision
  (8h × baseline ≈ 5760 units) that belongs to whoever owns the economy, not to this
  refactor. `projectGathering()` is the hook when that call is made.
- **Canvas-side node FX.** The strike meter is a DOM overlay in the HUD shell (the same
  architecture as `MinimapRadar` / `UnitFrames`), not painted into the dimetric canvas.
  It reads as in-world without touching the renderer.
