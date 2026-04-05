---
name: Steam release direction
description: Planned commercial release path — Tauri desktop wrapper for Steam, with feature priorities discussed
type: project
---

Steam release is the target. User has never published a game before.

**Why:** Idle RPG genre is proven, the LLM thought bubbles + generative pixel avatars are genuine differentiators. Melvor Idle (WoW-inspired browser idle → Steam) is the closest comp and proof of concept.

**How to apply:** Prioritize content depth and prestige loop before porting. Don't over-engineer the port — it's just `npx tauri build`.

## Agreed plan

- **Platform:** Steam first (~$4.99), mobile port later using Steam feedback/revenue
- **Port method:** Tauri (not Electron) — wraps existing Vite/React app, zero code changes needed, produces .dmg/.exe/.deb
- **No Steamworks SDK required to ship** — achievements/cloud saves are optional additions

## Feature priorities discussed

1. **Prestige / ascension system** — most critical retention mechanic for the genre
2. **Achievement system** — goals + shareability
3. **Lean into LLM thought bubbles** — most unique feature, currently understated; make mob personalities react to combat events
4. **Guild/party system** — AI companions with generative avatars
5. **Sound design** — even 8-bit sfx dramatically changes feel
6. **Onboarding** — "wow moment" needed in first 60 seconds for new players
7. **Content width** — more zones, classes, items before launch

## GBA demake note

User mentioned a GBA demake aesthetic. Discussed as a visual direction, not a platform pivot. The generative avatars already have retro DNA — could lean into GBA color palette + scanline aesthetic without rebuilding anything.
