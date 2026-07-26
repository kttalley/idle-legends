import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { WorldSceneController, CSS_SCALE } from '../../render/adapter/combatAdapter'

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
    controller.onTownNpcChanged = id => useGameStore.getState().setActiveTownNpc(id)

    controller.init().then(() => {
      if (disposed) return
      controller.sync(useGameStore.getState())
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key
      if (k === ' ' || k.startsWith('Arrow')) e.preventDefault()
      controller.setKey(k, true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
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
      downT = performance.now(); moved = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== downId) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) moved = true
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== downId) return
      downId = -1
      if (!moved && performance.now() - downT < 500) {
        controller.moveTo(e.clientX, e.clientY)
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
    </div>
  )
}