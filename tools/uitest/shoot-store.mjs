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
// depending on what the RNG happened to do. The fixtures live in storeSeeds.mjs, shared
// with shoot-ipad.mjs — see the header there for why each shot gets its own zone.

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, openTab, evaluate, enterGame, seedSave, screenshot, sleep, waitFor } from './cdp.mjs'
import { SHOT_SEEDS, seedFor, assertSeededExpr, crowdOkExpr } from './storeSeeds.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'store', process.env.SHOT_DIR || 'screenshots')

// 430×932 @3 = 1290×2796 — App Store Connect's 6.9" iPhone slot, and the default.
//
// Overridable because the App Store slot is not the only consumer any more: the Shipaton
// Devpost submission asks for at least one shot at 1179×2556, which is 393×852 @3 (the
// iPhone 15/16 Pro logical size). Re-shooting at the target size beats resampling the 6.9"
// set — this is a pixel-art game, and a 91% downscale is exactly the ratio that turns
// crisp 1px sprite edges into mush. Both sizes are the same 19.5:9 family, so no layout
// reasoning changes; only the raster does.
//
//   SHOT_W=393 SHOT_H=852 SHOT_DIR=screenshots-1179 node tools/uitest/shoot-store.mjs
const DEVICE = {
  width: Number(process.env.SHOT_W) || 430,
  height: Number(process.env.SHOT_H) || 932,
  scale: Number(process.env.SHOT_SCALE) || 3,
  mobile: true,
  touch: true,
}

// The hero shown on the character-create shot. Goblin warlock rather than the default
// human warrior: the default is the one combination a player sees without touching
// anything, so shooting it says nothing about there being a choice — and warlock is the
// only class with a race the warrior cannot take, which is the point the screen exists to
// make. Both are real selections driven through the screen's own buttons; nothing here
// stages a state the picker cannot reach.
const CREATE = {
  className: 'Warlock',
  raceName: 'Goblin',
  // Fixed so the shot is reproducible. The screen otherwise rolls a fresh name from
  // `generatePlayerNameFallback(randSeed(), cls)` on every mount, which is the one piece of
  // this capture that was never deterministic. Typed through the quill button's own input,
  // and `begin`'s filter is asserted to accept it below rather than assumed to.
  heroName: 'Vexil Ashcoin',
  // Asserted in the frame, so "the picker was clicked" and "the picker visibly changed"
  // cannot come apart. Both strings are authored data, from src/data/classes.ts and
  // src/data/races.ts.
  classBlurb: 'Shadow curses and void corruption',
  racialLabel: '+25% Gold Find, +3 Intellect',
}

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
async function shoot(send, name, label, expect = 'true', waitMs = 8000) {
  // ONLY=03-combat.png,04-hero.png reshoots just those, leaving the rest on disk. Seeds
  // still run (they are what the later shots stand on); only the waiting and writing skip.
  const only = (process.env.ONLY || '').split(',').filter(Boolean)
  if (only.length && !only.includes(name)) { console.log(`  · ${name} skipped (ONLY)`); return }
  mkdirSync(OUT, { recursive: true })
  const deadline = Date.now() + waitMs
  let ok = false
  while (Date.now() < deadline) {
    if (await evaluate(send, `!!(${expect})`)) { ok = true; break }
    await sleep(250)
  }
  if (!ok) throw new Error(`${name}: never satisfied \`${expect}\` — refusing to write`)

  // The Watch panel is on screen in several shots, and on a dev server it reads "Standing
  // Orders … Unavailable" — true of a browser, false of the app, where StoreKit vends.
  // Supply the LIVE US prices through the DEV-only seam (stripped from release builds; see
  // purchases.ts) — the same two strings a US device shows, confirmed against the Sales
  // Reports API on 2026-09-27. Only strings: nothing is unlocked. The wardrobe PAYWALL shot
  // is still skipped (it is checked before this runs), so the rule against a mocked paywall
  // below stands.
  await evaluate(send, `window.__ilPrices && window.__ilPrices('$4.99', '$2.99')`)
  await sleep(300)
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

/**
 * Seed a fixture and refuse to continue unless the game came back standing in it.
 *
 * The whole point of giving each shot its own zone is defeated if a seed silently fails
 * and the run carries on shooting wherever the hero happened to be — which is how five
 * consecutive shots of the same forest got shipped in the first place.
 *
 * Retried, because the write races the game's own save. `seedSave` patches localStorage and
 * then navigates on a SECOND CDP round-trip, and in the gap the app can autosave (every 10s)
 * or save on one of the explicit triggers that fire thick and fast in the first seconds of a
 * session — either of which puts the live level-1 state straight back over the patch. It
 * fails maybe one run in four, and always on the first seed. Re-patching is safe: the patch
 * sets every field it cares about, so a second pass over a clobbered save lands the same
 * state as a first pass over a clean one.
 */
async function seedZone(send, url, key) {
  const { zone, level, gold } = SHOT_SEEDS[key]
  let bad = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    await seedSave(send, url, seedFor(zone, level, { gold }))
    await sleep(2500)
    bad = await evaluate(send, assertSeededExpr(zone, level))
    if (!bad) {
      console.log(`  · seeded ${key}: ${zone} @ level ${level}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
      return zone
    }
    console.log(`  ↺ seed "${key}" attempt ${attempt} lost the race (${bad}) — retrying`)
  }
  throw new Error(`seed "${key}" (${zone} @ ${level}) never took: ${bad}`)
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
  // The terms gate (App Review 1.2) blocks a cold boot in front of character create.
  // Written before the gate existed, this script never clicked through it, so 01 was
  // silently skipped on every fresh-profile reshoot.
  //
  // Clicked on a POLL rather than after a fixed sleep, and the whole step is now fatal
  // rather than conditional. Both halves of that matter: the fixed sleeps were tuned on a
  // warm Vite cache and missed the gate on a cold one, and the `if (blurb exists)` guard
  // that used to wrap this block turned every miss into a silent skip — the run reported
  // five green shots and left a months-old 01-create.png on disk, which is exactly the
  // stale-asset failure this script exists to prevent.
  const reachedCreate = await waitFor(tab.send, `(() => {
    if (document.querySelector('.create-class-blurb')) return true;
    const b = [...document.querySelectorAll('button')].find(x => /^I agree$/i.test((x.textContent || '').trim()));
    if (b) b.click();
    return false;
  })()`, { timeout: 45000 })
  if (!reachedCreate) {
    const seen = await evaluate(tab.send, `(document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160)`)
    throw new Error(`01-create: never reached character creation. On screen: "${seen}"`)
  }
  {
    // Drive the pickers rather than shooting whatever the defaults are.
    //
    // Buttons are found INSIDE their own labelled section (the div whose first child is
    // the CLASS / RACE caption) rather than by a global text match. Class and race are both
    // plain `.rp-button`s with no distinguishing class of their own, so a global match is
    // one duplicated word away from clicking the wrong control — and the failure would be
    // invisible, since the wrong button still produces a perfectly nice screenshot.
    const picked = await evaluate(tab.send, `(() => {
      const section = caption => [...document.querySelectorAll('div')].find(d =>
        d.firstElementChild && (d.firstElementChild.textContent || '').trim() === caption);
      const hit = (caption, text) => {
        const s = section(caption);
        if (!s) return caption + '-section-missing';
        const b = [...s.querySelectorAll('button')]
          .find(x => (x.textContent || '').trim() === text);
        if (!b) return text + '-button-missing';
        b.click();
        return null;
      };
      // Class first: pickClass resets the race when the current one is not allowed, so
      // choosing the race before the class would have it silently reset back.
      return hit('CLASS', ${JSON.stringify(CREATE.className)});
    })()`)
    if (picked) throw new Error(`01-create: could not select ${CREATE.className} — ${picked}`)
    await sleep(400)
    const pickedRace = await evaluate(tab.send, `(() => {
      const section = caption => [...document.querySelectorAll('div')].find(d =>
        d.firstElementChild && (d.firstElementChild.textContent || '').trim() === caption);
      const s = section('RACE');
      if (!s) return 'RACE-section-missing';
      const b = [...s.querySelectorAll('button')]
        .find(x => (x.textContent || '').trim() === ${JSON.stringify(CREATE.raceName)});
      if (!b) return '${CREATE.raceName}-not-offered';
      b.click();
      return null;
    })()`)
    if (pickedRace) throw new Error(`01-create: could not select ${CREATE.raceName} — ${pickedRace}`)
    await sleep(400)

    // Name: open the screen's own editor, write through the native value setter (React
    // owns the input, so assigning `.value` alone would be reverted on the next render),
    // then blur so the frame shows the resting display row rather than a focused field.
    const named = await evaluate(tab.send, `(() => {
      const quill = [...document.querySelectorAll('button')].find(b => b.title === 'Edit name');
      if (!quill) return 'edit-name-button-missing';
      quill.click();
      return null;
    })()`)
    if (named) throw new Error(`01-create: ${named}`)
    await sleep(300)
    const typed = await evaluate(tab.send, `(() => {
      const input = document.querySelector('input');
      if (!input) return 'name-input-missing';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(CREATE.heroName)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Commit with Enter, which is the input's own onKeyDown handler, rather than blur().
      // blur() is a no-op on an element that is not the active element, and headless Chrome
      // will not make this input active — autoFocus does not take without a focused window.
      // Left in edit mode the frame shows a focused text box instead of the resting name
      // row, and the name sits in the input's value property, which is not part of
      // innerText, so the shot's own assertion cannot see it either.
      //
      // Both events are dispatched on the element and allowed to bubble: React delegates
      // its listeners to the root container, so a synthetic event that bubbles reaches the
      // handler exactly as a real one would. focusout is the belt to Enter's braces.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return null;
    })()`)
    if (typed) throw new Error(`01-create: ${typed}`)
    await sleep(500)
    if (await evaluate(tab.send, `!!document.querySelector('input')`)) {
      throw new Error('01-create: the name field is still in edit mode — the shot would show a focused input')
    }

    // The name goes through the same moderation filter a player's would (App Review 1.2).
    // Asserting the live UI rather than trusting the string means a future word-list change
    // that catches this name fails the run instead of shipping a shot with a red rejection
    // banner across it.
    const rejected = await evaluate(tab.send, `(() => {
      const alert = document.querySelector('[role="alert"]');
      return alert ? (alert.textContent || 'name rejected').trim() : null;
    })()`)
    if (rejected) throw new Error(`01-create: hero name "${CREATE.heroName}" was refused — ${rejected}`)

    await shoot(tab.send, '01-create.png',
      `character creation — ${CREATE.raceName.toLowerCase()} ${CREATE.className.toLowerCase()}, classes, races, factions`,
      `(() => {
         const t = document.body.innerText || '';
         return document.querySelectorAll('.create-class-blurb').length > 0
           && t.includes(${JSON.stringify(CREATE.classBlurb)})
           && t.includes(${JSON.stringify(CREATE.racialLabel)})
           && t.includes(${JSON.stringify(CREATE.heroName)});
       })()`)
  }

  // ── Into the world, with a hero worth photographing ───────────────────────
  await enterGame(tab.send, url, { device: DEVICE })

  // 02 — the world, in biome/jungle.
  await seedZone(tab.send, url, 'world')
  await sleep(2500)
  // The objective tracker IS in this build (src/components/game/hud/ObjectiveTracker.tsx,
  // mounted by HudOverlay) — asserted here so the caption cannot outlive the component.
  await shoot(tab.send, '02-world.png', 'the world — dimetric renderer, HUD, objective tracker',
    `document.querySelectorAll('.app-dock-btn').length >= 3
       && !!document.querySelector('.objective-tracker')
       // No mode panel. The hero roams between fighting, mining and crafting on its own, and
       // one run of this caught it at a vein: the bottom third of the frame was the mining
       // sheet with a purity meter and a materials list reading ×0 across the board. A fine
       // screen, and not the one this shot is captioned as. Whether it is showing is pure
       // timing, so it has to be excluded rather than hoped against.
       && !document.querySelector('.app-modepanel')
       && !document.querySelector('.app-sidebar-left.panel-open, .app-sidebar-right.panel-open')
       // Other heroes in open view — see crowdOkExpr for why the first valid frame was not
       // good enough.
       && ${crowdOkExpr(2)}`, 90000)

  // 03 — combat, in biome/ashfire.
  //
  // The old predicate here was `.skill-slot` count > 0, which is true on the world shot as
  // well: 02 and 03 could differ by nothing but four seconds of wandering, and on a slow
  // run they did. Wait for an enemy that is actually ENGAGED instead — `.bar-mob-hp` is the
  // mob health bar in UnitFrames, and it renders while the mob is still walking over, so
  // the "approaching…" line has to be gone too before this is a fight.
  await seedZone(tab.send, url, 'combat')
  await shoot(tab.send, '03-combat.png', 'combat — action bar, floaters, unit frames',
    `(() => {
       const frames = document.querySelector('.unit-frames');
       const bar = document.querySelector('.bar-mob-hp');
       if (!bar || !frames || /approaching/i.test(frames.innerText || '')) return false;
       // Blood on the floor. The first run of this predicate captured a mob at 950/950 with
       // no numbers on screen — technically "in combat", visually a standoff.
       if (parseFloat(bar.style.width) >= 99) return false;
       // ...and a damage number actually in the air. The floaters are a fixed DOM pool
       // (il-floater, opacity 0 when idle), so presence in the tree proves nothing; only
       // opacity does. FLOATER_LIFE is ~0.95s, and the capture follows within a frame or
       // two of this returning true.
       const lit = [...document.querySelectorAll('.il-floater')]
         .some(el => parseFloat(getComputedStyle(el).opacity) > 0.35);
       return lit
         && document.querySelectorAll('.skill-slot').length > 0
         && !document.querySelector('.app-modepanel')
         && !document.querySelector('.app-sidebar-left.panel-open, .app-sidebar-right.panel-open')
         // Not alone: the last combat shot was one hero on an empty lava field.
         && ${crowdOkExpr(1)};
     })()`,
    // Generous: after a reload the hero has to walk to whatever it picked as a target, and
    // ashfire mobs are slower to close than the forest's were. Still a hard failure rather
    // than a fallback capture — a "combat" shot with nobody fighting is not the shot.
    // Doubled again for the crowd clause: all of it has to coincide in one frame.
    120000)

  // ── Town — the crowd shot ─────────────────────────────────────────────────
  //
  // The one frame that shows what the listing name promises: a dozen named characters in
  // one place. Entered through the zone's own "Visit town" control after seeding, so the
  // state is one a player reaches by tapping, not one written into the save. Waits for the
  // crowd to be on screen and the town panel to be up, then gives the folk a moment to
  // spread out from where they spawned.
  await seedZone(tab.send, url, 'town')
  const enteredTown = await evaluate(tab.send, `(() => {
    const b = document.querySelector('[title="Visit town"]');
    if (!b || b.disabled) return false; b.click(); return true;
  })()`)
  if (!enteredTown) throw new Error('05-town.png: no "Visit town" control in Shattered Crossing')
  await sleep(6000)
  await shoot(tab.send, '05-town.png', 'town — Crossroads Market, the crowd, service NPCs',
    `(() => {
       const s = window.__ilState && window.__ilState();
       return !!s && s.gameMode === 'in_town' && s.currentTown === 'crossroads_market'
         && !document.querySelector('.app-sidebar-left.panel-open, .app-sidebar-right.panel-open');
     })()`, 20000)

  // ── The character sheet, the ladder and the wardrobe, in biome/bloodfields ─
  await seedZone(tab.send, url, 'sheet')

  // The hero sheet is the first dock button (its label was re-worded to "Menu" after
  // this script was written; its contents — hero name, Looks/Ladder tabs, zone track —
  // are still the character sheet).
  const openedHero = await evaluate(tab.send, `(() => {
    if (document.querySelector('.app-sidebar-left.panel-open')) return true;
    const b = document.querySelectorAll('.app-dock-btn')[0];
    if (!b) return false; b.click(); return true;
  })()`)
  if (openedHero) {
    await sleep(900)
    // Label says what the panel actually shows. It used to promise "talents, gear" — the
    // Stats tab has neither: talents are behind their own tab (the sheet opens on Stats)
    // and worn gear lives in the inventory rail on the other side of the screen. A caption
    // describing a different screen is the same failure as a stale screenshot.
    // What this panel actually shows, in this build, with nothing clicked: the hero's
    // identity line and unspent talent count, the zone track, and the Watch. NOT stats and
    // NOT gear — the caption used to promise both. The stats/talents block is
    // `defaultCollapsed` and shares an accordion group with Zones (CharacterPanel.tsx), so
    // one of the two is always folded and no single frame can honestly show both; gear
    // lives in the inventory rail on the other side of the screen entirely. Left in its
    // default state deliberately: the Watch is the offline-progress promise, which is the
    // thing an idle game most needs a store shot for.
    await shoot(tab.send, '04-hero.png', 'character sheet — zone track, talent points, the Watch',
      `(() => {
         const l = document.querySelector('.app-sidebar-left.panel-open');
         if (!l || l.getBoundingClientRect().x < 0 || l.innerText.trim().length <= 40) return false;
         // No damage number ACROSS THE PANEL'S EDGE. One landed straddling it and read as a
         // rendering glitch rather than as combat. Waiting for zero floaters anywhere never
         // came true — at level 55 the fight is continuous and something is always in the
         // air — so this asks only that nothing is crossing the seam, inflated a little
         // because a floater keeps rising after the predicate passes.
         const p = l.getBoundingClientRect();
         return ![...document.querySelectorAll('.il-floater')].some(el => {
           if (parseFloat(getComputedStyle(el).opacity) <= 0.05) return false;
           const r = el.getBoundingClientRect();
           return r.bottom > p.top - 90 && r.top < p.bottom && r.right > p.left && r.left < p.right;
         });
       })()`, 20000)
    // ── The ladder — OPT-IN, because opening it WRITES TO THE LIVE BOARD ──────
    //
    // LadderPanel calls `publishSnapshot(state)` on open, an upsert keyed on the anon id in
    // `stillmarch_session_v1`. enterGame clears localStorage, so every run mints a NEW id
    // and therefore a NEW row: five reshoots put five level-55 seeded heroes on the
    // production board, and by the fifth the top of the ladder was mostly them. The shot is
    // self-poisoning — it degrades a little more each time it is taken — and unattended
    // reshoots should not be writing to a production table at all.
    //
    // So it is off unless asked for:  SHOOT_LADDER=1 node tools/uitest/shoot-store.mjs
    // Take it when the board is worth photographing, and expect to leave a row behind.
    const openedLadder = process.env.SHOOT_LADDER === '1' && await evaluate(tab.send, `(() => {
      const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /ladder/i.test(x.textContent));
      if (!b) return false; b.click(); return true;
    })()`)
    if (!openedLadder && process.env.SHOOT_LADDER !== '1') {
      console.log('  · 05-ladder.png not attempted — opening the ladder publishes a hero to the')
      console.log('    live board. Set SHOOT_LADDER=1 to capture it.')
    }
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
  const ensuredHeroOpen = await evaluate(tab.send, `(() => {
    if (document.querySelector('.app-sidebar-left.panel-open')) return true;
    const b = document.querySelectorAll('.app-dock-btn')[0];
    if (!b) return false; b.click(); return true;
  })()`)
  const openedWardrobe = ensuredHeroOpen && await evaluate(tab.send, `(() => {
    const b = [...document.querySelectorAll('.hero-bar-btn')].find(x => /looks/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`)
  if (openedWardrobe) {
    await sleep(1500)
    // Only shoot a paywall that can actually be bought from — the same rule 05 applies to
    // the ladder, and for the same reason.
    //
    // `loadOfferings` short-circuits on `!isNative()` (src/monetization/purchases.ts), so on
    // a dev server there is never a price: the Founder Pack button renders disabled as
    // "Store unavailable" with a red line under it reading "not running on a native
    // platform (no StoreKit bridge)". That is correct in a browser and FALSE about the
    // shipped app, where StoreKit vends and the button reads "Unlock — <price>". Writing it
    // would put an error message on the App Store listing for a store that works.
    //
    // Injecting a price to make the button look right is not the fix. A fabricated price in
    // a store screenshot is a mocked paywall, and this set's whole premise is that it is not
    // mocked. This shot has to come off a device build.
    const paywall = await evaluate(tab.send, `(() => {
      const s = document.querySelector('[data-surface="wardrobe"]');
      if (!s) return 'no-surface';
      const t = s.innerText || '';
      if (/Store unavailable/i.test(t)) return 'no-price';
      if (/StoreKit bridge/i.test(t)) return 'no-bridge';
      return null;
    })()`)
    if (paywall) {
      console.log(`  ⚠ 06-wardrobe.png SKIPPED — the paywall has no price (${paywall}).`)
      console.log('    loadOfferings() bails on !isNative(), so a dev-server capture shows')
      console.log('    "Store unavailable" plus a red StoreKit error. Shoot this one from a')
      console.log('    device build where StoreKit vends; the file on disk is from an older run.')
    } else {
      await shoot(tab.send, '06-wardrobe.png', 'wardrobe — palette colourways (the IAP)',
        `!!document.querySelector('[data-surface="wardrobe"]')`)
    }
  }

  console.log(`\n${shots.length} screenshot(s) → ${OUT}`)
  const dims = await evaluate(tab.send, `({ w: innerWidth * devicePixelRatio, h: innerHeight * devicePixelRatio })`)
  console.log(`captured at ${dims.w}×${dims.h} (App Store 6.9" slot wants 1290×2796; Devpost wants 1179×2556)`)
} finally {
  kill()
  proc.kill()
}
process.exit(0)
