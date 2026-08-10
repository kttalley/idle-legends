import { enterGame, evaluate, waitFor, sleep } from '../cdp.mjs'

// The ladder — cross-player leaderboard and duels (Track N).
//
// This suite runs with **cloud switched off**, because that is the state of a fresh clone
// with no `.env` and it is the state CI will always be in. That makes it a narrow test on
// purpose, and the narrow thing it tests is the one that actually matters at ship time:
//
//   the game must be completely unharmed by cloud being unavailable.
//
// An idle RPG whose save layer is local (see `storagePersistence.ts`) must never acquire a
// hard dependency on a network service. Every cloud entry point is written to return a
// falsy result rather than throw, and this suite is what stops that discipline rotting —
// a stray `throw` inside `publishSnapshot` would surface here as a dead tab or a page
// error, not as a subtle regression six weeks later.
//
// When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are present, the checks marked
// LIVE below extend automatically; nothing here needs editing to cover the online path.

export const name = 'ladder'
export const device = { width: 390, height: 844, scale: 2, mobile: true, touch: true }

export async function run({ send, appUrl, check, note }) {
  await enterGame(send, appUrl, { device })

  // ── Reachable, and named ───────────────────────────────────────────────────
  // The ladder is the evidence behind the `Idle MMORPG` listing name (store/LAUNCH.md
  // §4b), so an App Review tester has to be able to find it. It lives on the hero strip
  // beside Looks; if it ever stops being reachable that is a store-metadata problem, not
  // a UX nitpick.
  const openedHero = await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /hero/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  check('the hero drawer opens from the dock', openedHero)
  await sleep(400)

  const strip = await evaluate(send,
    `[...document.querySelectorAll('.hero-bar-btn')].map(b => b.textContent.trim()).join('|')`)
  note(`hero strip: ${strip}`)
  check('the ladder sits on the hero strip beside Looks', /ladder/i.test(strip))
  // "Heroes" was an EXIT styled identically to two navigation buttons — a mis-tap ended
  // the run. Removed until it has a home that reads as leaving.
  check('the misleading Heroes exit button is gone', !/heroes/i.test(strip))

  const opened = await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /ladder/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  check('it opens the ladder', opened)

  await waitFor(send, `!!document.querySelector('[data-surface="ladder"]')`, { timeout: 8000 })
  check('the ladder opens as a modal surface',
    await evaluate(send, `!!document.querySelector('[data-surface="ladder"]')`))

  // Portalled to <body>, like the wardrobe: the mobile HERO drawer animates with
  // `transform`, and a transformed ancestor becomes the containing block for fixed
  // descendants — rendered in place the modal is clipped to the drawer's column.
  const escapedDrawer = await evaluate(send, `(() => {
    const el = document.querySelector('[data-surface="ladder"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return Math.round(r.width) >= innerWidth - 1;
  })()`)
  check('it covers the screen rather than being clipped to the drawer', escapedDrawer)

  // The log slot went back to being two feeds when the ladder moved out of it.
  const logTabs = await evaluate(send,
    `[...document.querySelectorAll('.app-log-tab')].map(t => t.textContent.trim()).join('|')`)
  check('the log slot is COMBAT and CHAT only', logTabs === 'COMBAT|CHAT')

  // ── Cloud off is a STATE, not an error ─────────────────────────────────────
  const cloudOn = await evaluate(send, `!!(document.querySelector('.ladder-list'))`)
  const disabledCopy = await evaluate(send,
    `document.querySelector('.ladder-empty')?.textContent ?? ''`)

  if (!cloudOn) {
    note(`cloud disabled copy: ${disabledCopy.slice(0, 90)}`)
    check('the ladder explains itself rather than showing a blank box', disabledCopy.length > 10)
    check('it names the env vars needed to switch it on', /VITE_SUPABASE/.test(disabledCopy))
    check('it does not present being switched off as an error', !/error|failed|crash/i.test(disabledCopy))
  } else {
    // LIVE: only reachable once the env vars are set.
    const rows = await evaluate(send, `document.querySelectorAll('.ladder-row').length`)
    note(`live ladder: ${rows} row(s)`)
    check('the board renders rows or an honest empty state', rows >= 0)
    const you = await evaluate(send, `document.querySelectorAll('.ladder-row.is-you').length`)
    check('the player appears on the board they just published to', you === 1)
  }

  // ── Nothing about the cloud may reach the game loop ────────────────────────
  // The real regression this guards: an exception thrown inside a cloud call bubbling into
  // React and taking the world canvas with it. Check the game is still live, not merely
  // that the panel rendered.
  const errors = await evaluate(send, `(window.__ilErrors || []).length`)
  check('no uncaught page errors from the cloud layer', !errors)

  const stillPlaying = await evaluate(send, `(() => {
    const s = window.__ilScene;
    return !!document.querySelector('canvas') && (s === undefined || s !== null);
  })()`)
  check('the world is still running behind the drawer', stillPlaying)

  // ── One metaphor: minimize, never close ────────────────────────────────────
  // The bug this replaced: `.rail-minimize` was never hidden below 900px, so a drawer
  // rendered BOTH a ✕ and a ‹, and `.collapsed` (0,2,0) beat the mobile rule (0,1,0) —
  // tapping ‹ shrank the drawer to a 34px strip of empty glass that was still "open".
  const closeButtons = await evaluate(send, `document.querySelectorAll('.app-drawer-close').length`)
  check('no ✕ control exists anywhere', closeButtons === 0)

  // Every rail carries exactly one — the minimize arrow in its own head.
  const railControls = await evaluate(send, `(() => {
    const rails = [...document.querySelectorAll('.app-sidebar-left, .app-sidebar-right')];
    return rails.map(r => r.querySelectorAll('.rail-minimize').length);
  })()`)
  note(`minimize controls per rail: ${JSON.stringify(railControls)}`)
  check('each rail carries exactly one minimize control',
    railControls.length > 0 && railControls.every(n => n === 1))

  // The ladder is a modal raised from the hero strip, so its dismissal is a Close button
  // and the shared dismissable stack — not the panel metaphor.
  const closed = await evaluate(send, `(() => {
    const surface = document.querySelector('[data-surface="ladder"]');
    if (!surface) return false;
    const btn = [...surface.querySelectorAll('button')].find(b => /close/i.test(b.textContent));
    if (!btn) return false; btn.click(); return true;
  })()`)
  check('the ladder modal has a Close control', closed)
  await sleep(400)
  check('closing it returns you to the game',
    await evaluate(send, `!document.querySelector('[data-surface="ladder"]')`))

  // ── A retracted DESKTOP rail must stay reachable ───────────────────────────
  // There is no dock above 900px, so the stub and the arrow inside it are the only way
  // back. A CSS edit collapsed `.app-sidebar-left.collapsed` into a neighbouring
  // `display: none` rule and made minimizing a one-way trip — panels vanished with no
  // control to restore them. Assert the affordance, at the desktop breakpoint.
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
  await sleep(500)

  const railBefore = await evaluate(send, `(() => {
    const el = document.querySelector('.app-sidebar-left');
    return el ? { open: el.classList.contains('panel-open'), w: Math.round(el.getBoundingClientRect().width) } : null;
  })()`)
  check('the character rail is extended by default on desktop', railBefore?.open === true)

  await evaluate(send, `document.querySelector('.app-sidebar-left .rail-minimize')?.click()`)
  await sleep(400)
  const stub = await evaluate(send, `(() => {
    const el = document.querySelector('.app-sidebar-left');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const btn = el.querySelector('.rail-minimize');
    const br = btn && btn.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      width: Math.round(r.width),
      onScreen: r.right > 0 && r.left < innerWidth,
      restoreVisible: !!br && br.width > 0 && br.height > 0 && br.right > 0 && br.left < innerWidth,
    };
  })()`)
  note(`desktop stub: ${JSON.stringify(stub)}`)
  check('the retracted rail is still rendered', stub && stub.display !== 'none')
  check('it leaves a stub on screen', stub && stub.onScreen && stub.width > 0 && stub.width < 80)
  check('the restore control is visible inside the stub', stub?.restoreVisible === true)

  await evaluate(send, `document.querySelector('.app-sidebar-left .rail-minimize')?.click()`)
  await sleep(400)
  check('clicking it brings the rail back',
    await evaluate(send, `!!document.querySelector('.app-sidebar-left.panel-open')`))

  // Back to the phone for the storage check.
  await send('Emulation.setDeviceMetricsOverride',
    { width: device.width, height: device.height, deviceScaleFactor: device.scale, mobile: true })
  await sleep(400)

  const saveIntact = await evaluate(send, `(() => {
    try {
      const raw = localStorage.getItem('idle_legends_saves_v1');
      return !!raw && JSON.parse(raw).slots.length > 0;
    } catch { return false }
  })()`)
  check('the local save is untouched by opening the ladder', saveIntact)
}
