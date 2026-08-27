# Resubmitting 1.0 — the whole procedure, end to end

Written 2026-08-27, against **build 1.0 (16)**, in response to rejection
`ceda5a4d-d43b-41c6-a3e7-49f658564d2e` (guidelines 2.3.6, 1.2, 2.1b).

Everything that could be done over the App Store Connect API has already been done. What
is left needs the web UI, because the API refuses it — see §0 for exactly why.

---

## 0. Where things stand, and the one thing that blocks the API

| Thing | State |
|---|---|
| App ID | `6800207310` |
| Version record | `1.0` — **PREPARE_FOR_SUBMISSION** (editable) |
| Build attached to it | **16** (VALID, uploaded 2026-08-27) |
| Age rating | Messaging and Chat **Yes**, User-Generated Content **Yes** → rating **9+** |
| Review notes | Set, 3,930 chars (Apple's cap is 4,000) |
| Privacy Policy URL | `https://design.kristiantalley.com/stillmarch/privacy/` — live, and covers the report/block data |
| Terms URL (in-app) | `https://design.kristiantalley.com/stillmarch/terms/` — live, no-tolerance clause |
| Both IAPs | READY_TO_SUBMIT, fully configured (localization, price schedule, review screenshot all present) |

**The blocker.** The rejected submission `ceda5a4d…` is still in state
`UNRESOLVED_ISSUES` and still *owns* the version record. Any attempt to build a new
submission over the API fails with:

> `appStoreVersions 889588361 was already added to another reviewSubmission with id ceda5a4d…`

Only the UI releases it, which it does automatically when you submit again. There is also
**no in-app-purchase relationship on `reviewSubmissionItems` at all** — I probed
`inAppPurchase`, `inAppPurchaseV2` and `inAppPurchases`, and all three are rejected as
unknown. IAPs are attached through the version page, not as independent submission items.
So the final submit is a UI action by design, not an oversight.

---

## 1. Reply in Resolution Center

**URL:** https://appstoreconnect.apple.com/apps/6800207310/distribution/reviewsubmissions

- Open the rejected submission (`ceda5a4d-d43b-41c6-a3e7-49f658564d2e`, 23 Aug).
- Click **Reply** on the message from App Review.
- Paste the contents of **`store/REVIEW-REPLY.txt`** verbatim.
- Attach the screen recording from §2.

Reply *before* submitting. The reviewer reads the thread alongside the new build, and the
2.1(b) section explains a real root cause — that is far more persuasive than "we fixed it".

---

## 2. Record the screen recording Apple asked for

They asked specifically for a recording, on a physical device, showing the EULA, the flag
mechanism, and the block mechanism. Record it on **build 16**, not an earlier one — earlier
builds have the wrong legal URLs or no moderation UI.

1. **Delete the app first.** The terms gate only appears on a first launch (or after
   `TERMS_VERSION` is bumped), so a reinstall is the only way to film it.
2. Launch. The **Terms of Use** screen is the first thing on screen. Pause a beat on the
   first clause — "There is zero tolerance for objectionable content and abusive users."
3. Tap **I agree**.
4. On character creation, tap the **quill** icon and type a slur. Show the name being
   rejected and **Begin Your Legend** greying out. Clear it and enter a normal name.
5. Tap **Begin Your Legend**.
6. Open **MENU** → **LADDER**.
7. Tap the **⚑** on another player's row. Show the five reasons. Tap **Report only**, show
   the confirmation.
8. Tap **⚑** again on the same player → **Block and report**. **Show the row disappearing
   from the list immediately.** This is the beat the reviewer is looking for, and the one
   thing a recording can prove that a description cannot.

Keep it under about 90 seconds. Upload it in the Resolution Center reply.

---

## 3. Check the version page

**URL:** https://appstoreconnect.apple.com/apps/6800207310/distribution

Scroll the **iOS App 1.0** page and confirm:

- **Build** shows `1.0 (16)`. It is already attached; if the section is empty, click
  **Add Build** and pick 16.
- **In-App Purchases** — this is the section that caused half the last rejection. Both
  **Founder Pack** and **Standing Orders** must be listed here. If the section is missing
  or empty, click the **+** and add both. *They are not carried over automatically from the
  rejected submission.*
- **App Review Information → Notes** already contains the 1.2 walkthrough and the shop
  location. Leave it as is unless you want to add the recording's timestamps.
- **Sign-in required** stays **off** — there is no account system.

---

## 4. Confirm the age rating took

**URL:** https://appstoreconnect.apple.com/apps/6800207310/distribution/info

Under **Age Rating**, confirm **Messaging and Chat = Yes** and **User-Generated Content =
Yes**. Both were set over the API and read back correctly; this is a visual confirmation,
not a change. The resulting rating is **9+** — both flags together did not raise it,
because the 9+ was already driven by the cartoon-violence answers.

---

## 5. Submit

Back on the version page, click **Add for Review** (top right), then **Submit to App
Review** on the summary screen. Confirm the summary lists **three** items:

- iOS App 1.0 (16)
- Founder Pack
- Standing Orders

If the two purchases are missing from that summary, stop and fix §3 — submitting without
them repeats the 2.1(b) rejection with the reviewer once again unable to test a purchase.

Submitting supersedes the old rejected submission automatically; you do not need to cancel
it by hand.

---

## 6. What changed in the app since the rejected build

For your own reference, and in case the reviewer asks. Builds 4–16 were all iterations of
this work; **16 is the only one that matters**.

**Guideline 1.2 — user-generated content.** Terms gate before anything else; name filter
with leet/homoglyph/spacing normalisation; a flag on every ladder row opening a five-reason
report dialog; block that removes the player from the board and the world instantly, files
a report automatically, and persists server-side. New Supabase tables (`user_blocks`,
`content_reports`) with RLS, plus a `banned_until` column enforced by policy and trigger so
an ejected account cannot republish. Runbook in `store/MODERATION.md`.

**Guideline 2.1(b) — the store.** The real defect: an `async` function returned the
Capacitor plugin proxy, so the runtime's thenable check invoked a native method named
`then` and every StoreKit call rejected before it began, on device only. Fixed by returning
a wrapper object. Plus a direct `getProducts` path, an on-screen reason when a price is
missing, and product rows that are never hidden.

**Guideline 2.3.6 — age rating.** Both flags now Yes.

**Not required by the rejection, but in this build:** audio session set to `.playback` so
the game is audible with the Ring/Silent switch on; an authored music track replacing the
generative layer; Keychain-backed session so characters survive an uninstall, plus a
cloud-save restore at boot; boss combat fixed under manual control; ladder duels now fought
in the world instead of resolved on a server; a glowing per-colorway aura on the Founder
colorways; and several copy fixes.

---

## 7. If it comes back again

- **Store still failing?** Open ☰ → **Shop**. There is now an amber panel headed "Why there
  is no price" giving the specific cause, and it distinguishes a provider-configuration
  problem from App Store Connect not vending. Send that text.
- **Anything else on device?** The app now routes uncaught JavaScript errors and rejected
  promises through `console.error`, so they appear in a device or Simulator console
  instead of vanishing. `xcrun simctl launch --console-pty <device> com.stillmarch.game`
  after installing a Simulator build is the fastest way to see them.
