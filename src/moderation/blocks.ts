// ── Blocking a player ─────────────────────────────────────────────────────────
//
// App Review 1.2: "a mechanism for users to block abusive users (blocking should also
// notify the developer of the inappropriate content and should remove it from the user's
// feed instantly)."
//
// Three obligations in one sentence, and the third is the one that is easy to fail:
//
//   • **Instant.** The block is applied to the in-memory set FIRST and the panels repaint
//     from it synchronously. The network write follows. A block that waits for a round
//     trip is not instant, and on a train it never lands at all.
//   • **Durable.** The write goes to `user_blocks` (Supabase), not localStorage, so the
//     block survives a reinstall and a device change. Local state is a cache of it.
//   • **Notifies the developer.** `blockPlayer` files a report alongside the block, which
//     is precisely what Apple's parenthetical asks for. See `reports.ts`.
//
// ── What "removed from the feed" means here ─────────────────────────────────
// The only place another player's content appears is their character NAME, on the ladder
// and on ghosts standing in the world. Both read `roster_snapshots`, so both filter through
// `isBlocked` and a blocked player vanishes from the board and from the world at once.

import { cloudFetch, selectRows } from '../net/cloudClient'
import { cloudEnabled, restUrl } from '../net/cloudConfig'
import { currentSession, ensureSession } from '../net/session'
import { dropGhost } from '../engine/ghosts'
import { fileReport } from './reports'

const TABLE = 'user_blocks'

/** The authoritative in-memory set. Every display path reads this, synchronously. */
let blocked = new Set<string>()

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Subscribe to block-list changes.
 *
 * Shaped for `useSyncExternalStore`, which is how the ladder and the world registry consume
 * it: a block has to repaint every list that could be showing the blocked player, and
 * threading a callback through each of them by hand is how one gets missed.
 */
export function subscribeBlocks(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** A stable snapshot, required by `useSyncExternalStore` — it compares by reference, so
 *  handing out a fresh Set each call would loop forever. Replaced only on change. */
export function getBlocks(): ReadonlySet<string> { return blocked }

function emit(): void {
  // A NEW set each mutation, so `useSyncExternalStore`'s reference comparison sees the
  // change. Mutating in place would leave every subscriber convinced nothing happened.
  blocked = new Set(blocked)
  for (const l of listeners) l()
}

/** True when this user's content must not be shown. Hot path — called per ladder row and
 *  per ghost, so it stays a Set lookup and never touches the network. */
export function isBlocked(userId: string | null | undefined): boolean {
  return !!userId && blocked.has(userId)
}

/**
 * Load the block list from the cloud. Call once at sign-in.
 *
 * Failure is silent and non-fatal, in the house style of everything in `net/` — but note
 * the asymmetry it creates and why it is the right way round: a failed LOAD means a
 * previously blocked player is briefly visible again, while a failed WRITE would mean a
 * block that appears to work and silently does not. The first is recoverable by opening
 * the app again; the second is a broken promise to someone who asked not to see somebody.
 */
export async function loadBlocks(): Promise<void> {
  if (!cloudEnabled()) return
  if (!(await ensureSession())) return
  const me = currentSession()?.userId
  if (!me) return
  const res = await selectRows<{ blocked_id: string }>(
    TABLE, `blocker_id=eq.${me}&select=blocked_id`)
  if (!res.ok) return
  blocked = new Set(res.data.map(r => r.blocked_id))
  emit()
}

/**
 * Block a player, and report them.
 *
 * Returns immediately after the local set is updated; the network writes are fire-and-
 * forget by design, because the UI must not sit on a spinner to honour "instantly".
 *
 * `reason` rides along to the report. A block IS a report of abusive behaviour — that is
 * Apple's reading, and it is also the honest one: nobody blocks a stranger over nothing.
 */
export function blockPlayer(
  userId: string,
  name: string,
  reason: 'hate_or_slur' | 'sexual' | 'harassment' | 'impersonation' | 'other' = 'other',
): void {
  const me = currentSession()?.userId
  if (!userId || userId === me) return

  // Local first, always. This is the half that has to be instant, and it is the half that
  // works offline.
  blocked.add(userId)
  emit()

  // The ladder repaints from `emit()`, but the world does not read this set — the ghost
  // roster was fetched before the block existed, so a body wearing this person's name may
  // be standing in the zone right now. Pull them from the roster; the renderer's ghost pass
  // notices on the next frame and gives that body its own identity back.
  dropGhost(userId)

  // Notify the developer, as the guideline requires.
  void fileReport({ userId, name, reason, surface: 'block' })

  if (!cloudEnabled() || !me) return
  void cloudFetch(restUrl(TABLE), {
    method: 'POST',
    body: { blocker_id: me, blocked_id: userId, blocked_name: name.slice(0, 24) },
    // A second block of the same player is a no-op, not an error — the player may well tap
    // it again from a different screen, and a duplicate-key failure would surface as
    // "blocking failed" for an action that already succeeded.
    prefer: 'resolution=ignore-duplicates',
  })
}

/** Unblock. Not required by the guideline, but a block with no way out is a trap. */
export function unblockPlayer(userId: string): void {
  blocked.delete(userId)
  emit()
  const me = currentSession()?.userId
  if (!cloudEnabled() || !me) return
  void cloudFetch(
    `${restUrl(TABLE)}?blocker_id=eq.${me}&blocked_id=eq.${userId}`, { method: 'DELETE' })
}

/** Drop everything on sign-out, so the next account does not inherit this one's list. */
export function clearBlocks(): void {
  blocked = new Set()
  emit()
}
