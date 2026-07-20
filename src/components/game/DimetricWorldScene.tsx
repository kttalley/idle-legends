import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { WorldSceneController, CSS_SCALE } from '../../render/adapter/combatAdapter'

// Phase 2 host: one full-viewport dimetric canvas replacing the ASCII WorldMapView
// strip + the side-by-side combat arena. The controller (combatAdapter) owns all
// imperative canvas work; this component only wires React → controller + rAF +
// the floatingNumbers combat-event feed. Old path is behind CombatView's flag.
export function DimetricWorldScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const floatersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const container = containerRef.current!
    const floatersHost = floatersRef.current!
    const controller = new WorldSceneController(canvas, floatersHost)

    let raf = 0
    let last = performance.now()
    let disposed = false

    controller.init().then(() => {
      if (disposed) return
      controller.sync(useGameStore.getState())
    })

    // Resize → controller canvas buffer size (CSS px / CSS_SCALE).
    const resize = () => {
      const r = container.getBoundingClientRect()
      controller.setSize(r.width, r.height)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)
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

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      controller.renderFrame(dt)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      unsub()
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

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
        }}
      />
      <div ref={floatersRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
    </div>
  )
}