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
| 3 | Create the app record in App Store Connect with bundle id **`com.idlelegends.game`** | you | minutes | upload |
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
hardcodes the `/projects/idle-legends/` base; iOS serves from `capacitor://localhost` at
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

## 5. Submission assets

| Asset | Status |
|---|---|
| 1024×1024 icon | **done** — `store/icon-1024.png`, regenerate with `npm run icon` |
| Screenshots ≥1 at 1290×2796 | **done** — `store/screenshots/`, 6.9" iPhone |
| ≤2-min demo video on device | **todo** — needs the device build |
| Privacy nutrition label | **todo** — RevenueCat is a purchase-data processor; fonts are self-hosted and there is no analytics SDK, so the surface is small |
| Age rating | target 9–12+ (fantasy violence, no simulated gambling) |
| Export compliance | no non-exempt encryption |
| Promo code / free trial for judges | **todo** — generate promo codes in App Store Connect once the IAP is approved |

## 6. Judge-reachability note

On a phone the paywall is **two taps deep**: the `HERO` dock tab opens the character
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
