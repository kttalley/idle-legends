// Programmatic placeholder art, generated directly in the runtime indexed format with
// correct feet-center anchors. This is the committed, shippable default art path; the
// gitignored FFTA scaffold and later gen-AI/hand-drawn art replace it file-by-file with
// zero code changes. Slot usage follows the semantic contract (graphics-spec §5.1).

import type { AnimationSet, IndexedSprite } from './types'

// ── Tiny pixel-painting helpers over a frame-major Uint8Array ────────────────

class Painter {
  readonly data: Uint8Array
  constructor(
    readonly frameW: number,
    readonly frameH: number,
    readonly frameCount: number,
  ) {
    this.data = new Uint8Array(frameCount * frameW * frameH)
  }

  px(f: number, x: number, y: number, slot: number): void {
    if (x < 0 || y < 0 || x >= this.frameW || y >= this.frameH) return
    this.data[f * this.frameW * this.frameH + y * this.frameW + x] = slot
  }

  rect(f: number, x: number, y: number, w: number, h: number, slot: number): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(f, xx, yy, slot)
    }
  }
}

// ── Humanoid rig: 24×32, feet-center anchor (12, 30) ─────────────────────────
// Frames (single row): se: idle 0-1 · walk 2-5 · attack 6-8 · hit 9-10
//                      ne: same order at +11.

const H_FRAMES = 22
const HW = 24
const HH = 32

function drawHumanoid(p: Painter, f: number, opts: { back: boolean; bob: number; legPhase: number; armReach: number; recoil: number }): void {
  const { back, bob, legPhase, armReach, recoil } = opts
  const cx = 12 - recoil // hit frames knock the body back a pixel or two
  const top = 6 + bob

  // Legs — secondary material (9–12); walk swings via legPhase (-1, 0, 1).
  const legY = 24
  p.rect(f, cx - 4 + legPhase, legY, 3, 6, 10)
  p.rect(f, cx + 1 - legPhase, legY, 3, 6, 11)
  p.rect(f, cx - 4 + legPhase, legY + 5, 3, 1, 9) // boots shadow line
  p.rect(f, cx + 1 - legPhase, legY + 5, 3, 1, 9)

  // Torso — primary material (5–8), simple left-lit shading.
  p.rect(f, cx - 5, top + 8, 10, 10, 6)
  p.rect(f, cx - 5, top + 8, 3, 10, 7) // lit edge
  p.rect(f, cx + 3, top + 8, 2, 10, 5) // shade edge
  p.rect(f, cx - 5, top + 17, 10, 1, 5) // belt line

  // Arms — skin at hands, primary sleeves. Attack extends the weapon arm.
  const armY = top + 9
  p.rect(f, cx - 7, armY, 2, 7, 6)
  p.rect(f, cx - 7, armY + 6, 2, 2, 3) // hand
  const reach = armReach // 0..5 px extension on attack frames
  p.rect(f, cx + 5, armY, 2, 6 - Math.min(3, reach), 6)
  p.rect(f, cx + 5 + reach, armY + 4 - reach, 2, 2, 3)

  // Weapon — accent channel (13–15), so rarity swaps read instantly.
  const wx = cx + 6 + reach
  const wy = armY + 3 - reach
  p.rect(f, wx, wy - 6, 1, 7, 14)
  p.px(f, wx, wy - 7, 15)
  p.rect(f, wx - 1, wy + 1, 3, 1, 13) // crossguard

  // Head — skin ramp (1–4); back view has hair cap instead of face.
  p.rect(f, cx - 4, top, 8, 8, 3)
  p.rect(f, cx - 4, top, 2, 8, 4) // lit side
  p.rect(f, cx + 3, top, 1, 8, 2) // shaded side
  if (back) {
    p.rect(f, cx - 4, top, 8, 5, 9) // hair from behind
  } else {
    p.px(f, cx - 2, top + 3, 1) // eyes
    p.px(f, cx + 1, top + 3, 1)
  }
  p.rect(f, cx - 4, top - 1, 8, 1, 9) // hairline
}

function humanoidAnimations(): AnimationSet {
  const dir = (o: number) => ({
    idle: { frames: [o + 0, o + 1], fps: 2, loop: true },
    walk: { frames: [o + 2, o + 3, o + 4, o + 5], fps: 8, loop: true },
    attack: { frames: [o + 6, o + 7, o + 8], fps: 12, loop: false },
    hit: { frames: [o + 9, o + 10], fps: 10, loop: false },
  })
  const se = dir(0)
  const ne = dir(11)
  return {
    idle: { se: se.idle, ne: ne.idle },
    walk: { se: se.walk, ne: ne.walk },
    attack: { se: se.attack, ne: ne.attack },
    hit: { se: se.hit, ne: ne.hit },
  }
}

export function makeHumanoidRig(id = 'rig/humanoid'): IndexedSprite {
  const p = new Painter(HW, HH, H_FRAMES)
  for (const back of [false, true]) {
    const o = back ? 11 : 0
    drawHumanoid(p, o + 0, { back, bob: 0, legPhase: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 1, { back, bob: 1, legPhase: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 2, { back, bob: 0, legPhase: -1, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 3, { back, bob: 1, legPhase: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 4, { back, bob: 0, legPhase: 1, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 5, { back, bob: 1, legPhase: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 6, { back, bob: 0, legPhase: 0, armReach: 1, recoil: 0 })
    drawHumanoid(p, o + 7, { back, bob: 0, legPhase: -1, armReach: 4, recoil: 0 })
    drawHumanoid(p, o + 8, { back, bob: 0, legPhase: 0, armReach: 2, recoil: 0 })
    drawHumanoid(p, o + 9, { back, bob: 0, legPhase: 0, armReach: 0, recoil: 2 })
    drawHumanoid(p, o + 10, { back, bob: 1, legPhase: 0, armReach: 0, recoil: 1 })
  }
  return {
    id,
    frameW: HW,
    frameH: HH,
    cols: H_FRAMES,
    frameCount: H_FRAMES,
    indices: p.data,
    anchor: { x: 12, y: 30 },
    animations: humanoidAnimations(),
  }
}

// ── Beast rig: 28×22 quadruped, for enemy variety ────────────────────────────

const B_FRAMES = 22
const BW = 28
const BH = 22

function drawBeast(p: Painter, f: number, opts: { back: boolean; bob: number; legPhase: number; lunge: number; recoil: number }): void {
  const { back, bob, legPhase, lunge, recoil } = opts
  const cx = 14 + lunge - recoil
  const top = 6 + bob

  // Legs — secondary.
  p.rect(f, cx - 8 + legPhase, 16, 3, 5, 10)
  p.rect(f, cx + 4 - legPhase, 16, 3, 5, 11)
  // Body mass — primary with shading.
  p.rect(f, cx - 9, top + 2, 18, 9, 6)
  p.rect(f, cx - 9, top + 2, 18, 2, 7)
  p.rect(f, cx - 9, top + 9, 18, 2, 5)
  // Head — primary, toward viewer or away.
  const hx = back ? cx - 12 : cx + 7
  p.rect(f, hx, top, 6, 7, 7)
  if (!back) {
    p.px(f, hx + 4, top + 2, 15) // eye glints in the accent channel
    p.px(f, hx + 2, top + 2, 15)
    p.rect(f, hx + 1, top + 6, 4, 1, 13) // maw
  }
  // Spine ridge — accent.
  p.rect(f, cx - 6, top + 1, 12, 1, 14)
  // Tail — secondary.
  p.rect(f, back ? cx + 8 : cx - 12, top + 4, 3, 2, 9)
}

export function makeBeastRig(id = 'rig/beast'): IndexedSprite {
  const p = new Painter(BW, BH, B_FRAMES)
  for (const back of [false, true]) {
    const o = back ? 11 : 0
    drawBeast(p, o + 0, { back, bob: 0, legPhase: 0, lunge: 0, recoil: 0 })
    drawBeast(p, o + 1, { back, bob: 1, legPhase: 0, lunge: 0, recoil: 0 })
    drawBeast(p, o + 2, { back, bob: 0, legPhase: -1, lunge: 0, recoil: 0 })
    drawBeast(p, o + 3, { back, bob: 1, legPhase: 0, lunge: 0, recoil: 0 })
    drawBeast(p, o + 4, { back, bob: 0, legPhase: 1, lunge: 0, recoil: 0 })
    drawBeast(p, o + 5, { back, bob: 1, legPhase: 0, lunge: 0, recoil: 0 })
    drawBeast(p, o + 6, { back, bob: 0, legPhase: 0, lunge: 1, recoil: 0 })
    drawBeast(p, o + 7, { back, bob: 0, legPhase: 1, lunge: 4, recoil: 0 })
    drawBeast(p, o + 8, { back, bob: 0, legPhase: 0, lunge: 2, recoil: 0 })
    drawBeast(p, o + 9, { back, bob: 0, legPhase: 0, lunge: 0, recoil: 2 })
    drawBeast(p, o + 10, { back, bob: 1, legPhase: 0, lunge: 0, recoil: 1 })
  }
  return {
    id,
    frameW: BW,
    frameH: BH,
    cols: B_FRAMES,
    frameCount: B_FRAMES,
    indices: p.data,
    anchor: { x: 14, y: 20 },
    animations: humanoidAnimations(), // same tag → frame-index scheme
  }
}

// ── Tileset: 32×24 frames (bottom 16 = ground diamond, top 8 = raised detail) ─
// Frames: 0 grass · 1 grass alt · 2 water · 3 water alt · 4 cliff · 5 path

const T_FRAMES = 6
const TW = 32
const TH = 24
const DIAMOND_TOP = 8 // ground diamond occupies y 8..23

/** Row half-widths of a 32×16 diamond, y = 0..15 from the diamond's top. */
function diamondHalfWidth(y: number): number {
  return y < 8 ? 2 * (y + 1) : 2 * (16 - y)
}

function fillDiamond(p: Painter, f: number, slotOf: (x: number, y: number) => number): void {
  for (let y = 0; y < 16; y++) {
    const hw = diamondHalfWidth(y)
    for (let x = 16 - hw; x < 16 + hw; x++) {
      p.px(f, x, DIAMOND_TOP + y, slotOf(x, y))
    }
  }
}

/** Deterministic per-pixel hash for texture speckling (authoring-time only). */
function speck(x: number, y: number, f: number): number {
  let h = x * 374761393 + y * 668265263 + f * 2147483647
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) % 100
}

export function makeTileset(id = 'tileset/base'): IndexedSprite {
  const p = new Painter(TW, TH, T_FRAMES)

  // 0/1: grass — primary ramp with speckle; edge rows darker for tile separation.
  for (const f of [0, 1]) {
    fillDiamond(p, f, (x, y) => {
      if (y >= 14) return 5
      const s = speck(x, y, f)
      return s < 8 ? 8 : s < 22 ? 7 : 6
    })
  }
  // 2/3: water — secondary ramp, wave glints alternate between the two frames.
  for (const f of [2, 3]) {
    fillDiamond(p, f, (x, y) => {
      const s = speck(x, y + (f === 3 ? 5 : 0), 2)
      if (y >= 14) return 9
      return s < 7 ? 12 : s < 18 ? 11 : 10
    })
  }
  // 4: cliff — grass cap + raised rock detail above the plane (accent/stone slots).
  fillDiamond(p, 4, (x, y) => {
    if (y >= 14) return 5
    const s = speck(x, y, 4)
    return s < 12 ? 14 : s < 40 ? 13 : 6
  })
  for (let y = 0; y < DIAMOND_TOP; y++) {
    // Rock outcrop rising off the plane; narrower than the diamond.
    const hw = 4 + y
    for (let x = 16 - hw; x < 16 + hw; x++) {
      const s = speck(x, y, 9)
      p.px(4, x, y, s < 30 ? 13 : s < 45 ? 15 : 14)
    }
  }
  // 5: path/dirt — earth ramp.
  fillDiamond(p, 5, (x, y) => {
    if (y >= 14) return 1
    const s = speck(x, y, 5)
    return s < 15 ? 4 : s < 40 ? 3 : 2
  })

  const still = (frame: number) => ({
    se: { frames: [frame], fps: 1, loop: true },
    ne: { frames: [frame], fps: 1, loop: true },
  })
  return {
    id,
    frameW: TW,
    frameH: TH,
    cols: T_FRAMES,
    frameCount: T_FRAMES,
    indices: p.data,
    anchor: { x: 16, y: 20 },
    animations: { idle: still(0), walk: still(0), attack: still(0), hit: still(0) },
  }
}

export const TILE = { GRASS: 0, GRASS_ALT: 1, WATER: 2, WATER_ALT: 3, CLIFF: 4, PATH: 5 } as const
