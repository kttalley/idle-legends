#!/usr/bin/env node
// ── mob_stoneward: a construct, so golems stop being people ───────────────────
//
// Measured rather than guessed: across the 48-mob bestiary, three HERO archetypes were
// carrying 21 mobs (colossus 7, oathbound 5, magus 5), and four of those were literally
// golems — Harrowfield, Siege War, Warzone and Lava — wearing a person's silhouette with
// a person's proportions. A golem that reads as a big man in armour is the same category
// error the boar-on-a-biped was, just harder to notice.
//
// So this sheet is deliberately NOT humanoid-shaped inside a humanoid frame: no neck, no
// waist, arms that hang past the knees, a head sunk between the shoulders, and a body
// built from slabs with gaps between them. At 24x32 the silhouette is the whole
// characterisation, and "stacked rock" has to be legible in the first glance.
//
// Original geometry. No traced or derived pixels — see tools/spritegen/CLAUDE.md.
//
//   node tools/spritegen/mob_stoneward.mjs [outDir]

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const W = 24, H = 32, FRAMES = 13
const ANCHOR = { x: 12, y: 30 }

// Slot contract (palettes.ts): 1-4 skin · 5-8 primary · 9-12 secondary · 13-15 accent.
// On a construct: 1-4 is the weathered rind, 5-8 the body stone, 9-12 the deep-cut seams
// between slabs, and 13-15 the RUNE-LIGHT in those seams — accent is the rarity channel,
// so an elite construct lights up along its cracks, which is exactly where a golem should
// glow.
const PALETTE = [
  '',
  '#4a4a44', '#66665e', '#84847a', '#a2a296', // 1-4  weathered rind
  '#2c2c2e', '#46464a', '#5e5e64', '#7a7a82', // 5-8  body stone
  '#1a1a1c', '#26262a', '#343438', '#464650', // 9-12 seams / shadow
  '#6a5a2a', '#c8a03c', '#ffe9a8',            // 13-15 rune-light (rarity channel)
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
 * One construct.
 *
 * Proportions calibrated against `mob_gravewalker`, the existing humanoid mob: it occupies
 * only ~14 of the 24 columns and leaves real transparent gaps around the limbs. The first
 * cut of this filled the whole frame and read as a grey slab with two eyes — at 24x32 the
 * NEGATIVE space is what draws the figure, and a shape with no gaps has no silhouette.
 *
 * The golem read comes from three deliberate departures from a person: shoulders much
 * wider than the hips, arms hanging outside the torso with daylight between, and a head
 * too small for the body and sunk between the shoulders.
 *
 * `lean` shifts the upper mass without moving the feet — a golem turns by tilting its whole
 * trunk, having no waist. `arm` swings the near arm. `crack` opens the rune-seams, which is
 * how it telegraphs a strike.
 */
function drawGolem(f, { dy = 0, lean = 0, arm = 0, crack = 0, fall = 0 } = {}) {
  const Y = y => y + dy + fall
  const L = x => x + lean

  // ── Legs: two short pillars with a wide gap. The gap is what stops the lower half
  // reading as one block. ──
  if (fall < 4) {
    rect(f, 6, Y(21), 4, 8, 6)
    rect(f, 14, Y(21), 4, 8, 5)          // far leg sits in shade
    rect(f, 6, Y(21), 2, 8, 7)           // lit edge on the near leg
    rect(f, 5, Y(29), 6, 2, 5)           // slab feet, wider than the legs
    rect(f, 13, Y(29), 6, 2, 5)
    px(f, 5, Y(30), 1); px(f, 18, Y(30), 1)
  }

  // ── Torso: narrow at the hip, flaring to a heavy shoulder shelf. ──
  rect(f, L(7), Y(14), 10, 7, 6)         // hips / lower trunk
  rect(f, L(7), Y(14), 3, 7, 7)
  rect(f, L(15), Y(14), 2, 7, 5)
  rect(f, L(6), Y(10), 12, 4, 6)         // chest
  rect(f, L(6), Y(10), 4, 4, 7)
  rect(f, L(15), Y(10), 3, 4, 5)
  // Shoulder shelf stops INSIDE the arm columns. Spanning them turned the whole upper body
  // into one horizontal bar and the figure read as a scarecrow crossbar.
  rect(f, L(6), Y(9), 12, 1, 7)
  rect(f, L(6), Y(9), 4, 1, 8)

  // ── Seams. ONE horizontal cut, not a cross: the first version's crossed seams read as a
  // graphic laid over the body rather than as masonry. ──
  rect(f, L(7), Y(13), 10, 1, 9)
  px(f, L(11), Y(17), 9); px(f, L(11), Y(18), 9)
  // Rune-light: a short glow off-centre in the seam, not a bar across it — centred and
  // full-width it read as a belt buckle.
  rect(f, L(8), Y(13), 2 + crack * 2, 1, crack > 1 ? 15 : 14)

  // ── Head: too small for the body, sunk between the shoulders, sky either side. ──
  rect(f, L(9), Y(4), 6, 5, 6)
  rect(f, L(9), Y(4), 2, 5, 7)
  rect(f, L(8), Y(3), 8, 1, 5)           // brow slab overhangs
  px(f, L(10), Y(6), 14); px(f, L(13), Y(6), 14)
  if (crack > 0) { px(f, L(10), Y(6), 15); px(f, L(13), Y(6), 15) }

  // ── Arms: OUTSIDE the torso with a gap, and longer than a person's. The gap is the
  // single most important pixel decision on the sheet. ──
  // x5 and x18 are left CLEAR on purpose — that pair of empty columns is what separates
  // the arms from the trunk, and it is the single most important decision on the sheet.
  const near = Y(11 + arm)
  rect(f, L(2), near, 3, 8, 6)
  rect(f, L(2), near, 1, 8, 7)
  rect(f, L(1), near + 7, 5, 3, 5)       // fist, oversized
  rect(f, L(19), Y(11), 3, 7, 5)         // far arm, fully in shade
  rect(f, L(19), Y(17), 4, 3, 5)

  // ── Rubble at the feet. Sells weight for three pixels. ──
  if (fall < 4) { px(f, 3, Y(30), 2); px(f, 20, Y(30), 2) }
}

// idle 0-1 — a slow settle, no breathing (it does not breathe)
drawGolem(0, {})
drawGolem(1, { dy: 1 })
// walk 2-5 — lean, plant, lean back, plant
drawGolem(2, { lean: -1, arm: 1 })
drawGolem(3, { lean: 0, arm: 0, dy: 1 })
drawGolem(4, { lean: 1, arm: -1 })
drawGolem(5, { lean: 0, arm: 0, dy: 1 })
// attack 6-8 — wind up (seams flare), then bring the fist down
drawGolem(6, { lean: -2, arm: -3, crack: 1 })
drawGolem(7, { lean: 1, arm: -4, crack: 2 })
drawGolem(8, { lean: 2, arm: 4, crack: 1 })
// hit 9-10 — rocked back, light guttering
drawGolem(9, { lean: 2, dy: 1 })
drawGolem(10, { lean: 3, dy: 2 })
// death 11-12 — it comes apart
drawGolem(11, { dy: 4, fall: 2, lean: 2 })
drawGolem(12, { dy: 8, fall: 6, lean: 4 })

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
fs.writeFileSync(path.join(outDir, 'mob_stoneward.png'), PNG.sync.write(png))
// Frame ranges mirror `mob_gravewalker.json` — the humanoid-frame mob contract.
fs.writeFileSync(path.join(outDir, 'mob_stoneward.json'), JSON.stringify({
  id: 'mob_stoneward',
  image: 'mob_stoneward.png',
  frameW: W, frameH: H,
  anchor: ANCHOR,
  sourcePalette: PALETTE,
  animations: {
    idle:   { se: { frames: [0, 1], fps: 4, loop: true },  ne: { frames: [0, 1], fps: 4, loop: true } },
    walk:   { se: { frames: [2, 3, 4, 5], fps: 8, loop: true }, ne: { frames: [2, 3, 4, 5], fps: 8, loop: true } },
    attack: { se: { frames: [6, 7, 8], fps: 10, loop: false }, ne: { frames: [6, 7, 8], fps: 10, loop: false } },
    hit:    { se: { frames: [9, 10], fps: 12, loop: false }, ne: { frames: [9, 10], fps: 12, loop: false } },
    death:  { se: { frames: [11, 12], fps: 6, loop: false }, ne: { frames: [11, 12], fps: 6, loop: false } },
  },
}, null, 2) + '\n')
console.log(`mob_stoneward: ${FRAMES} frames, ${FRAMES * W}x${H} → ${outDir}`)
