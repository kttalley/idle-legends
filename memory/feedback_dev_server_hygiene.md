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
