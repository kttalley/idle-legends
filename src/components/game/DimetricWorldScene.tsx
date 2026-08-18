import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { WorldSceneController, CSS_SCALE } from '../../render/adapter/combatAdapter'
import { setSelectedHero } from '../../engine/selection'
import { refreshGhostRoster } from '../../net/ghostRoster'
import { buildSnapshot } from '../../net/snapshot'
import { CombatDebugReadout } from './CombatDebugReadout'
import { BossBeacon } from './BossBeacon'

// Phase 2 host: one full-viewport dimetric canvas replacing the ASCII WorldMapView
// strip + the side-by-side combat arena. The controller (combatAdapter) owns all
// imperative canvas work; this component only wires React → controller + rAF +
// the floatingNumbers combat-event feed. Old path is behind CombatView's flag.
// Per-step zoom multipliers over the breakpoint base (index = store zoomLevel).
// 0 = most zoomed out (the default FOV) → 1 mid → 2 zoomed in. The controller clamps the
// final scale to [1,3], so desktop tops out at 1.5×2 = 3.0 and mobile at 1.4×2 = 2.8.
const ZOOM_MULT = [1, 1.5, 2] as const

export function DimetricWorldScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const floatersRef = useRef<HTMLDivElement>(null)
  const reflowRef = useRef<() => void>(() => {})
  const zoomLevel = useGameStore(s => s.zoomLevel)
  const currentZone = useGameStore(s => s.currentZone)
  const playerFaction = useGameStore(s => s.playerFaction)

  // ── Ghost roster ──────────────────────────────────────────────────────────
  // Pull the opposing faction's real published characters whenever the hero arrives
  // somewhere new, and hand them to `engine/ghosts` for the crowd to stand up.
  //
  // Keyed on the zone rather than fetched once at mount: the crowd is regenerated per
  // zone, so each arrival is a fresh chance to place people, and re-reading the board also
  // picks up anyone who has published since. Level is deliberately NOT a dependency — it
  // changes constantly and would turn this into a request per level-up.
  //
  // Every failure is silent by design (see `net/ghostRoster`): no cloud, no session, no
  // board, or an empty one all mean the zone is populated entirely by generated heroes,
  // which is exactly what shipped before ghosts existed.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const state = useGameStore.getState()
      const power = buildSnapshot(state).power
      try {
        const n = await refreshGhostRoster(playerFaction, power)
        if (!cancelled && n > 0 && import.meta.env.DEV) {
          console.info(`[ghosts] ${n} real ${playerFaction === 'alliance' ? 'Ashmarch' : 'Concord'} character(s) walking this zone`)
        }
      } catch {
        // Never let the world depend on the network. See the module header.
      }
    })()
    return () => { cancelled = true }
  }, [currentZone, playerFaction])

  useEffect(() => {
    const canvas = canvasRef.current!
    const container = containerRef.current!
    const floatersHost = floatersRef.current!
    const controller = new WorldSceneController(canvas, floatersHost)


    let raf = 0
    let last = performance.now()
    let disposed = false

    // Committed-target arrival → join the fight. Keeps the adapter read-only: it signals
    // intent, the store owns the state change.
    controller.onEngageTarget = () => useGameStore.getState().engageTarget()
    controller.onSelectTarget = (id: string) => useGameStore.getState().setTarget(id)
    // Manual steering: the canvas owns the hero's feet, so it tells the store where they
    // are. This is what lets mobs notice the player by proximity.
    controller.onPlayerMoved = (x: number, y: number) =>
      useGameStore.getState().reportPlayerWorldPos(x, y)
    controller.onTownNpcChanged = id => useGameStore.getState().setActiveTownNpc(id)
    // Tapping another player opens their card (whisper / invite / duel). Routed through
    // the selection module's own observable rather than React props: the tap starts in
    // the canvas and is consumed by overlay UI elsewhere in the tree.
    controller.onHeroTapped = (speaker, clientX, clientY) =>
      setSelectedHero({ speaker, clientX, clientY })
    // The other half of PvP: the enemy faction opening on YOU. The adapter decides who and
    // when (it is the only thing that knows where the crowd is standing); the store owns
    // the state change, exactly as with every other signal on this list.
    controller.onHeroDeclares = speaker =>
      useGameStore.getState().attackPlayer(speaker, 'enemy')

    controller.init().then(() => {
      if (disposed) return
      controller.sync(useGameStore.getState())
      // Dev-only handle for driving the app headlessly (see the CDP notes in the repo's
      // memory). Behaviour over time — the ambient crowd especially — cannot be verified
      // from a screenshot, so a probe needs a way in. Stripped from production builds.
      //
      // Published only AFTER init succeeds, and cleared on unmount. StrictMode
      // double-invokes this effect in dev, and the first controller's init() bails on
      // `disposed` without ever spawning a crowd — so publishing at construction time
      // could leave a live-looking handle on a controller that has no entities, which
      // reads to a probe as "the world is empty" while the real one renders fine.
      if (import.meta.env.DEV) {
        ;(window as unknown as { __ilScene?: WorldSceneController }).__ilScene = controller
        // ...and a way to read the STORE. There is deliberately no `window.__ilStore`, and
        // a probe must never reach for `await import(...)` — Vite serves HMR'd modules
        // under distinct URLs, so a dynamic import can hand back a separate instance with
        // its own freshly-initialised state (that produced a completely convincing false
        // negative once already).
        //
        // Reading it off the scene closes a real gap: the renderer's coordinates carry PAD
        // and the manual-mode visual offset, so a probe measuring entity positions can see
        // a mob standing ON the hero while the simulation has it fourteen tiles away. The
        // only way to tell those apart is to look at what the store actually holds.
        ;(window as unknown as { __ilState?: () => unknown }).__ilState =
          () => useGameStore.getState()
      }
    })

    // Zoom: a wider dimetric FOV reads better everywhere (the dense living-world crowd
    // looks like a busy server), so BOTH breakpoints zoom out from the 2× default —
    // phones a touch wider since their viewport is narrowest. The magnifier HUD button
    // steps this base up via ZOOM_MULT[store.zoomLevel].
    const ZOOM_MOBILE = 1.4, ZOOM_DESKTOP = 1.5
    const mq = window.matchMedia('(max-width: 640px)')
    const applyZoom = () => {
      const base = mq.matches ? ZOOM_MOBILE : ZOOM_DESKTOP
      const mult = ZOOM_MULT[useGameStore.getState().zoomLevel] ?? 1
      controller.setZoom(base * mult)
    }

    // Resize → controller canvas buffer size (CSS px / current zoom).
    // Batched via rAF so a chain of ResizeObserver notifications (e.g. mobile
    // flex layout + canvas intrinsic size feedback) can't spiral into a
    // loop of undelivered notifications / runaway buffer growth.
    let pendingResize = 0
    const resize = () => {
      if (pendingResize) return
      pendingResize = requestAnimationFrame(() => {
        pendingResize = 0
        applyZoom()
        const r = container.getBoundingClientRect()
        controller.setSize(r.width, r.height)
      })
    }
    reflowRef.current = resize
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    mq.addEventListener('change', resize)
    resize()

    // One store subscription drives both sync(state) and the floatingNumbers diff
    // (the existing combat-event feed — same pattern as CombatView's FN effect).
    const seenFnIds = new Set<string>()
    // Seed with whatever is present so we don't replay floaters on mount.
    for (const f of useGameStore.getState().floatingNumbers) seenFnIds.add(f.id)

    const onStore = (state: ReturnType<typeof useGameStore.getState>) => {
      controller.sync(state)
      // Diff floatingNumbers → combat-event triggers (melee / spell / DoT / mob attack).
      const fns = state.floatingNumbers
      for (let i = 0; i < fns.length; i++) {
        const f = fns[i]
        if (seenFnIds.has(f.id)) continue
        seenFnIds.add(f.id)
        controller.handleFloatingNumber(f)
      }
      // Trim the seen set to current ids so it can't grow unbounded.
      if (seenFnIds.size > 256) {
        const keep = new Set<string>()
        for (const f of fns) keep.add(f.id)
        seenFnIds.clear()
        for (const id of keep) seenFnIds.add(id)
      }
    }
    const unsub = useGameStore.subscribe(onStore)

    // Keyboard → controller (WASD/arrows walk, Space jumps). Prevent the page from
    // scrolling on Space / arrows while the world scene is mounted.
    //
    // ...but NOT while the player is typing. These listeners are on `window`, so before
    // the chat panel existed they were harmless; now `preventDefault()` on Space eats
    // every space in a whisper ("want to party up?" arrives as "wanttopartyup?") and WASD
    // walks the hero around while you compose a message. Any focused text field owns the
    // keyboard.
    const isTyping = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      if (!el || !el.tagName) return false
      const tag = el.tagName.toUpperCase()
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (isTyping(e.target)) return
      const k = e.key
      // Tab cycles targets, the way it has in this genre for twenty years. Preventing the
      // default matters: otherwise the browser moves focus to the next control and the
      // second press lands on a HUD button instead of the world.
      if (k === 'Tab') {
        e.preventDefault()
        useGameStore.getState().cycleTarget()
        return
      }
      if (k === ' ' || k.startsWith('Arrow')) e.preventDefault()
      controller.setKey(k, true)
      // Movement / jump counts as taking manual control of the hero.
      const isManualKey = (k.length === 1 && /[wasd ]/i.test(k)) || k.startsWith('Arrow')
      if (isManualKey) {
        useGameStore.getState().bumpManualInput()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      // Release regardless of focus: a key pressed in the world and released after
      // focusing an input would otherwise stick down and walk the hero forever.
      controller.setKey(e.key, false)
    }
    const onBlur = () => controller.clearInput()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // Tap / click-to-move (touch + mouse) on the world canvas. A short, low-movement
    // press sets a walk target; drags/scrolls are ignored so the HUD and future pan
    // gestures aren't hijacked. Haptic on accept — navigator.vibrate is Android-web
    // only; iOS ignores it (the Capacitor Haptics plugin covers the native wrap later).
    let downX = 0, downY = 0, downT = 0, downId = -1, moved = false
    const onPointerDown = (e: PointerEvent) => {
      downId = e.pointerId; downX = e.clientX; downY = e.clientY
      // The EVENT's timestamp, not the clock when the handler happens to run. Both events
      // carry the moment the finger actually moved, so this measures the gesture; reading
      // `performance.now()` inside the handlers measures the gesture PLUS however long the
      // main thread made the events wait. Those are the same number on an idle frame and
      // wildly different on a busy one — entering a town bakes a whole new scene, and a
      // perfectly ordinary tap could arrive measured at over half a second and be thrown
      // away as a drag. Dropped taps exactly where the app is busiest, on a build whose
      // primary input is touch.
      downT = e.timeStamp; moved = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== downId) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) moved = true
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== downId) return
      downId = -1
      if (!moved && e.timeStamp - downT < 500) {
        controller.moveTo(e.clientX, e.clientY)
        useGameStore.getState().bumpManualInput()
        navigator.vibrate?.(8)
      }
    }
    const onPointerCancel = () => { downId = -1 }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)

    // Schedule the NEXT frame BEFORE rendering so a thrown frame can never kill the loop
    // (a permanent black screen that only a reload fixes). Log the first error only.
    let loggedFrameErr = false
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      raf = requestAnimationFrame(frame)
      try {
        controller.renderFrame(dt)
      } catch (err) {
        if (!loggedFrameErr) { console.error('[scene] renderFrame threw:', err); loggedFrameErr = true }
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (pendingResize) cancelAnimationFrame(pendingResize)
      unsub()
      ro.disconnect()
      mq.removeEventListener('change', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      reflowRef.current = () => {}
      if (import.meta.env.DEV) {
        const w = window as unknown as { __ilScene?: WorldSceneController }
        if (w.__ilScene === controller) delete w.__ilScene
      }
    }
  }, [])

  // Zoom step changed (magnifier button) → re-apply scale + buffer size on the live controller.
  useEffect(() => { reflowRef.current() }, [zoomLevel])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0f' }}>
      <style>{`
        .il-floater {
          position: absolute; top: 0; left: 0; opacity: 0;
          font-size: ${15 * CSS_SCALE}px; font-weight: 800; color: #ffe27a;
          text-shadow: 0 ${CSS_SCALE}px 0 #000, 0 0 ${6 * CSS_SCALE}px #00000088;
          font-family: ui-monospace, monospace;
          will-change: transform, opacity;
        }
        .il-floater.il-crit { font-size: ${20 * CSS_SCALE}px; color: #ff9a3c; }
      `}</style>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: '100%', display: 'block',
          imageRendering: 'pixelated',
          touchAction: 'none', // taps drive move-to; don't let the browser scroll/zoom the canvas
        }}
      />
      <div ref={floatersRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
      <BossBeacon />
      {import.meta.env.DEV && <CombatDebugReadout />}
    </div>
  )
}