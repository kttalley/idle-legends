// ── "Your watch has ended" ────────────────────────────────────────────────────
//
// The one piece of this feature that reaches the player when the app is not running.
//
// An idle game's whole proposition is that it keeps going without you, and the corollary
// nobody ships is that it eventually STOPS. A hero who capped out four hours ago is four
// hours of nothing, and the player has no way to know — so they come back on whatever
// cadence they were going to anyway and the cap silently taxes them. One local
// notification at the moment the watch runs out turns a dead ceiling into a reason to open
// the app, and it is the cheapest retention mechanic available here: no server, no push
// certificates, no account.
//
// Deliberately ONE notification, scheduled for the exact moment the watch ends. Not a
// drip, not a daily nag. The message is information the player asked for by playing an
// idle game, and the moment it stops being that it becomes the thing that gets the app
// deleted.
//
// Native-only, and guarded exactly like monetization/purchases.ts: on the web there is no
// plugin behind the bridge, every call is wrapped, and every failure resolves to "no
// notification" rather than to a broken game.

import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

/** Stable id, so re-scheduling replaces rather than stacks. */
const WATCH_NOTIFICATION_ID = 1001

let permissionAsked = false
let granted = false

async function plugin() {
  const mod = await import('@capacitor/local-notifications')
  return mod.LocalNotifications
}

/**
 * Ask once, lazily.
 *
 * NOT at boot: a permission sheet in the first three seconds of a game the player has not
 * decided they like yet is the most reliable way to get a permanent "no". The natural
 * moment is the first time the watch is actually going to matter, which is when the app
 * goes to the background with progress banked — so that is where `scheduleWatchEnd` calls
 * this from.
 */
async function ensurePermission(): Promise<boolean> {
  if (!isNative) return false
  if (permissionAsked) return granted
  permissionAsked = true
  try {
    const LN = await plugin()
    const check = await LN.checkPermissions()
    granted = check.display === 'granted'
    if (!granted && check.display === 'prompt') {
      const req = await LN.requestPermissions()
      granted = req.display === 'granted'
    }
  } catch (err) {
    console.warn('[watch] notification permission failed', err)
    granted = false
  }
  return granted
}

/**
 * Schedule the "watch has ended" notice for `secondsFromNow`.
 *
 * Called when the app goes to the background. Cancels any previous one first: the watch
 * length changes as the player buys extensions and earns ranks, so a stale notification
 * would fire at the old time and be wrong in the one way that matters (early).
 */
export async function scheduleWatchEnd(secondsFromNow: number): Promise<void> {
  if (!isNative || secondsFromNow <= 60) return
  if (!(await ensurePermission())) return
  try {
    const LN = await plugin()
    await LN.cancel({ notifications: [{ id: WATCH_NOTIFICATION_ID }] })
    await LN.schedule({
      notifications: [{
        id: WATCH_NOTIFICATION_ID,
        title: 'Your watch has ended',
        body: 'Your hero has gone as far as they will unsupervised. Check in to send them out again.',
        schedule: { at: new Date(Date.now() + secondsFromNow * 1000) },
      }],
    })
  } catch (err) {
    console.warn('[watch] could not schedule', err)
  }
}

/** Drop the pending notice — the player is here, so it can only ever fire wrongly now. */
export async function cancelWatchEnd(): Promise<void> {
  if (!isNative) return
  try {
    const LN = await plugin()
    await LN.cancel({ notifications: [{ id: WATCH_NOTIFICATION_ID }] })
  } catch { /* nothing pending, or no permission — both are fine */ }
}
