// Programmatic placeholder art, generated directly in the runtime indexed format with
// correct feet-center anchors. This is the committed, shippable default art path; the
// gitignored FFTA scaffold and later gen-AI/hand-drawn art replace it file-by-file with
// zero code changes. Slot usage follows the semantic contract (graphics-spec §5.1).

import type { AnimationSet, IndexedSprite, TileAnimCycle } from './types'

// ── Tiny pixel-painting helpers over a frame-major Uint8Array ────────────────

/** A 16×16 icon authored as ASCII rows in the docs/art-direction.md character key. */
export type IconSketch = readonly string[]

export class Painter {
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
// Frames (single row): se: idle 0-1 · walk 2-5 · attack 6-8 · hit 9-10 · death 11-12
//                      ne: same order at +13.

const H_FRAMES = 26
const H_PER_FACING = 13
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

// Death: a two-frame collapse — slump to a knee (t=0), then a low prone heap on the
// ground (t=1). Same semantic channels (skin 1-4, primary 5-8, secondary 9-12) so
// palettes still tint it. Reads as "downed" from the dimetric camera.
function drawHumanoidDeath(p: Painter, f: number, opts: { back: boolean; t: number }): void {
  const gy = 24
  if (opts.t === 0) {
    // Mid-collapse: torso pitched forward over a knee, head dropping.
    p.rect(f, 7, gy - 6, 11, 6, 6)      // torso heap
    p.rect(f, 7, gy - 6, 11, 2, 7)      // top light
    p.rect(f, 7, gy - 1, 11, 1, 5)      // under-shade
    p.rect(f, 15, gy - 9, 6, 5, 3)      // head lowered to the side (skin)
    p.rect(f, 16, gy - 8, 2, 1, opts.back ? 9 : 1) // hair/eye hint
    p.rect(f, 5, gy, 12, 2, 10)         // legs folding under
  } else {
    // Flat: a low horizontal body on the ground, head to the side, feet trailing.
    p.rect(f, 3, gy + 1, 16, 4, 6)      // prone body
    p.rect(f, 3, gy + 1, 16, 1, 7)      // top light
    p.rect(f, 3, gy + 4, 16, 1, 5)      // ground-contact shade
    p.rect(f, 18, gy, 5, 4, 3)          // head (skin) to the side
    p.rect(f, 1, gy + 2, 4, 2, 10)      // trailing feet
  }
}

function humanoidAnimations(): AnimationSet {
  // The gentle 2-frame bob (0,1) is the good-looking gait — it reads as a walk, so
  // it drives ALL movement (map traversal + combat approach). Idle is the same bob,
  // slower, so a standing unit still breathes. The old big-stride frames (2–5) read
  // as a flinchy jitter, so they're retired from walk; the dedicated recoil frames
  // (9,10) are the on-hit flinch the adapter triggers via 'hit'.
  const dir = (o: number) => ({
    idle: { frames: [o + 0, o + 1], fps: 2, loop: true },
    walk: { frames: [o + 0, o + 1], fps: 6, loop: true },
    attack: { frames: [o + 6, o + 7, o + 8], fps: 12, loop: false },
    hit: { frames: [o + 9, o + 10], fps: 10, loop: false },
    death: { frames: [o + 11, o + 12], fps: 6, loop: false },
  })
  const se = dir(0)
  const ne = dir(H_PER_FACING)
  return {
    idle: { se: se.idle, ne: ne.idle },
    walk: { se: se.walk, ne: ne.walk },
    attack: { se: se.attack, ne: ne.attack },
    hit: { se: se.hit, ne: ne.hit },
    death: { se: se.death, ne: ne.death },
  }
}

export function makeHumanoidRig(id = 'rig/humanoid'): IndexedSprite {
  const p = new Painter(HW, HH, H_FRAMES)
  for (const back of [false, true]) {
    const o = back ? H_PER_FACING : 0
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
    drawHumanoidDeath(p, o + 11, { back, t: 0 })
    drawHumanoidDeath(p, o + 12, { back, t: 1 })
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

const B_FRAMES = 26        // 13 per facing, matching humanoidAnimations' frame scheme
const B_PER_FACING = 13
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

// Beast death: collapse (t=0) then a low sprawled heap (t=1) on the ground.
function drawBeastDeath(p: Painter, f: number, opts: { t: number }): void {
  const gy = 15
  if (opts.t === 0) {
    p.rect(f, 5, gy - 4, 18, 6, 6)      // body sagging
    p.rect(f, 5, gy - 4, 18, 2, 7)      // top light
    p.rect(f, 5, gy + 1, 18, 1, 5)      // under-shade
    p.rect(f, 3, gy + 2, 5, 2, 10)      // legs buckling
  } else {
    p.rect(f, 2, gy + 2, 24, 4, 6)      // sprawled body
    p.rect(f, 2, gy + 2, 24, 1, 7)      // top light
    p.rect(f, 2, gy + 5, 24, 1, 5)      // ground shade
    p.rect(f, 22, gy + 1, 5, 3, 7)      // head to the side
    p.px(f, 25, gy + 2, 13)             // dimmed eye
  }
}

export function makeBeastRig(id = 'rig/beast'): IndexedSprite {
  const p = new Painter(BW, BH, B_FRAMES)
  for (const back of [false, true]) {
    const o = back ? B_PER_FACING : 0
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
    drawBeastDeath(p, o + 11, { t: 0 })
    drawBeastDeath(p, o + 12, { t: 1 })
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

const T_FRAMES = 14
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

/** Coarse-cell hash — quantizes (x,y) into `size`-px blocks so patterns read as
 *  patches/facets/ripples (low spatial frequency) instead of per-pixel noise. Lower
 *  frequency = calmer ground + a distinct material identity, not just a recolor. */
function cell(x: number, y: number, size: number, f: number): number {
  return speck(Math.floor(x / size), Math.floor(y / size), f)
}

export function makeTileset(id = 'tileset/base'): IndexedSprite {
  const p = new Painter(TW, TH, T_FRAMES)

  // Each ground material gets a DISTINCT surface pattern (not just a recolored ramp)
  // so biomes read as different terrain, not one meadow tileset tinted. Patterns are
  // low-frequency (coarse cells / bands / facets) — calmer than per-pixel speckle, so
  // units stay readable over them. y>=14 is the diamond's dark front edge (separation).

  // 0/1: grass — mid-green sward with sparse upright blade flecks (calm, not noisy).
  for (const f of [0, 1]) {
    fillDiamond(p, f, (x, y) => {
      if (y >= 14) return 5
      if (speck(x, y, f + 30) < 7) return 8        // blade highlight
      return cell(x, y, 3, f) < 42 ? 7 : 6         // soft clumping
    })
  }
  // 2/3: water — mid-blue body with light crest ripple lines that SCROLL down between
  // the two frames (the shift), plus sparse glints, so water reads as moving waves
  // rather than static noise. Water channel (9–12) is tinted per biome (lava, bog…).
  for (const f of [2, 3]) {
    const shift = f === 3 ? 2 : 0
    fillDiamond(p, f, (x, y) => {
      if (y >= 14) return 9                                       // dark front edge
      if (((y + shift + ((x >> 2) & 1)) % 3) === 0) return 12     // crest ripple line
      if (speck(x, y + shift * 3, 21) < 4) return 11             // glint
      return 10                                                   // body
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
  // 5: path/dirt — packed earth with a few embedded stones (accent flecks).
  fillDiamond(p, 5, (x, y) => {
    if (y >= 14) return 1
    if (speck(x, y, 55) < 6) return 13             // pebble
    return cell(x, y, 3, 5) < 45 ? 3 : 2
  })
  // 6: sand — desert dunes: horizontal ripple bands, lighter on the crests.
  fillDiamond(p, 6, (x, y) => {
    if (y >= 14) return 2
    const ripple = (y * 2 + ((x >> 2) & 1) + (cell(x, y, 4, 6) % 2)) % 6
    return ripple === 0 ? 4 : ripple < 3 ? 3 : 2   // crest→trough
  })
  // 7: rock — flagstone facets: coarse blocks with dark mortar seams.
  fillDiamond(p, 7, (x, y) => {
    if (y >= 14) return 13
    if (x % 4 === 0 || y % 4 === 0) return 13       // seam
    const c = cell(x, y, 4, 7)
    return c < 33 ? 15 : c < 66 ? 14 : 13
  })
  // 8: snow — smooth pale drift shading with rare sparkle.
  fillDiamond(p, 8, (x, y) => {
    if (y >= 14) return 13
    if (speck(x, y, 88) < 4) return 15              // sparkle
    return cell(x, y, 4, 8) < 55 ? 14 : 13          // soft drifts
  })
  // 9: moss — mottled vegetation clumps with occasional bright fronds.
  fillDiamond(p, 9, (x, y) => {
    if (y >= 14) return 5
    if (speck(x, y, 91) < 5) return 7               // frond fleck
    const c = cell(x, y, 3, 9)
    return c < 38 ? 5 : c < 72 ? 6 : 5
  })
  // 10: flower — grass sward broken by distinct bloom clusters (accent blooms).
  fillDiamond(p, 10, (x, y) => {
    if (y >= 14) return 5
    const bloom = cell(x, y, 4, 73)
    if (bloom < 9) return 15                        // bloom head
    if (bloom < 13) return 12
    return speck(x, y, 30) < 7 ? 8 : 6
  })
  // 11: path alt — worn/trampled darker dirt with ruts (banding).
  fillDiamond(p, 11, (x, y) => {
    if (y >= 14) return 1
    return ((y + (cell(x, y, 3, 11) % 2)) % 4) === 0 ? 1 : cell(x, y, 3, 11) < 50 ? 2 : 3
  })
  // 12: ember — cracked charcoal ground veined with glowing fissures (ashfire/cinder).
  // Charcoal on the earth-dark slots (1–2, near-black in fire biomes); fissures on the
  // WATER channel (10–12) — fire biomes put lava/ember colours there, so the cracks
  // read as molten while the surface stays charred.
  fillDiamond(p, 12, (x, y) => {
    if (y >= 14) return 1
    const crack = (speck(x >> 1, y, 12) % 7 === 0) || (x % 5 === 0 && speck(x, y >> 1, 12) % 3 === 0)
    if (crack) { const g = speck(x, y, 12); return g < 33 ? 10 : g < 66 ? 11 : 12 }  // molten glow
    return cell(x, y, 3, 12) < 55 ? 1 : 2             // charcoal
  })
  // 13: bog — murky swamp muck on the water channel (dark green/black in swamp biomes)
  // with rising bubble highlights.
  fillDiamond(p, 13, (x, y) => {
    if (y >= 14) return 9
    if (speck(x, y, 131) < 4) return 12               // bubble glint (water-light)
    return cell(x, y, 4, 13) < 50 ? 9 : 10
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
  EMBER: 12, BOG: 13,
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
  // node markers (0–6, kept)
  TREE: 0, ROCK_BIG: 1, CRYSTAL_CLUSTER: 2, LAIR: 3, HERB_BUSH: 4, ORE_OUTCROP: 5, CAIRN: 6,
  // scenery (7+) — scattered per biome for a populated, FFTA-diorama world
  PINE: 7, BOULDER: 8, SPIRE: 9, MOUND: 10, BUSH: 11, FLOWERBED: 12,
  PILLAR: 13, DEADTREE: 14, STUMP: 15, REEDS: 16,
  // structures (17+) — sparse landmarks (a few per zone)
  HUT: 17, TOWER: 18, ARCH: 19,
} as const

const TP_W = 32
const TP_H = 48
const TP_N = 20

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

  // ── Scenery (7+): scattered per biome. Foliage on veg slots (5–8), wood on earth
  // (1–2), stone on 13–15, mounds on earth (2–4) — so the biome palette tints each to
  // its zone (forest pine vs. venom pine, sand mound vs. ash mound, etc.). ──────────

  // 7 PINE — layered conifer.
  p.rect(TALL_PROP.PINE, 15, 34, 2, 8, 2)
  p.rect(TALL_PROP.PINE, 9, 30, 14, 4, 5)
  p.rect(TALL_PROP.PINE, 11, 24, 10, 5, 6)
  p.rect(TALL_PROP.PINE, 13, 18, 6, 5, 6)
  p.rect(TALL_PROP.PINE, 14, 13, 4, 5, 7)
  p.px(TALL_PROP.PINE, 15, 12, 8); p.px(TALL_PROP.PINE, 12, 27, 7); p.px(TALL_PROP.PINE, 19, 31, 7)
  // 8 BOULDER — rounded multi-facet rock.
  p.rect(TALL_PROP.BOULDER, 9, 30, 14, 10, 14)
  p.rect(TALL_PROP.BOULDER, 11, 26, 10, 5, 15)
  p.rect(TALL_PROP.BOULDER, 8, 37, 16, 3, 13)
  p.px(TALL_PROP.BOULDER, 13, 29, 15); p.px(TALL_PROP.BOULDER, 19, 31, 13); p.px(TALL_PROP.BOULDER, 16, 34, 13)
  // 9 SPIRE — tall jagged rock spike.
  p.rect(TALL_PROP.SPIRE, 13, 34, 6, 8, 13)
  p.rect(TALL_PROP.SPIRE, 14, 22, 4, 12, 14)
  p.rect(TALL_PROP.SPIRE, 15, 13, 2, 9, 15)
  p.px(TALL_PROP.SPIRE, 14, 18, 15); p.px(TALL_PROP.SPIRE, 17, 27, 13)
  // 10 MOUND — low rounded earth/sand/ash pile (earth slots → matches ground).
  p.rect(TALL_PROP.MOUND, 8, 36, 16, 5, 3)
  p.rect(TALL_PROP.MOUND, 11, 33, 10, 4, 4)
  p.rect(TALL_PROP.MOUND, 7, 40, 18, 2, 2)
  p.px(TALL_PROP.MOUND, 13, 34, 4); p.px(TALL_PROP.MOUND, 18, 35, 2)
  // 11 BUSH — dense round shrub.
  p.rect(TALL_PROP.BUSH, 10, 32, 12, 9, 5)
  p.rect(TALL_PROP.BUSH, 12, 29, 8, 4, 6)
  p.px(TALL_PROP.BUSH, 13, 31, 7); p.px(TALL_PROP.BUSH, 18, 33, 7); p.px(TALL_PROP.BUSH, 15, 30, 7)
  // 12 FLOWERBED — leafy clump studded with blooms (accents 8/12/15).
  p.rect(TALL_PROP.FLOWERBED, 9, 36, 14, 5, 6)
  p.rect(TALL_PROP.FLOWERBED, 10, 38, 12, 3, 5)
  p.px(TALL_PROP.FLOWERBED, 11, 35, 15); p.px(TALL_PROP.FLOWERBED, 14, 34, 8); p.px(TALL_PROP.FLOWERBED, 17, 35, 12)
  p.px(TALL_PROP.FLOWERBED, 20, 36, 15); p.px(TALL_PROP.FLOWERBED, 12, 37, 8); p.px(TALL_PROP.FLOWERBED, 18, 38, 15)
  // 13 PILLAR — broken stone column (ruin).
  p.rect(TALL_PROP.PILLAR, 12, 20, 8, 20, 14)
  p.rect(TALL_PROP.PILLAR, 12, 20, 3, 20, 15)   // lit edge
  p.rect(TALL_PROP.PILLAR, 11, 38, 10, 4, 13)   // base block
  p.rect(TALL_PROP.PILLAR, 12, 20, 8, 2, 15)    // broken cap
  p.px(TALL_PROP.PILLAR, 18, 25, 13); p.px(TALL_PROP.PILLAR, 17, 31, 13)
  // 14 DEADTREE — bare branching trunk.
  p.rect(TALL_PROP.DEADTREE, 15, 18, 2, 24, 2)
  p.rect(TALL_PROP.DEADTREE, 15, 18, 1, 24, 1)  // shade edge
  p.rect(TALL_PROP.DEADTREE, 10, 22, 5, 2, 2); p.px(TALL_PROP.DEADTREE, 9, 20, 1)
  p.rect(TALL_PROP.DEADTREE, 17, 27, 5, 2, 2); p.px(TALL_PROP.DEADTREE, 22, 25, 1)
  // 15 STUMP — cut log with rings.
  p.rect(TALL_PROP.STUMP, 12, 34, 8, 7, 2)
  p.rect(TALL_PROP.STUMP, 12, 33, 8, 2, 3)
  p.px(TALL_PROP.STUMP, 15, 33, 4); p.px(TALL_PROP.STUMP, 16, 33, 4)
  // 16 REEDS — tall water-edge reeds.
  p.rect(TALL_PROP.REEDS, 12, 28, 1, 14, 6); p.px(TALL_PROP.REEDS, 12, 27, 8)
  p.rect(TALL_PROP.REEDS, 15, 24, 1, 18, 7); p.px(TALL_PROP.REEDS, 15, 23, 8)
  p.rect(TALL_PROP.REEDS, 18, 30, 1, 12, 6); p.px(TALL_PROP.REEDS, 18, 29, 8)
  p.rect(TALL_PROP.REEDS, 20, 26, 1, 16, 7); p.px(TALL_PROP.REEDS, 20, 25, 8)

  // ── Structures (17–19): sparse landmarks. Stone walls (13–15), wood roof/door
  // (1–4), lit accents (15) — read on both prop palettes as hut / tower / ruin. ──

  // 17 HUT — walls + pitched roof + door.
  p.rect(TALL_PROP.HUT, 8, 30, 16, 12, 13)   // walls
  p.rect(TALL_PROP.HUT, 8, 30, 3, 12, 14)    // lit wall edge
  p.rect(TALL_PROP.HUT, 6, 26, 20, 4, 3)     // eaves
  p.rect(TALL_PROP.HUT, 9, 22, 14, 4, 4)     // roof mid
  p.rect(TALL_PROP.HUT, 12, 19, 8, 3, 4)     // roof ridge
  p.rect(TALL_PROP.HUT, 14, 34, 4, 8, 1)     // door
  p.px(TALL_PROP.HUT, 11, 33, 15); p.px(TALL_PROP.HUT, 20, 33, 15) // windows
  // 18 TOWER — watchtower with crenellations.
  p.rect(TALL_PROP.TOWER, 12, 15, 8, 27, 13)
  p.rect(TALL_PROP.TOWER, 12, 15, 3, 27, 14) // lit
  p.rect(TALL_PROP.TOWER, 10, 12, 12, 4, 13) // parapet
  p.px(TALL_PROP.TOWER, 11, 11, 14); p.px(TALL_PROP.TOWER, 14, 11, 14)
  p.px(TALL_PROP.TOWER, 17, 11, 14); p.px(TALL_PROP.TOWER, 20, 11, 14)
  p.rect(TALL_PROP.TOWER, 14, 34, 4, 8, 1)   // door
  p.px(TALL_PROP.TOWER, 15, 22, 15); p.px(TALL_PROP.TOWER, 16, 27, 15) // windows
  // 19 ARCH — ruined stone archway.
  p.rect(TALL_PROP.ARCH, 7, 20, 4, 22, 13)   // left pillar
  p.rect(TALL_PROP.ARCH, 21, 20, 4, 22, 13)  // right pillar
  p.rect(TALL_PROP.ARCH, 7, 16, 18, 4, 14)   // span
  p.rect(TALL_PROP.ARCH, 7, 20, 1, 22, 15)   // lit edge
  p.px(TALL_PROP.ARCH, 22, 26, 13); p.px(TALL_PROP.ARCH, 9, 32, 13) // cracks

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
    [TALL_PROP.PINE]: slice(TALL_PROP.PINE, 'props/tall/pine'),
    [TALL_PROP.BOULDER]: slice(TALL_PROP.BOULDER, 'props/tall/boulder'),
    [TALL_PROP.SPIRE]: slice(TALL_PROP.SPIRE, 'props/tall/spire'),
    [TALL_PROP.MOUND]: slice(TALL_PROP.MOUND, 'props/tall/mound'),
    [TALL_PROP.BUSH]: slice(TALL_PROP.BUSH, 'props/tall/bush'),
    [TALL_PROP.FLOWERBED]: slice(TALL_PROP.FLOWERBED, 'props/tall/flowerbed'),
    [TALL_PROP.PILLAR]: slice(TALL_PROP.PILLAR, 'props/tall/pillar'),
    [TALL_PROP.DEADTREE]: slice(TALL_PROP.DEADTREE, 'props/tall/deadtree'),
    [TALL_PROP.STUMP]: slice(TALL_PROP.STUMP, 'props/tall/stump'),
    [TALL_PROP.REEDS]: slice(TALL_PROP.REEDS, 'props/tall/reeds'),
    [TALL_PROP.HUT]: slice(TALL_PROP.HUT, 'props/tall/hut'),
    [TALL_PROP.TOWER]: slice(TALL_PROP.TOWER, 'props/tall/tower'),
    [TALL_PROP.ARCH]: slice(TALL_PROP.ARCH, 'props/tall/arch'),
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

// ── UI icon sheet (Phase 4): 16×16 indexed icons, one row, palette 'icon/base' ──
// Replaces emoji in the DOM UI (abilities, nav) with pixel icons that match the world.
// Verified visually before authoring; drawn on the same semantic slots so future real
// icon art drops in through the same import path. `SpriteIcon` renders these; unmapped
// emoji fall back to the glyph, so adoption is incremental.

/** Semantic icon key → frame index in the sheet. */
export const ICON = {
  sword: 0, shield: 1, dagger: 2, blood: 3, frost: 4, flame: 5, hourglass: 6, moon: 7,
  gust: 8, skull: 9, heart: 10, house: 11, pick: 12, hammer: 13, herb: 14, star: 15,
} as const
export type IconKey = keyof typeof ICON

/** Emoji used in game data → icon key, so existing emoji-labelled content resolves to
 *  a sprite without touching the data. Unmapped emoji render as their glyph. */
export const EMOJI_ICON: Record<string, IconKey> = {
  '⚔': 'sword', '🛡': 'shield', '🗡': 'dagger', '🩸': 'blood', '❄': 'frost', '🔥': 'flame',
  '⏳': 'hourglass', '🌑': 'moon', '💨': 'gust', '☠': 'skull', '💀': 'skull', '💚': 'heart',
  '❤': 'heart', '♥': 'heart', '🏠': 'house', '⛏': 'pick', '🔨': 'hammer', '🌿': 'herb',
  '🍃': 'herb', '✦': 'star', '✧': 'star', '★': 'star', '✨': 'star', '🎴': 'star',
}

const IN = 16
export function makeIconSheet(id = 'icons/base'): IndexedSprite {
  const P = new Painter(IN, IN, 16)
  const px = (f: number, x: number, y: number, s: number) => P.px(f, x, y, s)
  const r  = (f: number, x: number, y: number, w: number, h: number, s: number) => P.rect(f, x, y, w, h, s)

  // 0 sword — steel blade, gold crossguard, wood grip
  r(0,7,2,2,9,3); px(0,7,1,4); px(0,8,1,4); r(0,7,2,1,8,4); r(0,4,11,9,2,14); r(0,7,13,2,3,6)
  // 1 shield — gold body, steel field, center boss
  r(1,4,2,8,7,14); r(1,5,3,6,6,2); r(1,5,3,6,2,3); for(let i=0;i<3;i++) r(1,5+i,9+i,6-2*i,1,2); px(1,7,6,4); px(1,8,6,4)
  // 2 dagger — steel blade diagonal, gold guard, grip
  for(let i=0;i<7;i++){ px(2,6+i,10-i,3); px(2,7+i,10-i,4) } r(2,4,10,3,2,14); r(2,3,12,3,2,6)
  // 3 blood — red teardrop
  px(3,8,3,5); px(3,8,4,5); r(3,7,5,2,1,5); r(3,7,6,3,1,5); r(3,6,7,4,2,5); r(3,6,9,4,2,6); r(3,7,11,2,1,5); px(3,7,8,7); px(3,7,9,7)
  // 4 frost — cyan snowflake asterisk
  r(4,7,2,2,12,11); r(4,2,7,12,2,11); for(let i=0;i<5;i++){ px(4,3+i,3+i,10); px(4,12-i,3+i,10); px(4,3+i,12-i,10); px(4,12-i,12-i,10) } px(4,8,8,12)
  // 5 flame — red base, orange body, gold core, tip
  px(5,8,2,7); px(5,8,3,6); r(5,7,4,2,2,6); r(5,6,6,4,2,5); r(5,5,8,6,3,5); r(5,6,11,4,2,5); px(5,5,10,5); px(5,10,10,5); r(5,7,7,2,4,8); px(5,8,6,8); px(5,7,11,7); px(5,9,11,7)
  // 6 hourglass — gold frame, steel sand
  r(6,4,3,8,1,14); r(6,4,12,8,1,14); for(let i=0;i<4;i++){ px(6,5+i,4+i,14); px(6,10-i,4+i,14); px(6,5+i,11-i,14); px(6,10-i,11-i,14) } r(6,6,6,4,4,3)
  // 7 moon — purple crescent
  for(let y=2;y<14;y++){ const d=Math.round(Math.sqrt(36-(y-8)*(y-8))); for(let x=8-d;x<=8+d;x++) px(7,x,y,15) }
  for(let y=2;y<14;y++){ const d=Math.round(Math.sqrt(36-(y-8)*(y-8))); for(let x=11-d;x<=11+d;x++) px(7,x,y,0) }
  // 8 gust — three cyan strokes
  r(8,3,4,9,2,11); px(8,12,5,11); px(8,12,6,10); r(8,4,8,8,2,11); px(8,3,9,10); r(8,5,12,7,2,11); px(8,12,13,11)
  // 9 skull — white dome, dark eyes, teeth
  r(9,4,3,8,7,4); r(9,4,3,8,2,3); px(9,6,6,1); px(9,7,6,1); px(9,9,6,1); px(9,10,6,1); px(9,8,8,1); r(9,5,10,6,2,4); px(9,6,11,1); px(9,8,11,1); px(9,10,11,1)
  // 10 heart — green (heal)
  r(10,4,4,3,2,13); r(10,9,4,3,2,13); r(10,3,6,10,3,13); r(10,4,9,8,2,13); r(10,6,11,4,1,13); px(10,8,13,13); r(10,4,5,3,1,3)
  // 11 house — warm roof, steel walls, door
  for(let i=0;i<7;i++) r(11,8-1-i,3+i,2+2*i,1,6); r(11,4,10,8,4,3); r(11,4,10,8,1,2); r(11,7,11,3,3,5)
  // 12 pick — gold head arc, wood handle
  r(12,3,4,10,2,14); px(12,2,5,14); px(12,13,5,14); px(12,3,3,14); px(12,12,3,14); r(12,7,6,2,8,6)
  // 13 hammer — steel head, wood handle
  r(13,4,3,8,4,3); r(13,4,3,8,1,4); r(13,4,3,2,4,2); r(13,7,7,2,7,6)
  // 14 herb — green sprig
  r(14,7,6,2,8,13); for(let i=0;i<3;i++){ px(14,6-i,7+i,13); px(14,9+i,7+i,13) } px(14,8,4,13); px(14,7,5,13); px(14,9,5,13); px(14,6,10,13); px(14,10,10,13)
  // 15 star — gold sparkle
  r(15,7,2,2,12,14); r(15,2,7,12,2,14); for(let i=0;i<4;i++){ px(15,5+i,5+i,14); px(15,11-i,5+i,14); px(15,5+i,10-i,14); px(15,11-i,10-i,14) } px(15,8,8,4)

  const st = { frames: [0], fps: 1, loop: true }
  return {
    id, frameW: IN, frameH: IN, cols: 16, frameCount: 16,
    indices: P.data, anchor: { x: 8, y: 8 },
    animations: { idle: { se: st, ne: st }, walk: { se: st, ne: st }, attack: { se: st, ne: st }, hit: { se: st, ne: st } },
  }
}
