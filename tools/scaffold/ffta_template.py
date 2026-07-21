#!/usr/bin/env python3
"""Derive a hand-drawing template from the canonical FFTA humanoid battle sprite.

The FFTA battle sprites are decoded straight from the ROM via the sibling decomp repo's
fully-static resolver (battle-sprites.md U4/U5/U8). We take the Soldier (gid 0) standing
frame — the simplest, cleanest humanoid — and emit several template forms:

  - native 16x40 silhouette + outline (1:1 FFTA pixels, transparent background)
  - fitted 24x32 silhouette + outline (nearest-neighbor mapped to the Idle Legends frame)
  - 24x32 wireframe scaffolding (body zones, center axis, 8x8 tile grid)
  - a reference sheet combining the above
  - unit/base.gpl palette for Aseprite

Output is written to local-assets/templates/ (gitignored scaffold path; never shipped).
"""
import os
import struct
import sys
import zlib
from typing import List, Tuple, Optional

DECOMP = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp")
TOOLS = os.path.abspath(os.path.join(DECOMP, "tools"))
VERIFY = os.path.abspath(os.path.join(DECOMP, "verify"))

OUTDIR = os.path.join(os.path.dirname(__file__), "..", "..", "local-assets", "templates")

# Idle Legends humanoid rig contract (docs/art-authoring.md §2)
IL_FRAME_W, IL_FRAME_H = 24, 32
IL_ANCHOR = (12, 30)

# Canonical FFTA humanoid graphic id for the base "Soldier" standing frame.
GID = 0

# Aseprite / GIMP palette text for unit/base (16 slots, 0 = transparent)
BASE_UNIT_HEX = [
    None,
    '#5c3a24', '#8a5c38', '#c08a58', '#e8b888',  # 1-4 skin
    '#3a2818', '#5c4028', '#7c5838', '#9c7048',  # 5-8 primary
    '#2c2c34', '#44444e', '#5c5c68', '#787884',  # 9-12 secondary
    '#4a4a52', '#8a8a96', '#c8c8d4',             # 13-15 accent
]


def write_png_rgba(path: str, w: int, h: int, pixels: List[List[Tuple[int, int, int, int]]]) -> None:
    """Minimal stdlib PNG writer; pixels are rows of (r,g,b,a)."""
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


def blank(w: int, h: int, fill: Tuple[int, int, int, int] = (0, 0, 0, 0)) -> List[List[Tuple[int, int, int, int]]]:
    return [[fill for _ in range(w)] for _ in range(h)]


def img_to_mask(img: List[List[Optional[Tuple[int, int, int]]]]) -> List[List[int]]:
    """Convert assembled metasprite image (None = transparent) to a 0/1 mask."""
    return [[1 if c is not None else 0 for c in row] for row in img]


def silhouette_from_mask(mask: List[List[int]], color: Tuple[int, int, int] = (0, 0, 0)) -> List[List[Tuple[int, int, int, int]]]:
    rgba = (*color, 255)
    return [[rgba if v else (0, 0, 0, 0) for v in row] for row in mask]


def outline_from_mask(mask: List[List[int]], color: Tuple[int, int, int] = (0, 0, 0)) -> List[List[Tuple[int, int, int, int]]]:
    h = len(mask)
    w = len(mask[0]) if h else 0
    out = blank(w, h)
    rgba = (*color, 255)
    for y in range(h):
        for x in range(w):
            if mask[y][x] == 0:
                continue
            edge = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if ny < 0 or ny >= h or nx < 0 or nx >= w or mask[ny][nx] == 0:
                        edge = True
                        break
                if edge:
                    break
            if edge:
                out[y][x] = rgba
    return out


def scale_mask_nn(mask: List[List[int]], dw: int, dh: int) -> List[List[int]]:
    """Nearest-neighbor scale a 0/1 mask to (dw,dh)."""
    sh, sw = len(mask), len(mask[0])
    out = [[0] * dw for _ in range(dh)]
    for y in range(dh):
        sy = min(sh - 1, int(y * sh / dh))
        for x in range(dw):
            sx = min(sw - 1, int(x * sw / dw))
            out[y][x] = mask[sy][sx]
    return out


def wireframe(dw: int, dh: int, silhouette_mask: List[List[int]]) -> List[List[Tuple[int, int, int, int]]]:
    """Draw a 24x32 humanoid wireframe with guides derived from the fitted silhouette."""
    out = blank(dw, dh)

    def pixel(x: int, y: int, c: Tuple[int, int, int, int]) -> None:
        if 0 <= x < dw and 0 <= y < dh:
            out[y][x] = c

    def line_h(y: int, c: Tuple[int, int, int, int]) -> None:
        for x in range(dw):
            out[y][x] = c

    def line_v(x: int, c: Tuple[int, int, int, int]) -> None:
        for y in range(dh):
            out[y][x] = c

    def rect(x0: int, y0: int, w: int, h: int, c: Tuple[int, int, int, int]) -> None:
        for yy in range(y0, min(y0 + h, dh)):
            for xx in range(x0, min(x0 + w, dw)):
                if yy == y0 or yy == y0 + h - 1 or xx == x0 or xx == x0 + w - 1:
                    out[yy][xx] = c

    # Colors (subtle, visible over transparent bg)
    box = (180, 60, 220, 255)      # bounding box
    axis = (60, 180, 220, 255)     # center axis
    grid = (80, 80, 80, 120)       # 8x8 tile grid (semi-transparent)
    zone = (220, 180, 60, 200)     # body-zone boxes

    # Outer frame bounds
    rect(0, 0, dw, dh, box)

    # 8x8 tile grid
    for yy in range(0, dh, 8):
        line_h(yy, grid)
    for xx in range(0, dw, 8):
        line_v(xx, grid)

    # Center axis
    cx = dw // 2
    line_v(cx, axis)

    # Body zones derived from fitted silhouette: scan silhouette to find top, then divide.
    top = next((y for y in range(dh) if any(silhouette_mask[y])), 0)
    bottom = next((y for y in range(dh - 1, -1, -1) if any(silhouette_mask[y])), dh - 1)
    height = bottom - top + 1

    # Head: top ~25%
    y_head = top + int(height * 0.25)
    # Torso: next ~35%
    y_torso = y_head + int(height * 0.35)
    # Legs: remainder

    rect(2, top, dw - 4, y_head - top, zone)          # head zone
    rect(1, y_head, dw - 2, y_torso - y_head, zone)  # torso zone
    rect(1, y_torso, dw - 2, bottom - y_torso + 1, zone)  # legs zone

    # Horizontal division markers
    line_h(y_head, zone)
    line_h(y_torso, zone)

    # Anchor dot at feet center
    ax, ay = IL_ANCHOR
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            pixel(ax + dx, ay + dy, (255, 80, 80, 255))

    return out


def composite_reference(imgs: List[Tuple[str, List[List[Tuple[int, int, int, int]]]]]) -> List[List[Tuple[int, int, int, int]]]:
    """Place images side-by-side with a light background."""
    pad = 4
    total_w = sum(len(img[0]) for _, img in imgs) + pad * (len(imgs) + 1)
    max_h = max(len(img) for _, img in imgs) + pad * 2
    canvas = blank(total_w, max_h, (255, 255, 255, 255))
    x = pad
    for _, img in imgs:
        h = len(img)
        y = pad
        for yy, row in enumerate(img):
            for xx, c in enumerate(row):
                if c[3] != 0:
                    canvas[y + yy][x + xx] = c
        x += len(img[0]) + pad
    return canvas


def upscale(pixels: List[List[Tuple[int, int, int, int]]], scale: int) -> List[List[Tuple[int, int, int, int]]]:
    """Nearest-neighbor upscale for preview images."""
    h, w = len(pixels), len(pixels[0])
    out = blank(w * scale, h * scale)
    for y in range(h):
        for x in range(w):
            c = pixels[y][x]
            for dy in range(scale):
                for dx in range(scale):
                    out[y * scale + dy][x * scale + dx] = c
    return out


def write_gpl(path: str, name: str, hex_colors: List[Optional[str]]) -> None:
    """Write a GIMP / Aseprite .gpl palette. Slot 0 is transparent."""
    lines = ["GIMP Palette", "Name: %s" % name, "Columns: 4"]
    for i, hx in enumerate(hex_colors):
        if hx is None or hx == '':
            lines.append("%3d %3d %3d transparent" % (0, 0, 0))
        else:
            r = int(hx[1:3], 16)
            g = int(hx[3:5], 16)
            b = int(hx[5:7], 16)
            label = [
                "transparent", "skin1", "skin2", "skin3", "skin4",
                "primary1", "primary2", "primary3", "primary4",
                "secondary1", "secondary2", "secondary3", "secondary4",
                "accent1", "accent2", "accent3",
            ][i]
            lines.append("%3d %3d %3d %s" % (r, g, b, label))
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main() -> int:
    if not os.path.isdir(TOOLS):
        print("decomp repo not found at %s — cannot derive FFTA template" % DECOMP)
        return 1

    sys.path.insert(0, TOOLS)
    sys.path.insert(0, VERIFY)
    import gbagfx as g
    import roster_static as rs

    rom_path = os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA")
    with open(rom_path, "rb") as f:
        rom = f.read()

    r = rs.resolve(rom, GID)
    if not r:
        print("failed to resolve FFTA gid %d" % GID)
        return 1

    pal = g.read_palette_bgr555(
        open(os.path.join(DECOMP, "verify", "dumps", "battle0_pal.bin"), "rb").read(),
        0x200, 16)

    W, H, img = rs.render_unit(rom, r["metasprite"], pal, r["src"], r["tilecount"])
    mask = img_to_mask(img)

    os.makedirs(OUTDIR, exist_ok=True)

    # Native 1:1 forms
    native_sil = silhouette_from_mask(mask)
    native_out = outline_from_mask(mask)
    write_png_rgba(os.path.join(OUTDIR, "ffta_soldier_silhouette_native.png"), W, H, native_sil)
    write_png_rgba(os.path.join(OUTDIR, "ffta_soldier_outline_native.png"), W, H, native_out)

    # Fitted to Idle Legends 24x32 frame
    fitted_mask = scale_mask_nn(mask, IL_FRAME_W, IL_FRAME_H)
    fitted_sil = silhouette_from_mask(fitted_mask)
    fitted_out = outline_from_mask(fitted_mask)
    write_png_rgba(os.path.join(OUTDIR, "ffta_soldier_silhouette_24x32.png"), IL_FRAME_W, IL_FRAME_H, fitted_sil)
    write_png_rgba(os.path.join(OUTDIR, "ffta_soldier_outline_24x32.png"), IL_FRAME_W, IL_FRAME_H, fitted_out)

    # Wireframe scaffolding
    wf = wireframe(IL_FRAME_W, IL_FRAME_H, fitted_mask)
    write_png_rgba(os.path.join(OUTDIR, "ffta_humanoid_wireframe_24x32.png"), IL_FRAME_W, IL_FRAME_H, wf)

    # Combined reference sheet
    ref = composite_reference([
        ("native", native_sil),
        ("outline", native_out),
        ("24x32", fitted_sil),
        ("wireframe", wf),
    ])
    write_png_rgba(os.path.join(OUTDIR, "ffta_template_reference.png"), len(ref[0]), len(ref), ref)

    # Upscaled preview for human viewing
    preview = upscale(ref, 8)
    write_png_rgba(os.path.join(OUTDIR, "ffta_template_preview.png"), len(preview[0]), len(preview), preview)

    # Aseprite / GIMP palette
    write_gpl(os.path.join(OUTDIR, "unit_base.gpl"), "Idle Legends unit/base", BASE_UNIT_HEX)

    print("FFTA Soldier gid=%d standing frame -> templates in %s" % (GID, OUTDIR))
    print("  native size: %dx%d" % (W, H))
    print("  files:")
    for fn in sorted(os.listdir(OUTDIR)):
        print("    - %s" % fn)
    return 0


if __name__ == "__main__":
    sys.exit(main())
