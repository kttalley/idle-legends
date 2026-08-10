// ── Keeping saves alive ────────────────────────────────────────────────────────
//
// The save layer is localStorage, and localStorage is *evictable*. For a normal web app
// that is a nuisance; for an idle game it is existential, because "I did not open it for a
// week" is the core play pattern rather than an edge case — and a week of no interaction
// is exactly the condition browsers evict on. WebKit caps script-writable storage at seven
// days without user interaction. The player's whole account can evaporate while the game
// is doing what the game is for.
//
// Two defences, and they cover different failures:
//
//   1. `navigator.storage.persist()` — asks the UA to exempt this origin from eviction.
//      This is the ONLY thing that prevents the loss. It can be denied, and often is on
//      iOS Safari unless the app is installed to the home screen, so it is necessary but
//      not sufficient.
//
//   2. An IndexedDB mirror of the saves blob. This does NOT survive a whole-origin
//      eviction — WebKit clears IndexedDB alongside localStorage, and pretending otherwise
//      would be false comfort. What it does cover is the failure that is far more common
//      in practice: localStorage's ~5MB per-origin quota. Five slots of full GameState is
//      not a small blob, `writeFile` already has a live QuotaExceededError path, and IDB's
//      quota is orders of magnitude larger. It also covers engines that treat localStorage
//      as more disposable than IDB, and a user clearing "cookies and site data" selectively.
//
// The mirror is strictly a FALLBACK. Recovery runs only when localStorage has no saves
// file at all — never when it has one that merely looks older. Preferring a mirror over
// live local data is how you resurrect a character the player deleted, and a save system
// that undoes deletions is a worse bug than the one being fixed here.

const DB_NAME    = 'idle_legends'
const DB_VERSION = 1
const STORE      = 'saves'
/** Single record: the whole saves file plus the last-slot pointer, written together. */
const MIRROR_KEY = 'mirror'

export interface MirrorRecord {
  /** Verbatim JSON string from localStorage — mirrored as-is, never re-serialised. */
  saves: string
  lastSlotId: string | null
  savedAt: number
}

/** IndexedDB is absent in the Node sim harness and in some privacy modes. */
function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

/**
 * Time budget for opening the database.
 *
 * The boot gate awaits a read through this, so a hang here is a white screen rather than a
 * slow start. `indexedDB.open` is not reliably callback-complete: Firefox private browsing
 * has historically fired neither success nor error, and a blocked upgrade can sit
 * indefinitely behind another tab. A timeout converts every one of those into "no mirror
 * today", which is a fully survivable outcome — the real save is in localStorage.
 */
const OPEN_TIMEOUT_MS = 2500

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null)
  return new Promise(resolve => {
    let settled = false
    const done = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT_MS)
    const finish = (db: IDBDatabase | null) => { clearTimeout(timer); done(db) }

    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      finish(null)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      // If the timeout already won, nobody holds this handle — close it rather than
      // leaking a connection that would block the next upgrade.
      if (settled) { try { req.result.close() } catch { /* nothing to do */ } return }
      finish(req.result)
    }
    req.onerror = () => finish(null)
    req.onblocked = () => finish(null)
  })
}

/** Read the mirrored record, or null. Never rejects. */
export async function readMirror(): Promise<MirrorRecord | null> {
  const db = await openDb()
  if (!db) return null
  try {
    return await new Promise<MirrorRecord | null>(resolve => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(MIRROR_KEY)
      req.onsuccess = () => resolve((req.result as MirrorRecord) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** Write the mirror. Never rejects; a failed mirror must not disturb the real save. */
async function writeMirror(record: MirrorRecord): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    return await new Promise<boolean>(resolve => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record, MIRROR_KEY)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db.close()
  }
}

// ── Mirror scheduling ──────────────────────────────────────────────────────────
// The autosave fires on a timer and every write calls through here, so the mirror is
// coalesced: keep only the newest pending payload and write it after a short idle gap.
// Mirroring is a durability backstop, not a transaction — being a few seconds behind is
// fine, and hammering IDB from the game loop is not.
const MIRROR_DEBOUNCE_MS = 3000
let pending: MirrorRecord | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false

async function flush(): Promise<void> {
  if (inFlight || !pending) return
  inFlight = true
  const record = pending
  pending = null
  try {
    await writeMirror(record)
  } finally {
    inFlight = false
    // A write that arrived while this one was in flight still needs to land.
    if (pending) schedule()
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void flush() }, MIRROR_DEBOUNCE_MS)
}

/** Queue the current saves blob to be mirrored. Cheap, synchronous, never throws. */
export function mirrorSaves(saves: string, lastSlotId: string | null): void {
  if (!idbAvailable()) return
  pending = { saves, lastSlotId, savedAt: Date.now() }
  schedule()
}

/**
 * Write any pending mirror immediately.
 *
 * Bound to pagehide/freeze, which on iOS is the last callback before the OS suspends or
 * kills the WebView — a debounce timer will simply never fire once that happens, so the
 * most recent few seconds of progress would be the exact thing missing from the backup.
 */
export async function flushMirrorNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null }
  await flush()
}

// ── Persistence request ────────────────────────────────────────────────────────

export type PersistState = 'persisted' | 'denied' | 'unsupported'

let persistState: PersistState = 'unsupported'
export function getPersistState(): PersistState { return persistState }

/**
 * Ask the browser not to evict this origin.
 *
 * Chrome grants this silently based on engagement heuristics; Safari generally grants it
 * only for home-screen installs; a Capacitor WKWebView reports it unsupported and does not
 * need it, because app-sandbox storage is not subject to the browser eviction rules at all.
 * All three outcomes are fine — this is a request, and the mirror plus the boot recovery
 * below are what handle a "no".
 */
export async function requestPersistentStorage(): Promise<PersistState> {
  try {
    if (!navigator.storage?.persist || !navigator.storage?.persisted) {
      persistState = 'unsupported'
      return persistState
    }
    persistState = (await navigator.storage.persisted()) || (await navigator.storage.persist())
      ? 'persisted'
      : 'denied'
  } catch {
    persistState = 'unsupported'
  }
  return persistState
}

/** Rough storage headroom, for diagnostics. Null when the browser will not say. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const { usage, quota } = await navigator.storage.estimate()
    return usage != null && quota != null ? { usage, quota } : null
  } catch {
    return null
  }
}

// ── Boot recovery ──────────────────────────────────────────────────────────────

export interface RecoveryResult {
  restored: boolean
  /** Why nothing was restored — for logging, not for the player. */
  reason: 'local-intact' | 'no-mirror' | 'mirror-unusable' | 'restored' | 'write-failed'
  savedAt?: number
}

/**
 * Restore the saves file from the mirror if — and only if — localStorage has none.
 *
 * Must complete BEFORE React mounts. `App` reads `slotStorage.list()` in a `useState`
 * initialiser, so a recovery that lands after first paint shows the player an empty
 * character-select screen while their heroes are sitting in IndexedDB, and invites them to
 * start a new hero in response.
 */
export async function recoverSavesIfMissing(
  savesKey: string, lastSlotKey: string,
): Promise<RecoveryResult> {
  let localRaw: string | null = null
  try {
    localRaw = localStorage.getItem(savesKey)
  } catch {
    // No localStorage at all (hard privacy mode). Nothing to restore INTO.
    return { restored: false, reason: 'local-intact' }
  }

  // Live local data always wins. See the header note: preferring the mirror here is how a
  // deleted character comes back from the dead.
  if (localRaw !== null) return { restored: false, reason: 'local-intact' }

  const record = await readMirror()
  if (!record?.saves) return { restored: false, reason: 'no-mirror' }

  // Only restore something that parses into the shape the save layer expects. Writing an
  // unparseable blob into the live key would immediately trip the corruption quarantine.
  try {
    const parsed = JSON.parse(record.saves) as { slots?: unknown }
    if (!parsed || !Array.isArray(parsed.slots) || parsed.slots.length === 0) {
      return { restored: false, reason: 'mirror-unusable' }
    }
  } catch {
    return { restored: false, reason: 'mirror-unusable' }
  }

  try {
    localStorage.setItem(savesKey, record.saves)
    if (record.lastSlotId) localStorage.setItem(lastSlotKey, record.lastSlotId)
  } catch {
    return { restored: false, reason: 'write-failed' }
  }

  console.info('[saves] localStorage was empty; restored from the IndexedDB mirror',
    new Date(record.savedAt).toISOString())
  return { restored: true, reason: 'restored', savedAt: record.savedAt }
}
