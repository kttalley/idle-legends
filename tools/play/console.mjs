#!/usr/bin/env node
// ── Play Console, driven over CDP ────────────────────────────────────────────
//
//   node tools/play/console.mjs launch     # open Chrome, log in by hand, once
//   node tools/play/console.mjs probe      # what page are we on / is login live
//   node tools/play/console.mjs shot <f>   # screenshot the current tab
//
// The seven App-content declarations have no API (see tools/play/publish.mjs for the
// ones that do), so the only way to automate them is to drive the console the way a
// person does. This is the same system-Chrome-over-CDP approach the UI suite uses —
// there is no Playwright in this project and no reason to add one.
//
// TWO THINGS MAKE THIS DIFFERENT FROM tools/uitest/cdp.mjs:
//
//   1. The profile is PERSISTENT, not a mkdtemp throwaway. A Google login has to
//      survive between runs, and re-authenticating on every invocation would be both
//      miserable and a good way to trip Google's suspicious-activity checks.
//   2. It runs HEADED. Google routinely refuses sign-in from headless Chrome
//      ("this browser or app may not be secure"), and a human has to complete 2FA
//      anyway — so the window is the point, not a fallback.
//
// Chrome 136+ ignores --remote-debugging-port when pointed at the DEFAULT profile, which
// is why this cannot simply attach to the browser you already have open. Hence a separate
// profile you sign into once.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = join(homedir(), '.stillmarch', 'play-chrome-profile')
const PORT_FILE = join(PROFILE, 'DevToolsActivePort')
const CONSOLE_URL = 'https://play.google.com/console/u/1/developers/8748727252195234760/app-list'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Read the port Chrome picked, or null if it is not running. */
function currentPort() {
  try {
    const port = Number(readFileSync(PORT_FILE, 'utf8').split('\n')[0])
    return port > 0 ? port : null
  } catch { return null }
}

async function alive(port) {
  try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok } catch { return false }
}

async function launch() {
  const existing = currentPort()
  if (existing && await alive(existing)) {
    console.log(`Chrome already running on port ${existing} — reusing it.`)
    return existing
  }
  mkdirSync(PROFILE, { recursive: true })
  console.log(`launching Chrome with profile ${PROFILE}`)
  const proc = spawn(CHROME, [
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${PROFILE}`,
    CONSOLE_URL,
  ], { stdio: 'ignore', detached: true })
  proc.unref()

  for (let i = 0; i < 80; i++) {
    const port = currentPort()
    if (port && await alive(port)) {
      console.log(`Chrome up on port ${port}`)
      return port
    }
    await sleep(250)
  }
  throw new Error('Chrome never reported a debugging port')
}

/** Attach to the frontmost non-devtools page. */
async function attach(port) {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
  if (!page) throw new Error('no page tab found')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data)
    const p = pending.get(msg.id)
    if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result) }
  })
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('ws failed')), { once: true })
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { send, url: page.url, close: () => ws.close() }
}

async function evaluate(send, expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate threw')
  return result.value
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdProbe() {
  const port = currentPort()
  if (!port || !await alive(port)) {
    console.log('Chrome is not running — `node tools/play/console.mjs launch` first.')
    process.exit(1)
  }
  const tab = await attach(port)
  const info = await evaluate(tab.send, `({
    url: location.href,
    title: document.title,
    signedIn: !/accounts\\.google\\.com|ServiceLogin/.test(location.href),
    heading: (document.querySelector('h1, h2')||{}).innerText || '',
    bodyStart: (document.body.innerText||'').slice(0, 400),
  })`)
  console.log(JSON.stringify(info, null, 2))
  tab.close()
}

async function cmdShot(path) {
  const port = currentPort()
  const tab = await attach(port)
  const { data } = await tab.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data, 'base64'))
  console.log(`wrote ${path}`)
  tab.close()
}

const cmd = process.argv[2]
if (cmd === 'launch') {
  await launch()
  console.log('\nSign in to Google in the window that opened, then run:')
  console.log('  node tools/play/console.mjs probe')
} else if (cmd === 'probe') {
  await cmdProbe()
} else if (cmd === 'shot') {
  await cmdShot(process.argv[3] || 'play-console.png')
} else {
  console.log('usage: console.mjs launch | probe | shot <file>')
}
