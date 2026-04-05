---
name: Character persistence and save slots
description: Current single-slot localStorage save needs to become a multi-character system with a select screen
type: project
---

Current save system uses a single key `idle_legends_save_v2` in localStorage (src/store/gameStore.ts). Only one character at a time — New Game wipes everything.

**Why:** As the game grows (races, factions, 12+ zones, prestige loop) players will want multiple characters and the ability to resume a specific run. Single-slot also means a misclick on "New Game" destroys progress permanently.

**What's needed:**
- Save slots: store an array of save summaries + full state blobs, keyed by slot ID
- Character select screen: shown on app load (before ClassSelect), lists existing saves with name/class/race/level/faction/last-played date
- Each card shows the generative player name, avatar (AvatarRenderer with saved seed), faction name, zone progress
- Actions per slot: Continue, Delete (with confirm)
- "New Character" button enters the existing ClassSelect → RaceSelect flow
- Max slots: 3-5 reasonable for a casual idle game

**How to apply:**
- Design the save key as `idle_legends_saves_v1` → `{ slots: SaveSlot[] }` where each slot has `{ id, createdAt, lastPlayedAt, summary: { playerName, playerClass, playerRace, playerFaction, factionNames, level, currentZone, zoneCircuit }, state: GameState }`
- The full GameState is still serialized per-slot — same as today, just namespaced
- CharacterSelect screen sits above ClassSelect in the App.tsx render tree: if slots exist → show CharacterSelect, "New Character" → ClassSelect
- AvatarRenderer seed for the select screen: `hashStr(playerClass) ^ (level * 7)` — same formula as CombatView so the avatar matches the actual character
- loadGame/saveGame/resetGame actions need to be slot-aware

**Note:** This is a Steam-launch-critical feature. Without it, players lose everything on a misclick and there's no way to try different class/race combos without destroying a run.
