#!/usr/bin/env node
// ── Runner for the UI suites ──────────────────────────────────────────────────
//
//   npm run test:ui                 # boot a dev server, run every suite headless
//   npm run test:ui -- --only menus # one suite
//   npm run test:ui -- --headed     # watch it happen
//   APP_URL=http://localhost:5174/projects/stillmarch/ npm run test:ui
//
// Complements the headless economy harness in tools/sim, which needs no browser and can
// therefore see none of this. Everything asserted here is layout, hit-testing or event
// ordering — the class of bug that passes `tsc`, passes review, and only shows up when
// two surfaces are open at once on a 390px screen.
//
// Each suite gets its OWN tab and its own CDP session, because Emulation overrides are
// torn down when a client disconnects: a suite that inherited another's connection would
// silently run at desktop metrics.

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchChrome, openTab, makeChecks, sleep } from './cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const opt = name => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const GREEN = s => `\x1b[32m${s}\x1b[0m`
const RED = s => `\x1b[31m${s}\x1b[0m`
const DIM = s => `\x1b[2m${s}\x1b[0m`

/** Boot `vite` and read the URL it settles on — the port is not fixed. */
async function startDevServer() {
  const proc = spawn('npm', ['run', 'dev'], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] })
  let buffer = ''
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite did not report a URL:\n${buffer}`)), 30000)
    const onData = chunk => {
      buffer += chunk.toString()
      const m = buffer.match(/Local:\s+(http:\/\/\S+)/)
      if (m) { clearTimeout(timer); resolve(m[1].replace(/\/$/, '') + '/') }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`vite exited with ${code}:\n${buffer}`)) })
  })
  return { url, kill: () => { try { proc.kill('SIGTERM') } catch { /* gone */ } } }
}

const main = async () => {
  const only = opt('only')
  const suiteFiles = readdirSync(join(HERE, 'suites'))
    .filter(f => f.endsWith('.mjs'))
    .filter(f => !only || f.startsWith(only))
    .sort()
  if (!suiteFiles.length) {
    console.error(`no suites matched${only ? ` --only ${only}` : ''}`)
    process.exit(1)
  }

  let server = null
  let appUrl = process.env.APP_URL
  if (!appUrl) {
    process.stdout.write(DIM('starting dev server… '))
    server = await startDevServer()
    appUrl = server.url
    console.log(DIM(appUrl))
  }

  const chrome = await launchChrome({ headed: flag('headed') })
  let failed = 0

  try {
    for (const file of suiteFiles) {
      const suite = await import(pathToFileURL(join(HERE, 'suites', file)).href)
      const checks = makeChecks(suite.name ?? file)
      const tab = await openTab(chrome.port)
      console.log(`\n${suite.name ?? file}`)
      try {
        await suite.run({ send: tab.send, appUrl, ...checks })
      } catch (err) {
        checks.check(`suite crashed: ${err.message.split('\n')[0]}`, false)
      }
      // A page-level exception invalidates everything after it, so surface it even when
      // the assertions happened to pass around it.
      if (tab.consoleErrors.length) {
        checks.check(`no page errors (saw ${tab.consoleErrors.length})`, false,
          tab.consoleErrors[0]?.split('\n')[0])
      }
      await tab.close()

      for (const r of checks.results) {
        if (r.info) { console.log(DIM(`  · ${r.label}`)); continue }
        if (r.passed) console.log(`  ${GREEN('PASS')}  ${r.label}`)
        else { failed++; console.log(`  ${RED('FAIL')}  ${r.label}${r.note ? DIM(` — ${r.note}`) : ''}`) }
      }
    }
  } finally {
    chrome.kill()
    server?.kill()
    await sleep(200)
  }

  console.log(failed === 0 ? `\n${GREEN('all UI checks passed')}` : `\n${RED(`${failed} UI check(s) failed`)}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
