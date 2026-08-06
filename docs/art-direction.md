# Idle Legends — Rebrand Art Direction & Production Plan

Fresh sprite set inspired by the reference form · zero FFTA pixels · zero code changes.

Produced by a verified multi-agent pass: 10 rig specs each adversarially checked
(ASCII grids counted row-by-row, channel discipline checked pixel-against-slot-map,
anchors and animation tables checked against the engine contract), plus independent
cross-checks for coverage completeness, manifest schema vs the real loader, and IP-name
collisions against the repo.

**Headline decisions (highest confidence first):**

- **World identity:** *The Lastlight Concord* (blue, forged, vertical) vs *The Ashmarch*
  (ember, scavenged, jagged); the tauren race displays as **Hornborn** (the palette
  registry already ships `race/hornborn`).
- **Rig economy:** 4 humanoid body archetypes cover all 8 races; **5 hero rigs + 12–13
  monster rigs (17 sheets MVP, 18 full)** cover every legal race×class combo, all 13 named
  monsters, and all 20 mob keyword pools. Verified complete against `fftaRoster.ts`,
  `races.ts`, `classes.ts`.
- **Faction lives in slots 9–12, race in 1–4, gear tier in 5–12, rarity/school in 13–15 —
  never anywhere else.** Every rig below was mechanically verified against that channel
  discipline.
- **Three engine/tooling facts discovered during verification** (all load-bearing):
  1. `tools/importSprite.mjs` **rejected the `death` tag** (`parseAnims` hardcoded
     idle/walk/attack/hit) even though `art-authoring.md` documents it and `types.ts`
     supports it. Fixed (one line) as part of this rebrand pass.
  2. `Animator.def()` has **no ne→se fallback** — a manifest missing an `ne` key crashes
     when a unit faces north. Cheap rigs must *repeat* the se def under `ne` (which the
     importer does automatically). Only the whole `death` tag may be omitted.
  3. `palettes.ts` **`biome/map080` is decoded straight from the FFTA ROM** — it must be
     replaced with an original grassland ramp (or removed) before submission.

---

## 1. Visual Identity Brief

### Tone

Idle Legends is a long war remembered mid-fight: melancholy, weathered, dutiful — soldiers
who have marched too far to turn back. In pixels: a cool, dusk-leaning world palette with
desaturated mid-tones; **saturation is spent, not ambient** — the only vivid notes on
screen are faction trim (9–12) and the rarity/spell accent (13–15), so every bright pixel
is information. Contrast comes from value, not hue: strong top-down light, deep grounded
shadows at the feet, ramps that run genuinely dark at the low index. Silhouettes are heavy
and planted — big heads (~1/3 height), small feet, low centers of gravity — proud but
tired, never bouncy.

### World names (internal ids never change)

- **alliance → "The Lastlight Concord"** — motto: *"Hold the last light."* Oath-bound
  kingdoms defending what remains.
- **horde → "The Ashmarch"** — motto: *"Ash behind us, fire ahead."* Survivors forged into
  an unstoppable column.
- **tauren → "Hornborn"** — keep the incumbent; `race/hornborn` already ships and carries
  the right stoic, earth-old weight.

### Faction visual identity

**Hard rule for both:** the faction read lives ENTIRELY in the secondary trim ramp 9–12,
so a team swap is one ramp. Primary 5–8 stays gear-tier material; 13–15 is never faction.
Emblems must be left-right symmetric (mirror rule) and read at 16 px.

| | The Lastlight Concord | The Ashmarch |
|---|---|---|
| 9–12 ramp | cold steel-blue resolving to the existing `#4a90d9` at the light end (`#1e3a5c → #2f5d94 → #4a90d9 → #8fc0ee`) | ember around the existing `#c0392b` (`#4a1f18 → #8c2a1e → #c0392b → #e8763a`) |
| Materials | forged & fitted — riveted plate, wool tabards, oiled straps, lantern glass; hard specular pixels only on top planes | scavenged & lashed — hide, bone, hammered black iron, charred wood, rope; 1px chips and notches on edges |
| Shape language | vertical & rectangular — upright spears, kite/tower shields, straight banner poles | horizontal & jagged — wide pauldrons, round hide shields, tusk-curved blades, torn banner hems |
| Emblem (5–7 px, symmetric) | four-point beacon star (diamond with vertical flare) | rising flame over a broken ring |

### Race silhouettes — four body archetypes (all on 24×32, anchor 12,30)

Race identity survives as skin-ramp swap (1–4) first; silhouette cues are **baked
head/posture forks** (separate sheets reusing the archetype's frame timing), never new
archetypes.

- **MEDIUM** (~28–29 px tall, shoulders ~10 px): **human** (canonical), **elf** (pure
  palette — moonlit-pale ramp; optional 1–2 px ear-tip fork [Speculative]), **troll**
  (palette ramp teal/moss + a tusk/hunch head fork at full tier).
- **STOCKY** (~24 px, near-full 20 px width, no visible neck): **dwarf** only. Braided
  beard mass as a second chin-to-belt shape; 4–5 px legs.
- **MASSIVE** (~30–31 px, shoulders near frame edges, head sunk into torso): **orc**
  (canonical), **hornborn** (horn/muzzle head fork at full tier).
- **SMALL** (~20–21 px, head fully ½ of height): **gnome** (canonical), **goblin** (long
  swept-back-ear head fork; acid-green ramp).

> **Reconciliation note (MVP vs full tier):** rig verification correctly enforced that
> *nothing in the engine mandates* head forks — race must first survive as a pure 1–4
> palette swap, and that is the **ship-today MVP path for every race**. The forks above
> (troll tusks, hornborn horns, goblin ears) are **full-tier design goals**: separate baked
> sheets (e.g. `hero_colossus_hornborn`) that reuse the base rig's frame timing exactly.

### Class silhouettes (survive every race/gear/faction recolor)

- **Warrior:** oversized blade breaking the silhouette, wide planted stance, closed plate
  outline. Idle = slow shoulder-and-blade counter-rise. Accent 13–15 = blade edge + eye
  glint — *the rarity ramp literally is the steel*.
- **Mage:** staff a head taller than the sprite with a lit head; unbroken triangular robe
  base (no leg gap). Idle = upright drift. Accent = staff crystal + casting-hand glow
  (school = accent palette).
- **Rogue:** twin daggers low at the hips, forward crouch (head ahead of feet column),
  hood + short cape with open gaps under the arms. Idle = coiled weight shift. Accent =
  dagger blades + 1 px poison-drip glint.
- **Warlock:** hunched spine, jagged tattered hem (the anti-mage), no staff; one raised
  hand cradling a floating 2–3 px mote off the body. Idle = the mote bobs, not the body.
  Accent = the mote + both eyes — the class whose accent floats free of the sprite.

---

## 2. Sprite Coverage Plan

Verified complete by an independent cross-check: **all 23 legal race×class combos**
(intersection of `allowedRaces`/`allowedClasses` — the two files agree), **all 32
`HERO_SPRITES` cells** (including the 9 unreachable ones, so the swap compiles with zero
structural change), **all 13 `MONSTER_SPRITES` ids**, **all 20 `MOB_KEYWORDS` pools**, and
**all 47 unique `ffa_*` ids**.

### 2.1 Hero coverage (23 legal combos → 5 rigs)

Skin = `race/*` (1–4) · gear tier = `gear/t1..t4` (5–12, rarity via `gear/tX+rarity`,
13–15 only) · faction = 9–12 override composed over the tier · class school = 13–15. Held
props are **baked into rigs** (a different weapon silhouette is a different rig).

| Race | warrior | mage | rogue | warlock |
|---|---|---|---|---|
| human | hero_vanguard | hero_magus | hero_shade | hero_magus (dark 9–12, thorn staff/mote, purple accent) |
| dwarf | hero_vanguard ⚠ | — | hero_shade ⚠ | — |
| elf | hero_vanguard | hero_magus | hero_shade | — |
| orc | hero_colossus | — | hero_shade | hero_magus |
| troll | hero_colossus | hero_magus | hero_shade | hero_magus |
| goblin | — | hero_cogling | hero_cogling | hero_cogling |
| gnome | — | hero_cogling | hero_cogling | hero_cogling |
| tauren | hero_colossus (`race/hornborn`) ⚠ | — | — | — |

⚠ = weak read flagged: dwarf stockiness and hornborn horns are structural, not palette.
[Speculative] fixes, in priority order: a `hero_stoutguard` stocky variant (~24×28)
covering both dwarf combos; a horned-head frame pass on the colossus sheet for hornborn.
Ship the palette-only path first; add forks on observed complaints.

The mage/warlock split on one `hero_magus` rig is 9–12 (darkened trim) + 13–15 (school) +
focus swap (staff vs raised hand + floating mote) — verify the two reads stay distinct at
t1 where no rarity glow helps.

### 2.2 Monster coverage — 13 named archetypes

| Old id | New rig | Frame | Status | Design |
|---|---|---|---|---|
| ffa_red_panther | **mob_duskcat** | beast 28×22 | spec'd (§3) | lean prowling feline; species = ramp swaps |
| ffa_icedrake | **mob_ashdrake** | **36×26 (20,24)** — justified exception | spec'd (§3) | folded-wing drake; element = accent swap |
| ffa_bomb | **mob_cinderwisp** | beast 28×22, hover | NEW | floating flame-orb elemental, ember trail; frost/void via 5–12 |
| ffa_jelly | **mob_gloomling** | beast 28×22 | spec'd (§3) | slime blob; flavor is pure palette |
| ffa_lamia | **mob_marshcoil** | beast 28×22 | NEW | coiled serpent, raised hooded head; venom accent 13–15 |
| ffa_malboro | **mob_snapvine** | beast 28×22 | NEW | toothed maw on a root ball, two lashing vines; fungal via 5–8 |
| ffa_floateye | **mob_orbwatcher** | beast 28×22, hover | spec'd (§3) | one-iris shell-and-tendril floater (deliberately not a beholder) |
| ffa_zombie | **mob_gravewalker** | humanoid 24×32 | spec'd (§3) | shambling undead; rot/bone/wraith via ramps |
| ffa_vampire | **mob_nightflit** | beast 28×22, hover | NEW | bat-winged bloodsucker, wing-flap idle; crimson 13–15 |
| ffa_goblin | **mob_grubkin** | humanoid 24×32 | **reskin of hero_cogling** (elite palette + cudgel prop pass, 0 new frames) | feral small goblinoid |
| ffa_antlion | **mob_scuttler** | beast 28×22 | NEW | burrowing beetle, mandibles forward; spider/scorpion via ramps |
| ffa_tonberry | **mob_shivtail** | humanoid 24×32 (drawn short) | NEW | small upright lizard, rusty knife, dragging tail — **no robe, no lantern** (the trademark tells, deliberately omitted) |
| ffa_toughskin | **mob_gnarljaw** | **28×32 (14,30)** — justified exception | NEW | hulking bare-chested brute, knuckle-drag; golem = grey 5–8 shift |

### 2.3 Keyword pools (all 20, entry-for-entry, lengths preserved)

Beast pools 1–15 map to the rigs above 1:1 (goblinoid pool keeps its 2-entry hashed
variety as `['mob_grubkin','mob_shivtail']`; boar pool → `mob_gnarljaw` interim,
[Speculative] full-tier `mob_tuskhog` quadruped; bird pool → `['mob_ashdrake',
'mob_ashdrake']` MVP → full-tier **mob_carrionkite** scavenger bird). Humanoid pools 16–20
resolve to hero rigs with enemy team-tint: orc/grunt → colossus ×3; bandit → shade ×2 +
vanguard ×2; soldier → vanguard ×3 + colossus; caster → magus ×4; monk → colossus +
vanguard.

**IP cleanup while touching these tables:** drop the coined words from the regexes —
`worg`, `worgen`, `malboro`, `tonberry`, `beholder`, `floateye`, `toughskin` (`wolf`,
`gazer|watcher|eye`, `lizard|newt|gecko`, `ogre|golem|giant` already cover the same
names). The orbwatcher pool becomes `/eye|gazer|watcher|orb|sentinel|devourer/`.
*(Applied to `fftaRoster.ts` as part of this rebrand pass.)*

### 2.4 Sharing matrix (rule + notable calls)

**Rule:** silhouette classes (biped / quadruped / blob / hoverer / serpent / insect /
rooted plant / flyer) never palette-swap into each other; everything inside a class shares
one sheet. Notable calls: `mob_grubkin` is the only hero-sheet monster (cogling + elite
palette + prop pass); `mob_gnarljaw` is deliberately **not** a colossus reskin (feral
hunch vs armored hero stance changes meaning, and the ogre/golem/giant/beast net deserves
its own frames); duskcat owns the tail-hook + head-below-rump prowl so any future
boar/bear rig must carry its head level with no tail hook.

### 2.4b Mount coverage — 2 rigs (added 2026-08-05, not yet spec'd)

Driven by `.planning/world-systems-plan.md` **Track F3**: zone-to-zone travel becomes a
ridden flight, so the hero graduates onto a mount when they leave a zone behind. Two rigs,
split on faction exactly as Track R already splits everything else:

| Rig | Faction | Serves |
|---|---|---|
| **mount_gryphon** | Lastlight Concord | all Concord journeys; rarity/tier via palette |
| **mount_wyvern** | Ashmarch | all Ashmarch journeys; same palette ladder |

Four things make these cheaper than a normal rig, and one makes them dearer:

- **`mob_ashdrake` (§3) is the silhouette reference for the wyvern** — it already serves the
  drake/wyrm/**wyvern** pool at 36×26, and its wing-and-neck construction transfers. What
  does *not* transfer is the animation table: a mount needs flap-cruise, takeoff and
  landing, and has no attack, hit or death cycle at all.
- **Palette is the whole variant story again** — faction on 9–12, rarity on 13–15 — so a
  premium mount skin (Track M) is a palette row, not a sheet.
- **Only two facings, and travel controls the camera**, so a journey can be authored to
  favour the facing that reads best rather than covering every angle.
- **The rider is a composite, not baked in** — the existing hero sheet drawn above the
  mount at a saddle anchor, matching the one-weapon-layer simplification. That is what keeps
  this at 2 rigs instead of 2 × 5 hero rigs.
- **The dearer part:** these are the first rigs needing a *seated* hero pose. Budget one
  extra frame pair per hero rig for a ride pose, or accept the standing pose at a saddle
  offset for the MVP and fork on complaints — same policy as §2.1's weak reads.

Frames, anchors and slot maps are unspec'd; they want a §3 template pass each before build,
and they sequence after the 18-sheet monster tier below.

### 2.5 Production sizing & build order

Nominal frame scheme 13 f × 2 facings = 26/rig; actual verified rigs ran **11–26 frames**
(hover/blob rigs legally ship 11–20). MVP per rig = se-only + skip death = 9–11 frames.

- **MVP tier: 17 sheets** (5 hero + 12 monster; grubkin is palette-only) ≈ ~180 frames.
- **Full tier: 18 sheets** (+carrionkite) at full layouts ≈ ~470 frames. [Speculative]
  pool: stoutguard, colossus horn pass, tuskhog → up to 21.
- **Mount tier: +2 sheets** (§2.4b gryphon, wyvern) → up to 23. Short tables (flap, takeoff,
  landing — no combat cycles), so ~20–30 frames each. Blocked on a §3 spec pass.
- **Build order:** 1 gloomling (pipeline warm-up) · 2 vanguard (highest traffic) · 3 shade
  · 4 magus · 5 cogling+grubkin palette · 6 colossus · 7 gravewalker · 8 duskcat ·
  9 gnarljaw · 10 cinderwisp · 11 ashdrake · 12 orbwatcher · 13–17 scuttler, marshcoil,
  shivtail, snapvine, nightflit · 18 carrionkite.

### 2.6 Drop-in mapping (pure string swaps in `fftaRoster.ts`)

- **HERO_SPRITES:** every cell's pool becomes its archetype id repeated to the same length
  (duplicates are legal; `hash % length` still resolves). Rule: warrior → vanguard
  (colossus for orc/troll/tauren) · mage/warlock → magus (cogling for goblin/gnome) ·
  rogue → shade (cogling for goblin/gnome). Unreachable cells get the same treatment so
  the `Record` stays total.
- **MONSTER_SPRITES** (order preserved): `['mob_duskcat','mob_ashdrake','mob_cinderwisp',
  'mob_gloomling','mob_marshcoil','mob_snapvine','mob_orbwatcher','mob_gravewalker',
  'mob_nightflit','mob_grubkin','mob_scuttler','mob_shivtail','mob_gnarljaw']`.
- **Flat map** (47 ids): soldier/paladin/fighter → vanguard ·
  warrior/dragoon/defender/gladiator/white_monk/templar → colossus *(ffa_dragoon →
  hero_magus in the warlock cells)* · all mage jobs +
  bishop/alchemist/sage/beastmaster/morpher/elementalist/red_mage/summoner → magus
  *(black_mage/time_mage → cogling in goblin/gnome cells)* ·
  thief/ninja/archer/fencer/assassin/sniper → shade *(thief → cogling in goblin/gnome
  cells)* · hunter → vanguard in warrior cells / shade in rogue cells ·
  mog_knight/gunner/juggler/gadgeteer/animist → cogling · monsters per §2.2 *(floateye →
  ashdrake in the bird pool)*.

---

## 3. Per-Rig Specification Templates (10 rigs, verified)

Every spec passed an adversarial verification pass: ASCII grids counted row-by-row and
column-by-column, channel discipline checked pixel-against-slot-map, anchors and animation
tables checked against the engine contract, names checked for IP. Sketch character key
throughout: `.` = slot 0 transparent, `1`–`9` = slots 1–9, `A`–`F` = slots 10–15. Both
facings are always drawn facing screen-left; the engine mirrors.

---

### Rig: hero_vanguard

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30); soles on rows 29–30 centered on
   col 12.
2. **Serves** — the medium-build warrior workhorse: human (canonical), elf, troll warriors
   as pure `race/*` palette variants; both faction infantry lines via the 9–12 trim ramp;
   bandit/soldier keyword mobs as elite reskins (shifted 5–8 + hot 13–15). Arming sword +
   round shield baked in.
3. **Frame layout** — one strip, **24 frames** (indices 0–23).

| tag | frames | fps | loop | key poses |
|---|---|---|---|---|
| idle | 2 (0–1) | 4 | yes | F0 base stance, 1px forward lean. F1: torso+helmet rise 1px, shield rim lifts 1px, blade tip drifts 1px left, front boot extends 1px — a clean march pulse (idle drives movement). |
| walk | 4 (2–5) | 8 | yes | contact / pass / contact (legs swapped — redrawn, the engine only mirrors facings) / pass; 1px total bob; soles never leave rows 29–30. |
| attack | 3 (6–8) | 10 | no | wind-up: sword hand rises 4px, blade up-and-back, torso rotates 1px away. strike: 6px blade arc down past the shield edge (tip near col 4 row 22), torso 2px left, one slot-15 glint on the leading edge. recover. |
| hit | 2 (9–10) | 12 | no | 1px then 2px knock screen-right, shield jerks to the chin, eye pixel removed on F1 (lights-out beat). |
| death | 2 (11–12) | 6 | no | knees buckle (hips −5px, blade horizontal) → prone ~16×5px mass on rows 26–30, shield disc flat beside it. |
| ne rows | idle 13–14 · walk 15–18 · attack 19–21 · hit 22–23 | as se | | full back-view redraws (backplate, tabard back, blade past the far hip); **death/ne reuses se 11–12** — a prone sprawl is facing-ambiguous at 24px. |

4. **Palette slot map** — 1–4: face opening, neck, sword fist (race). 5–8: helmet, gorget,
   pauldrons, chest, belt, boots, shield **rim + boss** (gear tier). 9–12: tabard stripe +
   skirt, leggings, shield **face** — the biggest faction billboard on the sprite. 13–15:
   crossguard + blade (13–14), glints (15), single eye pixel (14) — rarity only; *the
   rarity ramp literally is the steel*.
5. **Idle `se` sketch** (24×32):

```
........................
........................
........................
........................
.........888888.........
........78888887........
........67777776........
........66777766........
........3E366776........
........23366776........
........22356665........
.........556655.........
..........5225..........
.......7887667887.......
.......6876666786.......
.......6677BB7766.......
...67776667BB76663......
..6CCCCC667BB766DDD.....
..6B787B667BB76..F......
..6A676A66BBBB6..E......
..6AAAAA6555755..E......
..69999969BBBB9..E......
...56665.9BBBB9..E......
....555..999999..E......
..........AA.AA..E......
..........AA.AA..E......
..........99.99..E......
..........55.55..F......
..........55.55.........
.........555.55.........
.........555.55.........
........................
```

Legend: `2/3` skin (jaw, cheek/brow, fist) · `5–8` plate dark→top-light (belt/boots/
underside → helmet dome, pauldron tops, boss cap) · `9–C` trim dark→light (skirt hem +
lower-leg shade + shield face lower → tabard stripe → shield face top band) · `D`
crossguard · `E` blade flat + eye glint · `F` blade glints (guard + tip).

6. **Readability** — three-lobe silhouette: helmet dome, 7px shield disc breaking left,
   vertical blade-drop line right; blade never rises past the shoulder at idle (vs the
   greatsword-over-head class silhouette), legs have a visible gap (anti-mage), upright
   spine (anti-rogue). Shield carries **no emblem** (mirror rule) — emblems live on
   banners. Diffuse lights (8, C) only on up-facing planes; the two F pixels are specular
   signal glints exempt from the plane rule; the eye is the only accent pixel off the
   weapon.
7. **Reskins** — *Concord Oathholder* (human, t3, Concord 9–12, rare) · *Ashmarch
   Marauder* (elite: charred 5–8, ember 9–12, hot 13–15) · *Moonpale Duelist* (elf, t2,
   Concord, uncommon).

---

### Rig: hero_magus

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30); body rows 4–30, staff crystal is
   the only element above the cowl.
2. **Serves** — mage AND warlock for all MEDIUM races; cultist/acolyte/hexer mob pools via
   elite reskin. Two layers, one grid, one timing: **body layer** (robe, cowl, hands) +
   **focus layer** — mage = staff (shaft 5–8, crystal entirely 13–15); warlock = staff
   removed, casting hand raised 1px, floating 2×2 accent mote at ~(4,13), eyes moved to
   slot 14. School and rarity are pure 13–15 swaps.
3. **Frame layout** — **20 frames** (11 se + 9 ne).

| tag | frames | fps | loop | key poses |
|---|---|---|---|---|
| idle | 2 (0–1) | 2 | yes | F1: cowl/shoulders/sash/face drop 1px (breath sink) while the planted staff stays fixed; one hem fold shifts 1px left. Smooth glide, hem base never moves. |
| walk | 2 (2–3) | 4 | yes | hem swings 1px left, staff butt lifts 1px → swings back, torso drops 1px. Legs never drawn — the robe IS the gait. |
| attack | 3 (4–6) | 6 | no | cast, no lunge: staff rises 1px (crystal dims to 13-only) → fully raised (crystal top row 0, flares to a 5px cross of 14/15 + two loose sparks, hand glow 13→14) → settle with one fading spark. |
| hit | 2 (7–8) | 8 | no | 2px knock screen-right, cowl tip flips 1px → 1px offset. |
| death | 2 (9–10) | 3 | no | kneel (height ~16px, staff diagonal, crystal 13-only) → prone robe mound rows 26–30, staff flat, crystal dark. |
| ne rows | idle 11–12 · walk 13–14 · attack 15–17 · hit 18–19 | as se | | back view, zero skin except the staff hand; crystal flare identical so the school reads from behind. **death/ne reuses se** — the mound + fallen staff is facing-agnostic. |

4. **Palette slot map** — 1–4: face inside the cowl (rows 8–11), chin shadow, grip hand;
   mage eye = slot 1. 5–8: robe + staff **shaft** (tier retints robe and staff wood
   together). 9–12: cowl + hood point, mantle, sash, hem bands — the entire faction read.
   13–15: crystal + socket (rows 2–5), 1px casting-hand glow; warlock adds eyes + mote.
5. **Idle `se` sketch** (24×32):

```
........................
........................
.....F..................
....EFE.................
....DED.....CB..........
.....D.....BCBA.........
.....7...ABCCBA9........
.....7..ABCCBBA9........
.....6..A23329A9........
.....6..A31329A9........
.....6..A23219A9........
.....6..A12199A9........
.....6..A9AA99A9........
.....6.9ABCBBBAA9.......
.....6677887777766......
....D347788777766.......
.....336777777766.......
.....6.6777777765.......
.....6.AABBAAA999.......
.....6.5666666655.......
.....6.6777777665.......
.....6.67777777665......
.....6.67767777665......
.....6666777777665......
.....6656777777665......
.....6667677767665......
.....65677767776665.....
.....65667777776665.....
.....59AAAAAAAAAA99.....
.....5999AAAAAA9999.....
.....5.55555555555......
........................
```

Legend: `1` eye + chin shadow · `2/3` face planes · `4` lit knuckle · `5–8` robe
dark→highlight + staff shaft (6/7) · `9–C` cowl/mantle/sash/hem trim dark→top-specular ·
`D` crystal socket + hand glow · `E` crystal body · `F` crystal tip — the brightest pixel
of the sprite. Ground contact: hem row 30 cols 7–17, staff butt (5,30).

6. **Readability** — unbroken triangular robe base (10px waist → 13px hem) = one dark
   wedge, the anti-read of the warrior's split stance; the crystal is the highest AND
   brightest cluster — accent color announces "caster" + school before any other pixel
   resolves; max width at the hem, not shoulders; no text/heraldry; strict top-down light
   (C on cowl top, 8 on shoulders, F on tip).
7. **Reskins** — *Frostbind Magus* (Concord, frost 13–15) · *Cinderspeaker* (Ashmarch,
   fire) · *Gravecall Acolyte* (elite: bruised-violet 5–8, sickly green 13–15, corpse-gray
   skin).

---

### Rig: hero_shade

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30).
2. **Serves** — rogue for every MEDIUM race (elf = moonlit-pale ramp; troll via the
   full-tier tusk fork reusing this timing); bandit/cutpurse mob pools via elite reskin.
   Twin daggers baked in. Recipe order: gear tier base (5–12) → faction override (9–12,
   composes over tier like `gear/tX+rarity`) → rarity (13–15).
3. **Frame layout** — **24 frames** (14 se + 10 ne; sheet 576×32). Importer string
   (verified syntax):
   `idle:0,1@2;walk:2,3,4,5@8;attack:6,7,8,9@12!;hit:10,11@10!;death:12,13@6!;idle/ne:14,15@2;walk/ne:16,17,18,19@8;attack/ne:20,21,22,23@12!`

| tag | frames | fps | loop | key poses |
|---|---|---|---|---|
| idle | 2 (0–1) | 2 | yes | base crouch, drip glint lit → torso+hood rise 1px, front knee eases, lead blade rocks 1px, slot-15 drip glint winks OFF — a slow poison blink that reads as a coiled prowl-step. |
| walk | 4 (2–5) | 8 | yes | low prowl, bob ≤1px, cape counter-sways; head stays 2–3px ahead of the feet column. |
| attack | 4 (6–9) | 12 | no | micro-coil (1px sink, lead dagger back 2px — the ONLY anticipation) → stab A (lead arm +4px at belt height) → stab B (off-hand crosses 4px, 2px lower) → recover, drip glint on lead tip. |
| hit | 2 (10–11) | 10 | no | 2px knock, head dips, hood flares → 1px return. |
| death | 2 (12–13) | 6 | no | knees buckle, blades fall beside the feet → prone ≤6px tall along rows 27–30, hood mound screen-left. |
| ne rows | idle 14–15 · walk 16–19 · attack 20–23 | as se | | cape covers torso, no face pixels; stabs read as shoulder rotation + 2–3px of blade tip breaking the left edge. **hit/ne + death/ne reuse se** — hood/cape mass recoil is direction-neutral. |

4. **Palette slot map** — 1–4: face wedge in the hood + hand tops. 5–8: all leathers +
   dagger **grips**. 9–12: hood, half-cape, belt sash — faction channel. 13–15: dagger
   **blades** (13 steel, 14 edge) + slot-15 poison-drip glint — the single hottest pixel
   on the sprite.
5. **Idle `se` sketch** (24×32; contact row 30 cols 6–16, head mass centered col 9 —
   ahead of the feet):

```
........................
........................
........................
........................
........................
........................
.......BCCCB............
......BCCCCBA...........
.....BCCCCBBAA..........
.....BBBBBBAAA..........
.....B912BBBAA..........
.....2123BBBAA..........
......122BBBAA..........
......919AAAAA..........
....7887776BBAA9........
....6777766BAAA9........
...66777666BAA9.........
...66676665BA99.........
..3459999999A95.........
...D.6666566655.........
...E.6665556665D........
...E6665...565..........
...F665....565..........
......56....565.........
......56.....56.........
.......56....56.........
.......56....56.........
........55...55.........
.......5665..5665.......
......56665.56665.......
......55555.55555.......
........................
```

Legend: `1–4` eye shadow/face/nose/hand · `5–8` leathers dark→shoulder specular · `9–C`
hood interior→crown light + cape + sash (faction) · `D/E` blade steel/edge · `F` poison
drip.

6. **Readability** — hood crown at y=6 vs vanguard's y=3: the two rigs separate by
   hat-height alone in a marching column. Head-ahead-of-feet crouch is the class cue.
   Blades break the silhouette **low, lower-left**; vanguard's weapon breaks it above the
   head — opposite corners. Leg gap + under-arm notches keep the outline airy vs plate.
   Only vivid pixels: blades + drip + trim.
7. **Reskins** — *Duskveil Agent* (Concord elf, t2, uncommon) · *Ashmarch Waylayer* (troll
   fork, t1, common) · *Gravemist Cutpurse* (elite: grave-grey leathers, venom-green
   13–15).

---

### Rig: hero_colossus

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30); hunched body rows 2–30, cleaver
   breaks the frame top to row 0 (~31px total read).
2. **Serves** — MASSIVE martial base: orc (canonical), troll, hornborn warriors +
   brute/mauler/ogrekin enemy pools. Race is one 1–4 swap; **the two baked protrusion
   pixels live in slot 4** so they tint with the ramp — tusks on orc/troll, horn-nubs on
   hornborn, zero extra frames (optional horn head-fork allowed, not required). Cleaver
   baked in (blade body 5–8, edge 13–15, haft slot 10).
3. **Frame layout** — **24 frames**: idle se 0–1 / ne 2–3 (authored — the blade sits in
   front of the head in ne) · walk se 4–7 / ne 8–11 · attack se 12–15 / ne 16–19 · hit se
   20–21 (ne reuses) · death se 22–23 (ne reuses).

| tag | fps | loop | key poses |
|---|---|---|---|
| idle | 4 | yes | torso+head rise 1px while the cleaver dips 1px as counterweight — the 1px counter-beat IS the heavy march gait. |
| walk | 8 | yes | 4-beat stride, 1px total bob — heavy, planted; head dips on contacts. |
| attack | 10 | no | wind-up (blade up-back, hips sink) → **anticipation**: blade fully vertical overhead (tip row 0), held by repeating the frame index in the manifest (`attack:12,13,13,14,15@10!`) since per-frame timing doesn't exist in a single-fps strip → overhead slam (torso pitches 2px, head drops 3px, blade lands ahead of the feet rows 24–30) → follow-through. |
| hit | 12 | no | 2px mass shove, head snaps back, front foot lifts → settle, hunch deepens. |
| death | 6 | no | knees buckle, hips −4px, cleaver slides off the shoulder → prone 16×4px mass rows 27–30, cleaver flat beside. |

4. **Palette slot map** — 1–4: head/face, **tusk/horn hint pixels (4)**, forearms + fists,
   legs, feet (feet stay in skin so the hornborn ramp can read them as dark hooves). 5–8:
   pauldrons, chest plate, cleaver blade body + top speculars. 9–12: belt + buckle,
   loin-kilt hide, wrist/shin wraps, cleaver haft. 13–15: eyes (13), cutting edge (14),
   edge glint (15).
5. **Idle `se` sketch** (24×32):

```
................F8887...
................E7776...
.......344443...E7776...
......33443322..E7766...
.....233333222..E7766...
.....23D33D222..E6665...
.....233332211...665....
.....24222411....A......
......112211..78A888776.
7888765666556677A776655.
677765566665566A7766555.
667655566665556A6665555.
.5655666666555A332......
.2325677666555A332......
.2325667665555A22.......
.233566766655555........
233256666655555.........
23325566665555..........
23329AABBAAA999.........
999.AAAAAAAAA999........
232.AAAAAAAA999.........
121..AAAAAA9999.........
.....9AA9AA9A99.........
........221..211........
........232..221........
........232..221........
........232..221........
........999..999........
........999..999........
.......1221.1221........
.......1111.1111........
........................
```

Legend: `1–4` skin darkest→light incl. skull-top highlight + the two tusk/horn hint pixels
(row 7, cols 6/10) · `5–8` armor + blade dark→top specular · `9/A/B` wraps, kilt + haft,
buckle · `D/E/F` eyes, cutting edge, edge glint. Feet span cols 7–15 on row 30; torso
hangs 1–2px screen-left of the leg line — a deliberate forward hunch.

6. **Readability** — a top-heavy wedge: 23px shoulder mass (cols 0–22, touching the left
   frame edge) over an 8px hip, blade breaking row 0 — top and left are the only two frame
   edges touched, and no other humanoid rig breaks row 0 at idle. Vs MEDIUM: +5px
   shoulders, zero neck pixels, a free fist hanging at col 0 while the other hand grips
   the haft. Race identity never depends on 5–15.
7. **Reskins** — *Ashmarch Mauler* (ember 9–12, t2, orc skin) · *Rimegrip Colossus* (elite
   frost: glacial skin, cold slate 5–8, icy accent) · *Cragmaw Ogrekin* (wilds: mud-gray
   hide, scrap iron — the hint pixels read as broken fangs).

---

### Rig: hero_cogling

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30); body ~19px tall (rows 12–30),
   backpack exhaust stack tops out at row 9.
2. **Serves** — gnome × mage/rogue/warlock (base) and goblin × same (ear head-fork at full
   tier); tinker/scrapper/sapper camp mobs via elite reskin. **Class = held-prop swap on
   the same body frames:** mage = coil-staff to ~row 6 with lit focus head (13–15); rogue
   = twin sparkjack shivs low at the hips (tips in 13–15, muzzle glow removed); warlock =
   raised clamp-hand + free-floating 2px mote at ~(4,20) that counter-bobs the idle.
3. **Frame layout** — **22 frames** (13 se + 9 ne): idle 0–1 @3 (head+torso+gadget drop
   1px while backpack+pipe rise 1px — a piston-march counter-beat; muzzle core F↔E swap,
   1px puff above the pipe) · walk 2–5 @8 · attack 6–8 @10 (wind-up pulls the gadget 2px
   in and dims the muzzle to one D; strike thrusts 3px from the wind-up — muzzle tip lands
   at col 1, in-frame — F core + 2px E halo bloom, backpack kicks; settle with 1px smoke)
   · hit 9–10 @12 (goggle glints removed) · death 11–12 @6 (gadget falls, all accent
   extinguished → 4px prone mound rows 27–30) · ne: idle 13–14, walk 15–18, attack 19–21
   (backpack shell + strap X dominate; 1px E of muzzle glow peeks past the hip so rarity
   reads from behind); **hit/ne + death/ne reuse se**.
4. **Palette slot map** — 1–4: face, ears, nose, gripping hand. 5–8: goggle frames,
   jerkin, trousers, boots, gadget barrel, backpack, exhaust pipe (tier upgrades the whole
   kit — the tinkerer fantasy). 9–12: leather cap, chest strap, belt (largest clean
   faction shapes). 13–15: goggle lens glints (2px) + muzzle glow (3px) — exactly 5 accent
   pixels at idle.
5. **Idle `se` sketch** (24×32):

```
........................
........................
........................
........................
........................
........................
........................
........................
........................
..................88....
..................77....
..................77....
........ABBCBBA...66....
.......9AAAAAAA9..66....
......255D555D552.66....
......23553335532.66....
.....443333333332.66....
......33233333322.55....
.......223333322..55....
........1122211...55....
.......7888888878888....
.......7777779766665....
....6776677797766665....
..EF6674367977666655....
...D55629AAAAA95555.....
........5666665.........
........5555555.........
.........66..66.........
.........55..55.........
.........55..55.........
........555..555........
........................
```

Legend: `1–4` skin (jaw shadow → nose tip/cheek/hand tops) · `5–8` primary kit (goggles,
boots, barrel, shell, pipe → top planes) · `9–C` cap/strap/belt trim (faction) · `D/E/F`
lens glints + muzzle underspill / halo / core. Ground contact rows 29–30 with a 2px leg
gap at cols 11–12; toe flare on row 30.

6. **Readability** — the one-glance read is **big head + off-axis smokestack**: an 11px
   head (~46% of frame width) with a 2px pipe rising 3px above the cap crown — no other
   rig carries a vertical stack. 9–10px shorter than MEDIUM rigs with a head 2× their
   proportion; no robe triangle (vs magus); goggle pair symmetric about the head axis
   (glints at cols 9/13) so the mirror swap is invisible.
7. **Reskins** — *Concord Lantern-Wright* (gnome, t2, uncommon) · *Ashmarch Cinder-Sapper*
   (goblin, t1, common) · *Rustholt Scrap-Tinker* (elite: charred rust-iron 5–8, hot flare
   13–15 — the muzzle and lenses burn as the elite tell).

---

### Rig: mob_duskcat

1. **Frame & anchor** — Beast 28×22, anchor (14,20); one row of **22 frames** (616×22).
2. **Serves** — the whole feline/canine pool (wolf/cat/hound/raptor/stalker/prowler).
   Species = 5–8 pelt shift + 9–12 marking shift; elite = shifted 5–8 + hot 13–15;
   optional faction-tamed = 9–12 marking swap. No props ever.
3. **Frame layout** — idle se 0–1 @2 (barrel glides 1px left while the skull holds its
   column and drops 1px — feline head-stabilization; tail tip sways) · idle ne 2–3 (rump +
   tail hook nearest) · walk se 4–7 @8 (diagonal pairs, head rows fixed, ≤1px bob) · walk
   ne 8–11 · attack se 12–14 @10 (**wind-up gathers the body 3px screen-right onto the
   coil** — rump to col 27, tail tucked — which buys the room for the 3px lunge back to
   the col-0 extent; claws lead, hind paws stay planted) · attack ne 15–17 (coil → spring
   through the base footprint) · hit 18–19 @12 (1px shunt — the tail already reaches col
   26, so 2px would leave the frame; ne reuses) · death 20–21 @6 (legs fold → flat on its
   side, eye accent removed; ne reuses). Distinct ne rows exist for idle/walk/attack
   because the away-facing gait must show rump and tail, not a mirrored face.
4. **Palette slot map** — 1–4: nose leather, inner ears, chin, muzzle/belly (fixed organic
   anchor under every reskin). 5–8: the entire pelt — THE species channel. 9–12: ear tips,
   tail rings, shoulder/haunch stripes (11–12 reserved for rosette/dapple steps). 13–15:
   claw glints (13), eye (14), **two authored slot-15 ember pixels** (tail tip + mouth
   corner) that base palettes hold at a dull near-marking tone and elite palettes ignite —
   a palette swap can only recolor pixels that exist.
5. **Idle `se` sketch** (28×22):

```
............................
............................
........................F9..
.........................98.
.........................88.
..9..9...................78.
..72.72...........78888878..
..7888887........78888777...
.67E788878A88A88878888877...
3447788888A88A88778A88877...
1346777777A77A77777AA776....
F236677776A66A666777A766....
....6677666666666677766.....
.....66622333226667666......
......66.65......65776......
......66.65......65.76......
......66.65......65.76......
......66.65......65.76......
......66.55......55.66......
......66.55......55.66......
.....D66...........666......
............................
```

Legend: `1–4` nose/ear/chin/muzzle skin · `5–8` pelt darkest (far legs) → top planes
(skull cap, spine, rump, tail top) · `9/A` markings (ear tips + tail rings, stripes) · `D`
claw glint · `E` eye · `F` ember pixels (tail tip, mouth corner).

6. **Readability** — a ~25px horizontal mass is instantly non-humanoid; the low S-line
   (rump row 6, skull 1px below, mid-back dipping to row 8) reads "stalking predator" at
   any zoom. Three cues survive 50% tile occlusion: hooked tail rising 4px above the rump,
   twin triangle ears, daylight under the belly. Duskcat owns the tail-hook +
   head-below-rump prowl; a future boar/bear rig must not claim them.
7. **Reskins** — *Moor Cat* (mossy grey-brown, quiet dusk look) · *Snow Stalker* (pale
   blue-white pelt, slate rosettes, frost accent) · *Ember Prowler* (elite: charcoal pelt,
   ash markings, hot 13–15 ignites the authored ember pixels).

---

### Rig: mob_ashdrake

1. **Frame & anchor** — **36×26, anchor (20,24)** — a verified, justified exception: the
   body is 28px nose-to-fin and the neck-snap attack needs 6px of clear frame ahead of the
   muzzle (2px overshoot + 4px flame cone), which 28- and 32-wide frames cannot hold
   (28+6=34>32); 36 holds it with 2px of hit-recoil slack on the right. Frame size is
   manifest data — zero code cost; feet-center anchor kept.
2. **Serves** — the drake/dragon pool (drake/wyrm/wyvern/hatchling) + interim large-bird
   coverage until `mob_carrionkite` ships. All variants palette-only: element = 13–15 (the
   flame puff literally changes element), species/elite = 5–8 hide, wing subspecies =
   9–12.
3. **Frame layout** — **22 frames** (13 se + 9 ne): idle 0–1 @3 (ribcage+wing block up
   1px, head dips via neck pivot, tail tip up — a step-cadence strut) · walk 2–5 @8
   (bird-strut with pigeon-bob neck) · attack 6–8 @10 (head recoils 3px behind the wing
   line, throat ember swells → head snaps 5px, jaw opens, 3–4px flame cone of 13/14/15
   fills cols 0–3 flush with the frame edge → recover, cone decays to two motes) · hit
   9–10 @12 (2px knock — tail tip lands col 35, in-frame) · death 11–12 @6 (legs buckle,
   wing slumps → prone with **all 13–15 pixels extinguished**: the element signal dies
   with the mob) · ne: idle 13–14, walk 15–18, attack 19–21 (head vanishes behind the wing
   peak on wind-up, cone breaks past the wing silhouette); hit/ne + death/ne remap to se.
4. **Palette slot map** — 1–4: soft underparts + keratin (throat, belly plates, horns, toe
   claws). 5–8: scale hide (skull, neck, torso, legs, tail) — the species/elite ramp.
   9–12: wing membrane + leading edge, dorsal spines, tail fin — the subspecies ramp.
   13–15: eye (14), throat ember (13), attack flame cone ONLY — an ice drake must never
   leak fire-colored pixels.
5. **Idle `se` sketch** (36×26):

```
....................................
....................................
....................CC..............
...........33......CAAC.............
........88873.....CAAAAC............
.......77E776....CAAAAAAC...........
......2266656B..CAAAAAAAC...........
.........1D256B.CAAAAAAA99..........
.............566CAAAAAAA99..........
..............56CAAAAAA9999.........
..............5669999999999.........
..............5887777777766.........
.............566777777776666........
.............56666777766665.........
..............566666666666665.......
..............223333322266..665..B..
...............1222222115......66...
.................566...555..........
.................56....55...........
.................56....55...........
.................56....55...........
.................56....55...........
.................56....55...........
................456...455...........
...............44566.44555..........
....................................
```

Legend: `1–4` throat/belly/horn/claw · `5–8` scale hide → skull-cap light · `9–C` wing
membrane shadow → top-lit leading edge, spines + tail fin (`B`) · `D` throat ember · `E`
eye (`F` appears only in the attack cone).

6. **Readability** — the wing spire peaks at row 2 over a body mass at rows 11–16: a 9px
   vertical break no other rig has ("tall triangle over a low slab"). Two 2px legs with
   7px bare shanks vs the quadruped's four short legs — zero silhouette overlap. The tail
   runs 7px past the hip, dips one row, and ends in an upturned fin-tip flick. At rest
   exactly two accent pixels exist (eye, ember), so the element swap and the
   death-extinguish both stay legible at 1px.
7. **Reskins** — *Rimegale Drake* (frost: slate hide, glacier wings, icy breath) ·
   *Bogtide Drake* (venom: moss-bronze, acid accent) · *Duskveil Drake* (elite: near-black
   hide, violet wings, hot violet breath).

---

### Rig: mob_gloomling

1. **Frame & anchor** — Beast 28×22, anchor (14,20); contact band straddles the col 13/14
   seam (an even-width band on a 28px frame cannot center on one column).
2. **Serves** — the whole slime pool; the designated **pipeline warm-up rig**. Elemental
   variant = pure 5–8 gel-ramp reskin; elite = shifted 5–8 + hot 13–15; rarity/school =
   13–15 only.
3. **Frame layout** — **11 authored frames** (308×22), **no ne rows at all** (convex lump,
   no back-side gear — the importer's se-reuse default is the entire point). Import
   (verified syntax):
   `node tools/importSprite.mjs gloomling.png public/sprites/units --id mob_gloomling --frame-w 28 --frame-h 22 --anchor 14,20 --anims "idle:0,1@3;walk:2,3@5;attack:4,5,6@8!;hit:7,8@10!;death:9,10@4!"`
   idle: rest dome ↔ squash (crown −2px, sides +1px each, eyes/nucleus sink 1px) — the
   tall/flat pulse reads as a scooting gait. walk: idle poses with travel intent (1px
   crown shear + a trailing smear pixel). attack: compress + crown pulled 2px away
   (anticipation) → whole mass lunges, crown thrown 4px, body shears into a 15px diagonal
   → snap-back with 1px overshoot wobble. hit: 2px shove + two detached gel flecks. death:
   deflate (eyes removed) → 3px-tall, 24px-wide puddle with one centered D fleck.
4. **Palette slot map** — 1–4 **unused** (mob rigs never race-swap; leaving skin empty
   makes the rig inert under race recolors). 5–8: the gel body ramp — the elemental reskin
   channel. 9–12: interior murk/sediment heart — fixed across every reskin, the family
   resemblance. 13–15: nucleus rim (13) + two eye glints (14) + nucleus hot core (15).
5. **Idle `se` sketch** (28×22):

```
............................
............................
............................
............................
............................
............................
............................
............................
............7887............
..........78888887..........
.........6788888876.........
........678888888776........
.......67E777E7777776.......
......667777777AA77766......
......67777777ADFA7776......
.....666777777ADDAA7666.....
.....6666666699AA996666.....
.....566666669999966665.....
.....556666666999666655.....
......5566666666666655......
........555555555555........
............................
```

Legend: `5–8` gel dark→crown cap · `9/A` sediment heart · `D/E/F` nucleus rim / eye glints
/ hot core.

6. **Readability** — wider than tall with a single unbroken convex outline — the only rig
   with no limb/leg gaps; apex dead-center, base one solid contact band. Even
   near-grayscale, blob + fixed dark heart still reads "slime". The 2px squash amplitude
   is the life signal distinguishing it from any static puddle prop.
7. **Reskins** — *Cinderling* (ember-gel 5–8) · *Rimeling* (glacial 5–8) · *Elder
   Gloomling* (elite: bruised-violet gel + hot accent; heart unchanged).

---

### Rig: mob_gravewalker

1. **Frame & anchor** — Humanoid 24×32, anchor (12,30); hunched build tops at row 6 (~25px
   bent).
2. **Serves** — enemy-only, the entire undead pool (shambler/rotter/bonewalker/barrow-dead/
   drowned-dead). Every variant palette-only: **flesh-vs-bone lives in skin 1–4** —
   exposed bone (skull patch, torn cheek, rib bars, ulna, shin) is drawn at the ramp's
   light end, so one 1–4 swap to ivory converts the whole rig into a skeleton. Shroud 5–8,
   rope bindings 9–12, eye-glow 13–15. No prop — claws are the weapon — precisely so no
   variant ever needs new pixels. *(Internal rig id only; user-facing species names use
   the data's existing "Grave-Risen" register.)*
3. **Frame layout** — **26 frames** (15 se + 11 ne): idle 0–1 @3 (perpetual lurch: torso
   1px left+down, claw arm swings, drag-toe slides) · walk 2–5 @5 (a drag, not a stride —
   feet never rise >1px) · attack 6–8 @6 (rock back + slot-15 eye flare → 3px lunge, claw
   rakes rows 13→20 → over-extend) · hit 9–10 @8 (**eye pixels removed for one frame** — a
   dead flicker — then return) · **death 11–14 @4 — the showcase crumble**: buckle → fold
   (already reads collapse→prone, so a 2-frame truncation still meets contract) → crumble
   to a 7×12px mound with skull patch atop, eye dims 14→13 → settle with two slot-1 dust
   flecks, accent out · ne: idle 15–16, walk 17–20, attack 21–23 (wind-up flare drawn as a
   1px slot-15 rim past the skull edge so it telegraphs from behind), hit 24–25; death/ne
   reuses se (by f1 the body is a facing-less mound).
4. **Palette slot map** — 1: deepest rot shadow + dust flecks · 2–3: rot flesh · **4:
   exposed bone** · 5–8: burial shroud (8 = 2–4px hump-crest highlight only) · 9–12: rope
   belt + dangling ends (11–12 appear only when bindings swing into top light) ·
   13/14/15: dying-ember eye (death fade) / eye-glow pair (the always-on undead tell) /
   attack flare.
5. **Idle `se` sketch** (24×32; soles rows 29–30 cols 9–12 + drag-toe at col 16):

```
........................
........................
........................
........................
........................
........................
.......234432...........
......23344332..........
......23333332..........
......2E3E3332..........
.....232442332..........
.....124422116776.......
........121.567765......
......5666778877665.....
.....52333333567665.....
.....21442442566665.....
.....21244244566665.....
....42.9AAAA9AAA9.......
....42.5666656695.......
....42.5666566695.......
...442.5661666665.......
...4.4.56.16.5665.......
.......56.2..5665.......
.......5..22..565.......
..........42..22........
..........42..21........
..........42...22.......
..........22....21......
..........232...21......
.........2321...11......
.........1111...1.......
........................
```

Legend: `1–3` rot shadow/flesh/lit flesh · `4` exposed bone (skull patch row 6, cheek rows
10–11, rib bars 15–16, ulna 17–21, shin 24–26) · `5–8` shroud · `9/A` rope · `E` eye-glow
pair.

6. **Readability** — the off-balance outline is the read: skull center col ~9 vs pelvis
   col ~12 (3px forward jut), drag-toe trailing 4px — the "broken gait" registers before
   any interior pixel. The staggered rib bars are the distance-read undead tell and
   survive every recolor (they're skin-channel). Nearest sibling is the warlock (also
   hunched, jagged hem): the warlock's accent floats off-body as a mote; the gravewalker's
   is locked in the eye sockets and its claw arm hangs to row 21.
7. **Reskins** — *Bonewalker* (ivory 1–4: every flesh pixel joins the ribs in one skeletal
   read; pale blue socket-light) · *Mire-Sodden* (waterlogged grey-green, algae weed-rope,
   marsh-light) · *Barrowlord* (elite: funerary violet-grey shroud, hot gold-fire eyes,
   tarnished gilt cords).

---

### Rig: mob_orbwatcher

1. **Frame & anchor** — Beast 28×22, anchor (14,20); the body floats with its underside
   4px above the anchor row — the anchor marks the GROUND point where the engine draws the
   shared shadow; no body pixel touches it in any living pose (the death husk finally
   rests on it).
2. **Serves** — the eye pool via `/eye|gazer|watcher|orb|sentinel|devourer/` (coined
   other-game terms dropped) + first slot of the bird pool as interim hover stand-in.
   Palette-only variants; deliberately **not** a many-eyed mouthed sphere — one iris, no
   mouth, shell-and-tendril body.
3. **Frame layout** — **20 frames** (11 se + 9 ne): idle 0–1 @2 (body shifts 1px up while
   tendril tips do NOT move — they stretch, selling the hover) · walk 2–3 @6 (1px lean,
   tendrils trail 1→2px) · attack 4–6 @12 (iris contracts + tendrils draw back → **glare
   flash**: iris flares, 1px F rim on the leading sclera edge, tendrils whip 4px → recover
   with 1px overshoot) · hit 7–8 @10 (2px knock, husk plates clamp down, iris winces to a
   3×1 line) · death 9–10 @6 (accent extinguished, hover fails, body drops 3px → cracked
   husk dome resting on rows 17–20) · ne rows 11–19 authored for idle/walk/attack/hit
   because **the iris must not appear on the back of the head** — the ne attack flash
   reads only as rim-light leaking around the husk edges + lit tendril tips; death/ne
   reuses se (accent is already out).
4. **Palette slot map** — 1–4 **unused** (12 of 16 colors used; immune to race-palette
   bleed). 5–8: orb sclera (8 top cap → 5 keel). 9–12: husk cowl plates + tendril bodies.
   13–15: iris (D ring, E inner, F 1px core) + three tendril tips — the eye and tips
   literally are the signal.
5. **Idle `se` sketch** (28×22; lowest body pixel row 16 = 4px hover; center tendril tip
   at (14,19), 1px off the ground):

```
............................
............................
............................
...............CC...........
.............CBBA99.........
.........8888BBAA999........
........78888BBAA9999.......
.......78888877BAA9999......
.......7888887766AA999......
......78DDD7777666A999......
......7DEFED776666A999......
......6DEEED666665555.......
.......6DDD666555555........
.......5666655555555........
........55555555555.........
..........5555555...........
..........A.55A.A...........
.........9....9..9..........
.........E....9..E..........
..............F.............
............................
............................
```

Legend: `5–8` sclera keel→top cap · `9–C` husk plates dark rear→light-struck crest +
tendril bodies · `D/E/F` iris ring / iris inner + side tendril tips / pupil-core glint +
center tip.

6. **Readability** — the identity read is **the gap**: a floating mass with three clear
   rows of transparency between keel and engine shadow — nothing else in the bestiary
   hovers, so the daylight under the body is the species ID. Asymmetric teardrop (orb
   leaning screen-left, chitin crest swept back-right, cols 13–21 rows 3–10); tendrils
   staggered 3/4/3 px so the bob reads as hovering mass, not jitter. Accent total: 19px
   (D 10, E 7, F 2) — under a legendary or school palette the eye ignites and everything
   else stays quiet.
7. **Reskins** — *Mireglare* (bile-ivory sclera, moss-rot husk) · *Cinderwatch* (elite:
   charred iron + hot ember) · *Rimegaze* (13–15 only, to the registered `spell/frost`
   values `#1c50b0/#3c8ce0/#b0e8ff` — the minimal legal recolor, proving the rig's signal
   survives an accent-channel-only swap).

---

## 4. From-Reference-to-Fresh Pipeline

> **Tooling status:** the one-line `death` fix in `tools/importSprite.mjs` has been
> applied (parseAnims now accepts idle|walk|attack|hit|death). `biome/map080`
> replacement remains open.

**1. Reference discipline.** The scaffold (`local-assets/`, gitignored) is a pose-language
reference only — study it like a life-drawing class, not a source file. Per rig (~20 min):
open the sheet animated at gameplay zoom and write notes on exactly four things —
silhouette scale (head ~1/3, small feet, ¾ top-down read), dimetric readability (both
shoulders and both feet legible), animation beats (4f idle breaths, anticipation→strike
attacks, 8–9f walk cadence), and where the weight sits on the anchor. Notes are words and
stick-figure thumbnails only. **Then close the reference — it is never open while
painting.** Minimum one-hour cool-down between study and painting the same rig (prefer
overnight for a new archetype). Never, under any circumstances: eyedropper a scaffold
color, create a trace/overlay/onion-skin layer from scaffold pixels, or reuse a
scaffold/FF/WoW name. Any of these poisons the sheet: discard and repaint.

**2. Aseprite workflow.**
1. Export the slot palette once from `palettes.ts` `unit/base` into a `.gpl`/`.pal` in
   slot order: slot 0 transparent, then `#5c3a24 #8a5c38 #c08a58 #e8b888` (skin),
   `#3a2818 #5c4028 #7c5838 #9c7048` (primary), `#2c2c34 #44444e #5c5c68 #787884`
   (secondary), `#4a4a52 #8a8a96 #c8c8d4` (accent).
2. New file in **Indexed mode** with that palette and index 0 transparent; canvas = one
   frame (24×32 or 28×22). Indexed mode makes the 16-color budget and slot semantics
   physically unbreakable while drawing.
3. Draw the `se` row first, facing screen-left, top-lit, ramps never flat fills; append
   `ne` frames after.
4. Export: `aseprite -b <rig>.aseprite --sheet <rig>.png --sheet-type horizontal`.
5. Import (real syntax): e.g. the full two-facing form
   `--anims "idle:0,1@2;walk:2,3,4,5@8;attack:6,7,8@10!;hit:9,10@10!;death:11,12@6!;idle/ne:13,14@2;walk/ne:15,16,17,18@8;attack/ne:19,20,21@10!;hit/ne:22,23@10!"`
   `!` = non-looping; omitting a `/ne` row legally reuses se (the importer duplicates the
   def — required, since the Animator has no runtime fallback). The importer emits
   `<id>.png` + `<id>.json` **including `sourcePalette`** — mandatory; never hand-write a
   manifest without it.

**3. Quality gates (ordered; all must pass).**
1. Importer prints no color-merge warning (≤16 colors).
2. Slot semantics spot-check in the dev harness: `rarity/legendary` changes ONLY the shiny
   bits; `race/orc` ONLY skin; `gear/t3` ONLY materials. Any bleed = wrong slots.
3. Anchor consistency: step every tag frame-by-frame; feet planted on (12,30)/(14,20), no
   bob drift; idle reads as a clean gait (it drives map movement).
4. Mirror safety: flip horizontally — top-lit only, no meaning-bearing asymmetry (text,
   heraldry).
5. All tags present, non-looping ones marked `!`.
6. Zero-code render: drop into `public/sprites/units/`; `loadSpriteOrPlaceholder` picks it
   up with no code edits.

**4. Naming convention.** Ids `hero_<archetype>` / `mob_<species>`, lowercase snake,
original words only. Files `public/sprites/units/<id>.png|.json`. Wiring: `HERO_SPRITES` /
`MONSTER_SPRITES` / `MOB_KEYWORDS` are pure string tables — shipping = string swaps, no
logic changes. New palette variants keep the `category/variant` scheme via
`registerPalette`; imported sheets auto-register as `src/<id>`.

**5. Reference-free shipping checklist (pre-App-Store audit).**
- **Pixel level:** every shipped sheet traces to an `.aseprite` source authored in-repo.
  No source file, no ship.
- **Name level:** `grep -ri 'ffa_|ffta|tonberry|malboro|moogle|tauren|chocobo|bangaa|viera|nu.mou|beholder|worgen' src/ public/`
  returns nothing. This currently fails on `fftaRoster.ts` id tables and race-mapping
  comments — resolved when the original art lands and the tables swap to `hero_*`/`mob_*`
  ids (the display data and regexes are already clean).
- **Palette level:** no scaffold hexes — `biome/map080` is decoded straight from the FFTA
  ROM; replace it with an original grassland ramp (repointing the `biome/meadow` alias and
  `biome()` derivations) or remove it.
- **Tear-out test:** delete `local-assets/` on a clean clone; the game must still build
  and render everything via manifests + placeholders. Run before every submission.

---

## 5. Manifest Examples (machine-verified against the loader, aligned to the final rig layouts)

Schema source of truth: `SpriteManifest` in `src/render/types.ts`, consumed by
`loadSprite`/`decompose`. **Verified facing rule:** `AnimationSet` requires both `se` and
`ne` on every core tag and `Animator.def()` has no ne→se fallback — cheap rigs *repeat*
the se def under `ne` (the importer's default). Only `death` may be omitted entirely
(falls back to `hit`). `sourcePalette` is required (16 entries, `""` at index 0); the
loader derives `frameCount` from the sheet, so the stated sheet dimensions are
load-bearing.

**`hero_vanguard.json`** — full rig, distinct back rows; sheet = one row of 24 frames,
**576×32 px**:

```json
{
  "id": "hero_vanguard",
  "image": "hero_vanguard.png",
  "frameW": 24, "frameH": 32,
  "anchor": { "x": 12, "y": 30 },
  "sourcePalette": ["",
    "#5c3a24", "#8a5c38", "#c08a58", "#e8b888",
    "#3a2818", "#5c4028", "#7c5838", "#9c7048",
    "#2c2c34", "#44444e", "#5c5c68", "#787884",
    "#4a4a52", "#8a8a96", "#c8c8d4"],
  "animations": {
    "idle":   { "se": { "frames": [0, 1],        "fps": 4,  "loop": true  },
                "ne": { "frames": [13, 14],      "fps": 4,  "loop": true  } },
    "walk":   { "se": { "frames": [2, 3, 4, 5],  "fps": 8,  "loop": true  },
                "ne": { "frames": [15, 16, 17, 18], "fps": 8, "loop": true } },
    "attack": { "se": { "frames": [6, 7, 8],     "fps": 10, "loop": false },
                "ne": { "frames": [19, 20, 21],  "fps": 10, "loop": false } },
    "hit":    { "se": { "frames": [9, 10],       "fps": 12, "loop": false },
                "ne": { "frames": [22, 23],      "fps": 12, "loop": false } },
    "death":  { "se": { "frames": [11, 12],      "fps": 6,  "loop": false },
                "ne": { "frames": [11, 12],      "fps": 6,  "loop": false } }
  }
}
```

- se cells 0–12, ne offset +13 except death/ne, which points back at the se cells (the
  prone sprawl is facing-ambiguous — 2 frames saved). All indices < 24 = 576/24.
- `sourcePalette` = the `unit/base` semantic hexes, so decompose is exact-match and every
  registry palette (`race/*`, `gear/*`, `rarity/*`) recolors this one rig legally.

**`mob_gloomling.json`** — cheap rig, one 11-frame row serves both facings; sheet
**308×22 px**:

```json
{
  "id": "mob_gloomling",
  "image": "mob_gloomling.png",
  "frameW": 28, "frameH": 22,
  "anchor": { "x": 14, "y": 20 },
  "sourcePalette": ["",
    "#5c3a24", "#8a5c38", "#c08a58", "#e8b888",
    "#3a2818", "#5c4028", "#7c5838", "#9c7048",
    "#2c2c34", "#44444e", "#5c5c68", "#787884",
    "#4a4a52", "#8a8a96", "#c8c8d4"],
  "animations": {
    "idle":   { "se": { "frames": [0, 1],    "fps": 3,  "loop": true  },
                "ne": { "frames": [0, 1],    "fps": 3,  "loop": true  } },
    "walk":   { "se": { "frames": [2, 3],    "fps": 5,  "loop": true  },
                "ne": { "frames": [2, 3],    "fps": 5,  "loop": true  } },
    "attack": { "se": { "frames": [4, 5, 6], "fps": 8,  "loop": false },
                "ne": { "frames": [4, 5, 6], "fps": 8,  "loop": false } },
    "hit":    { "se": { "frames": [7, 8],    "fps": 10, "loop": false },
                "ne": { "frames": [7, 8],    "fps": 10, "loop": false } },
    "death":  { "se": { "frames": [9, 10],   "fps": 6,  "loop": false },
                "ne": { "frames": [9, 10],   "fps": 6,  "loop": false } }
  }
}
```

- `ne` is *repeated, not omitted* — a missing `ne` key is a runtime crash, not a graceful
  reuse. This duplication is exactly what the importer emits for tags without a `/ne` row,
  and costs zero sheet pixels.
- An even cheaper variant is also legal: two tags may point at the same cells (e.g. walk
  reusing idle's cells at a higher fps) — an `AnimDef` is just a list of cell indices.

**`mob_ashdrake.json`** — non-canonical frame size + per-tag back rows; sheet = 22 frames,
**792×26 px**:

```json
{
  "id": "mob_ashdrake",
  "image": "mob_ashdrake.png",
  "frameW": 36, "frameH": 26,
  "anchor": { "x": 20, "y": 24 },
  "sourcePalette": ["",
    "#3a3230", "#544a46", "#6e625c", "#8a7c74",
    "#26242c", "#3c3a46", "#545260", "#706e7e",
    "#402420", "#5e342a", "#7c4836", "#9a6046",
    "#8a2c1c", "#d05a24", "#f0a04c"],
  "animations": {
    "idle":   { "se": { "frames": [0, 1],       "fps": 3,  "loop": true  },
                "ne": { "frames": [13, 14],     "fps": 3,  "loop": true  } },
    "walk":   { "se": { "frames": [2, 3, 4, 5], "fps": 8,  "loop": true  },
                "ne": { "frames": [15, 16, 17, 18], "fps": 8, "loop": true } },
    "attack": { "se": { "frames": [6, 7, 8],    "fps": 10, "loop": false },
                "ne": { "frames": [19, 20, 21], "fps": 10, "loop": false } },
    "hit":    { "se": { "frames": [9, 10],      "fps": 12, "loop": false },
                "ne": { "frames": [9, 10],      "fps": 12, "loop": false } },
    "death":  { "se": { "frames": [11, 12],     "fps": 6,  "loop": false },
                "ne": { "frames": [11, 12],     "fps": 6,  "loop": false } }
  }
}
```

- Frame geometry is manifest data — the loader slices any `frameW`/`frameH` (the scaffold
  already ships 16×40 and 32×40 through the same path); the contract that matters is the
  feet-center anchor, intact at (20,24).
- Facing resolution is **per tag**: distinct ne cells for idle/walk/attack (the tags on
  screen most), se-reuse for hit/death — a middle price point between the hero (full 2×)
  and the gloomling (1×).
- `sourcePalette` is "colors as drawn", not "as rendered": the drake's own hexes (ash hide
  1–4, charcoal scales 5–8, ember-brown membrane 9–12, hot ember 13–15) map to slots at
  load, register as palette `src/mob_ashdrake`, and any registry palette can still recolor
  the rig because the slot bands are respected.

---

## 6. Rebrand Rename Inventory

Internal ids (`alliance`, `horde`, `tauren`, talent/ability ids, zone/town/mob/item ids,
`race/hornborn`) never change; everything below is display-string only. **Status: all
picks below have been applied to `src/data/` (talents, abilities, classes, races,
factions, zones, towns) and the prose in `nameGen.ts`.**

### 6.1 Triage summary

**RENAMED (were unshippable):** The Alliance, "For the Alliance.", The Horde, "Lok'tar
Ogar.", Tauren · Warrior: Thunder Clap, Overpower, Anger Management, Deep Wounds, Impale,
Sweeping Strikes, Hamstring, Mortal Strike, Shield Wall, Bloodthirst · Mage: Frost
Warding, Ice Shards, Frostbite, Permafrost, Piercing Ice, Cold Snap, Blizzard (WoW spell
AND the publisher's trademark), Arctic Reach, Frost Channeling, Shatter, Ice Block, Cone
of Cold, Ice Barrier, Winter's Chill, Frostbolt, Combustion, Time Warp · Rogue:
Remorseless Attacks, Malice, Ruthlessness, Slice and Dice, Expose Armor, Lethality, Vile
Poisons, Cold Blood, Seal Fate, Vigor, Sinister Strike, Evasion, Shadow Step · Warlock:
Suppression, Improved Corruption, all three "Curse of X", Drain Soul, Life Tap, Fel
Concentration ("Fel" always renames), Amplify Curse, Grim Reach, Dark Pact (talent +
active, one shared rename), Nightfall, Siphon Life, Shadow Bolt, Drain Life. Also
description-level: Eviscerate (→ Sever), Rend (→ serrated bleed).

**Borderline → renamed:** Tactical Mastery, Blade Dance, Murder, Improved Poisons, and
**Voidweave** (one letter from WoW's *Voidweaver* hero tree, titling a renamed-Affliction
kit — now **Bleakweave**, harmonizing with "Bleak Bargain").

**KEPT (deliberate few, generic vocabulary):** Ironcleave, Glacial Rite, Shadowed Edge,
Iron Strike, Battle Fervor, Two-Handed Mastery, Glacial Bolt, Vicious Cuts, Harrowing
Grip, Deflection, Serrated Blade, Weapon Mastery, Icy Grip, Battle Cry.

### 6.2 Applied renames

**Warrior — Ironcleave:** Tactical Mastery → **Veteran's Poise** · Thunder Clap →
**Stormpeal** · Overpower → **Overbear** · Anger Management → **Banked Fury** · Deep
Wounds → **Lasting Wounds** · Impale → **Run Through** · Sweeping Strikes → **Reaping
Arc** · Blade Dance → **Turning Steel** · Hamstring → **Hobbling Cut** · Mortal Strike →
**Gravewound** (a blow the grave keeps open) · Shield Wall → **Hold the Line** (echoes
*"Hold the last light"*) · Bloodthirst → **Red Harvest**.

**Mage — Glacial Rite:** Frost Warding → **Rimeguard** · Ice Shards → **Jagged Rime** ·
Frostbite → **Creeping Freeze** · Permafrost → **Long Winter** · Piercing Ice → **Keening
Cold** · Cold Snap → **Sudden Winter** · Blizzard → **Snowsquall** · Arctic Reach →
**Farfrost** · Frost Channeling → **Winter Discipline** · Shatter → **Brittlebreak** · Ice
Block → **Glacial Tomb** · Cone of Cold → **Breath of Winter** · Ice Barrier →
**Winterward** · Winter's Chill → **Deepening Cold** · Frostbolt → **Rimebolt** ·
Combustion → **Cinderburst** · Time Warp → **The Unwound Hour**.

**Rogue — Shadowed Edge:** Remorseless Attacks → **Grim Momentum** · Malice → **Ill
Intent** · Ruthlessness → **No Wasted Motion** · Murder → **Red Work** · Slice and Dice →
**Quickened Steel** · Expose Armor → **Find the Seam** · Lethality → **Killcraft** · Vile
Poisons → **Bitter Venoms** · Improved Poisons → **Coated Blades** · Cold Blood → **Dead
Calm** · Seal Fate → **Written in Blood** · Vigor → **Deep Reserves** · Sinister Strike →
**Cruel Stroke** · Evasion → **Slip the Blade** · Shadow Step → **Duskstep** · Eviscerate
(finisher, descriptions) → **Sever**.

**Warlock — Bleakweave** (the "Curse of X" family renames as **"Dirge of X"** — funeral-
song language for the long-war melancholy): Suppression → **Creeping Certainty** ·
Improved Corruption → **Quickened Rot** · Curse of Weakness → **Dirge of Faltering** ·
Drain Soul → **Last Gleaning** · Life Tap → **Blood Toll** · Curse of Agony → **Dirge of
Anguish** · Fel Concentration → **Unbroken Litany** · Amplify Curse → **Swelling Refrain**
· Grim Reach → **Far Lament** · Dark Pact (both) → **Bleak Bargain** · Curse of Exhaustion
→ **Dirge of Weariness** · Nightfall → **Gathering Dark** · Siphon Life → **Tithe of
Wounds** · Shadow Bolt → **Umbral Bolt** · Drain Life → **Red Thread**.

**Factions & race:** The Alliance → **The Lastlight Concord** (*"Hold the last light."*) ·
The Horde → **The Ashmarch** (*"Ash behind us, fire ahead."*) · Tauren → **Hornborn**.
Runners-up recorded: The Sworn Vigil / The Beacon Oath; The Embertide / The Blackbanner;
Aurochsen / Broadhorn.

### 6.3 Repo-verified Warcraft tells in zone/town display data (applied)

| Was | Now |
|---|---|
| Grimshade Worgen / "pale-furred worgen" | **Grimshade Wolfkin** / "pale-furred wolfkin" |
| Warsong Mesa / Grunt / clan / Bastion | **Wardrum** Mesa / Grunt / clan / Bastion |
| Overlord Grommash Ironjaw | **Overlord Drogmar Ironjaw** |
| Hexlord Zal'grak the Venomous | **Hexcaller Zal'grak the Venomous** |
| Chieftain Rok'nar Bloodscream | **Chieftain Rok'nar Bloodroar** |
| Warchief Zul'thak | **Warchief Vor'thak** |
| Dreadlord Ashvael the Burning | **Balelord Ashvael the Burning** |
| "Horde" in zone/town/nameGen prose | **Ashmarch** |
| Goblin Sapper, Harvest Golem (aggregate dilution) | **Goblin Demolitionist**, **Harrowfield Golem** |

Remaining aggregate (individually generic, monitor only): Troll Witch-Doctor, Troll
Berserker, The Crossroads Market, The Maw Eternal / Maw Devourer.

### 6.4 Grep list (submission sweep — exact strings; hits inside internal lowercase ids
are expected and exempt)

```
The Alliance          For the Alliance      The Horde         Lok'tar        Ogar
Tauren                Fel                   Warcraft          Azeroth
Worgen                Warsong               Grommash          Hexlord        Bloodscream
Zul'                  Dreadlord             malboro           tonberry       beholder
floateye              toughskin             moogle            bangaa         viera
Tactical Mastery      Thunder Clap          Overpower         Anger Management
Deep Wounds           Impale                Sweeping Strikes  Blade Dance    Hamstring
Mortal Strike         Shield Wall           Bloodthirst       Eviscerate
Frost Warding         Ice Shards            Frostbite         Permafrost     Piercing Ice
Cold Snap             Blizzard              Arctic Reach      Frost Channeling
Shatter               Ice Block             Cone of Cold      Ice Barrier    Winter's Chill
Frostbolt             Combustion            Time Warp
Remorseless Attacks   Malice                Ruthlessness      Murder         Slice and Dice
Expose Armor          Lethality             Vile Poisons      Improved Poisons
Cold Blood            Seal Fate             Vigor             Sinister Strike
Evasion               Shadow Step
Suppression           Corruption            Curse of          Drain Soul     Life Tap
Fel Concentration     Amplify Curse         Grim Reach        Dark Pact      Nightfall
Siphon Life           Shadow Bolt           Drain Life        Voidweave
```

---

## 7. Build status & open items

**Sprite set BUILT (2026-07-21), available behind `?noffta`.** All 18 sheets ship in
`public/sprites/units/` (`hero_vanguard/magus/shade/colossus/cogling`;
`mob_gloomling/duskcat/ashdrake/orbwatcher/gravewalker/cinderwisp/marshcoil/snapvine/
nightflit/scuttler/shivtail/gnarljaw`; + `mob_grubkin` as a cogling art variant). The 9 spec
rigs were generated by transcribing the verified idle grids above and animating them
mechanically (part-based bob/stride/lunge/recoil/collapse); the 7 brief rigs were
procedurally drawn to their §2.2 design lines. All pass `importSprite.mjs` clean.

**Art source is toggle-driven — and the default FLIPPED on 2026-08-01** (`fftaRoster.ts:14`;
this paragraph described the pre-flip world until it was corrected on 2026-08-05). The
**originals are now the default and the only thing that can ever ship**. The scaffold is
dev-only behind `?ffta`, guarded by two independent locks — the build must be `DEV` *and*
the flag present — so `import.meta.env.DEV` folds to `false` in a release bundle and the
bundler strips every scaffold branch *and* the `local-assets/…` path strings with it.
Verified in `store/LAUNCH.md`: 18 manifests + 18 sheets fetched, **0** requests to
`local-assets`, and `grep -c local-assets dist/assets/*.js` → **0**.

Worth knowing why the flip mattered more than a policy checkbox: the pre-flip default meant
originals hid behind `?noffta`, **which no packaged native build could ever set** — so the
shipping app rendered programmatic placeholder blobs and a town with no ground. The roster's
`ffa_*` keys were deliberately left un-renamed; they are load-bearing cache keys.

Originals ship **se-only** (importer auto-reuses for the back facing — the sanctioned MVP
path).

Remaining:
1. **Polish pass** — the 7 brief-designed monsters read correctly but are coarser than the
   spec rigs; hand-refine in Aseprite when time allows. Author distinct back-facing (`/ne`)
   rows for the high-visibility heroes.
2. **[Speculative] fork/variant pool** (add on observed weak reads): `hero_stoutguard`
   (dwarf), colossus horned-head pass (hornborn), goblin ear fork on cogling, troll tusk
   fork, `mob_tuskhog` (boar), `mob_carrionkite` (bird).
3. **Tooling:** ~~`death` fix in `importSprite.mjs`~~ (done); ~~`--palette` slot-order
   flag~~ (done); replace `biome/map080`.
4. **Mount rigs (§2.4b, added 2026-08-05):** `mount_gryphon` and `mount_wyvern`, plus a
   seated hero pose or an accepted standing-at-saddle-offset MVP. Unspec'd — needs a §3
   template pass each. Gated by `.planning/world-systems-plan.md` Track F, which lands F0–F2
   (the city-gated journey model and the flight master) before any of this art is needed.
5. **Internal-id cleanup (post-launch, needs save migration):** snake_case ids like
   `warsong_mesa`, `grimshade_worgen`, `worgen_hide` still carry coined words inside the
   bundle. Not user-visible and exempt from the submission sweep, but worth retiring when
   a save-migration window opens.
