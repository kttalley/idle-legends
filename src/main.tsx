import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPurchases } from './monetization/purchases'
import { loadBlocks } from './moderation/blocks'
import { recoverSessionFromKeychain } from './net/session'
import { restoreMissingCloudSlots } from './net/cloudSave'
import { SAVES_KEY, LAST_SLOT_KEY } from './store/saveSlots'
import {
  recoverSavesIfMissing, requestPersistentStorage, flushMirrorNow,
} from './store/storagePersistence'

// ── Make JavaScript failures visible on device ───────────────────────────────
//
// Capacitor forwards `console.*` into the native log, but an UNCAUGHT exception or a
// rejected promise is not a console call — it dies inside the WebView and the native side
// prints only "JS Eval error A JavaScript exception occurred", with no message, no stack
// and no clue which module. That is how a boot-time failure in the purchase layer stayed
// invisible across half a dozen TestFlight builds while the paywall was debugged from
// screenshots of a phone.
//
// Routing both through `console.error` costs nothing and means `xcrun simctl launch
// --console-pty` (or a device console) prints the actual error.
window.addEventListener('error', e => {
  console.error('[uncaught]', e.message, 'at', `${e.filename}:${e.lineno}:${e.colno}`)
})
window.addEventListener('unhandledrejection', e => {
  const r = e.reason as { message?: string; stack?: string } | undefined
  console.error('[unhandled-rejection]', r?.message ?? String(e.reason), r?.stack ?? '')
})

// Deliberately not awaited. Configuring RevenueCat reaches the network, and the game must
// start regardless — a store outage, airplane mode or a missing API key all resolve to
// "no entitlements", which can only ever cost the player a cosmetic. Components subscribe
// to the purchase state, so entitlements light up whenever they arrive.
void initPurchases()

// The block list, likewise not awaited. It creates the anonymous session if there is not
// one yet, and until it resolves the set is empty — which means a blocked player can be
// visible for the first second of a cold launch. That is the right way round: the
// alternative is holding the whole boot on a network call, and a failed load would then
// mean no game rather than one briefly-visible name. Every display path reads the live set,
// so the row disappears the moment it arrives.
void loadBlocks()

// Also not awaited: asking the UA not to evict us is a request whose answer changes
// nothing about how the app boots.
void requestPersistentStorage()

// Flush the save mirror before the WebView is suspended or killed. On iOS `pagehide` is
// the last callback the app reliably gets, and a pending debounce timer simply never fires
// after that — so without this the missing few seconds would be exactly the most recent
// progress. `visibilitychange` covers the backgrounding case that does not unload.
const flush = () => { void flushMirrorNow() }
window.addEventListener('pagehide', flush)
window.addEventListener('freeze', flush)
document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })

/**
 * Recover the saves file from the IndexedDB mirror BEFORE mounting.
 *
 * This gate has to be awaited. `App` reads `slotStorage.list()` inside `useState`
 * initialisers, so recovery that resolves after first paint would show a player with
 * heroes an empty character-select screen — and invite them to start a new one over the
 * top. A few milliseconds of the existing HTML background is the correct trade.
 *
 * It cannot fail the boot: every path inside resolves, and a thrown error here would mean
 * a blank screen instead of a game, which is strictly worse than a missing recovery.
 */
async function boot(): Promise<void> {
  try {
    await recoverSavesIfMissing(SAVES_KEY, LAST_SLOT_KEY)
  } catch (e) {
    console.error('[saves] recovery failed; booting with local storage as-is', e)
  }

  // Recover the cloud identity from the Keychain before anything can create a new one.
  //
  // Order matters and this is the whole reason it is awaited here rather than fired off:
  // the first cloud call runs `ensureSession()`, which SIGNS UP a fresh anonymous user
  // when it finds no session. Win that race and the reinstalling player is silently given
  // a new identity, their old characters become unreachable, and the Keychain copy is then
  // overwritten by the new session — destroying the only thing that could have recovered
  // them. A few milliseconds before first paint is a very cheap way to never do that.
  try {
    await recoverSessionFromKeychain()
  } catch (e) {
    console.warn('[session] keychain recovery failed; continuing signed out', e)
  }

  // With the identity back, pull down any character this device does not have.
  //
  // Awaited, and for the same reason as the two above: `App` reads `slotStorage.list()` in
  // a `useState` initialiser and shows CHARACTER CREATION when it comes back empty. A
  // restore that lands after first paint would leave a returning player staring at "choose
  // a class" with their heroes already on disk — and creating a new one from that screen is
  // how they would then be pushed down the slot list by a stranger.
  //
  // Bounded by `REQUEST_TIMEOUT_MS` (8s) inside `cloudFetch`, and it resolves to 0 on every
  // failure, so a dead network costs a moment of the existing HTML background and nothing
  // else.
  try {
    await restoreMissingCloudSlots()
  } catch (e) {
    console.warn('[cloud] boot restore failed; continuing with local saves', e)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void boot()
