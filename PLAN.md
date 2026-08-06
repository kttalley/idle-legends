# PLAN — Dimetric Graphics System

Replace Idle Legends' procedural sprites, ASCII map, and emoji icons with a dimetric (2:1),
palette-indexed, sprite-based renderer in the style of GBA-era tactics games — implemented
natively in vanilla Canvas 2D. Game logic is untouched; this is a presentation-layer rebuild.
Target: mobile Safari / iOS WebView, App Store via wrapper by late September.

## My understanding of the brief

- **Reference repo** `../ff-tactics-decomp` is studied once in Phase 0 to produce
  `docs/graphics-spec.md`, written in my own words. Nothing else is ever derived from it —
  no code, tables, constants, palettes, or assets. It is treated as read-only.
- **All art is original placeholder art** I generate programmatically, in the exact indexed
  format that hand-authored Aseprite art will later replace via pure file drop.
- **Game logic modules stay as-is.** The renderer reads existing Zustand state through a thin
  adapter. Save data must keep working.
- **No new runtime frameworks.** Vanilla Canvas 2D. (Current stack: Vite + React 18 +
  TypeScript + Zustand + Tailwind. The renderer will be imperative Canvas inside thin React
  host components, matching how `CombatParticles` already works.)
- **Phase gates:** commit at each phase boundary, show the result, wait for approval.
- Simplifications baked in: flat maps (no elevation), 2 drawn facings mirrored to 4,
  four animations only (idle / walk / attack / hit), single weapon layer.

## What exists today (integration points)

| Current | File | Replaced in |
|---|---|---|
| ASCII 55×22 char grid map, 64×64 wrapping tile world, weather overlay | `src/components/game/WorldMapView.tsx` | Phase 3 |
| Procedural pixel-blob avatars (seed + palette) | `src/components/sprites/AvatarRenderer.tsx` | Phase 2 |
| Placeholder colored-div sprites + empty manifest | `src/components/sprites/SpriteRenderer.tsx` | Phase 2/4 |
| Combat panel: avatars face off, anim classes driven by `floatingNumbers` diffing | `src/components/game/CombatView.tsx` | Phase 2 |
| Zone map generation (CA terrain: terrain/water/cliff + nodes) | `src/engine/mapGen.ts` | kept — renderer consumes its `ZoneMap` output |
| Emoji icons (abilities, nav, nodes) | various UI components | Phase 4 |

Useful existing state (no store changes anticipated): `zoneMaps[zone].tiles[y][x].type`
(`terrain | water | cliff`), `zoneMaps[zone].nodes`, `playerMapPos` (fractional, wrapping),
`mobMapOffset`, `currentMob`, `floatingNumbers` (already used as the combat-event feed),
`gameMode`, `playerClass`, `equipment`, `bossesDefeated`, `weatherState`.

**Combat events:** `CombatView` already infers attack/hit from new `floatingNumbers` entries.
The Phase 2 adapter will consume the same feed — zero combat-logic diffs.

## Intended file layout

```
docs/
  graphics-spec.md          # Phase 0 output — the only artifact of reading the decomp
  art-authoring.md          # Phase 4 — hand-authoring spec (sizes, slots, anchors, Aseprite export)

src/render/                 # renderer core — no React, no game imports
  types.ts                  # manifest, palette, map, animation type defs
  indexedSprite.ts          # indexed-PNG + JSON manifest loader → index maps
  palette.ts                # named palettes; pre-baked recolored sheets cached by (spriteId, paletteId)
  palettes.ts               # palette registry: races, 4 gear tiers, elite, teams
  tilemap.ts                # 2:1 dimetric tilemap (32×16 footprint), offscreen static buffer
  animation.ts              # frame tags, per-frame anchors, 2-facing mirror logic
  scene.ts                  # entity list, painter's-order depth sort, frame loop (zero alloc)
  placeholderArt.ts         # programmatic generation of placeholder indexed sprites/tilesets
                            #   (authored-format-exact; deleted when real art lands)

src/render/dev/
  harness.html + harness.ts # standalone dev page (vite second entry): map + 6 units,
                            #   animation cycling, palette-swap demo, fps meter

src/render/adapter/         # thin read-only bridges from game state → scene
  combatAdapter.ts          # Phase 2: gameMode/floatingNumbers/currentMob → diorama entities
  mapAdapter.ts             # Phase 3: ZoneMap tiles/nodes + playerMapPos → tilemap + entities

src/components/game/
  CombatScene.tsx           # Phase 2: canvas host replacing avatar blobs inside CombatView
  DimetricMapView.tsx       # Phase 3: canvas host replacing WorldMapView (old path behind fallback flag)

public/sprites/             # authored assets: indexed PNGs + JSON manifests
  manifest.json             # master manifest
  units/…  tiles/…  icons/…
```

## Phase summary

- **Phase 0 — Study & spec.** Read decomp rendering/sprite/animation/palette systems.
  Write `docs/graphics-spec.md`: sprite cel organization & compositing, facing/mirroring,
  anchors; indexed palettes & swap-based variants; tile/layer/draw-order; and the browser
  translation plan (adopt / simplify / drop). No game code.
- **Phase 1 — Renderer core.** Everything under `src/render/` + dev harness, plus
  `tools/importSprite.ts` (RGBA/indexed PNG → our indexed manifest format) feeding the
  gitignored FFTA scaffold, and a static HUD mock in the harness (action bar / minimap /
  unit-frame cards as DOM overlay) to judge the new UI composition early.
  Acceptance: 60fps at 4× CPU throttle with full map + 6 animated units, no frame-loop
  allocations, one rig → 3+ variants by palette ID alone.
- **Phase 2 — Unified world scene** *(restructured by owner decision — the dimetric
  engine replaces the roguelike-abstraction UI, not just individual panels)*. One
  full-viewport dimetric scene replaces BOTH the ASCII `WorldMapView` strip and the
  side-by-side combat arena: the player walks the zone in-world, mobs approach in-world
  (state already models this via `mobMapOffset`), and attack/hit animations + floating
  damage numbers play over the sprites, driven by the existing `floatingNumbers` feed.
  Existing camera semantics (player-centered, fractional scroll, 64×64 wrap) preserved.
  Old ASCII+arena path kept behind a fallback flag.
  Acceptance: full fight plays out in-world in sprites; Sunhollow Meadows renders as
  tiles and the player traverses it; zero combat-logic diffs.
- **Phase 3 — HUD shell (WoW/Diablo-style).** DOM overlay on top of the canvas (text,
  tooltips, and Tailwind stay crisp; canvas renders only the world): **action bar
  docked bottom** (reskinned `SkillBar` + mode/town buttons); **minimap top-left**
  (zone `ZoneMap` rendered to a small canvas with player/mob/node blips — the "radar");
  **player unit-frame card top-right** (HP/mana/XP, buffs) with the **target frame
  adjacent** (mob HP, DoTs, cast state); gathering/crafting/town become overlay panels.
  Acceptance: playable end-to-end in the new shell; old layout behind the fallback flag.
- **Phase 4 — Pipeline & handoff.** `docs/art-authoring.md`; palette registry demonstrated
  (races, 4 gear tiers, elite); emoji UI icons → placeholder sprite icons.

## Working practices

- Small commits per milestone on branch `hackathon-refactor` (or a new branch if you prefer — say so).
- After each phase: run the game, report what changed / risks / open questions, wait.
- Out of scope, untouched: Capacitor/iOS, IAP, elevation, extra anims, particles beyond
  what exists, paper-doll beyond one weapon layer, new game features.
- Final-report flag (not fixed): several ability/talent names are borrowed from WoW
  (e.g. the talent files `arms.ts`, `frost.ts`, `affliction.ts`, `assassination.ts`) and
  need original replacements before store submission.

## Longer horizon — hackathon, itemization, and monetization

Not built in Phases 0–4, but Phases 1 and 4 make choices now so this costs nothing later:

- **Rarity = palette ID.** The core premise — one rig/indexed sprite × N palettes — is a
  content multiplier: rarity tiers, elite mobs, race variants, and gear tiers are data
  (a named color ramp in the registry), not art. The palette registry becomes the game's
  itemization taxonomy. To keep that true, palette IDs are named **semantically** from day
  one (`rarity/common..legendary`, `gear/t1..t4`, `elite`, `race/*`) rather than ad hoc,
  and the accent slots (13–15) are reserved as the "rarity signal" channel — tier glow /
  metal colors live there so any rig can express rarity without redrawing.
- **Scarcity is visual and cheap.** Because recolored sheets are pre-baked per
  (spriteId, paletteId), a rare drop, seasonal variant, or purchased skin is one manifest
  entry + one palette entry — no code, no new frames. The Phase 4 file-drop pipeline is
  therefore also the future content/skin-pack pipeline; the manifest schema will allow
  additive packs (multiple manifest files merged) rather than one monolith.
- **Monetization posture (App Store).** Palette-swap cosmetics are the safest iOS
  monetization shape: pure cosmetics avoid pay-to-win optics, and IAP later routes through
  StoreKit (RevenueCat wrapper — still out of scope here). Constraints to design around
  when that lands: Apple requires published odds for any loot-box/gacha mechanic, no
  external purchase links, and rarity mechanics affect age rating. Nothing in Phases 0–4
  implements this; the renderer just guarantees a purchased `paletteId` (or sprite pack)
  is renderable the moment it's granted.
- **Itemization visibility.** The single weapon layer means item drops can be *seen*:
  weapon rig chosen by item type, weapon palette by item rarity tier. That's the hook for
  "your character visibly gets cooler as loot improves" — the core idle-game retention/
  monetization loop — without paper-doll complexity.
### Hackathon: RevenueCat Shipaton 2026 (devpost)

Hard facts that shape the schedule and the monetization design:

- **Dates.** Event window Jul 31 – Sep 30, 2026. The app's *first public version* must
  launch on the App Store between **Aug 1 and Sep 30**; submissions close Sep 30.
  New apps only (updates to already-shipped apps don't qualify) — fine, this has never
  shipped.
- **Required:** RevenueCat SDK powering **at least one in-app purchase**. So IAP moves
  from "someday" to a required post-Phase-4 milestone: the natural fit is a cosmetic
  **palette-pack / skin IAP** (one entitlement unlocking rarity/seasonal palette IDs) —
  pure cosmetic, App-Store-review-safe, and a literal demonstration of this renderer's
  palette-as-content architecture. Also targets the **HAMM award** ("smartest use of
  RevenueCat to drive real revenue").
- **Best Game award** judges gameplay quality, **art direction**, and **monetization
  fit** — the dimetric rebuild is the art-direction play; palette-tier itemization is the
  monetization-fit play. **Grand Prize** judges *traction and growth during the event*,
  which rewards launching **early** in the window, not on Sep 30.
- **Submission assets** (produced by/after Phase 4): ≤2-min demo video on device,
  published store URL, 1024×1024 app icon, ≥1 screenshot at 1179×2556 (no frame), and a
  **promo code / free trial so judges can access premium features**. The app icon and
  screenshots should come out of the same sprite pipeline (a hero rig render) — worth
  keeping in mind when authoring final art.

**Timeline implication.** Working back from a target store launch in **early September**
(leaving review-rejection buffer + in-window traction time): Phases 0–4 should land by
**mid-late August**, followed by a short post-plan milestone — Capacitor wrap + RevenueCat
SDK + one cosmetic IAP + store assets. That milestone stays out of scope for this plan but
is now the reason the phase gates can't drift. The WoW-derived ability/talent names are a
**launch blocker**, not a nice-to-have — they must be replaced before store submission.


## Placeholder art policy (amended by owner decision, Phase 1)

**Decision:** extracted FFTA sprites (the decomp's already-dumped `extracted/*.png`) ARE
used as a **local-only dev scaffold** during Phases 1–3, because evaluating animation,
art direction, character angles, and perspective — the things this engine lives or dies
on — is not honest with programmer-art silhouettes. This amends rules 1–2 of the original
brief by owner decision, under hard guardrails:

- **Never committed.** Scaffold assets live in `local-assets/` which is `.gitignore`d in
  the same commit that creates the import path. I (orchestrator) verify no ripped pixels
  are staged before every commit.
- **Never published.** Nothing containing scaffold art goes into #BuildInPublic posts,
  screenshots, demo video, store assets, or any push to a remote.
- **Format firewall.** Scaffold PNGs pass through `tools/importSprite.ts` into OUR
  indexed-manifest format — the renderer never grows FFTA-specific code paths, and the
  import script is the same one gen-AI and hand-drawn art will use (pipeline validator).
- **Tear-out = delete `local-assets/` + the loader falls back automatically** to
  programmatic placeholders (which remain the committed, shippable default).
- **Launch blocker:** the game must ship with zero scaffold-derived pixels; replacement
  art comes from gen-AI derivatives first (user has an image-generator endpoint), then
  hand-drawn (every sprite/tile/item, long-term).

## Asset generation pipeline (amended, 2026-08-01)

Full brief and handoff: `tools/spritegen/CLAUDE.md`. Runs on the Windows dual-3090 rig;
`tools/spritegen/` is committed so it syncs, `local-assets/` still never does.

**Shape of the pipeline.** AI generates the *design* once, at high resolution, in one
canonical pose. Deterministic code and a human do the pixels and the animation. Stages:
(A) SDXL + ControlNet concept at 768×1024, conditioned on our own rig; (B) downres +
quantization into the 15 semantic palette slots, then a ~20–40 min Aseprite pass;
(C) animation by integer-pixel deformation or direct 3D posing — **never** frame-by-frame
generation; (D) palettes never baked, all variety stays runtime.

**Why not img2img over the FFTA sheets.** Three technical reasons and one legal one.
SD works in 8×-downscaled latent space, so 24×32 is a 3×4 latent — there is nothing there;
13 independently generated frames give 13 different characters, and animation needs pixel
identity; SD has no concept of "this region is `secondary2`", which breaks the palette-slot
contract the entire monetization design rests on. And at low denoise the source survives
into the output as derivative work, which would move the contamination from deletable
scaffold pixels into shipped art.

**The rig is the load-bearing artifact** — it is both the ControlNet conditioning for every
unit and the zone map for slot quantization, so an error in it propagates to all 30 units.
Two procedural attempts were rejected (`tools/scaffold/ffta_mannequin.py`, then
`tools/spritegen/rig.mjs`); both approximate a dimetric projection with hand-coded geometry
and look like it. **Decision: the rig comes from Blender** — orthographic camera at the
dimetric 2:1 angle, flat per-zone materials so the render doubles as the zone map. Correct
projection instead of an approximated one, original work we own outright, and posing it
yields every animation frame from one source.

**Measuring proportions from the scaffold was tried and abandoned.** At 16px wide FFTA
humanoids have no neck constriction — head and shoulders are one continuous mass — so
silhouette-based segmentation cannot recover "heads tall", the number the rig most needs.
The metasprites also bundle a full-width ground shadow, capes, and weapons into the
silhouette. Details in `tools/spritegen/CLAUDE.md` so it isn't retried.

**Gate:** one hero (`hero_vanguard`) must complete rig → concept → quantize →
`importSprite` → in-game at 3×, reading correctly in motion and recoloring cleanly across
three palettes, before any batch work.

## Track M — monetization strategy (post-Phase-4 milestone, pre-launch)

### Principles

1. **Art is the product.** The long-term promise is every sprite/tile/item hand-drawn.
   Monetization sells the art and its scarcity — not power, not progress relief from
   artificial pain. This keeps App Store review clean, age rating low, and the "Best
   Game / Design" judging story coherent.
2. **No gambling at launch.** Direct purchase only — you see exactly the palette/skin
   you're buying. Skips Apple/Google loot-box odds-disclosure requirements entirely,
   avoids regional gacha restrictions (e.g. Benelux), and keeps the age rating down.
3. **Real-money pricing, no opaque gem currency.** Dual-currency obfuscation is
   increasingly regulator-hostile (EU consumer-law direction) and off-brand for an
   art-forward game. Prices in dollars; a soft *earned* currency (gold) stays purely
   in-game.
4. **Free to download, no forced ads.** Idle players expect F2P; interstitial ads would
   cheapen the art identity. Optional rewarded ads are a later experiment, not a pillar.

### Architecture → SKU map (why this renderer is the monetization engine)

| SKU shape | Mechanism in our system | Notes |
|---|---|---|
| Cosmetic palette packs | new palette IDs granted by RevenueCat entitlement | zero marginal art cost; $1.99–4.99 |
| Limited "colorway drops" | time-limited palette IDs (streetwear model) | scarcity/FOMO **without** gambling — sold directly, visible before purchase |
| **Prismatic (one-of-a-kind) palettes** | palette generated deterministically from the player's seed/name — the generative-emergent hook | every player's is provably unique; deterministic, so not a loot box; premium $4.99–9.99 |
| Founder / Artist editions | early generative-era skins flagged as founder items; **auto-upgraded to hand-drawn** when real art lands | turns the generative→hand-drawn arc into a purchase reason and a #BuildInPublic story |
| Season pass ("campaign") | each season = a hand-drawn art drop (new rigs/tilesets/palettes) + cosmetic track | post-launch retention engine; $4.99–9.99/season |
| Supporter subscription | monthly hand-drawn cosmetic + QoL (extra loadouts, cloud save) | $2.99–4.99/mo; QoL only, never throughput |
| Time skips (later, carefully) | idle-genre standard; sell only if offline progression stays genuinely generous free | never engineer pain to sell relief; revisit post-launch with data |

### Price ladder (launch)

- $1.99 anchor cosmetic (single palette pack) · $4.99 hero SKU (Founder Pack: palette
  set + founder flag + prismatic) · $2.99–4.99/mo supporter sub. Two to three SKUs
  **maximum** at launch — the Shipaton HAMM story is "entitlement → palette ID, one
  clean mapping," not a SKU zoo. RevenueCat Paywalls for price A/B post-launch.

### Disclosures & compliance checklist (launch blocker items)

- Subscriptions: clear price/term/auto-renew language + working **Restore Purchases**
  (Apple 3.1.x hard requirements).
- No randomized paid items at launch ⇒ no odds disclosure needed; if gacha is ever
  added, both stores require published odds and the age rating changes.
- IAP only via StoreKit/Play Billing (through RevenueCat) — no external purchase links
  (subject to current store rules per region).
- Google Play data-safety form + Apple privacy nutrition label (RevenueCat = purchase
  data processor).
- Age rating target: keep to ~9–12+ (fantasy violence, no simulated gambling).

### Sequencing

- **M0 (Shipaton launch):** Founder Pack + one palette pack + optional supporter sub,
  via RevenueCat; paywall shows live-rendered palette previews (the renderer *is* the
  merchandising surface — the shop preview is just the dev-harness scene pointed at
  premium palette IDs).
- **M1 (in-event updates):** first limited colorway drop + prismatic palettes —
  demonstrates "growth activities during the event" for Grand Prize judging.
- **M2 (post-event seasons):** season passes keyed to hand-drawn art drops; founder
  auto-upgrades honored; rewarded-ads experiment only if data says so.

## Track P — cloud async faction PvP (in-event update target)

**Shape:** asynchronous "ghost" PvP — no realtime netcode. Players' rosters (character
snapshot: level/class/race/stats/equipment/talents + their *look* as `(spriteId,
paletteId)` pairs) live in cloud accounts. A duel fetches an opponent snapshot and runs a
**deterministic, seeded, headless combat sim** (the existing tick-based `combat.ts` logic
run without UI) — both sides see the same result. Faction (The Lastlight Concord / The Ashmarch)
aggregates individual results into a **faction war leaderboard**; individual ladders per
season alongside.

**Why this architecture is unusually good at it:**
- An opponent's entire visual identity syncs as a handful of sprite/palette IDs — bytes,
  not assets — and the dimetric combat scene can render any roster instantly. Head-to-head
  battles are fully visual for free.
- **PvP is the display case that makes cosmetic IAP convert** — opponents *see* your
  prismatic/limited palettes on the ladder and in duels. Track M's cosmetics gain social
  value the moment Track P ships; faction-war seasons pair naturally with season passes.

**Backend (decision gate before build):** accounts + roster store + leaderboards.
Recommend Supabase or Firebase for auth/rosters/snapshots; leaderboards either same
backend (cross-platform-ready) or native Game Center (free, iOS-credible, zero server).
No gameplay servers needed — the sim is client-side deterministic in P0.

**Sequencing:**
- **P0 (MVP, sized as the first or second in-event update):** account link, snapshot
  upload on save, "Duel" — fetch 3 opponent choices, run seeded sim, render the fight
  in the dimetric scene, weekly individual ladder + faction totals. In-event feature
  updates are exactly the "growth momentum during the event" the Grand Prize judges.
- **P1 (post-event):** faction-war seasons with cosmetic-only rewards, brackets/
  matchmaking by level band, snapshot server-side validation.

**Risks:** determinism discipline (all combat RNG must be seedable — audit `combat.ts`
for `Math.random` before P0); cheat surface (P0 accepts client-trust snapshots, validate
server-side in P1); scope pressure — Track P is explicitly **not a launch blocker**; the
graphics rebuild and Track M/R own the runway to launch.

**Determinism debt — mostly PAID DOWN 2026-07-28.** The seedable-RNG audit is the
load-bearing prerequisite for the entire ghost-PvP premise: if both clients cannot replay
a duel to the same result from one seed, there is no async PvP.

The raw "28 unseeded `Math.random` sites" count badly overstated the job. Filtered to
rolls that change the OUTCOME of a *duel*, it was **8 rolls and one id**:

- `engine/combat.ts` — 5 outcome rolls (crit, poison proc, extra-strike, flurry,
  avoidance/block) plus DoT id minting. **All six now fixed.**
- `store/gameStore.ts` — 3 in-tick procs: Nightfall (~L1388), Creeping Freeze (~L1570),
  Echo (~L2251). **Still unseeded** — see below. The other 15 sites are worldgen, naming,
  log/floater ids and cosmetic jitter, and never needed seeding.
- `engine/loot.ts` — 4 sites, all loot. A duel drops no loot, so these are irrelevant to
  determinism; they matter only for reproducible economy sweeps.

**What shipped (2026-07-28):**
- `engine/rng.ts` — mulberry32 + `subStream`, matching the generator `tools/sim/run.mjs`
  already installs globally, so streams are comparable.
- `AttackContext.rng` threads a seeded stream through `resolvePlayerAttack`; `resolveMobAttack`
  gained an `rng` parameter. Both default to `Math.random`, so every existing caller is
  behaviourally unchanged.
- DoT ids are a monotonic counter (`resetDotIds`), which also removes a real collision bug:
  the old `Date.now()`-plus-4-random-chars minter could mint duplicates within one ms.
- `engine/fight.ts` — **`runFight(seed, a, b)`, the store-free fight loop.** This was the
  actually-missing piece: `combat.ts` only ever resolved a *swing*, while the fight loop
  lived inside `gameStore.tick`, tangled with worldgen, loot and XP. It is a LOOP, not a
  second combat model — every number still comes from the existing resolvers.
- `tools/sim/fight.mjs` + `src/sim/fightSim.ts` — the acceptance test. Deliberately does
  NOT install a seeded global `Math.random` (that would make it pass vacuously).
  **Measured: 20/20 cases byte-identical across runs, 32/32 seeds produce distinct logs.**

**Remaining P0 work:** lift Nightfall / Creeping Freeze / Echo out of the store tick into
the resolvers. Until then `runFight` does not fire them, so a duel is deterministic but not
yet a perfect match for the player's own tick. Seeding them in place would need a seed in
`GameState` and a save migration; moving them into `combat.ts` is the cheaper fix and pays
off `fight.ts`'s fidelity gap at the same time.

## Track L — living world / ambient MMO sim (post-launch vision, composes with Track P)

**Shape:** the world feels populated. As our idle legend wanders a zone, *other*
heroes — same shape as the player (class/race/level + a `(spriteId, paletteId)` look) —
roam the same tiles: fighting monsters, gathering, moving between nodes, idling near
towns. They are **ambient agents**, not networked opponents: each is a lightweight
state machine (wander → engage nearby mob → fight via the existing headless combat sim →
loot → move on) rendered as ordinary dimetric entities in the world scene. NPCs (quest
givers, vendors) stand at town/node anchors with occasional barks. The result is a
single-player idle game that *reads* like a busy MMO server.

**Why this architecture is unusually good at it:**
- A hero's entire identity is a handful of sprite/palette ids + stats — spawning 8–20
  ambient heroes per zone is bytes, and the dimetric scene already depth-sorts and
  animates arbitrary entities (walk cycle, attack/hit, the new death anim). Zero new
  render work; it's population + a behavior tick.
- **It's the on-ramp to Track P.** Ambient heroes can be seeded from *real* player
  roster snapshots (the Track P cloud store) — so the "NPCs" you pass are other people's
  legends, and their prismatic/limited palettes (Track M cosmetics) are on display in the
  open world, not just in duels. Living-world + async PvP + cosmetic IAP reinforce each
  other: the world is the display case.
- **LLM thought bubbles scale to it** — the existing `nameGen`/thought system can give
  ambient heroes and NPCs personality-driven barks reacting to what they're doing, which
  is already flagged as the game's most unique differentiator.

**Sequencing (post-launch; not a launch blocker):**
- **L0: SHIPPED 2026-07-28.** Purely local ambient heroes — seeded identity + behaviour,
  real headless combat sim, rendered in-world; no backend. Details below.
- **L1:** seed ambient heroes from Track P roster snapshots (real players as world NPCs);
  NPC quest-givers/vendors at town anchors.
- **L2: PARTIALLY SHIPPED 2026-07-28** — target cards, party-up with an ambient hero
  (AI companion), and friendly duels. Trade barks and world events (a boss drawing a
  crowd) remain. Details below.

**Footnote — simulated MMO chat / banter (high-charm, low-cost).** Give ambient heroes
occasional speech-bubble one-liners (reuse the existing `ThoughtBubble` + `nameGen`/
`generateThought` system, or a canned pool for zero-cost/offline) so the fake server has
*personality*, not just motion. Context-driven barks land best: contesting a node ("naw,
I saw that iron ore first, noob — qq"), declining help ("need a hand with that mob…? naw,
u got it"), faction trash-talk, loot brags, idle chatter. Cheap flavor that massively
sells the "living server" feel; pairs with the L0 ambient crowd already in place. Could
even wire the LLM thought system to react to what the nearby ambient hero is *doing*.

**Risks:** entity/perf budget in the scene (cap ambient count per viewport, cull off-
screen sims); behavior determinism (reuse the seedable combat sim Track P already
requires); scope — this is explicitly a *post-launch* world-depth play, sequenced behind
the graphics rebuild, Track R rebrand, and the RevenueCat launch milestone.

**L0 as built (2026-07-28).** The starting point was better than this plan assumed: the
adapter *already* spawned a seeded roaming crowd with real `(spriteId, paletteId)`
identities, faction nameplates, leashed wander, walkmask-aware anchoring and off-screen
group recycling. What it lacked was depth — the "fights" were attack animations on a
timer, heroes never chose a target, and nobody said anything. So L0 was behaviour, not
population:

- `engine/ambient.ts` — identity with the same shape as the player: class, race, level
  band (±20% of the player's, read-only), rarity, and a real single-tree talent
  allocation, so every ambient hero has a `deepestSpec()` title and their builds actually
  change how their fights go. Budgets are named constants (`AMBIENT_HERO_BUDGET = 8`,
  `AMBIENT_FIGHT_BUDGET = 3`, `AMBIENT_BRAIN_HZ = 5`).
- Real state machine — wander → approach → fight → loot → move on, plus idling. Heroes
  seek a nearby monster within `AMBIENT_SEEK_RANGE` and will not gang up on one already
  claimed.
- **Fights are resolved once by `runFight` and then played back over time.** One sim call
  per encounter, animated from its event log — a real combat model at effectively zero
  per-frame cost. This is deliberately the same mechanism Track P will use to render a
  ghost duel, so P0's "render the fight in the dimetric scene" is already prototyped.
- Per-hero seeded sub-streams (`subStream`), not one shared generator. This is what makes
  off-screen culling safe: with a shared stream, culling a hero would change what every
  *other* hero rolled.
- Brains tick at 5Hz and only within the visible radius; rendering stays at 60fps.

**Speech bubbles — decision.** Ambient barks are drawn on the **canvas**, and
`ThoughtBubble` was left completely untouched. That component takes no props: it reads a
single `currentThought`/`thoughtExpiresAt` pair off the store and renders inside the
player's HUD avatar wrapper in `CombatView`. That is a single global slot, it lives in the
HUD rather than in the world, and driving 8–20 of them would mean as many
absolutely-positioned DOM nodes repositioned every frame — straight into the perf risk
above. So the player keeps their private inner voice, one at a time, and the crowd gets
its own world-space channel in MMO-chat register. Keeping them separate also means ambient
chatter can never overwrite what the player is thinking. Barks are canned pools
(`engine/ambient.ts`), gated three ways — per-event probability, a per-hero cooldown, and
a ceiling of 3 concurrent bubbles — because ungated, eight heroes killing things reads as
chat spam rather than as a populated server. The LLM path is the upgrade, not the
dependency.

**Generative MMO chat + whispers — SHIPPED 2026-07-28.** The footnote's LLM upgrade, on
the existing Ollama plumbing (`VITE_LLM_URL`, same endpoint `nameGen` already uses).

*Measured latency, against `incept5/llama3.1-claude` (8B):*

| request | tokens | latency |
|---|---|---|
| 12-line batch | `num_predict: 300` | 23–42 s |
| single line | `num_predict: 28`, `stop: ["\n"]` | **3.5–4.4 s** |

That gap is the whole design. The batch figure is a function of TOKEN COUNT, not a slow
endpoint — reading only that number leads straight to the wrong conclusion that live
per-event generation is impossible. It isn't: four seconds is an ordinary wait for a line
of chat. Hence three paths, each matched to what it's for:

- **Pools (batch)** — background zone chatter. Cheapest per line; the panel needs volume
  more than specificity. Topped up off a 10s tick, single request in flight, exponential
  backoff, pools cleared on zone change.
- **Live barks (per-event)** — a hero speaks about what *just happened*, by name
  ("vesk just pwned that wolf"). A pool can never do this. Canned line shows instantly;
  the generated line upgrades the bubble and its chat row in place if it lands while the
  moment is still legible. Capped at 3 concurrent, one per hero.
- **Whispers** (`engine/whisper.ts`) — tap any ambient hero to open a private thread.
  Always live, with bounded per-entity conversation memory, so they answer in their own
  class/faction/spec voice and remember what you just said. They are prompted as *players
  with their own agenda*, not assistants.

**The bug worth remembering: self-inflicted head-of-line blocking.** Ollama serves one
request per model at a time, and everything else queues *on the server* where the client
cannot see or reorder it. The first cut fired pool refills (~30s) and live barks (~4s)
independently, so every live bark that landed behind a refill sat in the server queue
until it hit its own timeout and aborted. It presented as "the endpoint is flaky"; it was
entirely our own doing.

`engine/llmClient.ts` now owns the ordering: one door, one request in flight, a priority
queue in front of it — `INTERACTIVE` (a whisper the player is watching) > `REACTIVE` (a
live bark) > `BACKGROUND` (pool refills, which never dispatch while anything else waits).
Reactive requests carry a `staleAfterMs` so a bark about a kill is abandoned rather than
spoken thirty seconds late. Backoff is shared, so a sick endpoint makes every subsystem
stand down together instead of three of them hammering it independently.

Three tiers of graceful degradation, and the floor never involves an error: live line →
pooled line → canned line, and with `VITE_LLM_URL` unset **no network call is made at
all**. A failed whisper answers with `…` rather than an error, because a player who
doesn't reply is an ordinary thing in an MMO and it keeps the illusion intact.

One determinism subtlety, deliberately preserved: `takeChatLine` consumes exactly one
`rng()` draw, and so does the canned fallback. That keeps each hero's seeded stream
aligned whether the endpoint is up, down or unconfigured — otherwise network weather
would silently change where every ambient hero walks next.

`engine/chatLog.ts` is a standalone observable (React reads it via `useSyncExternalStore`)
rather than store state — same reason as everything else here: ambient output must not
travel through the player's store. Surfaces as a CHAT tab beside the combat log.

**Endpoint exposure:** `.env.local` only (gitignored). A public build pointed at a personal
Ollama box would expose an unauthenticated, unmetered endpoint to every player, so that is
deliberately not the default. If it ever ships, it needs a proxy with auth and rate limits.

**L2 — target cards, party companions, duels (2026-07-28).** Driven by what the whisper
system started doing on its own: ask a hero what they're up to and they offer to group,
say they'll lead the way, tell you to stick close — then keep wandering their seeded path.
The conversation was writing cheques the simulation couldn't cash, and that gap is exactly
where the illusion snaps. The LLM was effectively *specifying the feature*.

- **Target card** (`components/game/PlayerCard.tsx`). Tapping a hero opens a card — name,
  level, race/class, spec, faction — with Whisper / Invite / Duel. Replaces jumping
  straight into a whisper thread, which was merely abrupt on desktop and outright
  invisible on a phone, where the chat panel it switched sits off-screen behind the dock.
  Positioned at the tap and clamped into the viewport; 32px minimum touch targets.
- **Party** (`engine/party.ts`). One companion at a time. The hero decides in character —
  an Ashmarch hero usually turns down a Concord invite, a busy one brushes you off — via
  an `ACCEPT:` / `DECLINE:` format, with a deterministic rules floor (same-faction 85%,
  cross-faction 15%) when the model ignores the format or is unreachable. Being turned
  down is a real outcome, not a failure; it's the most MMO thing in the game.
- **Follow state** in the ambient state machine: loose leash rather than a rigid offset (a
  companion glued to your shoulder reads as a pet), catches up off-frame if you travel,
  and **breaks off to fight its own nearby monsters** before rejoining. That last part is
  the difference between a party member and a pet.
- **Duels** (`engine/duel.ts`). Friendly, resolved by the same seeded `runFight`. This is
  **Track P's ghost-PvP mechanic running a lap early against a local opponent** — P0 only
  swaps the opponent source from "the crowd next to you" to a cloud snapshot, so the
  "fetch opponents, run seeded sim, render in the dimetric scene" path is now prototyped.

**The companion does NOT assist your combat, deliberately.** It fights its own monsters
with its own numbers and never damages your target. Free DPS would raise your kills per
minute, which makes it an economy change `econSim` would have to model and the balance
pass would have to absorb — and it would break the isolation rule below. A companion is
company, not a damage buff. Duels are likewise friendly: no HP, XP, loot or gold moves.

Party membership is per-zone; travelling disbands it with a line in chat, because the
crowd is regenerated per zone and a member would otherwise be silently recycled out from
under you.

**Whisper UX rebuild — the chat window was in the wrong place entirely.** Reported from
real play: tapping Whisper on mobile did nothing, and the window was buggy at desktop and
tablet widths. One root cause, two symptoms:

- `.app-log` is **232×112px** on desktop. A tabbed panel with a scrolling message list AND
  a text input has nowhere to put anything in 112px of height.
- On mobile `.app-log` is a bottom sheet hidden behind a transform until
  `activePanel === 'log'`. Tapping Whisper set a target and switched a tab inside a panel
  that was **off-screen**, so the button genuinely did nothing visible.

A conversation with an input field is not a log line and should not live in the log's real
estate. Whispers moved to their own fixed-position window (`WhisperWindow` + the
`.whisper-window` rules in index.css): a floating panel clear of the right rail on desktop,
a narrower one on tablet, a bottom sheet above the dock on mobile. It does not depend on
the log sheet being open, so the gesture works identically at every breakpoint. Zone chat
stays in `.app-log`, where a read-only feed fits fine. Input is `font-size: 16px` to stop
iOS Safari zooming the viewport on focus (a zoom that never undoes itself), 36px minimum
control heights, and `overscroll-behavior: contain` so the sheet doesn't scroll the page.

**Chat readability + a layering bug the resize exposed.** Chat inherited the branded
display face (Cinzel, small-caps serif) at 0.65rem — lovely on headings, punishing for
lowercase MMO chatter — and `.combat-log` asked for generic `monospace`, which resolves to
Courier on macOS/iOS. Chat and whispers now opt out into `--font-chat` (platform UI sans)
at 0.78–0.8rem with higher-contrast colours; everything else keeps the brand. The zone-chat
panel grew from 112px to `--log-h: 220px`, with the left rail reserving the matching space.

Enlarging the mobile sheet surfaced a **pre-existing layering bug**: `.app-log` is z-index
50 and `.hud-layer` (which owns the action bar) is z-index 20, so an open chat sheet
anchored at the dock rendered directly over the primary controls — the action bar simply
disappeared behind it. Both the chat sheet and the whisper window now reserve
`--actionbar-h` above the dock, so the action bar stays visible with chat open. Verified by
hit-testing the bar's centre with `elementFromPoint` at all three breakpoints rather than
by eye.

**Mobile / iOS pass (2026-07-28).** This ships as an iOS app, so the web defaults that
read as "a web page in a wrapper" were addressed directly:

- **Chat is no longer modal.** The hero and inventory drawers keep their dismissing scrim —
  they own the screen. Chat does not: this is an idle game you *watch*, and the point of a
  living-world feed is reading it while the world runs. The scrim greyed out the world you
  were chatting about and blocked the action bar, which on a phone is most of the interface.
  Measured: with chat open, `elementFromPoint` at the action bar's centre now returns the
  ability button itself rather than a backdrop.
- **Keyboard-aware panels** (`engine/viewportInsets.ts`). iOS Safari does not change
  `window.innerHeight` when the keyboard appears, and `100dvh` tracks the layout viewport,
  not the visual one — so a `position: fixed` panel anchored to `bottom` sits *underneath*
  the keyboard and the field you just focused becomes invisible. The visual viewport is the
  only thing that knows; its height is published as `--kb-inset` and the whisper window
  adds it, via `max()` so it rides the keyboard when one is up and clears the action bar
  when one isn't.
- **44pt touch targets** on the whole social UI, per Apple's HIG. Worth recording *how* this
  was got wrong first: the buttons carried an inline `minHeight: 36`, and an inline style
  outranks the `@media (pointer: coarse)` rule meant to raise it — so every button silently
  stayed at mouse size on touch. Measuring (`getBoundingClientRect().height` per button)
  caught it; reading the CSS would not have.
- `touch-action: manipulation` on interactive chrome (kills the 300ms tap delay and
  double-tap zoom), `-webkit-touch-callout: none` + no text selection on game chrome —
  but chat messages stay selectable, since copying what someone said is worth keeping.
  `overscroll-behavior: contain` on every scroller so rubber-banding a panel doesn't drag
  the app. 16px inputs so focusing a field never triggers iOS's viewport zoom.

**Party frame** (`hud/PartyFrame.tsx`) sits directly beneath your own unit frame, above the
target — where an MMO puts it. Name, level, spec, faction colour, live health bar and a
current-activity label (following / moving in / fighting / looting). It reads two sources
because neither alone is sufficient: `party.ts` owns membership, and the render adapter
publishes a `CompanionStatus` snapshot each behaviour tick for what they're actually doing.
The health bar is real — it reflects remaining health from the fight the companion is
currently playing back, and returns to full between fights, since a companion's HP only
exists inside a resolved fight.

**Companions never fought, and the obvious fix was the wrong one.** First diagnosis was
"the seek radius is too small", so it went from 6.5 to 13 tiles. That changed nothing,
because the problem was never range — it was **supply**. The `AMBIENT_GROUPS` weights
produce roughly **two** ambient monsters for eight heroes, and every one is already
claimed by a hero standing at its group anchor (`nearestAmbientMob` deliberately skips
monsters someone else is fighting). A companion walks *away* from those anchors — that is
what following means — so it was competing for a supply that was both tiny and permanently
spoken for.

The fix is a dedicated **sparring partner**: one reusable monster entity spawned on
walkable ground a few tiles off the player, recycled after each fight on a
`COMPANION_SPAR_INTERVAL` cadence. The companion walks over, fights it with the same
`runFight` sim and its own numbers, loots, and rejoins. Still ambient scenery — never one
of the store's real `mobs` — so the player's combat, loot and XP stay untouched.

Guarded against two cleanup paths that would otherwise break it: `retireAmbient()` now
clears the cached indices (stale indices into a rebuilt array would point the companion at
whatever landed in that slot), and group recycling skips the sparring partner so it is not
yanked across the map mid-fight.

**And a second, larger bug the instrumentation then exposed.** Even with a monster to
fight, the companion still could not fight it. The party-sync block runs before the
behaviour tick each frame and read:

```
if (a.state !== 'follow' && a.state !== 'fight' && a.state !== 'loot') { a.state = 'follow'; a.foe = -1 }
```

`'approach'` is not in that exemption list. The behaviour tick would set `approach`; the
next tick would stomp it back to `follow` and clear the target. The companion could never
traverse approach → fight, so the only fight ever seen was one already in progress when
they accepted the invite. Only `wander` and `idle` promote to `follow` now — `approach` is
the first beat of their own fight cycle, not idle wandering.

Measured before and after, over 60 seconds with a companion in the party:

| | before | after |
|---|---|---|
| companion attack animations | 7, then frozen | 7 → 10 → 15 → **21**, climbing |
| states observed | `{follow: 20}` | `{approach: 14, fight: 4, loot: 1, follow: 1}` |

`ambientDebug()` now reports `mobs`, `freeMobs` and a live `companionAttacks` counter,
because "is my party member actually fighting?" is not answerable from a screenshot — and
two rounds of guessing at it was two too many. Both causes fell out of a single
instrumented run.

Follow-up tuning from the same data: 70% of the cycle was `approach`, i.e. more commuting
than fighting, so the sparring partner spawns at 2.5–4.5 tiles instead of 4–7 and a
companion closes at follow speed rather than the idle-wander gait (it is chasing a target
while the player walks away from both of them).

**Two UX bugs found by real play, both pre-existing and both worth recording:** the world
scene's jump handler `preventDefault`s Space on `window`, which was harmless until a text
input existed and then ate every space in a whisper ("want to party up?" → "wanttopartyup?")
while WASD walked the hero around mid-sentence. Any focused field now owns the keyboard.
And the player's own whispers rendered as `To [your own name]` instead of naming the
recipient.

**The isolation rule holds structurally.** Nothing in `engine/ambient.ts` or
`engine/fight.ts` can reach the store — there is no import path, and adding one would be
the bug. Ambient heroes fight synthetic monsters, never the store's real `mobs`. One
subtle breach found and fixed on the way: the damage-floater pool LRU-evicts, so ambient
numbers would have pushed the *player's* numbers out of a saturated pool — ambient
floaters now take only genuinely free slots.

**Perf, measured at 4× CPU throttle** (CDP; throttle and sampling in ONE session, since
`Emulation.*` overrides are cleared when the client disconnects — splitting them silently
reverts to unthrottled desktop and produces very convincing false numbers):

| run | mean | p50 | 1% low | worst frame |
|---|---|---|---|---|
| baseline (lvl 1, no ambient fights) | 52.6 | 59.9 | 12.2 | 133ms |
| after L0 (lvl 1) | 56.1 | 59.9 | 29.3 | 100ms |
| after L0 (lvl 40, 2 concurrent sims) | 50.1 | 59.9 | 15.0 | 100ms |

Read honestly: mean FPS moves ±3 between runs in both directions, so this is
noise-dominated and the right claim is **no material regression**, not an improvement.
p50 holds at 60fps throughout, and worst-frame improved consistently (133ms → ~100ms).
The lvl-40 run is the heavier scenario — two fights simulating concurrently — and still
holds 60fps p50.

A measurement trap worth recording: a run that bounces back to the character-select
screen measures a static menu and reports a *flattering* ~60fps with no world rendering
at all. Any FPS probe here must assert the world scene is mounted (`window.__ilScene`,
dev-only) before and after sampling, or the number is meaningless.

## Track C — combat depth: pathfinding, party rhythm, multi-enemy battles

**Shape:** the world moves and fights like a world rather than like a demo. Enemies and
companions *route* around terrain instead of grinding into it; a party member walks with
you rather than commuting behind you; more than one thing can be in a fight at once; and
an elite is elite relative to the group that meets it, not to a flat 5% roll.

Composes with Track L (which built the crowd, the companion and the fight loop) and
Track P (which needs the fight loop to be N-sided and seeded before duels can be
anything but 1v1). Everything below extends existing machinery — the standing rule from
L0 applies: **this is depth, not a second combat model.**

**Runway honesty, stated first.** Track C is **not a launch blocker and competes with
work that has not started.** Verified 2026-07-31: there is no `capacitor.config.*`, no
`ios/` directory, and no Capacitor or RevenueCat dependency in `package.json` — Track M's
entire store-submission path is at zero. Track R still owes 97 verbatim WoW talent names
(~1 hour) which *is* a submission blocker. If Track C is being funded out of the launch
runway rather than alongside it, the honest recommendation is C0 only (below), then stop.

### C0 — the character-select regression, and the save layer underneath it

Reported as "the app spontaneously returns to the character-select screen mid-session."
It is fully root-caused, and the headline is that **it is not a reset — it is a missing
resume.** Everything else follows from that.

`initialized` (`App.tsx:78`) is the only gate, it lives **only in memory**, and it is set
false in exactly two places, both explicit user actions (`returnToMenu` `gameStore.ts:1016`,
`resetGame` `:1025`). Ruled out by direct inspection: no zustand persist middleware, no
error boundary, no `visibilitychange`/`pagehide`/`beforeunload`/bfcache handler, no service
worker, no save/load race (both are synchronous on one thread), and StrictMode's
double-mount does not clear state. So "back at character select" can only mean **the
`gameStore.ts` module was re-evaluated**, producing a fresh store at `defaultState()`.

**The regression: `git show 11966fe^:src/App.tsx` contains `useEffect(() => { loadGame() }, [])`.**
Commit 11966fe ("Track S — save slots + character select", 2026-07-19) replaced `loadGame`
with `loadSlot(id)` and **deleted that boot-time auto-load without replacing it**.
`loadSlot` is now reachable from exactly one place in the entire app — a human clicking
Continue (`App.tsx:90`). The save on disk is fine the whole time; nothing ever goes back
for it. This predates every commit on this branch.

Two mechanisms re-evaluate the module, and the second is the one that reads as *spontaneous*:

- **A full reload.** `combatAdapter.ts:3547` does `import.meta.hot.accept(() => window.location.reload())`.
  That hook is correct and should stay — the comment above it explains that the adapter is
  a long-lived controller built in a `[]`-deps effect, so Fast Refresh would otherwise
  leave a stale controller running. But it is a 3,547-line file, the most-edited one in
  this track, so an instrumented session reloads constantly. This is almost certainly what
  corrupted last session's measurements.
- **An in-place HMR module swap, with no reload at all.** `gameStore.ts` is **not a Fast
  Refresh boundary** — it exports `useGameStore` (a lowercase const, `:924`) and
  `resetCombatAccumulators` (`:866`), so not all exports look like components. Vite
  therefore propagates an update of *any* non-component `.ts` module up to the importing
  `.tsx` boundary and re-executes `gameStore.ts` as a fresh module. The app simply blinks
  to character select mid-session with nothing in the console. That is the "spontaneous".

In production the same missing resume means a **WKWebView reload under memory pressure
dumps the player at character select mid-run** — which reads exactly like a crash.

**The save layer under it is in worse shape, and this is the part that is genuinely more
serious than anything else in this track:**

- **A character's save is ~3.31 MB.** `toSaveBlob` (`gameStore.ts:463`) spreads the whole
  state and carries `zoneMaps` — the full 64×64 tile grid, with `charSet: string[]` per
  tile, for **every unlocked zone** — even though `rehydrateState` (`:443-447`)
  regenerates every one of them from the seed on load. With `MAX_SLOTS = 5` the ceiling is
  ~16.5 MB in a single localStorage key against a ~5 MB origin quota. **The second
  fully-progressed character throws `QuotaExceededError`.** Not stripping `zoneMaps` is
  both the fix and a ~99% size reduction.
- **That throw kills the game permanently.** `saveSlots.ts:82` calls `setItem` unguarded
  (compare `gameStore.ts:111`, which guards the same call). It travels
  `writeFile → save → saveGame → gameLoop.ts:24`, and `gameLoop.ts` schedules the next
  frame *after* the body (`:29`) — so the rAF chain dies and never restarts. Symptom is a
  frozen world, not character select.
- **`readFile` destroys a corrupt or evicted saves file.** `saveSlots.ts:72-78` catches a
  parse failure and immediately `writeFile`s `{ slots: [] }` over the original. It runs on
  every `list`/`load`/`save`/`delete`, i.e. every 10s autosave. After Safari ITP storage
  eviction this presents as **CharacterCreate with zero heroes** — the real data-loss path.
- **Autosave parses the multi-megabyte file twice per write** (`saveGame` does its own
  `slotStorage.load` at `:1000`, then `save` calls `readFile` again at `saveSlots.ts:117`).
- **`loadSlot` swallows everything** — one bare `catch { return false }` (`:990`) around
  `rehydrateState`/`compileStats`/`generateZoneMap`, and `App.tsx:90` discards the boolean.
  A failed Continue is a silent no-op that looks identical to "bounced back".
- **The nameGen continuation can corrupt a different slot.** `gameStore.ts:965` resolves
  ~30s later and calls `set(...)` + `saveGame()` with **no check that `activeSlotId` is
  still the slot that started it** — create hero A, switch to hero B, and A's generated
  name, traits and faction names are written into B.
- **The "Heroes" button is a 14px, unconfirmed eject.** `CharacterPanel.tsx:52` —
  `fontSize: 0.55rem, padding: 2px 7px` beside the gold chip — calls `returnToMenu()` with
  no confirmation. The rest of the social UI was raised to 44pt in the mobile pass; this
  was missed.

**Confirming instrumentation, before any fix** (the L2 lesson: two rounds were already
lost to guessing). One line at module scope in `gameStore.ts`:
`console.warn('[il] gameStore evaluated — nav=', performance.getEntriesByType('navigation')[0]?.type, 'uptime=', Math.round(performance.now()))`.
Printing at the instant the app snaps to select confirms re-evaluation; `uptime` under
~300ms means a real reload, a large `uptime` means an in-place HMR swap. If it does *not*
print, the cause is `returnToMenu` instead — `console.trace` at `:1013` catches the mistap.

**Fix order:** persist a last-active-slot key and resume it on boot (fixes the reported bug
outright, dev and shipped); strip `zoneMaps` from `toSaveBlob`; guard `writeFile` and stop
`readFile` destroying an unreadable file; guard the nameGen continuation on `activeSlotId`;
raise and confirm the Heroes button. Leave the HMR hook alone.

### Live bugs found en route (unrelated to this track, all verified, all cheap)

Recording them here because they are shipping defects and two of them are in the HUD this
track is about to add to:

- **The Respawn button and the party's leave button do nothing.** `.hud-layer` is
  `pointer-events: none` (`index.css:330`) and `HudOverlay.tsx` states in its own comment
  that "each panel re-enables pointer-events for its own interactive bits" — `ActionBar.tsx:50`
  does; **`UnitFrames.tsx` and `PartyFrame.tsx` do not.** So `respawnNow`
  (`UnitFrames.tsx:78`) and leave-party (`PartyFrame.tsx:97`) are unclickable. Respawn also
  runs on a timer, which is why this has gone unnoticed: the button is a skip-the-wait
  affordance that silently never worked.
- **`ELITE_DAMAGE_MULTIPLIER` and `BOSS_DAMAGE_MULTIPLIER` are no-ops.** `spawnMob`
  applies `dmgMult` to `attackSpeedSeconds` (`gameStore.ts:813`), and `resolveMobAttack`
  computes `mob.damage * mob.attackSpeedSeconds * mobSpeedFactor` (`combat.ts:463`). The
  two cancel exactly: an elite hits 1.8× harder 1.8× less often, for **identical DPS**.
  Only `ELITE_HP_MULTIPLIER` (applied to HP directly) does anything. Elites are currently
  pure health sponges — which matters a great deal to C6, since the dial that exists for
  "make elites hit harder" is connected to nothing.
- **`.hud-tl` has no `max-height` and no `overflow`** (`index.css:331`). Relevant the
  moment C4 stacks a second and third party frame under the unit frame.

### Corrections to the brief, found by reading rather than assuming

Recording these because three of the six items are smaller or larger than they looked, and
the L2 write-up above is emphatic that guessing at this codebase has already cost two
rounds. **Several load-bearing constants turned out to be dead**, so any plan that reasons
from them is reasoning about numbers the code does not use:

- **Engaged mobs already pathfind.** `combatAdapter.ts:1910` routes `this.mob` through
  `followPath` + `mobPath`, and the comment there records the lake-crossing bug it fixed.
  What still walks blind is the **ambient crowd**: follow (`:2632`), approach (`:2656`) and
  wander (`:2676`) are all direct-vector plus a per-axis `walkableAt` test. So item 1 is
  narrower than "teach mobs to path" — it is "teach the crowd what the mob already knows."
- **`followPath` cannot be reused as-is on ambient heroes.** It mutates `e.tx/e.ty` in
  *buffer* coordinates, while ambient heroes are authoritative in *game* coordinates
  (`a.gx/a.gy`) and have their entity position derived from the player each frame
  (`:2686`). Extending pathfinding means a game-coord variant of `followPath`, not a
  call-site change. This is the single most under-estimated piece of work in the track.
- **`FOLLOW_FAR = 3.4` is declared at `:245` and never used** — verified, one occurrence in
  the file. The follow leash therefore has a *single* threshold (`FOLLOW_NEAR = 2.2`), so a
  companion stops dead at 2.2 tiles and re-triggers the instant the player moves. That
  missing hysteresis band is a real, mechanical cause of the observed oscillation, and it
  is separate from the 70%-commuting figure the L2 tuning pass measured.
- **`spawnMob` does not read player power at all.** `gameStore.ts:794` rolls a flat
  `ELITE_SPAWN_CHANCE` (0.05, `data/constants.ts:104`); HP and damage come from
  `template × ELITE/BOSS multiplier × circuitMult` where `circuitMult = 1 + zoneCircuit*0.5`
  (`:801`). There is no player term anywhere. So "scale elites to party power" is not a
  retune of an existing curve — it is introducing the first power-coupling between the
  player and the spawn table, and it lands directly on the economy.
- **`mobs: MobInstance[]` already exists with `MOB_POPULATION = 4`** (`gameStore.ts:831`),
  and `:1251` records that "`mobs` is the source of truth; currentMob/mobMapOffset/
  activeDoTs are projections." Multi-enemy is therefore half-scaffolded: the field exists,
  the *fight* is what is 1v1.
- **There is no *working* unique-item concept, but there is a decoy.** `NAMED_ITEMS` and
  `getNamedItemDrop` exist in `data/items.ts:157-178` with **zero call sites**, and
  `getNamedItemDrop` re-rolls procedurally anyway — it discards the template's name and
  rarity. It looks like a unique-drop system and is not one; building on it as-is silently
  produces ordinary procedural items with unique-sounding table ids. Everything real goes
  through `generateItem(slot, level, rarityBias)` (`loot.ts:34`).
- **Seeding loot is 9 rolls, not 4.** `loot.ts` has four (`:23`, `:24`, `:31`, `:33`), but
  `generateItem`/`rollRarity` add five more (`items.ts:75`, `:84`, `:88`, `:94`, `:144`). A
  half-seeded pipeline reads as reproducible while still diverging. There is also no good
  seed material at the drop site: `mobInstanceSeq` (`gameStore.ts:848`) is a module counter
  that resets on reload, so `deadMob.id` is not stable across sessions.
- **Three constants this track would naturally reason from are dead.**
  `AMBIENT_HERO_BUDGET = 8` (`ambient.ts:35`) is exported and **never referenced** —
  verified, zero non-declaration hits. Actual population comes from
  `AMBIENT_GROUPS_WORLD = 5` groups through the weighted `AMBIENT_GROUPS` table
  (`combatAdapter.ts:271-278`). `FOLLOW_FAR` (`:245`) and `AMBIENT_GROUPS_TOWN` (`:279`)
  are likewise dead. The L2 note above reasons about "eight heroes" — that number is not
  in the code, which is worth knowing before re-deriving the monster-supply arithmetic.
- **The isolation rule is prose-only.** The import graph is clean today (verified both
  directions), but there is no eslint config, no test, no tsconfig path restriction and no
  CI check — `npm run build` is just `tsc && vite build`. Adding
  `import { useGameStore } from '../store/gameStore'` to `engine/ambient.ts` would compile
  clean and ship. Store data also already reaches ambient code **by value** via
  `combatAdapter.sync(state)` and via `PlayerCard.tsx` passing `useGameStore.getState()`
  into `runDuel`; the rule is one-directional (ambient never writes to the store), which is
  the property worth keeping and worth making mechanical.

### C1 — pathfinding for the crowd

Give ambient heroes a `PathState` each and route follow/approach/wander through a
game-coordinate `followPath`. `engine/walkability.ts` needs no new capability — `findPath`
(`:238`) is A* over the 64×64 torus, 8-connected, no corner-cutting, string-pulled, with a
lazy-deletion binary heap. Five things to respect, in order of how badly they bite:

1. **Determinism is the sharpest risk, and it is not obvious.** `ambient.ts:17-22` chose
   per-hero sub-streams specifically so that *draw* culling is safe. But the per-frame
   ambient **position** loop (`combatAdapter.ts:2607-2687`) runs for every ambient entity
   with **no viewport gate** — only the 5Hz *brain* is gated. So any path budget that skips
   off-screen movers, or any "nearest-first" path-request ordering, makes ambient positions
   depend on camera and window size, which culling has never done. Two runs at different
   window sizes would diverge. Any budgeting scheme here must be a function of entity
   identity, not of what is on screen.
2. **Allocation, not CPU, is the first symptom.** `findPath` allocates
   `Float32Array(4096) + Int32Array(4096) + Uint8Array(4096)` = **36,864 B per call**,
   unpooled (`walkability.ts:248-250`). Pool those three into module-level scratch with a
   generation counter *before* adding callers — it is the cheapest fix in the track and it
   removes the only real perf objection.
3. **Unreachable is a real state, not a theoretical one.** `walkability.ts:26` records
   **7 disconnected components** in the worst zone (the seal loop keeps any region ≥
   `MIN_REGION = 24`). A companion stranded across water burns a full 4,096-node search
   returning `null` every 0.35s forever. Worse, `followPath` collapses `null` and `[]` with
   `?? []` (`combatAdapter.ts:1044`), so **"unreachable" and "already arrived" are
   indistinguishable** and both fall through to the straight-line slide that grinds against
   the shoreline — precisely the failure routing exists to fix. Split those two cases first.
4. **The mask contains terrain and scenery only — no entities** (`walkability.ts:72-82`),
   and string-pulling actively collapses movers onto identical straight segments
   (`:322-338`). N pathed movers converging on the player will overlap. There is no local
   avoidance layer to add them to, and C2's formation slots are the cheapest substitute.
5. **Town mode is outside the mask entirely** — `walkableAt` short-circuits to `true`
   (`combatAdapter.ts:911`) and the town crowd does not collide at all (`:2473`). Pathing
   work must branch on `townMode` or town NPCs will path against a null mask.

Two smaller notes: `followPath`'s cooldown is decremented only inside the
non-line-of-sight branch (`:1041`), so a mover that regains and re-loses sight can be
forced down the degenerate slide for up to 0.35s — invisible with 2 movers, a visible
stutter with 20. And `walkability.ts:234-236` explicitly documents that A* "runs on a tap
or a mob spawn, never per frame"; extending it to every mover inverts a stated premise, so
that comment must be rewritten or it actively misleads the next reader. Trust the code over
the comments in the adapter generally — `advanceBystanders` already claims routing it does
not do (`:1418`).

### C2 — party walker rhythm

Add the missing `FOLLOW_NEAR`/`FOLLOW_FAR` hysteresis; hold a formation *slot* (an offset
that rotates with the player's heading) rather than a bare distance leash; and gate
fight-picking on whether the fight can be finished without leaving frame. The L2 data
already says what to measure: state histogram over 60s, target `approach` well under the
70% it was, with `fight` up correspondingly.

### C3 — engaging the party member's target: **THE ISOLATION DECISION**

> **DECIDED TWICE, 2026-08-02. Option 2 was taken, shipped, and then REVERSED by the owner.
> The section below describes the world before both.**
>
> Option 2 (companion combat purely cosmetic, zero store damage) shipped and its isolation
> held exactly as designed. It was reversed because of what it felt like, not what it broke:
> a party member who visibly swings and changes nothing reads as broken, and no amount of
> animation fixes a swing with no consequence. The isolation argument below is still
> correct — this IS an economy change — but the owner's call is that a measurable economy
> shift is the better problem, and the harness grows to see it rather than the feature
> being gutted to keep the harness simple.
>
> **What shipped instead:** party members are combatants in `GameState.allies`, compiled
> from their real class/level/`talentAllocs` via the same `compileStats` and swinging
> through the same `resolvePlayerAttack` the player uses. Deliberately UNGEARED — an
> honest reading of an ambient hero, and a reason they contribute less than you that needs
> no fudge multiplier. Mobs choose between the player and standing allies; an ally at zero
> goes down and rejoins. `FloatingNumber.allyKey` routes the hit's VFX to that companion's
> body.
>
> **Measured (8 seeds × 30 min, identical seeds, `run.mjs --party-delta`):**
> gold **+63%**, level +16%, deaths **−88%**. The death figure is the one to weigh — it is a
> difficulty change of a different order to the gold curve, and `ALLY_THREAT_SHARE` is a
> smaller lever than retuning income.
>
> **Known gap, not a bug to patch quietly:** allies never level. `makeAlly` only recompiles
> when `speaker.level` changes and that is fixed at invite time, so a companion recruited
> at level 1 is still level 1 when you reach 9. Whether companions grow with you is a
> balance decision; it is now measurable either way.
>
> The sparring-partner machinery described below is **deleted** — `spawnCompanionFoe`,
> `isSparFoe` and `sparFoeIdx` are gone. Companions pick a real mob out of the zone
> population, which is also what made them targetable: the enemy your party fights is now
> the same object you can tap.

This is the item that actually costs something, and it must be decided before C4.

Today a companion fights a **sparring partner** — a synthetic ambient monster
(`combatAdapter.ts:3046-3090`, `companionFoeIdx`) that exists only in `this.ambient`. It
has no `MobInstance`, is not in `state.mobs`, and yields no XP, loot or gold. The player's
tap path (`:1660`, `:1672`) hit-tests store mobs; `:1643` hit-tests ambient *heroes* and
opens the target card. The two combat worlds do not currently intersect anywhere, which is
precisely why the isolation rule has held structurally rather than by discipline.

**The cost is sharper than "econSim would have to model it."** `sim/econSim.ts` drives the
**real store** headlessly — `store.getState().tick(o.stepSeconds)` at `:239` — so it does
not model kills/minute, it *measures* them. But it has **zero coupling to `engine/party.ts`
or to the render adapter** (verified: no import, no reference). The companion body lives
entirely in the adapter, which econSim never instantiates. So a companion that added real
DPS would raise the player's true kills/minute while **every balance sweep kept measuring a
soloing player** — the harness would not be wrong-by-a-margin, it would be silently blind.
That is the real bill: not "retune the economy," but "give the party a headless
representation independent of the renderer, or lose the harness."

Three options, with what each actually costs:

1. **Hold the line (cheapest).** The player may tap the companion's foe to *look* at it,
   but not fight it; companion damage stays zero. Isolation stays structural, econSim stays
   honest, and item 3 becomes a UI affordance rather than a combat feature. Weakest fantasy.
2. **Reverse the direction (recommended).** Let the **companion visibly join the player's
   fight** against a real store mob — same animation cadence, real target — while dealing
   **zero** store damage; the player's tap keeps working unchanged because the target was
   always a store mob. Reads as fighting together, changes no number, needs no econSim work.
   Honest caveat: an attentive player can notice the mob's HP does not fall faster, so this
   buys the *rhythm* of a party without the substance.
3. **Cross the line deliberately (most expensive, best game).** Companion DPS becomes real.
   Then `econSim` needs a headless party — lift companion combat out of the adapter into an
   engine module the store can tick — and the full balance pass has to absorb a kills/minute
   increase that also moves gold, XP, drop rate and zone-advance pacing. This is a
   multi-session change and it invalidates prior economy measurements.

   The **offline projection** is the part most at risk, and it is easy to miss:
   `projectOfflineProgress` (`offline.ts:166-174`) replays a kills/sec, gold/kill and
   xp/kill rate derived from `accrueRates` (`gameStore.ts:1909`). Credit companion kills to
   the player without also crediting companion loot and gold-per-kill silently dilutes,
   and the offline projection inherits whatever imbalance results. The invariant that
   breaks is "offline never pays better than online" (`econSim.ts:69-73`, `MEAN_TOLERANCE
   = 0.10` at `:574`).

**Recommendation: option 2 now, option 3 only as its own funded track.** Option 2 delivers
the felt experience of items 3 and 4 without spending the harness, and it does not
foreclose option 3 later.

### C4 — 2+ party members

Blocked on C3, because two companions dealing zero damage is twice as noticeable as one.
`PARTY_MAX = 1` (`engine/party.ts:39`) is a soft cap; the single-companion assumption is
hard-wired in four other places, and **raising the cap without them reproduces exactly the
failure `PLAN.md` already documents at L583-616** — one companion fighting, the rest
trailing in silence:

- **The sparring-partner supply is structurally single.** `spawnCompanionFoe` reuses one
  entity slot (`combatAdapter.ts:3046-3063`), `nearestAmbientMob` skips any monster already
  claimed (`:3101`), and `companionSparCd` is one shared timer that the first companion
  resets (`:2840`) — and which drains **N× faster** than `COMPANION_SPAR_INTERVAL` intends,
  because `-= step` runs once per follower inside the brain loop (`:2830`). The second
  companion finds `foe < 0` and never gets its own spawn. This is the real work in C4.
- **`this.followerIdx = found` takes the *last* match**, because `found = i` (`:2733`) is
  unconditional in the loop. At `PARTY_MAX ≥ 2` the party frame's status, the follow-speed
  selector (`:2654`), the rejoin decisions (`:2902`, `:2912`, `:2941`) and the
  `companionAttacks` counter (`:3188`) all silently describe one arbitrary member.
- **`CompanionStatus` is one nullable module-level object** (`party.ts:215-240`), and
  `leaveParty` calls `setCompanionStatus(null)` unconditionally (`:200`) — removing one of
  two members blanks the HUD for the survivor until the next 5Hz tick.
- **All followers steer to the same point** with only `FOLLOW_NEAR` as a stop radius, so
  they overlap. `FOLLOW_FAR` being declared-and-unused suggests slot logic was contemplated
  and never written; C2 should write it.

Also: the spar monster's stream is `subStream(zoneSeed, 'companion-foe')` with a **literal**
label (`:3057`) — a second spar monster reusing that label shares the identical stream and
rolls identical placements, the exact determinism regression per-hero sub-streams exist to
prevent. And `party.ts:100` hardcodes the singular ("you can only party with 1 hero").

HUD: `.hud-tl` has no `max-height` and no `overflow` (`index.css:331`); three frames push
the column to ~250-265px and can collide with `.hud-bottom` on short/landscape viewports
with nothing reporting it. Check the vertical budget at the mobile breakpoint **before**
building this, and fix the `pointer-events` bug above first or the leave button stays dead.

### C5 — N-sided combat

> **STATUS 2026-08-05 — stages 0 through 4 are DONE. Read this box before the section
> below it, which is now partly historical.**
>
> The owner decided to UNIFY (the section's open question), and the work was re-staged
> against a verified inventory. Stages shipped:
>
> - **Stage 0 — widen the determinism baseline.** The claim below that "the harness has no
>   golden file" is **STALE**: one has existed at `tools/sim/golden/fight-golden.txt` since
>   `9c81e34`. The real problem was worse and the opposite shape — every roster was built
>   with `allocs = {}`, so every talent-gated roll short-circuited before reaching `rng()`
>   and the whole baseline exercised ONE draw site. Measured event mix was 382 `swing`,
>   30 `death`, and zero `dot`/`block`/`thorns`/`extra`/`flurry`. Six talented builds now
>   run alongside: `dot` 0→312+, `thorns` 0→117, `flurry` 0→20, `block` 0→18, `extra` 0→5.
> - **Stage 1 — seed the store's combat path.** `resolvePlayerAttack` got no `rng` and
>   `resolveMobAttack` no fifth arg, so the store drew off the global while `fight.ts` drew
>   off a seed *through the same functions*. One `combatRng` now, off `procState.procRngState`
>   — which also did not survive a load, despite its comment saying it did.
> - **Stage 2 — reconcile the semantic divergences.** `enemy_slow` was inert in `runFight`;
>   DoTs stacked there and refreshed in the store; extra/flurry were a flat fraction in the
>   store and a full-strength re-resolve in `fight.ts` (up to 3× apart); a hero DEFENDER got
>   no defensive talents at all in a duel.
>
> **Two bugs found by doing it, both shipped and neither visible before stage 0:**
> 1. **Corruption and Curse of Agony never ticked.** Both are re-applied every swing and
>    tick every 3s; every class swings in 1.5–2.5s. Refreshing installed a DoT with
>    `tickAccum: 0`, so the clock reset before it could ever fire. The whole Bleakweave
>    tree's signature damage did nothing. Refresh now renews duration and carries the tick
>    clock.
> 2. **`PARTY_MAX` was enforced on invite, never on accept.** Acceptance is async, so six
>    invites sent to an empty party all passed the guard — measured five members in a
>    party capped at three.
>
> **Stage 3 — mostly done, and CHEAPER THAN THIS PLAN CLAIMED.** The staging called it the
> highest-risk stage because of a "one-way save migration". **That migration does not
> exist.** `rehydrateState` already rebuilds `procState` wholesale, keeping only
> `procRngState` (`gameStore.ts:489`), so its shape is free to change; and the combat clocks
> are session state cleared on load like `mobs`. Nothing in stage 3 touches a persisted
> shape. Delivered:
>
> - **Driver semantics.** The store resolved AT MOST ONE SWING PER TICK against a 5s frame
>   cap (`gameLoop.ts:17`), so a stalled frame or a backgrounded tab spent the time and got
>   one swing from it. Now bounded catch-up loops — the property `fight.ts` always had.
>   Exact no-op at the 0.25s step the game and harness run at; it only bites where swings
>   were being dropped.
> - **Combat clocks on the state** (`GameState.combatAccum`). They were five module-level
>   `let`s — per-bundle, not per-character — so two heroes in one save slot shared a swing
>   timer, Rampage decay and minion clock. Migrated by deleting the globals and letting the
>   compiler find all 19 uses.
> - **Target-scoped proc state clears on a target SWITCH**, not only on a kill. Carrying
>   `mobFrozen` to a freshly tapped enemy left it unable to swing back at all, since the
>   mob-attack branch is gated on it.
>
> **Stage 3's outstanding lift — DONE (`768a2f5`), under a different name.** It landed as
> `resolveHeroTurn` in `combat.ts` rather than a `stepCombat`, and the shared unit is the
> **turn**, not the tick: swing, then Turning Steel, then Flurry, procs consulted once on
> the primary swing, stopping the moment either side dies. Both loops call it. Inverted
> (the caller reports what happened and the sequence decides whether to continue) rather
> than returning a list of hits, because the hits are sequential and state-dependent —
> Executioner prices each blow against the health the previous one left, so computing them
> up front would misprice every proc and would swing at a corpse.
>
> **Stage 4 — DONE (`8d9583e`).** Frozen, timed crit and Second Wind now resolve outside
> the store, so the store-only effects no longer make the two loops diverge.
>
> **Deliberately NOT done, with reasons, so neither reads as an oversight:**
> - *Per-target proc MAP.* One enemy is engaged at a time, so `Record<mobId, …>` would be a
>   dictionary with one entry and nothing exercising the keying — structure with no
>   coverage, the same trap the golden was in before stage 0. It becomes a map at stage 6,
>   when a second simultaneous target exists. `TARGET_SCOPED_PROC_FIELDS` marks the seam.
> - *Stage 2(f), dropping `procState.openerUsed`.* Belongs with the `stepCombat` lift; doing
>   it before there is a per-combatant home means inventing a temporary one and undoing it.
>
> **Stage 6 — the SEAM is in, landed inert (`3f2c575`).** `swingAtHero(attacker)` replaces
> the block that named `currentMob` as the attacker, `registerKill` takes a victim, and
> `attackAccum` moved onto `MobInstance`. Both goldens stayed **byte-identical**, which is
> the whole point of landing it switched off: the extraction is provably a no-op, so the
> gameplay change starts from a verified base. `MAX_MELEE_ATTACKERS` is the single
> character that turns it on.
>
> **It is held at 1 because turning it to 2 was measured and the measurement said no:**
>
> | attackers | settled offline-parity error | online gold, worst seeds |
> |---|---|---|
> | 1 | +5.4% (band is ±10%) | ~4,500–5,200 |
> | 2 | **+28.6% FAIL** | 1,903 / 2,916 — collapse |
>
> One extra attacker doubles incoming damage against unchanged outgoing damage, and the
> hero cannot fight two things: `sweeping_strikes` compiles to `sweepingStrikesEnabled`,
> read by nothing. So the defensive half **cannot ship before the offensive half** — which
> makes this section's own warning ("N-sided does not *unlock* AoE talents — it creates the
> obligation to design them") the load-bearing sentence in the track, not an aside.
>
> **Two bugs found by measuring it:**
> - *Fixed.* The respawn branch returned before `accrueRates`, so the offline rate measured
>   output per second **alive** while the projection replays it against wall-clock. Deaths
>   were rare enough to hide it inside the band. Folding dead ticks in at zero output moved
>   settled parity from 6.4% → **2.2%**.
> - *Open, and PRE-EXISTING — not caused by stage 6.* One seed in eight produces **0 gold
>   and 0 kills across a 60-minute settled window** on `main` today (seed 6 at
>   `--parity --settled --minutes 60 --warmup 120`). The hero is alive and the run is simply
>   over. `--assert` passes anyway because it means the seeds together, so a total soft-lock
>   in 12% of runs is currently invisible to the gate. Worth its own investigation; the
>   failing seed number moves whenever RNG draw order changes, so chase the shape, not the 6.
>
> **Then:** 5 (dead fields, ability layer), 6b (cleave + raise the ceiling), 7 (C6). Note
> that **stage 6 is the same work as Track C2 in `.planning/world-systems-plan.md`**
> ("multiple concurrent enemies") — one job described in two documents. Whichever one is
> executed, update both. Track C2's stated blocker there ("the store models exactly one
> enemy at a time", "`activeDoTs` is a single global list") is **stale**: C7 built `mobs[]`,
> `targetMobId` and per-mob `dots` already.
>
> **A standing measurement caveat.** econSim reports "unchanged" for things it cannot reach.
> Its hero kills whatever it engages and never switches targets, so the target-switch fix
> above reads as a flat number there. A flat number from this harness is evidence only when
> the scenario actually exercises the change — check that before concluding anything.
>
> **econSim caveat that outlived the work:** the economy harness never spent talent points,
> so it had the identical blind spot. `spendTalents` fixes it (`talented` /
> `talented+party` shapes). Its older baselines are UNTALENTED and remain the conservative
> floor, not a description of a real build.

`runFight` is `[Side, Side]` with `side: 0 | 1`, `winner: 0 | 1 | null` and
`hp: [number, number]` (`engine/fight.ts:150-284`). N-sided means `sides: Side[]`, a team
id, a target-selection rule, and `side: number` in `FightEvent`. That loop rewrite is the
easy part. Four things are harder, and the first one invalidates the plan's own assumption
that this refactor arrives with a safety net:

- **The determinism harness has no golden file.** `checkDeterminism` compares run-to-run
  *within a single process* (`fightSim.ts:105-108`). So changing the RNG **draw order** —
  which any multi-target model inevitably does — will **not** fail the test. The suite goes
  on passing while no longer covering the thing that changed. Type-level breakage is
  limited to `hp: [number, number]`, `side: 0|1`, `winner: 0|1|null` and the positional
  `runFight(seed,a,b)` calls (`fightSim.ts:170`/`176`, `fightMain.ts:30`). **Commit a golden
  log file before touching `fight.ts`** — otherwise this refactor is unverified by
  construction. (Current measured baseline is 30/30 at `--seeds 6`, not the 20/20 recorded
  at L326; that figure is stale.)
- **Per-target proc state is the real cost, not the loop.** `mobFrozen`, `arcaneCharges`,
  `winterChillStacks`, `comboPoints` and `openerUsed` all live on the *attacker's* single
  `CombatProcState` (`types.ts:359-378`) and are read directly inside `resolvePlayerAttack`
  (`combat.ts:359`, `:364`). `resolvePlayerAttack` never receives a target at all — target
  state arrives as loose scalars (`mobHpFraction`, `targetBurning`). Splitting these into a
  per-target map changes the **persisted save shape** (`procState` is in `GameState`,
  `types.ts:597`) and needs a migration.
- **`FightEvent` needs an explicit `target` index, and that is mandatory, not optional.**
  Playback binds one opponent throughout: `Ambient.foe: number` (`combatAdapter.ts:342`),
  `playAmbientFightEvent` resolving attacker/target as `ev.side === 0 ? a : foe` (`:3180`),
  and the companion HP scan searching backwards for `e.side === 1` (`:2772`). Without a
  target index the log is ambiguous about who took the hit.
- **There is no cleave to generalise.** The only multi-target-looking talent,
  `sweeping_strikes`, compiles to `sweepingStrikesEnabled` which is **read by nothing**
  (`combat.ts:128` is the sole assignment); Bladestorm's AoE is a display note
  (`ironcleave.ts:208`), not an effect. N-sided does not *unlock* AoE talents — it creates
  the obligation to design them.

**Decide first whether the store adopts `runFight` or the two stay forked.** They are
already two loops that disagree: the store computes extra/flurry as flat 0.7×/0.5×
multipliers (`gameStore.ts:1533`, `:1543`) while `fight.ts` recursively re-resolves a full
attack (`:245-248`); the store has Seal Fate, Ice Barrier, Glacial Tomb, Last Stand, minion
DPS, Second Wind, Siphon Life, Rampage decay and the frozen state, and `fight.ts` has none
of them. Going N-sided in `fight.ts` alone widens a gap that is already real, and doing the
migration twice is the expensive path.

Two latent bugs that only multi-target exposes: **DoTs on non-targeted mobs never tick** —
`activeDoTs` is a projection of only the engaged target's dots (`gameStore.ts:1265`) and
only that list is advanced (`:1382`), invisible today because only one enemy is ever
fought. And `resetDotIds`/`dotSeq` are module-global (`combat.ts:490`), pinned per fight by
`fight.ts:165`; that is safe **only** because fights resolve synchronously one at a time,
so any model that interleaves concurrent fights mints colliding ids.

The store's tick should follow, not lead. Its combat path is also entirely unseeded —
`resolvePlayerAttack` is called with no `rng` (`gameStore.ts:1470-1481`), `resolveMobAttack`
with no fifth arg (`:1760`) — on top of the three named procs, Nightfall (`~:1388`),
Creeping Freeze (`~:1570`), Echo (`~:2251`), which are outstanding **Track P0** work. N
targets multiplies the unseeded rolls per tick, so N-sided work in the store makes the
determinism debt strictly worse before it gets better. Lift the procs into `combat.ts`
first.

### C6 — elite scaling and unique drops

Depends on C3's answer (party power is only meaningful once the party has power) and on
C5 (a scaled elite that still fights 1v1 is just a bigger health bar). Introducing a
player/party-power term into `spawnMob` is an economy change on its own, independent of
the companion question — measure it with `econSim` before and after rather than by eye.

Specific traps, all verified:

- **The difficulty dial is disconnected.** Per the live-bugs section above,
  `ELITE_DAMAGE_MULTIPLIER`/`BOSS_DAMAGE_MULTIPLIER` cancel out to identical DPS. Fix that
  (move the multiplier onto `MobInstance.damage`) *before* tuning anything, or every
  "elites hit harder" change will keep doing nothing.
- **Party power has no data path.** `spawnMob` receives only `(zoneId, state)`, and party
  membership lives in `engine/party.ts` module state behind the no-store-import rule.
  Either party state moves into `GameState` or the documented boundary is broken — this is
  a second, quieter instance of the C3 decision and should be decided with it.
- **Item level comes from the *player*, not the mob** (`gameStore.ts:1587` → `loot.ts:34`),
  so a party-scaled elite still drops player-level gear. Changing that moves the
  loot-value curve `econSim` measures.
- **Tier is signalled by prefixing the mob's name** (`'★ '`, `'[BOSS] '`), and downstream
  code regex-matches the name for temperament (`AGGRESSIVE_RE`/`RANGED_RE`,
  `combatAdapter.ts:95-104`) and for sprite choice (`resolveMobSprite` via `strHash(name)`,
  `fftaRoster.ts:156-161`). A new tier prefix silently changes a mob's sprite and whether
  it charges you.
- **Bosses empty the field.** `mobs = [spawned]` (`gameStore.ts:1336`) plus `isBossPresent`
  blocks further spawns; a multi-elite or party-scaled boss encounter has to work around
  that and around `persistedBoss` re-entry (`:1329`, `:1837`).
- **There are two kill handlers.** `gameStore.ts:2291` (the Umbral Bolt path) calls
  `rollLoot` but skips XP, kill counting, boss bookkeeping and `placeDrop` entirely. Any
  drop logic added to the main tick will be missing here.
- **`offline.ts:196-212` duplicates the drop roll** with `rarityBias 0` and no tier
  awareness, so elite/unique drop changes break online/offline parity unless mirrored.
- **`placeDrop` has no protected-item concept** — a unique with low `itemPower` can be
  auto-sold by the merchant contract or salvaged on a full bag (`loot.ts:145-165`). `Item`
  needs a flag before uniques exist.

### C7 — the world model (BUILT 2026-08-01, one invariant outstanding)

Taken ahead of the rest of the track by owner decision, because the manual-control
experience was the actual goal and everything else was scaffolding for it. Owner decisions
recorded: **unified world** (idle and manual share one physics, accepting the economy
shift) and **per-temperament aggro** (reuse `AGGRESSIVE_RE` rather than author 48 entries).

**The diagnosis that reframed the work.** Mobs had no position. `MobInstance.offset` was a
bearing *from the player*, and only the engaged mob's bearing shrank — so the population
was arranged around the camera and walking east took every monster east with you. Worse,
the store had no idea where the hero was under manual control: `playerMapPos` was a fixed
sine drift (`driftMapPos`) that ignored input entirely, while WASD/taps lived only in the
renderer. Proximity aggro was therefore not "unimplemented", it was **unrepresentable**.

Built:
- `MobInstance.pos/home/patrolTarget/patrolPause/aggro/aggroRadius/path/pathCool`. `pos` is
  authoritative in zone tile coords; `offset` is now DERIVED each tick, so the renderer,
  `nearestMob`, `setTarget` and `engageTarget` were untouched. Mobs are not persisted
  (`saved.mobs = []`), so no save migration was needed.
- `engine/mobBehaviour.ts` — temperament single-sourced out of the render adapter, which
  now imports it. Predators charge at 8.5 tiles, territorial hold to 3.0, bosses never
  pursue; patrol ranges and gaits alongside.
- Real patrol routes, proximity aggro, attack aggro, and a 14-tile leash home.
- `routeToward` — A* routing **in the store**, which is where Track C's pathfinding
  actually landed. `combatAdapter.onPlayerMoved` → `reportPlayerWorldPos` closes the
  manual-position loop through a callback, keeping the adapter store-free like its peers.
- **Deleted the teleport ambush** (`ROAMING_AGGRO_CHANCE`): it spawned a mob 2 tiles away,
  made it the target and seized control. That was the slot machine, literally.

**Four bugs the harness caught that reading could not.** Recording these because every one
presented as "the economy stopped" and none was visible in the diff:
1. `stepToward` had no unwedge fallback (which `driftMapPos` always had) — the hero froze
   on a shoreline for 25 simulated minutes. Fixed by routing, plus an 8-bearing escape.
2. Mobs spawned in **disconnected terrain components** (the worst zone has 7). Placement
   now checks reachability, not just walkability.
3. Auto-pilot walked to the *nearest* mob without asking whether it was reachable, so one
   marooned mob held the hero hostage past three reachable ones. Now skipped after 3s and
   retired after 12s so a replacement spawns. Bosses exempt.
4. **`initGame` seeded `worldSeed` from `Date.now()`, so the economy harness was never
   reproducible.** `--seed` pinned `Math.random` but not the terrain; three `--assert` runs
   of identical code gave parity 5.9% / 10.9% / 23.0% and invariant failures that wandered
   between shapes. Pre-existing, and invisible until terrain started deciding the economy.
   Now drawn from seeded `Math.random` alone; runs are byte-stable. **Any economy number
   measured before 2026-08-01 was a single random-terrain sample, including the 818g
   baseline below.**

**Measured (30 min, warrior, `--advance --equip --seed 1`):** 712g / 23.7 per min, 13
deaths, against a pre-change baseline of 818g / 27.3 per min, 12 deaths — about −13%, with
the caveat above that the baseline was not terrain-stable. All 8 scenario shapes hold
across 10 seeds; `fight.mjs` golden log byte-identical; `npm run build` green.

**Offline parity: RESOLVED, and the earlier diagnosis was wrong.** It was recorded here as
18.0% against a ±10% tolerance and attributed to the unified-world decision — "the kill
rate is now non-stationary because travel time depends on where mobs are" — with a
measured window sweep (600→18.0%, 900→16.9%, 1500→14.6%, 2400→12.5%) offered as evidence
of systematic bias. That reasoning was plausible and wrong. The cause was a bug:

**The no-target branch of `tick` skipped the entire world simulation.** `if (!currentMob)`
wrote a handful of combat fields and returned, so whenever the hero had nothing targeted,
no mob patrolled, no aggro check ran, and the hero did not move. Online play therefore
contained dead stretches the EMA rate sampled inconsistently, which is what the parity
number was measuring. The same partial write dropped `controlMode`/`manualIdleTimer`, so
the countdown decremented a local that was then discarded — manual control never expired,
because manual control clears the target and so runs through this branch constantly.

Both are fixed by extracting `tickWorld` and calling it on both paths. **Offline parity is
now 0.0% and every invariant holds** — the first fully green `--assert` of this work.
`OFFLINE_RATE_WINDOW_SECONDS` was left at its original 600; the sweep above was chasing a
symptom.

**Measured after the fix** (30 min, warrior, `--advance --equip --seed 1`): 1019g /
34.0 per min, 12 deaths, against a pre-change baseline of 818g / 27.3 per min, 12 deaths —
**about +25%**. All 8 scenario shapes hold across 10 seeds, offline parity 0.0%, golden
fight log byte-identical, `npm run build` green. The +25% is a balance question rather than
a correctness one and is a single dial (`PLAYER_WALK_SPEED`, currently 3.0, plus the
12–26 tile spawn band); note again that the baseline predates the `worldSeed` fix and so
was a single random-terrain sample.

**Still unverified:** the Venom Hollows immobile-spawn report. A rescue was added to the
adapter's `slide()` for a hero standing inside blocked ground, reasoned from
`walkability.ts:155` (spawn point 32,32 is blocked in exactly `venom_hollows` and
`grimshade_forest`). It is guarded so it only fires from inside blocked terrain, where the
alternative is being permanently wedged — but the one position sampled while stuck
reported `walkable: true`, which is evidence against that being the cause. The frozen-world
bug above is a better candidate and may have been the real one. Treat the `slide()` rescue
as speculative until someone walks into that zone.

### Sequencing

**C0** first and alone — it is the only part of this track that is arguably launch-relevant,
and its save-layer half (3.31 MB blobs, unguarded quota, destructive `readFile`) is a real
data-loss path that should not wait behind combat work.

Then **C1 → C2**, which are independent of the isolation decision and safe to build.
**C3 is a decision, not a task**, and it gates **C4** and (quietly) **C6**. **C5** is
independently valuable — it is Track P0 work regardless — but must be preceded by
committing a golden determinism log, without which it is unverified by construction.

Riskiest item is **C6**: it changes the economy whichever way C3 is decided, and it sits
on top of a difficulty multiplier that currently does nothing.

**Verification baseline, measured 2026-07-31 (all green before any change):**
`npm run build` exit 0, zero TS errors; `node tools/sim/fight.mjs --seeds 6` → 30/30
byte-identical, 32/32 seeds distinct; `node tools/sim/run.mjs --assert` → all 8 invariants,
offline parity, save migration ok. Two caveats worth recording: `run.mjs --assert`
**always exits 0** (`src/sim/main.ts` never calls `process.exit`), so it cannot gate
anything as written; and `esbuild` is imported by both runners but is **not in
`package.json`** — it resolves only because Vite hoists it, so a Vite bump breaks all
verification at once with an unrelated-looking error. Neither runner typechecks (esbuild
strips types), and nothing at all covers `combatAdapter.ts`'s 3,547 lines.

**Branch note:** work is on `battle-refactor`; the working practice at L112 names
`hackathon-refactor` and allows a different branch only if stated — stated here.

## Track S — accounts, character slots & creation (launch-critical; local now → hosted later)

**Shape:** a proper entry flow in front of the game — a **character select / login screen**
backed by persistent multi-character storage, plus a refreshed **character creation**
experience. Built **local-first** now (browser storage), with the persistence layer designed
so it can move behind a hosted account service later without a data-model rewrite.

**Why launch-critical:** today there is a single localStorage key (`idle_legends_save_v2`),
one character, and "New Game" wipes everything — one misclick destroys a run and there's no
way to try different class/race/faction combos without deleting progress. See the
[[character-persistence-and-save-slots]] memory for the current-state audit and the proposed
data shape.

**Scope:**
- **Save slots.** Namespaced multi-slot store (`idle_legends_saves_v1` → `{ slots: SaveSlot[] }`),
  each slot `{ id, createdAt, lastPlayedAt, summary, state: GameState }`. `loadGame/saveGame/
  resetGame` become slot-aware. 3–5 slots for a casual idle game.
- **Character select screen.** Shown on load above `ClassSelect`: lists saves with generated
  name, avatar (dimetric hero render via the renderer's `(spriteId, paletteId)` — the same
  identity Tracks P/L sync), class/race/faction, level, zone progress, last-played. Per slot:
  Continue, Delete (confirm). "New Character" enters creation.
- **Character creation refresh.** Rework the `ClassSelect → RaceSelect` flow into a cohesive
  creation experience: live dimetric preview of the hero rig recoloring as race/class/faction
  change (the palette registry *is* the wardrobe), name (generated + reroll/edit), faction
  pick. Sets up the visual-identity data Tracks M/P/L all read.
- **Persistence abstraction.** A storage interface (`load/save/list/delete` slot blobs) with a
  local implementation now, so the hosted-account backend (see below) is a drop-in later.

**Local now → hosted later.** Persistence stays in the browser until we stand up a hosting
service. When we do, the account backend is **shared with Track P** (cloud rosters/leaderboards)
and **Track L** (ambient heroes seeded from real player snapshots): one accounts + roster store
serves login, cross-device save, PvP snapshots, and world population. Decision gate before that
build — Supabase/Firebase vs. Game Center — is captured under Track P. No gameplay servers
needed; combat stays client-side deterministic.

**Sequencing:** save slots + character select are **launch-blocker** (data-loss risk); the
creation refresh pairs naturally with the dimetric hero preview now that the renderer exists.
The hosted-account swap is **post-launch**, gated with Track P.

## Track R — rebrand (parallel to render phases, launch blocker)

Audit result: the WoW debt is structural, not cosmetic — factions are "The Alliance" /
"The Horde", race "Tauren" is Blizzard IP, and most ability + talent names are verbatim
WoW ("Sinister Strike", "Life Tap", "Curse of Agony", "Overpower", "Fel Concentration"…).
Generic fantasy race names (human, dwarf, elf, orc, troll, goblin, gnome) and all zone
names are fine and stay.

Direction: an original world with a **hybrid tone** — the melancholy, war-torn,
clan-and-order political fantasy of GBA tactics games crossed with bold two-faction
conflict and punchy, vivid class fantasy. Never name or reference FF/WoW in-game or in
store metadata (trademark mentions also trigger App Store rejection).

**Status (2026-07-21): display-layer rebrand APPLIED.** `docs/art-direction.md` is the
world bible + full art direction + rename inventory (produced and cross-verified by a
multi-agent pass; supersedes the planned `docs/world-bible.md`).

1. ~~World bible~~ → art-direction doc §1: **The Lastlight Concord** ("Hold the last
   light.") vs **The Ashmarch** ("Ash behind us, fire ahead."); race Tauren → **Hornborn**
   (palette id `race/hornborn` already shipped).
2. ~~Rename inventory~~ → doc §6; a repo-verified IP sweep also caught zone/town display
   data (Worgen, Warsong, Grommash, Hexlord, Bloodscream, Zul', Dreadlord — all renamed).
3. ~~Apply display-name-only edits~~ → done across `src/data/` (factions, races, classes,
   all four talent trees, abilities, zones, towns), `nameGen.ts` prose, and the hardcoded
   combat-log strings in `gameStore.ts`. Internal ids untouched; saves preserved;
   `npm run build` green; submission grep sweep clean except the `fftaRoster.ts` `ffa_*`
   id tables (resolved by the art work below).

**Original sprite production — DONE (2026-07-21), behind `?noffta`.** All **18 shippable
sheets** live in `public/sprites/units/` (5 hero archetypes, 12 monster rigs, + `mob_grubkin`
as a cogling art variant): 9 transcribed from the doc's verified idle grids, 7 designed from
the §2.2 briefs, all imported through `importSprite.mjs` with no merge warnings. **The FFTA
scaffold stays the DEFAULT art;** the `?noffta` URL modifier swaps every scaffold id for its
original rig via `ORIGINAL_SPRITE` (fftaRoster.ts) — so the game renders FFTA by default and
the zero-FFTA-pixel set on demand. All three loaders (combat adapter, UI avatar cache, dev
harness) honor the toggle: default → scaffold → placeholder; `?noffta` → original → placeholder.
Verified: all 47 roster ids map to an existing original; `npm run build` green; dev server
serves `/`, `/?noffta`, harness, scaffold, and every original manifest at 200. Tooling fixed
en route: `importSprite.mjs` accepts the `death` tag and a `--palette` flag preserving semantic
slot order. Originals ship se-only (importer auto-reuses for the back facing). **For store
submission this default must flip** — the FFTA scaffold is never shipped, so originals become
default (or the roster swaps to `hero_*`/`mob_*` ids) before build.

Remaining before store submission:
- **Talent-name regression (2026-07-27, from the three-specs-per-class rework).** The nine
  trees authored in that pass reintroduced **97 verbatim WoW talent names** across 238
  (`Chaos Bolt`, `Metamorphosis`, `Blade Flurry`, `Shadow Dance`, `Vanish`, `Presence of
  Mind`, `Healthstone`, `Soul Link`, `Conflagrate`, `Titan's Grip`, …). The four trees
  rebranded on 2026-07-21 are still clean (0/20 each); the damage is in `warbringer.ts`
  (14/20), `emberwright.ts` (12), `the_unwritten.ts` (10), `gutterwork.ts` (15),
  `the_long_quiet.ts` (16), `cinderpact.ts` (16), `the_binding.ts` (16), `shadowed_edge.ts`
  (3). Display names only — internal ids untouched, so saves are unaffected. ~1 hour.
- Art polish pass on the weakest rigs (the 7 brief-designed monsters are functional but
  coarser than the spec rigs) and the optional distinct back-facing (`/ne`) rows.
- The [Speculative] fork pool (dwarf stoutguard, hornborn horns, tuskhog boar, carrionkite
  bird) — add on observed weak-read complaints.
- Replace `palettes.ts` `biome/map080` (decoded from the FFTA map) with an original ramp.
- Store-metadata sweep using the grep list in art-direction doc §6.4.
- Post-launch, needs a save migration: retire coined words inside internal snake_case ids
  (`warsong_mesa`, `grimshade_worgen`, `worgen_hide`) — not user-visible, exempt for now.

Track R is independent of Phases 0–4 and can run in any gap; it must be complete before
store submission.

## Open questions (non-blocking, defaults chosen)

1. **Map scale:** ASCII map shows ~55×22 of a 64×64 world. At 32×16 dimetric tiles the same
   viewport shows fewer tiles; I'll keep the player-centered camera and tune visible radius
   for the existing panel height. Flag if you want a specific zoom.
2. **Weather:** ASCII weather overlay has no direct sprite equivalent; Phase 3 will keep a
   simple canvas overlay (tinted clouds / rain streaks) unless you'd rather drop it.
3. **Dev harness route:** exposed as a separate Vite entry (`/harness.html`), dev-only,
   excluded from the production build.
