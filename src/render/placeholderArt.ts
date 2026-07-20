// Programmatic placeholder art, generated directly in the runtime indexed format with
// correct feet-center anchors. This is the committed, shippable default art path; the
// gitignored FFTA scaffold and later gen-AI/hand-drawn art replace it file-by-file with
// zero code changes. Slot usage follows the semantic contract (graphics-spec §5.1).

import type { AnimationSet, IndexedSprite, TileAnimCycle } from './types'

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

function drawHumanoid(p: Painter, f: number, opts: { back: boolean; bob: number; legPhase: number; armSwing: number; armReach: number; recoil: number }): void {
  const { back, bob, legPhase, armSwing, armReach, recoil } = opts
  const cx = 12 - recoil // hit frames knock the body back a pixel or two
  const top = 6 + bob

  // Legs — secondary material (9–12); walk swings via legPhase (±2 contact ↔ 0 pass).
  // The lifting leg shortens by 1px on passing frames so a stride reads as stepping,
  // not as a shiver — the difference between "walking" and "flinching in place".
  const legY = 24
  const liftL = legPhase === 0 ? 1 : 0   // left leg lifts when legs come together
  const liftR = legPhase === 0 ? 1 : 0
  p.rect(f, cx - 4 + legPhase, legY, 3, 6 - liftL, 10)
  p.rect(f, cx + 1 - legPhase, legY, 3, 6 - liftR, 11)
  p.rect(f, cx - 4 + legPhase, legY + 5 - liftL, 3, 1, 9) // boots shadow line
  p.rect(f, cx + 1 - legPhase, legY + 5 - liftR, 3, 1, 9)

  // Torso — primary material (5–8), simple left-lit shading.
  p.rect(f, cx - 5, top + 8, 10, 10, 6)
  p.rect(f, cx - 5, top + 8, 3, 10, 7) // lit edge
  p.rect(f, cx + 3, top + 8, 2, 10, 5) // shade edge
  p.rect(f, cx - 5, top + 17, 10, 1, 5) // belt line

  // Arms — skin at hands, primary sleeves. The back arm swings opposite the legs
  // (armSwing); the weapon arm reaches forward on attack frames (armReach).
  const armY = top + 9
  p.rect(f, cx - 7 + armSwing, armY, 2, 7, 6)
  p.rect(f, cx - 7 + armSwing, armY + 6, 2, 2, 3) // hand
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
    drawHumanoid(p, o + 0, { back, bob: 0, legPhase: 0, armSwing: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 1, { back, bob: 1, legPhase: 0, armSwing: 0, armReach: 0, recoil: 0 })
    // Walk: ±2px stride + 2px bob + back-arm swing opposite the legs. Contact
    // frames (legs apart) sit low; passing frames (legs together) rise — the
    // vertical bob is what sells forward motion when the camera locks to the unit.
    drawHumanoid(p, o + 2, { back, bob: 0, legPhase: -2, armSwing: 2, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 3, { back, bob: 2, legPhase: 0, armSwing: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 4, { back, bob: 0, legPhase: 2, armSwing: -2, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 5, { back, bob: 2, legPhase: 0, armSwing: 0, armReach: 0, recoil: 0 })
    drawHumanoid(p, o + 6, { back, bob: 0, legPhase: 0, armSwing: 0, armReach: 1, recoil: 0 })
    drawHumanoid(p, o + 7, { back, bob: 0, legPhase: -1, armSwing: 0, armReach: 4, recoil: 0 })
    drawHumanoid(p, o + 8, { back, bob: 0, legPhase: 0, armSwing: 0, armReach: 2, recoil: 0 })
    drawHumanoid(p, o + 9, { back, bob: 0, legPhase: 0, armSwing: 0, armReach: 0, recoil: 2 })
    drawHumanoid(p, o + 10, { back, bob: 1, legPhase: 0, armSwing: 0, armReach: 0, recoil: 1 })
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
    drawBeast(p, o + 2, { back, bob: 0, legPhase: -2, lunge: 0, recoil: 0 })
    drawBeast(p, o + 3, { back, bob: 2, legPhase: 0, lunge: 0, recoil: 0 })
    drawBeast(p, o + 4, { back, bob: 0, legPhase: 2, lunge: 0, recoil: 0 })
    drawBeast(p, o + 5, { back, bob: 2, legPhase: 0, lunge: 0, recoil: 0 })
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
//         6 sand · 7 rock · 8 snow · 9 moss · 10 flower · 11 path alt
// All palette-indexed so Phase A biome palettes tint them via their semantic channels
// (earth 1-4, veg 5-8, water 9-12, stone 13-15).

const T_FRAMES = 12
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
  // 6: sand — pale earth ramp (dust/wastes/desert). Lighter and more uniform than path.
  fillDiamond(p, 6, (x, y) => {
    if (y >= 14) return 2
    const s = speck(x, y, 6)
    return s < 10 ? 2 : s < 45 ? 3 : 4
  })
  // 7: rock — stone/accent ramp (badlands/peaks/cinder). Flat diamond of bare stone.
  fillDiamond(p, 7, (x, y) => {
    if (y >= 14) return 13
    const s = speck(x, y, 7)
    return s < 20 ? 15 : s < 50 ? 14 : 13
  })
  // 8: snow — palest accent ramp (future snow biome). Reads white under a cool palette.
  fillDiamond(p, 8, (x, y) => {
    if (y >= 14) return 14
    const s = speck(x, y, 8)
    return s < 15 ? 13 : s < 50 ? 14 : 15
  })
  // 9: moss — darker vegetation ramp (jungle/swamp/forest floor). Leans 5-6 vs grass 6-8.
  fillDiamond(p, 9, (x, y) => {
    if (y >= 14) return 5
    const s = speck(x, y, 9)
    return s < 12 ? 5 : s < 30 ? 6 : 7
  })
  // 10: flower — grass base (6-8) with sparse bright accent (15) blooms. Tints with the
  // biome's lightest accent, so meadow = cream blooms, venom = pale purple, etc.
  fillDiamond(p, 10, (x, y) => {
    if (y >= 14) return 5
    if (speck(x, y, 71) < 5) return 15
    if (speck(x, y, 72) < 3) return 12
    const s = speck(x, y, 10)
    return s < 8 ? 8 : s < 22 ? 7 : 6
  })
  // 11: path alt — darker earth ramp (worn/trampled dirt).
  fillDiamond(p, 11, (x, y) => {
    if (y >= 14) return 1
    const s = speck(x, y, 11)
    return s < 15 ? 1 : s < 40 ? 2 : 3
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

export const TILE = {
  GRASS: 0, GRASS_ALT: 1, WATER: 2, WATER_ALT: 3, CLIFF: 4, PATH: 5,
  SAND: 6, ROCK: 7, SNOW: 8, MOSS: 9, FLOWER: 10, PATH_ALT: 11,
} as const

// Animated ground cycles (environment-plan Phase B): water shimmers between its two
// authored frames. Any tileset cell baked as WATER or WATER_ALT reblits through this
// cycle; the second water frame (WATER_ALT) is authored but otherwise unused, so this
// wires it up the FFTA slot-swap way without rebaking the whole ground. ~0.4s/flip.
export const TILE_ANIMS: TileAnimCycle[] = [
  { frames: [TILE.WATER, TILE.WATER_ALT], dur: 0.4 },
]

// ── Flat prop sheet (environment-plan Phase D) ────────────────────────────────
// Small (≤ one tile footprint) ground clutter: tufts, pebbles, flowers, crystals,
// mushrooms, bones, cattails, rocks. Frames are 32×24 (same canvas as tiles) with
// transparent margins and a 4–6px motif sitting on the diamond's lower-center, so
// stamping at a tile's (dx, dy) lands the prop on that tile's surface (and raises
// with it, since dy is height-aware). Palette-indexed → biome palettes tint props.
// artId order must match data/types PROP_KIND.

// Render-side prop art-id contract — mirrors data/types PROP_KIND (the data layer owns
// the id taxonomy; the render layer owns the art). mapAdapter/combatAdapter bridge them.
export const PROP = { TUFT: 0, PEBBLE: 1, FLOWER: 2, CRYSTAL: 3, MUSHROOM: 4, BONE: 5, CATTAIL: 6, ROCK: 7 } as const
const P_FRAMES = 8

export function makePropSheet(id = 'props/base'): IndexedSprite {
  const p = new Painter(TW, TH, P_FRAMES)
  const stamp = (f: number, pxs: readonly [number, number, number][]) => {
    for (const [x, y, s] of pxs) p.px(f, x, y, s)
  }
  // TUFT — a small fan of grass blades (veg ramp).
  stamp(PROP.TUFT, [
    [15, 16, 6], [16, 15, 7], [17, 16, 6], [16, 17, 5], [14, 17, 6], [18, 17, 6], [16, 14, 8],
  ])
  // PEBBLE — a few stone pixels (accent ramp).
  stamp(PROP.PEBBLE, [
    [15, 18, 14], [16, 18, 15], [17, 18, 13], [16, 19, 13],
  ])
  // FLOWER — green stem + bright accent bloom.
  stamp(PROP.FLOWER, [
    [16, 17, 6], [16, 18, 5], [16, 15, 15], [15, 15, 12], [17, 15, 12],
  ])
  // CRYSTAL — a tiny faceted gem (accent ramp).
  stamp(PROP.CRYSTAL, [
    [16, 14, 15], [15, 15, 14], [16, 15, 15], [17, 15, 14], [16, 16, 13],
  ])
  // MUSHROOM — earth stem + accent cap.
  stamp(PROP.MUSHROOM, [
    [16, 17, 2], [16, 18, 1], [15, 16, 14], [16, 16, 15], [17, 16, 14], [16, 15, 15],
  ])
  // BONE — a small pale diagonal bone.
  stamp(PROP.BONE, [
    [14, 18, 15], [15, 18, 15], [16, 17, 15], [15, 19, 15], [17, 17, 15],
  ])
  // CATTAIL — tall green spike with an earth-brown head (swamp/wetland).
  stamp(PROP.CATTAIL, [
    [16, 16, 6], [16, 17, 6], [16, 18, 6], [16, 19, 5], [16, 14, 3], [16, 15, 3],
  ])
  // ROCK — a low stone cluster (accent ramp).
  stamp(PROP.ROCK, [
    [15, 18, 14], [16, 18, 13], [17, 18, 14], [16, 17, 14], [15, 19, 13], [17, 19, 13],
  ])

  const still = (frame: number) => ({
    se: { frames: [frame], fps: 1, loop: true },
    ne: { frames: [frame], fps: 1, loop: true },
  })
  return {
    id,
    frameW: TW,
    frameH: TH,
    cols: P_FRAMES,
    frameCount: P_FRAMES,
    indices: p.data,
    anchor: { x: 16, y: 20 },
    animations: { idle: still(0), walk: still(0), attack: still(0), hit: still(0) },
  }
}

// ── Tall prop entities (environment-plan Phase E) ─────────────────────────────
// Trees / rocks / crystals / structures with a feet anchor so the scene's painter
// sort places them by screen-Y against units — a unit walking "above" a tree is
// occluded by it, "below" it draws in front (FFTA BG1 "prop-in-front" behaviour).
// Each kind is its own single-frame IndexedSprite (the Animator pins frame 0 for a
// 1-frame still sprite, so per-kind sprites are the clean way to give each node a
// distinct look). 32×48 frames, base ~y40, anchor (16,40) → base sits on the tile's
// feet point and the art rises above the plane. Palette-indexed → biome palettes tint.

export const TALL_PROP = {
  TREE: 0, ROCK_BIG: 1, CRYSTAL_CLUSTER: 2, LAIR: 3, HERB_BUSH: 4, ORE_OUTCROP: 5, CAIRN: 6,
} as const

const TP_W = 32
const TP_H = 48
const TP_N = 7

export function makePropEntities(): Record<number, IndexedSprite> {
  const p = new Painter(TP_W, TP_H, TP_N)
  // 0 TREE — trunk + canopy.
  p.rect(TALL_PROP.TREE, 15, 36, 2, 6, 2)
  p.rect(TALL_PROP.TREE, 15, 42, 2, 2, 1)
  p.rect(TALL_PROP.TREE, 9, 16, 14, 10, 6)
  p.rect(TALL_PROP.TREE, 12, 10, 8, 7, 7)
  p.rect(TALL_PROP.TREE, 8, 22, 16, 5, 5)
  p.px(TALL_PROP.TREE, 14, 12, 8); p.px(TALL_PROP.TREE, 18, 14, 8); p.px(TALL_PROP.TREE, 12, 18, 8)
  // 1 ROCK_BIG — large boulder.
  p.rect(TALL_PROP.ROCK_BIG, 8, 30, 16, 12, 14)
  p.rect(TALL_PROP.ROCK_BIG, 10, 26, 12, 5, 15)
  p.rect(TALL_PROP.ROCK_BIG, 7, 38, 18, 4, 13)
  p.px(TALL_PROP.ROCK_BIG, 12, 28, 15); p.px(TALL_PROP.ROCK_BIG, 18, 30, 15)
  p.px(TALL_PROP.ROCK_BIG, 14, 34, 13); p.px(TALL_PROP.ROCK_BIG, 15, 35, 13)
  // 2 CRYSTAL_CLUSTER — three faceted crystals.
  p.rect(TALL_PROP.CRYSTAL_CLUSTER, 9, 32, 4, 8, 14); p.px(TALL_PROP.CRYSTAL_CLUSTER, 11, 30, 15); p.px(TALL_PROP.CRYSTAL_CLUSTER, 10, 40, 13)
  p.rect(TALL_PROP.CRYSTAL_CLUSTER, 15, 24, 4, 16, 15); p.px(TALL_PROP.CRYSTAL_CLUSTER, 17, 22, 15); p.px(TALL_PROP.CRYSTAL_CLUSTER, 16, 40, 13)
  p.rect(TALL_PROP.CRYSTAL_CLUSTER, 21, 30, 4, 10, 14); p.px(TALL_PROP.CRYSTAL_CLUSTER, 23, 28, 15); p.px(TALL_PROP.CRYSTAL_CLUSTER, 22, 40, 13)
  p.rect(TALL_PROP.CRYSTAL_CLUSTER, 8, 40, 18, 2, 13)
  // 3 LAIR — dark stone structure with an ominous glow (boss lair).
  p.rect(TALL_PROP.LAIR, 7, 34, 18, 8, 13)
  p.rect(TALL_PROP.LAIR, 9, 28, 14, 6, 14)
  p.rect(TALL_PROP.LAIR, 14, 34, 4, 8, 1)
  p.px(TALL_PROP.LAIR, 16, 30, 15); p.px(TALL_PROP.LAIR, 15, 31, 15); p.px(TALL_PROP.LAIR, 17, 31, 15)
  p.px(TALL_PROP.LAIR, 9, 27, 15); p.px(TALL_PROP.LAIR, 22, 27, 15)
  // 4 HERB_BUSH — low leafy bush with berry accents (herb node).
  p.rect(TALL_PROP.HERB_BUSH, 10, 34, 12, 8, 6)
  p.rect(TALL_PROP.HERB_BUSH, 12, 32, 8, 4, 7)
  p.px(TALL_PROP.HERB_BUSH, 13, 34, 8); p.px(TALL_PROP.HERB_BUSH, 18, 35, 8)
  p.px(TALL_PROP.HERB_BUSH, 12, 36, 12); p.px(TALL_PROP.HERB_BUSH, 19, 37, 12); p.px(TALL_PROP.HERB_BUSH, 15, 39, 12)
  // 5 ORE_OUTCROP — rock with bright ore veins (ore node).
  p.rect(TALL_PROP.ORE_OUTCROP, 8, 32, 16, 10, 13)
  p.rect(TALL_PROP.ORE_OUTCROP, 10, 28, 12, 5, 14)
  p.px(TALL_PROP.ORE_OUTCROP, 12, 34, 15); p.px(TALL_PROP.ORE_OUTCROP, 13, 35, 15)
  p.px(TALL_PROP.ORE_OUTCROP, 18, 36, 15); p.px(TALL_PROP.ORE_OUTCROP, 19, 37, 15)
  p.px(TALL_PROP.ORE_OUTCROP, 15, 38, 15); p.px(TALL_PROP.ORE_OUTCROP, 14, 32, 12)
  // 6 CAIRN — stacked-stone waymarker (mob spawn).
  p.rect(TALL_PROP.CAIRN, 11, 36, 10, 6, 14)
  p.rect(TALL_PROP.CAIRN, 13, 30, 6, 6, 13)
  p.rect(TALL_PROP.CAIRN, 14, 25, 4, 5, 15)
  p.px(TALL_PROP.CAIRN, 15, 26, 15)

  const still = (frame: number) => ({
    se: { frames: [frame], fps: 1, loop: true },
    ne: { frames: [frame], fps: 1, loop: true },
  })
  const slice = (f: number, id: string): IndexedSprite => {
    const indices = new Uint8Array(TP_W * TP_H)
    indices.set(p.data.subarray(f * TP_W * TP_H, (f + 1) * TP_W * TP_H))
    return {
      id, frameW: TP_W, frameH: TP_H, cols: 1, frameCount: 1, indices,
      anchor: { x: 16, y: 40 },
      animations: { idle: still(0), walk: still(0), attack: still(0), hit: still(0) },
    }
  }
  return {
    [TALL_PROP.TREE]: slice(TALL_PROP.TREE, 'props/tall/tree'),
    [TALL_PROP.ROCK_BIG]: slice(TALL_PROP.ROCK_BIG, 'props/tall/rock'),
    [TALL_PROP.CRYSTAL_CLUSTER]: slice(TALL_PROP.CRYSTAL_CLUSTER, 'props/tall/crystal'),
    [TALL_PROP.LAIR]: slice(TALL_PROP.LAIR, 'props/tall/lair'),
    [TALL_PROP.HERB_BUSH]: slice(TALL_PROP.HERB_BUSH, 'props/tall/herb'),
    [TALL_PROP.ORE_OUTCROP]: slice(TALL_PROP.ORE_OUTCROP, 'props/tall/ore'),
    [TALL_PROP.CAIRN]: slice(TALL_PROP.CAIRN, 'props/tall/cairn'),
  }
}

// ── Spell effects: bolt (looping projectile) + burst (one-shot impact) ───────
// Drawn entirely in the accent channel (13–15) + primary core, so spell schools are
// palette ids ('spell/fire', 'spell/frost', …), not separate art — same trick as units.

export function makeBoltRig(id = 'fx/bolt'): IndexedSprite {
  const FW = 10
  const FH = 10
  const p = new Painter(FW, FH, 2)
  for (const f of [0, 1]) {
    const r = f === 0 ? 3 : 4 // pulse
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const d2 = (x - 5) * (x - 5) + (y - 5) * (y - 5)
        if (d2 <= (r - 2) * (r - 2)) p.px(f, x, y, 15)
        else if (d2 <= (r - 1) * (r - 1)) p.px(f, x, y, 14)
        else if (d2 <= r * r) p.px(f, x, y, 13)
      }
    }
  }
  const anim = (frames: number[], fps: number, loop: boolean) => ({
    se: { frames, fps, loop },
    ne: { frames, fps, loop },
  })
  return {
    id,
    frameW: FW,
    frameH: FH,
    cols: 2,
    frameCount: 2,
    indices: p.data,
    anchor: { x: 5, y: 5 },
    animations: { idle: anim([0, 1], 8, true), walk: anim([0, 1], 8, true), attack: anim([0, 1], 8, true), hit: anim([0, 1], 8, true) },
  }
}

export function makeBurstRig(id = 'fx/burst'): IndexedSprite {
  const FW = 26
  const FH = 26
  const FRAMES = 5
  const p = new Painter(FW, FH, FRAMES)
  for (let f = 0; f < FRAMES; f++) {
    const r = 3 + f * 2.6
    const thick = f < 2 ? r : 2.5 // solid flash → expanding ring
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const d = Math.sqrt((x - 13) * (x - 13) + (y - 13) * (y - 13))
        if (d <= r && d >= r - thick) {
          p.px(f, x, y, d >= r - 1 ? 13 : d >= r - 2 ? 14 : 15)
        }
      }
    }
    // Sparks on later frames.
    if (f >= 2) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        p.px(f, Math.round(13 + Math.cos(a) * (r + 1)), Math.round(13 + Math.sin(a) * (r + 1)), 15)
      }
    }
  }
  const anim = (frames: number[], fps: number, loop: boolean) => ({
    se: { frames, fps, loop },
    ne: { frames, fps, loop },
  })
  return {
    id,
    frameW: FW,
    frameH: FH,
    cols: FRAMES,
    frameCount: FRAMES,
    indices: p.data,
    anchor: { x: 13, y: 18 },
    animations: {
      idle: anim([0], 1, true),
      walk: anim([0], 1, true),
      attack: anim([0, 1, 2, 3, 4], 16, false),
      hit: anim([0, 1, 2, 3, 4], 16, false),
    },
  }
}
