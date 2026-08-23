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
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, openTab, evaluate, enterGame, seedSave, screenshot, sleep } from './cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'store', 'screenshots-ipad')
const DEVICE = { width: 1024, height: 1366, scale: 2, mobile: true, touch: true }

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

async function shoot(send, name, label, expect='true') {
  mkdirSync(OUT, { recursive: true })
  const deadline = Date.now()+10000
  let ok=false
  while (Date.now()<deadline) { if (await evaluate(send,`!!(${expect})`)) {ok=true;break} await sleep(250) }
  if (!ok) throw new Error(`${name}: never satisfied \`${expect}\``)
  await hideDevChrome(send)
  const chars = await evaluate(send, `document.body.innerText.replace(/\\s+/g,'').length`)
  if (chars < 12) throw new Error(`${name}: frame looks empty`)
  await screenshot(send, join(OUT, name))
  console.log(`  ✓ ${name}  ${label}`)
}

const { url, proc } = await startDevServer()
console.log('dev server:', url)
const { port, kill } = await launchChrome({})
const tab = await openTab(port)
try {
  await tab.send('Emulation.setDeviceMetricsOverride',{width:DEVICE.width,height:DEVICE.height,deviceScaleFactor:DEVICE.scale,mobile:true})
  await tab.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
  await tab.send('Page.navigate',{url}); await sleep(4000)
  if (await evaluate(tab.send, `!!document.querySelector('.create-class-blurb')`))
    await shoot(tab.send,'01-create.png','character creation',`document.querySelectorAll('.create-class-blurb').length>0`)

  await enterGame(tab.send, url, { device: DEVICE })
  await seedSave(tab.send, url, {
    level:24, gold:8400, currentZone:'grimshade_forest',
    unlockedZones:['sunhollow_meadows','dustwind_plains','grimshade_forest','thornvale_jungle'],
    bossesDefeated:['sunhollow_meadows','dustwind_plains'],
    totalZoneKills:{sunhollow_meadows:60,dustwind_plains:72,grimshade_forest:24},
  })
  await sleep(3500)
  await shoot(tab.send,'02-world.png','the world',`document.querySelectorAll('.skill-slot').length>0`)
  await sleep(4000)
  await shoot(tab.send,'03-combat.png','combat',`document.querySelectorAll('.skill-slot').length>0`)

  const looks = await evaluate(tab.send, `(() => {
    const b=[...document.querySelectorAll('.hero-bar-btn')].find(x=>/looks/i.test(x.textContent));
    if(!b) return false; b.click(); return true })()`)
  if (looks) { await sleep(1500); await shoot(tab.send,'04-wardrobe.png','wardrobe',`!!document.querySelector('[data-surface="wardrobe"]')`) }
  const dims = await evaluate(tab.send, `({w:innerWidth*devicePixelRatio,h:innerHeight*devicePixelRatio})`)
  console.log(`\ncaptured at ${dims.w}x${dims.h} (Apple 12.9" iPad wants 2048x2732)`)
} finally { kill(); proc.kill() }
process.exit(0)
