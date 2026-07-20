#!/usr/bin/env python3
"""Assemble a dimetric ground tileset by tracing flat material diamonds out of the
FFTA scaffold maps and quantizing each onto OUR semantic palette slots — so the FFTA
*texture* (light/dark pattern) survives while biome palettes still recolor it in-game.

Dev-only: reads gitignored local-assets maps, writes the tileset back into local-assets
(also gitignored). No decomp pixels are committed. Deleting local-assets/ reverts the
game to programmatic tiles (loadSpriteOrPlaceholder fallback).

Frame order MUST match render/placeholderArt.ts TILE:
 0 GRASS 1 GRASS_ALT 2 WATER 3 WATER_ALT 4 CLIFF 5 PATH 6 SAND 7 ROCK
 8 SNOW 9 MOSS 10 FLOWER 11 PATH_ALT 12 EMBER 13 BOG
"""
import json, math, os
from PIL import Image

SCAF = os.path.join(os.path.dirname(__file__), '..', '..', 'local-assets', 'ffta-scaffold')
TW, TH, DIAMOND_TOP, NFRAMES = 32, 24, 8, 14

# Semantic source palette — distinct colours per slot so decompose() round-trips; the
# hues only matter for the byte-true `src/tiles` preview (biome palettes override in
# game). 1-4 earth · 5-8 foliage · 9-12 water · 13-15 stone.
SRC_PAL = ['',
  '#3a2a1a', '#5c4530', '#8a6a44', '#b89060',
  '#16401c', '#2a6a2c', '#489444', '#7ec860',
  '#16304f', '#265479', '#3f86b8', '#93cdf0',
  '#4c4c52', '#86868e', '#c6c6d0']
PAL_RGB = [None] + [(int(h[1:3],16), int(h[3:5],16), int(h[5:7],16)) for h in SRC_PAL[1:]]

def half_width(y):  # 32x16 diamond row half-widths
    return 2 * (y + 1) if y < 8 else 2 * (16 - y)

def lum(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]

# Crop specs: TILE frame → (source map, crop x, crop y, slot_lo, slot_hi) OR
# ('proc', kind) for procedural fills where no clean FFTA source exists.
CROP = {
  0:  ('map1.png',  256, 192, 5, 8),   # GRASS  ← green
  1:  ('map1.png',  224, 192, 5, 8),   # GRASS_ALT
  2:  ('proc', 'water0'),              # WATER
  3:  ('proc', 'water1'),              # WATER_ALT
  4:  ('map16.png', 160, 256, 13, 15), # CLIFF  ← cobble (raised top added below)
  5:  ('map1.png',   64, 416, 1, 4),   # PATH   ← wood planks
  6:  ('map16.png', 288, 256, 1, 4),   # SAND
  7:  ('map16.png', 160, 256, 13, 15), # ROCK   ← cobble
  8:  ('map1.png',  256, 320, 13, 15), # SNOW
  9:  ('map1.png',  256, 192, 5, 8),   # MOSS   ← green (biome tints darker)
  10: ('map1.png',  256, 192, 5, 8),   # FLOWER ← green + blooms below
  11: ('map1.png',   32, 384, 1, 4),   # PATH_ALT ← wood
  12: ('proc', 'ember'),               # EMBER
  13: ('proc', 'bog'),                 # BOG
}

def quantize(crop_rgba, cx, cy, slot_lo, slot_hi):
    """Return slot for diamond-local pixel (cx,cy) by luminance→slot mapping."""
    px = crop_rgba[cy][cx]
    n = slot_hi - slot_lo + 1
    t = max(0.0, min(1.0, (lum(px) - QLO) / (QHI - QLO + 1e-6)))
    return slot_lo + round(t * (n - 1))

def load_crop(spec):
    m, x, y, lo, hi = spec
    im = Image.open(os.path.join(SCAF, m)).convert('RGBA').crop((x, y, x + 32, y + 16))
    rows = [[im.getpixel((cx, cy)) for cx in range(32)] for cy in range(16)]
    return rows, lo, hi

def hashnoise(x, y, f):
    h = (x * 374761393 + y * 668265263 + f * 2147483647) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) % 100

def proc_slot(kind, x, y):
    """Procedural materials (no clean FFTA source), on our slot contract."""
    if kind.startswith('water'):
        shift = 2 if kind == 'water1' else 0
        if ((y + shift + ((x >> 2) & 1)) % 3) == 0: return 12
        if hashnoise(x, y + shift * 3, 21) < 4: return 11
        return 10
    if kind == 'ember':
        crack = (hashnoise(x >> 1, y, 12) % 7 == 0) or (x % 5 == 0 and hashnoise(x, y >> 1, 12) % 3 == 0)
        if crack:
            g = hashnoise(x, y, 12); return 10 if g < 33 else 11 if g < 66 else 12
        return 1 if hashnoise(x // 3, y // 3, 12) < 55 else 2
    if kind == 'bog':
        if hashnoise(x, y, 131) < 4: return 12
        return 9 if hashnoise(x // 4, y // 4, 13) < 50 else 10
    return 5

def build():
    sheet = Image.new('RGBA', (TW * NFRAMES, TH), (0, 0, 0, 0))
    px = sheet.load()
    global QLO, QHI
    for f in range(NFRAMES):
        spec = CROP[f]
        proc = spec[0] == 'proc'
        if not proc:
            rows, lo, hi = load_crop(spec)
            lums = sorted(lum(rows[cy][cx]) for cy in range(16) for cx in range(32))
            QLO, QHI = lums[len(lums) // 20], lums[len(lums) * 19 // 20]
        for dy in range(16):
            hw = half_width(dy)
            for dx in range(16 - hw, 16 + hw):
                if proc:
                    slot = proc_slot(spec[1], dx, dy)
                else:
                    slot = quantize(rows, dx, dy, lo, hi)
                    if dy >= 14: slot = max(lo, slot - 1)  # darker front edge
                # FLOWER: sprinkle bloom accents
                if f == 10 and hashnoise(dx, dy, 73) < 8 and dy < 13:
                    slot = 15
                r, g, b = PAL_RGB[slot]
                px[f * TW + dx, DIAMOND_TOP + dy] = (r, g, b, 255)
        # CLIFF: raised rock cap above the plane (stone slots), like makeTileset.
        if f == 4:
            for yy in range(DIAMOND_TOP):
                hw = 4 + yy
                for xx in range(16 - hw, 16 + hw):
                    s = 13 if hashnoise(xx, yy, 9) < 40 else 14
                    r, g, b = PAL_RGB[s]
                    px[f * TW + xx, yy] = (r, g, b, 255)
    sheet.save(os.path.join(SCAF, 'tiles.png'))
    manifest = {
        'id': 'tiles', 'image': 'tiles.png', 'frameW': TW, 'frameH': TH,
        'anchor': {'x': 16, 'y': 20}, 'sourcePalette': SRC_PAL,
        'animations': {a: {'se': {'frames': [0], 'fps': 1, 'loop': True},
                           'ne': {'frames': [0], 'fps': 1, 'loop': True}}
                       for a in ('idle', 'walk', 'attack', 'hit')},
    }
    with open(os.path.join(SCAF, 'tiles.json'), 'w') as fp:
        json.dump(manifest, fp, indent=2)
    print('wrote tiles.png (%dx%d, %d frames) + tiles.json' % (TW * NFRAMES, TH, NFRAMES))

if __name__ == '__main__':
    build()
