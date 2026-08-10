// ── Async duels against real players ───────────────────────────────────────────
//
// The architecture here is the payoff from a decision made long before Track N: `runFight`
// is pure, seeded TypeScript with the seed threaded through it (`engine/rng.mulberry32`),
// and `src/sim/fightSim.ts` proves byte-identical replay across runs. Three consequences:
//
//   1. **The server resolves the duel.** `supabase/functions/duel` imports the *same*
//      `runFight` and runs it in Deno. There is no second combat implementation to keep in
//      sync, and no way for a modified client to report a win it did not earn.
//   2. **The client replays it for free.** The server returns the seed and both snapshots;
//      the client calls `runFight(seed, a, b)` locally and gets the identical event stream
//      to animate. We never ship a fight log over the wire — a 250-event fight is far
//      larger than the seed that generates it.
//   3. **Verification is one equality check.** If a local replay disagrees with the
//      server's recorded winner, the two are running different combat code — a version
//      skew — and the UI says so instead of showing a fight that contradicts the result.
//
// Point 3 is the one that will actually fire in production: a player on an old build duels
// someone on a new one after a combat change. Detecting it is much better than silently
// rendering a fight whose outcome does not match the banner above it.

import type { GameState } from '../data/types'
import { runFight, type FightResult } from '../engine/fight'
import { cloudFetch, type CloudResult } from './cloudClient'
import { functionsUrl } from './cloudConfig'
import { ensureSession } from './session'
import { buildSnapshot, sanityCheck, type RosterSnapshot } from './snapshot'

/**
 * What the Edge Function returns. Snapshots come back so the client can replay locally.
 *
 * **One shape from both endpoints** — the POST that resolves a duel and the GET that lists
 * history. The function maps its raw columns (`id`, `challenger_snapshot`, …) into this
 * before responding, so `replay()` and the record view never branch on where a duel came
 * from.
 */
export interface DuelResponse {
  duel_id: string
  seed: number
  /** 0 = challenger won, 1 = defender won. Authoritative. */
  winner: 0 | 1
  challenger_id: string
  defender_id: string
  challenger: RosterSnapshot
  defender: RosterSnapshot
  created_at: string
}

export interface ResolvedDuel {
  duelId: string
  seed: number
  /** The server's verdict — the one that counts. */
  playerWon: boolean
  opponentName: string
  /** Local replay, for rendering the fight. Null when the replay could not be trusted. */
  result: FightResult | null
  /**
   * True when the local replay reproduced the server's winner. False means version skew
   * between this client's combat code and the server's — surface it, do not hide it.
   */
  replayVerified: boolean
}

/**
 * Fight-loop parameters.
 *
 * These MUST match the Edge Function's values exactly. Identical inputs and identical
 * seeds still diverge if one side runs a 0.25s step and the other 0.5s, and that failure
 * looks like a determinism bug rather than a configuration mismatch, so it is worth the
 * duplicated constant and this comment.
 */
export const DUEL_FIGHT_OPTS = { stepSeconds: 0.25, maxSeconds: 60, maxEvents: 256 } as const

/**
 * Challenge a specific player.
 *
 * The client sends only the opponent's id. Its own snapshot is read server-side from the
 * table, so a client cannot inflate its character *for a single fight* — the only way to
 * cheat the input is to publish a fake snapshot, which `sanityCheck` bounds and which is
 * at least visible to everyone on the leaderboard.
 */
export async function challenge(state: GameState, opponentUserId: string): Promise<CloudResult<ResolvedDuel>> {
  if (!(await ensureSession())) return { ok: false, reason: 'unauthorized' }

  const res = await cloudFetch<DuelResponse>(functionsUrl('duel'), {
    method: 'POST',
    body: { opponent_id: opponentUserId },
  })
  if (!res.ok) return res

  return { ok: true, data: replay(res.data, state) }
}

/**
 * Reproduce a server-resolved duel locally so it can be rendered.
 *
 * `state` is used only to decide which side the player was on; the fight itself runs from
 * the snapshots the server used, never from live local state. Using live state would be
 * subtly wrong — the player may have levelled since the duel was resolved, and the replay
 * must reproduce the fight that happened, not the one that would happen now.
 */
export function replay(d: DuelResponse, state: GameState): ResolvedDuel {
  const mine = buildSnapshot(state)
  // Identify our side by hero name rather than by user id: the response carries snapshots,
  // and this keeps `replay` usable for a duel *history* row where we were the defender.
  const playerIsChallenger = d.challenger.combatant.name === mine.combatant.name
  const opponent = playerIsChallenger ? d.defender : d.challenger
  const playerWon = playerIsChallenger ? d.winner === 0 : d.winner === 1

  let result: FightResult | null = null
  let replayVerified = false
  if (sanityCheck(d.challenger) && sanityCheck(d.defender)) {
    try {
      result = runFight(d.seed, d.challenger.combatant, d.defender.combatant, DUEL_FIGHT_OPTS)
      replayVerified = result.winner === d.winner
      if (!replayVerified) result = null
    } catch {
      // A snapshot that passes the sanity filter can still hit an unexpected path in a
      // combat build it was never produced for. The server's verdict still stands; we
      // simply cannot animate it.
      result = null
      replayVerified = false
    }
  }

  return {
    duelId: d.duel_id,
    seed: d.seed,
    playerWon,
    opponentName: opponent.combatant.name,
    result,
    replayVerified,
  }
}

/** Past duels involving the signed-in player, newest first. */
export async function fetchDuelHistory(limit = 20): Promise<CloudResult<DuelResponse[]>> {
  if (!(await ensureSession())) return { ok: false, reason: 'unauthorized' }
  // RLS restricts this to rows where the caller is challenger or defender, so no filter is
  // needed here — and more importantly, none can be omitted by a caller.
  return cloudFetch<DuelResponse[]>(
    `${functionsUrl('duel')}?history=1&limit=${Math.max(1, Math.min(limit, 100))}`,
  )
}
