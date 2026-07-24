# Plan: Zone Progression & Quest Framework

**Status:** draft plan — awaiting approval.

## Goal

Replace the dev-only zone dropdown with a real, level-and-boss-gated zone progression. Add lightweight auto-generated quests between zones, hide the dev jump behind a URL flag, and enhance faction-specific flavor in contested/Horde zones.

## Current state

- `gameStore.ts` unlocks zones on level up by checking `level >= zone.levelRange[0]`, ignoring zone order. A level 10 character can already select `the_maw_eternal`.
- Boss death already unlocks `zone.nextZone`, but this is moot because level unlocks everything first.
- `devJumpZone` is visible in the top bar of `App.tsx`.
- `ZoneSelector` shows kills/boss status but does not explain lock reasons.
- Towns have `faction` and `type` fields, but hostility is only decorative.

## Approach

### 1. Progression rules

Introduce a `src/engine/zoneProgression.ts` helper module:

```typescript
export interface ZoneProgressionState {
  zoneId: ZoneId
  unlocked: boolean
  reason: 'available' | 'locked_boss' | 'locked_level'
  prerequisiteZone?: ZoneId   // boss of this zone must be defeated
  requiredLevel: number
}

export function getZoneProgression(
  state: Pick<GameState, 'level' | 'bossesDefeated' | 'unlockedZones'>
): ZoneProgressionState[]

export function canUnlockZone(
  zoneId: ZoneId,
  level: number,
  bossesDefeated: ZoneId[],
  unlockedZones: ZoneId[]
): boolean
```

Rules:
- A zone is unlocked if its prerequisite zone's boss is defeated AND `level >= zone.levelRange[0]`.
- `sunhollow_meadows` has no prerequisite.
- Prerequisite = previous zone in `ZONE_ORDER`; computed from `ZONES[z].nextZone` rather than hard-coded.
- On level up, only newly eligible zones that also meet the boss prerequisite are added.
- On boss death, the next zone is unlocked immediately if the level requirement is met; otherwise it becomes "unlocks at level X" and is added automatically when that level is reached.

### 2. Lightweight quest system

Add to `GameState`:

```typescript
interface ZoneQuest {
  id: string           // "quest:sunhollow_meadows"
  zoneId: ZoneId
  title: string
  description: string
  levelReq: number
  killsReq: number
  bossId: string
  rewardZoneId?: ZoneId
  completed: boolean
  claimed: boolean     // true once "Venture Onward" is clicked or dismissed
}
```

Quests are auto-generated from `ZoneConfig` + player faction:

```typescript
export function makeZoneQuest(zone: ZoneConfig, playerFaction: FactionType): ZoneQuest
```

Lifecycle:
1. When entering a zone (travel complete or initial spawn), if the zone boss is not yet defeated, set `activeQuest` to that zone's quest.
2. On kill: progress is read from existing `totalZoneKills`.
3. On boss death: mark quest `completed`. Show a toast offering travel to `rewardZoneId`.
4. Clicking **Venture Onward** calls `beginTravel(rewardZoneId!)` and marks the quest `claimed`.
5. Clicking **Stay** marks the quest `claimed` without traveling; the next zone remains unlocked in the selector.
6. Arrival at a new zone starts its quest.

Only one active quest is shown at a time.

### 3. Store changes (`src/store/gameStore.ts`)

- Add `activeQuest: ZoneQuest | null` and `completedQuestIds: string[]` to `GameState` and `defaultState()`.
- Replace the level-up unlock loop with `canUnlockZone`.
- Refactor boss-death handling to use the new helper and quest flow.
- Add actions:
  - `claimQuestReward(questId: string)` — starts travel if reward zone is unlocked and not current.
  - `dismissQuestReward(questId: string)` — marks claimed without traveling.
- In `rehydrateState`, backfill new fields and reconstruct `activeQuest` from `currentZone` if missing.

### 4. Dev flag

In `App.tsx`, hide the jump dropdown unless the URL contains `?dev=1`:

```typescript
const showDevJump = new URLSearchParams(window.location.search).has('dev')
```

When hidden, normal progression is the only way to move forward.

### 5. UI components

**Create `src/components/game/QuestToast.tsx`**
- Renders when `activeQuest?.completed && !activeQuest?.claimed`.
- Shows quest title, "Quest Complete!", reward zone name, and two buttons:
  - **Venture Onward** — travels to the next zone.
  - **Stay** — dismisses the toast.

**Edit `src/components/game/ZoneSelector.tsx`**
- Use `getZoneProgression` for lock state.
- Replace "🔒 Locked" with the actual reason:
  - "Defeat `[BOSS]` in `[prerequisite zone]`"
  - "Reach level `[requiredLevel]`"
- Keep kill/boss status for unlocked zones.

**Edit `src/components/game/TownView.tsx`**
- If the town is hostile to the player's faction (`town.type === 'hostile'` and `town.faction === opposingFaction`), disable **Rest** and show a warning label.
- Keep vendor/repair labels as-is.

**Edit `src/App.tsx`**
- Conditionally render the dev dropdown.
- Render `<QuestToast />` inside the game layout.

### 6. Save compatibility

- New fields default in `rehydrateState`.
- Old saves load with `activeQuest: null`; reconstruction from `currentZone` happens during rehydration so the player immediately sees their current-zone quest.
- No save-format version bump is required because all new fields are additive with safe defaults.

### 7. Faction flavor in contested/Horde zones

Use existing `hostileToFaction` and town `type`/`faction` fields.

- **Towns:** Alliance players in Horde towns (Ironcrag Hold, Wardrum Bastion) cannot rest. Horde players in Alliance towns cannot rest. Neutral towns remain neutral.
- **Quest text:** generated by `makeZoneQuest` using faction-aware phrasing. For example:
  - Alliance player in Horde zones: "Push into Ashmarch lands and break their line."
  - Horde player in the same zones: "Reclaim your clan's lands from the intruders."
- No new art or zones are required; the difference is narrative and town-service gating.

### 8. Edge cases

- **Final zone loop:** defeating the Maw boss increments `zoneCircuit`, resets bosses, and sends the player back to Sunhollow. The quest system will generate a new Sunhollow quest on arrival.
- **Boss lost but not killed:** `persistedBoss` preserves HP; quest remains active and progress is unchanged.
- **Manual travel to old zone:** active quest switches to that zone's quest if its boss is not defeated.
- **Leveling while traveling:** unlock checks run on the next tick after travel completes.

## Files to edit / create

- **Create** `src/engine/zoneProgression.ts` — unlock rules and quest generation.
- **Create** `src/components/game/QuestToast.tsx` — quest-complete toast.
- **Edit** `src/data/types.ts` — add `ZoneQuest` and `ZoneProgressionState` types.
- **Edit** `src/store/gameStore.ts` — wire progression helper, quest state, and actions.
- **Edit** `src/components/game/ZoneSelector.tsx` — display lock reasons.
- **Edit** `src/components/game/TownView.tsx` — enforce faction hostility for rest.
- **Edit** `src/App.tsx` — hide dev dropdown behind URL flag, mount QuestToast.

## Validation

- `npm run build` passes.
- Manual playtest:
  - New hero starts in Sunhollow with an active quest.
  - Reaching level 10 alone does **not** unlock Dustwind Plains.
  - Defeating the Elder Meadow Beast unlocks Dustwind Plains and shows the quest toast.
  - Clicking **Venture Onward** starts travel.
  - Adding `?dev=1` to the URL restores the dev dropdown.
  - Alliance player in Ironcrag Hold sees the rest button disabled.
- Existing saves load and reconstruct an active quest from their current zone.

## Open questions

1. Should completed quests be persisted as history, or is the derived `bossesDefeated` list enough? (Plan persists `completedQuestIds` only to prevent toast repeats; it is not player-facing history.)
2. Should quest toast auto-dismiss after a timeout? (Plan: no — the player chooses to venture or stay.)
3. Should towns with `type: 'hostile'` also disable vendor access? (Plan: no — hostile vendors still sell, but rest is denied.)
