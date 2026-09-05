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

/**
 * The plugin proxy is NOT awaitable, and this file is where that lesson was relearned:
 * the proxy answers every property read — including the `.then` probe a bare `await`
 * makes — with a bridge call, so `await plugin()` used to reject with
 * `"LocalNotifications.then()" is not implemented` before a single notification call ran
 * (on BOTH platforms; the iOS build shipped this way and the feature never fired).
 * Wrapping in a plain object breaks the thenable check, exactly as purchases.ts does:
 * `{ LocalNotifications }` has no `.then`, and destructuring at the call site hands back
 * the untouched proxy. Only ever await METHOD CALLS on the proxy, never the proxy.
 */
async function plugin(): Promise<{ LocalNotifications: typeof import('@capacitor/local-notifications')['LocalNotifications'] }> {
  const mod = await import('@capacitor/local-notifications')
  return { LocalNotifications: mod.LocalNotifications }
}

/**
 * Check (and optionally ask for) notification permission.
 *
 * The philosophy is unchanged — never at boot, a sheet in the first three seconds of a game
 * the player has not decided they like yet is the most reliable way to get a permanent
 * "no" — but the moment moved. It used to ride the visibilitychange-HIDDEN path inside
 * `scheduleWatchEnd`, which is exactly where Android forbids the ask: an app 10+ never
 * surfaces a permission dialog for a backgrounded activity, it silently answers DENIED,
 * and the once-only latch then kept the feature off for the life of the install (verified
 * on the emulator: `checkPermissions` → prompt at background time, `requestPermissions` →
 * denied, never asked again). So `request=false` only ever CHECKS, and `request=true`
 * (from `primeWatchPermission`, on return to the foreground) is the only path that shows
 * the dialog. `permissionAsked` latches only once a dialog has actually been shown — an
 * explicit "no" must not be re-litigated every session.
 */
async function ensurePermission(request: boolean): Promise<boolean> {
  if (!isNative || granted) return granted
  if (permissionAsked) return false
  try {
    const { LocalNotifications: LN } = await plugin()
    const check = await LN.checkPermissions()
    granted = check.display === 'granted'
    if (granted) return true
    if (!request || check.display !== 'prompt') return false
    if (document.visibilityState !== 'visible') return false
    // The WebView fires visibilitychange→visible during the resume transition — before the
    // activity is top-resumed — and a permission dialog launched inside that window is
    // killed by the background-activity-launch rules (logcat: "Background activity launch
    // blocked! ... callingUidHasVisibleActivity: false"), resolving the request as denied
    // with no sheet ever shown. Let the resume settle, re-check, only then ask.
    await new Promise((r) => setTimeout(r, 1200))
    if (document.visibilityState !== 'visible') return false
    permissionAsked = true
    const req = await LN.requestPermissions()
    granted = req.display === 'granted'
    if (granted) return true
    // A blocked launch resolves 'denied' without a human involved, and the system state
    // still reads 'prompt' — only a real answer flips it to 'denied'. Latch on the state,
    // not on the request result, so a blocked ask retries at the next foreground moment
    // instead of switching the feature off for the life of the install.
    const after = await LN.checkPermissions()
    permissionAsked = after.display === 'denied'
    granted = false
    return false
  } catch (err) {
    console.warn('[watch] notification permission failed', err)
    granted = false
    return false
  }
}

/**
 * The foreground ask. Called on return to VISIBLE: the first time, the "While you were
 * away" modal is on screen — the watch notification's value proposition made visible,
 * which is the honest moment to ask for it. Until permission exists, `scheduleWatchEnd`
 * checks without asking and simply waits for the next foreground moment to prime.
 */
export function primeWatchPermission(): void {
  if (!isNative) return
  void ensurePermission(true)
}

/**
 * How long a first-time player must stay before being asked.
 *
 * The measured post-launch distribution (37 App Store accounts, 2026-09-05): 70% play past
 * a minute, 41% past five, median session 3.0 minutes. Ninety seconds sits above the "first
 * three seconds" the philosophy above rules out and still lands inside the median session,
 * so it reaches most players without asking cold. Lower it to widen the net; raise it to ask
 * warmer. It is the one number in this file worth tuning against real data.
 */
const FIRST_SESSION_PRIME_DELAY_MS = 90_000
let dwellTimer: ReturnType<typeof setTimeout> | null = null

/**
 * The FIRST-session ask, and the reason a first-time player ever hears from this app again.
 *
 * `primeWatchPermission` only ever fires on visibilitychange→VISIBLE, and a first launch
 * never produces that event: the page is already visible when it loads, and the listener
 * catches transitions only. So on the original path the sequence was — install, play,
 * background, `scheduleWatchEnd` checks permission WITHOUT asking (it must; Android
 * auto-denies a backgrounded ask), finds none, schedules nothing, and the player is never
 * invited back. The notification could only ever reach someone who had already returned
 * under their own steam, which is precisely the cohort that does not need reminding.
 * Measured consequence: 0 of 26 App Store players who had the chance ever came back.
 *
 * Armed when the player enters the world rather than at boot, and fired on a dwell rather
 * than immediately, so the ask still lands after the game has had a chance to be worth
 * something — the same judgement `ensurePermission` documents, applied to a session that
 * has no "While you were away" modal to hang it on.
 */
export function primeWatchPermissionAfterDwell(): void {
  if (!isNative || granted || permissionAsked) return
  if (dwellTimer !== null) return
  dwellTimer = setTimeout(() => {
    dwellTimer = null
    // Re-checked rather than assumed: the player may have backgrounded during the dwell, and
    // ensurePermission would refuse anyway. Bailing here leaves the visibilitychange path to
    // pick them up on return, which is the warmer moment of the two.
    if (document.visibilityState !== 'visible') return
    void ensurePermission(true)
  }, FIRST_SESSION_PRIME_DELAY_MS)
}

/** Disarm the dwell — the run ended before the ask was earned. */
export function cancelWatchPermissionDwell(): void {
  if (dwellTimer !== null) {
    clearTimeout(dwellTimer)
    dwellTimer = null
  }
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
  // Check without asking: this runs at visibility-HIDDEN, where an Android ask is
  // auto-denied (see ensurePermission). Players who have not yet granted are picked up by
  // primeWatchPermission on their next return to the foreground.
  if (!(await ensurePermission(false))) return
  try {
    const { LocalNotifications: LN } = await plugin()
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
    const { LocalNotifications: LN } = await plugin()
    await LN.cancel({ notifications: [{ id: WATCH_NOTIFICATION_ID }] })
  } catch { /* nothing pending, or no permission — both are fine */ }
}
