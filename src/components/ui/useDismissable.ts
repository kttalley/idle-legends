import { useEffect } from 'react'

// The rule of menus, in one place.
//
// Every transient surface in the game — sheet, modal, drawer, target card — must be
// dismissible three ways, and they were each implementing however many of the three the
// author happened to think of that day:
//
//   1. Tapping outside it            (a scrim, or the outside-pointer check below)
//   2. Escape                        (this hook)
//   3. Completing the thing it is for (the caller's job — see `onTravel` in ZoneTrack,
//                                      and `DetailSheet`'s actions, which close after
//                                      firing)
//
// A menu that survives all three is a menu the player has to fight. The wardrobe and the
// fast-travel map both used to: no key handler, and choosing a colourway or a destination
// left the overlay sitting on top of the thing you had just changed.

/** Close on Escape while `open`. Safe to call unconditionally. */
export function useDismissOnEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}
