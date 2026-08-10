# spritegen — Windows rig setup

Sprite generation pipeline for Stillmarch. Runs on the dual-3090 box; the rest of the
repo is platform-agnostic. Architecture and decisions live in [CLAUDE.md](./CLAUDE.md) —
read that first.

## One-time setup

```powershell
git clone https://github.com/kttalley/idle-legends.git
cd idle-legends
npm install                       # pngjs is the only dep the sprite tools need
copy tools\spritegen\config.example.json tools\spritegen\config.json
node tools\spritegen\rig.mjs      # regenerate the mannequin (outputs are committed, but verify)
```

`local-assets/` is gitignored and will not exist on a fresh clone. Create the work dirs:

```powershell
mkdir local-assets\spritegen\concepts
mkdir local-assets\spritegen\quantized
```

## ComfyUI, two instances

Use ComfyUI rather than A1111/Forge: the value here is a reproducible graph run hundreds of
times, and its HTTP API lets `comfy.mjs` drive it headlessly next to the existing Node
tooling. StabilityMatrix can install it; these commands assume its default package path.

ComfyUI does **not** split one generation across GPUs. Throughput comes from two servers,
one pinned per card:

```powershell
# terminal 1 — GPU 0
$env:CUDA_VISIBLE_DEVICES=0; python main.py --port 8188

# terminal 2 — GPU 1
$env:CUDA_VISIBLE_DEVICES=1; python main.py --port 8189
```

Both ports go in `config.json`; `comfy.mjs` round-robins across them.

## Models

Fill the exact filenames from ComfyUI's dropdowns into `config.json`. Needed:

- an **SDXL-class checkpoint** — stylized/illustrative works better than photoreal here
- **ControlNet lineart** (SDXL) — conditioned on `rig/mannequin_*_lineart_24x32.png`
- **ControlNet depth** (SDXL) — conditioned on `rig/mannequin_*_depth_24x32.png`

Upscale the 24×32 rig images to the generation resolution with **nearest-neighbour** before
using them as conditioning. Bilinear smears the silhouette and the pose stops reading.

On Ampere there is no fp8 acceleration, so Flux is slow enough to break the
iterate-and-discard loop. SDXL is the practical choice; revisit only if a batch of 12 stops
being ~a minute.

## Workflow

```
rig/ ──► ComfyUI (Stage A) ──► local-assets/spritegen/concepts/
              │
              └──► quantizeToSlots.mjs (Stage B) ──► local-assets/spritegen/quantized/
                          │
                          └──► Aseprite cleanup (~20–40 min/unit)
                                      │
                                      └──► importSprite.mjs ──► public/sprites/units/
```

`importSprite.mjs` is the permanent entry point for **all** art — generated, hand-drawn, or
scaffold. Do not add a second path into the engine.

Example import once a 13-frame sheet exists:

```powershell
node tools\importSprite.mjs local-assets\spritegen\quantized\hero_vanguard.png public\sprites\units `
  --id hero_vanguard --frame-w 24 --frame-h 32 --anchor 12,30 `
  --palette "#5c3a24,#8a5c38,#c08a58,#e8b888,#3a2818,#5c4028,#7c5838,#9c7048,#2c2c34,#44444e,#5c5c68,#787884,#4a4a52,#8a8a96,#c8c8d4" `
  --anims "idle:0,1@4;walk:2,3,4,5@8;attack:6,7,8@10!;hit:9,10@12!;death:11,12@6!"
```

Passing `--palette` explicitly is what preserves slot semantics — without it the importer
frequency-ranks colors and the recolor system gets meaningless slots.

## Checking the result

`npm run dev` and look at the unit in-world at 3×. 24×32 art only tells the truth in
motion — a sheet that looks fine as stills routinely falls apart when animated.
