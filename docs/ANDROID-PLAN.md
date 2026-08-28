# Android port — plan and kickoff brief

Written 2026-08-27. Branch: `ship/android`. Target: Google Play, in time for
**RevenueCat Shipaton 2026 (submissions close 30 Sept 2026, 11:45 PM PT)**.

---

## Read this first: what the deadline does and does not require

**The old Play account is gone.** `talleykristian@gmail.com` held a developer account from
before Nov 2023 — which would have been exempt from the testing rule below — but Google
closed it on **30 March 2024 for inactivity** (warning sent 22 Jan 2024, deadline 22 Mar
2024). The $25 is not refundable and Google's stated remedy is to create a new account.
There is an appeal link in the Policy Center; inactivity closures are rarely reversed, but
it costs ten minutes and a reinstated account would restore the exemption, so it is worth
one attempt.

**So this is a new personal account, created in 2026, and the 12-tester rule applies.**
A minimum of **12 testers continuously opted in for 14 days** before you can even *apply*
for production access. A tester who opts out and back in resets their streak.

### Android is NOT required for Shipaton, and should not be treated as urgent

This is the most important line in this document, and it reverses an earlier read.

The **iOS release already satisfies Shipaton eligibility** — "first public version released
between 1 Aug and 30 Sept 2026". Android adds a second store, but the contest's winnable
categories (HAMM/monetization, Best Game, Design) are judged on the app and the argument
behind it, not on store count. Grand Prize is judged on traction that five weeks and no
budget will not produce.

**Therefore Android's value is to the business, not to the contest:** retention data that
iOS will not surface fast enough, cheaper UA testing, and reach. Do not let 30 September
drive engineering decisions here. If the clock is missed, Android ships in October and
nothing of consequence is lost.

What that means in practice:

- **Start the clock in the background anyway.** Register the account, get any signed AAB into
  a closed track, recruit testers. It is nearly free and it preserves the option.
- **Do not spend the five weeks here.** The higher-value use of that time is the iOS
  Shipaton entry: the 2-minute demo video, the HAMM writeup (half-drafted already in the
  header of `src/monetization/purchases.ts` — a documented reversal from a cosmetic-only
  thesis to a time-based SKU, with the counter-argument preserved), and build-in-public
  material from the six-build store bug.
- **If it lands by ~25 Sept, submit both.** If not, submit iOS alone and finish Android
  without a clock.

Rough timeline if pursued: register 28–31 Aug → identity verification a few days → closed
test live ~2–4 Sept → 14 continuous days → ~16–18 Sept → apply for production → Play review
→ live ~20–25 Sept. It fits with no room for a single slip, which is precisely why it must
not be load-bearing.

## Context a fresh session needs

Stillmarch is a Capacitor 8 app: a React + TypeScript web build (Vite) wrapped natively.
iOS 1.0 (16) is in App Review as of 2026-08-27, after three rejections. The whole game —
renderer, sim, store logic, moderation — is platform-agnostic web code. Only a thin native
shell differs, which is why Android is days rather than months.

Key files to understand before changing anything:

| Area | File | Why it matters here |
|---|---|---|
| Purchases | `src/monetization/purchases.ts` | RevenueCat. Contains the bug that cost six builds — see below |
| Session identity | `src/net/session.ts`, `src/net/keychain.ts` | iOS Keychain mirror; **needs an Android equivalent** |
| Native Keychain | `ios/App/App/KeychainPlugin.swift` | iOS-only. Registered in `SceneDelegate.swift` |
| Audio | `src/engine/audio/audioEngine.ts`, `musicTrack.ts` | `AVAudioSession` is iOS-only; Android needs its own answer |
| Moderation | `src/moderation/*` | Play has its own UGC policy; this already satisfies it |
| Build | `vite.config.ts` | `BUILD_TARGET=native` → `base: './'`; strips `VITE_LLM_URL` |

### Three traps already paid for on iOS — do not re-learn them

1. **Never `await` a Capacitor plugin proxy.** `plugin()` returns `{ Purchases }`, a wrapper
   object, deliberately. Returning the proxy from an `async` function makes the runtime probe
   it for `.then`, the proxy bridges that to a native method named `then`, and **every**
   StoreKit/Billing call rejects before it starts. Already fixed; the same trap applies to
   any new plugin wrapper you write.
2. **Capacitor does not auto-discover plugins in the app target.** `CAPBridgedPlugin`
   conformance is necessary but not sufficient — it needs explicit registration
   (`bridge?.registerPluginInstance(...)` on iOS). Without it the bridge answers
   `UNIMPLEMENTED` and the JS wrapper silently treats it as "no value stored". Expect the
   Android equivalent (`registerPlugin()` in `MainActivity`) to have the same failure mode.
3. **JS errors are invisible natively unless routed.** `src/main.tsx` routes `error` and
   `unhandledrejection` through `console.error`. On Android, `adb logcat` is the equivalent
   of the iOS Simulator console that finally cracked the store bug. **Use it early.**

---

## Work breakdown

### Phase 0 — start the clock (day 1, before any code)
- [ ] File the appeal on the closed account (Policy Center → appeal). Low odds; a reinstated
      pre-Nov-2023 account would be exempt from the 14-day rule, so it is worth one attempt.
- [ ] Register a NEW Google Play developer account ($25 one-time, non-refundable). Budget a
      few days for Google's identity verification — that time is pure dead clock, so start it
      immediately even if no code is ready.
- [ ] Create the app entry: package `com.stillmarch.game` (match iOS for consistency).
- [ ] `npx cap add android`, produce a signed AAB of whatever currently builds, upload to a
      **closed testing** track.
- [ ] Recruit 12 testers and get them opted in. The Shipaton Discord has a tester-exchange
      channel; friends and family count. **The 14 days start when they opt in, not when you
      upload.**

### Phase 1 — make it run
- [ ] `npm run build:native` already emits relative-base assets; confirm they resolve under
      `https://localhost` (Android's Capacitor scheme) as they do under `capacitor://localhost`.
- [ ] Signing config: generate an upload keystore, wire into `android/app/build.gradle`.
      **Back the keystore up somewhere durable** — losing it means losing the ability to
      update the app.
- [ ] Target SDK: Play enforces a recent `targetSdkVersion`. Set it to whatever Play currently
      requires, not whatever Capacitor scaffolds.
- [ ] Display cutout / safe areas: `BossBeacon` and the HUD use `env(safe-area-inset-*)` via
      `--safe-t`. Android WebView honours these only with `viewport-fit=cover` **and** an
      activity theme that lets content draw into the cutout. Verify on a notched device.
- [ ] Performance pass on a mid-range device. The renderer is a canvas depth-sorted scene
      that has only ever been tuned on iPhone; fragmentation will find things an iPhone never
      showed. `__ilScene` is exposed in DEV builds for probing.

### Phase 2 — money
- [ ] Play Console: create both products, matching the iOS identifiers exactly —
      `com.stillmarch.game.founder` ($4.99) and `com.stillmarch.game.standing_orders` ($2.99),
      both **non-consumable / one-time**.
- [ ] RevenueCat: add a Play Store app to the existing project. Needs a **Google Cloud service
      account JSON** with Play Developer API access — this is the fiddliest step and has a
      propagation delay of up to ~36 hours before purchases validate. Do it early.
- [ ] Attach both products to the **existing entitlements**, spelled exactly:
      `founder` and `standing_orders`. The code reads these strings
      (`FOUNDER_ENTITLEMENT`, `STANDING_ORDERS_ENTITLEMENT`). A mismatch means the purchase
      succeeds, the money is taken, and nothing unlocks — the worst failure mode in the app.
- [ ] Add the Android SDK key: `VITE_REVENUECAT_ANDROID_KEY` (`goog_…`), and select it by
      platform in `initPurchases()`. Currently that function hardcodes the iOS key.
- [ ] Verify BOTH products end to end with a licence tester: Founder Pack unlocks the three
      colourways *and* their auras; Standing Orders takes The Watch from 8h to 16h.

### Phase 3 — identity that survives uninstall
This is the one genuinely new piece of engineering.

On iOS the Supabase refresh token is mirrored into the Keychain, which survives app deletion
(`KeychainPlugin.swift` + `src/net/keychain.ts` + `recoverSessionFromKeychain()` awaited in
`main.tsx`). Android has no Keychain. Options, in order of preference:

1. **Android Auto Backup** — app data (including WebView `localStorage`) is backed up to the
   user's Google account and restored on reinstall, if `android:allowBackup="true"` and the
   device has backup enabled. Cheapest by far, but **not guaranteed** — it depends on user
   settings and can be skipped.
2. **Block Store / `EncryptedSharedPreferences`** behind the same `Keychain` JS interface,
   so `src/net/keychain.ts` needs no change — only a new Android plugin registering the same
   `jsName: 'Keychain'`. This is the honest equivalent and the recommended route.

Whichever is chosen, the boot order in `main.tsx` must be preserved: session recovery is
**awaited before first paint**, because `ensureSession()` signs up a *new* anonymous user
when it finds none, and winning that race destroys the only thing that could recover the
player's characters. `restoreMissingCloudSlots()` runs right after it.

### Phase 4 — audio
- [ ] iOS needed `AVAudioSession .playback` so the Ring/Silent switch does not mute the whole
      Web Audio graph. Android has no equivalent switch, but **does** need audio focus
      handling so the game ducks/pauses for calls and other media. Check whether the bed and
      the music track survive backgrounding and an interruption.
- [ ] The gesture latch in `App.tsx` (`pointerdown`/`keydown` → `initAudio()`) should work
      unchanged; verify, because Android WebView autoplay policy differs.

### Phase 5 — Play compliance
- [ ] **Data safety form.** Declare accurately: anonymous account identifier, character/progress
      data, and moderation records (reports and blocks). No ads, no analytics, no IDFA
      equivalent. The privacy policy is live at
      `https://design.kristiantalley.com/stillmarch/privacy/`.
- [ ] **UGC policy.** Play requires the same substance Apple's 1.2 demanded — in-app reporting,
      blocking, and a moderation process. All already built; point at `store/MODERATION.md`.
- [ ] Content rating questionnaire (IARC). Answer consistently with the App Store: cartoon
      violence, users interact, user-generated content.
- [ ] Store listing: reuse the ASO work in `store/LAUNCH.md`; Play's fields differ (title 30,
      short description 80, full description 4000) and **Play indexes the full description**,
      unlike Apple. That is a real difference worth exploiting.

---

## Verification approach

Mirror what worked on iOS. Do not debug from screenshots.

```sh
adb logcat -s chromium:* Capacitor:* '*:E' | grep -iE '\[iap\]|\[keychain\]|\[session\]|\[cloud\]'
```

The web UI suite (`npm run test:ui`) runs against Chrome and covers everything
platform-agnostic. Known pre-existing failures: two ladder checks and one flaky pvp spawn —
these were failing before any of this work and are not regressions.

Supabase gotcha that will waste an hour otherwise: repeated test runs exhaust the anonymous
sign-up rate limit and the symptom is *"Could not reach the ladder"* with an empty board.
That is a 429 on `/auth/v1/signup`, not a bug. Wait it out.

---

## Definition of done

- Closed test running with 12 testers opted in, clock started
- Both IAPs purchasable on Android and granting the correct entitlements
- A character survives uninstall → reinstall on Android
- Audio audible and well-behaved around interruptions
- Data safety + content rating submitted
- No regression in `npm run test:ui` beyond the three known failures
