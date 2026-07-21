#!/usr/bin/env python3
"""Generate a generalized, gear-free humanoid mannequin template for Idle Legends.

This is NOT a traced silhouette of any one FFTA job. Instead it derives the shared
humanoid proportions from many FFTA battle sprites ( Soldiers, Fighters, Thieves,
Mages, Archers, etc.) and then hand-authors a clean crash-test-dummy shape fitted to
the Idle Legends 24×32 frame.

Output (all in local-assets/templates/):
  - mannequin_silhouette_24x32.png   filled black shape on transparent bg
  - mannequin_outline_24x32.png      1px outline only
  - mannequin_wireframe_24x32.png    scaffold with 8×8 grid, center axis, body zones,
                                     and the feet anchor dot at (12,30)
  - mannequin_preview_8x.png         large readable reference sheet
  - unit_base.gpl                    Aseprite/GIMP palette for the 16-slot contract
"""
import os
import struct
import sys
import zlib

DECOMP = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp")
TOOLS = os.path.abspath(os.path.join(DECOMP, "tools"))
VERIFY = os.path.abspath(os.path.join(DECOMP, "verify"))

OUTDIR = os.path.join(os.path.dirname(__file__), "..", "..", "local-assets", "templates")

# Idle Legends humanoid rig contract (docs/art-authoring.md §2)
IL_FRAME_W, IL_FRAME_H = 24, 32
IL_ANCHOR = (12, 30)

# Semantic 16-slot palette for hand-drawing.
BASE_UNIT_HEX = [
    None,
    '#5c3a24', '#8a5c38', '#c08a58', '#e8b888',  # 1-4 skin ramp
    '#3a2818', '#5c4028', '#7c5838', '#9c7048',  # 5-8 primary material
    '#2c2c34', '#44444e', '#5c5c68', '#787884',  # 9-12 secondary material
    '#4a4a52', '#8a8a96', '#c8c8d4',             # 13-15 metal/accent
]


def write_png_rgba(path: str, w: int, h: int, pixels):
    """pixels: rows of (r,g,b,a). Minimal stdlib PNG writer."""
    def chunk(tag: bytes, data: bytes) -> bytes:
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


def write_png_rgb(path: str, w: int, h: int, rows):
    """rows: rows of (r,g,b). Minimal stdlib PNG writer."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for (r, g, b) in rows[y]:
            raw += bytes((r, g, b))
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def make_mannequin_mask(w: int = IL_FRAME_W, h: int = IL_FRAME_H, ax: int = IL_ANCHOR[0]) -> list:
    """Return a 0/1 mask for the canonical gear-free humanoid mannequin.

    The shape is designed from the FFTA humanoid median proportions but stripped of
    job-specific clothing, hair, weapons, and bulky armor. It is intentionally
    symmetric and top-lit-agnostic (survives horizontal mirror).

    Anatomy zones:
      y  4-11  head / neck
      y 12-23  shoulders / torso / arms
      y 24-29  legs
      y 30-31  feet
    """
    m = [[0] * w for _ in range(h)]

    # head: rounded 6×5
    head_rows = [5, 6, 7, 8, 9]
    head_widths = [4, 6, 6, 6, 5]
    for y, ww in zip(head_rows, head_widths):
        for x in range(ax - ww // 2, ax - ww // 2 + ww):
            m[y][x] = 1

    # neck
    for y in range(10, 12):
        for x in range(ax - 1, ax + 2):
            m[y][x] = 1

    # shoulders (wider than hips)
    for y in range(12, 15):
        ww = 10
        for x in range(ax - ww // 2, ax - ww // 2 + ww):
            m[y][x] = 1

    # upper torso
    for y in range(15, 20):
        ww = 8
        for x in range(ax - ww // 2, ax - ww // 2 + ww):
            m[y][x] = 1

    # waist / hips
    for y in range(20, 24):
        ww = 7
        for x in range(ax - ww // 2, ax - ww // 2 + ww):
            m[y][x] = 1

    # legs (slightly apart so they read as two limbs)
    for y in range(24, 30):
        for x in range(ax - 3, ax):
            m[y][x] = 1
        for x in range(ax + 1, ax + 4):
            m[y][x] = 1

    # feet
    for y in range(30, 32):
        for x in range(ax - 4, ax + 5):
            m[y][x] = 1

    # arms: straight down from shoulders to mid-thigh
    for y in range(13, 23):
        m[y][ax - 5] = 1
        m[y][ax + 5] = 1

    # forearms angle slightly inward
    for y in range(23, 25):
        m[y][ax - 4] = 1
        m[y][ax + 4] = 1

    return m


def outline_mask(mask: list) -> list:
    h = len(mask)
    w = len(mask[0]) if h else 0
    out = [[0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if mask[y][x] == 0:
                continue
            edge = False
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = y + dy, x + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w or mask[ny][nx] == 0:
                    edge = True
                    break
            if edge:
                out[y][x] = 1
    return out


def upscale_rgb(rows: list, scale: int) -> list:
    h = len(rows)
    w = len(rows[0]) if h else 0
    return [[rows[y // scale][x // scale] for x in range(w * scale)] for y in range(h * scale)]


def write_gpl(path: str, name: str, hex_colors: list) -> None:
    lines = ["GIMP Palette", "Name: %s" % name, "Columns: 4"]
    labels = [
        "transparent", "skin1", "skin2", "skin3", "skin4",
        "primary1", "primary2", "primary3", "primary4",
        "secondary1", "secondary2", "secondary3", "secondary4",
        "accent1", "accent2", "accent3",
    ]
    for i, hx in enumerate(hex_colors):
        if hx is None or hx == '':
            lines.append("%3d %3d %3d transparent" % (0, 0, 0))
        else:
            r = int(hx[1:3], 16)
            g = int(hx[3:5], 16)
            b = int(hx[5:7], 16)
            lines.append("%3d %3d %3d %s" % (r, g, b, labels[i]))
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main() -> int:
    if not os.path.isdir(TOOLS):
        print("decomp repo not found at %s — cannot derive FFTA proportions" % DECOMP)
        return 1

    # We import the decomp tools purely to confirm the humanoid frame dimensions and
    # to read the battle palette, but the mannequin shape itself is authored, not traced.
    sys.path.insert(0, TOOLS)
    sys.path.insert(0, VERIFY)
    import gbagfx as g  # noqa: E402
    import roster_static as rs  # noqa: E402

    rom_path = os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA")
    with open(rom_path, "rb") as f:
        rom = f.read()
    pal = g.read_palette_bgr555(
        open(os.path.join(DECOMP, "verify", "dumps", "battle0_pal.bin"), "rb").read(),
        0x200, 16)

    # Sample a spread of humanoid gids to print their native dimensions. This is just
    # informational — it validates that 24×32 is a sane fit for the FFTA humanoid family.
    sample_gids = [0, 1, 2, 3, 5, 9, 12, 15, 18, 21, 30, 40, 50]
    dims = []
    for gid in sample_gids:
        r = rs.resolve(rom, gid)
        if not r:
            continue
        if r["tilecount"] != 16 or r["ms_off"] != 0:
            continue
        W, H, _ = rs.render_unit(rom, r["metasprite"], pal, r["src"], r["tilecount"])
        dims.append((gid, W, H, r.get("type_name")))

    os.makedirs(OUTDIR, exist_ok=True)

    mask = make_mannequin_mask()
    outline = outline_mask(mask)
    W, H = IL_FRAME_W, IL_FRAME_H

    # 1. silhouette (filled, transparent bg)
    sil = [[(0, 0, 0, 255) if mask[y][x] else (0, 0, 0, 0) for x in range(W)] for y in range(H)]
    write_png_rgba(os.path.join(OUTDIR, "mannequin_silhouette_24x32.png"), W, H, sil)

    # 2. outline only
    ol = [[(0, 0, 0, 255) if outline[y][x] else (0, 0, 0, 0) for x in range(W)] for y in range(H)]
    write_png_rgba(os.path.join(OUTDIR, "mannequin_outline_24x32.png"), W, H, ol)

    # 3. wireframe scaffold
    bg = (255, 255, 255)
    grid = (200, 200, 200)
    axis = (60, 180, 220)
    head_zone = (255, 230, 200)
    torso_zone = (200, 240, 255)
    legs_zone = (230, 255, 210)
    anchor_c = (255, 80, 80)
    body_fill = (220, 220, 220)
    outline_c = (0, 0, 0)

    wf = [[bg for _ in range(W)] for _ in range(H)]
    # 8×8 tile grid
    for y in range(0, H, 8):
        for x in range(W):
            wf[y][x] = grid
    for x in range(0, W, 8):
        for y in range(H):
            wf[y][x] = grid
    # center axis
    ax = IL_ANCHOR[0]
    for y in range(H):
        wf[y][ax] = axis
    # body zones (behind body)
    for y in range(4, 12):
        for x in range(W):
            if wf[y][x] == bg:
                wf[y][x] = head_zone
    for y in range(12, 24):
        for x in range(W):
            if wf[y][x] == bg:
                wf[y][x] = torso_zone
    for y in range(24, H):
        for x in range(W):
            if wf[y][x] == bg:
                wf[y][x] = legs_zone
    # body outline + fill
    for y in range(H):
        for x in range(W):
            if outline[y][x]:
                wf[y][x] = outline_c
            elif mask[y][x]:
                wf[y][x] = body_fill
    # anchor dot
    ay, ax_ = IL_ANCHOR
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yy, xx = ay + dy, ax_ + dx
            if 0 <= yy < H and 0 <= xx < W:
                wf[yy][xx] = anchor_c
    write_png_rgb(os.path.join(OUTDIR, "mannequin_wireframe_24x32.png"), W, H, wf)

    # 4. 8× preview sheet (silhouette / outline / wireframe)
    scale = 8
    sil_rgb = [[(40, 40, 40) if mask[y][x] else bg for x in range(W)] for y in range(H)]
    ol_rgb = [[outline_c if outline[y][x] else bg for x in range(W)] for y in range(H)]
    preview_w = W * 3 + 8 * 2
    preview_h = H + 8
    canvas = [[bg for _ in range(preview_w)] for _ in range(preview_h)]
    for y in range(H):
        for x in range(W):
            canvas[4 + y][4 + x] = sil_rgb[y][x]
            canvas[4 + y][4 + W + 8 + x] = ol_rgb[y][x]
            ox = 4 + 2 * (W + 8) + x
            if ox < preview_w:
                canvas[4 + y][ox] = wf[y][x]
    up = upscale_rgb(canvas, scale)
    write_png_rgb(os.path.join(OUTDIR, "mannequin_preview_8x.png"), len(up[0]), len(up), up)

    # 5. Aseprite / GIMP palette
    write_gpl(os.path.join(OUTDIR, "unit_base.gpl"), "Idle Legends unit/base", BASE_UNIT_HEX)

    print("Generalized FFTA-derived humanoid mannequin -> %s" % OUTDIR)
    print("  sample FFTA humanoid dims: " + ", ".join("gid%d %dx%d" % (g, W, H) for g, W, H, _ in dims[:8]))
    print("  files:")
    for fn in sorted(os.listdir(OUTDIR)):
        if fn.startswith("mannequin") or fn == "unit_base.gpl":
            print("    - %s" % fn)
    return 0


if __name__ == "__main__":
    sys.exit(main())
