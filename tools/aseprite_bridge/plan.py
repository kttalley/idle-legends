#!/usr/bin/env python3
"""Plan an Aseprite assembly from a Stillmarch rig manifest.

Reads a manifest + its companion PNG, then writes:
  - tools/_aseprite_stage/<rig>/<anim>/<facing>/<frame>.png  (per-frame RGBA slice)
  - tools/_aseprite_stage/<rig>/plan.json                     (machine plan for the
    pixel-mcp driver)

Layer split: we don't have body-part masks, so the converter initially ships a single
`pixel` layer per anim+frame. The schema is forward-compatible: the plan reserves
`outline/body/accent/highlight` as a *named layer stack* so the pixel-mcp driver can
later drop per-region slices in (the dev can then re-color via Aseprite's layer palette
override without re-running this script).

Animation tags come from the manifest's `animations` table, facings se/ne — but the
anim *names* in that table are wrong and get remapped here; see CANONICAL_REMAP below.
Runs of identical consecutive frames are collapsed to one frame whose duration carries
the run's full hold time, so playback matches the source while the timeline stays
editable. `loop` direction is `forward` for looping tags, `forward` for non-looping too
(Aseprite `play_once` is a sprite-level property, not a tag-level one — we set it via
the manifest's loop flag at import time).
"""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from PIL import Image
except ImportError:
    print("plan.py: Pillow not installed; pip install pillow", file=sys.stderr)
    raise

# Layer stack reserved for every rig (bottom -> top). The plan carries these names so
# the pixel-mcp driver can spawn them up front; the converter currently populates only
# the `pixel` layer, but downstream tooling (color-ramp re-paint, region split) can
# drop per-region slices into the empty layers without changing the schema.
LAYER_STACK = ["outline", "body", "accent", "highlight", "pixel"]

# ---------------------------------------------------------------------------
# Anim naming
#
# export_ilpack.py now emits correctly-named animations straight from the ROM's 24-entry
# pose table (walk / attack / cast / flinch / kneel / ko / ready / jump), so this layer no
# longer remaps anything. It only derives the one animation the ROM does not ship.
#
# There is no idle pose anywhere in the pose table. Poses 0-3 are the same walk cycle in
# four facings, 4/5 the flinch, 6/7 a kneel, 10/11 a KO, 12/13 the beast attack, 14/15 the
# humanoid weapon swing, 22/23 a jump. Measurement settles that the cycle is a walk and
# not a breathing idle: between frames the legs change by 30-40 mean levels while head and
# torso change by ~0 (ratio 70-99x), plus a 1px whole-body bob.
#
# `idle` is therefore derived from the walk cycle's frame A, which carries the narrowest
# leg stance (legs together) in 47 of 49 units — the cycle's own rest pose, and what a
# stationary unit reads as. It is a derived tag, not a pose the ROM ships.
IDLE_FROM = ("walk", slice(0, 1))

# Order tags appear on the timeline. Anything the manifest has that is not listed here is
# appended afterwards, so a new pose showing up in a future export is never silently lost.
TAG_ORDER = ["idle", "walk", "attack", "cast", "ready", "flinch", "kneel", "ko", "jump"]

# Rate per destination anim. The manifest's fps is the engine's base tick; per-frame holds
# come from run-collapsing below, so these only set the tick.
DEST_FPS = {"idle": 3}


def collapse_runs(indices: List[int], frame_key, frame_ms: int) -> Tuple[List[int], List[int]]:
    """Collapse runs of identical consecutive frames into one frame each.

    Returns (kept sheet indices, per-frame durations in ms). A run of N identical frames
    becomes a single frame held for N * frame_ms, so the collapsed tag plays for exactly
    as long as the source did — the flinch's 8x repeated stance becomes one frame with an
    8-frame hold rather than eight duplicate cels.
    """
    kept: List[int] = []
    durs: List[int] = []
    for idx in indices:
        if kept and frame_key(idx) == frame_key(kept[-1]):
            durs[-1] += frame_ms
        else:
            kept.append(idx)
            durs.append(frame_ms)
    return kept, durs


def remapped_tags(m: Dict) -> List[Tuple[str, str, List[int], int, bool]]:
    """Yield (anim, facing, sheet frame indices, fps, loop) in timeline order."""
    anims = m["animations"]
    out: List[Tuple[str, str, List[int], int, bool]] = []

    src_anim, sl = IDLE_FROM
    if src_anim in anims:
        for facing in ("se", "ne"):
            defn = anims[src_anim].get(facing)
            if defn:
                out.append(("idle", facing, list(defn["frames"])[sl],
                            DEST_FPS.get("idle", defn["fps"]), True))

    ordered = [a for a in TAG_ORDER if a in anims and a != "idle"]
    ordered += [a for a in anims if a not in TAG_ORDER and a != "idle"]
    for anim_name in ordered:
        for facing, defn in anims[anim_name].items():
            if not defn:
                continue
            out.append((anim_name, facing, list(defn["frames"]),
                        DEST_FPS.get(anim_name, defn["fps"]), bool(defn.get("loop", True))))
    return out


def hex_palette(kept: List[str]) -> List[str]:
    """Normalize the manifest's sourcePalette (slot 0 is '', others are '#rrggbb').
    Returns 16 entries: index 0 = 'transparent', 1..15 = the manifest entries."""
    out = ["transparent"]
    for h in kept[1:]:  # skip the empty slot 0
        if h == "" or h is None:
            out.append("#000000")
        else:
            out.append(h.lower() if h.startswith("#") else f"#{h.lower()}")
    while len(out) < 16:
        out.append("#000000")
    return out[:16]


def slice_frames(sheet: Image.Image, frame_w: int, frame_h: int) -> List[Image.Image]:
    """Slice the sheet into per-frame RGBA images, left-to-right then top-to-bottom."""
    cols = sheet.width // frame_w
    rows = sheet.height // frame_h
    frames: List[Image.Image] = []
    for r in range(rows):
        for c in range(cols):
            box = (c * frame_w, r * frame_h, (c + 1) * frame_w, (r + 1) * frame_h)
            frames.append(sheet.crop(box))
    return frames


def plan_for_rig(manifest_path: Path) -> dict:
    m = json.loads(manifest_path.read_text())
    sheet_path = manifest_path.parent / m["image"]
    sheet = Image.open(sheet_path).convert("RGBA")
    fw, fh = m["frameW"], m["frameH"]
    frames = slice_frames(sheet, fw, fh)
    palette = hex_palette(m["sourcePalette"])

    rig_id = m["id"]
    stage = Path(__file__).resolve().parents[1] / "_aseprite_stage" / rig_id
    if stage.exists():
        # Wipe prior staging so re-runs don't accumulate stale frame PNGs.
        for p in stage.rglob("*"):
            if p.is_file():
                p.unlink()
    stage.mkdir(parents=True, exist_ok=True)

    plan: Dict = {
        "rigId": rig_id,
        "frameW": fw,
        "frameH": fh,
        "anchor": m["anchor"],
        "palette": palette,
        "layerStack": LAYER_STACK,
        "tags": [],
        "frames": [],
    }

    # Frame identity for run-collapsing: compare the raw pixels of the sheet slice.
    frame_bytes = [f.tobytes() for f in frames]

    # Emit one tag per (anim, facing) pair, using the corrected anim names.
    for anim_name, facing, tag_frames, fps, loop in remapped_tags(m):
        tag_name = f"{anim_name}-{facing}"
        in_range = [i for i in tag_frames if i < len(frames)]
        for i in tag_frames:
            if i >= len(frames):
                print(f"plan: {rig_id} {tag_name} frame {i} out of range "
                      f"(sheet has {len(frames)}); skipping", file=sys.stderr)
        frame_ms = max(1, round(1000 / fps))
        kept, durs = collapse_runs(in_range, lambda i: frame_bytes[i], frame_ms)
        tag_dir = stage / anim_name / facing
        tag_dir.mkdir(parents=True, exist_ok=True)
        tag_frame_paths: List[Path] = []
        for fi, fidx in enumerate(kept):
            fp = tag_dir / f"f{fi:02d}.png"
            frames[fidx].save(fp)
            tag_frame_paths.append(fp)
        plan["tags"].append({
            "name": tag_name,
            "anim": anim_name,
            "facing": facing,
            "fps": fps,
            "loop": loop,
            "frameCount": len(tag_frame_paths),
            "framePaths": [str(p.relative_to(stage)) for p in tag_frame_paths],
            "durationsMs": durs,
            "sourceFrames": kept,
        })

    # A flat list of all unique frame PNGs in dependency order, so the driver can
    # stream-import without re-scanning.
    seen = set()
    for t in plan["tags"]:
        for p in t["framePaths"]:
            if p not in seen:
                plan["frames"].append(p)
                seen.add(p)

    (stage / "plan.json").write_text(json.dumps(plan, indent=2))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", nargs="+", help="One or more manifest JSON files")
    args = ap.parse_args()
    for m in args.manifest:
        plan = plan_for_rig(Path(m))
        n_frames = sum(t["frameCount"] for t in plan["tags"])
        print(f"{plan['rigId']}: {n_frames} frames across {len(plan['tags'])} tags "
              f"-> _aseprite_stage/{plan['rigId']}/plan.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
