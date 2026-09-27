#!/usr/bin/env node
// iPad App Store screenshots — 2048x2732, the 12.9" iPad Pro slot.
//
//   node tools/uitest/shoot-ipad.mjs
//
// The binary declares TARGETED_DEVICE_FAMILY "1,2", so Apple requires an iPad set before
// the version can be submitted, and a reviewer WILL run the app at this size. These frames
// are therefore both a store asset and the only iPad layout test that exists — look at
// every one before shipping it.
//
// 1024x1366 CSS at deviceScaleFactor 2 is exactly 2048x2732, so these are real app pixels.
//
// Fixtures come from storeSeeds.mjs, shared with shoot-store.mjs. They used to be a copied
// literal in both files, shot two weeks apart, and the iPad set inherited the iPhone set's
// one-forest-everywhere problem by construction.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, openTab, evaluate, enterGame, seedSave, screenshot, sleep, waitFor } from './cdp.mjs'
import { SHOT_SEEDS, seedFor, assertSeededExpr, crowdOkExpr } from './storeSeeds.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'store', 'screenshots-ipad')
const DEVICE = { width: 1024, height: 1366, scale: 2, mobile: true, touch: true }

// Same hero as the iPhone 01-create shot — see the CREATE block in shoot-store.mjs for why
// goblin warlock and why the name is fixed.
const CREATE = {
  className: 'Warlock',
  raceName: 'Goblin',
  heroName: 'Vexil Ashcoin',
  classBlurb: 'Shadow curses and void corruption',
  racialLabel: '+25% Gold Find, +3 Intellect',
}

function startDevServer() {
  const proc = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: ['ignore','pipe','pipe'] })
  return new Promise((res, rej) => {
    let buf=''
    const t=setTimeout(()=>rej(new Error(buf)),30000)
    const on=d=>{ buf+=d; const m=buf.match(/https?:\/\/localhost:\d+\/[^\s]*/); if(m){clearTimeout(t);res({url:m[0],proc})} }
    proc.stdout.on('data',on); proc.stderr.on('data',on)
  })
}

async function hideDevChrome(send) {
  const showing = await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`)
  if (showing) {
    for (const type of ['keyDown','keyUp'])
      await send('Input.dispatchKeyEvent',{type,key:'`',code:'Backquote',windowsVirtualKeyCode:192,nativeVirtualKeyCode:192,text:'`'})
    await sleep(250)
  }
  await evaluate(send, `(() => {
    const all=[...document.querySelectorAll('div')].filter(el=>/combat gates/i.test(el.textContent||''));
    const inner=all.filter(el=>!all.some(o=>o!==el&&el.contains(o)));
    for (const el of inner) el.style.display='none';
    if (!document.getElementById('__shootStyle')) {
      const s=document.createElement('style'); s.id='__shootStyle';
      s.textContent='*:focus,*:focus-visible{outline:none !important;box-shadow:none !important}';
      document.head.appendChild(s);
    }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  })()`)
}

async function shoot(send, name, label, expect='true', waitMs=10000) {
  // ONLY=03-combat.png,04-hero.png reshoots just those, leaving the rest on disk. Seeds
  // still run (they are what the later shots stand on); only the waiting and writing skip.
  const only = (process.env.ONLY || '').split(',').filter(Boolean)
  if (only.length && !only.includes(name)) { console.log(`  · ${name} skipped (ONLY)`); return }
  mkdirSync(OUT, { recursive: true })
  const deadline = Date.now()+waitMs
  let ok=false
  while (Date.now()<deadline) { if (await evaluate(send,`!!(${expect})`)) {ok=true;break} await sleep(250) }
  if (!ok) throw new Error(`${name}: never satisfied \`${expect}\``)
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
  if (await evaluate(send, `/combat gates/i.test(document.body.innerText || '')`))
    throw new Error(`${name}: dev readout still visible — not writing a store asset`)
  const chars = await evaluate(send, `document.body.innerText.replace(/\\s+/g,'').length`)
  if (chars < 12) throw new Error(`${name}: frame looks empty`)
  await screenshot(send, join(OUT, name))
  console.log(`  ✓ ${name}  ${label}`)
}

// Seed a fixture, verify it took, and retry when it loses the race with the game's own
// save — see seedZone in shoot-store.mjs for both halves of why.
async function seedZone(send, url, key) {
  const { zone, level, gold } = SHOT_SEEDS[key]
  let bad = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    await seedSave(send, url, seedFor(zone, level, { gold }))
    await sleep(2500)
    bad = await evaluate(send, assertSeededExpr(zone, level))
    if (!bad) { console.log(`  · seeded ${key}: ${zone} @ level ${level}${attempt > 1 ? ` (attempt ${attempt})` : ''}`); return }
    console.log(`  ↺ seed "${key}" attempt ${attempt} lost the race (${bad}) — retrying`)
  }
  throw new Error(`seed "${key}" (${zone} @ ${level}) never took: ${bad}`)
}

const { url, proc } = await startDevServer()
console.log('dev server:', url)
const { port, kill } = await launchChrome({})
const tab = await openTab(port)
try {
  await tab.send('Emulation.setDeviceMetricsOverride',{width:DEVICE.width,height:DEVICE.height,deviceScaleFactor:DEVICE.scale,mobile:true})
  await tab.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
  await tab.send('Page.navigate',{url})
  // The terms gate (App Review 1.2) is the first screen of a cold boot. This script never
  // clicked it, so on a fresh Chrome profile 01-create.png was silently skipped and the
  // file on disk was whatever the previous run left there. Polled rather than slept
  // through, and fatal rather than conditional — see the same block in shoot-store.mjs.
  const reachedCreate = await waitFor(tab.send, `(() => {
    if (document.querySelector('.create-class-blurb')) return true;
    const b = [...document.querySelectorAll('button')].find(x => /^I agree$/i.test((x.textContent || '').trim()));
    if (b) b.click();
    return false;
  })()`, { timeout: 45000 })
  if (!reachedCreate) {
    const seen = await evaluate(tab.send, `(document.body.innerText || '').replace(/\\s+/g,' ').slice(0,160)`)
    throw new Error(`01-create: never reached character creation. On screen: "${seen}"`)
  }
  {
    // Class before race: pickClass resets the race when the current one is not allowed.
    // Both are looked up inside their own labelled section, since class and race buttons
    // are indistinguishable `.rp-button`s at the document level.
    const pick = (caption, text) => `(() => {
      const section = [...document.querySelectorAll('div')].find(d =>
        d.firstElementChild && (d.firstElementChild.textContent || '').trim() === ${JSON.stringify(caption)});
      if (!section) return ${JSON.stringify(caption + '-section-missing')};
      const b = [...section.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(text)});
      if (!b) return ${JSON.stringify(text + '-button-missing')};
      b.click(); return null;
    })()`
    const badClass = await evaluate(tab.send, pick('CLASS', CREATE.className))
    if (badClass) throw new Error(`01-create: ${badClass}`)
    await sleep(400)
    const badRace = await evaluate(tab.send, pick('RACE', CREATE.raceName))
    if (badRace) throw new Error(`01-create: ${badRace}`)
    await sleep(400)

    // React owns the name input, so write through the native value setter and fire an
    // input event; assigning `.value` alone is reverted on the next render.
    // The quill click and the write have to be two round-trips: React has not rendered the
    // input yet when the click handler returns, so doing both in one evaluate reports
    // "name-input-missing" every time.
    const badQuill = await evaluate(tab.send, `(() => {
      const quill = [...document.querySelectorAll('button')].find(b => b.title === 'Edit name');
      if (!quill) return 'edit-name-button-missing';
      quill.click(); return null;
    })()`)
    if (badQuill) throw new Error(`01-create: ${badQuill}`)
    await sleep(300)
    const badName = await evaluate(tab.send, `(() => {
      const input = document.querySelector('input');
      if (!input) return 'name-input-missing';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(CREATE.heroName)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Enter commits via the input's own onKeyDown — see shoot-store.mjs for why blur()
      // cannot be used here.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return null;
    })()`)
    if (badName) throw new Error(`01-create: ${badName}`)
    await sleep(500)
    if (await evaluate(tab.send, `!!document.querySelector('input')`))
      throw new Error('01-create: the name field is still in edit mode')
    const rejected = await evaluate(tab.send, `(() => {
      const a = document.querySelector('[role="alert"]');
      return a ? (a.textContent || 'name rejected').trim() : null;
    })()`)
    if (rejected) throw new Error(`01-create: hero name was refused — ${rejected}`)

    await shoot(tab.send,'01-create.png',`character creation — ${CREATE.raceName.toLowerCase()} ${CREATE.className.toLowerCase()}`,
      `(() => {
         const t = document.body.innerText || '';
         return document.querySelectorAll('.create-class-blurb').length > 0
           && t.includes(${JSON.stringify(CREATE.classBlurb)})
           && t.includes(${JSON.stringify(CREATE.racialLabel)})
           && t.includes(${JSON.stringify(CREATE.heroName)});
       })()`)
  }

  await enterGame(tab.send, url, { device: DEVICE })

  // 02 — biome/jungle. The old predicate was `.skill-slot` count, which is true on every
  // in-world frame, so 02 and 03 could be the same picture taken four seconds apart.
  await seedZone(tab.send, url, 'world')
  await sleep(2500)
  // No "sidebars closed" clause here, unlike the iPhone set: at 1024px the app is in its
  // desktop layout and both rails are permanently open. That IS the iPad screen.
  // `.app-modepanel` excluded for the same reason as the iPhone set: the hero roams into
  // mining on its own and the gathering sheet then owns the bottom of the frame.
  await shoot(tab.send,'02-world.png','the world — jungle biome, HUD, objective tracker',
    `!!document.querySelector('.objective-tracker')
       && !document.querySelector('.app-modepanel')
       && document.querySelectorAll('.skill-slot').length>0
       && ${crowdOkExpr(2)}`, 90000)

  // 03 — biome/ashfire, with an enemy actually engaged (`.bar-mob-hp` renders while the mob
  // is still walking over, so the "approaching…" line has to be gone as well).
  await seedZone(tab.send, url, 'combat')
  // Same predicate as the iPhone set: engaged, bloodied, and with a damage number actually
  // in the air (the il-floater pool sits at opacity 0 when idle, so presence proves nothing).
  await shoot(tab.send,'03-combat.png','combat — ashfire biome, action bar, unit frames',
    `(() => {
       const f = document.querySelector('.unit-frames');
       const bar = document.querySelector('.bar-mob-hp');
       if (!bar || !f || /approaching/i.test(f.innerText || '')) return false;
       if (parseFloat(bar.style.width) >= 99) return false;
       return [...document.querySelectorAll('.il-floater')]
           .some(el => parseFloat(getComputedStyle(el).opacity) > 0.35)
         && !document.querySelector('.app-modepanel')
         && document.querySelectorAll('.skill-slot').length>0
         && ${crowdOkExpr(1)};
     })()`,
    // Longer than the iPhone set's window. All four conditions have to be true at once —
    // engaged, bloodied, a number in the air, no mode panel — and at 1024px the hero roams
    // a much wider view, so the coincidence takes longer to come round. Doubled for the
    // crowd clause.
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
       return !!s && s.gameMode === 'in_town' && s.currentTown === 'crossroads_market';
     })()`, 20000)

  // 04 — biome/bloodfields behind the wardrobe modal.
  await seedZone(tab.send, url, 'sheet')
  const looks = await evaluate(tab.send, `(() => {
    const b=[...document.querySelectorAll('.hero-bar-btn')].find(x=>/looks/i.test(x.textContent));
    if(!b) return false; b.click(); return true })()`)
  if (looks) {
    await sleep(1500)
    // Refuse a paywall with no price — see the same guard in shoot-store.mjs. On a dev
    // server loadOfferings() bails on !isNative(), so the Founder Pack button reads "Store
    // unavailable" over a red StoreKit error, which is false about the shipped app.
    const paywall = await evaluate(tab.send, `(() => {
      const s = document.querySelector('[data-surface="wardrobe"]');
      if (!s) return 'no-surface';
      return /Store unavailable|StoreKit bridge/i.test(s.innerText || '') ? 'no-price' : null;
    })()`)
    if (paywall) console.log(`  ⚠ 04-wardrobe.png SKIPPED — the paywall has no price (${paywall}); shoot it from a device build.`)
    else await shoot(tab.send,'04-wardrobe.png','wardrobe — palette colourways (the IAP)',`!!document.querySelector('[data-surface="wardrobe"]')`)
  }
  else console.log('  ⚠ 04-wardrobe.png SKIPPED — the Looks button was not found.')
  const dims = await evaluate(tab.send, `({w:innerWidth*devicePixelRatio,h:innerHeight*devicePixelRatio})`)
  console.log(`\ncaptured at ${dims.w}x${dims.h} (Apple 12.9" iPad wants 2048x2732)`)
} finally { kill(); proc.kill() }
process.exit(0)
