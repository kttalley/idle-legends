// Who the player has tapped in the world.
//
// Tapping another player opens a CARD — name, level, class, spec, faction, and what you
// can do about them (whisper / invite / duel) — rather than jumping straight into a chat
// thread. That is how targeting works in an MMO, and on touch it matters more than on
// desktop: a tap that silently changes a panel on the far side of the screen is invisible
// on a phone, whereas a card appears where the thumb already is.
//
// Kept as its own tiny observable rather than React state because the tap originates deep
// in the canvas adapter and is consumed by overlay UI elsewhere in the tree; threading it
// through as props would put a world concern into every component in between.

import type { ChatSpeaker } from './chatGen'

/** Where on screen the tapped hero was, so the card can appear next to them. */
export interface SelectionAnchor {
  speaker: ChatSpeaker
  /** Client coordinates of the hero's feet, for positioning the card. */
  clientX: number
  clientY: number
}

let selected: SelectionAnchor | null = null
const listeners = new Set<() => void>()

export function getSelectedHero(): SelectionAnchor | null {
  return selected
}

export function setSelectedHero(s: SelectionAnchor | null): void {
  selected = s
  for (const l of listeners) l()
}

export function clearSelectedHero(): void {
  setSelectedHero(null)
}

export function subscribeSelection(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
