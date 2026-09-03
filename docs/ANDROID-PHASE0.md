# Android Phase 0 — the clock, run by hand

Written 2026-08-27. This covers everything in ANDROID-PLAN.md Phase 0 that is done by a
human in a browser, not by code. The engineering (Phase 1+) runs in parallel; this page
exists because identity verification is **pure dead clock** — the single most expensive
thing in the whole plan is any day that passes without this checklist moving.

Status at writing: registration **started**, identity verification **pending**. Nothing
below the "when console access clears" section can proceed until it does.

---

## 1. The appeal (10 minutes, low odds, do it anyway)

File from the Policy Center: <https://play.google.com/console/policy-center> — sign in with
`talleykristian@gmail.com`, find the closure notice, use the appeal link.

Facts to state (all verifiable, no argument needed):

- Account held a Google Play developer registration from before November 2023.
- The closure was for **inactivity** (warning 22 Jan 2024, deadline 22 Mar 2024, closure
  30 Mar 2024) — not a policy violation. No apps were ever published under it.
- Request: reinstatement of the registration. If reinstated, the account predates
  November 2023 and is exempt from the personal-account testing requirement, which would
  remove 14 days of mandatory closed testing from a launch this quarter.
- One attempt only. Inactivity closures are rarely reversed; do not spend a second appeal
  or any engineering time on it.

## 2. Registration & identity verification (in flight)

- New personal developer account, $25 one-time. Identity verification: government ID +
  address; Google quotes a few days. **No part of the plan can start while this runs.**
- While waiting, nothing is lost by preparing §4 and §5 below — they cost zero console
  access.

## 3. The moment console access clears (do these the same day)

Every day between console access and tester opt-in is a day added to the tail of the
launch. The order matters: **testers opt in against a closed track that must already
exist.**

1. Create the app entry. Package name `com.stillmarch.game` (matches iOS and
   `capacitor.config.ts`). Default language: English (US).
2. Upload the signed AAB (produced by Phase 1; `android/app/build/outputs/bundle/…`) to a
   **closed testing** track. Name the track release, add release notes. It does not need
   to be the final build — any signed AAB that boots unlocks the track.
3. Create the tester list (email list, 12+ addresses), attach it to the closed track, and
   copy the **opt-in link**.
4. Send every tester the opt-in link (§4) and record the date they opt in (§5).

The 14-day clock starts **per tester when they opt in**, not when the build uploads.
A tester who opts out and back in resets their own streak. The requirement is 12 testers
*continuously* opted in for 14 days — so the tracking table matters, and a straggler who
opts in a week late sets the production-application date back a week.

## 4. Tester recruitment message

Adapt as needed; send individually, not as a group blast (people ignore group blasts, and
you need all 12):

> I'm about to release my game (Stillmarch — a slow idle RPG; think "a little world that
> keeps playing while you're away") on Google Play, and Google requires 12 testers for 14
> days before it can launch. That's the whole ask: click one link, install the app, and
> leave it installed for two weeks. You don't have to play it, though it does play itself.
>
> Two things that actually matter:
> 1. Use this link (it's a private test): <OPT-IN-LINK>
> 2. Install from the Play Store page it opens, and **don't uninstall** — if you do and
>    reinstall, Google makes the clock start over for you.
>
> Android phone or tablet required. Shout if the install gives you any trouble and I'll
> fix it fast — you're doing me a real favour here.

Sources of testers: friends and family first; the RevenueCat Shipaton Discord has a
tester-exchange channel for the rest. Recruit **14–15**, not 12 — assume one or two go
stale, and the requirement is continuous.

## 5. Tester tracking table (keep this filled in)

| # | Tester | Opt-in date | Status | Notes |
|---|--------|------------|--------|-------|
| 1 |        |            |        |       |
| 2 |        |            |        |       |
| … |        |            |        |       |

Rule of thumb: production access can be *applied for* when the 12th continuous streak
crosses 14 days. If the table says most people opted in around the same day, that date is
that day + 14.

## 6. RevenueCat on Play — the fiddly one, do it early

The plan flags a propagation delay of **up to ~36 hours** before purchases validate, so
this must be done days before the money phase is tested, not the same day. Console access
required for the Play-side half only; the RevenueCat dashboard half can be partly done
now.

Order (Google's flow; each step gates the next):

1. **Google Cloud project** — create (or reuse) one; note its ID.
2. **Service account** — create in that project, JSON key, download it. Grant it nothing
   in Cloud; the grant happens in Play Console next.
3. **Play Console → Setup → API access** — link the Cloud project, then grant the service
   account **"View app information" + "Manage orders and subscriptions"** (the financial
   data permission is what RevenueCat's docs ask for; without it, purchase validation
   fails silently).
4. **Upload the JSON to RevenueCat** → Play Store app in the existing project → paste
   service account JSON → wait. The dashboard shows "credentials pending" during the
   propagation window; purchases made in that window fail validation.
5. Create both products in Play Console as **one-time / non-consumable**:
   `com.stillmarch.game.founder` ($4.99) and `com.stillmarch.game.standing_orders`
   ($2.99) — identifiers verbatim; a mismatch takes the money and unlocks nothing.
6. In RevenueCat, attach both products to the **existing** entitlements spelled exactly
   `founder` and `standing_orders`, and add them to the current Offering.
7. Copy the Android public SDK key (`goog_…`) into `.env.local` as
   `VITE_REVENUECAT_ANDROID_KEY` (same file that holds the iOS `appl_…` key; it is a
   public SDK key, but keep it out of the repo all the same).

Licence testing: add your own Gmail(s) under **Setup → Licence testing** so test purchases
don't charge real money, and check "License Testing" behaviour of `android.test.purchased`
is understood before the end-to-end pass in Phase 2.