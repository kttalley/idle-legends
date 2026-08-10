#!/usr/bin/env node
// The rig: canonical 24x32 humanoid mannequin for Stillmarch, in the engine's
// dimetric (2:1) 3/4 overhead camera — NOT a front elevation.
//
// This is the most load-bearing artifact in the sprite pipeline. It is:
//   1. the ControlNet conditioning image for every generated unit concept, and
//   2. the ZONE MAP the slot quantizer uses to decide skin vs primary vs secondary.
// A wrong rig silently corrupts every unit that comes after it.
//
// Original authored geometry — no traced or derived pixels from any other game.
// Outputs are committed (tools/spritegen/rig/) because local-assets/ is gitignored
// and this must travel to the generation rig.
//
// Usage:
//   node tools/spritegen/rig.mjs [outDir] [--scale 8]

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const W = 24
const H = 32
const ANCHOR = { x: 12, y: 30 }

const args = process.argv.slice(2)
const scaleI = args.indexOf('--scale')
const SCALE = scaleI >= 0 ? Number(args[scaleI + 1]) : 8
const positional = args.filter((a, i) => !a.startsWith('--') && !(scaleI >= 0 && i === scaleI + 1))
const outDir = positional[0] ?? path.join('tools', 'spritegen', 'rig')

// ── zone ids ──────────────────────────────────────────────────────────────────
// These map 1:1 onto refPalette.json groups. The quantizer votes cluster->group
// by which zone a cluster's pixels predominantly land in.
const Z = { BG: 0, HEAD: 1, HAIR: 2, TORSO: 3, ARM: 4, HAND: 5, LEG: 6, FOOT: 7 }
const ZONE_GROUP = {
  [Z.HEAD]: 'skin', [Z.HAND]: 'skin',
  [Z.HAIR]: 'secondary',
  [Z.TORSO]: 'primary', [Z.ARM]: 'primary',
  [Z.LEG]: 'secondary', [Z.FOOT]: 'accent',
}

// ── the pose, as explicit row spans ──────────────────────────────────────────
// Tunable by hand: each entry is [y, xStart, xEnd (inclusive), zone].
// Proportions: head 8px of a 28px body = ~3.5 heads. Shoulders 12px wide, hips 8px.
// The 3/4 read comes from (a) the head sitting 1px toward the facing side, (b) a
// sloped shoulder line, (c) staggered feet — the near foot lower and forward.
function poseSE() {
  const spans = []
  const push = (y, x0, x1, z) => spans.push([y, x0, x1, z])

  // In dimetric 2:1 the camera sits above and to one side. For SE the NEAR side is
  // viewer-right: near geometry renders LOWER on screen and reads slightly larger.
  // Every asymmetry below encodes that — it is what separates a 3/4 rig from a
  // front elevation, and it is the single cue ControlNet most needs from this image.

  // hair mass / skull — offset 1px toward the near side
  push(3, 10, 15, Z.HAIR)
  push(4, 9, 16, Z.HAIR)
  push(5, 9, 16, Z.HAIR)
  // face: hair recedes to a fringe, skin below. The far cheek keeps 1px more hair.
  push(6, 9, 10, Z.HAIR); push(6, 11, 15, Z.HEAD); push(6, 16, 16, Z.HAIR)
  push(7, 9, 9, Z.HAIR); push(7, 10, 15, Z.HEAD); push(7, 16, 16, Z.HAIR)
  push(8, 10, 15, Z.HEAD)
  push(9, 11, 14, Z.HEAD) // jaw
  push(10, 11, 13, Z.HEAD) // neck

  // shoulder line — far (left) shoulder crests a row EARLIER and narrower;
  // near (right) shoulder arrives a row later and carries further out.
  push(11, 8, 14, Z.TORSO)
  push(12, 6, 16, Z.TORSO)
  push(13, 6, 17, Z.TORSO)
  // chest -> waist taper, biased so the near edge stays out 1px longer
  push(14, 7, 17, Z.TORSO)
  push(15, 7, 16, Z.TORSO)
  push(16, 7, 16, Z.TORSO)
  push(17, 8, 16, Z.TORSO) // waist
  push(18, 8, 15, Z.TORSO)
  // hips
  push(19, 8, 15, Z.TORSO)
  push(20, 8, 15, Z.TORSO)

  // arms — attached at the shoulder (no gap), drifting out 1px at the forearm so
  // the limb still separates from the torso at 1x. Near arm hangs one row lower.
  for (let y = 12; y <= 15; y++) push(y, 5, 6, Z.ARM)
  for (let y = 16; y <= 20; y++) push(y, 4, 5, Z.ARM)
  push(21, 4, 5, Z.HAND)
  for (let y = 13; y <= 16; y++) push(y, 17, 18, Z.ARM)
  for (let y = 17; y <= 21; y++) push(y, 18, 19, Z.ARM)
  push(22, 18, 19, Z.HAND)

  // legs — 2px of background between them; near leg runs one row longer
  for (let y = 21; y <= 27; y++) push(y, 8, 10, Z.LEG)
  for (let y = 21; y <= 28; y++) push(y, 13, 15, Z.LEG)
  // feet — near foot lower and further forward, the clearest depth cue in the pose
  push(28, 7, 10, Z.FOOT)
  push(29, 7, 11, Z.FOOT)
  push(29, 13, 17, Z.FOOT)
  push(30, 13, 18, Z.FOOT)

  return spans
}

/**
 * NE (back-facing): the unit has turned away, so (a) the face is gone — the skull
 * is all hair — and (b) the whole 3/4 asymmetry mirrors, because the side that was
 * near is now far. Mirroring is the correct transform here; the renderer's own
 * horizontal flip then covers the remaining two of the four diagonal facings.
 */
function poseNE() {
  return poseSE().map(([y, x0, x1, z]) => [
    y,
    W - 1 - x1,
    W - 1 - x0,
    // back of the head is all hair; the nape (y >= 10) stays exposed skin
    z === Z.HEAD && y <= 9 ? Z.HAIR : z,
  ])
}

function rasterize(spans) {
  const zone = new Uint8Array(W * H)
  for (const [y, x0, x1, z] of spans) {
    if (y < 0 || y >= H) continue
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) zone[y * W + x] = z
  }
  return zone
}

// ── raster helpers ────────────────────────────────────────────────────────────
function outlineOf(zone) {
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!zone[y * W + x]) continue
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + dy, nx = x + dx
        if (ny < 0 || ny >= H || nx < 0 || nx >= W || !zone[ny * W + nx]) { out[y * W + x] = 1; break }
      }
    }
  }
  return out
}

/** Depth ramp for ControlNet depth: nearer geometry brighter. */
function depthOf(zone) {
  const near = { [Z.HEAD]: 235, [Z.HAIR]: 205, [Z.TORSO]: 190, [Z.ARM]: 220, [Z.HAND]: 235, [Z.LEG]: 170, [Z.FOOT]: 150 }
  const d = new Uint8Array(W * H)
  for (let i = 0; i < zone.length; i++) d[i] = zone[i] ? near[zone[i]] ?? 180 : 0
  return d
}

const ZONE_COLOR = {
  [Z.HEAD]: [232, 184, 136], [Z.HAIR]: [ 92,  92, 104], [Z.TORSO]: [124,  88,  56],
  [Z.ARM]:  [156, 112,  72], [Z.HAND]: [232, 184, 136], [Z.LEG]:  [ 68,  68,  78],
  [Z.FOOT]: [138, 138, 150],
}

function writePng(file, w, h, rgba) {
  const png = new PNG({ width: w, height: h })
  png.data.set(rgba)
  fs.writeFileSync(file, PNG.sync.write(png))
}

function upscale(rgba, w, h, s) {
  const out = new Uint8Array(w * s * h * s * 4)
  for (let y = 0; y < h * s; y++) {
    for (let x = 0; x < w * s; x++) {
      const si = (((y / s) | 0) * w + ((x / s) | 0)) * 4
      const di = (y * w * s + x) * 4
      out.set(rgba.subarray(si, si + 4), di)
    }
  }
  return out
}

function toRgba(w, h, fn) {
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = fn(x, y)
    const i = (y * w + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
  }
  return px
}

// ── emit ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true })

const facings = { se: rasterize(poseSE()), ne: rasterize(poseNE()) }
const written = []

for (const [facing, zone] of Object.entries(facings)) {
  const ol = outlineOf(zone)
  const dp = depthOf(zone)

  const sil = toRgba(W, H, (x, y) => zone[y * W + x] ? [0, 0, 0, 255] : [0, 0, 0, 0])
  const out = toRgba(W, H, (x, y) => ol[y * W + x] ? [0, 0, 0, 255] : [255, 255, 255, 0])
  const dep = toRgba(W, H, (x, y) => { const v = dp[y * W + x]; return [v, v, v, 255] })
  const zon = toRgba(W, H, (x, y) => {
    const z = zone[y * W + x]
    return z ? [...ZONE_COLOR[z], 255] : [0, 0, 0, 0]
  })

  for (const [name, px] of [['silhouette', sil], ['lineart', out], ['depth', dep], ['zones', zon]]) {
    const f = path.join(outDir, `mannequin_${facing}_${name}_24x32.png`)
    writePng(f, W, H, px)
    written.push(path.basename(f))
  }
  // preview strip: silhouette | lineart | zones, upscaled
  const strip = toRgba(W * 3, H, (x, y) => {
    const panel = (x / W) | 0
    const lx = x % W
    const z = zone[y * W + lx]
    if (panel === 0) return z ? [24, 24, 28, 255] : [244, 244, 246, 255]
    if (panel === 1) return ol[y * W + lx] ? [24, 24, 28, 255] : [244, 244, 246, 255]
    return z ? [...ZONE_COLOR[z], 255] : [244, 244, 246, 255]
  })
  const f = path.join(outDir, `mannequin_${facing}_preview_${SCALE}x.png`)
  writePng(f, W * 3 * SCALE, H * SCALE, upscale(strip, W * 3, H, SCALE))
  written.push(path.basename(f))
}

// zone map as data — the quantizer consumes this, not the PNGs
fs.writeFileSync(
  path.join(outDir, 'zonemap.json'),
  JSON.stringify({
    frameW: W, frameH: H, anchor: ANCHOR,
    zoneIds: Z, zoneGroup: ZONE_GROUP,
    facings: Object.fromEntries(Object.entries(facings).map(([k, v]) => [k, Array.from(v)])),
  }) + '\n',
)
written.push('zonemap.json')

const opaque = Object.values(facings).map(z => z.reduce((n, v) => n + (v ? 1 : 0), 0))
console.log(`rig: ${W}x${H}, anchor ${ANCHOR.x},${ANCHOR.y} — se ${opaque[0]}px / ne ${opaque[1]}px opaque`)
console.log(`rig: wrote ${written.length} files to ${outDir}`)
