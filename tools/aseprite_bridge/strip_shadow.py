#!/usr/bin/env python3
"""Strip the hard-painted cast shadow from a unit's staged frame PNGs.

FFTA sprites paint a ground-shadow ellipse at the bottom of each frame in the
unit's darkest opaque color (the same color used for the figure outline, so a
naive whole-frame color-erase would eat the outline). This script detects the
shadow by row: the ground ellipse is solid darkest-color, so its rows are
dark-dominant (>=50% darkest pixels), while body/feet rows hold the figure
interior and are non-dark-dominant. We take the bottom contiguous block of
dark-dominant rows and erase only darkest-color pixels there — colored feet
that share those rows are kept, and the body outline above is untouched.

Run AFTER plan.py and BEFORE assemble_plan.lua:
  python3 tools/aseprite_bridge/strip_shadow.py <rigId> [<rigId> ...]
or pass --all for every staged rig.

Re-running plan.py re-slices the frames from the original sheet (which still
has the shadow), so this step must be re-run after any re-stage.

Edits the staged PNGs in place. Prints per-frame pixel counts so you can see
how much was removed.
"""
from __future__ import annotations
import argparse, glob, os, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "tools" / "_aseprite_stage"


def darkest_opaque(a: np.ndarray) -> np.ndarray | None:
    """Return the RGBA of the lowest-luminance opaque pixel, or None if empty."""
    opaque = a[a[:, :, 3] > 0]
    if len(opaque) == 0:
        return None
    rgb = opaque[:, :3]
    lum = 0.299 * rgb[:, 0] + 0.587 * rgb[:, 1] + 0.114 * rgb[:, 2]
    return opaque[int(np.argmin(lum))]


def shadow_mask(a: np.ndarray) -> np.ndarray:
    """Detect the cast shadow as the bottom block of rows dominated by the
    darkest color, and erase only darkest-color pixels there (colored feet stay).

    The shadow is a solid ground ellipse in the unit's darkest color, so its
    rows are >50% darkest-color. Body/feet rows hold the figure interior
    (non-dark colors), so they are non-dark-dominant. We scan up from the
    silhouette bottom and collect the contiguous block of shadow rows
    (allowing transparent gaps), stopping at the first body/feet row. Only
    darkest-color pixels in those rows are erased — non-dark feet that share
    the shadow rows are kept.

    KNOWN LIMITATION (measured across all 49 named units, 2026-08-15): this is
    not safe to run over the roster as-is. Two failure modes:
      - Misses: for 27 of 49 units the ground ellipse is NOT the darkest color
        (soldier's shadow is the same saturated blue as its outline), so nothing
        is stripped.
      - Damage: most bestiary units (antlion, icedrake, jelly, lamia, malboro,
        toughskin, ...) have no painted cast shadow at all — the dark mass under
        them is their own underside — and this erases legs/feet/hems instead.
        Those units strip on 16/16 frames, including the idle and flinch poses
        which provably carry no shadow.
    Generalizing the color pick (bottom-row dominant color + a squat-band shape
    test) fixes the misses but makes the damage worse, so the shadow needs a
    different signal entirely — likely a per-rig one, since the idle/flinch poses
    give a shadow-free reference of the same unit.
    """
    h, w = a.shape[:2]
    opaque = a[:, :, 3] > 0
    if not opaque.any():
        return np.zeros((h, w), dtype=bool)

    dark = darkest_opaque(a)
    if dark is None:
        return np.zeros((h, w), dtype=bool)
    dark_rgb = np.array(dark[:3])
    is_dark = opaque & (a[:, :, :3] == dark_rgb).all(axis=2)
    if not is_dark.any():
        return np.zeros((h, w), dtype=bool)

    occ_count = opaque.sum(axis=1)          # opaque px per row
    dark_count = is_dark.sum(axis=1)        # darkest px per row
    with np.errstate(invalid="ignore", divide="ignore"):
        frac = np.where(occ_count > 0, dark_count / occ_count, 0.0)

    occupied_rows = np.where(occ_count > 0)[0]
    y_bot = int(occupied_rows.max())
    y_top = int(occupied_rows.min())

    # Walk up from the bottom collecting the shadow block. A row counts as
    # shadow if it's dark-dominant (>=0.5). Transparent rows inside the block
    # are allowed (the ellipse can have a gap); an occupied non-shadow row
    # ends the block. Require the bottom-most occupied row to actually be
    # shadow, else there's no painted shadow here.
    shadow_rows: list[int] = []
    if frac[y_bot] < 0.5:
        return np.zeros((h, w), dtype=bool)  # bottom is body (round monster) — no shadow
    y = y_bot
    gap = 0
    while y >= y_top:
        if occ_count[y] == 0:
            if shadow_rows:
                gap += 1
                if gap > 2:
                    break
                shadow_rows.append(y)
            y -= 1
            continue
        gap = 0
        if frac[y] >= 0.5:
            shadow_rows.append(y)
            y -= 1
        else:
            break

    # A ground ellipse is a band, never a single row. The idle and flinch stances carry
    # no painted shadow at all, but their feet/underside bottom out in the same dark
    # outline colour and would otherwise lose a 1-row sliver. Requiring depth keeps the
    # real ellipse (5-6 rows) and leaves those poses untouched.
    if len(shadow_rows) < 2:
        return np.zeros((h, w), dtype=bool)

    mask = np.zeros((h, w), dtype=bool)
    for y in shadow_rows:
        mask[y] = is_dark[y]
    return mask


def shadow_path(path: Path) -> Path:
    """Sibling file holding just the shadow: f00.png -> f00.shadow.png."""
    return path.with_suffix(".shadow.png")


def strip_frame(path: Path) -> int:
    """Split one staged frame into body + shadow.

    The shadow is not discarded — it moves to `<frame>.shadow.png`, which
    assemble_plan.lua drops onto its own `shadow` layer underneath the art. Flattened,
    that composites to exactly the original frame; kept separate, the cast shadow can be
    hidden, recoloured, or re-timed without touching the unit.
    """
    a = np.array(Image.open(path).convert("RGBA"))
    mask = shadow_mask(a)
    n = int(mask.sum())
    sp = shadow_path(path)
    if n:
        shadow = np.zeros_like(a)
        shadow[mask] = a[mask]
        Image.fromarray(shadow).save(sp)
        a[mask, 3] = 0
        Image.fromarray(a).save(path)
    elif sp.exists():
        sp.unlink()  # stale split from a previous run
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rigs", nargs="*", help="rig ids (staged dirs)")
    ap.add_argument("--all", action="store_true", help="process every staged rig")
    args = ap.parse_args()
    rigs = args.rigs
    if args.all:
        rigs = [p.name for p in STAGE.iterdir() if p.is_dir() and (p / "plan.json").exists()]
    if not rigs:
        print("strip_shadow: no rigs given (pass rig ids or --all)", file=sys.stderr)
        return 1
    for rig in rigs:
        fs = sorted(f for f in glob.glob(str(STAGE / rig / "*" / "*" / "*.png"))
                    if not f.endswith(".shadow.png"))   # don't re-split our own output
        if not fs:
            print(f"{rig}: no staged frames found in {STAGE/rig}", file=sys.stderr)
            continue
        total = 0
        changed = 0
        for f in fs:
            n = strip_frame(Path(f))
            total += n
            if n:
                changed += 1
        print(f"{rig}: stripped {total} shadow pixels across {changed}/{len(fs)} frames")
    return 0


if __name__ == "__main__":
    sys.exit(main())