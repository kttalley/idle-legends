// ── Cloud saves: the backstop under localStorage ──────────────────────────────
//
// `storagePersistence.ts` states the problem and is honest that it cannot fully solve it:
// the IndexedDB mirror does not survive a whole-origin eviction, and WebKit evicts
// script-writable storage after seven days without user interaction. For an idle game
// "I did not open it for a week" is the core play pattern rather than an edge case, so a
// character can evaporate and nothing local can bring it back.
//
// This module is what brings it back. Three properties define the design, and each of them
// is a decision that could reasonably have gone the other way:
//
//   1. **The local save stays authoritative.** The game plays from localStorage exactly as
//      before; this is a copy pushed up and pulled back. Making the server the source of
//      truth would mean the server simulating progression, which is a different and much
//      larger game — the same call `net/snapshot` makes about the leaderboard.
//
//   2. **Nothing is ever silently overwritten locally.** A cloud save is restored without
//      asking ONLY when there is no local slot to lose (the eviction case, where restoring
//      is pure gain). When both exist and the cloud is further along, the player is asked.
//      Silently replacing a character is the one unrecoverable failure in the whole system,
//      and it is worse than the bug this feature exists to fix.
//
//   3. **Progress is compared by TIME PLAYED, not by clock time.** A device that merely
//      opened the game later has a newer timestamp and less progress. `totalPlayTime` is
//      the only comparison that answers "which of these is further along" honestly.
//
// Every failure is silent and survivable, like the rest of the net layer: no cloud, no
// session, offline, or a rejected write all mean the game behaves exactly as it did before
// this file existed.

import type { GameState } from '../data/types'
import type { SaveSlot, SlotSummary } from '../store/saveSlots'
import { slotStorage } from '../store/saveSlots'
import { cloudFetch, selectRows, upsertRow, type CloudResult } from './cloudClient'
import { cloudEnabled, restUrl } from './cloudConfig'
import { currentSession, ensureSession } from './session'

export const TABLE = 'character_saves'

/** A slot as stored. `state` is the stripped blob; the rest are queryable columns. */
export interface CloudSaveRow {
  user_id: string
  slot_id: string
  hero_name: string
  level: number
  play_time: number
  created_at: number
  saved_at: string
  state: GameState
  summary: SlotSummary
}

/**
 * Strip everything derived or cosmetic before upload.
 *
 * `toSaveBlob` already drops the big one — `zoneMaps`, 2.63 MB of data regenerated from
 * `worldSeed` on load. What is left that does not belong in a backup is presentation and
 * session state: `rehydrateState` clears the session fields on the way back in regardless,
 * and the combat log is roughly a third of the remaining bytes for something nobody would
 * miss after a restore. A backup should carry the character, not the scrollback.
 *
 * Deliberately a subtraction from the real blob rather than a hand-listed set of fields to
 * keep: a whitelist would silently drop every field added after this was written, and the
 * failure would be a restored character quietly missing its newest progression system.
 */
export function stripForCloud(state: GameState): GameState {
  const out = { ...state }
  out.combatLog = []
  out.floatingNumbers = []
  out.mobs = []
  out.allies = []
  out.currentMob = null
  out.activeDoTs = []
  out.zoneMaps = {}
  // Transient one-shot cards. Restoring a week-old "you levelled up!" banner would be a
  // small lie about what just happened.
  out.lastOffline = null
  out.lastCraft = null
  out.lastLevelUp = null
  out.gatherSession = null
  return out
}

/**
 * Push one slot to the cloud. Safe to call often — it is an upsert on (user_id, slot_id).
 *
 * Returns false for every failure including "cloud is switched off", and callers must treat
 * that as ordinary rather than as something to report.
 */
export async function uploadSlot(slot: SaveSlot): Promise<boolean> {
  if (!cloudEnabled()) return false
  if (!(await ensureSession())) return false
  const session = currentSession()
  if (!session) return false

  const res = await upsertRow<CloudSaveRow>(TABLE, {
    user_id: session.userId,
    slot_id: slot.id,
    hero_name: slot.summary.playerName ?? '',
    level: Math.max(1, Math.min(200, Math.round(slot.summary.level ?? 1))),
    play_time: Math.max(0, Math.round(slot.state.totalPlayTime ?? 0)),
    created_at: slot.createdAt ?? 0,
    // The column default only fires on INSERT, so without this the upsert left `saved_at`
    // at the first upload forever, and a restore showed "last played" as the day the
    // character was made.
    saved_at: new Date().toISOString(),
    state: stripForCloud(slot.state),
    summary: slot.summary,
  })
  return res.ok
}

/** Every slot this account has in the cloud. */
export async function fetchCloudSlots(): Promise<CloudResult<CloudSaveRow[]>> {
  if (!(await ensureSession())) return { ok: false, reason: 'unauthorized', status: 401 }
  const query = [
    'select=user_id,slot_id,hero_name,level,play_time,created_at,saved_at,state,summary',
    'order=saved_at.desc',
    'limit=20',
  ].join('&')
  return selectRows<CloudSaveRow>(TABLE, query)
}

/** Turn a stored row back into the shape the local slot storage writes. */
export function rowToSlot(row: CloudSaveRow): SaveSlot {
  return {
    id: row.slot_id,
    createdAt: row.created_at || Date.parse(row.saved_at) || Date.now(),
    lastPlayedAt: Date.parse(row.saved_at) || Date.now(),
    summary: row.summary,
    state: row.state,
  }
}

/**
 * Delete one slot from the cloud.
 *
 * Not an optimisation — a correctness requirement. `reconcile` restores any cloud slot with
 * no local counterpart, which is exactly what a deleted character looks like. Without this,
 * deleting a hero would put it straight back on the select screen the moment the notice ran,
 * and the player would have no way to get rid of it at all.
 *
 * The row is scoped by `user_id` as well as `slot_id` even though RLS already guarantees it:
 * a DELETE whose filter fails open is the one request in this file that could destroy
 * somebody else's data, so it does not rely on a single line of defence.
 */
export async function deleteCloudSlot(slotId: string): Promise<boolean> {
  if (!cloudEnabled()) return false
  if (!(await ensureSession())) return false
  const session = currentSession()
  if (!session) return false
  // Also drop it from the pending upload, or a queued save would immediately recreate the
  // row this call just removed.
  if (pending?.id === slotId) pending = null
  const url = `${restUrl(TABLE)}?user_id=eq.${encodeURIComponent(session.userId)}`
    + `&slot_id=eq.${encodeURIComponent(slotId)}`
  const res = await cloudFetch<unknown>(url, { method: 'DELETE' })
  return res.ok
}

// ── The write cadence ─────────────────────────────────────────────────────────
//
// `saveGame` runs on the autosave cadence and on several explicit actions, which is far
// more often than a backup needs. Uploading on every one of those would spend a request per
// few seconds of play to protect against a failure measured in weeks.
//
// So: at most one upload per MIN_UPLOAD_INTERVAL, plus a flush when the page is going away
// — which is the moment that actually matters, because it is the last chance to capture a
// session before the tab (or the app) is gone.

const MIN_UPLOAD_INTERVAL_MS = 60_000
let lastUploadAt = 0
let pending: SaveSlot | null = null
let inFlight = false
let deferred: ReturnType<typeof setTimeout> | null = null

/**
 * Queue a slot for upload, honouring the interval.
 *
 * Holds the LATEST slot rather than a queue of them: they are snapshots of the same
 * character, so an older one has no value once a newer exists.
 */
export function queueCloudSave(slot: SaveSlot): void {
  if (!cloudEnabled()) return
  pending = slot
  const now = Date.now()
  if (now - lastUploadAt < MIN_UPLOAD_INTERVAL_MS) {
    // Arm a timer for the remainder of the window rather than waiting for the next save to
    // push it through. Without this, a deferred upload depends entirely on another
    // `saveGame` arriving later — and the moment that stops happening is precisely the
    // moment worth capturing: the player put the game down.
    if (deferred === null) {
      deferred = setTimeout(() => { deferred = null; void flushCloudSave() },
        MIN_UPLOAD_INTERVAL_MS - (now - lastUploadAt))
    }
    return
  }
  void flushCloudSave()
}

/** Upload whatever is pending, now. Called on the interval and when the page hides. */
export async function flushCloudSave(): Promise<boolean> {
  if (deferred !== null) { clearTimeout(deferred); deferred = null }
  if (!pending || inFlight) return false
  const slot = pending
  pending = null
  inFlight = true
  lastUploadAt = Date.now()
  try {
    return await uploadSlot(slot)
  } catch {
    return false
  } finally {
    inFlight = false
  }
}

/**
 * Flush on the way out.
 *
 * `visibilitychange` rather than `beforeunload`: mobile browsers routinely kill a
 * backgrounded tab without ever firing unload, and on iOS `beforeunload` is unreliable
 * enough to be worthless. Hiding is the last event you are guaranteed to get.
 */
export function installCloudSaveFlush(): () => void {
  const onHide = () => { if (document.visibilityState === 'hidden') void flushCloudSave() }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
  }
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export type SlotVerdict =
  /** No local slot with this id — nothing to lose, so it is restored without asking. */
  | { kind: 'restore'; row: CloudSaveRow }
  /** Both exist and the cloud is further along. Only the player can decide this one. */
  | { kind: 'conflict'; row: CloudSaveRow; localPlayTime: number; localName: string }

/**
 * Compare the cloud's slots against the local ones and say what should happen to each.
 *
 * Pure, and takes the local list as an argument, so the rule can be reasoned about (and
 * tested) without a browser, a network, or a store.
 *
 * Anything where the local save is level with or ahead of the cloud is absent from the
 * result: there is nothing to do, and the next upload will bring the cloud into line.
 */
export function reconcile(
  cloud: CloudSaveRow[],
  local: { id: string; playTime: number; name: string }[],
): SlotVerdict[] {
  const byId = new Map(local.map(l => [l.id, l]))
  const out: SlotVerdict[] = []
  for (const row of cloud) {
    const mine = byId.get(row.slot_id)
    if (!mine) {
      out.push({ kind: 'restore', row })
      continue
    }
    // A minute of slack. Two devices that genuinely agree can still differ by a few
    // seconds of tick accounting, and prompting over that would train the player to
    // dismiss the one dialog that matters.
    if (row.play_time > mine.playTime + 60) {
      out.push({ kind: 'conflict', row, localPlayTime: mine.playTime, localName: mine.name })
    }
  }
  return out
}

/**
 * Pull down any cloud character this device does not have. Call once, at boot.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * `CloudSaveNotice` already does this — and it is rendered ONLY as a banner on the
 * character-SELECT screen. `App` shows character CREATE instead whenever there are zero
 * local slots, which is precisely the state a player is in after reinstalling. So the one
 * component that restores cloud saves was never mounted in the one situation it exists
 * for: a returning player was dropped straight onto "choose a class", with their
 * characters sitting safely on the server, unreached.
 *
 * That was invisible while the session did not survive an uninstall either — the identity
 * was gone, so there was nothing to fetch and the missing restore looked like the same
 * bug. Fixing the Keychain half exposed this one.
 *
 * Restores ONLY slots with no local counterpart. Conflicts — a cloud save further along
 * than a local one — are deliberately left to the notice on the select screen, where the
 * player can choose; silently overwriting a local character at boot is the one outcome
 * worse than the loss this prevents.
 *
 * Never throws. Returns how many were restored.
 */
export async function restoreMissingCloudSlots(): Promise<number> {
  if (!cloudEnabled()) return 0
  try {
    const res = await fetchCloudSlots()
    if (!res.ok || res.data.length === 0) return 0
    const local = slotStorage.list().map(meta => {
      const full = slotStorage.load(meta.id)
      return {
        id: meta.id,
        playTime: full?.state?.totalPlayTime ?? 0,
        name: meta.summary.playerName ?? '',
      }
    })
    let restored = 0
    for (const v of reconcile(res.data, local)) {
      if (v.kind !== 'restore') continue
      // The same writer the game uses, so a restored character takes the identical path a
      // local one does — including `rehydrateState` on load, which regenerates the world
      // maps the cloud blob deliberately does not carry.
      if (slotStorage.save(rowToSlot(v.row))) restored++
    }
    if (restored > 0) console.info(`[cloud] restored ${restored} character(s) from the cloud`)
    return restored
  } catch (e) {
    console.warn('[cloud] restore at boot failed', e)
    return 0
  }
}
