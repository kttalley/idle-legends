# Shipaton launch checklist

Event window **Jul 31 – Sep 30 2026**. The first public version must be live on the App
Store inside it. Written 2026-08-01.

The code side of the blockers is done and committed. What remains is dominated by
**external latency you cannot compress** — Apple's approvals, agreements and review. Those
should be started before any further code, because they run in parallel with everything
else and nothing ships until they clear.

---

## 1. Start today — these have queue time, not work time

| # | Step | Who | Latency | Blocks |
|---|---|---|---|---|
| 1 | **Apple Developer Program enrolment** ($99/yr) | you | ~24–48h individual; longer for an org (needs a D-U-N-S number, which is itself days) | everything |
| 2 | **Paid Applications Agreement** + banking + tax forms in App Store Connect | you | hours–days once enrolled; tax forms can bounce | *all* IAP — products cannot go live without it |
| 3 | Create the app record in App Store Connect as **Stillmarch**, bundle id **`com.stillmarch.game`** | you | minutes | upload |
| 4 | RevenueCat account, iOS app, **entitlement id `founder`**, one offering, App Store Connect API key | you | ~1h | the IAP working at all |

> The bundle id is set in `capacitor.config.ts`. It must match the App Store Connect record
> **before the first upload** — it cannot be changed for an app record afterwards.

Steps 1 and 2 are the true long pole. Step 2 in particular is the one people miss: an IAP
cannot reach "Ready to Submit" until the Paid Applications Agreement is active.

## 2. Local toolchain — two commands, both need sudo

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -runFirstLaunch
```

`xcode-select` currently points at `/Library/Developer/CommandLineTools`, so `xcodebuild`
does not exist and the iOS project has **never been compiled**. Capacitor 8 uses Swift
Package Manager, so CocoaPods is *not* needed.

Until this is done, "does it build and run on a device" is unverified. Treat it as the
next real risk after the Apple queue.

## 3. Build and run

```sh
npm run cap:sync     # build:native + copy into ios/App/App/public
npm run ios          # opens Xcode
```

Then in Xcode: select a team under Signing & Capabilities, add the **In-App Purchase**
capability, and run on a device.

**Use `npm run build:native`, never `npm run build`, for anything native.** The web target
hardcodes the `/projects/stillmarch/` base; iOS serves from `capacitor://localhost` at
the root, so a web build 404s every asset inside the WebView.

## 4. The IAP

- API key goes in `.env` as `VITE_REVENUECAT_IOS_KEY=appl_…` (it is a *public* SDK key, but
  keep `.env` out of git — it is already ignored).
- In App Store Connect create a **non-consumable** product, attach it to the RevenueCat
  offering, and map it to the `founder` entitlement.
- Sandbox-test with a Sandbox Apple ID before submitting.
- Verify **Restore Purchases** on a second device / after a reinstall. Apple tests this.

The entire gate is `requiresEntitlement` in `src/render/colorways.ts`, checked by
`isColorwayUnlocked()`. Adding a SKU means adding a colourway, nothing else.

## 4b. Listing metadata — the name fields are NOT the same field

The single most misread thing here: **the App Store listing name and the on-device app
name are separate fields and do not have to match.** Almost no idle game ships them the
same. `CFBundleDisplayName` is what sits under the icon on the home screen, where iOS
truncates around 12 characters; the listing name is what Apple indexes for search.

That is why the genre words go in the listing and *not* in the app: `Stillmarch: Idle
MMORPG` under an icon renders as "Stillmarch…", which is strictly worse than "Stillmarch",
while losing nothing in search — Apple indexes name + subtitle + keywords together, so the
genre terms score from the listing name regardless of what the home screen says.

| Field | Value | Limit |
|---|---|---|
| App Store listing name | `Stillmarch: Idle MMORPG` | 23/30 |
| Subtitle | `Offline AFK RPG - Skill Trees` | 29/30 |
| Keywords (hidden, comma-separated, no spaces) | `mmo,incremental,clicker,idler,auto,battler,tactics,fantasy,loot,pixel,progression,hero,quest,guild` | 98/100 |
| `CFBundleDisplayName` / home screen | `Stillmarch` | — |
| In-game title screen (`CharacterSelect.tsx`) | `Stillmarch` | — |

### Why "Idle MMORPG" and not "Idle RPG" — the central ASO call

Measured against the iTunes Search API on 2026-08-09, the two terms are not remotely the
same fight:

| `idle rpg` — the incumbents | ratings | `idle mmorpg` — the incumbents | ratings |
|---|---|---|---|
| RAID: Shadow Legends | 526,335 | IdleMMO – Online Idle RPG | 702 |
| AFK Arena | 497,693 | Corah: Multiplayer Idle Game | 685 |
| Mythic Heroes: Idle RPG | 48,260 | IdleArc: Idle MMORPG | 86 |
| Legend of Slime: Idle RPG | 41,617 | Spell Crit: Idle MMORPG | 14 |

Same audience, ~750× the competition. "Idle RPG" is unwinnable for a new indie; "idle
mmorpg" has a #1 result at 702 ratings, which is a rankable target. **Prefer the MMORPG
spelling over MMO** — Google autocomplete redirects every short form to the long one
(`afk mmo`→`afk mmorpg`, `auto mmo`→`auto mmorpg`), and `best idle mmorpg` outranks
`best idle mmo`.

The subtitle carries **RPG** deliberately: "RPG" does not match as an independent token
off "MMORPG", so without it in the subtitle the listing would not rank for plain RPG at
all. It also carries "offline" (a real, distinct, high-volume term — honest here because
core play needs no network) and "skill trees" rather than "talent trees", because the
audience searches *skill tree*. Keep "talent tree" in the in-game UI, where the WoW-fluent
player reads it as a signal.

**Keywords omit `idle`, `mmorpg`, `rpg`, `afk`, `offline` and `skill`** — all already in
the name or subtitle, and Apple indexes the three fields as one bag. `mmo` IS included:
Apple tokenizes on word boundaries, so it does not match off "mmorpg".

### The MMORPG claim has ONE prerequisite — do not ship without it

> Apple **2.3.1**: *"marketing your app in a misleading way, such as by promoting content
> or services that it does not actually offer… is grounds for removal of your app from the
> App Store… and termination of your developer account."*
>
> Nine live listings use MMO/MMORPG with thin multiplayer and App Review is clearly not
> screening for it, so this is a **low rejection risk but a real removal-and-backlash
> risk**. The fix is cheap: **ship at least one genuinely shared server feature** — a real
> cross-player leaderboard, a global chat channel, or a shared world-boss damage counter.
> Any one makes the claim evidenceable rather than decorative. Every surviving example in
> the niche has one.
>
> **Never present AI-simulated heroes as real players.** Ambient AI heroes are fine as
> world texture; a leaderboard of fabricated "players" is the specific artifact that draws
> both legal attention and review-bombing. Keep the living-world heroes clearly ambient and
> keep the leaderboard genuinely real.
>
> **If the leaderboard slips, fall back to `Stillmarch - Idle RPG` in the title** and keep
> MMORPG language in the description body only ("everything you love about an MMORPG,
> without the time investment"), which is comparison rather than feature claim. Title
> changes are cheap; a 2.3.1 removal is not.

Also per 2.3.7, keep prices and terms out of the subtitle — no "Free", no "Ad-free",
however tempting given the niche's competitors all lead with it.

## 5. Submission assets

| Asset | Status |
|---|---|
| 1024×1024 icon | **done** — `store/icon-1024.png`, regenerate with `npm run icon` |
| Screenshots ≥1 at 1290×2796 | **done** — `store/screenshots/`, 6.9" iPhone |
| ≤2-min demo video on device | **todo** — needs the device build |
| Privacy nutrition label | **todo** — RevenueCat is a purchase-data processor; fonts are self-hosted and there is no analytics SDK, so the surface is small |
| Age rating | target 9–12+ (fantasy violence, no simulated gambling) |
| Export compliance | no non-exempt encryption |
| Code / free trial for judges | **todo** — an **offer code**, NOT a promo code (see §7) |

## 5b. Judge access is an OFFER code — promo codes for IAPs no longer exist

Corrected 2026-09-02. Both this file and `store/SUBMISSION.md` used to say "generate promo
codes in App Store Connect once the IAP is approved". **That path was removed.** Apple
discontinued the creation of promo codes for In-App Purchases on **26 March 2026**; only
codes generated before then still redeem, and there are none. Following the old
instructions at the deadline finds an empty menu and burns a day.

The replacement is **offer codes**, which Apple extended in the same change to cover every
IAP type — consumable, non-consumable, non-renewing and auto-renewable. Non-consumables
are what this app sells, so they apply directly.

App Store Connect → the app → **Monetization → In-App Purchases** → pick the product →
**Offer Codes** → create an offer.

Use a **custom code**, not one-time-use codes. A custom code is a single string redeemable
by many people (up to 25,000 per batch), which is exactly the shape a Devpost submission
field wants — one line of text that every judge can redeem — where a one-time-use batch
would mean handing out and tracking individual codes. Limits: up to 10 active offers per
app, and the code quotas are shared across all of the app's IAPs.

Generate one for **Founder Pack** (`com.stillmarch.game.founder`) — it is the SKU that
unlocks the colourways, so it is the one that demonstrates the paywall. Standing Orders is
optional; a second code is free if you want judges to see both.

Also fill in the offer's **Image** field. It is marked optional and genuinely is, but it is
what appears in the redemption sheet — which is the first thing a judge sees. §1 of
`store/SUBMISSION.md` covers the size and the no-alpha rule.

## 6. Judge-reachability note

On a phone the paywall is **two taps deep**: the `MENU` dock tab opens the character
drawer, then `Looks`. Judges and App Review both need to find it. Consider surfacing it
in the dock directly before submitting, or say so explicitly in the review notes.

---

## What was verified, and how

There is still no automated renderer coverage, so everything visual below was checked by
driving real Chrome over CDP (see the `driving-the-app-headlessly` memory).

- Originals render as the default: 18 manifests + 18 sheets fetched, **0** requests to
  `local-assets`, **0** remote font requests.
- `grep -c local-assets dist/assets/*.js` → **0**. The scaffold branch is `import.meta.env
  .DEV`-folded, so no release bundle holds a code path *or a path string* that could
  request a scaffold asset.
- IP sweep of the shipped bundle over 49 Blizzard/Square terms → **0 hits**.
- Save blob is **7.6 KB** (was 2.63 MB of regenerable map data at full progression).
- Reload resumes in-game with the HUD instead of dumping to character select.
- With every `setItem` throwing `QuotaExceededError`, the hero kept taking damage, gaining
  XP and levelling across 14s — the loop survives a full disk.
- Paywall: 5 tiles, 3 locked; a locked tile cannot be equipped; granting the entitlement
  unlocks all 5. The dev grant seam greps to **0** in the release bundle.

Both gates green throughout: `node tools/sim/fight.mjs` (30/30 byte-identical, golden log
matched) and `node tools/sim/run.mjs --assert` (all invariants hold).

Remember that `run.mjs --assert` **always exits 0** — read its output, don't trust its
exit code. `fight.mjs` is the only real gate.
