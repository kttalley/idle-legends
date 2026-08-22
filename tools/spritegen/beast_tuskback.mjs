#!/usr/bin/env node
// ── mob_tuskback: the second quadruped ────────────────────────────────────────
//
// Stillmarch had exactly ONE drawn four-legged sheet (`mob_duskcat`), and mob palettes
// vary only by boss/elite/normal — so the moment two four-legged enemies shared a zone
// they were the same animal. Sunhollow's Grey Wolf and Rampaging Boar were, until this
// existed; before that the boar was worse off still, drawn on `mob_gnarljaw`, a bipedal
// brute in a loincloth.
//
// Authored parametrically rather than as eleven hand-drawn grids, for the same reason
// `placeholderArt.ts` builds its props in code: eleven frames of the same animal have to
// agree to the pixel, and a shared draw function with per-frame parameters is the only
// cheap way to guarantee that. Frame coherence is exactly what hand-editing loses.
//
// Original geometry. No traced or derived pixels from any other game — see the guardrail
// in tools/spritegen/CLAUDE.md.
//
//   node tools/spritegen/beast_tuskback.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const W = 28, H = 22, FRAMES = 11
const ANCHOR = { x: 14, y: 20 }

// ── Palette, in the engine's semantic slots ───────────────────────────────────
// The contract (palettes.ts): 1-4 skin · 5-8 primary · 9-12 secondary · 13-15 accent,
// and ACCENT IS THE RARITY CHANNEL — it is what an elite or a legendary recolors. On a
// boar the obvious accent is the tusks, so rarity reads as the thing that gores you
// lighting up, which is the correct place for a threat signal to live.
const PALETTE = [
  '',
  '#3a2a26', '#5c4038', '#7c5a4c', '#9c7a68', // 1-4  snout, ears, hooves
  '#2e2018', '#4a3324', '#664630', '#8a6242', // 5-8  hide (dark red-brown)
  '#241c1c', '#3a2c2c', '#54403c', '#70564e', // 9-12 bristle ridge + underbelly
  '#8a8272', '#c8bfa4', '#f0e8d0',            // 13-15 TUSK / rarity channel
]

const data = new Uint8Array(FRAMES * W * H)
const px = (f, x, y, s) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  data[f * W * H + y * W + x] = s
}
const rect = (f, x, y, w, h, s) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(f, xx, yy, s)
}

/**
 * One boar.
 *
 * Built from a BACK-LINE rather than stacked rectangles, which is the difference between an
 * animal and a crate: `BODY` gives the top and bottom of the mass for each column, so the
 * spine can rise over the shoulders and fall away to the rump in a continuous curve. The
 * first cut of this drew the barrel as three rects and read as a brown box on legs.
 *
 * `dx/dy` shift the whole animal (idle bob, walk drift, lunge). `legs` swings the pairs.
 * `slump` drops and flattens it for the death frames. Everything else is fixed geometry,
 * which is what keeps the eleven frames the same creature.
 */
// x → [top, bottom] of the body mass. Shoulders peak at x9-11 and the back falls to the
// rump at x22 — a boar is front-heavy, and that slope is the whole silhouette.
const BODY = [
  [6, 10, 15], [7, 8, 15], [8, 7, 15], [9, 6, 15], [10, 6, 15], [11, 6, 15],
  [12, 7, 15], [13, 7, 15], [14, 7, 15], [15, 8, 15], [16, 8, 14], [17, 8, 14],
  [18, 9, 14], [19, 9, 14], [20, 9, 13], [21, 10, 13], [22, 11, 13],
]

function drawBoar(f, { dx = 0, dy = 0, legs = 0, slump = 0, tuskLift = 0 } = {}) {
  const X = x => x + dx
  const Y = y => y + dy + slump

  // ── Legs first, so the body overlaps them. Short and thick: "heavy thing close to the
  // ground" is carried almost entirely by leg length against body mass. ──
  if (slump < 3) {
    for (const [lx, sw, shade] of [[8, legs, 6], [11, -legs, 5], [18, -legs, 5], [21, legs, 6]]) {
      rect(f, X(lx + sw), Y(14), 2, 5, shade)
      rect(f, X(lx + sw), Y(19), 2, 1, 1)   // hoof
    }
  }

  // ── Barrel, shaded off the back-line: lit along the spine, dark under the belly. ──
  for (const [x, top, bot] of BODY) {
    const h = bot - top
    rect(f, X(x), Y(top), 1, h, 6)
    px(f, X(x), Y(top), 8)                       // spine catches the light
    px(f, X(x), Y(top + 1), 7)
    if (h > 4) px(f, X(x), Y(bot - 1), 5)        // belly shadow
    if (h > 5) px(f, X(x), Y(bot - 2), 5)
  }
  // Flank highlight — a band along the ribs so the mass turns rather than reading flat.
  rect(f, X(10), Y(9), 6, 2, 7)
  rect(f, X(16), Y(10), 4, 1, 6)

  // ── Bristle ridge: the cue that separates it from the cat at a glance. ──
  for (let i = 0; i < 7; i++) px(f, X(8 + i), Y((i % 2 ? 5 : 4) + (i > 4 ? 1 : 0)), 10)
  px(f, X(15), Y(6), 9); px(f, X(16), Y(7), 9)

  // ── Head: big, low and wedge-shaped, hung off the front of the shoulders. ──
  rect(f, X(2), Y(9), 6, 6, 6)
  rect(f, X(2), Y(9), 5, 2, 7)                   // lit brow
  rect(f, X(1), Y(12), 3, 3, 3)                  // snout
  px(f, X(1), Y(14), 2)                          // nostril shadow
  rect(f, X(6), Y(7), 2, 2, 4)                   // ear
  px(f, X(7), Y(6), 3)
  px(f, X(4), Y(11), 14)                         // eye, on the accent ramp
  px(f, X(3), Y(11), 1)

  // ── Tusks — the accent channel, so rarity reads as the thing that gores you lighting up. ──
  px(f, X(1), Y(15 - tuskLift), 15)
  px(f, X(0), Y(14 - tuskLift), 14)
  px(f, X(2), Y(16 - tuskLift), 14)
  px(f, X(4), Y(15 - tuskLift), 15)

  // ── Tail: a short tuft, against the cat's long sweep. ──
  px(f, X(23), Y(11), 6); px(f, X(24), Y(10), 6); px(f, X(24), Y(9), 9)
}

// idle 0-1 — breathing only
drawBoar(0, {})
drawBoar(1, { dy: 1 })
// walk 2-3 — the duskcat's idiom: shift the mass, swing the legs
drawBoar(2, { dx: -1, legs: 1 })
drawBoar(3, { dx: -1, legs: -1, dy: 1 })
// attack 4-6 — drop the head, drive forward, throw the tusks up
drawBoar(4, { dx: -1, dy: 1 })
drawBoar(5, { dx: -3, dy: 1, legs: 2 })
drawBoar(6, { dx: -4, tuskLift: 2, legs: 1 })
// hit 7-8 — knocked back onto the haunches
drawBoar(7, { dx: 2, dy: 1 })
drawBoar(8, { dx: 3, dy: 2, legs: -1 })
// death 9-10 — folds, then lies down
drawBoar(9, { dy: 3, slump: 2 })
drawBoar(10, { dy: 5, slump: 4 })

// ── Emit ──────────────────────────────────────────────────────────────────────
const rgb = PALETTE.map(h => h
  ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  : null)
const png = new PNG({ width: FRAMES * W, height: H })
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const slot = data[f * W * H + y * W + x]
      const o = (y * FRAMES * W + f * W + x) << 2
      const c = rgb[slot]
      if (!slot || !c) { png.data[o + 3] = 0; continue }
      png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255
    }
  }
}

const outDir = process.argv[2] ?? path.join('public', 'sprites', 'units')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'mob_tuskback.png'), PNG.sync.write(png))
// Frame ranges mirror `mob_duskcat.json` exactly, because the renderer's Animator asks
// every unit for the same five animations and a beast that disagrees just fails to play.
fs.writeFileSync(path.join(outDir, 'mob_tuskback.json'), JSON.stringify({
  id: 'mob_tuskback',
  image: 'mob_tuskback.png',
  frameW: W, frameH: H,
  anchor: ANCHOR,
  sourcePalette: PALETTE,
  animations: {
    idle:   { se: { frames: [0, 1], fps: 3, loop: true },  ne: { frames: [0, 1], fps: 3, loop: true } },
    walk:   { se: { frames: [2, 3], fps: 6, loop: true },  ne: { frames: [2, 3], fps: 6, loop: true } },
    attack: { se: { frames: [4, 5, 6], fps: 8, loop: false }, ne: { frames: [4, 5, 6], fps: 8, loop: false } },
    hit:    { se: { frames: [7, 8], fps: 10, loop: false }, ne: { frames: [7, 8], fps: 10, loop: false } },
    death:  { se: { frames: [9, 10], fps: 5, loop: false }, ne: { frames: [9, 10], fps: 5, loop: false } },
  },
}, null, 2) + '\n')
console.log(`mob_tuskback: ${FRAMES} frames, ${FRAMES * W}x${H} → ${outDir}`)
