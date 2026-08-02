import { useGameStore } from '../store/gameStore'
import { AUTOSAVE_INTERVAL_MS } from '../data/constants'

let rafId: number | null = null
let lastTime = 0
let lastSaveTime = 0

export function startGameLoop() {
  if (rafId !== null) return  // already running

  lastTime = performance.now()
  lastSaveTime = performance.now()

  let loggedFrameErr = false

  function frame(now: number) {
    const deltaMs = Math.min(now - lastTime, 5000)  // cap delta at 5s to avoid huge ticks
    lastTime = now

    // Schedule the NEXT frame BEFORE running the body, and swallow whatever the body
    // throws. Previously this sat at the end, so any exception out of tick() or
    // saveGame() ended the rAF chain for good — and because `rafId` stayed non-null,
    // startGameLoop()'s `already running` guard meant nothing could restart it either.
    // A full localStorage (setItem throwing QuotaExceededError on the autosave path)
    // therefore presented as the entire game freezing until a reload. The scene's own
    // loop in DimetricWorldScene already uses this ordering for the same reason.
    rafId = requestAnimationFrame(frame)

    try {
      const store = useGameStore.getState()
      if (store.initialized) {
        store.tick(deltaMs / 1000)

        // Autosave
        if (now - lastSaveTime > AUTOSAVE_INTERVAL_MS) {
          store.saveGame()
          lastSaveTime = now
        }
      }
    } catch (err) {
      // Log once: a throw that repeats every frame would flood the console and make the
      // real first error impossible to find.
      if (!loggedFrameErr) { console.error('[gameLoop] tick threw:', err); loggedFrameErr = true }
    }
  }

  rafId = requestAnimationFrame(frame)
}

export function stopGameLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}
