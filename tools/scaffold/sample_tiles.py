#!/usr/bin/env python3
"""Sample candidate 32x16 ground-tile crops from an FFTA scaffold map, as a labeled
contact sheet, so clean material diamonds can be picked by coordinate for tracing.
Dev-only; operates on gitignored local-assets. No decomp pixels are committed."""
import sys
from PIL import Image, ImageDraw

def sample(map_path, out_path, cell_w=32, cell_h=16, step=32, scale=3):
    im = Image.open(map_path).convert("RGBA")
    W, H = im.size
    cols = W // step
    rows = H // step
    pad = 18
    cw, ch = cell_w*scale, cell_h*scale
    sheet = Image.new("RGBA", (cols*(cw+8)+8, rows*(ch+pad)+8), (18,14,8,255))
    d = ImageDraw.Draw(sheet)
    for r in range(rows):
        for c in range(cols):
            x, y = c*step, r*step
            crop = im.crop((x, y, x+cell_w, y+cell_h)).resize((cw, ch), Image.NEAREST)
            dx, dy = 8 + c*(cw+8), 8 + r*(ch+pad)
            sheet.alpha_composite(crop, (dx, dy+pad-4))
            d.text((dx, dy-2), f"{x},{y}", fill=(220,200,120,255))
    sheet.convert("RGB").save(out_path)
    print("saved", out_path, sheet.size, f"({cols}x{rows} cells)")

if __name__ == "__main__":
    sample(sys.argv[1], sys.argv[2])
