// ── The duel resolver, server-side ────────────────────────────────────────────
//
// Runs in Deno on Supabase Edge Functions. It imports the game's OWN `runFight` — not a
// reimplementation — which is the point of the whole design: there is exactly one combat
// implementation, it is pure and seeded, and `src/sim/fightSim.ts` already proves it
// replays byte-identically. The client re-runs the same call locally to animate the fight.
//
// What this function is for is trust. If the client resolved duels, a modified build would
// simply report wins. Here the inputs come from the database (not the request body), the
// seed is generated server-side, and the row is written with `service_role` — for which no
// client-side RLS policy exists at all. A client can lie about the character it published;
// it cannot lie about a result.
//
// ── Deploy ──────────────────────────────────────────────────────────────────
//   supabase functions deploy duel
//
// `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
// platform — do NOT add them to `.env`, and never expose the service-role key to the app.
//
// ── The one thing to verify on first deploy ─────────────────────────────────
// The game's modules use extensionless relative imports (`./rng`), which Vite resolves and
// stock Deno does not. `../deno.json` enables `sloppy-imports` to bridge that. If a deploy
// ever fails on module resolution, the fallback is a thin build step that emits an
// extension-qualified copy of the resolver subtree — it is only six runtime modules
// (fight, combat, rng, data/classes, data/specs, data/constants).

import { runFight } from '../../../src/engine/fight'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** MUST match `DUEL_FIGHT_OPTS` in `src/net/cloudDuel.ts`. Divergence here reads as a
 *  determinism bug and is miserable to track down; see the note there. */
const FIGHT_OPTS = { stepSeconds: 0.25, maxSeconds: 60, maxEvents: 256 }

/** Duels one user may start per window. Bounds abuse and stops a defender being spammed. */
const RATE_LIMIT = 30
const RATE_WINDOW_MINUTES = 10

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // The app runs from `capacitor://localhost` on iOS and a normal origin on web, so
      // the allowed origin cannot be a fixed string. Nothing here is cookie-authenticated
      // (see `src/net/cloudConfig.ts`), so a wildcard grants no ambient authority — every
      // request must still carry a bearer token.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    },
  })

/** Service-role PostgREST call. Bypasses RLS — never expose this path to caller input
 *  beyond the parameters below. */
async function db<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`db ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return (text.length ? JSON.parse(text) : null) as T
}

/**
 * Resolve the caller's user id from their bearer token.
 *
 * Asking GoTrue rather than verifying the signature locally: it is one round trip inside
 * the same project, and it cannot be wrong about revocation the way a local signature
 * check can. Returns null for any invalid or expired token.
 */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: auth },
    })
    if (!res.ok) return null
    const user = await res.json() as { id?: string }
    return typeof user.id === 'string' ? user.id : null
  } catch {
    return null
  }
}

interface RosterRow {
  user_id: string
  snapshot: { combatant: Parameters<typeof runFight>[1] }
}

/** A duel row as stored. `toResponse` maps it to the wire shape the client expects. */
interface DuelRow {
  id: string
  seed: number
  winner: 0 | 1
  challenger_id: string
  defender_id: string
  challenger_snapshot: unknown
  defender_snapshot: unknown
  created_at: string
}

const toResponse = (r: DuelRow) => ({
  duel_id: r.id,
  seed: r.seed,
  winner: r.winner,
  challenger_id: r.challenger_id,
  defender_id: r.defender_id,
  challenger: r.challenger_snapshot,
  defender: r.defender_snapshot,
  created_at: r.created_at,
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 204)

  const uid = await callerId(req)
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const url = new URL(req.url)

  // ── History ────────────────────────────────────────────────────────────────
  // Served here rather than by a direct PostgREST call so the client has one duel
  // endpoint. The filter is applied server-side from the verified token, so a caller
  // cannot ask for someone else's duels by omitting a query parameter.
  if (req.method === 'GET' && url.searchParams.get('history')) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 100)
    try {
      const rows = await db<DuelRow[]>(
        `duels?or=(challenger_id.eq.${uid},defender_id.eq.${uid})` +
        `&select=id,seed,winner,challenger_id,defender_id,challenger_snapshot,defender_snapshot,created_at` +
        `&order=created_at.desc&limit=${limit}`,
      )
      // Mapped to the SAME shape the POST returns, so the client has one `DuelResponse`
      // and never branches on which endpoint a duel arrived from.
      return json(rows.map(toResponse))
    } catch {
      return json({ error: 'server' }, 500)
    }
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let opponentId: string
  try {
    const body = await req.json() as { opponent_id?: unknown }
    if (typeof body.opponent_id !== 'string') return json({ error: 'opponent_id required' }, 400)
    opponentId = body.opponent_id
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  if (opponentId === uid) return json({ error: 'cannot duel yourself' }, 400)

  try {
    const [recent] = await db<{ recent_duel_count: number }[] | number[]>(
      `rpc/recent_duel_count`,
      { method: 'POST', body: JSON.stringify({ uid, window_minutes: RATE_WINDOW_MINUTES }) },
    ) as unknown as number[]
    if (typeof recent === 'number' && recent >= RATE_LIMIT) {
      return json({ error: 'rate_limited', retry_after_minutes: RATE_WINDOW_MINUTES }, 429)
    }
  } catch {
    // A failed rate-limit check must not block play. Logged by the platform; the table
    // constraints and RLS still hold.
  }

  // Both snapshots come from the DATABASE, never the request. This is what stops a client
  // inflating its own character for one fight.
  let rows: RosterRow[]
  try {
    rows = await db<RosterRow[]>(
      `roster_snapshots?user_id=in.(${uid},${opponentId})&select=user_id,snapshot`,
    )
  } catch {
    return json({ error: 'server' }, 500)
  }

  const mine = rows.find(r => r.user_id === uid)
  const theirs = rows.find(r => r.user_id === opponentId)
  if (!mine) return json({ error: 'publish your character first' }, 409)
  if (!theirs) return json({ error: 'opponent has no published character' }, 404)

  // Seed server-side so a client cannot search for a favourable one. `>>> 0` keeps it in
  // the uint32 range mulberry32 expects and the `bigint` column stores.
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0

  let winner: 0 | 1
  try {
    winner = runFight(seed, mine.snapshot.combatant, theirs.snapshot.combatant, FIGHT_OPTS).winner as 0 | 1
  } catch {
    // A stored snapshot that this combat build cannot run. Refusing is right: recording a
    // fabricated winner would put a result on a board that no replay can reproduce.
    return json({ error: 'snapshot incompatible with current combat build' }, 422)
  }

  try {
    const [row] = await db<DuelRow[]>('duels', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        challenger_id: uid,
        defender_id: opponentId,
        seed,
        winner,
        challenger_snapshot: mine.snapshot,
        defender_snapshot: theirs.snapshot,
      }),
    })
    return json(toResponse(row))
  } catch {
    return json({ error: 'server' }, 500)
  }
})
