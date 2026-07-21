# Plan: Avatar System — Race/Class FFTA Sprites in Select & Create

**Status: implemented 2026-07-20. Build passes.**

## Goal
Unify the character portrait / avatar experience with the new FFTA roster logic already driving the world scene. The character-creation preview and character-select cards should show the actual race/class/name sprite the hero will wear in-game, with a deterministic fallback when the gitignored FFTA scaffold is absent.

## Approach

### 1. New `HeroAvatar` component (`src/components/sprites/HeroAvatar.tsx`)
A reusable, canvas-based avatar that renders one FFTA job sprite (or placeholder rig) with the correct palette.

- **Sprite selection**: `heroSpriteId(race, class, name)` from `src/render/adapter/fftaRoster`.
- **Palette**: `heroPaletteId(class, race, faction, rarity)` from `src/render/adapter/heroWardrobe`.
- **Rendering**: a single `Scene` entity on a small pre-baked ground patch, same technique as `HeroPreview`.
- **Props**: `race`, `playerClass`, `name`, `faction`, `rarity?`, `size?` (default 84), `animate?` (default true), `facing?` (default `'se'`), `circle?` (default true), `showGround?` (default true).
- **Fallback**: when `?noffta` is present or the sprite fails to load, render the existing `AvatarRenderer` procedural avatar instead, seeded by `hashStr(name) ^ hashStr(class)` and using the class palette. This keeps the screens usable with no local assets.
- **Loading**: use `loadSpriteOrPlaceholder` with `makeHumanoidRig('rig/humanoid')` as the tear-out fallback.

### 2. Shared sprite cache context (`src/components/sprites/SpriteCache.tsx`)
`HeroAvatar` instances on the select screen can share already-loaded sprites instead of each fetching the same JSON. A lightweight React context:

- `getSprite(id: string): Promise<IndexedSprite>`
- Caches by id in a ref-backed map.
- `loadSpriteOrPlaceholder` is the underlying loader.
- Used by `HeroAvatar`; `HeroPreview` can also opt in.

### 3. Refactor `HeroPreview` (`src/components/game/HeroPreview.tsx`)
Keep its public API and the larger grass-patch frame, but internally delegate sprite selection/palette to `HeroAvatar` (or share a helper). Make it accept an optional `name` prop so the preview matches the generated/edited name and therefore the in-game sprite.

### 4. Update `CharacterCreate` (`src/components/game/CharacterCreate.tsx`)
- Pass the generated `name` into `HeroPreview` so the sprite is deterministic and consistent with the world.
- No layout changes.

### 5. Update `CharacterSelect` (`src/components/game/CharacterSelect.tsx`)
- Replace the `AvatarRenderer` card portrait with `HeroAvatar`.
- Size: 84×84 on the 220 px cards (smaller than creation preview, consistent with card scale).
- `faction` from slot summary; rarity not stored in summary, so default to `'common'`.
- Keep the procedural `AvatarRenderer` as the no-asset fallback via `HeroAvatar`'s fallback behavior.

### 6. Leave legacy `CombatView` avatar path unchanged
The legacy ASCII/combat view (`!DIMETRIC_ENABLED`) still uses `AvatarRenderer`. It is currently disabled (`DIMETRIC_ENABLED = true`) and out of scope for this change.

## Files to edit / create
- **Create** `src/components/sprites/HeroAvatar.tsx`
- **Create** `src/components/sprites/SpriteCache.tsx`
- **Edit** `src/components/game/HeroPreview.tsx`
- **Edit** `src/components/game/CharacterCreate.tsx`
- **Edit** `src/components/game/CharacterSelect.tsx`

## Validation
- `npm run build` passes.
- `npm run lint` (if configured) passes.
- In dev:
  - Character creation preview changes sprite when class/race/name changes.
  - Character select cards show race/class-specific sprites.
  - `?noffta` renders procedural avatars instead of FFTA sprites on both screens.

## Open question
Should the avatar also support a "dead" pose / hit-flash for future HUD use? The initial scope keeps it simple (idle only), but the component structure can later add `anim`/`hitAnim` props without breaking callers.
