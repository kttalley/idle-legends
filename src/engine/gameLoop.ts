import { useGameStore } from '../store/gameStore'
import { AUTOSAVE_INTERVAL_MS } from '../data/constants'

let rafId: number | null = null
let lastTime = 0
let lastSaveTime = 0

export function startGameLoop() {
  if (rafId !== null) return  // already running

  lastTime = performance.now()
  lastSaveTime = performance.now()

  function frame(now: number) {
    const deltaMs = Math.min(now - lastTime, 5000)  // cap delta at 5s to avoid huge ticks
    lastTime = now

    const store = useGameStore.getState()
    if (store.initialized) {
      store.tick(deltaMs / 1000)

      // Autosave
      if (now - lastSaveTime > AUTOSAVE_INTERVAL_MS) {
        store.saveGame()
        lastSaveTime = now
      }
    }

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)
}

export function stopGameLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}
