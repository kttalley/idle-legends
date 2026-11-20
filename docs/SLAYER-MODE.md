# Slayer mode: an endless, procedural post-game (design, 2026-11-20)

Status: design only. Nothing here is built. Measurements are from the headless sim
(`node tools/sim/run.mjs --from-saves`, `--diagnose`) against real saves pulled 2026-11-19.

## 1. The problem this solves

After the final boss, Stillmarch loops the same 12 zones ("circuits"). That loop does not
work as a post-game:

- **It is trivial.** In the sim, real late heroes clear 10 to 15 laps an hour. Enemies get
  +50% health and damage per lap (`circuitMult = 1 + 0.5c`), which is linear and shrinking
  in relative terms, while loot rolls at the hero's level, so gear keeps pace with the hero
  automatically. One live hero is on circuit 59.
- **It had no levelling.** Every late hero was parked at 113 to 118 until 1.5.3, which now
  adds 2 levels of headroom per lap. That fixes "stuck", not "boring": the laps are still
  the same content, cleared in minutes.
- **There is no goal.** Nothing gets harder in a way the player has to answer.

The player brief: levelling should never stop, content can be recycled, and it should be
procedural and endless ("or to level 999").

## 2. The idea in one paragraph

Defeating the final boss for the first time opens **the Rift**: an endless descent of
procedurally generated floors. Each floor stitches together terrain from two or three of
the 12 biomes, fills it with a mixed roster drawn from every zone's enemies, and ends with
a remixed boss. Floors get harder **exponentially**, so every hero eventually meets a wall,
and pushing that wall back (gear, talents, upgrades, levels) is the game. Depth is the new
progression stat and gets its own ladder column. Circuits stay as they are for anyone who
prefers them.

## 3. Core rules

### 3.1 Floors

- A floor is one generated map plus a kill target, like a zone. Clearing the kill target
  spawns the floor boss; killing it opens the next floor.
- **Seeded by `(riftSeed, depth)`.** The same depth is the same floor for everyone in a
  season, so the ladder compares like with like. `riftSeed` rotates weekly (see 3.6).
- **Biomes:** each floor picks 1 to 3 biomes from the 12 (weighted so neighbours in the
  zone order blend well) and splits the map into regions, each painted with that biome's
  `BIOME_MAP_CONFIGS` (terrain chars, colours, water density, ore and herb colours).
  The renderer bakes the ground once per map per tileset, so phase 1 uses **one biome per
  floor** and phase 3 adds region blending (see 6).
- **Roster:** 3 to 5 enemy templates drawn from the chosen biomes' `mobs`, plus a chance of
  one "stranger" from any zone. Templates keep their sprites, attack speeds and names.
- **Boss:** one of the 12 zone bosses, renamed with an epithet ("Siege War Golem, Rift-born")
  and given one affix (3.4).

### 3.2 Difficulty curve

Enemy health and damage on floor `d`:

    riftMult(d) = RIFT_BASE * RIFT_GROWTH^d        (RIFT_GROWTH around 1.06 to 1.10, to tune)

applied to the template's base stats in place of `circuitMult`. Exponential growth is the
point: hero power grows roughly linearly with level and item level, so an exponential
enemy curve guarantees a wall at some depth for every hero, and each improvement moves the
wall by a shrinking amount (`log(1 + gain) / log(RIFT_GROWTH)` floors). That gives the slow,
always-possible climb idle games run on, instead of the current "nothing" or "everything".

`RIFT_BASE` should put floor 1 at about the difficulty of the final zone on circuit 0, so
entering the Rift is a step up, not a reset.

### 3.3 Levelling and the level-999 goal

- The Rift pays XP scaled to depth, not to the hero: a floor's XP line (`greyLevel`) is
  `110 + RIFT_LEVELS_PER_FLOOR * d`. Levelling is bounded by how deep you can go, which is
  bounded by the curve, so it cannot run away the way scaling XP to the hero did in the sim
  (300 to 7,000 levels an hour).
- **The pacing rule (designer's call, 2026-11-20): levels 900 to 999 take as long as levels
  1 to 900 did.** The same idea as RuneScape, where 92 is half of 99. Stated as a curve:
  each level takes about 0.7% longer to earn than the one before (`r = 2^(1/99) ≈ 1.00703`),
  so time per level doubles every 99 levels and the last 99 equal everything before them.
- The rule is about **time**, so it is tuned in the sim, not derived on paper: P0 adjusts
  `RIFT_GROWTH` and the XP line per floor until measured time per level on real saves
  follows `t(L) = t0 * r^(L - 110)`.
- `t0`, the time for level 110 to 111 in the Rift, sets the scale. At `t0 = 1 min`, level
  999 takes about 8.5 hours and 110 to 999 takes about 50 days of play (offline counts);
  at `t0 = 2 min`, about 17 hours and 100 days. Target: a dedicated player reaches 999 in
  two to four months.
- `RIFT_LEVELS_PER_FLOOR = 2` (level 999 around floor 445) is the starting point for that
  tuning, not a commitment.
- Talent points stay capped at 100 (`TALENT_POINT_MAX`). Levels past 100 keep raising stats.

### 3.4 Affixes

Elites and floor bosses roll one affix per 10 floors, from a small authored list, for
example: *Hasted* (attack speed), *Thorned* (reflect), *Warded* (damage shield that must be
broken first), *Vampiric* (heals on hit), *Splitting* (spawns two weaker copies on death).
Affixes are the variety that a pure stat multiplier lacks, and each is one rule in the
existing combat path.

### 3.5 Rewards

- Loot rolls at `max(hero level, floor item level)` with rarity bias rising slowly with
  depth, so deep floors are where better gear comes from.
- Gold scales with `riftMult` at a lower exponent than health, so gold sinks (bag slots,
  upgrades) stay meaningful.
- A **depth milestone** every 25 floors: a guaranteed drop and a title on the ladder.

### 3.6 Ladder and seasons

- New ladder column: **deepest floor this season**, beside level and power.
- Weekly seasons reset only the Rift ladder column (not the hero). The seed rotates so the
  floors are new each week.
- Duels are unaffected: they already resolve from stats.

### 3.7 Offline

Offline progress in the Rift farms the **deepest floor cleared minus 5** at the measured
rate, and never descends. Going deeper is something you come back and do, the same
principle `offlineLevelCeiling` already follows.

### 3.8 How it coexists with circuits

The Rift is a separate place, entered from the final zone or the map. Circuits keep
working (with the 1.5.3 levelling). A hero can leave the Rift at any time and keeps their
best depth.

## 4. What the measurements say so far

| Measurement (sim, real saves) | Result |
|---|---|
| Laps per hour, strong post-game hero | 10 to 15 |
| Levels per hour if kill XP scales with hero level | 300 to 7,000 (runaway) |
| Levels per hour with 1.5.3 lap-gating (2 per lap) | catches up in ~20 min, then ~2 per lap |
| Stuck at a boss gate by a fall-back block | 1 of 10 saves; fixed on branch `endless-levelling` (d77dbd8, not released) |

## 5. Open questions for the designer

1. **Name.** "The Rift", "Slayer", "The Descent", "The Maw Below"? Should it be tied to the
   final zone (The Maw Eternal) in the fiction?
2. **How steep is the wall?** Gentle (most players reach floor 100) or steep (floor 100 is
   an achievement)? This sets `RIFT_GROWTH`.
3. **Seasons:** weekly, monthly, or none?
4. **Should circuits eventually retire** in favour of the Rift, or stay as the relaxed mode?
5. **Monetization:** none planned. Standing Orders (offline hours) already applies to Rift
   farming through 3.7, which seems right.

## 6. Build plan (each phase shippable on its own)

| Phase | Scope | Proves |
|---|---|---|
| P0 | `engine/rift.ts`: floor generator (seeded biome pick, roster, boss, affix stub) and `riftMult`. Sim only: `--rift` runs real saves down the Rift and reports depth per hour and the wall. | the curve, before any UI |
| P1 | Enter/leave the Rift; one biome per floor (reuses existing tilesets); depth counter in the HUD; saves store `riftDepth` and `riftBest`. | the loop is fun |
| P2 | Affixes; depth milestones; Rift loot table. | variety |
| P3 | Region blending (multiple biomes per floor) in `mapGen` and the tilemap bake. | the "procedural" feel |
| P4 | Ladder column, weekly seed rotation, season reset. | competition |

Every phase runs `--assert` (economy invariants, offline parity, loot fidelity, save
migration) plus a new invariant: **offline in the Rift never out-earns online**, and
**depth never decreases from offline progress**.

## 7. Research findings and recommendations (2026-11-20)

Three research passes (game design, interaction design, comparable games) against this
draft. Recommendations below; items marked **[decide]** need the designer's call.

### 7.1 The curve math in section 3 does not close (most important)

Hero power grows roughly polynomially with level and item level (loot rolls at hero level).
Even a generous ~1,000x hero gain from level 110 to 999 only survives about
`log(1000) / log(growth)` floors: ~118 at 1.06, ~72 at 1.10. Level 999 at floor 445 needs
growth near **1.016**, or a hero-side multiplier that compounds, or both. With depth-gated
XP and 1.06 to 1.10, levels would stall around 250 to 350.
**Recommendation:** start P0 at growth ~1.015 to 1.02 **plus** a small Rift-earned
permanent multiplier (3.9), and make the first sim output "the floor where hero power
equals riftMult" for each real save.

### 7.2 Name **[decide]**

Avoid **Rift** (registered US word mark for an MMO; also Diablo III's "Greater Rift") and
**Slayer** (a skill in RuneScape and Melvor). Also avoid Delve, The Pit, Nightmare, Abyss,
Descent, Breach, and "The Maw Below" (WoW's endless tower sits in a zone called The Maw).
Shortlist: **The Undermaw** (beneath The Maw Eternal; clearest tie to the finale and to the
Hollow Crown), **The Gullet**, **The Eternal Wound**. Trademark checks were web searches only.

### 7.3 Wall steepness: tune by time

Targets for a hero who has beaten the final boss: floor 25 on day one, 50 in week one,
100 in about a month, 200 as a multi-month goal. These replace "share of players", which
means nothing at ~50 players.

### 7.4 Seasons **[decide]**

No weekly seasons: with ~25 players per platform they mean empty boards and the same
winner. Ship a permanent **deepest ever** column; add a monthly column only past 100+
active players. Keep the floor seed **fixed** (or rotate monthly): same floors for everyone
removes "fishing" for easy maps, Diablo III's biggest ladder complaint. Seeds need a
minimum enemy density so no floor is a dud.

### 7.5 Circuits stay, capped

Keep circuits as the relaxed mode, but cap circuit levelling at the XP line of the hero's
best floor. At 2 levels per lap and 10 to 15 laps an hour, circuits would otherwise become
the fastest XP and undercut the 999 pacing.

### 7.6 Offline

Keep "best floor minus 5, never descends". Pay ~75% of the measured online rate, cap the
window (Standing Orders extends it), and add a short "rested" bonus on return. Add an
online **farm** toggle at best minus 5 (and "Push deeper when ready"), so closing the app is
never the best option.

### 7.7 Affixes: answerable by build

The player is usually not watching: no one-shots, nothing that hard-counters one class
(Diablo IV removed affixes like that). Each affix should push a gear or talent choice
(Warded rewards burst). Each has a fixed shape glyph, name and one-line rule; colour is
never the only signal; one screen-reader announcement per floor; Reduce Motion swaps
pulses for a static outline.

### 7.8 Show the level limit everywhere

"Lv 184 / limit 190" on the XP bar, the limit in its accessible value, and the rule in
words ("Floor 40 teaches up to level 190. Floor 41 teaches up to 192."). This is the direct
fix for "How can level up more than 113?" and applies to circuits today, before any of
the new mode ships.

### 7.9 Milestones and a cooperative hook

Every 25 floors: a milestone boss (the Hollow Crown is the natural fit), a guaranteed drop
and a ladder title. Every 100 levels: a title or cosmetic, with a big one at 999 (the goal is
the milestones, not the number). For a tiny audience, borrow AFK Arena's King's Tower:
the first player to reach a milestone floor unlocks a small reward for everyone.

### 7.10 Monetization

Nothing paid moves depth or ladder rank. Standing Orders feeding offline farming is fine
(offline never descends). No paid revives, skips, multipliers or random caches (random
paid items trigger odds disclosure on both stores). At most, a one-time cosmetic.

### 7.11 Engineering risks

- Big numbers: `growth^d` passes 2^53 eventually; check ladder/backend column types
  (`roster_snapshots.power` is `bigint`), damage formatting, and add suffix notation.
- Ladder UI: a Level | Power | Depth segmented control instead of more columns; rank depth
  ties by who got there first; pin the player's own row with neighbours.
- Existing gaps the new mode makes worse: the offline summary has no accessible role, and
  ladder names show faction by colour only.
