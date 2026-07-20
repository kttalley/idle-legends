#!/usr/bin/env python3
"""Dev-only scaffold: sample the most common ground diamonds from an FFTA map composite
and emit a tileset sheet in OUR frame convention (32x24: bottom 16 = ground diamond,
2x scale). The output feeds importSprite.mjs -> a procedural-map tileset with real FFTA
tile art. Decomp imported READ-ONLY; output to gitignored local-assets/ only.

Usage: python3 tools/scaffold/sample_ffta_tiles.py <map_id> [out.png] [nframes=6]
"""
import os
import struct
import sys
import zlib
from collections import Counter

DECOMP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp"))

CELL_W, CELL_H = 16, 8  # FFTA ground metatile (1x); our frame = 2x + 8px transparent headroom


def write_png_rgba(path, w, h, pix_rows):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pix_rows[y]
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def composite(rom, map_id):
    """RGBA byte rows of the full 512x512 two-layer map composite (same as render_ffta_map)."""
    import map_extract as mx
    import map_screenbuild as sb
    ts = mx.tileset(rom, map_id)
    palb = mx.palette(rom, map_id)
    ncol = len(palb) // 2
    pal = []
    for i in range(ncol):
        c = palb[2 * i] | (palb[2 * i + 1] << 8)
        pal.append(((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3))
    buf = sb.build_workbuf(sb.map_blob(rom, map_id))
    W = H = 512
    pix = [bytearray(W * 4) for _ in range(H)]
    for layer in (sb.LAYER_BG0, sb.LAYER_BG1):
        base = layer * 0x2000
        for cy in range(64):
            for cx in range(64):
                e = buf[base + (cy * 64 + cx) * 2] | (buf[base + (cy * 64 + cx) * 2 + 1] << 8)
                if e == 0:
                    continue
                tile = e & 0x3FF
                hf, vf, bank = (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                toff = tile * 32
                if toff + 32 > len(ts):
                    continue
                for yy in range(8):
                    sy = 7 - yy if vf else yy
                    for xx in range(8):
                        sx = 7 - xx if hf else xx
                        b = ts[toff + sy * 4 + sx // 2]
                        nib = (b >> 4) if (sx & 1) else (b & 0xF)
                        if nib == 0:
                            continue
                        ci = bank * 16 + nib
                        if ci >= ncol:
                            continue
                        r, gg, bl = pal[ci]
                        px = (cx * 8 + xx) * 4
                        row = pix[cy * 8 + yy]
                        row[px:px + 4] = bytes((r, gg, bl, 255))
    return pix


def main():
    for sub in ("tools", "reimpl"):
        sys.path.insert(0, os.path.join(DECOMP, sub))
    map_id = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    out = sys.argv[2] if len(sys.argv) > 2 else "local-assets/ffta-scaffold/raw/tiles_sheet.png"
    nframes = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    os.makedirs(os.path.dirname(out), exist_ok=True)

    with open(os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA"), "rb") as f:
        rom = f.read()
    pix = composite(rom, map_id)

    # Sample 16x8 cells on both diamond-lattice parities; keep fully-opaque cells.
    cells = Counter()
    for j in range(0, 512 // CELL_H - 1):
        for i in range(0, 512 // CELL_W - 1):
            x0 = i * CELL_W + (j % 2) * (CELL_W // 2)
            y0 = j * CELL_H
            block = []
            opaque = True
            for y in range(CELL_H):
                row = pix[y0 + y]
                seg = bytes(row[(x0) * 4:(x0 + CELL_W) * 4])
                if any(seg[k + 3] == 0 for k in range(0, len(seg), 4)):
                    opaque = False
                    break
                block.append(seg)
            if opaque:
                cells[b"".join(block)] += 1

    # Classify each distinct cell by mean color into semantic buckets, then fill our
    # TILE frame convention: [ground0, ground1, water0, water1, rock, path/ground2].
    def mean_rgb(cell):
        r = g = b = n = 0
        for k in range(0, len(cell), 4):
            r += cell[k]; g += cell[k + 1]; b += cell[k + 2]; n += 1
        return r / n, g / n, b / n

    ground, water, rock = [], [], []
    for cell, cnt in cells.most_common():
        r, gg, b = mean_rgb(cell)
        lum = 0.299 * r + 0.587 * gg + 0.114 * b
        if b > r + 12 and b > gg + 4 and b > 80:
            water.append((cell, cnt))
        elif lum < 70:
            rock.append((cell, cnt))
        else:
            ground.append((cell, cnt))

    def pick(bucket, i, fallback):
        return bucket[i][0] if i < len(bucket) else (fallback[0][0] if fallback else b"")
    top = [
        pick(ground, 0, ground),
        pick(ground, 1, ground),
        pick(water, 0, ground),   # WATER — falls back to ground if the biome is dry
        pick(water, 1, water or ground),
        pick(rock, 0, ground),    # CLIFF
        pick(ground, 2, ground),  # PATH
    ]
    print("sampled %d cells — ground %d, water %d, rock %d" %
          (len(cells), len(ground), len(water), len(rock)))
    top = top[:nframes]

    # Emit frames: 32x24 each — 8px transparent headroom + the cell scaled 2x.
    FW, FH = 32, 24
    sheet_w = FW * len(top)
    rows = [bytearray(sheet_w * 4) for _ in range(FH)]
    for fi, cell in enumerate(top):
        for y in range(CELL_H):
            src = cell[y * CELL_W * 4:(y + 1) * CELL_W * 4]
            for x in range(CELL_W):
                rgba = src[x * 4:x * 4 + 4]
                for dy in range(2):
                    for dx in range(2):
                        px = (fi * FW + x * 2 + dx) * 4
                        rows[8 + y * 2 + dy][px:px + 4] = rgba
    write_png_rgba(out, sheet_w, FH, rows)
    print("map %d -> %s (%d frames %dx%d)" % (map_id, out, len(top), FW, FH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
