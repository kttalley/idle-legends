#!/usr/bin/env node
// ── IAP review screenshots ───────────────────────────────────────────────────
//
//   node tools/uitest/shoot-iap.mjs
//
// App Store Connect requires a "Review Information" screenshot on every in-app purchase,
// showing where the purchase actually appears in the app. Two products, two surfaces:
//
//   founder.png   — Wardrobe: the locked colourway tiles, the Founder Pack card, Unlock.
//   standing.png  — Zone track: The Watch meter with the Standing Orders SKU button.
//
// Shot off the dev server through headless Chrome at 430x932 @3 (= 1290x2796), the same
// real-app-pixels route as shoot-store.mjs. These are review aids, not marketing assets —
// Apple's only hard floor is 640x920.
//
// The one synthetic detail, stated plainly because a reviewer's screenshot should not
// quietly differ from their build: both SKU buttons are gated on a localized price string
// that only StoreKit can supply, so on the web build they do not render at all. The
// `__ilPrices` DEV seam supplies those two strings and nothing else. Every other pixel is
// the real component in its real state. Set the prices here to whatever you actually
// entered in App Store Connect.

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, openTab, evaluate, enterGame, seedSave, screenshot, sleep } from './cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
// Straight to the Desktop — these get hand-uploaded to two ASC product pages and are not
// store assets, so they do not belong in store/screenshots/ alongside the marketing set.
const OUT = join(homedir(), 'Desktop', 'stillmarch-iap-screenshots')

const FOUNDER_PRICE = process.env.FOUNDER_PRICE || '$4.99'
const STANDING_PRICE = process.env.STANDING_PRICE || '$2.99'

const DEVICE = { width: 430, height: 932, scale: 3, mobile: true, touch: true }

function startDevServer() {
  const proc = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`vite did not report a URL:\n${buf}`)), 30000)
    const onData = d => {
      buf += d.toString()
      const m = buf.match(/https?:\/\/localhost:\d+\/[^\s]*/)
      if (m) { clearTimeout(timer); resolve({ url: m[0], proc }) }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', c => { clearTimeout(timer); reject(new Error(`vite exited ${c}:\n${buf}`)) })
  })
}

// Same dev-chrome sweep as shoot-store.mjs: the combat-gates readout is inline-styled and
// has landed in a capture before.
async function hideDevChrome(send) {
  const showing = await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`)
  if (showing) {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192, text: '`',
      })
    }
    await sleep(250)
  }
  await evaluate(send, `(() => {
    const all = [...document.querySelectorAll('div')].filter(el => /combat gates/i.test(el.textContent || ''));
    const innermost = all.filter(el => !all.some(o => o !== el && el.contains(o)));
    for (const el of innermost) el.style.display = 'none';
    if (!document.getElementById('__shootStyle')) {
      const s = document.createElement('style');
      s.id = '__shootStyle';
      s.textContent = '*:focus,*:focus-visible{outline:none !important;box-shadow:none !important}';
      document.head.appendChild(s);
    }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  })()`)
}

/**
 * "Is this selector actually IN FRAME" — not merely in the DOM.
 *
 * The first run of this script wrote a standing-orders.png that was pure gameplay with no
 * SKU anywhere in it. `.watch-meter-sku` existed and the check passed, but the left rail
 * sits at x = -324 on a phone viewport until you open it, so the button was off-canvas.
 * A review screenshot that does not contain the purchase is exactly the thing App Review
 * bounces, so presence is never a sufficient gate here — geometry is.
 */
const onScreen = sel => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return false;
  const r = e.getBoundingClientRect();
  return r.width > 8 && r.height > 8 && r.x >= 0 && r.y >= 0
      && r.x + r.width <= innerWidth + 1 && r.y + r.height <= innerHeight + 1;
})()`

async function shoot(send, name, label, expect) {
  mkdirSync(OUT, { recursive: true })
  const deadline = Date.now() + 10000
  let ok = false
  while (Date.now() < deadline) {
    if (await evaluate(send, `!!(${expect})`)) { ok = true; break }
    await sleep(250)
  }
  if (!ok) throw new Error(`${name}: never satisfied \`${expect}\` — refusing to write`)
  await hideDevChrome(send)
  if (await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`)) {
    throw new Error(`${name}: dev readout still visible`)
  }
  await screenshot(send, join(OUT, name))
  console.log(`  ✓ ${name}  ${label}`)
}

const { url, proc } = await startDevServer()
console.log(`dev server: ${url}`)
const { port, kill } = await launchChrome({})
const tab = await openTab(port)

try {
  await enterGame(tab.send, url, { device: DEVICE })
  await seedSave(tab.send, url, {
    level: 24,
    gold: 8400,
    currentZone: 'grimshade_forest',
    unlockedZones: ['sunhollow_meadows', 'dustwind_plains', 'grimshade_forest', 'thornvale_jungle'],
    bossesDefeated: ['sunhollow_meadows', 'dustwind_plains'],
    totalZoneKills: { sunhollow_meadows: 60, dustwind_plains: 72, grimshade_forest: 24 },
  })
  await sleep(2500)

  // Supply the two price strings StoreKit would have returned. Without this both SKU
  // buttons are correctly absent and neither screenshot shows a purchase at all.
  const priced = await evaluate(tab.send, `(() => {
    if (typeof window.__ilPrices !== 'function') return 'missing';
    window.__ilPrices(${JSON.stringify(FOUNDER_PRICE)}, ${JSON.stringify(STANDING_PRICE)});
    return 'ok';
  })()`)
  if (priced !== 'ok') throw new Error('__ilPrices seam absent — is this a dev build?')
  await sleep(400)

  // Slide the left rail in. At 430px it is parked off-canvas at x = -324 and everything
  // on it — the zone track, The Watch, the hero bar with Looks — renders but is not in
  // frame. (shoot-store.mjs still clicks an `.app-dock-btn` labelled HERO, which the
  // 2026-08-17 UI overhaul renamed to MENU; that script needs the same fix before the
  // marketing set is reshot.)
  const openedRail = await evaluate(tab.send, `(() => {
    const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /menu/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  if (!openedRail) throw new Error('could not find the MENU dock button')
  await sleep(1200)

  // ── standing.png — The Watch, on the zone track ───────────────────────────
  await evaluate(tab.send, `(() => {
    const el = document.querySelector('.watch-meter');
    el && el.scrollIntoView({ block: 'center' });
  })()`)
  await sleep(600)
  await shoot(tab.send, 'standing-orders.png', 'The Watch — Standing Orders SKU',
    onScreen('.watch-meter-sku'))

  // ── founder.png — the Wardrobe paywall ────────────────────────────────────
  const openedWardrobe = await evaluate(tab.send, `(() => {
    const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /looks/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  if (!openedWardrobe) throw new Error('could not find the Looks tab')
  await sleep(1500)
  await shoot(tab.send, 'founder-pack.png', 'Wardrobe — locked colourways and Unlock',
    onScreen('.wardrobe-sku, [data-surface="wardrobe"] .rp-button'))

  const dims = await evaluate(tab.send, `({ w: innerWidth * devicePixelRatio, h: innerHeight * devicePixelRatio })`)
  console.log(`\ncaptured at ${dims.w}x${dims.h} → ${OUT}`)
} finally {
  kill()
  proc.kill()
}
process.exit(0)
