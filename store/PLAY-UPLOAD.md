# Google Play upload — internal track, 1.0 (1)

Written 2026-09-02. Account verified, app entry exists (package `com.stillmarch.game`,
name `Stillmarch: Idle MMORPG`). Everything below is a browser session in Play
Console; no CLI needed for the AAB itself.

**Assets ready this run:**

| Asset | File | Note |
|---|---|---|
| AAB | `android/app/build/outputs/bundle/release/app-release.aab` | signed with the fresh upload keystore `~/.android/keystores/stillmarch-play-upload.keystore` (alias `stillmarch-upload`). Verified: `webContentsDebuggingEnabled: false`, appId `com.stillmarch.game`. |
| Phone screenshots ×6 | `store/screenshots-play/01…06` | 1080×1920, 24-bit, no alpha (Play rejects >2:1; the Apple-size 1290×2796 set cannot be reused) |
| Icon | `store/icon-512-play.png` | 512×512, < 1 MB. **Play wants a 32-bit alpha PNG** — see §6 if it rejects it |
| Listing text | `PLAY-LISTING.md` | name 23/30, short 79/80, full ~1800/4000 |
| Privacy policy | `https://design.kristiantalley.com/stillmarch/privacy/` | same URL as iOS — fine to reuse |

**The keystore is a single point of failure.** `stillmarch-play-upload.keystore` +
`stillmarch-key.properties` live in `~/.android/keystores/`, mode 600. Back both up
off-machine *before* the first upload. Google will enroll it for Play App Signing;
you keep it for every future upload.

## 1. Upload the AAB

Internal testing → **Create draft release** → drag in `app-release.aab`. Release notes:
`First release of Stillmarch — offline idle RPG with a real shared world, skill trees,
and a hero that keeps marching while you sleep.` Version code 1 / name 1.0 is read from
the manifest; do not retype them.

## 2. Store presence (all under the main listing, same fields every track)

- **App name:** `Stillmarch: Idle MMORPG`
- **Short description:** `Offline idle RPG. Real shared world, skill trees, a hero that marches on while you sleep.` — see `PLAY-LISTING.md`; the 79-char version there is the one to trust
- **Full description:** paste verbatim from `PLAY-LISTING.md`
- **App icon:** `icon-512-play.png`
- **Screenshots (phone):** all six, in order 01→06, alt text from the labels in
  `store/screenshots-play/` (e.g. "Character creation — classes, races, factions")
- Feature graphic (1024×500) is **optional**; not made for this run. Add before the
  closed test goes public if there is time.

## 3. App content

- **Category:** Games → Role-playing
- **In-app products:** skip for now (see §5)
- **Ads:** No
- **Target audience:** Not made for kids

## 4. Content rating & data safety

**IARC** — answer per `PLAY-LISTING.md`. Key ones, consistent with the 9+ Apple rating:

- Violence: cartoon/fantasy, no gore
- Users interact: **Yes** (ladder, duels, report/block)
- UGC / user-generated content: **Yes** (player-named legends)
- Digital purchases: **Yes**

Because UGC = Yes, Play will ask which UGC features are moderated. Report and block
are implemented and the moderation surface is documented in `MODERATION.md` — answer
truthfully (report: Yes, block: Yes, filtering/review: human).

**Data safety** — the app sends:

- **Game data** (characters, progress, ladder standings) → Supabase, shared with other
  users, can be deleted, **not** used for ads
- **Crash data / diagnostics** → RevenueCat + Supabase (usage analytics), not shared,
  not for ads — only if the in-app diagnostics actually report; check
  `src/` before answering and tick only what ships
- **Purchases** → RevenueCat (in-app purchase provider)

Privacy policy URL: the iOS one (`…/stillmarch/privacy/`).

## 5. Monetization — do AFTER the internal build passes review, not now

RevenueCat needs a Google Cloud service-account JSON with Play Developer API access,
and the whole chain (GCP project → Play Console service-account grant → RevenueCat
app → entitlements `founder` / `standing_orders` → the two non-consumable products)
takes up to ~36 h of propagation to validate. Sequence it so the AAB is already testable
while that runs in the background:

1. This run: **no billing** declared. The shop will show the IAP fallback paths in
   `SUBMISSION.md §2` (it must not crash — the iOS 2.1(b) postmortem covers what an
   empty offering does to price display).
2. After internal testers confirm the app is stable: set up RevenueCat + GCP, then
   create the two Play products with the exact ids from `SUBMISSION.md §1`,
   re-upload the same AAB (bump `versionCode` to 2) with billing declared.

## 6. If the icon upload is rejected

Play's icon spec is 32-bit PNG **with** alpha; `icon-512-play.png` is 24-bit, no
alpha. Convert: `sips` won't add an alpha channel, so use
`python3 -c "import PIL; im=PIL.Image.open('store/icon-512-play.png').convert('RGBA'); im.save('store/icon-512-play-a.png')"` — or regenerate from the 1024 source.

## 7. Closed test (production prerequisite)

- **Create track → Closed**, 14+ days. Minimum tester count for a closed release is
  enforced per track; **recruit testers now** (friends/family/Shipaton Discord).
  **The 14-day clock starts when testers opt in**, not when you create the track —
  invite the day the internal build is green.
- After 14 days: **Apply for production access** (Test and release → Create
  production release). Google reviews new apps; expect the same kind of close reading
  Apple gave the "MMORPG" naming — the ladder is real, which is why the copy stays.

## What Play will check that Apple already accepted (don't be blindsided)

| Apple got it right on | Play equivalent |
|---|---|
| "MMORPG" claim + real ladder | "Misleading claims" — same standard, keep the ladder claim load-bearing |
| Terms + report/block (1.2) | UGC moderation declaration (§4) |
| No gambling (deliberate) | "Simulated gambling: No" |
| Honest IAP copy | "Free-to-play, no ads, one-time purchase, cosmetics/range only" |
