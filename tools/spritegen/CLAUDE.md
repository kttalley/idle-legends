# Sprite generation — session brief

You are working in `tools/spritegen/` on the **Windows generation rig** (dual RTX 3090,
StabilityMatrix). This file is the handoff from the planning session on macOS. Read it
before touching anything; it encodes decisions that are expensive to re-derive and one
guardrail that is a launch blocker.

## Mission

Produce original, production-ready unit sprites for Idle Legends in the engine's authored
format, replacing the FFTA dev scaffold before launch (PLAN.md:186).

## Hard constraints (from the engine, not negotiable)

| Constraint | Value | Source |
|---|---|---|
| Frame size | 24×32 (heroes) | `public/sprites/units/hero_*.json` |
| Sheet layout | horizontal strip, 13 frames (`312×32`) | same |
| Anchor | `12, 30` (feet) | same |
| Facings | `se` + `ne` (renderer flips for the other two) | `src/render/animation.ts` |
| Animations | `idle, walk, attack, hit, death` | `importSprite.mjs` |
| **Colors** | **15 + transparent, in semantic slots** | `src/render/palettes.ts` |

**The palette slot contract is the whole ballgame.** Slots are `1–4 skin · 5–8 primary ·
9–12 secondary · 13–15 accent`, and accent is *reserved as the rarity-signal channel*.
The game's entire variant and monetization system (race, gear tier, rarity, elite,
prismatic) is runtime recoloring of those slots. A sprite whose colors aren't correctly
slotted still imports and still renders — but it cannot be recolored, so it cannot become
a SKU. See `refPalette.json`.

## Guardrails

1. **Never use the FFTA sheets in `local-assets/ffta-scaffold/` as img2img or ControlNet
   input.** At low denoise the source survives into the output as derivative work, and
   PLAN.md commits to shipping zero scaffold-derived pixels. Use them as *measurement*
   reference only (proportions, ramp widths, frame budgets). The rig in `rig/` is a better
   conditioning input anyway — it is already exactly our dimensions and camera.
2. **`local-assets/` is gitignored and must stay that way.** Generated intermediates go
   there. Only finished, original sprites land in `public/sprites/units/`.
3. **`config.json` is machine-local** (gitignored). `config.example.json` is the template.

## Why not just img2img the sprite sheets

Settled in planning; don't relitigate:

- **SD cannot generate 24×32.** It works in 8×-downscaled latent space — 24×32 is a 3×4
  latent. "Pixel art" checkpoints generate at 512–1024 and only *look* pixelly; they carry
  thousands of colors, anti-aliasing, an inconsistent grid, and dirty alpha. Downscaling
  that to 24×32 is mush.
- **Frame coherence is the killer.** 13 independently generated frames = 13 slightly
  different characters. Animation needs the same character to the pixel.
- **No slot awareness.** SD has no concept of "this region is `secondary2`."

## The pipeline

**Stage A — Concept (SD, high-res, ONE pose per unit).**
768×1024, canonical dimetric 3/4 pose. ControlNet lineart + depth fed from `rig/`. Batch
12–16 variants, pick winners. Prompt toward flat broad color regions, not painterly
rendering. This is what the two 3090s are for.

**Stage B — Downres + slot quantization** (`quantizeToSlots.mjs` — TO BUILD).
Deterministic, not img2img. Area-downsample to 24×32, cluster to 15 colors, map clusters →
semantic slots by voting against `rig/zonemap.json`, then feed `importSprite.mjs --palette`.
Expect a ~20–40 min Aseprite cleanup per unit after this. **Fully-automatic concept →
shippable 24×32 is not achievable today** — AI gets the design and color story, you own
the pixels. Plan around that, don't fight it.

**Stage C — Animation is procedural, NOT generated.** Author one base frame per unit;
derive the other 12 by **integer-pixel translation of the rig's body zones** (bob, step,
lean, recoil, fall). Whole-pixel only — rotation and scale shear the pixel grid and look
wrong at this size. Attack's weapon arc is a **separate 2–3 frame overlay layer**
independent of the body, which also makes weapon type a swappable content axis.

This is the project's "one rig × N palettes" premise moved up a level: **one rig × N base
poses × N palettes.** Adding a unit becomes 1 concept + 1 cleanup + zero animation work.

**Stage D — Never bake palettes.** Author in `refPalette.json` colors only; the registry
in `src/render/palettes.ts` does all variety at runtime.

## What already exists

- `rig.mjs` → `rig/` — the 24×32 mannequin, **regenerate with `node tools/spritegen/rig.mjs`**.
  Emits silhouette / lineart / depth / zones per facing, plus `zonemap.json` (the data the
  quantizer consumes) and 10× previews. Original authored geometry, no traced pixels.
  Standalone — unlike the old `tools/scaffold/ffta_mannequin.py`, it needs no decomp repo.
- `refPalette.json` — the 16-slot authoring contract.
- `config.example.json` — copy to `config.json` and fill in model filenames.

### Rig quality note

The previous mannequin (`local-assets/templates/`) was rejected: front elevation instead
of dimetric 3/4, ~5.5 heads instead of ~3.5, 1px arms fused to the torso, no facing cue.
The current rig fixes the camera (asymmetric shoulder line, offset head, staggered feet —
near geometry renders lower), proportions, and limb separation. **It is still procedural
geometry and deserves a hand pass in Aseprite before it conditions 30 units.** If you
hand-edit it, edit the PNGs and regenerate `zonemap.json` to match, or update the span
tables in `rig.mjs` so the two never drift apart.

## What to build next, in order

1. **`comfy.mjs`** — ComfyUI HTTP client (`POST /prompt`, poll `/history/{id}`, fetch
   `/view`). Round-robin across the two instances in `config.json`.
2. **`graphs/concept.json`** — the ComfyUI workflow, exported via *Save (API Format)*.
   Model filenames are unknown from macOS; fill them in on the rig.
3. **`quantizeToSlots.mjs`** — per Stage B. Emit a debug overlay showing cluster→slot
   assignment and support a `--map "0:5,1:6"` manual override; the automatic vote will be
   wrong sometimes and a human needs to correct it cheaply.
4. **`deform.mjs`** — per Stage C. Shared animation table of per-zone integer offsets.

## Rig setup notes

ComfyUI will not split one generation across two GPUs — throughput comes from **two
instances**, one per card (`CUDA_VISIBLE_DEVICES`), with a queue in front. See `README.md`.
On Ampere (no fp8 acceleration) **SDXL-class is the sweet spot**; Flux is too slow for the
iterate-and-discard loop this pipeline depends on.

## The gate

Prove the whole chain on **one hero** (`hero_vanguard`) before generalizing: rig →
concept → quantize → `importSprite` → in-game at 3×. If it reads correctly in motion and
recolors cleanly across three palettes, the pipeline is real and the rest is throughput.
If it doesn't, you've spent a day instead of a month. **Do not batch 30 units before this
gate passes.**
