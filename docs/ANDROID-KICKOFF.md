Port Stillmarch to Android for Google Play.

Start by reading `docs/ANDROID-PLAN.md` in full — it is the brief, and it carries
hard-won context from the iOS submission that you will otherwise re-learn the
expensive way.

Work on the `ship/android` branch (already created).

## Read this before you plan anything

**Android is NOT required for the RevenueCat Shipaton deadline (30 Sept 2026).**
The iOS release already satisfies eligibility. The contest categories that are
actually winnable here — HAMM/monetization, Best Game, Design — are judged on the
app and the argument behind it, not on how many stores it is in. So Android's
value is to the business (retention data, reach, cheaper UA testing), not to the
contest. Do not let the deadline drive engineering decisions, and do not propose
cutting corners to hit it.

**But start the Play clock in the background immediately**, because it is cheap
and it preserves the option. The old developer account under
talleykristian@gmail.com was closed by Google on 30 March 2024 for inactivity, so
this is a NEW personal account created in 2026 — which means the 12-testers-for-
14-continuous-days rule applies before production access can even be applied for.
Registration also involves identity verification that takes a few days of pure
dead clock.

So Phase 0 (appeal the closure as a long shot, register the new account, get any
signed AAB into a closed track, recruit 12 testers) happens first and runs in
parallel with everything else.

## First question to ask me

Whether the new Play account registration has been started, and if so whether
identity verification has cleared — that determines whether Phase 0 or Phase 1 is
the real starting point.

## Context to absorb from the plan rather than rediscover

- Never `await` a Capacitor plugin proxy. Returning one from an async function
  makes the runtime probe it for `.then`, the proxy bridges that to a native
  method named `then`, and every billing call rejects before it starts. This cost
  six TestFlight builds on iOS. `plugin()` returns a wrapper object deliberately.
- Capacitor does not auto-discover plugins in the app target; without explicit
  registration the bridge answers UNIMPLEMENTED and fails silently — the JS
  wrapper reads it as "no value stored".
- Route JS errors to the native log and read `adb logcat`. That is the Android
  equivalent of the iOS Simulator console that finally found the store bug. Do
  not debug from screenshots.
- Entitlement identifiers must be exactly `founder` and `standing_orders`, and
  product ids exactly `com.stillmarch.game.founder` and
  `com.stillmarch.game.standing_orders`. A mismatch takes the money and unlocks
  nothing — the worst failure mode in the app.
- The iOS Keychain session mirror has no Android equivalent yet (Phase 3).
  Preserve the boot ordering in `src/main.tsx`: session recovery is awaited before
  first paint, because `ensureSession()` mints a NEW anonymous user when it finds
  none, and winning that race permanently orphans the player's characters.

iOS 1.0 (16) is in App Review now. Do not change iOS behaviour on this branch.
