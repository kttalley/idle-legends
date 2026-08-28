Port Stillmarch to Android for Google Play, targeting the RevenueCat Shipaton
deadline of 30 September 2026.

Start by reading `docs/ANDROID-PLAN.md` in full — it is the brief, and it carries
context from the iOS submission that you will otherwise re-learn the hard way.

Work on the `ship/android` branch (already created, currently identical to
ship/round2-revisions).

The single most important thing: the binding constraint is NOT code. A personal
Google Play account created after 13 Nov 2023 must run a closed test with 12
testers continuously opted in for 14 days before it can even apply for production
access. Counting back from 30 Sept, that clock has to start by ~10 Sept. So
Phase 0 in the plan — create the Play account, create the app entry, get ANY
signed AAB into a closed track, recruit testers — happens before any engineering,
and everything else runs in parallel behind it.

First, tell me whether the Play developer account already exists and whether it is
a personal or an organization account, because organization accounts are exempt
from the 14-day rule and that changes the whole schedule.

Context you should absorb from the plan rather than rediscover:
  - Never `await` a Capacitor plugin proxy. Returning one from an async function
    makes the runtime probe it for `.then`, the proxy bridges that to a native
    method named `then`, and every billing call rejects before it starts. This
    cost six TestFlight builds on iOS. `plugin()` returns a wrapper object.
  - Capacitor does not auto-discover plugins in the app target; without explicit
    registration the bridge answers UNIMPLEMENTED and fails silently.
  - Route JS errors to the native log. `adb logcat` is the Android equivalent of
    the iOS Simulator console that finally found the store bug. Do not debug from
    screenshots.
  - Entitlement identifiers must be exactly `founder` and `standing_orders`, and
    product ids exactly `com.stillmarch.game.founder` and
    `com.stillmarch.game.standing_orders`. A mismatch takes the money and unlocks
    nothing.
  - The iOS Keychain session mirror has no Android equivalent yet — Phase 3 of the
    plan. Preserve the boot ordering in `src/main.tsx`: session recovery is awaited
    before first paint because `ensureSession()` mints a NEW anonymous user when it
    finds none, and winning that race permanently orphans the player's characters.

iOS 1.0 (16) is in App Review now; do not change iOS behaviour on this branch.
