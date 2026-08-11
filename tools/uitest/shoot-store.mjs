#!/usr/bin/env node
// ── App Store screenshot capture ─────────────────────────────────────────────
//
//   node tools/uitest/shoot-store.mjs
//
// Shoots the real app at Apple's 6.9" size (1290×2796) by driving the dev server in
// headless Chrome — 430×932 CSS px at deviceScaleFactor 3 is exactly that, so these are
// genuine app pixels rather than an upscale or a mockup.
//
// Why not the simulator: the previous set was shot on 2026-08-01 and went stale the moment
// the rebrand landed — old title, five-button action bar, ✕ close controls, the "Heroes"
// exit, generated faction names, `Inventory | Inventory` tabs, no ladder. Reshooting has to
// be cheap enough to redo whenever the UI moves, and a scripted capture is; a manual pass
// on a simulator is not.
//
// The hero is seeded rather than played to, so every shot is reproducible instead of
// depending on what the RNG happened to do.

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, openTab, evaluate, enterGame, seedSave, screenshot, sleep } from './cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'store', 'screenshots')

// 430×932 @3 = 1290×2796 — App Store Connect's 6.9" iPhone slot.
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

// The dev-only combat-gates readout renders by default on a dev server and has no class of
// its own — inline styles, toggled by a backtick keypress. It landed square in the middle of
// the first capture. Belt and braces: press the key AND sweep by text, so a future restyle
// cannot quietly put a debug panel into a store asset.
async function hideDevChrome(send) {
  // The key is a TOGGLE, so pressing it unconditionally on every shot hid the readout on
  // one capture and brought it back on the next. Only press it when it is actually showing.
  const showing = await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`)
  if (showing) {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192, text: '`',
      })
    }
    await sleep(250)
  }
  return evaluate(send, `(() => {
    // Hide only the DEEPEST elements carrying the text. \`textContent\` includes
    // descendants, so a naive match also matches .app-root — the earlier version set
    // display:none on the entire application and produced perfectly blank "screenshots".
    const all = [...document.querySelectorAll('div')]
      .filter(el => /combat gates/i.test(el.textContent || ''));
    const innermost = all.filter(el => !all.some(o => o !== el && el.contains(o)));
    let hidden = 0;
    for (const el of innermost) { el.style.display = 'none'; hidden++; }
    // Suppress focus rings FOR THE CAPTURE ONLY. Modals call trapFocus, so the surface is
    // programmatically focused and Chrome paints a blue outline around the whole dialog —
    // it read as a rendering bug in the wardrobe shot. WKWebView does not draw it, so this
    // makes the capture match the shipped app rather than hiding anything real. The app
    // keeps its focus rings; this style lives only in the screenshot browser.
    if (!document.getElementById('__shootStyle')) {
      const s = document.createElement('style');
      s.id = '__shootStyle';
      s.textContent = '*:focus,*:focus-visible{outline:none !important;box-shadow:none !important}';
      document.head.appendChild(s);
    }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    return hidden;
  })()`)
}

const shots = []
/**
 * Capture, but only once the frame is actually worth capturing.
 *
 * `expect` is a JS expression that must be true before the shot is written. This exists
 * because a fixed sleep produced a completely blank 04-hero.png: the drawer was mid-slide,
 * the scrim was already up, and the result was a uniform dark rectangle that looked like a
 * broken app. A store asset that fails silently is worse than a run that fails loudly —
 * nobody notices until a reviewer does.
 */
async function shoot(send, name, label, expect = 'true') {
  mkdirSync(OUT, { recursive: true })
  const deadline = Date.now() + 8000
  let ok = false
  while (Date.now() < deadline) {
    if (await evaluate(send, `!!(${expect})`)) { ok = true; break }
    await sleep(250)
  }
  if (!ok) throw new Error(`${name}: never satisfied \`${expect}\` — refusing to write`)

  await hideDevChrome(send)
  // Refuse to write a shot that still has dev chrome in it.
  if (await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`)) {
    throw new Error(`${name}: dev readout still visible — not writing a store asset`)
  }
  // And refuse a frame with nothing in it. A near-uniform capture is the signature of the
  // blank-drawer failure above; cheap to detect, expensive to miss.
  const spread = await evaluate(send, `(() => {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 80;
    const g = c.getContext('2d');
    // Cheap proxy for "is anything drawn": sample the real layout box count instead of
    // pixels, since html2canvas is unavailable and the world is a <canvas> we cannot read.
    return document.body.innerText.replace(/\\s+/g, '').length;
  })()`)
  if (spread < 12) throw new Error(`${name}: frame looks empty (${spread} chars of text)`)

  const path = join(OUT, name)
  await screenshot(send, path)
  shots.push(`${name}  — ${label}`)
  console.log(`  ✓ ${name}  ${label}`)
}

const { url, proc } = await startDevServer()
console.log(`dev server: ${url}`)
const { port, kill } = await launchChrome({})
const tab = await openTab(port)

try {
  // ── 1. Character create — the first screen, and the class/race identity ────
  await send0()
  async function send0() {
    await tab.send('Emulation.setDeviceMetricsOverride', {
      width: DEVICE.width, height: DEVICE.height, deviceScaleFactor: DEVICE.scale, mobile: true,
    })
    await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await tab.send('Page.navigate', { url })
    await evaluate(tab.send, `new Promise(r => setTimeout(r, 500))`)
    await tab.send('Page.navigate', { url })
  }
  await sleep(4000)
  if (await evaluate(tab.send, `!!document.querySelector('.create-class-blurb')`)) {
    await shoot(tab.send, '01-create.png', 'character creation — classes, races, factions',
      `document.querySelectorAll('.create-class-blurb').length > 0`)
  }

  // ── Into the world, with a hero worth photographing ───────────────────────
  await enterGame(tab.send, url, { device: DEVICE })
  await seedSave(tab.send, url, {
    level: 24,
    gold: 8400,
    currentZone: 'grimshade_forest',
    unlockedZones: ['sunhollow_meadows', 'dustwind_plains', 'grimshade_forest', 'thornvale_jungle'],
    bossesDefeated: ['sunhollow_meadows', 'dustwind_plains'],
    totalZoneKills: { sunhollow_meadows: 60, dustwind_plains: 72, grimshade_forest: 24 },
  })
  await sleep(3500)
  await shoot(tab.send, '02-world.png', 'the world — dimetric renderer, HUD, objective tracker',
    `document.querySelectorAll('.app-dock-btn').length >= 3 && !document.querySelector('.app-backdrop')`)

  // ── Combat, mid-swing ─────────────────────────────────────────────────────
  await sleep(4000)
  await shoot(tab.send, '03-combat.png', 'combat — action bar, floaters, unit frames',
    `document.querySelectorAll('.skill-slot').length > 0 && !document.querySelector('.app-backdrop')`)

  // ── The ladder ────────────────────────────────────────────────────────────
  const openedHero = await evaluate(tab.send, `(() => {
    const b = [...document.querySelectorAll('.app-dock-btn')].find(x => /hero/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  if (openedHero) {
    await sleep(900)
    await shoot(tab.send, '04-hero.png', 'character sheet — talents, gear, zone track',
      `(() => { const l = document.querySelector('.app-sidebar-left.panel-open');
         return !!l && l.getBoundingClientRect().x >= 0 && l.innerText.trim().length > 40; })()`)
    const openedLadder = await evaluate(tab.send, `(() => {
      const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /ladder/i.test(x.textContent));
      if (!b) return false; b.click(); return true;
    })()`)
    if (openedLadder) {
      await sleep(1500)
      // Only shoot a ladder that is actually ON. With no Supabase project the panel
      // correctly renders "The ladder is offline in this build" over a full-screen black
      // field, naming two env vars — which is a fine dev affordance and an unusable store
      // asset. Shipping that would also be the screenshot contradicting the listing name.
      const live = await evaluate(tab.send, `!!document.querySelector('.ladder-list, .ladder-row')`)
      if (live) {
        await shoot(tab.send, '05-ladder.png', 'the ladder — standings and duels',
          `document.querySelectorAll('.ladder-row').length > 0`)
      } else {
        console.log('  ⚠ 05-ladder.png SKIPPED — cloud disabled, panel shows its offline state.')
        console.log('    Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and re-run to capture it.')
      }
      await evaluate(tab.send, `(() => {
        const s = document.querySelector('[data-surface="ladder"]');
        const b = s && [...s.querySelectorAll('button')].find(x => /close/i.test(x.textContent));
        b && b.click();
      })()`)
      await sleep(600)
    }
  }

  // ── Wardrobe (the paywall) ────────────────────────────────────────────────
  const openedWardrobe = await evaluate(tab.send, `(() => {
    const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /looks/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  if (openedWardrobe) {
    await sleep(1500)
    await shoot(tab.send, '06-wardrobe.png', 'wardrobe — palette colourways (the IAP)',
      `!!document.querySelector('[data-surface="wardrobe"]')`)
  }

  console.log(`\n${shots.length} screenshot(s) → store/screenshots/`)
  const dims = await evaluate(tab.send, `({ w: innerWidth * devicePixelRatio, h: innerHeight * devicePixelRatio })`)
  console.log(`captured at ${dims.w}×${dims.h} (App Store 6.9" slot wants 1290×2796)`)
} finally {
  kill()
  proc.kill()
}
process.exit(0)
