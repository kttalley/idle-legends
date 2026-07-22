#!/usr/bin/env node
// Sprite import pipeline: any RGBA PNG sheet → the authored indexed format
// (normalized PNG + JSON manifest) consumed by src/render/indexedSprite.ts.
// This is the permanent path for ALL incoming art — gen-AI derivatives, hand-drawn
// Aseprite exports, and the dev-only FFTA scaffold all pass through here, so running
// it doubles as a validation of the real content pipeline.
//
// Usage:
//   node tools/importSprite.mjs <in.png> <outDir> --id hero --frame-w 16 --frame-h 40 \
//     --anchor 8,38 --anims "idle:0,1@2;walk:2,3,4,5@8;attack:5,6,7@10!;hit:7@8!"
//
//   --anims  name:frameList@fps[!]  separated by ';'  (! = non-looping)
//            Facings: append '/ne' to a name for a distinct back-facing row
//            (defaults to reusing the se frames when omitted).
//   --max-colors defaults to 16 (slot 0 = transparent). More unique colors than that
//            get merged to their nearest kept color (frequency-ranked), with a warning.

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

function fail(msg) {
  console.error(`importSprite: ${msg}`)
  process.exit(1)
}

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const positional = args.filter(a => !a.startsWith('--'))
if (positional.length < 2) fail('usage: importSprite.mjs <in.png> <outDir> --id X --frame-w N --frame-h N [--anchor x,y] [--anims spec]')
const [inPath, outDir] = positional

function opt(name, dflt) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt
}

const id = opt('id', path.basename(inPath, path.extname(inPath)))
const frameW = Number(opt('frame-w', 0))
const frameH = Number(opt('frame-h', 0))
const maxColors = Number(opt('max-colors', 16))
if (!frameW || !frameH) fail('--frame-w and --frame-h are required')
const anchorSpec = opt('anchor', `${Math.floor(frameW / 2)},${frameH - 2}`).split(',').map(Number)

// ── decode ────────────────────────────────────────────────────────────────────
const png = PNG.sync.read(fs.readFileSync(inPath))
const { width, height, data } = png
if (width % frameW || height % frameH) {
  console.warn(`importSprite: warning — sheet ${width}x${height} is not a whole multiple of ${frameW}x${frameH}`)
}

// ── palette extraction (frequency-ranked), slot 0 reserved for transparency ──
const counts = new Map()
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 128) continue
  const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
// --palette "#rrggbb,#rrggbb,..." — hexes in SEMANTIC SLOT ORDER (slot 1 first; slot 0 is
// always transparent). When given, the manifest's sourcePalette preserves slot semantics
// (so registry palettes recolor the right channels) instead of frequency ranking; image
// colors outside the list still merge to their nearest listed color.
const paletteOpt = opt('palette', null)
const kept = paletteOpt
  ? paletteOpt.split(',').map(h => parseInt(h.trim().replace('#', ''), 16))
  : ranked.slice(0, maxColors - 1)
if (paletteOpt) {
  const stray = ranked.filter(k => !kept.includes(k))
  if (stray.length) console.warn(`importSprite: ${stray.length} image color(s) not in --palette, merging to nearest`)
} else if (ranked.length > kept.length) {
  console.warn(`importSprite: ${ranked.length} unique colors, merging ${ranked.length - kept.length} into nearest of the top ${kept.length}`)
}

function nearestKept(r, g, b) {
  let best = kept[0]
  let bestD = Infinity
  for (const k of kept) {
    const kr = k >> 16
    const kg = (k >> 8) & 0xff
    const kb = k & 0xff
    const d = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

// ── normalize: repaint every pixel to its exact palette color ────────────────
const out = new PNG({ width, height })
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 128) {
    out.data[i + 3] = 0
    continue
  }
  const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
  const c = counts.has(key) && kept.includes(key) ? key : nearestKept(data[i], data[i + 1], data[i + 2])
  out.data[i] = c >> 16
  out.data[i + 1] = (c >> 8) & 0xff
  out.data[i + 2] = c & 0xff
  out.data[i + 3] = 255
}

// ── animations ────────────────────────────────────────────────────────────────
const cols = Math.floor(width / frameW)
const rows = Math.floor(height / frameH)
const frameCount = cols * rows

function parseAnims(spec) {
  const makeDef = (frames, fps, loop) => ({ frames, fps, loop })
  const all = { idle: {}, walk: {}, attack: {}, hit: {}, death: {} }
  for (const part of spec.split(';').filter(Boolean)) {
    const m = part.match(/^(\w+)(?:\/(ne))?:([\d,]+)@(\d+)(!?)$/)
    if (!m) fail(`bad --anims segment: "${part}"`)
    const [, name, facing, frameList, fps, noLoop] = m
    if (!(name in all)) fail(`unknown animation "${name}" (idle|walk|attack|hit|death)`)
    const frames = frameList.split(',').map(Number)
    for (const f of frames) if (f >= frameCount) fail(`frame ${f} out of range (sheet has ${frameCount})`)
    all[name][facing ?? 'se'] = makeDef(frames, Number(fps), !noLoop)
  }
  for (const name of Object.keys(all)) {
    // death is optional (runtime falls back to hit) — omit it entirely when not authored
    // instead of fabricating a default, so the manifest matches the AnimationSet contract.
    if (name === 'death' && !all.death.se) { delete all.death; continue }
    if (!all[name].se) all[name].se = makeDef([0], 1, true)
    if (!all[name].ne) all[name].ne = all[name].se // scaffold default: reuse front row
  }
  return all
}

const animations = parseAnims(opt('anims', 'idle:0@1'))

// ── emit ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true })
const sheetName = `${id}.png`
fs.writeFileSync(path.join(outDir, sheetName), PNG.sync.write(out))

const manifest = {
  id,
  image: sheetName,
  frameW,
  frameH,
  anchor: { x: anchorSpec[0], y: anchorSpec[1] },
  sourcePalette: ['', ...kept.map(k => `#${k.toString(16).padStart(6, '0')}`)],
  animations,
}
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(manifest, null, 2) + '\n')
console.log(`importSprite: ${id} → ${outDir} (${frameCount} frames, ${kept.length + 1} slots)`)
