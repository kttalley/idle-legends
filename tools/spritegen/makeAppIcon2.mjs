// App icon, take two — the goblin warlock and his conjured orb.
//
//   npm run icon2            (writes a preview to /tmp/icon-preview.png)
//   ICON_WRITE=1 npm run icon2   (writes the real icon + splash)
//
// Why this replaced the vanguard icon: the original was a brown-armoured human on a warm
// amber backdrop, and at the ~60px an icon is actually seen at it read as a muddy blob —
// brown on brown, no separation. The fix is not a better backdrop, it is a subject that is
// not brown. A goblin warlock is GREEN, and green against a cold violet-black ground
// separates at any size, in either theme, next to any neighbour on a home screen.
//
// Same rule as ever: rendered from the committed sprite sheets and the real palette tables,
// never drawn separately, so the icon cannot drift from the game.
//
// The sheets are authored in the BASE_UNIT palette and recoloured at runtime, which is why
// hero_goblin_warlock.png is brown on disk. The icon therefore has to apply the race and
// gear swaps itself — mirrored from src/render/palettes.ts by base hex, so a change to the
// base palette produces a visibly wrong icon rather than a silently stale one.
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HERO = process.env.ICON_HERO || 'hero_goblin_warlock'
const FRAME = Number(process.env.ICON_FRAME ?? 0)

const hex = h => [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
const key = (r,g,b) => (r<<16)|(g<<8)|b

// BASE_UNIT, from src/render/palettes.ts. Slots 1-4 skin, 5-8 primary, 9-12 secondary,
// 13-15 metal/accent.
const BASE = {
  1:'5c3a24', 2:'8a5c38', 3:'c08a58', 4:'e8b888',
  5:'3a2818', 6:'5c4028', 7:'7c5838', 8:'9c7048',
  9:'2c2c34', 10:'44444e', 11:'5c5c68', 12:'787884',
  13:'4a4a52', 14:'8a8a96', 15:'c8c8d4',
}
// race/goblin (palettes.ts) + a warlock violet over the robes, so the figure is green skin
// against purple cloth — two hues that both separate from the ground and from each other.
const SWAP = {
  1:'2f5423', 2:'467a30', 3:'62a344', 4:'8fd063',          // goblin skin, lifted
  5:'2a1c40', 6:'472d70', 7:'6b46a4', 8:'9a6fd6',          // robe, violet
  9:'1b1622', 10:'2b2334', 11:'3d3247', 12:'53455f',       // underlayers
  13:'4a4258', 14:'8f86a8', 15:'d2c9e8',                   // accents, cooled
}
const swaps = new Map(Object.entries(BASE).map(([slot,from]) => [key(...hex(from)), hex(SWAP[slot])]))

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.json`), 'utf8'))
const sheet = PNG.sync.read(fs.readFileSync(path.join(ROOT, `public/sprites/units/${HERO}.png`)))
const { frameW, frameH } = manifest
const cols = Math.floor(sheet.width / frameW)
if (FRAME >= cols) throw new Error(`frame ${FRAME} out of range (${cols})`)
const fx = (FRAME % cols) * frameW, fy = Math.floor(FRAME / cols) * frameH
const at = (x, y) => ((sheet.width * (fy + y) + (fx + x)) << 2)

let minX=frameW, maxX=-1, minY=frameH, maxY=-1
for (let y=0;y<frameH;y++) for (let x=0;x<frameW;x++) {
  if (sheet.data[at(x,y)+3] > 8) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y }
}
const inkW = maxX-minX+1, inkH = maxY-minY+1

const lerp = (a,b,t)=>a+(b-a)*t
const smooth = t=>t*t*(3-2*t)

function render(size, heroFrac, haloFrac) {
  const out = new PNG({ width:size, height:size })
  // Cold violet-black. The subject is green and the orb is violet-white, so the ground has
  // to be darker and less saturated than both or the orb stops glowing.
  const CORE=[0x2a1c4a], HALO=[0x3a2668], MID=[0x191233], EDGE=[0x06060f]
  const cx=size/2, cy=size*0.52, haloR=size*haloFrac, maxR=Math.hypot(size/2,size/2)
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const r=Math.hypot(x-cx,y-cy)
    const a=[0x1e,0x16,0x3c], b=[0x0a,0x09,0x18], c=[0x03,0x03,0x07]
    const col = r<haloR ? a.map((v,i)=>lerp(v,b[i],smooth(r/haloR)))
                        : b.map((v,i)=>lerp(v,c[i],smooth(Math.min(1,(r-haloR)/(maxR-haloR)))))
    const i=(size*y+x)<<2
    for (let k=0;k<3;k++) out.data[i+k]=Math.round(col[k])
    out.data[i+3]=255
  }

  const scale = Math.max(1, Math.floor(Math.min(size*heroFrac*0.94/inkW, size*heroFrac/inkH)))
  const drawW=inkW*scale, drawH=inkH*scale
  const ox=Math.round((size-drawW)/2), oy=Math.round((size-drawH)/2)

  const shY=oy+drawH+size*0.012, shRX=drawW*0.60, shRY=size*0.030
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const d=Math.hypot((x-size/2)/shRX,(y-shY)/shRY)
    if (d>=1) continue
    const a=(1-d)*0.6, i=(size*y+x)<<2
    for (let k=0;k<3;k++) out.data[i+k]=Math.round(out.data[i+k]*(1-a))
  }

  // ── The orb, BEHIND the figure so the silhouette stays crisp ──────────────
  // Additive, three-stop falloff: a white-hot core, a violet body, then a wide dim wash
  // that lifts the ground without becoming a second background.
  const orbX = ox + drawW*0.08, orbY = oy + drawH*0.58
  const orbR = size*0.145
  const addGlow = (gx,gy,gr,rgb,strength) => {
    for (let y=Math.max(0,Math.floor(gy-gr));y<Math.min(size,Math.ceil(gy+gr));y++)
      for (let x=Math.max(0,Math.floor(gx-gr));x<Math.min(size,Math.ceil(gx+gr));x++) {
        const d=Math.hypot(x-gx,y-gy); if (d>=gr) continue
        const t=1-d/gr, a=Math.pow(t,2.2)*strength, i=(size*y+x)<<2
        for (let k=0;k<3;k++) out.data[i+k]=Math.min(255, Math.round(out.data[i+k]+rgb[k]*a))
      }
  }
  addGlow(orbX, orbY, orbR*4.6, [0x60,0x30,0xb0], 0.62)   // wide wash
  addGlow(orbX, orbY, orbR*2.0, [0xb0,0x80,0xff], 0.95)   // body
  addGlow(orbX, orbY, orbR*0.8, [0xff,0xf4,0xff], 1.0)    // core

  // ── Figure, recoloured, nearest-neighbour at an integer scale ─────────────
  for (let y=0;y<drawH;y++) for (let x=0;x<drawW;x++) {
    const s=at(minX+Math.floor(x/scale), minY+Math.floor(y/scale))
    const a=sheet.data[s+3]/255
    if (a===0) continue
    let r=sheet.data[s], g=sheet.data[s+1], b=sheet.data[s+2]
    const hit=swaps.get(key(r,g,b)); if (hit) [r,g,b]=hit
    const dx=ox+x, dy=oy+y
    if (dx<0||dy<0||dx>=size||dy>=size) continue
    const d=(size*dy+dx)<<2
    out.data[d]=Math.round(r*a+out.data[d]*(1-a))
    out.data[d+1]=Math.round(g*a+out.data[d+1]*(1-a))
    out.data[d+2]=Math.round(b*a+out.data[d+2]*(1-a))
    out.data[d+3]=255
  }

  // A second, small rim glow IN FRONT, so the orb reads as held rather than as a hole
  // punched behind him.
  addGlow(orbX, orbY, orbR*0.95, [0xe8,0xd8,0xff], 0.85)
  return PNG.sync.write(out, { colorType: 2 })
}

const icon = render(1024, 0.72, 0.34)
if (process.env.ICON_WRITE) {
  const write=(d,b)=>{ fs.mkdirSync(path.dirname(d),{recursive:true}); fs.writeFileSync(d,b)
    console.log(`wrote ${path.relative(ROOT,d).padEnd(56)} ${(b.length/1024).toFixed(0)} KB`) }
  write(path.join(ROOT,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), icon)
  write(path.join(ROOT,'store/icon-1024.png'), icon)
  const splash = render(2732, 0.30, 0.22)
  for (const n of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])
    write(path.join(ROOT,'ios/App/App/Assets.xcassets/Splash.imageset',n), splash)
} else {
  fs.writeFileSync('/tmp/icon-preview.png', icon)
  console.log('preview → /tmp/icon-preview.png (set ICON_WRITE=1 to ship it)')
}
console.log(`source: ${HERO} frame ${FRAME}, ink ${inkW}x${inkH}`)
