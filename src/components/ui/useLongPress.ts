import { useCallback, useRef } from 'react'

/**
 * Press-and-hold as a SECONDARY action, with tap left free for the primary one.
 *
 * This exists because touch has one gesture where the desktop UI had three: hover to
 * inspect, click to act, right-click to act differently. Where the primary action has to
 * stay instant — firing an ability mid-fight — inspection cannot be a tap, so it becomes
 * a hold. Where the primary action is not time-critical (items, talents) a tap opens a
 * sheet with explicit buttons instead, which is more discoverable and is the pattern
 * preferred throughout; hold is reserved for the cases where tap is genuinely spoken for.
 *
 * Details that matter on a real device:
 *  • **Movement cancels.** A hold that drifts past `moveTolerance` is a scroll, not a
 *    press. Without this every attempt to scroll a grid fires a popover.
 *  • **The tap is suppressed** once a hold has fired, so holding an ability does not also
 *    cast it on release.
 *  • **The context menu is suppressed** on touch, because iOS raises the callout menu on
 *    long-press over anything selectable and it lands on top of ours.
 *  • Pointer events cover mouse and touch in one path, so desktop gets the same hold.
 */
export interface LongPressOptions {
  /** Milliseconds before the hold registers. 450ms reads as deliberate without dragging. */
  delay?: number
  /** Pixels of drift allowed before the press is treated as a scroll. */
  moveTolerance?: number
}

export function useLongPress(
  onLongPress: (e: { clientX: number; clientY: number }) => void,
  onTap?: () => void,
  { delay = 450, moveTolerance = 10 }: LongPressOptions = {},
) {
  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    origin.current = null
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    fired.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    const { clientX, clientY } = e
    timer.current = window.setTimeout(() => {
      fired.current = true
      timer.current = null
      onLongPress({ clientX, clientY })
    }, delay)
  }, [delay, onLongPress])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current || timer.current === null) return
    const dx = e.clientX - origin.current.x
    const dy = e.clientY - origin.current.y
    if (Math.hypot(dx, dy) > moveTolerance) clear()
  }, [clear, moveTolerance])

  const onPointerUp = useCallback(() => {
    const wasHold = fired.current
    clear()
    if (!wasHold && onTap) onTap()
  }, [clear, onTap])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault() },
    /** True while the most recent gesture was a hold — callers suppress their own click. */
    didLongPress: () => fired.current,
  }
}
