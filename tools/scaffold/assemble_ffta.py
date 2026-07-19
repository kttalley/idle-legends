#!/usr/bin/env python3
"""Dev-only scaffold assembler. Renders assembled, palettized FFTA battle-unit frames by
importing the sibling decomp repo's RE tools READ-ONLY (nothing in the decomp is modified,
and no decomp code is copied here — this script only calls it). Output goes exclusively to
gitignored paths; nothing this produces may ever be committed or shipped (see PLAN.md
"Placeholder art policy"). If the decomp repo is absent this script just exits.

Facts used (documented + byte-verified in the decomp's docs/system/battle-sprites.md):
  - all humanoid battle units share ONE standing metasprite, ROM VA 0x08852e7c
  - a unit's animation frames are contiguous 0x140-byte (10-tile) blocks: frame N = base + N*0x140
  - battle OBJ palettes are raw BGR555 banks at 0x08419d60 / ...d80 / ...da0

Usage:  python3 tools/scaffold/assemble_ffta.py <out_dir>
Emits per unit: <out_dir>/<unit>_sheet.png (scale 1, RGBA, transparent bg, frames in a row)
"""
import os
import struct
import sys
import zlib

DECOMP = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp")
TOOLS = os.path.abspath(os.path.join(DECOMP, "tools"))

META_VA = 0x08852E7C
PALETTE_VAS = [0x08419D60, 0x08419D80, 0x08419DA0]
FRAME_STRIDE = 0x140  # 10 tiles x 32 bytes
FRAMES_PER_UNIT = 8   # first 8 frames of each unit's pack (idle/walk live here)

# Known per-unit sheet bases (documented tilebase->ROM mapping, battle-sprites.md U1/U2b).
UNITS = {
    "hero": 0x0876541C,   # tb64
    "hero2": 0x0876B49C,  # tb80
    "hero3": 0x087966FC,  # tb16
    "hero4": 0x08774A1C,  # tb96
}


def write_png_rgba(path, w, h, pixels):
    """pixels: rows of (r,g,b,a). Minimal stdlib PNG writer (no PIL dependency)."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for (r, g, b, a) in pixels[y]:
            raw += bytes((r, g, b, a))
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def main():
    if not os.path.isdir(TOOLS):
        print("decomp repo not found at %s — scaffold skipped (programmatic art will be used)" % DECOMP)
        return 0
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "local-assets/ffta-scaffold/raw"
    os.makedirs(out_dir, exist_ok=True)

    sys.path.insert(0, TOOLS)
    import gbagfx as g          # noqa: E402  (decomp tools, read-only import)
    import metasprite as m      # noqa: E402

    rom_path = os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA")
    with open(rom_path, "rb") as f:
        rom = f.read()
    parts = m.parse_metasprite(rom, META_VA - g.ROM_BASE)
    pal = g.read_palette_bgr555(rom, PALETTE_VAS[0] - g.ROM_BASE, 16)

    for name, base in UNITS.items():
        frames = []
        fw = fh = 0
        for n in range(FRAMES_PER_UNIT):
            off = base - g.ROM_BASE + n * FRAME_STRIDE
            sheet = rom[off:off + FRAME_STRIDE]
            w, h, img = m.assemble(parts, sheet, pal, tilebase=0)
            frames.append(img)
            fw, fh = max(fw, w), max(fh, h)

        sheet_w = fw * len(frames)
        rows = [[(0, 0, 0, 0)] * sheet_w for _ in range(fh)]
        for i, img in enumerate(frames):
            for y in range(len(img)):
                for x in range(len(img[y])):
                    c = img[y][x]
                    if c is not None:
                        rows[y][i * fw + x] = (c[0], c[1], c[2], 255)
        out = os.path.join(out_dir, "%s_sheet.png" % name)
        write_png_rgba(out, sheet_w, fh, rows)
        print("%s: %d frames %dx%d -> %s" % (name, len(frames), fw, fh, out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
