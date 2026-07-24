# Idle Legends

A browser-based idle RPG with ASCII world exploration, generative pixel avatars, talent trees, and class-based professions. The game runs entirely in the browser with no server required — progress is saved automatically to `localStorage`.

---

## Overview

Idle Legends is a fantasy idle RPG built with React and TypeScript. Your champion explores a procedurally-generated world map, fighting monsters, gathering resources, crafting consumables, and growing stronger through a talent tree system. Combat, gathering, and crafting all happen automatically once you set your preferred mode — you watch, react, and make strategic decisions about where to go and how to build your character.

---

## Features

- **ASCII World Map** — A biome-driven terrain map with dynamic weather effects (rain, fog, blizzard, sandstorm, aurora) rendered in real time.
- **Generative Pixel Avatars** — Each character and monster is rendered as a seeded 5x5 pixel grid with bilateral symmetry, producing unique sprites for every entity.
- **4 Playable Classes** — Warrior, Mage, Rogue, and Warlock, each with distinct base stats, abilities, and a dedicated talent specialization tree.
- **Talent Trees** — Four specialization trees (Ironcleave, Glacial Rite, Shadowed Edge, Voidweave) with rank-based nodes and prerequisite chains.
- **Gathering & Crafting Professions** — Each class has a unique gathering skill and a crafting profession producing class-appropriate consumables.
- **Map-Driven Idle Gameplay** — Combat and gathering are proximity-based; enemies approach from the map and engage automatically when in range.
- **Zone Travel System** — Unlock and travel between multiple zones with escalating difficulty, each with unique biome aesthetics, mob rosters, and a zone boss.
- **Offline Progression** — Catch-up mechanics calculate progress earned while the tab was closed.
- **AI-Generated Names** (optional) — Zone and character names can be generated via an Ollama endpoint for a unique experience each run. Set `VITE_LLM_URL` at build time; without it the game uses deterministic fallback content and never calls out.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 |
| Language | TypeScript |
| Build Tool | Vite 5 |
| State Management | Zustand |
| Styling | Tailwind CSS |

---

## Getting Started

**Prerequisites:** Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

To build for production:

```bash
npm run build
```

---

## How to Play

1. **Choose a class** on the title screen. Each class has different strengths and a unique profession.
2. **Combat starts automatically** once you enter a zone. Your character attacks and uses abilities without input.
3. **Switch modes** using the mode buttons (sword / pickaxe / hammer) in the combat panel to toggle between fighting, gathering, and crafting.
4. **Travel between zones** using the Zones panel on the left. Zones unlock as you level up and defeat zone bosses.
5. **Spend talent points** (awarded on level-up) in the Character panel to strengthen your specialization.
6. **Equip loot** dropped by monsters via the Inventory panel. Click an item to equip it; tab between Equipment and Inventory views.

---

## Project Structure

```
src/
  components/
    game/        # Main game panels: CombatView, ZoneSelector, InventoryPanel, etc.
    sprites/     # Generative pixel avatar renderer
    ui/          # Shared UI primitives: HealthBar, Tooltip, GoldDisplay
  data/
    talents/     # Per-class talent tree definitions
    abilities.ts # Active ability definitions
    classes.ts   # Class stat blocks and metadata
    items.ts     # Item templates and loot tables
    professions.ts # Gathering materials, crafting recipes, biome configs
    zones.ts     # Zone definitions, mob rosters, level ranges
    types.ts     # Shared TypeScript types
  engine/
    combat.ts    # Attack resolution, DoT/buff logic, stat compilation
    gameLoop.ts  # Main tick loop (combat, gathering, crafting, travel)
    loot.ts      # Loot roll logic
    mapGen.ts    # ASCII terrain and weather generation
    nameGen.ts   # AI name generation (requires local Ollama)
    offline.ts   # Offline catch-up calculation
    progression.ts # XP curve and leveling
  store/
    gameStore.ts # Zustand store: all game state, actions, save/load
  index.css      # Global styles and custom UI component classes
  main.tsx       # React entry point
index.html
```
