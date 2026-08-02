// App Store icon, rendered from the shipping sprite pipeline rather than drawn
// separately — PLAN.md wants the icon and screenshots to come out of the same rig art, so
// the store listing and the game cannot drift apart.
//
// Reads one frame of a committed hero sheet (public/sprites/units/), scales it with
// nearest-neighbour so the pixels stay pixels, and composites it over a warm radial
// backdrop in the game's own palette.
//
// Apple's rules this satisfies: exactly 1024x1024, fully opaque (no alpha channel in the
// output), no rounded corners and no drop shadow of our own — iOS masks the corners
// itself, and a pre-rounded icon renders with visible double-corners.
//
//   npm run icon
//
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HERO = process.env.ICON_HERO || 'hero_vanguard'
const FRAME = Number(process.env.ICON_FRAME ?? 0)   // 0 = first idle frame

// ── source frame ──────────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.json`), 'utf8'))
const sheet = PNG.sync.read(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.png`)))
const { frameW, frameH } = manifest
const cols = Math.floor(sheet.width / frameW)
if (FRAME >= cols) throw new Error(`frame ${FRAME} out of range (sheet has ${cols})`)
const fx = (FRAME % cols) * frameW
const fy = Math.floor(FRAME / cols) * frameH

// Trim to the frame's actual ink so the hero is centred on its art, not on the cell —
// rigs sit on a 24x32 cell with the feet at the anchor, so the raw cell is bottom-heavy.
let minX = frameW, maxX = -1, minY = frameH, maxY = -1
const at = (x, y) => ((sheet.width * (fy + y) + (fx + x)) << 2)
for (let y = 0; y < frameH; y++) {
  for (let x = 0; x < frameW; x++) {
    if (sheet.data[at(x, y) + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
}
if (maxX < 0) throw new Error('frame is empty')
const inkW = maxX - minX + 1
const inkH = maxY - minY + 1

// ── render ────────────────────────────────────────────────────────────────────
// The hero rigs are warm browns and tans, so a warm backdrop gives no separation: the
// first icon was brown-on-brown and read as a muddy blob at the ~60px an icon is
// actually seen at. Instead the figure is BACKLIT — a tight amber halo right behind it,
// falling fast to a cold blue-black at the edges. Warm subject against a cool ground
// separates at any size, and the amber is the game's own gold accent.
const HALO = [0xd8, 0x8c, 0x28]   // amber core
const MID  = [0x4a, 0x26, 0x12]
const EDGE = [0x07, 0x08, 0x10]   // cold blue-black
const lerp = (a, b, t) => a + (b - a) * t
const smooth = t => t * t * (3 - 2 * t)   // a linear ramp bands visibly at these sizes

/**
 * @param size      square output edge in px
 * @param heroFrac  fraction of the edge the figure should occupy vertically
 * @param haloFrac  halo radius as a fraction of the edge
 */
function render(size, heroFrac, haloFrac) {
  const out = new PNG({ width: size, height: size })
  const cx = size / 2, cy = size * 0.52
  const haloR = size * haloFrac
  const maxR = Math.hypot(size / 2, size / 2)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - cx, y - cy)
      const col = r < haloR
        ? HALO.map((v, c) => lerp(v, MID[c], smooth(r / haloR)))
        : MID.map((v, c) => lerp(v, EDGE[c], smooth(Math.min(1, (r - haloR) / (maxR - haloR)))))
      const i = (size * y + x) << 2
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(col[c])
      out.data[i + 3] = 255
    }
  }

  // Ground shadow: a soft ellipse under the feet so the figure sits in the scene.
  const shY = size * 0.80, shRX = size * 0.26, shRY = size * 0.052
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x - size / 2) / shRX, (y - shY) / shRY)
      if (d >= 1) continue
      const a = (1 - d) * 0.55
      const i = (size * y + x) << 2
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] * (1 - a))
    }
  }

  // Hero, nearest-neighbour at an INTEGER scale — a fractional factor makes some source
  // pixels a px wider than their neighbours, which is glaring on pixel art.
  const scale = Math.max(1, Math.floor(Math.min(size * heroFrac * 0.94 / inkW, size * heroFrac / inkH)))
  const drawW = inkW * scale, drawH = inkH * scale
  const ox = Math.round((size - drawW) / 2)
  const oy = Math.round(size * 0.80 - drawH)   // feet land on the shadow
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const s = at(minX + Math.floor(x / scale), minY + Math.floor(y / scale))
      const a = sheet.data[s + 3] / 255
      if (a === 0) continue
      const dx = ox + x, dy = oy + y
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue
      const d = (size * dy + dx) << 2
      for (let c = 0; c < 3; c++) {
        out.data[d + c] = Math.round(sheet.data[s + c] * a + out.data[d + c] * (1 - a))
      }
      out.data[d + 3] = 255
    }
  }
  // colorType 2 = RGB, no alpha channel at all: App Store Connect rejects an icon that
  // merely *has* an alpha channel, even a fully opaque one.
  return { buf: PNG.sync.write(out, { colorType: 2 }), scale, drawW, drawH }
}

const write = (dest, buf) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  console.log(`wrote ${path.relative(ROOT, dest).padEnd(58)} ${(buf.length / 1024).toFixed(0)} KB`)
}

// App icon.
const icon = render(1024, 0.66, 0.34)
write(path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), icon.buf)
write(path.join(ROOT, 'store/icon-1024.png'), icon.buf)

// Launch image. Capacitor ships a pure-white 2732x2732 splash, which flashes white before
// a very dark game — the single most visible "unfinished" tell on first launch. Same art,
// smaller figure, wider halo: the splash is cropped to the device aspect from the centre,
// so anything near the edges is lost on a tall phone.
const splash = render(2732, 0.30, 0.22)
for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  write(path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset', n), splash.buf)
}

console.log(`\nsource: ${HERO} frame ${FRAME}, ink ${inkW}x${inkH}`)
console.log(`icon   hero ${icon.drawW}x${icon.drawH} (${icon.scale}x)`)
console.log(`splash hero ${splash.drawW}x${splash.drawH} (${splash.scale}x)`)
