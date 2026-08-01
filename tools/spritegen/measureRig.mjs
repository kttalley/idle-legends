#!/usr/bin/env node
// Rig metrology: extract HUMANOID BODY PROPORTIONS from the local FFTA dev scaffold.
//
// This reads pixels but emits only aggregate statistics across hundreds of units —
// medians and quartiles of ratios like heads-tall and shoulder:hip. Those are facts
// about a body plan, not expression, so `rig-metrics.json` is safe to commit while
// `local-assets/` never is. No silhouette, outline, or pose is reproduced or traced;
// nothing here becomes conditioning input for generation (tools/spritegen/CLAUDE.md).
//
// Purpose: replace guessed numbers in rig.mjs with measured ones.
//
// Usage:
//   node tools/spritegen/measureRig.mjs [--out tools/spritegen/rig-metrics.json]

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const SRC_DIRS = [
  'local-assets/ffta-scaffold',
  'local-assets/ffta-scaffold/ffta-units',
]
const args = process.argv.slice(2)
const outI = args.indexOf('--out')
const OUT = outI >= 0 ? args[outI + 1] : 'tools/spritegen/rig-metrics.json'

// Target rig, for reporting measured ratios in our own units.
const OUR = { w: 24, h: 32 }

// ── mask extraction ───────────────────────────────────────────────────────────
// Sheets vary: some carry real alpha, most sit on an opaque background colour.
// Key on the top-left pixel when it is opaque; fall back to alpha.
function maskOf(png) {
  const { width: w, height: h, data } = png
  const a0 = data[3]
  const bg = a0 >= 128 ? (data[0] << 16) | (data[1] << 8) | data[2] : null
  const m = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 128) continue
    if (bg !== null && ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === bg) continue
    m[p] = 1
  }
  return m
}

/**
 * Frame pitch is not recorded in the dumps. Score candidate widths by how self-similar
 * the per-frame column profiles are — the true pitch makes every frame look alike.
 */
function detectFrameWidth(mask, w, h) {
  let best = null
  for (const fw of [16, 24, 32, 48]) {
    if (w % fw || w / fw < 2) continue
    const n = w / fw
    const profiles = []
    for (let f = 0; f < n; f++) {
      const prof = new Float64Array(fw)
      for (let y = 0; y < h; y++) for (let x = 0; x < fw; x++) prof[x] += mask[y * w + f * fw + x]
      const sum = prof.reduce((a, b) => a + b, 0)
      if (sum > 0) profiles.push({ prof, sum })
    }
    if (profiles.length < 2) continue
    // mean pairwise cosine similarity of adjacent frames
    let sim = 0, pairs = 0
    for (let i = 1; i < profiles.length; i++) {
      const a = profiles[i - 1].prof, b = profiles[i].prof
      let dot = 0, na = 0, nb = 0
      for (let x = 0; x < fw; x++) { dot += a[x] * b[x]; na += a[x] * a[x]; nb += b[x] * b[x] }
      if (na && nb) { sim += dot / Math.sqrt(na * nb); pairs++ }
    }
    if (!pairs) continue
    const score = sim / pairs
    if (!best || score > best.score) best = { fw, score }
  }
  return best
}

function bbox(mask, w, h, ox, fw) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < fw; x++) {
    if (!mask[y * w + ox + x]) continue
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Row width profile over the bbox, resampled to `n` rows (nearest). */
function rowProfile(mask, w, ox, bb, n) {
  const raw = new Float64Array(bb.h)
  for (let y = 0; y < bb.h; y++) {
    let c = 0
    for (let x = bb.x0; x <= bb.x1; x++) if (mask[(bb.y0 + y) * w + ox + x]) c++
    raw[y] = c
  }
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = raw[Math.min(bb.h - 1, Math.round((i / (n - 1)) * (bb.h - 1)))]
  return { raw, resampled: out }
}

function median(xs) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null
}

// ── measure one unit (frame 0 = standing pose) ───────────────────────────────
function measure(file) {
  let png
  try { png = PNG.sync.read(fs.readFileSync(file)) } catch { return null }
  const { width: w, height: h } = png
  if (h < 24 || h > 64) return null // 16px sheets are tiles/effects, not units
  const mask = maskOf(png)
  const det = detectFrameWidth(mask, w, h)
  if (!det || det.score < 0.9) return null
  const fw = det.fw
  const bb = bbox(mask, w, h, 0, fw)
  if (!bb || bb.h < 16) return null

  const { raw, resampled } = rowProfile(mask, w, 0, bb, OUR.h)

  // Neck = narrowest row in the upper 45% of the body; head is everything above it.
  let neck = 1, neckW = 1e9
  const upper = Math.max(2, Math.floor(bb.h * 0.45))
  for (let y = 1; y < upper; y++) if (raw[y] > 0 && raw[y] < neckW) { neckW = raw[y]; neck = y }
  const headH = neck
  if (headH < 3) return null

  const span = (a, b) => { let m = 0; for (let y = a; y <= b && y < bb.h; y++) m = Math.max(m, raw[y]); return m }
  const shoulderW = span(neck, neck + Math.round(bb.h * 0.18))
  const hipW = raw[Math.min(bb.h - 1, Math.round(bb.h * 0.62))]
  const footW = span(bb.h - 3, bb.h - 1)
  const headW = span(0, Math.max(0, neck - 1))

  // colour budget: how many distinct colours a readable unit of this size actually uses
  const colors = new Set()
  for (let y = 0; y < h; y++) for (let x = 0; x < fw; x++) {
    if (!mask[y * w + x]) continue
    const i = (y * w + x) * 4
    colors.add((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2])
  }

  return {
    file: path.basename(file),
    frameW: fw,
    bodyW: bb.w, bodyH: bb.h,
    headH, headW, shoulderW, hipW, footW,
    headsTall: bb.h / headH,
    shoulderToHip: hipW ? shoulderW / hipW : null,
    headToShoulder: shoulderW ? headW / shoulderW : null,
    widthToHeight: bb.w / bb.h,
    colors: colors.size,
    profile: Array.from(resampled, v => v / bb.w), // normalized 0..1 of body width
  }
}

// ── run ───────────────────────────────────────────────────────────────────────
const files = SRC_DIRS.flatMap(d =>
  fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.png')).map(f => path.join(d, f)) : [],
)
if (!files.length) {
  console.error('measureRig: no scaffold PNGs found — local-assets/ is gitignored and absent on a fresh clone.')
  process.exit(1)
}

const units = files.map(measure).filter(Boolean)
if (units.length < 5) {
  console.error(`measureRig: only ${units.length} units measured; refusing to publish statistics from too small a sample.`)
  process.exit(1)
}

const col = k => units.map(u => u[k]).filter(v => v != null && isFinite(v))
const stat = k => ({ p25: quantile(col(k), 0.25), median: median(col(k)), p75: quantile(col(k), 0.75) })

// Median silhouette width profile, then scaled into our 24x32 frame.
const profile = Array.from({ length: OUR.h }, (_, i) => median(units.map(u => u.profile[i])))
const bodyWWe = Math.round(median(col('widthToHeight')) * OUR.h)

const metrics = {
  _comment:
    'Aggregate humanoid proportions measured from the local FFTA dev scaffold. Statistics only — ' +
    'no pixels, silhouettes, or poses are reproduced here, and nothing in this file is used as ' +
    'generation conditioning. Purpose: replace guessed constants in rig.mjs with measured ones.',
  sampleSize: units.length,
  sourceFrameSizes: [...new Set(units.map(u => `${u.frameW}x${u.bodyH}`))].slice(0, 8),
  ratios: {
    headsTall: stat('headsTall'),
    shoulderToHip: stat('shoulderToHip'),
    headToShoulder: stat('headToShoulder'),
    widthToHeight: stat('widthToHeight'),
  },
  sourcePixels: {
    bodyW: stat('bodyW'), bodyH: stat('bodyH'),
    headH: stat('headH'), headW: stat('headW'),
    shoulderW: stat('shoulderW'), hipW: stat('hipW'), footW: stat('footW'),
    colors: stat('colors'),
  },
  projectedToOurRig: {
    _comment: `Medians scaled into our ${OUR.w}x${OUR.h} frame (body height ${OUR.h - 2}px, 1px headroom).`,
    frameW: OUR.w, frameH: OUR.h,
    bodyH: OUR.h - 2,
    bodyW: bodyWWe,
    headH: Math.round((OUR.h - 2) / median(col('headsTall'))),
    shoulderW: Math.round(bodyWWe * median(units.map(u => u.shoulderW / u.bodyW))),
    hipW: Math.round(bodyWWe * median(units.map(u => u.hipW / u.bodyW))),
    headW: Math.round(bodyWWe * median(units.map(u => u.headW / u.bodyW))),
    footW: Math.round(bodyWWe * median(units.map(u => u.footW / u.bodyW))),
  },
  medianWidthProfile: {
    _comment: `Median body width as a fraction of max body width, over ${OUR.h} rows top->bottom.`,
    rows: profile.map(v => Number(v.toFixed(3))),
  },
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(metrics, null, 2) + '\n')

// ── report ────────────────────────────────────────────────────────────────────
const f = (s, d = 2) => `${s.median?.toFixed(d)} (${s.p25?.toFixed(d)}–${s.p75?.toFixed(d)})`
console.log(`measureRig: ${units.length} humanoid units measured from ${files.length} sheets\n`)
console.log(`  heads tall        ${f(metrics.ratios.headsTall)}`)
console.log(`  shoulder : hip    ${f(metrics.ratios.shoulderToHip)}`)
console.log(`  head : shoulder   ${f(metrics.ratios.headToShoulder)}`)
console.log(`  width : height    ${f(metrics.ratios.widthToHeight)}`)
console.log(`  colours / unit    ${f(metrics.sourcePixels.colors, 0)}`)
const p = metrics.projectedToOurRig
console.log(`\n  projected into ${OUR.w}x${OUR.h}: body ${p.bodyW}x${p.bodyH}, head ${p.headW}x${p.headH}, shoulders ${p.shoulderW}, hips ${p.hipW}, feet ${p.footW}`)
console.log('\n  median width profile (row: fraction of body width)')
profile.forEach((v, i) => {
  const n = Math.round(v * 28)
  console.log(`   ${String(i).padStart(2)} ${'#'.repeat(n).padEnd(28)} ${v.toFixed(2)}`)
})
console.log(`\nmeasureRig: wrote ${OUT}`)
