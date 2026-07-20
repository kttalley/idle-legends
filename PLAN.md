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
run without UI) — both sides see the same result. Faction (rebranded Alliance/Horde)
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
- **L0:** purely local ambient heroes — N per zone, deterministic seeded behavior +
  headless combat sim, rendered in-world; no backend. Big "alive world" payoff for
  render-only cost.
- **L1:** seed ambient heroes from Track P roster snapshots (real players as world NPCs);
  NPC quest-givers/vendors at town anchors.
- **L2:** light interactions — party-up with an ambient hero (AI companion), trade barks,
  world events (a boss draws a crowd of heroes).

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

Process (gen-AI-assisted, data-only, saves preserved):
1. `docs/world-bible.md` — pillars, tone words, naming morphology (build on the existing
   `nameGen.ts` phoneme voice and the original zone names as the seed style).
2. Scripted audit → full rename inventory (factions, 1 race, abilities, talents, any items).
3. Generate 3–5 candidates per term in the bible's voice; you pick; collision-check names
   against existing game trademarks.
4. Apply as **display-name-only** edits — internal ids (`arms`, `affliction`, `tauren`,
   file names) stay unchanged so save data and code are untouched.

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
