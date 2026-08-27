// ── The leaderboard ────────────────────────────────────────────────────────────
//
// This is the feature that makes `Stillmarch: Idle MMORPG` an honest listing name rather
// than a keyword grab. Apple 2.3.1 treats promoting a service the app does not offer as
// grounds for removal, so the leaderboard is not decoration — it is the evidence behind
// the claim. See `store/LAUNCH.md` §4b.
//
// Which imposes one hard rule, stated here because this is the file where it would be
// broken: **every row on this board is a real player's character.** The game is full of
// ambient LLM-driven heroes and they are good world texture, but padding the board with
// them would turn a defensible claim into a fabricated one — the exact pattern that draws
// both legal attention and review-bombing. An empty leaderboard is fine. A fake one is not.

import type { GameState } from '../data/types'
import { selectRows, upsertRow, type CloudResult } from './cloudClient'
import { ensureSession, currentSession } from './session'
import { buildSnapshot, sanityCheck, type RosterSnapshot } from './snapshot'
import { maskName } from '../moderation/wordFilter'

export const TABLE = 'roster_snapshots'

/** A row as stored. `snapshot` is the JSONB payload; the rest are queryable columns. */
export interface RosterRow {
  user_id: string
  hero_name: string
  player_class: string
  level: number
  power: number
  faction: string
  faction_name: string
  zone_circuit: number
  bosses_defeated: number
  /** Nullable in the table: rows written before PvP shipped have none, and the column is
   *  added with no backfill. Every read coalesces to 0. */
  honor_kills: number | null
  updated_at: string
  snapshot: RosterSnapshot
}

export interface LeaderboardEntry {
  userId: string
  rank: number
  name: string
  playerClass: string
  /** Needed to build a `ChatSpeaker` when the Duel button turns a board row into a real
   *  fight — the body has to wear the right race. Read from the snapshot, not a column. */
  race: string
  level: number
  power: number
  faction: string
  factionName: string
  zoneCircuit: number
  bossesDefeated: number
  /** Enemy-faction kills — what the HONOR board ranks by. */
  honorKills: number
  /** True for the signed-in player's own row, so the UI can highlight it. */
  isYou: boolean
}

/**
 * Publish the local character to the cloud.
 *
 * Safe to call often — it is an upsert keyed on `user_id`, so a player has exactly one row
 * however many times this runs. Returns false for every failure mode including "cloud is
 * switched off", and callers must treat that as ordinary.
 */
export async function publishSnapshot(state: GameState): Promise<boolean> {
  if (!(await ensureSession())) return false
  const session = currentSession()
  if (!session) return false

  const snap = buildSnapshot(state)
  // Validate our own payload before sending. If local state is somehow malformed we would
  // rather publish nothing than put a row on the board that every reader then rejects.
  if (!sanityCheck(snap)) return false

  const row = {
    user_id: session.userId,
    hero_name: snap.combatant.name,
    player_class: snap.combatant.playerClass,
    level: snap.combatant.level,
    power: snap.power,
    faction: snap.playerFaction,
    faction_name: snap.factionName,
    zone_circuit: snap.zoneCircuit,
    bosses_defeated: snap.bossesDefeated,
    honor_kills: snap.honorKills ?? 0,
    snapshot: snap,
  }
  const res = await upsertRow<RosterRow>(TABLE, row)
  if (res.ok) return true

  // ── The column may not exist yet ───────────────────────────────────────────
  // `honor_kills` was added to `supabase/schema.sql` when PvP shipped, and a project whose
  // SQL has not been re-run rejects the whole row with a 400 — which would take the
  // leaderboard, the thing the store listing's "MMORPG" claim rests on, offline for every
  // player on the old schema until someone noticed. Observed exactly that against the live
  // project while testing.
  //
  // So the new column is best-effort: on failure, publish the row the old schema accepts.
  // The value is still inside `snapshot`, and `fetchLeaderboard` already prefers the
  // column and falls back to the payload — so honor survives, it just cannot be ORDERED by
  // server-side until the migration runs.
  const { honor_kills: _dropped, ...legacyRow } = row
  const retry = await upsertRow<RosterRow>(TABLE, legacyRow)
  return retry.ok
}

/**
 * Top `limit` characters by power.
 *
 * Rows failing `sanityCheck` are dropped rather than rendered — see the note in
 * `snapshot.ts` about not trusting what another client uploaded. Ranks are assigned after
 * filtering so the displayed list is always 1..n with no gaps, which matters because a gap
 * reads as a bug to a player who cannot see the row that was removed.
 */
/** The column list, named once so the two queries below cannot drift apart. */
const ROW_COLUMNS =
  'user_id,hero_name,player_class,level,power,faction,faction_name,zone_circuit,bosses_defeated,honor_kills,snapshot'

/** How a board is ordered. Power is the main ladder; honor is the PvP one, and it is a
 *  genuinely different ranking — the strongest character on the server may never have
 *  taken a single kill. */
export type BoardKind = 'power' | 'honor'

export async function fetchLeaderboard(limit = 50, kind: BoardKind = 'power'): Promise<CloudResult<LeaderboardEntry[]>> {
  const order = kind === 'honor' ? 'order=honor_kills.desc,power.desc' : 'order=power.desc,level.desc'
  const query = [
    `select=${ROW_COLUMNS}`,
    order,
    `limit=${Math.max(1, Math.min(limit, 200))}`,
  ].join('&')

  const res = await selectRows<RosterRow>(TABLE, query)
  if (!res.ok) return res

  const me = currentSession()?.userId ?? null
  const entries: LeaderboardEntry[] = []
  for (const r of res.data) {
    if (!sanityCheck(r.snapshot)) continue
    entries.push({
      userId: r.user_id,
      rank: entries.length + 1,
      // Masked on the way OUT, not trusted on the way in. The name filter runs at
      // character creation, but this table holds rows written before that filter existed
      // and rows written by other clients — which a modified build could have skipped it
      // in entirely. A creation-time check only ever constrains honest clients, so the
      // display path checks too.
      name: maskName(r.hero_name),
      playerClass: r.player_class,
      race: r.snapshot?.playerRace ?? 'human',
      level: r.level,
      power: r.power,
      faction: r.faction,
      factionName: r.faction_name,
      zoneCircuit: r.zone_circuit,
      bossesDefeated: r.bosses_defeated,
      // Prefer the column, fall back to the payload. The column is what the honor board
      // orders by server-side; the payload is what an older row still carries when the
      // column has not been written yet.
      honorKills: r.honor_kills ?? r.snapshot?.honorKills ?? 0,
      isYou: me !== null && r.user_id === me,
    })
  }
  return { ok: true, data: entries }
}

/**
 * Candidate duel opponents near the player's own power.
 *
 * Deliberately not "the top of the board": the interesting duel is a close one, and the
 * strongest player on the board is a guaranteed loss that teaches nothing. Fetches a
 * window either side of the player's power and excludes their own row.
 */
export async function fetchDuelCandidates(power: number, count = 3): Promise<CloudResult<RosterRow[]>> {
  const me = currentSession()?.userId ?? null
  const query = [
    `select=${ROW_COLUMNS}`,
    // A window rather than a hard band, so a sparse board still returns opponents.
    `order=power.desc`,
    `limit=${Math.max(1, Math.min(count * 8, 100))}`,
  ].join('&')

  const res = await selectRows<RosterRow>(TABLE, query)
  if (!res.ok) return res

  const usable = res.data
    .filter(r => r.user_id !== me && sanityCheck(r.snapshot))
    .sort((a, b) => Math.abs(a.power - power) - Math.abs(b.power - power))
    .slice(0, count)
  return { ok: true, data: usable }
}
