# Plan: Idle vs Manual Override Modes + Real-Time Manual Combat

**Goal**  
Add an explicit idle / manual control layer. When the player is actively controlling the hero (WASD, click-to-move, ability use, target selection), the game is in **manual** mode: top-down, WoW-like control over movement and abilities. After **15 seconds** without manual input — or if a roaming mob ambushes the hero — control falls back to **idle** auto-pilot.

**Design choices I’m carrying forward**
- Manual mode uses the existing real-time attack cadence (`playerAttackAccum` / `mobAttackAccum` driven by rAF delta). Once you have a target and are in range, auto-attacks keep firing while you move/use abilities.
- Manual mode does **not** auto-select the nearest mob; you choose the fight. Idle mode resumes full auto-targeting.
- A roaming-mob ambush only triggers while you are in manual mode and not already fighting, and it forces you back to idle so the auto-combat takes over.

---

## 1. State model

**Files:** `src/data/types.ts`, `src/store/gameStore.ts`

- Add to `GameState`:
  - `controlMode: 'idle' | 'manual'` — default `idle`.
  - `manualIdleTimer: number` — seconds remaining until fallback; default `0`.
- Add actions to `GameActions`:
  - `setControlMode(mode: 'idle' | 'manual')` — switches mode; resets timer to `15` when entering manual.
  - `bumpManualInput()` — forces manual and resets timer to `15`; safe to call repeatedly.
- Backfill both fields in `defaultState()` and `rehydrateState()`.
- In the combat tick:
  - When `controlMode === 'manual'`, decrement `manualIdleTimer` by `deltaSeconds`.
  - When `manualIdleTimer <= 0`, switch to `idle`, clear `targetLocked` equivalent state, and log `"Manual control released — resuming idle patrol."`.
  - Only auto-select a nearest mob when `controlMode === 'idle'`.

---

## 2. Input wiring — what counts as manual control

**Files:** `src/components/game/DimetricWorldScene.tsx`, `src/components/game/SkillBar.tsx`

Call `useGameStore.getState().bumpManualInput()` on:
- `DimetricWorldScene` keydown for movement / jump / arrows.
- `DimetricWorldScene` accepted pointer tap (ground move, enemy select, NPC, ambient hero).
- `SkillBar` ability click and `1`/`2`/`3` hotkey.

Also make `activateAbility` itself call `bumpManualInput()` so every ability use keeps the player in control regardless of UI entry point.

---

## 3. Adapter behavior on mode changes

**File:** `src/render/adapter/combatAdapter.ts`

- Track `lastControlMode` locally inside `sync()`.
- On `manual -> idle` transition:
  - Clear `this.manualMode`, movement input, `tapMoveActive`, and `targetLocked` so auto-follow resumes immediately.
  - Do not write to the store; the adapter already stays read-only.
- While `controlMode === 'idle'`, treat any stale manual input as released (defensive; the host already calls `clearInput()` on blur).
- Add a subtle player-gold aura / ring when `manualMode` is active so manual control is visible in-world.

---

## 4. Roaming-mob ambush (forced idle fallback)

**File:** `src/store/gameStore.ts`

- In the population/spawn block of the combat tick, when a new non-boss mob is added while:
  - `controlMode === 'manual'`,
  - hero is alive,
  - `gameMode === 'combat'`,
  - no mob is currently engaged,
  - roll a chance (e.g. `0.25`) for the spawn to be an **ambush**.
- Ambush behavior:
  - Set that mob as `currentMob` with a small offset (~2 tiles) so it closes fast.
  - Set `controlMode` to `'idle'`, reset `manualIdleTimer`.
  - Log: `"A roaming {name} notices you and attacks!"`.
  - `resetCombatAccumulators()`.
- Add a short anti-chain cooldown so a single manual stroll doesn’t draw three ambushes back-to-back.

---

## 5. Real-time manual combat

The combat loop is already real-time (accumulators advance by `deltaSeconds`). The enhancement is giving the player live access to it:

- Movement and target selection are immediate.
- Abilities fire instantly / channel as before.
- Once a target is selected and the store considers it engaged, auto-attacks resolve on the hero’s normal attack interval.
- In manual mode with **no** target selected, the hero does not auto-acquire a mob; you can run around freely.

No changes to damage formulas or swing resolution — this is a control-layer feature, not a combat rebalance.

---

## 6. HUD feedback

**File:** `src/components/game/hud/ActionBar.tsx`

- Add a mode toggle button next to the existing mode/town buttons.
  - Label: `🤖 Idle` when idle, `🎮 Manual` when manual.
  - Clicking it toggles via `setControlMode`.
- When manual, show the remaining timeout as a small conic sweep over the button, matching the skill-bar cooldown visual language.
- Add a short toast/log entry when the mode changes (manual entry, timeout fallback, ambush fallback).
- Keep the button compact; on touch it uses the same 36 px sizing as other action-bar buttons.

---

## 7. Files to edit

1. `src/data/types.ts` — add `controlMode` and `manualIdleTimer` to `GameState`; add actions.
2. `src/store/gameStore.ts` — implement actions, tick decay, ambush logic, auto-target gating.
3. `src/render/adapter/combatAdapter.ts` — react to mode changes in `sync()`, manual visual cue.
4. `src/components/game/DimetricWorldScene.tsx` — wire movement/tap input to `bumpManualInput()`.
5. `src/components/game/SkillBar.tsx` — wire ability use to `bumpManualInput()`.
6. `src/components/game/hud/ActionBar.tsx` — add mode toggle + timeout sweep.

---

## 8. Validation

- `npm run build` passes.
- WASD / click-to-move switches the action bar to **Manual**.
- Pressing `1`/`2`/`3` keeps/resets **Manual**.
- Standing still for 15 seconds reverts to **Idle** and the hero resumes auto-follow.
- Manually wandering can trigger a roaming ambush; the button flips to **Idle** and combat begins.
- Existing idle play is unchanged when the player never touches controls.
