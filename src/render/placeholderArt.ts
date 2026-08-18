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
    // Slow-mo combat VFX, split by tempo (see MELEE_SCALE / FX_TIME_SCALE in
    // combatAdapter.ts): the swing + recoil run at MELEE_SCALE (÷2, snappy) while death
    // runs at FX_TIME_SCALE (÷4, a slow dramatic collapse). idle/walk stay fast so
    // traversal & breathing don't feel sluggish.
    attack: { frames: [o + 6, o + 7, o + 8], fps: 6, loop: false },
    hit: { frames: [o + 9, o + 10], fps: 5, loop: false },
    death: { frames: [o + 11, o + 12], fps: 1.5, loop: false },
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

const T_FRAMES = 18   // 0-13 wilderness, 14-17 town paving (see TILE below)
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

  // ── Town paving (14-17) ────────────────────────────────────────────────────
  // The town is the one place the ground is BUILT rather than grown, so it gets real
  // masonry patterns instead of a recoloured meadow. Stone sits on 13-15 and the mortar
  // on the earth ramp (1-4), so a town palette tints joint and sett independently — that
  // is what lets one plaza read as Concord granite or Ashmarch basalt.

  // 14/15: cobble — 4x4 setts in a running bond, the two frames offset by half a sett so
  // a chequerboard of them reads as continuous coursing rather than a repeating stamp.
  for (const f of [14, 15]) {
    const off = f === 15 ? 2 : 0
    fillDiamond(p, f, (x, y) => {
      if (y >= 14) return 13                              // dark front edge
      const bond = ((y >> 2) & 1) ? 2 : 0                 // alternate courses stagger
      if (y % 4 === 0) return 2                           // mortar course
      if (((x + off + bond) & 3) === 0) return 2          // mortar joint
      const v = speck(x, y, f + 60)
      return v < 10 ? 15 : v < 26 ? 13 : 14               // worn / lit / mid sett
    })
  }
  // 16: flagstone — larger irregular slabs, fewer joints. The dressed stone of a civic
  // square, next to the rougher cobble of the approach roads.
  fillDiamond(p, 16, (x, y) => {
    if (y >= 14) return 13
    const c = cell(x, y, 6, 16)
    if (c < 8) return 2                                   // joint between slabs
    return c < 40 ? 15 : c < 72 ? 14 : 13                 // slab value variation
  })
  // 17: timber decking — boards on the wood ramp so they stay warm against the stone.
  fillDiamond(p, 17, (x, y) => {
    if (y >= 14) return 1
    if (y % 3 === 0) return 1                             // board gap (shadow)
    const board = (y / 3) | 0
    return speck(x, y, 17 + board) < 5 ? 2                // knot
      : ((x + board * 3) & 7) < 4 ? 3 : 4                 // plank value alternation
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
  // Town paving — built ground, only used by the town scene.
  COBBLE: 14, COBBLE_ALT: 15, FLAGSTONE: 16, TIMBER: 17,
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
  // town furniture (20+) — HUMAN-SCALE objects only. The four premises are far bigger
  // than a person and live on their own 64x80 sheet (makeTownBuildings) — authored here
  // at 32x48 they came out barely taller than the hero standing in front of them, which
  // read as a doll's house rather than an inn.
  WELL: 20, BANNER: 21, LAMPPOST: 22, CRATES: 23, BARREL: 24, CART: 25,
} as const

const TP_W = 32
const TP_H = 48
const TP_N = 26

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


  // ── Town structures (20-29) ──────────────────────────────────────────────────
  // Slot discipline matters more here than anywhere: walls on stone (13-15), timber and
  // thatch on the earth/wood ramp (1-4), cloth — awnings, banners — on the secondary
  // ramp (9-12), and lit windows/flame on 8. That split is what makes the faction town
  // palettes work: swapping 9-12 alone reflags every awning and banner in the square
  // without touching a single wall.
  //
  // All are 32x48 on the (16,40) feet anchor, so they depth-sort against units like any
  // other tall prop and a hero can walk behind them.

  // 24 WELL — the square's centre. Stone ring, roof on posts, bucket on a rope.
  p.rect(TALL_PROP.WELL, 10, 32, 12, 8, 13)     // ring
  p.rect(TALL_PROP.WELL, 10, 32, 3, 8, 14)      // lit side
  p.rect(TALL_PROP.WELL, 10, 30, 12, 3, 15)     // coping
  p.rect(TALL_PROP.WELL, 13, 33, 6, 3, 1)       // dark water mouth
  p.rect(TALL_PROP.WELL, 11, 18, 2, 13, 2)      // posts
  p.rect(TALL_PROP.WELL, 19, 18, 2, 13, 2)
  p.rect(TALL_PROP.WELL, 8, 14, 16, 4, 3)       // roof
  p.rect(TALL_PROP.WELL, 11, 11, 10, 3, 4)      // roof ridge
  p.rect(TALL_PROP.WELL, 13, 19, 6, 1, 2)       // winch beam
  p.rect(TALL_PROP.WELL, 15, 20, 1, 6, 15)      // rope
  p.rect(TALL_PROP.WELL, 14, 26, 4, 3, 2)       // bucket
  p.rect(TALL_PROP.WELL, 14, 26, 4, 1, 3)

  // 25 BANNER — tall pole with a hanging faction banner. The banner is pure cloth ramp
  // (9-12) with a 13-15 device, so a faction palette swap changes allegiance outright.
  p.rect(TALL_PROP.BANNER, 15, 6, 2, 36, 2)     // pole
  p.rect(TALL_PROP.BANNER, 15, 6, 1, 36, 3)     // pole lit edge
  p.rect(TALL_PROP.BANNER, 13, 4, 6, 2, 15)     // finial
  p.rect(TALL_PROP.BANNER, 17, 8, 10, 20, 10)   // banner field
  p.rect(TALL_PROP.BANNER, 17, 8, 10, 2, 11)    // top band
  p.rect(TALL_PROP.BANNER, 17, 8, 2, 20, 11)    // lit fold
  p.rect(TALL_PROP.BANNER, 25, 8, 2, 20, 9)     // shade fold
  // Device on the cloth ramp, NOT the accent: 13-15 is stone, and a faction colour there
  // repaints the masonry (see the note in palettes.ts).
  p.rect(TALL_PROP.BANNER, 20, 14, 4, 4, 12)    // device
  p.px(TALL_PROP.BANNER, 21, 15, 12); p.px(TALL_PROP.BANNER, 22, 16, 12)
  // ragged lower hem — a war-tired banner, not a parade one
  p.rect(TALL_PROP.BANNER, 17, 28, 2, 2, 10); p.rect(TALL_PROP.BANNER, 21, 28, 2, 3, 10)
  p.rect(TALL_PROP.BANNER, 25, 28, 2, 2, 10)

  // 26 LAMPPOST — the square is lit; this is what sells "evening in town".
  p.rect(TALL_PROP.LAMPPOST, 15, 20, 2, 22, 15)  // post
  p.rect(TALL_PROP.LAMPPOST, 15, 20, 1, 22, 14)  // lit edge
  p.rect(TALL_PROP.LAMPPOST, 13, 40, 6, 2, 13)   // base
  p.rect(TALL_PROP.LAMPPOST, 12, 14, 8, 6, 15)   // lantern housing
  p.rect(TALL_PROP.LAMPPOST, 13, 15, 6, 4, 8)    // flame
  p.px(TALL_PROP.LAMPPOST, 15, 16, 8); p.px(TALL_PROP.LAMPPOST, 16, 17, 8)
  p.rect(TALL_PROP.LAMPPOST, 11, 12, 10, 2, 13)  // cap

  // 27 CRATES — stacked cargo. Reads as trade without needing a shopfront.
  p.rect(TALL_PROP.CRATES, 8, 30, 11, 11, 2)
  p.rect(TALL_PROP.CRATES, 8, 30, 11, 2, 3)      // lid
  p.rect(TALL_PROP.CRATES, 8, 35, 11, 1, 1)      // band
  p.rect(TALL_PROP.CRATES, 18, 34, 8, 8, 3)      // second crate
  p.rect(TALL_PROP.CRATES, 18, 34, 8, 2, 4)
  p.rect(TALL_PROP.CRATES, 11, 22, 7, 8, 2)      // top crate
  p.rect(TALL_PROP.CRATES, 11, 22, 7, 2, 3)

  // 28 BARREL — banded cask.
  p.rect(TALL_PROP.BARREL, 12, 28, 9, 13, 2)
  p.rect(TALL_PROP.BARREL, 12, 28, 3, 13, 3)     // lit stave
  p.rect(TALL_PROP.BARREL, 12, 28, 9, 2, 4)      // top rim
  p.rect(TALL_PROP.BARREL, 11, 31, 11, 1, 15)    // iron hoops
  p.rect(TALL_PROP.BARREL, 11, 37, 11, 1, 15)

  // 29 CART — two-wheeled handcart, shafts down.
  p.rect(TALL_PROP.CART, 6, 30, 20, 7, 2)        // bed
  p.rect(TALL_PROP.CART, 6, 30, 20, 2, 3)        // bed top
  p.rect(TALL_PROP.CART, 6, 28, 3, 9, 3)         // headboard
  p.rect(TALL_PROP.CART, 24, 36, 6, 1, 2)        // shaft
  p.rect(TALL_PROP.CART, 9, 36, 8, 8, 1)         // wheel
  p.rect(TALL_PROP.CART, 11, 38, 4, 4, 15)       // hub
  p.px(TALL_PROP.CART, 12, 37, 15); p.px(TALL_PROP.CART, 14, 41, 15)
  p.rect(TALL_PROP.CART, 10, 26, 5, 4, 5)        // sacked load
  p.rect(TALL_PROP.CART, 16, 27, 5, 3, 12)

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
    [TALL_PROP.WELL]: slice(TALL_PROP.WELL, 'props/tall/well'),
    [TALL_PROP.BANNER]: slice(TALL_PROP.BANNER, 'props/tall/banner'),
    [TALL_PROP.LAMPPOST]: slice(TALL_PROP.LAMPPOST, 'props/tall/lamppost'),
    [TALL_PROP.CRATES]: slice(TALL_PROP.CRATES, 'props/tall/crates'),
    [TALL_PROP.BARREL]: slice(TALL_PROP.BARREL, 'props/tall/barrel'),
    [TALL_PROP.CART]: slice(TALL_PROP.CART, 'props/tall/cart'),
  }
}

// ── Landmarks ────────────────────────────────────────────────────────────────
// The four structures that are supposed to DOMINATE a biome: the watchtower, the
// homestead, the ruined gate, and the boss's lair.
//
// They were authored on the 32×48 tall-prop sheet with everything else, and at that size a
// tower is 40px of art against a 30px hero — a watchtower shorter than the man watching
// from it, a hut you could step over. The same mistake `makeTownBuildings` already fixed
// once for the town square (see the note there), and the same fix: a bigger canvas.
//
// 64×96 on a (32, 88) feet anchor, against 24×32 / (12, 30) for a hero. So a landmark
// stands ~3× the height of a figure, which is roughly where a silhouette stops reading as
// an object and starts reading as architecture. Nothing else changes: the scene culls and
// shadows off `frameW`/`frameH` (see scene.ts step 2), so a taller sprite depth-sorts and
// occludes exactly like the small ones did — a hero still walks behind a tower.
//
// Ids are the SCENERY_KIND / TALL_PROP ids they replace, deliberately: every save on disk
// already carries `scenery: [{kind: 17}, …]`, so re-authoring at a new size must not
// renumber anything. The adapter prefers this sheet and falls back to the small one.
//
// Slot discipline, against both prop palettes (see palettes.ts):
//   13–15 stone — masonry. Verdant reads cold grey; barren reads charred.
//   1–4  wood/earth — timber, thatch, doors, barrow soil.
//   5–8  foliage — the ivy and moss that make a ruin look old. Dry scrub when barren.
//   12   the LIT channel, and the reason these are worth palette-indexing: it is pale
//        blue in a verdant biome and ember-orange in a barren one, so the same window is
//        lamplight in a meadow and furnace-glow in the wastes, from one sprite.

// The last three are CANOPY trees, and they are here rather than on the small sheet for a
// reason that is about scale rather than about landmarks: with only the 32×48 trees, every
// living thing in a biome was the same height as every other, and a world where the tallest
// tree and the shortest shrub agree to within a few pixels has no depth — nothing to walk
// behind, nothing to give the hero a size. A few giants among the small ones is what makes
// the rest read as small. They are scattered sparsely by mapGen (see BIOME_CANOPY), not
// swapped in for the ordinary trees.
export const LANDMARK = {
  LAIR: 3, HUT: 17, TOWER: 18, ARCH: 19,
  GREAT_TREE: 26, GREAT_PINE: 27, GREAT_DEADTREE: 28,
} as const

const LM_W = 64
const LM_H = 96
/** Frame slots are indexed by art id, so the array has to reach the highest one (28). */
const LM_N = 29

export function makeLandmarks(): Record<number, IndexedSprite> {
  const p = new Painter(LM_W, LM_H, LM_N)
  const L = LANDMARK

  // ── 18 TOWER — a keep tower: battered plinth, tapering shaft, machicolated parapet,
  // crenellations and a lit beacon. The tallest thing in any biome, and the one that has
  // to read from across the screen, so its silhouette does the work: wide base, narrow
  // shaft, wider crown.
  p.rect(L.TOWER, 10, 78, 44, 10, 13)          // battered plinth
  p.rect(L.TOWER, 10, 78, 8, 10, 14)           // lit face of the plinth
  p.rect(L.TOWER, 8, 85, 48, 3, 13)            // ground course
  p.rect(L.TOWER, 16, 26, 32, 52, 14)          // shaft
  p.rect(L.TOWER, 16, 26, 7, 52, 15)           // lit west face
  p.rect(L.TOWER, 44, 26, 4, 52, 13)           // shade east face
  p.rect(L.TOWER, 14, 46, 36, 3, 15)           // string course
  p.rect(L.TOWER, 14, 47, 36, 1, 13)
  p.rect(L.TOWER, 29, 34, 3, 7, 1)             // arrow slits
  p.rect(L.TOWER, 29, 58, 3, 7, 1)
  p.px(L.TOWER, 30, 35, 12); p.px(L.TOWER, 30, 59, 12)   // torchlight behind them
  p.rect(L.TOWER, 12, 22, 40, 5, 15)           // corbels / machicolation
  for (let i = 0; i < 6; i++) p.rect(L.TOWER, 14 + i * 7, 27, 3, 2, 1)  // murder holes
  p.rect(L.TOWER, 14, 14, 36, 8, 14)           // parapet wall
  p.rect(L.TOWER, 14, 14, 5, 8, 15)
  for (let i = 0; i < 4; i++) {                // merlons
    p.rect(L.TOWER, 15 + i * 9, 8, 6, 7, 15)
    p.rect(L.TOWER, 15 + i * 9, 8, 2, 7, 14)
  }
  p.rect(L.TOWER, 27, 3, 10, 5, 13)            // beacon brazier
  p.rect(L.TOWER, 28, 0, 8, 3, 12)             // and its flame — the lit channel
  p.px(L.TOWER, 31, 1, 12); p.px(L.TOWER, 33, 1, 12)
  p.rect(L.TOWER, 27, 72, 10, 16, 1)           // door
  p.rect(L.TOWER, 26, 69, 12, 3, 2)            // lintel
  p.px(L.TOWER, 18, 60, 6); p.px(L.TOWER, 19, 64, 6)     // moss creeping up the base
  p.px(L.TOWER, 17, 70, 6); p.px(L.TOWER, 21, 74, 6)
  p.px(L.TOWER, 45, 52, 13); p.px(L.TOWER, 44, 56, 13)   // cracks

  // ── 17 HUT — a longhouse, not a shed: stone ground floor, timber-framed gable under a
  // deep thatch roof, chimney, three lit windows. The one landmark that reads as
  // inhabited, which is what makes a meadow feel settled rather than empty.
  p.rect(L.HUT, 8, 62, 48, 26, 14)             // stone walls
  p.rect(L.HUT, 8, 62, 7, 26, 15)              // lit face
  p.rect(L.HUT, 49, 62, 7, 26, 13)             // shade face
  p.rect(L.HUT, 6, 84, 52, 4, 13)              // plinth
  p.rect(L.HUT, 6, 84, 52, 1, 15)
  p.rect(L.HUT, 12, 44, 40, 18, 3)             // timber-framed gable
  for (let i = 0; i < 5; i++) p.rect(L.HUT, 14 + i * 9, 44, 2, 18, 1)
  p.rect(L.HUT, 12, 44, 40, 2, 4)
  p.rect(L.HUT, 4, 38, 56, 7, 2)               // eaves — the overhang sells the roof
  p.rect(L.HUT, 4, 38, 56, 2, 3)
  p.rect(L.HUT, 8, 24, 48, 14, 4)              // thatch, lower course
  p.rect(L.HUT, 8, 30, 48, 1, 3)
  p.rect(L.HUT, 17, 16, 30, 9, 3)              // thatch, upper course
  p.rect(L.HUT, 25, 11, 14, 6, 4)              // ridge
  p.rect(L.HUT, 43, 8, 9, 17, 13)              // chimney
  p.rect(L.HUT, 43, 8, 3, 17, 14)
  p.rect(L.HUT, 41, 5, 13, 4, 15)              // chimney cap
  p.rect(L.HUT, 27, 70, 11, 18, 1)             // door
  p.rect(L.HUT, 27, 70, 3, 18, 2)
  p.rect(L.HUT, 25, 67, 15, 3, 2)              // door lintel
  p.rect(L.HUT, 14, 68, 9, 8, 12)              // lit windows, ground floor
  p.rect(L.HUT, 41, 68, 9, 8, 12)
  p.rect(L.HUT, 28, 50, 9, 7, 12)              // lit window, gable
  p.px(L.HUT, 10, 78, 6); p.px(L.HUT, 12, 82, 6)         // moss at the footings
  p.px(L.HUT, 53, 80, 6)

  // ── 19 ARCH — a ruined gate: two massive piers, a span broken open on one side, a
  // keystone still hanging, rubble at the feet, ivy taking it back. Reads as "something
  // was here before you", which is the whole job of a ruin in a biome.
  p.rect(L.ARCH, 5, 30, 16, 58, 14)            // west pier
  p.rect(L.ARCH, 5, 30, 5, 58, 15)             // lit edge
  p.rect(L.ARCH, 18, 30, 3, 58, 13)            // shade edge
  p.rect(L.ARCH, 43, 30, 16, 58, 14)           // east pier
  p.rect(L.ARCH, 43, 30, 4, 58, 15)
  p.rect(L.ARCH, 56, 30, 3, 58, 13)
  p.rect(L.ARCH, 3, 84, 20, 4, 13)             // pier bases
  p.rect(L.ARCH, 41, 84, 20, 4, 13)
  p.rect(L.ARCH, 5, 20, 38, 10, 15)            // span — stops short of the east pier
  p.rect(L.ARCH, 5, 20, 38, 3, 14)
  p.rect(L.ARCH, 43, 24, 8, 6, 15)             // the surviving stub, stepped down
  p.rect(L.ARCH, 26, 15, 12, 6, 15)            // keystone
  p.rect(L.ARCH, 26, 15, 12, 2, 14)
  // Voussoirs curving into the opening, so the arch reads as an arch rather than a lintel.
  p.rect(L.ARCH, 21, 30, 5, 6, 14); p.rect(L.ARCH, 26, 30, 5, 4, 14)
  p.rect(L.ARCH, 38, 30, 5, 6, 14); p.rect(L.ARCH, 33, 30, 5, 4, 14)
  p.rect(L.ARCH, 21, 30, 22, 2, 15)
  p.rect(L.ARCH, 1, 82, 7, 6, 13)              // rubble
  p.rect(L.ARCH, 56, 80, 7, 8, 13)
  p.rect(L.ARCH, 24, 85, 6, 3, 13)
  p.px(L.ARCH, 8, 40, 6); p.px(L.ARCH, 9, 46, 6); p.px(L.ARCH, 7, 52, 6)   // ivy, west pier
  p.px(L.ARCH, 10, 58, 6); p.px(L.ARCH, 8, 64, 6); p.px(L.ARCH, 11, 70, 6)
  p.px(L.ARCH, 46, 62, 6); p.px(L.ARCH, 48, 68, 6)                          // and east
  p.px(L.ARCH, 19, 44, 13); p.px(L.ARCH, 44, 50, 13)                        // cracks

  // ── 3 LAIR — the boss's front door. A barrow maw between two standing stones, teeth of
  // bone, a skull totem over it and a light on inside. This one is a NODE marker rather
  // than scenery: it is the thing the objective tracker is pointing at, so it has to be
  // findable from a distance and unmistakable when you get there.
  p.rect(L.LAIR, 4, 56, 56, 32, 1)             // barrow mound
  p.rect(L.LAIR, 8, 50, 48, 8, 2)
  p.rect(L.LAIR, 16, 46, 32, 6, 2)
  p.rect(L.LAIR, 2, 84, 60, 4, 1)              // spoil at the base
  p.rect(L.LAIR, 20, 60, 24, 28, 1)            // the maw — void, not shadow
  p.rect(L.LAIR, 20, 60, 24, 3, 13)            // lintel stone over it
  p.rect(L.LAIR, 22, 74, 20, 12, 12)           // light from inside
  p.rect(L.LAIR, 24, 78, 16, 8, 12)
  for (let i = 0; i < 5; i++) {                // bone teeth, upper and lower
    p.rect(L.LAIR, 22 + i * 5, 63, 2, 4, 15)
    p.rect(L.LAIR, 24 + i * 5, 82, 2, 4, 15)
  }
  p.rect(L.LAIR, 5, 40, 11, 44, 14)            // west standing stone
  p.rect(L.LAIR, 5, 40, 4, 44, 15)
  p.rect(L.LAIR, 5, 40, 11, 3, 15)
  p.rect(L.LAIR, 48, 34, 11, 50, 14)           // east standing stone, taller
  p.rect(L.LAIR, 48, 34, 4, 50, 15)
  p.rect(L.LAIR, 48, 34, 11, 3, 15)
  p.rect(L.LAIR, 7, 46, 7, 3, 12)              // warding fires on both stones
  p.rect(L.LAIR, 50, 40, 7, 3, 12)
  p.rect(L.LAIR, 24, 22, 16, 16, 15)           // skull totem
  p.rect(L.LAIR, 26, 38, 12, 5, 15)            // jaw
  p.rect(L.LAIR, 27, 27, 4, 5, 1)              // sockets
  p.rect(L.LAIR, 33, 27, 4, 5, 1)
  p.px(L.LAIR, 28, 29, 12); p.px(L.LAIR, 34, 29, 12)     // and what is looking out of them
  p.rect(L.LAIR, 30, 33, 4, 3, 1)              // nasal
  p.rect(L.LAIR, 31, 16, 2, 6, 2)              // the stake it is mounted on
  p.rect(L.LAIR, 22, 20, 20, 2, 2)             // crossbar
  p.px(L.LAIR, 20, 21, 2); p.px(L.LAIR, 43, 21, 2)

  // ── 26 GREAT_TREE — a canopy oak. Root flare, a trunk thick enough to hide behind, and
  // a crown that spills past the tile it stands on. Lit from the upper-left like every
  // other sprite in the game, so it sits in the same imagined light.
  p.rect(L.GREAT_TREE, 19, 80, 26, 8, 1)       // root flare
  p.rect(L.GREAT_TREE, 15, 84, 34, 4, 1)
  p.rect(L.GREAT_TREE, 19, 80, 8, 8, 2)        // lit side of the roots
  p.rect(L.GREAT_TREE, 26, 44, 12, 40, 2)      // trunk
  p.rect(L.GREAT_TREE, 26, 44, 4, 40, 3)       // lit face
  p.rect(L.GREAT_TREE, 35, 44, 3, 40, 1)       // shade face
  p.px(L.GREAT_TREE, 31, 58, 1); p.px(L.GREAT_TREE, 32, 66, 1)   // bark
  for (let i = 0; i < 7; i++) {                // boughs forking into the crown
    p.rect(L.GREAT_TREE, 25 - i, 46 - i, 3, 3, 2)
    p.rect(L.GREAT_TREE, 37 + i, 48 - i, 3, 3, 2)
  }
  p.rect(L.GREAT_TREE, 6, 20, 52, 20, 6)       // crown — widest band
  p.rect(L.GREAT_TREE, 10, 12, 44, 9, 6)
  p.rect(L.GREAT_TREE, 18, 6, 28, 7, 7)        // top, catching the light
  p.rect(L.GREAT_TREE, 12, 39, 40, 9, 5)       // underside, in shade
  p.rect(L.GREAT_TREE, 18, 46, 28, 5, 5)
  p.rect(L.GREAT_TREE, 6, 20, 16, 14, 7)       // lit upper-left shoulder
  p.rect(L.GREAT_TREE, 44, 26, 14, 14, 5)      // shaded lower-right
  p.px(L.GREAT_TREE, 20, 10, 8); p.px(L.GREAT_TREE, 28, 8, 8); p.px(L.GREAT_TREE, 14, 24, 8)
  p.px(L.GREAT_TREE, 34, 14, 8); p.px(L.GREAT_TREE, 10, 30, 8); p.px(L.GREAT_TREE, 40, 20, 8)
  p.px(L.GREAT_TREE, 24, 44, 5); p.px(L.GREAT_TREE, 42, 43, 5)
  // Round the crown. The bands above are drawn as rectangles because rectangles are how
  // you lay in volume and shading cheaply — but a stack of them reads as a stack of them,
  // and the one silhouette in the game that has to say "tree" from across the screen
  // cannot be a box. Clipping to an ellipse afterwards keeps the internal shading and
  // fixes the outline, and it only touches FOLIAGE slots, so the trunk and the boughs
  // running out through the crown survive the pass.
  {
    const cx = 32, cy = 27, rx = 27.5, ry = 22.5
    const base = L.GREAT_TREE * LM_W * LM_H
    for (let y = 2; y <= 46; y++) {
      for (let x = 0; x < LM_W; x++) {
        const s = p.data[base + y * LM_W + x]
        if (s < 5 || s > 8) continue
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry
        if (nx * nx + ny * ny > 1) p.px(L.GREAT_TREE, x, y, 0)
      }
    }
  }

  // ── 27 GREAT_PINE — a spire conifer. Five skirts, each stepped in and lit on the
  // left edge, which is what makes a stack of rectangles read as a tree.
  p.rect(L.GREAT_PINE, 28, 56, 8, 32, 2)       // trunk
  p.rect(L.GREAT_PINE, 28, 56, 3, 32, 3)
  p.rect(L.GREAT_PINE, 22, 84, 20, 4, 1)       // root spread
  // Each skirt is a TRAPEZOID, not a rectangle: narrow where it meets the trunk, widest at
  // its lower lip. Rectangles stack into a ziggurat; a taper per row is what makes five
  // stacked shapes read as one conifer.
  const skirt = (y: number, h: number, halfW: number, dark: number, lit: number) => {
    for (let i = 0; i < h; i++) {
      const w = Math.max(2, Math.round(halfW * (0.42 + 0.58 * (i / (h - 1)))))
      p.rect(L.GREAT_PINE, 32 - w, y + i, w * 2, 1, i >= h - 2 ? 5 : dark)
      if (i < h - 2) p.rect(L.GREAT_PINE, 32 - w, y + i, w, 1, lit)  // lit west half
    }
  }
  skirt(50, 12, 25, 6, 7)
  skirt(38, 12, 21, 6, 7)
  skirt(27, 11, 17, 6, 7)
  skirt(17, 10, 13, 7, 8)
  skirt(8, 9, 8, 7, 8)
  p.rect(L.GREAT_PINE, 30, 2, 4, 6, 8)         // tip
  p.px(L.GREAT_PINE, 31, 0, 8)
  p.px(L.GREAT_PINE, 20, 44, 8); p.px(L.GREAT_PINE, 42, 33, 8); p.px(L.GREAT_PINE, 26, 22, 8)

  // ── 28 GREAT_DEADTREE — the barren biomes' canopy: a huge forked skeleton. Same
  // footprint as the oak so a dead forest has the same rhythm as a living one, but the
  // silhouette is all gaps, which is what makes an ash waste feel picked clean.
  p.rect(L.GREAT_DEADTREE, 18, 80, 28, 8, 1)   // root flare
  p.rect(L.GREAT_DEADTREE, 14, 85, 36, 3, 1)
  p.rect(L.GREAT_DEADTREE, 26, 30, 12, 54, 2)  // trunk
  p.rect(L.GREAT_DEADTREE, 26, 30, 4, 54, 3)   // lit face
  p.rect(L.GREAT_DEADTREE, 35, 30, 3, 54, 1)   // shade face
  // Limbs: stepped diagonals, each thinning as it climbs, with a broken stub or two.
  for (let i = 0; i < 12; i++) {
    p.rect(L.GREAT_DEADTREE, 25 - i * 2, 40 - i, 3, 3, 2)          // long west limb
    if (i < 9) p.rect(L.GREAT_DEADTREE, 38 + i * 2, 34 - i, 3, 3, 2) // east limb
    if (i < 6) p.rect(L.GREAT_DEADTREE, 30 - i, 28 - i * 3, 3, 4, 2) // crown fork, west
    if (i < 6) p.rect(L.GREAT_DEADTREE, 33 + i, 26 - i * 3, 3, 4, 2) // crown fork, east
  }
  for (let i = 0; i < 5; i++) {                // side twigs off the west limb
    p.rect(L.GREAT_DEADTREE, 15 - i, 32 - i * 2, 2, 2, 1)
    p.rect(L.GREAT_DEADTREE, 47 + i, 28 - i * 2, 2, 2, 1)
  }
  p.rect(L.GREAT_DEADTREE, 8, 44, 6, 2, 1)     // a snapped-off stub
  p.px(L.GREAT_DEADTREE, 30, 50, 1); p.px(L.GREAT_DEADTREE, 32, 62, 1)  // splits in the bark
  p.px(L.GREAT_DEADTREE, 29, 70, 1)

  const still = (frame: number) => ({
    se: { frames: [frame], fps: 1, loop: true },
    ne: { frames: [frame], fps: 1, loop: true },
  })
  const slice = (f: number, id: string): IndexedSprite => {
    const indices = new Uint8Array(LM_W * LM_H)
    indices.set(p.data.subarray(f * LM_W * LM_H, (f + 1) * LM_W * LM_H))
    return {
      id, frameW: LM_W, frameH: LM_H, cols: 1, frameCount: 1, indices,
      anchor: { x: 32, y: 88 },
      animations: { idle: still(0), walk: still(0), attack: still(0), hit: still(0) },
    }
  }
  return {
    [L.LAIR]:  slice(L.LAIR,  'props/landmark/lair'),
    [L.HUT]:   slice(L.HUT,   'props/landmark/hut'),
    [L.TOWER]: slice(L.TOWER, 'props/landmark/tower'),
    [L.ARCH]:  slice(L.ARCH,  'props/landmark/arch'),
    [L.GREAT_TREE]:     slice(L.GREAT_TREE,     'props/landmark/greattree'),
    [L.GREAT_PINE]:     slice(L.GREAT_PINE,     'props/landmark/greatpine'),
    [L.GREAT_DEADTREE]: slice(L.GREAT_DEADTREE, 'props/landmark/greatdeadtree'),
  }
}

// ── Town buildings ───────────────────────────────────────────────────────────
// A separate, larger canvas from the tall-prop sheet: 64x80 on a (32,72) feet anchor,
// against 24x32 for a hero. Authored at the tall-prop 32x48 these came out barely a head
// taller than the person standing in front of them, and the square read as a doll's
// house — a building has to be ~3x a figure before it reads as architecture.
//
// Slot discipline is what makes the faction palettes work: walls and roofs use stone
// (13-15) and timber (1-4), which are IDENTICAL under either flag, while every piece of
// cloth — awnings, signage, banners — sits on 9-12, the faction channel. Lamplight and
// forge-glow use 8 (the top of the thatch/straw ramp), the one warm value the town
// palette keeps for the purpose.

export const TOWN_BUILDING = { INN: 0, SMITHY: 1, STALL: 2, DEPOT: 3 } as const

const TB_W = 64
const TB_H = 80
const TB_N = 4

export function makeTownBuildings(): Record<number, IndexedSprite> {
  const p = new Painter(TB_W, TB_H, TB_N)
  const B = TOWN_BUILDING

  // ── 0 INN — two storeys under deep thatch, jettied upper floor, lit windows. The
  // tallest thing in the square, so it carries the skyline.
  p.rect(B.INN, 10, 40, 44, 32, 13)          // ground-floor wall
  p.rect(B.INN, 10, 40, 7, 32, 14)           // lit face
  p.rect(B.INN, 50, 40, 4, 32, 13)           // shade face
  p.rect(B.INN, 7, 36, 50, 5, 2)             // jetty beam (upper floor overhangs)
  p.rect(B.INN, 7, 36, 50, 1, 3)
  p.rect(B.INN, 9, 22, 46, 14, 15)           // upper storey — lighter plaster
  p.rect(B.INN, 9, 22, 6, 14, 14)
  for (let i = 0; i < 5; i++) p.rect(B.INN, 12 + i * 10, 22, 2, 14, 2)   // timber framing
  p.rect(B.INN, 5, 17, 54, 6, 3)             // eaves
  p.rect(B.INN, 10, 10, 44, 8, 4)            // thatch lower
  p.rect(B.INN, 18, 5, 28, 6, 3)             // thatch upper
  p.rect(B.INN, 27, 2, 10, 4, 4)             // ridge
  p.rect(B.INN, 27, 56, 11, 16, 1)           // doorway
  p.rect(B.INN, 27, 56, 2, 16, 2)
  p.rect(B.INN, 25, 53, 15, 3, 2)            // door lintel
  p.rect(B.INN, 15, 47, 8, 6, 8)             // lit windows, ground floor
  p.rect(B.INN, 42, 47, 8, 6, 8)
  p.rect(B.INN, 16, 26, 7, 6, 8)             // lit windows, upper floor
  p.rect(B.INN, 29, 26, 7, 6, 8)
  p.rect(B.INN, 42, 26, 7, 6, 8)
  p.rect(B.INN, 47, 44, 12, 2, 2)            // sign bracket
  p.rect(B.INN, 53, 46, 9, 9, 10)            // hanging sign (cloth = faction)
  p.rect(B.INN, 53, 46, 9, 2, 11)
  p.rect(B.INN, 56, 49, 4, 4, 12)            // sign device
  p.rect(B.INN, 4, 68, 56, 4, 13)            // plinth course
  p.rect(B.INN, 4, 68, 56, 1, 15)

  // ── 1 SMITHY — open-fronted forge under a heavy stone lintel, tall chimney, coals.
  p.rect(B.SMITHY, 8, 34, 46, 38, 13)
  p.rect(B.SMITHY, 8, 34, 7, 38, 14)         // lit face
  p.rect(B.SMITHY, 50, 34, 4, 38, 13)
  p.rect(B.SMITHY, 5, 28, 52, 6, 15)         // lintel course
  p.rect(B.SMITHY, 9, 20, 44, 8, 2)          // roof
  p.rect(B.SMITHY, 15, 14, 32, 6, 3)
  p.rect(B.SMITHY, 42, 2, 12, 18, 13)        // chimney
  p.rect(B.SMITHY, 42, 2, 4, 18, 14)
  p.rect(B.SMITHY, 40, 0, 16, 4, 15)         // chimney cap
  p.rect(B.SMITHY, 18, 44, 28, 28, 1)        // open forge bay
  p.rect(B.SMITHY, 22, 56, 20, 10, 5)        // coal bed
  p.rect(B.SMITHY, 24, 58, 16, 6, 8)         // glowing coals
  p.px(B.SMITHY, 28, 55, 8); p.px(B.SMITHY, 33, 54, 8); p.px(B.SMITHY, 37, 56, 8)
  p.rect(B.SMITHY, 47, 58, 10, 6, 15)        // anvil
  p.rect(B.SMITHY, 50, 64, 5, 8, 14)         // anvil stump
  p.rect(B.SMITHY, 10, 58, 6, 12, 2)         // rack post
  p.rect(B.SMITHY, 8, 56, 10, 2, 15)         // hung tools
  p.rect(B.SMITHY, 4, 68, 56, 4, 13)
  p.rect(B.SMITHY, 4, 68, 56, 1, 15)

  // ── 2 STALL — a market run: broad awning on posts, counter, goods. Mostly cloth, so
  // this is the loudest faction statement in the square.
  p.rect(B.STALL, 9, 34, 4, 38, 2)           // posts
  p.rect(B.STALL, 51, 34, 4, 38, 2)
  p.rect(B.STALL, 9, 34, 2, 38, 3)
  p.rect(B.STALL, 4, 24, 56, 10, 10)         // awning body
  p.rect(B.STALL, 4, 24, 56, 4, 11)          // awning highlight
  p.rect(B.STALL, 4, 22, 56, 2, 2)           // awning rail
  for (let i = 0; i < 8; i++) {              // scalloped fringe
    p.rect(B.STALL, 5 + i * 7, 34, 4, 4, 9)
    p.px(B.STALL, 7 + i * 7, 38, 9)
  }
  p.rect(B.STALL, 12, 50, 40, 8, 3)          // counter
  p.rect(B.STALL, 12, 50, 40, 2, 4)          // counter lit edge
  p.rect(B.STALL, 12, 58, 40, 14, 2)         // counter front
  p.rect(B.STALL, 16, 42, 8, 8, 5)           // goods: sacks
  p.rect(B.STALL, 27, 40, 10, 10, 12)        // bolt of cloth (faction)
  p.rect(B.STALL, 27, 40, 10, 3, 11)
  p.rect(B.STALL, 41, 44, 7, 6, 15)          // ironmongery
  p.rect(B.STALL, 18, 62, 8, 8, 1)           // crate under the counter

  // ── 3 DEPOT — squat warehouse, banded double doors, loading platform.
  p.rect(B.DEPOT, 7, 32, 50, 40, 13)
  p.rect(B.DEPOT, 7, 32, 7, 40, 14)
  p.rect(B.DEPOT, 53, 32, 4, 40, 13)
  p.rect(B.DEPOT, 4, 26, 56, 6, 2)           // eaves
  p.rect(B.DEPOT, 8, 18, 48, 8, 3)           // roof
  p.rect(B.DEPOT, 18, 13, 28, 6, 4)          // roof ridge
  p.rect(B.DEPOT, 22, 44, 22, 28, 1)         // double doors
  p.rect(B.DEPOT, 32, 44, 2, 28, 2)          // door split
  p.rect(B.DEPOT, 22, 50, 22, 3, 15)         // iron bands
  p.rect(B.DEPOT, 22, 62, 22, 3, 15)
  p.px(B.DEPOT, 30, 57, 15); p.px(B.DEPOT, 36, 57, 15)  // ring handles
  p.rect(B.DEPOT, 11, 38, 8, 7, 1)           // barred windows
  p.rect(B.DEPOT, 47, 38, 8, 7, 1)
  for (let i = 0; i < 3; i++) { p.rect(B.DEPOT, 12 + i * 3, 38, 1, 7, 15); p.rect(B.DEPOT, 48 + i * 3, 38, 1, 7, 15) }
  p.rect(B.DEPOT, 4, 68, 56, 4, 3)           // loading platform (timber)
  p.rect(B.DEPOT, 4, 68, 56, 1, 4)
  p.rect(B.DEPOT, 46, 30, 10, 8, 10)         // consignment banner
  p.rect(B.DEPOT, 49, 32, 4, 4, 12)

  const still = (frame: number) => ({
    se: { frames: [frame], fps: 1, loop: true },
    ne: { frames: [frame], fps: 1, loop: true },
  })
  const slice = (f: number, id: string): IndexedSprite => {
    const indices = new Uint8Array(TB_W * TB_H)
    indices.set(p.data.subarray(f * TB_W * TB_H, (f + 1) * TB_W * TB_H))
    return {
      id, frameW: TB_W, frameH: TB_H, cols: 1, frameCount: 1, indices,
      anchor: { x: 32, y: 72 },
      animations: { idle: still(0), walk: still(0), attack: still(0), hit: still(0) },
    }
  }
  return {
    [B.INN]: slice(B.INN, 'town/inn'),
    [B.SMITHY]: slice(B.SMITHY, 'town/smithy'),
    [B.STALL]: slice(B.STALL, 'town/stall'),
    [B.DEPOT]: slice(B.DEPOT, 'town/depot'),
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
    animations: { idle: anim([0, 1], 2, true), walk: anim([0, 1], 2, true), attack: anim([0, 1], 2, true), hit: anim([0, 1], 2, true) },
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
      attack: anim([0, 1, 2, 3, 4], 4, false),   // ÷4 slow-mo impact ring (FX_TIME_SCALE)
      hit: anim([0, 1, 2, 3, 4], 4, false),
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
