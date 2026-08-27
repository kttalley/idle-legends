# Submission packet — paste-ready

Everything below is copy-paste for App Store Connect / RevenueCat. Written 2026-08-22
against the v1.0.0 build. Field limits verified. See LAUNCH.md for the *why* behind the
name and keyword choices.

## 1. App Store Connect — In-App Purchases

Two products. Both **non-consumable**. Product ids can never be reused once created — use
exactly these, they are what RevenueCat will map.

| Reference name | Product ID | Price | Display name | Description |
|---|---|---|---|---|
| Founder Pack | `com.stillmarch.game.founder` | Tier 5 ($4.99) | Founder Pack | Three exclusive colourways for your hero, and the founder's mark. Cosmetic only — nothing here changes your progress. |
| Standing Orders | `com.stillmarch.game.standing_orders` | Tier 3 ($2.99) | Standing Orders | Your hero ranges unsupervised for 8 hours longer. A one-time, permanent extension — never a refill. |

### The two image fields on each product — different slots, different rules

| Field | Size | File | Notes |
|---|---|---|---|
| Review Information > Screenshot | **640x920** | `~/Desktop/stillmarch-iap-screenshots/founder-pack.png`, `standing-orders.png` | `npm run iap-shots` |
| Image (Optional) | **1024x1024** | same folder, `*-1024.png` | `npm run iap-art` |

Two traps, both hit for real on 2026-08-22:

- **Do not upload a 1290x2796 app screenshot into the Review Screenshot slot.** It is a
  valid App Store screenshot size and ASC still rejects it here with "The dimensions of
  one or more screenshots are wrong" — this slot takes the legacy device sizes. 640x920 is
  the size Apple's own help page names, and is what `iap-shots` now emits.
- **Neither image may carry an alpha channel**, even a fully opaque one. Both tools write
  `colorType: 2`.

The Image field is marked optional and genuinely is — but it is what appears in **offer
code redemptions**, which is exactly how the Shipaton judges will redeem their access. Fill
it in.

## 2. RevenueCat mapping — ids must match the code exactly

The client looks packages up by identifier (`findPackage` in `src/monetization/purchases.ts`).
A mismatch shows no price and silently sells nothing.

| Entitlement ID | Package identifier | Attached product | Code reference |
|---|---|---|---|
| `founder` | `founder` | `com.stillmarch.game.founder` | `FOUNDER_ENTITLEMENT`, `src/render/colorways.ts` |
| `standing_orders` | `standing` | `com.stillmarch.game.standing_orders` | `STANDING_ORDERS_ENTITLEMENT`, `purchases.ts:37` |

Both packages go in **one offering**, marked current.

### The offering is no longer a single point of failure — but still set it up

Build 1.0(3) was rejected under 2.1(b), "the products in the store failed to load". The
cause was not in the app: the paywall read prices ONLY from the offering above, and an
offering is dashboard state. Products not attached, or an offering not marked current, and
`getOfferings()` returns nothing forever — with App Store Connect perfectly configured.
Six TestFlight builds of client-side fixes could not move it, because there was nothing
client-side to fix.

`loadOfferings()` now falls back to `Purchases.getProducts([...])` against the product ids
compiled into `PRODUCT_IDS` (`src/monetization/purchases.ts`), which asks StoreKit directly
and ignores offerings entirely; `buy()` can complete a purchase by that path via
`purchaseStoreProduct`. Entitlements still grant, because that mapping lives on the product.

**This is a floor, not a replacement.** Configure the offering anyway — it is what lets
prices and packaging change without shipping a build.

### Reading the on-screen diagnostic

The shop shows the specific reason a price is missing. Which half is at fault:

| Message contains | Fault lies in |
|---|---|
| `no current offering` / `offering empty` / `none matching` | **RevenueCat.** Products not attached, or the offering is not marked current. |
| `StoreKit returned 0 products for the compiled ids` | **App Store Connect.** Paid Apps Agreement not in effect, product not in a reviewable state, or a bundle-id mismatch. RevenueCat is irrelevant here. |
| `getProducts failed: …` | The bridge or the network. Retry. |

### Paid Apps Agreement

Business → Agreements must show **Paid Apps** as in effect. Without it StoreKit vends
nothing at all and every path above returns empty. Apple named it explicitly in the 1.0(3)
rejection, so confirm it before resubmitting.

## 2b. Age rating — Messaging and Chat must be YES

Guideline 2.3.6, from the same rejection. The app shows a chat interface, so the answer is
Yes regardless of the fact that the chat is generated on-device and nothing is transmitted
between players. The rating describes what the user can see and do on screen, not what
crosses the network. App Information → Age Rating.

## 2c. User-generated content — guideline 1.2

Implemented in this build; the runbook and the required screen-recording script are in
`store/MODERATION.md`, and the reply text is in `store/REVIEW-REPLY.txt`.

Two things that are NOT in the app and must be done in the dashboard:

- The migration `supabase/migrations/20260826000000_moderation_blocks_and_reports.sql`
  must be applied to the live project (`supabase db push`). Without it, blocking and
  reporting fail silently.
- `public/terms.html` and `public/privacy.html` must be deployed and reachable at
  `https://design.kristiantalley.com/stillmarch/terms/` and `…/privacy.html`. They
  ship with `npm run build`. The privacy URL also goes on the listing.

Then add to `.env` (gitignored, public SDK key, iOS key not the secret one):

    VITE_REVENUECAT_IOS_KEY=appl_...

Without it the app boots fine and logs `[iap] VITE_REVENUECAT_IOS_KEY is unset — running
with no entitlements`. That is the failure mode to watch for on device.

## 3. Listing metadata

- **Name:** `Stillmarch: Idle MMORPG`  (23/30)
- **Subtitle:** `Offline AFK RPG - Skill Trees`  (29/30)
- **Keywords:** `mmo,incremental,clicker,idler,auto,battler,tactics,fantasy,loot,pixel,progression,hero,quest,guild`  (98/100)
- **Icon:** `store/icon-1024.png`
- **Screenshots:** `store/screenshots/`, 1290x2796. Upload order matters — only the first
  three appear on install sheets. Use `02-world`, `03-combat`, `01-create`, then
  `04-hero`, `06-wardrobe`.
- **Age rating:** 9-12+ — infrequent/mild fantasy violence, no simulated gambling, no
  unrestricted web access.
- **Export compliance:** no non-exempt encryption (HTTPS only).
- **Category:** Games > Role Playing, secondary Simulation.

### Promotional text (170 max)
Your hero keeps marching while you are away. Come back to loot, levels, and a world that
moved without you.

### Description
Stillmarch is an idle MMORPG for people who love the shape of an MMO and cannot give it
forty hours a week.

Pick a class, spend your talent points, and send your hero into the march. Combat resolves
itself — you make the decisions that matter: the build, the gear, the route, the fights
worth picking. Close the app and it keeps going. Open it tomorrow and collect.

- SKILL TREES WITH TEETH. Real talent trees per class, respecable, with builds that read
  differently rather than just scaling harder.
- OFFLINE PROGRESS. Your hero ranges unsupervised for hours. No energy timers, no
  countdowns to nag you back.
- LOOT AND TEMPERING. Craft, temper, and push quality on the gear you find.
- A LIVING WORLD. Zones, gathering nodes, town vendors, and heroes going about their own
  business around you.
- REAL PLAYERS. A genuine cross-player ladder — publish your roster, challenge other
  people's real characters, and climb. Not bots dressed up as a leaderboard.
- NO GACHA. No loot boxes, no odds tables, no gems. Purchases are named things you can see
  before you buy.

Free to play. Two optional one-time purchases, no subscriptions required.

## 4. App Review notes  — PASTE INTO "Notes" ON THE APP REVIEW PAGE

The in-app purchases are two taps from the main screen: tap the HERO tab in the bottom
dock, then the "Looks" tab in the drawer that opens. The Founder Pack colourways are the
locked tiles there; tapping a locked tile opens the purchase sheet. Standing Orders is on
the same drawer's watch meter.

Restore Purchases is at the bottom of the same Looks panel.

No account or login is required to play or to purchase. The game runs fully offline; the
only network feature is the optional cross-player ladder (Supabase), reachable from the
LADDER tab beside COMBAT and CHAT. Leaderboard entries are real player-submitted rosters.
Ambient non-player heroes seen walking the world are clearly labelled as world texture and
never appear on the ladder.

## 5. Privacy nutrition label

| Question | Answer |
|---|---|
| Do you collect data? | Yes |
| Purchases | Collected, linked to identity, App Functionality — RevenueCat processes purchase/receipt data |
| Identifiers (user ID) | Collected, linked to identity, App Functionality — anonymous Supabase user id for the ladder |
| User Content | **Not** collected at launch. Becomes "collected, linked" if the hosted LLM proxy ships and player-typed whispers leave the device — update the label in that release. |
| Tracking | No. No analytics SDK, no ad SDK, fonts are self-hosted. |

## 6. Still blocked on other steps

- **Demo video** (<=2 min, on device) — needs the TestFlight build.
- **Promo codes for Shipaton judges** — App Store Connect > Pricing and Availability >
  Promo Codes, only after the IAPs are approved.
