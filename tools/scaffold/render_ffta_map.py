#!/usr/bin/env python3
"""Dev-only scaffold: composite a full FFTA battle map (both BG layers, palettized) to an
RGBA PNG by importing the sibling decomp repo's verified tools READ-ONLY. Output goes only
to gitignored local-assets/; nothing produced here may be committed or shipped (PLAN.md
"Placeholder art policy"). Exits quietly if the decomp repo is absent.

Usage: python3 tools/scaffold/render_ffta_map.py <map_id> [out.png]
"""
import os
import struct
import sys
import zlib

DECOMP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp"))


def write_png_rgba(path, w, h, pix):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pix[y]
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def main():
    if not os.path.isdir(os.path.join(DECOMP, "tools")):
        print("decomp not found — skipped")
        return 0
    map_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    out_path = sys.argv[2] if len(sys.argv) > 2 else "local-assets/ffta-scaffold/map%d.png" % map_id
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    sys.path.insert(0, os.path.join(DECOMP, "tools"))
    sys.path.insert(0, os.path.join(DECOMP, "reimpl"))
    import gbagfx as g          # noqa: E402
    import map_extract as mx    # noqa: E402
    import map_screenbuild as sb  # noqa: E402

    with open(os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA"), "rb") as f:
        rom = f.read()

    ts = mx.tileset(rom, map_id)          # 4bpp 8x8 tiles
    palb = mx.palette(rom, map_id)        # BGR555 bytes, 16 colors/bank
    ncol = len(palb) // 2
    pal = []
    for i in range(ncol):
        c = palb[2 * i] | (palb[2 * i + 1] << 8)
        pal.append(((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3))

    buf = sb.build_workbuf(sb.map_blob(rom, map_id))
    W = H = 64 * 8
    # RGBA rows; BG0 (terrain) first, BG1 (props) over it. Entry 0 in a layer = nothing.
    pix = [bytearray(W * 4) for _ in range(H)]

    def blit_layer(layer):
        base = layer * 0x2000
        for cy in range(64):
            for cx in range(64):
                e = buf[base + (cy * 64 + cx) * 2] | (buf[base + (cy * 64 + cx) * 2 + 1] << 8)
                tile = e & 0x3FF
                if e == 0:
                    continue
                hf = (e >> 10) & 1
                vf = (e >> 11) & 1
                bank = (e >> 12) & 0xF
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
                        row[px] = r
                        row[px + 1] = gg
                        row[px + 2] = bl
                        row[px + 3] = 255

    blit_layer(sb.LAYER_BG0)
    blit_layer(sb.LAYER_BG1)
    write_png_rgba(out_path, W, H, pix)
    print("map %d -> %s (%dx%d)" % (map_id, out_path, W, H))
    return 0


if __name__ == "__main__":
    sys.exit(main())
