// ── Session: bearer tokens, held by us, never a cookie ─────────────────────────
//
// The whole auth story is: get a JWT, put it in an `Authorization` header, refresh it
// before it expires. No cookies anywhere. See the note in `cloudConfig.ts` for why cookies
// are not merely discouraged here but non-functional inside a Capacitor WKWebView.
//
// The session lives in localStorage under its own key, deliberately separate from the save
// keys in `saveSlots.ts`. Two reasons:
//
//   - The save layer has a hardened recovery path (`storagePersistence.ts`) that treats the
//     saves blob as the thing worth resurrecting. A session token is the opposite: cheap to
//     re-obtain, harmful to restore from a stale mirror. Keeping it in its own key means the
//     mirror never carries it and recovery never reinstates a dead token.
//   - Signing out must not be able to touch a character. Separate keys make that structural
//     rather than a thing we remember.
//
// Losing the session is always survivable — it costs a sign-in, never a character.

import { authUrl, cloudEnabled, REQUEST_TIMEOUT_MS, SUPABASE_ANON_KEY } from './cloudConfig'
import { keychainGet, keychainRemove, keychainSet } from './keychain'

const SESSION_KEY = 'stillmarch_session_v1'

/**
 * The same session, mirrored where an uninstall cannot reach it.
 *
 * iOS deletes the whole app container when the app is deleted — WebView `localStorage`
 * included — so a session stored only there means a reinstall mints a BRAND NEW anonymous
 * user and the player's characters stay on the server owned by an identity nobody can
 * prove any more. There is no login and no email to match them against, so that loss is
 * permanent and silent, which is the worst combination.
 *
 * The Keychain is the one iOS store that survives deletion. Mirroring the refresh token
 * there turns a reinstall into an invisible recovery, with no account system, no sign-in
 * screen, and nothing for the player to remember. It does NOT follow the player to a new
 * device — that needs a real identity (`signInWithApple`, already written and still
 * unused) — so this is the floor, not the ceiling.
 */
const KEYCHAIN_SESSION_KEY = 'session_v1'

/**
 * Refresh this many milliseconds before the token actually expires.
 *
 * A token that expires mid-request produces a confusing 401 on an operation the player
 * just started. Sixty seconds is comfortably longer than any request we make (the cap is
 * `REQUEST_TIMEOUT_MS`, 8s) plus a slow refresh round trip.
 */
const REFRESH_MARGIN_MS = 60_000

export interface Session {
  accessToken: string
  refreshToken: string
  /** Absolute epoch ms. GoTrue returns `expires_in` seconds; we store the deadline. */
  expiresAt: number
  userId: string
}

let cached: Session | null | undefined

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Session>
    if (
      typeof s.accessToken !== 'string' ||
      typeof s.refreshToken !== 'string' ||
      typeof s.expiresAt !== 'number' ||
      typeof s.userId !== 'string'
    ) return null
    return s as Session
  } catch {
    // Corrupt or unreadable (private mode, cleared storage). Treat as signed out — the
    // cost is one sign-in, so there is nothing here worth trying to salvage.
    return null
  }
}

function write(s: Session | null): void {
  cached = s
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Quota or private mode. The in-memory `cached` still works for this session, so the
    // player is signed in until they close the app. Strictly better than throwing.
  }
  // Mirror to the Keychain on EVERY write, not just at sign-in. Supabase rotates the
  // refresh token on each refresh, so a mirror taken once would go stale and be rejected
  // the first time it was ever actually needed — the failure would surface months later,
  // on the one reinstall it existed to survive.
  if (s) void keychainSet(KEYCHAIN_SESSION_KEY, JSON.stringify(s))
  else void keychainRemove(KEYCHAIN_SESSION_KEY)
}

/**
 * Restore the session from the Keychain when local storage has none. Call once, at boot,
 * BEFORE anything reads a session — `main.tsx` awaits it beside the save recovery.
 *
 * Deliberately does nothing when a local session already exists: localStorage is the live
 * copy and the Keychain is its backup, so preferring the backup could hand back a token
 * older than the one in use.
 */
export async function recoverSessionFromKeychain(): Promise<boolean> {
  if (readStored()) return false
  const raw = await keychainGet(KEYCHAIN_SESSION_KEY)
  if (!raw) return false
  try {
    const s = JSON.parse(raw) as Partial<Session>
    if (
      typeof s.accessToken !== 'string' ||
      typeof s.refreshToken !== 'string' ||
      typeof s.expiresAt !== 'number' ||
      typeof s.userId !== 'string'
    ) return false
    // Straight through `write`, so localStorage and the in-memory cache are both filled.
    // The access token may well be expired — that is fine and expected after a reinstall;
    // `getAccessToken` refreshes it from the refresh token on the next call.
    write(s as Session)
    console.info('[session] recovered from the keychain after a reinstall')
    return true
  } catch {
    return false
  }
}

/** The stored session, if any. Does not validate freshness — use `getAccessToken`. */
export function currentSession(): Session | null {
  if (cached === undefined) cached = readStored()
  return cached
}

export function isSignedIn(): boolean {
  return currentSession() !== null
}

export function signOut(): void {
  write(null)
}

/** Shape GoTrue returns from every token-issuing endpoint. */
interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: string }
}

function toSession(r: TokenResponse): Session | null {
  if (
    typeof r.access_token !== 'string' ||
    typeof r.refresh_token !== 'string' ||
    typeof r.user?.id !== 'string'
  ) return null
  // `expires_in` is seconds and has been absent in some GoTrue error shapes; one hour is
  // the platform default and a safe floor, because an early refresh is harmless.
  const ttl = typeof r.expires_in === 'number' ? r.expires_in : 3600
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: Date.now() + ttl * 1000,
    userId: r.user.id,
  }
}

async function postAuth(path: string, body: unknown): Promise<Session | null> {
  if (!cloudEnabled()) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(authUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    if (!res.ok) return null
    return toSession((await res.json()) as TokenResponse)
  } catch {
    // Offline, DNS failure, timeout. Cloud features simply stay unavailable.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Exchange an **Apple identity token** for a Supabase session.
 *
 * The identity token comes from native Sign in with Apple (a Capacitor plugin) or from
 * Apple's web flow. We never see the user's Apple credentials — only the signed JWT Apple
 * issues, which Supabase verifies against Apple's public keys.
 *
 * `nonce` must be the **raw** nonce whose SHA-256 hash was passed to Apple. Apple embeds
 * the hash in the token; Supabase re-hashes what we send and compares. Passing the hashed
 * value here is the single most common way this call fails.
 */
export async function signInWithApple(identityToken: string, nonce?: string): Promise<boolean> {
  const s = await postAuth('token?grant_type=id_token', {
    provider: 'apple',
    id_token: identityToken,
    ...(nonce ? { nonce } : {}),
  })
  if (!s) return false
  write(s)
  return true
}

/**
 * Sign in anonymously.
 *
 * This is the default path, and it matters more than it looks. A player who has never
 * signed in still needs an identity to appear on a leaderboard or receive a duel, and
 * gating the game's only social feature behind an Apple prompt on first launch would cost
 * far more players than it protects. Anonymous users are real rows with real JWTs; the
 * account can be upgraded to Apple later without changing the user id.
 *
 * Requires "Allow anonymous sign-ins" to be enabled in the Supabase dashboard.
 */
let signupInFlight: Promise<boolean> | null = null

export async function signInAnonymously(): Promise<boolean> {
  // Concurrent callers share one sign-up, for the same reason they share one refresh
  // below — but the failure here is worse, and it is not hypothetical. `ensureSession`
  // is check-then-act: two callers both see no session, both POST `signup`, and the
  // second `write` wins. The first user still EXISTS, still holds a JWT, and has usually
  // already published a roster row — which is now an orphan that no client will ever
  // update again, because nothing holds its refresh token.
  //
  // Observed 2026-08-15 driving the real app: one LadderPanel mount produced two
  // anonymous users and two identical rows on the board. React StrictMode's double-effect
  // makes it every time in dev; in production `refresh()` and the duel-history fetch mount
  // together, and `challenge()` calls this too.
  //
  // It also breaks the rule the ladder exists to satisfy: every row must be a real
  // player's character (supabase/SETUP.md). Rows cloned by a race are not fabricated
  // players, but a board showing the same hero N times reads exactly like a padded one.
  if (signupInFlight) return signupInFlight
  signupInFlight = (async () => {
    const s = await postAuth('signup', {})
    if (!s) return false
    write(s)
    return true
  })().finally(() => { signupInFlight = null })
  return signupInFlight
}

let refreshInFlight: Promise<string | null> | null = null

async function refresh(session: Session): Promise<string | null> {
  const s = await postAuth('token?grant_type=refresh_token', {
    refresh_token: session.refreshToken,
  })
  if (!s) {
    // The refresh token is dead (revoked, rotated, expired). Clear the session so the next
    // call starts clean instead of retrying a token that will never work again.
    write(null)
    return null
  }
  write(s)
  return s.accessToken
}

/**
 * A usable access token, refreshing first if it is close to expiry. Null when signed out
 * or when the refresh failed.
 *
 * Concurrent callers share one refresh: the leaderboard and the duel list can easily fire
 * together on a panel open, and two simultaneous refreshes would rotate the refresh token
 * twice, invalidating the session we just stored.
 */
export async function getAccessToken(): Promise<string | null> {
  const s = currentSession()
  if (!s) return null
  if (Date.now() < s.expiresAt - REFRESH_MARGIN_MS) return s.accessToken
  if (!refreshInFlight) {
    refreshInFlight = refresh(s).finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

/**
 * Ensure there is *some* session, creating an anonymous one if needed.
 *
 * Call before any cloud write. Returns false when cloud is disabled or unreachable, which
 * every caller must treat as "skip this feature", never as an error to surface.
 */
export async function ensureSession(): Promise<boolean> {
  if (!cloudEnabled()) return false
  if (currentSession()) return (await getAccessToken()) !== null
  return signInAnonymously()
}
