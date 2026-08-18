#!/usr/bin/env python3
"""Derive net-new FFTA-style units by recombining authentic sprite bands.

Why bands, and why these bands: FFTA composes each unit frame from 6 OAM objects on a
fixed grid — a humanoid 16x40 frame is 8x8,8x8 / 8x16,8x16 / 8x16,8x16 and a 32x40 beast
is 16x8,16x8 / 16x16,16x16 / 16x16,16x16. Both decompose on the *same* horizontal seams,
at y 0-8, 8-24, 24-40. Cutting there means every slice is a whole OAM object as the game
itself draws it, so nothing lands mid-object.

Every unit sheet shares one 34-frame layout, so band N of frame F can be taken from a
different donor than band M of frame F and the result still animates: each donor
contributes its own motion for its own band, in lockstep.

  extract  build the band library from the converted roster
  compose  assemble a new unit from a per-band donor recipe
  list     show available donors

  python3 tools/spritekit/parts.py extract
  python3 tools/spritekit/parts.py compose --id ffa_chimera \
      --crown ffa_tonberry --body ffa_antlion --base ffa_antlion
  python3 tools/spritekit/parts.py list

`compose` writes <id>.png + <id>.json into the ffta-units directory in the exact layout
plan.py already consumes, so a composed unit goes through the normal
plan.py -> strip_shadow.py -> assemble_plan.lua pipeline with no special-casing.
"""
from __future__ import annotations
import argparse, json, shutil, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("parts.py: Pillow not installed; pip install pillow")

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "local-assets" / "ffta-scaffold" / "ffta-units"
LIB = ROOT / "tools" / "_parts_lib"

# (name, y0, y1) — the OAM row seams, identical for 16x40 and 32x40 frames.
BANDS = [("crown", 0, 8), ("body", 8, 24), ("base", 24, 40)]


def named_units() -> list[str]:
    """Donor pool: the authentic converted units only.

    Composed creatures live in the same directory as real manifests so the rest of the
    pipeline treats them uniformly, but they must never become donors — composing from a
    composition compounds seam artifacts and lets one bad pairing propagate. The composer
    stamps `derivedFrom`, so that key is the marker to exclude on.
    """
    out = []
    for p in sorted(UNITS.glob("*.json")):
        if "gid" in p.stem or p.stem == "index":
            continue
        try:
            if "derivedFrom" in json.loads(p.read_text()):
                continue
        except (ValueError, OSError):
            continue
        out.append(p.stem)
    return out


def load(uid: str):
    m = json.loads((UNITS / f"{uid}.json").read_text())
    return m, Image.open(UNITS / m["image"]).convert("RGBA")


def cmd_extract(_args) -> int:
    """Slice every unit's whole sheet into per-band strips (all 34 frames kept intact)."""
    if LIB.exists():
        shutil.rmtree(LIB)
    LIB.mkdir(parents=True)
    index = {}
    for uid in named_units():
        m, sheet = load(uid)
        fw, fh = m["frameW"], m["frameH"]
        d = LIB / uid
        d.mkdir()
        for name, y0, y1 in BANDS:
            # Keep the band as one full-width strip spanning every frame, so a composed
            # unit inherits the donor's motion for that band with no re-timing.
            sheet.crop((0, y0, sheet.width, min(y1, fh))).save(d / f"{name}.png")
        index[uid] = {"frameW": fw, "frameH": fh, "frames": sheet.width // fw,
                      "palette": m["sourcePalette"], "anchor": m["anchor"]}
        (d / "meta.json").write_text(json.dumps(index[uid], indent=1))
    (LIB / "index.json").write_text(json.dumps(index, indent=1))
    hum = sum(1 for v in index.values() if v["frameW"] == 16)
    print(f"extracted {len(index)} units x {len(BANDS)} bands -> {LIB.relative_to(ROOT)}")
    print(f"  {hum} humanoid (16x40), {len(index)-hum} beast (32x40); bands only mix within a width")
    return 0


def cmd_list(_args) -> int:
    if not (LIB / "index.json").exists():
        sys.exit("no parts library yet — run: parts.py extract")
    idx = json.loads((LIB / "index.json").read_text())
    for w in (16, 32):
        names = sorted(k for k, v in idx.items() if v["frameW"] == w)
        print(f"\n{w}x40 donors ({len(names)}):")
        for i in range(0, len(names), 4):
            print("   " + "  ".join(n.replace("ffa_", "").ljust(16) for n in names[i:i+4]))
    print("\nbands:", ", ".join(f"{n} (y{a}-{b})" for n, a, b in BANDS))
    return 0


def prune_floaters(sheet: Image.Image, fw: int, nframes: int):
    """Delete pixel islands that don't touch the unit's main mass.

    Donors are cut on the OAM seams, but two donors' silhouettes need not *meet* there —
    a wide crown over a narrow body leaves the crown's outer pixels hanging in space, and
    they read as debris rather than anatomy. Per frame, keep only the connected component
    that carries the most pixels below the first seam (the body, which is always the mass
    a creature hangs off) plus anything 8-connected to it.
    """
    import numpy as np
    a = np.array(sheet)
    dropped = 0
    seam = BANDS[0][2]                       # first seam: crown/body boundary
    for f in range(nframes):
        sl = a[:, f * fw:(f + 1) * fw]
        occ = sl[:, :, 3] > 0
        if not occ.any():
            continue
        h, w = occ.shape
        lab = np.zeros((h, w), dtype=np.int32)
        cur = 0
        for sy in range(h):
            for sx in range(w):
                if not occ[sy, sx] or lab[sy, sx]:
                    continue
                cur += 1
                stack = [(sy, sx)]
                lab[sy, sx] = cur
                while stack:
                    y, x = stack.pop()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and occ[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = cur
                                stack.append((ny, nx))
        if cur <= 1:
            continue
        # the body is whichever component has the most mass below the crown seam
        best, bestscore = 0, -1
        for c in range(1, cur + 1):
            score = int(((lab == c) & (np.arange(h)[:, None] >= seam)).sum())
            if score > bestscore:
                best, bestscore = c, score
        kill = occ & (lab != best)
        dropped += int(kill.sum())
        sl[kill] = (0, 0, 0, 0)
    return Image.fromarray(a), dropped


def cmd_compose(args) -> int:
    if not (LIB / "index.json").exists():
        sys.exit("no parts library yet — run: parts.py extract")
    idx = json.loads((LIB / "index.json").read_text())
    donors = {"crown": args.crown, "body": args.body, "base": args.base}
    for band, uid in donors.items():
        if uid not in idx:
            sys.exit(f"unknown donor for {band}: {uid} (try: parts.py list)")
    frames = {idx[u]["frames"] for u in donors.values()}
    if len(frames) > 1:
        sys.exit(f"donors have different frame counts {sorted(frames)}; pick donors that share a layout")

    # Frame widths vary per unit — the exported canvas is each unit's own bounding box
    # across all 24 poses, so a class with a wide weapon swing is wider than one without.
    # Compose onto the widest donor's canvas and align every band on its **anchor**, not
    # on the canvas edge: the anchor is FFTA's placement point, so anchor-aligning is what
    # keeps a head centred over a torso when the two donors have different bbox widths.
    base_uid = donors["body"]
    base_meta, _ = load(base_uid)
    fh = base_meta["frameH"]
    fw = max(idx[u]["frameW"] for u in donors.values())
    ax = max(idx[u]["anchor"]["x"] for u in donors.values())
    nframes = idx[base_uid]["frames"]

    out = Image.new("RGBA", (fw * nframes, fh), (0, 0, 0, 0))
    for name, y0, y1 in BANDS:
        uid = donors[name]
        dw = idx[uid]["frameW"]
        dx = ax - idx[uid]["anchor"]["x"]
        strip = Image.open(LIB / uid / f"{name}.png").convert("RGBA")
        for f in range(nframes):
            cell = strip.crop((f * dw, 0, (f + 1) * dw, strip.height))
            out.alpha_composite(cell, (f * fw + dx, y0))
    out, dropped = prune_floaters(out, fw, nframes)
    if dropped:
        print(f"  pruned {dropped} disconnected px "
              f"(donor silhouettes don't meet at a band seam)")

    png = UNITS / f"{args.id}.png"
    out.save(png)
    manifest = dict(base_meta)
    manifest["id"] = args.id
    manifest["image"] = png.name
    manifest["frameW"] = fw
    manifest["anchor"] = {"x": ax, "y": base_meta["anchor"]["y"]}
    # Palette is shared across the whole roster (flat_m2[23]), so donors are already in
    # register — no remap needed, and index 1 stays the black shadow slot.
    manifest["derivedFrom"] = {k: v for k, v in donors.items()}
    (UNITS / f"{args.id}.json").write_text(json.dumps(manifest, indent=1))
    print(f"composed {args.id}: {fw}x{fh} x{nframes} frames -> {png.relative_to(ROOT)}")
    for b, u in donors.items():
        print(f"    {b:6} <- {u}")
    print("\nnext: python3 tools/aseprite_bridge/plan.py "
          f"local-assets/ffta-scaffold/ffta-units/{args.id}.json")
    return 0


def cmd_batch(args) -> int:
    """Compose every unit in a recipe file: [{id, crown, body, base, note}, ...]."""
    recipes = json.loads(Path(args.recipes).read_text())
    ok = 0
    for r in recipes:
        ns = argparse.Namespace(id=r["id"], crown=r["crown"], body=r["body"], base=r["base"])
        try:
            cmd_compose(ns)
            ok += 1
        except SystemExit as e:
            print(f"  SKIP {r['id']}: {e}", file=sys.stderr)
    print(f"\nbatch: {ok}/{len(recipes)} composed")
    return 0 if ok == len(recipes) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("extract").set_defaults(fn=cmd_extract)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    b = sub.add_parser("batch")
    b.add_argument("recipes", help="JSON list of {id, crown, body, base}")
    b.set_defaults(fn=cmd_batch)
    c = sub.add_parser("compose")
    c.add_argument("--id", required=True, help="new unit id, e.g. ffa_chimera")
    c.add_argument("--crown", required=True, help="donor for y0-8 (head top / crest)")
    c.add_argument("--body", required=True, help="donor for y8-24 (head + torso)")
    c.add_argument("--base", required=True, help="donor for y24-40 (legs + shadow)")
    c.set_defaults(fn=cmd_compose)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
