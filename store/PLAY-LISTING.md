# Google Play listing — drafts

Written 2026-08-27 for the Android port. The ASO reasoning lives in `store/LAUNCH.md`
(read that first — especially the "Idle MMORPG" analysis and its one prerequisite); this
file only adapts it to Play's fields, which differ from Apple's in one way worth
exploiting: **Play indexes the full description**, so the keyword fields that had to be
crammed into Apple's 100 hidden characters can live in visible, readable prose here.

## Fields

| Field | Value | Limit |
|---|---|---|
| App name | `Stillmarch: Idle MMORPG` | 23/30 |
| Short description | `Offline idle RPG. Real shared world, skill trees, hero marches while you sleep.` | 79/80 — see below |
| Full description | see below | ≤4000, indexed |

Short description (80 chars — count carefully, Play hard-truncates):

```
Offline idle RPG. Real shared world, skill trees, heroes march while you sleep.
```

(79/80.)

### Full description

Structure notes: front-load the genre terms in the first two lines (that is what shows
above the "Read more" fold), keep sentences scannable, no price claims, no "free" in a
way that violates the honest-ads norms, and keep every claim evidenceable — the shared
world is real (cross-player ladder, duels), so the MMORPG language survives the same
2.3.1-style scrutiny Play applies via its "misleading claims" policy.

```
Stillmarch is an idle MMORPG that plays itself: your hero marches, fights, loots and
levels in a persistent world — for eight hours at a stretch, even while you are away.

A WORLD THAT DOES NOT WAIT FOR YOU
Set your route, gear up, and leave. Progress accrues offline. Come back to loot, levels,
and a log of what your hero did while you slept.

A REAL SHARED WORLD — NOT A SIMULATED ONE
The Marching Ladder is a genuine cross-player leaderboard: every rank on it is another
person's hero, measured on the same server. Challenge real players' legends to duels.
No fabricated "players", no fake activity — the MMO in the title is load-bearing.

SKILL TREES WITH CONSEQUENCES
WoW-style talent trees where every point is a choice. Respec is free; indecision is the
only cost. Build the paladin who never dies, the warlock who melts elites, or something
the meta has not seen yet.

LOOT THAT MEANS SOMETHING
Pixel-art gear rendered from the same sheets the world is built from. Every sprite,
colourway and aura is drawn in-engine — nothing is a stock asset.

MODERATED, SAFE MULTIPLAYER
Report and block any player from their legend page. Reports go to a human moderation
process. No chat with strangers is required to play; the social layer is opt-in.

MADE FOR THE LONG HAUL
• Offline progress — the game runs up to 8 hours unattended (16 with Standing Orders)
• Persistent characters that survive reinstalls
• No energy timers, no gacha, no randomized paid items, no ads
• One optional one-time purchase that expands offline range — never power, never paywall
  progression

Stillmarch respects your time. It is an idle game in the literal sense: a small, living
world that keeps marching whether you watch it or not.
```

Character count: ~1800/4000 — headroom to grow as features land.

## IARC content-rating questionnaire — answer consistently with Apple

- Violence: cartoon/fantasy violence only, no gore → "Mild/Cartoon"
- Users interact: **Yes** (ladder, duels, report/block)
- Shares user-provided content / UGC: **Yes** (legends/characters are player-named —
  this is why the moderation surface matters)
- Digital purchases: **Yes** (in-app purchases present)
- Gambling/simulated gambling: **No** (deliberately — see purchases.ts header)
- Expected rating: Everyone 10+ / PEGI 7 territory — verify against the actual
  questionnaire, do not assume.

## Data safety form — declare exactly this

Collected: anonymous account identifier (Supabase anon user id), app activity
(gameplay/progress data), app interactions for moderation (reports and blocks, stored).
NOT collected: location, financial data (Play handles payment; RevenueCat receives
purchase tokens as processor), IDs for advertising, analytics. No data shared except as
required to provide the features above. Encryption in transit: yes. Deletion request
mechanism: must point at a real URL — check what the privacy page offers before
answering this one; if it lacks a deletion path, that is a to-do, not a checkbox.

Privacy policy URL: `https://design.kristiantalley.com/stillmarch/privacy/`

## Store listing assets

| Asset | Status |
|---|---|
| App icon 512×512 | derive from `store/icon-1024.png` (same art; Play wants PNG ≤1MB, no alpha for the listing icon) |
| Feature graphic 1024×500 | **todo** — required for listing; not yet designed |
| Phone screenshots | reuse `store/screenshots/` after re-shooting against the Android build (min 2, 16:9 or 9:16) |
| 7" / 10" tablet screenshots | optional but recommended; iPad set exists for reference |