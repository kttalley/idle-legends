import { useEffect, useRef, type RefObject } from 'react'

// The rule of menus, in one place.
//
// Every transient surface in the game — sheet, modal, drawer, target card — must be
// dismissible three ways, and they were each implementing however many of the three the
// author happened to think of that day:
//
//   1. Tapping outside it             (`closeOnOutside`)
//   2. Escape                         (always)
//   3. Completing the thing it is for (the caller's job — `onTravel` in ZoneTrack, the
//                                      wardrobe's colourway tiles, DetailSheet's actions)
//
// A menu that survives all three is a menu the player has to fight.
//
// ── Why a stack and not a listener per surface ───────────────────────────────
// The obvious version — every surface adds its own listeners to window — is wrong in a
// way that only shows up once two are open at the same time, which on a phone is the
// normal case: the hero drawer is open, and the wardrobe is open on top of it.
//
// Two independent keydown listeners both fire for one keypress. The OUTER one (registered
// first, so called first) closed the drawer, and re-rendering the drawer's subtree tore
// down and re-registered the wardrobe's listener mid-dispatch — the DOM skips listeners
// removed while an event is being dispatched, so the wardrobe never heard the key at all.
// The observable result was the exact inverse of what Escape should do: the drawer
// underneath vanished and the modal on top stayed.
//
// Outside-click has the same shape and a worse failure. The wardrobe is PORTALLED to
// <body>, so a click inside it is geometrically "outside" the drawer that raised it — a
// per-surface handler on the drawer would close it the moment you touched the modal.
//
// So there is ONE set of listeners and a LIFO stack of open surfaces. Only the top of the
// stack ever reacts, which is what every other application does: you back out one level
// per press, and clicking inside the frontmost thing does not dismiss what is behind it.
//
// The listeners are in the CAPTURE phase, which matters for more than ordering: the world
// scene binds Tab for target cycling and calls preventDefault on it. Its listener was
// registered long before any modal existed, so in the bubble phase it would always win.
// Capture lets an open modal claim Tab for its own focus trap first.

type Dismiss = () => void

interface Entry {
  close: Dismiss
  ref: RefObject<HTMLElement | null> | null
  outside: boolean
  exempt: string | null
  trap: boolean
}

const stack: Entry[] = []
let installed = false

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter(el => el.offsetParent !== null || el === document.activeElement)
}

function onKeyDownCapture(e: KeyboardEvent): void {
  const top = stack[stack.length - 1]
  if (!top) return

  if (e.key === 'Escape') {
    e.stopPropagation()
    top.close()
    return
  }

  if (e.key === 'Tab' && top.trap && top.ref?.current) {
    const items = focusableIn(top.ref.current)
    // Nothing to land on: swallow Tab rather than letting focus escape behind the modal.
    if (items.length === 0) { e.preventDefault(); e.stopPropagation(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const outsideSurface = !top.ref.current.contains(active)
    if (e.shiftKey ? (active === first || outsideSurface) : (active === last || outsideSurface)) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.shiftKey ? last : first).focus()
    }
  }
}

function onPointerDownCapture(e: PointerEvent): void {
  const top = stack[stack.length - 1]
  if (!top?.outside || !top.ref?.current) return
  if (top.ref.current.contains(e.target as Node)) return
  // A surface's own EXTERNAL control is not "outside" it. The mobile dock is the restore
  // control for the drawers (see App.tsx), and without this the two mechanisms cancelled
  // out: pointerdown on the dock button retracted the drawer here, then the button's own
  // click read the now-closed state and extended it again. Net effect, tapping Hero a
  // second time did nothing — the panel could be opened but never closed, and only from a
  // real finger. `element.click()` fires no pointerdown, so every synthetic-click test
  // passed the whole time.
  if (top.exempt && (e.target as Element | null)?.closest?.(top.exempt)) return
  // Deliberately NOT stopped. A tap on open ground still issues a move order, which is how
  // targeting works in an MMO: you click away and your character goes there, and the thing
  // you clicked away from closes behind you.
  top.close()
}

function install(): void {
  if (installed) return
  window.addEventListener('keydown', onKeyDownCapture, true)
  window.addEventListener('pointerdown', onPointerDownCapture, true)
  installed = true
}

export interface DismissableOptions {
  /** The surface itself. Required for `closeOnOutside` and `trapFocus`. */
  ref?: RefObject<HTMLElement | null>
  /** Dismiss on a pointer press outside `ref`. Modals and popovers; not the chat window. */
  closeOnOutside?: boolean
  /**
   * Selector for chrome that governs this surface from OUTSIDE it — the mobile dock — and
   * must therefore not count as an outside press. Only meaningful with `closeOnOutside`.
   */
  exempt?: string
  /**
   * Keep Tab inside `ref` and move focus into it on open. For MODAL surfaces only —
   * trapping a non-modal window (the whisper thread) would strand the keyboard in it.
   */
  trapFocus?: boolean
}

/**
 * Register a surface as dismissible. Escape always applies; outside-press and focus
 * trapping are opt-in.
 *
 * `onClose` is read through a ref, so an inline arrow is fine and re-registers nothing.
 */
export function useDismissable(open: boolean, onClose: Dismiss, opts: DismissableOptions = {}): void {
  const { ref = null, closeOnOutside = false, exempt, trapFocus = false } = opts
  const latest = useRef(onClose)
  latest.current = onClose

  useEffect(() => {
    if (!open) return
    const entry: Entry = { close: () => latest.current(), ref, outside: closeOnOutside, exempt: exempt ?? null, trap: trapFocus }
    stack.push(entry)
    install()

    // Focus the CONTAINER, not the first control inside it. Focusing an input would raise
    // the on-screen keyboard over the surface that just opened — which is why the whisper
    // window has always skipped autofocus on coarse pointers.
    const restoreTo = document.activeElement as HTMLElement | null
    let raf = 0
    if (trapFocus && ref) {
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el || el.contains(document.activeElement)) return
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        el.focus({ preventScroll: true })
      })
    }

    return () => {
      cancelAnimationFrame(raf)
      const i = stack.lastIndexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      // Put the keyboard back where it was. Without this, dismissing a modal drops focus
      // on <body> and the next Tab restarts from the top of the document.
      if (trapFocus && restoreTo?.isConnected) restoreTo.focus({ preventScroll: true })
    }
  }, [open, ref, closeOnOutside, exempt, trapFocus])
}

/** Escape only — for surfaces that own their own outside-press handling. */
export function useDismissOnEscape(open: boolean, onClose: Dismiss): void {
  useDismissable(open, onClose)
}
