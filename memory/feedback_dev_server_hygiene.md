---
name: dev-server-hygiene-and-hmr
description: "Kill background dev servers between test runs; the dimetric renderer can't Fast-Refresh so edits need a full reload"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 152efad9-c8c1-4f1a-b222-774f1fe36c1d
  modified: 2026-07-20T20:12:17.072Z
---

When verifying changes with headless Chrome, **kill each `vite` dev server after the run** — do not leave them piling up. In this session I spawned ~5+ background `npx vite --port NNNN` instances; the pileup poisoned the owner's browser view (blank/black map) even though the code rendered fine in every headless test, and cost a lot of trust + tokens chasing a phantom bug.

**Why:** multiple live Vite servers + stale HMR state fight over the same long-lived imperative canvas controller, leaving the running instance broken. The owner had to hard-refresh repeatedly. `pkill -f vite` then one clean server (`npm run dev -- --port 5174 --strictPort`) fixed it.

**How to apply:**
- After a headless screenshot/verify run, `kill` the server you started (track the PID). Periodically `pkill -f "vite"` if unsure.
- Reuse ONE running server for repeated screenshots instead of starting a new one each time.
- The "black viewport" the owner reported was almost never the code — headless rendered green 25+ times across every flow. Suspect environment (stale servers / HMR) first when headless can't reproduce.

**HMR gotcha:** the dimetric renderer (`src/render/adapter/combatAdapter.ts` `WorldSceneController`) is an imperative controller created once in `DimetricWorldScene`'s `useEffect([], ...)`. React Fast Refresh re-renders the host but never re-runs that effect, so editing combatAdapter leaves a STALE controller → "have to hard-refresh every time." Fixed with `if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())` at the end of combatAdapter.ts (dev-only; forces a clean full reload on hot-update). Keep that snippet; if other imperative render-core modules cause the same, add the same there. See [[project_living_world]] for the ambient system this controller drives.

**UPDATE (2026-07-20): the black map was ALSO a real code bug, not only servers.** `WorldSceneController.init()` assigned `this.rigs` (the flag `sync()` uses to gate the first ground bake) BEFORE an `await` and before spawning `this.player`. The game tick loop fires the store subscription continuously, so a `sync()` landing in that await window passed the guard while `this.player` was undefined, baked the ground, then threw on `this.player.tx=…` → live but player-less controller whose `renderFrame` throws every frame = black world canvas (HUD + minimap still render). Intermittent (race). Fixed in 45c2888 by assigning `this.rigs` LAST in init() + a `!this.player` guard in `sync()`. Lesson: still suspect stale servers first, BUT if the black map reproduces in a FRESH headless load (it did here), it's code — verify by sampling canvas pixels: alpha 0 across the grid = ground never drew (race), vs green = fine. The reusable CDP screenshot+sample driver lives in the session scratchpad (`shot.mjs` + a grid-sample eval); Node 25 has global WebSocket/fetch so no puppeteer install is needed.

**Verified pointer/zoom facts (07-20):** tap/click-to-move + a `scale`-based mobile/desktop zoom-out live on `WorldSceneController` (`moveTo`, `setZoom`, `visibleTileRadius`). Zooming out exposed ambient-group "unit pop" — the recycler must be FOV-aware (re-anchor beyond `visibleTileRadius`), not a fixed tile ring. `?noffta` query param forces committed placeholder art (tear-out A/B) without deleting `local-assets/`.
