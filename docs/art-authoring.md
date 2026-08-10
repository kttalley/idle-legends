# Art Authoring & Handoff Spec (Phase 4)

How to author replacement art — hand-drawn (Aseprite), gen-AI derivative, or otherwise —
that drops into the dimetric renderer with **zero code changes**. Every sprite, tile, and
icon is palette-indexed and passes through one import path. Replacing the programmatic
placeholders (or the local-only FFTA scaffold) is a pure file drop.

This spec is the source of truth for anyone drawing art for Stillmarch. It restates, in
authoring terms, the contracts enforced by `src/render/` — see `docs/graphics-spec.md` for
the rendering-system rationale.

---

## 1. The one rule: palette-indexed, semantic slots

Art is drawn against a **16-entry indexed palette**, not in freeform RGB. Slot **meaning**
is fixed so a single drawing recolors into every race / gear tier / rarity / team / biome
by swapping the palette — that is the whole content-multiplier premise (`src/render/
palettes.ts`).

| Slot | Meaning (units) | Meaning (tiles) |
|---|---|---|
| 0 | **transparent** | transparent |
| 1–4 | skin ramp (dark→light) | earth / path ramp |
| 5–8 | primary material (armor/leathers) | vegetation |
| 9–12 | secondary material (cloth/metal trim) | water |
| 13–15 | **accent — the rarity/school signal channel** | stone / cliff |

**Draw with ramps, not flat fills:** put shadow in the low index of a band (e.g. 5), light
in the high (8), so recolors keep their form. **Reserve 13–15 for the accent** — tier glow,
metal, spell-school color. A rig that puts its "shiny bits" in 13–15 expresses rarity
(common→legendary) and spell school for free; one that hardcodes them into 5–8 does not.

Never author two shades into the same slot expecting different colors — each slot is one
color per palette. Keep total unique colors ≤ 16 (slot 0 = transparent).

---

## 2. Frame geometry per rig type

Frames are laid out **left-to-right in a single row**. The importer slices by `frame-w`.

| Rig | Frame (WxH) | Anchor (feet) | Notes |
|---|---|---|---|
| Humanoid | **24×32** | `12,30` | player + humanoid mobs |
| Beast (quadruped) | **28×22** | `14,20` | beast mobs |
| Tile | **32×24** | n/a | bottom 16px = the 2:1 diamond; top 8px = raised detail (rocks/reeds) |
| Icon | **16×16** | n/a | UI icons (§5) |

**Anchor** = the pixel that sits on the ground tile (feet center). The renderer positions
and depth-sorts by it, so keep the character's feet at a consistent anchor across frames or
the sprite will bob/drift.

**Dimetric facing:** author **two facings only** — `se` (front, facing screen-lower-right)
and `ne` (back). The engine mirrors them horizontally to make `sw`/`nw`. So draw the
character facing **screen-left**; the engine flips for screen-right. Don't bake a light
direction that breaks under horizontal mirror (keep it top-lit, not side-lit).

---

## 3. Animation tags & frames

Each rig authors these tags. Frame counts are a guide — any count works; keep the cadence.

| Tag | Loop | Frames (typical) | Purpose |
|---|---|---|---|
| `idle` | yes | 2 | breathing gait — **also drives movement** (see note) |
| `walk` | yes | 2–6 | movement gait (see note) |
| `attack` | no | 3 | swing/cast wind-up→strike |
| `hit` | no | 2 | recoil / flinch on taking damage |
| `death` | no | 2 | collapse → prone (optional; falls back to `hit`) |

> **Movement note:** the adapter currently drives on-map + approach movement with the
> **`idle`** tag, because the placeholder/scaffold `walk` frames read as a jitter. If you
> author a genuinely good `walk`, it's fine to author both — but make `idle` a clean
> standing gait and `walk` a clean stride, and we'll switch movement back to `walk`.

`death` is optional in the manifest; sprites without it fall back to the `hit` recoil, so
you can ship a rig before its KO pose exists.

---

## 4. Manifest format & import

Author the sheet as a normal **RGBA PNG** (transparent background) in Aseprite (or anything).
Then run it through the importer, which quantizes to the indexed format + emits the manifest
`src/render/indexedSprite.ts` loads.

```bash
node tools/importSprite.mjs hero.png public/sprites/units \
  --id hero --frame-w 24 --frame-h 32 --anchor 12,30 \
  --anims "idle:0,1@2;walk:2,3,4,5@8;attack:6,7,8@10!;hit:9,10@10!;death:11,12@6!"
```

- `--anims name:frames@fps[!]` — `!` marks a **non-looping** tag (attack/hit/death).
- Append `/ne` to a tag name for a distinct **back-facing** row; omit it to reuse the `se`
  frames for the back (cheap rigs).
- `--max-colors` defaults to 16; extra colors merge to the nearest kept color with a warning
  (a signal your art broke the 16-color budget).

Output per sprite: `<id>.png` (normalized indexed PNG) + `<id>.json` (manifest):

```json
{
  "id": "hero", "image": "hero.png",
  "frameW": 24, "frameH": 32, "anchor": { "x": 12, "y": 30 },
  "animations": {
    "idle":  { "se": { "frames": [0,1], "fps": 2, "loop": true } },
    "attack":{ "se": { "frames": [6,7,8], "fps": 10, "loop": false } }
  }
}
```

**Aseprite workflow:** work in Indexed color mode with the slot palette loaded (export a
`.pal` from `palettes.ts` `unit/base`), one frame per Aseprite frame, export as a horizontal
sheet (`--sheet`), then import. Staying in Indexed mode with the slot palette means the 16-
color budget and slot semantics are enforced while you draw.

---

## 5. UI icons (emoji → sprite)

UI icons are a **16×16** indexed icon sheet (one row of frames), drawn mostly in the accent
channel (13–15) so a rarity/school palette tints them. A `SpriteIcon` component renders a
frame by semantic key; an emoji→frame map lets existing emoji-labelled data resolve to a
sprite, falling back to the emoji glyph when no sprite exists (so adoption is incremental).
Author new icons into the same sheet and add the key to the map — no component changes.

---

## 6. File-drop replacement policy

- **Shippable default is programmatic** (`src/render/placeholderArt.ts`). It is deleted only
  when real art covers a rig.
- **Real art** lands in `public/sprites/{units,tiles,icons}/` as `<id>.png`+`<id>.json`; the
  loader (`loadSpriteOrPlaceholder`) prefers a manifest when present, else the placeholder.
- **The FFTA scaffold is local-only** (`local-assets/`, gitignored) — a dev aid for judging
  animation/perspective, **never shipped**. The game must ship with zero scaffold-derived
  pixels; replacement comes from gen-AI derivatives first, then hand-drawn.
- **Additive packs:** multiple manifests merge, so a seasonal/skin pack is new manifest
  entries + new palette ids — no code. This same path is the future paid-cosmetic pipeline.

---

## 7. Checklist before handing art in

- [ ] Correct frame size + anchor for the rig type (§2).
- [ ] ≤ 16 colors, drawn on the semantic slots; accent (13–15) reserved for the signal (§1).
- [ ] Two facings (`se`, `ne`) drawn screen-left; survives horizontal mirror; top-lit (§2).
- [ ] All required anim tags present with sane fps; non-looping tags marked `!` (§3).
- [ ] Runs clean through `importSprite.mjs` with no color-merge warnings (§4).
- [ ] Drops into `public/sprites/…` and renders in the dev harness without code changes (§6).
