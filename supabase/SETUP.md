# Track N setup — leaderboard & duels

Everything in `src/net/` and `supabase/` is written and tested, and it is **off** until the
two env vars below exist. Nothing here blocks playing, building, or shipping the game
without it — `npm run test:ui` covers the switched-off path explicitly (`ladder` suite).

Work top to bottom. Steps 1–4 take about twenty minutes; step 5 (Sign in with Apple) needs
an Apple Developer account and can wait until after launch.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. **Choose the region deliberately** — it is fixed at creation and cannot be changed
   later. Pick the one nearest your players (`us-east-1` for a US-first launch).
3. Set a database password and keep it; you will not need it for the app, but you will for
   any direct `psql`/`pg_dump` access, which is also your exit route from Supabase.

**Plan: you need Pro ($25/mo), not Free.** This is not an upsell — **free projects pause
after one week of inactivity.** For an idle game whose core play pattern is "I did not open
it for a week", a paused backend means the leaderboard is dead exactly when players come
back. Start on Free while developing, but switch before you submit to the App Store.

## 2. Create the tables

Dashboard → **SQL Editor** → **New query**. Paste the entire contents of
[`schema.sql`](./schema.sql) and run it. It is idempotent, so re-running after an edit is
safe.

Verify: Dashboard → **Table Editor** should now show `roster_snapshots` and `duels`, each
with a green **RLS enabled** badge. If either says RLS is disabled, stop and re-run —
without it, any client could read and write anything.

## 3. Turn on anonymous sign-in

Dashboard → **Authentication** → **Sign In / Providers** → enable **Anonymous sign-ins**.

This is what lets a brand-new player appear on the ladder without an account. Gating the
game's only social feature behind an Apple prompt on first launch would cost far more
players than it protects; the account can be upgraded to Apple later without changing the
user id, so nothing is lost by starting anonymous.

## 4. Wire up the app

Dashboard → **Project Settings** → **API**. Copy the **Project URL** and the **`anon`
public** key into `.env` at the repo root:

```sh
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **The `anon` key is public by design** — it ships in the app and grants nothing on its
> own, because RLS decides what each request may do based on the JWT, not the key.
>
> **The `service_role` key is the opposite: it bypasses RLS entirely.** Never put it in
> `.env`, and never name any variable `VITE_SERVICE_ROLE` — **Vite inlines every `VITE_*`
> variable into the shipped JavaScript**, so that one mistake would hand every player full
> write access to your database. It belongs only in Edge Function secrets, where the
> platform injects it automatically.

Restart `npm run dev`. Open the **LADDER** tab in the log panel — you should see your own
character on the board instead of the "offline in this build" message.

## 5. Deploy the duel resolver

```sh
brew install supabase/tap/supabase   # macOS; `npm i -g supabase` is refused by the package
supabase login                       # needs a real TTY — a non-interactive shell cannot
supabase link --project-ref YOUR-PROJECT-REF
npm run deploy:duel
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform — do not set
them yourself.

**Why `npm run deploy:duel` and not `supabase functions deploy duel`.** The function imports
the game's real combat code, which is the whole point: one combat implementation, used by
client and server, so a duel result can always be reproduced by a replay. But importing it
*directly* (`../../../src/engine/fight`) does not deploy. Tried on 2026-08-15; it fails with

```
Failed to bundle the function (reason: Module not found ".../source/src/engine/fight")
```

because the Supabase API bundler walks the import graph itself and it neither resolves
extensionless specifiers nor uploads files from outside the function's own directory.
`deno.json`'s `sloppy-imports` only ever addressed the first half.

So `tools/bundleDuelResolver.mjs` emits an extension-qualified copy of the subtree into
`supabase/functions/duel/_game/`, and `npm run deploy:duel` regenerates it on every deploy.
`_game/` is **gitignored on purpose** — a committed copy could go stale and quietly become
the second combat implementation this design exists to avoid.

It copies **28 modules, of which 18 execute**; the other 10 arrive through `import type`
chains (`data/types.ts` alone reaches `engine/offline`, `engine/loot`, `data/items` …) and
are erased before anything runs. Any claim of "six runtime modules" elsewhere in this repo
predates measuring it — `data/classes` pulls in all twelve talent trees by itself.

The bundler refuses to emit a module that touches `window`, `document`, `localStorage`,
`navigator` or `import.meta` **on the executing path**, naming file and line. Type-only
modules are exempt, which is not a loophole: they are erased before Deno sees them, and
`engine/offline` is exactly such a module — it touches `window` and is genuinely unreachable
from the resolver.

Verify after deploying: open the LADDER tab in two different browser profiles (so you get
two anonymous users), and duel one from the other.

## 6. Sign in with Apple — post-launch

Anonymous accounts are per-device: clear storage and the ladder identity is gone. That is
acceptable at launch (the *character* lives in localStorage with an IndexedDB mirror and is
unaffected), but it means a player who reinstalls loses their ladder standing.

When you add it:

1. Apple Developer portal → create a **Services ID** and a **Sign in with Apple** key.
2. Supabase → Authentication → Providers → **Apple**; paste the Services ID and key.
3. On native iOS, use a Capacitor Sign in with Apple plugin to obtain the **identity
   token**, then call `signInWithApple(identityToken, rawNonce)` from `src/net/session.ts`.

> **The single most common failure:** pass the **raw** nonce, not its SHA-256 hash. Apple
> embeds the hash in the token and Supabase re-hashes what you send to compare. Sending the
> hashed value fails with an unhelpful error.

Guideline 4.8 requires an "equivalent" login option if you offer third-party logins. Sign
in with Apple satisfies it trivially, which is why it is the one to ship.

---

## What this costs

| | @1k DAU | @10k DAU |
|---|---|---|
| Supabase Pro | $25/mo | $25–40/mo |

Your data shape is tiny — a roster snapshot is a couple of KB, so 10,000 players is ~300 MB
against an 8 GB quota. You will not hit a storage or operation cliff; the cliffs are
MAU-priced auth and egress, and neither bites below ~50k users.

## Why this earns the "Idle MMORPG" listing name

Apple **2.3.1** makes promoting a service the app does not offer grounds for removal. The
ladder is the evidence behind the name — see `store/LAUNCH.md` §4b.

Which sets one rule that must never be broken: **every row on the ladder is a real
player's character.** The game is full of ambient LLM-driven heroes and they are good world
texture, but putting them on the board would turn a defensible claim into a fabricated one
— and "AI presented as real players" is the specific pattern that attracts both legal
attention and review-bombing. An empty ladder is fine. A padded one is not.

## Design notes worth knowing before you change anything

**Bearer tokens, never cookies.** iOS defaults `NSHTTPCookieAcceptPolicy` to
`OnlyFromMainDocumentDomain`, so a `capacitor://localhost` origin has cross-domain cookies
refused *regardless of CORS headers*. This is not a preference — cookie auth cannot be made
to work here, and it is why we use plain `fetch` rather than `@supabase/supabase-js` (whose
PKCE flow is known to break in a Capacitor WKWebView when the app backgrounds).

**The server resolves duels; the client only replays them.** The Edge Function reads both
snapshots from the database, generates the seed, runs `runFight`, and writes the row with
`service_role`. There is deliberately **no client-side RLS policy for writing `duels`** — so
a modified client cannot report a win. It returns the seed, and the client re-runs the same
pure function locally to animate the fight. If the local replay disagrees with the server's
winner, that is version skew and the UI says so rather than showing a fight that
contradicts its own result banner.

**Cloud failure is never an error path.** Every entry point returns a falsy result instead
of throwing, and the `ladder` UI suite exists to keep that true.
