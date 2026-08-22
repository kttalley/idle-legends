// IAP promotional art — the 1024x1024 "Image (Optional)" slot on each in-app purchase.
//
//   npm run iap-art
//
// Apple shows this image in **offer code redemptions**, which for us is precisely how the
// Shipaton judges will reach the premium features — so the optional field is not optional
// in practice. It also appears on the product page if the IAP is promoted.
//
// Same rule as makeAppIcon.mjs, and the same reason: rendered from the committed sprite
// sheets and the real colourway tables, never drawn separately, so the promo art cannot
// drift from what the player actually unlocks. The three Founder heroes here are the
// literal output of COLORWAYS — if a hex changes in colorways.ts, re-run this and the
// image follows.
//
// Deliberately textless. There is no font rasteriser in this pipeline, and Apple resizes
// this image well below the size any baked-in text would survive; the localized display
// name is rendered by the App Store beside it anyway.
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(homedir(), 'Desktop', 'stillmarch-iap-screenshots')
const SIZE = 1024

// ── the palette facts, mirrored from src/render ───────────────────────────────
// Slots 5-8 primary material, 9-12 secondary, 13-15 metal/accent (graphics-spec §5.1).
// Kept as literals rather than imported because this is a plain .mjs tool and the source
// is TypeScript; the ONLY safe way to hold that duplication is to key the substitution on
// the base hexes, so a base-palette change produces a visibly wrong image rather than a
// silently stale one.
const BASE_UNIT = {
  5: '#3a2818', 6: '#5c4028', 7: '#7c5838', 8: '#9c7048',
  9: '#2c2c34', 10: '#44444e', 11: '#5c5c68', 12: '#787884',
  13: '#4a4a52', 14: '#8a8a96', 15: '#c8c8d4',
}
const FOUNDER = [
  { id: 'lastlight', o: { 5:'#6b4c14',6:'#966d1c',7:'#c39329',8:'#efc25a',9:'#2b2f3e',10:'#3e4457',11:'#565d74',12:'#727a93',13:'#8c6a1e',14:'#c9a03c',15:'#ffe9a8' } },
  { id: 'ashmarch',  o: { 5:'#5a1e14',6:'#832a1a',7:'#b03f22',8:'#e0682c',9:'#241d1c',10:'#3a2c28',11:'#523c34',12:'#6e5044',13:'#7a2410',14:'#c14a18',15:'#ff9a4a' } },
  { id: 'drowned',   o: { 5:'#12403a',6:'#1c5b50',7:'#2c7d6b',8:'#49a48c',9:'#1b2a2e',10:'#2b4045',11:'#3d585e',12:'#537279',13:'#1e6a58',14:'#3fae8c',15:'#a8f0d8' } },
]

const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
const key = (r,g,b) => (r<<16)|(g<<8)|b

/** base-hex -> replacement-hex, as an integer lookup. */
function swapTable(overrides) {
  const m = new Map()
  for (const [slot, to] of Object.entries(overrides)) {
    const from = BASE_UNIT[slot]
    if (!from) continue
    m.set(key(...hex(from)), hex(to))
  }
  return m
}

// ── source rig ────────────────────────────────────────────────────────────────
const HERO = process.env.IAP_HERO || 'hero_vanguard'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.json`), 'utf8'))
const sheet = PNG.sync.read(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.png`)))
const { frameW, frameH } = manifest
const at = (x, y) => ((sheet.width * y + x) << 2)

let minX = frameW, maxX = -1, minY = frameH, maxY = -1
for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
  if (sheet.data[at(x,y)+3] > 8) {
    if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y
  }
}
if (maxX < 0) throw new Error('frame 0 is empty')
const inkW = maxX-minX+1, inkH = maxY-minY+1

// ── ground ────────────────────────────────────────────────────────────────────
const lerp = (a,b,t) => a+(b-a)*t
const smooth = t => t*t*(3-2*t)

function backdrop(halo, mid, edge, haloFrac, cyFrac) {
  const out = new PNG({ width: SIZE, height: SIZE })
  const cx = SIZE/2, cy = SIZE*cyFrac
  const haloR = SIZE*haloFrac, maxR = Math.hypot(SIZE/2, SIZE/2)
  for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
    const r = Math.hypot(x-cx, y-cy)
    const col = r < haloR
      ? halo.map((v,c) => lerp(v, mid[c], smooth(r/haloR)))
      : mid.map((v,c) => lerp(v, edge[c], smooth(Math.min(1,(r-haloR)/(maxR-haloR)))))
    const i = (SIZE*y+x)<<2
    for (let c=0;c<3;c++) out.data[i+c] = Math.round(col[c])
    out.data[i+3] = 255
  }
  return out
}

function shadow(out, cx, cy, rx, ry, strength = 0.55) {
  for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
    const d = Math.hypot((x-cx)/rx, (y-cy)/ry)
    if (d >= 1) continue
    const a = (1-d)*strength
    const i = (SIZE*y+x)<<2
    for (let c=0;c<3;c++) out.data[i+c] = Math.round(out.data[i+c]*(1-a))
  }
}

/** Draw the rig at an INTEGER scale — fractional makes some source pixels wider. */
function drawHero(out, scale, footX, footY, swaps) {
  const drawW = inkW*scale, drawH = inkH*scale
  const ox = Math.round(footX - drawW/2), oy = Math.round(footY - drawH)
  for (let y=0; y<drawH; y++) for (let x=0; x<drawW; x++) {
    const s = at(minX + Math.floor(x/scale), minY + Math.floor(y/scale))
    const a = sheet.data[s+3]/255
    if (a === 0) continue
    let [r,g,b] = [sheet.data[s], sheet.data[s+1], sheet.data[s+2]]
    const hit = swaps && swaps.get(key(r,g,b))
    if (hit) [r,g,b] = hit
    const dx = ox+x, dy = oy+y
    if (dx<0||dy<0||dx>=SIZE||dy>=SIZE) continue
    const d = (SIZE*dy+dx)<<2
    out.data[d]   = Math.round(r*a + out.data[d]*(1-a))
    out.data[d+1] = Math.round(g*a + out.data[d+1]*(1-a))
    out.data[d+2] = Math.round(b*a + out.data[d+2]*(1-a))
    out.data[d+3] = 255
  }
  return drawH
}

function rect(out, x0, y0, w, h, rgb, alpha = 1) {
  for (let y=y0; y<y0+h; y++) for (let x=x0; x<x0+w; x++) {
    if (x<0||y<0||x>=SIZE||y>=SIZE) continue
    const i = (SIZE*y+x)<<2
    for (let c=0;c<3;c++) out.data[i+c] = Math.round(rgb[c]*alpha + out.data[i+c]*(1-alpha))
  }
}

// colorType 2 = RGB, no alpha channel at all. App Store Connect rejects an image that
// merely HAS an alpha channel, even a fully opaque one — the same trap as the app icon.
const write = (name, png) => {
  fs.mkdirSync(OUT, { recursive: true })
  const buf = PNG.sync.write(png, { colorType: 2 })
  fs.writeFileSync(path.join(OUT, name), buf)
  console.log(`  ✓ ${name.padEnd(28)} ${SIZE}x${SIZE}  ${(buf.length/1024).toFixed(0)} KB`)
}

// ── 1. Founder Pack — the three unlocked colourways, side by side ─────────────
{
  const out = backdrop([0xd8,0x8c,0x28], [0x4a,0x26,0x12], [0x07,0x08,0x10], 0.40, 0.54)
  const scale = Math.floor(SIZE * 0.30 / inkH)
  const footY = Math.round(SIZE * 0.70)
  const xs = [SIZE*0.22, SIZE*0.50, SIZE*0.78]
  // Shadows first, all three, so a neighbour's feet never draw over them.
  for (const x of xs) shadow(out, x, footY + 6, inkW*scale*0.55, SIZE*0.022)
  FOUNDER.forEach((cw, i) => drawHero(out, scale, xs[i], footY, swapTable(cw.o)))
  write('founder-pack-1024.png', out)
}

// ── 2. Standing Orders — one hero, and the watch running long ─────────────────
// The meter is the product: a track filled well past its free portion. The brighter
// amber segment is the +8h this buys, drawn in the same gold the HUD uses.
{
  const out = backdrop([0x3c,0x76,0xa8], [0x1b,0x2c,0x40], [0x05,0x07,0x0e], 0.34, 0.46)
  const scale = Math.floor(SIZE * 0.42 / inkH)
  const footY = Math.round(SIZE * 0.66)
  shadow(out, SIZE/2, footY + 8, inkW*scale*0.6, SIZE*0.028)
  drawHero(out, scale, SIZE/2, footY, null)

  const trackX = Math.round(SIZE*0.16), trackW = Math.round(SIZE*0.68)
  const trackY = Math.round(SIZE*0.79), trackH = Math.round(SIZE*0.052)
  rect(out, trackX-4, trackY-4, trackW+8, trackH+8, [0x6b,0x53,0x1c], 0.9) // frame
  rect(out, trackX, trackY, trackW, trackH, [0x0b,0x0d,0x14], 1)           // well
  const base = Math.round(trackW*0.46)
  rect(out, trackX, trackY, base, trackH, [0xb8,0x8a,0x2c], 1)             // the free 8h
  rect(out, trackX+base, trackY, trackW-base, trackH, [0xf5,0xd0,0x62], 1) // the +8h bought
  write('standing-orders-1024.png', out)
}

console.log(`\nsource rig: ${HERO} frame 0, ink ${inkW}x${inkH} → ${OUT}`)
