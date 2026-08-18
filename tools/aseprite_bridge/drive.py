#!/usr/bin/env python3
"""Drive pixel-mcp to assemble an Aseprite file for a Stillmarch rig.

This is the orchestrator that takes a plan.json (produced by plan.py) and emits a
sequence of pixel-mcp tool calls. The plan.py -> drive.py split keeps the
schema deterministic in plain Python and the tool I/O in a separate thin file
(the user can swap pixel-mcp for any other Aseprite API without re-deriving the
layout math).

Usage:
  # Drive a single rig:
  python3 tools/aseprite_bridge/drive.py ffa_bomb

  # Or pass a plan.json path directly:
  python3 tools/aseprite_bridge/drive.py tools/_aseprite_stage/ffa_bomb/plan.json

The output Aseprite file lands at:
  tools/_aseprite_output/<rigId>.aseprite

This script is meant to be **run by an LLM via the pixel-mcp tool** (it doesn't
itself shell out — it prints a recipe of calls, in execution order, that the
agent then invokes). The recipe is also saved as JSON next to the plan for
replay.
"""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[2]  # idle-legends/ (this file is at tools/aseprite_bridge/drive.py)
STAGE = ROOT / "tools" / "_aseprite_stage"
OUT = ROOT / "tools" / "_aseprite_output"
OUT.mkdir(parents=True, exist_ok=True)

# ---- tool name resolver (kept in one place so swapping MCPs is mechanical) ----
T = {
    "create_canvas":   "create_canvas",
    "set_palette":     "set_palette",
    "add_layer":       "add_layer",
    "add_frame":       "add_frame",
    "import_image":    "import_image",
    "set_frame_duration": "set_frame_duration",
    "create_tag":      "create_tag",
    "save_as":         "save_as",
}


def frame_ms(fps: int) -> int:
    return max(1, round(1000 / fps))


def build_recipe(plan: Dict[str, Any], sprite_path: str) -> List[Dict[str, Any]]:
    """Build the ordered list of pixel-mcp tool calls to assemble one Aseprite file."""
    fw, fh = plan["frameW"], plan["frameH"]
    palette = plan["palette"]
    if palette[0].lower() in ("transparent", "#transparent", "00000000"):
        # Indexed PNGs use alpha, not the slot 0 entry, for transparency. Force a
        # neutral color so Aseprite's palette editor still shows something.
        palette[0] = "#000000"
    out_path = sprite_path

    calls: List[Dict[str, Any]] = []
    # 1. canvas — default to RGB so per-cel alpha from import_image survives the round-trip
    # to PNG. Indexed mode flattens alpha into the palette and Aseprite's PNG export doesn't
    # add a tRNS chunk unless the sprite's "background color" property is set (a property
    # pixel-mcp doesn't expose). The 16-slot palette stays as a reference the artist sees
    # in the Palette panel either way; the *sprite data* is RGB and exports with real alpha.
    color_mode = plan.get("colorMode", "rgb")
    calls.append({
        "tool": T["create_canvas"],
        "args": {"width": fw, "height": fh, "color_mode": color_mode},
        "stage": "canvas",
    })
    # 2. palette
    calls.append({
        "tool": T["set_palette"],
        "args": {"sprite_path": "__SPRITE__", "colors": palette},
        "stage": "palette",
    })
    # 3. layer
    calls.append({
        "tool": T["add_layer"],
        "args": {"sprite_path": "__SPRITE__", "layer_name": "pixel"},
        "stage": "layer",
    })
    # 4. save-as to the output path (so the temp /tmp path is durable)
    calls.append({
        "tool": T["save_as"],
        "args": {"sprite_path": "__SPRITE__", "output_path": out_path},
        "stage": "save",
    })

    # 5. for each frame: import the right PNG
    # frame index 1 = the first frame; subsequent frames need add_frame first
    flat_frames: List[str] = []  # ordered list of PNG paths (relative to stage)
    for tag in plan["tags"]:
        flat_frames.extend(tag["framePaths"])

    for i, rel in enumerate(flat_frames):
        frame_num = i + 1
        if frame_num > 1:
            calls.append({
                "tool": T["add_frame"],
                "args": {"sprite_path": "__SPRITE__", "duration_ms": 100},
                "stage": f"add_frame_{frame_num}",
            })
        # Find the tag this frame belongs to for its duration. plan.py collapses runs
        # of identical frames and records the resulting per-frame hold in durationsMs;
        # fall back to the tag's fps for plans written before that (keep in sync with
        # assemble_plan.lua, which resolves durations the same way).
        ms = 0
        for tag in plan["tags"]:
            if rel in tag["framePaths"]:
                durs = tag.get("durationsMs")
                ms = durs[tag["framePaths"].index(rel)] if durs else frame_ms(tag["fps"])
                break
        calls.append({
            "tool": T["import_image"],
            "args": {
                "sprite_path": "__SPRITE__",
                "image_path": str(STAGE / plan["rigId"] / rel),
                "layer_name": "pixel",
                "frame_number": frame_num,
                "position": {"x": 0, "y": 0},
            },
            "stage": f"import_{frame_num}",
        })
        if ms:
            calls.append({
                "tool": T["set_frame_duration"],
                "args": {"sprite_path": "__SPRITE__", "frame_number": frame_num, "duration_ms": ms},
                "stage": f"duration_{frame_num}",
            })

    # 6. tags
    cursor = 1
    for tag in plan["tags"]:
        n = tag["frameCount"]
        calls.append({
            "tool": T["create_tag"],
            "args": {
                "sprite_path": "__SPRITE__",
                "tag_name": tag["name"],
                "from_frame": cursor,
                "to_frame": cursor + n - 1,
                "direction": "forward",
            },
            "stage": f"tag_{tag['name']}",
        })
        cursor += n

    # 7. clean up the default 'Layer 1' is left intact (Aseprite always has at
    # least one layer; deleting the second empty one is purely cosmetic)

    return calls


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rig", help="rig id (matches <rig>.json in ffta-units) OR a plan.json path")
    ap.add_argument("--out", help="Override output .aseprite path")
    args = ap.parse_args()

    if args.rig.endswith("plan.json"):
        plan_path = Path(args.rig)
    else:
        plan_path = STAGE / args.rig / "plan.json"
    if not plan_path.exists():
        print(f"drive: plan not found at {plan_path} (run plan.py first)", file=sys.stderr)
        return 1
    plan = json.loads(plan_path.read_text())
    out_path = args.out or str(OUT / f"{plan['rigId']}.aseprite")
    calls = build_recipe(plan, out_path)

    # Save the recipe so an LLM (or a replay script) can drive it deterministically.
    recipe_path = STAGE / plan["rigId"] / "recipe.json"
    recipe_path.write_text(json.dumps({
        "rigId": plan["rigId"],
        "outPath": out_path,
        "planPath": str(plan_path),
        "calls": calls,
    }, indent=2))

    # Print a short summary so the user can see what the run will do.
    n_import = sum(1 for c in calls if c["tool"] == T["import_image"])
    n_tag = sum(1 for c in calls if c["tool"] == T["create_tag"])
    n_frame = sum(1 for c in calls if c["tool"] == T["add_frame"])
    print(f"{plan['rigId']}: {len(calls)} calls "
          f"({n_import} imports, {n_frame} add_frame, {n_tag} tags) -> {out_path}")
    print(f"  recipe: {recipe_path}")
    print("  Drive it by invoking the pixel-mcp tool in the order shown in recipe.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
