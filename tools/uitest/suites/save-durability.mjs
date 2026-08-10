import { evaluate, enterGame, waitFor, sleep } from '../cdp.mjs'

// Save durability — the one failure in this project that destroys something the player
// cannot get back.
//
// localStorage is evictable, and an idle game's core play pattern ("I did not open it for
// a week") is precisely the condition browsers evict on. The defences are
// `navigator.storage.persist()` and an IndexedDB mirror with boot recovery; this suite
// exercises the eviction it is all built for, by deleting the saves key out from under a
// live account and reloading.
//
// The negative case matters as much as the positive one. A mirror that is preferred over
// live local data resurrects characters the player deleted — a save system that undoes
// deletions is a worse bug than the one being fixed.

export const name = 'save-durability'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

const SAVES_KEY = 'idle_legends_saves_v1'
const LAST_SLOT_KEY = 'idle_legends_last_slot'

const readMirror = `(() => new Promise(resolve => {
  const req = indexedDB.open('idle_legends', 1);
  req.onerror = () => resolve(null);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('saves')) { db.close(); resolve(null); return; }
    const get = db.transaction('saves', 'readonly').objectStore('saves').get('mirror');
    get.onsuccess = () => { const v = get.result; db.close();
      resolve(v ? { savedAt: v.savedAt, lastSlotId: v.lastSlotId, slots: JSON.parse(v.saves).slots.length } : null); };
    get.onerror = () => { db.close(); resolve(null); };
  };
}))()`

const heroName = `(() => {
  try { const f = JSON.parse(localStorage.getItem(${JSON.stringify(SAVES_KEY)}) || '{}');
    return f.slots?.[0]?.summary?.playerName ?? null } catch { return null }
})()`

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  // ── The persistence request was actually made ──────────────────────────────
  const persisted = await evaluate(send, `navigator.storage?.persisted ? navigator.storage.persisted() : 'unsupported'`)
  note(`navigator.storage.persisted() → ${persisted}`)
  check('the browser exposes a persistence decision (granted or refused, not crashed)',
    persisted === true || persisted === false || persisted === 'unsupported')

  // ── A real save reaches the mirror ─────────────────────────────────────────
  // Autosave runs every 10s; the mirror debounces 3s behind it.
  const saved = await waitFor(send, `(() => {
    try { const f = JSON.parse(localStorage.getItem(${JSON.stringify(SAVES_KEY)}) || '{}');
      return (f.slots?.length ?? 0) > 0 } catch { return false }
  })()`, { timeout: 30000 })
  check('the hero reaches localStorage', saved)

  const name = await evaluate(send, heroName)
  note(`hero: ${name}`)

  const mirrored = await waitFor(send, `${readMirror}.then(m => !!m && m.slots > 0)`, { timeout: 30000 })
  const mirror = await evaluate(send, readMirror)
  check('the save is mirrored into IndexedDB', mirrored && mirror?.slots > 0)
  check('the mirror carries the last-slot pointer, so recovery resumes the right hero',
    !!mirror?.lastSlotId)

  // ── Eviction: wipe localStorage, reload, and expect the account back ───────
  // This is the actual failure mode. Everything above is setup.
  await evaluate(send, `(() => {
    localStorage.removeItem(${JSON.stringify(SAVES_KEY)});
    localStorage.removeItem(${JSON.stringify(LAST_SLOT_KEY)});
    return true;
  })()`)
  check('localStorage really was cleared before the reload',
    await evaluate(send, `localStorage.getItem(${JSON.stringify(SAVES_KEY)}) === null`))

  await send('Page.reload', { ignoreCache: false })
  await waitFor(send, `document.readyState === 'complete'`)
  await sleep(2500)

  const restoredName = await evaluate(send, heroName)
  note(`after simulated eviction + reload → ${restoredName ?? 'nothing'}`)
  check('the account survives eviction of localStorage', restoredName === name && !!name)
  check('the app comes back up rather than white-screening',
    await evaluate(send, `!!document.querySelector('#root')?.children.length`))

  // ── Live local data always wins over the mirror ────────────────────────────
  // Simulates a deleted character: the mirror still holds two slots while localStorage
  // holds one. Recovery must not run at all, or the deletion undoes itself.
  //
  // The assertion is on the SLOT COUNT, not on an edited hero name. A name is derived
  // from live state, so the running game rewrites it on the next autosave — which looked
  // like a recovery bug on the first pass and was really the game saving correctly.
  // Slot count is immune to that: autosave replaces one slot, it never adds one.
  const counts = await evaluate(send, `(() => new Promise(resolve => {
    const raw = localStorage.getItem(${JSON.stringify(SAVES_KEY)});
    const file = JSON.parse(raw);
    const ghost = JSON.parse(JSON.stringify(file.slots[0]));
    ghost.id = 'slot_ghost_deleted';
    ghost.summary.playerName = 'Deleted Hero';
    const stale = JSON.stringify({ slots: [...file.slots, ghost] });
    const req = indexedDB.open('idle_legends', 1);
    req.onsuccess = () => { const db = req.result;
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ saves: stale, lastSlotId: null, savedAt: Date.now() + 60000 }, 'mirror');
      tx.oncomplete = () => { db.close(); resolve({ local: file.slots.length, mirror: 2 }) };
      tx.onerror = () => { db.close(); resolve(null) };
    };
    req.onerror = () => resolve(null);
  }))()`)
  note(`before reload — local ${counts?.local} slot(s), mirror ${counts?.mirror} (and newer)`)
  await send('Page.reload', { ignoreCache: false })
  await waitFor(send, `document.readyState === 'complete'`)
  await sleep(2000)
  const afterCount = await evaluate(send, `(() => {
    try { return JSON.parse(localStorage.getItem(${JSON.stringify(SAVES_KEY)})).slots.length }
    catch { return -1 }
  })()`)
  note(`after reload — local ${afterCount} slot(s)`)
  check('a present localStorage is never replaced by a larger, newer mirror',
    afterCount === counts?.local)
  check('...so a deleted character does not come back', !await evaluate(send, `
    (localStorage.getItem(${JSON.stringify(SAVES_KEY)}) || '').includes('Deleted Hero')`))

  // ── An unusable mirror is ignored rather than written into the live key ────
  // Restoring an unparseable blob would immediately trip the corruption quarantine and
  // present as "your save could not be read" — a bug manufactured by the recovery itself.
  await evaluate(send, `(() => new Promise(resolve => {
    const req = indexedDB.open('idle_legends', 1);
    req.onsuccess = () => { const db = req.result;
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ saves: '{not json', lastSlotId: null, savedAt: Date.now() }, 'mirror');
      tx.oncomplete = () => { db.close(); resolve(true) };
      tx.onerror = () => { db.close(); resolve(false) };
    };
    req.onerror = () => resolve(false);
  }))()`)
  await evaluate(send, `localStorage.removeItem(${JSON.stringify(SAVES_KEY)})`)
  await send('Page.reload', { ignoreCache: false })
  await waitFor(send, `document.readyState === 'complete'`)
  await sleep(2000)
  check('a corrupt mirror is refused, not written into the live save key',
    await evaluate(send, `localStorage.getItem('idle_legends_saves_corrupt') === null`))
  check('the app still boots with a corrupt mirror and no local save',
    await evaluate(send, `!!document.querySelector('#root')?.children.length`))
}
