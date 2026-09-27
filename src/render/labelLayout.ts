// ── World-label declutter ────────────────────────────────────────────────────
//
// Nameplates used to be drawn exactly where their owner stood, with no idea any other
// label existed. That is fine in a sparse field and falls apart wherever characters
// bunch up — which in a town is always: the Crossroads Market rendered "Corvan" and
// "Cutter" as one unreadable smear, and "Lyra", "Dahlia" and "Innkeeper" as a pile. The
// same collision in the open world is what made a 2026-09-05 store screenshot read as a
// rendering bug.
//
// The fix is the one every MMO client makes: place labels greedily in PRIORITY order,
// and when one would land on a label already placed, lift it a row; if two lifts do not
// find room, leave it out this frame. The caller decides priority — service NPCs and
// buildings before passers-by, nearer heroes before farther ones — so the labels that
// survive a crowd are the ones the player most needs.
//
// Pure and allocation-light: a label list of ~20 is laid out per frame, O(n²) in the
// worst case, which is nothing next to the draw calls it saves.

export interface LabelBox {
  /** Centre x, in the same space the labels are drawn in. */
  cx: number
  /** Centre y of the label at its natural (unlifted) position. */
  cy: number
  w: number
  h: number
}

/** How many rows a label may be lifted before it is dropped instead. */
const MAX_LIFTS = 2
/** Breathing room between two labels, so outlines never touch. */
const GAP = 1

/**
 * Lay out `boxes`, given in priority order (most important first).
 *
 * Returns, per box, the y offset to draw it at (0 = natural position, negative = lifted),
 * or null if there was no room for it.
 */
export function layoutLabels(boxes: readonly LabelBox[]): (number | null)[] {
  const placed: { l: number; r: number; t: number; b: number }[] = []
  const out: (number | null)[] = []
  for (const bx of boxes) {
    const l = bx.cx - bx.w / 2, r = bx.cx + bx.w / 2
    let chosen: number | null = null
    for (let lift = 0; lift <= MAX_LIFTS; lift++) {
      const dy = -lift * (bx.h + GAP)
      const t = bx.cy + dy - bx.h / 2, b = bx.cy + dy + bx.h / 2
      let clear = true
      for (const p of placed) {
        if (l < p.r + GAP && r > p.l - GAP && t < p.b + GAP && b > p.t - GAP) { clear = false; break }
      }
      if (clear) {
        placed.push({ l, r, t, b })
        chosen = dy
        break
      }
    }
    out.push(chosen)
  }
  return out
}

/** Keep a label of width `w` wholly inside a viewport `viewW` wide. */
export function clampLabelX(cx: number, w: number, viewW: number): number {
  const half = w / 2 + 1
  if (viewW <= w + 2) return viewW / 2
  return Math.min(viewW - half, Math.max(half, cx))
}
