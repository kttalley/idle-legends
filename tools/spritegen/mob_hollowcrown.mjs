#!/usr/bin/env node
// ── mob_hollowcrown: the Rift's signature boss ───────────────────────────────
//
// The thing waiting at the bottom of the Maw. Every other boss in the bestiary stands on
// the ground; this one does not: no legs, a robe that frays into wisps above the floor, so
// the silhouette reads as "not of this world" before any detail does. The face is a pale
// mask split down the middle by the rift itself, and a broken crown sits on a head that is
// mostly hood. Two shards of the rift orbit it.
//
// Design notes, in the order they matter at 24x32:
//   1. Negative space. Arms hang OUTSIDE the robe with clear columns either side (x5 and
//      x18), the same decision that made mob_stoneward read as a construct and not a slab.
//   2. Taper. Wide at the shoulders, narrowing to two wisps: a floating figure is a
//      downward-pointing wedge, the opposite of the grounded mobs' pyramid.
//   3. One vertical light. The rift seam runs down the mask and on into the void slit in
//      the robe, so the whole figure is "split" by a single line of accent colour.
//
// Slot contract (palettes.ts): 1-4 skin, 5-8 primary, 9-12 secondary, 13-15 accent.
// Here: 1-4 is the bone of the mask, crown and claws; 5-8 the robe; 9-12 the void inside
// the hood and the robe's slit; 13-15 the rift-light. Accent is the rarity channel, so an
// elite or a deeper-floor variant lights up along the seam, exactly where it should.
//
// Original geometry. No traced or derived pixels (see tools/spritegen/CLAUDE.md).
//
//   node tools/spritegen/mob_hollowcrown.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const ID = 'mob_hollowcrown'
const W = 24, H = 32, FRAMES = 13
const ANCHOR = { x: 12, y: 30 }

const PALETTE = [
  '',
  '#6e6656', '#9a917c', '#c4bba2', '#e8e1cc', // 1-4  bone: mask, crown, claws
  '#1e1626', '#2e2238', '#43324f', '#5c4668', // 5-8  robe
  '#07060c', '#0f0d18', '#181526', '#252036', // 9-12 void
  '#2a6f7a', '#4fd6c8', '#d8fff6',            // 13-15 rift-light (rarity channel)
]

const data = new Uint8Array(FRAMES * W * H)
let FADE = 0, FRAME = 0
const px = (f, x, y, s) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  // Death dissolves the figure: a fixed scatter pattern drops more pixels each frame.
  if (FADE && ((x * 7 + y * 13 + FRAME * 3) % 6) < FADE) return
  data[f * W * H + y * W + x] = s
}
const rect = (f, x, y, w, h, s) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(f, xx, yy, s)
}

/**
 * One Hollow Crown.
 *   dy     hover bob (it never touches the ground, so idle is a bob, not a breath)
 *   lean   tilts the upper body; the wisps trail the other way
 *   arm    raises (negative) or drops (positive) the near arm
 *   flare  0 dim, 1 lit, 2 blazing: the rift seam telegraphs the strike
 *   orbit  0-3, where the two shards are in their circuit
 *   fade   death dissolve, 0-5
 */
function drawCrown(f, { dy = 0, lean = 0, arm = 0, flare = 1, orbit = 0, fade = 0 } = {}) {
  FADE = fade; FRAME = f
  const Y = y => y + dy
  const L = x => x + lean
  const seam = flare >= 2 ? 15 : flare === 1 ? 14 : 13

  // ── Robe: a downward wedge. Shoulders wide, tapering to two wisps above the floor. ──
  rect(f, L(6), Y(10), 12, 3, 6)          // shoulders
  rect(f, L(6), Y(10), 4, 3, 7)           // lit shoulder (top-left light)
  rect(f, L(6), Y(10), 2, 1, 8)
  rect(f, L(15), Y(10), 3, 3, 5)          // far shoulder in shade
  rect(f, L(7), Y(13), 10, 5, 6)          // chest
  rect(f, L(7), Y(13), 3, 5, 7)
  rect(f, L(15), Y(13), 2, 5, 5)
  rect(f, 8, Y(18), 8, 4, 6)              // waist: the lower robe does not lean
  rect(f, 8, Y(18), 2, 4, 7)
  rect(f, 14, Y(18), 2, 4, 5)
  rect(f, 9, Y(22), 6, 3, 6)
  rect(f, 9, Y(22), 2, 3, 7)
  rect(f, 13, Y(22), 2, 3, 5)
  // Tattered hem: three uneven tongues, trailing against the lean.
  const t = -Math.sign(lean)
  rect(f, 9 + t, Y(25), 2, 2, 6); px(f, 9 + t, Y(27), 5)
  rect(f, 12, Y(25), 1, 3, 5)
  rect(f, 14 + t, Y(25), 1, 2, 5); px(f, 14 + t, Y(27), 5)

  // ── The void slit: the robe is open down the front and there is nothing inside. ──
  rect(f, L(11), Y(14), 2, 4, 10)
  rect(f, 11, Y(18), 2, 6, 9)
  px(f, 11, Y(16 + (orbit % 3)), 13)      // a mote drifting in the dark
  if (flare >= 2) px(f, 12, Y(20), 14)

  // ── Hood: a cowl framing the mask, taller than the head inside it. ──
  rect(f, L(8), Y(3), 8, 8, 5)
  rect(f, L(8), Y(3), 2, 8, 6)
  rect(f, L(9), Y(4), 6, 6, 10)           // the dark inside the hood

  // ── Mask: pale, narrow, split by the rift. ──
  rect(f, L(10), Y(5), 4, 5, 3)
  rect(f, L(10), Y(5), 1, 5, 4)           // lit edge
  rect(f, L(13), Y(5), 1, 5, 2)           // shaded edge
  px(f, L(10), Y(9), 2); px(f, L(13), Y(9), 1)  // chin narrows
  // The crack: thin, with one jog, and only full-length when it blazes. A full-height
  // bright line plus two bright eyes turned a 4px mask into a glowing screen.
  const crackFrom = flare >= 2 ? 5 : 6, crackTo = flare >= 2 ? 9 : 8
  for (let y = crackFrom; y <= crackTo; y++) px(f, L(11) + (y >= 7 ? 1 : 0), Y(y), seam)
  // Eyes are dark sockets; they only ignite on the strike.
  px(f, L(10), Y(6), flare >= 2 ? 15 : 9)
  px(f, L(13), Y(6), flare >= 2 ? 15 : 10)

  // ── Broken crown: three spikes, the middle one snapped. ──
  // Spikes splay outward with sky between them; packed together they read as a box.
  rect(f, L(9), Y(2), 6, 1, 2)            // band
  px(f, L(9), Y(2), 3)
  px(f, L(8), Y(1), 3); px(f, L(7), Y(0), flare >= 2 ? 15 : 4)   // near spike, whole, leaning out
  px(f, L(11), Y(1), 2)                                           // middle spike, snapped
  px(f, L(15), Y(1), 2); px(f, L(16), Y(0), 2)                    // far spike, in shade

  // ── Arms: long and thin, OUTSIDE the robe with clear columns either side. ──
  const near = Y(11 + arm)
  rect(f, L(3), near, 2, 9, 6)
  px(f, L(3), near, 7); px(f, L(3), near + 1, 7)
  // Claws: bone, splayed. Three fingers read as a hand at this size; two read as a hook.
  rect(f, L(2), near + 9, 3, 1, 3)
  px(f, L(1), near + 10, 3); px(f, L(3), near + 10, 2); px(f, L(5), near + 10, 2)
  px(f, L(1), near + 11, 2)
  rect(f, L(19), Y(11), 2, 8, 5)          // far arm, in shade
  rect(f, L(19), Y(19), 3, 1, 2)
  px(f, L(19), Y(20), 1); px(f, L(21), Y(20), 1)

  // ── Two rift shards in orbit. Small, bright, and always on opposite sides. ──
  const orbitPts = [[1, 6], [3, 3], [21, 4], [22, 8]]
  const a = orbitPts[orbit % 4], b = orbitPts[(orbit + 2) % 4]
  for (const [sx, sy] of [a, b]) {
    px(f, sx, Y(sy), seam)
    px(f, sx, Y(sy + 1), 13)
  }
  FADE = 0
}

// idle 0-1: a slow hover, shards turning
drawCrown(0, { dy: 0, orbit: 0 })
drawCrown(1, { dy: -1, orbit: 1 })
// walk 2-5: it drifts rather than walks; lean and bob
drawCrown(2, { dy: 0, lean: -1, orbit: 1 })
drawCrown(3, { dy: -1, lean: 0, orbit: 2 })
drawCrown(4, { dy: 0, lean: 1, orbit: 3 })
drawCrown(5, { dy: -1, lean: 0, orbit: 0 })
// attack 6-8: the seam blazes, the claw rises, then rakes down
drawCrown(6, { dy: -1, lean: -1, arm: -4, flare: 2, orbit: 0 })
drawCrown(7, { dy: -2, lean: -2, arm: -6, flare: 2, orbit: 1 })
drawCrown(8, { dy: 0, lean: 1, arm: 2, flare: 2, orbit: 2 })
// hit 9-10: knocked back, the light gutters
drawCrown(9, { dy: 0, lean: 2, flare: 0, orbit: 2 })
drawCrown(10, { dy: 1, lean: 2, flare: 0, orbit: 3 })
// death 11-12: it comes undone into the dark
drawCrown(11, { dy: 1, lean: 1, flare: 2, orbit: 0, fade: 1 })
drawCrown(12, { dy: 2, lean: 1, flare: 0, orbit: 1, fade: 3 })

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
fs.writeFileSync(path.join(outDir, `${ID}.png`), PNG.sync.write(png))
// Frame ranges mirror mob_stoneward / mob_gravewalker: the humanoid-frame mob contract.
fs.writeFileSync(path.join(outDir, `${ID}.json`), JSON.stringify({
  id: ID,
  image: `${ID}.png`,
  frameW: W, frameH: H,
  anchor: ANCHOR,
  sourcePalette: PALETTE,
  animations: {
    idle:   { se: { frames: [0, 1], fps: 3, loop: true },  ne: { frames: [0, 1], fps: 3, loop: true } },
    walk:   { se: { frames: [2, 3, 4, 5], fps: 6, loop: true }, ne: { frames: [2, 3, 4, 5], fps: 6, loop: true } },
    attack: { se: { frames: [6, 7, 8], fps: 9, loop: false }, ne: { frames: [6, 7, 8], fps: 9, loop: false } },
    hit:    { se: { frames: [9, 10], fps: 12, loop: false }, ne: { frames: [9, 10], fps: 12, loop: false } },
    death:  { se: { frames: [11, 12], fps: 5, loop: false }, ne: { frames: [11, 12], fps: 5, loop: false } },
  },
}, null, 2) + '\n')
console.log(`${ID}: ${FRAMES} frames, ${FRAMES * W}x${H} → ${outDir}`)
