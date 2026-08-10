// ── The one place a cloud request is made ──────────────────────────────────────
//
// Everything Track N sends or receives goes through `cloudFetch`. Centralising it buys
// three properties that are tedious to maintain call-by-call:
//
//   1. **It never throws.** Every function returns `CloudResult`, and the game loop is
//      never in a position to take an exception from a network hiccup. This mirrors the
//      discipline already established in `saveSlots.writeFile` — an idle game that dies
//      because a leaderboard was slow is a worse game than one with no leaderboard.
//   2. **It never hangs.** Every request carries an AbortController on
//      `REQUEST_TIMEOUT_MS`. A pending fetch with no timeout is how a panel gets a
//      permanent spinner.
//   3. **Auth is applied in exactly one place**, so no call site can forget the bearer
//      token or accidentally reach for a cookie.

import {
  cloudEnabled,
  REQUEST_TIMEOUT_MS,
  restUrl,
  SUPABASE_ANON_KEY,
} from './cloudConfig'
import { getAccessToken } from './session'

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'disabled' | 'offline' | 'unauthorized' | 'server'; status?: number }

interface CloudFetchOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** PostgREST `Prefer` header, e.g. `return=representation` or `resolution=merge-duplicates`. */
  prefer?: string
  /** Skip the bearer token. Only for endpoints that are legitimately public. */
  anonymous?: boolean
}

export async function cloudFetch<T>(url: string, opts: CloudFetchOpts = {}): Promise<CloudResult<T>> {
  if (!cloudEnabled()) return { ok: false, reason: 'disabled' }

  let token: string | null = null
  if (!opts.anonymous) {
    token = await getAccessToken()
    if (!token) return { ok: false, reason: 'unauthorized' }
  }

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY as string,
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.prefer) headers.Prefer = opts.prefer

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctl.signal,
      // Explicit, and the reason is the whole cookie story in `cloudConfig.ts`: never send
      // or accept credentials. iOS would refuse them anyway, and asking for them turns a
      // working request into a CORS preflight failure.
      credentials: 'omit',
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized', status: res.status }
    }
    if (!res.ok) return { ok: false, reason: 'server', status: res.status }
    // 204 and empty bodies are normal for writes without `return=representation`.
    if (res.status === 204) return { ok: true, data: undefined as T }
    const text = await res.text()
    if (text.length === 0) return { ok: true, data: undefined as T }
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return { ok: false, reason: 'offline' }
  } finally {
    clearTimeout(timer)
  }
}

/** Read rows from a table. `query` is a PostgREST query string without the leading `?`. */
export function selectRows<T>(table: string, query: string): Promise<CloudResult<T[]>> {
  return cloudFetch<T[]>(`${restUrl(table)}?${query}`)
}

/**
 * Insert or update by primary key.
 *
 * `resolution=merge-duplicates` makes this an upsert, which is what every Track N write
 * wants: a player pushes their snapshot repeatedly over a session and each push should
 * replace the last, not accumulate rows.
 */
export function upsertRow<T>(table: string, row: unknown): Promise<CloudResult<T[]>> {
  return cloudFetch<T[]>(restUrl(table), {
    method: 'POST',
    body: row,
    prefer: 'resolution=merge-duplicates,return=representation',
  })
}
