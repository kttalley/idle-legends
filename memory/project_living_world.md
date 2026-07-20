---
name: living-world ambient MMO sim
description: Post-launch vision — populate the world with ambient AI heroes so the single-player idle game reads like a busy MMO server
metadata:
  type: project
---

User wants the world to feel like a living MMO: as the idle legend wanders a zone,
*other* heroes (same shape as the player — class/race/level + a `(spriteId, paletteId)`
look) roam the same tiles fighting monsters, questing, gathering, and interacting with
NPCs. Ambient agents, not networked opponents.

**Why:** it's the world-depth counterpart to the cosmetic-IAP + async-PvP strategy. The
dimetric renderer already depth-sorts/animates arbitrary entities, and a hero's identity
is just a few sprite/palette ids + stats, so spawning many ambient heroes is cheap
(population + a behavior tick, no new render work).

**How to apply:** documented as **Track L** in PLAN.md (living world / ambient MMO sim).
It composes with **Track P** (async ghost PvP) — ambient "NPCs" can be seeded from real
player roster snapshots, putting other players' cosmetics on display in the open world —
and leans on the LLM thought-bubble system for personality barks. Sequenced **post-
launch**, behind the graphics rebuild, [[steam-release-direction]] priorities, the Track R
rebrand, and the RevenueCat launch milestone. Not a launch blocker.
