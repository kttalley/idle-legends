// ── Chrome DevTools Protocol driver for the UI suites ─────────────────────────
//
// There is no Playwright in this project and no appetite for adding one: system Chrome
// plus Node's global `WebSocket` (v22+) is enough to drive the real app, and it keeps the
// dependency list at zero. This module is the plumbing; the assertions live in suites/.
//
// Two hard-won constraints shape the design:
//
//   • CDP clears every `Emulation.*` override when the client disconnects. Device
//     metrics, touch emulation and CPU throttling must be set AND exercised inside one
//     WebSocket session. Splitting them across two connections silently reverts to
//     desktop and produces extremely convincing false results.
//   • An assertion is worthless unless the world scene is actually mounted. The app can
//     bounce back to character select mid-run, and a static menu passes most "is the
//     panel closed" checks trivially — a flattering false pass, which is far harder to
//     notice than a false failure. `enterGame` therefore waits on `window.__ilScene`,
//     not on a timeout.

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_BIN
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Launch Chrome with a throwaway profile. Returns { port, kill }.
 *
 * Port 0 lets the OS assign, and Chrome writes what it picked to DevToolsActivePort in
 * the profile directory. This is not fussiness: with a FIXED port, a Chrome left over
 * from an earlier run still holds it, the new process fails to bind and exits, and the
 * readiness poll cheerfully succeeds against the STALE browser — which then fails to
 * navigate and reports "is the dev server up?", sending you to debug the wrong thing
 * entirely. Asking for a fresh port makes that collision impossible.
 */
export async function launchChrome({ headed = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'il-uitest-'))
  const proc = spawn(CHROME, [
    '--remote-debugging-port=0',
    ...(headed ? [] : ['--headless=new']),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore', detached: true })
  proc.unref()

  const kill = () => { try { process.kill(-proc.pid) } catch { /* already gone */ } }
  const portFile = join(profile, 'DevToolsActivePort')

  for (let i = 0; i < 80; i++) {
    try {
      // First line is the port; the second is the browser's WS path.
      const port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
      if (port > 0 && (await fetch(`http://127.0.0.1:${port}/json/version`)).ok) {
        return { port, kill }
      }
    } catch { /* not up yet */ }
    await sleep(250)
  }
  kill()
  throw new Error(`Chrome never reported a debugging port (profile: ${profile}). Set CHROME_BIN if Chrome lives elsewhere.`)
}

/** Open a fresh tab and attach to it. One tab per suite keeps overrides isolated. */
export async function openTab(port) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(created.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  const consoleErrors = []

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id != null) {
      const slot = pending.get(msg.id)
      if (!slot) return
      pending.delete(msg.id)
      msg.error ? slot.reject(new Error(JSON.stringify(msg.error))) : slot.resolve(msg.result)
      return
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const e = msg.params.entry
      consoleErrors.push(e.url ? `${e.text} <${e.url}>` : e.text)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      const frames = (d.stackTrace?.callFrames ?? []).slice(0, 8)
        .map(f => `    at ${f.functionName || '<anon>'} (${f.url.split('/').slice(-1)[0]}:${f.lineNumber})`).join('\n')
      consoleErrors.push((d.exception?.description ?? d.text) + (frames ? '\n' + frames : ''))
    }
  })

  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')

  return {
    send,
    consoleErrors,
    targetId: created.id,
    close: async () => {
      try { await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`) } catch { /* already gone */ }
      try { ws.close() } catch { /* already closed */ }
    },
  }
}

/** Evaluate an expression in the page and return its value. Throws on page exceptions. */
export async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) {
    const detail = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
    throw new Error(`page threw: ${detail}\n  while evaluating: ${expression.trim().slice(0, 200)}`)
  }
  return r.result.value
}

/** Poll `expression` until it is truthy. Returns false on timeout rather than throwing. */
export async function waitFor(send, expression, { timeout = 20000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { if (await evaluate(send, expression)) return true } catch { /* mid-navigation */ }
    await sleep(interval)
  }
  return false
}

/**
 * A real touch, not `element.click()`.
 *
 * Hit-testing is the whole point of several of these assertions — "the strip of world
 * left of the chat sheet dismisses it" is only meaningful if the tap has to find its own
 * target. `element.click()` would dispatch straight to a node the user may not be able to
 * reach and pass regardless.
 */
export async function tap(send, x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
}

export async function pressKey(send, key, code = key) {
  const common = { key, code, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...common })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
  await sleep(400)
}

export async function screenshot(send, path) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(r.data, 'base64'))
}

/** Centre of an element, in viewport coordinates. Null when it is not on screen. */
export async function centreOf(send, selector) {
  return evaluate(send, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`)
}

const clickByText = pattern => `(() => {
  const b = [...document.querySelectorAll('button')].find(x => ${pattern}.test(x.textContent || ''));
  if (!b) return null;
  b.click();
  return b.textContent.trim();
})()`

/**
 * Wipe EVERY store the save layer can come back from.
 *
 * Suites share one Chrome instance and therefore one origin, and clearing localStorage
 * alone is no longer a reset: the app mirrors saves into IndexedDB and restores them at
 * boot when localStorage is empty — which is exactly the state a "clean" suite starts in.
 * The first full run after that feature landed had `objectives` and `mobile-layout` fail
 * because they inherited the previous suite's hero, faithfully recovered. Cold means cold.
 */
async function resetStorage(send) {
  await evaluate(send, `(() => new Promise(resolve => {
    try { localStorage.clear() } catch { /* private mode */ }
    if (typeof indexedDB === 'undefined') { resolve('no-idb'); return }
    const req = indexedDB.deleteDatabase('idle_legends');
    req.onsuccess = () => resolve('cleared');
    req.onerror = () => resolve('idb-error');
    // An open connection from the page being torn down blocks the delete; the reload
    // that follows drops it, so do not hang the boot on it.
    req.onblocked = () => resolve('blocked');
    setTimeout(() => resolve('timeout'), 3000);
  }))()`)
}

/**
 * Get from a cold page to a running world with a known-empty save.
 *
 * Deliberately not a fixed sleep. The entry sequence differs depending on whether a save
 * slot already exists (Continue) or not (create a hero), and clicking the wrong one leaves
 * the app on a menu that quietly satisfies most assertions.
 */
export async function enterGame(send, appUrl, { device } = {}) {
  if (device) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: device.width, height: device.height,
      deviceScaleFactor: device.scale ?? 2, mobile: !!device.mobile,
    })
    if (device.touch) {
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' })
    }
  }

  // Navigate BEFORE touching localStorage — reading it on about:blank is a SecurityError.
  await send('Page.navigate', { url: appUrl })
  if (!await waitFor(send, `document.readyState === 'complete'`)) {
    throw new Error(`page never finished loading ${appUrl} — is the dev server up?`)
  }
  await resetStorage(send)
  await send('Page.navigate', { url: appUrl })
  await waitFor(send, `document.readyState === 'complete'`)
  await sleep(1200)

  // Click through whichever gate is showing until the world exists.
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (await evaluate(send, `!!window.__ilScene && !!document.querySelector('.app-root')`)) {
      await sleep(1500)   // let the first frames and the HUD settle
      return
    }
    await evaluate(send, clickByText('/Begin Your Legend/i'))
    await evaluate(send, clickByText('/Continue/i'))
    await sleep(900)
  }
  throw new Error('never reached a mounted world scene (still on character create/select?)')
}

/**
 * Fast-forward the save to a state that would take real minutes to earn, then reload.
 *
 * Goes through the app's own load path rather than poking the live store, so it also
 * exercises `rehydrateState` — and so the assertions afterwards are running against state
 * the game itself produced, not a shape only the test knows how to build.
 *
 * Needed because a genuinely fresh save is a level-1 hero standing in zone one of twelve:
 * there is nowhere to fast-travel TO, so "choosing a destination dismisses the picker" has
 * no destination to choose and reports a failure that is really an empty fixture.
 */
export async function seedSave(send, appUrl, patch) {
  const applied = await evaluate(send, `(() => {
    const raw = localStorage.getItem('idle_legends_saves_v1');
    if (!raw) return 'no-save';
    const doc = JSON.parse(raw);
    if (!doc.slots?.[0]?.state) return 'no-slot';
    Object.assign(doc.slots[0].state, ${JSON.stringify(patch)});
    localStorage.setItem('idle_legends_saves_v1', JSON.stringify(doc));
    return 'ok';
  })()`)
  if (applied !== 'ok') throw new Error(`could not seed the save slot: ${applied}`)

  await send('Page.navigate', { url: appUrl })
  await waitFor(send, `document.readyState === 'complete'`)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await evaluate(send, `!!window.__ilScene`)) { await sleep(1200); return }
    await evaluate(send, clickByText('/Continue/i'))
    await sleep(700)
  }
  throw new Error('world scene never came back after seeding the save')
}

/** Assertion collector handed to each suite. */
export function makeChecks(name) {
  const results = []
  return {
    check(label, passed, note) {
      results.push({ label, passed: !!passed, note })
    },
    note(text) { results.push({ label: text, info: true }) },
    results,
    name,
  }
}
