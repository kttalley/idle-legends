// ── Asking for the rating ─────────────────────────────────────────────────────
//
// The App Store ranks on rating volume as much as on rating average, and a listing with
// zero ratings does not rank at all — measured against the iTunes Search API on
// 2026-09-02, the #1 result for our primary term ("idle mmorpg") sat at 102 ratings and
// the #2 at 16. That is the whole competitive bar, and it is reachable. Nothing else in
// this codebase moves discovery as cheaply as this file does.
//
// The counter-pressure is that a badly-timed rating prompt is one of the few things that
// can make a player rate you ONE star for asking. So every rule below exists to make the
// ask rare, late, and earned:
//
//   • Never at boot, never on a timer, never on a screen the player is trying to leave.
//     The only call site is the player dismissing the "while you were away" report — the
//     single moment this genre is built around, and the one time we know the app has just
//     handed them something good.
//   • Never on an absence that paid nothing. A three-minute gap that returns 40 gold is
//     not a delight beat; asking there converts the prompt into an interruption.
//   • Never to a player who has not stayed. A level floor is a cheap proxy for "has come
//     back at least once" — nobody reaches it inside a first session.
//   • At most three times, ever, spaced by months.
//
// Both platforms silently throttle this on their own (StoreKit allows roughly three
// prompts per user per 365 days; Play has its own undisclosed quota) and NEITHER tells you
// whether a sheet was actually shown. So `requestReview()` resolving means "the OS
// accepted the request", never "the player saw it" and certainly never "the player rated
// it". Nothing may ever be gated on, rewarded for, or branched on the outcome — that is
// also a store-policy line, not just good manners.
//
// Guarded exactly like watchNotifications.ts and monetization/purchases.ts: native-only,
// every call wrapped, every failure resolving to "no prompt" rather than to a broken game.

import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

/** Dotted style, matching the newest key in the codebase (`stillmarch.terms.accepted`). */
const LEDGER_KEY = 'stillmarch.review.v1'

/**
 * Hero level the player must have reached before they are asked anything.
 *
 * Chosen against the audit's own pacing note in PLAN.md: levels 5→10 in zone one is the
 * flat stretch a first session lands in. A hero at 8 has therefore almost certainly been
 * away and come back — which is the behaviour we want to celebrate, and the behaviour a
 * one-session bouncer never exhibits.
 */
const MIN_LEVEL = 8

/**
 * What makes an absence worth interrupting. Either a level (unambiguous progress the
 * player can see on the report) or a solid gold haul (the report's headline number when
 * no level landed). Both read as "that was worth closing the app for".
 */
const MIN_LEVELS_GAINED = 1
const MIN_GOLD = 500

/** The OS caps us near this anyway; asking a fourth time only risks annoyance. */
const MAX_ASKS = 3

/** Months between asks. A player who ignored the sheet twice is not warming up. */
const DAYS_BETWEEN_ASKS = 60
const MS_BETWEEN_ASKS = DAYS_BETWEEN_ASKS * 24 * 60 * 60 * 1000

/**
 * Let the toast finish leaving before the OS sheet arrives. Two surfaces animating over
 * each other reads as a glitch, and on iOS the StoreKit sheet is presented by the system
 * over whatever is on screen — including a React tree mid-unmount.
 */
const PRESENT_DELAY_MS = 900

interface ReviewLedger {
  /** How many times we have asked. */
  asks: number
  /** Epoch ms of the most recent ask. */
  lastAskAt: number
}

const EMPTY_LEDGER: ReviewLedger = { asks: 0, lastAskAt: 0 }

/**
 * The ledger is deliberately NOT part of the save slot.
 *
 * It is a property of the install and the person, not of a character — deleting a hero and
 * rolling a new one must not re-open the right to nag. It also has to survive a save
 * becoming corrupt, which is a path this codebase already guards elsewhere.
 *
 * It lives in localStorage, which WKWebView can evict after ~7 days of inactivity (the
 * hazard Track S documents for saves). That is accepted here rather than mirrored to
 * IndexedDB: the worst case of losing this ledger is that a long-absent player is asked
 * once more than intended, and the platform throttle still stands behind us. Mirroring it
 * would buy nothing worth the code.
 */
function readLedger(): ReviewLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return EMPTY_LEDGER
    const parsed = JSON.parse(raw) as Partial<ReviewLedger>
    return {
      asks: typeof parsed.asks === 'number' && parsed.asks >= 0 ? parsed.asks : 0,
      lastAskAt: typeof parsed.lastAskAt === 'number' && parsed.lastAskAt >= 0 ? parsed.lastAskAt : 0,
    }
  } catch {
    // Unparseable or unreadable storage means we do not know how often we have asked.
    // Answer "recently, many times" — the safe direction is always fewer prompts.
    return { asks: MAX_ASKS, lastAskAt: Date.now() }
  }
}

function writeLedger(ledger: ReviewLedger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    // A full disk must not break the dismissal the player just tapped. The consequence of
    // a failed write is one extra ask on a later absence; the platform throttle covers it.
  }
}

/**
 * The plugin proxy is NOT awaitable — see the long note in watchNotifications.ts. `await
 * plugin()` makes the runtime probe the proxy for `.then`, the proxy bridges that to a
 * native method named `then`, and the call rejects before it starts. Wrapping in a plain
 * object breaks the thenable check; only ever await METHOD CALLS on the proxy.
 */
async function plugin(): Promise<{ InAppReview: typeof import('@capacitor-community/in-app-review')['InAppReview'] }> {
  const mod = await import('@capacitor-community/in-app-review')
  return { InAppReview: mod.InAppReview }
}

/** What the caller knows about the absence being celebrated. */
export interface ReviewMoment {
  /** Current hero level. */
  level: number
  /** Levels the absence produced. */
  levelsGained: number
  /** Gold the absence produced. */
  gold: number
}

/**
 * Was this absence good enough to be worth an interruption?
 *
 * Exported for the sim harnesses and for anyone reading the call site who wants the rule
 * without the side effects. Pure — no storage, no bridge.
 */
export function isWorthAsking(moment: ReviewMoment): boolean {
  if (moment.level < MIN_LEVEL) return false
  return moment.levelsGained >= MIN_LEVELS_GAINED || moment.gold >= MIN_GOLD
}

/**
 * Ask for a rating, if every gate above agrees.
 *
 * Fire-and-forget by design: the caller is a dismissal handler, and the player's tap must
 * land instantly whatever happens here. Returns a promise only so tests can await it;
 * nothing in the app does, and nothing should.
 *
 * Resolves `true` when the request reached the OS — NOT when a sheet was shown, and never
 * when a review was left. See the header.
 */
export async function maybeRequestReview(moment: ReviewMoment): Promise<boolean> {
  if (!isNative) return false
  if (!isWorthAsking(moment)) return false

  const ledger = readLedger()
  if (ledger.asks >= MAX_ASKS) return false
  if (ledger.lastAskAt > 0 && Date.now() - ledger.lastAskAt < MS_BETWEEN_ASKS) return false

  // A clock that has gone backwards (timezone change, manual set) would otherwise make
  // `Date.now() - lastAskAt` negative forever and permanently suppress the prompt. Treat a
  // future timestamp as "now" and carry on.
  if (ledger.lastAskAt > Date.now()) ledger.lastAskAt = 0

  await new Promise(resolve => setTimeout(resolve, PRESENT_DELAY_MS))

  // The player may have navigated away, backgrounded the app, or opened a modal during the
  // delay. Presenting a system sheet into a backgrounded WebView is the same class of
  // mistake as asking for notification permission there — Android blocks the launch, and
  // the ask is consumed for nothing.
  if (document.visibilityState !== 'visible') return false

  try {
    const { InAppReview: IAR } = await plugin()
    await IAR.requestReview()
    // Recorded AFTER the call resolves. A bridge that rejected asked nobody anything, and
    // burning one of three lifetime asks on a failed call is the wrong trade.
    writeLedger({ asks: ledger.asks + 1, lastAskAt: Date.now() })
    return true
  } catch (err) {
    // Never surfaced to the player. A store prompt that cannot be shown is not an error
    // the person holding the phone can do anything about.
    console.warn('[review] requestReview failed', err)
    return false
  }
}

/** Test/dev seam: forget that we ever asked. Not referenced by the app. */
export function __resetReviewLedger(): void {
  try {
    localStorage.removeItem(LEDGER_KEY)
  } catch {
    /* nothing to do */
  }
}
