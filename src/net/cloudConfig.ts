// ── Cloud configuration ────────────────────────────────────────────────────────
//
// Track N adds three things the game has never had: an account, a cross-player
// leaderboard, and async duels. All three sit behind this one module, and all three are
// OFF unless both env vars are set. That is deliberate and load-bearing:
//
//   - The game must keep working with no network and no account. It is an idle RPG whose
//     entire save layer is local (see `storagePersistence.ts`); cloud is an addition, never
//     a dependency. Every call site treats "cloud disabled" as an ordinary state, not an
//     error path.
//   - A dev clone with no `.env` must still run, build, and pass `npm run test:ui`.
//
// **Why plain `fetch` instead of `@supabase/supabase-js`.** Two reasons, one of them a
// real bug we would otherwise inherit:
//
//   1. Supabase's JS client stores its session and drives OAuth through a PKCE flow that
//      is known to break inside a Capacitor WKWebView — the app backgrounds to
//      SFSafariViewController, iOS may clear cookies, and the code verifier disappears,
//      producing a silent infinite sign-in loop. We sidestep it entirely by holding a
//      bearer token ourselves and never relying on a cookie. See `session.ts`.
//   2. iOS defaults `NSHTTPCookieAcceptPolicy` to `OnlyFromMainDocumentDomain`, so a
//      `capacitor://localhost` origin has cross-domain cookies refused *regardless of what
//      CORS headers the server sends*. Cookie-based auth cannot be made to work here.
//      Bearer tokens are not a preference; they are the only thing that functions.
//
// Supabase's REST surface is PostgREST and its auth surface is GoTrue — both are plain
// HTTP with an `apikey` header. The client library is a convenience we do not need, and
// skipping it keeps the dependency list at six and the bundle smaller.

/** Project URL, e.g. `https://abcdefgh.supabase.co`. No trailing slash. */
const RAW_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

/**
 * The **anon** key, which is a public identifier, not a secret — it is designed to ship in
 * clients. It grants nothing on its own: every table is protected by row-level security,
 * so what a request may read or write is decided by the JWT in the `Authorization` header,
 * not by this key.
 *
 * The `service_role` key is the opposite — it bypasses RLS entirely and must NEVER appear
 * in this file, in `.env` files that Vite inlines (anything named `VITE_*` is inlined into
 * the bundle), or anywhere else the client can see. It belongs only in Edge Function
 * secrets.
 */
const RAW_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function clean(v: string | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\/+$/, '')
  return t.length > 0 ? t : null
}

export const SUPABASE_URL = clean(RAW_URL)
export const SUPABASE_ANON_KEY = clean(RAW_ANON)

/**
 * True when the cloud features may be attempted at all.
 *
 * Checked at every entry point rather than once at boot, because a value derived at module
 * load would be wrong in the sim harnesses (`tools/sim/*`), which execute this module under
 * esbuild with no DOM and no Vite env injection.
 */
export function cloudEnabled(): boolean {
  return (
    SUPABASE_URL !== null &&
    SUPABASE_ANON_KEY !== null &&
    /^https:\/\//.test(SUPABASE_URL)
  )
}

/** REST (PostgREST) base — table access lives under here. */
export function restUrl(path: string): string {
  return `${SUPABASE_URL}/rest/v1/${path}`
}

/** Auth (GoTrue) base. */
export function authUrl(path: string): string {
  return `${SUPABASE_URL}/auth/v1/${path}`
}

/** Edge Functions base — the duel resolver lives under here. */
export function functionsUrl(path: string): string {
  return `${SUPABASE_URL}/functions/v1/${path}`
}

/**
 * How long any single cloud request may take before we give up.
 *
 * Every cloud feature is optional and has a local fallback, so a slow network must degrade
 * to "no leaderboard today" rather than to a spinner the player waits on. Deliberately
 * shorter than the browser default.
 */
export const REQUEST_TIMEOUT_MS = 8000
