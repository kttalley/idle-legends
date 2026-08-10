import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPurchases } from './monetization/purchases'
import { SAVES_KEY, LAST_SLOT_KEY } from './store/saveSlots'
import {
  recoverSavesIfMissing, requestPersistentStorage, flushMirrorNow,
} from './store/storagePersistence'

// Deliberately not awaited. Configuring RevenueCat reaches the network, and the game must
// start regardless — a store outage, airplane mode or a missing API key all resolve to
// "no entitlements", which can only ever cost the player a cosmetic. Components subscribe
// to the purchase state, so entitlements light up whenever they arrive.
void initPurchases()

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

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void boot()
